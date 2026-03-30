var AnitaUILogger = (function () {
  "use strict";

  return function (debugMode) {
    const cache = {
      lastMessages: {},
      spamCount: {}
    };

    return {
      setDebugMode: function (enabled) {
        debugMode = enabled;
      },

      info: function (message) {
        if (debugMode) {
          $.Msg("[Anita-UI] " + message);
        }
      },

      warn: function (message) {
        if (debugMode) {
          $.Msg("[Anita-UI] WARNING: " + message);
        }
      },

      error: function (message) {
        $.Msg("[Anita-UI] ERROR: " + message);
      },

      debug: function (message, allowRepeat) {
        if (!debugMode) return;

        if (!allowRepeat) {
          if (cache.lastMessages[message]) {
            cache.spamCount[message] = (cache.spamCount[message] || 0) + 1;
            return;
          }

          cache.lastMessages[message] = true;
        }

        $.Msg("[Anita-UI] DEBUG: " + message);
      },

      debugThrottled: function (message, threshold) {
        if (!debugMode) return;

        threshold = threshold || 10;
        cache.spamCount[message] = (cache.spamCount[message] || 0) + 1;

        if (cache.spamCount[message] % threshold === 1) {
          $.Msg("[Anita-UI] DEBUG: " + message + " (x" + cache.spamCount[message] + ")");
        }
      },

      event: function (eventName, data) {
        if (debugMode) {
          $.Msg("[Anita-UI] EVENT: " + eventName + " | Data: " + JSON.stringify(data));
        }
      },

      showSpamSummary: function () {
        if (!debugMode) return;

        var hasSpam = false;
        for (var msg in cache.spamCount) {
          if (cache.spamCount[msg] > 1) {
            if (!hasSpam) {
              $.Msg("[Anita-UI] === REPEATED MESSAGES SUMMARY ===");
              hasSpam = true;
            }
            $.Msg("[Anita-UI] - " + msg + " (x" + cache.spamCount[msg] + ")");
          }
        }
        if (hasSpam) {
          $.Msg("[Anita-UI] ====================================");
        }
      },

      clearCache: function () {
        cache.lastMessages = {};
        cache.spamCount = {};
      }
    };
  };
})();


(function () {
  "use strict";

  const CONFIG = {
    DEBUG_MODE: false,
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
      ACTIVE: "Active",
      VISIBLE: "Visible",
      CHECKED: "Checked",
      ATTENTION: "Attention"
    },
    EVENTS: {
      COMMS: "ClientUI_FireOutput",
      MAGIC_WORD: "ANITA_REGISTER",
      UPDATE: "ANITA_UPDATE"
    },
    UI: {
      TAB_MAX_CHARS: 17,
      MONITOR_INTERVAL: 0.05
    },
    PERSISTENCE_DEBUG: true
  };

  const Logger = AnitaUILogger(CONFIG.DEBUG_MODE);

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

  (function() {
    var test = '{"version":2,"values":{"hp_enabled":true}}';
    var encoded = AnitaBase64.encode(test);
    var decoded = AnitaBase64.decode(encoded);
    $.Msg("[Anita-UI][Base64] roundtrip ok=" + (decoded === test ? "1" : "0") + " encoded_len=" + encoded.length);
  })();

  function emitUpdate(modTitle, settingId, newValue) {
    var payload = {
      magic_word: "ANITA_UPDATE",
      mod_title: modTitle,
      setting_id: settingId,
      value: newValue
    };
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(payload));
  }

  const AnitaPersistence = {
    log: function (message) {
      if (!CONFIG.PERSISTENCE_DEBUG) return;
      $.Msg("[Anita-UI][Persist] " + message);
    },

    logForConfig: function (config, message) {
      var title = (config && config.title) ? String(config.title) : "unknown";
      this.log(title + " | " + message);
    },

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

    CONVAR_KEY: "deadlock_hero_debuts_seen",
    TOKEN_PREFIX: "ANITA-v1-",

    getTokenRegex: function (ns) {
      return new RegExp("\\[ANITA-v1-" + ns + "\\]:[A-Za-z0-9_-]+");
    },

    getCleanupRegex: function (ns) {
      return new RegExp("\\[ANITA-v1-" + ns + "\\]:[A-Za-z0-9_-]*", "g");
    },

    canPersistViaConvar: function () {
      return typeof GameInterfaceAPI !== "undefined" &&
        !!GameInterfaceAPI &&
        typeof GameInterfaceAPI.GetSettingString === "function" &&
        typeof GameInterfaceAPI.ConsoleCommand === "function";
    },

    getElements: function (config) {
      return (config && Array.isArray(config.elements)) ? config.elements : [];
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

      if (type === "stepper") {
        var nextNumber = Number(value);
        if (!isFinite(nextNumber)) nextNumber = Number(fallback);
        if (!isFinite(nextNumber)) nextNumber = 0;
        var step = Number(element.step);
        if (!isFinite(step) || step === 0) step = 1;
        if (Math.round(step) === step) {
          return Math.round(nextNumber);
        }
        return parseFloat(nextNumber.toFixed(2));
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

    parseStoredPayload: function (config, raw, sourceLabel) {
      var text = String(raw || "");
      if (!text) return null;

      var parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        Logger.debugThrottled("Persistence parse failed [" + sourceLabel + "] for " + (config.title || "unknown"), 50);
        return null;
      }

      if (!parsed || typeof parsed !== "object" || !parsed.values || typeof parsed.values !== "object") {
        Logger.debugThrottled("Persistence payload invalid [" + sourceLabel + "] for " + (config.title || "unknown"), 50);
        return null;
      }

      var values = {};
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) continue;
        if (!Object.prototype.hasOwnProperty.call(parsed.values, element.id)) continue;
        values[element.id] = this.sanitizeValue(element, parsed.values[element.id]);
      }

      return {
        raw: text,
        values: values
      };
    },

    readPrimaryPayload: function (config) {
      if (!this.canPersistViaConvar()) return null;
      var ns = this.normalizeNamespace(config && config.storageNamespace);
      if (!ns) return null;

      var convarRaw = "";
      try {
        convarRaw = String(GameInterfaceAPI.GetSettingString(this.CONVAR_KEY) || "");
      } catch (e) {
        this.logForConfig(config, "convar read threw: " + e);
        return null;
      }

      var match = convarRaw.match(this.getTokenRegex(ns));
      if (!match) {
        this.logForConfig(config, "convar token not found in " + this.CONVAR_KEY);
        return null;
      }

      var tokenPart = match[0];
      var encoded = tokenPart.split("]:")[1] || "";
      if (!encoded) return null;

      var raw = "";
      try {
        raw = AnitaBase64.decode(encoded);
      } catch (e) {
        this.logForConfig(config, "base64 decode failed: " + e);
        return null;
      }

      this.logForConfig(config, "convar token found ns=" + ns + " encoded_len=" + encoded.length);
      return this.parseStoredPayload(config, raw, "convar");
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

      if (!this.hasPersistentConfig(config)) {
        config.__anitaLastPersistedRaw = "";
        this.logForConfig(config, "persistence disabled");
        return;
      }

      var persisted = this.readPrimaryPayload(config);
      if (persisted) {
        hydrateSource = "primary";
      } else {
        persisted = this.readFallbackPayload(config);
        if (persisted) hydrateSource = "fallback";
      }

      if (persisted) {
        this.applyResolvedValues(config, persisted.values);
        config.__anitaLastPersistedRaw = persisted.raw;
        this.logForConfig(
          config,
          "hydrate source=" + hydrateSource +
          " primaryKey=" + this.getPrimaryKey(config) +
          " fallbackKey=" + this.getFallbackKey(config)
        );
        return;
      }

      var legacyValues = this.readLegacyValues(config);
      if (legacyValues) {
        this.applyResolvedValues(config, legacyValues);
        hydrateSource = "legacy";
      }

      this.logForConfig(config, "hydrate source=" + hydrateSource + " primaryKey=" + this.getPrimaryKey(config));

      config.__anitaLastPersistedRaw = "";
    },

    buildStoredPayload: function (config) {
      var payload = {
        version: this.getVersion(config),
        values: {}
      };
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) continue;
        var value = this.sanitizeValue(
          element,
          element.currentValue !== undefined ? element.currentValue : element.defaultValue
        );
        element.currentValue = value;
        payload.values[element.id] = value;
      }
      return JSON.stringify(payload);
    },

    persistConfig: function (config) {
      if (!this.hasPersistentConfig(config)) return false;

      var raw = this.buildStoredPayload(config);
      if (!raw) return false;
      if (raw === String(config.__anitaLastPersistedRaw || "")) {
        this.logForConfig(config, "write skipped unchanged");
        return false;
      }

      var ns = this.normalizeNamespace(config.storageNamespace);
      var encoded = AnitaBase64.encode(raw);
      var token = "[ANITA-v1-" + ns + "]:" + encoded;

      if (this.canPersistViaConvar()) {
        try {
          var current = String(GameInterfaceAPI.GetSettingString(this.CONVAR_KEY) || "");
          // Use * in cleanup regex to also remove malformed empty-payload tokens
          var cleaned = current.replace(this.getCleanupRegex(ns), "").replace(/,,+/g, ",").replace(/^,|,$/, "");
          var finalValue = (cleaned ? cleaned + "," : "") + token;
          // Double-quote the value to protect [ ] from Source engine console bracket parsing
          GameInterfaceAPI.ConsoleCommand(this.CONVAR_KEY + ' "' + finalValue + '"');
          this.logForConfig(config, "convar write ns=" + ns + " encoded_len=" + encoded.length);

          // Verify write round-trips
          var readBack = "";
          try {
            readBack = String(GameInterfaceAPI.GetSettingString(this.CONVAR_KEY) || "");
          } catch (eRB) {}
          this.logForConfig(config, "convar readback found_token=" + (readBack.indexOf("[ANITA-v1-" + ns + "]") !== -1 ? "1" : "0"));
        } catch (e) {
          this.logForConfig(config, "convar write threw: " + e);
        }
      } else {
        this.logForConfig(config, "convar write unavailable (canPersistViaConvar=false)");
      }

      // Session fallback: always write to root panel attribute for within-session resilience
      try {
        var rootPanel = $.GetContextPanel();
        while (rootPanel && rootPanel.GetParent && rootPanel.GetParent()) rootPanel = rootPanel.GetParent();
        if (rootPanel && rootPanel.SetAttributeString) {
          rootPanel.SetAttributeString("anita_v1_" + ns, encoded);
          this.logForConfig(config, "session write ns=" + ns);
        }
      } catch (eSess) {
        this.logForConfig(config, "session write threw: " + eSess);
      }

      config.__anitaLastPersistedRaw = raw;
      return true;
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
      });
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

      const btn = $.CreatePanel("Button", row, "");
      btn.AddClass("AnitaCyclerBtn");

      const valLbl = $.CreatePanel("Label", btn, "");

      const options = config.options || ["OFF", "ON"];

      let idx = (config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || 0);

      if (idx < 0 || idx >= options.length) idx = 0;

      const updateVisuals = () => {
        valLbl.text = options[idx];
      };

      updateVisuals();

      btn.SetPanelEvent("onactivate", () => {
        idx = (idx + 1) % options.length;
        updateVisuals();

        config.currentValue = idx;

        if (config.id && modTitle) {
          emitUpdate(modTitle, config.id, idx);
        }

        if (config.onChange) config.onChange(idx, options[idx]);
      });

      return row;
    },

    createColorPicker: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");
      row.style.overflow = "noclip";

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Color";
      lbl.AddClass("AnitaLabel");

      let currentColor = (config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || "#FF0000");

      const defaultPalette = [
        { name: "Red", code: "#FF0000" },
        { name: "Green", code: "#00FF00" },
        { name: "Blue", code: "#0000FF" },
        { name: "White", code: "#FFFFFF" },
        { name: "Cyan", code: "#00FFFF" },
        { name: "Magenta", code: "#FF00FF" },
        { name: "Yellow", code: "#FFFF00" },
        { name: "Black", code: "#000000" }
      ];


      let customPalette = [];
      if (config.palette && config.palette.length > 0) {
        customPalette = config.palette.slice(0, 8);

        if (config.defaultValue) {
          let hasDefault = false;
          for (let c of customPalette) { if (c.code === config.defaultValue) hasDefault = true; }
          if (!hasDefault) {
            for (let c of defaultPalette) { if (c.code === config.defaultValue) hasDefault = true; }
          }

          if (!hasDefault) {
            if (customPalette.length < 8) {
              customPalette.push({ name: "Default", code: config.defaultValue });
            } else {
              customPalette.push({ name: "Default", code: config.defaultValue });
            }
          }
        }
      }

      let palettePanel = null;

      function closePalette() {
        if (palettePanel) {
          palettePanel.DeleteAsync(0);
          palettePanel = null;
        }
      }

      function selectColor(colorCode) {
        currentColor = colorCode;
        config.currentValue = currentColor;


        const previewBtn = row.FindChildTraverse("ColorPreviewBtn");
        if (previewBtn) previewBtn.style.backgroundColor = currentColor;

        if (config.id && modTitle) {
          emitUpdate(modTitle, config.id, currentColor);
        }
        if (config.onChange) config.onChange(currentColor);

        closePalette();
      }

      function openPalette(colsToShow) {
        if (palettePanel) {
          closePalette();
          return;
        }

        palettePanel = $.CreatePanel("Panel", parent, "");
        palettePanel.AddClass("AnitaColorPalette");
        const isQuickMode = (customPalette.length > 0);
        palettePanel.style.transform = isQuickMode ? "translate3d( 152px, 15px, 0px )" : "translate3d( 155px, 45px, 0px )";
        palettePanel.style.uiScale = isQuickMode ? "100%" : "99%";

        if (colsToShow && colsToShow.length > 0) {
          colsToShow.forEach(colorDef => {
            const swatch = $.CreatePanel("Panel", palettePanel, "");
            swatch.AddClass("AnitaColorSwatch");
            swatch.style.backgroundColor = colorDef.code;
            swatch.SetPanelEvent("onactivate", () => selectColor(colorDef.code));
          });
          const sep = $.CreatePanel("Panel", palettePanel, "");
          sep.style.width = "94%";
          sep.style.height = "1px";
          sep.style.backgroundColor = "#444";
          sep.style.margin = "7px 2px";
        }

        defaultPalette.forEach(colorDef => {
          const swatch = $.CreatePanel("Panel", palettePanel, "");
          swatch.AddClass("AnitaColorSwatch");
          swatch.style.backgroundColor = colorDef.code;
          swatch.SetPanelEvent("onactivate", () => selectColor(colorDef.code));
        });


      }

      if (customPalette.length === 0) {
        const previewBtn = $.CreatePanel("Panel", row, "ColorPreviewBtn");
        previewBtn.AddClass("AnitaColorPickerPreview");
        previewBtn.style.backgroundColor = currentColor;

        previewBtn.SetPanelEvent("onactivate", () => openPalette(null));
      } else {
        const quickCount = Math.min(4, customPalette.length);
        const quickColors = customPalette.slice(0, quickCount);
        const overflowColors = customPalette.slice(quickCount);

        quickColors.forEach(c => {
          const swatch = $.CreatePanel("Panel", row, "");
          swatch.AddClass("AnitaQuickSwatch");
          swatch.style.backgroundColor = c.code;
          swatch.SetPanelEvent("onactivate", () => selectColor(c.code));
        });

        const plusBtn = $.CreatePanel("Button", row, "");
        plusBtn.AddClass("AnitaColorPickerPlusBtn");
        const lblPlus = $.CreatePanel("Label", plusBtn, "");
        lblPlus.text = "+";

        plusBtn.SetPanelEvent("onactivate", () => openPalette(overflowColors));
      }

      return row;
    }
  };

  const AnitaRenderer = {
    mainWindow: null,
    backdrop: null,
    navBar: null,
    menuArea: null,
    contentArea: null,
    isOpen: false,

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
        onClick();
      });

      if (this.menuArea.GetChildCount() <= 4) {
        btn.AddClass("Active"); onClick();
      }
    },

    renderModSettings: function (config) {
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
        if (config.elements) {
          config.elements.forEach(el => {
            if (el.id && el.currentValue !== undefined) {
              emitUpdate(config.title, el.id, el.currentValue);
            }
          });
        }
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

      if (config.elements) {
        config.elements.forEach(el => {
          switch (el.type) {
            case "toggle": AnitaComponents.createToggle(container, el, config.title); break;
            case "stepper": AnitaComponents.createStepper(container, el, config.title); break;
            case "button": AnitaComponents.createButton(container, el, config.title); break;
            case "cycler": AnitaComponents.createCycler(container, el, config.title); break;
            case "colorpicker": AnitaComponents.createColorPicker(container, el, config.title); break;
          }
        });
      }
    },

  }

  const AnitaCore = {
    registeredMods: [],

    init: function () {
      const root = this.getRoot($.GetContextPanel());
      Logger.info("Initializing Anita-UI Core");

      AnitaRenderer.initWindow(root);

      root.AnitaUI = {
        GetVersion: () => CONFIG.VERSION,
        Register: (config) => this.registerMod(config),
        Toggle: () => AnitaRenderer.toggle(),
        IsReady: () => true,
        SetDebugMode: (enabled) => {
          CONFIG.DEBUG_MODE = enabled;
          Logger.setDebugMode(enabled);
          Logger.info("Debug Mode " + (enabled ? "enabled" : "disabled"));
        },
        ShowSpamSummary: () => {
          Logger.showSpamSummary();
        },
        ClearLogCache: () => {
          Logger.clearCache();
          Logger.info("Log cache cleared");
        }
      };

      this.setupEventListener();
      this.createOverlayButton(root);
      this.monitorEscapeMenu(root);

      Logger.info("Anita-UI Core initialized successfully");

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
          Logger.debugThrottled("Mod already registered: " + config.title, 200);
          return;
        }
      }
      this.registeredMods.push(config);

      AnitaRenderer.addTab(config.title, () => {
        AnitaRenderer.renderModSettings(config);
      });
      this.updateWindowWidth();
      Logger.info("Mod registered: " + config.title);

      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_HANDSHAKE",
        mod_title: config.title
      }));
      Logger.info("Sent HANDSHAKE to mod: " + config.title);

      this.emitCurrentValues(config);
    },

    emitCurrentValues: function (config) {
      if (!config || !Array.isArray(config.elements)) return;
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        if (!element || !element.id || element.currentValue === undefined) continue;
        emitUpdate(config.title, element.id, element.currentValue);
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

    handleUpdateEvent: function (data) {
      if (!data || !data.mod_title || !data.setting_id) return;
      var config = this.findRegisteredMod(data.mod_title);
      if (!config) return;
      if (!AnitaPersistence.applyUpdate(config, data.setting_id, data.value)) return;
      AnitaPersistence.persistConfig(config);
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
          try {
            let data = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            if (data && data.magic_word === "ANITA_REGISTER") {
              this.registerMod(data.config);
              Logger.debugThrottled("Event received: REGISTER for " + data.config.title, 200);
            } else if (data && data.magic_word === "ANITA_UPDATE") {
              this.handleUpdateEvent(data);
            }
          } catch (e) {
            Logger.debugThrottled("Malformed event received", 200);
          }
        });
        Logger.info("Event listener configured");
      } catch (e) {
        Logger.error("Error setting up listener: " + e);
      }
    },

    createOverlayButton: function (parent) {
      if (parent.FindChildTraverse(CONFIG.IDS.OVERLAY_BTN)) parent.FindChildTraverse(CONFIG.IDS.OVERLAY_BTN).DeleteAsync(0);

      const btn = $.CreatePanel("Button", parent, CONFIG.IDS.OVERLAY_BTN);
      btn.AddClass("AnitaOverlayBtn");

      btn.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", btn, "Anita-UI Settings"));
      btn.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", btn));

      btn.SetPanelEvent("onactivate", () => AnitaRenderer.toggle());
    },

    monitorEscapeMenu: function (root) {
      let hudPanel = root.FindChildTraverse(CONFIG.IDS.HUD_ROOT);
      const btn = root.FindChildTraverse(CONFIG.IDS.OVERLAY_BTN);

      if (!this._lastEscapeState) this._lastEscapeState = false;

      if (!hudPanel) {
        let p = $.GetContextPanel();
        while (p) {
          if (p.id === CONFIG.IDS.HUD_ROOT) { hudPanel = p; break; }
          p = p.GetParent();
        }
      }

      if (hudPanel && btn) {
        const isMenuOpen = hudPanel.BHasClass(CONFIG.CLASSES.ESCAPE_MENU);
        btn.SetHasClass(CONFIG.CLASSES.VISIBLE, isMenuOpen);
        btn.hittest = isMenuOpen;

        if (isMenuOpen && !this._lastEscapeState) {
          btn.AddClass(CONFIG.CLASSES.ATTENTION);
          $.Schedule(4.0, () => {
            if (btn && btn.IsValid()) {
              btn.RemoveClass(CONFIG.CLASSES.ATTENTION);
            }
          });
        }

        this._lastEscapeState = isMenuOpen;

        if (!isMenuOpen && AnitaRenderer.isOpen) {
          AnitaRenderer.toggle(false);
          Logger.debug("Window closed by escape menu");
        }
      }

      $.Schedule(0.05, () => this.monitorEscapeMenu(root));
    },

    getRoot: function (p) {
      while (p.GetParent && p.GetParent()) p = p.GetParent();
      return p;
    }
  };

  AnitaCore.init();

})();
