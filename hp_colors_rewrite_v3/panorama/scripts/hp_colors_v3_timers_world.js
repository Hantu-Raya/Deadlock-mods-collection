(function () {
  "use strict";
  // World-bar sampling and renderer facts only; the topbar owns discovery and artwork.
  // requires, in include order (layout/unit_status_overlay_v2.xml): world_settings, bridge, renderer, then this script.
  if ($.HPColorsV3Timers) $.HPColorsV3Timers.stop();
  var context = $.GetContextPanel(), renderer = $.HPColorsV3Renderer;
  var bridgeMagics = $.HPColorsV3Bridge.MAGICS;
  var GATE_MAGIC = bridgeMagics.PICKUP_SCAN_GATE, ULTIMATE_MAGIC = bridgeMagics.ULTIMATE_SNAPSHOT, BOUNTY_MAGIC = bridgeMagics.BOUNTY_SNAPSHOT;
  var PICKUP_MAGIC = bridgeMagics.PICKUP_SNAPSHOT, MESSAGE_CAP = 4096; // the three topbar snapshots share one cap (the hud publishes at most 12 players)
  // The renderer's view of this bar (name, ultimate-ready icon, pickup icons): read where used, never cached here.
  var config = null, active = false, present = false, barRead = renderer.barFacts({ parts: null }), stopped = false, offMessage = null, offState = null;
  // Sampler state: the last pickup samples, the ms of the pass that took them (reset with them), the publisher
  // key and the last message sent. Endpoint state: gate, ult, bounty and their arrival times below.
  var jobs = {}, samples = [], lastAt = -Infinity, source = "", lastSent = null;
  var gate = { scan: true, localName: "", localHero: "", at: -Infinity, since: 0 }, ult = null, ultimateAt = -Infinity, bounty = null, bountyAt = -Infinity;
  // ---- CADENCE: this context's passes and the windows it accepts the topbar's snapshots for (hud CADENCE lists
  // the producer periods; each window here is longer than its producer period, which a test pins).
  var WORLD_PASS_S = 3, ULTIMATE_FACTS_S = 1;
  var GATE_WINDOW_MS = 15000;     // hud DISCOVERY_S 5
  var ULTIMATE_WINDOW_MS = 12000; // hud ULTIMATE_REPUBLISH_MS 2000
  var BOUNTY_WINDOW_MS = 12000;   // hud BOUNTY_REPUBLISH_MS 5000
  var PICKUP_REPUBLISH_MS = 6000, PICKUP_DRIFT_DEG = 6; // topbar keeps records RECORD_TTL_MS (24000) + 1
  var ULT_CEILING_DEG = 359.999;  // hud extrapolates the same ceiling; 360 itself is "ready"
  // Ultimate snapshot players: [player, angle, rate, hero?]; bounty: [player, souls, hero?] (wire format frozen).
  var ULT_PLAYER = 0, ULT_ANGLE = 1, ULT_RATE = 2, ULT_HERO = 3, BOUNTY_PLAYER = 0, BOUNTY_SOULS = 1, BOUNTY_HERO = 2;
  function valid(panel) { try { return !!panel && panel.IsValid(); } catch (error) { return false; } }
  function enabled(key) { return !!(config && config.shared.enabled && config.shared[key]); }
  function anyTimerEnabled() { return enabled("pickupTimersEnabled") || enabled("ultimateTimerEnabled") || enabled("killBountyEnabled"); }
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
  // A snapshot player [player, ..., hero?] belongs to this bar when either name is the bar title (heroIndex is
  // ULT_HERO or BOUNTY_HERO; the hero slot exists only when the tuple is one longer).
  function matchesBar(p, heroIndex, bar) { return p[0] === bar || p.length === heroIndex + 1 && p[heroIndex] === bar; }
  // The bar title is the player or the hero name (citadel_unit_status_hero_name_mode); both local names are excluded.
  function local(player) { return !!player && (player === gate.localName || player === gate.localHero); }
  // ======== Endpoint facts: what the renderer is told (state: gate, ult, bounty and their arrival times) ========
  function worldAllowed(now, player) {
    return Number.isFinite(gate.at) && (!fresh(gate.at, GATE_WINDOW_MS, now) || gate.scan && !local(player === undefined ? barRead.barName : player));
  }
  function worldFacts(now, player) {
    if (player === undefined && (ult || bounty || fresh(gate.at, GATE_WINDOW_MS, now) && (gate.localName || gate.localHero))) player = barRead.barName;
    var angle = null, souls = null;
    if (ult && active && enabled("ultimateTimerEnabled") && fresh(ultimateAt, ULTIMATE_WINDOW_MS, now) &&
        player === ult.name && !local(ult.name) && barRead.ultReadyVisible === false)
      angle = Math.min(ULT_CEILING_DEG, ult.angle + ult.rate * (now - ultimateAt) / 1000);
    else ult = null;
    // Ticket 50: the topbar's kill bounty for this bar's name, while its snapshot is fresh.
    if (bounty && active && enabled("killBountyEnabled") && fresh(bountyAt, BOUNTY_WINDOW_MS, now) && player === bounty.name && !local(bounty.name)) souls = bounty.value;
    else bounty = null;
    renderer.setTimerFacts({ pickupAllowed: worldAllowed(now, player), ultimateAngle: angle, bounty: souls });
    if (ult && ult.rate > 0 && angle < ULT_CEILING_DEG) schedule("ultimate", ULTIMATE_FACTS_S, function () {
      try { worldFacts(Date.now()); } catch (error) { worldRace(); }
    });
    else cancel("ultimate");
  }
  // ======== Sampler: pickup samples published through the bridge (state: samples, lastAt, source, lastSent) ========
  function publish(record) {
    if (!source) return;
    var now = Date.now(), previous = lastSent, same = previous && previous.record && record && previous.record.name === record.name && previous.record.mask === record.mask;
    if (!record && previous && !previous.record && now - previous.at < PICKUP_REPUBLISH_MS) return;
    if (same && now >= previous.at && now - previous.at < PICKUP_REPUBLISH_MS && record.progress.every(function (next, bit) {
      var before = previous.record.progress[bit];
      return !next || !before ? next === before : (next.rate === 0) === (before.rate === 0) &&
        Math.abs(Math.min(0, before.angle + before.rate * (next.at - before.at) / 1000) - next.angle) <= PICKUP_DRIFT_DEG;
    })) return;
    if ($.HPColorsV3Bridge.send({ magic: PICKUP_MAGIC, source: source, instance: $.HPColorsV3Bridge.instance, at: Date.now(), record: record })) lastSent = { record: record, at: now };
  }
  function resetSamples() { samples = []; lastAt = -Infinity; }
  function sampleWorld(player) {
    var now = Date.now();
    if (!active || !present || !enabled("pickupTimersEnabled")) { resetSamples(); publish(null); return; }
    if (player === undefined) player = barRead.barName;
    if (!worldAllowed(now, player)) { resetSamples(); publish(null); return; }
    var mask = 0, progress = [null, null, null, null], next = [];
    if (lastAt === now) return;
    if (!player || player.length > 256) { resetSamples(); publish(null); return; }
    renderer.refreshPickups();
    var pickups = barRead.pickups;
    pickups.icons.forEach(function (panel, i) {
      var bit = pickups.kinds[i];
      if (mask & (1 << bit) || !valid(panel) || panel.visible === false) return;
      mask |= 1 << bit;
      var border = pickups.borders[i], angle = valid(border) ? radial(border.style.clip, -360, 0) : null;
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
    samples = next; lastAt = now; publish({ name: player, mask: mask, at: now, progress: progress });
  }
  function worldRace() {
    resetSamples(); ult = null; bounty = null; cancel("ultimate"); publish(null);
    renderer.setTimerFacts({ pickupAllowed: false, ultimateAngle: null, bounty: null });
  }
  function worldTick() {
    if (!valid(context)) { stop(); return; }
    if (!active || !anyTimerEnabled()) return;
    try {
      var player = enabled("pickupTimersEnabled") ? barRead.barName : undefined;
      if (!jobs.ultimate) worldFacts(Date.now(), player);
      sampleWorld(player);
    } catch (error) { worldRace(); }
    schedule("world", WORLD_PASS_S, worldTick);
  }
  function onState(state) {
    config = state.settings; active = state.active; present = !!state.parts; barRead = renderer.barFacts(state);
    if (source !== state.source) {
      publish(null); source = state.source || ""; lastSent = null; resetSamples(); ult = null; ultimateAt = -Infinity; bounty = null; bountyAt = -Infinity;
    }
    if (!active || !anyTimerEnabled()) {
      cancel("world"); cancel("ultimate"); ult = null; bounty = null; resetSamples(); publish(null);
      renderer.setTimerFacts({ pickupAllowed: true, ultimateAngle: null, bounty: null }); return;
    }
    if (!enabled("ultimateTimerEnabled")) { cancel("ultimate"); ult = null; }
    if (!enabled("killBountyEnabled")) bounty = null;
    worldTick();
  }
  // ======== Endpoint: lifecycle and untrusted snapshots from the topbar ========
  function key(text) { return typeof text === "string" && text.length <= 256 && text === text.trim().toUpperCase(); }
  function receive(raw) {
    if (stopped || !valid(context) || typeof raw !== "string" || raw.length > MESSAGE_CAP) return;
    var gateMessage = raw.indexOf(GATE_MAGIC) >= 0;
    if (!gateMessage && raw.indexOf(ULTIMATE_MAGIC) < 0 && raw.indexOf(BOUNTY_MAGIC) < 0) return;
    // Only the scan gate is kept while inactive; every other bar (troopers, camps, allies off) would parse the
    // topbar's one-second snapshots just to drop them below.
    if (!gateMessage && !active) return;
    try {
      var m = JSON.parse(raw), now = Date.now();
      var localHero = m.localHero === undefined ? "" : m.localHero;
      if (m.magic === GATE_MAGIC && typeof m.scan === "boolean" && typeof m.localName === "string" && m.localName.length <= 256 &&
          typeof localHero === "string" && localHero.length <= 256 &&
          fresh(m.at, GATE_WINDOW_MS, now) && m.at >= gate.at && typeof m.since === "number" && Number.isFinite(m.since) && m.since >= gate.since && m.since <= m.at) {
        var localName = m.localName.trim().toUpperCase(); localHero = localHero.trim().toUpperCase();
        var changed = m.since !== gate.since || m.scan !== gate.scan || localName !== gate.localName || localHero !== gate.localHero || !fresh(gate.at, GATE_WINDOW_MS, now);
        if (m.since > gate.since) { ult = null; ultimateAt = -Infinity; bounty = null; bountyAt = -Infinity; resetSamples(); lastSent = null; publish(null); }
        gate = { scan: m.scan, localName: localName, localHero: localHero, at: m.at, since: m.since };
        if (changed && active) {
          var player = barRead.barName; worldFacts(now, player);
          if (!worldAllowed(now, player)) { resetSamples(); publish(null); }
        }
      } else if (m.magic === ULTIMATE_MAGIC && active && Number.isFinite(gate.at) && enabled("ultimateTimerEnabled") && m.since === gate.since && fresh(m.at, ULTIMATE_WINDOW_MS, now) && m.at >= ultimateAt && m.at >= m.since && Array.isArray(m.players) && m.players.length <= 12) {
        var seen = Object.create(null);
        // [player, angle, rate, hero?]: either name may be "" (not unique on the topbar), never both; no name twice.
        if (!m.players.every(function (p) {
          if (!Array.isArray(p) || p.length !== ULT_RATE + 1 && p.length !== ULT_HERO + 1 || !key(p[ULT_PLAYER]) || p.length === ULT_HERO + 1 && !key(p[ULT_HERO])) return false;
          var hero = p.length === ULT_HERO + 1 ? p[ULT_HERO] : "";
          if (!p[0] && !hero || p[0] && seen[p[0]] || hero && seen[hero] || typeof p[ULT_ANGLE] !== "number" || !Number.isFinite(p[ULT_ANGLE]) || p[ULT_ANGLE] < 0 || p[ULT_ANGLE] > 360 || typeof p[ULT_RATE] !== "number" || !Number.isFinite(p[ULT_RATE]) || p[ULT_RATE] < 0 || p[ULT_RATE] > 360 || p[ULT_ANGLE] === 360 && p[ULT_RATE] !== 0) return false;
          if (p[0]) seen[p[0]] = true; if (hero) seen[hero] = true; return true;
        })) return;
        ultimateAt = m.at; var n = barRead.barName, entry = n ? m.players.filter(function (p) { return matchesBar(p, ULT_HERO, n); })[0] : null;
        ult = entry && entry[ULT_ANGLE] < 360 ? { name: n, angle: entry[ULT_ANGLE], rate: entry[ULT_RATE] } : null; worldFacts(now, n);
      } else if (m.magic === BOUNTY_MAGIC && active && Number.isFinite(gate.at) && enabled("killBountyEnabled") && m.since === gate.since && fresh(m.at, BOUNTY_WINDOW_MS, now) && m.at >= bountyAt && m.at >= m.since && Array.isArray(m.players) && m.players.length <= 12) {
        // Ticket 50: [player, souls, hero?] under the same name rules as the ultimate snapshot.
        var named = Object.create(null);
        if (!m.players.every(function (p) {
          if (!Array.isArray(p) || p.length !== BOUNTY_SOULS + 1 && p.length !== BOUNTY_HERO + 1 || !key(p[BOUNTY_PLAYER]) || p.length === BOUNTY_HERO + 1 && !key(p[BOUNTY_HERO])) return false;
          var hero = p.length === BOUNTY_HERO + 1 ? p[BOUNTY_HERO] : "";
          if (!p[0] && !hero || p[0] && named[p[0]] || hero && named[hero] || !Number.isSafeInteger(p[BOUNTY_SOULS]) || p[BOUNTY_SOULS] < 0 || p[BOUNTY_SOULS] > 100000) return false;
          if (p[0]) named[p[0]] = true; if (hero) named[hero] = true; return true;
        })) return;
        // An unchanged value for the name already shown only refreshes freshness: no name read, no repaint.
        // The 3s world tick still checks the bar's name, and a carrier change clears the value.
        var held = bounty && m.players.filter(function (p) { return matchesBar(p, BOUNTY_HERO, bounty.name); })[0];
        if (held && held[BOUNTY_SOULS] === bounty.value) { bountyAt = m.at; return; }
        bountyAt = m.at; var bar = barRead.barName, match = bar ? m.players.filter(function (p) { return matchesBar(p, BOUNTY_HERO, bar); })[0] : null;
        bounty = match ? { name: bar, value: match[BOUNTY_SOULS] } : null; worldFacts(now, bar);
      }
    } catch (error) { /* Untrusted transport is fail-closed; races retry at the next native sample. */ }
  }
  function stop() {
    if (stopped) return;
    stopped = true; Object.keys(jobs).forEach(cancel);
    if (offMessage) offMessage(); if (offState) offState();
    publish(null); renderer.setTimerFacts({ pickupAllowed: false, ultimateAngle: null, bounty: null });
  }
  $.HPColorsV3Timers = { stop: stop };
  offMessage = renderer.onMessage(receive); offState = renderer.onState(onState);
})();
