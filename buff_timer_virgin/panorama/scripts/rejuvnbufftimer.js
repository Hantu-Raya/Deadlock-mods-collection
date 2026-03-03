(() => {
  "use strict";

  // ===========================================
  // CONSTANTS
  // ===========================================

  const REJUV_DUR = 220;
  const BRIDGE_DUR = 300;
  const SPAWN_TH = 10;
  const TICK_FAST = 0.1;
  const TICK_NORM = 1;

  // Rejuvenator phase sequence: duration (d) and display number (n)
  const SEQ = [
    { d: 600, n: "1" },
    { d: 410, n: "2" },
    { d: 350, n: "3" },
    { d: 290, n: "3" }
  ];

  const POWERUP_TYPES = [
    "powerup_gun",
    "powerup_survival",
    "powerup_casting",
    "powerup_movement"
  ];

  const POWERUP_CHECK_TH = 10;
  const POWERUP_LINGER = 1500;
  const MONITOR_INTERVAL = 300;
  const CLAIM_RADIUS_SQ = 64;
  const PRETRACK_INTERVAL = 1000;
  const POWERUP_BUFF_DUR = 180;
  const DEATH_GRACE_MS = 2000;
  const BUTTON_CACHE_TTL = 800;
  const LINGER_DURATION = 5;
  const LINGER_CHECK_INTERVAL = 300;
  const MINIMAP_SNAPSHOT_INTERVAL_ACTIVE_MS = 300;
  const MINIMAP_SNAPSHOT_INTERVAL_IDLE_MS = 500;
  const MINIMAP_COLLAPSE_INTERVAL_MS = 1000;
  const MINIMAP_READABILITY_CHECK_MS = 60000;
  const MINIMAP_DEBUG_SAMPLE_LIMIT = 6;
  const DEBUG_MINIMAP_COLLAPSE = false;
  const ENABLE_MINIMAP_COLLAPSE = false;
  const NEUTRAL_SCAN_INTERVAL_MS = 500;
  const NEUTRAL_RENDER_INTERVAL_MS = 250;
  const DEBUG_NEUTRAL_TIMERS = false;
  const DEBUG_PERF = false;
  const NEUTRAL_STATE_PURGE_MS = 15000;
  const NEUTRAL_MATCH_RADIUS_SQ = 4;
  const NEUTRAL_RESPAWN_SECONDS = {
    neutral_weak: 85,
    neutral_medium: 290,
    neutral_large: 335,
    neutral_vault: 300
  };
  const MINIMAP_COLLAPSE_CLASSES = [];

  // ===========================================
  // TEAM CLASSIFICATION HELPERS
  // ===========================================

  function isAlly(btn) {
    return btn.BHasClass("team1") || btn.BHasClass("friend") || btn.BHasClass("ally");
  }

  function isEnemy(btn) {
    return btn.BHasClass("team2") || btn.BHasClass("enemy");
  }

  // ===========================================
  // PLAYER CACHE HELPERS
  // ===========================================

  function ensurePlayerCache(mm, rn) {
    if (_playerCache && rn - _playerCacheTs <= BUTTON_CACHE_TTL) return;
    _playerCache = mm.FindChildrenWithClassTraverse("map_button");
    _playerCacheTs = rn;
  }

  function perfMark(counterName, nowMs) {
    if (!DEBUG_PERF) return;

    _perfCounters[counterName] = (_perfCounters[counterName] || 0) + 1;
    if (nowMs - _perfLastLogTs < 60000) return;

    _perfLastLogTs = nowMs;
    $.Msg(
      "[BT-PERF]",
      "sweeps=", _perfCounters.snapshotSweeps,
      "linger=", _perfCounters.lingerChecks,
      "neutral=", _perfCounters.neutralScans,
      "prox=", _perfCounters.proximityPasses
    );

    _perfCounters.snapshotSweeps = 0;
    _perfCounters.lingerChecks = 0;
    _perfCounters.neutralScans = 0;
    _perfCounters.proximityPasses = 0;
  }

  // ===========================================
  // STATE VARIABLES
  // ===========================================

  let hnd;
  let running = false;
  let inHideout = true;
  let spawnWait = false;
  let idx = 0;
  let counter = 0;
  let phaseStart = 0;
  let claimCnt = 0;

  let buffStart = 0;
  let buffCnt = 0;
  let lastSec = -1;
  let lastGlobalSec = -1;
  let lastGateChk = 0;
  let lastRunChk = 0;
  let lastScan = 0;
  let tick = TICK_NORM;
  let lastFound = false;

  let lastPowerupScan = 0;
  let prevBuffRem = 300;
  let buffResetTs = 0;

  let lastLingerCheck = 0;
  let lastMinimapCollapseCheck = 0;
  let lastMinimapReadabilityCheck = 0;
  let lastNeutralScanCheck = 0;
  let lastNeutralRenderCheck = 0;
  let trackedPowerups = [];
  let monitoringActive = false;
  let lastMonitorCheck = 0;
  let pretrackActive = false;
  let lastPretrackCheck = 0;

  let pretrackData = {
    left: { minAlly: Infinity, minEnemy: Infinity },
    right: { minAlly: Infinity, minEnemy: Infinity }
  };

  let knownSpawnPos = null;
  let _claimTimeoutLeft = null;
  let _claimTimeoutRight = null;
  let _claimStartLeft = 0;
  let _claimStartRight = 0;
  let _gameTimePanel = null;
  let _tCache = 0;
  let _tCacheTs = 0;
  let _snapshotTs = 0;
  let _playerCache = null;
  let _playerCacheTs = 0;
  let _playerState = {};

  // DOM write guards - prevent redundant updates
  let _lastRejuvText = "";
  let _lastBuffText = "";
  let _lastRejuvBuffText = "";
  let _lastRejuvNum = "";
  let _lastClaimTimerL = "";
  let _lastClaimTimerR = "";
  let _lastRejuvClip = "";
  let _lastBuffClip = "";
  let _lastBuffClipColor = "";
  let _lastRingScaleL = -1;
  let _lastRingOpacityL = -1;
  let _lastRingScaleR = -1;
  let _lastRingOpacityR = -1;

  // Reusable objects to avoid GC
  const _posResult = { x: 0, y: 0 };
  const _nearResult = { ally: Infinity, enemy: Infinity };
  const _pwPos = { x: 0, y: 0 };
  const _nearestTargets = [];
  const _tmpTarget = { x: 0, y: 0, minAllyDist: Infinity, minEnemyDist: Infinity };
  const _minimapSnapshot = {
    players: [],
    powerupSpawns: [],
    neutralCamps: [],
    ts: 0
  };
  const _perfCounters = {
    snapshotSweeps: 0,
    lingerChecks: 0,
    neutralScans: 0,
    proximityPasses: 0
  };
  let _perfLastLogTs = 0;

  let _lingerState = {};
  let _neutralRespawnState = {};
  let _neutralStateSeq = 0;
  let _neutralSweepToken = 0;

  // ===========================================
  // UI PANEL REFERENCES
  // ===========================================

  const UI = {
    root: null,
    hud: null,
    minimap: null,
    minimapContainer: null,
    glowLeft: null,
    glowRight: null,
    rLab: null,
    rLabClip: null,
    rNum: null,
    rImg: null,
    buffLab: null,
    buffLabClip: null,
    rejuvBuff: null,
    rejuvBuffTime: null,
    rejuvFriendly: null,
    rejuvEnemy: null,
    claimLeft: null,
    claimRight: null,
    claimIconLeft: null,
    claimIconRight: null,
    claimRingLeft: null,
    claimRingRight: null,
    claimTimerLeft: null,
    claimTimerRight: null
  };

  // ===========================================
  // ICON MAPPINGS
  // ===========================================

  const POWERUP_ICONS = {
    powerup_gun: "s2r://panorama/images/minimap/powerup_weapon.vsvg",
    powerup_survival: "s2r://panorama/images/minimap/powerup_health.vsvg",
    powerup_casting: "s2r://panorama/images/minimap/powerup_magic.vsvg",
    powerup_movement: "s2r://panorama/images/minimap/powerup_movement.vsvg"
  };


  const GLOW_CLASS_MAP = {
    powerup_gun: "glow-gun",
    powerup_survival: "glow-survival",
    powerup_casting: "glow-casting",
    powerup_movement: "glow-movement"
  };

  let _activeGlowLeft = null;
  let _activeGlowRight = null;

  // ===========================================
  // BOOT / INITIALIZATION
  // ===========================================

  function boot() {
    const r = findRoot($.GetContextPanel());
    UI.root = r;
    UI.hud = r.FindChildTraverse("Hud");
    UI.rLab = r.FindChildTraverse("RejuvTime");
    UI.rNum = r.FindChildTraverse("RejuvNum");
    UI.rImg = r.FindChildTraverse("RejuvImg");
    UI.buffLab = r.FindChildTraverse("BuffTime");
    UI.rLabClip = r.FindChildTraverse("RejuvTimeClip");
    UI.buffLabClip = r.FindChildTraverse("BuffTimeClip");
    UI.rejuvBuff = r.FindChildTraverse("RejuvBuff");
    UI.rejuvBuffTime = r.FindChildTraverse("RejuvTimeBuff");
    UI.glowLeft = r.FindChildTraverse("MinimapGlowLeft");
    UI.glowRight = r.FindChildTraverse("MinimapGlowRight");
    UI.claimLeft = r.FindChildTraverse("MinimapBuffClaimLeft");
    UI.claimRight = r.FindChildTraverse("MinimapBuffClaimRight");
    UI.claimIconLeft = r.FindChildTraverse("ClaimIconLeft");
    UI.claimIconRight = r.FindChildTraverse("ClaimIconRight");
    UI.claimRingLeft = r.FindChildTraverse("ClaimRingLeft");
    UI.claimRingRight = r.FindChildTraverse("ClaimRingRight");
    UI.claimTimerLeft = r.FindChildTraverse("ClaimTimerLeft");
    UI.claimTimerRight = r.FindChildTraverse("ClaimTimerRight");
    UI.minimapContainer = r.FindChildTraverse("HudMinimapContainer");

    const tb = r.FindChildTraverse("TopBar");
    if (tb) {
      const ch = tb.FindChildTraverse("RejuvenatorCharges");
      if (ch) {
        UI.rejuvFriendly = ch.FindChildTraverse("RejuvenatorFriendly");
        UI.rejuvEnemy = ch.FindChildTraverse("RejuvenatorEnemy");
      }
    }

    if (!UI.rLab || !UI.rNum || !UI.rImg || !UI.buffLab) {
      return $.Schedule(0.5, boot);
    }

    reset(1);
    loop();
  }

  // ===========================================
  // MAIN LOOP
  // ===========================================

  function loop() {
    const rn = Date.now();
    const now = gTime(rn);
    let snapshot = null;

    if (ENABLE_MINIMAP_COLLAPSE && rn - lastMinimapCollapseCheck >= MINIMAP_COLLAPSE_INTERVAL_MS) {
      lastMinimapCollapseCheck = rn;
      collapseMinimapTargets("tick", false);
    }

    if (ENABLE_MINIMAP_COLLAPSE && rn - lastMinimapReadabilityCheck >= MINIMAP_READABILITY_CHECK_MS) {
      lastMinimapReadabilityCheck = rn;
      collapseMinimapTargets("1m-readability-check", true);
    }

    if (rn - lastNeutralScanCheck >= NEUTRAL_SCAN_INTERVAL_MS) {
      lastNeutralScanCheck = rn;
      snapshot = collectMinimapSnapshot(rn, false);
      if (snapshot) {
        scanNeutralRespawnState(snapshot, rn);
      }
    }

    if (rn - lastNeutralRenderCheck >= NEUTRAL_RENDER_INTERVAL_MS) {
      lastNeutralRenderCheck = rn;
      renderNeutralRespawnTimers(rn);
    }

    // Not running - check hideout status periodically
    if (!running) {
      if (rn - lastGateChk >= 30000) {
        lastGateChk = rn;
        inHideout = isHideout();
        if (!inHideout) {
          startRun(now);
        }
      }
      hnd = $.Schedule(30, loop);
      return;
    }

    // Check if we returned to hideout
    if (rn - lastRunChk >= 60000) {
      lastRunChk = rn;
      if (isHideout()) {
        reset(1);
        loop();
        return;
      }
    }

    // Detect game restart (time went backwards significantly)
    if (lastGlobalSec >= 0 && (now + 5 < lastGlobalSec || (lastGlobalSec > 30 && now <= 2))) {
      reset(1);
      loop();
      return;
    }

    lastGlobalSec = now;

    // Update rejuvenator countdown
    if (now !== lastSec) {
      lastSec = now;
      if (idx < 0 || idx >= SEQ.length) idx = 0;  // Safety clamp
      const rem = Math.max(0, SEQ[idx].d - (now - phaseStart));

      if (rem <= 0) {
        showSpawn();
      } else {
        counter = rem;
        const t = fmt(rem);

        if (t !== _lastRejuvText) {
          UI.rLab.text = t;
          if (UI.rLabClip?.IsValid?.()) {
            UI.rLabClip.text = t;
          }
          _lastRejuvText = t;
        }

        // Left Side: Rejuv (Anchor Left, Deplete Right-to-Left)
        // rejuvPct is REMAINING percentage (1.0 -> 0.0)
        const rejuvPct = spawnWait ? 1.0 : (counter / SEQ[idx].d);
        const p = Math.floor(rejuvPct * 100);

        // Clip: Visible from 0% to p% (Left anchored)
        const rejuvClip = "rect(0%," + p + "%,100%,0%)";

        if (rejuvClip !== _lastRejuvClip && UI.rLabClip?.IsValid?.()) {
          UI.rLabClip.style.clip = rejuvClip;
          _lastRejuvClip = rejuvClip;
        }
      }

      tick = (spawnWait || rem <= SPAWN_TH) ? TICK_FAST : TICK_NORM;
    }

    // Update buff duration countdown
    if (buffStart > 0) {
      buffCnt = Math.max(0, REJUV_DUR - (now - buffStart));

      if (UI.rejuvBuffTime) {
        const t = fmt(buffCnt);
        if (t !== _lastRejuvBuffText) {
          UI.rejuvBuffTime.text = t;
          _lastRejuvBuffText = t;
        }
      }

      if (buffCnt <= 0) {
        endBuff();
      }
    }

    // Update bridge buff timer (cycles every 5 minutes)
    const buffRem = BRIDGE_DUR - (now % BRIDGE_DUR);
    {
      const t = fmt(buffRem);

      if (t !== _lastBuffText) {
        UI.buffLab.text = t;
        if (UI.buffLabClip?.IsValid?.()) {
          UI.buffLabClip.text = t;
        }
        _lastBuffText = t;
      }

      // Right Side: Buff (Anchor Right, Deplete Left-to-Right)
      // buffPct is REMAINING percentage (1.0 -> 0.0)
      const buffPct = buffRem / BRIDGE_DUR;
      const p = Math.floor((1.0 - buffPct) * 100); // Inverse for split point
      
      // Clip: Visible from p% to 100% (Right anchored)
      const buffClip = "rect(0%,100%,100%," + p + "%)";

      if (buffClip !== _lastBuffClip && UI.buffLabClip?.IsValid?.()) {
        UI.buffLabClip.style.clip = buffClip;
        _lastBuffClip = buffClip;

        // Color logic for buff clip label (White -> Red)
        const gVal = Math.floor(255 * buffPct);
        const newColor = "rgb(255," + gVal + "," + gVal + ")";

        if (newColor !== _lastBuffClipColor) {
          UI.buffLabClip.style.color = newColor;
          _lastBuffClipColor = newColor;
        }
      }
    }

    // Start pre-tracking players near powerup spawns
    if (buffRem <= POWERUP_CHECK_TH && !pretrackActive && !monitoringActive && knownSpawnPos) {
      pretrackActive = true;
      pretrackData.left.minAlly = pretrackData.left.minEnemy = pretrackData.right.minAlly = pretrackData.right.minEnemy = Infinity;
    }

    // Update pre-track data
    if (pretrackActive && knownSpawnPos && rn - lastPretrackCheck >= PRETRACK_INTERVAL) {
      lastPretrackCheck = rn;
      snapshot = snapshot || collectMinimapSnapshot(rn, false);
      doPretrack(rn, snapshot);
    }

    // Detect buff cycle reset
    if (prevBuffRem <= POWERUP_CHECK_TH && prevBuffRem > 0 && buffRem > POWERUP_CHECK_TH) {
      buffResetTs = rn;
      trackedPowerups = [];
      monitoringActive = false;
    }
    prevBuffRem = buffRem;

    // Scan for powerups during linger period
    const lingerActive = buffResetTs > 0 && rn - buffResetTs < POWERUP_LINGER;
    if (lingerActive && !monitoringActive && rn - lastPowerupScan >= 200) {
      lastPowerupScan = rn;
      scanPowerups(rn, null, true);
    }

    // Fallback scan if no powerups found
    if (!monitoringActive && trackedPowerups.length === 0 && buffResetTs > 0 && rn - buffResetTs >= 3000 && rn - buffResetTs < 4000) {
      scanPowerups(rn, null, true);
    }

    // Monitor tracked powerups for claims
    if (monitoringActive && rn - lastMonitorCheck >= MONITOR_INTERVAL) {
      lastMonitorCheck = rn;
      snapshot = snapshot || collectMinimapSnapshot(rn, false);
      monitorPowerups(rn, snapshot);
    }

    // Periodic rejuvenator scan
    if (rn - lastScan >= 3000) {
      lastScan = rn;
      doScan();
    }

    // Check for enemy linger (fog of war)
    if (rn - lastLingerCheck >= LINGER_CHECK_INTERVAL) {
      lastLingerCheck = rn;
      snapshot = snapshot || collectMinimapSnapshot(rn, false);
      checkEnemyLinger(rn, snapshot);
    }

    updateClaimProgress(now);
    hnd = $.Schedule(tick, loop);
  }

  // ===========================================
  // PRE-TRACKING
  // ===========================================

  function doPretrack(nowMs, snapshot) {
    if (!knownSpawnPos) return;

    const snap = snapshot || collectMinimapSnapshot(nowMs, false);
    if (!snap?.players?.length) return;

    _nearestTargets.length = 2;

    const leftTarget = _nearestTargets[0] || (_nearestTargets[0] = { x: 0, y: 0, minAllyDist: Infinity, minEnemyDist: Infinity });
    leftTarget.x = knownSpawnPos.left.x;
    leftTarget.y = knownSpawnPos.left.y;

    const rightTarget = _nearestTargets[1] || (_nearestTargets[1] = { x: 0, y: 0, minAllyDist: Infinity, minEnemyDist: Infinity });
    rightTarget.x = knownSpawnPos.right.x;
    rightTarget.y = knownSpawnPos.right.y;

    computeNearestForTargets(snap.players, _nearestTargets, 2, nowMs, false);

    if (leftTarget.minAllyDist < pretrackData.left.minAlly) pretrackData.left.minAlly = leftTarget.minAllyDist;
    if (leftTarget.minEnemyDist < pretrackData.left.minEnemy) pretrackData.left.minEnemy = leftTarget.minEnemyDist;
    if (rightTarget.minAllyDist < pretrackData.right.minAlly) pretrackData.right.minAlly = rightTarget.minAllyDist;
    if (rightTarget.minEnemyDist < pretrackData.right.minEnemy) pretrackData.right.minEnemy = rightTarget.minEnemyDist;
  }

  // ===========================================
  // REJUVENATOR SCANNING
  // ===========================================

  function doScan() {
    if (!running) return;

    const f = hasRejuv();

    if (spawnWait && f && !lastFound) {
      claimCnt++;
      const t = gTime();
      startBuff(t);
      startPhase(claimCnt > 2 ? 3 : claimCnt, t);
    }

    lastFound = f;
  }

  function hasRejuv() {
    return panelHas(UI.rejuvFriendly) || panelHas(UI.rejuvEnemy);
  }

  function panelHas(p) {
    if (!p) return false;

    try {
      if (p.BHasClass("RejuvCount_1") || p.BHasClass("RejuvCount_2") || p.BHasClass("RejuvCount_3") || p.BHasClass("RejuvCount_4")) {
        return true;
      }

      const k = p.Children();
      if (k) {
        for (let j = 0; j < k.length; j++) {
          const c = k[j];
          if (c.BHasClass("RejuvCount_1") || c.BHasClass("RejuvCount_2") || c.BHasClass("RejuvCount_3") || c.BHasClass("RejuvCount_4")) {
            return true;
          }
        }
      }
    } catch {}

    return false;
  }

  // ===========================================
  // MINIMAP UTILITIES
  // ===========================================

  function findMinimap() {
    if (UI.minimap?.IsValid?.()) return UI.minimap;

    try {
      UI.minimap = UI.root.FindChildTraverse("hud_minimap");
    } catch (e) {
    }


    return UI.minimap;
  }

  function collectMinimapSnapshot(nowMs, forceFresh) {
    const mm = findMinimap();
    if (!mm) return null;

    const now = nowMs || Date.now();
    const intervalMs = running ? MINIMAP_SNAPSHOT_INTERVAL_ACTIVE_MS : MINIMAP_SNAPSHOT_INTERVAL_IDLE_MS;
    if (!forceFresh && _snapshotTs > 0 && now - _snapshotTs < intervalMs) {
      return _minimapSnapshot;
    }

    let buttons = null;
    try {
      buttons = mm.FindChildrenWithClassTraverse("map_button");
    } catch {
      return _minimapSnapshot;
    }

    if (!buttons?.length) {
      _minimapSnapshot.players.length = 0;
      _minimapSnapshot.powerupSpawns.length = 0;
      _minimapSnapshot.neutralCamps.length = 0;
      _minimapSnapshot.ts = now;
      _snapshotTs = now;
      perfMark("snapshotSweeps", now);
      return _minimapSnapshot;
    }

    let playerCount = 0;
    let powerupCount = 0;
    let neutralCount = 0;

    try {
      for (let i = 0, len = buttons.length; i < len; i++) {
        const btn = buttons[i];
        if (!btn?.IsValid?.() || !btn.BHasClass?.("map_button")) continue;

      if (btn.BHasClass("player")) {
        let entry = _minimapSnapshot.players[playerCount];
        if (!entry) {
          entry = { id: "", panel: null, isActive: false, isDead: false, team: 0, xPct: 0, yPct: 0, actualX: 0, actualY: 0 };
          _minimapSnapshot.players[playerCount] = entry;
        }

        const id = btn.id || ("p" + i);
        const ps = _playerState[id];
        let team = ps?.team || 0;
        if (!team) {
          team = isAlly(btn) ? 1 : isEnemy(btn) ? 2 : 0;
        }

        const pos = getPanelPos(btn);
        entry.id = id;
        entry.panel = btn;
        entry.isActive = btn.BHasClass("active");
        entry.isDead = btn.BHasClass("playerdead");
        entry.team = team;
        entry.xPct = pos.x;
        entry.yPct = pos.y;
        entry.actualX = btn.actualxoffset || 0;
        entry.actualY = btn.actualyoffset || 0;
        playerCount++;
        continue;
      }

      if (btn.BHasClass("powerup_spawn")) {
        let entry = _minimapSnapshot.powerupSpawns[powerupCount];
        if (!entry) {
          entry = { id: "", panel: null, isActive: false, type: "unknown", xPct: 0, yPct: 0, actualX: 0, actualY: 0 };
          _minimapSnapshot.powerupSpawns[powerupCount] = entry;
        }

        let type = "unknown";
        for (let j = 0; j < POWERUP_TYPES.length; j++) {
          if (btn.BHasClass(POWERUP_TYPES[j])) {
            type = POWERUP_TYPES[j];
            break;
          }
        }

        const pos = getPanelPos(btn);
        entry.id = btn.id || ("powerup_" + i);
        entry.panel = btn;
        entry.isActive = btn.BHasClass("active");
        entry.type = type;
        entry.xPct = pos.x;
        entry.yPct = pos.y;
        entry.actualX = btn.actualxoffset || 0;
        entry.actualY = btn.actualyoffset || 0;
        powerupCount++;
        continue;
      }

        const neutralType = getNeutralType(btn);
        if (!neutralType) continue;

        let entry = _minimapSnapshot.neutralCamps[neutralCount];
        if (!entry) {
          entry = { id: "", panel: null, type: "", isActive: false, xPct: 0, yPct: 0, actualX: 0, actualY: 0 };
          _minimapSnapshot.neutralCamps[neutralCount] = entry;
        }

        const pos = getPanelPos(btn);
        entry.id = btn.id || "";
        entry.panel = btn;
        entry.type = neutralType;
        entry.isActive = btn.BHasClass("active");
        entry.xPct = pos.x;
        entry.yPct = pos.y;
        entry.actualX = btn.actualxoffset || 0;
        entry.actualY = btn.actualyoffset || 0;
        neutralCount++;
      }
    } catch {}

    _minimapSnapshot.players.length = playerCount;
    _minimapSnapshot.powerupSpawns.length = powerupCount;
    _minimapSnapshot.neutralCamps.length = neutralCount;
    _minimapSnapshot.ts = now;
    _snapshotTs = now;
    perfMark("snapshotSweeps", now);
    return _minimapSnapshot;
  }

  function computeNearestForTargets(players, targets, targetCount, nowMs, accumulate) {
    if (!players?.length || !targets || targetCount <= 0) return;

    const now = nowMs || Date.now();
    perfMark("proximityPasses", now);

    for (let i = 0; i < targetCount; i++) {
      const t = targets[i];
      if (!t) continue;
      t._scanAlly = Infinity;
      t._scanEnemy = Infinity;
    }

    for (let i = 0, pLen = players.length; i < pLen; i++) {
      const pl = players[i];
      if (!pl) continue;

      const id = pl.id || ("p" + i);
      let ps = _playerState[id];
      if (!ps) {
        ps = { x: 0, y: 0, deadTs: 0, wasActive: true, team: pl.team || 0 };
        _playerState[id] = ps;
      }

      let team = ps.team || pl.team || 0;
      if (!team && pl.panel?.IsValid?.()) {
        team = isAlly(pl.panel) ? 1 : isEnemy(pl.panel) ? 2 : 0;
      }
      ps.team = team;

      const posX = pl.xPct;
      const posY = pl.yPct;
      const posChanged = Math.abs(ps.x - posX) > 0.5 || Math.abs(ps.y - posY) > 0.5;

      if (pl.isDead) {
        const deadTs = ps.deadTs || (posChanged ? 0 : now);
        ps.x = posX;
        ps.y = posY;
        ps.deadTs = deadTs || now;

        if (team === 2) {
          cancelLinger(id);
        }

        if (!posChanged && now - ps.deadTs >= DEATH_GRACE_MS) {
          continue;
        }
      } else {
        ps.x = posX;
        ps.y = posY;
        ps.deadTs = 0;
      }

      if (team !== 1 && team !== 2) continue;

      for (let tIdx = 0; tIdx < targetCount; tIdx++) {
        const target = targets[tIdx];
        if (!target) continue;

        const dx = posX - target.x;
        const dy = posY - target.y;
        const d = dx * dx + dy * dy;

        if (team === 1) {
          if (d < target._scanAlly) target._scanAlly = d;
        } else if (d < target._scanEnemy) {
          target._scanEnemy = d;
        }
      }
    }

    for (let i = 0; i < targetCount; i++) {
      const t = targets[i];
      if (!t) continue;

      if (accumulate) {
        t.minAllyDist = Math.min(t.minAllyDist, t._scanAlly);
        t.minEnemyDist = Math.min(t.minEnemyDist, t._scanEnemy);
      } else {
        t.minAllyDist = t._scanAlly;
        t.minEnemyDist = t._scanEnemy;
      }
    }
  }

  function isMinimapCollapseTarget(btn) {
    if (!ENABLE_MINIMAP_COLLAPSE) return false;
    if (!btn?.IsValid?.() || !btn.BHasClass?.("map_button")) return false;
    if (btn.BHasClass("player") || btn.BHasClass("powerup_spawn")) return false;

    for (let i = 0; i < MINIMAP_COLLAPSE_CLASSES.length; i++) {
      if (btn.BHasClass(MINIMAP_COLLAPSE_CLASSES[i])) {
        return true;
      }
    }

    return false;
  }

  function minimapTargetTag(btn, index) {
    const id = btn.id || ("idx_" + index);
    let kind = "other";

    if (btn.BHasClass("neutral_large")) kind = "neutral_large";
    else if (btn.BHasClass("neutral_medium")) kind = "neutral_medium";
    else if (btn.BHasClass("neutral_weak")) kind = "neutral_weak";
    else if (btn.BHasClass("neutral_vault")) kind = "neutral_vault";
    else if (btn.BHasClass("neutral")) kind = "neutral_active";

    return id + ":" + kind;
  }

  function collapseMinimapTargets(reason, forceLog) {
    if (!ENABLE_MINIMAP_COLLAPSE) return;
    const mm = findMinimap();
    if (!mm) return;

    const now = Date.now();

    try {
      ensurePlayerCache(mm, now);
      const buttons = _playerCache;
      if (!buttons?.length) return;

      let targetCount = 0;
      let collapsedCount = 0;
      let changedCount = 0;
      const sample = [];

      for (let i = 0, len = buttons.length; i < len; i++) {
        const btn = buttons[i];
        if (!isMinimapCollapseTarget(btn)) continue;

        targetCount++;

        const wasCollapsed = btn.style?.visibility === "collapse";
        if (!wasCollapsed) {
          try {
            btn.style.visibility = "collapse";
          } catch {}
        }

        const isCollapsed = btn.style?.visibility === "collapse";
        if (isCollapsed) collapsedCount++;
        if (!wasCollapsed && isCollapsed) changedCount++;

        if (sample.length < MINIMAP_DEBUG_SAMPLE_LIMIT) {
          sample.push(minimapTargetTag(btn, i));
        }
      }

      if (DEBUG_MINIMAP_COLLAPSE && (forceLog || changedCount > 0)) {
        const readableCount = targetCount - collapsedCount;
        $.Msg("[BT-MAP] reason=", reason, " targets=", targetCount, " collapsed=", collapsedCount, " readable=", readableCount, " changed=", changedCount);
        if (sample.length > 0) {
          $.Msg("[BT-MAP] sample=", sample.join(", "));
        }
      }
    } catch {
      if (DEBUG_MINIMAP_COLLAPSE) {
        $.Msg("[BT-MAP][ERR] collapse sweep failed");
      }
    }
  }

  function getNeutralType(btn) {
    if (!btn?.IsValid?.()) return null;
    if (btn.BHasClass("neutral_weak")) return "neutral_weak";
    if (btn.BHasClass("neutral_medium")) return "neutral_medium";
    if (btn.BHasClass("neutral_large")) return "neutral_large";
    if (btn.BHasClass("neutral_vault")) return "neutral_vault";
    return null;
  }

  function getNeutralTimerId(key) {
    return "NeutralTimer_" + key.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  function neutralPosOnContainer(mapX, mapY, container, mm) {
    const mw = container.contentwidth || 404;
    const mh = container.contentheight || 404;
    const inverted = mm?.IsValid?.() && mm.BHasClass?.("invert_map");

    let x = (mapX || 0) + 2;
    let y = (mapY || 0) + 2;

    if (inverted) {
      x = mw - x - 24;
      y = mh - y - 24;
    }

    _posResult.x = x;
    _posResult.y = y;
    return _posResult;
  }

  function clearNeutralTimerEntry(key, reason) {
    const st = _neutralRespawnState[key];
    if (!st) return;

    try {
      if (st.label?.IsValid?.()) {
        st.label.DeleteAsync(0);
      }
    } catch {}

    if (DEBUG_NEUTRAL_TIMERS && reason) {
      $.Msg("[BT-NEUTRAL] clear key=", key, " reason=", reason);
    }

    delete _neutralRespawnState[key];
  }

  function resolveNeutralStateKey(neutralType, xPct, yPct, explicitId) {
    if (explicitId) return explicitId;

    const keys = Object.keys(_neutralRespawnState);
    let bestKey = null;
    let bestDist = Infinity;

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const st = _neutralRespawnState[k];
      if (!st || st.type !== neutralType) continue;

      const dx = (st.mapPctX || 0) - xPct;
      const dy = (st.mapPctY || 0) - yPct;
      const d = dx * dx + dy * dy;

      if (d < bestDist) {
        bestDist = d;
        bestKey = k;
      }
    }

    if (bestKey && bestDist <= NEUTRAL_MATCH_RADIUS_SQ) {
      return bestKey;
    }

    _neutralStateSeq++;
    return "neutral_state_" + _neutralStateSeq;
  }

  function renderNeutralTimer(st, key, now, container, mm) {
    if (st.respawnEndMs <= 0) {
      if (st.label?.IsValid?.()) {
        try { st.label.DeleteAsync(0); } catch {}
      }
      st.label = null;
      st.lastText = "";
      return;
    }

    const remSec = Math.max(0, Math.ceil((st.respawnEndMs - now) / 1000));

    let label = st.label;
    const timerId = getNeutralTimerId(key);
    if (!label?.IsValid?.()) {
      label = container.FindChildTraverse(timerId);
    }
    if (!label?.IsValid?.()) {
      label = $.CreatePanel("Label", container, timerId);
      label.AddClass("neutral-respawn-timer");
    }

    const pos = neutralPosOnContainer(st.mapX, st.mapY, container, mm);
    const px = pos.x;
    const py = pos.y;
    if (Math.abs((st.lastPosX ?? -9999) - px) > 0.05 || Math.abs((st.lastPosY ?? -9999) - py) > 0.05) {
      label.style.position = px + "px " + py + "px 0px";
      st.lastPosX = px;
      st.lastPosY = py;
    }

    const text = fmt(remSec);
    if (text !== st.lastText) {
      label.text = text;
      st.lastText = text;
    }

    st.label = label;

    if (remSec <= 0) {
      st.respawnEndMs = 0;
      st.lastText = "";
      if (st.label?.IsValid?.()) {
        try { st.label.DeleteAsync(0); } catch {}
        st.label = null;
      }
      if (DEBUG_NEUTRAL_TIMERS) {
        $.Msg("[BT-NEUTRAL] done key=", key, " type=", st.type);
      }
    }
  }

  function scanNeutralRespawnState(snapshot, nowMs) {
    const now = nowMs || Date.now();
    const camps = snapshot?.neutralCamps || [];
    const token = ++_neutralSweepToken;
    perfMark("neutralScans", now);

    try {
      for (let i = 0, len = camps.length; i < len; i++) {
        const camp = camps[i];
        if (!camp) continue;

        const key = resolveNeutralStateKey(camp.type, camp.xPct, camp.yPct, camp.id || "");
        let st = _neutralRespawnState[key];
        const isActive = camp.isActive;
        const durationSec = NEUTRAL_RESPAWN_SECONDS[camp.type] || 0;

        if (!st) {
          st = {
            type: camp.type,
            wasActive: isActive,
            respawnEndMs: 0,
            label: null,
            lastText: "",
            mapPctX: camp.xPct,
            mapPctY: camp.yPct,
            mapX: camp.actualX,
            mapY: camp.actualY,
            lastSeenMs: now,
            sweepToken: token,
            lastPosX: -1,
            lastPosY: -1
          };
          _neutralRespawnState[key] = st;
        } else {
          st.type = camp.type;
        }

        st.mapPctX = camp.xPct;
        st.mapPctY = camp.yPct;
        st.mapX = camp.actualX;
        st.mapY = camp.actualY;
        st.lastSeenMs = now;
        st.sweepToken = token;

        if (st.wasActive && !isActive && durationSec > 0) {
          st.respawnEndMs = now + durationSec * 1000;
          if (DEBUG_NEUTRAL_TIMERS) {
            $.Msg("[BT-NEUTRAL] start key=", key, " type=", camp.type, " duration=", durationSec);
          }
        } else if (!st.wasActive && isActive) {
          st.respawnEndMs = 0;
          st.lastText = "";
          if (st.label?.IsValid?.()) {
            try { st.label.DeleteAsync(0); } catch {}
            st.label = null;
          }
          if (DEBUG_NEUTRAL_TIMERS) {
            $.Msg("[BT-NEUTRAL] clear key=", key, " reason=active_again");
          }
        }

        st.wasActive = isActive;
      }

      for (const key in _neutralRespawnState) {
        const st = _neutralRespawnState[key];
        if (!st || st.sweepToken === token) continue;
        if (st.respawnEndMs > 0) continue;
        if (now - (st.lastSeenMs || 0) > NEUTRAL_STATE_PURGE_MS) {
          clearNeutralTimerEntry(key, "stale");
        }
      }
    } catch {
      if (DEBUG_NEUTRAL_TIMERS) {
        $.Msg("[BT-NEUTRAL][ERR] scan failed");
      }
    }
  }

  function renderNeutralRespawnTimers(nowMs) {
    const mm = findMinimap();
    const container = UI.minimapContainer;
    if (!mm || !container?.IsValid?.()) return;

    const now = nowMs || Date.now();
    for (const key in _neutralRespawnState) {
      const st = _neutralRespawnState[key];
      if (!st || st.respawnEndMs <= 0) continue;
      renderNeutralTimer(st, key, now, container, mm);
    }
  }

  function updateNeutralRespawnTimers(nowMs) {
    const snapshot = collectMinimapSnapshot(nowMs, true);
    if (snapshot) {
      scanNeutralRespawnState(snapshot, nowMs);
    }
    renderNeutralRespawnTimers(nowMs);
  }

  function clearNeutralRespawnTimers() {
    for (const key in _neutralRespawnState) {
      clearNeutralTimerEntry(key, "reset");
    }
    _neutralRespawnState = {};
    _neutralStateSeq = 0;
    _neutralSweepToken = 0;
  }

  // ===========================================
  // GLOW MANAGEMENT
  // ===========================================

  function clearSideGlow(side) {
    const isLeft = side === "LEFT";
    const panel = isLeft ? UI.glowLeft : UI.glowRight;
    const current = isLeft ? _activeGlowLeft : _activeGlowRight;

    if (!panel || !current) return;

    try {
      panel.RemoveClass(current);
    } catch {}

    if (isLeft) {
      _activeGlowLeft = null;
    } else {
      _activeGlowRight = null;
    }
  }

  function clearGlows() {
    clearSideGlow("LEFT");
    clearSideGlow("RIGHT");
  }

  function applyGlow(side, type) {
    const isLeft = side === "LEFT";
    const panel = isLeft ? UI.glowLeft : UI.glowRight;
    const cls = GLOW_CLASS_MAP[type];

    if (!panel || !cls) return;
    if ((isLeft ? _activeGlowLeft : _activeGlowRight) === cls) return;

    clearSideGlow(side);

    try {
      panel.AddClass(cls);
    } catch {}

    if (isLeft) {
      _activeGlowLeft = cls;
    } else {
      _activeGlowRight = cls;
    }
  }

  function applyEnemyClaim(side) {
    const panel = side === "LEFT" ? UI.glowLeft : UI.glowRight;
    if (!panel) return;

    try {
      panel.AddClass("glow-enemy");
      $.Schedule(3, () => {
        try {
          panel.RemoveClass("glow-enemy");
        } catch {}
      });
    } catch {}
  }

  // ===========================================
  // CLAIM INDICATOR MANAGEMENT
  // ===========================================

  function showClaimIndicator(side, isEnemy, powerupType) {
    try {
      const isLeft = side === "LEFT";
      const claimBox = isLeft ? UI.claimLeft : UI.claimRight;
      const claimIcon = isLeft ? UI.claimIconLeft : UI.claimIconRight;
      const claimTimer = isLeft ? UI.claimTimerLeft : UI.claimTimerRight;

      if (!claimBox?.IsValid?.() || !claimIcon?.IsValid?.()) return;

      // Cancel previous timeout
      const prevTimeout = isLeft ? _claimTimeoutLeft : _claimTimeoutRight;
      if (prevTimeout) {
        try {
          $.CancelScheduled(prevTimeout);
        } catch {}
      }

      // Reset classes
      claimBox.RemoveClass("active");
      claimBox.RemoveClass("ally-claim");
      claimBox.RemoveClass("enemy-claim");

      // Set icon
      const iconSrc = POWERUP_ICONS[powerupType];
      if (iconSrc) {
        try {
          claimIcon.style.backgroundImage = 'url("' + iconSrc + '")';
        } catch {}
      }

      // Set team class
      claimBox.SetHasClass("ally-claim", !isEnemy);
      claimBox.SetHasClass("enemy-claim", isEnemy);

      // Set timer text
      if (claimTimer?.IsValid?.()) {
        try {
          claimTimer.text = fmt(POWERUP_BUFF_DUR);
        } catch {}
      }

      // Record start time
      const claimTime = gTime();
      if (isLeft) {
        _claimStartLeft = claimTime;
      } else {
        _claimStartRight = claimTime;
      }

      // Animate in (next frame)
      $.Schedule(0.016, () => {
        try {
          if (claimBox?.IsValid?.()) {
            claimBox.AddClass("active");
          }
        } catch {}
      });

      // Schedule hide
      const timeoutHandle = $.Schedule(POWERUP_BUFF_DUR, () => {
        hideClaimIndicator(side);
      });

      if (isLeft) {
        _claimTimeoutLeft = timeoutHandle;
      } else {
        _claimTimeoutRight = timeoutHandle;
      }
    } catch (e) {
    }
  }


  function hideClaimIndicator(side) {
    try {
      const claimBox = side === "LEFT" ? UI.claimLeft : UI.claimRight;
      if (claimBox?.IsValid?.()) {
        claimBox.RemoveClass("active");
        claimBox.RemoveClass("ally-claim");
        claimBox.RemoveClass("enemy-claim");
      }
    } catch {}

    if (side === "LEFT") {
      _claimTimeoutLeft = null;
      _claimStartLeft = 0;
    } else {
      _claimTimeoutRight = null;
      _claimStartRight = 0;
    }
  }

  function clearClaimIndicators() {
    if (_claimTimeoutLeft) {
      try {
        $.CancelScheduled(_claimTimeoutLeft);
      } catch {}
      _claimTimeoutLeft = null;
    }

    if (_claimTimeoutRight) {
      try {
        $.CancelScheduled(_claimTimeoutRight);
      } catch {}
      _claimTimeoutRight = null;
    }

    _claimStartLeft = 0;
    _claimStartRight = 0;

    try {
      UI.claimLeft?.RemoveClass?.("active");
      UI.claimLeft?.RemoveClass?.("ally-claim");
      UI.claimLeft?.RemoveClass?.("enemy-claim");
    } catch {}

    try {
      UI.claimRight?.RemoveClass?.("active");
      UI.claimRight?.RemoveClass?.("ally-claim");
      UI.claimRight?.RemoveClass?.("enemy-claim");
    } catch {}
  }

  function updateClaimProgress(now) {
    // Early exit if no claims active (common case)
    if (_claimStartLeft <= 0 && _claimStartRight <= 0) return;

    // Left side
    if (_claimStartLeft > 0) {
      const elapsed = now - _claimStartLeft;
      const rem = Math.max(0, POWERUP_BUFF_DUR - elapsed);
      const pct = rem / POWERUP_BUFF_DUR;

      try {
        if (UI.claimTimerLeft?.IsValid?.()) {
          const t = fmt(rem);
          if (t !== _lastClaimTimerL) {
            UI.claimTimerLeft.text = t;
            _lastClaimTimerL = t;
          }
        }
      } catch {}

      try {
        if (UI.claimRingLeft?.IsValid?.()) {
          const sc = 0.5 + pct * 0.5;
          const op = 0.3 + pct * 0.7;

          if (sc !== _lastRingScaleL) {
            UI.claimRingLeft.style.preTransformScale2d = sc;
            _lastRingScaleL = sc;
          }

          if (op !== _lastRingOpacityL) {
            UI.claimRingLeft.style.opacity = op;
            _lastRingOpacityL = op;
          }
        }
      } catch {}

      if (rem <= 0) {
        hideClaimIndicator("LEFT");
      }
    }

    // Right side
    if (_claimStartRight > 0) {
      const elapsed = now - _claimStartRight;
      const rem = Math.max(0, POWERUP_BUFF_DUR - elapsed);
      const pct = rem / POWERUP_BUFF_DUR;

      try {
        if (UI.claimTimerRight?.IsValid?.()) {
          const t = fmt(rem);
          if (t !== _lastClaimTimerR) {
            UI.claimTimerRight.text = t;
            _lastClaimTimerR = t;
          }
        }
      } catch {}

      try {
        if (UI.claimRingRight?.IsValid?.()) {
          const sc = 0.5 + pct * 0.5;
          const op = 0.3 + pct * 0.7;

          if (sc !== _lastRingScaleR) {
            UI.claimRingRight.style.preTransformScale2d = sc;
            _lastRingScaleR = sc;
          }

          if (op !== _lastRingOpacityR) {
            UI.claimRingRight.style.opacity = op;
            _lastRingOpacityR = op;
          }
        }
      } catch {}

      if (rem <= 0) {
        hideClaimIndicator("RIGHT");
      }
    }
  }

  // ===========================================
  // PANEL POSITION UTILITIES
  // ===========================================

  function getPanelPos(panel) {
    let x = 0;
    let y = 0;

    try {
      const mm = UI.minimap;
      if (mm) {
        const mw = mm.contentwidth || 200;
        const mh = mm.contentheight || 200;
        x = (panel.actualxoffset || 0) / mw * 100;
        y = (panel.actualyoffset || 0) / mh * 100;
      }
    } catch (e) {
    }


    _posResult.x = x;
    _posResult.y = y;
    return _posResult;
  }

  function distSq(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return dx * dx + dy * dy;
  }

  // Prune stale _playerState entries not referenced by _lingerState
  function prunePlayerState() {
    const keys = Object.keys(_playerState);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!_lingerState[k]) {  // Don't prune if actively lingering
        delete _playerState[k];
      }
    }
  }

  // ===========================================
  // ENEMY LINGER SYSTEM (CS:GO-style "last seen")
  // ===========================================

  function showLinger(enemyId, btn) {
    if (_lingerState[enemyId]) return;
    if (!btn || !btn.IsValid?.()) return;

    try {
      const container = UI.minimapContainer;
      if (!container?.IsValid?.()) return;


      const mm = UI.minimap;
      const mw = container.contentwidth || 404;
      const mh = container.contentheight || 404;
      const inverted = mm?.IsValid?.() && mm.BHasClass?.("invert_map");

      let bx = (btn.actualxoffset || 0) + 4;
      let by = btn.actualyoffset || 0;

      if (inverted) {
        bx = mw - bx - 24;
        by = mh - by - 24;
      }

      btn.style.opacity = "0.5";

      const qId = "LingerQ_" + enemyId;
      let qLabel = container.FindChildTraverse(qId);
      if (!qLabel) {
        qLabel = $.CreatePanel("Label", container, qId);
        qLabel.AddClass("linger-question-child");
        qLabel.text = "?";
      }
      
      qLabel.style.position = bx + "px " + by + "px 0px";
      qLabel.AddClass("active");


      const hideHandle = $.Schedule(LINGER_DURATION, () => {
        hideLinger(enemyId);
      });

      _lingerState[enemyId] = {
        hideHandle: hideHandle,
        btn: btn,
        qLabel: qLabel
      };
    } catch (e) { }
  }


  function hideLinger(enemyId) {
    const state = _lingerState[enemyId];
    if (!state) return;

    try {
      if (state.btn?.IsValid?.()) {
        state.btn.style.opacity = null;
      }
      if (state.qLabel?.IsValid?.()) {
        state.qLabel.DeleteAsync(0);
      }
    } catch {}

    delete _lingerState[enemyId];
  }

  function cancelLinger(enemyId) {
    const state = _lingerState[enemyId];
    if (!state) return;

    try {
      $.CancelScheduled(state.hideHandle);
      if (state.btn?.IsValid?.()) {
        state.btn.style.opacity = null;
      }
      if (state.qLabel?.IsValid?.()) {
        state.qLabel.DeleteAsync(0);
      }
    } catch {}

    delete _lingerState[enemyId];
  }

  function clearAllLingers() {
    for (const id in _lingerState) {
      try { $.CancelScheduled(_lingerState[id].hideHandle); } catch {}
      try { _lingerState[id].btn?.style && (_lingerState[id].btn.style.opacity = null); } catch {}
      try { _lingerState[id].qLabel?.DeleteAsync?.(0); } catch {}
    }
    _lingerState = {};
  }


  function checkEnemyLinger(nowMs, snapshot) {
    const now = nowMs || Date.now();
    const snap = snapshot || collectMinimapSnapshot(now, false);
    const players = snap?.players || [];
    if (!players.length) return;

    perfMark("lingerChecks", now);

    try {
      for (let i = 0, len = players.length; i < len; i++) {
        const pl = players[i];
        if (!pl) continue;

        const id = pl.id || ("enemy_" + i);
        let ps = _playerState[id];
        let team = ps?.team || pl.team || 0;
        if (!team && pl.panel?.IsValid?.()) {
          team = isAlly(pl.panel) ? 1 : isEnemy(pl.panel) ? 2 : 0;
        }

        if (team !== 2) continue;

        const wasActive = ps?.wasActive ?? true;
        if (!ps) {
          ps = { x: 0, y: 0, deadTs: 0, wasActive: true, team: team };
          _playerState[id] = ps;
        } else {
          ps.team = team;
        }

        ps.wasActive = pl.isActive;
        ps.x = pl.xPct;
        ps.y = pl.yPct;

        if (pl.isDead) {
          ps.deadTs = now;
          cancelLinger(id);
          continue;
        }

        if (wasActive && !pl.isActive) {
          showLinger(id, pl.panel);
        } else if (!wasActive && pl.isActive) {
          cancelLinger(id);
        }
      }
    } catch {}
  }

  // ===========================================

  // PLAYER PROXIMITY DETECTION
  // ===========================================

  function getPlayersNearPowerup(mm, pwPos, nowMs) {
    _tmpTarget.x = pwPos.x;
    _tmpTarget.y = pwPos.y;
    _tmpTarget.minAllyDist = Infinity;
    _tmpTarget.minEnemyDist = Infinity;

    const snap = collectMinimapSnapshot(nowMs, false);
    const players = snap?.players || [];
    computeNearestForTargets(players, [_tmpTarget], 1, nowMs, false);

    _nearResult.ally = _tmpTarget.minAllyDist;
    _nearResult.enemy = _tmpTarget.minEnemyDist;
    return _nearResult;
  }

  // ===========================================
  // POWERUP SCANNING & MONITORING
  // ===========================================

  function scanPowerups(nowMs, snapshot, forceFreshSnapshot) {
    const mm = findMinimap();
    if (!mm) return;

    try {
      const now = nowMs || Date.now();
      const snap = snapshot || collectMinimapSnapshot(now, !!forceFreshSnapshot);
      const allPowerups = snap?.powerupSpawns || [];
      if (!allPowerups.length) return;

      const powerups = [];
      for (let i = 0, len = allPowerups.length; i < len; i++) {
        const pw = allPowerups[i];
        if (!pw?.isActive) continue;

        powerups.push({
          type: pw.type,
          x: pw.xPct,
          y: pw.yPct,
          panel: pw.panel,
          claimed: false,
          minAllyDist: Infinity,
          minEnemyDist: Infinity
        });
      }

      if (powerups.length === 0) return;

      powerups.sort((a, b) => a.x - b.x);
      clearGlows();

      const inverted = mm.BHasClass?.("invert_map");
      for (let i = 0, len = powerups.length; i < len; i++) {
        const base = i === 0 ? "LEFT" : "RIGHT";
        powerups[i].pos = inverted ? (base === "LEFT" ? "RIGHT" : "LEFT") : base;
        applyGlow(powerups[i].pos, powerups[i].type);
      }

      const p0 = powerups[0];
      const p1 = powerups[1] || p0;
      knownSpawnPos = inverted
        ? { left: { x: p1.x, y: p1.y }, right: { x: p0.x, y: p0.y } }
        : { left: { x: p0.x, y: p0.y }, right: { x: p1.x, y: p1.y } };

      if (pretrackActive) {
        const ptL = inverted ? pretrackData.right : pretrackData.left;
        const ptR = inverted ? pretrackData.left : pretrackData.right;

        powerups[0].minAllyDist = ptL.minAlly;
        powerups[0].minEnemyDist = ptL.minEnemy;

        if (powerups[1]) {
          powerups[1].minAllyDist = ptR.minAlly;
          powerups[1].minEnemyDist = ptR.minEnemy;
        }

        pretrackActive = false;
      }

      trackedPowerups = powerups;
      monitoringActive = true;
      buffResetTs = 0;
    } catch {}
  }


  function monitorPowerups(nowMs, snapshot) {
    if (trackedPowerups.length === 0) {
      monitoringActive = false;
      return;
    }

    const snap = snapshot || collectMinimapSnapshot(nowMs, false);
    const players = snap?.players || [];

    let allClaimed = true;
    let targetCount = 0;

    for (let i = 0, len = trackedPowerups.length; i < len; i++) {
      const p = trackedPowerups[i];
      if (p.claimed) continue;

      let stillActive = false;
      try {
        if (p.panel?.IsValid?.()) {
          stillActive = p.panel.BHasClass("active");
        }
      } catch {}

      if (stillActive) {
        allClaimed = false;
        continue;
      }

      _nearestTargets[targetCount++] = p;
    }

    if (targetCount > 0 && players.length > 0) {
      computeNearestForTargets(players, _nearestTargets, targetCount, nowMs, true);
    }

    for (let i = 0, len = trackedPowerups.length; i < len; i++) {
      const p = trackedPowerups[i];
      if (p.claimed) continue;

      let stillActive = false;
      try {
        if (p.panel?.IsValid?.()) {
          stillActive = p.panel.BHasClass("active");
        }
      } catch {}

      if (stillActive) {
        allClaimed = false;
      } else {
        const allyClose = p.minAllyDist <= CLAIM_RADIUS_SQ;
        const enemyClose = p.minEnemyDist <= CLAIM_RADIUS_SQ;
        const allyCloser = p.minAllyDist < p.minEnemyDist;
        const enemyClaimed = !(allyClose && allyCloser);

        clearSideGlow(p.pos);

        if (enemyClaimed) {
          applyEnemyClaim(p.pos);
        }

        showClaimIndicator(p.pos, enemyClaimed, p.type);
        p.claimed = true;
      }
    }

    _nearestTargets.length = 0;

    if (allClaimed) {
      clearGlows();
      monitoringActive = false;
      trackedPowerups = [];
    }
  }

  // ===========================================
  // PHASE MANAGEMENT
  // ===========================================

  function startPhase(t, now) {
    spawnWait = false;
    idx = t < 0 ? 0 : t > 3 ? 3 : t;
    counter = SEQ[idx].d;
    phaseStart = now;

    UI.rLab.text = fmt(counter);
    UI.rNum.text = SEQ[idx].n;
    setImg(idx);

    _lastRejuvClip = "";
    if (UI.rLabClip?.IsValid?.()) {
      UI.rLabClip.style.clip = "rect(0%,0%,100%,0%)";
      UI.rLabClip.text = "";
    }

    // Prune stale player state on phase transition
    prunePlayerState();
  }

  function startPhaseAuto(now) {
    spawnWait = false;

    let c = 0;
    for (let i = 0; i < 4; i++) {
      if (now < c + SEQ[i].d) {
        idx = i;
        phaseStart = c;
        counter = c + SEQ[i].d - now;
        UI.rLab.text = fmt(counter);
        UI.rNum.text = SEQ[i].n;
        setImg(i);
        return;
      }
      c += SEQ[i].d;
    }

    // After all phases, loop the last one
    const ld = SEQ[3].d;
    const w = (now - c) % BRIDGE_DUR % ld;
    idx = 3;
    phaseStart = now - w;
    counter = ld - w;
    UI.rLab.text = fmt(counter);
    UI.rNum.text = "3";
    setImg(3);
  }

  function showSpawn() {
    UI.rLab.text = "Spawn";
    UI.rNum.text = SEQ[idx].n;
    resetImg();
    UI.rImg.AddClass("white");
    spawnWait = true;
    lastFound = false;
    tick = TICK_FAST;
  }

  // ===========================================
  // BUFF MANAGEMENT
  // ===========================================

  function startBuff(now) {
    buffStart = now;
    buffCnt = REJUV_DUR;

    if (UI.rejuvBuff) {
      UI.rejuvBuff.RemoveClass("pop-in");
      UI.rejuvBuff.AddClass("pop-out");
      UI.rejuvBuff.style.opacity = "1";
    }

    if (UI.rejuvBuffTime) {
      UI.rejuvBuffTime.text = fmt(buffCnt);
    }
  }

  function endBuff() {
    buffStart = 0;
    buffCnt = 0;

    if (UI.rejuvBuff) {
      UI.rejuvBuff.RemoveClass("pop-out");
      UI.rejuvBuff.AddClass("pop-in");
      $.Schedule(0.5, () => {
        if (UI.rejuvBuff) {
          UI.rejuvBuff.style.opacity = "0";
        }
      });
    }
  }

  // ===========================================
  // STATE MANAGEMENT
  // ===========================================

  function startRun(now) {
    running = true;
    claimCnt = 0;
    lastFound = false;
    spawnWait = false;
    inHideout = false;
    lastRunChk = Date.now();
    lastScan = 0;
    trackedPowerups = [];
    monitoringActive = false;
    pretrackActive = false;
    _snapshotTs = 0;
    startPhaseAuto(now);

    // Prune stale player state when starting run
    prunePlayerState();
  }

  function reset(f) {
    if (hnd) {
      $.CancelScheduled(hnd);
      hnd = null;
    }

    if (f) {
      idx = 0;
      counter = 0;
      phaseStart = 0;
      claimCnt = 0;
      buffStart = 0;
      buffCnt = 0;
      lastSec = -1;
      lastGlobalSec = -1;
      spawnWait = false;
      lastFound = false;
      running = false;
      inHideout = true;
      trackedPowerups.length = 0;
      monitoringActive = false;
      pretrackActive = false;
      _playerCache = null;
      _playerCacheTs = 0;
      _playerState = {};
      _snapshotTs = 0;
      _minimapSnapshot.players.length = 0;
      _minimapSnapshot.powerupSpawns.length = 0;
      _minimapSnapshot.neutralCamps.length = 0;
      _minimapSnapshot.ts = 0;
      lastMinimapCollapseCheck = 0;
      lastMinimapReadabilityCheck = 0;
      lastNeutralScanCheck = 0;
      lastNeutralRenderCheck = 0;
      _nearestTargets.length = 0;
      _perfLastLogTs = 0;
      _perfCounters.snapshotSweeps = 0;
      _perfCounters.lingerChecks = 0;
      _perfCounters.neutralScans = 0;
      _perfCounters.proximityPasses = 0;

      clearGlows();
      clearClaimIndicators();
      clearAllLingers();
      clearNeutralRespawnTimers();

      if (UI.rLab) UI.rLab.text = fmt(SEQ[0].d);
      if (UI.rNum) UI.rNum.text = "1";

      resetImg();
      endBuff();

      _lastRejuvClip = "";
      _lastBuffClip = "";
      _lastBuffClipColor = "";

      if (UI.rLabClip?.IsValid?.()) {
        UI.rLabClip.style.clip = "rect(0%,0%,100%,0%)";
        UI.rLabClip.text = "";
      }

      if (UI.buffLabClip?.IsValid?.()) {
        UI.buffLabClip.style.clip = "rect(0%,100%,100%,100%)";
        UI.buffLabClip.style.color = "#ffffff";
        UI.buffLabClip.text = "";
      }
    }
  }

  // ===========================================
  // IMAGE STATE MANAGEMENT
  // ===========================================

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
    UI.rImg.RemoveClass("reverse");
    UI.rImg.RemoveClass("white");
  }

  // ===========================================
  // TIME UTILITIES
  // ===========================================

  function gTime(nowMs) {
    const n = nowMs || Date.now();

    // Return cached value if recent
    if (n - _tCacheTs < 200) return _tCache;

    let t = 0;

    // Try cached game time panel first
    if (_gameTimePanel?.IsValid?.()) {
      try {
        t = parseSec(_gameTimePanel.text);
      } catch {}
    }

    // Find game time panel if not cached
    if (!t) {
      try {
        const tb = UI.root.FindChildTraverse("TopBar");
        if (tb) {
          const a = tb.FindChildrenWithClassTraverse("GameTime");
          if (a?.[0]?.text) {
            _gameTimePanel = a[0];
            t = parseSec(a[0].text);
          }
        }
      } catch {}
    }

    if (t > 0) {
      _tCache = t;
      _tCacheTs = n;
    }

    return t;
  }

  function parseSec(t) {
    if (!t) return 0;

    const s = String(t);
    const ci = s.indexOf(":");
    if (ci < 0) return 0;

    let mm = 0;
    let ss = 0;
    let c;

    // Parse minutes
    for (let i = 0; i < ci; i++) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) {
        mm = mm * 10 + (c - 48);
      }
    }

    // Parse seconds
    for (let i = ci + 1, n = 0; i < s.length && n < 2; i++, n++) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) {
        ss = ss * 10 + (c - 48);
      } else {
        break;
      }
    }

    return mm * 60 + (ss > 59 ? ss % 60 : ss);
  }

  function isHideout() {
    if (!UI.hud?.BHasClass) return false;

    try {
      // Order by most common casing first for early exit
      return UI.hud.BHasClass("connectedToHideout") ||
             UI.hud.BHasClass("connectedtohideout") ||
             UI.hud.BHasClass("connectedToHideOut");
    } catch {}

    return false;
  }

  function fmt(s) {
    s = Math.max(0, s | 0);
    const m = (s / 60) | 0;
    const ss = s % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (ss < 10 ? "0" + ss : "" + ss);
  }

  function findRoot(p) {
    while (p.GetParent?.()) {
      p = p.GetParent();
    }
    return p;
  }

  // ===========================================
  // START
  // ===========================================

  boot();
})();
