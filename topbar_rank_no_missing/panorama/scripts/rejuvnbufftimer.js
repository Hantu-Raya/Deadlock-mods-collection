(() => {
  // ==================
  // CONFIG
  // ==================
  const GATE_CHECK_INTERVAL = 30;
  const RUN_CHECK_INTERVAL = 60;
  const INITIAL_GATE_DELAY = 0.1;
  const REJUV_DURATION = 180;
  const BRIDGE_DURATION = 300;
  const SCAN_INTERVAL = 3;

  const INITIAL_KOTH = 720;
  const KOTH_DURATION = 420;

  const PREFERRED_GAME_TIME_IDS = ["HudGameTime", "GameTime", "MainGameTime"];

  const SEQ = [
    { name: "initial", dur: 0, num: "1" },
    { name: "firstCd", dur: 413, num: "2" },
    { name: "secondCd", dur: 353, num: "3" },
    { name: "thirdCd", dur: 293, num: "3" }
  ];

  function boot() {
    const root = findRoot($.GetContextPanel());
    let rLab = root.FindChildTraverse("RejuvTime");
    let rNum = root.FindChildTraverse("RejuvNum");
    let rImg = root.FindChildTraverse("RejuvImg");
    let buffLabel = root.FindChildTraverse("BuffTime");
    let rejuvBuff = root.FindChildTraverse("RejuvBuff");
    let rejuvBuffTime = root.FindChildTraverse("RejuvTimeBuff");

    // HUD extras
    let buffLabelHUD = root.FindChildTraverse("BuffTimeHUD");
    let rejuvHUD = root.FindChildTraverse("RejuvHUD");
    let buffHUD = root.FindChildTraverse("BuffHUD");
    let rImgHUD = root.FindChildTraverse("RejuvImgHUD");
    let rNumHUD = root.FindChildTraverse("RejuvNumHUD");
    let rLabHUD = root.FindChildTraverse("RejuvTimeHUD");


    let KothLabelHUD = root.FindChildTraverse("UrnHUD");

    if (!rLab || !rNum || !rImg || !buffLabel) {
      return $.Schedule(0.5, boot);
    }

    // ================
    // STATE
    // ================
    let idx = 0;
    let counter = 0;
    let phaseStart = 0;
    let claimCount = 0;
    let running = false;
    let spawnWaiting = false;
    let lastScanFound = false;

    // Timer handles
    let gateH = null;
    let runCheckH = null;
    let tickH = null;
    let scanH = null;

    // Buff state
    let buffStartTime = 0;
    let buffCounter = 0;

    // Clock guards
    let lastSec = -1;
    let lastGlobalSec = -1;

    // GameTime cache
    let cachedGameTimePanel = null;
    let lastPickTs = 0;

    // Rejuv charges cache
    let cacheTopBar = null;
    let cacheCharges = null;
    let cacheFriendly = null;
    let cacheEnemy = null;
    let lastChargesLookup = 0;

    stopAll(true);
    scheduleGate(INITIAL_GATE_DELAY);

    function scheduleGate(delay) {
      if (gateH) { $.CancelScheduled(gateH); gateH = null; }
      gateH = $.Schedule(delay, gatePoll);
    }

    function gatePoll() {
      if (isConnectedToHideout(root)) {
        scheduleGate(GATE_CHECK_INTERVAL);
        return;
      }
      if (!running) startRunning();
    }

    function scheduleRunCheck() {
      if (runCheckH) { $.CancelScheduled(runCheckH); runCheckH = null; }
      runCheckH = $.Schedule(RUN_CHECK_INTERVAL, runCheckPoll);
    }

    function runCheckPoll() {
      if (isConnectedToHideout(root)) {
        running = false;
        stopAll(true);
        scheduleGate(GATE_CHECK_INTERVAL);
      } else {
        scheduleRunCheck();
      }
    }

    function startRunning() {
      if (running) return;
      running = true;
      claimCount = 0;
      lastScanFound = false;
      spawnWaiting = false;

      startPhaseAuto();
      startBridgeAndBuffLoop();
      scheduleRunCheck();
      scheduleScan();
    }

    function startPhaseAuto() {
      spawnWaiting = false;
      const now = gameSec(root, true);
      const computed = calcPhaseAt(now);
      idx = computed.idx;
      counter = computed.counter;
      phaseStart = computed.phaseStart;

      updatePhaseLabels(fmt(counter), SEQ[idx].num);
      setPhaseImage(SEQ[idx].name);

      lastSec = gameSec(root, true);
      lastGlobalSec = lastSec;
      scheduleTick();
    }

    function startPhaseManual(targetIdx) {
      spawnWaiting = false;
      idx = clamp(targetIdx, 0, SEQ.length - 1);
      counter = SEQ[idx].dur;
      phaseStart = gameSec(root, true);

      updatePhaseLabels(fmt(counter), SEQ[idx].num);
      setPhaseImage(SEQ[idx].name);

      lastSec = phaseStart;
      lastGlobalSec = lastSec;
      scheduleTick();
    }

    function scheduleTick() {
      if (tickH) { $.CancelScheduled(tickH); tickH = null; }
      tickH = $.Schedule(1, tick);
    }

    function tick() {
      if (!running) return;

      const now = gameSec(root);

      if (lastGlobalSec >= 0 && (now + 5 < lastGlobalSec || (lastGlobalSec > 30 && now <= 2))) {
        running = false;
        stopAll(true);
        scheduleGate(0.1);
        return;
      }
      lastGlobalSec = now;

      if (now !== lastSec) {
        lastSec = now;
        const dur = SEQ[idx].dur;
        const remaining = Math.max(0, dur - (now - phaseStart));
        if (remaining <= 0) {
          showSpawn();
        } else {
          counter = remaining;
          updatePhaseLabels(fmt(remaining), SEQ[idx].num);
          if (rejuvHUD) {
            rejuvHUD.RemoveClass("red");
            rejuvHUD.RemoveClass("yellow");
            if (remaining < 10 && remaining % 2 === 1) rejuvHUD.AddClass("red");
            else if (remaining < 20 && remaining % 2 === 1) rejuvHUD.AddClass("yellow");
          }
        }
      }

      if (buffStartTime > 0) {
        const elapsed = now - buffStartTime;
        buffCounter = Math.max(0, REJUV_DURATION - elapsed);
        if (rejuvBuffTime) rejuvBuffTime.text = fmt(buffCounter);

        const friendlyGone = !panelHasAnyToken(cacheFriendly, ["RejuvCount_1","RejuvCount_2","RejuvCount_3","RejuvCount_4"]);
        const enemyGone = !panelHasAnyToken(cacheEnemy, ["RejuvCount_1","RejuvCount_2","RejuvCount_3","RejuvCount_4"]);

        if (friendlyGone && enemyGone) {
          endRejuvBuff();
        } else if (buffCounter <= 0) {
          endRejuvBuff();
        }
      }

      const remainingBridge = BRIDGE_DURATION - (now % BRIDGE_DURATION);
      updateBridgeLabel(fmt(remainingBridge), remainingBridge);

      let remainingKoth;
      if (now < INITIAL_KOTH) {
        remainingKoth = INITIAL_KOTH - (now % INITIAL_KOTH);
      } else {
        remainingKoth = KOTH_DURATION - (now % KOTH_DURATION);
      }
      updateKothLabel(fmt(remainingKoth), remainingKoth);

      scheduleTick();
    }

    function showSpawn() {
      updatePhaseLabels("Spawn", SEQ[idx].num);
      resetImg();
      rImg.AddClass("white");
      if (rImgHUD) rImgHUD.AddClass("white");
      spawnWaiting = true;
      lastScanFound = false;
    }

    function scheduleScan() {
      if (scanH) { $.CancelScheduled(scanH); scanH = null; }
      scanH = $.Schedule(SCAN_INTERVAL, doScan);
    }

    function doScan() {
      if (!running) {
        scheduleScan();
        return;
      }

      const found = hasRejuvCount(root);

      if (spawnWaiting && found && !lastScanFound) {
        claimCount++;
        startRejuvBuff();

        const targetIdx = claimCount > 2 ? 3 : claimCount;
        startPhaseManual(targetIdx);
      }

      lastScanFound = found;
      scheduleScan();
    }

    function startRejuvBuff() {
      buffStartTime = gameSec(root, true);
      buffCounter = REJUV_DURATION;

      rejuvBuff = rejuvBuff || root.FindChildTraverse("RejuvBuff");
      rejuvBuffTime = rejuvBuffTime || root.FindChildTraverse("RejuvTimeBuff");

      if (rejuvBuff) {
        rejuvBuff.RemoveClass("pop-in");
        rejuvBuff.AddClass("pop-out");
        rejuvBuff.style.opacity = "1";
      }
      if (rejuvBuffTime) rejuvBuffTime.text = fmt(buffCounter);
    }

    function endRejuvBuff() {
      buffStartTime = 0;
      buffCounter = 0;
      if (rejuvBuff) {
        rejuvBuff.RemoveClass("pop-out");
        rejuvBuff.AddClass("pop-in");
        $.Schedule(0.5, () => {
          if (rejuvBuff) rejuvBuff.style.opacity = "0";
        });
      }
    }

    function updateBridgeLabel(text, remaining) {
      buffLabel.text = text;
      if (buffLabelHUD) buffLabelHUD.text = text;

      if (buffHUD) {
        buffHUD.RemoveClass("red");
        buffHUD.RemoveClass("yellow");
        if (remaining < 10 && remaining % 2 === 1) buffHUD.AddClass("red");
        else if (remaining < 20 && remaining % 2 === 1) buffHUD.AddClass("yellow");
      }
    }

    function updateKothLabel(text, remaining) {
      KothLabelHUD.text = text;
    }

    function startBridgeAndBuffLoop() {
      lastGlobalSec = gameSec(root);
      if (!tickH) scheduleTick();
    }

    function updatePhaseLabels(timeText, numText) {
      rLab.text = timeText;
      if (rLabHUD) rLabHUD.text = timeText;
      rNum.text = numText;
      if (rNumHUD) rNumHUD.text = numText;
    }

    function setPhaseImage(name) {
      resetImg();
      if (name.endsWith("Buff")) {
        rImg.AddClass("buff");
        if (rImgHUD) rImgHUD.AddClass("buff");
        rImg.AddClass("rotating");
        if (rImgHUD) rImgHUD.AddClass("rotating");
        $.Schedule(0.8, () => { rImg.RemoveClass("rotating"); if (rImgHUD) rImgHUD.RemoveClass("rotating"); });
      } else if (name.endsWith("Cd")) {
        rImg.AddClass("reverse");
        if (rImgHUD) rImgHUD.AddClass("reverse");
        rImg.AddClass("rotating");
        if (rImgHUD) rImgHUD.AddClass("rotating");
        $.Schedule(0.8, () => { rImg.RemoveClass("rotating"); if (rImgHUD) rImgHUD.RemoveClass("rotating"); });
      }
    }

    function resetImg() {
      [rImg, rImgHUD].forEach(img => {
        if (!img) return;
        img.RemoveClass("rotating");
        img.RemoveClass("buff");
        img.RemoveClass("reverse");
        img.RemoveClass("white");
      });
    }

    function stopAll(reset) {
      if (gateH) { $.CancelScheduled(gateH); gateH = null; }
      if (runCheckH) { $.CancelScheduled(runCheckH); runCheckH = null; }
      if (tickH) { $.CancelScheduled(tickH); tickH = null; }
      if (scanH) { $.CancelScheduled(scanH); scanH = null; }

      if (reset) {
        idx = 0;
        counter = 0;
        phaseStart = 0;
        claimCount = 0;
        buffStartTime = 0;
        buffCounter = 0;
        lastSec = -1;
        lastGlobalSec = -1;
        spawnWaiting = false;
        lastScanFound = false;

        updatePhaseLabels(fmt(SEQ[0].dur), SEQ[0].num);
        resetImg();
        endRejuvBuff();
      }
    }

    function gameSec(rootPanel, force) {
      const a = apiSec();
      if (a != null) return a;
      return uiSec(rootPanel, force);
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
          if (typeof Game.Time === "number") return Game.Time | 0;
          if (typeof Game.GameTime === "number") return Game.GameTime | 0;
        }
        if (typeof GameUI !== "undefined" && typeof GameUI.GetGameTime === "function") {
          const t = GameUI.GetGameTime();
          if (typeof t === "number" && !isNaN(t)) return t | 0;
        }
      } catch {}
      return null;
    }

    function uiSec(rootPanel, force) {
      const nowTs = Date.now();
      if (!force && cachedGameTimePanel && nowTs - lastPickTs < 800) {
        return parseSec(cachedGameTimePanel.text);
      }
      lastPickTs = nowTs;

      for (let i = 0; i < PREFERRED_GAME_TIME_IDS.length; i++) {
        const id = PREFERRED_GAME_TIME_IDS[i];
        const p = rootPanel.FindChildTraverse(id);
        if (p && p.text) {
          cachedGameTimePanel = p;
          return parseSec(p.text);
        }
      }

      const hud = rootPanel.FindChildTraverse("Hud");
      let arr = hud ? hud.FindChildrenWithClassTraverse("GameTime") : null;
      if (!arr || !arr.length) arr = rootPanel.FindChildrenWithClassTraverse("GameTime");
      cachedGameTimePanel = arr && arr.length ? arr[0] : null;

      return parseSec(cachedGameTimePanel?.text);
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
          return { idx: i, phaseStart: cum, counter: cum + dur - t };
        }
        cum += dur;
      }
      const lastIdx = SEQ.length - 1;
      const lastDur = SEQ[lastIdx].dur;
      const mod = (t - cum) % BRIDGE_DURATION;
      const within = mod % lastDur;
      return { idx: lastIdx, phaseStart: t - within, counter: lastDur - within };
    }

    function hasRejuvCount(rootPanel) {
      const TOKENS = ["RejuvCount_1", "RejuvCount_2", "RejuvCount_3", "RejuvCount_4"];
      const nowTs = Date.now();
      if (!cacheTopBar || nowTs - lastChargesLookup > 1000) {
        lastChargesLookup = nowTs;
        cacheTopBar = rootPanel.FindChildTraverse("TopBar") || rootPanel.FindChildTraverse("CitadelHudTopBar");
        cacheCharges = cacheTopBar ? cacheTopBar.FindChildTraverse("RejuvenatorCharges") : null;
        cacheFriendly = cacheCharges ? cacheCharges.FindChildTraverse("RejuvenatorFriendly") : null;
        cacheEnemy = cacheCharges ? cacheCharges.FindChildTraverse("RejuvenatorEnemy") : null;
      }

      return panelHasAnyToken(cacheFriendly, TOKENS) || panelHasAnyToken(cacheEnemy, TOKENS);
    }

    function panelHasAnyToken(panel, tokens) {
      if (!panel) return false;
      for (let i = 0; i < tokens.length; i++) {
        if (panelHasToken(panel, tokens[i])) return true;
      }
      return false;
    }

    function panelHasToken(panel, token) {
      if (!panel) return false;
      try {
        if (panel.BHasClass && panel.BHasClass(token)) return true;
      } catch {}
      try {
        const cls = safeAttr(panel, "class") || panel.className || "";
        if (String(cls).indexOf(token) !== -1) return true;
      } catch {}
      try {
        const kids = (panel.Children && panel.Children()) || [];
        for (let i = 0; i < kids.length; i++) {
          const k = kids[i];
          try {
            if (k.BHasClass && k.BHasClass(token)) return true;
          } catch {}
          try {
            const kc = safeAttr(k, "class") || k.className || "";
            if (String(kc).indexOf(token) !== -1) return true;
          } catch {}
        }
      } catch {}
      return false;
    }

    function isConnectedToHideout(rootPanel) {
      const hud = rootPanel.FindChildTraverse("Hud");
      if (!hud || !hud.BHasClass) return false;
      return hud.BHasClass("connectedToHideout") || hud.BHasClass("connectedtoHideout") || hud.BHasClass("connectedtohideout");
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
  }

  boot();
})();

