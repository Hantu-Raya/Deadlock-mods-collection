'use strict';
(function () {
  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  }

  loadCfgDefaults();
  refreshDerivedConfig();
  var PRESET_MAX_FAST_ATTEMPTS = 8;
  var PRESET_RETRY_SEC = 0.5;
  var PRESET_SLOW_RETRY_SEC = 3.0;
  var STYLE_REAPPLY_WATCHDOG_MS = 5000;
  var SHARED_CFG_RAW_KEY = "__hpColorsCfgRaw";
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
  var lastAllyStyleReapplyAt = 0;
  var sharedCfgRaw = "";
  var _uiMissAt = 0;
  var UI_MISS_TTL_MS = 2000;

  function getSharedStore() {
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig) return GameUI.CustomUIConfig();
    } catch (e) {}
    return null;
  }

  function markPresetApplied() {
    presetApplied = true;
    settingsDirty = true;
    allySettingsDirty = true;
    settingsRefreshHoldUntil = 0;
    allySettingsRefreshHoldUntil = 0;
    lLvVis = null;
    handleRuntimeToggleState();
  }

  function applyPresetSnapshot(values) {
    if (!values) return false;
    var count = 0;
    for (var k in values) {
      if (!Object.prototype.hasOwnProperty.call(values, k)) continue;
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      cfg[k] = coerceCfgValue(k, values[k]);
      count += 1;
    }
    if (!count) return false;
    refreshDerivedConfig();
    try { resetStyleStateForNewPanels(); } catch (eReset) {}
    markPresetApplied();
    return true;
  }

  function tryApplySharedSnapshot() {
    var store = getSharedStore();
    if (!store) return false;
    var raw = "";
    try { raw = String(store[SHARED_CFG_RAW_KEY] || ""); } catch (e) { raw = ""; }
    if (!raw) return false;
    if (raw === sharedCfgRaw && presetApplied) return true;
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (eParse) { return false; }
    var values = parsed && typeof parsed === "object" ? (parsed.values || parsed) : null;
    if (!values || typeof values !== "object") return false;
    if (!applyPresetSnapshot(values)) return false;
    sharedCfgRaw = raw;
    return true;
  }

  function requestPresetSnapshot(reason) {
    try {
      $.DispatchEvent(EVENT_CHANNEL, JSON.stringify({
        magic_word: REQUEST_MAGIC,
        mod_title: "HP Colors",
        reason: String(reason || "overlay_request")
      }));
    } catch (e) {}
  }

  function schedulePresetRetry() {
    if (presetApplied) return;
    if (tryApplySharedSnapshot()) return;
    presetAttempts += 1;
    requestPresetSnapshot(presetAttempts === 1 ? "overlay_startup" : "overlay_retry");
    $.Schedule(presetAttempts <= PRESET_MAX_FAST_ATTEMPTS ? PRESET_RETRY_SEC : PRESET_SLOW_RETRY_SEC, schedulePresetRetry);
  }

  try {
    $.RegisterForUnhandledEvent(EVENT_CHANNEL, function (payload) {
      if (typeof payload === "string" && payload.indexOf(SNAPSHOT_MAGIC) === -1) return;
      try {
        var data = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (!data || data.magic_word !== SNAPSHOT_MAGIC) return;
        if (data.mod_title && data.mod_title !== "HP Colors") return;
        if (!data.values || typeof data.values !== "object") return;
        var raw = typeof data.values_raw === "string" ? data.values_raw : "";
        if (!raw) {
          try { raw = JSON.stringify(data.values); } catch (eRaw) { raw = ""; }
        }
        if (raw && raw === sharedCfgRaw && presetApplied) return;
        if (applyPresetSnapshot(data.values) && raw) sharedCfgRaw = raw;
      } catch (e) {}
    });
  } catch (e) {}

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
      if (vPanel(us) && vPanel(hc) && vPanel(bg) && vPanel(pl) && vPanel(lb) && vPanel(lbp) && vPanel(nm)) return 1;
      cached = 0;
      nextCacheProbeAt = 0;
    }
    var now = _ts();
    if (nextCacheProbeAt && now < nextCacheProbeAt) return 0;
    att++;
    if (!vPanel(us)) us = ctx.FindChildTraverse('UnitStatus');
    if (!us) { nextCacheProbeAt = now + (att < 8 ? 150 : (att < 24 ? 500 : 1500)); return 0; }
    if (!vPanel(hc)) hc = us.FindChildTraverse('hp_counter');
    if (!vPanel(hca)) hca = us.FindChildTraverse('hp_counter_anchor');
    if (!vPanel(bg)) bg = us.FindChildTraverse('unit_healthbar_bg');
    if (!vPanel(pl)) pl = us.FindChildTraverse('unit_healthbar_pip_label');
    if (!vPanel(lb)) lb = us.FindChildTraverse('unit_healthbar_lagging');
    if (!vPanel(kz)) kz = us.FindChildTraverse('hp_kill_zone_marker');
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
  }

  function sKZ(show, parentWidth) {
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
    lastAllyStyleReapplyAt = 0;
    settingsDirty = true;
    allySettingsDirty = true;
    settingsRefreshHoldUntil = 0;
    allySettingsRefreshHoldUntil = 0;
  }

  function cleanupEnemyFeature() {
    clearPulse();
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

  function stopEnemyLoop(cleanup) {
    if (cleanup) cleanupEnemyFeature();
    gRunning = false;
  }

  function startAllyLoop(delay) {
    if (!cfg.hp_friend_enabled || aRunning) return;
    aRunning = true;
    $.Schedule(delay || 0.05, aL);
  }

  function stopAllyLoop(cleanup) {
    if (cleanup) releaseAllyOwnership(true);
    aRunning = false;
  }

  function startLevelLoop(delay) {
    if (!cfg.hp_level_number_visible || lRunning) return;
    lRunning = true;
    $.Schedule(delay || 0.05, lL);
  }

  function stopLevelLoop(cleanup) {
    if (cleanup) cleanupLevelNumberVisibility();
    lRunning = false;
  }

  function handleRuntimeToggleState() {
    refreshDerivedConfig();
    if (cfg.hp_enabled) startEnemyLoop();
    else stopEnemyLoop(true);

    if (cfg.hp_friend_enabled) startAllyLoop();
    else stopAllyLoop(true);

    if (cfg.hp_level_number_visible) startLevelLoop();
    else stopLevelLoop(true);

    if (!cfg.hp_pulse_enabled && pulse) clearPulse();
    if (pulse) { lPD = null; applyPulseDuration(); applyPulseIntensity(); applyPulseTextState(); }
    else if (!cfg.hp_pulse_text_enabled) { lCounterLowMode = false; sHCS(false); }
    if (!cfg.hp_friend_pulse_enabled && pulseA) clearAllyPulse(rbA);
    if (!cfg.hp_kill_zone_enabled) sKZ(false, 0);
    if (pl && pl.style && !cfg.hp_pip_visible && lPipVis !== 'collapse') {
      try { pl.style.visibility = 'collapse'; lPipVis = 'collapse'; } catch (ePip) { lPipVis = null; }
    }
  }

  function applyCurrentSettings(isEnemy) {
    refreshDerivedConfig();
    sHBV(!isEnemy || !!cfg.hp_bg_visible);
    sHCS(lCounterLowMode);
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
        stopEnemyLoop(true);
        return;
      }

      var now = _ts();
      resetCachedPanelRefsIfInvalid();
      if (!rb) { rb = fRB(); if (!rb) { $.Schedule(0.15, gL); return; } }
      if (!cached && !tryCache()) { $.Schedule(0.15, gL); return; }
      if (rb.GetParent) { var p = rb.GetParent(); if (cp !== p) cp = p; }
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
      var fmt = cfg.hp_counter_format | 0;
      var txt = '';
      if (pl) {
        try {
          var pipVis = cfg.hp_pip_visible ? 'visible' : 'collapse';
          if (lPipVis !== pipVis) { pl.style.visibility = pipVis; lPipVis = pipVis; }
          if (fmt !== 1) txt = pl.text || pl.GetAttributeString('text', '') || '';
        } catch (e) { txt = ''; lPipVis = null; }
      }
      if (lb && lbp) {
        if (fmt === 1) {
          uHT(hp, 100, shouldPulse);
        } else {
          var bw = lb.actuallayoutwidth || 0, bpw = lbp.actuallayoutwidth || 0;
          var ratio = bpw > 0 ? bw / bpw : 0;
          var mx = pMax(txt);
          uHT(ratio >= 0.97 ? mx : Math.round(mx * ratio), mx, shouldPulse);
        }
      }

      var sc = 0.15, cl, textCol;

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
          sBC(cfg.hp_color_low);
          textCol = getTextColor(hp, low, high);
        }
        sTC(textCol); sUC(cfg.hp_color_low);
        if (cfg.hp_mode === 1) { sBC(cl); sUC(cl); }
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
        sBC(cl); sUC(cl); sTC(textCol);
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
      stopLevelLoop(true);
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
        resetAllyScanCache();
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
      if (now - lastAllyStyleReapplyAt >= STYLE_REAPPLY_WATCHDOG_MS) {
        lastAllyStyleReapplyAt = now;
        lColA = null;
        lWA = -1;
        lPWA = -1;
        sfcA = 0;
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

  tryApplySharedSnapshot();
  handleRuntimeToggleState();
  schedulePresetRetry();
})();
