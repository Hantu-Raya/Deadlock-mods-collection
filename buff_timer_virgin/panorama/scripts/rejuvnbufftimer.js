(() => {
  "use strict";

  // ================
  // CONFIG (OPTIMIZED V2)
  // ================
  const GATE_CHECK_INTERVAL = 30;
  const RUN_CHECK_INTERVAL = 60;
  const INITIAL_GATE_DELAY = 0.1;
  const REJUV_DURATION = 240;
  const BRIDGE_DURATION = 300;
  const SCAN_INTERVAL = 3;

  // Adaptive tick rates - faster near spawns, slower during long waits
  const TICK_FAST = 0.1; // 100ms - near spawn events
  const TICK_NORMAL = 1; // 1s - standard countdown
  const TICK_SLOW = 2; // 2s - long waits (>60s remaining)
  const SPAWN_THRESHOLD = 10; // seconds before spawn to switch to fast tick

  const PREFERRED_GAME_TIME_IDS = ["HudGameTime", "GameTime", "MainGameTime"];

  const SEQ = [
    { name: "initial", dur: 600, num: "1" },
    { name: "firstCd", dur: 420, num: "2" },
    { name: "secondCd", dur: 360, num: "3" },
    { name: "thirdCd", dur: 300, num: "3" },
  ];

  // Rejuv count tokens (hoisted outside function for memory efficiency)
  const REJUV_TOKENS = [
    "RejuvCount_1",
    "RejuvCount_2",
    "RejuvCount_3",
    "RejuvCount_4",
  ];

  // ================
  // OPTIMIZATION: Single master timer handle
  // ================
  let masterLoopHandle = null;

  // Master loop timing state
  const loopState = {
    lastGateCheck: 0,
    lastRunCheck: 0,
    lastScan: 0,
    currentTickRate: TICK_NORMAL,
  };

  // DOM cache (single lookup per session)
  const uiCache = {
    rLab: null,
    rNum: null,
    rImg: null,
    buffLabel: null,
    rejuvBuff: null,
    rejuvBuffTime: null,
    root: null,
    cachedGameTimePanel: null,
    // Pre-cached Hud reference
    hud: null,
  };

  // Lightweight state object
  const state = {
    idx: 0,
    counter: 0,
    phaseStart: 0,
    claimCount: 0,
    running: false,
    spawnWaiting: false,
    lastScanFound: false,
    buffStartTime: 0,
    buffCounter: 0,
    lastSec: -1,
    lastGlobalSec: -1,
    // Track hideout state to avoid repeated checks
    inHideout: true,
  };

  // GameTime optimization - extended cache TTL to 500ms
  const gameTimeCache = {
    value: 0,
    ts: 0,
    ttl: 500, // OPTIMIZATION: Extended from 100ms to 500ms
  };

  // Rejuv charges cache - throttled lookup
  const rejuvCache = {
    topBar: null,
    charges: null,
    friendly: null,
    enemy: null,
    lastLookup: 0,
    ttl: 500,
  };

  // ================
  // BOOT
  // ================
  function boot() {
    const root = findRoot($.GetContextPanel());
    uiCache.root = root;

    // Batch DOM queries - single traversal
    uiCache.rLab = root.FindChildTraverse("RejuvTime");
    uiCache.rNum = root.FindChildTraverse("RejuvNum");
    uiCache.rImg = root.FindChildTraverse("RejuvImg");
    uiCache.buffLabel = root.FindChildTraverse("BuffTime");
    uiCache.rejuvBuff = root.FindChildTraverse("RejuvBuff");
    uiCache.rejuvBuffTime = root.FindChildTraverse("RejuvTimeBuff");

    // OPTIMIZATION: Pre-cache Hud reference
    uiCache.hud = root.FindChildTraverse("Hud");

    if (!uiCache.rLab || !uiCache.rNum || !uiCache.rImg || !uiCache.buffLabel) {
      return $.Schedule(0.5, boot);
    }

    stopMasterLoop(true);
    startMasterLoop();
  }

  // ================
  // OPTIMIZATION: Consolidated Master Loop
  // Replaces 4 separate timers with single unified loop
  // ================
  function startMasterLoop() {
    if (masterLoopHandle) {
      $.CancelScheduled(masterLoopHandle);
    }
    loopState.lastGateCheck = 0;
    loopState.lastRunCheck = 0;
    loopState.lastScan = 0;
    loopState.currentTickRate = TICK_NORMAL;
    masterLoop();
  }

  function stopMasterLoop(reset) {
    if (masterLoopHandle) {
      $.CancelScheduled(masterLoopHandle);
      masterLoopHandle = null;
    }

    if (reset) {
      state.idx = 0;
      state.counter = 0;
      state.phaseStart = 0;
      state.claimCount = 0;
      state.buffStartTime = 0;
      state.buffCounter = 0;
      state.lastSec = -1;
      state.lastGlobalSec = -1;
      state.spawnWaiting = false;
      state.lastScanFound = false;
      state.running = false;
      state.inHideout = true;

      if (uiCache.rLab) uiCache.rLab.text = fmt(SEQ[0].dur);
      if (uiCache.rNum) uiCache.rNum.text = SEQ[0].num;
      resetImg();
      endRejuvBuff();
    }
  }

  function masterLoop() {
    const now = gameSec();
    const realNow = Date.now();

    // ---- GATE CHECK (every 30s when in hideout) ----
    if (!state.running) {
      if (realNow - loopState.lastGateCheck >= GATE_CHECK_INTERVAL * 1000) {
        loopState.lastGateCheck = realNow;
        state.inHideout = isConnectedToHideout();

        if (!state.inHideout) {
          startRunning(now);
        }
      }
      // Schedule next loop - slow poll when waiting
      masterLoopHandle = $.Schedule(1, masterLoop);
      return;
    }

    // ---- RUN CHECK (every 60s when running) ----
    if (realNow - loopState.lastRunCheck >= RUN_CHECK_INTERVAL * 1000) {
      loopState.lastRunCheck = realNow;
      if (isConnectedToHideout()) {
        stopMasterLoop(true);
        startMasterLoop();
        return;
      }
    }

    // ---- ROUND RESET DETECTION ----
    if (
      state.lastGlobalSec >= 0 &&
      (now + 5 < state.lastGlobalSec || (state.lastGlobalSec > 30 && now <= 2))
    ) {
      stopMasterLoop(true);
      startMasterLoop();
      return;
    }
    state.lastGlobalSec = now;

    // ---- PHASE COUNTDOWN ----
    if (now !== state.lastSec) {
      state.lastSec = now;
      const dur = SEQ[state.idx].dur;
      const remaining = Math.max(0, dur - (now - state.phaseStart));

      if (remaining <= 0) {
        showSpawn();
      } else {
        state.counter = remaining;
        uiCache.rLab.text = fmt(remaining);
      }

      // OPTIMIZATION: Adaptive tick rate based on remaining time
      updateTickRate(remaining);
    }

    // ---- REJUV BUFF COUNTDOWN ----
    if (state.buffStartTime > 0) {
      const elapsed = now - state.buffStartTime;
      state.buffCounter = Math.max(0, REJUV_DURATION - elapsed);

      if (uiCache.rejuvBuffTime) {
        uiCache.rejuvBuffTime.text = fmt(state.buffCounter);
      }

      if (state.buffCounter <= 0) {
        endRejuvBuff();
      }
    }

    // ---- BRIDGE LABEL (5m cycle) ----
    const remainingBridge = BRIDGE_DURATION - (now % BRIDGE_DURATION);
    uiCache.buffLabel.text = fmt(remainingBridge);

    // ---- SCAN FOR REJUV (every 3s) ----
    if (realNow - loopState.lastScan >= SCAN_INTERVAL * 1000) {
      loopState.lastScan = realNow;
      doScan(now);
    }

    // Schedule next iteration with adaptive rate
    masterLoopHandle = $.Schedule(loopState.currentTickRate, masterLoop);
  }

  // OPTIMIZATION: Adaptive tick rate
  function updateTickRate(remaining) {
    if (state.spawnWaiting || remaining <= SPAWN_THRESHOLD) {
      loopState.currentTickRate = TICK_FAST;
    } else if (remaining > 60) {
      loopState.currentTickRate = TICK_SLOW;
    } else {
      loopState.currentTickRate = TICK_NORMAL;
    }
  }

  function startRunning(now) {
    state.running = true;
    state.claimCount = 0;
    state.lastScanFound = false;
    state.spawnWaiting = false;
    state.inHideout = false;

    loopState.lastRunCheck = Date.now();
    loopState.lastScan = 0;

    startPhaseAuto(now);
  }

  // ================
  // PHASE TIMERS
  // ================
  function startPhaseAuto(now) {
    state.spawnWaiting = false;
    now = now ?? gameSec(true);
    const computed = calcPhaseAt(now);

    state.idx = computed.idx;
    state.counter = computed.counter;
    state.phaseStart = computed.phaseStart;

    updatePhaseUI();
  }

  function startPhaseManual(targetIdx, now) {
    state.spawnWaiting = false;
    state.idx = clamp(targetIdx, 0, SEQ.length - 1);
    state.counter = SEQ[state.idx].dur;
    state.phaseStart = now ?? gameSec(true);

    updatePhaseUI();
  }

  function updatePhaseUI() {
    uiCache.rLab.text = fmt(state.counter);
    uiCache.rNum.text = SEQ[state.idx].num;
    setPhaseImage(SEQ[state.idx].name);
  }

  function showSpawn() {
    uiCache.rLab.text = "Spawn";
    uiCache.rNum.text = SEQ[state.idx].num;
    resetImg();
    uiCache.rImg.AddClass("white");

    state.spawnWaiting = true;
    state.lastScanFound = false;
    loopState.currentTickRate = TICK_FAST; // Fast polling during spawn
  }

  // ================
  // SCAN LOOP (integrated into master loop)
  // ================
  function doScan(now) {
    if (!state.running) return;

    const found = hasRejuvCount();

    if (state.spawnWaiting && found && !state.lastScanFound) {
      state.claimCount++;
      startRejuvBuff(now);

      const targetIdx = state.claimCount > 2 ? 3 : state.claimCount;
      startPhaseManual(targetIdx, now);
    }

    state.lastScanFound = found;
  }

  // ================
  // REJUV BUFF
  // ================
  function startRejuvBuff(now) {
    state.buffStartTime = now ?? gameSec(true);
    state.buffCounter = REJUV_DURATION;

    if (uiCache.rejuvBuff) {
      uiCache.rejuvBuff.RemoveClass("pop-in");
      uiCache.rejuvBuff.AddClass("pop-out");
      uiCache.rejuvBuff.style.opacity = "1";
    }

    if (uiCache.rejuvBuffTime) {
      uiCache.rejuvBuffTime.text = fmt(state.buffCounter);
    }
  }

  function endRejuvBuff() {
    state.buffStartTime = 0;
    state.buffCounter = 0;

    if (uiCache.rejuvBuff) {
      uiCache.rejuvBuff.RemoveClass("pop-out");
      uiCache.rejuvBuff.AddClass("pop-in");
      $.Schedule(0.5, () => {
        if (uiCache.rejuvBuff) {
          uiCache.rejuvBuff.style.opacity = "0";
        }
      });
    }
  }

  // ================
  // HELPERS
  // ================
  function setPhaseImage(name) {
    resetImg();
    if (name.endsWith("Buff")) {
      uiCache.rImg.AddClass("buff");
      uiCache.rImg.AddClass("rotating");
      $.Schedule(0.8, () => uiCache.rImg.RemoveClass("rotating"));
    } else if (name.endsWith("Cd")) {
      uiCache.rImg.AddClass("reverse");
      uiCache.rImg.AddClass("rotating");
      $.Schedule(0.8, () => uiCache.rImg.RemoveClass("rotating"));
    }
  }

  function resetImg() {
    uiCache.rImg.RemoveClass("rotating");
    uiCache.rImg.RemoveClass("buff");
    uiCache.rImg.RemoveClass("reverse");
    uiCache.rImg.RemoveClass("white");
  }

  // ================
  // GAME TIME (OPTIMIZED - 500ms TTL)
  // ================
  function gameSec(force) {
    const now = Date.now();

    // Cache hit with extended TTL
    if (
      !force &&
      gameTimeCache.ts &&
      now - gameTimeCache.ts < gameTimeCache.ttl
    ) {
      return gameTimeCache.value;
    }

    const a = apiSec();
    if (a != null) {
      gameTimeCache.value = a;
      gameTimeCache.ts = now;
      return a;
    }

    const u = uiSec(force);
    gameTimeCache.value = u;
    gameTimeCache.ts = now;
    return u;
  }

  function apiSec() {
    try {
      if (typeof Game !== "undefined") {
        if (typeof Game.GetDOTATime === "function") {
          const t = Game.GetDOTATime();
          if (typeof t === "number" && !isNaN(t)) return t | 0;
        }
        if (typeof Game.GetGameTime === "function") {
          const t = Game.GetGameTime();
          if (typeof t === "number" && !isNaN(t)) return t | 0;
        }
        if (typeof Game.Time === "number") {
          return Game.Time | 0;
        }
        if (typeof Game.GameTime === "number") {
          return Game.GameTime | 0;
        }
      }
      // OPTIMIZATION: GameUI.GetGameTime prioritized per research
      if (
        typeof GameUI !== "undefined" &&
        typeof GameUI.GetGameTime === "function"
      ) {
        const t = GameUI.GetGameTime();
        if (typeof t === "number" && !isNaN(t)) return t | 0;
      }
    } catch {}
    return null;
  }

  function uiSec(force) {
    if (!force && uiCache.cachedGameTimePanel) {
      return parseSec(uiCache.cachedGameTimePanel.text);
    }

    const preferredIds = PREFERRED_GAME_TIME_IDS;
    for (let i = 0; i < preferredIds.length; i++) {
      const p = uiCache.root.FindChildTraverse(preferredIds[i]);
      if (p && p.text) {
        uiCache.cachedGameTimePanel = p;
        return parseSec(p.text);
      }
    }

    // Use pre-cached hud reference
    const arr = uiCache.hud
      ? uiCache.hud.FindChildrenWithClassTraverse("GameTime")
      : null;

    if (!arr || !arr.length) {
      const rootArr = uiCache.root.FindChildrenWithClassTraverse("GameTime");
      uiCache.cachedGameTimePanel =
        rootArr && rootArr.length ? rootArr[0] : null;
    } else {
      uiCache.cachedGameTimePanel = arr[0];
    }

    return parseSec(uiCache.cachedGameTimePanel?.text);
  }

  function parseSec(text) {
    if (!text) return 0;
    const m = String(text).match(/(\d+):(\d{1,2})/);
    if (!m) return 0;
    const mm = parseInt(m[1], 10) || 0;
    let ss = parseInt(m[2], 10) || 0;
    if (ss > 59) ss %= 60;
    return mm * 60 + ss;
  }

  function calcPhaseAt(t) {
    if (t <= 2) {
      return { idx: 0, phaseStart: 0, counter: SEQ[0].dur };
    }

    let cum = 0;
    for (let i = 0; i < SEQ.length; i++) {
      const dur = SEQ[i].dur;
      if (t < cum + dur) {
        return {
          idx: i,
          phaseStart: cum,
          counter: cum + dur - t,
        };
      }
      cum += dur;
    }

    const lastIdx = SEQ.length - 1;
    const lastDur = SEQ[lastIdx].dur;
    const mod = (t - cum) % BRIDGE_DURATION;
    const within = mod % lastDur;

    return {
      idx: lastIdx,
      phaseStart: t - within,
      counter: lastDur - within,
    };
  }

  // OPTIMIZATION: Throttled rejuv scan with native BHasClass preference
  function hasRejuvCount() {
    const now = Date.now();

    if (!rejuvCache.topBar || now - rejuvCache.lastLookup > rejuvCache.ttl) {
      rejuvCache.lastLookup = now;
      rejuvCache.topBar =
        uiCache.root.FindChildTraverse("TopBar") ||
        uiCache.root.FindChildTraverse("CitadelHudTopBar");
      rejuvCache.charges = rejuvCache.topBar
        ? rejuvCache.topBar.FindChildTraverse("RejuvenatorCharges")
        : null;
      rejuvCache.friendly = rejuvCache.charges
        ? rejuvCache.charges.FindChildTraverse("RejuvenatorFriendly")
        : null;
      rejuvCache.enemy = rejuvCache.charges
        ? rejuvCache.charges.FindChildTraverse("RejuvenatorEnemy")
        : null;
    }

    return (
      panelHasAnyToken(rejuvCache.friendly) ||
      panelHasAnyToken(rejuvCache.enemy)
    );
  }

  // OPTIMIZATION: Simplified token check using native BHasClass first
  function panelHasAnyToken(panel) {
    if (!panel) return false;

    // Check panel itself
    if (checkPanelTokens(panel)) return true;

    // Check children
    try {
      const kids = panel.Children?.() || [];
      for (let i = 0; i < kids.length; i++) {
        if (checkPanelTokens(kids[i])) return true;
      }
    } catch {}

    return false;
  }

  // OPTIMIZATION: Native BHasClass prioritized, string indexOf as fallback
  function checkPanelTokens(panel) {
    if (!panel) return false;

    // Native BHasClass is fastest - try it first for all tokens
    if (panel.BHasClass) {
      for (let i = 0; i < REJUV_TOKENS.length; i++) {
        try {
          if (panel.BHasClass(REJUV_TOKENS[i])) return true;
        } catch {}
      }
    }

    // Fallback to string check only if BHasClass unavailable
    if (!panel.BHasClass) {
      try {
        const cls = safeAttr(panel, "class") || panel.className || "";
        const clsStr = String(cls);
        for (let i = 0; i < REJUV_TOKENS.length; i++) {
          if (clsStr.indexOf(REJUV_TOKENS[i]) !== -1) return true;
        }
      } catch {}
    }

    return false;
  }

  // OPTIMIZATION: Use pre-cached hud reference
  function isConnectedToHideout() {
    const hud = uiCache.hud || uiCache.root.FindChildTraverse("Hud");
    if (!hud || !hud.BHasClass) return false;

    return (
      hud.BHasClass("connectedToHideout") ||
      hud.BHasClass("connectedtoHideout") ||
      hud.BHasClass("connectedtohideout")
    );
  }

  function fmt(s) {
    s = Math.max(0, s | 0);
    const m = (s / 60) | 0;
    const ss = s % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (ss < 10 ? "0" + ss : "" + ss);
  }

  function findRoot(p) {
    while (p.GetParent?.()) p = p.GetParent();
    return p;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function safeAttr(panel, attr) {
    try {
      if (!panel || !panel.GetAttributeString) return null;
      return panel.GetAttributeString(attr, "");
    } catch {
      return null;
    }
  }

  boot();
})();
