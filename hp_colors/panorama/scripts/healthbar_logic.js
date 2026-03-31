'use strict';
(function () {

  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var TITLE = "HP Colors";
  var DEFAULTS = {
    hp_enabled: true,
    hp_mode: 1,
    hp_low_threshold: 25,
    hp_bg_visible: true,
    hp_counter_size: 120,
    hp_counter_position: "20,196",
    hp_high_threshold: 65,
    hp_color_low: "#E16161",
    hp_color_mid: "#FF7B00",
    hp_color_high: "#00FF00",
    hp_color_neutral: "#5BEFB5",
    hp_team_colors: false
  };
  var TEAM1_HIGH = "#FFC961";
  var TEAM2_HIGH = "#6485FC";
  var LP = 'low_hp_bar_pulse', LTX = 'low_hp_text_large', LS = 'low_hp_ult_static';

  var cfg = {};

  function loadCfgDefaults() {
    for (var id in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, id)) {
        cfg[id] = DEFAULTS[id];
      }
    }
  }

  function coerceCfgValue(id, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, id)) return value;

    var fallback = DEFAULTS[id];
    if (id === "hp_counter_position") {
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
          cfg[d.setting_id] = coerceCfgValue(d.setting_id, d.value);
          settingsDirty = true;
        }
        if (d.update_source === "bridge_bootstrap") {
          bootstrapApplied = true;
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

  // Create a dark variant of a color for the low-HP gradient pulse
  function darkOf(c) { return [(c[0] * 0.37) | 0, (c[1] * 0.29) | 0, (c[2] * 0.29) | 0]; }

  function getHighColor() {
    if (!cfg.hp_team_colors) return cfg.hp_color_high;
    return tid === 2 ? TEAM2_HIGH : TEAM1_HIGH;
  }

  // â”€â”€ Panel cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var ctx = $.GetContextPanel();
  var us = null, hc = null, bg = null, pl = null, lb = null, lbp = null, rb = null, cp = null, ui = null;
  var cached = 0, att = 0;
  var lBgVis = null, lHpSize = null, lHpPos = null, lHpMarginLeft = null;

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
        if (t && (f & 3)) break;
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

  function sBC(c) {
    var next = normalizeWashColor(c);
    if (lCol !== next && rb) { rb.style.washColor = next; lCol = next; }
  }
  function sUC(c) {
    var next = normalizeWashColor(c);
    if (!ui || !ui.IsValid()) ui = ctx.FindChildTraverse('unit_ult_ready_icon') || ctx.FindChildTraverse('ult_icon');
    if (!ui || !ui.style) return;
    if (lUlt !== next) { ui.style.washColor = next; lUlt = next; }
  }
  function sTC(c) {
    var next = normalizeWashColor(c);
    if (!hc || !hc.style) return;
    if (lTxt !== next) { hc.style.washColor = next; lTxt = next; }
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

  function sHBV(visible) {
    if (!bg || !bg.style) return;
    var next = visible ? 'visible' : 'collapse';
    if (lBgVis !== next) { bg.style.visibility = next; lBgVis = next; }
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
    var baseSize = clampNum(cfg.hp_counter_size, 72, 400, 140);
    var basePos = parseCounterPositionValue(cfg.hp_counter_position);
    var text = String(textHint !== undefined ? textHint : lCounterText || "");
    var available = getCounterAvailableWidth();
    var units = estimateCounterUnits(text);
    var fitWidthSize = available > 0 ? Math.floor((available - 12) / (units * 0.45)) : baseSize;
    var fitSize = fitWidthSize;
    fitSize = clampNum(fitSize, 72, 400, baseSize);
    var size = Math.min(baseSize, fitSize);
    if (lowMode) size = Math.min(Math.round(size * 1.08), baseSize);
    var posX = clampNum(basePos.x, 0, 400, 0);
    var posY = clampNum(basePos.y, 0, 400, 200);
    if (!cfg.hp_bg_visible) {
      posX = Math.min(Math.round(baseSize * 0.025), 8);
      posY = Math.min(Math.round(baseSize * 0.5), 150);
      syncCounterPositionSetting({ x: posX, y: posY });
    } else {
      lCounterAutoPos = null;
    }
    if (lowMode) posY = Math.min(Math.round(posY + 10), 160);
    var marginLeft = (!cfg.hp_bg_visible && baseSize >= 320) ? '8%' : Math.round(posX) + '%';
    var fontSize = size + 'px';
    var marginTop = '-' + Math.round(posY) + '%';
    if (lHpSize !== fontSize) { hc.style.fontSize = fontSize; lHpSize = fontSize; }
    if (lHpPos !== marginTop) { hc.style.marginTop = marginTop; lHpPos = marginTop; }
    if (lHpMarginLeft !== marginLeft) { hc.style.marginLeft = marginLeft; lHpMarginLeft = marginLeft; }
  }

  function resetStyleStateForNewPanels() {
    if (rb === lastRbPanel && hc === lastHcPanel && bg === lastBgPanel) return;
    lastRbPanel = rb;
    lastHcPanel = hc;
    lastBgPanel = bg;
    pulse = 0;
    lCol = lUlt = lTxt = null;
    lBgVis = lHpSize = lHpPos = null;
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
    var s = cu + ' / ' + mx;
    try { if (hc.text !== s) hc.text = s; } catch (e) { try { hc.SetAttributeString('text', s); } catch (e2) {} }
    lCounterText = s;
    lCounterLowMode = !!lowMode;
    sHCS(lCounterLowMode, lCounterText);
    lSH = cu; lSM = mx;
  }

  // â”€â”€ Pulse state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var pulse = 0, gp = 0, gq = 1;

  function clearPulse() {
    if (!pulse) return;
    if (rb) rb.RemoveClass(LP);
    if (hc) hc.RemoveClass(LTX);
    if (ui) ui.RemoveClass(LS);
    pulse = 0; lTxt = lUlt = null;
  }

  // â”€â”€ Poll state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lUT = 0, lW = -1, lPW = -1, lHp = -1, pPct = -1, sFC = 0;

  // â”€â”€ Main poll loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function gL() {
    try {
      if (!cfg.hp_enabled) {
        clearPulse();
        if (rb) { rb.style.washColor = ""; lCol = null; }
        if (ui) { ui.style.washColor = ""; lUlt = null; }
        if (bg && bg.style) { bg.style.visibility = 'collapse'; lBgVis = 'collapse'; }
        if (hc && hc.style) {
          hc.style.fontSize = "";
          hc.style.marginTop = "";
          hc.style.marginLeft = "";
          lHpSize = null;
          lHpPos = null;
          lHpMarginLeft = null;
        }
        $.Schedule(1.0, gL); return;
      }

      var now = Date.now();
      if (!rb) { rb = fRB(); if (!rb) { $.Schedule(0.15, gL); return; } }
      if (!cached && !tryCache()) { $.Schedule(0.15, gL); return; }
      resetStyleStateForNewPanels();
      if (rb.GetParent) { var p = rb.GetParent(); if (cp !== p) cp = p; }

      scan(rb);
      lAT = now;
      var isEnemy = !!(fl & 1) && !(fl & 2);
      if (settingsDirty) applyCurrentSettings(isEnemy);
      else sHBV(isEnemy && !!cfg.hp_bg_visible);

      // Neutral unit
      if (fl & 2) {
        clearPulse();
        sHBV(true);
        sBC(cfg.hp_color_neutral); sTC('#ffffff'); lUT = now;
        $.Schedule(1.5, gL); return;
      }
      // Not an enemy â€” skip coloring
      if (!(fl & 1)) {
        sHBV(true);
        lUT = now;
        $.Schedule(0.4, gL);
        return;
      }

      var w = rb.actuallayoutwidth | 0;
      var pw = cp && cp.actuallayoutwidth !== undefined ? cp.actuallayoutwidth | 0 : 0;

      // No change in width â€” back off
      if (w === lW && pw === lPW) {
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
      if (Math.abs(hp - lHp) < 3 && hp > low) { $.Schedule(0.15, gL); return; }
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

      var sc = 0.15, cl;

      if (hp <= low) {
        if (cfg.hp_mode === 1) {
          // Gradient mode: JS pulse between low color and its dark variant
          clearPulse();
          sHBV(!isEnemy || !!cfg.hp_bg_visible);
          gp += gq * 0.1;
          if (gp >= 1 || gp <= 0) gq *= -1;
          var cLow = hexToRgb(cfg.hp_color_low);
          cl = rgbToHex(ip(cLow, darkOf(cLow), gp));
          sBC(cl); sUC(cl); sTC(cl);
          sc = 0.04;
        } else {
          // Fixed mode: CSS pulse class handles animation
          applyCurrentSettings(isEnemy);
          sBC(cfg.hp_color_low);
          if (!pulse) {
            rb.AddClass(LP);
            if (hc) hc.AddClass(LTX);
            if (ui) ui.AddClass(LS);
            pulse = 1; lCol = lUlt = lTxt = null;
          }
          sTC(cfg.hp_color_low); sUC(cfg.hp_color_low);
        }
      } else {
        clearPulse();
        var denomMid = Math.max(1, high - low);
        var denomHigh = Math.max(1, 100 - high);
        var highCol = getHighColor();

        if (hp <= high) {
          if (cfg.hp_mode === 1) {
            cl = rgbToHex(ip(hexToRgb(cfg.hp_color_low), hexToRgb(cfg.hp_color_mid), (hp - low) / denomMid));
          } else {
            cl = cfg.hp_color_mid;
          }
        } else {
          if (cfg.hp_mode === 1) {
            cl = rgbToHex(ip(hexToRgb(cfg.hp_color_mid), hexToRgb(highCol), (hp - high) / denomHigh));
          } else {
            cl = highCol;
          }
          if (sFC >= 5) sc = Math.min(0.15 * Math.pow(2, Math.floor(sFC / 5)), 1);
        }
        sBC(cl); sUC(cl); sTC('#ffffff');
      }

      $.Schedule(sc, gL);
    } catch (e) {
      // Never die silently â€” reschedule after a brief pause
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

  gL();
  lL();
  $.Schedule(0.05, scheduleBootstrapRetry);
})();
