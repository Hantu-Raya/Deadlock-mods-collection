(() => {
  "use strict";
  const REJUV_DUR = 180;
  const BRIDGE_DUR = 300;
  const SPAWN_TH = 10;
  const TICK_FAST = 0.1;
  const TICK_NORM = 1;
  const LOOP_GATE_DELAY_MS = 30000;
  const LOOP_INVALID_RETRY_MS = 1000;
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
  const CLAIM_RING_STEPS = 500;
  const DEATH_GRACE_MS = 2000;
  const PLAYER_STATE_STALE_MS = 6000;
  const PLAYER_STATE_PRUNE_INTERVAL_MS = 3000;
  const BUTTON_CACHE_TTL = 800;
  const REJUV_PANEL_RETRY_MS = 5000;
  const LINGER_DURATION = 5;
  const LINGER_FONT_MIN = 10;
  const LINGER_FONT_MAX = 32;
  const MINIMAP_SNAPSHOT_INTERVAL_HOT_MS = 250;
  const MINIMAP_SNAPSHOT_INTERVAL_NORMAL_MS = 500;
  const MINIMAP_SNAPSHOT_INTERVAL_IDLE_MS = 750;
  const DEBUG_PING_TIMER = false;
  const CHAT_RETRY_DELAYS = [0.01, 0.03, 0.06, 0.1, 0.15, 0.25];
  const CHAT_ALL_LABEL = "To (ALL):";
  const CHAT_SEND_COOLDOWN_MS = 300;
  const CHAT_INTENT_TIMEOUT_MS = 2000;
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
    claimRingLeft: "ClaimRingLeft", claimRingRight: "ClaimRingRight", claimBgLeft: "ClaimBgLeft", claimBgRight: "ClaimBgRight",
    claimTimerLeft: "ClaimTimerLeft", claimTimerRight: "ClaimTimerRight",
    spawnBadge: "NeutralSpawnBadge", spawnBadge2: "NeutralSpawnBadge2",
    rejuvMiniCard: "RejuvMiniCard", rejuvMiniTime: "RejuvMiniTime",
    riftCard: "RiftTimerCard", riftTime: "RiftTimerTime", riftSubTime: "RiftTimerSub",
    urnCard: "UrnTimerCard", urnTime: "UrnTimerTime", urnSubTime: "UrnTimerSub",
    rejuvPing: "RejuvPingButton", buffPing: "BuffPingButton"
  };
  const TIMER_HOSTS = [null, null, null, null];
  // TimerOverlayFrame (the movable widget layer, including the claim boxes) sits in .clamp_width; BTTimerDock is an
  // empty 440x440 box at the bottom of #minimap_persp, kept only as the anchor for the default widget spots.
  const TIMER_HOST_SPECS = [
    { id: "TimerOverlayFrame", layout: "file://{resources}/layout/bt_timer_overlay.xml" },
    { id: "MinimapGlowClip", layout: "file://{resources}/layout/bt_minimap_glow.xml" },
    { id: "BTLingerLayer", layout: "file://{resources}/layout/bt_linger_layer.xml" },
    { id: "BTTimerDock", layout: "" }
  ];
  // Movable widgets. Geometry is in layer layout px (window px / actualuiscale). Sizes match hud_timer.css .bt-slot-*;
  // x/y are the old spots inside the 440 dock. A model entry is [x fraction, y fraction, scale 0.5-2, side l|r|t|b].
  // Looked up by the runtime strings spec.kind and "h"/"v", so the keys are quoted: Closure ADVANCED renames bare keys.
  const LAYOUT_BASE = {
    "pill": { "h": [141, 44], "v": [76, 84] }, "card": { "h": [82, 22], "v": [44, 26] }, "claim": { "h": [48, 48], "v": [48, 48] }
  };
  const LAYOUT_SLOTS = [
    { key: "b", id: "BTSlotBuff", kind: "pill", side: "r", x: 268.4, y: 44 },
    { key: "r", id: "BTSlotRejuv", kind: "pill", side: "l", x: 30.8, y: 44 },
    { key: "f", id: "BTSlotRift", kind: "card", side: "t", x: 173.8, y: 31.2 },
    { key: "u", id: "BTSlotUrn", kind: "card", side: "t", x: 222.2, y: 31.2 },
    // Claim boxes: the old buff_claim.css spots (30% in from each side, 8% up from the bottom of the 440 box).
    { key: "cl", id: "BTSlotClaimL", kind: "claim", side: "t", x: 132, y: 356.8 },
    { key: "cr", id: "BTSlotClaimR", kind: "claim", side: "t", x: 260, y: 356.8 }
  ];
  const LAYOUT_SIDES = ["l", "r", "t", "b"];
  // Pills only: "n" = no icon (just the time, on the horizontal pill). Side classes cover all five.
  const LAYOUT_SIDE_CLASSES = ["l", "r", "t", "b", "n"];
  const LAYOUT_HANDLES = ["HandleTL", "HandleTR", "HandleBL", "HandleBR"];
  const LAYOUT_CHROME_PAD = 22;
  const LAYOUT_REMEASURE_MS = 1000;
  // Minimap size (model "m", a fraction of stock): inline ui-scale on #minimap_persp, which scales the whole minimap
  // (and BTTimerDock inside it) around its bottom-right anchor. The dock is 440 layout px wide at stock size.
  const LAYOUT_MAP_SCALE_MIN = 0.5;
  const LAYOUT_MAP_SCALE_MAX = 1.5;
  const LAYOUT_DOCK = 440;
  // How long after a write on #minimap_persp the geometry is projected onto the target instead of measured.
  const LAYOUT_PROJECT_MS = 150;
  // The stock map location label (#minimap_location in #minimap_persp; model "lc": [dx, dy, degrees]). An inline
  // translate in minimap px moves it, so it travels and scales with the minimap, and pre-transform-rotate2d turns it
  // around its centre. The inline transform replaces the stock rotateZ(-30deg), the turn of an absent entry.
  const LAYOUT_LOC_DEG = -30;
  const LAYOUT_LOC_MAX = 1000;
  // Its edit chrome: the dashed box is at least this big (outside a district the label is empty), and the 12 px rotate
  // knob sits LAYOUT_LOC_KNOB px above the label's top edge.
  const LAYOUT_LOC_MIN_W = 60;
  const LAYOUT_LOC_MIN_H = 18;
  // A label with no layout: the stock CSS margins (left, bottom) that place it, and a typical "DISTRICT : building" size.
  const LAYOUT_LOC_MARGIN = [240, 45];
  const LAYOUT_LOC_FALLBACK = [150, 22];
  const LAYOUT_LOC_KNOB = 16;
  const LAYOUT_LOC_KNOB_R = 6;
  // sig: model + measured geometry of the last placement; modelSig/measuredMs: its model part and when it was measured.
  // parts: per slot key, its panels and last placement (layoutSlotParts; "m": the minimap border; "lc": the map location
  // label's chrome). persp:
  // #minimap_persp; mapBox: #minimap_container (the round minimap, measured for its edit border); mapWritten: the
  // "size|spot" this instance last wrote on #minimap_persp ("|" = stock, "?" = nothing written yet, so the first
  // placement always writes: a predecessor may have left its size or spot behind); mapMoved: a spot is written;
  // mapWroteMs: when, for projecting (0 = do not project); mapTouchedMs: when, for re-measuring. loc: the stock
  // #minimap_location (layoutLoc; locSeekMs/locSeeks: when to look for it again, attempts so far); locWritten: the "lc"
  // entry last written on it ("" = stock, "?" = nothing decided yet); locClass: this instance added in_map_district to
  // #minimap_persp to show the label while editing.
  const Layout = {
    model: Object.create(null), editing: false, sig: "", modelSig: "", measuredMs: 0, retries: 0,
    parts: Object.create(null), mapWritten: "?", mapMoved: false, mapWroteMs: 0, mapTouchedMs: -1e9,
    locWritten: "?", locClass: false, locSeekMs: 0, locSeeks: 0,
    /** @type {?} */ persp: null,
    /** @type {?} */ mapBox: null,
    /** @type {?} */ loc: null,
    /** @type {?} */ retryHnd: null,
    /** @type {?} */ api: null
  };
  function bindUiPanels(root) {
    const overlay = TIMER_HOSTS[0];
    const glow = TIMER_HOSTS[1];
    UI.hud = root.FindChildTraverse(PANEL_IDS.hud);
    UI.topBar = root.FindChildTraverse(PANEL_IDS.topBar);
    UI.rLab = overlay.FindChildTraverse(PANEL_IDS.rLab);
    UI.rNum = overlay.FindChildTraverse(PANEL_IDS.rNum);
    UI.rImg = overlay.FindChildTraverse(PANEL_IDS.rImg);
    UI.rejuv = overlay.FindChildTraverse(PANEL_IDS.rejuv);
    UI.buffLab = overlay.FindChildTraverse(PANEL_IDS.buffLab);
    UI.rLabClip = overlay.FindChildTraverse(PANEL_IDS.rLabClip);
    UI.buffLabClip = overlay.FindChildTraverse(PANEL_IDS.buffLabClip);
    UI.spawnBadge = overlay.FindChildTraverse(PANEL_IDS.spawnBadge);
    UI.spawnBadge2 = overlay.FindChildTraverse(PANEL_IDS.spawnBadge2);
    UI.rejuvMiniCard = overlay.FindChildTraverse(PANEL_IDS.rejuvMiniCard);
    UI.rejuvMiniTime = overlay.FindChildTraverse(PANEL_IDS.rejuvMiniTime);
    UI.riftCard = overlay.FindChildTraverse(PANEL_IDS.riftCard);
    UI.riftTime = overlay.FindChildTraverse(PANEL_IDS.riftTime);
    UI.riftSubTime = overlay.FindChildTraverse(PANEL_IDS.riftSubTime);
    UI.urnCard = overlay.FindChildTraverse(PANEL_IDS.urnCard);
    UI.urnTime = overlay.FindChildTraverse(PANEL_IDS.urnTime);
    UI.urnSubTime = overlay.FindChildTraverse(PANEL_IDS.urnSubTime);
    UI.rejuvPing = overlay.FindChildTraverse(PANEL_IDS.rejuvPing);
    UI.buffPing = overlay.FindChildTraverse(PANEL_IDS.buffPing);
    UI.glowLeft = glow.FindChildTraverse(PANEL_IDS.glowLeft);
    UI.glowRight = glow.FindChildTraverse(PANEL_IDS.glowRight);
    UI.claimLeft = overlay.FindChildTraverse(PANEL_IDS.claimLeft);
    UI.claimRight = overlay.FindChildTraverse(PANEL_IDS.claimRight);
    UI.claimIconLeft = overlay.FindChildTraverse(PANEL_IDS.claimIconLeft);
    UI.claimIconRight = overlay.FindChildTraverse(PANEL_IDS.claimIconRight);
    UI.claimRingLeft = overlay.FindChildTraverse(PANEL_IDS.claimRingLeft);
    UI.claimRingRight = overlay.FindChildTraverse(PANEL_IDS.claimRingRight);
    UI.claimTimerLeft = overlay.FindChildTraverse(PANEL_IDS.claimTimerLeft);
    UI.claimTimerRight = overlay.FindChildTraverse(PANEL_IDS.claimTimerRight);
    UI.claimBgLeft = overlay.FindChildTraverse(PANEL_IDS.claimBgLeft);
    UI.claimBgRight = overlay.FindChildTraverse(PANEL_IDS.claimBgRight);
    UI.glowClip = glow;
    UI.minimapContainer = glow.GetParent();
    UI.lingerLayer = TIMER_HOSTS[2];
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
  // Player colours (bt_minimap_settings.js sends them through BTTimerLayout.look): the glow class -> look key.
  // Until a look arrives the CSS colours apply. Quoted: looked up by runtime strings.
  const GLOW_LOOK_KEY = { "glow-gun": "w", "glow-casting": "p", "glow-survival": "v", "glow-movement": "m" };
  const LOOK_KEYS = ["a", "e", "w", "p", "v", "m"];
  /** @type {?Object} */
  let _look = null;
  // Last value cachedWrite put on each (panel, property): layout geometry and look colours on panels only we style.
  const _cachedWrites = new WeakMap();
  const NEUTRAL_PHASES = [
    { key: "bot", start: NEUTRAL_BOT_START_SEC, end: NEUTRAL_BOT_END_SEC, badge: null, image: NEUTRAL_BOT_ICON_SRC },
    { key: "medium", start: NEUTRAL_MEDIUM_START_SEC, end: NEUTRAL_MEDIUM_END_SEC, badge: NEUTRAL_SMALL_BADGE_SRC, image: NEUTRAL_MEDIUM_BADGE_SRC },
    { key: "card", start: NEUTRAL_LARGE_START_SEC, end: NEUTRAL_LARGE_END_SEC, badge: NEUTRAL_LARGE_BADGE_SRC, image: NEUTRAL_VAULT_BADGE_SRC }
  ];
  const NEUTRAL_ACTIVE = { "bot": false, "medium": false, "card": false };
  const SIDES = [
    { name: "LEFT", glow: null, claim: null, icon: null, ring: null, timer: null, bg: null, activeGlow: null, claimTimeout: null, animHandle: null, enemyGlowHandle: null, claimStart: 0, lastTimer: "", lastScale: -1, lastOpacity: -1, sample: false, glowEnemy: false, claimEnemy: false },
    { name: "RIGHT", glow: null, claim: null, icon: null, ring: null, timer: null, bg: null, activeGlow: null, claimTimeout: null, animHandle: null, enemyGlowHandle: null, claimStart: 0, lastTimer: "", lastScale: -1, lastOpacity: -1, sample: false, glowEnemy: false, claimEnemy: false }
  ];
  // Read by isDue() with runtime strings, so the keys are quoted (Closure ADVANCED renames bare keys).
  const LAST_TICK = {
    "rejuv": 0, "buff": 0, "bridge": 0, "miniCard": 0, "claim": 0, "scan": 0,
    "linger": 0, "pretrack": 0, "monitor": 0, "prune": 0, "objective": 0
  };
  const _nearestTargets = [];
  const _minimapSnapshot = {
    players: [],
    powerupSpawns: [],
    riftMarkerSeen: false,
    riftWarningActive: false
  };
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
  let _tCache = -1;
  let _tCacheTs = -Infinity;
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
  let _lingerOff = false;
  let _settingsMinimap = null;
  let _settingsGlowClip = null;
  let _settingsGlowOff = false;
  let _lowTimeCacheCleared = false;
  let _generation = 0;
  let _nextLoopDueMs = 0;
  let _watchdogHnd = null;
  let _rejuvResolveTs = -Infinity;
  let _rejuvReboundPending = false;
  let _lastTimerChatMs = 0;
  let _chatIntentToken = 0;
  let _chatIntentInFlight = null;
  let _riftObservedSpawn = 0;
  let _riftWarningActive = false;
  let _riftHot = false;
  let _instanceGen = 0;
  let _hudRoot = null;
  let _retired = false;
  let _bootHnd = null;
  let _layoutFailures = 0;
  const _chatHandles = new Set();
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
    if (WRITE_CACHE["miniActive"] !== nextActive && setPanelClass(card, "active", nextActive)) {
      WRITE_CACHE["miniActive"] = nextActive;
    }
    if (WRITE_CACHE["miniBuffActive"] !== nextBuffActive && setPanelClass(card, "buff-active", nextBuffActive)) {
      WRITE_CACHE["miniBuffActive"] = nextBuffActive;
    }
  }
  /** @param {boolean=} alreadyValid */
  function resolveMinimapReferenceSize(panel, alreadyValid) {
    const reference = alreadyValid || panel?.IsValid?.() ? panel : null;
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
    LAST_TICK["scan"] = 0;
    LAST_TICK["prune"] = 0;
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
  function scheduleLoopAt(gen, delayMs) {
    _nextLoopDueMs = Date.now() + delayMs;
    hnd = $.Schedule(delayMs / 1000, () => loop(gen));
  }
  function scheduleLoop(gen, baseTickMs, minimapIntervalMs, riftHot) {
    const delayMs = baseTickMs === LOOP_GATE_DELAY_MS
      ? LOOP_GATE_DELAY_MS
      : computeAdaptiveLoopDelayMs(baseTickMs, minimapIntervalMs, riftHot);
    scheduleLoopAt(gen, delayMs);
  }
  function watchdogTick(gen) {
    if (!timerAlive()) { retire(); return; }
    if (gen !== _generation) return;
    _watchdogHnd = null;
    const nowMs = Date.now();
    if (_nextLoopDueMs > 0 && nowMs > _nextLoopDueMs + WATCHDOG_GRACE_MS) {
      dbgPing("watchdog:missed-heartbeat", { generation: gen });
      reset(1);
      boot();
      return;
    }
    _watchdogHnd = $.Schedule(5, () => watchdogTick(gen));
  }
  function startGeneration() {
    _watchdogHnd = cancelScheduled(_watchdogHnd);
    _generation++;
    const gen = _generation;
    loop(gen);
    watchdogTick(gen);
    return gen;
  }
  function reset(f) {
    _generation++;
    hnd = cancelScheduled(hnd);
    _watchdogHnd = cancelScheduled(_watchdogHnd);
    clearPendingChatIntent(undefined, true);
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
    _riftWarningActive = false;
    _riftHot = false;
    // Quoted keys (see NEUTRAL_ACTIVE): a bare-key Object.assign would be renamed by Closure and clear nothing.
    for (const phase of NEUTRAL_PHASES) NEUTRAL_ACTIVE[phase.key] = false;
    _neutralModeHnd = cancelScheduled(_neutralModeHnd);
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
  function gTime(nowMs = Date.now()) {
    const n = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (_tCache >= 0 && n - _tCacheTs < 200) return _tCache;
    let t = -1;
    if (_gameTimePanel?.IsValid?.()) {
      try { t = parseSec(_gameTimePanel.text); } catch {}
    }
    if (t < 0) {
      try {
        let tb = UI.topBar;
        if (!panelValid(tb) && panelValid(UI.root)) {
          tb = UI.root.FindChildTraverse("TopBar");
          UI.topBar = tb;
        }
        if (panelValid(tb)) {
          const a = tb.FindChildrenWithClassTraverse("GameTime");
          if (a?.[0]) {
            const parsed = parseSec(a[0].text);
            if (parsed >= 0) {
              _gameTimePanel = a[0];
              t = parsed;
            }
          }
        }
      } catch {}
    }
    if (t >= 0) {
      _tCache = t;
      _tCacheTs = n;
    }
    return t;
  }
  function parseSec(t) {
    if (t === null || t === undefined) return -1;
    const s = String(t);
    if (s.indexOf(":") < 0 || !/[0-9]/.test(s)) return -1;
    const ci = s.indexOf(":");
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
      // Current stock hud.css only uses this casing.
      return UI.hud.BHasClass("connectedToHideout");
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
  const _lingerMarkerOffset = { x: 0, y: 0 };
  const _lingerMapOffset = { x: 0, y: 0 };
  // Sums layout offsets from panel up to (excluding) ancestor. Returns false when the chain never reaches it.
  function offsetWithinAncestor(panel, ancestor, out) {
    out.x = 0;
    out.y = 0;
    if (!panel || !ancestor) return false;
    let p = panel;
    for (let depth = 0; depth < 12 && p; depth++) {
      if (p === ancestor) return true;
      const x = safeMapCoord(p.actualxoffset);
      const y = safeMapCoord(p.actualyoffset);
      if (x === null || y === null) return false;
      out.x += x;
      out.y += y;
      try { p = typeof p["GetParent"] === "function" ? p["GetParent"]() : null; } catch { return false; }
    }
    return p === ancestor;
  }
  function computeLingerLabelPosition(btn, container, minimap) {
    // Active glow panels expand content bounds; layout bounds remain anchored to the minimap.
    const containerLayoutWidth = Number(container?.actuallayoutwidth);
    const containerLayoutHeight = Number(container?.actuallayoutheight);
    const containerWidth = safePanelExtent(containerLayoutWidth || container?.contentwidth, 404, 8192);
    const containerHeight = safePanelExtent(containerLayoutHeight || container?.contentheight, 404, 8192);
    const minimapWidth = Number(minimap?.actuallayoutwidth || minimap?.contentwidth);
    const minimapHeight = Number(minimap?.actuallayoutheight || minimap?.contentheight);
    const hasMinimapSize = isFinite(minimapWidth) && minimapWidth > 0 && minimapWidth <= 8192
      && isFinite(minimapHeight) && minimapHeight > 0 && minimapHeight <= 8192;
    const minimapSize = hasMinimapSize
      ? resolveMinimapReferenceSize(minimap)
      : { width: containerWidth, height: containerHeight };
    const buttonWidth = safePanelExtent(btn?.actuallayoutwidth || btn?.contentwidth, 32, 512);
    const buttonHeight = safePanelExtent(btn?.actuallayoutheight || btn?.contentheight, 32, 512);
    let inverted = false;
    try { inverted = !!minimap?.["BHasClass"]?.("invert_map"); } catch {}
    let centerXPct;
    let centerYPct;
    if (hasMinimapSize && containerLayoutWidth > 0 && containerLayoutHeight > 0) {
      // Since the 2026-09-29 HUD the 360px hud_minimap sits centred in the 420px container, so place the marker
      // inside hud_minimap first (mirrored there for invert_map, which flips that box), then add its offset.
      // Broken parent chains fall back to treating the marker as a direct hud_minimap child.
      const marker = _lingerMarkerOffset;
      const map = _lingerMapOffset;
      if (!offsetWithinAncestor(btn, minimap, marker)) {
        marker.x = safeMapCoord(btn?.actualxoffset) || 0;
        marker.y = safeMapCoord(btn?.actualyoffset) || 0;
      }
      if (!offsetWithinAncestor(minimap, container, map)) {
        map.x = safeMapCoord(minimap.actualxoffset) || 0;
        map.y = safeMapCoord(minimap.actualyoffset) || 0;
      }
      const left = inverted ? minimapSize.width - marker.x - buttonWidth : marker.x;
      const top = inverted ? minimapSize.height - marker.y - buttonHeight : marker.y;
      centerXPct = (map.x + left + buttonWidth * 0.5) / containerWidth * 100;
      centerYPct = (map.y + top + buttonHeight * 0.5) / containerHeight * 100;
    } else {
      // Without live layout sizes, map the marker's minimap fraction straight onto the container.
      centerXPct = ((safeMapCoord(btn?.actualxoffset) || 0) + buttonWidth * 0.5) / minimapSize.width * 100;
      centerYPct = ((safeMapCoord(btn?.actualyoffset) || 0) + buttonHeight * 0.5) / minimapSize.height * 100;
      if (inverted) {
        centerXPct = 100 - centerXPct;
        centerYPct = 100 - centerYPct;
      }
    }
    // The label takes the marker's size so '?' covers the enemy icon at every minimap scale.
    const labelWidthPct = buttonWidth / containerWidth * 100;
    const labelHeightPct = buttonHeight / containerHeight * 100;
    const uiScale = Number(container?.actualuiscale_y);
    const layoutHeight = buttonHeight / (isFinite(uiScale) && uiScale > 0 ? uiScale : 1);
    const fontSize = Math.max(LINGER_FONT_MIN, Math.min(LINGER_FONT_MAX, Math.round(layoutHeight * 0.9)));
    const leftPct = centerXPct - labelWidthPct * 0.5;
    const topPct = centerYPct - labelHeightPct * 0.5;
    return {
      x: Math.round(Math.max(0, Math.min(100 - labelWidthPct, leftPct)) * 1000) / 1000,
      y: Math.round(Math.max(0, Math.min(100 - labelHeightPct, topPct)) * 1000) / 1000,
      w: Math.round(labelWidthPct * 1000) / 1000,
      h: Math.round(labelHeightPct * 1000) / 1000,
      fontSize: fontSize
    };
  }
  function panelValid(panel) {
    try { return !!(panel && panel.IsValid && panel.IsValid()); } catch {}
    return false;
  }
  // Returns null so callers write `x = cancelScheduled(x)`.
  function cancelScheduled(handle) {
    if (handle) try { $.CancelScheduled(handle); } catch {}
    return null;
  }
  function timerAlive() {
    try {
      return !_retired && _instanceGen > 0 && panelValid($.GetContextPanel()) &&
        panelValid(_hudRoot) && _hudRoot.GetAttributeInt("bt_timer_gen", 0) === _instanceGen;
    } catch { return false; }
  }
  function retire() {
    if (_retired) return;
    _retired = true;
    // Withdraw only our own presence; a successor caches its publication and would not re-add it.
    try {
      if (_settingsMinimap && panelValid(_hudRoot) &&
          _hudRoot.GetAttributeInt("bt_timer_gen", 0) === _instanceGen) {
        setPanelClass(_settingsMinimap, "bt-buff-timer", false);
      }
    } catch {}
    _settingsMinimap = null;
    _settingsGlowClip = null;
    _settingsGlowOff = false;
    _bootHnd = cancelScheduled(_bootHnd);
    reset(0);
    for (const handle of _chatHandles) cancelScheduled(handle);
    _chatHandles.clear();
    _neutralModeHnd = cancelScheduled(_neutralModeHnd);
    _imgRotateHnd = cancelScheduled(_imgRotateHnd);
    // Dotted names: Closure ADVANCED renames these fields, so a string-keyed loop would miss them.
    for (const side of SIDES) {
      side.enemyGlowHandle = cancelScheduled(side.enemyGlowHandle);
      side.animHandle = cancelScheduled(side.animHandle);
      side.claimTimeout = cancelScheduled(side.claimTimeout);
    }
    clearAllLingers();
    Layout.retryHnd = cancelScheduled(Layout.retryHnd);
    // The minimap's spot and size and the label go back to stock only when no successor took over (it applies its own).
    let own = false;
    try { own = panelValid(_hudRoot) && _hudRoot.GetAttributeInt("bt_timer_gen", 0) === _instanceGen; } catch {}
    try {
      if (own && Layout.mapWritten !== "?" && Layout.mapWritten !== "|" && panelValid(Layout.persp)) {
        for (const property of ["uiScale", "align", "position"]) Layout.persp.style[property] = null;
      }
    } catch {}
    try { if (own && Layout.locWritten !== "?" && Layout.locWritten !== "" && panelValid(Layout.loc)) layoutClearLoc(Layout.loc); } catch {}
    // The class this instance added always goes: a successor that is editing adds its own on its next apply.
    layoutLocShown(false);
    Layout.persp = null;
    Layout.mapBox = null;
    Layout.loc = null;
    Layout.mapWritten = "?";
    Layout.locWritten = "?";
    Layout.mapMoved = false;
    // Withdraw the layout API only while it is still ours; a successor publishes its own.
    try { if ($["BTTimerLayout"] === Layout.api) $["BTTimerLayout"] = null; } catch {}
    Layout.api = null;
    for (let i = 0; i < TIMER_HOSTS.length; i++) {
      const host = TIMER_HOSTS[i];
      if (panelValid(host)) try { host.DeleteAsync(0); } catch {}
      TIMER_HOSTS[i] = null;
    }
  }
  function scheduleBoot(delay) {
    cancelScheduled(_bootHnd);
    _bootHnd = $.Schedule(delay, () => {
      _bootHnd = null;
      if (_retired) return;
      if (_instanceGen && !timerAlive()) { retire(); return; }
      boot();
    });
  }
  function ensureTimerHosts() {
    if (!timerAlive()) { retire(); return false; }
    const context = $.GetContextPanel();
    let persp = context;
    try {
      while (panelValid(persp) && persp["id"] !== "minimap_persp") persp = persp.GetParent();
      const container = panelValid(context.GetParent())
        ? context.GetParent() : _hudRoot.FindChildTraverse("HudMinimapContainer");
      const clamp = panelValid(persp) ? persp.GetParent() : null;
      const parents = [clamp, container, container, persp];
      if (parents.some((parent) => !panelValid(parent))) return false;
      Layout.persp = persp;
      const mapBox = container.GetParent();
      Layout.mapBox = panelValid(mapBox) && mapBox["id"] === "minimap_container"
        ? mapBox : persp.FindChildTraverse("minimap_container");
      for (let i = 0; i < TIMER_HOST_SPECS.length; i++) {
        const spec = TIMER_HOST_SPECS[i];
        if (panelValid(TIMER_HOSTS[i])) continue;
        const parent = parents[i];
        for (const child of parent.Children()) {
          if (panelValid(child) && child["id"] === spec.id) child.DeleteAsync(0);
        }
        const host = $.CreatePanel("Panel", parent, spec.id);
        TIMER_HOSTS[i] = host;
        try { host["hittest"] = false; } catch {
          if (panelValid(host)) try { host.DeleteAsync(0); } catch {}
          TIMER_HOSTS[i] = null;
          return false;
        }
        let loaded = !spec.layout;
        if (spec.layout) {
          try { loaded = !!host.BLoadLayout(spec.layout, false, false); } catch {}
        } else {
          try {
            host.style["width"] = "100%";
            host.style["height"] = "440px";
            host.style["verticalAlign"] = "bottom";
          } catch { loaded = false; }
        }
        if (!loaded) {
          _layoutFailures++;
          if (panelValid(host)) try { host.DeleteAsync(0); } catch {}
          TIMER_HOSTS[i] = null;
          return false;
        }
        // The widget layer draws after #minimap_persp.
        if (i === 0) try { parent.MoveChildAfter(host, persp); } catch {}
      }
      return true;
    } catch { return false; }
  }
  function cachedWrite(panel, property, value) {
    if (!panelValid(panel)) return;
    let cache = _cachedWrites.get(panel);
    if (!cache) {
      cache = Object.create(null);
      _cachedWrites.set(panel, cache);
    }
    if (cache[property] === value) return;
    try {
      if (property === "hittest") panel["hittest"] = value;
      else if (property === "draggable") panel["SetDraggable"](value);
      else panel.style[property] = value;
      cache[property] = value;
    } catch {}
  }
  function layoutFinite(value) {
    return isFinite(value) && Math.abs(value) < 1e7;
  }
  // Null until the layer and the dock have a real layout (a fresh panel reports FLT_MAX). write: placement passes also
  // write the model's minimap spot and size on #minimap_persp (the API's metrics() only reads).
  /** @param {boolean=} write */
  function layoutMetrics(write) {
    const layer = TIMER_HOSTS[0];
    const dock = TIMER_HOSTS[3];
    if (!panelValid(layer) || !panelValid(dock)) return null;
    try {
      const scale = Number(layer["actualuiscale_x"]);
      const w = Number(layer["actuallayoutwidth"]) / scale;
      const h = Number(layer["actuallayoutheight"]) / scale;
      const lp = layer["GetPositionWithinWindow"]();
      const dp = dock["GetPositionWithinWindow"]();
      if (!(scale > 0) || !layoutFinite(w) || !layoutFinite(h) || w <= 0 || h <= 0 || !lp || !dp) return null;
      const dockX = (dp["x"] - lp["x"]) / scale;
      const dockY = (dp["y"] - lp["y"]) / scale;
      if (!layoutFinite(dockX) || !layoutFinite(dockY)) return null;
      const dockWinW = Number(dock["actuallayoutwidth"]);
      const dockWinH = Number(dock["actuallayoutheight"]);
      // Default spots and sizes are the stock arrangement in the 440 dock; a resized minimap scales them. Read from the
      // dock's own 440px height: its width is 100% of #minimap_persp, which a HUD mod may widen.
      const ratio = dockWinH / scale / LAYOUT_DOCK;
      // Rounded: layout px carry float noise, and an untouched widget's scale becomes its saved scale once dragged.
      const dockScale = layoutFinite(ratio) && ratio > 0.2 && ratio < 5 ? Math.round(ratio * 1000) / 1000 : 1;
      // #minimap_persp is measured only when the model or an earlier write touches it, or while editing.
      const custom = Layout.model["m"] !== undefined || Layout.model["mp"] !== undefined;
      const persp = custom || Layout.editing || Layout.mapWritten !== "|" ? layoutMeasureBox(Layout.persp, lp, scale) : null;
      const target = persp ? layoutMapTarget(persp, dockScale, w, h) : null;
      if (write === true) layoutWriteMap(target);
      // The engine lays a new spot or size out on a later frame. Right after a write the measured geometry is mapped
      // onto the target (same top-left offsets, scaled by k), so the border and the default spots follow a drag
      // without lag; afterwards the measurement is used as is.
      const projecting = !!(target && persp) && Date.now() - Layout.mapWroteMs < LAYOUT_PROJECT_MS;
      const k = projecting ? target.s / dockScale : 1;
      const fromX = projecting ? persp.x : 0;
      const fromY = projecting ? persp.y : 0;
      const toX = projecting ? target.x : 0;
      const toY = projecting ? target.y : 0;
      const mapBox = Layout.editing ? layoutMeasureBox(Layout.mapBox, lp, scale) : null;
      return {
        scale: scale, w: w, h: h, dockX: toX + (dockX - fromX) * k, dockY: toY + (dockY - fromY) * k,
        dockScale: dockScale * k, dockWinX: dp["x"], dockWinY: dp["y"], dockWinW: dockWinW, dockWinH: dockWinH,
        persp: projecting ? target : persp,
        map: mapBox ? { x: toX + (mapBox.x - fromX) * k, y: toY + (mapBox.y - fromY) * k, w: mapBox.w * k, h: mapBox.h * k } : null,
        loc: Layout.editing ? layoutLocBox(projecting ? target : persp, dockScale * k) : null
      };
    } catch { return null; }
  }
  // A panel's box in layer px; null until it has a layout.
  function layoutMeasureBox(panel, lp, scale) {
    if (!panelValid(panel)) return null;
    try {
      const p = panel["GetPositionWithinWindow"]();
      const bw = Number(panel["actuallayoutwidth"]) / scale;
      const bh = Number(panel["actuallayoutheight"]) / scale;
      if (!p || !(bw > 0 && bw < 1e6 && bh > 0 && bh < 1e6)) return null;
      const x = (p["x"] - lp["x"]) / scale;
      const y = (p["y"] - lp["y"]) / scale;
      return layoutFinite(x) && layoutFinite(y) ? { x: x, y: y, w: bw, h: bh, s: 1 } : null;
    } catch { return null; }
  }
  // Where the model puts #minimap_persp: its size (s, 1 = stock) and top-left box in layer px. A moved minimap ("mp",
  // top-left fractions) is clamped fully on screen; an unmoved one keeps the stock bottom-right anchor (the layer's
  // corner; its 15px margin scales too). Null right after a move was undone: the stock spot is known only once laid out.
  function layoutMapTarget(persp, measuredScale, w, h) {
    const map = Layout.model["m"];
    const spot = Layout.model["mp"];
    const s = map === undefined ? 1 : map;
    const k = s / measuredScale;
    const bw = persp.w * k;
    const bh = persp.h * k;
    if (spot) {
      return {
        s: s, w: bw, h: bh,
        x: Math.max(0, Math.min(w - bw, spot[0] * w)), y: Math.max(0, Math.min(h - bh, spot[1] * h))
      };
    }
    if (Layout.mapMoved) return null;
    return { s: s, w: bw, h: bh, x: w - (w - persp.x) * k, y: h - (h - persp.y) * k };
  }
  // Writes the minimap's size (inline ui-scale) and, once moved, its spot (left/top alignment + position) on
  // #minimap_persp; null hands each back to stock CSS. Writes only on change. True when it wrote.
  function layoutWriteMap(target) {
    const map = Layout.model["m"];
    const scaleValue = map === undefined ? "" : Math.round(map * 100) + "%";
    const round = (value) => Math.round(value * 10) / 10;
    const position = Layout.model["mp"] && target ? round(target.x) + "px " + round(target.y) + "px 0px" : "";
    const written = scaleValue + "|" + position;
    const persp = Layout.persp;
    if (written === Layout.mapWritten || !panelValid(persp)) return false;
    const wasMoved = Layout.mapMoved;
    try {
      persp.style["uiScale"] = scaleValue || null;
      // horizontal-align and vertical-align are aliases of align, and the engine throws on null for an alias
      // (panorama.dll: "Cannot set a property alias to undefined"), so stock alignment comes back by clearing align.
      if (position) {
        persp.style["horizontalAlign"] = "left";
        persp.style["verticalAlign"] = "top";
      } else {
        persp.style["align"] = null;
      }
      persp.style["position"] = position || null;
    } catch { return false; }
    Layout.mapWritten = written;
    Layout.mapMoved = position !== "";
    Layout.mapTouchedMs = Date.now();
    // Back to the stock spot: where that is is known only once laid out, so nothing is projected.
    Layout.mapWroteMs = wasMoved && !position ? 0 : Date.now();
    return true;
  }
  // The stock #minimap_location, found lazily: hud_minimap.xml and its scripts load inside #minimap_container before
  // hud.xml builds that later sibling, so a lookup at boot finds nothing (live 2026-10-10: "loc none", no label chrome).
  // Missing (a hud.xml mod without it), it is looked for again after 1 s, backing off to every 10 s.
  function layoutLoc() {
    if (panelValid(Layout.loc)) return Layout.loc;
    const nowMs = Date.now();
    if (nowMs < Layout.locSeekMs || !panelValid(Layout.persp)) return null;
    Layout.locSeekMs = nowMs + (Layout.locSeeks++ < 10 ? 1000 : 10000);
    try { Layout.loc = Layout.persp.FindChildTraverse("minimap_location"); } catch { Layout.loc = null; }
    return panelValid(Layout.loc) ? Layout.loc : null;
  }
  // Writes the model's label offset and turn on the stock #minimap_location; no entry hands both back to the stock CSS.
  // Needs no layout, so a saved label is in place before it first shows. The bt_loc attribute marks a label some
  // instance wrote: a new instance clears what a predecessor left without touching a label nobody moved.
  function layoutWriteLoc() {
    const entry = Layout.model["lc"];
    const written = entry ? entry.join(",") : "";
    const loc = layoutLoc();
    if (written === Layout.locWritten || !panelValid(loc)) return;
    try {
      if (entry) {
        loc.SetAttributeString("bt_loc", "1");
        loc.style["transform"] = "translate3d(" + entry[0] + "px, " + entry[1] + "px, 0px)";
        loc.style["preTransformRotate2d"] = entry[2] + "deg";
      } else if (Layout.locWritten !== "?" || loc.GetAttributeString("bt_loc", "") === "1") {
        layoutClearLoc(loc);
      }
    } catch { return; }
    Layout.locWritten = written;
  }
  // null clears a base property but throws for an alias (see the alias rule in AGENTS.md); should either of these be
  // one, the stock values are written instead.
  function layoutClearLoc(loc) {
    try { loc.style["transform"] = null; } catch { loc.style["transform"] = "rotateZ(" + LAYOUT_LOC_DEG + "deg)"; }
    try { loc.style["preTransformRotate2d"] = null; } catch { loc.style["preTransformRotate2d"] = "0deg"; }
    loc.SetAttributeString("bt_loc", "");
  }
  // Edit mode shows the label outside a district through the stock rule .in_map_district #minimap_location. A class
  // the engine set is never taken away.
  function layoutLocShown(show) {
    const persp = Layout.persp;
    if (show === Layout.locClass || !panelValid(persp) || !layoutLoc()) return;
    try {
      if (show && persp.BHasClass("in_map_district")) return;
      persp.SetHasClass("in_map_district", show);
      Layout.locClass = show;
    } catch {}
  }
  // The label where the model puts it, in layer px: centre, unturned size, turn and offset (dx/dy in minimap px; f: layer
  // px per minimap px), plus its stock centre. Layout offsets ignore transforms, so the stock box is measured as is.
  // persp: the #minimap_persp box (projected right after a write). A label without a layout (collapsed, e.g. should the
  // in_map_district class on #minimap_persp not reveal it outside a district; unverified in game) gets its stock CSS box
  // (bottom-centre, margin-left 240, margin-bottom 45) at LAYOUT_LOC_FALLBACK size; measured tells which.
  function layoutLocBox(persp, f) {
    const loc = layoutLoc();
    if (!persp || !(f > 0) || !panelValid(loc)) return null;
    try {
      const s = Number(loc["actualuiscale_x"]);
      let lx = Number(loc["actualxoffset"]) / s;
      let ly = Number(loc["actualyoffset"]) / s;
      let lw = Number(loc["actuallayoutwidth"]) / s;
      let lh = Number(loc["actuallayoutheight"]) / s;
      const measured = s > 0 && lw > 0 && lw < 1e6 && lh > 0 && lh < 1e6 && layoutFinite(lx) && layoutFinite(ly);
      if (!measured) {
        lw = LAYOUT_LOC_FALLBACK[0];
        lh = LAYOUT_LOC_FALLBACK[1];
        lx = (persp.w / f + LAYOUT_LOC_MARGIN[0] - lw) / 2;
        ly = persp.h / f - LAYOUT_LOC_MARGIN[1] - lh;
      }
      const entry = Layout.model["lc"];
      const dx = entry ? entry[0] : 0;
      const dy = entry ? entry[1] : 0;
      const sx = persp.x + (lx + lw / 2) * f;
      const sy = persp.y + (ly + lh / 2) * f;
      return {
        cx: sx + dx * f, cy: sy + dy * f, w: lw * f, h: lh * f, f: f, measured: measured,
        deg: entry ? entry[2] : LAYOUT_LOC_DEG, dx: dx, dy: dy, sx: sx, sy: sy
      };
    } catch { return null; }
  }
  function layoutRect(spec, metrics) {
    const entry = Layout.model[spec.key];
    const side = entry ? entry[3] : spec.side;
    // Untouched widgets keep the stock arrangement at any minimap size, so they scale with it (else a 50% minimap
    // packs full-size widgets into half the room); moved widgets keep their own scale.
    const scale = entry ? entry[2] : Math.max(0.5, Math.min(2, metrics.dockScale));
    // Vertical only with the icon on top or bottom; "n" (no icon) is the horizontal pill.
    const size = LAYOUT_BASE[spec.kind][side === "t" || side === "b" ? "v" : "h"];
    const w = size[0] * scale;
    const h = size[1] * scale;
    const x = entry ? entry[0] * metrics.w : metrics.dockX + spec.x * metrics.dockScale;
    const y = entry ? entry[1] * metrics.h : metrics.dockY + spec.y * metrics.dockScale;
    return {
      x: Math.max(0, Math.min(metrics.w - w, x)), y: Math.max(0, Math.min(metrics.h - h, y)),
      w: w, h: h, s: scale, side: side, bw: size[0], bh: size[1]
    };
  }
  // Settings sends the saved or draft model; anything malformed falls back to that widget's (or the minimap's) default.
  function layoutSanitize(model) {
    const clean = Object.create(null);
    if (!model || typeof model !== "object") return clean;
    for (const spec of LAYOUT_SLOTS) {
      const entry = model[spec.key];
      if (!Array.isArray(entry) || entry.length !== 4) continue;
      const x = Number(entry[0]);
      const y = Number(entry[1]);
      const s = Number(entry[2]);
      const sideOk = LAYOUT_SIDES.indexOf(entry[3]) >= 0 || (spec.kind === "pill" && entry[3] === "n");
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1 && s >= 0.5 && s <= 2) || !sideOk) continue;
      clean[spec.key] = [x, y, s, entry[3]];
    }
    const map = model["m"];
    if (typeof map === "number" && map >= LAYOUT_MAP_SCALE_MIN && map <= LAYOUT_MAP_SCALE_MAX && map !== 1) {
      clean["m"] = Math.round(map * 100) / 100;
    }
    const spot = model["mp"];
    if (Array.isArray(spot) && spot.length === 2 && typeof spot[0] === "number" && typeof spot[1] === "number" &&
        spot[0] >= 0 && spot[0] <= 1 && spot[1] >= 0 && spot[1] <= 1) {
      clean["mp"] = [spot[0], spot[1]];
    }
    const loc = model["lc"];
    if (Array.isArray(loc) && loc.length === 3 && loc.every((part) => typeof part === "number") &&
        Math.abs(loc[0]) <= LAYOUT_LOC_MAX && Math.abs(loc[1]) <= LAYOUT_LOC_MAX && loc[2] >= -180 && loc[2] <= 180) {
      clean["lc"] = [loc[0], loc[1], loc[2]];
    }
    return clean;
  }
  /** @param {boolean=} force */
  function placeSlots(force) {
    const modelSig = layoutModelSig(Layout.model, Layout.editing);
    // Both scripts call this every tick. With the model placed last time, the HUD size and the minimap spot (8 native
    // reads) are re-measured at most once a second.
    const nowMs = Date.now();
    if (force !== true && layoutPlacedRecently(modelSig, nowMs)) return true;
    layoutWriteLoc();
    const metrics = layoutMetrics(true);
    if (!metrics) {
      scheduleLayoutRetry();
      return false;
    }
    const map = metrics.map;
    const loc = metrics.loc;
    const sig = modelSig + "@" + metrics.w.toFixed(1) + "," + metrics.h.toFixed(1) + "," +
      metrics.dockX.toFixed(1) + "," + metrics.dockY.toFixed(1) + "," + metrics.dockScale.toFixed(3) +
      (map ? "," + map.x.toFixed(1) + "," + map.y.toFixed(1) + "," + map.w.toFixed(1) : "") +
      (loc ? "," + loc.cx.toFixed(1) + "," + loc.cy.toFixed(1) + "," + loc.w.toFixed(1) + "," + loc.h.toFixed(1) + (loc.measured ? "m" : "s") : "");
    Layout.modelSig = modelSig;
    // For a while after a write on #minimap_persp (until the engine has laid it out) every call re-measures instead
    // of waiting out LAYOUT_REMEASURE_MS; the timer's own loop may place in between and must not settle on stale geometry.
    // So does edit mode until the label (shown by edit mode, on a later frame) has a layout; meanwhile its chrome
    // stands on the stock spot.
    const locPending = Layout.editing && !!loc && !loc.measured;
    Layout.measuredMs = nowMs - Layout.mapTouchedMs < LAYOUT_PROJECT_MS || locPending ? 0 : nowMs;
    if (force !== true && sig === Layout.sig) return true;
    const layer = TIMER_HOSTS[0];
    const round = (value) => Math.round(value * 10) / 10;
    for (const spec of LAYOUT_SLOTS) {
      const parts = layoutSlotParts(layer, spec);
      if (!parts) continue;
      const rect = layoutRect(spec, metrics);
      // A drag moves one widget: the others keep what they were given.
      const placed = (Layout.editing ? "e" : "n") + rect.x + "," + rect.y + "," + rect.s + rect.side;
      if (force !== true && placed === parts.placed) continue;
      const slot = parts.slot;
      const chrome = parts.chrome;
      cachedWrite(slot, "position", round(rect.x) + "px " + round(rect.y) + "px 0px");
      cachedWrite(slot, "uiScale", Math.round(rect.s * 100) + "%");
      for (const side of LAYOUT_SIDE_CLASSES) {
        setPanelClass(slot, "bt-side-" + side, side === rect.side);
        setPanelClass(chrome, "bt-side-" + side, side === rect.side);
      }
      setPanelClass(slot, "bt-placed", true);
      cachedWrite(slot, "hittest", Layout.editing);
      cachedWrite(slot, "draggable", Layout.editing);
      // The chrome is not scaled: 22 px larger than the scaled widget on every side.
      cachedWrite(chrome, "position", round(rect.x - LAYOUT_CHROME_PAD) + "px " + round(rect.y - LAYOUT_CHROME_PAD) + "px 0px");
      cachedWrite(chrome, "width", round(rect.w + 2 * LAYOUT_CHROME_PAD) + "px");
      cachedWrite(chrome, "height", round(rect.h + 2 * LAYOUT_CHROME_PAD) + "px");
      cachedWrite(parts.outline, "width", round(rect.w) + "px");
      cachedWrite(parts.outline, "height", round(rect.h) + "px");
      for (const handle of parts.handles) cachedWrite(handle, "draggable", Layout.editing);
      parts.placed = placed;
    }
    placeMapChrome(layer, map, round);
    placeLocChrome(layer, loc, round);
    setPanelClass(layer, "bt-layout-edit", Layout.editing);
    Layout.sig = sig;
    Layout.retries = 0;
    return true;
  }
  // The minimap's edit border: 22 px outside the minimap like a widget chrome, four corner handles, and a drag area
  // over the minimap (under the widget slots, so widgets on the minimap stay draggable).
  function placeMapChrome(layer, map, round) {
    let parts = Layout.parts["m"];
    if (!parts || !panelValid(parts.chrome)) {
      try {
        parts = {
          chrome: layer.FindChildTraverse("BTSlotMapChrome"), outline: layer.FindChildTraverse("BTSlotMapOutline"),
          grab: layer.FindChildTraverse("BTSlotMapGrab"),
          handles: LAYOUT_HANDLES.map((handle) => layer.FindChildTraverse("BTSlotMap" + handle))
        };
      } catch { return; }
      if (!panelValid(parts.chrome)) return;
      Layout.parts["m"] = parts;
    }
    const editing = Layout.editing && !!map;
    for (const handle of parts.handles) cachedWrite(handle, "draggable", editing);
    cachedWrite(parts.grab, "hittest", editing);
    cachedWrite(parts.grab, "draggable", editing);
    if (!editing) return;
    const position = round(map.x) + "px " + round(map.y) + "px 0px";
    cachedWrite(parts.chrome, "position", round(map.x - LAYOUT_CHROME_PAD) + "px " + round(map.y - LAYOUT_CHROME_PAD) + "px 0px");
    cachedWrite(parts.chrome, "width", round(map.w + 2 * LAYOUT_CHROME_PAD) + "px");
    cachedWrite(parts.chrome, "height", round(map.h + 2 * LAYOUT_CHROME_PAD) + "px");
    cachedWrite(parts.outline, "width", round(map.w) + "px");
    cachedWrite(parts.outline, "height", round(map.h) + "px");
    cachedWrite(parts.grab, "position", position);
    cachedWrite(parts.grab, "width", round(map.w) + "px");
    cachedWrite(parts.grab, "height", round(map.h) + "px");
  }
  // The label's edit chrome: a dashed box turned with the label (the turn is drawn only: hit testing of turned panels
  // is unproven, so the drag area is the turned label's upright bounding box and the knob an unturned panel placed on
  // the turned top edge). The drag area sits under the widget slots like the minimap's.
  function placeLocChrome(layer, box, round) {
    let parts = Layout.parts["lc"];
    if (!parts || !panelValid(parts.chrome)) {
      try {
        parts = {
          chrome: layer.FindChildTraverse("BTSlotLocChrome"), outline: layer.FindChildTraverse("BTSlotLocOutline"),
          grab: layer.FindChildTraverse("BTSlotLocGrab"), knob: layer.FindChildTraverse("BTSlotLocRotate")
        };
      } catch { return; }
      if (!panelValid(parts.chrome)) return;
      Layout.parts["lc"] = parts;
    }
    const editing = Layout.editing && !!box;
    for (const panel of [parts.chrome, parts.grab, parts.knob]) setPanelClass(panel, "bt-loc-none", Layout.editing && !box);
    cachedWrite(parts.grab, "hittest", editing);
    cachedWrite(parts.grab, "draggable", editing);
    cachedWrite(parts.knob, "draggable", editing);
    if (!editing) return;
    const w = Math.max(box.w, LAYOUT_LOC_MIN_W);
    const h = Math.max(box.h, LAYOUT_LOC_MIN_H);
    const turn = box.deg * Math.PI / 180;
    const cos = Math.abs(Math.cos(turn));
    const sin = Math.abs(Math.sin(turn));
    const gw = w * cos + h * sin;
    const gh = w * sin + h * cos;
    const reach = h / 2 + LAYOUT_LOC_KNOB;
    setPanelClass(parts.chrome, "bt-loc-empty", !box.measured || box.w < LAYOUT_LOC_MIN_W / 2);
    cachedWrite(parts.chrome, "position", round(box.cx - w / 2 - LAYOUT_CHROME_PAD) + "px " + round(box.cy - h / 2 - LAYOUT_CHROME_PAD) + "px 0px");
    cachedWrite(parts.chrome, "width", round(w + 2 * LAYOUT_CHROME_PAD) + "px");
    cachedWrite(parts.chrome, "height", round(h + 2 * LAYOUT_CHROME_PAD) + "px");
    cachedWrite(parts.chrome, "preTransformRotate2d", box.deg + "deg");
    cachedWrite(parts.outline, "width", round(w) + "px");
    cachedWrite(parts.outline, "height", round(h) + "px");
    cachedWrite(parts.grab, "position", round(box.cx - gw / 2) + "px " + round(box.cy - gh / 2) + "px 0px");
    cachedWrite(parts.grab, "width", round(gw) + "px");
    cachedWrite(parts.grab, "height", round(gh) + "px");
    cachedWrite(parts.knob, "position", round(box.cx + reach * Math.sin(turn) - LAYOUT_LOC_KNOB_R) + "px " +
      round(box.cy - reach * Math.cos(turn) - LAYOUT_LOC_KNOB_R) + "px 0px");
  }
  // A slot's panels, found once per slot panel (a rebuilt layer has new ones), and the placement last written.
  function layoutSlotParts(layer, spec) {
    const cached = Layout.parts[spec.key];
    if (cached && panelValid(cached.slot)) return cached;
    let parts = null;
    try {
      const slot = layer.FindChildTraverse(spec.id);
      if (!panelValid(slot)) return null;
      parts = {
        slot: slot, chrome: layer.FindChildTraverse(spec.id + "Chrome"), outline: layer.FindChildTraverse(spec.id + "Outline"),
        handles: LAYOUT_HANDLES.map((handle) => layer.FindChildTraverse(spec.id + handle)), placed: ""
      };
    } catch { return null; }
    Layout.parts[spec.key] = parts;
    return parts;
  }
  // Until the dock has a layout: every 0.5 s for 10 s, then every 2 s.
  function scheduleLayoutRetry() {
    if (Layout.retryHnd !== null || _retired) return;
    const delay = Layout.retries++ < 20 ? 0.5 : 2;
    Layout.retryHnd = $.Schedule(delay, () => {
      Layout.retryHnd = null;
      if (!timerAlive()) { retire(); return; }
      placeSlots(true);
    });
  }
  // Edit mode outside a match: sample times so every widget has something to place.
  function writeLayoutSamples() {
    if (!Layout.editing || (running && !isHideout())) return;
    writeText("riftText", null, "7:00", UI.riftTime, null);
    writeText("riftSubText", null, "RIFT", UI.riftSubTime, null);
    writeText("urnText", null, "10:00", UI.urnTime, null);
    writeText("urnSubText", null, "URN", UI.urnSubTime, null);
  }
  // Edit mode: an idle claim box shows a fresh ally claim so it can be found and placed. A live claim keeps its
  // real look; setClaimSide clears the sample when one starts.
  function writeClaimSamples() {
    for (const side of SIDES) {
      const sample = Layout.editing && side.claimStart <= 0;
      if (sample === side.sample) continue;
      side.sample = sample;
      setPanelClass(side.claim, "bt-claim-sample", sample);
      if (!sample) continue;
      setPanelText(side.timer, formatTime(POWERUP_BUFF_DUR, "compact"));
      side.lastTimer = "";
      try { side.icon.style.backgroundImage = 'url("' + POWERUP_ICONS["powerup_gun"] + '")'; } catch {}
      try {
        side.ring.style.opacity = "1";
        side.ring.style.preTransformScale2d = "1";
      } catch {}
      side.lastScale = -1;
      side.lastOpacity = -1;
      paintClaim(side);
    }
  }
  function layoutModelSig(model, editing) {
    let sig = editing ? "e" : "n";
    for (const spec of LAYOUT_SLOTS) {
      const entry = model[spec.key];
      sig += "|" + (entry ? entry.join(",") : "-");
    }
    const spot = model["mp"];
    const loc = model["lc"];
    return sig + "|m" + (model["m"] === undefined ? "-" : model["m"]) + "|" + (spot ? spot.join(",") : "-") +
      "|l" + (loc ? loc.join(",") : "-");
  }
  function layoutPlacedRecently(modelSig, nowMs) {
    return modelSig === Layout.modelSig && nowMs - Layout.measuredMs < LAYOUT_REMEASURE_MS;
  }
  function applyLayout(model, editing) {
    const clean = layoutSanitize(model);
    // The settings loop re-sends the same model every 0.25 s; outside edit mode that is a no-op until the next
    // re-measure, so it skips the native liveness reads too. The first apply always runs (see Layout.mapWritten).
    if (editing !== true && !Layout.editing && Layout.mapWritten !== "?" &&
        layoutPlacedRecently(layoutModelSig(clean, false), Date.now())) return true;
    if (!timerAlive()) { retire(); return false; }
    Layout.model = clean;
    Layout.editing = editing === true;
    layoutLocShown(Layout.editing);
    writeLayoutSamples();
    writeClaimSamples();
    return placeSlots(false);
  }
  function layoutApiMetrics() {
    if (!timerAlive()) return null;
    const metrics = layoutMetrics();
    if (!metrics) return null;
    const slots = {};
    for (const spec of LAYOUT_SLOTS) {
      const rect = layoutRect(spec, metrics);
      slots[spec.key] = { "x": rect.x, "y": rect.y, "w": rect.w, "h": rect.h, "s": rect.s, "side": rect.side, "bw": rect.bw, "bh": rect.bh };
    }
    // The dock in window px: the settings script opens its edit bar just above (or below) it.
    const dock = layoutFinite(metrics.dockWinW) && metrics.dockWinW > 0
      ? { "x": metrics.dockWinX, "y": metrics.dockWinY, "w": metrics.dockWinW, "h": metrics.dockWinH } : null;
    // The minimap (edit mode only), its #minimap_persp box and its size in model terms, for moving and resizing it.
    const box = metrics.persp;
    const map = metrics.map && box ? {
      "x": metrics.map.x, "y": metrics.map.y, "w": metrics.map.w, "h": metrics.map.h,
      "s": Layout.model["m"] === undefined ? 1 : Layout.model["m"],
      "px": box.x, "py": box.y, "pw": box.w, "ph": box.h
    } : null;
    // The location label (edit mode only): centre, size of its dashed box, turn, offset (dx/dy minimap px, f layer px
    // per minimap px), its stock centre, the knob's centre and the #minimap_persp box it must stay inside.
    const lb = metrics.loc;
    let loc = null;
    if (lb && box) {
      const lw = Math.max(lb.w, LAYOUT_LOC_MIN_W);
      const lh = Math.max(lb.h, LAYOUT_LOC_MIN_H);
      const turn = lb.deg * Math.PI / 180;
      const reach = lh / 2 + LAYOUT_LOC_KNOB;
      loc = {
        "cx": lb.cx, "cy": lb.cy, "w": lw, "h": lh, "deg": lb.deg, "dx": lb.dx, "dy": lb.dy, "f": lb.f,
        "sx": lb.sx, "sy": lb.sy, "kx": lb.cx + reach * Math.sin(turn), "ky": lb.cy - reach * Math.cos(turn),
        "px": box.x, "py": box.y, "pw": box.w, "ph": box.h, "m": lb.measured ? 1 : 0
      };
    }
    return { "w": metrics.w, "h": metrics.h, "scale": metrics.scale, "slots": slots, "dock": dock, "map": map, "loc": loc };
  }
  // Shared with bt_minimap_settings.js (same layout, same $): the settings script owns the model and the editor.
  function publishLayoutApi() {
    const api = {
      "gen": _instanceGen,
      "apply": (model, editing) => applyLayout(model, editing),
      "metrics": () => layoutApiMetrics(),
      "panel": (id) => {
        if (!timerAlive() || typeof id !== "string" || id.indexOf("BTSlot") !== 0 || !panelValid(TIMER_HOSTS[0])) return null;
        try { return TIMER_HOSTS[0].FindChildTraverse(id); } catch { return null; }
      },
      // Chromes overlap when widgets sit close (at the default spots Urn's side arrow covers the Bridge pill's
      // top-left handle); the hovered widget's chrome goes in front so its own handles take the mouse.
      "raise": (id) => layoutRaiseChrome(id),
      // Player colours and glow strength from the settings menu.
      "look": (look) => applyLook(look)
    };
    Layout.api = api;
    try { $["BTTimerLayout"] = api; } catch {}
  }
  function layoutRaiseChrome(id) {
    if (!timerAlive() || typeof id !== "string" || id.indexOf("BTSlot") !== 0 || !panelValid(TIMER_HOSTS[0])) return;
    try {
      const edit = TIMER_HOSTS[0].FindChildTraverse("BTEditLayer");
      const chrome = TIMER_HOSTS[0].FindChildTraverse(id + "Chrome");
      if (!panelValid(edit) || !panelValid(chrome)) return;
      const children = edit["Children"]();
      const last = children[children.length - 1];
      if (panelValid(last) && last !== chrome) edit["MoveChildAfter"](chrome, last);
    } catch {}
  }
  function setPanelClass(panel, className, enabled) {
    if (!panelValid(panel)) return false;
    const shouldHave = !!enabled;
    let hasClass = false;
    try { hasClass = !!panel.BHasClass?.(className); } catch { hasClass = false; }
    if (hasClass === shouldHave) return true;
    try {
      if (typeof panel.SetHasClass !== "function") return false;
      panel.SetHasClass(className, shouldHave);
      return true;
    } catch {
      return false;
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

  /** @param {boolean=} alreadyValid */
  function getStablePlayerKey(btn, fallbackIndex, alreadyValid) {
    if (!alreadyValid && !btn?.IsValid?.()) return "player_fallback_" + fallbackIndex;
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
      if (forceFresh) return null;
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
  /** @param {Object=} minimap */
  function collectMinimapSnapshot(nowMs, forceFresh, minimap) {
    const mm = minimap === undefined ? findMinimap() : minimap;
    if (!mm) {
      return null;
    }
    const now = nowMs || Date.now();
    const intervalMs = getMinimapWorkInterval(now);
    if (!forceFresh && _snapshotTs > 0 && now - _snapshotTs < intervalMs) {
      return _minimapSnapshot;
    }
    const buttons = getCachedMapButtons(mm, now, !!forceFresh);
    if (!buttons) return _minimapSnapshot;
    if (!buttons.length) {
      clearMinimapSnapshot(now);
      return _minimapSnapshot;
    }

    let playerCount = 0;
    let powerupCount = 0;
    let riftMarkerSeen = false;
    let riftWarningActive = false;
    const mmGeom = resolveMinimapReferenceSize(mm, minimap !== undefined);
    const mmW = mmGeom.width;
    const mmH = mmGeom.height;
    const playerSeenToken = ++_playerSeenToken;

    for (let i = 0, len = buttons.length; i < len; i++) {
      const btn = buttons[i];
      try {
        if (!btn?.IsValid?.()) continue;
        if (btn.BHasClass("player")) {
          let entry = _minimapSnapshot.players[playerCount];
          if (!entry) {
            entry = { id: "", panel: null, isActive: false, isDead: false, team: 0, xPct: 0, yPct: 0 };
            _minimapSnapshot.players[playerCount] = entry;
          }
          if (!setMapPosition(entry, btn, mmW, mmH)) continue;
          const id = getStablePlayerKey(btn, i, true);
          const ps = markPlayerSeen(id, 0, now, playerSeenToken);
          const classified = classifyTeam(btn);
          const team = classified || ps.team || 0;
          ps.team = team;
          entry.id = id;
          entry.panel = btn;
          entry.isActive = btn.BHasClass("active");
          // Current stock hud_minimap.css only uses this casing.
          entry.isDead = btn.BHasClass("PlayerDead");
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
          continue;
        }
        if (btn.BHasClass("capture_point")) {
          riftMarkerSeen = true;
          if (btn.BHasClass("koth_warning")) riftWarningActive = true;
          continue;
        }
      } catch {}
    }

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
      // Stock hud_minimap.css uses team1/team2 for absolute game-team colours (.player.team1 #BackgroundImage).
      // friend/enemy are local perspective; team1 first misclassified Amber enemies for Sapphire players.
      if (btn.BHasClass("friend")) return 1;
      if (btn.BHasClass("enemy")) return 2;
      if (btn.BHasClass("team1") || btn.BHasClass("ally")) return 1;
      if (btn.BHasClass("team2")) return 2;
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

    const leftTarget = knownSpawnPos.left ? getNearestTarget(0) : null;
    const rightTarget = knownSpawnPos.right ? getNearestTarget(1) : null;
    _nearestTargets[0] = leftTarget;
    _nearestTargets[1] = rightTarget;
    if (!leftTarget && !rightTarget) return;
    if (leftTarget) {
      leftTarget.x = knownSpawnPos.left.x;
      leftTarget.y = knownSpawnPos.left.y;
      leftTarget.minAllyDist = Infinity;
      leftTarget.minEnemyDist = Infinity;
    }
    if (rightTarget) {
      rightTarget.x = knownSpawnPos.right.x;
      rightTarget.y = knownSpawnPos.right.y;
      rightTarget.minAllyDist = Infinity;
      rightTarget.minEnemyDist = Infinity;
    }

    computeNearestForTargets(snap.players, _nearestTargets, 2, nowMs, false);
    if (leftTarget) {
      if (leftTarget.minAllyDist < pretrackData.left.minAlly) pretrackData.left.minAlly = leftTarget.minAllyDist;
      if (leftTarget.minEnemyDist < pretrackData.left.minEnemy) pretrackData.left.minEnemy = leftTarget.minEnemyDist;
    }
    if (rightTarget) {
      if (rightTarget.minAllyDist < pretrackData.right.minAlly) pretrackData.right.minAlly = rightTarget.minAllyDist;
      if (rightTarget.minEnemyDist < pretrackData.right.minEnemy) pretrackData.right.minEnemy = rightTarget.minEnemyDist;
    }
  }

  function resolveRejuvChargePanels(nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const friendlyWasValid = panelValid(UI.rejuvFriendly);
    const enemyWasValid = panelValid(UI.rejuvEnemy);
    if (friendlyWasValid && enemyWasValid) return false;
    if (now - _rejuvResolveTs < REJUV_PANEL_RETRY_MS) return false;
    _rejuvResolveTs = now;
    let topBar = UI.topBar;
    if (!panelValid(topBar) && panelValid(UI.root)) {
      try {
        topBar = UI.root.FindChildTraverse("TopBar");
        UI.topBar = topBar;
      } catch {
        topBar = null;
      }
    }
    if (!panelValid(topBar)) return false;
    let charges;
    try { charges = topBar.FindChildTraverse("RejuvenatorCharges"); } catch { return false; }
    if (!panelValid(charges)) return false;
    let friendly = null;
    let enemy = null;
    try { friendly = charges.FindChildTraverse("RejuvenatorFriendly"); } catch {}
    try { enemy = charges.FindChildTraverse("RejuvenatorEnemy"); } catch {}
    let rebound = false;
    if (panelValid(friendly)) {
      rebound = !friendlyWasValid || UI.rejuvFriendly !== friendly;
      UI.rejuvFriendly = friendly;
    } else {
      UI.rejuvFriendly = null;
    }
    if (panelValid(enemy)) {
      rebound = !enemyWasValid || UI.rejuvEnemy !== enemy || rebound;
      UI.rejuvEnemy = enemy;
    } else {
      UI.rejuvEnemy = null;
    }
    if (rebound) _rejuvReboundPending = true;
    return rebound;
  }

  function doScan(nowMs) {
    if (!running) return;
    resolveRejuvChargePanels(nowMs);
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
    if (_rejuvReboundPending) {
      lastFound = found;
      _rejuvReboundPending = false;
      return;
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
    idx = 0;
    phaseStart = now;
    counter = 0;
    showSpawn();
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
    _imgRotateHnd = cancelScheduled(_imgRotateHnd);
    if (!UI.rImg?.IsValid?.()) return;
    try {
      UI.rImg.RemoveClass("rotating");
      UI.rImg.RemoveClass("reverse");
      UI.rImg.RemoveClass("white");
    } catch {}
  }

  function enterNeutralMode() {
    if (!UI.rejuv?.IsValid?.()) return;
    _neutralModeHnd = cancelScheduled(_neutralModeHnd);
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
    _neutralModeHnd = cancelScheduled(_neutralModeHnd);
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
    if (WRITE_CACHE["riftActive"] !== enabled && setPanelClass(UI.riftCard, "active", enabled)) {
      WRITE_CACHE["riftActive"] = enabled;
    }
    if (WRITE_CACHE["urnActive"] !== enabled && setPanelClass(UI.urnCard, "active", enabled)) {
      WRITE_CACHE["urnActive"] = enabled;
    }
  }

  function setObjectiveCardClass(cacheKey, panel, className, enabled) {
    const next = !!enabled;
    if (WRITE_CACHE[cacheKey] === next) return true;
    if (!setPanelClass(panel, className, next)) return false;
    WRITE_CACHE[cacheKey] = next;
    return true;
  }

  function observeRiftMarker(markerSeen, warningActive, now) {
    const seen = !!markerSeen;
    const warning = seen && !!warningActive;
    const earliestNextWarning = _riftObservedSpawn + RIFT_INTERVAL - RIFT_INTERVAL_VARIANCE - RIFT_GLOBAL_WARNING;
    if (warning && !_riftWarningActive && (_riftObservedSpawn <= 0 || now >= earliestNextWarning)) {
      _riftObservedSpawn = now + RIFT_GLOBAL_WARNING;
    }
    _riftWarningActive = warning;
  }

  function makeRiftState(text, sub, inWindow, warning, confirmed) {
    return { text: text, sub: sub, inWindow: inWindow, warning: warning, confirmed: confirmed };
  }
  function computeRiftState(now) {
    // Warning shown, or an observed spawn still ahead: count down to it.
    if (_riftWarningActive || (_riftObservedSpawn > 0 && now <= _riftObservedSpawn)) {
      const remaining = Math.max(0, _riftObservedSpawn - now);
      return makeRiftState(remaining > 0 ? formatTime(remaining, "compact") : "NOW", "RIFT", remaining <= 0, remaining > 0,
        _riftObservedSpawn >= now);
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
    const elapsed = now - URN_FIRST_SPAWN;
    const elapsedInCycle = elapsed % URN_INTERVAL;
    return elapsedInCycle === 0 ? 0 : URN_INTERVAL - elapsedInCycle;
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
      side.enemyGlowHandle = cancelScheduled(side.enemyGlowHandle);
      try { panel.AddClass("glow-enemy"); } catch {}
      side.glowEnemy = true;
      side.enemyGlowHandle = $.Schedule(3, () => {
        if (panel?.IsValid?.()) {
          try { panel.RemoveClass("glow-enemy"); } catch {}
        }
        side.enemyGlowHandle = null;
        side.glowEnemy = false;
        paintGlow(side);
      });
    } else if (enemyClaimed === false) {
      side.enemyGlowHandle = cancelScheduled(side.enemyGlowHandle);
      try { panel.RemoveClass("glow-enemy"); } catch {}
      side.glowEnemy = false;
    }
    paintGlow(side);
  }

  // ---- Player colours and glow strength (inline paint over the CSS defaults) ----
  function lookRgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return ((value >> 16) & 255) + "," + ((value >> 8) & 255) + "," + (value & 255);
  }
  const lookRound = (value) => Math.round(value * 100) / 100;
  // Same shape as the buff_claim.css glows. Strength k (10-150%): below 100 every alpha dims; above 100 the mid
  // stop gets stronger and the glow reaches further in (60% -> 85% of the panel at 150).
  function glowGradient(left, hex, enemy, strength) {
    const rgb = lookRgb(hex);
    const extra = Math.max(0, strength - 1);
    const edge = lookRound((enemy ? 1 : 0.9) * Math.min(1, strength));
    const mid = lookRound((enemy ? 0.4 : 0.3) * strength);
    const stop = lookRound((enemy ? 0.2 : 0.25) + extra * 0.3);
    const reach = Math.round((60 + extra * 50) * 10) / 10;
    const axis = left ? "0% 50%, " + reach + "% 50%" : "100% 50%, " + Math.round((100 - reach) * 10) / 10 + "% 50%";
    return "gradient(linear, " + axis + ", from(rgba(" + rgb + "," + edge + ")), color-stop(" + stop + ", rgba(" + rgb + "," +
      mid + ")), to(rgba(" + rgb + ",0)))";
  }
  function paintGlow(side) {
    if (!_look || !side) return;
    const key = side.glowEnemy ? "e" : side.activeGlow ? GLOW_LOOK_KEY[side.activeGlow] : "";
    if (!key) return;
    cachedWrite(side.glow, "backgroundColor", glowGradient(side === SIDES[0], _look[key], side.glowEnemy, _look["k"] / 100));
  }
  // A live claim uses the ally or enemy colour; an idle box in edit mode shows the ally sample.
  function paintClaim(side) {
    if (!_look || !side) return;
    const key = side.claimStart > 0 ? (side.claimEnemy ? "e" : "a") : side.sample ? "a" : "";
    if (!key) return;
    const rgb = lookRgb(_look[key]);
    cachedWrite(side.bg, "backgroundColor", "gradient(linear, 0% 0%, 100% 100%, from(rgba(" + rgb + ",0.3)), to(rgba(0,0,0,0)))");
    cachedWrite(side.bg, "borderColor", "rgba(" + rgb + ",0.3)");
    cachedWrite(side.ring, "borderColor", "rgba(" + rgb + ",0.9)");
  }
  // Settings sends {a,e,w,p,v,m: "#RRGGBB", k: 10-150}; anything malformed keeps the current look.
  function applyLook(look) {
    if (!timerAlive()) { retire(); return false; }
    if (!look || typeof look !== "object") return false;
    const next = {};
    for (const key of LOOK_KEYS) {
      const value = look[key];
      if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) return false;
      next[key] = value;
    }
    const strength = look["k"];
    if (typeof strength !== "number" || !(strength >= 10 && strength <= 150)) return false;
    next["k"] = strength;
    _look = next;
    for (const side of SIDES) {
      paintGlow(side);
      paintClaim(side);
    }
    return true;
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
    side.claimTimeout = cancelScheduled(side.claimTimeout);
    side.animHandle = cancelScheduled(side.animHandle);
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
    // A real claim replaces the edit-mode sample at once.
    setPanelClass(claimBox, "bt-claim-sample", false);
    side.sample = false;
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
    side.claimEnemy = !!enemyClaimed;
    paintClaim(side);
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
      // Steps of 1/500 (0.1 px on the 48 px ring) change every ~0.5 s instead of on every 0.1 s tick.
      const sc = Math.round((0.5 + pct * 0.5) * CLAIM_RING_STEPS) / CLAIM_RING_STEPS;
      const op = Math.round((0.3 + pct * 0.7) * CLAIM_RING_STEPS) / CLAIM_RING_STEPS;
      if ((sc !== side.lastScale || op !== side.lastOpacity) && side.ring?.IsValid?.()) {
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
        const base = powerups[i].x < 50 ? 0 : 1;
        const side = inverted ? 1 - base : base;
        powerups[i].side = side;
        if (side === 0) leftGlowType = powerups[i].type;
        else rightGlowType = powerups[i].type;
      }
      writeSideGlow(0, leftGlowType, false);
      writeSideGlow(1, rightGlowType, false);

      const nextKnownSpawnPos = knownSpawnPos
        ? { left: knownSpawnPos.left, right: knownSpawnPos.right }
        : { left: null, right: null };
      for (let i = 0, len = powerups.length; i < len; i++) {
        const powerup = powerups[i];
        const key = powerup.side === 0 ? "left" : "right";
        nextKnownSpawnPos[key] = { x: powerup.x, y: powerup.y };
      }
      knownSpawnPos = nextKnownSpawnPos;

      if (pretrackActive) {
        for (let i = 0, len = powerups.length; i < len; i++) {
          const pretrack = powerups[i].side === 0 ? pretrackData.left : pretrackData.right;
          powerups[i].minAllyDist = pretrack.minAlly;
          powerups[i].minEnemyDist = pretrack.minEnemy;
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
      const layer = UI.lingerLayer;
      if (!panelValid(container) || !panelValid(layer)) return;
      // The layer covers the container, so positions still use the stock container.
      const mm = findMinimap();
      const lingerPosition = computeLingerLabelPosition(btn, container, mm);
      const qId = "LingerQ_" + enemyId;
      qLabel = layer.FindChildTraverse(qId);
      if (!panelValid(qLabel)) {
        qLabel = $.CreatePanel("Label", layer, qId);
        createdLabel = true;
        qLabel.AddClass("linger-question-child");
        qLabel.text = "?";
      }
      qLabel.style.position = lingerPosition.x + "% " + lingerPosition.y + "% 0px";
      qLabel.style.width = lingerPosition.w + "%";
      qLabel.style.height = lingerPosition.h + "%";
      qLabel.style.fontSize = lingerPosition.fontSize + "px";

      let previous = null;
      try {
        const saved = btn.GetAttributeString("bt_linger_prev", "");
        if (saved) previous = JSON.parse(saved);
      } catch {}
      if (!previous || typeof previous !== "object") {
        previous = {
          "previousHitTest": btn["hittest"],
          "previousHitTestChildren": btn["hittestchildren"],
          "previousOpacity": btn.style.opacity,
          "previousAcceptsInput": typeof btn["BAcceptsInput"] === "function" ? !!btn["BAcceptsInput"]() : null,
          "previousAcceptsFocus": typeof btn["BAcceptsFocus"] === "function" ? !!btn["BAcceptsFocus"]() : null
        };
        try { btn.SetAttributeString("bt_linger_prev", JSON.stringify(previous)); } catch {}
      }
      const state = {
        hideHandle: null,
        btn: btn,
        qLabel: qLabel,
        previousHitTest: previous["previousHitTest"],
        previousHitTestChildren: previous["previousHitTestChildren"],
        previousOpacity: previous["previousOpacity"],
        previousAcceptsInput: previous["previousAcceptsInput"],
        previousAcceptsFocus: previous["previousAcceptsFocus"]
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
    if (cancelHandle) cancelScheduled(state.hideHandle);
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
      try { btn.SetAttributeString("bt_linger_prev", ""); } catch {}
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
          if (ps.deadTs === 0) ps.deadTs = now;
          removeLinger(id, true);
          continue;
        }
        // Bookkeeping above keeps running while the '?' is off, so re-enabling never replays an old disappearance.
        if (wasActive && !pl.isActive) {
          if (!_lingerOff) showLinger(id, pl.panel);
        } else if (!wasActive && pl.isActive) {
          removeLinger(id, true);
        }
      }
    } catch {}
  }

  function handleRejuvPingActivate() {
    if (!timerAlive()) { retire(); return; }
    if (!running || Layout.editing) return;
    sendTimerChatMessage("rejuv", gTime());
  }

  function handleBuffPingActivate() {
    if (!timerAlive()) { retire(); return; }
    if (!running || Layout.editing) return;
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

  /** @param {number=} token @param {boolean=} closeUi @return {boolean} */
  function clearPendingChatIntent(token, closeUi) {
    const pending = _chatIntentInFlight;
    if (!pending || (token !== undefined && pending.token !== token)) return false;
    if (closeUi) {
      clearPendingChatText(pending);
      if (pending.input) closeChatUi(pending.input);
    }
    cancelScheduled(pending.timeoutHandle);
    _chatIntentInFlight = null;
    return true;
  }

  function clearPendingChatText(pending) {
    if (!panelValid(pending?.input)) return;
    try {
      if (pending.input.text === pending.message) pending.input.text = "";
    } catch {}
  }

  function expirePendingChatIntent(token) {
    const pending = _chatIntentInFlight;
    if (!pending || pending.token !== token || Date.now() < pending.expiresAt) return;
    clearPendingChatText(pending);
    if (pending.input) closeChatUi(pending.input);
    clearPendingChatIntent(token);
  }

  function isCurrentChatIntent(token, generation) {
    const pending = _chatIntentInFlight;
    if (!pending || pending.token !== token) return false;
    if (generation !== _generation || pending.generation !== _generation) {
      clearPendingChatIntent(token);
      return false;
    }
    if (Date.now() >= pending.expiresAt) {
      expirePendingChatIntent(token);
      return false;
    }
    return true;
  }

  function scheduleChat(delay, callback) {
    const handle = $.Schedule(delay, () => {
      _chatHandles.delete(handle);
      if (!timerAlive()) { retire(); return; }
      callback();
    });
    _chatHandles.add(handle);
    return handle;
  }
  const TeamChatIntent = {
    sanitize: function (message) {
      return String(message || "").replace(/["\r\n;]/g, " ").replace(/\s+/g, " ").trim();
    },
    canSend: function (nowMs, lastSendMs, cooldownMs) {
      return Number(nowMs) - Number(lastSendMs || 0) >= Number(cooldownMs || 0);
    },
    isTeamTarget: function (label) {
      try {
        if (!panelValid(label)) return false;
        const text = String(label.text || "").trim();
        if (!text || text === CHAT_ALL_LABEL || text === "#citadel_chat_placeholder") return false;
        return text.indexOf("(ALL)") === -1;
      } catch {
        return false;
      }
    },
    submit: function (input, message, generation, token, label, targetText) {
      return submitWithMinimalFocus(input, message, generation, token, label, targetText);
    },
    retry: function (message, attempt, readyStreak, generation, token) {
      if (!isCurrentChatIntent(token, generation)) return;
      const resolved = resolveChatPanels();
      const input = UI.chatInput;
      const label = UI.chatTargetLabel;
      if (!resolved || !panelValid(input) || !TeamChatIntent.isTeamTarget(label)) {
        if (attempt >= CHAT_RETRY_DELAYS.length - 1) {
          if (DEBUG_PING_TIMER) dbgPing("send:not-ready", { attempt, label: label?.text || "" });
          clearPendingChatIntent(token);
          return;
        }
        scheduleChat(CHAT_RETRY_DELAYS[attempt + 1], () => TeamChatIntent.retry(message, attempt + 1, 0, generation, token));
        return;
      }
      if (readyStreak < 1 && attempt < CHAT_RETRY_DELAYS.length - 1) {
        scheduleChat(CHAT_RETRY_DELAYS[attempt + 1], () => TeamChatIntent.retry(message, attempt + 1, readyStreak + 1, generation, token));
        return;
      }
      const targetText = String(label.text || "").trim();
      if (!TeamChatIntent.submit(input, message, generation, token, label, targetText)) {
        clearPendingChatIntent(token);
      }
    },
    send: function (message, wallNowMs) {
      const now = Number.isFinite(wallNowMs) ? wallNowMs : Date.now();
      if (_chatIntentInFlight) {
        const pending = _chatIntentInFlight;
        if (pending.generation !== _generation || now >= pending.expiresAt) {
          clearPendingChatText(pending);
          if (pending.input) closeChatUi(pending.input);
          clearPendingChatIntent(pending.token);
        } else {
          return false;
        }
      }
      if (!TeamChatIntent.canSend(now, _lastTimerChatMs, CHAT_SEND_COOLDOWN_MS)) return false;
      const safe = TeamChatIntent.sanitize(message);
      if (!safe) return false;
      const generation = _generation;
      const token = ++_chatIntentToken;
      _lastTimerChatMs = now;
      UI.chatInput = null;
      UI.chatTargetLabel = null;
      _chatIntentInFlight = {
        token,
        generation,
        expiresAt: now + CHAT_INTENT_TIMEOUT_MS,
        timeoutHandle: null,
        input: null,
        message: safe,
      };
      try {
        _chatIntentInFlight.timeoutHandle = $.Schedule(
          CHAT_INTENT_TIMEOUT_MS / 1000,
          () => expirePendingChatIntent(token)
        );
        $.DispatchEvent("CitadelConCommand", "say_chat_team");
        scheduleChat(CHAT_RETRY_DELAYS[0], () => TeamChatIntent.retry(safe, 0, 0, generation, token));
      } catch {
        clearPendingChatIntent(token);
        return false;
      }
      return true;
    }
  };

  function sendTimerChatMessage(kind, now) {
    const message = buildTimerChatMessage(kind, now);
    if (!message) return;
    TeamChatIntent.send(message, Date.now());
  }

  function submitWithMinimalFocus(chatInput, message, generation, token, targetLabel, targetText) {
    if (!isCurrentChatIntent(token, generation) || !panelValid(chatInput) || !TeamChatIntent.isTeamTarget(targetLabel)) return false;
    try {
      if (String(chatInput.text || "")) return false;
    } catch {
      return false;
    }
    const pending = _chatIntentInFlight;
    if (!pending || pending.token !== token) return false;
    pending.input = chatInput;
    pending.message = message;
    try { $.DispatchEvent("SetInputFocus", chatInput); } catch {}
    try {
      chatInput.text = message;
      scheduleChat(0, () => {
        // Submit only while this is still the current intent and the same team chat entry is open.
        let submit = isCurrentChatIntent(token, generation) && !!resolveChatPanels() && panelValid(chatInput) &&
          UI.chatInput === chatInput && UI.chatTargetLabel === targetLabel && TeamChatIntent.isTeamTarget(targetLabel);
        if (submit) {
          let currentTargetText = "";
          try { currentTargetText = String(targetLabel?.text || "").trim(); } catch {}
          submit = currentTargetText === targetText;
        }
        if (submit) try { $.DispatchEvent("CitadelChatInputSubmitted", chatInput); } catch {}
        // Sent or abandoned, our text never stays in the box.
        try {
          if (panelValid(chatInput) && chatInput.text === message) chatInput.text = "";
        } catch {}
        closeChatUi(chatInput);
        clearPendingChatIntent(token);
      });
      return true;
    } catch {
      closeChatUi(chatInput);
      clearPendingChatIntent(token);
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
    scheduleChat(0, () => {
      try { $.DispatchEvent("CitadelChatInputBlur", chatInput); } catch {}
    });
  }

  // bt_minimap_settings.js in hud_minimap.xml talks to this timer only through #hud_minimap classes.
  /** @param {Object=} minimap */
  function readSettingsContract(minimap) {
    const mm = minimap === undefined ? UI.minimap : minimap;
    if (!mm || (minimap === undefined && !panelValid(mm))) return;
    // Only timer-owned writes are cached; panel identity handles rebinding.
    if (_settingsMinimap !== mm && setPanelClass(mm, "bt-buff-timer", true)) {
      _settingsMinimap = mm;
    }
    let lingerOff = false;
    let glowOff = false;
    try {
      lingerOff = mm.BHasClass("bt-linger-off");
      glowOff = mm.BHasClass("bt-glow-off");
    } catch {}
    if (lingerOff !== _lingerOff) {
      _lingerOff = lingerOff;
      if (lingerOff && _lingerCount > 0) clearAllLingers();
    }
    const glowClip = UI.glowClip;
    if ((_settingsGlowClip !== glowClip || _settingsGlowOff !== glowOff) &&
        setPanelClass(glowClip, "bt-glow-off", glowOff)) {
      _settingsGlowClip = glowClip;
      _settingsGlowOff = glowOff;
    }
  }

  function runMinimapLane(realNowMs, gameNowSec, mm) {
    if (!running || isHideout()) return null;
    return collectMinimapSnapshot(realNowMs, false, mm);
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
      // A Rejuv waiting to be taken (the Mid Boss is up from the start of a match) has no countdown, and the pill's own
      // Spawn says so: the override shows the mini card only while a phase is counting down.
      const phaseCountdown = neutralOverride && !spawnWait;
      setMiniCardState(phaseCountdown || buffActive, buffActive && !phaseCountdown);
      if (phaseCountdown) {
        const safeIdx = idx >= 0 && idx < SEQ.length ? idx : 0;
        const miniRem = Math.max(0, SEQ[safeIdx].d - (gameNowSec - phaseStart));
        writeText("miniText", null, formatTime(miniRem, "pad"), UI.rejuvMiniTime, null);
      } else if (buffActive) {
        const miniBuffRem = computeRejuvBuffRemaining(gameNowSec, buffStart);
        writeText("miniText", null, formatTime(miniBuffRem, "pad"), UI.rejuvMiniTime, null);
      }
    }

    if (isDue("claim", realNowMs, 100)) updateClaims(realNowMs);
    if (isDue("scan", realNowMs, spawnWait ? 250 : 3000)) doScan(realNowMs);

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
    if (!timerAlive()) { retire(); return; }
    if (gen !== _generation) return;
    const mm = findMinimap() || null;
    // Menu rows and glow/linger switches must work in the hideout and without a valid clock too.
    readSettingsContract(mm);
    // Keeps the widgets on their spots when the HUD size or the minimap position changes.
    placeSlots(false);
    const rn = Date.now();
    const now = gTime(rn);
    if (now < 0) {
      if (!running) {
        scheduleLoopAt(gen, LOOP_INVALID_RETRY_MS);
      } else {
        scheduleLoop(gen, tick * 1000, getMinimapWorkInterval(rn), _riftHot);
      }
      return;
    }
    maybeClearNeutralCachesForLowGameTime(now);

    if (!running) {
      if (lastGlobalSec < 0 || rn - lastGateChk >= 30000) {
        lastGateChk = rn;
        if (!isHideout()) startRun(now);
      }
      if (!running) {
        scheduleLoop(gen, LOOP_GATE_DELAY_MS, 0, false);
        return;
      }
    }

    if (rn - lastRunChk >= 60000) {
      lastRunChk = rn;
      if (isHideout()) {
        reset(1);
        startGeneration();
        return;
      }
    }

    if (lastGlobalSec >= 0 && (now + 5 < lastGlobalSec || (lastGlobalSec > 30 && now <= 2))) {
      reset(1);
      startGeneration();
      return;
    }

    lastGlobalSec = now;
    const snapshot = runMinimapLane(rn, now, mm);
    runTimerLane(rn, now, snapshot);
    runMaintenanceLane(rn, snapshot);

    scheduleLoop(gen, tick * 1000, getMinimapWorkInterval(rn), _riftHot);
  }

  function boot() {
    if (_retired) return;
    if (_instanceGen && !timerAlive()) { retire(); return; }
    const context = $.GetContextPanel();
    let root = null;
    try { root = findRoot(context); } catch {}
    if (!panelValid(root) || !panelValid(context)) {
      if (_instanceGen) retire();
      else scheduleBoot(0.5);
      return;
    }
    if (!_instanceGen) {
      try {
        _instanceGen = (root.GetAttributeInt("bt_timer_gen", 0) | 0) + 1;
        root.SetAttributeInt("bt_timer_gen", _instanceGen);
        _hudRoot = root;
      } catch { retire(); return; }
    }
    if (!timerAlive()) { retire(); return; }
    if (!ensureTimerHosts()) {
      if (_layoutFailures >= 5) retire();
      else scheduleBoot(1);
      return;
    }
    UI.root = root;
    try { bindUiPanels(root); } catch { scheduleBoot(0.5); return; }
    try {
      if (panelValid(UI.rejuvPing)) UI.rejuvPing["SetPanelEvent"]("onactivate", handleRejuvPingActivate);
    } catch {}
    try {
      if (panelValid(UI.buffPing)) UI.buffPing["SetPanelEvent"]("onactivate", handleBuffPingActivate);
    } catch {}
    publishLayoutApi();
    placeSlots(true);
    Object.assign(SIDES[0], { glow: UI.glowLeft, claim: UI.claimLeft, icon: UI.claimIconLeft, ring: UI.claimRingLeft, timer: UI.claimTimerLeft, bg: UI.claimBgLeft });
    Object.assign(SIDES[1], { glow: UI.glowRight, claim: UI.claimRight, icon: UI.claimIconRight, ring: UI.claimRingRight, timer: UI.claimTimerRight, bg: UI.claimBgRight });

    const tb = UI.topBar;
    if (tb) {
      const ch = tb.FindChildTraverse("RejuvenatorCharges");
      if (ch) {
        UI.rejuvFriendly = ch.FindChildTraverse("RejuvenatorFriendly");
        UI.rejuvEnemy = ch.FindChildTraverse("RejuvenatorEnemy");
      }
    }

    if (!UI.rLab || !UI.rNum || !UI.rImg || !UI.buffLab) { scheduleBoot(0.5); return; }
    reset(1);
    startGeneration();
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
    module.exports.__test.setClaimSide = setClaimSide;
    module.exports.__test.writeSideGlow = writeSideGlow;
    module.exports.__test.maybeClearNeutralCachesForLowGameTime = maybeClearNeutralCachesForLowGameTime;
    module.exports.__test.scanPowerups = scanPowerups;
    module.exports.__test.parseSec = parseSec;
    module.exports.__test.gTime = gTime;
    module.exports.__test.boot = boot;
    module.exports.__test.ensureTimerHosts = ensureTimerHosts;
    module.exports.__test.retire = retire;
    module.exports.__test.timerAlive = timerAlive;
    module.exports.__test.setInstanceTestState = function (patch) {
      if (!patch) return;
      if (patch.instanceGen !== undefined) _instanceGen = patch.instanceGen;
      if (patch.hudRoot !== undefined) _hudRoot = patch.hudRoot;
      if (patch.retired !== undefined) _retired = !!patch.retired;
    };
    module.exports.__test.getInstanceTestState = function () {
      return { instanceGen: _instanceGen, retired: _retired, hosts: {
        timerOverlay: TIMER_HOSTS[0], glowClip: TIMER_HOSTS[1],
        lingerLayer: TIMER_HOSTS[2], timerDock: TIMER_HOSTS[3]
      } };
    };
    module.exports.__test.watchdogTick = watchdogTick;
    module.exports.__test.runTimerLane = runTimerLane;
    module.exports.__test.doScan = doScan;
    module.exports.__test.collectMinimapSnapshot = collectMinimapSnapshot;
    module.exports.__test.checkEnemyLinger = checkEnemyLinger;
    module.exports.__test.readSettingsContract = readSettingsContract;
    module.exports.__test.computeNearestForTargets = computeNearestForTargets;
    module.exports.__test.setClockTestPanel = function (panel) {
      _gameTimePanel = panel;
      _tCache = -1;
      _tCacheTs = -Infinity;
    };
    module.exports.__test.setMiniCardTestPanel = function (panel) {
      UI.rejuvMiniCard = panel;
      delete WRITE_CACHE["miniActive"];
      delete WRITE_CACHE["miniBuffActive"];
    };
    module.exports.__test.setMinimapTestUi = function (minimap) {
      UI.minimap = minimap;
      _mapButtonCache = null;
      _mapButtonCacheTs = 0;
      _snapshotTs = 0;
    };
    module.exports.__test.setPowerupTestState = function (patch) {
      if (!patch) return;
      knownSpawnPos = patch.knownSpawnPos || null;
      pretrackActive = !!patch.pretrackActive;
      const data = patch.pretrackData || {};
      pretrackData = {
        left: Object.assign({ minAlly: Infinity, minEnemy: Infinity }, data.left),
        right: Object.assign({ minAlly: Infinity, minEnemy: Infinity }, data.right)
      };
      trackedPowerups.length = 0;
      monitoringActive = false;
    };
    module.exports.__test.getPowerupTestState = function () {
      return {
        knownSpawnPos: knownSpawnPos && {
          left: knownSpawnPos.left && { x: knownSpawnPos.left.x, y: knownSpawnPos.left.y },
          right: knownSpawnPos.right && { x: knownSpawnPos.right.x, y: knownSpawnPos.right.y }
        },
        tracked: trackedPowerups.map((powerup) => ({
          side: powerup.side,
          minAllyDist: powerup.minAllyDist,
          minEnemyDist: powerup.minEnemyDist
        }))
      };
    };
    module.exports.__test.setRejuvTestState = function (patch) {
      if (!patch) return;
      running = !!patch.running;
      spawnWait = !!patch.spawnWait;
      claimCnt = Number(patch.claimCnt) || 0;
      lastFound = !!patch.lastFound;
      UI.rejuvFriendly = patch.rejuvFriendly || null;
      UI.rejuvEnemy = patch.rejuvEnemy || null;
      UI.topBar = patch.topBar || null;
      UI.root = patch.root || null;
      _rejuvResolveTs = -Infinity;
      _rejuvReboundPending = false;
      LAST_TICK["scan"] = 0;
    };
    module.exports.__test.getRejuvTestState = function () {
      return { running, spawnWait, claimCnt, lastFound, resolveTs: _rejuvResolveTs };
    };
    module.exports.__test.setPlayerStateTest = function (id, state) {
      _playerState = Object.create(null);
      _playerState[id] = Object.assign(
        { x: 0, y: 0, deadTs: 0, wasActive: true, team: 0, lastSeenMs: 0, seenToken: 0 },
        state
      );
    };
    module.exports.__test.getPlayerStateTest = function (id) {
      const state = _playerState[id];
      return state && Object.assign({}, state);
    };
    module.exports.__test.setPanelClass = setPanelClass;
    module.exports.__test.setMiniCardState = setMiniCardState;
    module.exports.__test.isChatIntentInFlight = function () {
      return !!_chatIntentInFlight;
    };
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
      if (patch && patch.running !== undefined) running = !!patch.running;
      if (patch && Number.isFinite(patch.lastGlobalSec)) lastGlobalSec = patch.lastGlobalSec;
      if (patch && Number.isFinite(patch.lastGateChk)) lastGateChk = patch.lastGateChk;
      if (patch && Number.isFinite(patch.nextLoopDueMs)) _nextLoopDueMs = patch.nextLoopDueMs;
    };
    module.exports.__test.getLoopTestState = function () {
      return {
        generation: _generation,
        playerSeenToken: _playerSeenToken,
        lowTimeCleared: _lowTimeCacheCleared,
        running,
        lastGlobalSec,
        nextLoopDueMs: _nextLoopDueMs
      };
    };
    module.exports.__test.setObjectiveTestState = function (patch) {
      running = !!patch?.running;
      UI.hud = patch?.hud || null;
      UI.riftCard = patch?.riftCard || null;
      UI.urnCard = patch?.urnCard || null;
      WRITE_CACHE["riftActive"] = null;
      WRITE_CACHE["urnActive"] = null;
    };
    module.exports.__test.setChatTestGeneration = function (generation) {
      const next = Number(generation) || 0;
      if (next !== _generation) clearPendingChatIntent(undefined, true);
      _generation = next;
    };
    module.exports.__test.setLingerTestUi = function (container, minimap, lingerLayer) {
      UI.minimapContainer = container;
      UI.minimap = minimap;
      UI.lingerLayer = lingerLayer || container;
    };
    module.exports.__test.showLinger = showLinger;
    module.exports.__test.removeLinger = removeLinger;
    module.exports.__test.TeamChatIntent = TeamChatIntent;
  }
  // TEST_EXPORTS_END
  boot();
})();
