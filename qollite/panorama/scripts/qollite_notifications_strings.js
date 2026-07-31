"use strict";
// Localized text, separated from logic. Event titles come from name(id); the status
// sub-line from sub(). The player's language is detected via $.Language (a context-
// independent global) with a Language_<lang> ancestor-class fallback; the HUD-context
// bridge also broadcasts the language over the bus in case the overlay can't see it.
// Unknown languages fall back to English. Add a table below to support a new language.
var QolLiteNotificationsStrings = (function () {
    var CHANNEL = "ClientUI_FireOutput";

    var TABLES = {
        english: {
            available: "Available now",
            warning:   "Spawning in {seconds}s",
            landing:   "Landing in {seconds}s",
            names: {
                weak_camps: "Weak Camps", breakables: "Crates & Statues",
                medium_camps: "Medium Camps", bridge_buffs: "Bridge Buffs",
                strong_camps: "Strong Camps", sinners_sacrifice: "Sinner's Sacrifice",
                soul_urn: "Soul Urn"
            }
        },
        russian: {
            available: "Уже доступно",
            warning:   "Появится через {seconds}с",
            landing:   "Приземление через {seconds}с",
            names: {
                weak_camps: "Слабые лагеря",
                breakables: "Ящики и статуи",
                medium_camps: "Средние лагеря",
                bridge_buffs: "Бафы моста",
                strong_camps: "Сильные лагеря",
                sinners_sacrifice: "Жертва грешника",
                soul_urn: "Урна душ"
            }
        }
    };

    var _lang = "english";

    function _table() { return TABLES[_lang] || TABLES.english; }

    function _set(l) {
        l = String(l || "").toLowerCase();
        if (TABLES[l] && l !== _lang) {
            _lang = l;
            if (typeof QolLiteNotificationsLog !== "undefined") { QolLiteNotificationsLog.info("strings: language = " + l); }
        }
    }

    // Best-effort local detection (overlay context). $.Language is a global, so it works
    // even though the overlay can't walk up to the Language_<lang> ancestor class.
    function _detectLocal() {
        try { if (typeof $ !== "undefined" && $.Language) { var v = $.Language(); if (v) { return String(v); } } } catch (e) {}
        var ctx = null;
        try { ctx = $.GetContextPanel(); } catch (e) {}
        for (var k in TABLES) {
            if (TABLES.hasOwnProperty(k) && k !== "english") {
                try { if (ctx && ctx.BAscendantHasClass && ctx.BAscendantHasClass("Language_" + k)) { return k; } } catch (e) {}
            }
        }
        return null;
    }

    return {
        init: function () {
            var local = _detectLocal();
            if (local) { _set(local); }
            // The HUD bridge may broadcast a more authoritative language; apply it.
            try {
                $.RegisterForUnhandledEvent(CHANNEL, function (payload) {
                    if (typeof payload !== "string" || payload.indexOf("\"lang\"") === -1) { return; }
                    var d; try { d = JSON.parse(payload); } catch (e) { return; }
                    if (d && d.notif === 1 && d.type === "lang") { _set(d.lang); }
                });
            } catch (e) {}
        },
        setLang: function (l) { _set(l); },
        // localized event title for a schedule id
        name: function (id) {
            var t = _table();
            return (t.names && t.names[id]) || TABLES.english.names[id] || id;
        },
        // status line; phase "warn" | "descent" | "spawn"
        sub: function (phase, seconds) {
            var t = _table();
            if (phase === "warn")    { return String(t.warning).replace("{seconds}", String(seconds)); }
            if (phase === "descent") { return String(t.landing).replace("{seconds}", String(seconds)); }
            return t.available;
        }
    };
})();
