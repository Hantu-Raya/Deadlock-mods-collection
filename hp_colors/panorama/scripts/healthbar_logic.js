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
    hp_color_low: "#E16161",
    hp_color_mid: "#FF7B00",
    hp_color_high: "#00FF00",
    hp_counter_size: 120,
    hp_counter_position: "20,196",
    hp_text_color_mode: 0,
    hp_text_color_low: "#E16161",
    hp_text_color_mid: "#FF7B00",
    hp_text_color_high: "#FFFFFF",
    hp_pulse_bpm: 75,
    hp_pulse_intensity: 1,
    hp_pulse_enabled: true,
    hp_pulse_text_enabled: true,
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
    hp_friend_pulse_color: "#FF2222"
  };
  var cfg = {};
  var TEAM1_HIGH = "#FFC961";
  var TEAM2_HIGH = "#6485FC";
  var CSS_TEAM_ENEMY_COLOR = "#e16161";
  var WHITE_WASH = "#ffffff";
  var LP = 'low_hp_pulsing';
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
  var lColA = null, lWA = -1, lPWA = -1, sfcA = 0;
  var pulseA = 0, lPDA = null, lPIA = -1;
  var aScanF2 = -1, aScanT2 = 0, aScanAt = 0;

  function removePulseIntensityClasses(panel) {
    if (!panel) return;
    try {
      for (var i = 0; i < PULSE_INTENSITY.length; i++) {
        if (PULSE_INTENSITY[i]) panel.RemoveClass(PULSE_INTENSITY[i]);
      }
    } catch (e) {}
  }

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
    if (rb) rb.style.animationDuration = dur;
    if (ui) ui.style.animationDuration = dur;
  }

  function applyPulseIntensity() {
    var idx = Number(cfg.hp_pulse_intensity) | 0;
    if (idx < 0 || idx > 2) idx = 1;
    if (lPI === idx) return;
    var oldCls = lPI >= 0 ? PULSE_INTENSITY[lPI] : '';
    var newCls = PULSE_INTENSITY[idx];
    lPI = idx;
    if (oldCls) {
      try { if (rb) rb.RemoveClass(oldCls); } catch (e) {}
      try { if (ui) ui.RemoveClass(oldCls); } catch (e2) {}
    }
    if (newCls) {
      try { if (rb) rb.AddClass(newCls); } catch (e3) {}
      try { if (ui) ui.AddClass(newCls); } catch (e4) {}
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
    pulse = 0; lPD = null; lPI = -1; lTB = null; lCol = lUlt = lTxt = null;
    clearPulsePanel(rb, oldCls);
    clearPulsePanel(hc, oldCls);
    clearPulsePanel(ui, oldCls);
  }

  function clearAllyPulse() {
    var oldCls = lPIA >= 0 ? PULSE_INTENSITY[lPIA] : '';
    pulseA = 0; lPDA = null; lPIA = -1; lColA = null;
    clearPulsePanel(rbA, oldCls);
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
  var bootstrapApplied = false;
  var bootstrapAttempts = 0;
  var bootstrapFinished = false;
  var settingsDirty = true;

  function getRootPanel() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel || null;
  }

  function requestBootstrap(reason) {
    var root = getRootPanel();
    var now = Date.now ? Date.now() : (new Date()).getTime();
    try {
      if (root) {
        var nextAllowedAt = Number(root.__hpColorsBootstrapNextAllowedAt || 0);
        if (isFinite(nextAllowedAt) && nextAllowedAt > now) return;
        root.__hpColorsBootstrapNextAllowedAt = now + Math.floor(BOOTSTRAP_RETRY_SEC * 1000 * 0.8);
      }
    } catch (eRate) {}

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
    if (bootstrapAttempts >= BOOTSTRAP_MAX_ATTEMPTS) {
      bootstrapFinished = true;
      return;
    }

    bootstrapAttempts += 1;
    requestBootstrap(bootstrapAttempts === 1 ? "overlay_startup" : "overlay_retry");
    $.Schedule(BOOTSTRAP_RETRY_SEC, scheduleBootstrapRetry);
  }

  // Live updates from Anita UI, including boot-time bootstrap values.
  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
    try {
      var d = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!d || d.mod_title !== TITLE) return;

      if (d.magic_word === "ANITA_UPDATE") {
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, d.setting_id)) {
          if (d.setting_id === "hp_counter_position" && d.update_source === "hp_counter_autoposition") {
            return;
          }
          cfg[d.setting_id] = coerceCfgValue(d.setting_id, d.value); settingsDirty = true;
          if (d.setting_id === "hp_enabled" && cfg.hp_enabled && !gRunning) { gRunning = true; $.Schedule(0.05, gL); }
          if (d.setting_id === "hp_friend_enabled" && cfg.hp_friend_enabled && !aRunning) { aRunning = true; $.Schedule(0.05, aL); }
          if (pulse && (d.setting_id === "hp_pulse_bpm" || d.setting_id === "hp_pulse_intensity" || d.setting_id === "hp_pulse_text_enabled" || d.setting_id === "hp_pulse_text_scale")) {
            if (d.setting_id === "hp_pulse_bpm") { lPD = null; applyPulseDuration(); }
            if (d.setting_id === "hp_pulse_intensity") applyPulseIntensity();
            if (d.setting_id === "hp_pulse_text_enabled" || d.setting_id === "hp_pulse_text_scale") applyPulseTextState();
          }
          if (d.setting_id === "hp_pulse_enabled" && !cfg.hp_pulse_enabled) clearPulse();
        }
        if (d.update_source === "bridge_bootstrap") { bootstrapApplied = true;
          bootstrapFinished = true;
          try {
            var root = getRootPanel();
            if (root) root.__hpColorsBootstrapAppliedAt = Date.now ? Date.now() : (new Date()).getTime();
          } catch (eBoot) {}
        }
        return;
      }
    } catch (e) {}
  });

  // â”€â”€ Color helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function hexToRgb(s) {
    if (!s) return [255, 255, 255];
    if (s.charAt(0) === '#') {
      var h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    var m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) return [+m[1], +m[2], +m[3]];
    return [255, 255, 255];
  }

  function clampByte(v) {
    v = Number(v);
    if (!isFinite(v)) return 0;
    v = v | 0;
    if (v < 0) return 0;
    if (v > 255) return 255;
    return v;
  }

  function byteHex(v) {
    var h = clampByte(v).toString(16);
    return h.length === 1 ? '0' + h : h;
  }

  function rgbToHex(c) {
    return '#' + byteHex(c[0]) + byteHex(c[1]) + byteHex(c[2]);
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

  function lerp(a, b, t) { return (a + (b - a) * t) | 0; }
  function ip(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }

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
        return rgbToHex(ip(hexToRgb(cfg.hp_text_color_low), hexToRgb(cfg.hp_text_color_mid), t));
      }
      var t2 = (hp - high) / denomHigh;
      return rgbToHex(ip(hexToRgb(cfg.hp_text_color_mid), hexToRgb(cfg.hp_text_color_high), t2));
    }
    // By HP % mode - use bar colors (same interpolation as bar)
    if (hp <= low) return cfg.hp_color_low;
    if (hp <= high) {
      var t3 = (hp - low) / denomMid;
      return rgbToHex(ip(hexToRgb(cfg.hp_color_low), hexToRgb(cfg.hp_color_mid), t3));
    }
    var t4 = (hp - high) / denomHigh;
    var highCol = getHighColor();
    return rgbToHex(ip(hexToRgb(cfg.hp_color_mid), hexToRgb(highCol), t4));
  }

  // â”€â”€ Panel cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var ctx = $.GetContextPanel();
  var us = null, hc = null, bg = null, pl = null, lb = null, lbp = null, rb = null, cp = null, ui = null;
  var cached = 0, att = 0;
  var lBgVis = null, lBgOp = null, lHpSize = null, lHpPos = null, lHpMarginLeft = null, lHpHeight = null;

  function fRB() {
    return ctx.FindChildTraverse('unit_healthbar_lagging') ||
      ctx.FindChildTraverse('health_bar') ||
      ctx.FindChildTraverse('unit_health');
  }

  function tryCache() {
    if (cached) return 1;
    if (att >= 10) return 0;
    att++;
    if (!us || !us.IsValid()) us = ctx.FindChildTraverse('UnitStatus');
    if (!us) return 0;
    if (!hc || !hc.IsValid()) hc = us.FindChildTraverse('hp_counter');
    if (!bg || !bg.IsValid()) bg = us.FindChildTraverse('unit_healthbar_bg');
    if (!pl || !pl.IsValid()) pl = us.FindChildTraverse('unit_healthbar_pip_label');
    if (!lb || !lb.IsValid()) lb = us.FindChildTraverse('unit_healthbar_lagging');
    if (lb && (!lbp || !lbp.IsValid())) lbp = lb.GetParent();
    if (pl && lb && lbp) { cached = 1; return 1; }
    return 0;
  }

  // â”€â”€ Team/flag scan (walk up to find team classes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var tid = 0, fl = 0, lAT = 0;

  function scan(p) {
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
  }

  // â”€â”€ Setter helpers (skip redundant writes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lCol = null, lUlt = null, lTxt = null;
  var lSH = -1, lSM = -1, lVis = null;
  var lTx = null, cMax = 0;
  var lCounterText = "";
  var lCounterLowMode = false;
  var lCounterAutoPos = null;
  var lastRbPanel = null, lastHcPanel = null, lastBgPanel = null;
  var panelBornAt = 0;

  function sBC(c) {
    var next = normalizeWashColor(c);
    if (lCol !== next && rb) {
      try { rb.style.washColor = next; lCol = next; } catch (e) { lCol = null; }
    }
  }
  function sUC(c) {
    var next = normalizeWashColor(c);
    if (!ui || !ui.IsValid()) ui = ctx.FindChildTraverse('unit_ult_ready_icon') || ctx.FindChildTraverse('ult_icon');
    if (!ui || !ui.style) return;
    if (lUlt !== next) {
      try { ui.style.washColor = next; lUlt = next; } catch (e) { lUlt = null; }
    }
  }
  function sTC(c) {
    var next = normalizeWashColor(c);
    if (!hc || !hc.style) return;
    if (lTxt !== next) {
      try { hc.style.washColor = next; lTxt = next; } catch (e) { lTxt = null; }
    }
  }

  function clampNum(v, min, max, fallback) {
    var next = Number(v);
    if (!isFinite(next)) next = Number(fallback);
    if (!isFinite(next)) next = 0;
    if (isFinite(min) && next < min) next = min;
    if (isFinite(max) && next > max) next = max;
    return next;
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
    var defaultSize = clampNum(cfg.hp_counter_size, 72, 400, 120);
    var baseSize = pulseTextMode ? getPulseTextSize(defaultSize) : defaultSize;
    var basePos = parseCounterPositionValue(pulseTextMode ? cfg.hp_pulse_text_position : cfg.hp_counter_position);
    var text = String(textHint !== undefined ? textHint : lCounterText || "");
    var available = getCounterAvailableWidth();
    var units = estimateCounterUnits(text);
    var fitWidthSize = available > 0 ? Math.floor((available - 12) / (units * 0.45)) : baseSize;
    var fitSize = fitWidthSize;
    fitSize = clampNum(fitSize, 72, 400, baseSize);
    var size = Math.min(baseSize, fitSize);
    var posX = clampNum(basePos.x, 0, 400, 0);
    var posY = clampNum(basePos.y, 0, 400, 200);
    if (!cfg.hp_bg_visible && !pulseTextMode) {
      posX = Math.min(Math.round(baseSize * 0.025), 8);
      posY = Math.min(Math.round(baseSize * 0.5), 150);
      syncCounterPositionSetting({ x: posX, y: posY });
    } else {
      lCounterAutoPos = null;
    }
    var marginLeft = (!cfg.hp_bg_visible && baseSize >= 320) ? '8%' : Math.round(posX) + '%';
    var fontSize = size + 'px';
    var baseHeight = 130;
    try {
      var hpParent = hc.GetParent ? hc.GetParent() : null;
      if (hpParent && hpParent.actuallayoutheight > 0) baseHeight = hpParent.actuallayoutheight;
    } catch (e) {}
    var panelHeightPx = pulseTextMode ? Math.max(baseHeight, Math.round(size * 1.85)) : baseHeight;
    var marginTopY = pulseTextMode ? (posY * baseHeight / panelHeightPx) : posY;
    var marginTop = '-' + Math.round(marginTopY) + '%';
    var panelHeight = pulseTextMode ? panelHeightPx + 'px' : '100%';
    if (lHpSize !== fontSize) { hc.style.fontSize = fontSize; lHpSize = fontSize; }
    if (lHpPos !== marginTop) { hc.style.marginTop = marginTop; lHpPos = marginTop; }
    if (lHpMarginLeft !== marginLeft) { hc.style.marginLeft = marginLeft; lHpMarginLeft = marginLeft; }
    if (lHpHeight !== panelHeight) { hc.style.height = panelHeight; lHpHeight = panelHeight; }
  }

  function resetStyleStateForNewPanels() {
    if (rb === lastRbPanel && hc === lastHcPanel && bg === lastBgPanel) return;
    lastRbPanel = rb;
    lastHcPanel = hc;
    lastBgPanel = bg;
    panelBornAt = Date.now();
    clearPulse();
    lBgVis = lBgOp = lHpSize = lHpPos = lHpMarginLeft = lHpHeight = null;
    lSH = -1;
    lSM = -1;
    lVis = null;
    lW = -1;
    lPW = -1;
    lHp = -1;
    pPct = -1;
    sFC = 0;
    lCounterLowMode = false;
    settingsDirty = true;
  }

  function applyCurrentSettings(isEnemy) {
    sHBV(!isEnemy || !!cfg.hp_bg_visible);
    sHCS(lCounterLowMode, lCounterText);
    settingsDirty = false;
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
        if (bg && bg.style) { bg.style.visibility = 'collapse'; bg.style.opacity = '0'; lBgVis = 'collapse'; lBgOp = '0'; }
        if (hc && hc.style) {
          hc.style.fontSize = "";
          hc.style.marginTop = "";
          hc.style.marginLeft = "";
          hc.style.height = "";
          sTC("");
          lHpSize = null;
          lHpPos = null;
          lHpMarginLeft = null;
          lHpHeight = null;
        }
        gRunning = false; return;
      }

      var now = Date.now();
      if (!rb) { rb = fRB(); if (!rb) { $.Schedule(0.15, gL); return; } }
      if (!cached && !tryCache()) { $.Schedule(0.15, gL); return; }
      resetStyleStateForNewPanels();
      if (rb.GetParent) { var p = rb.GetParent(); if (cp !== p) cp = p; }

      scan(rb); lAT = now;
      var isEnemy = !!(fl & 1) && !(fl & 2);
      if (cfg.hp_skip_buildings && (fl & 4)) {
        clearPulse();
        if (!isEnemy) {
          sBC("");
          sUC("");
          sTC("");
          sHBV(true);
          $.Schedule(0.5, gL);
          return;
        }

        if (bg && bg.style) {
          bg.style.visibility = 'collapse';
          bg.style.opacity = '0';
          lBgVis = 'collapse';
          lBgOp = '0';
        }

        var skipColor = CSS_TEAM_ENEMY_COLOR;
        sBC(skipColor);
        sUC(skipColor);
        sTC(skipColor);
        sHBV(!!cfg.hp_bg_visible);
        $.Schedule(0.5, gL);
        return;
      }
      if (settingsDirty) applyCurrentSettings(isEnemy);
      else sHBV(isEnemy && !!cfg.hp_bg_visible);

      // Neutral unit
      if (fl & 2) { clearPulse();
        sHBV(true);
        sBC('#5BEFB5');
        sTC(WHITE_WASH);
        lUT = now;
        $.Schedule(1.5, gL); return;
      }
      // Not an enemy â€” skip coloring
      if (!(fl & 1)) { sHBV(true); sBC(""); sUC(""); lUT = now; $.Schedule(0.4, gL); return; }

      var w = rb.actuallayoutwidth | 0;
      var pw = cp && cp.actuallayoutwidth !== undefined ? cp.actuallayoutwidth | 0 : 0;

      // No change in width â€” back off
      if (w === lW && pw === lPW && !pulse) {
        if (now - lUT > 2000) { $.Schedule(1, gL); return; }
        $.Schedule(0.15, gL); return;
      }
      lW = w; lPW = pw; lUT = now;
      if (pw <= 0) { $.Schedule(0.18, gL); return; }

      var hp = (w / pw * 100) | 0;
      var low = cfg.hp_low_threshold | 0;
      var high = cfg.hp_high_threshold | 0;
      if (low < 0) low = 0;
      if (low > 100) low = 100;
      if (high < 0) high = 0;
      if (high > 100) high = 100;
      if (high < low) high = low;

      // Small change above low threshold â€” back off
      if (Math.abs(hp - lHp) < 3 && hp > low && lHp > low && !pulse) { $.Schedule(0.15, gL); return; }
      var prevHp = lHp;
      if (hp === pPct) sFC++; else { sFC = 0; pPct = hp; }
      lHp = hp;

      // Update HP counter label
      var txt = '';
      if (pl) { try { txt = pl.text || pl.GetAttributeString('text', '') || ''; } catch (e) { txt = ''; } }
      if (lb && lbp) {
        var bw = lb.actuallayoutwidth || 0, bpw = lbp.actuallayoutwidth || 0;
        var ratio = bpw > 0 ? bw / bpw : 0;
        var mx = pMax(txt);
        uHT(ratio >= 0.97 ? mx : Math.round(mx * ratio), mx, hp <= low);
      }

      var sc = 0.15, cl, textCol;

      var pulseThresh = cfg.hp_pulse_threshold | 0;
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
            cl = rgbToHex(ip(hexToRgb(cfg.hp_color_low), hexToRgb(cfg.hp_color_mid), (hp - low) / denomMid));
            textCol = getGradientTextColor(hp, low, high);
          } else {
            cl = cfg.hp_color_mid;
            textCol = getTextColor(hp, low, high);
          }
        } else {
          if (cfg.hp_mode === 1) {
            cl = rgbToHex(ip(hexToRgb(cfg.hp_color_mid), hexToRgb(highCol), (hp - high) / denomHigh));
            textCol = getGradientTextColor(hp, low, high);
          } else {
            cl = highCol;
            textCol = getTextColor(hp, low, high);
          }
          if (sFC >= 5) sc = Math.min(0.15 * Math.pow(2, Math.floor(sFC / 5)), 1);
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
  var ll = null, lc = null, wr = null, lLv = -1;

  function pLv(t) { var v = 0; for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i) - 48; if (c >= 0 && c <= 9) v = v * 10 + c; } return v; }
  function fER(p) { var c = p; while (c) { if (c.BHasClass && c.BHasClass('enemy')) return c; if (!c.GetParent) break; c = c.GetParent(); } return null; }

  function cLU() {
    if (!ll || !ll.IsValid()) ll = ctx.FindChildTraverse('unit_level_label');
    if (!lc || !lc.IsValid()) lc = ctx.FindChildTraverse('LevelContainer');
    if (lc && (!wr || !wr.IsValid())) wr = fER(lc);
    return ll && lc && wr;
  }

  function uLT() {
    if (!cLU()) return;
    var t = ''; try { t = ll.text || ll.GetAttributeString('text', '') || ''; } catch (e) { t = ''; }
    if (!t || t.charCodeAt(0) === 123) return;
    var lv = pLv(t);
    if (lv === lLv || !lv) return;
    lLv = lv;
    for (var i = 0; i < 4; i++) wr.RemoveClass(LC_[i]);
    for (var j = 3; j >= 0; j--) { if (lv >= LT_[j]) { wr.AddClass(LC_[j]); break; } }
  }

  function lL() { uLT(); $.Schedule(0.5, lL); }

  // ── Ally bar loop ────────────────────────────────────────────────────────────
  function aL() {
    aRunning = true;
    try {
      if (!cfg.hp_friend_enabled) {
        clearAllyPulse();
        if (rbA) { try { rbA.style.washColor = ''; } catch (e) {} }
        lColA = null; aRunning = false; return;
      }

      var now = Date.now();
      if (!rbA || !rbA.IsValid()) {
        rbA = null; cpA = null; aScanF2 = -1; aScanAt = 0;
        rbA = fRB();
        if (!rbA) { $.Schedule(0.2, aL); return; }
      }
      if (rbA.GetParent) { var pa = rbA.GetParent(); if (cpA !== pa) cpA = pa; }

      // Scan with 2000ms cache — friend/player class hierarchy is stable
      var f2, t2;
      if (aScanF2 < 0 || (now - aScanAt) >= 2000) {
        t2 = 0; f2 = 0; var d2 = 0, c2 = rbA;
        while (c2 && d2 < 10) {
          if (c2.BHasClass) {
            if (!t2) { if (c2.BHasClass('team2')) t2 = 2; else if (c2.BHasClass('team1')) t2 = 1; }
            if (!(f2 & 1) && c2.BHasClass('friend')) f2 |= 1;
            if (!(f2 & 2) && c2.BHasClass('player')) f2 |= 2;
            if (t2 && (f2 & 3)) break;
          }
          if (!c2.GetParent) break;
          c2 = c2.GetParent(); d2++;
        }
        aScanF2 = f2; aScanT2 = t2; aScanAt = now;
      } else {
        f2 = aScanF2; t2 = aScanT2;
      }

      if (!(f2 & 1) || !(f2 & 2)) {
        clearAllyPulse();
        if (rbA) { try { rbA.style.washColor = ''; } catch (e) {} }
        lColA = null; sfcA = 0;
        $.Schedule(1.5, aL); return;
      }

      var aw = rbA.actuallayoutwidth | 0;
      var apw = cpA && cpA.actuallayoutwidth !== undefined ? cpA.actuallayoutwidth | 0 : 0;
      if (apw <= 0) { $.Schedule(0.2, aL); return; }

      if (aw === lWA && apw === lPWA && !pulseA) {
        sfcA++;
        var scIdle = Math.min(0.35 * Math.pow(2, Math.floor(sfcA / 3)), 2.0);
        $.Schedule(scIdle, aL); return;
      }
      sfcA = 0; lWA = aw; lPWA = apw;

      var ahp = (aw / apw * 100) | 0;
      var alow = cfg.hp_low_threshold | 0;
      var ahigh = cfg.hp_high_threshold | 0;
      if (alow < 0) alow = 0; if (alow > 100) alow = 100;
      if (ahigh < 0) ahigh = 0; if (ahigh > 100) ahigh = 100;
      if (ahigh < alow) ahigh = alow;

      var apulseThresh = cfg.hp_friend_pulse_threshold | 0;
      var inPulse = cfg.hp_friend_pulse_enabled && ahp <= apulseThresh;

      // Use pulse color override when active, otherwise gradient/fixed
      var acl;
      if (inPulse && cfg.hp_friend_pulse_color_enabled) {
        acl = cfg.hp_friend_pulse_color;
      } else if (cfg.hp_mode === 1) {
        if (ahp <= alow) acl = cfg.hp_friend_color_low;
        else if (ahp <= ahigh) acl = rgbToHex(ip(hexToRgb(cfg.hp_friend_color_low), hexToRgb(cfg.hp_friend_color_mid), (ahp - alow) / Math.max(1, ahigh - alow)));
        else acl = rgbToHex(ip(hexToRgb(cfg.hp_friend_color_mid), hexToRgb(cfg.hp_friend_color_high), (ahp - ahigh) / Math.max(1, 100 - ahigh)));
      } else {
        if (ahp <= alow) acl = cfg.hp_friend_color_low;
        else if (ahp <= ahigh) acl = cfg.hp_friend_color_mid;
        else acl = cfg.hp_friend_color_high;
      }
      var nextColA = normalizeWashColor(acl);
      if (lColA !== nextColA && rbA) {
        try { rbA.style.washColor = nextColA; lColA = nextColA; } catch (e) { lColA = null; }
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
        if (pulseA) { clearAllyPulse(); lColA = null; }
      }

      $.Schedule(sc, aL);
    } catch (e) {
      $.Schedule(0.5, aL);
    }
  }

  gRunning = true; gL();
  aRunning = true; aL();
  lL();
  $.Schedule(0.05, scheduleBootstrapRetry);
})();
