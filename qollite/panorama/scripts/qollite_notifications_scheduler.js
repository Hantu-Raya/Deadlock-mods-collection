"use strict";
// Scheduler (overlay context). Expands the schedule into trigger instances, GROUPS
// instances that share a trigger time into one combined toast (e.g. 5:00 = Medium Camps
// & Bridge Buffs), then per group emits a warn then a spawn exactly once. Handles
// late-init (prime past groups as fired) and match reset.
var QolLiteNotificationsScheduler = (function () {
    var HORIZON = 60 * 60;      // expand repeating events up to 60 min
    var fired = {};             // groupKey:phase -> true (dedup)
    var primed = false;         // late-init done?
    var lastClock = -1;

    // Debug schedule: mid-match times, with two events sharing 0:30 so combining is
    // visible (weak+medium at 0:30 -> one toast; bridge at 0:45).
    function debugSchedule() {
        return [
            { id: "weak_camps",   initialTime: 30, repeatInterval: null },
            { id: "medium_camps", initialTime: 30, repeatInterval: null },
            { id: "bridge_buffs", initialTime: 45, repeatInterval: 45   }
        ];
    }

    function source() { return QolLiteNotificationsConfig.debugSchedule ? debugSchedule() : QolLiteNotificationsEventSchedule; }

    // one row -> list of trigger instances { id, trigger, warnOnly }
    // warnOnly: this event contributes to the pre-spawn WARNING but the scheduler never
    // fires its spawn (e.g. Soul Urn - the live detector owns its spawn).
    function instances(row) {
        var out = [];
        if (row.repeatInterval) {
            for (var t = row.initialTime; t <= HORIZON; t += row.repeatInterval) {
                out.push({ id: row.id, trigger: t, warnOnly: !!row.warnOnly });
            }
        } else {
            out.push({ id: row.id, trigger: row.initialTime, warnOnly: !!row.warnOnly });
        }
        return out;
    }

    // group instances by trigger time -> one combined toast per distinct time
    function groups() {
        var rows = source(), byT = {};
        for (var i = 0; i < rows.length; i++) {
            // per-event toggle: a disabled event contributes no warn and no spawn
            if (QolLiteNotificationsConfig.events && QolLiteNotificationsConfig.events[rows[i].id] === false) { continue; }
            var insts = instances(rows[i]);
            for (var j = 0; j < insts.length; j++) {
                var inst = insts[j];
                var g = byT[inst.trigger];
                if (!g) { g = { key: "grp_" + inst.trigger, trigger: inst.trigger, ids: [] }; byT[inst.trigger] = g; }
                g.ids.push({ id: inst.id, warnOnly: inst.warnOnly });
            }
        }
        var out = [];
        for (var t in byT) { if (byT.hasOwnProperty(t)) { out.push(byT[t]); } }
        return out;
    }

    // combined, localized title from a list of {id,...} entries (names resolved at show
    // time so a late language broadcast is reflected)
    function titleFor(entries) {
        var names = [];
        for (var i = 0; i < entries.length; i++) { names.push(QolLiteNotificationsStrings.name(entries[i].id)); }
        return names.length <= 2 ? names.join(" & ") : names.join(", ");
    }

    function reset(reason) {
        QolLiteNotificationsLog.log("scheduler reset (" + reason + ")");
        fired = {};
        primed = false;
        if (typeof QolLiteNotificationsManager !== "undefined") { QolLiteNotificationsManager.clearAll(); }
    }

    function prime(clock) {
        // mark every already-past group (beyond grace) as fired, silently
        var grace = QolLiteNotificationsConfig.graceSecs, gs = groups(), suppressed = [];
        for (var i = 0; i < gs.length; i++) {
            if (clock > gs[i].trigger + grace) { fired[gs[i].key + ":spawn"] = true; suppressed.push(gs[i].trigger); }
        }
        primed = true;
        QolLiteNotificationsLog.log("scheduler primed at clock=" + clock + "; suppressed triggers=[" + suppressed.join(",") + "]");
    }

    return {
        init: function () { reset("init"); },

        tick: function (clock) {
            if (!QolLiteNotificationsConfig.enabled) { return; }

            // Match reset only on a BIG backward jump (a new match restarts the clock).
            // Small read jitter must NOT reset - a reset re-suppresses events via prime(),
            // which is exactly how a notification would silently go missing.
            if (lastClock >= 0 && clock < lastClock) {
                var big = clock < lastClock - 30;
                QolLiteNotificationsLog.log("clock backward " + lastClock + " -> " + clock + (big ? " RESET" : " (ignored jitter)"));
                if (big) { reset("clock restart"); }
            }
            if (lastClock >= 0 && Math.floor(clock / 60) !== Math.floor(lastClock / 60)) { QolLiteNotificationsLog.log("clock " + clock); }
            lastClock = clock;

            if (!primed) { prime(clock); }

            var warnOn = QolLiteNotificationsConfig.showWarning && QolLiteNotificationsConfig.warnSecs > 0;
            var warn = QolLiteNotificationsConfig.warnSecs, gs = groups();
            for (var i = 0; i < gs.length; i++) {
                var g = gs[i], sid = g.key + ":spawn";

                // pre-spawn warning: includes ALL events at this time (incl. warnOnly, e.g.
                // Soul Urn), so it reads "Bridge Buffs & Soul Urn". Native-length, number ticks.
                if (warnOn && !fired[sid] && clock >= g.trigger - warn && clock < g.trigger) {
                    QolLiteNotificationsManager.countdown(g.key, titleFor(g.ids), Math.max(1, g.trigger - clock));
                }
                // spawn: fire once, only for the non-warnOnly events (warnOnly spawns come
                // from their live detector, so we don't double-notify).
                if (!fired[sid] && clock >= g.trigger) {
                    fired[sid] = true;
                    if (QolLiteNotificationsConfig.showSpawn) {
                        var spawnEntries = [];
                        for (var e = 0; e < g.ids.length; e++) { if (!g.ids[e].warnOnly) { spawnEntries.push(g.ids[e]); } }
                        if (spawnEntries.length) { QolLiteNotificationsManager.spawn(g.key, titleFor(spawnEntries)); }
                    }
                }
            }
        }
    };
})();
