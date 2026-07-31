"use strict";
// Logging layer (overlay context). info/error always print; log is gated behind
// DEBUG. Mirrors qollite_map_log.js. Included first so later modules can use it.
var QolLiteNotificationsLog = (function () {
    var DEBUG = true; // kept on: diagnostics only reach the console (players don't see them
                      // unless launched with -condebug); helps catch any intermittent issue.
    var TAG = "[NOTIF] ";
    return {
        DEBUG: DEBUG,
        info:  function (m) { $.Msg(TAG + m); },
        error: function (m) { $.Msg(TAG + "ERROR: " + m); },
        log:   function (m) { if (DEBUG) { $.Msg(TAG + m); } }
    };
})();
