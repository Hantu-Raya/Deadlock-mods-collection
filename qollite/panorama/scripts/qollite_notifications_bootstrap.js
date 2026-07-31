"use strict";
// Bootstrap (overlay context). Polls until all overlay modules are present, inits each in
// isolation (one throw never aborts the rest), then drives the tick loop off the bus clock.
// The clock BRIDGE runs in a separate context (HUD top bar) and is not awaited here.
(function () {
    function ready() {
        return typeof QolLiteNotificationsLog !== "undefined"
            && typeof QolLiteNotificationsConfig !== "undefined"
            && typeof QolLiteNotificationsStrings !== "undefined"
            && typeof QolLiteNotificationsEventSchedule !== "undefined"
            && typeof QolLiteNotificationsClock !== "undefined"
            && typeof QolLiteNotificationsScheduler !== "undefined"
            && typeof QolLiteNotificationsManager !== "undefined";
    }

    function safe(name, fn) {
        try { fn(); } catch (e) { $.Msg("[NOTIF] ERROR: init " + name + " threw: " + e); }
    }

    // Live urn: the HUD detector broadcasts once per fresh urn spawn (visible to all -> fair).
    // The urn then falls from the sky for ~12s before it can be picked up, so we run a
    // "Landing in Ns" descent countdown, then flip to "Available now" when it lands.
    var _urnN = 0;
    var DESCENT_SEC = 12;

    function startUrnDescent(n) {
        var key = "urn_live_" + n;
        var t0g = QolLiteNotificationsClock.getMatchTime();   // game seconds at spawn (pauses with the game)
        var t0w = Date.now();                  // wall-time fallback + a hard cap
        (function step() {
            if (!QolLiteNotificationsConfig.enabled) { return; }
            var name = QolLiteNotificationsStrings.name("soul_urn");
            var gt = QolLiteNotificationsClock.getMatchTime();
            // count off the game clock when we have it (freezes on pause); else wall-time
            var elapsed = (gt !== null && t0g !== null) ? (gt - t0g) : ((Date.now() - t0w) / 1000);
            var remaining = Math.ceil(DESCENT_SEC - elapsed);
            if (remaining > 0 && (Date.now() - t0w) < 30000) {
                QolLiteNotificationsManager.descent(key, name, remaining);
                $.Schedule(0.25, step);
            } else {
                QolLiteNotificationsManager.spawn(key, name);   // landed -> Available now (this plays the sound)
            }
        })();
    }

    function initUrnReceiver() {
        try {
            $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
                if (typeof payload !== "string" || payload.indexOf("\"urn\"") === -1) { return; }
                var d; try { d = JSON.parse(payload); } catch (e) { return; }
                if (!d || d.notif !== 1 || d.type !== "urn") { return; }
                if (!QolLiteNotificationsConfig.enabled || !QolLiteNotificationsConfig.showSpawn) { return; }
                if (QolLiteNotificationsConfig.events && QolLiteNotificationsConfig.events.soul_urn === false) { return; }
                _urnN++;
                startUrnDescent(_urnN);
            });
        } catch (e) { QolLiteNotificationsLog.error("urn receiver register failed: " + e); }
    }

    function init() {
        QolLiteNotificationsLog.info("bootstrap: all modules present, initializing");
        safe("strings", function () { QolLiteNotificationsStrings.init(); });
        safe("manager", function () { QolLiteNotificationsManager.init(); });
        safe("scheduler", function () { QolLiteNotificationsScheduler.init(); });
        safe("clock", function () { QolLiteNotificationsClock.init(); });
        safe("urn", function () { initUrnReceiver(); });
        if (typeof QolLiteNotificationsUmmAdapter !== "undefined") { safe("umm", function () { QolLiteNotificationsUmmAdapter.init(); }); }
        tick();
    }

    function tick() {
        try {
            var t = QolLiteNotificationsClock.getMatchTime();      // seconds, or null if inactive/stale
            if (t !== null) { QolLiteNotificationsScheduler.tick(t); }
        } catch (e) { QolLiteNotificationsLog.error("tick threw: " + e); }
        $.Schedule(0.25, tick);
    }

    var tries = 0;
    (function wait() {
        if (ready()) { init(); return; }
        if (tries++ < 200) { $.Schedule(0.1, wait); }
        else { $.Msg("[NOTIF] ERROR: modules never became ready"); }
    })();
})();
