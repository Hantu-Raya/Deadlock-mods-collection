"use strict";

// Console logging for the whole mod. Visible in the game console (-dev /
// con_logfile). Errors and one-line summaries always print; verbose tracing is
// gated behind DEBUG so players' consoles stay quiet - flip it (or call
// setDebug) when diagnosing in-game.
var QolLiteMapLog = (function () {
    var DEBUG = true;
    var PREFIX = "[BetterMap] ";

    function info(msg) { try { $.Msg(PREFIX + msg); } catch (e) {} }
    function error(msg) { try { $.Msg(PREFIX + "[ERROR] " + msg); } catch (e) {} }
    function log(msg) { if (DEBUG) { try { $.Msg(PREFIX + msg); } catch (e) {} } }

    return {
        info: info,
        error: error,
        log: log,
        setDebug: function (on) { DEBUG = !!on; },
        isDebug: function () { return DEBUG; }
    };
})();
