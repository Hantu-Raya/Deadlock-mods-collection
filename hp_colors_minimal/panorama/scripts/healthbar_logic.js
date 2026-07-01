// fallow-ignore-file unused-file
// fallow-ignore-file complexity
"use strict";
(function () {
  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Runtime configuration schema. Keep this list synchronized with the builder; production requires 49 keys.
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
  var cfg = {};
  var dc = {};
  var TEAM1_HIGH = "#FFC961";
  var TEAM2_HIGH = "#6485FC";
  var CSS_TEAM1_COLOR = "#E7B659";
  var CSS_TEAM2_COLOR = "#5B79E6";
  var CSS_TEAM_ENEMY_COLOR = "#E16161";
  var CSS_TEAM_FRIEND_COLOR = "#FFEFD7";
  var ID_UNIT_STATUS = "UnitStatus";
  var ID_INFO_HEALTH_CONTAINER = "InfoHealthContainer";
  var ID_UNIT_HEALTHBAR_CONTAINER = "UnitHealthbarContainer";
  var ID_UNIT_HEALTHBAR_LAGGING = "unit_healthbar_lagging";
  var ID_UNIT_HEALTHBAR_BG = "unit_healthbar_bg";
  var ID_UNIT_HEALTHBAR_PIP_LABEL = "unit_healthbar_pip_label";
  var ID_UNIT_ULT_READY_ICON = "unit_ult_ready_icon";
  var ID_UNIT_LEVEL_LABEL = "unit_level_label";
  var ID_UNIT_NAME = "name";
  var CLASS_ENEMY = "enemy";
  var CLASS_FRIEND = "friend";
  var CLASS_TEAM1 = "team1";
  var CLASS_TEAM2 = "team2";
  var CLASS_TEAM_NEUTRAL = "team_neutral";

  var WHITE_WASH = "#ffffff";
  var LP = "low_hp_pulsing";
  var _ts = Date.now
    ? Date.now.bind(Date)
    : function () {
        return +new Date();
      };
  var PULSE_INTENSITY = ["pulse_subtle", "", "pulse_intense"];
  var ENEMY_IDLE_BACKOFF = [0.35, 0.8, 1.5, 2.5];
  var ALLY_IDLE_BACKOFF = [0.35, 0.9, 1.8, 3.0, 3.0];
  var CURRENT_RB_RESCAN_MS = 180;
  var CURRENT_RB_IDLE_RESCAN_MS = 1200;
  var CURRENT_RB_IDLE_RESCAN_MID_MS = 1800;
  var CURRENT_RB_IDLE_RESCAN_SLOW_MS = 2500;
  var CURRENT_RB_REFRESH_WINDOW_MS = 1600;
  var DEBUG_ENABLED = false;
  var CAPTURE_ENABLED = false;
  var ALLY_FRIEND_WAKE_MIN_MS = 2500;
  var ALLY_DEFERRED_FAR_LOG_MIN_MS = 3000;
  var SAME_RAW_WAKE_MIN_MS = 250;
  var SAME_RAW_WAKE_WATCHDOG_MS = 5000;
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
    lColARaw = null,
    lWA = -1,
    lPWA = -1,
    lHpA = -1,
    sfcA = 0,
    allyColorActive = false;
  var lastAllyDeferredFarAt = 0;
  var noAllyParentWidthFrames = 0;
  var allyUnconfirmedFrames = 0;
  var lastAllyFriendWakeAt = 0;
  var nextAllyStyleDriftCheckAt = 0;
  var pulseA = 0,
    lPIA = -1,
    lPDA = null;
  var aIdleMiss = 0;
  var redBarResolverPanel = null;
  var redBarResolverMode = "";
  var redBarResolverAt = 0;
  var lastRedBarResolveRejectFlags = 0;

  function clearPulse() {
    if (!pulse && lPD === null && lPI < 0 && lTB === null) return;
    var oldCls = lPI >= 0 ? PULSE_INTENSITY[lPI] : "";
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
    pulse = 0;
    lPD = null;
    lPI = -1;
    lTB = null;
    lCol = lUlt = lTxt = null;
    lColRaw = lUltRaw = lTxtRaw = null;
  }

  function syncEnemyPulse(shouldPulse, now) {
    if (!shouldPulse) {
      if (pulse) clearPulse();
      return false;
    }
    if (!pulse) {
      pulse = 1;
      lCol = lUlt = lTxt = null;
      lColRaw = lUltRaw = lTxtRaw = null;
      try {
        if (rb) rb.AddClass(LP);
      } catch (e) {}
      try {
        if (ui) ui.AddClass(LP);
      } catch (e2) {}
    }

    var bpm = clampNum(cfg.hp_pulse_bpm, 30, 300, 75);
    var dur = (60 / bpm).toFixed(3) + "s";
    if (lPD !== dur) {
      try {
        if (rb && rb.IsValid && rb.IsValid()) rb.style.animationDuration = dur;
        if (ui && ui.IsValid && ui.IsValid()) ui.style.animationDuration = dur;
        lPD = dur;
      } catch (eDur) {
        lPD = null;
      }
    }

    var idx = clampNum(cfg.hp_pulse_intensity, 0, 2, 1) | 0;
    if (lPI !== idx) {
      var oldCls = lPI >= 0 ? PULSE_INTENSITY[lPI] : "";
      var newCls = PULSE_INTENSITY[idx];
      if (oldCls) {
        try {
          if (rb && rb.IsValid && rb.IsValid()) rb.RemoveClass(oldCls);
        } catch (eOld) {}
        try {
          if (ui && ui.IsValid && ui.IsValid()) ui.RemoveClass(oldCls);
        } catch (eOldUi) {}
      }
      if (newCls) {
        try {
          if (rb && rb.IsValid && rb.IsValid()) rb.AddClass(newCls);
        } catch (eNew) {}
        try {
          if (ui && ui.IsValid && ui.IsValid()) ui.AddClass(newCls);
        } catch (eNewUi) {}
      }
      lPI = idx;
    }

    if (!cfg.hp_pulse_text_enabled) {
      try {
        if (hc && hc.style) {
          hc.style.animationDuration = "";
          hc.style.brightness = "";
        }
      } catch (eTextOff) {}
      lTB = null;
      return false;
    }
    if (!hc || !hc.style) return false;
    var period = Math.max(1, 60000 / bpm);
    var phase = (now % period) / period;
    var wave = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    var hi = idx === 2 ? 2.0 : idx === 0 ? 1.15 : 1.5;
    var lo = idx === 2 ? 0.55 : idx === 0 ? 0.85 : 0.65;
    var next = (lo + (hi - lo) * wave).toFixed(2);
    if (lTB !== next) {
      try {
        hc.style.brightness = next;
        lTB = next;
      } catch (eBright) {
        lTB = null;
      }
    }
    return true;
  }

  function syncAllyPulse(panel, shouldPulse) {
    var target = panel || allyOwnedPanel;
    if (!shouldPulse) {
      var oldCls = lPIA >= 0 ? PULSE_INTENSITY[lPIA] : "";
      if (target) {
        try {
          target.RemoveClass(LP);
          if (oldCls) target.RemoveClass(oldCls);
          if (target.style) {
            target.style.animationDuration = "";
            target.style.brightness = "";
          }
        } catch (e) {}
      }
      pulseA = 0;
      lPIA = -1;
      lPDA = null;
      lColA = null;
      return false;
    }

    var started = !pulseA;
    if (started) {
      pulseA = 1;
      lPIA = -1;
      lColA = null;
      try {
        if (target) target.AddClass(LP);
      } catch (eStart) {}
    }
    var idxA = clampNum(cfg.hp_friend_pulse_intensity, 0, 2, 1) | 0;
    if (lPIA !== idxA) {
      var oldA = lPIA >= 0 ? PULSE_INTENSITY[lPIA] : "";
      var newA = PULSE_INTENSITY[idxA];
      try {
        if (target && oldA) target.RemoveClass(oldA);
        if (target && newA) target.AddClass(newA);
      } catch (eCls) {}
      lPIA = idxA;
    }
    var bpmA = clampNum(cfg.hp_friend_pulse_bpm, 30, 300, 75);
    var durA = (60 / bpmA).toFixed(3) + "s";
    if (lPDA !== durA) {
      try {
        if (target && target.style) target.style.animationDuration = durA;
        lPDA = durA;
      } catch (eDurA) {
        lPDA = null;
      }
    }
    return started;
  }

  function coercePositionCfgValue(value) {
    var posX = 0;
    var posY = 200;

    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        if (value.length > 0) posX = clampNum(value[0], 0, 400, 0);
        if (value.length > 1) posY = clampNum(value[1], -50, 400, 200);
      } else {
        if (Object.prototype.hasOwnProperty.call(value, "x"))
          posX = clampNum(value.x, 0, 400, 0);
        if (Object.prototype.hasOwnProperty.call(value, "y"))
          posY = clampNum(value.y, -50, 400, 200);
      }
      return Math.round(posX) + "," + Math.round(posY);
    }

    if (typeof value === "string") {
      var posParts = value.match(/-?\d+(?:\.\d+)?/g);
      if (posParts && posParts.length > 0) {
        posX = clampNum(posParts[0], 0, 400, 0);
        if (posParts.length > 1) posY = clampNum(posParts[1], -50, 400, 200);
        return Math.round(posX) + "," + Math.round(posY);
      }
    }

    if (typeof value === "number") {
      posY = clampNum(value, -50, 400, 200);
    }

    return Math.round(posX) + "," + Math.round(posY);
  }

  function coerceBooleanCfgValue(value, fallback) {
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

  function coerceNumberCfgValue(value, fallback) {
    var next = Number(value);
    if (!isFinite(next)) return fallback;
    return Math.round(next);
  }

  function coerceStringCfgValue(value, fallback) {
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }

  function coerceCfgValue(id, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, id)) return value;

    var fallback = DEFAULTS[id];
    if (id === "hp_counter_position" || id === "hp_pulse_text_position")
      return coercePositionCfgValue(value);
    if (typeof fallback === "boolean")
      return coerceBooleanCfgValue(value, fallback);
    if (typeof fallback === "number")
      return coerceNumberCfgValue(value, fallback);
    if (typeof fallback === "string")
      return coerceStringCfgValue(value, fallback);
    return value;
  }

  function loadCfgDefaults() {
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        cfg[k] = DEFAULTS[k];
      }
    }
  }

  loadCfgDefaults();
  refreshDerivedConfig();
  var PRESET_MAX_FAST_ATTEMPTS = 8;
  var PRESET_RETRY_SEC = 0.5;
  var PRESET_SLOW_RETRY_SEC = 3.0;
  var PRESET_LATE_RETRY_AFTER_ATTEMPTS = 20;
  var PRESET_LATE_RETRY_SEC = 10.0;
  var PRESET_LATE_REQUEST_EVERY_ATTEMPTS = 6;
  var STYLE_REAPPLY_WATCHDOG_MS = 5000;
  var STYLE_DRIFT_CHECK_MS = 350;
  var STYLE_DRIFT_CHECK_MID_MS = 700;
  var STYLE_DRIFT_CHECK_SLOW_MS = 950;
  var SHARED_CFG_RAW_KEY = "__hpColorsCfgRaw";
  var ROOT_CFG_RAW_ATTR = "hp_colors_minimal_cfg_raw";
  // Static preset bridge: shared raw transport first, root-attribute fallback, event replay last.
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var SNAPSHOT_MAGIC = "HP_COLORS_PRESET_SNAPSHOT";
  var REQUEST_MAGIC = "HP_COLORS_PRESET_REQUEST";
  var presetApplied = false;
  var presetAttempts = 0;
  var settingsDirty = true;
  var settingsRefreshHoldUntil = 0;
  var allySettingsDirty = true;
  var allySettingsRefreshHoldUntil = 0;
  var lastStyleReapplyAt = 0;
  var sharedCfgRaw = "";
  var lastSameRawWakeAt = 0;
  var _uiMissAt = 0;
  var UI_MISS_TTL_MS = 2000;
  var presetRootPanel = null;
  var lastSnapshotPayload = "";
  var presetGeneration = 0;
  var lastEnemyPresetGeneration = -1;
  var lastAllyPresetGeneration = -1;
  var lastAllyPanel = null;
  var lastSameRawWakePanelGeneration = -1;
  var lastSameRawEligibilityCheckAt = 0;

  function getSharedStore() {
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig)
        return GameUI.CustomUIConfig();
    } catch (e) {}
    return null;
  }

  function resolveRootPanelForPreset() {
    if (presetRootPanel && vPanel(presetRootPanel)) return presetRootPanel;
    var panel = ctx;
    var last = null;
    var guard = 0;
    while (panel && guard < 24) {
      if (vPanel(panel)) last = panel;
      var parent = null;
      try {
        parent = panel.GetParent ? panel.GetParent() : null;
      } catch (eParent) {
        parent = null;
      }
      if (!parent || parent === panel) break;
      panel = parent;
      guard += 1;
    }
    presetRootPanel = last || ctx || null;
    return presetRootPanel;
  }

  function readRootPresetSnapshot() {
    var root = resolveRootPanelForPreset();
    if (!vPanel(root) || !root.GetAttributeString) {
      return "";
    }
    try {
      var raw = String(root.GetAttributeString(ROOT_CFG_RAW_ATTR, "") || "");
      return raw;
    } catch (e) {}
    return "";
  }

  // Tokenized schedulers for enemy, ally, and level loops.

  function loopEnabled(kind) {
    if (kind === LOOP_ENEMY) return !!cfg.hp_enabled;
    if (kind === LOOP_ALLY) return !!cfg.hp_friend_enabled;
    return !!cfg.hp_level_number_visible;
  }

  function runLoop(kind) {
    if (kind === LOOP_ENEMY) gL();
    else if (kind === LOOP_ALLY) aL();
    else lL();
  }

  function requestLoopKick(kind, delay) {
    if (!loopEnabled(kind) || loopWakeQueued[kind]) return;
    loopWakeQueued[kind] = true;
    if (
      !scheduleLoop(kind, delay === undefined ? 0.01 : delay, function () {
        loopWakeQueued[kind] = false;
      })
    ) {
      loopWakeQueued[kind] = false;
    }
  }

  function maybeKickAllyLoopForFriendlyTarget(now) {
    if (!cfg.hp_friend_enabled) return;
    if (allyColorActive && loopNextDueAt[LOOP_ALLY] && loopNextDueAt[LOOP_ALLY] > now) {
      var allyDueIn = loopNextDueAt[LOOP_ALLY] - now;
      if (allyDueIn <= 250) {
        return;
      }
      if (allyOwnedPanel && vPanel(allyOwnedPanel)) {
        if (
          lastAllyDeferredFarAt &&
          now - lastAllyDeferredFarAt < ALLY_DEFERRED_FAR_LOG_MIN_MS
        ) {
          return;
        }
        lastAllyDeferredFarAt = now;
        return;
      }
    }
    if (
      lastAllyFriendWakeAt &&
      now - lastAllyFriendWakeAt < ALLY_FRIEND_WAKE_MIN_MS
    ) {
      return;
    }
    lastAllyFriendWakeAt = now;
    requestLoopKick(LOOP_ALLY, 0.01);
  }

  function stableNonEnemyDelay(frames) {
    return frames < 4 ? 0.2 : 1.25;
  }

  function stableFriendNonEnemyDelay(frames) {
    return frames < 4 ? 0.2 : 2.0;
  }

  function stableNeutralDelay(frames) {
    return frames < 4 ? 0.75 : 1.5;
  }

  function noParentWidthDelay(frames) {
    return frames < 3 ? 0.18 : frames < 6 ? 0.75 : frames < 10 ? 1.5 : 2.5;
  }

  function loopHasPending(kind) {
    return !!(loopRunning[kind] && loopNextDueAt[kind]);
  }


  function canSkipPresetReplayWake(now) {
    if (!lastSameRawEligibilityCheckAt) return false;
    if (now - lastSameRawEligibilityCheckAt >= SAME_RAW_WAKE_WATCHDOG_MS)
      lastSameRawEligibilityCheckAt = now;
    if (lastSameRawWakePanelGeneration !== panelGeneration) return false;
    if (
      (cfg.hp_enabled && lastEnemyPresetGeneration !== presetGeneration) ||
      (cfg.hp_friend_enabled && lastAllyPresetGeneration !== presetGeneration)
    )
      return false;
    if (
      (cfg.hp_enabled && !loopHasPending(LOOP_ENEMY)) ||
      (cfg.hp_friend_enabled && !loopHasPending(LOOP_ALLY)) ||
      (cfg.hp_level_number_visible && !loopHasPending(LOOP_LEVEL))
    )
      return false;
    return true;
  }

  function presetReplayWakeReason(now) {
    var beforePanelGeneration = panelGeneration;
    try {
      resetStyleStateForNewPanels();
    } catch (ePanel) {}
    if (panelGeneration !== beforePanelGeneration) return "panel_changed";
    if (lastSameRawWakePanelGeneration !== panelGeneration)
      return "panel_unseen";
    if (
      (cfg.hp_enabled && lastEnemyPresetGeneration !== presetGeneration) ||
      (cfg.hp_friend_enabled && lastAllyPresetGeneration !== presetGeneration)
    )
      return "generation_pending";
    if (
      (cfg.hp_enabled && !loopHasPending(LOOP_ENEMY)) ||
      (cfg.hp_friend_enabled && !loopHasPending(LOOP_ALLY)) ||
      (cfg.hp_level_number_visible && !loopHasPending(LOOP_LEVEL))
    )
      return "loop_stopped";
    if (
      now - lastStyleReapplyAt >= STYLE_REAPPLY_WATCHDOG_MS &&
      hasEnemyStyleDrift()
    )
      return "style_drift";
    return "";
  }

  function wakeForPresetReplay(reason) {
    var now = _ts();
    if (canSkipPresetReplayWake(now)) {
      return;
    }
    lastSameRawEligibilityCheckAt = now;
    var wakeReason = presetReplayWakeReason(now);
    if (!wakeReason) {
      lastSameRawWakePanelGeneration = panelGeneration;
      return;
    }
    if (lastSameRawWakeAt && now - lastSameRawWakeAt < SAME_RAW_WAKE_MIN_MS) {
      return;
    }
    lastSameRawWakeAt = now;
    lastSameRawWakePanelGeneration = panelGeneration;
    settingsDirty = true;
    allySettingsDirty = true;
    settingsRefreshHoldUntil = 0;
    allySettingsRefreshHoldUntil = 0;
    lLvVis = null;
    requestCurrentRedBarRefresh();
    requestLoopKick(LOOP_ENEMY, 0.01);
    requestLoopKick(LOOP_ALLY, 0.01);
    requestLoopKick(LOOP_LEVEL, 0.01);
  }

  function normalizeScheduleDelay(delay, fallback) {
    var value = Number(delay);
    if (!isFinite(value) || value < 0) return fallback;
    return value;
  }

  function scheduleLoop(kind, delay, beforeRun) {
    if (!loopEnabled(kind)) return false;
    var safeDelay = normalizeScheduleDelay(delay, 0.05);
    var now = _ts();
    var dueAt = now + safeDelay * 1000;
    if (loopNextDueAt[kind] && loopNextDueAt[kind] <= dueAt) return false;
    loopNextDueAt[kind] = dueAt;
    var token = ++loopScheduleToken[kind];
    $.Schedule(safeDelay, function () {
      if (token !== loopScheduleToken[kind]) return;
      loopNextDueAt[kind] = 0;
      if (beforeRun) beforeRun();
      if (loopEnabled(kind)) runLoop(kind);
    });
    return true;
  }

  function markPresetApplied() {
    presetApplied = true;
    presetGeneration++;
    settingsDirty = true;
    allySettingsDirty = true;
    settingsRefreshHoldUntil = 0;
    allySettingsRefreshHoldUntil = 0;
    lLvVis = null;
    lastEnemyPresetGeneration = -1;
    lastAllyPresetGeneration = -1;
    invalidateRedBarResolverCache();
    handleRuntimeToggleState();
    requestLoopKick(LOOP_ENEMY);
    requestLoopKick(LOOP_ALLY);
    requestLoopKick(LOOP_LEVEL);
  }

  function applyPresetSnapshot(values) {
    if (!values) {
      return false;
    }
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
    refreshDerivedConfig();
    try {
      resetStyleStateForNewPanels();
    } catch (eReset) {}
    try {
      invalidateEnemyVisualCaches();
    } catch (eEnemy) {}
    requestCurrentRedBarRefresh();
    markPresetApplied();
    return true;
  }

  function tryApplySharedSnapshot() {
    var store = getSharedStore();
    var raw = "";
    if (store) {
      try {
        raw = String(store[SHARED_CFG_RAW_KEY] || "");
      } catch (e) {
        raw = "";
      }
    } else {
    }
    if (!raw) raw = readRootPresetSnapshot();
    if (!raw) return false;
    if (raw === sharedCfgRaw && presetApplied) {
      wakeForPresetReplay("shared_same_raw");
      return true;
    }
    var parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (eParse) {
      return false;
    }
    var values =
      parsed && typeof parsed === "object" ? parsed.values || parsed : null;
    if (!values || typeof values !== "object") {
      return false;
    }
    if (!applyPresetSnapshot(values)) {
      return false;
    }
    sharedCfgRaw = raw;
    return true;
  }

  function requestPresetSnapshot(reason) {
    var requestReason = String(reason || "overlay_request");
    try {
      $.DispatchEvent(
        EVENT_CHANNEL,
        JSON.stringify({
          magic_word: REQUEST_MAGIC,
          mod_title: "HP Colors",
          reason: requestReason,
        }),
      );
    } catch (e) {}
  }

  function schedulePresetRetry() {
    if (presetApplied) return;
    if (tryApplySharedSnapshot()) return;
    presetAttempts += 1;
    var fastRetry = presetAttempts <= PRESET_MAX_FAST_ATTEMPTS;
    var lateRetry = presetAttempts > PRESET_LATE_RETRY_AFTER_ATTEMPTS;
    var requestReason =
      presetAttempts === 1 ? "overlay_startup" : "overlay_retry";
    var shouldRequest = true;
    if (!fastRetry && lateRetry) {
      shouldRequest =
        presetAttempts === PRESET_LATE_RETRY_AFTER_ATTEMPTS + 1 ||
        (presetAttempts - PRESET_LATE_RETRY_AFTER_ATTEMPTS - 1) %
          PRESET_LATE_REQUEST_EVERY_ATTEMPTS ===
          0;
      if (shouldRequest) requestReason = "overlay_late_retry";
    }
    if (shouldRequest) requestPresetSnapshot(requestReason);
    $.Schedule(
      fastRetry
        ? PRESET_RETRY_SEC
        : lateRetry
          ? PRESET_LATE_RETRY_SEC
          : PRESET_SLOW_RETRY_SEC,
      schedulePresetRetry,
    );
  }

  function isIgnoredPresetEventPayload(payload) {
    return (
      typeof payload === "string" && payload.indexOf(SNAPSHOT_MAGIC) === -1
    );
  }

  function isDuplicatePresetPayload(payload) {
    return (
      presetApplied &&
      typeof payload === "string" &&
      payload === lastSnapshotPayload
    );
  }

  function wakeFromSharedPresetStore() {
    var store = getSharedStore();
    var storeRaw = "";
    try {
      storeRaw = store ? String(store[SHARED_CFG_RAW_KEY] || "") : "";
    } catch (eStoreRaw) {
      storeRaw = "";
    }
    if (!storeRaw) storeRaw = readRootPresetSnapshot();
    if (!storeRaw) return false;
    if (storeRaw === sharedCfgRaw) {
      wakeForPresetReplay("event_store_same_raw");
      return true;
    }
    return tryApplySharedSnapshot();
  }

  function parsePresetEventPayload(payload) {
    try {
      return typeof payload === "string" ? JSON.parse(payload) : payload;
    } catch (eParseEvent) {
      return null;
    }
  }

  function getPresetEventRaw(data) {
    var raw = typeof data.values_raw === "string" ? data.values_raw : "";
    if (raw) return raw;
    try {
      return JSON.stringify(data.values);
    } catch (eRaw) {
      return "";
    }
  }

  function applyPresetEventPayload(payload) {
    if (isDuplicatePresetPayload(payload)) {
      wakeForPresetReplay("event_duplicate_payload");
      return;
    }
    if (presetApplied && wakeFromSharedPresetStore()) return;

    var data = parsePresetEventPayload(payload);
    if (!data || data.magic_word !== SNAPSHOT_MAGIC) return;
    if (data.mod_title && data.mod_title !== "HP Colors") return;
    if (!data.values || typeof data.values !== "object") return;

    var raw = getPresetEventRaw(data);
    if (raw && raw === sharedCfgRaw && presetApplied) {
      if (typeof payload === "string") lastSnapshotPayload = payload;
      wakeForPresetReplay("event_payload_same_raw");
      return;
    }
    if (applyPresetSnapshot(data.values) && raw) {
      sharedCfgRaw = raw;
      if (typeof payload === "string") lastSnapshotPayload = payload;
    }
  }

  try {
    $.RegisterForUnhandledEvent(EVENT_CHANNEL, function (payload) {
      if (isIgnoredPresetEventPayload(payload)) return;
      try {
        applyPresetEventPayload(payload);
      } catch (e) {}
    });
  } catch (e) {}

  // â”€â”€ Color helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function rgbToHex(c) {
    function cb(v) {
      v = +v | 0;
      return v < 0 ? 0 : v > 255 ? 255 : v;
    }
    return (
      "#" +
      ((1 << 24) | (cb(c[0]) << 16) | (cb(c[1]) << 8) | cb(c[2]))
        .toString(16)
        .slice(1)
    );
  }

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
    if (m) return rgbToHex([m[1], m[2], m[3]]);

    return trimmed;
  }

  function getHighColor() {
    if (!cfg.hp_team_colors) return cfg.hp_color_high;
    return tid === 2 ? TEAM2_HIGH : TEAM1_HIGH;
  }

  function getPulseBarColor(baseColor, hp, threshold) {
    if (!cfg.hp_pulse_color_enabled) return baseColor;
    if ((cfg.hp_pulse_color_mode | 0) === 1) {
      var depth = clampNum((threshold - hp) / Math.max(1, threshold), 0, 1, 0);
      return ipHex(baseColor, cfg.hp_pulse_color, depth);
    }
    return cfg.hp_pulse_color;
  }

  function getTextColor(hp, low, high) {
    if (cfg.hp_text_color_mode) {
      if (hp <= low) return cfg.hp_text_color_low;
      if (hp <= high) return cfg.hp_text_color_mid;
      return cfg.hp_text_color_high;
    }
    if (hp <= low) return cfg.hp_color_low;
    if (hp <= high) return cfg.hp_color_mid;
    return getHighColor();
  }

  function getGradientTextColor(hp, low, high) {
    if (cfg.hp_text_color_mode) {
      if (hp <= low) return cfg.hp_text_color_low;
      if (hp <= high) {
        return ipHex(
          cfg.hp_text_color_low,
          cfg.hp_text_color_mid,
          (hp - low) / dc.denomMid,
        );
      }
      return ipHex(
        cfg.hp_text_color_mid,
        cfg.hp_text_color_high,
        (hp - high) / dc.denomHigh,
      );
    }
    if (hp <= low) return cfg.hp_color_low;
    if (hp <= high) {
      return ipHex(
        cfg.hp_color_low,
        cfg.hp_color_mid,
        (hp - low) / dc.denomMid,
      );
    }
    return ipHex(cfg.hp_color_mid, getHighColor(), (hp - high) / dc.denomHigh);
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
  var nextStyleDriftCheckAt = 0;
  var styleDriftCleanFrames = 0;
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

  function vPanel(p) {
    try {
      return !!(p && (!p.IsValid || p.IsValid()));
    } catch (e) {}
    return false;
  }

  function invalidateRedBarResolverCache() {
    redBarResolverPanel = null;
    redBarResolverMode = "";
    redBarResolverAt = 0;
    lastRedBarResolveRejectFlags = 0;
  }

  function redBarResolveCacheTtlMs(mode) {
    var now = _ts();
    if (currentRbRefreshUntil && now <= currentRbRefreshUntil) return 80;
    if (mode === "friend") return 160;
    if (stableCurrentRedBarFrames >= 8 || noParentWidthFrames >= 8) return 300;
    return 120;
  }

  function redBarCandidateMatchesMode(panel, mode) {
    if (!vPanel(panel)) return false;
    if (mode === "any") return true;
    var flags = readTeamBitsFrom(panel, SCAN_PARENT_DEPTH_LIMIT) & 255;
    if (mode === "friend") {
      if (isFriendlyTargetHealthbar(flags)) return true;
      lastRedBarResolveRejectFlags = flags;
      return false;
    }
    if (mode === "enemy") {
      if (isEnemyTargetHealthbar(flags)) return true;
      return false;
    }
    return true;
  }

  function resolveRedBar(mode) {
    mode = mode || "any";
    lastRedBarResolveRejectFlags = 0;
    var now = _ts();
    if (
      redBarResolverMode === mode &&
      vPanel(redBarResolverPanel) &&
      now - redBarResolverAt <= redBarResolveCacheTtlMs(mode)
    ) {
      return redBarResolverPanel;
    }

    var current = ctx.FindChildTraverse(ID_UNIT_HEALTHBAR_LAGGING);
    if (redBarCandidateMatchesMode(current, mode)) {
      redBarResolverPanel = current;
      redBarResolverMode = mode;
      redBarResolverAt = now;
      return current;
    }
    if (vPanel(us)) {
      var nested = us.FindChildTraverse(ID_UNIT_HEALTHBAR_LAGGING);
      if (redBarCandidateMatchesMode(nested, mode)) {
        redBarResolverPanel = nested;
        redBarResolverMode = mode;
        redBarResolverAt = now;
        return nested;
      }
    }
    redBarResolverPanel = null;
    redBarResolverMode = mode;
    redBarResolverAt = now;
    return null;
  }

  function fRB() {
    return resolveRedBar("any");
  }

  function isPanelCacheReady() {
    var counterReady = !cfg.hp_counter_visible || vPanel(hc);
    return (
      vPanel(us) &&
      counterReady &&
      vPanel(bg) &&
      vPanel(pl) &&
      vPanel(lb) &&
      vPanel(lbp) &&
      vPanel(nm)
    );
  }

  function setNextCacheProbe(now) {
    nextCacheProbeAt = now + (att < 8 ? 150 : att < 24 ? 500 : 1500);
  }

  function probePanelCache(now) {
    att++;
    if (!vPanel(us)) us = ctx.FindChildTraverse(ID_UNIT_STATUS);
    if (!us) {
      setNextCacheProbe(now);
      return 0;
    }
    if (!vPanel(hc) && (cfg.hp_counter_visible || lVis !== "collapse"))
      hc = us.FindChildTraverse("hp_counter");
    if (cfg.hp_counter_visible && !vPanel(hca))
      hca = us.FindChildTraverse("hp_counter_anchor");
    if (!vPanel(bg)) bg = us.FindChildTraverse(ID_UNIT_HEALTHBAR_BG);
    if (!vPanel(pl)) pl = us.FindChildTraverse(ID_UNIT_HEALTHBAR_PIP_LABEL);
    if (!vPanel(lb)) lb = us.FindChildTraverse(ID_UNIT_HEALTHBAR_LAGGING);
    if (cfg.hp_kill_zone_enabled && !vPanel(kz))
      kz = us.FindChildTraverse("hp_kill_zone_marker");
    if (!vPanel(ui)) ui = us.FindChildTraverse(ID_UNIT_ULT_READY_ICON);
    if (!vPanel(ihc)) ihc = us.FindChildTraverse(ID_INFO_HEALTH_CONTAINER);
    if (!vPanel(uhc)) uhc = us.FindChildTraverse(ID_UNIT_HEALTHBAR_CONTAINER);
    if (!vPanel(nm)) nm = ctx.FindChildTraverse(ID_UNIT_NAME);
    if (vPanel(ui)) _uiMissAt = 0;
    if (lb && !vPanel(lbp)) lbp = lb.GetParent();
    if (pl && lb && lbp) {
      cached = 1;
      att = 0;
      nextCacheProbeAt = 0;
      return 1;
    }
    setNextCacheProbe(now);
    return 0;
  }

  function tryCache() {
    if (cached) {
      if (isPanelCacheReady()) return 1;
      cached = 0;
      nextCacheProbeAt = 0;
    }
    var now = _ts();
    if (nextCacheProbeAt && now < nextCacheProbeAt) return 0;
    return probePanelCache(now);
  }

  function isInvalidPanel(panel) {
    try {
      return !!(panel && panel.IsValid && !panel.IsValid());
    } catch (e) {}
    return false;
  }

  function resetCachedPanelRefsIfInvalid() {
    if (!cached && !rb) return;
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
      return;
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
    cached = 0;
    att = 0;
    nextCacheProbeAt = 0;
    lastRbPanel =
      lastCpPanel =
      lastLbpPanel =
      lastHcPanel =
      lastBgPanel =
      lastKzPanel =
      lastPlPanel =
        null;
    lastUnitName = "";
    invalidateEnemyVisualCaches();
    settingsDirty = true;
    allySettingsDirty = true;
    invalidateRedBarResolverCache();
    requestCurrentRedBarRefresh();
  }

  function isRedBarPanelId(id) {
    return id === ID_UNIT_HEALTHBAR_LAGGING;
  }

  function panelActualWidth(panel) {
    try {
      return panel && panel.actuallayoutwidth !== undefined
        ? panel.actuallayoutwidth | 0
        : 0;
    } catch (e) {}
    return 0;
  }

  function panelParent(panel) {
    try {
      return panel && panel.GetParent ? panel.GetParent() : null;
    } catch (e) {}
    return null;
  }

  function panelParentWidth(panel) {
    return panelActualWidth(panelParent(panel));
  }

  function currentRedBarIdleRescanMs() {
    if (noParentWidthFrames >= 8) return CURRENT_RB_IDLE_RESCAN_SLOW_MS;
    if (noParentWidthFrames >= 3) return CURRENT_RB_IDLE_RESCAN_MID_MS;
    if (stableCurrentRedBarFrames >= 8) return CURRENT_RB_IDLE_RESCAN_SLOW_MS;
    if (stableCurrentRedBarFrames >= 3) return CURRENT_RB_IDLE_RESCAN_MID_MS;
    return CURRENT_RB_IDLE_RESCAN_MS;
  }

  function refreshRedBarFromParentChildren(now, force) {
    if (!force) {
      var inRefreshWindow =
        currentRbRefreshUntil && now <= currentRbRefreshUntil;
      if (nextCurrentRbChildProbeAt && now < nextCurrentRbChildProbeAt)
        return false;
      var childProbeMs = inRefreshWindow
        ? CURRENT_RB_RESCAN_MS
        : currentRedBarIdleRescanMs();
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
    var bestScore = getRedBarCandidateScore(rb, -1);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (!vPanel(child)) continue;
      var id = "";
      try {
        id = String(child.id || "");
      } catch (eId) {
        id = "";
      }
      if (!isRedBarPanelId(id)) continue;
      var score = getRedBarCandidateScore(child, i);
      if (score > bestScore) {
        best = child;
        bestScore = score;
      }
    }
    if (!best || best === rb) return false;
    return adoptCurrentRedBar(best);
  }

  function readTeamBitsFrom(panel, maxDepth) {
    var t = 0,
      f = 0,
      d = 0,
      c = panel;
    var limit = maxDepth || SCAN_PARENT_DEPTH_LIMIT;
    while (c && d < limit) {
      if (c.BHasClass) {
        if (!t) {
          if (c.BHasClass(CLASS_TEAM2)) t = 2;
          else if (c.BHasClass(CLASS_TEAM1)) t = 1;
        }
        if (!(f & 1) && c.BHasClass(CLASS_ENEMY)) f |= 1;
        if (!(f & 2) && c.BHasClass(CLASS_TEAM_NEUTRAL)) f |= 2;
        if (
          !(f & 4) &&
          (c.BHasClass("building") ||
            c.BHasClass("destroyable_building") ||
            c.BHasClass("guardian") ||
            c.BHasClass("boss_tier1") ||
            c.BHasClass("boss_tier2") ||
            c.BHasClass("boss_tier_01") ||
            c.BHasClass("boss_tier_02") ||
            c.BHasClass("boss_tier_01_brazier_guardian") ||
            c.BHasClass("boss_barracks"))
        )
          f |= 4;
        if (!(f & 8) && c.BHasClass(CLASS_FRIEND)) f |= 8;
        if (t && f & (1 | 2 | 4 | 8)) break;
      }
      if (!c.GetParent) break;
      c = c.GetParent();
      d++;
    }
    return (t << 8) | f;
  }

  function getRedBarCandidateScore(panel, index) {
    if (!vPanel(panel)) return -1;
    var ownWidth = panelActualWidth(panel);
    var parentWidth = panelParentWidth(panel);
    var usableParent = parentWidth > 0;
    var score = usableParent ? 120 : -200;
    var flags = readTeamBitsFrom(panel, SCAN_PARENT_DEPTH_LIMIT) & 255;
    if (flags & 1 && !(flags & 2)) score += usableParent ? 700 : 120;
    else if (flags & 8) score -= 160;
    else if (flags & 2) score -= 120;
    else if (!(flags & (1 | 2 | 4 | 8))) score -= 40;
    if (panel === rb) score += usableParent ? 80 : -40;
    if (ownWidth > 0) score += 40;
    if (parentWidth > 0) score += Math.min(parentWidth, 400) / 20;
    if (index >= 0) score += Math.min(index, 20);
    return score;
  }

  function resetEnemyScanCache() {
    tid = 0;
    fl = 0;
    _lastScanAt = 0;
    _lastScanPanel = null;
  }

  function adoptCurrentRedBar(panel) {
    rb = panel;
    lb = panel;
    cp = panel && panel.GetParent ? panel.GetParent() : null;
    lbp = cp;
    cached = 0;
    att = 0;
    nextCacheProbeAt = 0;
    invalidateRedBarResolverCache();
    resetEnemyScanCache();
    resetStyleStateForNewPanels();
    lW = -1;
    lPW = -1;
    lHp = -1;
    stableCurrentRedBarFrames = 0;
    colorGeneration = -1;
    resetStyleDriftBackoff();
    return true;
  }

  function requestCurrentRedBarRefresh() {
    var now = _ts();
    var until = now + CURRENT_RB_REFRESH_WINDOW_MS;
    if (currentRbRefreshUntil && now <= currentRbRefreshUntil) {
      if (until > currentRbRefreshUntil) currentRbRefreshUntil = until;
      return;
    }
    currentRbRefreshUntil = until;
    nextCurrentRbProbeAt = 0;
    nextCurrentRbChildProbeAt = 0;
  }

  function shouldProbeCurrentRedBar(now) {
    if (currentRbRefreshUntil && now <= currentRbRefreshUntil) return true;
    if (noParentWidthFrames) return true;
    if (nonEnemyExitFrames && nonEnemyExitFrames < 4) return true;
    if (buildingNotEnemyExitFrames && buildingNotEnemyExitFrames < 4)
      return true;
    if (fl & 2) return nonEnemyExitFrames < 4;
    if (fl & 4)
      return cfg.hp_skip_buildings
        ? buildingNotEnemyExitFrames < 4
        : nonEnemyExitFrames < 4;
    if (!(fl & 1)) return nonEnemyExitFrames < 4;
    return false;
  }

  function refreshCurrentRedBarRef(now, force) {
    if (!force) {
      var inRefreshWindow =
        currentRbRefreshUntil && now <= currentRbRefreshUntil;
      if (nextCurrentRbProbeAt && now < nextCurrentRbProbeAt) return false;
      nextCurrentRbProbeAt =
        now +
        (inRefreshWindow ? CURRENT_RB_RESCAN_MS : currentRedBarIdleRescanMs());
    }
    var current = force ? resolveRedBar("any") : resolveRedBar("enemy");
    if (!vPanel(current) || current === rb) return false;
    var currentParentWidth = panelParentWidth(current);
    var oldParentWidth = panelParentWidth(rb);
    if (currentParentWidth <= 0 && oldParentWidth > 0) {
      return false;
    }
    if (currentParentWidth <= 0 && !force) return false;
    return adoptCurrentRedBar(current);
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
      ihc = us.FindChildTraverse(ID_INFO_HEALTH_CONTAINER);
    if (ihc && ihc.style && lIhcMarginTop !== nextMargin) {
      try {
        ihc.style.marginTop = nextMargin;
        lIhcMarginTop = nextMargin;
      } catch (eMargin) {
        lIhcMarginTop = null;
      }
    }

    if ((!uhc || !uhc.IsValid()) && us && us.IsValid())
      uhc = us.FindChildTraverse(ID_UNIT_HEALTHBAR_CONTAINER);
    var heightPx =
      dc.healthbarHeight || Math.round(clampNum(cfg.hp_healthbar_height, 0, 230, 130));
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
  var SCAN_PARENT_DEPTH_LIMIT = 24;

  function scan(p) {
    var now = _ts();
    if (p === _lastScanPanel && now - _lastScanAt < SCAN_CACHE_TTL) return;
    var bits = readTeamBitsFrom(p, SCAN_PARENT_DEPTH_LIMIT);
    tid = bits >> 8;
    fl = bits & 255;
    if (tid && fl & 8) knownFriendlyTeamId = tid;
    _lastScanAt = now;
    _lastScanPanel = p;
  }

  function isFriendlyTargetHealthbar(flags) {
    return !!(flags & 8);
  }

  function isFriendlyBuildingTarget(flags) {
    return !!(flags & 4 && (flags & 8 || (tid && tid === knownFriendlyTeamId)));
  }

  function isEnemyBuildingTarget(flags) {
    return !!(
      flags & 4 &&
      !(flags & 2) &&
      tid &&
      !isFriendlyBuildingTarget(flags)
    );
  }

  function isEnemyTargetHealthbar(flags) {
    if (flags & 2) return false;
    if (cfg.hp_friend_enabled && isFriendlyTargetHealthbar(flags)) return false;
    if (flags & 1) return true;
    return isEnemyBuildingTarget(flags);
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
  var ignoredVisualSig = "";

  function sBC(c) {
    if (lColRaw === c && lCol !== null) return;
    var next = normalizeWashColor(c);
    if (!next) next = "";
    lColRaw = c;
    if (lCol !== next && rb) {
      try {
        rb.style.washColor = next;
        lCol = next;
      } catch (e) {
        lCol = null;
      }
    }
  }
  function sUC(c) {
    if (!cfg.hp_ult_color_enabled) {
      var rawOffColor = cfg.hp_ult_color_custom || CSS_TEAM_ENEMY_COLOR;
      if (!ui || !ui.IsValid()) {
        var nowOff = _ts();
        if (_uiMissAt && nowOff - _uiMissAt < UI_MISS_TTL_MS) return;
        ui = ctx.FindChildTraverse(ID_UNIT_ULT_READY_ICON);
        if (ui && ui.IsValid()) _uiMissAt = 0;
        else {
          _uiMissAt = nowOff;
          return;
        }
      }
      if (!ui || !ui.style) return;
      if (lUltRaw === rawOffColor && lUlt) return;
      var offColor = normalizeWashColor(rawOffColor) || CSS_TEAM_ENEMY_COLOR;
      lUltRaw = rawOffColor;
      if (lUlt !== offColor) {
        try {
          ui.style.washColor = offColor;
          lUlt = offColor;
        } catch (e) {
          lUlt = null;
        }
      }
      return;
    }
    if (!ui || !ui.IsValid()) {
      var now = _ts();
      if (_uiMissAt && now - _uiMissAt < UI_MISS_TTL_MS) return;
      ui = ctx.FindChildTraverse(ID_UNIT_ULT_READY_ICON);
      if (ui && ui.IsValid()) _uiMissAt = 0;
      else {
        _uiMissAt = now;
        return;
      }
    }
    if (!ui || !ui.style) return;
    if (lUltRaw === c && lUlt) return;
    var next = normalizeWashColor(c) || CSS_TEAM_ENEMY_COLOR;
    lUltRaw = c;
    if (lUlt !== next) {
      try {
        ui.style.washColor = next;
        lUlt = next;
      } catch (e) {
        lUlt = null;
      }
    }
  }
  function sTC(c) {
    if (lTxtRaw === c && lTxt) return;
    var next = normalizeWashColor(c);
    if (!hc || !hc.style) return;
    lTxtRaw = c;
    if (lTxt !== next) {
      try {
        hc.style.washColor = next;
        lTxt = next;
      } catch (e) {
        lTxt = null;
      }
    }
  }

  function getIgnoredTargetColor() {
    if (fl & 1 && !(fl & 2)) return "";
    if (isEnemyBuildingTarget(fl)) return CSS_TEAM_ENEMY_COLOR;
    if (isFriendlyBuildingTarget(fl)) return WHITE_WASH;
    if (fl & (2 | 4)) return "#5BEFB5";
    if (fl & 8) return CSS_TEAM_FRIEND_COLOR;
    if (tid === 2) return CSS_TEAM2_COLOR;
    if (tid === 1) return CSS_TEAM1_COLOR;
    return CSS_TEAM_ENEMY_COLOR;
  }


  var _allyScanPanel = null,
    _allyScanAt = 0,
    _allyScanFlags = 0;
  var ALLY_SCAN_CACHE_TTL = 160;

  function resetAllyState(panel, resetColor) {
    var target = panel || allyOwnedPanel;
    var flags =
      target && target.IsValid && target.IsValid() ? scanAllyFlags(target) : 0;
    allyColorActive = false;
    noAllyParentWidthFrames = 0;
    lColA = null;
    lColARaw = null;
    lWA = -1;
    lPWA = -1;
    lHpA = -1;
    sfcA = 0;
    nextAllyStyleDriftCheckAt = 0;
    _allyScanPanel = null;
    _allyScanAt = 0;
    _allyScanFlags = 0;
    syncAllyPulse(target, false);
    if (
      resetColor &&
      target &&
      target === allyOwnedPanel &&
      isConfirmedAllyHealthbar(flags) &&
      target.style
    ) {
      var color = flags & 4 ? WHITE_WASH : CSS_TEAM_FRIEND_COLOR;
      try {
        target.style.washColor = color;
        lColA = normalizeWashColor(color);
        lColARaw = color;
      } catch (e) {
        lColA = null;
        lColARaw = null;
      }
    }
  }

  function scanAllyFlags(panel) {
    var now = _ts();
    if (panel === _allyScanPanel && now - _allyScanAt < ALLY_SCAN_CACHE_TTL) {
      return _allyScanFlags;
    }
    var flags = readTeamBitsFrom(panel, SCAN_PARENT_DEPTH_LIMIT) & 255;
    _allyScanPanel = panel;
    _allyScanAt = now;
    _allyScanFlags = flags;
    return flags;
  }

  function isConfirmedAllyHealthbar(flags) {
    return isFriendlyTargetHealthbar(flags);
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
  function sHBV(visible) {
    if (!bg || !bg.style) return;
    // Always keep visibility 'visible', only change opacity
    // This ensures HP bar width updates work even when "hidden"
    if (lBgVis !== "visible") {
      bg.style.visibility = "visible";
      lBgVis = "visible";
    }
    var nextOp = visible ? "1.0" : "0.01";
    if (lBgOp !== nextOp) {
      bg.style.opacity = nextOp;
      lBgOp = nextOp;
    }
  }

  var lKzVis = null,
    lKzX = null,
    lKzW = null,
    lKzColor = null,
    lKzAppliedColor = null,
    lKzOp = null,
    lKzZi = null,
    lKzSig = null;

  function invalidateEnemyVisualCaches() {
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
    lKzVis =
      lKzX =
      lKzW =
      lKzColor =
      lKzAppliedColor =
      lKzOp =
      lKzZi =
      lKzSig =
        null;
    lSH = -1;
    lSM = -1;
    lVis = null;
    ignoredVisualSig = "";
    resetStyleDriftBackoff();
  }

  function hasEnemyBarStyleDrift() {
    if (!rb || !rb.style || !lCol) return false;
    try {
      return normalizeWashColor(String(rb.style.washColor || "")) !== lCol;
    } catch (e) {}
    return false;
  }

  function hasAllyBarStyleDrift(panel) {
    if (!panel || !panel.style || !lColA) return false;
    try {
      return normalizeWashColor(String(panel.style.washColor || "")) !== lColA;
    } catch (e) {}
    return false;
  }

  function hasEnemyStyleDrift() {
    if (hasEnemyBarStyleDrift()) return true;
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
  }

  function styleDriftCheckDelayMs() {
    if (styleDriftCleanFrames >= 8) return STYLE_DRIFT_CHECK_SLOW_MS;
    if (styleDriftCleanFrames >= 3) return STYLE_DRIFT_CHECK_MID_MS;
    return STYLE_DRIFT_CHECK_MS;
  }

  function resetStyleDriftBackoff() {
    styleDriftCleanFrames = 0;
    nextStyleDriftCheckAt = 0;
  }

  function sKZ(show, parentWidth) {
    if (
      (!kz || !vPanel(kz)) &&
      show &&
      cfg.hp_kill_zone_enabled &&
      us &&
      us.FindChildTraverse
    ) {
      try {
        kz = us.FindChildTraverse("hp_kill_zone_marker");
      } catch (eFindKz) {}
    }
    if (!kz || !kz.style) return;
    var barHidden = !bg || !bg.style || lBgVis !== "visible" || lBgOp !== "1.0";
    if (!show || !cfg.hp_kill_zone_enabled || parentWidth <= 0 || barHidden) {
      lKzSig = null;
      if (lKzVis !== "collapse") {
        kz.style.visibility = "collapse";
        lKzVis = "collapse";
      }
      if (lKzOp !== "0") {
        try {
          kz.style.opacity = "0";
          lKzOp = "0";
        } catch (eHide) {
          lKzOp = null;
        }
      }
      return;
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
      lKzOp === "0.95" &&
      lKzZi === "1000" &&
      lKzX === posStr &&
      lKzW === widthStr &&
      lKzAppliedColor === color
    ) {
      return;
    }
    lKzSig = sig;

    if (lKzVis !== "visible") {
      kz.style.visibility = "visible";
      lKzVis = "visible";
    }
    if (lKzOp !== "0.95") {
      try {
        kz.style.opacity = "0.95";
        lKzOp = "0.95";
      } catch (eOp) {
        lKzOp = null;
      }
    }
    if (lKzZi !== "1000") {
      try {
        kz.style.zIndex = "1000";
        lKzZi = "1000";
      } catch (eZi) {
        lKzZi = null;
      }
    }
    if (lKzX !== posStr) {
      kz.style.marginLeft = posStr;
      lKzX = posStr;
    }
    if (lKzW !== widthStr) {
      kz.style.width = widthStr;
      lKzW = widthStr;
    }
    if (lKzAppliedColor !== color) {
      try {
        kz.style.backgroundColor = color;
        lKzAppliedColor = color;
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

  function resetIgnoredTargetVisuals(defaultColor) {
    var beforeSig =
      String(defaultColor || "") +
      "|" +
      lVis +
      "|" +
      lKzVis +
      "|" +
      lKzOp +
      "|" +
      lBgVis +
      "|" +
      lBgOp +
      "|" +
      pulse;
    if (ignoredVisualSig === beforeSig && !pulse) return;
    clearPulse();
    sHCV(false);
    sKZ(false, 0);
    sBC(defaultColor || "");
    sTC(WHITE_WASH);
    sHBV(true);
    ignoredVisualSig =
      String(defaultColor || "") +
      "|" +
      lVis +
      "|" +
      lKzVis +
      "|" +
      lKzOp +
      "|" +
      lBgVis +
      "|" +
      lBgOp +
      "|" +
      pulse;
  }

  function parkEnemyLoopForFriendlyTarget() {
    clearPulse();
    sHCV(false);
    sKZ(false, 0);
    sHBV(true);
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
      pl === lastPlPanel &&
      unitName === lastUnitName
    )
      return;
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
    lastEnemyPresetGeneration = -1;
    lastAllyPresetGeneration = -1;
    panelBornAt = _ts();
    lastStyleReapplyAt = panelBornAt;
    invalidateEnemyVisualCaches();
    clearPulse();
    allyColorActive = false;
    allyOwnedPanel = null;
    lastAllyPanel = null;
    ihc = null;
    rbA = null;
    cpA = null;
    lColA = null;
    lWA = -1;
    lPWA = -1;
    lHpA = -1;
    sfcA = 0;
    noAllyParentWidthFrames = 0;
    allyUnconfirmedFrames = 0;
    lLvVis = null;
    lW = -1;
    lPW = -1;
    lHp = -1;
    pPct = -1;
    sFC = 0;
    noParentWidthFrames = 0;
    nonEnemyExitFrames = 0;
    neutralExitFrames = 0;
    buildingNotEnemyExitFrames = 0;
    stableCurrentRedBarFrames = 0;
    lCounterLowMode = false;
    lastEnemySignature = "";
    settingsDirty = true;
    allySettingsDirty = true;
    settingsRefreshHoldUntil = 0;
    allySettingsRefreshHoldUntil = 0;
    requestCurrentRedBarRefresh();
  }

  function cleanupEnemyFeature() {
    clearPulse();
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
    sKZ(false, 0);
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
    neutralExitFrames = 0;
    buildingNotEnemyExitFrames = 0;
    stableCurrentRedBarFrames = 0;
    resetStyleDriftBackoff();
  }

  function cleanupLevelNumberVisibility() {
    if (!wr || !wr.IsValid()) {
      if (!lc || !lc.IsValid()) lc = ctx.FindChildTraverse(ID_UNIT_STATUS);
      if (lc) {
        var current = lc;
        while (current) {
          if (current.BHasClass && current.BHasClass(CLASS_ENEMY)) {
            wr = current;
            break;
          }
          if (!current.GetParent) break;
          current = current.GetParent();
        }
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

  function stopLoop(kind, cleanup) {
    if (cleanup) {
      if (kind === LOOP_ENEMY) cleanupEnemyFeature();
      else if (kind === LOOP_ALLY) {
        resetAllyState(allyOwnedPanel, true);
        allyOwnedPanel = null;
      }
      else cleanupLevelNumberVisibility();
    }
    loopRunning[kind] = false;
    loopWakeQueued[kind] = false;
    loopNextDueAt[kind] = 0;
    loopScheduleToken[kind]++;
  }

  function handleRuntimeToggleState() {
    refreshDerivedConfig();
    if (cfg.hp_enabled) startLoop(LOOP_ENEMY);
    else stopLoop(LOOP_ENEMY, true);

    if (cfg.hp_friend_enabled) startLoop(LOOP_ALLY);
    else stopLoop(LOOP_ALLY, true);

    if (cfg.hp_level_number_visible) startLoop(LOOP_LEVEL);
    else stopLoop(LOOP_LEVEL, true);

    if (!cfg.hp_counter_visible) {
      sHCV(false);
      lSH = -1;
      lSM = -1;
    }
    if (!cfg.hp_pulse_enabled && pulse) clearPulse();
    if (pulse) {
      lPD = null;
      lPI = -1;
      syncEnemyPulse(true, _ts());
    } else if (!cfg.hp_pulse_text_enabled) {
      lCounterLowMode = false;
      sHCS(false);
    }
    if (!cfg.hp_friend_pulse_enabled && pulseA) syncAllyPulse(rbA, false);
    if (!cfg.hp_kill_zone_enabled) sKZ(false, 0);
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
    sHBV(!isEnemy || !!cfg.hp_bg_visible);
    if (cfg.hp_counter_visible) sHCS(lCounterLowMode);
    else sHCV(false);
    applyLayoutSettings();
    lastStyleReapplyAt = _ts();
    resetStyleDriftBackoff();
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

  function isEnemyPaintWarmup(hp, prevHp, now) {
    return !!(
      hp <= dc.low &&
      panelBornAt &&
      now - panelBornAt < 900 &&
      (prevHp < 0 || (prevHp <= dc.low && hp > prevHp))
    );
  }

  function updateEnemyCounter(hp, shouldPulse) {
    var counterVisible = !!cfg.hp_counter_visible;
    var fmt = cfg.hp_counter_format | 0;
    var txt = "";
    if (pl) {
      try {
        var pipVis = cfg.hp_pip_visible ? "visible" : "collapse";
        if (lPipVis !== pipVis) {
          pl.style.visibility = pipVis;
          lPipVis = pipVis;
        }
        if (counterVisible && fmt !== 1)
          txt = pl.text || pl.GetAttributeString("text", "") || "";
      } catch (e) {
        txt = "";
        lPipVis = null;
      }
    }
    if (!counterVisible) {
      sHCV(false);
      return;
    }
    if (!lb || !lbp) return;
    if (fmt === 1) {
      uHT(hp, 100, shouldPulse);
      return;
    }
    var bw = lb.actuallayoutwidth || 0;
    var bpw = lbp.actuallayoutwidth || 0;
    var ratio = bpw > 0 ? bw / bpw : 0;
    var mx = pMax(txt);
    uHT(ratio >= 0.97 ? mx : Math.round(mx * ratio), mx, shouldPulse);
  }

  function paintEnemyHealthState(hp, prevHp, now, shouldPulse) {
    var low = dc.low;
    var high = dc.high;
    var pulseThresh = dc.pulseThreshold;
    var sc = 0.15;
    var cl;
    var textCol;
    sHBV(shouldPulse && cfg.hp_pulse_hide_bar ? false : !!cfg.hp_bg_visible);
    if (isEnemyPaintWarmup(hp, prevHp, now)) {
      var warmupCol = getHighColor();
      clearPulse();
      sBC(warmupCol);
      sUC(warmupCol);
      sTC(getTextColor(100, low, high));
      return -1;
    }
    if (hp <= low) {
      cl = cfg.hp_color_low;
      textCol =
        cfg.hp_mode === 1
          ? cfg.hp_text_color_mode
            ? cfg.hp_text_color_low
            : cfg.hp_color_low
          : getTextColor(hp, low, high);
    } else {
      var highCol = getHighColor();
      if (hp <= high) {
        cl =
          cfg.hp_mode === 1
            ? ipHex(
                cfg.hp_color_low,
                cfg.hp_color_mid,
                (hp - low) / dc.denomMid,
              )
            : cfg.hp_color_mid;
      } else {
        cl =
          cfg.hp_mode === 1
            ? ipHex(cfg.hp_color_mid, highCol, (hp - high) / dc.denomHigh)
            : highCol;
        if (sFC >= 5)
          sc = ENEMY_IDLE_BACKOFF[Math.min(Math.floor((sFC - 5) / 5), 3)];
      }
      textCol =
        cfg.hp_mode === 1
          ? getGradientTextColor(hp, low, high)
          : getTextColor(hp, low, high);
    }
    var barColor = shouldPulse ? getPulseBarColor(cl, hp, pulseThresh) : cl;
    sBC(barColor);
    sUC(barColor);
    sTC(textCol);
    return sc;
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
    neutralExitFrames = 0,
    buildingNotEnemyExitFrames = 0,
    stableCurrentRedBarFrames = 0;

  // â”€â”€ Main poll loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function gL() {
    loopRunning[LOOP_ENEMY] = true;
    try {
      if (!cfg.hp_enabled) {
        stopLoop(LOOP_ENEMY, true);
        return;
      }

      var now = _ts();
      var reboundCurrentRb = false;
      resetCachedPanelRefsIfInvalid();
      if (!vPanel(rb)) {
        if (!nextRbProbeAt || now >= nextRbProbeAt) {
          rb = fRB();
          nextRbProbeAt = rb ? 0 : now + 150;
        }
        if (!rb) {
          scheduleLoop(LOOP_ENEMY, 0.15);
          return;
        }
      } else {
        if (shouldProbeCurrentRedBar(now))
          reboundCurrentRb = refreshCurrentRedBarRef(now, false);
      }
      if (!cached && !tryCache()) {
        scheduleLoop(LOOP_ENEMY, 0.15);
        return;
      }
      if (rb.GetParent) {
        var p = rb.GetParent();
        if (cp !== p) cp = p;
      }
      if (!reboundCurrentRb && shouldProbeCurrentRedBar(now))
        refreshRedBarFromParentChildren(now, false);
      resetStyleStateForNewPanels();

      scan(rb);
      var isEnemy = isEnemyTargetHealthbar(fl);
      if (lastEnemyPresetGeneration !== presetGeneration) {
        lastEnemyPresetGeneration = presetGeneration;
        settingsDirty = true;
        settingsRefreshHoldUntil = 0;
        invalidateEnemyVisualCaches();
      }
      var enemySignature = tid + ":" + fl;
      if (enemySignature !== lastEnemySignature) {
        lastEnemySignature = enemySignature;
        invalidateEnemyVisualCaches();
        settingsDirty = true;
        settingsRefreshHoldUntil = now;
        allySettingsDirty = true;
        allySettingsRefreshHoldUntil = now;
        lLvVis = null;
        requestCurrentRedBarRefresh();
      }
      if (cfg.hp_skip_buildings && fl & 4) {
        buildingNotEnemyExitFrames++;
        nonEnemyExitFrames = 0;
        if (isFriendlyTargetHealthbar(fl) || isFriendlyBuildingTarget(fl)) {
          resetIgnoredTargetVisuals(WHITE_WASH);
          if (cfg.hp_friend_enabled) parkEnemyLoopForFriendlyTarget();
        } else {
          resetIgnoredTargetVisuals(getIgnoredTargetColor());
        }
        scheduleLoop(LOOP_ENEMY, buildingNotEnemyExitFrames < 4
          ? 0.3
          : buildingNotEnemyExitFrames < 12
            ? 0.6
            : 1.5);
        return;
      }
      var wasDirty = settingsDirty;
      if (isEnemy && now - lastStyleReapplyAt >= STYLE_REAPPLY_WATCHDOG_MS) {
        lastStyleReapplyAt = now;
        if (hasEnemyStyleDrift()) {
          invalidateEnemyVisualCaches();
          settingsDirty = true;
          settingsRefreshHoldUntil = now;
          wasDirty = true;
        }
      }

      // Neutral unit
      if (fl & 2) {
        clearPulse();
        neutralExitFrames++;
        nonEnemyExitFrames = 0;
        buildingNotEnemyExitFrames = 0;
        sHBV(true);
        sKZ(false, 0);
        sHCV(false);
        sBC("#5BEFB5");
        sTC(WHITE_WASH);
        lUT = now;
        scheduleLoop(LOOP_ENEMY, stableNeutralDelay(neutralExitFrames));
        return;
      }
      // Not an enemy â€” skip coloring
      if (!isEnemy) {
        nonEnemyExitFrames++;
        neutralExitFrames = 0;
        buildingNotEnemyExitFrames = 0;
        var friendNonEnemy = !!(
          isFriendlyTargetHealthbar(fl) && cfg.hp_friend_enabled
        );
        if (friendNonEnemy) {
          parkEnemyLoopForFriendlyTarget();
          maybeKickAllyLoopForFriendlyTarget(now);
        } else {
          resetIgnoredTargetVisuals(getIgnoredTargetColor());
        }
        lUT = now;
        scheduleLoop(LOOP_ENEMY, friendNonEnemy
          ? stableFriendNonEnemyDelay(nonEnemyExitFrames)
          : stableNonEnemyDelay(nonEnemyExitFrames));
        return;
      }
      nonEnemyExitFrames = 0;
      neutralExitFrames = 0;
      buildingNotEnemyExitFrames = 0;
      if (settingsDirty) {
        if (now < settingsRefreshHoldUntil) {
          scheduleLoop(LOOP_ENEMY, 0.05);
          return;
        }
        applyCurrentSettings(isEnemy);
      }

      if (!presetApplied) {
        sBC(CSS_TEAM_ENEMY_COLOR);
        sUC(CSS_TEAM_ENEMY_COLOR);
        sTC(WHITE_WASH);
        scheduleLoop(LOOP_ENEMY, 0.05);
        return;
      }
      var w = rb.actuallayoutwidth | 0;
      var pw =
        cp && cp.actuallayoutwidth !== undefined ? cp.actuallayoutwidth | 0 : 0;
      // No change in width â€” back off
      if (
        w === lW &&
        pw === lPW &&
        !pulse &&
        !wasDirty &&
        colorGeneration === panelGeneration
      ) {
        stableCurrentRedBarFrames++;
        if (isEnemy && now >= nextStyleDriftCheckAt) {
          nextStyleDriftCheckAt = now + styleDriftCheckDelayMs();
          if (hasEnemyBarStyleDrift()) {
            resetStyleDriftBackoff();
            invalidateEnemyVisualCaches();
            settingsDirty = true;
            settingsRefreshHoldUntil = now;
            lW = -1;
            lHp = -1;
            scheduleLoop(LOOP_ENEMY, 0.05);
            return;
          }
          styleDriftCleanFrames++;
        }
        var stableDelay = now - lUT > 2000 ? 1.5 : 0.25;
        scheduleLoop(LOOP_ENEMY, stableDelay);
        return;
      }
      stableCurrentRedBarFrames = 0;
      lW = w;
      lPW = pw;
      lUT = now;
      if (pw <= 0) {
        noParentWidthFrames++;
        sBC(getHighColor());
        sKZ(false, 0);
        scheduleLoop(LOOP_ENEMY, noParentWidthDelay(noParentWidthFrames));
        return;
      }
      noParentWidthFrames = 0;
      if (cfg.hp_kill_zone_enabled) sKZ(true, pw);
      else if (lKzVis !== "collapse") sKZ(false, 0);

      var hp = ((w / pw) * 100) | 0;
      var low = dc.low;
      var pulseThresh = dc.pulseThreshold;
      var shouldPulse = !!(cfg.hp_pulse_enabled && hp <= pulseThresh);

      // Small change above low threshold â€” back off
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

      updateEnemyCounter(hp, shouldPulse);

      var sc = paintEnemyHealthState(hp, prevHp, now, shouldPulse);
      if (sc < 0) {
        scheduleLoop(LOOP_ENEMY, 0.05);
        return;
      }
      if (syncEnemyPulse(shouldPulse, now)) sc = 0.1;
      colorGeneration = panelGeneration;

      scheduleLoop(LOOP_ENEMY, sc);
    } catch (e) {
      scheduleLoop(LOOP_ENEMY, 0.5);
    } finally {
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

  function syncLevelTier() {
    if (!ll || !ll.IsValid()) ll = ctx.FindChildTraverse(ID_UNIT_LEVEL_LABEL);
    if (!lc || !lc.IsValid()) lc = ctx.FindChildTraverse(ID_UNIT_STATUS);
    if (lc && (!wr || !wr.IsValid())) {
      var current = lc;
      while (current) {
        if (current.BHasClass && current.BHasClass(CLASS_ENEMY)) {
          wr = current;
          break;
        }
        if (!current.GetParent) break;
        current = current.GetParent();
      }
    }
    if (!ll || !lc || !wr) return false;

    var visible = !!cfg.hp_level_number_visible;
    if (lLvVis !== visible) {
      if (visible) wr.AddClass(LV_VIS_CLASS);
      else wr.RemoveClass(LV_VIS_CLASS);
      lLvVis = visible;
    }
    if (!visible) return false;

    var text = "";
    try {
      text = ll.text || ll.GetAttributeString("text", "") || "";
    } catch (eText) {
      text = "";
    }
    if (!text || text.charCodeAt(0) === 123) return false;
    var level = 0;
    for (var i = 0; i < text.length; i++) {
      var digit = text.charCodeAt(i) - 48;
      if (digit >= 0 && digit <= 9) level = level * 10 + digit;
    }
    if (level === lLv || !level) return false;
    lLv = level;
    for (var j = 0; j < 4; j++) wr.RemoveClass(LC_[j]);
    for (var tier = 3; tier >= 0; tier--) {
      if (level >= LT_[tier]) {
        wr.AddClass(LC_[tier]);
        break;
      }
    }
    return true;
  }

  var lLNoChange = 0;
  function lL() {
    if (!cfg.hp_level_number_visible) {
      stopLoop(LOOP_LEVEL, true);
      return;
    }
    loopRunning[LOOP_LEVEL] = true;
    lLNoChange = syncLevelTier() ? 0 : lLNoChange + 1;
    scheduleLoop(LOOP_LEVEL, lLNoChange > 10 ? 5.0 : 0.5);
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
      if (!rbA || !rbA.IsValid()) {
        resetAllyState(allyOwnedPanel, false);
        allyOwnedPanel = null;
        rbA = null;
        cpA = null;
        rbA = resolveRedBar("friend");
        if (!rbA) {
          aIdleMiss++;
          if (lastRedBarResolveRejectFlags & 4) {
            scheduleLoop(LOOP_ALLY, 2.5);
            return;
          }
          if (lastRedBarResolveRejectFlags) {
            scheduleLoop(LOOP_ALLY, 1.2);
            return;
          }
          scheduleLoop(LOOP_ALLY, aIdleMiss > 75 ? 3.0 : 0.2);
          return;
        }
        _allyScanPanel = null;
        _allyScanAt = 0;
        _allyScanFlags = 0;
      }
      aIdleMiss = 0;
      if (rbA.GetParent) {
        var pa = rbA.GetParent();
        if (cpA !== pa) cpA = pa;
      }
      if (rbA !== lastAllyPanel) {
        lastAllyPanel = rbA;
        lastAllyPresetGeneration = -1;
        allySettingsDirty = true;
        allySettingsRefreshHoldUntil = 0;
        lColA = null;
        lWA = -1;
        lPWA = -1;
        lHpA = -1;
      }
      var allyPresetPending = lastAllyPresetGeneration !== presetGeneration;
      if (allyPresetPending) {
        allySettingsDirty = true;
        allySettingsRefreshHoldUntil = 0;
        lColA = null;
        lWA = -1;
        lPWA = -1;
        lHpA = -1;
        sfcA = 0;
      }

      if (allySettingsDirty) {
        if (now < allySettingsRefreshHoldUntil) {
          scheduleLoop(LOOP_ALLY, 0.05);
          return;
        }
        allySettingsDirty = false;
        resetAllyState(allyOwnedPanel, false);
      }

      var f2 = scanAllyFlags(rbA);

      if (!isConfirmedAllyHealthbar(f2)) {
        if (allyOwnedPanel === rbA) {
          resetAllyState(allyOwnedPanel, false);
          allyOwnedPanel = null;
        } else if (pulseA) {
          syncAllyPulse(rbA, false);
        }
        sfcA = 0;
        lHpA = -1;
        noAllyParentWidthFrames = 0;
        allyUnconfirmedFrames++;
        if (allyUnconfirmedFrames === 4 || allyUnconfirmedFrames === 12) {
          resetAllyState(allyOwnedPanel, false);
          allyOwnedPanel = null;
          rbA = null;
          cpA = null;
          _allyScanPanel = null;
          _allyScanAt = 0;
          _allyScanFlags = 0;
          invalidateRedBarResolverCache();
          scheduleLoop(LOOP_ALLY, 0.1);
          return;
        }
        scheduleLoop(LOOP_ALLY, allyUnconfirmedFrames < 4
          ? 1.2
          : allyUnconfirmedFrames < 12
            ? 2.0
            : 3.0);
        return;
      }
      if (allyPresetPending) {
        lastAllyPresetGeneration = presetGeneration;
      }
      allyUnconfirmedFrames = 0;

      var aw = rbA.actuallayoutwidth | 0;
      var apw =
        cpA && cpA.actuallayoutwidth !== undefined
          ? cpA.actuallayoutwidth | 0
          : 0;
      if (apw <= 0) {
        noAllyParentWidthFrames++;
        scheduleLoop(LOOP_ALLY, noAllyParentWidthFrames < 4
          ? 0.2
          : noAllyParentWidthFrames < 12
            ? 0.4
            : 0.8);
        return;
      }
      noAllyParentWidthFrames = 0;
      var allyWidthStable = aw === lWA && apw === lPWA;

      if (allyWidthStable && !pulseA) {
        if (now >= nextAllyStyleDriftCheckAt) {
          nextAllyStyleDriftCheckAt = now + (sfcA >= 3 ? 2500 : 1200);
          if (hasAllyBarStyleDrift(rbA)) {
            lColA = null;
          } else {
            sfcA++;
            var scIdle = ALLY_IDLE_BACKOFF[Math.min(Math.floor(sfcA / 3), 4)];
            scheduleLoop(LOOP_ALLY, scIdle);
            return;
          }
        } else {
          sfcA++;
          var scIdleFast = ALLY_IDLE_BACKOFF[Math.min(Math.floor(sfcA / 3), 4)];
          scheduleLoop(LOOP_ALLY, scIdleFast);
          return;
        }
      }
      lWA = aw;
      lPWA = apw;

      var ahp = ((aw / apw) * 100) | 0;
      var prevHpA = lHpA;
      var alow = dc.low;
      var ahigh = dc.high;
      var inPulse = !!(
        cfg.hp_friend_pulse_enabled && ahp <= dc.friendPulseThreshold
      );
      var acl;
      if (inPulse && cfg.hp_friend_pulse_color_enabled) {
        acl = cfg.hp_friend_pulse_color;
      } else if (ahp <= alow) {
        acl = cfg.hp_friend_color_low;
      } else if (ahp <= ahigh) {
        acl =
          cfg.hp_mode === 1
            ? ipHex(
                cfg.hp_friend_color_low,
                cfg.hp_friend_color_mid,
                (ahp - alow) / dc.denomMid,
              )
            : cfg.hp_friend_color_mid;
      } else {
        acl =
          cfg.hp_mode === 1
            ? ipHex(
                cfg.hp_friend_color_mid,
                cfg.hp_friend_color_high,
                (ahp - ahigh) / dc.denomHigh,
              )
            : cfg.hp_friend_color_high;
      }
      var nextColA;
      var allyColorChanged;
      if (lColARaw === acl && lColA) {
        nextColA = lColA;
        allyColorChanged = false;
      } else {
        nextColA = normalizeWashColor(acl);
        allyColorChanged = lColA !== nextColA;
      }
      if (allyColorChanged && rbA) {
        try {
          rbA.style.washColor = nextColA;
          lColA = nextColA;
          lColARaw = acl;
          allyColorActive = true;
          allyOwnedPanel = rbA;
        } catch (e) {
          lColA = null;
          lColARaw = null;
        }
      }

      var hadPulseA = !!pulseA;
      var allyPulseStarted = syncAllyPulse(rbA, inPulse);
      var allyPulseCleared = !inPulse && hadPulseA;
      var sc = inPulse ? 0.15 : 0.35;
      if (
        inPulse &&
        !allyPulseStarted &&
        !allyColorChanged &&
        ahp === prevHpA &&
        allyWidthStable
      ) {
        sfcA++;
        sc = ALLY_IDLE_BACKOFF[Math.min(Math.floor(sfcA / 3), 4)];
      } else if (
        !inPulse &&
        !allyColorChanged &&
        !allyPulseCleared &&
        ahp === prevHpA
      ) {
        sfcA++;
        sc = ALLY_IDLE_BACKOFF[Math.min(Math.floor(sfcA / 3), 4)];
      } else {
        sfcA = 0;
      }
      lHpA = ahp;

      scheduleLoop(LOOP_ALLY, sc);
    } catch (e) {
      scheduleLoop(LOOP_ALLY, 0.5);
    } finally {
    }
  }

  try {
    tryApplySharedSnapshot();
  } catch (eStartupShared) {}
  try {
    handleRuntimeToggleState();
  } catch (eStartupToggle) {}
  try {
    schedulePresetRetry();
  } catch (eStartupRetry) {}
})();
