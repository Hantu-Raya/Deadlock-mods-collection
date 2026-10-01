(function () {
  "use strict";
  var VERSION = 2;
  var CONFIG_MAGIC = "HP_COLORS_V2_CONFIG";
  var CONFIG_ATTR = "hp_colors_v2_config";

  var CODEC_DEFAULTS = {
    enabled: true,
    widthScale: 100,
    heightScale: 100,
    positionX: 0,
    positionY: 0,
    staminaWidth: 110,
    staminaHeight: 44.8,
    staminaOffsetX: 0,
    staminaOffsetY: 0,
    enemyStaminaColorEnabled: false,
    enemyStaminaColor: "#FD4949",
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
    readoutOffsetX: 0,
    readoutOffsetY: 0,
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
    enemyPulseReadoutOffsetX: 0,
    enemyPulseReadoutOffsetY: 0,
    allyPulseEnabled: false,
    allyPulseThreshold: 25,
    allyPulseBpm: 75,
    allyPulseIntensity: 1,
    allyPulseColorEnabled: false,
    allyPulseColor: "#FF2222",
    allyPulseColorMode: "fixed",
    enemyKillMarkerEnabled: false,
    enemyKillMarkerThreshold: 25,
    enemyKillMarkerWidth: 3,
    enemyKillMarkerColor: "#FF2222",
    excludeGhouls: false,
    ghoulOpacityEnabled: false,
    ghoulOpacity: 100,
    readoutMaxTeamColor: false,
    allyTeamHigh: false,
    accessoryAnchorEnabled: true,
    ultOffsetX: 0,
    ultOffsetY: 0,
    levelOffsetX: 0,
    levelOffsetY: 0,
    pickupTimersEnabled: true,
    pickupGunColor: "#EC9719",
    pickupMovementColor: "#6E65EA",
    pickupSpiritColor: "#CE90FF",
    pickupSurvivalColor: "#7BBA1D",
    pickupBackgroundDarkness: 70,
    pickupGlyphColor: "#10130D",
    pickupSize: 22,
    pickupSpacing: 1,
    pickupOffsetX: 0,
    pickupOffsetY: 0,
    ultimateTimerEnabled: true,
    ultimateTimerSize: 100,
    ultimateTimerDarkness: 99,
    ultimateTimerColorMode: "follow",
    ultimateTimerUnavailableColor: "#E16161",
    ultimateTimerAvailableColor: "#7BBA1D",
    allyReadoutVisible: false,
    allyReadoutFormat: "hp",
    allyReadoutSize: 145,
    allyReadoutFont: "default",
    allyReadoutOffsetX: 0,
    allyReadoutOffsetY: 0,
    allyReadoutColorMode: "bar",
    allyReadoutMode: "fixed",
    allyReadoutLow: "#E16161",
    allyReadoutMid: "#FF7B00",
    allyReadoutHigh: "#FFFFFF",
    allyReadoutMaxTeamColor: false,
    npcEnemyEnabled: false,
    npcAllyEnabled: false,
    npcNeutralEnabled: false,
    buildingEnemyEnabled: false,
    buildingAllyEnabled: false,
    neutralColor: "#5BEFB5",
    criticalIndicatorVisible: true,
    playerNamesVisible: true,
    enemyNameColorEnabled: false,
    enemyNameColor: "#FF6A6A",
    allyNameColorEnabled: false,
    allyNameColor: "#FFFFFF",
    nameSize: 14,
    nameOffsetX: 0,
    nameOffsetY: 0,
    enemyPipColorEnabled: false,
    enemyPipColor: "#500202",
    allyPipColorEnabled: false,
    allyPipColor: "#042517",
    pipOpacity: 100,
    staminaShape: "arrow",
    readoutOutlineWidth: 5,
    allyReadoutOutlineWidth: 5,
    nameOutlineWidth: 5,
    hudHealthColorMode: "off",
    hudHealthColor: "#FFFF00",
  };

  var HPV2_EXTENSION_KEYS = [
    "staminaWidth",
    "staminaHeight",
    "staminaOffsetX",
    "staminaOffsetY",
    "enemyStaminaColorEnabled",
    "enemyStaminaColor",
    "allyPulseColorMode",
    "accessoryAnchorEnabled",
    "ultOffsetX",
    "ultOffsetY",
    "levelOffsetX",
    "levelOffsetY",
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
    "pickupOffsetY",
    "ultimateTimerEnabled",
    "ultimateTimerSize",
    "ultimateTimerDarkness",
    "ultimateTimerColorMode",
    "ultimateTimerUnavailableColor",
    "ultimateTimerAvailableColor",
    "allyReadoutVisible",
    "allyReadoutFormat",
    "allyReadoutSize",
    "allyReadoutFont",
    "allyReadoutOffsetX",
    "allyReadoutOffsetY",
    "allyReadoutColorMode",
    "allyReadoutMode",
    "allyReadoutLow",
    "allyReadoutMid",
    "allyReadoutHigh",
    "allyReadoutMaxTeamColor",
    "npcEnemyEnabled",
    "npcAllyEnabled",
    "npcNeutralEnabled",
    "buildingEnemyEnabled",
    "buildingAllyEnabled",
    "neutralColor",
    "criticalIndicatorVisible",
    "playerNamesVisible",
    "enemyNameColorEnabled",
    "enemyNameColor",
    "allyNameColorEnabled",
    "allyNameColor",
    "nameSize",
    "nameOffsetX",
    "nameOffsetY",
    "enemyPipColorEnabled",
    "enemyPipColor",
    "allyPipColorEnabled",
    "allyPipColor",
    "pipOpacity",
    "staminaShape",
    "readoutOutlineWidth",
    "allyReadoutOutlineWidth",
    "nameOutlineWidth",
    "hudHealthColorMode",
    "hudHealthColor",
  ];
  var CODEC_KEYS = [
    "enabled",
    "widthScale",
    "heightScale",
    "positionX",
    "positionY",
    "enemyEnabled",
    "enemyVisible",
    "enemyMode",
    "enemyLow",
    "enemyMid",
    "enemyHigh",
    "enemyTeamHigh",
    "excludeBuildings",
    "excludeBosses",
    "enemyHealing",
    "enemyDelta",
    "enemyBulletShield",
    "allyEnabled",
    "allyVisible",
    "allyMode",
    "allyLow",
    "allyMid",
    "allyHigh",
    "allyHealing",
    "allyDelta",
    "allyBulletShield",
    "ultMode",
    "ultCustom",
    "readoutVisible",
    "readoutFormat",
    "readoutSize",
    "readoutFont",
    "readoutOffsetX",
    "readoutOffsetY",
    "readoutColorMode",
    "readoutMode",
    "readoutLow",
    "readoutMid",
    "readoutHigh",
    "pipsVisible",
    "precisePipsEnabled",
    "levelsVisible",
    "lowThreshold",
    "highThreshold",
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
    "allyPulseEnabled",
    "allyPulseThreshold",
    "allyPulseBpm",
    "allyPulseIntensity",
    "allyPulseColorEnabled",
    "allyPulseColor",
    "enemyKillMarkerEnabled",
    "enemyKillMarkerThreshold",
    "enemyKillMarkerWidth",
    "enemyKillMarkerColor",
    "excludeGhouls",
    "ghoulOpacityEnabled",
    "ghoulOpacity",
    "readoutMaxTeamColor",
    "allyTeamHigh",
  ];
  // Retired codec slots keep their positions so every later slot and every old
  // share code still lines up, but the key is no longer an editable setting.
  // Editable keys: live legacy codec slots, then the appended hpv2 extension slots.
  var RETIRED_CODEC_KEYS = {
    excludeBuildings: true,
    excludeBosses: true,
    excludeGhouls: true,
    ghoulOpacityEnabled: true,
    ghoulOpacity: true,
    readoutFormat: true,
    precisePipsEnabled: true,
    readoutMaxTeamColor: true,
  };
  // Retired keys that v2 once let players attach ability conditions to. Old
  // saves and share codes may still carry rules for them; loaders drop those
  // rules instead of rejecting the whole payload.
  var RETIRED_CONDITION_KEYS = {
    ghoulOpacityEnabled: true,
    ghoulOpacity: true,
    readoutFormat: true,
    allyReadoutFormat: true,
    precisePipsEnabled: true,
    readoutMaxTeamColor: true,
    allyReadoutMaxTeamColor: true,
  };
  var RETIRED_EXTENSION_KEYS = {
    allyReadoutFormat: true,
    allyReadoutMaxTeamColor: true,
  };
  var DEFAULT_KEYS = CODEC_KEYS.filter(function (key) {
    return !RETIRED_CODEC_KEYS[key];
  }).concat(HPV2_EXTENSION_KEYS.filter(function (key) {
    return !RETIRED_EXTENSION_KEYS[key];
  }));
  var DEFAULTS = {};
  var defaultIndex;
  for (defaultIndex = 0; defaultIndex < DEFAULT_KEYS.length; defaultIndex++) {
    var defaultKey = DEFAULT_KEYS[defaultIndex];
    DEFAULTS[defaultKey] = CODEC_DEFAULTS[defaultKey];
  }
  DEFAULTS.enemyLow = "#FD4949";
  DEFAULTS.allyLow = "#FFEFD7";
  DEFAULTS.allyMid = "#FFEFD7";
  DEFAULTS.allyHigh = "#FFEFD7";
  DEFAULTS.readoutOffsetX = 0;
  DEFAULTS.readoutOffsetY = 0;
  // Durable sparse records use the shipped baseline at 974128a forever.
  // Wire pairs separately retain CODEC_DEFAULTS, their original slot baseline.
  var SPARSE_DEFAULTS = copyValues(DEFAULTS);
  DEFAULTS.widthScale = 148;
  DEFAULTS.heightScale = 80;
  DEFAULTS.positionY = -38;
  DEFAULTS.readoutFont = "oracle";
  DEFAULTS.readoutOffsetX = 18;
  DEFAULTS.readoutOffsetY = 14;
  DEFAULTS.enemyPipColorEnabled = true;
  DEFAULTS.enemyPipColor = "#000000";
  DEFAULTS.ultOffsetX = 74;
  DEFAULTS.levelOffsetX = 74;
  // Nearest integer raw offset: anchor compensation 38 / 0.8 = 47.5.
  DEFAULTS.ultOffsetY = 48;
  DEFAULTS.levelOffsetY = 48;

  var BOOLEAN_KEYS = {
    enabled: true,
    criticalIndicatorVisible: true,
    playerNamesVisible: true,
    enemyNameColorEnabled: true,
    allyNameColorEnabled: true,
    enemyEnabled: true,
    enemyVisible: true,
    enemyTeamHigh: true,
    allyEnabled: true,
    allyVisible: true,
    enemyStaminaColorEnabled: true,
    readoutVisible: true,
    pipsVisible: true,
    levelsVisible: true,
    enemyPulseEnabled: true,
    enemyPulseColorEnabled: true,
    enemyPulseHideBar: true,
    enemyPulseReadout: true,
    enemyPulseReadoutModifiers: true,
    enemyKillMarkerEnabled: true,
    allyPulseEnabled: true,
    allyPulseColorEnabled: true,
    allyTeamHigh: true,
    accessoryAnchorEnabled: true,
    pickupTimersEnabled: true,
    ultimateTimerEnabled: true,
    allyReadoutVisible: true,
    npcEnemyEnabled: true,
    npcAllyEnabled: true,
    npcNeutralEnabled: true,
    buildingEnemyEnabled: true,
    buildingAllyEnabled: true,
    enemyPipColorEnabled: true,
    allyPipColorEnabled: true,
  };

  var COLOR_KEYS = {
    enemyLow: true,
    enemyMid: true,
    enemyHigh: true,
    enemyHealing: true,
    enemyDelta: true,
    enemyBulletShield: true,
    enemyStaminaColor: true,
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
    allyPulseColor: true,
    enemyKillMarkerColor: true,
    pickupGunColor: true,
    pickupMovementColor: true,
    pickupSpiritColor: true,
    pickupSurvivalColor: true,
    pickupGlyphColor: true,
    ultimateTimerUnavailableColor: true,
    ultimateTimerAvailableColor: true,
    allyReadoutLow: true,
    allyReadoutMid: true,
    allyReadoutHigh: true,
    neutralColor: true,
    enemyNameColor: true,
    allyNameColor: true,
    enemyPipColor: true,
    allyPipColor: true,
    hudHealthColor: true,
  };

  var ENUM_OPTIONS = {
    enemyMode: ["fixed", "gradient"],
    allyMode: ["fixed", "gradient"],
    ultMode: ["follow", "custom"],
    ultimateTimerColorMode: ["follow", "fixed", "gradient"],
    readoutFont: ["default", "oracle", "pulp"],
    readoutColorMode: ["bar", "custom"],
    readoutMode: ["fixed", "gradient"],
    enemyPulseColorMode: ["fixed", "gradient"],
    allyPulseColorMode: ["fixed", "gradient"],
    allyReadoutFont: ["default", "oracle", "pulp"],
    allyReadoutColorMode: ["bar", "custom"],
    allyReadoutMode: ["fixed", "gradient"],
    staminaShape: ["arrow", "circle", "box"],
    hudHealthColorMode: ["off", "team", "custom"],
  };

  var NUMBER_BOUNDS = {
    widthScale: [60, 230],
    heightScale: [60, 160],
    positionX: [-2000, 2000],
    positionY: [-2100, 2100],
    staminaWidth: [40, 220],
    staminaHeight: [16, 90],
    staminaOffsetX: [-2000, 2000],
    staminaOffsetY: [-2100, 2100],
    readoutSize: [72, 320],
    readoutOffsetX: [-334, 334],
    readoutOffsetY: [-350, 350],
    enemyPulseThreshold: [0, 100],
    enemyPulseBpm: [30, 300],
    enemyPulseReadoutSize: [72, 320],
    enemyPulseReadoutOffsetX: [-334, 334],
    enemyPulseReadoutOffsetY: [-350, 350],
    allyPulseThreshold: [0, 100],
    allyPulseBpm: [30, 300],
    enemyKillMarkerThreshold: [5, 80],
    enemyKillMarkerWidth: [1, 100],
    lowThreshold: [0, 99],
    enemyPulseIntensity: [0, 2],
    allyPulseIntensity: [0, 2],
    highThreshold: [1, 100],
    ultOffsetX: [-3334, 3334],
    ultOffsetY: [-3500, 3500],
    levelOffsetX: [-3334, 3334],
    levelOffsetY: [-3500, 3500],
    pickupBackgroundDarkness: [0, 100],
    pickupSize: [12, 64],
    pickupSpacing: [0, 16],
    pickupOffsetX: [-200, 200],
    pickupOffsetY: [-100, 100],
    ultimateTimerSize: [25, 200],
    ultimateTimerDarkness: [0, 100],
    allyReadoutSize: [72, 320],
    allyReadoutOffsetX: [-334, 334],
    allyReadoutOffsetY: [-350, 350],
    nameSize: [8, 40],
    nameOffsetX: [-200, 200],
    nameOffsetY: [-210, 210],
    pipOpacity: [0, 100],
    readoutOutlineWidth: [0, 10],
    allyReadoutOutlineWidth: [0, 10],
    nameOutlineWidth: [0, 10],
  };

  var NUMBER_STEPS = {
    ultimateTimerSize: 5,
    readoutOutlineWidth: 0.5,
    allyReadoutOutlineWidth: 0.5,
    nameOutlineWidth: 0.5,
  };

  function freezeDeep(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    var keys = Object.keys(value);
    var index;
    for (index = 0; index < keys.length; index++) freezeDeep(value[keys[index]]);
    return Object.freeze(value);
  }

  function isStringValue(value) {
    return typeof value === "string";
  }

  function isBooleanValue(value) {
    return value === true || value === false;
  }

  function copyValues(source, defaults) {
    var result = {};
    var fallback = defaults || DEFAULTS;
    var index;
    for (index = 0; index < DEFAULT_KEYS.length; index++) {
      var key = DEFAULT_KEYS[index];
      result[key] =
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : fallback[key];
    }
    return result;
  }

  function normalizeColor(value, fallback) {
    var raw = String(value || "").replace(/^\s+|\s+$/g, "").toUpperCase();
    if (raw.charAt(0) !== "#") raw = "#" + raw;
    return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
  }

  function clampNumber(value, min, max, fallback, step) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    var increment = Number(step) || 1;
    number = Math.round(number / increment) * increment;
    return Math.max(min, Math.min(max, number));
  }

  function clampDecimalNumber(value, min, max, fallback, decimalPlaces) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    var factor = Math.pow(10, decimalPlaces);
    number = Math.round(number * factor) / factor;
    return Math.max(min, Math.min(max, number));
  }

  function optionContains(key, value) {
    var options = ENUM_OPTIONS[key] || [];
    var index;
    for (index = 0; index < options.length; index++) {
      if (options[index] === value) return true;
    }
    return false;
  }

  function normalizeValue(key, value, values, defaults) {
    var fallback = defaults || DEFAULTS;
    if (BOOLEAN_KEYS[key]) return !!value;
    if (COLOR_KEYS[key]) return normalizeColor(value, fallback[key]);
    if (ENUM_OPTIONS[key])
      return optionContains(key, value) ? value : fallback[key];
    if (key === "lowThreshold")
      return clampNumber(
        value,
        0,
        Math.max(0, (values || fallback).highThreshold - 1),
        fallback[key],
      );
    if (key === "highThreshold")
      return clampNumber(
        value,
        Math.min(100, (values || fallback).lowThreshold + 1),
        100,
        fallback[key],
      );
    var bounds = NUMBER_BOUNDS[key];
    if (key === "staminaHeight")
      return clampDecimalNumber(value, bounds[0], bounds[1], fallback[key], 1);
    if (bounds)
      return clampNumber(
        value,
        bounds[0],
        bounds[1],
        fallback[key],
        NUMBER_STEPS[key],
      );
    return value;
  }

  function normalizeValues(source, defaults) {
    var fallback = defaults || DEFAULTS;
    var values = copyValues(null, fallback);
    var index;
    for (index = 0; index < DEFAULT_KEYS.length; index++) {
      var key = DEFAULT_KEYS[index];
      var value =
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : fallback[key];
      values[key] = normalizeValue(key, value, values, fallback);
    }
    if (fallback !== DEFAULTS &&
        (!source || !Object.prototype.hasOwnProperty.call(source, "staminaShape")))
      values.staminaShape =
        values.staminaWidth !== 110 ||
        values.staminaHeight !== 44.8 ||
        values.enemyStaminaColorEnabled
          ? "box"
          : "arrow";
    values.lowThreshold = clampNumber(
      values.lowThreshold,
      0,
      Math.max(0, values.highThreshold - 1),
      fallback.lowThreshold,
    );
    values.highThreshold = clampNumber(
      values.highThreshold,
      Math.min(100, values.lowThreshold + 1),
      100,
      fallback.highThreshold,
    );
    return values;
  }

  function validateSettingValue(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return false;
    if (BOOLEAN_KEYS[key]) return isBooleanValue(value);
    if (COLOR_KEYS[key])
      return isStringValue(value) && !!normalizeColor(value, "");
    if (ENUM_OPTIONS[key]) return optionContains(key, value);
    return (
      Number.isFinite(value) ||
      (isStringValue(value) && value !== "" && Number.isFinite(Number(value)))
    );
  }

  var SETTING_META = {};
  var settingMetaIndex;
  for (settingMetaIndex = 0; settingMetaIndex < DEFAULT_KEYS.length; settingMetaIndex++) {
    var settingMetaKey = DEFAULT_KEYS[settingMetaIndex];
    var settingType = BOOLEAN_KEYS[settingMetaKey]
      ? "boolean"
      : COLOR_KEYS[settingMetaKey]
        ? "color"
        : ENUM_OPTIONS[settingMetaKey]
          ? "enum"
          : "number";
    var settingBounds = NUMBER_BOUNDS[settingMetaKey] || null;
    SETTING_META[settingMetaKey] = {
      type: settingType,
      color: !!COLOR_KEYS[settingMetaKey],
      conditionEligible: true,
      min: settingBounds ? settingBounds[0] : null,
      max: settingBounds ? settingBounds[1] : null,
      options: ENUM_OPTIONS[settingMetaKey]
        ? ENUM_OPTIONS[settingMetaKey].slice(0)
        : [],
    };
  }

  var CONTRACT = freezeDeep({
    version: VERSION,
    magicWord: CONFIG_MAGIC,
    configAttribute: CONFIG_ATTR,
    defaults: DEFAULTS,
    codecDefaults: CODEC_DEFAULTS,
    sparseDefaults: SPARSE_DEFAULTS,
    keys: DEFAULT_KEYS,
    codecKeys: CODEC_KEYS,
    extensionKeys: HPV2_EXTENSION_KEYS,
    retiredConditionKeys: RETIRED_CONDITION_KEYS,
    booleanKeys: BOOLEAN_KEYS,
    colorKeys: COLOR_KEYS,
    enumOptions: ENUM_OPTIONS,
    numberBounds: NUMBER_BOUNDS,
    settingMeta: SETTING_META,
    copyValues: copyValues,
    normalizeColor: normalizeColor,
    normalizeValue: normalizeValue,
    normalizeValues: normalizeValues,
    optionContains: optionContains,
    isStringValue: isStringValue,
    isBooleanValue: isBooleanValue,
    validateSettingValue: validateSettingValue,
  });

  $.HPColorsV2ContractFactory = Object.freeze({
    create: function () {
      return CONTRACT;
    },
  });
})();
