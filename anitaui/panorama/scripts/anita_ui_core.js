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
    }
  };

  const Logger = AnitaUILogger(CONFIG.DEBUG_MODE);

  function emitUpdate(modTitle, settingId, newValue) {
    var payload = {
      magic_word: "ANITA_UPDATE",
      mod_title: modTitle,
      setting_id: settingId,
      value: newValue
    };
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(payload));
    AnitaStorage.set(modTitle, settingId, newValue);
  }

  const AnitaStorage = (function () {
    let _backend = null;
    let _backendName = "in-memory only";
    const _tempStorage = {};
    const STORAGE_DEBUG = true;
    const STORAGE_NAMESPACE = "anitaui";

    const sanitize = (str) => str.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const makeKey = (modTitle, settingId) => "anitaui_" + sanitize(modTitle) + "_" + sanitize(settingId);

    function slog(msg) {
      if (!STORAGE_DEBUG) return;
      $.Msg("[AnitaUI][Storage] " + msg);
    }

    function safeJson(value) {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return String(value);
      }
    }

    function tryCall(target, methodName, argsA, argsB) {
      if (!target || typeof target[methodName] !== "function") return { ok: false };
      try {
        return { ok: true, value: target[methodName].apply(target, argsA || []) };
      } catch (eA) {
        if (!argsB) return { ok: false, err: eA };
        try {
          return { ok: true, value: target[methodName].apply(target, argsB) };
        } catch (eB) {
          return { ok: false, err: eB };
        }
      }
    }

    function bindBackend(candidate) {
      if (!candidate) return null;
      const getMethods = ["getItem", "GetItem", "get", "Get", "getString", "GetString", "GetSettingString", "GetSetting", "GetLocalSetting"]; 
      const setMethods = ["setItem", "SetItem", "set", "Set", "setString", "SetString", "SetSettingString", "SetSetting", "SetLocalSetting"];
      const removeMethods = ["removeItem", "RemoveItem", "remove", "Delete", "DeleteKey", "RemoveSetting", "DeleteSetting"];

      function callGetter(key) {
        for (let i = 0; i < getMethods.length; i++) {
          const res = tryCall(candidate, getMethods[i], [key], [STORAGE_NAMESPACE, key]);
          if (res.ok) return res.value;
        }
        return null;
      }

      function callSetter(key, value) {
        for (let i = 0; i < setMethods.length; i++) {
          const res = tryCall(candidate, setMethods[i], [key, value], [STORAGE_NAMESPACE, key, value]);
          if (res.ok) return true;
        }
        return false;
      }

      function callRemover(key) {
        for (let i = 0; i < removeMethods.length; i++) {
          const res = tryCall(candidate, removeMethods[i], [key], [STORAGE_NAMESPACE, key]);
          if (res.ok) return true;
        }
        return false;
      }

      const hasGet = getMethods.some(m => typeof candidate[m] === "function");
      const hasSet = setMethods.some(m => typeof candidate[m] === "function");
      if (!hasGet || !hasSet) return null;

      return {
        getItem: callGetter,
        setItem: callSetter,
        removeItem: callRemover
      };
    }

    function detectBackend() {
      try {
        const candidates = [
          { name: "persistent", ref: $.persistentStorage, source: "$.persistentStorage" },
          { name: "persistent", ref: $.PersistentStorage, source: "$.PersistentStorage" },
          { name: "persistent", ref: $.persistentstorage, source: "$.persistentstorage" },
          { name: "game-settings", ref: (typeof GameInterfaceAPI !== "undefined") ? GameInterfaceAPI : null, source: "GameInterfaceAPI" },
          { name: "localStorage", ref: (typeof localStorage !== "undefined") ? localStorage : null, source: "localStorage" }
        ];
        for (let i = 0; i < candidates.length; i++) {
          const c = candidates[i];
          if (STORAGE_DEBUG) {
            const known = [];
            ["getItem", "GetItem", "get", "Get", "getString", "GetString", "GetSettingString", "GetSetting", "GetLocalSetting", "setItem", "SetItem", "set", "Set", "setString", "SetString", "SetSettingString", "SetSetting", "SetLocalSetting", "removeItem", "RemoveItem", "remove", "Delete", "DeleteKey", "RemoveSetting", "DeleteSetting"].forEach((m) => {
              if (c.ref && typeof c.ref[m] === "function") known.push(m);
            });
            slog("Candidate " + c.source + " methods=" + (known.length ? known.join(",") : "none"));
          }
          const bound = bindBackend(candidates[i].ref);
          if (bound) {
            const probeKey = "anitaui_probe_key";
            const probeValue = "anitaui_probe_value";
            try {
              const wrote = bound.setItem(probeKey, probeValue);
              const read = bound.getItem(probeKey);
              const ok = (read === probeValue || String(read) === probeValue || wrote === true);
              if (ok) {
                slog("Backend detected: " + candidates[i].source + " [OK]");
                return { name: candidates[i].name, backend: bound };
              }
            } catch (e) {
              slog("Backend probe failed: " + candidates[i].source + " err=" + e);
            }
          }
        }
      } catch (e) { }
      return { name: "in-memory only", backend: null };
    }

    function refreshBackend() {
      const found = detectBackend();
      if (_backend !== found.backend || _backendName !== found.name) {
        _backend = found.backend;
        _backendName = found.name;
        $.Msg("[AnitaUI] Storage: " + _backendName);
        slog("Mode change => " + _backendName);
      }
      return _backend !== null;
    }

    function debugPulse() {
      if (!STORAGE_DEBUG) return;
      refreshBackend();
      let mode = _backendName;
      let memCount = 0;
      try {
        memCount = Object.keys(_tempStorage).length;
      } catch (e) {
        memCount = -1;
      }
      slog("pulse mode=" + mode + " memKeys=" + memCount);
      $.Schedule(5.0, debugPulse);
    }

    function decodeValue(raw) {
      if (raw === null || raw === undefined) return null;
      if (typeof raw !== "string") return raw;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return raw;
      }
    }

    function encodeValue(value) {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return value;
      }
    }

    refreshBackend();
    $.Schedule(1.0, debugPulse);

    return {
      get available() {
        return refreshBackend();
      },
      refresh: refreshBackend,
      makeKey: makeKey,

      get: function (modTitle, settingId) {
        refreshBackend();
        const key = makeKey(modTitle, settingId);
        try {
          if (_backend) {
            const decoded = decodeValue(_backend.getItem(key));
            slog("GET " + key + " => " + safeJson(decoded) + " backend=" + _backendName);
            return decoded;
          }
          const memVal = _tempStorage[key];
          slog("GET " + key + " => " + safeJson(memVal) + " backend=in-memory");
          return memVal;
        } catch (e) {
          slog("GET " + key + " failed: " + e);
          return null;
        }
      },

      set: function (modTitle, settingId, value) {
        refreshBackend();
        const key = makeKey(modTitle, settingId);
        try {
          if (_backend) {
            _backend.setItem(key, encodeValue(value));
            slog("SET " + key + " <= " + safeJson(value) + " backend=" + _backendName);
          } else {
            slog("SET " + key + " <= " + safeJson(value) + " backend=in-memory");
          }
          _tempStorage[key] = value;
        } catch (e) {
          slog("SET " + key + " failed: " + e);
        }
      },

      remove: function (modTitle, settingId) {
        refreshBackend();
        const key = makeKey(modTitle, settingId);
        try {
          if (_backend && _backend.removeItem) _backend.removeItem(key);
          slog("REMOVE " + key + " backend=" + _backendName);
          delete _tempStorage[key];
        } catch (e) {
          slog("REMOVE " + key + " failed: " + e);
        }
      },

      removeAllForMod: function (modTitle) {
        refreshBackend();
        const prefix = "anitaui_" + sanitize(modTitle) + "_";
        slog("REMOVE_ALL prefix=" + prefix + " backend=" + _backendName + " (memory keys only)");
        try {
          Object.keys(_tempStorage).forEach(key => {
            if (key.indexOf(prefix) === 0) delete _tempStorage[key];
          });
        } catch (e) {
          slog("REMOVE_ALL failed: " + e);
        }
      }
    };
  })();


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

        if (!btn?.IsValid?.()) return;
        btn.AddClass("Activated");
        $.Schedule(0.1, () => {
          if (!btn?.IsValid?.()) return;
          btn.RemoveClass("Activated");
        });
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

        if (config.elements.length > 0 && !config.isDummy) {
          const resetBtn = AnitaComponents.createButton(container, {
            label: "Reset to Defaults",
            onClick: () => {
              AnitaStorage.removeAllForMod(config.title);
              config.elements.forEach(el => {
                if (el.id && el.defaultValue !== undefined) {
                  el.currentValue = el.defaultValue;
                  emitUpdate(config.title, el.id, el.defaultValue);
                }
              });
              this.renderModSettings(config);
            }
          }, config.title);
          resetBtn.AddClass("AnitaResetBtn");
        }
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

    hydrateSettings: function (config) {
      if (!config.elements) return;
      if (!AnitaStorage.available) {
        Logger.warn("Storage backend unavailable while hydrating " + config.title + "; using defaults.");
        return;
      }

      config.elements.forEach(el => {
        if (!el.id) return;

        const val = AnitaStorage.get(config.title, el.id);
        if (val === null || val === undefined) return;

        let isValid = false;
        let finalVal = val;

        switch (el.type) {
          case "toggle":
            isValid = (typeof val === "boolean");
            break;
          case "stepper":
            isValid = (typeof val === "number" && !isNaN(val));
            if (isValid) {
              if (el.min !== undefined && finalVal < el.min) finalVal = el.min;
              if (el.max !== undefined && finalVal > el.max) finalVal = el.max;
            }
            break;
          case "cycler":
            isValid = (typeof val === "number" && el.options && val >= 0 && val < el.options.length);
            break;
          case "colorpicker":
            isValid = (typeof val === "string" && /^#[0-9A-F]{6}$/i.test(val));
            break;
          default:
            isValid = true;
        }

        if (isValid) {
          el.currentValue = finalVal;
          Logger.info("Hydrated setting " + config.title + ":" + el.id + " = " + finalVal);
          if (finalVal !== val) AnitaStorage.set(config.title, el.id, finalVal);
        } else {
          el.currentValue = el.defaultValue;
          AnitaStorage.set(config.title, el.id, el.defaultValue);
          Logger.warn("Invalid storage value for " + config.title + ":" + el.id + ". Reset to default.");
        }
      });
    },

    registerMod: function (config) {

      if (this.registeredMods.length === 1 && this.registeredMods[0].isDummy) {
        this.registeredMods = [];
        AnitaRenderer.menuArea.RemoveAndDeleteChildren();
        AnitaRenderer.contentArea.RemoveAndDeleteChildren();
      }

      for (let i = 0; i < this.registeredMods.length; i++) {
        if (this.registeredMods[i].title === config.title) {
          Logger.debugThrottled("Mod already registered: " + config.title, 200);
          return;
        }
      }

      this.hydrateSettings(config);
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
