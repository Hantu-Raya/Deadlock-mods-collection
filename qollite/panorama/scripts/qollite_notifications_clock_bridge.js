"use strict";
// Clock BRIDGE — runs in the HUD top-bar context (citadel_hud_top_bar.xml override),
// which owns #GameTime. The overlay is an isolated JS context and cannot read #GameTime
// itself (docs/knowledge/notif_context_spike.md), so this reads the label and broadcasts
// the parsed seconds over the one cross-context channel. Self-contained: no
// QolLiteNotificationsLog here (that lives in the overlay's separate VM).
var QolLiteNotificationsClockBridge = (function () {
    var CHANNEL = "ClientUI_FireOutput"; // the only cross-context broadcast channel (cf. umm_core.js)

    function label() {
        var c = $.GetContextPanel();
        return (c && c.FindChildTraverse) ? c.FindChildTraverse("GameTime") : null;
    }
    function parse(text) {
        if (!text) { return null; }                     // empty before the clock starts
        text = String(text).replace(/<[^>]+>/g, "");    // strip any markup
        // Past 60:00 the label grows an hours component (h:mm:ss). Without this the
        // hours were read as minutes and the clock "jumped backwards" -> spurious reset.
        var m = text.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
        if (!m) { return null; }
        var h = m[1] ? parseInt(m[1], 10) : 0;
        return h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    }

    function walk(p) { var g = 0; while (p && p.GetParent && p.GetParent() && g < 64) { p = p.GetParent(); g++; } return p; }

    // True while the player is in the Hideout (the pre/between-match area), which also
    // carries a clock. The `connectedToHideout` class marks it (same signal the Bridge
    // Buff Timer mod uses to suppress its own logic). Checked both as an ancestor class
    // and on the "Hud" panel, to be robust to where it is set.
    function inHideout() {
        var ctx = $.GetContextPanel();
        var names = ["connectedToHideout", "connectedtohideout", "connectedToHideOut"];
        var i;
        try {
            if (ctx && ctx.BAscendantHasClass) {
                for (i = 0; i < names.length; i++) { if (ctx.BAscendantHasClass(names[i])) { return true; } }
            }
        } catch (e) {}
        try {
            var hud = walk(ctx);
            hud = hud && hud.FindChildTraverse ? (hud.FindChildTraverse("Hud") || hud) : hud;
            if (hud && hud.BHasClass) {
                for (i = 0; i < names.length; i++) { if (hud.BHasClass(names[i])) { return true; } }
            }
        } catch (e) {}
        return false;
    }

    var _wasHideout = null;
    function loop() {
        var hideout = inHideout();
        if (hideout !== _wasHideout) { _wasHideout = hideout; $.Msg("[NOTIF][bridge] hideout=" + hideout + (hideout ? " (suppressing clock)" : "")); }

        if (!hideout) {
            var l = label();
            if (l) {
                var t = parse(l.text);
                if (t !== null) {
                    try { $.DispatchEvent(CHANNEL, JSON.stringify({ notif: 1, type: "clock", t: t })); } catch (e) {}
                }
            }
        }
        $.Schedule(0.25, loop);
    }

    // Detect the player's language here (HUD context, where the Language_<lang> ancestor
    // class is visible) and broadcast it to the isolated overlay. $.Language is preferred
    // (a context-independent global); the ancestor class is the fallback.
    function detectLang() {
        try { if (typeof $ !== "undefined" && $.Language) { var v = $.Language(); if (v) { return String(v); } } } catch (e) {}
        var ctx = null;
        try { ctx = $.GetContextPanel(); } catch (e) {}
        var langs = ["russian", "schinese", "tchinese", "koreana", "japanese", "spanish", "latam",
                     "german", "french", "italian", "polish", "portuguese", "brazilian", "ukrainian", "turkish"];
        for (var i = 0; i < langs.length; i++) {
            try { if (ctx && ctx.BAscendantHasClass && ctx.BAscendantHasClass("Language_" + langs[i])) { return langs[i]; } } catch (e) {}
        }
        return "english";
    }

    function announceLang(times) {
        var lang = detectLang();
        try { $.DispatchEvent(CHANNEL, JSON.stringify({ notif: 1, type: "lang", lang: lang })); } catch (e) {}
        if (times > 0) { $.Schedule(1.0, function () { announceLang(times - 1); }); } // repeat for load-order
    }

    return { start: function () { loop(); announceLang(4); } };
})();
QolLiteNotificationsClockBridge.start();
