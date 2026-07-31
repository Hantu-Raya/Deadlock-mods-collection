"use strict";
// Clock RECEIVER (overlay context). Listens on the bus for {notif:1,type:"clock",t}
// broadcast by qollite_notifications_clock_bridge.js in the HUD context, and exposes the latest match
// time to the scheduler. Returns null when no clock has arrived recently (staleness ->
// treated as "no active match").
var QolLiteNotificationsClock = (function () {
    var CHANNEL = "ClientUI_FireOutput";
    var last = null;      // last received match time (seconds)
    var lastAtMs = 0;     // Date.now() at last receipt (Date.now is available in Panorama)
    var STALE_MS = 3000;  // no clock for 3s -> inactive

    function onMessage(payload) {
        var d = null;
        try { d = JSON.parse(payload); } catch (e) { return; }
        if (!d || d.notif !== 1 || d.type !== "clock") { return; }
        last = d.t;
        lastAtMs = Date.now();
    }

    return {
        init: function () {
            try { $.RegisterForUnhandledEvent(CHANNEL, onMessage); }
            catch (e) { QolLiteNotificationsLog.error("clock: bus register failed: " + e); }
            QolLiteNotificationsLog.info("clock: receiver registered on bus");
        },
        // last known match time in seconds, or null if none / stale
        getMatchTime: function () {
            if (last === null) { return null; }
            if (Date.now() - lastAtMs > STALE_MS) { return null; }
            return last;
        }
    };
})();
