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
  
  function runConsoleCommand(cmd) {
    if (!cmd || typeof cmd !== "string") return false;
    cmd = cmd.trim();
    if (cmd === "") return false;

    try {
      if (typeof GameInterfaceAPI !== "undefined" && GameInterfaceAPI.ConsoleCommand) {
        GameInterfaceAPI.ConsoleCommand(cmd);
        return true;
      }
      if (typeof Game !== "undefined" && Game.ConsoleCommand) {
        Game.ConsoleCommand(cmd);
        return true;
      }
      
      Logger.warn("Unsupported runtime: No console API found for: " + cmd);
      return false;
    } catch (e) {
      Logger.warn("Failed to execute console command: " + cmd);
      return false;
    }
  }

  const AnitaStorage = (function () {
    "use strict";

    /*
     * AnitaStorage — Push-Pull Persistent Storage
     *
     * SAVE (push): setinfo → host_writeconfig → config.cfg
     * LOAD (pull): exec anitaui_settings.cfg → panorama_dispatch_event → JS listener
     *
     * NOTE: To enable loading, create citadel/cfg/anitaui_settings.cfg with:
     *   panorama_dispatch_event AnitaSettingsLoad "anitaui__modname__settingid" "type:value"
     *   (one line per saved setting)
     *
     * Currently, the CFG file cannot be auto-generated from JS (no file I/O).
     * The load mechanism is forward-compatible — once Valve exposes file write
     * APIs or a companion tool generates the CFG, load will work automatically.
     *
     * For now, settings are saved to ConVars (persist in config.cfg) and
     * can be read back if a CFG file is manually created or auto-generated
     * by an external tool.
     */

    let _cache = {};
    let _hydrating = false;
    let _writeTimer = null;
    let _dirty = false;

    const ENCODERS = {
      boolean: v => v ? "1" : "0",
      number: v => String(v),
      string: v => v
    };

    const DECODERS = {
      boolean: s => s === "1",
      number: s => {
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
      },
      string: s => s
    };

    function normalizeModKey(mod) {
      return mod.replace(/\s+/g, "_").toLowerCase();
    }

    function makeKey(mod, id) {
      return "anitaui_" + normalizeModKey(mod) + "__" + id;
    }

    function flush() {
      if (!_dirty) return;
      _writeTimer = null;
      _dirty = false;

      for (const mod in _cache) {
        const settings = _cache[mod];
        for (const id in settings) {
          const val = settings[id];
          const key = makeKey(mod, id);
          const type = typeof val;
          const encoded = (ENCODERS[type] || ENCODERS.string)(val);
          const payload = type + ":" + encoded;

          runConsoleCommand("setinfo " + key + " \"" + payload + "\"");
        }
      }

      runConsoleCommand("setinfo anitaui_schema_v \"1\"");
      runConsoleCommand("host_writeconfig");
      Logger.debug("[Storage] flushed to config.cfg");
    }

    function markDirty() {
      _dirty = true;
      if (_writeTimer) {
        $.CancelScheduled(_writeTimer);
      }
      _writeTimer = $.Schedule(0.5, flush);
    }

    return {
      get: function (modTitle, settingId) {
        const mod = normalizeModKey(modTitle);
        if (!_cache[mod]) return undefined;
        return _cache[mod][settingId];
      },

      set: function (modTitle, settingId, value) {
        const mod = normalizeModKey(modTitle);
        if (!_cache[mod]) _cache[mod] = {};
        _cache[mod][settingId] = value;

        if (!_hydrating) {
          markDirty();
        }
      },

      remove: function (modTitle, settingId) {
        const mod = normalizeModKey(modTitle);
        if (_cache[mod] && _cache[mod][settingId] !== undefined) {
          delete _cache[mod][settingId];
          markDirty();
        }
      },

      removeAllForMod: function (modTitle) {
        const mod = normalizeModKey(modTitle);
        if (_cache[mod]) {
          delete _cache[mod];
          markDirty();
        }
      },

      getAll: function (modTitle) {
        const mod = normalizeModKey(modTitle);
        return _cache[mod] || null;
      },

      beginHydration: function () {
        _hydrating = true;
      },

      endHydration: function () {
        _hydrating = false;
      },

      flush: function () {
        if (_writeTimer) {
          $.CancelScheduled(_writeTimer);
        }
        flush();
      },

      onSettingLoaded: function (modTitle, settingId, value) {
        const mod = normalizeModKey(modTitle);
        if (!_cache[mod]) _cache[mod] = {};
        _cache[mod][settingId] = value;
      },

      DECODERS: DECODERS
    };
  })();

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

      if (!config.isDummy) {
        const resetBtn = AnitaComponents.createButton(container, {
          label: "Reset to Defaults",
          onClick: () => {
            AnitaStorage.removeAllForMod(config.title);
            AnitaStorage.flush();
            if (config.elements) {
              config.elements.forEach(el => {
                el.currentValue = el.defaultValue;
              });
            }
            this.renderModSettings(config);
          }
        }, config.title);
        resetBtn.AddClass("AnitaResetBtn");
      }
    },

  }

  const AnitaCore = {
    registeredMods: [],
    _loadListenerSupported: false,

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
      this.setupLoadListener();
      this.createOverlayButton(root);
      this.monitorEscapeMenu(root);

      if (this._loadListenerSupported) {
        runConsoleCommand("exec anitaui_settings.cfg");
      }
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

      for (let i = 0; i < this.registeredMods.length; i++) {
        if (this.registeredMods[i].title === config.title) {
          Logger.debugThrottled("Mod already registered: " + config.title, 200);
          return;
        }
      }

      AnitaStorage.beginHydration();
      try {
        const saved = AnitaStorage.getAll(config.title);
        if (saved && config.elements) {
          config.elements.forEach(el => {
            if (el.id && saved[el.id] !== undefined) {
              el.currentValue = saved[el.id];
            }
          });
        }
      } catch (e) {
        Logger.error("Hydration error: " + e);
      } finally {
        AnitaStorage.endHydration();
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

    setupLoadListener: function () {
      try {
        $.RegisterForUnhandledEvent("AnitaSettingsLoad", (key, payload) => {
          try {
            if (!key || !key.startsWith("anitaui_")) return;
            if (!payload || typeof payload !== "string") return;

            const colonIdx = payload.indexOf(":");
            if (colonIdx === -1) return;

            const type = payload.substring(0, colonIdx);
            const encoded = payload.substring(colonIdx + 1);

            const decoder = AnitaStorage.DECODERS[type];
            if (!decoder) {
              Logger.warn("No decoder for type: " + type);
              return;
            }

            const val = decoder(encoded);
            const parts = key.substring(8).split("__");
            if (parts.length < 2) return;

            const mod = parts[0];
            const id = parts[1];

            AnitaStorage.onSettingLoaded(mod, id, val);
            Logger.debug("[Storage] Loaded " + mod + ":" + id + " = " + val);

          } catch (e) {
            Logger.error("Error parsing setting load: " + e);
          }
        });
        this._loadListenerSupported = true;
        Logger.info("Settings load listener configured");
      } catch (e) {
        this._loadListenerSupported = false;
        Logger.warn("Settings load listener unsupported: " + e);
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
