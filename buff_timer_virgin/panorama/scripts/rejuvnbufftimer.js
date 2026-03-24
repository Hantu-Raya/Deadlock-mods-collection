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
  const REJUV_ICON_SRC = "s2r://panorama/images/hud/modifiers/icon_rejuvenator.svg";
  const NEUTRAL_BOT_ICON_SRC = "s2r://panorama/images/npcs/neutral_bot_psd.vtex";
  const NEUTRAL_TRANSITION_MS = 220;
  const NEUTRAL_BOT_START_SEC = 60;
  const NEUTRAL_BOT_END_SEC = 120;
  const NEUTRAL_BOT_PROGRESS_COLOR = "#00ff00";

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
  // Debug build defaults: keep alignment diagnostics on for repro machines.
  const DEBUG_NEUTRAL_ALIGN = true;
  const DEBUG_NEUTRAL_ALIGN_INTERVAL_MS = 750;
  const DEBUG_NEUTRAL_ALIGN_ONLY_WHEN_ISSUE = false;
  const DEBUG_NEUTRAL_ALIGN_ALWAYS_PRINT = false;
  const DEBUG_NEUTRAL_ALIGN_SCAN_LOG = true;
  const DEBUG_NEUTRAL_ALIGN_SCAN_DROP_VERBOSE = false;
  const DEBUG_NEUTRAL_ALIGN_SCAN_DROP_SAMPLE_LIMIT = 3;
  const DEBUG_NEUTRAL_ALIGN_STATE_DUMP = true;
  const DEBUG_NEUTRAL_ALIGN_TICK_INTERVAL_MS = 1000;
  const DEBUG_NEUTRAL_ALIGN_MAX_STATE_DUMP = 4;
  const DEBUG_NEUTRAL_ALIGN_ARM_ON_COOLDOWN = true;
  const DEBUG_NEUTRAL_ALIGN_ACTIVE_WINDOW_MS = 8000;
  const DEBUG_NEUTRAL_ALIGN_SCAN_LOG_MAX = 3;
  const DEBUG_NEUTRAL_ALIGN_KEY_LOG_MAX = 4;
  const DEBUG_NEUTRAL_ALIGN_TICK_LOG_MAX = 4;
  const DEBUG_NEUTRAL_ALIGN_PROBE_COUNT = 3;
  const NEUTRAL_STATE_PURGE_MS = 15000;
  const NEUTRAL_MATCH_RADIUS_SQ = 4;
  const NEUTRAL_RING_SIZE_PX = 18;
  const NEUTRAL_RING_THICKNESS_PX = 3;
  const NEUTRAL_ICON_COOLDOWN_OPACITY = 0.60;
  const NEUTRAL_RADIAL_START_DEG = 0;
  const NEUTRAL_RESPAWN_SECONDS = {
    neutral_weak: 85,
    neutral_medium: 290,
    neutral_large: 335,
    neutral_vault: 300
  };
  // Tier color map kept in code so visual intent survives context/compaction and stays easy to retune.
  const NEUTRAL_RING_THEME = {
    neutral_weak: {
      fill: "rgba(150, 214, 126, 0.98)",
      trackBorder: "rgba(63, 95, 55, 0.90)",
      trackBg: "rgba(18, 30, 16, 0.28)",
      text: "rgba(220, 247, 206, 0.98)"
    },
    neutral_medium: {
      fill: "rgba(237, 165, 72, 0.98)",
      trackBorder: "rgba(120, 78, 34, 0.90)",
      trackBg: "rgba(33, 20, 8, 0.28)",
      text: "rgba(255, 225, 183, 0.98)"
    },
    neutral_large: {
      fill: "rgba(238, 86, 76, 0.98)",
      trackBorder: "rgba(122, 36, 33, 0.92)",
      trackBg: "rgba(38, 11, 11, 0.30)",
      text: "rgba(255, 198, 190, 0.98)"
    },
    neutral_vault: {
      fill: "rgba(199, 122, 255, 0.98)",
      trackBorder: "rgba(92, 52, 122, 0.92)",
      trackBg: "rgba(26, 12, 36, 0.30)",
      text: "rgba(236, 209, 255, 0.98)"
    }
  };
  const NEUTRAL_RING_THEME_DEFAULT = NEUTRAL_RING_THEME.neutral_medium;
  // Keep explicit gameplay-oriented color notes in source so this survives context compaction.
  // Weak: green (low threat), Medium: orange (mid threat), Large: red (high threat), Vault: purple (special).
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
  let _neutralBotOverrideActive = false;
  let _neutralModeHnd = null;

  // DOM write guards - prevent redundant updates
  let _lastRejuvText = "";
  let _lastBuffText = "";
  let _lastRejuvBuffText = "";
  let _lastClaimTimerL = "";
  let _lastClaimTimerR = "";
  let _lastRejuvClip = "";
  let _lastRejuvClipColor = "";
  let _lastBuffClip = "";
  let _lastBuffClipColor = "";
  let _lastRejuvImageSrc = "";
  let _lastRingScaleL = -1;
  let _lastRingOpacityL = -1;
  let _lastRingScaleR = -1;
  let _lastRingOpacityR = -1;

  // Reusable objects to avoid GC
  const _posResult = { x: 0, y: 0 };
  const _nearestTargets = [];
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
  let _neutralCoordCache = {};
  let _alignBootLogged = false;
  let _alignLastTickLogMs = 0;
  let _alignDebugArmUntilMs = 0;
  let _alignDebugKey = "";
  let _alignScanLogsLeft = 0;
  let _alignKeyLogsLeft = 0;
  let _alignTickLogsLeft = 0;

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
    UI.rejuv = r.FindChildTraverse("Rejuv");
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

    if (DEBUG_NEUTRAL_ALIGN && !_alignBootLogged) {
      _alignBootLogged = true;
      $.Msg("[BT-ALIGN]", "boot", "enabled=1");
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
      const neutralBotActive = updateNeutralBotPhase(now);

      if (!neutralBotActive) {
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

  function safeMapCoord(v) {
    const n = Number(v);
    if (!isFinite(n)) return null;
    if (Math.abs(n) > 1000000) return null;
    return n;
  }

  function clampPct(v) {
    if (!isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  function safePanelExtent(v, fallback) {
    const n = Number(v);
    if (!isFinite(n) || n <= 0 || n > 512) return fallback;
    return n;
  }

  function collectMinimapSnapshot(nowMs, forceFresh) {
    const mm = findMinimap();
    if (!mm) return null;

    const now = nowMs || Date.now();
    const alignArmed = isNeutralAlignArmed(now);
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
    let neutralCacheHit = 0;
    let neutralCacheMiss = 0;
    let neutralInvalidCoord = 0;
    let neutralDropWeak = 0;
    let neutralDropMedium = 0;
    let neutralDropLarge = 0;
    let neutralDropVault = 0;
    const neutralDropSamples = [];
    const mmW = mm.contentwidth || 200;
    const mmH = mm.contentheight || 200;

    try {
      for (let i = 0, len = buttons.length; i < len; i++) {
        const btn = buttons[i];
        if (!btn?.IsValid?.() || !btn.BHasClass?.("map_button")) continue;

      if (btn.BHasClass("player")) {
        const actualX = safeMapCoord(btn.actualxoffset);
        const actualY = safeMapCoord(btn.actualyoffset);
        if (actualX === null || actualY === null) continue;
        const xPct = clampPct(actualX / mmW * 100);
        const yPct = clampPct(actualY / mmH * 100);

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

        entry.id = id;
        entry.panel = btn;
        entry.isActive = btn.BHasClass("active");
        entry.isDead = btn.BHasClass("playerdead");
        entry.team = team;
        entry.xPct = xPct;
        entry.yPct = yPct;
        entry.actualX = actualX;
        entry.actualY = actualY;
        playerCount++;
        continue;
      }

      if (btn.BHasClass("powerup_spawn")) {
        const actualX = safeMapCoord(btn.actualxoffset);
        const actualY = safeMapCoord(btn.actualyoffset);
        if (actualX === null || actualY === null) continue;
        const xPct = clampPct(actualX / mmW * 100);
        const yPct = clampPct(actualY / mmH * 100);

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

        entry.id = btn.id || ("powerup_" + i);
        entry.panel = btn;
        entry.isActive = btn.BHasClass("active");
        entry.type = type;
        entry.xPct = xPct;
        entry.yPct = yPct;
        entry.actualX = actualX;
        entry.actualY = actualY;
        powerupCount++;
        continue;
      }

    }
  } catch {}

  _minimapSnapshot.players.length = playerCount;
  _minimapSnapshot.powerupSpawns.length = powerupCount;
  _minimapSnapshot.neutralCamps.length = 0;
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

  function getNeutralRingId(key) {
    return "NeutralCooldownRing_" + key.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  function getNeutralRingTheme(type) {
    return NEUTRAL_RING_THEME[type] || NEUTRAL_RING_THEME_DEFAULT;
  }

  function neutralPosOnContainer(mapX, mapY, container, mm) {
    const mw = mm?.contentwidth || container.contentwidth || 404;
    const mh = mm?.contentheight || container.contentheight || 404;
    const mmOffsetX = mm?.actualxoffset || 0;
    const mmOffsetY = mm?.actualyoffset || 0;
    const inverted = mm?.IsValid?.() && mm.BHasClass?.("invert_map");

    let x = (mapX || 0) + 2;
    let y = (mapY || 0) + 2;

    if (inverted) {
      x = mw - x - 24;
      y = mh - y - 24;
    }

    _posResult.x = mmOffsetX + x;
    _posResult.y = mmOffsetY + y;
    return _posResult;
  }

  function clearNeutralRing(st) {
    if (!st) return;

    try {
      if (st.ringRoot?.IsValid?.()) {
        st.ringRoot.DeleteAsync(0);
      }
    } catch {}

    st.ringRoot = null;
    st.ringFill = null;
    st.lastClip = "";
    st.lastFillColor = "";
    st.lastTrackBorder = "";
    st.lastTrackBg = "";
    st.lastRingSize = -1;
    st.lastParentMode = "";
    st.lastPosX = -1;
    st.lastPosY = -1;
  }

  function clearNeutralDetailLabel(st) {
    if (!st) return;

    try {
      if (st.detailLabel?.IsValid?.()) {
        st.detailLabel.DeleteAsync(0);
      }
    } catch {}

    st.detailLabel = null;
    st.lastText = "";
    st.lastTextColor = "";
    st.lastTextPosX = -1;
    st.lastTextPosY = -1;
  }

  function isScoreboardOpen(mm) {
    try {
      if (mm?.IsValid?.() && mm.BHasClass?.("gScoreboardOpen")) return true;
      if (UI.root?.IsValid?.() && UI.root.BHasClass?.("gScoreboardOpen")) return true;
    } catch {}
    return false;
  }

  function hasAspectTag(root) {
    if (!root?.IsValid?.()) return "unknown";
    try {
      if (root.BHasClass?.("AspectRatio21x9")) return "21x9";
      if (root.BHasClass?.("AspectRatio16x10")) return "16x10";
      if (root.BHasClass?.("AspectRatio16x9")) return "16x9";
      if (root.BHasClass?.("AspectRatio4x3")) return "4x3";
    } catch {}
    return "other";
  }

  function armNeutralAlignWindow(nowMs, key) {
    const now = nowMs || Date.now();
    _alignDebugArmUntilMs = now + DEBUG_NEUTRAL_ALIGN_ACTIVE_WINDOW_MS;
    _alignDebugKey = key || "";
    _alignScanLogsLeft = DEBUG_NEUTRAL_ALIGN_SCAN_LOG_MAX;
    _alignKeyLogsLeft = DEBUG_NEUTRAL_ALIGN_KEY_LOG_MAX;
    _alignTickLogsLeft = DEBUG_NEUTRAL_ALIGN_TICK_LOG_MAX;
    _alignLastTickLogMs = 0;
  }

  function isNeutralAlignArmed(nowMs, key) {
    if (!DEBUG_NEUTRAL_ALIGN) return false;
    if (!DEBUG_NEUTRAL_ALIGN_ARM_ON_COOLDOWN) return true;

    const now = nowMs || Date.now();
    if (now > (_alignDebugArmUntilMs || 0)) return false;
    if (!key || !_alignDebugKey) return true;
    return key === _alignDebugKey;
  }

  function consumeAlignLogBudget(kind) {
    if (!DEBUG_NEUTRAL_ALIGN) return false;

    if (kind === "scan") {
      if (_alignScanLogsLeft <= 0) return false;
      _alignScanLogsLeft--;
      return true;
    }

    if (kind === "key") {
      if (_alignKeyLogsLeft <= 0) return false;
      _alignKeyLogsLeft--;
      return true;
    }

    if (kind === "tick") {
      if (_alignTickLogsLeft <= 0) return false;
      _alignTickLogsLeft--;
      return true;
    }

    return false;
  }

  function safeDebugStyle(styleValue) {
    if (styleValue === null || styleValue === undefined) return "auto";
    const s = String(styleValue);
    return s.length > 0 ? s : "auto";
  }

  function panelDebugSummary(panel) {
    if (!panel?.IsValid?.()) return "panel=none";

    let parentId = "none";
    try {
      const parent = panel.GetParent?.();
      if (parent?.IsValid?.()) parentId = parent.id || "noid";
    } catch {}

    let opacity = "auto";
    let visibility = "auto";
    try {
      opacity = safeDebugStyle(panel.style?.opacity);
      visibility = safeDebugStyle(panel.style?.visibility);
    } catch {}

    const isActive = panel.BHasClass?.("active") ? "1" : "0";
    const isWeak = panel.BHasClass?.("neutral_weak") ? "1" : "0";
    const isMedium = panel.BHasClass?.("neutral_medium") ? "1" : "0";
    const isLarge = panel.BHasClass?.("neutral_large") ? "1" : "0";
    const isVault = panel.BHasClass?.("neutral_vault") ? "1" : "0";

    return "panel=" + (panel.id || "noid") +
      "|parent=" + parentId +
      "|active=" + isActive +
      "|weak=" + isWeak +
      "|med=" + isMedium +
      "|large=" + isLarge +
      "|vault=" + isVault +
      "|op=" + opacity +
      "|vis=" + visibility;
  }

  function buildNeutralStateDump(maxCount) {
    const keys = Object.keys(_neutralRespawnState);
    if (!keys.length) return "none";
    const out = [];
    const cap = Math.max(1, maxCount | 0);

    for (let i = 0; i < keys.length && out.length < cap; i++) {
      const key = keys[i];
      const st = _neutralRespawnState[key];
      if (!st) continue;

      const hasPanel = st.panel?.IsValid?.() ? "1" : "0";
      const cooldownActive = (st.respawnEndMs > 0 || st.respawnEndGameSec > 0) ? "1" : "0";
      const pctX = clampPct(st.mapPctX || 0).toFixed(2);
      const pctY = clampPct(st.mapPctY || 0).toFixed(2);
      const mapX = (safeMapCoord(st.mapX) ?? -1).toFixed(1);
      const mapY = (safeMapCoord(st.mapY) ?? -1).toFixed(1);

      out.push(
        key + ":" +
        (st.type || "unknown") +
        "|cd=" + cooldownActive +
        "|hp=" + hasPanel +
        "|pm=" + (st.lastParentMode || "none") +
        "|pct=" + pctX + "," + pctY +
        "|xy=" + mapX + "," + mapY
      );
    }

    return out.join(" ; ");
  }

  function logNeutralAlign(st, key, nowMs, dbg) {
    if (!DEBUG_NEUTRAL_ALIGN || !st) return;
    const now = nowMs || Date.now();
    if (!isNeutralAlignArmed(now, key)) return;
    if (!DEBUG_NEUTRAL_ALIGN_ALWAYS_PRINT) {
      const last = st.lastAlignLogMs || 0;
      if (now - last < DEBUG_NEUTRAL_ALIGN_INTERVAL_MS) return;
    }
    if (!consumeAlignLogBudget("key")) return;
    st.lastAlignLogMs = now;

    const reasons = [];
    if (!dbg.hasLivePanel) reasons.push("no_live_panel");
    if (dbg.usingDefaultIconSize) reasons.push("default_icon_size");
    if (dbg.iconW <= 0 || dbg.iconH <= 0) reasons.push("invalid_icon_size");
    if (Math.abs(dbg.iconW - dbg.iconH) > 1) reasons.push("icon_not_square");
    if (Math.abs(dbg.mw - dbg.mh) > 1) reasons.push("container_not_square");
    if (dbg.fallbackDelta > 3) reasons.push("panel_vs_fallback_delta");
    if (Math.abs(dbg.pctDeltaX) > 3 || Math.abs(dbg.pctDeltaY) > 3) reasons.push("panel_vs_pct_delta");
    if (dbg.mmVsContainerDelta > 1) reasons.push("mm_container_size_delta");
    if (dbg.doubleInvertRisk) reasons.push("fallback_invert_double");
    if (dbg.scoreboardOpen) reasons.push("scoreboard_open");
    if (dbg.inverted) reasons.push("invert_map");
    if (dbg.enlargeEntry) reasons.push("enlarge_entry");

    if (DEBUG_NEUTRAL_ALIGN_ONLY_WHEN_ISSUE && reasons.length === 0) return;

    $.Msg(
      "[BT-ALIGN]",
      "key=", key,
      "type=", st.type,
      "reason=", reasons.length ? reasons.join("|") : "none",
      "asp=", dbg.aspect,
      "inv=", dbg.inverted ? "1" : "0",
      "sb=", dbg.scoreboardOpen ? "1" : "0",
      "live=", dbg.hasLivePanel ? "1" : "0",
      "src=", dbg.source,
      "size=", dbg.iconW.toFixed(2) + "x" + dbg.iconH.toFixed(2),
      "mm=", dbg.mmW.toFixed(2) + "x" + dbg.mmH.toFixed(2),
      "ct=", dbg.mw.toFixed(2) + "x" + dbg.mh.toFixed(2),
      "icon=", dbg.iconX.toFixed(2) + "," + dbg.iconY.toFixed(2),
      "center=", dbg.centerX.toFixed(2) + "," + dbg.centerY.toFixed(2),
      "ring=", dbg.px.toFixed(2) + "," + dbg.py.toFixed(2),
      "mapPct=", dbg.mapPctX.toFixed(2) + "," + dbg.mapPctY.toFixed(2),
      "pctPx=", dbg.pctX.toFixed(2) + "," + dbg.pctY.toFixed(2),
      "legacyFallback=", dbg.legacyFallbackX.toFixed(2) + "," + dbg.legacyFallbackY.toFixed(2),
      "fallbackCenter=", dbg.fallbackCenterX.toFixed(2) + "," + dbg.fallbackCenterY.toFixed(2),
      "fallbackDelta=", dbg.fallbackDelta.toFixed(2),
      "pctDelta=", dbg.pctDeltaX.toFixed(2) + "," + dbg.pctDeltaY.toFixed(2),
      panelDebugSummary(st.panel)
    );
  }

  function setNeutralIconDim(st, shouldDim) {
    if (!st) return;
    const panel = st.panel;
    if (!panel?.IsValid?.()) {
      if (DEBUG_NEUTRAL_ALIGN && shouldDim) {
        $.Msg("[BT-ALIGN]", "icon_dim_skip", "reason=panel_invalid", "type=", st.type || "unknown");
      }
      if (!shouldDim) st.iconDimApplied = false;
      return;
    }

    try {
      if (shouldDim) {
        if (!st.iconDimApplied) {
          panel.style.opacity = String(NEUTRAL_ICON_COOLDOWN_OPACITY);
          st.iconDimApplied = true;
          if (DEBUG_NEUTRAL_ALIGN) {
            $.Msg("[BT-ALIGN]", "icon_dim_apply", "opacity=", NEUTRAL_ICON_COOLDOWN_OPACITY, panelDebugSummary(panel));
          }
        }
      } else if (st.iconDimApplied) {
        panel.style.opacity = null;
        st.iconDimApplied = false;
        if (DEBUG_NEUTRAL_ALIGN) {
          $.Msg("[BT-ALIGN]", "icon_dim_clear", panelDebugSummary(panel));
        }
      }
    } catch {}
  }

  function clearNeutralTimerEntry(key, reason) {
    const st = _neutralRespawnState[key];
    if (!st) return;

    clearNeutralRing(st);
    clearNeutralDetailLabel(st);
    setNeutralIconDim(st, false);
    st.respawnEndGameSec = 0;
    st.durationMs = 0;

    if (DEBUG_NEUTRAL_TIMERS && reason) {
      $.Msg("[BT-NEUTRAL] clear key=", key, " reason=", reason);
    }

    delete _neutralRespawnState[key];
  }

  function resolveNeutralStateKey(neutralType, xPct, yPct, mapX, mapY, panel) {
    if (panel?.IsValid?.()) {
      const byPanelKeys = Object.keys(_neutralRespawnState);
      for (let i = 0; i < byPanelKeys.length; i++) {
        const k = byPanelKeys[i];
        const st = _neutralRespawnState[k];
        if (!st || st.type !== neutralType) continue;
        if (st.panel?.IsValid?.() && st.panel === panel) {
          return k;
        }
      }
    }

    const keys = Object.keys(_neutralRespawnState);
    let bestKey = null;
    let bestDist = Infinity;

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const st = _neutralRespawnState[k];
      if (!st || st.type !== neutralType) continue;

      const sx = safeMapCoord(st.mapX);
      const sy = safeMapCoord(st.mapY);
      const cx = safeMapCoord(mapX);
      const cy = safeMapCoord(mapY);
      let dx = 0;
      let dy = 0;
      if (sx !== null && sy !== null && cx !== null && cy !== null) {
        dx = sx - cx;
        dy = sy - cy;
      } else {
        dx = (st.mapPctX || 0) - xPct;
        dy = (st.mapPctY || 0) - yPct;
      }
      const d = dx * dx + dy * dy;

      if (d < bestDist) {
        bestDist = d;
        bestKey = k;
      }
    }

    // Pixel-space match allows stable pairing even when minimap width oscillates.
    if (bestKey && bestDist <= 36) {
      return bestKey;
    }

    _neutralStateSeq++;
    return "neutral_state_" + _neutralStateSeq;
  }

  function renderNeutralTimer(st, key, nowMs, gameNowSec, container, mm) {
    if (st.respawnEndMs <= 0 && st.respawnEndGameSec <= 0) {
      if (DEBUG_NEUTRAL_ALIGN) {
        $.Msg("[BT-ALIGN]", "render_skip", "key=", key, "reason=no_cooldown", "type=", st.type || "unknown");
      }
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconDim(st, false);
      st.durationMs = 0;
      return;
    }

    const durationMs = st.durationMs > 0
      ? st.durationMs
      : (NEUTRAL_RESPAWN_SECONDS[st.type] || 0) * 1000;

    if (durationMs <= 0) {
      if (DEBUG_NEUTRAL_ALIGN) {
        $.Msg("[BT-ALIGN]", "render_skip", "key=", key, "reason=invalid_duration", "type=", st.type || "unknown");
      }
      st.respawnEndMs = 0;
      st.respawnEndGameSec = 0;
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconDim(st, false);
      st.durationMs = 0;
      return;
    }

    if (!st.iconDimApplied) {
      setNeutralIconDim(st, true);
    }

    let ringRoot = st.ringRoot;
    const ringId = getNeutralRingId(key);
    if (!ringRoot?.IsValid?.()) {
      ringRoot = container.FindChildTraverse(ringId);
    }
    if (!ringRoot?.IsValid?.()) {
      ringRoot = $.CreatePanel("Panel", container, ringId);
      ringRoot.AddClass("neutral-cooldown-ring");
      ringRoot.hittest = false;
      ringRoot.hittestchildren = false;
      if (DEBUG_NEUTRAL_ALIGN) {
        $.Msg("[BT-ALIGN]", "ring_create", "key=", key, "id=", ringId, "container=", container.id || "noid");
      }
    }

    let ringFill = st.ringFill;
    const ringFillId = ringId + "_fill";
    if (!ringFill?.IsValid?.()) {
      ringFill = ringRoot.FindChildTraverse(ringFillId);
    }
    if (!ringFill?.IsValid?.()) {
      ringFill = $.CreatePanel("Panel", ringRoot, ringFillId);
      ringFill.AddClass("neutral-cooldown-ring-fill");
      ringFill.style.borderWidth = NEUTRAL_RING_THICKNESS_PX + "px";
      if (DEBUG_NEUTRAL_ALIGN) {
        $.Msg("[BT-ALIGN]", "ring_fill_create", "key=", key, "id=", ringFillId);
      }
    }

    const theme = getNeutralRingTheme(st.type);
    if (theme.fill !== st.lastFillColor) {
      ringFill.style.borderColor = theme.fill;
      st.lastFillColor = theme.fill;
    }
    if (theme.trackBorder !== st.lastTrackBorder) {
      ringRoot.style.borderColor = theme.trackBorder;
      st.lastTrackBorder = theme.trackBorder;
    }
    if (theme.trackBg !== st.lastTrackBg) {
      ringRoot.style.backgroundColor = theme.trackBg;
      st.lastTrackBg = theme.trackBg;
    }

    let iconLocalX = st.mapX || 0;
    let iconLocalY = st.mapY || 0;
    let iconW = st.panelW || 24;
    let iconH = st.panelH || 24;
    const iconPanel = st.panel;
    const hasLivePanel = !!iconPanel?.IsValid?.();
    let source = "panel";

    if (hasLivePanel) {
      const liveX = safeMapCoord(iconPanel.actualxoffset);
      const liveY = safeMapCoord(iconPanel.actualyoffset);
      if (liveX !== null) iconLocalX = liveX;
      if (liveY !== null) iconLocalY = liveY;
      iconW = safePanelExtent(iconPanel.actuallayoutwidth || iconPanel.contentwidth, iconW);
      iconH = safePanelExtent(iconPanel.actuallayoutheight || iconPanel.contentheight, iconH);
      st.panelW = iconW;
      st.panelH = iconH;
    } else {
      source = "fallback";
      const fallbackPos = neutralPosOnContainer(st.mapX, st.mapY, container, mm);
      iconLocalX = fallbackPos.x - (mm?.actualxoffset || 0);
      iconLocalY = fallbackPos.y - (mm?.actualyoffset || 0);
    }

    let usingDefaultIconSize = false;
    if (iconW <= 0) {
      iconW = 24;
      usingDefaultIconSize = true;
    }
    if (iconH <= 0) {
      iconH = 24;
      usingDefaultIconSize = true;
    }
    if (!hasLivePanel) {
      usingDefaultIconSize = true;
    }

    const mw = container.contentwidth || 404;
    const mh = container.contentheight || 404;
    const mmW = mm?.contentwidth || 0;
    const mmH = mm?.contentheight || 0;
    const mmOffsetX = mm?.actualxoffset || 0;
    const mmOffsetY = mm?.actualyoffset || 0;
    const inverted = mm?.IsValid?.() && mm.BHasClass?.("invert_map");
    if (inverted) {
      iconLocalX = mmW - iconLocalX - iconW;
      iconLocalY = mmH - iconLocalY - iconH;
    }

    const iconX = mmOffsetX + iconLocalX;
    const iconY = mmOffsetY + iconLocalY;
    const ringSize = Math.max(NEUTRAL_RING_SIZE_PX, Math.min(iconW, iconH));
    if (Math.abs((st.lastRingSize ?? -1) - ringSize) > 0.05) {
      ringRoot.style.width = ringSize + "px";
      ringRoot.style.height = ringSize + "px";
      st.lastRingSize = ringSize;
    }

    const centerX = iconX + iconW * 0.5;
    const centerY = iconY + iconH * 0.5;
    const px = centerX - ringSize * 0.5;
    const py = centerY - ringSize * 0.5;
    const iconParent = hasLivePanel && iconPanel?.IsValid?.() ? iconPanel.GetParent?.() : null;
    if (hasLivePanel && iconPanel?.IsValid?.() && iconParent?.IsValid?.()) {
      if (ringRoot.GetParent?.() !== iconParent) {
        ringRoot.SetParent(iconParent);
        st.lastPosX = -9999;
        st.lastPosY = -9999;
      }
      if (st.lastParentMode !== "icon_parent") {
        ringRoot.style.horizontalAlign = "left";
        ringRoot.style.verticalAlign = "top";
        st.lastParentMode = "icon_parent";
        st.lastPosX = -9999;
        st.lastPosY = -9999;
        if (DEBUG_NEUTRAL_ALIGN) {
          $.Msg("[BT-ALIGN]", "mode_switch", "key=", key, "mode=icon_parent");
        }
      }
      const parentX = safeMapCoord(iconPanel.actualxoffset) ?? 0;
      const parentY = safeMapCoord(iconPanel.actualyoffset) ?? 0;
      const localX = parentX + (iconW - ringSize) * 0.5;
      const localY = parentY + (iconH - ringSize) * 0.5;
      if (Math.abs((st.lastPosX ?? -9999) - localX) > 0.05 || Math.abs((st.lastPosY ?? -9999) - localY) > 0.05) {
        ringRoot.style.position = localX + "px " + localY + "px 0px";
        st.lastPosX = localX;
        st.lastPosY = localY;
      }
    } else if (hasLivePanel && iconPanel?.IsValid?.()) {
      if (ringRoot.GetParent?.() !== iconPanel) {
        ringRoot.SetParent(iconPanel);
        st.lastPosX = -9999;
        st.lastPosY = -9999;
      }
      if (st.lastParentMode !== "icon") {
        ringRoot.style.horizontalAlign = "center";
        ringRoot.style.verticalAlign = "center";
        st.lastParentMode = "icon";
        st.lastPosX = -9999;
        st.lastPosY = -9999;
        if (DEBUG_NEUTRAL_ALIGN) {
          $.Msg("[BT-ALIGN]", "mode_switch", "key=", key, "mode=icon");
        }
      }
      if (Math.abs((st.lastPosX ?? -9999)) > 0.05 || Math.abs((st.lastPosY ?? -9999)) > 0.05) {
        ringRoot.style.position = "0px 0px 0px";
        st.lastPosX = 0;
        st.lastPosY = 0;
      }
    } else {
      if (ringRoot.GetParent?.() !== container) {
        ringRoot.SetParent(container);
        st.lastPosX = -9999;
        st.lastPosY = -9999;
      }
      if (st.lastParentMode !== "container") {
        ringRoot.style.horizontalAlign = "left";
        ringRoot.style.verticalAlign = "top";
        st.lastParentMode = "container";
        st.lastPosX = -9999;
        st.lastPosY = -9999;
        if (DEBUG_NEUTRAL_ALIGN) {
          $.Msg("[BT-ALIGN]", "mode_switch", "key=", key, "mode=container");
        }
      }
      if (Math.abs((st.lastPosX ?? -9999) - px) > 0.05 || Math.abs((st.lastPosY ?? -9999) - py) > 0.05) {
        ringRoot.style.position = px + "px " + py + "px 0px";
        st.lastPosX = px;
        st.lastPosY = py;
      }
    }

    const now = nowMs || Date.now();
    const scoreboardOpen = isScoreboardOpen(mm);
    if (DEBUG_NEUTRAL_ALIGN) {
      const mapPctX = st.mapPctX || 0;
      const mapPctY = st.mapPctY || 0;
      const pctBaseX = mapPctX * 0.01 * mmW;
      const pctBaseY = mapPctY * 0.01 * mmH;
      const pctX = mmOffsetX + (inverted ? (mmW - pctBaseX - iconW) : pctBaseX);
      const pctY = mmOffsetY + (inverted ? (mmH - pctBaseY - iconH) : pctBaseY);
      const pctCenterX = pctX + iconW * 0.5;
      const pctCenterY = pctY + iconH * 0.5;

      const rawFallbackX = (st.mapX || 0) + 2;
      const rawFallbackY = (st.mapY || 0) + 2;
      const expectedFallbackX = mmOffsetX + (inverted ? (mmW - rawFallbackX - iconW) : rawFallbackX);
      const expectedFallbackY = mmOffsetY + (inverted ? (mmH - rawFallbackY - iconH) : rawFallbackY);
      const fallbackCenterX = expectedFallbackX + iconW * 0.5;
      const fallbackCenterY = expectedFallbackY + iconH * 0.5;

      const legacyFallbackPos = neutralPosOnContainer(st.mapX, st.mapY, container, mm);
      const mmVsContainerDelta = Math.max(Math.abs(mmW - mw), Math.abs(mmH - mh));
      const doubleInvertRisk = !hasLivePanel && inverted &&
        (Math.abs(iconX - expectedFallbackX) > 1 || Math.abs(iconY - expectedFallbackY) > 1);
      const enlargeEntry = !!(iconPanel?.IsValid?.() && iconPanel.BHasClass?.("enlarge_entry"));

      const dbg = {
        source: source,
        aspect: hasAspectTag(UI.root),
        hasLivePanel: hasLivePanel,
        usingDefaultIconSize: usingDefaultIconSize,
        iconW: iconW,
        iconH: iconH,
        iconX: iconX,
        iconY: iconY,
        centerX: centerX,
        centerY: centerY,
        px: px,
        py: py,
        mw: mw,
        mh: mh,
        mmW: mmW,
        mmH: mmH,
        mmVsContainerDelta: mmVsContainerDelta,
        inverted: !!inverted,
        scoreboardOpen: scoreboardOpen,
        enlargeEntry: enlargeEntry,
        mapPctX: mapPctX,
        mapPctY: mapPctY,
        pctX: pctX,
        pctY: pctY,
        legacyFallbackX: legacyFallbackPos.x || 0,
        legacyFallbackY: legacyFallbackPos.y || 0,
        fallbackCenterX: fallbackCenterX,
        fallbackCenterY: fallbackCenterY,
        fallbackDelta: Math.sqrt(Math.pow(centerX - fallbackCenterX, 2) + Math.pow(centerY - fallbackCenterY, 2)),
        pctDeltaX: centerX - pctCenterX,
        pctDeltaY: centerY - pctCenterY,
        doubleInvertRisk: doubleInvertRisk
      };
      logNeutralAlign(st, key, now, dbg);
    }

    let remainingMs = Math.max(0, st.respawnEndMs - now);
    if (gameNowSec > 0 && st.respawnEndGameSec > 0) {
      remainingMs = Math.max(0, (st.respawnEndGameSec - gameNowSec) * 1000);
      const syncedEndMs = now + remainingMs;
      if (Math.abs((st.respawnEndMs || 0) - syncedEndMs) > 750) {
        st.respawnEndMs = syncedEndMs;
      }
    } else if (gameNowSec > 0 && st.respawnEndGameSec <= 0 && st.respawnEndMs > 0) {
      st.respawnEndGameSec = gameNowSec + (remainingMs / 1000);
    }

    const pct = Math.max(0, Math.min(1, remainingMs / durationMs));
    const sweepDeg = (pct * 360).toFixed(2);
    const clip = "radial(50% 50%, " + NEUTRAL_RADIAL_START_DEG + "deg, " + sweepDeg + "deg)";
    if (clip !== st.lastClip) {
      ringFill.style.clip = clip;
      st.lastClip = clip;
    }

    st.ringRoot = ringRoot;
    st.ringFill = ringFill;

    const showDetailText = scoreboardOpen;
    if (showDetailText) {
      let detailLabel = st.detailLabel;
      const detailId = ringId + "_text";
      if (!detailLabel?.IsValid?.()) {
        detailLabel = container.FindChildTraverse(detailId);
      }
      if (!detailLabel?.IsValid?.()) {
        detailLabel = $.CreatePanel("Label", container, detailId);
        detailLabel.AddClass("neutral-cooldown-timer-detail");
        if (DEBUG_NEUTRAL_ALIGN) {
          $.Msg("[BT-ALIGN]", "detail_label_create", "key=", key, "id=", detailId);
        }
      }

      const textX = centerX - 18;
      const textY = py + ringSize + 1;
      if (Math.abs((st.lastTextPosX ?? -9999) - textX) > 0.05 || Math.abs((st.lastTextPosY ?? -9999) - textY) > 0.05) {
        detailLabel.style.position = textX + "px " + textY + "px 0px";
        st.lastTextPosX = textX;
        st.lastTextPosY = textY;
      }

      const text = fmt(Math.ceil(remainingMs / 1000));
      if (text !== st.lastText) {
        detailLabel.text = text;
        st.lastText = text;
      }
      if (theme.text !== st.lastTextColor) {
        detailLabel.style.color = theme.text;
        st.lastTextColor = theme.text;
      }
      st.detailLabel = detailLabel;
    } else if (st.detailLabel?.IsValid?.()) {
      if (DEBUG_NEUTRAL_ALIGN) {
        $.Msg("[BT-ALIGN]", "detail_label_clear", "key=", key, "reason=scoreboard_closed");
      }
      clearNeutralDetailLabel(st);
    }

    if (remainingMs <= 0) {
      st.respawnEndMs = 0;
      st.respawnEndGameSec = 0;
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconDim(st, false);
      st.durationMs = 0;
      if (DEBUG_NEUTRAL_TIMERS) {
        $.Msg("[BT-NEUTRAL] done key=", key, " type=", st.type);
      }
    }
  }

  function scanNeutralRespawnState(snapshot, nowMs, gameNowSec) {
    const now = nowMs || Date.now();
    const gameNow = gameNowSec > 0 ? gameNowSec : gTime(now);
    const camps = snapshot?.neutralCamps || [];
    const token = ++_neutralSweepToken;
    perfMark("neutralScans", now);

    try {
      for (let i = 0, len = camps.length; i < len; i++) {
        const camp = camps[i];
        if (!camp) continue;

        const key = resolveNeutralStateKey(camp.type, camp.xPct, camp.yPct, camp.actualX, camp.actualY, camp.panel);
        let st = _neutralRespawnState[key];
        const isActive = camp.isActive;
        const durationSec = NEUTRAL_RESPAWN_SECONDS[camp.type] || 0;

        if (!st) {
          st = {
            type: camp.type,
            wasActive: isActive,
            respawnEndMs: 0,
            respawnEndGameSec: 0,
            durationMs: 0,
            ringRoot: null,
            ringFill: null,
            lastClip: "",
            lastRingSize: -1,
            lastParentMode: "",
            lastFillColor: "",
            lastTrackBorder: "",
            lastTrackBg: "",
            detailLabel: null,
            lastText: "",
            lastTextColor: "",
            lastTextPosX: -1,
            lastTextPosY: -1,
            lastAlignLogMs: 0,
            panel: camp.panel || null,
            panelW: safePanelExtent(camp.panel?.actuallayoutwidth || camp.panel?.contentwidth, 24),
            panelH: safePanelExtent(camp.panel?.actuallayoutheight || camp.panel?.contentheight, 24),
            iconDimApplied: false,
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
          if (DEBUG_NEUTRAL_ALIGN && isNeutralAlignArmed(now, key)) {
            $.Msg(
              "[BT-ALIGN]",
              "state_create",
              "key=", key,
              "type=", camp.type,
              "active=", isActive ? "1" : "0",
              "mapPct=", (camp.xPct || 0).toFixed(2) + "," + (camp.yPct || 0).toFixed(2),
              panelDebugSummary(camp.panel)
            );
          }
        } else {
          st.type = camp.type;
        }

        if (st.panel !== camp.panel) {
          if (DEBUG_NEUTRAL_ALIGN && isNeutralAlignArmed(now, key)) {
            $.Msg(
              "[BT-ALIGN]",
              "panel_switch",
              "key=", key,
              "type=", camp.type,
              "from=", panelDebugSummary(st.panel),
              "to=", panelDebugSummary(camp.panel)
            );
          }
          setNeutralIconDim(st, false);
        }

        st.panel = camp.panel || null;
        if (st.panel?.IsValid?.()) {
          st.panelW = safePanelExtent(st.panel.actuallayoutwidth || st.panel.contentwidth, st.panelW || 24);
          st.panelH = safePanelExtent(st.panel.actuallayoutheight || st.panel.contentheight, st.panelH || 24);
        }
        st.mapPctX = camp.xPct;
        st.mapPctY = camp.yPct;
        st.mapX = camp.actualX;
        st.mapY = camp.actualY;
        st.lastSeenMs = now;
        st.sweepToken = token;

        if (st.wasActive && !isActive && durationSec > 0) {
          st.durationMs = durationSec * 1000;
          st.respawnEndMs = now + durationSec * 1000;
          st.respawnEndGameSec = gameNow > 0 ? (gameNow + durationSec) : 0;
          setNeutralIconDim(st, true);
          if (DEBUG_NEUTRAL_ALIGN) {
            armNeutralAlignWindow(now, key);
            $.Msg(
              "[BT-ALIGN]",
              "cooldown_start",
              "key=", key,
              "type=", camp.type,
              "hasPanel=", st.panel?.IsValid?.() ? "1" : "0",
              "mapPct=", (st.mapPctX || 0).toFixed(2) + "," + (st.mapPctY || 0).toFixed(2),
              panelDebugSummary(st.panel)
            );
          }
          if (DEBUG_NEUTRAL_TIMERS) {
            $.Msg("[BT-NEUTRAL] start key=", key, " type=", camp.type, " duration=", durationSec);
          }
        } else if (!st.wasActive && isActive) {
          st.respawnEndMs = 0;
          st.respawnEndGameSec = 0;
          st.durationMs = 0;
          clearNeutralRing(st);
          clearNeutralDetailLabel(st);
          setNeutralIconDim(st, false);
          if (DEBUG_NEUTRAL_ALIGN && isNeutralAlignArmed(now, key)) {
            $.Msg("[BT-ALIGN]", "cooldown_clear", "key=", key, "type=", camp.type);
          }
          if (DEBUG_NEUTRAL_TIMERS) {
            $.Msg("[BT-NEUTRAL] clear key=", key, " reason=active_again");
          }
        } else if (st.respawnEndMs > 0 || st.respawnEndGameSec > 0) {
          setNeutralIconDim(st, true);
        }

        st.wasActive = isActive;
      }

      for (const key in _neutralRespawnState) {
        const st = _neutralRespawnState[key];
        if (!st || st.sweepToken === token) continue;
        if (st.respawnEndMs > 0 || st.respawnEndGameSec > 0) continue;
        if (now - (st.lastSeenMs || 0) > NEUTRAL_STATE_PURGE_MS) {
          if (DEBUG_NEUTRAL_ALIGN && isNeutralAlignArmed(now, key)) {
            $.Msg("[BT-ALIGN]", "state_purge", "key=", key, "reason=stale", "type=", st.type || "unknown");
          }
          clearNeutralTimerEntry(key, "stale");
        }
      }
    } catch {
      if (DEBUG_NEUTRAL_TIMERS) {
        $.Msg("[BT-NEUTRAL][ERR] scan failed");
      }
    }
  }

  function renderNeutralRespawnTimers(nowMs, gameNowSec) {
    const mm = findMinimap();
    const container = UI.minimapContainer;

    const now = nowMs || Date.now();
    const alignArmed = isNeutralAlignArmed(now);
    const allowTickLog =
      DEBUG_NEUTRAL_ALIGN &&
      alignArmed &&
      (DEBUG_NEUTRAL_ALIGN_ALWAYS_PRINT || now - (_alignLastTickLogMs || 0) >= DEBUG_NEUTRAL_ALIGN_TICK_INTERVAL_MS);
    const statesCount = Object.keys(_neutralRespawnState).length;
    const aspect = hasAspectTag(UI.root);
    if (!mm || !container?.IsValid?.()) {
      if (allowTickLog && consumeAlignLogBudget("tick")) {
        _alignLastTickLogMs = now;
        const stateDump = DEBUG_NEUTRAL_ALIGN_STATE_DUMP ? buildNeutralStateDump(DEBUG_NEUTRAL_ALIGN_MAX_STATE_DUMP) : "disabled";
        $.Msg("[BT-ALIGN]", "tick asp=" + aspect + " mm=" + (mm?.IsValid?.() ? "1" : "0") + " container=" + (container?.IsValid?.() ? "1" : "0") + " states=" + statesCount + " active=0 probe=none dump=" + stateDump);
      }
      return;
    }

    const gameNow = gameNowSec > 0 ? gameNowSec : gTime(now);
    const mmW = mm.contentwidth || 0;
    const mmH = mm.contentheight || 0;
    const ctW = container.contentwidth || 0;
    const ctH = container.contentheight || 0;
    let activeTimerCount = 0;
    let sample = null;
    for (const key in _neutralRespawnState) {
      const st = _neutralRespawnState[key];
      if (!sample && st) {
        sample = { key: key, st: st };
      }
      if (!st || (st.respawnEndMs <= 0 && st.respawnEndGameSec <= 0)) continue;
      activeTimerCount++;
      if (sample && sample.st !== st) {
        sample = { key: key, st: st };
      }
      renderNeutralTimer(st, key, now, gameNow, container, mm);
    }

    if (allowTickLog && consumeAlignLogBudget("tick")) {
      _alignLastTickLogMs = now;
      let probeText = "none";
      if (sample?.st) {
        const st = sample.st;
        const hasPanel = !!st.panel?.IsValid?.();
        const panelX = hasPanel ? (safeMapCoord(st.panel.actualxoffset) ?? -1) : -1;
        const panelY = hasPanel ? (safeMapCoord(st.panel.actualyoffset) ?? -1) : -1;
        const panelW = hasPanel ? safePanelExtent(st.panel.actuallayoutwidth || st.panel.contentwidth, 0) : 0;
        const panelH = hasPanel ? safePanelExtent(st.panel.actuallayoutheight || st.panel.contentheight, 0) : 0;
        const cooldownActive = (st.respawnEndMs > 0 || st.respawnEndGameSec > 0) ? 1 : 0;
        const pctX = clampPct(st.mapPctX || 0);
        const pctY = clampPct(st.mapPctY || 0);
        const mapX = safeMapCoord(st.mapX) ?? 0;
        const mapY = safeMapCoord(st.mapY) ?? 0;
        probeText =
          "k=" + sample.key +
          "|t=" + (st.type || "unknown") +
          "|cd=" + cooldownActive +
          "|pm=" + (st.lastParentMode || "none") +
          "|hp=" + (hasPanel ? "1" : "0") +
          "|p=" + panelX.toFixed(1) + "," + panelY.toFixed(1) +
          "|sz=" + panelW.toFixed(1) + "x" + panelH.toFixed(1) +
          "|pct=" + pctX.toFixed(2) + "," + pctY.toFixed(2) +
          "|xy=" + mapX.toFixed(1) + "," + mapY.toFixed(1);
      }

      $.Msg(
        "[BT-ALIGN]",
        "tick asp=" + aspect +
        " mm=" + mmW + "x" + mmH +
        " ct=" + ctW + "x" + ctH +
        " states=" + statesCount +
        " active=" + activeTimerCount +
        " invert=" + (mm.BHasClass?.("invert_map") ? "1" : "0") +
        " probe=" + probeText +
        (DEBUG_NEUTRAL_ALIGN_STATE_DUMP ? " dump=" + buildNeutralStateDump(DEBUG_NEUTRAL_ALIGN_MAX_STATE_DUMP) : "")
      );
    }
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
      _neutralBotOverrideActive = false;
      if (_neutralModeHnd) {
        $.CancelScheduled(_neutralModeHnd);
        _neutralModeHnd = null;
      }
      _neutralCoordCache = {};
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
      if (UI.rLab) UI.rLab.text = fmt(SEQ[0].d);
      if (UI.rNum) UI.rNum.text = "1";

      exitNeutralMode(true);
      resetImg();
      setRejuvImage(REJUV_ICON_SRC);
      endBuff();

      _lastRejuvClip = "";
      _lastRejuvClipColor = "";
      _lastBuffClip = "";
      _lastBuffClipColor = "";
      _lastRejuvImageSrc = REJUV_ICON_SRC;

      if (UI.rLabClip?.IsValid?.()) {
        UI.rLabClip.style.clip = "rect(0%,0%,100%,0%)";
        UI.rLabClip.style.color = "#ffffff";
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

  function enterNeutralMode() {
    if (!UI.rejuv?.IsValid?.()) return;

    if (_neutralModeHnd) {
      $.CancelScheduled(_neutralModeHnd);
      _neutralModeHnd = null;
    }

    UI.rejuv.RemoveClass("neutral-exiting");
    UI.rejuv.AddClass("neutral-mode");
    UI.rejuv.AddClass("neutral-entering");
    _neutralModeHnd = $.Schedule(NEUTRAL_TRANSITION_MS / 1000, () => {
      if (UI.rejuv?.IsValid?.()) {
        UI.rejuv.RemoveClass("neutral-entering");
      }
      _neutralModeHnd = null;
    });
  }

  function exitNeutralMode(skipAnimation, onDone) {
    if (!UI.rejuv?.IsValid?.()) return;

    if (_neutralModeHnd) {
      $.CancelScheduled(_neutralModeHnd);
      _neutralModeHnd = null;
    }

    UI.rejuv.RemoveClass("neutral-entering");

    if (skipAnimation) {
      UI.rejuv.RemoveClass("neutral-exiting");
      UI.rejuv.RemoveClass("neutral-mode");
      return;
    }

    UI.rejuv.AddClass("neutral-exiting");
    _neutralModeHnd = $.Schedule(NEUTRAL_TRANSITION_MS / 1000, () => {
      if (UI.rejuv?.IsValid?.()) {
        UI.rejuv.RemoveClass("neutral-mode");
        UI.rejuv.RemoveClass("neutral-exiting");
      }
      if (onDone) {
        try {
          onDone();
        } catch {}
      }
      _neutralModeHnd = null;
    });
  }

  function setRejuvImage(src) {
    if (!UI.rImg?.IsValid?.()) return;
    if (src === _lastRejuvImageSrc) return;

    try {
      if (typeof UI.rImg.SetImage === "function") {
        UI.rImg.SetImage(src);
      } else {
        UI.rImg.src = src;
      }
      _lastRejuvImageSrc = src;
    } catch {}
  }

  function updateNeutralBotPhase(now) {
    const active = now >= NEUTRAL_BOT_START_SEC && now <= NEUTRAL_BOT_END_SEC;

    if (!active) {
      if (_neutralBotOverrideActive) {
        _neutralBotOverrideActive = false;
        exitNeutralMode(false, () => {
          setRejuvImage(REJUV_ICON_SRC);
          setImg(idx);
        });
        if (UI.rLabClip?.IsValid?.() && _lastRejuvClipColor !== "#ffffff") {
          UI.rLabClip.style.color = "#ffffff";
          _lastRejuvClipColor = "#ffffff";
        }
      }
      return false;
    }

    if (!_neutralBotOverrideActive) {
      _neutralBotOverrideActive = true;
      enterNeutralMode();
      setRejuvImage(NEUTRAL_BOT_ICON_SRC);
      resetImg();
    }

    const rem = Math.max(0, NEUTRAL_BOT_END_SEC - now);
    counter = rem;
    const t = fmt(rem);

    if (t !== _lastRejuvText) {
      UI.rLab.text = t;
      if (UI.rLabClip?.IsValid?.()) {
        UI.rLabClip.text = t;
      }
      _lastRejuvText = t;
    }

    const neutralPct = rem / (NEUTRAL_BOT_END_SEC - NEUTRAL_BOT_START_SEC);
    const p = Math.floor(neutralPct * 100);
    const neutralClip = "rect(0%," + p + "%,100%,0%)";

    if (neutralClip !== _lastRejuvClip && UI.rLabClip?.IsValid?.()) {
      UI.rLabClip.style.clip = neutralClip;
      _lastRejuvClip = neutralClip;
    }

    if (UI.rLabClip?.IsValid?.() && _lastRejuvClipColor !== NEUTRAL_BOT_PROGRESS_COLOR) {
      UI.rLabClip.style.color = NEUTRAL_BOT_PROGRESS_COLOR;
      _lastRejuvClipColor = NEUTRAL_BOT_PROGRESS_COLOR;
    }

    tick = TICK_FAST;
    return true;
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
