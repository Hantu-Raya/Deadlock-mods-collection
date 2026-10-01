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
  // Stay stock until the editor has restored its durable save and published.
  var HYDRATION_ATTR = "hp_colors_v2_hydration";
  var CONFIG_GRACE_MS = 3000;
  var HYDRATION_WAIT_MAX_MS = 180000;
  var LEGACY_TO_NATIVE = 0.1;
  // Full-canvas CSS fallbacks at the stock 200 x 210 world window.
  var LEVEL_BASE_MARGIN_LEFT = 27;
  var LEVEL_BASE_MARGIN_TOP = 67.5;
  var UNIT_INFO_BASE_MARGIN_LEFT = 50;
  var UNIT_INFO_BASE_MARGIN_TOP = 67;
  // Accessory panels rebased onto the full canvas; property names are
  // precomputed so the per-tick rebase allocates nothing.
  var STOCK_ACCESSORIES = [
    accessoryEntry("levelContainer", "levelAnchor", LEVEL_BASE_MARGIN_LEFT, LEVEL_BASE_MARGIN_TOP),
    accessoryEntry("unitInfo", "unitInfoAnchor", UNIT_INFO_BASE_MARGIN_LEFT, UNIT_INFO_BASE_MARGIN_TOP),
  ];

  function accessoryEntry(part, key, left, top) {
    return {
      part: part,
      baseLeft: key + "BaseLeft",
      baseTop: key + "BaseTop",
      panel: key + "Panel",
      marginLeft: key + "MarginLeft",
      marginTop: key + "MarginTop",
      left: left,
      top: top,
    };
  }

  if (!$.HPColorsV2ContractFactory || !$.HPColorsV2ContractFactory.create)
    throw new Error("HP Colors v2 settings contract unavailable");
  var settingsContract = $.HPColorsV2ContractFactory.create();
  delete $.HPColorsV2ContractFactory;
  var normalizeConfig = settingsContract.normalizeValues;
  var STYLE_ALIAS_GROUPS = {
    margin: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
    font: ["fontFamily", "fontSize", "fontStyle", "fontWeight", "fontStretch"],
    animation: ["animationName", "animationDuration", "animationTimingFunction",
      "animationDelay", "animationIterationCount", "animationDirection", "animationFillMode", "animationFrameTime"],
    border: ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle"],
  };

  function styleAliasBase(property) {
    if (property === "marginLeft" || property === "marginTop" || property === "marginRight") return "margin";
    if (property === "fontSize" || property === "fontFamily") return "font";
    if (property === "animationDuration") return "animation";
    if (property === "borderColor") return "border";
    return "";
  }


  function clearStyleAlias(panel, property, base) {
    var siblings = STYLE_ALIAS_GROUPS[base];
    var values = [];
    for (var index = 0; index < siblings.length; index++) {
      var sibling = siblings[index];
      values[index] = sibling === property ? "" : String(panel.style[sibling] || "");
    }
    panel.style[base] = null;
    for (var restoreIndex = 0; restoreIndex < siblings.length; restoreIndex++) {
      if (values[restoreIndex] !== "")
        panel.style[siblings[restoreIndex]] = values[restoreIndex];
    }
  }

  /* Values mirrored from the current stock v2 unit_status rules. */
  var STOCK_TEAM1_COLOR = "#E7B659";
  var STOCK_TEAM2_COLOR = "#5B79E6";
  var STOCK_NEUTRAL_COLOR = "#5BEFB5";
  var STOCK_ENEMY_COLOR = "#FD4949";
  var STOCK_FRIEND_COLOR = "#FFEFD7";
  var STOCK_HEALING_COLOR = "#5FFF80";
  var STOCK_TEAM_DELTA_COLOR = "#FFEDB8";
  var STOCK_NEUTRAL_DELTA_COLOR = "#F24D4D";
  var STOCK_ENEMY_DELTA_COLOR = "#FFE55B";
  var STOCK_FRIEND_DELTA_COLOR = "#CC340A";
  var STOCK_TEAM1_BULLET_SHIELD_COLOR = "#E9E76A";
  var STOCK_TEAM2_BULLET_SHIELD_COLOR = "#6A75E9";
  var STOCK_ENEMY_BULLET_SHIELD_COLOR = "#FF8181";
  var STOCK_FRIEND_BULLET_SHIELD_COLOR = "#B7DCFF";
  var STOCK_DEFAULT_BULLET_SHIELD_COLOR = "#FFA500";

  var DEFAULT_LEVEL_BORDER = STOCK_TEAM1_COLOR;
  var LEVEL_TIERS = [
    { minimum: 11, color: "#f0d000" },
    { minimum: 19, color: "#ff8c00" },
    { minimum: 27, color: "#e53935" },
    { minimum: 35, color: "#8b0000" },
  ];
  var KIND_FACTS = {
    building: ["building", "CLASS_DESTROYABLE_BUILDING"],
    player: ["player", "CLASS_PLAYER"],
    npc: [
      "creature",
      "minion",
      "CLASS_TROOPER",
      "CLASS_TROOPER_BOSS",
      "neutral_weak",
      "neutral_normal",
      "neutral_strong",
      "neutral_vault",
      "boss_tier1",
      "boss_tier2",
      "boss_tier3",
      "midboss",
    ],
  };
  var NEUTRAL_FACTS = [
    "team_neutral",
    "neutral_weak",
    "neutral_normal",
    "neutral_strong",
    "neutral_vault",
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
  var NATIVE_READOUT_PULSE_KEYS = [
    "pulseNativeReadoutBaseClass",
    "pulseNativeReadoutSubtleClass",
    "pulseNativeReadoutIntenseClass",
  ];
  var NATIVE_READOUT_STYLES = [
    "visibility", "opacity", "washColor", "fontSize", "fontFamily", "animationDuration", "textShadow",
    "padding", "marginLeft", "marginRight", "overflow",
  ];
  var NATIVE_READOUT_CLASSES = [
    "HPColorsRewritePulse", "HPColorsRewritePulseSubtle", "HPColorsRewritePulseIntense",
  ];
  var NAME_STYLES = ["color", "fontSize", "maxHeight", "height", "marginLeft", "marginTop", "textShadow", "padding", "maxWidth", "overflow"];
  var READOUT_FIELDS = ["Visible", "Size", "Font", "OffsetX", "OffsetY",
    "ColorMode", "Mode", "Low", "Mid", "High", "OutlineWidth"];
  // Role -> config key per readout field; enemy keys predate the ally copy.
  var READOUT_KEYS = { enemy: {}, ally: {} };
  for (var readoutFieldIndex = 0; readoutFieldIndex < READOUT_FIELDS.length; readoutFieldIndex++) {
    var readoutField = READOUT_FIELDS[readoutFieldIndex];
    READOUT_KEYS.enemy[readoutField] = "readout" + readoutField;
    READOUT_KEYS.ally[readoutField] = "allyReadout" + readoutField;
  }
  var READOUT_FONTS = {
    oracle: "VALVEOracle, Reaver, sans-serif",
    pulp: "VALVEPulp, Noto Sans, sans-serif",
  };
  var DEFAULT_READOUT_FONT = "Retail Demo, Noto Sans, sans-serif";

  var context = $.GetContextPanel();
  var bars = [];
  var configRoot = null;
  var configRaw = "";
  var config = normalizeConfig({ enabled: false });
  var awaitingConfig = true;
  var awaitingSince = nowMs();
  var configRevision = -1;
  var lastColorChangeAt = 0;
  var eventHandlerId = null;
  var scanJob = null;
  var paintJob = null;
  var stopped = false;
  var configListeners = [];
  var exportedGetConfig = function () {
    return config;
  };
  var exportedGetUltimateProgressColor = function (angle) {
    return ultimateProgressColor(angle, config);
  };
  var exportedOnConfigChanged = function (callback) {
    if (typeof callback !== "function" || stopped) return function () {};
    var slot = configListeners.length;
    configListeners.push(callback);
    try {
      callback(config);
    } catch {}
    return function () {
      if (configListeners[slot] === callback) configListeners[slot] = null;
    };
  };
  context.HPV2GetNormalizedConfig = exportedGetConfig;
  context.HPV2OnConfigChanged = exportedOnConfigChanged;
  context.HPV2GetUltimateProgressColor = exportedGetUltimateProgressColor;
  function notifyConfigListeners() {
    for (var index = 0; index < configListeners.length; index++) {
      var callback = configListeners[index];
      if (typeof callback !== "function") continue;
      try {
        callback(config);
      } catch {}
    }
  }
  var liveLineage = {
    healthbars: null,
    primary: null,
    inner: null,
    healthbarsChildCount: -1,
    primaryChildCount: -1,
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
  function directChild(panel, id) {
    if (!isValid(panel)) return null;
    var children = panelChildren(panel);
    for (var index = 0; index < children.length; index++)
      if (isValid(children[index]) && panelId(children[index]) === id)
        return children[index];
    return null;
  }

  function directChildWithClass(panel, className) {
    if (!isValid(panel)) return null;
    var children = panelChildren(panel);
    for (var index = 0; index < children.length; index++)
      if (isValid(children[index]) && hasClass(children[index], className))
        return children[index];
    return null;
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
  function resolvePrimaryLineage() {
    var healthbars = findWithin(context, "UnitHealthbarsContainer");
    if (!isValid(healthbars)) return null;
    var primary = directChild(healthbars, "UnitHealthbar");
    if (
      !isValid(primary) ||
      !hasClass(primary, "UnitHealthbarContainer") ||
      panelParent(primary) !== healthbars
    )
      return null;
    var inner = directChild(primary, "UnitHealthbarInner");
    if (!isValid(inner) || panelParent(inner) !== primary) return null;
    return { healthbars: healthbars, primary: primary, inner: inner };
  }

  function liveLineageUsable() {
    return (
      isValid(liveLineage.healthbars) &&
      isValid(liveLineage.primary) &&
      isValid(liveLineage.inner) &&
      panelId(liveLineage.healthbars) === "UnitHealthbarsContainer" &&
      panelId(liveLineage.primary) === "UnitHealthbar" &&
      panelId(liveLineage.inner) === "UnitHealthbarInner" &&
      hasClass(liveLineage.primary, "UnitHealthbarContainer") &&
      isDescendantOf(liveLineage.healthbars, context) &&
      panelParent(liveLineage.primary) === liveLineage.healthbars &&
      panelParent(liveLineage.inner) === liveLineage.primary &&
      panelChildCount(liveLineage.healthbars) ===
        liveLineage.healthbarsChildCount &&
      panelChildCount(liveLineage.primary) === liveLineage.primaryChildCount
    );
  }

  function primaryLineage() {
    if (liveLineageUsable()) return liveLineage;
    var lineage = resolvePrimaryLineage();
    liveLineage.healthbars = lineage ? lineage.healthbars : null;
    liveLineage.primary = lineage ? lineage.primary : null;
    liveLineage.inner = lineage ? lineage.inner : null;
    liveLineage.healthbarsChildCount = panelChildCount(liveLineage.healthbars);
    liveLineage.primaryChildCount = panelChildCount(liveLineage.primary);
    return lineage;
  }

  // Every class the classifier reads, deduplicated across the fact tables.
  var UNIT_FACT_CLASSES = (function () {
    var seen = Object.create(null);
    var result = [];
    var lists = [KIND_FACTS.building, KIND_FACTS.player, KIND_FACTS.npc, NEUTRAL_FACTS,
      ["enemy", "friend", "team1", "team2", "spectating"]];
    for (var listIndex = 0; listIndex < lists.length; listIndex++)
      for (var index = 0; index < lists[listIndex].length; index++) {
        var name = lists[listIndex][index];
        if (!seen[name]) {
          seen[name] = true;
          result.push(name);
        }
      }
    return result;
  })();

  function collectUnitFacts(startPanel) {
    var facts = Object.create(null);
    var current = startPanel;
    for (var depth = 0; current && depth < 12; depth++) {
      for (var index = 0; index < UNIT_FACT_CLASSES.length; index++) {
        var name = UNIT_FACT_CLASSES[index];
        if (!facts[name] && hasClass(current, name)) facts[name] = true;
      }
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch {
        break;
      }
    }
    return facts;
  }

  function hasAnyFact(facts, list) {
    for (var index = 0; index < list.length; index++)
      if (facts[list[index]]) return true;
    return false;
  }

  function classifyUnit(facts) {
    var kind = hasAnyFact(facts, KIND_FACTS.building)
      ? "building"
      : hasAnyFact(facts, KIND_FACTS.player)
        ? "player"
        : hasAnyFact(facts, KIND_FACTS.npc)
          ? "npc"
          : "unknown";
    var neutral = hasAnyFact(facts, NEUTRAL_FACTS);
    var ambiguous = !neutral && !!facts.enemy && !!facts.friend;
    var role = neutral
      ? "neutral"
      : ambiguous
        ? "other"
        : facts.enemy
          ? "enemy"
          : facts.friend
            ? "ally"
            : "other";
    var team =
      facts.team1 && !facts.team2
        ? "team1"
        : facts.team2 && !facts.team1
          ? "team2"
          : "";
    return {
      kind: kind,
      role: role,
      team: team,
      ambiguous: ambiguous,
    };
  }

  function resolveSurface(bar, settings) {
    if (
      !settings ||
      !settings.enabled ||
      bar.ambiguousRelation ||
      bar.kind === "unknown"
    )
      return "";
    if (bar.role === "neutral")
      return bar.kind === "npc" && settings.npcNeutralEnabled ? "fill" : "";
    if (bar.role !== "enemy" && bar.role !== "ally") return "";
    if (bar.kind === "player") return "player";
    var gate =
      bar.kind === "npc"
        ? bar.role === "enemy"
          ? "npcEnemyEnabled"
          : "npcAllyEnabled"
        : bar.role === "enemy"
          ? "buildingEnemyEnabled"
          : "buildingAllyEnabled";
    if (settings[gate]) return "unit";
    return "";
  }
  function classifyTarget(bar) {
    var facts = collectUnitFacts(bar.parts.inner);
    var classified = classifyUnit(facts);
    var spectating = !!facts.spectating;
    var changed =
      classified.kind !== bar.kind ||
      classified.role !== bar.role ||
      classified.ambiguous !== bar.ambiguousRelation ||
      classified.team !== bar.team ||
      spectating !== bar.spectating;
    if (!changed) return false;
    var previousSurface = bar.surface;
    clearLevelOwnership(bar);
    bar.kind = classified.kind;
    bar.role = classified.role;
    bar.ambiguousRelation = classified.ambiguous;
    bar.team = classified.team;
    bar.spectating = spectating;
    bar.surface = resolveSurface(bar, config);
    if (previousSurface === "player" && bar.surface !== "player") {
      clearPulse(bar);
      clearKillMarkerOwnership(bar);
      clearReadoutOwnership(bar);
      restoreBarGeometry(
        bar,
        bar.parts,
        bar.panelBaseline || {},
        "levelContainer",
      );
      restoreBarGeometry(
        bar,
        bar.parts,
        bar.panelBaseline || {},
        "unitInfo",
      );
      clearOwnedStyle(
        bar.parts && bar.parts.ultIcon,
        "washColor",
        bar.applied,
        "ultWashColor",
      );
      setNativeHealthValueVisibility(bar, false);
    }
    syncOwnedRootClasses(bar);
    bar.dirty = true;
    return true;
  }

  // lineage comes from primaryLineage(), which already validated the tree.
  function resolveParts(lineage) {
    if (!lineage) return {};
    var healthbars = lineage.healthbars;
    var primary = lineage.primary;
    var inner = lineage.inner;
    var infoHealth = null;
    var unitStatus = null;
    var windowRoot = null;
    var current = inner;
    for (var depth = 0; current && depth < 12; depth++) {
      if (depth < 8) {
        var id = panelId(current);
        if (!infoHealth && id === "InfoHealthContainer") infoHealth = current;
        if (!unitStatus && id === "UnitStatus") unitStatus = current;
      }
      if (!windowRoot && hasClass(current, "WindowRoot"))
        windowRoot = current;
      if (infoHealth && unitStatus && windowRoot) break;
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch {
        break;
      }
    }
    var unitInfo = directChildWithClass(infoHealth, "unit_info_panel");
    var ultBackground = directChild(unitInfo, "unit_info_bg");
    var counterContainer = directChild(windowRoot, "hp_counter_container");
    var counterRow = findWithin(counterContainer, "hp_counter_row");
    return {
      windowRoot: windowRoot,
      healthbars: healthbars,
      primary: primary,
      inner: inner,
      infoHealth: infoHealth,
      unitStatus: unitStatus,
      name: directChild(windowRoot, "name"),
      fill: directChild(inner, "unit_healthbar_lagging"),
      healing: directChild(inner, "unit_healthbar_healing"),
      delta: directChild(inner, "unit_healthbar_delta"),
      bulletShield: directChild(inner, "unit_healthbar_bullet_shield"),
      pulseOverlay: directChild(inner, "hp_colors_pulse_overlay"),
      pipLines: directChild(primary, "UnitHealthbarLines"),
      killMarker: directChild(primary, "hp_colors_kill_marker"),
      unitInfo: unitInfo,
      ultBackground: ultBackground,
      ultIcon: directChild(ultBackground, "unit_ult_ready_icon"),
      ultOverlay: directChild(ultBackground, "HPV2UltimateOverlay"),
      levelContainer: directChild(infoHealth, "LevelContainer"),
      levelLabel: findWithin(infoHealth, "unit_level_label"),
      healthValue: directChild(infoHealth, "UnitHealthbarValue") ||
        directChild(counterRow, "UnitHealthbarValue"),
      counterContainer: counterContainer,
      counterAnchor: findWithin(counterContainer, "hp_counter_anchor"),
      counterRow: counterRow,
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
  function ultimateTimerEnabled() {
    return config.enabled !== false && config.ultimateTimerEnabled !== false;
  }

  function applyUltimateWash(bar, color) {
    var parentColor =
      ultimateTimerEnabled() && color
        ? config.ultimateTimerColorMode === "follow"
          ? color
          : "#FFFFFF"
        : "";
    setStyle(
      bar.parts && bar.parts.ultOverlay,
      "washColor",
      parentColor,
      bar.applied,
      "ultOverlayWashColor",
    );
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


  function findBarByInner(inner) {
    for (var index = 0; index < bars.length; index++) {
      if (bars[index].parts.inner === inner) return bars[index];
    }
    return null;
  }

  function isComplete(parts) {
    return (
      isValid(parts.windowRoot) &&
      isValid(parts.healthbars) &&
      isValid(parts.primary) &&
      isValid(parts.inner) &&
      isValid(parts.infoHealth) &&
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
          !isValid(bar.parts.inner)
        ) {
          return;
        }
        var lineage = primaryLineage();
        if (lineage && lineage.inner === bar.parts.inner &&
            refreshBarParts(bar, lineage))
          reportData(bar);
      });
    } catch {
      bar.partsRetryJob = null;
    }
  }


  function readPanelNumber(panel, property) {
    var value = cssLayout(panel, property, property === "actualyoffset" ||
      property === "actuallayoutheight" ? "y" : "x");
    return Number.isFinite(value) ? value : 0;
  }

  function readPanelWidth(panel) {
    return Math.max(0, readPanelNumber(panel, "actuallayoutwidth"));
  }

  function readPanelHeight(panel) {
    return Math.max(0, readPanelNumber(panel, "actuallayoutheight"));
  }

  function rebaseNativeLabel(bar, panel, key, right) {
    var owner = bar[key];
    if (owner && (owner.panel !== panel || right === "")) {
      setStyle(owner.panel, "marginRight", owner.marginRight, bar.applied, key + "MarginRight");
      bar[key] = null;
    }
    if (!isValid(panel) || right === "") return;
    if (!bar[key]) bar[key] = {
      panel: panel,
      marginRight: String(panel.style.marginRight || ""),
    };
    setStyle(panel, "marginRight", right, bar.applied, key + "MarginRight");
  }

  function rebaseStockGeometry(bar) {
    var info = bar.parts.infoHealth;
    var width = cssLayout(info, "actuallayoutwidth", "x");
    var height = cssLayout(info, "actuallayoutheight", "y");
    if (!Number.isFinite(width) || width <= 0 ||
        !Number.isFinite(height) || height <= 0) return;
    var origin = "50% " + String(8500 / height) + "%";
    var resized = width !== bar.canvasWidth || height !== bar.canvasHeight;
    bar.canvasWidth = width;
    bar.canvasHeight = height;
    bar.stockTransformOrigin = origin;
    setStyle(info, "transformOrigin", origin, bar.applied, "infoStockOrigin");
    setStyle(panelParent(info), "transformOrigin", origin, bar.applied, "unitStockOrigin");
    if (!bar.surface ||
        (config.widthScale === 100 && config.heightScale === 100))
      setStyle(bar.parts.healthbars, "transformOrigin", origin,
        bar.applied, "barTransformOrigin");
    for (var index = 0; index < STOCK_ACCESSORIES.length; index++) {
      var entry = STOCK_ACCESSORIES[index];
      var panel = bar.parts[entry.part];
      var panelHeight = cssLayout(panel, "actuallayoutheight", "y");
      var left = entry.left + (width - 200) / 2;
      var top = Number.isFinite(panelHeight) && panelHeight > 0
        ? 85 - (panelHeight + 14) / 2 : entry.top;
      if (bar[entry.baseLeft] !== left || bar[entry.baseTop] !== top || resized) {
        bar[entry.baseLeft] = left;
        bar[entry.baseTop] = top;
        bar[entry.panel] = null;
        bar.dirty = true;
      }
      if (bar.surface !== "player" || !bar[entry.panel]) {
        setStyle(panel, "marginLeft", pixels(left), bar.applied, entry.marginLeft);
        setStyle(panel, "marginTop", pixels(top), bar.applied, entry.marginTop);
      }
    }
    var health = panelParent(bar.parts.healthValue) === info ? bar.parts.healthValue : null;
    var shield = bar.shieldValue;
    if (!isValid(shield) || panelParent(shield) !== info)
      shield = bar.shieldValue = directChild(info, "UnitShieldbarValue");
    // At the stock canvas size CSS owns native-label placement entirely.
    var healthRight = "";
    var shieldRight = "";
    if (width !== 200) {
      var boss = false;
      var friend = false;
      for (var ancestor = info, depth = 0; ancestor && depth < 12; depth++) {
        boss = boss || hasClass(ancestor, "boss_tier1") ||
          hasClass(ancestor, "boss_tier2") || hasClass(ancestor, "boss_barracks") ||
          hasClass(ancestor, "building");
        friend = friend || hasClass(ancestor, "friend");
        ancestor = panelParent(ancestor);
      }
      healthRight = pixels(width / 2 - (boss ? 35 : friend ? 30 : 40));
      shieldRight = pixels(width / 2 - 40);
    }
    rebaseNativeLabel(bar, health, "stockHealthRebase", healthRight);
    rebaseNativeLabel(bar, shield, "stockShieldRebase", shieldRight);
    if (resized) bar.dirty = true;
  }

  // rebased: the caller already ran rebaseStockGeometry this tick.
  function sampleBarGeometry(bar, rebased) {
    if (!rebased) rebaseStockGeometry(bar);
    var stack = bar.parts.healthbars;
    var primary = bar.parts.primary;
    var inner = bar.parts.inner;
    var rawStackX = cssLayout(stack, "actualxoffset", "x");
    var rawStackY = cssLayout(stack, "actualyoffset", "y");
    var rawPrimaryX = cssLayout(primary, "actualxoffset", "x");
    var rawPrimaryY = cssLayout(primary, "actualyoffset", "y");
    var stackX = Number.isFinite(rawStackX) ? rawStackX : 0;
    var stackY = Number.isFinite(rawStackY) ? rawStackY : 0;
    var stackWidth = readPanelWidth(stack);
    var stackHeight = readPanelHeight(stack);
    var primaryX = Number.isFinite(rawPrimaryX) ? rawPrimaryX : 0;
    var primaryY = Number.isFinite(rawPrimaryY) ? rawPrimaryY : 0;
    var primaryWidth = readPanelWidth(primary);
    var primaryHeight = readPanelHeight(primary);
    var innerX = readPanelNumber(inner, "actualxoffset");
    var innerY = readPanelNumber(inner, "actualyoffset");
    var innerWidth = readPanelWidth(inner);
    var innerHeight = readPanelHeight(inner);
    bar.geometryReady = stackWidth > 0 && stackHeight > 0 &&
      primaryWidth > 0 && primaryHeight > 0 &&
      Number.isFinite(rawStackX) && Number.isFinite(rawStackY) &&
      Number.isFinite(rawPrimaryX) && Number.isFinite(rawPrimaryY);
    var changed =
      !bar.geometrySampled ||
      stackX !== bar.stackX ||
      stackY !== bar.stackY ||
      stackWidth !== bar.stackWidth ||
      stackHeight !== bar.stackHeight ||
      primaryX !== bar.primaryX ||
      primaryY !== bar.primaryY ||
      primaryWidth !== bar.primaryWidth ||
      primaryHeight !== bar.primaryHeight ||
      innerX !== bar.innerX ||
      innerY !== bar.innerY ||
      innerWidth !== bar.innerWidth ||
      innerHeight !== bar.innerHeight;
    bar.geometrySampled = true;
    bar.stackX = stackX;
    bar.stackY = stackY;
    bar.stackWidth = stackWidth;
    bar.stackHeight = stackHeight;
    bar.primaryX = primaryX;
    bar.primaryY = primaryY;
    bar.primaryWidth = primaryWidth;
    bar.primaryHeight = primaryHeight;
    bar.innerX = innerX;
    bar.innerY = innerY;
    bar.innerWidth = innerWidth;
    bar.innerHeight = innerHeight;
    if (changed) {
      bar.geometryChanged = true;
      bar.markerGeometryChanged = true;
      bar.dirty = true;
    }
    return changed;
  }


  function nativePx(value) {
    return Math.round(Number(value || 0) * LEGACY_TO_NATIVE * 100) / 100;
  }
  function pixels(value) {
    return Math.round(value * 100) / 100 + "px";
  }
  function readHealthSignal(panel, property, inline) {
    try {
      var value = inline ? panel.style[property] : panel[property];
      return value === undefined || value === null ? "" : String(value).trim();
    } catch {
      return "";
    }
  }

  function healthScaleNumber(value) {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
      return NaN;
    return Number(value);
  }

  function healthLengthFraction(value, width) {
    var match = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|%)$/i.exec(value);
    if (!match) return null;
    var number = Number(match[1]);
    if (!Number.isFinite(number)) return null;
    return match[2].toLowerCase() === "%"
      ? number / 100
      : width > 0 ? number / width : null;
  }

  function visibleHealthFraction(fill, innerWidth) {
    if (innerWidth <= 0) return 0;
    var width = cssLayout(fill, "actuallayoutwidth", "x");
    var fraction = Number.isFinite(width) && width >= 0
      ? width / innerWidth : Infinity;
    var x = cssLayout(fill, "actualxoffset", "x");
    if (Number.isFinite(width) && width >= 0 && Number.isFinite(x) && x < 0)
      fraction = Math.min(fraction, (width + x) / innerWidth);
    var clip = /^rect\s*\(\s*([^)]*)\)$/i.exec(
      readHealthSignal(fill, "clip", true),
    );
    if (clip) {
      var edges = clip[1].trim().split(
        clip[1].indexOf(",") >= 0 ? /\s*,\s*/ : /\s+/,
      );
      if (edges.length === 4) {
        var top = healthLengthFraction(edges[0], width);
        var right = healthLengthFraction(edges[1], width);
        var bottom = healthLengthFraction(edges[2], width);
        var left = healthLengthFraction(edges[3], width);
        if (top !== null && right !== null && bottom !== null && left !== null)
          fraction = Math.min(fraction, right - left);
      }
    }
    var transform = readHealthSignal(fill, "transform", true);
    var scalePattern = /\b(scaleX|scale)\(\s*([^)]*)\)/gi;
    var scaleMatch;
    while ((scaleMatch = scalePattern.exec(transform))) {
      var components = scaleMatch[2].trim().split(/\s*,\s*|\s+/);
      if (components.length < 1 || components.length > 2 ||
          (scaleMatch[1].toLowerCase() === "scalex" && components.length !== 1))
        continue;
      var scaleX = healthScaleNumber(components[0]);
      var scaleY = components.length === 2
        ? healthScaleNumber(components[1]) : scaleX;
      if (Number.isFinite(scaleX) && Number.isFinite(scaleY))
        fraction = Math.min(fraction, scaleX);
    }
    var preScale = readHealthSignal(fill, "preTransformScale2d", true)
      .split(/\s*,\s*|\s+/)[0];
    var preScaleX = healthScaleNumber(preScale);
    if (Number.isFinite(preScaleX)) fraction = Math.min(fraction, preScaleX);
    var inlineWidth = healthLengthFraction(
      readHealthSignal(fill, "width", true), innerWidth,
    );
    if (inlineWidth !== null) fraction = Math.min(fraction, inlineWidth);
    return Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  }

  function sampleHealthPercent(bar, rebased) {
    sampleBarGeometry(bar, rebased);
    var fillWidth = readPanelWidth(bar.parts.fill);
    var innerWidth = bar.innerWidth;
    var primaryWidth = bar.primaryWidth;
    var fraction = visibleHealthFraction(bar.parts.fill, innerWidth);
    var sampled = bar.healthSampled;
    var healthWidthChanged =
      !sampled || innerWidth !== bar.sampleHealthParentWidth;
    var barWidthChanged = !sampled || primaryWidth !== bar.sampleBarWidth;
    var previousPercent = bar.lastWidthPercent;
    var previousFillWidth = bar.sampleFillWidth;
    var fillChanged = !sampled || fillWidth !== previousFillWidth;
    var overlayPercent = Math.round(fraction * 10000) / 100;
    var overlayChanged =
      !sampled || overlayPercent !== bar.pulseOverlayPercent;
    bar.healthSampled = true;
    bar.sampleFillWidth = fillWidth;
    bar.sampleHealthParentWidth = innerWidth;
    bar.sampleBarWidth = primaryWidth;
    bar.pulseOverlayPercent = overlayPercent;
    if (innerWidth <= 0) {
      bar.lastWidthPercent = -1;
      bar.healthPresentationChanged =
        !sampled ||
        previousPercent >= 0 ||
        fillChanged ||
        healthWidthChanged ||
        barWidthChanged ||
        bar.geometryChanged;
      if (bar.healthPresentationChanged) bar.dirty = true;
      return -1;
    }
    var widthPercent = Math.max(0, Math.min(100, (fraction * 100) | 0));
    bar.healthPresentationChanged =
      !sampled ||
      widthPercent !== previousPercent ||
      fillChanged ||
      healthWidthChanged ||
      barWidthChanged ||
      bar.geometryChanged ||
      (bar.colorPulseActive && overlayChanged);
    bar.lastWidthPercent = widthPercent;
    if (bar.healthPresentationChanged) bar.dirty = true;
    return widthPercent;
  }

  function readLabelText(panel) {
    try {
      var text = panel.text === String(panel.text) ? panel.text : "";
      if (text) return text;
      if (panel.GetAttributeString)
        return String(panel.GetAttributeString("text", "") || "");
    } catch {}
    return "";
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
  function ultimateProgressColor(angle, settings) {
    if (!settings || settings.ultimateTimerColorMode === "follow")
      return "#FFFFFF";
    if (settings.ultimateTimerColorMode === "fixed")
      return angle >= 360
        ? settings.ultimateTimerAvailableColor
        : settings.ultimateTimerUnavailableColor;
    return interpolateHex(
      settings.ultimateTimerUnavailableColor,
      settings.ultimateTimerAvailableColor,
      angle / 360,
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
    if (
      bar.spectating &&
      (bar.role === "enemy" || bar.role === "ally") &&
      (bar.team === "team1" || bar.team === "team2")
    )
      return teamHighColor(bar.team, "");
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

  function styleMatches(panel, property, cache, cacheKey) {
    if (!isValid(panel) || !panel.style) return false;
    try {
      var native = cache && cache.nativeStyles && cache.nativeStyles[cacheKey];
      if (!native || native.panel !== panel) return false;
      return String(panel.style[property] || "") === native.value &&
        (!native.base || String(panel.style[native.base] || "") === native.baseValue);
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
      styleMatches(panel, property, cache, cacheKey)
    ) {
      return;
    }
    try {
      var base = styleAliasBase(property);
      var previousBase = base ? String(panel.style[base] || "") : "";
      var aliasBase = value === "" ? base : "";
      if (aliasBase) {
        if (String(panel.style[property] || "") !== "")
          clearStyleAlias(panel, property, aliasBase);
      } else {
        panel.style[property] = value === "" ? null : value;
      }
      if (cache) {
        var nativeStyles = cache.nativeStyles || (cache.nativeStyles = {});
        var baseValue = base ? String(panel.style[base] || "") : "";
        if (base) {
          for (var key in nativeStyles) {
            var sibling = nativeStyles[key];
            if (sibling.panel === panel && sibling.base === base &&
                sibling.baseValue === previousBase)
              sibling.baseValue = baseValue;
          }
        }
        var native = nativeStyles[cacheKey] || (nativeStyles[cacheKey] = {});
        native.panel = panel;
        native.value = String(panel.style[property] || "");
        native.base = base;
        native.baseValue = baseValue;
        cache[cacheKey] = value;
      }
    } catch {
      if (cache) cache[cacheKey] = null;
      return;
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
      !styleMatches(panel, property, cache, cacheKey)
    );
  }

  function layoutStyleDrift(bar) {
    var styleCount =
      bar.surface === "player" ? GEOMETRY_STYLES.length : 4;
    for (var index = 0; index < styleCount; index++) {
      var entry = GEOMETRY_STYLES[index];
      if (
        cachedStyleDrift(
          bar.parts[entry[0]],
          entry[1],
          bar.applied,
          entry[2],
        )
      )
        return true;
    }
    return false;
  }



  function nativeReadoutEnabled(bar) {
    var keys = READOUT_KEYS[bar.role === "ally" ? "ally" : "enemy"];
    return !!(config.enabled && bar.surface && keys &&
      config[keys.Visible]);
  }

  function adoptNativeReadout(bar) {
    var panel = bar.parts.healthValue;
    var row = bar.parts.counterRow;
    if (!isValid(panel) || !isValid(row)) return false;
    if (!bar.healthValueOriginalParent)
      bar.healthValueOriginalParent = bar.parts.infoHealth;
    try {
      if (panelParent(panel) !== row) panel.SetParent(row);
      if (panelParent(panel) !== row) return false;
      // Release only measured canvas compensation, not pre-existing native styles.
      rebaseNativeLabel(bar, null, "stockHealthRebase", "");
      bar.nativeReadoutOwned = true;
      return true;
    } catch {
      return false;
    }
  }

  function restoreNativeReadout(bar) {
    if (!bar.nativeReadoutOwned && !bar.healthValueOriginalParent) return;
    syncNativeReadoutPulse(bar, false, false, false, "");
    var baseline = (bar.panelBaseline || {}).healthValue;
    for (var index = 0; index < NATIVE_READOUT_STYLES.length; index++) {
      var property = NATIVE_READOUT_STYLES[index];
      setStyle(bar.parts.healthValue, property, baselineStyle(baseline, property),
        bar.applied, property === "visibility"
          ? "nativeHealthValueVisibility" : "nativeReadout" + property);
    }
    bar.nativeReadoutOwned = false;
    bar.nativeHealthValueOwned = false;
    var parent = bar.healthValueOriginalParent;
    if (isValid(bar.parts.healthValue) && isValid(parent)) {
      try {
        if (panelParent(bar.parts.healthValue) !== parent)
          bar.parts.healthValue.SetParent(parent);
        if (panelParent(bar.parts.healthValue) === parent)
          bar.healthValueOriginalParent = null;
      } catch {}
    }
    rebaseStockGeometry(bar);
  }


  // keys: READOUT_KEYS entry, or null to clear. low/mid/high/mode: the bar colors.
  function applyReadout(bar, keys, low, mid, high, mode, pulseModifiers) {
    var color = "";
    var fontSize = "";
    var fontFamily = "";
    if (keys) {
      if (config[keys.ColorMode] === "custom") {
        low = config[keys.Low];
        mid = config[keys.Mid];
        high = config[keys.High];
        mode = config[keys.Mode];
      }
      color = (mode === "gradient" ? gradientColor : fixedColor)(
        bar.lastWidthPercent,
        low,
        mid,
        high,
      );
      var size = pulseModifiers
        ? config.enemyPulseReadoutSize
        : config[keys.Size];
      var offsetX = pulseModifiers
        ? config.enemyPulseReadoutOffsetX
        : config[keys.OffsetX];
      var offsetY = pulseModifiers
        ? config.enemyPulseReadoutOffsetY
        : config[keys.OffsetY];
      fontSize = pixels(nativePx(size));
      fontFamily = READOUT_FONTS[config[keys.Font]] || DEFAULT_READOUT_FONT;
      bar.readoutPosition = {
        x: nativePx(config.positionX) + offsetX * config.widthScale / 100,
        y: nativePx(config.positionY) + offsetY * config.heightScale / 100,
      };
    }
    if (keys && adoptNativeReadout(bar)) {
      setStyle(bar.parts.healthValue, "opacity", "1", bar.applied, "nativeReadoutopacity");
      setStyle(bar.parts.healthValue, "washColor", color, bar.applied, "nativeReadoutwashColor");
      setStyle(bar.parts.healthValue, "fontSize", fontSize, bar.applied, "nativeReadoutfontSize");
      setStyle(bar.parts.healthValue, "fontFamily", fontFamily, bar.applied, "nativeReadoutfontFamily");
      applyTextOutline(bar.parts.healthValue, config[keys.OutlineWidth], "#10130D",
        (bar.panelBaseline || {}).healthValue, bar.applied, "nativeReadouttextShadow");
      // noclip on parents does not enlarge the label's own glyph/shadow box.
      // Equal negative margins cancel padding in the fit-children row, keeping
      // the native text position and the row's measured/clamped bounds intact.
      var outlineRoom = Math.ceil(config[keys.OutlineWidth]);
      setStyle(bar.parts.healthValue, "padding", "0px " + outlineRoom + "px",
        bar.applied, "nativeReadoutpadding");
      setStyle(bar.parts.healthValue, "marginLeft", pixels(-outlineRoom),
        bar.applied, "nativeReadoutmarginLeft");
      setStyle(bar.parts.healthValue, "marginRight", pixels(-outlineRoom),
        bar.applied, "nativeReadoutmarginRight");
      setStyle(bar.parts.healthValue, "overflow", "noclip",
        bar.applied, "nativeReadoutoverflow");
    } else if (!keys) {
      restoreNativeReadout(bar);
    }
    if (keys) positionReadout(bar);
    else clearReadoutGeometry(bar);
  }

  function clearReadoutGeometry(bar) {
    bar.readoutPosition = null;
    bar.readoutSample = null;
    var parts = bar.parts || {};
    setStyle(parts.counterAnchor, "width", "", bar.applied, "readoutAnchorWidth");
    setStyle(parts.counterAnchor, "height", "", bar.applied, "readoutAnchorHeight");
    setStyle(parts.counterAnchor, "transform", "", bar.applied, "readoutTransform");
    setStyle(parts.counterRow, "marginRight", "", bar.applied, "readoutRight");
    setStyle(parts.counterRow, "marginTop", "", bar.applied, "readoutTop");
  }

  function positionReadout(bar) {
    var position = bar.readoutPosition;
    var parts = bar.parts || {};
    if (!position || !isValid(parts.counterContainer) ||
        !isValid(parts.counterAnchor) || !isValid(parts.counterRow)) return false;
    // actuallayout* are window pixels; margins and sizes are CSS pixels.
    // The 6722 world panel renders at window scale 2 (400x420 for 200x210).
    var width = cssLayout(parts.counterContainer, "actuallayoutwidth", "x");
    var height = cssLayout(parts.counterContainer, "actuallayoutheight", "y");
    var rowWidth = cssLayout(parts.counterRow, "actuallayoutwidth", "x");
    var rowHeight = cssLayout(parts.counterRow, "actuallayoutheight", "y");
    if (!Number.isFinite(width) || width <= 0 ||
        !Number.isFinite(height) || height <= 0 ||
        !Number.isFinite(rowWidth) || rowWidth <= 0 ||
        !Number.isFinite(rowHeight) || rowHeight <= 0) {
      bar.readoutSample = null;
      return false;
    }
    // The row is right-aligned, so a wider or narrower engine number grows
    // left in layout at once; only the left-edge clamp depends on rowWidth.
    var right = Math.max(0, Math.min(Math.max(0, width - rowWidth),
      width / 2 - (bar.role === "ally" ? 30 : 40) - position.x));
    var top = Math.max(0, Math.min(Math.max(0, height - rowHeight), 66 + position.y));
    var sample = bar.readoutSample;
    var changed = !sample || sample.width !== width || sample.height !== height ||
      sample.rowWidth !== rowWidth || sample.rowHeight !== rowHeight ||
      sample.right !== right || sample.top !== top;
    if (changed) {
      sample = bar.readoutSample = {
        width: width, height: height, rowWidth: rowWidth, rowHeight: rowHeight,
        right: right, top: top,
        widthPx: pixels(width), heightPx: pixels(height),
        rightPx: pixels(right), topPx: pixels(top),
      };
    }
    // Cached native readback also retries rejected writes and repairs drift.
    setStyle(parts.counterAnchor, "width", sample.widthPx, bar.applied, "readoutAnchorWidth");
    setStyle(parts.counterAnchor, "height", sample.heightPx, bar.applied, "readoutAnchorHeight");
    setStyle(parts.counterAnchor, "transform", "", bar.applied, "readoutTransform");
    setStyle(parts.counterRow, "marginRight", sample.rightPx, bar.applied, "readoutRight");
    setStyle(parts.counterRow, "marginTop", sample.topPx, bar.applied, "readoutTop");
    return changed;
  }

  function cssLayout(panel, property, axis) {
    try {
      var raw = panel && panel[property];
      if (raw === null || raw === undefined || raw === "") return NaN;
      var value = Number(raw);
      var scale = Number(panel["actualuiscale_" + axis]);
      return Number.isFinite(value) && Math.abs(value) < 1000000
        ? value / (Number.isFinite(scale) && scale > 0 ? scale : 1) : NaN;
    } catch {
      return NaN;
    }
  }
  function setNativeHealthValueVisibility(bar, suppress) {
    var baseline = bar.panelBaseline || {};
    if (!bar.nativeReadoutOwned && !suppress && !bar.nativeHealthValueOwned) return;
    setStyle(
      bar.parts && bar.parts.healthValue,
      "visibility",
      bar.nativeReadoutOwned ? "visible"
        : suppress ? "collapse" : baselineStyle(baseline.healthValue, "visibility"),
      bar.applied,
      "nativeHealthValueVisibility",
    );
    bar.nativeHealthValueOwned = bar.nativeReadoutOwned || suppress;
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
    rebaseStockGeometry(bar);
    var parts = bar.parts || {};
    var oldParts = previousParts || {};
    var oldBaseline = previousBaseline || {};
    var healthValue = retainPanelBaseline(
      parts.healthValue, oldParts.healthValue, oldBaseline.healthValue, NATIVE_READOUT_STYLES,
    );
    // Canvas compensation is our own inline margin, not the label's native
    // baseline. Preserve the pre-rebase value when capturing a generation.
    if (bar.stockHealthRebase && bar.stockHealthRebase.panel === parts.healthValue)
      healthValue.marginRight = bar.stockHealthRebase.marginRight;
    return {
      name: retainPanelBaseline(parts.name, oldParts.name, oldBaseline.name, NAME_STYLES),
      primary: retainPanelBaseline(
        parts.primary,
        oldParts.primary,
        oldBaseline.primary,
        ["opacity"],
      ),
      healthbars: retainPanelBaseline(
        parts.healthbars,
        oldParts.healthbars,
        oldBaseline.healthbars,
        ["transform", "transformOrigin", "preTransformScale2d"],
      ),
      levelContainer: retainPanelBaseline(
        parts.levelContainer,
        oldParts.levelContainer,
        oldBaseline.levelContainer,
        ["marginLeft", "marginTop", "visibility", "border"],
      ),
      unitInfo: retainPanelBaseline(
        parts.unitInfo,
        oldParts.unitInfo,
        oldBaseline.unitInfo,
        ["marginLeft", "marginTop"],
      ),
      ultBackground: retainPanelBaseline(
        parts.ultBackground,
        oldParts.ultBackground,
        oldBaseline.ultBackground,
        ["opacity"],
      ),
      healthValue: healthValue,
      healthValuePulseClasses:
        parts.healthValue === oldParts.healthValue && oldBaseline.healthValuePulseClasses
          ? oldBaseline.healthValuePulseClasses
          : NATIVE_READOUT_CLASSES.map(function (name) {
              return hasClass(parts.healthValue, name);
            }),
    };
  }

  function clearPlayerNameOwnership(bar) {
    if (!bar.nameOwned) return;
    var baseline = (bar.panelBaseline || {}).name;
    var restored = true;
    for (var index = 0; index < NAME_STYLES.length; index++) {
      var property = NAME_STYLES[index];
      var value = baselineStyle(baseline, property);
      setStyle(bar.parts.name, property, value, bar.applied, "name" + property);
      if (bar.applied["name" + property] !== value) restored = false;
    }
    bar.nameOwned = !restored;
  }

  function applyTextOutline(panel, width, color, baseline, cache, key) {
    // Stock offBlack = #10130D (citadel_base_styles); names use offBlack&ee.
    // Five leaves the native rule untouched, unless returning our inline override.
    if (width === 5 && !Object.prototype.hasOwnProperty.call(cache, key)) return;
    setStyle(panel, "textShadow", width === 5 ? baselineStyle(baseline, "textShadow") :
      "0px 0px 0px " + width + " " + color, cache, key);
  }

  function applyPlayerName(bar) {
    var panel = bar.parts.name;
    if (!config.enabled || bar.surface !== "player" || !config.playerNamesVisible ||
        !isValid(panel)) {
      clearPlayerNameOwnership(bar);
      return;
    }
    bar.nameOwned = true;
    var baseline = (bar.panelBaseline || {}).name;
    applyTextOutline(panel, config.nameOutlineWidth, "#10130Dee",
      baseline, bar.applied, "nametextShadow");
    var outlineRoom = Math.max(2, Math.ceil(config.nameOutlineWidth));
    setStyle(panel, "padding", "0px " + outlineRoom + "px", bar.applied, "namepadding");
    // Symmetric padding preserves the center. Expand the stock width limit by
    // the added guard so increasing outline strength cannot shrink the name.
    var maxWidth = Number.parseFloat(baselineStyle(baseline, "maxWidth"));
    if (!Number.isFinite(maxWidth)) maxWidth = 170;
    setStyle(panel, "maxWidth", pixels(maxWidth + 2 * (outlineRoom - 2)),
      bar.applied, "namemaxWidth");
    setStyle(panel, "overflow", "noclip", bar.applied, "nameoverflow");
    var enemy = bar.role === "enemy";
    var colorEnabled = enemy ? config.enemyNameColorEnabled : config.allyNameColorEnabled;
    var color = colorEnabled ? (enemy ? config.enemyNameColor : config.allyNameColor) : "";
    // Stock spectator color uses hexadecimal alpha 80, not 80 percent.
    if (color && bar.spectating) color += "80";
    setStyle(panel, "color", color || baselineStyle(baseline, "color"),
      bar.applied, "namecolor");
    var sized = config.nameSize !== 14;
    setStyle(panel, "fontSize", sized ? pixels(config.nameSize) : baselineStyle(baseline, "fontSize"),
      bar.applied, "namefontSize");
    setStyle(panel, "maxHeight", sized ? pixels(Math.ceil(config.nameSize * 1.5)) :
      baselineStyle(baseline, "maxHeight"), bar.applied, "namemaxHeight");
    setStyle(panel, "height", sized ? "fit-children" : baselineStyle(baseline, "height"),
      bar.applied, "nameheight");
    var width = cssLayout(bar.parts.windowRoot, "actuallayoutwidth", "x");
    var height = cssLayout(bar.parts.windowRoot, "actuallayoutheight", "y");
    var nameWidth = cssLayout(panel, "actuallayoutwidth", "x");
    var nameHeight = cssLayout(panel, "actuallayoutheight", "y");
    if (!(width > 0 && height > 0 && nameWidth > 0 && nameHeight > 0)) return;
    var reach = Math.max(0, (width - nameWidth) / 2);
    var x = Math.max(-reach, Math.min(reach, config.nameOffsetX));
    var top = Math.max(0, Math.min(Math.max(0, height - nameHeight), 47 + config.nameOffsetY));
    setStyle(panel, "marginLeft", x ? pixels(x * 2) : baselineStyle(baseline, "marginLeft"),
      bar.applied, "namemarginLeft");
    setStyle(panel, "marginTop", top !== 47 ? pixels(top) : baselineStyle(baseline, "marginTop"),
      bar.applied, "namemarginTop");
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
      setStyle(staminaSurface.icons[index], "washColor",
        baselineStyle(baseline, "washColor"), cache, "washColor");
    }
    setOwnedClass(
      staminaSurface.container,
      "HPColorsRewriteStaminaOwned",
      false,
      staminaSurface.applied,
      "ownedClass",
    );
    setOwnedClass(staminaSurface.container, "HPColorsRewriteStaminaCircle", false,
      staminaSurface.applied, "circleClass");
    setOwnedClass(staminaSurface.container, "HPColorsRewriteStaminaBox", false,
      staminaSurface.applied, "boxClass");
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
          "washColor",
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
    var colorOwned = config.enemyStaminaColorEnabled;
    var shape = config.staminaShape || "arrow";
    var shaped = shape === "circle" || shape === "box";
    setOwnedClass(
      staminaSurface.container,
      "HPColorsRewriteStaminaOwned",
      shaped,
      staminaSurface.applied,
      "ownedClass",
    );
    setOwnedClass(staminaSurface.container, "HPColorsRewriteStaminaCircle", shape === "circle",
      staminaSurface.applied, "circleClass");
    setOwnedClass(staminaSurface.container, "HPColorsRewriteStaminaBox", shape === "box",
      staminaSurface.applied, "boxClass");
    var transformOwned =
      config.staminaOffsetX !== 0 || config.staminaOffsetY !== 0;
    var transform = transformOwned
      ? "translateX(" +
        String(nativePx(config.staminaOffsetX)) +
        "px) translateY(" +
        String(nativePx(config.staminaOffsetY)) +
        "px)"
      : baselineStyle(staminaSurface.containerBaseline, "transform");
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
          ? pixels(nativePx(config.staminaWidth))
          : baselineStyle(baseline, "width"),
        cache,
        "width",
      );
      setStyle(
        staminaSurface.icons[index],
        "height",
        heightOwned
          ? pixels(nativePx(config.staminaHeight))
          : baselineStyle(baseline, "height"),
        cache,
        "height",
      );
      var empty = false;
      if (colorOwned || shaped) {
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
        shaped
          ? (empty ? "#000000" : (colorOwned ? color : "#FFFFFF"))
          : baselineStyle(baseline, "backgroundColor"),
        cache,
        "backgroundColor",
      );
      setStyle(
        staminaSurface.icons[index],
        "borderColor",
        shaped ? (colorOwned ? color : "#FFFFFF") : baselineStyle(baseline, "borderColor"),
        cache,
        "borderColor",
      );
      setStyle(staminaSurface.icons[index], "washColor",
        shaped ? "#FFFFFF" : colorOwned
          ? (empty ? "offBlack" : color)
          : baselineStyle(baseline, "washColor"), cache, "washColor");
    }
  }

  function reconcileStaminaSurface(bar) {
    var scope = bar && bar.parts ? bar.parts.windowRoot : null;
    if (!staminaCacheUsable(scope))
      rebuildStaminaCache(scope, findWithin(scope, "StaminaContainer"));
    staminaSurface.enemy = !!(
      bar &&
      bar.surface === "player" &&
      bar.kind === "player" &&
      bar.role === "enemy"
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
      "border",
      bar.applied,
      "levelBorder",
    );
  }

  function syncOwnedRootClasses(bar) {
    setOwnedClass(bar.parts && bar.parts.windowRoot, "HPColorsRewriteBarLines",
      !!(config.enabled && bar.surface), bar.applied, "barLinesClass");
    var enemyPlayer =
      config.enabled &&
      bar.surface === "player" &&
      bar.role === "enemy" &&
      bar.kind === "player";
    setOwnedClass(
      bar.parts && bar.parts.windowRoot,
      "HPColorsRewriteEnemyPlayer",
      enemyPlayer,
      bar.applied,
      "enemyPlayerClass",
    );
    var player = config.enabled && bar.surface === "player";
    setOwnedClass(
      bar.parts && bar.parts.windowRoot,
      "HPColorsRewriteHideCritical",
      player && !config.criticalIndicatorVisible,
      bar.applied,
      "hideCriticalClass",
    );
    setOwnedClass(
      bar.parts && bar.parts.windowRoot,
      "HPColorsRewriteHidePlayerName",
      player && !config.playerNamesVisible,
      bar.applied,
      "hidePlayerNameClass",
    );
  }

  function appearanceStyleDrift(bar) {
    var player = config.enabled && bar.surface === "player";
    var root = bar.parts.windowRoot;
    if (nativeReadoutEnabled(bar) && isValid(bar.parts.healthValue) &&
      isValid(bar.parts.counterRow) && panelParent(bar.parts.healthValue) !== bar.parts.counterRow)
      return true;
    if (!nativeReadoutEnabled(bar) && isValid(bar.healthValueOriginalParent) &&
      panelParent(bar.parts.healthValue) !== bar.healthValueOriginalParent)
      return true;
    if (
      hasClass(root, "HPColorsRewriteHideCritical") !==
        (player && !config.criticalIndicatorVisible) ||
      hasClass(root, "HPColorsRewriteHidePlayerName") !==
        (player && !config.playerNamesVisible)
    ) return true;
    return false;
  }

  function clearReadoutOwnership(bar, preservePipOpacity, preserveNative) {
    clearPipColorOwnership(bar);
    if (!preservePipOpacity) clearOwnedStyle(
      bar.parts && bar.parts.pipLines,
      "opacity",
      bar.applied,
      "pipOpacity",
    );
    clearOwnedStyle(
      bar.parts && bar.parts.pipLines,
      "visibility",
      bar.applied,
      "pipVisibility",
    );
    if (!preserveNative) applyReadout(bar, null);
    clearLevelOwnership(bar);
    setNativeHealthValueVisibility(bar, false);
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
    var innerWidth = bar.innerWidth;
    var innerLeft = bar.innerX;
    bar.markerGeometryChanged = false;
    if (!show || !isValid(marker) || innerWidth <= 0) {
      clearKillMarkerOwnership(bar);
      return;
    }
    var width = Math.min(
      innerWidth,
      Math.max(1, nativePx(config.enemyKillMarkerWidth)),
    );
    var x =
      innerLeft +
      (innerWidth * config.enemyKillMarkerThreshold) / 100 -
      width / 2;
    x = Math.max(innerLeft, Math.min(innerLeft + innerWidth - width, x));
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
      pixels(x),
      bar.applied,
      "killMarkerMarginLeft",
    );
    setStyle(marker, "width", pixels(width), bar.applied, "killMarkerWidth");
    setStyle(
      marker,
      "backgroundColor",
      config.enemyKillMarkerColor,
      bar.applied,
      "killMarkerBackgroundColor",
    );
  }


  function restorePipLine(entry) {
    setStyle(entry.panel, "washColor", baselineStyle(entry.baseline, "washColor"),
      entry.applied, "washColor");
  }

  function clearPipColorOwnership(bar) {
    var entries = bar.pipColorEntries;
    if (!entries.length) return;
    for (var index = 0; index < entries.length; index++)
      restorePipLine(entries[index]);
    bar.pipColorEntries = [];
  }

  function applyPipColors(bar) {
    var enemy = bar.role === "enemy";
    var eligible = config.enabled && !bar.spectating &&
      (bar.surface === "player" || bar.surface === "unit" || bar.surface === "fill") &&
      (!enemy || config.pipsVisible);
    var custom = eligible && (enemy ? config.enemyPipColorEnabled :
      bar.role === "ally" && config.allyPipColorEnabled);
    var opacityOwned = eligible && config.pipOpacity !== 100;
    var container = bar.parts && bar.parts.pipLines;
    setStyle(container, "opacity", opacityOwned ? String(config.pipOpacity / 100) : "",
      bar.applied, "pipOpacity");
    if (!custom || !isValid(container)) {
      clearPipColorOwnership(bar);
      return;
    }
    var previous = bar.pipColorEntries;
    var next = [];
    var color = enemy ? config.enemyPipColor : config.allyPipColor;
    var children = panelChildren(container);
    for (var index = 0; index < children.length; index++) {
      var panel = children[index];
      if (!isValid(panel) ||
          (!hasClass(panel, "line_large") && !hasClass(panel, "line_small"))) continue;
      var entry = null;
      for (var oldIndex = 0; oldIndex < previous.length; oldIndex++)
        if (previous[oldIndex].panel === panel) {
          entry = previous[oldIndex];
          break;
        }
      if (!entry) entry = {
        panel: panel,
        baseline: captureStyleBaseline(panel, ["washColor"]),
        applied: {},
      };
      setStyle(panel, "washColor", color, entry.applied, "washColor");
      next.push(entry);
    }
    for (var oldIndex = 0; oldIndex < previous.length; oldIndex++)
      if (next.indexOf(previous[oldIndex]) < 0) restorePipLine(previous[oldIndex]);
    bar.pipColorEntries = next;
  }

  function applyReadoutDecorations(bar) {
    applyPipColors(bar);
    var surface = bar.surface;
    var enemyBarSurface =
      (surface === "player" || surface === "unit") && bar.role === "enemy";
    setStyle(
      bar.parts.pipLines,
      "visibility",
      enemyBarSurface ? (config.pipsVisible ? "visible" : "collapse") : "",
      bar.applied,
      "pipVisibility",
    );

    var levelScope =
      surface === "player" &&
      bar.role === "enemy" &&
      bar.kind === "player" &&
      isValid(bar.parts.levelContainer) &&
      isValid(bar.parts.levelLabel);
    if (!levelScope) {
      clearLevelOwnership(bar);
      return;
    }

    var tier = bar.levelTier;
    var show = config.levelsVisible && bar.level > 0;
    setStyle(
      bar.parts.levelContainer,
      "visibility",
      show ? "visible" : "collapse",
      bar.applied,
      "levelVisibility",
    );
    // Reassert the complete rim when the level tier changes: the native color
    // alias must not leave border width/style to a previously expanded shorthand.
    setStyle(
      bar.parts.levelContainer,
      "border",
      show
        ? "2px solid " + (tier
          ? tier.color
          : teamHighColor(bar.team, DEFAULT_LEVEL_BORDER))
        : "",
      bar.applied,
      "levelBorder",
    );
  }



  function syncNativeReadoutPulse(bar, active, subtle, intense, duration) {
    if (!active && !bar.nativeReadoutPulseOwned) return;
    if (active) {
      setPulseClasses(
        bar.parts.healthValue, "HPColorsRewritePulse", true, subtle, intense,
        bar.applied, NATIVE_READOUT_PULSE_KEYS,
      );
    } else {
      var classes = (bar.panelBaseline || {}).healthValuePulseClasses || [];
      for (var index = 0; index < NATIVE_READOUT_CLASSES.length; index++)
        setOwnedClass(bar.parts.healthValue, NATIVE_READOUT_CLASSES[index], !!classes[index],
          bar.applied, NATIVE_READOUT_PULSE_KEYS[index]);
    }
    setStyle(
      bar.parts.healthValue, "animationDuration",
      active ? duration : baselineStyle((bar.panelBaseline || {}).healthValue, "animationDuration"),
      bar.applied, "nativeReadoutanimationDuration",
    );
    bar.nativeReadoutPulseOwned = active;
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
    syncNativeReadoutPulse(bar, false, false, false, "");
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
    var native = nativeReadoutEnabled(bar);
    syncNativeReadoutPulse(bar, !!readoutActive && native, subtle, intense, duration);

    bar.pulseActive = true;
    bar.colorPulseActive = useColorPulse;
    bar.pulseReadoutActive = !!readoutActive;
    bar.pulseDuration = duration;
    return true;
  }

  function pulseOverlayWidth(bar) {
    return Math.max(0, bar.pulseOverlayPercent) + "%";
  }

  function pulseDuration(bpm) {
    return (60 / bpm).toFixed(3) + "s";
  }


  function barTransformOrigin(bar) {
    if (bar.stackWidth <= 0 || bar.stackHeight <= 0) return "50% 50%";
    var x = ((bar.primaryX + bar.primaryWidth / 2) / bar.stackWidth) * 100;
    var y = ((bar.primaryY + bar.primaryHeight / 2) / bar.stackHeight) * 100;
    return (
      String(Math.round(x * 100) / 100) +
      "% " +
      String(Math.round(y * 100) / 100) +
      "%"
    );
  }

  function accessoryMargin(baseline, delta) {
    return pixels(baseline + delta);
  }

  function rememberAccessoryCenter(bar, panel, key) {
    if (!isValid(panel)) return false;
    var panelKey = key + "Panel";
    if (bar[panelKey] === panel) return true;
    var width = cssLayout(panel, "actuallayoutwidth", "x");
    var height = cssLayout(panel, "actuallayoutheight", "y");
    var x = bar[key + "BaseLeft"];
    var y = bar[key + "BaseTop"];
    if (!bar.geometryReady || !Number.isFinite(width) || width <= 0 ||
        !Number.isFinite(height) || height <= 0 ||
        !Number.isFinite(x) || !Number.isFinite(y)) return false;
    bar[panelKey] = panel;
    bar[key + "CenterX"] = x + width / 2;
    bar[key + "CenterY"] = y + height / 2;
    bar.dirty = true;
    return true;
  }

  function reconcileAccessoryCenters(bar) {
    if (bar.surface !== "player") return;
    rememberAccessoryCenter(bar, bar.parts.levelContainer, "levelAnchor");
    rememberAccessoryCenter(bar, bar.parts.unitInfo, "unitInfoAnchor");
  }

  function applyBarGeometry(bar, panelBaseline) {
    var scaleX = config.widthScale / 100;
    var scaleY = config.heightScale / 100;
    var scaleActive = scaleX !== 1 || scaleY !== 1;
    var scale = String(scaleX) + ", " + String(scaleY);
    var transform =
      "translateX(" +
      String(nativePx(config.positionX)) +
      "px) translateY(" +
      String(nativePx(config.positionY)) +
      "px)";
    setStyle(
      bar.parts.healthbars,
      "preTransformScale2d",
      scaleActive
        ? scale
        : baselineStyle(panelBaseline.healthbars, "preTransformScale2d"),
      bar.applied,
      "barPreTransformScale2d",
    );
    setStyle(
      bar.parts.healthbars,
      "transformOrigin",
      scaleActive
        ? barTransformOrigin(bar)
        : bar.stockTransformOrigin || "50% 40.48%",
      bar.applied,
      "barTransformOrigin",
    );
    setStyle(
      bar.parts.healthbars,
      "transform",
      transform,
      bar.applied,
      "barTransform",
    );

    if (bar.surface !== "player") {
      bar.geometryChanged = false;
      return;
    }

    var anchor = !!config.accessoryAnchorEnabled;
    var stockBarLeft = bar.stackX + bar.primaryX;
    var stockBarCenterX = stockBarLeft + bar.primaryWidth / 2;
    var stockBarCenterY =
      bar.stackY + bar.primaryY + bar.primaryHeight / 2;
    var scaledBarLeft =
      stockBarCenterX - (bar.primaryWidth * scaleX) / 2;
    var levelValid = rememberAccessoryCenter(
      bar,
      bar.parts.levelContainer,
      "levelAnchor",
    );
    var unitInfoValid = rememberAccessoryCenter(
      bar,
      bar.parts.unitInfo,
      "unitInfoAnchor",
    );
    if (levelValid) {
      var levelCenterX =
        scaledBarLeft -
        (stockBarLeft - bar.levelAnchorCenterX) +
        (anchor ? nativePx(config.positionX) : 0) +
        nativePx(config.levelOffsetX) * scaleX;
      var levelCenterY =
        stockBarCenterY -
        (stockBarCenterY - bar.levelAnchorCenterY) * scaleY +
        (anchor ? nativePx(config.positionY) : 0) +
        nativePx(config.levelOffsetY) * scaleY;
      setStyle(
        bar.parts.levelContainer,
        "marginLeft",
        accessoryMargin(
          bar.levelAnchorBaseLeft,
          levelCenterX - bar.levelAnchorCenterX,
        ),
        bar.applied,
        "levelAnchorMarginLeft",
      );
      setStyle(
        bar.parts.levelContainer,
        "marginTop",
        accessoryMargin(
          bar.levelAnchorBaseTop,
          levelCenterY - bar.levelAnchorCenterY,
        ),
        bar.applied,
        "levelAnchorMarginTop",
      );
    }
    if (unitInfoValid) {
      var unitInfoCenterX =
        scaledBarLeft -
        (stockBarLeft - bar.unitInfoAnchorCenterX) +
        (anchor ? nativePx(config.positionX) : 0) +
        nativePx(config.ultOffsetX) * scaleX;
      var unitInfoCenterY =
        stockBarCenterY -
        (stockBarCenterY - bar.unitInfoAnchorCenterY) * scaleY +
        (anchor ? nativePx(config.positionY) : 0) +
        nativePx(config.ultOffsetY) * scaleY;
      setStyle(
        bar.parts.unitInfo,
        "marginLeft",
        accessoryMargin(
          bar.unitInfoAnchorBaseLeft,
          unitInfoCenterX - bar.unitInfoAnchorCenterX,
        ),
        bar.applied,
        "unitInfoAnchorMarginLeft",
      );
      setStyle(
        bar.parts.unitInfo,
        "marginTop",
        accessoryMargin(
          bar.unitInfoAnchorBaseTop,
          unitInfoCenterY - bar.unitInfoAnchorCenterY,
        ),
        bar.applied,
        "unitInfoAnchorMarginTop",
      );
    }
    bar.geometryChanged = false;
  }


  // [part, property, cache key] for every geometry style the bar owns; the
  // first four are shared by every surface, the accessory entries add the
  // bar field holding their rebased margin and its stock fallback.
  var GEOMETRY_STYLES = [
    ["healthbars", "preTransformScale2d", "barPreTransformScale2d"],
    ["healthbars", "transformOrigin", "barTransformOrigin"],
    ["healthbars", "transform", "barTransform"],
    ["infoHealth", "transformOrigin", "infoStockOrigin"],
    ["levelContainer", "marginLeft", "levelAnchorMarginLeft", "levelAnchorBaseLeft", LEVEL_BASE_MARGIN_LEFT],
    ["levelContainer", "marginTop", "levelAnchorMarginTop", "levelAnchorBaseTop", LEVEL_BASE_MARGIN_TOP],
    ["unitInfo", "marginLeft", "unitInfoAnchorMarginLeft", "unitInfoAnchorBaseLeft", UNIT_INFO_BASE_MARGIN_LEFT],
    ["unitInfo", "marginTop", "unitInfoAnchorMarginTop", "unitInfoAnchorBaseTop", UNIT_INFO_BASE_MARGIN_TOP],
  ];

  function restoreBarGeometry(bar, parts, panelBaseline, onlyPart) {
    for (var index = 0; index < GEOMETRY_STYLES.length; index++) {
      var entry = GEOMETRY_STYLES[index];
      if (onlyPart && entry[0] !== onlyPart) continue;
      var value;
      if (entry.length > 3) {
        var base = bar[entry[3]];
        value = pixels(base === undefined ? entry[4] : base);
      } else if (entry[1] === "transformOrigin") {
        value = bar.stockTransformOrigin || "50% 40.48%";
      } else {
        value = baselineStyle(panelBaseline[entry[0]], entry[1]);
      }
      setStyle(
        parts[entry[0]],
        entry[1],
        value,
        bar.applied,
        entry[2],
      );
    }
    rebaseStockGeometry(bar);
  }

  function restoreInactiveCustomization(bar, panelBaseline, preserveUnitPresentation) {
    clearPulse(bar);
    clearKillMarkerOwnership(bar);
    // Decorations reconcile pip opacity below; avoid clearing it between identical paints.
    clearReadoutOwnership(bar, true, preserveUnitPresentation);
    clearPlayerNameOwnership(bar);
    applyReadoutDecorations(bar);
    applyUltimateWash(bar, "");
    var stockColor = stockUnitColor(bar);
    setStyle(bar.parts.fill, "washColor", stockColor, bar.applied, "washColor");
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
      bar.parts.primary,
      "opacity",
      baselineStyle(panelBaseline.primary, "opacity"),
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
    if (!preserveUnitPresentation) restoreBarGeometry(bar, bar.parts, panelBaseline);
    bar.geometryChanged = false;
    bar.markerGeometryChanged = false;
  }

  function applyActiveCustomization(bar, panelBaseline) {
    var role = bar.role;
    var surface = bar.surface;
    if (surface === "fill") {
      restoreInactiveCustomization(bar, panelBaseline, true);
      setStyle(
        bar.parts.fill,
        "washColor",
        config.neutralColor,
        bar.applied,
        "washColor",
      );
      applyBarGeometry(bar, panelBaseline);
      applyReadout(bar, config.readoutVisible ? READOUT_KEYS.enemy : null,
        config.enemyLow, config.enemyMid, config.enemyHigh, config.enemyMode, false);
      setNativeHealthValueVisibility(bar, false);
      bar.dirty = false;
      return;
    }

    var playerSurface = surface === "player";
    var colorsEnabled =
      surface === "unit" ||
      (role === "enemy" ? config.enemyEnabled : config.allyEnabled);
    var visible = role === "enemy" ? config.enemyVisible : config.allyVisible;
    var mode = role === "enemy" ? config.enemyMode : config.allyMode;
    var low = role === "enemy" ? config.enemyLow : config.allyLow;
    var mid = role === "enemy" ? config.enemyMid : config.allyMid;
    var high = role === "enemy" ? config.enemyHigh : config.allyHigh;
    var teamHighEnabled =
      role === "enemy" ? config.enemyTeamHigh : config.allyTeamHigh;
    if (teamHighEnabled) high = teamHighColor(bar.team, high);
    var healing = colorsEnabled
      ? role === "enemy"
        ? config.enemyHealing
        : config.allyHealing
      : STOCK_HEALING_COLOR;
    var delta = colorsEnabled
      ? role === "enemy"
        ? config.enemyDelta
        : config.allyDelta
      : stockDeltaColor(bar);
    var bulletShield = colorsEnabled
      ? role === "enemy"
        ? config.enemyBulletShield
        : config.allyBulletShield
      : stockBulletShieldColor(bar);
    var stockColor = stockUnitColor(bar);
    var color = colorsEnabled
      ? (mode === "gradient" ? gradientColor : fixedColor)(
          bar.lastWidthPercent,
          low,
          mid,
          high,
        )
      : stockColor;
    var ultColor = stockColor;
    if (playerSurface && config.ultMode === "custom")
      ultColor = config.ultCustom;
    else if (playerSurface && colorsEnabled)
      ultColor = color;
    var readoutKeys =
      config[READOUT_KEYS[role].Visible]
        ? READOUT_KEYS[role]
        : null;

    var pulseEnabled =
      colorsEnabled &&
      (role === "enemy" ? config.enemyPulseEnabled : config.allyPulseEnabled);
    var pulseThreshold =
      role === "enemy"
        ? config.enemyPulseThreshold
        : config.allyPulseThreshold;
    var shouldPulse =
      pulseEnabled &&
      bar.lastWidthPercent >= 0 &&
      bar.lastWidthPercent <= pulseThreshold;
    var enemyReadoutPulse =
      playerSurface && role === "enemy" && shouldPulse && !!readoutKeys;
    var pulseReadoutAnimationActive =
      enemyReadoutPulse && config.enemyPulseReadout;
    var pulseReadoutModifiersActive =
      enemyReadoutPulse && config.enemyPulseReadoutModifiers;
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
    if (pulseActive && pulseColorEnabled && pulseColorMode === "fixed")
      color = pulseColor;
    if (pulseActive && playerSurface && config.ultMode !== "custom")
      ultColor = color;
    applyUltimateWash(bar, playerSurface ? ultColor : "");
    applyKillMarker(
      bar,
      playerSurface &&
        role === "enemy" &&
        config.enemyEnabled &&
        config.enemyKillMarkerEnabled &&
        config.enemyVisible &&
        !(pulseActive && config.enemyPulseHideBar),
    );

    var opacity = baselineStyle(panelBaseline.primary, "opacity");
    if (colorsEnabled) {
      opacity =
        visible &&
        !(pulseActive && role === "enemy" && config.enemyPulseHideBar)
          ? "1"
          : "0.01";
    }
    var ultBackgroundOpacity = baselineStyle(
      panelBaseline.ultBackground,
      "opacity",
    );
    if (playerSurface && colorsEnabled)
      ultBackgroundOpacity = opacity;
    applyReadoutDecorations(bar);
    setStyle(bar.parts.primary, "opacity", opacity, bar.applied, "opacity");
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
      playerSurface ? ultColor : "",
      bar.applied,
      "ultWashColor",
    );
    applyBarGeometry(bar, panelBaseline);
    applyReadout(
      bar,
      readoutKeys,
      low,
      mid,
      high,
      mode,
      pulseReadoutModifiersActive,
    );
    setNativeHealthValueVisibility(
      bar,
      playerSurface &&
        (role === "enemy" || (role === "ally" && config.allyReadoutVisible)),
    );
    syncOwnedRootClasses(bar);
    applyPlayerName(bar);
    bar.dirty = false;
  }

  function applyCustomization(bar, restoring) {
    if (!bar.dirty) return;
    var panelBaseline = bar.panelBaseline || {};
    bar.surface = resolveSurface(bar, config);
    if (restoring || !isComplete(bar.parts)) bar.surface = "";
    syncOwnedRootClasses(bar);
    if (!bar.surface) {
      restoreInactiveCustomization(bar, panelBaseline);
      bar.dirty = false;
      return;
    }
    if (bar.pulseRole && bar.pulseRole !== bar.role) clearPulse(bar);
    bar.pulseRole = bar.role;
    applyActiveCustomization(bar, panelBaseline);
  }

  function restoreBarOwnership(bar, fallbackParent) {
    if (!bar) return;
    if (bar.healthValueOriginalParent && !isValid(bar.healthValueOriginalParent) &&
      isValid(fallbackParent)) bar.healthValueOriginalParent = fallbackParent;
    bar.surface = "";
    bar.dirty = true;
    applyCustomization(bar, true);
    rebaseNativeLabel(bar, null, "stockHealthRebase", "");
    rebaseNativeLabel(bar, null, "stockShieldRebase", "");
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
      config = normalizeConfig(data.values);
      configRaw = raw;
      configRevision = revision;
      awaitingConfig = false;
      repaintAll();
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
      config = normalizeConfig({ enabled: false });
      awaitingConfig = true;
      awaitingSince = nowMs();
      notifyConfigListeners();
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
    if (awaitingConfig) resolveAwaitedConfig();
  }

  function nowMs() {
    return Date.now ? Date.now() : +new Date();
  }

  function restoringSavedSettings() {
    if (!isValid(configRoot) || !configRoot.GetAttributeString) return false;
    try {
      return configRoot.GetAttributeString(HYDRATION_ATTR, "") === "pending";
    } catch {
      return false;
    }
  }

  function resolveAwaitedConfig() {
    var waited = nowMs() - awaitingSince;
    if (waited < (restoringSavedSettings() ? HYDRATION_WAIT_MAX_MS : CONFIG_GRACE_MS))
      return;
    awaitingConfig = false;
    config = normalizeConfig(null);
    repaintAll();
  }

  // Every bar and the stamina surface re-derive from the current config.
  function repaintAll() {
    for (var index = 0; index < bars.length; index++) {
      bars[index].dirty = true;
      applyCustomization(bars[index]);
    }
    applyStaminaSurface();
    notifyConfigListeners();
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
    var refreshHealth = healthRefreshEnabled(bar);
    if (!bar.healthSampled || refreshHealth) sampleHealthPercent(bar);
    else if (bar.surface === "player" && sampleBarGeometry(bar))
      bar.dirty = true;
    updateLevel(bar, readLabelText(bar.parts.levelLabel));
    reconcileAccessoryCenters(bar);
    applyPlayerName(bar);
    if (!bar.dirty && layoutStyleDrift(bar)) bar.dirty = true;
    if (bar.dirty) applyCustomization(bar);
  }
  // Per-panel samples; cleared on creation and whenever the part set changes.
  function resetBarSamples(bar) {
    bar.readoutPosition = null;
    bar.readoutSample = null;
    bar.kind = "unknown";
    bar.role = "other";
    bar.ambiguousRelation = false;
    bar.spectating = false;
    bar.team = "";
    bar.surface = "";
    bar.levelText = "";
    bar.level = 0;
    bar.levelTier = null;
    bar.lastWidthPercent = -1;
    bar.healthSampled = false;
    bar.healthPresentationChanged = false;
    bar.pulseOverlayPercent = -1;
    bar.sampleFillWidth = 0;
    bar.sampleHealthParentWidth = 0;
    bar.sampleBarWidth = 0;
    bar.geometrySampled = false;
    bar.geometryReady = false;
    bar.geometryChanged = true;
    bar.markerGeometryChanged = true;
    bar.stackX = 0;
    bar.stackY = 0;
    bar.stackWidth = 0;
    bar.stackHeight = 0;
    bar.primaryX = 0;
    bar.primaryY = 0;
    bar.primaryWidth = 0;
    bar.primaryHeight = 0;
    bar.innerX = 0;
    bar.innerY = 0;
    bar.innerWidth = 0;
    bar.innerHeight = 0;
    bar.levelAnchorPanel = null;
    bar.levelAnchorCenterX = 0;
    bar.levelAnchorCenterY = 0;
    bar.unitInfoAnchorPanel = null;
    bar.unitInfoAnchorCenterX = 0;
    bar.unitInfoAnchorCenterY = 0;
  }

  function addBar(parts) {
    var bar = {
      generation: 1,
      dirty: true,
      partsRetryJob: null,
      applied: {},
      pipColorEntries: [],
      shieldValue: null,
      pulseActive: false,
      colorPulseActive: false,
      pulseReadoutActive: false,
      pulseDuration: "",
      pulseRole: "",
      seen: true,
      parts: parts,
    };
    resetBarSamples(bar);
    bar.panelBaseline = capturePanelBaseline(bar);
    bars.push(bar);
    reportData(bar);
    schedulePartsRetry(bar);
    return bar;
  }

  function refreshBarParts(bar, lineage) {
    var nextParts = resolveParts(lineage);
    if (sameParts(bar.parts, nextParts)) return false;
    var previousParts = bar.parts;
    var previousBaseline = bar.panelBaseline;
    cancelPartsRetry(bar);
    restoreBarOwnership(bar, nextParts.infoHealth);
    // Restoration can move the adopted label back into the newly resolved tree.
    bar.parts = resolveParts(lineage);
    bar.generation += 1;
    bar.dirty = true;
    bar.applied = {};
    bar.panelBaseline = capturePanelBaseline(
      bar,
      previousParts,
      previousBaseline,
    );
    resetBarSamples(bar);
    return true;
  }

  function reconcileBars() {
    var lineage = primaryLineage();
    var bar = lineage ? findBarByInner(lineage.inner) : null;
    // Release retired owners before a new owner captures shared label baselines.
    for (var removeIndex = bars.length - 1; removeIndex >= 0; removeIndex--) {
      var removedBar = bars[removeIndex];
      if (removedBar === bar) continue;
      cancelPartsRetry(removedBar);
      removedBar.generation += 1;
      restoreBarOwnership(removedBar, lineage ? resolveParts(lineage).infoHealth : null);
      bars.splice(removeIndex, 1);
    }
    var staminaBar = null;
    if (lineage) {
      if (!bar) {
        bar = addBar(resolveParts(lineage));
      } else {
        bar.seen = true;
        refreshBarParts(bar, lineage);
        schedulePartsRetry(bar);
        reportData(bar);
      }
      staminaBar = bar;
    }

    reconcileStaminaSurface(staminaBar);
  }

  function healthRefreshEnabled(bar) {
    if (!config.enabled) return false;
    if (bar.surface === "fill") return config.readoutVisible;
    if (bar.surface === "unit") return true;
    if (bar.surface !== "player") return false;
    if (bar.role === "enemy") return config.enemyEnabled || config.readoutVisible;
    if (bar.role === "ally")
      return config.allyEnabled || config.allyReadoutVisible;
    return false;
  }

  function refreshColor(bar) {
    if (!isComplete(bar.parts)) {
      if (!bar.dirty) return false;
      applyCustomization(bar);
      return true;
    }
    rebaseStockGeometry(bar);
    applyPipColors(bar);
    var changed = positionReadout(bar);
    applyPlayerName(bar);
    if (healthRefreshEnabled(bar)) {
      sampleHealthPercent(bar, true);
      changed = bar.healthPresentationChanged || changed;
    }
    reconcileAccessoryCenters(bar);
    if (!bar.dirty && (layoutStyleDrift(bar) || appearanceStyleDrift(bar)))
      bar.dirty = true;
    if (bar.dirty) {
      applyCustomization(bar);
      return true;
    }
    if (
      bar.markerGeometryChanged &&
      bar.applied.killMarkerVisibility === "visible"
    ) {
      applyKillMarker(bar, true);
      return true;
    }
    return changed;
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
    configListeners.length = 0;
    if (context.HPV2GetNormalizedConfig === exportedGetConfig)
      context.HPV2GetNormalizedConfig = null;
    if (context.HPV2OnConfigChanged === exportedOnConfigChanged)
      context.HPV2OnConfigChanged = null;
    if (context.HPV2GetUltimateProgressColor === exportedGetUltimateProgressColor)
      context.HPV2GetUltimateProgressColor = null;
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
    var now = nowMs();
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
  } catch {}
  scan();
  paintColors();
})();
