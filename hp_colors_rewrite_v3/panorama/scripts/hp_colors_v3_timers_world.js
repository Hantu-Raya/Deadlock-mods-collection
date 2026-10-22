(function () {
  "use strict";
  // World-bar sampling and renderer facts only; the topbar owns discovery and artwork.
  if ($.HPColorsV3Timers) $.HPColorsV3Timers.stop();
  var context = $.GetContextPanel(), renderer = $.HPColorsV3Renderer;
  var config = null, active = false, parts = null, stopped = false, offMessage = null, offState = null;
  var jobs = {}, samples = [], source = "", lastSent = null;
  var gate = { scan: true, localName: "", localHero: "", at: -Infinity, since: 0 }, ult = null, ultimateAt = -Infinity;
  function valid(panel) { try { return !!panel && panel.IsValid(); } catch (error) { return false; } }
  function name(panel) {
    var text = valid(panel) ? panel.text : "";
    return typeof text === "string" && text.charAt(0) !== "{" ? text.trim().toUpperCase() : "";
  }
  function enabled(key) { return !!(config && config.shared.enabled && config.shared[key]); }
  function schedule(key, delay, fn) {
    if (jobs[key] || stopped) return;
    var ticket = $.Schedule(delay, function () {
      if (jobs[key] !== ticket) return;
      delete jobs[key]; if (!stopped) fn();
    });
    jobs[key] = ticket;
  }
  function cancel(key) { if (jobs[key]) $.CancelScheduled(jobs[key]); delete jobs[key]; }
  function fresh(at, limit, now) { return typeof at === "number" && Number.isFinite(at) && at <= now && now - at < limit; }
  function radial(raw, low, high) {
    var match = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(-?\d+(?:\.\d+)?)deg\s*\)$/.exec(String(raw || ""));
    var value = match ? Number(match[1]) : NaN;
    return Number.isFinite(value) && value >= low && value <= high ? value : null;
  }
  // The bar title is the player or the hero name (citadel_unit_status_hero_name_mode); both local names are excluded.
  function local(player) { return !!player && (player === gate.localName || player === gate.localHero); }
  function worldAllowed(now, player) {
    return Number.isFinite(gate.at) && (!fresh(gate.at, 15000, now) || gate.scan && !local(player === undefined ? name(parts && parts.name) : player));
  }
  function worldFacts(now, player) {
    if (player === undefined && (ult || fresh(gate.at, 15000, now) && (gate.localName || gate.localHero))) player = name(parts && parts.name);
    var angle = null;
    if (ult && active && enabled("ultimateTimerEnabled") && fresh(ultimateAt, 12000, now) &&
        player === ult.name && !local(ult.name) && valid(parts && parts.ultReady) && parts.ultReady.visible === false)
      angle = Math.min(359.999, ult.angle + ult.rate * (now - ultimateAt) / 1000);
    else ult = null;
    renderer.setTimerFacts({ pickupAllowed: worldAllowed(now, player), ultimateAngle: angle });
    if (ult && ult.rate > 0 && angle < 359.999) schedule("ultimate", 1, function () {
      try { worldFacts(Date.now()); } catch (error) { worldRace(); }
    });
    else cancel("ultimate");
  }
  function publish(record) {
    if (!source || !$.HPColorsV3Bridge) return;
    var now = Date.now(), previous = lastSent, same = previous && previous.record && record && previous.record.name === record.name && previous.record.mask === record.mask;
    if (!record && previous && !previous.record && now - previous.at < 6000) return;
    if (same && now >= previous.at && now - previous.at < 6000 && record.progress.every(function (next, bit) {
      var before = previous.record.progress[bit];
      return !next || !before ? next === before : (next.rate === 0) === (before.rate === 0) &&
        Math.abs(Math.min(0, before.angle + before.rate * (next.at - before.at) / 1000) - next.angle) <= 6;
    })) return;
    if ($.HPColorsV3Bridge.pickup(source, record)) lastSent = { record: record, at: now };
  }
  function sampleWorld(player) {
    var now = Date.now();
    if (!active || !parts || !enabled("pickupTimersEnabled")) { samples = []; publish(null); return; }
    if (player === undefined) player = name(parts.name);
    if (!worldAllowed(now, player)) { samples = []; publish(null); return; }
    var mask = 0, progress = [null, null, null, null], next = [];
    if (samples.at === now) return;
    next.at = now;
    if (!player || player.length > 256) { samples = []; publish(null); return; }
    renderer.refreshPickups();
    (parts.pickupIcons || []).forEach(function (panel, i) {
      var bit = parts.pickupKinds[i];
      if (mask & (1 << bit) || !valid(panel) || panel.visible === false) return;
      mask |= 1 << bit;
      var border = parts.pickupBorders[i], angle = valid(border) ? radial(border.style.clip, -360, 0) : null;
      var before = samples[bit], points = before && before.panel === panel && before.name === player ? before.points.slice(-2) : [];
      if (angle !== null) {
        points.push({ angle: angle, at: now });
        var rate = 0;
        if (points.length === 3) {
          var a = points[0], b = points[1], c = points[2], t1 = (b.at - a.at) / 1000, t2 = (c.at - b.at) / 1000;
          var first = t1 > 0 ? (b.angle - a.angle) / t1 : 0, last = t2 > 0 ? (c.angle - b.angle) / t2 : 0;
          var fit = (c.angle - a.angle) / ((c.at - a.at) / 1000);
          if (t1 > 0 && t2 > 0 && fit > 0 && fit <= 360 && Math.abs(first - last) <= fit * 0.1) rate = fit;
        }
        progress[bit] = { angle: angle, rate: rate, at: now };
      } else points = [];
      next[bit] = { panel: panel, name: player, points: points };
    });
    samples = next; publish({ name: player, mask: mask, at: now, progress: progress });
  }
  function worldRace() {
    samples = []; ult = null; cancel("ultimate"); publish(null);
    renderer.setTimerFacts({ pickupAllowed: false, ultimateAngle: null });
  }
  function worldTick() {
    if (!valid(context)) { stop(); return; }
    if (!active || !enabled("pickupTimersEnabled") && !enabled("ultimateTimerEnabled")) return;
    try {
      var player = enabled("pickupTimersEnabled") ? name(parts && parts.name) : undefined;
      if (!jobs.ultimate) worldFacts(Date.now(), player);
      sampleWorld(player);
    } catch (error) { worldRace(); }
    schedule("world", 3, worldTick);
  }
  function onState(state) {
    config = state.settings; active = state.active; parts = state.parts;
    if (source !== state.source) {
      publish(null); source = state.source || ""; lastSent = null; samples = []; ult = null; ultimateAt = -Infinity;
    }
    if (!active || !enabled("pickupTimersEnabled") && !enabled("ultimateTimerEnabled")) {
      cancel("world"); cancel("ultimate"); ult = null; samples = []; publish(null);
      renderer.setTimerFacts({ pickupAllowed: true, ultimateAngle: null }); return;
    }
    if (!enabled("ultimateTimerEnabled")) { cancel("ultimate"); ult = null; }
    worldTick();
  }
  function receive(raw) {
    if (stopped || !valid(context) || typeof raw !== "string" || raw.length > 4096) return;
    if (raw.indexOf("HPV3_PICKUP_SCAN_GATE") < 0 && raw.indexOf("HPV3_ULTIMATE_SNAPSHOT") < 0) return;
    try {
      var m = JSON.parse(raw), now = Date.now();
      var localHero = m.localHero === undefined ? "" : m.localHero;
      if (m.magic === "HPV3_PICKUP_SCAN_GATE" && typeof m.scan === "boolean" && typeof m.localName === "string" && m.localName.length <= 256 &&
          typeof localHero === "string" && localHero.length <= 256 &&
          fresh(m.at, 15000, now) && m.at >= gate.at && typeof m.since === "number" && Number.isFinite(m.since) && m.since >= gate.since && m.since <= m.at) {
        var localName = m.localName.trim().toUpperCase(); localHero = localHero.trim().toUpperCase();
        var changed = m.since !== gate.since || m.scan !== gate.scan || localName !== gate.localName || localHero !== gate.localHero || !fresh(gate.at, 15000, now);
        if (m.since > gate.since) { ult = null; ultimateAt = -Infinity; samples = []; lastSent = null; publish(null); }
        gate = { scan: m.scan, localName: localName, localHero: localHero, at: m.at, since: m.since };
        if (changed && active) {
          var player = name(parts && parts.name); worldFacts(now, player);
          if (!worldAllowed(now, player)) { samples = []; publish(null); }
        }
      } else if (m.magic === "HPV3_ULTIMATE_SNAPSHOT" && active && Number.isFinite(gate.at) && enabled("ultimateTimerEnabled") && m.since === gate.since && fresh(m.at, 12000, now) && m.at >= ultimateAt && m.at >= m.since && Array.isArray(m.players) && m.players.length <= 12) {
        var seen = Object.create(null);
        // [player, angle, rate, hero?]: either name may be "" (not unique on the topbar), never both; no name twice.
        function key(text) { return typeof text === "string" && text.length <= 256 && text === text.trim().toUpperCase(); }
        if (!m.players.every(function (p) {
          if (!Array.isArray(p) || p.length !== 3 && p.length !== 4 || !key(p[0]) || p.length === 4 && !key(p[3])) return false;
          var hero = p.length === 4 ? p[3] : "";
          if (!p[0] && !hero || p[0] && seen[p[0]] || hero && seen[hero] || typeof p[1] !== "number" || !Number.isFinite(p[1]) || p[1] < 0 || p[1] > 360 || typeof p[2] !== "number" || !Number.isFinite(p[2]) || p[2] < 0 || p[2] > 360 || p[1] === 360 && p[2] !== 0) return false;
          if (p[0]) seen[p[0]] = true; if (hero) seen[hero] = true; return true;
        })) return;
        ultimateAt = m.at; var n = name(parts && parts.name), entry = n ? m.players.filter(function (p) { return p[0] === n || p.length === 4 && p[3] === n; })[0] : null;
        ult = entry && entry[1] < 360 ? { name: n, angle: entry[1], rate: entry[2] } : null; worldFacts(now, n);
      }
    } catch (error) { /* Untrusted transport is fail-closed; races retry at the next native sample. */ }
  }
  function stop() {
    if (stopped) return;
    stopped = true; Object.keys(jobs).forEach(cancel);
    if (offMessage) offMessage(); if (offState) offState();
    publish(null); renderer.setTimerFacts({ pickupAllowed: false, ultimateAngle: null });
  }
  $.HPColorsV3Timers = { stop: stop };
  offMessage = renderer.onMessage(receive); offState = renderer.onState(onState);
})();
