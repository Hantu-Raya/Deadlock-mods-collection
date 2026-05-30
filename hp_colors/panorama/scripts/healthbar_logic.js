'use strict';
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
    hp_kill_zone_width: 3
  };
  var RUNTIME_OPTIMIZED_PROFILE = true;
  var OPTIMIZED_FORCED_VALUES = {
    hp_mode: 0,
    hp_skip_buildings: true,
    hp_ult_color_enabled: false,
    hp_pulse_enabled: false,
    hp_pulse_text_enabled: false,
    hp_pulse_color_enabled: false,
    hp_friend_enabled: false,
    hp_friend_pulse_enabled: false,
    hp_friend_pulse_color_enabled: false,
    hp_kill_zone_enabled: false
  };
  var cfg = {};
  var dc = {};
  var TEAM1_HIGH = "#FFC961";
  var TEAM2_HIGH = "#6485FC";
  var CSS_TEAM1_COLOR = "#E7B659";
  var CSS_TEAM2_COLOR = "#5B79E6";
  var CSS_TEAM_ENEMY_COLOR = "#E16161";
  var CSS_TEAM_FRIEND_COLOR = "#FFEFD7";
  

  var WHITE_WASH = "#ffffff";
  var LP = 'low_hp_pulsing';
  var _ts = Date.now ? Date.now.bind(Date) : function() { return +(new Date()); };
  var PULSE_INTENSITY = ['pulse_subtle', '', 'pulse_intense'];
  var ENEMY_IDLE_BACKOFF = [0.35, 0.80, 1.50, 2.50];
  var ALLY_IDLE_BACKOFF = [0.35, 0.70, 1.40, 2.0, 2.0];
  var CURRENT_RB_RESCAN_MS = 180;
  var CURRENT_RB_IDLE_RESCAN_MS = 1200;
  var CURRENT_RB_REFRESH_WINDOW_MS = 1600;

  // ── Loop control ────────────────────────────────────────────────────────────
  var gRunning = false;
  var aRunning = false;
  var lRunning = false;

  // ── Pulse state ─────────────────────────────────────────────────────────────
  var pulse = 0;
  var lPD = null;
  var lPI = -1;
  var lTB = null;

  // ── Ally state ───────────────────────────────────────────────────────────────
  var rbA = null, cpA = null;
  var allyOwnedPanel = null;
  var lColA = null, lWA = -1, lPWA = -1, sfcA = 0, allyColorActive = false;
  var pulseA = 0, lPIA = -1;
  var aIdleMiss = 0;

  function getPulseTextSize(fallback) {
    return clampNum(cfg.hp_pulse_text_scale, 72, 320, fallback);
  }

  function applyPulseTextState() {
    if (!hc) return;
    try {
      if (!(pulse && cfg.hp_pulse_text_enabled)) {
        if (hc.style) hc.style.animationDuration = '';
        if (hc.style) hc.style.brightness = '';
        lTB = null;
      }
    } catch (e2) {}
  }

  function updatePulseTextBrightness(now) {
    if (!hc || !hc.style || !pulse || !cfg.hp_pulse_text_enabled) return;
    var bpm = clampNum(cfg.hp_pulse_bpm, 30, 300, 75);
    var period = Math.max(1, 60000 / bpm);
    var phase = (now % period) / period;
    var wave = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    var idx = clampNum(cfg.hp_pulse_intensity, 0, 2, 1) | 0;
    var hi = idx === 2 ? 2.0 : (idx === 0 ? 1.15 : 1.5);
    var lo = idx === 2 ? 0.55 : (idx === 0 ? 0.85 : 0.65);
    var next = (lo + (hi - lo) * wave).toFixed(2);
    if (lTB === next) return;
    try { hc.style.brightness = next; lTB = next; } catch (e) { lTB = null; }
  }

  function applyPulseDuration() {
    var bpm = Number(cfg.hp_pulse_bpm) || 75;
    if (bpm < 30) bpm = 30;
    if (bpm > 300) bpm = 300;
    var dur = (60 / bpm).toFixed(3) + 's';
    if (lPD === dur) return;
    lPD = dur;
    if (rb && rb.IsValid && rb.IsValid()) rb.style.animationDuration = dur;
    if (ui && ui.IsValid && ui.IsValid()) ui.style.animationDuration = dur;
  }

  function applyPulseIntensity() {
    var idx = Number(cfg.hp_pulse_intensity) | 0;
    if (idx < 0 || idx > 2) idx = 1;
    if (lPI === idx) return;
    var oldCls = lPI >= 0 ? PULSE_INTENSITY[lPI] : '';
    var newCls = PULSE_INTENSITY[idx];
    lPI = idx;
    if (oldCls) {
      try { if (rb && rb.IsValid && rb.IsValid()) rb.RemoveClass(oldCls); } catch (e) {}
      try { if (ui && ui.IsValid && ui.IsValid()) ui.RemoveClass(oldCls); } catch (e2) {}
    }
    if (newCls) {
      try { if (rb && rb.IsValid && rb.IsValid()) rb.AddClass(newCls); } catch (e3) {}
      try { if (ui && ui.IsValid && ui.IsValid()) ui.AddClass(newCls); } catch (e4) {}
    }
    if (pulse) applyPulseTextState();
  }

  function startPulse() {
    if (pulse) return;
    pulse = 1;
    lCol = lUlt = lTxt = null;
    try { if (rb) rb.AddClass(LP); } catch (e) {}
    try { if (ui) ui.AddClass(LP); } catch (e3) {}
    applyPulseIntensity();
    applyPulseDuration();
  }

  function clearPulsePanel(panel, oldCls) {
    if (!panel) return;
    try {
      panel.RemoveClass(LP);
      if (oldCls) panel.RemoveClass(oldCls);
      if (panel.style) {
        panel.style.animationDuration = '';
        panel.style.brightness = '';
      }
    } catch (e) {}
  }

  function clearPulse() {
    var oldCls = lPI >= 0 ? PULSE_INTENSITY[lPI] : '';
    pulse = 0; lPD = null; lPI = -1; lTB = null; lCol = lUlt = lTxt = null; lColRaw = lUltRaw = lTxtRaw = null;
    clearPulsePanel(rb, oldCls);
    clearPulsePanel(hc, oldCls);
    clearPulsePanel(ui, oldCls);
  }

  function clearAllyPulse(panel) {
    var oldCls = lPIA >= 0 ? PULSE_INTENSITY[lPIA] : '';
    pulseA = 0; lPIA = -1; lColA = null;
    clearPulsePanel(panel || allyOwnedPanel, oldCls);
  }

  function coerceCfgValue(id, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, id)) return value;

    var fallback = DEFAULTS[id];
    if (id === "hp_counter_position" || id === "hp_pulse_text_position") {
      var posX = 0;
      var posY = 200;
      var rawPos = value;

      if (rawPos && typeof rawPos === "object") {
        if (Array.isArray(rawPos)) {
          if (rawPos.length > 0) posX = clampNum(rawPos[0], 0, 400, 0);
          if (rawPos.length > 1) posY = clampNum(rawPos[1], -50, 400, 200);
        } else {
          if (Object.prototype.hasOwnProperty.call(rawPos, "x")) posX = clampNum(rawPos.x, 0, 400, 0);
          if (Object.prototype.hasOwnProperty.call(rawPos, "y")) posY = clampNum(rawPos.y, -50, 400, 200);
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
      }

      if (typeof rawPos === "number") {
        posY = clampNum(rawPos, -50, 400, 200);
      }

      return Math.round(posX) + "," + Math.round(posY);
    }

    if (typeof fallback === "boolean") {
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

    if (typeof fallback === "number") {
      var next = Number(value);
      if (!isFinite(next)) return fallback;
      return Math.round(next);
    }

    if (typeof fallback === "string") {
      return (typeof value === "string" && value.length > 0) ? value : fallback;
    }

    return value;
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
      if (!Object.prototype.hasOwnProperty.call(OPTIMIZED_FORCED_VALUES, k)) continue;
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
  var SHARED_CFG_RAW_KEY = "__hpColorsCfgRaw";
  var SHARED_DURABLE_CFG_RAW_KEY = "__hpColorsDurableCfgRaw";
  var SHARED_BOOTSTRAP_SEEN_KEY = "__hpColorsBootstrapSeen";
  var SHARED_FIRST_PAINT_PROBE_KEY = "__hpColorsFirstPaintProbe";
  var SHARED_PRESET_REQUEST_KEY = "__hpColorsPresetRequests";
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var PRESET_SNAPSHOT_MAGIC = "HP_COLORS_PRESET_SNAPSHOT";
  var PRESET_REQUEST_MAGIC = "HP_COLORS_PRESET_REQUEST";
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
    return id === "hp_low_threshold" ||
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
      id === "hp_friend_pulse_color";
  }

  function affectsEnemyPulseColorSetting(id) {
    return id === "hp_pulse_color_enabled" ||
      id === "hp_pulse_color" ||
      id === "hp_pulse_color_mode";
  }

  function markEnemyColorDirty() {
    settingsDirty = true;
    settingsRefreshHoldUntil = 0;
    lColRaw = null;
    lUltRaw = null;
    lW = -1;
    lHp = -1;
    if (cfg.hp_enabled) $.Schedule(0.01, gL);
  }

  function markAllyOutputDirty(replaySource) {
    if (!cfg.hp_friend_enabled) {
      allySettingsDirty = false;
      allySettingsRefreshHoldUntil = 0;
      return;
    }
    allySettingsDirty = true;
    allySettingsRefreshHoldUntil = replaySource ? (_ts() + 240) : 0;
    resetAllyLoopCache(allyOwnedPanel);
    $.Schedule(0.01, aL);
  }

  function forceReplayCurrentVisualState() {
    try { resetStyleStateForNewPanels(); } catch (eReset) {}
    try { invalidateEnemyVisualCaches(); } catch (eEnemy) {}
    try { resetAllyLoopCache(allyOwnedPanel); } catch (eAlly) {}
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
    if (cfg.hp_enabled) $.Schedule(0.01, gL);
    if (cfg.hp_friend_enabled) $.Schedule(0.01, aL);
    if (cfg.hp_level_number_visible) $.Schedule(0.01, lL);
  }
  var lastBootstrapRequestAt = 0;
  var lastDirectBootstrapAt = 0;
  var directBootstrapResyncUntil = 0;
  var directBootstrapLocked = false;
  var lastStyleReapplyAt = 0;
  var nextStyleDriftCheckAt = 0;
  var rootBootstrapRequestShared = null;
  var sharedCfgRaw = "";
  var _uiMissAt = 0;
  var UI_MISS_TTL_MS = 2000;

  function getRootPanel() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel || null;
  }

  function getSharedStore() {
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig) return GameUI.CustomUIConfig();
    } catch (e) {}
    return null;
  }

  function snapshotCfg() {
    var out = {};
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) out[k] = cfg[k];
    }
    return out;
  }

  function writeSharedSnapshot() {
    var store = getSharedStore();
    if (!store) return;
    try {
      var raw = JSON.stringify(snapshotCfg());
      if (raw === sharedCfgRaw) return;
      sharedCfgRaw = raw;
      store[SHARED_CFG_RAW_KEY] = raw;
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
    if (!count) return false;
    enforceOptimizedRuntimeProfile();
    try { resetStyleStateForNewPanels(); } catch (eReset) {}
    try { invalidateEnemyVisualCaches(); } catch (eEnemy) {}
    requestCurrentRedBarRefresh();
    settingsDirty = true;
    allySettingsDirty = true;
    allySettingsRefreshHoldUntil = 0;
    bootstrapApplied = true;
    directBootstrapApplied = true;
    bootstrapFinished = true;
    if (source === "durable_shared") {
      directBootstrapLocked = true;
      directBootstrapResyncUntil = 0;
      markBootstrapSeen();
    } else {
      directBootstrapResyncUntil = _ts() + (source === "shared" ? DIRECT_BOOTSTRAP_SHARED_RESYNC_MS : DIRECT_BOOTSTRAP_RESYNC_MS);
      if (source !== "shared") writeSharedSnapshot();
      markBootstrapSeen();
    }
    return true;
  }

  function markBootstrapSeen() {
    var store = getSharedStore();
    if (!store) return;
    try { store[SHARED_BOOTSTRAP_SEEN_KEY] = "1"; } catch (e) {}
  }

  function tryApplyDurableSharedSnapshot() {
    var store = getSharedStore();
    if (!store) return false;
    var raw = "";
    try { raw = String(store[SHARED_DURABLE_CFG_RAW_KEY] || ""); } catch (e) { raw = ""; }
    if (!raw) return false;
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (eParse) { return false; }
    return applyDirectSnapshot(parsed, "durable_shared");
  }

  function tryApplySharedSnapshot() {
    var store = getSharedStore();
    if (!store) return false;
    var raw = "";
    try { raw = String(store[SHARED_CFG_RAW_KEY] || ""); } catch (e) { raw = ""; }
    if (!raw || raw === sharedCfgRaw) return false;
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (eParse) { return false; }
    var values = parsed && typeof parsed === "object" ? (parsed.values || parsed) : null;
    if (!values || typeof values !== "object") return false;
    if (!applyDirectSnapshot(values, "shared")) return false;
    sharedCfgRaw = raw;
    return true;
  }

  function tryApplyDirectBootstrap() {
    if (directBootstrapLocked) return false;
    if (tryApplyDurableSharedSnapshot()) return true;
    if (tryApplySharedSnapshot()) return true;
    return false;
  }

  function isBootstrapReplaySource(source) {
    return source === "bridge_bootstrap" || source === "ui_resync" || source === "ui_reset" || source === "ui_code_apply" || source === "baked_preset_apply" || source === "core_auto_resync" || source === "ui_refresh_after_apply";
  }

  function requestBootstrap(reason) {
    var now = _ts();
    requestPresetSnapshot(reason || "overlay_request");
    if (lastBootstrapRequestAt && now - lastBootstrapRequestAt < BOOTSTRAP_REQUEST_THROTTLE_MS) return;
    if (!rootBootstrapRequestShared) {
      try {
        var root = getRootPanel();
        if (root) {
          if (!root.__hpColorsBootstrapRequests) root.__hpColorsBootstrapRequests = { last: 0, attempts: 0 };
          rootBootstrapRequestShared = root.__hpColorsBootstrapRequests;
        }
      } catch (eRootReq) {}
    }
    if (rootBootstrapRequestShared) {
      var sharedDelay = rootBootstrapRequestShared.attempts < BOOTSTRAP_MAX_ATTEMPTS ? BOOTSTRAP_REQUEST_THROTTLE_MS : 3000;
      if (rootBootstrapRequestShared.last && now - rootBootstrapRequestShared.last < sharedDelay) return;
      rootBootstrapRequestShared.last = now;
      rootBootstrapRequestShared.attempts = (rootBootstrapRequestShared.attempts || 0) + 1;
    }
    lastBootstrapRequestAt = now;

    try {
      $.DispatchEvent(EVENT_CHANNEL, JSON.stringify({
        magic_word: "ANITA_REQUEST_BOOTSTRAP",
        mod_title: TITLE,
        storageNamespace: BOOTSTRAP_NAMESPACE,
        reason: String(reason || "overlay_request")
      }));
    } catch (e) {}
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
    requestBootstrap(bootstrapAttempts === 1 ? "overlay_startup" : "overlay_retry");
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
      try { $.Schedule(BOOTSTRAP_RETRY_SEC, scheduleBootstrapRetry); } catch (eSchedule) {}
    }
  }

  function applyPresetSnapshotPayload(d) {
    if (!d || d.magic_word !== PRESET_SNAPSHOT_MAGIC) return false;
    if (d.mod_title && d.mod_title !== TITLE) return true;
    var values = d.values && typeof d.values === "object" ? d.values : null;
    if (!values) return true;
    var raw = typeof d.values_raw === "string" ? d.values_raw : "";
    if (!raw) {
      try { raw = JSON.stringify(values); } catch (eRaw) { raw = ""; }
    }
    if (raw && raw === sharedCfgRaw && bootstrapApplied) return true;
    if (applyDirectSnapshot(values, "shared") && raw) sharedCfgRaw = raw;
    return true;
  }

  // Live updates from Anita UI, including boot-time bootstrap values.
  $.RegisterForUnhandledEvent(EVENT_CHANNEL, function (payload) {
    if (typeof payload === 'string') {
      if (payload.indexOf('ANITA') === -1 && payload.indexOf(PRESET_SNAPSHOT_MAGIC) === -1) return;
      if (payload.indexOf(TITLE) === -1) return;
    }
    try {
      var d = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!d || d.mod_title !== TITLE) return;
      if (applyPresetSnapshotPayload(d)) return;

      if (d.magic_word === "ANITA_BULK_UPDATE") {
        var replaySource = isBootstrapReplaySource(String(d.update_source || ""));
        var forceReplay = replaySource || !!d.force_emit;
        var values = d.values || {};
        var anyChanged = false;
        var anyNonFriendChanged = false;
        var anyFriendChanged = false;
        var anyEnemyPulseColorChanged = false;
        for (var key in values) {
          if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
          if (key === "hp_counter_position" && d.update_source === "hp_counter_autoposition") continue;
          var nextValue = coerceCfgValue(key, values[key]);
          if (cfg[key] !== nextValue) {
            cfg[key] = nextValue;
            anyChanged = true;
            if (key.indexOf("hp_friend_") !== 0) anyNonFriendChanged = true;
            if (affectsAllyOutputSetting(key)) anyFriendChanged = true;
            if (affectsEnemyPulseColorSetting(key)) anyEnemyPulseColorChanged = true;
          }
        }
        if (enforceOptimizedRuntimeProfile()) {
          anyChanged = true;
          anyNonFriendChanged = true;
          anyFriendChanged = true;
          anyEnemyPulseColorChanged = true;
        }
        if (!anyChanged && !anyFriendChanged) {
          if (forceReplay) {
            forceReplayCurrentVisualState();
          }
          if (replaySource && !bootstrapApplied) {
            bootstrapApplied = true;
            bootstrapFinished = true;
            try {
              var rootNoop = getRootPanel();
              if (rootNoop) rootNoop.__hpColorsBootstrapAppliedAt = _ts();
            } catch (eNoopBoot) {}
          }
          return;
        }
        if (anyNonFriendChanged) {
          settingsDirty = true;
          var nowTs = _ts();
          var holdMs = replaySource ? 240 : SETTINGS_REFRESH_DEBOUNCE_MS;
          settingsRefreshHoldUntil = nowTs + holdMs;
        }
        if (anyFriendChanged) {
          markAllyOutputDirty(replaySource);
        }
        if (anyEnemyPulseColorChanged) {
          markEnemyColorDirty();
        }
        writeSharedSnapshot();
        lLvVis = null;
        handleRuntimeToggleState();
        if (!cfg.hp_pulse_enabled) clearPulse();
        if (pulse) { lPD = null; applyPulseDuration(); applyPulseIntensity(); applyPulseTextState(); }
        if (replaySource) {
          bootstrapApplied = true;
          bootstrapFinished = true;
          directBootstrapLocked = true;
          directBootstrapResyncUntil = 0;
          try {
            var root = getRootPanel();
            if (root) root.__hpColorsBootstrapAppliedAt = _ts();
          } catch (eBoot) {}
        }
        return;
      }

      if (d.magic_word === "ANITA_UPDATE") {
        var replaySource = isBootstrapReplaySource(String(d.update_source || ""));
        var forceReplay = replaySource || !!d.force_emit;
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, d.setting_id)) {
          if (d.setting_id === "hp_counter_position" && d.update_source === "hp_counter_autoposition") {
            return;
          }
          var nextValue = coerceCfgValue(d.setting_id, d.value);
          var prevValue = cfg[d.setting_id];
          var changed = prevValue !== nextValue;
          cfg[d.setting_id] = nextValue;
          var optimizedChanged = enforceOptimizedRuntimeProfile();
          changed = changed || optimizedChanged;
          if (!changed) {
            if (forceReplay) {
              forceReplayCurrentVisualState();
            }
            if (replaySource && !bootstrapApplied) {
              bootstrapApplied = true;
              bootstrapFinished = true;
              try {
                var rootNoop = getRootPanel();
                if (rootNoop) rootNoop.__hpColorsBootstrapAppliedAt = _ts();
              } catch (eNoopBoot) {}
            }
            return;
          }
          if (d.setting_id.indexOf("hp_friend_") !== 0) {
            settingsDirty = true;
            var nowTs = _ts();
            var holdMs = replaySource ? 240 : SETTINGS_REFRESH_DEBOUNCE_MS;
            settingsRefreshHoldUntil = nowTs + holdMs;
          }
          if (affectsAllyOutputSetting(d.setting_id)) {
            markAllyOutputDirty(replaySource);
          }
          if (affectsEnemyPulseColorSetting(d.setting_id)) {
            markEnemyColorDirty();
          }
          writeSharedSnapshot();
          if (d.setting_id === "hp_level_number_visible") lLvVis = null;
          handleRuntimeToggleState(d.setting_id);
          if (pulse && (d.setting_id === "hp_pulse_bpm" || d.setting_id === "hp_pulse_intensity" || d.setting_id === "hp_pulse_text_enabled" || d.setting_id === "hp_pulse_text_scale")) {
            if (d.setting_id === "hp_pulse_bpm") { lPD = null; applyPulseDuration(); }
            if (d.setting_id === "hp_pulse_intensity") applyPulseIntensity();
            if (d.setting_id === "hp_pulse_text_enabled" || d.setting_id === "hp_pulse_text_scale") applyPulseTextState();
          }
          if (d.setting_id === "hp_pulse_enabled" && !cfg.hp_pulse_enabled) clearPulse();
        }
        if (replaySource) { bootstrapApplied = true;
          bootstrapFinished = true;
          directBootstrapLocked = true;
          directBootstrapResyncUntil = 0;
          try {
            var root = getRootPanel();
            if (root) root.__hpColorsBootstrapAppliedAt = _ts();
          } catch (eBoot) {}
        }
        return;
      }
    } catch (e) {}
  });

  // â”€â”€ Color helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function rgbToHex(c) {
    function cb(v) { v = +v|0; return v < 0 ? 0 : v > 255 ? 255 : v; }
    return '#'+((1<<24)|(cb(c[0])<<16)|(cb(c[1])<<8)|cb(c[2])).toString(16).slice(1);
  }

  function ipHex(a, b, t) {
    var ah = a.slice(1); if (ah.length === 3) ah = ah[0]+ah[0]+ah[1]+ah[1]+ah[2]+ah[2];
    var bh = b.slice(1); if (bh.length === 3) bh = bh[0]+bh[0]+bh[1]+bh[1]+bh[2]+bh[2];
    var ai = parseInt(ah, 16), bi = parseInt(bh, 16);
    var r = ((ai>>16&255)+((bi>>16&255)-(ai>>16&255))*t)|0;
    var g = ((ai>>8&255)+((bi>>8&255)-(ai>>8&255))*t)|0;
    var bv = ((ai&255)+((bi&255)-(ai&255))*t)|0;
    return '#'+((1<<24)|(r<<16)|(g<<8)|bv).toString(16).slice(1);
  }

  function normalizeWashColor(color) {
    if (typeof color !== 'string') return '';
    var trimmed = color.trim();
    if (!trimmed) return '';

    if (trimmed.charAt(0) === '#') {
      if (trimmed.length === 4) {
        return ('#' +
          trimmed.charAt(1) + trimmed.charAt(1) +
          trimmed.charAt(2) + trimmed.charAt(2) +
          trimmed.charAt(3) + trimmed.charAt(3)).toLowerCase();
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
  var us = null, hc = null, hca = null, bg = null, pl = null, lb = null, lbp = null, rb = null, cp = null, ui = null, kz = null, ihc = null, uhc = null, nm = null;
  var cached = 0, att = 0;
  var nextCacheProbeAt = 0;
  var nextRbProbeAt = 0;
  var nextCurrentRbProbeAt = 0;
  var nextCurrentRbChildProbeAt = 0;
  var currentRbRefreshUntil = 0;
  var lBgVis = null, lBgOp = null, lHpSize = null, lHpHeight = null, lHcaTransform = null, lIhcMarginTop = null, lUhcHeight = null, lPipHeight = null, lPipFontSize = null, lPipVis = null;

  function vPanel(p) {
    try {
      return !!(p && (!p.IsValid || p.IsValid()));
    } catch (e) {}
    return false;
  }

  function fRB() {
    var p = ctx.FindChildTraverse('unit_healthbar_lagging');
    if (p) return p;
    p = ctx.FindChildTraverse('health_bar');
    if (p) return p;
    return ctx.FindChildTraverse('unit_health');
  }

  function tryCache() {
    if (cached) {
      var counterReady = !cfg.hp_counter_visible || vPanel(hc);
      if (vPanel(us) && counterReady && vPanel(bg) && vPanel(pl) && vPanel(lb) && vPanel(lbp) && vPanel(nm)) return 1;
      cached = 0;
      nextCacheProbeAt = 0;
    }
    var now = _ts();
    if (nextCacheProbeAt && now < nextCacheProbeAt) return 0;
    att++;
    if (!vPanel(us)) us = ctx.FindChildTraverse('UnitStatus');
    if (!us) { nextCacheProbeAt = now + (att < 8 ? 150 : (att < 24 ? 500 : 1500)); return 0; }
    if (!vPanel(hc) && (cfg.hp_counter_visible || lVis !== 'collapse')) hc = us.FindChildTraverse('hp_counter');
    if (cfg.hp_counter_visible && !vPanel(hca)) hca = us.FindChildTraverse('hp_counter_anchor');
    if (!vPanel(bg)) bg = us.FindChildTraverse('unit_healthbar_bg');
    if (!vPanel(pl)) pl = us.FindChildTraverse('unit_healthbar_pip_label');
    if (!vPanel(lb)) lb = us.FindChildTraverse('unit_healthbar_lagging');
    if (cfg.hp_kill_zone_enabled && !vPanel(kz)) kz = us.FindChildTraverse('hp_kill_zone_marker');
    if (!vPanel(ui)) ui = us.FindChildTraverse('unit_ult_ready_icon') || us.FindChildTraverse('ult_icon');
    if (!vPanel(ihc)) ihc = us.FindChildTraverse('InfoHealthContainer');
    if (!vPanel(uhc)) uhc = us.FindChildTraverse('UnitHealthbarContainer');
    if (!vPanel(nm)) nm = ctx.FindChildTraverse('name');
    if (vPanel(ui)) _uiMissAt = 0;
    if (lb && !vPanel(lbp)) lbp = lb.GetParent();
    if (pl && lb && lbp) { cached = 1; att = 0; nextCacheProbeAt = 0; return 1; }
    nextCacheProbeAt = now + (att < 8 ? 150 : (att < 24 ? 500 : 1500));
    return 0;
  }

  function isInvalidPanel(panel) {
    try {
      return !!(panel && panel.IsValid && !panel.IsValid());
    } catch (e) {}
    return false;
  }

  function resetCachedPanelRefsIfInvalid() {
    if (!cached && !rb) return;
    if (!isInvalidPanel(us) && !isInvalidPanel(hc) && !isInvalidPanel(bg) && !isInvalidPanel(pl) && !isInvalidPanel(lb) && !isInvalidPanel(lbp) && !isInvalidPanel(rb) && !isInvalidPanel(cp) && !isInvalidPanel(nm)) return;
    us = hc = hca = bg = pl = lb = lbp = rb = cp = ui = kz = ihc = uhc = nm = null;
    cached = 0;
    att = 0;
    nextCacheProbeAt = 0;
    lastRbPanel = lastCpPanel = lastLbpPanel = lastHcPanel = lastBgPanel = lastKzPanel = lastPlPanel = null;
    lastUnitName = "";
    invalidateEnemyVisualCaches();
    settingsDirty = true;
    allySettingsDirty = true;
    requestCurrentRedBarRefresh();
  }

  function isRedBarPanelId(id) {
    return id === 'unit_healthbar_lagging' || id === 'health_bar' || id === 'unit_health';
  }

  function refreshRedBarFromParentChildren(now, force) {
    if (!force) {
      var inRefreshWindow = currentRbRefreshUntil && now <= currentRbRefreshUntil;
      if (nextCurrentRbChildProbeAt && now < nextCurrentRbChildProbeAt) return false;
      nextCurrentRbChildProbeAt = now + (inRefreshWindow ? CURRENT_RB_RESCAN_MS : CURRENT_RB_IDLE_RESCAN_MS);
    }
    if (!cp || !cp.Children) return false;
    var children = [];
    try { children = cp.Children(); } catch (eChildren) { return false; }
    var best = rb;
    var bestScore = getRedBarCandidateScore(rb, -1);
    var currentScore = bestScore;
    var bestIndex = -1;
    var candidateCount = 0;
    var dirtyCount = 0;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (!vPanel(child)) continue;
      var id = "";
      try { id = String(child.id || ""); } catch (eId) { id = ""; }
      if (!isRedBarPanelId(id)) continue;
      candidateCount++;
      if (redBarNeedsPaint(child)) dirtyCount++;
      var score = getRedBarCandidateScore(child, i);
      if (score > bestScore) {
        best = child;
        bestScore = score;
        bestIndex = i;
      }
    }
    if (!best || best === rb) return false;
    return adoptCurrentRedBar(best, "sibling_score", "count=" + candidateCount + " dirty=" + dirtyCount + " currentScore=" + currentScore + " bestScore=" + bestScore + " bestIndex=" + bestIndex);
  }

  function redBarNeedsPaint(panel) {
    if (!panel || !panel.style || !lCol) return false;
    try {
      return normalizeWashColor(String(panel.style.washColor || "")) !== lCol;
    } catch (e) {}
    return false;
  }

  function getRedBarCandidateScore(panel, index) {
    if (!vPanel(panel)) return -1;
    var score = panel === rb ? 100 : 0;
    if (redBarNeedsPaint(panel)) score += 1000;
    try { if ((panel.actuallayoutwidth | 0) > 0) score += 20; } catch (eWidth) {}
    try {
      var parent = panel.GetParent ? panel.GetParent() : null;
      if (parent && (parent.actuallayoutwidth | 0) > 0) score += 10;
    } catch (eParentWidth) {}
    if (index >= 0) score += Math.min(index, 20);
    return score;
  }

  function resetEnemyScanCache() {
    tid = 0;
    fl = 0;
    _lastScanAt = 0;
    _lastScanPanel = null;
  }

  function adoptCurrentRedBar(panel, source, detail) {
    rb = panel;
    lb = panel;
    cp = panel && panel.GetParent ? panel.GetParent() : null;
    lbp = cp;
    cached = 0;
    att = 0;
    nextCacheProbeAt = 0;
    resetEnemyScanCache();
    resetStyleStateForNewPanels();
    lW = -1;
    lPW = -1;
    lHp = -1;
    colorGeneration = -1;
    nextStyleDriftCheckAt = 0;
    return true;
  }

  function requestCurrentRedBarRefresh() {
    currentRbRefreshUntil = _ts() + CURRENT_RB_REFRESH_WINDOW_MS;
    nextCurrentRbProbeAt = 0;
    nextCurrentRbChildProbeAt = 0;
  }

  function getFirstPaintProbeState() {
    var store = getSharedStore();
    if (!store) return null;
    try {
      if (!store[SHARED_FIRST_PAINT_PROBE_KEY]) {
        store[SHARED_FIRST_PAINT_PROBE_KEY] = { nextAt: 0, waitCount: 0 };
      }
      return store[SHARED_FIRST_PAINT_PROBE_KEY];
    } catch (e) {}
    return null;
  }

  function hasBootstrapEvidence(now) {
    var store = getSharedStore();
    if (store) {
      try {
        if (store[SHARED_BOOTSTRAP_SEEN_KEY] || store[SHARED_DURABLE_CFG_RAW_KEY] || store[SHARED_CFG_RAW_KEY]) return true;
      } catch (eStore) {}
    }
    return false;
  }

  function requestPresetSnapshot(reason) {
    var now = _ts();
    var store = getSharedStore();
    if (store) {
      try {
        if (!store[SHARED_PRESET_REQUEST_KEY]) store[SHARED_PRESET_REQUEST_KEY] = { last: 0 };
        var state = store[SHARED_PRESET_REQUEST_KEY];
        if (state.last && now - state.last < 120) return;
        state.last = now;
      } catch (eState) {}
    }
    try {
      $.DispatchEvent(EVENT_CHANNEL, JSON.stringify({
        magic_word: PRESET_REQUEST_MAGIC,
        mod_title: TITLE,
        reason: String(reason || "overlay_request")
      }));
    } catch (ePreset) {}
  }

  function shouldWaitForBootstrapBeforeFirstPaint(now, isEnemy) {
    if (!isEnemy || bootstrapApplied || directBootstrapApplied || directBootstrapLocked) return false;
    if (!panelBornAt || now - panelBornAt > BOOTSTRAP_FIRST_PAINT_WAIT_MS) return false;
    if (cfg.hp_team_colors) return false;
    if (normalizeWashColor(cfg.hp_color_high) !== normalizeWashColor(DEFAULTS.hp_color_high)) return false;
    var sharedProbe = getFirstPaintProbeState();
    var hasEvidence = hasBootstrapEvidence(now);
    var nextProbeAt = sharedProbe ? (sharedProbe.nextAt || 0) : nextFirstPaintBootstrapProbeAt;
    if (!hasEvidence && nextProbeAt && now < nextProbeAt) return false;
    if (!nextProbeAt || now >= nextProbeAt) {
      lastDirectBootstrapAt = now;
      if (tryApplyDirectBootstrap()) return false;
      if (!hasEvidence && !sharedProbe) return false;
      var waitCount = sharedProbe ? ((sharedProbe.waitCount || 0) + 1) : (firstPaintBootstrapWaitCount + 1);
      var nextGap = waitCount < 4 ? 80 : (waitCount < 10 ? 150 : 250);
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
    var targetAt = sharedProbe ? (sharedProbe.nextAt || now + 80) : nextFirstPaintBootstrapProbeAt;
    var delay = Math.max(BOOTSTRAP_FIRST_PAINT_RETRY_SEC, Math.min(0.12, (targetAt - now) / 1000));
    $.Schedule(delay, gL);
    return true;
  }

  function refreshCurrentRedBarRef(now, force) {
    if (!force) {
      var inRefreshWindow = currentRbRefreshUntil && now <= currentRbRefreshUntil;
      if (nextCurrentRbProbeAt && now < nextCurrentRbProbeAt) return false;
      nextCurrentRbProbeAt = now + (inRefreshWindow ? CURRENT_RB_RESCAN_MS : CURRENT_RB_IDLE_RESCAN_MS);
    }
    var current = fRB();
    if (!vPanel(current) || current === rb) return false;
    return adoptCurrentRedBar(current, "global_traverse", "refreshWindow=" + (currentRbRefreshUntil && now <= currentRbRefreshUntil ? "1" : "0"));
  }

  function getInfoHealthMarginTopValue() {
    var raw = clampNum(cfg.hp_info_health_margin_top, 0, 100, 23);
    var pct = -15 + (raw * 0.65);
    if (Math.abs(pct) < 0.5) pct = 0;
    var rounded = Math.round(pct * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.01) rounded = Math.round(rounded);
    return rounded + '%';
  }

  function applyInfoHealthMarginTop() {
    if ((!ihc || !ihc.IsValid()) && us && us.IsValid()) ihc = us.FindChildTraverse('InfoHealthContainer');
    if (!ihc || !ihc.style) return;
    var next = getInfoHealthMarginTopValue();
    if (lIhcMarginTop !== next) {
      try { ihc.style.marginTop = next; lIhcMarginTop = next; } catch (e) { lIhcMarginTop = null; }
    }
  }

  // â”€â”€ Team/flag scan (walk up to find team classes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var tid = 0, fl = 0;
  var _lastScanAt = 0, _lastScanPanel = null;
  var SCAN_CACHE_TTL = 500;

  function scan(p) {
    var now = _ts();
    if (p === _lastScanPanel && now - _lastScanAt < SCAN_CACHE_TTL) return;
    var t = 0, f = 0, d = 0, c = p;
    while (c && d < 10) {
      if (c.BHasClass) {
        if (!t) { if (c.BHasClass('team2')) t = 2; else if (c.BHasClass('team1')) t = 1; }
        if (!(f & 1) && c.BHasClass('enemy')) f |= 1;
        if (!(f & 2) && (c.BHasClass('team_neutral') || c.BHasClass('neutral'))) f |= 2;
        if (!(f & 4) && (c.BHasClass('building') || c.BHasClass('boss_tier1') || c.BHasClass('boss_tier2') || c.BHasClass('boss_barracks'))) f |= 4;
        if (!(f & 8) && c.BHasClass('friend')) f |= 8;
        if (t && (f & (1|2|4|8))) break;
      }
      if (!c.GetParent) break;
      c = c.GetParent(); d++;
    }
    tid = t; fl = f;
    _lastScanAt = now; _lastScanPanel = p;
  }

  // â”€â”€ Setter helpers (skip redundant writes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lCol = null, lUlt = null, lTxt = null;
  var lColRaw = null, lUltRaw = null, lTxtRaw = null, lKzRaw = null;
  var lSH = -1, lSM = -1, lVis = null;
  var lTx = null, cMax = 0;
  var lCounterLowMode = false;
  var lastRbPanel = null, lastCpPanel = null, lastLbpPanel = null, lastHcPanel = null, lastBgPanel = null, lastKzPanel = null, lastPlPanel = null, lastUnitName = "";
  var panelBornAt = 0;
  var panelGeneration = 0, colorGeneration = -1;
  var lastEnemySignature = "";

  function sBC(c) {
    if (lColRaw === c) return;
    lColRaw = c;
    var next = normalizeWashColor(c) || WHITE_WASH;
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
      if (RUNTIME_OPTIMIZED_PROFILE) return;
      var rawOffColor = cfg.hp_ult_color_custom || CSS_TEAM_ENEMY_COLOR;
      var offColor = normalizeWashColor(rawOffColor) || CSS_TEAM_ENEMY_COLOR;
      if (!ui || !ui.IsValid()) {
        var nowOff = _ts();
        if (_uiMissAt && nowOff - _uiMissAt < UI_MISS_TTL_MS) return;
        ui = ctx.FindChildTraverse('unit_ult_ready_icon') || ctx.FindChildTraverse('ult_icon');
        if (ui && ui.IsValid()) _uiMissAt = 0;
        else { _uiMissAt = nowOff; return; }
      }
      if (lUltRaw !== rawOffColor || lUlt !== offColor) {
        lUltRaw = rawOffColor; lUlt = null;
        if (ui && ui.IsValid && ui.IsValid() && ui.style) {
          try { ui.style.washColor = offColor; lUlt = offColor; } catch (e) {}
        }
      }
      return;
    }
    if (lUltRaw === c) return;
    lUltRaw = c;
    var next = normalizeWashColor(c) || WHITE_WASH;
    if (!ui || !ui.IsValid()) {
      var now = _ts();
      if (_uiMissAt && now - _uiMissAt < UI_MISS_TTL_MS) return;
      ui = ctx.FindChildTraverse('unit_ult_ready_icon') || ctx.FindChildTraverse('ult_icon');
      if (ui && ui.IsValid()) _uiMissAt = 0;
      else { _uiMissAt = now; return; }
    }
    if (!ui || !ui.style) return;
    if (lUlt !== next) {
      try { ui.style.washColor = next; lUlt = next; } catch (e) { lUlt = null; }
    }
  }
  function sTC(c) {
    if (lTxtRaw === c) return;
    lTxtRaw = c;
    var next = normalizeWashColor(c);
    if (!hc || !hc.style) return;
    if (lTxt !== next) {
      try { hc.style.washColor = next; lTxt = next; } catch (e) { lTxt = null; }
    }
  }

  

  function getDefaultBarColor(teamId, flags) {
    if (flags & 1) return CSS_TEAM_FRIEND_COLOR;
    if (teamId === 2) return CSS_TEAM2_COLOR;
    if (teamId === 1) return CSS_TEAM1_COLOR;
    return CSS_TEAM_FRIEND_COLOR;
  }

  function getHealthbarHeightPx() {
    return Math.round(clampNum(cfg.hp_healthbar_height, 0, 230, 130));
  }

  function applyHealthbarHeight() {
    if ((!uhc || !uhc.IsValid()) && us && us.IsValid()) uhc = us.FindChildTraverse('UnitHealthbarContainer');
    var heightPx = dc.healthbarHeight || getHealthbarHeightPx();
    var nextHeight = heightPx + 'px';
    if (uhc && uhc.style && lUhcHeight !== nextHeight) {
      uhc.style.height = nextHeight;
      lUhcHeight = nextHeight;
    }
    if (pl && pl.style) {
      var nextPipHeight = '52%';
      var nextPipFontSize = Math.min(75, Math.round(heightPx * 75 / 230)) + 'px';
      if (lPipHeight !== nextPipHeight) { pl.style.height = nextPipHeight; lPipHeight = nextPipHeight; }
      if (lPipFontSize !== nextPipFontSize) { pl.style.fontSize = nextPipFontSize; lPipFontSize = nextPipFontSize; }
    }
  }

  function resetAllyBarColor(panel, teamId, flags) {
    if (!panel || panel !== allyOwnedPanel) return;
    allyColorActive = false;
    clearAllyPulse(panel);
    lColA = null;
    lWA = -1;
    lPWA = -1;
    sfcA = 0;
    if (!panel.style) return;
    var color = getDefaultBarColor(teamId | 0, flags | 0);
    try {
      panel.style.washColor = color;
      lColA = normalizeWashColor(color);
    } catch (e) {
      lColA = null;
    }
  }

  function resetAllyLoopCache(panel) {
    allyColorActive = false;
    lColA = null;
    lWA = -1;
    lPWA = -1;
    sfcA = 0;
    resetAllyScanCache();
    clearAllyPulse(panel);
  }

  var _allyScanPanel = null, _allyScanAt = 0, _allyScanTeam = 0, _allyScanFlags = 0;
  var ALLY_SCAN_CACHE_TTL = 160;

  function resetAllyScanCache() {
    _allyScanPanel = null;
    _allyScanAt = 0;
    _allyScanTeam = 0;
    _allyScanFlags = 0;
  }

  function scanAllyPanel(panel) {
    var now = _ts();
    if (panel === _allyScanPanel && now - _allyScanAt < ALLY_SCAN_CACHE_TTL) {
      return { teamId: _allyScanTeam, flags: _allyScanFlags };
    }
    var t2 = 0, f2 = 0, d2 = 0, c2 = panel;
    while (c2 && d2 < 10) {
      if (c2.BHasClass) {
        if (!t2) {
          if (c2.BHasClass('team2')) t2 = 2;
          else if (c2.BHasClass('team1')) t2 = 1;
        }
        if (!(f2 & 1) && c2.BHasClass('friend')) f2 |= 1;
        if (!(f2 & 2) && c2.BHasClass('player')) f2 |= 2;
        if (!(f2 & 4) && c2.BHasClass('enemy')) f2 |= 4;
        if (t2 && (f2 & 7) === 7) break;
      }
      if (!c2.GetParent) break;
      c2 = c2.GetParent();
      d2++;
    }
    _allyScanPanel = panel;
    _allyScanAt = now;
    _allyScanTeam = t2;
    _allyScanFlags = f2;
    return { teamId: t2, flags: f2 };
  }

  function isConfirmedAllyPlayer(flags) {
    return !!((flags & 1) && (flags & 2) && !(flags & 4));
  }

  function releaseAllyOwnership(resetColor) {
    var panel = allyOwnedPanel;
    var scanResult = panel && panel.IsValid && panel.IsValid() ? scanAllyPanel(panel) : null;
    if (resetColor && panel && scanResult && isConfirmedAllyPlayer(scanResult.flags)) {
      resetAllyBarColor(panel, scanResult.teamId, scanResult.flags);
    } else {
      resetAllyLoopCache(panel);
    }
    allyOwnedPanel = null;
    resetAllyScanCache();
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
    dc.pulseTextSize = getPulseTextSize(counterSize);
    dc.counterPosition = parseCounterPositionValue(cfg.hp_counter_position, true);
    dc.pulseTextPosition = parseCounterPositionValue(cfg.hp_pulse_text_position, false);
    dc.healthbarHeight = getHealthbarHeightPx();
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
    if (lBgVis !== 'visible') { bg.style.visibility = 'visible'; lBgVis = 'visible'; }
    var nextOp = visible ? '1.0' : '0.01';
    if (lBgOp !== nextOp) { bg.style.opacity = nextOp; lBgOp = nextOp; }
  }

  var lKzVis = null, lKzX = null, lKzW = null, lKzColor = null, lKzAppliedColor = null, lKzOp = null, lKzZi = null;

  function invalidateEnemyVisualCaches() {
    lCol = lUlt = lTxt = null;
    lColRaw = lUltRaw = lTxtRaw = lKzRaw = null;
    lBgVis = lBgOp = lHpSize = lHpHeight = lHcaTransform = lIhcMarginTop = lUhcHeight = lPipHeight = lPipFontSize = lPipVis = null;
    lKzVis = lKzX = lKzW = lKzColor = lKzAppliedColor = lKzOp = lKzZi = null;
    lSH = -1;
    lSM = -1;
    lVis = null;
    nextStyleDriftCheckAt = 0;
  }

  function hasEnemyBarStyleDrift() {
    if (!rb || !rb.style || !lCol) return false;
    try {
      return normalizeWashColor(String(rb.style.washColor || "")) !== lCol;
    } catch (e) {}
    return false;
  }

  function sKZ(show, parentWidth) {
    if ((!kz || !vPanel(kz)) && show && cfg.hp_kill_zone_enabled && us && us.FindChildTraverse) {
      try { kz = us.FindChildTraverse('hp_kill_zone_marker'); } catch (eFindKz) {}
    }
    if (!kz || !kz.style) return;
    var barHidden = !bg || !bg.style || lBgVis !== 'visible' || lBgOp !== '1.0';
    if (!show || !cfg.hp_kill_zone_enabled || parentWidth <= 0 || barHidden) {
      if (lKzVis !== 'collapse') { kz.style.visibility = 'collapse'; lKzVis = 'collapse'; }
      if (lKzOp !== '0') { try { kz.style.opacity = '0'; lKzOp = '0'; } catch (eHide) { lKzOp = null; } }
      return;
    }

    var threshold = dc.killZoneThreshold;
    var width = dc.killZoneWidth;
    var pos = Math.round(parentWidth * threshold / 100 - width / 2);
    if (pos < 0) pos = 0;
    if (pos > parentWidth - width) pos = Math.max(0, parentWidth - width);
    var posStr = pos + 'px';
    var widthStr = width + 'px';
    if (lKzRaw !== dc.killZoneColorRaw) {
      lKzRaw = dc.killZoneColorRaw;
      lKzColor = dc.killZoneColor;
    }
    var color = lKzColor;

    if (lKzVis !== 'visible') { kz.style.visibility = 'visible'; lKzVis = 'visible'; }
    if (lKzOp !== '0.95') { try { kz.style.opacity = '0.95'; lKzOp = '0.95'; } catch (eOp) { lKzOp = null; } }
    if (lKzZi !== '1000') { try { kz.style.zIndex = '1000'; lKzZi = '1000'; } catch (eZi) { lKzZi = null; } }
    if (lKzX !== posStr) { kz.style.marginLeft = posStr; lKzX = posStr; }
    if (lKzW !== widthStr) { kz.style.width = widthStr; lKzW = widthStr; }
    if (lKzAppliedColor !== color) {
      try { kz.style.backgroundColor = color; lKzAppliedColor = color; } catch (eCol) { lKzAppliedColor = null; }
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
        if (Object.prototype.hasOwnProperty.call(raw, "x")) x = clampNum(raw.x, 0, 400, 0);
        if (Object.prototype.hasOwnProperty.call(raw, "y")) y = clampNum(raw.y, yMin, 400, 200);
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
    var pulseTextMode = !!(lowMode && cfg.hp_pulse_enabled && cfg.hp_pulse_text_enabled);
    var defaultSize = dc.counterSize || clampNum(cfg.hp_counter_size, 72, 400, 145);
    var size = pulseTextMode ? (dc.pulseTextSize || getPulseTextSize(defaultSize)) : defaultSize;
    var basePos = pulseTextMode ? dc.pulseTextPosition : dc.counterPosition;
    var posX = clampNum(basePos.x, 0, 400, 0);
    var posY = clampNum(basePos.y, -50, 400, 200);
    var fontSize = size + 'px';
    var baseHeight = 130;
    try {
      var hpParent = hc.GetParent ? hc.GetParent() : null;
      if (hpParent && hpParent.actuallayoutheight > 0) baseHeight = hpParent.actuallayoutheight;
    } catch (e) {}
    var panelHeightPx = pulseTextMode ? Math.max(baseHeight, Math.round(size * 1.85)) : baseHeight;
    var panelHeight = pulseTextMode ? panelHeightPx + 'px' : '100%';
    var translateY = Math.max(posY - 150, -200);
    var transform = 'translate3d(' + Math.round(posX) + 'px, ' + Math.round(translateY) + 'px, 0px)';
    if (lHpSize !== fontSize) { hc.style.fontSize = fontSize; lHpSize = fontSize; }
    if (lHpHeight !== panelHeight) { hc.style.height = panelHeight; lHpHeight = panelHeight; }
    if (hca && hca.style && lHcaTransform !== transform) { hca.style.transform = transform; lHcaTransform = transform; }
  }

  function sHCV(visible) {
    if (!hc || !hc.style) return;
    var vis = visible ? 'visible' : 'collapse';
    if (lVis !== vis) {
      try { hc.style.visibility = vis; lVis = vis; } catch (eCounterVis) { lVis = null; }
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
      if (nm) unitName = nm.text || nm.GetAttributeString('text', '') || "";
    } catch (eName) { unitName = ""; }
    if (rb === lastRbPanel && cp === lastCpPanel && lbp === lastLbpPanel && hc === lastHcPanel && bg === lastBgPanel && kz === lastKzPanel && pl === lastPlPanel && unitName === lastUnitName) return;
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
    invalidateEnemyVisualCaches();
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
    if (directBootstrapResyncUntil && directBootstrapResyncUntil < panelBornAt) directBootstrapResyncUntil = 0;
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
    if (rb && rb.style) { try { rb.style.washColor = ""; } catch (eRbWash) {} }
    if (ui && ui.style) { try { ui.style.washColor = ""; } catch (eUiWash) {} }
    if (hc && hc.style) { try { hc.style.washColor = ""; } catch (eHcWash) {} }
    lCol = null; lColRaw = null;
    lUlt = null; lUltRaw = null;
    lTxt = null; lTxtRaw = null;
    sKZ(false, 0);
    if (bg && bg.style) {
      if (lBgVis !== 'collapse') { bg.style.visibility = 'collapse'; lBgVis = 'collapse'; }
      if (lBgOp !== '0') { bg.style.opacity = '0'; lBgOp = '0'; }
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
    if (hca && hca.style) { hca.style.transform = ""; lHcaTransform = null; }
    lW = -1; lPW = -1; lHp = -1; pPct = -1; sFC = 0;
  }

  function cleanupLevelNumberVisibility() {
    if (!wr || !wr.IsValid()) cLU();
    if (wr && wr.IsValid && wr.IsValid()) {
      try { wr.RemoveClass(LV_VIS_CLASS); } catch (eLv) {}
      for (var i = 0; i < 4; i++) {
        try { wr.RemoveClass(LC_[i]); } catch (eTier) {}
      }
    }
    lLvVis = false;
    lLv = -1;
    lLNoChange = 0;
  }

  function startEnemyLoop(delay) {
    if (!cfg.hp_enabled || gRunning) return;
    gRunning = true;
    $.Schedule(delay || 0.05, gL);
  }

  function startAllyLoop(delay) {
    if (!cfg.hp_friend_enabled || aRunning) return;
    aRunning = true;
    $.Schedule(delay || 0.05, aL);
  }

  function startLevelLoop(delay) {
    if (!cfg.hp_level_number_visible || lRunning) return;
    lRunning = true;
    $.Schedule(delay || 0.05, lL);
  }

  function handleRuntimeToggleState(settingId) {
    refreshDerivedConfig();
    if (cfg.hp_enabled) startEnemyLoop();
    else if (settingId === "hp_enabled" || gRunning) { cleanupEnemyFeature(); gRunning = false; }

    if (cfg.hp_friend_enabled) startAllyLoop();
    else if (settingId === "hp_friend_enabled" || aRunning) { releaseAllyOwnership(true); aRunning = false; }

    if (cfg.hp_level_number_visible) startLevelLoop();
    else if (settingId === "hp_level_number_visible" || lRunning) { cleanupLevelNumberVisibility(); lRunning = false; }

    if (!cfg.hp_counter_visible) sHCV(false);
    else if (settingId === "hp_counter_visible") {
      lSH = -1;
      lSM = -1;
      if (cfg.hp_enabled) $.Schedule(0.01, gL);
    }

    if (!cfg.hp_pulse_enabled || !cfg.hp_pulse_text_enabled) {
      if (pulse || settingId === "hp_pulse_enabled" || settingId === "hp_pulse_text_enabled") clearPulse();
      lCounterLowMode = false;
      sHCS(false);
    }
    if (!cfg.hp_friend_pulse_enabled && pulseA) clearAllyPulse(rbA);
    if (!cfg.hp_kill_zone_enabled) sKZ(false, 0);
    else if (settingId === "hp_kill_zone_enabled" && cfg.hp_enabled) $.Schedule(0.01, gL);
    if (pl && pl.style && !cfg.hp_pip_visible && lPipVis !== 'collapse') {
      try { pl.style.visibility = 'collapse'; lPipVis = 'collapse'; } catch (ePip) { lPipVis = null; }
    }
  }

  function applyCurrentSettings(isEnemy) {
    refreshDerivedConfig();
    sHBV(!isEnemy || !!cfg.hp_bg_visible);
    if (cfg.hp_counter_visible) sHCS(lCounterLowMode);
    else sHCV(false);
    applyInfoHealthMarginTop();
    applyHealthbarHeight();
    lastStyleReapplyAt = _ts();
    lW = -1; lHp = -1;
    settingsDirty = false;
    settingsRefreshHoldUntil = 0;
  }

  // Decode max HP from pip label string (e.g. "|||| ..." â†’ 2000)
  function pMax(t) {
    if (t === lTx) return cMax;
    lTx = t; var p = 0, q = 0, li = t.lastIndexOf('|');
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c === 124) p++;
      else if ((c === 34 || c === 39) && (li === -1 || i > li)) q++;
    }
    cMax = p * 500 + q * 100; return cMax;
  }

  function uHT(cu, mx, lowMode) {
    if (!cfg.hp_counter_visible) { sHCV(false); return; }
    if (!hc || (cu === lSH && mx === lSM)) return;
    sHCV(true);
    var fmt = cfg.hp_counter_format | 0;
    var s;
    if (fmt === 1) {
      var pct = mx > 0 ? Math.round(cu / mx * 100) : 0;
      s = pct + '%';
    } else if (fmt === 2) {
      s = String(cu);
    } else {
      s = cu + ' / ' + mx;
    }
    try { if (hc.text !== s) hc.text = s; } catch (e) { try { hc.SetAttributeString('text', s); } catch (e2) {} }
    lCounterLowMode = !!lowMode;
    sHCS(lCounterLowMode);
    lSH = cu; lSM = mx;
  }

  // â”€â”€ Poll state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lUT = 0, lW = -1, lPW = -1, lHp = -1, pPct = -1, sFC = 0;

  // â”€â”€ Main poll loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function gL() {
    gRunning = true;
    try {
      if (!cfg.hp_enabled) {
        cleanupEnemyFeature();
        gRunning = false; return;
      }

      var now = _ts();
      var reboundCurrentRb = false;
      resetCachedPanelRefsIfInvalid();
      if (!vPanel(rb)) {
        if (!nextRbProbeAt || now >= nextRbProbeAt) {
          rb = fRB();
          nextRbProbeAt = rb ? 0 : now + 150;
        }
        if (!rb) { $.Schedule(0.15, gL); return; }
      } else {
        reboundCurrentRb = refreshCurrentRedBarRef(now, false);
      }
      if (!cached && !tryCache()) { $.Schedule(0.15, gL); return; }
      if (rb.GetParent) { var p = rb.GetParent(); if (cp !== p) cp = p; }
      if (!reboundCurrentRb) refreshRedBarFromParentChildren(now, false);
      resetStyleStateForNewPanels();

      scan(rb);
      var isEnemy = !!(fl & 1) && !(fl & 2);
      var enemySignature = tid + ":" + fl;
      if (enemySignature !== lastEnemySignature) {
        lastEnemySignature = enemySignature;
        invalidateEnemyVisualCaches();
        settingsDirty = true;
        settingsRefreshHoldUntil = now;
        allySettingsDirty = true;
        allySettingsRefreshHoldUntil = now;
        lLvVis = null;
      }
      if (shouldWaitForBootstrapBeforeFirstPaint(now, isEnemy)) return;
      if (isEnemy && !directBootstrapLocked && (!directBootstrapApplied || now <= directBootstrapResyncUntil) && now - lastDirectBootstrapAt >= 1000) {
        lastDirectBootstrapAt = now;
        tryApplyDirectBootstrap();
      }
      if (cfg.hp_skip_buildings && (fl & 4)) {
        clearPulse();
        if (!isEnemy) {
          sBC("");
          sUC("");
          sTC("");
          sHBV(true);
          sKZ(false, 0);
          $.Schedule(0.5, gL);
          return;
        }

        if (bg && bg.style) {
          if (lBgVis !== 'collapse') { bg.style.visibility = 'collapse'; lBgVis = 'collapse'; }
          if (lBgOp !== '0') { bg.style.opacity = '0'; lBgOp = '0'; }
        }

        var skipColor = "#e16161";
        sBC(skipColor);
        sUC(skipColor);
        sTC(skipColor);
        sHBV(!!cfg.hp_bg_visible);
        sKZ(false, 0);
        $.Schedule(0.5, gL);
        return;
      }
      if (isEnemy && now - lastStyleReapplyAt >= STYLE_REAPPLY_WATCHDOG_MS) {
        lastStyleReapplyAt = now;
        invalidateEnemyVisualCaches();
        settingsDirty = true;
        settingsRefreshHoldUntil = now;
      }
      var wasDirty = settingsDirty;
      if (settingsDirty) {
        if (now < settingsRefreshHoldUntil) { $.Schedule(0.05, gL); return; }
        applyCurrentSettings(isEnemy);
      }
      if (!wasDirty && isEnemy && now >= nextStyleDriftCheckAt) {
        nextStyleDriftCheckAt = now + STYLE_DRIFT_CHECK_MS;
        if (hasEnemyBarStyleDrift()) {
          invalidateEnemyVisualCaches();
          lW = -1;
          lHp = -1;
          wasDirty = true;
        }
      }

      // Neutral unit
      if (fl & 2) { clearPulse();
        sHBV(true);
        sKZ(false, 0);
        sBC('#5BEFB5');
        sTC(WHITE_WASH);
        lUT = now;
        $.Schedule(1.5, gL); return;
      }
      // Not an enemy â€” skip coloring
      if (!(fl & 1)) { sHBV(true); sKZ(false, 0); lUT = now; $.Schedule(0.4, gL); return; }

      var w = rb.actuallayoutwidth | 0;
      var pw = cp && cp.actuallayoutwidth !== undefined ? cp.actuallayoutwidth | 0 : 0;
      // No change in width â€” back off
      if (w === lW && pw === lPW && !pulse && !wasDirty && colorGeneration === panelGeneration) {
        $.Schedule(now - lUT > 2000 ? 1.5 : 0.25, gL); return;
      }
      lW = w; lPW = pw; lUT = now;
      if (pw <= 0) { sKZ(false, 0); $.Schedule(0.18, gL); return; }
      if (cfg.hp_kill_zone_enabled) sKZ(true, pw);
      else if (lKzVis !== 'collapse') sKZ(false, 0);

      var hp = (w / pw * 100) | 0;
      var low = dc.low;
      var high = dc.high;
      var pulseThresh = dc.pulseThreshold;
      var shouldPulse = !!(cfg.hp_pulse_enabled && hp <= pulseThresh);

      // Small change above low threshold â€” back off
      if (Math.abs(hp - lHp) < 3 && hp > low && lHp > low && !pulse && !shouldPulse && !wasDirty) { $.Schedule(0.25, gL); return; }
      var prevHp = lHp;
      if (hp === pPct) sFC++; else { sFC = 0; pPct = hp; }
      lHp = hp;

      // Update HP counter label
      var counterVisible = !!cfg.hp_counter_visible;
      var fmt = cfg.hp_counter_format | 0;
      var txt = '';
      if (pl) {
        try {
          var pipVis = cfg.hp_pip_visible ? 'visible' : 'collapse';
          if (lPipVis !== pipVis) { pl.style.visibility = pipVis; lPipVis = pipVis; }
          if (counterVisible && fmt !== 1) txt = pl.text || pl.GetAttributeString('text', '') || '';
        } catch (e) { txt = ''; lPipVis = null; }
      }
      if (counterVisible && lb && lbp) {
        if (fmt === 1) {
          uHT(hp, 100, shouldPulse);
        } else {
          var bw = lb.actuallayoutwidth || 0, bpw = lbp.actuallayoutwidth || 0;
          var ratio = bpw > 0 ? bw / bpw : 0;
          var mx = pMax(txt);
          uHT(ratio >= 0.97 ? mx : Math.round(mx * ratio), mx, shouldPulse);
        }
      } else if (!counterVisible) {
        sHCV(false);
      }

      var sc = 0.15, cl, textCol, normalBarColor, finalBarColor;

      if (hp <= low) {
        if (panelBornAt && (now - panelBornAt) < 900 && (prevHp < 0 || (prevHp <= low && hp > prevHp))) {
          var warmupCol = getHighColor();
          clearPulse();
          sBC(warmupCol); sUC(warmupCol); sTC(getTextColor(100, low, high));
          $.Schedule(0.05, gL); return;
        }
        sHBV(shouldPulse && cfg.hp_pulse_hide_bar ? false : !!cfg.hp_bg_visible);
        if (cfg.hp_mode === 1) {
          cl = cfg.hp_color_low;
          textCol = cfg.hp_text_color_mode ? cfg.hp_text_color_low : cfg.hp_color_low;
        } else {
          cl = cfg.hp_color_low;
          textCol = getTextColor(hp, low, high);
        }
        normalBarColor = cl;
        finalBarColor = normalBarColor;
        if (shouldPulse && cfg.hp_pulse_color_enabled) {
          if ((cfg.hp_pulse_color_mode | 0) === 1) {
            var lowPulseDepth = clampNum((pulseThresh - hp) / Math.max(1, pulseThresh), 0, 1, 0);
            finalBarColor = ipHex(normalBarColor, cfg.hp_pulse_color, lowPulseDepth);
          } else {
            finalBarColor = cfg.hp_pulse_color;
          }
        }
        sBC(finalBarColor); sUC(finalBarColor); sTC(textCol);
      } else {
        sHBV(shouldPulse && cfg.hp_pulse_hide_bar ? false : !!cfg.hp_bg_visible);
        var denomMid = dc.denomMid;
        var denomHigh = dc.denomHigh;
        var highCol = getHighColor();

        if (hp <= high) {
          if (cfg.hp_mode === 1) {
            cl = ipHex(cfg.hp_color_low, cfg.hp_color_mid, (hp - low) / denomMid);
            textCol = getGradientTextColor(hp, low, high);
          } else {
            cl = cfg.hp_color_mid;
            textCol = getTextColor(hp, low, high);
          }
        } else {
          if (cfg.hp_mode === 1) {
            cl = ipHex(cfg.hp_color_mid, highCol, (hp - high) / denomHigh);
            textCol = getGradientTextColor(hp, low, high);
          } else {
            cl = highCol;
            textCol = getTextColor(hp, low, high);
          }
          if (sFC >= 5) {
            sc = ENEMY_IDLE_BACKOFF[Math.min(Math.floor((sFC - 5) / 5), 3)];
          }
        }
        normalBarColor = cl;
        finalBarColor = normalBarColor;
        if (shouldPulse && cfg.hp_pulse_color_enabled) {
          if ((cfg.hp_pulse_color_mode | 0) === 1) {
            var pulseDepth = clampNum((pulseThresh - hp) / Math.max(1, pulseThresh), 0, 1, 0);
            finalBarColor = ipHex(normalBarColor, cfg.hp_pulse_color, pulseDepth);
          } else {
            finalBarColor = cfg.hp_pulse_color;
          }
        }
        sBC(finalBarColor); sUC(finalBarColor); sTC(textCol);
      }
      if (shouldPulse) {
        if (!pulse) startPulse();
        if (cfg.hp_pulse_text_enabled) {
          updatePulseTextBrightness(now);
          sc = 0.10;
        }
      } else if (pulse) {
        clearPulse();
      }
      colorGeneration = panelGeneration;

      $.Schedule(sc, gL);
    } catch (e) {
      $.Schedule(0.5, gL);
    }
  }

  // â”€â”€ Level tier coloring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var LT_ = [11, 19, 27, 35], LC_ = ['level_tier2', 'level_tier3', 'level_tier4', 'level_tier5'];
  var LV_VIS_CLASS = 'level_number_visible';
  var ll = null, lc = null, wr = null, lLv = -1, lLvVis = null;

  function pLv(t) { var v = 0; for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i) - 48; if (c >= 0 && c <= 9) v = v * 10 + c; } return v; }
  function fER(p) { var c = p; while (c) { if (c.BHasClass && c.BHasClass('enemy')) return c; if (!c.GetParent) break; c = c.GetParent(); } return null; }
  function sLNV() {
    if (!wr || !wr.IsValid()) return;
    var visible = !!cfg.hp_level_number_visible;
    if (lLvVis !== visible) {
      if (visible) wr.AddClass(LV_VIS_CLASS);
      else wr.RemoveClass(LV_VIS_CLASS);
      lLvVis = visible;
    }
  }

  function cLU() {
    if (!ll || !ll.IsValid()) ll = ctx.FindChildTraverse('unit_level_label');
    if (!lc || !lc.IsValid()) lc = ctx.FindChildTraverse('LevelContainer');
    if (lc && (!wr || !wr.IsValid())) wr = fER(lc);
    return ll && lc && wr;
  }

  function uLT() {
    if (!cLU()) return;
    sLNV();
    var t = ''; try { t = ll.text || ll.GetAttributeString('text', '') || ''; } catch (e) { t = ''; }
    if (!t || t.charCodeAt(0) === 123) return;
    var lv = pLv(t);
    if (lv === lLv || !lv) return;
    lLv = lv;
    for (var i = 0; i < 4; i++) wr.RemoveClass(LC_[i]);
    for (var j = 3; j >= 0; j--) { if (lv >= LT_[j]) { wr.AddClass(LC_[j]); break; } }
  }

  var lLNoChange = 0;
  function lL() {
    if (!cfg.hp_level_number_visible) {
      cleanupLevelNumberVisibility();
      lRunning = false;
      return;
    }
    lRunning = true;
    var prev = lLv;
    uLT();
    lLNoChange = (lLv === prev && lLv > 0) ? lLNoChange + 1 : 0;
    $.Schedule(lLNoChange > 10 ? 5.0 : 0.5, lL);
  }

  // ── Ally bar loop ────────────────────────────────────────────────────────────
  function aL() {
    aRunning = true;
    try {
      if (!cfg.hp_friend_enabled) {
        releaseAllyOwnership(true);
        aRunning = false; return;
      }

      var now = _ts();
      if (!rbA || !rbA.IsValid()) {
        releaseAllyOwnership(false);
        rbA = null; cpA = null;
        rbA = fRB();
        if (!rbA) { aIdleMiss++; $.Schedule(aIdleMiss > 75 ? 3.0 : 0.2, aL); return; }
      }
      aIdleMiss = 0;
      if (rbA.GetParent) { var pa = rbA.GetParent(); if (cpA !== pa) cpA = pa; }

      if (allySettingsDirty) {
        if (now < allySettingsRefreshHoldUntil) {
          $.Schedule(0.05, aL);
          return;
        }
        allySettingsDirty = false;
        resetAllyLoopCache(allyOwnedPanel);
      }

      var allyScan = scanAllyPanel(rbA);
      var f2 = allyScan.flags;

      if (!isConfirmedAllyPlayer(f2)) {
        if (allyColorActive || allyOwnedPanel) releaseAllyOwnership(false);
        sfcA = 0;
        $.Schedule(1.5, aL); return;
      }

      var aw = rbA.actuallayoutwidth | 0;
      var apw = cpA && cpA.actuallayoutwidth !== undefined ? cpA.actuallayoutwidth | 0 : 0;
      if (apw <= 0) { $.Schedule(0.2, aL); return; }

      if (aw === lWA && apw === lPWA && !pulseA) {
        sfcA++;
        var scIdle = ALLY_IDLE_BACKOFF[Math.min(Math.floor(sfcA / 3), 4)];
        $.Schedule(scIdle, aL); return;
      }
      sfcA = 0; lWA = aw; lPWA = apw;

      var ahp = (aw / apw * 100) | 0;
      var alow = dc.low;
      var ahigh = dc.high;

      var inPulse = false;
      if (cfg.hp_friend_pulse_enabled) {
        inPulse = ahp <= dc.friendPulseThreshold;
      }

      // Use pulse color override when active, otherwise gradient/fixed
      var acl;
      if (inPulse && cfg.hp_friend_pulse_color_enabled) {
        acl = cfg.hp_friend_pulse_color;
      } else if (cfg.hp_mode === 1) {
        if (ahp <= alow) acl = cfg.hp_friend_color_low;
        else if (ahp <= ahigh) acl = ipHex(cfg.hp_friend_color_low, cfg.hp_friend_color_mid, (ahp - alow) / Math.max(1, ahigh - alow));
        else acl = ipHex(cfg.hp_friend_color_mid, cfg.hp_friend_color_high, (ahp - ahigh) / Math.max(1, 100 - ahigh));
      } else {
        if (ahp <= alow) acl = cfg.hp_friend_color_low;
        else if (ahp <= ahigh) acl = cfg.hp_friend_color_mid;
        else acl = cfg.hp_friend_color_high;
      }
      var nextColA = normalizeWashColor(acl);
      if (lColA !== nextColA && rbA) {
        try { rbA.style.washColor = nextColA; lColA = nextColA; allyColorActive = true; allyOwnedPanel = rbA; } catch (e) { lColA = null; }
      }

      var sc = 0.35;
      if (inPulse) {
        if (!pulseA) {
          pulseA = 1; lPIA = -1; lColA = null;
          try { if (rbA) rbA.AddClass(LP); } catch (e) {}
          var aidx = Number(cfg.hp_friend_pulse_intensity) | 0;
          if (aidx < 0 || aidx > 2) aidx = 1;
          lPIA = aidx;
          var acls = PULSE_INTENSITY[aidx];
          if (acls) { try { rbA.AddClass(acls); } catch (e) {} }
          var abpm = Number(cfg.hp_friend_pulse_bpm) || 75;
          if (abpm < 30) abpm = 30; if (abpm > 300) abpm = 300;
          var adur = (60 / abpm).toFixed(3) + 's';
          try { if (rbA) rbA.style.animationDuration = adur; } catch (e) {}
        }
        sc = 0.15;
      } else {
        if (pulseA) { clearAllyPulse(rbA); lColA = null; }
      }

      $.Schedule(sc, aL);
    } catch (e) {
      $.Schedule(0.5, aL);
    }
  }

  tryApplyDirectBootstrap();
  handleRuntimeToggleState();
  scheduleBootstrapRetry();
})();
