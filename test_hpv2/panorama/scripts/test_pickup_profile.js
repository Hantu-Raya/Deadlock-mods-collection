(() => {
  "use strict";

  // Temporary diagnostic build. Adapted from HP Colors V2 commit 7814617.
  function createPickupProfile(role, contextId, source, clock, clockName, emit) {
    var active = role !== "world";
    var since = Date.now();
    var windowStart = since;
    var reports = 0;
    var depth = 0;
    var starts = [], children = [];
    var rows = [];
    var counters = Object.create(null);
    var finalPending = false;
    var badClock = 0;

    function now() {
      try { return clock(); } catch (ignored) { return NaN; }
    }
    function round(value) { return Math.round(value * 1000) / 1000; }
    function flush(final) {
      finalPending = finalPending || !!final;
      var at = Date.now();
      if (!active || reports >= 240 || depth || (!finalPending && at - windowStart < 30000)) return;
      var measured = rows.filter(function (row) { return row.calls; });
      if (!measured.length) return;
      var data = measured.map(function (row) {
        return { label: row.label, calls: row.calls, selfMs: round(row.selfMs),
          totalMs: round(row.totalMs), avgMs: round(row.totalMs / row.calls),
          maxMs: round(row.maxMs), zeroCalls: row.zeroCalls, thrown: row.thrown };
      });
      data.sort(function (a, b) { return b.selfMs - a.selfMs || b.calls - a.calls; });
      var topSelf = data.slice(0, 8);
      data.sort(function (a, b) { return b.calls - a.calls || b.selfMs - a.selfMs; });
      var report = { role: role, context: contextId, source: source, since: since,
        at: at, windowMs: at - windowStart, report: ++reports, final: finalPending,
        clock: clockName, badClock: badClock, counters: counters,
        topSelf: topSelf, topCalls: data.slice(0, 8) };
      try {
        var raw = JSON.stringify(report);
        // Match the old profiler's chunk size to avoid console line truncation.
        var parts = Math.ceil(raw.length / 300);
        for (var part = 0; part < parts; part++) emit(JSON.stringify({
          role: role, context: contextId, source: source, since: since,
          report: reports, part: part + 1, parts: parts,
          data: raw.slice(part * 300, (part + 1) * 300)
        }));
      } catch (ignored) {}
      for (var index = 0; index < rows.length; index++) {
        var row = rows[index];
        row.calls = row.selfMs = row.totalMs = row.maxMs = row.zeroCalls = row.thrown = 0;
      }
      counters = Object.create(null);
      badClock = 0;
      windowStart = Date.now();
      if (finalPending || reports >= 240) active = false;
    }
    function wrap(label, fn) {
      var row = { label: label, calls: 0, selfMs: 0, totalMs: 0, maxMs: 0, zeroCalls: 0, thrown: 0 };
      rows.push(row);
      return function () {
        if (!active) return fn.apply(this, arguments);
        var frame = depth++;
        starts[frame] = now();
        children[frame] = 0;
        var completed = false;
        try {
          var result = fn.apply(this, arguments);
          completed = true;
          return result;
        } finally {
          var end = now();
          var elapsed = end - starts[frame];
          if (!Number.isFinite(elapsed) || elapsed < 0) { badClock++; elapsed = 0; }
          row.calls++;
          row.totalMs += elapsed;
          row.selfMs += Math.max(0, elapsed - children[frame]);
          row.maxMs = Math.max(row.maxMs, elapsed);
          if (!elapsed) row.zeroCalls++;
          if (!completed) row.thrown++;
          depth = frame;
          if (frame) children[frame - 1] += elapsed;
          else flush(false);
        }
      };
    }
    return {
      start: function () {
        if (!active && !finalPending && reports < 240) {
          windowStart = Date.now();
          active = true;
        }
      },
      wrap: wrap,
      count: function (label, amount) {
        if (active) counters[label] = (counters[label] || 0) + (amount === undefined ? 1 : amount);
      },
      flush: flush
    };
  }

  var context = $.GetContextPanel();
  if (context.HPV2Profile) context.HPV2Profile.flush(true);
  var precise = typeof performance !== "undefined" && performance && typeof performance.now === "function";
  var parent = context.GetParent();
  context.HPV2Profile = createPickupProfile(
    context.BHasClass("HPV2PickupTopBar") ? "hud" : context.BHasClass("HPV2BridgeRelay") ? "relay" : "world",
    String(context.id || ""), parent ? String(parent.id || "") : "",
    precise ? function () { return performance.now(); } : function () { return Date.now(); },
    precise ? "performance.now" : "Date.now coarse",
    function (raw) { $.Msg("[test_hpv2][profile-v1] " + raw); }
  );
})();
