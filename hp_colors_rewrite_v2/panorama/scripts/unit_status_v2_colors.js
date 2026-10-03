(function () {
  "use strict";

  var SCAN_INTERVAL_SEC = 1;
  var scanDelay = (1 - Math.random()) * SCAN_INTERVAL_SEC;
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
  // World contexts cannot read the HUD root attribute in game, so they ask the
  // Escape menu through the sibling relay until a config arrives.
  var CONFIG_REQUEST_DELAYS_SEC = [0.5, 1, 2, 4, 8];
  var CONFIG_REQUEST_FAILURE_LIMIT = 3;
  // Full parts/fact re-resolution cadence, in scans.
  var FULL_RESOLVE_SCANS = 5;
  var PICKUP_HOOK = "HPV2OnPickupMessage";
  var LEGACY_TO_NATIVE = 0.1;
  // Full-canvas CSS fallbacks at the stock 200 x 210 world window.
  var LEVEL_BASE_MARGIN_LEFT = 27;
  var LEVEL_BASE_MARGIN_TOP = 67.5;
  var UNIT_INFO_BASE_MARGIN_LEFT = 50;
  var UNIT_INFO_BASE_MARGIN_TOP = 67;
  // Stock #CriticalIndicator and #AssassinateIndicator: center-aligned with
  // margin-right 30 / margin-top 86, so their centers sit at canvas center
  // -15px, 21.5px left of the 79x18 player bar center. CRITICAL is 50x~16
  // (center 11px below the bar's bottom edge); ASSASSINATE's 8px label about
  // 40x10 (8px below). The renderer translates their owned full-canvas
  // anchors (never their margins, which relayout the world panel) and adds
  // the user's unscaled X/Y offsets, keeping the label inside the canvas.
  var STATUS_TAG_BAR_DX = -21.5;
  var STATUS_TAG_BAR_HALF_HEIGHT = 9;
  var STATUS_TAGS = [
    { part: "critical", anchor: "criticalAnchor", gap: 11, halfWidth: 25, halfHeight: 8,
      offsetX: "criticalOffsetX", offsetY: "criticalOffsetY" },
    { part: "assassinate", anchor: "assassinateAnchor", gap: 8, halfWidth: 20, halfHeight: 5,
      offsetX: "assassinateOffsetX", offsetY: "assassinateOffsetY" },
  ];
  // Written explicitly on release: a null inline write may not clear in game.
  var STATUS_TAG_STOCK_TRANSFORM = "translate3d(0px, 0px, 0px)";
  var STATUS_TAG_STOCK_SCALE = "1";
  var STATUS_TAG_TOP = 86;
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
    // The Sinner's Sacrifice vault is an objective; building wins, so neutral facts keep it stock.
    building: ["building", "CLASS_DESTROYABLE_BUILDING", "boss_tier1",
      "boss_tier2", "boss_tier3", "boss_barracks", "barracks", "neutral_vault"],
    player: ["player", "CLASS_PLAYER"],
    npc: [
      "creature",
      "minion",
      "CLASS_TROOPER",
      "CLASS_TROOPER_BOSS",
      "neutral_weak",
      "neutral_normal",
      "neutral_strong",
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
    "padding", "marginLeft", "marginRight", "overflow", "transform",
  ];
  var NATIVE_READOUT_CLASSES = [
    "HPColorsRewritePulse", "HPColorsRewritePulseSubtle", "HPColorsRewritePulseIntense",
  ];
  var NAME_STYLES = ["color", "fontSize", "maxHeight", "height", "transform", "textShadow", "padding", "maxWidth", "overflow", "horizontalAlign", "textAlign"];
  // Each option names the direction text extends from its anchor: LEFT keeps
  // the right edge fixed (q = 1, panel right-aligned) so longer text grows
  // left; RIGHT keeps the left edge fixed. q is the edge fraction at anchor.
  var ALIGN_FRACTION = { left: 1, center: 0.5, right: 0 };
  var PANEL_ALIGN = { left: "right", center: "center", right: "left" };
  // HP-text point relative to the visual bar center, in UnitStatus CSS px:
  // the earlier right-anchored enemy row edge (canvas center +40, top 66) minus
  // the 6.5px player bar inset and the 74px bar center. Allies share it (2.2.0;
  // they were 10px further left) so equal offsets mean the same spot.
  var READOUT_GAP = 33.5;
  var READOUT_RISE = 8;
  var READOUT_ROW_PADDING = 4;
  var READOUT_FIELDS = ["Visible", "Size", "Font", "OffsetX", "OffsetY",
    "ColorMode", "Mode", "Low", "Mid", "High", "OutlineWidth", "Tilt"];
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
  var requestJob = null;
  var requestGeneration = 0;
  var requestAttempt = 0;
  var requestFailures = 0;
  var stopped = false;
  var configListeners = [];
  var wakeListeners = [];
  var paintGeneration = 0;
  var lastWakeState = null;
  var exportedOnWake = function (callback) {
    if (typeof callback !== "function" || stopped) return function () {};
    var slot = wakeListeners.length;
    wakeListeners.push(callback);
    try { callback(heroAwake()); } catch {}
    return function () {
      if (wakeListeners[slot] === callback) wakeListeners[slot] = null;
    };
  };
  context.HPV2OnWake = exportedOnWake;
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

  function heroAwake() {
    if (!config.enabled || (!config.pickupTimersEnabled && !config.ultimateTimerEnabled))
      return false;
    for (var index = 0; index < bars.length; index++)
      if (bars[index].kind === "player" && !bars[index].hidden) return true;
    return false;
  }

  function notifyWakeListeners() {
    var awake = heroAwake();
    if (awake === lastWakeState) return;
    lastWakeState = awake;
    for (var index = 0; index < wakeListeners.length; index++) {
      if (typeof wakeListeners[index] !== "function") continue;
      try { wakeListeners[index](awake); } catch {}
    }
  }
  var liveLineage = {
    healthbars: null,
    primary: null,
    inner: null,
    healthbarsChildCount: -1,
    primaryChildCount: -1,
    // Bumps whenever the lineage is re-resolved; cached parts follow it.
    revision: 0,
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
    liveLineage.revision += 1;
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

  // carriers (optional) collects the ancestors that contributed a fact, plus
  // the window root and context (where stock unit classes live), so later
  // scans can re-read just those panels between full walks.
  function collectUnitFacts(startPanel, carriers) {
    var facts = Object.create(null);
    var current = startPanel;
    for (var depth = 0; current && depth < 12; depth++) {
      var carried = false;
      for (var index = 0; index < UNIT_FACT_CLASSES.length; index++) {
        var name = UNIT_FACT_CLASSES[index];
        if (!facts[name] && hasClass(current, name)) {
          facts[name] = true;
          carried = true;
        }
      }
      if (carriers && (carried || current === context || hasClass(current, "WindowRoot")))
        carriers.push(current);
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch {
        break;
      }
    }
    return facts;
  }

  // Null when a carrier is gone; the caller then repeats the full walk.
  function collectCarrierFacts(carriers) {
    var facts = Object.create(null);
    for (var panelIndex = 0; panelIndex < carriers.length; panelIndex++) {
      var panel = carriers[panelIndex];
      if (!isValid(panel)) return null;
      for (var index = 0; index < UNIT_FACT_CLASSES.length; index++) {
        var name = UNIT_FACT_CLASSES[index];
        if (!facts[name] && hasClass(panel, name)) facts[name] = true;
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
    var facts = null;
    var scanIndex = bar.factScans++;
    // Unknown units and unseen lineages always walk, so late classes classify promptly.
    if (bar.factCarriers && bar.factCarriers.length && bar.kind !== "unknown" &&
        bar.factLineage === liveLineage.revision && scanIndex % FULL_RESOLVE_SCANS !== 0)
      facts = collectCarrierFacts(bar.factCarriers);
    if (!facts) {
      var carriers = [];
      facts = collectUnitFacts(bar.parts.inner, carriers);
      bar.factCarriers = carriers;
      bar.factLineage = liveLineage.revision;
    }
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
      restoreBarGeometry(bar, bar.panelBaseline || {}, true);
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
    var motion = directChild(windowRoot, "HPV2MotionFrame");
    var counterContainer = directChild(motion || windowRoot, "hp_counter_container");
    var counterRow = findWithin(counterContainer, "hp_counter_row");
    var criticalAnchor = directChild(windowRoot, "HPV2CriticalAnchor");
    var assassinateAnchor = directChild(windowRoot, "HPV2AssassinateAnchor");
    return {
      windowRoot: windowRoot,
      motion: motion,
      healthbars: healthbars,
      primary: primary,
      inner: inner,
      infoHealth: infoHealth,
      unitStatus: unitStatus,
      // The name rides the full-canvas motion frame, so it shakes with the bar.
      name: directChild(directChild(motion || windowRoot, "HPV2NameAnchor"), "name"),
      criticalAnchor: criticalAnchor,
      critical: directChild(criticalAnchor, "CriticalIndicator"),
      assassinateAnchor: assassinateAnchor,
      assassinate: directChild(assassinateAnchor, "AssassinateIndicator"),
      fill: directChild(inner, "unit_healthbar_lagging"),
      healing: directChild(inner, "unit_healthbar_healing"),
      delta: directChild(inner, "unit_healthbar_delta"),
      bulletShield: directChild(inner, "unit_healthbar_bullet_shield"),
      armor: directChild(inner, "unit_healthbar_ratking_armor"),
      pulseOverlay: directChild(inner, "hp_colors_pulse_overlay"),
      pipLines: directChild(primary, "UnitHealthbarLines"),
      pipGrid: directChild(primary, "HPV2PipGrid"),
      pipEmpty: directChild(directChild(primary, "HPV2PipGrid"), "HPV2PipEmpty"),
      pipFill: directChild(directChild(primary, "HPV2PipGrid"), "HPV2PipFill"),
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
        if (stopped || generation !== bar.generation) return;
        bar.partsRetryJob = null;
        if (!isValid(bar.parts.inner)) return;
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
    setStyle(bar.parts.motion, "transformOrigin", origin, bar.applied, "motionStockOrigin");
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

  // width: the panel's normalized actuallayoutwidth, read once by the caller.
  function visibleHealthFraction(fill, innerWidth, width) {
    if (!isValid(fill)) return 0;
    if (innerWidth <= 0) return 0;
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
  // Right edge of a visible shield/armor layer as a fraction of the inner bar,
  // or -1 when absent. The fill (z-index 3) covers anything left of its edge.
  function healthLayerRight(panel, innerWidth) {
    if (!hasClass(panel, "HasHealth") ||
        readHealthSignal(panel, "visibility", true) === "collapse" ||
        readHealthSignal(panel, "visible", false) === "false") return -1;
    var width = cssLayout(panel, "actuallayoutwidth", "x");
    var length = visibleHealthFraction(panel, innerWidth, width);
    if (!(length > 0)) return -1;
    var x = cssLayout(panel, "actualxoffset", "x");
    var left = Number.isFinite(x) && x > 0 ? x / innerWidth : 0;
    var clip = /^rect\s*\(\s*([^)]*)\)$/i.exec(readHealthSignal(panel, "clip", true));
    if (clip) {
      var edges = clip[1].trim().split(clip[1].indexOf(",") >= 0 ? /\s*,\s*/ : /\s+/);
      var clipLeft = edges.length === 4
        ? healthLengthFraction(edges[3], width) : null;
      if (clipLeft !== null) left += clipLeft;
    }
    return left + length;
  }

  // Shield and armor shrink the HP share of the bar only beyond the fill edge,
  // whether drawn after the fill or behind it from x=0.
  function correctedHealthFraction(fill, shieldRight, armorRight) {
    var excluded = Math.max(0, Math.min(1, Math.max(shieldRight, armorRight)) - fill);
    var fraction = fill / Math.max(fill, 1 - excluded);
    return Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  }


  function sampleHealthPercent(bar, rebased) {
    sampleBarGeometry(bar, rebased);
    var rawFillWidth = cssLayout(bar.parts.fill, "actuallayoutwidth", "x");
    var fillWidth = Number.isFinite(rawFillWidth) ? Math.max(0, rawFillWidth) : 0;
    var innerWidth = bar.innerWidth;
    var primaryWidth = bar.primaryWidth;
    var fraction = visibleHealthFraction(bar.parts.fill, innerWidth, rawFillWidth);
    var sampled = bar.healthSampled;
    var healthWidthChanged =
      !sampled || innerWidth !== bar.sampleHealthParentWidth;
    var barWidthChanged = !sampled || primaryWidth !== bar.sampleBarWidth;
    var previousPercent = bar.lastWidthPercent;
    var previousFraction = bar.healthFraction;
    var previousFillWidth = bar.sampleFillWidth;
    var fillChanged = !sampled || fillWidth !== previousFillWidth;
    var overlayPercent = Math.round(fraction * 10000) / 100;
    fraction = correctedHealthFraction(fraction,
      healthLayerRight(bar.parts.bulletShield, innerWidth),
      healthLayerRight(bar.parts.armor, innerWidth));
    bar.healthFraction = innerWidth > 0 ? fraction : -1;
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
      if (bar.healthPresentationChanged) bar.healthDirty = true;
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
    bar.colorDirty = !sampled || widthPercent !== previousPercent;
    bar.coverageDirty = !sampled || overlayChanged || fraction !== previousFraction;
    if (bar.colorDirty || bar.coverageDirty &&
        (bar.colorPulseActive || config.barMask === "old")) bar.healthDirty = true;
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

  function setStyle(panel, property, value, cache, cacheKey, restoring) {
    if (!isValid(panel) || !panel.style) {
      if (cache) cache[cacheKey] = null;
      return;
    }
    if (
      cache &&
      cache[cacheKey] === value &&
      cache.nativeStyles && cache.nativeStyles[cacheKey] &&
      cache.nativeStyles[cacheKey].panel === panel &&
      (!restoring || styleMatches(panel, property, cache, cacheKey))
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
        native.property = property;
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
    var drift = !!(cache &&
      Object.prototype.hasOwnProperty.call(cache, cacheKey) &&
      !styleMatches(panel, property, cache, cacheKey));
    if (drift) cache[cacheKey] = null;
    return drift;
  }

  function repairStyleCache(cache, readoutOnly) {
    var drift = false;
    var entries = cache && cache.nativeStyles;
    if (!entries) return false;
    for (var key in entries) {
      if (readoutOnly && key.indexOf("readout") !== 0) continue;
      var entry = entries[key];
      if (cachedStyleDrift(entry.panel, entry.property, cache, key)) drift = true;
    }
    return drift;
  }

  function ensureOwnedPanel(parent, id) {
    if (!isValid(parent)) return null;
    var panel = directChild(parent, id);
    if (isValid(panel)) return panel;
    try {
      panel = $.CreatePanel("Panel", parent, id);
      panel.hittest = false;
      panel.hittestchildren = false;
      return isValid(panel) ? panel : null;
    } catch { return null; }
  }

  function scanPipChildren(bar) {
    var previous = bar.colorPipChildren || [];
    bar.pipChildren = panelChildren(bar.parts.pipLines);
    bar.colorPipChildren = [];
    for (var index = 0; index < bar.pipChildren.length; index++) {
      var panel = bar.pipChildren[index];
      if (isValid(panel) && (hasClass(panel, "line_large") || hasClass(panel, "line_small")))
        bar.colorPipChildren.push(panel);
    }
    if (previous.length !== bar.colorPipChildren.length) bar.dirty = true;
    else for (var index = 0; index < previous.length; index++)
      if (previous[index] !== bar.colorPipChildren[index]) {
        bar.dirty = true;
        break;
      }
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
    return !!(config.enabled && bar.surface &&
      config[READOUT_KEYS[bar.role === "ally" ? "ally" : "enemy"].Visible]);
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
          ? "nativeHealthValueVisibility" : "nativeReadout" + property, true);
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
        x: offsetX * config.widthScale / 100,
        y: offsetY * config.heightScale / 100,
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
      // Rotate the label only: the row transform is the cached geometry translate.
      var tilt = Math.round(Number(config[keys.Tilt])) || 0;
      setStyle(bar.parts.healthValue, "transform", tilt ? "rotateZ(" + tilt + "deg)" :
        baselineStyle((bar.panelBaseline || {}).healthValue, "transform"),
        bar.applied, "nativeReadouttransform");
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
    setStyle(parts.counterAnchor, "width", "", bar.applied, "readoutAnchorWidth", true);
    setStyle(parts.counterAnchor, "height", "", bar.applied, "readoutAnchorHeight", true);
    setStyle(parts.counterAnchor, "transform", "", bar.applied, "readoutTransform", true);
    setStyle(parts.counterRow, "transform", "", bar.applied, "readoutRowTransform", true);
    // Explicit stylesheet value: a null alignment write may not clear in game.
    setStyle(parts.counterRow, "horizontalAlign", "right", bar.applied, "readoutAlign", true);
  }

  function positionReadout(bar) {
    var position = bar.readoutPosition;
    var parts = bar.parts || {};
    if (!position || !isValid(parts.counterContainer) ||
        !isValid(parts.counterAnchor) || !isValid(parts.counterRow)) return false;
    // actuallayout* are window pixels; transforms and sizes are CSS pixels.
    // The world panel renders at window scale 2 (400x420 for 200x210).
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
    var align = config.hpTextAlign === "right" || config.hpTextAlign === "center"
      ? config.hpTextAlign : "left";
    var q = ALIGN_FRACTION[align];
    visualBarRect(bar, width);
    var visual = bar.visualRect;
    // The row edge sits right of the bar center by the earlier right-anchored
    // enemy gap (40px canvas edge minus the 6.5px player inset), 8px above it.
    var pointX = visual.centerX + READOUT_GAP;
    var pointY = visual.centerY - READOUT_RISE;
    // The unmeasured fallback is already canvas-relative.
    if (bar.geometryReady) {
      pointX = windowCss(parts, pointX, "x");
      pointY = windowCss(parts, pointY, "y");
    }
    // Every mode keeps the text (inside the row padding) at the same point;
    // LEFT (the default) reproduces the earlier right-anchored row edge exactly.
    var anchor = pointX + position.x + 2 * (q - 1) * READOUT_ROW_PADDING;
    // Native alignment grows the row from the anchor, so text width matters
    // only once the row would cross a canvas edge.
    var low = q * rowWidth;
    var high = width - (1 - q) * rowWidth;
    if (high < low) anchor = low;
    else if (anchor < low) anchor = low;
    else if (anchor > high) anchor = high;
    var shift = anchor - q * width;
    var top = Math.max(0, Math.min(Math.max(0, height - rowHeight), pointY + position.y));
    var sample = bar.readoutSample;
    var changed = !sample || sample.width !== width || sample.height !== height ||
      sample.rowWidth !== rowWidth || sample.rowHeight !== rowHeight ||
      sample.shift !== shift || sample.top !== top || sample.align !== align;
    if (changed) {
      sample = bar.readoutSample = {
        width: width, height: height, rowWidth: rowWidth, rowHeight: rowHeight,
        shift: shift, top: top, align: align,
        widthPx: pixels(width), heightPx: pixels(height),
        transform: "translate3d(" + pixels(shift) + ", " + pixels(top) + ", 0px)",
      };
    }
    // Cached native readback also retries rejected writes and repairs drift.
    setStyle(parts.counterAnchor, "width", sample.widthPx, bar.applied, "readoutAnchorWidth");
    setStyle(parts.counterAnchor, "height", sample.heightPx, bar.applied, "readoutAnchorHeight");
    setStyle(parts.counterAnchor, "transform", "", bar.applied, "readoutTransform");
    setStyle(parts.counterRow, "horizontalAlign", PANEL_ALIGN[align], bar.applied, "readoutAlign");
    setStyle(parts.counterRow, "transform", sample.transform, bar.applied, "readoutRowTransform");
    return changed;
  }

  // Bar geometry is InfoHealthContainer-local CSS px; the row uses counter CSS px.
  // UnitStatus and the counter share the motion frame, so its origin cancels.
  function windowCss(parts, value, axis) {
    try {
      var key = "actualuiscale_" + axis;
      var windowScale = Number(parts.windowRoot[key]);
      var ratio = Number(parts.unitStatus[key]) / windowScale;
      if (!(windowScale > 0) || !(ratio > 0) || ratio === 1) return value;
      var offset = axis === "x" ? "actualxoffset" : "actualyoffset";
      var origin = (Number(parts.unitStatus[offset]) || 0) + (Number(parts.infoHealth[offset]) || 0)
        - (Number(parts.counterContainer[offset]) || 0);
      return origin / windowScale + value * ratio;
    } catch {
      return value;
    }
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
    if (!bar.hidden) rebaseStockGeometry(bar);
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
      var value = nameBaselineStyle(baseline, property);
      setStyle(bar.parts.name, property, value, bar.applied, "name" + property, true);
      if (bar.applied["name" + property] !== value) restored = false;
    }
    bar.nameOwned = !restored;
  }

  // Clearing an inline alignment (null) does not reliably return the panel to
  // its stylesheet value in game: a name moved LEFT stayed left after CENTER.
  // Stock #name has no inline alignment and is centered both ways, so restore
  // that value explicitly instead of a captured (possibly owned) inline one.
  var NAME_STOCK_ALIGN = { horizontalAlign: "center", textAlign: "center" };
  function nameBaselineStyle(baseline, property) {
    return NAME_STOCK_ALIGN[property] || baselineStyle(baseline, property);
  }

  function applyTextOutline(panel, width, color, baseline, cache, key) {
    // Stock offBlack = #10130D (citadel_base_styles); names use offBlack&ee.
    // Five leaves the native rule untouched, unless returning our inline override.
    if (width === 5 && !Object.prototype.hasOwnProperty.call(cache, key)) return;
    setStyle(panel, "textShadow", width === 5 ? baselineStyle(baseline, "textShadow") :
      "0px 0px 0px " + width + " " + color, cache, key);
  }

  // OLD pip rows (1,000 max HP each) shown by the grid, capped at its four-row height.
  function oldPipRows(bar) {
    return bar.pipCount && config.barMask === "old"
      ? Math.min(Math.ceil(bar.pipCount / PIPS_PER_ROW), PIP_TALL_ROWS) : 0;
  }

  function applyPlayerName(bar) {
    var panel = bar.parts.name;
    var enemy = bar.role === "enemy";
    var colorEnabled = enemy ? config.enemyNameColorEnabled : config.allyNameColorEnabled;
    var aligned = config.nameAlign === "left" || config.nameAlign === "right";
    // OLD rows grow up from the bar; the first keeps the stock name spot.
    var offsetY = config.nameOffsetY - (config.nameRiseWithPips
      ? Math.max(0, oldPipRows(bar) - 1) * PIP_ROW_PX * config.heightScale / 100 : 0);
    var tilt = Math.round(Number(config.nameTilt)) || 0;
    var rotation = tilt ? "rotateZ(" + tilt + "deg)" : "";
    if (!config.enabled || bar.surface !== "player" || !config.playerNamesVisible ||
        !isValid(panel) || (!aligned && !config.nameOffsetX && !offsetY && !tilt &&
          !colorEnabled && config.nameSize === 14 && config.nameOutlineWidth === 5)) {
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
    setStyle(panel, "horizontalAlign", aligned ? PANEL_ALIGN[config.nameAlign] :
      nameBaselineStyle(baseline, "horizontalAlign"), bar.applied, "namehorizontalAlign");
    setStyle(panel, "textAlign", aligned ? PANEL_ALIGN[config.nameAlign] :
      nameBaselineStyle(baseline, "textAlign"), bar.applied, "nametextAlign");
    if (!aligned && !config.nameOffsetX && !offsetY) {
      // Rotation stays on #name; HPV2MotionFrame carries the damage shake.
      setStyle(panel, "transform", rotation || baselineStyle(baseline, "transform"),
        bar.applied, "nametransform");
      return;
    }
    var windowWidth = cssLayout(bar.parts.windowRoot, "actuallayoutwidth", "x");
    var windowHeight = cssLayout(bar.parts.windowRoot, "actuallayoutheight", "y");
    var nameWidth = cssLayout(panel, "actuallayoutwidth", "x");
    var nameHeight = cssLayout(panel, "actuallayoutheight", "y");
    if (windowWidth > 0 && windowHeight > 0 && nameWidth > 0 && nameHeight > 0) {
      bar.nameWindowWidth = windowWidth;
      bar.nameWindowHeight = windowHeight;
      bar.nameWidth = nameWidth;
      bar.nameHeight = nameHeight;
      bar.nameDimensions = true;
    } else {
      if (!bar.nameDimensions) return;
      windowWidth = bar.nameWindowWidth;
      windowHeight = bar.nameWindowHeight;
      nameWidth = bar.nameWidth;
      nameHeight = bar.nameHeight;
    }
    // The name's padded edge (LEFT/RIGHT) or center stays at the canvas center
    // plus the X offset; alignment only chooses which way longer names grow.
    var align = config.nameAlign === "left" || config.nameAlign === "right"
      ? config.nameAlign : "center";
    var q = ALIGN_FRACTION[align];
    var anchor = windowWidth / 2 + config.nameOffsetX + (2 * q - 1) * outlineRoom;
    var low = q * nameWidth;
    var high = windowWidth - (1 - q) * nameWidth;
    if (high < low) anchor = (windowWidth - nameWidth) / 2 + q * nameWidth;
    else if (anchor < low) anchor = low;
    else if (anchor > high) anchor = high;
    var x = anchor - q * windowWidth;
    var top = Math.max(0, Math.min(Math.max(0, windowHeight - nameHeight),
      47 + offsetY));
    setStyle(panel, "transform", x || top !== 47
      ? "translate3d(" + pixels(x) + ", " + pixels(top - 47) + ", 0px)" + (rotation ? " " + rotation : "")
      : rotation || baselineStyle(baseline, "transform"), bar.applied, "nametransform");
  }

  function clearStaminaOwnership() {
    setStyle(
      staminaSurface.container,
      "transform",
      baselineStyle(staminaSurface.containerBaseline, "transform"),
      staminaSurface.applied,
      "transform", true,
    );
    setStyle(
      staminaSurface.container,
      "washColor",
      baselineStyle(staminaSurface.containerBaseline, "washColor"),
      staminaSurface.applied,
      "washColor", true,
    );
    for (var index = 0; index < staminaSurface.icons.length; index++) {
      var cache = staminaSurface.iconApplied[index] || {};
      var baseline = staminaSurface.iconBaselines[index] || {};
      setStyle(
        staminaSurface.icons[index],
        "width",
        baselineStyle(baseline, "width"),
        cache,
        "width", true,
      );
      setStyle(
        staminaSurface.icons[index],
        "height",
        baselineStyle(baseline, "height"),
        cache,
        "height", true,
      );
      setStyle(
        staminaSurface.icons[index],
        "backgroundColor",
        baselineStyle(baseline, "backgroundColor"),
        cache,
        "backgroundColor", true,
      );
      setStyle(
        staminaSurface.icons[index],
        "borderColor",
        baselineStyle(baseline, "borderColor"),
        cache,
        "borderColor", true,
      );
      setStyle(staminaSurface.icons[index], "washColor",
        baselineStyle(baseline, "washColor"), cache, "washColor", true);
      setStyle(staminaSurface.icons[index], "backgroundSize",
        baselineStyle(baseline, "backgroundSize"), cache, "backgroundSize", true);
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
          "backgroundSize",
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
      ? "translate3d(" +
        String(nativePx(config.staminaOffsetX)) +
        "px, " +
        String(nativePx(config.staminaOffsetY)) +
        "px, 0px)"
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
        widthOwned || (!shaped && heightOwned)
          ? pixels(shaped ? nativePx(config.staminaWidth) : 8 * config.staminaWidth / 110)
          : baselineStyle(baseline, "width"),
        cache,
        "width",
      );
      setStyle(
        staminaSurface.icons[index],
        "height",
        heightOwned || (!shaped && widthOwned)
          ? pixels(shaped ? nativePx(config.staminaHeight) : 12 * config.staminaHeight / 44.8)
          : baselineStyle(baseline, "height"),
        cache,
        "height",
      );
      setStyle(staminaSurface.icons[index], "backgroundSize",
        !shaped && (widthOwned || heightOwned) ? "100% 100%" :
          baselineStyle(baseline, "backgroundSize"), cache, "backgroundSize");
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
    repairStyleCache(staminaSurface.applied);
    for (var index = 0; index < staminaSurface.iconApplied.length; index++)
      repairStyleCache(staminaSurface.iconApplied[index]);
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
    // ORIGINAL restores the stock masks through CSS; never write inline masks.
    var barGate = !!(config.enabled && bar.surface);
    var root = bar.parts && bar.parts.windowRoot;
    setOwnedClass(root, "HPColorsRewriteBarMask", barGate && config.barMask === "original",
      bar.applied, "barMaskClass");
    setOwnedClass(root, "HPColorsRewriteBarOld", barGate && config.barMask === "old",
      bar.applied, "barOldClass");
    setOwnedClass(root, "HPColorsRewriteBarPips", barGate && config.barMask === "old" && bar.pipCount > 0,
      bar.applied, "barPipsClass");
    // Damage shake: no class keeps the stock 3deg wiggle; teardown clears the gate.
    var shakeOn = config.damageShakeEnabled !== false;
    setOwnedClass(root, "HPColorsRewriteShakeOff", barGate && !shakeOn, bar.applied, "shakeOffClass");
    var shakeDegrees = Math.round(Number(config.damageShakeIntensity));
    for (var shakeIndex = 1; shakeIndex <= 10; shakeIndex++) {
      if (shakeIndex === 3) continue;
      setOwnedClass(root, "HPColorsRewriteShake" + shakeIndex,
        barGate && shakeOn && shakeDegrees === shakeIndex, bar.applied, "shake" + shakeIndex + "Class");
    }
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
    var native = nativeReadoutEnabled(bar);
    if (native && isValid(bar.parts.healthValue) &&
      isValid(bar.parts.counterRow) && panelParent(bar.parts.healthValue) !== bar.parts.counterRow)
      return true;
    if (!native && isValid(bar.healthValueOriginalParent) &&
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
    if (config.barMask === "old" && bar.pipCount) show = false;
    if (show && !isValid(bar.parts.killMarker))
      bar.parts.killMarker = ensureOwnedPanel(bar.parts.primary, "hp_colors_kill_marker");
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
      entry.applied, "washColor", true);
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
      (!enemy || config.pipsVisible) && config.barMask !== "old";
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
    var children = bar.colorPipChildren || [];
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

  // OLD: the engine draws floor(max/250) lines at x = 250k/max of #UnitHealthbarLines
  // (UpdateTickBar), so the last line gives max HP without reading HP text. Pips are laid
  // out only when that line set changes; health changes rewrite only the pips they cross.
  var PIP_HP = 100;
  var PIPS_PER_ROW = 10;
  var PIP_ROW_PX = 6;
  var PIP_TALL_ROWS = 4;
  var PIP_WIDTH_PERCENT = 8.5;
  // 128 slots cover the engine's at-most-50 health lines (12,500 HP) exactly.
  // Larger derived maxima retain native OLD fallback rather than truncating health.
  var MAX_OLD_PIPS = 128;

  function createPip(parts) {
    try {
      var empty = $.CreatePanel("Panel", parts.pipEmpty, "");
      var fill = $.CreatePanel("Panel", parts.pipFill, "");
      empty.AddClass("HPV2Pip");
      fill.AddClass("HPV2Pip");
      if (isValid(empty) && isValid(fill))
        return { empty: empty, fill: fill, emptyApplied: {}, fillApplied: {}, capacity: PIP_HP };
    } catch {}
    return null;
  }

  function layoutOldPips(bar, signature, max) {
    var parts = bar.parts;
    var previousRows = oldPipRows(bar);
    if (parts.pipGrid !== bar.pipContainer) bar.pipPool = [];
    bar.pipContainer = parts.pipGrid;
    bar.pipSignature = signature;
    bar.pipMax = max;
    bar.pipHp = null;
    var count = signature ? Math.max(0, Math.ceil(max / PIP_HP - 0.05)) : 0;
    if (count > MAX_OLD_PIPS) count = 0;
    var rows = Math.ceil(count / PIPS_PER_ROW);
    // Like the 2024 grid, more than four rows shrink to fit four rows of height.
    if (count) setStyle(parts.pipGrid, "height", Math.min(rows, PIP_TALL_ROWS) * PIP_ROW_PX + "px",
      bar.applied, "pipGridHeight");
    var height = rows ? (80 / rows).toFixed(3) + "%" : "";
    for (var index = 0; index < Math.max(count, bar.pipPool.length); index++) {
      var entry = bar.pipPool[index] || (bar.pipPool[index] = createPip(parts));
      if (!entry) {
        bar.pipPool.length = index;
        if (index < count) count = 0;
        break;
      }
      var shown = index < count;
      if (shown) {
        var row = Math.floor(index / PIPS_PER_ROW);
        var position = (index % PIPS_PER_ROW * 100 / PIPS_PER_ROW).toFixed(3) + "% " +
          ((rows - 1 - row) * 100 / rows).toFixed(3) + "% 0px";
        entry.capacity = Math.min(PIP_HP, max - index * PIP_HP);
        setStyle(entry.empty, "position", position, entry.emptyApplied, "position");
        setStyle(entry.empty, "height", height, entry.emptyApplied, "height");
        setStyle(entry.empty, "width", (PIP_WIDTH_PERCENT * entry.capacity / PIP_HP).toFixed(3) + "%",
          entry.emptyApplied, "width");
        setStyle(entry.fill, "position", position, entry.fillApplied, "position");
        setStyle(entry.fill, "height", height, entry.fillApplied, "height");
      } else setStyle(entry.fill, "visibility", "collapse", entry.fillApplied, "visibility");
      setStyle(entry.empty, "visibility", shown ? "visible" : "collapse", entry.emptyApplied, "visibility");
    }
    bar.pipCount = count;
    if (oldPipRows(bar) !== previousRows) bar.dirty = bar.geometryChanged = true;
    setOwnedClass(parts.windowRoot, "HPColorsRewriteBarPips",
      !!(config.enabled && bar.surface) && config.barMask === "old" && count > 0,
      bar.applied, "barPipsClass");
  }

  function fillOldPips(bar) {
    if (!(bar.healthFraction >= 0)) return;
    setStyle(bar.parts.pipFill, "washColor", bar.applied.washColor || "", bar.applied, "pipFillWash");
    var hp = bar.healthFraction * bar.pipMax;
    var previous = bar.pipHp;
    if (previous === hp) return;
    var last = bar.pipCount - 1;
    var from = previous === null ? 0 : Math.floor(Math.min(previous, hp) / PIP_HP);
    var to = previous === null ? last : Math.min(last, Math.floor(Math.max(previous, hp) / PIP_HP));
    for (var index = Math.max(0, from); index <= to; index++) {
      var entry = bar.pipPool[index];
      var share = Math.max(0, Math.min(1, (hp - index * PIP_HP) / entry.capacity));
      setStyle(entry.fill, "width", (PIP_WIDTH_PERCENT * entry.capacity / PIP_HP * share).toFixed(3) + "%",
        entry.fillApplied, "width");
      setStyle(entry.fill, "visibility", share > 0 ? "visible" : "collapse", entry.fillApplied, "visibility");
    }
    bar.pipHp = hp;
  }

  function applyOldPips(bar) {
    if (config.enabled && bar.surface && config.barMask === "old") {
      if (!isValid(bar.parts.pipGrid))
        bar.parts.pipGrid = ensureOwnedPanel(bar.parts.primary, "HPV2PipGrid");
      if (!isValid(bar.parts.pipEmpty))
        bar.parts.pipEmpty = ensureOwnedPanel(bar.parts.pipGrid, "HPV2PipEmpty");
      if (!isValid(bar.parts.pipFill))
        bar.parts.pipFill = ensureOwnedPanel(bar.parts.pipGrid, "HPV2PipFill");
    }
    var parts = bar.parts || {};
    var lines = config.enabled && bar.surface && config.barMask === "old" &&
      isValid(parts.pipEmpty) && isValid(parts.pipFill) ? (bar.pipChildren || []) : [];
    var last = lines.length ? lines[lines.length - 1] : null;
    var width = lines.length ? readPanelWidth(parts.pipLines) : 0;
    var x = isValid(last) ? cssLayout(last, "actualxoffset", "x") : NaN;
    var signature = width > 0 && x > 0 ? lines.length + ":" + x + ":" + width : "";
    if (signature !== bar.pipSignature || parts.pipGrid !== bar.pipContainer)
      layoutOldPips(bar, signature, signature ? lines.length * 250 * width / x : 0);
    if (bar.pipCount) {
      fillOldPips(bar);
      if (bar.applied.killMarkerVisibility !== "collapse") clearKillMarkerOwnership(bar);
    }
  }

  function applyReadoutDecorations(bar) {
    applyPipColors(bar);
    var surface = bar.surface;
    var enemyBarSurface =
      (surface === "player" || surface === "unit") && bar.role === "enemy";
    setStyle(
      bar.parts.pipLines,
      "visibility",
      enemyBarSurface ? (config.pipsVisible || config.barMask === "old" ? "visible" : "collapse") : "",
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

  function clearPulse(bar, keepReadout) {
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
    clearOwnedStyle(overlay, "clip", applied, "colorPulseClip");
    clearOwnedStyle(overlay, "visibility", applied, "colorPulseVisibility");
    // keepReadout: the caller re-syncs native text pulse; clearing it here would restart its animation.
    if (!keepReadout) syncNativeReadoutPulse(bar, false, false, false, "");
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
    overlayClip,
  ) {
    if (!shouldPulse) {
      if (bar.pulseActive || bar.colorPulseActive) clearPulse(bar, true);
      syncNativeReadoutPulse(bar, !!readoutActive && nativeReadoutEnabled(bar),
        intensity === 0, intensity === 2, duration);
      bar.pulseReadoutActive = !!readoutActive;
      bar.pulseDuration = readoutActive ? duration : "";
      return false;
    }
    var applied = bar.applied;
    if (colorPulse && !isValid(bar.parts.pulseOverlay))
      bar.parts.pulseOverlay = ensureOwnedPanel(bar.parts.inner, "hp_colors_pulse_overlay");
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
      setStyle(overlay, "clip", overlayClip, applied, "colorPulseClip");
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
      clearOwnedStyle(overlay, "clip", applied, "colorPulseClip");
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

  function pulseOverlayClip(bar) {
    return "rect(0%, " + Math.max(0, bar.pulseOverlayPercent) + "%, 100%, 0%)";
  }

  function pulseDuration(bpm) {
    return (60 / bpm).toFixed(3) + "s";
  }


  // Use the stack-centre origin so pre-scale is independent of whether Panorama
  // honors transformOrigin. Compensate before the position transform.
  // Sampled bounds have already been normalized by each panel's own axis scale.
  function visualBarRect(bar, fallbackWidth) {
    var sx = config.widthScale / 100;
    var sy = config.heightScale / 100;
    var cx = bar.geometryReady
      ? bar.primaryX + bar.primaryWidth / 2
      : (fallbackWidth || bar.canvasWidth || 200) / 2 +
        (bar.kind === "player" ? 6.5 : 0);
    var cy = bar.geometryReady ? bar.primaryY + bar.primaryHeight / 2 : 74;
    var compensationX = bar.geometryReady ? (cx - bar.stackWidth / 2) * (1 - sx) : 0;
    var compensationY = bar.geometryReady ? (cy - bar.stackHeight / 2) * (1 - sy) : 0;
    var tx = nativePx(config.positionX) + compensationX;
    var ty = nativePx(config.positionY) + compensationY;
    var centerX = bar.geometryReady
      ? bar.stackX + bar.stackWidth / 2 + (cx - bar.stackWidth / 2) * sx + tx
      : cx + tx;
    var centerY = bar.geometryReady
      ? bar.stackY + bar.stackHeight / 2 + (cy - bar.stackHeight / 2) * sy + ty
      : cy + ty;
    var width = (bar.primaryWidth || 0) * sx;
    var height = (bar.primaryHeight || 0) * sy;
    var visual = bar.visualRect;
    visual.left = centerX - width / 2;
    visual.top = centerY - height / 2;
    visual.width = width;
    visual.height = height;
    visual.centerX = centerX;
    visual.centerY = centerY;
    visual.translateX = tx;
    visual.translateY = ty;
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

  // OLD rows grow up from 2.5px above the bar bottom; anchored ult/level follow the
  // grid's vertical centre instead of the hidden bar's.
  function oldGridLift(bar) {
    var rows = oldPipRows(bar);
    return rows ? (rows * PIP_ROW_PX / 2 - (bar.primaryHeight || 0) / 2 + 2.5) *
      config.heightScale / 100 : 0;
  }

  function applyBarGeometry(bar, panelBaseline) {
    var scaleX = config.widthScale / 100;
    var scaleY = config.heightScale / 100;
    var scaleActive = scaleX !== 1 || scaleY !== 1;
    var scale = String(scaleX) + ", " + String(scaleY);
    visualBarRect(bar);
    var visual = bar.visualRect;
    var transform =
      "translate3d(" +
      String(visual.translateX) +
      "px, " +
      String(visual.translateY) +
      "px, 0px)";
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
        ? "50% 50%"
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

    applyStatusTagGeometry(bar, bar.surface === "player");
    if (bar.surface !== "player") {
      bar.geometryChanged = false;
      return;
    }

    var anchor = !!config.accessoryAnchorEnabled;
    var anchorCenterY = visual.centerY - oldGridLift(bar);
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
        (anchor ? visual.left : scaledBarLeft) -
        (stockBarLeft - bar.levelAnchorCenterX) +
        nativePx(config.levelOffsetX) * (anchor ? 1 : scaleX);
      var levelCenterY =
        (anchor ? anchorCenterY : stockBarCenterY) -
        (stockBarCenterY - bar.levelAnchorCenterY) * (anchor ? 1 : scaleY) +
        nativePx(config.levelOffsetY) * (anchor ? 1 : scaleY);
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
        (anchor ? visual.left : scaledBarLeft) -
        (stockBarLeft - bar.unitInfoAnchorCenterX) +
        nativePx(config.ultOffsetX) * (anchor ? 1 : scaleX);
      var unitInfoCenterY =
        (anchor ? anchorCenterY : stockBarCenterY) -
        (stockBarCenterY - bar.unitInfoAnchorCenterY) * (anchor ? 1 : scaleY) +
        nativePx(config.ultOffsetY) * (anchor ? 1 : scaleY);
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

  // Stock CRITICAL/ASSASSINATE sit below the player bar. Their own animation
  // owns the stock panel's transform, so translate the owned full-canvas
  // anchor around it (no layout pass), scale the stock panel uniformly
  // without distortion, then add the user's unscaled X/Y offsets. The label
  // stays inside the world canvas: outside it the engine stops drawing it.
  function applyStatusTagGeometry(bar, active) {
    var scaleX = config.widthScale / 100;
    var scaleY = config.heightScale / 100;
    var scale = active ? Math.round(Math.sqrt(scaleX * scaleY) * 100) / 100 : 1;
    var width = bar.canvasWidth > 0 ? bar.canvasWidth : 200;
    var height = bar.canvasHeight > 0 ? bar.canvasHeight : 210;
    for (var index = 0; index < STATUS_TAGS.length; index++) {
      var tag = STATUS_TAGS[index];
      var transform = STATUS_TAG_STOCK_TRANSFORM;
      if (active) {
        var centerX = width / 2 - 15;
        var centerY = STATUS_TAG_TOP + tag.halfHeight;
        var dx = nativePx(config.positionX) + STATUS_TAG_BAR_DX * (scaleX - 1) +
          config[tag.offsetX];
        var dy = nativePx(config.positionY) + STATUS_TAG_BAR_HALF_HEIGHT * (scaleY - 1) +
          tag.gap * (scale - 1) + config[tag.offsetY];
        var reachX = tag.halfWidth * scale;
        var reachY = tag.halfHeight * scale;
        dx = Math.max(reachX - centerX, Math.min(width - reachX - centerX, dx));
        dy = Math.max(reachY - centerY, Math.min(height - reachY - centerY, dy));
        dx = Math.round(dx * 100) / 100;
        dy = Math.round(dy * 100) / 100;
        if (dx || dy) transform = "translate3d(" + pixels(dx) + ", " + pixels(dy) + ", 0px)";
      }
      setStyle(bar.parts[tag.anchor], "transform", transform,
        bar.applied, tag.part + "AnchorTransform");
      setStyle(bar.parts[tag.part], "preTransformScale2d", scale !== 1 ? String(scale) :
        STATUS_TAG_STOCK_SCALE, bar.applied, tag.part + "Scale");
    }
  }


  // [part, property, cache key] for every geometry style the bar owns; the
  // first four are shared by every surface, status tags restore explicit
  // stylesheet values, and the accessory entries add the bar field holding
  // their rebased margin and its stock fallback.
  var GEOMETRY_STYLES = [
    ["healthbars", "preTransformScale2d", "barPreTransformScale2d"],
    ["healthbars", "transformOrigin", "barTransformOrigin"],
    ["healthbars", "transform", "barTransform"],
    ["infoHealth", "transformOrigin", "infoStockOrigin"],
    ["criticalAnchor", "transform", "criticalAnchorTransform"],
    ["critical", "preTransformScale2d", "criticalScale"],
    ["assassinateAnchor", "transform", "assassinateAnchorTransform"],
    ["assassinate", "preTransformScale2d", "assassinateScale"],
    ["levelContainer", "marginLeft", "levelAnchorMarginLeft", "levelAnchorBaseLeft", LEVEL_BASE_MARGIN_LEFT],
    ["levelContainer", "marginTop", "levelAnchorMarginTop", "levelAnchorBaseTop", LEVEL_BASE_MARGIN_TOP],
    ["unitInfo", "marginLeft", "unitInfoAnchorMarginLeft", "unitInfoAnchorBaseLeft", UNIT_INFO_BASE_MARGIN_LEFT],
    ["unitInfo", "marginTop", "unitInfoAnchorMarginTop", "unitInfoAnchorBaseTop", UNIT_INFO_BASE_MARGIN_TOP],
  ];

  // accessoriesOnly: restore just the rebased level/ultimate margins (entries with a base field).
  function restoreBarGeometry(bar, panelBaseline, accessoriesOnly) {
    for (var index = 0; index < GEOMETRY_STYLES.length; index++) {
      var entry = GEOMETRY_STYLES[index];
      if (accessoriesOnly && entry.length <= 3) continue;
      var value;
      if (entry.length > 3) {
        var base = bar[entry[3]];
        value = pixels(base === undefined ? entry[4] : base);
      } else if (entry[0] === "criticalAnchor" || entry[0] === "assassinateAnchor") {
        value = STATUS_TAG_STOCK_TRANSFORM;
      } else if (entry[0] === "critical" || entry[0] === "assassinate") {
        value = STATUS_TAG_STOCK_SCALE;
      } else if (entry[1] === "transformOrigin") {
        value = bar.stockTransformOrigin || "50% 40.48%";
      } else {
        value = baselineStyle(panelBaseline[entry[0]], entry[1]);
      }
      setStyle(bar.parts[entry[0]], entry[1], value, bar.applied, entry[2], true);
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
    if (!preserveUnitPresentation) restoreBarGeometry(bar, panelBaseline);
    bar.geometryChanged = false;
    bar.markerGeometryChanged = false;
  }

  function applyActiveCustomization(bar, panelBaseline, healthOnly) {
    if (healthOnly && !bar.colorDirty) {
      if (bar.colorPulseActive)
        setStyle(bar.parts.pulseOverlay, "clip", pulseOverlayClip(bar),
          bar.applied, "colorPulseClip");
      applyOldPips(bar);
      bar.healthDirty = false;
      positionReadout(bar);
      applyPlayerName(bar);
      bar.coverageDirty = false;
      return;
    }
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
      bar.healthDirty = false;
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
    var textShouldPulse = playerSurface &&
      (role === "enemy" ? config.enemyPulseEnabled : config.allyPulseEnabled) &&
      bar.lastWidthPercent >= 0 && bar.lastWidthPercent <= pulseThreshold &&
      !!readoutKeys;
    var enemyReadoutPulse = role === "enemy" && textShouldPulse;
    var pulseReadoutAnimationActive = textShouldPulse &&
      (role === "enemy" ? config.enemyPulseReadout : config.allyPulseReadout);
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
      pulseOverlayClip(bar),
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
    if (!healthOnly) applyReadoutDecorations(bar);
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
    applyOldPips(bar);
    if (!healthOnly || bar.geometryChanged) applyBarGeometry(bar, panelBaseline);
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
    applyPlayerName(bar);
    bar.dirty = false;
    bar.healthDirty = false;
  }

  function applyCustomization(bar, restoring) {
    if (!restoring && (bar.hidden || (bar.dirty && syncSurfaceHidden(bar)))) return;
    if (!bar.dirty && !bar.healthDirty) return;
    var healthOnly = !bar.dirty;
    var panelBaseline = bar.panelBaseline || {};
    bar.surface = resolveSurface(bar, config);
    if (restoring || !isComplete(bar.parts)) bar.surface = "";
    if (!healthOnly) syncOwnedRootClasses(bar);
    if (!bar.surface) {
      restoreInactiveCustomization(bar, panelBaseline);
      bar.dirty = false;
      bar.healthDirty = false;
      return;
    }
    if (bar.pulseRole && bar.pulseRole !== bar.role) clearPulse(bar);
    bar.pulseRole = bar.role;
    applyActiveCustomization(bar, panelBaseline, healthOnly);
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
        !data.values ||
        typeof data.values !== "object" ||
        Array.isArray(data.values)
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
      stopConfigRequests();
      releaseRelay();
      repaintAll();
      return true;
    } catch {
      return false;
    }
  }

  // The absolute root is cached; it is walked again only once it is invalid
  // or has gained a parent.
  function readRootConfig() {
    var nextRoot =
      isValid(configRoot) && !panelParent(configRoot)
        ? configRoot
        : absoluteRoot(context);
    if (nextRoot !== configRoot) {
      configRoot = nextRoot;
      configRaw = "";
      configRevision = -1;
      config = normalizeConfig({ enabled: false });
      awaitingConfig = true;
      awaitingSince = nowMs();
      notifyConfigListeners();
      startConfigRequests();
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
      if (bars[index].dormant && bars[index].kind !== "player") bars[index].partsLineage = -1;
      bars[index].dirty = true;
      applyCustomization(bars[index]);
    }
    if (!bars.length || !bars[0].hidden) applyStaminaSurface();
    notifyConfigListeners();
    notifyWakeListeners();
    if (paintNeeded()) requestFastPaint();
  }

  // Non-player contexts drop their relay once configured; heroes keep it for
  // pickup snapshots. The bridge recreates it lazily when needed again.
  function releaseRelay() {
    var release = context.HPV2ReleaseRelay;
    if (typeof release !== "function") return;
    try {
      release();
    } catch {}
  }

  function stopConfigRequests() {
    requestGeneration += 1;
    if (requestJob) {
      try {
        if ($.CancelScheduled) $.CancelScheduled(requestJob);
      } catch {}
    }
    requestJob = null;
  }

  function startConfigRequests() {
    stopConfigRequests();
    requestAttempt = 0;
    requestFailures = 0;
    scheduleConfigRequest(requestGeneration);
  }

  // Backoff 0.5, 1, 2, 4, 8 s, then every 8 s until config, teardown or a
  // root change. Consecutive relay failures end the loop (no retry storm).
  function scheduleConfigRequest(generation) {
    if (stopped || configRevision >= 0 ||
      requestFailures >= CONFIG_REQUEST_FAILURE_LIMIT) return;
    var delay = CONFIG_REQUEST_DELAYS_SEC[
      Math.min(requestAttempt, CONFIG_REQUEST_DELAYS_SEC.length - 1)];
    try {
      requestJob = $.Schedule(delay, function () {
        if (stopped || generation !== requestGeneration) return;
        requestJob = null;
        if (configRevision >= 0) return;
        requestAttempt += 1;
        var queue = isValid(context) ? context.HPV2QueueConfigRequest : null;
        var sent = false;
        if (typeof queue === "function") {
          try {
            sent = queue(configRevision) === true;
          } catch {}
        }
        requestFailures = sent ? 0 : requestFailures + 1;
        scheduleConfigRequest(generation);
      });
    } catch {
      requestJob = null;
    }
  }

  // The context's only ClientUI_FireOutput listener: cheap substring routing,
  // no JSON.parse for messages it does not own. Escaped raw strings keep the
  // conservative path to both owners, which validate fully.
  function onWorldEvent(payload) {
    if (stopped) return;
    var raw;
    try {
      raw = payload === String(payload) ? payload : JSON.stringify(payload);
    } catch {
      return;
    }
    if (!raw) return;
    var escaped = raw.indexOf("\\") >= 0;
    if (escaped || raw.indexOf(CONFIG_MAGIC) >= 0) applyConfigRaw(raw);
    if (escaped || raw.indexOf("HPV2_PICKUP_") >= 0 ||
      raw.indexOf("HPV2_ULTIMATE_SNAPSHOT") >= 0) {
      var hook = context[PICKUP_HOOK];
      if (typeof hook === "function") {
        try {
          hook(raw);
        } catch {}
      }
    }
  }


  // The adopted HP label is outside stock health ancestry. Mirror engine hide
  // gates once per transition; preserve dirty config for the first visible pass.
  function syncSurfaceHidden(bar) {
    var hidden = false;
    var damage = false;
    var critical = false;
    // Stock sets these beside the kind classes (`.GameStatePreGame.player`), so reuse
    // classification's carriers instead of re-walking every ancestor each scan.
    var carriers = bar.factCarriers && bar.factCarriers.length ? bar.factCarriers : null;
    var panel = carriers ? carriers[0] : bar.parts.inner;
    for (var depth = 0; isValid(panel) && depth < 16; depth++) {
      if (hasClass(panel, "health_hidden") || hasClass(panel, "GameStatePreGame") ||
          hasClass(panel, "beingSpectatedInEye")) hidden = true;
      if (hasClass(panel, "active_damage")) damage = true;
      if (hasClass(panel, "health_critical")) critical = true;
      panel = carriers ? carriers[depth + 1] : panelParent(panel);
    }
    if (hidden !== !!bar.hidden) {
      bar.hidden = hidden;
      bar.dirty = true;
      if (hidden) clearPulse(bar);
      if (bar.nativeReadoutOwned)
        setStyle(bar.parts.healthValue, "visibility", hidden ? "collapse" : "visible",
          bar.applied, "nativeHealthValueVisibility");
    }
    if (damage !== bar.damageSignal || critical !== bar.criticalSignal) {
      bar.damageSignal = damage;
      bar.criticalSignal = critical;
      requestFastPaint();
    }
    return hidden;
  }

  function scanStyleDrift(bar) {
    var full = bar.partsScans % FULL_RESOLVE_SCANS === 1;
    var drift = repairStyleCache(bar.applied, !full);
    if (!full) return drift;
    for (var index = 0; index < bar.pipColorEntries.length; index++)
      if (repairStyleCache(bar.pipColorEntries[index].applied)) drift = true;
    for (var index = 0; index < bar.pipPool.length; index++) {
      var entry = bar.pipPool[index];
      var emptyDrift = repairStyleCache(entry.emptyApplied);
      var fillDrift = repairStyleCache(entry.fillApplied);
      if (emptyDrift || fillDrift) {
        bar.pipSignature = null;
        drift = true;
      }
    }
    return drift;
  }

  function reportData(bar, classified) {
    if (!isComplete(bar.parts)) return;
    if (!classified) classifyTarget(bar);
    if (syncSurfaceHidden(bar)) return;
    if (dormant(bar)) return;
    if (!bar.surface) rebaseStockGeometry(bar);
    scanPipChildren(bar);
    var refreshHealth = healthRefreshEnabled(bar);
    if (!bar.healthSampled || refreshHealth) sampleHealthPercent(bar);
    else if (bar.surface === "player") sampleBarGeometry(bar);
    applyOldPips(bar);
    updateLevel(bar, readLabelText(bar.parts.levelLabel));
    reconcileAccessoryCenters(bar);
    // General style repair shares the full resolve; layout/visibility keep the 1 s sentinel.
    if (scanStyleDrift(bar) || layoutStyleDrift(bar) || appearanceStyleDrift(bar))
      bar.dirty = true;
    // applyCustomization places the name itself; one pass per tick is enough.
    if (bar.dirty || bar.healthDirty) applyCustomization(bar);
    else applyPlayerName(bar);
    bar.dormant = !bar.surface && !bar.dirty;
  }
  // Per-panel samples; cleared on creation and whenever the part set changes.
  function resetBarSamples(bar) {
    bar.readoutPosition = null;
    bar.nameDimensions = null;
    bar.readoutSample = null;
    bar.visualRect = {};
    bar.kind = "unknown";
    bar.role = "other";
    bar.ambiguousRelation = false;
    bar.spectating = false;
    bar.team = "";
    bar.surface = "";
    bar.levelText = "";
    bar.level = 0;
    bar.levelTier = null;
    bar.healthDirty = false;
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
    bar.pipSignature = null;
    bar.pipContainer = null;
    (bar.pipPool || []).forEach(function (pip) { try { pip.empty.DeleteAsync(0); pip.fill.DeleteAsync(0); } catch {} });
    bar.pipPool = [];
    bar.pipCount = 0;
    bar.pipMax = 0;
    bar.pipHp = null;
    bar.healthFraction = -1;
    bar.dormant = false;
    bar.factCarriers = null;
    bar.factScans = 0;
  }

  // Cached parts stand between full resolves unless one went invalid or moved,
  // a parent's child count changed (replacement added), the lineage was
  // re-resolved, or a required part is missing. The periodic full resolve
  // picks up late optional parts under untracked panels. Parent and count
  // reads are native calls without the Children() arrays a resolve walks.
  function cachedPartsUsable(bar) {
    var scanIndex = bar.partsScans++;
    var cache = bar.partsCache;
    if (!cache || bar.partsLineage !== liveLineage.revision ||
      scanIndex % FULL_RESOLVE_SCANS === 0 || !isComplete(bar.parts))
      return false;
    var parts = bar.parts;
    for (var key in parts) {
      if (!Object.prototype.hasOwnProperty.call(parts, key) || !parts[key]) continue;
      if (!isValid(parts[key]) || panelParent(parts[key]) !== cache.parents[key])
        return false;
    }
    for (var index = 0; index < cache.containers.length; index++) {
      if (panelChildCount(cache.containers[index]) !== cache.counts[index])
        return false;
    }
    return true;
  }

  function markPartsResolved(bar) {
    var parts = bar.parts;
    var cache = { parents: {}, containers: [], counts: [] };
    for (var key in parts) {
      if (!Object.prototype.hasOwnProperty.call(parts, key) || !parts[key]) continue;
      var parent = panelParent(parts[key]);
      cache.parents[key] = parent;
      if (parent && cache.containers.indexOf(parent) < 0) {
        cache.containers.push(parent);
        cache.counts.push(panelChildCount(parent));
      }
    }
    bar.partsCache = cache;
    bar.partsLineage = liveLineage.revision;
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
      parts: parts,
      partsScans: 1,
      partsLineage: liveLineage.revision,
    };
    resetBarSamples(bar);
    syncSurfaceHidden(bar);
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
        var sleeping = bar.dormant && bar.kind !== "player";
        var steady = sleeping && !classifyTarget(bar) && dormant(bar) &&
          bar.partsLineage === liveLineage.revision;
        var reresolve = sleeping ? bar.partsScans++ % FULL_RESOLVE_SCANS === 0 || !steady : !cachedPartsUsable(bar);
        var partsChanged = reresolve && refreshBarParts(bar, lineage);
        if (!steady || reresolve) {
          schedulePartsRetry(bar);
          reportData(bar, sleeping && !partsChanged);
        }
        // Snapshot after reportData so this scan's own label adoption is the baseline.
        if (reresolve) markPartsResolved(bar);
      }
      staminaBar = bar;
    }
    if (bar && bar.hidden) return;

    reconcileStaminaSurface(staminaBar);
  }

  function healthRefreshEnabled(bar) {
    if (!config.enabled) return false;
    if (bar.surface && config.barMask === "old") return true;
    if (bar.surface === "fill") return config.readoutVisible;
    if (bar.surface === "unit") return true;
    if (bar.surface !== "player") return false;
    if (bar.role === "enemy") return config.enemyEnabled || config.readoutVisible;
    if (bar.role === "ally")
      return config.allyEnabled || config.allyReadoutVisible;
    return false;
  }

  // A bar left stock (master off, UNITS toggle off, unknown target) owns nothing, so it
  // skips per-tick work until config, classification or canvas size changes.
  function dormant(bar) {
    if (bar.surface || bar.dirty || !bar.dormant) return false;
    var info = bar.parts.infoHealth;
    return cssLayout(info, "actuallayoutwidth", "x") === bar.canvasWidth &&
      cssLayout(info, "actuallayoutheight", "y") === bar.canvasHeight;
  }

  function refreshColor(bar) {
    if (!isComplete(bar.parts)) {
      if (!bar.dirty) return false;
      applyCustomization(bar);
      return true;
    }
    if (bar.hidden || dormant(bar)) return false;
    rebaseStockGeometry(bar);
    applyOldPips(bar);
    var changed = false;
    if (healthRefreshEnabled(bar)) {
      sampleHealthPercent(bar, true);
      changed = bar.healthPresentationChanged;
    }
    reconcileAccessoryCenters(bar);
    if (nativeReadoutEnabled(bar) && !bar.nativeReadoutOwned) bar.dirty = true;
    bar.dormant = !bar.surface && !bar.dirty;
    if (bar.dirty || bar.healthDirty) {
      applyCustomization(bar);
      return true;
    }
    // A dirty pass repaints pip colors, readout placement and the name itself.
    // Pip discovery and drift repair belong to the scan, not this hot path.
    changed = positionReadout(bar) || changed;
    applyPlayerName(bar);
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
    stopConfigRequests();
    try {
      if (eventHandlerId !== null && $.UnregisterForUnhandledEvent)
        $.UnregisterForUnhandledEvent(EVENT_CHANNEL, eventHandlerId);
    } catch {}
    eventHandlerId = null;
    configListeners.length = 0;
    wakeListeners.length = 0;
    if (context.HPV2OnWake === exportedOnWake) context.HPV2OnWake = null;
    if (context.HPV2GetNormalizedConfig === exportedGetConfig)
      context.HPV2GetNormalizedConfig = null;
    if (context.HPV2OnConfigChanged === exportedOnConfigChanged)
      context.HPV2OnConfigChanged = null;
    if (context.HPV2GetUltimateProgressColor === exportedGetUltimateProgressColor)
      context.HPV2GetUltimateProgressColor = null;
  }

  function refreshPaint() {
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
    if (paintNeeded()) schedulePaint(delay);
  }

  function paintNeeded() {
    for (var index = 0; index < bars.length; index++)
      if (!bars[index].hidden && (bars[index].surface || bars[index].dirty)) return true;
    return false;
  }

  function schedulePaint(delay) {
    var generation = ++paintGeneration;
    paintJob = $.Schedule(delay, function paintColors() {
      if (stopped || generation !== paintGeneration) return;
      refreshPaint();
    });
  }

  function requestFastPaint() {
    if (stopped || !paintNeeded()) return;
    if (paintJob) {
      try { if ($.CancelScheduled) $.CancelScheduled(paintJob); } catch {}
    }
    schedulePaint(PAINT_ACTIVE_SEC);
  }

  function scan() {
    scanJob = null;
    if (!isValid(context)) {
      teardown();
      return;
    }
    inspectRootConfig();
    reconcileBars();
    notifyWakeListeners();
    if (paintNeeded()) {
      if (!paintJob) schedulePaint(PAINT_ACTIVE_SEC);
    } else if (paintJob) {
      paintGeneration++;
      try { if ($.CancelScheduled) $.CancelScheduled(paintJob); } catch {}
      paintJob = null;
    }
    scanJob = $.Schedule(scanDelay, scan);
    scanDelay = SCAN_INTERVAL_SEC;
  }
  try {
    eventHandlerId = $.RegisterForUnhandledEvent(EVENT_CHANNEL, onWorldEvent);
  } catch {}
  scan();
  if (!paintJob && paintNeeded()) refreshPaint();
})();
