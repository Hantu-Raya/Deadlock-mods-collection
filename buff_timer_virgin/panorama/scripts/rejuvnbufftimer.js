(() => {
  "use strict";
  const REJUV_DUR = 180;
  const BRIDGE_DUR = 300;
  const SPAWN_TH = 10;
  const TICK_FAST = 0.1;
  const TICK_NORM = 1;
  const LOOP_GATE_DELAY_MS = 30000;
  const REJUV_ICON_SRC = "s2r://panorama/images/hud/modifiers/icon_rejuvenator.svg";
  const NEUTRAL_BOT_ICON_SRC = "s2r://panorama/images/npcs/neutral_bot_psd.vtex";
  const NEUTRAL_TRANSITION_MS = 220;
  const NEUTRAL_BOT_START_SEC = 60;
  const NEUTRAL_BOT_END_SEC = 120;
  const NEUTRAL_MEDIUM_START_SEC = 240;
  const NEUTRAL_MEDIUM_END_SEC = 300;
  const NEUTRAL_LARGE_START_SEC = 420;
  const NEUTRAL_LARGE_END_SEC = 480;
  const NEUTRAL_BOT_PROGRESS_COLOR = "#00ff00";
  const NEUTRAL_SMALL_BADGE_SRC = "s2r://panorama/images/minimap/neutral_small_psd.vtex";
  const NEUTRAL_MEDIUM_BADGE_SRC = "s2r://panorama/images/minimap/neutral_medium_psd.vtex";
  const NEUTRAL_LARGE_BADGE_SRC = "s2r://panorama/images/minimap/neutral_large_psd.vtex";
  const NEUTRAL_VAULT_BADGE_SRC = "s2r://panorama/images/minimap/neutral_vault_psd.vtex";
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
  const POWERUP_BUFF_DUR = 160;
  const DEATH_GRACE_MS = 2000;
  const PLAYER_STATE_STALE_MS = 6000;
  const PLAYER_STATE_PRUNE_INTERVAL_MS = 3000;
  const BUTTON_CACHE_TTL = 800;
  const LINGER_DURATION = 5;
  const LINGER_LABEL_SIZE = 24;
  const MINIMAP_SNAPSHOT_INTERVAL_HOT_MS = 250;
  const MINIMAP_SNAPSHOT_INTERVAL_NORMAL_MS = 500;
  const MINIMAP_SNAPSHOT_INTERVAL_IDLE_MS = 750;
  const DEBUG_PING_TIMER = false;
  const CHAT_RETRY_DELAYS = [0.01, 0.03, 0.06, 0.1, 0.15, 0.25];
  const CHAT_ALL_LABEL = "To (ALL):";
  const CHAT_SEND_COOLDOWN_MS = 300;
  const WATCHDOG_GRACE_MS = 15000;
  const RIFT_FIRST_SPAWN = 720;
  const RIFT_INTERVAL = 420;
  const RIFT_INTERVAL_VARIANCE = 60;
  const RIFT_EARLY_WARNING = 80;
  const RIFT_GLOBAL_WARNING = 20;
  const URN_FIRST_SPAWN = 600;
  const URN_INTERVAL = 300;
  const URN_EARLY_WARNING = 60;
  const UI = Object.create(null);
  const PANEL_IDS = {
    hud: "Hud", topBar: "TopBar", rLab: "RejuvTime", rNum: "RejuvNum",
    rImg: "RejuvImg", rejuv: "Rejuv", buffLab: "BuffTime", rLabClip: "RejuvTimeClip",
    buffLabClip: "BuffTimeClip", glowLeft: "MinimapGlowLeft", glowRight: "MinimapGlowRight",
    claimLeft: "MinimapBuffClaimLeft", claimRight: "MinimapBuffClaimRight",
    claimIconLeft: "ClaimIconLeft", claimIconRight: "ClaimIconRight",
    claimRingLeft: "ClaimRingLeft", claimRingRight: "ClaimRingRight",
    claimTimerLeft: "ClaimTimerLeft", claimTimerRight: "ClaimTimerRight",
    minimapContainer: "HudMinimapContainer",
    spawnBadge: "NeutralSpawnBadge", spawnBadge2: "NeutralSpawnBadge2",
    rejuvMiniCard: "RejuvMiniCard", rejuvMiniTime: "RejuvMiniTime",
    riftCard: "RiftTimerCard", riftTime: "RiftTimerTime", riftSubTime: "RiftTimerSub",
    urnCard: "UrnTimerCard", urnTime: "UrnTimerTime", urnSubTime: "UrnTimerSub"
  };
  function bindUiPanels(root) {
    for (const key in PANEL_IDS) {
      try {
        UI[key] = root.FindChildTraverse(PANEL_IDS[key]);
      } catch {
        UI[key] = null;
      }
    }
  }
  const WRITE_CACHE = Object.create(null);
  function resetWriteCache() {
    for (const key in WRITE_CACHE) delete WRITE_CACHE[key];
  }
  const POWERUP_ICONS = {
    "powerup_gun": "s2r://panorama/images/minimap/powerup_weapon.vsvg",
    "powerup_survival": "s2r://panorama/images/minimap/powerup_health.vsvg",
    "powerup_casting": "s2r://panorama/images/minimap/powerup_magic.vsvg",
    "powerup_movement": "s2r://panorama/images/minimap/powerup_movement.vsvg"
  };
  const GLOW_CLASS_MAP = {
    "powerup_gun": "glow-gun",
    "powerup_survival": "glow-survival",
    "powerup_casting": "glow-casting",
    "powerup_movement": "glow-movement"
  };
  const NEUTRAL_PHASES = [
    { key: "bot", start: NEUTRAL_BOT_START_SEC, end: NEUTRAL_BOT_END_SEC, badge: null, image: NEUTRAL_BOT_ICON_SRC },
    { key: "medium", start: NEUTRAL_MEDIUM_START_SEC, end: NEUTRAL_MEDIUM_END_SEC, badge: NEUTRAL_SMALL_BADGE_SRC, image: NEUTRAL_MEDIUM_BADGE_SRC },
    { key: "card", start: NEUTRAL_LARGE_START_SEC, end: NEUTRAL_LARGE_END_SEC, badge: NEUTRAL_LARGE_BADGE_SRC, image: NEUTRAL_VAULT_BADGE_SRC }
  ];
  const NEUTRAL_ACTIVE = { "bot": false, "medium": false, "card": false };
  const SIDES = [
    { name: "LEFT", glow: null, claim: null, icon: null, ring: null, timer: null, activeGlow: null, claimTimeout: null, animHandle: null, enemyGlowHandle: null, claimStart: 0, lastTimer: "", lastScale: -1, lastOpacity: -1 },
    { name: "RIGHT", glow: null, claim: null, icon: null, ring: null, timer: null, activeGlow: null, claimTimeout: null, animHandle: null, enemyGlowHandle: null, claimStart: 0, lastTimer: "", lastScale: -1, lastOpacity: -1 }
  ];
  const LAST_TICK = {
    rejuv: 0, buff: 0, bridge: 0, miniCard: 0, claim: 0, scan: 0,
    linger: 0, pretrack: 0, monitor: 0, prune: 0, objective: 0
  };
  const _nearestTargets = [];
  const _minimapSnapshot = { players: [], powerupSpawns: [], riftMarkerSeen: false, riftWarningActive: false };
  const _minimapReferenceSize = { width: 1512, height: 862 };
  let hnd = null;
  let running = false;
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
  let tick = TICK_NORM;
  let lastFound = false;
  let lastPowerupScan = 0;
  let prevBuffRem = BRIDGE_DUR;
  let buffResetTs = 0;
  let lastLingerCheck = 0;
  let trackedPowerups = [];
  let monitoringActive = false;
  let pretrackActive = false;
  let pretrackData = {
    left: { minAlly: Infinity, minEnemy: Infinity },
    right: { minAlly: Infinity, minEnemy: Infinity }
  };
  let knownSpawnPos = null;
  let _gameTimePanel = null;
  let _tCache = 0;
  let _tCacheTs = 0;
  let _snapshotTs = 0;
  let _mapButtonCache = null;
  let _mapButtonCacheTs = 0;
  let _playerState = Object.create(null);
  let _playerSeenToken = 0;
  let _stablePlayerKeySeq = 0;
  let _neutralModeHnd = null;
  let _imgRotateHnd = null;
  let _lingerState = Object.create(null);
  let _lingerCount = 0;
  let _lowTimeCacheCleared = false;
  let _generation = 0;
  let _nextLoopDueMs = 0;
  let _lastTimerChatMs = 0;
  let _riftObservedSpawn = 0;
  let _riftMarkerSeen = false;
  let _riftWarningActive = false;
  let _riftHot = false;
  function dbgPing(...args) {
    if (!DEBUG_PING_TIMER) return;
    try { $.Msg("[BT-PING]", ...args); } catch {}
  }
  function writeText(baseKey, clipKey, text, panelA, panelB) {
    const value = String(text);
    if (panelA?.IsValid?.() && WRITE_CACHE[baseKey] !== value) {
      try {
        panelA.text = value;
        WRITE_CACHE[baseKey] = value;
      } catch {}
    }
    if (clipKey !== null && panelB?.IsValid?.() && WRITE_CACHE[clipKey] !== value) {
      try {
        panelB.text = value;
        WRITE_CACHE[clipKey] = value;
      } catch {}
    }
  }
  function setPanelText(panel, text) {
    if (!panel?.IsValid?.()) return false;
    try {
      panel.text = text;
      return true;
    } catch { return false; }
  }
  function setMiniCardState(active, buffActive) {
    const card = UI.rejuvMiniCard;
    if (!card?.IsValid?.()) return;
    const nextActive = !!active;
    const nextBuffActive = !!buffActive;
    if (WRITE_CACHE["miniActive"] !== nextActive) {
      setPanelClass(card, "active", nextActive);
      WRITE_CACHE["miniActive"] = nextActive;
    }
    if (WRITE_CACHE["miniBuffActive"] !== nextBuffActive) {
      setPanelClass(card, "buff-active", nextBuffActive);
      WRITE_CACHE["miniBuffActive"] = nextBuffActive;
    }
  }
  function resolveMinimapReferenceSize(panel) {
    const reference = panel?.IsValid?.() ? panel : null;
    _minimapReferenceSize.width = safePanelExtent(reference?.actuallayoutwidth || reference?.contentwidth, 1512, 8192);
    _minimapReferenceSize.height = safePanelExtent(reference?.actuallayoutheight || reference?.contentheight, 862, 8192);
    return _minimapReferenceSize;
  }
  function formatTime(seconds, mode) {
    seconds = Math.max(0, seconds | 0);
    const m = (seconds / 60) | 0;
    const s = seconds % 60;
    if (mode === "chat") {
      return m <= 0 ? s + "s" : m + ":" + (s < 10 ? "0" + s : "" + s);
    }
    if (mode === "compact") {
      return m + ":" + (s < 10 ? "0" + s : "" + s);
    }
    return (m < 10 ? "0" + m : "" + m) + ":" + (s < 10 ? "0" + s : "" + s);
  }
  function computeRejuvBuffRemaining(now, start) {
    return Math.max(0, REJUV_DUR - (now - start));
  }
  function findRoot(p) {
    while (p?.GetParent?.()) {
      p = p.GetParent();
    }
    return p;
  }
  function startRun(now) {
    running = true;
    claimCnt = 0;
    lastFound = false;
    spawnWait = false;
    lastRunChk = Date.now();
    trackedPowerups.length = 0;
    monitoringActive = false;
    pretrackActive = false;
    LAST_TICK.scan = 0;
    LAST_TICK.prune = 0;
    _snapshotTs = 0;
    clearMapButtonCache();
    startPhaseAuto(now);
    prunePlayerState(Date.now(), true);
  }
  function computeAdaptiveLoopDelayMs(baseTickMs, minimapIntervalMs, riftHot) {
    const baseMs = Number.isFinite(baseTickMs) && baseTickMs > 0 ? baseTickMs : 500;
    const minimapMs = Number.isFinite(minimapIntervalMs) && minimapIntervalMs > 0 ? minimapIntervalMs : baseMs;
    const capMs = riftHot ? 250 : 500;
    return Math.min(baseMs, minimapMs, capMs);
  }
  function scheduleLoop(gen, baseTickMs, minimapIntervalMs, riftHot) {
    const delayMs = baseTickMs === LOOP_GATE_DELAY_MS
      ? LOOP_GATE_DELAY_MS
      : computeAdaptiveLoopDelayMs(baseTickMs, minimapIntervalMs, riftHot);
    _nextLoopDueMs = Date.now() + delayMs;
    hnd = $.Schedule(delayMs / 1000, () => loop(gen));
  }
  function watchdogTick(gen) {
    if (gen !== _generation) return;
    const nowMs = Date.now();
    if (_nextLoopDueMs > 0 && nowMs > _nextLoopDueMs + WATCHDOG_GRACE_MS) {
      $.Msg("[BT-WATCHDOG] Main loop missed scheduled heartbeat, restarting");
      reset(1);
      boot();
      return;
    }
    $.Schedule(5, () => watchdogTick(gen));
  }
  function reset(f) {
    _generation++;
    if (hnd) {
      try { $.CancelScheduled(hnd); } catch {}
      hnd = null;
    }
    if (!f) return;
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
    tick = TICK_NORM;
    clearMinimapRuntimeState(Date.now(), true);
    prevBuffRem = BRIDGE_DUR;
    _riftObservedSpawn = 0;
    _riftMarkerSeen = false;
    _riftWarningActive = false;
    _riftHot = false;
    Object.assign(NEUTRAL_ACTIVE, { bot: false, medium: false, card: false });
    if (_neutralModeHnd) {
      try { $.CancelScheduled(_neutralModeHnd); } catch {}
      _neutralModeHnd = null;
    }
    _lowTimeCacheCleared = false;
    for (const name in LAST_TICK) LAST_TICK[name] = 0;
    resetWriteCache();
    writeText("rejuvTextBase", "rejuvTextClip", formatTime(SEQ[0].d, "pad"), UI.rLab, UI.rLabClip);
    setPanelText(UI.rNum, "1");
    exitNeutralMode(true, null);
    setPanelClass(UI.rejuv, "neutral-card-mode", false);
    resetImg();
    setRejuvImage(REJUV_ICON_SRC);
    endBuff();
    setObjectiveCardsActive(false);
    const rejuvClip = "rect(0%,0%,100%,0%)";
    resetClipPanel(UI.rLabClip, rejuvClip);
    const buffClip = "rect(0%,100%,100%,100%)";
    resetClipPanel(UI.buffLabClip, buffClip);
  }
  function gTime(nowMs = 0) {
    const n = nowMs || Date.now();
    if (n - _tCacheTs < 200) return _tCache;
    let t = 0;
    if (_gameTimePanel?.IsValid?.()) {
      try { t = parseSec(_gameTimePanel.text); } catch {}
    }
    if (!t) {
      try {
        let tb = UI.topBar;
        if (!panelValid(tb) && panelValid(UI.root)) {
          tb = UI.root.FindChildTraverse("TopBar");
          UI.topBar = tb;
        }
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
    for (let i = 0; i < ci; i++) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) mm = mm * 10 + (c - 48);
    }
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
      return UI.hud.BHasClass("connectedToHideout") ||
             UI.hud.BHasClass("connectedtohideout") ||
             UI.hud.BHasClass("connectedToHideOut");
    } catch {}
    return false;
  }
  function findMinimap() {
    if (UI.minimap?.IsValid?.()) return UI.minimap;
    try { UI.minimap = UI.root?.FindChildTraverse("hud_minimap"); } catch {}
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
  function computeLingerLabelPosition(btn, container, minimap) {
    // Active glow panels expand content bounds; layout bounds remain anchored to the minimap.
    const containerWidth = safePanelExtent(container?.actuallayoutwidth || container?.contentwidth, 404, 8192);
    const containerHeight = safePanelExtent(container?.actuallayoutheight || container?.contentheight, 404, 8192);
    const minimapWidth = Number(minimap?.actuallayoutwidth || minimap?.contentwidth);
    const minimapHeight = Number(minimap?.actuallayoutheight || minimap?.contentheight);
    const minimapSize = isFinite(minimapWidth) && minimapWidth > 0 && minimapWidth <= 8192
      && isFinite(minimapHeight) && minimapHeight > 0 && minimapHeight <= 8192
      ? resolveMinimapReferenceSize(minimap)
      : { width: containerWidth, height: containerHeight };
    const buttonWidth = safePanelExtent(btn?.actuallayoutwidth || btn?.contentwidth, 32, 512);
    const buttonHeight = safePanelExtent(btn?.actuallayoutheight || btn?.contentheight, 32, 512);
    const rawX = safeMapCoord(btn?.actualxoffset) || 0;
    const rawY = safeMapCoord(btn?.actualyoffset) || 0;
    let centerXPct = (rawX + buttonWidth * 0.5) / minimapSize.width * 100;
    let centerYPct = (rawY + buttonHeight * 0.5) / minimapSize.height * 100;
    try {
      if (minimap?.["BHasClass"]?.("invert_map")) {
        centerXPct = 100 - centerXPct;
        centerYPct = 100 - centerYPct;
      }
    } catch {}
    const labelWidthPct = LINGER_LABEL_SIZE / containerWidth * 100;
    const labelHeightPct = LINGER_LABEL_SIZE / containerHeight * 100;
    const leftPct = centerXPct - labelWidthPct * 0.5;
    const topPct = centerYPct - labelHeightPct * 0.5;
    return {
      x: Math.round(Math.max(0, Math.min(100 - labelWidthPct, leftPct)) * 1000) / 1000,
      y: Math.round(Math.max(0, Math.min(100 - labelHeightPct, topPct)) * 1000) / 1000
    };
  }
  function panelValid(panel) {
    try { return !!(panel && panel.IsValid && panel.IsValid()); } catch {}
    return false;
  }
  function setPanelClass(panel, className, enabled) {
    if (!panel?.IsValid?.()) return;
    const shouldHave = !!enabled;
    let hasClass = false;
    try { hasClass = !!panel.BHasClass?.(className); } catch { hasClass = false; }
    if (hasClass !== shouldHave) {
      try { panel.SetHasClass(className, shouldHave); } catch {}
    }
  }
  function resetClipPanel(panel, clip) {
    if (!panel?.IsValid?.()) return;
    try {
      panel.style.clip = clip;
      panel.style.color = "#ffffff";
      panel.text = "";
    } catch {}
  }
  function isDue(task, nowMs, intervalMs) {
    if (nowMs - LAST_TICK[task] < intervalMs) return false;
    LAST_TICK[task] = nowMs;
    return true;
  }

  function clearMapButtonCache() {
    _mapButtonCache = null;
    _mapButtonCacheTs = 0;
  }

  function clearMinimapSnapshot(nowMs) {
    _minimapSnapshot.players.length = 0;
    _minimapSnapshot.powerupSpawns.length = 0;
    _minimapSnapshot.riftMarkerSeen = false;
    _minimapSnapshot.riftWarningActive = false;
    _snapshotTs = nowMs || 0;
  }
  function clearMinimapRuntimeState(nowMs, advancePlayerToken) {
    const now = nowMs || Date.now();
    clearMapButtonCache();
    clearMinimapSnapshot(0);
    _playerState = Object.create(null);
    if (advancePlayerToken) _playerSeenToken++;
    trackedPowerups.length = 0;
    monitoringActive = false;
    pretrackActive = false;
    knownSpawnPos = null;
    buffResetTs = 0;
    lastPowerupScan = 0;
    lastLingerCheck = 0;
    pretrackData.left.minAlly = Infinity;
    pretrackData.left.minEnemy = Infinity;
    pretrackData.right.minAlly = Infinity;
    pretrackData.right.minEnemy = Infinity;
    _nearestTargets.length = 0;
    writeSideGlow(0, null, false);
    writeSideGlow(1, null, false);
    setClaimSide(0, false, false, "", now);
    setClaimSide(1, false, false, "", now);
    clearAllLingers();
  }

  function maybeClearNeutralCachesForLowGameTime(gameNowSec) {
    if (!Number.isFinite(gameNowSec) || gameNowSec < 0) return;

    if (gameNowSec >= 10) {
      _lowTimeCacheCleared = false;
      return;
    }
    if (_lowTimeCacheCleared) return;
    clearMinimapRuntimeState(Date.now(), true);
    _lowTimeCacheCleared = true;
  }

  function writePanelStyle(cacheKey, panel, property, value) {
    if (!panel?.IsValid?.() || WRITE_CACHE[cacheKey] === value) return;
    try {
      panel.style[property] = value;
      WRITE_CACHE[cacheKey] = value;
    } catch {}
  }

  function getMinimapWorkInterval(nowMs) {
    const now = nowMs || Date.now();
    if (pretrackActive || monitoringActive || SIDES[0].claimStart > 0 || SIDES[1].claimStart > 0) return MINIMAP_SNAPSHOT_INTERVAL_HOT_MS;
    if (buffResetTs > 0 && now - buffResetTs < POWERUP_LINGER) return MINIMAP_SNAPSHOT_INTERVAL_HOT_MS;
    if (_lingerCount > 0) return MINIMAP_SNAPSHOT_INTERVAL_NORMAL_MS;
    return MINIMAP_SNAPSHOT_INTERVAL_IDLE_MS;
  }

  function getStablePlayerKey(btn, fallbackIndex) {
    if (!btn?.IsValid?.()) return "player_fallback_" + fallbackIndex;
    try {
      const rawId = btn["id"];
      if (rawId && String(rawId).length > 0) return rawId;
      if (btn["__btStablePlayerKey"]) return btn["__btStablePlayerKey"];
      _stablePlayerKeySeq++;
      const stableKey = "player_panel_" + _stablePlayerKeySeq;
      btn["__btStablePlayerKey"] = stableKey;
      return stableKey;
    } catch {}
    _stablePlayerKeySeq++;
    return "player_panel_" + _stablePlayerKeySeq;
  }

  function markPlayerSeen(key, team, nowMs, token) {
    let ps = _playerState[key];
    if (!ps) {
      ps = { x: 0, y: 0, deadTs: 0, wasActive: true, team: team || 0, lastSeenMs: 0, seenToken: 0 };
      _playerState[key] = ps;
    } else if (team) {
      ps.team = team;
    }
    ps.lastSeenMs = nowMs || Date.now();
    if (token !== undefined && token !== null) ps.seenToken = token;
    return ps;
  }

  function hasUsableMapButtonCache(buttons) {
    if (!buttons?.length) return false;
    const probeCount = buttons.length < 3 ? buttons.length : 3;
    for (let i = 0; i < probeCount; i++) {
      const btn = buttons[i];
      try {
        if (btn?.IsValid?.() && btn.BHasClass?.("map_button")) return true;
      } catch {}
    }
    return false;
  }

  function getCachedMapButtons(mm, nowMs, forceFresh) {
    const now = nowMs || Date.now();
    if (!forceFresh && now - _mapButtonCacheTs < BUTTON_CACHE_TTL && hasUsableMapButtonCache(_mapButtonCache)) {
      return _mapButtonCache;
    }
    let buttons = null;
    try {
      buttons = mm.FindChildrenWithClassTraverse("map_button");
    } catch {
      return hasUsableMapButtonCache(_mapButtonCache) ? _mapButtonCache : null;
    }
    _mapButtonCache = buttons || [];
    _mapButtonCacheTs = now;
    return _mapButtonCache;
  }

  function setMapPosition(entry, btn, mmW, mmH) {
    const actualX = safeMapCoord(btn.actualxoffset);
    const actualY = safeMapCoord(btn.actualyoffset);
    if (actualX === null || actualY === null) return false;
    entry.xPct = clampPct(actualX / mmW * 100);
    entry.yPct = clampPct(actualY / mmH * 100);
    return true;
  }
  function collectMinimapSnapshot(nowMs, forceFresh) {
    const mm = findMinimap();
    if (!mm) {
      return null;
    }
    const now = nowMs || Date.now();
    const intervalMs = getMinimapWorkInterval(now);
    if (!forceFresh && _snapshotTs > 0 && now - _snapshotTs < intervalMs) {
      return _minimapSnapshot;
    }
    const buttons = getCachedMapButtons(mm, now, !!forceFresh);
    if (!buttons) {
      return _minimapSnapshot;
    }
    if (!buttons.length) {
      clearMinimapSnapshot(now);
      return _minimapSnapshot;
    }

    let playerCount = 0;
    let powerupCount = 0;
    let riftMarkerSeen = false;
    let riftWarningActive = false;
    const mmGeom = resolveMinimapReferenceSize(mm);
    const mmW = mmGeom.width;
    const mmH = mmGeom.height;
    const playerSeenToken = ++_playerSeenToken;

    try {
      for (let i = 0, len = buttons.length; i < len; i++) {
        const btn = buttons[i];
        if (!btn?.IsValid?.() || !btn.BHasClass?.("map_button")) continue;
        if (btn.BHasClass("capture_point")) {
          riftMarkerSeen = true;
          if (btn.BHasClass("koth_warning")) riftWarningActive = true;
        }

        if (btn.BHasClass("player")) {
          let entry = _minimapSnapshot.players[playerCount];
          if (!entry) {
            entry = { id: "", panel: null, isActive: false, isDead: false, team: 0, xPct: 0, yPct: 0 };
            _minimapSnapshot.players[playerCount] = entry;
          }
          if (!setMapPosition(entry, btn, mmW, mmH)) continue;
          const id = getStablePlayerKey(btn, i);
          const ps = markPlayerSeen(id, 0, now, playerSeenToken);
          const classified = classifyTeam(btn);
          const team = classified || ps.team || 0;
          ps.team = team;
          entry.id = id;
          entry.panel = btn;
          entry.isActive = btn.BHasClass("active");
          entry.isDead = btn.BHasClass("PlayerDead") || btn.BHasClass("playerdead");
          entry.team = team;
          playerCount++;
          continue;
        }

        if (btn.BHasClass("powerup_spawn")) {
          let entry = _minimapSnapshot.powerupSpawns[powerupCount];
          if (!entry) {
            entry = { id: "", panel: null, isActive: false, type: "unknown", xPct: 0, yPct: 0 };
            _minimapSnapshot.powerupSpawns[powerupCount] = entry;
          }
          if (!setMapPosition(entry, btn, mmW, mmH)) continue;
          let type = "unknown";
          for (let j = 0; j < POWERUP_TYPES.length; j++) {
            if (btn.BHasClass(POWERUP_TYPES[j])) {
              type = POWERUP_TYPES[j];
              break;
            }
          }
          entry.id = btn["id"] || ("powerup_" + i);
          entry.panel = btn;
          entry.isActive = btn.BHasClass("active");
          entry.type = type;
          powerupCount++;
        }
      }
    } catch {}

    _minimapSnapshot.players.length = playerCount;
    _minimapSnapshot.powerupSpawns.length = powerupCount;
    _minimapSnapshot.riftMarkerSeen = riftMarkerSeen;
    _minimapSnapshot.riftWarningActive = riftWarningActive;
    _snapshotTs = now;
    return _minimapSnapshot;
  }

  function computeNearestForTargets(players, targets, targetCount, nowMs, accumulate) {
    if (!players?.length || !targets || targetCount <= 0) {
      return;
    }
    const now = nowMs || Date.now();
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
      if (!team && pl.panel?.IsValid?.()) team = classifyTeam(pl.panel);
      ps.team = team;

      const posX = pl.xPct;
      const posY = pl.yPct;
      const posChanged = Math.abs(ps.x - posX) > 0.5 || Math.abs(ps.y - posY) > 0.5;
      if (pl.isDead) {
        const deadTs = ps.deadTs || (posChanged ? 0 : now);
        ps.x = posX;
        ps.y = posY;
        ps.deadTs = deadTs || now;
        if (team === 2) removeLinger(id, true);
        if (!posChanged && now - ps.deadTs >= DEATH_GRACE_MS) continue;
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

  function classifyTeam(btn) {
    if (!btn?.BHasClass) return 0;
    try {
      if (btn.BHasClass("team1") || btn.BHasClass("friend") || btn.BHasClass("ally")) return 1;
      if (btn.BHasClass("team2") || btn.BHasClass("enemy")) return 2;
    } catch {}
    return 0;
  }

  function getNearestTarget(side) {
    let target = _nearestTargets[side];
    if (!target) {
      target = { x: 0, y: 0, minAllyDist: Infinity, minEnemyDist: Infinity, _scanAlly: Infinity, _scanEnemy: Infinity };
      _nearestTargets[side] = target;
    }
    return target;
  }
  function doPretrack(nowMs, snapshot) {
    if (!knownSpawnPos) return;
    const snap = snapshot || collectMinimapSnapshot(nowMs, false);
    if (!snap?.players?.length) return;
    _nearestTargets.length = 2;

    const leftTarget = getNearestTarget(0);
    leftTarget.x = knownSpawnPos.left.x;
    leftTarget.y = knownSpawnPos.left.y;
    leftTarget.minAllyDist = Infinity;
    leftTarget.minEnemyDist = Infinity;
    const rightTarget = getNearestTarget(1);
    rightTarget.x = knownSpawnPos.right.x;
    rightTarget.y = knownSpawnPos.right.y;
    rightTarget.minAllyDist = Infinity;
    rightTarget.minEnemyDist = Infinity;

    computeNearestForTargets(snap.players, _nearestTargets, 2, nowMs, false);
    if (leftTarget.minAllyDist < pretrackData.left.minAlly) pretrackData.left.minAlly = leftTarget.minAllyDist;
    if (leftTarget.minEnemyDist < pretrackData.left.minEnemy) pretrackData.left.minEnemy = leftTarget.minEnemyDist;
    if (rightTarget.minAllyDist < pretrackData.right.minAlly) pretrackData.right.minAlly = rightTarget.minAllyDist;
    if (rightTarget.minEnemyDist < pretrackData.right.minEnemy) pretrackData.right.minEnemy = rightTarget.minEnemyDist;
  }

  function doScan() {
    if (!running) return;
    let found = false;
    for (let i = 0; i < 2 && !found; i++) {
      const p = i === 0 ? UI.rejuvFriendly : UI.rejuvEnemy;
      if (!p?.IsValid?.()) continue;
      try {
        if (p.BHasClass("RejuvCount_1") || p.BHasClass("RejuvCount_2") || p.BHasClass("RejuvCount_3") || p.BHasClass("RejuvCount_4")) {
          found = true;
          break;
        }
        const k = p.Children();
        if (k) {
          for (let j = 0; j < k.length; j++) {
            const c = k[j];
            if (c.BHasClass("RejuvCount_1") || c.BHasClass("RejuvCount_2") || c.BHasClass("RejuvCount_3") || c.BHasClass("RejuvCount_4")) {
              found = true;
              break;
            }
          }
        }
      } catch {}
    }
    if (spawnWait && found && !lastFound) {
      claimCnt++;
      const t = gTime();
      startBuff(t);
      startPhase(claimCnt > 2 ? 3 : claimCnt, t);
    }
    lastFound = found;
  }

  function showSpawn() {
    setRejuvPhaseDisplay("Spawn", SEQ[idx].n, null);
    resetImg();
    if (UI.rImg?.IsValid?.()) {
      try { UI.rImg.AddClass("white"); } catch {}
    }
    spawnWait = true;
    lastFound = false;
    tick = TICK_FAST;
  }

  function setRejuvImage(src) {
    if (!UI.rImg?.IsValid?.()) return;
    if (src === WRITE_CACHE["rejuvImage"]) return;
    try {
      if (typeof UI.rImg.SetImage === "function") {
        UI.rImg.SetImage(src);
      } else {
        UI.rImg["src"] = src;
      }
      WRITE_CACHE["rejuvImage"] = src;
    } catch {}
  }

  function startBuff(now) {
    buffStart = now;
    buffCnt = REJUV_DUR;
    setMiniCardState(true, true);
    writeText("miniText", null, formatTime(buffCnt, "pad"), UI.rejuvMiniTime, null);
  }

  function setRejuvPhaseDisplay(text, number, imageIndex) {
    writeText("rejuvTextBase", "rejuvTextClip", text, UI.rLab, UI.rLabClip);
    setPanelText(UI.rNum, number);
    if (imageIndex !== null) setImg(imageIndex);
  }
  function endBuff() {
    buffStart = 0;
    buffCnt = 0;
    WRITE_CACHE["miniText"] = "";
    setMiniCardState(NEUTRAL_ACTIVE["bot"] || NEUTRAL_ACTIVE["medium"] || NEUTRAL_ACTIVE["card"], false);
  }

  function startPhase(t, now) {
    spawnWait = false;
    idx = t < 0 ? 0 : t > 3 ? 3 : t;
    counter = SEQ[idx].d;
    phaseStart = now;
    setRejuvPhaseDisplay(formatTime(counter, "pad"), SEQ[idx].n, idx);
    if (UI.rLabClip?.IsValid?.()) {
      try {
        UI.rLabClip.style.clip = "rect(0%,0%,100%,0%)";
        UI.rLabClip.text = "";
      } catch {}
    }
    WRITE_CACHE["rejuvClip"] = "rect(0%,0%,100%,0%)";
    WRITE_CACHE["rejuvTextClip"] = "";
    prunePlayerState(Date.now(), true);
  }

  function startPhaseAuto(now) {
    spawnWait = false;
    if (claimCnt === 0) {
      idx = 0;
      phaseStart = now;
      counter = 0;
      showSpawn();
      return;
    }
    let c = 0;
    for (let i = 0; i < 4; i++) {
      if (now < c + SEQ[i].d) {
        idx = i;
        phaseStart = c;
        counter = c + SEQ[i].d - now;
        setRejuvPhaseDisplay(formatTime(counter, "pad"), SEQ[i].n, i);
        return;
      }
      c += SEQ[i].d;
    }
    const ld = SEQ[3].d;
    const w = (now - c) % BRIDGE_DUR % ld;
    idx = 3;
    phaseStart = now - w;
    counter = ld - w;
    setRejuvPhaseDisplay(formatTime(counter, "pad"), "3", 3);
  }

  function setImg(i) {
    resetImg();
    if (i > 0 && UI.rImg?.IsValid?.()) {
      try {
        UI.rImg.AddClass("reverse");
        UI.rImg.AddClass("rotating");
      } catch {}
      _imgRotateHnd = $.Schedule(0.8, () => {
        if (UI.rImg?.IsValid?.()) {
          try { UI.rImg.RemoveClass("rotating"); } catch {}
        }
        _imgRotateHnd = null;
      });
    }
  }

  function resetImg() {
    if (_imgRotateHnd) {
      try { $.CancelScheduled(_imgRotateHnd); } catch {}
      _imgRotateHnd = null;
    }
    if (!UI.rImg?.IsValid?.()) return;
    try {
      UI.rImg.RemoveClass("rotating");
      UI.rImg.RemoveClass("reverse");
      UI.rImg.RemoveClass("white");
    } catch {}
  }

  function enterNeutralMode() {
    if (!UI.rejuv?.IsValid?.()) return;
    if (_neutralModeHnd) {
      try { $.CancelScheduled(_neutralModeHnd); } catch {}
      _neutralModeHnd = null;
    }
    try {
      UI.rejuv.RemoveClass("neutral-exiting");
      UI.rejuv.AddClass("neutral-mode");
      UI.rejuv.AddClass("neutral-entering");
    } catch {}
    _neutralModeHnd = $.Schedule(NEUTRAL_TRANSITION_MS / 1000, () => {
      if (UI.rejuv?.IsValid?.()) {
        try { UI.rejuv.RemoveClass("neutral-entering"); } catch {}
      }
      _neutralModeHnd = null;
    });
  }

  function exitNeutralMode(skipAnimation, onDone) {
    if (!UI.rejuv?.IsValid?.()) return;
    if (_neutralModeHnd) {
      try { $.CancelScheduled(_neutralModeHnd); } catch {}
      _neutralModeHnd = null;
    }
    try { UI.rejuv.RemoveClass("neutral-entering"); } catch {}
    if (skipAnimation) {
      try {
        UI.rejuv.RemoveClass("neutral-exiting");
        UI.rejuv.RemoveClass("neutral-mode");
      } catch {}
      return;
    }
    try { UI.rejuv.AddClass("neutral-exiting"); } catch {}
    _neutralModeHnd = $.Schedule(NEUTRAL_TRANSITION_MS / 1000, () => {
      if (UI.rejuv?.IsValid?.()) {
        try {
          UI.rejuv.RemoveClass("neutral-mode");
          UI.rejuv.RemoveClass("neutral-exiting");
        } catch {}
      }
      if (onDone) {
        try { onDone(); } catch {}
      }
      _neutralModeHnd = null;
    });
  }

  function setNeutralBadge(panel, src) {
    if (!panel?.IsValid?.()) return;
    try { panel.SetImage(src); } catch {}
  }
  function computeNeutralPhase(now) {
    for (let i = 0; i < NEUTRAL_PHASES.length; i++) {
      const phase = NEUTRAL_PHASES[i];
      if (now >= phase.start && now <= phase.end) return phase;
    }
    return null;
  }
  function updateNeutralOverrides(now) {
    const activePhase = computeNeutralPhase(now);

    for (let i = 0; i < NEUTRAL_PHASES.length; i++) {
      const phase = NEUTRAL_PHASES[i];
      if (activePhase && activePhase.key === phase.key) continue;
      if (!NEUTRAL_ACTIVE[phase.key]) continue;
      NEUTRAL_ACTIVE[phase.key] = false;
      if (phase.key === "card") {
        setPanelClass(UI.rejuv, "neutral-card-mode", false);
        setNeutralBadge(UI.spawnBadge2, NEUTRAL_SMALL_BADGE_SRC);
        exitNeutralMode(false, () => { setRejuvImage(REJUV_ICON_SRC); setImg(idx); });
      } else {
        if (phase.key === "medium") setNeutralBadge(UI.spawnBadge, NEUTRAL_SMALL_BADGE_SRC);
        exitNeutralMode(false, () => { setRejuvImage(REJUV_ICON_SRC); setImg(idx); });
      }
      writePanelStyle("rejuvClipColor", UI.rLabClip, "color", "#ffffff");
    }

    if (!activePhase) {
      return false;
    }

    if (!NEUTRAL_ACTIVE[activePhase.key]) {
      NEUTRAL_ACTIVE[activePhase.key] = true;
      if (activePhase.key === "medium") setNeutralBadge(UI.spawnBadge, activePhase.badge);
      if (activePhase.key === "card") {
        setPanelClass(UI.rejuv, "neutral-card-mode", true);
        setNeutralBadge(UI.spawnBadge2, activePhase.badge);
      }
      enterNeutralMode();
      setRejuvImage(activePhase.image || NEUTRAL_BOT_ICON_SRC);
      resetImg();
    }

    const rem = Math.max(0, activePhase.end - now);
    counter = rem;
    writeText("rejuvTextBase", "rejuvTextClip", formatTime(rem, "pad"), UI.rLab, UI.rLabClip);
    const p = Math.floor(rem / (activePhase.end - activePhase.start) * 100);
    const clip = "rect(0%," + p + "%,100%,0%)";
    writePanelStyle("rejuvClip", UI.rLabClip, "clip", clip);
    writePanelStyle("rejuvClipColor", UI.rLabClip, "color", NEUTRAL_BOT_PROGRESS_COLOR);
    tick = TICK_FAST;
    return true;
  }

  function setObjectiveCardsActive(active) {
    const enabled = !!active;
    if (WRITE_CACHE["riftActive"] !== enabled) {
      setPanelClass(UI.riftCard, "active", enabled);
      WRITE_CACHE["riftActive"] = enabled;
    }
    if (WRITE_CACHE["urnActive"] !== enabled) {
      setPanelClass(UI.urnCard, "active", enabled);
      WRITE_CACHE["urnActive"] = enabled;
    }
  }

  function setObjectiveCardClass(cacheKey, panel, className, enabled) {
    const next = !!enabled;
    if (WRITE_CACHE[cacheKey] === next) return;
    setPanelClass(panel, className, next);
    WRITE_CACHE[cacheKey] = next;
  }

  function observeRiftMarker(markerSeen, warningActive, now) {
    const seen = !!markerSeen;
    const warning = seen && !!warningActive;
    const earliestNextWarning = _riftObservedSpawn + RIFT_INTERVAL - RIFT_INTERVAL_VARIANCE - RIFT_GLOBAL_WARNING;
    if (warning && !_riftWarningActive && (_riftObservedSpawn <= 0 || now >= earliestNextWarning)) {
      _riftObservedSpawn = now + RIFT_GLOBAL_WARNING;
    }
    _riftMarkerSeen = warning;
    _riftWarningActive = warning;
  }

  function makeRiftState(text, sub, inWindow, warning, confirmed) {
    return { text: text, sub: sub, inWindow: inWindow, warning: warning, confirmed: confirmed };
  }
  function computeRiftState(now) {
    if (_riftMarkerSeen) {
      if (_riftWarningActive) {
        const remaining = Math.max(0, _riftObservedSpawn - now);
        return makeRiftState(
          remaining > 0 ? formatTime(remaining, "compact") : "NOW",
          "RIFT",
          remaining <= 0,
          remaining > 0,
          _riftObservedSpawn >= now
        );
      }
      return makeRiftState("NOW", "RIFT", true, false, _riftObservedSpawn >= now);
    }

    if (_riftObservedSpawn > 0 && now <= _riftObservedSpawn) {
      const remaining = Math.max(0, _riftObservedSpawn - now);
      return makeRiftState(
        remaining > 0 ? formatTime(remaining, "compact") : "NOW",
        "RIFT",
        remaining <= 0,
        remaining > 0,
        true
      );
    }

    let cycle = 0;
    const observed = _riftObservedSpawn > 0;
    let anchor = observed ? _riftObservedSpawn + RIFT_INTERVAL : RIFT_FIRST_SPAWN;
    let variance = RIFT_INTERVAL_VARIANCE;
    let windowEnd = anchor + variance;

    // Each unknown interval adds another independent ±1 minute roll.
    while (now > windowEnd) {
      cycle++;
      anchor = (observed ? _riftObservedSpawn : RIFT_FIRST_SPAWN) + (cycle + (observed ? 1 : 0)) * RIFT_INTERVAL;
      variance = (cycle + 1) * RIFT_INTERVAL_VARIANCE;
      windowEnd = anchor + variance;
    }

    const windowStart = anchor - variance;
    const warningStart = Math.max(0, windowStart - RIFT_EARLY_WARNING);
    if (now >= windowStart) {
      return makeRiftState("RIFT", "±" + Math.floor(variance / 60) + "m", true, false, false);
    }
    return makeRiftState(
      formatTime(Math.max(0, windowStart - now), "compact"),
      "RIFT",
      false,
      now >= warningStart,
      false
    );
  }
  function computeUrnRemaining(now) {
    if (now <= URN_FIRST_SPAWN) return URN_FIRST_SPAWN - now;
    return URN_INTERVAL - ((now - URN_FIRST_SPAWN) % URN_INTERVAL);
  }

  function computeUrnState(now) {
    const remaining = computeUrnRemaining(now);
    return { remaining: remaining, warning: remaining <= URN_EARLY_WARNING };
  }

  function updateObjectiveTimers(now, snapshot) {
    if (!panelValid(UI.riftCard) && !panelValid(UI.urnCard)) {
      _riftHot = false;
      return;
    }
    if (!running || isHideout()) {
      setObjectiveCardsActive(false);
      _riftHot = false;
      return;
    }
    setObjectiveCardsActive(true);

    if (snapshot) observeRiftMarker(snapshot.riftMarkerSeen, snapshot.riftWarningActive, now);

    const rift = computeRiftState(now);
    _riftHot = !!(rift.inWindow || _riftWarningActive || rift.confirmed);
    writeText("riftText", null, rift.text, UI.riftTime, null);
    writeText("riftSubText", null, rift.sub, UI.riftSubTime, null);
    setObjectiveCardClass("riftWindow", UI.riftCard, "rift-window", rift.inWindow);
    setObjectiveCardClass("riftWarning", UI.riftCard, "rift-warning", rift.warning);
    setObjectiveCardClass("riftConfirmed", UI.riftCard, "rift-confirmed", rift.confirmed);

    const urn = computeUrnState(now);
    writeText("urnText", null, formatTime(urn.remaining, "compact"), UI.urnTime, null);
    writeText("urnSubText", null, "URN", UI.urnSubTime, null);
    setObjectiveCardClass("urnWarning", UI.urnCard, "urn-warning", urn.warning);
  }

  function cancelScheduledHandle(owner, key) {
    if (!owner[key]) return;
    try { $.CancelScheduled(owner[key]); } catch {}
    owner[key] = null;
  }
  function writeSideGlow(sideIndex, type, enemyClaimed) {
    const side = SIDES[sideIndex];
    const panel = side?.glow;
    if (!panel?.IsValid?.()) return;
    const cls = type ? GLOW_CLASS_MAP[type] : null;
    if (side.activeGlow && side.activeGlow !== cls) {
      try {
        panel.RemoveClass(side.activeGlow);
        side.activeGlow = null;
      } catch {}
    }
    if (cls && !side.activeGlow) {
      try {
        panel.AddClass(cls);
        side.activeGlow = cls;
      } catch {}
    }
    if (enemyClaimed === true) {
      cancelScheduledHandle(side, "enemyGlowHandle");
      try { panel.AddClass("glow-enemy"); } catch {}
      side.enemyGlowHandle = $.Schedule(3, () => {
        if (panel?.IsValid?.()) {
          try { panel.RemoveClass("glow-enemy"); } catch {}
        }
        side.enemyGlowHandle = null;
      });
    } else if (enemyClaimed === false) {
      cancelScheduledHandle(side, "enemyGlowHandle");
      try { panel.RemoveClass("glow-enemy"); } catch {}
    }
  }

  function resetClaimBox(claimBox) {
    if (!claimBox?.IsValid?.()) return false;
    try {
      claimBox.RemoveClass("active");
      claimBox.RemoveClass("ally-claim");
      claimBox.RemoveClass("enemy-claim");
      return true;
    } catch { return false; }
  }
  function setClaimSide(sideIndex, active, enemyClaimed, powerupType, nowMs) {
    const side = SIDES[sideIndex];
    if (!side) return;
    cancelScheduledHandle(side, "claimTimeout");
    cancelScheduledHandle(side, "animHandle");
    const claimBox = side.claim;
    if (!active) {
      resetClaimBox(claimBox);
      setPanelClass(side.timer, "active", false);
      side.claimStart = 0;
      side.lastTimer = "";
      side.lastScale = -1;
      side.lastOpacity = -1;
      return;
    }
    if (!resetClaimBox(claimBox) || !side.icon?.IsValid?.()) return;
    const iconSrc = POWERUP_ICONS[powerupType];
    if (iconSrc) {
      try { side.icon.style.backgroundImage = 'url("' + iconSrc + '")'; } catch {}
    }
    setPanelClass(claimBox, "ally-claim", !enemyClaimed);
    setPanelClass(claimBox, "enemy-claim", !!enemyClaimed);
    const initialText = formatTime(POWERUP_BUFF_DUR, "compact");
    setPanelText(side.timer, initialText);
    setPanelClass(side.timer, "active", true);
    side.lastTimer = initialText;
    side.lastScale = -1;
    side.lastOpacity = -1;
    side.claimStart = nowMs || Date.now();
    side.animHandle = $.Schedule(0.016, () => {
      if (claimBox?.IsValid?.()) {
        try { claimBox.AddClass("active"); } catch {}
      }
      side.animHandle = null;
    });
    side.claimTimeout = $.Schedule(POWERUP_BUFF_DUR, () => {
      setClaimSide(sideIndex, false, false, "", Date.now());
    });
  }

  function updateClaims(nowMs) {
    if (SIDES[0].claimStart <= 0 && SIDES[1].claimStart <= 0) return;
    const now = nowMs || Date.now();
    for (let i = 0; i < SIDES.length; i++) {
      const side = SIDES[i];
      if (side.claimStart <= 0) continue;
      const elapsed = (now - side.claimStart) / 1000;
      const rem = Math.max(0, POWERUP_BUFF_DUR - elapsed);
      const pct = rem / POWERUP_BUFF_DUR;
      const t = formatTime(rem, "compact");
      if (t !== side.lastTimer && setPanelText(side.timer, t)) side.lastTimer = t;
      if (side.ring?.IsValid?.()) {
        const sc = 0.5 + pct * 0.5;
        const op = 0.3 + pct * 0.7;
        try {
          if (sc !== side.lastScale) {
            side.ring.style.preTransformScale2d = sc;
            side.lastScale = sc;
          }
          if (op !== side.lastOpacity) {
            side.ring.style.opacity = op;
            side.lastOpacity = op;
          }
        } catch {}
      }
      if (rem <= 0) setClaimSide(i, false, false, "", now);
    }
  }

  function prunePlayerState(nowMs, forceAll) {
    const now = nowMs || Date.now();
    for (const k in _playerState) {
      const st = _playerState[k];
      if (!st) {
        delete _playerState[k];
        continue;
      }
      if (_lingerState[k]) continue;
      if (forceAll || now - (st.lastSeenMs || 0) > PLAYER_STATE_STALE_MS) delete _playerState[k];
    }
  }

  function scanPowerups(nowMs, snapshot, forceFreshSnapshot) {
    const mm = findMinimap();
    if (!mm) {
      return;
    }
    try {
      const now = nowMs || Date.now();
      const snap = snapshot || collectMinimapSnapshot(now, !!forceFreshSnapshot);
      const allPowerups = snap?.powerupSpawns || [];
      if (!allPowerups.length) {
        return;
      }
      const powerups = trackedPowerups;
      let powerupCount = 0;
      for (let i = 0, len = allPowerups.length; i < len; i++) {
        const pw = allPowerups[i];
        if (!pw?.isActive) continue;
        let entry = powerups[powerupCount];
        if (!entry) {
          entry = { type: "", x: 0, y: 0, panel: null, side: 0, claimed: false, minAllyDist: Infinity, minEnemyDist: Infinity, _scanAlly: Infinity, _scanEnemy: Infinity };
          powerups[powerupCount] = entry;
        }
        entry.type = pw.type;
        entry.x = pw.xPct;
        entry.y = pw.yPct;
        entry.panel = pw.panel;
        entry.claimed = false;
        entry.minAllyDist = Infinity;
        entry.minEnemyDist = Infinity;
        entry._scanAlly = Infinity;
        entry._scanEnemy = Infinity;
        powerupCount++;
      }
      powerups.length = powerupCount;
      if (powerups.length === 0) {
        return;
      }
      powerups.sort((a, b) => a.x - b.x);
      const inverted = mm.BHasClass?.("invert_map");
      let leftGlowType = null;
      let rightGlowType = null;
      for (let i = 0, len = powerups.length; i < len; i++) {
        const base = i === 0 ? 0 : 1;
        const side = inverted ? 1 - base : base;
        powerups[i].side = side;
        if (side === 0) leftGlowType = powerups[i].type;
        else rightGlowType = powerups[i].type;
      }
      writeSideGlow(0, leftGlowType, false);
      writeSideGlow(1, rightGlowType, false);

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
        if (p.panel?.IsValid?.()) stillActive = p.panel.BHasClass("active");
      } catch {}
      p._monitorActive = stillActive;
      if (stillActive) {
        allClaimed = false;
        continue;
      }
      _nearestTargets[targetCount++] = p;
    }
    if (targetCount > 0 && players.length > 0) computeNearestForTargets(players, _nearestTargets, targetCount, nowMs, true);
    for (let i = 0, len = trackedPowerups.length; i < len; i++) {
      const p = trackedPowerups[i];
      if (p.claimed) continue;
      if (p._monitorActive) {
        allClaimed = false;
      } else {
        const allyClose = p.minAllyDist <= CLAIM_RADIUS_SQ;
        const enemyClose = p.minEnemyDist <= CLAIM_RADIUS_SQ;
        const enemyClaimed = !allyClose || (enemyClose && p.minEnemyDist < p.minAllyDist);
        writeSideGlow(p.side, null, enemyClaimed ? true : false);
        setClaimSide(p.side, true, enemyClaimed, p.type, nowMs || Date.now());
        p.claimed = true;
      }
    }
    _nearestTargets.length = 0;
    if (allClaimed) {
      writeSideGlow(0, null, null);
      writeSideGlow(1, null, null);
      monitoringActive = false;
      trackedPowerups.length = 0;
    }
  }

  function showLinger(enemyId, btn) {
    if (_lingerState[enemyId]) return;
    if (!btn || !btn.IsValid?.()) return;
    let armed = false;
    let qLabel = null;
    let createdLabel = false;
    try {
      const container = UI.minimapContainer;
      if (!container?.IsValid?.()) return;
      const mm = UI["minimap"];
      const lingerPosition = computeLingerLabelPosition(btn, container, mm);
      const qId = "LingerQ_" + enemyId;
      qLabel = container.FindChildTraverse(qId);
      if (!panelValid(qLabel)) {
        qLabel = $.CreatePanel("Label", container, qId);
        createdLabel = true;
        qLabel.AddClass("linger-question-child");
        qLabel.text = "?";
      }
      qLabel.style.position = lingerPosition.x + "% " + lingerPosition.y + "% 0px";

      const state = {
        hideHandle: null,
        btn: btn,
        qLabel: qLabel,
        previousHitTest: btn["hittest"],
        previousHitTestChildren: btn["hittestchildren"],
        previousOpacity: btn.style.opacity,
        previousAcceptsInput: typeof btn["BAcceptsInput"] === "function" ? !!btn["BAcceptsInput"]() : null,
        previousAcceptsFocus: typeof btn["BAcceptsFocus"] === "function" ? !!btn["BAcceptsFocus"]() : null
      };
      _lingerState[enemyId] = state;
      _lingerCount++;
      armed = true;

      btn["hittest"] = false;
      btn["hittestchildren"] = false;
      if (typeof btn["SetAcceptsInput"] === "function") btn["SetAcceptsInput"](false);
      if (typeof btn["SetAcceptsFocus"] === "function") btn["SetAcceptsFocus"](false);
      btn.style.opacity = "0.5";
      qLabel.AddClass("active");
      state.hideHandle = $.Schedule(LINGER_DURATION, () => removeLinger(enemyId, false));
    } catch {
      if (armed) {
        removeLinger(enemyId, true);
      } else if (createdLabel) {
        try {
          if (qLabel?.IsValid?.()) qLabel.DeleteAsync(0);
        } catch {}
      }
    }
  }

  function removeLinger(enemyId, cancelHandle) {
    const state = _lingerState[enemyId];
    if (!state) return;
    try {
      if (cancelHandle && state.hideHandle) $.CancelScheduled(state.hideHandle);
    } catch {}
    const btn = state.btn;
    if (panelValid(btn)) {
      try { btn.style.opacity = state.previousOpacity; } catch {}
      try { btn["hittest"] = state.previousHitTest; } catch {}
      try { btn["hittestchildren"] = state.previousHitTestChildren; } catch {}
      try {
        if (state.previousAcceptsInput !== null && typeof btn["SetAcceptsInput"] === "function") {
          btn["SetAcceptsInput"](state.previousAcceptsInput);
        }
      } catch {}
      try {
        if (state.previousAcceptsFocus !== null && typeof btn["SetAcceptsFocus"] === "function") {
          btn["SetAcceptsFocus"](state.previousAcceptsFocus);
        }
      } catch {}
    }
    try {
      if (state.qLabel?.IsValid?.()) state.qLabel.DeleteAsync(0);
    } catch {}
    delete _lingerState[enemyId];
    _lingerCount = Math.max(0, _lingerCount - 1);
  }

  function clearAllLingers() {
    for (const id in _lingerState) removeLinger(id, true);
    _lingerState = Object.create(null);
    _lingerCount = 0;
  }

  function checkEnemyLinger(nowMs, snapshot) {
    const now = nowMs || Date.now();
    const snap = snapshot || collectMinimapSnapshot(now, false);
    const players = snap?.players || [];
    if (!players.length) {
      return;
    }
    try {
      for (let i = 0, len = players.length; i < len; i++) {
        const pl = players[i];
        if (!pl) continue;
        const id = pl.id || getStablePlayerKey(pl.panel, i);
        const ps = markPlayerSeen(id, pl.team || 0, now, _playerSeenToken);
        let team = ps.team || pl.team || 0;
        if (!team && pl.panel?.IsValid?.()) team = classifyTeam(pl.panel);
        if (team !== 2) continue;
        const wasActive = ps.wasActive;
        ps.team = team;
        ps.wasActive = pl.isActive;
        ps.x = pl.xPct;
        ps.y = pl.yPct;
        if (pl.isDead) {
          ps.deadTs = now;
          removeLinger(id, true);
          continue;
        }
        if (wasActive && !pl.isActive) {
          showLinger(id, pl.panel);
        } else if (!wasActive && pl.isActive) {
          removeLinger(id, true);
        }
      }
    } catch {}
  }

  function handleRejuvPingActivate() {
    if (!running) return;
    sendTimerChatMessage("rejuv", gTime());
  }

  function handleBuffPingActivate() {
    if (!running) return;
    sendTimerChatMessage("buff", gTime());
  }

  function buildTimerChatMessage(kind, now) {
    if (!running) return "";
    if (kind === "rejuv") {
      const safeIdx = idx >= 0 && idx < SEQ.length ? idx : 0;
      const rejuvRem = Math.max(0, SEQ[safeIdx].d - (now - phaseStart));
      return spawnWait || rejuvRem <= 0 ? "Rejuv now" : "Rejuv " + formatTime(rejuvRem, "chat");
    }
    return "Bridge " + formatTime(BRIDGE_DUR - (now % BRIDGE_DUR), "chat");
  }

  function resolveChatPanels() {
    try {
      const root = findRoot($.GetContextPanel());
      if (!root?.IsValid?.()) return false;
      const chat = UI.chat?.IsValid?.() ? UI.chat : root.FindChildTraverse("Chat");
      if (chat?.IsValid?.()) UI.chat = chat;
      const controls = chat?.FindChildTraverse?.("ChatControls") || null;
      const input =
        controls?.FindChildTraverse?.("ChatInput") ||
        chat?.FindChildTraverse?.("ChatInput") ||
        root.FindChildTraverse("ChatInput");
      const label =
        controls?.FindChildTraverse?.("ChatTargetLabel") ||
        chat?.FindChildTraverse?.("ChatTargetLabel") ||
        root.FindChildTraverse("ChatTargetLabel");
      if (input?.IsValid?.()) UI.chatInput = input;
      if (label?.IsValid?.()) UI.chatTargetLabel = label;
      return !!(UI.chatInput?.IsValid?.() && UI.chatTargetLabel?.IsValid?.());
    } catch {
      return false;
    }
  }

  const TeamChatIntent = {
    sanitize: function (message) {
      return String(message || "").replace(/["\r\n;]/g, " ").replace(/\s+/g, " ").trim();
    },
    canSend: function (nowMs, lastSendMs, cooldownMs) {
      return Number(nowMs) - Number(lastSendMs || 0) >= Number(cooldownMs || 0);
    },
    isTeamTarget: function (label) {
      if (!label?.IsValid?.()) return false;
      const text = String(label.text || "").trim();
      if (!text || text === "#citadel_chat_placeholder") return false;
      return text !== CHAT_ALL_LABEL && text.indexOf("(ALL)") === -1;
    },
    submit: function (input, message) {
      return submitWithMinimalFocus(input, message);
    },
    retry: function (message, attempt, readyStreak) {
      const resolved = resolveChatPanels();
      const input = UI.chatInput;
      const label = UI.chatTargetLabel;
      if (!resolved || !input?.IsValid?.() || !TeamChatIntent.isTeamTarget(label)) {
        if (attempt >= CHAT_RETRY_DELAYS.length - 1) {
          if (DEBUG_PING_TIMER) dbgPing("send:not-ready", { attempt, label: label?.text || "" });
          return;
        }
        $.Schedule(CHAT_RETRY_DELAYS[attempt + 1], () => TeamChatIntent.retry(message, attempt + 1, 0));
        return;
      }
      if (readyStreak < 1 && attempt < CHAT_RETRY_DELAYS.length - 1) {
        $.Schedule(CHAT_RETRY_DELAYS[attempt + 1], () => TeamChatIntent.retry(message, attempt + 1, readyStreak + 1));
        return;
      }
      TeamChatIntent.submit(input, message);
    },
    send: function (message, wallNowMs) {
      if (!TeamChatIntent.canSend(wallNowMs, _lastTimerChatMs, CHAT_SEND_COOLDOWN_MS)) return false;
      const safe = TeamChatIntent.sanitize(message);
      if (!safe) return false;
      _lastTimerChatMs = wallNowMs;
      UI.chatInput = null;
      UI.chatTargetLabel = null;
      try { $.DispatchEvent("CitadelConCommand", "say_chat_team"); } catch {}
      $.Schedule(CHAT_RETRY_DELAYS[0], () => TeamChatIntent.retry(safe, 0, 0));
      return true;
    }
  };

  function sendTimerChatMessage(kind, now) {
    const message = buildTimerChatMessage(kind, now);
    if (!message) return;
    TeamChatIntent.send(message, Date.now());
  }

  function submitWithMinimalFocus(chatInput, message) {
    try { $.DispatchEvent("SetInputFocus", chatInput); } catch {}
    try {
      chatInput.text = message;
      $.Schedule(0, () => {
        try { $.DispatchEvent("CitadelChatInputSubmitted", chatInput); } catch {}
        try { chatInput.text = ""; } catch {}
        closeChatUi(chatInput);
      });
      return true;
    } catch {
      closeChatUi(chatInput);
      return false;
    }
  }

  function closeChatUi(chatInput) {
    const chat = UI.chat?.IsValid?.() ? UI.chat : null;
    try { $.DispatchEvent("CitadelChatInputBlur", chatInput); } catch {}
    try { $.DispatchEvent("DropInputFocus", chatInput); } catch {}
    if (chat?.IsValid?.()) {
      try { $.DispatchEvent("CitadelChatInputBlur", chat); } catch {}
      try { $.DispatchEvent("DropInputFocus", chat); } catch {}
    }
    $.Schedule(0, () => {
      try { $.DispatchEvent("CitadelChatInputBlur", chatInput); } catch {}
    });
  }

  function runMinimapLane(realNowMs, gameNowSec) {
    if (!running || isHideout()) return null;
    return collectMinimapSnapshot(realNowMs, false);
  }

  function runTimerLane(realNowMs, gameNowSec, snapshot) {
    if (isDue("rejuv", realNowMs, 1000)) {
      if (gameNowSec !== lastSec) {
        lastSec = gameNowSec;
        if (idx < 0 || idx >= SEQ.length) idx = 0;
        const neutralActive = updateNeutralOverrides(gameNowSec);
        if (!neutralActive) {
          if (spawnWait) {
            counter = 0;
            writeText("rejuvTextBase", "rejuvTextClip", "Spawn", UI.rLab, UI.rLabClip);
            tick = TICK_FAST;
          } else {
            const rem = Math.max(0, SEQ[idx].d - (gameNowSec - phaseStart));
            if (rem <= 0) {
              showSpawn();
            } else {
              counter = rem;
              writeText("rejuvTextBase", "rejuvTextClip", formatTime(rem, "pad"), UI.rLab, UI.rLabClip);
              const p = Math.floor(counter / SEQ[idx].d * 100);
              const rejuvClip = "rect(0%," + p + "%,100%,0%)";
              writePanelStyle("rejuvClip", UI.rLabClip, "clip", rejuvClip);
            }
            tick = (spawnWait || rem <= SPAWN_TH) ? TICK_FAST : TICK_NORM;
          }
        }
      }
    }
    const neutralOverride = NEUTRAL_ACTIVE["bot"] || NEUTRAL_ACTIVE["medium"] || NEUTRAL_ACTIVE["card"];

    if (isDue("buff", realNowMs, 1000) && buffStart > 0) {
      buffCnt = computeRejuvBuffRemaining(gameNowSec, buffStart);
      if (!neutralOverride) {
        writeText("miniText", null, formatTime(buffCnt, "pad"), UI.rejuvMiniTime, null);
      }
      if (buffCnt <= 0) endBuff();
    }

    if (isDue("bridge", realNowMs, 1000)) {
      const buffRem = BRIDGE_DUR - (gameNowSec % BRIDGE_DUR);
      writeText("buffTextBase", "buffTextClip", formatTime(buffRem, "pad"), UI.buffLab, UI.buffLabClip);
      const buffPct = buffRem / BRIDGE_DUR;
      const p = Math.floor((1.0 - buffPct) * 100);
      const buffClip = "rect(0%,100%,100%," + p + "%)";
      writePanelStyle("buffClip", UI.buffLabClip, "clip", buffClip);
      const gVal = Math.floor(255 * buffPct);
      const newColor = "rgb(255," + gVal + "," + gVal + ")";
      writePanelStyle("buffClipColor", UI.buffLabClip, "color", newColor);
      if (buffRem <= POWERUP_CHECK_TH && !pretrackActive && !monitoringActive && knownSpawnPos) {
        pretrackActive = true;
        pretrackData.left.minAlly = Infinity;
        pretrackData.left.minEnemy = Infinity;
        pretrackData.right.minAlly = Infinity;
        pretrackData.right.minEnemy = Infinity;
      }
      if (prevBuffRem <= POWERUP_CHECK_TH && prevBuffRem > 0 && buffRem > POWERUP_CHECK_TH) {
        buffResetTs = realNowMs;
        trackedPowerups.length = 0;
        monitoringActive = false;
      }
      prevBuffRem = buffRem;
    }

    if (isDue("miniCard", realNowMs, 1000) && UI.rejuvMiniCard?.IsValid?.()) {
      const buffActive = buffStart > 0;
      setMiniCardState(neutralOverride || buffActive, buffActive && !neutralOverride);
      if (neutralOverride) {
        const safeIdx = idx >= 0 && idx < SEQ.length ? idx : 0;
        const miniRem = Math.max(0, SEQ[safeIdx].d - (gameNowSec - phaseStart));
        writeText("miniText", null, formatTime(miniRem, "pad"), UI.rejuvMiniTime, null);
      } else if (buffActive) {
        const miniBuffRem = computeRejuvBuffRemaining(gameNowSec, buffStart);
        writeText("miniText", null, formatTime(miniBuffRem, "pad"), UI.rejuvMiniTime, null);
      }
    }

    if (isDue("claim", realNowMs, 100)) updateClaims(realNowMs);
    if (isDue("scan", realNowMs, 3000)) doScan();

    const objectiveIntervalMs = _riftHot ? 250 : 1000;
    if (isDue("objective", realNowMs, objectiveIntervalMs)) {
      updateObjectiveTimers(gameNowSec, snapshot);
    }
  }

  function runMaintenanceLane(realNowMs, snapshot) {
    let currentSnapshot = snapshot;
    if (isDue("linger", realNowMs, 300)) {
      const lingerActive = buffResetTs > 0 && realNowMs - buffResetTs < POWERUP_LINGER;
      if (lingerActive && !monitoringActive && realNowMs - lastPowerupScan >= 200) {
        lastPowerupScan = realNowMs;
        scanPowerups(realNowMs, null, true);
      }
      if (!monitoringActive && trackedPowerups.length === 0 && buffResetTs > 0 && realNowMs - buffResetTs >= 3000 && realNowMs - buffResetTs < 4000) {
        scanPowerups(realNowMs, null, true);
      }
      if (realNowMs - lastLingerCheck >= getMinimapWorkInterval(realNowMs)) {
        lastLingerCheck = realNowMs;
        if (currentSnapshot === null) currentSnapshot = collectMinimapSnapshot(realNowMs, false);
        checkEnemyLinger(realNowMs, currentSnapshot);
      }
    }

    if (isDue("pretrack", realNowMs, PRETRACK_INTERVAL) && pretrackActive && knownSpawnPos) {
      if (currentSnapshot === null) currentSnapshot = collectMinimapSnapshot(realNowMs, false);
      doPretrack(realNowMs, currentSnapshot);
    }

    if (isDue("monitor", realNowMs, MONITOR_INTERVAL) && monitoringActive) {
      if (currentSnapshot === null) currentSnapshot = collectMinimapSnapshot(realNowMs, false);
      monitorPowerups(realNowMs, currentSnapshot);
    }

    if (isDue("prune", realNowMs, PLAYER_STATE_PRUNE_INTERVAL_MS)) {
      prunePlayerState(realNowMs, false);
    }
  }

  function loop(gen) {
    if (gen !== _generation) return;
    const rn = Date.now();
    const now = gTime(rn);
    maybeClearNeutralCachesForLowGameTime(now);

    if (!running) {
      if (rn - lastGateChk >= 30000) {
        lastGateChk = rn;
        if (!isHideout()) startRun(now);
      }
      scheduleLoop(gen, LOOP_GATE_DELAY_MS, 0, false);
      return;
    }

    if (rn - lastRunChk >= 60000) {
      lastRunChk = rn;
      if (isHideout()) {
        reset(1);
        loop(_generation);
        return;
      }
    }

    if (lastGlobalSec >= 0 && (now + 5 < lastGlobalSec || (lastGlobalSec > 30 && now <= 2))) {
      reset(1);
      loop(_generation);
      return;
    }

    lastGlobalSec = now;
    const snapshot = runMinimapLane(rn, now);
    runTimerLane(rn, now, snapshot);
    runMaintenanceLane(rn, snapshot);

    scheduleLoop(gen, tick * 1000, getMinimapWorkInterval(rn), _riftHot);
  }

  function boot() {
    const r = findRoot($.GetContextPanel());
    if (!r?.IsValid?.()) return $.Schedule(0.5, boot);
    UI.root = r;
    bindUiPanels(r);
    try {
      globalThis.handleRejuvPingActivate = handleRejuvPingActivate;
      globalThis.handleBuffPingActivate = handleBuffPingActivate;
      $.GetContextPanel().handleRejuvPingActivate = handleRejuvPingActivate;
      $.GetContextPanel().handleBuffPingActivate = handleBuffPingActivate;
    } catch {}
    Object.assign(SIDES[0], { glow: UI.glowLeft, claim: UI.claimLeft, icon: UI.claimIconLeft, ring: UI.claimRingLeft, timer: UI.claimTimerLeft });
    Object.assign(SIDES[1], { glow: UI.glowRight, claim: UI.claimRight, icon: UI.claimIconRight, ring: UI.claimRingRight, timer: UI.claimTimerRight });

    const tb = UI.topBar;
    if (tb) {
      const ch = tb.FindChildTraverse("RejuvenatorCharges");
      if (ch) {
        UI.rejuvFriendly = ch.FindChildTraverse("RejuvenatorFriendly");
        UI.rejuvEnemy = ch.FindChildTraverse("RejuvenatorEnemy");
      }
    }

    if (!UI.rLab || !UI.rNum || !UI.rImg || !UI.buffLab) return $.Schedule(0.5, boot);
    reset(1);
    _generation++;
    const gen = _generation;
    loop(gen);
    watchdogTick(gen);

  }
  // TEST_EXPORTS_BEGIN
  if (typeof module !== "undefined" && module && module.exports) {
    module.exports.__test = module.exports.__test || {};
    module.exports.__test.computeRiftState = computeRiftState;
    module.exports.__test.observeRiftMarker = observeRiftMarker;
    module.exports.__test.computeUrnState = computeUrnState;
    module.exports.__test.computeRejuvBuffRemaining = computeRejuvBuffRemaining;
    module.exports.__test.computeNeutralPhase = computeNeutralPhase;
    module.exports.__test.computeLingerLabelPosition = computeLingerLabelPosition;
    module.exports.__test.updateObjectiveTimers = updateObjectiveTimers;
    module.exports.__test.computeAdaptiveLoopDelayMs = computeAdaptiveLoopDelayMs;
    module.exports.__test.maybeClearNeutralCachesForLowGameTime = maybeClearNeutralCachesForLowGameTime;
    module.exports.__test.scanPowerups = scanPowerups;
    module.exports.__test.setGlowTestUi = function (minimap, glowPanels) {
      UI.minimap = minimap;
      for (let i = 0; i < SIDES.length; i++) {
        SIDES[i].glow = glowPanels?.[i] || null;
        SIDES[i].activeGlow = null;
      }
    };
    module.exports.__test.loop = loop;
    module.exports.__test.setLoopTestState = function (patch) {
      if (patch && Number.isFinite(patch.generation)) _generation = patch.generation;
      if (patch && Number.isFinite(patch.playerSeenToken)) _playerSeenToken = patch.playerSeenToken;
      if (patch && patch.lowTimeCleared !== undefined) _lowTimeCacheCleared = !!patch.lowTimeCleared;
    };
    module.exports.__test.getLoopTestState = function () {
      return { generation: _generation, playerSeenToken: _playerSeenToken, lowTimeCleared: _lowTimeCacheCleared };
    };
    module.exports.__test.setObjectiveTestState = function (patch) {
      running = !!patch?.running;
      UI.hud = patch?.hud || null;
      UI.riftCard = patch?.riftCard || null;
      UI.urnCard = patch?.urnCard || null;
      WRITE_CACHE["riftActive"] = null;
      WRITE_CACHE["urnActive"] = null;
    };
    module.exports.__test.setLingerTestUi = function (container, minimap) {
      UI.minimapContainer = container;
      UI.minimap = minimap;
    };
    module.exports.__test.showLinger = showLinger;
    module.exports.__test.removeLinger = removeLinger;
    module.exports.__test.TeamChatIntent = TeamChatIntent;
  }
  // TEST_EXPORTS_END

  boot();
})();
