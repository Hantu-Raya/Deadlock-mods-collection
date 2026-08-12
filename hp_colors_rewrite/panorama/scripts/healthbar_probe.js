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
    readoutOffsetY: -130,
    readoutColorMode: "bar",
    readoutMode: "fixed",
    readoutLow: "#E16161",
    readoutMid: "#FF7B00",
    readoutHigh: "#FFFFFF",
    lowThreshold: 25,
    highThreshold: 65,
  };

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
  var configRevision = 0;
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

  function ancestorHasClass(panel, className) {
    var current = panel;
    for (var depth = 0; current && depth < 12; depth++) {
      if (hasClass(current, className)) return true;
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  function classifyTarget(bar) {
    var current = bar.parts.activeParent;
    var neutral = false;
    var enemy = false;
    var ally = false;
    var team = "";
    var building = false;
    var boss = false;
    var sentry = false;
    var bossDimensions = false;
    for (var depth = 0; current && depth < 12; depth++) {
      neutral = neutral || hasClass(current, "team_neutral");
      enemy = enemy || hasClass(current, "enemy");
      ally = ally || hasClass(current, "friend");
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
    var signature = [
      role,
      team,
      building ? "building" : "",
      boss ? "boss" : "",
      sentry ? "sentry" : "",
      bossDimensions ? "boss_dimensions" : "",
    ].join("|");
    if (signature === bar.targetSignature) return;
    bar.role = role;
    bar.team = team;
    bar.isBuilding = building;
    bar.isBoss = boss;
    bar.isSentry = sentry;
    bar.usesBossDimensions = bossDimensions;
    bar.targetSignature = signature;
    bar.appliedSignature = "";
    $.Msg(
      "[HP Colors Rewrite] role id=" +
        bar.instanceId +
        " value=" +
        role +
        " team=" +
        (team || "unknown") +
        " building=" +
        String(building) +
        " boss=" +
        String(boss),
    );
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
    return {
      container: container,
      activeParent: activeParent,
      background: findWithin(container, "unit_healthbar_bg"),
      fill: findWithin(activeParent, "unit_healthbar_lagging"),
      healing: findWithin(activeParent, "unit_healthbar_healing"),
      delta: findWithin(activeParent, "unit_healthbar_delta"),
      bulletShield: findWithin(activeParent, "unit_healthbar_bullet_shield"),
      techShield: findWithin(activeParent, "unit_healthbar_tech_shield"),
      pipLabel: findWithin(activeParent, "unit_healthbar_pip_label"),
      counterAnchor: findWithin(infoHealth, "hp_counter_anchor"),
      counter: findWithin(infoHealth, "hp_counter"),
      ultIcon: findWithin(infoHealth, "unit_ult_ready_icon"),
    };
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
    bar.sampleFillWidth = fillWidth;
    bar.sampleTotalParentWidth = totalParentWidth;
    bar.sampleShieldWidth = shieldWidth;
    bar.sampleHealthParentWidth = healthParentWidth;
    if (healthParentWidth <= 0) return -1;
    return Math.max(
      0,
      Math.min(100, ((fillWidth / healthParentWidth) * 100) | 0),
    );
  }

  function readPipText(panel) {
    try {
      if (typeof panel.text === "string") return panel.text;
      if (panel.GetAttributeString)
        return String(panel.GetAttributeString("text", "") || "");
    } catch (error) {}
    return "";
  }

  function parseMaximumHealth(pipText) {
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
    var minorValue = 100;
    var majorValue =
      leadingMinorCount > 0 ? (leadingMinorCount + 1) * minorValue : 500;
    return majorCount * majorValue + trailingMinorCount * minorValue;
  }

  function updatePipMaximum(bar, pipText) {
    if (bar.pipText === pipText) return;
    bar.pipText = pipText;
    bar.rawMaximumHealth = parseMaximumHealth(pipText);
    bar.appliedSignature = "";
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
    next.readoutOffsetY = clampNumber(source.readoutOffsetY, -365, 270, -130);
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

  function stockDimensions(bar) {
    if (bar.isSentry) return [600, 80];
    if (bar.usesBossDimensions) return [1400, 170];
    if (ancestorHasClass(bar.parts.activeParent, "verticalHealthbars"))
      return [700, 140];
    return [900, 130];
  }

  function applyCustomization(bar) {
    if (!isComplete(bar.parts)) return;
    var role = bar.role;
    var relationOwned = role === "enemy" || role === "ally";
    if (!config.enabled || !relationOwned) {
      if (bar.appliedSignature === "stock") return;
      setStyle(bar.parts.fill, "washColor", "", bar.applied, "washColor");
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
      setStyle(
        bar.parts.counter,
        "fontFamily",
        "",
        bar.applied,
        "readoutFontFamily",
      );
      setStyle(bar.parts.counter, "transform", "", bar.applied, "readoutTransform");
      setStyle(
        bar.parts.counter,
        "washColor",
        "",
        bar.applied,
        "readoutWashColor",
      );
      bar.appliedSignature = "stock";
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
      ? "translateX(" +
        config.readoutOffsetX +
        "px) translateY(" +
        config.readoutOffsetY +
        "px)"
      : "";

    var dimensions = stockDimensions(bar);
    var width =
      config.widthScale === 100
        ? ""
        : Math.round((dimensions[0] * config.widthScale) / 100) + "px";
    var height =
      config.heightScale === 100
        ? ""
        : Math.round((dimensions[1] * config.heightScale) / 100) + "px";
    var transform =
      config.positionX === 0 && config.positionY === 0
        ? ""
        : "translateX(" +
          config.positionX +
          "px) translateY(" +
          config.positionY +
          "px)";
    var opacity = colorsEnabled ? (visible ? "1" : "0.01") : "";
    var signature = [
      configRevision,
      bar.targetSignature,
      bar.lastWidthPercent,
      color,
      ultColor,
      opacity,
      healing,
      delta,
      bulletShield,
      width,
      height,
      transform,
      readoutText,
      readoutVisibility,
      readoutColor,
      readoutFontSize,
      readoutFontFamily,
      readoutTransform,
    ].join("|");
    if (signature === bar.appliedSignature) return;

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
      "fontFamily",
      readoutFontFamily,
      bar.applied,
      "readoutFontFamily",
    );
    setStyle(
      bar.parts.counter,
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
    bar.appliedSignature = signature;
  }

  function applyConfigRaw(raw, source) {
    if (!raw || raw === configRaw) return false;
    try {
      var data = JSON.parse(raw);
      if (!data || data.version !== 1 || !data.values) return false;
      config = normalizeConfig(data.values);
      configRevision = Math.max(0, Math.round(Number(data.revision) || 0));
      configRaw = raw;
      for (var index = 0; index < bars.length; index++) {
        bars[index].appliedSignature = "";
        applyCustomization(bars[index]);
      }
      $.Msg(
        "[HP Colors Rewrite] config probe=" +
          probeId +
          " source=" +
          source +
          " revision=" +
          configRevision +
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
    classifyTarget(bar);
    var widthPercent = sampleHealthPercent(bar);
    if (widthPercent < 0) return;
    bar.lastWidthPercent = widthPercent;
    var pipText = readPipText(bar.parts.pipLabel);
    updatePipMaximum(bar, pipText);
    applyCustomization(bar);

    var signature = pipText + "|" + widthPercent;
    if (signature === bar.lastDataSignature) return;
    bar.lastDataSignature = signature;

    $.Msg(
      "[HP Colors Rewrite] data id=" +
        bar.instanceId +
        " generation=" +
        bar.generation +
        " pip=" +
        JSON.stringify(pipText) +
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
      lastDataSignature: "",
      lastWidthPercent: 0,
      sampleFillWidth: 0,
      sampleTotalParentWidth: 0,
      sampleShieldWidth: 0,
      sampleHealthParentWidth: 0,
      pipText: "",
      rawMaximumHealth: 0,
      appliedSignature: "",
      applied: {
        washColor: null,
        ultWashColor: null,
        opacity: null,
        width: null,
        height: null,
        transform: null,
        healingWashColor: null,
        deltaWashColor: null,
        bulletShieldBackgroundColor: null,
        readoutText: null,
        readoutVisibility: null,
        readoutFontSize: null,
        readoutFontFamily: null,
        readoutTransform: null,
        readoutWashColor: null,
      },
      role: "",
      team: "",
      isBuilding: false,
      isBoss: false,
      isSentry: false,
      usesBossDimensions: false,
      targetSignature: "",
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
      var nextParts = resolveParts(activeParent);
      var bar = findBarByParent(activeParent);
      if (!bar) {
        addBar(nextParts);
        continue;
      }

      bar.seen = true;
      if (!sameParts(bar.parts, nextParts)) {
        bar.parts = nextParts;
        bar.generation += 1;
        bar.lastDataSignature = "";
        bar.appliedSignature = "";
        bar.applied.washColor = null;
        bar.applied.ultWashColor = null;
        bar.applied.opacity = null;
        bar.applied.width = null;
        bar.applied.height = null;
        bar.applied.transform = null;
        bar.applied.healingWashColor = null;
        bar.applied.deltaWashColor = null;
        bar.applied.bulletShieldBackgroundColor = null;
        bar.applied.readoutText = null;
        bar.applied.readoutVisibility = null;
        bar.applied.readoutFontSize = null;
        bar.applied.readoutFontFamily = null;
        bar.applied.readoutTransform = null;
        bar.applied.readoutWashColor = null;
        bar.targetSignature = "";
      }
      reportData(bar);
    }

    for (var removeIndex = bars.length - 1; removeIndex >= 0; removeIndex--) {
      if (bars[removeIndex].seen) continue;
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
    if (widthPercent < 0 || widthPercent === bar.lastWidthPercent) return false;
    bar.lastWidthPercent = widthPercent;
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
