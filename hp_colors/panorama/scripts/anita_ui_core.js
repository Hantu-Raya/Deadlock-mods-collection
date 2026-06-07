


(function () {
  "use strict";

  const CONFIG = {
    VERSION: "2.2.3",

    IDS: {
      WINDOW: "AnitaUI_Window",
      BACKDROP: "AnitaUI_Backdrop",
      NAVBAR: "AnitaUI_NavBar",
      CONTENT: "AnitaUI_ContentArea",
      OVERLAY_BTN: "AnitaOverlayBtn",
      HUD_ROOT: "Hud"
    },
    CLASSES: {
      ESCAPE_MENU: "ShowEscapeMenu",
      OPEN: "Open",
      VISIBLE: "Visible",
      ATTENTION: "Attention"
    },
    UI: {
      TAB_MAX_CHARS: 17,
      MONITOR_INTERVAL: 0.05
    }
  };
  const HP_PRESET_BUILDER_CATEGORY = "PRESETS|Preset Builder";
  const HP_PRESET_BUILDER_URL = "https://hantu-raya.github.io/hp-colors-preset-builder/";
  const HP_DONATION_URL = "https://ko-fi.com/hantuaraya";
  const HP_HERO_DETECTION_AUTO = "auto";
  const HP_HERO_DETECTION_OVERRIDE = "override";
  const HP_HERO_DETECTION_OFF = "off";
  const HP_STARTUP_PRESET_ID = "HPColorsPreset_001";
  const HP_PRESET_SNAPSHOT_MAGIC = "HP_COLORS_PRESET_SNAPSHOT";
  const HP_PRESET_REQUEST_MAGIC = "HP_COLORS_PRESET_REQUEST";
  const HP_PRESET_SNAPSHOT_REPLAY_HOT_SEC = 1.0;
  const HP_PRESET_SNAPSHOT_REPLAY_WARM_SEC = 3.0;
  const HP_PRESET_SNAPSHOT_REPLAY_IDLE_SEC = 8.0;
  const HP_PRESET_SNAPSHOT_REPLAY_HOT_COUNT = 4;
  const HP_PRESET_SNAPSHOT_REPLAY_WARM_COUNT = 12;
  const HP_PRESET_SNAPSHOT_REQUEST_HOT_MS = 5000;
  const HP_MATCH_RESET_SHARED_KEY = "__hpColorsMatchReset";
  const HP_OPTIMIZED_FORCED_VALUES = {};
  const HP_OPTIMIZED_HIDDEN_SETTINGS = {};
  const HP_BAKED_PRESET_APPLY_DELAYS = [0.5, 1.5, 3.0, 5.0, 8.0, 12.0];
  const HP_HERO_WATCH_RETRY_SEC = 2.0;
  const HP_HERO_WATCH_EMPTY_GRACE_TICKS = 3;
  const HP_HERO_LOOKUP_WINDOW_MS = 10000;
  const HP_HERO_LOBBY_POLL_SEC = 5.0;
  const HP_HERO_DETECTION_LOCK_GAME_TIME_SEC = 10;
  const HP_MATCH_MONITOR_FAST_SEC = 1.0;
  const HP_MATCH_MONITOR_SLOW_SEC = 5.0;
  const HP_MATCH_MONITOR_RESTART_PREV_SEC = 30;
  const HP_MATCH_MONITOR_RESTART_NOW_SEC = 12;
  const HP_HERO_GAME_TIME_CACHE_MS = 250;
  const HP_HERO_MATCH_ACTIVE_GAME_STATE = 6;
  var _lastHpSharedRaw = "";
  var _hpPresetSnapshotPayload = "";
  var _hpPresetSnapshotReplayStarted = false;
  var _hpPresetSnapshotReplayCount = 0;
  var _hpPresetSnapshotReplayHotUntil = 0;
  var _didApplyHpColorsBakedPresetOnce = false;
  var _hpBakedPresetApplyToken = 0;
  var _hpHeroRoot = null;
  var _hpHeroGameplayAlive = null;
  var _hpHeroCrosshair = null;
  var _hpHeroProgress = null;
  var _hpHeroGameTimePanel = null;
  var _hpHeroGameTimePanelMs = 0;
  var _hpHeroMatchStateConfirmedActive = false;
  var _hpHeroPausedForLobby = false;
  var _hpMatchResetToken = 0;
  var _hpMatchResetLastReason = "";
  var _hpMatchMonitorStarted = false;
  var _hpMatchMonitorWasActive = false;
  var _hpMatchMonitorSawZero = false;
  var _hpMatchMonitorLastGameTime = -1;
  var _hpPresetStoreRoot = null;
  var _hpPresetStorePanel = null;
  var _hpPresetStoreEntries = null;
  const HP_COMPACT_PERSIST_VERSION = 1;
  const HP_HERO_SCOPE_OFF = "off";
  const HP_HERO_SCOPE_ALL = "all";
  const HP_HERO_SCOPE_SELECTED = "selected";
  const HP_HERO_DATA = [
    { id: "hero_inferno", heroId: 1, name: "Infernus", aliases: ["infernus", "hero_infernus"] },
    { id: "hero_gigawatt", heroId: 2, name: "Seven", aliases: ["seven", "hero_seven"] },
    { id: "hero_hornet", heroId: 3, name: "Vindicta", aliases: ["vindicta", "hero_vindicta"] },
    { id: "hero_ghost", heroId: 4, name: "Lady Geist", aliases: ["geist", "lady_geist", "ladygeist", "hero_lady_geist"] },
    { id: "hero_atlas", heroId: 6, name: "Abrams", aliases: ["abrams", "bull", "hero_abrams"] },
    { id: "hero_wraith", heroId: 7, name: "Wraith", aliases: [] },
    { id: "hero_forge", heroId: 8, name: "McGinnis", aliases: ["mcginnis", "mc_ginnis", "engineer", "hero_mcginnis"] },
    { id: "hero_chrono", heroId: 10, name: "Paradox", aliases: ["paradox", "hero_paradox"] },
    { id: "hero_dynamo", heroId: 11, name: "Dynamo", aliases: ["sumo"] },
    { id: "hero_kelvin", heroId: 12, name: "Kelvin", aliases: [] },
    { id: "hero_haze", heroId: 13, name: "Haze", aliases: [] },
    { id: "hero_astro", heroId: 14, name: "Ivy", aliases: ["ivy", "hero_ivy"] },
    { id: "hero_bebop", heroId: 15, name: "Bebop", aliases: [] },
    { id: "hero_nano", heroId: 16, name: "Nano", aliases: [] },
    { id: "hero_orion", heroId: 17, name: "Grey Talon", aliases: ["archer", "grey_talon", "gray_talon", "greytalon", "hero_grey_talon"] },
    { id: "hero_krill", heroId: 18, name: "Mo & Krill", aliases: ["digger", "mo_and_krill", "mo_krill", "hero_mo_and_krill"] },
    { id: "hero_shiv", heroId: 19, name: "Shiv", aliases: [] },
    { id: "hero_tengu", heroId: 20, name: "Tengu", aliases: [] },
    { id: "hero_warden", heroId: 25, name: "Warden", aliases: [] },
    { id: "hero_yamato", heroId: 27, name: "Yamato", aliases: [] },
    { id: "hero_lash", heroId: 31, name: "Lash", aliases: [] },
    { id: "hero_viscous", heroId: 35, name: "Viscous", aliases: [] },
    { id: "hero_synth", heroId: 50, name: "Pocket", aliases: ["pocket", "hero_pocket"] },
    { id: "hero_mirage", heroId: 52, name: "Mirage", aliases: [] },
    { id: "hero_viper", heroId: 58, name: "Vyper", aliases: ["viper", "vyper", "hero_vyper"] },
    { id: "hero_magician", heroId: 60, name: "Magician", aliases: ["sinclair", "hero_sinclair"] },
    { id: "hero_vampirebat", heroId: 63, name: "Mina", aliases: ["vampire_bat", "vampirebat", "mina", "hero_mina"] },
    { id: "hero_drifter", heroId: 64, name: "Drifter", aliases: [] },
    { id: "hero_priest", heroId: 65, name: "Priest", aliases: [] },
    { id: "hero_frank", heroId: 66, name: "Frank", aliases: [] },
    { id: "hero_bookworm", heroId: 67, name: "Bookworm", aliases: ["paige", "hero_paige"] },
    { id: "hero_doorman", heroId: 69, name: "Doorman", aliases: [] },
    { id: "hero_punkgoat", heroId: 72, name: "Billy", aliases: ["punkgoat", "punk_goat", "billy", "hero_billy"] },
    { id: "hero_necro", heroId: 76, name: "Necro", aliases: [] },
    { id: "hero_fencer", heroId: 77, name: "Apollo", aliases: ["fencer", "apollo", "hero_apollo"] },
    { id: "hero_familiar", heroId: 79, name: "Familiar", aliases: [] },
    { id: "hero_werewolf", heroId: 80, name: "Werewolf", aliases: [] },
    { id: "hero_unicorn", heroId: 81, name: "Unicorn", aliases: [] }
  ];
  const HP_HERO_BY_ID = {};
  const HP_HERO_ALIAS_TO_ID = {};
  const HP_HERO_ALIAS_LIST = [];
  const HP_PERSIST_ALIASES = {
    hp_enabled: "e",
    hp_mode: "m",
    hp_low_threshold: "l",
    hp_high_threshold: "h",
    hp_bg_visible: "b",
    hp_team_colors: "t",
    hp_info_health_margin_top: "ihmt",
    hp_healthbar_height: "hbh",
    hp_color_low: "cl",
    hp_color_mid: "cm",
    hp_color_high: "ch",
    hp_counter_visible: "cv",
    hp_counter_size: "s",
    hp_counter_position: "p",
    hp_text_color_mode: "tm",
    hp_level_number_visible: "lnv",
    hp_pip_visible: "plv",
    hp_ult_color_enabled: "uce",
    hp_ult_color_custom: "ucc",
    hp_text_color_low: "tl",
    hp_text_color_mid: "ti",
    hp_text_color_high: "th",
    hp_pulse_bpm: "bp",
    hp_pulse_intensity: "pi",
    hp_pulse_enabled: "pe",
    hp_pulse_text_enabled: "pte",
    hp_pulse_text_scale: "pts",
    hp_pulse_text_position: "ptp",
    hp_pulse_hide_bar: "phb",
    hp_pulse_color_enabled: "pce",
    hp_pulse_color: "pc",
    hp_pulse_color_mode: "pcm",
    hp_skip_buildings: "sb",
    hp_pulse_threshold: "pt",
    hp_friend_enabled: "fe",
    hp_friend_pulse_enabled: "fpe",
    hp_friend_pulse_bpm: "fpb",
    hp_friend_pulse_intensity: "fpi",
    hp_friend_pulse_threshold: "fpt",
    hp_friend_color_low: "fcl",
    hp_friend_color_mid: "fcm",
    hp_friend_color_high: "fch",
    hp_friend_pulse_color_enabled: "fpce",
    hp_friend_pulse_color: "fpc",
    hp_kill_zone_enabled: "kze",
    hp_kill_zone_threshold: "kzt",
    hp_kill_zone_color: "kzc",
    hp_kill_zone_width: "kzw",
    hp_counter_format: "cf"
  };
  const HP_PERSIST_ALIAS_TO_ID = (function () {
    var out = {};
    for (var id in HP_PERSIST_ALIASES) {
      if (Object.prototype.hasOwnProperty.call(HP_PERSIST_ALIASES, id)) {
        out[HP_PERSIST_ALIASES[id]] = id;
      }
    }
    out.kzs = "hp_kill_zone_color";
    return out;
  })();
  const HP_PRESET_BUILDER_SUPPORTED_IDS = {
    hp_enabled: true,
    hp_bg_visible: true,
    hp_mode: true,
    hp_low_threshold: true,
    hp_high_threshold: true,
    hp_team_colors: true,
    hp_skip_buildings: true,
    hp_info_health_margin_top: true,
    hp_healthbar_height: true,
    hp_ult_color_enabled: true,
    hp_ult_color_custom: true,
    hp_color_low: true,
    hp_color_mid: true,
    hp_color_high: true,
    hp_pulse_enabled: true,
    hp_pulse_threshold: true,
    hp_pulse_bpm: true,
    hp_pulse_intensity: true,
    hp_pulse_hide_bar: true,
    hp_pulse_color_enabled: true,
    hp_pulse_color_mode: true,
    hp_pulse_color: true,
    hp_pulse_text_enabled: true,
    hp_pulse_text_scale: true,
    hp_pulse_text_position: true,
    hp_counter_size: true,
    hp_counter_position: true,
    hp_counter_format: true,
    hp_text_color_mode: true,
    hp_level_number_visible: true,
    hp_pip_visible: true,
    hp_text_color_low: true,
    hp_text_color_mid: true,
    hp_text_color_high: true,
    hp_friend_enabled: true,
    hp_friend_color_low: true,
    hp_friend_color_mid: true,
    hp_friend_color_high: true,
    hp_friend_pulse_enabled: true,
    hp_friend_pulse_threshold: true,
    hp_friend_pulse_bpm: true,
    hp_friend_pulse_intensity: true,
    hp_friend_pulse_color_enabled: true,
    hp_friend_pulse_color: true,
    hp_kill_zone_enabled: true,
    hp_kill_zone_threshold: true,
    hp_kill_zone_color: true,
    hp_kill_zone_width: true
  };

  function normalizeHpHeroToken(value) {
    var text = String(value || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!text) return "";
    if (Object.prototype.hasOwnProperty.call(HP_HERO_ALIAS_TO_ID, text)) return HP_HERO_ALIAS_TO_ID[text];
    if (text.indexOf("hero_") !== 0 &&
        Object.prototype.hasOwnProperty.call(HP_HERO_ALIAS_TO_ID, "hero_" + text)) {
      return HP_HERO_ALIAS_TO_ID["hero_" + text];
    }
    return "";
  }

  function registerHpHeroAlias(alias, heroId) {
    var clean = String(alias || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!clean || Object.prototype.hasOwnProperty.call(HP_HERO_ALIAS_TO_ID, clean)) return;
    HP_HERO_ALIAS_TO_ID[clean] = heroId;
    HP_HERO_ALIAS_LIST.push({ alias: clean, hero: heroId, token: clean.replace(/^hero_/, "") });
  }

  function buildHpHeroTables() {
    for (var i = 0; i < HP_HERO_DATA.length; i++) {
      var hero = HP_HERO_DATA[i];
      HP_HERO_BY_ID[hero.id] = hero;
      registerHpHeroAlias(hero.id, hero.id);
      registerHpHeroAlias(hero.id.replace(/^hero_/, ""), hero.id);
      registerHpHeroAlias(hero.name, hero.id);
      for (var j = 0; j < hero.aliases.length; j++) {
        registerHpHeroAlias(hero.aliases[j], hero.id);
      }
    }
    HP_HERO_ALIAS_LIST.sort(function (a, b) {
      return b.token.length - a.token.length;
    });
  }

  function normalizeHpHeroSelection(value) {
    var source = Array.isArray(value) ? value : (value ? [value] : []);
    var out = [];
    var seen = {};
    for (var i = 0; i < source.length; i++) {
      var heroId = normalizeHpHeroToken(source[i]);
      if (!heroId || seen[heroId]) continue;
      seen[heroId] = true;
      out.push(heroId);
    }
    return out;
  }

  function normalizeHpHeroScopeMode(mode, heroes) {
    var text = String(mode || "").toLowerCase();
    if (text === HP_HERO_SCOPE_OFF) return HP_HERO_SCOPE_OFF;
    if (text === HP_HERO_SCOPE_ALL || text === "global") return HP_HERO_SCOPE_ALL;
    if (text === HP_HERO_SCOPE_SELECTED || text === "heroes" || text === "hero") {
      return normalizeHpHeroSelection(heroes).length ? HP_HERO_SCOPE_SELECTED : HP_HERO_SCOPE_OFF;
    }
    return normalizeHpHeroSelection(heroes).length ? HP_HERO_SCOPE_SELECTED : HP_HERO_SCOPE_OFF;
  }

  function hpHeroScopeIsSelected(mode, heroes) {
    return normalizeHpHeroScopeMode(mode, heroes) === HP_HERO_SCOPE_SELECTED;
  }

  function hpHeroDisplayName(heroId) {
    var hero = HP_HERO_BY_ID[heroId];
    if (hero && hero.name) return hero.name;
    var text = String(heroId || "").replace(/^hero_/, "").replace(/_/g, " ");
    return text.replace(/\b[a-z]/g, function (ch) { return ch.toUpperCase(); });
  }

  function hpHeroIconPath(heroId) {
    var alias = String(heroId || "").replace(/^hero_/, "");
    var iconAliases = {
      atlas: "bull",
      dynamo: "sumo",
      forge: "engineer",
      ghost: "spectre",
      krill: "digger",
      orion: "archer",
      viper: "kali"
    };
    if (Object.prototype.hasOwnProperty.call(iconAliases, alias)) alias = iconAliases[alias];
    return alias ? ("s2r://panorama/images/heroes/" + alias + "_mm_psd.vtex") : "";
  }

  function hpHeroHasClass(panel, className) {
    try { return !!(panel && panel.BHasClass && panel.BHasClass(className)); } catch (e) {}
    return false;
  }

  function hpHeroPanelId(panel) {
    try { return panel && panel.id ? String(panel.id) : ""; } catch (e) {}
    return "";
  }

  function hpHeroChildren(panel) {
    try { return panel && panel.Children ? panel.Children() : []; } catch (e) {}
    return [];
  }

  function hpHeroIsValidPanel(panel) {
    try { return !!(panel && panel.IsValid && panel.IsValid()); } catch (e) {}
    return false;
  }

  function hpHeroFindChild(panel, id) {
    try { return panel && panel.FindChildTraverse ? panel.FindChildTraverse(id) : null; } catch (e) {}
    return null;
  }

  function hpHeroFindChildrenWithClass(panel, className) {
    try { return panel && panel.FindChildrenWithClassTraverse ? (panel.FindChildrenWithClassTraverse(className) || []) : []; } catch (e) {}
    return [];
  }

  function hpHeroFindDirectChildWhere(panel, id, predicate) {
    var children = hpHeroChildren(panel);
    var fallback = null;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (hpHeroPanelId(child) !== id) continue;
      if (!fallback) fallback = child;
      if (!predicate || predicate(child)) return child;
    }
    return fallback;
  }

  function hpHeroClassOn(panel) {
    if (!hpHeroIsValidPanel(panel)) return "";
    for (var i = 0; i < HP_HERO_ALIAS_LIST.length; i++) {
      if (hpHeroHasClass(panel, HP_HERO_ALIAS_LIST[i].alias)) return HP_HERO_ALIAS_LIST[i].hero;
    }
    return "";
  }

  function hpHeroHasDirectProgress(panel) {
    var progress = hpHeroFindDirectChildWhere(panel, "progress", hpHeroClassOn);
    return !!hpHeroClassOn(progress);
  }

  function clearHpHeroDetectionRefs() {
    _hpHeroGameplayAlive = null;
    _hpHeroCrosshair = null;
    _hpHeroProgress = null;
  }

  function clearHpHeroGameTimeCache() {
    _hpHeroGameTimePanel = null;
    _hpHeroGameTimePanelMs = 0;
  }

  function hpHeroHasHideoutClass(panel) {
    return hpHeroHasClass(panel, "connectedToHideout") ||
      hpHeroHasClass(panel, "connectedtoHideout") ||
      hpHeroHasClass(panel, "connectedtohideout") ||
      hpHeroHasClass(panel, "connectedToHideOut") ||
      hpHeroHasClass(panel, "inHideoutIntro");
  }

  function readHpHeroGameState() {
    var state = -1;
    try {
      if (typeof Game !== "undefined" && Game && Game.GetState) {
        state = Number(Game.GetState());
      }
    } catch (e0) {
      state = -1;
    }
    return isFinite(state) ? state : -1;
  }

  function parseHpHeroGameTimeText(text) {
    var raw = String(text || "").replace(/^\s+|\s+$/g, "");
    if (!raw) return -1;
    var parts = raw.match(/\d+/g);
    if (!parts || !parts.length) return -1;
    if (parts.length === 1) return Number(parts[0]) || 0;
    var mm = Number(parts[parts.length - 2]) || 0;
    var ss = Number(parts[parts.length - 1]) || 0;
    if (ss > 59) ss = ss % 60;
    return (mm * 60) + ss;
  }

  function resolveHpHeroGameTimePanel() {
    if (hpHeroIsValidPanel(_hpHeroGameTimePanel)) return _hpHeroGameTimePanel;
    var root = getRootPanelForPresetStore();
    var topBar = hpHeroFindChild(root, "TopBar");
    var matches = hpHeroFindChildrenWithClass(topBar, "GameTime");
    if (!matches.length) matches = hpHeroFindChildrenWithClass(root, "GameTime");
    _hpHeroGameTimePanel = matches && matches[0] ? matches[0] : null;
    return _hpHeroGameTimePanel;
  }

  function readHpHeroGameTimeSec() {
    var now = Date.now ? Date.now() : +(new Date());
    if (!hpHeroIsValidPanel(_hpHeroGameTimePanel) || (now - _hpHeroGameTimePanelMs) > HP_HERO_GAME_TIME_CACHE_MS) {
      _hpHeroGameTimePanel = resolveHpHeroGameTimePanel();
      _hpHeroGameTimePanelMs = now;
    }
    if (!hpHeroIsValidPanel(_hpHeroGameTimePanel)) return -1;
    var text = "";
    try { text = _hpHeroGameTimePanel.text || _hpHeroGameTimePanel.GetAttributeString("text", "") || ""; } catch (e0) { text = ""; }
    return parseHpHeroGameTimeText(text);
  }

  function publishHpMatchReset(reason, gameState, gameTime) {
    var nextReason = String(reason || "unknown");
    if (_hpMatchResetLastReason === nextReason &&
        nextReason !== "game_time_zero" &&
        nextReason !== "game_time_rollback") return;
    _hpMatchResetLastReason = nextReason;
    _hpMatchResetToken += 1;
    var now = Date.now ? Date.now() : +(new Date());
    var payload = {
      token: String(_hpMatchResetToken) + "_" + String(now),
      reason: nextReason,
      gameState: Number(gameState),
      gameTime: Number(gameTime),
      at: now
    };
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig) {
        GameUI.CustomUIConfig()[HP_MATCH_RESET_SHARED_KEY] = payload;
      }
    } catch (eStore) {}
  }

  function isHpMatchActiveState(gameState, gameTime) {
    if (gameState >= HP_HERO_MATCH_ACTIVE_GAME_STATE) return true;
    if (gameState >= 0) return false;
    if (gameTime < 0) return false;
    var root = getRootPanelForPresetStore();
    var hud = hpHeroFindChild(root, "Hud");
    return !(hpHeroHasHideoutClass(hud) || hpHeroHasHideoutClass(root));
  }

  function getHpMatchMonitorDelay(gameTime, active) {
    if (!active) return HP_MATCH_MONITOR_SLOW_SEC;
    if (gameTime >= 0 && gameTime <= HP_HERO_DETECTION_LOCK_GAME_TIME_SEC) return HP_MATCH_MONITOR_FAST_SEC;
    return HP_MATCH_MONITOR_SLOW_SEC;
  }

  function resetHpMatchScopedRuntimeState(config) {
    resetHpHeroPresetDetectionLock(config);
    invalidateHpHeroPresetApplyCache(config);
    clearHpHeroDetectionRefs();
    if (config && (config.__hpHeroPresetHasScopedPreset || hasHpSelectedScopedPreset(config))) {
      config.__hpHeroPresetWatchStarted = false;
      startHpHeroPresetWatch(config);
      scheduleHpHeroPresetRefresh(config);
    }
  }

  function hpMatchTimeRolledBack(gameTime) {
    return _hpMatchMonitorLastGameTime >= HP_MATCH_MONITOR_RESTART_PREV_SEC &&
      gameTime >= 0 &&
      gameTime <= HP_MATCH_MONITOR_RESTART_NOW_SEC &&
      gameTime < _hpMatchMonitorLastGameTime;
  }

  function rememberHpMatchGameTime(gameTime, active) {
    if (!active) {
      _hpMatchMonitorLastGameTime = -1;
      return;
    }
    if (gameTime >= 0) _hpMatchMonitorLastGameTime = gameTime;
  }

  function startHpMatchResetMonitor(config) {
    if (!config || config.title !== "HP Colors" || _hpMatchMonitorStarted) return;
    _hpMatchMonitorStarted = true;

    function tick() {
      if (!config || !AnitaCore.findRegisteredMod || AnitaCore.findRegisteredMod("HP Colors") !== config) {
        _hpMatchMonitorStarted = false;
        return;
      }

      var gameState = readHpHeroGameState();
      clearHpHeroGameTimeCache();
      var gameTime = readHpHeroGameTimeSec();
      var active = isHpMatchActiveState(gameState, gameTime);
      var rolledBack = active && hpMatchTimeRolledBack(gameTime);

      if (active && !_hpMatchMonitorWasActive) {
        publishHpMatchReset(gameState >= HP_HERO_MATCH_ACTIVE_GAME_STATE ? "game_state_active" : "game_time_available", gameState, gameTime);
        resetHpMatchScopedRuntimeState(config);
        _hpMatchMonitorWasActive = true;
        _hpMatchMonitorSawZero = gameTime === 0;
      } else if (rolledBack) {
        publishHpMatchReset("game_time_rollback", gameState, gameTime);
        resetHpMatchScopedRuntimeState(config);
        _hpMatchMonitorSawZero = gameTime === 0;
      } else if (active && gameTime === 0 && !_hpMatchMonitorSawZero) {
        publishHpMatchReset("game_time_zero", gameState, gameTime);
        resetHpMatchScopedRuntimeState(config);
        _hpMatchMonitorSawZero = true;
      } else if (!active && _hpMatchMonitorWasActive) {
        _hpMatchMonitorWasActive = false;
        _hpMatchMonitorSawZero = false;
        _hpMatchMonitorLastGameTime = -1;
        _hpMatchResetLastReason = "lobby";
      }

      rememberHpMatchGameTime(gameTime, active);
      $.Schedule(getHpMatchMonitorDelay(gameTime, active), tick);
    }

    $.Schedule(0.25, tick);
  }

  function hpHeroEvaluateLobbyStatus() {
    var gameState = readHpHeroGameState();
    if (gameState >= HP_HERO_MATCH_ACTIVE_GAME_STATE) {
      if (!_hpHeroMatchStateConfirmedActive) publishHpMatchReset("game_state_active", gameState, readHpHeroGameTimeSec());
      _hpHeroMatchStateConfirmedActive = true;
      return false;
    }
    if (gameState >= 0) {
      if (_hpHeroMatchStateConfirmedActive) _hpMatchResetLastReason = "lobby";
      _hpHeroMatchStateConfirmedActive = false;
      return true;
    }

    var root = getRootPanelForPresetStore();
    var hud = hpHeroFindChild(root, "Hud");
    if (hpHeroHasHideoutClass(hud) || hpHeroHasHideoutClass(root)) {
      if (_hpHeroMatchStateConfirmedActive) _hpMatchResetLastReason = "lobby";
      _hpHeroMatchStateConfirmedActive = false;
      return true;
    }

    if (!_hpHeroMatchStateConfirmedActive) {
      var fallbackGameTime = readHpHeroGameTimeSec();
      if (fallbackGameTime >= 0) {
        publishHpMatchReset("game_time_available", gameState, fallbackGameTime);
        _hpHeroMatchStateConfirmedActive = true;
        return false;
      }
      return true;
    }

    return false;
  }

  function pauseHpHeroPresetWatchForLobby(config) {
    if (_hpHeroPausedForLobby) return;
    _hpHeroPausedForLobby = true;
    clearHpHeroDetectionRefs();
    clearHpHeroGameTimeCache();
    if (config) {
      config.__hpHeroGameTimeWasZero = false;
      config.__hpHeroLookupWindowUntil = 0;
      resetHpHeroPresetDetectionLock(config);
    }
  }

  function resumeHpHeroPresetWatchFromLobby(config) {
    if (!_hpHeroPausedForLobby) return;
    _hpHeroPausedForLobby = false;
    clearHpHeroDetectionRefs();
    clearHpHeroGameTimeCache();
    if (config) {
      config.__hpHeroGameTimeWasZero = false;
      config.__hpHeroLookupWindowUntil = 0;
      resetHpHeroPresetDetectionLock(config);
    }
  }

  function getHpHeroPresetLookupState(config) {
    var now = Date.now ? Date.now() : +(new Date());
    if (hpHeroEvaluateLobbyStatus()) {
      pauseHpHeroPresetWatchForLobby(config);
      return { run: false, delay: HP_HERO_LOBBY_POLL_SEC };
    }
    resumeHpHeroPresetWatchFromLobby(config);

    var gameTime = readHpHeroGameTimeSec();
    if (gameTime === 0) {
      if (!config.__hpHeroGameTimeWasZero) {
        config.__hpHeroGameTimeWasZero = true;
        config.__hpHeroLookupWindowUntil = now + HP_HERO_LOOKUP_WINDOW_MS;
        publishHpMatchReset("game_time_zero", readHpHeroGameState(), gameTime);
        resetHpHeroPresetDetectionLock(config);
        invalidateHpHeroPresetApplyCache(config);
        clearHpHeroDetectionRefs();
      }
      return { run: now <= (config.__hpHeroLookupWindowUntil || 0), delay: HP_HERO_WATCH_RETRY_SEC };
    }

    if (gameTime > 0) {
      config.__hpHeroGameTimeWasZero = false;
      if (config.__hpHeroPresetDetectionLocked) {
        return { run: false, delay: HP_HERO_LOBBY_POLL_SEC };
      }
      if (config.__hpHeroLookupWindowUntil && now <= config.__hpHeroLookupWindowUntil) {
        return { run: true, delay: HP_HERO_WATCH_RETRY_SEC };
      }
      if (config.__hpHeroPresetHasScopedPreset || hasHpSelectedScopedPreset(config)) {
        return { run: true, delay: HP_HERO_WATCH_RETRY_SEC };
      }
      return {
        run: !config.__hpLastDetectedHeroPresetHero,
        delay: config.__hpLastDetectedHeroPresetHero ? HP_HERO_LOBBY_POLL_SEC : HP_HERO_WATCH_RETRY_SEC
      };
    }

    return { run: true, delay: HP_HERO_WATCH_RETRY_SEC };
  }

  function clearHpPresetStoreRefs() {
    _hpPresetStorePanel = null;
    _hpPresetStoreEntries = null;
  }

  function resolveHpHeroProgressPanel() {
    var root = getRootPanelForPresetStore();
    if (root !== _hpHeroRoot) {
      _hpHeroRoot = root;
      clearHpHeroDetectionRefs();
    }
    if (!hpHeroIsValidPanel(root)) return null;

    if (!hpHeroIsValidPanel(_hpHeroGameplayAlive)) {
      _hpHeroGameplayAlive = hpHeroFindChild(root, "gameplay_hud_alive");
      _hpHeroCrosshair = null;
      _hpHeroProgress = null;
    }
    if (!hpHeroIsValidPanel(_hpHeroGameplayAlive)) return null;

    var crosshair = hpHeroFindDirectChildWhere(_hpHeroGameplayAlive, "crosshair", hpHeroHasDirectProgress);
    if (crosshair !== _hpHeroCrosshair) {
      _hpHeroCrosshair = crosshair;
      _hpHeroProgress = null;
    }
    if (!hpHeroIsValidPanel(_hpHeroCrosshair)) return null;

    var progress = hpHeroFindDirectChildWhere(_hpHeroCrosshair, "progress", hpHeroClassOn);
    if (progress !== _hpHeroProgress) _hpHeroProgress = progress;
    if (!hpHeroIsValidPanel(_hpHeroProgress)) return null;
    return _hpHeroProgress;
  }

  function detectHpLocalHero() {
    return hpHeroClassOn(resolveHpHeroProgressPanel());
  }

  function presetTargetsHero(preset, heroId) {
    if (!preset || !heroId || !Array.isArray(preset.heroes) || !hpHeroScopeIsSelected(preset.heroMode, preset.heroes)) return false;
    for (var i = 0; i < preset.heroes.length; i++) {
      if (preset.heroes[i] === heroId) return true;
    }
    return false;
  }

  function presetIsGlobal(preset) {
    return normalizeHpHeroScopeMode(preset && preset.heroMode, preset && preset.heroes) === HP_HERO_SCOPE_ALL;
  }

  function presetIsDisabled(preset) {
    return normalizeHpHeroScopeMode(preset && preset.heroMode, preset && preset.heroes) === HP_HERO_SCOPE_OFF;
  }

  function normalizeHpHeroDetectionMode(config) {
    if (!config) return HP_HERO_DETECTION_AUTO;
    var mode = String(config.__hpHeroDetectionMode || "");
    if (mode === HP_HERO_DETECTION_AUTO ||
        mode === HP_HERO_DETECTION_OVERRIDE ||
        mode === HP_HERO_DETECTION_OFF) return mode;
    if (config.__hpHeroManualPresetOverride) return HP_HERO_DETECTION_OVERRIDE;
    return HP_HERO_DETECTION_AUTO;
  }

  function hpHeroAutoDetectionEnabled(config) {
    return normalizeHpHeroDetectionMode(config) === HP_HERO_DETECTION_AUTO;
  }

  function hpHeroManualOverrideEnabled(config) {
    return normalizeHpHeroDetectionMode(config) === HP_HERO_DETECTION_OVERRIDE;
  }

  function hpHeroManualPresetAllowed(config) {
    return normalizeHpHeroDetectionMode(config) !== HP_HERO_DETECTION_AUTO;
  }

  function getHpHeroDetectionModeLabel(config) {
    var mode = normalizeHpHeroDetectionMode(config);
    if (mode === HP_HERO_DETECTION_OVERRIDE) return "OVERRIDE ON";
    if (mode === HP_HERO_DETECTION_OFF) return "HERO OFF";
    return "AUTO HERO";
  }

  function getNextHpHeroDetectionMode(config) {
    var mode = normalizeHpHeroDetectionMode(config);
    if (mode === HP_HERO_DETECTION_AUTO) return HP_HERO_DETECTION_OVERRIDE;
    if (mode === HP_HERO_DETECTION_OVERRIDE) return HP_HERO_DETECTION_OFF;
    return HP_HERO_DETECTION_AUTO;
  }

  function setHpHeroDetectionMode(config, mode) {
    if (!config) return;
    var nextMode = String(mode || HP_HERO_DETECTION_AUTO);
    if (nextMode !== HP_HERO_DETECTION_OVERRIDE && nextMode !== HP_HERO_DETECTION_OFF) {
      nextMode = HP_HERO_DETECTION_AUTO;
    }
    config.__hpHeroDetectionMode = nextMode;
    config.__hpHeroManualPresetOverride = nextMode === HP_HERO_DETECTION_OVERRIDE;
    if (nextMode === HP_HERO_DETECTION_AUTO) {
      openHpHeroPresetDetectionWindow(config);
      invalidateHpHeroPresetApplyCache(config);
      config.__hpHeroPresetHasScopedPreset = true;
      startHpHeroPresetWatch(config);
      scheduleHpHeroPresetRefresh(config);
    } else {
      resetHpHeroPresetDetectionLock(config);
      invalidateHpHeroPresetApplyCache(config);
      config.__hpHeroPresetWatchStarted = false;
      clearHpHeroDetectionRefs();
    }
  }

  function presetCompatibleWithHero(preset, heroId) {
    return presetIsGlobal(preset) || presetTargetsHero(preset, heroId);
  }

  buildHpHeroTables();

  // Base64url encode/decode — no btoa/atob in Deadlock Panorama
  var AnitaBase64 = (function () {
    var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    function encode(str) {
      var bytes = [];
      for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 128) {
          bytes.push(code);
        } else if (code < 2048) {
          bytes.push(0xC0 | (code >> 6));
          bytes.push(0x80 | (code & 0x3F));
        } else {
          bytes.push(0xE0 | (code >> 12));
          bytes.push(0x80 | ((code >> 6) & 0x3F));
          bytes.push(0x80 | (code & 0x3F));
        }
      }
      var out = "";
      for (var j = 0; j < bytes.length; j += 3) {
        var b0 = bytes[j], b1 = bytes[j + 1] || 0, b2 = bytes[j + 2] || 0;
        out += CHARS[b0 >> 2];
        out += CHARS[((b0 & 3) << 4) | (b1 >> 4)];
        out += (j + 1 < bytes.length) ? CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "";
        out += (j + 2 < bytes.length) ? CHARS[b2 & 63] : "";
      }
      return out;
    }

    function decode(str) {
      var lookup = {};
      for (var i = 0; i < CHARS.length; i++) lookup[CHARS[i]] = i;
      function getVal(ch) {
        if (ch === undefined) return 0;
        if (!Object.prototype.hasOwnProperty.call(lookup, ch)) {
          throw new Error("Invalid base64url char: " + ch);
        }
        return lookup[ch];
      }
      var decodedBytes = [];
      for (var j = 0; j < str.length; j += 4) {
        var c0 = getVal(str[j]);
        var c1 = getVal(str[j + 1]);
        var c2 = str[j + 2] !== undefined ? getVal(str[j + 2]) : 0;
        var c3 = str[j + 3] !== undefined ? getVal(str[j + 3]) : 0;
        decodedBytes.push((c0 << 2) | (c1 >> 4));
        if (str[j + 2] !== undefined) decodedBytes.push(((c1 & 15) << 4) | (c2 >> 2));
        if (str[j + 3] !== undefined) decodedBytes.push(((c2 & 3) << 6) | c3);
      }
      var out = "";
      for (var k = 0; k < decodedBytes.length; k++) {
        var b = decodedBytes[k];
        if (b < 128) {
          out += String.fromCharCode(b);
        } else if (b < 224) {
          out += String.fromCharCode(((b & 31) << 6) | (decodedBytes[++k] & 63));
        } else {
          var cont2 = decodedBytes[++k], cont3 = decodedBytes[++k];
          out += String.fromCharCode(((b & 15) << 12) | ((cont2 & 63) << 6) | (cont3 & 63));
        }
      }
      return out;
    }

    return { encode: encode, decode: decode };
  })();

  function rememberLastEmittedValue(modTitle, settingId, newValue) {
    try {
      if (!modTitle || !settingId) return;
      if (typeof AnitaCore === "undefined" || !AnitaCore || typeof AnitaCore.findRegisteredMod !== "function") return;
      var config = AnitaCore.findRegisteredMod(modTitle);
      if (!config) return;
      if (!config.__anitaLastEmittedValues) config.__anitaLastEmittedValues = {};
      config.__anitaLastEmittedValues[settingId] = newValue;
    } catch (e) {}
  }

  function emitUpdate(modTitle, settingId, newValue, meta) {
    var payload = {
      magic_word: "ANITA_UPDATE",
      mod_title: modTitle,
      setting_id: settingId,
      value: newValue
    };
    if (meta && typeof meta === "object") {
      for (var key in meta) {
        if (Object.prototype.hasOwnProperty.call(meta, key)) {
          payload[key] = meta[key];
        }
      }
    }
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(payload));
    rememberLastEmittedValue(modTitle, settingId, newValue);
  }

  function emitBulkUpdate(modTitle, values, meta) {
    var payload = {
      magic_word: "ANITA_BULK_UPDATE",
      mod_title: modTitle,
      values: values || {}
    };
    if (meta && typeof meta === "object") {
      for (var key in meta) {
        if (Object.prototype.hasOwnProperty.call(meta, key)) {
          payload[key] = meta[key];
        }
      }
    }
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(payload));
    for (var settingId in values || {}) {
      if (Object.prototype.hasOwnProperty.call(values, settingId)) {
        rememberLastEmittedValue(modTitle, settingId, values[settingId]);
      }
    }
  }

  var throttledEmitState = {};
  function emitUpdateThrottled(modTitle, settingId, newValue, meta, delaySec) {
    if (!modTitle || !settingId) return;
    var key = modTitle + "::" + settingId;
    var state = throttledEmitState[key];
    if (!state) state = throttledEmitState[key] = { pending: false, value: null, meta: null, token: 0 };
    state.value = newValue;
    state.meta = meta || null;
    var token = state.token;
    if (state.pending) return;
    state.pending = true;
    $.Schedule(delaySec || 0.04, function () {
      if (token !== state.token) { state.pending = false; return; }
      state.pending = false;
      emitUpdate(modTitle, settingId, state.value, state.meta);
    });
  }

  function cancelThrottledEmit(modTitle, settingId) {
    if (!modTitle || !settingId) return;
    var state = throttledEmitState[modTitle + "::" + settingId];
    if (!state) return;
    state.pending = false;
    state.token++;
  }

  function getRootPanelForPresetStore() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel || null;
  }

  function readPresetLabelText(label) {
    try {
      if (typeof label.text === "string") return label.text;
    } catch (e0) {}
    try {
      if (label.GetAttributeString) return label.GetAttributeString("text", "");
    } catch (e1) {}
    return "";
  }

  function getPanelId(panel) {
    try {
      if (panel && panel.id !== undefined) return String(panel.id || "");
    } catch (e0) {}
    try {
      if (panel && panel.GetAttributeString) return String(panel.GetAttributeString("id", "") || "");
    } catch (e1) {}
    return "";
  }

  function readBakedPresetHeroTargets(modConfig, presetId, displayIndex, fallbackHeroes) {
    var store = modConfig && modConfig.__anitaPresetHeroSelections;
    if (store) {
      if (presetId) {
        var idKey = "id:" + String(presetId);
        if (Object.prototype.hasOwnProperty.call(store, idKey)) {
          return normalizeHpHeroSelection(store[idKey]);
        }
      }
      var rowKey = "baked_" + String(displayIndex || 0);
      if (Object.prototype.hasOwnProperty.call(store, rowKey)) {
        return normalizeHpHeroSelection(store[rowKey]);
      }
    }
    return normalizeHpHeroSelection(fallbackHeroes);
  }

  function readBakedPresetHeroMode(modConfig, presetId, displayIndex, fallbackMode, fallbackHeroes) {
    var store = modConfig && modConfig.__anitaPresetHeroModes;
    if (store) {
      if (presetId) {
        var idKey = "id:" + String(presetId);
        if (Object.prototype.hasOwnProperty.call(store, idKey)) {
          return normalizeHpHeroScopeMode(store[idKey], fallbackHeroes);
        }
      }
      var rowKey = "baked_" + String(displayIndex || 0);
      if (Object.prototype.hasOwnProperty.call(store, rowKey)) {
        return normalizeHpHeroScopeMode(store[rowKey], fallbackHeroes);
      }
    }
    return normalizeHpHeroScopeMode(fallbackMode, fallbackHeroes);
  }

  function getPresetAllowedKeys(modConfig) {
    var allowed = {};
    if (!modConfig || !Array.isArray(modConfig.elements)) return allowed;
    for (var i = 0; i < modConfig.elements.length; i++) {
      var element = modConfig.elements[i];
      if (!element || !element.id || element.type === "button") continue;
      allowed[element.id] = true;
    }
    return allowed;
  }

  function filterPresetValues(rawValues, modConfig) {
    var allowed = getPresetAllowedKeys(modConfig);
    var values = {};
    for (var key in rawValues || {}) {
      if (Object.prototype.hasOwnProperty.call(rawValues, key) &&
          Object.prototype.hasOwnProperty.call(allowed, key)) {
        values[key] = rawValues[key];
      }
    }
    return values;
  }

  function expandBakedPresetValues(preset) {
    if (!preset || typeof preset !== "object" || !preset.values || typeof preset.values !== "object") return null;
    var rawValues = preset.values;
    var expanded = {};
    var isCompact = (preset.c === HP_COMPACT_PERSIST_VERSION || preset.compact === true || preset.v !== undefined);
    for (var key in rawValues) {
      if (!Object.prototype.hasOwnProperty.call(rawValues, key)) continue;
      var fullKey = isCompact ? (HP_PERSIST_ALIAS_TO_ID[key] || key) : key;
      if (!fullKey) continue;
      expanded[fullKey] = rawValues[key];
    }
    return expanded;
  }

  function getBakedPresetEntryPanels() {
    var root = getRootPanelForPresetStore();
    if (root !== _hpPresetStoreRoot) {
      _hpPresetStoreRoot = root;
      clearHpPresetStoreRefs();
    }
    if (!root || !root.FindChildTraverse) return [];

    if (hpHeroIsValidPanel(_hpPresetStorePanel) &&
        Array.isArray(_hpPresetStoreEntries) &&
        _hpPresetStoreEntries.length) {
      var entriesValid = true;
      for (var cachedIndex = 0; cachedIndex < _hpPresetStoreEntries.length; cachedIndex++) {
        if (!hpHeroIsValidPanel(_hpPresetStoreEntries[cachedIndex])) {
          entriesValid = false;
          break;
        }
      }
      if (entriesValid) return _hpPresetStoreEntries;
      _hpPresetStoreEntries = null;
    }

    if (!hpHeroIsValidPanel(_hpPresetStorePanel)) {
      try {
        _hpPresetStorePanel = root.FindChildTraverse("HPColorsPresetStore");
      } catch (e0) {
        _hpPresetStorePanel = null;
      }
    }
    if (!hpHeroIsValidPanel(_hpPresetStorePanel)) return [];

    var entries = [];
    try {
      if (_hpPresetStorePanel.FindChildrenWithClassTraverse) {
        entries = _hpPresetStorePanel.FindChildrenWithClassTraverse("hp_colors_preset_entry") || [];
      }
    } catch (e1) {}
    _hpPresetStoreEntries = entries && entries.length ? entries : null;
    return entries;
  }

  function readBakedPresetEntryBase(entry, modConfig, displayIndex, encoded, id) {
    try {
      if (!encoded) return null;
      var preset = JSON.parse(AnitaBase64.decode(encoded));
      var presetVersion = Number(preset && preset.version !== undefined ? preset.version : preset && preset.v);
      if (!preset || presetVersion !== 1) return null;
      var values = filterPresetValues(expandBakedPresetValues(preset), modConfig);
      var name = String(preset.name || "").replace(/^\s+|\s+$/g, "");
      var category = String(preset.category || preset.type || "").replace(/^\s+|\s+$/g, "");
      var heroes = normalizeHpHeroSelection(preset.heroes || preset.hs || preset.hero || preset.h);
      var heroMode = normalizeHpHeroScopeMode(preset.heroMode || preset.hm, heroes);
      if (heroMode !== HP_HERO_SCOPE_SELECTED) heroes = [];
      return {
        id: id,
        name: name || ("Builder preset " + String((displayIndex || 0) + 1)),
        category: category || "Builder VPK",
        values: values,
        heroes: heroes,
        heroMode: heroMode,
        source: "baked"
      };
    } catch (e2) {}
    return null;
  }

  function materializeBakedPresetEntry(base, modConfig, displayIndex) {
    if (!base) return null;
    var heroes = readBakedPresetHeroTargets(modConfig, base.id, displayIndex, base.heroes);
    var heroMode = readBakedPresetHeroMode(modConfig, base.id, displayIndex, base.heroMode, heroes);
    if (heroMode !== HP_HERO_SCOPE_SELECTED) heroes = [];
    return {
      id: base.id,
      name: base.name,
      category: base.category,
      values: base.values,
      heroes: heroes,
      heroMode: heroMode,
      key: "baked_" + String(displayIndex || 0),
      source: base.source
    };
  }

  function readBakedPresetEntries(modConfig) {
    var entries = getBakedPresetEntryPanels();
    var signature = String(entries.length);
    var entryMeta = [];
    for (var metaIndex = 0; metaIndex < entries.length; metaIndex++) {
      var id = getPanelId(entries[metaIndex]);
      var text = readPresetLabelText(entries[metaIndex]);
      entryMeta.push({ id: id, text: text });
      signature += "|" + id + ":" + text;
    }

    var cache = modConfig && modConfig.__hpBakedPresetEntryCache;
    if (!cache || cache.signature !== signature) {
      var bases = [];
      for (var baseIndex = 0; baseIndex < entries.length; baseIndex++) {
        var base = readBakedPresetEntryBase(entries[baseIndex], modConfig, bases.length, entryMeta[baseIndex].text, entryMeta[baseIndex].id);
        if (base) bases.push(base);
      }
      cache = { signature: signature, bases: bases };
      if (modConfig) modConfig.__hpBakedPresetEntryCache = cache;
    }

    var presets = [];
    var cachedBases = cache && Array.isArray(cache.bases) ? cache.bases : [];
    for (var i = 0; i < cachedBases.length; i++) {
      var preset = materializeBakedPresetEntry(cachedBases[i], modConfig, presets.length);
      if (preset) presets.push(preset);
    }
    return presets;
  }

  function runtimePresetPriorityIdentity(preset) {
    if (!preset) return "";
    if (preset.source === "baked" && preset.id) return "id:" + String(preset.id);
    return String(preset.id || preset.key || preset.name || "");
  }

  function isRuntimePresetRemoved(modConfig, preset) {
    var removed = modConfig && modConfig.__anitaRemovedPresetRows;
    if (!removed) return false;
    var key = runtimePresetPriorityIdentity(preset);
    return !!(key && removed[key]);
  }

  function readUserPresetEntries(modConfig) {
    var presets = [];
    var rows = modConfig && Array.isArray(modConfig.__anitaUserPresetRows) ? modConfig.__anitaUserPresetRows : [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.values) continue;
      var heroes = normalizeHpHeroSelection(row.heroes || row.hs || row.hero || row.h);
      var heroMode = normalizeHpHeroScopeMode(row.heroMode || row.hm, heroes);
      if (heroMode !== HP_HERO_SCOPE_SELECTED) heroes = [];
      var id = String(row.key || row.id || row.name || ("user_" + String(i + 1)));
      presets.push({
        id: id,
        key: id,
        name: String(row.name || ("User preset " + String(i + 1))),
        category: String(row.category || "Game preset"),
        values: filterPresetValues(row.values || {}, modConfig),
        heroes: heroes,
        heroMode: heroMode,
        source: "user"
      });
    }
    return presets;
  }

  function applyRuntimePresetPriorityOrder(modConfig, presets) {
    if (!modConfig || !Array.isArray(presets) || !presets.length) return presets;
    var stored = Array.isArray(modConfig.__anitaPresetPriorityOrder) ? modConfig.__anitaPresetPriorityOrder : [];
    if (!stored.length) return presets;

    var byKey = {};
    var ordered = [];
    var seen = {};
    for (var i = 0; i < presets.length; i++) {
      var key = runtimePresetPriorityIdentity(presets[i]);
      if (key && !byKey[key]) byKey[key] = presets[i];
    }
    for (var orderIndex = 0; orderIndex < stored.length; orderIndex++) {
      var storedKey = String(stored[orderIndex] || "");
      if (!storedKey || !byKey[storedKey] || seen[storedKey]) continue;
      seen[storedKey] = true;
      ordered.push(byKey[storedKey]);
    }
    for (var presetIndex = 0; presetIndex < presets.length; presetIndex++) {
      var presetKey = runtimePresetPriorityIdentity(presets[presetIndex]);
      if (presetKey && seen[presetKey]) continue;
      if (presetKey) seen[presetKey] = true;
      ordered.push(presets[presetIndex]);
    }
    return ordered;
  }

  function readRuntimePresetEntries(modConfig) {
    var presets = readBakedPresetEntries(modConfig).concat(readUserPresetEntries(modConfig));
    if (modConfig && modConfig.__anitaRemovedPresetRows) {
      var kept = [];
      for (var i = 0; i < presets.length; i++) {
        if (!isRuntimePresetRemoved(modConfig, presets[i])) kept.push(presets[i]);
      }
      presets = kept;
    }
    return applyRuntimePresetPriorityOrder(modConfig, presets);
  }

  function selectBakedPresetForHero(modConfig, allowUnknownFallback, allowHeroMatch) {
    var presets = readRuntimePresetEntries(modConfig);
    var heroId = detectHpLocalHero();
    var canUseHeroMatch = allowHeroMatch !== false;
    var startupPreset = null;
    var firstPreset = null;
    var firstGlobal = null;
    var firstHeroMatch = null;
    var hasScopedPreset = false;
    for (var i = 0; i < presets.length; i++) {
      var preset = presets[i];
      if (presetIsDisabled(preset)) continue;
      if (!firstPreset) firstPreset = preset;
      if (!firstGlobal && presetIsGlobal(preset)) firstGlobal = preset;
      if (hpHeroScopeIsSelected(preset.heroMode, preset.heroes)) hasScopedPreset = true;
      if (preset.id === HP_STARTUP_PRESET_ID) startupPreset = preset;
      if (heroId && !firstHeroMatch && presetTargetsHero(preset, heroId)) firstHeroMatch = preset;
    }

    var result = null;
    if (canUseHeroMatch && heroId && firstHeroMatch) {
      result = { preset: firstHeroMatch, heroId: heroId, hasScopedPreset: hasScopedPreset, reason: "hero" };
    } else if (startupPreset && (presetIsGlobal(startupPreset) ||
        (canUseHeroMatch && heroId && presetTargetsHero(startupPreset, heroId)) ||
        (!heroId && allowUnknownFallback))) {
      result = { preset: startupPreset, heroId: heroId, hasScopedPreset: hasScopedPreset, reason: "startup" };
    } else if (firstGlobal) {
      result = { preset: firstGlobal, heroId: heroId, hasScopedPreset: hasScopedPreset, reason: "global" };
    } else if (hasScopedPreset && (!heroId || !canUseHeroMatch) && !allowUnknownFallback) {
      result = { preset: null, heroId: heroId, hasScopedPreset: true, reason: "waiting_for_hero" };
    } else if (firstPreset) {
      result = { preset: firstPreset, heroId: heroId, hasScopedPreset: hasScopedPreset, reason: "first" };
    } else {
      result = { preset: null, heroId: heroId, hasScopedPreset: hasScopedPreset, reason: "none" };
    }

    return result;
  }

  function hasHpSelectedScopedPreset(config) {
    var presets = readRuntimePresetEntries(config);
    for (var i = 0; i < presets.length; i++) {
      if (!presetIsDisabled(presets[i]) && hpHeroScopeIsSelected(presets[i].heroMode, presets[i].heroes)) return true;
    }
    return false;
  }

  function invalidateHpHeroPresetApplyCache(config) {
    if (!config) return;
    config.__hpLastAppliedHeroPresetKey = "";
    config.__hpLastAppliedHeroPresetHero = "";
  }

  function getHpHeroPresetLockAfterGameTime(config) {
    var lockAt = Number(config && config.__hpHeroPresetLockAfterGameTime);
    return lockAt > 0 && isFinite(lockAt) ? lockAt : HP_HERO_DETECTION_LOCK_GAME_TIME_SEC;
  }

  function resetHpHeroPresetDetectionLock(config) {
    if (!config) return;
    config.__hpHeroPresetDetectionLocked = false;
    config.__hpHeroPresetLockedHero = "";
    config.__hpHeroPresetLockAfterGameTime = 0;
  }

  function openHpHeroPresetDetectionWindow(config) {
    if (!config) return;
    resetHpHeroPresetDetectionLock(config);
    var gameTime = readHpHeroGameTimeSec();
    config.__hpHeroPresetLockAfterGameTime = gameTime > 0
      ? gameTime + HP_HERO_DETECTION_LOCK_GAME_TIME_SEC
      : HP_HERO_DETECTION_LOCK_GAME_TIME_SEC;
    config.__hpHeroLookupWindowUntil = (Date.now ? Date.now() : +(new Date())) + HP_HERO_LOOKUP_WINDOW_MS;
  }

  function lockHpHeroPresetDetectionIfReady(config, heroId) {
    if (!config || config.__hpHeroPresetDetectionLocked) return false;
    var lockedPresetKey = String(config.__hpLastAppliedHeroPresetKey || "");
    if (!lockedPresetKey && !heroId) return false;
    var gameTime = readHpHeroGameTimeSec();
    if (gameTime < getHpHeroPresetLockAfterGameTime(config)) return false;
    config.__hpHeroPresetDetectionLocked = true;
    config.__hpHeroPresetLockedHero = String(heroId || config.__hpLastAppliedHeroPresetHero || "");
    clearHpHeroDetectionRefs();
    return true;
  }

  function scheduleHpHeroPresetRefresh(config) {
    if (!config) return;
    var token = (config.__hpHeroScopeRefreshToken || 0) + 1;
    config.__hpHeroScopeRefreshToken = token;
    try {
      $.Schedule(0.05, function () {
        if (!config || config.__hpHeroScopeRefreshToken !== token) return;
        refreshHpHeroPresetSelection(config);
      });
    } catch (e0) {}
  }

  function applyHpColorsBakedPresetValues(config, values, presetKey, heroId) {
    var hasValues = false;
    for (var valueKey in values || {}) {
      if (Object.prototype.hasOwnProperty.call(values, valueKey)) {
        hasValues = true;
        break;
      }
    }
    if (!hasValues) return false;

    var appliedKey = String(presetKey || "");
    var appliedHero = String(heroId || "");
    if (appliedKey &&
        config.__hpLastAppliedHeroPresetKey === appliedKey &&
        config.__hpLastAppliedHeroPresetHero === appliedHero) {
      lockHpHeroPresetDetectionIfReady(config, appliedHero);
      return true;
    }

    AnitaPersistence.applyResolvedValues(config, values);
    AnitaPersistence.persistConfig(config, true);
    AnitaRenderer.syncSaveCodeInput(config);
    AnitaCore.emitCurrentValues(config, {
      update_source: "baked_preset_apply",
      force_emit: true,
      force_persist: true,
      bulk_emit: true,
      hero_id: appliedHero,
      preset_key: appliedKey
    });
    config.__hpLastAppliedHeroPresetKey = appliedKey;
    config.__hpLastAppliedHeroPresetHero = appliedHero;
    if (appliedKey && hpHeroAutoDetectionEnabled(config)) config.__anitaSelectedPresetKey = appliedKey;
    lockHpHeroPresetDetectionIfReady(config, appliedHero);
    if (AnitaRenderer.activeModTitle === config.title &&
        config.__anitaActiveCategory !== HP_PRESET_BUILDER_CATEGORY) {
      AnitaRenderer.renderModSettings(config);
    }
    return true;
  }

  function refreshHpHeroPresetSelection(config) {
    if (!config) return false;
    if (!hpHeroAutoDetectionEnabled(config)) return false;
    if (config.__hpHeroPresetDetectionLocked) return false;
    var selection = selectBakedPresetForHero(config, false);
    if (selection && selection.hasScopedPreset) {
      config.__hpHeroPresetHasScopedPreset = true;
      config.__hpHeroPresetEmptyTicks = 0;
    } else if (config.__hpHeroPresetWatchStarted) {
      config.__hpHeroPresetEmptyTicks = (config.__hpHeroPresetEmptyTicks || 0) + 1;
      if (config.__hpHeroPresetEmptyTicks >= HP_HERO_WATCH_EMPTY_GRACE_TICKS) {
        config.__hpHeroPresetHasScopedPreset = false;
      }
    } else {
      config.__hpHeroPresetHasScopedPreset = false;
      config.__hpHeroPresetEmptyTicks = 0;
    }
    var detectedHero = selection ? String(selection.heroId || "") : "";
    var previousHero = String(config.__hpLastDetectedHeroPresetHero || "");
    if (detectedHero !== previousHero) {
      config.__hpLastDetectedHeroPresetHero = detectedHero;
    }

    if (selection && selection.preset) {
      var presetKey = String(selection.preset.id || selection.preset.name || "");
      applyHpColorsBakedPresetValues(config, selection.preset.values || {}, presetKey, detectedHero);
      return true;
    }

    if (selection && selection.hasScopedPreset) {
      invalidateHpHeroPresetApplyCache(config);
    }

    return false;
  }

  function startHpHeroPresetWatch(config) {
    if (!config || config.__hpHeroPresetWatchStarted) return;
    if (!config.__hpHeroPresetHasScopedPreset && !hasHpSelectedScopedPreset(config)) return;
    config.__hpHeroPresetHasScopedPreset = true;
    config.__hpHeroPresetWatchStarted = true;
    config.__hpHeroPresetWatchTicks = 0;
    config.__hpHeroPresetEmptyTicks = 0;

    function tick() {
      if (!config || !config.__hpHeroPresetWatchStarted) return;
      config.__hpHeroPresetWatchTicks += 1;
      var lookupState = getHpHeroPresetLookupState(config);
      if (!lookupState.run) {
        $.Schedule(lookupState.delay || HP_HERO_LOBBY_POLL_SEC, tick);
        return;
      }
      try {
        refreshHpHeroPresetSelection(config);
      } catch (e) {}
      if (!config.__hpHeroPresetHasScopedPreset) {
        config.__hpHeroPresetWatchStarted = false;
        return;
      }
      $.Schedule(lookupState.delay || HP_HERO_WATCH_RETRY_SEC, tick);
    }

    $.Schedule(HP_HERO_WATCH_RETRY_SEC, tick);
  }

  function applyHpColorsBakedPresetOnce(config) {
    if (_didApplyHpColorsBakedPresetOnce) return;
    var token = ++_hpBakedPresetApplyToken;
    for (var i = 0; i < HP_BAKED_PRESET_APPLY_DELAYS.length; i++) {
      (function (delaySec, delayIndex) {
        $.Schedule(delaySec, function () {
          if (_didApplyHpColorsBakedPresetOnce || token !== _hpBakedPresetApplyToken) return;
          try {
            var lookupState = getHpHeroPresetLookupState(config);
            var allowHeroMatch = !!lookupState.run;
            var allowUnknownFallback = allowHeroMatch && delayIndex === HP_BAKED_PRESET_APPLY_DELAYS.length - 1;
            var selection = selectBakedPresetForHero(config, allowUnknownFallback, allowHeroMatch);
            if (!selection || !selection.preset) {
              if (selection && selection.hasScopedPreset) startHpHeroPresetWatch(config);
              return;
            }
            if (selection.hasScopedPreset) startHpHeroPresetWatch(config);
            if (applyHpColorsBakedPresetValues(config, selection.preset.values || {}, selection.preset.id || selection.preset.name, selection.heroId)) {
              _didApplyHpColorsBakedPresetOnce = true;
            }
          } catch (e) {}
        });
      })(HP_BAKED_PRESET_APPLY_DELAYS[i], i);
    }
  }

  function applyHpOptimizedHardGates(config) {
    if (!config || config.title !== "HP Colors" || !Array.isArray(config.elements)) return false;
    var changed = false;
    for (var i = 0; i < config.elements.length; i++) {
      var element = config.elements[i];
      if (!element || !element.id) continue;
      var forced = Object.prototype.hasOwnProperty.call(HP_OPTIMIZED_FORCED_VALUES, element.id);
      var hidden = Object.prototype.hasOwnProperty.call(HP_OPTIMIZED_HIDDEN_SETTINGS, element.id);
      element.runtimeLocked = !!forced;
      element.runtimeHidden = !!hidden;
      if (forced && element.currentValue !== HP_OPTIMIZED_FORCED_VALUES[element.id]) {
        element.currentValue = HP_OPTIMIZED_FORCED_VALUES[element.id];
        changed = true;
      }
    }
    return changed;
  }

  function collectHpSharedSnapshotValues(config) {
    if (!config || config.title !== "HP Colors" || !Array.isArray(config.elements)) return null;
    applyHpOptimizedHardGates(config);
    var values = {};
    var count = 0;
    for (var i = 0; i < config.elements.length; i++) {
      var element = config.elements[i];
      if (!element || !element.id) continue;
      if (element.currentValue !== undefined) values[element.id] = element.currentValue;
      else values[element.id] = element.defaultValue;
      count += 1;
    }
    return count ? values : null;
  }

  function writeHpSharedSnapshot(config) {
    var values = collectHpSharedSnapshotValues(config);
    if (!values) return "";
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig) {
        var raw = JSON.stringify(values);
        if (raw === _lastHpSharedRaw) return raw;
        _lastHpSharedRaw = raw;
        GameUI.CustomUIConfig().__hpColorsCfgRaw = raw;
        return raw;
      }
    } catch (e) {
    }
    return "";
  }

  function hpNowMs() {
    return Date.now ? Date.now() : +(new Date());
  }

  function markHpPresetSnapshotReplayHot() {
    _hpPresetSnapshotReplayCount = 0;
    _hpPresetSnapshotReplayHotUntil = hpNowMs() + HP_PRESET_SNAPSHOT_REQUEST_HOT_MS;
  }

  function getHpPresetSnapshotReplayDelay() {
    if (_hpPresetSnapshotReplayHotUntil && hpNowMs() < _hpPresetSnapshotReplayHotUntil) {
      return HP_PRESET_SNAPSHOT_REPLAY_HOT_SEC;
    }
    if (_hpPresetSnapshotReplayCount < HP_PRESET_SNAPSHOT_REPLAY_HOT_COUNT) {
      return HP_PRESET_SNAPSHOT_REPLAY_HOT_SEC;
    }
    if (_hpPresetSnapshotReplayCount < HP_PRESET_SNAPSHOT_REPLAY_WARM_COUNT) {
      return HP_PRESET_SNAPSHOT_REPLAY_WARM_SEC;
    }
    return HP_PRESET_SNAPSHOT_REPLAY_IDLE_SEC;
  }

  function scheduleHpPresetSnapshotReplay() {
    if (!_hpPresetSnapshotPayload) return;
    try {
      $.Schedule(getHpPresetSnapshotReplayDelay(), replayHpPresetSnapshot);
    } catch (eSchedule) {}
  }

  function replayHpPresetSnapshot() {
    if (!_hpPresetSnapshotPayload) return;
    try {
      $.DispatchEvent("ClientUI_FireOutput", _hpPresetSnapshotPayload);
    } catch (eDispatch) {}
    _hpPresetSnapshotReplayCount += 1;
    scheduleHpPresetSnapshotReplay();
  }

  function startHpPresetSnapshotReplay() {
    if (_hpPresetSnapshotReplayStarted || !_hpPresetSnapshotPayload) return;
    _hpPresetSnapshotReplayStarted = true;
    scheduleHpPresetSnapshotReplay();
  }

  function publishHpPresetSnapshot(config, reason, force) {
    var values = collectHpSharedSnapshotValues(config);
    if (!values) return false;
    var raw = "";
    try { raw = JSON.stringify(values); } catch (eRaw) { raw = ""; }
    if (!raw) return false;
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig) {
        GameUI.CustomUIConfig().__hpColorsCfgRaw = raw;
      }
    } catch (eShared) {}
    try {
      _hpPresetSnapshotPayload = JSON.stringify({
        magic_word: HP_PRESET_SNAPSHOT_MAGIC,
        mod_title: "HP Colors",
        version: 1,
        values_raw: raw,
        values: values,
        update_source: String(reason || "full_static")
      });
    } catch (ePayload) {
      _hpPresetSnapshotPayload = "";
      return false;
    }
    markHpPresetSnapshotReplayHot();
    startHpPresetSnapshotReplay();
    if (!force && config.__hpColorsLastPresetSnapshotRaw === raw) return true;
    config.__hpColorsLastPresetSnapshotRaw = raw;
    try {
      $.DispatchEvent("ClientUI_FireOutput", _hpPresetSnapshotPayload);
      return true;
    } catch (eDispatch) {
      return false;
    }
  }

  const AnitaPersistence = {

    normalizeNamespace: function (storageNamespace) {
      return String(storageNamespace || "")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    },

    getVersion: function (config) {
      var version = Number(config && config.storageVersion);
      if (!isFinite(version) || version < 1) return 1;
      return Math.floor(version);
    },

    hasPersistentConfig: function (config) {
      return this.normalizeNamespace(config && config.storageNamespace).length > 0;
    },

    isHpColorsConfig: function (config) {
      return !!config &&
        String(config.title || "") === "HP Colors" &&
        this.normalizeNamespace(config.storageNamespace) === "hp_colors";
    },

    TOKEN_PREFIX: "ANITA-v1-",

    // ns is safe to interpolate into regex: normalizeNamespace restricts output to [a-z0-9_]
    getTokenRegex: function (ns) {
      return new RegExp("\\[" + this.TOKEN_PREFIX + ns + "\\]:[A-Za-z0-9_-]+");
    },

    getStorageKey: function (config) {
      var ns = this.normalizeNamespace(config && config.storageNamespace);
      return ns ? "anita_v1_" + ns : "";
    },

    getRootPanel: function () {
      var rootPanel = $.GetContextPanel();
      while (rootPanel && rootPanel.GetParent && rootPanel.GetParent()) rootPanel = rootPanel.GetParent();
      return rootPanel || null;
    },

    getSessionEncoded: function (config) {
      var key = this.getStorageKey(config);
      if (!key) return "";

      var rootPanel = this.getRootPanel();
      var rootEncoded = "";
      var hudEncoded = "";

      try {
        if (rootPanel && rootPanel.GetAttributeString) {
          rootEncoded = String(rootPanel.GetAttributeString(key, "") || "");
        }
      } catch (eRoot) {}

      try {
        var hudPanel = (rootPanel && rootPanel.FindChildTraverse) ? rootPanel.FindChildTraverse("Hud") : null;
        if (hudPanel && hudPanel.GetAttributeString) {
          hudEncoded = String(hudPanel.GetAttributeString(key, "") || "");
        }
      } catch (eHud) {}

      return rootEncoded || hudEncoded || "";
    },

    writeSessionMirror: function (config, encoded) {
      var key = this.getStorageKey(config);
      if (!key) return;

      try {
        var rootPanel = this.getRootPanel();
        if (rootPanel && rootPanel.SetAttributeString) {
          rootPanel.SetAttributeString(key, encoded);
        }
        var hudPanel = (rootPanel && rootPanel.FindChildTraverse) ? rootPanel.FindChildTraverse("Hud") : null;
        if (hudPanel && hudPanel.SetAttributeString) {
          hudPanel.SetAttributeString(key, encoded);
        }
      } catch (eSess) {
      }
    },

    getElements: function (config) {
      return (config && Array.isArray(config.elements)) ? config.elements : [];
    },

    shouldPersistElement: function (element) {
      return !!(element && element.id && element.type !== "button");
    },

    sanitizeValue: function (element, value) {
      if (!element) return value;

      var fallback = element.defaultValue;
      var type = String(element.type || "");

      if (type === "toggle") {
        if (value === true || value === false) return value;
        if (value === 1 || value === "1") return true;
        if (value === 0 || value === "0") return false;
        if (typeof value === "string") {
          var lowered = value.toLowerCase();
          if (lowered === "true") return true;
          if (lowered === "false") return false;
        }
        return !!fallback;
      }

      if (type === "cycler") {
        var count = Array.isArray(element.options) ? element.options.length : 0;
        var nextIndex = Number(value);
        if (!isFinite(nextIndex)) nextIndex = Number(fallback);
        if (!isFinite(nextIndex)) nextIndex = 0;
        nextIndex = Math.round(nextIndex);
        if (nextIndex < 0) nextIndex = 0;
        if (count > 0 && nextIndex >= count) {
          var fallbackIndex = Number(fallback);
          if (!isFinite(fallbackIndex) || fallbackIndex < 0 || fallbackIndex >= count) fallbackIndex = 0;
          nextIndex = fallbackIndex;
        }
        return nextIndex;
      }

      if (type === "stepper" || type === "slider") {
        var nextNumber = Number(value);
        if (!isFinite(nextNumber)) nextNumber = Number(fallback);
        if (!isFinite(nextNumber)) nextNumber = 0;
        var min = Number(element.min);
        var max = Number(element.max);
        if (isFinite(min) && nextNumber < min) nextNumber = min;
        if (isFinite(max) && nextNumber > max) nextNumber = max;
        var step = Number(element.step);
        if (!isFinite(step) || step === 0) step = 1;
        if (Math.round(step) === step) {
          nextNumber = Math.round(nextNumber);
        } else {
          nextNumber = parseFloat(nextNumber.toFixed(2));
        }
        if (isFinite(min) && nextNumber < min) nextNumber = min;
        if (isFinite(max) && nextNumber > max) nextNumber = max;
        return nextNumber;
      }

      if (type === "colorpicker") {
        if (typeof value === "string" && value.length > 0) return value;
        return (typeof fallback === "string" && fallback.length > 0) ? fallback : "#FFFFFF";
      }

      if (value !== undefined) return value;
      return fallback;
    },

    ensureDefaults: function (config) {
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) {
          if (element.currentValue === undefined && element.defaultValue !== undefined) {
            element.currentValue = element.defaultValue;
          }
          continue;
        }
        var sourceValue = (element.currentValue !== undefined) ? element.currentValue : element.defaultValue;
        element.currentValue = this.sanitizeValue(element, sourceValue);
      }
    },

    expandStoredValues: function (config, parsed) {
      if (!parsed || typeof parsed !== "object" || !parsed.values || typeof parsed.values !== "object") {
        return null;
      }

      var rawValues = parsed.values;
      var expanded = {};
      var isCompact = this.isHpColorsConfig(config) && (parsed.c === HP_COMPACT_PERSIST_VERSION || parsed.compact === true);

      if (!isCompact) {
        for (var key in rawValues) {
          if (Object.prototype.hasOwnProperty.call(rawValues, key)) {
            expanded[key] = rawValues[key];
          }
        }
        return expanded;
      }

      for (var alias in rawValues) {
        if (!Object.prototype.hasOwnProperty.call(rawValues, alias)) continue;
        var fullId = HP_PERSIST_ALIAS_TO_ID[alias];
        if (!fullId) continue;
        expanded[fullId] = rawValues[alias];
      }
      return expanded;
    },

    parseStoredPayload: function (config, raw) {
      var text = String(raw || "");
      if (!text) return null;

      var parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return null;
      }

      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      var expandedValues = this.expandStoredValues(config, parsed);
      if (!expandedValues) {
        return null;
      }

      var values = {};
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) continue;
        if (!Object.prototype.hasOwnProperty.call(expandedValues, element.id)) continue;
        values[element.id] = this.sanitizeValue(element, expandedValues[element.id]);
      }

      var heroTargets = normalizeHpHeroSelection(parsed.heroes || parsed.hs || parsed.hero || parsed.h);
      var heroMode = normalizeHpHeroScopeMode(parsed.heroMode || parsed.hm, heroTargets);
      if (heroMode !== HP_HERO_SCOPE_SELECTED) heroTargets = [];

      return {
        raw: text,
        values: values,
        heroes: heroTargets,
        heroMode: heroMode
      };
    },

    readSharedSnapshotPayload: function (config) {
      try {
        if (typeof GameUI === "undefined" || !GameUI || !GameUI.CustomUIConfig) return null;
        var raw = String(GameUI.CustomUIConfig().__hpColorsCfgRaw || "");
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return {
          raw: raw,
          encoded: "",
          values: parsed,
          source: "shared"
        };
      } catch (eShared) {}
      return null;
    },

    readStoredPayload: function (config) {
      var persisted = null;

      persisted = this.readSharedSnapshotPayload(config);
      if (persisted) {
        return persisted;
      }

      try {
        var sessionEncoded = this.getSessionEncoded(config);
        if (sessionEncoded) {
          var sessionRaw = AnitaBase64.decode(sessionEncoded);
          persisted = this.parseStoredPayload(config, sessionRaw);
          if (persisted) {
            return {
              raw: persisted.raw,
              encoded: sessionEncoded,
              values: persisted.values,
              source: "session"
            };
          }
        }
      } catch (eSess) {
      }

      return null;
    },

    applyResolvedValues: function (config, values) {
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) {
          if (element.currentValue === undefined && element.defaultValue !== undefined) {
            element.currentValue = element.defaultValue;
          }
          continue;
        }

        var nextValue = Object.prototype.hasOwnProperty.call(values || {}, element.id)
          ? values[element.id]
          : element.defaultValue;
        element.currentValue = this.sanitizeValue(element, nextValue);
      }
    },

    hydrateConfig: function (config) {
      this.ensureDefaults(config);
      var hydrateSource = "defaults";
      var ns = this.normalizeNamespace(config && config.storageNamespace);

      if (!this.hasPersistentConfig(config)) {
        config.__anitaLastPersistedRaw = "";
        this.applyResolvedValues(config, {});
        return;
      }

      var persisted = this.readStoredPayload(config);
      if (persisted) {
        hydrateSource = persisted.source;
      }

      if (persisted) {
        this.applyResolvedValues(config, persisted.values);
        if (persisted.encoded && hydrateSource !== "session") {
          this.writeSessionMirror(config, persisted.encoded);
        } else if (hydrateSource === "shared") {
          this.persistConfig(config, true);
        }
      } else {
        this.applyResolvedValues(config, {});
      }

      config.__anitaLastPersistedRaw = persisted ? persisted.raw : "";
    },

    buildStoredPayload: function (config) {
      var elements = this.getElements(config);
      var values = {};
      var isHpColors = this.isHpColorsConfig(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!this.shouldPersistElement(element)) continue;
        var value = this.sanitizeValue(
          element,
          element.currentValue !== undefined ? element.currentValue : element.defaultValue
        );
        element.currentValue = value;
        if (isHpColors && value === this.sanitizeValue(element, element.defaultValue)) {
          continue;
        }
        values[isHpColors ? (HP_PERSIST_ALIASES[element.id] || element.id) : element.id] = value;
      }
      if (isHpColors) {
        return JSON.stringify({
          v: this.getVersion(config),
          c: HP_COMPACT_PERSIST_VERSION,
          values: values
        });
      }
      return JSON.stringify({
        version: this.getVersion(config),
        values: values
      });
    },

    persistConfig: function (config, forceWrite) {
      if (!this.hasPersistentConfig(config)) return false;

      var raw = this.buildStoredPayload(config);
      if (!raw) return false;
      if (!forceWrite && raw === String(config.__anitaLastPersistedRaw || "")) {
        return false;
      }

      var encoded = "";
      try {
        encoded = AnitaBase64.encode(raw);
      } catch (eEnc) {
        return false;
      }

      this.writeSessionMirror(config, encoded);

      config.__anitaLastPersistedRaw = raw;
      return true;
    },

    requestBootstrap: function (config, reason) {
      if (!this.hasPersistentConfig(config)) return;
      var payload = {
        magic_word: "ANITA_REQUEST_BOOTSTRAP",
        mod_title: config.title,
        storageNamespace: this.normalizeNamespace(config.storageNamespace),
        reason: String(reason || "request")
      };
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(payload));
    },

    applyUpdate: function (config, settingId, value) {
      var elements = this.getElements(config);
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!element || element.id !== settingId) continue;
        element.currentValue = this.sanitizeValue(element, value);
        return true;
      }
      return false;
    }
  };

  const AnitaComponents = {
    isInteractionLocked: function (config) {
      return !!(config && (config.runtimeLocked || config.disabled));
    },

    applyInteractionLock: function (row, config) {
      if (!this.isInteractionLocked(config)) return false;
      row.AddClass("AnitaRuntimeLocked");
      row.hittestchildren = false;
      return true;
    },

    createToggle: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaToggleRow");

      const btn = $.CreatePanel("Button", row, "");
      btn.AddClass("AnitaToggleBtn");
      btn.hittest = true;
      btn.hittestchildren = false;
      btn.style.zIndex = "4";

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Option";
      lbl.AddClass("AnitaLabel");
      lbl.hittest = false;
      lbl.hittestchildren = false;

      const box = $.CreatePanel("Panel", row, "");
      box.AddClass("AnitaCheckBox");
      box.hittest = false;
      box.hittestchildren = false;

      const tick = $.CreatePanel("Panel", box, "");
      tick.AddClass("AnitaCheckMark");
      tick.hittest = false;
      tick.hittestchildren = false;

      let isOn = (config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || false);

      const updateState = (active) => row.SetHasClass("Checked", active);
      updateState(isOn);
      if (this.applyInteractionLock(row, config)) return row;

      btn.SetPanelEvent("onactivate", () => {
        isOn = !isOn;
        updateState(isOn);

        config.currentValue = isOn;

        if (config.id) emitUpdate(modTitle, config.id, isOn);
        if (config.onChange) config.onChange(isOn);

        var ownerConfig = AnitaCore.findRegisteredMod(modTitle);
        if (ownerConfig) {
          AnitaRenderer.refreshDependentVisibility(ownerConfig, config.id);
        }
      });

      return row;
    },

    createStepper: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");
      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Value";
      lbl.AddClass("AnitaLabel");
      const controls = $.CreatePanel("Panel", row, "");
      controls.AddClass("AnitaStepperControls");
      const btnM = $.CreatePanel("Button", controls, "");
      btnM.AddClass("AnitaStepBtn");
      $.CreatePanel("Label", btnM, "less").text = "-";
      const input = $.CreatePanel("TextEntry", controls, "");
      input.AddClass("AnitaStepInput");
      const btnP = $.CreatePanel("Button", controls, "");
      btnP.AddClass("AnitaStepBtn");
      $.CreatePanel("Label", btnP, "").text = "+";

      let val = (config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || 0);
      const step = config.step || 1;
      const isFloat = !Number.isInteger(step);
      input.text = isFloat ? val.toFixed(2) : val;
      const locked = this.applyInteractionLock(row, config);

      function update(newVal) {
        if (locked) return;
        if (isFloat) newVal = parseFloat(newVal.toFixed(2)); else newVal = Math.round(newVal);
        val = newVal;
        config.currentValue = val;
        input.text = val.toString();
        if (config.onChange) config.onChange(val);
        if (config.id && modTitle) {
          emitUpdate(modTitle, config.id, val);
        }
      }

      input.SetPanelEvent("ontextentrychange", () => {
        let v = parseFloat(input.text);
        if (!isNaN(v)) {
          val = v;
          config.currentValue = v;
        }
      });

      input.SetPanelEvent("oncancel", () => {
        AnitaRenderer.toggle(false);
      });

      btnM.SetPanelEvent("onactivate", () => update(val - step));
      btnP.SetPanelEvent("onactivate", () => update(val + step));

      input.SetPanelEvent("oninputsubmit", () => {
        update(val);
        $.DispatchEvent("DropInputFocus", input);
        AnitaRenderer.mainWindow.SetFocus();
      });

      input.SetPanelEvent("onfocusout", () => {
        update(val);
      });

      return row;
    },

    createSlider: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");
      row.AddClass("AnitaSliderRow");
      row.style.width = "100%";

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Value";
      lbl.AddClass("AnitaLabel");

      const valueGroup = $.CreatePanel("Panel", row, "");
      valueGroup.AddClass("AnitaSliderValueGroup");
      valueGroup.AddClass("SliderValueGroup");
      valueGroup.style.flowChildren = "right";
      valueGroup.style.verticalAlign = "center";
      valueGroup.style.horizontalAlign = "left";
      valueGroup.style.width = "296px";

      const sliderContainer = $.CreatePanel("Panel", valueGroup, "");
      sliderContainer.AddClass("AnitaSliderContainer");
      sliderContainer.AddClass("SliderContainer");
      sliderContainer.style.width = "230px";
      sliderContainer.style.height = "26px";
      sliderContainer.style.padding = "0px";
      sliderContainer.style.verticalAlign = "center";
      sliderContainer.style.overflow = "noclip";

      const slider = $.CreatePanel("Slider", sliderContainer, "", { direction: "horizontal" });
      slider.AddClass("AnitaSlider");
      slider.AddClass("HorizontalSlider");
      slider.style.width = "100%";
      slider.style.height = "100%";
      slider.style.verticalAlign = "center";
      slider.style.overflow = "noclip";

      const valueLbl = $.CreatePanel("Label", valueGroup, "");
      valueLbl.AddClass("AnitaSliderValue");

      const rawMin = Number(config.min);
      const rawMax = Number(config.max);
      const rawStep = Number(config.step);
      const min = isFinite(rawMin) ? rawMin : 0;
      const max = isFinite(rawMax) ? rawMax : 100;
      const step = isFinite(rawStep) && rawStep > 0 ? rawStep : 1;

      let val = (config.currentValue !== undefined)
        ? config.currentValue
        : (config.defaultValue !== undefined ? config.defaultValue : min);
      let isSyncing = false;
      function normalize(nextVal) {
        let next = Number(nextVal);
        if (!isFinite(next)) next = Number(config.defaultValue);
        if (!isFinite(next)) next = min;
        if (next < min) next = min;
        if (next > max) next = max;
        if (Math.round(step) === step) {
          next = Math.round(next);
        } else {
          next = parseFloat(next.toFixed(2));
        }
        return next;
      }

      function syncVisuals(nextVal, emitUpdateEvent) {
        const normalized = normalize(nextVal);
        val = normalized;
        config.currentValue = normalized;
        valueLbl.text = normalized.toString() + "%";

        if (slider && slider.IsValid && slider.IsValid()) {
          if (Number(slider.value) !== normalized) {
            isSyncing = true;
            try {
              if (typeof slider.SetValueNoEvents === "function") {
                slider.SetValueNoEvents(normalized);
              } else {
                slider.value = normalized;
              }
            } finally {
              isSyncing = false;
            }
          }
        }

        if (emitUpdateEvent) {
          if (config.onChange) config.onChange(normalized);
          if (config.id && modTitle) {
            emitUpdateThrottled(modTitle, config.id, normalized, null, 0.04);
          }
        }
      }

      slider.min = min;
      slider.max = max;
      slider.increment = step;
      slider.value = normalize(val);

      if (typeof slider.SetShowDefaultValue === "function") {
        slider.SetShowDefaultValue(false);
      }
      if (typeof slider.SetRequiresSelection === "function") {
        slider.SetRequiresSelection(false);
      }

      syncVisuals(val, false);
      const locked = this.applyInteractionLock(row, config);

      slider.SetPanelEvent("onvaluechanged", function () {
        if (locked) return;
        if (isSyncing) return;
        syncVisuals(slider.value, true);
      });

      slider.SetPanelEvent("oncancel", () => {
        AnitaRenderer.toggle(false);
      });

      return row;
    },

    createButton: function (parent, config, modTitle) {
      const btn = $.CreatePanel("Button", parent, "");
      btn.AddClass("AnitaActionBtn");
      const lbl = $.CreatePanel("Label", btn, "");
      lbl.text = config.label || "Action";

      btn.SetPanelEvent("onactivate", () => {
        if (config.onClick) config.onClick();

        if (config.id && modTitle) {
          emitUpdate(modTitle, config.id, true);
        }

        btn.AddClass("Activated");
        $.Schedule(0.1, () => btn.RemoveClass("Activated"));
      });
      return btn;
    },

    createCycler: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Cycle";
      lbl.AddClass("AnitaLabel");

      const group = $.CreatePanel("Panel", row, "");
      group.AddClass("AnitaCyclerGroup");

      const options = config.options || ["OFF", "ON"];
      let idx = (config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || 0);
      if (idx < 0 || idx >= options.length) idx = 0;
      const locked = this.applyInteractionLock(row, config);

      const btns = [];
      const updateVisuals = () => {
        for (let i = 0; i < btns.length; i++) {
          btns[i].SetHasClass("Active", i === idx);
        }
      };

      for (let i = 0; i < options.length; i++) {
        const btn = $.CreatePanel("Button", group, "");
        btn.AddClass("AnitaCyclerSegment");
        const valLbl = $.CreatePanel("Label", btn, "");
        valLbl.text = options[i];
        
        btn.SetPanelEvent("onactivate", () => {
          if (locked) return;
          if (idx === i) return;
          idx = i;
          updateVisuals();
          config.currentValue = idx;
          var ownerConfig = AnitaCore.findRegisteredMod(modTitle);
          if (ownerConfig) {
            AnitaRenderer.refreshDependentVisibility(ownerConfig, config.id);
          }
          if (config.id && modTitle) emitUpdate(modTitle, config.id, idx);
          if (config.onChange) config.onChange(idx, options[i]);
        });
        btns.push(btn);
      }

      updateVisuals();
      return row;
    },

    createColorPicker: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");
      row.AddClass("AnitaSliderRow");
      row.style.overflow = "noclip";
      row.style.width = "100%";

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Color";
      lbl.AddClass("AnitaLabel");

      let currentColor = normalizeHexColor((config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || "#FF0000"));
      let pickerBoxHue = 0;
      let pickerBoxSat = 1;
      let pickerBoxVal = 1;
      let colorPopupPanel = null;
      let colorBoxFrame = null;
      let colorBoxPanel = null;
      let colorBoxCursor = null;
      let colorPickerSyncing = false;
      let colorPickerPollGeneration = 0;
      let colorDragging = false;
      const hasGameUI = (typeof GameUI !== "undefined" && GameUI !== null);
      let colorDragAnchorX = -1;
      let colorDragAnchorY = -1;
      let colorDragSource = "";
      let nativeDragStartAnchorX = -1;
      let nativeDragStartAnchorY = -1;
      let nativeDragOffsetX = 0;
      let nativeDragOffsetY = 0;
      let nativeDragHasSample = false;
      let nativeDragAxis = "";
      let popupPreview = null;
      let popupHexLabel = null;
      let popupMetaLabel = null;
      let colorPreview = null;
      let rowHexLabel = null;
      let pickerHueSlider = null;
      let pickerSatSlider = null;
      let pickerSatTrack = null;
      let pickerHueValue = null;
      let pickerSatValue = null;
      let pickerValSlider = null;
      let pickerValValue = null;
      let pickerValTrack = null;
      let colorPreviewBtn = null;
      const COLOR_BOX_LOGICAL_WIDTH = 260;
      const COLOR_BOX_LOGICAL_HEIGHT = 200;
      const COLOR_BOX_CURSOR_LOGICAL_SIZE = 16;

      function clampByte(value) {
        let next = Number(value);
        if (!isFinite(next)) next = 0;
        if (next < 0) next = 0;
        if (next > 255) next = 255;
        return Math.round(next);
      }

      function byteToHex(value) {
        const hex = clampByte(value).toString(16).toUpperCase();
        return hex.length < 2 ? "0" + hex : hex;
      }

      function rgbToHex(r, g, b) {
        return "#" + byteToHex(r) + byteToHex(g) + byteToHex(b);
      }

      function hexToRgbLocal(colorCode) {
        if (!colorCode) return [255, 255, 255];

        const text = String(colorCode).trim();
        if (text.charAt(0) === "#") {
          let hex = text.slice(1);
          if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
          }
          if (hex.length >= 6) {
            return [
              parseInt(hex.slice(0, 2), 16) || 0,
              parseInt(hex.slice(2, 4), 16) || 0,
              parseInt(hex.slice(4, 6), 16) || 0
            ];
          }
        }

        const match = text.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
        if (match) {
          return [
            clampByte(match[1]),
            clampByte(match[2]),
            clampByte(match[3])
          ];
        }

        return [255, 255, 255];
      }

      function hsvToRgb(h, s, v) {
        var hue = Number(h);
        var sat = Number(s);
        var val = Number(v);

        if (!isFinite(hue)) hue = 0;
        if (!isFinite(sat)) sat = 0;
        if (!isFinite(val)) val = 0;

        hue = ((hue % 360) + 360) % 360;
        sat = Math.max(0, Math.min(1, sat));
        val = Math.max(0, Math.min(1, val));

        var c = val * sat;
        var x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
        var m = val - c;
        var r = 0;
        var g = 0;
        var b = 0;

        if (hue < 60) {
          r = c; g = x; b = 0;
        } else if (hue < 120) {
          r = x; g = c; b = 0;
        } else if (hue < 180) {
          r = 0; g = c; b = x;
        } else if (hue < 240) {
          r = 0; g = x; b = c;
        } else if (hue < 300) {
          r = x; g = 0; b = c;
        } else {
          r = c; g = 0; b = x;
        }

        return [
          clampByte((r + m) * 255),
          clampByte((g + m) * 255),
          clampByte((b + m) * 255)
        ];
      }

      function hsvToHex(h, s, v) {
        var rgb = hsvToRgb(h, s, v);
        return rgbToHex(rgb[0], rgb[1], rgb[2]);
      }

      function rgbToHsv(r, g, b) {
        var red = clampByte(r) / 255;
        var green = clampByte(g) / 255;
        var blue = clampByte(b) / 255;
        var max = Math.max(red, green, blue);
        var min = Math.min(red, green, blue);
        var delta = max - min;
        var hue = 0;
        var sat = max === 0 ? 0 : delta / max;
        var val = max;

        if (delta !== 0) {
          if (max === red) {
            hue = 60 * (((green - blue) / delta) % 6);
          } else if (max === green) {
            hue = 60 * (((blue - red) / delta) + 2);
          } else {
            hue = 60 * (((red - green) / delta) + 4);
          }
        }

        if (hue < 0) hue += 360;
        return [hue, sat, val];
      }

      function clamp01(value) {
        var next = Number(value);
        if (!isFinite(next)) next = 0;
        if (next < 0) next = 0;
        if (next > 1) next = 1;
        return next;
      }

      function isValidPanel(panel) {
        return !!(panel && panel.IsValid && panel.IsValid());
      }

      function parsePoint(candidate) {
        if (!candidate) return null;

        if (typeof candidate.length === "number" && candidate.length >= 2) {
          var arrayX = Number(candidate[0]);
          var arrayY = Number(candidate[1]);
          if (isFinite(arrayX) && isFinite(arrayY)) {
            return { x: arrayX, y: arrayY };
          }
        }

        if (typeof candidate === "object") {
          var objectX = Number(candidate.x !== undefined ? candidate.x : candidate[0]);
          var objectY = Number(candidate.y !== undefined ? candidate.y : candidate[1]);
          if (isFinite(objectX) && isFinite(objectY)) {
            return { x: objectX, y: objectY };
          }
        }

        return null;
      }

      function getCursorPosition() {
        try {
          if (!hasGameUI || typeof GameUI.GetCursorPosition !== "function") return null;
          return parsePoint(GameUI.GetCursorPosition());
        } catch (e) {}
        return null;
      }

      function getPanelWindowPosition(panel) {
        if (!isValidPanel(panel)) return null;

        try {
          if (typeof panel.GetPositionWithinWindow === "function") {
            var point = parsePoint(panel.GetPositionWithinWindow());
            if (point) return point;
          }
        } catch (e) {}

        var left = Number(panel.actualxoffset || panel.actualx || 0);
        var top = Number(panel.actualyoffset || panel.actualy || 0);
        if (!isFinite(left)) left = 0;
        if (!isFinite(top)) top = 0;
        return { x: left, y: top };
      }

      function getPanelBounds(panel) {
        if (!isValidPanel(panel)) {
          return { left: 0, top: 0, width: 1, height: 1 };
        }

        var panelPos = getPanelWindowPosition(panel);
        var left = panelPos ? panelPos.x : Number(panel.actualxoffset || panel.actualx || 0);
        var top = panelPos ? panelPos.y : Number(panel.actualyoffset || panel.actualy || 0);
        var width = Number(panel.actuallayoutwidth || panel.contentwidth || panel.width || 1);
        var height = Number(panel.actuallayoutheight || panel.contentheight || panel.height || 1);

        if (!isFinite(left)) left = 0;
        if (!isFinite(top)) top = 0;
        if (!isFinite(width) || width <= 0) width = 1;
        if (!isFinite(height) || height <= 0) height = 1;

        return { left: left, top: top, width: width, height: height };
      }

      function getPanelLocalCursorPosition(panel) {
        if (!isValidPanel(panel)) return null;

        var bounds = getPanelBounds(panel);
        var panelPos = getPanelWindowPosition(panel);

        try {
          if (typeof panel.GetCursorPosition === "function") {
            var rawPoint = parsePoint(panel.GetCursorPosition());
            if (rawPoint) {
              var looksLocal =
                rawPoint.x >= 0 && rawPoint.x <= bounds.width &&
                rawPoint.y >= 0 && rawPoint.y <= bounds.height;

              if (looksLocal) {
                return rawPoint;
              }

              if (panelPos) {
                return {
                  x: rawPoint.x - panelPos.x,
                  y: rawPoint.y - panelPos.y
                };
              }

              return rawPoint;
            }
          }
        } catch (e) {}

        var screenCursor = getCursorPosition();
        if (!screenCursor || !panelPos) return null;

        return {
          x: screenCursor.x - panelPos.x,
          y: screenCursor.y - panelPos.y
        };
      }

      function getBoxStateFromColor(colorCode) {
        var rgb = hexToRgbLocal(colorCode);
        var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        return {
          hue: Math.round(hsv[0]) % 360,
          sat: clamp01(hsv[1]),
          val: clamp01(hsv[2])
        };
      }

      function normalizeBoxState(boxState, fallbackColorCode) {
        var fallback = getBoxStateFromColor(fallbackColorCode || currentColor);
        if (!boxState) {
          return fallback;
        }

        var hue = Number(boxState.hue);
        var sat = Number(boxState.sat);
        var val = (boxState.val !== undefined) ? Number(boxState.val) : pickerBoxVal;
        if (!isFinite(hue)) hue = fallback.hue;
        if (!isFinite(sat)) sat = fallback.sat;
        if (!isFinite(val)) val = (fallback.val !== undefined ? fallback.val : 1);

        hue = Math.round(hue) % 360;
        if (hue < 0) hue += 360;
        sat = clamp01(sat);
        val = clamp01(val);

        return { hue: hue, sat: sat, val: val };
      }

      function setPickerBoxState(boxState, fallbackColorCode) {
        var resolved = normalizeBoxState(boxState, fallbackColorCode);
        pickerBoxHue = resolved.hue;
        pickerBoxSat = resolved.sat;
        pickerBoxVal = resolved.val !== undefined ? resolved.val : pickerBoxVal;
        return resolved;
      }

      function colorFromBoxState(hue, sat) {
        return hsvToHex(hue, sat, pickerBoxVal);
      }

      function hueFromRelX(relX) {
        var normalized = clamp01(relX);
        return Math.max(0, Math.min(359, Math.round(normalized * 359)));
      }

      function hueToSliderPercent(hue) {
        var nextHue = Number(hue);
        if (!isFinite(nextHue)) nextHue = 0;
        nextHue = Math.max(0, Math.min(359, Math.round(nextHue)));
        return Math.round((nextHue / 359) * 100);
      }

      function normalizeHexColor(colorCode) {
        if (!colorCode) return "#FFFFFF";

        if (typeof colorCode === "number") {
          var packed = Math.max(0, Math.floor(colorCode));
          var packedHex = packed.toString(16).toUpperCase();
          while (packedHex.length < 6) packedHex = "0" + packedHex;
          return "#" + packedHex.slice(-6);
        }

        if (typeof colorCode === "string") {
          var text = String(colorCode).trim();
          if (!text) return "#FFFFFF";
          if (text.charAt(0) === "#") {
            var hex = text.slice(1);
            if (hex.length === 3) {
              hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            if (hex.length >= 6) {
              return "#" + hex.slice(0, 6).toUpperCase();
            }
          }

          var rgbMatch = text.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
          if (rgbMatch) {
            return rgbToHex(rgbMatch[1], rgbMatch[2], rgbMatch[3]).toUpperCase();
          }
        }

        if (typeof colorCode === "object") {
          if (colorCode.hex !== undefined) {
            return normalizeHexColor(colorCode.hex);
          }
          if (colorCode.h !== undefined && colorCode.s !== undefined && colorCode.v !== undefined) {
            return hsvToHex(colorCode.h, colorCode.s, colorCode.v);
          }
          if (colorCode.r !== undefined && colorCode.g !== undefined && colorCode.b !== undefined) {
            return rgbToHex(colorCode.r, colorCode.g, colorCode.b).toUpperCase();
          }
          if (colorCode.red !== undefined && colorCode.green !== undefined && colorCode.blue !== undefined) {
            return rgbToHex(colorCode.red, colorCode.green, colorCode.blue).toUpperCase();
          }
        }

        return "#FFFFFF";
      }

      function getColorBoxMetrics() {
        var refPanel = isValidPanel(colorBoxFrame) ? colorBoxFrame : colorBoxPanel;
        if (!isValidPanel(refPanel)) return null;

        var bounds = getPanelBounds(refPanel);
        var width = COLOR_BOX_LOGICAL_WIDTH;
        var height = COLOR_BOX_LOGICAL_HEIGHT;
        var cursorWidth = COLOR_BOX_CURSOR_LOGICAL_SIZE;
        var cursorHeight = COLOR_BOX_CURSOR_LOGICAL_SIZE;
        var screenWidth = Number(bounds.width || refPanel.actuallayoutwidth || width);
        var screenHeight = Number(bounds.height || refPanel.actuallayoutheight || height);

        if (!isFinite(width) || width <= 1) width = 260;
        if (!isFinite(height) || height <= 1) height = 200;
        if (!isFinite(cursorWidth) || cursorWidth <= 0) cursorWidth = 16;
        if (!isFinite(cursorHeight) || cursorHeight <= 0) cursorHeight = 16;
        if (!isFinite(screenWidth) || screenWidth <= 1) screenWidth = width;
        if (!isFinite(screenHeight) || screenHeight <= 1) screenHeight = height;

        return {
          panel: refPanel,
          bounds: { left: bounds.left, top: bounds.top, width: screenWidth, height: screenHeight },
          width: width,
          height: height,
          screenWidth: screenWidth,
          screenHeight: screenHeight,
          screenToLogicalX: width / screenWidth,
          screenToLogicalY: height / screenHeight,
          cursorWidth: cursorWidth,
          cursorHeight: cursorHeight,
          maxCursorX: Math.max(0, width - cursorWidth),
          maxCursorY: Math.max(0, height - cursorHeight)
        };
      }

      function clampColorBoxAnchor(metrics, cursorX, cursorY) {
        var nextX = Number(cursorX);
        var nextY = Number(cursorY);
        if (!isFinite(nextX)) nextX = 0;
        if (!isFinite(nextY)) nextY = 0;
        if (nextX < 0) nextX = 0;
        if (nextY < 0) nextY = 0;
        if (nextX > metrics.width) nextX = metrics.width;
        if (nextY > metrics.height) nextY = metrics.height;
        return { x: nextX, y: nextY };
      }

      function applyColorBoxCursorPosition(cursorX, cursorY) {
        if (!isValidPanel(colorBoxCursor)) return false;

        var metrics = getColorBoxMetrics();
        if (!metrics) return false;

        var point = clampColorBoxAnchor(metrics, cursorX, cursorY);
        colorDragAnchorX = point.x;
        colorDragAnchorY = point.y;

        var nextX = point.x - (metrics.cursorWidth * 0.5);
        var nextY = point.y - (metrics.cursorHeight * 0.5);
        if (nextX < 0) nextX = 0;
        if (nextY < 0) nextY = 0;
        if (nextX > metrics.maxCursorX) nextX = metrics.maxCursorX;
        if (nextY > metrics.maxCursorY) nextY = metrics.maxCursorY;

        colorBoxCursor.style.x = nextX + "px";
        colorBoxCursor.style.y = nextY + "px";
        colorBoxCursor.style.transform = "none";
        return true;
      }

      function rememberColorDragAnchor(cursorX, cursorY) {
        var metrics = getColorBoxMetrics();
        if (!metrics) return false;

        var point = clampColorBoxAnchor(metrics, cursorX, cursorY);
        colorDragAnchorX = point.x;
        colorDragAnchorY = point.y;
        return true;
      }

      function syncFromAnchoredCursorPosition(emitUpdateEvent) {
        var metrics = getColorBoxMetrics();
        if (!metrics) return false;
        if (!isFinite(colorDragAnchorX) || !isFinite(colorDragAnchorY) ||
            colorDragAnchorX < 0 || colorDragAnchorY < 0) {
          return false;
        }

        var point = clampColorBoxAnchor(metrics, colorDragAnchorX, colorDragAnchorY);
        var relX = metrics.width > 0 ? clamp01(point.x / metrics.width) : 0;
        var relY = metrics.height > 0 ? clamp01(point.y / metrics.height) : 0;
        var hue = hueFromRelX(relX);
        var sat = clamp01(relY);

        applyColorBoxCursorPosition(point.x, point.y);
        syncColorVisuals(colorFromBoxState(hue, sat), emitUpdateEvent, false, { hue: hue, sat: sat });
        return true;
      }

      function getCursorPositionWithinColorBox(updateAnchor) {
        if (!isValidPanel(colorBoxCursor)) return null;

        var metrics = getColorBoxMetrics();
        if (!metrics) return null;

        var cursorBounds = getPanelBounds(colorBoxCursor);
        var point = clampColorBoxAnchor(
          metrics,
          ((cursorBounds.left - metrics.bounds.left) * metrics.screenToLogicalX) + (metrics.cursorWidth * 0.5),
          ((cursorBounds.top - metrics.bounds.top) * metrics.screenToLogicalY) + (metrics.cursorHeight * 0.5)
        );
        if (updateAnchor !== false) rememberColorDragAnchor(point.x, point.y);

        return {
          metrics: metrics,
          x: point.x,
          y: point.y
        };
      }

      function updateBoxCursorVisual(colorCode) {
        if (!colorBoxPanel || !colorBoxPanel.IsValid || !colorBoxPanel.IsValid()) return;

        var metrics = getColorBoxMetrics();
        if (!metrics) return;

        if (!isFinite(pickerBoxHue) || !isFinite(pickerBoxSat)) {
          setPickerBoxState(null, colorCode);
        }

        var cursorX = metrics.width > 0 ? (pickerBoxHue / 359) * metrics.width : 0;
        var cursorY = metrics.height > 0 ? pickerBoxSat * metrics.height : 0;
        applyColorBoxCursorPosition(cursorX, cursorY);

        if (colorCode && isValidPanel(colorBoxCursor)) {
          var rgb = hexToRgbLocal(colorCode);
          var invR = 255 - (rgb[0] || 0);
          var invG = 255 - (rgb[1] || 0);
          var invB = 255 - (rgb[2] || 0);
          if (Math.abs(invR - 128) < 40 && Math.abs(invG - 128) < 40 && Math.abs(invB - 128) < 40) {
            var luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
            invR = invG = invB = luma > 128 ? 0 : 255;
          }
          colorBoxCursor.style.borderColor = "rgb(" + invR + "," + invG + "," + invB + ")";
        }
      }

      function syncFromCursorPanelPosition(emitUpdateEvent) {
        if (!isValidPanel(colorBoxPanel) || !isValidPanel(colorBoxCursor)) return false;

        var cursorPosition = getCursorPositionWithinColorBox();
        if (!cursorPosition) return false;

        const metrics = cursorPosition.metrics;
        const relX = metrics.width > 0 ? clamp01(cursorPosition.x / metrics.width) : 0;
        const relY = metrics.height > 0 ? clamp01(cursorPosition.y / metrics.height) : 0;
        const hue = hueFromRelX(relX);
        const sat = clamp01(relY);

        syncColorVisuals(colorFromBoxState(hue, sat), emitUpdateEvent, false, { hue: hue, sat: sat });
        return true;
      }

      function resetNativeDragCorrection() {
        nativeDragStartAnchorX = colorDragAnchorX;
        nativeDragStartAnchorY = colorDragAnchorY;
        nativeDragOffsetX = 0;
        nativeDragOffsetY = 0;
        nativeDragHasSample = false;
        nativeDragAxis = "";
      }

      function clearNativeDragCorrection() {
        nativeDragStartAnchorX = -1;
        nativeDragStartAnchorY = -1;
        nativeDragOffsetX = 0;
        nativeDragOffsetY = 0;
        nativeDragHasSample = false;
        nativeDragAxis = "";
      }

      function syncFromNativeDragPanelPosition(emitUpdateEvent) {
        if (!isValidPanel(colorBoxPanel) || !isValidPanel(colorBoxCursor)) return false;

        var cursorPosition = getCursorPositionWithinColorBox(false);
        if (!cursorPosition) return false;

        var startX = isFinite(nativeDragStartAnchorX) && nativeDragStartAnchorX >= 0 ? nativeDragStartAnchorX : colorDragAnchorX;
        var startY = isFinite(nativeDragStartAnchorY) && nativeDragStartAnchorY >= 0 ? nativeDragStartAnchorY : colorDragAnchorY;
        if (!nativeDragHasSample) {
          nativeDragHasSample = true;
          var deltaX = isFinite(startX) && startX >= 0 ? cursorPosition.x - startX : 0;
          var deltaY = isFinite(startY) && startY >= 0 ? cursorPosition.y - startY : 0;
          nativeDragOffsetX = deltaX;
          nativeDragOffsetY = deltaY;
          nativeDragAxis = "first_sample_anchor";
        }

        var correctedX = cursorPosition.x - nativeDragOffsetX;
        var correctedY = cursorPosition.y - nativeDragOffsetY;
        return syncFromBoxPosition(correctedX, correctedY, emitUpdateEvent);
      }

      function syncFromBoxPosition(boxX, boxY, emitUpdateEvent) {
        if (!isValidPanel(colorBoxPanel)) return false;

        const metrics = getColorBoxMetrics();
        if (!metrics) return false;
        const point = clampColorBoxAnchor(metrics, boxX, boxY);
        rememberColorDragAnchor(point.x, point.y);

        const relX = metrics.width > 0 ? clamp01(point.x / metrics.width) : 0;
        const relY = metrics.height > 0 ? clamp01(point.y / metrics.height) : 0;
        const hue = hueFromRelX(relX);
        const sat = clamp01(relY);
        syncColorVisuals(colorFromBoxState(hue, sat), emitUpdateEvent, false, { hue: hue, sat: sat });
        return true;
      }

      function syncPickerFromPointer(emitUpdateEvent) {
        var metrics = getColorBoxMetrics();
        if (!metrics) return false;

        var point = null;
        if (hasGameUI) {
          var screenCursor = getCursorPosition();
          if (screenCursor) {
            point = {
              x: (screenCursor.x - metrics.bounds.left) * metrics.screenToLogicalX,
              y: (screenCursor.y - metrics.bounds.top) * metrics.screenToLogicalY
            };
          }
        }

        if (!point) {
          point = getPanelLocalCursorPosition(colorBoxFrame);
        }
        if (!point) {
          point = getPanelLocalCursorPosition(colorBoxPanel);
        }
        if (!point) return false;

        return syncFromBoxPosition(point.x, point.y, emitUpdateEvent);
      }

      function syncFromScreenCursorPosition(emitUpdateEvent) {
        var cursor = getCursorPosition();
        if (!cursor || !isValidPanel(colorBoxPanel)) return false;

        const metrics = getColorBoxMetrics();
        if (!metrics) return false;
        return syncFromBoxPosition(
          (cursor.x - metrics.bounds.left) * metrics.screenToLogicalX,
          (cursor.y - metrics.bounds.top) * metrics.screenToLogicalY,
          emitUpdateEvent
        );
      }

      function syncFromLocalBoxCursor(emitUpdateEvent) {
        var localPoint = getPanelLocalCursorPosition(colorBoxPanel);
        if (!localPoint) return false;
        return syncFromBoxPosition(localPoint.x, localPoint.y, emitUpdateEvent);
      }

      function syncFromBestDragSource(emitUpdateEvent) {
        var chosen = "";
        if ((colorDragSource === "cursor" || colorDragSource === "drag_event" ||
            colorDragSource === "box" || colorDragSource === "gameui") &&
            syncPickerFromPointer(emitUpdateEvent)) {
          chosen = hasGameUI ? "screen_cursor" : "panel_pointer";
        }
        if (!hasGameUI) {
          if (!chosen && colorDragSource === "drag_event" &&
              syncFromNativeDragPanelPosition(emitUpdateEvent)) chosen = "native_drag_panel";
          else if (!chosen && (colorDragSource === "cursor" || colorDragSource === "cursor_down") &&
              syncFromLocalBoxCursor(emitUpdateEvent)) chosen = "panel_cursor";
          else if (!chosen && syncFromLocalBoxCursor(emitUpdateEvent)) chosen = "panel_cursor";
          else if (!chosen && syncFromAnchoredCursorPosition(emitUpdateEvent)) chosen = "anchored";
          else if (!chosen && syncFromCursorPanelPosition(emitUpdateEvent)) chosen = "cursor_panel";
          return chosen;
        }

        if (!chosen && (colorDragSource === "cursor" || colorDragSource === "drag_event" ||
            colorDragSource === "box" || colorDragSource === "gameui") &&
            syncPickerFromPointer(emitUpdateEvent)) chosen = "screen_cursor";
        else if (!chosen && (colorDragSource === "box" || colorDragSource === "gameui") &&
            syncFromScreenCursorPosition(emitUpdateEvent)) chosen = "screen_cursor";
        else if (!chosen && syncFromLocalBoxCursor(emitUpdateEvent)) chosen = "panel_cursor";
        else if (!chosen && syncFromAnchoredCursorPosition(emitUpdateEvent)) chosen = "anchored";
        else if (!chosen && syncFromScreenCursorPosition(emitUpdateEvent)) chosen = "screen_cursor";
        else if (!chosen && syncFromCursorPanelPosition(emitUpdateEvent)) chosen = "drag_panel";
        return chosen;
      }

      function setMouseCaptureState(active) {
        var next = !!active;
        if (isValidPanel(colorBoxPanel) && typeof colorBoxPanel.SetMouseCapture === "function") {
          try {
            colorBoxPanel.SetMouseCapture(next);
          } catch (e) {}
        }
        if (hasGameUI && isValidPanel(colorBoxCursor) && typeof colorBoxCursor.SetMouseCapture === "function") {
          try {
            colorBoxCursor.SetMouseCapture(next);
          } catch (e) {}
        }
      }

      function emitColorPickerUpdate(finalEmit) {
        if (!config.id || !modTitle) return;
        if (colorDragging && !finalEmit) {
          emitUpdateThrottled(modTitle, config.id, currentColor, { update_source: "ui_color_drag" }, 0.10);
        } else {
          if (finalEmit) cancelThrottledEmit(modTitle, config.id);
          emitUpdate(modTitle, config.id, currentColor, finalEmit ? { update_source: "ui_color_drag_final" } : null);
        }
      }

      function beginColorDrag(sourceName, emitUpdateEvent) {
        colorDragging = true;
        colorDragSource = String(sourceName || "");
        if (colorDragSource === "drag_event") resetNativeDragCorrection();
        else clearNativeDragCorrection();
        var usesCursorDrag = (colorDragSource === "cursor" || colorDragSource === "drag_event");
        if (!syncPickerFromPointer(false) && !usesCursorDrag && !syncFromCursorPanelPosition(false)) {
          updateBoxCursorVisual(currentColor);
        }
        if (emitUpdateEvent) {
          if (usesCursorDrag) {
            if (!syncPickerFromPointer(true)) {
              syncFromBestDragSource(true);
            }
          } else if (!syncFromScreenCursorPosition(true) && !syncFromLocalBoxCursor(true)) {
            syncFromCursorPanelPosition(true);
          }
        }
        setMouseCaptureState(true);
        startPickerPolling();
      }

      function endColorDrag() {
        if (!colorDragging && !colorDragSource) return;
        colorDragging = false;
        colorDragSource = "";
        clearNativeDragCorrection();
        setMouseCaptureState(false);
        emitColorPickerUpdate(true);
      }

      function stopPickerPolling() {
        colorPickerPollGeneration++;
      }

      function startPickerPolling() {
        if (!colorPopupPanel || !colorPopupPanel.IsValid || !colorPopupPanel.IsValid()) return;

        const generation = ++colorPickerPollGeneration;
        function tick() {
          if (generation !== colorPickerPollGeneration) return;
          if (!colorPopupPanel || !colorPopupPanel.IsValid || !colorPopupPanel.IsValid()) return;

          if (colorDragging) {
            syncFromBestDragSource(true);
            $.Schedule(0.016, tick);
          }
        }

        if (colorDragging) $.Schedule(0.016, tick);
      }

      function syncFromCursorPosition(emitUpdateEvent) {
        if (!syncPickerFromPointer(emitUpdateEvent)) syncFromAnchoredCursorPosition(emitUpdateEvent);
      }

      function closePalette() {
        stopPickerPolling();
        endColorDrag();

        if (hasGameUI && typeof GameUI.SetMouseCallback === "function") {
          try {
            GameUI.SetMouseCallback(null);
          } catch (e) {}
        }

        if (colorPopupPanel && colorPopupPanel.IsValid && colorPopupPanel.IsValid()) {
          colorPopupPanel.DeleteAsync(0);
        }

        colorPopupPanel = null;
        colorBoxFrame = null;
        colorBoxPanel = null;
        colorBoxCursor = null;
        popupPreview = null;
        popupHexLabel = null;
        popupMetaLabel = null;
        colorPickerSyncing = false;
        pickerHueSlider = null;
        pickerSatSlider = null;
        pickerSatTrack = null;
        pickerHueValue = null;
        pickerSatValue = null;
        pickerValSlider = null;
        pickerValValue = null;
        pickerValTrack = null;
        colorDragSource = "";
        if (AnitaRenderer.activeColorPickerClose === closePalette) {
          AnitaRenderer.activeColorPickerClose = null;
        }
      }

      function syncColorVisuals(colorCode, emitUpdateEvent, closeAfter, boxState) {
        var nextColor = normalizeHexColor(colorCode);
        if (nextColor === currentColor && !boxState) {
          if (emitUpdateEvent) {
            emitColorPickerUpdate(false);
            if (config.onChange) config.onChange(currentColor);
          }
          if (closeAfter) closePalette();
          return;
        }
        currentColor = nextColor;
        config.currentValue = currentColor;
        var pickerState = setPickerBoxState(boxState, currentColor);

        if (colorPreview && colorPreview.IsValid && colorPreview.IsValid()) {
          colorPreview.style.backgroundColor = currentColor;
        }

        if (rowHexLabel) {
          rowHexLabel.text = currentColor;
        }

        if (popupPreview && popupPreview.IsValid && popupPreview.IsValid()) {
          popupPreview.style.backgroundColor = currentColor;
        }

        if (popupHexLabel) {
          popupHexLabel.text = currentColor;
        }

        if (popupMetaLabel) {
          popupMetaLabel.text = "Hue " + pickerState.hue + "\u00B0 | Sat " + Math.round(pickerState.sat * 100) + "% | Val " + Math.round(pickerBoxVal * 100) + "%";
        }

        if (!colorPreviewBtn || !colorPreviewBtn.IsValid()) {
          colorPreviewBtn = row.FindChildTraverse("ColorPreviewBtn");
        }
        if (colorPreviewBtn) colorPreviewBtn.style.backgroundColor = currentColor;

        updateBoxCursorVisual(currentColor);

        colorPickerSyncing = true;
        try {
          if (pickerHueSlider && pickerHueSlider.IsValid && pickerHueSlider.IsValid()) {
            var hueSliderPct = hueToSliderPercent(pickerState.hue);
            if (Math.round(Number(pickerHueSlider.value)) !== hueSliderPct) {
              try {
                pickerHueSlider.value = hueSliderPct;
              } catch (e) {}
            }
            if (pickerHueValue) pickerHueValue.text = pickerState.hue + "\u00B0";
          }
          if (pickerSatSlider && pickerSatSlider.IsValid && pickerSatSlider.IsValid()) {
            var satPct = Math.round(pickerState.sat * 100);
            if (Math.round(Number(pickerSatSlider.value)) !== satPct) {
              try {
                pickerSatSlider.value = satPct;
              } catch (e) {}
            }
            if (pickerSatValue) pickerSatValue.text = satPct + "%";
            if (pickerSatTrack && pickerSatTrack.IsValid && pickerSatTrack.IsValid()) {
              pickerSatTrack.style.backgroundColor = "gradient( linear, 0% 0%, 100% 0%, from( #ffffff ), to( " + hsvToHex(pickerState.hue, 1, 1) + " ) )";
            }
          }
          if (pickerValSlider && pickerValSlider.IsValid && pickerValSlider.IsValid()) {
            var valPct = Math.round(pickerBoxVal * 100);
            if (Math.round(Number(pickerValSlider.value)) !== valPct) {
              try {
                pickerValSlider.value = valPct;
              } catch (e) {}
            }
            if (pickerValValue) pickerValValue.text = valPct + "%";
            if (pickerValTrack && pickerValTrack.IsValid && pickerValTrack.IsValid()) {
              pickerValTrack.style.backgroundColor = "gradient( linear, 0% 0%, 100% 0%, from( #000000 ), to( " + hsvToHex(pickerState.hue, pickerState.sat, 1) + " ) )";
            }
          }
        } finally {
          colorPickerSyncing = false;
        }

        if (emitUpdateEvent) {
          emitColorPickerUpdate(false);
          if (config.onChange) config.onChange(currentColor);
        }

        if (closeAfter) closePalette();
      }

      function openPalette() {
        if (colorPopupPanel) {
          closePalette();
          return;
        }

        if (AnitaRenderer.activeColorPickerClose &&
            AnitaRenderer.activeColorPickerClose !== closePalette) {
          try {
            AnitaRenderer.activeColorPickerClose();
          } catch (closeErr) {
          }
        }

        var trueRoot = (isValidPanel(AnitaRenderer.mainWindow) && AnitaRenderer.mainWindow.GetParent) ? AnitaRenderer.mainWindow.GetParent() : $.GetContextPanel();
        if (!isValidPanel(trueRoot)) trueRoot = $.GetContextPanel();

        if (!isValidPanel(AnitaRenderer.popupHost) || AnitaRenderer.popupHost.GetParent() !== trueRoot) {
          if (isValidPanel(AnitaRenderer.popupHost)) {
            AnitaRenderer.popupHost.DeleteAsync(0);
          }
          AnitaRenderer.popupHost = $.CreatePanel("Panel", trueRoot, "AnitaUI_PopupHost");
          AnitaRenderer.popupHost.AddClass("AnitaPopupHost");
        }

        var colorPopupParent = isValidPanel(AnitaRenderer.popupHost) ? AnitaRenderer.popupHost : trueRoot;
        colorPopupParent.style.align = "left top";
        colorPopupParent.style.ignoreParentFlow = true;
        colorPopupParent.style.flowChildren = "none";
        colorPopupParent.style.overflow = "noclip";
        colorPopupParent.style.zIndex = "10050";
        colorPopupParent.hittest = false;
        colorPopupParent.hittestchildren = true;
        colorPopupParent.style.x = "0px";
        colorPopupParent.style.y = "0px";
        colorPopupParent.style.width = "100%";
        colorPopupParent.style.height = "100%";

        colorPopupPanel = $.CreatePanel("Panel", colorPopupParent, "");
        AnitaRenderer.activeColorPickerClose = closePalette;
        colorPopupPanel.AddClass("AnitaColorPopup");
        colorPopupPanel.style.align = "left top";
        colorPopupPanel.style.flowChildren = "down";
        colorPopupPanel.style.ignoreParentFlow = true;
        colorPopupPanel.style.transform = "none";
        colorPopupPanel.style.x = "0px";
        colorPopupPanel.style.y = "0px";
        colorPopupPanel.style.position = "-200% -200% 0px";
        colorPopupPanel.style.opacity = "0";
        colorPopupPanel.hittest = true;
        colorPopupPanel.hittestchildren = true;

        function positionColorPopup(attempt) {
          attempt = attempt || 0;
          try {
            var anchor = isValidPanel(preview) ? preview : parent;
            if (!isValidPanel(anchor) || !isValidPanel(colorPopupPanel) || !isValidPanel(colorPopupParent)) {
              return;
            }

            function getCumulativeOffset(panel) {
              var x = 0;
              var y = 0;
              var p = panel;
              while (p && p.IsValid && p.IsValid()) {
                x += Number(p.actualxoffset || 0);
                y += Number(p.actualyoffset || 0);
                p = p.GetParent ? p.GetParent() : null;
              }
              return { x: x, y: y };
            }

            var anchorOffset = getCumulativeOffset(anchor);
            var hostOffset = getCumulativeOffset(colorPopupParent);
            var relX = anchorOffset.x - hostOffset.x;
            var relY = anchorOffset.y - hostOffset.y;
            var anchorW = Number(anchor.actuallayoutwidth || anchor.contentwidth || 0);
            var anchorH = Number(anchor.actuallayoutheight || anchor.contentheight || 0);
            var popupW = Number(colorPopupPanel.actuallayoutwidth || colorPopupPanel.contentwidth || 0);
            var popupH = Number(colorPopupPanel.actuallayoutheight || colorPopupPanel.contentheight || 0);
            var hostW = Number(colorPopupParent.actuallayoutwidth || colorPopupParent.contentwidth || trueRoot.actuallayoutwidth || trueRoot.contentwidth || 0);
            var hostH = Number(colorPopupParent.actuallayoutheight || colorPopupParent.contentheight || trueRoot.actuallayoutheight || trueRoot.contentheight || 0);

            if ((hostW <= 1 || hostH <= 1 || anchorW <= 1 || anchorH <= 1 || popupW <= 1 || popupH <= 1) && attempt < 3) {
              $.Schedule(0.03, function () { positionColorPopup(attempt + 1); });
              return;
            }

            if (hostW <= 1) hostW = 2560;
            if (hostH <= 1) hostH = 1440;
            if (anchorW <= 1) anchorW = 40;
            if (anchorH <= 1) anchorH = 40;
            if (popupW <= 1) popupW = 300;
            if (popupH <= 1) popupH = 420;

            var gapPct = 0.5;
            var edgePct = 0.5;
            var popupWPct = (popupW / hostW) * 100;
            var popupHPct = (popupH / hostH) * 100;
            var xPct = ((relX + anchorW) / hostW) * 100 + gapPct;
            if (xPct + popupWPct > 100 - edgePct) {
              xPct = ((relX - popupW) / hostW) * 100 - gapPct;
            }
            xPct = Math.max(edgePct, Math.min(xPct, 100 - popupWPct - edgePct));

            var yPct = ((relY + anchorH * 0.5 - popupH * 0.5) / hostH) * 100;
            yPct = Math.max(edgePct, Math.min(yPct, 100 - popupHPct - edgePct));

            colorPopupPanel.style.position = xPct.toFixed(2) + "% " + yPct.toFixed(2) + "% 0px";
            colorPopupPanel.style.opacity = "1";
          } catch (e) {
            colorPopupPanel.style.opacity = "1";
          }
        }

        colorPopupPanel.SetPanelEvent("oncancel", closePalette);

        const header = $.CreatePanel("Panel", colorPopupPanel, "");
        header.AddClass("AnitaColorPopupHeader");

        popupPreview = $.CreatePanel("Panel", header, "ColorPreviewBtn");
        popupPreview.AddClass("AnitaColorPickerPreview");
        popupPreview.AddClass("AnitaColorPopupPreview");
        popupPreview.style.backgroundColor = currentColor;

        popupHexLabel = $.CreatePanel("Label", header, "");
        popupHexLabel.AddClass("AnitaColorPopupHex");
        popupHexLabel.text = currentColor;

        popupMetaLabel = $.CreatePanel("Label", colorPopupPanel, "");
        popupMetaLabel.AddClass("AnitaColorPopupMeta");

        const hint = $.CreatePanel("Label", colorPopupPanel, "");
        hint.AddClass("AnitaColorPopupHint");
        hint.text = "Drag the marker or use the sliders below to change hue and saturation.";

        const boxWrap = $.CreatePanel("Panel", colorPopupPanel, "");
        boxWrap.AddClass("AnitaColorBoxWrap");

        colorBoxFrame = $.CreatePanel("Panel", boxWrap, "");
        colorBoxFrame.AddClass("AnitaColorBoxFrame");

        const boxHueLayer = $.CreatePanel("Panel", colorBoxFrame, "");
        boxHueLayer.AddClass("AnitaColorBoxHueLayer");

        const boxSaturationLayer = $.CreatePanel("Panel", colorBoxFrame, "");
        boxSaturationLayer.AddClass("AnitaColorBoxSaturationLayer");

        colorBoxPanel = $.CreatePanel("Panel", colorBoxFrame, "");
        colorBoxPanel.AddClass("AnitaColorBox");
        colorBoxPanel.hittest = true;
        colorBoxPanel.hittestchildren = true;
        colorBoxPanel.style.ignoreParentFlow = true;
        colorBoxPanel.style.width = "100%";
        colorBoxPanel.style.height = "100%";
        colorBoxPanel.SetPanelEvent("onmouseactivate", function () {
          if (!hasGameUI) {
            try {
              var movePt = getPanelLocalCursorPosition(colorBoxPanel);
              if (movePt) {
                syncFromBoxPosition(movePt.x, movePt.y, true);
              }
            } catch (e) {}
            return;
          }
          beginColorDrag("box", true);
        });
        colorBoxPanel.SetPanelEvent("onactivate", function () {
          if (!hasGameUI) return;
          beginColorDrag("box", true);
        });
        colorBoxPanel.SetPanelEvent("onmousedown", function () {
          if (hasGameUI) beginColorDrag("box_down", true);
        });
        colorBoxPanel.SetPanelEvent("onmousemove", function () {
          if (!colorDragging) return;
          if (!hasGameUI) {
            if (!syncPickerFromPointer(true)) {
              var movePt = getPanelLocalCursorPosition(colorBoxPanel);
              if (movePt) syncFromBoxPosition(movePt.x, movePt.y, true);
            }
            return;
          }
          if (!syncPickerFromPointer(true)) syncFromBestDragSource(true);
        });
        colorBoxPanel.SetPanelEvent("onmouseup", function () {
          endColorDrag();
        });
        colorBoxPanel.SetPanelEvent("onmouseout", function () {
          if (!colorDragging || hasGameUI || colorDragSource === "drag_event") return;
          endColorDrag();
        });

        colorBoxCursor = $.CreatePanel("Button", colorBoxFrame, "");
        colorBoxCursor.AddClass("AnitaColorBoxCursor");
        colorBoxCursor.hittest = true;
        colorBoxCursor.hittestchildren = false;
        colorBoxCursor.style.ignoreParentFlow = true;
        colorBoxCursor.style.align = "left top";
        colorBoxCursor.style.visibility = "visible";
        colorBoxCursor.style.opacity = "1";
        if (typeof colorBoxCursor.SetDraggable === "function") {
          try {
            colorBoxCursor.SetDraggable(!hasGameUI);
          } catch (e) {}
        }
        if (typeof colorBoxCursor.SetDisableFocusOnMouseDown === "function") {
          try {
            colorBoxCursor.SetDisableFocusOnMouseDown(true);
          } catch (e) {}
        }
        colorBoxCursor.SetPanelEvent("onmouseactivate", function () {
          beginColorDrag("cursor", true);
        });
        colorBoxCursor.SetPanelEvent("onactivate", function () {
          beginColorDrag("cursor", true);
        });
        colorBoxCursor.SetPanelEvent("onmousedown", function () {
          if (hasGameUI) beginColorDrag("cursor_down", true);
        });
        colorBoxCursor.SetPanelEvent("onmousemove", function () {
          if (!colorDragging) return;
          if (!syncPickerFromPointer(true)) syncFromBestDragSource(true);
        });
        colorBoxCursor.SetPanelEvent("onmouseup", function () {
          endColorDrag();
        });
        colorBoxCursor.SetPanelEvent("onmouseout", function () {
          if (!colorDragging || hasGameUI || colorDragSource === "drag_event") return;
          endColorDrag();
        });

        if (!hasGameUI && typeof $.RegisterEventHandler === "function") {
          try {
            $.RegisterEventHandler("DragStart", colorBoxCursor, function (panel, dragEvent) {
              if (!panel || panel !== colorBoxCursor) return;
              if (dragEvent) {
                dragEvent.displayPanel = colorBoxCursor;
                dragEvent.removePositionBeforeDrop = false;
              }
              colorBoxCursor.style.align = "left top";
              beginColorDrag("drag_event", false);
            });
          } catch (dragStartError) {
          }

          try {
            $.RegisterEventHandler("DragEnd", colorBoxCursor, function (_panel, droppedPanel) {
              if (droppedPanel && droppedPanel.IsValid && droppedPanel.IsValid() && droppedPanel === colorBoxCursor) {
                if (colorBoxFrame && colorBoxFrame.IsValid && colorBoxFrame.IsValid() &&
                    droppedPanel.GetParent && droppedPanel.GetParent() !== colorBoxFrame) {
                  droppedPanel.SetParent(colorBoxFrame);
                }
                droppedPanel.style.align = "left top";
                syncFromAnchoredCursorPosition(true);
              }
              endColorDrag();
            });
          } catch (dragEndError) {
          }
        }

        if (hasGameUI && typeof GameUI.SetMouseCallback === "function") {
          try {
            GameUI.SetMouseCallback(function (eventName, arg) {
              if (!colorPopupPanel || !colorPopupPanel.IsValid || !colorPopupPanel.IsValid()) {
                return false;
              }

              if (eventName === "pressed" && arg === 0) {
                const cursor = getCursorPosition();
                if (!cursor) return false;
                const metrics = getColorBoxMetrics();
                if (!metrics) return false;
                const bounds = metrics.bounds;
                const inside = cursor.x >= bounds.left && cursor.x <= (bounds.left + bounds.width) &&
                  cursor.y >= bounds.top && cursor.y <= (bounds.top + bounds.height);
                if (inside) {
                  syncFromCursorPosition(true);
                  beginColorDrag("gameui", false);
                  return true;
                }
              }

              if (colorDragging && eventName !== "pressed" && eventName !== "released") {
                syncPickerFromPointer(true);
                return true;
              }

              if (eventName === "released" && arg === 0 && colorDragging) {
                endColorDrag();
                return true;
              }

              return false;
            });
          } catch (e) {
          }
        }

        // Hue slider row
        var hueGroup = $.CreatePanel("Panel", colorPopupPanel, "");
        hueGroup.AddClass("AnitaHueSliderGroup");

        var hueLbl = $.CreatePanel("Label", hueGroup, "");
        hueLbl.text = "H";
        hueLbl.AddClass("AnitaHueValue");
        hueLbl.AddClass("AnitaPickerAxisLabel");

        var hueContainer = $.CreatePanel("Panel", hueGroup, "");
        hueContainer.AddClass("AnitaHueSliderContainer");
        hueContainer.AddClass("AnitaPickerSliderTrack");

        pickerHueSlider = $.CreatePanel("Slider", hueContainer, "", { direction: "horizontal" });
        pickerHueSlider.AddClass("AnitaHueSlider");
        pickerHueSlider.AddClass("HorizontalSlider");
        pickerHueSlider.min = 0;
        pickerHueSlider.max = 100;
        pickerHueSlider.increment = 1;
        if (typeof pickerHueSlider.SetShowDefaultValue === "function") { try { pickerHueSlider.SetShowDefaultValue(false); } catch (e) {} }
        if (typeof pickerHueSlider.SetRequiresSelection === "function") { try { pickerHueSlider.SetRequiresSelection(false); } catch (e) {} }

        pickerHueValue = $.CreatePanel("Label", hueGroup, "");
        pickerHueValue.AddClass("AnitaHueValue");
        pickerHueValue.AddClass("AnitaPickerReadout");

        pickerHueSlider.SetPanelEvent("onvaluechanged", function () {
          if (colorPickerSyncing) return;
          var h = hueFromRelX(clamp01(Number(pickerHueSlider.value) / 100));
          var newColor = colorFromBoxState(h, pickerBoxSat);
          if (pickerHueValue) pickerHueValue.text = h + "\u00B0";
          if (pickerSatTrack && pickerSatTrack.IsValid && pickerSatTrack.IsValid()) {
            pickerSatTrack.style.backgroundColor = "gradient( linear, 0% 0%, 100% 0%, from( #ffffff ), to( " + hsvToHex(h, 1, 1) + " ) )";
          }
          if (pickerValTrack && pickerValTrack.IsValid && pickerValTrack.IsValid()) {
            pickerValTrack.style.backgroundColor = "gradient( linear, 0% 0%, 100% 0%, from( #000000 ), to( " + hsvToHex(h, pickerBoxSat, 1) + " ) )";
          }
          syncColorVisuals(newColor, true, false, { hue: h, sat: pickerBoxSat });
        });

        // Saturation slider row
        var satGroup = $.CreatePanel("Panel", colorPopupPanel, "");
        satGroup.AddClass("AnitaHueSliderGroup");

        var satLbl = $.CreatePanel("Label", satGroup, "");
        satLbl.text = "S";
        satLbl.AddClass("AnitaHueValue");
        satLbl.AddClass("AnitaPickerAxisLabel");

        pickerSatTrack = $.CreatePanel("Panel", satGroup, "");
        pickerSatTrack.AddClass("AnitaSatSliderContainer");
        pickerSatTrack.AddClass("AnitaPickerSliderTrack");

        pickerSatSlider = $.CreatePanel("Slider", pickerSatTrack, "", { direction: "horizontal" });
        pickerSatSlider.AddClass("AnitaHueSlider");
        pickerSatSlider.AddClass("HorizontalSlider");
        pickerSatSlider.min = 0;
        pickerSatSlider.max = 100;
        pickerSatSlider.increment = 1;
        if (typeof pickerSatSlider.SetShowDefaultValue === "function") { try { pickerSatSlider.SetShowDefaultValue(false); } catch (e) {} }
        if (typeof pickerSatSlider.SetRequiresSelection === "function") { try { pickerSatSlider.SetRequiresSelection(false); } catch (e) {} }

        pickerSatValue = $.CreatePanel("Label", satGroup, "");
        pickerSatValue.AddClass("AnitaHueValue");
        pickerSatValue.AddClass("AnitaPickerReadout");

        pickerSatSlider.SetPanelEvent("onvaluechanged", function () {
          if (colorPickerSyncing) return;
          var s = clamp01(pickerSatSlider.value / 100);
          var newColor2 = colorFromBoxState(pickerBoxHue, s);
          if (pickerSatValue) pickerSatValue.text = Math.round(s * 100) + "%";
          syncColorVisuals(newColor2, true, false, { hue: pickerBoxHue, sat: s });
        });

        // Brightness (Value) slider row
        var valGroup = $.CreatePanel("Panel", colorPopupPanel, "");
        valGroup.AddClass("AnitaHueSliderGroup");

        var valLbl = $.CreatePanel("Label", valGroup, "");
        valLbl.text = "V";
        valLbl.AddClass("AnitaHueValue");
        valLbl.AddClass("AnitaPickerAxisLabel");

        pickerValTrack = $.CreatePanel("Panel", valGroup, "");
        pickerValTrack.AddClass("AnitaSatSliderContainer");
        pickerValTrack.AddClass("AnitaPickerSliderTrack");

        pickerValSlider = $.CreatePanel("Slider", pickerValTrack, "", { direction: "horizontal" });
        pickerValSlider.AddClass("AnitaHueSlider");
        pickerValSlider.AddClass("HorizontalSlider");
        pickerValSlider.min = 0;
        pickerValSlider.max = 100;
        pickerValSlider.increment = 1;
        if (typeof pickerValSlider.SetShowDefaultValue === "function") { try { pickerValSlider.SetShowDefaultValue(false); } catch (e) {} }
        if (typeof pickerValSlider.SetRequiresSelection === "function") { try { pickerValSlider.SetRequiresSelection(false); } catch (e) {} }

        pickerValValue = $.CreatePanel("Label", valGroup, "");
        pickerValValue.AddClass("AnitaHueValue");
        pickerValValue.AddClass("AnitaPickerReadout");

        pickerValSlider.SetPanelEvent("onvaluechanged", function () {
          if (colorPickerSyncing) return;
          var v = clamp01(pickerValSlider.value / 100);
          pickerBoxVal = v;
          var newColor3 = colorFromBoxState(pickerBoxHue, pickerBoxSat);
          if (pickerValValue) pickerValValue.text = Math.round(v * 100) + "%";
          syncColorVisuals(newColor3, true, false, { hue: pickerBoxHue, sat: pickerBoxSat, val: v });
        });

        const footer = $.CreatePanel("Panel", colorPopupPanel, "");
        footer.AddClass("AnitaColorPopupFooter");

        const closeBtn = $.CreatePanel("Button", footer, "");
        closeBtn.AddClass("AnitaColorPopupBtn");
        const closeLbl = $.CreatePanel("Label", closeBtn, "");
        closeLbl.text = "Close";
        closeBtn.SetPanelEvent("onactivate", closePalette);

        const initState = getBoxStateFromColor(currentColor);
        syncColorVisuals(currentColor, false, false, initState);
        positionColorPopup(0);
        $.Schedule(0.0, function () {
          if (colorPopupPanel && colorPopupPanel.IsValid && colorPopupPanel.IsValid()) {
            positionColorPopup(0);
            syncColorVisuals(currentColor, false, false, initState);
          }
        });
      }

      const preview = $.CreatePanel("Panel", row, "ColorPreviewBtn");
      preview.AddClass("AnitaColorPickerPreview");
      preview.style.backgroundColor = currentColor;
      preview.style.marginRight = "6px";
      preview.SetPanelEvent("onactivate", () => openPalette());
      colorPreview = preview;

      rowHexLabel = $.CreatePanel("Label", row, "");
      rowHexLabel.AddClass("AnitaColorHexValue");
      rowHexLabel.text = currentColor;

      return row;
    },

    createPositionPicker: function (parent, config, modTitle) {
      const row = $.CreatePanel("Panel", parent, "");
      row.AddClass("AnitaRow");
      row.AddClass("AnitaSliderRow");
      row.style.overflow = "noclip";
      row.style.width = "100%";

      const lbl = $.CreatePanel("Label", row, "");
      lbl.text = config.label || "Position";
      lbl.AddClass("AnitaLabel");

      function posPickerClamp(value) {
        var next = Number(value);
        if (!isFinite(next)) next = 0;
        if (config && (config.id === "hp_counter_position" || config.id === "hp_pulse_text_position")) {
          if (next < -50) next = -50;
        } else if (next < 0) {
          next = 0;
        }
        if (next > 400) next = 400;
        return Math.round(next);
      }

      function posPickerParse(candidate) {
        var x = 0;
        var y = 200;
        var raw = candidate;

        if (raw && typeof raw === "object") {
          if (Array.isArray(raw)) {
            if (raw.length > 0) x = posPickerClamp(raw[0]);
            if (raw.length > 1) y = posPickerClamp(raw[1]);
          } else {
            if (Object.prototype.hasOwnProperty.call(raw, "x")) x = posPickerClamp(raw.x);
            if (Object.prototype.hasOwnProperty.call(raw, "y")) y = posPickerClamp(raw.y);
          }
          return { x: x, y: y };
        }

        if (typeof raw === "string") {
          var parts = raw.match(/-?\d+(?:\.\d+)?/g);
          if (parts && parts.length > 0) {
            x = posPickerClamp(parts[0]);
            if (parts.length > 1) y = posPickerClamp(parts[1]);
            return { x: x, y: y };
          }
        }

        if (typeof raw === "number") {
          y = posPickerClamp(raw);
          return { x: x, y: y };
        }

        return { x: x, y: y };
      }

      function posPickerNormalize(candidate) {
        var parsed = posPickerParse(candidate);
        return {
          x: posPickerClamp(parsed.x),
          y: posPickerClamp(parsed.y)
        };
      }

      function posPickerFormat(pos) {
        var parsed = posPickerNormalize(pos);
        return Math.round(parsed.x) + "," + Math.round(parsed.y);
      }

      function posPickerPercent(pos) {
        var parsed = posPickerNormalize(pos);
        return Math.round(parsed.x / 4);
      }

      let posPickerCurrent = posPickerNormalize((config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || "0,200"));
      let posPickerSyncing = false;
      const posPickerValueGroup = $.CreatePanel("Panel", row, "");
      posPickerValueGroup.AddClass("AnitaSliderValueGroup");
      posPickerValueGroup.AddClass("SliderValueGroup");
      posPickerValueGroup.AddClass("AnitaPositionPickerGroup");
      posPickerValueGroup.style.flowChildren = "down";
      posPickerValueGroup.style.verticalAlign = "center";
      posPickerValueGroup.style.horizontalAlign = "left";
      posPickerValueGroup.style.width = "332px";
      posPickerValueGroup.style.overflow = "noclip";

      const posPickerXGroup = $.CreatePanel("Panel", posPickerValueGroup, "");
      posPickerXGroup.AddClass("AnitaHueSliderGroup");
      posPickerXGroup.AddClass("AnitaPositionSliderRow");
      posPickerXGroup.style.overflow = "noclip";

      const posPickerXLbl = $.CreatePanel("Label", posPickerXGroup, "");
      posPickerXLbl.text = "L/R";
      posPickerXLbl.AddClass("AnitaHueValue");
      posPickerXLbl.AddClass("AnitaPositionAxisLabel");

      const posPickerXContainer = $.CreatePanel("Panel", posPickerXGroup, "");
      posPickerXContainer.AddClass("AnitaSliderContainer");
      posPickerXContainer.AddClass("SliderContainer");
      posPickerXContainer.AddClass("AnitaPositionSliderContainer");
      posPickerXContainer.style.width = "230px";
      posPickerXContainer.style.height = "26px";
      posPickerXContainer.style.padding = "0px";
      posPickerXContainer.style.verticalAlign = "center";
      posPickerXContainer.style.overflow = "noclip";

      const posPickerXSlider = $.CreatePanel("Slider", posPickerXContainer, "", { direction: "horizontal" });
      posPickerXSlider.AddClass("AnitaSlider");
      posPickerXSlider.AddClass("HorizontalSlider");
      posPickerXSlider.style.width = "100%";
      posPickerXSlider.style.height = "100%";
      posPickerXSlider.style.verticalAlign = "center";
      posPickerXSlider.style.overflow = "noclip";
      posPickerXSlider.min = 0;
      posPickerXSlider.max = 400;
      posPickerXSlider.increment = 1;
      if (typeof posPickerXSlider.SetShowDefaultValue === "function") {
        try { posPickerXSlider.SetShowDefaultValue(false); } catch (e) {}
      }
      if (typeof posPickerXSlider.SetRequiresSelection === "function") {
        try { posPickerXSlider.SetRequiresSelection(false); } catch (e) {}
      }

      const posPickerXValueLbl = $.CreatePanel("Label", posPickerXGroup, "");
      posPickerXValueLbl.AddClass("AnitaSliderValue");
      posPickerXValueLbl.AddClass("AnitaPositionReadout");
      posPickerXValueLbl.style.textOverflow = "clip";
      posPickerXValueLbl.style.overflow = "noclip";

      const posPickerYGroup = $.CreatePanel("Panel", posPickerValueGroup, "");
      posPickerYGroup.AddClass("AnitaHueSliderGroup");
      posPickerYGroup.AddClass("AnitaPositionSliderRow");
      posPickerYGroup.style.overflow = "noclip";

      const posPickerYLbl = $.CreatePanel("Label", posPickerYGroup, "");
      posPickerYLbl.text = "T/B";
      posPickerYLbl.AddClass("AnitaHueValue");
      posPickerYLbl.AddClass("AnitaPositionAxisLabel");

      const posPickerYContainer = $.CreatePanel("Panel", posPickerYGroup, "");
      posPickerYContainer.AddClass("AnitaSliderContainer");
      posPickerYContainer.AddClass("SliderContainer");
      posPickerYContainer.AddClass("AnitaPositionSliderContainer");
      posPickerYContainer.style.width = "230px";
      posPickerYContainer.style.height = "26px";
      posPickerYContainer.style.padding = "0px";
      posPickerYContainer.style.verticalAlign = "center";
      posPickerYContainer.style.overflow = "noclip";

      const posPickerYSlider = $.CreatePanel("Slider", posPickerYContainer, "", { direction: "horizontal" });
      posPickerYSlider.AddClass("AnitaSlider");
      posPickerYSlider.AddClass("HorizontalSlider");
      posPickerYSlider.style.width = "100%";
      posPickerYSlider.style.height = "100%";
      posPickerYSlider.style.verticalAlign = "center";
      posPickerYSlider.style.overflow = "noclip";
      posPickerYSlider.min = (config && (config.id === "hp_counter_position" || config.id === "hp_pulse_text_position")) ? -50 : 0;
      posPickerYSlider.max = 400;
      posPickerYSlider.increment = 1;
      if (typeof posPickerYSlider.SetShowDefaultValue === "function") {
        try { posPickerYSlider.SetShowDefaultValue(false); } catch (e) {}
      }
      if (typeof posPickerYSlider.SetRequiresSelection === "function") {
        try { posPickerYSlider.SetRequiresSelection(false); } catch (e) {}
      }

      const posPickerYValueLbl = $.CreatePanel("Label", posPickerYGroup, "");
      posPickerYValueLbl.AddClass("AnitaSliderValue");
      posPickerYValueLbl.AddClass("AnitaPositionReadout");
      posPickerYValueLbl.style.textOverflow = "clip";
      posPickerYValueLbl.style.overflow = "noclip";

      function syncPosition(nextPos, emitUpdateEvent) {
        var normalized = posPickerNormalize(nextPos);
        var nextValue = posPickerFormat(normalized);
        var changed = String(config.currentValue || "") !== nextValue;
        posPickerCurrent = normalized;
        config.currentValue = nextValue;

        if (posPickerXSlider && posPickerXSlider.IsValid && posPickerXSlider.IsValid()) {
          if (Number(posPickerXSlider.value) !== normalized.x) {
            posPickerSyncing = true;
            try {
              if (typeof posPickerXSlider.SetValueNoEvents === "function") {
                posPickerXSlider.SetValueNoEvents(normalized.x);
              } else {
                posPickerXSlider.value = normalized.x;
              }
            } finally {
              posPickerSyncing = false;
            }
          }
        }

        if (posPickerYSlider && posPickerYSlider.IsValid && posPickerYSlider.IsValid()) {
          if (Number(posPickerYSlider.value) !== normalized.y) {
            posPickerSyncing = true;
            try {
              if (typeof posPickerYSlider.SetValueNoEvents === "function") {
                posPickerYSlider.SetValueNoEvents(normalized.y);
              } else {
                posPickerYSlider.value = normalized.y;
              }
            } finally {
              posPickerSyncing = false;
            }
          }
        }

        posPickerXValueLbl.text = posPickerPercent(normalized) + "%";
        posPickerYValueLbl.text = Math.round(normalized.y / 4) + "%";

        if (emitUpdateEvent && changed) {
          if (config.onChange) config.onChange(nextValue);
          if (config.id && modTitle) {
            emitUpdateThrottled(modTitle, config.id, nextValue, null, 0.04);
          }
        }
      }

      syncPosition(posPickerCurrent, false);

      posPickerXSlider.SetPanelEvent("onvaluechanged", function () {
        if (posPickerSyncing) return;
        syncPosition({ x: posPickerXSlider.value, y: posPickerCurrent.y }, true);
      });

      posPickerYSlider.SetPanelEvent("onvaluechanged", function () {
        if (posPickerSyncing) return;
        syncPosition({ x: posPickerCurrent.x, y: posPickerYSlider.value }, true);
      });

      posPickerXSlider.SetPanelEvent("oncancel", () => {
        AnitaRenderer.toggle(false);
      });
      posPickerYSlider.SetPanelEvent("oncancel", () => {
        AnitaRenderer.toggle(false);
      });

      return row;
    }
  };

  const AnitaRenderer = {
    mainWindow: null,
    backdrop: null,
    navBar: null,
    menuArea: null,
    contentArea: null,
    popupHost: null,
    activeModTitle: "",
    isOpen: false,
    activeColorPickerClose: null,
    activeHeroMenuClose: null,
    activeImportPopupClose: null,

    isHpColorsConfig: function (config) {
      return !!config &&
        config.title === "HP Colors" &&
        AnitaPersistence.normalizeNamespace(config.storageNamespace) === "hp_colors";
    },

    hasPresetBuilder: function (config) {
      return this.isHpColorsConfig(config);
    },

    isPresetBuilderCategory: function (category) {
      return String(category || "") === HP_PRESET_BUILDER_CATEGORY;
    },

    ensureConfigIndexes: function (config) {
      if (!config || !Array.isArray(config.elements)) return null;
      if (config.__anitaConfigIndexElementsRef === config.elements &&
          config.__anitaElementById &&
          config.__anitaVisibilityDependentsBySource) {
        return config;
      }

      var elementById = {};
      var dependentsBySource = {};
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        if (!element) continue;
        if (element.id && !Object.prototype.hasOwnProperty.call(elementById, element.id)) {
          elementById[element.id] = element;
        }
        if (!element.visibleWhen || !element.visibleWhen.id) continue;
        var sourceId = element.visibleWhen.id;
        if (!dependentsBySource[sourceId]) dependentsBySource[sourceId] = [];
        dependentsBySource[sourceId].push(element);
      }
      config.__anitaConfigIndexElementsRef = config.elements;
      config.__anitaElementById = elementById;
      config.__anitaVisibilityDependentsBySource = dependentsBySource;
      return config;
    },

    findElementById: function (config, elementId) {
      if (!config || !Array.isArray(config.elements) || !elementId) return null;
      this.ensureConfigIndexes(config);
      if (config.__anitaElementById &&
          Object.prototype.hasOwnProperty.call(config.__anitaElementById, elementId)) {
        return config.__anitaElementById[elementId];
      }
      return null;
    },

    isElementVisible: function (config, element) {
      if (element && element.runtimeHidden) return false;
      if (!element || !element.visibleWhen) return true;
      var rule = element.visibleWhen;
      var source = this.findElementById(config, rule.id);
      if (!source) return true;
      var current = source.currentValue;
      if (Array.isArray(rule.equals)) {
        for (var i = 0; i < rule.equals.length; i++) {
          if (current === rule.equals[i]) return true;
        }
        return false;
      }
      if (Object.prototype.hasOwnProperty.call(rule, "equals")) {
        return current === rule.equals;
      }
      return !!current;
    },

    applyElementVisibility: function (config, element) {
      if (!element || !element.__anitaRowPanel || !element.__anitaRowPanel.IsValid || !element.__anitaRowPanel.IsValid()) return;
      var visible = this.isElementVisible(config, element);
      element.__anitaRowPanel.style.visibility = visible ? "visible" : "collapse";
      element.__anitaRowPanel.hittest = visible;
    },

    refreshConditionalVisibility: function (config) {
      if (!config || !Array.isArray(config.elements)) return;
      this.ensureConfigIndexes(config);
      for (var i = 0; i < config.elements.length; i++) {
        this.applyElementVisibility(config, config.elements[i]);
      }
    },

    refreshDependentVisibility: function (config, sourceId) {
      if (!config || !Array.isArray(config.elements) || !sourceId) return false;
      this.ensureConfigIndexes(config);
      var dependents = config.__anitaVisibilityDependentsBySource &&
        config.__anitaVisibilityDependentsBySource[sourceId];
      if (!dependents || !dependents.length) return false;
      for (var i = 0; i < dependents.length; i++) {
        this.applyElementVisibility(config, dependents[i]);
      }
      return true;
    },

    refreshChangedDependentsVisibility: function (config, sourceIds) {
      if (!config || !Array.isArray(config.elements) || !sourceIds || !sourceIds.length) return false;
      this.ensureConfigIndexes(config);
      var seen = {};
      var refreshed = false;
      for (var i = 0; i < sourceIds.length; i++) {
        var sourceId = sourceIds[i];
        if (!sourceId) continue;
        var dependents = config.__anitaVisibilityDependentsBySource &&
          config.__anitaVisibilityDependentsBySource[sourceId];
        if (!dependents || !dependents.length) continue;
        for (var j = 0; j < dependents.length; j++) {
          var element = dependents[j];
          if (element && element.id) {
            if (seen[element.id]) continue;
            seen[element.id] = true;
          }
          this.applyElementVisibility(config, element);
          refreshed = true;
        }
      }
      return refreshed;
    },

    hasVisibilityDependents: function (config, sourceId) {
      if (!config || !Array.isArray(config.elements) || !sourceId) return false;
      this.ensureConfigIndexes(config);
      var dependents = config.__anitaVisibilityDependentsBySource &&
        config.__anitaVisibilityDependentsBySource[sourceId];
      return !!(dependents && dependents.length);
    },

    getElementCategory: function (element) {
      var label = String((element && element.category) || "General").trim();
      return label || "General";
    },

    ensureCategoryCache: function (config) {
      var emptyCache = {
        elementsRef: null,
        categories: [],
        groupedCategories: {},
        byCategory: {}
      };
      if (!config || !Array.isArray(config.elements)) return emptyCache;
      if (config.__anitaCategoryCache &&
          config.__anitaCategoryCache.elementsRef === config.elements) {
        return config.__anitaCategoryCache;
      }

      var categories = [];
      var seen = {};
      var groupedCategories = {};
      var byCategory = {};
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        var category = this.getElementCategory(element);
        if (!byCategory[category]) byCategory[category] = [];
        if (!this.isPresetBuilderCategory(category)) byCategory[category].push(element);
        if (seen[category]) continue;
        seen[category] = true;
        categories.push(category);
      }

      for (var c = 0; c < categories.length; c++) {
        var rawCat = categories[c];
        var parts = rawCat.split("|");
        var main = parts.length > 1 ? parts[0] : "General Options";
        var sub = parts.length > 1 ? parts[1] : rawCat;
        if (!groupedCategories[main]) groupedCategories[main] = [];
        groupedCategories[main].push({
          full: rawCat,
          sub: sub,
          count: this.isPresetBuilderCategory(rawCat) ? 0 : ((byCategory[rawCat] || []).length)
        });
      }

      config.__anitaCategoryCache = {
        elementsRef: config.elements,
        categories: categories,
        groupedCategories: groupedCategories,
        byCategory: byCategory
      };
      return config.__anitaCategoryCache;
    },

    getCategoryList: function (config) {
      return this.ensureCategoryCache(config).categories;
    },

    getCategoryElements: function (config, category) {
      if (this.isPresetBuilderCategory(category)) return [];
      var cache = this.ensureCategoryCache(config);
      return cache.byCategory[category] || [];
    },

    ensureActiveCategory: function (config) {
      var categories = this.getCategoryList(config);
      if (categories.length === 0) {
        config.__anitaActiveCategory = "";
        return "";
      }
      var active = String(config.__anitaActiveCategory || "");
      if (this.hasPresetBuilder(config) && this.isPresetBuilderCategory(active)) {
        return active;
      }
      for (var i = 0; i < categories.length; i++) {
        if (categories[i] === active) return active;
      }
      config.__anitaActiveCategory = categories[0];
      return categories[0];
    },

    getSaveCodeToken: function (config) {
      if (!config || !config.storageNamespace) return "";

      var raw = AnitaPersistence.buildStoredPayload(config);
      if (!raw) return "";

      var ns = AnitaPersistence.normalizeNamespace(config.storageNamespace);
      if (!ns) return "";

      return "[" + AnitaPersistence.TOKEN_PREFIX + ns + "]:" + AnitaBase64.encode(raw);
    },

    extractSaveCodeToken: function (config, text) {
      if (!config || !config.storageNamespace) return "";

      var body = String(text || "").trim();
      if (!body) return "";

      var ns = AnitaPersistence.normalizeNamespace(config.storageNamespace);
      if (!ns) return "";

      var scopedMatch = body.match(AnitaPersistence.getTokenRegex(ns));
      if (scopedMatch && scopedMatch[0]) return scopedMatch[0];

      var genericMatch = body.match(/\[ANITA-v1-[a-z0-9_]+\]:[A-Za-z0-9_-]+/i);
      if (genericMatch && genericMatch[0]) return genericMatch[0];

      if (/^[A-Za-z0-9_-]+$/.test(body)) {
        return "[" + AnitaPersistence.TOKEN_PREFIX + ns + "]:" + body;
      }

      return "";
    },

    parseImportCode: function (config, text) {
      var token = this.extractSaveCodeToken(config, text);
      if (!token) return { ok: false, status: "Invalid" };

      var encoded = token.split("]:")[1] || "";
      try {
        var raw = AnitaBase64.decode(encoded);
        var parsed = AnitaPersistence.parseStoredPayload(config, raw);
        if (!parsed) return { ok: false, status: "Invalid" };
        if (!parsed.values || !Object.keys(parsed.values).length) {
          return { ok: false, status: "No IDs" };
        }
        return {
          ok: true,
          status: "Imported",
          token: token,
          raw: raw,
          values: parsed.values,
          heroes: parsed.heroes || [],
          heroMode: parsed.heroMode || HP_HERO_SCOPE_OFF
        };
      } catch (eDec) {
        return { ok: false, status: "Invalid" };
      }
    },

    applyImportCode: function (config, text, source) {
      var parsed = this.parseImportCode(config, text);
      if (!parsed.ok) return parsed;

      AnitaPersistence.applyResolvedValues(config, parsed.values);
      AnitaPersistence.persistConfig(config, true);
      this.syncSaveCodeInput(config);
      AnitaCore.emitCurrentValues(config, {
        update_source: "ui_code_apply",
        import_source: String(source || "import"),
        force_persist: true,
        force_emit: true,
        bulk_emit: true
      });
      return { ok: true, status: "Imported" };
    },

    collectCurrentValues: function (config) {
      var values = {};
      if (!config || !Array.isArray(config.elements)) return values;
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        values[element.id] = AnitaPersistence.sanitizeValue(
          element,
          element.currentValue !== undefined ? element.currentValue : element.defaultValue
        );
      }
      return values;
    },

    isBuilderSupportedPresetElement: function (element) {
      return !!(element &&
        element.id &&
        Object.prototype.hasOwnProperty.call(HP_PRESET_BUILDER_SUPPORTED_IDS, element.id));
    },

    buildPresetPayloadValues: function (config, values) {
      var payloadValues = {};
      var elements = AnitaPersistence.getElements(config);
      var sourceValues = values || {};
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        if (this.isHpColorsConfig(config) && !this.isBuilderSupportedPresetElement(element)) continue;
        var hasValue = Object.prototype.hasOwnProperty.call(sourceValues, element.id);
        var value = AnitaPersistence.sanitizeValue(
          element,
          hasValue ? sourceValues[element.id] : element.defaultValue
        );
        var defaultValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
        if (this.isHpColorsConfig(config) && value === defaultValue) continue;
        payloadValues[this.isHpColorsConfig(config) ? (HP_PERSIST_ALIASES[element.id] || element.id) : element.id] = value;
      }
      return payloadValues;
    },

    buildPresetCodeToken: function (config, values, name, payloadValuesOverride, heroes, heroMode) {
      if (!config || !config.storageNamespace) return "";
      var ns = AnitaPersistence.normalizeNamespace(config.storageNamespace);
      if (!ns) return "";

      var payloadValues = payloadValuesOverride || this.buildPresetPayloadValues(config, values);
      var heroTargets = normalizeHpHeroSelection(heroes);
      var scopeMode = normalizeHpHeroScopeMode(heroMode, heroTargets);
      if (scopeMode !== HP_HERO_SCOPE_SELECTED) heroTargets = [];
      var rawPayload = this.isHpColorsConfig(config)
        ? { v: AnitaPersistence.getVersion(config), c: HP_COMPACT_PERSIST_VERSION, values: payloadValues }
        : { version: AnitaPersistence.getVersion(config), values: payloadValues };
      if (this.isHpColorsConfig(config)) rawPayload.hm = scopeMode;
      else rawPayload.heroMode = scopeMode;
      if (scopeMode === HP_HERO_SCOPE_SELECTED && heroTargets.length) {
        if (this.isHpColorsConfig(config)) rawPayload.hs = heroTargets;
        else rawPayload.heroes = heroTargets;
      }
      var presetName = String(name || "").replace(/^\s+|\s+$/g, "");
      if (presetName) rawPayload.name = presetName;
      var raw = JSON.stringify(rawPayload);
      return "[" + AnitaPersistence.TOKEN_PREFIX + ns + "]:" + AnitaBase64.encode(raw);
    },

    isPresetBundleRow: function (row) {
      return !!(row && row.values && row.key !== "current");
    },

    isUserPresetRow: function (row) {
      return !!(row && String(row.key || "").indexOf("user_") === 0);
    },

    getPresetBundleRows: function (rows) {
      var bundleRows = [];
      if (!Array.isArray(rows)) return bundleRows;
      for (var i = 0; i < rows.length; i++) {
        if (this.isPresetBundleRow(rows[i])) bundleRows.push(rows[i]);
      }
      return bundleRows;
    },

    getPresetPriorityIdentity: function (row) {
      if (!row) return "";
      if (row.id) return "id:" + String(row.id);
      return String(row.key || "");
    },

    getRemovedPresetRows: function (config) {
      if (!config.__anitaRemovedPresetRows) config.__anitaRemovedPresetRows = {};
      return config.__anitaRemovedPresetRows;
    },

    isPresetRowRemoved: function (config, row) {
      if (!config || !row) return false;
      var key = this.getPresetPriorityIdentity(row);
      return !!(key && config.__anitaRemovedPresetRows && config.__anitaRemovedPresetRows[key]);
    },

    cleanupPresetRowState: function (config, row, identity) {
      if (!config || !row) return;
      var key = String(row.key || "");
      var idKey = row.id ? ("id:" + String(row.id)) : "";
      if (config.__anitaPresetHeroSelections) {
        try { delete config.__anitaPresetHeroSelections[key]; } catch (eHeroKey) {}
        if (idKey) { try { delete config.__anitaPresetHeroSelections[idKey]; } catch (eHeroId) {} }
      }
      if (config.__anitaPresetHeroModes) {
        try { delete config.__anitaPresetHeroModes[key]; } catch (eModeKey) {}
        if (idKey) { try { delete config.__anitaPresetHeroModes[idKey]; } catch (eModeId) {} }
      }
      if (config.__anitaPresetNameOverrides) {
        try { delete config.__anitaPresetNameOverrides[key]; } catch (eNameKey) {}
        if (idKey) { try { delete config.__anitaPresetNameOverrides[idKey]; } catch (eNameId) {} }
      }
      if (Array.isArray(config.__anitaPresetPriorityOrder)) {
        var nextOrder = [];
        for (var i = 0; i < config.__anitaPresetPriorityOrder.length; i++) {
          var orderKey = String(config.__anitaPresetPriorityOrder[i] || "");
          if (orderKey && orderKey !== key && orderKey !== idKey && orderKey !== identity) nextOrder.push(orderKey);
        }
        config.__anitaPresetPriorityOrder = nextOrder;
      }
      if (config.__anitaSelectedPresetKey === key) config.__anitaSelectedPresetKey = "";
      if (config.__anitaEditingPresetNameKey === key) config.__anitaEditingPresetNameKey = "";
    },

    removePresetRow: function (config, row) {
      if (!config || !row || row.key === "current" || !this.isPresetBundleRow(row)) return false;
      var identity = this.getPresetPriorityIdentity(row);
      var userRows = this.getUserPresetRows(config);
      var removedUser = false;
      for (var i = userRows.length - 1; i >= 0; i--) {
        if (userRows[i] && userRows[i].key === row.key) {
          userRows.splice(i, 1);
          removedUser = true;
        }
      }
      if (!removedUser) {
        if (!identity) return false;
        this.getRemovedPresetRows(config)[identity] = true;
      }
      this.cleanupPresetRowState(config, row, identity);
      resetHpHeroPresetDetectionLock(config);
      invalidateHpHeroPresetApplyCache(config);
      startHpHeroPresetWatch(config);
      scheduleHpHeroPresetRefresh(config);
      return true;
    },

    applyPresetPriorityOrder: function (config, rows) {
      if (!config || !Array.isArray(rows) || !rows.length) return rows;
      var movable = [];
      var fixed = [];
      var byKey = {};
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (this.isPresetBundleRow(row)) {
          var key = this.getPresetPriorityIdentity(row);
          if (key) {
            movable.push(row);
            byKey[key] = row;
          }
        } else {
          fixed.push(row);
        }
      }
      if (!movable.length) return rows;

      var stored = Array.isArray(config.__anitaPresetPriorityOrder) ? config.__anitaPresetPriorityOrder : [];
      var order = [];
      var seen = {};
      for (var storedIndex = 0; storedIndex < stored.length; storedIndex++) {
        var storedKey = String(stored[storedIndex] || "");
        if (!storedKey || !byKey[storedKey] || seen[storedKey]) continue;
        seen[storedKey] = true;
        order.push(storedKey);
      }
      for (var moveIndex = 0; moveIndex < movable.length; moveIndex++) {
        var moveKey = this.getPresetPriorityIdentity(movable[moveIndex]);
        if (!moveKey || seen[moveKey]) continue;
        seen[moveKey] = true;
        order.push(moveKey);
      }
      config.__anitaPresetPriorityOrder = order;

      var sorted = [];
      for (var orderIndex = 0; orderIndex < order.length; orderIndex++) {
        var orderedRow = byKey[order[orderIndex]];
        if (orderedRow) sorted.push(orderedRow);
      }
      for (var fixedIndex = 0; fixedIndex < fixed.length; fixedIndex++) {
        sorted.push(fixed[fixedIndex]);
      }
      return sorted;
    },

    movePresetRowPriority: function (config, rows, row, delta) {
      if (!config || !Array.isArray(rows) || !row || !this.isPresetBundleRow(row)) return false;
      var ordered = this.applyPresetPriorityOrder(config, rows);
      var keys = [];
      for (var i = 0; i < ordered.length; i++) {
        if (!this.isPresetBundleRow(ordered[i])) continue;
        var key = this.getPresetPriorityIdentity(ordered[i]);
        if (key) keys.push(key);
      }
      var rowKey = this.getPresetPriorityIdentity(row);
      var index = keys.indexOf(rowKey);
      var nextIndex = index + (Number(delta) || 0);
      if (index < 0 || nextIndex < 0 || nextIndex >= keys.length) return false;
      var tmp = keys[index];
      keys[index] = keys[nextIndex];
      keys[nextIndex] = tmp;
      config.__anitaPresetPriorityOrder = keys;
      config.__anitaSelectedPresetKey = row.key;
      resetHpHeroPresetDetectionLock(config);
      invalidateHpHeroPresetApplyCache(config);
      startHpHeroPresetWatch(config);
      scheduleHpHeroPresetRefresh(config);
      return true;
    },

    buildPresetBundleCodeToken: function (config, rows) {
      if (!config || !Array.isArray(rows) || !rows.length) return "";

      var presets = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!this.isPresetBundleRow(row)) continue;
        var presetName = String(row.name || ("Preset " + String(i + 1))).replace(/^\s+|\s+$/g, "");
        var tuple = [
          presetName || ("Preset " + String(i + 1)),
          row.payloadValues || this.buildPresetPayloadValues(config, row.values)
        ];
        var heroTargets = normalizeHpHeroSelection(row.heroes);
        var scopeMode = normalizeHpHeroScopeMode(row.heroMode, heroTargets);
        if (scopeMode === HP_HERO_SCOPE_SELECTED && heroTargets.length) tuple.push(heroTargets);
        else tuple.push(scopeMode);
        presets.push(tuple);
      }
      if (!presets.length) return "";

      var payload = {
        v: AnitaPersistence.getVersion(config),
        p: presets
      };
      return AnitaBase64.encode(JSON.stringify(payload));
    },

    countPresetOverrides: function (config, values) {
      var count = 0;
      var elements = AnitaPersistence.getElements(config);
      var sourceValues = values || {};
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        if (!Object.prototype.hasOwnProperty.call(sourceValues, element.id)) continue;
        var value = AnitaPersistence.sanitizeValue(element, sourceValues[element.id]);
        var defaultValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
        if (value !== defaultValue) count += 1;
      }
      return count;
    },

    countBuilderPresetOverrides: function (config, values) {
      var count = 0;
      var elements = AnitaPersistence.getElements(config);
      var sourceValues = values || {};
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        if (!this.isBuilderSupportedPresetElement(element)) continue;
        if (!Object.prototype.hasOwnProperty.call(sourceValues, element.id)) continue;
        var value = AnitaPersistence.sanitizeValue(element, sourceValues[element.id]);
        var defaultValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
        if (value !== defaultValue) count += 1;
      }
      return count;
    },

    countUnsupportedPresetOverrides: function (config, values) {
      var count = 0;
      var elements = AnitaPersistence.getElements(config);
      var sourceValues = values || {};
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (!AnitaPersistence.shouldPersistElement(element)) continue;
        if (this.isBuilderSupportedPresetElement(element)) continue;
        if (!Object.prototype.hasOwnProperty.call(sourceValues, element.id)) continue;
        var value = AnitaPersistence.sanitizeValue(element, sourceValues[element.id]);
        var defaultValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
        if (value !== defaultValue) count += 1;
      }
      return count;
    },

    countPresetValues: function (values) {
      var count = 0;
      for (var key in values || {}) {
        if (Object.prototype.hasOwnProperty.call(values, key)) count += 1;
      }
      return count;
    },

    sanitizeUserPresetName: function (name, fallbackIndex) {
      var clean = String(name || "").replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
      if (clean.length > 34) clean = clean.substr(0, 34);
      if (clean) return clean;
      return "Game preset " + String(Math.max(1, Number(fallbackIndex) || 1));
    },

    sanitizePresetRenameName: function (name, fallbackName) {
      var clean = String(name || "").replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
      if (clean.length > 34) clean = clean.substr(0, 34);
      if (clean) return clean;
      return String(fallbackName || "").replace(/^\s+|\s+$/g, "") || "Game preset";
    },

    getUserPresetRows: function (config) {
      if (!config.__anitaUserPresetRows) config.__anitaUserPresetRows = [];
      return config.__anitaUserPresetRows;
    },

    getPresetNameOverride: function (config, key, id, fallbackName) {
      var overrides = config && config.__anitaPresetNameOverrides;
      if (!overrides) return fallbackName;
      var idKey = id ? ("id:" + String(id)) : "";
      if (idKey && Object.prototype.hasOwnProperty.call(overrides, idKey)) return overrides[idKey];
      if (key && Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
      return fallbackName;
    },

    setPresetRowName: function (config, row, name) {
      if (!config || !row || row.key === "current") return false;
      var clean = this.sanitizePresetRenameName(name, row.name);
      if (!clean || clean === row.name) return false;
      var userRows = this.getUserPresetRows(config);
      var changed = false;
      for (var i = 0; i < userRows.length; i++) {
        if (userRows[i] && userRows[i].key === row.key) {
          userRows[i].name = clean;
          changed = true;
          break;
        }
      }
      if (!changed) {
        if (!config.__anitaPresetNameOverrides) config.__anitaPresetNameOverrides = {};
        var overrideKey = row.id ? ("id:" + String(row.id)) : row.key;
        config.__anitaPresetNameOverrides[overrideKey] = clean;
        changed = true;
      }
      row.name = clean;
      row.token = this.buildPresetCodeToken(config, row.values || {}, row.name, row.payloadValues, row.heroes, row.heroMode);
      config.__anitaSelectedPresetKey = row.key;
      return changed;
    },

    addUserPresetFromCurrent: function (config, name) {
      if (!config) return null;
      var userRows = this.getUserPresetRows(config);
      var nextIndex = userRows.length + 1;
      var presetName = this.sanitizeUserPresetName(name, nextIndex);
      var currentValues = this.collectCurrentValues(config);
      var payloadValues = this.buildPresetPayloadValues(config, currentValues);
      var overrideCount = this.countBuilderPresetOverrides(config, currentValues);
      var omittedOverrides = this.countUnsupportedPresetOverrides(config, currentValues);
      var key = "user_" + String((Date.now ? Date.now() : +(new Date()))) + "_" + String(nextIndex);
      var row = {
        key: key,
        id: "",
        name: presetName,
        category: "Game preset",
        status: (overrideCount ? (String(overrideCount) + " builder override" + (overrideCount === 1 ? "" : "s")) : "Default builder values") +
          (omittedOverrides ? ("; " + String(omittedOverrides) + " live-only setting" + (omittedOverrides === 1 ? "" : "s") + " omitted") : ""),
        token: "",
        values: currentValues,
        payloadValues: payloadValues,
        heroes: [],
        heroMode: HP_HERO_SCOPE_OFF
      };
      row.token = this.buildPresetCodeToken(config, row.values, row.name, row.payloadValues, row.heroes, row.heroMode);
      userRows.push(row);
      config.__anitaSelectedPresetKey = row.key;
      return row;
    },

    getNextImportPresetName: function (config) {
      var nextIndex = 1;
      var rows = this.getUserPresetRows(config);
      for (var i = 0; i < rows.length; i++) {
        var match = String(rows[i].name || "").match(/^Import\s+(\d+)$/i);
        if (match) {
          var num = Number(match[1]);
          if (isFinite(num) && num >= nextIndex) nextIndex = num + 1;
        }
      }
      return "Import " + String(nextIndex);
    },

    addUserPresetFromValues: function (config, name, values, category, heroes, heroMode) {
      if (!config || !values) return null;
      var userRows = this.getUserPresetRows(config);
      var nextIndex = userRows.length + 1;
      var presetName = this.sanitizeUserPresetName(name, nextIndex);
      var sourceValues = {};
      for (var key in values) {
        if (Object.prototype.hasOwnProperty.call(values, key)) sourceValues[key] = values[key];
      }
      var payloadValues = this.buildPresetPayloadValues(config, sourceValues);
      var overrideCount = this.countBuilderPresetOverrides(config, sourceValues);
      var omittedOverrides = this.countUnsupportedPresetOverrides(config, sourceValues);
      var keyName = "user_" + String((Date.now ? Date.now() : +(new Date()))) + "_" + String(nextIndex);
      var heroTargets = normalizeHpHeroSelection(heroes);
      var scopeMode = normalizeHpHeroScopeMode(heroMode, heroTargets);
      if (scopeMode !== HP_HERO_SCOPE_SELECTED) heroTargets = [];
      var row = {
        key: keyName,
        id: "",
        name: presetName,
        category: String(category || "Imported"),
        status: (overrideCount ? (String(overrideCount) + " builder override" + (overrideCount === 1 ? "" : "s")) : "Default builder values") +
          (omittedOverrides ? ("; " + String(omittedOverrides) + " live-only setting" + (omittedOverrides === 1 ? "" : "s") + " omitted") : ""),
        token: "",
        values: sourceValues,
        payloadValues: payloadValues,
        heroes: heroTargets,
        heroMode: scopeMode
      };
      row.token = this.buildPresetCodeToken(config, row.values, row.name, row.payloadValues, row.heroes, row.heroMode);
      userRows.push(row);
      config.__anitaSelectedPresetKey = row.key;
      if (scopeMode !== HP_HERO_SCOPE_OFF) {
        resetHpHeroPresetDetectionLock(config);
        invalidateHpHeroPresetApplyCache(config);
        startHpHeroPresetWatch(config);
        scheduleHpHeroPresetRefresh(config);
      }
      return row;
    },

    addUserPresetFromImportCode: function (config, text) {
      var parsed = this.parseImportCode(config, text);
      if (!parsed.ok) return parsed;
      var row = this.addUserPresetFromValues(config, this.getNextImportPresetName(config), parsed.values, "Imported", parsed.heroes, parsed.heroMode);
      if (!row) return { ok: false, status: "Invalid" };
      return { ok: true, status: "Saved", row: row };
    },

    getPresetRows: function (config) {
      var rows = [];
      var baked = readBakedPresetEntries(config);
      for (var i = 0; i < baked.length; i++) {
        var preset = baked[i];
        var valueCount = this.countPresetValues(preset.values);
        var overrideCount = this.countBuilderPresetOverrides(config, preset.values);
        var unsupportedCount = this.countUnsupportedPresetOverrides(config, preset.values);
        var payloadValues = this.buildPresetPayloadValues(config, preset.values || {});
        var bakedKey = "baked_" + String(i);
        var bakedName = this.getPresetNameOverride(config, bakedKey, preset.id || "", preset.name || ("Builder preset " + String(i + 1)));
        rows.push({
          key: bakedKey,
          id: preset.id || "",
          name: bakedName,
          category: preset.category || "Builder VPK",
          status: valueCount ? (String(valueCount) + " recognized setting" + (valueCount === 1 ? "" : "s") + ", " + String(overrideCount) + " builder override" + (overrideCount === 1 ? "" : "s") + (unsupportedCount ? (", " + String(unsupportedCount) + " omitted") : "")) : "No recognized HP Colors settings",
          token: this.buildPresetCodeToken(config, preset.values || {}, bakedName, payloadValues, preset.heroes, preset.heroMode),
          values: preset.values || {},
          payloadValues: payloadValues,
          heroes: normalizeHpHeroSelection(preset.heroes),
          heroMode: normalizeHpHeroScopeMode(preset.heroMode, preset.heroes)
        });
        if (this.isPresetRowRemoved(config, rows[rows.length - 1])) rows.pop();
      }

      var userRows = this.getUserPresetRows(config);
      for (var userIndex = 0; userIndex < userRows.length; userIndex++) {
        var userRow = userRows[userIndex];
        if (!userRow || !userRow.values) continue;
        if (this.isPresetRowRemoved(config, userRow)) continue;
        userRow.payloadValues = userRow.payloadValues || this.buildPresetPayloadValues(config, userRow.values || {});
        userRow.category = userRow.category || "Game preset";
        userRow.name = this.sanitizeUserPresetName(userRow.name, userIndex + 1);
        userRow.heroes = normalizeHpHeroSelection(userRow.heroes);
        userRow.heroMode = normalizeHpHeroScopeMode(userRow.heroMode, userRow.heroes);
        userRow.token = this.buildPresetCodeToken(config, userRow.values || {}, userRow.name, userRow.payloadValues, userRow.heroes, userRow.heroMode);
        rows.push(userRow);
      }

      var currentValues = this.collectCurrentValues(config);
      var currentOverrides = this.countBuilderPresetOverrides(config, currentValues);
      var omittedOverrides = this.countUnsupportedPresetOverrides(config, currentValues);
      rows.push({
        key: "current",
        id: "",
        name: "Current live settings",
        category: "Live settings",
        status: (currentOverrides ? (String(currentOverrides) + " builder override" + (currentOverrides === 1 ? "" : "s")) : "Default builder values") +
          (omittedOverrides ? ("; " + String(omittedOverrides) + " live-only setting" + (omittedOverrides === 1 ? "" : "s") + " omitted") : ""),
        token: this.buildPresetCodeToken(config, currentValues, "Current live settings", null, [], HP_HERO_SCOPE_OFF),
        values: currentValues,
        payloadValues: this.buildPresetPayloadValues(config, currentValues),
        heroes: [],
        heroMode: HP_HERO_SCOPE_OFF
      });
      return this.applyPresetPriorityOrder(config, rows);
    },

    clonePresetBuilderStateValue: function (value) {
      if (Array.isArray(value)) {
        var arrayCopy = [];
        for (var i = 0; i < value.length; i++) {
          arrayCopy.push(this.clonePresetBuilderStateValue(value[i]));
        }
        return arrayCopy;
      }
      if (value && typeof value === "object") {
        var objectCopy = {};
        for (var key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            objectCopy[key] = this.clonePresetBuilderStateValue(value[key]);
          }
        }
        return objectCopy;
      }
      return value;
    },

    capturePresetBuilderState: function (config) {
      if (!this.hasPresetBuilder(config)) return null;
      return {
        userPresetRows: this.clonePresetBuilderStateValue(config.__anitaUserPresetRows || []),
        nameOverrides: this.clonePresetBuilderStateValue(config.__anitaPresetNameOverrides || {}),
        heroSelections: this.clonePresetBuilderStateValue(config.__anitaPresetHeroSelections || {}),
        heroModes: this.clonePresetBuilderStateValue(config.__anitaPresetHeroModes || {}),
        priorityOrder: this.clonePresetBuilderStateValue(config.__anitaPresetPriorityOrder || []),
        removedPresets: this.clonePresetBuilderStateValue(config.__anitaRemovedPresetRows || {}),
        selectedPresetKey: String(config.__anitaSelectedPresetKey || ""),
        editingPresetKey: String(config.__anitaEditingPresetKey || ""),
        heroDetectionMode: normalizeHpHeroDetectionMode(config),
        heroManualOverride: !!config.__hpHeroManualPresetOverride
      };
    },

    restorePresetBuilderState: function (config, state) {
      if (!config || !state) return;
      config.__anitaUserPresetRows = this.clonePresetBuilderStateValue(state.userPresetRows || []);
      config.__anitaPresetNameOverrides = this.clonePresetBuilderStateValue(state.nameOverrides || {});
      config.__anitaPresetHeroSelections = this.clonePresetBuilderStateValue(state.heroSelections || {});
      config.__anitaPresetHeroModes = this.clonePresetBuilderStateValue(state.heroModes || {});
      config.__anitaPresetPriorityOrder = this.clonePresetBuilderStateValue(state.priorityOrder || []);
      config.__anitaRemovedPresetRows = this.clonePresetBuilderStateValue(state.removedPresets || {});
      config.__anitaSelectedPresetKey = String(state.selectedPresetKey || "");
      config.__anitaEditingPresetKey = String(state.editingPresetKey || "");
      setHpHeroDetectionMode(config, state.heroDetectionMode ||
        (state.heroManualOverride ? HP_HERO_DETECTION_OVERRIDE : HP_HERO_DETECTION_AUTO));
    },

    copyTextToClipboard: function (text) {
      var value = String(text || "");
      if (!value) return false;
      var panel = $.GetContextPanel();
      function tryCopy(eventName, arg0, arg1) {
        try {
          $.DispatchEvent(eventName, arg0, arg1);
          return true;
        } catch (e0) {}
        return false;
      }
      if (tryCopy("CopyStringToClipboard", value)) return true;
      if (tryCopy("CopyStringToClipboard", value, panel)) return true;
      if (tryCopy("CopyToClipboard", value, panel)) return true;
      if (tryCopy("CopyToClipboard", value)) return true;
      try {
        if ($.DispatchEventAsync) {
          $.DispatchEventAsync(0, "CopyStringToClipboard", value, panel);
          return true;
        }
      } catch (e1) {}
      return false;
    },

    openExternalUrl: function (url) {
      var target = String(url || "");
      if (!target) return false;
      try {
        $.DispatchEvent("ExternalBrowserGoToURL", target);
        return true;
      } catch (e0) {}
      try {
        $.DispatchEvent("SteamOverlayOpenURL", target);
        return true;
      } catch (e1) {}
      try {
        if (typeof SteamOverlayAPI !== "undefined" && SteamOverlayAPI && typeof SteamOverlayAPI.OpenURL === "function") {
          SteamOverlayAPI.OpenURL(target);
          return true;
        }
      } catch (e2) {}
      return false;
    },

    setPresetStatus: function (label, text, good) {
      if (!label || !label.IsValid || !label.IsValid()) return;
      label.text = text;
      label.SetHasClass("Good", !!good);
    },

    isPanelValid: function (panel) {
      return !!(panel && panel.IsValid && panel.IsValid());
    },

    getPanelOffset: function (panel) {
      var x = 0;
      var y = 0;
      var p = panel;
      while (this.isPanelValid(p)) {
        x += Number(p.actualxoffset || p.actualx || 0);
        y += Number(p.actualyoffset || p.actualy || 0);
        p = p.GetParent ? p.GetParent() : null;
      }
      if (!isFinite(x)) x = 0;
      if (!isFinite(y)) y = 0;
      return { x: x, y: y };
    },

    getPanelMetric: function (panel, primary, secondary, fallback) {
      var value = Number((panel && panel[primary]) || (panel && panel[secondary]) || fallback || 0);
      return isFinite(value) && value > 0 ? value : Number(fallback || 0);
    },

    getLocalTooltipHost: function () {
      var trueRoot = (this.isPanelValid(this.mainWindow) && this.mainWindow.GetParent) ? this.mainWindow.GetParent() : $.GetContextPanel();
      if (!this.isPanelValid(trueRoot)) trueRoot = $.GetContextPanel();
      if (!this.isPanelValid(this.popupHost) || this.popupHost.GetParent() !== trueRoot) {
        if (this.isPanelValid(this.popupHost)) {
          try { this.popupHost.DeleteAsync(0); } catch (deleteErr) {}
        }
        this.popupHost = $.CreatePanel("Panel", trueRoot, "AnitaUI_PopupHost");
        this.popupHost.AddClass("AnitaPopupHost");
      }
      var host = this.isPanelValid(this.popupHost) ? this.popupHost : trueRoot;
      host.style.align = "left top";
      host.style.ignoreParentFlow = true;
      host.style.flowChildren = "none";
      host.style.overflow = "noclip";
      host.style.zIndex = "10050";
      host.style.width = "100%";
      host.style.height = "100%";
      host.hittest = false;
      host.hittestchildren = true;
      return host;
    },

    getLocalTooltipPanel: function () {
      var host = this.getLocalTooltipHost();
      if (!this.isPanelValid(host)) return null;
      if (!this.isPanelValid(this.presetTooltip) || this.presetTooltip.GetParent() !== host) {
        this.presetTooltip = $.CreatePanel("Panel", host, "AnitaPresetLocalTooltip");
        this.presetTooltip.AddClass("AnitaPresetLocalTooltip");
        this.presetTooltip.hittest = false;
        this.presetTooltip.hittestchildren = false;
        this.presetTooltip.style.position = "-200% -200% 0px";
        this.presetTooltip.style.opacity = "0";
        this.presetTooltip.style.zIndex = "10090";
        var label = $.CreatePanel("Label", this.presetTooltip, "");
        label.AddClass("AnitaPresetLocalTooltipLabel");
        label.hittest = false;
        this.presetTooltip.__anitaTooltipLabel = label;
      }
      return this.presetTooltip;
    },

    positionLocalTooltip: function (anchor, tooltip) {
      if (!this.isPanelValid(anchor) || !this.isPanelValid(tooltip)) return;
      var host = this.getLocalTooltipHost();
      if (!this.isPanelValid(host)) return;
      var hostParent = host.GetParent ? host.GetParent() : null;
      var hostW = this.getPanelMetric(host, "actuallayoutwidth", "contentwidth", 0);
      var hostH = this.getPanelMetric(host, "actuallayoutheight", "contentheight", 0);
      if (hostW <= 1 && this.isPanelValid(hostParent)) hostW = this.getPanelMetric(hostParent, "actuallayoutwidth", "contentwidth", 1920);
      if (hostH <= 1 && this.isPanelValid(hostParent)) hostH = this.getPanelMetric(hostParent, "actuallayoutheight", "contentheight", 1080);
      if (hostW <= 1) hostW = 1920;
      if (hostH <= 1) hostH = 1080;

      var anchorOffset = this.getPanelOffset(anchor);
      var hostOffset = this.getPanelOffset(host);
      var tooltipW = this.getPanelMetric(tooltip, "actuallayoutwidth", "contentwidth", 220);
      var tooltipH = this.getPanelMetric(tooltip, "actuallayoutheight", "contentheight", 30);
      var edge = 8;
      var x = anchorOffset.x - hostOffset.x;
      var y = anchorOffset.y - hostOffset.y - tooltipH - 6;
      if (y < edge) y = anchorOffset.y - hostOffset.y + this.getPanelMetric(anchor, "actuallayoutheight", "contentheight", 28) + 6;
      if (x + tooltipW > hostW - edge) x = hostW - tooltipW - edge;
      if (x < edge) x = edge;
      if (y + tooltipH > hostH - edge) y = hostH - tooltipH - edge;
      if (y < edge) y = edge;

      tooltip.style.align = "left top";
      tooltip.style.ignoreParentFlow = true;
      tooltip.style.position = Math.round(x) + "px " + Math.round(y) + "px 0px";
      tooltip.style.opacity = "1";
      tooltip.style.zIndex = "10090";
    },

    showLocalTooltip: function (panel, text) {
      var tooltip = this.getLocalTooltipPanel();
      if (!this.isPanelValid(tooltip)) return;
      var label = tooltip.__anitaTooltipLabel || null;
      if (label && label.IsValid && label.IsValid()) label.text = String(text || "");
      this.positionLocalTooltip(panel, tooltip);
      try {
        $.Schedule(0.02, function () {
          if (AnitaRenderer.presetTooltip === tooltip) AnitaRenderer.positionLocalTooltip(panel, tooltip);
        });
      } catch (scheduleErr) {}
    },

    hideLocalTooltip: function () {
      var tooltip = this.presetTooltip;
      if (!this.isPanelValid(tooltip)) return;
      tooltip.style.opacity = "0";
      tooltip.style.position = "-200% -200% 0px";
    },

    attachLocalTooltip: function (panel, text) {
      if (!panel || !text) return;
      panel.SetPanelEvent("onmouseover", function () {
        AnitaRenderer.showLocalTooltip(panel, text);
      });
      panel.SetPanelEvent("onmouseout", function () {
        AnitaRenderer.hideLocalTooltip();
      });
    },

    dismissPresetNotice: function (config) {
      if (!config) return;
      config.__anitaPresetNoticeDismissed = true;
      var notice = config.__anitaPresetNotice;
      if (notice && notice.IsValid && notice.IsValid()) {
        notice.style.visibility = "collapse";
        notice.hittest = false;
      }
    },

    shouldShowPresetNotice: function (config) {
      return this.hasPresetBuilder(config) && !config.__anitaPresetNoticeDismissed;
    },

    getPresetHeroSelectionStore: function (config) {
      if (!config.__anitaPresetHeroSelections) config.__anitaPresetHeroSelections = {};
      return config.__anitaPresetHeroSelections;
    },

    getPresetHeroModeStore: function (config) {
      if (!config.__anitaPresetHeroModes) config.__anitaPresetHeroModes = {};
      return config.__anitaPresetHeroModes;
    },

    getPresetRowHeroes: function (config, row) {
      if (!config || !row) return [];
      var store = this.getPresetHeroSelectionStore(config);
      var modeStore = this.getPresetHeroModeStore(config);
      if (!Object.prototype.hasOwnProperty.call(store, row.key)) {
        var idStoreKey = row.id ? ("id:" + String(row.id)) : "";
        store[row.key] = idStoreKey && Object.prototype.hasOwnProperty.call(store, idStoreKey)
          ? normalizeHpHeroSelection(store[idStoreKey])
          : normalizeHpHeroSelection(row.heroes);
      }
      if (!Object.prototype.hasOwnProperty.call(modeStore, row.key)) {
        var idModeKey = row.id ? ("id:" + String(row.id)) : "";
        modeStore[row.key] = idModeKey && Object.prototype.hasOwnProperty.call(modeStore, idModeKey)
          ? normalizeHpHeroScopeMode(modeStore[idModeKey], store[row.key])
          : normalizeHpHeroScopeMode(row.heroMode, store[row.key]);
      }
      row.heroes = normalizeHpHeroSelection(store[row.key]);
      row.heroMode = normalizeHpHeroScopeMode(modeStore[row.key], row.heroes);
      if (row.heroMode !== HP_HERO_SCOPE_SELECTED) {
        row.heroes = [];
        store[row.key] = [];
      }
      return row.heroes.slice(0);
    },

    getPresetRowHeroMode: function (config, row) {
      if (!config || !row) return HP_HERO_SCOPE_OFF;
      this.getPresetRowHeroes(config, row);
      return normalizeHpHeroScopeMode(row.heroMode, row.heroes);
    },

    setPresetRowHeroScope: function (config, row, mode, heroes) {
      if (!config || !row) return [];
      var normalized = normalizeHpHeroSelection(heroes);
      var scopeMode = normalizeHpHeroScopeMode(mode, normalized);
      if (scopeMode !== HP_HERO_SCOPE_SELECTED) normalized = [];
      var store = this.getPresetHeroSelectionStore(config);
      var modeStore = this.getPresetHeroModeStore(config);
      store[row.key] = normalized.slice(0);
      modeStore[row.key] = scopeMode;
      if (row.id) store["id:" + String(row.id)] = normalized.slice(0);
      if (row.id) modeStore["id:" + String(row.id)] = scopeMode;
      row.heroes = normalized.slice(0);
      row.heroMode = scopeMode;
      row.token = this.buildPresetCodeToken(config, row.values || {}, row.name || "", row.payloadValues, row.heroes, row.heroMode);
      resetHpHeroPresetDetectionLock(config);
      invalidateHpHeroPresetApplyCache(config);
      startHpHeroPresetWatch(config);
      scheduleHpHeroPresetRefresh(config);
      return row.heroes.slice(0);
    },

    setPresetRowHeroes: function (config, row, heroes) {
      return this.setPresetRowHeroScope(config, row, HP_HERO_SCOPE_SELECTED, heroes);
    },

    summarizePresetHeroes: function (heroes, mode) {
      var normalized = normalizeHpHeroSelection(heroes);
      var scopeMode = normalizeHpHeroScopeMode(mode, normalized);
      if (scopeMode === HP_HERO_SCOPE_OFF) return "Hero select off";
      if (scopeMode === HP_HERO_SCOPE_ALL) return "All heroes";
      return String(normalized.length) + " hero" + (normalized.length === 1 ? "" : "es");
    },

    selectPresetBuilder: function (config) {
      if (!this.hasPresetBuilder(config)) return;
      this.dismissPresetNotice(config);
      config.__anitaActiveCategory = HP_PRESET_BUILDER_CATEGORY;
      this.renderModSettings(config);
    },

    renderPresetBuilderPanel: function (parent, config) {
      if (!parent || !config) return;

      var rows = this.getPresetRows(config);
      var selectedKeyValid = false;
      for (var selectedKeyIndex = 0; selectedKeyIndex < rows.length; selectedKeyIndex++) {
        if (rows[selectedKeyIndex].key === config.__anitaSelectedPresetKey) {
          selectedKeyValid = true;
          break;
        }
      }
      if (!config.__anitaSelectedPresetKey || !selectedKeyValid) {
        var defaultPresetKey = "";
        for (var startupIndex = 0; startupIndex < rows.length; startupIndex++) {
          if (rows[startupIndex].id === HP_STARTUP_PRESET_ID) {
            defaultPresetKey = rows[startupIndex].key;
            break;
          }
        }
        for (var defaultIndex = 0; !defaultPresetKey && defaultIndex < rows.length; defaultIndex++) {
          if (String(rows[defaultIndex].key || "").indexOf("baked_") === 0) {
            defaultPresetKey = rows[defaultIndex].key;
            break;
          }
        }
        config.__anitaSelectedPresetKey = defaultPresetKey || (rows.length ? rows[0].key : "");
      }

      for (var heroInitIndex = 0; heroInitIndex < rows.length; heroInitIndex++) {
        this.getPresetRowHeroes(config, rows[heroInitIndex]);
      }

      var selected = rows.length ? rows[0] : null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].key === config.__anitaSelectedPresetKey) {
          selected = rows[i];
          break;
        }
      }
      var bundleRows = this.getPresetBundleRows(rows);
      var bundlePresetCount = bundleRows.length;

      var panel = $.CreatePanel("Panel", parent, "");
      panel.AddClass("AnitaPresetBuilderPanel");

      var intro = $.CreatePanel("Panel", panel, "");
      intro.AddClass("AnitaPresetIntro");

      var titleCol = $.CreatePanel("Panel", intro, "");
      titleCol.AddClass("AnitaPresetTitleCol");

      var kicker = $.CreatePanel("Label", titleCol, "");
      kicker.AddClass("AnitaPresetKicker");
      kicker.text = "Preset VPK workflow";

      var titleRow = $.CreatePanel("Panel", titleCol, "");
      titleRow.AddClass("AnitaPresetTitleRow");

      var title = $.CreatePanel("Label", titleRow, "");

      var heroOverrideBtn = $.CreatePanel("Button", titleRow, "");
      heroOverrideBtn.AddClass("AnitaPresetHeroOverrideBtn");
      heroOverrideBtn.SetHasClass("Enabled", hpHeroManualOverrideEnabled(config));
      heroOverrideBtn.SetHasClass("Off", normalizeHpHeroDetectionMode(config) === HP_HERO_DETECTION_OFF);
      var heroOverrideLbl = $.CreatePanel("Label", heroOverrideBtn, "");
      heroOverrideLbl.text = getHpHeroDetectionModeLabel(config);
      title.AddClass("AnitaPresetTitle");
      title.text = "HP Preset Builder";

      var openBtn = $.CreatePanel("Button", titleRow, "");
      openBtn.AddClass("AnitaPresetOpenBtn");
      var openIcon = $.CreatePanel("Panel", openBtn, "");
      openIcon.AddClass("AnitaPresetBtnIcon");
      openIcon.AddClass("AnitaPresetBtnIconOpen");
      openIcon.hittest = false;
      var openLbl = $.CreatePanel("Label", openBtn, "");
      openLbl.text = "OPEN";

      var bundleBtn = $.CreatePanel("Button", titleRow, "");
      bundleBtn.AddClass("AnitaPresetBundleBtn");
      var bundleIcon = $.CreatePanel("Panel", bundleBtn, "");
      bundleIcon.AddClass("AnitaPresetBtnIcon");
      bundleIcon.AddClass("AnitaPresetBtnIconCopy");
      bundleIcon.hittest = false;
      var bundleLbl = $.CreatePanel("Label", bundleBtn, "");
      bundleLbl.text = "COPY ALL";

      var titleImportBtn = $.CreatePanel("Button", titleRow, "");
      titleImportBtn.AddClass("AnitaPresetImportBtn");
      var titleImportLbl = $.CreatePanel("Label", titleImportBtn, "");
      titleImportLbl.text = "IMPORT";

      var metaRow = $.CreatePanel("Panel", panel, "");
      metaRow.AddClass("AnitaPresetMetaRow");

      var listTitle = $.CreatePanel("Label", metaRow, "");
      listTitle.AddClass("AnitaPresetListTitle");
      listTitle.text = "Preset codes";

      var status = $.CreatePanel("Label", metaRow, "");
      status.AddClass("AnitaPresetStatusText");
      status.text = selected ? ("Selected: " + selected.name) : "No preset selected";

      var fallback = $.CreatePanel("Label", metaRow, "");
      fallback.AddClass("AnitaPresetFallbackUrl");
      fallback.text = HP_PRESET_BUILDER_URL;

      var createRow = $.CreatePanel("Panel", panel, "");
      createRow.AddClass("AnitaPresetCreateRow");

      var createTextCol = $.CreatePanel("Panel", createRow, "");
      createTextCol.AddClass("AnitaPresetCreateTextCol");

      var nameLabel = $.CreatePanel("Label", createTextCol, "");
      nameLabel.AddClass("AnitaPresetNameLabel");
      nameLabel.text = "Preset name";

      var nameInput = $.CreatePanel("TextEntry", createTextCol, "");
      nameInput.AddClass("AnitaPresetNameInput");
      nameInput.placeholder = "Name for current settings preset";
      nameInput.text = String(config.__anitaPresetDraftName || "");
      nameInput.SetPanelEvent("ontextentrychange", function () {
        config.__anitaPresetDraftName = String(nameInput.text || "");
      });

      var createHint = $.CreatePanel("Label", createTextCol, "");
      createHint.AddClass("AnitaPresetCreateHint");
      createHint.text = "Saves current live HP settings. Click a preset name to rename.";

      function addCurrentPreset() {
        var saved = AnitaRenderer.addUserPresetFromCurrent(config, nameInput.text || "");
        if (!saved) {
          showPresetStatus("Could not add preset.", false, 2.0);
          return;
        }
        config.__anitaPresetDraftName = "";
        AnitaRenderer.renderModSettings(config);
      }

      var addBtn = $.CreatePanel("Button", createRow, "");
      addBtn.AddClass("AnitaPresetAddBtn");
      addBtn.hittest = true;
      addBtn.hittestchildren = false;
      var addLbl = $.CreatePanel("Label", addBtn, "");
      addLbl.AddClass("AnitaPresetAddLabel");
      addLbl.text = "SAVE CURRENT";
      addBtn.SetPanelEvent("onactivate", addCurrentPreset);
      nameInput.SetPanelEvent("ontextentrysubmit", addCurrentPreset);

      var list = $.CreatePanel("Panel", panel, "");
      list.AddClass("AnitaPresetList");

      function getSelectedRow() {
        for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          if (rows[rowIndex].key === config.__anitaSelectedPresetKey) return rows[rowIndex];
        }
        return rows.length ? rows[0] : null;
      }

      function getSelectedStatusText() {
        var active = getSelectedRow();
        return active ? ("Selected: " + active.name) : "No preset selected";
      }

      function showPresetStatus(text, good, durationSec) {
        var statusToken = (config.__anitaPresetStatusToken || 0) + 1;
        config.__anitaPresetStatusToken = statusToken;
        AnitaRenderer.setPresetStatus(status, text, good);
        if (!durationSec) return;
        $.Schedule(durationSec, function () {
          if (statusToken !== config.__anitaPresetStatusToken) return;
          AnitaRenderer.setPresetStatus(status, getSelectedStatusText(), false);
        });
      }

      function openPresetImportPopup() {
        if (AnitaRenderer.activeImportPopupClose) {
          try { AnitaRenderer.activeImportPopupClose(); } catch (closeErr) {}
          AnitaRenderer.activeImportPopupClose = null;
        }

        var popupPanel = $.CreatePanel("Panel", $.GetContextPanel(), "");
        var importInput = null;
        var applyBtn = null;
        var applyLbl = null;

        function closePopup() {
          if (popupPanel && popupPanel.IsValid && popupPanel.IsValid()) {
            popupPanel.DeleteAsync(0);
          }
          config.__anitaImportCodeInput = null;
          if (AnitaRenderer.activeImportPopupClose === closePopup) {
            AnitaRenderer.activeImportPopupClose = null;
          }
        }

        function flashApplyLabel(text) {
          if (!applyBtn || !applyBtn.IsValid || !applyBtn.IsValid()) return;
          if (!applyLbl || !applyLbl.IsValid || !applyLbl.IsValid()) return;
          applyLbl.text = text;
          applyBtn.AddClass("AnitaFooterBtnSuccess");
          $.Schedule(1.5, function () {
            if (applyLbl && applyLbl.IsValid && applyLbl.IsValid()) applyLbl.text = "IMPORT";
            if (applyBtn && applyBtn.IsValid && applyBtn.IsValid()) applyBtn.RemoveClass("AnitaFooterBtnSuccess");
          });
        }

        function applyInputCode() {
          if (!importInput || !importInput.IsValid || !importInput.IsValid()) return;
          var text = String(importInput.text || "").trim();
          if (!text) {
            flashApplyLabel("Empty");
            return;
          }
          var result = AnitaRenderer.addUserPresetFromImportCode(config, text);
          if (!result.ok) {
            flashApplyLabel(result.status || "Invalid");
            return;
          }
          closePopup();
          AnitaRenderer.renderModSettings(config);
        }

        AnitaRenderer.activeImportPopupClose = closePopup;
        popupPanel.AddClass("AnitaImportPopup");
        popupPanel.style.align = "center center";
        popupPanel.style.ignoreParentFlow = true;
        popupPanel.style.flowChildren = "down";
        popupPanel.style.uiScale = "100%";
        popupPanel.SetPanelEvent("oncancel", closePopup);

        var header = $.CreatePanel("Panel", popupPanel, "");
        header.AddClass("AnitaImportPopupHeader");

        var popupTitle = $.CreatePanel("Label", header, "");
        popupTitle.AddClass("AnitaImportPopupTitle");
        popupTitle.text = "Import Code";

        var closeBtn = $.CreatePanel("Button", header, "");
        closeBtn.AddClass("AnitaColorPopupBtn");
        closeBtn.AddClass("AnitaImportCloseBtn");
        var closeLbl = $.CreatePanel("Label", closeBtn, "");
        closeLbl.AddClass("AnitaImportCloseLabel");
        closeLbl.text = "X";
        closeBtn.SetPanelEvent("onactivate", closePopup);

        var hint = $.CreatePanel("Label", popupPanel, "");
        hint.AddClass("AnitaImportPopupHint");
        hint.text = "Paste a preset code or settings token to apply it to HP Colors.";

        var importRow = $.CreatePanel("Panel", popupPanel, "");
        importRow.AddClass("AnitaPasteRow");
        importRow.hittest = true;

        importInput = $.CreatePanel("TextEntry", importRow, "");
        importInput.AddClass("AnitaPasteInput");
        importInput.placeholder = "Paste custom preset code here...";
        config.__anitaImportCodeInput = importInput;

        applyBtn = $.CreatePanel("Button", importRow, "");
        applyBtn.AddClass("AnitaFooterBtn");
        applyBtn.AddClass("AnitaImportApplyBtn");
        applyLbl = $.CreatePanel("Label", applyBtn, "");
        applyLbl.AddClass("AnitaImportApplyLabel");
        applyLbl.text = "IMPORT";
        applyBtn.SetPanelEvent("onactivate", applyInputCode);
        importInput.SetPanelEvent("ontextentrysubmit", applyInputCode);

        $.Schedule(0.0, function () {
          if (importInput && importInput.IsValid && importInput.IsValid()) {
            importInput.SetFocus();
          }
        });
      }

      function copyPreset(row, label, doneText) {
        if (!row) {
          showPresetStatus("No code available for this preset.", false, 2.0);
          return false;
        }
        var token = AnitaRenderer.buildPresetCodeToken(config, row.values || {}, row.name || "", row.payloadValues, row.heroes, row.heroMode);
        if (!token) {
          showPresetStatus("No code available for this preset.", false, 2.0);
          return false;
        }
        row.token = token;
        var copied = AnitaRenderer.copyTextToClipboard(token);
        showPresetStatus(
          copied ? doneText : "Clipboard failed. Use Import with copied text fallback unavailable.",
          copied,
          2.5
        );
        return copied;
      }

      function copyPresetBundle(doneText) {
        var bundleToken = AnitaRenderer.buildPresetBundleCodeToken(config, bundleRows);
        if (!bundleToken) {
          showPresetStatus("No preset bundle available.", false, 2.0);
          return false;
        }
        var copied = AnitaRenderer.copyTextToClipboard(bundleToken);
        showPresetStatus(
          copied ? doneText : "Clipboard failed. Copy individual codes instead.",
          copied,
          2.5
        );
        return copied;
      }

      function importPreset(row) {
        if (!row || !row.token) {
          showPresetStatus("No code available for this preset.", false, 2.0);
          return false;
        }
        config.__anitaSelectedPresetKey = row.key;
        var rowHeroes = AnitaRenderer.getPresetRowHeroes(config, row);
        var rowHeroMode = AnitaRenderer.getPresetRowHeroMode(config, row);
        if (rowHeroMode === HP_HERO_SCOPE_SELECTED && !hpHeroManualPresetAllowed(config)) {
          var currentHero = detectHpLocalHero();
          if (!currentHero || !presetTargetsHero(row, currentHero)) {
            resetHpHeroPresetDetectionLock(config);
            invalidateHpHeroPresetApplyCache(config);
            config.__hpHeroPresetHasScopedPreset = true;
            startHpHeroPresetWatch(config);
            scheduleHpHeroPresetRefresh(config);
            showPresetStatus(currentHero
              ? (row.name + " is saved for selected heroes.")
              : ("Waiting for hero detection before applying " + row.name + "."),
              true,
              2.5);
            return true;
          }
          row.heroes = rowHeroes;
        }
        var result = AnitaRenderer.applyImportCode(config, row.token, "preset_builder");
        if (result.ok) {
          showPresetStatus("Imported " + row.name + ".", true, 2.5);
          return true;
        }
        showPresetStatus(result.status || "Invalid", false, 2.0);
        return false;
      }

      function heroSelected(heroes, heroId) {
        var normalized = normalizeHpHeroSelection(heroes);
        for (var heroIndex = 0; heroIndex < normalized.length; heroIndex++) {
          if (normalized[heroIndex] === heroId) return true;
        }
        return false;
      }

      function updateHeroSummary(row, summaryLabel) {
        if (!row || !summaryLabel || !summaryLabel.IsValid || !summaryLabel.IsValid()) return;
        var heroes = AnitaRenderer.getPresetRowHeroes(config, row);
        var scopeMode = AnitaRenderer.getPresetRowHeroMode(config, row);
        if (scopeMode === HP_HERO_SCOPE_OFF) summaryLabel.text = "Hero select off";
        else if (scopeMode === HP_HERO_SCOPE_ALL) summaryLabel.text = "All heroes";
        else {
          var count = heroes.length;
          summaryLabel.text = String(count) + " hero" + (count === 1 ? "" : "es") + " selected";
        }
      }

      function updateHeroFace(row, facePanel) {
        if (!row || !facePanel || !facePanel.IsValid || !facePanel.IsValid()) return;
        var heroes = AnitaRenderer.getPresetRowHeroes(config, row);
        var scopeMode = AnitaRenderer.getPresetRowHeroMode(config, row);
        var icon = facePanel.__anitaHeroFaceIcon || null;
        var label = facePanel.__anitaHeroFaceLabel || null;
        if (label && label.IsValid && label.IsValid()) {
          if (scopeMode === HP_HERO_SCOPE_OFF) label.text = "Off";
          else if (scopeMode === HP_HERO_SCOPE_ALL) label.text = "All heroes";
          else {
            var count = heroes.length;
            label.text = String(count) + " hero" + (count === 1 ? "" : "es");
          }
        }
        if (icon && icon.IsValid && icon.IsValid()) {
          icon.SetHasClass("Visible", false);
          try { icon.style.backgroundImage = "none"; } catch (e0) {}
        }
      }

      function safeHeroOptionKey(row, suffix) {
        return "AnitaHeroOpt_" + String(row && row.key || "row").replace(/[^A-Za-z0-9_]+/g, "_") + "_" + suffix;
      }

      function renderHeroPickerState(button, row, summaryLabel) {
        if (!button || !button.IsValid || !button.IsValid()) return;
        var scopeMode = AnitaRenderer.getPresetRowHeroMode(config, row);
        button.SetHasClass("ScopeOff", scopeMode === HP_HERO_SCOPE_OFF);
        button.SetHasClass("ScopeAll", scopeMode === HP_HERO_SCOPE_ALL);
        button.SetHasClass("ScopeSelected", scopeMode === HP_HERO_SCOPE_SELECTED);
        if (summaryLabel && summaryLabel.IsValid && summaryLabel.IsValid()) {
          summaryLabel.SetHasClass("ScopeOff", scopeMode === HP_HERO_SCOPE_OFF);
          summaryLabel.SetHasClass("ScopeAll", scopeMode === HP_HERO_SCOPE_ALL);
          summaryLabel.SetHasClass("ScopeSelected", scopeMode === HP_HERO_SCOPE_SELECTED);
        }
        updateHeroFace(row, button.__anitaHeroFacePanel);
        updateHeroSummary(row, summaryLabel || button.__anitaHeroSummaryLabel);
      }

      function isHeroPanelValid(panel) {
        return !!(panel && panel.IsValid && panel.IsValid());
      }

      function getHeroMenuPopupHost() {
        var trueRoot = (isHeroPanelValid(AnitaRenderer.mainWindow) && AnitaRenderer.mainWindow.GetParent) ? AnitaRenderer.mainWindow.GetParent() : $.GetContextPanel();
        if (!isHeroPanelValid(trueRoot)) trueRoot = $.GetContextPanel();

        if (!isHeroPanelValid(AnitaRenderer.popupHost) || AnitaRenderer.popupHost.GetParent() !== trueRoot) {
          if (isHeroPanelValid(AnitaRenderer.popupHost)) {
            try { AnitaRenderer.popupHost.DeleteAsync(0); } catch (e0) {}
          }
          AnitaRenderer.popupHost = $.CreatePanel("Panel", trueRoot, "AnitaUI_PopupHost");
          AnitaRenderer.popupHost.AddClass("AnitaPopupHost");
        }

        var host = isHeroPanelValid(AnitaRenderer.popupHost) ? AnitaRenderer.popupHost : trueRoot;
        host.style.align = "left top";
        host.style.ignoreParentFlow = true;
        host.style.flowChildren = "none";
        host.style.overflow = "noclip";
        host.style.zIndex = "10050";
        host.style.x = "0px";
        host.style.y = "0px";
        host.style.width = "100%";
        host.style.height = "100%";
        host.hittest = false;
        host.hittestchildren = true;
        return host;
      }

      function getHeroPanelOffset(panel) {
        var x = 0;
        var y = 0;
        var p = panel;
        while (isHeroPanelValid(p)) {
          x += Number(p.actualxoffset || p.actualx || 0);
          y += Number(p.actualyoffset || p.actualy || 0);
          p = p.GetParent ? p.GetParent() : null;
        }
        if (!isFinite(x)) x = 0;
        if (!isFinite(y)) y = 0;
        return { x: x, y: y };
      }

      function getHeroPanelMetric(panel, primary, secondary, fallback) {
        var value = Number((panel && panel[primary]) || (panel && panel[secondary]) || fallback || 0);
        return isFinite(value) && value > 0 ? value : Number(fallback || 0);
      }

      function positionHeroMenu(menu, button, host) {
        if (!isHeroPanelValid(menu) || !isHeroPanelValid(button)) return;
        if (!isHeroPanelValid(host)) host = getHeroMenuPopupHost();

        var hostParent = host && host.GetParent ? host.GetParent() : null;
        var hostW = getHeroPanelMetric(host, "actuallayoutwidth", "contentwidth", 0);
        var hostH = getHeroPanelMetric(host, "actuallayoutheight", "contentheight", 0);
        if (hostW <= 1 && isHeroPanelValid(hostParent)) hostW = getHeroPanelMetric(hostParent, "actuallayoutwidth", "contentwidth", 1920);
        if (hostH <= 1 && isHeroPanelValid(hostParent)) hostH = getHeroPanelMetric(hostParent, "actuallayoutheight", "contentheight", 1080);
        if (hostW <= 1) hostW = 1920;
        if (hostH <= 1) hostH = 1080;

        var buttonOffset = getHeroPanelOffset(button);
        var hostOffset = getHeroPanelOffset(host);
        var x = buttonOffset.x - hostOffset.x;
        var y = buttonOffset.y - hostOffset.y + getHeroPanelMetric(button, "actuallayoutheight", "contentheight", 30) + 4;
        var menuW = getHeroPanelMetric(menu, "actuallayoutwidth", "contentwidth", 214);
        var menuH = getHeroPanelMetric(menu, "actuallayoutheight", "contentheight", 360);
        var edge = 4;

        if (x + menuW > hostW - edge) x = hostW - menuW - edge;
        if (x < edge) x = edge;
        if (hostH > menuH + edge * 2 && y + menuH > hostH - edge) {
          var aboveY = buttonOffset.y - hostOffset.y - menuH - 4;
          y = aboveY >= edge ? aboveY : hostH - menuH - edge;
        }
        if (y < edge) y = edge;

        menu.style.align = "left top";
        menu.style.ignoreParentFlow = true;
        menu.style.transform = "none";
        menu.style.position = Math.round(x) + "px " + Math.round(y) + "px 0px";
        menu.style.opacity = "1";
      }

      function closeHeroMenu(button) {
        if (!button) return;
        var menu = button.__anitaHeroMenu || null;
        if (menu && menu.IsValid && menu.IsValid()) {
          try { menu.DeleteAsync(0); } catch (e0) {}
        }
        button.__anitaHeroMenu = null;
        button.SetHasClass("Open", false);
        if (AnitaRenderer.activeHeroMenuClose === button.__anitaHeroMenuClose) {
          AnitaRenderer.activeHeroMenuClose = null;
        }
      }

      function makeHeroMenuOption(menu, button, row, summaryLabel, kind, heroId) {
        var optionKind = kind === HP_HERO_SCOPE_OFF || kind === HP_HERO_SCOPE_ALL ? kind : "hero";
        var isHero = optionKind === "hero";
        var option = $.CreatePanel("Button", menu, "");
        option.AddClass("AnitaPresetHeroMenuOption");
        option.hittest = true;
        option.hittestchildren = false;
        option.__anitaHeroId = isHero ? String(heroId || "") : "";
        option.__anitaHeroKind = optionKind;
        try { option.SetAttributeString("anita_hero_id", option.__anitaHeroId); } catch (e0) {}
        try { option.SetAttributeString("anita_hero_kind", optionKind); } catch (e1) {}

        var iconSlot = $.CreatePanel("Panel", option, "");
        iconSlot.AddClass("AnitaPresetHeroMenuOptionIcon");
        iconSlot.hittest = false;
        iconSlot.hittestchildren = false;
        if (!isHero) {
          iconSlot.AddClass("AnitaPresetHeroMenuOptionIconAll");
          var allLabel = $.CreatePanel("Label", iconSlot, "");
          allLabel.AddClass("AnitaPresetHeroMenuOptionIconAllLabel");
          allLabel.text = optionKind === HP_HERO_SCOPE_OFF ? "OFF" : "ALL";
        } else {
          iconSlot.style.backgroundImage = "none";
          var heroIconImage = $.CreatePanel("Panel", iconSlot, "");
          heroIconImage.AddClass("AnitaPresetHeroMenuOptionHeroIcon");
          heroIconImage.hittest = false;
          heroIconImage.__anitaHeroIconPath = hpHeroIconPath(heroId);
          heroIconImage.style.width = "22px";
          heroIconImage.style.height = "22px";
          heroIconImage.style.minWidth = "22px";
          heroIconImage.style.minHeight = "22px";
          heroIconImage.style.maxWidth = "22px";
          heroIconImage.style.maxHeight = "22px";
          heroIconImage.style.overflow = "clip";
          heroIconImage.style.backgroundImage = "none";
          heroIconImage.style.backgroundSize = "100% 100%";
          heroIconImage.style.backgroundTextureSize = "22px 22px";
          heroIconImage.style.backgroundPosition = "50% 50%";
          heroIconImage.style.backgroundRepeat = "no-repeat";
          if (!menu.__anitaHeroIconImages) menu.__anitaHeroIconImages = [];
          menu.__anitaHeroIconImages.push(heroIconImage);
        }

        var name = $.CreatePanel("Label", option, "");
        name.AddClass("AnitaPresetHeroMenuOptionName");
        if (optionKind === HP_HERO_SCOPE_OFF) name.text = "Off";
        else if (optionKind === HP_HERO_SCOPE_ALL) name.text = "All heroes";
        else name.text = hpHeroDisplayName(heroId);

        var check = $.CreatePanel("Label", option, "");
        check.AddClass("AnitaPresetHeroMenuOptionCheck");
        option.__anitaHeroCheckLabel = check;

        option.SetPanelEvent("onactivate", function () {
          handleHeroPickerChoice(button, row, summaryLabel, optionKind, isHero ? heroId : "");
        });
        if (!menu.__anitaHeroOptions) menu.__anitaHeroOptions = [];
        menu.__anitaHeroOptions.push(option);
        return option;
      }

      function settleHeroMenuIcons(menu) {
        if (!menu || !menu.__anitaHeroIconImages) return;
        for (var i = 0; i < menu.__anitaHeroIconImages.length; i++) {
          var icon = menu.__anitaHeroIconImages[i];
          if (!icon || !icon.IsValid || !icon.IsValid()) continue;
          var path = icon.__anitaHeroIconPath || "";
          if (!path) continue;
          icon.style.width = "22px";
          icon.style.height = "22px";
          icon.style.minWidth = "22px";
          icon.style.minHeight = "22px";
          icon.style.maxWidth = "22px";
          icon.style.maxHeight = "22px";
          icon.style.overflow = "clip";
          icon.style.backgroundSize = "100% 100%";
          icon.style.backgroundTextureSize = "22px 22px";
          icon.style.backgroundPosition = "50% 50%";
          icon.style.backgroundRepeat = "no-repeat";
          icon.style.backgroundImage = "url(\"" + path + "\")";
        }
      }

      function updateHeroMenuOptionState(option, selectedHeroes, scopeMode) {
        if (!option || !option.IsValid || !option.IsValid()) return;
        var heroId = String(option.__anitaHeroId || "");
        var kind = String(option.__anitaHeroKind || "hero");
        var selected = false;
        if (kind === HP_HERO_SCOPE_OFF) selected = scopeMode === HP_HERO_SCOPE_OFF;
        else if (kind === HP_HERO_SCOPE_ALL) selected = scopeMode === HP_HERO_SCOPE_ALL;
        else selected = scopeMode === HP_HERO_SCOPE_SELECTED && heroSelected(selectedHeroes, heroId);
        option.SetHasClass("Selected", selected);
        if (option.__anitaHeroCheckLabel) option.__anitaHeroCheckLabel.text = selected ? "✓" : "";
      }

      function syncHeroMenuState(menu, row) {
        if (!menu || !menu.__anitaHeroOptions) return;
        var selectedHeroes = AnitaRenderer.getPresetRowHeroes(config, row);
        var scopeMode = AnitaRenderer.getPresetRowHeroMode(config, row);
        for (var i = 0; i < menu.__anitaHeroOptions.length; i++) {
          updateHeroMenuOptionState(menu.__anitaHeroOptions[i], selectedHeroes, scopeMode);
        }
      }

      function renderHeroMenu(menu, button, row, summaryLabel) {
        if (!menu || !menu.IsValid || !menu.IsValid()) return;
        if (!menu.__anitaHeroOptions) {
          menu.RemoveAndDeleteChildren();
          menu.__anitaHeroOptions = [];
          menu.__anitaHeroIconImages = [];
          makeHeroMenuOption(menu, button, row, summaryLabel, HP_HERO_SCOPE_OFF, "");
          makeHeroMenuOption(menu, button, row, summaryLabel, HP_HERO_SCOPE_ALL, "");
          for (var h = 0; h < HP_HERO_DATA.length; h++) {
            makeHeroMenuOption(menu, button, row, summaryLabel, HP_HERO_SCOPE_SELECTED, HP_HERO_DATA[h].id);
          }
        }
        syncHeroMenuState(menu, row);
      }

      function handleHeroPickerChoice(button, row, summaryLabel, kind, heroId) {
        if (!button || !row) return;
        var current = AnitaRenderer.getPresetRowHeroes(config, row);
        var nextMode = AnitaRenderer.getPresetRowHeroMode(config, row);
        if (kind === HP_HERO_SCOPE_OFF) {
          current = [];
          nextMode = HP_HERO_SCOPE_OFF;
          row.__anitaLastHeroDropDownSelection = "";
        } else if (kind === HP_HERO_SCOPE_ALL) {
          current = [];
          nextMode = HP_HERO_SCOPE_ALL;
          row.__anitaLastHeroDropDownSelection = "";
        } else if (heroSelected(current, heroId)) {
          var next = [];
          for (var i = 0; i < current.length; i++) {
            if (current[i] !== heroId) next.push(current[i]);
          }
          current = next;
          nextMode = current.length ? HP_HERO_SCOPE_SELECTED : HP_HERO_SCOPE_OFF;
          row.__anitaLastHeroDropDownSelection = current[0] || "";
        } else {
          if (nextMode !== HP_HERO_SCOPE_SELECTED) current = [];
          current.push(heroId);
          nextMode = HP_HERO_SCOPE_SELECTED;
          row.__anitaLastHeroDropDownSelection = heroId;
        }
        AnitaRenderer.setPresetRowHeroScope(config, row, nextMode, current);
        renderHeroPickerState(button, row, summaryLabel || button.__anitaHeroSummaryLabel);
        renderHeroMenu(button.__anitaHeroMenu, button, row, summaryLabel || button.__anitaHeroSummaryLabel);
      }

      function makeHeroPickerButton(parent, row) {
        var button = $.CreatePanel("Button", parent, safeHeroOptionKey(row, "picker"));
        button.AddClass("AnitaPresetHeroPickerBtn");
        button.AddClass("AnitaPresetHeroBtn");
        button.hittest = true;
        button.hittestchildren = false;
        button.canfocus = true;

        var face = $.CreatePanel("Panel", button, "");
        face.AddClass("AnitaPresetHeroDropDownFace");
        face.hittest = false;
        face.hittestchildren = false;
        var faceIcon = $.CreatePanel("Panel", face, "");
        faceIcon.AddClass("AnitaPresetHeroDropDownFaceIcon");
        faceIcon.hittest = false;
        var faceLabel = $.CreatePanel("Label", face, "");
        faceLabel.AddClass("AnitaPresetHeroDropDownFaceLabel");
        faceLabel.hittest = false;
        var arrow = $.CreatePanel("Label", button, "");
        arrow.AddClass("AnitaPresetHeroPickerArrow");
        arrow.text = "v";
        arrow.hittest = false;

        face.__anitaHeroFaceIcon = faceIcon;
        face.__anitaHeroFaceLabel = faceLabel;
        button.__anitaHeroFacePanel = face;
        renderHeroPickerState(button, row, null);

        button.SetPanelEvent("onactivate", function () {
          config.__anitaSelectedPresetKey = row.key;
          if (button.__anitaHeroMenu && button.__anitaHeroMenu.IsValid && button.__anitaHeroMenu.IsValid()) {
            closeHeroMenu(button);
            return;
          }
          if (AnitaRenderer.activeHeroMenuClose) {
            try { AnitaRenderer.activeHeroMenuClose(); } catch (closeErr) {}
            AnitaRenderer.activeHeroMenuClose = null;
          }
          var host = getHeroMenuPopupHost();
          var menu = $.CreatePanel("Panel", host || parent, "");
          menu.AddClass("AnitaPresetHeroMenu");
          menu.style.position = "-200% -200% 0px";
          menu.style.opacity = "0";
          menu.hittest = true;
          menu.hittestchildren = true;
          button.__anitaHeroMenu = menu;
          button.__anitaHeroMenuClose = function () { closeHeroMenu(button); };
          AnitaRenderer.activeHeroMenuClose = button.__anitaHeroMenuClose;
          button.SetHasClass("Open", true);
          renderHeroMenu(menu, button, row, button.__anitaHeroSummaryLabel);
          positionHeroMenu(menu, button, host);
          try {
            $.Schedule(0.03, function () {
              if (button.__anitaHeroMenu === menu) {
                positionHeroMenu(menu, button, host);
                settleHeroMenuIcons(menu);
              }
            });
          } catch (scheduleErr) {}
        });
        return button;
      }
      attachPresetTooltip(heroOverrideBtn, "AUTO HERO reapplies scoped presets. OVERRIDE ON keeps a manual preset. HERO OFF disables hero detection.");

      openBtn.SetPanelEvent("onactivate", function () {
        showPresetStatus("Opened web builder. Use COPY ALL to export presets.", true, 2.5);
        AnitaRenderer.openExternalUrl(HP_PRESET_BUILDER_URL);
      });

      bundleBtn.SetPanelEvent("onactivate", function () {
        copyPresetBundle("Copied " + String(bundlePresetCount) + " preset code" + (bundlePresetCount === 1 ? "" : "s") + ".");
        bundleLbl.text = "COPIED";
        $.Schedule(1.25, function () {
          if (bundleLbl && bundleLbl.IsValid && bundleLbl.IsValid()) bundleLbl.text = "COPY ALL";
        });
      });

      titleImportBtn.SetPanelEvent("onactivate", function () {
        openPresetImportPopup();
      });

      heroOverrideBtn.SetPanelEvent("onactivate", function () {
        var nextMode = getNextHpHeroDetectionMode(config);
        setHpHeroDetectionMode(config, nextMode);
        AnitaPersistence.persistConfig(config, true);
        showPresetStatus(nextMode === HP_HERO_DETECTION_OVERRIDE
          ? "Manual preset override enabled."
          : nextMode === HP_HERO_DETECTION_OFF
            ? "Hero detection disabled."
            : "Auto hero presets enabled.",
          true,
          2.5);
        AnitaRenderer.renderModSettings(config);
      });

      function attachPresetTooltip(panel, text) {
        AnitaRenderer.attachLocalTooltip(panel, text);
      }

      attachPresetTooltip(openBtn, "Open the web preset builder.");
      attachPresetTooltip(bundleBtn, "Copy all preset codes for the web builder.");
      attachPresetTooltip(titleImportBtn, "Paste a custom preset code.");
      attachPresetTooltip(heroOverrideBtn, "AUTO HERO reapplies scoped presets. OVERRIDE ON keeps a manual preset. HERO OFF disables hero detection.");
      attachPresetTooltip(addBtn, "Save current live HP settings as a preset.");

      function selectPresetRow(presetRow) {
        if (importPreset(presetRow)) {
          AnitaRenderer.renderModSettings(config);
        }
      }

      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var rowPanel = $.CreatePanel("Panel", list, "");
        rowPanel.AddClass("AnitaPresetRow");
        rowPanel.SetHasClass("Active", row.key === config.__anitaSelectedPresetKey);
        rowPanel.hittest = true;
        rowPanel.hittestchildren = true;
        rowPanel.SetPanelEvent("onactivate", (function (presetRow) {
          return function () {
            selectPresetRow(presetRow);
          };
        }(row)));

        var textCol = $.CreatePanel("Panel", rowPanel, "");
        textCol.AddClass("AnitaPresetRowText");
        textCol.hittest = true;
        textCol.hittestchildren = true;

        var canRenameRow = row.key !== "current";
        var isRenamingRow = canRenameRow && config.__anitaEditingPresetNameKey === row.key;
        if (isRenamingRow) {
          var renameInput = $.CreatePanel("TextEntry", textCol, "");
          renameInput.AddClass("AnitaPresetRowNameInput");
          renameInput.text = row.name;
          renameInput.hittest = true;
          renameInput.canfocus = true;
          var commitRename = (function (presetRow, inputPanel) {
            return function () {
              var nextName = inputPanel && inputPanel.IsValid && inputPanel.IsValid() ? inputPanel.text : presetRow.name;
              AnitaRenderer.setPresetRowName(config, presetRow, nextName);
              config.__anitaEditingPresetNameKey = "";
              AnitaRenderer.renderModSettings(config);
            };
          }(row, renameInput));
          renameInput.SetPanelEvent("ontextentrysubmit", commitRename);
          renameInput.SetPanelEvent("onblur", commitRename);
          try { $.Schedule(0.01, function () {
            if (renameInput && renameInput.IsValid && renameInput.IsValid()) renameInput.SetFocus();
          }); } catch (eFocus) {}
        } else {
          var nameLabel = $.CreatePanel("Label", textCol, "");
          nameLabel.AddClass("AnitaPresetRowName");
          nameLabel.SetHasClass("Editable", canRenameRow);
          nameLabel.text = row.name;
          if (canRenameRow) {
            nameLabel.hittest = true;
            attachPresetTooltip(nameLabel, "Click to rename this preset.");
            nameLabel.SetPanelEvent("onactivate", (function (presetRow) {
              return function () {
                config.__anitaEditingPresetNameKey = presetRow.key;
                config.__anitaSelectedPresetKey = presetRow.key;
                AnitaRenderer.renderModSettings(config);
              };
            }(row)));
          }
        }

        var metaLabel = $.CreatePanel("Label", textCol, "");
        metaLabel.AddClass("AnitaPresetRowMeta");
        metaLabel.text = row.category + " - " + row.status;

        var heroSelector = $.CreatePanel("Panel", rowPanel, "");
        heroSelector.AddClass("AnitaPresetHeroSelector");
        heroSelector.hittest = true;
        heroSelector.hittestchildren = true;
        heroSelector.SetPanelEvent("onactivate", (function (presetRow) {
          return function () {
            selectPresetRow(presetRow);
          };
        }(row)));

        var heroPicker = makeHeroPickerButton(heroSelector, row);
        var heroSummary = $.CreatePanel("Label", heroSelector, "");
        heroSummary.AddClass("AnitaPresetHeroSummary");
        heroSummary.hittest = false;
        heroPicker.__anitaHeroSummaryLabel = heroSummary;
        renderHeroPickerState(heroPicker, row, heroSummary);

        var priorityBtns = $.CreatePanel("Panel", rowPanel, "");
        priorityBtns.AddClass("AnitaPresetPriorityBtns");
        var canPrioritize = AnitaRenderer.isPresetBundleRow(row);
        var canDeleteRow = canPrioritize && row.key !== "current";
        var priorityUpBtn = $.CreatePanel("Button", priorityBtns, "");
        priorityUpBtn.AddClass("AnitaPresetPriorityBtn");
        priorityUpBtn.AddClass("AnitaPresetPriorityUpBtn");
        priorityUpBtn.SetHasClass("Disabled", !canPrioritize || r === 0);
        priorityUpBtn.hittest = canPrioritize && r > 0;
        priorityUpBtn.hittestchildren = false;
        var priorityUpLbl = $.CreatePanel("Label", priorityUpBtn, "");
        priorityUpLbl.text = "▲";
        var priorityDownBtn = $.CreatePanel("Button", priorityBtns, "");
        priorityDownBtn.AddClass("AnitaPresetPriorityBtn");
        priorityDownBtn.AddClass("AnitaPresetPriorityDownBtn");
        priorityDownBtn.SetHasClass("Disabled", !canPrioritize || r >= (bundlePresetCount - 1));
        priorityDownBtn.hittest = canPrioritize && r < (bundlePresetCount - 1);
        priorityDownBtn.hittestchildren = false;
        var priorityDownLbl = $.CreatePanel("Label", priorityDownBtn, "");
        priorityDownLbl.text = "▼";
        if (canPrioritize) {
          attachPresetTooltip(priorityUpBtn, "Move preset up.");
          attachPresetTooltip(priorityDownBtn, "Move preset down.");
        }

        priorityUpBtn.SetPanelEvent("onactivate", (function (presetRow) {
          return function () {
            if (AnitaRenderer.movePresetRowPriority(config, rows, presetRow, -1)) {
              AnitaRenderer.renderModSettings(config);
            }
          };
        }(row)));
        priorityDownBtn.SetPanelEvent("onactivate", (function (presetRow) {
          return function () {
            if (AnitaRenderer.movePresetRowPriority(config, rows, presetRow, 1)) {
              AnitaRenderer.renderModSettings(config);
            }
          };
        }(row)));

        var copyBtn = $.CreatePanel("Button", rowPanel, "");
        copyBtn.AddClass("AnitaPresetCopyBtn");
        copyBtn.hittest = true;
        copyBtn.hittestchildren = false;
        var copyIcon = $.CreatePanel("Panel", copyBtn, "");
        copyIcon.AddClass("AnitaPresetBtnIcon");
        copyIcon.AddClass("AnitaPresetBtnIconCopy");
        copyIcon.hittest = false;
        var copyLbl = $.CreatePanel("Label", copyBtn, "");
        copyLbl.text = "COPY";

        if (canDeleteRow) {
          var deleteBtn = $.CreatePanel("Button", rowPanel, "");
          deleteBtn.AddClass("AnitaPresetDeleteBtn");
          deleteBtn.hittest = true;
          deleteBtn.hittestchildren = false;
          var deleteIcon = $.CreatePanel("Panel", deleteBtn, "");
          deleteIcon.AddClass("AnitaPresetBtnIcon");
          deleteIcon.AddClass("AnitaPresetBtnIconTrash");
          deleteIcon.hittest = false;
          attachPresetTooltip(deleteBtn, AnitaRenderer.isUserPresetRow(row) ? "Delete this saved preset." : "Remove this preset from the in-game list.");
          deleteBtn.SetPanelEvent("onactivate", (function (presetRow) {
            return function () {
              if (AnitaRenderer.removePresetRow(config, presetRow)) {
                AnitaRenderer.renderModSettings(config);
              }
            };
          }(row)));
        }

        textCol.SetPanelEvent("onactivate", (function (presetRow) {
          return function () {
            selectPresetRow(presetRow);
          };
        }(row)));

        copyBtn.SetPanelEvent("onactivate", (function (presetRow, buttonLabel) {
          return function () {
            config.__anitaSelectedPresetKey = presetRow.key;
            copyPreset(presetRow, status, "Copied " + presetRow.name + ".");
            buttonLabel.text = "COPIED";
            $.Schedule(1.25, function () {
              if (buttonLabel && buttonLabel.IsValid && buttonLabel.IsValid()) buttonLabel.text = "COPY";
            });
          };
        }(row, copyLbl)));
      }
    },

    syncSaveCodeInput: function (config) {
      if (!config || !config.__anitaSaveCodeInput) return;
      if (!config.__anitaSaveCodeInput.IsValid || !config.__anitaSaveCodeInput.IsValid()) return;

      var token = this.getSaveCodeToken(config);
      if (String(config.__anitaSaveCodeInput.text || "") === token) return;

      config.__anitaSaveCodeInput.text = token;
    },

    initWindow: function (root) {
      if (root.FindChildTraverse(CONFIG.IDS.WINDOW)) root.FindChildTraverse(CONFIG.IDS.WINDOW).DeleteAsync(0);
      if (root.FindChildTraverse(CONFIG.IDS.BACKDROP)) root.FindChildTraverse(CONFIG.IDS.BACKDROP).DeleteAsync(0);


      this.backdrop = $.CreatePanel("Panel", root, CONFIG.IDS.BACKDROP);
      this.backdrop.AddClass("AnitaBackdrop");
      this.backdrop.SetPanelEvent("onactivate", () => this.toggle(false));

      this.mainWindow = $.CreatePanel("Panel", root, CONFIG.IDS.WINDOW);
      this.mainWindow.AddClass("AnitaWindow");

      this.mainWindow.canfocus = true;
      this.mainWindow.SetPanelEvent("oncancel", () => this.toggle(false));

      this.mainWindow.SetPanelEvent("onactivate", () => {
        this.mainWindow.SetFocus();
      });

      this.navBar = $.CreatePanel("Panel", this.mainWindow, CONFIG.IDS.NAVBAR);
      this.navBar.AddClass("AnitaNavBar");

      const closeBtn = $.CreatePanel("Button", this.navBar, "");
      closeBtn.AddClass("AnitaCloseBtn");
      closeBtn.SetPanelEvent("onactivate", () => this.toggle(false));

      const sep = $.CreatePanel("Label", this.navBar, "");
      sep.text = "/";
      sep.AddClass("AnitaTabSeparator");

      this.menuArea = $.CreatePanel("Panel", this.navBar, "AnitaTabContainer");
      this.menuArea.AddClass("AnitaTabContainer");
      this.contentArea = $.CreatePanel("Panel", this.mainWindow, CONFIG.IDS.CONTENT);
      this.contentArea.AddClass("AnitaContentArea");
    },

    toggle: function (forceState) {
      if (!this.mainWindow || !this.backdrop) return;
      this.isOpen = (forceState !== undefined) ? forceState : !this.isOpen;

      this.mainWindow.SetHasClass(CONFIG.CLASSES.OPEN, this.isOpen);
      this.mainWindow.hittest = this.isOpen;
      this.backdrop.SetHasClass(CONFIG.CLASSES.OPEN, this.isOpen);
      this.backdrop.hittest = this.isOpen;

      if (this.isOpen) {
        this.mainWindow.SetFocus();
      } else {
        this.hideLocalTooltip();
        if (this.activeColorPickerClose) {
          try {
            this.activeColorPickerClose();
          } catch (closeErr) {}
          this.activeColorPickerClose = null;
        }
        if (this.activeHeroMenuClose) {
          try {
            this.activeHeroMenuClose();
          } catch (heroMenuErr) {}
          this.activeHeroMenuClose = null;
        }
        if (this.activeImportPopupClose) {
          try {
            this.activeImportPopupClose();
          } catch (popupErr) {}
          this.activeImportPopupClose = null;
        }
        $.DispatchEvent("DropInputFocus", this.mainWindow);

        let root = $.GetContextPanel();
        while (root.GetParent()) root = root.GetParent();
        root.SetFocus();
      }
    },

    addTab: function (modTitle, onClick) {
      let displayTitle = modTitle;
      const MAX_CHARS = CONFIG.UI.TAB_MAX_CHARS;
      if (displayTitle.length > MAX_CHARS) displayTitle = displayTitle.substring(0, MAX_CHARS) + "...";

      const btn = $.CreatePanel("Button", this.menuArea, "");
      btn.AddClass("AnitaTabBtn");
      const lbl = $.CreatePanel("Label", btn, "");
      lbl.text = displayTitle;

      const sep = $.CreatePanel("Label", this.menuArea, "");
      sep.text = "/"; sep.AddClass("AnitaTabSeparator");

      btn.SetPanelEvent("onactivate", () => {
        this.menuArea.Children().forEach(c => {
          if (c.paneltype === "Button" && !c.BHasClass("AnitaCloseBtn")) c.RemoveClass("Active");
        });
        btn.AddClass("Active");
        this.activeModTitle = modTitle;
        onClick();
      });

      if (this.menuArea.GetChildCount() <= 4) {
        btn.AddClass("Active");
        this.activeModTitle = modTitle;
        onClick();
      }
    },

    renderModSettings: function (config) {
      this.hideLocalTooltip();
      if (this.activeHeroMenuClose) {
        try {
          this.activeHeroMenuClose();
        } catch (heroMenuErr) {}
        this.activeHeroMenuClose = null;
      }
      if (this.activeImportPopupClose) {
        try {
          this.activeImportPopupClose();
        } catch (popupErr) {}
        this.activeImportPopupClose = null;
      }
      this.contentArea.RemoveAndDeleteChildren();

      this.contentArea.canfocus = true;
      this.contentArea.SetPanelEvent("onactivate", () => this.contentArea.SetFocus());

      const container = $.CreatePanel("Panel", this.contentArea, "");
      container.AddClass("ModContainer");
      container.canfocus = true;

      const bgShield = $.CreatePanel("Panel", container, "BackgroundShield");
      bgShield.style.width = "100%";
      bgShield.style.height = "100%";
      bgShield.style.ignoreParentFlow = "true";
      bgShield.style.zIndex = "-1";
      bgShield.hittest = true;

        const syncAll = () => {
          var now = 0;
          try { now = (new Date()).getTime(); } catch (eNow) {}
          if (config.__anitaLastRenderSyncAt && now - config.__anitaLastRenderSyncAt < 250) return;
          config.__anitaLastRenderSyncAt = now;
          AnitaCore.emitCurrentValues(config, {
            update_source: "ui_resync",
            skip_bridge_persist: true,
            force_emit: true,
            bulk_emit: true
          });
        };

      bgShield.SetPanelEvent("onmouseover", () => {
        syncAll();
      });

      bgShield.SetPanelEvent("onactivate", () => {
        container.SetFocus();
        syncAll();
      });

      const headerRow = $.CreatePanel("Panel", container, "");
      headerRow.AddClass("ModHeaderRow");

      const title = $.CreatePanel("Label", headerRow, "");
      title.text = config.title; title.AddClass("SectionHeader");


      if (String(config.title || "") === "HP Colors") {
        var donateBtn = $.CreatePanel("Button", headerRow, "AnitaDonateBtn");
        donateBtn.AddClass("AnitaDonateBtn");
        donateBtn.hittestchildren = false;
        var donateIcon = $.CreatePanel("Panel", donateBtn, "");
        donateIcon.AddClass("AnitaDonateIcon");
        donateIcon.hittest = false;
        var donateLabel = $.CreatePanel("Label", donateBtn, "");
        donateLabel.text = "Donate";
        donateBtn.SetPanelEvent("onactivate", function () {
          AnitaRenderer.openExternalUrl(HP_DONATION_URL);
        });
        this.attachLocalTooltip(donateBtn, "Support HP Colors on Ko-fi.");
      }

      const line = $.CreatePanel("Panel", container, ""); line.AddClass("SectionHeaderLine");

      if (config.description) {
        const desc = $.CreatePanel("Label", container, "");
        desc.text = config.description; desc.AddClass("ModDescription");
      }

      const activeCategory = this.ensureActiveCategory(config);
      if (this.isPresetBuilderCategory(activeCategory)) {
        this.dismissPresetNotice(config);
      }

      if (this.shouldShowPresetNotice(config)) {
        const notice = $.CreatePanel("Panel", container, "");
        notice.AddClass("AnitaPresetNotice");
        config.__anitaPresetNotice = notice;

        const noticeText = $.CreatePanel("Label", notice, "");
        noticeText.AddClass("AnitaPresetNoticeText");
        noticeText.text = "Settings reset after restart. Build a preset VPK to keep them.";

        const noticeBtn = $.CreatePanel("Button", notice, "");
        noticeBtn.AddClass("AnitaPresetNoticeBtn");
        const noticeBtnLabel = $.CreatePanel("Label", noticeBtn, "");
        noticeBtnLabel.text = "PRESETS";
        noticeBtn.SetPanelEvent("onactivate", () => {
          AnitaRenderer.selectPresetBuilder(config);
        });
      } else {
        config.__anitaPresetNotice = null;
      }

      const shell = $.CreatePanel("Panel", container, "");
      shell.AddClass("AnitaSettingsShell");

      const treePanel = $.CreatePanel("Panel", shell, "");
      treePanel.AddClass("AnitaTreePanel");

      const treeHeader = $.CreatePanel("Label", treePanel, "");
      treeHeader.text = "Settings";
      treeHeader.AddClass("AnitaTreeHeader");

      const treeList = $.CreatePanel("Panel", treePanel, "");
      treeList.AddClass("AnitaTreeList");

      const detailPanel = $.CreatePanel("Panel", shell, "");
      detailPanel.AddClass("AnitaDetailPanel");

      const categoryCache = this.ensureCategoryCache(config);
      const groupedCategories = categoryCache.groupedCategories;

      // Render Tree
      for (var mainCat in groupedCategories) {
        if (!Object.prototype.hasOwnProperty.call(groupedCategories, mainCat)) continue;
        
        var mainBtn = $.CreatePanel("Button", treeList, "");
        mainBtn.AddClass("AnitaMainCategoryBtn");
        if (mainCat === "PRESETS") mainBtn.AddClass("AnitaPresetMainCategoryBtn");
        
        var mainLabel = $.CreatePanel("Label", mainBtn, "");
        mainLabel.AddClass("AnitaMainCategoryLabel");
        mainLabel.text = mainCat;

        var subCats = groupedCategories[mainCat];
        var isMainActive = false;
        for (var i = 0; i < subCats.length; i++) {
          if (subCats[i].full === activeCategory) {
            isMainActive = true;
            break;
          }
        }
        mainBtn.SetHasClass("Active", isMainActive);

        // Click main category to open/activate its first subcategory
        mainBtn.SetPanelEvent("onactivate", function (firstSub) {
          return function () {
            if (config.__anitaActiveCategory !== firstSub) {
              config.__anitaActiveCategory = firstSub;
              AnitaRenderer.renderModSettings(config);
            }
          };
        }(subCats[0].full));

        if (isMainActive) {
          for (var s = 0; s < subCats.length; s++) {
            var subData = subCats[s];
            var subBtn = $.CreatePanel("Button", treeList, "");
            subBtn.AddClass("AnitaSubCategoryBtn");
            if (mainCat === "PRESETS") subBtn.AddClass("AnitaPresetSubCategoryBtn");
            subBtn.SetHasClass("Active", subData.full === activeCategory);

            var subLabel = $.CreatePanel("Label", subBtn, "");
            subLabel.AddClass("AnitaSubCategoryLabel");
            subLabel.text = subData.sub;

            var subCount = $.CreatePanel("Label", subBtn, "");
            subCount.AddClass("AnitaSubCategoryCount");
            subCount.text = String(subData.count || 0);

            subBtn.SetPanelEvent("onactivate", function (nextCategory) {
              return function () {
                config.__anitaActiveCategory = nextCategory;
                AnitaRenderer.renderModSettings(config);
              };
            }(subData.full));
          }
        }
      }

      const detailHeaderRow = $.CreatePanel("Panel", detailPanel, "");
      detailHeaderRow.AddClass("AnitaDetailHeaderRow");

      const detailHeader = $.CreatePanel("Label", detailHeaderRow, "");
      detailHeader.text = this.isPresetBuilderCategory(activeCategory) ? "PRESET BUILDER" : (activeCategory || config.title);
      detailHeader.AddClass("AnitaDetailHeader");

      function flashHeaderAction(button, label, text) {
        if (!button || !button.IsValid || !button.IsValid()) return;
        if (!label || !label.IsValid || !label.IsValid()) return;
        var previous = label.text;
        label.text = text;
        button.AddClass("AnitaHeaderActionBtnSuccess");
        $.Schedule(1.25, function () {
          if (label && label.IsValid && label.IsValid()) label.text = previous;
          if (button && button.IsValid && button.IsValid()) button.RemoveClass("AnitaHeaderActionBtnSuccess");
        });
      }

      function makeHeaderActionButton(parent, labelText) {
        var button = $.CreatePanel("Button", parent, "");
        button.AddClass("AnitaHeaderActionBtn");
        var label = $.CreatePanel("Label", button, "");
        label.text = labelText;
        return { btn: button, lbl: label };
      }

      function emitHeaderReset(button, label, flashText) {
        AnitaPersistence.persistConfig(config, true);
        AnitaRenderer.syncSaveCodeInput(config);
        flashHeaderAction(button, label, flashText);
        AnitaRenderer.renderModSettings(config);
        AnitaCore.emitCurrentValues(config, {
          update_source: "ui_reset",
          force_persist: true,
          force_emit: true,
          bulk_emit: true
        });
      }

      function resetAllFromHeader(button, label) {
        if (AnitaRenderer.activeImportPopupClose) {
          try { AnitaRenderer.activeImportPopupClose(); } catch (closeErr) {}
        }
        var presetBuilderState = AnitaRenderer.capturePresetBuilderState(config);
        AnitaPersistence.applyResolvedValues(config, {});
        AnitaRenderer.restorePresetBuilderState(config, presetBuilderState);
        emitHeaderReset(button, label, "Reset");
      }

      function resetPageFromHeader(button, label) {
        if (AnitaRenderer.activeImportPopupClose) {
          try { AnitaRenderer.activeImportPopupClose(); } catch (closeErr) {}
        }
        var elements = AnitaRenderer.getCategoryElements(config, activeCategory);
        var changed = false;
        for (var resetIndex = 0; resetIndex < elements.length; resetIndex++) {
          var element = elements[resetIndex];
          if (!AnitaPersistence.shouldPersistElement(element)) continue;
          var nextValue = AnitaPersistence.sanitizeValue(element, element.defaultValue);
          if (element.currentValue !== nextValue) changed = true;
          element.currentValue = nextValue;
        }
        if (!elements.length || AnitaRenderer.isPresetBuilderCategory(activeCategory)) {
          flashHeaderAction(button, label, "None");
          return;
        }
        emitHeaderReset(button, label, changed ? "Reset" : "Same");
      }

      if (this.hasPresetBuilder(config)) {
        var headerActions = $.CreatePanel("Panel", detailHeaderRow, "");
        headerActions.AddClass("AnitaHeaderActions");
        var resetPageHeader = makeHeaderActionButton(headerActions, "Page");
        this.attachLocalTooltip(
          resetPageHeader.btn,
          this.isPresetBuilderCategory(activeCategory)
            ? "PAGE reset does nothing here. Preset Builder has no page settings."
            : "PAGE resets only this page. Other pages stay unchanged."
        );
        resetPageHeader.btn.SetPanelEvent("onactivate", function () {
          resetPageFromHeader(resetPageHeader.btn, resetPageHeader.lbl);
        });
        var resetAllHeader = makeHeaderActionButton(headerActions, "All");
        this.attachLocalTooltip(resetAllHeader.btn, "ALL resets HP settings. Saved presets stay.");
        resetAllHeader.btn.SetPanelEvent("onactivate", function () {
          resetAllFromHeader(resetAllHeader.btn, resetAllHeader.lbl);
        });
      }

      const detailHint = $.CreatePanel("Label", detailPanel, "");
      detailHint.text = this.isPresetBuilderCategory(activeCategory)
        ? "Use the web builder for restart-safe preset VPK generation."
        : "Select a setting group from the tree on the left.";
      detailHint.AddClass("AnitaDetailHint");

      const detailBody = $.CreatePanel("Panel", detailPanel, "");
      detailBody.AddClass("AnitaDetailBody");

      const settingsList = $.CreatePanel("Panel", detailBody, "");
      settingsList.AddClass("AnitaSettingsList");

      if (this.isPresetBuilderCategory(activeCategory)) {
        this.renderPresetBuilderPanel(settingsList, config);
      } else if (config.elements) {
        config.elements.forEach(el => {
          el.__anitaRowPanel = null;
        });
        this.getCategoryElements(config, activeCategory).forEach(el => {
          var row = null;
          switch (el.type) {
            case "toggle": row = AnitaComponents.createToggle(settingsList, el, config.title); break;
            case "stepper": row = AnitaComponents.createStepper(settingsList, el, config.title); break;
            case "slider": row = AnitaComponents.createSlider(settingsList, el, config.title); break;
            case "button": row = AnitaComponents.createButton(settingsList, el, config.title); break;
            case "cycler": row = AnitaComponents.createCycler(settingsList, el, config.title); break;
            case "positionpicker": row = AnitaComponents.createPositionPicker(settingsList, el, config.title); break;
            case "colorpicker": row = AnitaComponents.createColorPicker(settingsList, el, config.title); break;
          }
          el.__anitaRowPanel = row || null;
        });
        this.refreshConditionalVisibility(config);
      }

      // Footer: Reset / Import (only for mods with storageNamespace)
      if (config.storageNamespace) {
        var footerWrap = $.CreatePanel("Panel", treePanel, "");
        footerWrap.AddClass("AnitaTreeFooter");

        var footer = $.CreatePanel("Panel", footerWrap, "");
        footer.AddClass("AnitaFooterRow");
        function makeFooterBtn(parent, label, id) {
          var btn = $.CreatePanel("Button", parent, id || "");
          btn.AddClass("AnitaFooterBtn");
          var lbl = $.CreatePanel("Label", btn, "");
          lbl.text = label;
          return { btn: btn, lbl: lbl };
        }

        function flashLabel(btn, lbl, msg, durationSec) {
          if (!btn || !btn.IsValid || !btn.IsValid()) return;
          if (!lbl || !lbl.IsValid || !lbl.IsValid()) return;
          var orig = lbl.text;
          lbl.text = msg;
          btn.AddClass("AnitaFooterBtnSuccess");
          $.Schedule(durationSec, function () {
            if (lbl && lbl.IsValid()) lbl.text = orig;
            if (btn && btn.IsValid()) btn.RemoveClass("AnitaFooterBtnSuccess");
          });
        }

        var importPopupPanel = null;
        var importPopupInput = null;
        var importPopupApplyBtn = null;

        function closeImportPopup() {
          if (importPopupPanel && importPopupPanel.IsValid && importPopupPanel.IsValid()) {
            importPopupPanel.DeleteAsync(0);
          }
          importPopupPanel = null;
          importPopupInput = null;
          importPopupApplyBtn = null;
          config.__anitaImportCodeInput = null;
          if (AnitaRenderer.activeImportPopupClose === closeImportPopup) {
            AnitaRenderer.activeImportPopupClose = null;
          }
        }

        function openImportPopup() {
          if (importPopupPanel && importPopupPanel.IsValid && importPopupPanel.IsValid()) {
            if (importPopupInput && importPopupInput.IsValid && importPopupInput.IsValid()) {
              importPopupInput.SetFocus();
            }
            return;
          }

          if (AnitaRenderer.activeImportPopupClose &&
              AnitaRenderer.activeImportPopupClose !== closeImportPopup) {
            try {
              AnitaRenderer.activeImportPopupClose();
            } catch (closeErr) {}
          }

          var popupParent = $.GetContextPanel();
          importPopupPanel = $.CreatePanel("Panel", popupParent, "");
          AnitaRenderer.activeImportPopupClose = closeImportPopup;
          importPopupPanel.AddClass("AnitaImportPopup");
          importPopupPanel.style.align = "center center";
          importPopupPanel.style.ignoreParentFlow = true;
          importPopupPanel.style.flowChildren = "down";
          importPopupPanel.style.uiScale = "100%";
          importPopupPanel.SetPanelEvent("oncancel", closeImportPopup);

          var header = $.CreatePanel("Panel", importPopupPanel, "");
          header.AddClass("AnitaImportPopupHeader");

          var title = $.CreatePanel("Label", header, "");
          title.AddClass("AnitaImportPopupTitle");
          title.text = "Import Code";

          var headerClose = $.CreatePanel("Button", header, "");
          headerClose.AddClass("AnitaColorPopupBtn");
          headerClose.AddClass("AnitaImportCloseBtn");
          var headerCloseLbl = $.CreatePanel("Label", headerClose, "");
          headerCloseLbl.AddClass("AnitaImportCloseLabel");
          headerCloseLbl.text = "X";
          headerClose.SetPanelEvent("onactivate", closeImportPopup);

          var hint = $.CreatePanel("Label", importPopupPanel, "");
          hint.AddClass("AnitaImportPopupHint");
          hint.text = "Paste a preset code or settings token to apply it to HP Colors.";

          var importRow = $.CreatePanel("Panel", importPopupPanel, "");
          importRow.AddClass("AnitaPasteRow");
          importRow.hittest = true;

          importPopupInput = $.CreatePanel("TextEntry", importRow, "");
          importPopupInput.AddClass("AnitaPasteInput");
          importPopupInput.placeholder = "Paste custom preset code here...";
          config.__anitaImportCodeInput = importPopupInput;

          importPopupApplyBtn = makeFooterBtn(importRow, "Apply", "");
          importPopupApplyBtn.btn.AddClass("AnitaImportApplyBtn");

          function applySaveCodeInput() {
            if (!importPopupInput || !importPopupInput.IsValid || !importPopupInput.IsValid()) return;

            var text = String(importPopupInput.text || "").trim();
            if (!text) { flashLabel(importPopupApplyBtn.btn, importPopupApplyBtn.lbl, "Empty", 1.5); return; }

            var result = AnitaRenderer.applyImportCode(config, text, "import_popup");
            if (!result.ok) {
              flashLabel(importPopupApplyBtn.btn, importPopupApplyBtn.lbl, result.status || "Invalid", 1.5);
              return;
            }
            closeImportPopup();
            AnitaRenderer.renderModSettings(config);
          }

          importPopupApplyBtn.btn.SetPanelEvent("onactivate", applySaveCodeInput);
          importPopupInput.SetPanelEvent("ontextentrysubmit", applySaveCodeInput);
          $.Schedule(0.0, function () {
            if (importPopupInput && importPopupInput.IsValid && importPopupInput.IsValid()) {
              importPopupInput.SetFocus();
            }
          });
        }

        function emitResetAndRender(button, label, flashText) {
          AnitaPersistence.persistConfig(config, true);
          AnitaRenderer.syncSaveCodeInput(config);
          flashLabel(button, label, flashText, 1.5);
          AnitaRenderer.renderModSettings(config);
          AnitaCore.emitCurrentValues(config, {
            update_source: "ui_reset",
            force_persist: true,
            force_emit: true,
            bulk_emit: true
          });
        }

        function resetAllSettings(button, label) {
          if (AnitaRenderer.activeImportPopupClose === closeImportPopup) {
            closeImportPopup();
          }
          AnitaPersistence.applyResolvedValues(config, {});
          emitResetAndRender(button, label, "Reset");
        }

        if (AnitaRenderer.hasPresetBuilder(config)) {
          footer.AddClass("AnitaFooterRowHpReset");

          var presetB = makeFooterBtn(footer, "Preset", "");
          presetB.btn.AddClass("AnitaFooterBtnPreset");
          presetB.btn.SetPanelEvent("onactivate", function () {
            if (AnitaRenderer.activeImportPopupClose === closeImportPopup) {
              closeImportPopup();
            }
            AnitaRenderer.selectPresetBuilder(config);
          });
        }

        var resetB = makeFooterBtn(footer, "Reset", "");
        resetB.btn.SetPanelEvent("onactivate", function () {
          resetAllSettings(resetB.btn, resetB.lbl);
        });

        var importToggleBtn = makeFooterBtn(footer, "Import", "");
        importToggleBtn.btn.SetPanelEvent("onactivate", function () {
          openImportPopup();
        });

      }
    },

  }

  const AnitaCore = {
    registeredMods: [],

    init: function () {
      const root = this.getRoot($.GetContextPanel());
      AnitaRenderer.initWindow(root);

      root.AnitaUI = {
        GetVersion: () => CONFIG.VERSION,
        Register: (config) => this.registerMod(config),
        Toggle: () => AnitaRenderer.toggle(),
        IsReady: () => true
      };

      this.setupEventListener();
      this.createOverlayButton(root);
      this.monitorEscapeMenu(root);
      if (this.registeredMods.length === 0) {
        this.registerMod({
          title: "Anita-UI",
          description: "No detected mods. Check your installed mods.",
          isDummy: true,
          elements: []
        });
      }

      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_ALIVE"
      }));
    },

    registerMod: function (config) {
      if (this.registeredMods.length === 1 && this.registeredMods[0].isDummy) {
        this.registeredMods = [];
        AnitaRenderer.menuArea.RemoveAndDeleteChildren();
        AnitaRenderer.contentArea.RemoveAndDeleteChildren();
      }

      AnitaPersistence.hydrateConfig(config);
      applyHpOptimizedHardGates(config);

      for (let i = 0; i < this.registeredMods.length; i++) {
        if (this.registeredMods[i].title === config.title) {
          return;
        }
      }
      if (config.title === "HP Colors") {
        writeHpSharedSnapshot(config);
        publishHpPresetSnapshot(config, "register_startup", true);
        startHpMatchResetMonitor(config);
        applyHpColorsBakedPresetOnce(config);
      }
      this.registeredMods.push(config);
      AnitaRenderer.addTab(config.title, () => {
        AnitaRenderer.renderModSettings(config);
      });
      this.updateWindowWidth();
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_HANDSHAKE",
        mod_title: config.title
      }));
      if (config.title === "HP Colors") {
        this.emitPortableSync(config, "register_startup");
        this.queueHpColorsStartupSyncBurst(config, "register_startup");
      }
      AnitaPersistence.requestBootstrap(config, "core_handshake");
    },

    emitCurrentValues: function (config, meta) {
      if (!config || !Array.isArray(config.elements)) return;
      var forceEmit = !!(meta && meta.force_emit);
      var bulkEmit = !!(meta && meta.bulk_emit);
      applyHpOptimizedHardGates(config);
      if (config.title === "HP Colors") {
        writeHpSharedSnapshot(config);
        publishHpPresetSnapshot(config, meta && meta.update_source ? meta.update_source : "current_values", false);
      }
      if (!config.__anitaLastEmittedValues) config.__anitaLastEmittedValues = {};
      var lastValues = config.__anitaLastEmittedValues;
      var values = {};
      var hasValues = false;
      for (var i = 0; i < config.elements.length; i++) {
        var element = config.elements[i];
        if (!element || !element.id || element.currentValue === undefined) continue;
        var value = AnitaPersistence.sanitizeValue(element, element.currentValue);
        element.currentValue = value;
        values[element.id] = value;
        hasValues = true;
      }
      if (!hasValues) return;
      if (bulkEmit) {
        emitBulkUpdate(config.title, values, meta);
        for (var bulkId in values) {
          if (Object.prototype.hasOwnProperty.call(values, bulkId)) {
            lastValues[bulkId] = values[bulkId];
          }
        }
      } else {
        for (var id in values) {
          if (Object.prototype.hasOwnProperty.call(values, id)) {
            if (!forceEmit && Object.prototype.hasOwnProperty.call(lastValues, id) &&
                lastValues[id] === values[id]) {
              continue;
            }
            emitUpdate(config.title, id, values[id], meta);
          }
        }
      }
    },

    findRegisteredMod: function (modTitle) {
      for (var i = 0; i < this.registeredMods.length; i++) {
        if (this.registeredMods[i] && this.registeredMods[i].title === modTitle) {
          return this.registeredMods[i];
        }
      }
      return null;
    },

    emitPortableSync: function (config, reason) {
      if (!config || config.title !== "HP Colors") return;
      this.emitCurrentValues(config, {
        update_source: "core_auto_resync",
        skip_bridge_persist: true,
        sync_reason: String(reason || "tick"),
        force_emit: true,
        bulk_emit: true
      });
    },

    queuePortableSyncBurst: function (config, reason) {
      if (!config || config.title !== "HP Colors") return;
      var token = (config.__anitaPortableSyncBurstToken || 0) + 1;
      config.__anitaPortableSyncBurstToken = token;
      var delays = [0.35, 1.0, 2.0];
      for (var i = 0; i < delays.length; i++) {
        (function (delaySec, burstToken, burstIndex) {
          $.Schedule(delaySec, function () {
            if (!config || config.__anitaPortableSyncBurstToken !== burstToken) return;
            AnitaCore.emitPortableSync(config, String(reason || "burst") + "_" + String(burstIndex + 1));
          });
        })(delays[i], token, i);
      }
    },

    queueHpColorsStartupSyncBurst: function (config, reason) {
      if (!config || config.title !== "HP Colors") return;
      var token = (config.__hpColorsStartupSyncToken || 0) + 1;
      config.__hpColorsStartupSyncToken = token;
      var delays = [0.25, 1.0, 2.25, 5.0];
      for (var i = 0; i < delays.length; i++) {
        (function (delaySec, burstToken, burstIndex) {
          $.Schedule(delaySec, function () {
            if (!config || config.__hpColorsStartupSyncToken !== burstToken) return;
            AnitaCore.emitPortableSync(config, String(reason || "startup") + "_" + String(burstIndex + 1));
          });
        })(delays[i], token, i);
      }
    },

    startPortableSyncLoop: function (config) {
      if (!config || config.title !== "HP Colors") return;
      config.__anitaPortableSyncReason = String(config.__anitaPortableSyncReason || "update");
      if (config.__anitaPortableSyncLoopStarted) return;
      config.__anitaPortableSyncLoopStarted = true;
      config.__anitaPortableSyncTicks = 0;

      var tick = () => {
        if (!config) return;
        if (this.findRegisteredMod(config.title) !== config) {
          config.__anitaPortableSyncLoopStarted = false;
          return;
        }
        config.__anitaPortableSyncTicks = (config.__anitaPortableSyncTicks || 0) + 1;
        this.emitPortableSync(config, "heartbeat_" + String(config.__anitaPortableSyncReason || "update"));
        if (config.__anitaPortableSyncTicks >= 4) {
          config.__anitaPortableSyncLoopStarted = false;
          return;
        }
        $.Schedule(3.0, tick);
      };

      $.Schedule(3.0, tick);
    },

    handleBulkUpdateEvent: function (data) {
      if (!data || !data.mod_title || !data.values || typeof data.values !== "object") return;
      var config = this.findRegisteredMod(data.mod_title);
      if (!config) return;

      var updateSource = String(data.update_source || "");
      var isBootstrap = updateSource === "bridge_bootstrap";
      var isReplaySource = isBootstrap ||
        updateSource === "ui_resync" ||
        updateSource === "ui_reset" ||
        updateSource === "ui_code_apply" ||
        updateSource === "baked_preset_apply" ||
        updateSource === "core_auto_resync" ||
        updateSource === "ui_refresh_after_apply";

      var changed = false;
      var visibilityDirtyIds = [];
      for (var settingId in data.values) {
        if (!Object.prototype.hasOwnProperty.call(data.values, settingId)) continue;
        var targetElement = AnitaRenderer.findElementById(config, settingId);
        var before = targetElement ? targetElement.currentValue : null;
        if (!AnitaPersistence.applyUpdate(config, settingId, data.values[settingId])) continue;
        if (AnitaRenderer.hasVisibilityDependents(config, settingId)) visibilityDirtyIds.push(settingId);
        targetElement = targetElement || AnitaRenderer.findElementById(config, settingId);
        if (targetElement && targetElement.currentValue !== before) changed = true;
      }
      var hardGateChanged = applyHpOptimizedHardGates(config);
      if (hardGateChanged) {
        changed = true;
        visibilityDirtyIds = [];
      }

      AnitaRenderer.syncSaveCodeInput(config);
      if (isBootstrap) config.__anitaBootstrapReceived = true;

      if (isBootstrap || hardGateChanged) {
        AnitaRenderer.refreshConditionalVisibility(config);
      } else if (visibilityDirtyIds.length) {
        AnitaRenderer.refreshChangedDependentsVisibility(config, visibilityDirtyIds);
      }

      if (config.title === "HP Colors" && changed) {
        writeHpSharedSnapshot(config);
      }

      if (!isReplaySource && config.title === "HP Colors" && changed) {
        config.__anitaPortableSyncReason = "bulk_update";
        this.emitPortableSync(config, "bulk_update_immediate");
        this.queuePortableSyncBurst(config, "bulk_update");
        this.startPortableSyncLoop(config);
      }

      if (data.skip_bridge_persist || isReplaySource) return;
      var writeToken = (config.__anitaPendingWriteToken || 0) + 1;
      config.__anitaPendingWriteToken = writeToken;
      $.Schedule(2.0, function () {
        if (!config || config.__anitaPendingWriteToken !== writeToken) return;
        AnitaPersistence.persistConfig(config, !!data.force_persist);
      });
    },

    handleUpdateEvent: function (data) {
      if (!data || !data.mod_title || !data.setting_id) return;
      var config = this.findRegisteredMod(data.mod_title);
      if (!config) return;
      var updateSource = String(data.update_source || "");
      var isBootstrap = updateSource === "bridge_bootstrap";
      var isReplaySource = isBootstrap ||
        updateSource === "ui_resync" ||
        updateSource === "ui_reset" ||
        updateSource === "ui_code_apply" ||
        updateSource === "baked_preset_apply" ||
        updateSource === "core_auto_resync" ||
        updateSource === "ui_refresh_after_apply";
      if (!AnitaPersistence.applyUpdate(config, data.setting_id, data.value)) {
        return;
      }
      var hardGateChanged = applyHpOptimizedHardGates(config);
      AnitaRenderer.syncSaveCodeInput(config);
      if (isBootstrap) {
        config.__anitaBootstrapReceived = true;
      }

      if (!isReplaySource && updateSource !== "ui_color_drag" && config.title === "HP Colors") {
        config.__anitaPortableSyncReason = "update_" + String(data.setting_id);
        this.emitPortableSync(config, "update_" + String(data.setting_id) + "_immediate");
        this.queuePortableSyncBurst(config, "update_" + String(data.setting_id));
        this.startPortableSyncLoop(config);
      }

      if (updateSource !== "ui_color_drag") {
        var writeToken = (config.__anitaPendingWriteToken || 0) + 1;
        config.__anitaPendingWriteToken = writeToken;
        $.Schedule(2.0, function () {
          if (!config || config.__anitaPendingWriteToken !== writeToken) return;
          AnitaPersistence.persistConfig(config, false);
        });
      }

      if (hardGateChanged || isBootstrap) {
        AnitaRenderer.refreshConditionalVisibility(config);
        return;
      }
      if (AnitaRenderer.hasVisibilityDependents(config, data.setting_id)) {
        AnitaRenderer.refreshDependentVisibility(config, data.setting_id);
        return;
      }
    },

    handleBootstrapRequest: function (data) {
      if (!data || !data.mod_title) return;
      var config = this.findRegisteredMod(data.mod_title);
      if (!config) {
        return;
      }
      if (data.mod_title === "HP Colors") {
        if (!config.__anitaPortableSyncLoopStarted) {
          config.__anitaPortableSyncReason = String(config.__anitaPortableSyncReason || "bootstrap_request");
          this.startPortableSyncLoop(config);
        }
      }
      this.emitCurrentValues(config, {
        update_source: "bridge_bootstrap",
        skip_bridge_persist: true,
        bootstrap_reason: String(data.reason || "request"),
        force_emit: true,
        bulk_emit: true
      });
    },

    handlePresetSnapshotRequest: function (data) {
      if (data && data.mod_title && data.mod_title !== "HP Colors") return;
      var config = this.findRegisteredMod("HP Colors");
      if (!config) return;
      writeHpSharedSnapshot(config);
      publishHpPresetSnapshot(config, data && data.reason ? data.reason : "preset_request", true);
    },

    updateWindowWidth: function () {
      if (!AnitaRenderer.mainWindow) return;

      const count = this.registeredMods.length;
      let width = null;

      if (count === 1 && this.registeredMods[0].isDummy) {
        width = 500;
      } else if (count <= 4) {
        width = count * 300;
      }

      if (width) {
        AnitaRenderer.mainWindow.style.minWidth = width + "px";
      } else {
        AnitaRenderer.mainWindow.style.minWidth = "90%";
      }
    },

    setupEventListener: function () {
      try {
        $.RegisterForUnhandledEvent("ClientUI_FireOutput", (payload) => {
          if (typeof payload === "string" &&
              payload.indexOf("ANITA_") === -1 &&
              payload.indexOf(HP_PRESET_REQUEST_MAGIC) === -1) return;
          try {
            let data = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            if (data && data.magic_word === "ANITA_REGISTER") {
              this.registerMod(data.config);
            } else if (data && data.magic_word === HP_PRESET_REQUEST_MAGIC) {
              this.handlePresetSnapshotRequest(data);
            } else if (data && data.magic_word === "ANITA_REQUEST_BOOTSTRAP") {
              this.handleBootstrapRequest(data);
            } else if (data && data.magic_word === "ANITA_BULK_UPDATE") {
              this.handleBulkUpdateEvent(data);
            } else if (data && data.magic_word === "ANITA_UPDATE") {
              this.handleUpdateEvent(data);
            }
          } catch (e) {
          }
        });
      } catch (e) {
      }
    },

    createOverlayButton: function (parent) {
      const existing = parent.FindChildTraverse(CONFIG.IDS.OVERLAY_BTN);
      if (existing) existing.DeleteAsync(0);

      const btn = $.CreatePanel("Button", parent, CONFIG.IDS.OVERLAY_BTN);
      btn.AddClass("AnitaOverlayBtn");
      this._overlayBtn = btn;

      btn.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", btn, "Anita-UI Settings"));
      btn.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", btn));

      btn.SetPanelEvent("onactivate", () => AnitaRenderer.toggle());
    },

    monitorEscapeMenu: function (root) {
      let hudPanel = this._hudPanel;
      let btn = this._overlayBtn;
      let nextDelay = CONFIG.UI.MONITOR_INTERVAL;

      if (!hudPanel || !hudPanel.IsValid || !hudPanel.IsValid()) {
        hudPanel = root.FindChildTraverse(CONFIG.IDS.HUD_ROOT);
        if (!hudPanel) {
          let p = $.GetContextPanel();
          while (p) {
            if (p.id === CONFIG.IDS.HUD_ROOT) { hudPanel = p; break; }
            p = p.GetParent();
          }
        }
        this._hudPanel = hudPanel || null;
      }

      if (!btn || !btn.IsValid || !btn.IsValid()) {
        btn = root.FindChildTraverse(CONFIG.IDS.OVERLAY_BTN);
        this._overlayBtn = btn || null;
      }

      if (typeof this._lastEscapeState !== "boolean") this._lastEscapeState = false;

      if (hudPanel && btn) {
        const isMenuOpen = hudPanel.BHasClass(CONFIG.CLASSES.ESCAPE_MENU);
        const stateChanged = this._lastEscapeState !== isMenuOpen;

        if (stateChanged || !btn.BHasClass(CONFIG.CLASSES.VISIBLE)) {
          btn.SetHasClass(CONFIG.CLASSES.VISIBLE, isMenuOpen);
        }
        if (!!btn.hittest !== isMenuOpen) {
          btn.hittest = isMenuOpen;
        }

        if (stateChanged) {
          if (isMenuOpen) {
            const attentionToken = (this._attentionToken || 0) + 1;
            this._attentionToken = attentionToken;
            btn.AddClass(CONFIG.CLASSES.ATTENTION);
            $.Schedule(4.0, () => {
              if (this._attentionToken !== attentionToken) return;
              if (btn && btn.IsValid && btn.IsValid()) {
                btn.RemoveClass(CONFIG.CLASSES.ATTENTION);
              }
            });
          } else {
            btn.RemoveClass(CONFIG.CLASSES.ATTENTION);
          }
        }

        this._lastEscapeState = isMenuOpen;

        if (!isMenuOpen && AnitaRenderer.isOpen) {
          AnitaRenderer.toggle(false);
        }

        nextDelay = isMenuOpen ? CONFIG.UI.MONITOR_INTERVAL : Math.max(CONFIG.UI.MONITOR_INTERVAL * 16, 0.75);
      } else {
        nextDelay = Math.max(CONFIG.UI.MONITOR_INTERVAL * 16, 0.75);
      }

      $.Schedule(nextDelay, () => this.monitorEscapeMenu(root));
    },

    getRoot: function (p) {
      while (p.GetParent && p.GetParent()) p = p.GetParent();
      return p;
    }
  };

  AnitaCore.init();

})();
