(function () {
  "use strict";

  var SCAN_INTERVAL_SEC = 1;
  var PARTS_RETRY_SEC = 0.05;
  var PAINT_ACTIVE_SEC = 0.15;
  var PAINT_RECENT_SEC = 0.25;
  var PAINT_IDLE_SEC = 1.5;
  var PAINT_RECENT_MS = 2000;
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var CONFIG_MAGIC = "HP_COLORS_V2_CONFIG";
  var CONFIG_ATTR = "hp_colors_v2_config";
  var CONFIG_VERSION = 2;
  var ALLY_ATTR = "hp_colors_v2_ally";

  if (!$.HPColorsV2ContractFactory || !$.HPColorsV2ContractFactory.create)
    throw new Error("HP Colors v2 settings contract unavailable");
  var settingsContract = $.HPColorsV2ContractFactory.create();
  delete $.HPColorsV2ContractFactory;
  var normalizeConfig = settingsContract.normalizeValues;

  /* Values mirrored from the current stock unit_status.css relation rules. */
  var STOCK_TEAM1_COLOR = "#E7B659";
  var STOCK_TEAM2_COLOR = "#5B79E6";
  var STOCK_NEUTRAL_COLOR = "#5BEFB5";
  var STOCK_ENEMY_COLOR = "#FD4949";
  var STOCK_FRIEND_COLOR = "#FFEFD7";
  var STOCK_HEALING_COLOR = "#5FFF80";
  var STOCK_TEAM_DELTA_COLOR = "#FFEDB8";
  var STOCK_NEUTRAL_DELTA_COLOR = "#F24D4D";
  var STOCK_ENEMY_DELTA_COLOR = "#FFE55B";
  var STOCK_FRIEND_DELTA_COLOR = "#504C47";
  var STOCK_TEAM1_BULLET_SHIELD_COLOR = "#E9E76A";
  var STOCK_TEAM2_BULLET_SHIELD_COLOR = "#6A75E9";
  var STOCK_ENEMY_BULLET_SHIELD_COLOR = "#B95F5F";
  var STOCK_FRIEND_BULLET_SHIELD_COLOR = "#ACCA91";
  var STOCK_DEFAULT_BULLET_SHIELD_COLOR = "#FFFFFF";

  var LEVEL_VISIBLE_CLASS = "level_number_visible";
  var LEVEL_HIDDEN_CLASS = "level_number_hidden";
  var LEVEL_TIERS = [
    { minimum: 11, className: "level_tier2", color: "#f0d000" },
    { minimum: 19, className: "level_tier3", color: "#ff8c00" },
    { minimum: 27, className: "level_tier4", color: "#e53935" },
    { minimum: 35, className: "level_tier5", color: "#8b0000" },
  ];
  var FILL_PULSE_KEYS = [
    "pulseBaseClass",
    "pulseSubtleClass",
    "pulseIntenseClass",
  ];
  var COLOR_PULSE_KEYS = [
    "colorPulseBaseClass",
    "colorPulseSubtleClass",
    "colorPulseIntenseClass",
  ];
  var READOUT_PULSE_KEYS = [
    "pulseReadoutBaseClass",
    "pulseReadoutSubtleClass",
    "pulseReadoutIntenseClass",
  ];
  var MAX_READOUT_PULSE_KEYS = [
    "pulseMaximumReadoutBaseClass",
    "pulseMaximumReadoutSubtleClass",
    "pulseMaximumReadoutIntenseClass",
  ];

  var context = $.GetContextPanel();
  var bars = [];
  var configRoot = null;
  var configRaw = "";
  var config = normalizeConfig(null);
  var configRevision = -1;
  var lastColorChangeAt = 0;
  var eventHandlerId = null;
  var scanJob = null;
  var paintJob = null;
  var stopped = false;
  var liveLineage = {
    healthbars: null,
    activeParent: null,
    activeParentParent: null,
    healthbarsChildCount: -1,
    activeParentSiblingCount: -1,
  };
  var staminaSurface = {
    scope: null,
    container: null,
    containerParent: null,
    containerChildCount: -1,
    icons: [],
    iconParents: [],
    iconParentChildCounts: [],
    containerBaseline: {},
    iconBaselines: [],
    iconApplied: [],
    applied: {},
    enemy: false,
  };
  function isValid(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch {
      return false;
    }
  }

  function panelId(panel) {
    try {
      return String(panel && panel.id ? panel.id : "");
    } catch {
      return "";
    }
  }


  function findWithin(panel, id) {
    try {
      return panel && panel.FindChildTraverse
        ? panel.FindChildTraverse(id)
        : null;
    } catch {
      return null;
    }
  }

  function findAncestor(panel, id) {
    var current = panel;
    for (var depth = 0; current && depth < 8; depth++) {
      if (panelId(current) === id) return current;
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  function absoluteRoot(panel) {
    var current = panel;
    var last = panel;
    for (var depth = 0; current && depth < 24; depth++) {
      last = current;
      try {
        var parent = current.GetParent ? current.GetParent() : null;
        if (!parent || parent === current) break;
        current = parent;
      } catch {
        break;
      }
    }
    return last;
  }

  function hasClass(panel, className) {
    try {
      if (panel && panel.BHasClass) return !!panel.BHasClass(className);
      if (panel && panel.HasClass) return !!panel.HasClass(className);
    } catch {}
    return false;
  }

  function findAncestorWithClass(panel, className) {
    var current = panel;
    for (var depth = 0; current && depth < 12; depth++) {
      if (hasClass(current, className)) return current;
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  function panelParent(panel) {
    try {
      return panel && panel.GetParent ? panel.GetParent() : null;
    } catch {
      return null;
    }
  }

  function panelChildCount(panel) {
    try {
      if (panel && panel.GetChildCount) return panel.GetChildCount();
      if (panel && panel.Children) return (panel.Children() || []).length;
    } catch {}
    return -1;
  }

  function panelChildren(panel) {
    try {
      if (panel && panel.Children) return panel.Children() || [];
      if (panel && panel.GetChildCount && panel.GetChild) {
        var result = [];
        var count = panel.GetChildCount();
        for (var index = 0; index < count; index++)
          result.push(panel.GetChild(index));
        return result;
      }
    } catch {}
    return [];
  }

  function collectPanelsWithClass(panel, className, result, depth) {
    if (!isValid(panel) || depth > 3 || result.length >= 12) return;
    var children = panelChildren(panel);
    for (var index = 0; index < children.length && result.length < 12; index++) {
      var child = children[index];
      if (hasClass(child, className)) result.push(child);
      collectPanelsWithClass(child, className, result, depth + 1);
    }
  }
  function liveLineageUsable() {
    return (
      isValid(liveLineage.healthbars) &&
      isValid(liveLineage.activeParent) &&
      isDescendantOf(liveLineage.healthbars, context) &&
      isDescendantOf(liveLineage.activeParent, liveLineage.healthbars) &&
      panelParent(liveLineage.activeParent) ===
        liveLineage.activeParentParent &&
      panelChildCount(liveLineage.healthbars) ===
        liveLineage.healthbarsChildCount &&
      panelChildCount(liveLineage.activeParentParent) ===
        liveLineage.activeParentSiblingCount
    );
  }

  function liveActiveParent() {
    if (liveLineageUsable()) return liveLineage.activeParent;
    var healthbars = findWithin(context, "UnitHealthbarsContainer");
    var activeParent = findWithin(healthbars, "unit_healthbar_active_parent");
    var activeParentParent = panelParent(activeParent);
    liveLineage.healthbars = healthbars;
    liveLineage.activeParent = activeParent;
    liveLineage.activeParentParent = activeParentParent;
    liveLineage.healthbarsChildCount = panelChildCount(healthbars);
    liveLineage.activeParentSiblingCount = panelChildCount(activeParentParent);
    return activeParent;
  }


  function classifyTarget(bar) {
    var current = bar.parts.activeParent;
    var neutral = false;
    var enemy = false;
    var ally = false;
    var player = false;
    var team = "";
    var building = false;
    var boss = false;
    var sentry = false;
    var minion = false;
    var creature = false;
    for (var depth = 0; current && depth < 12; depth++) {
      neutral = neutral || hasClass(current, "team_neutral");
      enemy = enemy || hasClass(current, "enemy");
      ally = ally || hasClass(current, "friend");
      player = player || hasClass(current, "player");
      if (!team && hasClass(current, "team1")) team = "team1";
      if (!team && hasClass(current, "team2")) team = "team2";
      sentry = sentry || hasClass(current, "sentry");
      minion = minion || hasClass(current, "minion");
      building = building || sentry || hasClass(current, "building");
      creature = creature || hasClass(current, "creature");
      var tierBoss =
        hasClass(current, "boss_tier1") ||
        hasClass(current, "boss_tier2") ||
        hasClass(current, "boss_tier3");
      boss = boss || tierBoss || hasClass(current, "boss_barracks");
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch {
        break;
      }
    }
    var ambiguousRelation = !neutral && enemy && ally;
    var role = neutral
      ? "neutral"
      : ambiguousRelation
        ? "other"
        : enemy
          ? "enemy"
          : ally
            ? "ally"
            : "other";
    var ghoul = creature && !player && !building && !boss;
    var changed =
      role !== bar.role ||
      ambiguousRelation !== bar.ambiguousRelation ||
      player !== bar.isPlayer ||
      team !== bar.team ||
      building !== bar.isBuilding ||
      boss !== bar.isBoss ||
      sentry !== bar.isSentry ||
      minion !== bar.isMinion ||
      ghoul !== bar.isGhoul;
    if (!changed) return false;
    clearLevelOwnership(bar);
    bar.ambiguousRelation = ambiguousRelation;
    bar.role = role;
    bar.isPlayer = player;
    bar.team = team;
    bar.isBuilding = building;
    bar.isBoss = boss;
    bar.isSentry = sentry;
    bar.isMinion = minion;
    bar.isGhoul = ghoul;
    bar.levelWrapper =
      findAncestorWithClass(bar.parts.levelContainer, "enemy") ||
      findAncestorWithClass(bar.parts.activeParent, "enemy");
    bar.stockHeight = 0;
    bar.dirty = true;
    try {
      if (context.SetAttributeString)
        context.SetAttributeString(ALLY_ATTR, role === "ally" ? "1" : "");
    } catch {}
    return true;
  }


  function resolveParts(activeParent) {
    var container = findAncestor(activeParent, "UnitHealthbarContainer");
    var infoHealth = findAncestor(activeParent, "InfoHealthContainer");
    var unitStatus = findAncestor(activeParent, "UnitStatus");
    var windowRoot = findAncestorWithClass(activeParent, "WindowRoot");
    var healthbars = findAncestor(activeParent, "UnitHealthbarsContainer");
    return {
      windowRoot: windowRoot,
      container: container,
      infoHealth: infoHealth,
      healthbars: healthbars,
      unitStatus: unitStatus,
      activeParent: activeParent,
      ultBackground: findWithin(infoHealth, "unit_info_bg"),
      killMarker: findWithin(container, "hp_colors_kill_marker"),
      background: findWithin(container, "unit_healthbar_bg"),
      fill: findWithin(activeParent, "unit_healthbar_lagging"),
      pulseOverlay: findWithin(activeParent, "hp_colors_pulse_overlay"),
      healing: findWithin(activeParent, "unit_healthbar_healing"),
      delta: findWithin(activeParent, "unit_healthbar_delta"),
      bulletShield: findWithin(activeParent, "unit_healthbar_bullet_shield"),
      techShield: findWithin(activeParent, "unit_healthbar_tech_shield"),
      pipLabel: findWithin(activeParent, "unit_healthbar_pip_label"),
      levelContainer: findWithin(infoHealth, "LevelContainer"),
      levelLabel: findWithin(unitStatus, "unit_level_label"),
      counterAnchor: findWithin(windowRoot, "hp_counter_anchor"),
      counter: findWithin(windowRoot, "hp_counter"),
      counterMax: findWithin(windowRoot, "hp_counter_max"),
      ultIcon: findWithin(infoHealth, "unit_ult_ready_icon"),
    };
  }

  function isDescendantOf(panel, ancestor) {
    if (!panel || !ancestor) return true;
    var current = panel;
    for (var depth = 0; current && depth < 16; depth++) {
      if (current === ancestor) return true;
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch {
        return false;
      }
    }
    return false;
  }


  function sameParts(left, right) {
    for (var key in left) {
      if (
        Object.prototype.hasOwnProperty.call(left, key) &&
        left[key] !== right[key]
      )
        return false;
    }
    return true;
  }


  function findBarByParent(activeParent) {
    for (var index = 0; index < bars.length; index++) {
      if (bars[index].parts.activeParent === activeParent) return bars[index];
    }
    return null;
  }

  function isComplete(parts) {
    return (
      isValid(parts.container) &&
      isValid(parts.activeParent) &&
      isValid(parts.background) &&
      isValid(parts.fill)
    );
  }
  function cancelPartsRetry(bar) {
    if (!bar || !bar.partsRetryJob) return;
    try {
      if ($.CancelScheduled) $.CancelScheduled(bar.partsRetryJob);
    } catch {}
    bar.partsRetryJob = null;
  }

  function schedulePartsRetry(bar) {
    if (
      !bar ||
      bar.partsRetryJob ||
      stopped ||
      isComplete(bar.parts)
    ) {
      return;
    }
    var generation = bar.generation;
    try {
      bar.partsRetryJob = $.Schedule(PARTS_RETRY_SEC, function () {
        bar.partsRetryJob = null;
        if (
          stopped ||
          generation !== bar.generation ||
          !bar.seen ||
          !isValid(bar.parts.activeParent)
        ) {
          return;
        }
        if (refreshBarParts(bar)) reportData(bar);
      });
    } catch {
      bar.partsRetryJob = null;
    }
  }


  function readPanelWidthRaw(panel) {
    try {
      return Math.max(0, Number(panel.actuallayoutwidth) || 0);
    } catch {
      return 0;
    }
  }




  function sampleHealthPercent(bar) {
    var fillWidth = readPanelWidthRaw(bar.parts.fill);
    var totalParentWidth = readPanelWidthRaw(bar.parts.activeParent);
    var shieldWidth =
      readPanelWidthRaw(bar.parts.bulletShield) +
      readPanelWidthRaw(bar.parts.techShield);
    var healthParentWidth =
      totalParentWidth > 0
        ? Math.max(fillWidth, totalParentWidth - shieldWidth)
        : 0;
    var sampled = bar.healthSampled;
    var healthParentChanged =
      !sampled || healthParentWidth !== bar.sampleHealthParentWidth;
    var previousPercent = bar.lastWidthPercent;
    var previousFillWidth = bar.sampleFillWidth;
    var fillChanged = !sampled || fillWidth !== previousFillWidth;
    var overlayPercent =
      totalParentWidth > 0
        ? Math.round(
            Math.max(
              0,
              Math.min(100, (fillWidth / totalParentWidth) * 100),
            ) * 100,
          ) / 100
        : 0;
    var overlayChanged =
      !sampled || overlayPercent !== bar.pulseOverlayPercent;
    bar.healthSampled = true;
    bar.sampleFillWidth = fillWidth;
    bar.sampleTotalParentWidth = totalParentWidth;
    bar.sampleHealthParentWidth = healthParentWidth;
    bar.markerGeometryChanged =
      bar.markerGeometryChanged || healthParentChanged;
    bar.pulseOverlayPercent = overlayPercent;
    if (healthParentWidth <= 0) {
      bar.lastWidthPercent = -1;
      bar.healthPresentationChanged =
        !sampled || previousPercent >= 0 || fillChanged || healthParentChanged;
      if (bar.healthPresentationChanged) bar.dirty = true;
      return -1;
    }
    var widthPercent = Math.max(
      0,
      Math.min(100, ((fillWidth / healthParentWidth) * 100) | 0),
    );
    var percentChanged = !sampled || widthPercent !== previousPercent;
    bar.healthPresentationChanged =
      percentChanged ||
      fillChanged ||
      healthParentChanged ||
      (bar.colorPulseActive && overlayChanged);
    bar.lastWidthPercent = widthPercent;
    if (bar.healthPresentationChanged) bar.dirty = true;
    return widthPercent;
  }

  function readPipText(panel) {
    try {
      var text = panel.text === String(panel.text) ? panel.text : "";
      if (text) return text;
      if (panel.GetAttributeString)
        return String(panel.GetAttributeString("text", "") || "");
    } catch {}
    return "";
  }

  function parseMaximumHealth(pipText, precise) {
    var text = String(pipText || "");
    var firstMajor = text.indexOf("|");
    var lastMajor = text.lastIndexOf("|");
    var majorCount = 0;
    var leadingMinorCount = 0;
    var trailingMinorCount = 0;
    for (var index = 0; index < text.length; index++) {
      var token = text.charAt(index);
      if (token === "|") {
        majorCount += 1;
      } else if (token === '"' || token === "'") {
        if (firstMajor < 0 || index > lastMajor) trailingMinorCount += 1;
        else if (index < firstMajor) leadingMinorCount += 1;
      }
    }
    var minorValue = precise ? 10 : 100;
    var majorValue =
      leadingMinorCount > 0 ? (leadingMinorCount + 1) * minorValue : 500;
    return majorCount * majorValue + trailingMinorCount * minorValue;
  }


  function updatePipMaximum(bar, pipText) {
    var precise = !!config.precisePipsEnabled;
    if (bar.pipText === pipText && bar.pipProfile === precise) return false;
    bar.pipText = pipText;
    bar.pipProfile = precise;
    bar.rawMaximumHealth = parseMaximumHealth(pipText, precise);
    bar.dirty = true;
    return true;
  }
  function parseLevelNumber(levelText) {
    var text = String(levelText || "");
    if (!text || text.charAt(0) === "{") return 0;
    var level = 0;
    var found = false;
    for (var index = 0; index < text.length; index++) {
      var code = text.charCodeAt(index) - 48;
      if (code >= 0 && code <= 9) {
        level = level * 10 + code;
        found = true;
      }
    }
    return found ? level : 0;
  }

  function levelTierFor(level) {
    var tier = null;
    for (var index = 0; index < LEVEL_TIERS.length; index++) {
      if (level >= LEVEL_TIERS[index].minimum) tier = LEVEL_TIERS[index];
    }
    return tier;
  }

  function updateLevel(bar, levelText) {
    if (bar.levelText === levelText) return false;
    bar.levelText = levelText;
    bar.level = parseLevelNumber(levelText);
    bar.levelTier = levelTierFor(bar.level);
    bar.dirty = true;
    return true;
  }


  function readoutHealth(bar) {
    var maximum = bar.rawMaximumHealth;
    if (maximum <= 0 || bar.sampleHealthParentWidth <= 0)
      return { current: 0, maximum: 0 };
    if (
      bar.sampleTotalParentWidth > 0 &&
      bar.sampleHealthParentWidth < bar.sampleTotalParentWidth
    )
      maximum = Math.round(
        (maximum * bar.sampleHealthParentWidth) / bar.sampleTotalParentWidth,
      );
    var ratio = Math.max(
      0,
      Math.min(1, bar.sampleFillWidth / bar.sampleHealthParentWidth),
    );
    var current =
      ratio >= 0.97 ? maximum : Math.round(maximum * ratio);
    return {
      current: Math.max(0, Math.min(maximum, current)),
      maximum: maximum,
    };
  }

  function formatReadout(bar) {
    bar.readoutMaximumText = "";
    if (bar.lastWidthPercent < 0) return "";
    if (config.readoutFormat === "percent")
      return String(bar.lastWidthPercent) + "%";
    var health = readoutHealth(bar);
    if (health.maximum <= 0) return "";
    if (config.readoutFormat === "current") return String(health.current);
    bar.readoutMaximumText = String(health.maximum);
    return health.current + " / ";
  }


  function interpolateHex(left, right, amount) {
    var leftInt = parseInt(left.slice(1), 16);
    var rightInt = parseInt(right.slice(1), 16);
    var t = Math.max(0, Math.min(1, amount));
    var red =
      (((leftInt >> 16) & 255) +
        (((rightInt >> 16) & 255) - ((leftInt >> 16) & 255)) * t) |
      0;
    var green =
      (((leftInt >> 8) & 255) +
        (((rightInt >> 8) & 255) - ((leftInt >> 8) & 255)) * t) |
      0;
    var blue =
      ((leftInt & 255) + ((rightInt & 255) - (leftInt & 255)) * t) | 0;
    return (
      "#" +
      ((1 << 24) | (red << 16) | (green << 8) | blue)
        .toString(16)
        .slice(1)
    );
  }

  function gradientColor(percent, low, mid, high) {
    var lowThreshold = config.lowThreshold;
    var highThreshold = config.highThreshold;
    if (percent <= lowThreshold) return low;
    if (percent <= highThreshold)
      return interpolateHex(
        low,
        mid,
        (percent - lowThreshold) / Math.max(1, highThreshold - lowThreshold),
      );
    return interpolateHex(
      mid,
      high,
      (percent - highThreshold) / Math.max(1, 100 - highThreshold),
    );
  }

  function fixedColor(percent, low, mid, high) {
    if (percent <= config.lowThreshold) return low;
    if (percent <= config.highThreshold) return mid;
    return high;
  }
  function teamHighColor(team, fallback) {
    if (team === "team1") return STOCK_TEAM1_COLOR;
    if (team === "team2") return STOCK_TEAM2_COLOR;
    return fallback;
  }

  function stockUnitColor(bar) {
    if (bar.ambiguousRelation) return "";
    if (bar.role === "neutral") return STOCK_NEUTRAL_COLOR;
    if (bar.role === "enemy") return STOCK_ENEMY_COLOR;
    if (bar.role === "ally") return STOCK_FRIEND_COLOR;
    if (bar.team === "team1") return STOCK_TEAM1_COLOR;
    if (bar.team === "team2") return STOCK_TEAM2_COLOR;
    return "";
  }

  function stockDeltaColor(bar) {
    if (bar.ambiguousRelation) return "";
    if (bar.role === "neutral") return STOCK_NEUTRAL_DELTA_COLOR;
    if (bar.role === "enemy") return STOCK_ENEMY_DELTA_COLOR;
    if (bar.role === "ally") return STOCK_FRIEND_DELTA_COLOR;
    if (bar.team === "team1" || bar.team === "team2")
      return STOCK_TEAM_DELTA_COLOR;
    return "";
  }

  function stockBulletShieldColor(bar) {
    if (bar.ambiguousRelation) return "";
    if (bar.role === "enemy") return STOCK_ENEMY_BULLET_SHIELD_COLOR;
    if (bar.role === "ally") return STOCK_FRIEND_BULLET_SHIELD_COLOR;
    if (bar.team === "team1") return STOCK_TEAM1_BULLET_SHIELD_COLOR;
    if (bar.team === "team2") return STOCK_TEAM2_BULLET_SHIELD_COLOR;
    return STOCK_DEFAULT_BULLET_SHIELD_COLOR;
  }

  function styleMatches(panel, property, value) {
    if (!isValid(panel) || !panel.style) return false;
    try {
      return String(panel.style[property] || "") === String(value || "");
    } catch {
      return false;
    }
  }

  function setStyle(panel, property, value, cache, cacheKey) {
    if (!isValid(panel) || !panel.style) {
      if (cache) cache[cacheKey] = null;
      return;
    }
    if (
      cache &&
      cache[cacheKey] === value &&
      styleMatches(panel, property, value)
    )
      return;
    try {
      panel.style[property] = value === "" ? null : value;
      if (cache) cache[cacheKey] = value;
    } catch {
      if (cache) cache[cacheKey] = null;
      return;
    }
  }

  function setText(panel, value, cache, cacheKey) {
    if (!isValid(panel)) {
      if (cache) cache[cacheKey] = null;
      return;
    }
    if (cache && cache[cacheKey] === value) {
      return;
    }
    try {
      panel.text = value;
      if (cache) cache[cacheKey] = value;
    } catch {
      if (cache) cache[cacheKey] = null;
    }
  }

  function setOwnedClass(panel, className, enabled, cache, cacheKey) {
    var marker = enabled ? "1" : "0";
    if (!isValid(panel)) {
      if (cache) cache[cacheKey] = null;
      return;
    }
    if (
      cache &&
      cache[cacheKey] === marker &&
      hasClass(panel, className) === enabled
    ) {
      return;
    }
    try {
      if (enabled) {
        if (panel.AddClass) {
          panel.AddClass(className);
        }
      } else if (panel.RemoveClass) {
        panel.RemoveClass(className);
      }
      if (cache) cache[cacheKey] = marker;
    } catch {
      if (cache) cache[cacheKey] = null;
    }
  }
  function setPulseClasses(
    panel,
    baseClass,
    active,
    subtle,
    intense,
    cache,
    keys,
  ) {
    setOwnedClass(panel, baseClass, active, cache, keys[0]);
    setOwnedClass(
      panel,
      "HPColorsRewritePulseSubtle",
      active && subtle,
      cache,
      keys[1],
    );
    setOwnedClass(
      panel,
      "HPColorsRewritePulseIntense",
      active && intense,
      cache,
      keys[2],
    );
  }

  function setAnimationDuration(panel, duration, cache, cacheKey) {
    if (duration) {
      setStyle(panel, "animationDuration", duration, cache, cacheKey);
    } else {
      clearOwnedStyle(panel, "animationDuration", cache, cacheKey);
    }
  }


  function cachedStyleDrift(panel, property, cache, cacheKey) {
    return (
      cache &&
      Object.prototype.hasOwnProperty.call(cache, cacheKey) &&
      !styleMatches(panel, property, cache[cacheKey])
    );
  }

  function layoutStyleDrift(bar) {
    return (
      cachedStyleDrift(
        bar.parts.healthbars,
        "transform",
        bar.applied,
        "healthbarsTransform",
      ) ||
      cachedStyleDrift(
        bar.parts.healthbars,
        "transformOrigin",
        bar.applied,
        "healthbarsTransformOrigin",
      ) ||
      cachedStyleDrift(
        bar.parts.container,
        "height",
        bar.applied,
        "height",
      ) ||
      cachedStyleDrift(
        bar.parts.container,
        "transform",
        bar.applied,
        "transform",
      ) ||
      cachedStyleDrift(
        bar.parts.unitStatus,
        "transform",
        bar.applied,
        "unitStatusTransform",
      )
    );
  }


  function setReadoutText(bar, current, maximum) {
    setText(bar.parts.counter, current, bar.applied, "readoutText");
    setText(
      bar.parts.counterMax,
      maximum,
      bar.applied,
      "readoutMaximumText",
    );
  }

  function setReadoutVisibility(bar, current, maximum) {
    setStyle(
      bar.parts.counter,
      "visibility",
      current,
      bar.applied,
      "readoutVisibility",
    );
    setStyle(
      bar.parts.counterMax,
      "visibility",
      maximum,
      bar.applied,
      "readoutMaximumVisibility",
    );
  }

  function setReadoutStyle(bar, property, value, key, maximumKey) {
    setStyle(bar.parts.counter, property, value, bar.applied, key);
    setStyle(
      bar.parts.counterMax,
      property,
      value,
      bar.applied,
      maximumKey,
    );
  }


  function clearOwnedStyle(panel, property, cache, cacheKey) {
    setStyle(panel, property, "", cache, cacheKey);
  }

  function captureStyleBaseline(panel, properties) {
    var baseline = {};
    for (var index = 0; index < properties.length; index++) {
      var property = properties[index];
      try {
        baseline[property] =
          isValid(panel) && panel.style
            ? String(panel.style[property] || "")
            : "";
      } catch {
        baseline[property] = "";
      }
    }
    return baseline;
  }

  function baselineStyle(baseline, property) {
    return baseline &&
      Object.prototype.hasOwnProperty.call(baseline, property)
      ? baseline[property]
      : "";
  }


  function retainPanelBaseline(panel, previousPanel, baseline, properties) {
    if (panel === previousPanel && baseline) return baseline;
    return captureStyleBaseline(panel, properties);
  }

  function capturePanelBaseline(bar, previousParts, previousBaseline) {
    var parts = bar.parts || {};
    var oldParts = previousParts || {};
    var oldBaseline = previousBaseline || {};
    return {
      container: retainPanelBaseline(
        parts.container,
        oldParts.container,
        oldBaseline.container,
        ["opacity", "height", "transform"],
      ),
      healthbars: retainPanelBaseline(
        parts.healthbars,
        oldParts.healthbars,
        oldBaseline.healthbars,
        ["transform", "transformOrigin"],
      ),
      unitStatus: retainPanelBaseline(
        parts.unitStatus,
        oldParts.unitStatus,
        oldBaseline.unitStatus,
        ["transform"],
      ),
      ultBackground: retainPanelBaseline(
        parts.ultBackground,
        oldParts.ultBackground,
        oldBaseline.ultBackground,
        ["opacity"],
      ),
    };
  }

  function clearStaminaOwnership() {
    setStyle(
      staminaSurface.container,
      "transform",
      baselineStyle(staminaSurface.containerBaseline, "transform"),
      staminaSurface.applied,
      "transform",
    );
    setStyle(
      staminaSurface.container,
      "washColor",
      baselineStyle(staminaSurface.containerBaseline, "washColor"),
      staminaSurface.applied,
      "washColor",
    );
    for (var index = 0; index < staminaSurface.icons.length; index++) {
      var cache = staminaSurface.iconApplied[index] || {};
      var baseline = staminaSurface.iconBaselines[index] || {};
      setStyle(
        staminaSurface.icons[index],
        "width",
        baselineStyle(baseline, "width"),
        cache,
        "width",
      );
      setStyle(
        staminaSurface.icons[index],
        "height",
        baselineStyle(baseline, "height"),
        cache,
        "height",
      );
      setStyle(
        staminaSurface.icons[index],
        "backgroundColor",
        baselineStyle(baseline, "backgroundColor"),
        cache,
        "backgroundColor",
      );
      setStyle(
        staminaSurface.icons[index],
        "borderColor",
        baselineStyle(baseline, "borderColor"),
        cache,
        "borderColor",
      );
    }
  }

  function staminaCacheUsable(scope) {
    if (
      scope !== staminaSurface.scope ||
      !isValid(scope) ||
      !isValid(staminaSurface.container) ||
      !isDescendantOf(staminaSurface.container, scope) ||
      panelParent(staminaSurface.container) !== staminaSurface.containerParent ||
      panelChildCount(staminaSurface.container) !==
        staminaSurface.containerChildCount
    )
      return false;
    for (var index = 0; index < staminaSurface.icons.length; index++) {
      var icon = staminaSurface.icons[index];
      var parent = staminaSurface.iconParents[index];
      if (
        !isValid(icon) ||
        !hasClass(icon, "StaminaPipIcon") ||
        !isDescendantOf(icon, staminaSurface.container) ||
        panelParent(icon) !== parent ||
        panelChildCount(parent) !== staminaSurface.iconParentChildCounts[index]
      )
        return false;
    }
    return true;
  }

  function rebuildStaminaCache(scope, container) {
    clearStaminaOwnership();
    staminaSurface.scope = scope;
    staminaSurface.container = container;
    staminaSurface.containerParent = panelParent(container);
    staminaSurface.containerChildCount = panelChildCount(container);
    staminaSurface.icons = [];
    staminaSurface.iconParents = [];
    staminaSurface.iconParentChildCounts = [];
    staminaSurface.iconApplied = [];
    staminaSurface.iconBaselines = [];
    staminaSurface.containerBaseline = captureStyleBaseline(container, [
      "transform",
      "washColor",
    ]);
    staminaSurface.applied = {};
    collectPanelsWithClass(
      container,
      "StaminaPipIcon",
      staminaSurface.icons,
      0,
    );
    for (var index = 0; index < staminaSurface.icons.length; index++) {
      var icon = staminaSurface.icons[index];
      var parent = panelParent(icon);
      staminaSurface.iconParents.push(parent);
      staminaSurface.iconParentChildCounts.push(panelChildCount(parent));
      staminaSurface.iconApplied.push({});
      staminaSurface.iconBaselines.push(
        captureStyleBaseline(icon, [
          "width",
          "height",
          "backgroundColor",
          "borderColor",
        ]),
      );
    }
  }


  function applyStaminaSurface() {
    if (
      !isValid(staminaSurface.container) ||
      !config.enabled ||
      !staminaSurface.enemy
    ) {
      clearStaminaOwnership();
      return;
    }
    var widthOwned = config.staminaWidth !== 110;
    var heightOwned = config.staminaHeight !== 44.8;
    var transformOwned =
      config.staminaOffsetX !== 0 || config.staminaOffsetY !== 0;
    var transform = transformOwned
      ? "translateX(" +
        config.staminaOffsetX +
        "px) translateY(" +
        config.staminaOffsetY +
        "px)"
      : baselineStyle(staminaSurface.containerBaseline, "transform");
    var colorOwned = config.enemyStaminaColorEnabled;
    var color = colorOwned ? config.enemyStaminaColor : "";
    setStyle(
      staminaSurface.container,
      "transform",
      transform,
      staminaSurface.applied,
      "transform",
    );
    setStyle(
      staminaSurface.container,
      "washColor",
      colorOwned
        ? "#FFFFFF"
        : baselineStyle(staminaSurface.containerBaseline, "washColor"),
      staminaSurface.applied,
      "washColor",
    );
    for (var index = 0; index < staminaSurface.icons.length; index++) {
      var cache = staminaSurface.iconApplied[index];
      var baseline = staminaSurface.iconBaselines[index] || {};
      setStyle(
        staminaSurface.icons[index],
        "width",
        widthOwned
          ? config.staminaWidth + "px"
          : baselineStyle(baseline, "width"),
        cache,
        "width",
      );
      setStyle(
        staminaSurface.icons[index],
        "height",
        heightOwned
          ? config.staminaHeight + "px"
          : baselineStyle(baseline, "height"),
        cache,
        "height",
      );
      var empty = false;
      if (colorOwned) {
        var parent = staminaSurface.iconParents[index];
        empty =
          hasClass(staminaSurface.icons[index], "PipEmpty") ||
          hasClass(parent, "PipEmpty") ||
          hasClass(staminaSurface.icons[index], "StaminaRecentlyUsed") ||
          hasClass(parent, "StaminaRecentlyUsed") ||
          hasClass(staminaSurface.icons[index], "StaminaRecentlyDepleted") ||
          hasClass(parent, "StaminaRecentlyDepleted");
      }
      setStyle(
        staminaSurface.icons[index],
        "backgroundColor",
        colorOwned
          ? empty
            ? "#000000"
            : color
          : baselineStyle(baseline, "backgroundColor"),
        cache,
        "backgroundColor",
      );
      setStyle(
        staminaSurface.icons[index],
        "borderColor",
        colorOwned ? color : baselineStyle(baseline, "borderColor"),
        cache,
        "borderColor",
      );
    }
  }

  function reconcileStaminaSurface(bar) {
    var scope = bar && bar.parts ? bar.parts.windowRoot : null;
    if (!staminaCacheUsable(scope))
      rebuildStaminaCache(scope, findWithin(scope, "StaminaContainer"));
    staminaSurface.enemy = !!(
      bar &&
      bar.role === "enemy" &&
      !bar.ambiguousRelation
    );
    applyStaminaSurface();
  }


  function clearLevelOwnership(bar) {
    clearOwnedStyle(
      bar.parts && bar.parts.levelContainer,
      "visibility",
      bar.applied,
      "levelVisibility",
    );
    clearOwnedStyle(
      bar.parts && bar.parts.levelContainer,
      "borderColor",
      bar.applied,
      "levelBorderColor",
    );
    var wrapper = bar.levelWrapper;
    setOwnedClass(
      wrapper,
      LEVEL_VISIBLE_CLASS,
      false,
      bar.applied,
      "levelVisibleClass",
    );
    setOwnedClass(
      wrapper,
      LEVEL_HIDDEN_CLASS,
      false,
      bar.applied,
      "levelHiddenClass",
    );
    for (var index = 0; index < LEVEL_TIERS.length; index++)
      setOwnedClass(
        wrapper,
        LEVEL_TIERS[index].className,
        false,
        bar.applied,
        "levelTier" + index,
      );
  }
  function clearReadoutOwnership(bar) {
    clearOwnedStyle(
      bar.parts && bar.parts.pipLabel,
      "visibility",
      bar.applied,
      "pipVisibility",
    );
    clearLevelOwnership(bar);
  }
  function clearKillMarkerOwnership(bar) {
    var marker = bar.parts && bar.parts.killMarker;
    setStyle(
      marker,
      "visibility",
      "collapse",
      bar.applied,
      "killMarkerVisibility",
    );
    clearOwnedStyle(
      marker,
      "marginLeft",
      bar.applied,
      "killMarkerMarginLeft",
    );
    clearOwnedStyle(marker, "width", bar.applied, "killMarkerWidth");
    clearOwnedStyle(
      marker,
      "backgroundColor",
      bar.applied,
      "killMarkerBackgroundColor",
    );
  }

  function applyKillMarker(bar, show) {
    var marker = bar.parts && bar.parts.killMarker;
    var parentWidth = bar.sampleHealthParentWidth;
    bar.markerGeometryChanged = false;
    if (!show || !isValid(marker) || parentWidth <= 0) {
      clearKillMarkerOwnership(bar);
      return;
    }
    var width = Math.min(config.enemyKillMarkerWidth, parentWidth);
    var x = Math.round(
      (parentWidth * config.enemyKillMarkerThreshold) / 100 - width / 2,
    );
    x = Math.max(0, Math.min(parentWidth - width, x));
    setStyle(
      marker,
      "visibility",
      "visible",
      bar.applied,
      "killMarkerVisibility",
    );
    setStyle(
      marker,
      "marginLeft",
      x + "px",
      bar.applied,
      "killMarkerMarginLeft",
    );
    setStyle(marker, "width", width + "px", bar.applied, "killMarkerWidth");
    setStyle(
      marker,
      "backgroundColor",
      config.enemyKillMarkerColor,
      bar.applied,
      "killMarkerBackgroundColor",
    );
  }


  function applyReadoutDecorations(bar) {
    var enemyScope = config.enabled && bar.role === "enemy";
    setStyle(
      bar.parts.pipLabel,
      "visibility",
      enemyScope ? (config.pipsVisible ? "visible" : "collapse") : "",
      bar.applied,
      "pipVisibility",
    );

    var levelScope =
      config.enabled &&
      bar.role === "enemy" &&
      bar.isPlayer &&
      !bar.isBuilding &&
      !bar.isBoss &&
      isValid(bar.parts.levelContainer) &&
      isValid(bar.parts.levelLabel);
    if (!levelScope) {
      clearLevelOwnership(bar);
      return;
    }

    var wrapper =
      bar.levelWrapper ||
      findAncestorWithClass(bar.parts.levelContainer, "enemy") ||
      findAncestorWithClass(bar.parts.activeParent, "enemy");
    bar.levelWrapper = wrapper;
    var tier = bar.levelTier;
    var show = !!wrapper && config.levelsVisible && bar.level > 0;
    setStyle(
      bar.parts.levelContainer,
      "visibility",
      show ? "visible" : "collapse",
      bar.applied,
      "levelVisibility",
    );
    setOwnedClass(
      wrapper,
      LEVEL_VISIBLE_CLASS,
      show,
      bar.applied,
      "levelVisibleClass",
    );
    setOwnedClass(
      wrapper,
      LEVEL_HIDDEN_CLASS,
      !!wrapper && !config.levelsVisible,
      bar.applied,
      "levelHiddenClass",
    );
    for (var index = 0; index < LEVEL_TIERS.length; index++)
      setOwnedClass(
        wrapper,
        LEVEL_TIERS[index].className,
        show && tier === LEVEL_TIERS[index],
        bar.applied,
        "levelTier" + index,
      );
    setStyle(
      bar.parts.levelContainer,
      "borderColor",
      show && tier ? tier.color : "",
      bar.applied,
      "levelBorderColor",
    );
  }



  function clearPulse(bar) {
    if (
      !bar.pulseActive &&
      !bar.colorPulseActive &&
      !bar.pulseReadoutActive &&
      !bar.pulseDuration
    ) {
      bar.pulseRole = "";
      return;
    }
    var applied = bar.applied;
    var fill = bar.parts && bar.parts.fill;
    var overlay = bar.parts && bar.parts.pulseOverlay;
    var counter = bar.parts && bar.parts.counter;
    var counterMax = bar.parts && bar.parts.counterMax;
    setPulseClasses(
      fill,
      "HPColorsRewritePulse",
      false,
      false,
      false,
      applied,
      FILL_PULSE_KEYS,
    );
    setPulseClasses(
      overlay,
      "HPColorsRewriteColorPulse",
      false,
      false,
      false,
      applied,
      COLOR_PULSE_KEYS,
    );
    setPulseClasses(
      counter,
      "HPColorsRewritePulse",
      false,
      false,
      false,
      applied,
      READOUT_PULSE_KEYS,
    );
    setPulseClasses(
      counterMax,
      "HPColorsRewritePulse",
      false,
      false,
      false,
      applied,
      MAX_READOUT_PULSE_KEYS,
    );
    setAnimationDuration(fill, "", applied, "pulseAnimationDuration");
    setAnimationDuration(
      overlay,
      "",
      applied,
      "colorPulseAnimationDuration",
    );
    clearOwnedStyle(overlay, "washColor", applied, "colorPulseWashColor");
    clearOwnedStyle(overlay, "width", applied, "colorPulseWidth");
    clearOwnedStyle(overlay, "visibility", applied, "colorPulseVisibility");
    setAnimationDuration(
      counter,
      "",
      applied,
      "pulseReadoutAnimationDuration",
    );
    setAnimationDuration(
      counterMax,
      "",
      applied,
      "pulseMaximumReadoutAnimationDuration",
    );
    bar.pulseActive = false;
    bar.colorPulseActive = false;
    bar.pulseReadoutActive = false;
    bar.pulseDuration = "";
    bar.pulseRole = "";
  }

  function syncPulse(
    bar,
    shouldPulse,
    readoutActive,
    intensity,
    duration,
    colorPulse,
    pulseColor,
    overlayWidth,
  ) {
    if (!shouldPulse) {
      clearPulse(bar);
      return false;
    }
    var applied = bar.applied;
    var fill = bar.parts && bar.parts.fill;
    var overlay = bar.parts && bar.parts.pulseOverlay;
    var counter = bar.parts && bar.parts.counter;
    var counterMax = bar.parts && bar.parts.counterMax;
    var subtle = intensity === 0;
    var intense = intensity === 2;
    var useColorPulse = !!colorPulse && isValid(overlay);

    setPulseClasses(
      fill,
      "HPColorsRewritePulse",
      true,
      subtle,
      intense,
      applied,
      FILL_PULSE_KEYS,
    );
    setAnimationDuration(fill, duration, applied, "pulseAnimationDuration");
    setPulseClasses(
      overlay,
      "HPColorsRewriteColorPulse",
      useColorPulse,
      subtle,
      intense,
      applied,
      COLOR_PULSE_KEYS,
    );
    if (useColorPulse) {
      setAnimationDuration(
        overlay,
        duration,
        applied,
        "colorPulseAnimationDuration",
      );
      setStyle(
        overlay,
        "washColor",
        pulseColor,
        applied,
        "colorPulseWashColor",
      );
      setStyle(overlay, "width", overlayWidth, applied, "colorPulseWidth");
      setStyle(
        overlay,
        "visibility",
        "visible",
        applied,
        "colorPulseVisibility",
      );
    } else {
      setAnimationDuration(
        overlay,
        "",
        applied,
        "colorPulseAnimationDuration",
      );
      clearOwnedStyle(overlay, "washColor", applied, "colorPulseWashColor");
      clearOwnedStyle(overlay, "width", applied, "colorPulseWidth");
      clearOwnedStyle(overlay, "visibility", applied, "colorPulseVisibility");
    }

    setPulseClasses(
      counter,
      "HPColorsRewritePulse",
      !!readoutActive,
      subtle,
      intense,
      applied,
      READOUT_PULSE_KEYS,
    );
    setPulseClasses(
      counterMax,
      "HPColorsRewritePulse",
      !!readoutActive,
      subtle,
      intense,
      applied,
      MAX_READOUT_PULSE_KEYS,
    );
    setAnimationDuration(
      counter,
      readoutActive ? duration : "",
      applied,
      "pulseReadoutAnimationDuration",
    );
    setAnimationDuration(
      counterMax,
      readoutActive ? duration : "",
      applied,
      "pulseMaximumReadoutAnimationDuration",
    );
    bar.pulseActive = true;
    bar.colorPulseActive = useColorPulse;
    bar.pulseReadoutActive = !!readoutActive;
    bar.pulseDuration = duration;
    return true;
  }

  function pulseOverlayWidth(bar) {
    if (bar.sampleTotalParentWidth <= 0) return "0%";
    var percent = Math.max(
      0,
      Math.min(100, (bar.sampleFillWidth / bar.sampleTotalParentWidth) * 100),
    );
    return Math.round(percent * 100) / 100 + "%";
  }

  function pulseDuration(bpm) {
    return (60 / bpm).toFixed(3) + "s";
  }

  function updateStockDimensions(bar) {
    var height = 120;
    if (bar.isSentry || bar.isMinion) height = 70;
    if (bar.stockHeight === height) return;
    bar.stockHeight = height;
  }

  function applyActiveCustomization(bar, role, panelBaseline) {
    var roleEnabled = role === "enemy" ? config.enemyEnabled : config.allyEnabled;
    var colorsEnabled = roleEnabled;
    var visible = role === "enemy" ? config.enemyVisible : config.allyVisible;
    var mode = role === "enemy" ? config.enemyMode : config.allyMode;
    var low = role === "enemy" ? config.enemyLow : config.allyLow;
    var mid = role === "enemy" ? config.enemyMid : config.allyMid;
    var high = role === "enemy" ? config.enemyHigh : config.allyHigh;
    var teamHighEnabled =
      role === "enemy" ? config.enemyTeamHigh : config.allyTeamHigh;
    if (teamHighEnabled) high = teamHighColor(bar.team, high);
    var healing =
      colorsEnabled
        ? role === "enemy"
          ? config.enemyHealing
          : config.allyHealing
        : STOCK_HEALING_COLOR;
    var delta =
      colorsEnabled
        ? role === "enemy"
          ? config.enemyDelta
          : config.allyDelta
        : stockDeltaColor(bar);
    var bulletShield =
      colorsEnabled
        ? role === "enemy"
          ? config.enemyBulletShield
          : config.allyBulletShield
        : stockBulletShieldColor(bar);
    var stockColor = stockUnitColor(bar);
    var color = stockColor;
    if (colorsEnabled)
      color =
        mode === "gradient"
          ? gradientColor(bar.lastWidthPercent, low, mid, high)
          : fixedColor(bar.lastWidthPercent, low, mid, high);
    var ultColor = stockColor;
    if (config.ultMode === "custom") ultColor = config.ultCustom;
    else if (colorsEnabled) ultColor = color;
    var readoutEnabled = role === "enemy" && config.readoutVisible;
    bar.readoutMaximumText = "";
    var readoutText = readoutEnabled ? formatReadout(bar) : "";
    var readoutVisibility = readoutText ? "visible" : "collapse";
    var readoutMaximumText = readoutEnabled
      ? bar.readoutMaximumText
      : "";
    var readoutMaximumVisibility = readoutMaximumText
      ? "visible"
      : "collapse";
    var readoutLow =
      config.readoutColorMode === "custom" ? config.readoutLow : low;
    var readoutMid =
      config.readoutColorMode === "custom" ? config.readoutMid : mid;
    var readoutHigh =
      config.readoutColorMode === "custom" ? config.readoutHigh : high;
    var readoutMode =
      config.readoutColorMode === "custom" ? config.readoutMode : mode;
    var readoutColor = readoutEnabled
      ? readoutMode === "gradient"
        ? gradientColor(
            bar.lastWidthPercent,
            readoutLow,
            readoutMid,
            readoutHigh,
          )
        : fixedColor(
            bar.lastWidthPercent,
            readoutLow,
            readoutMid,
            readoutHigh,
          )
      : "";
    var readoutMaximumColor =
      readoutMaximumText && config.readoutMaxTeamColor
        ? teamHighColor(bar.team, readoutColor)
        : readoutColor;
    var readoutFontSize = "";
    var readoutFontFamily =
      config.readoutFont === "oracle"
        ? "VALVEOracle, Reaver, sans-serif"
        : config.readoutFont === "pulp"
          ? "VALVEPulp, Noto Sans, sans-serif"
          : "Retail Demo, Noto Sans, sans-serif";
    var readoutTransform = "";

    var pulseEnabled =
      colorsEnabled &&
      (role === "enemy" ? config.enemyPulseEnabled : config.allyPulseEnabled);
    var pulseThreshold =
      role === "enemy"
        ? config.enemyPulseThreshold
        : config.allyPulseThreshold;
    var shouldPulse =
      pulseEnabled && bar.lastWidthPercent <= pulseThreshold;
    var pulseReadoutAnimationActive =
      role === "enemy" &&
      shouldPulse &&
      config.enemyPulseReadout &&
      readoutEnabled;
    var pulseReadoutModifiersActive =
      role === "enemy" &&
      shouldPulse &&
      config.enemyPulseReadoutModifiers &&
      readoutEnabled;
    if (readoutEnabled)
      readoutFontSize =
        (pulseReadoutModifiersActive
          ? config.enemyPulseReadoutSize
          : config.readoutSize) + "px";
    if (readoutEnabled) {
      var readoutOffsetX =
        (pulseReadoutModifiersActive
          ? config.enemyPulseReadoutOffsetX
          : config.readoutOffsetX) - 27;
      var readoutOffsetY =
        (pulseReadoutModifiersActive
          ? config.enemyPulseReadoutOffsetY
          : config.readoutOffsetY) - 500;
      readoutTransform =
        "translate3d(" +
        readoutOffsetX +
        "px, " +
        readoutOffsetY +
        "px, 0px)";
    }
    var pulseIntensity =
      role === "enemy"
        ? config.enemyPulseIntensity
        : config.allyPulseIntensity;
    var pulseBpm =
      role === "enemy" ? config.enemyPulseBpm : config.allyPulseBpm;
    var pulseColorEnabled =
      role === "enemy"
        ? config.enemyPulseColorEnabled
        : config.allyPulseColorEnabled;
    var pulseColorMode =
      role === "enemy"
        ? config.enemyPulseColorMode
        : config.allyPulseColorMode;
    var pulseColor =
      role === "enemy" ? config.enemyPulseColor : config.allyPulseColor;
    var colorPulse =
      shouldPulse &&
      pulseColorEnabled &&
      pulseColorMode === "gradient";
    var pulseActive = syncPulse(
      bar,
      shouldPulse,
      pulseReadoutAnimationActive,
      pulseIntensity,
      pulseDuration(pulseBpm),
      colorPulse,
      pulseColor,
      pulseOverlayWidth(bar),
    );
    if (pulseActive) {
      if (pulseColorEnabled && pulseColorMode === "fixed") color = pulseColor;
      if (config.ultMode !== "custom") ultColor = color;
    }
    applyKillMarker(
      bar,
      role === "enemy" &&
        config.enemyEnabled &&
        config.enemyKillMarkerEnabled &&
        bar.isPlayer &&
        !bar.isBuilding &&
        !bar.isBoss &&
        config.enemyVisible &&
        !(pulseActive && config.enemyPulseHideBar),
    );
    updateStockDimensions(bar);
    var healthbarsTransform =
      config.widthScale === 100
        ? baselineStyle(panelBaseline.healthbars, "transform")
        : "scaleX(" +
          String(Math.round(config.widthScale * 10) / 1000) +
          ")";
    var healthbarsTransformOrigin =
      config.widthScale === 100
        ? baselineStyle(panelBaseline.healthbars, "transformOrigin")
        : "200px 50%";
    var height =
      Math.round((bar.stockHeight * config.heightScale) / 100) + "px";
    var unitStatusTransform =
      config.positionX === 0 && config.positionY === 0
        ? baselineStyle(panelBaseline.unitStatus, "transform")
        : "translateX(" +
          config.positionX +
          "px) translateY(" +
          config.positionY +
          "px)";
    var opacity =
      bar.isGhoul && config.ghoulOpacityEnabled
        ? config.ghoulOpacity <= 1
          ? "0.01"
          : String(config.ghoulOpacity / 100)
        : colorsEnabled
          ? visible &&
            !(pulseActive && role === "enemy" && config.enemyPulseHideBar)
            ? "1"
            : "0.01"
          : baselineStyle(panelBaseline.container, "opacity");
    var ultBackgroundOpacity = colorsEnabled
      ? opacity
      : baselineStyle(panelBaseline.ultBackground, "opacity");
    applyReadoutDecorations(bar);
    setStyle(bar.parts.container, "opacity", opacity, bar.applied, "opacity");
    setStyle(
      bar.parts.ultBackground,
      "opacity",
      ultBackgroundOpacity,
      bar.applied,
      "ultBackgroundOpacity",
    );

    setStyle(bar.parts.fill, "washColor", color, bar.applied, "washColor");
    setStyle(
      bar.parts.healing,
      "washColor",
      healing,
      bar.applied,
      "healingWashColor",
    );
    setStyle(
      bar.parts.delta,
      "washColor",
      delta,
      bar.applied,
      "deltaWashColor",
    );
    setStyle(
      bar.parts.bulletShield,
      "backgroundColor",
      bulletShield,
      bar.applied,
      "bulletShieldBackgroundColor",
    );
    setStyle(
      bar.parts.ultIcon,
      "washColor",
      ultColor,
      bar.applied,
      "ultWashColor",
    );
    setStyle(
      bar.parts.healthbars,
      "transformOrigin",
      healthbarsTransformOrigin,
      bar.applied,
      "healthbarsTransformOrigin",
    );
    setStyle(
      bar.parts.healthbars,
      "transform",
      healthbarsTransform,
      bar.applied,
      "healthbarsTransform",
    );
    setStyle(bar.parts.container, "height", height, bar.applied, "height");
    setStyle(
      bar.parts.container,
      "transform",
      baselineStyle(panelBaseline.container, "transform"),
      bar.applied,
      "transform",
    );
    setStyle(
      bar.parts.unitStatus,
      "transform",
      unitStatusTransform,
      bar.applied,
      "unitStatusTransform",
    );
    setReadoutVisibility(
      bar,
      readoutVisibility,
      readoutMaximumVisibility,
    );
    setReadoutText(bar, readoutText, readoutMaximumText);
    setReadoutStyle(
      bar,
      "fontSize",
      readoutFontSize,
      "readoutFontSize",
      "readoutMaximumFontSize",
    );
    setReadoutStyle(
      bar,
      "height",
      readoutEnabled ? "fit-children" : "",
      "readoutHeight",
      "readoutMaximumHeight",
    );
    setReadoutStyle(
      bar,
      "fontFamily",
      readoutFontFamily,
      "readoutFontFamily",
      "readoutMaximumFontFamily",
    );
    setStyle(
      bar.parts.counterAnchor,
      "transform",
      readoutTransform,
      bar.applied,
      "readoutTransform",
    );
    setStyle(
      bar.parts.counter,
      "washColor",
      readoutColor,
      bar.applied,
      "readoutWashColor",
    );
    setStyle(
      bar.parts.counterMax,
      "washColor",
      readoutMaximumColor,
      bar.applied,
      "readoutMaximumWashColor",
    );
    bar.dirty = 0;
  }

  function restoreInactiveCustomization(
    bar,
    restoring,
    relationOwned,
    panelBaseline,
  ) {
    if (restoring || !config.enabled || !relationOwned) {
      clearPulse(bar);
      clearKillMarkerOwnership(bar);
      if (restoring) clearReadoutOwnership(bar);
      else applyReadoutDecorations(bar);
      var stockColor = stockUnitColor(bar);
      setStyle(
        bar.parts.fill,
        "washColor",
        stockColor,
        bar.applied,
        "washColor",
      );
      setStyle(
        bar.parts.healing,
        "washColor",
        STOCK_HEALING_COLOR,
        bar.applied,
        "healingWashColor",
      );
      setStyle(
        bar.parts.delta,
        "washColor",
        stockDeltaColor(bar),
        bar.applied,
        "deltaWashColor",
      );
      setStyle(
        bar.parts.bulletShield,
        "backgroundColor",
        stockBulletShieldColor(bar),
        bar.applied,
        "bulletShieldBackgroundColor",
      );
      setStyle(
        bar.parts.ultIcon,
        "washColor",
        stockColor,
        bar.applied,
        "ultWashColor",
      );
      setStyle(
        bar.parts.container,
        "opacity",
        baselineStyle(panelBaseline.container, "opacity"),
        bar.applied,
        "opacity",
      );
      setStyle(
        bar.parts.ultBackground,
        "opacity",
        baselineStyle(panelBaseline.ultBackground, "opacity"),
        bar.applied,
        "ultBackgroundOpacity",
      );
      setStyle(
        bar.parts.healthbars,
        "transformOrigin",
        baselineStyle(panelBaseline.healthbars, "transformOrigin"),
        bar.applied,
        "healthbarsTransformOrigin",
      );
      setStyle(
        bar.parts.healthbars,
        "transform",
        baselineStyle(panelBaseline.healthbars, "transform"),
        bar.applied,
        "healthbarsTransform",
      );
      setStyle(
        bar.parts.container,
        "height",
        baselineStyle(panelBaseline.container, "height"),
        bar.applied,
        "height",
      );
      setStyle(
        bar.parts.container,
        "transform",
        baselineStyle(panelBaseline.container, "transform"),
        bar.applied,
        "transform",
      );
      setStyle(
        bar.parts.unitStatus,
        "transform",
        baselineStyle(panelBaseline.unitStatus, "transform"),
        bar.applied,
        "unitStatusTransform",
      );
      setReadoutVisibility(bar, "collapse", "collapse");
      setReadoutText(bar, "", "");
      setReadoutStyle(
        bar,
        "fontSize",
        "",
        "readoutFontSize",
        "readoutMaximumFontSize",
      );
      setReadoutStyle(
        bar,
        "height",
        "",
        "readoutHeight",
        "readoutMaximumHeight",
      );
      setReadoutStyle(
        bar,
        "fontFamily",
        "",
        "readoutFontFamily",
        "readoutMaximumFontFamily",
      );
      setStyle(
        bar.parts.counterAnchor,
        "transform",
        "",
        bar.applied,
        "readoutTransform",
      );
      setStyle(
        bar.parts.counter,
        "washColor",
        "",
        bar.applied,
        "readoutWashColor",
      );
      setStyle(
        bar.parts.counterMax,
        "washColor",
        "",
        bar.applied,
        "readoutMaximumWashColor",
      );
      bar.dirty = 0;
      return true;
    }
    return false;
  }

  function applyCustomization(bar, restoring) {
    if (!bar.dirty || !isComplete(bar.parts)) return;
    var role = bar.role;
    var relationOwned = role === "enemy" || role === "ally";
    if (bar.pulseRole && bar.pulseRole !== role) clearPulse(bar);
    bar.pulseRole = role;
    var panelBaseline = bar.panelBaseline || {};
    if (
      restoreInactiveCustomization(
        bar,
        restoring,
        relationOwned,
        panelBaseline,
      )
    )
      return;
    applyActiveCustomization(bar, role, panelBaseline);
  }

  function restoreBarOwnership(bar) {
    if (!bar) return;
    bar.dirty = true;
    applyCustomization(bar, true);
  }

  function applyConfigRaw(raw) {
    if (!raw || raw === configRaw) return false;
    try {
      var data = JSON.parse(raw);
      if (
        !data ||
        data.magic_word !== CONFIG_MAGIC ||
        data.version !== CONFIG_VERSION ||
        !data.values
      )
        return false;
      var revision = data.revision;
      if (
        !Number.isFinite(revision) ||
        Math.floor(revision) !== revision ||
        revision < 0 ||
        revision <= configRevision
      )
        return false;
      var previousPrecisePips = !!config.precisePipsEnabled;
      config = normalizeConfig(data.values);
      if (previousPrecisePips !== !!config.precisePipsEnabled)
        for (var pipIndex = 0; pipIndex < bars.length; pipIndex++)
          updatePipMaximum(
            bars[pipIndex],
            readPipText(bars[pipIndex].parts.pipLabel),
          );
      configRaw = raw;
      configRevision = revision;
      for (var index = 0; index < bars.length; index++) {
        bars[index].dirty = true;
        applyCustomization(bars[index]);
      }
      applyStaminaSurface();
      return true;
    } catch {
      return false;
    }
  }

  function readRootConfig() {
    var nextRoot = absoluteRoot(context);
    if (nextRoot !== configRoot) {
      configRoot = nextRoot;
      configRaw = "";
      configRevision = -1;
    }
    if (!isValid(configRoot) || !configRoot.GetAttributeString) return "";
    try {
      return String(configRoot.GetAttributeString(CONFIG_ATTR, "") || "");
    } catch {
      return "";
    }
  }

  function inspectRootConfig() {
    var raw = readRootConfig();
    if (raw && raw !== configRaw) applyConfigRaw(raw);
  }

  function onConfigEvent(payload) {
    try {
      applyConfigRaw(
        payload === String(payload) ? payload : JSON.stringify(payload),
      );
    } catch {}
  }

  function reportData(bar) {
    if (!isComplete(bar.parts)) return;
    classifyTarget(bar);
    if (!bar.healthSampled || !colorRefreshEnabled(bar))
      sampleHealthPercent(bar);
    updatePipMaximum(bar, readPipText(bar.parts.pipLabel));
    updateLevel(bar, readPipText(bar.parts.levelLabel));
    if (!bar.dirty && layoutStyleDrift(bar)) bar.dirty = true;
    if (bar.dirty) applyCustomization(bar);
  }

  function addBar(parts) {
    var bar = {
      generation: 1,
      dirty: true,
      lastWidthPercent: -1,
      healthSampled: false,
      healthPresentationChanged: false,
      pulseOverlayPercent: -1,
      partsRetryJob: null,
      sampleFillWidth: 0,
      sampleTotalParentWidth: 0,
      sampleHealthParentWidth: 0,
      markerGeometryChanged: false,
      pipText: "",
      pipProfile: null,
      rawMaximumHealth: 0,
      levelText: "",
      level: 0,
      levelTier: null,
      levelWrapper: null,
      applied: {},
      pulseActive: false,
      colorPulseActive: false,
      pulseReadoutActive: false,
      pulseDuration: "",
      pulseRole: "",
      role: "",
      isPlayer: false,
      ambiguousRelation: false,
      team: "",
      isBuilding: false,
      isBoss: false,
      isSentry: false,
      isMinion: false,
      isGhoul: false,
      stockHeight: 0,
      seen: true,
      parts: parts,
    };
    bar.panelBaseline = capturePanelBaseline(bar);
    bars.push(bar);
    reportData(bar);
    schedulePartsRetry(bar);
    return bar;
  }

  function refreshBarParts(bar) {
    var nextParts = resolveParts(bar.parts.activeParent);
    if (sameParts(bar.parts, nextParts)) return false;
    var previousParts = bar.parts;
    var previousBaseline = bar.panelBaseline;
    cancelPartsRetry(bar);
    clearPulse(bar);
    clearReadoutOwnership(bar);
    clearKillMarkerOwnership(bar);
    bar.parts = nextParts;
    bar.generation += 1;
    bar.dirty = true;
    bar.applied = {};
    bar.panelBaseline = capturePanelBaseline(
      bar,
      previousParts,
      previousBaseline,
    );
    bar.levelWrapper = null;
    bar.levelText = "";
    bar.level = 0;
    bar.levelTier = null;
    bar.pipText = null;
    bar.pipProfile = null;
    bar.rawMaximumHealth = 0;
    bar.lastWidthPercent = -1;
    bar.healthSampled = false;
    bar.healthPresentationChanged = false;
    bar.pulseOverlayPercent = -1;
    bar.sampleFillWidth = 0;
    bar.sampleTotalParentWidth = 0;
    bar.sampleHealthParentWidth = 0;
    bar.stockHeight = 0;
    return true;
  }

  function reconcileBars() {
    for (var index = 0; index < bars.length; index++) bars[index].seen = false;
    var staminaBar = null;

    var activeParent = liveActiveParent();
    if (isValid(activeParent)) {
      var bar = findBarByParent(activeParent);
      if (!bar) {
        bar = addBar(resolveParts(activeParent));
      } else {
        bar.seen = true;
        refreshBarParts(bar);
        schedulePartsRetry(bar);

        reportData(bar);
      }
      staminaBar = bar;
    }

    for (var removeIndex = bars.length - 1; removeIndex >= 0; removeIndex--) {
      var removedBar = bars[removeIndex];
      if (removedBar.seen) continue;
      cancelPartsRetry(removedBar);
      removedBar.generation += 1;
      restoreBarOwnership(removedBar);
      bars.splice(removeIndex, 1);
    }
    reconcileStaminaSurface(staminaBar);
  }
  function colorRefreshEnabled(bar) {
    if (!config.enabled) return false;
    if (bar.role === "enemy") return config.enemyEnabled;
    if (bar.role === "ally") return config.allyEnabled;
    return false;
  }

  function refreshColor(bar) {
    if (!isComplete(bar.parts)) return false;
    if (!colorRefreshEnabled(bar)) {
      if (!bar.dirty) return false;
      applyCustomization(bar);
      return true;
    }
    var widthPercent = sampleHealthPercent(bar);
    if (widthPercent < 0) {
      var invalidReadoutChanged = false;
      if (bar.healthPresentationChanged) {
        bar.readoutMaximumText = "";
        setReadoutText(bar, "", "");
        invalidReadoutChanged = true;
      }
      if (
        bar.markerGeometryChanged &&
        bar.applied.killMarkerVisibility === "visible"
      ) {
        applyKillMarker(bar, false);
        return true;
      }
      return invalidReadoutChanged;
    }
    if (!bar.healthPresentationChanged) {
      if (
        !bar.markerGeometryChanged ||
        bar.applied.killMarkerVisibility !== "visible"
      ) {
        return false;
      }
      applyKillMarker(bar, true);
      return true;
    }
    applyCustomization(bar);
    return true;
  }




  function teardown() {
    if (stopped) return;
    stopped = true;
    for (var index = 0; index < bars.length; index++) {
      cancelPartsRetry(bars[index]);
      bars[index].generation += 1;
      restoreBarOwnership(bars[index]);
    }
    clearStaminaOwnership();
    try {
      if (scanJob && $.CancelScheduled) $.CancelScheduled(scanJob);
      if (paintJob && $.CancelScheduled) $.CancelScheduled(paintJob);
    } catch {}
    scanJob = null;
    paintJob = null;
    try {
      if (eventHandlerId !== null && $.UnregisterForUnhandledEvent)
        $.UnregisterForUnhandledEvent(EVENT_CHANNEL, eventHandlerId);
    } catch {}
    eventHandlerId = null;
  }

  function paintColors() {
    paintJob = null;
    if (!isValid(context)) {
      teardown();
      return;
    }
    var changed = false;
    for (var index = 0; index < bars.length; index++) {
      if (refreshColor(bars[index])) changed = true;
    }
    var now = Date.now ? Date.now() : +new Date();
    if (changed) lastColorChangeAt = now;
    var delay = changed
      ? PAINT_ACTIVE_SEC
      : lastColorChangeAt && now - lastColorChangeAt <= PAINT_RECENT_MS
        ? PAINT_RECENT_SEC
        : PAINT_IDLE_SEC;
    paintJob = $.Schedule(delay, paintColors);
  }

  function scan() {
    scanJob = null;
    if (!isValid(context)) {
      teardown();
      return;
    }
    inspectRootConfig();
    reconcileBars();
    scanJob = $.Schedule(SCAN_INTERVAL_SEC, scan);
  }
  try {
    eventHandlerId = $.RegisterForUnhandledEvent(EVENT_CHANNEL, onConfigEvent);
  } catch (error) {}
  inspectRootConfig();
  scan();
  paintColors();
})();
