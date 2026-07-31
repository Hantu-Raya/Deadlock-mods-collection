"use strict";
// Live urn detector (HUD / top-bar context). Watches the game's OWN minimap idol markers
// - which the engine draws for everyone, so reading them is not an information advantage
// (same signal qollite_map_urn.js uses). Broadcasts once per GENUINELY fresh urn spawn; the
// overlay then runs the 12s descent + "available" notifications. Self-contained: no
// QolLiteNotificationsLog (separate VM), logs via $.Msg.
//
// Ready-gate: a fresh spawn is only counted after the previous urn has fully left the map
// (all idol markers gone). Mid-delivery, an idol_spawn briefly appears on the carry side -
// that is NOT a new urn; without the gate we fired 2-3 times per urn.
var QolLiteNotificationsUrnDetector = (function () {
    var CHANNEL = "ClientUI_FireOutput";
    var LIVE_CLASSES = ["idol_spawn", "idol_dropping", "idol_return", "idol_return_friendly", "idol_return_enemy"];

    function walk(p) { var g = 0; while (p && p.GetParent && p.GetParent() && g < 64) { p = p.GetParent(); g++; } return p; }
    function hudRoot() { return walk($.GetContextPanel()); }

    function isActive(p) {
        if (!p) { return false; }
        try {
            if (p.BHasClass && (p.BHasClass("active") || p.BHasClass("active_map_button"))) { return true; }
            var vis = p.style ? p.style.visibility : "";
            var op = p.style ? p.style.opacity : "";
            return !!(vis && vis !== "collapse" && op !== "0" && op !== "0.0");
        } catch (e) { return false; }
    }

    function anyActive(root, cls) {
        if (!root || !root.FindChildrenWithClassTraverse) { return false; }
        var found;
        try { found = root.FindChildrenWithClassTraverse(cls); } catch (e) { return false; }
        if (found) { for (var i = 0; i < found.length; i++) { if (isActive(found[i])) { return true; } } }
        return false;
    }

    function spawnActive(root) { return anyActive(root, "idol_spawn"); }
    function liveUrn(root) {
        for (var c = 0; c < LIVE_CLASSES.length; c++) { if (anyActive(root, LIVE_CLASSES[c])) { return true; } }
        return false;
    }

    var _wasLive = false;
    var _ready = true;       // ready to count the next idol_spawn as a fresh urn
    var _loggedReach = false;

    function poll() {
        var root = hudRoot();

        if (!_loggedReach) {
            _loggedReach = true;
            var mm = (root && root.FindChildTraverse) ? root.FindChildTraverse("hud_minimap") : null;
            var mr = (root && root.FindChildTraverse) ? root.FindChildTraverse("map_render") : null;
            $.Msg("[NOTIF][urn] minimap reachable: hud_minimap=" + (mm ? "yes" : "no") + " map_render=" + (mr ? "yes" : "no"));
        }

        var spawn = spawnActive(root);
        var live = liveUrn(root);

        if (spawn && _ready) {
            _ready = false;
            $.Msg("[NOTIF][urn] fresh urn spawn -> notify");
            try { $.DispatchEvent(CHANNEL, JSON.stringify({ notif: 1, type: "urn" })); } catch (e) {}
        }
        if (!live && _wasLive) { _ready = true; }   // urn fully gone -> next idol_spawn is fresh
        _wasLive = live;

        $.Schedule(0.2, poll);
    }

    return { start: function () { poll(); } };
})();
QolLiteNotificationsUrnDetector.start();
