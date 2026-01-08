(()=>{"use strict";
  /*
   * Soul Timer v4.1 - Smooth Display
   * drain_per_second = 0.5% of remaining + 1.6 * (1 + 0.08 * gameMinutes)
   * 
   * Key fix: Fixed tick rate for display (0.1s), separate slow tick for expensive ops
   */

  // === CONSTANTS ===
  const PCT_DRAIN = 0.005, BASE_FLAT = 1.6, FLAT_GROWTH = 0.08;
  const SIM_STEP = 0.5, MAX_SIM = 600;
  const THRESH_RED = 1000, THRESH_YELLOW = 500, SHOW_MS_ABOVE = 300;
  
  // Timing: Fixed display tick, separate slow tick for expensive ops
  const TICK_DISPLAY = 0.1;      // Fixed 100ms for smooth countdown
  const TICK_SLOW = 2.0;         // 2s for panel finding, game time sync
  const WD_CHECK = 3.0, WD_STALL = 6000, TIME_TTL = 500;
  
  const COLOR_CLS = ["white", "yellow", "red"];
  const PAD = ["00","01","02","03","04","05","06","07","08","09",
               "10","11","12","13","14","15","16","17","18","19",
               "20","21","22","23","24","25","26","27","28","29",
               "30","31","32","33","34","35","36","37","38","39",
               "40","41","42","43","44","45","46","47","48","49",
               "50","51","52","53","54","55","56","57","58","59"];
  const TIME_IDS = ["HudGameTime", "GameTime", "MainGameTime"];

  // === DRAIN LOOKUP TABLE ===
  const DRAIN_TBL = [];
  (function buildTable() {
    for (let s = 0; s <= 5000; s += 25) {
      let rem = s, t = 0;
      while (rem > 0.5 && t < MAX_SIM) {
        const flat = BASE_FLAT * (1 + FLAT_GROWTH * (t / 60));
        rem -= (rem * PCT_DRAIN + flat) * SIM_STEP;
        t += SIM_STEP;
      }
      DRAIN_TBL.push(t);
    }
  })();

  // === STATE ===
  const UI = {
    root: null, hud: null, overlay: null, label: null,
    unsec: null, unsecTs: 0, clock: null
  };
  let gen = 0, lastTick = 0, tCache = 0, tCacheTs = 0;
  let pSouls = 0, pColorIdx = -1, pVis = false;
  let lastLog = 0;
  
  // Interpolation state for smooth countdown
  let drainEndTime = 0;       // When souls will hit 0 (in real time ms)
  let lastDrainCalcTs = 0;    // When we last recalculated drain
  let lastDisplayText = "";   // Avoid redundant DOM updates

  // === UTILS ===
  function log(m) {
    const n = Date.now();
    if (n - lastLog > 2000) { $.Msg("[SoulTimer] " + m + "\n"); lastLog = n; }
  }

  function parseNum(s) {
    if (!s) return 0;
    let r = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) r = r * 10 + (c - 48);
    }
    return r;
  }

  function parseTime(s) {
    if (!s) return 0;
    let mm = 0, ss = 0, past = false;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 58) { past = true; continue; }
      if (c < 48 || c > 57) continue;
      if (!past) mm = mm * 10 + (c - 48);
      else ss = ss * 10 + (c - 48);
    }
    return mm * 60 + (ss > 59 ? 59 : ss);
  }

  function fmtTime(sec, ms) {
    if (sec <= 0) return "0:00";
    const s = sec | 0, m = (s / 60) | 0, ss = s % 60;
    let r = m + ":" + PAD[ss];
    if (ms) r += "." + ((sec - s) * 10 | 0);
    return r;
  }

  function getColorIdx(souls) {
    return souls >= THRESH_RED ? 2 : souls >= THRESH_YELLOW ? 1 : 0;
  }

  // === DRAIN CALCULATION ===
  function calcDrainTime(souls, gameMin) {
    if (souls <= 0) return 0;
    const idx = Math.min((souls / 25) | 0, DRAIN_TBL.length - 1);
    const base = DRAIN_TBL[idx];
    // Interpolate between table entries for smoother values
    const frac = (souls % 25) / 25;
    const next = idx < DRAIN_TBL.length - 1 ? DRAIN_TBL[idx + 1] : base;
    const interp = base + (next - base) * frac;
    // Adjust for game time (drain speeds up ~0.8% per minute)
    return Math.max(0, interp * (1 - gameMin * 0.008));
  }

  // === GAME TIME ===
  function gTime() {
    const n = Date.now();
    if (n - tCacheTs < TIME_TTL) return tCache;
    let t = 0;
    try { t = Game.GetGameTime() | 0; } catch (e) {}
    if (t > 0) { tCache = t; tCacheTs = n; return t; }
    t = clockTime();
    if (t > 0) { tCache = t; tCacheTs = n; }
    return t;
  }

  function clockTime() {
    if (!UI.root) return 0;
    const c = UI.clock;
    if (c?.IsValid?.()) try { return parseTime(c.text); } catch (e) {}
    for (let i = 0; i < 3; i++) {
      try {
        const p = UI.root.FindChildTraverse(TIME_IDS[i]);
        if (p?.text) { UI.clock = p; return parseTime(p.text); }
      } catch (e) {}
    }
    try {
      const a = (UI.hud || UI.root).FindChildrenWithClassTraverse("GameTime");
      if (a?.[0]?.text) { UI.clock = a[0]; return parseTime(a[0].text); }
    } catch (e) {}
    return 0;
  }

  // === PANEL FINDING (called on slow tick only) ===
  function refreshUnsec() {
    const n = Date.now();
    if (UI.unsec?.IsValid?.() && n - UI.unsecTs < 3000) return;
    UI.unsec = findUnsec();
    UI.unsecTs = n;
  }

  function findUnsec() {
    const root = UI.hud || UI.root;
    if (!root) return null;
    const byId = root.FindChildTraverse("hudDealthGoldLabel");
    if (validPanel(byId)) return byId;
    try {
      const arr = root.FindChildrenWithClassTraverse("death_penalty_gold");
      if (arr) for (let i = 0; i < arr.length; i++) if (validPanel(arr[i])) return arr[i];
    } catch (e) {}
    return null;
  }

  function validPanel(p) {
    if (!p?.IsValid?.()) return false;
    if (p.visible === false || p.actualvisibility === "collapse") return false;
    let c = p.GetParent?.();
    for (let d = 0; d < 10 && c; d++) {
      if (c.visible === false || c.actualvisibility === "collapse") return false;
      c = c.GetParent?.();
    }
    return true;
  }

  // === VISIBILITY ===
  function show() {
    if (!pVis && UI.label) { UI.label.RemoveClass("hidden"); pVis = true; }
  }

  function hide() {
    if (pVis && UI.label) { UI.label.AddClass("hidden"); pVis = false; }
    pSouls = 0;
    drainEndTime = 0;
  }

  function setColor(idx) {
    if (idx === pColorIdx || !UI.label) return;
    if (pColorIdx >= 0) UI.label.RemoveClass(COLOR_CLS[pColorIdx]);
    UI.label.AddClass(COLOR_CLS[idx]);
    pColorIdx = idx;
  }

  // === BOOT ===
  function boot() {
    const ctx = $.GetContextPanel();
    if (!ctx?.IsValid?.()) return $.Schedule(0.5, boot);
    UI.root = ctx;
    while (UI.root.GetParent?.()) UI.root = UI.root.GetParent();
    UI.hud = UI.root.FindChildTraverse("Hud") || UI.root;
    stealOverlay();
    if (!UI.label?.IsValid?.()) return $.Schedule(0.5, boot);
    $.Msg("[SoulTimer] v4.1 - Smooth Display\n");
    gen++;
    lastTick = Date.now();
    displayLoop(gen);
    slowLoop(gen);
    watchdog(gen);
  }

  function stealOverlay() {
    const ov = UI.hud.FindChildTraverse("SoulTimerOverlay");
    if (!ov?.IsValid?.()) return;
    if (ov.GetParent() !== UI.hud) {
      ov.SetParent(UI.hud);
      $.Msg("[SoulTimer] Overlay moved to HudPanel\n");
    }
    ov.style.opacity = "1.0";
    ov.style.width = "100%";
    ov.style.height = "100%";
    UI.overlay = ov;
    UI.label = ov.FindChildTraverse("SoulTimerLabel");
  }

  // === WATCHDOG ===
  function watchdog(g) {
    if (g !== gen) return;
    if (Date.now() - lastTick > WD_STALL) {
      $.Msg("[SoulTimer][WD] Restarting\n");
      displayLoop(g);
    }
    $.Schedule(WD_CHECK, () => watchdog(g));
  }

  // === SLOW LOOP (expensive ops: panel finding, drain recalc) ===
  function slowLoop(g) {
    if (g !== gen) return;
    
    try {
      // Refresh panel references
      refreshUnsec();
      
      // Recalculate drain time
      if (UI.unsec?.IsValid?.()) {
        let raw = "";
        try { raw = UI.unsec.text || ""; } catch (e) {}
        if (raw && raw.charCodeAt(0) !== 123) {
          const souls = parseNum(raw);
          if (souls > 0 && souls !== pSouls) {
            pSouls = souls;
            const gameMin = gTime() / 60;
            const drainSec = calcDrainTime(souls, gameMin);
            drainEndTime = Date.now() + drainSec * 1000;
            lastDrainCalcTs = Date.now();
            setColor(getColorIdx(souls));
          }
        }
      }
    } catch (e) {
      $.Msg("[SoulTimer][SLOW] " + e + "\n");
    }
    
    $.Schedule(TICK_SLOW, () => slowLoop(g));
  }

  // === DISPLAY LOOP (fast, smooth countdown) ===
  function displayLoop(g) {
    if (g !== gen) return;
    lastTick = Date.now();
    
    try {
      updateDisplay();
    } catch (e) {
      $.Msg("[SoulTimer][ERR] " + e + "\n");
    }
    
    $.Schedule(TICK_DISPLAY, () => displayLoop(g));
  }

  function updateDisplay() {
    // Check escape menu
    if (UI.hud?.BHasClass?.("ShowEscapeMenu")) { hide(); return; }
    if (!UI.label?.IsValid?.()) { stealOverlay(); if (!UI.label) return; }
    
    // No souls being tracked
    if (drainEndTime <= 0 || pSouls <= 0) {
      // Check if we should start tracking (fast check)
      if (UI.unsec?.IsValid?.()) {
        let raw = "";
        try { raw = UI.unsec.text || ""; } catch (e) {}
        if (raw && raw.charCodeAt(0) !== 123) {
          const souls = parseNum(raw);
          if (souls > 0) {
            pSouls = souls;
            const gameMin = gTime() / 60;
            const drainSec = calcDrainTime(souls, gameMin);
            drainEndTime = Date.now() + drainSec * 1000;
            setColor(getColorIdx(souls));
          }
        }
      }
      if (drainEndTime <= 0) { hide(); return; }
    }
    
    show();
    
    // Interpolate remaining time from drainEndTime
    const now = Date.now();
    const remainMs = Math.max(0, drainEndTime - now);
    const remainSec = remainMs / 1000;
    
    // Check if souls changed (quick check on display tick)
    if (UI.unsec?.IsValid?.()) {
      let raw = "";
      try { raw = UI.unsec.text || ""; } catch (e) {}
      if (raw && raw.charCodeAt(0) !== 123) {
        const souls = parseNum(raw);
        if (souls !== pSouls) {
          // Souls changed - recalculate immediately
          pSouls = souls;
          if (souls <= 0) {
            hide();
            return;
          }
          const gameMin = gTime() / 60;
          const drainSec = calcDrainTime(souls, gameMin);
          drainEndTime = Date.now() + drainSec * 1000;
          setColor(getColorIdx(souls));
        }
      }
    }
    
    // Format and update display
    const showMs = pSouls >= SHOW_MS_ABOVE;
    const txt = fmtTime(remainSec, showMs);
    
    if (txt !== lastDisplayText) {
      UI.label.text = txt + " left";
      lastDisplayText = txt;
    }
  }

  boot();
})();
