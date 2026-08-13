(function () {
  "use strict";

  var CONFIG_ATTR = "hp_colors_rewrite_config";
  var MENU_STATE_ATTR = "hp_colors_rewrite_menu_state";
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var CONFIG_MAGIC = "HP_COLORS_REWRITE_CONFIG";
  var HISTORY_LIMIT = 40;
  var PRECISE_PIPS_ENABLE_TEXT =
    '"citadel_unit_status_health_per_minor_pip" "10"\n' +
    '"citadel_unit_status_health_per_pip" "10"\n' +
    '"citadel_unit_status_minor_pip_per_major_pip" "10"';
  var PRECISE_PIPS_RESET_TEXT =
    '"citadel_unit_status_health_per_minor_pip" "100"\n' +
    '"citadel_unit_status_health_per_pip" "100"\n' +
    '"citadel_unit_status_minor_pip_per_major_pip" "5"';
  var REPLAY_HOT_SEC = 1;
  var REPLAY_WARM_SEC = 3;
  var REPLAY_IDLE_SEC = 8;
  var REPLAY_HOT_COUNT = 3;
  var REPLAY_WARM_COUNT = 12;
  var HERO_POLL_ACTIVE_SEC = 1;
  var HERO_POLL_INACTIVE_SEC = 5;
  var HERO_SETTLE_SAMPLES = 2;
  var HERO_MODE_AUTO = "auto";
  var HERO_MODE_MANUAL = "manual";
  var HERO_MODE_OFF = "off";
  var HERO_SCOPE_OFF = "off";
  var HERO_SCOPE_ALL = "all";
  var HERO_SCOPE_SELECTED = "selected";
  var CURRENT_SCOPE_ID = "scope_current";
  var DEFAULT_PRESET_ID = "baked_default";
  var HERO_PHASE_TRANSITIONING = "transitioning";
  var HERO_PHASE_LOBBY = "lobby";
  var HERO_PHASE_ACTIVE = "active";
  var HERO_PHASE_POST_MATCH = "post_match";
  var HERO_DATA = [
    ["hero_atlas", "Abrams"],
    ["hero_fencer", "Apollo"],
    ["hero_bebop", "Bebop"],
    ["hero_punkgoat", "Billy"],
    ["hero_nano", "Calico"],
    ["hero_unicorn", "Celeste"],
    ["hero_drifter", "Drifter"],
    ["hero_dynamo", "Dynamo"],
    ["hero_necro", "Graves"],
    ["hero_orion", "Grey Talon"],
    ["hero_haze", "Haze"],
    ["hero_astro", "Holliday"],
    ["hero_inferno", "Infernus"],
    ["hero_tengu", "Ivy"],
    ["hero_kelvin", "Kelvin"],
    ["hero_ghost", "Lady Geist"],
    ["hero_lash", "Lash"],
    ["hero_forge", "McGinnis"],
    ["hero_vampirebat", "Mina"],
    ["hero_mirage", "Mirage"],
    ["hero_krill", "Mo & Krill"],
    ["hero_bookworm", "Paige"],
    ["hero_chrono", "Paradox"],
    ["hero_synth", "Pocket"],
    ["hero_familiar", "Rem"],
    ["hero_gigawatt", "Seven"],
    ["hero_shiv", "Shiv"],
    ["hero_magician", "Sinclair"],
    ["hero_werewolf", "Silver"],
    ["hero_doorman", "The Doorman"],
    ["hero_viper", "Vyper"],
    ["hero_viscous", "Viscous"],
    ["hero_hornet", "Vindicta"],
    ["hero_priest", "Venator"],
    ["hero_frank", "Victor"],
    ["hero_warden", "Warden"],
    ["hero_wraith", "Wraith"],
    ["hero_yamato", "Yamato"],
  ];
  var HERO_BY_KEY = {};
  var HERO_BY_RETAIL_NAME = {};
  for (var heroIndex = 0; heroIndex < HERO_DATA.length; heroIndex++) {
    var heroKey = HERO_DATA[heroIndex][0];
    var heroName = HERO_DATA[heroIndex][1];
    HERO_BY_KEY[heroKey] = heroName;
    HERO_BY_RETAIL_NAME[heroName.toUpperCase()] = heroKey;
  }

  var DEFAULTS = {
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
    lowThreshold: 25,
    highThreshold: 65,
    enemyPulseEnabled: true,
    enemyPulseThreshold: 25,
    enemyPulseBpm: 75,
    enemyPulseIntensity: 1,
    enemyPulseColorEnabled: false,
    enemyPulseColorMode: "gradient",
    enemyPulseColor: "#FF2222",
    enemyPulseHideBar: false,
    enemyPulseReadout: false,
    enemyPulseReadoutModifiers: false,
    enemyPulseReadoutSize: 145,
    enemyPulseReadoutOffsetX: 27,
    enemyPulseReadoutOffsetY: 500,
    allyPulseEnabled: false,
    allyPulseThreshold: 25,
    allyPulseBpm: 75,
    allyPulseIntensity: 1,
    allyPulseColorEnabled: false,
    allyPulseColor: "#FF2222",
    enemyKillMarkerEnabled: false,
    enemyKillMarkerThreshold: 25,
    enemyKillMarkerWidth: 3,
    enemyKillMarkerColor: "#FF2222",
  };
  var DEFAULT_KEYS = [];
  for (var defaultKey in DEFAULTS) {
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, defaultKey))
      DEFAULT_KEYS.push(defaultKey);
  }
  var BAKED_PRESETS = [
    {
      id: DEFAULT_PRESET_ID,
      kind: "baked",
      name: "Rewrite Default",
      values: copyValues(DEFAULTS),
      mode: HERO_SCOPE_OFF,
      heroes: [],
    },
  ];

  var CATEGORY_DEFS = [
    {
      name: "OVERVIEW",
      tabs: [
        {
          name: "STATUS",
          title: "CURRENT CONFIGURATION",
          description:
            "Enable the rewrite, then tune enemy and ally bars while holding Peek to inspect the result.",
          pageId: "HPColorsSettingsOverviewStatus",
          keys: ["enabled"],
        },
        {
          name: "LAYOUT",
          title: "BAR LAYOUT",
          description:
            "Scale and position relation-owned v1 healthbars without changing engine-driven fill ratios.",
          pageId: "HPColorsSettingsOverviewLayout",
          keys: ["widthScale", "heightScale", "positionX", "positionY"],
        },
        {
          name: "HERO",
          title: "HERO LOADOUTS",
          description:
            "Resolve the active hero, choose a save target, and manage automatic session loadouts in one place.",
          pageId: "HPColorsSettingsOverviewHero",
          keys: [],
        },
      ],
    },
    {
      name: "ENEMY",
      tabs: [
        {
          name: "BAR",
          title: "ENEMY BAR",
          description:
            "Fixed steps between low, mid, and high colors; Gradient blends them. Neutral units remain stock.",
          pageId: "HPColorsSettingsEnemyBar",
          keys: [
            "enemyEnabled",
            "enemyVisible",
            "enemyMode",
            "enemyLow",
            "enemyMid",
            "enemyHigh",
            "lowThreshold",
            "highThreshold",
            "enemyTeamHigh",
            "excludeBuildings",
            "excludeBosses",
          ],
        },
        {
          name: "FEEDBACK",
          title: "ENEMY FEEDBACK",
          description:
            "Color engine-owned healing and recent-damage layers without changing their widths.",
          pageId: "HPColorsSettingsEnemyFeedback",
          keys: ["enemyHealing", "enemyDelta"],
        },
        {
          name: "ICONS",
          title: "ENEMY SHIELDS & ICONS",
          description:
            "Tint bullet shields and ultimate-ready icons without changing engine geometry or visibility.",
          pageId: "HPColorsSettingsEnemyShields",
          keys: ["enemyBulletShield", "ultMode", "ultCustom"],
        },
      ],
    },
    {
      name: "ALLY",
      tabs: [
        {
          name: "BAR",
          title: "ALLY BAR",
          description:
            "Fixed steps between low, mid, and high colors; Gradient blends them using the shared thresholds.",
          pageId: "HPColorsSettingsAllyBar",
          keys: [
            "allyEnabled",
            "allyVisible",
            "allyMode",
            "allyLow",
            "allyMid",
            "allyHigh",
          ],
        },
        {
          name: "FEEDBACK",
          title: "ALLY FEEDBACK",
          description:
            "Color engine-owned healing and recent-damage layers on customized ally bars.",
          pageId: "HPColorsSettingsAllyFeedback",
          keys: ["allyHealing", "allyDelta"],
        },
        {
          name: "SHIELDS",
          title: "ALLY SHIELDS",
          description:
            "Tint the ally bullet-shield layer without changing engine shield geometry.",
          pageId: "HPColorsSettingsAllyShields",
          keys: ["allyBulletShield"],
        },
      ],
    },
    {
      name: "READOUT",
      tabs: [
        {
          name: "NUMBER",
          title: "HP NUMBER",
          description:
            "Show enemy health as current and maximum HP, percentage, or current HP only.",
          pageId: "HPColorsSettingsReadoutNumber",
          keys: [
            "readoutVisible",
            "readoutFormat",
            "readoutSize",
            "readoutFont",
            "readoutColorMode",
            "readoutMode",
            "lowThreshold",
            "highThreshold",
            "readoutLow",
            "readoutMid",
            "readoutHigh",
          ],
        },
        {
          name: "PLACEMENT",
          title: "HP NUMBER PLACEMENT",
          description:
            "Offset the owned HP number without moving the stock healthbar or unit icon.",
          pageId: "HPColorsSettingsReadoutPlacement",
          keys: ["readoutOffsetX", "readoutOffsetY"],
        },
        {
          name: "LEVEL & PIPS",
          title: "LEVELS & HEALTH PIPS",
          description:
            "Control enemy health pips and player level visibility without changing engine-owned text or geometry.",
          pageId: "HPColorsSettingsReadoutLevels",
          keys: ["pipsVisible", "precisePipsEnabled", "levelsVisible"],
        },

      ],
    },
    {
      name: "EFFECTS",
      tabs: [
        {
          name: "ENEMY PULSE",
          title: "ENEMY LOW-HP PULSE",
          description:
            "Pulse enemy bars at or below the threshold without changing engine-owned widths or timing.",
          pageId: "HPColorsSettingsEnemyPulse",
          keys: [
            "enemyPulseEnabled",
            "enemyPulseThreshold",
            "enemyPulseBpm",
            "enemyPulseIntensity",
            "enemyPulseColorEnabled",
            "enemyPulseColorMode",
            "enemyPulseColor",
            "enemyPulseHideBar",
            "enemyPulseReadout",
            "enemyPulseReadoutModifiers",
            "enemyPulseReadoutSize",
            "enemyPulseReadoutOffsetX",
            "enemyPulseReadoutOffsetY",
          ],
        },
        {
          name: "KILL MARKER",
          title: "ENEMY KILL MARKER",
          description:
            "Show a static marker on visible enemy player healthbars at a configurable health threshold.",
          pageId: "HPColorsSettingsEnemyKillMarker",
          keys: [
            "enemyKillMarkerEnabled",
            "enemyKillMarkerThreshold",
            "enemyKillMarkerWidth",
            "enemyKillMarkerColor",
          ],
        },
        {
          name: "ALLY PULSE",
          title: "ALLY LOW-HP PULSE",
          description:
            "Pulse customized ally bars at or below their independent threshold.",
          pageId: "HPColorsSettingsAllyPulse",
          keys: [
            "allyPulseEnabled",
            "allyPulseThreshold",
            "allyPulseBpm",
            "allyPulseIntensity",
            "allyPulseColorEnabled",
            "allyPulseColor",
          ],
        },
      ],
    },
  ];

  var CATEGORY_BUTTON_IDS = [
    "HPColorsCategoryOverview",
    "HPColorsCategoryEnemy",
    "HPColorsCategoryAlly",
    "HPColorsCategoryReadout",
    "HPColorsCategoryEffects",
  ];
  var BOOLEAN_KEYS = {
    enabled: true,
    enemyEnabled: true,
    enemyVisible: true,
    enemyTeamHigh: true,
    excludeBuildings: true,
    excludeBosses: true,
    allyEnabled: true,
    allyVisible: true,
    readoutVisible: true,
    pipsVisible: true,
    precisePipsEnabled: true,
    levelsVisible: true,
    enemyPulseEnabled: true,
    enemyKillMarkerEnabled: true,
    enemyPulseColorEnabled: true,
    enemyPulseHideBar: true,
    enemyPulseReadout: true,
    enemyPulseReadoutModifiers: true,
    allyPulseEnabled: true,
    allyPulseColorEnabled: true,
  };
  var COLOR_KEYS = {
    enemyLow: true,
    enemyMid: true,
    enemyHigh: true,
    enemyHealing: true,
    enemyDelta: true,
    enemyBulletShield: true,
    allyLow: true,
    allyMid: true,
    allyHigh: true,
    allyHealing: true,
    allyDelta: true,
    allyBulletShield: true,
    ultCustom: true,
    readoutLow: true,
    readoutMid: true,
    readoutHigh: true,
    enemyPulseColor: true,
    enemyKillMarkerColor: true,
    allyPulseColor: true,
  };
  var COLOR_TITLES = {
    enemyLow: "ENEMY LOW",
    enemyMid: "ENEMY MID",
    enemyHigh: "ENEMY HIGH",
    enemyHealing: "ENEMY HEALING",
    enemyDelta: "ENEMY DAMAGE DELTA",
    enemyBulletShield: "ENEMY BULLET SHIELD",
    allyLow: "ALLY LOW",
    allyMid: "ALLY MID",
    allyHigh: "ALLY HIGH",
    allyHealing: "ALLY HEALING",
    allyDelta: "ALLY DAMAGE DELTA",
    allyBulletShield: "ALLY BULLET SHIELD",
    ultCustom: "ULTIMATE ICON",
    readoutLow: "HP NUMBER LOW",
    readoutMid: "HP NUMBER MID",
    readoutHigh: "HP NUMBER HIGH",
    enemyPulseColor: "ENEMY PULSE COLOR",
    enemyKillMarkerColor: "ENEMY KILL MARKER COLOR",
    allyPulseColor: "ALLY PULSE COLOR",
  };

  var context = $.GetContextPanel();
  var state = {
    booted: false,
    open: false,
    peeking: false,
    categoryIndex: 0,
    tabIndex: 0,
    revision: 0,
    values: copyValues(DEFAULTS),
    scopes: [],
    effectiveValues: copyValues(DEFAULTS),
    effectiveValuesRaw: "",
    history: [],
    userPresets: [],
    pendingPresetId: null,
  };
  var replayGeneration = 0;
  var replayRunning = false;
  var replayDispatches = 0;
  var serializedSnapshotRaw = "";
  var serializedReplayPayload = "";
  var scopeResolutionPending = false;

  var picker = {
    key: "",
    hue: 0,
    saturation: 0,
    lightness: 100,
    returnPanel: null,
  };
  var ui = {
    categoryButtons: [],
    tabButtons: [],
    tabLabels: [],
    settingsPages: [],
    precisePipsToggle: null,
    precisePipsDialog: null,
    precisePipsDialogTitle: null,
    precisePipsDialogMessage: null,
    precisePipsDialogCommands: null,
    precisePipsCopyLabel: null,
    precisePipsCopyButton: null,
    precisePipsCloseButton: null,
    enemyKillMarkerToggle: null,
    enemyKillMarkerThresholdRow: null,
    enemyKillMarkerThresholdSlider: null,
    enemyKillMarkerThresholdEntry: null,
    enemyKillMarkerWidthRow: null,
    enemyKillMarkerWidthSlider: null,
    enemyKillMarkerWidthEntry: null,
    enemyKillMarkerColorRow: null,
    enemyKillMarkerColorSwatch: null,
    enemyKillMarkerColorEntry: null,
    heroModeAuto: null,
    heroModeManual: null,
    heroModeOff: null,
    heroPhase: null,
    heroIdentity: null,
    heroDetail: null,
    heroManualRow: null,
    heroManualButton: null,
    heroManualValue: null,
    heroDialog: null,
    heroOptions: null,
    heroCloseButton: null,
    currentScopeOff: null,
    currentScopeAll: null,
    currentScopeSelected: null,
    currentScopeSummary: null,
    scopeDialog: null,
    scopeSearch: null,
    scopeOptions: null,
    scopeCloseButton: null,
    presetNameInput: null,
    presetSaveButton: null,
    presetOptions: null,
    presetFeedback: null,
  };
  var identity = {
    mode: HERO_MODE_AUTO,
    phase: HERO_PHASE_TRANSITIONING,
    status: "unknown",
    manualHeroKey: "",
    detectedHeroKey: "",
    effectiveHeroKey: "",
    candidateHeroKey: "",
    candidateSamples: 0,
    emptySamples: 0,
    sampledActive: false,
    lifecycleGeneration: 0,
    watchGeneration: 0,
    root: null,
    hud: null,
    topBar: null,
    localPlayer: null,
    heroNameLabel: null,
    gameTime: null,
    renderSignature: "",
    optionPanels: [],
  };
  var scopeOptionPanels = [];
  var syncingControls = false;
  var suppressedIdentityPresetId = "";

  function copyValues(source) {
    var result = {};
    for (var key in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
      result[key] =
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : DEFAULTS[key];
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

  function find(id) {
    try {
      return context && context.FindChildTraverse
        ? context.FindChildTraverse(id)
        : null;
    } catch (error) {
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
      } catch (error) {
        break;
      }
    }
    return last;
  }

  function setClass(panel, className, enabled) {
    if (!isValid(panel)) return;
    try {
      panel.SetHasClass(className, !!enabled);
    } catch (error) {}
  }

  function setEnabled(panel, enabled) {
    if (!isValid(panel)) return;
    try {
      panel.enabled = !!enabled;
      panel.SetHasClass("Disabled", !enabled);
    } catch (error) {}
  }

  function setText(panel, value) {
    if (!isValid(panel)) return;
    try {
      if (panel.text !== value) panel.text = value;
    } catch (error) {}
  }

  function setPanelEvent(panel, eventName, handler) {
    if (!isValid(panel)) return;
    try {
      panel.SetPanelEvent(eventName, handler);
    } catch (error) {}
  }

  function focus(panel) {
    if (!isValid(panel)) return;
    try {
      if (panel.SetFocus) panel.SetFocus();
    } catch (error) {}
  }

  function panelHasClass(panel, className) {
    if (!isValid(panel)) return false;
    try {
      return !!(panel.BHasClass && panel.BHasClass(className));
    } catch (error) {
      return false;
    }
  }

  function findChild(panel, id) {
    if (!isValid(panel)) return null;
    try {
      return panel.FindChildTraverse ? panel.FindChildTraverse(id) : null;
    } catch (error) {
      return null;
    }
  }

  function findChildrenWithClass(panel, className) {
    if (!isValid(panel)) return [];
    try {
      return panel.FindChildrenWithClassTraverse
        ? panel.FindChildrenWithClassTraverse(className) || []
        : [];
    } catch (error) {
      return [];
    }
  }

  function normalizeHeroRetailName(value) {
    return String(value || "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function parseGameTimeText(value) {
    var text = String(value || "").replace(/^\s+|\s+$/g, "");
    if (!text) return null;
    var negative = text.charAt(0) === "-";
    if (negative) text = text.slice(1);
    var parts = text.split(":");
    if (parts.length < 2 || parts.length > 3) return null;
    var seconds = 0;
    for (var index = 0; index < parts.length; index++) {
      if (!/^\d+$/.test(parts[index])) return null;
      seconds = seconds * 60 + Number(parts[index]);
    }
    return negative ? -seconds : seconds;
  }

  function readPanelText(panel) {
    if (!isValid(panel)) return "";
    try {
      return String(panel.text || "");
    } catch (error) {
      return "";
    }
  }

  function clearIdentityPanelRefs() {
    identity.hud = null;
    identity.topBar = null;
    identity.localPlayer = null;
    identity.heroNameLabel = null;
    identity.gameTime = null;
  }

  function identitySignalHasClass(className) {
    return (
      panelHasClass(identity.root, className) ||
      panelHasClass(identity.hud, className)
    );
  }

  function resolveIdentityRoot() {
    if (!isValid(ui.absoluteRoot)) return false;
    if (identity.root !== ui.absoluteRoot) {
      identity.root = ui.absoluteRoot;
      clearIdentityPanelRefs();
    }
    if (!isValid(identity.hud)) {
      identity.hud =
        String(identity.root.id || "") === "Hud"
          ? identity.root
          : findChild(identity.root, "Hud");
    }
    return true;
  }

  function readGameTimeSec() {
    if (isValid(identity.gameTime)) {
      var cached = parseGameTimeText(readPanelText(identity.gameTime));
      if (cached !== null) return cached;
      identity.gameTime = null;
    }
    if (!isValid(identity.topBar))
      identity.topBar = findChild(identity.root, "TopBar");
    var direct = findChild(identity.topBar, "GameTime");
    var directValue = parseGameTimeText(readPanelText(direct));
    if (directValue !== null) {
      identity.gameTime = direct;
      return directValue;
    }
    var candidates = findChildrenWithClass(identity.topBar, "GameTime");
    for (var index = 0; index < candidates.length; index++) {
      var value = parseGameTimeText(readPanelText(candidates[index]));
      if (value === null) continue;
      identity.gameTime = candidates[index];
      return value;
    }
    return null;
  }

  function readLifecyclePhase() {
    if (!resolveIdentityRoot()) return HERO_PHASE_TRANSITIONING;
    if (identitySignalHasClass("connectedToHideout"))
      return HERO_PHASE_LOBBY;
    if (
      identitySignalHasClass("GameStatePostGame") ||
      identitySignalHasClass("GameStatePostGamePlayOfTheGame")
    )
      return HERO_PHASE_POST_MATCH;
    if (
      identitySignalHasClass("GameStatePreGame") ||
      identitySignalHasClass("GameStatePreGameWait") ||
      identitySignalHasClass("GameStatePreGameHeroDraft")
    )
      return HERO_PHASE_LOBBY;
    var gameTime = readGameTimeSec();
    return gameTime !== null && gameTime >= 0
      ? HERO_PHASE_ACTIVE
      : HERO_PHASE_TRANSITIONING;
  }

  function resolveHeroNameLabel() {
    if (!resolveIdentityRoot()) return null;
    if (!isValid(identity.topBar))
      identity.topBar = findChild(identity.root, "TopBar");
    if (!isValid(identity.topBar)) return null;
    if (
      isValid(identity.localPlayer) &&
      panelHasClass(identity.localPlayer, "LocalPlayer") &&
      isValid(identity.heroNameLabel)
    )
      return identity.heroNameLabel;
    identity.localPlayer = null;
    identity.heroNameLabel = null;
    var candidates = findChildrenWithClass(identity.topBar, "LocalPlayer");
    for (var index = 0; index < candidates.length; index++) {
      var nameContainer = findChild(candidates[index], "PlayerNameNWContainer");
      var labels = findChildrenWithClass(nameContainer, "HeroName");
      if (!labels.length || !isValid(labels[0])) continue;
      identity.localPlayer = candidates[index];
      identity.heroNameLabel = labels[0];
      return identity.heroNameLabel;
    }
    return null;
  }

  function detectLocalHeroKey() {
    var nameLabel = resolveHeroNameLabel();
    var retailName = normalizeHeroRetailName(readPanelText(nameLabel));
    return Object.prototype.hasOwnProperty.call(
      HERO_BY_RETAIL_NAME,
      retailName,
    )
      ? HERO_BY_RETAIL_NAME[retailName]
      : "";
  }

  function clearAutoIdentity() {
    identity.detectedHeroKey = "";
    identity.candidateHeroKey = "";
    identity.candidateSamples = 0;
    identity.emptySamples = 0;
    identity.sampledActive = false;
  }

  function updateEffectiveHero() {
    var previousHeroKey = identity.effectiveHeroKey;
    if (identity.mode === HERO_MODE_OFF) {
      identity.status = "off";
      identity.effectiveHeroKey = "";
    } else if (identity.mode === HERO_MODE_MANUAL) {
      identity.effectiveHeroKey = Object.prototype.hasOwnProperty.call(
        HERO_BY_KEY,
        identity.manualHeroKey,
      )
        ? identity.manualHeroKey
        : "";
      identity.status = identity.effectiveHeroKey ? "overridden" : "unknown";
    } else {
      identity.effectiveHeroKey =
        identity.phase === HERO_PHASE_ACTIVE ? identity.detectedHeroKey : "";
      identity.status = identity.effectiveHeroKey
        ? "detected"
        : identity.candidateHeroKey
          ? "settling"
          : "unknown";
    }
    return previousHeroKey !== identity.effectiveHeroKey;
  }

  function sampleAutoHero() {
    var nextHeroKey = detectLocalHeroKey();
    if (!nextHeroKey) {
      identity.emptySamples += 1;
      identity.candidateHeroKey = "";
      identity.candidateSamples = 0;
      identity.sampledActive =
        identity.emptySamples >= HERO_SETTLE_SAMPLES;
      if (identity.sampledActive) identity.detectedHeroKey = "";
      return;
    }
    identity.emptySamples = 0;
    identity.sampledActive = true;
    if (nextHeroKey === identity.detectedHeroKey) {
      identity.candidateHeroKey = "";
      identity.candidateSamples = 0;
      return;
    }
    if (nextHeroKey !== identity.candidateHeroKey) {
      identity.candidateHeroKey = nextHeroKey;
      identity.candidateSamples = 1;
      return;
    }
    identity.candidateSamples += 1;
    if (identity.candidateSamples >= HERO_SETTLE_SAMPLES) {
      identity.detectedHeroKey = identity.candidateHeroKey;
      identity.candidateHeroKey = "";
      identity.candidateSamples = 0;
    }
  }

  function heroDisplayName(heroKey) {
    return Object.prototype.hasOwnProperty.call(HERO_BY_KEY, heroKey)
      ? HERO_BY_KEY[heroKey]
      : "";
  }

  function phaseDisplayName() {
    if (identity.phase === HERO_PHASE_LOBBY) return "LOBBY";
    if (identity.phase === HERO_PHASE_ACTIVE) return "ACTIVE";
    if (identity.phase === HERO_PHASE_POST_MATCH) return "POST MATCH";
    return "TRANSITIONING";
  }

  function syncHeroOptionSelection() {
    for (var index = 0; index < identity.optionPanels.length; index++) {
      var option = identity.optionPanels[index];
      var key = "";
      try {
        key = option.GetAttributeString("hp_colors_hero_key", "");
      } catch (error) {}
      setClass(option, "Selected", key === identity.manualHeroKey);
    }
  }

  function pendingScopeCanResolve() {
    if (!scopeResolutionPending) return false;
    if (identity.mode !== HERO_MODE_AUTO) return true;
    if (
      identity.phase === HERO_PHASE_LOBBY ||
      identity.phase === HERO_PHASE_POST_MATCH
    )
      return true;
    if (identity.phase !== HERO_PHASE_ACTIVE) return false;
    return (
      identity.sampledActive &&
      (!identity.candidateHeroKey || !!identity.effectiveHeroKey)
    );
  }

  function renderIdentity() {
    var heroChanged = updateEffectiveHero();
    var appliedPendingPreset =
      state.booted && state.pendingPresetId && tryApplyPendingPreset();
    var appliedIdentityPreset =
      state.booted &&
      !appliedPendingPreset &&
      heroChanged &&
      tryApplyIdentityPreset();
    if (
      state.booted &&
      !appliedPendingPreset &&
      !appliedIdentityPreset &&
      (heroChanged || pendingScopeCanResolve())
    ) {
      scopeResolutionPending = false;
      reconcileEffective("*");
    }
    var signature = [
      identity.phase,
      identity.mode,
      identity.status,
      identity.detectedHeroKey,
      identity.candidateHeroKey,
      identity.manualHeroKey,
      identity.effectiveHeroKey,
    ].join("|");
    if (signature === identity.renderSignature) return;
    identity.renderSignature = signature;

    var identityText = "HERO: UNKNOWN";
    var detailText =
      "No stable local hero is available. Hero-scoped state will not be selected.";
    if (identity.mode === HERO_MODE_OFF) {
      identityText = "HERO DETECTION OFF";
      detailText = "Hero identity is disabled.";
    } else if (identity.mode === HERO_MODE_MANUAL) {
      var manualName = heroDisplayName(identity.effectiveHeroKey);
      if (manualName) {
        identityText = "HERO: " + manualName + " (MANUAL)";
        detailText = "Stable ID: " + identity.effectiveHeroKey;
      } else {
        detailText = "Choose a hero for Manual Override.";
      }
    } else if (identity.status === "detected") {
      var detectedName = heroDisplayName(identity.detectedHeroKey);
      identityText = "HERO: " + detectedName;
      detailText = "Stable ID: " + identity.detectedHeroKey;
    } else if (identity.status === "settling") {
      identityText =
        "HERO: SETTLING — " + heroDisplayName(identity.candidateHeroKey);
      detailText = "Waiting for a second matching local-HUD sample.";
    } else if (identity.phase !== HERO_PHASE_ACTIVE) {
      detailText = "Auto detection waits for an active match.";
    }
    setClass(
      ui.heroModeAuto,
      "Selected",
      identity.mode === HERO_MODE_AUTO,
    );
    setClass(
      ui.heroModeManual,
      "Selected",
      identity.mode === HERO_MODE_MANUAL,
    );
    setClass(ui.heroModeOff, "Selected", identity.mode === HERO_MODE_OFF);
    setClass(
      ui.heroManualRow,
      "Active",
      identity.mode === HERO_MODE_MANUAL,
    );
    setText(ui.heroPhase, "MATCH: " + phaseDisplayName());
    setText(ui.heroIdentity, identityText);
    setText(ui.heroDetail, detailText);
    setText(
      ui.heroManualValue,
      heroDisplayName(identity.manualHeroKey) || "SELECT HERO",
    );
    $.Msg(
      "[HP Colors Rewrite] identity phase=" +
        identity.phase +
        " mode=" +
        identity.mode +
        " status=" +
        identity.status +
        " detected=" +
        (identity.detectedHeroKey || "<unknown>") +
        " effective=" +
        (identity.effectiveHeroKey || "<none>") +
        " generation=" +
        identity.lifecycleGeneration,
    );
  }

  function identityPollDelay() {
    return identity.phase === HERO_PHASE_LOBBY ||
      identity.phase === HERO_PHASE_POST_MATCH
      ? HERO_POLL_INACTIVE_SEC
      : HERO_POLL_ACTIVE_SEC;
  }

  function scheduleIdentityTick(generation, delay) {
    try {
      $.Schedule(delay, function identityTick() {
        if (
          generation !== identity.watchGeneration ||
          !isValid(ui.absoluteRoot)
        )
          return;
        var nextPhase = readLifecyclePhase();
        if (nextPhase !== identity.phase) {
          identity.phase = nextPhase;
          identity.lifecycleGeneration += 1;
          clearIdentityPanelRefs();
          clearAutoIdentity();
          renderIdentity();
          restartIdentityWatch();
          return;
        }
        if (
          identity.mode === HERO_MODE_AUTO &&
          identity.phase === HERO_PHASE_ACTIVE
        )
          sampleAutoHero();
        renderIdentity();
        scheduleIdentityTick(generation, identityPollDelay());
      });
    } catch (error) {}
  }

  function restartIdentityWatch() {
    identity.watchGeneration += 1;
    scheduleIdentityTick(identity.watchGeneration, 0);
  }

  function closeHeroDialog() {
    if (!isValid(ui.heroDialog) || !ui.heroDialog.BHasClass("Open")) return;
    setClass(ui.heroDialog, "Open", false);
    focus(ui.heroManualButton);
  }

  function openHeroDialog() {
    if (identity.mode !== HERO_MODE_MANUAL) return;
    closeTransferDialog();
    closeScopeDialog();
    closePicker();
    closePrecisePipsDialog();
    syncHeroOptionSelection();
    setClass(ui.heroDialog, "Open", true);
    focus(ui.heroDialog);
  }

  function selectManualHero(heroKey) {
    if (!Object.prototype.hasOwnProperty.call(HERO_BY_KEY, heroKey)) return;
    identity.manualHeroKey = heroKey;
    renderIdentity();
    closeHeroDialog();
  }

  function setHeroMode(mode) {
    if (
      mode !== HERO_MODE_AUTO &&
      mode !== HERO_MODE_MANUAL &&
      mode !== HERO_MODE_OFF
    )
      mode = HERO_MODE_AUTO;
    if (identity.mode === mode) return;
    identity.mode = mode;
    closeHeroDialog();
    clearAutoIdentity();
    renderIdentity();
  }

  function createHeroOptions() {
    if (!isValid(ui.heroOptions)) return false;
    for (var index = 0; index < HERO_DATA.length; index++) {
      (function (heroKey, heroName, optionIndex) {
        var option = $.CreatePanel(
          "Button",
          ui.heroOptions,
          "HPColorsHeroOption" + optionIndex,
        );
        var label = $.CreatePanel(
          "Label",
          option,
          "HPColorsHeroOptionLabel" + optionIndex,
        );
        if (!isValid(option) || !isValid(label)) return;
        option.AddClass("HPColorsHeroOption");
        option.SetAttributeString("hp_colors_hero_key", heroKey);
        label.text = heroName;
        setPanelEvent(option, "onactivate", function () {
          selectManualHero(heroKey);
        });
        identity.optionPanels.push(option);
      })(HERO_DATA[index][0], HERO_DATA[index][1], index);
    }
    return identity.optionPanels.length === HERO_DATA.length;
  }
  function currentScopeRow() {
    for (var index = 0; index < state.scopes.length; index++) {
      if (state.scopes[index].id === CURRENT_SCOPE_ID)
        return state.scopes[index];
    }
    return null;
  }

  function replaceCurrentScope(mode, heroes, values) {
    cancelPendingPreset();
    var rows = [
      {
        id: CURRENT_SCOPE_ID,
        mode: mode,
        heroes: heroes,
        values: values,
      },
    ];
    for (var index = 0; index < state.scopes.length; index++) {
      if (state.scopes[index].id !== CURRENT_SCOPE_ID)
        rows.push(state.scopes[index]);
    }
    state.scopes = normalizeScopes(rows);
    writeMenuState();
    reconcileEffective("*", true);
    renderCurrentScope();
  }


  function setCurrentScopeMode(mode) {
    var row = currentScopeRow();
    replaceCurrentScope(
      mode,
      [],
      row ? row.values : copyValues(state.values),
    );
  }

  function toggleCurrentScopeHero(heroKey) {
    if (!Object.prototype.hasOwnProperty.call(HERO_BY_KEY, heroKey)) return;
    var row = currentScopeRow();
    var heroes = row ? row.heroes.slice(0) : [];
    var found = false;
    var next = [];
    for (var index = 0; index < heroes.length; index++) {
      if (heroes[index] === heroKey) found = true;
      else next.push(heroes[index]);
    }
    if (!found) next.push(heroKey);
    replaceCurrentScope(
      next.length ? HERO_SCOPE_SELECTED : HERO_SCOPE_OFF,
      next,
      row ? row.values : state.values,
    );
  }


  function filterScopeHeroOptions() {
    var query = String((ui.scopeSearch && ui.scopeSearch.text) || "")
      .trim()
      .toUpperCase();
    for (var index = 0; index < scopeOptionPanels.length; index++) {
      var option = scopeOptionPanels[index];
      var searchText = "";
      try {
        searchText = option.GetAttributeString(
          "hp_colors_scope_search",
          "",
        );
      } catch (error) {}
      setClass(option, "FilteredOut", !!query && searchText.indexOf(query) < 0);
    }
  }

  function renderCurrentScope() {
    var row = currentScopeRow();
    var mode = row ? row.mode : HERO_SCOPE_OFF;
    setClass(ui.currentScopeOff, "Selected", mode === HERO_SCOPE_OFF);
    setClass(ui.currentScopeAll, "Selected", mode === HERO_SCOPE_ALL);
    setClass(
      ui.currentScopeSelected,
      "Selected",
      mode === HERO_SCOPE_SELECTED,
    );
    var summary = "OFF";
    if (mode === HERO_SCOPE_ALL) summary = "ALL HEROES";
    else if (mode === HERO_SCOPE_SELECTED) {
      var names = [];
      for (var index = 0; index < row.heroes.length; index++)
        names.push(heroDisplayName(row.heroes[index]));
      summary = names.join(", ");
    }
    setText(ui.currentScopeSummary, summary);
    for (var optionIndex = 0; optionIndex < scopeOptionPanels.length; optionIndex++) {
      var option = scopeOptionPanels[optionIndex];
      var heroKey = "";
      try {
        heroKey = option.GetAttributeString(
          "hp_colors_scope_hero_key",
          "",
        );
      } catch (error) {}
      setClass(
        option,
        "Selected",
        mode === HERO_SCOPE_SELECTED && row.heroes.indexOf(heroKey) >= 0,
      );
    }
  }

  function closeScopeDialog() {
    if (!isValid(ui.scopeDialog) || !ui.scopeDialog.BHasClass("Open")) return;
    setClass(ui.scopeDialog, "Open", false);
    focus(ui.currentScopeSelected);
  }

  function openScopeDialog() {
    closeTransferDialog();
    closeHeroDialog();
    closePicker();
    closePrecisePipsDialog();
    if (isValid(ui.scopeSearch)) ui.scopeSearch.text = "";
    filterScopeHeroOptions();
    renderCurrentScope();
    setClass(ui.scopeDialog, "Open", true);
    focus(ui.scopeSearch);
  }

  function createScopeHeroOptions() {
    if (!isValid(ui.scopeOptions)) return false;
    for (var index = 0; index < HERO_DATA.length; index++) {
      (function (heroKey, heroName, optionIndex) {
        var option = $.CreatePanel(
          "Button",
          ui.scopeOptions,
          "HPColorsScopeHeroOption" + optionIndex,
        );
        var label = $.CreatePanel(
          "Label",
          option,
          "HPColorsScopeHeroOptionLabel" + optionIndex,
        );
        if (!isValid(option) || !isValid(label)) return;
        option.AddClass("HPColorsHeroOption");
        option.AddClass("HPColorsScopeHeroOption");
        option.SetAttributeString("hp_colors_scope_hero_key", heroKey);
        option.SetAttributeString(
          "hp_colors_scope_search",
          (heroName + " " + heroKey).toUpperCase(),
        );
        label.text = heroName;
        setPanelEvent(option, "onactivate", function () {
          toggleCurrentScopeHero(heroKey);
        });
        scopeOptionPanels.push(option);
      })(HERO_DATA[index][0], HERO_DATA[index][1], index);
    }
    return scopeOptionPanels.length === HERO_DATA.length;
  }

  function setPresetFeedback(text, isError) {
    setText(ui.presetFeedback, text || "");
    setClass(ui.presetFeedback, "Error", !!isError);
  }

  function presetScopeSummary(preset) {
    if (preset.mode === HERO_SCOPE_ALL) return "ALL HEROES";
    if (preset.mode !== HERO_SCOPE_SELECTED) return "GLOBAL";
    var names = [];
    for (var index = 0; index < preset.heroes.length; index++)
      names.push(heroDisplayName(preset.heroes[index]));
    return names.join(", ");
  }

  function presetMatchesCurrentScope(preset) {
    var row = currentScopeRow();
    if (preset.mode === HERO_SCOPE_OFF)
      return !row && JSON.stringify(preset.values) === valuesRaw();
    if (!row || row.mode !== preset.mode) return false;
    return (
      JSON.stringify(row.heroes) === JSON.stringify(preset.heroes) &&
      JSON.stringify(row.values) === JSON.stringify(preset.values)
    );
  }

  function renderPresetOptions() {
    if (!isValid(ui.presetOptions)) return;
    try {
      ui.presetOptions.RemoveAndDeleteChildren();
    } catch (error) {}
    var records = presetRecords();
    for (var index = 0; index < records.length; index++) {
      (function (preset, optionIndex) {
        var option = $.CreatePanel(
          "Button",
          ui.presetOptions,
          "HPColorsPresetOption" + optionIndex,
        );
        var name = $.CreatePanel(
          "Label",
          option,
          "HPColorsPresetOptionName" + optionIndex,
        );
        var scope = $.CreatePanel(
          "Label",
          option,
          "HPColorsPresetOptionScope" + optionIndex,
        );
        if (!isValid(option) || !isValid(name) || !isValid(scope)) return;
        option.AddClass("HPColorsPresetOption");
        option.AddClass(
          preset.kind === "baked"
            ? "HPColorsPresetBaked"
            : "HPColorsPresetSession",
        );
        option.SetAttributeString("hp_colors_preset_id", preset.id);
        setClass(option, "Selected", presetMatchesCurrentScope(preset));
        name.AddClass("HPColorsPresetOptionName");
        scope.AddClass("HPColorsPresetOptionScope");
        name.text =
          preset.name +
          (preset.kind === "baked" ? "  ·  BAKED" : "  ·  SESSION");
        scope.text =
          (preset.mode === HERO_SCOPE_SELECTED ? "AUTO  ·  " : "") +
          presetScopeSummary(preset);
        setPanelEvent(option, "onactivate", function () {
          requestPresetApplication(preset.id);
        });
      })(records[index], index);
    }
  }

  function nextUserPresetId() {
    var nextNumber = 1;
    for (var index = 0; index < state.userPresets.length; index++) {
      var match = /^user_(\d+)$/.exec(state.userPresets[index].id);
      if (match)
        nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
    }
    var suffix = String(nextNumber);
    while (suffix.length < 4) suffix = "0" + suffix;
    return "user_" + suffix;
  }

  function saveCurrentPreset() {
    var name = String((ui.presetNameInput && ui.presetNameInput.text) || "").trim();
    if (!name) {
      setPresetFeedback("ENTER A PRESET NAME.", true);
      return;
    }
    var row = currentScopeRow();
    var mode = row ? row.mode : HERO_SCOPE_OFF;
    var preset = normalizePresetRecord(
      {
        id: nextUserPresetId(),
        name: name,
        values: state.values,
        mode: mode,
        heroes: row ? row.heroes : [],
      },
      "user",
    );
    if (!preset) {
      setPresetFeedback("PRESET COULD NOT BE SAVED.", true);
      return;
    }
    state.userPresets.push(preset);
    writeMenuState();
    if (isValid(ui.presetNameInput)) ui.presetNameInput.text = "";
    renderPresetOptions();
    setPresetFeedback("SAVED " + preset.name.toUpperCase() + ".", false);
    $.Msg(
      "[HP Colors Rewrite] preset saved id=" +
        preset.id +
        " mode=" +
        preset.mode,
    );
  }

  function removeCurrentScope() {
    var rows = [];
    for (var index = 0; index < state.scopes.length; index++) {
      if (state.scopes[index].id !== CURRENT_SCOPE_ID)
        rows.push(state.scopes[index]);
    }
    return rows;
  }

  function applyPresetRecord(preset, source) {
    if (!preset) return false;
    var rows = removeCurrentScope();
    if (preset.mode === HERO_SCOPE_OFF) {
      var currentRaw = valuesRaw();
      var nextValues = normalizeValues(preset.values);
      if (JSON.stringify(nextValues) !== currentRaw) pushHistory(currentRaw);
      state.values = nextValues;
    } else {
      rows.unshift({
        id: CURRENT_SCOPE_ID,
        mode: preset.mode,
        heroes: preset.heroes,
        values: preset.values,
      });
    }
    state.scopes = normalizeScopes(rows);
    state.pendingPresetId = null;
    writeMenuState();
    reconcileEffective("*", true);
    if (state.open) renderPresetOptions();
    setPresetFeedback(
      (source === "identity" ? "AUTO-MATCHED " : "APPLIED ") +
        preset.name.toUpperCase() +
        ".",
      false,
    );
    $.Msg(
      "[HP Colors Rewrite] preset applied id=" +
        preset.id +
        " mode=" +
        preset.mode +
        " source=" +
        (source || "user") +
        " hero=" +
        (identity.effectiveHeroKey || "<none>"),
    );
    if (state.open) syncControls();
    return true;
  }

  function requestPresetApplication(id) {
    var preset = findPresetRecord(String(id || ""));
    if (!preset) {
      setPresetFeedback("PRESET NOT FOUND.", true);
      return;
    }
    if (preset.mode === HERO_SCOPE_SELECTED) {
      var heroKey = identity.effectiveHeroKey;
      if (!heroKey) {
        state.pendingPresetId = preset.id;
        writeMenuState();
        setPresetFeedback("WAITING FOR A STABLE HERO IDENTITY.", false);
        return;
      }
      if (preset.heroes.indexOf(heroKey) < 0) {
        state.pendingPresetId = null;
        writeMenuState();
        setPresetFeedback("CURRENT HERO DOES NOT MATCH THIS PRESET.", true);
        return;
      }
    }
    applyPresetRecord(preset, "user");
  }

  function tryApplyPendingPreset() {
    if (!state.pendingPresetId) return false;
    var heroKey = identity.effectiveHeroKey;
    if (!heroKey) return false;
    var preset = findPresetRecord(state.pendingPresetId);
    if (!preset) {
      state.pendingPresetId = null;
      writeMenuState();
      setPresetFeedback("PENDING PRESET NOT FOUND.", true);
      return false;
    }
    if (preset.heroes.indexOf(heroKey) < 0) {
      state.pendingPresetId = null;
      writeMenuState();
      setPresetFeedback("CURRENT HERO DOES NOT MATCH THIS PRESET.", true);
      return false;
    }
    return applyPresetRecord(preset, "pending");
  }

  function tryApplyIdentityPreset() {
    var heroKey = identity.effectiveHeroKey;
    if (!heroKey) return false;
    if (suppressedIdentityPresetId) {
      var suppressed = findPresetRecord(suppressedIdentityPresetId);
      var suppressCurrentMatch =
        suppressed &&
        suppressed.mode === HERO_SCOPE_SELECTED &&
        suppressed.heroes.indexOf(heroKey) >= 0;
      suppressedIdentityPresetId = "";
      if (suppressCurrentMatch) return false;
    }
    var current = currentScopeRow();
    var allFallback = null;
    for (var index = 0; index < state.userPresets.length; index++) {
      var preset = state.userPresets[index];
      if (
        preset.mode === HERO_SCOPE_SELECTED &&
        preset.heroes.indexOf(heroKey) >= 0
      ) {
        if (presetMatchesCurrentScope(preset)) return false;
        return applyPresetRecord(preset, "identity");
      }
      if (!allFallback && preset.mode === HERO_SCOPE_ALL)
        allFallback = preset;
    }
    if (current && scopeTargetsHero(current, heroKey)) return false;
    if (allFallback && !presetMatchesCurrentScope(allFallback))
      return applyPresetRecord(allFallback, "identity");
    if (current && current.mode === HERO_SCOPE_SELECTED)
      return applyPresetRecord(
        findPresetRecord(DEFAULT_PRESET_ID),
        "identity",
      );
    return false;
  }

  function cancelPendingPreset() {
    if (!state.pendingPresetId) return;
    suppressedIdentityPresetId = state.pendingPresetId;
    state.pendingPresetId = null;
    setPresetFeedback("PENDING PRESET CANCELED.", false);
  }

  function closePrecisePipsDialog() {
    setClass(ui.precisePipsDialog, "Open", false);
    focus(ui.precisePipsToggle);
  }

  function openPrecisePipsDialog(enabled) {
    closeHeroDialog();
    setText(
      ui.precisePipsDialogTitle,
      enabled ? "ENABLE PRECISE PIPS" : "REMOVE PRECISE PIP CONFIG",
    );
    setText(
      ui.precisePipsDialogMessage,
      enabled
        ? "Copy these lines into the ConVars block in gameinfo.gi. HP Colors cannot apply or verify this game configuration."
        : "If you do not plan to use precise pips, copy these default lines into the ConVars block in gameinfo.gi, or delete the custom precise-pip entries.",
    );
    setText(
      ui.precisePipsDialogCommands,
      enabled ? PRECISE_PIPS_ENABLE_TEXT : PRECISE_PIPS_RESET_TEXT,
    );
    setText(ui.precisePipsCopyLabel, "COPY");
    setClass(ui.precisePipsDialog, "Open", true);
    focus(ui.precisePipsDialog);
  }

  function copyPrecisePipsText() {
    var text = state.values.precisePipsEnabled
      ? PRECISE_PIPS_ENABLE_TEXT
      : PRECISE_PIPS_RESET_TEXT;
    var copied = false;
    try {
      copied = $.DispatchEvent("CopyStringToClipboard", text) !== false;
    } catch (error) {}
    setText(ui.precisePipsCopyLabel, copied ? "COPIED" : "COPY FAILED");
  }

  function togglePrecisePips() {
    if (syncingControls) return;
    var enabled = !state.values.precisePipsEnabled;
    commitValue("precisePipsEnabled", enabled, true);
    openPrecisePipsDialog(enabled);
  }
  function setTransferFeedback(message, isError) {
    setText(ui.transferFeedback, message);
    setClass(ui.transferDialog, "Error", !!isError);
  }

  function serializeSettingsExport() {
    var pairs = [];
    for (var index = 0; index < DEFAULT_KEYS.length; index++) {
      var key = DEFAULT_KEYS[index];
      if (state.values[key] !== DEFAULTS[key])
        pairs.push([index, state.values[key]]);
    }
    return "HPCR2" + JSON.stringify(pairs);
  }

  function closeTransferDialog() {
    if (!isValid(ui.transferDialog) || !ui.transferDialog.BHasClass("Open"))
      return;
    setClass(ui.transferDialog, "Open", false);
    setClass(ui.transferDialog, "Error", false);
    setText(ui.transferInput, "");
    focus(ui.transferButton);
  }

  function copyCurrentSettings() {
    var code = serializeSettingsExport();
    var copied = false;
    setText(ui.transferInput, code);
    try {
      focus(ui.transferInput);
      if (typeof ui.transferInput.SelectAll === "function")
        ui.transferInput.SelectAll();
      copied =
        $.DispatchEvent("TextEntryCopyToClipboard", ui.transferInput) !== false;
    } catch (textEntryError) {}
    if (!copied) {
      try {
        copied = $.DispatchEvent("CopyStringToClipboard", code) !== false;
      } catch (stringError) {}
    }
    setText(ui.transferInput, "");
    setTransferFeedback(
      copied
        ? "CURRENT SETTINGS COPIED"
        : "COPY FAILED — SETTINGS CODE NOT COPIED",
      !copied,
    );
    return copied;
  }

  function openTransferDialog() {
    closePicker();
    closePrecisePipsDialog();
    closeHeroDialog();
    setText(ui.transferInput, "");
    setClass(ui.transferDialog, "Open", true);
    setTransferFeedback(
      "READY — CHOOSE COPY CURRENT OR IMPORT & APPLY",
      false,
    );
    focus(ui.transferInput);
  }

  function validateImportedValues(values) {
    var enumValues = {
      enemyMode: { fixed: true, gradient: true },
      allyMode: { fixed: true, gradient: true },
      readoutMode: { fixed: true, gradient: true },
      enemyPulseColorMode: { fixed: true, gradient: true },
      ultMode: { follow: true, custom: true },
      readoutFormat: { hp: true, percent: true, current: true },
      readoutColorMode: { bar: true, custom: true },
      readoutFont: { default: true, oracle: true, pulp: true },
    };
    for (var key in values) {
      if (
        !Object.prototype.hasOwnProperty.call(values, key) ||
        !Object.prototype.hasOwnProperty.call(DEFAULTS, key)
      )
        continue;
      var value = values[key];
      if (BOOLEAN_KEYS[key] && typeof value !== "boolean")
        return "INVALID SETTING: " + key;
      if (
        COLOR_KEYS[key] &&
        (typeof value !== "string" || !normalizeColor(value, ""))
      )
        return "INVALID SETTING: " + key;
      if (enumValues[key] && !enumValues[key][value])
        return "INVALID SETTING: " + key;
      if (
        typeof DEFAULTS[key] === "number" &&
        (typeof value !== "number" || !isFinite(value))
      )
        return "INVALID SETTING: " + key;
    }
    return "";
  }

  function parseSettingsImport(raw) {
    var text = String(raw || "").trim();
    if (text.slice(0, 5) !== "HPCR2")
      return { error: "NOT AN HPCR2 SETTINGS CODE" };
    var pairs = null;
    try {
      pairs = JSON.parse(text.slice(5));
    } catch (error) {
      return { error: "INVALID HPCR2 CODE" };
    }
    if (!Array.isArray(pairs)) return { error: "INVALID HPCR2 PAIRS" };
    var values = {};
    var seen = {};
    for (var pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
      var pair = pairs[pairIndex];
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== "number" ||
        !isFinite(pair[0]) ||
        Math.floor(pair[0]) !== pair[0] ||
        pair[0] < 0
      )
        return { error: "INVALID HPCR2 PAIR" };
      var index = pair[0];
      if (seen[index]) return { error: "DUPLICATE HPCR2 SETTING" };
      seen[index] = true;
      if (index >= DEFAULT_KEYS.length)
        return { error: "UNKNOWN HPCR2 SETTING" };
      values[DEFAULT_KEYS[index]] = pair[1];
    }
    var valueError = validateImportedValues(values);
    if (valueError) return { error: valueError };
    return { values: values };
  }

  function applyImportedText(raw, pasted) {
    var parsed = parseSettingsImport(raw);
    if (parsed.error) {
      setTransferFeedback(parsed.error, true);
      return;
    }
    if (!replaceValues(parsed.values, true)) {
      setTransferFeedback("SETTINGS ALREADY MATCH", false);
      return;
    }
    setText(ui.transferInput, "");
    setTransferFeedback(
      pasted ? "PASTED AND APPLIED" : "IMPORTED AND APPLIED",
      false,
    );
  }

  function showManualPasteFallback() {
    setTransferFeedback(
      "CLIPBOARD PASTE UNAVAILABLE — PASTE CODE MANUALLY",
      true,
    );
    focus(ui.transferInput);
  }

  function importLiveSettings() {
    var manual = String(ui.transferInput.text || "").trim();
    if (manual) {
      applyImportedText(manual, false);
      return;
    }
    var requested = false;
    try {
      requested =
        $.DispatchEvent("TextEntryInsertFromClipboard", ui.transferInput) !==
        false;
    } catch (error) {}
    if (!requested) {
      showManualPasteFallback();
      return;
    }
    var inserted = String(ui.transferInput.text || "").trim();
    if (inserted) {
      applyImportedText(inserted, true);
      return;
    }
    try {
      $.Schedule(0.05, function () {
        var pasted = String(ui.transferInput.text || "").trim();
        if (!pasted) {
          showManualPasteFallback();
          return;
        }
        applyImportedText(pasted, true);
      });
    } catch (error) {
      showManualPasteFallback();
    }
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

  function hexToHsl(hex) {
    var value = parseInt(normalizeColor(hex, "#FFFFFF").slice(1), 16);
    var red = ((value >> 16) & 255) / 255;
    var green = ((value >> 8) & 255) / 255;
    var blue = (value & 255) / 255;
    var max = Math.max(red, green, blue);
    var min = Math.min(red, green, blue);
    var delta = max - min;
    var lightness = (max + min) / 2;
    var hue = 0;
    var saturation = 0;
    if (delta) {
      saturation =
        delta / Math.max(0.0001, 1 - Math.abs(2 * lightness - 1));
      if (max === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (max === green) hue = 60 * ((blue - red) / delta + 2);
      else hue = 60 * ((red - green) / delta + 4);
      if (hue < 0) hue += 360;
    }
    return {
      hue: Math.round(hue) % 360,
      saturation: Math.round(saturation * 100),
      lightness: Math.round(lightness * 100),
    };
  }

  function hslToHex(hue, saturation, lightness) {
    var h = ((Number(hue) % 360) + 360) % 360;
    var s = Math.max(0, Math.min(100, Number(saturation))) / 100;
    var l = Math.max(0, Math.min(100, Number(lightness))) / 100;
    var chroma = (1 - Math.abs(2 * l - 1)) * s;
    var section = h / 60;
    var second = chroma * (1 - Math.abs((section % 2) - 1));
    var red = 0;
    var green = 0;
    var blue = 0;
    if (section < 1) {
      red = chroma;
      green = second;
    } else if (section < 2) {
      red = second;
      green = chroma;
    } else if (section < 3) {
      green = chroma;
      blue = second;
    } else if (section < 4) {
      green = second;
      blue = chroma;
    } else if (section < 5) {
      red = second;
      blue = chroma;
    } else {
      red = chroma;
      blue = second;
    }
    var match = l - chroma / 2;
    var packed =
      (Math.round((red + match) * 255) << 16) |
      (Math.round((green + match) * 255) << 8) |
      Math.round((blue + match) * 255);
    return "#" + ((1 << 24) | packed).toString(16).slice(1).toUpperCase();
  }


  function normalizeValue(key, value, values) {
    if (BOOLEAN_KEYS[key]) return !!value;
    if (COLOR_KEYS[key]) return normalizeColor(value, DEFAULTS[key]);
    if (
      key === "enemyMode" ||
      key === "allyMode" ||
      key === "readoutMode"
    )
      return value === "gradient" ? "gradient" : "fixed";
    if (key === "enemyPulseColorMode")
      return value === "fixed" ? "fixed" : "gradient";
    if (
      key === "enemyPulseThreshold" ||
      key === "allyPulseThreshold"
    )
      return clampNumber(value, 0, 100, 25);
    if (key === "enemyPulseBpm" || key === "allyPulseBpm")
      return clampNumber(value, 30, 300, 75);
    if (key === "enemyPulseIntensity" || key === "allyPulseIntensity")
      return clampNumber(value, 0, 2, 1);
    if (key === "enemyKillMarkerThreshold")
      return clampNumber(value, 5, 80, 25);
    if (key === "enemyKillMarkerWidth")
      return clampNumber(value, 1, 100, 3);
    if (key === "ultMode") return value === "custom" ? "custom" : "follow";
    if (
      key === "readoutFormat"
    )
      return value === "percent" || value === "current" ? value : "hp";
    if (key === "readoutColorMode")
      return value === "custom" ? "custom" : "bar";
    if (key === "readoutFont")
      return value === "oracle" || value === "pulp" ? value : "default";
    if (key === "readoutSize" || key === "enemyPulseReadoutSize")
      return clampNumber(value, 72, 320, DEFAULTS[key]);
    if (key === "readoutOffsetX" || key === "enemyPulseReadoutOffsetX")
      return clampNumber(value, -405, 405, DEFAULTS[key]);
    if (key === "readoutOffsetY" || key === "enemyPulseReadoutOffsetY")
      return clampNumber(value, -35, 840, DEFAULTS[key]);
    if (key === "widthScale" || key === "heightScale")
      return clampNumber(value, 60, 160, DEFAULTS[key]);
    if (key === "positionX")
      return clampNumber(value, -300, 300, DEFAULTS[key]);
    if (key === "positionY")
      return clampNumber(value, -200, 200, DEFAULTS[key]);
    if (key === "lowThreshold")
      return clampNumber(value, 0, (values || state.values).highThreshold - 1, 25);
    if (key === "highThreshold")
      return clampNumber(value, (values || state.values).lowThreshold + 1, 100, 65);
    return value;
  }

  function normalizeValues(source) {
    var values = copyValues(DEFAULTS);
    for (var key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      values[key] = normalizeValue(
        key,
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : DEFAULTS[key],
        values,
      );
    }
    values.lowThreshold = clampNumber(
      values.lowThreshold,
      0,
      values.highThreshold - 1,
      25,
    );
    values.highThreshold = clampNumber(
      values.highThreshold,
      values.lowThreshold + 1,
      100,
      65,
    );
    return values;
  }
  function normalizeHeroSelection(source) {
    var selected = {};
    var values = Array.isArray(source) ? source : [];
    for (var index = 0; index < values.length; index++) {
      var heroKey = String(values[index] || "");
      if (Object.prototype.hasOwnProperty.call(HERO_BY_KEY, heroKey))
        selected[heroKey] = true;
    }
    var result = [];
    for (var heroIndex = 0; heroIndex < HERO_DATA.length; heroIndex++) {
      var stableKey = HERO_DATA[heroIndex][0];
      if (selected[stableKey]) result.push(stableKey);
    }
    return result;
  }

  function normalizeScopeMode(mode, heroes) {
    if (mode === HERO_SCOPE_ALL) return HERO_SCOPE_ALL;
    if (mode === HERO_SCOPE_SELECTED && heroes.length)
      return HERO_SCOPE_SELECTED;
    return HERO_SCOPE_OFF;
  }

  function normalizeScopes(source) {
    var rows = Array.isArray(source) ? source : [];
    var result = [];
    var seenIds = {};
    for (var index = 0; index < rows.length; index++) {
      var row = rows[index];
      var id = String((row && row.id) || "");
      if (!id || seenIds[id]) continue;
      seenIds[id] = true;
      var heroes = normalizeHeroSelection(row.heroes);
      var mode = normalizeScopeMode(String(row.mode || ""), heroes);
      result.push({
        id: id,
        mode: mode,
        heroes: mode === HERO_SCOPE_SELECTED ? heroes : [],
        values: normalizeValues(row.values),
      });
    }
    return result;
  }

  function normalizePresetRecord(source, kind) {
    if (!source) return null;
    var id = String(source.id || "");
    var name = String(source.name || "").trim();
    if (!id || !name) return null;
    if (kind === "user" && !/^user_\d{4,}$/.test(id)) return null;
    var heroes = normalizeHeroSelection(source.heroes);
    var mode = normalizeScopeMode(String(source.mode || ""), heroes);
    return {
      id: id,
      kind: kind,
      name: name,
      values: normalizeValues(source.values),
      mode: mode,
      heroes: mode === HERO_SCOPE_SELECTED ? heroes : [],
    };
  }

  function normalizeUserPresets(source) {
    var rows = Array.isArray(source) ? source : [];
    var result = [];
    var seenIds = {};
    for (var bakedIndex = 0; bakedIndex < BAKED_PRESETS.length; bakedIndex++)
      seenIds[BAKED_PRESETS[bakedIndex].id] = true;
    for (var index = 0; index < rows.length; index++) {
      var preset = normalizePresetRecord(rows[index], "user");
      if (!preset || seenIds[preset.id]) continue;
      seenIds[preset.id] = true;
      result.push(preset);
    }
    return result;
  }

  function presetRecords() {
    var result = [];
    for (var bakedIndex = 0; bakedIndex < BAKED_PRESETS.length; bakedIndex++)
      result.push(BAKED_PRESETS[bakedIndex]);
    for (var userIndex = 0; userIndex < state.userPresets.length; userIndex++)
      result.push(state.userPresets[userIndex]);
    return result;
  }

  function findPresetRecord(id) {
    for (var bakedIndex = 0; bakedIndex < BAKED_PRESETS.length; bakedIndex++) {
      if (BAKED_PRESETS[bakedIndex].id === id)
        return BAKED_PRESETS[bakedIndex];
    }
    for (var userIndex = 0; userIndex < state.userPresets.length; userIndex++) {
      if (state.userPresets[userIndex].id === id)
        return state.userPresets[userIndex];
    }
    return null;
  }

  function scopeTargetsHero(scope, heroKey) {
    if (!heroKey || scope.mode !== HERO_SCOPE_SELECTED) return false;
    for (var index = 0; index < scope.heroes.length; index++) {
      if (scope.heroes[index] === heroKey) return true;
    }
    return false;
  }
  function hasSelectedScopes() {
    for (var index = 0; index < state.scopes.length; index++) {
      if (state.scopes[index].mode === HERO_SCOPE_SELECTED) return true;
    }
    return false;
  }


  function resolveEffectiveValues() {
    var heroKey = identity.effectiveHeroKey;
    for (var index = 0; index < state.scopes.length; index++) {
      if (scopeTargetsHero(state.scopes[index], heroKey))
        return state.scopes[index].values;
    }
    for (var fallbackIndex = 0; fallbackIndex < state.scopes.length; fallbackIndex++) {
      if (state.scopes[fallbackIndex].mode === HERO_SCOPE_ALL)
        return state.scopes[fallbackIndex].values;
    }
    return state.values;
  }


  function snapshotRaw() {
    return JSON.stringify({
      version: 1,
      revision: state.revision,
      values: state.effectiveValues,
    });
  }

  function serializeChange(settingId, raw) {
    return JSON.stringify({
      magic_word: CONFIG_MAGIC,
      version: 1,
      revision: state.revision,
      setting_id: settingId,
      value: settingId === "*" ? null : state.effectiveValues[settingId],
      values_raw: raw,
    });
  }

  function cacheReplayPayload(raw, replayPayload) {
    serializedSnapshotRaw = raw;
    serializedReplayPayload =
      replayPayload || serializeChange("*", raw);
  }

  function ensureReplayPayload() {
    if (serializedSnapshotRaw && serializedReplayPayload) return;
    cacheReplayPayload(snapshotRaw());
  }

  function readRootAttribute(name) {
    if (!isValid(ui.absoluteRoot) || !ui.absoluteRoot.GetAttributeString) return "";
    try {
      return String(ui.absoluteRoot.GetAttributeString(name, "") || "");
    } catch (error) {
      return "";
    }
  }

  function loadPublishedSnapshot() {
    var raw = readRootAttribute(CONFIG_ATTR);
    if (!raw) return false;
    try {
      var data = JSON.parse(raw);
      if (!data || data.version !== 1 || !data.values) return false;
      state.revision = Math.max(0, Math.round(Number(data.revision) || 0));
      state.effectiveValues = normalizeValues(data.values);
      state.effectiveValuesRaw = JSON.stringify(state.effectiveValues);
      cacheReplayPayload(snapshotRaw());
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadMenuState() {
    var raw = readRootAttribute(MENU_STATE_ATTR);
    if (!raw) return false;
    try {
      var data = JSON.parse(raw);
      if (!data || data.version !== 1 || !data.values) return false;
      state.values = normalizeValues(data.values);
      state.scopes = normalizeScopes(data.scopes);
      state.userPresets = normalizeUserPresets(data.userPresets);
      var pendingPresetId = String(data.pendingPresetId || "");
      state.pendingPresetId = findPresetRecord(pendingPresetId)
        ? pendingPresetId
        : null;
      return true;
    } catch (error) {
      return false;
    }
  }

  function writeMenuState() {
    if (!isValid(ui.absoluteRoot) || !ui.absoluteRoot.SetAttributeString)
      return false;
    var raw = JSON.stringify({
      version: 1,
      values: state.values,
      scopes: state.scopes,
      userPresets: state.userPresets,
      pendingPresetId: state.pendingPresetId,
    });
    try {
      if (
        !ui.absoluteRoot.GetAttributeString ||
        ui.absoluteRoot.GetAttributeString(MENU_STATE_ATTR, "") !== raw
      )
        ui.absoluteRoot.SetAttributeString(MENU_STATE_ATTR, raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  function writeRootSnapshot(raw) {
    if (!isValid(ui.absoluteRoot) || !ui.absoluteRoot.SetAttributeString) return false;
    try {
      if (
        !ui.absoluteRoot.GetAttributeString ||
        ui.absoluteRoot.GetAttributeString(CONFIG_ATTR, "") !== raw
      )
        ui.absoluteRoot.SetAttributeString(CONFIG_ATTR, raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  function dispatchChange(settingId, raw, serialized) {
    try {
      $.DispatchEvent(
        EVENT_CHANNEL,
        serialized || serializeChange(settingId, raw),
      );
    } catch (error) {
      $.Msg("[HP Colors Rewrite] settings dispatch failed: " + String(error));
    }
  }

  function replayDelay() {
    if (replayDispatches < REPLAY_HOT_COUNT) return REPLAY_HOT_SEC;
    if (replayDispatches < REPLAY_WARM_COUNT) return REPLAY_WARM_SEC;
    return REPLAY_IDLE_SEC;
  }

  function scheduleSnapshotReplay(generation) {
    try {
      $.Schedule(replayDelay(), function () {
        if (
          !replayRunning ||
          generation !== replayGeneration ||
          !state.effectiveValues.enabled ||
          !isValid(ui.absoluteRoot)
        )
          return;
        replayDispatches += 1;
        dispatchChange(
          "*",
          serializedSnapshotRaw,
          serializedReplayPayload,
        );
        scheduleSnapshotReplay(generation);
      });
    } catch (error) {
      replayRunning = false;
    }
  }

  function refreshSnapshotReplay() {
    if (!state.effectiveValues.enabled) {
      replayGeneration += 1;
      replayRunning = false;
      replayDispatches = 0;
      return;
    }
    ensureReplayPayload();
    replayDispatches = 0;
    if (replayRunning) return;
    replayRunning = true;
    replayGeneration += 1;
    scheduleSnapshotReplay(replayGeneration);
  }

  function publish(settingId) {
    state.revision += 1;
    var raw = snapshotRaw();
    var immediatePayload = serializeChange(settingId, raw);
    cacheReplayPayload(
      raw,
      settingId === "*" ? immediatePayload : "",
    );
    writeRootSnapshot(raw);
    dispatchChange(settingId, raw, immediatePayload);
    refreshSnapshotReplay();
    $.Msg(
      "[HP Colors Rewrite] setting revision=" +
        state.revision +
        " id=" +
        settingId,
    );
  }

  function reconcileEffective(settingId, forcePending) {
    if (scopeResolutionPending && forcePending !== true) return false;
    if (forcePending === true) scopeResolutionPending = false;
    var next = resolveEffectiveValues();
    var nextRaw = JSON.stringify(next);
    if (nextRaw === state.effectiveValuesRaw) return false;
    state.effectiveValues = copyValues(next);
    state.effectiveValuesRaw = nextRaw;
    publish(settingId);
    return true;
  }

  function pushHistory(raw) {
    if (!raw) return;
    if (state.history.length && state.history[state.history.length - 1] === raw)
      return;
    state.history.push(raw);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
  }

  function valuesRaw() {
    return JSON.stringify(state.values);
  }

  function commitValue(key, value, recordHistory) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
    var next = normalizeValue(key, value, state.values);
    if (state.values[key] === next) {
      syncControls();
      return;
    }
    cancelPendingPreset();
    if (recordHistory !== false) pushHistory(valuesRaw());
    state.values[key] = next;
    writeMenuState();
    reconcileEffective(key);
    syncControls();
  }

  function replaceValues(values, recordHistory) {
    var next = normalizeValues(values);
    var nextRaw = JSON.stringify(next);
    var currentRaw = valuesRaw();
    if (nextRaw === currentRaw) return false;
    cancelPendingPreset();
    if (recordHistory !== false) pushHistory(currentRaw);
    state.values = next;
    writeMenuState();
    reconcileEffective("*");
    syncControls();
    return true;
  }

  function undo() {
    if (!state.history.length) return;
    var raw = state.history.pop();
    try {
      replaceValues(JSON.parse(raw), false);
    } catch (error) {}
    syncControls();
  }

  function resetSection() {
    var category = CATEGORY_DEFS[state.categoryIndex];
    var tab = category && category.tabs[state.tabIndex];
    if (!tab) return;
    var next = copyValues(state.values);
    for (var index = 0; index < tab.keys.length; index++) {
      var key = tab.keys[index];
      next[key] = DEFAULTS[key];
    }
    replaceValues(next, true);
  }

  function bindCategory(index) {
    setPanelEvent(ui.categoryButtons[index], "onactivate", function () {
      selectCategory(index);
    });
  }

  function bindTab(index) {
    setPanelEvent(ui.tabButtons[index], "onactivate", function () {
      selectTab(index);
    });
  }

  function bindToggle(panelId, key) {
    var panel = find(panelId);
    setPanelEvent(panel, "onactivate", function () {
      if (syncingControls) return;
      commitValue(key, !state.values[key], true);
    });
  }

  function bindMode(panelId, key, mode) {
    var panel = find(panelId);
    setPanelEvent(panel, "onactivate", function () {
      if (syncingControls) return;
      commitValue(key, mode, true);
    });
  }

  function bindSlider(sliderId, entryId, key, min, max) {
    var slider = find(sliderId);
    var entry = find(entryId);
    if (!isValid(slider) || !isValid(entry)) return;
    var gestureBefore = "";

    try {
      slider.min = min;
      slider.max = max;
      slider.increment = 1;
    } catch (error) {}

    setPanelEvent(slider, "onmousedown", function () {
      gestureBefore = valuesRaw();
    });
    setPanelEvent(slider, "onvaluechanged", function () {
      if (syncingControls) return;
      var before = gestureBefore ? "" : valuesRaw();
      commitValue(key, slider.value, false);
      if (before) pushHistory(before);
    });
    setPanelEvent(slider, "onmouseup", function () {
      if (gestureBefore && gestureBefore !== valuesRaw()) pushHistory(gestureBefore);
      gestureBefore = "";
      syncControls();
    });

    function commitEntry() {
      if (syncingControls) return;
      commitValue(key, entry.text, true);
      try {
        $.DispatchEvent("DropInputFocus", entry);
      } catch (error) {}
    }
    setPanelEvent(entry, "ontextentrysubmit", commitEntry);
    setPanelEvent(entry, "onblur", commitEntry);
    setPanelEvent(entry, "oncancel", syncControls);
  }

  function bindColor(swatchId, entryId, key) {
    var swatch = find(swatchId);
    var entry = find(entryId);
    if (!isValid(swatch) || !isValid(entry)) return;
    setPanelEvent(swatch, "onactivate", function () {
      openPicker(key, swatch);
    });
    function commitEntry() {
      if (syncingControls) return;
      commitValue(key, entry.text, true);
      try {
        $.DispatchEvent("DropInputFocus", entry);
      } catch (error) {}
    }
    setPanelEvent(entry, "ontextentrysubmit", commitEntry);
    setPanelEvent(entry, "onblur", commitEntry);
    setPanelEvent(entry, "oncancel", syncControls);
  }

  function setToggle(panelId, value) {
    setClass(find(panelId), "Checked", !!value);
  }

  function setSlider(sliderId, entryId, value) {
    var slider = find(sliderId);
    var entry = find(entryId);
    if (isValid(slider)) {
      try {
        if (typeof slider.SetValueNoEvents === "function")
          slider.SetValueNoEvents(value);
        else slider.value = value;
      } catch (error) {}
    }
    setText(entry, String(value));
  }

  function setColor(swatchId, entryId, value) {
    var swatch = find(swatchId);
    if (isValid(swatch) && swatch.style) {
      try {
        if (swatch.style.backgroundColor !== value)
          swatch.style.backgroundColor = value;
      } catch (error) {}
    }
    setText(find(entryId), value);
  }

  function setPickerSliderValue(slider, value) {
    if (!isValid(slider)) return;
    try {
      if (typeof slider.SetValueNoEvents === "function")
        slider.SetValueNoEvents(value);
      else slider.value = value;
    } catch (error) {}
  }

  function setPickerTrack(slider, gradient) {
    if (!isValid(slider) || !slider.FindChildTraverse) return;
    try {
      var track = slider.FindChildTraverse("SliderTrack");
      if (isValid(track) && track.style.backgroundColor !== gradient)
        track.style.backgroundColor = gradient;
    } catch (error) {}
  }

  function setPickerThumb(slider, color, lightness) {
    if (!isValid(slider) || !slider.FindChildTraverse) return;
    try {
      var thumb = slider.FindChildTraverse("SliderThumb");
      if (!isValid(thumb) || !thumb.style) return;
      if (thumb.style.backgroundColor !== color)
        thumb.style.backgroundColor = color;
      var border = lightness < 35 ? "#FFEFD7" : "#10130D";
      if (thumb.style.borderColor !== border)
        thumb.style.borderColor = border;
    } catch (error) {}
  }

  function syncPicker() {
    if (!picker.key || !isValid(ui.pickerRoot)) return;
    var color = hslToHex(
      picker.hue,
      picker.saturation,
      picker.lightness,
    );
    setText(ui.pickerTitle, COLOR_TITLES[picker.key] || "COLOR");
    setText(ui.pickerHex, color);
    setText(ui.pickerHueValue, picker.hue + "°");
    setText(ui.pickerSaturationValue, picker.saturation + "%");
    setText(ui.pickerLightnessValue, picker.lightness + "%");
    if (isValid(ui.pickerPreview) && ui.pickerPreview.style)
      ui.pickerPreview.style.backgroundColor = color;

    setPickerSliderValue(ui.pickerHueSlider, picker.hue);
    setPickerSliderValue(ui.pickerSaturationSlider, picker.saturation);
    setPickerSliderValue(ui.pickerLumenSlider, picker.lightness);

    setPickerThumb(ui.pickerHueSlider, color, picker.lightness);
    setPickerThumb(ui.pickerSaturationSlider, color, picker.lightness);
    setPickerThumb(ui.pickerLumenSlider, color, picker.lightness);

    setPickerTrack(
      ui.pickerHueSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(#FF0000), color-stop(0.1667, #FFFF00), color-stop(0.3333, #00FF00), color-stop(0.5, #00FFFF), color-stop(0.6667, #0000FF), color-stop(0.8333, #FF00FF), to(#FF0000))",
    );
    setPickerTrack(
      ui.pickerSaturationSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(" +
        hslToHex(picker.hue, 0, picker.lightness) +
        "), to(" +
        hslToHex(picker.hue, 100, picker.lightness) +
        "))",
    );
    setPickerTrack(
      ui.pickerLumenSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(#000000), color-stop(0.5, " +
        hslToHex(picker.hue, picker.saturation, 50) +
        "), to(#FFFFFF))",
    );
  }

  function bindPickerSlider(slider, component) {
    if (!isValid(slider)) return;
    var gestureBefore = "";
    try {
      slider.increment = 1;
    } catch (error) {}
    setPanelEvent(slider, "onmousedown", function () {
      gestureBefore = valuesRaw();
    });
    setPanelEvent(slider, "onvaluechanged", function () {
      if (syncingControls || !picker.key) return;
      var before = gestureBefore ? "" : valuesRaw();
      var max = component === "hue" ? 359 : 100;
      picker[component] = clampNumber(
        slider.value,
        0,
        max,
        picker[component],
      );
      commitValue(
        picker.key,
        hslToHex(picker.hue, picker.saturation, picker.lightness),
        false,
      );
      if (before) pushHistory(before);
    });
    setPanelEvent(slider, "onmouseup", function () {
      if (gestureBefore && gestureBefore !== valuesRaw())
        pushHistory(gestureBefore);
      gestureBefore = "";
      syncControls();
    });
  }

  function closePicker() {
    if (!picker.key) return;
    picker.key = "";
    setClass(ui.pickerRoot, "Open", false);
    focus(picker.returnPanel);
    picker.returnPanel = null;
  }

  function openPicker(key, returnPanel) {
    if (!COLOR_KEYS[key]) return;
    closeHeroDialog();
    picker.key = key;
    picker.returnPanel = returnPanel;
    var hsl = hexToHsl(state.values[key]);
    picker.hue = hsl.hue;
    picker.saturation = hsl.saturation;
    picker.lightness = hsl.lightness;
    setClass(ui.pickerRoot, "Open", true);
    syncPicker();
    focus(ui.pickerHueSlider);
  }

  function syncControls() {
    syncingControls = true;
    setToggle("HPColorsMasterToggle", state.values.enabled);
    setToggle("HPColorsEnemyToggle", state.values.enemyEnabled);
    setToggle("HPColorsEnemyVisibleToggle", state.values.enemyVisible);
    setToggle("HPColorsAllyToggle", state.values.allyEnabled);
    setToggle("HPColorsAllyVisibleToggle", state.values.allyVisible);
    setToggle("HPColorsEnemyTeamHighToggle", state.values.enemyTeamHigh);
    setToggle("HPColorsExcludeBuildingsToggle", state.values.excludeBuildings);
    setToggle("HPColorsExcludeBossesToggle", state.values.excludeBosses);
    setToggle("HPColorsReadoutToggle", state.values.readoutVisible);
    setToggle("HPColorsPipsVisibleToggle", state.values.pipsVisible);
    setToggle("HPColorsPrecisePipsToggle", state.values.precisePipsEnabled);
    setToggle("HPColorsLevelsVisibleToggle", state.values.levelsVisible);
    setClass(
      ui.enemyKillMarkerToggle,
      "Checked",
      state.values.enemyKillMarkerEnabled,
    );
    var enemyKillMarkerActive = state.values.enemyKillMarkerEnabled;
    setClass(
      ui.enemyKillMarkerThresholdRow,
      "Disabled",
      !enemyKillMarkerActive,
    );
    setClass(
      ui.enemyKillMarkerWidthRow,
      "Disabled",
      !enemyKillMarkerActive,
    );
    setClass(
      ui.enemyKillMarkerColorRow,
      "Disabled",
      !enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerThresholdSlider,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerThresholdEntry,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerWidthSlider,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerWidthEntry,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerColorSwatch,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerColorEntry,
      enemyKillMarkerActive,
    );


    setToggle("HPColorsEnemyPulseToggle", state.values.enemyPulseEnabled);
    setToggle(
      "HPColorsEnemyPulseColorToggle",
      state.values.enemyPulseColorEnabled,
    );
    setToggle(
      "HPColorsEnemyPulseHideBarToggle",
      state.values.enemyPulseHideBar,
    );
    setToggle(
      "HPColorsEnemyPulseReadoutToggle",
      state.values.enemyPulseReadout,
    );
    setToggle(
      "HPColorsEnemyPulseReadoutModifiersToggle",
      state.values.enemyPulseReadoutModifiers,
    );
    setToggle("HPColorsAllyPulseToggle", state.values.allyPulseEnabled);
    setToggle(
      "HPColorsAllyPulseColorToggle",
      state.values.allyPulseColorEnabled,
    );
    setClass(
      find("HPColorsEnemyPulseIntensitySubtle"),
      "Selected",
      state.values.enemyPulseIntensity === 0,
    );
    setClass(
      find("HPColorsEnemyPulseIntensityMedium"),
      "Selected",
      state.values.enemyPulseIntensity === 1,
    );
    setClass(
      find("HPColorsEnemyPulseIntensityIntense"),
      "Selected",
      state.values.enemyPulseIntensity === 2,
    );
    setClass(
      find("HPColorsAllyPulseIntensitySubtle"),
      "Selected",
      state.values.allyPulseIntensity === 0,
    );
    setClass(
      find("HPColorsAllyPulseIntensityMedium"),
      "Selected",
      state.values.allyPulseIntensity === 1,
    );
    setClass(
      find("HPColorsAllyPulseIntensityIntense"),
      "Selected",
      state.values.allyPulseIntensity === 2,
    );
    setClass(
      find("HPColorsEnemyPulseColorModeFixed"),
      "Selected",
      state.values.enemyPulseColorMode === "fixed",
    );
    setClass(
      find("HPColorsEnemyPulseColorModeGradient"),
      "Selected",
      state.values.enemyPulseColorMode === "gradient",
    );
    var enemyPulseActive = state.values.enemyPulseEnabled;
    var enemyPulseColorActive = enemyPulseActive && state.values.enemyPulseColorEnabled;
    setClass(
      find("HPColorsEnemyPulseColorModeRow"),
      "Disabled",
      !enemyPulseColorActive,
    );
    setClass(
      find("HPColorsEnemyPulseColorRow"),
      "Active",
      enemyPulseColorActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseColorModeFixed"),
      enemyPulseColorActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseColorModeGradient"),
      enemyPulseColorActive,
    );
    var enemyPulseReadoutModifiersActive =
      enemyPulseActive && state.values.enemyPulseReadoutModifiers;
    setClass(
      find("HPColorsEnemyPulseReadoutSizeRow"),
      "Disabled",
      !enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutSizeSlider"),
      enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutSizeEntry"),
      enemyPulseReadoutModifiersActive,
    );
    setClass(
      find("HPColorsEnemyPulseReadoutOffsetXRow"),
      "Disabled",
      !enemyPulseReadoutModifiersActive,
    );
    setClass(
      find("HPColorsEnemyPulseReadoutOffsetYRow"),
      "Disabled",
      !enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutOffsetXSlider"),
      enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutOffsetXEntry"),
      enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutOffsetYSlider"),
      enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutOffsetYEntry"),
      enemyPulseReadoutModifiersActive,
    );
    var allyPulseColorActive =
      state.values.allyPulseEnabled && state.values.allyPulseColorEnabled;
    setClass(
      find("HPColorsAllyPulseColorRow"),
      "Active",
      allyPulseColorActive,
    );
    setClass(
      find("HPColorsEnemyModeFixed"),
      "Selected",
      state.values.enemyMode === "fixed",
    );
    setClass(
      find("HPColorsEnemyModeGradient"),
      "Selected",
      state.values.enemyMode === "gradient",
    );
    setClass(
      find("HPColorsAllyModeFixed"),
      "Selected",
      state.values.allyMode === "fixed",
    );
    setClass(
      find("HPColorsAllyModeGradient"),
      "Selected",
      state.values.allyMode === "gradient",
    );
    setClass(
      find("HPColorsUltModeFollow"),
      "Selected",
      state.values.ultMode === "follow",
    );
    setClass(
      find("HPColorsUltModeCustom"),
      "Selected",
      state.values.ultMode === "custom",
    );
    setClass(
      find("HPColorsUltCustomRow"),
      "Active",
      state.values.ultMode === "custom",
    );
    setClass(
      find("HPColorsReadoutFormatHP"),
      "Selected",
      state.values.readoutFormat === "hp",
    );
    setClass(
      find("HPColorsReadoutFormatPercent"),
      "Selected",
      state.values.readoutFormat === "percent",
    );
    setClass(
      find("HPColorsReadoutFormatCurrent"),
      "Selected",
      state.values.readoutFormat === "current",
    );
    setClass(
      find("HPColorsReadoutFontDefault"),
      "Selected",
      state.values.readoutFont === "default",
    );
    setClass(
      find("HPColorsReadoutFontOracle"),
      "Selected",
      state.values.readoutFont === "oracle",
    );
    setClass(
      find("HPColorsReadoutFontPulp"),
      "Selected",
      state.values.readoutFont === "pulp",
    );
    setClass(
      find("HPColorsReadoutColorBar"),
      "Selected",
      state.values.readoutColorMode === "bar",
    );
    setClass(
      find("HPColorsReadoutColorCustom"),
      "Selected",
      state.values.readoutColorMode === "custom",
    );
    setClass(
      find("HPColorsReadoutModeFixed"),
      "Selected",
      state.values.readoutMode === "fixed",
    );
    setClass(
      find("HPColorsReadoutModeGradient"),
      "Selected",
      state.values.readoutMode === "gradient",
    );
    setClass(
      find("HPColorsReadoutCustomRows"),
      "Active",
      state.values.readoutColorMode === "custom",
    );
    var customReadoutColors = state.values.readoutColorMode === "custom";
    setClass(
      find("HPColorsReadoutModeRow"),
      "Disabled",
      !customReadoutColors,
    );
    setClass(
      find("HPColorsReadoutLowThresholdRow"),
      "Disabled",
      !customReadoutColors,
    );
    setClass(
      find("HPColorsReadoutHighThresholdRow"),
      "Disabled",
      !customReadoutColors,
    );
    setEnabled(find("HPColorsReadoutModeFixed"), customReadoutColors);
    setEnabled(find("HPColorsReadoutModeGradient"), customReadoutColors);
    setEnabled(find("HPColorsReadoutLowThresholdSlider"), customReadoutColors);
    setEnabled(find("HPColorsReadoutLowThresholdEntry"), customReadoutColors);
    setEnabled(find("HPColorsReadoutHighThresholdSlider"), customReadoutColors);
    setEnabled(find("HPColorsReadoutHighThresholdEntry"), customReadoutColors);

    setSlider(
      "HPColorsWidthSlider",
      "HPColorsWidthEntry",
      state.values.widthScale,
    );
    setSlider(
      "HPColorsHeightSlider",
      "HPColorsHeightEntry",
      state.values.heightScale,
    );
    setSlider(
      "HPColorsPositionXSlider",
      "HPColorsPositionXEntry",
      state.values.positionX,
    );
    setSlider(
      "HPColorsPositionYSlider",
      "HPColorsPositionYEntry",
      state.values.positionY,
    );
    setSlider(
      "HPColorsLowThresholdSlider",
      "HPColorsLowThresholdEntry",
      state.values.lowThreshold,
    );
    setSlider(
      "HPColorsHighThresholdSlider",
      "HPColorsHighThresholdEntry",
      state.values.highThreshold,
    );
    setSlider(
      "HPColorsReadoutLowThresholdSlider",
      "HPColorsReadoutLowThresholdEntry",
      state.values.lowThreshold,
    );
    setSlider(
      "HPColorsReadoutHighThresholdSlider",
      "HPColorsReadoutHighThresholdEntry",
      state.values.highThreshold,
    );
    setSlider(
      "HPColorsReadoutSizeSlider",
      "HPColorsReadoutSizeEntry",
      state.values.readoutSize,
    );
    setSlider(
      "HPColorsReadoutOffsetXSlider",
      "HPColorsReadoutOffsetXEntry",
      state.values.readoutOffsetX,
    );
    setSlider(
      "HPColorsReadoutOffsetYSlider",
      "HPColorsReadoutOffsetYEntry",
      state.values.readoutOffsetY,
    );

    setSlider(
      "HPColorsEnemyPulseThresholdSlider",
      "HPColorsEnemyPulseThresholdEntry",
      state.values.enemyPulseThreshold,
    );
    setSlider(
      "HPColorsEnemyPulseBpmSlider",
      "HPColorsEnemyPulseBpmEntry",
      state.values.enemyPulseBpm,
    );
    setSlider(
      "HPColorsEnemyPulseReadoutSizeSlider",
      "HPColorsEnemyPulseReadoutSizeEntry",
      state.values.enemyPulseReadoutSize,
    );
    setSlider(
      "HPColorsEnemyPulseReadoutOffsetXSlider",
      "HPColorsEnemyPulseReadoutOffsetXEntry",
      state.values.enemyPulseReadoutOffsetX,
    );
    setSlider(
      "HPColorsEnemyPulseReadoutOffsetYSlider",
      "HPColorsEnemyPulseReadoutOffsetYEntry",
      state.values.enemyPulseReadoutOffsetY,
    );
    setSlider(
      "HPColorsAllyPulseThresholdSlider",
      "HPColorsAllyPulseThresholdEntry",
      state.values.allyPulseThreshold,
    );
    setPickerSliderValue(
      ui.enemyKillMarkerThresholdSlider,
      state.values.enemyKillMarkerThreshold,
    );
    setText(
      ui.enemyKillMarkerThresholdEntry,
      String(state.values.enemyKillMarkerThreshold),
    );
    setPickerSliderValue(
      ui.enemyKillMarkerWidthSlider,
      state.values.enemyKillMarkerWidth,
    );
    setText(
      ui.enemyKillMarkerWidthEntry,
      String(state.values.enemyKillMarkerWidth),
    );
    setSlider(
      "HPColorsAllyPulseBpmSlider",
      "HPColorsAllyPulseBpmEntry",
      state.values.allyPulseBpm,
    );
    setColor(
      "HPColorsEnemyLowSwatch",
      "HPColorsEnemyLowHex",
      state.values.enemyLow,
    );
    setColor(
      "HPColorsEnemyMidSwatch",
      "HPColorsEnemyMidHex",
      state.values.enemyMid,
    );
    setColor(
      "HPColorsEnemyHighSwatch",
      "HPColorsEnemyHighHex",
      state.values.enemyHigh,
    );
    setColor(
      "HPColorsEnemyHealingSwatch",
      "HPColorsEnemyHealingHex",
      state.values.enemyHealing,
    );
    setColor(
      "HPColorsEnemyDeltaSwatch",
      "HPColorsEnemyDeltaHex",
      state.values.enemyDelta,
    );
    setColor(
      "HPColorsEnemyShieldSwatch",
      "HPColorsEnemyShieldHex",
      state.values.enemyBulletShield,
    );
    setColor(
      "HPColorsUltCustomSwatch",
      "HPColorsUltCustomHex",
      state.values.ultCustom,
    );
    setColor(
      "HPColorsAllyLowSwatch",
      "HPColorsAllyLowHex",
      state.values.allyLow,
    );
    setColor(
      "HPColorsAllyMidSwatch",
      "HPColorsAllyMidHex",
      state.values.allyMid,
    );
    setColor(
      "HPColorsAllyHighSwatch",
      "HPColorsAllyHighHex",
      state.values.allyHigh,
    );
    setColor(
      "HPColorsAllyHealingSwatch",
      "HPColorsAllyHealingHex",
      state.values.allyHealing,
    );
    setColor(
      "HPColorsAllyDeltaSwatch",
      "HPColorsAllyDeltaHex",
      state.values.allyDelta,
    );
    setColor(
      "HPColorsAllyShieldSwatch",
      "HPColorsAllyShieldHex",
      state.values.allyBulletShield,
    );
    setColor(
      "HPColorsReadoutLowSwatch",
      "HPColorsReadoutLowHex",
      state.values.readoutLow,
    );
    setColor(
      "HPColorsReadoutMidSwatch",
      "HPColorsReadoutMidHex",
      state.values.readoutMid,
    );
    setColor(
      "HPColorsReadoutHighSwatch",
      "HPColorsReadoutHighHex",
      state.values.readoutHigh,
    );

    setColor(
      "HPColorsEnemyPulseColorSwatch",
      "HPColorsEnemyPulseColorHex",
      state.values.enemyPulseColor,
    );
    setColor(
      "HPColorsAllyPulseColorSwatch",
      "HPColorsAllyPulseColorHex",
      state.values.allyPulseColor,
    );
    if (
      isValid(ui.enemyKillMarkerColorSwatch) &&
      ui.enemyKillMarkerColorSwatch.style
    ) {
      try {
        if (
          ui.enemyKillMarkerColorSwatch.style.backgroundColor !==
          state.values.enemyKillMarkerColor
        )
          ui.enemyKillMarkerColorSwatch.style.backgroundColor =
            state.values.enemyKillMarkerColor;
      } catch (error) {}
    }
    setText(
      ui.enemyKillMarkerColorEntry,
      state.values.enemyKillMarkerColor,
    );
    setClass(ui.undoButton, "Disabled", state.history.length === 0);
    if (ui.undoButton) ui.undoButton.enabled = state.history.length > 0;
    syncPicker();
    syncingControls = false;
    renderIdentity();
    renderCurrentScope();
  }

  function renderNavigation() {
    var category = CATEGORY_DEFS[state.categoryIndex];
    if (!category) return;

    setText(ui.headerCategory, category.name);
    for (var categoryIndex = 0; categoryIndex < ui.categoryButtons.length; categoryIndex++) {
      setClass(
        ui.categoryButtons[categoryIndex],
        "Selected",
        categoryIndex === state.categoryIndex,
      );
    }

    for (var tabIndex = 0; tabIndex < ui.tabButtons.length; tabIndex++) {
      var tab = category.tabs[tabIndex];
      setClass(ui.tabButtons[tabIndex], "Available", !!tab);
      setClass(
        ui.tabButtons[tabIndex],
        "Selected",
        !!tab && tabIndex === state.tabIndex,
      );
      setText(ui.tabLabels[tabIndex], tab ? tab.name : "");
    }

    var activeTab = category.tabs[state.tabIndex];
    if (!activeTab) return;
    setText(ui.pageEyebrow, category.name + " / " + activeTab.name);
    setText(ui.pageTitle, activeTab.title);
    setText(ui.pageDescription, activeTab.description);
    for (var pageIndex = 0; pageIndex < ui.settingsPages.length; pageIndex++) {
      setClass(
        ui.settingsPages[pageIndex],
        "Active",
        ui.settingsPages[pageIndex].id === activeTab.pageId,
      );
    }
    syncControls();
  }

  function selectCategory(index) {
    if (index < 0 || index >= CATEGORY_DEFS.length) return;
    if (state.categoryIndex === index && state.tabIndex === 0) return;
    closePicker();
    state.categoryIndex = index;
    state.tabIndex = 0;
    renderNavigation();
  }

  function selectTab(index) {
    var category = CATEGORY_DEFS[state.categoryIndex];
    if (!category || index < 0 || index >= category.tabs.length) return;
    if (state.tabIndex === index) return;
    closePicker();
    state.tabIndex = index;
    renderNavigation();
  }

  function endPeek() {
    if (!state.peeking) return;
    state.peeking = false;
    setClass(ui.editorRoot, "Peeking", false);
    focus(ui.peekButton);
  }

  function beginPeek() {
    if (!state.open || state.peeking) return;
    closePicker();
    closeHeroDialog();
    closeScopeDialog();
    state.peeking = true;
    setClass(ui.editorRoot, "Peeking", true);
    focus(ui.peekCapture);
  }

  function closeEditor() {
    if (!state.open) return;
    closeTransferDialog();
    closeHeroDialog();
    closeScopeDialog();
    closePicker();
    endPeek();
    state.open = false;
    state.history = [];
    setClass(ui.editorRoot, "Open", false);
    setClass(ui.escapeRoot, "EditorOpen", false);
    focus(ui.menuButton);
    $.Msg("[HP Colors Rewrite] menu close");
  }

  function openEditor() {
    if (!state.booted || state.open) return;
    state.open = true;
    state.peeking = false;
    state.history = [];
    if (loadMenuState()) {
      writeMenuState();
      reconcileEffective("*");
    }
    renderPresetOptions();
    setClass(ui.editorRoot, "Peeking", false);
    setClass(ui.editorRoot, "Open", true);
    setClass(ui.escapeRoot, "EditorOpen", true);
    renderNavigation();
    focus(ui.editorShell);
    $.Msg("[HP Colors Rewrite] menu open");
  }

  function cancel() {
    if (isValid(ui.scopeDialog) && ui.scopeDialog.BHasClass("Open")) {
      closeScopeDialog();
      return;
    }
    if (isValid(ui.heroDialog) && ui.heroDialog.BHasClass("Open")) {
      closeHeroDialog();
      return;
    }
    if (
      isValid(ui.transferDialog) &&
      ui.transferDialog.BHasClass("Open")
    ) {
      closeTransferDialog();
      return;
    }
    if (
      isValid(ui.precisePipsDialog) &&
      ui.precisePipsDialog.BHasClass("Open")
    ) {
      closePrecisePipsDialog();
      return;
    }
    if (picker.key) {
      closePicker();
      return;
    }
    if (state.open) {
      closeEditor();
      return;
    }
    try {
      if (typeof CitadelResumePlaying === "function") CitadelResumePlaying();
    } catch (error) {
      $.Msg("[HP Colors Rewrite] resume failed: " + String(error));
    }
  }

  function resolvePanels() {
    var marker = find("LeftStripeBlur");
    try {
      ui.escapeRoot =
        marker && marker.GetParent ? marker.GetParent() : context;
    } catch (error) {
      ui.escapeRoot = context;
    }
    ui.absoluteRoot = absoluteRoot(ui.escapeRoot);
    ui.menuButton = find("HPColorsMenuButton");
    ui.editorRoot = find("HPColorsEditorRoot");
    ui.editorShell = find("HPColorsEditorShell");
    ui.peekCapture = find("HPColorsPeekCapture");
    ui.peekButton = find("HPColorsPeekButton");
    ui.doneButton = find("HPColorsDoneButton");
    ui.undoButton = find("HPColorsUndoButton");
    ui.resetButton = find("HPColorsResetSectionButton");
    ui.transferButton = find("HPColorsTransferButton");
    ui.transferDialog = find("HPColorsTransferDialog");
    ui.transferInput = find("HPColorsTransferInput");
    ui.transferFeedback = find("HPColorsTransferFeedback");
    ui.transferExportButton = find("HPColorsTransferExportButton");
    ui.transferImportButton = find("HPColorsTransferImportButton");
    ui.transferCloseButton = find("HPColorsTransferCloseButton");
    ui.heroModeAuto = find("HPColorsHeroModeAuto");
    ui.heroModeManual = find("HPColorsHeroModeManual");
    ui.heroModeOff = find("HPColorsHeroModeOff");
    ui.heroPhase = find("HPColorsHeroPhase");
    ui.heroIdentity = find("HPColorsHeroIdentity");
    ui.heroDetail = find("HPColorsHeroDetail");
    ui.heroManualRow = find("HPColorsHeroManualRow");
    ui.heroManualButton = find("HPColorsHeroManualButton");
    ui.heroManualValue = find("HPColorsHeroManualValue");
    ui.heroDialog = find("HPColorsHeroDialog");
    ui.heroOptions = find("HPColorsHeroOptions");
    ui.heroCloseButton = find("HPColorsHeroCloseButton");
    ui.currentScopeOff = find("HPColorsCurrentScopeOff");
    ui.currentScopeAll = find("HPColorsCurrentScopeAll");
    ui.currentScopeSelected = find("HPColorsCurrentScopeSelected");
    ui.currentScopeSummary = find("HPColorsCurrentScopeSummary");
    ui.scopeDialog = find("HPColorsScopeDialog");
    ui.scopeSearch = find("HPColorsScopeSearch");
    ui.scopeOptions = find("HPColorsScopeOptions");
    ui.scopeCloseButton = find("HPColorsScopeCloseButton");
    ui.presetNameInput = find("HPColorsPresetNameInput");
    ui.presetSaveButton = find("HPColorsPresetSaveButton");
    ui.presetOptions = find("HPColorsPresetOptions");
    ui.presetFeedback = find("HPColorsPresetFeedback");
    ui.headerCategory = find("HPColorsHeaderCategory");
    ui.pageEyebrow = find("HPColorsPageEyebrow");
    ui.pageTitle = find("HPColorsPageTitle");
    ui.pageDescription = find("HPColorsPageDescription");
    ui.pickerRoot = find("HPColorsPickerRoot");
    ui.pickerPanel = find("HPColorsPickerPanel");
    ui.pickerBackdrop = find("HPColorsPickerBackdrop");
    ui.pickerDone = find("HPColorsPickerDone");
    ui.pickerTitle = find("HPColorsPickerTitle");
    ui.pickerPreview = find("HPColorsPickerPreview");
    ui.pickerHex = find("HPColorsPickerHex");
    ui.pickerHueValue = find("HPColorsPickerHueValue");
    ui.pickerSaturationValue = find("HPColorsPickerSaturationValue");
    ui.pickerLightnessValue = find("HPColorsPickerLightnessValue");
    ui.pickerHueHost = find("HPColorsPickerHueSliderHost");
    ui.pickerSaturationHost = find("HPColorsPickerSaturationSliderHost");
    ui.pickerLumenHost = find("HPColorsPickerLumenSliderHost");
    ui.precisePipsToggle = find("HPColorsPrecisePipsToggle");
    ui.precisePipsDialog = find("HPColorsPrecisePipsDialog");
    ui.precisePipsDialogTitle = find("HPColorsPrecisePipsDialogTitle");
    ui.precisePipsDialogMessage = find("HPColorsPrecisePipsDialogMessage");
    ui.precisePipsDialogCommands = find("HPColorsPrecisePipsDialogCommands");
    ui.precisePipsCopyLabel = find("HPColorsPrecisePipsCopyLabel");
    ui.precisePipsCopyButton = find("HPColorsPrecisePipsCopyButton");
    ui.precisePipsCloseButton = find("HPColorsPrecisePipsCloseButton");
    ui.enemyKillMarkerToggle = find("HPColorsEnemyKillMarkerToggle");
    ui.enemyKillMarkerThresholdRow = find("HPColorsEnemyKillMarkerThresholdRow");
    ui.enemyKillMarkerThresholdSlider = find(
      "HPColorsEnemyKillMarkerThresholdSlider",
    );
    ui.enemyKillMarkerThresholdEntry = find(
      "HPColorsEnemyKillMarkerThresholdEntry",
    );
    ui.enemyKillMarkerWidthRow = find("HPColorsEnemyKillMarkerWidthRow");
    ui.enemyKillMarkerWidthSlider = find(
      "HPColorsEnemyKillMarkerWidthSlider",
    );
    ui.enemyKillMarkerWidthEntry = find("HPColorsEnemyKillMarkerWidthEntry");
    ui.enemyKillMarkerColorRow = find("HPColorsEnemyKillMarkerColorRow");
    ui.enemyKillMarkerColorSwatch = find(
      "HPColorsEnemyKillMarkerColorSwatch",
    );
    ui.enemyKillMarkerColorEntry = find("HPColorsEnemyKillMarkerColorHex");

    for (var categoryIndex = 0; categoryIndex < CATEGORY_BUTTON_IDS.length; categoryIndex++)
      ui.categoryButtons.push(find(CATEGORY_BUTTON_IDS[categoryIndex]));
    for (var tabIndex = 0; tabIndex < 3; tabIndex++) {
      ui.tabButtons.push(find("HPColorsTab" + tabIndex));
      ui.tabLabels.push(find("HPColorsTabLabel" + tabIndex));
    }
    var pageIds = [
      "HPColorsSettingsOverviewStatus",
      "HPColorsSettingsOverviewLayout",
      "HPColorsSettingsOverviewHero",
      "HPColorsSettingsEnemyBar",
      "HPColorsSettingsEnemyFeedback",
      "HPColorsSettingsEnemyShields",
      "HPColorsSettingsAllyBar",
      "HPColorsSettingsAllyFeedback",
      "HPColorsSettingsAllyShields",
      "HPColorsSettingsReadoutNumber",
      "HPColorsSettingsReadoutPlacement",
      "HPColorsSettingsReadoutLevels",
      "HPColorsSettingsEnemyPulse",
      "HPColorsSettingsEnemyKillMarker",
      "HPColorsSettingsAllyPulse",
    ];

    for (var pageIndex = 0; pageIndex < pageIds.length; pageIndex++)
      ui.settingsPages.push(find(pageIds[pageIndex]));

    return (
      isValid(ui.escapeRoot) &&
      isValid(ui.absoluteRoot) &&
      isValid(ui.menuButton) &&
      isValid(ui.editorRoot) &&
      isValid(ui.editorShell) &&
      isValid(ui.peekCapture) &&
      isValid(ui.peekButton) &&
      isValid(ui.doneButton) &&
      isValid(ui.undoButton) &&
      isValid(ui.resetButton) &&
      isValid(ui.transferButton) &&
      isValid(ui.transferDialog) &&
      isValid(ui.transferInput) &&
      isValid(ui.transferFeedback) &&
      isValid(ui.transferExportButton) &&
      isValid(ui.transferImportButton) &&
      isValid(ui.transferCloseButton) &&
      isValid(ui.heroModeAuto) &&
      isValid(ui.heroModeManual) &&
      isValid(ui.heroModeOff) &&
      isValid(ui.heroPhase) &&
      isValid(ui.heroIdentity) &&
      isValid(ui.heroDetail) &&
      isValid(ui.heroManualRow) &&
      isValid(ui.heroManualButton) &&
      isValid(ui.heroManualValue) &&
      isValid(ui.heroDialog) &&
      isValid(ui.heroOptions) &&
      isValid(ui.heroCloseButton) &&
      isValid(ui.currentScopeOff) &&
      isValid(ui.currentScopeAll) &&
      isValid(ui.currentScopeSelected) &&
      isValid(ui.currentScopeSummary) &&
      isValid(ui.scopeDialog) &&
      isValid(ui.scopeSearch) &&
      isValid(ui.scopeOptions) &&
      isValid(ui.scopeCloseButton) &&
      isValid(ui.presetNameInput) &&
      isValid(ui.presetSaveButton) &&
      isValid(ui.presetOptions) &&
      isValid(ui.presetFeedback) &&
      isValid(ui.headerCategory) &&
      isValid(ui.pageEyebrow) &&
      isValid(ui.pageTitle) &&
      isValid(ui.pageDescription) &&
      isValid(ui.precisePipsToggle) &&
      isValid(ui.precisePipsDialog) &&
      isValid(ui.precisePipsDialogTitle) &&
      isValid(ui.precisePipsDialogMessage) &&
      isValid(ui.precisePipsDialogCommands) &&
      isValid(ui.precisePipsCopyLabel) &&
      isValid(ui.precisePipsCopyButton) &&
      isValid(ui.precisePipsCloseButton) &&
      isValid(ui.pickerRoot) &&
      isValid(ui.pickerPanel) &&
      isValid(ui.pickerBackdrop) &&
      isValid(ui.pickerDone) &&
      isValid(ui.pickerHueHost) &&
      isValid(ui.pickerSaturationHost) &&
      isValid(ui.pickerLumenHost)
    );
  }

  function createSlider(hostId, sliderId, min, max) {
    var existing = find(sliderId);
    if (isValid(existing)) return existing;
    var host = find(hostId);
    if (!isValid(host)) return null;
    var slider = $.CreatePanel("Slider", host, sliderId, {
      direction: "horizontal",
    });
    slider.AddClass("HPColorsSlider");
    slider.AddClass("HorizontalSlider");
    slider.min = min;
    slider.max = max;
    slider.style.width = "100%";
    slider.style.height = "12px";
    slider.style.verticalAlign = "center";
    slider.style.overflow = "noclip";
    return slider;
  }

  function createPickerSliders() {
    ui.pickerHueSlider = createSlider(
      "HPColorsPickerHueSliderHost",
      "HPColorsPickerHueSlider",
      0,
      359,
    );
    ui.pickerSaturationSlider = createSlider(
      "HPColorsPickerSaturationSliderHost",
      "HPColorsPickerSaturationSlider",
      0,
      100,
    );
    ui.pickerLumenSlider = createSlider(
      "HPColorsPickerLumenSliderHost",
      "HPColorsPickerLumenSlider",
      0,
      100,
    );
    var sliders = [
      ui.pickerHueSlider,
      ui.pickerSaturationSlider,
      ui.pickerLumenSlider,
    ];
    for (var index = 0; index < sliders.length; index++) {
      if (!isValid(sliders[index])) return false;
      sliders[index].AddClass("HPColorsPickerSlider");
    }
    return true;
  }

  function createSliders() {
    return (
      isValid(createSlider("HPColorsWidthSliderHost", "HPColorsWidthSlider", 60, 160)) &&
      isValid(createSlider("HPColorsHeightSliderHost", "HPColorsHeightSlider", 60, 160)) &&
      isValid(
        createSlider(
          "HPColorsPositionXSliderHost",
          "HPColorsPositionXSlider",
          -300,
          300,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsPositionYSliderHost",
          "HPColorsPositionYSlider",
          -200,
          200,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutSizeSliderHost",
          "HPColorsReadoutSizeSlider",
          72,
          320,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutOffsetXSliderHost",
          "HPColorsReadoutOffsetXSlider",
          -405,
          405,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutOffsetYSliderHost",
          "HPColorsReadoutOffsetYSlider",
          -35,
          840,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsLowThresholdSliderHost",
          "HPColorsLowThresholdSlider",
          0,
          99,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsHighThresholdSliderHost",
          "HPColorsHighThresholdSlider",
          1,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutLowThresholdSliderHost",
          "HPColorsReadoutLowThresholdSlider",
          0,
          99,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutHighThresholdSliderHost",
          "HPColorsReadoutHighThresholdSlider",
          1,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseThresholdSliderHost",
          "HPColorsEnemyPulseThresholdSlider",
          0,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseBpmSliderHost",
          "HPColorsEnemyPulseBpmSlider",
          30,
          300,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseReadoutSizeSliderHost",
          "HPColorsEnemyPulseReadoutSizeSlider",
          72,
          320,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseReadoutOffsetXSliderHost",
          "HPColorsEnemyPulseReadoutOffsetXSlider",
          -405,
          405,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseReadoutOffsetYSliderHost",
          "HPColorsEnemyPulseReadoutOffsetYSlider",
          -35,
          840,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsAllyPulseThresholdSliderHost",
          "HPColorsAllyPulseThresholdSlider",
          0,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsAllyPulseBpmSliderHost",
          "HPColorsAllyPulseBpmSlider",
          30,
          300,
        ),
      ) &&
      isValid(
        (ui.enemyKillMarkerThresholdSlider = createSlider(
          "HPColorsEnemyKillMarkerThresholdSliderHost",
          "HPColorsEnemyKillMarkerThresholdSlider",
          5,
          80,
        )),
      ) &&
      isValid(
        (ui.enemyKillMarkerWidthSlider = createSlider(
          "HPColorsEnemyKillMarkerWidthSliderHost",
          "HPColorsEnemyKillMarkerWidthSlider",
          1,
          100,
        )),
      ) &&
      createPickerSliders()
    );
  }

  function bindPickerControls() {
    setPanelEvent(ui.pickerDone, "onactivate", closePicker);
    setPanelEvent(ui.pickerPanel, "oncancel", closePicker);
    bindPickerSlider(ui.pickerHueSlider, "hue");
    bindPickerSlider(ui.pickerSaturationSlider, "saturation");
    bindPickerSlider(ui.pickerLumenSlider, "lightness");
  }

  function bindControls() {
    bindToggle("HPColorsMasterToggle", "enabled");
    bindToggle("HPColorsEnemyToggle", "enemyEnabled");
    bindToggle("HPColorsEnemyVisibleToggle", "enemyVisible");
    bindToggle("HPColorsAllyToggle", "allyEnabled");
    bindToggle("HPColorsAllyVisibleToggle", "allyVisible");
    bindToggle("HPColorsEnemyTeamHighToggle", "enemyTeamHigh");
    bindToggle("HPColorsExcludeBuildingsToggle", "excludeBuildings");
    bindToggle("HPColorsExcludeBossesToggle", "excludeBosses");
    bindMode("HPColorsEnemyModeFixed", "enemyMode", "fixed");
    bindMode("HPColorsEnemyModeGradient", "enemyMode", "gradient");
    bindMode("HPColorsAllyModeFixed", "allyMode", "fixed");
    bindMode("HPColorsAllyModeGradient", "allyMode", "gradient");
    bindMode("HPColorsUltModeFollow", "ultMode", "follow");
    bindMode("HPColorsUltModeCustom", "ultMode", "custom");
    bindToggle("HPColorsReadoutToggle", "readoutVisible");
    bindToggle("HPColorsPipsVisibleToggle", "pipsVisible");
    setPanelEvent(ui.precisePipsToggle, "onactivate", togglePrecisePips);
    bindToggle("HPColorsLevelsVisibleToggle", "levelsVisible");
    bindToggle(
      "HPColorsEnemyKillMarkerToggle",
      "enemyKillMarkerEnabled",
    );
    bindToggle("HPColorsEnemyPulseToggle", "enemyPulseEnabled");
    bindToggle("HPColorsEnemyPulseColorToggle", "enemyPulseColorEnabled");
    bindToggle("HPColorsEnemyPulseHideBarToggle", "enemyPulseHideBar");
    bindToggle("HPColorsEnemyPulseReadoutToggle", "enemyPulseReadout");
    bindToggle(
      "HPColorsEnemyPulseReadoutModifiersToggle",
      "enemyPulseReadoutModifiers",
    );
    bindToggle("HPColorsAllyPulseToggle", "allyPulseEnabled");
    bindToggle("HPColorsAllyPulseColorToggle", "allyPulseColorEnabled");
    bindMode(
      "HPColorsEnemyPulseColorModeFixed",
      "enemyPulseColorMode",
      "fixed",
    );
    bindMode(
      "HPColorsEnemyPulseColorModeGradient",
      "enemyPulseColorMode",
      "gradient",
    );
    bindMode("HPColorsEnemyPulseIntensitySubtle", "enemyPulseIntensity", 0);
    bindMode("HPColorsEnemyPulseIntensityMedium", "enemyPulseIntensity", 1);
    bindMode("HPColorsEnemyPulseIntensityIntense", "enemyPulseIntensity", 2);
    bindMode("HPColorsAllyPulseIntensitySubtle", "allyPulseIntensity", 0);
    bindMode("HPColorsAllyPulseIntensityMedium", "allyPulseIntensity", 1);
    bindMode("HPColorsAllyPulseIntensityIntense", "allyPulseIntensity", 2);
    bindMode("HPColorsReadoutFormatHP", "readoutFormat", "hp");
    bindMode("HPColorsReadoutFormatPercent", "readoutFormat", "percent");
    bindMode("HPColorsReadoutFormatCurrent", "readoutFormat", "current");
    bindMode("HPColorsReadoutFontDefault", "readoutFont", "default");
    bindMode("HPColorsReadoutFontOracle", "readoutFont", "oracle");
    bindMode("HPColorsReadoutFontPulp", "readoutFont", "pulp");
    bindMode("HPColorsReadoutColorBar", "readoutColorMode", "bar");
    bindMode("HPColorsReadoutColorCustom", "readoutColorMode", "custom");
    bindMode("HPColorsReadoutModeFixed", "readoutMode", "fixed");
    bindMode("HPColorsReadoutModeGradient", "readoutMode", "gradient");
    bindSlider("HPColorsWidthSlider", "HPColorsWidthEntry", "widthScale", 60, 160);
    bindSlider("HPColorsHeightSlider", "HPColorsHeightEntry", "heightScale", 60, 160);
    bindSlider(
      "HPColorsPositionXSlider",
      "HPColorsPositionXEntry",
      "positionX",
      -300,
      300,
    );
    bindSlider(
      "HPColorsPositionYSlider",
      "HPColorsPositionYEntry",
      "positionY",
      -200,
      200,
    );
    bindSlider(
      "HPColorsReadoutSizeSlider",
      "HPColorsReadoutSizeEntry",
      "readoutSize",
      72,
      320,
    );
    bindSlider(
      "HPColorsReadoutOffsetXSlider",
      "HPColorsReadoutOffsetXEntry",
      "readoutOffsetX",
      -405,
      405,
    );
    bindSlider(
      "HPColorsReadoutOffsetYSlider",
      "HPColorsReadoutOffsetYEntry",
      "readoutOffsetY",
      -35,
      840,
    );
    bindSlider(
      "HPColorsEnemyPulseThresholdSlider",
      "HPColorsEnemyPulseThresholdEntry",
      "enemyPulseThreshold",
      0,
      100,
    );
    bindSlider(
      "HPColorsEnemyPulseBpmSlider",
      "HPColorsEnemyPulseBpmEntry",
      "enemyPulseBpm",
      30,
      300,
    );
    bindSlider(
      "HPColorsEnemyPulseReadoutSizeSlider",
      "HPColorsEnemyPulseReadoutSizeEntry",
      "enemyPulseReadoutSize",
      72,
      320,
    );
    bindSlider(
      "HPColorsEnemyPulseReadoutOffsetXSlider",
      "HPColorsEnemyPulseReadoutOffsetXEntry",
      "enemyPulseReadoutOffsetX",
      -405,
      405,
    );
    bindSlider(
      "HPColorsEnemyPulseReadoutOffsetYSlider",
      "HPColorsEnemyPulseReadoutOffsetYEntry",
      "enemyPulseReadoutOffsetY",
      -35,
      840,
    );
    bindSlider(
      "HPColorsAllyPulseThresholdSlider",
      "HPColorsAllyPulseThresholdEntry",
      "allyPulseThreshold",
      0,
      100,
    );
    bindSlider(
      "HPColorsAllyPulseBpmSlider",
      "HPColorsAllyPulseBpmEntry",
      "allyPulseBpm",
      30,
      300,
    );
    bindSlider(
      "HPColorsEnemyKillMarkerThresholdSlider",
      "HPColorsEnemyKillMarkerThresholdEntry",
      "enemyKillMarkerThreshold",
      5,
      80,
    );
    bindSlider(
      "HPColorsEnemyKillMarkerWidthSlider",
      "HPColorsEnemyKillMarkerWidthEntry",
      "enemyKillMarkerWidth",
      1,
      100,
    );
    bindSlider(
      "HPColorsLowThresholdSlider",
      "HPColorsLowThresholdEntry",
      "lowThreshold",
      0,
      99,
    );
    bindSlider(
      "HPColorsHighThresholdSlider",
      "HPColorsHighThresholdEntry",
      "highThreshold",
      1,
      100,
    );
    bindSlider(
      "HPColorsReadoutLowThresholdSlider",
      "HPColorsReadoutLowThresholdEntry",
      "lowThreshold",
      0,
      99,
    );
    bindSlider(
      "HPColorsReadoutHighThresholdSlider",
      "HPColorsReadoutHighThresholdEntry",
      "highThreshold",
      1,
      100,
    );
    bindColor("HPColorsEnemyLowSwatch", "HPColorsEnemyLowHex", "enemyLow");
    bindColor("HPColorsEnemyMidSwatch", "HPColorsEnemyMidHex", "enemyMid");
    bindColor("HPColorsEnemyHighSwatch", "HPColorsEnemyHighHex", "enemyHigh");
    bindColor(
      "HPColorsEnemyHealingSwatch",
      "HPColorsEnemyHealingHex",
      "enemyHealing",
    );
    bindColor(
      "HPColorsEnemyDeltaSwatch",
      "HPColorsEnemyDeltaHex",
      "enemyDelta",
    );
    bindColor(
      "HPColorsEnemyShieldSwatch",
      "HPColorsEnemyShieldHex",
      "enemyBulletShield",
    );
    bindColor(
      "HPColorsUltCustomSwatch",
      "HPColorsUltCustomHex",
      "ultCustom",
    );
    bindColor("HPColorsAllyLowSwatch", "HPColorsAllyLowHex", "allyLow");
    bindColor("HPColorsAllyMidSwatch", "HPColorsAllyMidHex", "allyMid");
    bindColor("HPColorsAllyHighSwatch", "HPColorsAllyHighHex", "allyHigh");
    bindColor(
      "HPColorsAllyHealingSwatch",
      "HPColorsAllyHealingHex",
      "allyHealing",
    );
    bindColor(
      "HPColorsAllyDeltaSwatch",
      "HPColorsAllyDeltaHex",
      "allyDelta",
    );
    bindColor(
      "HPColorsAllyShieldSwatch",
      "HPColorsAllyShieldHex",
      "allyBulletShield",
    );
    bindColor(
      "HPColorsEnemyKillMarkerColorSwatch",
      "HPColorsEnemyKillMarkerColorHex",
      "enemyKillMarkerColor",
    );
    bindColor(
      "HPColorsEnemyPulseColorSwatch",
      "HPColorsEnemyPulseColorHex",
      "enemyPulseColor",
    );
    bindColor(
      "HPColorsAllyPulseColorSwatch",
      "HPColorsAllyPulseColorHex",
      "allyPulseColor",
    );
    bindColor(
      "HPColorsReadoutLowSwatch",
      "HPColorsReadoutLowHex",
      "readoutLow",
    );
    bindColor(
      "HPColorsReadoutMidSwatch",
      "HPColorsReadoutMidHex",
      "readoutMid",
    );
    bindColor(
      "HPColorsReadoutHighSwatch",
      "HPColorsReadoutHighHex",
      "readoutHigh",
    );
  }

  function boot() {
    if (state.booted) return;
    if (!resolvePanels()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: required panel missing");
      return;
    }
    if (!createSliders()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: slider host missing");
      return;
    }
    if (!createHeroOptions()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: hero option host missing");
      return;
    }
    if (!createScopeHeroOptions()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: scope option host missing");
      return;
    }


    setPanelEvent(ui.menuButton, "onactivate", openEditor);
    setPanelEvent(ui.doneButton, "onactivate", closeEditor);
    setPanelEvent(ui.undoButton, "onactivate", undo);
    setPanelEvent(ui.resetButton, "onactivate", resetSection);
    setPanelEvent(ui.transferButton, "onactivate", openTransferDialog);
    setPanelEvent(ui.transferExportButton, "onactivate", copyCurrentSettings);
    setPanelEvent(ui.transferImportButton, "onactivate", importLiveSettings);
    setPanelEvent(ui.transferCloseButton, "onactivate", closeTransferDialog);
    setPanelEvent(ui.transferDialog, "oncancel", closeTransferDialog);
    setPanelEvent(ui.heroModeAuto, "onactivate", function () {
      setHeroMode(HERO_MODE_AUTO);
    });
    setPanelEvent(ui.heroModeManual, "onactivate", function () {
      setHeroMode(HERO_MODE_MANUAL);
    });
    setPanelEvent(ui.heroModeOff, "onactivate", function () {
      setHeroMode(HERO_MODE_OFF);
    });
    setPanelEvent(ui.heroManualButton, "onactivate", openHeroDialog);
    setPanelEvent(ui.heroCloseButton, "onactivate", closeHeroDialog);
    setPanelEvent(ui.heroDialog, "oncancel", closeHeroDialog);
    setPanelEvent(ui.currentScopeOff, "onactivate", function () {
      setCurrentScopeMode(HERO_SCOPE_OFF);
    });
    setPanelEvent(ui.currentScopeAll, "onactivate", function () {
      setCurrentScopeMode(HERO_SCOPE_ALL);
    });
    setPanelEvent(ui.currentScopeSelected, "onactivate", openScopeDialog);
    setPanelEvent(ui.scopeSearch, "ontextentrychange", filterScopeHeroOptions);
    setPanelEvent(ui.scopeCloseButton, "onactivate", closeScopeDialog);
    setPanelEvent(ui.scopeDialog, "oncancel", closeScopeDialog);
    setPanelEvent(ui.presetSaveButton, "onactivate", saveCurrentPreset);
    setPanelEvent(ui.peekButton, "onmousedown", beginPeek);
    setPanelEvent(ui.peekButton, "onmouseup", endPeek);
    setPanelEvent(ui.peekCapture, "onactivate", endPeek);
    setPanelEvent(ui.peekCapture, "onmouseup", endPeek);

    for (var categoryIndex = 0; categoryIndex < ui.categoryButtons.length; categoryIndex++)
      bindCategory(categoryIndex);
    for (var tabIndex = 0; tabIndex < ui.tabButtons.length; tabIndex++)
      bindTab(tabIndex);
    bindControls();
    bindPickerControls();
    setPanelEvent(ui.precisePipsCopyButton, "onactivate", copyPrecisePipsText);
    setPanelEvent(ui.precisePipsCloseButton, "onactivate", closePrecisePipsDialog);
    setPanelEvent(ui.precisePipsDialog, "oncancel", closePrecisePipsDialog);

    state.booted = true;
    var hadPublishedSnapshot = loadPublishedSnapshot();
    if (!loadMenuState()) {
      state.values = hadPublishedSnapshot
        ? copyValues(state.effectiveValues)
        : copyValues(DEFAULTS);
      state.scopes = [];
      state.userPresets = [];
      state.pendingPresetId = null;
    }
    writeMenuState();
    var bootEffectiveRaw = JSON.stringify(resolveEffectiveValues());
    scopeResolutionPending =
      hadPublishedSnapshot &&
      hasSelectedScopes() &&
      bootEffectiveRaw !== state.effectiveValuesRaw;
    reconcileEffective("*");
    refreshSnapshotReplay();
    if (state.pendingPresetId)
      setPresetFeedback("WAITING FOR A STABLE HERO IDENTITY.", false);
    renderNavigation();
    restartIdentityWatch();
    $.Msg("[HP Colors Rewrite] menu ready");
  }

  $.HPColorsMenuBoot = boot;
  $.HPColorsMenuCancel = cancel;
})();
