'use strict';
(function () {

  var TITLE = "HP Colors";
  var STORAGE_NAMESPACE = "hp_colors";
  var STORAGE_KEY = "anita_v1_hp_colors";
  var PERSIST_DEBOUNCE_SEC = 0.35;
  var HP_COMPACT_PERSIST_VERSION = 1;
  var HP_PERSIST_ALIASES = {
    hp_enabled: "e",
    hp_mode: "m",
    hp_low_threshold: "l",
    hp_high_threshold: "h",
    hp_bg_visible: "b",
    hp_team_colors: "t",
    hp_info_health_margin_top: "ihmt",
    hp_healthbar_height: "hbh",
    hp_color_low: "cl",
    hp_color_mid: "cm",
    hp_color_high: "ch",
    hp_counter_size: "s",
    hp_counter_position: "p",
    hp_text_color_mode: "tm",
    hp_level_number_visible: "lnv",
    hp_pip_visible: "plv",
    hp_ult_color_enabled: "uce",
    hp_ult_color_custom: "ucc",
    hp_text_color_low: "tl",
    hp_text_color_mid: "ti",
    hp_text_color_high: "th",
    hp_pulse_bpm: "bp",
    hp_pulse_intensity: "pi",
    hp_pulse_enabled: "pe",
    hp_pulse_text_enabled: "pte",
    hp_pulse_text_scale: "pts",
    hp_pulse_text_position: "ptp",
    hp_pulse_hide_bar: "phb",
    hp_skip_buildings: "sb",
    hp_pulse_threshold: "pt",
    hp_friend_enabled: "fe",
    hp_friend_pulse_enabled: "fpe",
    hp_friend_pulse_bpm: "fpb",
    hp_friend_pulse_intensity: "fpi",
    hp_friend_pulse_threshold: "fpt",
    hp_friend_color_low: "fcl",
    hp_friend_color_mid: "fcm",
    hp_friend_color_high: "fch",
    hp_friend_pulse_color_enabled: "fpce",
    hp_friend_pulse_color: "fpc",
    hp_kill_zone_enabled: "kze",
    hp_kill_zone_threshold: "kzt",
    hp_kill_zone_color: "kzc",
    hp_kill_zone_width: "kzw",
    hp_counter_format: "cf"
  };
  var HP_PERSIST_ALIAS_TO_ID = (function () {
    var out = {};
    for (var id in HP_PERSIST_ALIASES) {
      if (Object.prototype.hasOwnProperty.call(HP_PERSIST_ALIASES, id)) {
        out[HP_PERSIST_ALIASES[id]] = id;
      }
    }
    return out;
  })();

  var bridgeConfig = null;
  var currentValues = null;
  var persistedValues = null;
  var cachedEncoded = "";
  var cachedRaw = "";
  var cachedValues = null;
  var persistToken = 0;
  var bootstrapToken = 0;
  var pendingBootstrapReason = "";
  var _lastHpSharedRaw = "";
  


  var AnitaBase64 = (function () {
    var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    function encode(str) {
      var bytes = [];
      for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 128) {
          bytes.push(code);
        } else if (code < 2048) {
          bytes.push(0xC0 | (code >> 6));
          bytes.push(0x80 | (code & 0x3F));
        } else {
          bytes.push(0xE0 | (code >> 12));
          bytes.push(0x80 | ((code >> 6) & 0x3F));
          bytes.push(0x80 | (code & 0x3F));
        }
      }

      var out = "";
      for (var j = 0; j < bytes.length; j += 3) {
        var b0 = bytes[j];
        var b1 = bytes[j + 1] || 0;
        var b2 = bytes[j + 2] || 0;
        out += CHARS[b0 >> 2];
        out += CHARS[((b0 & 3) << 4) | (b1 >> 4)];
        out += (j + 1 < bytes.length) ? CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "";
        out += (j + 2 < bytes.length) ? CHARS[b2 & 63] : "";
      }
      return out;
    }

    function decode(str) {
      var lookup = {};
      for (var i = 0; i < CHARS.length; i++) lookup[CHARS[i]] = i;

      function getVal(ch) {
        if (ch === undefined) return 0;
        if (!Object.prototype.hasOwnProperty.call(lookup, ch)) {
          throw new Error("Invalid base64url char: " + ch);
        }
        return lookup[ch];
      }

      var decodedBytes = [];
      for (var j = 0; j < str.length; j += 4) {
        var c0 = getVal(str[j]);
        var c1 = getVal(str[j + 1]);
        var c2 = str[j + 2] !== undefined ? getVal(str[j + 2]) : 0;
        var c3 = str[j + 3] !== undefined ? getVal(str[j + 3]) : 0;
        decodedBytes.push((c0 << 2) | (c1 >> 4));
        if (str[j + 2] !== undefined) decodedBytes.push(((c1 & 15) << 4) | (c2 >> 2));
        if (str[j + 3] !== undefined) decodedBytes.push(((c2 & 3) << 6) | c3);
      }

      var out = "";
      for (var k = 0; k < decodedBytes.length; k++) {
        var b = decodedBytes[k];
        if (b < 128) {
          out += String.fromCharCode(b);
        } else if (b < 224) {
          out += String.fromCharCode(((b & 31) << 6) | (decodedBytes[++k] & 63));
        } else {
          var cont2 = decodedBytes[++k];
          var cont3 = decodedBytes[++k];
          out += String.fromCharCode(((b & 15) << 12) | ((cont2 & 63) << 6) | (cont3 & 63));
        }
      }
      return out;
    }

    return {
      encode: encode,
      decode: decode
    };
  })();

  function normalizeNamespace(storageNamespace) {
    return String(storageNamespace || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }


  function writeHpSharedSnapshot(values) {
    if (!values || typeof values !== "object") return;
    var count = 0;
    var out = {};
    for (var key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      out[key] = values[key];
      count += 1;
    }
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig) {
        var raw = JSON.stringify(out);
        if (raw === _lastHpSharedRaw) return;
        _lastHpSharedRaw = raw;
        GameUI.CustomUIConfig().__hpColorsCfgRaw = raw;
      }
    } catch (e) {
    }
  }

  function getRootPanel() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) {
      root = root.GetParent();
    }
    return root || null;
  }

  function cloneValues(values) {
    var out = {};
    if (!values) return out;
    for (var key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        out[key] = values[key];
      }
    }
    return out;
  }

  function findElement(settingId) {
    if (!bridgeConfig || !Array.isArray(bridgeConfig.elements)) return null;
    for (var i = 0; i < bridgeConfig.elements.length; i++) {
      var element = bridgeConfig.elements[i];
      if (element && element.id === settingId) return element;
    }
    return null;
  }

  function sanitizeValue(element, value) {
    if (!element) return value;

    var fallback = element.defaultValue;
    var type = String(element.type || "");

    if (type === "positionpicker") {
      var posX = 0;
      var posY = 200;
      var rawPos = value;

      if (rawPos && typeof rawPos === "object") {
        if (Array.isArray(rawPos)) {
          if (rawPos.length > 0) posX = Number(rawPos[0]);
          if (rawPos.length > 1) posY = Number(rawPos[1]);
        } else {
          if (Object.prototype.hasOwnProperty.call(rawPos, "x")) posX = Number(rawPos.x);
          if (Object.prototype.hasOwnProperty.call(rawPos, "y")) posY = Number(rawPos.y);
        }
      } else if (typeof rawPos === "string") {
        var parts = rawPos.match(/-?\d+(?:\.\d+)?/g);
        if (parts && parts.length > 0) {
          posX = Number(parts[0]);
          if (parts.length > 1) posY = Number(parts[1]);
        }
      } else if (typeof rawPos === "number") {
        posY = Number(rawPos);
      }

      if (!isFinite(posX)) posX = 0;
      if (!isFinite(posY)) posY = 200;
      if (posX < 0) posX = 0;
      if (posY < 0) posY = 0;
      if (posX > 400) posX = 400;
      if (posY > 400) posY = 400;

      return Math.round(posX) + "," + Math.round(posY);
    }

    if (type === "toggle") {
      if (value === true || value === false) return value;
      if (value === 1 || value === "1") return true;
      if (value === 0 || value === "0") return false;
      if (typeof value === "string") {
        var lowered = value.toLowerCase();
        if (lowered === "true") return true;
        if (lowered === "false") return false;
      }
      return !!fallback;
    }

    if (type === "cycler") {
      var count = Array.isArray(element.options) ? element.options.length : 0;
      var nextIndex = Number(value);
      if (!isFinite(nextIndex)) nextIndex = Number(fallback);
      if (!isFinite(nextIndex)) nextIndex = 0;
      nextIndex = Math.round(nextIndex);
      if (nextIndex < 0) nextIndex = 0;
      if (count > 0 && nextIndex >= count) {
        var fallbackIndex = Number(fallback);
        if (!isFinite(fallbackIndex) || fallbackIndex < 0 || fallbackIndex >= count) fallbackIndex = 0;
        nextIndex = fallbackIndex;
      }
      return nextIndex;
    }

    if (type === "slider" || type === "stepper") {
      var nextNumber = Number(value);
      if (!isFinite(nextNumber)) nextNumber = Number(fallback);
      if (!isFinite(nextNumber)) nextNumber = 0;
      var step = Number(element.step);
      if (!isFinite(step) || step === 0) step = 1;
      var minV = isFinite(Number(element.min)) ? Number(element.min) : -Infinity;
      var maxV = isFinite(Number(element.max)) ? Number(element.max) : Infinity;
      if (nextNumber < minV) nextNumber = minV;
      if (nextNumber > maxV) nextNumber = maxV;
      if (Math.round(step) === step) return Math.round(nextNumber);
      return parseFloat(nextNumber.toFixed(2));
    }

    if (type === "colorpicker") {
      if (typeof value === "string" && value.length > 0) return value;
      return (typeof fallback === "string" && fallback.length > 0) ? fallback : "#FFFFFF";
    }

    if (value !== undefined) return value;
    return fallback;
  }

  function buildDefaultValues(config) {
    var values = {};
    var elements = (config && Array.isArray(config.elements)) ? config.elements : [];
    for (var i = 0; i < elements.length; i++) {
      var element = elements[i];
      if (!element || !element.id || element.type === "button") continue;
      values[element.id] = sanitizeValue(element, element.defaultValue);
    }
    return values;
  }

  function mergeWithDefaults(values) {
    var merged = buildDefaultValues(bridgeConfig);
    for (var key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      var element = findElement(key);
      if (!element) continue;
      merged[key] = sanitizeValue(element, values[key]);
    }
    return merged;
  }

  function parseStoredPayload(raw) {
    var text = String(raw || "");
    if (!text) return null;

    var parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (eParse) {
      return null;
    }

    if (!parsed || typeof parsed !== "object" || !parsed.values || typeof parsed.values !== "object") {
      return null;
    }

    if (bridgeConfig && parsed.v && Number(parsed.v) < Number(bridgeConfig.storageVersion)) {
    }

    var rawValues = parsed.values;
    var values = {};
    var useCompact = parsed.c === HP_COMPACT_PERSIST_VERSION || parsed.compact === true;
    if (useCompact) {
      var expanded = {};
      for (var alias in rawValues) {
        if (!Object.prototype.hasOwnProperty.call(rawValues, alias)) continue;
        var fullId = HP_PERSIST_ALIAS_TO_ID[alias];
        if (!fullId) continue;
        expanded[fullId] = rawValues[alias];
      }
      values = mergeWithDefaults(expanded);
    } else {
      values = mergeWithDefaults(rawValues);
    }
    return {
      raw: text,
      values: values
    };
  }

  function buildStoredPayload() {
    if (!bridgeConfig) return "";
    var sourceValues = persistedValues || currentValues || buildDefaultValues(bridgeConfig);
    var defaults = buildDefaultValues(bridgeConfig);
    var compactValues = {};
    for (var key in sourceValues) {
      if (!Object.prototype.hasOwnProperty.call(sourceValues, key)) continue;
      if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
      if (sourceValues[key] === defaults[key]) continue;
      compactValues[HP_PERSIST_ALIASES[key] || key] = sourceValues[key];
    }
    return JSON.stringify({
      v: Math.max(1, Math.floor(Number(bridgeConfig.storageVersion) || 1)),
      c: HP_COMPACT_PERSIST_VERSION,
      values: compactValues
    });
  }

  function writeSessionMirror(encoded) {
    var root = getRootPanel();
    if (!root) return;

    try {
      if (root.SetAttributeString) root.SetAttributeString(STORAGE_KEY, encoded);
    } catch (eRoot) {}

    try {
      var hud = root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
      if (hud && hud.SetAttributeString) hud.SetAttributeString(STORAGE_KEY, encoded);
    } catch (eHud) {}
  }

  function cachePayload(raw, encoded, values, persisted) {
    cachedRaw = String(raw || "");
    cachedEncoded = String(encoded || "");
    cachedValues = cloneValues(values || {});
    currentValues = cloneValues(values || {});
    persistedValues = cloneValues(persisted || values || {});
    writeSessionMirror(cachedEncoded);
    writeHpSharedSnapshot(currentValues, "cache");
  }

  function readSharedSnapshotValues() {
    var store = getSharedStore();
    if (!store) return null;
    try {
      var raw = String(store[SHARED_CFG_RAW_KEY] || "");
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return cloneValues(parsed);
    } catch (eShared) {}
    return null;
  }

  function readStoredPayload() {
    if (cachedRaw && cachedEncoded && cachedValues) {
      return {
        raw: cachedRaw,
        encoded: cachedEncoded,
        values: cloneValues(cachedValues),
        source: "cache"
      };
    }

    var canReadConvar = typeof GameInterfaceAPI !== "undefined" &&
      GameInterfaceAPI &&
      typeof GameInterfaceAPI.GetSettingString === "function";
    if (!canReadConvar) {
      return null;
    }

    var convarRaw = "";
    try {
      convarRaw = String(GameInterfaceAPI.GetSettingString("deadlock_hero_debuts_seen") || "");
    } catch (eConvar) {
      return null;
    }

    var tokenMatch = convarRaw.match(/\[ANITA-v1-hp_colors\]:([A-Za-z0-9_-]+)/);
    if (!tokenMatch) {
      return null;
    }

    var convarEncoded = tokenMatch[1];
    var convarDecoded = "";
    try {
      convarDecoded = AnitaBase64.decode(convarEncoded);
    } catch (eDecode) {
      return null;
    }

    var convarParsed = parseStoredPayload(convarDecoded, "convar");
    if (!convarParsed) {
      return null;
    }

    cachePayload(convarParsed.raw, convarEncoded, convarParsed.values, convarParsed.values);
    return {
      raw: convarParsed.raw,
      encoded: convarEncoded,
      values: cloneValues(convarParsed.values),
      source: "convar"
    };
  }

  function persistCurrentState(reason, forceWrite) {
    if (!bridgeConfig) return false;
    if (!currentValues) currentValues = buildDefaultValues(bridgeConfig);

    var raw = buildStoredPayload();
    if (!raw) return false;

    var encoded = "";
    try {
      encoded = AnitaBase64.encode(raw);
    } catch (eEnc) {
      return false;
    }

    if (!forceWrite && encoded === cachedEncoded) {
      writeSessionMirror(encoded);
      writeHpSharedSnapshot(currentValues, "persist_unchanged");
      return false;
    }

    cachePayload(raw, encoded, currentValues, persistedValues);
    return false;
  }

  function schedulePersist(reason, immediate) {
    var token = ++persistToken;
    $.Schedule(immediate ? 0.0 : PERSIST_DEBOUNCE_SEC, function () {
      if (token !== persistToken) return;
      persistCurrentState(reason, !!immediate);
    });
  }

  function replayValues(values, reason) {
    if (!values) return;
    writeHpSharedSnapshot(values);

    var count = 0;
    for (var key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_UPDATE",
        mod_title: TITLE,
        setting_id: key,
        value: values[key],
        update_source: "bridge_bootstrap",
        skip_bridge_persist: true
      }));
      count += 1;
    }
  }

  function replayValuesBulk(values, reason) {
    if (!values) return;
    writeHpSharedSnapshot(values);
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
      magic_word: "ANITA_BULK_UPDATE",
      mod_title: TITLE,
      values: values,
      update_source: "bridge_bootstrap",
      skip_bridge_persist: true
    }));
  }

  function performBootstrap(reason) {
    if (!bridgeConfig) {
      pendingBootstrapReason = reason;
      return;
    }

    var sharedValues = readSharedSnapshotValues();
    if (sharedValues) {
      currentValues = cloneValues(sharedValues);
      persistedValues = cloneValues(sharedValues);
      persistCurrentState(reason + ":shared", true);
      replayValuesBulk(sharedValues, reason + ":shared");
      return;
    }

    var stored = readStoredPayload();
      if (stored) {
        currentValues = cloneValues(stored.values);
        persistedValues = cloneValues(stored.values);
        writeSessionMirror(stored.encoded);
        replayValuesBulk(stored.values, reason + ":" + stored.source);
        return;
      }

    var sessionValues = currentValues || persistedValues;
    if (sessionValues) {
      replayValuesBulk(sessionValues, reason + ":session");
      return;
    }

  }

  function scheduleBootstrap(reason) {
    pendingBootstrapReason = String(reason || "request");
    var token = ++bootstrapToken;
    $.Schedule(0.0, function () {
      if (token !== bootstrapToken) return;
      performBootstrap(pendingBootstrapReason);
    });
  }

  function captureConfig(config) {
    if (!config || String(config.title || "") !== TITLE) return false;
    if (normalizeNamespace(config.storageNamespace) !== STORAGE_NAMESPACE) return false;

    var nextConfig = {
      title: TITLE,
      storageNamespace: STORAGE_NAMESPACE,
      storageVersion: Math.max(1, Math.floor(Number(config.storageVersion) || 1)),
      elements: []
    };

    var sourceElements = Array.isArray(config.elements) ? config.elements : [];
    for (var i = 0; i < sourceElements.length; i++) {
      var source = sourceElements[i];
      if (!source || !source.id) continue;
      nextConfig.elements.push({
        id: source.id,
        type: source.type,
        defaultValue: source.defaultValue,
        options: Array.isArray(source.options) ? source.options.slice(0) : null,
        step: source.step
      });
    }

    bridgeConfig = nextConfig;
    if (!currentValues) currentValues = buildDefaultValues(bridgeConfig);
    if (!persistedValues) persistedValues = cloneValues(currentValues);
    return true;
  }

  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
    try {
      var data = (typeof payload === "string") ? JSON.parse(payload) : payload;
      if (!data) return;

      if (data.magic_word === "ANITA_REGISTER") {
        if (data.config && data.config.title === TITLE) {}
        if (captureConfig(data.config) && pendingBootstrapReason) {
          scheduleBootstrap(pendingBootstrapReason);
        }
        return;
      }

      if (data.magic_word === "ANITA_REQUEST_BOOTSTRAP") {
        if (data.mod_title !== TITLE) return;
        if (normalizeNamespace(data.storageNamespace) !== STORAGE_NAMESPACE) return;
        scheduleBootstrap(String(data.reason || "request"));
        return;
      }

      if (data.magic_word !== "ANITA_UPDATE" || data.mod_title !== TITLE) return;
      if (!bridgeConfig || !data.setting_id) return;

      var element = findElement(data.setting_id);
      if (!element) return;

      if (!currentValues) currentValues = buildDefaultValues(bridgeConfig);
      if (!persistedValues) persistedValues = cloneValues(currentValues);

      var updateSource = String(data.update_source || "ui_update");
      var isResync = updateSource === "core_auto_resync" || updateSource === "ui_resync";

      var sanitizedValue = sanitizeValue(element, data.value);
      currentValues[data.setting_id] = sanitizedValue;
      writeHpSharedSnapshot(currentValues, updateSource);
      if (!isResync) {
        persistedValues[data.setting_id] = sanitizedValue;
      }

      if (data.skip_bridge_persist || updateSource === "bridge_bootstrap" || isResync) {
        return;
      }

      schedulePersist(String(data.update_source || "ui_update"), !!data.force_persist);
    } catch (e) {
    }
  });

})();
