(function () {
  "use strict";

  var CONFIG_ATTR = "hp_colors_rewrite_config";
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var PIP_CONVAR_ENABLE_COMMAND =
    '"citadel_unit_status_health_per_minor_pip" "10"\n' +
    '"citadel_unit_status_health_per_pip" "10"\n' +
    '"citadel_unit_status_minor_pip_per_major_pip" "10"';
  var PIP_CONVAR_RESET_COMMAND =
    '"citadel_unit_status_health_per_minor_pip" "100"\n' +
    '"citadel_unit_status_health_per_pip" "100"\n' +
    '"citadel_unit_status_minor_pip_per_major_pip" "5"';
  var CONFIG_MAGIC = "HP_COLORS_REWRITE_CONFIG";
  var HISTORY_LIMIT = 40;
  var REPLAY_HOT_SEC = 1;
  var REPLAY_WARM_SEC = 3;
  var REPLAY_IDLE_SEC = 8;
  var REPLAY_HOT_COUNT = 3;
  var REPLAY_WARM_COUNT = 12;

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
    allyPulseEnabled: false,
    allyPulseThreshold: 25,
    allyPulseBpm: 75,
    allyPulseIntensity: 1,
    allyPulseColorEnabled: false,
    allyPulseColor: "#FF2222",
  };

  var CATEGORY_DEFS = [
    {
      name: "OVERVIEW",
      tabs: [
        {
          name: "STATUS",
          title: "CURRENT CONFIGURATION",
          description:
            "Enable the rewrite, then tune enemy and ally bars while holding Peek to inspect the result.",
          pageId: "HPColorsSettingsOverviewStatus",
          keys: ["enabled"],
        },
        {
          name: "LAYOUT",
          title: "BAR LAYOUT",
          description:
            "Scale and position relation-owned v1 healthbars without changing engine-driven fill ratios.",
          pageId: "HPColorsSettingsOverviewLayout",
          keys: ["widthScale", "heightScale", "positionX", "positionY"],
        },
      ],
    },
    {
      name: "ENEMY",
      tabs: [
        {
          name: "BAR",
          title: "ENEMY BAR",
          description:
            "Fixed steps between low, mid, and high colors; Gradient blends them. Neutral units remain stock.",
          pageId: "HPColorsSettingsEnemyBar",
          keys: [
            "enemyEnabled",
            "enemyVisible",
            "enemyMode",
            "enemyLow",
            "enemyMid",
            "enemyHigh",
            "lowThreshold",
            "highThreshold",
            "enemyTeamHigh",
            "excludeBuildings",
            "excludeBosses",
          ],
        },
        {
          name: "FEEDBACK",
          title: "ENEMY FEEDBACK",
          description:
            "Color engine-owned healing and recent-damage layers without changing their widths.",
          pageId: "HPColorsSettingsEnemyFeedback",
          keys: ["enemyHealing", "enemyDelta"],
        },
        {
          name: "ICONS",
          title: "ENEMY SHIELDS & ICONS",
          description:
            "Tint bullet shields and ultimate-ready icons without changing engine geometry or visibility.",
          pageId: "HPColorsSettingsEnemyShields",
          keys: ["enemyBulletShield", "ultMode", "ultCustom"],
        },
      ],
    },
    {
      name: "ALLY",
      tabs: [
        {
          name: "BAR",
          title: "ALLY BAR",
          description:
            "Fixed steps between low, mid, and high colors; Gradient blends them using the shared thresholds.",
          pageId: "HPColorsSettingsAllyBar",
          keys: [
            "allyEnabled",
            "allyVisible",
            "allyMode",
            "allyLow",
            "allyMid",
            "allyHigh",
          ],
        },
        {
          name: "FEEDBACK",
          title: "ALLY FEEDBACK",
          description:
            "Color engine-owned healing and recent-damage layers on customized ally bars.",
          pageId: "HPColorsSettingsAllyFeedback",
          keys: ["allyHealing", "allyDelta"],
        },
        {
          name: "SHIELDS",
          title: "ALLY SHIELDS",
          description:
            "Tint the ally bullet-shield layer without changing engine shield geometry.",
          pageId: "HPColorsSettingsAllyShields",
          keys: ["allyBulletShield"],
        },
      ],
    },
    {
      name: "READOUT",
      tabs: [
        {
          name: "NUMBER",
          title: "HP NUMBER",
          description:
            "Show enemy health as current and maximum HP, percentage, or current HP only.",
          pageId: "HPColorsSettingsReadoutNumber",
          keys: [
            "readoutVisible",
            "readoutFormat",
            "readoutSize",
            "readoutFont",
            "readoutColorMode",
            "readoutMode",
            "lowThreshold",
            "highThreshold",
            "readoutLow",
            "readoutMid",
            "readoutHigh",
          ],
        },
        {
          name: "PLACEMENT",
          title: "HP NUMBER PLACEMENT",
          description:
            "Offset the owned HP number without moving the stock healthbar or unit icon.",
          pageId: "HPColorsSettingsReadoutPlacement",
          keys: ["readoutOffsetX", "readoutOffsetY"],
        },
        {
          name: "LEVEL & PIPS",
          title: "LEVELS & HEALTH PIPS",
          description:
            "Control enemy health pips and player level visibility without changing engine-owned text or geometry.",
          pageId: "HPColorsSettingsReadoutLevels",
          keys: ["pipsVisible", "precisePipsEnabled", "levelsVisible"],
        },

      ],
    },
    {
      name: "EFFECTS",
      tabs: [
        {
          name: "ENEMY PULSE",
          title: "ENEMY LOW-HP PULSE",
          description:
            "Pulse enemy bars at or below the threshold without changing engine-owned widths or timing.",
          pageId: "HPColorsSettingsEnemyPulse",
          keys: [
            "enemyPulseEnabled",
            "enemyPulseThreshold",
            "enemyPulseBpm",
            "enemyPulseIntensity",
            "enemyPulseColorEnabled",
            "enemyPulseColorMode",
            "enemyPulseColor",
            "enemyPulseHideBar",
            "enemyPulseReadout",
          ],
        },
        {
          name: "ALLY PULSE",
          title: "ALLY LOW-HP PULSE",
          description:
            "Pulse customized ally bars at or below their independent threshold.",
          pageId: "HPColorsSettingsAllyPulse",
          keys: [
            "allyPulseEnabled",
            "allyPulseThreshold",
            "allyPulseBpm",
            "allyPulseIntensity",
            "allyPulseColorEnabled",
            "allyPulseColor",
          ],
        },
      ],
    },
  ];

  var CATEGORY_BUTTON_IDS = [
    "HPColorsCategoryOverview",
    "HPColorsCategoryEnemy",
    "HPColorsCategoryAlly",
    "HPColorsCategoryReadout",
    "HPColorsCategoryEffects",
  ];
  var BOOLEAN_KEYS = {
    enabled: true,
    enemyEnabled: true,
    enemyVisible: true,
    enemyTeamHigh: true,
    excludeBuildings: true,
    excludeBosses: true,
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
    allyPulseEnabled: true,
    allyPulseColorEnabled: true,
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
  };
  var COLOR_TITLES = {
    enemyLow: "ENEMY LOW",
    enemyMid: "ENEMY MID",
    enemyHigh: "ENEMY HIGH",
    enemyHealing: "ENEMY HEALING",
    enemyDelta: "ENEMY DAMAGE DELTA",
    enemyBulletShield: "ENEMY BULLET SHIELD",
    allyLow: "ALLY LOW",
    allyMid: "ALLY MID",
    allyHigh: "ALLY HIGH",
    allyHealing: "ALLY HEALING",
    allyDelta: "ALLY DAMAGE DELTA",
    allyBulletShield: "ALLY BULLET SHIELD",
    ultCustom: "ULTIMATE ICON",
    readoutLow: "HP NUMBER LOW",
    readoutMid: "HP NUMBER MID",
    readoutHigh: "HP NUMBER HIGH",
    enemyPulseColor: "ENEMY PULSE COLOR",
    allyPulseColor: "ALLY PULSE COLOR",
  };

  var context = $.GetContextPanel();
  var state = {
    booted: false,
    open: false,
    peeking: false,
    categoryIndex: 0,
    tabIndex: 0,
    revision: 0,
    values: copyValues(DEFAULTS),
    history: [],
  };
  var replayGeneration = 0;
  var replayRunning = false;
  var replayDispatches = 0;
  var serializedSnapshotRaw = "";
  var serializedReplayPayload = "";

  var picker = {
    key: "",
    hue: 0,
    saturation: 0,
    lightness: 100,
    returnPanel: null,
  };
  var ui = {
    categoryButtons: [],
    tabButtons: [],
    tabLabels: [],
    settingsPages: [],
  };
  var syncingControls = false;

  function copyValues(source) {
    var result = {};
    for (var key in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
      result[key] =
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : DEFAULTS[key];
    }
    return result;
  }

  function isValid(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch (error) {
      return false;
    }
  }

  function find(id) {
    try {
      return context && context.FindChildTraverse
        ? context.FindChildTraverse(id)
        : null;
    } catch (error) {
      return null;
    }
  }

  function absoluteRoot(panel) {
    var current = panel;
    var last = panel;
    for (var depth = 0; current && depth < 24; depth++) {
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

  function setClass(panel, className, enabled) {
    if (!isValid(panel)) return;
    try {
      panel.SetHasClass(className, !!enabled);
    } catch (error) {}
  }

  function setEnabled(panel, enabled) {
    if (!isValid(panel)) return;
    try {
      panel.enabled = !!enabled;
      panel.SetHasClass("Disabled", !enabled);
    } catch (error) {}
  }

  function setText(panel, value) {
    if (!isValid(panel)) return;
    try {
      if (panel.text !== value) panel.text = value;
    } catch (error) {}
  }

  function setPanelEvent(panel, eventName, handler) {
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

  function copyTextToClipboard(text) {
    var value = String(text || "");
    if (!value) return false;
    var panel = $.GetContextPanel();
    var attempts = [
      ["CopyStringToClipboard", value],
      ["CopyStringToClipboard", value, panel],
      ["CopyToClipboard", value, panel],
      ["CopyToClipboard", value],
    ];
    for (var index = 0; index < attempts.length; index++) {
      try {
        $.DispatchEvent.apply($, attempts[index]);
        return true;
      } catch (error) {}
    }
    return false;
  }

  function copyPrecisePipCommands() {
    var label = find("HPColorsPrecisePipsCopyLabel");
    var copied = copyTextToClipboard(
      state.values.precisePipsEnabled
        ? PIP_CONVAR_ENABLE_COMMAND
        : PIP_CONVAR_RESET_COMMAND,
    );
    if (isValid(label)) label.text = copied ? "COPIED" : "COPY FAILED";
    try {
      $.Schedule(1.25, function () {
        if (isValid(label)) label.text = "COPY COMMANDS";
      });
    } catch (error) {}
  }

  function clampNumber(value, min, max, fallback) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    number = Math.round(number);
    return Math.max(min, Math.min(max, number));
  }

  function normalizeColor(value, fallback) {
    var raw = String(value || "").trim().toUpperCase();
    if (raw.charAt(0) !== "#") raw = "#" + raw;
    return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
  }

  function hexToHsl(hex) {
    var value = parseInt(normalizeColor(hex, "#FFFFFF").slice(1), 16);
    var red = ((value >> 16) & 255) / 255;
    var green = ((value >> 8) & 255) / 255;
    var blue = (value & 255) / 255;
    var max = Math.max(red, green, blue);
    var min = Math.min(red, green, blue);
    var delta = max - min;
    var lightness = (max + min) / 2;
    var hue = 0;
    var saturation = 0;
    if (delta) {
      saturation =
        delta / Math.max(0.0001, 1 - Math.abs(2 * lightness - 1));
      if (max === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (max === green) hue = 60 * ((blue - red) / delta + 2);
      else hue = 60 * ((red - green) / delta + 4);
      if (hue < 0) hue += 360;
    }
    return {
      hue: Math.round(hue) % 360,
      saturation: Math.round(saturation * 100),
      lightness: Math.round(lightness * 100),
    };
  }

  function hslToHex(hue, saturation, lightness) {
    var h = ((Number(hue) % 360) + 360) % 360;
    var s = Math.max(0, Math.min(100, Number(saturation))) / 100;
    var l = Math.max(0, Math.min(100, Number(lightness))) / 100;
    var chroma = (1 - Math.abs(2 * l - 1)) * s;
    var section = h / 60;
    var second = chroma * (1 - Math.abs((section % 2) - 1));
    var red = 0;
    var green = 0;
    var blue = 0;
    if (section < 1) {
      red = chroma;
      green = second;
    } else if (section < 2) {
      red = second;
      green = chroma;
    } else if (section < 3) {
      green = chroma;
      blue = second;
    } else if (section < 4) {
      green = second;
      blue = chroma;
    } else if (section < 5) {
      red = second;
      blue = chroma;
    } else {
      red = chroma;
      blue = second;
    }
    var match = l - chroma / 2;
    var packed =
      (Math.round((red + match) * 255) << 16) |
      (Math.round((green + match) * 255) << 8) |
      Math.round((blue + match) * 255);
    return "#" + ((1 << 24) | packed).toString(16).slice(1).toUpperCase();
  }


  function normalizeValue(key, value, values) {
    if (BOOLEAN_KEYS[key]) return !!value;
    if (COLOR_KEYS[key]) return normalizeColor(value, DEFAULTS[key]);
    if (
      key === "enemyMode" ||
      key === "allyMode" ||
      key === "readoutMode"
    )
      return value === "gradient" ? "gradient" : "fixed";
    if (key === "enemyPulseColorMode")
      return value === "fixed" ? "fixed" : "gradient";
    if (
      key === "enemyPulseThreshold" ||
      key === "allyPulseThreshold"
    )
      return clampNumber(value, 0, 100, 25);
    if (key === "enemyPulseBpm" || key === "allyPulseBpm")
      return clampNumber(value, 30, 300, 75);
    if (key === "enemyPulseIntensity" || key === "allyPulseIntensity")
      return clampNumber(value, 0, 2, 1);
    if (key === "ultMode") return value === "custom" ? "custom" : "follow";
    if (
      key === "readoutFormat"
    )
      return value === "percent" || value === "current" ? value : "hp";
    if (key === "readoutColorMode")
      return value === "custom" ? "custom" : "bar";
    if (key === "readoutFont")
      return value === "oracle" || value === "pulp" ? value : "default";
    if (key === "readoutSize")
      return clampNumber(value, 72, 320, DEFAULTS[key]);
    if (key === "readoutOffsetX")
      return clampNumber(value, -405, 405, DEFAULTS[key]);
    if (key === "readoutOffsetY")
      return clampNumber(value, -35, 840, DEFAULTS[key]);
    if (key === "widthScale" || key === "heightScale")
      return clampNumber(value, 60, 160, DEFAULTS[key]);
    if (key === "positionX")
      return clampNumber(value, -300, 300, DEFAULTS[key]);
    if (key === "positionY")
      return clampNumber(value, -200, 200, DEFAULTS[key]);
    if (key === "lowThreshold")
      return clampNumber(value, 0, (values || state.values).highThreshold - 1, 25);
    if (key === "highThreshold")
      return clampNumber(value, (values || state.values).lowThreshold + 1, 100, 65);
    return value;
  }

  function normalizeValues(source) {
    var values = copyValues(DEFAULTS);
    for (var key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      values[key] = normalizeValue(
        key,
        source && Object.prototype.hasOwnProperty.call(source, key)
          ? source[key]
          : DEFAULTS[key],
        values,
      );
    }
    values.lowThreshold = clampNumber(
      values.lowThreshold,
      0,
      values.highThreshold - 1,
      25,
    );
    values.highThreshold = clampNumber(
      values.highThreshold,
      values.lowThreshold + 1,
      100,
      65,
    );
    return values;
  }

  function snapshotRaw() {
    return JSON.stringify({
      version: 1,
      revision: state.revision,
      values: state.values,
    });
  }

  function serializeChange(settingId, raw) {
    return JSON.stringify({
      magic_word: CONFIG_MAGIC,
      version: 1,
      revision: state.revision,
      setting_id: settingId,
      value: settingId === "*" ? null : state.values[settingId],
      values_raw: raw,
    });
  }

  function cacheReplayPayload(raw, replayPayload) {
    serializedSnapshotRaw = raw;
    serializedReplayPayload =
      replayPayload || serializeChange("*", raw);
  }

  function ensureReplayPayload() {
    if (serializedSnapshotRaw && serializedReplayPayload) return;
    cacheReplayPayload(snapshotRaw());
  }

  function readRootSnapshot() {
    if (!isValid(ui.absoluteRoot) || !ui.absoluteRoot.GetAttributeString) return "";
    try {
      return String(ui.absoluteRoot.GetAttributeString(CONFIG_ATTR, "") || "");
    } catch (error) {
      return "";
    }
  }

  function loadRootSnapshot() {
    var raw = readRootSnapshot();
    if (!raw) return false;
    try {
      var data = JSON.parse(raw);
      if (!data || data.version !== 1 || !data.values) return false;
      state.revision = Math.max(0, Math.round(Number(data.revision) || 0));
      state.values = normalizeValues(data.values);
      if (serializedSnapshotRaw !== raw || !serializedReplayPayload)
        cacheReplayPayload(snapshotRaw());
      return true;
    } catch (error) {
      return false;
    }
  }

  function writeRootSnapshot(raw) {
    if (!isValid(ui.absoluteRoot) || !ui.absoluteRoot.SetAttributeString) return false;
    try {
      if (
        !ui.absoluteRoot.GetAttributeString ||
        ui.absoluteRoot.GetAttributeString(CONFIG_ATTR, "") !== raw
      )
        ui.absoluteRoot.SetAttributeString(CONFIG_ATTR, raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  function dispatchChange(settingId, raw, serialized) {
    try {
      $.DispatchEvent(
        EVENT_CHANNEL,
        serialized || serializeChange(settingId, raw),
      );
    } catch (error) {
      $.Msg("[HP Colors Rewrite] settings dispatch failed: " + String(error));
    }
  }

  function replayDelay() {
    if (replayDispatches < REPLAY_HOT_COUNT) return REPLAY_HOT_SEC;
    if (replayDispatches < REPLAY_WARM_COUNT) return REPLAY_WARM_SEC;
    return REPLAY_IDLE_SEC;
  }

  function scheduleSnapshotReplay(generation) {
    try {
      $.Schedule(replayDelay(), function () {
        if (
          !replayRunning ||
          generation !== replayGeneration ||
          !state.values.enabled ||
          !isValid(ui.absoluteRoot)
        )
          return;
        replayDispatches += 1;
        dispatchChange(
          "*",
          serializedSnapshotRaw,
          serializedReplayPayload,
        );
        scheduleSnapshotReplay(generation);
      });
    } catch (error) {
      replayRunning = false;
    }
  }

  function refreshSnapshotReplay() {
    if (!state.values.enabled) {
      replayGeneration += 1;
      replayRunning = false;
      replayDispatches = 0;
      return;
    }
    ensureReplayPayload();
    replayDispatches = 0;
    if (replayRunning) return;
    replayRunning = true;
    replayGeneration += 1;
    scheduleSnapshotReplay(replayGeneration);
  }

  function publish(settingId) {
    state.revision += 1;
    var raw = snapshotRaw();
    var immediatePayload = serializeChange(settingId, raw);
    cacheReplayPayload(
      raw,
      settingId === "*" ? immediatePayload : "",
    );
    writeRootSnapshot(raw);
    dispatchChange(settingId, raw, immediatePayload);
    refreshSnapshotReplay();
    $.Msg(
      "[HP Colors Rewrite] setting revision=" +
        state.revision +
        " id=" +
        settingId,
    );
  }

  function pushHistory(raw) {
    if (!raw) return;
    if (state.history.length && state.history[state.history.length - 1] === raw)
      return;
    state.history.push(raw);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
  }

  function valuesRaw() {
    return JSON.stringify(state.values);
  }

  function commitValue(key, value, recordHistory) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
    var next = normalizeValue(key, value, state.values);
    if (state.values[key] === next) {
      syncControls();
      return;
    }
    if (recordHistory !== false) pushHistory(valuesRaw());
    state.values[key] = next;
    publish(key);
    syncControls();
  }

  function replaceValues(values, recordHistory) {
    var next = normalizeValues(values);
    var nextRaw = JSON.stringify(next);
    if (nextRaw === valuesRaw()) return;
    if (recordHistory !== false) pushHistory(valuesRaw());
    state.values = next;
    publish("*");
    syncControls();
  }

  function undo() {
    if (!state.history.length) return;
    var raw = state.history.pop();
    try {
      replaceValues(JSON.parse(raw), false);
    } catch (error) {}
    syncControls();
  }

  function resetSection() {
    var category = CATEGORY_DEFS[state.categoryIndex];
    var tab = category && category.tabs[state.tabIndex];
    if (!tab) return;
    var next = copyValues(state.values);
    for (var index = 0; index < tab.keys.length; index++) {
      var key = tab.keys[index];
      next[key] = DEFAULTS[key];
    }
    replaceValues(next, true);
  }

  function bindCategory(index) {
    setPanelEvent(ui.categoryButtons[index], "onactivate", function () {
      selectCategory(index);
    });
  }

  function bindTab(index) {
    setPanelEvent(ui.tabButtons[index], "onactivate", function () {
      selectTab(index);
    });
  }

  function bindToggle(panelId, key) {
    var panel = find(panelId);
    setPanelEvent(panel, "onactivate", function () {
      if (syncingControls) return;
      commitValue(key, !state.values[key], true);
    });
  }

  function bindMode(panelId, key, mode) {
    var panel = find(panelId);
    setPanelEvent(panel, "onactivate", function () {
      if (syncingControls) return;
      commitValue(key, mode, true);
    });
  }

  function bindSlider(sliderId, entryId, key, min, max) {
    var slider = find(sliderId);
    var entry = find(entryId);
    if (!isValid(slider) || !isValid(entry)) return;
    var gestureBefore = "";

    try {
      slider.min = min;
      slider.max = max;
      slider.increment = 1;
    } catch (error) {}

    setPanelEvent(slider, "onmousedown", function () {
      gestureBefore = valuesRaw();
    });
    setPanelEvent(slider, "onvaluechanged", function () {
      if (syncingControls) return;
      var before = gestureBefore ? "" : valuesRaw();
      commitValue(key, slider.value, false);
      if (before) pushHistory(before);
    });
    setPanelEvent(slider, "onmouseup", function () {
      if (gestureBefore && gestureBefore !== valuesRaw()) pushHistory(gestureBefore);
      gestureBefore = "";
      syncControls();
    });

    function commitEntry() {
      if (syncingControls) return;
      commitValue(key, entry.text, true);
      try {
        $.DispatchEvent("DropInputFocus", entry);
      } catch (error) {}
    }
    setPanelEvent(entry, "ontextentrysubmit", commitEntry);
    setPanelEvent(entry, "onblur", commitEntry);
    setPanelEvent(entry, "oncancel", syncControls);
  }

  function bindColor(swatchId, entryId, key) {
    var swatch = find(swatchId);
    var entry = find(entryId);
    if (!isValid(swatch) || !isValid(entry)) return;
    setPanelEvent(swatch, "onactivate", function () {
      openPicker(key, swatch);
    });
    function commitEntry() {
      if (syncingControls) return;
      commitValue(key, entry.text, true);
      try {
        $.DispatchEvent("DropInputFocus", entry);
      } catch (error) {}
    }
    setPanelEvent(entry, "ontextentrysubmit", commitEntry);
    setPanelEvent(entry, "onblur", commitEntry);
    setPanelEvent(entry, "oncancel", syncControls);
  }

  function setToggle(panelId, value) {
    setClass(find(panelId), "Checked", !!value);
  }

  function setSlider(sliderId, entryId, value) {
    var slider = find(sliderId);
    var entry = find(entryId);
    if (isValid(slider)) {
      try {
        if (typeof slider.SetValueNoEvents === "function")
          slider.SetValueNoEvents(value);
        else slider.value = value;
      } catch (error) {}
    }
    setText(entry, String(value));
  }

  function setColor(swatchId, entryId, value) {
    var swatch = find(swatchId);
    if (isValid(swatch) && swatch.style) {
      try {
        if (swatch.style.backgroundColor !== value)
          swatch.style.backgroundColor = value;
      } catch (error) {}
    }
    setText(find(entryId), value);
  }

  function setPickerSliderValue(slider, value) {
    if (!isValid(slider)) return;
    try {
      if (typeof slider.SetValueNoEvents === "function")
        slider.SetValueNoEvents(value);
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

  function setPickerThumb(slider, color, lightness) {
    if (!isValid(slider) || !slider.FindChildTraverse) return;
    try {
      var thumb = slider.FindChildTraverse("SliderThumb");
      if (!isValid(thumb) || !thumb.style) return;
      if (thumb.style.backgroundColor !== color)
        thumb.style.backgroundColor = color;
      var border = lightness < 35 ? "#FFEFD7" : "#10130D";
      if (thumb.style.borderColor !== border)
        thumb.style.borderColor = border;
    } catch (error) {}
  }

  function syncPicker() {
    if (!picker.key || !isValid(ui.pickerRoot)) return;
    var color = hslToHex(
      picker.hue,
      picker.saturation,
      picker.lightness,
    );
    setText(ui.pickerTitle, COLOR_TITLES[picker.key] || "COLOR");
    setText(ui.pickerHex, color);
    setText(ui.pickerHueValue, picker.hue + "°");
    setText(ui.pickerSaturationValue, picker.saturation + "%");
    setText(ui.pickerLightnessValue, picker.lightness + "%");
    if (isValid(ui.pickerPreview) && ui.pickerPreview.style)
      ui.pickerPreview.style.backgroundColor = color;

    setPickerSliderValue(ui.pickerHueSlider, picker.hue);
    setPickerSliderValue(ui.pickerSaturationSlider, picker.saturation);
    setPickerSliderValue(ui.pickerLumenSlider, picker.lightness);

    setPickerThumb(ui.pickerHueSlider, color, picker.lightness);
    setPickerThumb(ui.pickerSaturationSlider, color, picker.lightness);
    setPickerThumb(ui.pickerLumenSlider, color, picker.lightness);

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
      ui.pickerLumenSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(#000000), color-stop(0.5, " +
        hslToHex(picker.hue, picker.saturation, 50) +
        "), to(#FFFFFF))",
    );
  }

  function bindPickerSlider(slider, component) {
    if (!isValid(slider)) return;
    var gestureBefore = "";
    try {
      slider.increment = 1;
    } catch (error) {}
    setPanelEvent(slider, "onmousedown", function () {
      gestureBefore = valuesRaw();
    });
    setPanelEvent(slider, "onvaluechanged", function () {
      if (syncingControls || !picker.key) return;
      var before = gestureBefore ? "" : valuesRaw();
      var max = component === "hue" ? 359 : 100;
      picker[component] = clampNumber(
        slider.value,
        0,
        max,
        picker[component],
      );
      commitValue(
        picker.key,
        hslToHex(picker.hue, picker.saturation, picker.lightness),
        false,
      );
      if (before) pushHistory(before);
    });
    setPanelEvent(slider, "onmouseup", function () {
      if (gestureBefore && gestureBefore !== valuesRaw())
        pushHistory(gestureBefore);
      gestureBefore = "";
      syncControls();
    });
  }

  function closePicker() {
    if (!picker.key) return;
    picker.key = "";
    setClass(ui.pickerRoot, "Open", false);
    focus(picker.returnPanel);
    picker.returnPanel = null;
  }

  function openPicker(key, returnPanel) {
    if (!COLOR_KEYS[key]) return;
    picker.key = key;
    picker.returnPanel = returnPanel;
    var hsl = hexToHsl(state.values[key]);
    picker.hue = hsl.hue;
    picker.saturation = hsl.saturation;
    picker.lightness = hsl.lightness;
    setClass(ui.pickerRoot, "Open", true);
    syncPicker();
    focus(ui.pickerHueSlider);
  }

  function syncControls() {
    syncingControls = true;
    setToggle("HPColorsMasterToggle", state.values.enabled);
    setToggle("HPColorsEnemyToggle", state.values.enemyEnabled);
    setToggle("HPColorsEnemyVisibleToggle", state.values.enemyVisible);
    setToggle("HPColorsAllyToggle", state.values.allyEnabled);
    setToggle("HPColorsAllyVisibleToggle", state.values.allyVisible);
    setToggle("HPColorsEnemyTeamHighToggle", state.values.enemyTeamHigh);
    setToggle("HPColorsExcludeBuildingsToggle", state.values.excludeBuildings);
    setToggle("HPColorsExcludeBossesToggle", state.values.excludeBosses);
    setToggle("HPColorsReadoutToggle", state.values.readoutVisible);
    setToggle("HPColorsPipsVisibleToggle", state.values.pipsVisible);
    setToggle(
      "HPColorsPrecisePipsToggle",
      state.values.precisePipsEnabled,
    );
    setToggle("HPColorsLevelsVisibleToggle", state.values.levelsVisible);


    setToggle("HPColorsEnemyPulseToggle", state.values.enemyPulseEnabled);
    setToggle(
      "HPColorsEnemyPulseColorToggle",
      state.values.enemyPulseColorEnabled,
    );
    setToggle(
      "HPColorsEnemyPulseHideBarToggle",
      state.values.enemyPulseHideBar,
    );
    setToggle(
      "HPColorsEnemyPulseReadoutToggle",
      state.values.enemyPulseReadout,
    );
    setToggle("HPColorsAllyPulseToggle", state.values.allyPulseEnabled);
    setToggle(
      "HPColorsAllyPulseColorToggle",
      state.values.allyPulseColorEnabled,
    );
    setClass(
      find("HPColorsEnemyPulseIntensitySubtle"),
      "Selected",
      state.values.enemyPulseIntensity === 0,
    );
    setClass(
      find("HPColorsEnemyPulseIntensityMedium"),
      "Selected",
      state.values.enemyPulseIntensity === 1,
    );
    setClass(
      find("HPColorsEnemyPulseIntensityIntense"),
      "Selected",
      state.values.enemyPulseIntensity === 2,
    );
    setClass(
      find("HPColorsAllyPulseIntensitySubtle"),
      "Selected",
      state.values.allyPulseIntensity === 0,
    );
    setClass(
      find("HPColorsAllyPulseIntensityMedium"),
      "Selected",
      state.values.allyPulseIntensity === 1,
    );
    setClass(
      find("HPColorsAllyPulseIntensityIntense"),
      "Selected",
      state.values.allyPulseIntensity === 2,
    );
    setClass(
      find("HPColorsEnemyPulseColorModeFixed"),
      "Selected",
      state.values.enemyPulseColorMode === "fixed",
    );
    setClass(
      find("HPColorsEnemyPulseColorModeGradient"),
      "Selected",
      state.values.enemyPulseColorMode === "gradient",
    );
    var enemyPulseActive = state.values.enemyPulseEnabled;
    var enemyPulseColorActive = enemyPulseActive && state.values.enemyPulseColorEnabled;
    setClass(
      find("HPColorsEnemyPulseColorModeRow"),
      "Disabled",
      !enemyPulseColorActive,
    );
    setClass(
      find("HPColorsEnemyPulseColorRow"),
      "Active",
      enemyPulseColorActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseColorModeFixed"),
      enemyPulseColorActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseColorModeGradient"),
      enemyPulseColorActive,
    );
    var allyPulseColorActive =
      state.values.allyPulseEnabled && state.values.allyPulseColorEnabled;
    setClass(
      find("HPColorsAllyPulseColorRow"),
      "Active",
      allyPulseColorActive,
    );
    setClass(
      find("HPColorsEnemyModeFixed"),
      "Selected",
      state.values.enemyMode === "fixed",
    );
    setClass(
      find("HPColorsEnemyModeGradient"),
      "Selected",
      state.values.enemyMode === "gradient",
    );
    setClass(
      find("HPColorsAllyModeFixed"),
      "Selected",
      state.values.allyMode === "fixed",
    );
    setClass(
      find("HPColorsAllyModeGradient"),
      "Selected",
      state.values.allyMode === "gradient",
    );
    setClass(
      find("HPColorsUltModeFollow"),
      "Selected",
      state.values.ultMode === "follow",
    );
    setClass(
      find("HPColorsUltModeCustom"),
      "Selected",
      state.values.ultMode === "custom",
    );
    setClass(
      find("HPColorsUltCustomRow"),
      "Active",
      state.values.ultMode === "custom",
    );
    setClass(
      find("HPColorsReadoutFormatHP"),
      "Selected",
      state.values.readoutFormat === "hp",
    );
    setClass(
      find("HPColorsReadoutFormatPercent"),
      "Selected",
      state.values.readoutFormat === "percent",
    );
    setClass(
      find("HPColorsReadoutFormatCurrent"),
      "Selected",
      state.values.readoutFormat === "current",
    );
    setClass(
      find("HPColorsReadoutFontDefault"),
      "Selected",
      state.values.readoutFont === "default",
    );
    setClass(
      find("HPColorsReadoutFontOracle"),
      "Selected",
      state.values.readoutFont === "oracle",
    );
    setClass(
      find("HPColorsReadoutFontPulp"),
      "Selected",
      state.values.readoutFont === "pulp",
    );
    setClass(
      find("HPColorsReadoutColorBar"),
      "Selected",
      state.values.readoutColorMode === "bar",
    );
    setClass(
      find("HPColorsReadoutColorCustom"),
      "Selected",
      state.values.readoutColorMode === "custom",
    );
    setClass(
      find("HPColorsReadoutModeFixed"),
      "Selected",
      state.values.readoutMode === "fixed",
    );
    setClass(
      find("HPColorsReadoutModeGradient"),
      "Selected",
      state.values.readoutMode === "gradient",
    );
    setClass(
      find("HPColorsReadoutCustomRows"),
      "Active",
      state.values.readoutColorMode === "custom",
    );
    var customReadoutColors = state.values.readoutColorMode === "custom";
    setClass(
      find("HPColorsReadoutModeRow"),
      "Disabled",
      !customReadoutColors,
    );
    setClass(
      find("HPColorsReadoutLowThresholdRow"),
      "Disabled",
      !customReadoutColors,
    );
    setClass(
      find("HPColorsReadoutHighThresholdRow"),
      "Disabled",
      !customReadoutColors,
    );
    setEnabled(find("HPColorsReadoutModeFixed"), customReadoutColors);
    setEnabled(find("HPColorsReadoutModeGradient"), customReadoutColors);
    setEnabled(find("HPColorsReadoutLowThresholdSlider"), customReadoutColors);
    setEnabled(find("HPColorsReadoutLowThresholdEntry"), customReadoutColors);
    setEnabled(find("HPColorsReadoutHighThresholdSlider"), customReadoutColors);
    setEnabled(find("HPColorsReadoutHighThresholdEntry"), customReadoutColors);

    setSlider(
      "HPColorsWidthSlider",
      "HPColorsWidthEntry",
      state.values.widthScale,
    );
    setSlider(
      "HPColorsHeightSlider",
      "HPColorsHeightEntry",
      state.values.heightScale,
    );
    setSlider(
      "HPColorsPositionXSlider",
      "HPColorsPositionXEntry",
      state.values.positionX,
    );
    setSlider(
      "HPColorsPositionYSlider",
      "HPColorsPositionYEntry",
      state.values.positionY,
    );
    setSlider(
      "HPColorsLowThresholdSlider",
      "HPColorsLowThresholdEntry",
      state.values.lowThreshold,
    );
    setSlider(
      "HPColorsHighThresholdSlider",
      "HPColorsHighThresholdEntry",
      state.values.highThreshold,
    );
    setSlider(
      "HPColorsReadoutLowThresholdSlider",
      "HPColorsReadoutLowThresholdEntry",
      state.values.lowThreshold,
    );
    setSlider(
      "HPColorsReadoutHighThresholdSlider",
      "HPColorsReadoutHighThresholdEntry",
      state.values.highThreshold,
    );
    setSlider(
      "HPColorsReadoutSizeSlider",
      "HPColorsReadoutSizeEntry",
      state.values.readoutSize,
    );
    setSlider(
      "HPColorsReadoutOffsetXSlider",
      "HPColorsReadoutOffsetXEntry",
      state.values.readoutOffsetX,
    );
    setSlider(
      "HPColorsReadoutOffsetYSlider",
      "HPColorsReadoutOffsetYEntry",
      state.values.readoutOffsetY,
    );

    setSlider(
      "HPColorsEnemyPulseThresholdSlider",
      "HPColorsEnemyPulseThresholdEntry",
      state.values.enemyPulseThreshold,
    );
    setSlider(
      "HPColorsEnemyPulseBpmSlider",
      "HPColorsEnemyPulseBpmEntry",
      state.values.enemyPulseBpm,
    );
    setSlider(
      "HPColorsAllyPulseThresholdSlider",
      "HPColorsAllyPulseThresholdEntry",
      state.values.allyPulseThreshold,
    );
    setSlider(
      "HPColorsAllyPulseBpmSlider",
      "HPColorsAllyPulseBpmEntry",
      state.values.allyPulseBpm,
    );
    setColor(
      "HPColorsEnemyLowSwatch",
      "HPColorsEnemyLowHex",
      state.values.enemyLow,
    );
    setColor(
      "HPColorsEnemyMidSwatch",
      "HPColorsEnemyMidHex",
      state.values.enemyMid,
    );
    setColor(
      "HPColorsEnemyHighSwatch",
      "HPColorsEnemyHighHex",
      state.values.enemyHigh,
    );
    setColor(
      "HPColorsEnemyHealingSwatch",
      "HPColorsEnemyHealingHex",
      state.values.enemyHealing,
    );
    setColor(
      "HPColorsEnemyDeltaSwatch",
      "HPColorsEnemyDeltaHex",
      state.values.enemyDelta,
    );
    setColor(
      "HPColorsEnemyShieldSwatch",
      "HPColorsEnemyShieldHex",
      state.values.enemyBulletShield,
    );
    setColor(
      "HPColorsUltCustomSwatch",
      "HPColorsUltCustomHex",
      state.values.ultCustom,
    );
    setColor(
      "HPColorsAllyLowSwatch",
      "HPColorsAllyLowHex",
      state.values.allyLow,
    );
    setColor(
      "HPColorsAllyMidSwatch",
      "HPColorsAllyMidHex",
      state.values.allyMid,
    );
    setColor(
      "HPColorsAllyHighSwatch",
      "HPColorsAllyHighHex",
      state.values.allyHigh,
    );
    setColor(
      "HPColorsAllyHealingSwatch",
      "HPColorsAllyHealingHex",
      state.values.allyHealing,
    );
    setColor(
      "HPColorsAllyDeltaSwatch",
      "HPColorsAllyDeltaHex",
      state.values.allyDelta,
    );
    setColor(
      "HPColorsAllyShieldSwatch",
      "HPColorsAllyShieldHex",
      state.values.allyBulletShield,
    );
    setColor(
      "HPColorsReadoutLowSwatch",
      "HPColorsReadoutLowHex",
      state.values.readoutLow,
    );
    setColor(
      "HPColorsReadoutMidSwatch",
      "HPColorsReadoutMidHex",
      state.values.readoutMid,
    );
    setColor(
      "HPColorsReadoutHighSwatch",
      "HPColorsReadoutHighHex",
      state.values.readoutHigh,
    );

    setColor(
      "HPColorsEnemyPulseColorSwatch",
      "HPColorsEnemyPulseColorHex",
      state.values.enemyPulseColor,
    );
    setColor(
      "HPColorsAllyPulseColorSwatch",
      "HPColorsAllyPulseColorHex",
      state.values.allyPulseColor,
    );
    setClass(ui.undoButton, "Disabled", state.history.length === 0);
    if (ui.undoButton) ui.undoButton.enabled = state.history.length > 0;
    syncPicker();
    syncingControls = false;
  }

  function renderNavigation() {
    var category = CATEGORY_DEFS[state.categoryIndex];
    if (!category) return;

    setText(ui.headerCategory, category.name);
    for (var categoryIndex = 0; categoryIndex < ui.categoryButtons.length; categoryIndex++) {
      setClass(
        ui.categoryButtons[categoryIndex],
        "Selected",
        categoryIndex === state.categoryIndex,
      );
    }

    for (var tabIndex = 0; tabIndex < ui.tabButtons.length; tabIndex++) {
      var tab = category.tabs[tabIndex];
      setClass(ui.tabButtons[tabIndex], "Available", !!tab);
      setClass(
        ui.tabButtons[tabIndex],
        "Selected",
        !!tab && tabIndex === state.tabIndex,
      );
      setText(ui.tabLabels[tabIndex], tab ? tab.name : "");
    }

    var activeTab = category.tabs[state.tabIndex];
    if (!activeTab) return;
    setText(ui.pageEyebrow, category.name + " / " + activeTab.name);
    setText(ui.pageTitle, activeTab.title);
    setText(ui.pageDescription, activeTab.description);
    for (var pageIndex = 0; pageIndex < ui.settingsPages.length; pageIndex++) {
      setClass(
        ui.settingsPages[pageIndex],
        "Active",
        ui.settingsPages[pageIndex].id === activeTab.pageId,
      );
    }
    syncControls();
  }

  function selectCategory(index) {
    if (index < 0 || index >= CATEGORY_DEFS.length) return;
    if (state.categoryIndex === index && state.tabIndex === 0) return;
    closePicker();
    state.categoryIndex = index;
    state.tabIndex = 0;
    renderNavigation();
  }

  function selectTab(index) {
    var category = CATEGORY_DEFS[state.categoryIndex];
    if (!category || index < 0 || index >= category.tabs.length) return;
    if (state.tabIndex === index) return;
    closePicker();
    state.tabIndex = index;
    renderNavigation();
  }

  function endPeek() {
    if (!state.peeking) return;
    state.peeking = false;
    setClass(ui.editorRoot, "Peeking", false);
    focus(ui.peekButton);
  }

  function beginPeek() {
    if (!state.open || state.peeking) return;
    closePicker();
    state.peeking = true;
    setClass(ui.editorRoot, "Peeking", true);
    focus(ui.peekCapture);
  }

  function closeEditor() {
    if (!state.open) return;
    closePicker();
    endPeek();
    state.open = false;
    state.history = [];
    setClass(ui.editorRoot, "Open", false);
    setClass(ui.escapeRoot, "EditorOpen", false);
    focus(ui.menuButton);
    $.Msg("[HP Colors Rewrite] menu close");
  }

  function openEditor() {
    if (!state.booted || state.open) return;
    state.open = true;
    state.peeking = false;
    state.history = [];
    loadRootSnapshot();
    setClass(ui.editorRoot, "Peeking", false);
    setClass(ui.editorRoot, "Open", true);
    setClass(ui.escapeRoot, "EditorOpen", true);
    renderNavigation();
    focus(ui.editorShell);
    $.Msg("[HP Colors Rewrite] menu open");
  }

  function cancel() {
    if (picker.key) {
      closePicker();
      return;
    }
    if (state.open) {
      closeEditor();
      return;
    }
    try {
      if (typeof CitadelResumePlaying === "function") CitadelResumePlaying();
    } catch (error) {
      $.Msg("[HP Colors Rewrite] resume failed: " + String(error));
    }
  }

  function resolvePanels() {
    var marker = find("LeftStripeBlur");
    try {
      ui.escapeRoot =
        marker && marker.GetParent ? marker.GetParent() : context;
    } catch (error) {
      ui.escapeRoot = context;
    }
    ui.absoluteRoot = absoluteRoot(ui.escapeRoot);
    ui.menuButton = find("HPColorsMenuButton");
    ui.editorRoot = find("HPColorsEditorRoot");
    ui.editorShell = find("HPColorsEditorShell");
    ui.peekCapture = find("HPColorsPeekCapture");
    ui.peekButton = find("HPColorsPeekButton");
    ui.doneButton = find("HPColorsDoneButton");
    ui.undoButton = find("HPColorsUndoButton");
    ui.resetButton = find("HPColorsResetSectionButton");
    ui.headerCategory = find("HPColorsHeaderCategory");
    ui.pageEyebrow = find("HPColorsPageEyebrow");
    ui.pageTitle = find("HPColorsPageTitle");
    ui.pageDescription = find("HPColorsPageDescription");
    ui.pickerRoot = find("HPColorsPickerRoot");
    ui.pickerPanel = find("HPColorsPickerPanel");
    ui.pickerBackdrop = find("HPColorsPickerBackdrop");
    ui.pickerDone = find("HPColorsPickerDone");
    ui.pickerTitle = find("HPColorsPickerTitle");
    ui.pickerPreview = find("HPColorsPickerPreview");
    ui.pickerHex = find("HPColorsPickerHex");
    ui.pickerHueValue = find("HPColorsPickerHueValue");
    ui.pickerSaturationValue = find("HPColorsPickerSaturationValue");
    ui.pickerLightnessValue = find("HPColorsPickerLightnessValue");
    ui.pickerHueHost = find("HPColorsPickerHueSliderHost");
    ui.pickerSaturationHost = find("HPColorsPickerSaturationSliderHost");
    ui.pickerLumenHost = find("HPColorsPickerLumenSliderHost");

    for (var categoryIndex = 0; categoryIndex < CATEGORY_BUTTON_IDS.length; categoryIndex++)
      ui.categoryButtons.push(find(CATEGORY_BUTTON_IDS[categoryIndex]));
    for (var tabIndex = 0; tabIndex < 3; tabIndex++) {
      ui.tabButtons.push(find("HPColorsTab" + tabIndex));
      ui.tabLabels.push(find("HPColorsTabLabel" + tabIndex));
    }
    var pageIds = [
      "HPColorsSettingsOverviewStatus",
      "HPColorsSettingsOverviewLayout",
      "HPColorsSettingsEnemyBar",
      "HPColorsSettingsEnemyFeedback",
      "HPColorsSettingsEnemyShields",
      "HPColorsSettingsAllyBar",
      "HPColorsSettingsAllyFeedback",
      "HPColorsSettingsAllyShields",
      "HPColorsSettingsReadoutNumber",
      "HPColorsSettingsReadoutPlacement",
      "HPColorsSettingsReadoutLevels",
      "HPColorsSettingsEnemyPulse",
      "HPColorsSettingsAllyPulse",
    ];

    for (var pageIndex = 0; pageIndex < pageIds.length; pageIndex++)
      ui.settingsPages.push(find(pageIds[pageIndex]));

    return (
      isValid(ui.escapeRoot) &&
      isValid(ui.absoluteRoot) &&
      isValid(ui.menuButton) &&
      isValid(ui.editorRoot) &&
      isValid(ui.editorShell) &&
      isValid(ui.peekCapture) &&
      isValid(ui.peekButton) &&
      isValid(ui.doneButton) &&
      isValid(ui.undoButton) &&
      isValid(ui.resetButton) &&
      isValid(ui.headerCategory) &&
      isValid(ui.pageEyebrow) &&
      isValid(ui.pageTitle) &&
      isValid(ui.pageDescription) &&
      isValid(ui.pickerRoot) &&
      isValid(ui.pickerPanel) &&
      isValid(ui.pickerBackdrop) &&
      isValid(ui.pickerDone) &&
      isValid(ui.pickerHueHost) &&
      isValid(ui.pickerSaturationHost) &&
      isValid(ui.pickerLumenHost)
    );
  }

  function createSlider(hostId, sliderId, min, max) {
    var existing = find(sliderId);
    if (isValid(existing)) return existing;
    var host = find(hostId);
    if (!isValid(host)) return null;
    var slider = $.CreatePanel("Slider", host, sliderId, {
      direction: "horizontal",
    });
    slider.AddClass("HPColorsSlider");
    slider.AddClass("HorizontalSlider");
    slider.min = min;
    slider.max = max;
    slider.style.width = "100%";
    slider.style.height = "12px";
    slider.style.verticalAlign = "center";
    slider.style.overflow = "noclip";
    return slider;
  }

  function createPickerSliders() {
    ui.pickerHueSlider = createSlider(
      "HPColorsPickerHueSliderHost",
      "HPColorsPickerHueSlider",
      0,
      359,
    );
    ui.pickerSaturationSlider = createSlider(
      "HPColorsPickerSaturationSliderHost",
      "HPColorsPickerSaturationSlider",
      0,
      100,
    );
    ui.pickerLumenSlider = createSlider(
      "HPColorsPickerLumenSliderHost",
      "HPColorsPickerLumenSlider",
      0,
      100,
    );
    var sliders = [
      ui.pickerHueSlider,
      ui.pickerSaturationSlider,
      ui.pickerLumenSlider,
    ];
    for (var index = 0; index < sliders.length; index++) {
      if (!isValid(sliders[index])) return false;
      sliders[index].AddClass("HPColorsPickerSlider");
    }
    return true;
  }

  function createSliders() {
    return (
      isValid(createSlider("HPColorsWidthSliderHost", "HPColorsWidthSlider", 60, 160)) &&
      isValid(createSlider("HPColorsHeightSliderHost", "HPColorsHeightSlider", 60, 160)) &&
      isValid(
        createSlider(
          "HPColorsPositionXSliderHost",
          "HPColorsPositionXSlider",
          -300,
          300,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsPositionYSliderHost",
          "HPColorsPositionYSlider",
          -200,
          200,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutSizeSliderHost",
          "HPColorsReadoutSizeSlider",
          72,
          320,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutOffsetXSliderHost",
          "HPColorsReadoutOffsetXSlider",
          -405,
          405,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutOffsetYSliderHost",
          "HPColorsReadoutOffsetYSlider",
          -35,
          840,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsLowThresholdSliderHost",
          "HPColorsLowThresholdSlider",
          0,
          99,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsHighThresholdSliderHost",
          "HPColorsHighThresholdSlider",
          1,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutLowThresholdSliderHost",
          "HPColorsReadoutLowThresholdSlider",
          0,
          99,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutHighThresholdSliderHost",
          "HPColorsReadoutHighThresholdSlider",
          1,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseThresholdSliderHost",
          "HPColorsEnemyPulseThresholdSlider",
          0,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseBpmSliderHost",
          "HPColorsEnemyPulseBpmSlider",
          30,
          300,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsAllyPulseThresholdSliderHost",
          "HPColorsAllyPulseThresholdSlider",
          0,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsAllyPulseBpmSliderHost",
          "HPColorsAllyPulseBpmSlider",
          30,
          300,
        ),
      ) &&
      createPickerSliders()
    );
  }

  function bindPickerControls() {
    setPanelEvent(ui.pickerDone, "onactivate", closePicker);
    setPanelEvent(ui.pickerPanel, "oncancel", closePicker);
    bindPickerSlider(ui.pickerHueSlider, "hue");
    bindPickerSlider(ui.pickerSaturationSlider, "saturation");
    bindPickerSlider(ui.pickerLumenSlider, "lightness");
  }

  function bindControls() {
    bindToggle("HPColorsMasterToggle", "enabled");
    bindToggle("HPColorsEnemyToggle", "enemyEnabled");
    bindToggle("HPColorsEnemyVisibleToggle", "enemyVisible");
    bindToggle("HPColorsAllyToggle", "allyEnabled");
    bindToggle("HPColorsAllyVisibleToggle", "allyVisible");
    bindToggle("HPColorsEnemyTeamHighToggle", "enemyTeamHigh");
    bindToggle("HPColorsExcludeBuildingsToggle", "excludeBuildings");
    bindToggle("HPColorsExcludeBossesToggle", "excludeBosses");
    bindMode("HPColorsEnemyModeFixed", "enemyMode", "fixed");
    bindMode("HPColorsEnemyModeGradient", "enemyMode", "gradient");
    bindMode("HPColorsAllyModeFixed", "allyMode", "fixed");
    bindMode("HPColorsAllyModeGradient", "allyMode", "gradient");
    bindMode("HPColorsUltModeFollow", "ultMode", "follow");
    bindMode("HPColorsUltModeCustom", "ultMode", "custom");
    bindToggle("HPColorsReadoutToggle", "readoutVisible");
    bindToggle("HPColorsPipsVisibleToggle", "pipsVisible");
    bindToggle("HPColorsPrecisePipsToggle", "precisePipsEnabled");
    bindToggle("HPColorsLevelsVisibleToggle", "levelsVisible");
    setPanelEvent(
      find("HPColorsPrecisePipsCopy"),
      "onactivate",
      copyPrecisePipCommands,
    );
    bindToggle("HPColorsEnemyPulseToggle", "enemyPulseEnabled");
    bindToggle("HPColorsEnemyPulseColorToggle", "enemyPulseColorEnabled");
    bindToggle("HPColorsEnemyPulseHideBarToggle", "enemyPulseHideBar");
    bindToggle("HPColorsEnemyPulseReadoutToggle", "enemyPulseReadout");
    bindToggle("HPColorsAllyPulseToggle", "allyPulseEnabled");
    bindToggle("HPColorsAllyPulseColorToggle", "allyPulseColorEnabled");
    bindMode(
      "HPColorsEnemyPulseColorModeFixed",
      "enemyPulseColorMode",
      "fixed",
    );
    bindMode(
      "HPColorsEnemyPulseColorModeGradient",
      "enemyPulseColorMode",
      "gradient",
    );
    bindMode("HPColorsEnemyPulseIntensitySubtle", "enemyPulseIntensity", 0);
    bindMode("HPColorsEnemyPulseIntensityMedium", "enemyPulseIntensity", 1);
    bindMode("HPColorsEnemyPulseIntensityIntense", "enemyPulseIntensity", 2);
    bindMode("HPColorsAllyPulseIntensitySubtle", "allyPulseIntensity", 0);
    bindMode("HPColorsAllyPulseIntensityMedium", "allyPulseIntensity", 1);
    bindMode("HPColorsAllyPulseIntensityIntense", "allyPulseIntensity", 2);
    bindMode("HPColorsReadoutFormatHP", "readoutFormat", "hp");
    bindMode("HPColorsReadoutFormatPercent", "readoutFormat", "percent");
    bindMode("HPColorsReadoutFormatCurrent", "readoutFormat", "current");
    bindMode("HPColorsReadoutFontDefault", "readoutFont", "default");
    bindMode("HPColorsReadoutFontOracle", "readoutFont", "oracle");
    bindMode("HPColorsReadoutFontPulp", "readoutFont", "pulp");
    bindMode("HPColorsReadoutColorBar", "readoutColorMode", "bar");
    bindMode("HPColorsReadoutColorCustom", "readoutColorMode", "custom");
    bindMode("HPColorsReadoutModeFixed", "readoutMode", "fixed");
    bindMode("HPColorsReadoutModeGradient", "readoutMode", "gradient");
    bindSlider("HPColorsWidthSlider", "HPColorsWidthEntry", "widthScale", 60, 160);
    bindSlider("HPColorsHeightSlider", "HPColorsHeightEntry", "heightScale", 60, 160);
    bindSlider(
      "HPColorsPositionXSlider",
      "HPColorsPositionXEntry",
      "positionX",
      -300,
      300,
    );
    bindSlider(
      "HPColorsPositionYSlider",
      "HPColorsPositionYEntry",
      "positionY",
      -200,
      200,
    );
    bindSlider(
      "HPColorsReadoutSizeSlider",
      "HPColorsReadoutSizeEntry",
      "readoutSize",
      72,
      320,
    );
    bindSlider(
      "HPColorsReadoutOffsetXSlider",
      "HPColorsReadoutOffsetXEntry",
      "readoutOffsetX",
      -405,
      405,
    );
    bindSlider(
      "HPColorsReadoutOffsetYSlider",
      "HPColorsReadoutOffsetYEntry",
      "readoutOffsetY",
      -35,
      840,
    );
    bindSlider(
      "HPColorsEnemyPulseThresholdSlider",
      "HPColorsEnemyPulseThresholdEntry",
      "enemyPulseThreshold",
      0,
      100,
    );
    bindSlider(
      "HPColorsEnemyPulseBpmSlider",
      "HPColorsEnemyPulseBpmEntry",
      "enemyPulseBpm",
      30,
      300,
    );
    bindSlider(
      "HPColorsAllyPulseThresholdSlider",
      "HPColorsAllyPulseThresholdEntry",
      "allyPulseThreshold",
      0,
      100,
    );
    bindSlider(
      "HPColorsAllyPulseBpmSlider",
      "HPColorsAllyPulseBpmEntry",
      "allyPulseBpm",
      30,
      300,
    );
    bindSlider(
      "HPColorsLowThresholdSlider",
      "HPColorsLowThresholdEntry",
      "lowThreshold",
      0,
      99,
    );
    bindSlider(
      "HPColorsHighThresholdSlider",
      "HPColorsHighThresholdEntry",
      "highThreshold",
      1,
      100,
    );
    bindSlider(
      "HPColorsReadoutLowThresholdSlider",
      "HPColorsReadoutLowThresholdEntry",
      "lowThreshold",
      0,
      99,
    );
    bindSlider(
      "HPColorsReadoutHighThresholdSlider",
      "HPColorsReadoutHighThresholdEntry",
      "highThreshold",
      1,
      100,
    );
    bindColor("HPColorsEnemyLowSwatch", "HPColorsEnemyLowHex", "enemyLow");
    bindColor("HPColorsEnemyMidSwatch", "HPColorsEnemyMidHex", "enemyMid");
    bindColor("HPColorsEnemyHighSwatch", "HPColorsEnemyHighHex", "enemyHigh");
    bindColor(
      "HPColorsEnemyHealingSwatch",
      "HPColorsEnemyHealingHex",
      "enemyHealing",
    );
    bindColor(
      "HPColorsEnemyDeltaSwatch",
      "HPColorsEnemyDeltaHex",
      "enemyDelta",
    );
    bindColor(
      "HPColorsEnemyShieldSwatch",
      "HPColorsEnemyShieldHex",
      "enemyBulletShield",
    );
    bindColor(
      "HPColorsUltCustomSwatch",
      "HPColorsUltCustomHex",
      "ultCustom",
    );
    bindColor("HPColorsAllyLowSwatch", "HPColorsAllyLowHex", "allyLow");
    bindColor("HPColorsAllyMidSwatch", "HPColorsAllyMidHex", "allyMid");
    bindColor("HPColorsAllyHighSwatch", "HPColorsAllyHighHex", "allyHigh");
    bindColor(
      "HPColorsAllyHealingSwatch",
      "HPColorsAllyHealingHex",
      "allyHealing",
    );
    bindColor(
      "HPColorsAllyDeltaSwatch",
      "HPColorsAllyDeltaHex",
      "allyDelta",
    );
    bindColor(
      "HPColorsAllyShieldSwatch",
      "HPColorsAllyShieldHex",
      "allyBulletShield",
    );
    bindColor(
      "HPColorsEnemyPulseColorSwatch",
      "HPColorsEnemyPulseColorHex",
      "enemyPulseColor",
    );
    bindColor(
      "HPColorsAllyPulseColorSwatch",
      "HPColorsAllyPulseColorHex",
      "allyPulseColor",
    );
    bindColor(
      "HPColorsReadoutLowSwatch",
      "HPColorsReadoutLowHex",
      "readoutLow",
    );
    bindColor(
      "HPColorsReadoutMidSwatch",
      "HPColorsReadoutMidHex",
      "readoutMid",
    );
    bindColor(
      "HPColorsReadoutHighSwatch",
      "HPColorsReadoutHighHex",
      "readoutHigh",
    );
  }


  function boot() {
    if (state.booted) return;
    if (!resolvePanels()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: required panel missing");
      return;
    }
    if (!createSliders()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: slider host missing");
      return;
    }


    setPanelEvent(ui.menuButton, "onactivate", openEditor);
    setPanelEvent(ui.doneButton, "onactivate", closeEditor);
    setPanelEvent(ui.undoButton, "onactivate", undo);
    setPanelEvent(ui.resetButton, "onactivate", resetSection);
    setPanelEvent(ui.peekButton, "onmousedown", beginPeek);
    setPanelEvent(ui.peekButton, "onmouseup", endPeek);
    setPanelEvent(ui.peekCapture, "onactivate", endPeek);
    setPanelEvent(ui.peekCapture, "onmouseup", endPeek);

    for (var categoryIndex = 0; categoryIndex < ui.categoryButtons.length; categoryIndex++)
      bindCategory(categoryIndex);
    for (var tabIndex = 0; tabIndex < ui.tabButtons.length; tabIndex++)
      bindTab(tabIndex);
    bindControls();
    bindPickerControls();

    state.booted = true;
    if (!loadRootSnapshot()) {
      state.values = copyValues(DEFAULTS);
      publish("*");
    }
    refreshSnapshotReplay();
    renderNavigation();
    $.Msg("[HP Colors Rewrite] menu ready");
  }

  $.HPColorsMenuBoot = boot;
  $.HPColorsMenuCancel = cancel;
})();
