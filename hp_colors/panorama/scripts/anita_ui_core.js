


(function () {
  "use strict";

  const CONFIG = {
    VERSION: "2.2.3",

    IDS: {
      WINDOW: "AnitaUI_Window",
      BACKDROP: "AnitaUI_Backdrop",
      NAVBAR: "AnitaUI_NavBar",
      CONTENT: "AnitaUI_ContentArea",
      OVERLAY_BTN: "AnitaOverlayBtn",
      HUD_ROOT: "Hud"
    },
    CLASSES: {
      ESCAPE_MENU: "ShowEscapeMenu",
      OPEN: "Open",
      VISIBLE: "Visible",
      ATTENTION: "Attention"
    },
    UI: {
      TAB_MAX_CHARS: 17,
      MONITOR_INTERVAL: 0.05
    }
  };
  const RENDER_REFRESH_DEBOUNCE_SEC = 0.05;
  const MAX_CONVAR_VALUE_LEN = 1900;
  const HP_PRESET_BUILDER_CATEGORY = "PRESETS|Preset Builder";
  const HP_PRESET_BUILDER_URL = "https://hantu-raya.github.io/hp-colors-preset-builder/";
  const HP_BAKED_PRESET_APPLY_DELAYS = [0.5, 1.5, 3.0, 5.0, 8.0, 12.0];
  var _lastHpSharedRaw = "";
  var _didApplyHpColorsBakedPresetOnce = false;
  var _hpBakedPresetApplyToken = 0;
  const HP_COMPACT_PERSIST_VERSION = 1;
  const HP_PERSIST_ALIASES = {
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
    hp_pulse_color_enabled: "pce",
    hp_pulse_color: "pc",
    hp_pulse_color_mode: "pcm",
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
  const HP_PERSIST_ALIAS_TO_ID = (function () {
    var out = {};
    for (var id in HP_PERSIST_ALIASES) {
      if (Object.prototype.hasOwnProperty.call(HP_PERSIST_ALIASES, id)) {
        out[HP_PERSIST_ALIASES[id]] = id;
      }
    }
    return out;
  })();
  const HP_PRESET_BUILDER_SUPPORTED_IDS = {
    hp_enabled: true,
    hp_bg_visible: true,
    hp_mode: true,
    hp_low_threshold: true,
    hp_high_threshold: true,
    hp_team_colors: true,
    hp_skip_buildings: true,
    hp_info_health_margin_top: true,
    hp_healthbar_height: true,
    hp_ult_color_enabled: true,
    hp_ult_color_custom: true,
    hp_color_low: true,
    hp_color_mid: true,
    hp_color_high: true,
    hp_pulse_enabled: true,
    hp_pulse_threshold: true,
    hp_pulse_bpm: true,
    hp_pulse_intensity: true,
    hp_pulse_hide_bar: true,
    hp_pulse_color_enabled: true,
    hp_pulse_color_mode: true,
    hp_pulse_color: true,
    hp_pulse_text_enabled: true,
    hp_pulse_text_scale: true,
    hp_pulse_text_position: true,
    hp_counter_size: true,
    hp_counter_position: true,
    hp_counter_format: true,
    hp_text_color_mode: true,
    hp_level_number_visible: true,
    hp_pip_visible: true,
    hp_text_color_low: true,
    hp_text_color_mid: true,
    hp_text_color_high: true,
    hp_friend_enabled: true,
    hp_friend_color_low: true,
    hp_friend_color_mid: true,
    hp_friend_color_high: true,
    hp_friend_pulse_enabled: true,
    hp_friend_pulse_threshold: true,
    hp_friend_pulse_bpm: true,
    hp_friend_pulse_intensity: true,
    hp_friend_pulse_color_enabled: true,
    hp_friend_pulse_color: true,
    hp_kill_zone_enabled: true,
    hp_kill_zone_threshold: true,
    hp_kill_zone_color: true,
    hp_kill_zone_width: true
  };
  // Base64url encode/decode — no btoa/atob in Deadlock Panorama
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
        var b0 = bytes[j], b1 = bytes[j + 1] || 0, b2 = bytes[j + 2] || 0;
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
          var cont2 = decodedBytes[++k], cont3 = decodedBytes[++k];
          out += String.fromCharCode(((b & 15) << 12) | ((cont2 & 63) << 6) | (cont3 & 63));
        }
      }
      return out;
    }

    return { encode: encode, decode: decode };
  })();

  function rememberLastEmittedValue(modTitle, settingId, newValue) {
    try {
      if (!modTitle || !settingId) return;
      if (typeof AnitaCore === "undefined" || !AnitaCore || typeof AnitaCore.findRegisteredMod !== "function") return;
      var config = AnitaCore.findRegisteredMod(modTitle);
      if (!config) return;
      if (!config.__anitaLastEmittedValues) config.__anitaLastEmittedValues = {};
      config.__anitaLastEmittedValues[settingId] = newValue;
    } catch (e) {}
  }

  function emitUpdate(modTitle, settingId, newValue, meta) {
    var payload = {
      magic_word: "ANITA_UPDATE",
      mod_title: modTitle,
      setting_id: settingId,
      value: newValue
    };
    if (meta && typeof meta === "object") {
      for (var key in meta) {
        if (Object.prototype.hasOwnProperty.call(meta, key)) {
          payload[key] = meta[key];
        }
      }
    }
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(payload));
    rememberLastEmittedValue(modTitle, settingId, newValue);
  }

  function emitBulkUpdate(modTitle, values, meta) {
    var payload = {
      magic_word: "ANITA_BULK_UPDATE",
      mod_title: modTitle,
      values: values || {}
    };
    if (meta && typeof meta === "object") {
      for (var key in meta) {
        if (Object.prototype.hasOwnProperty.call(meta, key)) {
          payload[key] = meta[key];
        }
      }
    }
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(payload));
    for (var settingId in values || {}) {
      if (Object.prototype.hasOwnProperty.call(values, settingId)) {
        rememberLastEmittedValue(modTitle, settingId, values[settingId]);
      }
    }
  }

  var throttledEmitState = {};
  function emitUpdateThrottled(modTitle, settingId, newValue, meta, delaySec) {
    if (!modTitle || !settingId) return;
    var key = modTitle + "::" + settingId;
    var state = throttledEmitState[key];
    if (!state) state = throttledEmitState[key] = { pending: false, value: null, meta: null };
    state.value = newValue;
    state.meta = meta || null;
    if (state.pending) return;
    state.pending = true;
    $.Schedule(delaySec || 0.04, function () {
      state.pending = false;
      emitUpdate(modTitle, settingId, state.value, state.meta);
    });
  }

  function getRootPanelForPresetStore() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel || null;
  }

  function readPresetLabelText(label) {
    try {
      if (typeof label.text === "string") return label.text;
    } catch (e0) {}
    try {
      if (label.GetAttributeString) return label.GetAttributeString("text", "");
    } catch (e1) {}
    return "";
  }

  function getPresetAllowedKeys(modConfig) {
    var allowed = {};
    if (!modConfig || !Array.isArray(modConfig.elements)) return allowed;
    for (var i = 0; i < modConfig.elements.length; i++) {
      var element = modConfig.elements[i];
      if (!element || !element.id || element.type === "button") continue;
      allowed[element.id] = true;
    }
    return allowed;
  }

  function filterPresetValues(rawValues, modConfig) {
    var allowed = getPresetAllowedKeys(modConfig);
    var values = {};
    for (var key in rawValues || {}) {
      if (Object.prototype.hasOwnProperty.call(rawValues, key) &&
          Object.prototype.hasOwnProperty.call(allowed, key)) {
        values[key] = rawValues[key];
      }
    }
    return values;
  }

  function readBakedPresetEntries(modConfig) {
    var root = getRootPanelForPresetStore();
    if (!root || !root.FindChildTraverse) return [];
    var store = null;
    try {
      store = root.FindChildTraverse("HPColorsPresetStore");
    } catch (e0) {}
    if (!store) return [];

    var entries = [];
    try {
      if (store.FindChildrenWithClassTraverse) {
        entries = store.FindChildrenWithClassTraverse("hp_colors_preset_entry") || [];
      }
    } catch (e1) {}

    var presets = [];
    for (var i = 0; i < entries.length; i++) {
      try {
        var encoded = readPresetLabelText(entries[i]);
        if (!encoded) continue;
        var preset = JSON.parse(AnitaBase64.decode(encoded));
        if (!preset || !preset.values || preset.version !== 1) continue;
        var values = filterPresetValues(preset.values, modConfig);
        var name = String(preset.name || "").replace(/^\s+|\s+$/g, "");
        var category = String(preset.category || preset.type || "").replace(/^\s+|\s+$/g, "");
        presets.push({
          name: name || ("Builder preset " + String(presets.length + 1)),
          category: category || "Builder VPK",
          values: values,
          source: "baked"
        });
      } catch (e2) {}
    }
    return presets;
  }

  function readBakedPresetValues(modConfig) {
    var presets = readBakedPresetEntries(modConfig);
    if (presets.length > 0) return presets[presets.length - 1].values || {};
    return {};
  }

  function applyHpColorsBakedPresetOnce(config) {
    if (_didApplyHpColorsBakedPresetOnce) return;
    var token = ++_hpBakedPresetApplyToken;
    for (var i = 0; i < HP_BAKED_PRESET_APPLY_DELAYS.length; i++) {
      (function (delaySec) {
        $.Schedule(delaySec, function () {
          if (_didApplyHpColorsBakedPresetOnce || token !== _hpBakedPresetApplyToken) return;
          try {
            var values = readBakedPresetValues(config);
            var hasValues = false;
            for (var presetKey in values) {
              if (Object.prototype.hasOwnProperty.call(values, presetKey)) {
                hasValues = true;
                break;
              }
            }
            if (hasValues) {
              _didApplyHpColorsBakedPresetOnce = true;
              emitBulkUpdate("HP Colors", values, {
                update_source: "baked_preset_apply",
                force_emit: true,
                force_persist: true,
                bulk_emit: true
              });
            }
          } catch (e) {}
        });
      })(HP_BAKED_PRESET_APPLY_DELAYS[i]);
    }
  }

  function writeHpSharedSnapshot(config) {
    if (!config || config.title !== "HP Colors" || !Array.isArray(config.elements)) return;
    var values = {};
    var count = 0;
    for (var i = 0; i < config.elements.length; i++) {
      var element = config.elements[i];
      if (!element || !element.id) continue;
      if (element.currentValue !== undefined) values[element.id] = element.currentValue;
      else values[element.id] = element.defaultValue;
      count += 1;
    }
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig) {
        var raw = JSON.stringify(values);
        if (raw === _lastHpSharedRaw) return;
        _lastHpSharedRaw = raw;
        GameUI.CustomUIConfig().__hpColorsCfgRaw = raw;
      }
    } catch (e) {
    }
  }

  function runConsoleCommandBestEffort(commandText) {
    var cmd = String(commandText || "").trim();
    var didAny = false;
    if (!cmd) return false;

    try {
      $.DispatchEvent("CitadelConCommand", cmd);
      didAny = true;
    } catch (e0) {}

    try {
      if (typeof GameInterfaceAPI !== "undefined" &&
          GameInterfaceAPI &&
          typeof GameInterfaceAPI.ConsoleCommand === "function") {
        GameInterfaceAPI.ConsoleCommand(cmd);
        didAny = true;
      }
    } catch (e1) {}

    try {
      $.DispatchEvent("ConsoleCommand", cmd);
      didAny = true;
    } catch (e2) {}

    try {
      $.DispatchEvent("GameUIRunCommand", cmd);
      didAny = true;
    } catch (e3) {}

    return didAny;
  }

  const AnitaPersistence = {

    normalizeNamespace: function (storageNamespace) {
      return String(storageNamespace || "")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    },

    getVersion: function (config) {
      var version = Number(config && config.storageVersion);
      if (!isFinite(version) || version < 1) return 1;
      return Math.floor(version);
    },

    hasPersistentConfig: function (config) {
      return this.normalizeNamespace(config && config.storageNamespace).length > 0;
    },

    isHpColorsConfig: function (config) {
      return !!config &&
        String(config.title || "") === "HP Colors" &&
        this.normalizeNamespace(config.storageNamespace) === "hp_colors";
    },

    CONVAR_KEY: "deadlock_hero_debuts_seen",
    TOKEN_PREFIX: "ANITA-v1-",

    // ns is safe to interpolate into regex: normalizeNamespace restricts output to [a-z0-9_]
    getTokenRegex: function (ns) {
      return new RegExp("\\[" + this.TOKEN_PREFIX + ns + "\\]:[A-Za-z0-9_-]+");
    },

    getCleanupRegex: function (ns) {
      return new RegExp("\\[" + this.TOKEN_PREFIX + ns + "\\]:[A-Za-z0-9_-]*", "g");
    },

    canWriteConvarDirect: function () {
      return typeof GameInterfaceAPI !== "undefined" &&
        !!GameInterfaceAPI &&
        (typeof GameInterfaceAPI.ConsoleCommand === "function" ||
         typeof GameInterfaceAPI.SetSettingString === "function");
    },

    getStorageKey: function (config) {
      var ns = this.normalizeNamespace(config && config.storageNamespace);
      return ns ? "anita_v1_" + ns : "";
    },

    getRootPanel: function () {
      var rootPanel = $.GetContextPanel();
      while (rootPanel && rootPanel.GetParent && rootPanel.GetParent()) rootPanel = rootPanel.GetParent();
      return rootPanel || null;
    },

    getSessionEncoded: function (config) {
      var key = this.getStorageKey(config);
      if (!key) return "";

      var rootPanel = this.getRootPanel();
      var rootEncoded = "";
      var hudEncoded = "";

      try {
        if (rootPanel && rootPanel.GetAttributeString) {
          rootEncoded = String(rootPanel.GetAttributeString(key, "") || "");
        }
      } catch (eRoot) {}

      try {
        var hudPanel = (rootPanel && rootPanel.FindChildTraverse) ? rootPanel.FindChildTraverse("Hud") : null;
        if (hudPanel && hudPanel.GetAttributeString) {
          hudEncoded = String(hudPanel.GetAttributeString(key, "") || "");
        }
      } catch (eHud) {}

      return rootEncoded || hudEncoded || "";
    },

    writeSessionMirror: function (config, encoded) {
      var key = this.getStorageKey(config);
      if (!key) return;

      try {
        var rootPanel = this.getRootPanel();
        if (rootPanel && rootPanel.SetAttributeString) {
          rootPanel.SetAttributeString(key, encoded);
        }
        var hudPanel = (rootPanel && rootPanel.FindChildTraverse) ? rootPanel.FindChildTraverse("Hud") : null;
        if (hudPanel && hudPanel.SetAttributeString) {
          hudPanel.SetAttributeString(key, encoded);
        }
      } catch (eSess) {
      }
    },

    writeConvar: function (key, value) {
      // Prefer SetSettingString (writes to settings file, survives restarts)
      if (typeof GameInterfaceAPI !== "undefined" &&
          GameInterfaceAPI &&
          typeof GameInterfaceAPI.SetSettingString === "function") {
        GameInterfaceAPI.SetSettingString(key, value);
      } else if (typeof GameInterfaceAPI !== "undefined" &&
          GameInterfaceAPI &&
          typeof GameInterfaceAPI.ConsoleCommand === "function") {
        GameInterfaceAPI.ConsoleCommand(key + ' "' + value + '"');
      }
    },

    writeConvarBestEffort: function (key, value) {
      var command = String(key || "") + ' "' + String(value || "") + '"';
      if (this.canWriteConvarDirect()) {
        try {
          this.writeConvar(key, value);
          return true;
        } catch (e0) {
        }
      }

      if (runConsoleCommandBestEffort(command)) {
        // Also attempt SetSettingString as a durable fallback after events path
        try {
          if (typeof GameInterfaceAPI !== "undefined" && GameInterfaceAPI &&
              typeof GameInterfaceAPI.SetSettingString === "function") {
            GameInterfaceAPI.SetSettingString(key, value);
          }
        } catch (eSS) {}
        return true;
      }
      return false;
    },

    getElements: function (config) {
      return (config && Array.isArray(config.elements)) ? config.elements : [];
    },

    warnPersistence: function (config, reason) {
      var title = (config && config.title) ? String(config.title) : "unknown";
      if (config && config.__anitaLastPersistWarning === reason) return;
      if (config) config.__anitaLastPersistWarning = reason;
    },

    shouldPersistElement: function (element) {
      return !!(element && element.id && element.type !== "button");
    },

    sanitizeValue: function (element, value) {
      if (!element) return value;

      var fallback = element.defaultValue;
      var type = String(element.type || "");

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

      if (type === "stepper" || type === "slider") {
        var nextNumber = Number(value);
        if (!isFinite(nextNumber)) nextNumber = Number(fallback);
        if (!isFinite(nextNumber)) nextNumber = 0;
        var min = Number(element.min);
        var max = Number(element.max);
        if (isFinite(min) && nextNumber < min) nextNumber = min;
        if (isFinite(max) && nextNumber > max) nextNumber = max;
        var step = Number(element.step);
        if (!isFinite(step) || step === 0) step = 1;
        if (Math.round(step) === step) {
          nextNumber = Math.round(nextNumber);
        } else {
          nextNumber = parseFloat(nextNumber.toFixed(2));
        }
        if (isFinite(min) && nextNumber < min) nextNumber = min;
        if (isFinite(max) && nextNumber > max) nextNumber = max;
        return nextNumber;
      }

      if (type === "colorpicker") {
        if (typeof value === "string" && value.length > 0) return value;
        return (typeof fallback === "string" && fallback.length > 0) ? fallback : "#FFFFFF";
      }

      if (value !== undefined) return value;
      return fallback;
    },

    ensureDefaults: function (config) {
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) {
          if (element.currentValue === undefined && element.defaultValue !== undefined) {
            element.currentValue = element.defaultValue;
          }
          continue;
        }
        var sourceValue = (element.currentValue !== undefined) ? element.currentValue : element.defaultValue;
        element.currentValue = this.sanitizeValue(element, sourceValue);
      }
    },

    expandStoredValues: function (config, parsed) {
      if (!parsed || typeof parsed !== "object" || !parsed.values || typeof parsed.values !== "object") {
        return null;
      }

      var rawValues = parsed.values;
      var expanded = {};
      var isCompact = this.isHpColorsConfig(config) && (parsed.c === HP_COMPACT_PERSIST_VERSION || parsed.compact === true);

      if (!isCompact) {
        for (var key in rawValues) {
          if (Object.prototype.hasOwnProperty.call(rawValues, key)) {
            expanded[key] = rawValues[key];
          }
        }
        return expanded;
      }

      for (var alias in rawValues) {
        if (!Object.prototype.hasOwnProperty.call(rawValues, alias)) continue;
        var fullId = HP_PERSIST_ALIAS_TO_ID[alias];
        if (!fullId) continue;
        expanded[fullId] = rawValues[alias];
      }
      return expanded;
    },

    parseStoredPayload: function (config, raw) {
      var text = String(raw || "");
      if (!text) return null;

      var parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return null;
      }

      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      var expandedValues = this.expandStoredValues(config, parsed);
      if (!expandedValues) {
        return null;
      }

      var values = {};
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) continue;
        if (!Object.prototype.hasOwnProperty.call(expandedValues, element.id)) continue;
        values[element.id] = this.sanitizeValue(element, expandedValues[element.id]);
      }

      return {
        raw: text,
        values: values
      };
    },

    readConvarPayload: function (config) {
      var ns = this.normalizeNamespace(config && config.storageNamespace);
      if (!ns) return null;
      if (typeof GameInterfaceAPI === "undefined" ||
          !GameInterfaceAPI ||
          typeof GameInterfaceAPI.GetSettingString !== "function") {
        return null;
      }

      var convarRaw = "";
      try {
        convarRaw = String(GameInterfaceAPI.GetSettingString(this.CONVAR_KEY) || "");
      } catch (eRead) {
        return null;
      }

      var tokenMatch = convarRaw.match(new RegExp("\\[" + this.TOKEN_PREFIX + ns + "\\]:([A-Za-z0-9_-]+)"));
      if (!tokenMatch) {
        return null;
      }

      var encoded = String(tokenMatch[1] || "");
      if (!encoded) return null;

      var raw = "";
      try {
        raw = AnitaBase64.decode(encoded);
      } catch (eDecode) {
        return null;
      }

      var parsed = this.parseStoredPayload(config, raw);
      if (!parsed) {
        return null;
      }
      return {
        raw: parsed.raw,
        encoded: encoded,
        values: parsed.values,
        source: "convar"
      };
    },

    readSharedSnapshotPayload: function (config) {
      try {
        if (typeof GameUI === "undefined" || !GameUI || !GameUI.CustomUIConfig) return null;
        var raw = String(GameUI.CustomUIConfig().__hpColorsCfgRaw || "");
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return {
          raw: raw,
          encoded: "",
          values: parsed,
          source: "shared"
        };
      } catch (eShared) {}
      return null;
    },

    readStoredPayload: function (config) {
      var persisted = null;

      persisted = this.readSharedSnapshotPayload(config);
      if (persisted) {
        return persisted;
      }

      try {
        var sessionEncoded = this.getSessionEncoded(config);
        if (sessionEncoded) {
          var sessionRaw = AnitaBase64.decode(sessionEncoded);
          persisted = this.parseStoredPayload(config, sessionRaw);
          if (persisted) {
            return {
              raw: persisted.raw,
              encoded: sessionEncoded,
              values: persisted.values,
              source: "session"
            };
          }
        }
      } catch (eSess) {
      }

      persisted = this.readConvarPayload(config);
      if (persisted) {
        return persisted;
      }

      return null;
    },

    applyResolvedValues: function (config, values) {
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) {
          if (element.currentValue === undefined && element.defaultValue !== undefined) {
            element.currentValue = element.defaultValue;
          }
          continue;
        }

        var nextValue = Object.prototype.hasOwnProperty.call(values || {}, element.id)
          ? values[element.id]
          : element.defaultValue;
        element.currentValue = this.sanitizeValue(element, nextValue);
      }
    },

    hydrateConfig: function (config) {
      this.ensureDefaults(config);
      var hydrateSource = "defaults";
      var ns = this.normalizeNamespace(config && config.storageNamespace);

      if (!this.hasPersistentConfig(config)) {
        config.__anitaLastPersistedRaw = "";
        this.applyResolvedValues(config, {});
        return;
      }

      var persisted = this.readStoredPayload(config);
      if (persisted) {
        hydrateSource = persisted.source;
      }

      if (persisted) {
        this.applyResolvedValues(config, persisted.values);
        if (persisted.encoded && hydrateSource !== "session") {
          this.writeSessionMirror(config, persisted.encoded);
        } else if (hydrateSource === "shared") {
          this.persistConfig(config, true);
        }
      } else {
        this.applyResolvedValues(config, {});
      }

      config.__anitaLastPersistedRaw = persisted ? persisted.raw : "";
    },

    buildStoredPayload: function (config) {
      var elements = this.getElements(config);
      var values = {};
      var isHpColors = this.isHpColorsConfig(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) continue;
        var value = this.sanitizeValue(
          element,
          element.currentValue !== undefined ? element.currentValue : element.defaultValue
        );
        element.currentValue = value;
        if (isHpColors && value === this.sanitizeValue(element, element.defaultValue)) {
          continue;
        }
        values[isHpColors ? (HP_PERSIST_ALIASES[element.id] || element.id) : element.id] = value;
      }
      if (isHpColors) {
        return JSON.stringify({
          v: this.getVersion(config),
          c: HP_COMPACT_PERSIST_VERSION,
          values: values
        });
      }
      return JSON.stringify({
        version: this.getVersion(config),
        values: values
      });
    },

    persistConfig: function (config, forceWrite) {
      if (!this.hasPersistentConfig(config)) return false;

      var raw = this.buildStoredPayload(config);
      if (!raw) return false;
      if (!forceWrite && raw === String(config.__anitaLastPersistedRaw || "")) {
        return false;
      }

      var ns = this.normalizeNamespace(config.storageNamespace);
      var encoded = "";
      try {
        encoded = AnitaBase64.encode(raw);
      } catch (eEnc) {
        return false;
      }
      var token = "[" + this.TOKEN_PREFIX + ns + "]:" + encoded;

      try {
        var current = "";
        if (typeof GameInterfaceAPI !== "undefined" &&
            GameInterfaceAPI &&
            typeof GameInterfaceAPI.GetSettingString === "function") {
          current = String(GameInterfaceAPI.GetSettingString(this.CONVAR_KEY) || "");
        }
        var cleaned = current.replace(this.getCleanupRegex(ns), "").replace(/,,+/g, ",").replace(/^,|,$/, "");
        var finalValue = (cleaned ? cleaned + "," : "") + token;
        if (finalValue.length > MAX_CONVAR_VALUE_LEN) {
          // Do NOT write cleaned back — that would destroy the last valid token.
          // Leave the convar untouched and skip only the new write.
          this.warnPersistence(config, "convar skipped (payload_too_large)");
        } else if (!this.writeConvarBestEffort(this.CONVAR_KEY, finalValue)) {
          this.warnPersistence(config, "convar unavailable");
        } else {
        }
      } catch (e) {
      }

      this.writeSessionMirror(config, encoded);

      config.__anitaLastPersistedRaw = raw;
      return true;
    },

    requestBootstrap: function (config, reason) {
      if (!this.hasPersistentConfig(config)) return;
      var payload = {
        magic_word: "ANITA_REQUEST_BOOTSTRAP",
        mod_title: config.title,
        storageNamespace: this.normalizeNamespace(config.storageNamespace),
        reason: String(reason || "request")
      };
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(payload));
    },

    applyUpdate: function (config, settingId, value) {
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!element || element.id !== settingId) continue;
        element.currentValue = this.sanitizeValue(element, value);
        return true;
      }
      return false;
    }
  };

  const AnitaComponents = {
    createToggle: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaToggleRow");

      const btn = $.CreatePanel("Button", row, "");
      btn.AddClass("AnitaToggleBtn");

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Option";
      lbl.AddClass("AnitaLabel");

      const box = $.CreatePanel("Panel", row, "");
      box.AddClass("AnitaCheckBox");

      const tick = $.CreatePanel("Panel", box, "");
      tick.AddClass("AnitaCheckMark");

      let isOn = (config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || false);

      const updateState = (active) => row.SetHasClass("Checked", active);
      updateState(isOn);

      btn.SetPanelEvent("onactivate", () => {
        isOn = !isOn;
        updateState(isOn);

        config.currentValue = isOn;

        if (config.id) emitUpdate(modTitle, config.id, isOn);
        if (config.onChange) config.onChange(isOn);

        var ownerConfig = AnitaCore.findRegisteredMod(modTitle);
        if (ownerConfig && AnitaRenderer.hasVisibilityDependents(ownerConfig, config.id)) {
          AnitaRenderer.refreshConditionalVisibility(ownerConfig);
        }
      });

      return row;
    },

    createStepper: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");
      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Value";
      lbl.AddClass("AnitaLabel");
      const controls = $.CreatePanel("Panel", row, "");
      controls.AddClass("AnitaStepperControls");
      const btnM = $.CreatePanel("Button", controls, "");
      btnM.AddClass("AnitaStepBtn");
      $.CreatePanel("Label", btnM, "less").text = "-";
      const input = $.CreatePanel("TextEntry", controls, "");
      input.AddClass("AnitaStepInput");
      const btnP = $.CreatePanel("Button", controls, "");
      btnP.AddClass("AnitaStepBtn");
      $.CreatePanel("Label", btnP, "").text = "+";

      let val = (config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || 0);
      const step = config.step || 1;
      const isFloat = !Number.isInteger(step);
      input.text = isFloat ? val.toFixed(2) : val;

      function update(newVal) {
        if (isFloat) newVal = parseFloat(newVal.toFixed(2)); else newVal = Math.round(newVal);
        val = newVal;
        config.currentValue = val;
        input.text = val.toString();
        if (config.onChange) config.onChange(val);
        if (config.id && modTitle) {
          emitUpdate(modTitle, config.id, val);
        }
      }

      input.SetPanelEvent("ontextentrychange", () => {
        let v = parseFloat(input.text);
        if (!isNaN(v)) {
          val = v;
          config.currentValue = v;
        }
      });

      input.SetPanelEvent("oncancel", () => {
        AnitaRenderer.toggle(false);
      });

      btnM.SetPanelEvent("onactivate", () => update(val - step));
      btnP.SetPanelEvent("onactivate", () => update(val + step));

      input.SetPanelEvent("oninputsubmit", () => {
        update(val);
        $.DispatchEvent("DropInputFocus", input);
        AnitaRenderer.mainWindow.SetFocus();
      });

      input.SetPanelEvent("onfocusout", () => {
        update(val);
      });

      return row;
    },

    createSlider: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");
      row.AddClass("AnitaSliderRow");
      row.style.width = "100%";

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Value";
      lbl.AddClass("AnitaLabel");

      const valueGroup = $.CreatePanel("Panel", row, "");
      valueGroup.AddClass("AnitaSliderValueGroup");
      valueGroup.AddClass("SliderValueGroup");
      valueGroup.style.flowChildren = "right";
      valueGroup.style.verticalAlign = "center";
      valueGroup.style.horizontalAlign = "left";
      valueGroup.style.width = "296px";

      const sliderContainer = $.CreatePanel("Panel", valueGroup, "");
      sliderContainer.AddClass("AnitaSliderContainer");
      sliderContainer.AddClass("SliderContainer");
      sliderContainer.style.width = "230px";
      sliderContainer.style.height = "26px";
      sliderContainer.style.padding = "0px";
      sliderContainer.style.verticalAlign = "center";
      sliderContainer.style.overflow = "noclip";

      const slider = $.CreatePanel("Slider", sliderContainer, "", { direction: "horizontal" });
      slider.AddClass("AnitaSlider");
      slider.AddClass("HorizontalSlider");
      slider.style.width = "100%";
      slider.style.height = "100%";
      slider.style.verticalAlign = "center";
      slider.style.overflow = "noclip";

      const valueLbl = $.CreatePanel("Label", valueGroup, "");
      valueLbl.AddClass("AnitaSliderValue");

      const rawMin = Number(config.min);
      const rawMax = Number(config.max);
      const rawStep = Number(config.step);
      const min = isFinite(rawMin) ? rawMin : 0;
      const max = isFinite(rawMax) ? rawMax : 100;
      const step = isFinite(rawStep) && rawStep > 0 ? rawStep : 1;

      let val = (config.currentValue !== undefined)
        ? config.currentValue
        : (config.defaultValue !== undefined ? config.defaultValue : min);
      let isSyncing = false;
      function normalize(nextVal) {
        let next = Number(nextVal);
        if (!isFinite(next)) next = Number(config.defaultValue);
        if (!isFinite(next)) next = min;
        if (next < min) next = min;
        if (next > max) next = max;
        if (Math.round(step) === step) {
          next = Math.round(next);
        } else {
          next = parseFloat(next.toFixed(2));
        }
        return next;
      }

      function syncVisuals(nextVal, emitUpdateEvent) {
        const normalized = normalize(nextVal);
        val = normalized;
        config.currentValue = normalized;
        valueLbl.text = normalized.toString() + "%";

        if (slider && slider.IsValid && slider.IsValid()) {
          if (Number(slider.value) !== normalized) {
            isSyncing = true;
            try {
              if (typeof slider.SetValueNoEvents === "function") {
                slider.SetValueNoEvents(normalized);
              } else {
                slider.value = normalized;
              }
            } finally {
              isSyncing = false;
            }
          }
        }

        if (emitUpdateEvent) {
          if (config.onChange) config.onChange(normalized);
          if (config.id && modTitle) {
            emitUpdateThrottled(modTitle, config.id, normalized, null, 0.04);
          }
        }
      }

      slider.min = min;
      slider.max = max;
      slider.increment = step;
      slider.value = normalize(val);

      if (typeof slider.SetShowDefaultValue === "function") {
        slider.SetShowDefaultValue(false);
      }
      if (typeof slider.SetRequiresSelection === "function") {
        slider.SetRequiresSelection(false);
      }

      syncVisuals(val, false);

      slider.SetPanelEvent("onvaluechanged", function () {
        if (isSyncing) return;
        syncVisuals(slider.value, true);
      });

      slider.SetPanelEvent("oncancel", () => {
        AnitaRenderer.toggle(false);
      });

      return row;
    },

    createButton: function (parent, config, modTitle) {
      const btn = $.CreatePanel("Button", parent, "");
      btn.AddClass("AnitaActionBtn");
      const lbl = $.CreatePanel("Label", btn, "");
      lbl.text = config.label || "Action";

      btn.SetPanelEvent("onactivate", () => {
        if (config.onClick) config.onClick();

        if (config.id && modTitle) {
          emitUpdate(modTitle, config.id, true);
        }

        btn.AddClass("Activated");
        $.Schedule(0.1, () => btn.RemoveClass("Activated"));
      });
      return btn;
    },

    createCycler: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Cycle";
      lbl.AddClass("AnitaLabel");

      const group = $.CreatePanel("Panel", row, "");
      group.AddClass("AnitaCyclerGroup");

      const options = config.options || ["OFF", "ON"];
      let idx = (config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || 0);
      if (idx < 0 || idx >= options.length) idx = 0;

      const btns = [];
      const updateVisuals = () => {
        for (let i = 0; i < btns.length; i++) {
          btns[i].SetHasClass("Active", i === idx);
        }
      };

      for (let i = 0; i < options.length; i++) {
        const btn = $.CreatePanel("Button", group, "");
        btn.AddClass("AnitaCyclerSegment");
        const valLbl = $.CreatePanel("Label", btn, "");
        valLbl.text = options[i];
        
        btn.SetPanelEvent("onactivate", () => {
          if (idx === i) return;
          idx = i;
          updateVisuals();
          config.currentValue = idx;
          var ownerConfig = AnitaCore.findRegisteredMod(modTitle);
          if (ownerConfig && AnitaRenderer.hasVisibilityDependents(ownerConfig, config.id)) {
            AnitaRenderer.refreshConditionalVisibility(ownerConfig);
          }
          if (config.id && modTitle) emitUpdate(modTitle, config.id, idx);
          if (config.onChange) config.onChange(idx, options[i]);
        });
        btns.push(btn);
      }

      updateVisuals();
      return row;
    },

    createColorPicker: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");
      row.AddClass("AnitaSliderRow");
      row.style.overflow = "noclip";
      row.style.width = "100%";

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Color";
      lbl.AddClass("AnitaLabel");

      let currentColor = normalizeHexColor((config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || "#FF0000"));
      let pickerBoxHue = 0;
      let pickerBoxSat = 1;
      let pickerBoxVal = 1;
      let colorPopupPanel = null;
      let colorBoxFrame = null;
      let colorBoxPanel = null;
      let colorBoxCursor = null;
      let colorPickerSyncing = false;
      let colorPickerPollGeneration = 0;
      let colorDragging = false;
      const hasGameUI = (typeof GameUI !== "undefined" && GameUI !== null);
      let colorDragAnchorX = -1;
      let colorDragAnchorY = -1;
      let colorDragSource = "";
      let nativeDragStartAnchorX = -1;
      let nativeDragStartAnchorY = -1;
      let nativeDragOffsetX = 0;
      let nativeDragOffsetY = 0;
      let nativeDragHasSample = false;
      let nativeDragAxis = "";
      let popupPreview = null;
      let popupHexLabel = null;
      let popupMetaLabel = null;
      let colorPreview = null;
      let rowHexLabel = null;
      let pickerHueSlider = null;
      let pickerSatSlider = null;
      let pickerSatTrack = null;
      let pickerHueValue = null;
      let pickerSatValue = null;
      let pickerValSlider = null;
      let pickerValValue = null;
      let pickerValTrack = null;
      let colorPreviewBtn = null;
      const COLOR_BOX_LOGICAL_WIDTH = 260;
      const COLOR_BOX_LOGICAL_HEIGHT = 200;
      const COLOR_BOX_CURSOR_LOGICAL_SIZE = 16;

      function debugPickerNode(tag, data, throttleMs) {
      }

      function debugPickerEvent(tag, eventName, throttleMs) {
      }

      function clampByte(value) {
        let next = Number(value);
        if (!isFinite(next)) next = 0;
        if (next < 0) next = 0;
        if (next > 255) next = 255;
        return Math.round(next);
      }

      function byteToHex(value) {
        const hex = clampByte(value).toString(16).toUpperCase();
        return hex.length < 2 ? "0" + hex : hex;
      }

      function rgbToHex(r, g, b) {
        return "#" + byteToHex(r) + byteToHex(g) + byteToHex(b);
      }

      function hexToRgbLocal(colorCode) {
        if (!colorCode) return [255, 255, 255];

        const text = String(colorCode).trim();
        if (text.charAt(0) === "#") {
          let hex = text.slice(1);
          if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
          }
          if (hex.length >= 6) {
            return [
              parseInt(hex.slice(0, 2), 16) || 0,
              parseInt(hex.slice(2, 4), 16) || 0,
              parseInt(hex.slice(4, 6), 16) || 0
            ];
          }
        }

        const match = text.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
        if (match) {
          return [
            clampByte(match[1]),
            clampByte(match[2]),
            clampByte(match[3])
          ];
        }

        return [255, 255, 255];
      }

      function hsvToRgb(h, s, v) {
        var hue = Number(h);
        var sat = Number(s);
        var val = Number(v);

        if (!isFinite(hue)) hue = 0;
        if (!isFinite(sat)) sat = 0;
        if (!isFinite(val)) val = 0;

        hue = ((hue % 360) + 360) % 360;
        sat = Math.max(0, Math.min(1, sat));
        val = Math.max(0, Math.min(1, val));

        var c = val * sat;
        var x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
        var m = val - c;
        var r = 0;
        var g = 0;
        var b = 0;

        if (hue < 60) {
          r = c; g = x; b = 0;
        } else if (hue < 120) {
          r = x; g = c; b = 0;
        } else if (hue < 180) {
          r = 0; g = c; b = x;
        } else if (hue < 240) {
          r = 0; g = x; b = c;
        } else if (hue < 300) {
          r = x; g = 0; b = c;
        } else {
          r = c; g = 0; b = x;
        }

        return [
          clampByte((r + m) * 255),
          clampByte((g + m) * 255),
          clampByte((b + m) * 255)
        ];
      }

      function hsvToHex(h, s, v) {
        var rgb = hsvToRgb(h, s, v);
        return rgbToHex(rgb[0], rgb[1], rgb[2]);
      }

      function rgbToHsv(r, g, b) {
        var red = clampByte(r) / 255;
        var green = clampByte(g) / 255;
        var blue = clampByte(b) / 255;
        var max = Math.max(red, green, blue);
        var min = Math.min(red, green, blue);
        var delta = max - min;
        var hue = 0;
        var sat = max === 0 ? 0 : delta / max;
        var val = max;

        if (delta !== 0) {
          if (max === red) {
            hue = 60 * (((green - blue) / delta) % 6);
          } else if (max === green) {
            hue = 60 * (((blue - red) / delta) + 2);
          } else {
            hue = 60 * (((red - green) / delta) + 4);
          }
        }

        if (hue < 0) hue += 360;
        return [hue, sat, val];
      }

      function clamp01(value) {
        var next = Number(value);
        if (!isFinite(next)) next = 0;
        if (next < 0) next = 0;
        if (next > 1) next = 1;
        return next;
      }

      function isValidPanel(panel) {
        return !!(panel && panel.IsValid && panel.IsValid());
      }

      function parsePoint(candidate) {
        if (!candidate) return null;

        if (typeof candidate.length === "number" && candidate.length >= 2) {
          var arrayX = Number(candidate[0]);
          var arrayY = Number(candidate[1]);
          if (isFinite(arrayX) && isFinite(arrayY)) {
            return { x: arrayX, y: arrayY };
          }
        }

        if (typeof candidate === "object") {
          var objectX = Number(candidate.x !== undefined ? candidate.x : candidate[0]);
          var objectY = Number(candidate.y !== undefined ? candidate.y : candidate[1]);
          if (isFinite(objectX) && isFinite(objectY)) {
            return { x: objectX, y: objectY };
          }
        }

        return null;
      }

      function getCursorPosition() {
        try {
          if (!hasGameUI || typeof GameUI.GetCursorPosition !== "function") return null;
          return parsePoint(GameUI.GetCursorPosition());
        } catch (e) {}
        return null;
      }

      function getPanelWindowPosition(panel) {
        if (!isValidPanel(panel)) return null;

        try {
          if (typeof panel.GetPositionWithinWindow === "function") {
            var point = parsePoint(panel.GetPositionWithinWindow());
            if (point) return point;
          }
        } catch (e) {}

        var left = Number(panel.actualxoffset || panel.actualx || 0);
        var top = Number(panel.actualyoffset || panel.actualy || 0);
        if (!isFinite(left)) left = 0;
        if (!isFinite(top)) top = 0;
        return { x: left, y: top };
      }

      function getPanelBounds(panel) {
        if (!isValidPanel(panel)) {
          return { left: 0, top: 0, width: 1, height: 1 };
        }

        var panelPos = getPanelWindowPosition(panel);
        var left = panelPos ? panelPos.x : Number(panel.actualxoffset || panel.actualx || 0);
        var top = panelPos ? panelPos.y : Number(panel.actualyoffset || panel.actualy || 0);
        var width = Number(panel.actuallayoutwidth || panel.contentwidth || panel.width || 1);
        var height = Number(panel.actuallayoutheight || panel.contentheight || panel.height || 1);

        if (!isFinite(left)) left = 0;
        if (!isFinite(top)) top = 0;
        if (!isFinite(width) || width <= 0) width = 1;
        if (!isFinite(height) || height <= 0) height = 1;

        return { left: left, top: top, width: width, height: height };
      }

      function getPanelLocalCursorPosition(panel) {
        if (!isValidPanel(panel)) return null;

        var bounds = getPanelBounds(panel);
        var panelPos = getPanelWindowPosition(panel);

        try {
          if (typeof panel.GetCursorPosition === "function") {
            var rawPoint = parsePoint(panel.GetCursorPosition());
            if (rawPoint) {
              var looksLocal =
                rawPoint.x >= 0 && rawPoint.x <= bounds.width &&
                rawPoint.y >= 0 && rawPoint.y <= bounds.height;

              if (looksLocal) {
                return rawPoint;
              }

              if (panelPos) {
                return {
                  x: rawPoint.x - panelPos.x,
                  y: rawPoint.y - panelPos.y
                };
              }

              return rawPoint;
            }
          }
        } catch (e) {}

        var screenCursor = getCursorPosition();
        if (!screenCursor || !panelPos) return null;

        return {
          x: screenCursor.x - panelPos.x,
          y: screenCursor.y - panelPos.y
        };
      }

      function getBoxStateFromColor(colorCode) {
        var rgb = hexToRgbLocal(colorCode);
        var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        return {
          hue: Math.round(hsv[0]) % 360,
          sat: clamp01(hsv[1]),
          val: clamp01(hsv[2])
        };
      }

      function normalizeBoxState(boxState, fallbackColorCode) {
        var fallback = getBoxStateFromColor(fallbackColorCode || currentColor);
        if (!boxState) {
          return fallback;
        }

        var hue = Number(boxState.hue);
        var sat = Number(boxState.sat);
        var val = (boxState.val !== undefined) ? Number(boxState.val) : pickerBoxVal;
        if (!isFinite(hue)) hue = fallback.hue;
        if (!isFinite(sat)) sat = fallback.sat;
        if (!isFinite(val)) val = (fallback.val !== undefined ? fallback.val : 1);

        hue = Math.round(hue) % 360;
        if (hue < 0) hue += 360;
        sat = clamp01(sat);
        val = clamp01(val);

        return { hue: hue, sat: sat, val: val };
      }

      function setPickerBoxState(boxState, fallbackColorCode) {
        var resolved = normalizeBoxState(boxState, fallbackColorCode);
        pickerBoxHue = resolved.hue;
        pickerBoxSat = resolved.sat;
        pickerBoxVal = resolved.val !== undefined ? resolved.val : pickerBoxVal;
        return resolved;
      }

      function colorFromBoxState(hue, sat) {
        return hsvToHex(hue, sat, pickerBoxVal);
      }

      function hueFromRelX(relX) {
        var normalized = clamp01(relX);
        return Math.max(0, Math.min(359, Math.round(normalized * 359)));
      }

      function hueToSliderPercent(hue) {
        var nextHue = Number(hue);
        if (!isFinite(nextHue)) nextHue = 0;
        nextHue = Math.max(0, Math.min(359, Math.round(nextHue)));
        return Math.round((nextHue / 359) * 100);
      }

      function normalizeHexColor(colorCode) {
        if (!colorCode) return "#FFFFFF";

        if (typeof colorCode === "number") {
          var packed = Math.max(0, Math.floor(colorCode));
          var packedHex = packed.toString(16).toUpperCase();
          while (packedHex.length < 6) packedHex = "0" + packedHex;
          return "#" + packedHex.slice(-6);
        }

        if (typeof colorCode === "string") {
          var text = String(colorCode).trim();
          if (!text) return "#FFFFFF";
          if (text.charAt(0) === "#") {
            var hex = text.slice(1);
            if (hex.length === 3) {
              hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            if (hex.length >= 6) {
              return "#" + hex.slice(0, 6).toUpperCase();
            }
          }

          var rgbMatch = text.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
          if (rgbMatch) {
            return rgbToHex(rgbMatch[1], rgbMatch[2], rgbMatch[3]).toUpperCase();
          }
        }

        if (typeof colorCode === "object") {
          if (colorCode.hex !== undefined) {
            return normalizeHexColor(colorCode.hex);
          }
          if (colorCode.h !== undefined && colorCode.s !== undefined && colorCode.v !== undefined) {
            return hsvToHex(colorCode.h, colorCode.s, colorCode.v);
          }
          if (colorCode.r !== undefined && colorCode.g !== undefined && colorCode.b !== undefined) {
            return rgbToHex(colorCode.r, colorCode.g, colorCode.b).toUpperCase();
          }
          if (colorCode.red !== undefined && colorCode.green !== undefined && colorCode.blue !== undefined) {
            return rgbToHex(colorCode.red, colorCode.green, colorCode.blue).toUpperCase();
          }
        }

        return "#FFFFFF";
      }

      function getColorBoxMetrics() {
        var refPanel = isValidPanel(colorBoxFrame) ? colorBoxFrame : colorBoxPanel;
        if (!isValidPanel(refPanel)) return null;

        var bounds = getPanelBounds(refPanel);
        var width = COLOR_BOX_LOGICAL_WIDTH;
        var height = COLOR_BOX_LOGICAL_HEIGHT;
        var cursorWidth = COLOR_BOX_CURSOR_LOGICAL_SIZE;
        var cursorHeight = COLOR_BOX_CURSOR_LOGICAL_SIZE;
        var screenWidth = Number(bounds.width || refPanel.actuallayoutwidth || width);
        var screenHeight = Number(bounds.height || refPanel.actuallayoutheight || height);

        if (!isFinite(width) || width <= 1) width = 260;
        if (!isFinite(height) || height <= 1) height = 200;
        if (!isFinite(cursorWidth) || cursorWidth <= 0) cursorWidth = 16;
        if (!isFinite(cursorHeight) || cursorHeight <= 0) cursorHeight = 16;
        if (!isFinite(screenWidth) || screenWidth <= 1) screenWidth = width;
        if (!isFinite(screenHeight) || screenHeight <= 1) screenHeight = height;

        return {
          panel: refPanel,
          bounds: { left: bounds.left, top: bounds.top, width: screenWidth, height: screenHeight },
          width: width,
          height: height,
          screenWidth: screenWidth,
          screenHeight: screenHeight,
          screenToLogicalX: width / screenWidth,
          screenToLogicalY: height / screenHeight,
          cursorWidth: cursorWidth,
          cursorHeight: cursorHeight,
          maxCursorX: Math.max(0, width - cursorWidth),
          maxCursorY: Math.max(0, height - cursorHeight)
        };
      }

      function clampColorBoxAnchor(metrics, cursorX, cursorY) {
        var nextX = Number(cursorX);
        var nextY = Number(cursorY);
        if (!isFinite(nextX)) nextX = 0;
        if (!isFinite(nextY)) nextY = 0;
        if (nextX < 0) nextX = 0;
        if (nextY < 0) nextY = 0;
        if (nextX > metrics.width) nextX = metrics.width;
        if (nextY > metrics.height) nextY = metrics.height;
        return { x: nextX, y: nextY };
      }

      function applyColorBoxCursorPosition(cursorX, cursorY) {
        if (!isValidPanel(colorBoxCursor)) return false;

        var metrics = getColorBoxMetrics();
        if (!metrics) return false;

        var point = clampColorBoxAnchor(metrics, cursorX, cursorY);
        colorDragAnchorX = point.x;
        colorDragAnchorY = point.y;

        var nextX = point.x - (metrics.cursorWidth * 0.5);
        var nextY = point.y - (metrics.cursorHeight * 0.5);
        if (nextX < 0) nextX = 0;
        if (nextY < 0) nextY = 0;
        if (nextX > metrics.maxCursorX) nextX = metrics.maxCursorX;
        if (nextY > metrics.maxCursorY) nextY = metrics.maxCursorY;

        colorBoxCursor.style.x = nextX + "px";
        colorBoxCursor.style.y = nextY + "px";
        colorBoxCursor.style.transform = "none";
        debugPickerNode("applyColorBoxCursorPosition", {
          source: colorDragSource || "visual",
          anchorX: Math.round(point.x),
          anchorY: Math.round(point.y),
          renderX: Math.round(nextX),
          renderY: Math.round(nextY),
          cursorW: Math.round(metrics.cursorWidth),
          cursorH: Math.round(metrics.cursorHeight),
          boxW: Math.round(metrics.width),
          boxH: Math.round(metrics.height)
        }, 80);
        return true;
      }

      function rememberColorDragAnchor(cursorX, cursorY) {
        var metrics = getColorBoxMetrics();
        if (!metrics) return false;

        var point = clampColorBoxAnchor(metrics, cursorX, cursorY);
        colorDragAnchorX = point.x;
        colorDragAnchorY = point.y;
        return true;
      }

      function syncFromAnchoredCursorPosition(emitUpdateEvent) {
        var metrics = getColorBoxMetrics();
        if (!metrics) return false;
        if (!isFinite(colorDragAnchorX) || !isFinite(colorDragAnchorY) ||
            colorDragAnchorX < 0 || colorDragAnchorY < 0) {
          return false;
        }

        var point = clampColorBoxAnchor(metrics, colorDragAnchorX, colorDragAnchorY);
        var relX = metrics.width > 0 ? clamp01(point.x / metrics.width) : 0;
        var relY = metrics.height > 0 ? clamp01(point.y / metrics.height) : 0;
        var hue = hueFromRelX(relX);
        var sat = clamp01(relY);

        applyColorBoxCursorPosition(point.x, point.y);
        syncColorVisuals(colorFromBoxState(hue, sat), emitUpdateEvent, false, { hue: hue, sat: sat });
        return true;
      }

      function getCursorPositionWithinColorBox(updateAnchor) {
        if (!isValidPanel(colorBoxCursor)) return null;

        var metrics = getColorBoxMetrics();
        if (!metrics) return null;

        var cursorBounds = getPanelBounds(colorBoxCursor);
        var point = clampColorBoxAnchor(
          metrics,
          ((cursorBounds.left - metrics.bounds.left) * metrics.screenToLogicalX) + (metrics.cursorWidth * 0.5),
          ((cursorBounds.top - metrics.bounds.top) * metrics.screenToLogicalY) + (metrics.cursorHeight * 0.5)
        );
        if (updateAnchor !== false) rememberColorDragAnchor(point.x, point.y);

        return {
          metrics: metrics,
          x: point.x,
          y: point.y
        };
      }

      function updateBoxCursorVisual(colorCode) {
        if (!colorBoxPanel || !colorBoxPanel.IsValid || !colorBoxPanel.IsValid()) return;

        var metrics = getColorBoxMetrics();
        if (!metrics) return;

        if (!isFinite(pickerBoxHue) || !isFinite(pickerBoxSat)) {
          setPickerBoxState(null, colorCode);
        }

        var cursorX = metrics.width > 0 ? (pickerBoxHue / 359) * metrics.width : 0;
        var cursorY = metrics.height > 0 ? pickerBoxSat * metrics.height : 0;
        applyColorBoxCursorPosition(cursorX, cursorY);

        if (colorCode && isValidPanel(colorBoxCursor)) {
          var rgb = hexToRgbLocal(colorCode);
          var invR = 255 - (rgb[0] || 0);
          var invG = 255 - (rgb[1] || 0);
          var invB = 255 - (rgb[2] || 0);
          if (Math.abs(invR - 128) < 40 && Math.abs(invG - 128) < 40 && Math.abs(invB - 128) < 40) {
            var luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
            invR = invG = invB = luma > 128 ? 0 : 255;
          }
          colorBoxCursor.style.borderColor = "rgb(" + invR + "," + invG + "," + invB + ")";
        }
      }

      function syncFromCursorPanelPosition(emitUpdateEvent) {
        if (!isValidPanel(colorBoxPanel) || !isValidPanel(colorBoxCursor)) return false;

        var cursorPosition = getCursorPositionWithinColorBox();
        if (!cursorPosition) return false;

        const metrics = cursorPosition.metrics;
        const relX = metrics.width > 0 ? clamp01(cursorPosition.x / metrics.width) : 0;
        const relY = metrics.height > 0 ? clamp01(cursorPosition.y / metrics.height) : 0;
        const hue = hueFromRelX(relX);
        const sat = clamp01(relY);

        debugPickerNode("syncFromCursorPanelPosition", {
          emit: !!emitUpdateEvent,
          source: colorDragSource || "cursor_panel",
          centerX: Math.round(cursorPosition.x),
          centerY: Math.round(cursorPosition.y),
          relX: Number(relX.toFixed(3)),
          relY: Number(relY.toFixed(3)),
          hue: hue,
          sat: Number(sat.toFixed(3))
        }, 80);
        syncColorVisuals(colorFromBoxState(hue, sat), emitUpdateEvent, false, { hue: hue, sat: sat });
        return true;
      }

      function resetNativeDragCorrection() {
        nativeDragStartAnchorX = colorDragAnchorX;
        nativeDragStartAnchorY = colorDragAnchorY;
        nativeDragOffsetX = 0;
        nativeDragOffsetY = 0;
        nativeDragHasSample = false;
        nativeDragAxis = "";
      }

      function clearNativeDragCorrection() {
        nativeDragStartAnchorX = -1;
        nativeDragStartAnchorY = -1;
        nativeDragOffsetX = 0;
        nativeDragOffsetY = 0;
        nativeDragHasSample = false;
        nativeDragAxis = "";
      }

      function syncFromNativeDragPanelPosition(emitUpdateEvent) {
        if (!isValidPanel(colorBoxPanel) || !isValidPanel(colorBoxCursor)) return false;

        var cursorPosition = getCursorPositionWithinColorBox(false);
        if (!cursorPosition) return false;

        var startX = isFinite(nativeDragStartAnchorX) && nativeDragStartAnchorX >= 0 ? nativeDragStartAnchorX : colorDragAnchorX;
        var startY = isFinite(nativeDragStartAnchorY) && nativeDragStartAnchorY >= 0 ? nativeDragStartAnchorY : colorDragAnchorY;
        if (!nativeDragHasSample) {
          nativeDragHasSample = true;
          var deltaX = isFinite(startX) && startX >= 0 ? cursorPosition.x - startX : 0;
          var deltaY = isFinite(startY) && startY >= 0 ? cursorPosition.y - startY : 0;
          nativeDragOffsetX = deltaX;
          nativeDragOffsetY = deltaY;
          nativeDragAxis = "first_sample_anchor";
        }

        var correctedX = cursorPosition.x - nativeDragOffsetX;
        var correctedY = cursorPosition.y - nativeDragOffsetY;
        debugPickerNode("syncFromNativeDragPanelPosition", {
          emit: !!emitUpdateEvent,
          rawX: Math.round(cursorPosition.x),
          rawY: Math.round(cursorPosition.y),
          correctedX: Math.round(correctedX),
          correctedY: Math.round(correctedY),
          startX: Math.round(startX),
          startY: Math.round(startY),
          offsetX: Math.round(nativeDragOffsetX),
          offsetY: Math.round(nativeDragOffsetY),
          axis: nativeDragAxis
        }, 80);
        return syncFromBoxPosition(correctedX, correctedY, emitUpdateEvent);
      }

      function syncFromBoxPosition(boxX, boxY, emitUpdateEvent) {
        if (!isValidPanel(colorBoxPanel)) return false;

        const metrics = getColorBoxMetrics();
        if (!metrics) return false;
        const point = clampColorBoxAnchor(metrics, boxX, boxY);
        rememberColorDragAnchor(point.x, point.y);

        const relX = metrics.width > 0 ? clamp01(point.x / metrics.width) : 0;
        const relY = metrics.height > 0 ? clamp01(point.y / metrics.height) : 0;
        const hue = hueFromRelX(relX);
        const sat = clamp01(relY);
        debugPickerNode("syncFromBoxPosition", {
          emit: !!emitUpdateEvent,
          source: colorDragSource || "box",
          boxX: Math.round(point.x),
          boxY: Math.round(point.y),
          relX: Number(relX.toFixed(3)),
          relY: Number(relY.toFixed(3)),
          hue: hue,
          sat: Number(sat.toFixed(3))
        }, 80);
        syncColorVisuals(colorFromBoxState(hue, sat), emitUpdateEvent, false, { hue: hue, sat: sat });
        return true;
      }

      function syncPickerFromPointer(emitUpdateEvent) {
        var metrics = getColorBoxMetrics();
        if (!metrics) {
          debugPickerNode("syncPickerFromPointer.fail", {
            reason: "no_metrics",
            emit: !!emitUpdateEvent,
            source: colorDragSource || "pointer"
          }, 80);
          return false;
        }

        var point = null;
        var via = "";
        if (hasGameUI) {
          var screenCursor = getCursorPosition();
          if (screenCursor) {
            point = {
              x: (screenCursor.x - metrics.bounds.left) * metrics.screenToLogicalX,
              y: (screenCursor.y - metrics.bounds.top) * metrics.screenToLogicalY
            };
            via = "screen_cursor";
          } else {
            debugPickerNode("syncPickerFromPointer.fail", {
              reason: "no_screen_cursor",
              emit: !!emitUpdateEvent,
              source: colorDragSource || "pointer"
            }, 80);
          }
        }

        if (!point) {
          point = getPanelLocalCursorPosition(colorBoxFrame);
          if (point) via = "frame_local";
        }
        if (!point) {
          point = getPanelLocalCursorPosition(colorBoxPanel);
          if (point) via = "box_local";
        }
        if (!point) {
          debugPickerNode("syncPickerFromPointer.fail", {
            reason: "no_local_cursor",
            emit: !!emitUpdateEvent,
            source: colorDragSource || "pointer"
          }, 80);
          return false;
        }

        debugPickerNode("syncPickerFromPointer", {
          emit: !!emitUpdateEvent,
          source: colorDragSource || "pointer",
          pointX: Math.round(point.x),
          pointY: Math.round(point.y),
          via: via
        }, 80);
        return syncFromBoxPosition(point.x, point.y, emitUpdateEvent);
      }

      function syncFromScreenCursorPosition(emitUpdateEvent) {
        var cursor = getCursorPosition();
        if (!cursor || !isValidPanel(colorBoxPanel)) return false;

        const metrics = getColorBoxMetrics();
        if (!metrics) return false;
        return syncFromBoxPosition(
          (cursor.x - metrics.bounds.left) * metrics.screenToLogicalX,
          (cursor.y - metrics.bounds.top) * metrics.screenToLogicalY,
          emitUpdateEvent
        );
      }

      function syncFromLocalBoxCursor(emitUpdateEvent) {
        var localPoint = getPanelLocalCursorPosition(colorBoxPanel);
        if (!localPoint) return false;
        return syncFromBoxPosition(localPoint.x, localPoint.y, emitUpdateEvent);
      }

      function syncFromBestDragSource(emitUpdateEvent) {
        var chosen = "";
        if ((colorDragSource === "cursor" || colorDragSource === "drag_event" ||
            colorDragSource === "box" || colorDragSource === "gameui") &&
            syncPickerFromPointer(emitUpdateEvent)) {
          chosen = hasGameUI ? "screen_cursor" : "panel_pointer";
        }
        if (!hasGameUI) {
          if (!chosen && colorDragSource === "drag_event" &&
              syncFromNativeDragPanelPosition(emitUpdateEvent)) chosen = "native_drag_panel";
          else if (!chosen && (colorDragSource === "cursor" || colorDragSource === "cursor_down") &&
              syncFromLocalBoxCursor(emitUpdateEvent)) chosen = "panel_cursor";
          else if (!chosen && syncFromLocalBoxCursor(emitUpdateEvent)) chosen = "panel_cursor";
          else if (!chosen && syncFromAnchoredCursorPosition(emitUpdateEvent)) chosen = "anchored";
          else if (!chosen && syncFromCursorPanelPosition(emitUpdateEvent)) chosen = "cursor_panel";
          debugPickerNode("syncFromBestDragSource", {
            emit: !!emitUpdateEvent,
            dragSource: colorDragSource || "",
            chosen: chosen
          }, 80);
          return chosen;
        }

        if (!chosen && (colorDragSource === "cursor" || colorDragSource === "drag_event" ||
            colorDragSource === "box" || colorDragSource === "gameui") &&
            syncPickerFromPointer(emitUpdateEvent)) chosen = "screen_cursor";
        else if (!chosen && (colorDragSource === "box" || colorDragSource === "gameui") &&
            syncFromScreenCursorPosition(emitUpdateEvent)) chosen = "screen_cursor";
        else if (!chosen && syncFromLocalBoxCursor(emitUpdateEvent)) chosen = "panel_cursor";
        else if (!chosen && syncFromAnchoredCursorPosition(emitUpdateEvent)) chosen = "anchored";
        else if (!chosen && syncFromScreenCursorPosition(emitUpdateEvent)) chosen = "screen_cursor";
        else if (!chosen && syncFromCursorPanelPosition(emitUpdateEvent)) chosen = "drag_panel";
        debugPickerNode("syncFromBestDragSource", {
          emit: !!emitUpdateEvent,
          dragSource: colorDragSource || "",
          chosen: chosen
        }, 80);
        return chosen;
      }

      function setMouseCaptureState(active) {
        var next = !!active;
        var boxCapture = "skip";
        var cursorCapture = "skip";
        if (isValidPanel(colorBoxPanel) && typeof colorBoxPanel.SetMouseCapture === "function") {
          try {
            colorBoxPanel.SetMouseCapture(next);
            boxCapture = "ok";
          } catch (e) {
            boxCapture = "fail";
          }
        }
        if (hasGameUI && isValidPanel(colorBoxCursor) && typeof colorBoxCursor.SetMouseCapture === "function") {
          try {
            colorBoxCursor.SetMouseCapture(next);
            cursorCapture = "ok";
          } catch (e) {
            cursorCapture = "fail";
          }
        }
        debugPickerNode("setMouseCaptureState", {
          active: next,
          box: boxCapture,
          cursor: cursorCapture
        }, 0);
      }

      function beginColorDrag(sourceName, emitUpdateEvent) {
        colorDragging = true;
        colorDragSource = String(sourceName || "");
        if (colorDragSource === "drag_event") resetNativeDragCorrection();
        else clearNativeDragCorrection();
        debugPickerNode("beginColorDrag", {
          source: colorDragSource,
          emit: !!emitUpdateEvent,
          anchorX: Math.round(colorDragAnchorX),
          anchorY: Math.round(colorDragAnchorY)
        }, 0);
        var usesCursorDrag = (colorDragSource === "cursor" || colorDragSource === "drag_event");
        if (!syncPickerFromPointer(false) && !usesCursorDrag && !syncFromCursorPanelPosition(false)) {
          updateBoxCursorVisual(currentColor);
        }
        if (emitUpdateEvent) {
          if (usesCursorDrag) {
            if (!syncPickerFromPointer(true)) {
              syncFromBestDragSource(true);
            }
          } else if (!syncFromScreenCursorPosition(true) && !syncFromLocalBoxCursor(true)) {
            syncFromCursorPanelPosition(true);
          }
        }
        setMouseCaptureState(true);
        startPickerPolling();
      }

      function endColorDrag() {
        if (!colorDragging && !colorDragSource) return;
        debugPickerNode("endColorDrag", {
          source: colorDragSource || "",
          anchorX: Math.round(colorDragAnchorX),
          anchorY: Math.round(colorDragAnchorY)
        }, 0);
        colorDragging = false;
        colorDragSource = "";
        clearNativeDragCorrection();
        setMouseCaptureState(false);
        if (config.id && modTitle) emitUpdate(modTitle, config.id, currentColor);
      }

      function stopPickerPolling() {
        colorPickerPollGeneration++;
      }

      function startPickerPolling() {
        if (!colorPopupPanel || !colorPopupPanel.IsValid || !colorPopupPanel.IsValid()) return;

        const generation = ++colorPickerPollGeneration;
        function tick() {
          if (generation !== colorPickerPollGeneration) return;
          if (!colorPopupPanel || !colorPopupPanel.IsValid || !colorPopupPanel.IsValid()) return;

          if (colorDragging) {
            syncFromBestDragSource(true);
            $.Schedule(0.016, tick);
          }
        }

        if (colorDragging) $.Schedule(0.016, tick);
      }

      function syncFromCursorPosition(emitUpdateEvent) {
        if (!syncPickerFromPointer(emitUpdateEvent)) syncFromAnchoredCursorPosition(emitUpdateEvent);
      }

      function closePalette() {
        stopPickerPolling();
        endColorDrag();

        if (hasGameUI && typeof GameUI.SetMouseCallback === "function") {
          try {
            GameUI.SetMouseCallback(null);
          } catch (e) {}
        }

        if (colorPopupPanel && colorPopupPanel.IsValid && colorPopupPanel.IsValid()) {
          colorPopupPanel.DeleteAsync(0);
        }

        colorPopupPanel = null;
        colorBoxFrame = null;
        colorBoxPanel = null;
        colorBoxCursor = null;
        popupPreview = null;
        popupHexLabel = null;
        popupMetaLabel = null;
        colorPickerSyncing = false;
        pickerHueSlider = null;
        pickerSatSlider = null;
        pickerSatTrack = null;
        pickerHueValue = null;
        pickerSatValue = null;
        pickerValSlider = null;
        pickerValValue = null;
        pickerValTrack = null;
        colorDragSource = "";
        if (AnitaRenderer.activeColorPickerClose === closePalette) {
          AnitaRenderer.activeColorPickerClose = null;
        }
      }

      function syncColorVisuals(colorCode, emitUpdateEvent, closeAfter, boxState) {
        var nextColor = normalizeHexColor(colorCode);
        if (nextColor === currentColor && !boxState) {
          if (emitUpdateEvent) {
            if (config.id && modTitle) {
              if (colorDragging) emitUpdateThrottled(modTitle, config.id, currentColor, null, 0.04);
              else emitUpdate(modTitle, config.id, currentColor);
            }
            if (config.onChange) config.onChange(currentColor);
          }
          if (closeAfter) closePalette();
          return;
        }
        currentColor = nextColor;
        config.currentValue = currentColor;
        var pickerState = setPickerBoxState(boxState, currentColor);

        if (colorPreview && colorPreview.IsValid && colorPreview.IsValid()) {
          colorPreview.style.backgroundColor = currentColor;
        }

        if (rowHexLabel) {
          rowHexLabel.text = currentColor;
        }

        if (popupPreview && popupPreview.IsValid && popupPreview.IsValid()) {
          popupPreview.style.backgroundColor = currentColor;
        }

        if (popupHexLabel) {
          popupHexLabel.text = currentColor;
        }

        if (popupMetaLabel) {
          popupMetaLabel.text = "Hue " + pickerState.hue + "\u00B0 | Sat " + Math.round(pickerState.sat * 100) + "% | Val " + Math.round(pickerBoxVal * 100) + "%";
        }

        if (!colorPreviewBtn || !colorPreviewBtn.IsValid()) {
          colorPreviewBtn = row.FindChildTraverse("ColorPreviewBtn");
        }
        if (colorPreviewBtn) colorPreviewBtn.style.backgroundColor = currentColor;

        updateBoxCursorVisual(currentColor);

        colorPickerSyncing = true;
        try {
          if (pickerHueSlider && pickerHueSlider.IsValid && pickerHueSlider.IsValid()) {
            var hueSliderPct = hueToSliderPercent(pickerState.hue);
            if (Math.round(Number(pickerHueSlider.value)) !== hueSliderPct) {
              try {
                pickerHueSlider.value = hueSliderPct;
              } catch (e) {}
            }
            if (pickerHueValue) pickerHueValue.text = pickerState.hue + "\u00B0";
          }
          if (pickerSatSlider && pickerSatSlider.IsValid && pickerSatSlider.IsValid()) {
            var satPct = Math.round(pickerState.sat * 100);
            if (Math.round(Number(pickerSatSlider.value)) !== satPct) {
              try {
                pickerSatSlider.value = satPct;
              } catch (e) {}
            }
            if (pickerSatValue) pickerSatValue.text = satPct + "%";
            if (pickerSatTrack && pickerSatTrack.IsValid && pickerSatTrack.IsValid()) {
              pickerSatTrack.style.backgroundColor = "gradient( linear, 0% 0%, 100% 0%, from( #ffffff ), to( " + hsvToHex(pickerState.hue, 1, 1) + " ) )";
            }
          }
          if (pickerValSlider && pickerValSlider.IsValid && pickerValSlider.IsValid()) {
            var valPct = Math.round(pickerBoxVal * 100);
            if (Math.round(Number(pickerValSlider.value)) !== valPct) {
              try {
                pickerValSlider.value = valPct;
              } catch (e) {}
            }
            if (pickerValValue) pickerValValue.text = valPct + "%";
            if (pickerValTrack && pickerValTrack.IsValid && pickerValTrack.IsValid()) {
              pickerValTrack.style.backgroundColor = "gradient( linear, 0% 0%, 100% 0%, from( #000000 ), to( " + hsvToHex(pickerState.hue, pickerState.sat, 1) + " ) )";
            }
          }
        } finally {
          colorPickerSyncing = false;
        }

        if (emitUpdateEvent) {
          if (config.id && modTitle) {
            if (colorDragging) emitUpdateThrottled(modTitle, config.id, currentColor, null, 0.04);
            else emitUpdate(modTitle, config.id, currentColor);
          }
          if (config.onChange) config.onChange(currentColor);
        }

        if (closeAfter) closePalette();
      }

      function openPalette() {
        if (colorPopupPanel) {
          closePalette();
          return;
        }

        if (AnitaRenderer.activeColorPickerClose &&
            AnitaRenderer.activeColorPickerClose !== closePalette) {
          try {
            AnitaRenderer.activeColorPickerClose();
          } catch (closeErr) {
          }
        }

        var trueRoot = (isValidPanel(AnitaRenderer.mainWindow) && AnitaRenderer.mainWindow.GetParent) ? AnitaRenderer.mainWindow.GetParent() : $.GetContextPanel();
        if (!isValidPanel(trueRoot)) trueRoot = $.GetContextPanel();

        if (!isValidPanel(AnitaRenderer.popupHost) || AnitaRenderer.popupHost.GetParent() !== trueRoot) {
          if (isValidPanel(AnitaRenderer.popupHost)) {
            AnitaRenderer.popupHost.DeleteAsync(0);
          }
          AnitaRenderer.popupHost = $.CreatePanel("Panel", trueRoot, "AnitaUI_PopupHost");
          AnitaRenderer.popupHost.AddClass("AnitaPopupHost");
        }

        var colorPopupParent = isValidPanel(AnitaRenderer.popupHost) ? AnitaRenderer.popupHost : trueRoot;
        colorPopupParent.style.align = "left top";
        colorPopupParent.style.ignoreParentFlow = true;
        colorPopupParent.style.flowChildren = "none";
        colorPopupParent.style.overflow = "noclip";
        colorPopupParent.style.zIndex = "10050";
        colorPopupParent.hittest = false;
        colorPopupParent.hittestchildren = true;
        colorPopupParent.style.x = "0px";
        colorPopupParent.style.y = "0px";
        colorPopupParent.style.width = "100%";
        colorPopupParent.style.height = "100%";

        colorPopupPanel = $.CreatePanel("Panel", colorPopupParent, "");
        AnitaRenderer.activeColorPickerClose = closePalette;
        colorPopupPanel.AddClass("AnitaColorPopup");
        colorPopupPanel.style.align = "left top";
        colorPopupPanel.style.flowChildren = "down";
        colorPopupPanel.style.ignoreParentFlow = true;
        colorPopupPanel.style.transform = "none";
        colorPopupPanel.style.x = "0px";
        colorPopupPanel.style.y = "0px";
        colorPopupPanel.style.position = "-200% -200% 0px";
        colorPopupPanel.style.opacity = "0";
        colorPopupPanel.hittest = true;
        colorPopupPanel.hittestchildren = true;

        function positionColorPopup(attempt) {
          attempt = attempt || 0;
          try {
            var anchor = isValidPanel(preview) ? preview : parent;
            if (!isValidPanel(anchor) || !isValidPanel(colorPopupPanel) || !isValidPanel(colorPopupParent)) {
              return;
            }

            function getCumulativeOffset(panel) {
              var x = 0;
              var y = 0;
              var p = panel;
              while (p && p.IsValid && p.IsValid()) {
                x += Number(p.actualxoffset || 0);
                y += Number(p.actualyoffset || 0);
                p = p.GetParent ? p.GetParent() : null;
              }
              return { x: x, y: y };
            }

            var anchorOffset = getCumulativeOffset(anchor);
            var hostOffset = getCumulativeOffset(colorPopupParent);
            var relX = anchorOffset.x - hostOffset.x;
            var relY = anchorOffset.y - hostOffset.y;
            var anchorW = Number(anchor.actuallayoutwidth || anchor.contentwidth || 0);
            var anchorH = Number(anchor.actuallayoutheight || anchor.contentheight || 0);
            var popupW = Number(colorPopupPanel.actuallayoutwidth || colorPopupPanel.contentwidth || 0);
            var popupH = Number(colorPopupPanel.actuallayoutheight || colorPopupPanel.contentheight || 0);
            var hostW = Number(colorPopupParent.actuallayoutwidth || colorPopupParent.contentwidth || trueRoot.actuallayoutwidth || trueRoot.contentwidth || 0);
            var hostH = Number(colorPopupParent.actuallayoutheight || colorPopupParent.contentheight || trueRoot.actuallayoutheight || trueRoot.contentheight || 0);

            if ((hostW <= 1 || hostH <= 1 || anchorW <= 1 || anchorH <= 1 || popupW <= 1 || popupH <= 1) && attempt < 3) {
              $.Schedule(0.03, function () { positionColorPopup(attempt + 1); });
              return;
            }

            if (hostW <= 1) hostW = 2560;
            if (hostH <= 1) hostH = 1440;
            if (anchorW <= 1) anchorW = 40;
            if (anchorH <= 1) anchorH = 40;
            if (popupW <= 1) popupW = 300;
            if (popupH <= 1) popupH = 420;

            var gapPct = 0.5;
            var edgePct = 0.5;
            var popupWPct = (popupW / hostW) * 100;
            var popupHPct = (popupH / hostH) * 100;
            var xPct = ((relX + anchorW) / hostW) * 100 + gapPct;
            if (xPct + popupWPct > 100 - edgePct) {
              xPct = ((relX - popupW) / hostW) * 100 - gapPct;
            }
            xPct = Math.max(edgePct, Math.min(xPct, 100 - popupWPct - edgePct));

            var yPct = ((relY + anchorH * 0.5 - popupH * 0.5) / hostH) * 100;
            yPct = Math.max(edgePct, Math.min(yPct, 100 - popupHPct - edgePct));

            colorPopupPanel.style.position = xPct.toFixed(2) + "% " + yPct.toFixed(2) + "% 0px";
            colorPopupPanel.style.opacity = "1";
          } catch (e) {
            colorPopupPanel.style.opacity = "1";
          }
        }

        colorPopupPanel.SetPanelEvent("oncancel", closePalette);

        const header = $.CreatePanel("Panel", colorPopupPanel, "");
        header.AddClass("AnitaColorPopupHeader");

        popupPreview = $.CreatePanel("Panel", header, "ColorPreviewBtn");
        popupPreview.AddClass("AnitaColorPickerPreview");
        popupPreview.AddClass("AnitaColorPopupPreview");
        popupPreview.style.backgroundColor = currentColor;

        popupHexLabel = $.CreatePanel("Label", header, "");
        popupHexLabel.AddClass("AnitaColorPopupHex");
        popupHexLabel.text = currentColor;

        popupMetaLabel = $.CreatePanel("Label", colorPopupPanel, "");
        popupMetaLabel.AddClass("AnitaColorPopupMeta");

        const hint = $.CreatePanel("Label", colorPopupPanel, "");
        hint.AddClass("AnitaColorPopupHint");
        hint.text = "Drag the marker or use the sliders below to change hue and saturation.";

        const boxWrap = $.CreatePanel("Panel", colorPopupPanel, "");
        boxWrap.AddClass("AnitaColorBoxWrap");

        colorBoxFrame = $.CreatePanel("Panel", boxWrap, "");
        colorBoxFrame.AddClass("AnitaColorBoxFrame");

        const boxHueLayer = $.CreatePanel("Panel", colorBoxFrame, "");
        boxHueLayer.AddClass("AnitaColorBoxHueLayer");

        const boxSaturationLayer = $.CreatePanel("Panel", colorBoxFrame, "");
        boxSaturationLayer.AddClass("AnitaColorBoxSaturationLayer");

        colorBoxPanel = $.CreatePanel("Panel", colorBoxFrame, "");
        colorBoxPanel.AddClass("AnitaColorBox");
        colorBoxPanel.hittest = true;
        colorBoxPanel.hittestchildren = true;
        colorBoxPanel.style.ignoreParentFlow = true;
        colorBoxPanel.style.width = "100%";
        colorBoxPanel.style.height = "100%";
        colorBoxPanel.SetPanelEvent("onmouseactivate", function () {
          debugPickerEvent("event.colorBoxPanel", "onmouseactivate", 0);
          if (!hasGameUI) {
            try {
              var movePt = getPanelLocalCursorPosition(colorBoxPanel);
              if (movePt) {
                syncFromBoxPosition(movePt.x, movePt.y, true);
              }
            } catch (e) {}
            return;
          }
          beginColorDrag("box", true);
        });
        colorBoxPanel.SetPanelEvent("onactivate", function () {
          debugPickerEvent("event.colorBoxPanel", "onactivate", 0);
          if (!hasGameUI) return;
          beginColorDrag("box", true);
        });
        colorBoxPanel.SetPanelEvent("onmousedown", function () {
          debugPickerEvent("event.colorBoxPanel", "onmousedown", 0);
          if (hasGameUI) beginColorDrag("box_down", true);
        });
        colorBoxPanel.SetPanelEvent("onmousemove", function () {
          debugPickerEvent("event.colorBoxPanel", "onmousemove", 120);
          if (!colorDragging) return;
          if (!hasGameUI) {
            if (!syncPickerFromPointer(true)) {
              var movePt = getPanelLocalCursorPosition(colorBoxPanel);
              if (movePt) syncFromBoxPosition(movePt.x, movePt.y, true);
            }
            return;
          }
          if (!syncPickerFromPointer(true)) syncFromBestDragSource(true);
        });
        colorBoxPanel.SetPanelEvent("onmouseup", function () {
          debugPickerEvent("event.colorBoxPanel", "onmouseup", 0);
          endColorDrag();
        });
        colorBoxPanel.SetPanelEvent("onmouseover", function () {
          debugPickerEvent("event.colorBoxPanel", "onmouseover", 120);
        });
        colorBoxPanel.SetPanelEvent("onmouseout", function () {
          debugPickerEvent("event.colorBoxPanel", "onmouseout", 0);
          if (!colorDragging || hasGameUI || colorDragSource === "drag_event") return;
          endColorDrag();
        });

        colorBoxCursor = $.CreatePanel("Button", colorBoxFrame, "");
        colorBoxCursor.AddClass("AnitaColorBoxCursor");
        colorBoxCursor.hittest = true;
        colorBoxCursor.hittestchildren = false;
        colorBoxCursor.style.ignoreParentFlow = true;
        colorBoxCursor.style.align = "left top";
        colorBoxCursor.style.visibility = "visible";
        colorBoxCursor.style.opacity = "1";
        if (typeof colorBoxCursor.SetDraggable === "function") {
          try {
            colorBoxCursor.SetDraggable(!hasGameUI);
          } catch (e) {}
        }
        if (typeof colorBoxCursor.SetDisableFocusOnMouseDown === "function") {
          try {
            colorBoxCursor.SetDisableFocusOnMouseDown(true);
          } catch (e) {}
        }
        colorBoxCursor.SetPanelEvent("onmouseactivate", function () {
          debugPickerEvent("event.colorBoxCursor", "onmouseactivate", 0);
          beginColorDrag("cursor", true);
        });
        colorBoxCursor.SetPanelEvent("onactivate", function () {
          debugPickerEvent("event.colorBoxCursor", "onactivate", 0);
          beginColorDrag("cursor", true);
        });
        colorBoxCursor.SetPanelEvent("onmousedown", function () {
          debugPickerEvent("event.colorBoxCursor", "onmousedown", 0);
          if (hasGameUI) beginColorDrag("cursor_down", true);
        });
        colorBoxCursor.SetPanelEvent("onmousemove", function () {
          debugPickerEvent("event.colorBoxCursor", "onmousemove", 120);
          if (!colorDragging) return;
          if (!syncPickerFromPointer(true)) syncFromBestDragSource(true);
        });
        colorBoxCursor.SetPanelEvent("onmouseup", function () {
          debugPickerEvent("event.colorBoxCursor", "onmouseup", 0);
          endColorDrag();
        });
        colorBoxCursor.SetPanelEvent("onmouseover", function () {
          debugPickerEvent("event.colorBoxCursor", "onmouseover", 120);
        });
        colorBoxCursor.SetPanelEvent("onmouseout", function () {
          debugPickerEvent("event.colorBoxCursor", "onmouseout", 0);
          if (!colorDragging || hasGameUI || colorDragSource === "drag_event") return;
          endColorDrag();
        });

        if (!hasGameUI && typeof $.RegisterEventHandler === "function") {
          try {
            $.RegisterEventHandler("DragStart", colorBoxCursor, function (panel, dragEvent) {
              if (!panel || panel !== colorBoxCursor) return;
              debugPickerEvent("event.colorBoxCursor", "DragStart", 0);
              if (dragEvent) {
                dragEvent.displayPanel = colorBoxCursor;
                dragEvent.removePositionBeforeDrop = false;
              }
              colorBoxCursor.style.align = "left top";
              beginColorDrag("drag_event", false);
            });
          } catch (dragStartError) {
          }

          try {
            $.RegisterEventHandler("DragEnd", colorBoxCursor, function (_panel, droppedPanel) {
              debugPickerEvent("event.colorBoxCursor", "DragEnd", 0);
              if (droppedPanel && droppedPanel.IsValid && droppedPanel.IsValid() && droppedPanel === colorBoxCursor) {
                if (colorBoxFrame && colorBoxFrame.IsValid && colorBoxFrame.IsValid() &&
                    droppedPanel.GetParent && droppedPanel.GetParent() !== colorBoxFrame) {
                  droppedPanel.SetParent(colorBoxFrame);
                }
                droppedPanel.style.align = "left top";
                syncFromAnchoredCursorPosition(true);
              }
              endColorDrag();
            });
          } catch (dragEndError) {
          }
        }

        if (hasGameUI && typeof GameUI.SetMouseCallback === "function") {
          try {
            GameUI.SetMouseCallback(function (eventName, arg) {
              debugPickerEvent("GameUI.SetMouseCallback", eventName + ":" + arg, 40);
              if (!colorPopupPanel || !colorPopupPanel.IsValid || !colorPopupPanel.IsValid()) {
                return false;
              }

              if (eventName === "pressed" && arg === 0) {
                const cursor = getCursorPosition();
                if (!cursor) return false;
                const metrics = getColorBoxMetrics();
                if (!metrics) return false;
                const bounds = metrics.bounds;
                const inside = cursor.x >= bounds.left && cursor.x <= (bounds.left + bounds.width) &&
                  cursor.y >= bounds.top && cursor.y <= (bounds.top + bounds.height);
                if (inside) {
                  syncFromCursorPosition(true);
                  beginColorDrag("gameui", false);
                  return true;
                }
              }

              if (colorDragging && eventName !== "pressed" && eventName !== "released") {
                syncPickerFromPointer(true);
                return true;
              }

              if (eventName === "released" && arg === 0 && colorDragging) {
                endColorDrag();
                return true;
              }

              return false;
            });
          } catch (e) {
          }
        } else {
        }

        // Hue slider row
        var hueGroup = $.CreatePanel("Panel", colorPopupPanel, "");
        hueGroup.AddClass("AnitaHueSliderGroup");

        var hueLbl = $.CreatePanel("Label", hueGroup, "");
        hueLbl.text = "H";
        hueLbl.AddClass("AnitaHueValue");
        hueLbl.AddClass("AnitaPickerAxisLabel");

        var hueContainer = $.CreatePanel("Panel", hueGroup, "");
        hueContainer.AddClass("AnitaHueSliderContainer");
        hueContainer.AddClass("AnitaPickerSliderTrack");

        pickerHueSlider = $.CreatePanel("Slider", hueContainer, "", { direction: "horizontal" });
        pickerHueSlider.AddClass("AnitaHueSlider");
        pickerHueSlider.AddClass("HorizontalSlider");
        pickerHueSlider.min = 0;
        pickerHueSlider.max = 100;
        pickerHueSlider.increment = 1;
        if (typeof pickerHueSlider.SetShowDefaultValue === "function") { try { pickerHueSlider.SetShowDefaultValue(false); } catch (e) {} }
        if (typeof pickerHueSlider.SetRequiresSelection === "function") { try { pickerHueSlider.SetRequiresSelection(false); } catch (e) {} }

        pickerHueValue = $.CreatePanel("Label", hueGroup, "");
        pickerHueValue.AddClass("AnitaHueValue");
        pickerHueValue.AddClass("AnitaPickerReadout");

        pickerHueSlider.SetPanelEvent("onvaluechanged", function () {
          if (colorPickerSyncing) return;
          var h = hueFromRelX(clamp01(Number(pickerHueSlider.value) / 100));
          var newColor = colorFromBoxState(h, pickerBoxSat);
          if (pickerHueValue) pickerHueValue.text = h + "\u00B0";
          if (pickerSatTrack && pickerSatTrack.IsValid && pickerSatTrack.IsValid()) {
            pickerSatTrack.style.backgroundColor = "gradient( linear, 0% 0%, 100% 0%, from( #ffffff ), to( " + hsvToHex(h, 1, 1) + " ) )";
          }
          if (pickerValTrack && pickerValTrack.IsValid && pickerValTrack.IsValid()) {
            pickerValTrack.style.backgroundColor = "gradient( linear, 0% 0%, 100% 0%, from( #000000 ), to( " + hsvToHex(h, pickerBoxSat, 1) + " ) )";
          }
          syncColorVisuals(newColor, true, false, { hue: h, sat: pickerBoxSat });
        });

        // Saturation slider row
        var satGroup = $.CreatePanel("Panel", colorPopupPanel, "");
        satGroup.AddClass("AnitaHueSliderGroup");

        var satLbl = $.CreatePanel("Label", satGroup, "");
        satLbl.text = "S";
        satLbl.AddClass("AnitaHueValue");
        satLbl.AddClass("AnitaPickerAxisLabel");

        pickerSatTrack = $.CreatePanel("Panel", satGroup, "");
        pickerSatTrack.AddClass("AnitaSatSliderContainer");
        pickerSatTrack.AddClass("AnitaPickerSliderTrack");

        pickerSatSlider = $.CreatePanel("Slider", pickerSatTrack, "", { direction: "horizontal" });
        pickerSatSlider.AddClass("AnitaHueSlider");
        pickerSatSlider.AddClass("HorizontalSlider");
        pickerSatSlider.min = 0;
        pickerSatSlider.max = 100;
        pickerSatSlider.increment = 1;
        if (typeof pickerSatSlider.SetShowDefaultValue === "function") { try { pickerSatSlider.SetShowDefaultValue(false); } catch (e) {} }
        if (typeof pickerSatSlider.SetRequiresSelection === "function") { try { pickerSatSlider.SetRequiresSelection(false); } catch (e) {} }

        pickerSatValue = $.CreatePanel("Label", satGroup, "");
        pickerSatValue.AddClass("AnitaHueValue");
        pickerSatValue.AddClass("AnitaPickerReadout");

        pickerSatSlider.SetPanelEvent("onvaluechanged", function () {
          if (colorPickerSyncing) return;
          var s = clamp01(pickerSatSlider.value / 100);
          var newColor2 = colorFromBoxState(pickerBoxHue, s);
          if (pickerSatValue) pickerSatValue.text = Math.round(s * 100) + "%";
          syncColorVisuals(newColor2, true, false, { hue: pickerBoxHue, sat: s });
        });

        // Brightness (Value) slider row
        var valGroup = $.CreatePanel("Panel", colorPopupPanel, "");
        valGroup.AddClass("AnitaHueSliderGroup");

        var valLbl = $.CreatePanel("Label", valGroup, "");
        valLbl.text = "V";
        valLbl.AddClass("AnitaHueValue");
        valLbl.AddClass("AnitaPickerAxisLabel");

        pickerValTrack = $.CreatePanel("Panel", valGroup, "");
        pickerValTrack.AddClass("AnitaSatSliderContainer");
        pickerValTrack.AddClass("AnitaPickerSliderTrack");

        pickerValSlider = $.CreatePanel("Slider", pickerValTrack, "", { direction: "horizontal" });
        pickerValSlider.AddClass("AnitaHueSlider");
        pickerValSlider.AddClass("HorizontalSlider");
        pickerValSlider.min = 0;
        pickerValSlider.max = 100;
        pickerValSlider.increment = 1;
        if (typeof pickerValSlider.SetShowDefaultValue === "function") { try { pickerValSlider.SetShowDefaultValue(false); } catch (e) {} }
        if (typeof pickerValSlider.SetRequiresSelection === "function") { try { pickerValSlider.SetRequiresSelection(false); } catch (e) {} }

        pickerValValue = $.CreatePanel("Label", valGroup, "");
        pickerValValue.AddClass("AnitaHueValue");
        pickerValValue.AddClass("AnitaPickerReadout");

        pickerValSlider.SetPanelEvent("onvaluechanged", function () {
          if (colorPickerSyncing) return;
          var v = clamp01(pickerValSlider.value / 100);
          pickerBoxVal = v;
          var newColor3 = colorFromBoxState(pickerBoxHue, pickerBoxSat);
          if (pickerValValue) pickerValValue.text = Math.round(v * 100) + "%";
          syncColorVisuals(newColor3, true, false, { hue: pickerBoxHue, sat: pickerBoxSat, val: v });
        });

        const footer = $.CreatePanel("Panel", colorPopupPanel, "");
        footer.AddClass("AnitaColorPopupFooter");

        const closeBtn = $.CreatePanel("Button", footer, "");
        closeBtn.AddClass("AnitaColorPopupBtn");
        const closeLbl = $.CreatePanel("Label", closeBtn, "");
        closeLbl.text = "Close";
        closeBtn.SetPanelEvent("onactivate", closePalette);

        const initState = getBoxStateFromColor(currentColor);
        syncColorVisuals(currentColor, false, false, initState);
        positionColorPopup(0);
        $.Schedule(0.0, function () {
          if (colorPopupPanel && colorPopupPanel.IsValid && colorPopupPanel.IsValid()) {
            positionColorPopup(0);
            syncColorVisuals(currentColor, false, false, initState);
          }
        });
      }

      const preview = $.CreatePanel("Panel", row, "ColorPreviewBtn");
      preview.AddClass("AnitaColorPickerPreview");
      preview.style.backgroundColor = currentColor;
      preview.style.marginRight = "6px";
      preview.SetPanelEvent("onactivate", () => openPalette());
      colorPreview = preview;

      rowHexLabel = $.CreatePanel("Label", row, "");
      rowHexLabel.AddClass("AnitaColorHexValue");
      rowHexLabel.text = currentColor;

      return row;
    },

    createPositionPicker: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");
      row.AddClass("AnitaSliderRow");
      row.style.overflow = "noclip";
      row.style.width = "100%";

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Position";
      lbl.AddClass("AnitaLabel");

      function posPickerClamp(value) {
        var next = Number(value);
        if (!isFinite(next)) next = 0;
        if (config && (config.id === "hp_counter_position" || config.id === "hp_pulse_text_position")) {
          if (next < -50) next = -50;
        } else if (next < 0) {
          next = 0;
        }
        if (next > 400) next = 400;
        return Math.round(next);
      }

      function posPickerParse(candidate) {
        var x = 0;
        var y = 200;
        var raw = candidate;

        if (raw && typeof raw === "object") {
          if (Array.isArray(raw)) {
            if (raw.length > 0) x = posPickerClamp(raw[0]);
            if (raw.length > 1) y = posPickerClamp(raw[1]);
          } else {
            if (Object.prototype.hasOwnProperty.call(raw, "x")) x = posPickerClamp(raw.x);
            if (Object.prototype.hasOwnProperty.call(raw, "y")) y = posPickerClamp(raw.y);
          }
          return { x: x, y: y };
        }

        if (typeof raw === "string") {
          var parts = raw.match(/-?\d+(?:\.\d+)?/g);
          if (parts && parts.length > 0) {
            x = posPickerClamp(parts[0]);
            if (parts.length > 1) y = posPickerClamp(parts[1]);
            return { x: x, y: y };
          }
        }

        if (typeof raw === "number") {
          y = posPickerClamp(raw);
          return { x: x, y: y };
        }

        return { x: x, y: y };
      }

      function posPickerNormalize(candidate) {
        var parsed = posPickerParse(candidate);
        return {
          x: posPickerClamp(parsed.x),
          y: posPickerClamp(parsed.y)
        };
      }

      function posPickerFormat(pos) {
        var parsed = posPickerNormalize(pos);
        return Math.round(parsed.x) + "," + Math.round(parsed.y);
      }

      function posPickerPercent(pos) {
        var parsed = posPickerNormalize(pos);
        return Math.round(parsed.x / 4);
      }

      let posPickerCurrent = posPickerNormalize((config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || "0,200"));
      let posPickerSyncing = false;
      const posPickerValueGroup = $.CreatePanel("Panel", row, "");
      posPickerValueGroup.AddClass("AnitaSliderValueGroup");
      posPickerValueGroup.AddClass("SliderValueGroup");
      posPickerValueGroup.AddClass("AnitaPositionPickerGroup");
      posPickerValueGroup.style.flowChildren = "down";
      posPickerValueGroup.style.verticalAlign = "center";
      posPickerValueGroup.style.horizontalAlign = "left";
      posPickerValueGroup.style.width = "332px";
      posPickerValueGroup.style.overflow = "noclip";

      const posPickerXGroup = $.CreatePanel("Panel", posPickerValueGroup, "");
      posPickerXGroup.AddClass("AnitaHueSliderGroup");
      posPickerXGroup.AddClass("AnitaPositionSliderRow");
      posPickerXGroup.style.overflow = "noclip";

      const posPickerXLbl = $.CreatePanel("Label", posPickerXGroup, "");
      posPickerXLbl.text = "L/R";
      posPickerXLbl.AddClass("AnitaHueValue");
      posPickerXLbl.AddClass("AnitaPositionAxisLabel");

      const posPickerXContainer = $.CreatePanel("Panel", posPickerXGroup, "");
      posPickerXContainer.AddClass("AnitaSliderContainer");
      posPickerXContainer.AddClass("SliderContainer");
      posPickerXContainer.AddClass("AnitaPositionSliderContainer");
      posPickerXContainer.style.width = "230px";
      posPickerXContainer.style.height = "26px";
      posPickerXContainer.style.padding = "0px";
      posPickerXContainer.style.verticalAlign = "center";
      posPickerXContainer.style.overflow = "noclip";

      const posPickerXSlider = $.CreatePanel("Slider", posPickerXContainer, "", { direction: "horizontal" });
      posPickerXSlider.AddClass("AnitaSlider");
      posPickerXSlider.AddClass("HorizontalSlider");
      posPickerXSlider.style.width = "100%";
      posPickerXSlider.style.height = "100%";
      posPickerXSlider.style.verticalAlign = "center";
      posPickerXSlider.style.overflow = "noclip";
      posPickerXSlider.min = 0;
      posPickerXSlider.max = 400;
      posPickerXSlider.increment = 1;
      if (typeof posPickerXSlider.SetShowDefaultValue === "function") {
        try { posPickerXSlider.SetShowDefaultValue(false); } catch (e) {}
      }
      if (typeof posPickerXSlider.SetRequiresSelection === "function") {
        try { posPickerXSlider.SetRequiresSelection(false); } catch (e) {}
      }

      const posPickerXValueLbl = $.CreatePanel("Label", posPickerXGroup, "");
      posPickerXValueLbl.AddClass("AnitaSliderValue");
      posPickerXValueLbl.AddClass("AnitaPositionReadout");
      posPickerXValueLbl.style.textOverflow = "clip";
      posPickerXValueLbl.style.overflow = "noclip";

      const posPickerYGroup = $.CreatePanel("Panel", posPickerValueGroup, "");
      posPickerYGroup.AddClass("AnitaHueSliderGroup");
      posPickerYGroup.AddClass("AnitaPositionSliderRow");
      posPickerYGroup.style.overflow = "noclip";

      const posPickerYLbl = $.CreatePanel("Label", posPickerYGroup, "");
      posPickerYLbl.text = "T/B";
      posPickerYLbl.AddClass("AnitaHueValue");
      posPickerYLbl.AddClass("AnitaPositionAxisLabel");

      const posPickerYContainer = $.CreatePanel("Panel", posPickerYGroup, "");
      posPickerYContainer.AddClass("AnitaSliderContainer");
      posPickerYContainer.AddClass("SliderContainer");
      posPickerYContainer.AddClass("AnitaPositionSliderContainer");
      posPickerYContainer.style.width = "230px";
      posPickerYContainer.style.height = "26px";
      posPickerYContainer.style.padding = "0px";
      posPickerYContainer.style.verticalAlign = "center";
      posPickerYContainer.style.overflow = "noclip";

      const posPickerYSlider = $.CreatePanel("Slider", posPickerYContainer, "", { direction: "horizontal" });
      posPickerYSlider.AddClass("AnitaSlider");
      posPickerYSlider.AddClass("HorizontalSlider");
      posPickerYSlider.style.width = "100%";
      posPickerYSlider.style.height = "100%";
      posPickerYSlider.style.verticalAlign = "center";
      posPickerYSlider.style.overflow = "noclip";
      posPickerYSlider.min = (config && (config.id === "hp_counter_position" || config.id === "hp_pulse_text_position")) ? -50 : 0;
      posPickerYSlider.max = 400;
      posPickerYSlider.increment = 1;
      if (typeof posPickerYSlider.SetShowDefaultValue === "function") {
        try { posPickerYSlider.SetShowDefaultValue(false); } catch (e) {}
      }
      if (typeof posPickerYSlider.SetRequiresSelection === "function") {
        try { posPickerYSlider.SetRequiresSelection(false); } catch (e) {}
      }

      const posPickerYValueLbl = $.CreatePanel("Label", posPickerYGroup, "");
      posPickerYValueLbl.AddClass("AnitaSliderValue");
      posPickerYValueLbl.AddClass("AnitaPositionReadout");
      posPickerYValueLbl.style.textOverflow = "clip";
      posPickerYValueLbl.style.overflow = "noclip";

      function syncPosition(nextPos, emitUpdateEvent) {
        var normalized = posPickerNormalize(nextPos);
        var nextValue = posPickerFormat(normalized);
        var changed = String(config.currentValue || "") !== nextValue;
        posPickerCurrent = normalized;
        config.currentValue = nextValue;

        if (posPickerXSlider && posPickerXSlider.IsValid && posPickerXSlider.IsValid()) {
          if (Number(posPickerXSlider.value) !== normalized.x) {
            posPickerSyncing = true;
            try {
              if (typeof posPickerXSlider.SetValueNoEvents === "function") {
                posPickerXSlider.SetValueNoEvents(normalized.x);
              } else {
                posPickerXSlider.value = normalized.x;
              }
            } finally {
              posPickerSyncing = false;
            }
          }
        }

        if (posPickerYSlider && posPickerYSlider.IsValid && posPickerYSlider.IsValid()) {
          if (Number(posPickerYSlider.value) !== normalized.y) {
            posPickerSyncing = true;
            try {
              if (typeof posPickerYSlider.SetValueNoEvents === "function") {
                posPickerYSlider.SetValueNoEvents(normalized.y);
              } else {
                posPickerYSlider.value = normalized.y;
              }
            } finally {
              posPickerSyncing = false;
            }
          }
        }

        posPickerXValueLbl.text = posPickerPercent(normalized) + "%";
        posPickerYValueLbl.text = Math.round(normalized.y / 4) + "%";

        if (emitUpdateEvent && changed) {
          if (config.onChange) config.onChange(nextValue);
          if (config.id && modTitle) {
            emitUpdateThrottled(modTitle, config.id, nextValue, null, 0.04);
          }
        }
      }

      syncPosition(posPickerCurrent, false);

      posPickerXSlider.SetPanelEvent("onvaluechanged", function () {
        if (posPickerSyncing) return;
        syncPosition({ x: posPickerXSlider.value, y: posPickerCurrent.y }, true);
      });

      posPickerYSlider.SetPanelEvent("onvaluechanged", function () {
        if (posPickerSyncing) return;
        syncPosition({ x: posPickerCurrent.x, y: posPickerYSlider.value }, true);
      });

      posPickerXSlider.SetPanelEvent("oncancel", () => {
        AnitaRenderer.toggle(false);
      });
      posPickerYSlider.SetPanelEvent("oncancel", () => {
        AnitaRenderer.toggle(false);
      });

      return row;
    }
  };

  const AnitaRenderer = {
    mainWindow: null,
    backdrop: null,
    navBar: null,
    menuArea: null,
    contentArea: null,
    popupHost: null,
    activeModTitle: "",
    isOpen: false,
    activeColorPickerClose: null,
    activeImportPopupClose: null,

    isHpColorsConfig: function (config) {
      return !!config &&
        config.title === "HP Colors" &&
        AnitaPersistence.normalizeNamespace(config.storageNamespace) === "hp_colors";
    },

    hasPresetBuilder: function (config) {
      return this.isHpColorsConfig(config);
    },

    isPresetBuilderCategory: function (category) {
      return String(category || "") === HP_PRESET_BUILDER_CATEGORY;
    },

    findElementById: function (config, elementId) {
      if (!config || !Array.isArray(config.elements) || !elementId) return null;
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        if (element && element.id === elementId) return element;
      }
      return null;
    },

    isElementVisible: function (config, element) {
      if (!element || !element.visibleWhen) return true;
      var rule = element.visibleWhen;
      var source = this.findElementById(config, rule.id);
      if (!source) return true;
      var current = source.currentValue;
      if (Array.isArray(rule.equals)) {
        for (var i = 0; i < rule.equals.length; i++) {
          if (current === rule.equals[i]) return true;
        }
        return false;
      }
      if (Object.prototype.hasOwnProperty.call(rule, "equals")) {
        return current === rule.equals;
      }
      return !!current;
    },

    applyElementVisibility: function (config, element) {
      if (!element || !element.__anitaRowPanel || !element.__anitaRowPanel.IsValid || !element.__anitaRowPanel.IsValid()) return;
      var visible = this.isElementVisible(config, element);
      element.__anitaRowPanel.style.visibility = visible ? "visible" : "collapse";
      element.__anitaRowPanel.hittest = visible;
    },

    refreshConditionalVisibility: function (config) {
      if (!config || !Array.isArray(config.elements)) return;
      for (var i = 0; i < config.elements.length; i++) {
        this.applyElementVisibility(config, config.elements[i]);
      }
    },

    hasVisibilityDependents: function (config, sourceId) {
      if (!config || !Array.isArray(config.elements) || !sourceId) return false;
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        if (!element || !element.visibleWhen) continue;
        if (element.visibleWhen.id === sourceId) return true;
      }
      return false;
    },

    getElementCategory: function (element) {
      var label = String((element && element.category) || "General").trim();
      return label || "General";
    },

    getCategoryList: function (config) {
      var categories = [];
      var seen = {};
      if (!config || !Array.isArray(config.elements)) return categories;
      for (var i = 0; i < config.elements.length; i++) {
        var category = this.getElementCategory(config.elements[i]);
        if (seen[category]) continue;
        seen[category] = true;
        categories.push(category);
      }
      return categories;
    },

    getCategoryElements: function (config, category) {
      var elements = [];
      if (this.isPresetBuilderCategory(category)) return elements;
      if (!config || !Array.isArray(config.elements)) return elements;
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        if (this.getElementCategory(element) !== category) continue;
        elements.push(element);
      }
      return elements;
    },

    ensureActiveCategory: function (config) {
      var categories = this.getCategoryList(config);
      if (categories.length === 0) {
        config.__anitaActiveCategory = "";
        return "";
      }
      var active = String(config.__anitaActiveCategory || "");
      if (this.hasPresetBuilder(config) && this.isPresetBuilderCategory(active)) {
        return active;
      }
      for (var i = 0; i < categories.length; i++) {
        if (categories[i] === active) return active;
      }
      config.__anitaActiveCategory = categories[0];
      return categories[0];
    },

    getSaveCodeToken: function (config) {
      if (!config || !config.storageNamespace) return "";

      var raw = AnitaPersistence.buildStoredPayload(config);
      if (!raw) return "";

      var ns = AnitaPersistence.normalizeNamespace(config.storageNamespace);
      if (!ns) return "";

      return "[" + AnitaPersistence.TOKEN_PREFIX + ns + "]:" + AnitaBase64.encode(raw);
    },

    extractSaveCodeToken: function (config, text) {
      if (!config || !config.storageNamespace) return "";

      var body = String(text || "").trim();
      if (!body) return "";

      var ns = AnitaPersistence.normalizeNamespace(config.storageNamespace);
      if (!ns) return "";

      var scopedMatch = body.match(AnitaPersistence.getTokenRegex(ns));
      if (scopedMatch && scopedMatch[0]) return scopedMatch[0];

      var genericMatch = body.match(/\[ANITA-v1-[a-z0-9_]+\]:[A-Za-z0-9_-]+/i);
      if (genericMatch && genericMatch[0]) return genericMatch[0];

      if (/^[A-Za-z0-9_-]+$/.test(body)) {
        return "[" + AnitaPersistence.TOKEN_PREFIX + ns + "]:" + body;
      }

      return "";
    },

    applyImportCode: function (config, text, source) {
      var token = this.extractSaveCodeToken(config, text);
      if (!token) return { ok: false, status: "Invalid" };

      var encoded = token.split("]:")[1] || "";
      try {
        var raw = AnitaBase64.decode(encoded);
        var parsed = AnitaPersistence.parseStoredPayload(config, raw);
        if (!parsed) return { ok: false, status: "Invalid" };
        if (!parsed.values || !Object.keys(parsed.values).length) {
          return { ok: false, status: "No IDs" };
        }

        AnitaPersistence.applyResolvedValues(config, parsed.values);
        AnitaPersistence.persistConfig(config, true);
        this.syncSaveCodeInput(config);
        AnitaCore.emitCurrentValues(config, {
          update_source: "ui_code_apply",
          import_source: String(source || "import"),
          force_persist: true,
          force_emit: true,
          bulk_emit: true
        });
        return { ok: true, status: "Imported" };
      } catch (eDec) {
        return { ok: false, status: "Invalid" };
      }
    },

    collectCurrentValues: function (config) {
      var values = {};
      if (!config || !Array.isArray(config.elements)) return values;
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        values[element.id] = AnitaPersistence.sanitizeValue(
          element,
          element.currentValue !== undefined ? element.currentValue : element.defaultValue
        );
      }
      return values;
    },

    isBuilderSupportedPresetElement: function (element) {
      return !!(element &&
        element.id &&
        Object.prototype.hasOwnProperty.call(HP_PRESET_BUILDER_SUPPORTED_IDS, element.id));
    },

    buildPresetCodeToken: function (config, values) {
      if (!config || !config.storageNamespace) return "";
      var ns = AnitaPersistence.normalizeNamespace(config.storageNamespace);
      if (!ns) return "";

      var payloadValues = {};
      var elements = AnitaPersistence.getElements(config);
      var sourceValues = values || {};
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        if (this.isHpColorsConfig(config) && !this.isBuilderSupportedPresetElement(element)) continue;
        var hasValue = Object.prototype.hasOwnProperty.call(sourceValues, element.id);
        var value = AnitaPersistence.sanitizeValue(
          element,
          hasValue ? sourceValues[element.id] : element.defaultValue
        );
        var defaultValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
        if (this.isHpColorsConfig(config) && value === defaultValue) continue;
        payloadValues[this.isHpColorsConfig(config) ? (HP_PERSIST_ALIASES[element.id] || element.id) : element.id] = value;
      }

      var raw = this.isHpColorsConfig(config)
        ? JSON.stringify({ v: AnitaPersistence.getVersion(config), c: HP_COMPACT_PERSIST_VERSION, values: payloadValues })
        : JSON.stringify({ version: AnitaPersistence.getVersion(config), values: payloadValues });
      return "[" + AnitaPersistence.TOKEN_PREFIX + ns + "]:" + AnitaBase64.encode(raw);
    },

    countPresetOverrides: function (config, values) {
      var count = 0;
      var elements = AnitaPersistence.getElements(config);
      var sourceValues = values || {};
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        if (!Object.prototype.hasOwnProperty.call(sourceValues, element.id)) continue;
        var value = AnitaPersistence.sanitizeValue(element, sourceValues[element.id]);
        var defaultValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
        if (value !== defaultValue) count += 1;
      }
      return count;
    },

    countBuilderPresetOverrides: function (config, values) {
      var count = 0;
      var elements = AnitaPersistence.getElements(config);
      var sourceValues = values || {};
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        if (!this.isBuilderSupportedPresetElement(element)) continue;
        if (!Object.prototype.hasOwnProperty.call(sourceValues, element.id)) continue;
        var value = AnitaPersistence.sanitizeValue(element, sourceValues[element.id]);
        var defaultValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
        if (value !== defaultValue) count += 1;
      }
      return count;
    },

    countUnsupportedPresetOverrides: function (config, values) {
      var count = 0;
      var elements = AnitaPersistence.getElements(config);
      var sourceValues = values || {};
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        if (this.isBuilderSupportedPresetElement(element)) continue;
        if (!Object.prototype.hasOwnProperty.call(sourceValues, element.id)) continue;
        var value = AnitaPersistence.sanitizeValue(element, sourceValues[element.id]);
        var defaultValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
        if (value !== defaultValue) count += 1;
      }
      return count;
    },

    countPresetValues: function (values) {
      var count = 0;
      for (var key in values || {}) {
        if (Object.prototype.hasOwnProperty.call(values, key)) count += 1;
      }
      return count;
    },

    getPresetRows: function (config) {
      var rows = [];
      var baked = readBakedPresetEntries(config);
      for (var i = 0; i < baked.length; i++) {
        var preset = baked[i];
        var valueCount = this.countPresetValues(preset.values);
        var overrideCount = this.countBuilderPresetOverrides(config, preset.values);
        var unsupportedCount = this.countUnsupportedPresetOverrides(config, preset.values);
        rows.push({
          key: "baked_" + String(i),
          name: preset.name || ("Builder preset " + String(i + 1)),
          category: preset.category || "Builder VPK",
          status: valueCount ? (String(valueCount) + " recognized setting" + (valueCount === 1 ? "" : "s") + ", " + String(overrideCount) + " builder override" + (overrideCount === 1 ? "" : "s") + (unsupportedCount ? (", " + String(unsupportedCount) + " omitted") : "")) : "No recognized HP Colors settings",
          token: this.buildPresetCodeToken(config, preset.values || {}),
          values: preset.values || {}
        });
      }

      var currentValues = this.collectCurrentValues(config);
      var currentOverrides = this.countBuilderPresetOverrides(config, currentValues);
      var omittedOverrides = this.countUnsupportedPresetOverrides(config, currentValues);
      rows.push({
        key: "current",
        name: "Current live settings",
        category: "Live settings",
        status: (currentOverrides ? (String(currentOverrides) + " builder override" + (currentOverrides === 1 ? "" : "s")) : "Default builder values") +
          (omittedOverrides ? ("; " + String(omittedOverrides) + " live-only setting" + (omittedOverrides === 1 ? "" : "s") + " omitted") : ""),
        token: this.buildPresetCodeToken(config, currentValues),
        values: currentValues
      });
      return rows;
    },

    copyTextToClipboard: function (text) {
      var value = String(text || "");
      if (!value) return false;
      var panel = $.GetContextPanel();
      function tryCopy(eventName, arg0, arg1) {
        try {
          $.DispatchEvent(eventName, arg0, arg1);
          return true;
        } catch (e0) {}
        return false;
      }
      if (tryCopy("CopyStringToClipboard", value)) return true;
      if (tryCopy("CopyStringToClipboard", value, panel)) return true;
      if (tryCopy("CopyToClipboard", value, panel)) return true;
      if (tryCopy("CopyToClipboard", value)) return true;
      try {
        if ($.DispatchEventAsync) {
          $.DispatchEventAsync(0, "CopyStringToClipboard", value, panel);
          return true;
        }
      } catch (e1) {}
      return false;
    },

    openExternalUrl: function (url) {
      var target = String(url || "");
      if (!target) return false;
      try {
        $.DispatchEvent("ExternalBrowserGoToURL", target);
        return true;
      } catch (e0) {}
      try {
        $.DispatchEvent("SteamOverlayOpenURL", target);
        return true;
      } catch (e1) {}
      try {
        if (typeof SteamOverlayAPI !== "undefined" && SteamOverlayAPI && typeof SteamOverlayAPI.OpenURL === "function") {
          SteamOverlayAPI.OpenURL(target);
          return true;
        }
      } catch (e2) {}
      return false;
    },

    setPresetStatus: function (label, text, good) {
      if (!label || !label.IsValid || !label.IsValid()) return;
      label.text = text;
      label.SetHasClass("Good", !!good);
    },

    selectPresetBuilder: function (config) {
      if (!this.hasPresetBuilder(config)) return;
      config.__anitaActiveCategory = HP_PRESET_BUILDER_CATEGORY;
      this.renderModSettings(config);
    },

    renderPresetBuilderPanel: function (parent, config) {
      if (!parent || !config) return;

      var rows = this.getPresetRows(config);
      var selectedKeyValid = false;
      for (var selectedKeyIndex = 0; selectedKeyIndex < rows.length; selectedKeyIndex++) {
        if (rows[selectedKeyIndex].key === config.__anitaSelectedPresetKey) {
          selectedKeyValid = true;
          break;
        }
      }
      if (!config.__anitaSelectedPresetKey || !selectedKeyValid) {
        var defaultPresetKey = "";
        for (var defaultIndex = rows.length - 1; defaultIndex >= 0; defaultIndex--) {
          if (String(rows[defaultIndex].key || "").indexOf("baked_") === 0) {
            defaultPresetKey = rows[defaultIndex].key;
            break;
          }
        }
        config.__anitaSelectedPresetKey = defaultPresetKey || (rows.length ? rows[0].key : "");
      }

      var selected = rows.length ? rows[0] : null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].key === config.__anitaSelectedPresetKey) {
          selected = rows[i];
          break;
        }
      }

      var panel = $.CreatePanel("Panel", parent, "");
      panel.AddClass("AnitaPresetBuilderPanel");

      var intro = $.CreatePanel("Panel", panel, "");
      intro.AddClass("AnitaPresetIntro");

      var kicker = $.CreatePanel("Label", intro, "");
      kicker.AddClass("AnitaPresetKicker");
      kicker.text = "Restart-safe workflow";

      var titleRow = $.CreatePanel("Panel", intro, "");
      titleRow.AddClass("AnitaPresetTitleRow");

      var title = $.CreatePanel("Label", titleRow, "");
      title.AddClass("AnitaPresetTitle");
      title.text = "HP Preset Web Builder";

      var titleImportBtn = $.CreatePanel("Button", titleRow, "");
      titleImportBtn.AddClass("AnitaPresetImportBtn");
      var titleImportLbl = $.CreatePanel("Label", titleImportBtn, "");
      titleImportLbl.text = "IMPORT";

      var body = $.CreatePanel("Label", intro, "");
      body.AddClass("AnitaPresetBody");
      body.text = "Normal Anita settings are live only and can reset after restart. Copy a preset code, open the builder, import it there, then build pak96_dir.vpk.";

      var actionRow = $.CreatePanel("Panel", panel, "");
      actionRow.AddClass("AnitaPresetActionRow");

      var openBtn = $.CreatePanel("Button", actionRow, "");
      openBtn.AddClass("AnitaPresetOpenBtn");
      var openLbl = $.CreatePanel("Label", openBtn, "");
      openLbl.text = "OPEN BUILDER";

      var status = $.CreatePanel("Label", actionRow, "");
      status.AddClass("AnitaPresetStatusText");
      status.text = selected ? ("Selected: " + selected.name) : "No preset selected";

      var fallback = $.CreatePanel("Label", panel, "");
      fallback.AddClass("AnitaPresetFallbackUrl");
      fallback.text = "Fallback URL: " + HP_PRESET_BUILDER_URL;

      var listTitle = $.CreatePanel("Label", panel, "");
      listTitle.AddClass("AnitaPresetListTitle");
      listTitle.text = "Preset codes";

      var list = $.CreatePanel("Panel", panel, "");
      list.AddClass("AnitaPresetList");

      function getSelectedRow() {
        for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          if (rows[rowIndex].key === config.__anitaSelectedPresetKey) return rows[rowIndex];
        }
        return rows.length ? rows[0] : null;
      }

      function getSelectedStatusText() {
        var active = getSelectedRow();
        return active ? ("Selected: " + active.name) : "No preset selected";
      }

      function showPresetStatus(text, good, durationSec) {
        var statusToken = (config.__anitaPresetStatusToken || 0) + 1;
        config.__anitaPresetStatusToken = statusToken;
        AnitaRenderer.setPresetStatus(status, text, good);
        if (!durationSec) return;
        $.Schedule(durationSec, function () {
          if (statusToken !== config.__anitaPresetStatusToken) return;
          AnitaRenderer.setPresetStatus(status, getSelectedStatusText(), false);
        });
      }

      function copyPreset(row, label, doneText) {
        if (!row || !row.token) {
          showPresetStatus("No code available for this preset.", false, 2.0);
          return false;
        }
        var copied = AnitaRenderer.copyTextToClipboard(row.token);
        showPresetStatus(
          copied ? doneText : "Clipboard failed. Use Import with copied text fallback unavailable.",
          copied,
          2.5
        );
        return copied;
      }

      function importPreset(row) {
        if (!row || !row.token) {
          showPresetStatus("No code available for this preset.", false, 2.0);
          return false;
        }
        var result = AnitaRenderer.applyImportCode(config, row.token, "preset_builder");
        if (result.ok) {
          showPresetStatus("Imported " + row.name + ".", true, 2.5);
          return true;
        }
        showPresetStatus(result.status || "Invalid", false, 2.0);
        return false;
      }

      openBtn.SetPanelEvent("onactivate", function () {
        var activeRow = getSelectedRow();
        if (!activeRow) {
          showPresetStatus("No preset selected.", false, 2.0);
          return;
        }
        copyPreset(activeRow, status, "Code copied. If browser does not open, use URL below.");
        AnitaRenderer.openExternalUrl(HP_PRESET_BUILDER_URL);
      });

      titleImportBtn.SetPanelEvent("onactivate", function () {
        importPreset(getSelectedRow());
      });

      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var rowPanel = $.CreatePanel("Panel", list, "");
        rowPanel.AddClass("AnitaPresetRow");
        rowPanel.SetHasClass("Active", row.key === config.__anitaSelectedPresetKey);
        rowPanel.hittest = true;

        var textCol = $.CreatePanel("Panel", rowPanel, "");
        textCol.AddClass("AnitaPresetRowText");

        var nameLabel = $.CreatePanel("Label", textCol, "");
        nameLabel.AddClass("AnitaPresetRowName");
        nameLabel.text = row.name;

        var metaLabel = $.CreatePanel("Label", textCol, "");
        metaLabel.AddClass("AnitaPresetRowMeta");
        metaLabel.text = row.category + " - " + row.status;

        var copyBtn = $.CreatePanel("Button", rowPanel, "");
        copyBtn.AddClass("AnitaPresetCopyBtn");
        var copyLbl = $.CreatePanel("Label", copyBtn, "");
        copyLbl.text = "COPY";

        rowPanel.SetPanelEvent("onactivate", (function (rowKey) {
          return function () {
            config.__anitaSelectedPresetKey = rowKey;
            AnitaRenderer.renderModSettings(config);
          };
        }(row.key)));

        copyBtn.SetPanelEvent("onactivate", (function (presetRow, buttonLabel) {
          return function () {
            config.__anitaSelectedPresetKey = presetRow.key;
            copyPreset(presetRow, status, "Copied " + presetRow.name + ".");
            buttonLabel.text = "COPIED";
            $.Schedule(1.25, function () {
              if (buttonLabel && buttonLabel.IsValid && buttonLabel.IsValid()) buttonLabel.text = "COPY";
            });
          };
        }(row, copyLbl)));
      }
    },

    syncSaveCodeInput: function (config) {
      if (!config || !config.__anitaSaveCodeInput) return;
      if (!config.__anitaSaveCodeInput.IsValid || !config.__anitaSaveCodeInput.IsValid()) return;

      var token = this.getSaveCodeToken(config);
      if (String(config.__anitaSaveCodeInput.text || "") === token) return;

      config.__anitaSaveCodeInput.text = token;
    },

    initWindow: function (root) {
      if (root.FindChildTraverse(CONFIG.IDS.WINDOW)) root.FindChildTraverse(CONFIG.IDS.WINDOW).DeleteAsync(0);
      if (root.FindChildTraverse(CONFIG.IDS.BACKDROP)) root.FindChildTraverse(CONFIG.IDS.BACKDROP).DeleteAsync(0);


      this.backdrop = $.CreatePanel("Panel", root, CONFIG.IDS.BACKDROP);
      this.backdrop.AddClass("AnitaBackdrop");
      this.backdrop.SetPanelEvent("onactivate", () => this.toggle(false));

      this.mainWindow = $.CreatePanel("Panel", root, CONFIG.IDS.WINDOW);
      this.mainWindow.AddClass("AnitaWindow");

      this.mainWindow.canfocus = true;
      this.mainWindow.SetPanelEvent("oncancel", () => this.toggle(false));

      this.mainWindow.SetPanelEvent("onactivate", () => {
        this.mainWindow.SetFocus();
      });

      this.navBar = $.CreatePanel("Panel", this.mainWindow, CONFIG.IDS.NAVBAR);
      this.navBar.AddClass("AnitaNavBar");

      const closeBtn = $.CreatePanel("Button", this.navBar, "");
      closeBtn.AddClass("AnitaCloseBtn");
      closeBtn.SetPanelEvent("onactivate", () => this.toggle(false));

      const sep = $.CreatePanel("Label", this.navBar, "");
      sep.text = "/";
      sep.AddClass("AnitaTabSeparator");

      this.menuArea = $.CreatePanel("Panel", this.navBar, "AnitaTabContainer");
      this.menuArea.AddClass("AnitaTabContainer");
      this.contentArea = $.CreatePanel("Panel", this.mainWindow, CONFIG.IDS.CONTENT);
      this.contentArea.AddClass("AnitaContentArea");
    },

    toggle: function (forceState) {
      if (!this.mainWindow || !this.backdrop) return;
      this.isOpen = (forceState !== undefined) ? forceState : !this.isOpen;

      this.mainWindow.SetHasClass(CONFIG.CLASSES.OPEN, this.isOpen);
      this.mainWindow.hittest = this.isOpen;
      this.backdrop.SetHasClass(CONFIG.CLASSES.OPEN, this.isOpen);
      this.backdrop.hittest = this.isOpen;

      if (this.isOpen) {
        this.mainWindow.SetFocus();
      } else {
        if (this.activeColorPickerClose) {
          try {
            this.activeColorPickerClose();
          } catch (closeErr) {}
          this.activeColorPickerClose = null;
        }
        if (this.activeImportPopupClose) {
          try {
            this.activeImportPopupClose();
          } catch (popupErr) {}
          this.activeImportPopupClose = null;
        }
        $.DispatchEvent("DropInputFocus", this.mainWindow);

        let root = $.GetContextPanel();
        while (root.GetParent()) root = root.GetParent();
        root.SetFocus();
      }
    },

    addTab: function (modTitle, onClick) {
      let displayTitle = modTitle;
      const MAX_CHARS = CONFIG.UI.TAB_MAX_CHARS;
      if (displayTitle.length > MAX_CHARS) displayTitle = displayTitle.substring(0, MAX_CHARS) + "...";

      const btn = $.CreatePanel("Button", this.menuArea, "");
      btn.AddClass("AnitaTabBtn");
      const lbl = $.CreatePanel("Label", btn, "");
      lbl.text = displayTitle;

      const sep = $.CreatePanel("Label", this.menuArea, "");
      sep.text = "/"; sep.AddClass("AnitaTabSeparator");

      btn.SetPanelEvent("onactivate", () => {
        this.menuArea.Children().forEach(c => {
          if (c.paneltype === "Button" && !c.BHasClass("AnitaCloseBtn")) c.RemoveClass("Active");
        });
        btn.AddClass("Active");
        this.activeModTitle = modTitle;
        onClick();
      });

      if (this.menuArea.GetChildCount() <= 4) {
        btn.AddClass("Active");
        this.activeModTitle = modTitle;
        onClick();
      }
    },

    renderModSettings: function (config) {
      if (this.activeImportPopupClose) {
        try {
          this.activeImportPopupClose();
        } catch (popupErr) {}
        this.activeImportPopupClose = null;
      }
      this.contentArea.RemoveAndDeleteChildren();

      this.contentArea.canfocus = true;
      this.contentArea.SetPanelEvent("onactivate", () => this.contentArea.SetFocus());

      const container = $.CreatePanel("Panel", this.contentArea, "");
      container.AddClass("ModContainer");
      container.canfocus = true;

      const bgShield = $.CreatePanel("Panel", container, "BackgroundShield");
      bgShield.style.width = "100%";
      bgShield.style.height = "100%";
      bgShield.style.ignoreParentFlow = "true";
      bgShield.style.zIndex = "-1";
      bgShield.hittest = true;

        const syncAll = () => {
          var now = 0;
          try { now = (new Date()).getTime(); } catch (eNow) {}
          if (config.__anitaLastRenderSyncAt && now - config.__anitaLastRenderSyncAt < 250) return;
          config.__anitaLastRenderSyncAt = now;
          AnitaCore.emitCurrentValues(config, {
            update_source: "ui_resync",
            skip_bridge_persist: true,
            force_emit: true,
            bulk_emit: true
          });
        };

      bgShield.SetPanelEvent("onmouseover", () => {
        syncAll();
      });

      bgShield.SetPanelEvent("onactivate", () => {
        container.SetFocus();
        syncAll();
      });

      const title = $.CreatePanel("Label", container, "");
      title.text = config.title; title.AddClass("SectionHeader");
      const line = $.CreatePanel("Panel", container, ""); line.AddClass("SectionHeaderLine");

      if (config.description) {
        const desc = $.CreatePanel("Label", container, "");
        desc.text = config.description; desc.AddClass("ModDescription");
      }

      if (this.hasPresetBuilder(config)) {
        const notice = $.CreatePanel("Panel", container, "");
        notice.AddClass("AnitaPresetNotice");

        const noticeText = $.CreatePanel("Label", notice, "");
        noticeText.AddClass("AnitaPresetNoticeText");
        noticeText.text = "Settings reset after restart. Build a preset VPK to keep them.";

        const noticeBtn = $.CreatePanel("Button", notice, "");
        noticeBtn.AddClass("AnitaPresetNoticeBtn");
        const noticeBtnLabel = $.CreatePanel("Label", noticeBtn, "");
        noticeBtnLabel.text = "PRESETS";
        noticeBtn.SetPanelEvent("onactivate", () => {
          AnitaRenderer.selectPresetBuilder(config);
        });
      }

      const shell = $.CreatePanel("Panel", container, "");
      shell.AddClass("AnitaSettingsShell");

      const treePanel = $.CreatePanel("Panel", shell, "");
      treePanel.AddClass("AnitaTreePanel");

      const treeHeader = $.CreatePanel("Label", treePanel, "");
      treeHeader.text = "Settings";
      treeHeader.AddClass("AnitaTreeHeader");

      const treeList = $.CreatePanel("Panel", treePanel, "");
      treeList.AddClass("AnitaTreeList");

      const detailPanel = $.CreatePanel("Panel", shell, "");
      detailPanel.AddClass("AnitaDetailPanel");

      const activeCategory = this.ensureActiveCategory(config);
      const rawCategories = this.getCategoryList(config);

      // Parse and group categories
      var groupedCategories = {};
      for (var c = 0; c < rawCategories.length; c++) {
        var rawCat = rawCategories[c];
        var parts = rawCat.split("|");
        var main = parts.length > 1 ? parts[0] : "General Options";
        var sub = parts.length > 1 ? parts[1] : rawCat;
        
        if (!groupedCategories[main]) {
          groupedCategories[main] = [];
        }
        groupedCategories[main].push({ full: rawCat, sub: sub });
      }

      // Render Tree
      for (var mainCat in groupedCategories) {
        if (!Object.prototype.hasOwnProperty.call(groupedCategories, mainCat)) continue;
        
        var mainBtn = $.CreatePanel("Button", treeList, "");
        mainBtn.AddClass("AnitaMainCategoryBtn");
        if (mainCat === "PRESETS") mainBtn.AddClass("AnitaPresetMainCategoryBtn");
        
        var mainLabel = $.CreatePanel("Label", mainBtn, "");
        mainLabel.AddClass("AnitaMainCategoryLabel");
        mainLabel.text = mainCat;

        var subCats = groupedCategories[mainCat];
        var isMainActive = false;
        for (var i = 0; i < subCats.length; i++) {
          if (subCats[i].full === activeCategory) {
            isMainActive = true;
            break;
          }
        }
        mainBtn.SetHasClass("Active", isMainActive);

        // Click main category to open/activate its first subcategory
        mainBtn.SetPanelEvent("onactivate", function (firstSub) {
          return function () {
            if (config.__anitaActiveCategory !== firstSub) {
              config.__anitaActiveCategory = firstSub;
              AnitaRenderer.renderModSettings(config);
            }
          };
        }(subCats[0].full));

        if (isMainActive) {
          for (var s = 0; s < subCats.length; s++) {
            var subData = subCats[s];
            var subBtn = $.CreatePanel("Button", treeList, "");
            subBtn.AddClass("AnitaSubCategoryBtn");
            if (mainCat === "PRESETS") subBtn.AddClass("AnitaPresetSubCategoryBtn");
            subBtn.SetHasClass("Active", subData.full === activeCategory);

            var subLabel = $.CreatePanel("Label", subBtn, "");
            subLabel.AddClass("AnitaSubCategoryLabel");
            subLabel.text = subData.sub;

            var subCount = $.CreatePanel("Label", subBtn, "");
            subCount.AddClass("AnitaSubCategoryCount");
            subCount.text = String(this.getCategoryElements(config, subData.full).length);

            subBtn.SetPanelEvent("onactivate", function (nextCategory) {
              return function () {
                config.__anitaActiveCategory = nextCategory;
                AnitaRenderer.renderModSettings(config);
              };
            }(subData.full));
          }
        }
      }

      const detailHeaderRow = $.CreatePanel("Panel", detailPanel, "");
      detailHeaderRow.AddClass("AnitaDetailHeaderRow");

      const detailHeader = $.CreatePanel("Label", detailHeaderRow, "");
      detailHeader.text = this.isPresetBuilderCategory(activeCategory) ? "PRESET BUILDER" : (activeCategory || config.title);
      detailHeader.AddClass("AnitaDetailHeader");

      function flashHeaderAction(button, label, text) {
        if (!button || !button.IsValid || !button.IsValid()) return;
        if (!label || !label.IsValid || !label.IsValid()) return;
        var previous = label.text;
        label.text = text;
        button.AddClass("AnitaHeaderActionBtnSuccess");
        $.Schedule(1.25, function () {
          if (label && label.IsValid && label.IsValid()) label.text = previous;
          if (button && button.IsValid && button.IsValid()) button.RemoveClass("AnitaHeaderActionBtnSuccess");
        });
      }

      function makeHeaderActionButton(parent, labelText) {
        var button = $.CreatePanel("Button", parent, "");
        button.AddClass("AnitaHeaderActionBtn");
        var label = $.CreatePanel("Label", button, "");
        label.text = labelText;
        return { btn: button, lbl: label };
      }

      function emitHeaderReset(button, label, flashText) {
        AnitaPersistence.persistConfig(config, true);
        AnitaRenderer.syncSaveCodeInput(config);
        flashHeaderAction(button, label, flashText);
        AnitaRenderer.renderModSettings(config);
        AnitaCore.emitCurrentValues(config, {
          update_source: "ui_reset",
          force_persist: true,
          force_emit: true,
          bulk_emit: true
        });
      }

      function resetAllFromHeader(button, label) {
        if (AnitaRenderer.activeImportPopupClose) {
          try { AnitaRenderer.activeImportPopupClose(); } catch (closeErr) {}
        }
        AnitaPersistence.applyResolvedValues(config, {});
        emitHeaderReset(button, label, "Reset");
      }

      function resetPageFromHeader(button, label) {
        if (AnitaRenderer.activeImportPopupClose) {
          try { AnitaRenderer.activeImportPopupClose(); } catch (closeErr) {}
        }
        var elements = AnitaRenderer.getCategoryElements(config, activeCategory);
        var changed = false;
        for (var resetIndex = 0; resetIndex < elements.length; resetIndex++) {
          var element = elements[resetIndex];
          if (!AnitaPersistence.shouldPersistElement(element)) continue;
          var nextValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
          if (element.currentValue !== nextValue) changed = true;
          element.currentValue = nextValue;
        }
        if (!elements.length || AnitaRenderer.isPresetBuilderCategory(activeCategory)) {
          flashHeaderAction(button, label, "None");
          return;
        }
        emitHeaderReset(button, label, changed ? "Reset" : "Same");
      }

      if (this.hasPresetBuilder(config)) {
        var headerActions = $.CreatePanel("Panel", detailHeaderRow, "");
        headerActions.AddClass("AnitaHeaderActions");
        var resetPageHeader = makeHeaderActionButton(headerActions, "Page");
        resetPageHeader.btn.SetPanelEvent("onactivate", function () {
          resetPageFromHeader(resetPageHeader.btn, resetPageHeader.lbl);
        });
        var resetAllHeader = makeHeaderActionButton(headerActions, "All");
        resetAllHeader.btn.SetPanelEvent("onactivate", function () {
          resetAllFromHeader(resetAllHeader.btn, resetAllHeader.lbl);
        });
      }

      const detailHint = $.CreatePanel("Label", detailPanel, "");
      detailHint.text = this.isPresetBuilderCategory(activeCategory)
        ? "Use the web builder for restart-safe preset VPK generation."
        : "Select a setting group from the tree on the left.";
      detailHint.AddClass("AnitaDetailHint");

      const detailBody = $.CreatePanel("Panel", detailPanel, "");
      detailBody.AddClass("AnitaDetailBody");

      const settingsList = $.CreatePanel("Panel", detailBody, "");
      settingsList.AddClass("AnitaSettingsList");

      if (this.isPresetBuilderCategory(activeCategory)) {
        this.renderPresetBuilderPanel(settingsList, config);
      } else if (config.elements) {
        config.elements.forEach(el => {
          el.__anitaRowPanel = null;
        });
        this.getCategoryElements(config, activeCategory).forEach(el => {
          var row = null;
          switch (el.type) {
            case "toggle": row = AnitaComponents.createToggle(settingsList, el, config.title); break;
            case "stepper": row = AnitaComponents.createStepper(settingsList, el, config.title); break;
            case "slider": row = AnitaComponents.createSlider(settingsList, el, config.title); break;
            case "button": row = AnitaComponents.createButton(settingsList, el, config.title); break;
            case "cycler": row = AnitaComponents.createCycler(settingsList, el, config.title); break;
            case "positionpicker": row = AnitaComponents.createPositionPicker(settingsList, el, config.title); break;
            case "colorpicker": row = AnitaComponents.createColorPicker(settingsList, el, config.title); break;
          }
          el.__anitaRowPanel = row || null;
        });
        this.refreshConditionalVisibility(config);
      }

      // Footer: Reset / Import (only for mods with storageNamespace)
      if (config.storageNamespace) {
        var footerWrap = $.CreatePanel("Panel", treePanel, "");
        footerWrap.AddClass("AnitaTreeFooter");

        var footer = $.CreatePanel("Panel", footerWrap, "");
        footer.AddClass("AnitaFooterRow");
        function makeFooterBtn(parent, label, id) {
          var btn = $.CreatePanel("Button", parent, id || "");
          btn.AddClass("AnitaFooterBtn");
          var lbl = $.CreatePanel("Label", btn, "");
          lbl.text = label;
          return { btn: btn, lbl: lbl };
        }

        function flashLabel(btn, lbl, msg, durationSec) {
          if (!btn || !btn.IsValid || !btn.IsValid()) return;
          if (!lbl || !lbl.IsValid || !lbl.IsValid()) return;
          var orig = lbl.text;
          lbl.text = msg;
          btn.AddClass("AnitaFooterBtnSuccess");
          $.Schedule(durationSec, function () {
            if (lbl && lbl.IsValid()) lbl.text = orig;
            if (btn && btn.IsValid()) btn.RemoveClass("AnitaFooterBtnSuccess");
          });
        }

        var importPopupPanel = null;
        var importPopupInput = null;
        var importPopupApplyBtn = null;

        function closeImportPopup() {
          if (importPopupPanel && importPopupPanel.IsValid && importPopupPanel.IsValid()) {
            importPopupPanel.DeleteAsync(0);
          }
          importPopupPanel = null;
          importPopupInput = null;
          importPopupApplyBtn = null;
          config.__anitaImportCodeInput = null;
          if (AnitaRenderer.activeImportPopupClose === closeImportPopup) {
            AnitaRenderer.activeImportPopupClose = null;
          }
        }

        function openImportPopup() {
          if (importPopupPanel && importPopupPanel.IsValid && importPopupPanel.IsValid()) {
            if (importPopupInput && importPopupInput.IsValid && importPopupInput.IsValid()) {
              importPopupInput.SetFocus();
            }
            return;
          }

          if (AnitaRenderer.activeImportPopupClose &&
              AnitaRenderer.activeImportPopupClose !== closeImportPopup) {
            try {
              AnitaRenderer.activeImportPopupClose();
            } catch (closeErr) {}
          }

          var popupParent = $.GetContextPanel();
          importPopupPanel = $.CreatePanel("Panel", popupParent, "");
          AnitaRenderer.activeImportPopupClose = closeImportPopup;
          importPopupPanel.AddClass("AnitaImportPopup");
          importPopupPanel.style.align = "center center";
          importPopupPanel.style.ignoreParentFlow = true;
          importPopupPanel.style.flowChildren = "down";
          importPopupPanel.style.uiScale = "100%";
          importPopupPanel.SetPanelEvent("oncancel", closeImportPopup);

          var header = $.CreatePanel("Panel", importPopupPanel, "");
          header.AddClass("AnitaImportPopupHeader");

          var title = $.CreatePanel("Label", header, "");
          title.AddClass("AnitaImportPopupTitle");
          title.text = "Import Code";

          var headerClose = $.CreatePanel("Button", header, "");
          headerClose.AddClass("AnitaColorPopupBtn");
          var headerCloseLbl = $.CreatePanel("Label", headerClose, "");
          headerCloseLbl.text = "Close";
          headerClose.SetPanelEvent("onactivate", closeImportPopup);

          var hint = $.CreatePanel("Label", importPopupPanel, "");
          hint.AddClass("AnitaImportPopupHint");
          hint.text = "Paste a token to apply and persist these settings.";

          var importRow = $.CreatePanel("Panel", importPopupPanel, "");
          importRow.AddClass("AnitaPasteRow");
          importRow.hittest = true;

          importPopupInput = $.CreatePanel("TextEntry", importRow, "");
          importPopupInput.AddClass("AnitaPasteInput");
          importPopupInput.placeholder = "Paste a token here...";
          config.__anitaImportCodeInput = importPopupInput;

          importPopupApplyBtn = makeFooterBtn(importRow, "Apply", "");
          importPopupApplyBtn.btn.AddClass("AnitaImportApplyBtn");

          function applySaveCodeInput() {
            if (!importPopupInput || !importPopupInput.IsValid || !importPopupInput.IsValid()) return;

            var text = String(importPopupInput.text || "").trim();
            if (!text) { flashLabel(importPopupApplyBtn.btn, importPopupApplyBtn.lbl, "Empty", 1.5); return; }

            var result = AnitaRenderer.applyImportCode(config, text, "import_popup");
            if (!result.ok) {
              flashLabel(importPopupApplyBtn.btn, importPopupApplyBtn.lbl, result.status || "Invalid", 1.5);
              return;
            }
            closeImportPopup();
            AnitaRenderer.renderModSettings(config);
          }

          importPopupApplyBtn.btn.SetPanelEvent("onactivate", applySaveCodeInput);
          importPopupInput.SetPanelEvent("ontextentrysubmit", applySaveCodeInput);
          $.Schedule(0.0, function () {
            if (importPopupInput && importPopupInput.IsValid && importPopupInput.IsValid()) {
              importPopupInput.SetFocus();
            }
          });
        }

        function emitResetAndRender(button, label, flashText) {
          AnitaPersistence.persistConfig(config, true);
          AnitaRenderer.syncSaveCodeInput(config);
          flashLabel(button, label, flashText, 1.5);
          AnitaRenderer.renderModSettings(config);
          AnitaCore.emitCurrentValues(config, {
            update_source: "ui_reset",
            force_persist: true,
            force_emit: true,
            bulk_emit: true
          });
        }

        function resetAllSettings(button, label) {
          if (AnitaRenderer.activeImportPopupClose === closeImportPopup) {
            closeImportPopup();
          }
          AnitaPersistence.applyResolvedValues(config, {});
          emitResetAndRender(button, label, "Reset");
        }

        if (AnitaRenderer.hasPresetBuilder(config)) {
          footer.AddClass("AnitaFooterRowHpReset");

          var presetB = makeFooterBtn(footer, "Preset", "");
          presetB.btn.AddClass("AnitaFooterBtnPreset");
          presetB.btn.SetPanelEvent("onactivate", function () {
            if (AnitaRenderer.activeImportPopupClose === closeImportPopup) {
              closeImportPopup();
            }
            AnitaRenderer.selectPresetBuilder(config);
          });
        }

        var resetB = makeFooterBtn(footer, "Reset", "");
        resetB.btn.SetPanelEvent("onactivate", function () {
          resetAllSettings(resetB.btn, resetB.lbl);
        });

        var importToggleBtn = makeFooterBtn(footer, "Import", "");
        importToggleBtn.btn.SetPanelEvent("onactivate", function () {
          openImportPopup();
        });

      }
    },

  }

  const AnitaCore = {
    registeredMods: [],

    init: function () {
      const root = this.getRoot($.GetContextPanel());
      AnitaRenderer.initWindow(root);

      root.AnitaUI = {
        GetVersion: () => CONFIG.VERSION,
        Register: (config) => this.registerMod(config),
        Toggle: () => AnitaRenderer.toggle(),
        IsReady: () => true
      };

      this.setupEventListener();
      this.createOverlayButton(root);
      this.monitorEscapeMenu(root);
      if (this.registeredMods.length === 0) {
        this.registerMod({
          title: "Anita-UI",
          description: "No detected mods. Check your installed mods.",
          isDummy: true,
          elements: []
        });
      }

      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_ALIVE"
      }));
    },

    registerMod: function (config) {
      if (this.registeredMods.length === 1 && this.registeredMods[0].isDummy) {
        this.registeredMods = [];
        AnitaRenderer.menuArea.RemoveAndDeleteChildren();
        AnitaRenderer.contentArea.RemoveAndDeleteChildren();
      }

      AnitaPersistence.hydrateConfig(config);

      for (let i = 0; i < this.registeredMods.length; i++) {
        if (this.registeredMods[i].title === config.title) {
          return;
        }
      }
      if (config.title === "HP Colors") {
        applyHpColorsBakedPresetOnce(config);
      }
      this.registeredMods.push(config);
      AnitaRenderer.addTab(config.title, () => {
        AnitaRenderer.renderModSettings(config);
      });
      this.updateWindowWidth();
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_HANDSHAKE",
        mod_title: config.title
      }));
      AnitaPersistence.requestBootstrap(config, "core_handshake");
    },

    emitCurrentValues: function (config, meta) {
      if (!config || !Array.isArray(config.elements)) return;
      var forceEmit = !!(meta && meta.force_emit);
      var bulkEmit = !!(meta && meta.bulk_emit);
      if (config.title === "HP Colors") {
        writeHpSharedSnapshot(config);
      }
      if (!config.__anitaLastEmittedValues) config.__anitaLastEmittedValues = {};
      var lastValues = config.__anitaLastEmittedValues;
      var values = {};
      var hasValues = false;
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        if (!element || !element.id || element.currentValue === undefined) continue;
        var value = AnitaPersistence.sanitizeValue(element, element.currentValue);
        element.currentValue = value;
        values[element.id] = value;
        hasValues = true;
      }
      if (!hasValues) return;
      if (bulkEmit) {
        emitBulkUpdate(config.title, values, meta);
        for (var bulkId in values) {
          if (Object.prototype.hasOwnProperty.call(values, bulkId)) {
            lastValues[bulkId] = values[bulkId];
          }
        }
      } else {
        for (var id in values) {
          if (Object.prototype.hasOwnProperty.call(values, id)) {
            if (!forceEmit && Object.prototype.hasOwnProperty.call(lastValues, id) &&
                lastValues[id] === values[id]) {
              continue;
            }
            emitUpdate(config.title, id, values[id], meta);
          }
        }
      }
    },

    findRegisteredMod: function (modTitle) {
      for (var i = 0; i < this.registeredMods.length; i++) {
        if (this.registeredMods[i] && this.registeredMods[i].title === modTitle) {
          return this.registeredMods[i];
        }
      }
      return null;
    },

    emitPortableSync: function (config, reason) {
      if (!config || config.title !== "HP Colors") return;
      this.emitCurrentValues(config, {
        update_source: "core_auto_resync",
        skip_bridge_persist: true,
        sync_reason: String(reason || "tick"),
        force_emit: true,
        bulk_emit: true
      });
    },

    queuePortableSyncBurst: function (config, reason) {
      if (!config || config.title !== "HP Colors") return;
      var token = (config.__anitaPortableSyncBurstToken || 0) + 1;
      config.__anitaPortableSyncBurstToken = token;
      var delays = [0.35, 1.0, 2.0];
      for (var i = 0; i < delays.length; i++) {
        (function (delaySec, burstToken, burstIndex) {
          $.Schedule(delaySec, function () {
            if (!config || config.__anitaPortableSyncBurstToken !== burstToken) return;
            AnitaCore.emitPortableSync(config, String(reason || "burst") + "_" + String(burstIndex + 1));
          });
        })(delays[i], token, i);
      }
    },

    startPortableSyncLoop: function (config) {
      if (!config || config.title !== "HP Colors") return;
      config.__anitaPortableSyncReason = String(config.__anitaPortableSyncReason || "update");
      if (config.__anitaPortableSyncLoopStarted) return;
      config.__anitaPortableSyncLoopStarted = true;
      config.__anitaPortableSyncTicks = 0;

      var tick = () => {
        if (!config) return;
        if (this.findRegisteredMod(config.title) !== config) {
          config.__anitaPortableSyncLoopStarted = false;
          return;
        }
        config.__anitaPortableSyncTicks = (config.__anitaPortableSyncTicks || 0) + 1;
        this.emitPortableSync(config, "heartbeat_" + String(config.__anitaPortableSyncReason || "update"));
        if (config.__anitaPortableSyncTicks >= 4) {
          config.__anitaPortableSyncLoopStarted = false;
          return;
        }
        $.Schedule(3.0, tick);
      };

      $.Schedule(3.0, tick);
    },

    handleBulkUpdateEvent: function (data) {
      if (!data || !data.mod_title || !data.values || typeof data.values !== "object") return;
      var config = this.findRegisteredMod(data.mod_title);
      if (!config) return;

      var updateSource = String(data.update_source || "");
      var isBootstrap = updateSource === "bridge_bootstrap";
      var isReplaySource = isBootstrap ||
        updateSource === "ui_resync" ||
        updateSource === "ui_reset" ||
        updateSource === "ui_code_apply" ||
        updateSource === "core_auto_resync" ||
        updateSource === "ui_refresh_after_apply";

      var changed = false;
      var visibilityDirty = false;
      for (var settingId in data.values) {
        if (!Object.prototype.hasOwnProperty.call(data.values, settingId)) continue;
        var before = null;
        for (var i = 0; i < config.elements.length; i++) {
          if (config.elements[i] && config.elements[i].id === settingId) {
            before = config.elements[i].currentValue;
            break;
          }
        }
        if (!AnitaPersistence.applyUpdate(config, settingId, data.values[settingId])) continue;
        if (this.hasVisibilityDependents(config, settingId)) visibilityDirty = true;
        for (var j = 0; j < config.elements.length; j++) {
          if (config.elements[j] && config.elements[j].id === settingId && config.elements[j].currentValue !== before) {
            changed = true;
            break;
          }
        }
      }

      AnitaRenderer.syncSaveCodeInput(config);
      if (isBootstrap) config.__anitaBootstrapReceived = true;

      if (visibilityDirty || isBootstrap) {
        AnitaRenderer.refreshConditionalVisibility(config);
      }

      if (config.title === "HP Colors" && changed) {
        writeHpSharedSnapshot(config);
      }

      if (!isReplaySource && config.title === "HP Colors" && changed) {
        config.__anitaPortableSyncReason = "bulk_update";
        this.emitPortableSync(config, "bulk_update_immediate");
        this.queuePortableSyncBurst(config, "bulk_update");
        this.startPortableSyncLoop(config);
      }

      if (data.skip_bridge_persist || isReplaySource) return;
      var writeToken = (config.__anitaPendingWriteToken || 0) + 1;
      config.__anitaPendingWriteToken = writeToken;
      $.Schedule(2.0, function () {
        if (!config || config.__anitaPendingWriteToken !== writeToken) return;
        AnitaPersistence.persistConfig(config, !!data.force_persist);
      });
    },

    handleUpdateEvent: function (data) {
      if (!data || !data.mod_title || !data.setting_id) return;
      var config = this.findRegisteredMod(data.mod_title);
      if (!config) return;
      var updateSource = String(data.update_source || "");
      var isBootstrap = updateSource === "bridge_bootstrap";
      var isReplaySource = isBootstrap ||
        updateSource === "ui_resync" ||
        updateSource === "ui_reset" ||
        updateSource === "ui_code_apply" ||
        updateSource === "core_auto_resync" ||
        updateSource === "ui_refresh_after_apply";
      if (!AnitaPersistence.applyUpdate(config, data.setting_id, data.value)) {
        return;
      }
      AnitaRenderer.syncSaveCodeInput(config);
      if (isBootstrap) {
        config.__anitaBootstrapReceived = true;
      }

      if (!isReplaySource && config.title === "HP Colors") {
        config.__anitaPortableSyncReason = "update_" + String(data.setting_id);
        this.emitPortableSync(config, "update_" + String(data.setting_id) + "_immediate");
        this.queuePortableSyncBurst(config, "update_" + String(data.setting_id));
        this.startPortableSyncLoop(config);
      }

      var writeToken = (config.__anitaPendingWriteToken || 0) + 1;
      config.__anitaPendingWriteToken = writeToken;
      $.Schedule(2.0, function () {
        if (!config || config.__anitaPendingWriteToken !== writeToken) return;
        AnitaPersistence.persistConfig(config, false);
      });

      if (this.hasVisibilityDependents(config, data.setting_id)) {
        AnitaRenderer.refreshConditionalVisibility(config);
        return;
      }
      if (isBootstrap) {
        AnitaRenderer.refreshConditionalVisibility(config);
        return;
      }
    },

    handleBootstrapRequest: function (data) {
      if (!data || !data.mod_title) return;
      var config = this.findRegisteredMod(data.mod_title);
      if (!config) {
        return;
      }
      if (data.mod_title === "HP Colors") {
        if (!config.__anitaPortableSyncLoopStarted) {
          config.__anitaPortableSyncReason = String(config.__anitaPortableSyncReason || "bootstrap_request");
          this.startPortableSyncLoop(config);
        }
      }
      this.emitCurrentValues(config, {
        update_source: "bridge_bootstrap",
        skip_bridge_persist: true,
        bootstrap_reason: String(data.reason || "request"),
        force_emit: true,
        bulk_emit: true
      });
    },

    updateWindowWidth: function () {
      if (!AnitaRenderer.mainWindow) return;

      const count = this.registeredMods.length;
      let width = null;

      if (count === 1 && this.registeredMods[0].isDummy) {
        width = 500;
      } else if (count <= 4) {
        width = count * 300;
      }

      if (width) {
        AnitaRenderer.mainWindow.style.minWidth = width + "px";
      } else {
        AnitaRenderer.mainWindow.style.minWidth = "90%";
      }
    },

    setupEventListener: function () {
      try {
        $.RegisterForUnhandledEvent("ClientUI_FireOutput", (payload) => {
          if (typeof payload === "string" && payload.indexOf("ANITA_") === -1) return;
          try {
            let data = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            if (data && data.magic_word === "ANITA_REGISTER") {
              this.registerMod(data.config);
            } else if (data && data.magic_word === "ANITA_REQUEST_BOOTSTRAP") {
              this.handleBootstrapRequest(data);
            } else if (data && data.magic_word === "ANITA_BULK_UPDATE") {
              this.handleBulkUpdateEvent(data);
            } else if (data && data.magic_word === "ANITA_UPDATE") {
              this.handleUpdateEvent(data);
            }
          } catch (e) {
          }
        });
      } catch (e) {
      }
    },

    createOverlayButton: function (parent) {
      const existing = parent.FindChildTraverse(CONFIG.IDS.OVERLAY_BTN);
      if (existing) existing.DeleteAsync(0);

      const btn = $.CreatePanel("Button", parent, CONFIG.IDS.OVERLAY_BTN);
      btn.AddClass("AnitaOverlayBtn");
      this._overlayBtn = btn;

      btn.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", btn, "Anita-UI Settings"));
      btn.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", btn));

      btn.SetPanelEvent("onactivate", () => AnitaRenderer.toggle());
    },

    monitorEscapeMenu: function (root) {
      let hudPanel = this._hudPanel;
      let btn = this._overlayBtn;
      let nextDelay = CONFIG.UI.MONITOR_INTERVAL;

      if (!hudPanel || !hudPanel.IsValid || !hudPanel.IsValid()) {
        hudPanel = root.FindChildTraverse(CONFIG.IDS.HUD_ROOT);
        if (!hudPanel) {
          let p = $.GetContextPanel();
          while (p) {
            if (p.id === CONFIG.IDS.HUD_ROOT) { hudPanel = p; break; }
            p = p.GetParent();
          }
        }
        this._hudPanel = hudPanel || null;
      }

      if (!btn || !btn.IsValid || !btn.IsValid()) {
        btn = root.FindChildTraverse(CONFIG.IDS.OVERLAY_BTN);
        this._overlayBtn = btn || null;
      }

      if (typeof this._lastEscapeState !== "boolean") this._lastEscapeState = false;

      if (hudPanel && btn) {
        const isMenuOpen = hudPanel.BHasClass(CONFIG.CLASSES.ESCAPE_MENU);
        const stateChanged = this._lastEscapeState !== isMenuOpen;

        if (stateChanged || !btn.BHasClass(CONFIG.CLASSES.VISIBLE)) {
          btn.SetHasClass(CONFIG.CLASSES.VISIBLE, isMenuOpen);
        }
        if (!!btn.hittest !== isMenuOpen) {
          btn.hittest = isMenuOpen;
        }

        if (stateChanged) {
          if (isMenuOpen) {
            const attentionToken = (this._attentionToken || 0) + 1;
            this._attentionToken = attentionToken;
            btn.AddClass(CONFIG.CLASSES.ATTENTION);
            $.Schedule(4.0, () => {
              if (this._attentionToken !== attentionToken) return;
              if (btn && btn.IsValid && btn.IsValid()) {
                btn.RemoveClass(CONFIG.CLASSES.ATTENTION);
              }
            });
          } else {
            btn.RemoveClass(CONFIG.CLASSES.ATTENTION);
          }
        }

        this._lastEscapeState = isMenuOpen;

        if (!isMenuOpen && AnitaRenderer.isOpen) {
          AnitaRenderer.toggle(false);
        }

        nextDelay = isMenuOpen ? CONFIG.UI.MONITOR_INTERVAL : Math.max(CONFIG.UI.MONITOR_INTERVAL * 16, 0.75);
      } else {
        nextDelay = Math.max(CONFIG.UI.MONITOR_INTERVAL * 16, 0.75);
      }

      $.Schedule(nextDelay, () => this.monitorEscapeMenu(root));
    },

    getRoot: function (p) {
      while (p.GetParent && p.GetParent()) p = p.GetParent();
      return p;
    }
  };

  AnitaCore.init();

})();
