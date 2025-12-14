(() => {
  "use strict";

  // CONFIG
  const REJUV_DUR = 240, BRIDGE_DUR = 300, SPAWN_TH = 10;
  const TICK_FAST = 0.1, TICK_NORM = 1, TICK_IDLE = 3;
  const SEQ = [
    { d: 600, n: "1" },
    { d: 420, n: "2" },
    { d: 360, n: "3" },
    { d: 300, n: "3" },
  ];
  const REJUV_CLS = ["RejuvCount_1", "RejuvCount_2", "RejuvCount_3", "RejuvCount_4"];
  const TIME_IDS = ["HudGameTime", "GameTime", "MainGameTime"];

  // STATIC STATE (Zero-Alloc)
  let hnd = null, running = false, inHideout = true, spawnWait = false;
  let idx = 0, counter = 0, phaseStart = 0, claimCnt = 0;
  let buffStart = 0, buffCnt = 0, lastSec = -1, lastGlobalSec = -1;
  let lastGateChk = 0, lastRunChk = 0, lastScan = 0, tick = TICK_NORM;
  let lastFound = false;

  // DOM CACHE (Hard)
  const UI = {
    root: null, hud: null, gameTimePanel: null,
    rLab: null, rNum: null, rImg: null,
    buffLab: null, rejuvBuff: null, rejuvBuffTime: null,
    rejuvFriendly: null, rejuvEnemy: null,
  };

  // BOOT
  function boot() {
    const root = findRoot($.GetContextPanel());
    UI.root = root;
    UI.hud = root.FindChildTraverse("Hud");
    UI.rLab = root.FindChildTraverse("RejuvTime");
    UI.rNum = root.FindChildTraverse("RejuvNum");
    UI.rImg = root.FindChildTraverse("RejuvImg");
    UI.buffLab = root.FindChildTraverse("BuffTime");
    UI.rejuvBuff = root.FindChildTraverse("RejuvBuff");
    UI.rejuvBuffTime = root.FindChildTraverse("RejuvTimeBuff");

    const topBar = root.FindChildTraverse("TopBar") || root.FindChildTraverse("CitadelHudTopBar");
    if (topBar) {
      const charges = topBar.FindChildTraverse("RejuvenatorCharges");
      if (charges) {
        UI.rejuvFriendly = charges.FindChildTraverse("RejuvenatorFriendly");
        UI.rejuvEnemy = charges.FindChildTraverse("RejuvenatorEnemy");
      }
    }

    if (!UI.rLab || !UI.rNum || !UI.rImg || !UI.buffLab) {
      return $.Schedule(0.5, boot);
    }

    reset(true);
    loop();
  }

  // MASTER LOOP (Zero-Alloc)
  function loop() {
    const now = gTime();
    const realNow = Date.now();

    // GATE CHECK (Idle in hideout)
    if (!running) {
      if (realNow - lastGateChk >= 30000) {
        lastGateChk = realNow;
        inHideout = isHideout();
        if (!inHideout) startRun(now);
      }
      hnd = $.Schedule(TICK_IDLE, loop);
      return;
    }

    // RUN CHECK (Every 60s)
    if (realNow - lastRunChk >= 60000) {
      lastRunChk = realNow;
      if (isHideout()) { reset(true); loop(); return; }
    }

    // ROUND RESET
    if (lastGlobalSec >= 0 && (now + 5 < lastGlobalSec || (lastGlobalSec > 30 && now <= 2))) {
      reset(true); loop(); return;
    }
    lastGlobalSec = now;

    // PHASE COUNTDOWN
    if (now !== lastSec) {
      lastSec = now;
      const rem = Math.max(0, SEQ[idx].d - (now - phaseStart));
      if (rem <= 0) {
        showSpawn();
      } else {
        counter = rem;
        UI.rLab.text = fmt(rem);
      }
      tick = spawnWait || rem <= SPAWN_TH ? TICK_FAST : rem > 30 ? TICK_NORM : TICK_NORM;
    }

    // BUFF COUNTDOWN
    if (buffStart > 0) {
      buffCnt = Math.max(0, REJUV_DUR - (now - buffStart));
      if (UI.rejuvBuffTime) UI.rejuvBuffTime.text = fmt(buffCnt);
      if (buffCnt <= 0) endBuff();
    }

    // BRIDGE LABEL
    UI.buffLab.text = fmt(BRIDGE_DUR - (now % BRIDGE_DUR));

    // SCAN (Every 3s)
    if (realNow - lastScan >= 3000) {
      lastScan = realNow;
      doScan(now);
    }

    hnd = $.Schedule(tick, loop);
  }

  // SCAN
  function doScan(now) {
    if (!running) return;
    const found = hasRejuv();
    if (spawnWait && found && !lastFound) {
      claimCnt++;
      startBuff(now);
      startPhase(claimCnt > 2 ? 3 : claimCnt, now);
    }
    lastFound = found;
  }

  // REJUV CHECK (BHasClass Priority, Zero-Alloc)
  function hasRejuv() {
    return panelHas(UI.rejuvFriendly) || panelHas(UI.rejuvEnemy);
  }

  function panelHas(p) {
    if (!p) return false;
    for (let i = 0; i < REJUV_CLS.length; i++) {
      try { if (p.BHasClass(REJUV_CLS[i])) return true; } catch {}
    }
    try {
      const kids = p.Children();
      for (let j = 0; j < kids.length; j++) {
        for (let i = 0; i < REJUV_CLS.length; i++) {
          try { if (kids[j].BHasClass(REJUV_CLS[i])) return true; } catch {}
        }
      }
    } catch {}
    return false;
  }

  // PHASE
  function startPhase(tgt, now) {
    spawnWait = false;
    idx = clamp(tgt, 0, SEQ.length - 1);
    counter = SEQ[idx].d;
    phaseStart = now;
    UI.rLab.text = fmt(counter);
    UI.rNum.text = SEQ[idx].n;
    setImg(idx);
  }

  function startPhaseAuto(now) {
    spawnWait = false;
    let cum = 0;
    for (let i = 0; i < SEQ.length; i++) {
      if (now < cum + SEQ[i].d) {
        idx = i; phaseStart = cum; counter = cum + SEQ[i].d - now;
        UI.rLab.text = fmt(counter); UI.rNum.text = SEQ[i].n; setImg(i);
        return;
      }
      cum += SEQ[i].d;
    }
    const li = SEQ.length - 1, ld = SEQ[li].d;
    const mod = (now - cum) % BRIDGE_DUR, within = mod % ld;
    idx = li; phaseStart = now - within; counter = ld - within;
    UI.rLab.text = fmt(counter); UI.rNum.text = SEQ[li].n; setImg(li);
  }

  function showSpawn() {
    UI.rLab.text = "Spawn";
    UI.rNum.text = SEQ[idx].n;
    resetImg(); UI.rImg.AddClass("white");
    spawnWait = true; lastFound = false; tick = TICK_FAST;
  }

  // BUFF
  function startBuff(now) {
    buffStart = now; buffCnt = REJUV_DUR;
    if (UI.rejuvBuff) {
      UI.rejuvBuff.RemoveClass("pop-in");
      UI.rejuvBuff.AddClass("pop-out");
      UI.rejuvBuff.style.opacity = "1";
    }
    if (UI.rejuvBuffTime) UI.rejuvBuffTime.text = fmt(buffCnt);
  }

  function endBuff() {
    buffStart = 0; buffCnt = 0;
    if (UI.rejuvBuff) {
      UI.rejuvBuff.RemoveClass("pop-out");
      UI.rejuvBuff.AddClass("pop-in");
      $.Schedule(0.5, () => { if (UI.rejuvBuff) UI.rejuvBuff.style.opacity = "0"; });
    }
  }

  // HELPERS
  function startRun(now) {
    running = true; claimCnt = 0; lastFound = false; spawnWait = false; inHideout = false;
    lastRunChk = Date.now(); lastScan = 0;
    startPhaseAuto(now);
  }

  function reset(full) {
    if (hnd) { $.CancelScheduled(hnd); hnd = null; }
    if (full) {
      idx = 0; counter = 0; phaseStart = 0; claimCnt = 0;
      buffStart = 0; buffCnt = 0; lastSec = -1; lastGlobalSec = -1;
      spawnWait = false; lastFound = false; running = false; inHideout = true;
      if (UI.rLab) UI.rLab.text = fmt(SEQ[0].d);
      if (UI.rNum) UI.rNum.text = SEQ[0].n;
      resetImg(); endBuff();
    }
  }

  function setImg(i) {
    resetImg();
    if (i > 0) {
      UI.rImg.AddClass("reverse");
      UI.rImg.AddClass("rotating");
      $.Schedule(0.8, () => UI.rImg.RemoveClass("rotating"));
    }
  }

  function resetImg() {
    UI.rImg.RemoveClass("rotating");
    UI.rImg.RemoveClass("buff");
    UI.rImg.RemoveClass("reverse");
    UI.rImg.RemoveClass("white");
  }

  // TIME CACHE (200ms TTL to reduce parsing overhead)
  let _tCache = 0, _tCacheTs = 0;
  const _tCacheTTL = 200;

  function gTime() {
    const now = Date.now();
    if (now - _tCacheTs < _tCacheTTL) return _tCache;
    
    // Try native APIs first (fast path)
    let t = 0;
    try { t = typeof Game !== "undefined" && Game.GetGameTime?.() | 0; } catch {}
    if (t > 0) { _tCache = t; _tCacheTs = now; return t; }
    try { t = typeof Game !== "undefined" && Game.GetDOTATime?.() | 0; } catch {}
    if (t > 0) { _tCache = t; _tCacheTs = now; return t; }
    try { t = typeof GameUI !== "undefined" && GameUI.GetGameTime?.() | 0; } catch {}
    if (t > 0) { _tCache = t; _tCacheTs = now; return t; }
    
    // Fallback: Parse UI (only if panel cached)
    t = uiTime();
    _tCache = t; _tCacheTs = now;
    return t;
  }

  function uiTime() {
    // Fast path: cached panel
    if (UI.gameTimePanel) {
      try { return parseSec(UI.gameTimePanel.text); } catch {}
    }
    // Slow path: find panel once
    for (let i = 0; i < TIME_IDS.length; i++) {
      try {
        const p = UI.root.FindChildTraverse(TIME_IDS[i]);
        if (p?.text) { UI.gameTimePanel = p; return parseSec(p.text); }
      } catch {}
    }
    try {
      const arr = (UI.hud || UI.root).FindChildrenWithClassTraverse("GameTime");
      if (arr?.[0]?.text) { UI.gameTimePanel = arr[0]; return parseSec(arr[0].text); }
    } catch {}
    return 0;
  }

  // Zero-alloc string parsing (no regex)
  function parseSec(txt) {
    if (!txt) return 0;
    const s = String(txt), colonIdx = s.indexOf(":");
    if (colonIdx < 0) return 0;
    let mm = 0, ss = 0, c;
    // Parse minutes (left of colon)
    for (let i = 0; i < colonIdx; i++) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) mm = mm * 10 + (c - 48);
    }
    // Parse seconds (right of colon, max 2 digits)
    for (let i = colonIdx + 1, cnt = 0; i < s.length && cnt < 2; i++, cnt++) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) ss = ss * 10 + (c - 48);
      else break;
    }
    return mm * 60 + (ss > 59 ? ss % 60 : ss);
  }

  function isHideout() {
    if (!UI.hud || !UI.hud.BHasClass) return false;
    try {
      return UI.hud.BHasClass("connectedToHideout") ||
             UI.hud.BHasClass("connectedtoHideout") ||
             UI.hud.BHasClass("connectedtohideout");
    } catch {}
    return false;
  }

  function fmt(s) {
    s = Math.max(0, s | 0);
    const m = (s / 60) | 0, ss = s % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (ss < 10 ? "0" + ss : "" + ss);
  }

  function findRoot(p) { while (p.GetParent?.()) p = p.GetParent(); return p; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  boot();
})();
