(function () {
  "use strict";

  var HERO_SCOPE_OFF = "off";
  var HERO_SCOPE_ALL = "all";
  var HERO_SCOPE_SELECTED = "selected";
  var CURRENT_SCOPE_ID = "scope_current";
  var DEFAULT_PRESET_ID = "baked_default";
  var HERO_MODE_AUTO = "auto";
  var HERO_MODE_MANUAL = "manual";
  var HERO_MODE_OFF = "off";
  var HERO_PHASE_TRANSITIONING = "transitioning";
  var HERO_PHASE_LOBBY = "lobby";
  var HERO_PHASE_ACTIVE = "active";
  var HERO_PHASE_POST_MATCH = "post_match";
  var HISTORY_LIMIT = 40;
  var MAX_PRESET_RECORDS = 128;

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
  var heroIndex;
  for (heroIndex = 0; heroIndex < HERO_DATA.length; heroIndex++) {
    HERO_BY_KEY[HERO_DATA[heroIndex][0]] = HERO_DATA[heroIndex][1];
    HERO_BY_RETAIL_NAME[HERO_DATA[heroIndex][1].toUpperCase()] =
      HERO_DATA[heroIndex][0];
  }

  if (!$.HPColorsV2ContractFactory || !$.HPColorsV2ContractFactory.create)
    throw new Error("HP Colors v2 settings contract unavailable");
  var settingsContract = $.HPColorsV2ContractFactory.create();
  delete $.HPColorsV2ContractFactory;
  var DEFAULTS = settingsContract.defaults;
  var CODEC_DEFAULTS = settingsContract.codecDefaults || DEFAULTS;
  var DEFAULT_KEYS = settingsContract.keys;
  var CODEC_KEYS = settingsContract.codecKeys || DEFAULT_KEYS;
  var EXTENSION_KEYS = settingsContract.extensionKeys || [];
  var EXTENSION_KEY_SET = {};
  var extensionKeyIndex;
  for (
    extensionKeyIndex = 0;
    extensionKeyIndex < EXTENSION_KEYS.length;
    extensionKeyIndex++
  )
    EXTENSION_KEY_SET[EXTENSION_KEYS[extensionKeyIndex]] = true;
  var BOOLEAN_KEYS = settingsContract.booleanKeys;
  var COLOR_KEYS = settingsContract.colorKeys;
  var ENUM_OPTIONS = settingsContract.enumOptions;
  var SETTING_META = settingsContract.settingMeta;
  var copyValues = settingsContract.copyValues;
  var normalizeColor = settingsContract.normalizeColor;
  var normalizeValue = settingsContract.normalizeValue;
  var normalizeValues = settingsContract.normalizeValues;
  var optionContains = settingsContract.optionContains;
  var isStringValue = settingsContract.isStringValue;
  var isBooleanValue = settingsContract.isBooleanValue;
  var validateSettingValue = settingsContract.validateSettingValue;

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
    if (!value || !isObjectValue(value) || Object.isFrozen(value))
      return value;
    var keys = Object.keys(value);
    var index;
    for (index = 0; index < keys.length; index++)
      freezeDeep(value[keys[index]]);
    return Object.freeze(value);
  }
  var BAKED_PRESET = freezeDeep({
    id: DEFAULT_PRESET_ID,
    kind: "baked",
    name: "Rewrite Default",
    values: copyValues(DEFAULTS),
    mode: HERO_SCOPE_OFF,
    heroes: [],
    conditions: null,
  });

  function copyObject(source) {
    var result = {};
    var key;
    if (!source || !isObjectValue(source)) return result;
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key))
        result[key] = source[key];
    }
    return result;
  }


  function normalizeHeroSelection(source) {
    var selected = {};
    var result = [];
    var index;
    var values = Array.isArray(source) ? source : [];
    for (index = 0; index < values.length; index++) {
      var key = String(values[index] || "");
      if (Object.prototype.hasOwnProperty.call(HERO_BY_KEY, key))
        selected[key] = true;
    }
    for (index = 0; index < HERO_DATA.length; index++) {
      if (selected[HERO_DATA[index][0]]) result.push(HERO_DATA[index][0]);
    }
    return result;
  }

  function normalizeScopeMode(mode, heroes) {
    if (mode === HERO_SCOPE_ALL) return HERO_SCOPE_ALL;
    if (mode === HERO_SCOPE_SELECTED && heroes.length) return HERO_SCOPE_SELECTED;
    return HERO_SCOPE_OFF;
  }

  function normalizeConditions(source) {
    var rows =
      source && isObjectValue(source) && !Array.isArray(source)
        ? source
        : {};
    var result = {};
    var index;
    for (index = 0; index < DEFAULT_KEYS.length; index++) {
      var key = DEFAULT_KEYS[index];
      if (
        !SETTING_META[key].conditionEligible ||
        !Object.prototype.hasOwnProperty.call(rows, key)
      )
        continue;
      var rule = rows[key];
      if (!rule || !isObjectValue(rule) || Array.isArray(rule)) continue;
      var slot = rule.slot;
      var minTier = rule.minTier;
      if (
        !Number.isFinite(slot) ||
        !Number.isFinite(minTier) ||
        Math.floor(slot) !== slot ||
        slot < 1 ||
        slot > 4 ||
        Math.floor(minTier) !== minTier ||
        minTier < 1 ||
        minTier > 3
      )
        continue;
      var settingType = SETTING_META[key].type;
      var value = rule.value;
      if (settingType === "boolean" && !isBooleanValue(value)) continue;
      if (settingType === "number" && !Number.isFinite(value)) continue;
      if (
        (settingType === "color" || settingType === "enum") &&
        !isStringValue(value)
      )
        continue;
      var normalized = normalizeValue(key, value, DEFAULTS);
      if (
        (settingType === "number" || settingType === "enum") &&
        normalized !== value
      )
        continue;
      result[key] = {
        slot: slot,
        minTier: minTier,
        value: normalized,
      };
    }
    return result;
  }

  function normalizePresetConditions(source) {
    if (source === undefined || source === null) return null;
    var normalized = normalizeConditions(source);
    var key;
    for (key in normalized) {
      if (Object.prototype.hasOwnProperty.call(normalized, key)) return normalized;
    }
    return null;
  }

  function conditionsAreValid(source, normalized, allowEmpty) {
    if (!source || !isObjectValue(source) || Array.isArray(source))
      return false;
    var normalizedRows = normalized || {};
    var sourceCount = 0;
    var normalizedCount = 0;
    var key;
    for (key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      sourceCount += 1;
      var rule = source[key];
      if (
        !Object.prototype.hasOwnProperty.call(normalizedRows, key) ||
        !rule ||
        !isObjectValue(rule) ||
        Array.isArray(rule)
      )
        return false;
      var fieldCount = 0;
      var field;
      for (field in rule) {
        if (!Object.prototype.hasOwnProperty.call(rule, field)) continue;
        fieldCount += 1;
        if (field !== "slot" && field !== "minTier" && field !== "value")
          return false;
      }
      if (
        fieldCount !== 3 ||
        !Object.prototype.hasOwnProperty.call(rule, "slot") ||
        !Object.prototype.hasOwnProperty.call(rule, "minTier") ||
        !Object.prototype.hasOwnProperty.call(rule, "value")
      )
        return false;
    }
    for (key in normalizedRows) {
      if (Object.prototype.hasOwnProperty.call(normalizedRows, key))
        normalizedCount += 1;
    }
    return (
      sourceCount === normalizedCount &&
      (allowEmpty === true || sourceCount > 0)
    );
  }

  function presetConditionsAreValid(source, normalized) {
    if (source === undefined || source === null) return normalized === null;
    return conditionsAreValid(source, normalized, false);
  }

  function normalizeScopeRecord(source) {
    if (!source || !isObjectValue(source)) return null;
    var id = String(source.id || "");
    if (!id) return null;
    var heroes = normalizeHeroSelection(source.heroes);
    var mode = normalizeScopeMode(String(source.mode || ""), heroes);
    var result = {
      id: id,
      mode: mode,
      heroes: mode === HERO_SCOPE_SELECTED ? heroes : [],
      values: normalizeValues(source.values),
      conditions: normalizeConditions(source.conditions),
    };
    var sourcePresetId = String(source.sourcePresetId || "");
    if (id === CURRENT_SCOPE_ID && /^user_\d{4,}$/.test(sourcePresetId))
      result.sourcePresetId = sourcePresetId;
    return result;
  }

  function normalizeScopes(source) {
    var rows = Array.isArray(source) ? source : [];
    var result = [];
    var seen = {};
    var index;
    for (index = 0; index < rows.length; index++) {
      var row = normalizeScopeRecord(rows[index]);
      if (!row || seen[row.id]) continue;
      seen[row.id] = true;
      result.push(row);
    }
    return result;
  }

  function normalizePresetRecord(source, kind) {
    if (!source || !isObjectValue(source)) return null;
    var id = String(source.id || "");
    var name = String(source.name || "").replace(/^\s+|\s+$/g, "");
    if (!id || !name) return null;
    if (kind === "user" && !/^user_\d{4,}$/.test(id)) return null;
    var heroes = normalizeHeroSelection(source.heroes);
    var mode = normalizeScopeMode(String(source.mode || ""), heroes);
    if (kind === "user" && mode === HERO_SCOPE_OFF) mode = HERO_SCOPE_ALL;
    return {
      id: id,
      kind: kind,
      name: name,
      values: normalizeValues(source.values),
      mode: mode,
      heroes: mode === HERO_SCOPE_SELECTED ? heroes : [],
      conditions: normalizePresetConditions(source.conditions),
    };
  }

  function normalizeUserPresets(source) {
    var rows = Array.isArray(source) ? source : [];
    var result = [];
    var seen = {};
    var index;
    for (index = 0; index < rows.length; index++) {
      var preset = normalizePresetRecord(rows[index], "user");
      if (!preset || preset.id === DEFAULT_PRESET_ID || seen[preset.id]) continue;
      seen[preset.id] = true;
      result.push(preset);
    }
    return result;
  }

  function normalizeBakedPresetNameOverrides(source) {
    var rows = source && isObjectValue(source) ? source : {};
    var result = {};
    var name = String(rows[DEFAULT_PRESET_ID] || "").replace(/^\s+|\s+$/g, "");
    if (name && name !== "Rewrite Default") result[DEFAULT_PRESET_ID] = name;
    return result;
  }

  function normalizeHiddenBakedPresetIds(source) {
    var rows = Array.isArray(source) ? source : [];
    var result = [];
    var seen = {};
    var index;
    for (index = 0; index < rows.length; index++) {
      var id = String(rows[index] || "");
      if (id === DEFAULT_PRESET_ID && !seen[id]) {
        seen[id] = true;
        result.push(id);
      }
    }
    return result;
  }

  function nextUserPresetNumber(source, presets) {
    var next = Math.max(1, Math.floor(Number(source) || 1));
    var index;
    for (index = 0; index < presets.length; index++) {
      var match = /^user_(\d+)$/.exec(presets[index].id);
      if (match) next = Math.max(next, Number(match[1]) + 1);
    }
    return next;
  }

  function formatUserPresetId(number) {
    var suffix = String(number);
    while (suffix.length < 4) suffix = "0" + suffix;
    return "user_" + suffix;
  }

  function cloneConditions(source) {
    var result = {};
    var index;
    if (!source || !isObjectValue(source)) return result;
    for (index = 0; index < DEFAULT_KEYS.length; index++) {
      var key = DEFAULT_KEYS[index];
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      var rule = source[key];
      result[key] = {
        slot: rule.slot,
        minTier: rule.minTier,
        value: rule.value,
      };
    }
    return result;
  }

  function cloneScope(source) {
    var result = {
      id: source.id,
      mode: source.mode,
      heroes: source.heroes.slice(0),
      values: copyValues(source.values),
      conditions: cloneConditions(source.conditions),
    };
    if (source.sourcePresetId) result.sourcePresetId = source.sourcePresetId;
    return result;
  }

  function clonePreset(source, displayName) {
    return {
      id: source.id,
      kind: source.kind,
      name: displayName === undefined ? source.name : displayName,
      mode: source.mode,
      heroes: source.heroes.slice(0),
      values: copyValues(source.values),
      conditions: source.conditions === null ? null : cloneConditions(source.conditions),
    };
  }

  function canonicalValuePairs(normalized, keys) {
    var pairs = [];
    var index;
    for (index = 0; index < keys.length; index++) {
      var key = keys[index];
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
      if (normalized[key] !== CODEC_DEFAULTS[key])
        pairs.push([index, normalized[key]]);
    }
    return pairs;
  }

  function canonicalRecordValues(values) {
    return canonicalValuePairs(
      normalizeValues(values, CODEC_DEFAULTS),
      CODEC_KEYS,
    );
  }

  function filterNormalizedConditions(normalized, includeExtension) {
    var result = {};
    var key;
    for (key in normalized) {
      if (!Object.prototype.hasOwnProperty.call(normalized, key)) continue;
      if (!!EXTENSION_KEY_SET[key] !== includeExtension) continue;
      result[key] = normalized[key];
    }
    return result;
  }

  function filterConditions(source, includeExtension) {
    return filterNormalizedConditions(
      normalizeConditions(source),
      includeExtension,
    );
  }

  function nullableFilteredConditions(normalized, includeExtension) {
    var filtered = filterNormalizedConditions(normalized, includeExtension);
    for (var key in filtered) {
      if (Object.prototype.hasOwnProperty.call(filtered, key)) return filtered;
    }
    return null;
  }

  function nullableConditions(source, includeExtension) {
    if (source === undefined || source === null) return null;
    return nullableFilteredConditions(
      normalizeConditions(source),
      includeExtension,
    );
  }

  function mergeConditions(legacy, extension) {
    var result = {};
    var sources = [legacy, extension];
    var sourceIndex;
    for (sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      var source = sources[sourceIndex];
      var key;
      if (!source) continue;
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key))
          result[key] = source[key];
      }
    }
    for (var resultKey in result) {
      if (Object.prototype.hasOwnProperty.call(result, resultKey)) return result;
    }
    return null;
  }


  function deserializePresetExtension(source) {
    if (source === undefined)
      return { values: normalizeValues({}, CODEC_DEFAULTS), conditions: null };
    if (!source || !isObjectValue(source) || Array.isArray(source))
      return { error: "INVALID HPV2 PRESET EXTENSION" };
    var fieldCount = 0;
    var field;
    for (field in source) {
      if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
      fieldCount += 1;
      if (field !== "v" && field !== "values" && field !== "conditions")
        return { error: "INVALID HPV2 PRESET EXTENSION" };
    }
    if (
      fieldCount !== 3 ||
      source.v !== 1 ||
      !Array.isArray(source.values) ||
      !source.conditions ||
      !isObjectValue(source.conditions) ||
      Array.isArray(source.conditions)
    )
      return { error: "INVALID HPV2 PRESET EXTENSION" };
    var changed = {};
    var seen = {};
    var index;
    for (index = 0; index < source.values.length; index++) {
      var pair = source.values[index];
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !Number.isFinite(pair[0]) ||
        Math.floor(pair[0]) !== pair[0] ||
        pair[0] < 0 ||
        pair[0] >= EXTENSION_KEYS.length ||
        seen[pair[0]]
      )
        return { error: "INVALID HPV2 PRESET VALUE PAIR" };
      seen[pair[0]] = true;
      changed[EXTENSION_KEYS[pair[0]]] = pair[1];
    }
    var valueError = validateImportedValues(changed);
    if (valueError) return { error: valueError };
    var conditions = filterConditions(source.conditions, true);
    if (!conditionsAreValid(source.conditions, conditions, true))
      return { error: "INVALID HPV2 PRESET CONDITIONS" };
    return {
      values: normalizeValues(changed, CODEC_DEFAULTS),
      conditions: nullableConditions(conditions, true),
    };
  }

  function validateImportedValues(values) {
    var key;
    for (key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
      var value = values[key];
      if (BOOLEAN_KEYS[key] && !isBooleanValue(value))
        return "INVALID SETTING: " + key;
      if (
        COLOR_KEYS[key] &&
        (!isStringValue(value) || !normalizeColor(value, ""))
      )
        return "INVALID SETTING: " + key;
      if (ENUM_OPTIONS[key] && !optionContains(key, value))
        return "INVALID SETTING: " + key;
      if (
        !BOOLEAN_KEYS[key] &&
        !COLOR_KEYS[key] &&
        !ENUM_OPTIONS[key] &&
        !Number.isFinite(value)
      )
        return "INVALID SETTING: " + key;
    }
    return "";
  }

  function parseSettingsImport(raw) {
    var text = String(raw || "").replace(/^\s+|\s+$/g, "");
    if (text.slice(0, 5) !== "HPCR2")
      return { error: "NOT AN HPCR2 SETTINGS CODE" };
    var payload;
    try {
      payload = JSON.parse(text.slice(5));
    } catch {
      return { error: "INVALID HPCR2 CODE" };
    }
    var pairs = payload;
    var conditions = null;
    var hasConditions = false;
    if (!Array.isArray(payload)) {
      if (!payload || !isObjectValue(payload))
        return { error: "INVALID HPCR2 PAYLOAD" };
      var payloadFieldCount = 0;
      var payloadField;
      for (payloadField in payload) {
        if (!Object.prototype.hasOwnProperty.call(payload, payloadField))
          continue;
        payloadFieldCount += 1;
        if (payloadField !== "v" && payloadField !== "c")
          return { error: "INVALID HPCR2 PAYLOAD" };
      }
      if (
        payloadFieldCount !== 2 ||
        !Object.prototype.hasOwnProperty.call(payload, "v") ||
        !Object.prototype.hasOwnProperty.call(payload, "c")
      )
        return { error: "INVALID HPCR2 PAYLOAD" };
      pairs = payload.v;
      conditions = filterConditions(payload.c, false);
      if (!conditionsAreValid(payload.c, conditions, true))
        return { error: "INVALID HPCR2 CONDITIONS" };
      hasConditions = true;
    }
    if (!Array.isArray(pairs)) return { error: "INVALID HPCR2 PAIRS" };
    var values = {};
    var seen = {};
    var index;
    for (index = 0; index < pairs.length; index++) {
      var pair = pairs[index];
      if (
        !Array.isArray(pair) ||
        !Number.isFinite(pair[0]) ||
        Math.floor(pair[0]) !== pair[0] ||
        pair[0] < 0
      )
        return { error: "INVALID HPCR2 PAIR" };
      var settingIndex = pair[0];
      if (seen[settingIndex]) return { error: "DUPLICATE HPCR2 SETTING" };
      seen[settingIndex] = true;
      if (settingIndex >= CODEC_KEYS.length)
        return { error: "UNKNOWN HPCR2 SETTING" };
      var settingKey = CODEC_KEYS[settingIndex];
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, settingKey))
        values[settingKey] = pair[1];
    }
    var valueError = validateImportedValues(values);
    if (valueError) return { error: valueError };
    return {
      values: normalizeValues(values, CODEC_DEFAULTS),
      conditions: conditions,
      hasConditions: hasConditions,
    };
  }

  function deserializePresetValues(pairs) {
    if (!Array.isArray(pairs)) return { error: "INVALID PRESET VALUES" };
    var changed = {};
    var seen = {};
    var index;
    for (index = 0; index < pairs.length; index++) {
      var pair = pairs[index];
      if (
        !Array.isArray(pair) ||
        !Number.isFinite(pair[0]) ||
        Math.floor(pair[0]) !== pair[0] ||
        pair[0] < 0 ||
        pair[0] >= CODEC_KEYS.length
      )
        return { error: "INVALID PRESET VALUE PAIR" };
      if (seen[pair[0]]) return { error: "DUPLICATE PRESET VALUE" };
      seen[pair[0]] = true;
      var presetKey = CODEC_KEYS[pair[0]];
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, presetKey))
        changed[presetKey] = pair[1];
    }
    var valueError = validateImportedValues(changed);
    if (valueError) return { error: valueError };
    return { values: normalizeValues(changed, CODEC_DEFAULTS) };
  }

  function serializePresetRecord(preset, displayName) {
    var values = normalizeValues(preset.values, CODEC_DEFAULTS);
    var conditions = normalizeConditions(preset.conditions);
    var extensionValues = canonicalValuePairs(values, EXTENSION_KEYS);
    var extensionConditions = nullableFilteredConditions(conditions, true);
    var record = {
      id: preset.id,
      kind: preset.kind,
      name: displayName === undefined ? preset.name : displayName,
      mode: preset.mode,
      heroes: preset.heroes.slice(0),
      values: canonicalValuePairs(values, CODEC_KEYS),
      conditions: nullableFilteredConditions(conditions, false),
    };
    if (extensionValues.length || extensionConditions) {
      record.hpv2 = {
        v: 1,
        values: extensionValues,
        conditions: extensionConditions || {},
      };
    }
    return record;
  }

  function parsePresetTransfer(raw) {
    var text = String(raw || "").replace(/^\s+|\s+$/g, "");
    if (text.slice(0, 6) !== "HPCRP1")
      return { error: "NOT AN HPCRP1 PRESET CODE" };
    var payload;
    try {
      payload = JSON.parse(text.slice(6));
    } catch {
      return { error: "INVALID HPCRP1 CODE" };
    }
    if (
      !payload ||
      !Array.isArray(payload.records) ||
      !payload.records.length ||
      payload.records.length > MAX_PRESET_RECORDS
    )
      return { error: "INVALID PRESET RECORDS" };
    var records = [];
    var seenIds = {};
    var index;
    for (index = 0; index < payload.records.length; index++) {
      var source = payload.records[index];
      var id = String((source && source.id) || "");
      var kind = String((source && source.kind) || "");
      var name = String((source && source.name) || "").replace(/^\s+|\s+$/g, "");
      if (
        !source ||
        !id ||
        seenIds[id] ||
        (kind !== "baked" && kind !== "user") ||
        !name ||
        name.length > 48
      )
        return { error: "INVALID PRESET RECORD" };
      seenIds[id] = true;
      var decoded = deserializePresetValues(source.values);
      if (decoded.error) return decoded;
      var extension = deserializePresetExtension(source.hpv2);
      if (extension.error) return extension;
      var extensionValueIndex;
      for (
        extensionValueIndex = 0;
        extensionValueIndex < EXTENSION_KEYS.length;
        extensionValueIndex++
      ) {
        var extensionKey = EXTENSION_KEYS[extensionValueIndex];
        decoded.values[extensionKey] = extension.values[extensionKey];
      }
      var heroes = normalizeHeroSelection(source.heroes);
      if (
        !Array.isArray(source.heroes) ||
        JSON.stringify(heroes) !== JSON.stringify(source.heroes)
      )
        return { error: "INVALID PRESET HEROES" };
      var mode = String(source.mode || "");
      var conditions = nullableConditions(source.conditions, false);
      if (!presetConditionsAreValid(source.conditions, conditions))
        return { error: "INVALID PRESET CONDITIONS" };
      conditions = mergeConditions(conditions, extension.conditions);
      if (kind === "baked") {
        if (
          id !== DEFAULT_PRESET_ID ||
          mode !== HERO_SCOPE_OFF ||
          JSON.stringify(decoded.values) !== JSON.stringify(DEFAULTS) ||
          JSON.stringify(heroes) !== "[]" ||
          JSON.stringify(conditions) !== "null"
        )
          return { error: "INVALID BAKED PRESET" };
      } else if (
        !/^user_\d{4,}$/.test(id) ||
        (mode !== HERO_SCOPE_ALL && mode !== HERO_SCOPE_SELECTED) ||
        (mode === HERO_SCOPE_SELECTED && !heroes.length) ||
        (mode === HERO_SCOPE_ALL && heroes.length)
      )
        return { error: "INVALID USER PRESET SCOPE" };
      records.push({
        id: id,
        kind: kind,
        name: name,
        values: decoded.values,
        mode: mode,
        heroes: heroes,
        conditions: conditions,
      });
    }
    var hidden = [];
    if (payload.hiddenBakedPresetIds !== undefined) {
      if (!Array.isArray(payload.hiddenBakedPresetIds))
        return { error: "INVALID HIDDEN BAKED PRESETS" };
      hidden = normalizeHiddenBakedPresetIds(payload.hiddenBakedPresetIds);
      if (hidden.length !== payload.hiddenBakedPresetIds.length)
        return { error: "INVALID HIDDEN BAKED PRESETS" };
    }
    var selectedId = String(payload.selectedPresetId || "");
    if (selectedId && !seenIds[selectedId])
      return { error: "INVALID IMPORTED SELECTION" };
    if (selectedId && hidden.indexOf(selectedId) >= 0)
      return { error: "INVALID IMPORTED SELECTION" };
    return {
      records: records,
      hiddenBakedPresetIds: hidden,
      hasRepositoryState: payload.hiddenBakedPresetIds !== undefined,
      selectedPresetId: selectedId,
    };
  }

  function makeSchemaView() {
    var defaults = copyValues(DEFAULTS);
    var settings = [];
    var index;
    for (index = 0; index < DEFAULT_KEYS.length; index++) {
      var key = DEFAULT_KEYS[index];
      var meta = SETTING_META[key];
      settings.push({
        key: key,
        type: meta.type,
        color: meta.color,
        conditionEligible: meta.conditionEligible,
        min: meta.min,
        max: meta.max,
        options: meta.options.slice(0),
      });
    }
    return freezeDeep({
      keys: DEFAULT_KEYS.slice(0),
      defaults: defaults,
      settings: settings,
    });
  }

  var SCHEMA_VIEW = makeSchemaView();
  var HERO_VIEW = [];
  for (heroIndex = 0; heroIndex < HERO_DATA.length; heroIndex++) {
    HERO_VIEW.push({ key: HERO_DATA[heroIndex][0], name: HERO_DATA[heroIndex][1] });
  }
  freezeDeep(HERO_VIEW);
  var EMPTY_EFFECTS = Object.freeze([]);

  function parseRawState(raw) {
    var data = raw;
    if (isStringValue(data)) {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
    if (!data || !isObjectValue(data) || Array.isArray(data)) data = null;
    return data;
  }
  function rawValueIsEmpty(raw) {
    if (raw === null || raw === undefined) return true;
    return (
      isStringValue(raw) &&
      raw.replace(/^\s+|\s+$/g, "") === ""
    );
  }

  function initialState(rawSessionState) {
    var envelope = parseRawState(rawSessionState);
    var wrapped =
      envelope &&
      (Object.prototype.hasOwnProperty.call(envelope, "sessionRaw") ||
        Object.prototype.hasOwnProperty.call(envelope, "publishedRaw") ||
        Object.prototype.hasOwnProperty.call(envelope, "builderPresetRaw"));
    var sessionRaw = wrapped ? envelope.sessionRaw : rawSessionState;
    var builderPresetRaw = wrapped ? envelope.builderPresetRaw : null;
    var data = parseRawState(sessionRaw);
    var published = parseRawState(wrapped ? envelope.publishedRaw : null);
    if (!published || published.version !== 1 || !published.values)
      published = null;
    if (!data || data.version !== 1 || !data.values) data = null;
    var values = normalizeValues(data && data.values);
    var isMenuState = !!(
      data &&
      (data.conditions !== undefined ||
        data.scopes !== undefined ||
        data.userPresets !== undefined ||
        data.selectedPresetId !== undefined ||
        data.nextUserPresetNumber !== undefined ||
        data.bakedPresetNameOverrides !== undefined ||
        data.hiddenBakedPresetIds !== undefined)
    );
    var users = isMenuState ? normalizeUserPresets(data.userPresets) : [];
    var scopes = isMenuState ? normalizeScopes(data.scopes) : [];
    var conditions = isMenuState ? normalizeConditions(data.conditions) : {};
    var hidden = isMenuState
      ? normalizeHiddenBakedPresetIds(data.hiddenBakedPresetIds)
      : [];
    var overrides = isMenuState
      ? normalizeBakedPresetNameOverrides(data.bakedPresetNameOverrides)
      : {};
    var nextNumber = nextUserPresetNumber(
      isMenuState ? data.nextUserPresetNumber : 1,
      users,
    );
    var selectedId = isMenuState ? String(data.selectedPresetId || "") : "";
    var builderApplied = false;
    if (rawValueIsEmpty(sessionRaw) && !isMenuState) {
      var parsedBuilder = parsePresetTransfer(builderPresetRaw);
      if (!parsedBuilder.error) {
        var seededUsers = [];
        var builderSelectedId = String(parsedBuilder.selectedPresetId || "");
        var builderIndex;
        for (builderIndex = 0; builderIndex < parsedBuilder.records.length; builderIndex++) {
          if (parsedBuilder.records[builderIndex].kind === "user")
            seededUsers.push(parsedBuilder.records[builderIndex]);
        }
        users = normalizeUserPresets(seededUsers);
        if (parsedBuilder.hasRepositoryState)
          hidden = parsedBuilder.hiddenBakedPresetIds.slice(0);
        nextNumber = nextUserPresetNumber(1, users);
        selectedId = "";
        for (builderIndex = 0; builderIndex < users.length; builderIndex++) {
          if (users[builderIndex].id === builderSelectedId) {
            selectedId = builderSelectedId;
            break;
          }
        }
        if (selectedId) {
          for (builderIndex = 0; builderIndex < users.length; builderIndex++) {
            if (users[builderIndex].id !== selectedId) continue;
            scopes = normalizeScopes([{
              id: CURRENT_SCOPE_ID,
              mode: users[builderIndex].mode,
              heroes: users[builderIndex].heroes.slice(0),
              values: copyValues(users[builderIndex].values),
              conditions: normalizeConditions(users[builderIndex].conditions),
              sourcePresetId: users[builderIndex].id,
            }]);
            builderApplied = true;
            break;
          }
        }
      }
    }
    var userIds = {};
    var index;
    for (index = 0; index < users.length; index++) userIds[users[index].id] = true;
    if (selectedId !== DEFAULT_PRESET_ID && !userIds[selectedId]) selectedId = "";
    if (hidden.indexOf(selectedId) >= 0) selectedId = "";
    var initialRequiredSlots = [false, false, false, false];
    var initialSourceConditions = {};
    var initialScopeIndex;
    var initialSource = null;
    for (
      initialScopeIndex = 0;
      initialScopeIndex < scopes.length;
      initialScopeIndex++
    ) {
      if (
        (!builderApplied &&
          scopes[initialScopeIndex].id === CURRENT_SCOPE_ID) ||
        scopes[initialScopeIndex].mode === HERO_SCOPE_ALL
      ) {
        initialSource = scopes[initialScopeIndex];
        break;
      }
    }
    if (initialSource) initialSourceConditions = initialSource.conditions || {};
    else initialSourceConditions = conditions;
    var initialConditionKey;
    for (initialConditionKey in initialSourceConditions) {
      if (!Object.prototype.hasOwnProperty.call(initialSourceConditions, initialConditionKey))
        continue;
      var initialSlot = initialSourceConditions[initialConditionKey].slot - 1;
      if (initialSlot >= 0 && initialSlot < 4) initialRequiredSlots[initialSlot] = true;
    }
    var initialEffectiveValues = published
      ? normalizeValues(published.values)
      : initialSource
        ? copyValues(initialSource.values)
        : copyValues(values);
    var revision = 0;
    if (published && Number.isFinite(published.revision))
      revision = Math.max(0, Math.round(published.revision));
    else if (data && Number.isFinite(data.effectiveRevision))
      revision = Math.max(0, Math.round(data.effectiveRevision));
    else if (!isMenuState && data && Number.isFinite(data.revision))
      revision = Math.max(0, Math.round(data.revision));
    return {
      values: values,
      conditions: conditions,
      scopes: scopes,
      userPresets: users,
      selectedPresetId: selectedId || null,
      nextUserPresetNumber: nextNumber,
      bakedPresetNameOverrides: overrides,
      hiddenBakedPresetIds: hidden,
      effectiveValues: initialEffectiveValues,
      effectiveRevision: revision,
      history: [],
      transitionId: 0,
      sessionOpen: true,
      confirmation: null,
      gesture: null,
      restoredEffectivePending:
        (!!published && !builderApplied) || (builderApplied && !initialSource),
      identity: {
        mode: HERO_MODE_AUTO,
        phase: HERO_PHASE_TRANSITIONING,
        status: "unknown",
        manualHeroKey: "",
        detectedHeroKey: "",
        candidateHeroKey: "",
        candidateSamples: 0,
        emptySamples: 0,
        sampledActive: false,
        effectiveHeroKey: "",
        epoch: 0,
      },
      ability: {
        tiers: [-1, -1, -1, -1],
        requiredSlots: initialRequiredSlots,
      },
    };
  }
  function create(rawSessionState) {
    var state = initialState(rawSessionState);
    var viewCache = null;
    var lastView = null;

    function currentScopeRow() {
      var index;
      for (index = 0; index < state.scopes.length; index++) {
        if (state.scopes[index].id === CURRENT_SCOPE_ID) return state.scopes[index];
      }
      return null;
    }

    function editableValues() {
      var current = currentScopeRow();
      return current ? current.values : state.values;
    }

    function findPreset(id) {
      var wanted = String(id || "");
      if (wanted === DEFAULT_PRESET_ID) return BAKED_PRESET;
      var index;
      for (index = 0; index < state.userPresets.length; index++) {
        if (state.userPresets[index].id === wanted) return state.userPresets[index];
      }
      return null;
    }

    function isBakedHidden(id) {
      return state.hiddenBakedPresetIds.indexOf(id) >= 0;
    }

    function displayPresetName(preset) {
      if (
        preset &&
        preset.kind === "baked" &&
        state.bakedPresetNameOverrides[preset.id]
      )
        return state.bakedPresetNameOverrides[preset.id];
      return preset ? preset.name : "";
    }

    function allPresetRecords() {
      var result = [findPreset(DEFAULT_PRESET_ID)];
      var index;
      for (index = 0; index < state.userPresets.length; index++)
        result.push(state.userPresets[index]);
      return result;
    }

    function visiblePresetRecords() {
      var result = [];
      var baked = findPreset(DEFAULT_PRESET_ID);
      var index;
      if (!isBakedHidden(DEFAULT_PRESET_ID)) result.push(baked);
      for (index = 0; index < state.userPresets.length; index++)
        result.push(state.userPresets[index]);
      return result;
    }

    function resolveEffectiveSource() {
      var current = currentScopeRow();
      if (current) return current;
      var heroKey = state.identity.effectiveHeroKey;
      var index;
      for (index = 0; index < state.scopes.length; index++) {
        var selected = state.scopes[index];
        if (selected.mode !== HERO_SCOPE_SELECTED || !heroKey) continue;
        if (selected.heroes.indexOf(heroKey) >= 0) return selected;
      }
      for (index = 0; index < state.scopes.length; index++) {
        if (state.scopes[index].mode === HERO_SCOPE_ALL) return state.scopes[index];
      }
      return {
        values: state.values,
        conditions: state.conditions,
        mode: HERO_SCOPE_OFF,
        heroes: [],
      };
    }

    function computeRequiredSlots() {
      var result = [false, false, false, false];
      var source = resolveEffectiveSource();
      var conditions = source.conditions || {};
      var key;
      for (key in conditions) {
        if (!Object.prototype.hasOwnProperty.call(conditions, key)) continue;
        var slot = conditions[key].slot - 1;
        if (slot >= 0 && slot < 4) result[slot] = true;
      }
      return result;
    }

    function refreshRequiredSlots() {
      var next = computeRequiredSlots();
      var changed = JSON.stringify(next) !== JSON.stringify(state.ability.requiredSlots);
      state.ability.requiredSlots = next;
      return changed;
    }

    function materializeEffective() {
      var source = resolveEffectiveSource();
      var next = copyValues(source.values);
      var conditions = source.conditions || {};
      var index;
      for (index = 0; index < DEFAULT_KEYS.length; index++) {
        var key = DEFAULT_KEYS[index];
        var rule = conditions[key];
        if (!rule) continue;
        var tier = state.ability.tiers[rule.slot - 1];
        if (tier >= rule.minTier) next[key] = rule.value;
      }
      return normalizeValues(next);
    }

    function refreshEffective() {
      if (state.restoredEffectivePending) return false;
      var next = materializeEffective();
      var before = JSON.stringify(state.effectiveValues);
      var after = JSON.stringify(next);
      if (before === after) return false;
      state.effectiveValues = next;
      state.effectiveRevision += 1;
      return true;
    }

    function baseRaw() {
      return JSON.stringify({
        values: state.values,
        conditions: state.conditions,
      });
    }

    function historyRaw() {
      return JSON.stringify({
        values: state.values,
        conditions: state.conditions,
        scopes: state.scopes,
      });
    }

    function editableConditions() {
      var current = currentScopeRow();
      return current ? current.conditions : state.conditions;
    }


    function sessionRaw() {
      return JSON.stringify({
        version: 1,
        values: state.values,
        conditions: state.conditions,
        scopes: state.scopes,
        userPresets: state.userPresets,
        selectedPresetId: state.selectedPresetId,
        nextUserPresetNumber: state.nextUserPresetNumber,
        bakedPresetNameOverrides: state.bakedPresetNameOverrides,
        hiddenBakedPresetIds: state.hiddenBakedPresetIds,
        effectiveRevision: state.effectiveRevision,
      });
    }

    function effectiveRaw() {
      return JSON.stringify({
        version: 1,
        revision: state.effectiveRevision,
        values: state.effectiveValues,
      });
    }

    function identitySignature() {
      var identity = state.identity;
      return JSON.stringify({
        mode: identity.mode,
        phase: identity.phase,
        status: identity.status,
        manualHeroKey: identity.manualHeroKey,
        detectedHeroKey: identity.detectedHeroKey,
        candidateHeroKey: identity.candidateHeroKey,
        candidateSamples: identity.candidateSamples,
        emptySamples: identity.emptySamples,
        sampledActive: identity.sampledActive,
        effectiveHeroKey: identity.effectiveHeroKey,
        epoch: identity.epoch,
      });
    }

    function abilitySignature() {
      return JSON.stringify(state.ability);
    }

    function transactionSignature() {
      return JSON.stringify({
        confirmation: state.confirmation,
        gesture: state.gesture ? { key: state.gesture.key } : null,
        open: state.sessionOpen,
        history: state.history.length,
      });
    }

    function invalidateView() {
      viewCache = null;
    }

    function projectPreset(preset) {
      return clonePreset(preset, displayPresetName(preset));
    }

    function presetMatchesCurrent(preset, current, currentBaseRaw) {
      if (preset.mode === HERO_SCOPE_OFF) {
        return (
          !current &&
          JSON.stringify({
            values: preset.values,
            conditions: normalizeConditions(preset.conditions),
          }) === currentBaseRaw
        );
      }
      if (!current || current.mode !== preset.mode) return false;
      return (
        JSON.stringify(current.heroes) === JSON.stringify(preset.heroes) &&
        JSON.stringify(current.values) === JSON.stringify(preset.values) &&
        JSON.stringify(current.conditions) ===
          JSON.stringify(normalizeConditions(preset.conditions))
      );
    }

    function projectRepository(current) {
      var records = allPresetRecords();
      var rows = [];
      var allRows = [];
      var activeId = null;
      var currentBaseRaw = current ? "" : baseRaw();
      var index;
      for (index = 0; index < records.length; index++) {
        var record = records[index];
        var projected = projectPreset(record);
        allRows.push(projected);
        if (record.kind !== "baked" || !isBakedHidden(record.id))
          rows.push(projected);
        if (
          !activeId &&
          !(
            !current &&
            state.selectedPresetId &&
            state.selectedPresetId !== DEFAULT_PRESET_ID &&
            record.id === DEFAULT_PRESET_ID
          ) &&
          presetMatchesCurrent(record, current, currentBaseRaw)
        )
          activeId = record.id;
      }
      return {
        rows: rows,
        allRows: allRows,
        selectedId: state.selectedPresetId,
        activeId: activeId || (current ? CURRENT_SCOPE_ID : null),
        nextUserNumber: state.nextUserPresetNumber,
        hiddenBakedIds: state.hiddenBakedPresetIds.slice(0),
      };
    }

    function makeView() {
      if (viewCache) return viewCache;
      var scopes = [];
      var index;
      for (index = 0; index < state.scopes.length; index++)
        scopes.push(cloneScope(state.scopes[index]));
      var current = currentScopeRow();
      var repository = projectRepository(current);
      var identity = state.identity;
      var viewIdentity = {
        mode: identity.mode,
        phase: identity.phase,
        status: identity.status,
        manualHeroKey: identity.manualHeroKey,
        effectiveHeroKey: identity.effectiveHeroKey,
        candidateHeroKey: identity.candidateHeroKey,
        epoch: identity.epoch,
      };
      var viewAbility = {
        tiers: state.ability.tiers.slice(0),
        requiredSlots: state.ability.requiredSlots.slice(0),
      };
      var confirmation = null;
      if (state.confirmation) {
        confirmation = {
          kind: state.confirmation.kind,
          token: state.confirmation.token,
        };
        if (state.confirmation.keys)
          confirmation.keys = state.confirmation.keys.slice(0);
        if (state.confirmation.id) confirmation.id = state.confirmation.id;
      }
      var gesture = state.gesture ? { key: state.gesture.key, active: true } : null;
      var candidate = {
        transitionId: state.transitionId,
        schema: SCHEMA_VIEW,
        heroes: HERO_VIEW,
        values: copyValues(state.values),
        conditions: cloneConditions(state.conditions),
        effectiveValues: copyValues(state.effectiveValues),
        effectiveRevision: state.effectiveRevision,
        scopes: scopes,
        currentScope: current ? cloneScope(current) : null,
        identity: viewIdentity,
        ability: viewAbility,
        repository: repository,
        undoAvailable: state.history.length > 0,
        transactions: {
          confirmation: confirmation,
          gesture: gesture,
        },
      };
      if (lastView) {
        if (JSON.stringify(candidate.values) === JSON.stringify(lastView.values))
          candidate.values = lastView.values;
        if (
          JSON.stringify(candidate.conditions) ===
          JSON.stringify(lastView.conditions)
        )
          candidate.conditions = lastView.conditions;
        if (
          JSON.stringify(candidate.effectiveValues) ===
          JSON.stringify(lastView.effectiveValues)
        )
          candidate.effectiveValues = lastView.effectiveValues;
        if (JSON.stringify(candidate.scopes) === JSON.stringify(lastView.scopes))
          candidate.scopes = lastView.scopes;
        if (
          JSON.stringify(candidate.currentScope) ===
          JSON.stringify(lastView.currentScope)
        )
          candidate.currentScope = lastView.currentScope;
        if (
          JSON.stringify(candidate.identity) === JSON.stringify(lastView.identity)
        )
          candidate.identity = lastView.identity;
        if (
          JSON.stringify(candidate.ability) === JSON.stringify(lastView.ability)
        )
          candidate.ability = lastView.ability;
        if (
          JSON.stringify(candidate.repository) ===
          JSON.stringify(lastView.repository)
        )
          candidate.repository = lastView.repository;
        if (
          JSON.stringify(candidate.transactions) ===
          JSON.stringify(lastView.transactions)
        )
          candidate.transactions = lastView.transactions;
      }
      viewCache = freezeDeep(candidate);
      lastView = viewCache;
      return viewCache;
    }

    function result(status, action, code, effects) {
      var outcome = { status: status, action: action };
      if (code) outcome.code = code;
      return {
        outcome: outcome,
        view: makeView(),
        effects: effects || EMPTY_EFFECTS,
      };
    }

    function reject(action, code) {
      return result("rejected", action, code || "INVALID_INTENT", EMPTY_EFFECTS);
    }

    function noop(action, code) {
      return result("noop", action, code, EMPTY_EFFECTS);
    }

    function makeSessionEffect(transitionId, raw) {
      return {
        type: "session_replace",
        transitionId: transitionId,
        raw: raw,
      };
    }

    function makeEffectiveEffect(transitionId, settingId) {
      var raw = effectiveRaw();
      return {
        type: "effective_publish",
        transitionId: transitionId,
        revision: state.effectiveRevision,
        settingId: settingId || "*",
        values: copyValues(state.effectiveValues),
        raw: raw,
      };
    }

    function makeClipboardEffect(transitionId, purpose, text) {
      return {
        type: "clipboard_write",
        transitionId: transitionId,
        purpose: purpose,
        text: text,
      };
    }

    function commit(action, mutate, options) {
      var opts = options || {};
      var forceEffective = opts.forceEffective;
      var beforeSession = sessionRaw();
      var beforeIdentity = identitySignature();
      var beforeAbility = abilitySignature();
      var beforeTransactions = transactionSignature();
      var beforeRevision = state.effectiveRevision;
      var extraEffects = [];
      var mutationResult = mutate() !== false;
      if (typeof forceEffective === "function")
        forceEffective = forceEffective();
      refreshRequiredSlots();
      var effectiveChanged = refreshEffective();
      if (forceEffective && !effectiveChanged) {
        state.effectiveRevision += 1;
        effectiveChanged = true;
      }
      var afterSession = sessionRaw();
      var afterIdentity = identitySignature();
      var afterAbility = abilitySignature();
      var afterTransactions = transactionSignature();
      var stateChanged =
        mutationResult ||
        beforeSession !== afterSession ||
        beforeIdentity !== afterIdentity ||
        beforeAbility !== afterAbility ||
        beforeTransactions !== afterTransactions ||
        beforeRevision !== state.effectiveRevision;
      if (opts.clipboard) {
        extraEffects.push(opts.clipboard);
        stateChanged = true;
      }
      if (opts.forceSession || forceEffective) stateChanged = true;
      if (!stateChanged) return noop(action, opts.noopCode || "NO_CHANGE");
      state.transitionId += 1;
      invalidateView();
      var effects = [];
      if (opts.forceSession || beforeSession !== afterSession)
        effects.push(makeSessionEffect(state.transitionId, afterSession));
      if (effectiveChanged)
        effects.push(makeEffectiveEffect(state.transitionId, opts.settingId || "*"));
      var extraIndex;
      for (extraIndex = 0; extraIndex < extraEffects.length; extraIndex++) {
        var extra = extraEffects[extraIndex];
        effects.push(
          makeClipboardEffect(state.transitionId, extra.purpose, extra.text),
        );
      }
      freezeDeep(effects);
      var output = result("committed", action, opts.code, effects);
      output.outcome.transitionId = state.transitionId;
      return output;
    }

    function pushHistory(raw) {
      if (!raw) return;
      if (state.history.length && state.history[state.history.length - 1] === raw)
        return;
      state.history.push(raw);
      if (state.history.length > HISTORY_LIMIT) state.history.shift();
    }


    function replaceBase(nextValues, nextConditions, recordHistory) {
      var normalizedValues = normalizeValues(nextValues);
      var normalizedConditions = normalizeConditions(nextConditions);
      var nextRaw = JSON.stringify({
        values: normalizedValues,
        conditions: normalizedConditions,
      });
      if (nextRaw === baseRaw()) return false;
      if (recordHistory !== false) pushHistory(baseRaw());
      state.values = normalizedValues;
      state.conditions = normalizedConditions;
      state.restoredEffectivePending = false;
      return true;
    }

    function replaceEditor(nextValues, nextConditions, recordHistory) {
      var normalizedValues = normalizeValues(nextValues);
      var normalizedConditions = normalizeConditions(nextConditions);
      var current = currentScopeRow();
      var currentValues = current ? current.values : state.values;
      var currentConditions = current ? current.conditions : state.conditions;
      if (
        JSON.stringify(normalizedValues) === JSON.stringify(currentValues) &&
        JSON.stringify(normalizedConditions) === JSON.stringify(currentConditions)
      )
        return false;
      if (recordHistory !== false)
        pushHistory(current ? historyRaw() : baseRaw());
      if (current) {
        current.values = normalizedValues;
        current.conditions = normalizedConditions;
      } else {
        state.values = normalizedValues;
        state.conditions = normalizedConditions;
      }
      state.restoredEffectivePending = false;
      return true;
    }


    function removeCurrentScope() {
      var resultRows = [];
      var index;
      for (index = 0; index < state.scopes.length; index++) {
        if (state.scopes[index].id !== CURRENT_SCOPE_ID)
          resultRows.push(state.scopes[index]);
      }
      return resultRows;
    }

    function applyPresetInternal(preset, recordHistory) {
      if (!preset) return false;
      var before = sessionRaw();
      var beforeHistory = recordHistory ? historyRaw() : "";
      var rows = removeCurrentScope();
      state.restoredEffectivePending = false;
      if (preset.mode === HERO_SCOPE_OFF) {
        replaceBase(preset.values, preset.conditions, false);
      } else {
        rows.unshift({
          id: CURRENT_SCOPE_ID,
          mode: preset.mode,
          heroes: preset.heroes.slice(0),
          values: copyValues(preset.values),
          conditions: normalizeConditions(preset.conditions),
          sourcePresetId: preset.kind === "user" ? preset.id : "",
        });
      }
      state.scopes = normalizeScopes(rows);
      var changed = before !== sessionRaw();
      if (changed && recordHistory) pushHistory(beforeHistory);
      return changed;
    }

    function updateIdentityEffective() {
      var identity = state.identity;
      var previous = identity.effectiveHeroKey;
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
          ? "settled"
          : identity.candidateHeroKey
            ? "settling"
            : "unknown";
      }
      return previous !== identity.effectiveHeroKey;
    }

    function clearAutoIdentity() {
      var identity = state.identity;
      identity.detectedHeroKey = "";
      identity.candidateHeroKey = "";
      identity.candidateSamples = 0;
      identity.emptySamples = 0;
      identity.sampledActive = false;
    }

    function normalizeRetailName(value) {
      return String(value || "")
        .replace(/^\s+|\s+$/g, "")
        .replace(/\s+/g, " ")
        .toUpperCase();
    }

    function applyAutomaticRoute() {
      var heroKey = state.identity.effectiveHeroKey;
      if (!heroKey) return false;
      var current = currentScopeRow();
      var allFallback = null;
      var index;
      for (index = 0; index < state.userPresets.length; index++) {
        var preset = state.userPresets[index];
        if (
          preset.mode === HERO_SCOPE_SELECTED &&
          preset.heroes.indexOf(heroKey) >= 0
        ) {
          if (current && current.sourcePresetId === preset.id) return false;
          return applyPresetInternal(preset);
        }
        if (!allFallback && preset.mode === HERO_SCOPE_ALL) allFallback = preset;
      }
      if (
        current &&
        current.mode === HERO_SCOPE_SELECTED &&
        current.heroes.indexOf(heroKey) >= 0
      )
        return false;
      if (
        allFallback &&
        (!current || current.sourcePresetId !== allFallback.id)
      )
        return applyPresetInternal(allFallback);
      if (current && current.mode === HERO_SCOPE_SELECTED) {
        var baked = findPreset(DEFAULT_PRESET_ID);
        if (!presetMatchesCurrent(baked)) return applyPresetInternal(baked);
        return false;
      }
      return false;
    }

    function validateSettingIntent(key, value) {
      return validateSettingValue(key, value);
    }

    function validateConditionValue(key, value) {
      if (!validateSettingIntent(key, value)) return false;
      if (!BOOLEAN_KEYS[key] && !COLOR_KEYS[key] && !ENUM_OPTIONS[key])
        return (
          Number.isFinite(value) &&
          normalizeValue(key, value, DEFAULTS) === value
        );
      return true;
    }

    function validConditionKey(key) {
      return (
        Object.prototype.hasOwnProperty.call(DEFAULTS, key) &&
        SETTING_META[key].conditionEligible
      );
    }

    function validateConditionIntent(intent) {
      var key = String(intent.key || "");
      var slot = intent.slot;
      var minTier = intent.minTier;
      return (
        validConditionKey(key) &&
        Number.isFinite(slot) &&
        Math.floor(slot) === slot &&
        slot >= 1 &&
        slot <= 4 &&
        Number.isFinite(minTier) &&
        Math.floor(minTier) === minTier &&
        minTier >= 1 &&
        minTier <= 3 &&
        validateConditionValue(key, intent.value)
      );
    }

    function validateScopeIntent(intent) {
      if (
        intent.mode !== HERO_SCOPE_OFF &&
        intent.mode !== HERO_SCOPE_ALL &&
        intent.mode !== HERO_SCOPE_SELECTED
      )
        return false;
      if (intent.heroes !== undefined && !Array.isArray(intent.heroes)) return false;
      var rawHeroes = intent.heroes || [];
      var heroIndexValue;
      for (heroIndexValue = 0; heroIndexValue < rawHeroes.length; heroIndexValue++) {
        if (
          !Object.prototype.hasOwnProperty.call(
            HERO_BY_KEY,
            String(rawHeroes[heroIndexValue] || ""),
          )
        )
          return false;
      }
      var heroes = normalizeHeroSelection(rawHeroes);
      if (intent.mode === HERO_SCOPE_SELECTED && !heroes.length) return true;
      if (intent.mode === HERO_SCOPE_OFF && heroes.length) return false;
      if (intent.mode === HERO_SCOPE_ALL && heroes.length) return false;
      return true;
    }

    function requestConfirmation(kind, data) {
      state.confirmationSerial += 1;
      var token = kind + "_" + String(state.confirmationSerial);
      state.confirmation = {
        kind: kind,
        token: token,
      };
      if (data.keys) state.confirmation.keys = data.keys.slice(0);
      if (data.id) state.confirmation.id = data.id;
      return token;
    }

    function validConfirmation(kind, token) {
      return (
        state.confirmation &&
        state.confirmation.kind === kind &&
        state.confirmation.token === token
      );
    }

    function selectedVisibleIndex(id) {
      var rows = visiblePresetRecords();
      var index;
      for (index = 0; index < rows.length; index++) {
        if (rows[index].id === id) return index;
      }
      return -1;
    }

    function repairSelection(index) {
      var rows = visiblePresetRecords();
      if (!rows.length) {
        state.selectedPresetId = null;
        return;
      }
      var nextIndex = Math.max(0, Math.min(index, rows.length - 1));
      state.selectedPresetId = rows[nextIndex].id;
    }

    function handleSessionOpen(intent) {
      return commit("session_open", function () {
        var changed =
          !state.sessionOpen ||
          state.history.length > 0 ||
          !!state.confirmation ||
          !!state.gesture;
        state.sessionOpen = true;
        state.confirmation = null;
        state.gesture = null;
        state.history = [];
        return changed;
      }, {
        forceSession: true,
        forceEffective:
          !!(intent && intent.publish) && !state.restoredEffectivePending,
      });
    }

    function handleEditorClose() {
      return commit("editor_close", function () {
        var changed =
          state.history.length > 0 ||
          !!state.confirmation ||
          !!state.gesture;
        state.history = [];
        state.confirmation = null;
        state.gesture = null;
        return !!changed;
      });
    }

    function handleSessionClose() {
      return commit("session_close", function () {
        var identity = state.identity;
        var changed =
          state.sessionOpen ||
          state.history.length > 0 ||
          !!state.confirmation ||
          !!state.gesture ||
          !!identity.effectiveHeroKey ||
          !!identity.manualHeroKey ||
          identity.mode !== HERO_MODE_AUTO ||
          identity.phase !== HERO_PHASE_TRANSITIONING;
        state.sessionOpen = false;
        state.history = [];
        state.confirmation = null;
        state.gesture = null;
        identity.mode = HERO_MODE_AUTO;
        identity.phase = HERO_PHASE_TRANSITIONING;
        identity.status = "unknown";
        identity.manualHeroKey = "";
        identity.effectiveHeroKey = "";
        identity.epoch += 1;
        clearAutoIdentity();
        state.ability.tiers = [-1, -1, -1, -1];
        return !!changed;
      });
    }

    function handleSettingEdit(intent) {
      var key = String(intent.key || "");
      if (!validateSettingIntent(key, intent.value)) return reject("setting_edit", "INVALID_SETTING");
      if (state.gesture) return reject("setting_edit", "GESTURE_ACTIVE");
      var values = editableValues();
      var next = normalizeValue(key, intent.value, values);
      if (values[key] === next) return noop("setting_edit", "NO_CHANGE");
      return commit("setting_edit", function () {
        var changedValues = copyValues(editableValues());
        changedValues[key] = next;
        return replaceEditor(
          changedValues,
          editableConditions(),
          true,
        );
      }, { settingId: key });
    }

    function handleGestureBegin(intent) {
      var key = String(intent.key || "");
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key))
        return reject("gesture_begin", "INVALID_SETTING");
      if (state.gesture) return reject("gesture_begin", "GESTURE_ACTIVE");
      var hasValue = intent.value !== undefined;
      var next = null;
      if (hasValue) {
        if (!validateSettingIntent(key, intent.value))
          return reject("gesture_begin", "INVALID_SETTING");
        next = normalizeValue(key, intent.value, editableValues());
      }
      return commit("gesture_begin", function () {
        var before = currentScopeRow() ? historyRaw() : baseRaw();
        var changed = false;
        var values = editableValues();
        if (hasValue && values[key] !== next) {
          var changedValues = copyValues(values);
          changedValues[key] = next;
          changed = replaceEditor(
            changedValues,
            editableConditions(),
            false,
          );
        }
        state.gesture = {
          key: key,
          before: before,
          changed: changed,
        };
        return true;
      }, { settingId: hasValue ? key : "*" });
    }

    function handleGestureUpdate(intent) {
      var key = String(intent.key || "");
      if (!state.gesture || state.gesture.key !== key) return reject("gesture_update", "GESTURE_NOT_ACTIVE");
      if (!validateSettingIntent(key, intent.value)) return reject("gesture_update", "INVALID_SETTING");
      var values = editableValues();
      var next = normalizeValue(key, intent.value, values);
      if (values[key] === next) return noop("gesture_update", "NO_CHANGE");
      return commit("gesture_update", function () {
        var changedValues = copyValues(editableValues());
        changedValues[key] = next;
        replaceEditor(changedValues, editableConditions(), false);
        state.gesture.changed = true;
        return true;
      }, { settingId: key });
    }

    function handleGestureEnd(intent) {
      var key = String(intent.key || "");
      if (!state.gesture || state.gesture.key !== key) return reject("gesture_end", "GESTURE_NOT_ACTIVE");
      if (!validateSettingIntent(key, intent.value)) return reject("gesture_end", "INVALID_SETTING");
      var gesture = state.gesture;
      var next = normalizeValue(key, intent.value, editableValues());
      return commit("gesture_end", function () {
        var values = editableValues();
        if (values[key] !== next) {
          var changedValues = copyValues(values);
          changedValues[key] = next;
          replaceEditor(changedValues, editableConditions(), false);
          gesture.changed = true;
        }
        var after = currentScopeRow() ? historyRaw() : baseRaw();
        if (after !== gesture.before) pushHistory(gesture.before);
        state.gesture = null;
        return true;
      }, { settingId: key, code: "GESTURE_COMMITTED" });
    }

    function handleGestureCancel(intent) {
      var key = String(intent.key || "");
      if (!state.gesture || state.gesture.key !== key)
        return reject("gesture_cancel", "GESTURE_NOT_ACTIVE");
      var previous;
      try {
        previous = JSON.parse(state.gesture.before);
      } catch {
        previous = null;
      }
      return commit("gesture_cancel", function () {
        if (previous) {
          state.values = normalizeValues(previous.values);
          state.conditions = normalizeConditions(previous.conditions);
          if (Array.isArray(previous.scopes))
            state.scopes = normalizeScopes(previous.scopes);
          state.restoredEffectivePending = false;
        }
        state.gesture = null;
        return true;
      }, { code: "GESTURE_CANCELED" });
    }

    function handleUndo() {
      if (!state.history.length) return noop("undo", "NOTHING_TO_UNDO");
      var raw = state.history[state.history.length - 1];
      var previous;
      try {
        previous = JSON.parse(raw);
      } catch {
        return reject("undo", "INVALID_HISTORY");
      }
      return commit("undo", function () {
        state.history.pop();
        if (Array.isArray(previous.scopes)) {
          state.values = normalizeValues(previous.values);
          state.conditions = normalizeConditions(previous.conditions);
          state.scopes = normalizeScopes(previous.scopes);
          state.restoredEffectivePending = false;
        } else {
          replaceBase(previous.values, previous.conditions, false);
        }
        return true;
      }, { settingId: "*" });
    }

    function handleResetRequest(intent) {
      if (!Array.isArray(intent.keys) || !intent.keys.length)
        return reject("reset_request", "INVALID_RESET_KEYS");
      var keys = [];
      var seen = {};
      var index;
      for (index = 0; index < intent.keys.length; index++) {
        var key = String(intent.keys[index] || "");
        if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key) || seen[key])
          return reject("reset_request", "INVALID_RESET_KEYS");
        seen[key] = true;
        keys.push(key);
      }
      var values = editableValues();
      var conditions = editableConditions();
      var changed = false;
      for (index = 0; index < keys.length; index++) {
        if (
          values[keys[index]] !== DEFAULTS[keys[index]] ||
          Object.prototype.hasOwnProperty.call(conditions, keys[index])
        ) {
          changed = true;
          break;
        }
      }
      if (!changed) return noop("reset_request", "ALREADY_DEFAULT");
      return commit("reset_request", function () {
        requestConfirmation("reset", { keys: keys });
        return true;
      }, { code: "CONFIRMATION_REQUIRED" });
    }

    function handleResetConfirm(intent) {
      var token = String(intent.token || "");
      if (!validConfirmation("reset", token)) return reject("reset_confirm", "INVALID_CONFIRMATION");
      var keys = state.confirmation.keys.slice(0);
      return commit("reset_confirm", function () {
        var values = copyValues(editableValues());
        var conditions = normalizeConditions(editableConditions());
        var index;
        for (index = 0; index < keys.length; index++) {
          values[keys[index]] = DEFAULTS[keys[index]];
          delete conditions[keys[index]];
        }
        state.confirmation = null;
        replaceEditor(values, conditions, true);
        return true;
      }, { settingId: "*" });
    }

    function handleResetCancel(intent) {
      var token = String(intent.token || "");
      if (!validConfirmation("reset", token)) return reject("reset_cancel", "INVALID_CONFIRMATION");
      return commit("reset_cancel", function () {
        state.confirmation = null;
        return true;
      }, { code: "CONFIRMATION_CANCELED" });
    }

    function handleHeroMode(intent) {
      if (
        intent.mode !== HERO_MODE_AUTO &&
        intent.mode !== HERO_MODE_MANUAL &&
        intent.mode !== HERO_MODE_OFF
      )
        return reject("hero_mode", "INVALID_HERO_MODE");
      if (state.identity.mode === intent.mode) return noop("hero_mode", "NO_CHANGE");
      return commit("hero_mode", function () {
        state.identity.mode = intent.mode;
        clearAutoIdentity();
        var changed = updateIdentityEffective();
        if (changed) state.ability.tiers = [-1, -1, -1, -1];
        applyAutomaticRoute();
        return true;
      });
    }

    function handleHeroManual(intent) {
      var heroKey = String(intent.heroKey || "");
      if (!Object.prototype.hasOwnProperty.call(HERO_BY_KEY, heroKey))
        return reject("hero_manual", "INVALID_HERO");
      if (state.identity.manualHeroKey === heroKey) return noop("hero_manual", "NO_CHANGE");
      return commit("hero_manual", function () {
        state.identity.manualHeroKey = heroKey;
        var changed = updateIdentityEffective();
        if (changed) state.ability.tiers = [-1, -1, -1, -1];
        if (changed) applyAutomaticRoute();
        return true;
      });
    }

    function handleLifecycleObserve(intent) {
      var epoch = intent.epoch;
      if (
        !Number.isFinite(epoch) ||
        Math.floor(epoch) !== epoch ||
        epoch < 0
      )
        return reject("lifecycle_observe", "INVALID_EPOCH");
      if (
        intent.phase !== HERO_PHASE_TRANSITIONING &&
        intent.phase !== HERO_PHASE_LOBBY &&
        intent.phase !== HERO_PHASE_ACTIVE &&
        intent.phase !== HERO_PHASE_POST_MATCH
      )
        return reject("lifecycle_observe", "INVALID_PHASE");
      if (epoch < state.identity.epoch) return reject("lifecycle_observe", "STALE_EPOCH");
      if (epoch === state.identity.epoch && intent.phase === state.identity.phase)
        return noop("lifecycle_observe", "NO_CHANGE");
      return commit("lifecycle_observe", function () {
        var epochChanged = epoch !== state.identity.epoch;
        var phaseChanged = intent.phase !== state.identity.phase;
        state.identity.epoch = epoch;
        state.identity.phase = intent.phase;
        if (epochChanged || phaseChanged) {
          clearAutoIdentity();
          state.ability.tiers = [-1, -1, -1, -1];
          state.confirmation = null;
        }
        var heroChanged = updateIdentityEffective();
        if (heroChanged) applyAutomaticRoute();
        return true;
      });
    }

    function handleHeroObserve(intent) {
      var epoch = intent.epoch;
      if (
        !Number.isFinite(epoch) ||
        Math.floor(epoch) !== epoch ||
        epoch < 0
      )
        return reject("hero_observe", "INVALID_EPOCH");
      if (epoch !== state.identity.epoch) return reject("hero_observe", "STALE_EPOCH");
      if (state.identity.mode !== HERO_MODE_AUTO || state.identity.phase !== HERO_PHASE_ACTIVE)
        return noop("hero_observe", "IDENTITY_INACTIVE");
      var nextHeroKey = HERO_BY_RETAIL_NAME[normalizeRetailName(intent.heroName)] || "";
      if (
        nextHeroKey &&
        nextHeroKey === state.identity.detectedHeroKey &&
        !state.restoredEffectivePending
      )
        return noop("hero_observe", "NO_CHANGE");
      var releasedRestoredEffective = false;
      return commit("hero_observe", function () {
        var identity = state.identity;
        var restoredEffectivePending = state.restoredEffectivePending;
        if (!nextHeroKey) {
          identity.emptySamples = Math.min(2, identity.emptySamples + 1);
          identity.candidateHeroKey = "";
          identity.candidateSamples = 0;
          identity.sampledActive = identity.emptySamples >= 2;
          if (identity.sampledActive) identity.detectedHeroKey = "";
        } else {
          identity.emptySamples = 0;
          identity.sampledActive = true;
          if (nextHeroKey === identity.detectedHeroKey) {
            identity.candidateHeroKey = "";
            identity.candidateSamples = 0;
          } else if (nextHeroKey !== identity.candidateHeroKey) {
            identity.candidateHeroKey = nextHeroKey;
            identity.candidateSamples = 1;
          } else {
            identity.candidateSamples += 1;
            if (identity.candidateSamples >= 2) {
              identity.detectedHeroKey = identity.candidateHeroKey;
              identity.candidateHeroKey = "";
              identity.candidateSamples = 0;
            }
          }
        }
        if (
          identity.effectiveHeroKey ||
          (identity.sampledActive && !identity.candidateHeroKey)
        )
          state.restoredEffectivePending = false;
        releasedRestoredEffective =
          restoredEffectivePending && !state.restoredEffectivePending;
        var changed = updateIdentityEffective();
        if (changed) state.ability.tiers = [-1, -1, -1, -1];
        if (changed) applyAutomaticRoute();
        return restoredEffectivePending !== state.restoredEffectivePending;
      }, {
        forceEffective: function () {
          return releasedRestoredEffective;
        },
      });
    }

    function handleAbilityObserve(intent) {
      var epoch = intent.epoch;
      if (
        !Number.isFinite(epoch) ||
        Math.floor(epoch) !== epoch ||
        epoch < 0
      )
        return reject("ability_observe", "INVALID_EPOCH");
      if (epoch !== state.identity.epoch) return reject("ability_observe", "STALE_EPOCH");
      if (!Array.isArray(intent.tiers) || intent.tiers.length !== 4)
        return reject("ability_observe", "INVALID_TIERS");
      var required = computeRequiredSlots();
      var next = [-1, -1, -1, -1];
      var index;
      for (index = 0; index < 4; index++) {
        var tier = intent.tiers[index];
        if (
          !Number.isFinite(tier) ||
          Math.floor(tier) !== tier ||
          tier < -1 ||
          tier > 3
        )
          return reject("ability_observe", "INVALID_TIERS");
        next[index] = tier;
      }
      if (JSON.stringify(next) === JSON.stringify(state.ability.tiers))
        return noop("ability_observe", "NO_CHANGE");
      return commit("ability_observe", function () {
        state.ability.requiredSlots = required;
        state.ability.tiers = next;
        return true;
      });
    }

    function handleScopeSet(intent) {
      if (!validateScopeIntent(intent)) return reject("scope_set", "INVALID_SCOPE");
      var heroes = normalizeHeroSelection(intent.heroes || []);
      var mode =
        intent.mode === HERO_SCOPE_SELECTED && !heroes.length
          ? HERO_SCOPE_ALL
          : normalizeScopeMode(intent.mode, heroes);
      var current = currentScopeRow();
      if (mode === HERO_SCOPE_OFF && !current) return noop("scope_set", "NO_CHANGE");
      if (
        current &&
        current.mode === mode &&
        JSON.stringify(current.heroes) === JSON.stringify(mode === HERO_SCOPE_SELECTED ? heroes : [])
      )
        return noop("scope_set", "NO_CHANGE");
      return commit("scope_set", function () {
        var rows = removeCurrentScope();
        if (mode !== HERO_SCOPE_OFF) {
          rows.unshift({
            id: CURRENT_SCOPE_ID,
            mode: mode,
            heroes: mode === HERO_SCOPE_SELECTED ? heroes : [],
            values: current ? copyValues(current.values) : copyValues(state.values),
            conditions: current ? cloneConditions(current.conditions) : cloneConditions(state.conditions),
          });
        }
        state.scopes = normalizeScopes(rows);
        return true;
      });
    }

    function handleConditionSet(intent) {
      if (!validateConditionIntent(intent)) return reject("condition_set", "INVALID_CONDITION");
      var key = String(intent.key);
      var conditions = editableConditions();
      var nextRule = {
        slot: intent.slot,
        minTier: intent.minTier,
        value: normalizeValue(key, intent.value, DEFAULTS),
      };
      var current = conditions[key];
      var slotWasRequired = false;
      var conditionKey;
      for (conditionKey in conditions) {
        if (!Object.prototype.hasOwnProperty.call(conditions, conditionKey))
          continue;
        if (conditions[conditionKey].slot === nextRule.slot) {
          slotWasRequired = true;
          break;
        }
      }
      if (current && JSON.stringify(current) === JSON.stringify(nextRule))
        return noop("condition_set", "NO_CHANGE");
      return commit("condition_set", function () {
        var nextConditions = normalizeConditions(editableConditions());
        nextConditions[key] = nextRule;
        replaceEditor(editableValues(), nextConditions, true);
        if (!slotWasRequired) state.ability.tiers[nextRule.slot - 1] = -1;
        return true;
      }, { settingId: "*" });
    }

    function handleConditionRemove(intent) {
      var key = String(intent.key || "");
      if (!validConditionKey(key)) return reject("condition_remove", "INVALID_CONDITION");
      if (!Object.prototype.hasOwnProperty.call(editableConditions(), key))
        return noop("condition_remove", "NO_CHANGE");
      return commit("condition_remove", function () {
        var conditions = normalizeConditions(editableConditions());
        delete conditions[key];
        replaceEditor(editableValues(), conditions, true);
        return true;
      }, { settingId: "*" });
    }

    function handlePresetSelect(intent) {
      var id = String(intent.id || "");
      if (!id) {
        if (!state.selectedPresetId)
          return noop("preset_select", "NO_CHANGE");
        return commit("preset_select", function () {
          state.selectedPresetId = null;
          state.confirmation = null;
          return true;
        });
      }
      var preset = findPreset(id);
      if (!preset || (preset.kind === "baked" && isBakedHidden(id)))
        return reject("preset_select", "PRESET_NOT_FOUND");
      if (state.selectedPresetId === id) return noop("preset_select", "NO_CHANGE");
      return commit("preset_select", function () {
        state.selectedPresetId = id;
        state.confirmation = null;
        return true;
      });
    }

    function handlePresetSave(intent) {
      var name = String(intent.name || "").replace(/^\s+|\s+$/g, "");
      if (!name || name.length > 48) return reject("preset_save", "INVALID_PRESET_NAME");
      var current = currentScopeRow();
      var mode = current && current.mode === HERO_SCOPE_SELECTED
        ? HERO_SCOPE_SELECTED
        : HERO_SCOPE_ALL;
      var selected = findPreset(state.selectedPresetId);
      var updating = selected && selected.kind === "user";
      var id = updating ? selected.id : formatUserPresetId(state.nextUserPresetNumber);
      var preset = normalizePresetRecord({
        id: id,
        name: name,
        values: editableValues(),
        conditions: editableConditions(),
        mode: mode,
        heroes: current ? current.heroes : [],
      }, "user");
      if (!preset) return reject("preset_save", "INVALID_PRESET");
      return commit("preset_save", function () {
        var index;
        if (updating) {
          for (index = 0; index < state.userPresets.length; index++) {
            if (state.userPresets[index].id === preset.id) {
              state.userPresets[index] = preset;
              break;
            }
          }
        } else {
          state.userPresets.push(preset);
          state.nextUserPresetNumber += 1;
          if (preset.mode === HERO_SCOPE_ALL)
            state.hiddenBakedPresetIds = normalizeHiddenBakedPresetIds(
              state.hiddenBakedPresetIds.concat([DEFAULT_PRESET_ID]),
            );
        }
        state.selectedPresetId = preset.id;
        return true;
      }, { code: updating ? "PRESET_UPDATED" : "PRESET_SAVED" });
    }

    function handlePresetApply(intent) {
      var id = String(intent.id || "");
      var preset = findPreset(id);
      if (!preset || (preset.kind === "baked" && isBakedHidden(id)))
        return reject("preset_apply", "PRESET_NOT_FOUND");
      var current = currentScopeRow();
      if (
        presetMatchesCurrent(preset, current, current ? "" : baseRaw()) &&
        (preset.kind !== "user" ||
          (current && current.sourcePresetId === preset.id))
      )
        return noop("preset_apply", "NO_CHANGE");
      return commit("preset_apply", function () {
        return applyPresetInternal(preset, true);
      }, { settingId: "*", code: "PRESET_APPLIED" });
    }


    function handlePresetRename(intent) {
      var id = String(intent.id || "");
      var name = String(intent.name || "").replace(/^\s+|\s+$/g, "");
      if (!name || name.length > 48) return reject("preset_rename", "INVALID_PRESET_NAME");
      var preset = findPreset(id);
      if (!preset || (preset.kind === "baked" && isBakedHidden(id)))
        return reject("preset_rename", "PRESET_NOT_FOUND");
      if (displayPresetName(preset) === name) return noop("preset_rename", "NO_CHANGE");
      return commit("preset_rename", function () {
        if (preset.kind === "baked") {
          if (name === "Rewrite Default") delete state.bakedPresetNameOverrides[id];
          else state.bakedPresetNameOverrides[id] = name;
        } else {
          preset.name = name;
        }
        return true;
      }, { code: "PRESET_RENAMED" });
    }

    function handlePresetMove(intent) {
      var id = String(intent.id || "");
      var delta = intent.delta;
      if (!Number.isFinite(delta) || Math.floor(delta) !== delta || (delta !== -1 && delta !== 1))
        return reject("preset_move", "INVALID_MOVE");
      var index = -1;
      var i;
      for (i = 0; i < state.userPresets.length; i++) {
        if (state.userPresets[i].id === id) {
          index = i;
          break;
        }
      }
      if (index < 0) return reject("preset_move", "PRESET_NOT_FOUND");
      var target = index + delta;
      if (target < 0 || target >= state.userPresets.length)
        return noop("preset_move", "MOVE_BOUNDARY");
      return commit("preset_move", function () {
        var moved = state.userPresets[index];
        state.userPresets[index] = state.userPresets[target];
        state.userPresets[target] = moved;
        return true;
      }, { code: "PRESET_MOVED" });
    }

    function handlePresetRemoveRequest(intent) {
      var id = String(intent.id || "");
      var preset = findPreset(id);
      if (!preset || (preset.kind === "baked" && isBakedHidden(id)))
        return reject("preset_remove_request", "PRESET_NOT_FOUND");
      return commit("preset_remove_request", function () {
        state.selectedPresetId = id;
        requestConfirmation("preset_remove", { id: id });
        return true;
      }, { code: "CONFIRMATION_REQUIRED" });
    }

    function handlePresetRemoveConfirm(intent) {
      var token = String(intent.token || "");
      if (!validConfirmation("preset_remove", token))
        return reject("preset_remove_confirm", "INVALID_CONFIRMATION");
      var id = state.confirmation.id;
      var preset = findPreset(id);
      if (!preset) {
        return reject("preset_remove_confirm", "PRESET_NOT_FOUND");
      }
      var visibleIndex = selectedVisibleIndex(id);
      return commit("preset_remove_confirm", function () {
        if (preset.kind === "baked") {
          state.hiddenBakedPresetIds = normalizeHiddenBakedPresetIds(
            state.hiddenBakedPresetIds.concat([id]),
          );
        } else {
          var users = [];
          var index;
          for (index = 0; index < state.userPresets.length; index++) {
            if (state.userPresets[index].id !== id) users.push(state.userPresets[index]);
          }
          state.userPresets = users;
        }
        state.confirmation = null;
        if (preset.kind === "user" && !state.userPresets.length)
          state.selectedPresetId = null;
        else repairSelection(visibleIndex);
        return true;
      }, { code: "PRESET_REMOVED" });
    }

    function handlePresetRemoveCancel(intent) {
      var token = String(intent.token || "");
      if (!validConfirmation("preset_remove", token))
        return reject("preset_remove_cancel", "INVALID_CONFIRMATION");
      return commit("preset_remove_cancel", function () {
        state.confirmation = null;
        return true;
      }, { code: "CONFIRMATION_CANCELED" });
    }

    function handlePresetRestoreBaked() {
      if (!state.hiddenBakedPresetIds.length)
        return noop("preset_restore_baked", "NO_CHANGE");
      return commit("preset_restore_baked", function () {
        state.hiddenBakedPresetIds = [];
        return true;
      }, { code: "BAKED_RESTORED" });
    }
    function handleSettingsCopy() {
      var payload = {
        v: canonicalRecordValues(editableValues()),
        c: filterConditions(editableConditions(), false),
      };
      var text = "HPCR2" + JSON.stringify(payload);
      return commit("settings_copy", function () { return false; }, {
        clipboard: { purpose: "settings", text: text },
      });
    }

    function handleSettingsImport(intent) {
      var parsed = parseSettingsImport(intent.raw);
      if (parsed.error) return reject("settings_import", parsed.error);
      return commit("settings_import", function () {
        var currentValues = editableValues();
        var importedValues = copyValues(parsed.values);
        var currentConditions = editableConditions();
        var importedConditions = parsed.hasConditions ? parsed.conditions : {};
        var extensionIndex;
        for (
          extensionIndex = 0;
          extensionIndex < EXTENSION_KEYS.length;
          extensionIndex++
        ) {
          var extensionKey = EXTENSION_KEYS[extensionIndex];
          importedValues[extensionKey] = currentValues[extensionKey];
          if (Object.prototype.hasOwnProperty.call(currentConditions, extensionKey))
            importedConditions[extensionKey] = currentConditions[extensionKey];
        }
        return replaceEditor(importedValues, importedConditions, true);
      }, { settingId: "*" });
    }

    function handlePresetCopySelected() {
      var preset = findPreset(state.selectedPresetId);
      if (!preset || (preset.kind === "baked" && isBakedHidden(preset.id)))
        return reject("preset_copy_selected", "PRESET_NOT_FOUND");
      var payload = {
        records: [serializePresetRecord(preset, displayPresetName(preset))],
        selectedPresetId: preset.id,
      };
      var text = "HPCRP1" + JSON.stringify(payload);
      return commit("preset_copy_selected", function () { return false; }, {
        clipboard: { purpose: "preset", text: text },
      });
    }

    function handlePresetCopyAll() {
      var records = allPresetRecords();
      var payload = { records: [], hiddenBakedPresetIds: state.hiddenBakedPresetIds.slice(0), selectedPresetId: state.selectedPresetId };
      var index;
      for (index = 0; index < records.length; index++)
        payload.records.push(serializePresetRecord(records[index], displayPresetName(records[index])));
      var text = "HPCRP1" + JSON.stringify(payload);
      return commit("preset_copy_all", function () { return false; }, {
        clipboard: { purpose: "preset_all", text: text },
      });
    }

    function handlePresetImport(intent) {
      var parsed = parsePresetTransfer(intent.raw);
      if (parsed.error) return reject("preset_import", parsed.error);
      var importedUsers = [];
      var importedIds = {};
      var nextNumber = state.nextUserPresetNumber;
      var nextOverrides = copyObject(state.bakedPresetNameOverrides);
      var nextHidden = parsed.hasRepositoryState
        ? parsed.hiddenBakedPresetIds.slice(0)
        : state.hiddenBakedPresetIds.slice(0);
      var index;
      for (index = 0; index < parsed.records.length; index++) {
        var source = parsed.records[index];
        if (source.kind === "baked") {
          if (source.name === "Rewrite Default") delete nextOverrides[source.id];
          else nextOverrides[source.id] = source.name;
          importedIds[source.id] = source.id;
        } else {
          var importedId = formatUserPresetId(nextNumber);
          nextNumber += 1;
          var imported = normalizePresetRecord({
            id: importedId,
            name: source.name,
            values: source.values,
            mode: source.mode,
            heroes: source.heroes,
            conditions: source.conditions,
          }, "user");
          if (!imported) return reject("preset_import", "INVALID_IMPORTED_PRESET");
          importedUsers.push(imported);
          importedIds[source.id] = importedId;
        }
      }
      var selected = importedIds[parsed.selectedPresetId] || "";
      var selectedHidden = selected && nextHidden.indexOf(selected) >= 0;
      if (selectedHidden) selected = "";
      if (!selected && !selectedHidden && importedUsers.length === 1)
        selected = importedUsers[0].id;
      return commit("preset_import", function () {
        state.bakedPresetNameOverrides = nextOverrides;
        state.hiddenBakedPresetIds = nextHidden;
        state.userPresets = state.userPresets.concat(importedUsers);
        state.nextUserPresetNumber = nextNumber;
        if (selected) state.selectedPresetId = selected;
        if (
          state.selectedPresetId &&
          nextHidden.indexOf(state.selectedPresetId) >= 0
        )
          state.selectedPresetId = null;
        state.confirmation = null;
        return true;
      }, { code: "PRESETS_IMPORTED" });
    }

    function dispatch(intent) {
      var action = "";
      try {
        action = String((intent && intent.type) || "");
        if (!action) return reject(action, "UNKNOWN_INTENT");
        if (
          !state.sessionOpen &&
          action !== "session_open" &&
          action !== "session_close"
        )
          return reject(action, "SESSION_CLOSED");
        switch (action) {
          case "session_open": return handleSessionOpen(intent);
          case "session_close": return handleSessionClose();
          case "editor_close": return handleEditorClose();
          case "setting_edit": return handleSettingEdit(intent);
          case "gesture_begin": return handleGestureBegin(intent);
          case "gesture_update": return handleGestureUpdate(intent);
          case "gesture_end": return handleGestureEnd(intent);
          case "gesture_cancel": return handleGestureCancel(intent);
          case "undo": return handleUndo();
          case "reset_request": return handleResetRequest(intent);
          case "reset_confirm": return handleResetConfirm(intent);
          case "reset_cancel": return handleResetCancel(intent);
          case "hero_mode": return handleHeroMode(intent);
          case "hero_manual": return handleHeroManual(intent);
          case "lifecycle_observe": return handleLifecycleObserve(intent);
          case "hero_observe": return handleHeroObserve(intent);
          case "ability_observe": return handleAbilityObserve(intent);
          case "scope_set": return handleScopeSet(intent);
          case "condition_set": return handleConditionSet(intent);
          case "condition_remove": return handleConditionRemove(intent);
          case "preset_select": return handlePresetSelect(intent);
          case "preset_save": return handlePresetSave(intent);
          case "preset_apply": return handlePresetApply(intent);
          case "preset_rename": return handlePresetRename(intent);
          case "preset_move": return handlePresetMove(intent);
          case "preset_remove_request": return handlePresetRemoveRequest(intent);
          case "preset_remove_confirm": return handlePresetRemoveConfirm(intent);
          case "preset_remove_cancel": return handlePresetRemoveCancel(intent);
          case "preset_restore_baked": return handlePresetRestoreBaked();
          case "settings_copy": return handleSettingsCopy();
          case "settings_import": return handleSettingsImport(intent);
          case "preset_copy_selected": return handlePresetCopySelected();
          case "preset_copy_all": return handlePresetCopyAll();
          case "preset_import": return handlePresetImport(intent);
          default: return reject(action, "UNKNOWN_INTENT");
        }
      } catch {
        return reject(action, "INVALID_INTENT");
      }
    }

    function read() {
      return makeView();
    }

    return Object.freeze({ send: dispatch, read: read });
  }

  $.HPColorsV2StateFactory = Object.freeze({ create: create });
})();
