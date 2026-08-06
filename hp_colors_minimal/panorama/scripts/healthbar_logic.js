// fallow-ignore-file unused-file
// fallow-ignore-file complexity
"use strict";
(function () {
  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Runtime configuration schema. Keep this list synchronized with the builder; production requires 56 keys.
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
    hp_heal_color: "#5fff80",
    hp_delta_color: "#ffe55b",
    hp_bullet_shield_color: "#ffffff",
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
    hp_friend_heal_color: "#5fff80",
    hp_friend_delta_color: "#504c47",
    hp_friend_bullet_shield_color: "#ffffff",
    hp_friend_pulse_color_enabled: false,
    hp_friend_pulse_color: "#FF2222",
    hp_level_number_visible: true,
    hp_pip_visible: true,
    hp_precise_pips_enabled: false,
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
  var ID_UNIT_HEALTHBAR_HEALING = "unit_healthbar_healing";
  var ID_UNIT_HEALTHBAR_DELTA = "unit_healthbar_delta";
  var ID_UNIT_HEALTHBAR_BULLET_SHIELD = "unit_healthbar_bullet_shield";
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
  var runtimeEventHandlerId = null;
  var runtimeEpoch = 1;
  var runtimeStopped = false;
  var runtimeQuiescentToken = 0;
  var runtimeQuiescentQueued = false;

  function scheduleRuntimeQuiescentCheck() {
    if (runtimeStopped || runtimeQuiescentQueued) return;
    if (loopEnabled(LOOP_ENEMY) || loopEnabled(LOOP_ALLY) || loopEnabled(LOOP_LEVEL)) return;
    runtimeQuiescentQueued = true;
    var token = ++runtimeQuiescentToken;
    var epoch = runtimeEpoch;
    try {
      $.Schedule(5.0, function runtimeQuiescentCheck() {
        runtimeQuiescentQueued = false;
        if (token !== runtimeQuiescentToken || !RuntimeLifetimeOwner.isActive(epoch)) return;
        if (!loopEnabled(LOOP_ENEMY) && !loopEnabled(LOOP_ALLY) && !loopEnabled(LOOP_LEVEL))
          scheduleRuntimeQuiescentCheck();
      });
    } catch (eQuiescent) {
      runtimeQuiescentQueued = false;
    }
  }

  function cancelRuntimeQuiescentCheck() {
    runtimeQuiescentToken += 1;
    runtimeQuiescentQueued = false;
  }

  var RuntimeLifetimeOwner = {
    isActive: function (epoch) {
      if (runtimeStopped || (epoch !== undefined && epoch !== runtimeEpoch))
        return false;
      if (vPanel(ctx)) return true;
      this.stop();
      return false;
    },
    stop: function () {
      if (runtimeStopped) return false;
      runtimeStopped = true;
      cancelRuntimeQuiescentCheck();
      runtimeEpoch += 1;
      for (var kind = 0; kind < loopScheduleToken.length; kind += 1) {
        loopScheduleToken[kind] += 1;
        loopNextDueAt[kind] = 0;
        loopWakeQueued[kind] = false;
        loopRunning[kind] = false;
      }
      presetRetryToken += 1;
      presetRetryQueued = false;
      nextCacheProbeAt = 0;
      nextRbProbeAt = 0;
      nextCurrentRbProbeAt = 0;
      nextCurrentRbChildProbeAt = 0;
      currentRbRefreshUntil = 0;
      _lastScanAt = 0;
      _lastScanPanel = null;
      lastEnemyTeamId = lastEnemyFlags = null;
      invalidateRedBarResolverCache();
      try {
        if ($.UnregisterForUnhandledEvent && runtimeEventHandlerId !== null)
          $.UnregisterForUnhandledEvent(EVENT_CHANNEL, runtimeEventHandlerId);
      } catch (eUnregister) {}
      runtimeEventHandlerId = null;
      try {
        UnitStatusOverlayAdapter.invalidatePanels();
      } catch (ePanels) {}
      rbA =
        cpA =
        healA =
        deltaA =
        bulletShieldA =
        allyOwnedPanel =
        lastAllyPanel =
        presetRootPanel =
        _allyScanPanel =
        ll =
        lc =
        wr =
          null;
      _allyScanAt = 0;
      _allyScanFlags = 0;
      _lastScanAt = 0;
      _lastScanPanel = null;
      lastRbPanel =
        lastCpPanel =
        lastLbpPanel =
        lastHcPanel =
        lastBgPanel =
        lastKzPanel =
        lastPlPanel =
        lastHealPanel =
        lastDeltaPanel =
        lastBulletShieldPanel =
          null;
      lastUnitName = "";
      lLv = -1;
      lLvVis = null;
      lastEnemyTeamId = lastEnemyFlags = null;
      ignoredVisualSig = "";
      lCol =
        lUlt =
        lTxt =
        lHeal =
        lDelta =
        lBulletShield =
        lColRaw =
        lUltRaw =
        lTxtRaw =
        lKzRaw =
        lHealRaw =
        lDeltaRaw =
        lBulletShieldRaw =
          null;
      lColA =
        lColARaw =
        lHealA =
        lDeltaA =
        lBulletShieldA =
          null;
      lWA = lPWA = lHpA = -1;
      allyColorActive = false;
      lSH = lSM = -1;
      lVis = null;
      lIhcMarginTop = lUhcHeight = lPipHeight = lPipFontSize = null;
      lLvVis = null;
      lastSameRawWakePanelGeneration = -1;
      lastSameRawEligibilityCheckAt = 0;
      ALLY_SNAPSHOT.hp = 0;
      ALLY_PAINT_PLAN.washColor = "";
      ALLY_PAINT_PLAN.inPulse = false;
      ALLY_PAINT_PLAN.healColor = "";
      ALLY_PAINT_PLAN.deltaColor = "";
      ALLY_PAINT_PLAN.bulletShieldColor = "";
      ALLY_PAINT_PLAN.nextDelay = 0.35;
    },
  };

  var ENEMY_ACTION_CONTINUE = 0;
  var ENEMY_ACTION_BUILDING_SKIP = 1;
  var ENEMY_ACTION_NEUTRAL = 2;
  var ENEMY_ACTION_NON_ENEMY = 3;
  var ENEMY_ACTION_WAIT_SETTINGS = 4;
  var ENEMY_ACTION_WAIT_PRESET = 5;
  var ENEMY_ACTION_ZERO_WIDTH = 6;
  var ENEMY_ACTION_STABLE_NO_CHANGE = 7;
  var ENEMY_ACTION_SMALL_CHANGE = 8;
  var ENEMY_ACTION_PAINT = 9;
  var ENEMY_LOOP_STATE = { skipBuildings: false, friendEnabled: false, settingsDirty: false, settingsHold: false, presetReady: true, bootstrapWait: false, styleDrift: false, barWidth: 0, parentWidth: 0, lastBarWidth: -1, lastParentWidth: -1, lastUpdateAt: 0, low: 0, lastHp: -1, pulseActive: false, pulseTextEnabled: false, pulseEnabled: false, pulseThreshold: 0, wasDirty: false, colorGeneration: 0, panelGeneration: 0, nonEnemyFrames: 0, neutralFrames: 0, buildingFrames: 0, noParentWidthFrames: 0, friendNonEnemy: false };
  var ENEMY_LOOP_DECISION = { action: 0, delay: 0.25, reason: "enemy_paint", hp: 0, shouldPulse: false, pulseFast: false, friendNonEnemy: false };

  // ── Pulse state ─────────────────────────────────────────────────────────────
  var pulse = 0;
  var lPD = null;
  var lPI = -1;
  var lTB = null;

  // ── Ally state ───────────────────────────────────────────────────────────────
  var rbA = null,
    cpA = null,
    healA = null,
    deltaA = null,
    bulletShieldA = null;
  var allyOwnedPanel = null;
  var lColA = null,
    lColARaw = null,
    lHealA = null,
    lDeltaA = null,
    lBulletShieldA = null,
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
  var ALLY_PULSE_PLAN = {
    shouldPulse: false,
    start: false,
    stop: false,
    duration: "",
    intensityIndex: -1,
  };

  var LowHpPulsePolicy = {
    resetEnemy: function (plan) {
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
    },
    enemy: function (shouldPulse, now, plan) {
      plan = this.resetEnemy(plan || ENEMY_PULSE_PLAN);
      if (!shouldPulse) {
        plan.stop = pulse ? true : false;
        return plan;
      }
      plan.shouldPulse = true;
      plan.start = pulse ? false : true;
      var bpm = clampNum(cfg.hp_pulse_bpm, 30, 300, 75);
      plan.duration = (60 / bpm).toFixed(3) + "s";
      plan.intensityIndex = clampNum(cfg.hp_pulse_intensity, 0, 2, 1) | 0;
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
    },
    resetAlly: function (plan) {
      plan.shouldPulse = false;
      plan.start = false;
      plan.stop = false;
      plan.duration = "";
      plan.intensityIndex = -1;
      return plan;
    },
    ally: function (shouldPulse, plan) {
      plan = this.resetAlly(plan || ALLY_PULSE_PLAN);
      if (!shouldPulse) {
        plan.stop = pulseA ? true : false;
        return plan;
      }
      plan.shouldPulse = true;
      plan.start = pulseA ? false : true;
      var bpm = clampNum(cfg.hp_friend_pulse_bpm, 30, 300, 75);
      plan.duration = (60 / bpm).toFixed(3) + "s";
      plan.intensityIndex = clampNum(cfg.hp_friend_pulse_intensity, 0, 2, 1) | 0;
      return plan;
    },
  };

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
    var plan = LowHpPulsePolicy.enemy(shouldPulse, now, ENEMY_PULSE_PLAN);
    if (plan.stop) {
      clearPulse();
      return false;
    }
    if (!plan.shouldPulse) return false;
    if (plan.start) {
      pulse = 1;
      lCol = lUlt = lTxt = null;
      lColRaw = lUltRaw = lTxtRaw = null;
      try {
        if (rb) rb.AddClass(LP);
      } catch (eStartRb) {}
      try {
        if (ui) ui.AddClass(LP);
      } catch (eStartUi) {}
    }
    if (lPD !== plan.duration) {
      try {
        if (rb && rb.IsValid && rb.IsValid()) rb.style.animationDuration = plan.duration;
        if (ui && ui.IsValid && ui.IsValid()) ui.style.animationDuration = plan.duration;
        lPD = plan.duration;
      } catch (eDur) {
        lPD = null;
      }
    }
    if (lPI !== plan.intensityIndex) {
      var oldCls = lPI >= 0 ? PULSE_INTENSITY[lPI] : "";
      var newCls = PULSE_INTENSITY[plan.intensityIndex];
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
      lPI = plan.intensityIndex;
    }
    if (plan.resetText) {
      try {
        if (hc && hc.style) {
          hc.style.animationDuration = "";
          hc.style.brightness = "";
        }
      } catch (eTextOff) {}
      lTB = null;
      return false;
    }
    if (!plan.textEnabled || !hc || !hc.style) return false;
    if (lTB !== plan.textBrightness) {
      try {
        hc.style.brightness = plan.textBrightness;
        lTB = plan.textBrightness;
      } catch (eBright) {
        lTB = null;
      }
    }
    return plan.fastSchedule;
  }

  function syncAllyPulse(panel, shouldPulse) {
    var target = panel || allyOwnedPanel;
    var plan = LowHpPulsePolicy.ally(shouldPulse, ALLY_PULSE_PLAN);
    if (plan.stop) {
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
    if (!plan.shouldPulse) return false;
    if (plan.start) {
      pulseA = 1;
      lPIA = -1;
      lColA = null;
      try {
        if (target) target.AddClass(LP);
      } catch (eStart) {}
    }
    if (lPIA !== plan.intensityIndex) {
      var oldA = lPIA >= 0 ? PULSE_INTENSITY[lPIA] : "";
      var newA = PULSE_INTENSITY[plan.intensityIndex];
      try {
        if (target && oldA) target.RemoveClass(oldA);
        if (target && newA) target.AddClass(newA);
      } catch (eCls) {}
      lPIA = plan.intensityIndex;
    }
    if (lPDA !== plan.duration) {
      try {
        if (target && target.style) target.style.animationDuration = plan.duration;
        lPDA = plan.duration;
      } catch (eDurA) {
        lPDA = null;
      }
    }
    return plan.start;
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
  var presetRetryToken = 0;
  var presetRetryQueued = false;

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
  var ALLY_SNAPSHOT = { hp: 0 };
  var ALLY_PAINT_PLAN = {
    washColor: "",
    inPulse: false,
    healColor: "",
    deltaColor: "",
    bulletShieldColor: "",
    nextDelay: 0.35,
  };


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

  var HPBridgeProtocol = {
    eventChannel: EVENT_CHANNEL,
    presetSnapshotMagic: SNAPSHOT_MAGIC,
    presetRequestMagic: REQUEST_MAGIC,
    sharedCfgRawKey: SHARED_CFG_RAW_KEY,
    rootCfgRawAttr: ROOT_CFG_RAW_ATTR,
    getSharedStore: function () { return getSharedStore(); },
    readRootConfigRaw: function () { return readRootPresetSnapshot(); },
    readSharedConfigRaw: function () {
      var store = this.getSharedStore();
      var raw = "";
      try {
        raw = store ? String(store[this.sharedCfgRawKey] || "") : "";
      } catch (e) {
        raw = "";
      }
      return raw || this.readRootConfigRaw();
    },
    dispatchPresetRequest: function (reason) {
      try {
        $.DispatchEvent(this.eventChannel, JSON.stringify({
          magic_word: this.presetRequestMagic,
          mod_title: "HP Colors",
          reason: String(reason || "overlay_request"),
        }));
        return true;
      } catch (e) {}
      return false;
    },
    shouldInspectPresetSnapshot: function (payload) {
      return typeof payload !== "string" || payload.indexOf(this.presetSnapshotMagic) !== -1;
    },
    parsePayload: function (payload) {
      try {
        return typeof payload === "string" ? JSON.parse(payload) : payload;
      } catch (e) {}
      return null;
    },
    acceptsPresetSnapshot: function (data) {
      return !!(data && data.magic_word === this.presetSnapshotMagic && (!data.mod_title || data.mod_title === "HP Colors") && data.values && typeof data.values === "object");
    },
    getPresetSnapshotRaw: function (data) {
      var raw = typeof data.values_raw === "string" ? data.values_raw : "";
      if (raw) return raw;
      try {
        return JSON.stringify(data.values);
      } catch (e) {}
      return "";
    },
  };

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

  var EnemyHealthbarLoopPolicy = {
    resetDecision: function (decision) {
      decision.action = ENEMY_ACTION_CONTINUE; decision.delay = 0.25; decision.reason = "enemy_paint"; decision.hp = 0; decision.shouldPulse = false; decision.pulseFast = false; decision.friendNonEnemy = false; return decision;
    },
    decide: function (target, now, state, decision) {
      decision = this.resetDecision(decision || ENEMY_LOOP_DECISION);
      var isEnemy = !!(target && target.isEnemy);
      var friendlyTarget = !!(
        target &&
        (target.isFriendly || target.isFriendlyBuilding)
      );
      state.friendNonEnemy = !!(friendlyTarget && state.friendEnabled);
      if (state.skipBuildings && target && target.isBuilding) { decision.action = ENEMY_ACTION_BUILDING_SKIP; decision.reason = "enemy_skip_building"; decision.delay = state.buildingFrames < 4 ? 0.3 : state.buildingFrames < 12 ? 0.6 : 1.5; return decision; }
      if (target && target.isNeutral) { decision.action = ENEMY_ACTION_NEUTRAL; decision.reason = "enemy_neutral"; decision.delay = state.neutralFrames < 4 ? 0.75 : 1.5; return decision; }
      if (!isEnemy) { decision.action = ENEMY_ACTION_NON_ENEMY; decision.friendNonEnemy = state.friendNonEnemy; decision.reason = state.friendNonEnemy ? "enemy_friend_target" : "enemy_not_enemy"; decision.delay = state.friendNonEnemy ? state.nonEnemyFrames < 4 ? 0.2 : 2.0 : state.nonEnemyFrames < 4 ? 0.2 : 1.25; return decision; }
      if (state.settingsDirty && state.settingsHold) { decision.action = ENEMY_ACTION_WAIT_SETTINGS; decision.reason = "enemy_dirty_hold"; decision.delay = 0.05; return decision; }
      if (!state.presetReady) { decision.action = ENEMY_ACTION_WAIT_PRESET; decision.reason = "enemy_preset_wait"; decision.delay = 0.05; return decision; }
      if (state.styleDrift) { decision.action = ENEMY_ACTION_STABLE_NO_CHANGE; decision.reason = "enemy_style_drift"; decision.delay = 0.05; return decision; }
      if (state.parentWidth <= 0) { decision.action = ENEMY_ACTION_ZERO_WIDTH; decision.reason = "enemy_no_parent_width"; decision.delay = state.noParentWidthFrames < 3 ? 0.18 : state.noParentWidthFrames < 6 ? 0.75 : state.noParentWidthFrames < 10 ? 1.5 : 2.5; return decision; }
      var jsPulseTick = !!(state.pulseActive && state.pulseTextEnabled);
      if (state.barWidth === state.lastBarWidth && state.parentWidth === state.lastParentWidth && !jsPulseTick && !state.wasDirty && state.colorGeneration === state.panelGeneration) { decision.action = ENEMY_ACTION_STABLE_NO_CHANGE; decision.reason = "enemy_stable"; decision.delay = now - state.lastUpdateAt > 2000 ? 1.5 : 0.25; return decision; }
      var hp = state.parentWidth > 0 ? ((state.barWidth / state.parentWidth) * 100) | 0 : 0;
      decision.hp = hp; decision.shouldPulse = !!(state.pulseEnabled && hp <= state.pulseThreshold);
      if (Math.abs(hp - state.lastHp) < 3 && hp > state.low && state.lastHp > state.low && !(state.pulseTextEnabled && (state.pulseActive || decision.shouldPulse)) && !state.wasDirty) { decision.action = ENEMY_ACTION_SMALL_CHANGE; decision.reason = "enemy_small_delta"; decision.delay = 0.25; return decision; }
      decision.action = ENEMY_ACTION_PAINT; decision.reason = decision.shouldPulse ? "enemy_pulse" : "enemy_paint"; decision.delay = 0.15; return decision;
    }
  };

  function requestLoopKick(kind, delay) {
    LoopSchedulePolicy.requestKick(kind, delay);
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
    requestLoopKick(LOOP_ALLY, 0.01, "friendly_target");
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
      UnitStatusOverlayAdapter.hasEnemyStyleDrift()
    )
      return "style_drift";
    return "";
  }

  var ReplayWakePolicy = {
    shouldWakeSameRaw: function (reason, state) {
      if (!state) return true;
      if (state.watchdogSuppressed) return false;
      return !!(
        state.panelGenerationChanged ||
        state.panelUnseen ||
        state.generationPending ||
        state.loopStopped ||
        state.styleDrift
      );
    },
    markWake: function (reason, now) {
      lastSameRawWakeAt = now;
      lastSameRawWakePanelGeneration = panelGeneration;
      lastSameRawEligibilityCheckAt = now;
    },
    wakeLoops: function (reason) {
      var now = _ts();
      if (canSkipPresetReplayWake(now)) return;
      lastSameRawEligibilityCheckAt = now;
      var wakeReason = presetReplayWakeReason(now);
      var state = {
        panelGenerationChanged: wakeReason === "panel_changed",
        panelUnseen: wakeReason === "panel_unseen",
        generationPending: wakeReason === "generation_pending",
        loopStopped: wakeReason === "loop_stopped",
        styleDrift: wakeReason === "style_drift",
        watchdogSuppressed: !wakeReason,
      };
      if (!this.shouldWakeSameRaw(reason, state)) {
        if (!wakeReason) lastSameRawWakePanelGeneration = panelGeneration;
        return;
      }
      if (lastSameRawWakeAt && now - lastSameRawWakeAt < SAME_RAW_WAKE_MIN_MS) return;
      this.markWake(reason, now);
      settingsDirty = true;
      allySettingsDirty = true;
      settingsRefreshHoldUntil = 0;
      allySettingsRefreshHoldUntil = 0;
      lLvVis = null;
      requestCurrentRedBarRefresh();
      requestLoopKick(LOOP_ENEMY, 0.01, "preset_replay_enemy");
      requestLoopKick(LOOP_ALLY, 0.01, "preset_replay_ally");
      requestLoopKick(LOOP_LEVEL, 0.01, "preset_replay_level");
    },
  };

  function wakeForPresetReplay(reason) {
    ReplayWakePolicy.wakeLoops(reason);
  }

  function normalizeScheduleDelay(delay, fallback) {
    var value = Number(delay);
    if (!isFinite(value) || value < 0) return fallback;
    return value;
  }

  var LoopSchedulePolicy = {
    schedule: function (kind, delay, beforeRun) {
      if (!loopEnabled(kind) || runtimeStopped) return false;
      var safeDelay = normalizeScheduleDelay(delay, 0.05);
      var now = _ts();
      var dueAt = now + safeDelay * 1000;
      if (loopNextDueAt[kind] && loopNextDueAt[kind] <= dueAt) return false;
      loopNextDueAt[kind] = dueAt;
      var token = ++loopScheduleToken[kind];
      var epoch = runtimeEpoch;
      $.Schedule(safeDelay, function () {
        if (!RuntimeLifetimeOwner.isActive(epoch)) return;
        if (token !== loopScheduleToken[kind]) return;
        loopNextDueAt[kind] = 0;
        if (beforeRun) beforeRun();
        if (loopEnabled(kind)) runLoop(kind);
      });
      return true;
    },
    requestKick: function (kind, delay) {
      if (!loopEnabled(kind) || loopWakeQueued[kind] || runtimeStopped) return;
      loopWakeQueued[kind] = true;
      if (!this.schedule(
        kind,
        delay === undefined ? 0.01 : delay,
        function () {
          loopWakeQueued[kind] = false;
        },
      ))
        loopWakeQueued[kind] = false;
    },
  };

  function scheduleLoop(kind, delay) {
    return LoopSchedulePolicy.schedule(kind, delay);
  }

  function markPresetApplied() {
    presetRetryToken += 1;
    presetRetryQueued = false;

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
    requestLoopKick(LOOP_ENEMY, 0.01, "preset_apply");
    requestLoopKick(LOOP_ALLY, 0.01, "preset_apply");
    requestLoopKick(LOOP_LEVEL, 0.01, "preset_apply");
  }

  function applyPresetSnapshot(values) {
    if (!values) {
      return false;
    }
    // Sparse snapshots overlay the existing runtime configuration.
    var previousPrecisePips = Boolean(cfg.hp_precise_pips_enabled);
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
    if (previousPrecisePips !== Boolean(cfg.hp_precise_pips_enabled)) {
      lTx = null;
      cMax = 0;
    }
    refreshDerivedConfig();
    try {
      resetStyleStateForNewPanels();
    } catch (eReset) {}
    try {
      UnitStatusOverlayAdapter.invalidateEnemyVisualCaches();
    } catch (eEnemy) {}
    requestCurrentRedBarRefresh();
    markPresetApplied();
    return true;
  }

  function tryApplySharedSnapshot() {
    var raw = HPBridgeProtocol.readSharedConfigRaw();
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
    HPBridgeProtocol.dispatchPresetRequest(reason);
  }

  function schedulePresetRetry() {
    if (runtimeStopped || presetApplied) {
      presetRetryQueued = false;
      return;
    }
    if (presetRetryQueued) return;
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
    var retryDelay = fastRetry
      ? PRESET_RETRY_SEC
      : lateRetry
        ? PRESET_LATE_RETRY_SEC
        : PRESET_SLOW_RETRY_SEC;
    var token = ++presetRetryToken;
    var epoch = runtimeEpoch;
    presetRetryQueued = true;
    $.Schedule(retryDelay, function () {
      if (!RuntimeLifetimeOwner.isActive(epoch) || token !== presetRetryToken)
        return;
      presetRetryQueued = false;
      schedulePresetRetry();
    });
  }


  function isIgnoredPresetEventPayload(payload) {
    return !HPBridgeProtocol.shouldInspectPresetSnapshot(payload);
  }

  function isDuplicatePresetPayload(payload) {
    return (
      presetApplied &&
      typeof payload === "string" &&
      payload === lastSnapshotPayload
    );
  }

  function parsePresetEventPayload(payload) {
    return HPBridgeProtocol.parsePayload(payload);
  }

  function getPresetEventRaw(data) {
    return HPBridgeProtocol.getPresetSnapshotRaw(data);
  }

  function applyPresetEventPayload(payload) {
    if (isDuplicatePresetPayload(payload)) {
      wakeForPresetReplay("event_duplicate_payload");
      return;
    }
    var data = parsePresetEventPayload(payload);
    if (!HPBridgeProtocol.acceptsPresetSnapshot(data)) return;

    var raw = getPresetEventRaw(data);
    if (raw && raw === sharedCfgRaw && presetApplied) {
      if (typeof payload === "string") lastSnapshotPayload = payload;
      wakeForPresetReplay("event_payload_same_raw");
      return;
    }
    if (applyPresetSnapshot(data.values)) {
      if (raw) sharedCfgRaw = raw;
      if (typeof payload === "string") lastSnapshotPayload = payload;
    }
  }


  try {
    runtimeEventHandlerId = $.RegisterForUnhandledEvent(
      HPBridgeProtocol.eventChannel,
      function (payload) {
        if (!RuntimeLifetimeOwner.isActive()) return;
        if (isIgnoredPresetEventPayload(payload)) return;
        try {
          applyPresetEventPayload(payload);
        } catch (e) {}
      },
    );
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
    heal = null,
    delta = null,
    bulletShield = null,
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

  var UNIT_STATUS_TARGET_SNAPSHOT = {
    panel: null,
    parent: null,
    teamId: 0,
    flags: 0,
    isEnemy: false,
    isNeutral: false,
    isBuilding: false,
    isFriendly: false,
    isFriendlyBuilding: false,
    isEnemyBuilding: false,
    isAlly: false,
    ignoredColor: CSS_TEAM_ENEMY_COLOR,
    barWidth: 0,
    parentWidth: 0,
    replacedRedBar: false,
  };

  var ALLY_STATUS_TARGET_SNAPSHOT = {
    panel: null,
    parent: null,
    teamId: 0,
    flags: 0,
    isEnemy: false,
    isNeutral: false,
    isBuilding: false,
    isFriendly: false,
    isFriendlyBuilding: false,
    isEnemyBuilding: false,
    isAlly: false,
    ignoredColor: CSS_TEAM_FRIEND_COLOR,
    barWidth: 0,
    parentWidth: 0,
    replacedRedBar: false,
  };

  var UnitStatusTargetClassifier = {
    readPacked: function (panel) {
      return readTeamBitsFrom(panel, SCAN_PARENT_DEPTH_LIMIT);
    },
    classify: function (panel, parent, snapshot) {
      snapshot = snapshot || UNIT_STATUS_TARGET_SNAPSHOT;
      var now = _ts();
      if (panel !== _lastScanPanel || now - _lastScanAt >= SCAN_CACHE_TTL) {
        var bits = this.readPacked(panel);
        tid = bits >> 8;
        fl = bits & 255;
        if (tid && fl & 8) knownFriendlyTeamId = tid;
        _lastScanAt = now;
        _lastScanPanel = panel;
      }
      var teamId = tid;
      var flags = fl;
      return this.fillSnapshot(panel, parent, teamId, flags, snapshot);
    },
    classifyAlly: function (panel, snapshot) {
      snapshot = snapshot || ALLY_STATUS_TARGET_SNAPSHOT;
      var bits = scanAllyFlags(panel);
      var teamId = bits >> 8;
      var flags = bits & 255;
      return this.fillSnapshot(
        panel,
        panel && panel.GetParent ? panel.GetParent() : null,
        teamId,
        flags,
        snapshot,
      );
    },

    fillSnapshot: function (panel, parent, teamId, flags, snapshot) {
      var isFriendly = this.isFriendlyTargetHealthbar(flags);
      var isFriendlyBuilding = this.isFriendlyBuildingTarget(flags, teamId);
      var isEnemyBuilding = this.isEnemyBuildingTarget(flags, teamId);
      snapshot.panel = panel || null;
      snapshot.parent = parent || null;
      snapshot.teamId = teamId || 0;
      snapshot.flags = flags || 0;
      snapshot.isEnemy = this.isEnemyTargetHealthbar(flags, teamId);
      snapshot.isNeutral = !!(flags & 2);
      snapshot.isBuilding = !!(flags & 4);
      snapshot.isFriendly = isFriendly;
      snapshot.isFriendlyBuilding = isFriendlyBuilding;
      snapshot.isEnemyBuilding = isEnemyBuilding;
      snapshot.isAlly = isFriendly || isFriendlyBuilding;
      snapshot.ignoredColor = this.getIgnoredTargetColor(flags, teamId);
      snapshot.barWidth =
        panel && panel.actuallayoutwidth !== undefined
          ? panel.actuallayoutwidth | 0
          : 0;
      snapshot.parentWidth =
        parent && parent.actuallayoutwidth !== undefined
          ? parent.actuallayoutwidth | 0
          : 0;
      snapshot.replacedRedBar = panel !== null && panel !== lb;
      return snapshot;
    },
    isFriendlyTargetHealthbar: function (flags) {
      return !!(flags & 8);
    },
    isFriendlyBuildingTarget: function (flags, teamId) {
      var team = teamId || tid;
      return !!(flags & 4 && (flags & 8 || (team && team === knownFriendlyTeamId)));
    },
    isEnemyBuildingTarget: function (flags, teamId) {
      var team = teamId || tid;
      return !!(
        flags & 4 &&
        !(flags & 2) &&
        team &&
        !this.isFriendlyBuildingTarget(flags, team)
      );
    },
    isEnemyTargetHealthbar: function (flags, teamId) {
      if (flags & 2) return false;
      if (cfg.hp_friend_enabled && this.isFriendlyTargetHealthbar(flags)) return false;
      if (flags & 1) return true;
      return this.isEnemyBuildingTarget(flags, teamId);
    },
    getIgnoredTargetColor: function (flags, teamId) {
      if (flags & 1 && !(flags & 2)) return "";
      if (this.isEnemyBuildingTarget(flags, teamId)) return CSS_TEAM_ENEMY_COLOR;
      if (this.isFriendlyBuildingTarget(flags, teamId)) return WHITE_WASH;
      if (flags & (2 | 4)) return "#5BEFB5";
      if (flags & 8) return CSS_TEAM_FRIEND_COLOR;
      if (teamId === 2) return CSS_TEAM2_COLOR;
      if (teamId === 1) return CSS_TEAM1_COLOR;
      return CSS_TEAM_ENEMY_COLOR;
    },
    redBarCandidateMatchesMode: function (panel, mode) {
      if (!vPanel(panel)) return false;
      if (mode === "any") return true;
      var flags = this.readPacked(panel) & 255;
      if (mode === "friend") {
        if (this.isFriendlyTargetHealthbar(flags)) return true;
        lastRedBarResolveRejectFlags = flags;
        return false;
      }
      if (mode === "enemy") return this.isEnemyTargetHealthbar(flags);
      return true;
    },
  };



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
    if (UnitStatusTargetClassifier.redBarCandidateMatchesMode(current, mode)) {
      redBarResolverPanel = current;
      redBarResolverMode = mode;
      redBarResolverAt = now;
      return current;
    }
    if (vPanel(us)) {
      var nested = us.FindChildTraverse(ID_UNIT_HEALTHBAR_LAGGING);
      if (UnitStatusTargetClassifier.redBarCandidateMatchesMode(nested, mode)) {
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
      (!hca || vPanel(hca)) &&
      (!heal || vPanel(heal)) &&
      (!delta || vPanel(delta)) &&
      (!bulletShield || vPanel(bulletShield)) &&
      (!ui || vPanel(ui)) &&
      (!kz || vPanel(kz)) &&
      (!ihc || vPanel(ihc)) &&
      (!uhc || vPanel(uhc)) &&
      vPanel(nm)
    );
  }


  function setNextCacheProbe(now) {
    nextCacheProbeAt = now + (att < 8 ? 150 : att < 24 ? 500 : 1500);
  }
  function cacheProbeLoopDelay(now) {
    if (nextCacheProbeAt && nextCacheProbeAt > now)
      return Math.max(0.15, (nextCacheProbeAt - now) / 1000);
    return 0.15;
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
    if (!vPanel(heal) && lbp && lbp.FindChildTraverse)
      heal = lbp.FindChildTraverse(ID_UNIT_HEALTHBAR_HEALING);
    if (!vPanel(delta) && lbp && lbp.FindChildTraverse)
      delta = lbp.FindChildTraverse(ID_UNIT_HEALTHBAR_DELTA);
    if (!vPanel(bulletShield) && lbp && lbp.FindChildTraverse)
      bulletShield = lbp.FindChildTraverse(ID_UNIT_HEALTHBAR_BULLET_SHIELD);
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
      !isInvalidPanel(hca) &&
      !isInvalidPanel(bg) &&
      !isInvalidPanel(pl) &&
      !isInvalidPanel(lb) &&
      !isInvalidPanel(lbp) &&
      !isInvalidPanel(rb) &&
      !isInvalidPanel(cp) &&
      !isInvalidPanel(heal) &&
      !isInvalidPanel(delta) &&
      !isInvalidPanel(bulletShield) &&
      !isInvalidPanel(ui) &&
      !isInvalidPanel(kz) &&
      !isInvalidPanel(ihc) &&
      !isInvalidPanel(uhc) &&
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
      heal =
      delta =
      bulletShield =
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
      lastHealPanel =
      lastDeltaPanel =
      lastBulletShieldPanel =
      lastHcPanel =
      lastBgPanel =
      lastKzPanel =
      lastPlPanel =
        null;
    lastUnitName = "";
    UnitStatusOverlayAdapter.invalidateEnemyVisualCaches();
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
    var children;
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
    else score += 100;
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
    UnitStatusOverlayAdapter.resetStyleDriftBackoff();
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



  // â”€â”€ Setter helpers (skip redundant writes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lCol = null,
    lUlt = null,
    lTxt = null;
  var lHeal = null,
    lDelta = null,
    lBulletShield = null;
  var lColRaw = null,
    lUltRaw = null,
    lTxtRaw = null,
    lKzRaw = null,
    lHealRaw = null,
    lDeltaRaw = null,
    lBulletShieldRaw = null;
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
    lastHealPanel = null,
    lastDeltaPanel = null,
    lastBulletShieldPanel = null,
    lastUnitName = "";
  var panelBornAt = 0;
  var panelGeneration = 0,
    colorGeneration = -1;
  var lastEnemyTeamId = null;
  var lastEnemyFlags = null;
  var ignoredVisualSig = "";

  var UnitStatusOverlayAdapter = {
    refreshCurrentRedBar: function (now, force) {
      return refreshCurrentRedBarRef(now, force);
    },
    invalidatePanels: function () {
      us =
        hc =
        hca =
        bg =
        pl =
        lb =
        lbp =
        rb =
        cp =
        heal =
        delta =
        bulletShield =
        ui =
        kz =
        ihc =
        uhc =
        nm =
          null;
      lastRbPanel =
        lastCpPanel =
        lastLbpPanel =
        lastHcPanel =
        lastBgPanel =
        lastKzPanel =
        lastPlPanel =
        lastHealPanel =
        lastDeltaPanel =
        lastBulletShieldPanel =
          null;
      lastUnitName = "";
      cached = 0;
      att = 0;
      nextCacheProbeAt = 0;
      requestCurrentRedBarRefresh();
    },
    invalidateEnemyVisualCaches: function () {
      lCol = lUlt = lTxt = lHeal = lDelta = lBulletShield = null;
      lColRaw = lUltRaw = lTxtRaw = lKzRaw = lHealRaw = lDeltaRaw = lBulletShieldRaw = null;
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
      this.resetStyleDriftBackoff();
    },
    applyLayout: function () {
      applyLayoutSettings();
    },
    setEnemyBarColor: function (color) {
      if (lColRaw === color && lCol !== null) return;
      var next = normalizeWashColor(color);
      if (!next) next = "";
      lColRaw = color;
      if (lCol !== next && rb) {
        try {
          rb.style.washColor = next;
          lCol = next;
        } catch (e) {
          lCol = null;
        }
      }
    },
    setLayerColors: function (healColor, deltaColor, bulletShieldColor) {
      if (lHealRaw !== healColor || lHeal === null) {
        lHealRaw = healColor;
        var nextHeal = normalizeWashColor(healColor) || "#5fff80";
        if (lHeal !== nextHeal && heal && heal.style) {
          try {
            heal.style.washColor = nextHeal;
            lHeal = nextHeal;
          } catch (eHeal) {
            lHeal = null;
          }
        }
      }
      if (lDeltaRaw !== deltaColor || lDelta === null) {
        lDeltaRaw = deltaColor;
        var nextDelta = normalizeWashColor(deltaColor) || "#ffe55b";
        if (lDelta !== nextDelta && delta && delta.style) {
          try {
            delta.style.washColor = nextDelta;
            lDelta = nextDelta;
          } catch (eDelta) {
            lDelta = null;
          }
        }
      }
      if (lBulletShieldRaw !== bulletShieldColor || lBulletShield === null) {
        lBulletShieldRaw = bulletShieldColor;
        var nextBulletShield =
          normalizeWashColor(bulletShieldColor) || "#ffffff";
        if (
          lBulletShield !== nextBulletShield &&
          bulletShield &&
          bulletShield.style
        ) {
          try {
            bulletShield.style.backgroundColor = nextBulletShield;
            lBulletShield = nextBulletShield;
          } catch (eBulletShield) {
            lBulletShield = null;
          }
        }
      }
    },
    clearLayerColors: function () {
      if (heal && heal.style) {
        try {
          heal.style.washColor = "";
        } catch (eHealClear) {}
      }
      if (delta && delta.style) {
        try {
          delta.style.washColor = "";
        } catch (eDeltaClear) {}
      }
      if (bulletShield && bulletShield.style) {
        try {
          bulletShield.style.backgroundColor = "";
        } catch (eBulletShieldClear) {}
      }
      lHeal = lDelta = lBulletShield = null;
      lHealRaw = lDeltaRaw = lBulletShieldRaw = null;
    },
    setUltColor: function (color) {
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
      if (lUltRaw === color && lUlt) return;
      var next = normalizeWashColor(color) || CSS_TEAM_ENEMY_COLOR;
      lUltRaw = color;
      if (lUlt !== next) {
        try {
          ui.style.washColor = next;
          lUlt = next;
        } catch (e) {
          lUlt = null;
        }
      }
    },
    clearUltColor: function () {
      lUltRaw = null;
      if (ui && ui.style && lUlt !== "") {
        try {
          ui.style.washColor = "";
          lUlt = "";
        } catch (eClearUlt) {
          lUlt = null;
        }
      }
    },
    setTextColor: function (color) {
      if (lTxtRaw === color && lTxt) return;
      var next = normalizeWashColor(color);
      if (!hc || !hc.style) return;
      lTxtRaw = color;
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
    setHpReadoutVisible: function (visible) {
      sHCV(visible);
    },
    applyHpReadout: function (current, max, lowMode) {
      if (!cfg.hp_counter_visible) {
        this.setHpReadoutVisible(false);
        return;
      }
      if (!hc || (current === lSH && max === lSM && !!lowMode === lCounterLowMode)) return;
      this.setHpReadoutVisible(true);
      var fmt = cfg.hp_counter_format | 0;
      var text;
      if (fmt === 1) {
        text = (max > 0 ? Math.round((current / max) * 100) : 0) + "%";
      } else if (fmt === 2) {
        text = String(current);
      } else {
        text = current + " / " + max;
      }
      try {
        if (hc.text !== text) hc.text = text;
      } catch (eText) {
        try {
          hc.SetAttributeString("text", text);
        } catch (eTextAttr) {}
      }
      var nextCounterLowMode = Boolean(lowMode);
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
      lSH = current;
      lSM = max;
    },
    applyPipVisibility: function (visibility) {
      if (!pl || !pl.style) return;
      try {
        if (lPipVis !== visibility) {
          pl.style.visibility = visibility;
          lPipVis = visibility;
        }
      } catch (ePipVisibility) {
        lPipVis = null;
      }
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
      if (heal && heal.style && lHeal) {
        try {
          if (normalizeWashColor(String(heal.style.washColor || "")) !== lHeal)
            return true;
        } catch (eHealDrift) {}
      }
      if (delta && delta.style && lDelta) {
        try {
          if (normalizeWashColor(String(delta.style.washColor || "")) !== lDelta)
            return true;
        } catch (eDeltaDrift) {}
      }
      if (bulletShield && bulletShield.style && lBulletShield) {
        try {
          if (
            normalizeWashColor(String(bulletShield.style.backgroundColor || "")) !==
            lBulletShield
          )
            return true;
        } catch (eBulletShieldDrift) {}
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
    var target = panel || allyOwnedPanel;
    var flags =
      target && target.IsValid && target.IsValid() ? scanAllyFlags(target) : 0;
    allyColorActive = false;
    noAllyParentWidthFrames = 0;
    lColA = null;
    lColARaw = null;
    lHealA = null;
    lDeltaA = null;
    lBulletShieldA = null;
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
      if (healA && healA.style) {
        try {
          healA.style.washColor = "";
        } catch (eHealReset) {}
      }
      if (deltaA && deltaA.style) {
        try {
          deltaA.style.washColor = "";
        } catch (eDeltaReset) {}
      }
      if (bulletShieldA && bulletShieldA.style) {
        try {
          bulletShieldA.style.backgroundColor = "";
        } catch (eBulletShieldReset) {}
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
  function findDirectChildById(parent, id) {
    if (!parent || !parent.Children) return null;
    try {
      var children = parent.Children();
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child && child.id === id) return child;
      }
    } catch (eChildren) {}
    return null;
  }


  function isConfirmedAllyHealthbar(flags) {
    return UnitStatusTargetClassifier.isFriendlyTargetHealthbar(flags);
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


  var lKzVis = null,
    lKzX = null,
    lKzW = null,
    lKzColor = null,
    lKzAppliedColor = null,
    lKzOp = null,
    lKzZi = null,
    lKzSig = null;


  function hasAllyBarStyleDrift(panel) {
    if (!panel || !panel.style || !lColA) return false;
    try {
      return normalizeWashColor(String(panel.style.washColor || "")) !== lColA;
    } catch (e) {}
    return false;
  }

  function hasAllyStyleDrift(panel) {
    if (hasAllyBarStyleDrift(panel)) return true;
    if (healA && healA.style && lHealA) {
      try {
        if (normalizeWashColor(String(healA.style.washColor || "")) !== lHealA)
          return true;
      } catch (eHealDriftA) {}
    }
    if (deltaA && deltaA.style && lDeltaA) {
      try {
        if (normalizeWashColor(String(deltaA.style.washColor || "")) !== lDeltaA)
          return true;
      } catch (eDeltaDriftA) {}
    }
    if (bulletShieldA && bulletShieldA.style && lBulletShieldA) {
      try {
        if (
          normalizeWashColor(
            String(bulletShieldA.style.backgroundColor || ""),
          ) !== lBulletShieldA
        )
          return true;
      } catch (eBulletShieldDriftA) {}
    }
    return false;
  }

  function styleDriftCheckDelayMs() {
    if (styleDriftCleanFrames >= 8) return STYLE_DRIFT_CHECK_SLOW_MS;
    if (styleDriftCleanFrames >= 3) return STYLE_DRIFT_CHECK_MID_MS;
    return STYLE_DRIFT_CHECK_MS;
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

  function resetIgnoredTargetVisuals(defaultColor, clearUlt) {
    var beforeSig =
      String(defaultColor || "") +
      "|" +
      (clearUlt ? "clear" : "set") +
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
    UnitStatusOverlayAdapter.clearLayerColors();
    sHCV(false);
    sKZ(false, 0);
    UnitStatusOverlayAdapter.setEnemyBarColor(defaultColor || "");
    if (clearUlt) UnitStatusOverlayAdapter.clearUltColor();
    else UnitStatusOverlayAdapter.setUltColor(defaultColor || "");
    UnitStatusOverlayAdapter.setTextColor(WHITE_WASH);
    UnitStatusOverlayAdapter.setBarVisible(true);
    ignoredVisualSig =
      String(defaultColor || "") +
      "|" +
      (clearUlt ? "clear" : "set") +
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
    UnitStatusOverlayAdapter.setBarVisible(true);
    UnitStatusOverlayAdapter.clearUltColor();
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
      heal === lastHealPanel &&
      delta === lastDeltaPanel &&
      bulletShield === lastBulletShieldPanel &&
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
    lastHealPanel = heal;
    lastDeltaPanel = delta;
    lastBulletShieldPanel = bulletShield;
    lastUnitName = unitName;
    panelGeneration++;
    colorGeneration = -1;
    lastEnemyPresetGeneration = -1;
    lastAllyPresetGeneration = -1;
    panelBornAt = _ts();
    lastStyleReapplyAt = panelBornAt;
    UnitStatusOverlayAdapter.invalidateEnemyVisualCaches();
    clearPulse();
    allyColorActive = false;
    allyOwnedPanel = null;
    lastAllyPanel = null;
    ihc = null;
    rbA = null;
    cpA = null;
    healA = null;
    deltaA = null;
    bulletShieldA = null;
    lColA = null;
    lHealA = null;
    lDeltaA = null;
    lBulletShieldA = null;
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
    lTx = null;
    cMax = 0;
    pPct = -1;
    sFC = 0;
    noParentWidthFrames = 0;
    nonEnemyExitFrames = 0;
    neutralExitFrames = 0;
    buildingNotEnemyExitFrames = 0;
    stableCurrentRedBarFrames = 0;
    lCounterLowMode = false;
    lastEnemyTeamId = lastEnemyFlags = null;
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
    if (heal && heal.style) {
      try {
        heal.style.washColor = "";
      } catch (eHealWash) {}
    }
    if (delta && delta.style) {
      try {
        delta.style.washColor = "";
      } catch (eDeltaWash) {}
    }
    if (bulletShield && bulletShield.style) {
      try {
        bulletShield.style.backgroundColor = "";
      } catch (eBulletShieldWash) {}
    }
    lHeal = null;
    lDelta = null;
    lBulletShield = null;
    lHealRaw = null;
    lDeltaRaw = null;
    lBulletShieldRaw = null;

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
    UnitStatusOverlayAdapter.resetStyleDriftBackoff();
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
          wr.RemoveClass(LEVEL_TIERS[i].cls);
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
    scheduleLoop(kind, delay || 0.05, kind === LOOP_ENEMY ? "enemy_paint" : kind === LOOP_ALLY ? "ally_paint" : "level_poll");
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
    scheduleRuntimeQuiescentCheck();
  }

  function applyCurrentSettings(isEnemy) {
    refreshDerivedConfig();
    UnitStatusOverlayAdapter.setBarVisible(!isEnemy || !!cfg.hp_bg_visible);
    if (cfg.hp_counter_visible) sHCS(lCounterLowMode);
    else sHCV(false);
    UnitStatusOverlayAdapter.applyLayout();
    lastStyleReapplyAt = _ts();
    UnitStatusOverlayAdapter.resetStyleDriftBackoff();
    lW = -1;
    lHp = -1;
    settingsDirty = false;
    settingsRefreshHoldUntil = 0;
  }

  var HP_READOUT_PLAN = {
    hasPipVisible: false,
    pipVisible: "",
    counterAction: 0,
    current: 0,
    max: 0,
    lowMode: false,
  };


  var HpReadoutPolicy = {
    parseMax: function (text) {
      if (text === lTx) return cMax;
      lTx = text;
      var p = 0;
      var q = 0;
      var leadingMinorPips = 0;
      var fi = text.indexOf("|");
      var li = text.lastIndexOf("|");
      for (var i = 0; i < text.length; i++) {
        var c = text.charCodeAt(i);
        if (c === 124) {
          p++;
        } else if (c === 34 || c === 39) {
          if (fi !== -1 && i < fi) leadingMinorPips++;
          if (li === -1 || i > li) q++;
        }
      }
      var minorPipHp = cfg.hp_precise_pips_enabled ? 10 : 100;
      var majorPipHp =
        leadingMinorPips > 0 ? (leadingMinorPips + 1) * minorPipHp : 500;
      cMax = p * majorPipHp + q * minorPipHp;
      return cMax;
    },
    reset: function (plan) {
      plan.hasPipVisible = false;
      plan.pipVisible = "";
      plan.counterAction = 0;
      plan.current = 0;
      plan.max = 0;
      plan.lowMode = false;
      return plan;
    },
    enemy: function (hp, pulsePlan, hasPipPanel, pipText, hasCounterPanels, liveBarWidth, liveBarParentWidth, plan) {
      plan = this.reset(plan || HP_READOUT_PLAN);
      var counterVisible = Boolean(cfg.hp_counter_visible);
      var fmt = cfg.hp_counter_format | 0;
      plan.hasPipVisible = Boolean(hasPipPanel);
      plan.pipVisible = cfg.hp_pip_visible ? "visible" : "collapse";
      if (!counterVisible) {
        plan.counterAction = 2;
        return plan;
      }
      if (!hasCounterPanels) return plan;
      plan.counterAction = 1;
      plan.lowMode = Boolean(pulsePlan && pulsePlan.shouldPulse && pulsePlan.textEnabled);
      if (fmt === 1) {
        plan.current = hp;
        plan.max = 100;
        return plan;
      }
      var ratio = liveBarParentWidth > 0 ? liveBarWidth / liveBarParentWidth : 0;
      var maxHp = this.parseMax(pipText || "");
      plan.max = maxHp;
      plan.current = ratio >= 0.97 ? maxHp : Math.round(maxHp * ratio);
      return plan;
    },
  };

  function applyHpReadoutPlan(plan) {
    if (plan.hasPipVisible) UnitStatusOverlayAdapter.applyPipVisibility(plan.pipVisible);
    if (plan.counterAction === 1) {
      UnitStatusOverlayAdapter.applyHpReadout(plan.current, plan.max, plan.lowMode);
    } else if (plan.counterAction === 2) {
      UnitStatusOverlayAdapter.setHpReadoutVisible(false);
    }
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
    var counterVisible = Boolean(cfg.hp_counter_visible);
    var fmt = cfg.hp_counter_format | 0;
    var txt = "";
    var hasPipPanel = Boolean(pl);
    if (hasPipPanel) {
      try {
        if (counterVisible && fmt !== 1)
          txt = pl.text || pl.GetAttributeString("text", "") || "";
      } catch (e) {
        txt = "";
        lPipVis = null;
      }
    }
    var hasCounterPanels = Boolean(counterVisible && lb && lbp);
    var liveBarWidth = 0;
    var liveBarParentWidth = 0;
    if (hasCounterPanels && fmt !== 1) {
      liveBarWidth = lb.actuallayoutwidth || 0;
      liveBarParentWidth = lbp.actuallayoutwidth || 0;
    }
    var pulsePlan = LowHpPulsePolicy.enemy(shouldPulse, _ts(), ENEMY_PULSE_PLAN);
    var plan = HpReadoutPolicy.enemy(
      hp,
      pulsePlan,
      hasPipPanel,
      txt,
      hasCounterPanels,
      liveBarWidth,
      liveBarParentWidth,
      HP_READOUT_PLAN,
    );
    applyHpReadoutPlan(plan);
  }

  var ENEMY_HEALTH_PAINT_PLAN = {
    barVisible: false,
    barColor: "",
    textColor: "",
    healColor: "",
    deltaColor: "",
    clearPulse: false,
    stopAfterApply: false,
    nextDelay: 0.15,
  };

  var AllyHealthPaintPolicy = {
    ally: function (snapshot, plan) {
      plan.washColor = "";
      plan.inPulse = false;
      plan.healColor = "";
      plan.deltaColor = "";
      plan.nextDelay = 0.35;
      var hp = snapshot.hp;
      var low = dc.low;
      var high = dc.high;
      var color;
      plan.inPulse = Boolean(cfg.hp_friend_pulse_enabled && hp <= dc.friendPulseThreshold);
      if (plan.inPulse) plan.nextDelay = 0.15;
      if (plan.inPulse && cfg.hp_friend_pulse_color_enabled) color = cfg.hp_friend_pulse_color;
      else if (hp <= low) color = cfg.hp_friend_color_low;
      else if (hp <= high) {
        color = cfg.hp_mode === 1 ? ipHex(cfg.hp_friend_color_low, cfg.hp_friend_color_mid, (hp - low) / dc.denomMid) : cfg.hp_friend_color_mid;
      } else {
        color = cfg.hp_mode === 1 ? ipHex(cfg.hp_friend_color_mid, cfg.hp_friend_color_high, (hp - high) / dc.denomHigh) : cfg.hp_friend_color_high;
      }
      plan.washColor = normalizeWashColor(color);
      plan.healColor = normalizeWashColor(cfg.hp_friend_heal_color);
      plan.deltaColor = normalizeWashColor(cfg.hp_friend_delta_color);
      plan.bulletShieldColor = normalizeWashColor(cfg.hp_friend_bullet_shield_color);
      return plan;
    },
  };

  const HealthStatePaintPlan = {
    resetEnemy: function (plan) {
      plan.barVisible = false;
      plan.barColor = "";
      plan.textColor = "";
      plan.healColor = "";
      plan.deltaColor = "";
      plan.clearPulse = false;
      plan.stopAfterApply = false;
      plan.nextDelay = 0.15;
      return plan;
    },
    enemy: function (hp, prevHp, now, shouldPulse, plan) {
      plan = this.resetEnemy(plan || ENEMY_HEALTH_PAINT_PLAN);
      var low = dc.low;
      var high = dc.high;
      var pulseThresh = dc.pulseThreshold;
      var cl;
      plan.barVisible = shouldPulse && cfg.hp_pulse_hide_bar ? false : !!cfg.hp_bg_visible;
      if (isEnemyPaintWarmup(hp, prevHp, now)) {
        var warmupCol = getHighColor();
        plan.clearPulse = true;
        plan.barColor = warmupCol;
        plan.textColor = getTextColor(100, low, high);
        plan.nextDelay = 0.05;
        plan.stopAfterApply = true;
        return plan;
      }
      if (hp <= low) {
        cl = cfg.hp_color_low;
        plan.textColor =
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
            plan.nextDelay =
              ENEMY_IDLE_BACKOFF[Math.min(Math.floor((sFC - 5) / 5), 3)];
        }
        plan.textColor =
          cfg.hp_mode === 1
            ? getGradientTextColor(hp, low, high)
            : getTextColor(hp, low, high);
      }
      plan.barColor = shouldPulse ? getPulseBarColor(cl, hp, pulseThresh) : cl;
      plan.healColor = cfg.hp_heal_color;
      plan.deltaColor = cfg.hp_delta_color;
      plan.bulletShieldColor = cfg.hp_bullet_shield_color;
      return plan;
    },
  };

  function paintEnemyHealthState(hp, prevHp, now, shouldPulse) {
    var plan = HealthStatePaintPlan.enemy(
      hp,
      prevHp,
      now,
      shouldPulse,
      ENEMY_HEALTH_PAINT_PLAN,
    );
    UnitStatusOverlayAdapter.setBarVisible(plan.barVisible);
    if (plan.clearPulse) clearPulse();
    UnitStatusOverlayAdapter.setEnemyBarColor(plan.barColor);
    UnitStatusOverlayAdapter.setLayerColors(plan.healColor, plan.deltaColor, plan.bulletShieldColor);
    UnitStatusOverlayAdapter.setUltColor(plan.barColor);
    UnitStatusOverlayAdapter.setTextColor(plan.textColor);
    return plan.stopAfterApply ? -1 : plan.nextDelay;
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
          scheduleLoop(LOOP_ENEMY, 0.15, "enemy_probe_missing_bar");
          return;
        }
      } else {
        if (shouldProbeCurrentRedBar(now))
          reboundCurrentRb = UnitStatusOverlayAdapter.refreshCurrentRedBar(now, false);
      }
      if (!cached && !tryCache()) {
        scheduleLoop(LOOP_ENEMY, cacheProbeLoopDelay(now), "enemy_cache_missing");
        return;
      }
      if (rb.GetParent) {
        var p = rb.GetParent();
        if (cp !== p) cp = p;
      }
      if (!reboundCurrentRb && shouldProbeCurrentRedBar(now))
        refreshRedBarFromParentChildren(now, false);
      resetStyleStateForNewPanels();

      var target = UnitStatusTargetClassifier.classify(
        rb,
        cp,
        UNIT_STATUS_TARGET_SNAPSHOT,
      );
      var isEnemy = target.isEnemy;
      var decision = ENEMY_LOOP_DECISION;
      if (lastEnemyPresetGeneration !== presetGeneration) {
        lastEnemyPresetGeneration = presetGeneration;
        settingsDirty = true;
        settingsRefreshHoldUntil = 0;
        UnitStatusOverlayAdapter.invalidateEnemyVisualCaches();
      }
      if (
        target.teamId !== lastEnemyTeamId ||
        target.flags !== lastEnemyFlags
      ) {
        lastEnemyTeamId = target.teamId;
        lastEnemyFlags = target.flags;
        UnitStatusOverlayAdapter.invalidateEnemyVisualCaches();
        settingsDirty = true;
        settingsRefreshHoldUntil = now;
        allySettingsDirty = true;
        allySettingsRefreshHoldUntil = now;
        lLvVis = null;
        requestCurrentRedBarRefresh();
      }
      if (cfg.hp_skip_buildings && target.isBuilding) {
        ENEMY_LOOP_STATE.skipBuildings = !!cfg.hp_skip_buildings;
        ENEMY_LOOP_STATE.friendEnabled = !!cfg.hp_friend_enabled;
        ENEMY_LOOP_STATE.buildingFrames = buildingNotEnemyExitFrames + 1;
        decision = EnemyHealthbarLoopPolicy.decide(target, now, ENEMY_LOOP_STATE, decision);
        buildingNotEnemyExitFrames++;
        nonEnemyExitFrames = 0;
        if (target.isFriendly || target.isFriendlyBuilding) {
          resetIgnoredTargetVisuals(WHITE_WASH, true);
          if (cfg.hp_friend_enabled) parkEnemyLoopForFriendlyTarget();
        } else {
          resetIgnoredTargetVisuals(target.ignoredColor, false);
        }
        scheduleLoop(LOOP_ENEMY, decision.delay, decision.reason);
        return;
      }
      var wasDirty = settingsDirty;
      if (isEnemy && now - lastStyleReapplyAt >= STYLE_REAPPLY_WATCHDOG_MS) {
        lastStyleReapplyAt = now;
        if (UnitStatusOverlayAdapter.hasEnemyStyleDrift()) {
          UnitStatusOverlayAdapter.invalidateEnemyVisualCaches();
          settingsDirty = true;
          settingsRefreshHoldUntil = now;
          wasDirty = true;
        }
      }

      // Neutral unit
      if (target.isNeutral) {
        ENEMY_LOOP_STATE.neutralFrames = neutralExitFrames + 1;
        decision = EnemyHealthbarLoopPolicy.decide(target, now, ENEMY_LOOP_STATE, decision);
        clearPulse();
        neutralExitFrames++;
        nonEnemyExitFrames = 0;
        buildingNotEnemyExitFrames = 0;
        UnitStatusOverlayAdapter.setBarVisible(true);
        sKZ(false, 0);
        sHCV(false);
        UnitStatusOverlayAdapter.setEnemyBarColor(target.ignoredColor);
        UnitStatusOverlayAdapter.setUltColor(target.ignoredColor);
        lUT = now;
        scheduleLoop(LOOP_ENEMY, decision.delay, decision.reason);
        return;
      }
      // Not an enemy â€” skip coloring
      if (!isEnemy) {
        nonEnemyExitFrames++;
        neutralExitFrames = 0;
        buildingNotEnemyExitFrames = 0;
        var friendNonEnemy = !!(
          (target.isFriendly || target.isFriendlyBuilding) &&
          cfg.hp_friend_enabled
        );
        ENEMY_LOOP_STATE.friendEnabled = !!cfg.hp_friend_enabled;
        ENEMY_LOOP_STATE.nonEnemyFrames = nonEnemyExitFrames;
        decision = EnemyHealthbarLoopPolicy.decide(target, now, ENEMY_LOOP_STATE, decision);
        if (target.isFriendly || target.isFriendlyBuilding) {
          resetIgnoredTargetVisuals(WHITE_WASH, true);
          if (friendNonEnemy) {
            parkEnemyLoopForFriendlyTarget();
            maybeKickAllyLoopForFriendlyTarget(now);
          }
        } else {
          resetIgnoredTargetVisuals(target.ignoredColor, false);
        }
        lUT = now;
        scheduleLoop(LOOP_ENEMY, decision.delay, decision.reason);
        return;
      }
      nonEnemyExitFrames = 0;
      neutralExitFrames = 0;
      buildingNotEnemyExitFrames = 0;
      if (settingsDirty) {
        if (now < settingsRefreshHoldUntil) {
          scheduleLoop(LOOP_ENEMY, 0.05, "enemy_dirty_hold");
          return;
        }
        applyCurrentSettings(isEnemy);
      }

      if (!presetApplied) {
        UnitStatusOverlayAdapter.setEnemyBarColor(CSS_TEAM_ENEMY_COLOR);
        UnitStatusOverlayAdapter.setUltColor(CSS_TEAM_ENEMY_COLOR);
        UnitStatusOverlayAdapter.setTextColor(WHITE_WASH);
        ENEMY_LOOP_STATE.presetReady = false;
        decision = EnemyHealthbarLoopPolicy.decide(target, now, ENEMY_LOOP_STATE, decision);
        scheduleLoop(LOOP_ENEMY, decision.delay, decision.reason);
        return;
      }
      var w = target.barWidth;
      var pw = target.parentWidth;
      ENEMY_LOOP_STATE.skipBuildings = !!cfg.hp_skip_buildings;
      ENEMY_LOOP_STATE.friendEnabled = !!cfg.hp_friend_enabled;
      ENEMY_LOOP_STATE.settingsDirty = !!settingsDirty;
      ENEMY_LOOP_STATE.settingsHold = now < settingsRefreshHoldUntil;
      ENEMY_LOOP_STATE.presetReady = !!presetApplied;
      ENEMY_LOOP_STATE.styleDrift = false;
      ENEMY_LOOP_STATE.barWidth = w;
      ENEMY_LOOP_STATE.parentWidth = pw;
      ENEMY_LOOP_STATE.lastBarWidth = lW;
      ENEMY_LOOP_STATE.lastParentWidth = lPW;
      ENEMY_LOOP_STATE.lastUpdateAt = lUT;
      ENEMY_LOOP_STATE.low = dc.low;
      ENEMY_LOOP_STATE.lastHp = lHp;
      ENEMY_LOOP_STATE.pulseActive = !!pulse;
      ENEMY_LOOP_STATE.pulseTextEnabled = !!cfg.hp_pulse_text_enabled;
      ENEMY_LOOP_STATE.pulseEnabled = !!cfg.hp_pulse_enabled;
      ENEMY_LOOP_STATE.pulseThreshold = dc.pulseThreshold;
      ENEMY_LOOP_STATE.wasDirty = !!wasDirty;
      ENEMY_LOOP_STATE.colorGeneration = colorGeneration;
      ENEMY_LOOP_STATE.panelGeneration = panelGeneration;
      ENEMY_LOOP_STATE.noParentWidthFrames = noParentWidthFrames + (pw <= 0 ? 1 : 0);
      decision = EnemyHealthbarLoopPolicy.decide(target, now, ENEMY_LOOP_STATE, decision);
      var jsPulseTick = !!(pulse && cfg.hp_pulse_text_enabled);
      // No change in width â€” back off
      if (
        w === lW &&
        pw === lPW &&
        !jsPulseTick &&
        !wasDirty &&
        colorGeneration === panelGeneration
      ) {
        stableCurrentRedBarFrames++;
        if (isEnemy && now >= nextStyleDriftCheckAt) {
          nextStyleDriftCheckAt = now + styleDriftCheckDelayMs();
          if (UnitStatusOverlayAdapter.hasEnemyBarStyleDrift()) {
            UnitStatusOverlayAdapter.resetStyleDriftBackoff();
            UnitStatusOverlayAdapter.invalidateEnemyVisualCaches();
            settingsDirty = true;
            settingsRefreshHoldUntil = now;
            lW = -1;
            lHp = -1;
            scheduleLoop(LOOP_ENEMY, 0.05, "enemy_style_drift");
            return;
          }
          styleDriftCleanFrames++;
        }
        scheduleLoop(LOOP_ENEMY, decision.delay, decision.reason);
        return;
      }
      stableCurrentRedBarFrames = 0;
      lW = w;
      lPW = pw;
      lUT = now;
      if (pw <= 0) {
        noParentWidthFrames++;
        UnitStatusOverlayAdapter.setEnemyBarColor(getHighColor());
        sKZ(false, 0);
        scheduleLoop(LOOP_ENEMY, decision.delay, decision.reason);
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
        !(cfg.hp_pulse_text_enabled && (pulse || shouldPulse)) &&
        !wasDirty
      ) {
        scheduleLoop(LOOP_ENEMY, decision.delay, decision.reason);
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
        scheduleLoop(LOOP_ENEMY, 0.05, "enemy_dirty_hold");
        return;
      }
      var pulseFast = syncEnemyPulse(shouldPulse, now);
      if (pulseFast) sc = 0.1;
      colorGeneration = panelGeneration;

      scheduleLoop(LOOP_ENEMY, sc, pulseFast ? "enemy_pulse" : "enemy_paint");
    } catch (e) {
      scheduleLoop(LOOP_ENEMY, 0.5, "enemy_error");
    } finally {
    }
  }

  // â”€â”€ Level tier coloring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var LEVEL_TIERS = [{min:11,cls:"level_tier2"},{min:19,cls:"level_tier3"},{min:27,cls:"level_tier4"},{min:35,cls:"level_tier5"}];
  var LV_VIS_CLASS = "level_number_visible";
  var ll = null,
    lc = null,
    wr = null,
    lLv = -1,
    lLvVis = null;

  var LevelTierPolicy = {
    parse: function (text) {
      if (!text || text.charCodeAt(0) === 123) return 0;
      var level = 0;
      for (var i = 0; i < text.length; i++) {
        var digit = text.charCodeAt(i) - 48;
        if (digit >= 0 && digit <= 9) level = level * 10 + digit;
      }
      return level;
    },
    classFor: function (level) {
      for (var tier = LEVEL_TIERS.length - 1; tier >= 0; tier--) {
        if (level >= LEVEL_TIERS[tier].min) return LEVEL_TIERS[tier].cls;
      }
      return "";
    },
  };

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
    var level = LevelTierPolicy.parse(text);
    if (level === lLv || !level) return false;
    lLv = level;
    for (var j = 0; j < LEVEL_TIERS.length; j++) wr.RemoveClass(LEVEL_TIERS[j].cls);
    var tierClass = LevelTierPolicy.classFor(level);
    if (tierClass) wr.AddClass(tierClass);
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
    scheduleLoop(LOOP_LEVEL, lLNoChange > 10 ? 5.0 : 0.5, lLNoChange > 10 ? "level_backoff" : "level_poll");
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
            scheduleLoop(LOOP_ALLY, 2.5, "ally_missing_building");
            return;
          }
          if (lastRedBarResolveRejectFlags) {
            scheduleLoop(LOOP_ALLY, 1.2, "ally_missing_rejected");
            return;
          }
          scheduleLoop(LOOP_ALLY, aIdleMiss > 75 ? 3.0 : 0.2, "ally_missing_bar");
          return;
        }
        _allyScanPanel = null;
        _allyScanAt = 0;
        _allyScanFlags = 0;
      }
      aIdleMiss = 0;
      if (rbA.GetParent) {
        var pa = rbA.GetParent();
        if (cpA !== pa) {
          cpA = pa;
          healA = null;
          deltaA = null;
          bulletShieldA = null;
          lHealA = null;
          lDeltaA = null;
          lBulletShieldA = null;
        }
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
          scheduleLoop(LOOP_ALLY, 0.05, "ally_dirty_hold");
          return;
        }
        allySettingsDirty = false;
        resetAllyState(allyOwnedPanel, false);
      }

      var allyTarget = UnitStatusTargetClassifier.classifyAlly(
        rbA,
        ALLY_STATUS_TARGET_SNAPSHOT,
      );
      var f2 = allyTarget.flags;

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
          scheduleLoop(LOOP_ALLY, 0.1, "ally_rebind");
          return;
        }
        scheduleLoop(LOOP_ALLY, allyUnconfirmedFrames < 4 ? 1.2 : allyUnconfirmedFrames < 12 ? 2.0 : 3.0, "ally_unconfirmed");
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
        scheduleLoop(LOOP_ALLY, noAllyParentWidthFrames < 4 ? 0.2 : noAllyParentWidthFrames < 12 ? 0.4 : 0.8, "ally_no_parent_width");
        return;
      }
      noAllyParentWidthFrames = 0;
      var allyWidthStable = aw === lWA && apw === lPWA;

      if (allyWidthStable && !pulseA) {
        if (now >= nextAllyStyleDriftCheckAt) {
          nextAllyStyleDriftCheckAt = now + (sfcA >= 3 ? 2500 : 1200);
          if (hasAllyStyleDrift(rbA)) {
            lColA = null;
          } else {
            sfcA++;
            var scIdle = ALLY_IDLE_BACKOFF[Math.min(Math.floor(sfcA / 3), 4)];
            scheduleLoop(LOOP_ALLY, scIdle, "ally_stable");
            return;
          }
        } else {
          sfcA++;
          var scIdleFast = ALLY_IDLE_BACKOFF[Math.min(Math.floor(sfcA / 3), 4)];
          scheduleLoop(LOOP_ALLY, scIdleFast, "ally_stable");
          return;
        }
      }
      lWA = aw;
      lPWA = apw;

      var ahp = ((aw / apw) * 100) | 0;
      var prevHpA = lHpA;
      ALLY_SNAPSHOT.hp = ahp;
      var allyPlan = AllyHealthPaintPolicy.ally(
        ALLY_SNAPSHOT,
        ALLY_PAINT_PLAN,
      );
      if (!vPanel(healA)) healA = findDirectChildById(cpA, ID_UNIT_HEALTHBAR_HEALING);
      if (!vPanel(deltaA)) deltaA = findDirectChildById(cpA, ID_UNIT_HEALTHBAR_DELTA);
      if (!vPanel(bulletShieldA)) bulletShieldA = findDirectChildById(cpA, ID_UNIT_HEALTHBAR_BULLET_SHIELD);
      var acl = allyPlan.washColor;
      var inPulse = allyPlan.inPulse;
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
      if (lHealA !== allyPlan.healColor && healA && healA.style) {
        try {
          healA.style.washColor = allyPlan.healColor;
          lHealA = allyPlan.healColor;
        } catch (eHealA) {
          lHealA = null;
        }
      }
      if (lDeltaA !== allyPlan.deltaColor && deltaA && deltaA.style) {
        try {
          deltaA.style.washColor = allyPlan.deltaColor;
          lDeltaA = allyPlan.deltaColor;
        } catch (eDeltaA) {
          lDeltaA = null;
        }
      }
      if (lBulletShieldA !== allyPlan.bulletShieldColor && bulletShieldA && bulletShieldA.style) {
        try {
          bulletShieldA.style.backgroundColor = allyPlan.bulletShieldColor;
          lBulletShieldA = allyPlan.bulletShieldColor;
        } catch (eBulletShieldA) {
          lBulletShieldA = null;
        }
      }

      var hadPulseA = !!pulseA;
      var allyPulseStarted = syncAllyPulse(rbA, inPulse);
      var allyPulseCleared = !inPulse && hadPulseA;
      var sc = allyPlan.nextDelay;
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

      scheduleLoop(LOOP_ALLY, sc, "ally_paint");
    } catch (e) {
      scheduleLoop(LOOP_ALLY, 0.5, "ally_error");
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
