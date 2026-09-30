(function () {
  "use strict";

  var CONFIG_ATTR = "hp_colors_v2_config";
  var MENU_STATE_ATTR = "hp_colors_v2_menu_state";
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var CONFIG_MAGIC = "HP_COLORS_V2_CONFIG";
  var CONFIG_VERSION = 2;
  var SUPPORTER_TICKER_URL =
    "https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/";
  // Durable save state shared across ESC layout reloads in one game process.
  // STORE_STATUS_ATTR: "" (no read yet), "ok", "blocked", or "forgotten".
  // STORE_ACK_ATTR: checksum of the last durable body the store holds (or the
  // body that Forget chose not to keep), so a warm reload never rewrites it.
  // HYDRATION_ATTR tells unit-status renderers to keep stock bars while a cold
  // boot is still restoring saved settings.
  var STORE_STATUS_ATTR = "hp_colors_v2_store_status";
  var STORE_ACK_ATTR = "hp_colors_v2_store_ack";
  var HYDRATION_ATTR = "hp_colors_v2_hydration";
  var STORE_PANEL_ID = "HPColorsV2Store";
  var LEGACY_PRESET_STORE_ID = "HPColorsRewritePresetStore";
  var PERSIST_DEBOUNCE_SEC = 1.5;
  var PERSIST_FAILURE_LIMIT = 3;
  var PERSIST_RETRY_SEC = 3;
  // State changes the menu makes by itself. After Forget they must not
  // recreate the save; only a deliberate edit does.
  var AUTOMATIC_INTENTS = {
    session_open: true,
    session_close: true,
    editor_close: true,
    hero_observe: true,
    lifecycle_observe: true,
    ability_observe: true,
  };
  var FORGET_CONFIRM_SEC = 4;
  var SAVE_TO_CONFIRM_SEC = 4;
  // Header notes stay 1.25 s; the save notes carry an instruction to read, so
  // they stay a little longer.
  var RESET_FEEDBACK_SEC = 1.25;
  var SAVE_TO_FEEDBACK_SEC = 3;
  var SAVE_TO_EMPTY_TEXT = "No presets yet. NEW PRESET saves your settings as one.";
  var PRESET_GONE_TEXT = "THAT PRESET NO LONGER EXISTS. NOTHING CHANGED.";
  var REPLAY_HOT_SEC = 1;
  var REPLAY_WARM_SEC = 3;
  var REPLAY_IDLE_SEC = 8;
  var REPLAY_HOT_COUNT = 3;
  var REPLAY_WARM_COUNT = 12;
  var HERO_POLL_ACTIVE_SEC = 1;
  var HERO_POLL_INACTIVE_SEC = 5;
  var HERO_MODE_AUTO = "auto";
  var HERO_MODE_MANUAL = "manual";
  var HERO_MODE_OFF = "off";
  var HERO_SCOPE_ALL = "all";
  var HERO_SCOPE_SELECTED = "selected";
  var HERO_SCOPE_EXCEPT = "except";
  var HERO_PHASE_TRANSITIONING = "transitioning";
  var HERO_PHASE_LOBBY = "lobby";
  var HERO_PHASE_HIDEOUT = "hideout";
  var HERO_PHASE_ACTIVE = "active";
  var HERO_PHASE_POST_MATCH = "post_match";

  var CATEGORY_DEFS = [
    {
      name: "GENERAL",
      tabs: [
        {
          name: "MASTER",
          title: "MASTER SWITCH & THRESHOLDS",
          description: "Turn HP Colors on or off, then set the shared low and high HP thresholds that every enemy, ally, and HP-text color rule uses.",
          pageId: "HPColorsSettingsOverviewStatus",
          keys: [
            "enabled",
            "lowThreshold",
            "highThreshold"
          ]
        },
        {
          name: "LAYOUT",
          title: "BAR LAYOUT",
          description: "Move each part using CSS pixels. Ultimate/level own offsets scale with the bar; anchoring additionally follows bar translation. RESET PAGE returns hero Current to Base, otherwise defaults.",
          pageId: "HPColorsSettingsOverviewLayout",
          keys: [
            "widthScale",
            "heightScale",
            "positionX",
            "positionY",
            "accessoryAnchorEnabled"
          ]
        },
        {
          name: "NAME & APPEARANCE",
          title: "NAME & APPEARANCE",
          description: "Style engine-owned player names without changing text or spectator visibility. Stock brightness 0.8 and spectator alpha remain.",
          pageId: "HPColorsSettingsOverviewAppearance",
          keys: [
            "criticalIndicatorVisible",
            "playerNamesVisible",
            "enemyNameColorEnabled",
            "enemyNameColor",
            "allyNameColorEnabled",
            "allyNameColor",
            "nameSize",
            "nameOffsetX",
            "nameOffsetY"
          ]
        }
      ]
    },
    {
      name: "ENEMY",
      tabs: [
        {
          name: "BAR",
          title: "ENEMY BAR",
          description: "Turn enemy bar colors on, show or hide enemy bars, and pick fixed or gradient low/mid/high colors.",
          pageId: "HPColorsSettingsEnemyBar",
          keys: [
            "enemyEnabled",
            "enemyVisible",
            "enemyMode",
            "enemyLow",
            "enemyMid",
            "enemyHigh",
            "enemyTeamHigh"
          ]
        },
        {
          name: "HEAL & SHIELD",
          title: "ENEMY HEAL & SHIELD",
          description: "Set healing, recent-damage, and shield colors.",
          pageId: "HPColorsSettingsEnemyFeedback",
          keys: [
            "enemyHealing",
            "enemyDelta",
            "enemyBulletShield"
          ]
        },
        {
          name: "HP TEXT",
          title: "ENEMY HP TEXT",
          description: "Show the engine current HP number on enemy players, then set its size, font, colors, and position. Maximum HP is not exposed.",
          pageId: "HPColorsSettingsReadoutNumber",
          keys: [
            "readoutVisible",
            "readoutSize",
            "readoutFont",
            "readoutColorMode",
            "readoutMode",
            "readoutLow",
            "readoutMid",
            "readoutHigh",
            "readoutOffsetX",
            "readoutOffsetY"
          ]
        },
        {
          name: "PULSE",
          title: "ENEMY PULSE",
          description: "Make enemy bars pulse at a low-HP threshold, and choose what the bar and HP text do while pulsing.",
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
            "enemyPulseReadoutOffsetY"
          ]
        },
        {
          name: "KILL MARKER",
          title: "ENEMY KILL MARKER",
          description: "Show a marker line on enemy player bars at the HP threshold you choose, then set its width and color.",
          pageId: "HPColorsSettingsEnemyKillMarker",
          keys: [
            "enemyKillMarkerEnabled",
            "enemyKillMarkerThreshold",
            "enemyKillMarkerWidth",
            "enemyKillMarkerColor"
          ]
        }
      ]
    },
    {
      name: "ALLY",
      tabs: [
        {
          name: "BAR",
          title: "ALLY BAR",
          description: "Turn ally bar colors on, show or hide ally bars, and pick fixed or gradient low/mid/high colors using the shared thresholds.",
          pageId: "HPColorsSettingsAllyBar",
          keys: [
            "allyEnabled",
            "allyVisible",
            "allyMode",
            "allyLow",
            "allyMid",
            "allyHigh",
            "allyTeamHigh"
          ]
        },
        {
          name: "HEAL & SHIELD",
          title: "ALLY HEAL & SHIELD",
          description: "Set healing, recent-damage, and shield colors.",
          pageId: "HPColorsSettingsAllyFeedback",
          keys: [
            "allyHealing",
            "allyDelta",
            "allyBulletShield"
          ]
        },
        {
          name: "HP TEXT",
          title: "ALLY HP TEXT",
          description: "Show the engine current HP number on ally players, then set its size, font, colors, and position. Maximum HP is not exposed.",
          pageId: "HPColorsSettingsAllyReadout",
          keys: [
            "allyReadoutVisible",
            "allyReadoutSize",
            "allyReadoutFont",
            "allyReadoutColorMode",
            "allyReadoutMode",
            "allyReadoutLow",
            "allyReadoutMid",
            "allyReadoutHigh",
            "allyReadoutOffsetX",
            "allyReadoutOffsetY"
          ]
        },
        {
          name: "PULSE",
          title: "ALLY PULSE",
          description: "Make ally bars pulse at a low-HP threshold, with optional fixed or gradient pulse colors.",
          pageId: "HPColorsSettingsAllyPulse",
          keys: [
            "allyPulseEnabled",
            "allyPulseThreshold",
            "allyPulseBpm",
            "allyPulseIntensity",
            "allyPulseColorEnabled",
            "allyPulseColor",
            "allyPulseColorMode"
          ]
        }
      ]
    },
    {
      name: "INDICATORS",
      tabs: [
        {
          name: "PIPS & LEVEL",
          title: "HEALTH LINES & LEVEL",
          description: "Show lines on enemy-player and opted-in enemy NPC/building bars. The level badge appears on enemy players only.",
          pageId: "HPColorsSettingsReadoutLevels",
          keys: [
            "pipsVisible",
            "enemyPipColorEnabled",
            "enemyPipColor",
            "allyPipColorEnabled",
            "allyPipColor",
            "pipOpacity",
            "levelsVisible",
            "levelOffsetX",
            "levelOffsetY"
          ]
        },
        {
          name: "ULTIMATE",
          title: "ULTIMATE ICON & COOLDOWN",
          description: "Color, scale, darken, and style the ultimate icon on healthbars, and show cooldown progress with your own ready/unavailable colors.",
          pageId: "HPColorsSettingsUltimateTimer",
          keys: [
            "ultMode",
            "ultCustom",
            "ultimateTimerColorMode",
            "ultimateTimerUnavailableColor",
            "ultimateTimerAvailableColor",
            "ultimateTimerEnabled",
            "ultimateTimerSize",
            "ultimateTimerDarkness",
            "ultOffsetX",
            "ultOffsetY"
          ]
        },
        {
          name: "STAMINA",
          title: "ENEMY STAMINA",
          description: "Choose enemy stamina pip shape, size, position, and color.",
          pageId: "HPColorsSettingsStamina",
          keys: [
            "staminaShape",
            "staminaWidth",
            "staminaHeight",
            "staminaOffsetX",
            "staminaOffsetY",
            "enemyStaminaColorEnabled",
            "enemyStaminaColor"
          ]
        },
        {
          name: "PICKUP TIMERS",
          title: "TOPBAR PICKUP TIMERS",
          description: "Show and style the gun, movement, spirit, and survival pickup timers beside the topbar ultimate icons.",
          pageId: "HPColorsSettingsPickupTimers",
          keys: [
            "pickupTimersEnabled",
            "pickupGunColor",
            "pickupMovementColor",
            "pickupSpiritColor",
            "pickupSurvivalColor",
            "pickupBackgroundDarkness",
            "pickupGlyphColor",
            "pickupSize",
            "pickupSpacing",
            "pickupOffsetX",
            "pickupOffsetY"
          ]
        }
      ]
    },
    {
      name: "UNITS",
      tabs: [
        {
          name: "NPCS",
          title: "NPCS",
          description: "Opt in these unit bars to custom colors.",
          pageId: "HPColorsSettingsNpc",
          keys: [
            "npcEnemyEnabled",
            "npcAllyEnabled"
          ]
        },
        {
          name: "NEUTRALS",
          title: "NEUTRALS",
          description: "Opt in these unit bars to custom colors.",
          pageId: "HPColorsSettingsNeutral",
          keys: [
            "npcNeutralEnabled",
            "neutralColor"
          ]
        },
        {
          name: "BUILDINGS",
          title: "BUILDINGS",
          description: "Opt in these unit bars to custom colors.",
          pageId: "HPColorsSettingsBuildings",
          keys: [
            "buildingEnemyEnabled",
            "buildingAllyEnabled"
          ]
        }
      ]
    },
    {
      name: "PRESETS",
      tabs: [
        {
          name: "LIBRARY",
          title: "PRESET LIBRARY",
          description: "Save your settings as presets. Choose HEROES to load them automatically.",
          pageId: "HPColorsSettingsOverviewHero",
          keys: []
        }
      ]
    }
  ];

  var LEGACY_PAGE_IDS = [
    ["HPColorsSettingsOverviewStatus", "HPColorsSettingsOverviewLayout"],
    ["HPColorsSettingsEnemyBar", "HPColorsSettingsEnemyFeedback", "HPColorsSettingsReadoutNumber", "HPColorsSettingsEnemyPulse", "HPColorsSettingsEnemyKillMarker"],
    ["HPColorsSettingsAllyBar", "HPColorsSettingsAllyFeedback", "HPColorsSettingsAllyReadout", "HPColorsSettingsAllyPulse"],
    ["HPColorsSettingsReadoutLevels", "HPColorsSettingsUltimateTimer", "HPColorsSettingsStamina", "HPColorsSettingsPickupTimers"]
  ];
  var navigationCategories = CATEGORY_DEFS;

  function legacyCategories() {
    var result = [];
    for (var group = 0; group < LEGACY_PAGE_IDS.length; group++) {
      var tabs = CATEGORY_DEFS[group].tabs.filter(function (tab) {
        return LEGACY_PAGE_IDS[group].indexOf(tab.pageId) >= 0 && isValid(find(tab.pageId));
      });
      result.push({ name: CATEGORY_DEFS[group].name, tabs: tabs });
    }
    return result;
  }

  var CATEGORY_BUTTON_IDS = [
    "HPColorsCategoryOverview",
    "HPColorsCategoryEnemy",
    "HPColorsCategoryAlly",
    "HPColorsCategoryReadout",
    "HPColorsCategoryUnits",
    "HPColorsCategoryPresets",
  ];
  var COLOR_TITLES = {
    enemyPipColor: "ENEMY PIP COLOR",
    allyPipColor: "ALLY PIP COLOR",
    enemyNameColor: "ENEMY NAME COLOR",
    allyNameColor: "ALLY NAME COLOR",
    enemyLow: "ENEMY LOW",
    enemyMid: "ENEMY MID",
    enemyHigh: "ENEMY HIGH",
    enemyHealing: "ENEMY HEALING",
    enemyDelta: "ENEMY RECENT DAMAGE",
    enemyBulletShield: "ENEMY SHIELD",
    allyLow: "ALLY LOW",
    allyMid: "ALLY MID",
    allyHigh: "ALLY HIGH",
    allyHealing: "ALLY HEALING",
    allyDelta: "ALLY RECENT DAMAGE",
    allyBulletShield: "ALLY SHIELD",
    ultCustom: "BASE ULTIMATE ICON COLOR",
    ultimateTimerUnavailableColor: "ULTIMATE PROGRESS UNAVAILABLE",
    ultimateTimerAvailableColor: "ULTIMATE PROGRESS READY",
    readoutLow: "HEALTH TEXT LOW",
    readoutMid: "HEALTH TEXT MID",
    readoutHigh: "HEALTH TEXT HIGH",
    allyReadoutLow: "ALLY HEALTH TEXT LOW",
    allyReadoutMid: "ALLY HEALTH TEXT MID",
    allyReadoutHigh: "ALLY HEALTH TEXT HIGH",
    enemyPulseColor: "ENEMY PULSE COLOR",
    enemyKillMarkerColor: "ENEMY KILL MARKER COLOR",
    enemyStaminaColor: "ENEMY STAMINA COLOR",
    pickupGunColor: "PICKUP GUN COLOR",
    pickupMovementColor: "PICKUP MOVEMENT COLOR",
    pickupSpiritColor: "PICKUP SPIRIT COLOR",
    pickupSurvivalColor: "PICKUP SURVIVAL COLOR",
    pickupGlyphColor: "PICKUP GLYPH COLOR",
    neutralColor: "NEUTRAL FILL COLOR",
  };

  var TOGGLE_CONTROLS = [
    {id: "HPColorsEnemyPipColorToggle", key: "enemyPipColorEnabled"},
    {id: "HPColorsAllyPipColorToggle", key: "allyPipColorEnabled"},

    { id: "HPColorsEnemyNameColorToggle", key: "enemyNameColorEnabled" },
    { id: "HPColorsAllyNameColorToggle", key: "allyNameColorEnabled" },
    { id: "HPColorsMasterToggle", key: "enabled" },
    { id: "HPColorsCriticalIndicatorToggle", key: "criticalIndicatorVisible" },
    { id: "HPColorsPlayerNamesToggle", key: "playerNamesVisible" },
    { id: "HPColorsNpcEnemyToggle", key: "npcEnemyEnabled" },
    { id: "HPColorsNpcAllyToggle", key: "npcAllyEnabled" },
    { id: "HPColorsNpcNeutralToggle", key: "npcNeutralEnabled" },
    { id: "HPColorsBuildingEnemyToggle", key: "buildingEnemyEnabled" },
    { id: "HPColorsBuildingAllyToggle", key: "buildingAllyEnabled" },
    { id: "HPColorsEnemyToggle", key: "enemyEnabled" },
    { id: "HPColorsEnemyVisibleToggle", key: "enemyVisible" },
    { id: "HPColorsAllyToggle", key: "allyEnabled" },
    { id: "HPColorsAllyVisibleToggle", key: "allyVisible" },
    { id: "HPColorsEnemyTeamHighToggle", key: "enemyTeamHigh" },
    { id: "HPColorsAllyTeamHighToggle", key: "allyTeamHigh" },
    { id: "HPColorsReadoutToggle", key: "readoutVisible" },
    { id: "HPColorsAllyReadoutToggle", key: "allyReadoutVisible" },
    { id: "HPColorsPipsVisibleToggle", key: "pipsVisible" },
    { id: "HPColorsLevelsVisibleToggle", key: "levelsVisible" },
    {
      id: "HPColorsAccessoryAnchorToggle",
      key: "accessoryAnchorEnabled",
    },
    {
      id: "HPColorsEnemyStaminaColorToggle",
      key: "enemyStaminaColorEnabled",
    },
    {
      id: "HPColorsEnemyKillMarkerToggle",
      key: "enemyKillMarkerEnabled",
    },
    { id: "HPColorsEnemyPulseToggle", key: "enemyPulseEnabled" },
    {
      id: "HPColorsEnemyPulseColorToggle",
      key: "enemyPulseColorEnabled",
    },
    {
      id: "HPColorsEnemyPulseHideBarToggle",
      key: "enemyPulseHideBar",
    },
    {
      id: "HPColorsEnemyPulseReadoutToggle",
      key: "enemyPulseReadout",
    },
    {
      id: "HPColorsEnemyPulseReadoutModifiersToggle",
      key: "enemyPulseReadoutModifiers",
    },
    { id: "HPColorsAllyPulseToggle", key: "allyPulseEnabled" },
    {
      id: "HPColorsAllyPulseColorToggle",
      key: "allyPulseColorEnabled",
    },
    { id: "HPColorsPickupTimersToggle", key: "pickupTimersEnabled" },
    { id: "HPColorsUltimateTimerToggle", key: "ultimateTimerEnabled" },
  ];
  var MODE_CONTROLS = [
    { id: "HPColorsEnemyModeFixed", key: "enemyMode", value: "fixed" },
    {
      id: "HPColorsEnemyModeGradient",
      key: "enemyMode",
      value: "gradient",
    },
    { id: "HPColorsAllyModeFixed", key: "allyMode", value: "fixed" },
    {
      id: "HPColorsAllyModeGradient",
      key: "allyMode",
      value: "gradient",
    },
    { id: "HPColorsUltModeFollow", key: "ultMode", value: "follow" },
    { id: "HPColorsUltModeCustom", key: "ultMode", value: "custom" },
    {
      id: "HPColorsUltimateTimerColorModeFollow",
      key: "ultimateTimerColorMode",
      value: "follow",
    },
    {
      id: "HPColorsUltimateTimerColorModeFixed",
      key: "ultimateTimerColorMode",
      value: "fixed",
    },
    {
      id: "HPColorsUltimateTimerColorModeGradient",
      key: "ultimateTimerColorMode",
      value: "gradient",
    },
    {
      id: "HPColorsEnemyPulseColorModeFixed",
      key: "enemyPulseColorMode",
      value: "fixed",
    },
    {
      id: "HPColorsEnemyPulseColorModeGradient",
      key: "enemyPulseColorMode",
      value: "gradient",
    },
    {
      id: "HPColorsAllyPulseColorModeFixed",
      key: "allyPulseColorMode",
      value: "fixed",
    },
    {
      id: "HPColorsAllyPulseColorModeGradient",
      key: "allyPulseColorMode",
      value: "gradient",
    },
    {
      id: "HPColorsEnemyPulseIntensitySubtle",
      key: "enemyPulseIntensity",
      value: 0,
    },
    {
      id: "HPColorsEnemyPulseIntensityMedium",
      key: "enemyPulseIntensity",
      value: 1,
    },
    {
      id: "HPColorsEnemyPulseIntensityIntense",
      key: "enemyPulseIntensity",
      value: 2,
    },
    {
      id: "HPColorsAllyPulseIntensitySubtle",
      key: "allyPulseIntensity",
      value: 0,
    },
    {
      id: "HPColorsAllyPulseIntensityMedium",
      key: "allyPulseIntensity",
      value: 1,
    },
    {
      id: "HPColorsAllyPulseIntensityIntense",
      key: "allyPulseIntensity",
      value: 2,
    },
    {
      id: "HPColorsReadoutFontDefault",
      key: "readoutFont",
      value: "default",
    },
    {
      id: "HPColorsReadoutFontOracle",
      key: "readoutFont",
      value: "oracle",
    },
    {
      id: "HPColorsReadoutFontPulp",
      key: "readoutFont",
      value: "pulp",
    },
    {
      id: "HPColorsReadoutColorBar",
      key: "readoutColorMode",
      value: "bar",
    },
    {
      id: "HPColorsReadoutColorCustom",
      key: "readoutColorMode",
      value: "custom",
    },
    {
      id: "HPColorsReadoutModeFixed",
      key: "readoutMode",
      value: "fixed",
    },
    {
      id: "HPColorsReadoutModeGradient",
      key: "readoutMode",
      value: "gradient",
    },
    {
      id: "HPColorsAllyReadoutFontDefault",
      key: "allyReadoutFont",
      value: "default",
    },
    {
      id: "HPColorsAllyReadoutFontOracle",
      key: "allyReadoutFont",
      value: "oracle",
    },
    {
      id: "HPColorsAllyReadoutFontPulp",
      key: "allyReadoutFont",
      value: "pulp",
    },
    {
      id: "HPColorsAllyReadoutColorBar",
      key: "allyReadoutColorMode",
      value: "bar",
    },
    {
      id: "HPColorsAllyReadoutColorCustom",
      key: "allyReadoutColorMode",
      value: "custom",
    },
    {
      id: "HPColorsAllyReadoutModeFixed",
      key: "allyReadoutMode",
      value: "fixed",
    },
    {
      id: "HPColorsAllyReadoutModeGradient",
      key: "allyReadoutMode",
      value: "gradient",
    },
  ];
  var SLIDER_CONTROLS = [
    {base: "HPColorsPipOpacity", key: "pipOpacity", min: 0, max: 100},

    { base: "HPColorsNameSize", key: "nameSize", min: 8, max: 40 },
    { base: "HPColorsNameOffsetX", key: "nameOffsetX", min: -200, max: 200 },
    { base: "HPColorsNameOffsetY", key: "nameOffsetY", min: -210, max: 210 },
    { base: "HPColorsWidth", key: "widthScale", min: 60, max: 230 },
    { base: "HPColorsHeight", key: "heightScale", min: 60, max: 160 },
    { base: "HPColorsPositionX", key: "positionX", min: -2000, max: 2000, displayScale: 0.1 },
    { base: "HPColorsPositionY", key: "positionY", min: -2100, max: 2100, displayScale: 0.1 },
    { base: "HPColorsUltOffsetX", key: "ultOffsetX", min: -3334, max: 3334, displayScale: 0.1 },
    { base: "HPColorsUltOffsetY", key: "ultOffsetY", min: -3500, max: 3500, displayScale: 0.1 },
    {
      base: "HPColorsLevelOffsetX",
      key: "levelOffsetX",
      min: -3334,
      max: 3334,
      displayScale: 0.1,
    },
    {
      base: "HPColorsLevelOffsetY",
      key: "levelOffsetY",
      min: -3500,
      max: 3500,
      displayScale: 0.1,
    },
    { base: "HPColorsStaminaWidth", key: "staminaWidth", min: 40, max: 220 },
    {
      base: "HPColorsStaminaHeight",
      key: "staminaHeight",
      min: 16,
      max: 90,
      increment: 0.1,
    },
    {
      base: "HPColorsStaminaOffsetX",
      key: "staminaOffsetX",
      min: -2000,
      max: 2000,
      displayScale: 0.1,
    },
    {
      base: "HPColorsStaminaOffsetY",
      key: "staminaOffsetY",
      min: -2100,
      max: 2100,
      displayScale: 0.1,
    },
    { base: "HPColorsReadoutSize", key: "readoutSize", min: 72, max: 320 },
    {
      base: "HPColorsReadoutOffsetX",
      key: "readoutOffsetX",
      min: -200,
      max: 200,
    },
    {
      base: "HPColorsReadoutOffsetY",
      key: "readoutOffsetY",
      min: -210,
      max: 210,
    },
    {
      base: "HPColorsAllyReadoutSize",
      key: "allyReadoutSize",
      min: 72,
      max: 320,
    },
    {
      base: "HPColorsAllyReadoutOffsetX",
      key: "allyReadoutOffsetX",
      min: -200,
      max: 200,
    },
    {
      base: "HPColorsAllyReadoutOffsetY",
      key: "allyReadoutOffsetY",
      min: -210,
      max: 210,
    },
    {
      base: "HPColorsSharedLowThreshold",
      key: "lowThreshold",
      min: 0,
      max: 99,
    },
    {
      base: "HPColorsSharedHighThreshold",
      key: "highThreshold",
      min: 1,
      max: 100,
    },
    {
      base: "HPColorsEnemyPulseThreshold",
      key: "enemyPulseThreshold",
      min: 0,
      max: 100,
    },
    {
      base: "HPColorsEnemyPulseBpm",
      key: "enemyPulseBpm",
      min: 30,
      max: 300,
    },
    {
      base: "HPColorsEnemyPulseReadoutSize",
      key: "enemyPulseReadoutSize",
      min: 72,
      max: 320,
    },
    {
      base: "HPColorsEnemyPulseReadoutOffsetX",
      key: "enemyPulseReadoutOffsetX",
      min: -200,
      max: 200,
    },
    {
      base: "HPColorsEnemyPulseReadoutOffsetY",
      key: "enemyPulseReadoutOffsetY",
      min: -210,
      max: 210,
    },
    {
      base: "HPColorsAllyPulseThreshold",
      key: "allyPulseThreshold",
      min: 0,
      max: 100,
    },
    {
      base: "HPColorsAllyPulseBpm",
      key: "allyPulseBpm",
      min: 30,
      max: 300,
    },
    {
      base: "HPColorsEnemyKillMarkerThreshold",
      key: "enemyKillMarkerThreshold",
      min: 5,
      max: 80,
    },
    {
      base: "HPColorsEnemyKillMarkerWidth",
      key: "enemyKillMarkerWidth",
      min: 1,
      max: 100,
    },
    {
      base: "HPColorsPickupBackgroundDarkness",
      key: "pickupBackgroundDarkness",
      min: 0,
      max: 100,
    },
    {
      base: "HPColorsPickupSize",
      key: "pickupSize",
      min: 12,
      max: 64,
    },
    {
      base: "HPColorsPickupSpacing",
      key: "pickupSpacing",
      min: 0,
      max: 16,
    },
    {
      base: "HPColorsPickupOffsetX",
      key: "pickupOffsetX",
      min: -200,
      max: 200,
    },
    {
      base: "HPColorsPickupOffsetY",
      key: "pickupOffsetY",
      min: -100,
      max: 100,
    },
    {
      base: "HPColorsUltimateTimerSize",
      key: "ultimateTimerSize",
      min: 25,
      max: 200,
      increment: 5,
    },
    {
      base: "HPColorsUltimateTimerDarkness",
      key: "ultimateTimerDarkness",
      min: 0,
      max: 100,
    },
  ];
  var COLOR_CONTROLS = [
    {base: "HPColorsEnemyPipColor", key: "enemyPipColor"},
    {base: "HPColorsAllyPipColor", key: "allyPipColor"},

    { base: "HPColorsEnemyNameColor", key: "enemyNameColor" },
    { base: "HPColorsAllyNameColor", key: "allyNameColor" },
    { base: "HPColorsEnemyLow", key: "enemyLow" },
    { base: "HPColorsEnemyMid", key: "enemyMid" },
    { base: "HPColorsEnemyHigh", key: "enemyHigh" },
    { base: "HPColorsEnemyHealing", key: "enemyHealing" },
    { base: "HPColorsEnemyDelta", key: "enemyDelta" },
    { base: "HPColorsEnemyShield", key: "enemyBulletShield" },
    { base: "HPColorsEnemyStaminaColor", key: "enemyStaminaColor" },
    { base: "HPColorsUltCustom", key: "ultCustom" },
    {
      base: "HPColorsUltimateTimerUnavailableColor",
      key: "ultimateTimerUnavailableColor",
    },
    {
      base: "HPColorsUltimateTimerAvailableColor",
      key: "ultimateTimerAvailableColor",
    },
    { base: "HPColorsAllyLow", key: "allyLow" },
    { base: "HPColorsAllyMid", key: "allyMid" },
    { base: "HPColorsAllyHigh", key: "allyHigh" },
    { base: "HPColorsAllyHealing", key: "allyHealing" },
    { base: "HPColorsAllyDelta", key: "allyDelta" },
    { base: "HPColorsAllyShield", key: "allyBulletShield" },
    { base: "HPColorsEnemyKillMarkerColor", key: "enemyKillMarkerColor" },
    { base: "HPColorsEnemyPulseColor", key: "enemyPulseColor" },
    { base: "HPColorsAllyPulseColor", key: "allyPulseColor" },
    { base: "HPColorsReadoutLow", key: "readoutLow" },
    { base: "HPColorsReadoutMid", key: "readoutMid" },
    { base: "HPColorsReadoutHigh", key: "readoutHigh" },
    { base: "HPColorsAllyReadoutLow", key: "allyReadoutLow" },
    { base: "HPColorsAllyReadoutMid", key: "allyReadoutMid" },
    { base: "HPColorsAllyReadoutHigh", key: "allyReadoutHigh" },
    { base: "HPColorsPickupGunColor", key: "pickupGunColor" },
    { base: "HPColorsPickupMovementColor", key: "pickupMovementColor" },
    { base: "HPColorsPickupSpiritColor", key: "pickupSpiritColor" },
    { base: "HPColorsPickupSurvivalColor", key: "pickupSurvivalColor" },
    { base: "HPColorsPickupGlyphColor", key: "pickupGlyphColor" },
    { base: "HPColorsNeutralColor", key: "neutralColor" },
  ];
  var COLOR_KEYS = {};
  for (var colorControlIndex = 0; colorControlIndex < COLOR_CONTROLS.length; colorControlIndex++)
    COLOR_KEYS[COLOR_CONTROLS[colorControlIndex].key] = true;
  var REQUIRED_UI_PANEL_KEYS = (
    "menuButton editorRoot editorShell peekCapture peekButton doneButton " +
    "undoButton resetButton resetDialog resetDialogTitle resetDialogMessage " +
    "resetConfirmButton resetCancelButton conditionDialog conditionTitle " +
    "conditionStatus conditionBooleanRow conditionBooleanFalse " +
    "conditionBooleanTrue conditionEnumRow conditionEnumOptions " +
    "conditionNumberRow conditionNumberSliderHost conditionNumberEntry " +
    "conditionColorRow conditionColorSwatch conditionColorEntry " +
    "conditionRemoveButton conditionCancelButton conditionApplyButton " +
    "transferButton transferDialog transferInput transferFeedback " +
    "transferExportButton transferImportButton transferCloseButton " +
    "heroIdentity currentScopeAll currentScopeSelected " +
    "currentScopeSummary scopeDialog scopeSearch scopeOptions " +
    "scopeCloseButton presetNameInput presetSaveButton " +
    "presetSaveButtonLabel presetSaveMode presetNewButton presetForm " +
    "presetCancelEditButton presetOptions presetFeedback " +
    "presetRestoreBakedButton presetCopyAllButton presetImportButton " +
    "presetTransferDialog presetTransferInput presetTransferFeedback " +
    "presetTransferConfirmButton presetTransferCloseButton " +
    "headerCategory liveStatus pageEyebrow pageTitle " +
    "pageDescription npcEnemyToggle npcAllyToggle npcNeutralToggle " +
    "buildingEnemyToggle buildingAllyToggle neutralColorRow " +
    "neutralColorSwatch neutralColorHex pickerRoot pickerPanel pickerBackdrop " +
    "pickerDone pickerHueHost pickerSaturationHost pickerLumenHost " +
    "criticalIndicatorToggle playerNamesToggle"
  ).split(" ");
  // Save UI panels stay optional: an old builder pak01 layout lacks them, and
  // the editor must still boot there to show the stale-layout warning.
  var OPTIONAL_UI_PANEL_KEYS = (
    "supporterTicker pickerTitle pickerPreview pickerHex pickerHueValue " +
    "pickerSaturationValue pickerLightnessValue storeForgetButton " +
    "storeForgetLabel presetHiddenRow currentScopeExcept scopeDialogTitle " +
    "scopeDialogMessage presetScopeHelp presetGuide presetGuideToggleLabel " +
    "presetGuideToggle presetGuideText " +
    "exitDialog exitDialogTitle exitDialogMessage exitFeedback " +
    "exitBackdrop exitSaveButton exitReviewButton exitDiscardButton " +
    "saveToPresetButton saveToPresetLabel saveToMoreButton saveToDialog " +
    "saveToBackdrop saveToOptions " +
    "saveToFeedback saveToNewButton saveToCloseButton"
  ).split(" ");
  var UI_PANEL_ID_OVERRIDES = {
    resetButton: "HPColorsResetSectionButton",
    pickerHueHost: "HPColorsPickerHueSliderHost",
    pickerSaturationHost: "HPColorsPickerSaturationSliderHost",
    pickerLumenHost: "HPColorsPickerLumenSliderHost",
  };
  var context = $.GetContextPanel();
  var DEFAULTS = {};
  var SETTING_ROW_IDS = {
    "enemyPipColorEnabled": "HPColorsEnemyPipColorEnabledRow",
    "enemyPipColor": "HPColorsEnemyPipColorRow",
    "allyPipColorEnabled": "HPColorsAllyPipColorEnabledRow",
    "allyPipColor": "HPColorsAllyPipColorRow",
    "pipOpacity": "HPColorsPipOpacityRow",
    "staminaShape": "HPColorsStaminaShapeRow",

    "enemyNameColorEnabled": "HPColorsEnemyNameColorEnableRow",
    "allyNameColorEnabled": "HPColorsAllyNameColorEnableRow",
    "enabled": "HPColorsEnabledRow",
    "criticalIndicatorVisible": "HPColorsCriticalIndicatorVisibleRow",
    "playerNamesVisible": "HPColorsPlayerNamesVisibleRow",
    "npcEnemyEnabled": "HPColorsNpcEnemyEnabledRow",
    "npcAllyEnabled": "HPColorsNpcAllyEnabledRow",
    "npcNeutralEnabled": "HPColorsNpcNeutralEnabledRow",
    "buildingEnemyEnabled": "HPColorsBuildingEnemyEnabledRow",
    "buildingAllyEnabled": "HPColorsBuildingAllyEnabledRow",
    "enemyEnabled": "HPColorsEnemyEnabledRow",
    "enemyVisible": "HPColorsEnemyVisibleRow",
    "allyEnabled": "HPColorsAllyEnabledRow",
    "allyVisible": "HPColorsAllyVisibleRow",
    "enemyTeamHigh": "HPColorsEnemyTeamHighRow",
    "allyTeamHigh": "HPColorsAllyTeamHighRow",
    "readoutVisible": "HPColorsReadoutVisibleRow",
    "allyReadoutVisible": "HPColorsAllyReadoutVisibleRow",
    "pipsVisible": "HPColorsPipsVisibleRow",
    "levelsVisible": "HPColorsLevelsVisibleRow",
    "accessoryAnchorEnabled": "HPColorsAccessoryAnchorEnabledRow",
    "enemyStaminaColorEnabled": "HPColorsEnemyStaminaColorEnabledRow",
    "enemyKillMarkerEnabled": "HPColorsEnemyKillMarkerEnabledRow",
    "enemyPulseEnabled": "HPColorsEnemyPulseEnabledRow",
    "enemyPulseColorEnabled": "HPColorsEnemyPulseColorEnabledRow",
    "enemyPulseHideBar": "HPColorsEnemyPulseHideBarRow",
    "enemyPulseReadout": "HPColorsEnemyPulseReadoutRow",
    "enemyPulseReadoutModifiers": "HPColorsEnemyPulseReadoutModifiersRow",
    "allyPulseEnabled": "HPColorsAllyPulseEnabledRow",
    "allyPulseColorEnabled": "HPColorsAllyPulseColorEnabledRow",
    "pickupTimersEnabled": "HPColorsPickupTimersEnabledRow",
    "ultimateTimerEnabled": "HPColorsUltimateTimerEnabledRow",
    "enemyMode": "HPColorsEnemyModeRow",
    "allyMode": "HPColorsAllyModeRow",
    "ultMode": "HPColorsUltModeRow",
    "ultimateTimerColorMode": "HPColorsUltimateTimerColorModeRow",
    "enemyPulseColorMode": "HPColorsEnemyPulseColorModeRow",
    "allyPulseColorMode": "HPColorsAllyPulseColorModeRow",
    "enemyPulseIntensity": "HPColorsEnemyPulseIntensityRow",
    "allyPulseIntensity": "HPColorsAllyPulseIntensityRow",
    "readoutFont": "HPColorsReadoutFontRow",
    "readoutColorMode": "HPColorsReadoutColorModeRow",
    "readoutMode": "HPColorsReadoutModeRow",
    "allyReadoutFont": "HPColorsAllyReadoutFontRow",
    "allyReadoutColorMode": "HPColorsAllyReadoutColorModeRow",
    "allyReadoutMode": "HPColorsAllyReadoutModeRow",
    "nameSize": "HPColorsNameSizeRow",
    "nameOffsetX": "HPColorsNameOffsetXRow",
    "nameOffsetY": "HPColorsNameOffsetYRow",
    "widthScale": "HPColorsWidthScaleRow",
    "heightScale": "HPColorsHeightScaleRow",
    "positionX": "HPColorsPositionXRow",
    "positionY": "HPColorsPositionYRow",
    "ultOffsetX": "HPColorsUltOffsetXRow",
    "ultOffsetY": "HPColorsUltOffsetYRow",
    "levelOffsetX": "HPColorsLevelOffsetXRow",
    "levelOffsetY": "HPColorsLevelOffsetYRow",
    "staminaWidth": "HPColorsStaminaWidthRow",
    "staminaHeight": "HPColorsStaminaHeightRow",
    "staminaOffsetX": "HPColorsStaminaOffsetXRow",
    "staminaOffsetY": "HPColorsStaminaOffsetYRow",
    "readoutSize": "HPColorsReadoutSizeRow",
    "readoutOffsetX": "HPColorsReadoutOffsetXRow",
    "readoutOffsetY": "HPColorsReadoutOffsetYRow",
    "allyReadoutSize": "HPColorsAllyReadoutSizeRow",
    "allyReadoutOffsetX": "HPColorsAllyReadoutOffsetXRow",
    "allyReadoutOffsetY": "HPColorsAllyReadoutOffsetYRow",
    "lowThreshold": "HPColorsSharedLowThresholdRow",
    "highThreshold": "HPColorsSharedHighThresholdRow",
    "enemyPulseThreshold": "HPColorsEnemyPulseThresholdRow",
    "enemyPulseBpm": "HPColorsEnemyPulseBpmRow",
    "enemyPulseReadoutSize": "HPColorsEnemyPulseReadoutSizeRow",
    "enemyPulseReadoutOffsetX": "HPColorsEnemyPulseReadoutOffsetXRow",
    "enemyPulseReadoutOffsetY": "HPColorsEnemyPulseReadoutOffsetYRow",
    "allyPulseThreshold": "HPColorsAllyPulseThresholdRow",
    "allyPulseBpm": "HPColorsAllyPulseBpmRow",
    "enemyKillMarkerThreshold": "HPColorsEnemyKillMarkerThresholdRow",
    "enemyKillMarkerWidth": "HPColorsEnemyKillMarkerWidthRow",
    "pickupBackgroundDarkness": "HPColorsPickupBackgroundDarknessRow",
    "pickupSize": "HPColorsPickupSizeRow",
    "pickupSpacing": "HPColorsPickupSpacingRow",
    "pickupOffsetX": "HPColorsPickupOffsetXRow",
    "pickupOffsetY": "HPColorsPickupOffsetYRow",
    "ultimateTimerSize": "HPColorsUltimateTimerSizeRow",
    "ultimateTimerDarkness": "HPColorsUltimateTimerDarknessRow",
    "enemyNameColor": "HPColorsEnemyNameColorRow",
    "allyNameColor": "HPColorsAllyNameColorRow",
    "enemyLow": "HPColorsEnemyLowRow",
    "enemyMid": "HPColorsEnemyMidRow",
    "enemyHigh": "HPColorsEnemyHighRow",
    "enemyHealing": "HPColorsEnemyHealingRow",
    "enemyDelta": "HPColorsEnemyDeltaRow",
    "enemyBulletShield": "HPColorsEnemyBulletShieldRow",
    "enemyStaminaColor": "HPColorsEnemyStaminaColorRow",
    "ultCustom": "HPColorsUltCustomRow",
    "ultimateTimerUnavailableColor": "HPColorsUltimateTimerUnavailableColorRow",
    "ultimateTimerAvailableColor": "HPColorsUltimateTimerAvailableColorRow",
    "allyLow": "HPColorsAllyLowRow",
    "allyMid": "HPColorsAllyMidRow",
    "allyHigh": "HPColorsAllyHighRow",
    "allyHealing": "HPColorsAllyHealingRow",
    "allyDelta": "HPColorsAllyDeltaRow",
    "allyBulletShield": "HPColorsAllyBulletShieldRow",
    "enemyKillMarkerColor": "HPColorsEnemyKillMarkerColorRow",
    "enemyPulseColor": "HPColorsEnemyPulseColorRow",
    "allyPulseColor": "HPColorsAllyPulseColorRow",
    "readoutLow": "HPColorsReadoutLowRow",
    "readoutMid": "HPColorsReadoutMidRow",
    "readoutHigh": "HPColorsReadoutHighRow",
    "allyReadoutLow": "HPColorsAllyReadoutLowRow",
    "allyReadoutMid": "HPColorsAllyReadoutMidRow",
    "allyReadoutHigh": "HPColorsAllyReadoutHighRow",
    "pickupGunColor": "HPColorsPickupGunColorRow",
    "pickupMovementColor": "HPColorsPickupMovementColorRow",
    "pickupSpiritColor": "HPColorsPickupSpiritColorRow",
    "pickupSurvivalColor": "HPColorsPickupSurvivalColorRow",
    "pickupGlyphColor": "HPColorsPickupGlyphColorRow",
    "neutralColor": "HPColorsNeutralColorRow"
  };
  var formatNoticePending = false;
  var LEGACY_DISPLAY_KEYS = {};
  for (var displayIndex = 0; displayIndex < SLIDER_CONTROLS.length; displayIndex++) {
    var displayControl = SLIDER_CONTROLS[displayIndex];
    if (displayControl.displayScale) LEGACY_DISPLAY_KEYS[displayControl.key] = displayControl.displayScale;
  }
  function displayScale(key) { return LEGACY_DISPLAY_KEYS[key] || 1; }
  function displayNumber(key, value) { return Math.round(value * displayScale(key) * 10) / 10; }
  var state = {
    booted: false,
    open: false,
    peeking: false,
    categoryIndex: 0,
    tabIndex: 0,
    view: null,
  };
  var stateInstance = null;
  var replayGeneration = 0;
  var replayRunning = false;
  var replayDispatches = 0;
  var serializedReplayPayload = "";
  var lastClipboardCopied = null;
  var storage = null;
  var hydration = { phase: "idle", raw: null };
  var persist = {
    gate: "unknown",
    ackHash: "",
    pendingRaw: "",
    timer: null,
    inFlight: false,
    failures: 0,
    lastError: "",
    forgotten: false,
    forgetting: false,
    legacyLayout: false,
  };
  var forgetConfirmGeneration = 0;
  var forgetConfirming = false;
  var resetFeedbackText = "";
  Object.defineProperties(state, {
    values: {
      get: function () {
        var view = currentView();
        if (!view) return {};
        return view.currentScope ? view.currentScope.values : view.values;
      },
    },
    conditions: {
      get: function () {
        var view = currentView();
        if (!view) return {};
        return view.currentScope ? view.currentScope.conditions : view.conditions;
      },
    },
  });
  var resetFeedbackGeneration = 0;
  function currentView() {
    if (stateInstance) state.view = stateInstance.read();
    var view = state.view;
    if (view && view.schema) DEFAULTS = view.schema.defaults || {};
    return view;
  }




  function commitValue(key, value) {
    var result = sendState({ type: "setting_edit", key: key, value: value });
    syncControls();
    return result;
  }



  function undo() {
    sendState({ type: "undo" });
    syncControls();
    syncPresetSaveForm(false);
  }



  function executeStateEffects(effects, deliberate) {
    if (!Array.isArray(effects)) return;
    for (var index = 0; index < effects.length; index++) {
      var effect = effects[index];
      if (!effect || !effect.type) continue;
      if (effect.type === "session_replace") {
        writeMenuState(effect.raw);
        schedulePersist(effect.raw, deliberate);
      } else if (effect.type === "effective_publish") {
        var payload = serializeChange(effect.revision, effect.values);
        writeRootAttribute(CONFIG_ATTR, payload);
        serializedReplayPayload = payload;
        dispatchChange(payload);
        refreshSnapshotReplay();
      } else if (effect.type === "clipboard_write") {
        lastClipboardCopied = executeClipboardEffect(effect);
      }
    }
  }
  function dispatchCopy(text) {
    try {
      return $.DispatchEvent("CopyStringToClipboard", text) !== false;
    } catch {}
    return false;
  }
  function executeClipboardEffect(effect) {
    var text = String(effect.text || "");
    var copied = dispatchCopy(text);
    if (!copied) {
      var input =
        effect.purpose === "settings"
          ? ui.transferInput
          : ui.presetTransferInput;
      try {
        if (isValid(input)) {
          input.text = text;
          focus(input);
          if (isCallable(input.SelectAll)) input.SelectAll();
          copied =
            $.DispatchEvent("TextEntryCopyToClipboard", input) !== false;
          input.text = "";
        }
      } catch {}
    }
    return copied;
  }

  function stateAccepted(result) {
    return !!(result && result.outcome && result.outcome.status !== "rejected");
  }

  function sendState(intent) {
    if (!stateInstance) return null;
    lastClipboardCopied = null;
    var result = stateInstance.send(intent);
    state.view = result && result.view ? result.view : stateInstance.read();
    if (result) executeStateEffects(result.effects, !AUTOMATIC_INTENTS[intent.type]);
    return result;
  }

  var picker = {
    key: "",
    hue: 0,
    saturation: 0,
    lightness: 100,
    returnPanel: null,
    condition: false,
  };
  var pickerGestureActive = false;
  var pickerPartCache = {};
  var ui = {
    categoryButtons: [],
    tabButtons: [],
    tabLabels: [],
    settingsPages: [],
    heroIdentity: null,
    currentScopeAll: null,
    currentScopeSelected: null,
    currentScopeExcept: null,
    scopeDialogTitle: null,
    scopeDialogMessage: null,
    currentScopeSummary: null,
    scopeDialog: null,
    scopeSearch: null,
    scopeOptions: null,
    scopeCloseButton: null,
    presetNameInput: null,
    presetSaveButton: null,
    presetSaveButtonLabel: null,
    presetSaveMode: null,
    presetNewButton: null,
    presetForm: null,
    presetCancelEditButton: null,
    presetOptions: null,
    presetFeedback: null,
    presetCopyAllButton: null,
    presetImportButton: null,
    presetTransferDialog: null,
    presetTransferInput: null,
    presetTransferFeedback: null,
    presetTransferConfirmButton: null,
    presetTransferCloseButton: null,
    presetRestoreBakedButton: null,
    presetHiddenRow: null,
    exitDialog: null,
    exitDialogTitle: null,
    exitDialogMessage: null,
    exitFeedback: null,
    exitBackdrop: null,
    exitSaveButton: null,
    exitReviewButton: null,
    exitDiscardButton: null,
    saveToPresetButton: null,
    saveToPresetLabel: null,
    saveToMoreButton: null,
    saveToDialog: null,
    saveToBackdrop: null,
    saveToOptions: null,
    saveToFeedback: null,
    saveToNewButton: null,
    saveToCloseButton: null,
    storeForgetButton: null,
    storeForgetLabel: null,
    resetDialog: null,
    resetDialogTitle: null,
    resetDialogMessage: null,
    resetConfirmButton: null,
    resetCancelButton: null,
    transferExportButton: null,
    transferImportButton: null,
    transferCloseButton: null,
    supporterTicker: null,
    liveStatus: null,
    conditionDialog: null,
    conditionTitle: null,
    conditionStatus: null,
    conditionSlotButtons: [],
    conditionSlotImages: [],
    conditionBooleanRow: null,
    conditionBooleanFalse: null,
    conditionBooleanTrue: null,
    conditionEnumRow: null,
    conditionEnumOptions: null,
    conditionNumberRow: null,
    conditionNumberSlider: null,
    conditionNumberEntry: null,
    conditionColorRow: null,
    conditionColorSwatch: null,
    conditionColorEntry: null,
    conditionRemoveButton: null,
    conditionCancelButton: null,
    conditionApplyButton: null,
  };
  var controlPanels = {};
  var resetKeys = null;
  var identity = {
    root: null,
    hud: null,
    topBar: null,
    localPlayer: null,
    heroNameLabel: null,
    gameTime: null,
    watchGeneration: 0,
    renderSignature: "",
  };
  var ability = {
    slotParent: null,
    signature: null,
    slots: [null, null, null, null],
    observedTiers: [-1, -1, -1, -1],
    observedIdentityKey: "",
    artSources: ["", "", "", ""],
  };
  var conditionControls = {};
  var conditionDraft = {
    key: "",
    slot: 1,
    minTier: 1,
    value: null,
    returnPanel: null,
  };
  var scopeOptionPanels = [];
  var scopeOptionKeys = [];
  var scopeOptionSearch = [];
  var scopeDialogMode = HERO_SCOPE_SELECTED;
  var scopeDialogOpener = null;
  var syncingControls = false;
  var presetDeleteConfirmId = "";
  var presetReplaceConfirm = null;
  var presetFormOpen = false;
  var presetEditId = "";
  // Source preset id the exit prompt was opened for; SAVE & EXIT re-reads
  // the view and refuses any other target.
  var exitDialogSourceId = "";
  var presetTransferRequest = 0;
  var transferRequest = 0;
  // SAVE TO PRESET: the row armed for replacement, and a generation that turns
  // every older auto-disarm timer into a no-op.
  var saveToArmedId = "";
  var saveToGeneration = 0;
  var saveToRows = [];
  var presetRowRefs = [];

  function isValid(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch {
      return false;
    }
  }
  function isCallable(value) {
    var tag = Object.prototype.toString.call(value);
    return (
      tag === "[object Function]" ||
      tag === "[object AsyncFunction]" ||
      tag === "[object GeneratorFunction]" ||
      tag === "[object AsyncGeneratorFunction]"
    );
  }

  function find(id) {
    try {
      return context && context.FindChildTraverse
        ? context.FindChildTraverse(id)
        : null;
    } catch {
      return null;
    }
  }

  function controlPanel(id) {
    var panel = controlPanels[id];
    if (!isValid(panel)) {
      panel = find(id);
      controlPanels[id] = panel;
    }
    return panel;
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

  function setClass(panel, className, enabled) {
    if (!isValid(panel)) return;
    var next = !!enabled;
    try {
      if (isCallable(panel.BHasClass) && panel.BHasClass(className) === next)
        return;
      panel.SetHasClass(className, next);
    } catch {}
  }

  function setEnabled(panel, enabled) {
    if (!isValid(panel)) return;
    var next = !!enabled;
    try {
      if (panel.enabled !== next) panel.enabled = next;
    } catch {}
    setClass(panel, "Disabled", !next);
  }

  function setText(panel, value) {
    if (!isValid(panel)) return;
    try {
      if (panel.text !== value) panel.text = value;
    } catch {}
  }

  function setPanelEvent(panel, eventName, handler) {
    if (!isValid(panel)) return;
    try {
      panel.SetPanelEvent(eventName, handler);
    } catch {}
  }

  function openSupporterTicker() {
    var ticker = ui.supporterTicker;
    if (!isValid(ticker)) return;
    setClass(ticker, "Open", false);
    try {
      if (isCallable(ticker.SetIgnoreCursor))
        ticker.SetIgnoreCursor(true);
    } catch {}
    try {
      if (!isCallable(ticker.SetURL)) return;
      var requestUrl =
        SUPPORTER_TICKER_URL +
        "?refresh=" +
        String(new Date().getTime());
      ticker.SetURL(requestUrl);
      setClass(ticker, "Open", true);
    } catch {}
  }

  function closeSupporterTicker() {
    var ticker = ui.supporterTicker;
    if (!isValid(ticker)) return;
    try {
      if (isCallable(ticker.SetURL)) ticker.SetURL("about:blank");
    } catch {}
    setClass(ticker, "Open", false);
  }

  function focus(panel) {
    if (!isValid(panel)) return;
    try {
      if (panel.SetFocus) panel.SetFocus();
    } catch {}
  }

  function panelHasClass(panel, className) {
    if (!isValid(panel)) return false;
    try {
      return !!(panel.BHasClass && panel.BHasClass(className));
    } catch {
      return false;
    }
  }

  function findChild(panel, id) {
    if (!isValid(panel)) return null;
    try {
      return panel.FindChildTraverse ? panel.FindChildTraverse(id) : null;
    } catch {
      return null;
    }
  }

  function findChildrenWithClass(panel, className) {
    if (!isValid(panel)) return [];
    try {
      return panel.FindChildrenWithClassTraverse
        ? panel.FindChildrenWithClassTraverse(className) || []
        : [];
    } catch {
      return [];
    }
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
    } catch {
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

  function clearAbilityPanelRefs() {
    ability.slotParent = null;
    ability.signature = null;
    ability.artSources = ["", "", "", ""];
    ability.slots = [null, null, null, null];
  }


  function setObservedAbilityTiers(next) {
    var signature = next.join("|");
    if (signature === ability.observedTiers.join("|")) return false;
    ability.observedTiers = next.slice(0);
    return true;
  }

  function clearObservedAbilityTiers() {
    clearAbilityPanelRefs();
    return setObservedAbilityTiers([-1, -1, -1, -1]);
  }

  function readAbilityTier(panel) {
    if (!isValid(panel)) return -1;
    for (var tier = 3; tier >= 0; tier--) {
      if (panelHasClass(panel, "Tier" + String(tier))) return tier;
    }
    return -1;
  }

  function readAbilityArtSource(panel) {
    if (!isValid(panel)) return "";
    var image = findChild(panel, "ability_image");
    if (!isValid(image)) return "";
    var source = "";
    try {
      source = image.GetAttributeString("src", "");
      if (!source) source = image.GetAttributeString("defaultsrc", "");
    } catch {
      source = "";
    }
    if (!source) {
      try {
        if (isCallable(image.GetSource))
          source = String(image.GetSource() || "");
      } catch {
        source = "";
      }
    }
    if (!source) {
      try {
        source = String(image.src || "");
      } catch {
        source = "";
      }
    }
    if (!source && image.style) {
      try {
        source = String(image.style.backgroundImage || "");
      } catch {
        source = "";
      }
    }
    if (source.indexOf("url(") === 0) {
      source = source.slice(4, -1);
      if (
        (source.charAt(0) === '"' && source.charAt(source.length - 1) === '"') ||
        (source.charAt(0) === "'" && source.charAt(source.length - 1) === "'")
      )
        source = source.slice(1, -1);
    }
    return source.indexOf("://") >= 0 ? source : "";
  }

  function syncConditionAbilityCard(slotIndex) {
    var button = ui.conditionSlotButtons[slotIndex];
    var image = ui.conditionSlotImages[slotIndex];
    if (!isValid(button)) return;
    var liveTier = ability.observedTiers[slotIndex];
    var selected = conditionDraft.slot === slotIndex + 1;
    setClass(button, "Selected", selected);
    setClass(button, "Unavailable", liveTier < 0);
    for (var required = 1; required <= 3; required++)
      setClass(
        button,
        "RequiredTier" + String(required),
        conditionDraft.minTier === required,
      );
    var source = readAbilityArtSource(ability.slots[slotIndex]);
    setClass(button, "HasAbilityArt", !!source);
    if (
      source &&
      isValid(image) &&
      ability.artSources[slotIndex] !== source
    ) {
      try {
        if (isCallable(image.SetImage)) image.SetImage(source);
        else image.src = source;
        ability.artSources[slotIndex] = source;
      } catch {
        setClass(button, "HasAbilityArt", false);
      }
    }
  }


  function abilityPanelCacheCurrent(referenced) {
    if (!isValid(ability.signature) || !isValid(ability.slotParent))
      return false;
    for (var index = 0; index < ability.slots.length; index++) {
      if (!referenced[index]) continue;
      if (!isValid(ability.slots[index])) return false;
      try {
        if (ability.slots[index].GetParent() !== ability.slotParent)
          return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  function resolveAbilityPanels(hudRoot, referenced) {
    if (abilityPanelCacheCurrent(referenced)) return true;
    ability.signature = null;
    ability.slotParent = null;
    ability.slots = [null, null, null, null];

    var signature = findChild(hudRoot, "hud_signature");
    if (!isValid(signature)) return false;
    ability.signature = signature;

    var slotParent = findChild(signature, "abilities");
    if (!isValid(slotParent)) {
      var anchor = findChild(signature, "slot_signature_1");
      if (isValid(anchor)) {
        try {
          slotParent = anchor.GetParent();
        } catch {
          slotParent = null;
        }
      }
    }
    if (!isValid(slotParent)) return false;
    ability.slotParent = slotParent;

    try {
      var childCount = slotParent.GetChildCount();
      for (var childIndex = 0; childIndex < childCount; childIndex++) {
        var child = slotParent.GetChild(childIndex);
        if (!isValid(child)) continue;
        var match = /^slot_signature_([1-4])$/.exec(String(child.id || ""));
        if (!match) continue;
        ability.slots[Number(match[1]) - 1] = child;
      }
    } catch {}

    for (var index = 0; index < ability.slots.length; index++) {
      if (referenced[index] && !isValid(ability.slots[index])) return false;
    }

    return true;
  }

  function reportAbilityTiers(view, tiers, clearPanels) {
    if (clearPanels) clearAbilityPanelRefs();
    var changed = setObservedAbilityTiers(tiers);
    var observedIdentityKey =
      String(view.identity.epoch) +
      "|" +
      String(view.identity.effectiveHeroKey || "");
    if (!changed && ability.observedIdentityKey === observedIdentityKey)
      return false;
    var result = sendState({
      type: "ability_observe",
      epoch: view.identity.epoch,
      tiers: tiers,
    });
    var committed = !!(result && result.outcome.status === "committed");
    if (result && result.outcome.status !== "rejected")
      ability.observedIdentityKey = observedIdentityKey;
    if ((changed || committed) && state.open) syncConditionIndicators();
    return changed || committed;
  }

  function sampleAbilityTiers() {
    var view = currentView();
    var required = view && view.ability ? view.ability.requiredSlots : null;
    var phase = view && view.identity ? view.identity.phase : HERO_PHASE_TRANSITIONING;
    var hasRules = false;
    var index;
    if (required) {
      for (index = 0; index < required.length; index++) {
        if (required[index]) {
          hasRules = true;
          break;
        }
      }
    }
    if (!hasRules) {
      ability.observedIdentityKey = "";
      return clearObservedAbilityTiers();
    }
    if (
      phase !== HERO_PHASE_ACTIVE ||
      identitySignalHasClass("spec_mode") ||
      !resolveIdentityRoot()
    )
      return reportAbilityTiers(view, [-1, -1, -1, -1], true);

    var next = [-1, -1, -1, -1];
    var hudRoot = isValid(identity.hud) ? identity.hud : identity.root;
    if (!resolveAbilityPanels(hudRoot, required))
      return reportAbilityTiers(view, next, false);
    for (index = 0; index < required.length; index++) {
      if (!required[index]) continue;
      next[index] = readAbilityTier(ability.slots[index]);
    }
    return reportAbilityTiers(view, next, false);
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
      return HERO_PHASE_HIDEOUT;
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

  function readLocalHeroName() {
    return readPanelText(resolveHeroNameLabel());
  }

  function viewHeroes(view) {
    return view && view.heroes ? view.heroes : [];
  }

  function findHero(heroKey, heroes) {
    for (var index = 0; index < heroes.length; index++) {
      if (heroes[index].key === heroKey) return heroes[index];
    }
    return null;
  }

  function heroDisplayName(heroKey, heroes) {
    var hero = findHero(heroKey, heroes);
    return hero ? hero.name : "";
  }

  function phaseDisplayName(phase) {
    if (phase === HERO_PHASE_LOBBY) return "LOBBY";
    if (phase === HERO_PHASE_HIDEOUT) return "HIDEOUT";
    if (phase === HERO_PHASE_ACTIVE) return "ACTIVE";
    if (phase === HERO_PHASE_POST_MATCH) return "POST MATCH";
    return "TRANSITIONING";
  }

  function renderIdentity() {
    var view = currentView();
    if (!view || !view.identity) return;
    var identityView = view.identity;
    var signature =
      identityView.phase +
      "|" +
      identityView.mode +
      "|" +
      identityView.status +
      "|" +
      identityView.manualHeroKey +
      "|" +
      identityView.effectiveHeroKey +
      "|" +
      identityView.candidateHeroKey +
      "|" +
      identityView.epoch;
    if (signature === identity.renderSignature) return;
    identity.renderSignature = signature;

    var identityText = "NO HERO DETECTED";
    if (identityView.mode === HERO_MODE_OFF) {
      identityText = "HERO DETECTION OFF";
    } else if (identityView.mode === HERO_MODE_MANUAL) {
      var manualName = heroDisplayName(
        identityView.effectiveHeroKey,
        view.heroes,
      );
      if (manualName) identityText = "HERO: " + manualName + " (MANUAL)";
    } else if (identityView.status === "settled") {
      var detectedName = heroDisplayName(
        identityView.effectiveHeroKey,
        view.heroes,
      );
      identityText = "HERO: " + detectedName;
    } else if (identityView.status === "settling") {
      identityText =
        "DETECTING HERO: " +
        (heroDisplayName(identityView.candidateHeroKey, view.heroes) ||
          "UNKNOWN");
    } else if (identityView.phase !== HERO_PHASE_ACTIVE) {
      // The runtime phase label is collapsed; surface the phase here.
      identityText += " · " + phaseDisplayName(identityView.phase);
    }
    setText(ui.heroIdentity, identityText);
  }

  function refreshEditorAfterIdentityChange(result) {
    if (!state.open || !result || !Array.isArray(result.effects)) return;
    for (var index = 0; index < result.effects.length; index++) {
      if (
        result.effects[index] &&
        result.effects[index].type === "effective_publish"
      ) {
        syncControls();
        renderPresetOptions();
        syncPresetSaveForm(true);
        return;
      }
    }
  }

  function identityPollDelay() {
    var view = currentView();
    var phase = view && view.identity ? view.identity.phase : HERO_PHASE_TRANSITIONING;
    return phase === HERO_PHASE_LOBBY ||
      phase === HERO_PHASE_HIDEOUT ||
      phase === HERO_PHASE_POST_MATCH
      ? HERO_POLL_INACTIVE_SEC
      : HERO_POLL_ACTIVE_SEC;
  }

  function identityPoll(generation) {
    if (generation !== identity.watchGeneration || !isValid(ui.absoluteRoot))
      return;
    var view = currentView();
    if (!view || !view.identity) return;
    var previousPhase = view.identity.phase;
    var nextPhase = readLifecyclePhase();
    if (nextPhase !== previousPhase) {
      clearIdentityPanelRefs();
      var lifecycleResult = sendState({
        type: "lifecycle_observe",
        epoch: view.identity.epoch + 1,
        phase: nextPhase,
      });
      refreshEditorAfterIdentityChange(lifecycleResult);
      renderIdentity();
      sampleAbilityTiers();
      restartIdentityWatch();
      return;
    }
    view = currentView();
    if (
      view.identity.mode === HERO_MODE_AUTO &&
      view.identity.phase === HERO_PHASE_ACTIVE
    ) {
      var heroResult = sendState({
        type: "hero_observe",
        epoch: view.identity.epoch,
        heroName: readLocalHeroName(),
      });
      refreshEditorAfterIdentityChange(heroResult);
    }
    renderIdentity();
    sampleAbilityTiers();
    scheduleIdentityTick(generation, identityPollDelay());
  }

  function scheduleIdentityTick(generation, delay) {
    try {
      $.Schedule(delay, function () {
        identityPoll(generation);
      });
    } catch {}
  }

  function restartIdentityWatch() {
    identity.watchGeneration += 1;
    scheduleIdentityTick(identity.watchGeneration, 0);
  }

  function currentScopeRow() {
    var view = currentView();
    return view && view.currentScope ? view.currentScope : null;
  }

  function scopeUsesHeroes(mode) {
    return mode === HERO_SCOPE_SELECTED || mode === HERO_SCOPE_EXCEPT;
  }

  function scopeModeLabel(mode) {
    if (mode === HERO_SCOPE_SELECTED) return "ONLY THESE";
    if (mode === HERO_SCOPE_EXCEPT) return "ALL EXCEPT";
    return "ALL HEROES";
  }

  function presetEditRecord() {
    if (!presetFormOpen || !presetEditId) return null;
    var preset = findPresetRecord(presetEditId);
    return preset && preset.kind === "user" ? preset : null;
  }

  // True when Current's APPLIES TO (mode + heroes) no longer matches the
  // saved scope of the preset being edited, so SAVE would convert it.
  function presetScopeChanged(preset, row) {
    if (!preset) return false;
    var mode = row && scopeUsesHeroes(row.mode) ? row.mode : HERO_SCOPE_ALL;
    var presetMode = scopeUsesHeroes(preset.mode) ? preset.mode : HERO_SCOPE_ALL;
    if (mode !== presetMode) return true;
    if (!scopeUsesHeroes(mode)) return false;
    var current = (row && row.heroes ? row.heroes : []).slice(0).sort();
    var saved = (preset.heroes || []).slice(0).sort();
    return JSON.stringify(current) !== JSON.stringify(saved);
  }

  function setCurrentScopeMode(mode) {
    if (mode !== HERO_SCOPE_ALL && !scopeUsesHeroes(mode)) return;
    var row = currentScopeRow();
    sendState({
      type: "scope_set",
      mode: mode,
      heroes: scopeUsesHeroes(mode) && row && row.mode === mode
        ? row.heroes
        : [],
    });
    renderPresetOptions();
    syncControls();
    syncPresetSaveForm(false);
  }

  function toggleCurrentScopeHero(heroKey) {
    var view = currentView();
    if (!findHero(heroKey, viewHeroes(view))) return;
    var index;
    var row = currentScopeRow();
    var mode = scopeUsesHeroes(scopeDialogMode)
      ? scopeDialogMode
      : HERO_SCOPE_SELECTED;
    var selected = row && row.mode === mode
      ? row.heroes.slice(0)
      : [];
    var found = selected.indexOf(heroKey) >= 0;
    var next = [];
    for (index = 0; index < selected.length; index++)
      if (selected[index] !== heroKey) next.push(selected[index]);
    if (!found) next.push(heroKey);
    sendState({
      type: "scope_set",
      mode: next.length ? mode : HERO_SCOPE_ALL,
      heroes: next,
    });
    renderPresetOptions();
    syncControls();
    syncPresetSaveForm(false);
  }

  function filterScopeHeroOptions() {
    var query = String((ui.scopeSearch && ui.scopeSearch.text) || "")
      .trim()
      .toUpperCase();
    for (var index = 0; index < scopeOptionPanels.length; index++) {
      var option = scopeOptionPanels[index];
      var searchText = scopeOptionSearch[index];
      setClass(option, "FilteredOut", !!query && searchText.indexOf(query) < 0);
    }
  }

  function renderCurrentScope() {
    var view = currentView();
    var row = view && view.currentScope ? view.currentScope : null;
    var mode =
      row && scopeUsesHeroes(row.mode)
        ? row.mode
        : HERO_SCOPE_ALL;
    setClass(ui.currentScopeAll, "Selected", mode === HERO_SCOPE_ALL);
    setClass(
      ui.currentScopeSelected,
      "Selected",
      mode === HERO_SCOPE_SELECTED,
    );
    if (isValid(ui.currentScopeExcept))
      setClass(ui.currentScopeExcept, "Selected", mode === HERO_SCOPE_EXCEPT);
    var dialogExcept = scopeDialogMode === HERO_SCOPE_EXCEPT;
    if (isValid(ui.scopeDialogTitle))
      setText(
        ui.scopeDialogTitle,
        dialogExcept ? "ALL EXCEPT" : "ONLY THESE",
      );
    if (isValid(ui.scopeDialogMessage))
      setText(
        ui.scopeDialogMessage,
        dialogExcept
          ? "Choose HEROES to skip."
          : "Choose HEROES to include.",
      );
    var summary = row
      ? presetScopeSummary({ mode: mode, heroes: row.heroes }, view.heroes)
      : "ALL HEROES";
    var editPreset = presetEditRecord();
    if (editPreset && presetScopeChanged(editPreset, row))
      summary = presetScopeSummary(editPreset, view.heroes) + " → " + summary;
    setText(ui.currentScopeSummary, summary);
    for (var optionIndex = 0; optionIndex < scopeOptionPanels.length; optionIndex++) {
      var option = scopeOptionPanels[optionIndex];
      var heroKey = scopeOptionKeys[optionIndex];
      var listed =
        !!row && row.mode === scopeDialogMode &&
        row.heroes.indexOf(heroKey) >= 0;
      setClass(
        option,
        "Selected",
        listed && scopeDialogMode === HERO_SCOPE_SELECTED,
      );
      setClass(
        option,
        "Skipped",
        listed && scopeDialogMode === HERO_SCOPE_EXCEPT,
      );
    }
  }

  function closeScopeDialog() {
    if (!isValid(ui.scopeDialog) || !ui.scopeDialog.BHasClass("Open")) return;
    setClass(ui.scopeDialog, "Open", false);
    focus(isValid(scopeDialogOpener) ? scopeDialogOpener : ui.currentScopeSelected);
  }

  function openScopeDialog(mode) {
    scopeDialogMode = mode === HERO_SCOPE_EXCEPT ? HERO_SCOPE_EXCEPT : HERO_SCOPE_SELECTED;
    scopeDialogOpener = scopeDialogMode === HERO_SCOPE_EXCEPT
      ? ui.currentScopeExcept
      : ui.currentScopeSelected;
    closeTransferDialog();
    closePicker();
    if (isValid(ui.scopeSearch)) ui.scopeSearch.text = "";
    filterScopeHeroOptions();
    renderCurrentScope();
    setClass(ui.scopeDialog, "Open", true);
    focus(ui.scopeSearch);
  }

  function createScopeHeroOptions() {
    if (!isValid(ui.scopeOptions)) return false;
    try {
      ui.scopeOptions.RemoveAndDeleteChildren();
    } catch {}
    scopeOptionPanels = [];
    scopeOptionKeys = [];
    scopeOptionSearch = [];
    var view = currentView();
    var heroes = viewHeroes(view);
    for (var index = 0; index < heroes.length; index++) {
      (function (heroKey, heroName, optionIndex) {
        var option = $.CreatePanel(
          "Button",
          ui.scopeOptions,
          "HPColorsScopeHeroOption" + optionIndex,
        );
        if (!isValid(option)) return;
        var label = $.CreatePanel(
          "Label",
          option,
          "HPColorsScopeHeroOptionLabel" + optionIndex,
        );
        if (!isValid(label)) return;
        option.AddClass("HPColorsHeroOption");
        option.AddClass("HPColorsScopeHeroOption");
        option.SetAttributeString("hp_colors_scope_hero_key", heroKey);
        var searchText = (heroName + " " + heroKey).toUpperCase();
        option.SetAttributeString("hp_colors_scope_search", searchText);
        label.text = heroName;
        var skipTag = $.CreatePanel(
          "Label",
          option,
          "HPColorsScopeHeroOptionSkip" + optionIndex,
        );
        if (isValid(skipTag)) {
          skipTag.AddClass("HPColorsScopeSkipTag");
          skipTag.text = "SKIP";
        }
        setPanelEvent(option, "onactivate", function () {
          toggleCurrentScopeHero(heroKey);
        });
        scopeOptionPanels.push(option);
        scopeOptionKeys.push(heroKey);
        scopeOptionSearch.push(searchText);
      })(heroes[index].key, heroes[index].name, index);
    }
    return scopeOptionPanels.length === heroes.length;
  }
  function setPresetFeedback(text, isError) {
    setText(ui.presetFeedback, text || "");
    setClass(ui.presetFeedback, "Error", !!isError);
  }

  function presetScopeSummary(preset, heroes) {
    if (preset.mode === HERO_SCOPE_ALL) return "ALL HEROES";
    if (!scopeUsesHeroes(preset.mode)) return "REWRITE DEFAULT";
    var names = [];
    for (var index = 0; index < preset.heroes.length; index++)
      names.push(heroDisplayName(preset.heroes[index], heroes));
    if (preset.mode === HERO_SCOPE_SELECTED) return "ONLY THESE — " + names.join(", ");
    return "ALL EXCEPT — " + names.slice(0, 2).join(", ") +
      (names.length > 2 ? " +" + String(names.length - 2) : "");
  }

  // Disabled or hidden actions stay in the row but take no hit testing, no
  // focus stop, and the activate guard never mutates state.
  function setRowActionEnabled(button, enabled) {
    if (!isValid(button)) return;
    var next = !!enabled;
    setClass(button, "Disabled", !next);
    try {
      if (button.enabled !== next) button.enabled = next;
      if (button.hittest !== next) button.hittest = next;
      if (button.canfocus !== next) button.canfocus = next;
    } catch {}
  }

  function createPresetRowAction(
    option,
    id,
    className,
    text,
    enabled,
    activate,
  ) {
    var button = $.CreatePanel("Button", option, id);
    if (!isValid(button)) return null;
    button.AddClass("HPColorsPresetRowAction");
    if (className) button.AddClass(className);
    setRowActionEnabled(button, enabled);
    var label = $.CreatePanel("Label", button, id + "Label");
    if (isValid(label)) label.text = text;
    setPanelEvent(button, "onactivate", function () {
      if (!panelHasClass(button, "Disabled") && isCallable(activate)) activate();
    });
    return button;
  }

  function renderPresetOptions() {
    if (!isValid(ui.presetOptions)) return;
    try {
      ui.presetOptions.RemoveAndDeleteChildren();
    } catch {}
    presetRowRefs = [];
    var view = currentView();
    var repository = view && view.repository ? view.repository : null;
    var records = repository && repository.rows ? repository.rows : [];
    var activeId = repository ? repository.activeId : "";
    var heroes = viewHeroes(view);
    var allRows = repository && repository.allRows ? repository.allRows : [];
    var userCount = Math.max(0, allRows.length - 1);
    var nextUserIndex = 0;
    for (var index = 0; index < records.length; index++) {
      var preset = records[index];
      var userIndex = preset.kind === "user" ? nextUserIndex++ : -1;
      (function (preset, optionIndex, userIndex) {
        var option = $.CreatePanel(
          "Panel",
          ui.presetOptions,
          "HPColorsPresetOption" + optionIndex,
        );
        if (!isValid(option)) return;
        var rowRef = {
          id: preset.id,
          row: option,
          status: null,
          edit: null,
          save: null,
          revert: null,
        };
        presetRowRefs.push(rowRef);
        var editingPreset =
          presetFormOpen &&
          presetEditId === preset.id &&
          preset.kind === "user";
        option.AddClass("HPColorsPresetOption");
        option.hittest = true;
        option.hittestchildren = true;
        option.canfocus = true;
        option.SetAttributeString("hp_colors_preset_id", preset.id);
        var active = preset.id === activeId;
        var deleting = presetDeleteConfirmId === preset.id;
        var replacing =
          !!presetReplaceConfirm && presetReplaceConfirm.id === preset.id;
        setClass(option, "Active", active);
        setClass(option, "Confirming", deleting || replacing);
        setClass(option, "Editing", editingPreset);

        if (deleting || replacing) {
          var confirmMessage = $.CreatePanel(
            "Label",
            option,
            "HPColorsPresetRowConfirmMessage" + optionIndex,
          );
          if (isValid(confirmMessage)) {
            confirmMessage.AddClass("HPColorsPresetRowConfirmMessage");
            confirmMessage.text = replacing
              ? presetReplaceConfirm.action === "save"
                ? "SAVE YOUR SETTINGS TO " +
                  presetDisplayName(preset).toUpperCase() +
                  "?"
                : "DISCARD UNSAVED CHANGES?"
              : (preset.kind === "baked" ? "HIDE " : "DELETE ") +
                presetDisplayName(preset).toUpperCase() +
                "?";
          }
          createPresetRowAction(
            option,
            "HPColorsPresetRowConfirm" + optionIndex,
            "HPColorsPresetRowConfirm",
            "CONFIRM",
            true,
            replacing ? confirmPresetReplace : confirmDeleteSelectedPreset,
          );
          createPresetRowAction(
            option,
            "HPColorsPresetRowCancel" + optionIndex,
            "HPColorsPresetRowCancel",
            "CANCEL",
            true,
            replacing ? cancelPresetReplace : cancelDeleteSelectedPreset,
          );
          return;
        }

        // The click-to-apply surface is a child panel so the sibling
        // buttons can never also trigger an apply.
        var main = $.CreatePanel(
          "Panel",
          option,
          "HPColorsPresetOptionMain" + optionIndex,
        );
        if (!isValid(main)) return;
        main.AddClass("HPColorsPresetOptionMain");
        main.hittest = true;
        main.hittestchildren = false;
        main.canfocus = true;
        var name = $.CreatePanel(
          "Label",
          main,
          "HPColorsPresetOptionName" + optionIndex,
        );
        var scope = $.CreatePanel(
          "Label",
          main,
          "HPColorsPresetOptionScope" + optionIndex,
        );
        var status = $.CreatePanel(
          "Label",
          main,
          "HPColorsPresetOptionStatus" + optionIndex,
        );
        rowRef.status = status;
        if (!isValid(name) || !isValid(scope) || !isValid(status)) return;
        name.AddClass("HPColorsPresetOptionName");
        scope.AddClass("HPColorsPresetOptionScope");
        status.AddClass("HPColorsPresetOptionStatus");
        name.text =
          presetDisplayName(preset) +
          (preset.kind === "baked" ? "  ·  BUILT-IN" : "");
        scope.text = presetScopeSummary(preset, heroes);
        status.text = editingPreset ? "EDITING" : active ? "ACTIVE" : "";
        setPanelEvent(main, "onactivate", function () {
          requestPresetRowApply(preset.id);
        });

        if (userIndex >= 0) {
          createPresetRowAction(
            option,
            "HPColorsPresetRowUp" + optionIndex,
            "HPColorsPresetRowUp",
            "▲",
            userIndex > 0,
            function () {
              selectPresetForRowAction(preset.id);
              moveSelectedPreset(-1);
            },
          );
          createPresetRowAction(
            option,
            "HPColorsPresetRowDown" + optionIndex,
            "HPColorsPresetRowDown",
            "▼",
            userIndex < userCount - 1,
            function () {
              selectPresetForRowAction(preset.id);
              moveSelectedPreset(1);
            },
          );
        }
        createPresetRowAction(
          option,
          "HPColorsPresetRowCopy" + optionIndex,
          "HPColorsPresetRowCopy",
          "COPY",
          true,
          function () {
            selectPresetForRowAction(preset.id);
            copySelectedPreset();
          },
        );
        if (preset.kind === "user" && !editingPreset) {
          rowRef.edit = createPresetRowAction(
            option,
            "HPColorsPresetRowEdit" + optionIndex,
            "HPColorsPresetRowEdit",
            "EDIT",
            true,
            function () {
              requestPresetEdit(preset.id);
            },
          );
          // SAVE/REVERT exist on every user row, collapsed until
          // refreshPresetActivity marks the row CHANGED; rows are never
          // rebuilt per live edit.
          rowRef.save = createPresetRowAction(
            option,
            "HPColorsPresetRowSave" + optionIndex,
            "HPColorsPresetRowSave",
            "SAVE",
            false,
            function () {
              requestPresetRowSave(preset.id);
            },
          );
          rowRef.revert = createPresetRowAction(
            option,
            "HPColorsPresetRowRevert" + optionIndex,
            "HPColorsPresetRowRevert",
            "REVERT",
            false,
            function () {
              requestPresetRowRevert(preset.id);
            },
          );
        }
        createPresetRowAction(
          option,
          "HPColorsPresetRowDelete" + optionIndex,
          "HPColorsPresetRowDelete",
          preset.kind === "baked" ? "HIDE" : "DELETE",
          true,
          function () {
            selectPresetForRowAction(preset.id);
            beginDeleteSelectedPreset();
          },
        );
      })(preset, index, userIndex);
    }
    var hasHiddenBaked = !!(
      repository &&
      repository.hiddenBakedIds &&
      repository.hiddenBakedIds.length
    );
    setClass(ui.presetHiddenRow, "Visible", hasHiddenBaked);
    if (isValid(ui.presetRestoreBakedButton)) {
      try {
        if (ui.presetRestoreBakedButton.enabled !== hasHiddenBaked)
          ui.presetRestoreBakedButton.enabled = hasHiddenBaked;
      } catch {}
    }
    refreshPresetActivity(view);
  }
  function syncPresetSaveForm(resetName) {
    var editPreset = presetFormOpen ? findPresetRecord(presetEditId) : null;
    if (!editPreset || editPreset.kind !== "user") {
      editPreset = null;
      presetEditId = "";
    }
    setText(
      ui.presetSaveMode,
      editPreset
        ? "EDITING " + presetDisplayName(editPreset).toUpperCase()
        : "NEW PRESET",
    );
    var saveLabel = "CREATE PRESET";
    if (editPreset) {
      var row = currentScopeRow();
      saveLabel = presetScopeChanged(editPreset, row)
        ? "SAVE AS " +
          scopeModeLabel(
            row && scopeUsesHeroes(row.mode) ? row.mode : HERO_SCOPE_ALL,
          )
        : "SAVE";
    }
    setText(ui.presetSaveButtonLabel, saveLabel);
    setClass(ui.presetForm, "Active", presetFormOpen);
    setClass(ui.presetNewButton, "FormOpen", presetFormOpen);
    if (isValid(ui.presetNewButton))
      ui.presetNewButton.enabled = !presetFormOpen;
    if (resetName && isValid(ui.presetNameInput))
      ui.presetNameInput.text = editPreset ? editPreset.name : "";
  }

  var PRESET_GUIDE_TEXT = [
    "- Click a preset to use it. To update it, change any setting, then press SAVE on its row. NEW PRESET saves your settings as a new preset.",
    "- ACTIVE: your settings match this preset. CHANGED: you edited it. SAVE keeps the changes. REVERT throws them away.",
    "- HEROES picks when a preset loads by itself. ONLY THESE: just the heroes you pick. ALL EXCEPT: every hero except those.",
    "- Hero presets only store what you changed. Everything else comes from your top ALL HEROES preset, or Rewrite Default if you have none. Ability conditions are saved in each preset.",
    "- When you switch heroes, the mod picks the highest match:\n1. An ONLY THESE preset for that hero.\n2. Otherwise, an ALL EXCEPT preset that doesn't skip that hero.\n3. Otherwise, your top ALL HEROES preset.\nIf changing characters does not change your preset, your unsaved edits stay.",
    "- Higher in the list wins. Switching heroes can replace changes you haven't saved. No ALL HEROES preset? Leaving an ONLY THESE or ALL EXCEPT preset with no match goes back to Rewrite Default.",
  ].join("\n\n");

  var presetGuideOpen = false;

  function renderPresetGuide() {
    setClass(ui.presetGuide, "Open", presetGuideOpen);
    setText(
      ui.presetGuideToggleLabel,
      presetGuideOpen ? "HIDE HOW PRESETS WORK" : "SHOW HOW PRESETS WORK",
    );
    setText(ui.presetGuideText, PRESET_GUIDE_TEXT);
  }

  function togglePresetGuide() {
    presetGuideOpen = !presetGuideOpen;
    renderPresetGuide();
  }

  function beginNewPreset() {
    var result = sendState({ type: "preset_select", id: null });
    if (!stateAccepted(result)) {
      setPresetFeedback("COULD NOT START A NEW PRESET.", true);
      return;
    }
    presetDeleteConfirmId = "";
    presetReplaceConfirm = null;
    presetFormOpen = true;
    presetEditId = "";
    renderPresetOptions();
    syncPresetSaveForm(true);
    setPresetFeedback(
      "Name your preset, then choose HEROES.",
      false,
    );
    focus(ui.presetNameInput);
  }

  // Closes the form without touching the saved record or the screen.
  function closePresetForm() {
    presetFormOpen = false;
    presetEditId = "";
    renderPresetOptions();
    syncPresetSaveForm(true);
  }

  function closePresetEdit() {
    sendState({ type: "preset_select", id: null });
    closePresetForm();
    setPresetFeedback("CLOSED.", false);
  }

  function selectPresetForRowAction(id) {
    if (!id) return false;
    if (currentView().repository.selectedId === id) return true;
    var result = sendState({ type: "preset_select", id: id });
    return stateAccepted(result);
  }

  function openPresetForm(preset) {
    var result = sendState({ type: "preset_select", id: preset.id });
    if (result && result.outcome && result.outcome.status === "rejected") {
      setPresetFeedback("THAT PRESET NO LONGER EXISTS.", true);
      return false;
    }
    presetFormOpen = true;
    presetEditId = preset.id;
    renderPresetOptions();
    syncPresetSaveForm(true);
    setPresetFeedback(
      "EDITING " +
        presetDisplayName(preset).toUpperCase() +
        ". SAVE updates this preset.",
      false,
    );
    focus(ui.presetNameInput);
    return true;
  }

  // The open form holds a name that is not saved: any nonempty name on a new
  // preset, or a name that differs from the edited preset's saved name.
  function presetFormHasUnsavedName() {
    if (!presetFormOpen) return false;
    var name = String(
      (ui.presetNameInput && ui.presetNameInput.text) || "",
    ).trim();
    var editPreset = presetEditRecord();
    if (editPreset) return name !== String(editPreset.name || "").trim();
    return name !== "";
  }

  // A row click or EDIT replaces what is on screen. Ask first when no saved
  // preset matches the screen, or when the form holds an unsaved name.
  function hasUnsavedPresetChanges() {
    var view = currentView();
    var repository = view && view.repository ? view.repository : null;
    if (!findPresetRecord(repository ? repository.activeId : "")) return true;
    return presetFormHasUnsavedName();
  }

  // The user preset the live settings came from, when it still exists and
  // no longer equals them. Read fresh on every use; never cached.
  function changedSourcePreset(view) {
    if (!view) view = currentView();
    var source =
      view && view.repository ? view.repository.sourceState : null;
    if (!source || !source.id || source.matches) return null;
    var preset = findPresetRecord(source.id);
    return preset && preset.kind === "user" ? preset : null;
  }

  // The CHANGED source preset when it is the row `id`; otherwise reports the
  // vanished preset and rebuilds the rows.
  function changedPresetFor(id) {
    var preset = changedSourcePreset();
    if (preset && preset.id === String(id || "")) return preset;
    setPresetFeedback(PRESET_GONE_TEXT, true);
    renderPresetOptions();
    return null;
  }

  function beginPresetReplaceConfirm(id, action) {
    dismissDeleteConfirmation();
    presetReplaceConfirm = { id: id, action: action };
    renderPresetOptions();
    setPresetFeedback(
      action === "save"
        ? "SAVE YOUR SETTINGS TO " +
            presetDisplayName(findPresetRecord(id)).toUpperCase() +
            "?"
        : "DISCARD UNSAVED CHANGES?",
      false,
    );
    focusSelectedPresetRow(id);
  }

  function cancelPresetReplace() {
    if (!presetReplaceConfirm) return;
    var id = presetReplaceConfirm.id;
    var action = presetReplaceConfirm.action;
    presetReplaceConfirm = null;
    renderPresetOptions();
    setPresetFeedback(
      action === "save" ? "PRESET CHANGE CANCELED." : "KEPT YOUR CHANGES.",
      false,
    );
    focusSelectedPresetRow(id);
  }

  function confirmPresetReplace() {
    if (!presetReplaceConfirm) return;
    var request = presetReplaceConfirm;
    presetReplaceConfirm = null;
    if (request.action === "edit") performPresetEdit(request.id);
    else if (request.action === "save") performPresetRowSave(request.id);
    else performPresetRowApply(request.id);
  }

  // Inline SAVE on the CHANGED row: preset_save is not undoable, so it goes
  // through the row confirm like DELETE/HIDE.
  function requestPresetRowSave(id) {
    var preset = changedPresetFor(id);
    if (!preset) return false;
    if (presetFormOpen) return false;
    beginPresetReplaceConfirm(preset.id, "save");
    return true;
  }

  // Writes the current live settings into the source preset under its own
  // name. The target is re-read here, never taken from the click.
  function performPresetRowSave(id) {
    var preset = changedPresetFor(id);
    if (!preset) return false;
    dismissDeleteConfirmation();
    var name = presetDisplayName(preset);
    if (!selectPresetForRowAction(preset.id)) {
      setPresetFeedback(PRESET_GONE_TEXT, true);
      renderPresetOptions();
      return false;
    }
    var result = sendState({ type: "preset_save", name: name });
    if (!stateAccepted(result)) {
      setPresetFeedback(
        "COULD NOT SAVE " + name.toUpperCase() + ". NOTHING CHANGED.",
        true,
      );
      renderPresetOptions();
      return false;
    }
    renderPresetOptions();
    syncControls();
    setPresetFeedback(
      "SAVED " + name.toUpperCase() + ".",
      false,
    );
    focusSelectedPresetRow(preset.id);
    return true;
  }

  // REVERT reloads the saved snapshot; preset_apply pushes history, so UNDO
  // brings the live edits back.
  function requestPresetRowRevert(id) {
    var preset = changedPresetFor(id);
    if (!preset) return false;
    if (presetFormOpen) return false;
    dismissDeleteConfirmation();
    presetReplaceConfirm = null;
    var result = sendState({ type: "preset_apply", id: preset.id });
    if (!stateAccepted(result)) {
      setPresetFeedback("COULD NOT APPLY THAT PRESET. NOTHING CHANGED.", true);
      renderPresetOptions();
      return false;
    }
    syncControls();
    setPresetFeedback(
      "REVERTED TO " +
        presetDisplayName(preset).toUpperCase() +
        ". UNDO RESTORES YOUR CHANGES.",
      false,
    );
    focusSelectedPresetRow(preset.id);
    return true;
  }

  function requestPresetRowApply(id) {
    var preset = findPresetRecord(String(id || ""));
    if (!preset) {
      setPresetFeedback(PRESET_GONE_TEXT, true);
      return false;
    }
    // The row being edited is inert: never reload over live edits.
    if (presetFormOpen && presetEditId === preset.id) return false;
    if (hasUnsavedPresetChanges()) {
      beginPresetReplaceConfirm(preset.id, "apply");
      return false;
    }
    return performPresetRowApply(preset.id);
  }

  function performPresetRowApply(id) {
    dismissDeleteConfirmation();
    closePresetForm();
    return requestPresetApplication(id, false);
  }

  function requestPresetEdit(id) {
    var preset = findPresetRecord(String(id || ""));
    if (!preset || preset.kind !== "user") {
      setPresetFeedback(PRESET_GONE_TEXT, true);
      return false;
    }
    if (presetFormOpen && presetEditId === preset.id) {
      focus(ui.presetNameInput);
      return true;
    }
    if (hasUnsavedPresetChanges()) {
      beginPresetReplaceConfirm(preset.id, "edit");
      return false;
    }
    return performPresetEdit(preset.id);
  }

  // EDIT loads the preset first so Current carries its values and APPLIES
  // TO scope, then opens the form for it.
  function performPresetEdit(id) {
    var preset = findPresetRecord(String(id || ""));
    if (!preset || preset.kind !== "user") {
      setPresetFeedback(PRESET_GONE_TEXT, true);
      renderPresetOptions();
      return false;
    }
    dismissDeleteConfirmation();
    var repository = currentView().repository;
    if (!repository || repository.activeId !== preset.id) {
      var result = sendState({ type: "preset_apply", id: preset.id });
      if (!stateAccepted(result)) {
        setPresetFeedback(
          "COULD NOT LOAD " +
            presetDisplayName(preset).toUpperCase() +
            ". NOTHING CHANGED.",
          true,
        );
        renderPresetOptions();
        return false;
      }
      syncControls();
    }
    return openPresetForm(preset);
  }

  function moveSelectedPreset(delta) {
    var view = currentView();
    var id = view && view.repository ? view.repository.selectedId : "";
    if (!id) return false;
    var preset = findPresetRecord(id);
    // Capture the display name before the move so feedback names the preset,
    // never its slot id.
    var name = preset ? presetDisplayName(preset).toUpperCase() : id.toUpperCase();
    presetReplaceConfirm = null;
    var result = sendState({ type: "preset_move", id: id, delta: delta });
    if (!stateAccepted(result) || result.outcome.code === "MOVE_BOUNDARY")
      return false;
    renderPresetOptions();
    setPresetFeedback(
      "MOVED " + name + (delta < 0 ? " UP." : " DOWN."),
      false,
    );
    focusSelectedPresetRow();
    return true;
  }

  function beginDeleteSelectedPreset() {
    var view = currentView();
    var id = view && view.repository ? view.repository.selectedId : "";
    var preset = findPresetRecord(id);
    if (!preset) {
      setPresetFeedback("SELECT A PRESET FIRST.", true);
      return;
    }
    var result = sendState({ type: "preset_remove_request", id: preset.id });
    if (!result || !result.view || !result.view.transactions.confirmation) {
      setPresetFeedback("PRESET NOT FOUND.", true);
      return;
    }
    presetDeleteConfirmId = preset.id;
    presetReplaceConfirm = null;
    renderPresetOptions();
    setPresetFeedback(
      "CONFIRM " +
        (preset.kind === "baked" ? "HIDE " : "DELETE ") +
        presetDisplayName(preset).toUpperCase() +
        ".",
      false,
    );
  }

  function dismissDeleteConfirmation() {
    var view = currentView();
    var confirmation = view && view.transactions
      ? view.transactions.confirmation
      : null;
    if (confirmation && confirmation.kind === "preset_remove")
      sendState({
        type: "preset_remove_cancel",
        token: confirmation.token,
      });
    presetDeleteConfirmId = "";
  }

  function cancelDeleteSelectedPreset() {
    dismissDeleteConfirmation();
    renderPresetOptions();
    setPresetFeedback("PRESET CHANGE CANCELED.", false);
    focusSelectedPresetRow();
  }


  function focusSelectedPresetRow(presetId) {
    var view = currentView();
    var selectedId =
      presetId || (view && view.repository ? view.repository.selectedId : "");
    if (!selectedId || !isValid(ui.presetOptions)) return;
    var rows = ui.presetOptions.Children();
    for (var index = 0; index < rows.length; index++) {
      if (
        rows[index].GetAttributeString("hp_colors_preset_id", "") ===
        selectedId
      ) {
        focus(rows[index]);
        return;
      }
    }
  }

  function confirmDeleteSelectedPreset() {
    var view = currentView();
    var repository = view && view.repository ? view.repository : null;
    var confirmation = view && view.transactions
      ? view.transactions.confirmation
      : null;
    var preset = findPresetRecord(presetDeleteConfirmId);
    if (
      !preset ||
      !repository ||
      repository.selectedId !== preset.id ||
      !confirmation ||
      confirmation.kind !== "preset_remove"
    ) {
      cancelDeleteSelectedPreset();
      return;
    }
    var result = sendState({
      type: "preset_remove_confirm",
      token: confirmation.token,
    });
    if (result && result.outcome && result.outcome.status === "committed") {
      presetDeleteConfirmId = "";
      presetReplaceConfirm = null;
      if (presetEditId === preset.id) {
        presetEditId = "";
        presetFormOpen = false;
      }
      renderPresetOptions();
      syncPresetSaveForm(true);
      setPresetFeedback(
        (preset.kind === "baked" ? "HIDDEN " : "DELETED ") +
          presetDisplayName(preset).toUpperCase() +
          ".",
        false,
      );
      focusSelectedPresetRow();
    }
  }

  function restoreHiddenBakedPresets() {
    var view = currentView();
    if (
      !view ||
      !view.repository ||
      !view.repository.hiddenBakedIds ||
      !view.repository.hiddenBakedIds.length
    )
      return;
    sendState({ type: "preset_restore_baked" });
    presetReplaceConfirm = null;
    renderPresetOptions();
    setPresetFeedback("REWRITE DEFAULT SHOWN. YOUR SETTINGS DID NOT CHANGE.", false);
    // SHOW ROW collapses once nothing is hidden; move focus to the shown preset.
    focusSelectedPresetRow("baked_default");
  }

  function copySelectedPreset() {
    var view = currentView();
    var selectedId = view && view.repository ? view.repository.selectedId : "";
    if (!selectedId) {
      setPresetFeedback("SELECT A PRESET FIRST.", true);
      return;
    }
    var result = sendState({ type: "preset_copy_selected" });
    var failed = !clipboardEffectSucceeded(result);
    setPresetFeedback(
      failed ? "COPY FAILED — PRESET CODE NOT COPIED." : "COPIED PRESET.",
      failed,
    );
  }

  function copyAllPresets() {
    var result = sendState({ type: "preset_copy_all" });
    var failed = !clipboardEffectSucceeded(result);
    setPresetFeedback(
      failed ? "NO PRESETS TO COPY." : "COPIED ALL PRESETS.",
      failed,
    );
  }

  function setPresetTransferFeedback(text, isError) {
    setText(ui.presetTransferFeedback, text || "");
    setClass(ui.presetTransferDialog, "Error", !!isError);
  }

  function clipboardEffectSucceeded(result) {
    return !!(stateAccepted(result) && lastClipboardCopied === true);
  }

  function pasteTextEntry(input, isCurrent, accept, reject) {
    var text = String((input && input.text) || "").trim();
    if (text) {
      accept(text, false);
      return;
    }
    var requested = false;
    try {
      requested =
        $.DispatchEvent("TextEntryInsertFromClipboard", input) !== false;
    } catch {}
    if (!requested) {
      reject();
      return;
    }
    text = String((input && input.text) || "").trim();
    if (text) {
      accept(text, true);
      return;
    }
    try {
      $.Schedule(0.05, function () {
        if (!isCurrent()) return;
        var pasted = String((input && input.text) || "").trim();
        if (pasted) accept(pasted, true);
        else reject();
      });
    } catch {
      reject();
    }
  }

  function openPresetTransferDialog() {
    presetTransferRequest += 1;
    closePicker();
    closeScopeDialog();
    setText(ui.presetTransferInput, "");
    setClass(ui.presetTransferDialog, "Open", true);
    setPresetTransferFeedback("PASTE A PRESET CODE.", false);
    focus(ui.presetTransferInput);
  }

  function closePresetTransferDialog() {
    presetTransferRequest += 1;
    if (!isValid(ui.presetTransferDialog)) return;
    setClass(ui.presetTransferDialog, "Open", false);
    setClass(ui.presetTransferDialog, "Error", false);
    setText(ui.presetTransferInput, "");
    focus(ui.presetImportButton);
  }

  function importPresetTransfer(raw) {
    var beforeUserCount = userPresetRows(currentView()).length;
    var result = sendState({ type: "preset_import", raw: String(raw || "") });
    if (!stateAccepted(result)) {
      setPresetTransferFeedback(
        "COULD NOT IMPORT. CHECK THE PRESET CODE.",
        true,
      );
      return false;
    }
    var importedCount = Math.max(
      0,
      userPresetRows(currentView()).length - beforeUserCount,
    );
    setText(ui.presetTransferInput, "");
    setPresetTransferFeedback(
      "IMPORTED " + String(importedCount) +
        (importedCount === 1 ? " PRESET." : " PRESETS."),
      false,
    );
    renderPresetOptions();
    syncPresetSaveForm(true);
    return true;
  }

  function confirmPresetTransferImport() {
    presetTransferRequest += 1;
    var request = presetTransferRequest;
    var transferInput = ui.presetTransferInput;
    pasteTextEntry(
      transferInput,
      function () {
        return (
          request === presetTransferRequest &&
          transferInput === ui.presetTransferInput &&
          isValid(transferInput) &&
          isValid(ui.presetTransferDialog) &&
          panelHasClass(ui.presetTransferDialog, "Open")
        );
      },
      function (text) {
        importPresetTransfer(text);
      },
      function () {
        setPresetTransferFeedback(
          "CLIPBOARD PASTE UNAVAILABLE — PASTE CODE MANUALLY",
          true,
        );
      },
    );
  }
  function saveCurrentPreset() {
    if (!presetFormOpen) return;
    var name = String((ui.presetNameInput && ui.presetNameInput.text) || "").trim();
    if (!name) {
      setPresetFeedback("ENTER A PRESET NAME.", true);
      focus(ui.presetNameInput);
      return;
    }
    var editing = findPresetRecord(presetEditId);
    if (!editing || editing.kind !== "user") {
      sendState({ type: "preset_select", id: null });
      presetEditId = "";
    } else if (!selectPresetForRowAction(editing.id)) {
      setPresetFeedback(PRESET_GONE_TEXT, true);
      return;
    }
    var result = sendState({ type: "preset_save", name: name });
    if (!stateAccepted(result)) {
      setPresetFeedback(
        editing
          ? "COULD NOT SAVE " + name.toUpperCase() + ". NOTHING CHANGED."
          : "COULD NOT CREATE " + name.toUpperCase() + ". NOTHING CHANGED.",
        true,
      );
      return;
    }
    var savedId =
      result.view && result.view.repository
        ? result.view.repository.selectedId
        : "";
    presetFormOpen = false;
    presetEditId = "";
    renderPresetOptions();
    syncPresetSaveForm(true);
    if (editing) {
      requestPresetApplication(savedId, true);
      return;
    }
    setPresetFeedback("CREATED " + name.toUpperCase() + ".", false);
  }

  // Lightweight badge/class refresh for existing rows. Every live mutation
  // path reaches syncControls(), which calls this, so the ACTIVE/CHANGED
  // badges can never go stale after a value, slider, condition, reset,
  // import, or navigation change. Rows are not rebuilt, so focus and typed
  // names stay. Badge precedence per row: EDITING > CHANGED > ACTIVE.
  function refreshPresetActivity(view) {
    if (!view) view = currentView();
    // The name form suppresses SAVE TO PRESET (two save surfaces at once) and
    // an open dialog follows the current source; renderStoreStatus below
    // refreshes the footer button.
    refreshSaveToRows(view);
    var repository =
      isValid(ui.presetOptions) && view && view.repository
        ? view.repository
        : null;
    if (repository) {
      var source = repository.sourceState || null;
      var changedId = source && source.id && !source.matches ? source.id : "";
      var gestureActive = !!(view.transactions && view.transactions.gesture);
      // One save surface at a time: inline SAVE/REVERT hide while a form is
      // open or a slider drag is in progress.
      var actionsAllowed = !presetFormOpen && !gestureActive;
      for (var index = 0; index < presetRowRefs.length; index++) {
        var ref = presetRowRefs[index];
        var row = ref.row;
        if (!isValid(row)) continue;
        var active = ref.id === repository.activeId;
        var editing = presetFormOpen && presetEditId === ref.id;
        var changed = !editing && ref.id === changedId;
        var showChangedActions = changed && actionsAllowed;
        setClass(row, "Active", active);
        setClass(row, "Changed", changed);
        setClass(row, "RowChanged", showChangedActions);
        // Confirming rows carry no status label or actions; the helpers
        // ignore the nulls.
        setText(
          ref.status,
          editing ? "EDITING" : changed ? "CHANGED" : active ? "ACTIVE" : "",
        );
        setRowActionEnabled(ref.edit, !showChangedActions);
        setRowActionEnabled(ref.save, showChangedActions);
        setRowActionEnabled(ref.revert, showChangedActions);
      }
    }
    renderStoreStatus();
  }

  function requestPresetApplication(id, savedFirst) {
    var preset = findPresetRecord(String(id || ""));
    if (!preset) {
      setPresetFeedback(
        savedFirst
          ? "PRESET SAVED, BUT IT COULD NOT BE APPLIED."
          : PRESET_GONE_TEXT,
        true,
      );
      return false;
    }
    var result = sendState({ type: "preset_apply", id: preset.id });
    if (!stateAccepted(result)) {
      setPresetFeedback(
        savedFirst
          ? "PRESET SAVED, BUT IT COULD NOT BE APPLIED."
          : "COULD NOT APPLY THAT PRESET. NOTHING CHANGED.",
        true,
      );
      return false;
    }
    syncControls();
    setPresetFeedback(
      (savedFirst ? "SAVED " : "APPLIED ") +
        presetDisplayName(preset).toUpperCase() +
        ".",
      false,
    );
    return true;
  }

  // SAVE TO PRESET (footer): pick a saved preset to replace with the settings
  // on screen, or save them as a new All Heroes preset. Saving never changes
  // a preset's HEROES, and the saved preset is applied so it owns the screen.

  function saveToDialogOpen() {
    return isValid(ui.saveToDialog) && ui.saveToDialog.BHasClass("Open");
  }

  function setSaveToFeedback(text, isError) {
    setText(ui.saveToFeedback, text || "");
    setClass(ui.saveToDialog, "Error", !!isError);
  }

  function userPresetRows(view) {
    var rows =
      view && view.repository && view.repository.allRows
        ? view.repository.allRows
        : [];
    var result = [];
    for (var index = 0; index < rows.length; index++)
      if (rows[index].kind === "user") result.push(rows[index]);
    return result;
  }

  // The first All Heroes preset is the one hero presets inherit from, so
  // replacing it changes every hero preset too.
  function saveToConfirmText(preset, presets) {
    var baseId = "";
    var hasHeroPreset = false;
    for (var index = 0; index < presets.length; index++) {
      if (!baseId && presets[index].mode === HERO_SCOPE_ALL)
        baseId = presets[index].id;
      if (scopeUsesHeroes(presets[index].mode)) hasHeroPreset = true;
    }
    return (
      "CLICK AGAIN TO REPLACE " +
      presetDisplayName(preset).toUpperCase() +
      (hasHeroPreset && baseId === preset.id
        ? " · ALSO CHANGES HERO PRESETS"
        : "")
    );
  }

  function applySaveToRows(view) {
    var presets = userPresetRows(view);
    var source = changedSourcePreset(view);
    var changedId = source ? source.id : "";
    for (var index = 0; index < saveToRows.length; index++) {
      var entry = saveToRows[index];
      var preset = null;
      for (var found = 0; found < presets.length; found++) {
        if (presets[found].id === entry.id) {
          preset = presets[found];
          break;
        }
      }
      var armed = !!preset && entry.id === saveToArmedId;
      var changed = !!preset && entry.id === changedId;
      setClass(entry.row, "Confirming", armed);
      setClass(entry.row, "Changed", changed);
      setText(entry.tag, changed ? "CHANGED" : "");
      setText(entry.message, armed ? saveToConfirmText(preset, presets) : "");
      setText(entry.saveLabel, armed ? "REPLACE?" : "SAVE");
    }
  }

  function refreshSaveToRows(view) {
    if (!saveToRows.length || !saveToDialogOpen()) return;
    applySaveToRows(view || currentView());
  }

  function createSaveToRow(preset, index, heroes) {
    var row = $.CreatePanel(
      "Panel",
      ui.saveToOptions,
      "HPColorsSaveToOption" + index,
    );
    if (!isValid(row)) return;
    row.AddClass("HPColorsHeroOption");
    row.AddClass("HPColorsSaveToOption");
    row.SetAttributeString("hp_colors_save_to_id", preset.id);
    var name = $.CreatePanel("Label", row, "HPColorsSaveToOptionName" + index);
    var scope = $.CreatePanel("Label", row, "HPColorsSaveToOptionScope" + index);
    var tag = $.CreatePanel("Label", row, "HPColorsSaveToOptionTag" + index);
    var message = $.CreatePanel(
      "Label",
      row,
      "HPColorsSaveToOptionMessage" + index,
    );
    if (!isValid(name) || !isValid(scope) || !isValid(tag) || !isValid(message))
      return;
    name.AddClass("HPColorsSaveToOptionName");
    scope.AddClass("HPColorsSaveToOptionScope");
    tag.AddClass("HPColorsSaveToOptionTag");
    message.AddClass("HPColorsSaveToOptionMessage");
    name.text = presetDisplayName(preset);
    scope.text = presetScopeSummary(preset, heroes);
    // Only the row's own SAVE button acts; the row body is inert.
    var saveId = "HPColorsSaveToRowSave" + index;
    var save = createPresetRowAction(
      row,
      saveId,
      "HPColorsSaveToRowSave",
      "SAVE",
      true,
      function () {
        requestSaveToPreset(preset.id);
      },
    );
    var saveLabel = findChild(save, saveId + "Label");
    if (!isValid(save) || !isValid(saveLabel)) return;
    saveToRows.push({
      id: preset.id,
      row: row,
      tag: tag,
      message: message,
      saveLabel: saveLabel,
    });
  }

  // Rebuilt on every open, so a reopened dialog is always unarmed.
  function renderSaveToOptions() {
    saveToRows = [];
    if (!isValid(ui.saveToOptions)) return;
    try {
      ui.saveToOptions.RemoveAndDeleteChildren();
    } catch {}
    var view = currentView();
    var heroes = viewHeroes(view);
    var presets = userPresetRows(view);
    for (var index = 0; index < presets.length; index++)
      createSaveToRow(presets[index], index, heroes);
    setSaveToFeedback(presets.length ? "" : SAVE_TO_EMPTY_TEXT, false);
    applySaveToRows(view);
  }

  function disarmSaveTo() {
    saveToGeneration += 1;
    if (!saveToArmedId) return;
    saveToArmedId = "";
    refreshSaveToRows();
  }

  // Arming waits SAVE_TO_CONFIRM_SEC for the second click. The timer only
  // disarms, and only the arm that scheduled it: it can never save.
  function armSaveTo(id) {
    saveToArmedId = id;
    saveToGeneration += 1;
    var generation = saveToGeneration;
    refreshSaveToRows();
    try {
      $.Schedule(SAVE_TO_CONFIRM_SEC, function () {
        if (generation === saveToGeneration) disarmSaveTo();
      });
    } catch {}
  }

  // While the preset the settings came from is CHANGED, the footer button
  // names it and saves into it in one click; ▼ then opens the list. The
  // name is cut to fit the button.
  var SAVE_TO_NAME_LIMIT = 10;
  var saveToNamedId = "";

  function renderSaveToButton(view) {
    var source = changedSourcePreset(view);
    // A layout without the label cannot name the target, so it keeps the list.
    var named = source && isValid(ui.saveToPresetLabel) ? source : null;
    var name = named ? presetDisplayName(named).toUpperCase() : "";
    if (name.length > SAVE_TO_NAME_LIMIT)
      name = name.slice(0, SAVE_TO_NAME_LIMIT - 1).replace(/\s+$/, "") + "…";
    saveToNamedId = named ? named.id : "";
    setText(ui.saveToPresetLabel, named ? "SAVE TO " + name : "SAVE TO PRESET");
    // Glows as a save reminder while the settings on screen are not saved in
    // a preset: a CHANGED source, an edited Rewrite Default, or no preset.
    setClass(
      ui.saveToPresetButton,
      "Unsaved",
      !!source || presetChipState().changed,
    );
    setEnabled(ui.saveToPresetButton, !presetFormOpen);
    setClass(ui.saveToMoreButton, "HPColorsFooterActionHidden", !named);
    setRowActionEnabled(ui.saveToMoreButton, !!named && !presetFormOpen);
  }

  // One click saves into the named source. The target is re-read now; if it
  // is gone or no longer CHANGED, nothing is saved and the button refreshes.
  function activateSaveToPreset() {
    if (panelHasClass(ui.saveToPresetButton, "Disabled")) return;
    if (!saveToNamedId) {
      openSaveToDialog();
      return;
    }
    var preset = changedSourcePreset();
    if (!preset || preset.id !== saveToNamedId) {
      renderSaveToButton();
      return;
    }
    var result = sendState({ type: "preset_save_to", id: preset.id });
    if (!stateAccepted(result)) {
      showResetFeedback(
        "COULD NOT SAVE " + chipPresetName(preset) + ". NOTHING CHANGED.",
        SAVE_TO_FEEDBACK_SEC,
      );
      return;
    }
    finishSaveTo(preset.id, "SAVED TO " + chipPresetName(preset) + ".");
    focus(ui.saveToPresetButton);
  }

  function openSaveToDialog() {
    if (!isValid(ui.saveToDialog)) return;
    if (panelHasClass(ui.saveToPresetButton, "Disabled")) return;
    closeTransferDialog();
    closePresetTransferDialog();
    closeScopeDialog();
    closePicker();
    disarmSaveTo();
    renderSaveToOptions();
    setClass(ui.saveToDialog, "Open", true);
    focus(ui.saveToDialog);
  }

  function closeSaveToDialog(restoreFocus) {
    disarmSaveTo();
    if (!saveToDialogOpen()) return;
    setClass(ui.saveToDialog, "Open", false);
    setSaveToFeedback("", false);
    if (restoreFocus !== false && state.open) focus(ui.saveToPresetButton);
  }

  function saveToTargetGone() {
    disarmSaveTo();
    renderSaveToOptions();
    setSaveToFeedback(PRESET_GONE_TEXT, true);
    return false;
  }

  // The saved preset becomes the one on screen: apply it, then tell the
  // player with a short header note. Saving itself is not undoable; the
  // apply is.
  function finishSaveTo(id, note) {
    closeSaveToDialog(true);
    dismissDeleteConfirmation();
    presetReplaceConfirm = null;
    renderPresetOptions();
    requestPresetApplication(id, true);
    showResetFeedback(note, SAVE_TO_FEEDBACK_SEC);
  }

  // First SAVE click arms the row; a second click on the same row saves. The
  // target is re-read every time, never trusted from the earlier click.
  function requestSaveToPreset(id) {
    var preset = findPresetRecord(String(id || ""));
    if (!preset || preset.kind !== "user") return saveToTargetGone();
    if (saveToArmedId !== preset.id) {
      setSaveToFeedback("", false);
      armSaveTo(preset.id);
      return true;
    }
    var result = sendState({ type: "preset_save_to", id: preset.id });
    if (!stateAccepted(result)) {
      disarmSaveTo();
      setSaveToFeedback(
        "COULD NOT SAVE " +
          presetDisplayName(preset).toUpperCase() +
          ". NOTHING CHANGED.",
        true,
      );
      return false;
    }
    finishSaveTo(preset.id, "SAVED TO " + chipPresetName(preset) + ".");
    return true;
  }

  // The auto name is PRESET N from the state's next number, skipping any
  // preset already named that (case does not matter).
  function nextAutoPresetName(view) {
    var repository = view && view.repository ? view.repository : null;
    var rows = repository && repository.allRows ? repository.allRows : [];
    var taken = [];
    for (var index = 0; index < rows.length; index++)
      taken.push(presetDisplayName(rows[index]).toUpperCase());
    var number = Math.max(
      1,
      Math.floor(Number(repository && repository.nextUserNumber) || 1),
    );
    while (taken.indexOf("PRESET " + String(number)) >= 0) number += 1;
    return "PRESET " + String(number);
  }

  // + NEW PRESET (ALL HEROES): the settings on screen become a new preset for
  // all heroes. HEROES are set later on the PRESETS page.
  function saveToNewPreset() {
    var name = nextAutoPresetName(currentView());
    var deselected = sendState({ type: "preset_select", id: null });
    var result =
      stateAccepted(deselected)
        ? sendState({ type: "preset_save", name: name, allHeroes: true })
        : null;
    if (!stateAccepted(result)) {
      setSaveToFeedback("COULD NOT CREATE " + name + ". NOTHING CHANGED.", true);
      return false;
    }
    var savedId =
      result.view && result.view.repository ? result.view.repository.selectedId : "";
    finishSaveTo(
      savedId,
      "SAVED AS " + name + ". SET ITS HEROES ON PRESETS.",
    );
    return true;
  }



  function setTransferFeedback(message, isError) {
    setText(ui.transferFeedback, message);
    setClass(ui.transferDialog, "Error", !!isError);
  }

  function closeTransferDialog() {
    transferRequest += 1;
    if (!isValid(ui.transferDialog) || !ui.transferDialog.BHasClass("Open"))
      return;
    setClass(ui.transferDialog, "Open", false);
    setClass(ui.transferDialog, "Error", false);
    setText(ui.transferInput, "");
    focus(ui.transferButton);
  }

  function copyCurrentSettings() {
    var result = sendState({ type: "settings_copy" });
    var copied = clipboardEffectSucceeded(result);
    setTransferFeedback(
      copied
        ? "CURRENT SETTINGS COPIED"
        : "COPY FAILED — SETTINGS CODE NOT COPIED",
      !copied,
    );
    return copied;
  }

  function openTransferDialog() {
    transferRequest += 1;
    closePicker();
    setText(ui.transferInput, "");
    setClass(ui.transferDialog, "Open", true);
    setTransferFeedback(
      "READY — CHOOSE COPY CURRENT OR IMPORT & APPLY",
      false,
    );
    focus(ui.transferInput);
  }

  function applyImportedText(raw, pasted) {
    var result = sendState({
      type: "settings_import",
      raw: String(raw || ""),
    });
    var outcome = result && result.outcome ? result.outcome : null;
    if (!outcome || outcome.status === "rejected") {
      setTransferFeedback(
        outcome && outcome.code ? outcome.code : "INVALID HPCR2 CODE",
        true,
      );
      return;
    }
    if (outcome.status === "noop") {
      setTransferFeedback("SETTINGS ALREADY MATCH", false);
      return;
    }
    setText(ui.transferInput, "");
    setTransferFeedback(
      pasted ? "PASTED AND APPLIED" : "IMPORTED AND APPLIED",
      false,
    );
    syncControls();
  }

  function showManualPasteFallback() {
    setTransferFeedback(
      "CLIPBOARD PASTE UNAVAILABLE — PASTE CODE MANUALLY",
      true,
    );
    focus(ui.transferInput);
  }

  function importLiveSettings() {
    transferRequest += 1;
    var request = transferRequest;
    var transferInput = ui.transferInput;
    pasteTextEntry(
      transferInput,
      function () {
        return (
          request === transferRequest &&
          transferInput === ui.transferInput &&
          isValid(transferInput) &&
          isValid(ui.transferDialog) &&
          panelHasClass(ui.transferDialog, "Open")
        );
      },
      applyImportedText,
      showManualPasteFallback,
    );
  }

  function clampNumber(value, min, max, fallback, increment) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    var step = increment || 1;
    number = Math.round(number / step) * step;
    if (step < 1) number = Number(number.toFixed(4));
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


  function presetDisplayName(preset) {
    return preset ? String(preset.name || "") : "";
  }



  function presetRecords() {
    var view = currentView();
    return view && view.repository && view.repository.allRows
      ? view.repository.allRows
      : [];
  }

  function findPresetRecord(id) {
    var records = presetRecords();
    for (var index = 0; index < records.length; index++)
      if (records[index].id === id) return records[index];
    return null;
  }


  function serializeChange(revision, values) {
    return JSON.stringify({
      magic_word: CONFIG_MAGIC,
      version: CONFIG_VERSION,
      revision: Number(revision) || 0,
      values: values,
    });
  }

  function decodePublishedState(raw) {
    if (!raw) return "";
    try {
      var payload = JSON.parse(raw);
      if (
        !payload ||
        payload.magic_word !== CONFIG_MAGIC ||
        payload.version !== CONFIG_VERSION ||
        !payload.values
      )
        return "";
      return JSON.stringify({
        version: 1,
        revision: Number(payload.revision) || 0,
        values: payload.values,
      });
    } catch {
      return "";
    }
  }



  function readRootAttribute(name) {
    if (!isValid(ui.absoluteRoot) || !ui.absoluteRoot.GetAttributeString) return "";
    try {
      return String(ui.absoluteRoot.GetAttributeString(name, "") || "");
    } catch {
      return "";
    }
  }
  function writeRootAttribute(name, value) {
    if (!isValid(ui.absoluteRoot) || !ui.absoluteRoot.SetAttributeString)
      return false;
    try {
      if (
        !ui.absoluteRoot.GetAttributeString ||
        ui.absoluteRoot.GetAttributeString(name, "") !== value
      )
        ui.absoluteRoot.SetAttributeString(name, value);
      return true;
    } catch {
      return false;
    }
  }

  // -- Durable save --

  function storeLog(message) {
    $.Msg("[HP Colors Rewrite][store] " + message);
  }

  function storeChecksum(text) {
    return $.HPColorsV2StorageFactory.codec.checksum(String(text));
  }

  // Shipped defaults, read once through the state seam; hydration may need
  // them before the menu's own state instance exists.
  var shippedDefaults = null;
  function storeDefaults() {
    if (!shippedDefaults)
      shippedDefaults = $.HPColorsV2StateFactory.create({
        sessionRaw: null,
        publishedRaw: null,
      }).read().schema.defaults;
    return shippedDefaults;
  }
  function dropDefaults(values, defaults) {
    if (!values || typeof values !== "object") return values;
    var sparse = {};
    for (var key in values) {
      if (
        Object.prototype.hasOwnProperty.call(values, key) &&
        values[key] !== defaults[key]
      )
        sparse[key] = values[key];
    }
    if (values.staminaShape === "arrow" &&
        (values.staminaWidth !== undefined && values.staminaWidth !== defaults.staminaWidth ||
         values.staminaHeight !== undefined && values.staminaHeight !== defaults.staminaHeight ||
         values.enemyStaminaColorEnabled === true))
      sparse.staminaShape = "arrow";
    return sparse;
  }

  // What the store keeps: the session without effectiveRevision (it moves
  // with hero and ability transitions that change no setting) and with only
  // non-default values. Hydration refills defaults through normalizeValues,
  // so a value left at default follows the shipped default in later builds.
  function durableBody(raw) {
    var data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      return "";
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return "";
    var defaults = storeDefaults();
    delete data.effectiveRevision;
    data.values = dropDefaults(data.values, defaults);
    var lists = [data.scopes, data.userPresets];
    for (var listIndex = 0; listIndex < lists.length; listIndex++) {
      var rows = Array.isArray(lists[listIndex]) ? lists[listIndex] : [];
      for (var rowIndex = 0; rowIndex < rows.length; rowIndex++)
        if (rows[rowIndex]) rows[rowIndex].values = dropDefaults(rows[rowIndex].values, defaults);
    }
    return JSON.stringify(data);
  }

  function detectLegacyLayout(storePanel) {
    return isValid(find(LEGACY_PRESET_STORE_ID)) || !isValid(storePanel);
  }

  function ensureStorage() {
    if (storage) return storage;
    var storePanel = find(STORE_PANEL_ID);
    persist.legacyLayout = detectLegacyLayout(storePanel);
    if (persist.legacyLayout)
      storeLog("old preset VPK layout detected: delete pak01_dir.vpk from citadel/addons");
    var factory = $.HPColorsV2StorageFactory;
    if (!factory || !isCallable(factory.create) || !isValid(storePanel)) {
      storeLog("unavailable: storage module or panel missing");
      return null;
    }
    storage = factory.create({ panel: storePanel });
    storage.start();
    return storage;
  }

  function markSaved(hash, status) {
    persist.ackHash = hash;
    writeRootAttribute(STORE_ACK_ATTR, hash);
    if (status) writeRootAttribute(STORE_STATUS_ATTR, status);
  }

  function setGate(gate) {
    persist.gate = gate;
    if (gate === "open")
      writeRootAttribute(STORE_STATUS_ATTR, persist.forgotten ? "forgotten" : "ok");
    else if (gate === "blocked") writeRootAttribute(STORE_STATUS_ATTR, "blocked");
    renderStoreStatus();
  }

  // Writes stay closed until a read in this process proves what the store
  // holds, so defaults can never replace a save that failed to load.
  function restoreProcessGate(sessionRaw) {
    var status = readRootAttribute(STORE_STATUS_ATTR);
    persist.ackHash = readRootAttribute(STORE_ACK_ATTR);
    persist.forgotten = status === "forgotten";
    if (!storage || status === "blocked") {
      setGate("blocked");
      return;
    }
    if (status === "ok" || status === "forgotten") {
      setGate("open");
      return;
    }
    var expected = durableBody(sessionRaw);
    persist.gate = "checking";
    renderStoreStatus();
    storage.load(function (outcome) {
      if (!isValid(context) || persist.gate !== "checking") return;
      if (outcome.kind === "absent") {
        persist.ackHash = "";
      } else if (outcome.kind === "valid" && outcome.body === expected) {
        markSaved(storeChecksum(expected));
      } else {
        storeLog("session differs from the unverified store: saving paused");
        setGate("blocked");
        return;
      }
      setGate("open");
      schedulePersist(readRootAttribute(MENU_STATE_ATTR), false);
    });
  }

  function applyLoadOutcome(outcome) {
    var kind = outcome ? outcome.kind : "error";
    if (kind === "valid") {
      markSaved(storeChecksum(outcome.body));
      setGate("open");
      storeLog(
        "restored saved settings" +
          (outcome.source === "previous" ? " from the backup record" : ""),
      );
      return outcome.body;
    }
    if (kind === "absent") {
      markSaved("");
      setGate("open");
      storeLog("no saved settings yet");
      return null;
    }
    storeLog(
      "saved settings unreadable (" + kind +
        (outcome && outcome.error ? ": " + outcome.error : "") +
        "); saving paused so the stored data is kept",
    );
    setGate("blocked");
    return null;
  }

  function cancelPersistTimer() {
    if (persist.timer === null) return;
    try {
      $.CancelScheduled(persist.timer);
    } catch {}
    persist.timer = null;
  }

  // Called for every session change, so it only records the latest raw
  // session; serialization and comparison wait for the debounced flush.
  // After Forget, only a deliberate edit may create a save again.
  function schedulePersist(raw, deliberate) {
    if (!raw) return;
    if (persist.forgotten) {
      if (!deliberate) return;
      persist.forgotten = false;
    }
    persist.pendingRaw = raw;
    armPersist(PERSIST_DEBOUNCE_SEC);
  }

  function armPersist(delay) {
    if (persist.gate === "open" && persist.timer === null) {
      try {
        persist.timer = $.Schedule(delay, function () {
          persist.timer = null;
          flushPersist();
        });
      } catch {
        persist.timer = null;
      }
    }
    renderStoreStatus();
  }

  function flushPersist() {
    cancelPersistTimer();
    var raw = persist.pendingRaw;
    if (persist.inFlight || persist.gate !== "open" || !storage || !raw) {
      renderStoreStatus();
      return;
    }
    persist.pendingRaw = "";
    var body = durableBody(raw);
    var hash = body ? storeChecksum(body) : persist.ackHash;
    if (hash === persist.ackHash) {
      persist.failures = 0;
      persist.lastError = "";
      renderStoreStatus();
      return;
    }
    persist.inFlight = true;
    renderStoreStatus();
    storage.save(body, function (result) {
      persist.inFlight = false;
      if (!isValid(context)) return;
      if (result && result.ok) {
        persist.failures = 0;
        persist.lastError = "";
        markSaved(hash, "ok");
        if (persist.pendingRaw) armPersist(PERSIST_DEBOUNCE_SEC);
        else renderStoreStatus();
        return;
      }
      // Keep the newest unsaved session and retry with backoff; an oversized
      // save waits for a change that makes it smaller.
      persist.failures += 1;
      persist.lastError = result ? String(result.error || "") : "";
      if (!persist.pendingRaw) persist.pendingRaw = raw;
      storeLog("save failed (" + persist.failures + "): " + persist.lastError);
      if (persist.lastError !== "too_large" && persist.failures < PERSIST_FAILURE_LIMIT)
        armPersist(PERSIST_RETRY_SEC * persist.failures);
      else renderStoreStatus();
    });
  }

  function resetForgetConfirm() {
    forgetConfirming = false;
    forgetConfirmGeneration += 1;
    setText(ui.storeForgetLabel, "CLEAR PC SAVE");
    setClass(ui.storeForgetButton, "Confirming", false);
  }

  // Forget removes only this mod's two keys. Live settings stay; the next
  // deliberate edit saves again because the kept body is recorded as acked.
  // It also works while saving is blocked, so a save this build cannot read
  // (say, from a newer version) can still be removed on purpose.
  function canForget() {
    return !!storage && !persist.forgetting &&
      (persist.gate === "open" || persist.gate === "blocked");
  }

  function requestForget() {
    if (!canForget()) {
      renderStoreStatus();
      return;
    }
    if (!forgetConfirming) {
      forgetConfirming = true;
      forgetConfirmGeneration += 1;
      var generation = forgetConfirmGeneration;
      setText(ui.storeForgetLabel, "CONFIRM CLEAR");
      setClass(ui.storeForgetButton, "Confirming", true);
      try {
        $.Schedule(FORGET_CONFIRM_SEC, function () {
          if (generation === forgetConfirmGeneration) resetForgetConfirm();
        });
      } catch {}
      return;
    }
    resetForgetConfirm();
    cancelPersistTimer();
    persist.pendingRaw = "";
    var keptHash = storeChecksum(durableBody(readRootAttribute(MENU_STATE_ATTR)));
    persist.forgetting = true;
    renderStoreStatus();
    storage.forget(function (result) {
      persist.forgetting = false;
      if (!isValid(context)) return;
      if (result && result.ok) {
        persist.forgotten = true;
        persist.failures = 0;
        persist.lastError = "";
        markSaved(keptHash, "forgotten");
        // The store is empty now, so nothing unreadable is left to protect.
        if (persist.gate === "blocked") setGate("open");
        showResetFeedback("SAVE CLEARED");
      } else {
        storeLog("forget failed: " + String(result && result.error));
        showResetFeedback("COULD NOT CLEAR SAVE");
      }
    });
  }

  function storeStatusText() {
    if (persist.legacyLayout) return "OLD PRESET VPK";
    if (hydration.phase === "pending" || persist.gate === "checking") return "LOADING";
    if (persist.gate !== "open") return "SAVE UNAVAILABLE";
    if (persist.lastError === "too_large") return "SAVE TOO LARGE";
    if (persist.failures >= PERSIST_FAILURE_LIMIT) return "SAVE UNAVAILABLE";
    if (persist.failures > 0) return "SAVE RETRYING";
    // This chip reports the local autosave of live settings on this PC, not a
    // named-preset update; the copy says so, and only claims SAVED once a
    // write or load has actually been acknowledged (ackHash is nonempty).
    if (persist.inFlight || persist.timer !== null || persist.forgetting)
      return "SAVING ON THIS PC...";
    if (persist.forgotten) return "SAVE CLEARED";
    return persist.ackHash ? "SAVED ON THIS PC" : "LOCAL SAVE READY";
  }

  // Healthy local save is silent; the chip names the preset the current
  // settings belong to, so players see what SAVE would update. Save
  // problems and loading still take the chip over.
  var STORE_QUIET_STATUS = {
    "SAVING ON THIS PC...": true,
    "SAVED ON THIS PC": true,
    "LOCAL SAVE READY": true,
  };
  var CHIP_NAME_LIMIT = 16;

  function chipPresetName(preset) {
    var name = presetDisplayName(preset).toUpperCase();
    if (name.length > CHIP_NAME_LIMIT)
      name = name.slice(0, CHIP_NAME_LIMIT - 1) + "…";
    return name;
  }

  function presetChipState() {
    var view = currentView();
    var repository = view && view.repository ? view.repository : null;
    if (!repository) return { text: "", changed: false };
    var source = repository.sourceState || null;
    var preset = findPresetRecord(source && source.id ? source.id : "");
    var changed = !!(preset && !source.matches);
    if (!preset) preset = findPresetRecord(repository.activeId || "");
    if (!preset) return { text: "NOT SAVED TO A PRESET", changed: true };
    var name = chipPresetName(preset);
    return {
      text: "PRESET: " + name + (changed ? " · CHANGED" : ""),
      changed: changed,
    };
  }

  function renderStoreStatus() {
    var storeText = storeStatusText();
    var warning =
      storeText === "UPDATE PRESET FILE" ||
      storeText === "SAVE UNAVAILABLE" ||
      storeText === "SAVE RETRYING" ||
      storeText === "SAVE TOO LARGE";
    var chip =
      !resetFeedbackText && STORE_QUIET_STATUS[storeText]
        ? presetChipState()
        : null;
    setClass(ui.liveStatus, "StoreWarning", warning);
    setClass(ui.liveStatus, "PresetChanged", !!(chip && chip.changed));
    // The footer SAVE TO PRESET glows while the settings are not saved in a
    // preset, and names its target while a saved source preset is CHANGED.
    renderSaveToButton();
    setEnabled(ui.storeForgetButton, canForget());
    if (
      isValid(ui.liveStatus) &&
      ui.liveStatus.GetAttributeString &&
      ui.liveStatus.GetAttributeString("hp_colors_store_status", "") !== storeText
    )
      ui.liveStatus.SetAttributeString("hp_colors_store_status", storeText);
    setText(ui.liveStatus, resetFeedbackText || (chip ? chip.text : storeText));
  }

  function writeMenuState(raw) {
    return !!raw && writeRootAttribute(MENU_STATE_ATTR, raw);
  }

  function dispatchChange(serializedPayload) {
    try {
      $.DispatchEvent(EVENT_CHANNEL, serializedPayload);
    } catch (error) {
      $.Msg("[HP Colors Rewrite] settings dispatch failed: " + String(error));
    }
  }

  function replayDelay() {
    if (replayDispatches < REPLAY_HOT_COUNT) return REPLAY_HOT_SEC;
    if (replayDispatches < REPLAY_WARM_COUNT) return REPLAY_WARM_SEC;
    return REPLAY_IDLE_SEC;
  }

  function snapshotReplay(generation) {
    var view = currentView();
    if (
      !replayRunning ||
      generation !== replayGeneration ||
      !view ||
      !view.effectiveValues ||
      !view.effectiveValues.enabled ||
      !isValid(ui.absoluteRoot)
    )
      return;
    replayDispatches += 1;
    dispatchChange(serializedReplayPayload);
    scheduleSnapshotReplay(generation);
  }

  function scheduleSnapshotReplay(generation) {
    try {
      $.Schedule(replayDelay(), function () {
        snapshotReplay(generation);
      });
    } catch {
      replayRunning = false;
    }
  }

  function refreshSnapshotReplay() {
    var view = currentView();
    if (!view || !view.effectiveValues || !view.effectiveValues.enabled) {
      replayGeneration += 1;
      replayRunning = false;
      replayDispatches = 0;
      return;
    }
    if (!serializedReplayPayload) return;
    replayDispatches = 0;
    if (replayRunning) return;
    replayRunning = true;
    replayGeneration += 1;
    scheduleSnapshotReplay(replayGeneration);
  }

  function showResetFeedback(text, seconds) {
    resetFeedbackGeneration += 1;
    var generation = resetFeedbackGeneration;
    resetFeedbackText = text || "";
    renderStoreStatus();
    try {
      $.Schedule(seconds || RESET_FEEDBACK_SEC, function () {
        if (generation !== resetFeedbackGeneration) return;
        resetFeedbackText = "";
        renderStoreStatus();
      });
    } catch {}
  }
  function closeResetDialog(restoreFocus) {
    var view = currentView();
    var confirmation =
      view && view.transactions ? view.transactions.confirmation : null;
    if (confirmation && confirmation.kind === "reset")
      sendState({ type: "reset_cancel", token: confirmation.token });
    resetKeys = null;
    setClass(ui.resetDialog, "Open", false);
    if (restoreFocus !== false && state.open) focus(ui.resetButton);
  }

  function requestSectionReset() {
    var category = navigationCategories[state.categoryIndex];
    var tab = category && category.tabs[state.tabIndex];
    if (!tab || !tab.keys.length) {
      showResetFeedback("NO SETTINGS TO RESET");
      return;
    }
    var values = state.values;
    var conditions = state.conditions;
    var changedCount = 0;
    for (var index = 0; index < tab.keys.length; index++) {
      var key = tab.keys[index];
      if (
        values[key] !== DEFAULTS[key] ||
        Object.prototype.hasOwnProperty.call(conditions, key)
      )
        changedCount += 1;
    }
    if (!changedCount) {
      showResetFeedback("SECTION ALREADY DEFAULT");
      return;
    }
    var result = sendState({ type: "reset_request", keys: tab.keys.slice(0) });
    var confirmation =
      result && result.view && result.view.transactions
        ? result.view.transactions.confirmation
        : null;
    if (!confirmation) return;
    resetKeys = tab.keys.slice(0);
    setText(ui.resetDialogTitle, "RESET " + tab.name);
    var currentRow = result.view.currentScope;
    setText(
      ui.resetDialogMessage,
      currentRow && scopeUsesHeroes(currentRow.mode)
        ? "This section goes back to your All Heroes settings."
        : "Reset " +
            String(changedCount) +
            (changedCount === 1 ? " setting" : " settings") +
            " in " +
            category.name +
            " / " +
            tab.name +
            " to shipped defaults? This can be undone.",
    );
    setClass(ui.resetDialog, "Open", true);
    focus(ui.resetCancelButton);
  }

  function confirmSectionReset() {
    if (!resetKeys) {
      closeResetDialog(true);
      return;
    }
    var view = currentView();
    var confirmation =
      view && view.transactions ? view.transactions.confirmation : null;
    if (!confirmation || confirmation.kind !== "reset") {
      closeResetDialog(true);
      return;
    }
    var result = sendState({
      type: "reset_confirm",
      token: confirmation.token,
    });
    closeResetDialog(true);
    syncControls();
    showResetFeedback(
      stateAccepted(result)
        ? "SECTION RESET · UNDO AVAILABLE"
        : "SECTION ALREADY DEFAULT",
    );
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

  function settingRow(panel) {
    var row = panel;
    while (isValid(row) && !panelHasClass(row, "HPColorsSettingRow")) {
      try {
        row = row.GetParent();
      } catch {
        row = null;
      }
    }
    return isValid(row) ? row : null;
  }

  function registerConditionControl(panel, key, min, max, option, increment) {
    if (
      key === "precisePipsEnabled" ||
      !Object.prototype.hasOwnProperty.call(DEFAULTS, key) ||
      !isValid(panel)
    )
      return;
    var row = settingRow(panel);
    if (!row) return;

    var control = conditionControls[key];
    if (!control) {
      var defaultValue = DEFAULTS[key];
      var defaultIsString = false;
      try {
        defaultIsString = defaultValue === String(defaultValue);
      } catch {}
      var type =
        defaultValue === true || defaultValue === false
          ? "boolean"
          : Number.isFinite(defaultValue)
            ? "number"
            : defaultIsString
              ? "enum"
              : "unknown";
      if (COLOR_KEYS[key]) type = "color";
      if (option !== undefined) type = "enum";
      var titles = findChildrenWithClass(row, "HPColorsSettingTitle");
      control = {
        title: titles.length ? readPanelText(titles[0]) : key,
        type: type,
        min: min,
        max: max,
        increment: increment || 1,
        options: option === undefined ? [] : [option],
        indicators: [],
        indicatorState: -1,
      };
      conditionControls[key] = control;
    } else if (option !== undefined && control.options.indexOf(option) < 0) {
      control.options.push(option);
    }

    var indicatorIndex;
    for (indicatorIndex = 0; indicatorIndex < control.indicators.length; indicatorIndex++) {
      if (control.indicators[indicatorIndex].row === row) return;
    }
    var suffix = control.indicators.length
      ? "_" + String(control.indicators.length + 1)
      : "";
    var button = $.CreatePanel(
      "Button",
      row,
      "HPColorsCondition_" + key + suffix,
    );
    var label = $.CreatePanel("Label", button, "");
    if (!isValid(button) || !isValid(label)) return;
    button.AddClass("HPColorsConditionIndicator");
    label.text = "\u25c7";
    control.indicators.push({ row: row, button: button, label: label });
    control.indicatorState = -1;
    setPanelEvent(button, "onactivate", function () {
      openConditionEditor(key, button);
    });
  }

  function bindToggle(panelId, key) {
    var panel = controlPanel(panelId);
    registerConditionControl(panel, key);
    setPanelEvent(panel, "onactivate", function () {
      if (syncingControls) return;
      commitValue(key, !state.values[key]);
    });
  }

  function bindMode(panelId, key, mode) {
    var panel = controlPanel(panelId);
    registerConditionControl(panel, key, undefined, undefined, mode);
    setPanelEvent(panel, "onactivate", function () {
      if (syncingControls) return;
      commitValue(key, mode);
    });
  }

  function bindEntryCommit(entry, key) {
    function commitEntry() {
      if (syncingControls) return;
      var value = entry.text;
      if (LEGACY_DISPLAY_KEYS[key] && String(value).replace(/^\s+|\s+$/g, "") !== "")
        value = Number(value) / displayScale(key);
      commitValue(key, value);
      try {
        $.DispatchEvent("DropInputFocus", entry);
      } catch {}
    }
    setPanelEvent(entry, "ontextentrysubmit", commitEntry);
    setPanelEvent(entry, "onblur", commitEntry);
    setPanelEvent(entry, "oncancel", syncControls);
  }

  function bindSlider(sliderId, entryId, key, min, max, increment) {
    var slider = controlPanel(sliderId);
    var entry = controlPanel(entryId);
    if (!isValid(slider) || !isValid(entry)) return;
    registerConditionControl(slider, key, min, max, undefined, increment);
    // Keep condition bounds full-sized; only the movement track uses the legacy window.
    if (LEGACY_DISPLAY_KEYS[key]) {
      max = /X$/.test(key) ? 300 : 200;
      min = -max;
    }
    var gestureBefore = "";

    try {
      slider.min = min * displayScale(key);
      slider.max = max * displayScale(key);
      slider.increment = (increment || 1) * displayScale(key);
    } catch {}

    setPanelEvent(slider, "onmousedown", function () {
      gestureBefore = key;
      sendState({ type: "gesture_begin", key: key, value: slider.value / displayScale(key) });
    });
    setPanelEvent(slider, "onvaluechanged", function () {
      if (syncingControls) return;
      if (gestureBefore)
        sendState({ type: "gesture_update", key: key, value: slider.value / displayScale(key) });
      else commitValue(key, slider.value / displayScale(key));
    });
    setPanelEvent(slider, "onmouseup", function () {
      if (gestureBefore)
        sendState({ type: "gesture_end", key: key, value: slider.value / displayScale(key) });
      gestureBefore = "";
      syncControls();
    });

    bindEntryCommit(entry, key);
  }

  function bindColor(swatchId, entryId, key) {
    var swatch = controlPanel(swatchId);
    var entry = controlPanel(entryId);
    if (!isValid(swatch) || !isValid(entry)) return;
    registerConditionControl(swatch, key);
    setPanelEvent(swatch, "onactivate", function () {
      openPicker(key, swatch);
    });
    bindEntryCommit(entry, key);
  }

  function conditionValueMatchesSetting(key, value) {
    return !!key && value === state.values[key];
  }

  function conditionEditorStatus() {
    if (
      conditionValueMatchesSetting(
        conditionDraft.key,
        conditionDraft.value,
      )
    )
      return {
        text: "NO OVERRIDE \u00b7 VALUE OR SELECTION MATCHES CURRENT SETTING",
        matched: false,
        unavailable: false,
      };
    var tier = ability.observedTiers[conditionDraft.slot - 1];
    if (tier < 0)
      return {
        text:
          "SLOT " +
          String(conditionDraft.slot) +
          " UNAVAILABLE \u00b7 BASE VALUE WILL BE USED",
        matched: false,
        unavailable: true,
      };
    if (tier >= conditionDraft.minTier)
      return {
        text:
          "SLOT " +
          String(conditionDraft.slot) +
          " TIER " +
          String(tier) +
          " \u00b7 CONDITION MATCHED",
        matched: true,
        unavailable: false,
      };
    return {
      text:
        "SLOT " +
        String(conditionDraft.slot) +
        " TIER " +
        String(tier) +
        " \u00b7 NEEDS TIER " +
        String(conditionDraft.minTier) +
        "+",
      matched: false,
      unavailable: false,
    };
  }

  function renderConditionEditor() {
    if (!conditionDraft.key) return;
    var control = conditionControls[conditionDraft.key];
    if (!control) return;
    setText(
      ui.conditionTitle,
      (control.title || conditionDraft.key).toUpperCase(),
    );
    for (var slotIndex = 0; slotIndex < ui.conditionSlotButtons.length; slotIndex++)
      syncConditionAbilityCard(slotIndex);
    setClass(ui.conditionBooleanRow, "Active", control.type === "boolean");
    setClass(ui.conditionEnumRow, "Active", control.type === "enum");
    setClass(ui.conditionNumberRow, "Active", control.type === "number");
    setClass(ui.conditionColorRow, "Active", control.type === "color");
    if (control.type === "boolean") {
      setClass(
        ui.conditionBooleanFalse,
        "Selected",
        conditionDraft.value === false,
      );
      setClass(
        ui.conditionBooleanTrue,
        "Selected",
        conditionDraft.value === true,
      );
    } else if (control.type === "enum") {
      if (isValid(ui.conditionEnumOptions))
        ui.conditionEnumOptions.RemoveAndDeleteChildren();
      for (var optionIndex = 0; optionIndex < control.options.length; optionIndex++) {
        (function (option) {
          var button = $.CreatePanel(
            "Button",
            ui.conditionEnumOptions,
            "HPColorsConditionOption_" + String(option),
          );
          var label = $.CreatePanel("Label", button, "");
          button.AddClass("HPColorsConditionChoice");
          label.text = String(option).toUpperCase();
          setClass(button, "Selected", conditionDraft.value === option);
          setPanelEvent(button, "onactivate", function () {
            conditionDraft.value = option;
            renderConditionEditor();
          });
        })(control.options[optionIndex]);
      }
    } else if (control.type === "number") {
      if (isValid(ui.conditionNumberSlider)) {
        try {
          if (ui.conditionNumberSlider.min !== control.min * displayScale(conditionDraft.key))
            ui.conditionNumberSlider.min = control.min * displayScale(conditionDraft.key);
          if (ui.conditionNumberSlider.max !== control.max * displayScale(conditionDraft.key))
            ui.conditionNumberSlider.max = control.max * displayScale(conditionDraft.key);
          var increment = (control.increment || 1) * displayScale(conditionDraft.key);
          if (ui.conditionNumberSlider.increment !== increment)
            ui.conditionNumberSlider.increment = increment;
        } catch {}
        setSliderValue(ui.conditionNumberSlider, displayNumber(conditionDraft.key, conditionDraft.value));
      }
      setText(ui.conditionNumberEntry, String(displayNumber(conditionDraft.key, conditionDraft.value)));
    } else if (control.type === "color") {
      setText(ui.conditionColorEntry, conditionDraft.value);
      setBackgroundColor(ui.conditionColorSwatch, conditionDraft.value);
    }
    var status = conditionEditorStatus();
    setText(ui.conditionStatus, status.text);
    setClass(ui.conditionDialog, "Matched", status.matched);
    setClass(ui.conditionDialog, "Unavailable", status.unavailable);
    setClass(
      ui.conditionApplyButton,
      "Disabled",
      conditionValueMatchesSetting(
        conditionDraft.key,
        conditionDraft.value,
      ),
    );
    setClass(
      ui.conditionRemoveButton,
      "Disabled",
      !Object.prototype.hasOwnProperty.call(
        state.conditions,
        conditionDraft.key,
      ),
    );
  }

  function syncConditionIndicators() {
    var activeConditions = state.conditions;
    for (var key in conditionControls) {
      if (!Object.prototype.hasOwnProperty.call(conditionControls, key))
        continue;
      var control = conditionControls[key];
      var activeRule = activeConditions[key];
      var meaningful =
        !!activeRule &&
        !conditionValueMatchesSetting(key, activeRule.value);
      var tier = meaningful
        ? ability.observedTiers[activeRule.slot - 1]
        : -1;
      var matched = meaningful && tier >= activeRule.minTier;
      var indicatorState =
        (meaningful ? 1 : 0) |
        (matched ? 2 : 0) |
        (meaningful && tier < 0 ? 4 : 0);
      if (control.indicatorState === indicatorState) continue;
      control.indicatorState = indicatorState;
      var indicators = control.indicators;
      for (var indicatorIndex = 0; indicatorIndex < indicators.length; indicatorIndex++) {
        var indicator = indicators[indicatorIndex];
        setClass(indicator.button, "Configured", meaningful);
        setClass(indicator.button, "Matched", matched);
        setClass(
          indicator.button,
          "Unavailable",
          meaningful && tier < 0,
        );
        setText(
          indicator.label,
          meaningful ? "\u25c6" : "\u25c7",
        );
      }
    }
    if (
      conditionDraft.key &&
      isValid(ui.conditionDialog) &&
      ui.conditionDialog.BHasClass("Open")
    )
      renderConditionEditor();
  }

  function closeConditionEditor() {
    if (picker.condition) closePicker();
    var returnPanel = conditionDraft.returnPanel;
    conditionDraft.key = "";
    conditionDraft.returnPanel = null;
    setClass(ui.conditionDialog, "Open", false);
    setClass(ui.conditionDialog, "Matched", false);
    setClass(ui.conditionDialog, "Unavailable", false);
    if (state.open) focus(returnPanel);
  }

  function openConditionEditor(key, returnPanel) {
    if (!conditionControls[key]) return;
    closeResetDialog(false);
    closePresetTransferDialog();
    closeTransferDialog();
    closeScopeDialog();
    closePicker();
    var rule = state.conditions[key];
    conditionDraft.key = key;
    conditionDraft.slot = rule ? rule.slot : 1;
    conditionDraft.minTier = rule ? rule.minTier : 1;
    conditionDraft.value = rule ? rule.value : state.values[key];
    conditionDraft.returnPanel = returnPanel;
    setClass(ui.conditionDialog, "Open", true);
    sampleAbilityTiers();
    renderConditionEditor();
    focus(ui.conditionCancelButton);
  }

  function setConditionSlot(slot) {
    if (!conditionDraft.key) return;
    if (conditionDraft.slot === slot)
      conditionDraft.minTier = conditionDraft.minTier >= 3
        ? 1
        : conditionDraft.minTier + 1;
    else {
      conditionDraft.slot = slot;
      conditionDraft.minTier = 1;
    }
    sampleAbilityTiers();
    renderConditionEditor();
  }

  function pickConditionColor() {
    var control = conditionControls[conditionDraft.key];
    if (!control || control.type !== "color") return;
    showPicker(
      conditionDraft.key,
      ui.conditionColorSwatch,
      true,
      conditionDraft.value,
    );
  }

  function applyConditionDraft() {
    if (!conditionDraft.key) return;
    if (
      conditionValueMatchesSetting(
        conditionDraft.key,
        conditionDraft.value,
      )
    )
      return;
    var result = sendState({
      type: "condition_set",
      key: conditionDraft.key,
      slot: conditionDraft.slot,
      minTier: conditionDraft.minTier,
      value: conditionDraft.value,
    });
    if (!stateAccepted(result)) {
      renderConditionEditor();
      return;
    }
    closeConditionEditor();
    syncControls();
  }

  function removeConditionDraft() {
    if (!conditionDraft.key) return;
    sendState({ type: "condition_remove", key: conditionDraft.key });
    closeConditionEditor();
    syncControls();
  }

  function bindConditionEditorControls() {
    for (var slotIndex = 0; slotIndex < ui.conditionSlotButtons.length; slotIndex++) {
      (function (slot) {
        setPanelEvent(ui.conditionSlotButtons[slot - 1], "onactivate", function () {
          setConditionSlot(slot);
        });
      })(slotIndex + 1);
    }
    setPanelEvent(ui.conditionBooleanFalse, "onactivate", function () {
      conditionDraft.value = false;
      renderConditionEditor();
    });
    setPanelEvent(ui.conditionBooleanTrue, "onactivate", function () {
      conditionDraft.value = true;
      renderConditionEditor();
    });
    setPanelEvent(ui.conditionNumberSlider, "onvaluechanged", function () {
      if (!conditionDraft.key) return;
      var control = conditionControls[conditionDraft.key];
      var increment = control ? control.increment : 1;
      conditionDraft.value = clampNumber(
        ui.conditionNumberSlider.value / displayScale(conditionDraft.key),
        control.min,
        control.max,
        state.values[conditionDraft.key],
        increment,
      );
      renderConditionEditor();
    });
    function commitNumber() {
      var control = conditionControls[conditionDraft.key];
      if (!control || control.type !== "number") return;
      conditionDraft.value = clampNumber(
        Number(ui.conditionNumberEntry.text) / displayScale(conditionDraft.key),
        control.min,
        control.max,
        state.values[conditionDraft.key],
        control.increment,
      );
      renderConditionEditor();
    }
    setPanelEvent(ui.conditionNumberEntry, "ontextentrysubmit", commitNumber);
    setPanelEvent(ui.conditionNumberEntry, "onblur", commitNumber);
    function commitColor() {
      var control = conditionControls[conditionDraft.key];
      if (!control || control.type !== "color") return;
      conditionDraft.value = normalizeColor(
        ui.conditionColorEntry.text,
        String(conditionDraft.value || state.values[conditionDraft.key]),
      );
      renderConditionEditor();
    }
    setPanelEvent(
      ui.conditionColorSwatch,
      "onactivate",
      pickConditionColor,
    );
    setPanelEvent(ui.conditionColorEntry, "ontextentrysubmit", commitColor);
    setPanelEvent(ui.conditionColorEntry, "onblur", commitColor);
    setPanelEvent(ui.conditionRemoveButton, "onactivate", removeConditionDraft);
    setPanelEvent(ui.conditionCancelButton, "onactivate", closeConditionEditor);
    setPanelEvent(ui.conditionApplyButton, "onactivate", applyConditionDraft);
    setPanelEvent(ui.conditionDialog, "oncancel", closeConditionEditor);
  }

  function setSliderValue(slider, value) {
    if (!isValid(slider)) return;
    try {
      if (slider.value === value) return;
      if (isCallable(slider.SetValueNoEvents))
        slider.SetValueNoEvents(value);
      else slider.value = value;
    } catch {}
  }

  function setBackgroundColor(panel, value) {
    if (!isValid(panel) || !panel.style) return;
    try {
      if (panel.style.backgroundColor !== value)
        panel.style.backgroundColor = value;
    } catch {}
  }

  function setToggle(control, value) {
    setClass(controlPanel(control.id), "Checked", !!value);
  }

  function setSlider(control, value) {
    var slider = controlPanel(control.base + "Slider");
    var displayValue = displayNumber(control.key, value);
    if (LEGACY_DISPLAY_KEYS[control.key] && isValid(slider))
      displayValue = Math.max(slider.min, Math.min(slider.max, displayValue));
    setSliderValue(slider, displayValue);
    setText(controlPanel(control.base + "Entry"), String(displayNumber(control.key, value)));
  }

  function setColor(control, value) {
    setBackgroundColor(controlPanel(control.base + "Swatch"), value);
    setText(controlPanel(control.base + "Hex"), value);
  }

  var PICKER_HUE_TRACK =
    "gradient(linear, 0% 0%, 100% 0%, from(#FF0000), color-stop(0.1667, #FFFF00), color-stop(0.3333, #00FF00), color-stop(0.5, #00FFFF), color-stop(0.6667, #0000FF), color-stop(0.8333, #FF00FF), to(#FF0000))";

  function pickerColor() {
    return hslToHex(picker.hue, picker.saturation, picker.lightness);
  }

  function pickerHueGradient() {
    return PICKER_HUE_TRACK;
  }

  function pickerSaturationGradient() {
    return (
      "gradient(linear, 0% 0%, 100% 0%, from(" +
      hslToHex(picker.hue, 0, picker.lightness) +
      "), to(" +
      hslToHex(picker.hue, 100, picker.lightness) +
      "))"
    );
  }

  function pickerLumenGradient() {
    return (
      "gradient(linear, 0% 0%, 100% 0%, from(#000000), color-stop(0.5, " +
      hslToHex(picker.hue, picker.saturation, 50) +
      "), to(#FFFFFF))"
    );
  }

  // Thumb and track panels per slider; a slider that is re-resolved or a
  // child that went invalid starts a fresh lookup.
  function pickerParts(component, slider) {
    var parts = pickerPartCache[component];
    if (!parts || parts.slider !== slider) {
      parts = { slider: slider, thumb: null, track: null, trackKey: "" };
      pickerPartCache[component] = parts;
    }
    return parts;
  }

  // trackKey names the inputs of the gradient last written to the track, so
  // an unchanged track is neither rebuilt nor compared again.
  function setPickerTrack(component, slider, trackKey, gradientFor) {
    if (!isValid(slider) || !slider.FindChildTraverse) return;
    try {
      var parts = pickerParts(component, slider);
      if (!isValid(parts.track)) {
        parts.track = slider.FindChildTraverse("SliderTrack");
        parts.trackKey = "";
      }
      var track = parts.track;
      if (!isValid(track) || parts.trackKey === trackKey) return;
      var gradient = gradientFor();
      if (track.style.backgroundColor !== gradient)
        track.style.backgroundColor = gradient;
      parts.trackKey = trackKey;
    } catch {}
  }

  function setPickerThumb(component, slider, color, lightness) {
    if (!isValid(slider) || !slider.FindChildTraverse) return;
    try {
      var parts = pickerParts(component, slider);
      if (!isValid(parts.thumb))
        parts.thumb = slider.FindChildTraverse("SliderThumb");
      var thumb = parts.thumb;
      if (!isValid(thumb) || !thumb.style) return;
      if (thumb.style.backgroundColor !== color)
        thumb.style.backgroundColor = color;
      var border = lightness < 35 ? "#FFEFD7" : "#10130D";
      if (thumb.style.borderColor !== border)
        thumb.style.borderColor = border;
    } catch {}
  }

  function syncPicker() {
    if (!picker.key || !isValid(ui.pickerRoot)) return;
    var color = pickerColor();
    setText(ui.pickerTitle, COLOR_TITLES[picker.key] || "COLOR");
    setText(ui.pickerHex, color);
    setText(ui.pickerHueValue, picker.hue + "°");
    setText(ui.pickerSaturationValue, picker.saturation + "%");
    setText(ui.pickerLightnessValue, picker.lightness + "%");
    setBackgroundColor(ui.pickerPreview, color);
    setSliderValue(ui.pickerHueSlider, picker.hue);
    setSliderValue(ui.pickerSaturationSlider, picker.saturation);
    setSliderValue(ui.pickerLumenSlider, picker.lightness);

    setPickerThumb("hue", ui.pickerHueSlider, color, picker.lightness);
    setPickerThumb("saturation", ui.pickerSaturationSlider, color, picker.lightness);
    setPickerThumb("lightness", ui.pickerLumenSlider, color, picker.lightness);

    setPickerTrack("hue", ui.pickerHueSlider, "", pickerHueGradient);
    setPickerTrack(
      "saturation",
      ui.pickerSaturationSlider,
      picker.hue + "|" + picker.lightness,
      pickerSaturationGradient,
    );
    setPickerTrack(
      "lightness",
      ui.pickerLumenSlider,
      picker.hue + "|" + picker.saturation,
      pickerLumenGradient,
    );
  }

  function bindPickerSlider(slider, component) {
    if (!isValid(slider)) return;
    try {
      slider.increment = 1;
    } catch {}
    setPanelEvent(slider, "onmousedown", function () {
      if (picker.condition || !picker.key) return;
      if (pickerGestureActive)
        sendState({ type: "gesture_cancel", key: picker.key });
      var result = sendState({
        type: "gesture_begin",
        key: picker.key,
        value: pickerColor(),
      });
      pickerGestureActive = stateAccepted(result);
    });
    setPanelEvent(slider, "onvaluechanged", function () {
      if (syncingControls || !picker.key) return;
      var max = component === "hue" ? 359 : 100;
      picker[component] = clampNumber(
        slider.value,
        0,
        max,
        picker[component],
      );
      var color = pickerColor();
      if (picker.condition) {
        conditionDraft.value = color;
        syncPicker();
        renderConditionEditor();
        return;
      }
      if (pickerGestureActive) {
        sendState({ type: "gesture_update", key: picker.key, value: color });
        syncPicker();
      } else {
        commitValue(picker.key, color);
      }
    });
    setPanelEvent(slider, "onmouseup", function () {
      if (picker.condition) {
        renderConditionEditor();
        return;
      }
      if (pickerGestureActive)
        sendState({
          type: "gesture_end",
          key: picker.key,
          value: pickerColor(),
        });
      pickerGestureActive = false;
      syncControls();
    });
  }

  function closePicker() {
    if (!picker.key) return;
    var wasCondition = picker.condition;
    if (pickerGestureActive) {
      sendState({ type: "gesture_cancel", key: picker.key });
      pickerGestureActive = false;
    }
    picker.key = "";
    picker.condition = false;
    setClass(ui.pickerRoot, "Open", false);
    focus(picker.returnPanel);
    if (wasCondition && conditionDraft.key) renderConditionEditor();
    picker.returnPanel = null;
  }

  function showPicker(key, returnPanel, condition, hex) {
    picker.key = key;
    picker.returnPanel = returnPanel;
    picker.condition = condition;
    var hsl = hexToHsl(hex);
    picker.hue = hsl.hue;
    picker.saturation = hsl.saturation;
    picker.lightness = hsl.lightness;
    setClass(ui.pickerRoot, "Open", true);
    syncPicker();
    focus(ui.pickerHueSlider);
  }

  function openPicker(key, returnPanel) {
    if (!COLOR_KEYS[key]) return;
    showPicker(key, returnPanel, false, state.values[key]);
  }

  function syncToggleControls(values) {
    for (var index = 0; index < TOGGLE_CONTROLS.length; index++) {
      var control = TOGGLE_CONTROLS[index];
      setToggle(control, values[control.key]);
    }
  }

  function syncModeControls(values) {
    var shape = controlPanel("HPColorsStaminaShape");
    if (isValid(shape) && shape["SetSelected"]) {
      var selected = shape["GetSelected"] && shape["GetSelected"]();
      if (!isValid(selected) || selected.id !== values.staminaShape)
        shape["SetSelected"](values.staminaShape);
    }
    for (var index = 0; index < MODE_CONTROLS.length; index++) {
      var control = MODE_CONTROLS[index];
      setClass(
        controlPanel(control.id),
        "Selected",
        values[control.key] === control.value,
      );
    }
  }

  function syncSliderControls(values) {
    for (var index = 0; index < SLIDER_CONTROLS.length; index++) {
      var control = SLIDER_CONTROLS[index];
      setSlider(control, values[control.key]);
    }
  }

  function syncColorControls(values) {
    for (var index = 0; index < COLOR_CONTROLS.length; index++) {
      var control = COLOR_CONTROLS[index];
      setColor(control, values[control.key]);
    }
  }

  function syncDependentRow(rowId, active, firstControlId, secondControlId) {
    setClass(controlPanel(rowId), "Disabled", !active);
    setEnabled(controlPanel(firstControlId), active);
    setEnabled(controlPanel(secondControlId), active);
  }

  function syncControlDependencies(values) {
    syncDependentRow("HPColorsEnemyPipColorRow", values.pipsVisible && values.enemyPipColorEnabled, "HPColorsEnemyPipColorSwatch", "HPColorsEnemyPipColorHex");
    syncDependentRow("HPColorsAllyPipColorRow", values.pipsVisible && values.allyPipColorEnabled, "HPColorsAllyPipColorSwatch", "HPColorsAllyPipColorHex");
    syncDependentRow("HPColorsEnemyNameColorRow", values.enemyNameColorEnabled, "HPColorsEnemyNameColorSwatch", "HPColorsEnemyNameColorHex");
    syncDependentRow("HPColorsAllyNameColorRow", values.allyNameColorEnabled, "HPColorsAllyNameColorSwatch", "HPColorsAllyNameColorHex");
    var enemyStaminaColorActive = values.enemyStaminaColorEnabled;
    syncDependentRow(
      "HPColorsEnemyStaminaColorRow",
      enemyStaminaColorActive,
      "HPColorsEnemyStaminaColorSwatch",
      "HPColorsEnemyStaminaColorHex",
    );

    var enemyKillMarkerActive = values.enemyKillMarkerEnabled;
    syncDependentRow(
      "HPColorsEnemyKillMarkerThresholdRow",
      enemyKillMarkerActive,
      "HPColorsEnemyKillMarkerThresholdSlider",
      "HPColorsEnemyKillMarkerThresholdEntry",
    );
    syncDependentRow(
      "HPColorsEnemyKillMarkerWidthRow",
      enemyKillMarkerActive,
      "HPColorsEnemyKillMarkerWidthSlider",
      "HPColorsEnemyKillMarkerWidthEntry",
    );
    syncDependentRow(
      "HPColorsEnemyKillMarkerColorRow",
      enemyKillMarkerActive,
      "HPColorsEnemyKillMarkerColorSwatch",
      "HPColorsEnemyKillMarkerColorHex",
    );
    syncDependentRow(
      "HPColorsNeutralColorRow",
      values.npcNeutralEnabled,
      "HPColorsNeutralColorSwatch",
      "HPColorsNeutralColorHex",
    );

    var enemyPulseActive = values.enemyPulseEnabled;
    var enemyPulseColorActive =
      enemyPulseActive && values.enemyPulseColorEnabled;
    syncDependentRow(
      "HPColorsEnemyPulseColorModeRow",
      enemyPulseColorActive,
      "HPColorsEnemyPulseColorModeFixed",
      "HPColorsEnemyPulseColorModeGradient",
    );
    setClass(
      controlPanel("HPColorsEnemyPulseColorRow"),
      "Active",
      enemyPulseColorActive,
    );

    var enemyPulseReadoutModifiersActive =
      enemyPulseActive && values.enemyPulseReadoutModifiers;
    syncDependentRow(
      "HPColorsEnemyPulseReadoutSizeRow",
      enemyPulseReadoutModifiersActive,
      "HPColorsEnemyPulseReadoutSizeSlider",
      "HPColorsEnemyPulseReadoutSizeEntry",
    );
    syncDependentRow(
      "HPColorsEnemyPulseReadoutOffsetXRow",
      enemyPulseReadoutModifiersActive,
      "HPColorsEnemyPulseReadoutOffsetXSlider",
      "HPColorsEnemyPulseReadoutOffsetXEntry",
    );
    syncDependentRow(
      "HPColorsEnemyPulseReadoutOffsetYRow",
      enemyPulseReadoutModifiersActive,
      "HPColorsEnemyPulseReadoutOffsetYSlider",
      "HPColorsEnemyPulseReadoutOffsetYEntry",
    );

    var allyPulseColorActive =
      values.allyPulseEnabled && values.allyPulseColorEnabled;
    syncDependentRow(
      "HPColorsAllyPulseColorModeRow",
      allyPulseColorActive,
      "HPColorsAllyPulseColorModeFixed",
      "HPColorsAllyPulseColorModeGradient",
    );
    setClass(
      controlPanel("HPColorsAllyPulseColorRow"),
      "Active",
      allyPulseColorActive,
    );

    syncReadoutColorRows("HPColorsReadout", values.readoutColorMode);
    syncReadoutColorRows("HPColorsAllyReadout", values.allyReadoutColorMode);
    setClass(
      controlPanel("HPColorsUltCustomRow"),
      "Active",
      values.ultMode === "custom",
    );
    var ultimateTimerProgressColors =
      values.ultimateTimerColorMode !== "follow";
    setClass(
      controlPanel("HPColorsUltimateTimerUnavailableColorRow"),
      "Active",
      ultimateTimerProgressColors,
    );
    setClass(
      controlPanel("HPColorsUltimateTimerAvailableColorRow"),
      "Active",
      ultimateTimerProgressColors,
    );
  }

  function syncReadoutColorRows(base, colorMode) {
    var custom = colorMode === "custom";
    setClass(controlPanel(base + "CustomRows"), "Active", custom);
    syncDependentRow(
      base + "ModeRow",
      custom,
      base + "ModeFixed",
      base + "ModeGradient",
    );
  }

  function featureRowEnabled(key, values) {
    if (key === "enemyPipColor") return values.pipsVisible && values.enemyPipColorEnabled;
    if (key === "allyPipColor") return values.pipsVisible && values.allyPipColorEnabled;
    if (key === "enemyPipColorEnabled" || key === "allyPipColorEnabled") return values.pipsVisible;
    if (key === "pipOpacity") return values.pipsVisible;
    if (key === "levelOffsetX" || key === "levelOffsetY") return values.levelsVisible;
    if (/^(enemyName|allyName|nameSize|nameOffset)/.test(key)) return values.playerNamesVisible;
    if (/^allyReadout/.test(key) && key !== "allyReadoutVisible") return values.allyReadoutVisible;
    if (/^readout/.test(key) && key !== "readoutVisible") return values.readoutVisible;
    if (/^enemyPulse/.test(key) && key !== "enemyPulseEnabled") return values.enemyPulseEnabled;
    if (/^allyPulse/.test(key) && key !== "allyPulseEnabled") return values.allyPulseEnabled;
    if (/^enemyKillMarker/.test(key) && key !== "enemyKillMarkerEnabled") return values.enemyKillMarkerEnabled;
    if (/^pickup/.test(key) && key !== "pickupTimersEnabled") return values.pickupTimersEnabled;
    if (/^ultimateTimer/.test(key) && key !== "ultimateTimerEnabled") return values.ultimateTimerEnabled;
    return true;
  }

  function syncFeatureRows(values) {
    for (var key in SETTING_ROW_IDS) {
      if (!Object.prototype.hasOwnProperty.call(SETTING_ROW_IDS, key)) continue;
      setClass(controlPanel(SETTING_ROW_IDS[key]), "FeatureOff", !featureRowEnabled(key, values));
    }
  }

  function syncControls() {
    var view = currentView();
    var values = state.values;
    syncingControls = true;
    try {
      syncToggleControls(values);
      syncModeControls(values);
      syncControlDependencies(values);
      syncSliderControls(values);
      syncColorControls(values);
      syncFeatureRows(values);
      setEnabled(ui.undoButton, !!(view && view.undoAvailable));
      syncPicker();
      syncConditionIndicators();
    } finally {
      syncingControls = false;
    }
    renderIdentity();
    renderCurrentScope();
    refreshPresetActivity(view);
  }


  function renderNavigation() {
    var category = navigationCategories[state.categoryIndex];
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

    if (!category.tabs[state.tabIndex]) state.tabIndex = 0;
    var activeTab = category.tabs[state.tabIndex];
    if (!activeTab) return;
    // UNDO stays reachable on the preset page because row clicks and EDIT
    // replace what is on screen; only RESET PAGE hides there.
    var presetPageActive =
      activeTab.pageId === "HPColorsSettingsOverviewHero";
    setClass(ui.undoButton, "HPColorsFooterActionHidden", false);
    // The hero identity line sits under the page description and only shows
    // on PRESETS; toggle it on every navigation render, not in renderIdentity,
    // whose unchanged-signature early return would leave it stale.
    setClass(ui.heroIdentity, "Active", presetPageActive);
    setClass(
      ui.resetButton,
      "HPColorsFooterActionHidden",
      presetPageActive,
    );
    setEnabled(ui.resetButton, activeTab.keys.length > 0);
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
    if (index < 0 || index >= navigationCategories.length) return;
    if (state.categoryIndex === index && state.tabIndex === 0) return;
    closePicker();
    state.categoryIndex = index;
    state.tabIndex = 0;
    renderNavigation();
  }

  function selectTab(index) {
    var category = navigationCategories[state.categoryIndex];
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
    closeScopeDialog();
    closeSaveToDialog(false);
    state.peeking = true;
    setClass(ui.editorRoot, "Peeking", true);
    focus(ui.peekCapture);
  }

  // The unconditional close used after an exit decision and by forced paths.
  // It never reverts live settings and still flushes local persistence.
  function closeEditor() {
    closeSupporterTicker();
    if (!state.open) return;
    closeExitDialog(false);
    closeSaveToDialog(false);
    closeResetDialog(false);
    closeConditionEditor();
    showResetFeedback("");
    closeTransferDialog();
    closeScopeDialog();
    closePicker();
    presetFormOpen = false;
    presetEditId = "";
    presetReplaceConfirm = null;
    presetDeleteConfirmId = "";
    sendState({ type: "editor_close" });
    flushPersist();
    endPeek();
    state.open = false;
    setClass(ui.editorRoot, "Open", false);
    setClass(ui.escapeRoot, "EditorOpen", false);
    focus(ui.menuButton);
  }

  function exitDialogOpen() {
    return isValid(ui.exitDialog) && ui.exitDialog.BHasClass("Open");
  }

  // Exit asks only when a named preset would be left behind: a CHANGED
  // source row, or a form holding an unsaved name. Live-only edits are
  // already saved on this PC, so they never prompt.
  function exitPromptNeeded() {
    return !!changedSourcePreset() || presetFormHasUnsavedName();
  }

  function closeExitDialog(restoreFocus) {
    exitDialogSourceId = "";
    if (!exitDialogOpen()) return;
    setClass(ui.exitDialog, "Open", false);
    setText(ui.exitFeedback, "");
    if (restoreFocus !== false && state.open) focus(ui.doneButton);
  }

  function openExitDialog() {
    if (!isValid(ui.exitDialog)) return false;
    var source = changedSourcePreset();
    var formName = presetFormHasUnsavedName();
    var name = source ? presetDisplayName(source).toUpperCase() : "";
    exitDialogSourceId = source ? source.id : "";
    if (source) {
      setText(ui.exitDialogTitle, "SAVE CHANGES TO " + name + "?");
      setText(
        ui.exitDialogMessage,
        "Your settings stay in use either way.\nSAVE updates " +
          name +
          ".\nSwitching heroes can replace changes you haven't saved to a preset.\nUNDO ends when you exit." +
          (formName ? "\nThe name you typed will not be saved." : ""),
      );
    } else {
      setText(ui.exitDialogTitle, "LEAVE WITHOUT SAVING THE PRESET?");
      setText(
        ui.exitDialogMessage,
        "The name you typed will not be saved.\nYour settings stay in use.\nUNDO ends when you exit.",
      );
    }
    setText(ui.exitFeedback, "");
    setRowActionEnabled(ui.exitSaveButton, !!source);
    setClass(ui.exitDialog, "Open", true);
    // The non-destructive choice takes focus.
    focus(ui.exitReviewButton);
    return true;
  }

  // Shared close entry for EXIT, root cancel, background, and owned Resume.
  // Subdialogs are closed by cancel() before it reaches this. Returns true
  // when the request was handled (closed or prompted).
  function requestCloseEditor() {
    if (!state.open) return false;
    if (exitDialogOpen()) return true;
    if (exitPromptNeeded() && openExitDialog()) return true;
    closeEditor();
    return true;
  }

  function exitSaveAndClose() {
    if (!exitDialogOpen()) return;
    var preset = changedSourcePreset();
    if (!preset || preset.id !== exitDialogSourceId) {
      setText(ui.exitFeedback, PRESET_GONE_TEXT);
      renderPresetOptions();
      return;
    }
    if (!performPresetRowSave(preset.id)) {
      setText(ui.exitFeedback, readPanelText(ui.presetFeedback));
      return;
    }
    closeEditor();
  }

  function exitReviewPresets() {
    if (!exitDialogOpen()) return;
    var source = changedSourcePreset();
    closeExitDialog(false);
    for (var index = 0; index < CATEGORY_DEFS.length; index++) {
      if (CATEGORY_DEFS[index].name === "PRESETS") {
        if (state.categoryIndex !== index || state.tabIndex !== 0) {
          closePicker();
          state.categoryIndex = index;
          state.tabIndex = 0;
        }
        renderNavigation();
        break;
      }
    }
    if (presetFormOpen) focus(ui.presetNameInput);
    else if (source) focusSelectedPresetRow(source.id);
    else focus(ui.presetOptions);
  }

  function exitWithoutSaving() {
    if (!exitDialogOpen()) return;
    closeEditor();
  }

  function openEditor() {
    if (!state.booted || state.open) return;
    sendState({ type: "session_open" });
    state.open = true;
    state.peeking = false;
    var showFormatNotice = formatNoticePending && !readRootAttribute("hp_colors_v2_native_format_notice_seen");
    setClass(find("HPColorsNativeFormatNotice"), "Active", showFormatNotice);
    if (showFormatNotice) writeRootAttribute("hp_colors_v2_native_format_notice_seen", "1");
    showResetFeedback("");
    renderPresetOptions();
    syncPresetSaveForm(true);
    setClass(ui.editorRoot, "Peeking", false);
    setClass(ui.editorRoot, "Open", true);
    setClass(ui.escapeRoot, "EditorOpen", true);
    openSupporterTicker();
    renderNavigation();
    focus(ui.editorShell);
  }

  function cancel() {
    // Escape inside the exit prompt dismisses it; it never confirms.
    if (exitDialogOpen()) {
      closeExitDialog(true);
      return true;
    }
    if (saveToDialogOpen()) {
      closeSaveToDialog(true);
      return true;
    }
    if (picker.key) {
      closePicker();
      return true;
    }
    if (
      isValid(ui.conditionDialog) &&
      ui.conditionDialog.BHasClass("Open")
    ) {
      closeConditionEditor();
      return true;
    }
    if (isValid(ui.resetDialog) && ui.resetDialog.BHasClass("Open")) {
      closeResetDialog(true);
      return true;
    }
    if (
      isValid(ui.presetTransferDialog) &&
      ui.presetTransferDialog.BHasClass("Open")
    ) {
      closePresetTransferDialog();
      return true;
    }
    if (isValid(ui.scopeDialog) && ui.scopeDialog.BHasClass("Open")) {
      closeScopeDialog();
      return true;
    }
    if (
      isValid(ui.transferDialog) &&
      ui.transferDialog.BHasClass("Open")
    ) {
      closeTransferDialog();
      return true;
    }
    if (state.open) return requestCloseEditor();
    return false;
  }

  function uiPanelId(key) {
    return (
      UI_PANEL_ID_OVERRIDES[key] ||
      "HPColors" + key.charAt(0).toUpperCase() + key.slice(1)
    );
  }

  function resolveUiPanels(keys) {
    for (var index = 0; index < keys.length; index++)
      ui[keys[index]] = find(uiPanelId(keys[index]));
  }

  function panelsAreValid(panels) {
    for (var index = 0; index < panels.length; index++)
      if (!isValid(panels[index])) return false;
    return true;
  }

  function resolvePanels() {
    ui.categoryButtons = [];
    ui.tabButtons = [];
    ui.tabLabels = [];
    ui.settingsPages = [];
    ui.conditionSlotButtons = [];
    ui.conditionSlotImages = [];
    controlPanels = {};

    var marker = find("LeftStripeBlur");
    try {
      ui.escapeRoot =
        marker && marker.GetParent ? marker.GetParent() : context;
    } catch {
      ui.escapeRoot = context;
    }
    ui.absoluteRoot = absoluteRoot(ui.escapeRoot);
    resolveUiPanels(REQUIRED_UI_PANEL_KEYS);
    resolveUiPanels(OPTIONAL_UI_PANEL_KEYS);
    if (!isValid(ui.presetScopeHelp)) {
      var helpLabels = findChildrenWithClass(ui.presetForm, "HPColorsPresetScopeHelp");
      if (!helpLabels.length)
        helpLabels = findChildrenWithClass(ui.escapeRoot, "HPColorsPresetScopeHelp");
      if (!helpLabels.length)
        helpLabels = findChildrenWithClass(ui.absoluteRoot, "HPColorsPresetScopeHelp");
      ui.presetScopeHelp = helpLabels.length ? helpLabels[0] : null;
    }

    for (var conditionSlot = 1; conditionSlot <= 4; conditionSlot++) {
      var slotId = "HPColorsConditionSlot" + String(conditionSlot);
      ui.conditionSlotButtons.push(find(slotId));
      ui.conditionSlotImages.push(find(slotId + "Image"));
    }
    for (var categoryIndex = 0; categoryIndex < CATEGORY_BUTTON_IDS.length; categoryIndex++)
      ui.categoryButtons.push(find(CATEGORY_BUTTON_IDS[categoryIndex]));
    for (var tabIndex = 0; tabIndex < 6; tabIndex++) {
      ui.tabButtons.push(find("HPColorsTab" + tabIndex));
      ui.tabLabels.push(find("HPColorsTabLabel" + tabIndex));
    }
    var legacyLayout = detectLegacyLayout(find(STORE_PANEL_ID));
    navigationCategories = legacyLayout ? legacyCategories() : CATEGORY_DEFS;
    for (var groupIndex = 0; groupIndex < navigationCategories.length; groupIndex++) {
      var tabs = navigationCategories[groupIndex].tabs;
      for (var pageIndex = 0; pageIndex < tabs.length; pageIndex++) {
        var pageId = tabs[pageIndex].pageId;
        if (legacyLayout && (navigationCategories[groupIndex].name === "UNITS" ||
          pageId === "HPColorsSettingsOverviewAppearance")) continue;
        ui.settingsPages.push(find(pageId));
      }
    }

    var requiredPanels = [ui.escapeRoot, ui.absoluteRoot];
    for (var keyIndex = 0; keyIndex < REQUIRED_UI_PANEL_KEYS.length; keyIndex++) {
      var key = REQUIRED_UI_PANEL_KEYS[keyIndex];
      if (legacyLayout && /^(npc|building|neutralColor|criticalIndicator|playerNames)/.test(key))
        continue;
      requiredPanels.push(ui[key]);
    }
    if (!legacyLayout) {
      for (var nameIndex = 0; nameIndex < 2; nameIndex++) {
        var nameBase = nameIndex ? "HPColorsAllyNameColor" : "HPColorsEnemyNameColor";
        requiredPanels.push(find(nameBase + "Toggle"), find(nameBase + "Swatch"), find(nameBase + "Hex"));
      }
      requiredPanels.push(find("HPColorsNameSizeEntry"), find("HPColorsNameOffsetXEntry"), find("HPColorsNameOffsetYEntry"));
    }
    // Retired builder layouts have only the original four rail buttons; keep
    // them bootable so the header can explain that the old pak01 must be removed.
    var categoryButtons = legacyLayout
      ? ui.categoryButtons.slice(0, 4)
      : ui.categoryButtons;
    return (
      panelsAreValid(requiredPanels) &&
      panelsAreValid(ui.conditionSlotButtons) &&
      panelsAreValid(ui.conditionSlotImages) &&
      panelsAreValid(categoryButtons) &&
      panelsAreValid(ui.tabButtons) &&
      panelsAreValid(ui.tabLabels) &&
      panelsAreValid(ui.settingsPages)
    );
  }

  function createSlider(hostId, sliderId, min, max, increment) {
    var existing = find(sliderId);
    if (isValid(existing)) return existing;
    var host = find(hostId);
    if (!isValid(host)) return null;
    var slider = $.CreatePanel("Slider", host, sliderId, {
      direction: "horizontal",
    });
    if (!isValid(slider)) return null;
    slider.AddClass("HPColorsSlider");
    slider.AddClass("HorizontalSlider");
    slider.min = min;
    slider.max = max;
    slider.increment = increment || 1;
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
    for (var index = 0; index < SLIDER_CONTROLS.length; index++) {
      var control = SLIDER_CONTROLS[index];
      var sliderId = control.base + "Slider";
      var slider = createSlider(
        sliderId + "Host",
        sliderId,
        control.min * displayScale(control.key),
        control.max * displayScale(control.key),
        (control.increment || 1) * displayScale(control.key),
      );
      controlPanels[sliderId] = slider;
      controlPanels[control.base + "Entry"] = find(control.base + "Entry");
      if (!isValid(slider) && !(detectLegacyLayout(find(STORE_PANEL_ID)) && (/^name/.test(control.key) || control.key === "pipOpacity"))) return false;
    }
    ui.conditionNumberSlider = createSlider(
      "HPColorsConditionNumberSliderHost",
      "HPColorsConditionNumberSlider",
      0,
      100,
    );
    controlPanels.HPColorsConditionNumberSlider = ui.conditionNumberSlider;
    return isValid(ui.conditionNumberSlider) && createPickerSliders();
  }

  function bindPickerControls() {
    setPanelEvent(ui.pickerDone, "onactivate", closePicker);
    setPanelEvent(ui.pickerBackdrop, "onactivate", closePicker);
    setPanelEvent(ui.pickerPanel, "oncancel", closePicker);
    bindPickerSlider(ui.pickerHueSlider, "hue");
    bindPickerSlider(ui.pickerSaturationSlider, "saturation");
    bindPickerSlider(ui.pickerLumenSlider, "lightness");
  }

  function bindControls() {
    var shape = controlPanel("HPColorsStaminaShape");
    registerConditionControl(shape, "staminaShape");
    setPanelEvent(shape, "oninputsubmit", function () {
      if (syncingControls || !isValid(shape) || !shape["GetSelected"]) return;
      var selected = shape["GetSelected"]();
      if (isValid(selected)) commitValue("staminaShape", selected.id);
    });
    for (var index = 0; index < TOGGLE_CONTROLS.length; index++) {
      var toggle = TOGGLE_CONTROLS[index];
      bindToggle(toggle.id, toggle.key);
    }
    for (index = 0; index < MODE_CONTROLS.length; index++) {
      var mode = MODE_CONTROLS[index];
      bindMode(mode.id, mode.key, mode.value);
    }
    for (index = 0; index < SLIDER_CONTROLS.length; index++) {
      var slider = SLIDER_CONTROLS[index];
      bindSlider(
        slider.base + "Slider",
        slider.base + "Entry",
        slider.key,
        slider.min,
        slider.max,
        slider.increment,
      );
    }
    for (index = 0; index < COLOR_CONTROLS.length; index++) {
      var color = COLOR_CONTROLS[index];
      bindColor(color.base + "Swatch", color.base + "Hex", color.key);
    }
    bindConditionEditorControls();
  }

  function bindMenuControls() {
    setPanelEvent(ui.storeForgetButton, "onactivate", requestForget);
    setPanelEvent(ui.doneButton, "onactivate", requestCloseEditor);
    setPanelEvent(ui.saveToPresetButton, "onactivate", activateSaveToPreset);
    setPanelEvent(ui.saveToMoreButton, "onactivate", function () {
      if (!panelHasClass(ui.saveToMoreButton, "Disabled")) openSaveToDialog();
    });
    setPanelEvent(ui.saveToNewButton, "onactivate", saveToNewPreset);
    setPanelEvent(ui.saveToCloseButton, "onactivate", closeSaveToDialog);
    setPanelEvent(ui.saveToBackdrop, "onactivate", closeSaveToDialog);
    setPanelEvent(ui.saveToDialog, "oncancel", closeSaveToDialog);
    setPanelEvent(ui.exitSaveButton, "onactivate", exitSaveAndClose);
    setPanelEvent(ui.exitReviewButton, "onactivate", exitReviewPresets);
    setPanelEvent(ui.exitDiscardButton, "onactivate", exitWithoutSaving);
    setPanelEvent(ui.exitBackdrop, "onactivate", closeExitDialog);
    setPanelEvent(ui.exitDialog, "oncancel", closeExitDialog);
    setPanelEvent(ui.undoButton, "onactivate", undo);
    setPanelEvent(ui.resetButton, "onactivate", requestSectionReset);
    setPanelEvent(ui.resetConfirmButton, "onactivate", confirmSectionReset);
    setPanelEvent(ui.resetCancelButton, "onactivate", closeResetDialog);
    setPanelEvent(ui.resetDialog, "oncancel", closeResetDialog);
    setPanelEvent(ui.transferButton, "onactivate", openTransferDialog);
    setPanelEvent(ui.transferExportButton, "onactivate", copyCurrentSettings);
    setPanelEvent(ui.transferImportButton, "onactivate", importLiveSettings);
    setPanelEvent(ui.transferCloseButton, "onactivate", closeTransferDialog);
    setPanelEvent(ui.transferDialog, "oncancel", closeTransferDialog);
    setPanelEvent(ui.currentScopeAll, "onactivate", function () {
      setCurrentScopeMode(HERO_SCOPE_ALL);
    });
    setPanelEvent(ui.currentScopeSelected, "onactivate", function () {
      openScopeDialog(HERO_SCOPE_SELECTED);
    });
    setPanelEvent(ui.currentScopeExcept, "onactivate", function () {
      openScopeDialog(HERO_SCOPE_EXCEPT);
    });
    setPanelEvent(ui.scopeSearch, "ontextentrychange", filterScopeHeroOptions);
    setPanelEvent(ui.scopeCloseButton, "onactivate", closeScopeDialog);
    setPanelEvent(ui.scopeDialog, "oncancel", closeScopeDialog);
    setPanelEvent(ui.presetSaveButton, "onactivate", saveCurrentPreset);
    setPanelEvent(ui.presetNewButton, "onactivate", beginNewPreset);
    setPanelEvent(ui.presetGuideToggle, "onactivate", togglePresetGuide);
    renderPresetGuide();
    setText(
      ui.presetScopeHelp,
      "HEROES chooses when this preset loads automatically. See HOW PRESETS WORK for switching rules.",
    );
    setPanelEvent(
      ui.presetCancelEditButton,
      "onactivate",
      closePresetEdit,
    );
    setPanelEvent(ui.presetCopyAllButton, "onactivate", copyAllPresets);
    setPanelEvent(
      ui.presetImportButton,
      "onactivate",
      openPresetTransferDialog,
    );
    setPanelEvent(
      ui.presetTransferConfirmButton,
      "onactivate",
      confirmPresetTransferImport,
    );
    setPanelEvent(
      ui.presetTransferCloseButton,
      "onactivate",
      closePresetTransferDialog,
    );
    setPanelEvent(
      ui.presetTransferDialog,
      "oncancel",
      closePresetTransferDialog,
    );
    setPanelEvent(
      ui.presetRestoreBakedButton,
      "onactivate",
      restoreHiddenBakedPresets,
    );
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
  }

  function requestOpen() {
    if (state.booted) {
      openEditor();
      return;
    }
    setClass(ui.menuButton, "Loading", true);
  }

  function setHydrationDone(raw) {
    if (raw) {
      try {
        var saved = typeof raw === "string" ? JSON.parse(raw) : raw;
        formatNoticePending = /"(?:readoutFormat|allyReadoutFormat)"\s*:\s*"(?:percent|current)"/.test(JSON.stringify(saved));
      } catch {}
    }
    hydration = { phase: "done", raw: raw };
    writeRootAttribute(HYDRATION_ATTR, "done");
  }

  // Cold boot: nothing in this process has written the session attribute, so
  // saved settings come from the store. Warm boot (layout reload) keeps the
  // session attribute, which is always newer than the store.
  function beginHydration() {
    ensureStorage();
    var sessionRaw = readRootAttribute(MENU_STATE_ATTR);
    if (sessionRaw) {
      setHydrationDone(sessionRaw);
      restoreProcessGate(sessionRaw);
      return;
    }
    if (!storage) {
      setHydrationDone(null);
      setGate("blocked");
      return;
    }
    hydration = { phase: "pending", raw: null };
    writeRootAttribute(HYDRATION_ATTR, "pending");
    renderStoreStatus();
    storage.load(function (outcome) {
      if (!isValid(context) || hydration.phase !== "pending") return;
      setHydrationDone(applyLoadOutcome(outcome));
      boot();
    });
  }

  function boot() {
    if (state.booted || hydration.phase === "pending") return;
    if (!resolvePanels()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: required panel missing");
      return;
    }
    if (
      !$.HPColorsV2StateFactory ||
      !isCallable($.HPColorsV2StateFactory.create)
    ) {
      $.Msg("[HP Colors Rewrite] menu boot failed: HPColorsV2StateFactory missing");
      return;
    }
    setPanelEvent(ui.menuButton, "onactivate", requestOpen);
    if (hydration.phase === "idle") beginHydration();
    if (state.booted || hydration.phase !== "done") return;
    var publishedRaw = decodePublishedState(readRootAttribute(CONFIG_ATTR));
    try {
      stateInstance = $.HPColorsV2StateFactory.create({
        sessionRaw: hydration.raw || null,
        publishedRaw: publishedRaw || null,
      });
    } catch (error) {
      $.Msg(
        "[HP Colors Rewrite] menu boot failed: state factory create error: " +
          String(error),
      );
      return;
    }
    if (
      !stateInstance ||
      !isCallable(stateInstance.send) ||
      !isCallable(stateInstance.read)
    ) {
      $.Msg("[HP Colors Rewrite] menu boot failed: invalid state instance");
      stateInstance = null;
      return;
    }
    state.view = stateInstance.read();
    try {
      if (!createSliders() || !createScopeHeroOptions()) {
        $.Msg("[HP Colors Rewrite] menu boot failed: control creation incomplete");
        return;
      }
    } catch (error) {
      $.Msg(
        "[HP Colors Rewrite] menu boot failed: control creation error: " +
          String(error),
      );
      return;
    }
    bindMenuControls();

    state.booted = true;
    setClass(ui.menuButton, "Loading", false);
    sendState({ type: "session_open", publish: true });
    var effectiveRaw = readRootAttribute(CONFIG_ATTR);
    if (effectiveRaw) serializedReplayPayload = effectiveRaw;
    refreshSnapshotReplay();
    renderNavigation();
    renderStoreStatus();
    restartIdentityWatch();
  }


  $.HPColorsMenuBoot = boot;
  $.HPColorsMenuCancel = cancel;
})();
