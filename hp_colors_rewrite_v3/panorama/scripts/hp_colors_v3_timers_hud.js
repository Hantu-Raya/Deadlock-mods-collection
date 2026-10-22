(function () {
  "use strict";
  // Topbar authority, pickup artwork and ultimate snapshots; no world-bar sampler.
  if ($.HPColorsV3Timers) $.HPColorsV3Timers.stop();
  var context = $.GetContextPanel(), config = null, stopped = false, listener = null;
  // Opt-in (QOLLOCK's composed topbar root carries the class): cards also answer to their hero name.
  var heroNames = context.BHasClass("HPColorsV3TimersHeroNames");
  var jobs = {}, rows = [], records = Object.create(null), localLabels = [];
  var retirement = $.HPColorsV3TimerRetirement || { rows: [], job: null };
  $.HPColorsV3TimerRetirement = retirement;
  var retiredRows = retirement.rows, since = 0, lastClock = null;
  // Reinclusion retains only authority and pending restoration leases, not active rows or records.
  // Opaque epochs need one string per replacement publisher, not per revision/sample; eviction
  // would reopen replay. This session-only history is collected with the context.
  var authority = $.HPColorsV3TimersAuthority || { epoch: "", revision: -1, retired: [] };
  $.HPColorsV3TimersAuthority = authority;
  var epoch = "", retiredEpochs = authority.retired, requestAttempt = 0, lastUltimate = null, lastUltimateAt = -Infinity;
  var pausePanel = null, paused = false, pauses = [], ttl = 24000;
  var colors = ["pickupGunColor", "pickupMovementColor", "pickupSpiritColor", "pickupSurvivalColor"];
  var images = ["gun", "movement", "spirit", "survival"];
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
  function topRoot() {
    var root = context;
    for (var i = 0; i < 24; i++) { var p = root.GetParent(); if (!valid(p)) return root; root = p; }
    return root;
  }
  function updatePause(now) {
    var next = valid(pausePanel) && pausePanel.BAscendantHasClass("gameIsPaused");
    if (next && !paused) pauses.push({ start: now, end: null });
    if (!next && paused) pauses[pauses.length - 1].end = now;
    paused = !!next;
    pauses = pauses.filter(function (p) { return p.end === null || now - p.end <= ttl; });
  }
  // With heroNames, a world bar titled with the hero name (citadel_unit_status_hero_name_mode; Street
  // Brawl showed hero names) still finds its card. A name identifies a card only when no other card
  // (local included) shows it as a player or hero name. Without heroNames no hero label is read.
  function heroLabel(owner) {
    if (!heroNames) return null;
    var found = owner.FindChildrenWithClassTraverse("HeroName");
    return found.length === 1 ? found[0] : null;
  }
  function counts() {
    var holders = Object.create(null), local = "", localHero = "";
    function add(key, entry) { if (!key) return; var list = holders[key] || (holders[key] = []); if (list.indexOf(entry) < 0) list.push(entry); }
    function unique(key) { return !!key && key.length <= 256 && !!holders[key] && holders[key].length === 1; }
    localLabels.forEach(function (entry) { add(name(entry.label), entry); add(name(entry.hero), entry); });
    if (localLabels.length === 1) { local = name(localLabels[0].label); localHero = name(localLabels[0].hero); }
    rows.forEach(function (row) { row.observedName = name(row.label); row.observedHero = name(row.hero); add(row.observedName, row); add(row.observedHero, row); });
    return { unique: unique, local: unique(local) ? local : "", localHero: unique(localHero) ? localHero : "" };
  }
  function discoverRows() {
    cleanupRows();
    var next = []; localLabels = [];
    context.FindChildrenWithClassTraverse("PlayerName").forEach(function (label) {
      if (!valid(label)) return;
      var owner = label.GetParent();
      while (valid(owner) && owner !== context && (owner.paneltype || owner.type) !== "CitadelHudTopBarPlayer") owner = owner.GetParent();
      if (!valid(owner) || owner === context) return;
      if (owner.BHasClass("LocalPlayer")) { localLabels.push({ label: label, hero: heroLabel(owner), owner: owner }); return; }
      var native = owner.FindChildTraverse("UltimateStatus"); if (!valid(native)) return;
      // A pending card lease includes cooldown alignment even after its ultimate was restored/replaced.
      if (retiredRows.some(function (r) { return r.owner === owner; })) return;
      var row = rows.filter(function (r) { return r.label === label && r.ultimate === native; })[0];
      if (row && !valid(row.hero)) row.hero = heroLabel(owner);
      var hero = row ? null : heroLabel(owner);
      next.push(row || { label: label, hero: hero, owner: owner, ultimate: native, mask: 0, name: name(label), heroName: name(hero), after: 0, cache: {}, models: [] });
    });
    rows.forEach(function (row) { if (next.indexOf(row) < 0 && !retireRow(row) && retiredRows.indexOf(row) < 0) retiredRows.push(row); });
    cleanupRows();
    rows = next.filter(function (row) { return !retiredRows.some(function (old) { return old.owner === row.owner; }); });
  }
  function style(row, panel, key, value) {
    if (!panel) return;
    var map = row.cache[panel.id] || (row.cache[panel.id] = {}), text = value === null ? null : String(value);
    if (map[key] !== text && valid(panel)) { panel.style[key] = text; map[key] = text; }
  }
  function makeIcons(row) {
    row.cache = {}; row.structure = ""; row.progressKey = "";
    var parent = row.ultimate.GetParent(); row.parent = parent;
    var siblings = parent.Children(), index = siblings.indexOf(row.ultimate); row.next = siblings[index + 1]; row.previous = siblings[index - 1];
    row.cooldown = parent.FindChildTraverse("UltimateCooldownTextShown") || parent.FindChildTraverse("te_UltimateCooldownTextShown");
    // Live 6782: horizontalAlign cannot be cleared alone; release to the captured value or v2's "left".
    row.align = valid(row.cooldown) ? row.cooldown.style.horizontalAlign || "left" : "left";
    row.container = $.CreatePanel("Panel", parent, "HPColorsV3PickupIndicators"); row.container.hittest = row.container.hittestchildren = false;
    row.left = $.CreatePanel("Panel", row.container, "HPColorsV3PickupLeft"); row.right = $.CreatePanel("Panel", row.container, "HPColorsV3PickupRight"); row.icons = [];
    for (var bit = 0; bit < 4; bit++) {
      var icon = $.CreatePanel("Panel", row.left, "HPColorsV3Pickup" + bit), ring = $.CreatePanel("Panel", icon, "HPColorsV3Pickup" + bit + "Progress"), glyph = $.CreatePanel("Image", icon, "HPColorsV3Pickup" + bit + "Glyph");
      icon.hittest = ring.hittest = glyph.hittest = false;
      glyph.SetImage("s2r://panorama/images/hud/icons/powerup_" + images[bit] + ".vsvg"); row.icons.push({ icon: icon, ring: ring, glyph: glyph });
      style(row, icon, "flowChildren", "none"); style(row, icon, "borderRadius", "50%"); style(row, icon, "border", "1px solid #111111"); style(row, icon, "overflow", "noclip");
      style(row, ring, "horizontalAlign", "left"); style(row, ring, "verticalAlign", "top"); style(row, ring, "margin", "0px"); style(row, ring, "position", "0px 0px 0px");
      style(row, ring, "borderRadius", "50%"); style(row, ring, "backgroundImage", 'url("s2r://panorama/images/masks/no_mask_png.vtex")'); style(row, ring, "backgroundSize", "100%");
      style(row, ring, "transitionDuration", "0s"); style(row, ring, "zIndex", "1"); style(row, glyph, "zIndex", "2");
      style(row, glyph, "horizontalAlign", "center"); style(row, glyph, "verticalAlign", "center");
    }
  }
  function angleAt(model, now) {
    var elapsed = Math.max(0, now - model.at);
    pauses.forEach(function (p) { elapsed -= Math.max(0, Math.min(now, p.end === null ? now : p.end) - Math.max(model.at, p.start)); });
    return Math.min(0, model.angle + model.rate * Math.max(0, elapsed) / 1000);
  }
  function unavailable(row, now) {
    var next = row.observedName, hero = row.observedHero, blocked = !next && !hero || row.owner.BHasClass("Dead") || row.owner.BHasClass("Disconnected");
    var changed = next !== row.name || hero !== row.heroName;
    if (changed || blocked || row.blocked) row.after = now;
    row.name = next; row.heroName = hero; row.blocked = blocked;
    return blocked || changed;
  }
  function moveBefore(parent, child, before) {
    var siblings = parent.Children();
    if (siblings.indexOf(child) !== siblings.indexOf(before) - 1) parent.MoveChildBefore(child, before);
  }
  function moveAfter(parent, child, after) {
    var siblings = parent.Children();
    if (siblings.indexOf(child) !== siblings.indexOf(after) + 1) parent.MoveChildAfter(child, after);
  }
  function render(row, record) {
    var mask = enabled("pickupTimersEnabled") && record ? record.mask : 0;
    if (!mask) {
      if (row.container && valid(row.ultimate) && valid(row.parent)) {
        if (row.ultimate.GetParent() === row.container) { row.restoring = true; row.ultimate.SetParent(row.parent); }
        if (row.restoring && row.ultimate.GetParent() === row.parent) {
          if (valid(row.next) && row.next.GetParent() === row.parent) row.parent.MoveChildBefore(row.ultimate, row.next);
          else if (valid(row.previous) && row.previous.GetParent() === row.parent) row.parent.MoveChildAfter(row.ultimate, row.previous);
          else if (valid(row.container)) row.parent.MoveChildBefore(row.ultimate, row.container);
          row.restoring = false;
        }
      }
      style(row, row.cooldown, "horizontalAlign", row.align || "left");
      if (valid(row.container)) {
        style(row, row.container, "visibility", "collapse");
        (row.icons || []).forEach(function (item) { style(row, item.ring, "visibility", "collapse"); });
      }
      row.mask = 0; row.models = []; row.structure = ""; row.progressKey = ""; return;
    }
    if (!valid(row.container)) makeIcons(row);
    var cfg = config.shared, structure = [mask, cfg.pickupSize, cfg.pickupSpacing, cfg.pickupOffsetX, cfg.pickupOffsetY,
      cfg.pickupBackgroundDarkness, cfg.pickupGlyphColor].concat(colors.map(function (key) { return cfg[key]; })).join(":");
    var parent = row.ultimate.GetParent();
    if (row.structure !== structure || parent !== row.container) {
      if (parent !== row.container) { moveBefore(row.parent, row.container, row.ultimate); row.ultimate.SetParent(row.container); }
      moveBefore(row.container, row.left, row.ultimate); moveAfter(row.container, row.right, row.ultimate);
      style(row, row.container, "visibility", "visible"); style(row, row.cooldown, "horizontalAlign", "center");
      [row.container, row.left, row.right].forEach(function (panel) { style(row, panel, "flowChildren", "right"); style(row, panel, "height", "fit-children"); style(row, panel, "overflow", "noclip"); });
      style(row, row.container, "horizontalAlign", "center"); style(row, row.container, "width", "fit-children");
      var bits = [0, 1, 2, 3].filter(function (bit) { return mask & (1 << bit); }), half = Math.ceil(bits.length / 2);
      var wingWidth = half * (cfg.pickupSize + 2 * cfg.pickupSpacing) + "px";
      [row.left, row.right].forEach(function (wing) { style(row, wing, "width", wingWidth); style(row, wing, "transform", "translateX(" + cfg.pickupOffsetX + "px) translateY(" + cfg.pickupOffsetY + "px)"); });
      var previousLeft = null, previousRight = null;
      row.icons.forEach(function (item, bit) {
        var rank = bits.indexOf(bit), wing = rank < half ? row.left : row.right;
        if (item.icon.GetParent() !== wing) item.icon.SetParent(wing);
        var previous = wing === row.left ? previousLeft : previousRight;
        if (previous) moveAfter(wing, item.icon, previous);
        if (wing === row.left) previousLeft = item.icon; else previousRight = item.icon;
        style(row, item.icon, "visibility", rank >= 0 ? "visible" : "collapse");
        var color = cfg[colors[bit]], value = parseInt(color.slice(1), 16), brightness = 1 - cfg.pickupBackgroundDarkness / 100;
        var background = "#" + [16, 8, 0].map(function (shift) { return ("0" + Math.round((value >> shift & 255) * brightness).toString(16)).slice(-2); }).join("").toUpperCase();
        style(row, item.icon, "backgroundColor", background); style(row, item.icon, "width", cfg.pickupSize + "px"); style(row, item.icon, "height", cfg.pickupSize + "px"); style(row, item.icon, "margin", "0px " + cfg.pickupSpacing + "px");
        style(row, item.glyph, "width", Math.round(cfg.pickupSize * 14 / 22) + "px"); style(row, item.glyph, "height", Math.round(cfg.pickupSize * 14 / 22) + "px"); style(row, item.glyph, "washColor", cfg.pickupGlyphColor);
        style(row, item.ring, "width", cfg.pickupSize - 2 + "px"); style(row, item.ring, "height", cfg.pickupSize - 2 + "px"); style(row, item.ring, "washColor", color);
      });
      row.structure = structure;
    }
    row.mask = mask; row.models = record.progress;
    paintProgress(row);
  }
  function paintProgress(row) {
    var now = Date.now(), angles = row.models.map(function (model) { return model ? angleAt(model, now) : null; });
    if (!paused && row.models.some(function (p, bit) { return p && p.rate > 0 && angles[bit] < 0; })) schedule("progress", 1, progressTick);
    var key = row.mask + ":" + angles.join(":");
    if (row.progressKey === key) return;
    row.icons.forEach(function (item, bit) {
      var model = row.models[bit];
      style(row, item.ring, "visibility", model && row.mask & (1 << bit) ? "visible" : "collapse");
      if (model) style(row, item.ring, "clip", "radial(50% 50%, 0deg, " + angles[bit] + "deg)");
    });
    row.progressKey = key;
  }
  function renderRows() {
    var now = Date.now(), scan = counts(), units = Object.create(null);
    Object.keys(records).forEach(function (key) {
      var r = records[key]; if (!fresh(r.at, ttl + 1, now)) { delete records[key]; return; }
      if (r.name) units[r.name] = Object.prototype.hasOwnProperty.call(units, r.name) ? false : r;
    });
    rows.forEach(function (row) {
      var blocked = unavailable(row, now), byName = scan.unique(row.name) ? units[row.name] : undefined, byHero = scan.unique(row.heroName) ? units[row.heroName] : undefined;
      var record = byName === false || byHero === false || byName && byHero && byName !== byHero ? null : byName || byHero;
      render(row, !blocked && record && record.at >= row.after ? record : null);
    });
  }
  function progressTick() {
    if (!valid(context)) { stop(); return; }
    if (!enabled("pickupTimersEnabled")) return;
    try { updatePause(Date.now()); renderRows(); }
    catch (error) { schedule("progress", 1, progressTick); }
  }
  function publishGate() {
    var clock = context.FindChildTraverse("GameTime"), text = valid(clock) ? String(clock.text || "").replace(/<[^>]+>/g, "").trim() : "";
    var match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text), seconds = match && Number(match[3]) < 60 && (!match[1] || Number(match[2]) < 60) ? Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
    if (seconds !== null && lastClock !== null && seconds < lastClock) { since = Date.now(); records = Object.create(null); lastUltimate = null; rows.forEach(function (r) { r.sample = null; }); }
    if (seconds !== null) lastClock = seconds;
    var normal = context.BAscendantHasClass("isDefaultMap") && !["connectedToHeroTesting", "connectedToTutorial", "connectedToHideout", "gamemode_streetbrawl"].some(function (c) { return context.BAscendantHasClass(c); });
    var scan = counts(), gate = { magic: "HPV3_PICKUP_SCAN_GATE", scan: !normal || seconds === null || seconds >= 300, localName: scan.local, since: since, at: Date.now() };
    if (heroNames) gate.localHero = scan.localHero;
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(gate));
  }
  function discoveryTick() {
    if (!valid(context)) { stop(); return; }
    if (!enabled("pickupTimersEnabled") && !enabled("ultimateTimerEnabled")) return;
    try {
      discoverRows();
      if (!valid(pausePanel)) pausePanel = topRoot().FindChildTraverse("PausedGameContainer");
      updatePause(Date.now()); publishGate(); renderRows();
    } catch (error) { /* Discovery races retry on the same cadence. */ }
    schedule("discovery", 5, discoveryTick);
  }
  function ultimateTick() {
    if (!valid(context)) { stop(); return; }
    if (!enabled("ultimateTimerEnabled")) return;
    try {
      updatePause(Date.now());
      var now = Date.now(), scan = counts(), players = [], states = [], correction = false;
      rows.forEach(function (r) {
        var player = name(r.label), hero = name(r.hero); player = scan.unique(player) ? player : ""; hero = scan.unique(hero) && hero !== player ? hero : "";
        var n = player + "\u0001" + hero; if (!player && !hero || r.owner.BHasClass("Dead") || r.owner.BHasClass("Disconnected")) { r.sample = null; return; }
        var unlocked = r.owner.BHasClass("UltimateUnlocked"), ready = r.owner.BHasClass("UltimateCooldownReady");
        if (!valid(r.radial)) r.radial = r.ultimate.FindChildTraverse("UltimateStatusBG");
        var angle = !unlocked ? 0 : ready ? 360 : valid(r.radial) ? radial(r.radial.style.clip, 0, 360) : null;
        var p = r.sample, rate = !paused && unlocked && angle !== null && angle < 360 && p && p.name === n && p.since === since && p.unlocked && p.angle !== null && p.angle < 360 && angle >= p.angle && now > p.at ? Math.round(Math.min(360, (angle - p.angle) * 1000 / (now - p.at)) * 100) / 100 : 0;
        r.sample = { name: n, angle: angle, at: now, unlocked: unlocked, since: since };
        if (angle === null) return;
        var state = unlocked ? ready ? 2 : 1 : 0;
        if (heroNames) { players.push([player, angle, rate, hero]); states.push([player, hero, state]); }
        else { players.push([player, angle, rate]); states.push([player, state]); }
        var sent = lastUltimate && lastUltimate.players.filter(function (entry) { return entry[0] === player && (entry[3] || "") === hero; })[0];
        if (sent && ((sent[2] === 0) !== (rate === 0) || Math.abs(angle - Math.min(sent[1] === 360 ? 360 : 359.999, sent[1] + sent[2] * (now - lastUltimateAt) / 1000)) >= 15)) correction = true;
      });
      var key = since + ":" + JSON.stringify(states);
      if (players.length <= 12 && (!lastUltimate || key !== lastUltimate.key || correction || now < lastUltimateAt || now - lastUltimateAt >= 2000)) {
        $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({ magic: "HPV3_ULTIMATE_SNAPSHOT", since: since, at: now, players: players }));
        lastUltimate = { key: key, players: players }; lastUltimateAt = now;
      }
    } catch (error) { /* Native cooldown races retry on the next sample. */ }
    schedule("ultimate", 1, ultimateTick);
  }
  function validProgress(progress, mask, at) {
    return Array.isArray(progress) && progress.length === 4 && progress.every(function (p, bit) {
      return p === null || p && mask & (1 << bit) && typeof p.angle === "number" && Number.isFinite(p.angle) && p.angle >= -360 && p.angle <= 0 &&
        typeof p.rate === "number" && Number.isFinite(p.rate) && p.rate >= 0 && p.rate <= 360 && typeof p.at === "number" && Number.isFinite(p.at) && p.at >= 0 && p.at <= at && at - p.at <= ttl;
    });
  }
  function requestConfig() {
    if (config || stopped) return;
    if (!valid(context)) { stop(); return; }
    // Late menus and lost replies use the same shared request/answer seam as world bars.
    try { $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({ magic: "HPV3_CONFIG_REQUEST", epoch: "", revision: -1 })); }
    catch (error) { /* Delivery may race HUD attachment; the bounded cadence retries. */ }
    if (!config) schedule("request", [0.5, 1, 2, 4, 8][Math.min(requestAttempt++, 4)], requestConfig);
  }
  function receive(raw) {
    if (stopped || !valid(context) || typeof raw !== "string" || raw.length > 64000) return;
    if (raw.indexOf("HPV3_PICKUP_SNAPSHOT") < 0 && raw.indexOf("HP_COLORS_V3_CONFIG") < 0) return;
    try {
      var m = JSON.parse(raw), now = Date.now();
      if (m.magic === "HP_COLORS_V3_CONFIG") {
        // Match the renderer's retained revision floor. A fresh consumer may hydrate the current
        // revision once; a retired epoch or older current-epoch revision is never accepted.
        if (typeof m.epoch !== "string" || !m.epoch || m.epoch.length > 128 || !Number.isSafeInteger(m.revision) || m.revision < 0 ||
            (m.epoch === authority.epoch ? m.revision < authority.revision || config && m.revision === authority.revision : retiredEpochs.indexOf(m.epoch) >= 0) ||
            !$.HPColorsV3WorldSettings.validate(m.settings)) return;
        cancel("request");
        if (m.epoch !== epoch) {
          if (authority.epoch && authority.epoch !== m.epoch && retiredEpochs.indexOf(authority.epoch) < 0) retiredEpochs.push(authority.epoch);
          records = Object.create(null); lastUltimate = null;
        }
        epoch = m.epoch; config = m.settings;
        authority.epoch = epoch; authority.revision = m.revision;
        if (!enabled("pickupTimersEnabled")) { records = Object.create(null); cancel("progress"); }
        if (!enabled("ultimateTimerEnabled")) { cancel("ultimate"); lastUltimate = null; rows.forEach(function (r) { r.sample = null; }); }
        if (enabled("pickupTimersEnabled") || enabled("ultimateTimerEnabled")) { discoveryTick(); if (enabled("ultimateTimerEnabled")) ultimateTick(); }
        else { cancel("discovery"); renderRows(); }
        return;
      }
      if (m.magic !== "HPV3_PICKUP_SNAPSHOT" || !enabled("pickupTimersEnabled") || typeof m.source !== "string" || !m.source || m.source.length > 256 || typeof m.instance !== "string" || !m.instance || m.instance.length > 200 || !Number.isSafeInteger(m.seq) || m.seq < 1 || !fresh(m.at, ttl + 1, now) || m.at < since) return;
      var previous = records[m.source], record = m.record;
      if (previous && (m.at < previous.sentAt || m.instance === previous.instance && m.seq <= previous.seq)) return;
      if (record !== null && (!record || typeof record.name !== "string" || !record.name.trim() || record.name.length > 256 || typeof record.mask !== "number" || record.mask !== (record.mask & 15) || !fresh(record.at, ttl + 1, now) || record.at < since || record.at > m.at || previous && record.at < previous.at || !validProgress(record.progress, record.mask, record.at))) return;
      records[m.source] = { name: record ? record.name.trim().toUpperCase() : "", mask: record ? record.mask : 0, at: record ? record.at : m.at, progress: record ? record.progress : null, sentAt: m.at, instance: m.instance, seq: m.seq };
      updatePause(now); renderRows();
    } catch (error) { /* Untrusted transport is fail-closed; races retry at the next native sample. */ }
  }
  function retireRow(row) {
    try {
      render(row, null);
      if (row.restoring && valid(row.ultimate)) return false;
      var node = valid(row.ultimate) ? row.ultimate.GetParent() : null, depth = 0;
      for (; node && depth < 24; node = node.GetParent(), depth++) {
        if (node === row.container || !valid(node)) return false;
      }
      if (node) return false; // An unproven/deep chain cannot authorize deletion.
      if (valid(row.container)) {
        var native = row.container.FindChildTraverse("UltimateStatus");
        if (valid(native)) {
          if (!valid(row.parent)) return false;
          native.SetParent(row.parent);
          if (native.GetParent() !== row.parent) return false;
        }
        row.container.DeleteAsync(0);
      }
      return true;
    } catch (error) { return false; } // Retain native ownership until restoration succeeds.
  }
  function cleanupRows() {
    for (var i = retiredRows.length - 1; i >= 0; i--) if (retireRow(retiredRows[i])) retiredRows.splice(i, 1);
    if (!retiredRows.length && retirement.job) { $.CancelScheduled(retirement.job); retirement.job = null; }
    if (retiredRows.length && !retirement.job) {
      var ticket = $.Schedule(1, function retryRetirements() {
        if (retirement.job !== ticket) return;
        retirement.job = null; cleanupRows();
      });
      retirement.job = ticket;
    }
  }
  function stop() {
    if (stopped) return;
    stopped = true; Object.keys(jobs).forEach(cancel);
    if (listener !== null) $.UnregisterForUnhandledEvent("ClientUI_FireOutput", listener);
    rows.forEach(function (row) { if (retiredRows.indexOf(row) < 0) retiredRows.push(row); });
    rows = []; cleanupRows();
  }
  $.HPColorsV3Timers = { stop: stop };
  listener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", receive);
  requestConfig();
})();
