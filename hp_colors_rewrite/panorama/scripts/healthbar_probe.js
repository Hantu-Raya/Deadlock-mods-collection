(function () {
  "use strict";

  var SCAN_INTERVAL_SEC = 1;
  var PAINT_ACTIVE_SEC = 0.15;
  var PAINT_RECENT_SEC = 0.25;
  var PAINT_IDLE_SEC = 1.5;
  var PAINT_RECENT_MS = 2000;
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var CONFIG_MAGIC = "HP_COLORS_REWRITE_CONFIG";
  var CONFIG_ATTR = "hp_colors_rewrite_config";

  if (!$.HPColorsContractFactory || !$.HPColorsContractFactory.create)
    throw new Error("HP Colors settings contract unavailable");
  var settingsContract = $.HPColorsContractFactory.create();
  delete $.HPColorsContractFactory;
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
  var LEVEL_TIERS = [
    { minimum: 11, className: "level_tier2", color: "#f0d000" },
    { minimum: 19, className: "level_tier3", color: "#ff8c00" },
    { minimum: 27, className: "level_tier4", color: "#e53935" },
    { minimum: 35, className: "level_tier5", color: "#8b0000" },
  ];

  var context = $.GetContextPanel();
  var probeId =
    "probe_" +
    String(Date.now ? Date.now() : +new Date()) +
    "_" +
    String(Math.floor(Math.random() * 1000000000));
  var nextBarSequence = 1;
  var bars = [];
  var didLogInitialScan = false;
  var configRoot = null;
  var configRaw = "";
  var config = normalizeConfig(null);
  var lastColorChangeAt = 0;
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

  function classifyTarget(bar) {
    var current = bar.parts.activeParent;
    var neutral = false;
    var enemy = false;
    var ally = false;
    var player = false;
    var vertical = false;
    var team = "";
    var building = false;
    var boss = false;
    var sentry = false;
    var bossDimensions = false;
    for (var depth = 0; current && depth < 12; depth++) {
      neutral = neutral || hasClass(current, "team_neutral");
      enemy = enemy || hasClass(current, "enemy");
      ally = ally || hasClass(current, "friend");
      player = player || hasClass(current, "player");
      vertical = vertical || hasClass(current, "verticalHealthbars");
      if (!team && hasClass(current, "team1")) team = "team1";
      if (!team && hasClass(current, "team2")) team = "team2";
      sentry = sentry || hasClass(current, "sentry");
      building = building || sentry || hasClass(current, "building");
      var tierBoss =
        hasClass(current, "boss_tier1") ||
        hasClass(current, "boss_tier2") ||
        hasClass(current, "boss_tier3");
      bossDimensions = bossDimensions || tierBoss;
      boss = boss || tierBoss || hasClass(current, "boss_barracks");
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch {
        break;
      }
    }
    var role = neutral ? "neutral" : enemy ? "enemy" : ally ? "ally" : "other";
    var changed =
      role !== bar.role ||
      player !== bar.isPlayer ||
      vertical !== bar.isVertical ||
      team !== bar.team ||
      building !== bar.isBuilding ||
      boss !== bar.isBoss ||
      sentry !== bar.isSentry ||
      bossDimensions !== bar.usesBossDimensions;
    if (!changed) return false;
    clearLevelOwnership(bar);
    bar.role = role;
    bar.isPlayer = player;
    bar.isVertical = vertical;
    bar.team = team;
    bar.isBuilding = building;
    bar.isBoss = boss;
    bar.isSentry = sentry;
    bar.usesBossDimensions = bossDimensions;
    bar.levelWrapper =
      findAncestorWithClass(bar.parts.levelContainer, "enemy") ||
      findAncestorWithClass(bar.parts.activeParent, "enemy");
    bar.stockWidth = 0;
    bar.stockHeight = 0;
    bar.dirty = true;
    $.Msg(
      "[HP Colors Rewrite] role id=" +
        bar.instanceId +
        " value=" +
        role +
        " player=" +
        String(player) +
        " team=" +
        (team || "unknown") +
        " building=" +
        String(building) +
        " boss=" +
        String(boss),
    );
    return true;
  }


  function resolveParts(activeParent) {
    var container = findAncestor(activeParent, "UnitHealthbarContainer");
    var infoHealth = findAncestor(activeParent, "InfoHealthContainer");
    var unitStatus = findAncestor(activeParent, "UnitStatus");
    return {
      container: container,
      infoHealth: infoHealth,
      unitStatus: unitStatus,
      activeParent: activeParent,
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
      counterAnchor: findWithin(unitStatus, "hp_counter_anchor"),
      counter: findWithin(unitStatus, "hp_counter"),
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

  function cachedPartsUsable(bar) {
    var parts = bar.parts;
    if (
      !parts ||
      !isValid(parts.activeParent) ||
      !isValid(parts.container) ||
      !isValid(parts.background) ||
      !isValid(parts.fill) ||
      (parts.infoHealth && !isValid(parts.infoHealth)) ||
      (parts.unitStatus && !isValid(parts.unitStatus)) ||
      !isDescendantOf(parts.activeParent, parts.container) ||
      !isDescendantOf(parts.background, parts.container) ||
      !isDescendantOf(parts.fill, parts.activeParent) ||
      !isDescendantOf(parts.activeParent, parts.infoHealth) ||
      !isDescendantOf(parts.activeParent, parts.unitStatus)
    )
      return false;
    if (
      (parts.pulseOverlay &&
        (!isValid(parts.pulseOverlay) ||
          !isDescendantOf(parts.pulseOverlay, parts.activeParent))) ||
      (parts.killMarker &&
        (!isValid(parts.killMarker) ||
          !isDescendantOf(parts.killMarker, parts.container))) ||
      (parts.healing &&
        (!isValid(parts.healing) ||
          !isDescendantOf(parts.healing, parts.activeParent))) ||
      (parts.delta &&
        (!isValid(parts.delta) ||
          !isDescendantOf(parts.delta, parts.activeParent))) ||
      (parts.bulletShield &&
        (!isValid(parts.bulletShield) ||
          !isDescendantOf(parts.bulletShield, parts.activeParent))) ||
      (parts.techShield &&
        (!isValid(parts.techShield) ||
          !isDescendantOf(parts.techShield, parts.activeParent))) ||
      (parts.pipLabel &&
        (!isValid(parts.pipLabel) ||
          !isDescendantOf(parts.pipLabel, parts.activeParent))) ||
      (parts.levelContainer &&
        (!isValid(parts.levelContainer) ||
          !isDescendantOf(parts.levelContainer, parts.infoHealth))) ||
      (parts.levelLabel &&
        (!isValid(parts.levelLabel) ||
          !isDescendantOf(parts.levelLabel, parts.unitStatus))) ||
      (parts.counterAnchor &&
        (!isValid(parts.counterAnchor) ||
          !isDescendantOf(parts.counterAnchor, parts.unitStatus))) ||
      (parts.counter &&
        (!isValid(parts.counter) ||
          !isDescendantOf(parts.counter, parts.counterAnchor))) ||
      (parts.ultIcon &&
        (!isValid(parts.ultIcon) ||
          !isDescendantOf(parts.ultIcon, parts.infoHealth)))
    )
      return false;

    var missing =
      !parts.infoHealth ||
      !parts.unitStatus ||
      !parts.pulseOverlay ||
      !parts.healing ||
      !parts.delta ||
      !parts.bulletShield ||
      !parts.techShield ||
      !parts.pipLabel ||
      !parts.levelContainer ||
      !parts.levelLabel ||
      !parts.killMarker ||
      !parts.counterAnchor ||
      !parts.counter ||
      !parts.ultIcon;
    if (missing) {
      var now = Date.now ? Date.now() : +new Date();
      if (bar.partsRetryAt && now < bar.partsRetryAt) return true;
      bar.partsRetryAt = now + SCAN_INTERVAL_SEC * 1000;
      return false;
    }
    bar.partsRetryAt = 0;
    return true;
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
    bar.sampleShieldWidth = shieldWidth;
    bar.sampleHealthParentWidth = healthParentWidth;
    bar.markerGeometryChanged =
      bar.markerGeometryChanged || healthParentChanged;
    bar.pulseOverlayPercent = overlayPercent;
    if (healthParentWidth <= 0) {
      bar.healthPresentationChanged = !sampled;
      if (bar.healthPresentationChanged) bar.dirty = true;
      return -1;
    }
    var widthPercent = Math.max(
      0,
      Math.min(100, ((fillWidth / healthParentWidth) * 100) | 0),
    );
    var percentChanged = !sampled || widthPercent !== previousPercent;
    bar.healthPresentationChanged =
      percentChanged || (bar.colorPulseActive && overlayChanged);
    bar.lastWidthPercent = widthPercent;
    if (bar.healthPresentationChanged) bar.dirty = true;
    return widthPercent;
  }

  function readPipText(panel) {
    try {
      if (panel.text === String(panel.text)) return panel.text;
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
    if (config.readoutFormat === "percent")
      return String(bar.lastWidthPercent) + "%";
    var health = readoutHealth(bar);
    if (health.maximum <= 0) return "";
    if (config.readoutFormat === "current") return String(health.current);
    return health.current + " / " + health.maximum;
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
    if (bar.role === "neutral") return STOCK_NEUTRAL_COLOR;
    if (bar.role === "enemy") return STOCK_ENEMY_COLOR;
    if (bar.role === "ally") return STOCK_FRIEND_COLOR;
    if (bar.team === "team1") return STOCK_TEAM1_COLOR;
    if (bar.team === "team2") return STOCK_TEAM2_COLOR;
    return "";
  }

  function stockDeltaColor(bar) {
    if (bar.role === "neutral") return STOCK_NEUTRAL_DELTA_COLOR;
    if (bar.role === "enemy") return STOCK_ENEMY_DELTA_COLOR;
    if (bar.role === "ally") return STOCK_FRIEND_DELTA_COLOR;
    if (bar.team === "team1" || bar.team === "team2")
      return STOCK_TEAM_DELTA_COLOR;
    return "";
  }

  function stockBulletShieldColor(bar) {
    if (bar.role === "enemy") return STOCK_ENEMY_BULLET_SHIELD_COLOR;
    if (bar.role === "ally") return STOCK_FRIEND_BULLET_SHIELD_COLOR;
    if (bar.team === "team1") return STOCK_TEAM1_BULLET_SHIELD_COLOR;
    if (bar.team === "team2") return STOCK_TEAM2_BULLET_SHIELD_COLOR;
    return STOCK_DEFAULT_BULLET_SHIELD_COLOR;
  }

  function setStyle(panel, property, value, cache, cacheKey) {
    if (!isValid(panel) || !panel.style) {
      if (cache) cache[cacheKey] = null;
      return;
    }
    if (
      cache &&
      cache[cacheKey] === value &&
      panel.style[property] === value
    ) {
      return;
    }
    try {
      panel.style[property] = value;
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

  function clearOwnedStyle(panel, property, cache, cacheKey) {
    if (!isValid(panel) || !panel.style) {
      if (cache) cache[cacheKey] = null;
      return;
    }
    try {
      if (panel.style[property] !== "") {
        panel.style[property] = "";
      }
      if (cache) cache[cacheKey] = "";
    } catch {
      if (cache) cache[cacheKey] = null;
      return;
    }
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
    setOwnedClass(fill, "HPColorsRewritePulse", false, applied, "pulseBaseClass");
    setOwnedClass(
      fill,
      "HPColorsRewritePulseSubtle",
      false,
      applied,
      "pulseSubtleClass",
    );
    setOwnedClass(
      fill,
      "HPColorsRewritePulseIntense",
      false,
      applied,
      "pulseIntenseClass",
    );
    setOwnedClass(
      overlay,
      "HPColorsRewriteColorPulse",
      false,
      applied,
      "colorPulseBaseClass",
    );
    setOwnedClass(
      overlay,
      "HPColorsRewritePulseSubtle",
      false,
      applied,
      "colorPulseSubtleClass",
    );
    setOwnedClass(
      overlay,
      "HPColorsRewritePulseIntense",
      false,
      applied,
      "colorPulseIntenseClass",
    );
    setOwnedClass(
      counter,
      "HPColorsRewritePulse",
      false,
      applied,
      "pulseReadoutBaseClass",
    );
    setOwnedClass(
      counter,
      "HPColorsRewritePulseSubtle",
      false,
      applied,
      "pulseReadoutSubtleClass",
    );
    setOwnedClass(
      counter,
      "HPColorsRewritePulseIntense",
      false,
      applied,
      "pulseReadoutIntenseClass",
    );
    clearOwnedStyle(
      fill,
      "animationDuration",
      applied,
      "pulseAnimationDuration",
    );
    clearOwnedStyle(
      overlay,
      "animationDuration",
      applied,
      "colorPulseAnimationDuration",
    );
    clearOwnedStyle(
      overlay,
      "washColor",
      applied,
      "colorPulseWashColor",
    );
    clearOwnedStyle(overlay, "width", applied, "colorPulseWidth");
    clearOwnedStyle(overlay, "visibility", applied, "colorPulseVisibility");
    clearOwnedStyle(
      counter,
      "animationDuration",
      applied,
      "pulseReadoutAnimationDuration",
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
    var subtle = intensity === 0;
    var intense = intensity === 2;
    var useColorPulse = !!colorPulse && isValid(overlay);

    setOwnedClass(
      fill,
      "HPColorsRewritePulse",
      !useColorPulse,
      applied,
      "pulseBaseClass",
    );
    setOwnedClass(
      fill,
      "HPColorsRewritePulseSubtle",
      !useColorPulse && subtle,
      applied,
      "pulseSubtleClass",
    );
    setOwnedClass(
      fill,
      "HPColorsRewritePulseIntense",
      !useColorPulse && intense,
      applied,
      "pulseIntenseClass",
    );
    if (useColorPulse) {
      clearOwnedStyle(
        fill,
        "animationDuration",
        applied,
        "pulseAnimationDuration",
      );
      setOwnedClass(
        overlay,
        "HPColorsRewriteColorPulse",
        true,
        applied,
        "colorPulseBaseClass",
      );
      setOwnedClass(
        overlay,
        "HPColorsRewritePulseSubtle",
        subtle,
        applied,
        "colorPulseSubtleClass",
      );
      setOwnedClass(
        overlay,
        "HPColorsRewritePulseIntense",
        intense,
        applied,
        "colorPulseIntenseClass",
      );
      setStyle(
        overlay,
        "animationDuration",
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
      setStyle(
        fill,
        "animationDuration",
        duration,
        applied,
        "pulseAnimationDuration",
      );
      setOwnedClass(
        overlay,
        "HPColorsRewriteColorPulse",
        false,
        applied,
        "colorPulseBaseClass",
      );
      setOwnedClass(
        overlay,
        "HPColorsRewritePulseSubtle",
        false,
        applied,
        "colorPulseSubtleClass",
      );
      setOwnedClass(
        overlay,
        "HPColorsRewritePulseIntense",
        false,
        applied,
        "colorPulseIntenseClass",
      );
      clearOwnedStyle(
        overlay,
        "animationDuration",
        applied,
        "colorPulseAnimationDuration",
      );
      clearOwnedStyle(
        overlay,
        "washColor",
        applied,
        "colorPulseWashColor",
      );
      clearOwnedStyle(overlay, "width", applied, "colorPulseWidth");
      clearOwnedStyle(overlay, "visibility", applied, "colorPulseVisibility");
    }

    setOwnedClass(
      counter,
      "HPColorsRewritePulse",
      !!readoutActive,
      applied,
      "pulseReadoutBaseClass",
    );
    setOwnedClass(
      counter,
      "HPColorsRewritePulseSubtle",
      !!readoutActive && subtle,
      applied,
      "pulseReadoutSubtleClass",
    );
    setOwnedClass(
      counter,
      "HPColorsRewritePulseIntense",
      !!readoutActive && intense,
      applied,
      "pulseReadoutIntenseClass",
    );
    if (readoutActive) {
      setStyle(
        counter,
        "animationDuration",
        duration,
        applied,
        "pulseReadoutAnimationDuration",
      );
    } else {
      clearOwnedStyle(
        counter,
        "animationDuration",
        applied,
        "pulseReadoutAnimationDuration",
      );
    }
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
    var width = 900;
    var height = 130;
    if (bar.isSentry) {
      width = 600;
      height = 80;
    } else if (bar.usesBossDimensions) {
      width = 1400;
      height = 170;
    } else if (bar.isVertical) {
      width = 700;
      height = 140;
    }
    if (bar.stockWidth === width && bar.stockHeight === height) return;
    bar.stockWidth = width;
    bar.stockHeight = height;
  }

  function applyCustomization(bar) {
    if (!bar.dirty || !isComplete(bar.parts)) return;
    var role = bar.role;
    var relationOwned = role === "enemy" || role === "ally";
    if (bar.pulseRole && bar.pulseRole !== role) clearPulse(bar);
    bar.pulseRole = role;
    if (!config.enabled || !relationOwned) {
      clearPulse(bar);
      clearKillMarkerOwnership(bar);
      applyReadoutDecorations(bar);
      setStyle(
        bar.parts.fill,
        "washColor",
        stockUnitColor(bar),
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
        stockUnitColor(bar),
        bar.applied,
        "ultWashColor",
      );
      setStyle(bar.parts.container, "opacity", "", bar.applied, "opacity");
      setStyle(bar.parts.container, "width", "", bar.applied, "width");
      setStyle(bar.parts.container, "height", "", bar.applied, "height");
      setStyle(bar.parts.container, "transform", "", bar.applied, "transform");
      setStyle(
        bar.parts.counter,
        "visibility",
        "collapse",
        bar.applied,
        "readoutVisibility",
      );
      setText(bar.parts.counter, "", bar.applied, "readoutText");
      setStyle(bar.parts.counter, "fontSize", "", bar.applied, "readoutFontSize");
      setStyle(bar.parts.counter, "height", "", bar.applied, "readoutHeight");
      setStyle(
        bar.parts.counter,
        "fontFamily",
        "",
        bar.applied,
        "readoutFontFamily",
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
      bar.dirty = 0;
      return;
    }

    var roleEnabled = role === "enemy" ? config.enemyEnabled : config.allyEnabled;
    var excluded =
      role === "enemy" &&
      ((config.excludeBuildings && bar.isBuilding) ||
        (config.excludeBosses && bar.isBoss));
    var colorsEnabled = roleEnabled && !excluded;
    var visible = role === "enemy" ? config.enemyVisible : config.allyVisible;
    var mode = role === "enemy" ? config.enemyMode : config.allyMode;
    var low = role === "enemy" ? config.enemyLow : config.allyLow;
    var mid = role === "enemy" ? config.enemyMid : config.allyMid;
    var high = role === "enemy" ? config.enemyHigh : config.allyHigh;
    if (role === "enemy" && config.enemyTeamHigh)
      high = teamHighColor(bar.team, high);
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
    var color = stockUnitColor(bar);
    if (colorsEnabled)
      color =
        mode === "gradient"
          ? gradientColor(bar.lastWidthPercent, low, mid, high)
          : fixedColor(bar.lastWidthPercent, low, mid, high);
    var ultColor = stockUnitColor(bar);
    if (!excluded && config.ultMode === "custom") ultColor = config.ultCustom;
    else if (colorsEnabled) ultColor = color;
    var readoutEnabled =
      role === "enemy" && !excluded && config.readoutVisible;
    var readoutText = readoutEnabled ? formatReadout(bar) : "";
    var readoutVisibility = readoutText ? "visible" : "collapse";
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
      var readoutOffsetX = pulseReadoutModifiersActive
        ? config.enemyPulseReadoutOffsetX
        : config.readoutOffsetX;
      var readoutOffsetY = pulseReadoutModifiersActive
        ? config.enemyPulseReadoutOffsetY
        : config.readoutOffsetY;
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
    var colorPulse =
      role === "enemy" &&
      shouldPulse &&
      config.enemyPulseColorEnabled &&
      config.enemyPulseColorMode === "gradient";
    var pulseActive = syncPulse(
      bar,
      shouldPulse,
      pulseReadoutAnimationActive,
      pulseIntensity,
      pulseDuration(pulseBpm),
      colorPulse,
      config.enemyPulseColor,
      pulseOverlayWidth(bar),
    );
    if (pulseActive) {
      if (
        role === "enemy" &&
        config.enemyPulseColorEnabled &&
        config.enemyPulseColorMode === "fixed"
      )
        color = config.enemyPulseColor;
      else if (role === "ally" && config.allyPulseColorEnabled)
        color = config.allyPulseColor;
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
    var width =
      config.widthScale === 100
        ? ""
        : Math.round((bar.stockWidth * config.widthScale) / 100) + "px";
    var height =
      config.heightScale === 100
        ? ""
        : Math.round((bar.stockHeight * config.heightScale) / 100) + "px";
    var transform =
      config.positionX === 0 && config.positionY === 0
        ? ""
        : "translateX(" +
          config.positionX +
          "px) translateY(" +
          config.positionY +
          "px)";
    var opacity =
      colorsEnabled
        ? visible &&
          !(pulseActive && role === "enemy" && config.enemyPulseHideBar)
          ? "1"
          : "0.01"
        : "";
    applyReadoutDecorations(bar);

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
    setStyle(bar.parts.container, "opacity", opacity, bar.applied, "opacity");
    setStyle(bar.parts.container, "width", width, bar.applied, "width");
    setStyle(bar.parts.container, "height", height, bar.applied, "height");
    setStyle(
      bar.parts.container,
      "transform",
      transform,
      bar.applied,
      "transform",
    );
    setStyle(
      bar.parts.counter,
      "visibility",
      readoutVisibility,
      bar.applied,
      "readoutVisibility",
    );
    setText(bar.parts.counter, readoutText, bar.applied, "readoutText");
    setStyle(
      bar.parts.counter,
      "fontSize",
      readoutFontSize,
      bar.applied,
      "readoutFontSize",
    );
    setStyle(
      bar.parts.counter,
      "height",
      readoutEnabled ? "100%" : "",
      bar.applied,
      "readoutHeight",
    );
    setStyle(
      bar.parts.counter,
      "fontFamily",
      readoutFontFamily,
      bar.applied,
      "readoutFontFamily",
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
    bar.dirty = 0;
  }

  function applyConfigRaw(raw, source) {
    if (!raw || raw === configRaw) return false;
    try {
      var data = JSON.parse(raw);
      if (!data || data.version !== 1 || !data.values) return false;
      var previousPrecisePips = !!config.precisePipsEnabled;
      config = normalizeConfig(data.values);
      if (previousPrecisePips !== !!config.precisePipsEnabled)
        for (var pipIndex = 0; pipIndex < bars.length; pipIndex++)
          updatePipMaximum(
            bars[pipIndex],
            readPipText(bars[pipIndex].parts.pipLabel),
          );
      var revision = Math.max(0, Math.round(Number(data.revision) || 0));
      configRaw = raw;
      for (var index = 0; index < bars.length; index++) {
        bars[index].dirty = true;
        applyCustomization(bars[index]);
      }
      $.Msg(
        "[HP Colors Rewrite] config probe=" +
          probeId +
          " source=" +
          source +
          " revision=" +
          revision +
          " enabled=" +
          String(config.enabled),
      );
      return true;
    } catch {
      return false;
    }
  }

  function readRootConfig() {
    if (!configRoot || !isValid(configRoot)) configRoot = absoluteRoot(context);
    if (!isValid(configRoot) || !configRoot.GetAttributeString) return "";
    try {
      return String(configRoot.GetAttributeString(CONFIG_ATTR, "") || "");
    } catch {
      return "";
    }
  }

  function inspectRootConfig() {
    var raw = readRootConfig();
    if (raw && raw !== configRaw) applyConfigRaw(raw, "root");
  }

  function onConfigEvent(payload) {
    try {
      var data = payload === String(payload) ? JSON.parse(payload) : payload;
      if (
        !data ||
        data.magic_word !== CONFIG_MAGIC ||
        data.version !== 1 ||
        !data.values_raw
      )
        return;
      applyConfigRaw(String(data.values_raw), "event");
    } catch {}
  }

  function reportData(bar) {
    if (!isComplete(bar.parts)) return;
    classifyTarget(bar);
    if (!bar.healthSampled || !colorRefreshEnabled(bar))
      sampleHealthPercent(bar);
    updatePipMaximum(bar, readPipText(bar.parts.pipLabel));
    updateLevel(bar, readPipText(bar.parts.levelLabel));
    if (bar.dirty) applyCustomization(bar);
  }

  function addBar(parts) {
    var bar = {
      instanceId: probeId + "_bar_" + nextBarSequence,
      generation: 1,
      dirty: true,
      lastWidthPercent: -1,
      healthSampled: false,
      healthPresentationChanged: false,
      pulseOverlayPercent: -1,
      partsRetryAt: 0,
      sampleFillWidth: 0,
      sampleTotalParentWidth: 0,
      sampleShieldWidth: 0,
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
      isVertical: false,
      team: "",
      isBuilding: false,
      isBoss: false,
      isSentry: false,
      usesBossDimensions: false,
      stockWidth: 0,
      stockHeight: 0,
      seen: true,
      parts: parts,
    };
    nextBarSequence += 1;
    bars.push(bar);
    reportData(bar);
  }

  function reconcileBars() {
    for (var index = 0; index < bars.length; index++) bars[index].seen = false;

    var activeParent = findWithin(context, "unit_healthbar_active_parent");
    if (isValid(activeParent)) {
      var bar = findBarByParent(activeParent);
      if (!bar) {
        addBar(resolveParts(activeParent));
      } else {
        bar.seen = true;
        if (!cachedPartsUsable(bar)) {
          var nextParts = resolveParts(activeParent);
          if (!sameParts(bar.parts, nextParts)) {
            clearPulse(bar);
            clearReadoutOwnership(bar);
            clearKillMarkerOwnership(bar);
            bar.parts = nextParts;
            bar.generation += 1;
            bar.dirty = true;
            bar.applied = {};
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
            bar.partsRetryAt = 0;
            bar.sampleFillWidth = 0;
            bar.sampleTotalParentWidth = 0;
            bar.sampleShieldWidth = 0;
            bar.sampleHealthParentWidth = 0;
            bar.markerGeometryChanged = false;
            bar.stockWidth = 0;
            bar.stockHeight = 0;
          }
        }

        reportData(bar);
      }
    }

    for (var removeIndex = bars.length - 1; removeIndex >= 0; removeIndex--) {
      var removedBar = bars[removeIndex];
      if (removedBar.seen) continue;
      clearPulse(removedBar);
      clearKillMarkerOwnership(removedBar);
      clearReadoutOwnership(removedBar);
      bars.splice(removeIndex, 1);
    }
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
      if (
        bar.markerGeometryChanged &&
        bar.applied.killMarkerVisibility === "visible"
      ) {
        applyKillMarker(bar, false);
        return true;
      }
      return false;
    }
    if (!bar.healthPresentationChanged) {
      if (
        !bar.markerGeometryChanged ||
        bar.applied.killMarkerVisibility !== "visible"
      )
        return false;
      applyKillMarker(bar, true);
      return true;
    }
    applyCustomization(bar);
    return true;
  }




  function paintColors() {
    if (!isValid(context)) return;
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
    $.Schedule(delay, paintColors);
  }


  function scan() {
    if (!isValid(context)) return;
    inspectRootConfig();
    reconcileBars();
    if (!didLogInitialScan) {
      didLogInitialScan = true;
      $.Msg(
        "[HP Colors Rewrite] probe ready id=" +
          probeId +
          " bars=" +
          bars.length,
      );
    }
    $.Schedule(SCAN_INTERVAL_SEC, scan);
  }
  try {
    $.RegisterForUnhandledEvent(EVENT_CHANNEL, onConfigEvent);
  } catch (error) {
    $.Msg("[HP Colors Rewrite] config listener failed: " + String(error));
  }
  inspectRootConfig();
  scan();
  paintColors();
})();
