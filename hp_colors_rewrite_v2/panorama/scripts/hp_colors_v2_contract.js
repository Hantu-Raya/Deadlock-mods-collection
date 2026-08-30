(function () {
  "use strict";

  var VERSION = 1;
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var CONFIG_MAGIC = "HP_COLORS_V2_CONFIG";
  var CONFIG_ATTR = "hp_colors_v2_config";
  var DEFAULTS = {
    enabled: true,
    enemyColor: "#FD4949",
    allyColor: "#FFEFD7",
    pipsVisible: true,
  };
  var DEFAULT_KEYS = ["enabled", "enemyColor", "allyColor", "pipsVisible"];
  var BOOLEAN_KEYS = {
    enabled: true,
    pipsVisible: true,
  };
  var COLOR_KEYS = {
    enemyColor: true,
    allyColor: true,
  };

  function isObjectValue(value) {
    return value !== null && Object(value) === value && !Array.isArray(value);
  }

  function freezeDeep(value) {
    var keys;
    var index;
    if (!value || Object(value) !== value || Object.isFrozen(value)) return value;
    keys = Object.keys(value);
    for (index = 0; index < keys.length; index += 1) {
      freezeDeep(value[keys[index]]);
    }
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
    var key;
    for (index = 0; index < DEFAULT_KEYS.length; index += 1) {
      key = DEFAULT_KEYS[index];
      result[key] =
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : DEFAULTS[key];
    }
    return result;
  }

  function normalizeColor(value, fallback) {
    var raw;
    try {
      raw = String(value || "").replace(/^\s+|\s+$/g, "").toUpperCase();
    } catch (error) {
      return fallback;
    }
    if (raw.charAt(0) !== "#") raw = "#" + raw;
    return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
  }

  function normalizeValue(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return undefined;
    if (BOOLEAN_KEYS[key]) return !!value;
    if (COLOR_KEYS[key]) return normalizeColor(value, DEFAULTS[key]);
    return value;
  }

  function normalizeValues(source) {
    var values = copyValues(null);
    var index;
    var key;
    var value;
    for (index = 0; index < DEFAULT_KEYS.length; index += 1) {
      key = DEFAULT_KEYS[index];
      value =
        isObjectValue(source) && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : DEFAULTS[key];
      values[key] = normalizeValue(key, value);
    }
    return values;
  }

  function validateSettingValue(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return false;
    if (BOOLEAN_KEYS[key]) return isBooleanValue(value);
    if (COLOR_KEYS[key]) {
      return isStringValue(value) && !!normalizeColor(value, "");
    }
    return false;
  }

  var CONTRACT = freezeDeep({
    version: VERSION,
    eventChannel: EVENT_CHANNEL,
    magicWord: CONFIG_MAGIC,
    configAttribute: CONFIG_ATTR,
    defaults: DEFAULTS,
    keys: DEFAULT_KEYS,
    booleanKeys: BOOLEAN_KEYS,
    colorKeys: COLOR_KEYS,
    copyValues: copyValues,
    normalizeColor: normalizeColor,
    normalizeValue: normalizeValue,
    normalizeValues: normalizeValues,
    validateSettingValue: validateSettingValue,
    isStringValue: isStringValue,
    isBooleanValue: isBooleanValue,
  });

  $.HPColorsV2ContractFactory = Object.freeze({
    create: function () {
      return CONTRACT;
    },
  });
})();
