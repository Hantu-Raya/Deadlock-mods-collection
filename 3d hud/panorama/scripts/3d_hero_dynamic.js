"use strict";

(function () {
  var FAST_POLL_SEC = 0.25;
  var SLOW_POLL_SEC = 0.75;
  var HEALTH_TICK_SEC = 0.05;
  var HEALTH_RESCAN_MS = 500;
  var HEALTH_EFFECT_EPSILON = 0.005;
  var HEALTH_SEGMENT_STALE_MS = 1250;
  var HEALTH_DAMAGE_HOLD_MS = 900;
  var HEALTH_TEXT_WIDTH = 200;
  var HEALTH_TEXT_HEIGHT = 64;
  var HEALTH_CURRENT_LABEL_WIDTH = 136;
  var HEALTH_MAX_LABEL_LEFT = 138;
  var HEALTH_DIGIT_WIDTH = 18;
  var HEALTH_SUFFIX_CHAR_WIDTH = 7;
  var HEALTH_TEXT_CLIP_PAD = 8;
  var HEALTH_MIN_FILL_BASE_PX = 6;
  var HEALTH_MIN_FILL_PER_DIGIT_PX = 4;
  var HEALTH_SCAN_NODE_LIMIT = 96;
  var HEALTH_SCAN_MAX_DEPTH = 5;
  var HERO_LOCK_SAMPLE_MS = 10000;
  var GAME_TIME_CACHE_MS = 250;
  var LOCKED_GAME_TIME_CHECK_START_SEC = 10;
  var LOCKED_GAME_TIME_CHECK_MS = 60000;
  var LOCKED_HERO_SANITY_CHECK_MS = 3000;
  var LOBBY_POLL_SEC = 5;
  var LOBBY_RUN_CHECK_MS = 60000;
  var MATCH_ACTIVE_GAME_STATE = 6;
  var PROGRESS_VALUE_PROPS = ["value", "current", "currentvalue", "actualvalue"];
  var PROGRESS_MAX_PROPS = ["max", "maximum", "maxvalue"];
  var HEIGHT_METRIC_PROPS = ["actuallayoutheight", "actualheight", "contentheight", "desiredlayoutheight"];
  var WIDTH_METRIC_PROPS = ["actuallayoutwidth", "actualwidth", "contentwidth", "desiredlayoutwidth"];
  var Y_OFFSET_PROPS = ["actualyoffset", "actualy", "yoffset", "layouty"];
  var X_OFFSET_PROPS = ["actualxoffset", "actualx", "xoffset", "layoutx"];
  var DIGIT_RE = /\d/;
  var INACTIVE_CLIP = { left: 0, right: 0 };

  var HERO_DATA = [
    { hero: "hero_inferno", id: 1, map: "maps/ui/hero_prefabs/inferno.vmap", aliases: [] },
    { hero: "hero_gigawatt", id: 2, map: "maps/ui/hero_prefabs/gigawatt.vmap", aliases: [] },
    { hero: "hero_hornet", id: 3, map: "maps/ui/hero_prefabs/hornet.vmap", aliases: [] },
    { hero: "hero_ghost", id: 4, map: "maps/ui/hero_prefabs/geist.vmap", aliases: ["geist"] },
    { hero: "hero_atlas", id: 6, map: "maps/ui/hero_prefabs/abrams.vmap", aliases: ["bull"] },
    { hero: "hero_wraith", id: 7, map: "maps/ui/hero_prefabs/wraith.vmap", aliases: [] },
    { hero: "hero_forge", id: 8, map: "maps/ui/hero_prefabs/forge.vmap", aliases: ["engineer"] },
    { hero: "hero_chrono", id: 10, map: "maps/ui/hero_prefabs/chrono.vmap", aliases: [] },
    { hero: "hero_dynamo", id: 11, map: "maps/ui/hero_prefabs/prof_dynamo.vmap", aliases: ["sumo"] },
    { hero: "hero_kelvin", id: 12, map: "maps/ui/hero_prefabs/kelvin.vmap", aliases: [] },
    { hero: "hero_haze", id: 13, map: "maps/ui/hero_prefabs/haze.vmap", aliases: [] },
    { hero: "hero_astro", id: 14, map: "maps/ui/hero_prefabs/astro.vmap", aliases: [] },
    { hero: "hero_bebop", id: 15, map: "maps/ui/hero_prefabs/bebop.vmap", aliases: [] },
    { hero: "hero_nano", id: 16, map: "maps/ui/hero_prefabs/nano.vmap", aliases: [] },
    { hero: "hero_orion", id: 17, map: "maps/ui/hero_prefabs/archer.vmap", aliases: ["archer"] },
    { hero: "hero_krill", id: 18, map: "maps/ui/hero_prefabs/digger.vmap", aliases: ["digger"] },
    { hero: "hero_shiv", id: 19, map: "maps/ui/hero_prefabs/shiv.vmap", aliases: [] },
    { hero: "hero_tengu", id: 20, map: "maps/ui/hero_prefabs/tengu.vmap", aliases: [] },
    { hero: "hero_warden", id: 25, map: "maps/ui/hero_prefabs/warden.vmap", aliases: [] },
    { hero: "hero_yamato", id: 27, map: "maps/ui/hero_prefabs/yamato.vmap", aliases: [] },
    { hero: "hero_lash", id: 31, map: "maps/ui/hero_prefabs/lash.vmap", aliases: [] },
    { hero: "hero_viscous", id: 35, map: "maps/ui/hero_prefabs/viscous.vmap", aliases: [] },
    { hero: "hero_synth", id: 50, map: "maps/ui/hero_prefabs/pocket.vmap", aliases: ["pocket"] },
    { hero: "hero_mirage", id: 52, map: "maps/ui/hero_prefabs/mirage.vmap", aliases: [] },
    { hero: "hero_viper", id: 58, map: "maps/ui/hero_prefabs/viper.vmap", aliases: [] },
    { hero: "hero_magician", id: 60, map: "maps/ui/hero_prefabs/magician.vmap", aliases: [] },
    { hero: "hero_vampirebat", id: 63, map: "maps/ui/hero_prefabs/vampirebat.vmap", aliases: [] },
    { hero: "hero_drifter", id: 64, map: "maps/ui/hero_prefabs/drifter.vmap", aliases: [] },
    { hero: "hero_priest", id: 65, map: "maps/ui/hero_prefabs/priest.vmap", aliases: [] },
    { hero: "hero_frank", id: 66, map: "maps/ui/hero_prefabs/frank.vmap", aliases: [] },
    { hero: "hero_bookworm", id: 67, map: "maps/ui/hero_prefabs/bookworm.vmap", aliases: [] },
    { hero: "hero_doorman", id: 69, map: "maps/ui/hero_prefabs/doorman.vmap", aliases: [] },
    { hero: "hero_punkgoat", id: 72, map: "maps/ui/hero_prefabs/punkgoat.vmap", aliases: [] },
    { hero: "hero_necro", id: 76, map: "maps/ui/hero_prefabs/necro.vmap", aliases: [] },
    { hero: "hero_fencer", id: 77, map: "maps/ui/hero_prefabs/apollo.vmap", aliases: ["apollo"] },
    { hero: "hero_familiar", id: 79, map: "maps/ui/hero_prefabs/familiar.vmap", aliases: [] },
    { hero: "hero_werewolf", id: 80, map: "maps/ui/hero_prefabs/werewolf.vmap", aliases: [] },
    { hero: "hero_unicorn", id: 81, map: "maps/ui/hero_prefabs/unicorn.vmap", aliases: [] }
  ];

  var HERO_BY_NAME = {};
  var HERO_ALIAS_LIST = [];
  var HERO_ALIAS_LOOKUP = {};
  var SCENE_BY_HERO = {};
  var SCAN_STACK = [];
  var SCAN_DEPTH = [];
  var gameTimePanel = null;
  var gameTimePanelMs = 0;
  var zeroSampleHero = "";
  var zeroSampleStartMs = 0;
  var lockedHero = "";
  var lastHero = "";
  var lastHeroId = -1;
  var sceneCache = null;
  var currentScenePanel = null;
  var lastGameTimeWasZero = false;
  var lockedGameTimeLastSec = -1;
  var lockedGameTimeNextCheckMs = 0;
  var lockedHeroSanityNextMs = 0;
  var heroTimerPausedForLobby = false;
  var lastLobbyRunCheckMs = 0;
  var matchStateConfirmedActive = false;

  var UI = {
    root: null,
    hud: null,
    host: null,
    heroProbe: null,
    gameplayAlive: null,
    crosshair: null,
    progress: null,
    healthRoot: null,
    healthBar: null,
    healthBarFill: null,
    pendingDamage: null,
    pendingHeal: null,
    pendingDamageMiddle: null,
    pendingHealMiddle: null,
    currentHealth: null,
    maxHealth: null,
    hpCustomText: null,
    hpCustomFill: null,
    hpCurrentBase: null,
    hpCurrentFill: null,
    hpMaxBase: null,
    hpMaxFill: null,
    hpCustomDamage: null,
    hpCustomDeferred: null,
    hpCustomHeal: null,
    hpCurrentDamage: null,
    hpMaxDamage: null,
    hpCurrentDeferred: null,
    hpMaxDeferred: null,
    hpCurrentHeal: null,
    hpMaxHeal: null,
    hpProgressSource: null,
    hpRegenContainer: null,
    healthSourceHidden: false,
    lastHealthScanMs: 0,
    lastHpCurrent: -1,
    lastHpMax: -1,
    lastHpDamaged: null,
    lastHpRegenWide: null,
    lastHpClip: -1,
    lastDeferredClip: -1,
    lastDeferredLeftClip: -1,
    lastDamageClip: -1,
    lastDamageLeftClip: -1,
    lastHealClip: -1,
    lastHealLeftClip: -1,
    lastHealSegmentKey: "",
    lastHealSegmentMs: 0,
    lastHealthCurrentForEffect: -1,
    lastClipBoundsKey: "",
    lastClipBounds: null,
    damageHoldLeft: 0,
    damageHoldRight: 0,
    damageHoldMs: 0
  };

  function log(msg) {
    try { $.Msg("[3D-HUD] " + msg); } catch (e) {}
  }

  function isValidPanel(panel) {
    try { return !!(panel && panel.IsValid && panel.IsValid()); } catch (e) { return false; }
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase();
  }

  function registerAlias(alias, heroName) {
    var cleanAlias = normalizeText(alias);
    if (!cleanAlias || !HERO_BY_NAME[heroName] || HERO_ALIAS_LOOKUP[cleanAlias]) return;

    HERO_ALIAS_LOOKUP[cleanAlias] = heroName;
    HERO_ALIAS_LIST.push({
      alias: cleanAlias,
      hero: heroName,
      token: cleanAlias.replace(/^hero_/, "")
    });
  }

  function buildTables() {
    for (var i = 0; i < HERO_DATA.length; i++) {
      var record = HERO_DATA[i];
      HERO_BY_NAME[record.hero] = record;
      SCENE_BY_HERO[record.hero] = "ThreeDHeroScene_" + record.hero;

      registerAlias(record.hero, record.hero);
      registerAlias(record.hero.replace(/^hero_/, ""), record.hero);

      for (var j = 0; j < record.aliases.length; j++) {
        registerAlias(record.aliases[j], record.hero);
      }
    }

    HERO_ALIAS_LIST.sort(function (a, b) {
      return b.token.length - a.token.length;
    });
  }

  function rootPanel() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel || $.GetContextPanel();
  }

  function getRootPanel() {
    if (isValidPanel(UI.root)) return UI.root;
    UI.root = rootPanel();
    resetCacheRefs();
    return UI.root;
  }

  function resetCacheRefs() {
    UI.hud = null;
    clearHeroDetectionRefs();
    UI.host = null;
    UI.heroProbe = null;
    UI.healthRoot = null;
    UI.healthBar = null;
    UI.healthBarFill = null;
    UI.pendingDamage = null;
    UI.pendingHeal = null;
    UI.pendingDamageMiddle = null;
    UI.pendingHealMiddle = null;
    UI.currentHealth = null;
    UI.maxHealth = null;
    UI.hpCustomText = null;
    UI.hpCustomFill = null;
    UI.hpCurrentBase = null;
    UI.hpCurrentFill = null;
    UI.hpMaxBase = null;
    UI.hpMaxFill = null;
    UI.hpCustomDamage = null;
    UI.hpCustomDeferred = null;
    UI.hpCustomHeal = null;
    UI.hpCurrentDamage = null;
    UI.hpMaxDamage = null;
    UI.hpCurrentDeferred = null;
    UI.hpMaxDeferred = null;
    UI.hpCurrentHeal = null;
    UI.hpMaxHeal = null;
    UI.hpProgressSource = null;
    UI.hpRegenContainer = null;
    UI.healthSourceHidden = false;
    UI.lastHealthScanMs = 0;
    UI.lastHpCurrent = -1;
    UI.lastHpMax = -1;
    UI.lastHpDamaged = null;
    UI.lastHpRegenWide = null;
    UI.lastHpClip = -1;
    UI.lastDeferredClip = -1;
    UI.lastDeferredLeftClip = -1;
    UI.lastDamageClip = -1;
    UI.lastDamageLeftClip = -1;
    UI.lastHealClip = -1;
    UI.lastHealLeftClip = -1;
    UI.lastHealSegmentKey = "";
    UI.lastHealSegmentMs = 0;
    UI.lastHealthCurrentForEffect = -1;
    UI.lastClipBoundsKey = "";
    UI.lastClipBounds = null;
    UI.damageHoldLeft = 0;
    UI.damageHoldRight = 0;
    UI.damageHoldMs = 0;
    sceneCache = null;
    currentScenePanel = null;
  }

  function clearHeroDetectionRefs() {
    UI.gameplayAlive = null;
    UI.crosshair = null;
    UI.progress = null;
  }

  function findChild(panel, id) {
    try { return panel && panel.FindChildTraverse ? panel.FindChildTraverse(id) : null; } catch (e) { return null; }
  }

  function findDirectChildWhere(panel, id, predicate) {
    var children = getChildren(panel);
    var fallback = null;

    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (panelId(child) !== id) continue;
      if (!fallback) fallback = child;
      if (!predicate || predicate(child)) return child;
    }

    return fallback;
  }

  function getChildren(panel) {
    try { return panel && panel.Children ? panel.Children() : []; } catch (e) { return []; }
  }

  function panelId(panel) {
    try { return panel && panel.id ? String(panel.id) : ""; } catch (e) { return ""; }
  }

  function hasClass(panel, className) {
    try { return !!(panel && panel.BHasClass && panel.BHasClass(className)); } catch (e) { return false; }
  }

  function resolveHudPanel() {
    if (isValidPanel(UI.hud)) return UI.hud;
    UI.hud = findChild(getRootPanel(), "Hud");
    return UI.hud;
  }

  function hasHideoutClass(panel) {
    if (!isValidPanel(panel)) return false;

    return hasClass(panel, "connectedToHideout") ||
      hasClass(panel, "connectedtoHideout") ||
      hasClass(panel, "connectedtohideout") ||
      hasClass(panel, "connectedToHideOut") ||
      hasClass(panel, "inHideoutIntro");
  }

  function readGameState() {
    var state = -1;
    try {
      if (typeof Game !== "undefined" && Game && Game.GetState) {
        state = Number(Game.GetState());
      }
    } catch (e1) {
      state = -1;
    }

    if (state === state && state !== Infinity && state !== -Infinity) {
      return state;
    }

    return -1;
  }

  function evaluateLobbyStatus() {
    var gameState = readGameState();
    if (gameState >= MATCH_ACTIVE_GAME_STATE) {
      matchStateConfirmedActive = true;
      return false;
    }
    if (gameState >= 0) {
      matchStateConfirmedActive = false;
      return true;
    }

    var hud = resolveHudPanel();
    var root = getRootPanel();
    if (hasHideoutClass(hud) || hasHideoutClass(root)) {
      matchStateConfirmedActive = false;
      return true;
    }

    if (!matchStateConfirmedActive) {
      if (readGameTimeSec() >= 0) {
        matchStateConfirmedActive = true;
        return false;
      }

      matchStateConfirmedActive = false;
      return true;
    }

    return false;
  }

  function clearGameTimeCache() {
    gameTimePanel = null;
    gameTimePanelMs = 0;
  }

  function pauseHeroTimerForLobby() {
    if (!heroTimerPausedForLobby) {
      heroTimerPausedForLobby = true;
      resetHeroLock();
      clearGameTimeCache();
      clearHeroDetectionRefs();
      lastGameTimeWasZero = false;
    }
  }

  function resumeHeroTimerFromLobby() {
    if (!heroTimerPausedForLobby) return;

    heroTimerPausedForLobby = false;
    clearGameTimeCache();
    clearHeroDetectionRefs();
    lastGameTimeWasZero = false;
  }

  function setPanelClass(panel, className, enabled) {
    if (!isValidPanel(panel)) return;

    try {
      if (panel.SetHasClass) {
        panel.SetHasClass(className, enabled);
        return;
      }
    } catch (e1) {}

    try {
      if (enabled) {
        panel.AddClass(className);
      } else {
        panel.RemoveClass(className);
      }
    } catch (e2) {}
  }

  function parsePanelNumber(panel) {
    var text = "";
    try { text = String(panel && panel.text ? panel.text : ""); } catch (e1) { text = ""; }

    var match = text.match(/\d+/g);
    if (!match || !match.length) return -1;

    var value = Number(match.join(""));
    return isFinite(value) ? value : -1;
  }

  function nowMs() {
    try { return Date.now(); } catch (e1) {}
    try { return new Date().getTime(); } catch (e2) {}
    return 0;
  }

  function parseSecondsFromText(text) {
    if (!text) return -1;

    var str = String(text);
    var colon = str.indexOf(":");
    if (colon <= 0) return -1;

    var mm = 0;
    var ss = 0;
    var i;
    var c;

    for (i = 0; i < colon; i++) {
      c = str.charCodeAt(i);
      if (c >= 48 && c <= 57) {
        mm = (mm * 10) + (c - 48);
      }
    }

    for (i = colon + 1; i < str.length && i < colon + 3; i++) {
      c = str.charCodeAt(i);
      if (c < 48 || c > 57) {
        break;
      }
      ss = (ss * 10) + (c - 48);
    }

    if (ss > 59) ss = ss % 60;
    return mm * 60 + ss;
  }

  function resolveGameTimePanel() {
    if (isValidPanel(gameTimePanel)) return gameTimePanel;

    var root = getRootPanel();
    var classes = null;
    var topBar = null;

    try {
      topBar = findChild(root, "TopBar");
      if (isValidPanel(topBar)) {
        classes = topBar.FindChildrenWithClassTraverse("GameTime");
      }
      if ((!classes || !classes[0]) && isValidPanel(root)) {
        classes = root.FindChildrenWithClassTraverse("GameTime");
      }
      if (classes && classes[0]) {
        gameTimePanel = classes[0];
        return gameTimePanel;
      }
    } catch (e1) {}

    return null;
  }

  function readGameTimeSec() {
    var now = nowMs();
    if (!isValidPanel(gameTimePanel) || (now - gameTimePanelMs) > GAME_TIME_CACHE_MS) {
      gameTimePanel = resolveGameTimePanel();
      gameTimePanelMs = now;
    }

    if (!isValidPanel(gameTimePanel)) {
      return -1;
    }

    var parsed = -1;
    try { parsed = parseSecondsFromText(gameTimePanel.text); } catch (e1) {}
    return parsed >= 0 ? parsed : -1;
  }

  function resetHeroLock() {
    zeroSampleHero = "";
    zeroSampleStartMs = 0;
    lockedHero = "";
    lockedGameTimeLastSec = -1;
    lockedGameTimeNextCheckMs = 0;
    lockedHeroSanityNextMs = 0;
  }

  function lockedHeroSanityCheck(now) {
    if (!lockedHero || now < lockedHeroSanityNextMs) return false;
    lockedHeroSanityNextMs = now + LOCKED_HERO_SANITY_CHECK_MS;

    if (evaluateLobbyStatus()) {
      pauseHeroTimerForLobby();
      return true;
    }

    clearHeroDetectionRefs();
    var currentHero = detectHero();
    if (!currentHero || currentHero === lockedHero) return false;

    resetHeroLock();
    updateZeroHeroSample(currentHero, now);
    switchHeroScene(currentHero);
    return false;
  }

  function armLockedGameTimeCheck(now, gameTimeNow) {
    if (!lockedHero || gameTimeNow <= LOCKED_GAME_TIME_CHECK_START_SEC || lockedGameTimeNextCheckMs > 0) return;

    lockedGameTimeLastSec = gameTimeNow;
    lockedGameTimeNextCheckMs = now + LOCKED_GAME_TIME_CHECK_MS;
  }

  function checkLockedGameTimeReset(now, gameTimeNow) {
    if (!lockedHero) return false;

    if (lockedGameTimeNextCheckMs <= 0) {
      armLockedGameTimeCheck(now, gameTimeNow);
      return false;
    }

    if (now < lockedGameTimeNextCheckMs) {
      return false;
    }

    var oldGameTime = lockedGameTimeLastSec;
    if (gameTimeNow < 0) {
      lockedGameTimeNextCheckMs = now + LOCKED_GAME_TIME_CHECK_MS;
      return false;
    }

    var resetNeeded = gameTimeNow === 0 || (oldGameTime >= 0 && gameTimeNow >= 0 && oldGameTime > gameTimeNow);
    if (resetNeeded) {
      resetHeroLock();
      return true;
    }

    lockedGameTimeLastSec = gameTimeNow;
    lockedGameTimeNextCheckMs = now + LOCKED_GAME_TIME_CHECK_MS;
    return false;
  }

  function updateZeroHeroSample(heroName, now) {
    if (!heroName) return;

    if (!zeroSampleHero) {
      zeroSampleHero = heroName;
      zeroSampleStartMs = now;
      return;
    }

    if (heroName !== zeroSampleHero) {
      zeroSampleHero = heroName;
      zeroSampleStartMs = now;
      return;
    }

    if (!lockedHero && now - zeroSampleStartMs >= HERO_LOCK_SAMPLE_MS) {
      lockedHero = heroName;
    }
  }

  function detectSampleAndSwitch(now, gameTimeNow) {
    var hero = detectHero();
    if (!hero) {
      return false;
    }

    updateZeroHeroSample(hero, now);
    armLockedGameTimeCheck(now, gameTimeNow);
    switchHeroScene(hero);
    return true;
  }

  function setLabelText(panel, text) {
    if (!isValidPanel(panel)) return;
    try {
      if (panel.text !== text) panel.text = text;
    } catch (e1) {}
  }

  function ensureHealthSourceHidden() {
    if (UI.healthSourceHidden) return;

    try {
      UI.currentHealth.style.opacity = "0";
      UI.currentHealth.style.visibility = "visible";
    } catch (e1) {}

    try {
      UI.maxHealth.style.opacity = "0";
      UI.maxHealth.style.visibility = "visible";
    } catch (e2) {}

    try {
      UI.hpProgressSource.style.opacity = "0.001";
      UI.hpProgressSource.style.visibility = "visible";
    } catch (e3) {}

    UI.healthSourceHidden = true;
  }

  function panelNumberProp(panel, names) {
    if (!isValidPanel(panel)) return -1;

    for (var i = 0; i < names.length; i++) {
      try {
        var value = Number(panel[names[i]]);
        if (isFinite(value) && value >= 0) return value;
      } catch (e1) {}
    }

    return -1;
  }

  function panelMetric(panel, names) {
    if (!isValidPanel(panel)) return 0;

    for (var i = 0; i < names.length; i++) {
      try {
        var value = Number(panel[names[i]]);
        if (isFinite(value) && value > 0) return value;
      } catch (e1) {}
    }

    return 0;
  }

  function panelOffset(panel, names) {
    if (!isValidPanel(panel)) return -1;

    for (var i = 0; i < names.length; i++) {
      try {
        var value = Number(panel[names[i]]);
        if (isFinite(value) && value >= 0) return value;
      } catch (e1) {}
    }

    return -1;
  }

  function findPanelByClass(scope, className) {
    if (!isValidPanel(scope)) return null;

    SCAN_STACK.length = 0;
    SCAN_DEPTH.length = 0;
    SCAN_STACK.push(scope);
    SCAN_DEPTH.push(0);
    var seen = 0;

    while (SCAN_STACK.length && seen < HEALTH_SCAN_NODE_LIMIT) {
      var panel = SCAN_STACK.pop();
      var depth = SCAN_DEPTH.pop();
      if (!isValidPanel(panel) || depth > HEALTH_SCAN_MAX_DEPTH) continue;
      seen++;

      if (hasClass(panel, className)) return panel;

      var children = getChildren(panel);
      for (var i = children.length - 1; i >= 0; i--) {
        SCAN_STACK.push(children[i]);
        SCAN_DEPTH.push(depth + 1);
      }
    }

    return null;
  }

  function progressValueState(bar) {
    var value = panelNumberProp(bar, PROGRESS_VALUE_PROPS);
    var maxValue = panelNumberProp(bar, PROGRESS_MAX_PROPS);
    return {
      value: value,
      max: maxValue,
      readable: value >= 0 && maxValue > 0,
      ratio: value > 0 && maxValue > 0 ? clampRatio(value / maxValue) : 0
    };
  }

  function progressSegmentRatio(bar, fill) {
    if (!isValidPanel(bar) || !isValidPanel(fill)) return { valid: false, left: 0, right: 0 };

    var totalH = panelMetric(bar, HEIGHT_METRIC_PROPS);
    var fillH = panelMetric(fill, HEIGHT_METRIC_PROPS);
    var barY = panelOffset(bar, Y_OFFSET_PROPS);
    var fillY = panelOffset(fill, Y_OFFSET_PROPS);
    var y = fillY;
    if (barY >= 0 && fillY >= 0 && fillY > totalH) y = fillY - barY;
    if (totalH > 0 && fillH > 0 && y >= 0) {
      var topY = Math.max(0, Math.min(totalH, y));
      var bottomY = Math.max(0, Math.min(totalH, y + fillH));
      var top = clampRatio(1 - (bottomY / totalH));
      var bottom = clampRatio(1 - (topY / totalH));
      return { valid: true, left: Math.min(top, bottom), right: Math.max(top, bottom) };
    }

    var totalW = panelMetric(bar, WIDTH_METRIC_PROPS);
    var fillW = panelMetric(fill, WIDTH_METRIC_PROPS);
    var barX = panelOffset(bar, X_OFFSET_PROPS);
    var fillX = panelOffset(fill, X_OFFSET_PROPS);
    var x = fillX;
    if (barX >= 0 && fillX >= 0 && fillX > totalW) x = fillX - barX;
    if (totalW > 0 && fillW > 0 && x >= 0) {
      return {
        valid: true,
        left: clampRatio(x / totalW),
        right: clampRatio((x + fillW) / totalW)
      };
    }

    return { valid: false, left: 0, right: 0 };
  }

  function readPendingState(bar, middle) {
    return {
      value: progressValueState(bar),
      segment: progressSegmentRatio(bar, middle)
    };
  }

  function textVisualWidth(text, digitWidth, otherWidth) {
    var value = String(text || "");
    var width = 0;
    for (var i = 0; i < value.length; i++) {
      width += DIGIT_RE.test(value.charAt(i)) ? digitWidth : otherWidth;
    }

    return width;
  }

  function textDigitCount(text) {
    var value = String(text || "");
    var count = 0;
    for (var i = 0; i < value.length; i++) {
      if (DIGIT_RE.test(value.charAt(i))) count++;
    }

    return Math.max(1, count);
  }

  function healthTextClipBounds(currentText, maxText, damaged) {
    var key = currentText + "|" + maxText + "|" + (damaged ? "1" : "0");
    if (key === UI.lastClipBoundsKey && UI.lastClipBounds) return UI.lastClipBounds;

    var currentWidth = Math.min(HEALTH_CURRENT_LABEL_WIDTH, textVisualWidth(currentText, HEALTH_DIGIT_WIDTH, HEALTH_DIGIT_WIDTH * 0.5));
    var maxWidth = damaged ? textVisualWidth(maxText, HEALTH_SUFFIX_CHAR_WIDTH, HEALTH_SUFFIX_CHAR_WIDTH * 0.65) : 0;
    var left = Math.max(0, HEALTH_CURRENT_LABEL_WIDTH - currentWidth - HEALTH_TEXT_CLIP_PAD);
    var right = damaged ? Math.min(HEALTH_TEXT_WIDTH, HEALTH_MAX_LABEL_LEFT + maxWidth + HEALTH_TEXT_CLIP_PAD) : HEALTH_CURRENT_LABEL_WIDTH + HEALTH_TEXT_CLIP_PAD;

    if (right <= left) right = Math.min(HEALTH_TEXT_WIDTH, left + currentWidth);
    UI.lastClipBoundsKey = key;
    UI.lastClipBounds = { left: left, right: right };
    return UI.lastClipBounds;
  }

  function currentTextClipBounds(currentText) {
    var currentWidth = Math.min(HEALTH_CURRENT_LABEL_WIDTH, textVisualWidth(currentText, HEALTH_DIGIT_WIDTH, HEALTH_DIGIT_WIDTH * 0.5));
    var left = Math.max(0, HEALTH_CURRENT_LABEL_WIDTH - currentWidth);
    var right = HEALTH_CURRENT_LABEL_WIDTH;
    if (right <= left) right = Math.min(HEALTH_TEXT_WIDTH, left + currentWidth);
    return { left: left, right: right };
  }

  function currentMinFillWidth(currentText, currentWidth) {
    var digitCount = textDigitCount(currentText);
    return Math.min(currentWidth, HEALTH_MIN_FILL_BASE_PX + (digitCount * HEALTH_MIN_FILL_PER_DIGIT_PX));
  }

  function setClipRect(panel, left, right, leftCacheName, rightCacheName) {
    if (!isValidPanel(panel)) return;

    var width = HEALTH_TEXT_WIDTH;
    var clipLeft = Math.round(Math.max(0, Math.min(width, left)));
    var clipRight = Math.round(Math.max(0, Math.min(width, right)));
    if (clipRight < clipLeft) clipRight = clipLeft;
    if ((!leftCacheName || clipLeft === UI[leftCacheName]) && clipRight === UI[rightCacheName]) return;

    try {
      panel.style.clip = "rect(0px, " + clipRight + "px, " + HEALTH_TEXT_HEIGHT + "px, " + clipLeft + "px)";
    } catch (e1) {}

    if (leftCacheName) UI[leftCacheName] = clipLeft;
    UI[rightCacheName] = clipRight;
  }

  function clampRatio(value) {
    return Math.max(0, Math.min(1, value));
  }

  function hasHealthPanelRefs() {
    return isValidPanel(UI.healthRoot) &&
      isValidPanel(UI.healthBar) &&
      isValidPanel(UI.healthBarFill) &&
      isValidPanel(UI.pendingDamage) &&
      isValidPanel(UI.pendingDamageMiddle) &&
      isValidPanel(UI.pendingHeal) &&
      isValidPanel(UI.pendingHealMiddle) &&
      isValidPanel(UI.hpCustomText) &&
      isValidPanel(UI.hpCustomFill) &&
      isValidPanel(UI.hpCustomDamage) &&
      isValidPanel(UI.hpCustomDeferred) &&
      isValidPanel(UI.hpCustomHeal) &&
      isValidPanel(UI.currentHealth) &&
      isValidPanel(UI.maxHealth);
  }

  function resolveHealthPanels(force) {
    var now = nowMs();
    if (!force) {
      if (hasHealthPanelRefs()) return;
      if (UI.lastHealthScanMs > 0 && (now - UI.lastHealthScanMs) < HEALTH_RESCAN_MS) return;
    }

    var root = getRootPanel();
    UI.healthRoot = findChild(root, "hud_health_bars");
    var scope = isValidPanel(UI.healthRoot) ? UI.healthRoot : root;

    UI.healthBar = findChild(scope, "health_bar");
    UI.pendingDamage = findChild(scope, "pending_incoming_damage");
    UI.pendingHeal = findChild(scope, "pending_incoming_heal");
    UI.healthBarFill = findPanelByClass(UI.healthBar, "ProgressBarLeft");
    UI.pendingDamageMiddle = findPanelByClass(UI.pendingDamage, "ProgressBarMiddle");
    UI.pendingHealMiddle = findPanelByClass(UI.pendingHeal, "ProgressBarMiddle");
    UI.hpCustomText = findChild(scope, "hp_custom_text");
    UI.hpCustomFill = findChild(scope, "hp_custom_fill");
    UI.hpCurrentBase = findChild(scope, "hp_custom_current_base");
    UI.hpCurrentFill = findChild(scope, "hp_custom_current_fill");
    UI.hpMaxBase = findChild(scope, "hp_custom_max_base");
    UI.hpMaxFill = findChild(scope, "hp_custom_max_fill");
    UI.hpCustomDamage = findChild(scope, "hp_custom_damage");
    UI.hpCustomDeferred = findChild(scope, "hp_custom_deferred");
    UI.hpCustomHeal = findChild(scope, "hp_custom_heal");
    UI.hpCurrentDamage = findChild(scope, "hp_custom_current_damage");
    UI.hpMaxDamage = findChild(scope, "hp_custom_max_damage");
    UI.hpCurrentDeferred = findChild(scope, "hp_custom_current_deferred");
    UI.hpMaxDeferred = findChild(scope, "hp_custom_max_deferred");
    UI.hpCurrentHeal = findChild(scope, "hp_custom_current_heal");
    UI.hpMaxHeal = findChild(scope, "hp_custom_max_heal");
    UI.hpProgressSource = findChild(scope, "hp_progress_source");
    UI.hpRegenContainer = findChild(scope, "hp_regen_container");
    UI.currentHealth = findChild(scope, "current_health");
    UI.maxHealth = findChild(scope, "max_health");
    if (!isValidPanel(UI.currentHealth)) UI.currentHealth = UI.hpCurrentBase;
    if (!isValidPanel(UI.maxHealth)) UI.maxHealth = UI.hpMaxBase;
    if (!isValidPanel(UI.healthRoot) && isValidPanel(UI.hpCustomText)) {
      try { UI.healthRoot = UI.hpCustomText.GetParent(); } catch (e1) {}
    }
    UI.lastHealthScanMs = now;
  }

  function readHealthState() {
    resolveHealthPanels(false);
    if (!isValidPanel(UI.currentHealth) || !isValidPanel(UI.maxHealth) || !isValidPanel(UI.hpCustomText) ||
        !isValidPanel(UI.hpCustomFill)) {
      return null;
    }

    ensureHealthSourceHidden();

    var current = parsePanelNumber(UI.currentHealth);
    var max = parsePanelNumber(UI.maxHealth);
    if (current < 0 || max <= 0) return null;

    return {
      current: current,
      max: max,
      currentRatio: clampRatio(current / max),
      currentText: String(current),
      maxText: "/" + String(max),
      damaged: current < max
    };
  }

  function writeHealthLabels(state) {
    if (state.current !== UI.lastHpCurrent) {
      setLabelText(UI.hpCurrentBase, state.currentText);
      setLabelText(UI.hpCurrentFill, state.currentText);
      setLabelText(UI.hpCurrentDeferred, state.currentText);
      setLabelText(UI.hpCurrentDamage, state.currentText);
      setLabelText(UI.hpCurrentHeal, state.currentText);
      UI.lastHpCurrent = state.current;
    }

    if (state.max !== UI.lastHpMax) {
      setLabelText(UI.hpMaxBase, state.maxText);
      setLabelText(UI.hpMaxFill, state.maxText);
      setLabelText(UI.hpMaxDeferred, state.maxText);
      setLabelText(UI.hpMaxDamage, state.maxText);
      setLabelText(UI.hpMaxHeal, state.maxText);
      UI.lastHpMax = state.max;
    }

    if (state.damaged !== UI.lastHpDamaged) {
      setPanelClass(UI.healthRoot, "hp-damaged", state.damaged);
      setPanelClass(UI.hpCustomText, "hp-damaged", state.damaged);
      UI.lastHpDamaged = state.damaged;
    }
  }

  function writeRegenPlacement(state) {
    var wide = state.currentText.length >= 4;
    if (wide === UI.lastHpRegenWide) return;

    setPanelClass(UI.healthRoot, "hp-current-wide", wide);
    setPanelClass(UI.hpRegenContainer, "hp-current-wide", wide);
    UI.lastHpRegenWide = wide;
  }

  function resolveCurrentClip(state) {
    var segment = progressSegmentRatio(UI.healthBar, UI.healthBarFill);
    if (segment.valid) {
      return { left: 0, right: clampRatio(segment.right - segment.left) };
    }

    return { left: 0, right: state.currentRatio };
  }

  function segmentKey(segment) {
    if (!segment || !segment.valid) return "";
    return String(Math.round(segment.left * 1000)) + ":" + String(Math.round(segment.right * 1000));
  }

  function isSegmentActive(segment) {
    if (!segment || !segment.valid || (segment.right - segment.left) <= HEALTH_EFFECT_EPSILON) return false;
    return !(segment.left <= HEALTH_EFFECT_EPSILON && segment.right >= 1 - HEALTH_EFFECT_EPSILON);
  }

  function heldDamageClip(state, now, hpDelta) {
    if (hpDelta < 0) {
      var previousRatio = clampRatio((state.current - hpDelta) / state.max);
      var holding = UI.damageHoldMs > 0 && (now - UI.damageHoldMs) <= HEALTH_DAMAGE_HOLD_MS;
      UI.damageHoldRight = holding ? Math.max(UI.damageHoldRight, previousRatio) : previousRatio;
      UI.damageHoldMs = now;
    }

    UI.damageHoldLeft = state.currentRatio;
    if (UI.damageHoldMs > 0 && (now - UI.damageHoldMs) <= HEALTH_DAMAGE_HOLD_MS &&
        (UI.damageHoldRight - UI.damageHoldLeft) > HEALTH_EFFECT_EPSILON) {
      return { left: UI.damageHoldLeft, right: UI.damageHoldRight };
    }

    return INACTIVE_CLIP;
  }

  function healSegmentClip(state, pending, now, hpDelta) {
    var segment = pending.segment;
    if (!isSegmentActive(segment)) return INACTIVE_CLIP;

    var key = segmentKey(segment);
    if (key !== UI.lastHealSegmentKey || hpDelta > 0 || UI.lastHealSegmentMs <= 0) {
      UI.lastHealSegmentKey = key;
      UI.lastHealSegmentMs = now;
    }

    if ((now - UI.lastHealSegmentMs) > HEALTH_SEGMENT_STALE_MS) return INACTIVE_CLIP;

    var healLeft = Math.max(state.currentRatio, clampRatio(segment.left));
    var healRight = Math.max(healLeft, clampRatio(segment.right));
    if ((healRight - healLeft) <= HEALTH_EFFECT_EPSILON) return INACTIVE_CLIP;
    return { left: healLeft, right: healRight };
  }

  function resolveDeferredDamageClip(state, pending) {
    if (pending.value.ratio > HEALTH_EFFECT_EPSILON) {
      return { left: clampRatio(state.currentRatio - pending.value.ratio), right: state.currentRatio };
    }

    var segment = pending.segment;
    if (isSegmentActive(segment)) {
      var segmentRight = Math.min(state.currentRatio, clampRatio(segment.right));
      var segmentLeft = Math.min(segmentRight, clampRatio(segment.left));
      if ((segmentRight - segmentLeft) > HEALTH_EFFECT_EPSILON) {
        return { left: segmentLeft, right: segmentRight };
      }
    }

    return INACTIVE_CLIP;
  }

  function resolveHealClip(state, pending, now, hpDelta) {
    if (pending.value.ratio > HEALTH_EFFECT_EPSILON) {
      UI.lastHealSegmentMs = now;
      return { left: state.currentRatio, right: clampRatio(state.currentRatio + pending.value.ratio) };
    }

    return healSegmentClip(state, pending, now, hpDelta);
  }

  function writeHealthClips(state, currentClip, deferredClip, damageClip, healClip) {
    var clipBounds = healthTextClipBounds(state.currentText, state.maxText, state.damaged);
    var clipWidth = clipBounds.right - clipBounds.left;
    var currentBounds = currentTextClipBounds(state.currentText);
    var currentWidth = currentBounds.right - currentBounds.left;
    var currentFillLeft = currentBounds.left + (currentWidth * currentClip.left);
    var currentFillRight = currentBounds.left + (currentWidth * currentClip.right);
    if (state.current > 0 && state.current < state.max) {
      currentFillRight = Math.min(currentBounds.right, Math.max(currentFillRight, currentFillLeft + currentMinFillWidth(state.currentText, currentWidth)));
    }

    setClipRect(UI.hpCustomFill, currentFillLeft, currentFillRight, null, "lastHpClip");
    setClipRect(UI.hpCustomDeferred, clipBounds.left + (clipWidth * deferredClip.left), clipBounds.left + (clipWidth * deferredClip.right), "lastDeferredLeftClip", "lastDeferredClip");
    var damageLeft = clipBounds.left + (clipWidth * damageClip.left);
    var damageRight = clipBounds.left + (clipWidth * damageClip.right);
    if ((damageClip.right - damageClip.left) > HEALTH_EFFECT_EPSILON) {
      var currentDamageLeft = Math.max(currentFillRight, currentBounds.left + (currentWidth * damageClip.left));
      var currentDamageRight = currentBounds.left + (currentWidth * damageClip.right);
      damageLeft = currentDamageLeft;
      damageRight = Math.max(damageRight, currentDamageRight);
    }

    setClipRect(UI.hpCustomDamage, damageLeft, damageRight, "lastDamageLeftClip", "lastDamageClip");
    setClipRect(UI.hpCustomHeal, clipBounds.left + (clipWidth * healClip.left), clipBounds.left + (clipWidth * healClip.right), "lastHealLeftClip", "lastHealClip");
  }

  function syncHealthTextState() {
    var state = readHealthState();
    if (!state) return;

    writeHealthLabels(state);
    writeRegenPlacement(state);

    var now = nowMs();
    var hpDelta = UI.lastHealthCurrentForEffect >= 0 ? state.current - UI.lastHealthCurrentForEffect : 0;
    UI.lastHealthCurrentForEffect = state.current;

    var damagePending = readPendingState(UI.pendingDamage, UI.pendingDamageMiddle);
    var healPending = readPendingState(UI.pendingHeal, UI.pendingHealMiddle);
    var deferredClip = resolveDeferredDamageClip(state, damagePending);
    var damageClip = heldDamageClip(state, now, hpDelta);
    var healClip = resolveHealClip(state, healPending, now, hpDelta);
    writeHealthClips(state, resolveCurrentClip(state), deferredClip, damageClip, healClip);
  }

  function heroClassOn(panel) {
    if (!isValidPanel(panel)) return "";
    for (var i = 0; i < HERO_ALIAS_LIST.length; i++) {
      if (hasClass(panel, HERO_ALIAS_LIST[i].alias)) return HERO_ALIAS_LIST[i].hero;
    }
    return "";
  }

  function hasDirectHeroProgress(panel) {
    var progress = findDirectChildWhere(panel, "progress", heroClassOn);
    return !!heroClassOn(progress);
  }

  function resolveProgressPanel() {
    var root = getRootPanel();

    if (!isValidPanel(UI.gameplayAlive)) {
      UI.gameplayAlive = findChild(root, "gameplay_hud_alive");
      UI.crosshair = null;
      UI.progress = null;
    }
    if (!isValidPanel(UI.gameplayAlive)) {
      UI.crosshair = null;
      UI.progress = null;
      return null;
    }

    var directCrosshair = findDirectChildWhere(UI.gameplayAlive, "crosshair", hasDirectHeroProgress);
    if (directCrosshair !== UI.crosshair) {
      UI.crosshair = directCrosshair;
      UI.progress = null;
    }
    if (!isValidPanel(UI.crosshair)) {
      UI.progress = null;
      return null;
    }

    var directProgress = findDirectChildWhere(UI.crosshair, "progress", heroClassOn);
    if (directProgress !== UI.progress) {
      UI.progress = directProgress;
    }
    if (!isValidPanel(UI.progress)) return null;

    return UI.progress;
  }

  function heroFromProgress() {
    return heroClassOn(resolveProgressPanel());
  }

  function detectHero() {
    return heroFromProgress();
  }

  function hideScene(scene) {
    if (!isValidPanel(scene)) return;
    try { scene.RemoveClass("ShowingHero"); } catch (e1) {}
    try { scene.AddClass("HiddenHero"); } catch (e2) {}
    try { scene.visible = false; } catch (e3) {}
    try {
      scene.style.visibility = "collapse";
      scene.style.opacity = "0";
      scene.style.zIndex = "-1";
    } catch (e4) {}
  }

  function showScene(scene) {
    if (!isValidPanel(scene)) return;
    try { scene.RemoveClass("HiddenHero"); } catch (e1) {}
    try { scene.AddClass("ShowingHero"); } catch (e2) {}
    try { scene.hittest = false; } catch (e3) {}
    try { scene.visible = true; } catch (e4) {}
    try {
      scene.style.visibility = "visible";
      scene.style.opacity = "1";
      scene.style.zIndex = "5";
    } catch (e5) {}
  }

  function resolveHostPanel() {
    if (isValidPanel(UI.host)) return UI.host;
    var host = findChild(getRootPanel(), "ThreeDHeroDynamicHeroHost");
    if (host !== UI.host) {
      UI.host = host;
      sceneCache = null;
      currentScenePanel = null;
    }
    return UI.host;
  }

  function cacheStaticScenes() {
    if (sceneCache) return sceneCache;

    var host = resolveHostPanel();
    sceneCache = {};
    if (!isValidPanel(host)) return sceneCache;

    var children = getChildren(host);

    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var id = "";
      try { id = String(child.id || ""); } catch (e1) { id = ""; }
      if (id.indexOf("ThreeDHeroScene_") !== 0) continue;

      sceneCache[id] = child;

      if (hasClass(child, "ShowingHero")) {
        currentScenePanel = child;
      } else {
        hideScene(child);
      }
    }

    return sceneCache;
  }

  function setHeroAttrs(panel, record) {
    if (!isValidPanel(panel) || !record) return;

    var idText = String(record.id);
    try { panel.SetAttributeString("hero", record.hero); } catch (e1) {}
    try { panel.SetAttributeString("unit", record.hero); } catch (e2) {}
    try { panel.SetAttributeString("hero_id", idText); } catch (e3) {}
    try { panel.SetAttributeString("heroid", idText); } catch (e4) {}
  }

  function resolveHeroProbe() {
    if (!isValidPanel(UI.heroProbe)) {
      UI.heroProbe = findChild(getRootPanel(), "ThreeDHeroHudProbe");
    }

    return UI.heroProbe;
  }

  function switchHeroScene(heroName) {
    var record = HERO_BY_NAME[heroName];
    if (!record) return false;
    if (heroName === lastHero && record.id === lastHeroId && isValidPanel(currentScenePanel)) return true;

    var scene = cacheStaticScenes()[SCENE_BY_HERO[heroName]] || null;
    if (!isValidPanel(scene)) {
      log("no static scene for " + heroName + " map=" + record.map);
      return false;
    }

    setHeroAttrs(resolveHeroProbe(), record);
    setHeroAttrs(scene, record);

    if (scene !== currentScenePanel) {
      hideScene(currentScenePanel);
      showScene(scene);
      currentScenePanel = scene;
    }

    lastHero = heroName;
    lastHeroId = record.id;
    return true;
  }

  function tick() {
    try {
      var now = nowMs();
      if (heroTimerPausedForLobby || !matchStateConfirmedActive || lastLobbyRunCheckMs <= 0 || now - lastLobbyRunCheckMs >= LOBBY_RUN_CHECK_MS) {
        lastLobbyRunCheckMs = now;
        if (evaluateLobbyStatus()) {
          pauseHeroTimerForLobby();
          $.Schedule(LOBBY_POLL_SEC, tick);
          return;
        }

        resumeHeroTimerFromLobby();
      }

      if (lockedHero && lockedHeroSanityCheck(now)) {
        $.Schedule(LOBBY_POLL_SEC, tick);
        return;
      }

      if (lockedHero && lockedGameTimeNextCheckMs > 0 && now < lockedGameTimeNextCheckMs) {
        switchHeroScene(lockedHero);
        $.Schedule(SLOW_POLL_SEC, tick);
        return;
      }

      var gameTimeNow = readGameTimeSec();
      if (lockedHero && lockedGameTimeNextCheckMs > 0 && now >= lockedGameTimeNextCheckMs) {
        if (checkLockedGameTimeReset(now, gameTimeNow)) {
          lastGameTimeWasZero = gameTimeNow === 0;
          detectSampleAndSwitch(now, gameTimeNow);
          $.Schedule(SLOW_POLL_SEC, tick);
          return;
        }
      }

      if (gameTimeNow < 0) {
        lastGameTimeWasZero = false;
        resetHeroLock();
        var unknownHero = detectHero();
        if (unknownHero) {
          switchHeroScene(unknownHero);
        }
      } else if (gameTimeNow === 0) {
        if (!lastGameTimeWasZero) {
          resetHeroLock();
          lastGameTimeWasZero = true;
        }

        if (lockedHero) {
          if (checkLockedGameTimeReset(now, gameTimeNow)) {
            detectSampleAndSwitch(now, gameTimeNow);
          } else {
            switchHeroScene(lockedHero);
          }
        } else {
          detectSampleAndSwitch(now, gameTimeNow);
        }
      } else {
        lastGameTimeWasZero = false;

        if (lockedHero) {
          if (checkLockedGameTimeReset(now, gameTimeNow)) {
            detectSampleAndSwitch(now, gameTimeNow);
          } else {
            switchHeroScene(lockedHero);
          }
        } else {
          detectSampleAndSwitch(now, gameTimeNow);
        }
      }
    } catch (e) {
      log("tick error: " + e);
    }

    $.Schedule(lastHero ? SLOW_POLL_SEC : FAST_POLL_SEC, tick);
  }

  function healthTick() {
    try {
      syncHealthTextState();
    } catch (e) {
      log("health tick error: " + e);
    }

    $.Schedule(HEALTH_TICK_SEC, healthTick);
  }

  buildTables();
  $.Schedule(HEALTH_TICK_SEC, healthTick);
  $.Schedule(FAST_POLL_SEC, tick);
})();
