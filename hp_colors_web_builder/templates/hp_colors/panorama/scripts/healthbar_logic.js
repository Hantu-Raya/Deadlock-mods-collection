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
  var cfg = {};
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

  // ── Loop control ────────────────────────────────────────────────────────────
  var gRunning = false;
  var aRunning = false;

  // ── Pulse state ─────────────────────────────────────────────────────────────
  var pulse = 0;
  var lPD = null;
  var lPI = -1;
  var lTB = null;

  // ── Ally state ───────────────────────────────────────────────────────────────
  var rbA = null, cpA = null;
  var allyOwnedPanel = null;
  var lColA = null, lWA = -1, lPWA = -1, sfcA = 0, allyColorActive = false;
  var pulseA = 0, lPDA = null, lPIA = -1;
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
    pulseA = 0; lPDA = null; lPIA = -1; lColA = null;
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
          if (rawPos.length > 1) posY = clampNum(rawPos[1], 0, 400, 200);
        } else {
          if (Object.prototype.hasOwnProperty.call(rawPos, "x")) posX = clampNum(rawPos.x, 0, 400, 0);
          if (Object.prototype.hasOwnProperty.call(rawPos, "y")) posY = clampNum(rawPos.y, 0, 400, 200);
        }
        return Math.round(posX) + "," + Math.round(posY);
      }

      if (typeof rawPos === "string") {
        var posParts = rawPos.match(/-?\d+(?:\.\d+)?/g);
        if (posParts && posParts.length > 0) {
          posX = clampNum(posParts[0], 0, 400, 0);
          if (posParts.length > 1) posY = clampNum(posParts[1], 0, 400, 200);
          return Math.round(posX) + "," + Math.round(posY);
        }
      }

      if (typeof rawPos === "number") {
        posY = clampNum(rawPos, 0, 400, 200);
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
  }

  loadCfgDefaults();
  var BOOTSTRAP_NAMESPACE = "hp_colors";
  var BOOTSTRAP_MAX_ATTEMPTS = 8;
  var BOOTSTRAP_RETRY_SEC = 0.5;
  var BOOTSTRAP_SLOW_RETRY_SEC = 3.0;
  var BOOTSTRAP_REQUEST_THROTTLE_MS = 400;
  var STYLE_REAPPLY_MS = 1000;
  var DIRECT_BOOTSTRAP_KEY = "anita_v1_hp_colors";
  var SHARED_CFG_RAW_KEY = "__hpColorsCfgRaw";
  var HP_PERSIST_ALIAS_TO_ID = {
    e: "hp_enabled",
    m: "hp_mode",
    l: "hp_low_threshold",
    h: "hp_high_threshold",
    b: "hp_bg_visible",
    t: "hp_team_colors",
    ihmt: "hp_info_health_margin_top",
    hbh: "hp_healthbar_height",
    cl: "hp_color_low",
    cm: "hp_color_mid",
    ch: "hp_color_high",
    s: "hp_counter_size",
    p: "hp_counter_position",
    tm: "hp_text_color_mode",
    lnv: "hp_level_number_visible",
    plv: "hp_pip_visible",
    uce: "hp_ult_color_enabled",
    ucc: "hp_ult_color_custom",
    tl: "hp_text_color_low",
    ti: "hp_text_color_mid",
    th: "hp_text_color_high",
    bp: "hp_pulse_bpm",
    pi: "hp_pulse_intensity",
    pe: "hp_pulse_enabled",
    pte: "hp_pulse_text_enabled",
    pts: "hp_pulse_text_scale",
    ptp: "hp_pulse_text_position",
    phb: "hp_pulse_hide_bar",
    sb: "hp_skip_buildings",
    pt: "hp_pulse_threshold",
    fe: "hp_friend_enabled",
    fpe: "hp_friend_pulse_enabled",
    fpb: "hp_friend_pulse_bpm",
    fpi: "hp_friend_pulse_intensity",
    fpt: "hp_friend_pulse_threshold",
    fcl: "hp_friend_color_low",
    fcm: "hp_friend_color_mid",
    fch: "hp_friend_color_high",
    fpce: "hp_friend_pulse_color_enabled",
    fpc: "hp_friend_pulse_color",
    kze: "hp_kill_zone_enabled",
    kzt: "hp_kill_zone_threshold",
    kzc: "hp_kill_zone_color",
    kzw: "hp_kill_zone_width",
    cf: "hp_counter_format"
  };
  var bootstrapApplied = false;
  var directBootstrapApplied = false;
  var bootstrapAttempts = 0;
  var bootstrapFinished = false;
  var settingsDirty = true;
  var settingsRefreshHoldUntil = 0;
  var SETTINGS_REFRESH_DEBOUNCE_MS = 80;
  var allySettingsDirty = true;
  var allySettingsRefreshHoldUntil = 0;
  var ALLY_SETTINGS_REFRESH_DEBOUNCE_MS = 80;
  var lastBootstrapRequestAt = 0;
  var lastDirectBootstrapAt = 0;
  var lastStyleReapplyAt = 0;
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

  function decodeBase64Url(str) {
    var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var lookup = {};
    for (var i = 0; i < CHARS.length; i++) lookup[CHARS[i]] = i;
    function getVal(ch) {
      if (ch === undefined) return 0;
      if (!Object.prototype.hasOwnProperty.call(lookup, ch)) throw new Error("Invalid base64url char: " + ch);
      return lookup[ch];
    }
    var bytes = [];
    for (var j = 0; j < str.length; j += 4) {
      var c0 = getVal(str[j]);
      var c1 = getVal(str[j + 1]);
      var c2 = str[j + 2] !== undefined ? getVal(str[j + 2]) : 0;
      var c3 = str[j + 3] !== undefined ? getVal(str[j + 3]) : 0;
      bytes.push((c0 << 2) | (c1 >> 4));
      if (str[j + 2] !== undefined) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
      if (str[j + 3] !== undefined) bytes.push(((c2 & 3) << 6) | c3);
    }
    var out = "";
    for (var k = 0; k < bytes.length; k++) {
      var b = bytes[k];
      if (b < 128) {
        out += String.fromCharCode(b);
      } else if (b < 224) {
        out += String.fromCharCode(((b & 31) << 6) | (bytes[++k] & 63));
      } else {
        var b2 = bytes[++k], b3 = bytes[++k];
        out += String.fromCharCode(((b & 15) << 12) | ((b2 & 63) << 6) | (b3 & 63));
      }
    }
    return out;
  }

  function parseStoredPayload(raw) {
    if (!raw) return null;
    var parsed = null;
    try { parsed = JSON.parse(String(raw)); } catch (eParse) { return null; }
    var data = parsed && typeof parsed === "object" ? (parsed.values || parsed.v || parsed) : null;
    if (!data || typeof data !== "object") return null;
    var out = {};
    for (var key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      var id = Object.prototype.hasOwnProperty.call(DEFAULTS, key) ? key : HP_PERSIST_ALIAS_TO_ID[key];
      if (!id || !Object.prototype.hasOwnProperty.call(DEFAULTS, id)) continue;
      out[id] = coerceCfgValue(id, data[key]);
    }
    return out;
  }

  function readSessionMirrorEncoded() {
    var root = getRootPanel();
    if (!root) return "";
    try {
      if (root.GetAttributeString) {
        var rootValue = String(root.GetAttributeString(DIRECT_BOOTSTRAP_KEY, "") || "");
        if (rootValue) return rootValue;
      }
    } catch (eRoot) {}
    try {
      var hud = root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
      if (hud && hud.GetAttributeString) return String(hud.GetAttributeString(DIRECT_BOOTSTRAP_KEY, "") || "");
    } catch (eHud) {}
    return "";
  }

  

  function readConvarEncoded() {
    try {
      if (!GameInterfaceAPI || !GameInterfaceAPI.GetSettingString) return "";
      var raw = String(GameInterfaceAPI.GetSettingString("deadlock_hero_debuts_seen") || "");
      var marker = "[ANITA-v1-" + BOOTSTRAP_NAMESPACE + "]:";
      var idx = raw.indexOf(marker);
      if (idx < 0) return "";
      return raw.slice(idx + marker.length).split("|")[0].split(";")[0].split(",")[0];
    } catch (e) {}
    return "";
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
    try { resetStyleStateForNewPanels(); } catch (eReset) {}
    settingsDirty = true;
    bootstrapApplied = true;
    directBootstrapApplied = true;
    bootstrapFinished = true;
    if (source !== "shared") writeSharedSnapshot(source);
    return true;
  }

  function tryApplySharedSnapshot() {
    var store = getSharedStore();
    if (!store) return false;
    var raw = "";
    try { raw = String(store[SHARED_CFG_RAW_KEY] || ""); } catch (e) { raw = ""; }
    if (!raw || raw === sharedCfgRaw) return false;
    sharedCfgRaw = raw;
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (eParse) { return false; }
    return applyDirectSnapshot(parsed, "shared");
  }

  function tryDecodeDirectPayload(encoded, source) {
    if (!encoded) return false;
    try {
      return applyDirectSnapshot(parseStoredPayload(decodeBase64Url(String(encoded))), source);
    } catch (eDecode) {}

    return false;
  }

  function tryApplyDirectBootstrap(reason) {
    if (tryApplySharedSnapshot()) return true;
    if (tryDecodeDirectPayload(readSessionMirrorEncoded(), "session")) return true;
    if (tryDecodeDirectPayload(readConvarEncoded(), "convar")) return true;
    return false;
  }

  function isBootstrapReplaySource(source) {
    return source === "bridge_bootstrap" || source === "ui_resync" || source === "ui_reset" || source === "ui_code_apply" || source === "core_auto_resync" || source === "ui_refresh_after_apply";
  }

  function requestBootstrap(reason) {
    var now = _ts();
    if (lastBootstrapRequestAt && now - lastBootstrapRequestAt < BOOTSTRAP_REQUEST_THROTTLE_MS) return;
    lastBootstrapRequestAt = now;

    try {
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_REQUEST_BOOTSTRAP",
        mod_title: TITLE,
        storageNamespace: BOOTSTRAP_NAMESPACE,
        reason: String(reason || "overlay_request")
      }));
    } catch (e) {}
  }

  function scheduleBootstrapRetry() {
    if (bootstrapApplied || bootstrapFinished) return;
    if (tryApplyDirectBootstrap("retry_direct")) return;
    if (bootstrapAttempts >= BOOTSTRAP_MAX_ATTEMPTS) {
      requestBootstrap("overlay_slow_retry");
      $.Schedule(BOOTSTRAP_SLOW_RETRY_SEC, scheduleBootstrapRetry);
      return;
    }

    bootstrapAttempts += 1;
    requestBootstrap(bootstrapAttempts === 1 ? "overlay_startup" : "overlay_retry");
    $.Schedule(BOOTSTRAP_RETRY_SEC, scheduleBootstrapRetry);
  }

  // Live updates from Anita UI, including boot-time bootstrap values.
  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
    if (typeof payload === 'string' && payload.indexOf('ANITA') === -1) return;
    try {
      var d = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!d || d.mod_title !== TITLE) return;

      if (d.magic_word === "ANITA_BULK_UPDATE") {
        var replaySource = isBootstrapReplaySource(String(d.update_source || ""));
        var values = d.values || {};
        var anyChanged = false;
        var anyNonFriendChanged = false;
        var anyFriendChanged = false;
        for (var key in values) {
          if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
          if (key === "hp_counter_position" && d.update_source === "hp_counter_autoposition") continue;
          var nextValue = coerceCfgValue(key, values[key]);
          if (cfg[key] !== nextValue) {
            cfg[key] = nextValue;
            anyChanged = true;
            if (key.indexOf("hp_friend_") === 0) anyFriendChanged = true;
            else anyNonFriendChanged = true;
          }
        }
        if (!anyChanged && !anyFriendChanged) {
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
          allySettingsDirty = true;
          var allyNowTs = _ts();
          var allyHoldMs = replaySource ? 240 : ALLY_SETTINGS_REFRESH_DEBOUNCE_MS;
          allySettingsRefreshHoldUntil = allyNowTs + allyHoldMs;
        }
        writeSharedSnapshot();
        lLvVis = null;
        if (cfg.hp_enabled && !gRunning) { gRunning = true; $.Schedule(0.05, gL); }
        if (cfg.hp_friend_enabled && !aRunning) { aRunning = true; $.Schedule(0.05, aL); }
        if (!cfg.hp_friend_enabled && aRunning) {
          releaseAllyOwnership(true);
          aRunning = false;
        }
        if (!cfg.hp_pulse_enabled) clearPulse();
        if (pulse) { lPD = null; applyPulseDuration(); applyPulseIntensity(); applyPulseTextState(); }
        if (replaySource) {
          bootstrapApplied = true;
          bootstrapFinished = true;
          try {
            var root = getRootPanel();
            if (root) root.__hpColorsBootstrapAppliedAt = _ts();
          } catch (eBoot) {}
        }
        return;
      }

      if (d.magic_word === "ANITA_UPDATE") {
        var replaySource = isBootstrapReplaySource(String(d.update_source || ""));
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, d.setting_id)) {
          if (d.setting_id === "hp_counter_position" && d.update_source === "hp_counter_autoposition") {
            return;
          }
          var nextValue = coerceCfgValue(d.setting_id, d.value);
          var prevValue = cfg[d.setting_id];
          var changed = prevValue !== nextValue;
          cfg[d.setting_id] = nextValue;
          if (!changed) {
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
          } else {
            allySettingsDirty = true;
            var allyNowTs = _ts();
            var allyHoldMs = replaySource ? 240 : ALLY_SETTINGS_REFRESH_DEBOUNCE_MS;
            allySettingsRefreshHoldUntil = allyNowTs + allyHoldMs;
          }
          writeSharedSnapshot();
          if (d.setting_id === "hp_level_number_visible") lLvVis = null;
          if (d.setting_id === "hp_enabled" && cfg.hp_enabled && !gRunning) { gRunning = true; $.Schedule(0.05, gL); }
          if (d.setting_id === "hp_friend_enabled" && cfg.hp_friend_enabled && !aRunning) { aRunning = true; $.Schedule(0.05, aL); }
          if (d.setting_id === "hp_friend_enabled" && !cfg.hp_friend_enabled) {
            releaseAllyOwnership(true);
            aRunning = false;
          }
          if (pulse && (d.setting_id === "hp_pulse_bpm" || d.setting_id === "hp_pulse_intensity" || d.setting_id === "hp_pulse_text_enabled" || d.setting_id === "hp_pulse_text_scale")) {
            if (d.setting_id === "hp_pulse_bpm") { lPD = null; applyPulseDuration(); }
            if (d.setting_id === "hp_pulse_intensity") applyPulseIntensity();
            if (d.setting_id === "hp_pulse_text_enabled" || d.setting_id === "hp_pulse_text_scale") applyPulseTextState();
          }
          if (d.setting_id === "hp_pulse_enabled" && !cfg.hp_pulse_enabled) clearPulse();
        }
        if (replaySource) { bootstrapApplied = true;
          bootstrapFinished = true;
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
    var denomMid = Math.max(1, high - low);
    var denomHigh = Math.max(1, 100 - high);
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
  var us = null, hc = null, hca = null, bg = null, pl = null, lb = null, lbp = null, rb = null, cp = null, ui = null, kz = null, ihc = null, uhc = null;
  var cached = 0, att = 0;
  var lBgVis = null, lBgOp = null, lHpSize = null, lHpPos = null, lHpMarginLeft = null, lHpHeight = null, lHcaTransform = null, lIhcMarginTop = null, lUhcHeight = null, lPipHeight = null, lPipFontSize = null;

  function fRB() {
    var p = ctx.FindChildTraverse('unit_healthbar_lagging');
    if (p) return p;
    p = ctx.FindChildTraverse('health_bar');
    if (p) return p;
    return ctx.FindChildTraverse('unit_health');
  }

  function tryCache() {
    if (cached) return 1;
    if (att >= 10) return 0;
    att++;
    if (!us || !us.IsValid()) us = ctx.FindChildTraverse('UnitStatus');
    if (!us) return 0;
    if (!hc || !hc.IsValid()) hc = us.FindChildTraverse('hp_counter');
    if (!hca || !hca.IsValid()) hca = us.FindChildTraverse('hp_counter_anchor');
    if (!bg || !bg.IsValid()) bg = us.FindChildTraverse('unit_healthbar_bg');
    if (!pl || !pl.IsValid()) pl = us.FindChildTraverse('unit_healthbar_pip_label');
    if (!lb || !lb.IsValid()) lb = us.FindChildTraverse('unit_healthbar_lagging');
    if (!kz || !kz.IsValid()) kz = us.FindChildTraverse('hp_kill_zone_marker');
    if (!ui || !ui.IsValid()) ui = us.FindChildTraverse('unit_ult_ready_icon') || us.FindChildTraverse('ult_icon');
    if (!ihc || !ihc.IsValid()) ihc = us.FindChildTraverse('InfoHealthContainer');
    if (!uhc || !uhc.IsValid()) uhc = us.FindChildTraverse('UnitHealthbarContainer');
    if (ui && ui.IsValid()) _uiMissAt = 0;
    if (lb && (!lbp || !lbp.IsValid())) lbp = lb.GetParent();
    if (pl && lb && lbp) { cached = 1; return 1; }
    return 0;
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
  var lCounterText = "";
  var lCounterLowMode = false;
  var lCounterAutoPos = null;
  var lastRbPanel = null, lastHcPanel = null, lastBgPanel = null, lastKzPanel = null;
  var panelBornAt = 0;

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
    var heightPx = getHealthbarHeightPx();
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
    clearAllyPulse(panel);
  }

  function scanAllyPanel(panel) {
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

  function estimateCounterUnits(text) {
    var s = String(text || "");
    var units = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      if (ch >= 48 && ch <= 57) units += 1.0;
      else if (ch === 32) units += 0.35;
      else if (ch === 47) units += 0.55;
      else if (ch === 58 || ch === 46) units += 0.40;
      else units += 0.80;
    }
    return units > 0 ? units : 1;
  }

  function getCounterAvailableWidth() {
    if (hc && hc.actuallayoutwidth > 0) return hc.actuallayoutwidth;
    if (us && us.actuallayoutwidth > 0) return us.actuallayoutwidth;
    if (cp && cp.actuallayoutwidth > 0) return cp.actuallayoutwidth;
    if (rb && rb.actuallayoutwidth > 0) return rb.actuallayoutwidth;
    return 0;
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

  var lKzVis = null, lKzX = null, lKzW = null, lKzColor = null;

  function sKZ(show, parentWidth) {
    if (!kz || !kz.style) return;
    var barHidden = !bg || !bg.style || lBgVis !== 'visible' || lBgOp !== '1.0';
    if (!show || !cfg.hp_kill_zone_enabled || parentWidth <= 0 || barHidden) {
      if (lKzVis !== 'collapse') { kz.style.visibility = 'collapse'; lKzVis = 'collapse'; }
      try { kz.style.opacity = '0'; } catch (eHide) {}
      return;
    }

    var threshold = cfg.hp_kill_zone_threshold | 0;
    if (threshold < 0) threshold = 0;
    if (threshold > 100) threshold = 100;
    var width = cfg.hp_kill_zone_width | 0;
    if (width < 1) width = 1;
    if (width > 100) width = 100;
    var pos = Math.round(parentWidth * threshold / 100 - width / 2);
    if (pos < 0) pos = 0;
    if (pos > parentWidth - width) pos = Math.max(0, parentWidth - width);
    var posStr = pos + 'px';
    var widthStr = width + 'px';
    if (lKzRaw !== cfg.hp_kill_zone_color) {
      lKzRaw = cfg.hp_kill_zone_color;
      lKzColor = normalizeWashColor(cfg.hp_kill_zone_color || "#FF2222");
    }
    var color = lKzColor;

    if (lKzVis !== 'visible') { kz.style.visibility = 'visible'; lKzVis = 'visible'; }
    try { kz.style.opacity = '0.95'; } catch (eOp) {}
    try { kz.style.zIndex = '1000'; } catch (eZi) {}
    if (lKzX !== posStr) { kz.style.marginLeft = posStr; lKzX = posStr; }
    if (lKzW !== widthStr) { kz.style.width = widthStr; lKzW = widthStr; }
    if (lKzColor !== color) {
      try { kz.style.backgroundColor = color; lKzColor = color; } catch (eCol) { lKzColor = null; }
    }
  }

  function parseCounterPositionValue(value) {
    var x = 0;
    var y = 200;
    var raw = value;

    if (raw && typeof raw === "object") {
      if (Array.isArray(raw)) {
        if (raw.length > 0) x = clampNum(raw[0], 0, 400, 0);
        if (raw.length > 1) y = clampNum(raw[1], 0, 400, 200);
      } else {
        if (Object.prototype.hasOwnProperty.call(raw, "x")) x = clampNum(raw.x, 0, 400, 0);
        if (Object.prototype.hasOwnProperty.call(raw, "y")) y = clampNum(raw.y, 0, 400, 200);
      }
      return { x: x, y: y };
    }

    if (typeof raw === "string") {
      var parts = raw.match(/-?\d+(?:\.\d+)?/g);
      if (parts && parts.length > 0) {
        x = clampNum(parts[0], 0, 400, 0);
        if (parts.length > 1) y = clampNum(parts[1], 0, 400, 200);
        return { x: x, y: y };
      }
    }

    if (typeof raw === "number") {
      y = clampNum(raw, 0, 400, 200);
      return { x: x, y: y };
    }

    return { x: x, y: y };
  }

  function formatCounterPositionValue(pos) {
    var parsed = parseCounterPositionValue(pos);
    return Math.round(parsed.x) + "," + Math.round(parsed.y);
  }

  function syncCounterPositionSetting(nextPos) {
    var normalized = formatCounterPositionValue(nextPos);
    if (lCounterAutoPos === normalized) return;
    lCounterAutoPos = normalized;
    settingsDirty = true;
    try {
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_UPDATE",
        mod_title: TITLE,
        setting_id: "hp_counter_position",
        value: normalized,
        update_source: "hp_counter_autoposition",
        skip_bridge_persist: true
      }));
    } catch (e) {}
  }

  function sHCS(lowMode, textHint) {
    if (!hc || !hc.style) return;
    var pulseTextMode = !!(lowMode && cfg.hp_pulse_enabled && cfg.hp_pulse_text_enabled);
    var defaultSize = clampNum(cfg.hp_counter_size, 72, 400, 145);
    var size = pulseTextMode ? getPulseTextSize(defaultSize) : defaultSize;
    var basePos = parseCounterPositionValue(pulseTextMode ? cfg.hp_pulse_text_position : cfg.hp_counter_position);
    var posX = clampNum(basePos.x, 0, 400, 0);
    var posY = clampNum(basePos.y, 0, 400, 200);
    var fontSize = size + 'px';
    var baseHeight = 130;
    try {
      var hpParent = hc.GetParent ? hc.GetParent() : null;
      if (hpParent && hpParent.actuallayoutheight > 0) baseHeight = hpParent.actuallayoutheight;
    } catch (e) {}
    var panelHeightPx = pulseTextMode ? Math.max(baseHeight, Math.round(size * 1.85)) : baseHeight;
    var panelHeight = pulseTextMode ? panelHeightPx + 'px' : '100%';
    var translateY = pulseTextMode ? -posY : (posY - 100);
    var transform = 'translate3d(' + Math.round(posX) + 'px, ' + Math.round(translateY) + 'px, 0px)';
    if (lHpSize !== fontSize) { hc.style.fontSize = fontSize; lHpSize = fontSize; }
    if (lHpHeight !== panelHeight) { hc.style.height = panelHeight; lHpHeight = panelHeight; }
    if (hca && hca.style && lHcaTransform !== transform) { hca.style.transform = transform; lHcaTransform = transform; }
  }

  function resetStyleStateForNewPanels() {
    if (rb === lastRbPanel && hc === lastHcPanel && bg === lastBgPanel && kz === lastKzPanel) return;
    lastRbPanel = rb;
    lastHcPanel = hc;
    lastBgPanel = bg;
    lastKzPanel = kz;
    panelBornAt = _ts();
    lColRaw = lUltRaw = lTxtRaw = null;
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
    lBgVis = lBgOp = lHpSize = lHpPos = lHpMarginLeft = lHpHeight = lHcaTransform = lIhcMarginTop = null;
    lKzVis = lKzX = lKzW = lKzColor = null;
    lLvVis = null;
    lSH = -1;
    lSM = -1;
    lVis = null;
    lW = -1;
    lPW = -1;
    lHp = -1;
    pPct = -1;
    sFC = 0;
    lCounterLowMode = false;
    bootstrapApplied = false;
    directBootstrapApplied = false;
    bootstrapFinished = false;
    sharedCfgRaw = "";
    lastBootstrapRequestAt = 0;
    bootstrapAttempts = 0;
    settingsDirty = true;
    allySettingsDirty = true;
    settingsRefreshHoldUntil = 0;
    allySettingsRefreshHoldUntil = 0;
  }

  function applyCurrentSettings(isEnemy) {
    sHBV(!isEnemy || !!cfg.hp_bg_visible);
    sHCS(lCounterLowMode, lCounterText);
    applyInfoHealthMarginTop();
    applyHealthbarHeight();
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
    if (!hc || (cu === lSH && mx === lSM)) return;
    if (lVis !== 'visible') { hc.style.visibility = 'visible'; lVis = 'visible'; }
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
    lCounterText = s;
    lCounterLowMode = !!lowMode;
    sHCS(lCounterLowMode, lCounterText);
    lSH = cu; lSM = mx;
  }

  // â”€â”€ Poll state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lUT = 0, lW = -1, lPW = -1, lHp = -1, pPct = -1, sFC = 0;

  // â”€â”€ Main poll loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function gL() {
    gRunning = true;
    try {
      if (!cfg.hp_enabled) { clearPulse();
        sBC("");
        sUC("");
        sKZ(false, 0);
        if (bg && bg.style) { bg.style.visibility = 'collapse'; bg.style.opacity = '0'; lBgVis = 'collapse'; lBgOp = '0'; }
        if (hc && hc.style) {
          hc.style.fontSize = "";
          hc.style.height = "";
          sTC("");
          lHpSize = null;
          lHpHeight = null;
        }
        if (hca && hca.style) { hca.style.transform = ""; lHcaTransform = null; }
        gRunning = false; return;
      }

      var now = _ts();
      if (!rb) { rb = fRB(); if (!rb) { $.Schedule(0.15, gL); return; } }
      if (!cached && !tryCache()) { $.Schedule(0.15, gL); return; }
      resetStyleStateForNewPanels();
      if (rb.GetParent) { var p = rb.GetParent(); if (cp !== p) cp = p; }

      scan(rb);
      var isEnemy = !!(fl & 1) && !(fl & 2);
      if (isEnemy && !directBootstrapApplied && now - lastDirectBootstrapAt >= 1000) {
        lastDirectBootstrapAt = now;
        tryApplyDirectBootstrap("enemy_tick");
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
          bg.style.visibility = 'collapse';
          bg.style.opacity = '0';
          lBgVis = 'collapse';
          lBgOp = '0';
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
      if (isEnemy && now - lastStyleReapplyAt >= STYLE_REAPPLY_MS) {
        lastStyleReapplyAt = now;
        settingsDirty = true;
        settingsRefreshHoldUntil = now;
        lBgVis = null;
        lBgOp = null;
      }
      if (settingsDirty) {
        if (now < settingsRefreshHoldUntil) { $.Schedule(0.05, gL); return; }
        applyCurrentSettings(isEnemy);
      }
      else { sHBV(isEnemy && !!cfg.hp_bg_visible); applyInfoHealthMarginTop(); applyHealthbarHeight(); }

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
      sKZ(true, pw);

      // No change in width â€” back off
      if (w === lW && pw === lPW && !pulse) {
        if (now - lUT > 2000) { $.Schedule(1, gL); return; }
        $.Schedule(0.15, gL); return;
      }
      lW = w; lPW = pw; lUT = now;
      if (pw <= 0) { sKZ(false, 0); $.Schedule(0.18, gL); return; }

      var hp = (w / pw * 100) | 0;
      var low = clampPercent(cfg.hp_low_threshold);
      var high = clampPercent(cfg.hp_high_threshold);
      if (high < low) high = low;

      // Small change above low threshold â€” back off
      if (Math.abs(hp - lHp) < 3 && hp > low && lHp > low && !pulse) { $.Schedule(0.15, gL); return; }
      var prevHp = lHp;
      if (hp === pPct) sFC++; else { sFC = 0; pPct = hp; }
      lHp = hp;

      // Update HP counter label
      var txt = '';
      if (pl) { try { pl.style.visibility = cfg.hp_pip_visible ? 'visible' : 'collapse'; txt = pl.text || pl.GetAttributeString('text', '') || ''; } catch (e) { txt = ''; } }
      if (lb && lbp) {
        var bw = lb.actuallayoutwidth || 0, bpw = lbp.actuallayoutwidth || 0;
        var ratio = bpw > 0 ? bw / bpw : 0;
        var mx = pMax(txt);
        uHT(ratio >= 0.97 ? mx : Math.round(mx * ratio), mx, hp <= low);
      }

      var sc = 0.15, cl, textCol;

      var pulseThresh = clampPercent(cfg.hp_pulse_threshold);
      if (hp <= low) {
        if (panelBornAt && (now - panelBornAt) < 900 && (prevHp < 0 || (prevHp <= low && hp > prevHp))) {
          var warmupCol = getHighColor();
          clearPulse();
          sBC(warmupCol); sUC(warmupCol); sTC(getTextColor(100, low, high));
          $.Schedule(0.05, gL); return;
        }
        sHBV(cfg.hp_pulse_hide_bar ? false : !!cfg.hp_bg_visible);
        if (cfg.hp_mode === 1) {
          cl = cfg.hp_color_low;
          textCol = cfg.hp_text_color_mode ? cfg.hp_text_color_low : cfg.hp_color_low;
        } else {
          sBC(cfg.hp_color_low);
          textCol = getTextColor(hp, low, high);
        }
        // Start or maintain pulse brightness animation
        if (cfg.hp_pulse_enabled && hp <= pulseThresh) {
          if (!pulse) startPulse();
          updatePulseTextBrightness(now);
          if (cfg.hp_pulse_text_enabled) sc = 0.05;
        } else {
          if (pulse) clearPulse();
        }
        sTC(textCol); sUC(cfg.hp_color_low);
        if (cfg.hp_mode === 1) { sBC(cl); sUC(cl); }
      } else {
        clearPulse();
        sHBV(!!cfg.hp_bg_visible);
        var denomMid = Math.max(1, high - low);
        var denomHigh = Math.max(1, 100 - high);
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
            var _backoff = [0.30, 0.60, 1.0, 1.0];
            sc = _backoff[Math.min(Math.floor((sFC - 5) / 5), 3)];
          }
        }
        sBC(cl); sUC(cl); sTC(textCol);
      }

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
    var prev = lLv;
    uLT();
    lLNoChange = (lLv === prev && lLv > 0) ? lLNoChange + 1 : 0;
    $.Schedule(lLNoChange > 10 ? 2.5 : 0.5, lL);
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
        var _backoffA = [0.35, 0.70, 1.40, 2.0, 2.0];
        var scIdle = _backoffA[Math.min(Math.floor(sfcA / 3), 4)];
        $.Schedule(scIdle, aL); return;
      }
      sfcA = 0; lWA = aw; lPWA = apw;

      var ahp = (aw / apw * 100) | 0;
      var alow = clampPercent(cfg.hp_low_threshold);
      var ahigh = clampPercent(cfg.hp_high_threshold);
      if (ahigh < alow) ahigh = alow;

      var apulseThresh = clampPercent(cfg.hp_friend_pulse_threshold);
      var inPulse = cfg.hp_friend_pulse_enabled && ahp <= apulseThresh;

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
          pulseA = 1; lPDA = null; lPIA = -1; lColA = null;
          try { if (rbA) rbA.AddClass(LP); } catch (e) {}
          var aidx = Number(cfg.hp_friend_pulse_intensity) | 0;
          if (aidx < 0 || aidx > 2) aidx = 1;
          lPIA = aidx;
          var acls = PULSE_INTENSITY[aidx];
          if (acls) { try { rbA.AddClass(acls); } catch (e) {} }
          var abpm = Number(cfg.hp_friend_pulse_bpm) || 75;
          if (abpm < 30) abpm = 30; if (abpm > 300) abpm = 300;
          var adur = (60 / abpm).toFixed(3) + 's';
          lPDA = adur;
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

  tryApplyDirectBootstrap("script_start");
  gRunning = true; gL();
  aRunning = true; aL();
  lL();
  $.Schedule(0.05, scheduleBootstrapRetry);
})();
