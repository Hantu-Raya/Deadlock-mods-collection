(function () {
  "use strict";

  var SCAN_INTERVAL_SEC = 1;
  var PAINT_ACTIVE_SEC = 0.15;
  var PAINT_RECENT_SEC = 0.25;
  var PAINT_IDLE_SEC = 1.5;
  var PAINT_RECENT_MS = 2000;
  var MAX_SCAN_DEPTH = 12;
  var MAX_SCAN_PANELS = 512;
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var CONFIG_MAGIC = "HP_COLORS_REWRITE_CONFIG";
  var CONFIG_ATTR = "hp_colors_rewrite_config";
  var DIRTY_TARGET = 1;
  var DIRTY_HEALTH = 2;
  var DIRTY_PIPS = 4;
  var DIRTY_LEVEL = 8;
  var DIRTY_PARTS = 16;
  var DIRTY_CONFIG = 32;

  var DEFAULT_CONFIG = {
    enabled: true,
    widthScale: 100,
    heightScale: 100,
    positionX: 0,
    positionY: 0,
    enemyEnabled: true,
    enemyVisible: true,
    enemyMode: "gradient",
    enemyLow: "#E16161",
    enemyMid: "#FF7B00",
    enemyHigh: "#00FF00",
    enemyTeamHigh: false,
    excludeBuildings: false,
    excludeBosses: false,
    enemyHealing: "#5FFF80",
    enemyDelta: "#FFE55B",
    enemyBulletShield: "#FFFFFF",
    allyEnabled: false,
    allyVisible: true,
    allyMode: "fixed",
    allyLow: "#E16161",
    allyMid: "#FFED79",
    allyHigh: "#70F8C1",
    allyHealing: "#5FFF80",
    allyDelta: "#504C47",
    allyBulletShield: "#FFFFFF",
    ultMode: "follow",
    ultCustom: "#E16161",
    readoutVisible: true,
    readoutFormat: "hp",
    readoutSize: 145,
    readoutFont: "default",
    readoutOffsetX: 27,
    readoutOffsetY: 500,
    readoutColorMode: "bar",
    readoutMode: "fixed",
    readoutLow: "#E16161",
    readoutMid: "#FF7B00",
    readoutHigh: "#FFFFFF",
    pipsVisible: true,
    precisePipsEnabled: false,
    levelsVisible: true,
    enemyPulseEnabled: true,
    enemyPulseThreshold: 25,
    enemyPulseBpm: 75,
    enemyPulseIntensity: 1,
    enemyPulseColorEnabled: false,
    enemyPulseColorMode: "gradient",
    enemyPulseColor: "#FF2222",
    enemyPulseHideBar: false,
    enemyPulseReadout: false,
    allyPulseEnabled: false,
    allyPulseThreshold: 25,
    allyPulseBpm: 75,
    allyPulseIntensity: 1,
    allyPulseColorEnabled: false,
    allyPulseColor: "#FF2222",
    lowThreshold: 25,
    highThreshold: 65,
  };

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
  var config = copyConfig(DEFAULT_CONFIG);
  var lastColorChangeAt = 0;

  function copyConfig(source) {
    var result = {};
    for (var key in DEFAULT_CONFIG) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) continue;
      result[key] =
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : DEFAULT_CONFIG[key];
    }
    return result;
  }

  function isValid(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch (error) {
      return false;
    }
  }

  function panelId(panel) {
    try {
      return String(panel && panel.id ? panel.id : "");
    } catch (error) {
      return "";
    }
  }

  function children(panel) {
    try {
      return panel && panel.Children ? panel.Children() || [] : [];
    } catch (error) {
      return [];
    }
  }

  function findWithin(panel, id) {
    try {
      return panel && panel.FindChildTraverse
        ? panel.FindChildTraverse(id)
        : null;
    } catch (error) {
      return null;
    }
  }

  function findAncestor(panel, id) {
    var current = panel;
    for (var depth = 0; current && depth < 8; depth++) {
      if (panelId(current) === id) return current;
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch (error) {
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
      } catch (error) {
        break;
      }
    }
    return last;
  }

  function hasClass(panel, className) {
    try {
      if (panel && panel.BHasClass) return !!panel.BHasClass(className);
      if (panel && panel.HasClass) return !!panel.HasClass(className);
    } catch (error) {}
    return false;
  }

  function findAncestorWithClass(panel, className) {
    var current = panel;
    for (var depth = 0; current && depth < 12; depth++) {
      if (hasClass(current, className)) return current;
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch (error) {
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
      } catch (error) {
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
    bar.dirty |= DIRTY_TARGET;
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

  function collectActiveParents() {
    var matches = [];
    var stack = [{ panel: context, depth: 0 }];
    var visited = 0;

    while (stack.length && visited < MAX_SCAN_PANELS) {
      var entry = stack.pop();
      var panel = entry.panel;
      visited += 1;
      if (!isValid(panel)) continue;
      if (panelId(panel) === "unit_healthbar_active_parent") matches.push(panel);
      if (entry.depth >= MAX_SCAN_DEPTH) continue;

      var panelChildren = children(panel);
      for (var index = panelChildren.length - 1; index >= 0; index--)
        stack.push({ panel: panelChildren[index], depth: entry.depth + 1 });
    }
    return matches;
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
      } catch (error) {
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
    } catch (error) {
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
    var rawChanged =
      !sampled ||
      fillWidth !== bar.sampleFillWidth ||
      totalParentWidth !== bar.sampleTotalParentWidth ||
      shieldWidth !== bar.sampleShieldWidth ||
      healthParentWidth !== bar.sampleHealthParentWidth;
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
    bar.pulseOverlayPercent = overlayPercent;
    bar.healthChanged = rawChanged;
    if (healthParentWidth <= 0) {
      bar.healthPresentationChanged = !sampled;
      if (bar.healthPresentationChanged) bar.dirty |= DIRTY_HEALTH;
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
    if (bar.healthPresentationChanged) bar.dirty |= DIRTY_HEALTH;
    return widthPercent;
  }

  function readPipText(panel) {
    try {
      if (typeof panel.text === "string") return panel.text;
      if (panel.GetAttributeString)
        return String(panel.GetAttributeString("text", "") || "");
    } catch (error) {}
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

  function invalidatePipMaximum(bar) {
    bar.pipText = null;
    bar.pipProfile = null;
    bar.rawMaximumHealth = 0;
    bar.dirty |= DIRTY_PIPS;
  }

  function updatePipMaximum(bar, pipText) {
    var precise = !!config.precisePipsEnabled;
    if (bar.pipText === pipText && bar.pipProfile === precise) return false;
    bar.pipText = pipText;
    bar.pipProfile = precise;
    bar.rawMaximumHealth = parseMaximumHealth(pipText, precise);
    bar.dirty |= DIRTY_PIPS;
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
    bar.dirty |= DIRTY_LEVEL;
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

  function clampNumber(value, min, max, fallback) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    number = Math.round(number);
    return Math.max(min, Math.min(max, number));
  }

  function normalizeColor(value, fallback) {
    var raw = String(value || "").trim().toUpperCase();
    if (raw.charAt(0) !== "#") raw = "#" + raw;
    return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
  }

  function normalizeConfig(source) {
    var next = copyConfig(DEFAULT_CONFIG);
    next.enabled = !!source.enabled;
    next.widthScale = clampNumber(source.widthScale, 60, 160, 100);
    next.heightScale = clampNumber(source.heightScale, 60, 160, 100);
    next.enemyEnabled = source.enemyEnabled !== false;
    next.positionX = clampNumber(source.positionX, -300, 300, 0);
    next.positionY = clampNumber(source.positionY, -200, 200, 0);
    next.enemyVisible = source.enemyVisible !== false;
    next.enemyMode = source.enemyMode === "fixed" ? "fixed" : "gradient";
    next.enemyLow = normalizeColor(source.enemyLow, DEFAULT_CONFIG.enemyLow);
    next.enemyMid = normalizeColor(source.enemyMid, DEFAULT_CONFIG.enemyMid);
    next.enemyHigh = normalizeColor(source.enemyHigh, DEFAULT_CONFIG.enemyHigh);
    next.enemyTeamHigh = !!source.enemyTeamHigh;
    next.excludeBuildings = !!source.excludeBuildings;
    next.excludeBosses = !!source.excludeBosses;
    next.enemyHealing = normalizeColor(
      source.enemyHealing,
      DEFAULT_CONFIG.enemyHealing,
    );
    next.enemyDelta = normalizeColor(source.enemyDelta, DEFAULT_CONFIG.enemyDelta);
    next.enemyBulletShield = normalizeColor(
      source.enemyBulletShield,
      DEFAULT_CONFIG.enemyBulletShield,
    );
    next.allyEnabled = !!source.allyEnabled;
    next.allyVisible = source.allyVisible !== false;
    next.allyMode = source.allyMode === "gradient" ? "gradient" : "fixed";
    next.allyLow = normalizeColor(source.allyLow, DEFAULT_CONFIG.allyLow);
    next.allyMid = normalizeColor(source.allyMid, DEFAULT_CONFIG.allyMid);
    next.allyHigh = normalizeColor(source.allyHigh, DEFAULT_CONFIG.allyHigh);
    next.allyHealing = normalizeColor(
      source.allyHealing,
      DEFAULT_CONFIG.allyHealing,
    );
    next.allyDelta = normalizeColor(source.allyDelta, DEFAULT_CONFIG.allyDelta);
    next.allyBulletShield = normalizeColor(
      source.allyBulletShield,
      DEFAULT_CONFIG.allyBulletShield,
    );
    next.ultMode = source.ultMode === "custom" ? "custom" : "follow";
    next.ultCustom = normalizeColor(source.ultCustom, DEFAULT_CONFIG.ultCustom);
    next.readoutVisible = source.readoutVisible !== false;
    next.readoutFormat =
      source.readoutFormat === "percent" || source.readoutFormat === "current"
        ? source.readoutFormat
        : "hp";
    next.readoutSize = clampNumber(source.readoutSize, 72, 320, 145);
    next.readoutFont =
      source.readoutFont === "oracle" || source.readoutFont === "pulp"
        ? source.readoutFont
        : "default";
    next.readoutOffsetX = clampNumber(source.readoutOffsetX, -405, 405, 27);
    next.readoutOffsetY = clampNumber(source.readoutOffsetY, -35, 840, 500);
    next.readoutColorMode =
      source.readoutColorMode === "custom" ? "custom" : "bar";
    next.readoutMode =
      source.readoutMode === "gradient" ? "gradient" : "fixed";
    next.readoutLow = normalizeColor(
      source.readoutLow,
      DEFAULT_CONFIG.readoutLow,
    );
    next.readoutMid = normalizeColor(
      source.readoutMid,
      DEFAULT_CONFIG.readoutMid,
    );
    next.readoutHigh = normalizeColor(
      source.readoutHigh,
      DEFAULT_CONFIG.readoutHigh,
    );
    next.enemyPulseEnabled = source.enemyPulseEnabled !== false;
    next.enemyPulseThreshold = clampNumber(
      source.enemyPulseThreshold,
      0,
      100,
      25,
    );
    next.enemyPulseBpm = clampNumber(source.enemyPulseBpm, 30, 300, 75);
    next.enemyPulseIntensity = clampNumber(
      source.enemyPulseIntensity,
      0,
      2,
      1,
    );
    next.enemyPulseColorEnabled = !!source.enemyPulseColorEnabled;
    next.enemyPulseColorMode =
      source.enemyPulseColorMode === "fixed" ? "fixed" : "gradient";
    next.enemyPulseColor = normalizeColor(
      source.enemyPulseColor,
      DEFAULT_CONFIG.enemyPulseColor,
    );
    next.enemyPulseHideBar = !!source.enemyPulseHideBar;
    next.enemyPulseReadout = !!source.enemyPulseReadout;
    next.allyPulseEnabled = !!source.allyPulseEnabled;
    next.allyPulseThreshold = clampNumber(
      source.allyPulseThreshold,
      0,
      100,
      25,
    );
    next.allyPulseBpm = clampNumber(source.allyPulseBpm, 30, 300, 75);
    next.allyPulseIntensity = clampNumber(
      source.allyPulseIntensity,
      0,
      2,
      1,
    );
    next.allyPulseColorEnabled = !!source.allyPulseColorEnabled;
    next.allyPulseColor = normalizeColor(
      source.allyPulseColor,
      DEFAULT_CONFIG.allyPulseColor,
    );
    next.pipsVisible = source.pipsVisible !== false;
    next.precisePipsEnabled = !!source.precisePipsEnabled;
    next.levelsVisible = source.levelsVisible !== false;

    next.lowThreshold = clampNumber(source.lowThreshold, 0, 99, 25);
    next.highThreshold = clampNumber(
      source.highThreshold,
      next.lowThreshold + 1,
      100,
      65,
    );
    if (next.lowThreshold >= next.highThreshold)
      next.lowThreshold = Math.max(0, next.highThreshold - 1);
    return next;
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
    if (team === "team1") return "#E7B659";
    if (team === "team2") return "#5B79E6";
    return fallback;
  }

  function setStyle(panel, property, value, cache, cacheKey) {
    if (!isValid(panel) || !panel.style || cache[cacheKey] === value) return;
    try {
      panel.style[property] = value;
      cache[cacheKey] = value;
    } catch (error) {
      cache[cacheKey] = null;
    }
  }

  function setText(panel, value, cache, cacheKey) {
    if (!isValid(panel) || cache[cacheKey] === value) return;
    try {
      panel.text = value;
      cache[cacheKey] = value;
    } catch (error) {
      cache[cacheKey] = null;
    }
  }
  function setOwnedClass(panel, className, enabled, cache, cacheKey) {
    var marker = enabled ? "1" : "0";
    if (!isValid(panel)) {
      cache[cacheKey] = null;
      return;
    }
    if (cache[cacheKey] === marker) return;
    try {
      if (enabled) {
        if (panel.AddClass) panel.AddClass(className);
      } else if (panel.RemoveClass) {
        panel.RemoveClass(className);
      }
      cache[cacheKey] = marker;
    } catch (error) {
      cache[cacheKey] = null;
    }
  }

  function clearOwnedStyle(panel, property, cache, cacheKey) {
    if (!isValid(panel) || !panel.style) {
      cache[cacheKey] = null;
      return;
    }
    try {
      if (panel.style[property] !== "") panel.style[property] = "";
      cache[cacheKey] = "";
    } catch (error) {
      cache[cacheKey] = null;
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


  function applyReadoutDecorations(bar) {
    var enemyScope = config.enabled && bar.role === "enemy";
    setStyle(
      bar.parts.pipLabel,
      "visibility",
      enemyScope && !config.pipsVisible ? "collapse" : "",
      bar.applied,
      "pipVisibility",
    );

    var levelScope =
      config.enabled &&
      bar.role === "enemy" &&
      bar.isPlayer &&
      !bar.isBuilding &&
      !bar.isSentry &&
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
      applyReadoutDecorations(bar);
      setStyle(bar.parts.healing, "washColor", "", bar.applied, "healingWashColor");
      setStyle(bar.parts.delta, "washColor", "", bar.applied, "deltaWashColor");
      setStyle(
        bar.parts.bulletShield,
        "backgroundColor",
        "",
        bar.applied,
        "bulletShieldBackgroundColor",
      );
      setStyle(bar.parts.ultIcon, "washColor", "", bar.applied, "ultWashColor");
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
        : "";
    var delta =
      colorsEnabled
        ? role === "enemy"
          ? config.enemyDelta
          : config.allyDelta
        : "";
    var bulletShield =
      colorsEnabled
        ? role === "enemy"
          ? config.enemyBulletShield
          : config.allyBulletShield
        : "";
    var color = "";
    if (colorsEnabled)
      color =
        mode === "gradient"
          ? gradientColor(bar.lastWidthPercent, low, mid, high)
          : fixedColor(bar.lastWidthPercent, low, mid, high);
    var ultColor = "";
    if (colorsEnabled)
      ultColor = config.ultMode === "custom" ? config.ultCustom : color;
    var readoutEnabled =
      role === "enemy" &&
      config.enemyEnabled &&
      !excluded &&
      config.readoutVisible;
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
    var readoutFontSize = readoutEnabled ? config.readoutSize + "px" : "";
    var readoutFontFamily =
      config.readoutFont === "oracle"
        ? "VALVEOracle, Reaver, sans-serif"
        : config.readoutFont === "pulp"
          ? "VALVEPulp, Noto Sans, sans-serif"
          : "Retail Demo, Noto Sans, sans-serif";
    var readoutTransform = readoutEnabled
      ? "translate3d(" +
        config.readoutOffsetX +
        "px, " +
        config.readoutOffsetY +
        "px, 0px)"
      : "";

    var pulseEnabled =
      colorsEnabled &&
      (role === "enemy" ? config.enemyPulseEnabled : config.allyPulseEnabled);
    var pulseThreshold =
      role === "enemy"
        ? config.enemyPulseThreshold
        : config.allyPulseThreshold;
    var shouldPulse =
      pulseEnabled && bar.lastWidthPercent <= pulseThreshold;
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
      role === "enemy" && config.enemyPulseReadout && readoutEnabled,
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
        for (var pipIndex = 0; pipIndex < bars.length; pipIndex++) {
          invalidatePipMaximum(bars[pipIndex]);
          updatePipMaximum(
            bars[pipIndex],
            readPipText(bars[pipIndex].parts.pipLabel),
          );
        }
      var revision = Math.max(0, Math.round(Number(data.revision) || 0));
      configRaw = raw;
      for (var index = 0; index < bars.length; index++) {
        bars[index].dirty |= DIRTY_CONFIG;
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
    } catch (error) {
      return false;
    }
  }

  function readRootConfig() {
    if (!configRoot || !isValid(configRoot)) configRoot = absoluteRoot(context);
    if (!isValid(configRoot) || !configRoot.GetAttributeString) return "";
    try {
      return String(configRoot.GetAttributeString(CONFIG_ATTR, "") || "");
    } catch (error) {
      return "";
    }
  }

  function inspectRootConfig() {
    var raw = readRootConfig();
    if (raw && raw !== configRaw) applyConfigRaw(raw, "root");
  }

  function onConfigEvent(payload) {
    try {
      var data = typeof payload === "string" ? JSON.parse(payload) : payload;
      if (
        !data ||
        data.magic_word !== CONFIG_MAGIC ||
        data.version !== 1 ||
        !data.values_raw
      )
        return;
      applyConfigRaw(String(data.values_raw), "event");
    } catch (error) {}
  }

  function reportData(bar) {
    if (!isComplete(bar.parts)) return;
    var changed = classifyTarget(bar);
    var widthPercent = sampleHealthPercent(bar);
    changed = bar.healthChanged || changed;
    var pipText = readPipText(bar.parts.pipLabel);
    if (updatePipMaximum(bar, pipText)) changed = true;
    var levelText = readPipText(bar.parts.levelLabel);
    if (updateLevel(bar, levelText)) changed = true;
    if (bar.dirty) applyCustomization(bar);
    if (!changed || widthPercent < 0) return;

    $.Msg(
      "[HP Colors Rewrite] data id=" +
        bar.instanceId +
        " generation=" +
        bar.generation +
        " pip=" +
        JSON.stringify(pipText) +
        " level=" +
        JSON.stringify(levelText) +
        " fill=" +
        Math.round(bar.sampleFillWidth) +
        " parent=" +
        Math.round(bar.sampleTotalParentWidth) +
        " shield=" +
        Math.round(bar.sampleShieldWidth) +
        " health_parent=" +
        Math.round(bar.sampleHealthParentWidth) +
        " width_percent=" +
        widthPercent,
    );
  }

  function addBar(parts) {
    var bar = {
      instanceId: probeId + "_bar_" + nextBarSequence,
      generation: 1,
      dirty: DIRTY_PARTS,
      lastWidthPercent: -1,
      healthSampled: false,
      healthChanged: false,
      healthPresentationChanged: false,
      pulseOverlayPercent: -1,
      partsRetryAt: 0,
      sampleFillWidth: 0,
      sampleTotalParentWidth: 0,
      sampleShieldWidth: 0,
      sampleHealthParentWidth: 0,
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

    var activeParents = collectActiveParents();
    for (var parentIndex = 0; parentIndex < activeParents.length; parentIndex++) {
      var activeParent = activeParents[parentIndex];
      var bar = findBarByParent(activeParent);
      if (!bar) {
        addBar(resolveParts(activeParent));
        continue;
      }

      bar.seen = true;
      if (!cachedPartsUsable(bar)) {
        var nextParts = resolveParts(activeParent);
        if (!sameParts(bar.parts, nextParts)) {
          clearPulse(bar);
          clearReadoutOwnership(bar);
          bar.parts = nextParts;
          bar.generation += 1;
          bar.dirty |= DIRTY_PARTS;
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
          bar.healthChanged = false;
          bar.healthPresentationChanged = false;
          bar.pulseOverlayPercent = -1;
          bar.partsRetryAt = 0;
          bar.sampleFillWidth = 0;
          bar.sampleTotalParentWidth = 0;
          bar.sampleShieldWidth = 0;
          bar.sampleHealthParentWidth = 0;
          bar.stockWidth = 0;
          bar.stockHeight = 0;
        }
      }

      reportData(bar);
    }

    for (var removeIndex = bars.length - 1; removeIndex >= 0; removeIndex--) {
      if (bars[removeIndex].seen) continue;
      clearPulse(bars[removeIndex]);
      clearReadoutOwnership(bars[removeIndex]);
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
    if (!isComplete(bar.parts) || !colorRefreshEnabled(bar)) return false;
    var widthPercent = sampleHealthPercent(bar);
    if (widthPercent < 0 || !bar.healthPresentationChanged) return false;
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
