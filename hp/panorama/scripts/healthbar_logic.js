'use strict';
(function () {

  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var TITLE = "HP Colors";
  var DEFAULTS = {
    hp_enabled: true,
    hp_mode: 1,
    hp_low_threshold: 25,
    hp_high_threshold: 65,
    hp_color_low: "#E16161",
    hp_color_mid: "#FF7B00",
    hp_color_high: "#00FF00",
    hp_color_neutral: "#5BEFB5",
    hp_team_colors: false
  };
  var TEAM1_HIGH = "rgb(255,201,97)";
  var TEAM2_HIGH = "rgb(100,133,252)";
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

  // Live updates from Anita UI, including boot-time bootstrap values.
  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
    try {
      var d = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (d && d.magic_word === "ANITA_UPDATE" && d.mod_title === TITLE) {
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, d.setting_id)) {
          cfg[d.setting_id] = coerceCfgValue(d.setting_id, d.value);
        }
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

  function rg(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
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
  var us = null, hc = null, pl = null, lb = null, lbp = null, rb = null, cp = null, ui = null;
  var cached = 0, att = 0;

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

  function sBC(c) { if (lCol !== c && rb) { rb.style.washColor = c; lCol = c; } }
  function sUC(c) {
    if (!ui || !ui.IsValid()) ui = ctx.FindChildTraverse('unit_ult_ready_icon') || ctx.FindChildTraverse('ult_icon');
    if (!ui || !ui.style) return;
    if (lUlt !== c) { ui.style.washColor = c; lUlt = c; }
  }
  function sTC(c) {
    if (!hc || !hc.style) return;
    if (lTxt !== c) { hc.style.washColor = c; lTxt = c; }
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

  function uHT(cu, mx) {
    if (!hc || (cu === lSH && mx === lSM)) return;
    if (lVis !== 'visible') { hc.style.visibility = 'visible'; lVis = 'visible'; }
    var s = cu + ' / ' + mx;
    try { if (hc.text !== s) hc.text = s; } catch (e) { try { hc.SetAttributeString('text', s); } catch (e2) {} }
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
        $.Schedule(1.0, gL); return;
      }

      var now = Date.now();
      if (!rb) { rb = fRB(); if (!rb) { $.Schedule(0.15, gL); return; } }
      if (!cached && !tryCache()) { $.Schedule(0.15, gL); return; }
      if (rb.GetParent) { var p = rb.GetParent(); if (cp !== p) cp = p; }

      if (now - lAT > 2000) { lAT = now; scan(rb); }

      // Neutral unit
      if (fl & 2) {
        clearPulse();
        sBC(cfg.hp_color_neutral); sTC('#ffffff'); lUT = now;
        $.Schedule(1.5, gL); return;
      }
      // Not an enemy â€” skip coloring
      if (!(fl & 1)) { lUT = now; $.Schedule(0.4, gL); return; }

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
        uHT(ratio >= 0.97 ? mx : Math.round(mx * ratio), mx);
      }

      var sc = 0.15, cl;

      if (hp <= low) {
        if (cfg.hp_mode === 1) {
          // Gradient mode: JS pulse between low color and its dark variant
          clearPulse();
          gp += gq * 0.1;
          if (gp >= 1 || gp <= 0) gq *= -1;
          var cLow = hexToRgb(cfg.hp_color_low);
          cl = rg(ip(cLow, darkOf(cLow), gp));
          sBC(cl); sUC(cl); sTC(cl);
          sc = 0.04;
        } else {
          // Fixed mode: CSS pulse class handles animation
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
            cl = rg(ip(hexToRgb(cfg.hp_color_low), hexToRgb(cfg.hp_color_mid), (hp - low) / denomMid));
          } else {
            cl = cfg.hp_color_mid;
          }
        } else {
          if (cfg.hp_mode === 1) {
            cl = rg(ip(hexToRgb(cfg.hp_color_mid), hexToRgb(highCol), (hp - high) / denomHigh));
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

})();
