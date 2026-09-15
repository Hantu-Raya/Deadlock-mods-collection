(() => {
  "use strict";

  // World panels publish their own engine-fed effects. The HUD cannot scan them.
  var context = $.GetContextPanel();
  if (context.HPV2PickupStop) context.HPV2PickupStop();
  var stopped = false;
  var topBar = context.BHasClass("HPV2PickupTopBar") ? context : null;
  var CONFIG_MAGIC = "HP_COLORS_V2_CONFIG";
  var CONFIG_ATTR = "hp_colors_v2_config";
  var CONFIG_VERSION = 2;
  var settingsContract = null;
  if (topBar) {
    if (!$.HPColorsV2ContractFactory || !$.HPColorsV2ContractFactory.create) {
      $.Msg("[test_hpv2][config-error] HUD settings contract unavailable");
      throw new Error("HP Colors v2 settings contract unavailable");
    }
    settingsContract = $.HPColorsV2ContractFactory.create();
    if (!settingsContract || typeof settingsContract.normalizeValues !== "function") {
      $.Msg("[test_hpv2][config-error] invalid HUD settings contract");
      throw new Error("Invalid HP Colors v2 settings contract");
    }
    delete $.HPColorsV2ContractFactory;
  } else if (
    typeof context.HPV2GetNormalizedConfig !== "function" ||
    typeof context.HPV2OnConfigChanged !== "function" ||
    typeof context.HPV2GetUltimateProgressColor !== "function"
  ) {
    $.Msg("[test_hpv2][config-error] renderer config handoff unavailable");
    throw new Error("HP Colors v2 renderer config handoff unavailable");
  }
  var normalizeConfig = topBar ? settingsContract.normalizeValues : null;
  var config = topBar ? normalizeConfig(null) : null;
  var configRoot = null;
  var configRaw = "";
  var configRevision = -1;
  var configUnsubscribe = null;
  var pickupStyleRevision = 0;
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
  var ultimateOverlay = null;
  var ultimateBackground = null;
  var ultimateBackgroundScale = "1";
  var ultimateFill = null;
  var ultimateDark = null;
  var ultimateReady = null;
  var ultimateStyleCache = {};
  var ultimateStylesDirty = true;
  var ultimateName = "";
  var ultimateAt = 0;
  var ultimateAngle = null;

  function parseUltimateClip(raw) {
    var match = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(\d+(?:\.\d+)?)deg\s*\)$/.exec(raw);
    var angle = match ? Number(match[1]) : NaN;
    return isFinite(angle) && angle >= 0 && angle <= 360 ? angle : null;
  }

  function validUltimates(message, now, since, previousAt) {
    if (!message || message.magic_word !== "HPV2_ULTIMATE_SNAPSHOT" ||
        typeof message.at !== "number" || !isFinite(message.at) ||
        message.at > now || now - message.at >= 4000 || message.at < previousAt ||
        message.since !== since || message.at < since ||
        !Array.isArray(message.players) || message.players.length > 12) return false;
    var names = Object.create(null);
    for (var index = 0; index < message.players.length; index++) {
      var item = message.players[index];
      if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string" ||
          !item[0] || item[0].length > 256 || item[0] !== item[0].trim().toUpperCase() ||
          names[item[0]] || typeof item[1] !== "number" || !isFinite(item[1]) ||
          item[1] < 0 || item[1] > 360) return false;
      names[item[0]] = true;
    }
    return true;
  }
  function configFeatureEnabled(key) {
    return config.enabled !== false && config[key] !== false;
  }

  function pickupTimersEnabled() {
    return configFeatureEnabled("pickupTimersEnabled");
  }

  function ultimateTimerEnabled() {
    return configFeatureEnabled("ultimateTimerEnabled");
  }

  function setTimerStyle(panel, property, value, key) {
    if (!valid(panel) || !panel.style) return false;
    var next = value === null || value === undefined ? null : String(value);
    var cacheKey = key || property;
    var cached = ultimateStyleCache[cacheKey];
    if (cached && cached.panel === panel && cached.value === next) return true;
    try {
      panel.style[property] = next;
      ultimateStyleCache[cacheKey] = { panel: panel, value: next };
      return true;
    } catch {
      return false;
    }
  }
  function applyUltimateStyles(angle) {
    if (!ultimateTimerEnabled() || !valid(ultimateOverlay)) return false;
    if (!ultimateStylesDirty && angle === ultimateAngle) return true;
    var successful = true;
    if (ultimateStylesDirty) {
      successful = setTimerStyle(ultimateBackground, "preTransformScale2d", config.ultimateTimerSize / 100) && successful;
      successful = setTimerStyle(ultimateOverlay, "horizontalAlign", "center") && successful;
      successful = setTimerStyle(ultimateOverlay, "verticalAlign", "center") && successful;
      successful = setTimerStyle(
        ultimateDark,
        "brightness",
        String(Math.max(0, 1 - config.ultimateTimerDarkness / 100)),
      ) && successful;
    }
    var progressAngle = angle === undefined ? ultimateAngle : angle;
    if (progressAngle !== null && progressAngle !== undefined) {
      var color = context.HPV2GetUltimateProgressColor(progressAngle);
      successful = setTimerStyle(
        ultimateFill,
        "washColor",
        color,
        "ultimateFillWashColor",
      ) && successful;
      successful = setTimerStyle(
        ultimateDark,
        "washColor",
        color,
        "ultimateDarkWashColor",
      ) && successful;
    }
    ultimateStylesDirty = !successful;
    return successful;
  }

  function clearUltimate() {
    ultimateStylesDirty = true;
    if (valid(ultimateOverlay) && !setTimerStyle(ultimateOverlay, "visibility", "collapse")) return;
    if (valid(ultimateBackground) && !setTimerStyle(ultimateBackground, "preTransformScale2d", ultimateBackgroundScale)) return;
    ultimateName = "";
    ultimateAngle = null;
  }

  function receiveUltimates(message, now) {
    if (!ultimateTimerEnabled()) {
      if (ultimateName) clearUltimate();
      return;
    }
    if (!context.BAscendantHasClass("CLASS_PLAYER") || context.BAscendantHasClass("LocalPlayer")) {
      if (ultimateName) clearUltimate();
      return;
    }
    if (!validUltimates(message, now, sessionStartedAt, ultimateAt)) return;
    ultimateAt = message.at;
    if (!valid(namePanel)) namePanel = context.FindChildTraverse("name");
    var name = readName(namePanel);
    var angle = null;
    if (name !== localPlayerName) {
      for (var index = 0; index < message.players.length; index++) {
        if (message.players[index][0] === name) angle = message.players[index][1];
      }
    }
    if (angle === null) { clearUltimate(); return; }
    if (!valid(ultimateOverlay)) {
      if (valid(ultimateBackground) && !setTimerStyle(ultimateBackground, "preTransformScale2d", ultimateBackgroundScale)) return;
      ultimateOverlay = context.FindChildTraverse("HPV2UltimateOverlay");
      ultimateBackground = valid(ultimateOverlay) ? ultimateOverlay.GetParent() : null;
      ultimateBackgroundScale = valid(ultimateBackground) ? ultimateBackground.style.preTransformScale2d || "1" : "1";
      ultimateFill = null;
      ultimateDark = null;
      ultimateReady = null;
      ultimateStyleCache = {};
      ultimateName = "";
    }
    if (!valid(ultimateOverlay)) { clearUltimate(); return; }
    if (!valid(ultimateReady)) ultimateReady = ultimateBackground.FindChildTraverse("unit_ult_ready_icon");
    if (!valid(ultimateReady) || ultimateReady.visible !== false) { clearUltimate(); return; }
    if (!valid(ultimateFill) || !valid(ultimateDark)) {
      ultimateFill = ultimateOverlay.FindChildTraverse("HPV2UltimateFill");
      ultimateDark = ultimateOverlay.FindChildTraverse("HPV2UltimateDark");
      ultimateAngle = null;
      ultimateStylesDirty = true;
    }
    if (!valid(ultimateFill)) { clearUltimate(); return; }
    if (!applyUltimateStyles(angle)) return;
    if (ultimateAngle !== angle) {
      if (!setTimerStyle(ultimateFill, "clip", "radial(50% 50%, 0deg, " + angle + "deg)"))
        return;
      ultimateAngle = angle;
    }
    if (!ultimateName && !setTimerStyle(ultimateOverlay, "visibility", "visible")) return;
    ultimateName = name;
  }

  function ultimateTick() {
    if (stopped || !valid(context)) return;
    if (!ultimateTimerEnabled()) {
      $.Schedule(1, ultimateTick);
      return;
    }
    try {
      var names = Object.create(null);
      var players = [];
      for (var local = 0; local < localPlayerLabels.length; local++) {
        var localName = readName(localPlayerLabels[local]);
        if (localName) names[localName] = (names[localName] || 0) + 1;
      }
      for (var index = 0; index < rows.length; index++) {
        rows[index].ultimateName = readName(rows[index].label);
        var name = rows[index].ultimateName;
        if (name) names[name] = (names[name] || 0) + 1;
      }
      for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        var row = rows[rowIndex];
        var player = row.ultimateName;
        if (!player || player.length > 256 || names[player] !== 1 || !valid(row.ultimate) ||
            row.label.BAscendantHasClass("LocalPlayer") || row.label.BAscendantHasClass("Dead") ||
            row.label.BAscendantHasClass("Disconnected")) continue;
        var angle = 0;
        if (row.label.BAscendantHasClass("UltimateUnlocked")) {
          if (!valid(row.ultimateBackground)) row.ultimateBackground = row.ultimate.FindChildTraverse("UltimateStatusBG");
          angle = row.label.BAscendantHasClass("UltimateCooldownReady") ? 360 :
            valid(row.ultimateBackground) ? parseUltimateClip(String(row.ultimateBackground.style.clip || "")) : null;
        }
        if (angle !== null) players.push([player, angle]);
      }
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
  var pickups = [
    { className: "gunpower_pickup", image: "powerup_gun", configKey: "pickupGunColor" },
    { className: "movement_pickup", image: "powerup_movement", configKey: "pickupMovementColor" },
    { className: "casting_pickup", image: "powerup_spirit", configKey: "pickupSpiritColor" },
    { className: "survival_pickup", image: "powerup_survival", configKey: "pickupSurvivalColor" }
  ];

  function setCachedStyle(panel, property, value, cache, key) {
    if (!valid(panel) || !panel.style) return false;
    var next = value === null || value === undefined ? null : String(value);
    if (cache && cache[key] === next) return true;
    try {
      panel.style[property] = next;
      if (cache) cache[key] = next;
      return true;
    } catch {
      return false;
    }
  }

  function pickupColor(index) {
    return config[pickups[index].configKey];
  }

  function pickupBackground(index) {
    var color = pickupColor(index);
    var brightness = Math.max(
      0,
      Math.min(1, 1 - config.pickupBackgroundDarkness / 100),
    );
    var value = parseInt(color.slice(1), 16);
    var red = Math.round(((value >> 16) & 255) * brightness);
    var green = Math.round(((value >> 8) & 255) * brightness);
    var blue = Math.round((value & 255) * brightness);
    return (
      "#" +
      ((1 << 24) | (red << 16) | (green << 8) | blue)
        .toString(16)
        .slice(1)
        .toUpperCase()
    );
  }

  function pickupSlot(mask, index) {
    if (!(mask & (1 << index))) return 0;
    var count = 0;
    var rank = 0;
    for (var bit = 0; bit < 4; bit++) {
      if (!(mask & (1 << bit))) continue;
      count++;
      if (bit < index) rank++;
    }
    var leftCount = Math.ceil(count / 2);
    return rank < leftCount ? rank - leftCount : rank - leftCount + 1;
  }

  function applyPickupStyles(row, mask) {
    if (!row || !valid(row.container) || !valid(row.left) || !valid(row.right)) return false;
    if (row.styleRevision === pickupStyleRevision && row.layoutMask === mask) return true;
    var cache = row.styleCache || (row.styleCache = {});
    var size = config.pickupSize;
    var glyphSize = Math.round(size * 14 / 22);
    var ringSize = size - 2;
    var successful = true;
    successful = setCachedStyle(row.container, "flowChildren", "right", cache, "flowChildren") && successful;
    successful = setCachedStyle(row.container, "width", "fit-children", cache, "width") && successful;
    successful = setCachedStyle(row.container, "height", "fit-children", cache, "height") && successful;
    successful = setCachedStyle(row.container, "horizontalAlign", "center", cache, "horizontalAlign") && successful;
    successful = setCachedStyle(row.container, "overflow", "noclip", cache, "overflow") && successful;
    successful = setCachedStyle(row.left, "flowChildren", "right", cache, "leftFlow") && successful;
    successful = setCachedStyle(row.right, "flowChildren", "right", cache, "rightFlow") && successful;
    successful = setCachedStyle(row.left, "height", "fit-children", cache, "leftHeight") && successful;
    successful = setCachedStyle(row.right, "height", "fit-children", cache, "rightHeight") && successful;
    successful = setCachedStyle(row.left, "overflow", "noclip", cache, "leftOverflow") && successful;
    successful = setCachedStyle(row.right, "overflow", "noclip", cache, "rightOverflow") && successful;
    if (valid(row.cooldown))
      successful = setCachedStyle(row.cooldown, "horizontalAlign", "center", cache, "cooldownAlign") && successful;
    row.container.MoveChildBefore(row.left, row.ultimate);
    row.container.MoveChildAfter(row.right, row.ultimate);
    var slots = 0;
    for (var slotIndex = 0; slotIndex < row.icons.length; slotIndex++)
      slots = Math.max(slots, Math.abs(pickupSlot(mask, slotIndex)));
    var wingWidth = slots * (size + 2 * config.pickupSpacing) + "px";
    var transform = "translateX(" + config.pickupOffsetX + "px) translateY(" + config.pickupOffsetY + "px)";
    successful = setCachedStyle(row.left, "width", wingWidth, cache, "leftWidth") && successful;
    successful = setCachedStyle(row.right, "width", wingWidth, cache, "rightWidth") && successful;
    successful = setCachedStyle(row.left, "transform", transform, cache, "leftTransform") && successful;
    successful = setCachedStyle(row.right, "transform", transform, cache, "rightTransform") && successful;
    var previousLeft = null;
    var previousRight = null;
    for (var index = 0; index < row.icons.length; index++) {
      var icon = row.icons[index];
      var glyph = row.glyphs[index];
      var ring = row.rings[index];
      var slot = pickupSlot(mask, index);
      var wing = slot > 0 ? row.right : row.left;
      if (icon.GetParent() !== wing) icon.SetParent(wing);
      var previous = slot > 0 ? previousRight : previousLeft;
      if (previous) wing.MoveChildAfter(icon, previous);
      if (slot > 0) previousRight = icon;
      else previousLeft = icon;
      successful = setCachedStyle(icon, "width", size + "px", cache, "iconWidth" + index) && successful;
      successful = setCachedStyle(icon, "height", size + "px", cache, "iconHeight" + index) && successful;
      successful = setCachedStyle(
        icon,
        "margin",
        "0px " + config.pickupSpacing + "px",
        cache,
        "iconMargin" + index,
      ) && successful;
      successful = setCachedStyle(icon, "backgroundColor", pickupBackground(index), cache, "iconBackground" + index) && successful;
      successful = setCachedStyle(glyph, "width", glyphSize + "px", cache, "glyphWidth" + index) && successful;
      successful = setCachedStyle(glyph, "height", glyphSize + "px", cache, "glyphHeight" + index) && successful;
      successful = setCachedStyle(glyph, "washColor", config.pickupGlyphColor, cache, "glyphColor" + index) && successful;
      successful = setCachedStyle(ring, "width", ringSize + "px", cache, "ringWidth" + index) && successful;
      successful = setCachedStyle(ring, "height", ringSize + "px", cache, "ringHeight" + index) && successful;
      successful = setCachedStyle(ring, "washColor", pickupColor(index), cache, "ringColor" + index) && successful;
    }
    if (successful) {
      row.styleRevision = pickupStyleRevision;
      row.layoutMask = mask;
    }
    return successful;
  }
  function valid(panel) { return panel && panel.IsValid(); }

  function readName(panel) {
    if (!valid(panel) || typeof panel.text !== "string") return "";
    var name = panel.text;
    return name === "{s:name}" || name === "{s:player_name}" ? "" : name.trim().toUpperCase();
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
    if (name === lastPublishedName && mask === lastPublishedMask && !progressDirty &&
        now >= lastPublishedAt && now - lastPublishedAt < 6000) return;
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
    if (!pickupTimersEnabled()) {
      clipCaptures.length = 0;
      if (lastPublishedName) publish("", 0);
      return;
    }
    // Stale or missing control always permits scanning.
    if (!scanEnabled && Date.now() >= gateReceivedAt && Date.now() - gateReceivedAt < 15000) {
      publish("", 0);
      return;
    }
    var world = context;
    while (valid(world) && !world.BHasClass("CLASS_PLAYER")) world = world.GetParent();
    if (!valid(world) || !world.id) {
      publish("", 0);
      return;
    }
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

  function mayContainSnapshot(raw, isHud) {
    // Escaped keys/values still require JSON parsing and full message validation.
    return (isHud
      ? raw.indexOf("HPV2_PICKUP_SNAPSHOT") >= 0 || raw.indexOf(CONFIG_MAGIC) >= 0
      : raw.indexOf("HPV2_PICKUP_SCAN_GATE") >= 0 || raw.indexOf("HPV2_ULTIMATE_SNAPSHOT") >= 0) ||
      raw.indexOf("\\") >= 0;
  }

  function applyConfigMessage(message, raw) {
    if (!topBar || !message || message.magic_word !== CONFIG_MAGIC ||
        message.version !== CONFIG_VERSION || !message.values ||
        typeof message.values !== "object" || Array.isArray(message.values)) return false;
    var revision = message.revision;
    if (!Number.isFinite(revision) || Math.floor(revision) !== revision ||
        revision < 0 || revision <= configRevision) return false;
    var next;
    try {
      next = normalizeConfig(message.values);
    } catch {
      return false;
    }
    if (!next || typeof next !== "object") return false;
    config = next;
    configRaw = raw;
    configRevision = revision;
    pickupStyleRevision++;
    if (!pickupTimersEnabled()) receivedRecords = Object.create(null);
    renderRows();
    return true;
  }

  function receiveSnapshot(raw) {
    if (stopped || !valid(context)) return false;
    try {
      if (typeof raw !== "string" || raw.length > 4096 || !mayContainSnapshot(raw, !!topBar)) return false;
      var message = JSON.parse(raw);
      var now = Date.now();
      if (topBar && message && message.magic_word === CONFIG_MAGIC) {
        applyConfigMessage(message, raw);
        return false;
      }
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
            clearUltimate();
            ultimateAt = 0;
          }
          scanEnabled = message.scan;
          localPlayerName = message.localName.trim().toUpperCase();
          gateReceivedAt = message.at;
        }
        return false;
      }
      if (!message || message.magic_word !== "HPV2_PICKUP_SNAPSHOT") return false;
      if (!pickupTimersEnabled()) return false;
      if (typeof message.source !== "string" || !message.source || message.source.length > 256 ||
          typeof message.instance !== "string" || message.instance.length > 200 ||
          !Number.isSafeInteger(message.seq) || message.seq < 1 ||
          typeof message.at !== "number" || !isFinite(message.at) ||
          message.at < sessionStartedAt || message.at > now || now - message.at > ttl) return false;
      var previous = receivedRecords[message.source];
      if (previous && (message.at < previous.sentAt ||
          (message.instance === previous.instance && message.seq <= previous.seq))) return false;
      var record = message.record;
      if (record !== null && (!record || typeof record.name !== "string" ||
          !record.name.trim() || record.name.length > 256 ||
          typeof record.mask !== "number" || record.mask !== (record.mask & 15) ||
          typeof record.at !== "number" || !isFinite(record.at) ||
          record.at < sessionStartedAt || record.at > message.at || now - record.at > ttl ||
          (previous && record.at < previous.at) ||
          !validProgress(record.progress, record.mask, record.at))) return false;
      receivedRecords[message.source] = {
        name: record ? record.name.trim().toUpperCase() : "",
        mask: record ? record.mask : 0, at: record ? record.at : message.at,
        sentAt: message.at, instance: message.instance, seq: message.seq,
        progress: record ? record.progress : null
      };
      var next = receivedRecords[message.source];
      // Use cached rows here; discovery and stale cleanup remain on the slow tick.
      updatePause(now);
      renderRows(next.name, previous ? previous.name : "");
    } catch (error) {
      $.Msg("[test_hpv2][pickup-receive-error] " + String(error));
    }
    return false;
  }
  function readConfigRoot() {
    if (!topBar) return "";
    var nextRoot;
    try {
      nextRoot = snapshotRoot();
    } catch {
      return "";
    }
    if (nextRoot !== configRoot) {
      configRoot = nextRoot;
      configRaw = "";
      configRevision = -1;
      config = normalizeConfig(null);
      pickupStyleRevision++;
      receivedRecords = Object.create(null);
    }
    if (!valid(configRoot) || !configRoot.GetAttributeString) return "";
    try {
      return String(configRoot.GetAttributeString(CONFIG_ATTR, "") || "");
    } catch {
      return "";
    }
  }

  function inspectConfigRoot() {
    var raw = readConfigRoot();
    if (!raw || raw === configRaw) return;
    try {
      var message = JSON.parse(raw);
      if (message && message.magic_word === CONFIG_MAGIC)
        applyConfigMessage(message, raw);
    } catch {}
  }

  function readUnits(affectedName, previousName) {
    var records = receivedRecords;
    var units = Object.create(null);
    var now = Date.now();
    for (var key in records) {
      var record = records[key];
      if (record.at > now || now - record.at > ttl) {
        delete records[key];
        continue;
      }
      if (!record.name || (affectedName !== undefined && record.name !== affectedName && record.name !== previousName)) continue;
      units[record.name] = units[record.name] ? -1 : record;
    }
    return units;
  }

  function findRows() {
    var next = [];
    localPlayerLabels.length = 0;
    var labels = topBar.FindChildrenWithClassTraverse("PlayerName");
    for (var index = 0; index < labels.length; index++) {
      var label = labels[index];
      if (!valid(label)) continue;
      var owner = label.GetParent();
      while (valid(owner) && owner !== topBar && owner.paneltype !== "CitadelHudTopBarPlayer") owner = owner.GetParent();
      if (!valid(owner) || owner === topBar) continue;
      if (owner.BHasClass("LocalPlayer")) {
        localPlayerLabels.push(label);
        continue;
      }
      var ultimate = owner.FindChildTraverse("UltimateStatus");
      if (!valid(ultimate)) continue;
      var row = null;
      for (var old = 0; old < rows.length; old++) {
        if (rows[old].label === label && rows[old].ultimate === ultimate) row = rows[old];
      }
      next.push(row || {
        label: label, ultimate: ultimate, container: null, left: null, right: null, icons: [], glyphs: [],
        rings: [], progressModels: [], mask: -1, styleRevision: -1, styleCache: {}
      });
    }
    for (var previous = 0; previous < rows.length; previous++) {
      if (next.indexOf(rows[previous]) < 0) render(rows[previous], 0);
    }
    rows = next;
  }

  function updatePause(now) {
    var next = valid(pausePanel) && pausePanel.BAscendantHasClass("gameIsPaused");
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
    var blocked = !name || row.label.BAscendantHasClass("Dead") || row.label.BAscendantHasClass("Disconnected");
    var renamed = row.name !== undefined && row.name !== name;
    if (blocked || row.blocked || renamed) row.acceptAfter = now;
    row.blocked = blocked;
    row.name = name;
    return blocked || renamed;
  }

  function paintProgress(ring, progress, now) {
    var angle = progressAngle(progress, now, pauseIntervals);
    ring.style.clip = "radial(50% 50%, 0deg, " + angle + "deg)";
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
          row.progressEnded[bit] = !paintProgress(row.rings[bit], progress, now);
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
    if (!valid(ring) || row.progressModels[bit] === progress) return;
    row.progressModels[bit] = progress;
    row.progressEnded[bit] = false;
    ring.style.visibility = progress ? "visible" : "collapse";
    if (!progress) return;
    paintProgress(ring, progress, Date.now());
  }

  function render(row, mask, progress) {
    var parent = valid(row.ultimate) ? row.ultimate.GetParent() : null;
    if (valid(row.container) && parent === row.container) parent = row.container.GetParent();
    if (!valid(parent)) return;
    if (!pickupTimersEnabled()) {
      mask = 0;
      progress = null;
    }
    if (!valid(row.container)) row.container = parent.FindChildTraverse("HPV2PickupIndicators");
    if (!mask) {
      if (valid(row.container) && row.mask !== 0) {
        if (row.ultimate.GetParent() === row.container) row.ultimate.SetParent(parent);
        parent.MoveChildBefore(row.ultimate, row.container);
      }
      if (valid(row.cooldown) && row.mask !== 0 &&
          !setCachedStyle(row.cooldown, "horizontalAlign", row.cooldownAlign, row.styleCache, "cooldownAlign")) return;
      if (valid(row.container) && row.mask !== 0)
        row.container.style.visibility = "collapse";
      if (row.mask !== 0) {
        for (var clear = 0; clear < row.rings.length; clear++)
          renderProgress(row, clear, null);
      }
      row.mask = 0;
      row.layoutMask = 0;
      return;
    }
    row.icons = row.icons || [];
    row.glyphs = row.glyphs || [];
    row.rings = row.rings || [];
    row.progressModels = row.progressModels || [];
    row.progressEnded = row.progressEnded || [];
    var complete =
      valid(row.container) &&
      valid(row.left) &&
      valid(row.right) &&
      (!row.cooldown || valid(row.cooldown)) &&
      row.icons.length === pickups.length &&
      row.glyphs.length === pickups.length &&
      row.rings.length === pickups.length;
    for (var check = 0; check < row.icons.length; check++)
      complete =
        complete &&
        valid(row.icons[check]) &&
        valid(row.glyphs[check]) &&
        valid(row.rings[check]);
    if (!complete) {
      row.container = valid(row.container) ? row.container : $.CreatePanel("Panel", parent, "HPV2PickupIndicators");
      row.container.hittest = false;
      row.container.hittestchildren = false;
      row.left = row.container.FindChildTraverse("HPV2PickupLeft") || $.CreatePanel("Panel", row.container, "HPV2PickupLeft");
      row.right = row.container.FindChildTraverse("HPV2PickupRight") || $.CreatePanel("Panel", row.container, "HPV2PickupRight");
      var cooldown = parent.FindChildTraverse("UltimateCooldownTextShown") ||
        parent.FindChildTraverse("te_UltimateCooldownTextShown");
      if (cooldown !== row.cooldown) {
        row.cooldown = cooldown;
        row.cooldownAlign = valid(cooldown) ? cooldown.style.horizontalAlign || "left" : "";
      }
      row.icons = [];
      row.glyphs = [];
      row.rings = [];
      row.progressModels = [];
      row.progressEnded = [];
      row.styleCache = {};
      row.styleRevision = -1;
      for (var index = 0; index < pickups.length; index++) {
        var id = "HPV2Pickup" + index;
        var icon =
          row.container.FindChildTraverse(id) ||
          $.CreatePanel("Panel", row.left, id);
        icon.hittest = false;
        setCachedStyle(icon, "flowChildren", "none", row.styleCache, "iconFlow" + index);
        setCachedStyle(icon, "borderRadius", "50%", row.styleCache, "iconRadius" + index);
        setCachedStyle(icon, "border", "1px solid #111111", row.styleCache, "iconBorder" + index);
        setCachedStyle(icon, "overflow", "noclip", row.styleCache, "iconOverflow" + index);
        var glyph =
          icon.FindChildTraverse(id + "Glyph") ||
          $.CreatePanel("Image", icon, id + "Glyph");
        glyph.hittest = false;
        setCachedStyle(glyph, "horizontalAlign", "center", row.styleCache, "glyphHorizontal" + index);
        setCachedStyle(glyph, "verticalAlign", "center", row.styleCache, "glyphVertical" + index);
        setCachedStyle(glyph, "zIndex", 2, row.styleCache, "glyphZ" + index);
        glyph.SetImage("s2r://panorama/images/hud/icons/" + pickups[index].image + ".vsvg");
        var ring =
          icon.FindChildTraverse(id + "Progress") ||
          $.CreatePanel("Panel", icon, id + "Progress");
        ring.hittest = false;
        setCachedStyle(ring, "horizontalAlign", "left", row.styleCache, "ringHorizontal" + index);
        setCachedStyle(ring, "verticalAlign", "top", row.styleCache, "ringVertical" + index);
        setCachedStyle(ring, "position", "0px 0px 0px", row.styleCache, "ringPosition" + index);
        setCachedStyle(ring, "margin", "0px", row.styleCache, "ringMargin" + index);
        setCachedStyle(ring, "borderRadius", "50%", row.styleCache, "ringRadius" + index);
        setCachedStyle(ring, "backgroundImage", 'url("s2r://panorama/images/masks/no_mask_png.vtex")', row.styleCache, "ringImage" + index);
        setCachedStyle(ring, "backgroundSize", "100%", row.styleCache, "ringBackgroundSize" + index);
        setCachedStyle(ring, "opacity", "1", row.styleCache, "ringOpacity" + index);
        setCachedStyle(ring, "zIndex", 1, row.styleCache, "ringZ" + index);
        setCachedStyle(ring, "transitionDuration", "0s", row.styleCache, "ringTransition" + index);
        setCachedStyle(ring, "visibility", "collapse", row.styleCache, "ringVisibility" + index);
        row.glyphs.push(glyph);
        row.rings.push(ring);
        row.icons.push(icon);
      }
      row.mask = -1;
    }
    // Keep native status flow and the cooldown label outside the pickup row.
    if (row.ultimate.GetParent() !== row.container) {
      parent.MoveChildBefore(row.container, row.ultimate);
      row.ultimate.SetParent(row.container);
    }
    if (!applyPickupStyles(row, mask)) return;
    if (row.mask !== mask) {
      row.container.style.visibility = "visible";
      for (var bit = 0; bit < row.icons.length; bit++)
        row.icons[bit].style.visibility = mask & (1 << bit) ? "visible" : "collapse";
    }
    for (var index = 0; index < row.icons.length; index++)
      renderProgress(row, index, mask & (1 << index) && progress ? progress[index] : null);
    row.mask = mask;
    if (!progressTickPending) {
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
      counts[name] = (counts[name] || 0) + 1;
    }
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      var row = rows[rowIndex];
      var player = row.renderName;
      if (affectedName !== undefined && player !== affectedName && player !== previousName) continue;
      var unit = player && counts[player] === 1 ? units[player] : null;
      var blocked = rowUnavailable(row, now, player);
      var mask = pickupTimersEnabled() && !blocked && unit && unit !== -1 &&
        unit.at >= (row.acceptAfter || 0) ? unit.mask : 0;
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
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
      magic_word: "HPV2_PICKUP_SCAN_GATE", scan: scan, localName: localName, since: sessionStartedAt, at: Date.now()
    }));
  }
  function onWorldConfigChanged(next) {
    if (
      stopped ||
      !next ||
      typeof next !== "object" ||
      typeof next.enabled !== "boolean" ||
      typeof next.pickupTimersEnabled !== "boolean" ||
      typeof next.pickupSize !== "number" ||
      !isFinite(next.pickupSize) ||
      typeof next.ultimateTimerEnabled !== "boolean" ||
      typeof next.ultimateTimerSize !== "number" ||
      !isFinite(next.ultimateTimerSize) ||
      typeof next.ultimateTimerDarkness !== "number" ||
      !isFinite(next.ultimateTimerDarkness)
    )
      return false;
    config = next;
    ultimateStylesDirty = true;
    pickupStyleRevision++;
    if (!pickupTimersEnabled()) {
      clipCaptures.length = 0;
      if (lastPublishedName) publish("", 0);
    }
    if (!ultimateTimerEnabled()) clearUltimate();
    else if (ultimateName) applyUltimateStyles(ultimateAngle);
    return true;
  }

  function bindWorldConfig() {
    if (topBar) return;
    try {
      var initial = context.HPV2GetNormalizedConfig();
      if (!onWorldConfigChanged(initial)) {
        $.Msg("[test_hpv2][config-error] renderer config is not normalized");
        throw new Error("Invalid HP Colors v2 renderer config");
      }
      configUnsubscribe = context.HPV2OnConfigChanged(onWorldConfigChanged);
    } catch (error) {
      $.Msg("[test_hpv2][config-error] " + String(error));
      throw error;
    }
  }

  context.HPV2PickupStop = function () {
    stopped = true;
    if (typeof configUnsubscribe === "function") {
      try { configUnsubscribe(); } catch {}
      configUnsubscribe = null;
    }
    if (listener !== null) {
      try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", listener); }
      catch (error) {
        $.Msg("[test_hpv2][pickup-receive-error] " + String(error));
      }
      listener = null;
    }
    for (var index = 0; index < rows.length; index++) {
      try { render(rows[index], 0); } catch (ignored) {}
    }
    if (!topBar) {
      try { publish("", 0); } catch (ignored) {}
      try { clearUltimate(); } catch (ignored) {}
    }
  };

  function tick() {
    if (stopped) return;
    if (!valid(context)) {
      context.HPV2PickupStop();
      return;
    }
    try {
      if (topBar) {
        inspectConfigRoot();
        findRows();
        publishScanGate();
        if (!valid(pausePanel)) pausePanel = snapshotRoot().FindChildTraverse("PausedGameContainer");
        updatePause(Date.now());
        renderRows();
      } else {
        if (ultimateName && (Date.now() < ultimateAt || Date.now() - ultimateAt >= 4000 ||
            readName(namePanel) !== ultimateName || ultimateName === localPlayerName ||
            context.BAscendantHasClass("LocalPlayer") || !valid(ultimateReady) ||
            ultimateReady.visible !== false)) clearUltimate();
        sampleUnit();
      }
    } catch (error) {
      $.Msg("[test_hpv2] Pickup scan failed: " + error);
      for (var clear = 0; clear < rows.length; clear++) {
        try { render(rows[clear], 0); } catch (ignored) {}
      }
    }
    $.Schedule(topBar ? 5 : 3, tick);
  }

  try { listener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", receiveSnapshot); }
  catch (error) {
    $.Msg("[test_hpv2][pickup-receive-error] " + String(error));
  }
  if (topBar) inspectConfigRoot();
  else bindWorldConfig();

  tick();
  if (topBar) ultimateTick();
})();
