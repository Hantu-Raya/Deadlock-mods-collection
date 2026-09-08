(() => {
  "use strict";

  // World panels publish their own engine-fed effects. The HUD cannot scan them.
  var context = $.GetContextPanel();
  if (context.HPV2PickupStop) context.HPV2PickupStop();
  var stopped = false;
  var topBar = context.BHasClass("HPV2PickupTopBar") ? context : null;
  var profile = context.HPV2Profile;
  var telemetryContext = "";
  if (topBar) {
    try { telemetryContext = typeof context.id === "string" ? context.id : ""; }
    catch (ignored) {}
  }
  var telemetry = topBar ? {
    since: Date.now(), lastReportAt: 0, active: false,
    counts: {
      accepted: 0, envelopeRejected: 0, orderRejected: 0, recordRejected: 0,
      invalidRaw: 0, parseErrors: 0, receiveErrors: 0, tombstones: 0,
      expiredRecords: 0, duplicateSourceNameChecks: 0, duplicateRowNameChecks: 0,
      sequenceGaps: 0
    },
    queueToHudMs: { samples: 0, sum: 0, max: 0 }
  } : null;
  if (telemetry) telemetry.lastReportAt = telemetry.since;
  function telemetryCount(name, amount) {
    if (!telemetry) return;
    telemetry.counts[name] += amount === undefined ? 1 : amount;
    telemetry.active = true;
  }
  function reportTelemetry(now, final) {
    if (!telemetry || !telemetry.active || (!final && now - telemetry.lastReportAt < 30000)) return;
    telemetry.lastReportAt = now;
    try {
      $.Msg("[test_hpv2][telemetry-v1] " + JSON.stringify({
        role: "hud", context: telemetryContext, source: "",
        since: telemetry.since, at: now, final: !!final,
        counts: telemetry.counts, queueToHudMs: telemetry.queueToHudMs
      }));
    } catch (ignored) {}
  }
  var rows = [];
  var progressTickPending = false;
  var sourceId = "";
  var receivedRecords = Object.create(null);
  var listener = null;
  var namePanel = null;
  var effectsPanel = null;
  var statusContainer = null;
  var clipCaptures = [];
  var progressDirty = false;
  var lastPublishedName = null;
  var lastPublishedMask = -1;
  var lastPublishedAt = 0;
  var gameTimePanel = null;
  var lastGameTime = null;
  var scanEnabled = true;
  var gateReceivedAt = 0;
  var localPlayerName = "";
  var localPlayerLabels = [];
  var sessionStartedAt = 0;
  var pausePanel = null;
  var pauseIntervals = [];
  var paused = false;
  var worldUltimate = null;
  var worldUltimateFill = null;
  var worldUltimateHost = null;
  var ultimateReceivedAt = 0;
  var ultimateName = "";
  var ultimateAngle = null;
  var ultimateTraceCount = 0;
  var ultimateWorldTrace = "";
  function unlockAngle(raw) {
    var text = String(raw || "").replace(/<[^>]*>/g, "").replace(/[\s\u00a0\u202f]/g, "").toUpperCase();
    if (/^\d{1,3}(?:,\d{3})+$/.test(text)) text = text.replace(/,/g, "");
    var match = /^(\d+(?:[.,]\d+)?)([KM]?)$/.exec(text);
    if (!match) return null;
    var souls = Number(match[1].replace(",", ".")) * (match[2] === "K" ? 1000 : match[2] === "M" ? 1000000 : 1);
    return isFinite(souls) ? Math.max(0, Math.min(1, (souls - 600) / 3200)) * 360 : null;
  }


  function parseUltimateClip(raw) {
    var match = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(\d+(?:\.\d+)?)deg\s*\)$/.exec(raw);
    var angle = match ? Number(match[1]) : NaN;
    return isFinite(angle) && angle >= 0 && angle <= 360 ? angle : null;
  }

  function validUltimates(message, now, since, previousAt) {
    if (!message || message.magic_word !== "HPV2_ULTIMATE_SNAPSHOT" ||
        typeof message.at !== "number" || !isFinite(message.at) ||
        message.at > now || now - message.at >= 4000 || message.at < previousAt ||
        message.since !== since || !Array.isArray(message.players) || message.players.length > 12) return false;
    var names = Object.create(null);
    for (var index = 0; index < message.players.length; index++) {
      var item = message.players[index];
      if (!Array.isArray(item) || item.length !== 2 ||
          typeof item[0] !== "string" || !item[0] || item[0].length > 256 ||
          item[0] !== item[0].trim().toUpperCase() || names[item[0]] ||
          typeof item[1] !== "number" || !isFinite(item[1]) ||
          item[1] < 0 || item[1] > 360) return false;
      names[item[0]] = true;
    }
    return true;
  }

  function hideWorldUltimate() {
    if (valid(worldUltimateFill) && ultimateAngle !== null) worldUltimateFill.style.clip = "radial(50% 50%, 0deg, 0deg)";
    ultimateName = "";
    ultimateAngle = null;
  }

  function discoverWorldUltimate() {
    if (!valid(worldUltimateHost)) worldUltimateHost = context.FindChildTraverse("UnitInfoContainer");
    if (!valid(worldUltimateHost)) return false;
    if (!valid(namePanel)) namePanel = context.FindChildTraverse("name");
    var name = readName(namePanel);
    var show = context.BAscendantHasClass("CLASS_PLAYER") &&
      !context.BAscendantHasClass("LocalPlayer") && !(name && name === localPlayerName);
    if (worldUltimateHost.BHasClass("HPV2UltimateHost") !== show) worldUltimateHost.SetHasClass("HPV2UltimateHost", show);
    if (!show) {
      hideWorldUltimate();
      return false;
    }
    if (!valid(worldUltimate)) {
      worldUltimate = worldUltimateHost.FindChildTraverse("unit_info_bg");
      worldUltimateFill = null;
      ultimateAngle = null;
      ultimateName = "";
    }
    if (valid(worldUltimate) && !valid(worldUltimateFill)) {
      worldUltimateFill = worldUltimate.FindChildTraverse("HPV2UltimateProgress");
      if (valid(worldUltimateFill)) worldUltimateFill.style.clip = "radial(50% 50%, 0deg, 0deg)";
    }
    return !!valid(worldUltimateFill);
  }

  function receiveUltimates(message, now) {
    if (!validUltimates(message, now, sessionStartedAt, ultimateReceivedAt)) {
      profile.count("ultimateRejected");
      return;
    }
    if (!discoverWorldUltimate()) {
      profile.count("ultimatePanelMissing");
      return;
    }
    profile.count("ultimateReceived");
    if (!valid(namePanel)) namePanel = context.FindChildTraverse("name");
    var name = readName(namePanel);
    var angle = null;
    for (var index = 0; index < message.players.length; index++) {
      if (message.players[index][0] === name) angle = message.players[index][1];
    }
    ultimateReceivedAt = message.at;
    if (angle === null || !name || name === localPlayerName) {
      profile.count("ultimateUnmatched");
      hideWorldUltimate();
      return;
    }
    if (ultimateAngle !== angle) worldUltimateFill.style.clip = "radial(50% 50%, 0deg, " + angle + "deg)";
    if (ultimateTraceCount < 120) {
      var nativeReady = worldUltimate.FindChildTraverse("unit_ult_ready_icon");
      var trace = JSON.stringify({ role: "world", source: sourceId, angle: angle,
        clip: String(worldUltimateFill.style.clip || ""),
        nativeOpacity: valid(nativeReady) ? String(nativeReady.style.opacity || "") : "missing",
        nativeVisibility: valid(nativeReady) ? String(nativeReady.style.visibility || "") : "missing" });
      if (trace !== ultimateWorldTrace) {
        ultimateWorldTrace = trace;
        ultimateTraceCount++;
        $.Msg("[test_hpv2][ultimate-state] " + trace);
      }
    }
    if (!ultimateName) profile.count("ultimateShown");
    ultimateAngle = angle;
    ultimateName = name;
  }

  function ultimateTick() {
    if (stopped || !valid(context)) return;
    try {
      var counts = Object.create(null);
      var players = [];
      for (var local = 0; local < localPlayerLabels.length; local++) {
        var localName = readName(localPlayerLabels[local]);
        if (localName) counts[localName] = (counts[localName] || 0) + 1;
      }
      for (var index = 0; index < rows.length; index++) {
        var row = rows[index];
        var name = row.ultimateName = readName(row.label);
        if (name) counts[name] = (counts[name] || 0) + 1;
      }
      for (var next = 0; next < rows.length; next++) {
        var current = rows[next];
        var player = current.ultimateName;
        if (!player || player.length > 256 || counts[player] !== 1 ||
            !valid(current.ultimate) || current.label.BAscendantHasClass("LocalPlayer") ||
            current.label.BAscendantHasClass("Dead") || current.label.BAscendantHasClass("Disconnected")) continue;
        var angle = null;
        if (current.label.BAscendantHasClass("UltimateUnlocked")) {
          if (current.label.BAscendantHasClass("UltimateCooldownReady")) angle = 360;
          else {
            if (!valid(current.ultimateBackground)) current.ultimateBackground = current.ultimate.FindChildTraverse("UltimateStatusBG");
            angle = valid(current.ultimateBackground) ? parseUltimateClip(String(current.ultimateBackground.style.clip || "")) : null;
          }
        } else if (valid(current.owner)) {
          if (!valid(current.souls)) current.souls = current.owner.FindChildTraverse("SoulsValue");
          angle = valid(current.souls) ? unlockAngle(current.souls.text) : null;
        }
        if (ultimateTraceCount < 120) {
          if (!valid(current.ultimateBackground)) current.ultimateBackground = current.ultimate.FindChildTraverse("UltimateStatusBG");
          var trace = JSON.stringify({ role: "hud", row: current.owner.id,
            unlocked: current.label.BAscendantHasClass("UltimateUnlocked"),
            ready: current.label.BAscendantHasClass("UltimateCooldownReady"),
            nativeClip: valid(current.ultimateBackground) ? String(current.ultimateBackground.style.clip || "") : "missing",
            angle: angle });
          if (trace !== current.ultimateTrace) {
            current.ultimateTrace = trace;
            ultimateTraceCount++;
            $.Msg("[test_hpv2][ultimate-state] " + trace);
          }
        }
        if (angle !== null) players.push([player, angle]);
      }
      profile.count("ultimatePublishedPlayers", players.length);
      if (players.length <= 12) $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "HPV2_ULTIMATE_SNAPSHOT", since: sessionStartedAt, at: Date.now(), players: players
      }));
    } catch (error) {
      $.Msg("[test_hpv2][ultimate-error] " + String(error));
    }
    $.Schedule(1, ultimateTick);
  }
  // Observation heartbeat plus HUD cleanup, with room for delayed updates.
  // Freshness is wall time even while the buff countdown is paused.
  var ttl = 24000;
  // Stock citadel_base_styles colors; JS style setters require literal colors, not @define names.
  var pickups = [
    { className: "gunpower_pickup", image: "powerup_gun", color: "#EC9719", background: "#472D08" },
    { className: "movement_pickup", image: "powerup_movement", color: "#6e65ea", background: "#211E46" },
    { className: "casting_pickup", image: "powerup_spirit", color: "#CE90FF", background: "#3E2B4C" },
    { className: "survival_pickup", image: "powerup_survival", color: "#7BBA1D", background: "#253809" }
  ];

  function valid(panel) {
    profile.count("validCalls");
    return panel && panel.IsValid();
  }

  function readName(panel) {
    if (!valid(panel) || typeof panel.text !== "string") return "";
    var name = panel.text;
    return name.trim() && name !== "{s:name}" && name !== "{s:player_name}" ? name.trim().toUpperCase() : "";
  }

  function snapshotRoot() {
    var root = context;
    for (var depth = 0; depth < 24; depth++) {
      var parent = root.GetParent();
      if (!valid(parent) || parent === root) return root;
      root = parent;
    }
    throw new Error("Pickup snapshot root exceeds 24 ancestors");
  }

  function publish(name, mask) {
    if (!name) clipCaptures = [];
    if (!sourceId || !context.HPV2QueuePickup) return;
    var now = Date.now();
    var changed = name !== lastPublishedName || mask !== lastPublishedMask || progressDirty;
    if (!changed && now >= lastPublishedAt && now - lastPublishedAt < 6000) {
      profile.count("publicationCacheHits");
      return;
    }
    // Same-context handoff; serialize only at the sibling boundary.
    context.HPV2QueuePickup(name ? {
      name: name, mask: mask, at: now,
      progress: pickups.map(function (_, bit) {
        var capture = clipCaptures[bit];
        return mask & (1 << bit) && capture ? capture.progress : null;
      })
    } : null);
    lastPublishedName = name;
    lastPublishedMask = mask;
    lastPublishedAt = now;
    progressDirty = false;
  }

  function parseNativeClip(raw) {
    var match = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(-?\d+(?:\.\d+)?)deg\s*\)$/.exec(raw);
    var angle = match ? Number(match[1]) : NaN;
    return isFinite(angle) && angle >= -360 && angle <= 0 ? angle : null;
  }

  function fitProgress(first, previous, last) {
    var elapsed = (last.at - first.at) / 1000;
    var before = (previous.at - first.at) / 1000;
    var after = (last.at - previous.at) / 1000;
    if (before <= 0 || after <= 0) return { angle: last.angle, rate: 0, at: last.at };
    var rate = (last.angle - first.angle) / elapsed;
    var firstRate = (previous.angle - first.angle) / before;
    var lastRate = (last.angle - previous.angle) / after;
    // Refuse a countdown across a pause, refresh, or inconsistent native samples.
    if (rate <= 0 || rate > 360 || Math.abs(firstRate - lastRate) > rate * 0.1) rate = 0;
    return { angle: last.angle, rate: rate, at: last.at };
  }

  function captureNativeClip(panel, bit, name) {
    var capture = clipCaptures[bit];
    var now = Date.now();
    if (!capture || !valid(capture.panel) || capture.panel !== panel || capture.name !== name) {
      capture = { panel: panel, name: name, count: 0, border: null, first: null, previous: null, progress: null };
      clipCaptures[bit] = capture;
    }
    // Only present buffs read their cached radial, on the existing three-second scan.
    // Sliding native samples catch refreshes and pauses without assuming a duration.
    try {
      if (!valid(capture.border)) capture.border = panel.FindChildTraverse("StatusEffectsBorder");
      profile.count("nativeClipSamples");
      var angle = valid(capture.border) ? parseNativeClip(String(capture.border.style.clip || "")) : null;
      if (angle === null) throw new Error("Native radial unavailable");
      var point = { angle: angle, at: now };
      capture.count = Math.min(3, capture.count + 1);
      capture.progress = capture.count === 3 ?
        fitProgress(capture.first, capture.previous, point) : { angle: angle, rate: 0, at: now };
      if (capture.count === 1) capture.first = point;
      else if (capture.count === 3) capture.first = capture.previous;
      capture.previous = point;
      progressDirty = true;
    } catch (error) {
      capture.progress = null;
      capture.count = 0;
      capture.first = capture.previous = null;
      progressDirty = true;
      $.Msg("[test_hpv2][pickup-clip-error] " + String(error));
    }
  }

  function validProgress(progress, mask, at) {
    if (!Array.isArray(progress) || progress.length !== pickups.length) return false;
    for (var bit = 0; bit < progress.length; bit++) {
      var item = progress[bit];
      if (item === null) continue;
      if (!(mask & (1 << bit)) || !item ||
          typeof item.angle !== "number" || !isFinite(item.angle) || item.angle < -360 || item.angle > 0 ||
          typeof item.rate !== "number" || !isFinite(item.rate) || item.rate < 0 || item.rate > 360 ||
          typeof item.at !== "number" || !isFinite(item.at) || item.at > at ||
          item.at < 0 || at - item.at > ttl) return false;
    }
    return true;
  }

  function sampleUnit() {
    // Stale or missing control always permits scanning.
    if (!scanEnabled && Date.now() >= gateReceivedAt && Date.now() - gateReceivedAt < 15000) {
      profile.count("scanGateSkips");
      publish("", 0);
      return;
    }
    var world = context;
    while (valid(world) && !world.BHasClass("CLASS_PLAYER")) world = world.GetParent();
    if (!valid(world) || !world.id) {
      publish("", 0);
      return;
    }
    profile.start();
    profile.count("playerScans");
    if (sourceId !== world.id) {
      if (sourceId) publish("", 0);
      sourceId = world.id;
      namePanel = effectsPanel = statusContainer = null;
      clipCaptures = [];
      lastPublishedName = null;
      lastPublishedMask = -1;
      lastPublishedAt = 0;
    }
    if (!valid(namePanel)) namePanel = context.FindChildTraverse("name");
    var name = readName(namePanel);
    var now = Date.now();
    if (name && name === localPlayerName && now >= gateReceivedAt && now - gateReceivedAt < 15000) {
      profile.count("localPlayerScanSkips");
      clipCaptures.length = 0;
      if (lastPublishedName) publish("", 0);
      return;
    }
    if (!valid(effectsPanel)) {
      effectsPanel = context.FindChildTraverse("StatusEffects");
      statusContainer = null;
    }
    if (!valid(statusContainer) && valid(effectsPanel))
      statusContainer = effectsPanel.FindChildTraverse("StatusEffectContainer");
    var container = statusContainer;
    if (!name || !valid(container)) {
      publish("", 0);
      return;
    }
    var mask = 0;
    for (var bit = 0; bit < pickups.length; bit++) {
      var matches = container.FindChildrenWithClassTraverse(pickups[bit].className);
      profile.count("pickupClassSearches");
      profile.count("pickupMatches", matches.length);
      for (var match = 0; match < matches.length; match++) {
        if (valid(matches[match]) && matches[match].visible !== false) {
          mask |= 1 << bit;
          captureNativeClip(matches[match], bit, name);
          break;
        }
      }
      if (!(mask & (1 << bit))) clipCaptures[bit] = null;
    }
    publish(name, mask);
  }

  function mayContainScanGate(raw) {
    // Escaped keys/values must still reach JSON parsing and full gate validation.
    return raw.indexOf("HPV2_PICKUP_SCAN_GATE") >= 0 || raw.indexOf("HPV2_ULTIMATE_SNAPSHOT") >= 0 || raw.indexOf("\\") >= 0;
  }

  function receiveSnapshot(raw) {
    if (stopped || !valid(context)) return false;
    try {
      if (typeof raw !== "string" || raw.length > 4096) {
        telemetryCount("invalidRaw");
        return false;
      }
      if (!topBar && !mayContainScanGate(raw)) {
        profile.count("worldMessagesSkipped");
        profile.count("worldCharsSkipped", raw.length);
        return false;
      }
      var message;
      try {
        message = JSON.parse(raw);
        profile.count("parsedMessages");
        profile.count("parsedChars", raw.length);
      } catch (error) {
        telemetryCount("parseErrors");
        $.Msg("[test_hpv2][pickup-receive-error] " + String(error));
        return false;
      }
      var now = Date.now();
      if (!topBar) {
        if (message && message.magic_word === "HPV2_ULTIMATE_SNAPSHOT") {
          receiveUltimates(message, now);
          return false;
        }
        if (message && message.magic_word === "HPV2_PICKUP_SCAN_GATE" &&
            typeof message.scan === "boolean" && typeof message.at === "number" &&
            typeof message.localName === "string" && message.localName.length <= 256 &&
            isFinite(message.at) && message.at <= now && now - message.at < 15000 &&
            typeof message.since === "number" && isFinite(message.since) &&
            message.since >= sessionStartedAt && message.since <= message.at &&
            message.at >= gateReceivedAt) {
          if (message.since > sessionStartedAt) {
            sessionStartedAt = message.since;
            publish("", 0);
            hideWorldUltimate();
            ultimateReceivedAt = 0;
          }
          scanEnabled = message.scan;
          localPlayerName = message.localName.trim().toUpperCase();
          gateReceivedAt = message.at;
        }
        profile.count("worldMessages");
        return false;
      }
      if (!message || message.magic_word !== "HPV2_PICKUP_SNAPSHOT") return false;
      if (typeof message.source !== "string" || !message.source || message.source.length > 256 ||
          typeof message.instance !== "string" || message.instance.length > 200 ||
          !Number.isSafeInteger(message.seq) || message.seq < 1 ||
          typeof message.at !== "number" || !isFinite(message.at) ||
          message.at < sessionStartedAt || message.at > now || now - message.at > ttl) {
        telemetryCount("envelopeRejected");
        return false;
      }
      var previous = receivedRecords[message.source];
      if (previous && (message.at < previous.sentAt ||
          (message.instance === previous.instance && message.seq <= previous.seq))) {
        telemetryCount("orderRejected");
        return false;
      }
      var record = message.record;
      if (record !== null && (!record || typeof record.name !== "string" ||
          !record.name.trim() || record.name.length > 256 ||
          typeof record.mask !== "number" || record.mask !== (record.mask & 15) ||
          typeof record.at !== "number" || !isFinite(record.at) ||
          record.at < sessionStartedAt || record.at > message.at || now - record.at > ttl ||
          (previous && record.at < previous.at) ||
          !validProgress(record.progress, record.mask, record.at))) {
        telemetryCount("recordRejected");
        return false;
      }
      if (previous && message.instance === previous.instance && message.seq > previous.seq + 1)
        telemetryCount("sequenceGaps", message.seq - previous.seq - 1);
      receivedRecords[message.source] = {
        name: record ? record.name.trim().toUpperCase() : "",
        mask: record ? record.mask : 0, at: record ? record.at : message.at,
        sentAt: message.at, instance: message.instance, seq: message.seq,
        progress: record ? record.progress : null
      };
      telemetryCount("accepted");
      if (record === null) telemetryCount("tombstones");
      if (telemetry) {
        var queueToHud = now - message.at;
        telemetry.queueToHudMs.samples++;
        telemetry.queueToHudMs.sum += queueToHud;
        if (queueToHud > telemetry.queueToHudMs.max) telemetry.queueToHudMs.max = queueToHud;
      }
      var next = receivedRecords[message.source];
      // Use cached rows here; discovery and stale cleanup remain on the slow tick.
      updatePause(now);
      renderRows(next.name, previous ? previous.name : "");
    } catch (error) {
      telemetryCount("receiveErrors");
      $.Msg("[test_hpv2][pickup-receive-error] " + String(error));
    }
    return false;
  }

  function readUnits(affectedName, previousName) {
    var records = receivedRecords;
    var units = Object.create(null);
    var now = Date.now();
    for (var key in records) {
      var record = records[key];
      profile.count("recordVisits");
      if (record.at > now || now - record.at > ttl) {
        telemetryCount("expiredRecords");
        delete records[key];
        continue;
      }
      if (!record.name || (affectedName !== undefined && record.name !== affectedName && record.name !== previousName)) continue;
      profile.count("groupedRecords");
      if (units[record.name]) telemetryCount("duplicateSourceNameChecks");
      units[record.name] = units[record.name] ? -1 : record;
    }
    return units;
  }

  function findRows() {
    var next = [];
    localPlayerLabels.length = 0;
    var labels = topBar.FindChildrenWithClassTraverse("PlayerName");
    profile.count("topbarLabels", labels.length);
    for (var index = 0; index < labels.length; index++) {
      var label = labels[index];
      if (!valid(label)) continue;
      var owner = label.GetParent();
      while (valid(owner) && owner !== topBar && owner.paneltype !== "CitadelHudTopBarPlayer") {
        owner = owner.GetParent();
      }
      if (!valid(owner) || owner === topBar) continue;
      if (owner.BHasClass("LocalPlayer")) {
        localPlayerLabels.push(label);
        profile.count("localPlayerRowSkips");
        continue;
      }
      var ultimate = owner.FindChildTraverse("UltimateStatus");
      profile.count("ultimateSearches");
      if (!valid(ultimate)) continue;
      var row = null;
      for (var old = 0; old < rows.length; old++) {
        if (rows[old].label === label && rows[old].ultimate === ultimate) row = rows[old];
      }
      next.push(row || { label: label, owner: owner, ultimate: ultimate, container: null, icons: [], rings: [], progressModels: [], mask: -1 });
      profile.count(row ? "rowReuses" : "newRows");
    }
    for (var previous = 0; previous < rows.length; previous++) {
      if (next.indexOf(rows[previous]) < 0) render(rows[previous], 0);
    }
    rows = next;
  }

  function updatePause(now) {
    var next = valid(pausePanel) && pausePanel.BAscendantHasClass("gameIsPaused");
    if (!!next !== paused) profile.count(next ? "pauseStarts" : "pauseEnds");
    if (next && !paused) pauseIntervals.push({ start: now, end: null });
    else if (!next && paused) pauseIntervals[pauseIntervals.length - 1].end = now;
    paused = !!next;
    while (pauseIntervals.length && pauseIntervals[0].end !== null && pauseIntervals[0].end < now - ttl)
      pauseIntervals.shift();
  }

  function progressAngle(progress, now, pauses) {
    var elapsed = Math.max(0, now - progress.at);
    for (var index = 0; index < pauses.length; index++) {
      var interval = pauses[index];
      elapsed -= Math.max(0, Math.min(now, interval.end === null ? now : interval.end) -
        Math.max(progress.at, interval.start));
    }
    return Math.min(0, progress.angle + progress.rate * Math.max(0, elapsed) / 1000);
  }

  function rowUnavailable(row, now, name) {
    var dead = !!name && row.label.BAscendantHasClass("Dead");
    var disconnected = !!name && !dead && row.label.BAscendantHasClass("Disconnected");
    var blocked = !name || dead || disconnected;
    var renamed = row.name !== undefined && row.name !== name;
    if (renamed) profile.count("rowRenames");
    if (blocked && !row.blocked) profile.count(!name ? "emptyNameBlocks" : dead ? "deathBlocks" : "disconnectBlocks");
    if (!blocked && row.blocked) profile.count("rowRecoveries");
    if (blocked || row.blocked || renamed) row.acceptAfter = now;
    row.blocked = blocked;
    row.name = name;
    return blocked || renamed;
  }

  function paintProgress(ring, progress, now) {
    var angle = progressAngle(progress, now, pauseIntervals);
    ring.style.clip = "radial(50% 50%, 0deg, " + angle + "deg)";
    profile.count("clipWrites");
    return progress.rate > 0 && angle < 0;
  }

  function progressTick() {
    progressTickPending = false;
    if (stopped || !valid(context)) return;
    var active = false;
    var now = Date.now();
    updatePause(now);
    for (var index = 0; index < rows.length; index++) {
      var row = rows[index];
      if (rowUnavailable(row, now, readName(row.label))) {
        render(row, 0);
        continue;
      }
      if (!row.mask || !row.progressModels) continue;
      active = true;
      for (var bit = 0; bit < row.rings.length; bit++) {
        var progress = row.progressModels[bit];
        if (!(row.mask & (1 << bit)) || !progress || progress.rate <= 0 ||
            row.progressEnded[bit] || !valid(row.rings[bit])) continue;
        try {
          var running = paintProgress(row.rings[bit], progress, now);
          row.progressEnded[bit] = !running;
        } catch (error) {
          row.progressModels[bit] = null;
          $.Msg("[test_hpv2][topbar-progress-error] " + String(error));
        }
      }
    }
    if (active) {
      progressTickPending = true;
      $.Schedule(1, progressTick);
    }
  }

  function renderProgress(row, bit, progress) {
    var ring = row.rings[bit];
    if (!valid(ring)) return;
    if (row.progressModels[bit] === progress) {
      profile.count("progressCacheHits");
      return;
    }
    row.progressModels[bit] = progress;
    row.progressEnded[bit] = false;
    ring.style.visibility = progress ? "visible" : "collapse";
    if (!progress) return;
    paintProgress(ring, progress, Date.now());
  }

  function render(row, mask, progress) {
    var parent = valid(row.ultimate) ? row.ultimate.GetParent() : null;
    if (!valid(parent)) return;
    if (!valid(row.container)) row.container = parent.FindChildTraverse("HPV2PickupIndicators");
    if (!mask) {
      if (valid(row.container) && row.mask !== 0) row.container.style.visibility = "collapse";
      if (row.mask !== 0) {
        for (var clear = 0; clear < row.rings.length; clear++) renderProgress(row, clear, null);
      }
      row.mask = 0;
      return;
    }
    var complete = valid(row.container) && row.icons.length === pickups.length && row.rings.length === pickups.length;
    for (var check = 0; check < row.icons.length; check++)
      complete = complete && valid(row.icons[check]) && valid(row.rings[check]);
    if (!complete) {
      profile.count("indicatorRebuilds");
      row.container = row.container || $.CreatePanel("Panel", parent, "HPV2PickupIndicators");
      row.container.hittest = false;
      row.container.hittestchildren = false;
      row.container.style.flowChildren = "right";
      row.container.style.height = "22px";
      row.container.style.width = "fit-children";
      row.container.style.marginRight = "2px";
      row.container.style.overflow = "noclip";
      parent.MoveChildBefore(row.container, row.ultimate);
      row.icons = [];
      row.rings = [];
      row.progressModels = [];
      row.progressEnded = [];
      for (var index = 0; index < pickups.length; index++) {
        var id = "HPV2Pickup" + index;
        var icon = row.container.FindChildTraverse(id) || $.CreatePanel("Panel", row.container, id);
        icon.hittest = false;
        icon.style.flowChildren = "none";
        icon.style.width = "22px";
        icon.style.height = "22px";
        icon.style.margin = "0px 1px";
        icon.style.borderRadius = "50%";
        icon.style.backgroundColor = pickups[index].background;
        icon.style.border = "1px solid #111111";
        icon.style.overflow = "noclip";
        var glyph = icon.FindChildTraverse(id + "Glyph") || $.CreatePanel("Image", icon, id + "Glyph");
        glyph.hittest = false;
        glyph.style.width = "14px";
        glyph.style.height = "14px";
        glyph.style.horizontalAlign = "center";
        glyph.style.verticalAlign = "center";
        glyph.style.zIndex = 2;
        glyph.style.washColor = "#10130D";
        glyph.SetImage("s2r://panorama/images/hud/icons/" + pickups[index].image + ".vsvg");
        var ring = icon.FindChildTraverse(id + "Progress") || $.CreatePanel("Panel", icon, id + "Progress");
        ring.hittest = false;
        ring.style.width = "20px";
        ring.style.height = "20px";
        ring.style.horizontalAlign = "left";
        ring.style.verticalAlign = "top";
        ring.style.position = "0px 0px 0px";
        ring.style.margin = "0px";
        ring.style.borderRadius = "50%";
        ring.style.backgroundImage = 'url("s2r://panorama/images/masks/no_mask_png.vtex")';
        ring.style.backgroundSize = "100%";
        ring.style.washColor = pickups[index].color;
        ring.style.opacity = "1";
        ring.style.zIndex = 1;
        ring.style.transitionDuration = "0s";
        ring.style.visibility = "collapse";
        row.rings.push(ring);
        row.icons.push(icon);
      }
      row.mask = -1;
    }
    if (row.mask !== mask) {
      profile.count("maskChanges");
      row.container.style.visibility = mask ? "visible" : "collapse";
      for (var bit = 0; bit < row.icons.length; bit++) {
        row.icons[bit].style.visibility = mask & (1 << bit) ? "visible" : "collapse";
      }
    }
    for (var index = 0; index < row.icons.length; index++)
      renderProgress(row, index, mask & (1 << index) && progress ? progress[index] : null);
    row.mask = mask;
    if (mask && !progressTickPending) {
      progressTickPending = true;
      $.Schedule(1, progressTick);
    }
  }

  function renderRows(affectedName, previousName) {
    var units = readUnits(affectedName, previousName);
    var now = Date.now();
    var counts = Object.create(null);
    for (var local = 0; local < localPlayerLabels.length; local++) {
      var localName = readName(localPlayerLabels[local]);
      if (localName) counts[localName] = (counts[localName] || 0) + 1;
    }
    for (var index = 0; index < rows.length; index++) {
      var name = rows[index].renderName = readName(rows[index].label);
      var previousCount = counts[name] || 0;
      if (previousCount) telemetryCount("duplicateRowNameChecks");
      counts[name] = previousCount + 1;
    }
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      var row = rows[rowIndex];
      var player = row.renderName;
      profile.count("rowVisits");
      if (affectedName !== undefined && player !== affectedName && player !== previousName) continue;
      var unit = player && counts[player] === 1 ? units[player] : null;
      var blocked = rowUnavailable(row, now, player);
      var mask = !blocked && unit && unit !== -1 && unit.at >= (row.acceptAfter || 0) ? unit.mask : 0;
      render(row, mask, unit && unit !== -1 ? unit.progress : null);
    }
  }

  function publishScanGate() {
    if (!valid(gameTimePanel)) gameTimePanel = topBar.FindChildTraverse("GameTime");
    var text = valid(gameTimePanel) ? String(gameTimePanel.text || "").replace(/<[^>]+>/g, "").trim() : "";
    var match = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    var seconds = match && Number(match[3]) < 60 && (!match[1] || Number(match[2]) < 60) ?
      Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
    // Positive map identification is required; unknown modes/clock fail open.
    var normal = topBar.BAscendantHasClass("isDefaultMap") &&
      !topBar.BAscendantHasClass("connectedToHeroTesting") &&
      !topBar.BAscendantHasClass("connectedToTutorial") &&
      !topBar.BAscendantHasClass("connectedToHideout") &&
      !topBar.BAscendantHasClass("gamemode_streetbrawl");
    if (seconds !== null && lastGameTime !== null && seconds < lastGameTime) {
      profile.count("clockResets");
      sessionStartedAt = Date.now();
      receivedRecords = Object.create(null);
      renderRows();
    }
    if (seconds !== null) lastGameTime = seconds;
    var scan = !normal || seconds === null || seconds >= 300;
    var localName = localPlayerLabels.length === 1 ? readName(localPlayerLabels[0]) : "";
    for (var index = 0; localName && index < rows.length; index++) {
      if (readName(rows[index].label) === localName) localName = "";
    }
    if (localName.length > 256) localName = "";
    profile.count(localName ? "localIdentityReady" : "localIdentityUnavailable");
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
      magic_word: "HPV2_PICKUP_SCAN_GATE", scan: scan, localName: localName, since: sessionStartedAt, at: Date.now()
    }));
  }

  context.HPV2PickupStop = function () {
    stopped = true;
    if (listener !== null) {
      try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", listener); }
      catch (error) {
        telemetryCount("receiveErrors");
        $.Msg("[test_hpv2][pickup-receive-error] " + String(error));
      }
      listener = null;
    }
    for (var index = 0; index < rows.length; index++) {
      try { render(rows[index], 0); } catch (ignored) {}
    }
    if (!topBar) {
      try { publish("", 0); } catch (ignored) {}
      try { hideWorldUltimate(); } catch (ignored) {}
      try { if (valid(worldUltimateHost)) worldUltimateHost.RemoveClass("HPV2UltimateHost"); } catch (ignored) {}
    }
    if (topBar) reportTelemetry(Date.now(), true);
    profile.flush(true);
  };

  function tick() {
    if (stopped) return;
    if (!valid(context)) {
      context.HPV2PickupStop();
      return;
    }
    try {
      if (topBar) {
        findRows();
        publishScanGate();
        if (!valid(pausePanel)) pausePanel = snapshotRoot().FindChildTraverse("PausedGameContainer");
        updatePause(Date.now());
        renderRows();
      } else {
        discoverWorldUltimate();
        if (ultimateName && (Date.now() < ultimateReceivedAt || Date.now() - ultimateReceivedAt >= 4000 ||
            readName(namePanel) !== ultimateName)) hideWorldUltimate();
        sampleUnit();
      }
    } catch (error) {
      $.Msg("[test_hpv2] Pickup scan failed: " + error);
      for (var clear = 0; clear < rows.length; clear++) {
        try { render(rows[clear], 0); } catch (ignored) {}
      }
    }
    if (topBar) reportTelemetry(Date.now(), false);
    $.Schedule(topBar ? 5 : 3, tick);
  }

  readName = profile.wrap("readName", readName);
  snapshotRoot = profile.wrap("snapshotRoot", snapshotRoot);
  publish = profile.wrap("publish", publish);
  parseNativeClip = profile.wrap("parseNativeClip", parseNativeClip);
  fitProgress = profile.wrap("fitProgress", fitProgress);
  captureNativeClip = profile.wrap("captureNativeClip", captureNativeClip);
  validProgress = profile.wrap("validProgress", validProgress);
  sampleUnit = profile.wrap("sampleUnit", sampleUnit);
  receiveSnapshot = profile.wrap("receiveSnapshot", receiveSnapshot);
  readUnits = profile.wrap("readUnits", readUnits);
  findRows = profile.wrap("findRows", findRows);
  updatePause = profile.wrap("updatePause", updatePause);
  progressAngle = profile.wrap("progressAngle", progressAngle);
  rowUnavailable = profile.wrap("rowUnavailable", rowUnavailable);
  paintProgress = profile.wrap("paintProgress", paintProgress);
  progressTick = profile.wrap("progressTick", progressTick);
  renderProgress = profile.wrap("renderProgress", renderProgress);
  render = profile.wrap("render", render);
  renderRows = profile.wrap("renderRows", renderRows);
  publishScanGate = profile.wrap("publishScanGate", publishScanGate);
  ultimateTick = profile.wrap("ultimateTick", ultimateTick);
  receiveUltimates = profile.wrap("receiveUltimates", receiveUltimates);
  tick = profile.wrap("tick", tick);

  try { listener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", receiveSnapshot); }
  catch (error) {
    telemetryCount("receiveErrors");
    $.Msg("[test_hpv2][pickup-receive-error] " + String(error));
  }

  tick();
  if (topBar) ultimateTick();
})();
