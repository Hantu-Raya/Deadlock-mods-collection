(function () {
  "use strict";

  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var CONFIG_MAGIC = "HP_COLORS_V2_CONFIG";
  var CONFIG_ATTR = "hp_colors_v2_config";
  var CONFIG_VERSION = 1;
  var REPLAY_HOT_SEC = 1;
  var REPLAY_WARM_SEC = 3;
  var REPLAY_IDLE_SEC = 8;
  var REPLAY_HOT_COUNT = 3;
  var REPLAY_WARM_COUNT = 8;
  var REPLAY_MAX_COUNT = 12;
  var KEYS = ["enabled", "enemyColor", "allyColor", "pipsVisible"];
  var FALLBACK_DEFAULTS = {
    enabled: true,
    enemyColor: "#FD4949",
    allyColor: "#FFEFD7",
    pipsVisible: true,
  };

  var context = null;
  var root = null;
  var settingsContract = null;
  var state = {
    booted: false,
    open: false,
    revision: 0,
    values: null,
    raw: "",
  };
  var replay = { generation: 0, count: 0, running: false };
  var picker = {
    key: "",
    hue: 0,
    saturation: 0,
    lightness: 0,
    returnPanel: null,
  };
  var syncing = false;
  var ui = {
    menuButton: null,
    editorRoot: null,
    editorShell: null,
    masterToggle: null,
    enemySwatch: null,
    enemyHex: null,
    allySwatch: null,
    allyHex: null,
    pipsToggle: null,
    resetButton: null,
    doneButton: null,
    pickerRoot: null,
    pickerPanel: null,
    pickerBackdrop: null,
    pickerDone: null,
    pickerTitle: null,
    pickerPreview: null,
    pickerHex: null,
    pickerHueValue: null,
    pickerSaturationValue: null,
    pickerLightnessValue: null,
    pickerHueHost: null,
    pickerSaturationHost: null,
    pickerLightnessHost: null,
    pickerHueSlider: null,
    pickerSaturationSlider: null,
    pickerLightnessSlider: null,
  };

  function isCallable(value) {
    var tag = Object.prototype.toString.call(value);
    return (
      tag === "[object Function]" ||
      tag === "[object AsyncFunction]" ||
      tag === "[object GeneratorFunction]" ||
      tag === "[object AsyncGeneratorFunction]"
    );
  }

  function isValid(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch (error) {
      return false;
    }
  }

  function isObject(value) {
    return value !== null && Object(value) === value;
  }

  function captureContractFactory() {
    var factory = null;
    try {
      factory = $.HPColorsV2ContractFactory;
      if (factory && isCallable(factory.create))
        settingsContract = factory.create();
      delete $.HPColorsV2ContractFactory;
    } catch (error) {
      settingsContract = null;
    }
  }

  captureContractFactory();

  function copyValues(source) {
    var values = {};
    var index;
    for (index = 0; index < KEYS.length; index++) {
      var key = KEYS[index];
      values[key] =
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : FALLBACK_DEFAULTS[key];
    }
    return values;
  }

  function normalizeColor(value, fallback) {
    var raw = String(value === undefined || value === null ? "" : value)
      .replace(/^\s+|\s+$/g, "")
      .toUpperCase();
    if (raw.charAt(0) !== "#") raw = "#" + raw;
    return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
  }

  function normalizeValues(source) {
    var values = copyValues(null);
    var candidate = null;
    if (settingsContract && isCallable(settingsContract.normalizeValues)) {
      try {
        candidate = settingsContract.normalizeValues(source || null);
      } catch (error) {
        candidate = null;
      }
    }
    var sourceValues = candidate || source;
    values.enabled = !!(sourceValues && sourceValues.enabled);
    values.enemyColor = normalizeColor(
      sourceValues && sourceValues.enemyColor,
      FALLBACK_DEFAULTS.enemyColor,
    );
    values.allyColor = normalizeColor(
      sourceValues && sourceValues.allyColor,
      FALLBACK_DEFAULTS.allyColor,
    );
    values.pipsVisible = !!(sourceValues && sourceValues.pipsVisible);
    if (!sourceValues) {
      values.enabled = FALLBACK_DEFAULTS.enabled;
      values.pipsVisible = FALLBACK_DEFAULTS.pipsVisible;
    }
    return values;
  }

  function normalizeRevision(value) {
    var revision = Number(value);
    if (!isFinite(revision) || revision < 0) return 0;
    return Math.floor(revision);
  }

  function valuesEqual(left, right) {
    var index;
    for (index = 0; index < KEYS.length; index++) {
      var key = KEYS[index];
      if (!left || !right || left[key] !== right[key]) return false;
    }
    return true;
  }

  function absoluteRoot(panel) {
    var current = panel;
    var last = panel;
    var depth;
    for (depth = 0; current && depth < 24; depth++) {
      last = current;
      try {
        var parent = current.GetParent ? current.GetParent() : null;
        if (!parent || parent === current) break;
        current = parent;
      } catch (error) {
        break;
      }
    }
    return last;
  }

  function find(id) {
    var base = isValid(root) ? root : context;
    try {
      return base && base.FindChildTraverse ? base.FindChildTraverse(id) : null;
    } catch (error) {
      return null;
    }
  }

  function setClass(panel, className, enabled) {
    if (!isValid(panel)) return;
    try {
      panel.SetHasClass(className, !!enabled);
    } catch (error) {}
  }

  function setText(panel, value) {
    if (!isValid(panel)) return;
    try {
      var text = String(value);
      if (panel.text !== text) panel.text = text;
    } catch (error) {}
  }

  function setEvent(panel, eventName, handler) {
    if (!isValid(panel)) return;
    try {
      panel.SetPanelEvent(eventName, handler);
    } catch (error) {}
  }

  function focus(panel) {
    if (!isValid(panel)) return;
    try {
      if (panel.SetFocus) panel.SetFocus();
    } catch (error) {}
  }

  function readAttribute(panel, name) {
    if (!isValid(panel) || !panel.GetAttributeString) return "";
    try {
      return String(panel.GetAttributeString(name, "") || "");
    } catch (error) {
      return "";
    }
  }

  function writeAttribute(raw) {
    if (!isValid(root) || !root.SetAttributeString) return false;
    try {
      if (!root.GetAttributeString || readAttribute(root, CONFIG_ATTR) !== raw)
        root.SetAttributeString(CONFIG_ATTR, raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  function serializeSnapshot() {
    return JSON.stringify({
      magic_word: CONFIG_MAGIC,
      version: CONFIG_VERSION,
      revision: state.revision,
      values: copyValues(state.values),
    });
  }

  function decodeSnapshot(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (
        !parsed ||
        parsed.magic_word !== CONFIG_MAGIC ||
        parsed.version !== CONFIG_VERSION ||
        !isObject(parsed.values)
      )
        return null;
      return {
        revision: normalizeRevision(parsed.revision),
        values: normalizeValues(parsed.values),
      };
    } catch (error) {
      return null;
    }
  }

  function dispatchSnapshot(raw) {
    try {
      $.DispatchEvent(EVENT_CHANNEL, raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  function replayDelay() {
    if (replay.count < REPLAY_HOT_COUNT) return REPLAY_HOT_SEC;
    if (replay.count < REPLAY_WARM_COUNT) return REPLAY_WARM_SEC;
    return REPLAY_IDLE_SEC;
  }

  function scheduleReplay(generation) {
    try {
      $.Schedule(replayDelay(), function () {
        if (
          !replay.running ||
          generation !== replay.generation ||
          replay.count >= REPLAY_MAX_COUNT ||
          !state.raw ||
          !isValid(root)
        ) {
          return;
        }
        dispatchSnapshot(state.raw);
        replay.count += 1;
        if (replay.count >= REPLAY_MAX_COUNT) {
          replay.running = false;
          return;
        }
        scheduleReplay(generation);
      });
    } catch (error) {
      replay.running = false;
    }
  }

  function startReplay() {
    replay.generation += 1;
    replay.count = 0;
    replay.running = !!state.raw;
    if (replay.running) scheduleReplay(replay.generation);
  }

  function publishSnapshot() {
    state.raw = serializeSnapshot();
    writeAttribute(state.raw);
    dispatchSnapshot(state.raw);
    startReplay();
  }

  function setValue(key, value) {
    if (!state.values || !Object.prototype.hasOwnProperty.call(FALLBACK_DEFAULTS, key))
      return false;
    var next = normalizeValues({
      enabled: key === "enabled" ? value : state.values.enabled,
      enemyColor: key === "enemyColor" ? value : state.values.enemyColor,
      allyColor: key === "allyColor" ? value : state.values.allyColor,
      pipsVisible: key === "pipsVisible" ? value : state.values.pipsVisible,
    });
    if (valuesEqual(next, state.values)) return false;
    state.values = next;
    state.revision += 1;
    publishSnapshot();
    syncControls();
    return true;
  }

  function setToggle(panel, value) {
    setClass(panel, "Checked", value);
    setClass(panel, "Active", value);
  }

  function setColor(swatch, entry, value) {
    if (isValid(swatch) && swatch.style) {
      try {
        if (swatch.style.backgroundColor !== value)
          swatch.style.backgroundColor = value;
      } catch (error) {}
    }
    setText(entry, value);
  }

  function syncControls() {
    if (!state.values) return;
    syncing = true;
    setToggle(ui.masterToggle, state.values.enabled);
    setToggle(ui.pipsToggle, state.values.pipsVisible);
    setColor(ui.enemySwatch, ui.enemyHex, state.values.enemyColor);
    setColor(ui.allySwatch, ui.allyHex, state.values.allyColor);
    syncPicker();
    syncing = false;
  }

  function clamp(value, min, max, fallback) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function hexToHsl(hex) {
    var raw = normalizeColor(hex, "#000000").slice(1);
    var red = parseInt(raw.slice(0, 2), 16) / 255;
    var green = parseInt(raw.slice(2, 4), 16) / 255;
    var blue = parseInt(raw.slice(4, 6), 16) / 255;
    var max = Math.max(red, green, blue);
    var min = Math.min(red, green, blue);
    var lightness = (max + min) / 2;
    var hue = 0;
    var saturation = 0;
    if (max !== min) {
      var delta = max - min;
      saturation =
        lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
      else if (max === green) hue = (blue - red) / delta + 2;
      else hue = (red - green) / delta + 4;
      hue /= 6;
    }
    return {
      hue: Math.round(hue * 359),
      saturation: Math.round(saturation * 100),
      lightness: Math.round(lightness * 100),
    };
  }

  function hslToHex(hue, saturation, lightness) {
    var h = clamp(hue, 0, 359, 0) / 359;
    var s = clamp(saturation, 0, 100, 0) / 100;
    var l = clamp(lightness, 0, 100, 0) / 100;
    var red;
    var green;
    var blue;
    if (s === 0) {
      red = l;
      green = l;
      blue = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      function hueToRgb(t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      }
      red = hueToRgb(h + 1 / 3);
      green = hueToRgb(h);
      blue = hueToRgb(h - 1 / 3);
    }
    var packed =
      (Math.round(red * 255) << 16) |
      (Math.round(green * 255) << 8) |
      Math.round(blue * 255);
    return "#" + ((1 << 24) | packed).toString(16).slice(1).toUpperCase();
  }

  function pickerColor() {
    return hslToHex(picker.hue, picker.saturation, picker.lightness);
  }

  function setSliderValue(slider, value) {
    if (!isValid(slider)) return;
    try {
      if (isCallable(slider.SetValueNoEvents)) slider.SetValueNoEvents(value);
      else slider.value = value;
    } catch (error) {}
  }

  function setPickerTrack(slider, gradient) {
    if (!isValid(slider) || !slider.FindChildTraverse) return;
    try {
      var track = slider.FindChildTraverse("SliderTrack");
      if (isValid(track) && track.style.backgroundColor !== gradient)
        track.style.backgroundColor = gradient;
    } catch (error) {}
  }

  function setPickerThumb(slider, color) {
    if (!isValid(slider) || !slider.FindChildTraverse) return;
    try {
      var thumb = slider.FindChildTraverse("SliderThumb");
      if (isValid(thumb) && thumb.style) thumb.style.backgroundColor = color;
    } catch (error) {}
  }

  function syncPicker() {
    if (!picker.key || !isValid(ui.pickerRoot)) return;
    var color = pickerColor();
    setText(ui.pickerTitle, picker.key === "enemyColor" ? "ENEMY COLOR" : "ALLY COLOR");
    setText(ui.pickerHex, color);
    setText(ui.pickerHueValue, String(picker.hue) + "°");
    setText(ui.pickerSaturationValue, String(picker.saturation) + "%");
    setText(ui.pickerLightnessValue, String(picker.lightness) + "%");
    if (isValid(ui.pickerPreview) && ui.pickerPreview.style) {
      try {
        ui.pickerPreview.style.backgroundColor = color;
      } catch (error) {}
    }
    setSliderValue(ui.pickerHueSlider, picker.hue);
    setSliderValue(ui.pickerSaturationSlider, picker.saturation);
    setSliderValue(ui.pickerLightnessSlider, picker.lightness);
    setPickerThumb(ui.pickerHueSlider, color);
    setPickerThumb(ui.pickerSaturationSlider, color);
    setPickerThumb(ui.pickerLightnessSlider, color);
    setPickerTrack(
      ui.pickerHueSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(#FF0000), color-stop(0.1667, #FFFF00), color-stop(0.3333, #00FF00), color-stop(0.5, #00FFFF), color-stop(0.6667, #0000FF), color-stop(0.8333, #FF00FF), to(#FF0000))",
    );
    setPickerTrack(
      ui.pickerSaturationSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(" +
        hslToHex(picker.hue, 0, picker.lightness) +
        "), to(" +
        hslToHex(picker.hue, 100, picker.lightness) +
        "))",
    );
    setPickerTrack(
      ui.pickerLightnessSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(#000000), color-stop(0.5, " +
        hslToHex(picker.hue, picker.saturation, 50) +
        "), to(#FFFFFF))",
    );
  }

  function openPicker(key, returnPanel) {
    if (!state.values || (key !== "enemyColor" && key !== "allyColor")) return false;
    var hsl = hexToHsl(state.values[key]);
    picker.key = key;
    picker.hue = hsl.hue;
    picker.saturation = hsl.saturation;
    picker.lightness = hsl.lightness;
    picker.returnPanel = returnPanel || null;
    setClass(ui.pickerRoot, "Open", true);
    syncPicker();
    focus(ui.pickerHueSlider);
    return true;
  }

  function closePicker() {
    if (!picker.key) {
      setClass(ui.pickerRoot, "Open", false);
      return false;
    }
    var returnPanel = picker.returnPanel;
    picker.key = "";
    picker.returnPanel = null;
    setClass(ui.pickerRoot, "Open", false);
    focus(returnPanel);
    return true;
  }

  function bindPickerSlider(slider, component, max) {
    if (!isValid(slider)) return;
    try {
      slider.increment = 1;
    } catch (error) {}
    setEvent(slider, "onvaluechanged", function () {
      if (syncing || !picker.key) return;
      picker[component] = clamp(slider.value, 0, max, picker[component]);
      setValue(picker.key, pickerColor());
      syncPicker();
    });
  }

  function createSlider(host, id, min, max) {
    var existing = find(id);
    if (isValid(existing)) return existing;
    if (!isValid(host) || !$.CreatePanel) return null;
    try {
      var slider = $.CreatePanel("Slider", host, id, {
        direction: "horizontal",
      });
      slider.AddClass("HPColorsV2PickerSlider");
      slider.AddClass("HorizontalSlider");
      slider.min = min;
      slider.max = max;
      slider.increment = 1;
      slider.style.width = "100%";
      slider.style.height = "16px";
      slider.style.overflow = "noclip";
      return slider;
    } catch (error) {
      return null;
    }
  }

  function commitColor(key, entry) {
    if (syncing || !state.values || !isValid(entry)) return false;
    var fallback = state.values[key];
    var value;
    try {
      value = normalizeColor(entry.text, fallback);
    } catch (error) {
      value = fallback;
    }
    setValue(key, value);
    syncControls();
    return true;
  }

  function toggleMaster() {
    if (!state.values) return false;
    return setValue("enabled", !state.values.enabled);
  }

  function togglePips() {
    if (!state.values) return false;
    return setValue("pipsVisible", !state.values.pipsVisible);
  }

  function resetSettings() {
    if (!state.values) return false;
    var defaults = normalizeValues(null);
    state.values = defaults;
    state.revision += 1;
    publishSnapshot();
    syncControls();
    return true;
  }

  function openEditor() {
    if (!state.booted) return false;
    if (state.open) return true;
    state.open = true;
    setClass(ui.editorRoot, "Open", true);
    focus(ui.editorShell);
    syncControls();
    return true;
  }

  function closeEditor() {
    var closed = state.open;
    closePicker();
    state.open = false;
    setClass(ui.editorRoot, "Open", false);
    focus(ui.menuButton);
    return closed;
  }

  function cancel() {
    if (picker.key) {
      closePicker();
      return true;
    }
    if (state.open) {
      closeEditor();
      return true;
    }
    return false;
  }

  function resolvePanels() {
    try {
      context = $.GetContextPanel();
    } catch (error) {
      context = null;
    }
    root = absoluteRoot(context);
    ui.menuButton = find("HPColorsV2MenuButton");
    ui.editorRoot = find("HPColorsV2EditorRoot");
    ui.editorShell = find("HPColorsV2EditorShell");
    ui.masterToggle = find("HPColorsV2MasterToggle");
    ui.enemySwatch = find("HPColorsV2EnemyColorSwatch");
    ui.enemyHex = find("HPColorsV2EnemyColorHex");
    ui.allySwatch = find("HPColorsV2AllyColorSwatch");
    ui.allyHex = find("HPColorsV2AllyColorHex");
    ui.pipsToggle = find("HPColorsV2PipsToggle");
    ui.resetButton = find("HPColorsV2ResetButton");
    ui.doneButton = find("HPColorsV2DoneButton");
    ui.pickerRoot = find("HPColorsV2PickerRoot");
    ui.pickerPanel = find("HPColorsV2PickerPanel");
    ui.pickerBackdrop = find("HPColorsV2PickerBackdrop");
    ui.pickerDone = find("HPColorsV2PickerDone");
    ui.pickerTitle = find("HPColorsV2PickerTitle");
    ui.pickerPreview = find("HPColorsV2PickerPreview");
    ui.pickerHex = find("HPColorsV2PickerHex");
    ui.pickerHueValue = find("HPColorsV2PickerHueValue");
    ui.pickerSaturationValue = find("HPColorsV2PickerSaturationValue");
    ui.pickerLightnessValue = find("HPColorsV2PickerLightnessValue");
    ui.pickerHueHost = find("HPColorsV2PickerHueSliderHost");
    ui.pickerSaturationHost = find("HPColorsV2PickerSaturationSliderHost");
    ui.pickerLightnessHost = find("HPColorsV2PickerLightnessSliderHost");
    ui.pickerHueSlider = createSlider(
      ui.pickerHueHost,
      "HPColorsV2PickerHueSlider",
      0,
      359,
    );
    ui.pickerSaturationSlider = createSlider(
      ui.pickerSaturationHost,
      "HPColorsV2PickerSaturationSlider",
      0,
      100,
    );
    ui.pickerLightnessSlider = createSlider(
      ui.pickerLightnessHost,
      "HPColorsV2PickerLightnessSlider",
      0,
      100,
    );
    return isValid(root) && isValid(ui.editorRoot);
  }

  function bindControls() {
    setEvent(ui.menuButton, "onactivate", openEditor);
    setEvent(ui.masterToggle, "onactivate", toggleMaster);
    setEvent(ui.pipsToggle, "onactivate", togglePips);
    setEvent(ui.enemySwatch, "onactivate", function () {
      openPicker("enemyColor", ui.enemySwatch);
    });
    setEvent(ui.allySwatch, "onactivate", function () {
      openPicker("allyColor", ui.allySwatch);
    });
    setEvent(ui.enemyHex, "ontextentrysubmit", function () {
      commitColor("enemyColor", ui.enemyHex);
    });
    setEvent(ui.enemyHex, "onblur", function () {
      commitColor("enemyColor", ui.enemyHex);
    });
    setEvent(ui.allyHex, "ontextentrysubmit", function () {
      commitColor("allyColor", ui.allyHex);
    });
    setEvent(ui.allyHex, "onblur", function () {
      commitColor("allyColor", ui.allyHex);
    });
    setEvent(ui.resetButton, "onactivate", resetSettings);
    setEvent(ui.doneButton, "onactivate", closeEditor);
    setEvent(ui.editorRoot, "oncancel", cancel);
    setEvent(ui.pickerPanel, "oncancel", closePicker);
    setEvent(ui.pickerBackdrop, "onactivate", closePicker);
    setEvent(ui.pickerDone, "onactivate", closePicker);
    bindPickerSlider(ui.pickerHueSlider, "hue", 359);
    bindPickerSlider(ui.pickerSaturationSlider, "saturation", 100);
    bindPickerSlider(ui.pickerLightnessSlider, "lightness", 100);
    setEvent(context, "oncancel", cancel);
  }

  function boot() {
    if (state.booted) return true;
    captureContractFactory();
    if (!resolvePanels()) return false;
    var incoming = decodeSnapshot(readAttribute(root, CONFIG_ATTR));
    if (incoming) {
      state.revision = incoming.revision;
      state.values = incoming.values;
    } else {
      state.revision = 0;
      state.values = normalizeValues(null);
    }
    bindControls();
    state.booted = true;
    syncControls();
    publishSnapshot();
    return true;
  }

  $.HPColorsV2MenuBoot = boot;
  $.HPColorsV2MenuOpen = openEditor;
  $.HPColorsV2MenuClose = closeEditor;
  $.HPColorsV2MenuCancel = cancel;
  $.HPColorsV2MenuReset = resetSettings;
  $.HPColorsV2MenuDone = closeEditor;
  $.HPColorsV2MenuOpenPicker = openPicker;
  $.HPColorsV2MenuClosePicker = closePicker;
  $.HPColorsV2MenuToggleMaster = toggleMaster;
  $.HPColorsV2MenuTogglePips = togglePips;
  $.HPColorsV2MenuCommitEnemyColor = function () {
    return commitColor("enemyColor", ui.enemyHex);
  };
  $.HPColorsV2MenuCommitAllyColor = function () {
    return commitColor("allyColor", ui.allyHex);
  };
})();
