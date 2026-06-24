// fallow-ignore-file unused-file
// fallow-ignore-file complexity
/* hp_colors schema audit markers:
if (cfg.hp_skip_buildings && (fl & 4))
normalizeWashColor(cfg.hp_color_high) === normalizeWashColor(DEFAULTS.hp_color_high)
*/
"use strict";
(function () {
  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var TITLE = "HP Colors";
  var DEFAULTS = {
    hp_enabled: true,
    hp_mode: 1,
    hp_low_threshold: 25,
    hp_high_threshold: 65,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_info_health_margin_top: 23,
    hp_healthbar_height: 130,
    hp_color_low: "#E16161",
    hp_color_mid: "#FF7B00",
    hp_color_high: "#00FF00",
    hp_counter_visible: true,
    hp_counter_size: 145,
    hp_counter_position: "27,20",
    hp_text_color_mode: 0,
    hp_text_color_low: "#E16161",
    hp_text_color_mid: "#FF7B00",
    hp_text_color_high: "#FFFFFF",
    hp_pulse_bpm: 75,
    hp_pulse_intensity: 1,
    hp_pulse_enabled: true,
    hp_pulse_text_enabled: false,
    hp_pulse_text_scale: 120,
    hp_pulse_text_position: "20,196",
    hp_pulse_hide_bar: false,
    hp_pulse_color_enabled: false,
    hp_pulse_color: "#FF2222",
    hp_pulse_color_mode: 0,
    hp_skip_buildings: false,
    hp_pulse_threshold: 25,
    hp_counter_format: 0,
    hp_friend_enabled: false,
    hp_friend_pulse_enabled: false,
    hp_friend_pulse_bpm: 75,
    hp_friend_pulse_intensity: 1,
    hp_friend_pulse_threshold: 25,
    hp_friend_color_low: "#E16161",
    hp_friend_color_mid: "#FF7B00",
    hp_friend_color_high: "#00FF00",
    hp_friend_pulse_color_enabled: false,
    hp_friend_pulse_color: "#FF2222",
    hp_level_number_visible: true,
    hp_pip_visible: true,
    hp_ult_color_enabled: true,
    hp_ult_color_custom: "#E16161",
    hp_kill_zone_enabled: false,
    hp_kill_zone_threshold: 25,
    hp_kill_zone_color: "#FF2222",
    hp_kill_zone_width: 3,
  };
  var RUNTIME_OPTIMIZED_PROFILE = false;
  var OPTIMIZED_FORCED_VALUES = {};
  var cfg = {};
  var dc = {};
  var TEAM1_HIGH = "#FFC961";
  var TEAM2_HIGH = "#6485FC";
  var CSS_TEAM1_COLOR = "#E7B659";
  var CSS_TEAM2_COLOR = "#5B79E6";
  var CSS_TEAM_ENEMY_COLOR = "#E16161";
  var CSS_TEAM_FRIEND_COLOR = "#FFEFD7";
  var ID_UNIT_STATUS = "UnitStatus";
  var ID_INFO_HEALTH = "InfoHealthContainer";
  var ID_HEALTHBAR_CONTAINER = "UnitHealthbarContainer";
  var ID_RED_BAR = "unit_healthbar_lagging";
  var ID_BAR_BG = "unit_healthbar_bg";
  var ID_PIP_LABEL = "unit_healthbar_pip_label";
  var ID_ULT_ICON = "unit_ult_ready_icon";
  var ID_NAME = "name";
  var ID_COUNTER = "hp_counter";
  var ID_COUNTER_ANCHOR = "hp_counter_anchor";
  var ID_KILL_MARKER = "hp_kill_zone_marker";
  var ID_LEVEL_LABEL = "unit_level_label";
  var ID_LEVEL_CONTAINER = "LevelContainer";

  var WHITE_WASH = "#ffffff";
  var LP = "low_hp_pulsing";
  var _ts = Date.now
    ? Date.now.bind(Date)
    : function () {
        return +new Date();
      };
  var PULSE_INTENSITY = ["pulse_subtle", "", "pulse_intense"];
  var ENEMY_IDLE_BACKOFF = [0.35, 0.8, 1.5, 2.5];
  var ALLY_IDLE_BACKOFF = [0.35, 0.7, 1.4, 2.0, 2.0];
  var CURRENT_RB_RESCAN_MS = 180;
  var CURRENT_RB_IDLE_RESCAN_MS = 1200;
  var CURRENT_RB_IDLE_RESCAN_MID_MS = 1800;
  var CURRENT_RB_IDLE_RESCAN_SLOW_MS = 2500;
  var CURRENT_RB_REFRESH_WINDOW_MS = 1600;

  // ── Loop control ────────────────────────────────────────────────────────────
  var LOOP_ENEMY = 0;
  var LOOP_ALLY = 1;
  var LOOP_LEVEL = 2;
  var loopRunning = [false, false, false];
  var loopWakeQueued = [false, false, false];
  var loopScheduleToken = [0, 0, 0];
  var loopNextDueAt = [0, 0, 0];

  // ── Pulse state ─────────────────────────────────────────────────────────────
  var pulse = 0;
  var lPD = null;
  var lPI = -1;
  var lTB = null;

  // ── Ally state ───────────────────────────────────────────────────────────────
  var rbA = null,
    cpA = null;
  var allyOwnedPanel = null;
  var lColA = null,
    lWA = -1,
    lPWA = -1,
    sfcA = 0,
    allyColorActive = false;
  var noAllyParentWidthFrames = 0;
  var pulseA = 0,
    lPIA = -1;
  var aIdleMiss = 0;
  var ALLY_SNAPSHOT = {
    confirmed: false,
    panel: null,
    parent: null,
    flags: 0,
    barWidth: 0,
    parentWidth: 0,
    hp: 0,
  };
  var ALLY_PAINT_PLAN = {
    washColor: "",
    inPulse: false,
    nextDelay: 0.35,
  };


  function clearPulse() {
    if (!pulse && lPD === null && lPI < 0 && lTB === null) return;
    var oldCls = lPI >= 0 ? PULSE_INTENSITY[lPI] : "";
    pulse = 0;
    lPD = null;
    lPI = -1;
    lTB = null;
    lCol = lUlt = lTxt = null;
    lColRaw = lUltRaw = lTxtRaw = null;
    var panels = [rb, hc, ui];
    for (var i = 0; i < panels.length; i++) {
      var panel = panels[i];
      if (!panel) continue;
      try {
        panel.RemoveClass(LP);
        if (oldCls) panel.RemoveClass(oldCls);
        if (panel.style) {
          panel.style.animationDuration = "";
          panel.style.brightness = "";
        }
      } catch (e) {}
    }
  }

  var ENEMY_PULSE_PLAN = {
    shouldPulse: false,
    start: false,
    stop: false,
    duration: "",
    intensityIndex: -1,
    textEnabled: false,
    textBrightness: "",
    resetText: false,
    fastSchedule: false,
  };

  function resetEnemyPulsePlan(plan) {
    plan.shouldPulse = false;
    plan.start = false;
    plan.stop = false;
    plan.duration = "";
    plan.intensityIndex = -1;
    plan.textEnabled = false;
    plan.textBrightness = "";
    plan.resetText = false;
    plan.fastSchedule = false;
    return plan;
  }

  function computeEnemyPulsePlan(shouldPulse, now, plan) {
    plan = resetEnemyPulsePlan(plan || ENEMY_PULSE_PLAN);
    if (!shouldPulse) {
      plan.stop = !!pulse;
      return plan;
    }
    plan.shouldPulse = true;
    plan.start = !pulse;
    var bpm = clampNum(cfg.hp_pulse_bpm, 30, 300, 75);
    plan.duration = (60 / bpm).toFixed(3) + "s";
    plan.intensityIndex = clampNum(cfg.hp_pulse_intensity, 0, 2, 1) | 0;
    if (!hc || !hc.style) return plan;
    if (!cfg.hp_pulse_text_enabled) {
      plan.resetText = true;
      return plan;
    }
    var period = Math.max(1, 60000 / bpm);
    var phase = (now % period) / period;
    var wave = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    var idx = plan.intensityIndex;
    var hi = idx === 2 ? 2.0 : idx === 0 ? 1.15 : 1.5;
    var lo = idx === 2 ? 0.55 : idx === 0 ? 0.85 : 0.65;
    plan.textEnabled = true;
    plan.textBrightness = (lo + (hi - lo) * wave).toFixed(2);
    plan.fastSchedule = true;
    return plan;
  }

  function applyEnemyPulsePlan(plan) {
    if (plan.stop) {
      clearPulse();
      return false;
    }
    if (!plan.shouldPulse) return false;
    if (!pulse) {
      pulse = 1;
      lCol = lUlt = lTxt = null;
      try {
        if (rb) rb.AddClass(LP);
      } catch (e) {}
      try {
        if (ui) ui.AddClass(LP);
      } catch (e3) {}
    }
    if (lPD !== plan.duration) {
      lPD = plan.duration;
      if (rb && rb.IsValid && rb.IsValid()) rb.style.animationDuration = plan.duration;
      if (ui && ui.IsValid && ui.IsValid()) ui.style.animationDuration = plan.duration;
    }
    if (lPI !== plan.intensityIndex) {
      var oldCls = lPI >= 0 ? PULSE_INTENSITY[lPI] : "";
      var newCls = PULSE_INTENSITY[plan.intensityIndex];
      lPI = plan.intensityIndex;
      if (oldCls) {
        try {
          if (rb && rb.IsValid && rb.IsValid()) rb.RemoveClass(oldCls);
        } catch (e4) {}
        try {
          if (ui && ui.IsValid && ui.IsValid()) ui.RemoveClass(oldCls);
        } catch (e5) {}
      }
      if (newCls) {
        try {
          if (rb && rb.IsValid && rb.IsValid()) rb.AddClass(newCls);
        } catch (e6) {}
        try {
          if (ui && ui.IsValid && ui.IsValid()) ui.AddClass(newCls);
        } catch (e7) {}
      }
    }
    if (plan.resetText) {
      try {
        if (hc && hc.style) {
          hc.style.animationDuration = "";
          hc.style.brightness = "";
        }
        lTB = null;
      } catch (e8) {}
      return false;
    }
    if (!plan.textEnabled || !hc || !hc.style) return false;
    if (lTB !== plan.textBrightness) {
      try {
        hc.style.brightness = plan.textBrightness;
        lTB = plan.textBrightness;
      } catch (e9) {
        lTB = null;
      }
    }
    return plan.fastSchedule;
  }

  function syncEnemyPulse(shouldPulse, now) {
    return applyEnemyPulsePlan(
      computeEnemyPulsePlan(shouldPulse, now, ENEMY_PULSE_PLAN),
    );
  }

  function syncAllyPulse(panel, shouldPulse) {
    var oldCls = lPIA >= 0 ? PULSE_INTENSITY[lPIA] : "";
    if (!shouldPulse) {
      pulseA = 0;
      lPIA = -1;
      lColA = null;
      var clearPanel = panel || allyOwnedPanel;
      if (!clearPanel) return;
      try {
        clearPanel.RemoveClass(LP);
        if (oldCls) clearPanel.RemoveClass(oldCls);
        if (clearPanel.style) {
          clearPanel.style.animationDuration = "";
          clearPanel.style.brightness = "";
        }
      } catch (eClear) {}
      return;
    }
    if (pulseA) return;
    pulseA = 1;
    lPIA = -1;
    lColA = null;
    try {
      if (panel) panel.AddClass(LP);
    } catch (e) {}
    var idx = clampNum(cfg.hp_friend_pulse_intensity, 0, 2, 1) | 0;
    lPIA = idx;
    var cls = PULSE_INTENSITY[idx];
    if (cls) {
      try {
        panel.AddClass(cls);
      } catch (e2) {}
    }
    var bpm = clampNum(cfg.hp_friend_pulse_bpm, 30, 300, 75);
    try {
      if (panel) panel.style.animationDuration = (60 / bpm).toFixed(3) + "s";
    } catch (e3) {}
  }

  function formatPositionValue(rawPos) {
    var posX = 0;
    var posY = 200;

    if (rawPos && typeof rawPos === "object") {
      if (Array.isArray(rawPos)) {
        if (rawPos.length > 0) posX = clampNum(rawPos[0], 0, 400, 0);
        if (rawPos.length > 1) posY = clampNum(rawPos[1], -50, 400, 200);
      } else {
        if (Object.prototype.hasOwnProperty.call(rawPos, "x"))
          posX = clampNum(rawPos.x, 0, 400, 0);
        if (Object.prototype.hasOwnProperty.call(rawPos, "y"))
          posY = clampNum(rawPos.y, -50, 400, 200);
      }
      return Math.round(posX) + "," + Math.round(posY);
    }

    if (typeof rawPos === "string") {
      var posParts = rawPos.match(/-?\d+(?:\.\d+)?/g);
      if (posParts && posParts.length > 0) {
        posX = clampNum(posParts[0], 0, 400, 0);
        if (posParts.length > 1) posY = clampNum(posParts[1], -50, 400, 200);
        return Math.round(posX) + "," + Math.round(posY);
      }
    } else if (typeof rawPos === "number") {
      posY = clampNum(rawPos, -50, 400, 200);
    }

    return Math.round(posX) + "," + Math.round(posY);
  }

  function coerceBooleanValue(value, fallback) {
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

  function coerceNumberValue(value, fallback) {
    var next = Number(value);
    if (!isFinite(next)) return fallback;
    return Math.round(next);
  }

  function coerceStringValue(value, fallback) {
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }

  var HPValueCodecs = {
    formatPositionValue: function (rawPos) {
      return formatPositionValue(rawPos);
    },
    coerceBooleanValue: function (value, fallback) {
      return coerceBooleanValue(value, fallback);
    },
    coerceNumberValue: function (value, fallback) {
      return coerceNumberValue(value, fallback);
    },
    coerceStringValue: function (value, fallback) {
      return coerceStringValue(value, fallback);
    },
    coerceCfgValue: function (id, value) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, id)) return value;

      var fallback = DEFAULTS[id];
      if (id === "hp_counter_position" || id === "hp_pulse_text_position")
        return this.formatPositionValue(value);
      if (typeof fallback === "boolean")
        return this.coerceBooleanValue(value, fallback);
      if (typeof fallback === "number")
        return this.coerceNumberValue(value, fallback);
      if (typeof fallback === "string")
        return this.coerceStringValue(value, fallback);
      return value;
    },
  };


  function coerceCfgValue(id, value) {
    return HPValueCodecs.coerceCfgValue(id, value);
  }

  function loadCfgDefaults() {
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        cfg[k] = DEFAULTS[k];
      }
    }
    enforceOptimizedRuntimeProfile();
  }

  function enforceOptimizedRuntimeProfile() {
    if (!RUNTIME_OPTIMIZED_PROFILE) return false;
    var changed = false;
    for (var k in OPTIMIZED_FORCED_VALUES) {
      if (!Object.prototype.hasOwnProperty.call(OPTIMIZED_FORCED_VALUES, k))
        continue;
      if (cfg[k] !== OPTIMIZED_FORCED_VALUES[k]) {
        cfg[k] = OPTIMIZED_FORCED_VALUES[k];
        changed = true;
      }
    }
    return changed;
  }

  loadCfgDefaults();
  refreshDerivedConfig();
  var BOOTSTRAP_NAMESPACE = "hp_colors";
  var BOOTSTRAP_MAX_ATTEMPTS = 8;
  var BOOTSTRAP_RETRY_SEC = 0.5;
  var BOOTSTRAP_SLOW_RETRY_SEC = 3.0;
  var BOOTSTRAP_REQUEST_THROTTLE_MS = 400;
  var DIRECT_BOOTSTRAP_RESYNC_MS = 6000;
  var DIRECT_BOOTSTRAP_SHARED_RESYNC_MS = 15000;
  var BOOTSTRAP_FIRST_PAINT_WAIT_MS = 1800;
  var BOOTSTRAP_FIRST_PAINT_RETRY_SEC = 0.05;
  var STYLE_REAPPLY_WATCHDOG_MS = 5000;
  var STYLE_DRIFT_CHECK_MS = 350;
  var STYLE_DRIFT_CHECK_MID_MS = 700;
  var STYLE_DRIFT_CHECK_SLOW_MS = 950;
  var SHARED_CFG_RAW_KEY = "__hpColorsCfgRaw";
  var SHARED_DURABLE_CFG_RAW_KEY = "__hpColorsDurableCfgRaw";
  var SHARED_BOOTSTRAP_SEEN_KEY = "__hpColorsBootstrapSeen";
  var SHARED_FIRST_PAINT_PROBE_KEY = "__hpColorsFirstPaintProbe";
  var SHARED_PRESET_REQUEST_KEY = "__hpColorsPresetRequests";
  var SHARED_MATCH_RESET_KEY = "__hpColorsMatchReset";
  var SHARED_MATCH_RESET_ACK_KEY = "__hpColorsMatchResetAck";
  var MATCH_RESET_CHECK_MS = 250;
  var MATCH_RESET_STALE_TOKEN_MS = 2000;
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var PRESET_SNAPSHOT_MAGIC = "HP_COLORS_PRESET_SNAPSHOT";
  var PRESET_REQUEST_MAGIC = "HP_COLORS_PRESET_REQUEST";

  var HPBridgeProtocol = {
    eventChannel: EVENT_CHANNEL,
    presetSnapshotMagic: PRESET_SNAPSHOT_MAGIC,
    presetRequestMagic: PRESET_REQUEST_MAGIC,
    bulkUpdateMagic: "ANITA_BULK_UPDATE",
    singleUpdateMagic: "ANITA_UPDATE",
    bootstrapRequestMagic: "ANITA_REQUEST_BOOTSTRAP",
    sharedCfgRawKey: SHARED_CFG_RAW_KEY,
    sharedDurableCfgRawKey: SHARED_DURABLE_CFG_RAW_KEY,
    sharedBootstrapSeenKey: SHARED_BOOTSTRAP_SEEN_KEY,
    sharedFirstPaintProbeKey: SHARED_FIRST_PAINT_PROBE_KEY,
    sharedPresetRequestKey: SHARED_PRESET_REQUEST_KEY,
    sharedMatchResetKey: SHARED_MATCH_RESET_KEY,
    sharedMatchResetAckKey: SHARED_MATCH_RESET_ACK_KEY,
    getSharedStore: function () {
      try {
        if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig)
          return GameUI.CustomUIConfig();
      } catch (e) {}
      return null;
    },
    parsePayload: function (payload) {
      try {
        return typeof payload === "string" ? JSON.parse(payload) : payload;
      } catch (e) {}
      return null;
    },
    shouldInspectPayload: function (payload) {
      if (typeof payload !== "string") return true;
      if (
        payload.indexOf("ANITA") === -1 &&
        payload.indexOf(this.presetSnapshotMagic) === -1
      )
        return false;
      return payload.indexOf(TITLE) !== -1;
    },
    acceptsTitle: function (payload) {
      return !!(payload && payload.mod_title === TITLE);
    },
    isBulkUpdate: function (payload) {
      return !!(payload && payload.magic_word === this.bulkUpdateMagic);
    },
    isSingleUpdate: function (payload) {
      return !!(payload && payload.magic_word === this.singleUpdateMagic);
    },
    isPresetSnapshot: function (payload) {
      return !!(payload && payload.magic_word === this.presetSnapshotMagic);
    },
    isBootstrapReplaySource: function (source) {
      return (
        source === "bridge_bootstrap" ||
        source === "ui_resync" ||
        source === "ui_reset" ||
        source === "ui_code_apply" ||
        source === "baked_preset_apply" ||
        source === "core_auto_resync" ||
        source === "ui_refresh_after_apply"
      );
    },
    dispatchPayload: function (payload) {
      try {
        $.DispatchEvent(this.eventChannel, JSON.stringify(payload));
        return true;
      } catch (e) {}
      return false;
    },
    dispatchRawPayload: function (rawPayload) {
      if (!rawPayload) return false;
      try {
        $.DispatchEvent(this.eventChannel, rawPayload);
        return true;
      } catch (e) {}
      return false;
    },
    dispatchBootstrapRequest: function (reason) {
      return this.dispatchPayload({
        magic_word: this.bootstrapRequestMagic,
        mod_title: TITLE,
        storageNamespace: BOOTSTRAP_NAMESPACE,
        reason: String(reason || "overlay_request"),
      });
    },
    dispatchPresetRequest: function (reason) {
      return this.dispatchPayload({
        magic_word: this.presetRequestMagic,
        mod_title: TITLE,
        reason: String(reason || "overlay_request"),
      });
    },
    getPresetRequestState: function (store) {
      if (!store) return null;
      try {
        if (!store[this.sharedPresetRequestKey])
          store[this.sharedPresetRequestKey] = { last: 0 };
        return store[this.sharedPresetRequestKey];
      } catch (e) {}
      return null;
    },
    readSharedConfigRaw: function (source) {
      var store = this.getSharedStore();
      if (!store) return "";
      var key =
        source === "durable_shared"
          ? this.sharedDurableCfgRawKey
          : this.sharedCfgRawKey;
      try {
        return String(store[key] || "");
      } catch (e) {}
      return "";
    },
    writeSharedConfigRaw: function (raw) {
      var store = this.getSharedStore();
      if (!store) return false;
      try {
        store[this.sharedCfgRawKey] = raw;
        return true;
      } catch (e) {}
      return false;
    },
    markBootstrapSeen: function () {
      var store = this.getSharedStore();
      if (!store) return false;
      try {
        store[this.sharedBootstrapSeenKey] = "1";
        return true;
      } catch (e) {}
      return false;
    },
    hasBootstrapEvidence: function (store) {
      if (!store) return false;
      try {
        return !!(
          store[this.sharedBootstrapSeenKey] ||
          store[this.sharedDurableCfgRawKey] ||
          store[this.sharedCfgRawKey]
        );
      } catch (e) {}
      return false;
    },
    getFirstPaintProbeState: function (store) {
      if (!store) return null;
      try {
        if (!store[this.sharedFirstPaintProbeKey])
          store[this.sharedFirstPaintProbeKey] = { nextAt: 0, waitCount: 0 };
        return store[this.sharedFirstPaintProbeKey];
      } catch (e) {}
      return null;
    },
    readMatchResetInfo: function (store) {
      if (!store) return null;
      try {
        var value = store[this.sharedMatchResetKey];
        if (!value) return null;
        return typeof value === "object"
          ? value
          : { token: String(value), reason: "legacy" };
      } catch (e) {}
      return null;
    },
    readMatchResetAck: function (store) {
      if (!store) return null;
      try {
        return store[this.sharedMatchResetAckKey] || {};
      } catch (e) {}
      return null;
    },
    writeMatchResetAck: function (store, token) {
      if (!store) return false;
      try {
        store[this.sharedMatchResetAckKey] = {
          token: token,
          at: Date.now ? Date.now() : +new Date(),
        };
        return true;
      } catch (e) {}
      return false;
    },
    getPresetSnapshotValues: function (payload) {
      var values =
        payload && payload.values && typeof payload.values === "object"
          ? payload.values
          : null;
      if (!values) return null;
      var raw = typeof payload.values_raw === "string" ? payload.values_raw : "";
      if (!raw) {
        try {
          raw = JSON.stringify(values);
        } catch (eRaw) {
          raw = "";
        }
      }
      return { values: values, raw: raw };
    },
  };
  var bootstrapApplied = false;
  var directBootstrapApplied = false;
  var bootstrapAttempts = 0;
  var bootstrapFinished = false;
  var bootstrapRetryQueued = false;
  var nextFirstPaintBootstrapProbeAt = 0;
  var firstPaintBootstrapWaitCount = 0;
  var settingsDirty = true;
  var settingsRefreshHoldUntil = 0;
  var SETTINGS_REFRESH_DEBOUNCE_MS = 80;
  var allySettingsDirty = true;
  var allySettingsRefreshHoldUntil = 0;

  function affectsAllyOutputSetting(id) {
    return (
      id === "hp_low_threshold" ||
      id === "hp_high_threshold" ||
      id === "hp_mode" ||
      id === "hp_friend_color_low" ||
      id === "hp_friend_color_mid" ||
      id === "hp_friend_color_high" ||
      id === "hp_friend_pulse_enabled" ||
      id === "hp_friend_pulse_threshold" ||
      id === "hp_friend_pulse_bpm" ||
      id === "hp_friend_pulse_intensity" ||
      id === "hp_friend_pulse_color_enabled" ||
      id === "hp_friend_pulse_color"
    );
  }

  function affectsEnemyPulseColorSetting(id) {
    return (
      id === "hp_pulse_color_enabled" ||
      id === "hp_pulse_color" ||
      id === "hp_pulse_color_mode"
    );
  }

  function loopEnabled(kind) {
    if (kind === LOOP_ENEMY) return !!cfg.hp_enabled;
    if (kind === LOOP_ALLY) return !!cfg.hp_friend_enabled;
    return !!cfg.hp_level_number_visible;
  }

  function requestLoopKick(kind, delay) {
    if (!loopEnabled(kind)) return;
    if (loopWakeQueued[kind]) return;
    loopWakeQueued[kind] = true;
    if (!scheduleLoop(kind, delay === undefined ? 0.01 : delay)) {
      loopWakeQueued[kind] = false;
    }
  }

  function scheduleLoop(kind, delay) {
    if (!loopEnabled(kind)) return false;
    var safeDelay = Number(delay);
    if (!isFinite(safeDelay) || safeDelay < 0) safeDelay = 0.05;
    var now = _ts();
    var dueAt = now + safeDelay * 1000;
    if (loopNextDueAt[kind] && loopNextDueAt[kind] <= dueAt) return false;
    loopNextDueAt[kind] = dueAt;
    var token = ++loopScheduleToken[kind];
    $.Schedule(safeDelay, function () {
      if (token !== loopScheduleToken[kind]) return;
      loopNextDueAt[kind] = 0;
      loopWakeQueued[kind] = false;
      if (!loopEnabled(kind)) return;
      if (kind === LOOP_ENEMY) gL();
      else if (kind === LOOP_ALLY) aL();
      else lL();
    });
    return true;
  }

  function markEnemyColorDirty() {
    settingsDirty = true;
    settingsRefreshHoldUntil = 0;
    lColRaw = null;
    lUltRaw = null;
    lW = -1;
    lHp = -1;
    requestLoopKick(LOOP_ENEMY);
  }

  function markAllyOutputDirty(replaySource) {
    if (!cfg.hp_friend_enabled) {
      allySettingsDirty = false;
      allySettingsRefreshHoldUntil = 0;
      return;
    }
    allySettingsDirty = true;
    allySettingsRefreshHoldUntil = replaySource ? _ts() + 240 : 0;
    resetAllyState(allyOwnedPanel, false);
    requestLoopKick(LOOP_ALLY);
  }

  function forceReplayCurrentVisualState() {
    try {
      resetStyleStateForNewPanels();
    } catch (eReset) {}
    try {
      HealthbarPainter.invalidateEnemyVisualCaches();
    } catch (eEnemy) {}
    try {
      resetAllyState(allyOwnedPanel, false);
    } catch (eAlly) {}
    requestCurrentRedBarRefresh();
    settingsDirty = true;
    settingsRefreshHoldUntil = 0;
    allySettingsDirty = true;
    allySettingsRefreshHoldUntil = 0;
    lLvVis = null;
    lW = -1;
    lPW = -1;
    lHp = -1;
    colorGeneration = -1;
    handleRuntimeToggleState();
    requestLoopKick(LOOP_ENEMY);
    requestLoopKick(LOOP_ALLY);
    requestLoopKick(LOOP_LEVEL);
  }
  var lastBootstrapRequestAt = 0;
  var lastDirectBootstrapAt = 0;
  var directBootstrapResyncUntil = 0;
  var directBootstrapLocked = false;
  var lastStyleReapplyAt = 0;
  var nextStyleDriftCheckAt = 0;
  var styleDriftCleanFrames = 0;
  var rootBootstrapRequestShared = null;
  var sharedCfgRaw = "";
  var _uiMissAt = 0;
  var lastSeenMatchResetToken = "";
  var nextMatchResetCheckAt = 0;
  var UI_MISS_TTL_MS = 2000;

  function getRootPanel() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel || null;
  }


  function consumeMatchReset(now) {
    if (nextMatchResetCheckAt && now < nextMatchResetCheckAt) return false;
    nextMatchResetCheckAt = now + MATCH_RESET_CHECK_MS;
    var store = HPBridgeProtocol.getSharedStore();
    if (!store) return false;
    var info = HPBridgeProtocol.readMatchResetInfo(store);
    if (!info) return false;
    var token = String((info && info.token) || "");
    if (!token || token === lastSeenMatchResetToken) return false;
    var ack = HPBridgeProtocol.readMatchResetAck(store);
    if (ack && String(ack.token || "") === token) {
      var tokenAt = Number(info && info.at);
      if (isFinite(tokenAt) && tokenAt > 0) {
        if (panelBornAt && panelBornAt > tokenAt + 500) {
          lastSeenMatchResetToken = token;
          return false;
        }
        if (now - tokenAt > MATCH_RESET_STALE_TOKEN_MS) {
          lastSeenMatchResetToken = token;
          return false;
        }
      }
    }
    lastSeenMatchResetToken = token;
    resetRuntimeCachesForMatch(token, info.reason);
    HPBridgeProtocol.writeMatchResetAck(store, token);
    return true;
  }

  function resetRuntimeCachesForMatch(token, reason) {
    HealthbarContext.clearPanels();
    HealthbarContext.resetProbeState();
    nextRbProbeAt = 0;
    nextCurrentRbProbeAt = 0;
    nextCurrentRbChildProbeAt = 0;
    currentRbRefreshUntil = 0;
    HealthbarContext.resetEnemyScanCache();
    _allyScanPanel = null;
    _allyScanAt = 0;
    _allyScanFlags = 0;
    HealthbarPainter.invalidateEnemyVisualCaches();
    clearPulse();
    syncAllyPulse(allyOwnedPanel, false);
    allyOwnedPanel = null;
    allyColorActive = false;
    lW = -1;
    lPW = -1;
    lHp = -1;
    pPct = -1;
    sFC = 0;
    lWA = -1;
    lPWA = -1;
    sfcA = 0;
    aIdleMiss = 0;
    colorGeneration = -1;
    panelGeneration++;
    lastEnemySignature = "";
    lastUnitName = "";
    lTx = null;
    cMax = 0;
    lCounterLowMode = false;
    lTB = null;
    ll = null;
    lc = null;
    wr = null;
    lLv = -1;
    lLvVis = null;
    lLNoChange = 0;
    bootstrapApplied = false;
    directBootstrapApplied = false;
    bootstrapFinished = false;
    bootstrapRetryQueued = false;
    bootstrapAttempts = 0;
    nextFirstPaintBootstrapProbeAt = 0;
    firstPaintBootstrapWaitCount = 0;
    lastBootstrapRequestAt = 0;
    lastDirectBootstrapAt = 0;
    directBootstrapLocked = false;
    directBootstrapResyncUntil = 0;
    sharedCfgRaw = "";
    settingsDirty = true;
    settingsRefreshHoldUntil = 0;
    allySettingsDirty = true;
    allySettingsRefreshHoldUntil = 0;
    HealthbarPainter.resetStyleDriftBackoff();
    requestCurrentRedBarRefresh();
    requestPresetSnapshot("match_reset");
  }


  function writeSharedSnapshot() {
    var out = {};
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) out[k] = cfg[k];
    }
    try {
      var raw = JSON.stringify(out);
      if (raw === sharedCfgRaw) return;
      sharedCfgRaw = raw;
      HPBridgeProtocol.writeSharedConfigRaw(raw);
    } catch (e) {}
  }

  function applyDirectSnapshot(values, source) {
    if (!values) return false;
    var count = 0;
    for (var k in values) {
      if (!Object.prototype.hasOwnProperty.call(values, k)) continue;
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      cfg[k] = coerceCfgValue(k, values[k]);
      count += 1;
    }
    if (!count) {
      return false;
    }
    enforceOptimizedRuntimeProfile();
    try {
      resetStyleStateForNewPanels();
    } catch (eReset) {}
    try {
      HealthbarPainter.invalidateEnemyVisualCaches();
    } catch (eEnemy) {}
    requestCurrentRedBarRefresh();
    settingsDirty = true;
    allySettingsDirty = true;
    allySettingsRefreshHoldUntil = 0;
    handleRuntimeToggleState();
    requestLoopKick(LOOP_ENEMY);
    requestLoopKick(LOOP_ALLY);
    requestLoopKick(LOOP_LEVEL);
    var now = _ts();
    directBootstrapApplied = true;
    if (source === "durable_shared") {
      markBootstrapApplied(now, true, true);
    } else {
      directBootstrapResyncUntil =
        now +
        (source === "shared"
          ? DIRECT_BOOTSTRAP_SHARED_RESYNC_MS
          : DIRECT_BOOTSTRAP_RESYNC_MS);
      if (source !== "shared") writeSharedSnapshot();
      markBootstrapApplied(now, false, true);
    }
    return true;
  }

  function markBootstrapApplied(now, lockDirect, writeSeen) {
    bootstrapApplied = true;
    bootstrapFinished = true;
    try {
      var root = getRootPanel();
      if (root) root.__hpColorsBootstrapAppliedAt = now || _ts();
    } catch (eBoot) {}
    if (lockDirect) {
      directBootstrapLocked = true;
      directBootstrapResyncUntil = 0;
    }
    if (writeSeen) HPBridgeProtocol.markBootstrapSeen();
  }

  function tryApplySharedBootstrap(source) {
    var raw = HPBridgeProtocol.readSharedConfigRaw(source);
    if (!raw || (source === "shared" && raw === sharedCfgRaw)) return false;
    var parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (eParse) {
      return false;
    }
    var values =
      source === "shared" && parsed && typeof parsed === "object"
        ? parsed.values || parsed
        : parsed;
    if (!values || typeof values !== "object") return false;
    if (!applyDirectSnapshot(values, source)) return false;
    if (source === "shared") sharedCfgRaw = raw;
    return true;
  }

  function tryApplyDirectBootstrap() {
    return (
      !directBootstrapLocked &&
      (tryApplySharedBootstrap("durable_shared") ||
        tryApplySharedBootstrap("shared"))
    );
  }


  function requestBootstrap(reason) {
    var now = _ts();
    requestPresetSnapshot(reason || "overlay_request");
    if (
      lastBootstrapRequestAt &&
      now - lastBootstrapRequestAt < BOOTSTRAP_REQUEST_THROTTLE_MS
    )
      return;
    if (!rootBootstrapRequestShared) {
      try {
        var root = getRootPanel();
        if (root) {
          if (!root.__hpColorsBootstrapRequests)
            root.__hpColorsBootstrapRequests = { last: 0, attempts: 0 };
          rootBootstrapRequestShared = root.__hpColorsBootstrapRequests;
        }
      } catch (eRootReq) {}
    }
    if (rootBootstrapRequestShared) {
      var sharedDelay =
        rootBootstrapRequestShared.attempts < BOOTSTRAP_MAX_ATTEMPTS
          ? BOOTSTRAP_REQUEST_THROTTLE_MS
          : 3000;
      if (
        rootBootstrapRequestShared.last &&
        now - rootBootstrapRequestShared.last < sharedDelay
      )
        return;
      rootBootstrapRequestShared.last = now;
      rootBootstrapRequestShared.attempts =
        (rootBootstrapRequestShared.attempts || 0) + 1;
    }
    lastBootstrapRequestAt = now;

    HPBridgeProtocol.dispatchBootstrapRequest(reason);
  }

  function scheduleBootstrapRetry() {
    if (bootstrapApplied || bootstrapFinished) return;
    if (tryApplyDirectBootstrap()) return;
    if (bootstrapAttempts >= BOOTSTRAP_MAX_ATTEMPTS) {
      requestBootstrap("overlay_slow_retry");
      $.Schedule(BOOTSTRAP_SLOW_RETRY_SEC, scheduleBootstrapRetry);
      return;
    }

    bootstrapAttempts += 1;
    requestBootstrap(
      bootstrapAttempts === 1 ? "overlay_startup" : "overlay_retry",
    );
    $.Schedule(BOOTSTRAP_RETRY_SEC, scheduleBootstrapRetry);
  }

  function ensureBootstrapRetry(reason) {
    if (bootstrapApplied || bootstrapFinished || bootstrapRetryQueued) return;
    bootstrapRetryQueued = true;
    try {
      $.Schedule(0.01, function () {
        bootstrapRetryQueued = false;
        if (bootstrapApplied || bootstrapFinished) return;
        if (tryApplyDirectBootstrap()) return;
        requestBootstrap(reason || "overlay_retry");
        $.Schedule(BOOTSTRAP_RETRY_SEC, scheduleBootstrapRetry);
      });
    } catch (e) {
      bootstrapRetryQueued = false;
      if (bootstrapApplied || bootstrapFinished) return;
      if (tryApplyDirectBootstrap()) return;
      requestBootstrap(reason || "overlay_retry");
      try {
        $.Schedule(BOOTSTRAP_RETRY_SEC, scheduleBootstrapRetry);
      } catch (eSchedule) {}
    }
  }

  function holdEnemySettingsRefresh(now, replaySource) {
    settingsDirty = true;
    settingsRefreshHoldUntil =
      now + (replaySource ? 240 : SETTINGS_REFRESH_DEBOUNCE_MS);
  }

  function syncPulseRuntimeState(settingId, isBulk) {
    if (isBulk) {
      if (!cfg.hp_pulse_enabled) clearPulse();
      if (pulse) {
        lPD = null;
        lPI = -1;
        syncEnemyPulse(true, _ts());
      }
      return;
    }
    if (settingId === "hp_pulse_enabled" && !cfg.hp_pulse_enabled) {
      clearPulse();
      return;
    }
    if (!pulse) return;
    if (
      settingId === "hp_pulse_bpm" ||
      settingId === "hp_pulse_intensity" ||
      settingId === "hp_pulse_text_enabled" ||
      settingId === "hp_pulse_text_scale"
    ) {
      lPD = null;
      lPI = -1;
      syncEnemyPulse(true, _ts());
    }
  }

  function handleRuntimeUpdate(d, now) {
    var isBulk = HPBridgeProtocol.isBulkUpdate(d);
    var isSingle = HPBridgeProtocol.isSingleUpdate(d);
    if (!isBulk && !isSingle) return;
    var replaySource = HPBridgeProtocol.isBootstrapReplaySource(String(d.update_source || ""));
    var forceReplay = replaySource || !!d.force_emit;
    var values = isBulk ? d.values || {} : null;
    var settingId = isSingle ? d.setting_id : "";
    var anyChanged = false;
    var anyNonFriendChanged = false;
    var anyFriendChanged = false;
    var anyEnemyPulseColorChanged = false;
    var anyOwnValue = false;

    if (isBulk) {
      for (var key in values) {
        if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
        anyOwnValue = true;
        if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
        if (
          key === "hp_counter_position" &&
          d.update_source === "hp_counter_autoposition"
        )
          continue;
        var nextBulkValue = coerceCfgValue(key, values[key]);
        if (cfg[key] === nextBulkValue) continue;
        cfg[key] = nextBulkValue;
        anyChanged = true;
        if (key.indexOf("hp_friend_") !== 0) anyNonFriendChanged = true;
        if (affectsAllyOutputSetting(key)) anyFriendChanged = true;
        if (affectsEnemyPulseColorSetting(key)) anyEnemyPulseColorChanged = true;
      }
    } else if (Object.prototype.hasOwnProperty.call(DEFAULTS, settingId)) {
      if (
        settingId === "hp_counter_position" &&
        d.update_source === "hp_counter_autoposition"
      )
        return;
      var nextSingleValue = coerceCfgValue(settingId, d.value);
      anyChanged = cfg[settingId] !== nextSingleValue;
      cfg[settingId] = nextSingleValue;
      if (anyChanged) {
        if (settingId.indexOf("hp_friend_") !== 0)
          anyNonFriendChanged = true;
        if (affectsAllyOutputSetting(settingId)) anyFriendChanged = true;
        if (affectsEnemyPulseColorSetting(settingId))
          anyEnemyPulseColorChanged = true;
      }
    }

    if (enforceOptimizedRuntimeProfile()) {
      anyChanged = true;
      anyNonFriendChanged = true;
      anyFriendChanged = true;
      anyEnemyPulseColorChanged = true;
    }

    if (!anyChanged) {
      if (forceReplay || (isBulk && anyOwnValue)) forceReplayCurrentVisualState();
      if (replaySource && !bootstrapApplied)
        markBootstrapApplied(now, false, false);
      return;
    }

    if (anyNonFriendChanged) holdEnemySettingsRefresh(now, replaySource);
    if (anyFriendChanged) markAllyOutputDirty(replaySource);
    if (anyEnemyPulseColorChanged) markEnemyColorDirty();
    writeSharedSnapshot();
    if (isBulk || settingId === "hp_level_number_visible") lLvVis = null;
    handleRuntimeToggleState(isSingle ? settingId : undefined);
    syncPulseRuntimeState(settingId, isBulk);
    if (replaySource) markBootstrapApplied(now, true, false);
  }

  function handleRuntimeEventPayload(d) {
    if (!HPBridgeProtocol.acceptsTitle(d)) return;
    if (HPBridgeProtocol.isPresetSnapshot(d)) {
      var snapshot = HPBridgeProtocol.getPresetSnapshotValues(d);
      if (!snapshot) return;
      if (snapshot.raw && snapshot.raw === sharedCfgRaw && bootstrapApplied) return;
      if (applyDirectSnapshot(snapshot.values, "shared") && snapshot.raw)
        sharedCfgRaw = snapshot.raw;
      return;
    }
    var now = _ts();
    handleRuntimeUpdate(d, now);
  }
  // Live updates from Anita UI, including boot-time bootstrap values.
  $.RegisterForUnhandledEvent(HPBridgeProtocol.eventChannel, function (payload) {
    if (!HPBridgeProtocol.shouldInspectPayload(payload)) return;
    handleRuntimeEventPayload(HPBridgeProtocol.parsePayload(payload));
  });

  // â”€â”€ Color helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function ipHex(a, b, t) {
    var ah = a.slice(1);
    if (ah.length === 3) ah = ah[0] + ah[0] + ah[1] + ah[1] + ah[2] + ah[2];
    var bh = b.slice(1);
    if (bh.length === 3) bh = bh[0] + bh[0] + bh[1] + bh[1] + bh[2] + bh[2];
    var ai = parseInt(ah, 16),
      bi = parseInt(bh, 16);
    var r =
      (((ai >> 16) & 255) + (((bi >> 16) & 255) - ((ai >> 16) & 255)) * t) | 0;
    var g =
      (((ai >> 8) & 255) + (((bi >> 8) & 255) - ((ai >> 8) & 255)) * t) | 0;
    var bv = ((ai & 255) + ((bi & 255) - (ai & 255)) * t) | 0;
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | bv).toString(16).slice(1);
  }

  function normalizeWashColor(color) {
    if (typeof color !== "string") return "";
    var trimmed = color.trim();
    if (!trimmed) return "";

    if (trimmed.charAt(0) === "#") {
      if (trimmed.length === 4) {
        return (
          "#" +
          trimmed.charAt(1) +
          trimmed.charAt(1) +
          trimmed.charAt(2) +
          trimmed.charAt(2) +
          trimmed.charAt(3) +
          trimmed.charAt(3)
        ).toLowerCase();
      }
      if (trimmed.length >= 7) return trimmed.slice(0, 7).toLowerCase();
      return trimmed;
    }

    var m = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) {
      var r = +m[1] | 0;
      var g = +m[2] | 0;
      var b = +m[3] | 0;
      if (r < 0) r = 0;
      else if (r > 255) r = 255;
      if (g < 0) g = 0;
      else if (g > 255) g = 255;
      if (b < 0) b = 0;
      else if (b > 255) b = 255;
      return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    }

    return trimmed;
  }

  function getHighColor() {
    if (!cfg.hp_team_colors) return cfg.hp_color_high;
    return tid === 2 ? TEAM2_HIGH : TEAM1_HIGH;
  }

  // Get text color based on HP and mode
  // mode 0 (By HP %): use bar colors (low/mid/high)
  // mode 1 (Custom): use custom text colors
  function getTextColor(hp, low, high) {
    if (cfg.hp_text_color_mode) {
      // Custom mode - use custom text colors
      if (hp <= low) return cfg.hp_text_color_low;
      if (hp <= high) return cfg.hp_text_color_mid;
      return cfg.hp_text_color_high;
    }
    // By HP % mode - use bar colors
    if (hp <= low) return cfg.hp_color_low;
    if (hp <= high) return cfg.hp_color_mid;
    return getHighColor();
  }

  // Get gradient text color (interpolated)
  // mode 0 (By HP %): use bar colors
  // mode 1 (Custom): use custom text colors
  function getGradientTextColor(hp, low, high) {
    var denomMid = dc.denomMid || Math.max(1, high - low);
    var denomHigh = dc.denomHigh || Math.max(1, 100 - high);
    if (cfg.hp_text_color_mode) {
      // Custom mode - use custom text colors
      if (hp <= low) return cfg.hp_text_color_low;
      if (hp <= high) {
        var t = (hp - low) / denomMid;
        return ipHex(cfg.hp_text_color_low, cfg.hp_text_color_mid, t);
      }
      var t2 = (hp - high) / denomHigh;
      return ipHex(cfg.hp_text_color_mid, cfg.hp_text_color_high, t2);
    }
    // By HP % mode - use bar colors (same interpolation as bar)
    if (hp <= low) return cfg.hp_color_low;
    if (hp <= high) {
      var t3 = (hp - low) / denomMid;
      return ipHex(cfg.hp_color_low, cfg.hp_color_mid, t3);
    }
    var t4 = (hp - high) / denomHigh;
    var highCol = getHighColor();
    return ipHex(cfg.hp_color_mid, highCol, t4);
  }

  // â”€â”€ Panel cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var ctx = $.GetContextPanel();
  var us = null,
    hc = null,
    hca = null,
    bg = null,
    pl = null,
    lb = null,
    lbp = null,
    rb = null,
    cp = null,
    ui = null,
    kz = null,
    ihc = null,
    uhc = null,
    nm = null;
  var cached = 0,
    att = 0;
  var nextCacheProbeAt = 0;
  var nextRbProbeAt = 0;
  var nextCurrentRbProbeAt = 0;
  var nextCurrentRbChildProbeAt = 0;
  var currentRbRefreshUntil = 0;
  var lBgVis = null,
    lBgOp = null,
    lHpSize = null,
    lHpHeight = null,
    lHcaTransform = null,
    lIhcMarginTop = null,
    lUhcHeight = null,
    lPipHeight = null,
    lPipFontSize = null,
    lPipVis = null;

  var HealthbarContext = {
    panels: {
      unitStatus: null,
      counter: null,
      counterAnchor: null,
      background: null,
      pipLabel: null,
      baseRedBar: null,
      baseRedBarParent: null,
      redBar: null,
      redBarParent: null,
      ultIcon: null,
      killMarker: null,
      infoHealthContainer: null,
      healthbarContainer: null,
      name: null,
    },
    snapshot: {
      teamId: 0,
      flags: 0,
      isEnemy: false,
      isFriendly: false,
      isNeutral: false,
      isBuilding: false,
      isFriendlyBuilding: false,
      isEnemyBuilding: false,
      barWidth: 0,
      parentWidth: 0,
      replacedRedBar: false,
    },
    sync: function () {
      var panels = this.panels;
      panels.unitStatus = us;
      panels.counter = hc;
      panels.counterAnchor = hca;
      panels.background = bg;
      panels.pipLabel = pl;
      panels.baseRedBar = lb;
      panels.baseRedBarParent = lbp;
      panels.redBar = rb;
      panels.redBarParent = cp;
      panels.ultIcon = ui;
      panels.killMarker = kz;
      panels.infoHealthContainer = ihc;
      panels.healthbarContainer = uhc;
      panels.name = nm;

      var snapshot = this.snapshot;
      snapshot.teamId = tid;
      snapshot.flags = fl;
      snapshot.isFriendly = this.isFriendlyTarget(fl);
      snapshot.isNeutral = !!(fl & 2);
      snapshot.isBuilding = !!(fl & 4);
      snapshot.isFriendlyBuilding = this.isFriendlyBuilding(fl, tid);
      snapshot.isEnemyBuilding = this.isEnemyBuilding(fl, tid);
      snapshot.isEnemy = this.isEnemyTarget(fl, tid);
      snapshot.barWidth =
        rb && rb.actuallayoutwidth !== undefined ? rb.actuallayoutwidth | 0 : 0;
      snapshot.parentWidth =
        cp && cp.actuallayoutwidth !== undefined ? cp.actuallayoutwidth | 0 : 0;
      snapshot.replacedRedBar = rb !== null && rb !== lb;
      return this;
    },
    clearPanels: function () {
      us =
        hc =
        hca =
        bg =
        pl =
        lb =
        lbp =
        rb =
        cp =
        ui =
        kz =
        ihc =
        uhc =
        nm =
          null;
      return this.sync();
    },
    resetProbeState: function () {
      cached = 0;
      att = 0;
      nextCacheProbeAt = 0;
    },
    resetPanelHistory: function () {
      lastRbPanel =
        lastCpPanel =
        lastLbpPanel =
        lastHcPanel =
        lastBgPanel =
        lastKzPanel =
        lastPlPanel =
          null;
      lastUnitName = "";
    },
    invalidateIfInvalid: function () {
      if (!cached && !rb) return false;
      if (
        !isInvalidPanel(us) &&
        !isInvalidPanel(hc) &&
        !isInvalidPanel(bg) &&
        !isInvalidPanel(pl) &&
        !isInvalidPanel(lb) &&
        !isInvalidPanel(lbp) &&
        !isInvalidPanel(rb) &&
        !isInvalidPanel(cp) &&
        !isInvalidPanel(nm)
      )
        return false;
      this.clearPanels();
      this.resetProbeState();
      this.resetPanelHistory();
      HealthbarPainter.invalidateEnemyVisualCaches();
      settingsDirty = true;
      allySettingsDirty = true;
      requestCurrentRedBarRefresh();
      return true;
    },
    refreshEnemy: function (now) {
      var reboundCurrentRb = false;
      this.invalidateIfInvalid();
      if (!vPanel(rb)) {
        if (!nextRbProbeAt || now >= nextRbProbeAt) {
          rb = fRB();
          nextRbProbeAt = rb ? 0 : now + 150;
        }
        if (!rb) {
          this.sync();
          return false;
        }
      } else {
        reboundCurrentRb = this.refreshCurrentRedBar(now, false);
      }
      if (!cached && !tryCache()) {
        this.sync();
        return false;
      }
      if (rb.GetParent) {
        var parent = rb.GetParent();
        if (cp !== parent) cp = parent;
      }
      if (!reboundCurrentRb) this.refreshCurrentRedBar(now, false);
      resetStyleStateForNewPanels();
      this.scanEnemy(rb);
      this.sync();
      return true;
    },
    refreshCurrentRedBar: function (now, force) {
      var inRefreshWindow =
        currentRbRefreshUntil && now <= currentRbRefreshUntil;
      var rebound = false;
      if (!force) {
        if (!nextCurrentRbProbeAt || now >= nextCurrentRbProbeAt) {
          var traverseProbeMs = inRefreshWindow
            ? CURRENT_RB_RESCAN_MS
            : noParentWidthFrames >= 12
              ? CURRENT_RB_IDLE_RESCAN_SLOW_MS
              : noParentWidthFrames >= 4
                ? CURRENT_RB_IDLE_RESCAN_MID_MS
                : stableCurrentRedBarFrames >= 8
                  ? CURRENT_RB_IDLE_RESCAN_SLOW_MS
                  : stableCurrentRedBarFrames >= 3
                    ? CURRENT_RB_IDLE_RESCAN_MID_MS
                    : CURRENT_RB_IDLE_RESCAN_MS;
          nextCurrentRbProbeAt = now + traverseProbeMs;
          var siblingCount = 0;
          if (vPanel(rb) && cp && cp.Children) {
            try {
              var probeChildren = cp.Children();
              for (var pi = 0; pi < probeChildren.length; pi++) {
                var probeChild = probeChildren[pi];
                if (!vPanel(probeChild)) continue;
                var probeId = "";
                try {
                  probeId = String(probeChild.id || "");
                } catch (eProbeId) {
                  probeId = "";
                }
                if (probeId === ID_RED_BAR && ++siblingCount > 1) break;
              }
            } catch (eProbeChildren) {}
          }
          if (!vPanel(rb) || siblingCount <= 1) {
            var current = fRB();
            if (vPanel(current) && current !== rb)
              rebound = this.adoptRedBar(current);
          }
        }
      } else {
        var forced = fRB();
        if (vPanel(forced) && forced !== rb) rebound = this.adoptRedBar(forced);
      }
      if (rebound) return true;
      if (!force) {
        if (nextCurrentRbChildProbeAt && now < nextCurrentRbChildProbeAt)
          return false;
        var childProbeMs = inRefreshWindow
          ? CURRENT_RB_RESCAN_MS
          : noParentWidthFrames >= 12
            ? CURRENT_RB_IDLE_RESCAN_SLOW_MS
            : noParentWidthFrames >= 4
              ? CURRENT_RB_IDLE_RESCAN_MID_MS
              : stableCurrentRedBarFrames >= 10
                ? 1.4 * 1000
                : stableCurrentRedBarFrames >= 4
                  ? 1.3 * 1000
                  : CURRENT_RB_IDLE_RESCAN_MS;
        nextCurrentRbChildProbeAt = now + childProbeMs;
      }
      if (!cp || !cp.Children) return false;
      var children = [];
      try {
        children = cp.Children();
      } catch (eChildren) {
        return false;
      }
      var best = rb;
      var bestScore = this.scoreRedBarCandidate(rb, -1);
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (!vPanel(child)) continue;
        var id = "";
        try {
          id = String(child.id || "");
        } catch (eId) {
          id = "";
        }
        if (id !== ID_RED_BAR) continue;
        var score = this.scoreRedBarCandidate(child, i);
        if (seenRedBarPanels) {
          try {
            seenRedBarPanels.set(child, 1);
          } catch (eMark) {}
        }
        if (score > bestScore) {
          best = child;
          bestScore = score;
        }
      }
      if (!best || best === rb) return false;
      return this.adoptRedBar(best);
    },
    scoreRedBarCandidate: function (panel, index) {
      if (!vPanel(panel)) return -1;
      var score = panel === rb ? 100 : 0;
      try {
        if (
          seenRedBarPanels
            ? !seenRedBarPanels.has(panel)
            : panel !== rb && panel !== lastRbPanel
        )
          score += 1000;
      } catch (eSeen) {}
      var packed = 0;
      try {
        packed = scanPanelPacked(panel, false);
      } catch (eScan) {
        packed = 0;
      }
      var flags = packed & SCAN_FLAG_MASK;
      if (flags & 1) score += 90;
      if (flags & 8) score -= 1200;
      if (flags & 2) score -= 1000;
      if (flags & 4 && cfg.hp_skip_buildings) score -= 400;
      try {
        if ((panel.actuallayoutwidth | 0) > 0) score += 20;
      } catch (eWidth) {}
      try {
        var parent = panel.GetParent ? panel.GetParent() : null;
        if (parent && (parent.actuallayoutwidth | 0) > 0) score += 10;
      } catch (eParentWidth) {}
      if (index >= 0) score += Math.min(index, 20);
      return score;
    },
    resetEnemyScanCache: function () {
      tid = 0;
      fl = 0;
      _lastScanAt = 0;
      _lastScanPanel = null;
    },
    adoptRedBar: function (panel) {
      rb = panel;
      lb = panel;
      cp = panel && panel.GetParent ? panel.GetParent() : null;
      lbp = cp;
      this.resetProbeState();
      this.resetEnemyScanCache();
      resetStyleStateForNewPanels();
      lW = -1;
      lPW = -1;
      lHp = -1;
      stableCurrentRedBarFrames = 0;
      colorGeneration = -1;
      HealthbarPainter.resetStyleDriftBackoff();
      this.sync();
      return true;
    },
    scanEnemy: function (panel) {
      var now = _ts();
      if (panel === _lastScanPanel && now - _lastScanAt < SCAN_CACHE_TTL)
        return false;
      var packed = scanPanelPacked(panel, false);
      tid = (packed >> SCAN_TEAM_SHIFT) & 3;
      fl = packed & SCAN_FLAG_MASK;
      if (tid && fl & 8) knownFriendlyTeamId = tid;
      _lastScanAt = now;
      _lastScanPanel = panel;
      return true;
    },
    isFriendlyTarget: function (flags) {
      return !!(flags & 8);
    },
    isFriendlyBuilding: function (flags, teamId) {
      var team = teamId || tid;
      return !!(
        flags & 4 &&
        (flags & 8 || (team && team === knownFriendlyTeamId))
      );
    },
    isEnemyBuilding: function (flags, teamId) {
      var team = teamId || tid;
      return !!(
        flags & 4 &&
        !(flags & 2) &&
        team &&
        !this.isFriendlyBuilding(flags, team)
      );
    },
    isEnemyTarget: function (flags, teamId) {
      if (flags & 2) return false;
      if (cfg.hp_friend_enabled && this.isFriendlyTarget(flags)) return false;
      if (flags & 1) return true;
      return this.isEnemyBuilding(flags, teamId);
    },
    getIgnoredTargetColor: function (snapshot) {
      var flags = snapshot ? snapshot.flags : fl;
      var teamId = snapshot ? snapshot.teamId : tid;
      if (flags & 1 && !(flags & 2)) return "";
      if (this.isEnemyBuilding(flags, teamId)) return CSS_TEAM_ENEMY_COLOR;
      if (this.isFriendlyBuilding(flags, teamId)) return WHITE_WASH;
      if (flags & (2 | 4)) return "#5BEFB5";
      if (flags & 8) return CSS_TEAM_FRIEND_COLOR;
      if (teamId === 2) return CSS_TEAM2_COLOR;
      if (teamId === 1) return CSS_TEAM1_COLOR;
      return CSS_TEAM_ENEMY_COLOR;
    },
  };


  function vPanel(p) {
    try {
      return !!(p && (!p.IsValid || p.IsValid()));
    } catch (e) {}
    return false;
  }

  function fRB() {
    return ctx.FindChildTraverse(ID_RED_BAR);
  }

  function tryCache() {
    if (cached) {
      var counterReady = !cfg.hp_counter_visible || vPanel(hc);
      if (
        vPanel(us) &&
        counterReady &&
        vPanel(bg) &&
        vPanel(pl) &&
        vPanel(lb) &&
        vPanel(lbp) &&
        vPanel(nm)
      )
        return 1;
      cached = 0;
      nextCacheProbeAt = 0;
    }
    var now = _ts();
    if (nextCacheProbeAt && now < nextCacheProbeAt) return 0;
    att++;
    if (!vPanel(us)) us = ctx.FindChildTraverse(ID_UNIT_STATUS);
    if (!us) {
      nextCacheProbeAt = now + (att < 8 ? 150 : att < 24 ? 500 : 1500);
      return 0;
    }
    if (!vPanel(hc) && (cfg.hp_counter_visible || lVis !== "collapse"))
      hc = us.FindChildTraverse(ID_COUNTER);
    if (cfg.hp_counter_visible && !vPanel(hca))
      hca = us.FindChildTraverse(ID_COUNTER_ANCHOR);
    if (!vPanel(bg)) bg = us.FindChildTraverse(ID_BAR_BG);
    if (!vPanel(pl)) pl = us.FindChildTraverse(ID_PIP_LABEL);
    if (!vPanel(lb)) lb = us.FindChildTraverse(ID_RED_BAR);
    if (cfg.hp_kill_zone_enabled && !vPanel(kz))
      kz = us.FindChildTraverse(ID_KILL_MARKER);
    if (!vPanel(ui)) ui = us.FindChildTraverse(ID_ULT_ICON);
    if (vPanel(ui)) _uiMissAt = 0;
    if (!vPanel(ihc)) ihc = us.FindChildTraverse(ID_INFO_HEALTH);
    if (!vPanel(uhc)) uhc = us.FindChildTraverse(ID_HEALTHBAR_CONTAINER);
    if (!vPanel(nm)) nm = ctx.FindChildTraverse(ID_NAME);
    if (lb && !vPanel(lbp)) lbp = lb.GetParent();
    if (pl && lb && lbp) {
      cached = 1;
      att = 0;
      nextCacheProbeAt = 0;
      return 1;
    }
    nextCacheProbeAt = now + (att < 8 ? 150 : att < 24 ? 500 : 1500);
    return 0;
  }

  function isInvalidPanel(panel) {
    try {
      return !!(panel && panel.IsValid && !panel.IsValid());
    } catch (e) {}
    return false;
  }


  var seenRedBarPanels = typeof WeakMap === "function" ? new WeakMap() : null;


  function requestCurrentRedBarRefresh() {
    currentRbRefreshUntil = _ts() + CURRENT_RB_REFRESH_WINDOW_MS;
    nextCurrentRbProbeAt = 0;
    nextCurrentRbChildProbeAt = 0;
  }



  function requestPresetSnapshot(reason) {
    var now = _ts();
    var state = HPBridgeProtocol.getPresetRequestState(
      HPBridgeProtocol.getSharedStore(),
    );
    if (state) {
      if (state.last && now - state.last < 120) return;
      state.last = now;
    }
    HPBridgeProtocol.dispatchPresetRequest(reason);
  }

  function shouldWaitForBootstrapBeforeFirstPaint(now, isEnemy) {
    if (
      !isEnemy ||
      bootstrapApplied ||
      directBootstrapApplied ||
      directBootstrapLocked
    )
      return false;
    if (!panelBornAt || now - panelBornAt > BOOTSTRAP_FIRST_PAINT_WAIT_MS)
      return false;
    if (cfg.hp_team_colors) return false;
    if (
      normalizeWashColor(cfg.hp_color_high) !==
      normalizeWashColor(DEFAULTS.hp_color_high)
    )
      return false;
    var store = HPBridgeProtocol.getSharedStore();
    var sharedProbe = HPBridgeProtocol.getFirstPaintProbeState(store);
    var hasEvidence = HPBridgeProtocol.hasBootstrapEvidence(store);
    var nextProbeAt = sharedProbe
      ? sharedProbe.nextAt || 0
      : nextFirstPaintBootstrapProbeAt;
    if (!hasEvidence && nextProbeAt && now < nextProbeAt) return false;
    if (!nextProbeAt || now >= nextProbeAt) {
      lastDirectBootstrapAt = now;
      if (tryApplyDirectBootstrap()) return false;
      if (!hasEvidence && !sharedProbe) return false;
      var waitCount = sharedProbe
        ? (sharedProbe.waitCount || 0) + 1
        : firstPaintBootstrapWaitCount + 1;
      var nextGap = waitCount < 4 ? 80 : waitCount < 10 ? 150 : 250;
      if (sharedProbe) {
        sharedProbe.waitCount = waitCount;
        sharedProbe.nextAt = now + nextGap;
      } else {
        firstPaintBootstrapWaitCount = waitCount;
        nextFirstPaintBootstrapProbeAt = now + nextGap;
      }
      if (waitCount === 1 || waitCount === 5) {
        requestPresetSnapshot("first_paint_wait");
        requestBootstrap("first_paint_wait");
      }
    }
    var targetAt = sharedProbe
      ? sharedProbe.nextAt || now + 80
      : nextFirstPaintBootstrapProbeAt;
    var delay = Math.max(
      BOOTSTRAP_FIRST_PAINT_RETRY_SEC,
      Math.min(0.12, (targetAt - now) / 1000),
    );
    scheduleLoop(LOOP_ENEMY, delay);
    return true;
  }



  function applyLayoutSettings() {
    var raw = clampNum(cfg.hp_info_health_margin_top, 0, 100, 23);
    var pct = -15 + raw * 0.65;
    if (Math.abs(pct) < 0.5) pct = 0;
    var rounded = Math.round(pct * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.01)
      rounded = Math.round(rounded);
    var nextMargin = rounded + "%";
    if ((!ihc || !ihc.IsValid()) && us && us.IsValid())
      ihc = us.FindChildTraverse(ID_INFO_HEALTH);
    if (ihc && ihc.style && lIhcMarginTop !== nextMargin) {
      try {
        ihc.style.marginTop = nextMargin;
        lIhcMarginTop = nextMargin;
      } catch (e) {
        lIhcMarginTop = null;
      }
    }

    if ((!uhc || !uhc.IsValid()) && us && us.IsValid())
      uhc = us.FindChildTraverse(ID_HEALTHBAR_CONTAINER);
    var heightPx =
      dc.healthbarHeight ||
      Math.round(clampNum(cfg.hp_healthbar_height, 0, 230, 130));
    var nextHeight = heightPx + "px";
    if (uhc && uhc.style && lUhcHeight !== nextHeight) {
      uhc.style.height = nextHeight;
      lUhcHeight = nextHeight;
    }
    if (pl && pl.style) {
      var nextPipHeight = "52%";
      var nextPipFontSize =
        Math.min(75, Math.round((heightPx * 75) / 230)) + "px";
      if (lPipHeight !== nextPipHeight) {
        pl.style.height = nextPipHeight;
        lPipHeight = nextPipHeight;
      }
      if (lPipFontSize !== nextPipFontSize) {
        pl.style.fontSize = nextPipFontSize;
        lPipFontSize = nextPipFontSize;
      }
    }
  }

  // â”€â”€ Team/flag scan (walk up to find team classes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var tid = 0,
    fl = 0;
  var knownFriendlyTeamId = 0;
  var _lastScanAt = 0,
    _lastScanPanel = null;
  var SCAN_CACHE_TTL = 500;
  var SCAN_TEAM_SHIFT = 4;
  var SCAN_FLAG_MASK = 15;


  function scanPanelPacked(panel, allyMode) {
    var teamId = 0,
      flags = 0,
      depth = 0,
      c = panel;
    while (c && depth < 10) {
      if (c.BHasClass) {
        if (!teamId) {
          if (c.BHasClass("team2")) teamId = 2;
          else if (c.BHasClass("team1")) teamId = 1;
        }
        if (allyMode) {
          if (!(flags & 1) && c.BHasClass("friend")) flags |= 1;
          if (!(flags & 2) && c.BHasClass("player")) flags |= 2;
          if (!(flags & 4) && c.BHasClass("enemy")) flags |= 4;
          if (teamId && (flags & 7) === 7) break;
        } else {
          if (!(flags & 1) && c.BHasClass("enemy")) flags |= 1;
          if (
            !(flags & 2) &&
            (c.BHasClass("team_neutral") || c.BHasClass("neutral"))
          )
            flags |= 2;
          if (
            !(flags & 4) &&
            (cfg.hp_skip_buildings || !(flags & 1)) &&
            (c.BHasClass("building") ||
              c.BHasClass("boss_tier1") ||
              c.BHasClass("boss_tier2") ||
              c.BHasClass("boss_barracks"))
          )
            flags |= 4;
          if (!(flags & 8) && c.BHasClass("friend")) flags |= 8;
          if (teamId && flags & (1 | 2 | 4 | 8)) break;
        }
      }
      if (!c.GetParent) break;
      c = c.GetParent();
      depth++;
    }
    return ((teamId & 3) << SCAN_TEAM_SHIFT) | (flags & SCAN_FLAG_MASK);
  }


  // â”€â”€ Setter helpers (skip redundant writes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lCol = null,
    lUlt = null,
    lTxt = null;
  var lColRaw = null,
    lUltRaw = null,
    lTxtRaw = null,
    lKzRaw = null;
  var lSH = -1,
    lSM = -1,
    lVis = null;
  var lTx = null,
    cMax = 0;
  var lCounterLowMode = false;
  var lastRbPanel = null,
    lastCpPanel = null,
    lastLbpPanel = null,
    lastHcPanel = null,
    lastBgPanel = null,
    lastKzPanel = null,
    lastPlPanel = null,
    lastUnitName = "";
  var panelBornAt = 0;
  var panelGeneration = 0,
    colorGeneration = -1;
  var lastEnemySignature = "";

  var HealthbarPainter = {
    setBarColor: function (color) {
      if (lColRaw === color && lCol !== null) return;
      lColRaw = color;
      var next = normalizeWashColor(color);
      if (!next) next = "";
      if (lCol !== next && rb) {
        try {
          rb.style.washColor = next;
          lCol = next;
        } catch (e) {
          lCol = null;
        }
      }
    },
    clearUltIconColor: function () {
      lUltRaw = null;
      if (!ui || !ui.IsValid || !ui.IsValid() || !ui.style) {
        lUlt = null;
        return;
      }
      if (lUlt !== "") {
        try {
          ui.style.washColor = "";
          lUlt = "";
        } catch (e) {
          lUlt = null;
        }
      }
    },
    setUltColor: function (color) {
      var nextRaw = cfg.hp_ult_color_enabled ? color : cfg.hp_ult_color_custom;
      if (lUltRaw === nextRaw && lUlt) return;
      lUltRaw = nextRaw;
      var next = normalizeWashColor(nextRaw) || CSS_TEAM_ENEMY_COLOR;
      if (!ui || !ui.IsValid()) {
        var now = _ts();
        if (_uiMissAt && now - _uiMissAt < UI_MISS_TTL_MS) return;
        ui = ctx.FindChildTraverse(ID_ULT_ICON);
        if (ui && ui.IsValid()) _uiMissAt = 0;
        else {
          _uiMissAt = now;
          return;
        }
      }
      if (!ui || !ui.style) return;
      if (lUlt !== next) {
        try {
          ui.style.washColor = next;
          lUlt = next;
        } catch (e) {
          lUlt = null;
        }
      }
    },
    setTextColor: function (color) {
      if (lTxtRaw === color && lTxt) return;
      lTxtRaw = color;
      var next = normalizeWashColor(color);
      if (!hc || !hc.style) return;
      if (lTxt !== next) {
        try {
          hc.style.washColor = next;
          lTxt = next;
        } catch (e) {
          lTxt = null;
        }
      }
    },
    setBarVisible: function (visible) {
      if (!bg || !bg.style) return;
      if (lBgVis !== "visible") {
        bg.style.visibility = "visible";
        lBgVis = "visible";
      }
      var nextOp = visible ? "1.0" : "0.01";
      if (lBgOp !== nextOp) {
        bg.style.opacity = nextOp;
        lBgOp = nextOp;
      }
    },
    invalidateEnemyVisualCaches: function () {
      lCol = lUlt = lTxt = null;
      lColRaw = lUltRaw = lTxtRaw = lKzRaw = null;
      lBgVis =
        lBgOp =
        lHpSize =
        lHpHeight =
        lHcaTransform =
        lIhcMarginTop =
        lUhcHeight =
        lPipHeight =
        lPipFontSize =
        lPipVis =
          null;
      lKzVis = lKzX = lKzW = lKzColor = lKzAppliedColor = lKzSig = null;
      lSH = -1;
      lSM = -1;
      lVis = null;
      noParentWidthFrames = 0;
      nonEnemyExitFrames = 0;
      buildingNotEnemyExitFrames = 0;
      stableCurrentRedBarFrames = 0;
      this.resetStyleDriftBackoff();
    },
    hasEnemyBarStyleDrift: function () {
      if (!rb || !rb.style || !lCol) return false;
      try {
        return normalizeWashColor(String(rb.style.washColor || "")) !== lCol;
      } catch (e) {}
      return false;
    },
    hasEnemyStyleDrift: function () {
      if (this.hasEnemyBarStyleDrift()) return true;
      if (cfg.hp_counter_visible && hc && hc.style) {
        try {
          if (lHpSize !== null && hc.style.fontSize !== lHpSize) return true;
        } catch (eFontDrift) {}
        try {
          if (lHpHeight !== null && hc.style.height !== lHpHeight) return true;
        } catch (eHeightDrift) {}
      }
      if (cfg.hp_counter_visible && hca && hca.style) {
        try {
          if (lHcaTransform !== null && hca.style.transform !== lHcaTransform)
            return true;
        } catch (eTransformDrift) {}
      }
      return false;
    },
    resetStyleDriftBackoff: function () {
      styleDriftCleanFrames = 0;
      nextStyleDriftCheckAt = 0;
    },
  };





  var _allyScanPanel = null,
    _allyScanAt = 0,
    _allyScanFlags = 0;
  var ALLY_SCAN_CACHE_TTL = 160;

  function resetAllyState(panel, resetColor) {
    allyColorActive = false;
    lColA = null;
    lWA = -1;
    lPWA = -1;
    sfcA = 0;
    noAllyParentWidthFrames = 0;
    _allyScanPanel = null;
    _allyScanAt = 0;
    _allyScanFlags = 0;
    syncAllyPulse(panel, false);
    if (!resetColor || !panel || panel !== allyOwnedPanel) return;
    var flags = panel && panel.IsValid && panel.IsValid() ? scanAllyPanel(panel) : 0;
    if (!flags || !isConfirmedAllyHealthbar(flags) || !panel.style) return;
    try {
      panel.style.washColor = CSS_TEAM_FRIEND_COLOR;
      lColA = normalizeWashColor(CSS_TEAM_FRIEND_COLOR);
    } catch (e) {
      lColA = null;
    }
  }

  function scanAllyPanel(panel) {
    var now = _ts();
    if (panel === _allyScanPanel && now - _allyScanAt < ALLY_SCAN_CACHE_TTL)
      return _allyScanFlags;
    _allyScanFlags = scanPanelPacked(panel, true) & SCAN_FLAG_MASK;
    _allyScanPanel = panel;
    _allyScanAt = now;
    return _allyScanFlags;
  }

  function isConfirmedAllyHealthbar(flags) {
    return !!(flags & 1 && !(flags & 4));
  }

  function clampNum(v, min, max, fallback) {
    var next = Number(v);
    if (!isFinite(next)) next = Number(fallback);
    if (!isFinite(next)) next = 0;
    if (isFinite(min) && next < min) next = min;
    if (isFinite(max) && next > max) next = max;
    return next;
  }

  function clampPercent(value) {
    return clampNum(value, 0, 100, 0) | 0;
  }

  function refreshDerivedConfig() {
    var low = clampPercent(cfg.hp_low_threshold);
    var high = clampPercent(cfg.hp_high_threshold);
    if (high < low) high = low;
    var kzWidth = cfg.hp_kill_zone_width | 0;
    if (kzWidth < 1) kzWidth = 1;
    if (kzWidth > 100) kzWidth = 100;
    var counterSize = clampNum(cfg.hp_counter_size, 72, 400, 145);

    dc.low = low;
    dc.high = high;
    dc.denomMid = Math.max(1, high - low);
    dc.denomHigh = Math.max(1, 100 - high);
    dc.pulseThreshold = clampPercent(cfg.hp_pulse_threshold);
    dc.friendPulseThreshold = clampPercent(cfg.hp_friend_pulse_threshold);
    dc.counterSize = counterSize;
    dc.pulseTextSize = clampNum(cfg.hp_pulse_text_scale, 72, 320, counterSize);
    dc.counterPosition = parseCounterPositionValue(
      cfg.hp_counter_position,
      true,
    );
    dc.pulseTextPosition = parseCounterPositionValue(
      cfg.hp_pulse_text_position,
      false,
    );
    dc.healthbarHeight = Math.round(clampNum(cfg.hp_healthbar_height, 0, 230, 130));
    dc.killZoneThreshold = clampPercent(cfg.hp_kill_zone_threshold);
    dc.killZoneWidth = kzWidth;
    dc.killZoneColorRaw = cfg.hp_kill_zone_color || "#FF2222";
    dc.killZoneColor = normalizeWashColor(dc.killZoneColorRaw);
  }

  // BG visibility with opacity fix - keeps panel visible for HP updates

  var lKzVis = null,
    lKzX = null,
    lKzW = null,
    lKzColor = null,
    lKzAppliedColor = null,
    lKzSig = null;


  function computeEnemyKillMarkerPlan(show, parentWidth, plan) {
    plan = plan || ENEMY_PAINT_PLAN;
    plan.killMarkerAction = 0;
    plan.killMarkerX = "";
    plan.killMarkerWidth = "";
    plan.killMarkerColor = "";
    plan.killMarkerSig = "";
    plan.killMarkerParentWidth = parentWidth;
    if (
      (!kz || !vPanel(kz)) &&
      show &&
      cfg.hp_kill_zone_enabled &&
      us &&
      us.FindChildTraverse
    ) {
      plan.killMarkerAction = 3;
      return plan;
    }
    if (!kz || !kz.style) return plan;
    var barHidden = !bg || !bg.style || lBgVis !== "visible" || lBgOp !== "1.0";
    if (!show || !cfg.hp_kill_zone_enabled || parentWidth <= 0 || barHidden) {
      plan.killMarkerAction = 2;
      return plan;
    }

    var threshold = dc.killZoneThreshold;
    var width = dc.killZoneWidth;
    var pos = Math.round((parentWidth * threshold) / 100 - width / 2);
    if (pos < 0) pos = 0;
    if (pos > parentWidth - width) pos = Math.max(0, parentWidth - width);
    var posStr = pos + "px";
    var widthStr = width + "px";
    if (lKzRaw !== dc.killZoneColorRaw) {
      lKzRaw = dc.killZoneColorRaw;
      lKzColor = dc.killZoneColor;
    }
    var color = lKzColor;
    var sig =
      parentWidth +
      "|" +
      threshold +
      "|" +
      width +
      "|" +
      dc.killZoneColorRaw +
      "|" +
      color +
      "|" +
      lBgVis +
      "|" +
      lBgOp;
    if (
      lKzSig === sig &&
      lKzVis === "visible" &&
      lKzX === posStr &&
      lKzW === widthStr &&
      lKzAppliedColor === color
    ) {
      return plan;
    }
    plan.killMarkerAction = 1;
    plan.killMarkerX = posStr;
    plan.killMarkerWidth = widthStr;
    plan.killMarkerColor = color;
    plan.killMarkerSig = sig;
    return plan;
  }

  function applyEnemyKillMarkerPlan(plan) {
    if (plan.killMarkerAction === 3) {
      try {
        kz = us.FindChildTraverse(ID_KILL_MARKER);
      } catch (eFindKz) {}
      if (!kz || !kz.style) return;
      plan = computeEnemyKillMarkerPlan(true, plan.killMarkerParentWidth, plan);
    }
    if (plan.killMarkerAction === 2) {
      lKzSig = null;
      if (kz && kz.style && lKzVis !== "collapse") {
        kz.style.visibility = "collapse";
        lKzVis = "collapse";
      }
      return;
    }
    if (plan.killMarkerAction !== 1 || !kz || !kz.style) return;
    lKzSig = plan.killMarkerSig;
    if (lKzVis !== "visible") {
      kz.style.visibility = "visible";
      lKzVis = "visible";
    }
    if (lKzX !== plan.killMarkerX) {
      kz.style.marginLeft = plan.killMarkerX;
      lKzX = plan.killMarkerX;
    }
    if (lKzW !== plan.killMarkerWidth) {
      kz.style.width = plan.killMarkerWidth;
      lKzW = plan.killMarkerWidth;
    }
    if (lKzAppliedColor !== plan.killMarkerColor) {
      try {
        kz.style.backgroundColor = plan.killMarkerColor;
        lKzAppliedColor = plan.killMarkerColor;
      } catch (eCol) {
        lKzAppliedColor = null;
      }
    }
  }

  function parseCounterPositionValue(value, allowNegativeY) {
    var x = 0;
    var y = 200;
    var yMin = allowNegativeY ? -200 : 0;
    var raw = value;

    if (raw && typeof raw === "object") {
      if (Array.isArray(raw)) {
        if (raw.length > 0) x = clampNum(raw[0], 0, 400, 0);
        if (raw.length > 1) y = clampNum(raw[1], yMin, 400, 200);
      } else {
        if (Object.prototype.hasOwnProperty.call(raw, "x"))
          x = clampNum(raw.x, 0, 400, 0);
        if (Object.prototype.hasOwnProperty.call(raw, "y"))
          y = clampNum(raw.y, yMin, 400, 200);
      }
      return { x: x, y: y };
    }

    if (typeof raw === "string") {
      var parts = raw.match(/-?\d+(?:\.\d+)?/g);
      if (parts && parts.length > 0) {
        x = clampNum(parts[0], 0, 400, 0);
        if (parts.length > 1) y = clampNum(parts[1], yMin, 400, 200);
        return { x: x, y: y };
      }
    }

    if (typeof raw === "number") {
      y = clampNum(raw, yMin, 400, 200);
      return { x: x, y: y };
    }

    return { x: x, y: y };
  }

  function sHCS(lowMode) {
    if (!hc || !hc.style) return;
    var pulseTextMode = !!(
      lowMode &&
      cfg.hp_pulse_enabled &&
      cfg.hp_pulse_text_enabled
    );
    var defaultSize =
      dc.counterSize || clampNum(cfg.hp_counter_size, 72, 400, 145);
    var size = pulseTextMode
      ? dc.pulseTextSize || clampNum(cfg.hp_pulse_text_scale, 72, 320, defaultSize)
      : defaultSize;
    var basePos = pulseTextMode ? dc.pulseTextPosition : dc.counterPosition;
    var posX = clampNum(basePos.x, 0, 400, 0);
    var posY = clampNum(basePos.y, -50, 400, 200);
    var fontSize = size + "px";
    var panelHeight = "100%";
    if (pulseTextMode) {
      var baseHeight = 130;
      try {
        var hpParent = hc.GetParent ? hc.GetParent() : null;
        if (hpParent && hpParent.actuallayoutheight > 0)
          baseHeight = hpParent.actuallayoutheight;
      } catch (e) {}
      panelHeight = Math.max(baseHeight, Math.round(size * 1.85)) + "px";
    }
    var translateY = Math.max(posY - 150, -200);
    var transform =
      "translate3d(" +
      Math.round(posX) +
      "px, " +
      Math.round(translateY) +
      "px, 0px)";
    if (lHpSize !== fontSize) {
      hc.style.fontSize = fontSize;
      lHpSize = fontSize;
    }
    if (lHpHeight !== panelHeight) {
      hc.style.height = panelHeight;
      lHpHeight = panelHeight;
    }
    if (hca && hca.style && lHcaTransform !== transform) {
      hca.style.transform = transform;
      lHcaTransform = transform;
    }
  }

  function sHCV(visible) {
    if (!hc || !hc.style) return;
    var vis = visible ? "visible" : "collapse";
    if (lVis !== vis) {
      try {
        hc.style.visibility = vis;
        lVis = vis;
      } catch (eCounterVis) {
        lVis = null;
      }
    }
    if (!visible) {
      lSH = -1;
      lSM = -1;
      lCounterLowMode = false;
    }
  }

  function resetStyleStateForNewPanels() {
    var unitName = "";
    try {
      if (nm) unitName = nm.text || nm.GetAttributeString("text", "") || "";
    } catch (eName) {
      unitName = "";
    }
    if (
      rb === lastRbPanel &&
      cp === lastCpPanel &&
      lbp === lastLbpPanel &&
      hc === lastHcPanel &&
      bg === lastBgPanel &&
      kz === lastKzPanel &&
      pl === lastPlPanel
    ) {
      if (unitName !== lastUnitName) {
        lastUnitName = unitName;
        lTx = null;
        cMax = 0;
        lW = -1;
        lPW = -1;
        lHp = -1;
        pPct = -1;
        sFC = 0;
        noParentWidthFrames = 0;
        nonEnemyExitFrames = 0;
        buildingNotEnemyExitFrames = 0;
        stableCurrentRedBarFrames = 0;
        HealthbarPainter.resetStyleDriftBackoff();
      }
      return;
    }
    lastRbPanel = rb;
    lastCpPanel = cp;
    lastLbpPanel = lbp;
    lastHcPanel = hc;
    lastBgPanel = bg;
    lastKzPanel = kz;
    lastPlPanel = pl;
    lastUnitName = unitName;
    panelGeneration++;
    colorGeneration = -1;
    panelBornAt = _ts();
    lastStyleReapplyAt = panelBornAt;
    if (directBootstrapLocked) {
      directBootstrapLocked = false;
      directBootstrapResyncUntil = panelBornAt + DIRECT_BOOTSTRAP_RESYNC_MS;
    }
    HealthbarPainter.invalidateEnemyVisualCaches();
    clearPulse();
    allyColorActive = false;
    allyOwnedPanel = null;
    ihc = null;
    rbA = null;
    cpA = null;
    lColA = null;
    lWA = -1;
    lPWA = -1;
    sfcA = 0;
    lLvVis = null;
    lW = -1;
    lPW = -1;
    lHp = -1;
    pPct = -1;
    sFC = 0;
    noParentWidthFrames = 0;
    nonEnemyExitFrames = 0;
    buildingNotEnemyExitFrames = 0;
    stableCurrentRedBarFrames = 0;
    lCounterLowMode = false;
    lastEnemySignature = "";
    bootstrapApplied = false;
    directBootstrapApplied = false;
    bootstrapFinished = false;
    bootstrapRetryQueued = false;
    nextFirstPaintBootstrapProbeAt = 0;
    firstPaintBootstrapWaitCount = 0;
    sharedCfgRaw = "";
    lastBootstrapRequestAt = 0;
    bootstrapAttempts = 0;
    if (directBootstrapResyncUntil && directBootstrapResyncUntil < panelBornAt)
      directBootstrapResyncUntil = 0;
    settingsDirty = true;
    allySettingsDirty = true;
    settingsRefreshHoldUntil = 0;
    allySettingsRefreshHoldUntil = 0;
    requestCurrentRedBarRefresh();
    ensureBootstrapRetry("panel_rebind");
  }

  function cleanupEnemyFeature() {
    clearPulse();
    // Disabled means default game visuals: clear inline wash colors instead of
    // forcing a fallback color.
    if (rb && rb.style) {
      try {
        rb.style.washColor = "";
      } catch (eRbWash) {}
    }
    if (ui && ui.style) {
      try {
        ui.style.washColor = "";
      } catch (eUiWash) {}
    }
    if (hc && hc.style) {
      try {
        hc.style.washColor = "";
      } catch (eHcWash) {}
    }
    lCol = null;
    lColRaw = null;
    lUlt = null;
    lUltRaw = null;
    lTxt = null;
    lTxtRaw = null;
    applyEnemyKillMarkerPlan(
      computeEnemyKillMarkerPlan(false, 0, ENEMY_PAINT_PLAN),
    );
    if (bg && bg.style) {
      if (lBgVis !== "collapse") {
        bg.style.visibility = "collapse";
        lBgVis = "collapse";
      }
      if (lBgOp !== "0") {
        bg.style.opacity = "0";
        lBgOp = "0";
      }
    }
    if (hc && hc.style) {
      try {
        hc.style.fontSize = "";
        hc.style.height = "";
        hc.style.washColor = "";
      } catch (eHc) {}
      lHpSize = null;
      lHpHeight = null;
      lTxt = null;
      lTxtRaw = null;
    }
    if (hca && hca.style) {
      hca.style.transform = "";
      lHcaTransform = null;
    }
    lW = -1;
    lPW = -1;
    lHp = -1;
    pPct = -1;
    sFC = 0;
    noParentWidthFrames = 0;
    nonEnemyExitFrames = 0;
    buildingNotEnemyExitFrames = 0;
    stableCurrentRedBarFrames = 0;
  }

  function cleanupLevelNumberVisibility() {
    if (!wr || !wr.IsValid()) {
      if (!lc || !lc.IsValid()) lc = ctx.FindChildTraverse(ID_LEVEL_CONTAINER);
      var c = lc;
      while (c) {
        if (c.BHasClass && c.BHasClass("enemy")) {
          wr = c;
          break;
        }
        if (!c.GetParent) break;
        c = c.GetParent();
      }
    }
    if (wr && wr.IsValid && wr.IsValid()) {
      try {
        wr.RemoveClass(LV_VIS_CLASS);
      } catch (eLv) {}
      for (var i = 0; i < 4; i++) {
        try {
          wr.RemoveClass(LC_[i]);
        } catch (eTier) {}
      }
    }
    lLvVis = false;
    lLv = -1;
    lLNoChange = 0;
  }

  function startLoop(kind, delay) {
    if (!loopEnabled(kind) || loopRunning[kind]) return;
    loopRunning[kind] = true;
    scheduleLoop(kind, delay || 0.05);
  }

  function handleRuntimeToggleState(settingId) {
    refreshDerivedConfig();
    if (cfg.hp_enabled) startLoop(LOOP_ENEMY);
    else if (settingId === "hp_enabled" || loopRunning[LOOP_ENEMY]) {
      cleanupEnemyFeature();
      loopRunning[LOOP_ENEMY] = false;
    }

    if (cfg.hp_friend_enabled) startLoop(LOOP_ALLY);
    else if (settingId === "hp_friend_enabled" || loopRunning[LOOP_ALLY]) {
      resetAllyState(allyOwnedPanel, true);
      allyOwnedPanel = null;
      loopRunning[LOOP_ALLY] = false;
    }

    if (cfg.hp_level_number_visible) startLoop(LOOP_LEVEL);
    else if (settingId === "hp_level_number_visible" || loopRunning[LOOP_LEVEL]) {
      cleanupLevelNumberVisibility();
      loopRunning[LOOP_LEVEL] = false;
    }

    if (!cfg.hp_counter_visible) sHCV(false);
    else if (settingId === "hp_counter_visible") {
      lSH = -1;
      lSM = -1;
      requestLoopKick(LOOP_ENEMY);
    }

    if (!cfg.hp_pulse_enabled || !cfg.hp_pulse_text_enabled) {
      if (
        pulse ||
        settingId === "hp_pulse_enabled" ||
        settingId === "hp_pulse_text_enabled"
      )
        clearPulse();
      lCounterLowMode = false;
      sHCS(false);
    }
    if (!cfg.hp_friend_pulse_enabled && pulseA) syncAllyPulse(rbA, false);
    if (
      settingId === "hp_ult_color_enabled" ||
      settingId === "hp_ult_color_custom"
    ) {
      lUltRaw = null;
      lUlt = null;
      requestLoopKick(LOOP_ENEMY);
    }
    if (!cfg.hp_kill_zone_enabled)
      applyEnemyKillMarkerPlan(
        computeEnemyKillMarkerPlan(false, 0, ENEMY_PAINT_PLAN),
      );
    else if (settingId === "hp_kill_zone_enabled") requestLoopKick(LOOP_ENEMY);
    if (pl && pl.style && !cfg.hp_pip_visible && lPipVis !== "collapse") {
      try {
        pl.style.visibility = "collapse";
        lPipVis = "collapse";
      } catch (ePip) {
        lPipVis = null;
      }
    }
  }

  function applyCurrentSettings(isEnemy) {
    refreshDerivedConfig();
    HealthbarPainter.setBarVisible(!isEnemy || !!cfg.hp_bg_visible);
    if (cfg.hp_counter_visible) sHCS(lCounterLowMode);
    else sHCV(false);
    applyLayoutSettings();
    lastStyleReapplyAt = _ts();
    lW = -1;
    lHp = -1;
    settingsDirty = false;
    settingsRefreshHoldUntil = 0;
  }

  // Decode max HP from pip label string (e.g. "|||| ..." â†’ 2000)
  function pMax(t) {
    if (t === lTx) return cMax;
    lTx = t;
    var p = 0,
      q = 0,
      li = t.lastIndexOf("|");
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c === 124) p++;
      else if ((c === 34 || c === 39) && (li === -1 || i > li)) q++;
    }
    cMax = p * 500 + q * 100;
    return cMax;
  }

  function uHT(cu, mx, lowMode) {
    if (!cfg.hp_counter_visible) {
      sHCV(false);
      return;
    }
    if (!hc || (cu === lSH && mx === lSM)) return;
    sHCV(true);
    var fmt = cfg.hp_counter_format | 0;
    var s;
    if (fmt === 1) {
      var pct = mx > 0 ? Math.round((cu / mx) * 100) : 0;
      s = pct + "%";
    } else if (fmt === 2) {
      s = String(cu);
    } else {
      s = cu + " / " + mx;
    }
    try {
      if (hc.text !== s) {
        hc.text = s;
      }
    } catch (e) {
      try {
        hc.SetAttributeString("text", s);
      } catch (e2) {}
    }
    var nextCounterLowMode = !!lowMode;
    var counterStyleMissing =
      lHpSize === null ||
      lHpHeight === null ||
      (hca && hca.style && lHcaTransform === null);
    if (nextCounterLowMode !== lCounterLowMode || counterStyleMissing) {
      lCounterLowMode = nextCounterLowMode;
      sHCS(lCounterLowMode);
    } else {
      lCounterLowMode = nextCounterLowMode;
    }
    lSH = cu;
    lSM = mx;
  }

  // â”€â”€ Poll state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lUT = 0,
    lW = -1,
    lPW = -1,
    lHp = -1,
    pPct = -1,
    sFC = 0,
    noParentWidthFrames = 0,
    nonEnemyExitFrames = 0,
    buildingNotEnemyExitFrames = 0,
    stableCurrentRedBarFrames = 0;

  // â”€â”€ Main poll loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var ENEMY_PAINT_PLAN = {
    hasBarVisible: false,
    barVisible: false,
    barColor: "",
    ultColor: "",
    textColor: "",
    nextDelay: 0.15,
    clearPulse: false,
    stopAfterApply: false,
    hasPipVisible: false,
    pipVisible: "",
    counterAction: 0,
    counterCurrent: 0,
    counterMax: 0,
    counterLowMode: false,
    killMarkerAction: 0,
    killMarkerParentWidth: 0,
    killMarkerX: "",
    killMarkerWidth: "",
    killMarkerColor: "",
    killMarkerSig: "",
  };

  function resetEnemyPaintPlan(plan) {
    plan.hasBarVisible = false;
    plan.barVisible = false;
    plan.barColor = "";
    plan.ultColor = "";
    plan.textColor = "";
    plan.nextDelay = 0.15;
    plan.clearPulse = false;
    plan.stopAfterApply = false;
    plan.hasPipVisible = false;
    plan.pipVisible = "";
    plan.counterAction = 0;
    plan.counterCurrent = 0;
    plan.counterMax = 0;
    plan.counterLowMode = false;
    plan.killMarkerAction = 0;
    plan.killMarkerParentWidth = 0;
    plan.killMarkerX = "";
    plan.killMarkerWidth = "";
    plan.killMarkerColor = "";
    plan.killMarkerSig = "";
    return plan;
  }

  function isEnemyPaintWarmup(hp, prevHp, now) {
    return !!(
      hp <= dc.low &&
      panelBornAt &&
      now - panelBornAt < 900 &&
      (prevHp < 0 || (prevHp <= dc.low && hp > prevHp))
    );
  }

  function computeEnemyPaintPlan(hp, prevHp, now, shouldPulse, plan) {
    plan = resetEnemyPaintPlan(plan || ENEMY_PAINT_PLAN);
    var low = dc.low;
    var high = dc.high;
    var pulseThresh = dc.pulseThreshold;
    var sc = 0.15;
    var cl;
    if (isEnemyPaintWarmup(hp, prevHp, now)) {
      var warmupCol = getHighColor();
      plan.clearPulse = true;
      plan.barColor = warmupCol;
      plan.ultColor = warmupCol;
      plan.textColor = getTextColor(100, low, high);
      plan.nextDelay = 0.05;
      plan.stopAfterApply = true;
      return plan;
    }
    plan.hasBarVisible = true;
    plan.barVisible = shouldPulse && cfg.hp_pulse_hide_bar ? false : !!cfg.hp_bg_visible;
    if (hp <= low) {
      cl = cfg.hp_color_low;
      plan.textColor =
        cfg.hp_text_color_mode && cfg.hp_mode === 1
          ? cfg.hp_text_color_low
          : getTextColor(hp, low, high);
    } else if (hp <= high) {
      if (cfg.hp_mode === 1) {
        cl = ipHex(
          cfg.hp_color_low,
          cfg.hp_color_mid,
          (hp - low) / dc.denomMid,
        );
        plan.textColor = getGradientTextColor(hp, low, high);
      } else {
        cl = cfg.hp_color_mid;
        plan.textColor = getTextColor(hp, low, high);
      }
    } else {
      if (cfg.hp_mode === 1) {
        cl = ipHex(
          cfg.hp_color_mid,
          getHighColor(),
          (hp - high) / dc.denomHigh,
        );
        plan.textColor = getGradientTextColor(hp, low, high);
      } else {
        cl = getHighColor();
        plan.textColor = getTextColor(hp, low, high);
      }
      if (sFC >= 5)
        sc = ENEMY_IDLE_BACKOFF[Math.min(Math.floor((sFC - 5) / 5), 3)];
    }
    if (shouldPulse && cfg.hp_pulse_color_enabled) {
      if ((cfg.hp_pulse_color_mode | 0) === 1) {
        cl = ipHex(
          cl,
          cfg.hp_pulse_color,
          clampNum((pulseThresh - hp) / Math.max(1, pulseThresh), 0, 1, 0),
        );
      } else {
        cl = cfg.hp_pulse_color;
      }
    }
    plan.barColor = cl;
    plan.ultColor = cl;
    plan.nextDelay = sc;
    return plan;
  }

  function applyEnemyPaintPlan(plan) {
    if (plan.clearPulse) clearPulse();
    if (plan.hasBarVisible) HealthbarPainter.setBarVisible(plan.barVisible);
    HealthbarPainter.setBarColor(plan.barColor);
    HealthbarPainter.setUltColor(plan.ultColor);
    HealthbarPainter.setTextColor(plan.textColor);
    return plan.nextDelay;
  }

  function computeEnemyCounterPlan(
    hp,
    shouldPulse,
    hasPipPanel,
    pipText,
    hasCounterPanels,
    liveBarWidth,
    liveBarParentWidth,
    plan,
  ) {
    plan = resetEnemyPaintPlan(plan || ENEMY_PAINT_PLAN);
    var counterVisible = !!cfg.hp_counter_visible;
    var fmt = cfg.hp_counter_format | 0;
    plan.hasPipVisible = !!hasPipPanel;
    plan.pipVisible = cfg.hp_pip_visible ? "visible" : "collapse";
    if (!counterVisible) {
      plan.counterAction = 2;
      return plan;
    }
    if (!hasCounterPanels) return plan;
    plan.counterAction = 1;
    plan.counterLowMode = !!shouldPulse;
    if (fmt === 1) {
      plan.counterCurrent = hp;
      plan.counterMax = 100;
      return plan;
    }
    var ratio = liveBarParentWidth > 0 ? liveBarWidth / liveBarParentWidth : 0;
    var maxHp = pMax(pipText || "");
    plan.counterMax = maxHp;
    plan.counterCurrent = ratio >= 0.97 ? maxHp : Math.round(maxHp * ratio);
    return plan;
  }

  function applyEnemyCounterPlan(plan) {
    if (plan.hasPipVisible && pl && pl.style) {
      try {
        if (lPipVis !== plan.pipVisible) {
          pl.style.visibility = plan.pipVisible;
          lPipVis = plan.pipVisible;
        }
      } catch (ePip) {
        lPipVis = null;
      }
    }
    if (plan.counterAction === 1) {
      uHT(plan.counterCurrent, plan.counterMax, plan.counterLowMode);
    } else if (plan.counterAction === 2) {
      sHCV(false);
    }
  }

  function applyEnemyHealthColors(hp, prevHp, now, shouldPulse) {
    var plan = computeEnemyPaintPlan(
      hp,
      prevHp,
      now,
      shouldPulse,
      ENEMY_PAINT_PLAN,
    );
    var delay = applyEnemyPaintPlan(plan);
    if (plan.stopAfterApply) {
      scheduleLoop(LOOP_ENEMY, delay);
      return -1;
    }
    return delay;
  }

  function gL() {
    loopRunning[LOOP_ENEMY] = true;
    try {
      if (!cfg.hp_enabled) {
        cleanupEnemyFeature();
        loopRunning[LOOP_ENEMY] = false;
        return;
      }

      var now = _ts();
      consumeMatchReset(now);
      if (!HealthbarContext.refreshEnemy(now)) {
        scheduleLoop(LOOP_ENEMY, 0.15);
        return;
      }
      var target = HealthbarContext.snapshot;
      var enemySignature = target.teamId + ":" + target.flags;
      if (enemySignature !== lastEnemySignature) {
        lastEnemySignature = enemySignature;
        HealthbarPainter.invalidateEnemyVisualCaches();
        settingsDirty = true;
        settingsRefreshHoldUntil = now;
        allySettingsDirty = true;
        allySettingsRefreshHoldUntil = now;
        lLvVis = null;
      }
      var isEnemy = target.isEnemy;

      if (cfg.hp_skip_buildings && target.isBuilding) {
        clearPulse();
        buildingNotEnemyExitFrames++;
        nonEnemyExitFrames = 0;
        if (target.isFriendly || target.isFriendlyBuilding) {
          HealthbarPainter.setBarColor(WHITE_WASH);
          HealthbarPainter.clearUltIconColor();
          HealthbarPainter.setTextColor(WHITE_WASH);
          HealthbarPainter.setBarVisible(true);
          if (cfg.hp_friend_enabled) requestLoopKick(LOOP_ALLY);
        } else {
          var ignoredColor = HealthbarContext.getIgnoredTargetColor(target);
          HealthbarPainter.setBarColor(ignoredColor);
          HealthbarPainter.setUltColor(ignoredColor);
          HealthbarPainter.setTextColor(WHITE_WASH);
          HealthbarPainter.setBarVisible(!!cfg.hp_bg_visible);
        }
        applyEnemyKillMarkerPlan(
          computeEnemyKillMarkerPlan(false, 0, ENEMY_PAINT_PLAN),
        );
        scheduleLoop(
          LOOP_ENEMY,
          buildingNotEnemyExitFrames < 4
            ? 0.3
            : buildingNotEnemyExitFrames < 12
              ? 0.6
              : 1.5,
        );
        return;
      }
      if (shouldWaitForBootstrapBeforeFirstPaint(now, isEnemy)) return;
      if (
        isEnemy &&
        !directBootstrapLocked &&
        (!directBootstrapApplied || now <= directBootstrapResyncUntil) &&
        now - lastDirectBootstrapAt >= 1000
      ) {
        lastDirectBootstrapAt = now;
        tryApplyDirectBootstrap();
      }
      if (isEnemy && now - lastStyleReapplyAt >= STYLE_REAPPLY_WATCHDOG_MS) {
        lastStyleReapplyAt = now;
        if (HealthbarPainter.hasEnemyStyleDrift()) {
          HealthbarPainter.invalidateEnemyVisualCaches();
          settingsDirty = true;
          settingsRefreshHoldUntil = now;
        }
      }

      var dirtyState = 0;
      if (settingsDirty) {
        if (now < settingsRefreshHoldUntil) {
          scheduleLoop(LOOP_ENEMY, 0.05);
          return;
        }
        applyCurrentSettings(isEnemy);
        dirtyState = 1;
      }
      var wasDirty = !!dirtyState;
      if (!wasDirty && isEnemy && now >= nextStyleDriftCheckAt) {
        nextStyleDriftCheckAt =
          now +
          (styleDriftCleanFrames >= 8
            ? STYLE_DRIFT_CHECK_SLOW_MS
            : styleDriftCleanFrames >= 3
              ? STYLE_DRIFT_CHECK_MID_MS
              : STYLE_DRIFT_CHECK_MS);
        if (HealthbarPainter.hasEnemyBarStyleDrift()) {
          HealthbarPainter.resetStyleDriftBackoff();
          HealthbarPainter.invalidateEnemyVisualCaches();
          lW = -1;
          lHp = -1;
          wasDirty = true;
        } else {
          styleDriftCleanFrames++;
        }
      }

      if (target.isNeutral) {
        clearPulse();
        HealthbarPainter.setBarVisible(true);
        applyEnemyKillMarkerPlan(
          computeEnemyKillMarkerPlan(false, 0, ENEMY_PAINT_PLAN),
        );
        HealthbarPainter.setBarColor("#5BEFB5");
        HealthbarPainter.setTextColor(WHITE_WASH);
        lUT = now;
        scheduleLoop(LOOP_ENEMY, 1.5);
        return;
      }
      if (target.flags & 1) {
        nonEnemyExitFrames = 0;
        buildingNotEnemyExitFrames = 0;
      } else {
        nonEnemyExitFrames++;
        buildingNotEnemyExitFrames = 0;
        HealthbarPainter.setBarVisible(true);
        applyEnemyKillMarkerPlan(
          computeEnemyKillMarkerPlan(false, 0, ENEMY_PAINT_PLAN),
        );
        lUT = now;
        scheduleLoop(
          LOOP_ENEMY,
          nonEnemyExitFrames < 4 ? 0.4 : nonEnemyExitFrames < 12 ? 0.75 : 1.5,
        );
        return;
      }
      if (
        !bootstrapApplied &&
        !directBootstrapApplied &&
        !directBootstrapLocked &&
        !cfg.hp_team_colors &&
        normalizeWashColor(cfg.hp_color_high) ===
          normalizeWashColor(DEFAULTS.hp_color_high)
      ) {
        HealthbarPainter.setBarColor(CSS_TEAM_ENEMY_COLOR);
        HealthbarPainter.setUltColor(CSS_TEAM_ENEMY_COLOR);
        HealthbarPainter.setTextColor(WHITE_WASH);
        scheduleLoop(LOOP_ENEMY, 0.05);
        return;
      }

      var w = target.barWidth;
      var pw = target.parentWidth;
      if (
        w === lW &&
        pw === lPW &&
        !pulse &&
        !wasDirty &&
        colorGeneration === panelGeneration
      ) {
        stableCurrentRedBarFrames++;
        scheduleLoop(LOOP_ENEMY, now - lUT > 2000 ? 1.5 : 0.25);
        return;
      }
      stableCurrentRedBarFrames = 0;
      lW = w;
      lPW = pw;
      lUT = now;
      if (pw <= 0) {
        noParentWidthFrames++;
        HealthbarPainter.setBarColor(getHighColor());
        applyEnemyKillMarkerPlan(
          computeEnemyKillMarkerPlan(false, 0, ENEMY_PAINT_PLAN),
        );
        scheduleLoop(
          LOOP_ENEMY,
          noParentWidthFrames < 4 ? 0.18 : noParentWidthFrames < 12 ? 0.35 : 0.75,
        );
        return;
      }
      noParentWidthFrames = 0;
      var hp = ((w / pw) * 100) | 0;

      var low = dc.low;
      var high = dc.high;
      var pulseThresh = dc.pulseThreshold;
      var shouldPulse = !!(cfg.hp_pulse_enabled && hp <= pulseThresh);
      if (
        Math.abs(hp - lHp) < 3 &&
        hp > low &&
        lHp > low &&
        !pulse &&
        !shouldPulse &&
        !wasDirty
      ) {
        scheduleLoop(LOOP_ENEMY, 0.25);
        return;
      }

      var prevHp = lHp;
      if (hp === pPct) sFC++;
      else {
        sFC = 0;
        pPct = hp;
      }
      lHp = hp;
      var counterVisible = !!cfg.hp_counter_visible;
      var fmt = cfg.hp_counter_format | 0;
      var txt = "";
      var hasPipPanel = !!pl;
      if (hasPipPanel && counterVisible && fmt !== 1) {
        try {
          txt = pl.text || pl.GetAttributeString("text", "") || "";
        } catch (ePipText) {
          txt = "";
          lPipVis = null;
        }
      }
      var hasCounterPanels = !!(counterVisible && lb && lbp);
      var liveBarWidth = 0;
      var liveBarParentWidth = 0;
      if (hasCounterPanels && fmt !== 1) {
        liveBarWidth = lb.actuallayoutwidth || 0;
        liveBarParentWidth = lbp.actuallayoutwidth || 0;
      }
      var counterPlan = computeEnemyCounterPlan(
        hp,
        shouldPulse,
        hasPipPanel,
        txt,
        hasCounterPanels,
        liveBarWidth,
        liveBarParentWidth,
        ENEMY_PAINT_PLAN,
      );
      applyEnemyCounterPlan(counterPlan);

      var suppressEnemyPulse = isEnemyPaintWarmup(hp, prevHp, now);
      var pulseFast = applyEnemyPulsePlan(
        computeEnemyPulsePlan(
          shouldPulse && !suppressEnemyPulse,
          now,
          ENEMY_PULSE_PLAN,
        ),
      );

      var sc = applyEnemyHealthColors(hp, prevHp, now, shouldPulse);
      if (sc < 0) return;
      applyEnemyKillMarkerPlan(
        computeEnemyKillMarkerPlan(!!cfg.hp_kill_zone_enabled, pw, ENEMY_PAINT_PLAN),
      );
      colorGeneration = panelGeneration;
      if (pulseFast) sc = 0.1;
      scheduleLoop(LOOP_ENEMY, sc);
    } catch (e) {
      scheduleLoop(LOOP_ENEMY, 0.5);
    }
  }

  // â”€â”€ Level tier coloring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var LT_ = [11, 19, 27, 35],
    LC_ = ["level_tier2", "level_tier3", "level_tier4", "level_tier5"];
  var LV_VIS_CLASS = "level_number_visible";
  var ll = null,
    lc = null,
    wr = null,
    lLv = -1,
    lLvVis = null;
  var LEVEL_SNAPSHOT = {
    label: null,
    container: null,
    wrapper: null,
    level: 0,
    ready: false,
  };
  var LEVEL_PAINT_PLAN = {
    visible: false,
    tierClass: "",
    changed: false,
  };

  function refreshLevelSnapshot(snapshot) {
    snapshot.label = null;
    snapshot.container = null;
    snapshot.wrapper = null;
    snapshot.level = 0;
    snapshot.ready = false;
    if (!ll || !ll.IsValid()) ll = ctx.FindChildTraverse(ID_LEVEL_LABEL);
    if (!lc || !lc.IsValid()) lc = ctx.FindChildTraverse(ID_LEVEL_CONTAINER);
    if (lc && (!wr || !wr.IsValid())) {
      var c = lc;
      while (c) {
        if (c.BHasClass && c.BHasClass("enemy")) {
          wr = c;
          break;
        }
        if (!c.GetParent) break;
        c = c.GetParent();
      }
    }
    snapshot.label = ll;
    snapshot.container = lc;
    snapshot.wrapper = wr;
    snapshot.ready = !!(ll && lc && wr);
    if (!snapshot.ready) return snapshot;
    var t = "";
    try {
      t = ll.text || ll.GetAttributeString("text", "") || "";
    } catch (e) {
      t = "";
    }
    if (!t || t.charCodeAt(0) === 123) return snapshot;
    var lv = 0;
    for (var i = 0; i < t.length; i++) {
      var d = t.charCodeAt(i) - 48;
      if (d >= 0 && d <= 9) lv = lv * 10 + d;
    }
    snapshot.level = lv;
    return snapshot;
  }

  function computeLevelPaintPlan(snapshot, plan) {
    plan.visible = false;
    plan.tierClass = "";
    plan.changed = false;
    if (!snapshot.ready) return plan;
    plan.visible = true;
    var lv = snapshot.level;
    if (!lv || lv === lLv) return plan;
    plan.changed = true;
    for (var i = 3; i >= 0; i--) {
      if (lv >= LT_[i]) {
        plan.tierClass = LC_[i];
        break;
      }
    }
    return plan;
  }

  function applyLevelPaintPlan(snapshot, plan) {
    var wrapper = snapshot.wrapper;
    if (!wrapper) return false;
    if (plan.visible && lLvVis !== true) {
      wrapper.AddClass(LV_VIS_CLASS);
      lLvVis = true;
    }
    if (!plan.changed) return false;
    lLv = snapshot.level;
    for (var j = 0; j < 4; j++) wrapper.RemoveClass(LC_[j]);
    if (plan.tierClass) wrapper.AddClass(plan.tierClass);
    return true;
  }

  var lLNoChange = 0;
  function lL() {
    if (!cfg.hp_level_number_visible) {
      cleanupLevelNumberVisibility();
      loopRunning[LOOP_LEVEL] = false;
      return;
    }
    loopRunning[LOOP_LEVEL] = true;
    var levelSnapshot = refreshLevelSnapshot(LEVEL_SNAPSHOT);
    var levelPlan = computeLevelPaintPlan(levelSnapshot, LEVEL_PAINT_PLAN);
    lLNoChange = applyLevelPaintPlan(levelSnapshot, levelPlan) ? 0 : lLNoChange + 1;
    scheduleLoop(LOOP_LEVEL, lLNoChange > 10 ? 5.0 : 0.5);
  }

  function resetAllySnapshot(snapshot) {
    snapshot.confirmed = false;
    snapshot.panel = null;
    snapshot.parent = null;
    snapshot.flags = 0;
    snapshot.barWidth = 0;
    snapshot.parentWidth = 0;
    snapshot.hp = 0;
    return snapshot;
  }

  function refreshAllySnapshot(snapshot, panel, parent, flags) {
    snapshot = resetAllySnapshot(snapshot || ALLY_SNAPSHOT);
    snapshot.panel = panel;
    snapshot.parent = parent;
    snapshot.flags = flags;
    snapshot.confirmed = isConfirmedAllyHealthbar(flags);
    if (!snapshot.confirmed) return snapshot;
    snapshot.barWidth =
      panel && panel.actuallayoutwidth !== undefined
        ? panel.actuallayoutwidth | 0
        : 0;
    snapshot.parentWidth =
      parent && parent.actuallayoutwidth !== undefined
        ? parent.actuallayoutwidth | 0
        : 0;
    snapshot.hp =
      snapshot.parentWidth > 0
        ? ((snapshot.barWidth / snapshot.parentWidth) * 100) | 0
        : 0;
    return snapshot;
  }

  function resetAllyPaintPlan(plan) {
    plan.washColor = "";
    plan.inPulse = false;
    plan.nextDelay = 0.35;
    return plan;
  }

  function computeAllyPaintPlan(snapshot, plan) {
    plan = resetAllyPaintPlan(plan || ALLY_PAINT_PLAN);
    var ahp = snapshot.hp;
    var alow = dc.low;
    var ahigh = dc.high;
    var acl;
    plan.inPulse = !!(
      cfg.hp_friend_pulse_enabled && ahp <= dc.friendPulseThreshold
    );
    if (plan.inPulse) plan.nextDelay = 0.15;
    if (plan.inPulse && cfg.hp_friend_pulse_color_enabled) {
      acl = cfg.hp_friend_pulse_color;
    } else if (cfg.hp_mode === 1) {
      if (ahp <= alow) acl = cfg.hp_friend_color_low;
      else if (ahp <= ahigh)
        acl = ipHex(
          cfg.hp_friend_color_low,
          cfg.hp_friend_color_mid,
          (ahp - alow) / Math.max(1, ahigh - alow),
        );
      else
        acl = ipHex(
          cfg.hp_friend_color_mid,
          cfg.hp_friend_color_high,
          (ahp - ahigh) / Math.max(1, 100 - ahigh),
        );
    } else {
      if (ahp <= alow) acl = cfg.hp_friend_color_low;
      else if (ahp <= ahigh) acl = cfg.hp_friend_color_mid;
      else acl = cfg.hp_friend_color_high;
    }
    plan.washColor = normalizeWashColor(acl);
    return plan;
  }

  function applyAllyPaintPlan(snapshot, plan) {
    if (lColA !== plan.washColor && snapshot.panel) {
      try {
        snapshot.panel.style.washColor = plan.washColor;
        lColA = plan.washColor;
        allyColorActive = true;
        allyOwnedPanel = snapshot.panel;
      } catch (e) {
        lColA = null;
      }
    }
    syncAllyPulse(snapshot.panel, plan.inPulse);
    return plan.nextDelay;
  }

  // ── Ally bar loop ────────────────────────────────────────────────────────────
  function aL() {
    loopRunning[LOOP_ALLY] = true;
    try {
      if (!cfg.hp_friend_enabled) {
        resetAllyState(allyOwnedPanel, true);
        allyOwnedPanel = null;
        loopRunning[LOOP_ALLY] = false;
        return;
      }

      var now = _ts();
      consumeMatchReset(now);
      if (!rbA || !rbA.IsValid()) {
        resetAllyState(allyOwnedPanel, false);
        allyOwnedPanel = null;
        rbA = null;
        cpA = null;
        rbA = fRB();
        if (!rbA) {
          aIdleMiss++;
          scheduleLoop(LOOP_ALLY, aIdleMiss > 75 ? 3.0 : 0.2);
          return;
        }
      }
      aIdleMiss = 0;
      if (rbA.GetParent) {
        var pa = rbA.GetParent();
        if (cpA !== pa) cpA = pa;
      }

      if (allySettingsDirty) {
        if (now < allySettingsRefreshHoldUntil) {
          scheduleLoop(LOOP_ALLY, 0.05);
          return;
        }
        allySettingsDirty = false;
        resetAllyState(allyOwnedPanel, false);
      }

      var f2 = scanAllyPanel(rbA);
      var allySnapshot = refreshAllySnapshot(ALLY_SNAPSHOT, rbA, cpA, f2);

      if (!allySnapshot.confirmed) {
        resetAllySnapshot(ALLY_SNAPSHOT);
        if (allyColorActive || allyOwnedPanel) {
          resetAllyState(allyOwnedPanel, false);
          allyOwnedPanel = null;
        }
        sfcA = 0;
        noAllyParentWidthFrames = 0;
        scheduleLoop(LOOP_ALLY, 1.5);
        return;
      }

      var aw = allySnapshot.barWidth;
      var apw = allySnapshot.parentWidth;
      if (apw <= 0) {
        noAllyParentWidthFrames++;
        var noAllyParentDelay =
          noAllyParentWidthFrames < 4
            ? 0.2
            : noAllyParentWidthFrames < 12
              ? 0.4
              : 0.8;
        scheduleLoop(LOOP_ALLY, noAllyParentDelay);
        return;
      }
      noAllyParentWidthFrames = 0;

      if (aw === lWA && apw === lPWA && !pulseA) {
        sfcA++;
        var scIdle = ALLY_IDLE_BACKOFF[Math.min(Math.floor(sfcA / 3), 4)];
        scheduleLoop(LOOP_ALLY, scIdle);
        return;
      }
      sfcA = 0;
      lWA = aw;
      lPWA = apw;

      var allyPlan = computeAllyPaintPlan(allySnapshot, ALLY_PAINT_PLAN);
      scheduleLoop(LOOP_ALLY, applyAllyPaintPlan(allySnapshot, allyPlan));
    } catch (e) {
      scheduleLoop(LOOP_ALLY, 0.5);
    }
  }

  tryApplyDirectBootstrap();
  handleRuntimeToggleState();
  scheduleBootstrapRetry();
})();
