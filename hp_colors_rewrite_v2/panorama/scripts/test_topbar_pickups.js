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
  var discoveryTickPending = false;
  var ultimateTickPending = false;
  var worldTickPending = false;
  var worldWakeHook = false;
  var worldAwake = false;
  var wakeUnsubscribe = null;
  var sourceId = "";
  var receivedRecords = Object.create(null);
  var listener = null;
  var namePanel = null;
  var effectsPanel = null;
  var statusContainer = null;
  var clipCaptures = [];
  var nativePickupStyles = [];
  var nativePickupSeen = [];
  var clipWarningShown = false;
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
  var ultimateModel = null;
  var ultimateProgressPending = false;
  var lastUltimateKey = "";
  var lastUltimateSentAt = 0;
  var lastUltimatePlayers = Object.create(null);
  var ULTIMATE_PREDICT_TOLERANCE = 15;
  var lastPublishedProgress = null;
  // Degrees a published countdown may miss the next native sample by before
  // a re-send; refreshes and pauses miss by far more.
  var PICKUP_PREDICT_TOLERANCE = 6;

  function parseUltimateClip(raw) {
    var match = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(\d+(?:\.\d+)?)deg\s*\)$/.exec(raw);
    var angle = match ? Number(match[1]) : NaN;
    return isFinite(angle) && angle >= 0 && angle <= 360 ? angle : null;
  }

  function validUltimates(message, now, since, previousAt) {
    if (!message || message.magic_word !== "HPV2_ULTIMATE_SNAPSHOT" ||
        typeof message.at !== "number" || !isFinite(message.at) ||
        message.at > now || now - message.at >= 12000 || message.at < previousAt ||
        message.since !== since || message.at < since ||
        !Array.isArray(message.players) || message.players.length > 12) return false;
    var names = Object.create(null);
    for (var index = 0; index < message.players.length; index++) {
      var item = message.players[index];
      if (!Array.isArray(item) || item.length !== 3 || typeof item[0] !== "string" ||
          !item[0] || item[0].length > 256 || item[0] !== item[0].trim().toUpperCase() ||
          names[item[0]] || typeof item[1] !== "number" || !isFinite(item[1]) ||
          item[1] < 0 || item[1] > 360 || typeof item[2] !== "number" ||
          !isFinite(item[2]) || item[2] < 0 || item[2] > 360 || item[1] === 360 && item[2] !== 0) return false;
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
    ultimateName = "";
    ultimateAngle = null;
    ultimateModel = null;
  }

  // Only hero bars carry pickups or ultimates; everything else ignores timer traffic.
  var playerUnit = null;
  function refreshPlayerUnit() {
    var next = !!context.BAscendantHasClass("CLASS_PLAYER");
    if (next === playerUnit) return next;
    playerUnit = next;
    if (!next) {
      publish("", 0);
      clearUltimate();
      restoreNativePickupStyles(true);
    }
    applyUltimateBaseScale();
    return next;
  }

  function findUltimatePanels(createOverlay, background) {
    background = background || context.FindChildTraverse("unit_info_bg");
    if (!valid(background)) return false;
    if (background !== ultimateBackground) {
      if (valid(ultimateBackground) &&
          !setTimerStyle(ultimateBackground, "preTransformScale2d", ultimateBackgroundScale)) return false;
      ultimateBackground = background;
      ultimateBackgroundScale = background.style.preTransformScale2d || "1";
      ultimateOverlay = null;
      ultimateReady = null;
      ultimateStyleCache = {};
      ultimateName = "";
    }
    if (!valid(ultimateOverlay) || ultimateOverlay.GetParent() !== background) {
      ultimateOverlay = background.FindChildTraverse("HPV2UltimateOverlay");
      ultimateFill = null;
      ultimateDark = null;
      ultimateAngle = null;
      ultimateStylesDirty = true;
    }
    if (!valid(ultimateOverlay) && createOverlay) {
      try {
        ultimateOverlay = $.CreatePanel("Panel", background, "HPV2UltimateOverlay");
        ultimateOverlay.hittest = false;
        ultimateOverlay.hittestchildren = false;
      } catch { return false; }
    }
    if (createOverlay && valid(ultimateOverlay)) {
      try {
        if (!valid(ultimateDark) || ultimateDark.GetParent() !== ultimateOverlay)
          ultimateDark = ultimateOverlay.FindChildTraverse("HPV2UltimateDark");
        if (!valid(ultimateDark)) {
          ultimateDark = $.CreatePanel("Panel", ultimateOverlay, "HPV2UltimateDark");
          ultimateDark.AddClass("HPV2UltimateArtwork");
          ultimateDark.hittest = false;
        }
        if (!valid(ultimateFill) || ultimateFill.GetParent() !== ultimateOverlay)
          ultimateFill = ultimateOverlay.FindChildTraverse("HPV2UltimateFill");
        if (!valid(ultimateFill)) {
          ultimateFill = $.CreatePanel("Image", ultimateOverlay, "HPV2UltimateFill");
          ultimateFill.AddClass("HPV2UltimateArtwork");
          ultimateFill.hittest = false;
          ultimateFill.SetImage("s2r://panorama/images/hpv2/ultimate_progress.vtex");
        }
      } catch { return false; }
    }
    return !createOverlay || valid(ultimateOverlay) && valid(ultimateDark) && valid(ultimateFill);
  }

  // ULTIMATE SIZE scales the whole ult icon, ready or cooling down.
  function applyUltimateBaseScale() {
    var owned = ultimateTimerEnabled() && playerUnit === true && !context.BAscendantHasClass("LocalPlayer");
    if (owned ? !findUltimatePanels(false) : !valid(ultimateBackground)) return;
    setTimerStyle(ultimateBackground, "preTransformScale2d",
      owned ? config.ultimateTimerSize / 100 : ultimateBackgroundScale);
  }

  function paintUltimateProgress() {
    ultimateProgressPending = false;
    if (stopped || !ultimateModel || !ultimateName || !ultimateTimerEnabled() ||
        !valid(context) || worldWakeHook && !worldAwake) return;
    var now = Date.now();
    if (now < ultimateAt || now - ultimateAt >= 12000) { clearUltimate(); return; }
    var angle = Math.min(359.999, ultimateModel.angle + ultimateModel.rate * (now - ultimateAt) / 1000);
    if (applyUltimateStyles(angle) && setTimerStyle(ultimateFill, "clip", "radial(50% 50%, 0deg, " + angle + "deg)"))
      ultimateAngle = angle;
    if (ultimateModel.rate > 0 && angle < 359.999) {
      ultimateProgressPending = true;
      $.Schedule(1, paintUltimateProgress); // ponytail: 1 Hz like pickup rings; faster = more JS per hero bar
    }
  }

  function receiveUltimates(message, now) {
    if (!ultimateTimerEnabled() || context.BAscendantHasClass("LocalPlayer")) {
      if (ultimateName) clearUltimate();
      return;
    }
    if (!validUltimates(message, now, sessionStartedAt, ultimateAt)) return;
    ultimateAt = message.at;
    if (!valid(namePanel)) namePanel = context.FindChildTraverse("name");
    var name = readName(namePanel);
    var entry = null;
    if (name !== localPlayerName) {
      for (var index = 0; index < message.players.length; index++) {
        if (message.players[index][0] === name) entry = message.players[index];
      }
    }
    if (!entry || entry[1] === 360) { clearUltimate(); return; }
    if (!findUltimatePanels(false)) { clearUltimate(); return; }
    if (!valid(ultimateReady)) ultimateReady = ultimateBackground.FindChildTraverse("unit_ult_ready_icon");
    if (!valid(ultimateReady) || ultimateReady.visible !== false) { clearUltimate(); return; }
    if (!findUltimatePanels(true, ultimateBackground)) { clearUltimate(); return; }
    if (!valid(ultimateFill)) { clearUltimate(); return; }
    if (!ultimateName && !setTimerStyle(ultimateOverlay, "visibility", "visible")) return;
    ultimateName = name;
    ultimateModel = { angle: entry[1], rate: entry[2] };
    if (!ultimateProgressPending) paintUltimateProgress();
  }

  function countRowNames() {
    var names = [];
    var counts = Object.create(null);
    var name;
    var localName = "";
    for (var local = 0; local < localPlayerLabels.length; local++) {
      name = readName(localPlayerLabels[local]);
      if (localPlayerLabels.length === 1) localName = name;
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    for (var index = 0; index < rows.length; index++) {
      name = readName(rows[index].label);
      names.push(name);
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    return { names: names, counts: counts, localName: localName };
  }

  function ultimateTick() {
    ultimateTickPending = false;
    if (stopped || !valid(context) || !ultimateTimerEnabled()) return;
    try {
      var players = [];
      var states = [];
      var correction = false;
      var now = Date.now();
      var scan = countRowNames();
      for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        var row = rows[rowIndex];
        var player = scan.names[rowIndex];
        if (!player || player.length > 256 || scan.counts[player] !== 1 || !valid(row.ultimate) ||
            row.label.BAscendantHasClass("LocalPlayer") || row.label.BAscendantHasClass("Dead") ||
            row.label.BAscendantHasClass("Disconnected")) continue;
        var angle = 0;
        var unlocked = row.label.BAscendantHasClass("UltimateUnlocked");
        if (unlocked) {
          if (!valid(row.ultimateBackground)) row.ultimateBackground = row.ultimate.FindChildTraverse("UltimateStatusBG");
          angle = row.label.BAscendantHasClass("UltimateCooldownReady") ? 360 :
            valid(row.ultimateBackground) ? parseUltimateClip(String(row.ultimateBackground.style.clip || "")) : null;
        }
        var previous = row.ultimateSample;
        var rate = unlocked && angle !== null && angle < 360 && previous && previous.player === player &&
          previous.since === sessionStartedAt && previous.unlocked && previous.angle !== null &&
          previous.angle < 360 && angle >= previous.angle && now > previous.at ?
          Math.round(Math.min(360, (angle - previous.angle) * 1000 / (now - previous.at)) * 100) / 100 : 0;
        row.ultimateSample = { player: player, angle: angle, at: now, unlocked: unlocked, since: sessionStartedAt };
        if (angle === null) continue;
        players.push([player, angle, rate]);
        states.push([player, unlocked ? angle === 360 ? 2 : 1 : 0]);
        var sent = lastUltimatePlayers[player];
        if (sent && Math.abs(angle - Math.min(sent[1] === 360 ? 360 : 359.999,
            sent[1] + sent[2] * (now - lastUltimateSentAt) / 1000)) >= ULTIMATE_PREDICT_TOLERANCE) correction = true;
      }
      // 8 s heartbeat leaves 4 s delivery slack before the 12 s receiver expiry.
      var key = sessionStartedAt + ":" + JSON.stringify(states);
      if (players.length <= 12 && (key !== lastUltimateKey || correction || now < lastUltimateSentAt ||
          now - lastUltimateSentAt >= 8000)) {
        $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
          magic_word: "HPV2_ULTIMATE_SNAPSHOT", since: sessionStartedAt, at: now, players: players
        }));
        lastUltimatePlayers = Object.create(null);
        players.forEach(function (item) { lastUltimatePlayers[item[0]] = item; });
        lastUltimateKey = key;
        lastUltimateSentAt = now;
      }
    } catch (error) {
      $.Msg("[test_hpv2][ultimate-error] " + String(error));
    }
    if (ultimateTimerEnabled()) {
      ultimateTickPending = true;
      $.Schedule(1, ultimateTick);
    }
  }

  function wakeUltimateTick() {
    if (!topBar || ultimateTickPending || !ultimateTimerEnabled()) return;
    ultimateTick();
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

  // Own only the inline properties we change; leave engine radial clips intact.
  function setNativePickupStyle(panel, property, value) {
    if (!valid(panel) || !panel.style) return false;
    var entry = null;
    for (var index = 0; index < nativePickupStyles.length; index++) {
      var candidate = nativePickupStyles[index];
      if (candidate.panel === panel && candidate.property === property) entry = candidate;
    }
    if (!entry) {
      entry = { panel: panel, property: property, baseline: panel.style[property], cache: {} };
      nativePickupStyles.push(entry);
    }
    nativePickupSeen.push(entry);
    return setCachedStyle(panel, property, value, entry.cache, property);
  }

  function restoreNativePickupStyles(all) {
    for (var index = nativePickupStyles.length - 1; index >= 0; index--) {
      var entry = nativePickupStyles[index];
      if (!all && nativePickupSeen.indexOf(entry) >= 0) continue;
      if (valid(entry.panel) && !setCachedStyle(
        entry.panel, entry.property, entry.baseline, entry.cache, entry.property
      )) continue;
      nativePickupStyles.splice(index, 1);
    }
  }

  function styleNativePickup(panel, bit) {
    var size = config.pickupSize;
    setNativePickupStyle(panel, "width", size + "px");
    setNativePickupStyle(panel, "height", size + "px");
    setNativePickupStyle(panel, "margin", "0px " + config.pickupSpacing + "px");
    setNativePickupStyle(panel, "transform",
      "translateX(" + config.pickupOffsetX + "px) translateY(" + config.pickupOffsetY + "px)");
    var inner = panel.FindChildTraverse("StatusEffectInner");
    var border = panel.FindChildTraverse("StatusEffectsBorder");
    setNativePickupStyle(inner, "washColor", pickupBackground(bit));
    setNativePickupStyle(border, "washColor", pickupColor(bit));
    var glyphs = panel.FindChildrenWithClassTraverse("statusEffectImage");
    var image = panel.FindChildTraverse("StatusEffectImage");
    if (valid(image)) glyphs.push(image);
    for (var index = 0; index < glyphs.length; index++)
      setNativePickupStyle(glyphs[index], "washColor", config.pickupGlyphColor);
  }
  function valid(panel) { return panel && panel.IsValid(); }

  function readName(panel) {
    if (!valid(panel)) return "";
    var name = panel.text;
    if (typeof name !== "string") return "";
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

  // True when the published fit still predicts every new sample: same bits
  // tracked, same running/paused state, angle within tolerance.
  function progressPredicted(sent, next) {
    if (!sent || !next) return sent === next;
    for (var bit = 0; bit < next.length; bit++) {
      var before = sent[bit];
      var after = next[bit];
      if (!before !== !after) return false;
      if (!before) continue;
      if ((before.rate === 0) !== (after.rate === 0)) return false;
      var predicted = Math.min(0, before.angle + before.rate * (after.at - before.at) / 1000);
      if (!(Math.abs(predicted - after.angle) <= PICKUP_PREDICT_TOLERANCE)) return false;
    }
    return true;
  }

  function publish(name, mask) {
    if (!name) clipCaptures = [];
    if (!sourceId || !context.HPV2QueuePickup) return;
    var now = Date.now();
    var progress = name ? pickups.map(function (_, bit) {
      var capture = clipCaptures[bit];
      return mask & (1 << bit) && capture ? capture.progress : null;
    }) : null;
    // Mask/name changes, refreshes, pauses and the 6 s heartbeat still send.
    if (name === lastPublishedName && mask === lastPublishedMask &&
        now >= lastPublishedAt && now - lastPublishedAt < 6000 &&
        (!progressDirty || progressPredicted(lastPublishedProgress, progress))) {
      progressDirty = false;
      return;
    }
    // Same-context handoff; serialize only at the sibling boundary.
    if (context.HPV2QueuePickup(name ? { name: name, mask: mask, at: now, progress: progress } : null) !== true) return;
    lastPublishedName = name;
    lastPublishedMask = mask;
    lastPublishedAt = now;
    lastPublishedProgress = progress;
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
      if (!clipWarningShown) {
        clipWarningShown = true;
        $.Msg("[test_hpv2][pickup-clip-error] " + String(error));
      }
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

  function sampleUnitPickups() {
    if (!pickupTimersEnabled()) {
      clipCaptures.length = 0;
      if (lastPublishedName) publish("", 0);
      return;
    }
    var now = Date.now();
    // Stale or missing control always permits scanning.
    if (!scanEnabled && now >= gateReceivedAt && now - gateReceivedAt < 15000) {
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
      lastPublishedProgress = null;
    }
    if (!valid(namePanel)) namePanel = context.FindChildTraverse("name");
    var name = readName(namePanel);
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
          if (!(mask & (1 << bit))) captureNativeClip(matches[match], bit, name);
          mask |= 1 << bit;
          styleNativePickup(matches[match], bit);
        }
      }
      if (!(mask & (1 << bit))) clipCaptures[bit] = null;
    }
    publish(name, mask);
  }

  function sampleUnit() {
    nativePickupSeen = [];
    try { sampleUnitPickups(); }
    finally { restoreNativePickupStyles(false); }
  }

  function mayContainSnapshot(raw, isHud) {
    // Escaped keys/values still require JSON parsing and full message validation.
    return (isHud
      ? raw.indexOf("HPV2_PICKUP_SNAPSHOT") >= 0 || raw.indexOf(CONFIG_MAGIC) >= 0
      : raw.indexOf("HPV2_PICKUP_SCAN_GATE") >= 0 || raw.indexOf("HPV2_ULTIMATE_SNAPSHOT") >= 0) ||
      raw.indexOf("\\") >= 0;
  }

  function applyConfigMessage(message, raw) {
    if (!message || message.magic_word !== CONFIG_MAGIC ||
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
    if (topBar && (pickupTimersEnabled() || ultimateTimerEnabled())) {
      tick();
      wakeUltimateTick();
    }
    return true;
  }

  function receiveSnapshot(raw) {
    if (stopped || !valid(context)) return false;
    try {
      if (typeof raw !== "string" || raw.length > 4096) return false;
      if (!topBar && (playerUnit === null ? !refreshPlayerUnit() : !playerUnit)) return false;
      // The applied config (and every answer repeating it) fails the revision check anyway.
      if (!mayContainSnapshot(raw, !!topBar) || raw === configRaw) return false;
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
      while (valid(owner) && owner !== topBar &&
        (owner.paneltype || owner.type) !== "CitadelHudTopBarPlayer") owner = owner.GetParent();
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
        rings: [], progressModels: [], progressClips: [], mask: -1, styleRevision: -1, styleCache: {}
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

  function paintProgress(row, bit, progress, now) {
    var angle = progressAngle(progress, now, pauseIntervals);
    var clip = "radial(50% 50%, 0deg, " + angle + "deg)";
    if (row.progressClips[bit] !== clip) {
      row.rings[bit].style.clip = clip;
      row.progressClips[bit] = clip;
    }
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
      if (!row.mask || !row.progressModels || paused) continue;
      for (var bit = 0; bit < row.rings.length; bit++) {
        var progress = row.progressModels[bit];
        if (!(row.mask & (1 << bit)) || !progress || progress.rate <= 0 ||
            row.progressEnded[bit] || !valid(row.rings[bit])) continue;
        try {
          row.progressEnded[bit] = !paintProgress(row, bit, progress, now);
          if (!row.progressEnded[bit]) active = true;
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
    paintProgress(row, bit, progress, Date.now());
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
      row.progressClips = [];
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
    if (!progressTickPending && !paused && row.progressModels.some(function (model, bit) {
      return model && model.rate > 0 && !row.progressEnded[bit] && valid(row.rings[bit]);
    })) {
      progressTickPending = true;
      $.Schedule(1, progressTick);
    }
  }

  function renderRows(affectedName, previousName, scan) {
    var units = readUnits(affectedName, previousName);
    var now = Date.now();
    scan = scan || countRowNames();
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      var row = rows[rowIndex];
      var player = scan.names[rowIndex];
      if (affectedName !== undefined && player !== affectedName && player !== previousName) continue;
      var unit = player && scan.counts[player] === 1 ? units[player] : null;
      var blocked = rowUnavailable(row, now, player);
      var mask = pickupTimersEnabled() && !blocked && unit && unit !== -1 &&
        unit.at >= (row.acceptAfter || 0) ? unit.mask : 0;
      render(row, mask, unit && unit !== -1 ? unit.progress : null);
    }
  }

  function publishScanGate(scan) {
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
      renderRows(undefined, undefined, scan);
    }
    if (seconds !== null) lastGameTime = seconds;
    var scanAllowed = !normal || seconds === null || seconds >= 300;
    var localName = scan.localName;
    if (localName && scan.counts[localName] !== 1) localName = "";
    if (localName.length > 256) localName = "";
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
      magic_word: "HPV2_PICKUP_SCAN_GATE", scan: scanAllowed, localName: localName, since: sessionStartedAt, at: Date.now()
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
    if (next === config) return true;
    config = next;
    ultimateStylesDirty = true;
    if (!pickupTimersEnabled()) {
      clipCaptures.length = 0;
      if (lastPublishedName) publish("", 0);
    }
    if (!ultimateTimerEnabled()) clearUltimate();
    else if (ultimateName) applyUltimateStyles(ultimateAngle);
    if (worldWakeHook && !worldAwake) return true;
    if (!refreshPlayerUnit()) return true;
    applyUltimateBaseScale();
    sampleUnit();
    if (worldWakeHook) scheduleWorldTick();
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

  function scheduleWorldTick() {
    if (worldTickPending || worldWakeHook &&
        (!worldAwake || !pickupTimersEnabled() && !ultimateTimerEnabled())) return;
    worldTickPending = true;
    $.Schedule(3, function () {
      worldTickPending = false;
      tick();
    });
  }

  function onWorldWake(activeHero) {
    if (stopped || worldAwake === activeHero) return;
    worldAwake = activeHero === true;
    if (worldAwake) tick();
    else {
      publish("", 0);
      clearUltimate();
      restoreNativePickupStyles(true);
      playerUnit = false;
      applyUltimateBaseScale();
    }
  }

  function bindWorldWake() {
    if (topBar || typeof context.HPV2OnWake !== "function") return;
    try {
      worldWakeHook = true;
      wakeUnsubscribe = context.HPV2OnWake(onWorldWake);
      if (typeof wakeUnsubscribe !== "function") throw new Error("missing wake unsubscribe");
    } catch (error) {
      worldWakeHook = false;
      wakeUnsubscribe = null;
      $.Msg("[test_hpv2][wake-error] " + String(error));
    }
  }

  context.HPV2PickupStop = function () {
    stopped = true;
    if (typeof configUnsubscribe === "function") {
      try { configUnsubscribe(); } catch {}
      configUnsubscribe = null;
    }
    if (typeof wakeUnsubscribe === "function") {
      try { wakeUnsubscribe(); } catch {}
      wakeUnsubscribe = null;
    }
    if (context.HPV2OnPickupMessage === receiveSnapshot) context.HPV2OnPickupMessage = null;
    if (listener !== null) {
      try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", listener); }
      catch (error) {
        $.Msg("[test_hpv2][pickup-receive-error] " + String(error));
      }
      listener = null;
    }
    for (var index = 0; index < rows.length; index++) {
      try { render(rows[index], 0); } catch {}
    }
    if (!topBar) {
      try { publish("", 0); } catch {}
      try { clearUltimate(); } catch {}
      try { playerUnit = false; applyUltimateBaseScale(); } catch {}
      try { restoreNativePickupStyles(true); } catch {}
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
        if (!pickupTimersEnabled() && !ultimateTimerEnabled()) return;
        inspectConfigRoot();
        findRows();
        var scan = countRowNames();
        publishScanGate(scan);
        if (pickupTimersEnabled()) {
          if (!valid(pausePanel)) pausePanel = snapshotRoot().FindChildTraverse("PausedGameContainer");
          updatePause(Date.now());
          renderRows(undefined, undefined, scan);
        }
      } else {
        if (worldWakeHook && !worldAwake) return;
        if (!refreshPlayerUnit()) {
          if (!worldWakeHook) scheduleWorldTick();
          return;
        }
        if (ultimateName) {
          var now = Date.now();
          if (now < ultimateAt || now - ultimateAt >= 12000 ||
              readName(namePanel) !== ultimateName || ultimateName === localPlayerName ||
              context.BAscendantHasClass("LocalPlayer") || !valid(ultimateReady) ||
              ultimateReady.visible !== false) clearUltimate();
        }
        sampleUnit();
      }
    } catch (error) {
      $.Msg("[test_hpv2] Pickup scan failed: " + error);
      for (var clear = 0; clear < rows.length; clear++) {
        try { render(rows[clear], 0); } catch {}
      }
    }
    if (topBar) {
      if (!discoveryTickPending && (pickupTimersEnabled() || ultimateTimerEnabled())) {
        discoveryTickPending = true;
        $.Schedule(5, function () {
          discoveryTickPending = false;
          tick();
        });
      }
    } else scheduleWorldTick();
  }

  // World contexts own one listener (the renderer's), which routes pickup,
  // scan-gate and ultimate messages to this hook; only the HUD registers here.
  if (topBar) {
    try { listener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", receiveSnapshot); }
    catch (error) {
      $.Msg("[test_hpv2][pickup-receive-error] " + String(error));
    }
  } else {
    context.HPV2OnPickupMessage = receiveSnapshot;
  }
  if (topBar) inspectConfigRoot();
  else {
    bindWorldConfig();
    bindWorldWake();
  }

  if (topBar ? !discoveryTickPending : !worldWakeHook) tick();
  if (topBar) wakeUltimateTick();
})();
