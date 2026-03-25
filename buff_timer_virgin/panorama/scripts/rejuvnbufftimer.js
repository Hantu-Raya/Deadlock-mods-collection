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
  const NEUTRAL_MEDIUM_START_SEC = 300;
  const NEUTRAL_MEDIUM_END_SEC = 360;
  const NEUTRAL_LARGE_START_SEC = 420;
  const NEUTRAL_LARGE_END_SEC = 480;
  const NEUTRAL_BOT_PROGRESS_COLOR = "#00ff00";
  const NEUTRAL_SMALL_BADGE_SRC = "s2r://panorama/images/minimap/neutral_small_psd.vtex";
  const NEUTRAL_MEDIUM_BADGE_SRC = "s2r://panorama/images/minimap/neutral_medium_psd.vtex";
  const NEUTRAL_LARGE_BADGE_SRC = "s2r://panorama/images/minimap/neutral_large_psd.vtex";
  const NEUTRAL_VAULT_BADGE_SRC = "s2r://panorama/images/minimap/neutral_vault_psd.vtex";

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
  const PLAYER_STATE_STALE_MS = 6000;
  const PLAYER_STATE_PRUNE_INTERVAL_MS = 3000;
  const BUTTON_CACHE_TTL = 800;
  const LINGER_DURATION = 5;
  const LINGER_CHECK_INTERVAL = 300;
  const MINIMAP_SNAPSHOT_INTERVAL_HOT_MS = 250;
  const MINIMAP_SNAPSHOT_INTERVAL_NORMAL_MS = 500;
  const MINIMAP_SNAPSHOT_INTERVAL_IDLE_MS = 750;
  const MINIMAP_COLLAPSE_INTERVAL_MS = 1000;
  const MINIMAP_READABILITY_CHECK_MS = 60000;
  const MINIMAP_DEBUG_SAMPLE_LIMIT = 6;
  const DEBUG_MINIMAP_COLLAPSE = false;
  const ENABLE_MINIMAP_COLLAPSE = false;
  const NEUTRAL_SCAN_INTERVAL_MS = 500;
  const NEUTRAL_RENDER_INTERVAL_MS = 250;
  const DEBUG_NEUTRAL_TIMERS = false;
  const DEBUG_PERF = false;
  const DEBUG_NEUTRAL_ALIGN = false;
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
  const NEUTRAL_RING_SIZE_PX = 24;
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
  let lastPlayerStatePruneCheck = 0;
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
  let _playerSeenToken = 0;
  let _stablePlayerKeySeq = 0;
  let _neutralBotOverrideActive = false;
  let _neutralMediumOverrideActive = false;
  let _neutralCardOverrideActive = false;
  let _neutralModeHnd = null;
  let _claimAnimHandleLeft = null;
  let _claimAnimHandleRight = null;
  let _buffFadeHnd = null;
  let _imgRotateHnd = null;

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
  let _neutralRespawnState = new Map();
  let _neutralStateSeq = 0;
  let _neutralSweepToken = 0;
  let _neutralCoordCache = {};
  let _lowTimeCacheCleared = false;
  let _minimapInvertCache = { ts: 0, minimap: null, inverted: false, teamId: 0 };
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
    minimapBox: null,
    scoreboardRoot: null,
    neutralOverlay: null,
    minimapContainer: null,
    glowLeft: null,
    glowRight: null,
    rLab: null,
    rLabClip: null,
    rNum: null,
    rImg: null,
    rejuv: null,
    buffLab: null,
    buffLabClip: null,
    rejuvFriendly: null,
    rejuvEnemy: null,
    claimLeft: null,
    claimRight: null,
    claimIconLeft: null,
    claimIconRight: null,
    claimRingLeft: null,
    claimRingRight: null,
    claimTimerLeft: null,
    claimTimerRight: null,
    spawnBadge: null,
    spawnBadge2: null,
    rejuvMiniCard: null,
    rejuvMiniTime: null
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
    UI.minimapBox = r.FindChildTraverse("minimap_container");
    UI.scoreboardRoot = r.FindChildTraverse("minimap_persp");
    UI.spawnBadge = r.FindChildTraverse("NeutralSpawnBadge");
    UI.spawnBadge2 = r.FindChildTraverse("NeutralSpawnBadge2");
    UI.rejuvMiniCard = r.FindChildTraverse("RejuvMiniCard");
    UI.rejuvMiniTime = r.FindChildTraverse("RejuvMiniTime");

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

  let _lastScoreboardOpen = false;

  function loop() {
    const rn = Date.now();
    const now = gTime(rn);
    let snapshot = null;
    const mm = findMinimap();
    const scoreboardOpen = isScoreboardOpen(mm);
    const scoreboardJustOpened = scoreboardOpen && !_lastScoreboardOpen;
    _lastScoreboardOpen = scoreboardOpen;
    maybeClearNeutralCachesForLowGameTime(now);

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
      const neutralMediumActive = updateNeutralMediumPhase(now);
      const neutralCardActive = updateNeutralCardPhase(now);

      if (!neutralBotActive && !neutralMediumActive && !neutralCardActive) {
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

      if (UI.rejuvMiniTime?.IsValid?.()) {
        const t = fmt(buffCnt);
        if (t !== _lastRejuvBuffText) {
          UI.rejuvMiniTime.text = t;
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

    if (rn - lastPlayerStatePruneCheck >= PLAYER_STATE_PRUNE_INTERVAL_MS) {
      lastPlayerStatePruneCheck = rn;
      prunePlayerState(rn, false);
    }

    // Check for enemy linger (fog of war)
    if (rn - lastLingerCheck >= getMinimapWorkInterval(rn)) {
      lastLingerCheck = rn;
      snapshot = snapshot || collectMinimapSnapshot(rn, false);
      checkEnemyLinger(rn, snapshot);
    }

    // Neutral camp respawn scan
    if (scoreboardJustOpened || rn - lastNeutralScanCheck >= NEUTRAL_SCAN_INTERVAL_MS) {
      lastNeutralScanCheck = rn;
      snapshot = snapshot || collectMinimapSnapshot(rn, false);
      if (snapshot) scanNeutralRespawnState(snapshot, rn, now);
    }

    // Neutral camp respawn render
    if (scoreboardJustOpened || rn - lastNeutralRenderCheck >= NEUTRAL_RENDER_INTERVAL_MS) {
      lastNeutralRenderCheck = rn;
      renderNeutralRespawnTimers(rn, now, scoreboardOpen);
    }

    // Mini rejuv card: visible during neutral override phase OR buff active
    if (UI.rejuvMiniCard?.IsValid?.()) {
      const neutralOverride = _neutralBotOverrideActive || _neutralMediumOverrideActive || _neutralCardOverrideActive;
      const buffActive = buffStart > 0;
      const miniActive = neutralOverride || buffActive;
      UI.rejuvMiniCard.SetHasClass("active", miniActive);
      UI.rejuvMiniCard.SetHasClass("buff-active", buffActive && !neutralOverride);
      // During neutral override the main rejuv label is not updated —
      // compute the countdown directly from phaseStart.
      if (neutralOverride && !buffActive && UI.rejuvMiniTime?.IsValid?.()) {
        const safeIdx = (idx >= 0 && idx < SEQ.length) ? idx : 0;
        const miniRem = Math.max(0, SEQ[safeIdx].d - (now - phaseStart));
        const miniText = fmt(miniRem);
        if (miniText !== UI.rejuvMiniTime.text) {
          UI.rejuvMiniTime.text = miniText;
        }
      }
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

  function safePanelExtent(v, fallback, maxVal) {
    const n = Number(v);
    const cap = maxVal || 512;
    if (!isFinite(n) || n <= 0 || n > cap) return fallback;
    return n;
  }

  function setPanelClass(panel, className, enabled) {
    if (!panel?.IsValid?.()) return;
    const shouldHave = !!enabled;
    let hasClass = false;
    try { hasClass = !!panel.BHasClass?.(className); } catch { hasClass = false; }
    if (hasClass !== shouldHave) panel.SetHasClass(className, shouldHave);
  }

  function resolveMinimapReferenceSize(panel) {
    const reference = panel?.IsValid?.() ? panel : null;
    const width = safePanelExtent(
      reference?.actuallayoutwidth || reference?.contentwidth,
      1512, 8192
    );
    const height = safePanelExtent(
      reference?.actuallayoutheight || reference?.contentheight,
      862, 8192
    );
    return { width, height };
  }

  function fmtSeconds(seconds) {
    const s = Math.max(0, seconds | 0);
    if (s >= 60) {
      const m = (s / 60) | 0;
      const ss = s % 60;
      return m + ":" + (ss < 10 ? "0" + ss : "" + ss);
    }
    if (s >= 10) return s + "s";
    return String(s);
  }

  function clearNeutralCoordCache() {
    for (const key of Object.keys(_neutralCoordCache)) {
      delete _neutralCoordCache[key];
    }
  }

  function clearMinimapInvertCache() {
    if (_minimapInvertCache) {
      _minimapInvertCache.ts = 0;
      _minimapInvertCache.minimap = null;
      _minimapInvertCache.inverted = false;
      _minimapInvertCache.teamId = 0;
    }
  }

  function updateMinimapInvertCache(mm, nowMs) {
    const now = nowMs || Date.now();
    if (_minimapInvertCache.minimap === mm && now - _minimapInvertCache.ts < 750) {
      return _minimapInvertCache;
    }
    let inverted = false;
    let teamId = 0;
    try {
      inverted = !!(mm?.IsValid?.() && mm.BHasClass?.("invert_map"));
      if (!inverted && UI.minimapContainer?.IsValid?.()) {
        inverted = !!UI.minimapContainer.BHasClass?.("invert_map");
      }
    } catch {}
    _minimapInvertCache = { ts: now, minimap: mm, inverted, teamId };
    return _minimapInvertCache;
  }

  function clearNeutralRuntimeCaches() {
    clearNeutralRespawnTimers();
    clearNeutralCoordCache();
    clearMinimapInvertCache();
    _minimapSnapshot.neutralCamps.length = 0;
    _minimapSnapshot.ts = 0;
    _snapshotTs = 0;
    lastNeutralScanCheck = 0;
    lastNeutralRenderCheck = 0;
  }

  function maybeClearNeutralCachesForLowGameTime(gameNowSec) {
    if (!Number.isFinite(gameNowSec) || gameNowSec < 0) return;
    if (gameNowSec < 10) {
      if (_lowTimeCacheCleared) return;
      clearNeutralRuntimeCaches();
      _lowTimeCacheCleared = true;
      return;
    }
    _lowTimeCacheCleared = false;
  }

  function hasOwnEntries(obj) {
    for (const key in obj) {
      return true;
    }
    return false;
  }

  function hasActiveClaimIndicators() {
    return _claimStartLeft > 0 || _claimStartRight > 0;
  }

  function getMinimapWorkInterval(nowMs) {
    const now = nowMs || Date.now();

    if (pretrackActive || monitoringActive || hasActiveClaimIndicators()) {
      return MINIMAP_SNAPSHOT_INTERVAL_HOT_MS;
    }

    if (buffResetTs > 0 && now - buffResetTs < POWERUP_LINGER) {
      return MINIMAP_SNAPSHOT_INTERVAL_HOT_MS;
    }

    if (hasOwnEntries(_lingerState)) {
      return MINIMAP_SNAPSHOT_INTERVAL_NORMAL_MS;
    }

    return MINIMAP_SNAPSHOT_INTERVAL_IDLE_MS;
  }

  function getStablePlayerKey(btn, fallbackIndex) {
    if (!btn?.IsValid?.()) {
      return "player_fallback_" + fallbackIndex;
    }

    try {
      const rawId = btn.id;
      if (rawId && String(rawId).length > 0) {
        return rawId;
      }

      if (btn.__btStablePlayerKey) {
        return btn.__btStablePlayerKey;
      }

      _stablePlayerKeySeq++;
      const stableKey = "player_panel_" + _stablePlayerKeySeq;
      btn.__btStablePlayerKey = stableKey;
      return stableKey;
    } catch {}

    _stablePlayerKeySeq++;
    return "player_panel_" + _stablePlayerKeySeq;
  }

  function markPlayerSeen(key, team, nowMs, token) {
    let ps = _playerState[key];
    if (!ps) {
      ps = {
        x: 0,
        y: 0,
        deadTs: 0,
        wasActive: true,
        team: team || 0,
        lastSeenMs: 0,
        seenToken: 0
      };
      _playerState[key] = ps;
    } else if (team) {
      ps.team = team;
    }

    ps.lastSeenMs = nowMs || Date.now();
    if (token !== undefined && token !== null) {
      ps.seenToken = token;
    }

    return ps;
  }

  function collectMinimapSnapshot(nowMs, forceFresh) {
    const mm = findMinimap();
    if (!mm) return null;

    const now = nowMs || Date.now();
    const intervalMs = getMinimapWorkInterval(now);
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
    const mmGeom = resolveMinimapReferenceSize(mm);
    const mmW = mmGeom.width;
    const mmH = mmGeom.height;
    const playerSeenToken = ++_playerSeenToken;

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

        const id = getStablePlayerKey(btn, i);
        const ps = markPlayerSeen(id, 0, now, playerSeenToken);
        let team = ps?.team || 0;
        if (!team) {
          team = isAlly(btn) ? 1 : isEnemy(btn) ? 2 : 0;
          ps.team = team;
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

      {
        const kind = getNeutralType(btn);
        if (kind) {
          const actualX = safeMapCoord(btn.actualxoffset);
          const actualY = safeMapCoord(btn.actualyoffset);
          if (actualX !== null && actualY !== null) {
            const xPct = clampPct(actualX / mmW * 100);
            const yPct = clampPct(actualY / mmH * 100);

            let entry = _minimapSnapshot.neutralCamps[neutralCount];
            if (!entry) {
              entry = { id: "", panel: null, isActive: false, type: "", xPct: 0, yPct: 0, actualX: 0, actualY: 0 };
              _minimapSnapshot.neutralCamps[neutralCount] = entry;
            }

            entry.id = btn.id || ("neutral_" + neutralCount);
            entry.panel = btn;
            entry.isActive = btn.BHasClass("active");
            entry.type = kind;
            entry.xPct = xPct;
            entry.yPct = yPct;
            entry.actualX = actualX;
            entry.actualY = actualY;
            neutralCount++;
          }
        }
      }
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

      const id = pl.id || getStablePlayerKey(pl.panel, i);
      const ps = markPlayerSeen(id, pl.team || 0, now, _playerSeenToken);

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
      if (st.ringRoot?.IsValid?.()) st.ringRoot.DeleteAsync(0);
    } catch {}
    st.ringRoot = null;
    st.ringFill = null;
    st.lastClip = "";
    st.lastTrackBorder = "";
    st.lastTrackBg = "";
    st.lastRingSize = -1;
    st.lastPosX = -1;
    st.lastPosY = -1;
    st.lastOpacity = "";
    st.ringVisible = true;
  }

  function clearNeutralDetailLabel(st) {
    if (!st) return;
    try {
      if (st.detailLabel?.IsValid?.()) st.detailLabel.DeleteAsync(0);
    } catch {}
    st.detailLabel = null;
    st.lastText = "";
    st.lastTextColor = "";
    st.lastTextPosX = -1;
    st.lastTextPosY = -1;
    st.lastTextOpacity = "";
  }

  function isScoreboardOpen(mm) {
    try {
      if (UI.scoreboardRoot?.IsValid?.() && UI.scoreboardRoot.BHasClass?.("gScoreboardOpen")) return true;
      if (UI.minimapBox?.IsValid?.() && UI.minimapBox.BHasClass?.("gScoreboardOpen")) return true;
      if (UI.minimapContainer?.IsValid?.() && UI.minimapContainer.BHasClass?.("gScoreboardOpen")) return true;
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
    if (!_neutralRespawnState.size) return "none";
    const out = [];
    const cap = Math.max(1, maxCount | 0);

    for (const [key, st] of _neutralRespawnState.entries()) {
      if (out.length >= cap) break;
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

  function setNeutralIconOpacity(st, opacityVal) {
    if (!st?.panel?.IsValid?.()) return;
    try {
      if (opacityVal === null) {
        if (st.lastIconOpacity !== null) {
          st.panel.style.opacity = null;
          st.lastIconOpacity = null;
        }
        return;
      }
      const opStr = String(opacityVal);
      if (st.lastIconOpacity !== opStr) {
        st.panel.style.opacity = opStr;
        st.lastIconOpacity = opStr;
      }
    } catch {}
  }

  function clearNeutralTimerEntry(key, st) {
    if (!st) st = _neutralRespawnState.get(key);
    if (!st) return;
    clearNeutralRing(st);
    clearNeutralDetailLabel(st);
    clearNeutralAnchor(st);
    setNeutralIconOpacity(st, null);
    st.respawnEndMs = 0;
    st.respawnEndGameSec = 0;
    st.durationMs = 0;
    _neutralRespawnState.delete(key);
  }

  function clearNeutralAnchor(st) {
    if (!st) return;
    try {
      if (st.anchorRoot?.IsValid?.()) st.anchorRoot.DeleteAsync(0);
    } catch {}
    st.anchorRoot = null;
  }

  function resolveNeutralStateKey(neutralType, xPct, yPct, mapX, mapY, panel) {
    if (panel?.IsValid?.()) {
      for (const [key, st] of _neutralRespawnState.entries()) {
        if (!st || st.type !== neutralType) continue;
        if (st.panel?.IsValid?.() && st.panel === panel) return key;
      }
    }

    let bestKey = null;
    let bestDist = Infinity;

    for (const [key, st] of _neutralRespawnState.entries()) {
      if (!st || st.type !== neutralType) continue;

      const sx = safeMapCoord(st.mapX);
      const sy = safeMapCoord(st.mapY);
      const cx = safeMapCoord(mapX);
      const cy = safeMapCoord(mapY);
      let dx;
      let dy;

      if (sx !== null && sy !== null && cx !== null && cy !== null) {
        dx = sx - cx;
        dy = sy - cy;
      } else {
        dx = (st.mapPctX || 0) - xPct;
        dy = (st.mapPctY || 0) - yPct;
      }

      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = key;
      }
    }

    if (bestKey && bestDist <= 36) return bestKey;

    _neutralStateSeq++;
    return "neutral_state_" + _neutralStateSeq;
  }

  function createState(camp, now, token) {
    return {
      type: camp.type,
      wasActive: camp.isActive,
      respawnEndMs: 0,
      respawnEndGameSec: 0,
      durationMs: 0,
      ringRoot: null,
      ringFill: null,
      detailLabel: null,
      anchorRoot: null,
      panel: camp.panel || null,
      panelW: safePanelExtent(camp.panel?.actuallayoutwidth || camp.panel?.contentwidth, 24),
      panelH: safePanelExtent(camp.panel?.actuallayoutheight || camp.panel?.contentheight, 24),
      mapPctX: camp.xPct,
      mapPctY: camp.yPct,
      anchorPctX: Number.isFinite(camp.xPct) ? camp.xPct : null,
      anchorPctY: Number.isFinite(camp.yPct) ? camp.yPct : null,
      mapX: camp.actualX,
      mapY: camp.actualY,
      lastSeenMs: now,
      sweepToken: token,
      lastRingSize: -1,
      lastPosX: -1,
      lastPosY: -1,
      lastOpacity: "",
      lastClip: "",
      lastTrackBorder: "",
      lastTrackBg: "",
      lastText: "",
      lastTextColor: "",
      lastTextPosX: -1,
      lastTextPosY: -1,
      lastTextOpacity: "",
      lastIconOpacity: "",
      ringVisible: true
    };
  }

  function purgeStaleNeutralStates(now, token) {
    for (const [key, st] of _neutralRespawnState.entries()) {
      if (!st || st.sweepToken === token) continue;
      if (st.respawnEndMs > 0 || st.respawnEndGameSec > 0) continue;
      if (now - (st.lastSeenMs || 0) > NEUTRAL_STATE_PURGE_MS) {
        clearNeutralTimerEntry(key, st);
      }
    }
  }

  function ensureNeutralOverlay(container) {
    if (UI.neutralOverlay?.IsValid?.()) return UI.neutralOverlay;
    if (!container?.IsValid?.()) return null;

    const overlayId = "NeutralCooldownOverlayLayer";
    let overlay = null;
    try { overlay = container.FindChildTraverse(overlayId); } catch {}

    if (!overlay?.IsValid?.()) {
      overlay = $.CreatePanel("Panel", container, overlayId);
      overlay.hittest = false;
      overlay.hittestchildren = false;
      overlay.style.position = "0px 0px 0px";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.overflow = "noclip";
      overlay.style.zIndex = "2000";
    }

    UI.neutralOverlay = overlay;
    return overlay;
  }

  function ensureAnchorRoot(layer, st, key, themeInfo) {
    const anchorId = getNeutralRingId(key) + "_anchor";
    let anchorRoot = st.anchorRoot;

    if (!anchorRoot?.IsValid?.()) {
      try { anchorRoot = layer.FindChildTraverse(anchorId); } catch {}
    }
    if (!anchorRoot?.IsValid?.()) {
      anchorRoot = $.CreatePanel("Panel", layer, anchorId);
      anchorRoot.AddClass("neutral-cooldown-anchor");
      anchorRoot.hittest = false;
      anchorRoot.hittestchildren = false;
      anchorRoot.style.position = "0px 0px 0px";
      anchorRoot.style.width = "100%";
      anchorRoot.style.height = "100%";
      anchorRoot.style.overflow = "noclip";
      anchorRoot.style.zIndex = "2000";
    } else if (anchorRoot.GetParent?.() !== layer) {
      anchorRoot.SetParent(layer);
    }

    const inverted = !!themeInfo?.inverted;
    setPanelClass(anchorRoot, "invert_map", inverted);
    setPanelClass(anchorRoot, "theme-inverted", inverted);
    setPanelClass(anchorRoot, "theme-standard", !inverted);

    st.anchorRoot = anchorRoot;
    return anchorRoot;
  }

  function ensureRingRoot(layer, st, key, ringSize, ringPosX, ringPosY) {
    const ringId = getNeutralRingId(key);
    let ringRoot = st.ringRoot;

    if (!ringRoot?.IsValid?.()) {
      try { ringRoot = layer.FindChildTraverse(ringId); } catch {}
    }
    if (!ringRoot?.IsValid?.()) {
      ringRoot = $.CreatePanel("Panel", layer, ringId);
      ringRoot.AddClass("neutral-cooldown-ring");
      ringRoot.hittest = false;
      ringRoot.hittestchildren = false;
      ringRoot.style.horizontalAlign = "left";
      ringRoot.style.verticalAlign = "top";
      ringRoot.style.zIndex = "2001";
    } else if (ringRoot.GetParent?.() !== layer) {
      ringRoot.SetParent(layer);
    }
    ringRoot.style.backgroundColor = "transparent";
    ringRoot.style.borderWidth = "0px";
    ringRoot.style.borderColor = "transparent";
    ringRoot.style.clip = null;

    if (Math.abs((st.lastRingSize ?? -1) - ringSize) > 0.05) {
      ringRoot.style.width = ringSize + "px";
      ringRoot.style.height = ringSize + "px";
      st.lastRingSize = ringSize;
    }

    if (Math.abs((st.lastPosX ?? -9999) - ringPosX) > 0.05 || Math.abs((st.lastPosY ?? -9999) - ringPosY) > 0.05) {
      ringRoot.style.position = ringPosX.toFixed(2) + "% " + ringPosY.toFixed(2) + "% 0px";
      st.lastPosX = ringPosX;
      st.lastPosY = ringPosY;
    }

    if (!st.ringVisible) {
      ringRoot.style.visibility = null;
      st.ringVisible = true;
    }

    st.ringRoot = ringRoot;
    return ringRoot;
  }

  function ensureRingFill(st, ringRoot, key) {
    const ringId = getNeutralRingId(key);
    const fillId = ringId + "_fill";
    let ringFill = st.ringFill;

    if (!ringFill?.IsValid?.()) {
      try { ringFill = ringRoot.FindChildTraverse(fillId); } catch {}
    }
    if (!ringFill?.IsValid?.()) {
      ringFill = $.CreatePanel("Panel", ringRoot, fillId);
      ringFill.AddClass("neutral-cooldown-ring-fill");
    }
    ringFill.style.position = "0px 0px 0px";
    ringFill.style.width = "100%";
    ringFill.style.height = "100%";

    st.ringFill = ringFill;
    return ringFill;
  }

  function ensureDetailLabel(layer, st, key) {
    const ringId = getNeutralRingId(key);
    const labelId = ringId + "_text";
    let detailLabel = st.detailLabel;

    if (!detailLabel?.IsValid?.()) {
      try { detailLabel = layer.FindChildTraverse(labelId); } catch {}
    }
    if (!detailLabel?.IsValid?.()) {
      detailLabel = $.CreatePanel("Label", layer, labelId);
      detailLabel.AddClass("neutral-cooldown-timer-detail");
    } else if (detailLabel.GetParent?.() !== layer) {
      detailLabel.SetParent(layer);
    }

    detailLabel.hittest = false;
    detailLabel.hittestchildren = false;
    detailLabel.style.visibility = null;

    st.detailLabel = detailLabel;
    return detailLabel;
  }

  function renderNeutralTimer(st, key, nowMs, gameNowSec, layer, renderCtx) {
    if (st.respawnEndMs <= 0 && st.respawnEndGameSec <= 0) {
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconOpacity(st, null);
      st.durationMs = 0;
      return;
    }

    const durationMs = st.durationMs > 0
      ? st.durationMs
      : (NEUTRAL_RESPAWN_SECONDS[st.type] || 0) * 1000;

    if (durationMs <= 0) {
      st.respawnEndMs = 0;
      st.respawnEndGameSec = 0;
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconOpacity(st, null);
      st.durationMs = 0;
      return;
    }

    const iconPanel = st.panel;
    const hasLivePanel = !!iconPanel?.IsValid?.();
    const mmW = renderCtx?.mmW || 0;
    const mmH = renderCtx?.mmH || 0;
    const offsetX = renderCtx?.offsetX || 0;
    const offsetY = renderCtx?.offsetY || 0;
    let iconW = st.panelW || 24;
    let iconH = st.panelH || 24;
    let ringPosX = 0;
    let ringPosY = 0;
    let textPosX = 0;
    let textPosY = 0;

    if (hasLivePanel) {
      iconW = safePanelExtent(iconPanel.actuallayoutwidth || iconPanel.contentwidth, iconW);
      iconH = safePanelExtent(iconPanel.actuallayoutheight || iconPanel.contentheight, iconH);
      st.panelW = iconW;
      st.panelH = iconH;
    }

    const ringSize = NEUTRAL_RING_SIZE_PX;

    let livePctX = null;
    let livePctY = null;
    if (hasLivePanel) {
      const liveX = safeMapCoord(iconPanel.actualxoffset);
      const liveY = safeMapCoord(iconPanel.actualyoffset);
      if (mmW > 0 && liveX !== null) livePctX = clampPct(((liveX + offsetX) / mmW) * 100);
      if (mmH > 0 && liveY !== null) livePctY = clampPct(((liveY + offsetY) / mmH) * 100);
    }

    if (iconW <= 0) iconW = 24;
    if (iconH <= 0) iconH = 24;

    const iconPctW = mmW > 0 ? (iconW / mmW) * 100 : 0;
    const iconPctH = mmH > 0 ? (iconH / mmH) * 100 : 0;

    const anchorPctX = livePctX !== null ? livePctX
      : (Number.isFinite(st.anchorPctX) ? clampPct(st.anchorPctX)
      : (Number.isFinite(st.mapPctX) ? clampPct(st.mapPctX) : 0));
    const anchorPctY = livePctY !== null ? livePctY
      : (Number.isFinite(st.anchorPctY) ? clampPct(st.anchorPctY)
      : (Number.isFinite(st.mapPctY) ? clampPct(st.mapPctY) : 0));

    ringPosX = anchorPctX;
    ringPosY = anchorPctY;

    const dpiScale = NEUTRAL_RING_SIZE_PX > 0 ? (iconW / NEUTRAL_RING_SIZE_PX) : 1;
    const textPctW = mmW > 0 ? ((48 * dpiScale) / mmW) * 100 : 0;
    const gapPct = mmH > 0 ? ((4 * dpiScale) / mmH) * 100 : 0;
    textPosX = clampPct(anchorPctX + ((iconPctW - textPctW) * 0.5));
    textPosY = clampPct(anchorPctY + iconPctH + gapPct);

    const scoreboardVisible = !!renderCtx?.scoreboardVisible;
    const theme = NEUTRAL_RING_THEME[st.type] || NEUTRAL_RING_THEME_DEFAULT;
    const anchorRoot = ensureAnchorRoot(layer, st, key, renderCtx?.themeInfo);
    const ringRoot = ensureRingRoot(anchorRoot, st, key, ringSize, ringPosX, ringPosY);
    const ringFill = ensureRingFill(st, ringRoot, key);
    const detailLabel = ensureDetailLabel(anchorRoot, st, key);

    if (theme.trackBorder !== st.lastTrackBorder) {
      ringFill.style.borderColor = theme.trackBorder;
      st.lastTrackBorder = theme.trackBorder;
    }
    if (theme.trackBg !== st.lastTrackBg) {
      ringFill.style.backgroundColor = theme.trackBg;
      st.lastTrackBg = theme.trackBg;
    }

    const now = nowMs || Date.now();
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

    let targetOpacity = 1;
    if (scoreboardVisible) {
      targetOpacity = 1;
    } else if (remainingMs > 60000) {
      targetOpacity = 0;
    } else if (remainingMs > 30000) {
      const t = (60000 - remainingMs) / (60000 - 30000);
      targetOpacity = 0.50 * Math.max(0, Math.min(1, t));
    } else {
      targetOpacity = 0.50;
    }

    const opStr = targetOpacity.toFixed(2);
    if (opStr !== st.lastOpacity) {
      ringRoot.style.opacity = opStr;
      st.lastOpacity = opStr;
    }
    setNeutralIconOpacity(st, targetOpacity);

    const pct = Math.max(0, Math.min(1, remainingMs / durationMs));
    const sweepDeg = (pct * 360).toFixed(2);
    const clip = "radial(50% 50%, " + NEUTRAL_RADIAL_START_DEG + "deg, " + sweepDeg + "deg)";
    if (clip !== st.lastClip) {
      ringFill.style.clip = clip;
      st.lastClip = clip;
    }

    const textPos = textPosX.toFixed(2) + "% " + textPosY.toFixed(2) + "% 0px";
    if (Math.abs((st.lastTextPosX ?? -9999) - textPosX) > 0.05 || Math.abs((st.lastTextPosY ?? -9999) - textPosY) > 0.05) {
      detailLabel.style.position = textPos;
      st.lastTextPosX = textPosX;
      st.lastTextPosY = textPosY;
    }

    const text = fmtSeconds(Math.ceil(remainingMs / 1000));
    if (text !== st.lastText) {
      detailLabel.text = text;
      st.lastText = text;
    }

    if (theme.text !== st.lastTextColor) {
      detailLabel.style.color = theme.text;
      st.lastTextColor = theme.text;
    }

    if (st.lastTextOpacity !== opStr) {
      detailLabel.style.opacity = opStr;
      st.lastTextOpacity = opStr;
    }

    st.ringRoot = ringRoot;
    st.ringFill = ringFill;
    st.detailLabel = detailLabel;

    if (remainingMs <= 0) {
      st.respawnEndMs = 0;
      st.respawnEndGameSec = 0;
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconOpacity(st, null);
      st.durationMs = 0;
    }
  }
  function scanNeutralRespawnState(snapshot, nowMs, gameNowSec) {
    const now = nowMs || Date.now();
    const gameNow = gameNowSec > 0 ? gameNowSec : gTime(now);
    const camps = snapshot?.neutralCamps || [];
    const token = ++_neutralSweepToken;

    try {
      for (let i = 0, len = camps.length; i < len; i++) {
        const camp = camps[i];
        if (!camp) continue;

        const key = resolveNeutralStateKey(
          camp.type, camp.xPct, camp.yPct, camp.actualX, camp.actualY, camp.panel
        );

        let st = _neutralRespawnState.get(key);
        if (!st) {
          st = createState(camp, now, token);
          _neutralRespawnState.set(key, st);
        } else {
          st.type = camp.type;
        }

        if (st.panel !== camp.panel) {
          setNeutralIconOpacity(st, null);
        }

        st.panel = camp.panel || null;
        st.panelW = safePanelExtent(camp.panel?.actuallayoutwidth || camp.panel?.contentwidth, st.panelW || 24);
        st.panelH = safePanelExtent(camp.panel?.actuallayoutheight || camp.panel?.contentheight, st.panelH || 24);
        st.mapPctX = camp.xPct;
        st.mapPctY = camp.yPct;
        if (!Number.isFinite(st.anchorPctX) && Number.isFinite(camp.xPct)) st.anchorPctX = camp.xPct;
        if (!Number.isFinite(st.anchorPctY) && Number.isFinite(camp.yPct)) st.anchorPctY = camp.yPct;
        st.mapX = camp.actualX;
        st.mapY = camp.actualY;
        st.lastSeenMs = now;
        st.sweepToken = token;

        const durationSec = NEUTRAL_RESPAWN_SECONDS[camp.type] || 0;
        if (st.wasActive && !camp.isActive && durationSec > 0) {
          st.durationMs = durationSec * 1000;
          st.respawnEndMs = now + durationSec * 1000;
          st.respawnEndGameSec = gameNow > 0 ? (gameNow + durationSec) : 0;
          if (DEBUG_NEUTRAL_TIMERS) {
            $.Msg("[BT-NEUTRAL] start key=", key, " type=", camp.type, " duration=", durationSec);
          }
        } else if (!st.wasActive && camp.isActive) {
          st.respawnEndMs = 0;
          st.respawnEndGameSec = 0;
          st.durationMs = 0;
          clearNeutralRing(st);
          clearNeutralDetailLabel(st);
          setNeutralIconOpacity(st, null);
          if (DEBUG_NEUTRAL_TIMERS) {
            $.Msg("[BT-NEUTRAL] clear key=", key, " reason=active_again");
          }
        }

        st.wasActive = camp.isActive;
      }
    } catch {
      if (DEBUG_NEUTRAL_TIMERS) {
        $.Msg("[BT-NEUTRAL][ERR] scan failed");
      }
    }

    purgeStaleNeutralStates(now, token);
  }

  function renderNeutralRespawnTimers(nowMs, gameNowSec, scoreboardOpen) {
    const minimap = findMinimap();
    const container = UI.minimapBox;
    if (!minimap?.IsValid?.() || !container?.IsValid?.()) return;
    const layer = ensureNeutralOverlay(container);
    if (!layer?.IsValid?.()) return;

    const now = nowMs || Date.now();
    const gameNow = gameNowSec > 0 ? gameNowSec : gTime(now);
    const scoreboardVisible = scoreboardOpen ?? isScoreboardOpen(minimap);
    const themeInfo = updateMinimapInvertCache(minimap, now);
    const mmGeometry = resolveMinimapReferenceSize(UI.minimapBox);
    const renderCtx = {
      mmW: mmGeometry.width,
      mmH: mmGeometry.height,
      offsetX: (UI.minimap?.IsValid?.() ? (UI.minimap.actualxoffset || 0) : 0) + (UI.minimapContainer?.IsValid?.() ? (UI.minimapContainer.actualxoffset || 0) : 0),
      offsetY: (UI.minimap?.IsValid?.() ? (UI.minimap.actualyoffset || 0) : 0) + (UI.minimapContainer?.IsValid?.() ? (UI.minimapContainer.actualyoffset || 0) : 0),
      scoreboardVisible,
      themeInfo
    };

    for (const [key, st] of _neutralRespawnState.entries()) {
      if (!st || (st.respawnEndMs <= 0 && st.respawnEndGameSec <= 0)) continue;
      renderNeutralTimer(st, key, now, gameNow, layer, renderCtx);
    }
  }

  function clearNeutralRespawnTimers() {
    for (const [key, st] of _neutralRespawnState.entries()) {
      clearNeutralTimerEntry(key, st);
    }
    _neutralRespawnState.clear();
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
      const prevAnimHandle = isLeft ? _claimAnimHandleLeft : _claimAnimHandleRight;

      if (!claimBox?.IsValid?.() || !claimIcon?.IsValid?.()) return;

      // Cancel previous timeout
      const prevTimeout = isLeft ? _claimTimeoutLeft : _claimTimeoutRight;
      if (prevTimeout) {
        try {
          $.CancelScheduled(prevTimeout);
        } catch {}
      }

      if (prevAnimHandle) {
        try {
          $.CancelScheduled(prevAnimHandle);
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
          claimTimer.text = fmtCompact(POWERUP_BUFF_DUR);
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
      const animHandle = $.Schedule(0.016, () => {
        try {
          if (claimBox?.IsValid?.()) {
            claimBox.AddClass("active");
          }
        } catch {}

        if (isLeft) {
          _claimAnimHandleLeft = null;
        } else {
          _claimAnimHandleRight = null;
        }
      });

      if (isLeft) {
        _claimAnimHandleLeft = animHandle;
      } else {
        _claimAnimHandleRight = animHandle;
      }

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
      if (_claimTimeoutLeft) {
        try {
          $.CancelScheduled(_claimTimeoutLeft);
        } catch {}
      }
      if (_claimAnimHandleLeft) {
        try {
          $.CancelScheduled(_claimAnimHandleLeft);
        } catch {}
      }
      _claimTimeoutLeft = null;
      _claimAnimHandleLeft = null;
      _claimStartLeft = 0;
    } else {
      if (_claimTimeoutRight) {
        try {
          $.CancelScheduled(_claimTimeoutRight);
        } catch {}
      }
      if (_claimAnimHandleRight) {
        try {
          $.CancelScheduled(_claimAnimHandleRight);
        } catch {}
      }
      _claimTimeoutRight = null;
      _claimAnimHandleRight = null;
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

    if (_claimAnimHandleLeft) {
      try {
        $.CancelScheduled(_claimAnimHandleLeft);
      } catch {}
      _claimAnimHandleLeft = null;
    }

    if (_claimAnimHandleRight) {
      try {
        $.CancelScheduled(_claimAnimHandleRight);
      } catch {}
      _claimAnimHandleRight = null;
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
          const t = fmtCompact(rem);
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
          const t = fmtCompact(rem);
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
  function prunePlayerState(nowMs, forceAll) {
    const now = nowMs || Date.now();
    const keys = Object.keys(_playerState);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const st = _playerState[k];
      if (!st) {
        delete _playerState[k];
        continue;
      }

      if (_lingerState[k]) continue;

      if (forceAll || now - (st.lastSeenMs || 0) > PLAYER_STATE_STALE_MS) {
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

        const id = pl.id || getStablePlayerKey(pl.panel, i);
        const ps = markPlayerSeen(id, pl.team || 0, now, _playerSeenToken);
        let team = ps?.team || pl.team || 0;
        if (!team && pl.panel?.IsValid?.()) {
          team = isAlly(pl.panel) ? 1 : isEnemy(pl.panel) ? 2 : 0;
        }

        if (team !== 2) continue;

        const wasActive = ps?.wasActive ?? true;
        ps.team = team;

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
    prunePlayerState(Date.now(), true);
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

    if (_buffFadeHnd) {
      try { $.CancelScheduled(_buffFadeHnd); } catch {}
      _buffFadeHnd = null;
    }

    if (UI.rejuvMiniCard?.IsValid?.()) {
      UI.rejuvMiniCard.AddClass("active");
      UI.rejuvMiniCard.AddClass("buff-active");
    }
    if (UI.rejuvMiniTime?.IsValid?.()) {
      UI.rejuvMiniTime.text = fmt(buffCnt);
    }
  }

  function endBuff() {
    buffStart = 0;
    buffCnt = 0;
    _lastRejuvBuffText = "";

    if (_buffFadeHnd) {
      try { $.CancelScheduled(_buffFadeHnd); } catch {}
      _buffFadeHnd = null;
    }

    if (UI.rejuvMiniCard?.IsValid?.()) {
      UI.rejuvMiniCard.RemoveClass("buff-active");
      if (!_neutralBotOverrideActive && !_neutralMediumOverrideActive && !_neutralCardOverrideActive) {
        UI.rejuvMiniCard.RemoveClass("active");
      }
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
    lastPlayerStatePruneCheck = 0;
    _snapshotTs = 0;
    startPhaseAuto(now);

    // Prune stale player state when starting run
    prunePlayerState(Date.now(), true);
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
      _neutralMediumOverrideActive = false;
      _neutralCardOverrideActive = false;
      if (_neutralModeHnd) {
        $.CancelScheduled(_neutralModeHnd);
        _neutralModeHnd = null;
      }
      clearNeutralCoordCache();
      clearMinimapInvertCache();
      clearNeutralRespawnTimers();
      _lowTimeCacheCleared = false;
      UI.neutralOverlay = null;
      _lastScoreboardOpen = false;
      _snapshotTs = 0;
      lastPlayerStatePruneCheck = 0;
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
      setPanelClass(UI.rejuv, "neutral-card-mode", false);
      resetImg();
      setRejuvImage(REJUV_ICON_SRC);
      if (_buffFadeHnd) {
        try {
          $.CancelScheduled(_buffFadeHnd);
        } catch {}
        _buffFadeHnd = null;
      }
      endBuff(true);

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
      _imgRotateHnd = $.Schedule(0.8, () => {
        if (UI.rImg?.IsValid?.()) {
          UI.rImg.RemoveClass("rotating");
        }
        _imgRotateHnd = null;
      });
    }
  }

  function resetImg() {
    if (_imgRotateHnd) {
      try {
        $.CancelScheduled(_imgRotateHnd);
      } catch {}
      _imgRotateHnd = null;
    }

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

  function setSpawnBadgeImage(src) {
    if (UI.spawnBadge?.IsValid?.()) UI.spawnBadge.SetImage(src);
  }

  function setSpawnBadge2Image(src) {
    if (UI.spawnBadge2?.IsValid?.()) UI.spawnBadge2.SetImage(src);
  }

  function exitVaultCardMode(onDone) {
    setPanelClass(UI.rejuv, "neutral-card-mode", false);
    setSpawnBadge2Image(NEUTRAL_SMALL_BADGE_SRC);
    exitNeutralMode(false, onDone);
    if (UI.rLabClip?.IsValid?.() && _lastRejuvClipColor !== "#ffffff") {
      UI.rLabClip.style.color = "#ffffff";
      _lastRejuvClipColor = "#ffffff";
    }
  }

  function updateNeutralMediumPhase(now) {
    const active = now >= NEUTRAL_MEDIUM_START_SEC && now <= NEUTRAL_MEDIUM_END_SEC;

    if (!active) {
      if (_neutralMediumOverrideActive) {
        _neutralMediumOverrideActive = false;
        setSpawnBadgeImage(NEUTRAL_SMALL_BADGE_SRC);
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

    if (!_neutralMediumOverrideActive) {
      _neutralMediumOverrideActive = true;
      setSpawnBadgeImage(NEUTRAL_MEDIUM_BADGE_SRC);
      enterNeutralMode();
      setRejuvImage(NEUTRAL_BOT_ICON_SRC);
      resetImg();
    }

    const rem = Math.max(0, NEUTRAL_MEDIUM_END_SEC - now);
    counter = rem;
    const t = fmt(rem);

    if (t !== _lastRejuvText) {
      UI.rLab.text = t;
      if (UI.rLabClip?.IsValid?.()) UI.rLabClip.text = t;
      _lastRejuvText = t;
    }

    const pct = rem / (NEUTRAL_MEDIUM_END_SEC - NEUTRAL_MEDIUM_START_SEC);
    const p = Math.floor(pct * 100);
    const clip = "rect(0%," + p + "%,100%,0%)";
    if (clip !== _lastRejuvClip && UI.rLabClip?.IsValid?.()) {
      UI.rLabClip.style.clip = clip;
      _lastRejuvClip = clip;
    }
    if (UI.rLabClip?.IsValid?.() && _lastRejuvClipColor !== NEUTRAL_BOT_PROGRESS_COLOR) {
      UI.rLabClip.style.color = NEUTRAL_BOT_PROGRESS_COLOR;
      _lastRejuvClipColor = NEUTRAL_BOT_PROGRESS_COLOR;
    }

    tick = TICK_FAST;
    return true;
  }

  function updateNeutralCardPhase(now) {
    const active = now >= NEUTRAL_LARGE_START_SEC && now <= NEUTRAL_LARGE_END_SEC;

    if (!active) {
      if (_neutralCardOverrideActive) {
        _neutralCardOverrideActive = false;
        exitVaultCardMode(() => {
          setRejuvImage(REJUV_ICON_SRC);
          setImg(idx);
        });
      }
      return false;
    }

    if (!_neutralCardOverrideActive) {
      _neutralCardOverrideActive = true;
      setPanelClass(UI.rejuv, "neutral-card-mode", true);
      setSpawnBadge2Image(NEUTRAL_LARGE_BADGE_SRC);
      setRejuvImage(NEUTRAL_VAULT_BADGE_SRC);
      enterNeutralMode();
      resetImg();
    }

    const rem = Math.max(0, NEUTRAL_LARGE_END_SEC - now);
    counter = rem;
    const t = fmt(rem);

    if (t !== _lastRejuvText) {
      UI.rLab.text = t;
      if (UI.rLabClip?.IsValid?.()) UI.rLabClip.text = t;
      _lastRejuvText = t;
    }

    const pct = rem / (NEUTRAL_LARGE_END_SEC - NEUTRAL_LARGE_START_SEC);
    const p = Math.floor(pct * 100);
    const clip = "rect(0%," + p + "%,100%,0%)";
    if (clip !== _lastRejuvClip && UI.rLabClip?.IsValid?.()) {
      UI.rLabClip.style.clip = clip;
      _lastRejuvClip = clip;
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

  function fmtCompact(s) {
    s = Math.max(0, s | 0);

    if (s >= 60) {
      const m = (s / 60) | 0;
      const ss = s % 60;
      return m + ":" + (ss < 10 ? "0" + ss : "" + ss);
    }

    if (s >= 10) {
      return s + "s";
    }

    return "" + s;
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
