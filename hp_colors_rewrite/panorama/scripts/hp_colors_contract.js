(function () {
  "use strict";

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
    excludeGhouls: false,
    ghoulOpacityEnabled: false,
    ghoulOpacity: 100,
    readoutMaxTeamColor: false,
    allyTeamHigh: false,
  };

  var DEFAULT_KEYS = [
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

  var BOOLEAN_KEYS = {
    enabled: true,
    enemyEnabled: true,
    enemyVisible: true,
    enemyTeamHigh: true,
    excludeBuildings: true,
    excludeBosses: true,
    excludeGhouls: true,
    ghoulOpacityEnabled: true,
    allyEnabled: true,
    allyVisible: true,
    readoutVisible: true,
    pipsVisible: true,
    precisePipsEnabled: true,
    levelsVisible: true,
    enemyPulseEnabled: true,
    enemyPulseColorEnabled: true,
    enemyPulseHideBar: true,
    enemyPulseReadout: true,
    enemyPulseReadoutModifiers: true,
    allyPulseEnabled: true,
    allyPulseColorEnabled: true,
    enemyKillMarkerEnabled: true,
    readoutMaxTeamColor: true,
    allyTeamHigh: true,
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
    allyPulseColor: true,
    enemyKillMarkerColor: true,
  };

  var ENUM_OPTIONS = {
    enemyMode: ["fixed", "gradient"],
    allyMode: ["fixed", "gradient"],
    ultMode: ["follow", "custom"],
    readoutFormat: ["hp", "percent", "current"],
    readoutFont: ["default", "oracle", "pulp"],
    readoutColorMode: ["bar", "custom"],
    readoutMode: ["fixed", "gradient"],
    enemyPulseColorMode: ["fixed", "gradient"],
  };

  var NUMBER_BOUNDS = {
    widthScale: [60, 160],
    heightScale: [60, 160],
    positionX: [-300, 300],
    positionY: [-200, 200],
    readoutSize: [72, 320],
    ghoulOpacity: [0, 100],
    readoutOffsetX: [-405, 405],
    readoutOffsetY: [-35, 840],
    enemyPulseThreshold: [0, 100],
    enemyPulseBpm: [30, 300],
    enemyPulseReadoutSize: [72, 320],
    enemyPulseReadoutOffsetX: [-405, 405],
    enemyPulseReadoutOffsetY: [-35, 840],
    allyPulseThreshold: [0, 100],
    allyPulseBpm: [30, 300],
    enemyKillMarkerThreshold: [5, 80],
    enemyKillMarkerWidth: [1, 100],
    lowThreshold: [0, 99],
    enemyPulseIntensity: [0, 2],
    allyPulseIntensity: [0, 2],
    highThreshold: [1, 100],
  };

  function isObjectValue(value) {
    var tag;
    if (value === null || Object(value) !== value) return false;
    tag = Object.prototype.toString.call(value);
    return (
      tag !== "[object Function]" &&
      tag !== "[object AsyncFunction]" &&
      tag !== "[object GeneratorFunction]" &&
      tag !== "[object AsyncGeneratorFunction]"
    );
  }

  function freezeDeep(value) {
    if (!value || !isObjectValue(value) || Object.isFrozen(value)) return value;
    var keys = Object.keys(value);
    var index;
    for (index = 0; index < keys.length; index++) freezeDeep(value[keys[index]]);
    return Object.freeze(value);
  }

  function isStringValue(value) {
    return Object(value) !== value && value === String(value);
  }

  function isBooleanValue(value) {
    return value === true || value === false;
  }

  function copyValues(source) {
    var result = {};
    var index;
    for (index = 0; index < DEFAULT_KEYS.length; index++) {
      var key = DEFAULT_KEYS[index];
      result[key] =
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : DEFAULTS[key];
    }
    return result;
  }

  function normalizeColor(value, fallback) {
    var raw = String(value || "").replace(/^\s+|\s+$/g, "").toUpperCase();
    if (raw.charAt(0) !== "#") raw = "#" + raw;
    return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
  }

  function clampNumber(value, min, max, fallback) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    number = Math.round(number);
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

  function normalizeValue(key, value, values) {
    if (BOOLEAN_KEYS[key]) return !!value;
    if (COLOR_KEYS[key]) return normalizeColor(value, DEFAULTS[key]);
    if (ENUM_OPTIONS[key])
      return optionContains(key, value) ? value : DEFAULTS[key];
    if (key === "lowThreshold")
      return clampNumber(
        value,
        0,
        Math.max(0, (values || DEFAULTS).highThreshold - 1),
        DEFAULTS[key],
      );
    if (key === "highThreshold")
      return clampNumber(
        value,
        Math.min(100, (values || DEFAULTS).lowThreshold + 1),
        100,
        DEFAULTS[key],
      );
    var bounds = NUMBER_BOUNDS[key];
    if (bounds)
      return clampNumber(value, bounds[0], bounds[1], DEFAULTS[key]);
    return value;
  }

  function normalizeValues(source) {
    var values = copyValues(DEFAULTS);
    var index;
    for (index = 0; index < DEFAULT_KEYS.length; index++) {
      var key = DEFAULT_KEYS[index];
      var value =
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : DEFAULTS[key];
      values[key] = normalizeValue(key, value, values);
    }
    values.lowThreshold = clampNumber(
      values.lowThreshold,
      0,
      Math.max(0, values.highThreshold - 1),
      DEFAULTS.lowThreshold,
    );
    values.highThreshold = clampNumber(
      values.highThreshold,
      Math.min(100, values.lowThreshold + 1),
      100,
      DEFAULTS.highThreshold,
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
      conditionEligible: settingMetaKey !== "precisePipsEnabled",
      min: settingBounds ? settingBounds[0] : null,
      max: settingBounds ? settingBounds[1] : null,
      options: ENUM_OPTIONS[settingMetaKey]
        ? ENUM_OPTIONS[settingMetaKey].slice(0)
        : [],
    };
  }

  var CONTRACT = freezeDeep({
    defaults: DEFAULTS,
    keys: DEFAULT_KEYS,
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

  $.HPColorsContractFactory = Object.freeze({
    create: function () {
      return CONTRACT;
    },
  });
})();
