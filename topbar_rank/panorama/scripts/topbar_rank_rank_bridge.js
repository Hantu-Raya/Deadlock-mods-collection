(() => {
  "use strict";

  var BRIDGE_KEY = "__TopbarRankBridge";
  var SHARED_KEY = "__TopbarRankShared";
  var BRIDGE_VERSION = 1;
  var CACHE_VERSION = String(BRIDGE_VERSION);
  var RANK_API_URL_PREFIX = "https://api.deadlock-api.com/v1/players/";
  var RANK_IMAGE_URL_SUFFIX = "/rank-predict/image?format=webp";
  var TEAM_AVERAGE_API_URL_PREFIX = "https://api.deadlock-api.com/v1/players/rank-predict/image?account_ids=";
  var TEAM_AVERAGE_API_URL_SUFFIX = "&format=webp";
  var STATLOCKER_MATCHES_URL_PREFIX = "https://statlocker.gg/profile/";
  var STATLOCKER_MATCHES_URL_SUFFIX = "/matches";
  var STEAM64_BASE = "76561197960265728";
  var STEAMID3_PATTERN = /^\[U:1:(\d+)\]$/i;
  var MIN_ACCOUNT_ID = 100000;
  var MAX_ACCOUNT_ID = 4294967295;
  var MAX_CACHE_ENTRIES = 24;
  var TOPBAR_PLAYER_CLASS = "TopbarRankTopBarPlayer";
  var TOPBAR_IMAGE_CLASS = "TopbarRankRankImage";
  var TOPBAR_VISIBLE_CLASS = "TopbarRankRankVisible";
  var TOPBAR_STATUS_IMAGE_CLASS = "TopbarRankStatusImage";
  var TOPBAR_STATUS_VISIBLE_CLASS = "TopbarRankStatusVisible";
  var TOPBAR_STATUS_LOADING_CLASS = "TopbarRankStatusLoading";
  var TEAM_AVERAGE_VISIBLE_CLASS = "TopbarRankTeamAverageRankVisible";
  var PLAYER_LIST_RANK_VISIBLE_CLASS = "TopbarRankPlayerListRankVisible";
  var TEAM_AVERAGE_REQUIRED_ACCOUNTS = 6;
  var PLAYER_LIST_ROW_CLASS = "TopbarRankPlayersListEntry";
  var REQUIRED_LOADED = 11;
  var MATCH_ACTIVE_GAME_STATE = 6;
  var MANUAL_TARGET_TTL_MS = 1500;
  var MANUAL_ALIAS_TTL_MS = 1200;
  var SIM_ACTIVE_TTL_MS = 7000;
  var SIM_PROBE_MAX_ATTEMPTS_PER_ROW = 2;
  var ESCAPE_AUTO_ACTIVE_TTL_MS = 26000;
  var ESCAPE_AUTO_RECENT_COMPLETE_MS = 2500;
  var ESCAPE_AUTO_TOPBAR_RETRY_THROTTLE_MS = 350;
  var TOPBAR_READY_WAIT_RETRY_MAX = 50;
  var TOPBAR_READY_WAIT_FAST_RETRY_MAX = 20;
  var TOPBAR_READY_WAIT_SLOW_RETRY_DELAY_SECONDS = 1.5;
  var PROFILE_QUARANTINE_TTL_MS = 1800;
  var CONTEXT_CLEANUP_DELAY_SECONDS = 0.5;
  var ESCAPE_ROW_READY_COALESCE_DELAY_SECONDS = 0.05;
  var ESCAPE_AUTO_READY_RETRY_DELAY_SECONDS = 0.5;
  var ESCAPE_OPEN_WATCH_FAST_RETRY_MAX = 8;
  var ESCAPE_OPEN_WATCH_RETRY_MAX = 40;
  var ESCAPE_OPEN_WATCH_FAST_DELAY_SECONDS = 0.15;
  var ESCAPE_OPEN_WATCH_SLOW_DELAY_SECONDS = 1.0;
  var ESCAPE_AUTO_CONTINUE_PACE_DELAY_SECONDS = 0.03;
  var TOPBAR_MISSING_RANK_IMAGE_URL = "s2r://panorama/images/ranked/badges/rank0/badge_sm_psd.vtex";
  var TOPBAR_LOADING_SPINNER_IMAGE_URL = "s2r://panorama/images/control_icons/spinner_png.vtex";
  var TOPBAR_LOADING_TIMEOUT_SECONDS = 20.0;
  var PROFILE_TOOLTIP_ACTIVE_WATCH_MS = 45000;
  var PROFILE_TOOLTIP_FAST_WATCH_MS = 2500;
  var PROFILE_TOOLTIP_FAST_WATCH_INTERVAL = 0.2;
  var PROFILE_TOOLTIP_IDLE_WATCH_INTERVAL = 1.0;
  var DEFAULT_VERIFIED_SIM_METHOD = "DispatchEvent.ActivatedWithMouse";
  var DEFAULT_VERIFIED_SIM_TARGET = "MainContents";
  var TOPBAR_VERIFIED_SIM_TARGET = "TopBarPlayerName";
  var HIDEOUT_CLASS_NAMES = ["connectedToHideout", "connectedtoHideout", "connectedtohideout", "connectedToHideOut", "InHideout", "inHideoutIntro"];
  var LOBBY_OR_PREGAME_CLASS_NAMES = ["GameStatePreGame", "GameStatePreGameWait", "connectedToHideout", "connectedtoHideout", "connectedtohideout", "connectedToHideOut", "InHideout", "inHideoutIntro"];
  var ACTIVE_SPECTATOR_CLASS_NAMES = ["spec_mode", "replay_playback", "deathReplayActive", "TeamSpectator"];
  var SCOREBOARD_OPEN_CLASS = "gScoreboardOpen";
  var MINIMAP_SIGNAL_PANEL_IDS = ["minimap_persp", "minimap_container", "HudMinimapContainer", "hud_minimap"];
  var MINIMAP_HIDDEN_CLASS_NAMES = ["modifier_state_no_minimap"];
  var PROFILE_WATCH_INTERVALS = [0.05, 0.15, 0.3, 0.6, 1.0, 1.5, 2.0];
  var VERIFIED_SIM_NO_EFFECT_DELAY_SECONDS = 6.25;
  var TOPBARRANK_CONTEXT_ROLES = {
    PROFILE_CARD: "profile_card",
    CONTEXT_MENU: "context_menu",
    TOPBAR_ROOT: "topbar_root",
    TOPBAR_PLAYER: "topbar_player",
    HUD_ESCAPE_MENU: "hud_escape_menu",
    PLAYERS_LIST_ENTRY: "players_list_entry"
  };
  var TOPBARRANK_ACTION_ROLES = {
    profile_trigger: { profile_card: true },
    statlocker_open: { profile_card: true },
    context_menu_profile_trigger: { context_menu: true },
    context_menu_statlocker_open: { context_menu: true },
    deadlock_open: { context_menu: true },
    topbar_root_loaded: { topbar_root: true },
    topbar_player_register: { topbar_player: true },
    topbar_player_hover: { topbar_player: true },
    player_list_hover: { players_list_entry: true },
    player_list_clear: { players_list_entry: true },
    escape_preload: { hud_escape_menu: true },
    player_list_row_ready: { players_list_entry: true }
  };
  var TOPBARRANK_WRAPPER_ACTIONS = {
    TopbarRankTriggerProfileCard: "profile_trigger",
    TopbarRankOpenStatlocker: "statlocker_open",
    TopbarRankContextMenuTriggerProfileCard: "context_menu_profile_trigger",
    TopbarRankContextMenuOpenStatlocker: "context_menu_statlocker_open",
    TopbarRankContextMenuOpenDeadlock: "deadlock_open",
    TopbarRankTopBarRootLoaded: "topbar_root_loaded",
    TopbarRankRegisterTopBarPlayer: "topbar_player_register",
    TopbarRankMarkTopBarHover: "topbar_player_hover",
    TopbarRankMarkPlayerListHover: "player_list_hover",
    TopbarRankClearPlayerListHover: "player_list_clear",
    TopbarRankEscapePreloadFromPlayerList: "escape_preload",
    TopbarRankRegisterPlayerListRowReady: "player_list_row_ready"
  };
  var state = {
    knownAccountsByNameNorm: {},
    knownOrder: [],
    hoverToken: null,
    profileWatchSeq: 0,
    activeSimOpen: null,
    verifiedSimOpen: null,
    completedSimToken: "",
    probedRowOpenKeys: {},
    profileQuarantine: null,
    topBarBatchDepth: 0,
    topBarBatchRoot: null,
    topBarBatchDirty: false,
    topBarCandidateCacheRoot: null,
    topBarCandidateCache: null,
    topBarCandidateCacheDirty: true,
    sharedStoreTargets: null,
    sharedStoreTargetsVersion: ""
  };

  function NowMs() {
    try {
      if (Date && Date.now) return Date.now();
    } catch (e0) {}
    return 0;
  }

  function IsPanelValid(panel) {
    if (!panel) return false;
    if (!panel.IsValid) return true;
    try { return panel.IsValid(); } catch (e0) { return false; }
  }

  function GetContextPanel() {
    try {
      if ($.GetContextPanel) return $.GetContextPanel();
    } catch (e0) {}
    return null;
  }

  function GetDocumentRoot(panel) {
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var highest = current;
    var parent;
    var guard = 0;
    while (IsPanelValid(current) && guard < 80) {
      highest = current;
      parent = null;
      try {
        if (current.GetParent) parent = current.GetParent();
      } catch (e0) {
        parent = null;
      }
      if (!IsPanelValid(parent) || parent === current) break;
      current = parent;
      guard += 1;
    }
    return IsPanelValid(highest) ? highest : null;
  }

  function GetParent(panel) {
    if (!IsPanelValid(panel) || !panel.GetParent) return null;
    try { return panel.GetParent(); } catch (e0) { return null; }
  }

  function FindChild(root, id) {
    var child;
    if (!IsPanelValid(root) || !id || !root.FindChildTraverse) return null;
    try {
      child = root.FindChildTraverse(id);
      return IsPanelValid(child) ? child : null;
    } catch (e0) {
      return null;
    }
  }

  function FindChildrenWithClass(root, className) {
    var result = null;
    if (!IsPanelValid(root) || !className || !root.FindChildrenWithClassTraverse) return [];
    try { result = root.FindChildrenWithClassTraverse(className); } catch (e0) { result = null; }
    return result || [];
  }

  function HasClass(panel, className) {
    if (!IsPanelValid(panel) || !panel.BHasClass) return false;
    try { return !!panel.BHasClass(className); } catch (e0) { return false; }
  }

  function AddClass(panel, className) {
    if (!IsPanelValid(panel) || !className || !panel.AddClass) return;
    if (HasClass(panel, className)) return;
    try { panel.AddClass(className); } catch (e0) {}
  }

  function RemoveClass(panel, className) {
    if (!IsPanelValid(panel) || !className || !panel.RemoveClass) return;
    if (!HasClass(panel, className)) return;
    try { panel.RemoveClass(className); } catch (e0) {}
  }

  function SourceHasPrefix(source, prefix) {
    return String(source || "").indexOf(prefix) === 0;
  }

  function NormalizeTopBarWaitSource(source) {
    var text = String(source || "topbar_ready");
    text = text.replace(/(?:_wait_retry)+/g, "");
    return text || "topbar_ready";
  }

  function DetectTopbarRankContextRole(panel, source) {
    var sourceText = String(source || "");
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var guard = 0;
    var type;
    var id;
    while (IsPanelValid(current) && guard < 24) {
      type = GetPanelType(current);
      id = GetPanelId(current);
      if (type === "CitadelPlayersListEntry" || HasClass(current, PLAYER_LIST_ROW_CLASS)) return TOPBARRANK_CONTEXT_ROLES.PLAYERS_LIST_ENTRY;
      if (type === "CitadelHudTopBarPlayer" || HasClass(current, TOPBAR_PLAYER_CLASS)) return TOPBARRANK_CONTEXT_ROLES.TOPBAR_PLAYER;
      if (type === "CitadelHudTopBar") return TOPBARRANK_CONTEXT_ROLES.TOPBAR_ROOT;
      if (type === "CitadelContextMenuPlayer" || HasClass(current, "TopbarRankPlayerContextMenuRoot")) return TOPBARRANK_CONTEXT_ROLES.CONTEXT_MENU;
      if (type === "CitadelHudEscapeMenu" || id === "PlayersList" || id === "EscapeMenu") return TOPBARRANK_CONTEXT_ROLES.HUD_ESCAPE_MENU;
      if (type === "CitadelProfileCard" || id === "ProfileCard" || HasClass(current, "TopbarRankProfileCardRoot")) return TOPBARRANK_CONTEXT_ROLES.PROFILE_CARD;
      current = GetParent(current);
      guard += 1;
    }
    if (SourceHasPrefix(sourceText, "context_menu_")) return TOPBARRANK_CONTEXT_ROLES.CONTEXT_MENU;
    if (SourceHasPrefix(sourceText, "topbar_root_")) return TOPBARRANK_CONTEXT_ROLES.TOPBAR_ROOT;
    if (SourceHasPrefix(sourceText, "topbar_")) return TOPBARRANK_CONTEXT_ROLES.TOPBAR_PLAYER;
    if (sourceText === "escape_menu_onload" || sourceText === "escape_menu_open_main_menu" || SourceHasPrefix(sourceText, "escape_menu_players_tab_") || SourceHasPrefix(sourceText, "escape_menu_players_list_onload")) return TOPBARRANK_CONTEXT_ROLES.HUD_ESCAPE_MENU;
    if (SourceHasPrefix(sourceText, "escape_menu_players_list_row_ready") || SourceHasPrefix(sourceText, "players_list_")) return TOPBARRANK_CONTEXT_ROLES.PLAYERS_LIST_ENTRY;
    if (SourceHasPrefix(sourceText, "profile_card_") || SourceHasPrefix(sourceText, "account_id_") || sourceText === "statlocker_button") return TOPBARRANK_CONTEXT_ROLES.PROFILE_CARD;
    return "";
  }

  function RoleAllowsAction(role, action) {
    var allowed = TOPBARRANK_ACTION_ROLES[action];
    return !!(role && allowed && allowed[role]);
  }

  function RoleAllowsWrapper(role, wrapperName) {
    return RoleAllowsAction(role, TOPBARRANK_WRAPPER_ACTIONS[wrapperName] || "");
  }

  function GuardTopbarRankAction(action, panel, source) {
    var role = DetectTopbarRankContextRole(panel, source);
    if (RoleAllowsAction(role, action)) return role;
    return "";
  }

  function FindChildCached(root, key, id) {
    var child = null;
    if (!IsPanelValid(root) || !key || !id) return null;
    try { child = root[key]; } catch (e0) { child = null; }
    if (IsPanelValid(child)) return child;
    child = FindChild(root, id);
    try { if (IsPanelValid(child)) root[key] = child; } catch (e1) {}
    return child;
  }

  function SetPanelAttribute(panel, key, value) {
    var stringValue;
    var propertyKey;
    var currentString;
    var currentProperty;
    if (!IsPanelValid(panel) || !key) return false;
    stringValue = String(value === undefined || value === null ? "" : value);
    propertyKey = "__" + key;
    try {
      if (panel.SetAttributeString) {
        if (panel.GetAttributeString) {
          currentString = panel.GetAttributeString(key, "");
          if (currentString !== stringValue) panel.SetAttributeString(key, stringValue);
        } else {
          panel.SetAttributeString(key, stringValue);
        }
      }
    } catch (e0) {}
    try {
      currentProperty = panel[propertyKey];
      if (currentProperty !== value) panel[propertyKey] = value;
    } catch (e1) {}
    return true;
  }

  function GetPanelAttribute(panel, key, fallback) {
    var value;
    if (!IsPanelValid(panel) || !key) return fallback;
    try {
      if (panel.GetAttributeString) {
        value = panel.GetAttributeString(key, fallback);
        if (value !== undefined && value !== null && value !== "") return value;
      }
    } catch (e0) {}
    try {
      value = panel["__" + key];
      if (value !== undefined && value !== null && value !== "") return value;
    } catch (e1) {}
    return fallback;
  }

  function GetPanelId(panel) {
    try { return IsPanelValid(panel) ? String(panel.id || "") : ""; } catch (e0) { return ""; }
  }

  function GetPanelType(panel) {
    try { return IsPanelValid(panel) ? String(panel.paneltype || "") : ""; } catch (e0) { return ""; }
  }

  function ReadText(panel) {
    if (!IsPanelValid(panel)) return "";
    try {
      if (panel.text !== undefined && panel.text !== null) return NormalizeWhitespace(panel.text);
    } catch (e0) {}
    return "";
  }


  function ReadTextTree(panel, maxDepth, maxNodes) {
    var queue = [];
    var visited = 0;
    var head = 0;
    var entry;
    var text;
    var childCount;
    var i;
    if (!IsPanelValid(panel)) return "";
    queue.push({ panel: panel, depth: 0 });
    while (head < queue.length && visited < (maxNodes || 48)) {
      entry = queue[head];
      head += 1;
      visited += 1;
      text = ReadText(entry.panel);
      if (text) return text;
      if (entry.depth >= (maxDepth || 3)) continue;
      try { childCount = entry.panel.GetChildCount ? Number(entry.panel.GetChildCount() || 0) : 0; } catch (e0) { childCount = 0; }
      for (i = 0; i < childCount && queue.length + visited < (maxNodes || 48); i += 1) {
        try { queue.push({ panel: entry.panel.GetChild(i), depth: entry.depth + 1 }); } catch (e1) {}
      }
    }
    return "";
  }

  function ReadGameState() {
    var gameState = -1;
    try {
      if (typeof Game !== "undefined" && Game && Game.GetState) gameState = Number(Game.GetState());
    } catch (e0) {
      gameState = -1;
    }
    return isFinite(gameState) ? gameState : -1;
  }

  function ParseGameClockSeconds(text) {
    var value = NormalizeWhitespace(text);
    var negative = false;
    var parts;
    var i;
    var part;
    var total = 0;
    if (!value) return -1;
    if (value.charAt(0) === "-") {
      negative = true;
      value = value.slice(1);
    }
    parts = value.split(":");
    if (parts.length < 2 || parts.length > 3) return -1;
    for (i = 0; i < parts.length; i += 1) {
      if (!/^\d+$/.test(parts[i])) return -1;
      part = Number(parts[i]);
      if (!isFinite(part)) return -1;
      total = total * 60 + part;
    }
    return negative ? -total : total;
  }

  function ReadGameTimeInfo(root) {
    var docRoot = GetDocumentRoot(root);
    var topBar = FindChildCached(docRoot, "__topbarRankTopBarPanel", "TopBar") || docRoot;
    var gameTime = FindChildCached(topBar, "__topbarRankGameTimePanel", "GameTime");
    var candidates;
    var i;
    var text;
    text = ReadText(gameTime);
    if (text) return { text: text, seconds: ParseGameClockSeconds(text) };
    candidates = FindChildrenWithClass(topBar, "GameTime");
    for (i = 0; i < candidates.length; i += 1) {
      text = ReadText(candidates[i]);
      if (text) return { text: text, seconds: ParseGameClockSeconds(text) };
    }
    return { text: "", seconds: -1 };
  }

  function PanelHasAnyClass(panel, classNames) {
    var i;
    if (!IsPanelValid(panel) || !classNames) return false;
    for (i = 0; i < classNames.length; i += 1) {
      if (HasClass(panel, classNames[i])) return true;
    }
    return false;
  }

  function PanelChainHasAnyClass(panel, classNames, maxDepth) {
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var guard = 0;
    var limit = Number(maxDepth || 12);
    while (IsPanelValid(current) && guard < limit) {
      if (PanelHasAnyClass(current, classNames)) return true;
      current = GetParent(current);
      guard += 1;
    }
    return false;
  }

  function FindHudSignalPanel(root) {
    var docRoot = GetDocumentRoot(root);
    var hud;
    if (GetPanelId(root) === "Hud") return root;
    if (GetPanelId(docRoot) === "Hud") return docRoot;
    hud = FindChildCached(docRoot, "__topbarRankHudPanel", "Hud");
    return IsPanelValid(hud) ? hud : null;
  }

  function HasConfirmedHideoutState(root, docRoot, hud) {
    docRoot = docRoot || GetDocumentRoot(root);
    hud = hud === undefined ? FindHudSignalPanel(docRoot) : hud;
    return PanelHasAnyClass(hud, HIDEOUT_CLASS_NAMES) || PanelHasAnyClass(root, HIDEOUT_CLASS_NAMES) || PanelHasAnyClass(docRoot, HIDEOUT_CLASS_NAMES);
  }

  function HasLobbyOrPregameState(root, docRoot, hud) {
    docRoot = docRoot || GetDocumentRoot(root);
    hud = hud === undefined ? FindHudSignalPanel(docRoot) : hud;
    return PanelHasAnyClass(hud, LOBBY_OR_PREGAME_CLASS_NAMES) || PanelHasAnyClass(root, LOBBY_OR_PREGAME_CLASS_NAMES) || PanelHasAnyClass(docRoot, LOBBY_OR_PREGAME_CLASS_NAMES);
  }

  function HasActiveSpectatorState(root, docRoot, hud) {
    docRoot = docRoot || GetDocumentRoot(root);
    hud = hud === undefined ? FindHudSignalPanel(docRoot) : hud;
    return PanelHasAnyClass(hud, ACTIVE_SPECTATOR_CLASS_NAMES) || PanelHasAnyClass(root, ACTIVE_SPECTATOR_CLASS_NAMES) || PanelHasAnyClass(docRoot, ACTIVE_SPECTATOR_CLASS_NAMES);
  }

  function IsScoreboardOpen(root, docRoot, hud) {
    docRoot = docRoot || GetDocumentRoot(root);
    var topBar;
    var minimap;
    var scoreboard;
    hud = hud === undefined ? FindHudSignalPanel(docRoot) : hud;
    if (HasClass(root, SCOREBOARD_OPEN_CLASS) || HasClass(docRoot, SCOREBOARD_OPEN_CLASS)) return true;
    if (HasClass(hud, SCOREBOARD_OPEN_CLASS)) return true;
    topBar = FindChildCached(docRoot, "__topbarRankTopBarPanel", "TopBar");
    if (HasClass(topBar, SCOREBOARD_OPEN_CLASS)) return true;
    minimap = FindChildCached(docRoot, "__topbarRankScoreboardSignalPanel", "minimap_persp");
    if (HasClass(minimap, SCOREBOARD_OPEN_CLASS)) return true;
    scoreboard = FindChildCached(docRoot, "__topbarRankScoreboardContainerPanel", "ScoreboardContainer");
    if (HasClass(scoreboard, SCOREBOARD_OPEN_CLASS)) return true;
    scoreboard = FindChildCached(docRoot, "__topbarRankScoreboardPanel", "Scoreboard");
    return HasClass(scoreboard, SCOREBOARD_OPEN_CLASS);
  }

  function IsPanelHiddenSignal(panel) {
    if (!IsPanelValid(panel)) return false;
    try {
      if (panel.visible === false) return true;
    } catch (e0) {}
    return PanelHasAnyClass(panel, MINIMAP_HIDDEN_CLASS_NAMES);
  }

  function HasHiddenMinimapSignal(root, docRoot) {
    docRoot = docRoot || GetDocumentRoot(root);
    var i;
    var panel;
    if (PanelHasAnyClass(root, MINIMAP_HIDDEN_CLASS_NAMES) || PanelHasAnyClass(docRoot, MINIMAP_HIDDEN_CLASS_NAMES)) return true;
    for (i = 0; i < MINIMAP_SIGNAL_PANEL_IDS.length; i += 1) {
      panel = FindChildCached(docRoot, "__topbarRankMinimapSignalPanel" + i, MINIMAP_SIGNAL_PANEL_IDS[i]);
      if (IsPanelHiddenSignal(panel)) return true;
    }
    return false;
  }

  function BuildHudTransitionResult(phase, reason, gameTime, scoreboardOpen, minimapHidden, hideout, lobbyOrPregame, activeSpectator, rows, topbar, matched) {
    return {
      phase: phase,
      reason: reason,
      gameTime: gameTime.text || "<empty>",
      gameTimeSec: gameTime.seconds,
      scoreboardOpen: scoreboardOpen ? "yes" : "no",
      minimapHidden: minimapHidden ? "yes" : "no",
      hideout: hideout ? "yes" : "no",
      lobbyOrPregame: lobbyOrPregame ? "yes" : "no",
      activeSpectator: activeSpectator ? "yes" : "no",
      rows: rows,
      topbar: topbar,
      matched: matched
    };
  }

  function ReadHudTransitionInfo(root, roster) {
    var docRoot = GetDocumentRoot(root);
    var hud = FindHudSignalPanel(docRoot);
    var gameTime = ReadGameTimeInfo(docRoot);
    var hideout = HasConfirmedHideoutState(docRoot, docRoot, hud);
    var lobbyOrPregame = HasLobbyOrPregameState(docRoot, docRoot, hud);
    var activeSpectator = HasActiveSpectatorState(docRoot, docRoot, hud);
    var rows = roster && roster.rows ? roster.rows.length : FindPlayerListRows(docRoot).length;
    var topbar = roster && roster.topbar ? roster.topbar.length : FindTopBarCandidates(docRoot).length;
    var matched = roster ? Number(roster.matched || 0) : 0;
    var gameState;
    var inactiveGameState;
    var scoreboardOpen;
    var minimapHidden;
    var zeroClockHiddenHud;
    var zeroClockInactiveHud;
    var reason = "";
    var phase = "unknown";
    if (hideout) return BuildHudTransitionResult("hideout", "hideout_transition", gameTime, false, false, hideout, lobbyOrPregame, activeSpectator, rows, topbar, matched);
    if (lobbyOrPregame) return BuildHudTransitionResult("lobby_or_pregame", "lobby_or_hideout_transition", gameTime, false, false, hideout, lobbyOrPregame, activeSpectator, rows, topbar, matched);
    scoreboardOpen = IsScoreboardOpen(docRoot, docRoot, hud);
    minimapHidden = HasHiddenMinimapSignal(docRoot, docRoot);
    gameState = ReadGameState();
    inactiveGameState = gameState >= 0 && gameState < MATCH_ACTIVE_GAME_STATE;
    zeroClockHiddenHud = gameTime.seconds === 0 && minimapHidden && !scoreboardOpen;
    zeroClockInactiveHud = gameTime.seconds === 0 && inactiveGameState && !scoreboardOpen;
    if (zeroClockHiddenHud || zeroClockInactiveHud) {
      phase = "lobby_or_pregame";
      reason = "lobby_or_hideout_transition";
    } else if (gameTime.seconds === 0) {
      phase = "lobby_or_pregame";
    } else if (gameState >= MATCH_ACTIVE_GAME_STATE) {
      phase = "match_active";
    } else if (gameTime.seconds > 0) {
      phase = "game_time_seen";
    }
    return BuildHudTransitionResult(phase, reason, gameTime, scoreboardOpen, minimapHidden, hideout, lobbyOrPregame, activeSpectator, rows, topbar, matched);
  }

  function SourceAllowsPlayerListOnlyAuto(source, transition, roster) {
    var sourceName = NormalizeTopBarWaitSource(source || "");
    if (SourceHasPrefix(sourceName, "escape_menu_") || SourceHasPrefix(sourceName, "players_list_") || SourceHasPrefix(sourceName, "escape_auto")) return true;
    if (sourceName === "topbar_player_onload_coalesced") {
      if (!IsHudActiveForTopBarOnlyAuto(transition) || !roster || !roster.rows || !roster.topbar) return false;
      return roster.rows.length === 12
        && roster.topbar.length > 0
        && roster.topbar.length < 12
        && roster.matched > 0
        && roster.missing > 0
        && roster.ambiguous === 0
        && roster.skipped === 0;
    }
    return false;
  }

  function SourceAllowsProfileAutoOpen(source, playerListOnlyFallback) {
    var sourceName = NormalizeTopBarWaitSource(source || "");
    return sourceName === "escape"
      || SourceHasPrefix(sourceName, "escape_menu_")
      || SourceHasPrefix(sourceName, "players_list_")
      || SourceHasPrefix(sourceName, "manual_token_")
      || SourceHasPrefix(sourceName, "escape_auto")
      || (playerListOnlyFallback && sourceName === "topbar_player_onload_coalesced");
  }

  function ShouldUsePlayerListOnlyAuto(root, roster, source) {
    var info;
    if (!roster || !roster.rows || roster.rows.length !== 12 || EscapeRosterReady(roster)) return false;
    if (!roster.topbar || roster.topbar.length === 0) return false;
    info = ReadHudTransitionInfo(root, roster);
    if (info.reason) return false;
    if (!SourceAllowsPlayerListOnlyAuto(source, info, roster)) return false;
    return roster.topbar.length < 12 || roster.matched !== 12 || roster.missing || roster.ambiguous || roster.skipped;
  }

  function NormalizeWhitespace(value) {
    return String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }

  function NormalizeName(value) {
    var text = NormalizeWhitespace(value);
    try {
      if (text && text.normalize) text = text.normalize("NFC");
    } catch (e0) {}
    return text.toLowerCase();
  }

  function DecimalSubtract(value, subtractValue) {
    var a = String(value || "").replace(/^0+/, "") || "0";
    var b = String(subtractValue || "").replace(/^0+/, "") || "0";
    var result = "";
    var borrow = 0;
    var ai = a.length - 1;
    var bi = b.length - 1;
    var ad;
    var bd;
    var digit;
    if (a.length < b.length || (a.length === b.length && a < b)) return "";
    while (ai >= 0 || bi >= 0) {
      ad = ai >= 0 ? Number(a.charAt(ai)) : 0;
      bd = bi >= 0 ? Number(b.charAt(bi)) : 0;
      digit = ad - borrow - bd;
      if (digit < 0) {
        digit += 10;
        borrow = 1;
      } else {
        borrow = 0;
      }
      result = String(digit) + result;
      ai -= 1;
      bi -= 1;
    }
    return result.replace(/^0+/, "") || "0";
  }

  function DecimalAdd(value, addValue) {
    var a = String(value || "").replace(/^0+/, "") || "0";
    var b = String(addValue || "").replace(/^0+/, "") || "0";
    var result = "";
    var carry = 0;
    var ai = a.length - 1;
    var bi = b.length - 1;
    var sum;
    while (ai >= 0 || bi >= 0 || carry) {
      sum = (ai >= 0 ? Number(a.charAt(ai)) : 0) + (bi >= 0 ? Number(b.charAt(bi)) : 0) + carry;
      result = String(sum % 10) + result;
      carry = Math.floor(sum / 10);
      ai -= 1;
      bi -= 1;
    }
    return result.replace(/^0+/, "") || "0";
  }

  function IsValidAccountId(accountId) {
    var text = String(accountId || "");
    var numberValue;
    if (!/^\d{1,10}$/.test(text)) return false;
    numberValue = Number(text);
    return isFinite(numberValue) && numberValue >= MIN_ACCOUNT_ID && numberValue <= MAX_ACCOUNT_ID;
  }

  function NormalizeAccountId(value) {
    var text = NormalizeWhitespace(value);
    var match;
    var digits;
    if (!text || /[{}]/.test(text) || /^#/.test(text) || /^nan$/i.test(text)) return "";
    match = text.match(STEAMID3_PATTERN);
    if (match && match[1]) return IsValidAccountId(match[1]) ? match[1] : "";
    if (/^\d{17}$/.test(text)) {
      digits = NormalizeSteam64(text);
      return digits;
    }
    if (/^\d{1,10}$/.test(text)) {
      digits = text.replace(/^0+/, "") || "0";
      return IsValidAccountId(digits) ? digits : "";
    }
    if (!/\baccount\s*id\b/i.test(text)) return "";
    digits = text.replace(/[^0-9]/g, "");
    if (!digits) return "";
    digits = digits.replace(/^0+/, "") || "0";
    if (digits.length === 17) digits = NormalizeSteam64(digits);
    return IsValidAccountId(digits) ? digits : "";
  }

  function NormalizeSteamId3(value) {
    var text = NormalizeWhitespace(value);
    var match = text.match(STEAMID3_PATTERN);
    return match && IsValidAccountId(match[1]) ? match[1] : "";
  }

  function NormalizeSteam64(value) {
    var text = NormalizeWhitespace(value);
    var account;
    if (!/^\d{17}$/.test(text)) return "";
    account = DecimalSubtract(text, STEAM64_BASE);
    return IsValidAccountId(account) ? account : "";
  }

  function VerifyAccountIdentity(accountId, steamid3, steam64) {
    var account = NormalizeAccountId(accountId);
    var id3Account;
    var steam64Account;
    var hasIdentityWitness = false;
    if (!account) return "";
    if (steamid3 !== undefined && steamid3 !== null && String(steamid3 || "") !== "") {
      id3Account = NormalizeSteamId3(steamid3);
      if (!id3Account || id3Account !== account) return "";
      hasIdentityWitness = true;
    }
    if (steam64 !== undefined && steam64 !== null && String(steam64 || "") !== "") {
      steam64Account = NormalizeSteam64(steam64);
      if (!steam64Account || steam64Account !== account) return "";
      hasIdentityWitness = true;
    }
    return hasIdentityWitness ? account : "";
  }

  function BuildSteamId3(accountId) {
    var account = NormalizeAccountId(accountId);
    return account ? "[U:1:" + account + "]" : "";
  }

  function BuildSteam64(accountId) {
    var account = NormalizeAccountId(accountId);
    return account ? DecimalAdd(STEAM64_BASE, account) : "";
  }

  function BuildRankImageUrl(accountId) {
    var account = NormalizeAccountId(accountId);
    return account ? RANK_API_URL_PREFIX + encodeURIComponent(account) + RANK_IMAGE_URL_SUFFIX : "";
  }

  function BuildStatlockerProfileUrl(accountId) {
    var account = NormalizeAccountId(accountId);
    return account ? STATLOCKER_MATCHES_URL_PREFIX + encodeURIComponent(account) + STATLOCKER_MATCHES_URL_SUFFIX : "";
  }

  function BuildTeamAverageImageUrl(accounts) {
    var normalized = [];
    var seen = {};
    var i;
    var account;
    if (!accounts || accounts.length !== TEAM_AVERAGE_REQUIRED_ACCOUNTS) return "";
    for (i = 0; i < accounts.length; i += 1) {
      account = NormalizeAccountId(accounts[i]);
      if (!account || seen[account]) return "";
      seen[account] = true;
      normalized.push(account);
    }
    return normalized.length === TEAM_AVERAGE_REQUIRED_ACCOUNTS ? TEAM_AVERAGE_API_URL_PREFIX + normalized.join(",") + TEAM_AVERAGE_API_URL_SUFFIX : "";
  }

  function IsLikelyPlayerName(value) {
    var text = NormalizeWhitespace(value);
    var norm = NormalizeName(text);
    if (!text || text.length > 64) return false;
    if (text.charAt(0) === "#" || /[{}]/.test(text)) return false;
    if (/^[.\-_\s]+$/.test(text)) return false;
    if (norm === "account id" || norm.indexOf("account id:") === 0) return false;
    if (norm === "loading" || norm === "unknown") return false;
    if (NormalizeAccountId(text)) return false;
    return true;
  }

  function AddUniqueName(names, norms, value) {
    var name = NormalizeWhitespace(value);
    var norm = NormalizeName(name);
    var i;
    if (!IsLikelyPlayerName(name) || !norm) return;
    for (i = 0; i < norms.length; i += 1) {
      if (norms[i] === norm) return;
    }
    names.push(name);
    norms.push(norm);
  }

  function ReadProfileNames(profileRoot) {
    var names = [];
    var norms = [];
    var parent = GetParent(profileRoot);
    var userName = FindChildCached(profileRoot, "__topbarRankUserNamePanel", "UserName");
    var userNick = FindChildCached(profileRoot, "__topbarRankUserNicknamePanel", "UserNickname");
    var playerContainer = FindChildCached(parent, "__topbarRankPlayerContainerPanel", "PlayerContainer");
    AddUniqueName(names, norms, ReadTextTree(userName, 3, 24));
    AddUniqueName(names, norms, ReadTextTree(userNick, 3, 24));
    AddUniqueName(names, norms, ReadTextTree(playerContainer, 3, 36));
    return { names: names, norms: norms };
  }

  function GetSharedStoreTargets() {
    var targets = [];
    var config;
    if (state.sharedStoreTargets && state.sharedStoreTargetsVersion === CACHE_VERSION) return state.sharedStoreTargets;
    try {
      if (typeof GameUI !== "undefined" && GameUI && typeof GameUI.CustomUIConfig === "function") {
        config = GameUI.CustomUIConfig();
        if (config) targets.push({ root: config, name: "GameUI.CustomUIConfig" });
      }
    } catch (e0) {}
    try {
      if (typeof globalThis !== "undefined" && globalThis) targets.push({ root: globalThis, name: "globalThis" });
    } catch (e1) {}
    try { targets.push({ root: $, name: "$" }); } catch (e2) {}
    state.sharedStoreTargets = targets;
    state.sharedStoreTargetsVersion = CACHE_VERSION;
    return targets;
  }

  function ForEachSharedStore(callback) {
    var targets = GetSharedStoreTargets();
    var i;
    for (i = 0; i < targets.length; i += 1) {
      try { callback(targets[i].root, targets[i].name); } catch (e0) {}
    }
  }

  function EnsureSharedCache(root) {
    if (!root) return null;
    try {
      if (!root[SHARED_KEY] || root[SHARED_KEY].version !== CACHE_VERSION) root[SHARED_KEY] = { version: CACHE_VERSION, knownAccountsByNameNorm: {}, knownOrder: [] };
      root[SHARED_KEY].version = CACHE_VERSION;
      if (!root[SHARED_KEY].knownAccountsByNameNorm) root[SHARED_KEY].knownAccountsByNameNorm = {};
      if (!root[SHARED_KEY].knownOrder) root[SHARED_KEY].knownOrder = [];
      return root[SHARED_KEY];
    } catch (e0) {
      return null;
    }
  }

  function PutCacheEntry(cache, norm, entry) {
    var existing;
    var existingAccount;
    var newAccount;
    if (!cache || !norm || !entry || !entry.account) return false;
    existing = cache.knownAccountsByNameNorm[norm];
    existingAccount = existing && !existing.ambiguous ? NormalizeAccountId(existing.account) : "";
    newAccount = NormalizeAccountId(entry.account);
    if (existing && existing.ambiguous) {
      return false;
    }
    if (existingAccount && newAccount && existingAccount !== newAccount) {
      cache.knownAccountsByNameNorm[norm] = {
        account: "",
        name: entry.name || existing.name || norm,
        nameNorm: norm,
        ambiguous: true,
        conflictAccounts: existingAccount + "|" + newAccount,
        seenAt: NowMs(),
        source: "conflict"
      };
      if (cache.knownOrder.indexOf(norm) < 0) cache.knownOrder.push(norm);
      return false;
    }
    cache.knownAccountsByNameNorm[norm] = entry;
    if (cache.knownOrder.indexOf(norm) < 0) cache.knownOrder.push(norm);
    while (cache.knownOrder.length > MAX_CACHE_ENTRIES) {
      delete cache.knownAccountsByNameNorm[cache.knownOrder.shift()];
    }
    return true;
  }

  function ClearRootIndexedCache(root, reason) {
    var i;
    if (!IsPanelValid(root)) return false;
    for (i = 0; i < MAX_CACHE_ENTRIES; i += 1) {
      SetPanelAttribute(root, "topbar_rank_known_account_" + i + "_name_norm", "");
      SetPanelAttribute(root, "topbar_rank_known_account_" + i + "_name", "");
      SetPanelAttribute(root, "topbar_rank_known_account_" + i + "_account", "");
      SetPanelAttribute(root, "topbar_rank_known_account_" + i + "_steamid3", "");
      SetPanelAttribute(root, "topbar_rank_known_account_" + i + "_steam64", "");
      SetPanelAttribute(root, "topbar_rank_known_account_" + i + "_ambiguous", "");
    }
    SetPanelAttribute(root, "topbar_rank_known_account_count", "0");
    SetPanelAttribute(root, "topbar_rank_known_account_version", CACHE_VERSION);
    return true;
  }

  function StoreRootIndexedCache(root, entry, storeName) {
    var count;
    var i;
    var slot = -1;
    var existingNorm;
    var existingAccount;
    if (!IsPanelValid(root) || !entry || !entry.account || !entry.nameNorm) return false;
    if (GetPanelAttribute(root, "topbar_rank_known_account_version", "") !== CACHE_VERSION) ClearRootIndexedCache(root, "version_changed");
    count = Number(GetPanelAttribute(root, "topbar_rank_known_account_count", "0") || 0);
    if (!isFinite(count) || count < 0) count = 0;
    for (i = 0; i < count && i < MAX_CACHE_ENTRIES; i += 1) {
      existingNorm = String(GetPanelAttribute(root, "topbar_rank_known_account_" + i + "_name_norm", "") || "");
      if (existingNorm === entry.nameNorm) {
        slot = i;
        break;
      }
    }
    if (slot < 0 && count < MAX_CACHE_ENTRIES) {
      slot = count;
      count += 1;
      SetPanelAttribute(root, "topbar_rank_known_account_count", count);
    }
    if (slot < 0) return false;
    if (GetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_ambiguous", "") === "yes") {
      return false;
    }
    existingAccount = NormalizeAccountId(GetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_account", ""));
    if (existingAccount && existingAccount !== NormalizeAccountId(entry.account)) {
      SetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_ambiguous", "yes");
      SetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_account", "");
      return false;
    }
    SetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_name_norm", entry.nameNorm);
    SetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_name", entry.name);
    SetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_account", entry.account);
    SetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_steamid3", entry.steamid3);
    SetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_steam64", entry.steam64);
    SetPanelAttribute(root, "topbar_rank_known_account_" + slot + "_ambiguous", "no");
    return true;
  }

  function StoreAccountCache(accountId, names, norms, source, panel) {
    var account = NormalizeAccountId(accountId);
    var root = GetDocumentRoot(panel);
    var storedAny = false;
    var steamid3;
    var steam64;
    var i;
    var entry;
    if (!account) return false;
    MarkTopbarRankMatchActiveIfHudActive(root, source || "profile_card");
    steamid3 = BuildSteamId3(account);
    steam64 = BuildSteam64(account);
    if (!norms || !norms.length) {
      names = [""];
      norms = ["account:" + account];
    }
    for (i = 0; i < norms.length; i += 1) {
      if (!norms[i]) continue;
      entry = {
        account: account,
        name: names && names[i] ? names[i] : norms[i],
        nameNorm: norms[i],
        steamid3: steamid3,
        steam64: steam64,
        seenAt: NowMs(),
        source: source || "profile_card"
      };
      if (PutCacheEntry(state, norms[i], entry)) {
        storedAny = true;
      }
      StoreRootIndexedCache(root, entry, "root_attr");
      ForEachSharedStore(function(sharedRoot, sharedName) {
        var shared = EnsureSharedCache(sharedRoot);
        var ok = PutCacheEntry(shared, norms[i], entry);
      });
    }
    if (IsPanelValid(root)) {
      SetPanelAttribute(root, "topbar_rank_last_account_id", account);
      SetPanelAttribute(root, "topbar_rank_last_steamid3", steamid3);
      SetPanelAttribute(root, "topbar_rank_last_steam64", steam64);
      SetPanelAttribute(root, "topbar_rank_last_profile_name", names && names[0] ? names[0] : "");
      SetPanelAttribute(root, "topbar_rank_last_profile_name_norm", norms && norms[0] ? norms[0] : "");
    }
    return storedAny;
  }

  function LookupCacheByNameNorm(nameNorm, root) {
    var norm = String(nameNorm || "");
    var count;
    var i;
    var entry;
    var account;
    if (!norm) return null;
    entry = state.knownAccountsByNameNorm[norm];
    if (entry && entry.ambiguous) {
      return null;
    }
    if (entry && NormalizeAccountId(entry.account)) return entry;
    if (IsPanelValid(root) && GetPanelAttribute(root, "topbar_rank_known_account_version", "") === CACHE_VERSION) {
      count = Number(GetPanelAttribute(root, "topbar_rank_known_account_count", "0") || 0);
      if (!isFinite(count) || count < 0) count = 0;
      for (i = 0; i < count && i < MAX_CACHE_ENTRIES; i += 1) {
        if (String(GetPanelAttribute(root, "topbar_rank_known_account_" + i + "_name_norm", "") || "") !== norm) continue;
        if (GetPanelAttribute(root, "topbar_rank_known_account_" + i + "_ambiguous", "") === "yes") {
          return null;
        }
        account = NormalizeAccountId(GetPanelAttribute(root, "topbar_rank_known_account_" + i + "_account", ""));
        if (!account) continue;
        return {
          account: account,
          name: GetPanelAttribute(root, "topbar_rank_known_account_" + i + "_name", "") || "",
          nameNorm: norm,
          steamid3: GetPanelAttribute(root, "topbar_rank_known_account_" + i + "_steamid3", "") || BuildSteamId3(account),
          steam64: GetPanelAttribute(root, "topbar_rank_known_account_" + i + "_steam64", "") || BuildSteam64(account),
          source: "root_attr"
        };
      }
    }
    ForEachSharedStore(function(sharedRoot) {
      var shared = EnsureSharedCache(sharedRoot);
      if (entry || !shared) return;
      try {
        if (shared.knownAccountsByNameNorm && shared.knownAccountsByNameNorm[norm]) entry = shared.knownAccountsByNameNorm[norm];
      } catch (e0) {}
    });
    if (entry && entry.ambiguous) {
      return null;
    }
    return entry && NormalizeAccountId(entry.account) ? entry : null;
  }

  function FindProfileRoot(panel) {
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var guard = 0;
    var child;
    var best = null;
    while (IsPanelValid(current) && guard < 20) {
      if ((FindChildCached(current, "__topbarRankAccountIdPanel", "AccountID") || GetPanelId(current) === "AccountID")
          && (FindChildCached(current, "__topbarRankMediaPanel", "TopbarRankProfileRankImage") || FindChildCached(current, "__topbarRankAccountLabelPanel", "TopbarRankAccountLabel"))) {
        best = current;
        if (GetPanelType(current) === "CitadelProfileCard" || GetPanelId(current) === "ProfileCard") return current;
      }
      child = FindChildCached(current, "__topbarRankProfileCardPanel", "ProfileCard");
      if (IsPanelValid(child)) return child;
      current = GetParent(current);
      guard += 1;
    }
    return IsPanelValid(best) ? best : (IsPanelValid(panel) ? panel : GetContextPanel());
  }

  function FindAccountPanel(profileRoot) {
    if (GetPanelId(profileRoot) === "AccountID") return profileRoot;
    return FindChildCached(profileRoot, "__topbarRankAccountIdPanel", "AccountID");
  }


  function FindAccountTextSource(profileRoot) {
    var accountPanel = FindAccountPanel(profileRoot);
    var label = FindChildCached(profileRoot, "__topbarRankAccountLabelPanel", "TopbarRankAccountLabel");
    var raw = ReadText(label);
    var account = NormalizeAccountId(raw);
    if (account) {
      return {
        raw: raw,
        source: "TopbarRankAccountLabel",
        label: label,
        account: account,
        accountPanel: accountPanel,
        accountPanelText: "",
        accountTreeText: "",
        classAccountTexts: []
      };
    }
    return {
      raw: raw || "",
      source: "missing",
      label: label,
      account: "",
      accountPanel: accountPanel,
      accountPanelText: "",
      accountTreeText: "",
      classAccountTexts: []
    };
  }

  function ReadProfile(panel) {
    var root = FindProfileRoot(panel);
    var accountSource = FindAccountTextSource(root);
    var media = FindChildCached(root, "__topbarRankMediaPanel", "TopbarRankProfileRankImage");
    var localBadge = FindChildCached(root, "__topbarRankLocalBadgePanel", "TopbarRankProfileLocalBadge");
    var profileNames = ReadProfileNames(root);
    return {
      root: root,
      account: accountSource.account,
      raw: accountSource.raw,
      accountSource: accountSource.source,
      accountLabel: accountSource.label,
      accountPanel: accountSource.accountPanel,
      accountPanelText: accountSource.accountPanelText,
      accountTreeText: accountSource.accountTreeText,
      classAccountTexts: accountSource.classAccountTexts,
      media: media,
      localBadge: localBadge,
      names: profileNames.names,
      norms: profileNames.norms,
      url: BuildRankImageUrl(accountSource.account),
      seenAt: Number(GetPanelAttribute(root, "topbar_rank_profile_seen_at", "")) || NowMs()
    };
  }

  function SetPanelVisible(panel, visible) {
    var desired = !!visible;
    var visibility = desired ? "visible" : "collapse";
    var opacity = desired ? "1" : "0";
    var currentVisible = null;
    var currentVisibility = "";
    var currentOpacity = "";
    if (!IsPanelValid(panel)) return;
    try { currentVisible = panel.visible; } catch (e0) { currentVisible = null; }
    try { currentVisibility = String(panel.style.visibility || ""); } catch (e1) { currentVisibility = ""; }
    try { currentOpacity = String(panel.style.opacity || ""); } catch (e2) { currentOpacity = ""; }
    if (currentVisible === desired && currentVisibility === visibility && currentOpacity === opacity) return;
    try { panel.visible = desired; } catch (e3) {}
    try { panel.style.visibility = visibility; } catch (e4) {}
    try { panel.style.opacity = opacity; } catch (e5) {}
  }

  function IsActiveSimProfileMismatch(active, profile) {
    if (!active || !profile || !IsVerifiedRosterActive(active) || !active.rowNameNorm) return false;
    if (!profile.norms || !profile.norms.length) return false;
    return !ProfileHasNameNorm(profile, active.rowNameNorm);
  }

  function IsProfileTooltipPanel(panel) {
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var guard = 0;
    var id;
    var type;
    while (IsPanelValid(current) && guard < 10) {
      id = GetPanelId(current);
      type = GetPanelType(current);
      if (type === "CitadelTooltipProfileCard" || id === "CitadelProfileCardTooltip" || id === "TopbarRankProfileCardTooltip") return true;
      current = GetParent(current);
      guard += 1;
    }
    return false;
  }

  function ProfileNameMatchesOtherTopBar(root, active, profile, candidates) {
    var i;
    var match;
    var activeUid = String(active && active.topbarUid ? active.topbarUid : "");
    var activeIndex = String(active && active.topbarIndex !== undefined && active.topbarIndex !== null ? active.topbarIndex : "");
    var topbarCandidates = candidates && candidates.length ? candidates : FindTopBarCandidates(root);
    if (!profile || !profile.norms || !profile.norms.length) return null;
    for (i = 0; i < profile.norms.length; i += 1) {
      if (!profile.norms[i] || profile.norms[i] === active.rowNameNorm) continue;
      match = FindUniqueTopBarInCandidates(topbarCandidates, profile.norms[i]);
      if (!match || !match.candidate) continue;
      if (activeUid && String(match.candidate.uid || "") === activeUid) continue;
      if (!activeUid && activeIndex && String(match.candidate.index) === activeIndex) continue;
      return match.candidate;
    }
    return null;
  }

  function ApplyVerifiedActiveSimProfileAccount(root, active, profile, reason) {
    var account = profile ? NormalizeAccountId(profile.account) : "";
    var candidate;
    var candidates;
    var otherName;
    var duplicate;
    if (!account || !active || !IsVerifiedRosterActive(active) || !active.rowNameNorm) return false;
    candidate = ResolveActiveSimCandidate(root, active);
    if (!candidate) {
      return false;
    }
    candidates = FindTopBarCandidates(root);
    otherName = ProfileNameMatchesOtherTopBar(root, active, profile, candidates);
    if (otherName) {
      return false;
    }
    duplicate = FindOtherTopBarWithAccount(candidate, account, candidates);
    if (duplicate) {
      return false;
    }
    if (!ApplyTopBarImage(candidate, account, "sim_active_verified_account", candidates)) {
      return false;
    }
    StoreAccountCache(account, [candidate.name || active.rowName || ""], [candidate.nameNorm || active.rowNameNorm || ""], "sim_active_verified_account", candidate.root || root);
    ApplyVerifiedActiveSimPlayerListRank(root, active, account, "sim_active_verified_account");
    return true;
  }

  function StoreProfileQuarantine(root, active, profile, reason) {
    var until = NowMs() + PROFILE_QUARANTINE_TTL_MS;
    if (!profile || !NormalizeAccountId(profile.account)) return false;
    state.profileQuarantine = {
      account: NormalizeAccountId(profile.account),
      until: until,
      token: active && active.token ? active.token : "",
      rowName: active && active.rowName ? active.rowName : "",
      reason: reason || "profile_name_mismatch"
    };
    if (IsPanelValid(root)) {
      SetPanelAttribute(root, "topbar_rank_profile_quarantine_account", state.profileQuarantine.account);
      SetPanelAttribute(root, "topbar_rank_profile_quarantine_until", until);
      SetPanelAttribute(root, "topbar_rank_profile_quarantine_token", state.profileQuarantine.token);
      SetPanelAttribute(root, "topbar_rank_profile_quarantine_reason", state.profileQuarantine.reason);
    }
    return true;
  }

  function IsProfileQuarantined(root, profile) {
    var account = profile ? NormalizeAccountId(profile.account) : "";
    var now = NowMs();
    var until;
    var storedAccount;
    if (!account) return false;
    if (state.profileQuarantine && state.profileQuarantine.account === account && Number(state.profileQuarantine.until || 0) > now) return true;
    if (!IsPanelValid(root)) return false;
    storedAccount = NormalizeAccountId(GetPanelAttribute(root, "topbar_rank_profile_quarantine_account", ""));
    until = Number(GetPanelAttribute(root, "topbar_rank_profile_quarantine_until", "0") || 0);
    return storedAccount === account && isFinite(until) && until > now;
  }

  function ApplyProfileRankMedia(profile) {
    var account = NormalizeAccountId(profile && profile.account ? profile.account : "");
    var url = profile && profile.url ? profile.url : BuildRankImageUrl(account);
    var pendingStale;
    if (!profile || !account || !IsPanelValid(profile.media) || !url) return false;
    try {
      if (typeof profile.media.SetImage !== "function") throw "SetImage_missing";
      if (GetPanelAttribute(profile.media, "topbar_rank_rank_url", "") !== url) {
        profile.media.SetImage(url);
      }
      SetPanelVisible(profile.media, true);
      SetPanelAttribute(profile.media, "topbar_rank_account_id", account);
      SetPanelAttribute(profile.media, "topbar_rank_rank_url", url);
      pendingStale = NormalizeAccountId(GetPanelAttribute(profile.root, "topbar_rank_profile_pending_stale_account", ""));
      if (pendingStale && pendingStale !== account) SetPanelAttribute(profile.root, "topbar_rank_profile_pending_stale_account", "");
      return true;
    } catch (e0) {}
    return false;
  }

  function ApplyProfile(profile, eventSource) {
    var acceptedActiveSim;
    var root = GetDocumentRoot(profile.root);
    var activeBefore;
    var autoMismatch;
    var repeatedQuarantine;
    var profilePanel = IsPanelValid(profile.root) ? profile.root : null;
    var repeatedSuccessfulApply = false;
    var topbarApplied = false;
    if (IsPanelValid(profile.root)) SetPanelAttribute(profile.root, "topbar_rank_profile_watch_token", "");
    if (IsPanelValid(profile.localBadge)) SetPanelVisible(profile.localBadge, false);
    activeBefore = ReadActiveSimOpen(root);
    autoMismatch = IsActiveSimProfileMismatch(activeBefore, profile);
    repeatedQuarantine = !autoMismatch && IsProfileQuarantined(root, profile);
    acceptedActiveSim = MarkSimSuccess("profile_account_found", profile);
    repeatedSuccessfulApply = IsPanelValid(profilePanel) && GetPanelAttribute(profilePanel, "topbar_rank_profile_applied_account", "") === profile.account && GetPanelAttribute(profilePanel, "topbar_rank_profile_topbar_applied", "") === "yes";
    if (repeatedSuccessfulApply) ;
    else ;
    ApplyProfileRankMedia(profile);
    if (autoMismatch && !acceptedActiveSim) {
      StoreProfileQuarantine(root, activeBefore, profile, "profile_name_mismatch");
      return profile.account;
    }
    if (repeatedQuarantine && !acceptedActiveSim) {
      return profile.account;
    }
    if (acceptedActiveSim && (autoMismatch || !profile.norms || !profile.norms.length)) {
      if (IsPanelValid(profilePanel)) {
        SetPanelAttribute(profilePanel, "topbar_rank_profile_applied_account", profile.account);
        SetPanelAttribute(profilePanel, "topbar_rank_profile_topbar_applied", "yes");
      }
      ContinueEscapeAutoAfterAttempt(root, "profile_account_found");
      return profile.account;
    }
    if (repeatedSuccessfulApply) {
      if (acceptedActiveSim) ContinueEscapeAutoAfterAttempt(root, "profile_account_found");
      return profile.account;
    }
    StoreAccountCache(profile.account, profile.names, profile.norms, "profile_card", profile.root);
    topbarApplied = ApplyProfileToTopBar(profile);
    if (IsPanelValid(profilePanel)) {
      SetPanelAttribute(profilePanel, "topbar_rank_profile_applied_account", profile.account);
      SetPanelAttribute(profilePanel, "topbar_rank_profile_topbar_applied", topbarApplied ? "yes" : "no");
    }
    if (acceptedActiveSim) ContinueEscapeAutoAfterAttempt(root, "profile_account_found");
    return profile.account;
  }

  function ScheduleProfileWatchTick(root, source, token, attempt, delay, waitForAccountChange, initialAccount) {
    try {
      $.Schedule(delay, function() {
        var profile;
        var accountChanged;
        if (!IsPanelValid(root)) {
          return;
        }
        if (GetPanelAttribute(root, "topbar_rank_profile_watch_token", "") !== token) return;
        profile = ReadProfile(root);
        accountChanged = !!(profile.account && NormalizeAccountId(profile.account) !== NormalizeAccountId(initialAccount));
        if (profile.account) {
          if (!waitForAccountChange || accountChanged) {
            SetPanelAttribute(root, "topbar_rank_profile_watch_token", "");
            SetPanelAttribute(root, "topbar_rank_profile_watch_initial_account", "");
            ApplyProfile(profile, (source || "profile_card") + "_watch");
            return;
          }
        }
        if (attempt >= PROFILE_WATCH_INTERVALS.length) {
          SetPanelAttribute(root, "topbar_rank_profile_watch_token", "");
          SetPanelAttribute(root, "topbar_rank_profile_watch_initial_account", "");
          return;
        }
        ScheduleProfileWatchTick(root, source, token, attempt + 1, PROFILE_WATCH_INTERVALS[attempt], waitForAccountChange, initialAccount);
      });
    } catch (e0) {}
  }

  function StartProfileWatch(profile, source, waitForAccountChange, forceRestart) {
    var root = profile && IsPanelValid(profile.root) ? profile.root : null;
    var token;
    var initialAccount = NormalizeAccountId(profile && profile.account ? profile.account : "");
    if (!$.Schedule || !IsPanelValid(root)) return;
    if (GetPanelAttribute(root, "topbar_rank_profile_watch_token", "")) {
      if (!forceRestart) return;
      ClearProfileWatchAttributes(root);
    }
    state.profileWatchSeq += 1;
    token = String(NowMs()) + "_" + String(state.profileWatchSeq);
    SetPanelAttribute(root, "topbar_rank_profile_watch_token", token);
    SetPanelAttribute(root, "topbar_rank_profile_watch_initial_account", waitForAccountChange ? initialAccount : "");
    ScheduleProfileWatchTick(root, source, token, 1, PROFILE_WATCH_INTERVALS[0], !!waitForAccountChange, initialAccount);
  }

  function ClearProfileWatchAttributes(root) {
    if (!IsPanelValid(root)) return;
    SetPanelAttribute(root, "topbar_rank_profile_watch_token", "");
    SetPanelAttribute(root, "topbar_rank_profile_watch_initial_account", "");
    SetPanelAttribute(root, "topbar_rank_profile_watch_mode", "");
    SetPanelAttribute(root, "topbar_rank_profile_watch_last_account", "");
    SetPanelAttribute(root, "topbar_rank_profile_watch_active_until", "");
    SetPanelAttribute(root, "topbar_rank_profile_watch_fast_until", "");
  }

  function IsStableProfileTooltipWatchAccount(profile, account, fastUntil, now) {
    var mediaAccount;
    if (!account || !profile || !IsPanelValid(profile.media)) return false;
    if (isFinite(fastUntil) && now < fastUntil) return false;
    mediaAccount = NormalizeAccountId(GetPanelAttribute(profile.media, "topbar_rank_account_id", ""));
    return mediaAccount === account && !!GetPanelAttribute(profile.media, "topbar_rank_rank_url", "");
  }


  function ScheduleProfileTooltipActiveWatchTick(root, source, token, delay) {
    try {
      $.Schedule(delay, function() {
        var profile;
        var account;
        var lastAccount;
        var now;
        var activeUntil;
        var fastUntil;
        var nextDelay;
        if (!IsPanelValid(root)) {
          return;
        }
        if (GetPanelAttribute(root, "topbar_rank_profile_watch_token", "") !== token) return;
        now = NowMs();
        activeUntil = Number(GetPanelAttribute(root, "topbar_rank_profile_watch_active_until", "0") || 0);
        if (!isFinite(activeUntil) || now > activeUntil) {
          ClearProfileWatchAttributes(root);
          return;
        }
        profile = ReadProfile(root);
        account = NormalizeAccountId(profile.account);
        lastAccount = NormalizeAccountId(GetPanelAttribute(root, "topbar_rank_profile_watch_last_account", ""));
        if (account && account !== lastAccount) {
          SetPanelAttribute(root, "topbar_rank_profile_watch_last_account", account);
          SetPanelAttribute(root, "topbar_rank_profile_watch_active_until", now + PROFILE_TOOLTIP_ACTIVE_WATCH_MS);
          SetPanelAttribute(root, "topbar_rank_profile_watch_fast_until", now + PROFILE_TOOLTIP_FAST_WATCH_MS);
          ApplyProfile(profile, (source || "profile_card") + "_tooltip_watch");
          SetPanelAttribute(root, "topbar_rank_profile_watch_token", token);
          SetPanelAttribute(root, "topbar_rank_profile_watch_mode", "tooltip_active");
        } else if (!account && IsPanelValid(profile.media) && GetPanelAttribute(profile.media, "topbar_rank_account_id", "")) {
          ClearProfileRankMedia(profile);
        }
        fastUntil = Number(GetPanelAttribute(root, "topbar_rank_profile_watch_fast_until", "0") || 0);
        if (account && account === lastAccount && IsStableProfileTooltipWatchAccount(profile, account, fastUntil, now)) {
          ClearProfileWatchAttributes(root);
          return;
        }
        if (!isFinite(fastUntil)) fastUntil = 0;
        nextDelay = now < fastUntil ? PROFILE_TOOLTIP_FAST_WATCH_INTERVAL : PROFILE_TOOLTIP_IDLE_WATCH_INTERVAL;
        ScheduleProfileTooltipActiveWatchTick(root, source, token, nextDelay);
      });
    } catch (e0) {}
  }

  function StartProfileTooltipActiveWatch(profile, source) {
    var root = profile && IsPanelValid(profile.root) ? profile.root : null;
    var token;
    var initialAccount = NormalizeAccountId(profile && profile.account ? profile.account : "");
    var existingToken;
    var now;
    if (!$.Schedule || !IsPanelValid(root)) return;
    now = NowMs();
    existingToken = GetPanelAttribute(root, "topbar_rank_profile_watch_token", "");
    if (existingToken && GetPanelAttribute(root, "topbar_rank_profile_watch_mode", "") === "tooltip_active") {
      SetPanelAttribute(root, "topbar_rank_profile_watch_active_until", now + PROFILE_TOOLTIP_ACTIVE_WATCH_MS);
      SetPanelAttribute(root, "topbar_rank_profile_watch_fast_until", now + PROFILE_TOOLTIP_FAST_WATCH_MS);
      if (initialAccount) SetPanelAttribute(root, "topbar_rank_profile_watch_last_account", initialAccount);
      return;
    }
    state.profileWatchSeq += 1;
    token = String(now) + "_" + String(state.profileWatchSeq);
    SetPanelAttribute(root, "topbar_rank_profile_watch_token", token);
    SetPanelAttribute(root, "topbar_rank_profile_watch_initial_account", initialAccount);
    SetPanelAttribute(root, "topbar_rank_profile_watch_mode", "tooltip_active");
    SetPanelAttribute(root, "topbar_rank_profile_watch_last_account", initialAccount);
    SetPanelAttribute(root, "topbar_rank_profile_watch_active_until", now + PROFILE_TOOLTIP_ACTIVE_WATCH_MS);
    SetPanelAttribute(root, "topbar_rank_profile_watch_fast_until", now + PROFILE_TOOLTIP_FAST_WATCH_MS);
    ScheduleProfileTooltipActiveWatchTick(root, source, token, PROFILE_TOOLTIP_FAST_WATCH_INTERVAL);
  }

  function IsProfileHoverRefreshSource(source) {
    var sourceName = String(source || "");
    return sourceName === "profile_card_mouseover" || sourceName === "profile_card_tooltip_mouseover";
  }

  function IsIgnoredProfileHoverSource(source) {
    return String(source || "") === "context_menu_player_mouseover";
  }

  function IsHideoutProfileHoverRefreshAllowed(panel) {
    var root = GetDocumentRoot(panel);
    if (!IsPanelValid(root)) return false;
    return HasConfirmedHideoutState(root) || PanelChainHasAnyClass(panel, HIDEOUT_CLASS_NAMES, 14);
  }

  function IsProfileTooltipOnloadSource(source) {
    var sourceName = String(source || "");
    return sourceName === "profile_card_onload" || sourceName === "account_id_onload";
  }

  function IsRepeatableProfileOnloadSource(source) {
    var sourceName = String(source || "");
    return sourceName === "profile_card_onload" || sourceName === "context_menu_profile_card_onload" || sourceName === "account_id_onload";
  }

  function ShouldSkipRepeatedProfileOnload(profile, source) {
    var account = NormalizeAccountId(profile && profile.account ? profile.account : "");
    var mediaAccount;
    var mediaUrl;
    if (!account || !profile || !IsPanelValid(profile.root) || !IsPanelValid(profile.media)) return false;
    if (!IsRepeatableProfileOnloadSource(source)) return false;
    if (GetPanelAttribute(profile.root, "topbar_rank_profile_applied_account", "") !== account) return false;
    if (GetPanelAttribute(profile.root, "topbar_rank_profile_topbar_applied", "") !== "yes") return false;
    mediaAccount = NormalizeAccountId(GetPanelAttribute(profile.media, "topbar_rank_account_id", ""));
    mediaUrl = GetPanelAttribute(profile.media, "topbar_rank_rank_url", "");
    return mediaAccount === account && mediaUrl === (profile.url || BuildRankImageUrl(account));
  }

  function ShouldStartProfileTooltipAccountWatch(profile, source, isHoverRefresh) {
    if (isHoverRefresh) return true;
    if (!profile || !IsProfileTooltipOnloadSource(source)) return false;
    if (!IsProfileTooltipPanel(profile.root)) return false;
    return IsHideoutProfileHoverRefreshAllowed(profile.root);
  }

  function ClearProfileRankMedia(profile) {
    if (!profile || !IsPanelValid(profile.media)) return false;
    try {
      if (typeof profile.media.SetImage === "function") profile.media.SetImage("");
    } catch (e0) {}
    SetPanelVisible(profile.media, false);
    SetPanelAttribute(profile.media, "topbar_rank_account_id", "");
    SetPanelAttribute(profile.media, "topbar_rank_rank_url", "");
    return true;
  }

  function ClearProfileLocalAccountState(root, reason) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    state.knownAccountsByNameNorm = {};
    state.knownOrder = [];
    state.profileQuarantine = null;
    ClearRootIndexedCache(docRoot, reason || "profile_local_reset");
    ClearSharedAccountCaches();
    ClearLastProfileAttributes(docRoot);
    return true;
  }

  function ShouldDeferReusedProfileHoverAccount(profile) {
    var account = NormalizeAccountId(profile && profile.account ? profile.account : "");
    var mediaAccount;
    var pendingStale;
    if (!account || !profile || !IsPanelValid(profile.root) || !IsPanelValid(profile.media)) return false;
    pendingStale = NormalizeAccountId(GetPanelAttribute(profile.root, "topbar_rank_profile_pending_stale_account", ""));
    if (pendingStale && pendingStale === account) return true;
    mediaAccount = NormalizeAccountId(GetPanelAttribute(profile.media, "topbar_rank_account_id", ""));
    return !!(mediaAccount && mediaAccount === account && GetPanelAttribute(profile.media, "topbar_rank_rank_url", ""));
  }

  function DeferReusedProfileHoverAccount(profile, source) {
    var account = NormalizeAccountId(profile && profile.account ? profile.account : "");
    if (!account || !profile || !IsPanelValid(profile.root)) return false;
    ClearProfileLocalAccountState(profile.root, "profile_reused_hover");
    SetPanelAttribute(profile.root, "topbar_rank_profile_pending_stale_account", account);
    if (IsPanelValid(profile.localBadge)) SetPanelVisible(profile.localBadge, false);
    ClearProfileRankMedia(profile);
    StartProfileWatch(profile, source, true, true);
    return true;
  }

  function TriggerProfileCard(panel, source) {
    var targetPanel = IsPanelValid(panel) ? panel : GetContextPanel();
    var isHoverRefresh = IsProfileHoverRefreshSource(source);
    var allowFullHoverRefresh = true;
    var profile;
    var account;
    if (IsIgnoredProfileHoverSource(source)) {
      return "";
    }
    if (isHoverRefresh) allowFullHoverRefresh = IsHideoutProfileHoverRefreshAllowed(targetPanel);
    profile = ReadProfile(targetPanel);
    profile.seenAt = NowMs();
    if (IsPanelValid(profile.root)) SetPanelAttribute(profile.root, "topbar_rank_profile_seen_at", profile.seenAt);
    if (ShouldSkipRepeatedProfileOnload(profile, source)) return profile.account;
    if (isHoverRefresh && !allowFullHoverRefresh) {
      if (profile.account) {
        if (ShouldDeferReusedProfileHoverAccount(profile)) {
          DeferReusedProfileHoverAccount(profile, source);
          return "";
        }
        if (IsPanelValid(profile.localBadge)) SetPanelVisible(profile.localBadge, false);
        ApplyProfileRankMedia(profile);
        StartProfileWatch(profile, source, true, true);
        return profile.account;
      }
      if (IsPanelValid(profile.localBadge)) SetPanelVisible(profile.localBadge, false);
      ClearProfileLocalAccountState(profile.root, "profile_missing_account_hover");
      ClearProfileRankMedia(profile);
      StartProfileWatch(profile, source, false, true);
      return "";
    }
    if (isHoverRefresh && ShouldDeferReusedProfileHoverAccount(profile)) {
      DeferReusedProfileHoverAccount(profile, source);
      return "";
    }
    if (String(source || "").indexOf("context_menu_player_onload") >= 0) MarkSimSuccess("context_menu_player_onload", profile);
    else if (String(source || "").indexOf("profile_card_onload") >= 0 || String(source || "").indexOf("context_menu_profile_card_onload") >= 0 || String(source || "").indexOf("account_id_onload") >= 0) MarkSimSuccess("profile_card_onload", profile);
    if (!profile.account) {
      if (IsPanelValid(profile.localBadge)) SetPanelVisible(profile.localBadge, false);
      if (isHoverRefresh) {
        ClearProfileLocalAccountState(profile.root, "profile_missing_account_hover");
        ClearProfileRankMedia(profile);
      }
      if (ShouldStartProfileTooltipAccountWatch(profile, source, isHoverRefresh)) StartProfileTooltipActiveWatch(profile, source);
      else StartProfileWatch(profile, source);
      return "";
    }
    account = ApplyProfile(profile, source);
    if (ShouldStartProfileTooltipAccountWatch(profile, source, isHoverRefresh)) StartProfileTooltipActiveWatch(profile, source);
    return account;
  }

  function EnsureTopBarUid(root, image, docRoot) {
    var uid;
    var next;
    var scope = GetDocumentRoot(docRoot || root || image);
    if (!IsPanelValid(root) && !IsPanelValid(image)) return "";
    uid = GetPanelAttribute(image, "topbar_rank_topbar_uid", "") || GetPanelAttribute(root, "topbar_rank_topbar_uid", "");
    if (!uid) {
      next = Number(GetPanelAttribute(scope, "topbar_rank_topbar_uid_next", "0") || 0);
      if (!isFinite(next) || next < 0) next = 0;
      next += 1;
      SetPanelAttribute(scope, "topbar_rank_topbar_uid_next", next);
      uid = "tb" + String(next) + "_" + String(NowMs());
    }
    SetPanelAttribute(root, "topbar_rank_topbar_uid", uid);
    SetPanelAttribute(image, "topbar_rank_topbar_uid", uid);
    return uid;
  }

  function CacheTopBarNamePanel(root, image, namePanel) {
    if (!IsPanelValid(namePanel)) return null;
    try { if (IsPanelValid(root)) root.__topbarRankPlayerNamePanel = namePanel; } catch (e0) {}
    try { if (IsPanelValid(image)) image.__topbarRankPlayerNamePanel = namePanel; } catch (e1) {}
    return namePanel;
  }

  function GetCachedTopBarNamePanel(root, image) {
    var panel = null;
    try { panel = IsPanelValid(root) ? root.__topbarRankPlayerNamePanel : null; } catch (e0) { panel = null; }
    if (IsPanelValid(panel)) return panel;
    try { panel = IsPanelValid(image) ? image.__topbarRankPlayerNamePanel : null; } catch (e1) { panel = null; }
    return IsPanelValid(panel) ? panel : null;
  }

  function ReadTopBarLiveName(root, image) {
    var namePanel = GetCachedTopBarNamePanel(root, image);
    var name = IsPanelValid(namePanel) ? ReadText(namePanel) : "";
    if (name) return name;
    return GetPanelAttribute(root, "topbar_rank_player_name", "") || GetPanelAttribute(image, "topbar_rank_player_name", "") || "";
  }

  function ReadExistingTopBarUid(root, image) {
    return GetPanelAttribute(root, "topbar_rank_topbar_uid", "") || GetPanelAttribute(image, "topbar_rank_topbar_uid", "");
  }

  function FindPanelRefIndex(list, panel) {
    var i;
    if (!IsPanelValid(panel)) return -1;
    for (i = 0; i < list.length; i += 1) {
      if (list[i] === panel) return i;
    }
    return -1;
  }

  function TopBarCandidateValidationScore(candidate) {
    var score = 0;
    if (!candidate) return score;
    if (candidate.nameNorm) score += 1;
    if (candidate.teamSide) score += 2;
    if (candidate.account) score += 4;
    if (candidate.rankUrl && candidate.account && candidate.rankUrl === BuildRankImageUrl(candidate.account)) score += 4;
    return score;
  }

  function DeduplicateTopBarCandidates(docRoot, rawCandidates) {
    var result = [];
    var seenRoots = [];
    var seenImages = [];
    var seenUidIndex = {};
    var seenFallbackIndex = {};
    var useFallback = rawCandidates && rawCandidates.length > 12;
    var i;
    var candidate;
    var duplicateIndex;
    var duplicateReason;
    var duplicateKey;
    var existing;
    var fallbackKey;
    if (!rawCandidates || !rawCandidates.length) return result;
    for (i = 0; i < rawCandidates.length; i += 1) {
      candidate = rawCandidates[i];
      duplicateIndex = -1;
      duplicateReason = "";
      duplicateKey = "";
      if (!candidate || !IsPanelValid(candidate.image) || !IsPanelValid(candidate.root)) continue;
      duplicateIndex = FindPanelRefIndex(seenImages, candidate.image);
      if (duplicateIndex >= 0) {
        duplicateReason = "duplicate_image";
      } else {
        duplicateIndex = FindPanelRefIndex(seenRoots, candidate.root);
        if (duplicateIndex >= 0) duplicateReason = "duplicate_root";
      }
      if (duplicateIndex < 0 && candidate.uid && Object.prototype.hasOwnProperty.call(seenUidIndex, candidate.uid)) {
        duplicateIndex = seenUidIndex[candidate.uid];
        duplicateReason = "duplicate_uid";
        duplicateKey = candidate.uid;
      }
      fallbackKey = (candidate.teamSide || "unknown") + "|" + (candidate.nameNorm || "");
      if (duplicateIndex < 0 && useFallback && candidate.nameNorm && Object.prototype.hasOwnProperty.call(seenFallbackIndex, fallbackKey)) {
        duplicateIndex = seenFallbackIndex[fallbackKey];
        duplicateReason = "duplicate_name_team";
        duplicateKey = fallbackKey;
      }
      if (duplicateIndex >= 0) {
        existing = result[duplicateIndex];
        if (TopBarCandidateValidationScore(candidate) > TopBarCandidateValidationScore(existing)) {
          candidate.index = duplicateIndex;
          candidate.uid = EnsureTopBarUid(candidate.root, candidate.image, docRoot);
          result[duplicateIndex] = candidate;
          seenRoots[duplicateIndex] = candidate.root;
          seenImages[duplicateIndex] = candidate.image;
          if (candidate.uid) seenUidIndex[candidate.uid] = duplicateIndex;
          if (candidate.nameNorm) seenFallbackIndex[fallbackKey] = duplicateIndex;
        }
        continue;
      }
      candidate.index = result.length;
      candidate.uid = EnsureTopBarUid(candidate.root, candidate.image, docRoot);
      result.push(candidate);
      seenRoots.push(candidate.root);
      seenImages.push(candidate.image);
      if (candidate.uid) seenUidIndex[candidate.uid] = candidate.index;
      if (candidate.nameNorm) seenFallbackIndex[fallbackKey] = candidate.index;
    }
    return result;
  }

  function RegisterTopBarPlayer(panel, source) {
    var root = IsPanelValid(panel) ? panel : GetContextPanel();
    var docRoot = GetDocumentRoot(root);
    var image = FindChild(root, "TopbarRankRankImage");
    var namePanel = FindChild(root, "PlayerName");
    var name = ReadText(namePanel);
    var nameNorm = NormalizeName(name);
    var previousNameNorm;
    var boundNameNorm;
    var candidates;
    var candidate;
    var index = -1;
    var cached;
    var uid;
    var teamSide;
    var account;
    if (!IsPanelValid(root) || !IsPanelValid(image)) {
      return null;
    }
    AddClass(root, TOPBAR_PLAYER_CLASS);
    AddClass(image, TOPBAR_IMAGE_CLASS);
    try { image.__topbarRankTopBarRoot = root; } catch (e0) {}
    CacheTopBarNamePanel(root, image, namePanel);
    MaybeClearTopBarForMatchReset(docRoot, root, image, source || "topbar_register");
    uid = EnsureTopBarUid(root, image, docRoot);
    teamSide = DetectTopBarTeamSide(root);
    if (teamSide) {
      SetPanelAttribute(image, "topbar_rank_team_side", teamSide);
    }
    previousNameNorm = GetPanelAttribute(image, "topbar_rank_player_name_norm", "") || GetPanelAttribute(root, "topbar_rank_player_name_norm", "");
    boundNameNorm = GetPanelAttribute(image, "topbar_rank_bound_name_norm", "") || GetPanelAttribute(root, "topbar_rank_bound_name_norm", "");
    SetPanelAttribute(root, "topbar_rank_player_name", name || "");
    SetPanelAttribute(root, "topbar_rank_player_name_norm", nameNorm || "");
    SetPanelAttribute(image, "topbar_rank_player_name", name || "");
    SetPanelAttribute(image, "topbar_rank_player_name_norm", nameNorm || "");
    account = ReadTopBarAccount({ root: root, image: image });
    candidate = {
      root: root,
      image: image,
      name: name || "",
      nameNorm: nameNorm || "",
      index: -1,
      uid: uid,
      account: account,
      accountVersion: account ? CACHE_VERSION : "",
      rankUrl: ReadTopBarRankUrl({ root: root, image: image, account: account, accountVersion: account ? CACHE_VERSION : "" }),
      steamid3: account ? BuildSteamId3(account) : "",
      steam64: account ? BuildSteam64(account) : "",
      teamSide: teamSide
    };
    candidates = UpsertTopBarCandidateCache(docRoot, FindTopBarCandidates(docRoot), candidate);
    index = candidate.index;
    SetPanelAttribute(root, "topbar_rank_topbar_index", index);
    SetPanelAttribute(image, "topbar_rank_topbar_index", index);
    MaybeResetIdleForTopBarCandidate(docRoot, candidate, source || "topbar_register");
    if (previousNameNorm && previousNameNorm !== nameNorm) {
      ClearTopBarRankState(candidate, "topbar_name_changed");
    } else if (boundNameNorm && nameNorm && boundNameNorm !== nameNorm) {
      ClearTopBarRankState(candidate, "topbar_bound_name_changed");
    }
    cached = LookupCacheByNameNorm(nameNorm, docRoot);
    if (cached) ApplyTopBarImage(candidate, cached.account, "topbar_register_cache", candidates);
    ScheduleTopBarReadyCheck(docRoot, source || "topbar_register");
    return candidate;
  }

  function FindTopBarRootFromPanel(panel) {
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var guard = 0;
    while (IsPanelValid(current) && guard < 20) {
      if (HasClass(current, TOPBAR_PLAYER_CLASS) || GetPanelType(current) === "CitadelHudTopBarPlayer") return current;
      current = GetParent(current);
      guard += 1;
    }
    return IsPanelValid(panel) ? panel : GetContextPanel();
  }

  function ReadRegisteredTopBarCandidate(panel) {
    var root = FindTopBarRootFromPanel(panel);
    var image;
    var name;
    var nameNorm;
    var index;
    var uid;
    var teamSide;
    if (!IsPanelValid(root)) return null;
    image = FindChild(root, "TopbarRankRankImage");
    if (!IsPanelValid(image)) return null;
    name = ReadTopBarLiveName(root, image);
    nameNorm = GetPanelAttribute(root, "topbar_rank_player_name_norm", "") || GetPanelAttribute(image, "topbar_rank_player_name_norm", "") || NormalizeName(name);
    uid = GetPanelAttribute(root, "topbar_rank_topbar_uid", "") || GetPanelAttribute(image, "topbar_rank_topbar_uid", "");
    index = Number(GetPanelAttribute(root, "topbar_rank_topbar_index", "") || GetPanelAttribute(image, "topbar_rank_topbar_index", ""));
    teamSide = GetPanelAttribute(root, "topbar_rank_team_side", "") || GetPanelAttribute(image, "topbar_rank_team_side", "");
    if (!nameNorm || !uid || !isFinite(index) || index < 0) return null;
    return {
      root: root,
      image: image,
      name: name || "",
      nameNorm: nameNorm,
      index: index,
      uid: uid,
      teamSide: teamSide,
      account: ReadTopBarAccount({ root: root, image: image })
    };
  }

  function ReadTopBarCandidateCache(root) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return null;
    if (state.topBarCandidateCacheDirty) return null;
    if (state.topBarCandidateCacheRoot !== docRoot) return null;
    return state.topBarCandidateCache && state.topBarCandidateCache.length ? state.topBarCandidateCache : null;
  }

  function WriteTopBarCandidateCache(root, candidates) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot) || !candidates) return candidates || [];
    state.topBarCandidateCacheRoot = docRoot;
    state.topBarCandidateCache = candidates;
    state.topBarCandidateCacheDirty = false;
    return candidates;
  }

  function MarkTopBarCandidateCacheDirty(root) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) {
      state.topBarCandidateCacheDirty = true;
      return;
    }
    if (state.topBarCandidateCacheRoot === docRoot) state.topBarCandidateCacheDirty = true;
  }

  function FindTopBarCandidateSlot(candidates, candidate) {
    var i;
    var uid;
    if (!candidates || !candidate) return -1;
    uid = candidate.uid || "";
    for (i = 0; i < candidates.length; i += 1) {
      if (!candidates[i]) continue;
      if (candidate.image && candidates[i].image === candidate.image) return i;
      if (candidate.root && candidates[i].root === candidate.root) return i;
      if (uid && candidates[i].uid === uid) return i;
    }
    return -1;
  }

  function UpsertTopBarCandidateCache(root, candidates, candidate) {
    var docRoot = GetDocumentRoot(root);
    var list = candidates || [];
    var slot;
    if (!IsPanelValid(docRoot) || !candidate || !IsPanelValid(candidate.root) || !IsPanelValid(candidate.image)) return list;
    slot = FindTopBarCandidateSlot(list, candidate);
    if (slot < 0) slot = list.length;
    candidate.index = slot;
    if (!candidate.uid) candidate.uid = EnsureTopBarUid(candidate.root, candidate.image, docRoot);
    list[slot] = candidate;
    return WriteTopBarCandidateCache(docRoot, list);
  }

  function IsTopBarPlayerRoot(panel) {
    return IsPanelValid(panel) && (HasClass(panel, TOPBAR_PLAYER_CLASS) || GetPanelType(panel) === "CitadelHudTopBarPlayer");
  }

  function ResolveTopBarPlayerRoot(image) {
    var panelRoot = image && image.__topbarRankTopBarRoot;
    if (IsTopBarPlayerRoot(panelRoot)) return panelRoot;
    panelRoot = GetParent(image);
    while (IsPanelValid(panelRoot) && !IsTopBarPlayerRoot(panelRoot)) {
      panelRoot = GetParent(panelRoot);
    }
    return IsTopBarPlayerRoot(panelRoot) ? panelRoot : null;
  }

  function FindTopBarCandidates(root, forceRefresh) {
    var docRoot = GetDocumentRoot(root);
    var cached = forceRefresh ? null : ReadTopBarCandidateCache(docRoot);
    var images;
    var raw = [];
    var i;
    var image;
    var panelRoot;
    var name;
    var liveName;
    var imageVersion;
    var rootVersion;
    var imageAccount;
    var rootAccount;
    var imageSteamId3;
    var rootSteamId3;
    var imageSteam64;
    var rootSteam64;
    var normalizedImageAccount;
    var normalizedRootAccount;
    var boundNameNorm;
    var imageRankUrl;
    var rootRankUrl;
    var rankUrl;
    var account;
    var candidate;
    var uid;
    var teamSide;
    if (cached) return cached;
    images = FindChildrenWithClass(docRoot, TOPBAR_IMAGE_CLASS);
    for (i = 0; i < images.length; i += 1) {
      image = images[i];
      panelRoot = ResolveTopBarPlayerRoot(image);
      if (!IsPanelValid(panelRoot)) continue;
      teamSide = DetectTopBarTeamSide(panelRoot);
      if (teamSide) {
        SetPanelAttribute(image, "topbar_rank_team_side", teamSide);
      }
      liveName = ReadTopBarLiveName(panelRoot, image);
      if (!liveName) continue;
      name = liveName;
      imageVersion = GetPanelAttribute(image, "topbar_rank_account_version", "");
      rootVersion = GetPanelAttribute(panelRoot, "topbar_rank_account_version", "");
      imageAccount = GetPanelAttribute(image, "topbar_rank_account_id", "");
      rootAccount = GetPanelAttribute(panelRoot, "topbar_rank_account_id", "");
      imageSteamId3 = GetPanelAttribute(image, "topbar_rank_steamid3", "");
      rootSteamId3 = GetPanelAttribute(panelRoot, "topbar_rank_steamid3", "");
      imageSteam64 = GetPanelAttribute(image, "topbar_rank_steam64", "");
      rootSteam64 = GetPanelAttribute(panelRoot, "topbar_rank_steam64", "");
      normalizedImageAccount = imageVersion === CACHE_VERSION ? VerifyAccountIdentity(imageAccount, imageSteamId3, imageSteam64) : "";
      normalizedRootAccount = rootVersion === CACHE_VERSION ? VerifyAccountIdentity(rootAccount, rootSteamId3, rootSteam64) : "";
      account = normalizedImageAccount || normalizedRootAccount;
      imageRankUrl = imageVersion === CACHE_VERSION ? (GetPanelAttribute(image, "topbar_rank_rank_url", "") || "") : "";
      rootRankUrl = rootVersion === CACHE_VERSION ? (GetPanelAttribute(panelRoot, "topbar_rank_rank_url", "") || "") : "";
      rankUrl = imageRankUrl || rootRankUrl;
      uid = ReadExistingTopBarUid(panelRoot, image);
      candidate = {
        root: panelRoot,
        image: image,
        index: raw.length,
        uid: uid,
        name: name || "",
        nameNorm: NormalizeName(name),
        account: account,
        accountVersion: CACHE_VERSION,
        rankUrl: rankUrl,
        steamid3: account ? BuildSteamId3(account) : "",
        steam64: account ? BuildSteam64(account) : "",
        teamSide: teamSide
      };
      boundNameNorm = GetPanelAttribute(image, "topbar_rank_bound_name_norm", "") || GetPanelAttribute(panelRoot, "topbar_rank_bound_name_norm", "");
      if (boundNameNorm && candidate.nameNorm && boundNameNorm !== candidate.nameNorm) {
        ClearTopBarRankState(candidate, "topbar_bound_name_changed", true);
        candidate.account = "";
        candidate.rankUrl = "";
        raw.push(candidate);
        continue;
      }
      if (normalizedImageAccount && normalizedRootAccount && normalizedImageAccount !== normalizedRootAccount) {
        ClearTopBarRankState(candidate, "topbar_account_split_brain", true);
        candidate.account = "";
        candidate.rankUrl = "";
        raw.push(candidate);
        continue;
      }
      if (!account && ((imageAccount && imageVersion === CACHE_VERSION) || (rootAccount && rootVersion === CACHE_VERSION))) {
        ClearTopBarRankState(candidate, "topbar_account_identity_mismatch", true);
        candidate.rankUrl = "";
      } else if (account && rankUrl && rankUrl !== BuildRankImageUrl(account)) {
        ClearTopBarRankState(candidate, "topbar_rank_url_account_mismatch", true);
        candidate.account = "";
        candidate.rankUrl = "";
      } else if (!account && ((imageAccount && imageVersion !== CACHE_VERSION) || (rootAccount && rootVersion !== CACHE_VERSION))) {
        ClearTopBarRankState(candidate, "topbar_account_version_changed", true);
      }
      raw.push(candidate);
    }
    return WriteTopBarCandidateCache(docRoot, DeduplicateTopBarCandidates(docRoot, raw));
  }

  function CountTopBarRankState(root, candidates) {
    candidates = candidates || FindTopBarCandidates(root);
    var seen = {};
    var loaded = 0;
    var topbar = 0;
    var key;
    var i;
    for (i = 0; i < candidates.length; i += 1) {
      key = candidates[i].uid || (String(candidates[i].index) + "|" + String(candidates[i].nameNorm || ""));
      if (!key || seen[key]) continue;
      seen[key] = true;
      topbar += 1;
      if (candidates[i].account && TopBarHasRankForAccount(candidates[i], candidates[i].account)) loaded += 1;
    }
    return { loaded: loaded, topbar: topbar };
  }

  function FindUniqueTopBarInCandidates(candidates, nameNorm) {
    var found = null;
    var count = 0;
    var i;
    if (!candidates || !nameNorm) return { candidate: null, count: 0, total: candidates ? candidates.length : 0 };
    for (i = 0; i < candidates.length; i += 1) {
      if (candidates[i].nameNorm !== nameNorm) continue;
      count += 1;
      found = candidates[i];
    }
    return { candidate: count === 1 ? found : null, count: count, total: candidates.length };
  }

  function FindUniqueTopBarByName(root, nameNorm) {
    var candidates = FindTopBarCandidates(root);
    return FindUniqueTopBarInCandidates(candidates, nameNorm);
  }

  function ReadVerifiedTopBarPanelAccount(panel) {
    var account;
    if (!IsPanelValid(panel) || GetPanelAttribute(panel, "topbar_rank_account_version", "") !== CACHE_VERSION) return "";
    account = NormalizeAccountId(GetPanelAttribute(panel, "topbar_rank_account_id", ""));
    return VerifyAccountIdentity(
      account,
      GetPanelAttribute(panel, "topbar_rank_steamid3", ""),
      GetPanelAttribute(panel, "topbar_rank_steam64", "")
    );
  }

  function ReadTopBarAccount(candidate) {
    var imageAccount;
    var rootAccount;
    if (!candidate) return "";
    if (candidate.accountVersion === CACHE_VERSION && candidate.account) {
      return VerifyAccountIdentity(candidate.account, candidate.steamid3 || "", candidate.steam64 || "");
    }
    imageAccount = ReadVerifiedTopBarPanelAccount(candidate.image);
    rootAccount = ReadVerifiedTopBarPanelAccount(candidate.root);
    if (imageAccount && rootAccount && imageAccount !== rootAccount) return "";
    if (imageAccount) return imageAccount;
    if (rootAccount) return rootAccount;
    return "";
  }

  function FindOtherTopBarWithAccount(candidate, accountId, candidates) {
    var account = NormalizeAccountId(accountId);
    var topbarCandidates;
    var i;
    var otherAccount;
    if (!candidate || !account) return null;
    topbarCandidates = candidates && candidates.length ? candidates : FindTopBarCandidates(GetDocumentRoot(candidate.root));
    for (i = 0; i < topbarCandidates.length; i += 1) {
      if (topbarCandidates[i].image === candidate.image || topbarCandidates[i].root === candidate.root) continue;
      if (candidate.uid && topbarCandidates[i].uid && candidate.uid === topbarCandidates[i].uid) continue;
      otherAccount = ReadTopBarAccount(topbarCandidates[i]);
      if (otherAccount !== account) continue;
      return topbarCandidates[i];
    }
    return null;
  }

  function ReadTopBarRankUrl(candidate) {
    if (!candidate) return "";
    if (candidate.accountVersion === CACHE_VERSION && candidate.rankUrl) return candidate.rankUrl;
    if (GetPanelAttribute(candidate.image, "topbar_rank_account_version", "") === CACHE_VERSION) return GetPanelAttribute(candidate.image, "topbar_rank_rank_url", "") || "";
    if (GetPanelAttribute(candidate.root, "topbar_rank_account_version", "") === CACHE_VERSION) return GetPanelAttribute(candidate.root, "topbar_rank_rank_url", "") || "";
    return "";
  }

  function TopBarHasRankForAccount(candidate, accountId) {
    if (!candidate) return false;
    var account = NormalizeAccountId(accountId);
    var stored = ReadTopBarAccount(candidate);
    var rankUrl = ReadTopBarRankUrl(candidate);
    if (!account || stored !== account || !rankUrl || rankUrl !== BuildRankImageUrl(account)) return false;
    return HasClass(candidate.image, TOPBAR_VISIBLE_CLASS);
  }

  function DetectTopBarTeamSide(panel) {
    var current = IsPanelValid(panel) ? panel : null;
    var guard = 0;
    var id;
    var stored;
    stored = GetPanelAttribute(panel, "topbar_rank_team_side", "");
    if (stored === "friendly" || stored === "enemy") return stored;
    while (IsPanelValid(current) && guard < 32) {
      id = GetPanelId(current);
      if (id === "TeamFriendly") {
        SetPanelAttribute(panel, "topbar_rank_team_side", "friendly");
        return "friendly";
      }
      if (id === "TeamEnemy") {
        SetPanelAttribute(panel, "topbar_rank_team_side", "enemy");
        return "enemy";
      }
      current = GetParent(current);
      guard += 1;
    }
    return "";
  }

  function FindTeamAverageImage(root, side) {
    var docRoot = GetDocumentRoot(root);
    var key = "";
    var id = "";
    var image = null;
    if (side === "friendly") {
      key = "__topbarRankAverageFriendlyImage";
      id = "TopbarRankAverageFriendlyImage";
    } else if (side === "enemy") {
      key = "__topbarRankAverageEnemyImage";
      id = "TopbarRankAverageEnemyImage";
    } else {
      return null;
    }
    try { image = IsPanelValid(docRoot) ? docRoot[key] : null; } catch (e0) { image = null; }
    if (IsPanelValid(image)) return image;
    image = FindChild(docRoot, id);
    try { if (IsPanelValid(image)) docRoot[key] = image; } catch (e1) {}
    return image;
  }

  function HideTeamAverageImage(root, side) {
    var image = FindTeamAverageImage(root, side);
    var storedUrl;
    var storedAccounts;
    var storedVersion;
    if (IsPanelValid(image)) {
      storedUrl = GetPanelAttribute(image, "topbar_rank_team_average_url", "");
      storedAccounts = GetPanelAttribute(image, "topbar_rank_team_average_accounts", "");
      storedVersion = GetPanelAttribute(image, "topbar_rank_team_average_version", "");
      if (!storedUrl && !storedAccounts && storedVersion === CACHE_VERSION && !HasClass(image, TEAM_AVERAGE_VISIBLE_CLASS)) return;
      try {
        if (storedUrl && typeof image.SetImage === "function") image.SetImage("");
      } catch (e0) {}
      RemoveClass(image, TEAM_AVERAGE_VISIBLE_CLASS);
      if (storedUrl) SetPanelAttribute(image, "topbar_rank_team_average_url", "");
      if (storedAccounts) SetPanelAttribute(image, "topbar_rank_team_average_accounts", "");
      if (storedVersion !== CACHE_VERSION) SetPanelAttribute(image, "topbar_rank_team_average_version", CACHE_VERSION);
    }
  }

  function HideAllTeamAverageImages(root) {
    HideTeamAverageImage(root, "friendly");
    HideTeamAverageImage(root, "enemy");
  }

  function CollectTeamAverageAccounts(candidates, side) {
    var result = {
      side: side,
      candidates: 0,
      accounts: [],
      missing: 0,
      duplicates: 0,
      duplicateAccount: "",
      seen: {}
    };
    var i;
    var candidate;
    var account;
    for (i = 0; i < candidates.length; i += 1) {
      candidate = candidates[i];
      if (!candidate || candidate.teamSide !== side) continue;
      result.candidates += 1;
      account = candidate.account || ReadTopBarAccount(candidate);
      if (!account || !ReadTopBarRankUrl(candidate)) {
        result.missing += 1;
        continue;
      }
      if (result.seen[account]) {
        result.duplicates += 1;
        result.duplicateAccount = account;
        continue;
      }
      result.seen[account] = true;
      result.accounts.push(account);
    }
    return result;
  }

  function ApplyTeamAverageImage(root, side, accounts, source) {
    var image = FindTeamAverageImage(root, side);
    var url = BuildTeamAverageImageUrl(accounts);
    var storedUrl;
    if (!IsPanelValid(image)) {
      return false;
    }
    if (!url) {
      HideTeamAverageImage(root, side);
      return false;
    }
    storedUrl = GetPanelAttribute(image, "topbar_rank_team_average_url", "");
    try {
      if (storedUrl !== url || GetPanelAttribute(image, "topbar_rank_team_average_version", "") !== CACHE_VERSION) {
        if (typeof image.SetImage !== "function") throw "SetImage_missing";
        image.SetImage(url);
        SetPanelAttribute(image, "topbar_rank_team_average_url", url);
        SetPanelAttribute(image, "topbar_rank_team_average_accounts", accounts.join(","));
        SetPanelAttribute(image, "topbar_rank_team_average_version", CACHE_VERSION);
      }
      AddClass(image, TEAM_AVERAGE_VISIBLE_CLASS);
      return true;
    } catch (e0) {}
    return false;
  }

  function UpdateTeamAverageRanks(root, source, candidates) {
    var docRoot = GetDocumentRoot(root);
    var i;
    var missingTeam = 0;
    var friendly;
    var enemy;
    var states;
    var state;
    if (!IsPanelValid(docRoot)) return false;
    candidates = candidates || FindTopBarCandidates(docRoot);
    if (candidates.length !== 12) {
      HideAllTeamAverageImages(docRoot);
      return false;
    }
    for (i = 0; i < candidates.length; i += 1) {
      if (!candidates[i].teamSide) missingTeam += 1;
    }
    if (missingTeam) {
      HideAllTeamAverageImages(docRoot);
      return false;
    }
    friendly = CollectTeamAverageAccounts(candidates, "friendly");
    enemy = CollectTeamAverageAccounts(candidates, "enemy");
    states = [friendly, enemy];
    for (i = 0; i < states.length; i += 1) {
      state = states[i];
      if (state.candidates !== TEAM_AVERAGE_REQUIRED_ACCOUNTS) {
        HideTeamAverageImage(docRoot, state.side);
        continue;
      }
      if (state.duplicates) {
        HideTeamAverageImage(docRoot, state.side);
        continue;
      }
      if (state.accounts.length !== TEAM_AVERAGE_REQUIRED_ACCOUNTS) {
        HideTeamAverageImage(docRoot, state.side);
        continue;
      }
      ApplyTeamAverageImage(docRoot, state.side, state.accounts, source || "topbar_rank_update");
    }
    return friendly.accounts.length === TEAM_AVERAGE_REQUIRED_ACCOUNTS && enemy.accounts.length === TEAM_AVERAGE_REQUIRED_ACCOUNTS && !friendly.duplicates && !enemy.duplicates;
  }

  function ResolveRowKnownAccount(root, simTarget, source) {
    var cached;
    var topbarAccount;
    if (!simTarget || !simTarget.rowNameNorm) return null;
    cached = LookupCacheByNameNorm(simTarget.rowNameNorm, root);
    if (cached && NormalizeAccountId(cached.account)) return { entry: cached, account: NormalizeAccountId(cached.account), source: "cache" };
    if (!simTarget.candidate) return null;
    topbarAccount = ReadTopBarAccount(simTarget.candidate);
    if (topbarAccount && TopBarHasRankForAccount(simTarget.candidate, topbarAccount)) return { account: topbarAccount, source: "topbar_rank_loaded" };
    return null;
  }

  function ApplyKnownRowAccountIfNeeded(simTarget, known, method, candidates) {
    if (!simTarget || !known || !known.account) return false;
    if (!simTarget.candidate) {
      if (simTarget.row) return ApplyPlayerListRowRankImage(simTarget.row, known.account, method || "known_row_cache");
      return false;
    }
    if (TopBarHasRankForAccount(simTarget.candidate, known.account)) return false;
    return ApplyTopBarImage(simTarget.candidate, known.account, method || "known_row_cache", candidates);
  }

  function BuildRowProbeKey(simTarget) {
    var identity;
    var targetKind;
    if (!simTarget || !simTarget.rowNameNorm) return "";
    targetKind = simTarget.targetKind || "row";
    identity = simTarget.topbarUid || (simTarget.candidate ? simTarget.candidate.uid : "") || simTarget.topbarIndex || simTarget.rowIndex;
    return String(targetKind) + "::" + String(identity) + "::" + simTarget.rowNameNorm;
  }

  function NormalizeProbeAttemptCount(value) {
    var count;
    if (value === true) return 1;
    if (value === false || value === undefined || value === null || value === "") return 0;
    if (typeof value === "object") {
      if (value.count !== undefined && value.count !== null) return NormalizeProbeAttemptCount(value.count);
      return 1;
    }
    count = Number(value);
    if (!isFinite(count) || count < 0) return 0;
    return Math.floor(count);
  }

  function ReadRowProbeAttemptRecord(root, simTarget) {
    var key = BuildRowProbeKey(simTarget);
    var count = 0;
    var attrCount;
    var sharedValue;
    if (!key || !simTarget) return { key: key || "", count: 0 };
    if (state.probedRowOpenKeys && state.probedRowOpenKeys[key]) {
      count = Math.max(count, NormalizeProbeAttemptCount(state.probedRowOpenKeys[key]));
    }
    if (simTarget.candidate) {
      if (GetPanelAttribute(simTarget.candidate.image, "topbar_rank_sim_probe_attempted_key", "") === key) {
        attrCount = GetPanelAttribute(simTarget.candidate.image, "topbar_rank_sim_probe_attempted_count", "1");
        count = Math.max(count, NormalizeProbeAttemptCount(attrCount) || 1);
      }
      if (GetPanelAttribute(simTarget.candidate.root, "topbar_rank_sim_probe_attempted_key", "") === key) {
        attrCount = GetPanelAttribute(simTarget.candidate.root, "topbar_rank_sim_probe_attempted_count", "1");
        count = Math.max(count, NormalizeProbeAttemptCount(attrCount) || 1);
      }
    }
    ForEachSharedStore(function(sharedRoot) {
      try {
        if (sharedRoot.topbar_rank_sim_probed_row_keys && sharedRoot.topbar_rank_sim_probed_row_keys[key] !== undefined) {
          sharedValue = sharedRoot.topbar_rank_sim_probed_row_keys[key];
          count = Math.max(count, NormalizeProbeAttemptCount(sharedValue) || 1);
        }
      } catch (e0) {}
    });
    if (count > 0 && state.probedRowOpenKeys) {
      state.probedRowOpenKeys[key] = {
        count: count,
        rowName: simTarget.rowName || "",
        rowNameNorm: simTarget.rowNameNorm || "",
        targetKind: simTarget.targetKind || "row",
        topbarIndex: simTarget.topbarIndex,
        topbarUid: simTarget.topbarUid || ""
      };
    }
    return { key: key, count: count };
  }

  function StoreRowProbeAttempted(root, simTarget, rowIndex, source) {
    var key = BuildRowProbeKey(simTarget);
    var existing;
    var count;
    var at = NowMs();
    if (!key || !simTarget) return 0;
    existing = ReadRowProbeAttemptRecord(root, simTarget);
    count = existing.count + 1;
    if (!state.probedRowOpenKeys) state.probedRowOpenKeys = {};
    state.probedRowOpenKeys[key] = {
      count: count,
      rowName: simTarget.rowName || "",
      rowNameNorm: simTarget.rowNameNorm || "",
      targetKind: simTarget.targetKind || "row",
      topbarIndex: simTarget.topbarIndex,
      topbarUid: simTarget.topbarUid || "",
      rowIndex: rowIndex,
      at: at
    };
    if (simTarget.candidate) {
      SetTopBarRankAttributes(simTarget.candidate, "topbar_rank_sim_probe_attempted_key", key);
      SetTopBarRankAttributes(simTarget.candidate, "topbar_rank_sim_probe_attempted_count", count);
      SetTopBarRankAttributes(simTarget.candidate, "topbar_rank_sim_probe_attempted_at", at);
      SetTopBarRankAttributes(simTarget.candidate, "topbar_rank_sim_probe_attempted_row_index", rowIndex);
    }
    SetPanelAttribute(root, "topbar_rank_sim_last_probe_attempted_key", key);
    SetPanelAttribute(root, "topbar_rank_sim_last_probe_attempted_count", count);
    ForEachSharedStore(function(sharedRoot) {
      try {
        if (!sharedRoot.topbar_rank_sim_probed_row_keys) sharedRoot.topbar_rank_sim_probed_row_keys = {};
        sharedRoot.topbar_rank_sim_probed_row_keys[key] = count;
      } catch (e0) {}
    });
    return count;
  }

  function SetTopBarRankAttributes(candidate, key, value) {
    if (!candidate) return;
    SetPanelAttribute(candidate.image, key, value);
    SetPanelAttribute(candidate.root, key, value);
  }

  function FindTopBarStatusImage(root) {
    return FindChildCached(root, "__topbarRankTopBarStatusImage", "TopbarRankStatusImage");
  }

  function GetCandidateTopBarStatusImage(candidate) {
    var statusImage;
    if (!candidate) return null;
    statusImage = candidate.statusImage;
    if (IsPanelValid(statusImage)) return statusImage;
    statusImage = FindTopBarStatusImage(candidate.root || candidate.image);
    if (IsPanelValid(statusImage)) candidate.statusImage = statusImage;
    return statusImage;
  }
  function SetTopBarStatusImageUrl(statusImage, url) {
    if (!IsPanelValid(statusImage) || !url) return false;
    if (GetPanelAttribute(statusImage, "topbar_rank_topbar_status_url", "") === url) return false;
    try {
      if (typeof statusImage.SetImage !== "function") return false;
      statusImage.SetImage(url);
      SetPanelAttribute(statusImage, "topbar_rank_topbar_status_url", url);
      return true;
    } catch (e0) {}
    return false;
  }

  function ShowTopBarMissingRankStatus(candidate) {
    var statusImage = GetCandidateTopBarStatusImage(candidate);
    if (!IsPanelValid(statusImage)) return false;
    AddClass(statusImage, TOPBAR_STATUS_IMAGE_CLASS);
    RemoveClass(statusImage, TOPBAR_STATUS_LOADING_CLASS);
    SetPanelAttribute(statusImage, "topbar_rank_topbar_status_token", "");
    SetTopBarStatusImageUrl(statusImage, TOPBAR_MISSING_RANK_IMAGE_URL);
    AddClass(statusImage, TOPBAR_STATUS_VISIBLE_CLASS);
    return true;
  }


  function HideTopBarStatusImage(candidate) {
    var statusImage = GetCandidateTopBarStatusImage(candidate);
    if (!IsPanelValid(statusImage)) return false;
    RemoveClass(statusImage, TOPBAR_STATUS_VISIBLE_CLASS);
    return true;
  }

  function HideTopBarMissingStatusAfterRank(candidate) {
    var statusImage = GetCandidateTopBarStatusImage(candidate);
    if (!IsPanelValid(statusImage) || HasClass(statusImage, TOPBAR_STATUS_LOADING_CLASS)) return false;
    return HideTopBarStatusImage(candidate);
  }

  function ClearTopBarLoadingStatusImage(statusImage) {
    if (!IsPanelValid(statusImage)) return false;
    if (!HasClass(statusImage, TOPBAR_STATUS_LOADING_CLASS) && !GetPanelAttribute(statusImage, "topbar_rank_topbar_status_token", "")) return false;
    try {
      if (typeof statusImage.SetImage === "function") statusImage.SetImage(TOPBAR_MISSING_RANK_IMAGE_URL);
    } catch (e0) {}
    RemoveClass(statusImage, TOPBAR_STATUS_LOADING_CLASS);
    AddClass(statusImage, TOPBAR_STATUS_VISIBLE_CLASS);
    SetPanelAttribute(statusImage, "topbar_rank_topbar_status_token", "");
    SetPanelAttribute(statusImage, "topbar_rank_topbar_status_url", TOPBAR_MISSING_RANK_IMAGE_URL);
    SetPanelAttribute(statusImage, "topbar_rank_topbar_status_init", "");
    return true;
  }

  function StartTopBarLoadingStatus(candidate, token) {
    var statusImage = GetCandidateTopBarStatusImage(candidate);
    if (!IsPanelValid(statusImage) || !token) return false;
    AddClass(statusImage, TOPBAR_STATUS_IMAGE_CLASS);
    SetTopBarStatusImageUrl(statusImage, TOPBAR_LOADING_SPINNER_IMAGE_URL);
    SetPanelAttribute(statusImage, "topbar_rank_topbar_status_token", token);
    AddClass(statusImage, TOPBAR_STATUS_VISIBLE_CLASS);
    AddClass(statusImage, TOPBAR_STATUS_LOADING_CLASS);
    return true;
  }

  function ClearTopBarLoadingStatusForRoster(root, token, candidates) {
    var list = candidates || FindTopBarCandidates(root);
    var statusImage;
    var cleared = 0;
    var i;
    for (i = 0; i < list.length; i += 1) {
      statusImage = GetCandidateTopBarStatusImage(list[i]);
      if (!IsPanelValid(statusImage)) continue;
      if (token && GetPanelAttribute(statusImage, "topbar_rank_topbar_status_token", "") !== token) continue;
      if (ClearTopBarLoadingStatusImage(statusImage)) cleared += 1;
    }
    return cleared;
  }

  function ScheduleTopBarLoadingStatusTimeout(root, token, candidates) {
    var docRoot = GetDocumentRoot(root);
    var pendingKey;
    if (!IsPanelValid(docRoot) || !token) return false;
    try {
      if (!$.Schedule) return false;
    } catch (e0) {
      return false;
    }
    pendingKey = token + "|topbar_loading_status";
    if (GetPanelAttribute(docRoot, "topbar_rank_topbar_status_timeout_pending", "") === pendingKey) return true;
    SetPanelAttribute(docRoot, "topbar_rank_topbar_status_timeout_pending", pendingKey);
    try {
      $.Schedule(TOPBAR_LOADING_TIMEOUT_SECONDS, function() {
        var retryRoot = GetDocumentRoot(docRoot);
        var stillPending;
        if (!IsPanelValid(retryRoot)) return;
        stillPending = GetPanelAttribute(retryRoot, "topbar_rank_topbar_status_timeout_pending", "") === pendingKey;
        if (stillPending) SetPanelAttribute(retryRoot, "topbar_rank_topbar_status_timeout_pending", "");
        ClearTopBarLoadingStatusForRoster(retryRoot, token, candidates);
      });
      return true;
    } catch (e1) {
      SetPanelAttribute(docRoot, "topbar_rank_topbar_status_timeout_pending", "");
    }
    return false;
  }

  function StartTopBarLoadingStatusForRoster(root, roster, token) {
    var candidates = roster && roster.topbar ? roster.topbar : FindTopBarCandidates(root);
    var started = 0;
    var account;
    var i;
    if (!token || !candidates || !candidates.length) return 0;
    ClearTopBarLoadingStatusForRoster(root, "", candidates);
    for (i = 0; i < candidates.length; i += 1) {
      account = ReadTopBarAccount(candidates[i]);
      if (account && TopBarHasRankForAccount(candidates[i], account)) continue;
      if (StartTopBarLoadingStatus(candidates[i], token)) started += 1;
    }
    if (started) ScheduleTopBarLoadingStatusTimeout(root, token, candidates);
    return started;
  }


  function ClearTopBarRankPanelState(candidate) {
    var shouldClearImage;
    var statusChanged;
    if (!candidate || !IsPanelValid(candidate.image)) return false;
    shouldClearImage = !!(ReadTopBarRankUrl(candidate) || ReadTopBarAccount(candidate) || HasClass(candidate.image, TOPBAR_VISIBLE_CLASS));
    try {
      if (shouldClearImage && typeof candidate.image.SetImage === "function") candidate.image.SetImage("");
    } catch (e0) {}
    RemoveClass(candidate.image, TOPBAR_VISIBLE_CLASS);
    SetTopBarRankAttributes(candidate, "topbar_rank_account_id", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_rank_url", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_steamid3", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_steam64", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_account_version", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_bound_name", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_bound_name_norm", "");
    statusChanged = ShowTopBarMissingRankStatus(candidate);
    candidate.account = "";
    candidate.rankUrl = "";
    candidate.accountVersion = CACHE_VERSION;
    return shouldClearImage || statusChanged;
  }

  function ClearTopBarRankState(candidate, reason, skipRefresh) {
    if (!ClearTopBarRankPanelState(candidate)) return false;
    ClearTopbarRankRuntimeIdle(candidate.root || candidate.image, reason || "topbar_rank_state_clear");
    ClearTopbarRankTransientState(candidate.root || candidate.image);
    MarkTopBarCandidateCacheDirty(candidate.root || candidate.image);
    if (!skipRefresh) UpdateTeamAverageRanks(candidate.root || candidate.image, reason || "topbar_rank_state_clear");
    return true;
  }

  function BuildManualTargetRowKey(candidate, nameNorm) {
    if (!candidate || !nameNorm) return "";
    return String(candidate.uid || candidate.index || "") + "|" + String(nameNorm || "");
  }

  function StoreManualTargetRow(candidate, nameNorm, token, row) {
    var key;
    var entry;
    if (!IsPanelValid(row) || !candidate || !nameNorm) return false;
    if (!state.manualTargetRows) state.manualTargetRows = {};
    entry = { row: row, nameNorm: nameNorm, at: NowMs() };
    if (token) state.manualTargetRows[String(token)] = entry;
    key = BuildManualTargetRowKey(candidate, nameNorm);
    if (key) state.manualTargetRows[key] = entry;
    return true;
  }

  function ReadManualTargetRow(candidate, nameNorm, token) {
    var rowStore = state.manualTargetRows || {};
    var entry = null;
    var key;
    var age;
    var rowNorm;
    if (token && rowStore[String(token)]) entry = rowStore[String(token)];
    if (!entry) {
      key = BuildManualTargetRowKey(candidate, nameNorm);
      if (key) entry = rowStore[key];
    }
    if (!entry || !IsPanelValid(entry.row)) return null;
    age = NowMs() - Number(entry.at || 0);
    if (!isFinite(age) || age < 0 || age > MANUAL_TARGET_TTL_MS) return null;
    rowNorm = NormalizeName(ReadRowName(entry.row));
    return rowNorm && rowNorm === nameNorm ? entry.row : null;
  }

  function StoreManualTarget(candidate, name, nameNorm, source, token, row) {
    var at = NowMs();
    if (!candidate || !IsPanelValid(candidate.image) || !nameNorm) return false;
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_token", token || "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_name", name || "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_name_norm", nameNorm || "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_topbar_index", candidate.index);
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_topbar_uid", candidate.uid || "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_at", at);
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_source", source || "manual");
    StoreManualTargetRow(candidate, nameNorm, token || "", row);
    return true;
  }

  function ClearManualTarget(candidate) {
    if (!candidate || !IsPanelValid(candidate.image)) return false;
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_token", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_name", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_name_norm", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_topbar_index", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_topbar_uid", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_at", "");
    SetTopBarRankAttributes(candidate, "topbar_rank_manual_target_source", "");
    return true;
  }

  function ReadManualTarget(candidate) {
    var rawAt;
    var at;
    var nameNorm;
    if (!candidate || !IsPanelValid(candidate.image)) return null;
    nameNorm = GetPanelAttribute(candidate.image, "topbar_rank_manual_target_name_norm", "") || GetPanelAttribute(candidate.root, "topbar_rank_manual_target_name_norm", "");
    rawAt = GetPanelAttribute(candidate.image, "topbar_rank_manual_target_at", "") || GetPanelAttribute(candidate.root, "topbar_rank_manual_target_at", "");
    at = Number(rawAt || 0);
    if (!nameNorm || !isFinite(at) || at <= 0) return null;
    return {
      candidate: candidate,
      token: GetPanelAttribute(candidate.image, "topbar_rank_manual_target_token", "") || GetPanelAttribute(candidate.root, "topbar_rank_manual_target_token", ""),
      name: GetPanelAttribute(candidate.image, "topbar_rank_manual_target_name", "") || GetPanelAttribute(candidate.root, "topbar_rank_manual_target_name", ""),
      nameNorm: nameNorm,
      topbarIndex: candidate.index,
      topbarUid: GetPanelAttribute(candidate.image, "topbar_rank_manual_target_topbar_uid", "") || GetPanelAttribute(candidate.root, "topbar_rank_manual_target_topbar_uid", "") || candidate.uid || "",
      at: at,
      source: GetPanelAttribute(candidate.image, "topbar_rank_manual_target_source", "") || GetPanelAttribute(candidate.root, "topbar_rank_manual_target_source", ""),
      row: ReadManualTargetRow(candidate, nameNorm, GetPanelAttribute(candidate.image, "topbar_rank_manual_target_token", "") || GetPanelAttribute(candidate.root, "topbar_rank_manual_target_token", ""))
    };
  }

  function ProfileHasNameNorm(profile, nameNorm) {
    var i;
    if (!profile || !nameNorm || !profile.norms) return false;
    for (i = 0; i < profile.norms.length; i += 1) {
      if (profile.norms[i] === nameNorm) return true;
    }
    return false;
  }

  function FindRecentManualTargetCandidate(candidates, profile) {
    var now = NowMs();
    var profileSeenAt = profile && Number(profile.seenAt) ? Number(profile.seenAt) : now;
    var best = null;
    var distinct = {};
    var distinctCount = 0;
    var i;
    var target;
    var age;
    var key;
    var otherMatch;
    var aliasAllowed = false;
    var currentAge;
    var storedAccount;
    for (i = 0; i < candidates.length; i += 1) {
      target = ReadManualTarget(candidates[i]);
      if (!target) continue;
      age = profileSeenAt - target.at;
      if (!isFinite(age) || age < 0 || age > MANUAL_TARGET_TTL_MS) {
        continue;
      }
      if (target.candidate.nameNorm && target.candidate.nameNorm !== target.nameNorm) {
        continue;
      }
      key = String(target.topbarUid || target.topbarIndex) + "|" + target.nameNorm;
      if (!distinct[key]) {
        distinct[key] = target;
        distinctCount += 1;
      }
      if (!best || target.at > best.at) best = target;
    }
    if (!best) return null;
    age = profileSeenAt - best.at;
    currentAge = now - best.at;
    if (profile.norms && profile.norms.length) {
      if (!ProfileHasNameNorm(profile, best.nameNorm)) {
        if (distinctCount === 1 && age >= 0 && age <= MANUAL_ALIAS_TTL_MS) {
          aliasAllowed = true;
          for (i = 0; i < profile.norms.length; i += 1) {
            otherMatch = FindUniqueTopBarInCandidates(candidates, profile.norms[i]);
            if (otherMatch && otherMatch.candidate && otherMatch.candidate !== best.candidate) {
              aliasAllowed = false;
              break;
            }
          }
        }
        if (aliasAllowed) {
          return { candidate: best.candidate, method: "manual_token_profile_alias", row: best.row };
        }
        return null;
      }
      return { candidate: best.candidate, method: "manual_token", row: best.row };
    }
    if (distinctCount !== 1) {
      return null;
    }
    if (!isFinite(currentAge) || currentAge < 0 || currentAge > MANUAL_TARGET_TTL_MS) {
      return null;
    }
    storedAccount = ReadTopBarAccount(best.candidate);
    if (storedAccount && storedAccount !== profile.account) {
      return null;
    }
    return { candidate: best.candidate, method: "manual_token_no_profile_name", row: best.row };
  }

  function BeginTopBarBatch(root) {
    state.topBarBatchDepth = Number(state.topBarBatchDepth || 0) + 1;
    state.topBarBatchRoot = GetDocumentRoot(root);
    state.topBarBatchDirty = false;
  }

  function IsTopBarBatchActive() {
    return Number(state.topBarBatchDepth || 0) > 0;
  }

  function MarkTopBarBatchDirty(root) {
    if (!IsTopBarBatchActive()) return;
    state.topBarBatchDirty = true;
    if (!IsPanelValid(state.topBarBatchRoot)) state.topBarBatchRoot = GetDocumentRoot(root);
  }

  function EndTopBarBatch(root, source, loaded, blocked, rows, topbarCount, deferReadyCheck) {
    var docRoot = GetDocumentRoot(root || state.topBarBatchRoot);
    var rankState;
    var candidates;
    var resolvedTopbarCount = topbarCount;
    var resolvedRows = rows;
    var wasDirty = state.topBarBatchDirty;
    state.topBarBatchDepth = Math.max(0, Number(state.topBarBatchDepth || 0) - 1);
    if (state.topBarBatchDepth > 0) return false;
    if (wasDirty || resolvedTopbarCount === undefined || resolvedTopbarCount === null) {
      candidates = FindTopBarCandidates(docRoot);
      resolvedTopbarCount = candidates.length;
    }
    if (resolvedRows === undefined || resolvedRows === null) resolvedRows = FindPlayerListRows(docRoot).length;
    resolvedRows = Number(resolvedRows || 0);
    if (wasDirty) UpdateTeamAverageRanks(docRoot, source || "topbar_batch", candidates);
    if (loaded || !wasDirty) UpdateEscapePrompt(docRoot, Number(loaded || 0), Number(blocked || 0), resolvedRows, resolvedTopbarCount);
    else {
      rankState = CountTopBarRankState(docRoot, candidates);
      UpdateEscapePrompt(docRoot, rankState.loaded, Number(blocked || 0), resolvedRows, rankState.topbar);
    }
    if (wasDirty && !deferReadyCheck && !HasTopbarRankRuntimeIdle(docRoot)) ScheduleTopBarReadyCheck(docRoot, source || "topbar_batch");
    state.topBarBatchRoot = null;
    state.topBarBatchDirty = false;
    return !!wasDirty;
  }

  function ApplyTopBarImage(candidate, accountId, method, candidates) {
    var account = NormalizeAccountId(accountId);
    var url = BuildRankImageUrl(account);
    var stored;
    var storedUrl;
    var methodName = String(method || "");
    var duplicate;
    var steamid3;
    var steam64;
    if (!candidate || !IsPanelValid(candidate.image) || !account || !url) {
      return false;
    }
    stored = ReadTopBarAccount(candidate);
    if (stored && stored !== account) {
      if (methodName.indexOf("manual_token") === 0) {
        if (methodName === "manual_token_no_profile_name") {
          return false;
        }
        ClearTopBarRankState(candidate, "manual_token_override_stored_account");
      } else {
        return false;
      }
    }
    duplicate = FindOtherTopBarWithAccount(candidate, account, candidates);
    if (duplicate) {
      if (methodName === "unique_name" || methodName === "escape_cache" || methodName === "topbar_register_cache" || methodName.indexOf("manual_token") === 0) {
        ClearTopBarRankState(duplicate, "duplicate_account_other_topbar", true);
      } else {
        return false;
      }
    }
    storedUrl = ReadTopBarRankUrl(candidate);
    if (stored === account && storedUrl === url && TopBarHasRankForAccount(candidate, account)) {
      return true;
    }
    steamid3 = BuildSteamId3(account);
    steam64 = BuildSteam64(account);
    try {
      if (typeof candidate.image.SetImage !== "function") throw "SetImage_missing";
      candidate.image.SetImage(url);
      AddClass(candidate.image, TOPBAR_VISIBLE_CLASS);
      SetTopBarRankAttributes(candidate, "topbar_rank_account_id", account);
      SetTopBarRankAttributes(candidate, "topbar_rank_rank_url", url);
      SetTopBarRankAttributes(candidate, "topbar_rank_steamid3", steamid3);
      SetTopBarRankAttributes(candidate, "topbar_rank_steam64", steam64);
      SetTopBarRankAttributes(candidate, "topbar_rank_account_version", CACHE_VERSION);
      SetTopBarRankAttributes(candidate, "topbar_rank_bound_name", candidate.name || "");
      SetTopBarRankAttributes(candidate, "topbar_rank_bound_name_norm", candidate.nameNorm || "");
      if (candidate.uid) SetTopBarRankAttributes(candidate, "topbar_rank_topbar_uid", candidate.uid);
      candidate.account = account;
      candidate.rankUrl = url;
      candidate.accountVersion = CACHE_VERSION;
      candidate.steamid3 = steamid3;
      candidate.steam64 = steam64;
      HideTopBarMissingStatusAfterRank(candidate);
      if (candidates) UpsertTopBarCandidateCache(candidate.root || candidate.image, candidates, candidate);
      else MarkTopBarCandidateCacheDirty(candidate.root || candidate.image);
      MarkTopbarRankMatchActiveIfHudActive(candidate.root || candidate.image, method || "topbar_rank_image_set");
      if (IsTopBarBatchActive()) MarkTopBarBatchDirty(candidate.root || candidate.image);
      else {
        var rankState = CountTopBarRankState(candidate.root || candidate.image, candidates);
        UpdateTeamAverageRanks(candidate.root || candidate.image, method || "topbar_rank_image_set", candidates);
        UpdateEscapePrompt(candidate.root || candidate.image, rankState.loaded, 0, FindPlayerListRows(candidate.root || candidate.image).length, rankState.topbar);
        ScheduleTopBarReadyCheck(candidate.root || candidate.image, method || "topbar_rank_image_set");
      }
      return true;
    } catch (e0) {}
    return false;
  }

  function ApplyProfileToTopBar(profile) {
    var root = GetDocumentRoot(profile.root);
    var candidates = FindTopBarCandidates(root);
    var selected = null;
    var method = "";
    var manualMatch;
    var match;
    var i;
    var j;
    var ambiguousNameCount = 0;
    manualMatch = FindRecentManualTargetCandidate(candidates, profile);
    if (manualMatch && manualMatch.candidate) {
      selected = manualMatch.candidate;
      method = manualMatch.method;
    }
    for (i = 0; i < candidates.length; i += 1) {
      if (selected) break;
      if (candidates[i].account && candidates[i].account === profile.account) {
        selected = candidates[i];
        method = "account";
        break;
      }
    }
    if (!selected && state.hoverToken) {
      for (j = 0; j < profile.norms.length; j += 1) {
        if (state.hoverToken.nameNorm === profile.norms[j]) {
          selected = state.hoverToken.candidate;
          method = "manual_hover_token";
          break;
        }
      }
    }
    if (!selected) {
      for (j = 0; j < profile.norms.length; j += 1) {
        match = FindUniqueTopBarInCandidates(candidates, profile.norms[j]);
        if (match.count > 1) {
          ambiguousNameCount += 1;
          continue;
        }
        if (match.candidate) {
          selected = match.candidate;
          method = "unique_name";
          break;
        }
      }
    }
    if (!selected) {
      return false;
    }
    if (ApplyTopBarImage(selected, profile.account, method, candidates)) {
      if (method.indexOf("manual_token") === 0) ClearManualTarget(selected);
      if ((method === "manual_token_profile_alias" || method === "manual_token_no_profile_name") && selected.nameNorm) {
        StoreAccountCache(profile.account, [selected.name || ""], [selected.nameNorm], method, selected.root || root);
      }
      if (manualMatch && manualMatch.row && method.indexOf("manual_token") === 0) ApplyPlayerListRowRankImage(manualMatch.row, profile.account, method + "_player_list");
      StoreRootIndexedCache(GetDocumentRoot(selected.root), {
        account: profile.account,
        name: selected.name || (profile.names[0] || ""),
        nameNorm: selected.nameNorm || (profile.norms[0] || ""),
        steamid3: BuildSteamId3(profile.account),
        steam64: BuildSteam64(profile.account),
        seenAt: NowMs()
      }, "topbar_attr");
      return true;
    }
    return false;
  }

  function MarkTopBarHover(panel, source) {
    var contextPanel = IsPanelValid(panel) ? panel : GetContextPanel();
    var candidate = ReadRegisteredTopBarCandidate(contextPanel) || RegisterTopBarPlayer(contextPanel, source || "topbar_hover");
    var token;
    if (!candidate || !candidate.nameNorm) return false;
    token = String(NowMs()) + "_" + String(candidate.index);
    SetPanelAttribute(candidate.image, "topbar_rank_hover_token", token);
    SetPanelAttribute(candidate.root, "topbar_rank_hover_token", token);
    StoreManualTarget(candidate, candidate.name, candidate.nameNorm, source || "topbar_hover", token);
    state.hoverToken = {
      token: token,
      nameNorm: candidate.nameNorm,
      name: candidate.name,
      candidate: candidate,
      source: source || "topbar_hover",
      at: NowMs()
    };
    return true;
  }

  function FindTopBarOpenTarget(candidate) {
    var target;
    if (!candidate || !IsPanelValid(candidate.root)) return null;
    target = FindChild(candidate.root, "PlayerNameNWContainer");
    if (IsPanelValid(target)) return target;
    target = FindChild(candidate.root, "PlayerDetailsContainer");
    if (IsPanelValid(target)) return target;
    return candidate.root;
  }

  function BuildSimTargetFromTopBarCandidate(root, candidate, sourceEvent) {
    var target;
    if (!candidate || !IsPanelValid(candidate.root) || !candidate.nameNorm) return null;
    target = FindTopBarOpenTarget(candidate);
    if (!IsPanelValid(target)) {
      return null;
    }
    return {
      row: null,
      target: target,
      targetKind: "topbar",
      candidate: candidate,
      rowName: candidate.name || "",
      rowNameNorm: candidate.nameNorm || "",
      topbarIndex: candidate.index,
      topbarUid: candidate.uid || "",
      sourceEvent: sourceEvent || "topbar_roster_next"
    };
  }

  function BuildSimTargetFromRosterMatch(root, rowMatch, sourceEvent) {
    if (!rowMatch || rowMatch.status !== "matched") return null;
    if (rowMatch.source === "topbar_only") return BuildSimTargetFromTopBarCandidate(root, rowMatch.candidate, sourceEvent || "topbar_roster_next");
    if (rowMatch.source === "player_list_only") {
      if (!IsPanelValid(rowMatch.row) || !rowMatch.nameNorm) return null;
      return {
        row: rowMatch.row,
        rowIndex: rowMatch.rowIndex,
        target: rowMatch.row,
        targetKind: "row",
        candidate: null,
        rowName: rowMatch.name || "",
        rowNameNorm: rowMatch.nameNorm || "",
        topbarIndex: "",
        topbarUid: "",
        sourceEvent: sourceEvent || "player_list_only_next"
      };
    }
    if (!rowMatch.candidate) return null;
    if (!IsPanelValid(rowMatch.row) || !rowMatch.nameNorm) return null;
    return {
      row: rowMatch.row,
      rowIndex: rowMatch.rowIndex,
      target: rowMatch.row,
      targetKind: "row",
      candidate: rowMatch.candidate,
      rowName: rowMatch.name || "",
      rowNameNorm: rowMatch.nameNorm || "",
      topbarIndex: rowMatch.candidate.index,
      topbarUid: rowMatch.candidate.uid || "",
      sourceEvent: sourceEvent || "roster_next"
    };
  }

  function WriteActiveSimAttrs(panel, active) {
    if (!IsPanelValid(panel) || !active) return;
    SetPanelAttribute(panel, "topbar_rank_sim_active_token", active.token || "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_row_name", active.rowName || "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_row_name_norm", active.rowNameNorm || "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_topbar_index", active.topbarIndex);
    SetPanelAttribute(panel, "topbar_rank_sim_active_topbar_uid", active.topbarUid || "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_started_at", active.startedAt || 0);
    SetPanelAttribute(panel, "topbar_rank_sim_active_method", active.method || "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_target", active.targetName || "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_source", active.source || "");
  }

  function StoreActiveSimOpen(root, active) {
    var match;
    if (!active) return;
    state.activeSimOpen = active;
    WriteActiveSimAttrs(root || active.root, active);
    if (active.candidate) {
      SetTopBarRankAttributes(active.candidate, "topbar_rank_sim_active_token", active.token || "");
      SetTopBarRankAttributes(active.candidate, "topbar_rank_sim_active_row_name", active.rowName || "");
      SetTopBarRankAttributes(active.candidate, "topbar_rank_sim_active_row_name_norm", active.rowNameNorm || "");
      SetTopBarRankAttributes(active.candidate, "topbar_rank_sim_active_topbar_index", active.topbarIndex);
      SetTopBarRankAttributes(active.candidate, "topbar_rank_sim_active_topbar_uid", active.topbarUid || (active.candidate.uid || ""));
      SetTopBarRankAttributes(active.candidate, "topbar_rank_sim_active_started_at", active.startedAt || 0);
      SetTopBarRankAttributes(active.candidate, "topbar_rank_sim_active_method", active.method || "");
      SetTopBarRankAttributes(active.candidate, "topbar_rank_sim_active_target", active.targetName || "");
      SetTopBarRankAttributes(active.candidate, "topbar_rank_sim_active_source", active.source || "");
    } else if (active.rowNameNorm) {
      match = FindUniqueTopBarByName(root || active.root, active.rowNameNorm);
      if (match && match.candidate) {
        StoreActiveSimOpen(root || active.root, {
          root: active.root,
          token: active.token,
          rowName: active.rowName,
          rowNameNorm: active.rowNameNorm,
          topbarIndex: active.topbarIndex,
          topbarUid: active.topbarUid || (match.candidate.uid || ""),
          startedAt: active.startedAt,
          method: active.method,
          targetName: active.targetName,
          source: active.source,
          row: active.row,
          candidate: match.candidate
        });
        return;
      }
    }
    ForEachSharedStore(function(sharedRoot) {
      try {
        sharedRoot.topbar_rank_sim_active_token = active.token || "";
        sharedRoot.topbar_rank_sim_active_row_name = active.rowName || "";
        sharedRoot.topbar_rank_sim_active_row_name_norm = active.rowNameNorm || "";
        sharedRoot.topbar_rank_sim_active_topbar_index = active.topbarIndex;
        sharedRoot.topbar_rank_sim_active_topbar_uid = active.topbarUid || "";
        sharedRoot.topbar_rank_sim_active_started_at = active.startedAt || 0;
        sharedRoot.topbar_rank_sim_active_method = active.method || "";
        sharedRoot.topbar_rank_sim_active_target = active.targetName || "";
        sharedRoot.topbar_rank_sim_active_source = active.source || "";
      } catch (e0) {}
    });
  }

  function BuildActiveSimFromAttrs(source, token, rowName, rowNameNorm, topbarIndex, topbarUid, startedAt, method, targetName, openSource) {
    var at = Number(startedAt || 0);
    if (!token || !isFinite(at) || at <= 0) return null;
    return {
      token: token,
      rowName: rowName || "",
      rowNameNorm: rowNameNorm || NormalizeName(rowName),
      topbarIndex: topbarIndex,
      topbarUid: topbarUid || "",
      startedAt: at,
      method: method || "",
      targetName: targetName || "",
      source: openSource || source || "",
      storageSource: source || ""
    };
  }

  function ReadActiveSimFromPanel(panel, source) {
    if (!IsPanelValid(panel)) return null;
    return BuildActiveSimFromAttrs(
      source,
      GetPanelAttribute(panel, "topbar_rank_sim_active_token", ""),
      GetPanelAttribute(panel, "topbar_rank_sim_active_row_name", ""),
      GetPanelAttribute(panel, "topbar_rank_sim_active_row_name_norm", ""),
      GetPanelAttribute(panel, "topbar_rank_sim_active_topbar_index", ""),
      GetPanelAttribute(panel, "topbar_rank_sim_active_topbar_uid", ""),
      GetPanelAttribute(panel, "topbar_rank_sim_active_started_at", ""),
      GetPanelAttribute(panel, "topbar_rank_sim_active_method", ""),
      GetPanelAttribute(panel, "topbar_rank_sim_active_target", ""),
      GetPanelAttribute(panel, "topbar_rank_sim_active_source", "")
    );
  }

  function IsFreshActiveSim(active, now) {
    var age;
    if (!active) return false;
    age = Number(now || NowMs()) - Number(active.startedAt || 0);
    return isFinite(age) && age >= 0 && age <= SIM_ACTIVE_TTL_MS;
  }

  function ActiveSimBelongsToRoot(root, active) {
    var docRoot = GetDocumentRoot(root);
    var candidateRoot;
    if (!active || !active.candidate || !IsPanelValid(active.candidate.root)) return true;
    candidateRoot = GetDocumentRoot(active.candidate.root);
    return !IsPanelValid(docRoot) || !IsPanelValid(candidateRoot) || candidateRoot === docRoot;
  }

  function ActiveSimForRoot(root, active) {
    if (!active || !ActiveSimBelongsToRoot(root, active)) return null;
    if (SourceHasPrefix(active.storageSource, "shared:")) {
      if (!active.candidate) active.candidate = ResolveActiveSimCandidate(root, active);
      if (!active.candidate) return null;
    }
    return active;
  }

  function ReadActiveSimOpen(root) {
    var now = NowMs();
    var best = ActiveSimForRoot(root, state.activeSimOpen);
    var candidates;
    var active;
    var i;
    active = ActiveSimForRoot(root, ReadActiveSimFromPanel(root, "root_attr"));
    if (active && (!best || active.startedAt > best.startedAt)) best = active;
    ForEachSharedStore(function(sharedRoot, sharedName) {
      if (!sharedRoot) return;
      active = ActiveSimForRoot(root, BuildActiveSimFromAttrs(
        "shared:" + sharedName,
        sharedRoot.topbar_rank_sim_active_token || "",
        sharedRoot.topbar_rank_sim_active_row_name || "",
        sharedRoot.topbar_rank_sim_active_row_name_norm || "",
        sharedRoot.topbar_rank_sim_active_topbar_index,
        sharedRoot.topbar_rank_sim_active_topbar_uid || "",
        sharedRoot.topbar_rank_sim_active_started_at,
        sharedRoot.topbar_rank_sim_active_method || "",
        sharedRoot.topbar_rank_sim_active_target || "",
        sharedRoot.topbar_rank_sim_active_source || ""
      ));
      if (active && (!best || active.startedAt > best.startedAt)) best = active;
    });
    if (IsFreshActiveSim(best, now)) return best;
    candidates = FindTopBarCandidates(root);
    for (i = 0; i < candidates.length; i += 1) {
      active = ActiveSimForRoot(root, ReadActiveSimFromPanel(candidates[i].image, "topbar_image"));
      if (!active) active = ActiveSimForRoot(root, ReadActiveSimFromPanel(candidates[i].root, "topbar_root"));
      if (active && (!best || active.startedAt > best.startedAt)) best = active;
    }
    if (!best) return null;
    if (!IsFreshActiveSim(best, now)) return null;
    return best;
  }

  function IsVerifiedRosterActive(active) {
    if (!active) return false;
    return active.source === "verified_roster_next"
      && active.method === DEFAULT_VERIFIED_SIM_METHOD
      && (active.targetName === DEFAULT_VERIFIED_SIM_TARGET || active.targetName === TOPBAR_VERIFIED_SIM_TARGET);
  }

  function ResolveActiveSimCandidate(root, active) {
    var candidates;
    var i;
    var activeIndex = String(active && active.topbarIndex !== undefined && active.topbarIndex !== null ? active.topbarIndex : "");
    var activeUid = String(active && active.topbarUid ? active.topbarUid : "");
    if (!active) return null;
    if (active.candidate && IsPanelValid(active.candidate.root)) {
      if (activeUid && String(active.candidate.uid || "") !== activeUid) active.candidate = null;
      else if (!activeUid && activeIndex && String(active.candidate.index) !== activeIndex) active.candidate = null;
      else if (active.rowNameNorm && active.candidate.nameNorm && active.candidate.nameNorm !== active.rowNameNorm) active.candidate = null;
      else return active.candidate;
    }
    candidates = FindTopBarCandidates(root);
    if (activeUid) {
      for (i = 0; i < candidates.length; i += 1) {
        if (String(candidates[i].uid || "") !== activeUid) continue;
        if (active.rowNameNorm && candidates[i].nameNorm && candidates[i].nameNorm !== active.rowNameNorm) continue;
        return candidates[i];
      }
    }
    for (i = 0; i < candidates.length; i += 1) {
      if (String(candidates[i].index) !== activeIndex) continue;
      if (active.rowNameNorm && candidates[i].nameNorm && candidates[i].nameNorm !== active.rowNameNorm) continue;
      return candidates[i];
    }
    if (active.rowNameNorm) {
      var match = FindUniqueTopBarByName(root, active.rowNameNorm);
      if (match && match.candidate) return match.candidate;
    }
    return null;
  }

  function ClearActiveSimAttrs(panel) {
    if (!IsPanelValid(panel)) return;
    SetPanelAttribute(panel, "topbar_rank_sim_active_token", "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_row_name", "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_row_name_norm", "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_topbar_index", "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_topbar_uid", "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_started_at", "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_method", "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_target", "");
    SetPanelAttribute(panel, "topbar_rank_sim_active_source", "");
  }

  function ClearActiveSimOpen(root, token) {
    var candidates;
    var i;
    var currentToken;
    var active = state.activeSimOpen;
    var activeCandidate = active && (!token || active.token === token) ? active.candidate : null;
    if (!token || (state.activeSimOpen && state.activeSimOpen.token === token)) state.activeSimOpen = null;
    ClearActiveSimAttrs(root);
    ForEachSharedStore(function(sharedRoot) {
      try {
        if (token && sharedRoot.topbar_rank_sim_active_token && sharedRoot.topbar_rank_sim_active_token !== token) return;
        sharedRoot.topbar_rank_sim_active_token = "";
        sharedRoot.topbar_rank_sim_active_row_name = "";
        sharedRoot.topbar_rank_sim_active_row_name_norm = "";
        sharedRoot.topbar_rank_sim_active_topbar_index = "";
        sharedRoot.topbar_rank_sim_active_topbar_uid = "";
        sharedRoot.topbar_rank_sim_active_started_at = "";
        sharedRoot.topbar_rank_sim_active_method = "";
        sharedRoot.topbar_rank_sim_active_target = "";
        sharedRoot.topbar_rank_sim_active_source = "";
      } catch (e0) {}
    });
    if (activeCandidate) {
      ClearActiveSimAttrs(activeCandidate.image);
      ClearActiveSimAttrs(activeCandidate.root);
    } else {
      candidates = FindTopBarCandidates(root);
      for (i = 0; i < candidates.length; i += 1) {
        currentToken = GetPanelAttribute(candidates[i].image, "topbar_rank_sim_active_token", "") || GetPanelAttribute(candidates[i].root, "topbar_rank_sim_active_token", "");
        if (token && currentToken && currentToken !== token) continue;
        ClearActiveSimAttrs(candidates[i].image);
        ClearActiveSimAttrs(candidates[i].root);
      }
    }
  }

  function StoreCompletedSimToken(root, token) {
    var candidates;
    var i;
    var active = state.activeSimOpen;
    var activeCandidate = active && active.token === token ? active.candidate : null;
    if (!token) return;
    state.completedSimToken = token;
    SetPanelAttribute(root, "topbar_rank_sim_completed_token", token);
    ForEachSharedStore(function(sharedRoot) {
      try {
        sharedRoot.topbar_rank_sim_completed_token = token;
      } catch (e0) {}
    });
    if (activeCandidate) {
      SetTopBarRankAttributes(activeCandidate, "topbar_rank_sim_completed_token", token);
    } else {
      candidates = FindTopBarCandidates(root);
      for (i = 0; i < candidates.length; i += 1) {
        SetTopBarRankAttributes(candidates[i], "topbar_rank_sim_completed_token", token);
      }
    }
  }

  function IsCompletedSimToken(root, token) {
    var candidates;
    var i;
    if (!token) return false;
    if (state.completedSimToken === token) return true;
    if (GetPanelAttribute(root, "topbar_rank_sim_completed_token", "") === token) return true;
    var found = false;
    ForEachSharedStore(function(sharedRoot) {
      if (found) return;
      try {
        if (sharedRoot.topbar_rank_sim_completed_token === token) found = true;
      } catch (e0) {}
    });
    if (found) return true;
    candidates = FindTopBarCandidates(root);
    for (i = 0; i < candidates.length; i += 1) {
      if (GetPanelAttribute(candidates[i].image, "topbar_rank_sim_completed_token", "") === token) return true;
      if (GetPanelAttribute(candidates[i].root, "topbar_rank_sim_completed_token", "") === token) return true;
    }
    return false;
  }

  function SimAttemptList(simTarget) {
    var main;
    if (simTarget && simTarget.targetKind === "topbar") {
      return [
        { method: DEFAULT_VERIFIED_SIM_METHOD, targetName: TOPBAR_VERIFIED_SIM_TARGET, target: simTarget.target || FindTopBarOpenTarget(simTarget.candidate), eventName: "Activated", eventArg: "mouse" }
      ];
    }
    main = FindChild(simTarget.row, "MainContents") || simTarget.row;
    return [
      { method: DEFAULT_VERIFIED_SIM_METHOD, targetName: DEFAULT_VERIFIED_SIM_TARGET, target: main, eventName: "Activated", eventArg: "mouse" }
    ];
  }

  function FinishSimAttempt(originRoot, token, method, rowName) {
    try {
      $.Schedule(method === DEFAULT_VERIFIED_SIM_METHOD ? VERIFIED_SIM_NO_EFFECT_DELAY_SECONDS : 1.0, function() {
        var root = GetDocumentRoot(IsPanelValid(originRoot) ? originRoot : GetContextPanel());
        var active;
        if (IsCompletedSimToken(root, token)) return;
        active = ReadActiveSimOpen(root);
        if (!active || active.token !== token) {
          return;
        }
        StoreCompletedSimToken(root, token);
        ClearActiveSimOpen(root, token);
        ContinueEscapeAutoAfterAttempt(root, "sim_click_no_effect");
      });
    } catch (e0) {}
  }

  function FindSimAttemptByMethod(simTarget, method, targetName) {
    var attempts = SimAttemptList(simTarget);
    var i;
    var firstMethodMatch = null;
    for (i = 0; i < attempts.length; i += 1) {
      if (attempts[i].method === method && (!targetName || attempts[i].targetName === targetName)) return attempts[i];
      if (attempts[i].method === method && !firstMethodMatch) firstMethodMatch = attempts[i];
    }
    if (firstMethodMatch) {
      return firstMethodMatch;
    }
    return null;
  }

  function RunSimAttempt(root, simTarget, attempt, attemptIndex, attemptsLength, source) {
    var token;
    if (!simTarget || !attempt) {
      return false;
    }
    token = String(NowMs()) + "_sim_" + String(attemptIndex);
    StoreActiveSimOpen(root, {
      root: root,
      token: token,
      rowName: simTarget.rowName,
      rowNameNorm: simTarget.rowNameNorm,
      row: simTarget.row,
      topbarIndex: simTarget.topbarIndex,
      topbarUid: simTarget.topbarUid || (simTarget.candidate ? simTarget.candidate.uid : ""),
      startedAt: NowMs(),
      method: attempt.method,
      targetName: attempt.targetName,
      source: source || "sim",
      targetKind: simTarget.targetKind || "row",
      candidate: simTarget.candidate
    });
    try {
      if (!IsPanelValid(attempt.target)) {
        ClearActiveSimOpen(root, token);
        return false;
      }
      if (!attempt.eventName || !$.DispatchEvent) {
        ClearActiveSimOpen(root, token);
        return false;
      }
      if (attempt.eventArg !== undefined && attempt.eventArg !== null) $.DispatchEvent(attempt.eventName, attempt.target, attempt.eventArg);
      else $.DispatchEvent(attempt.eventName, attempt.target);
    } catch (e0) {
      ClearActiveSimOpen(root, token);
      return false;
    }
    if ($.Schedule) FinishSimAttempt(root, token, attempt.method, simTarget.rowName);
    return true;
  }

  function StoreVerifiedSimOpen(root, active, result) {
    if (!active || !active.method || !active.targetName) return;
    state.verifiedSimOpen = {
      method: active.method,
      targetName: active.targetName,
      verifiedAt: NowMs(),
      result: result || "unknown"
    };
    SetPanelAttribute(root || active.root, "topbar_rank_sim_verified_method", state.verifiedSimOpen.method);
    SetPanelAttribute(root || active.root, "topbar_rank_sim_verified_target", state.verifiedSimOpen.targetName);
    SetPanelAttribute(root || active.root, "topbar_rank_sim_verified_result", state.verifiedSimOpen.result);
    ForEachSharedStore(function(sharedRoot) {
      try {
        sharedRoot.topbar_rank_sim_verified_method = state.verifiedSimOpen.method;
        sharedRoot.topbar_rank_sim_verified_target = state.verifiedSimOpen.targetName;
        sharedRoot.topbar_rank_sim_verified_result = state.verifiedSimOpen.result;
      } catch (e0) {}
    });
  }

  function ReadVerifiedSimOpen(root) {
    var method = GetPanelAttribute(root, "topbar_rank_sim_verified_method", "");
    var targetName = GetPanelAttribute(root, "topbar_rank_sim_verified_target", "");
    if ((!method || !targetName) && state.verifiedSimOpen) {
      method = state.verifiedSimOpen.method;
      targetName = state.verifiedSimOpen.targetName;
    }
    ForEachSharedStore(function(sharedRoot) {
      if (method && targetName) return;
      try {
        method = method || sharedRoot.topbar_rank_sim_verified_method || "";
        targetName = targetName || sharedRoot.topbar_rank_sim_verified_target || "";
      } catch (e0) {}
    });
    if ((method && method !== DEFAULT_VERIFIED_SIM_METHOD) || (targetName && targetName !== DEFAULT_VERIFIED_SIM_TARGET && targetName !== TOPBAR_VERIFIED_SIM_TARGET)) {
      method = DEFAULT_VERIFIED_SIM_METHOD;
      targetName = DEFAULT_VERIFIED_SIM_TARGET;
      if (GetPanelAttribute(root, "topbar_rank_sim_verified_override_logged", "") !== "yes") {
        SetPanelAttribute(root, "topbar_rank_sim_verified_override_logged", "yes");
      }
    } else if (!method || !targetName) {
      method = DEFAULT_VERIFIED_SIM_METHOD;
      targetName = DEFAULT_VERIFIED_SIM_TARGET;
      if (GetPanelAttribute(root, "topbar_rank_sim_verified_default_logged", "") !== "yes") {
        SetPanelAttribute(root, "topbar_rank_sim_verified_default_logged", "yes");
      }
    }
    return { method: method, targetName: targetName };
  }

  function SimulateNextVisiblePlayerListRowOpen(panel, roster) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var verified = ReadVerifiedSimOpen(root);
    var snapshot = roster || BuildEscapeRoster(root);
    var rows = snapshot.rows || [];
    var rowMatches = snapshot.matches || [];
    var startIndex;
    var i;
    var rowIndex;
    var simTarget;
    var attempt;
    var probeRecord;
    var storedAttempt;
    var known;
    var selectedSimTarget = null;
    var selectedRowIndex = -1;
    var selectedProbeAttempt = 1;
    var probeKnownPlayerListOnlyRows = PlayerListOnlyRosterReady(snapshot);
    var appliedKnown = 0;
    var skippedKnown = 0;
    var skippedProbed = 0;
    var failedKnown = 0;
    var transition = ReadHudTransitionInfo(root, snapshot);
    if (!verified) {
      return false;
    }
    if (!AutoProbeRosterReady(snapshot, transition)) {
      return false;
    }
    if (!rows.length) {
      return false;
    }
    startIndex = Number(GetPanelAttribute(root, "topbar_rank_sim_roster_next_row_index", "0") || 0);
    if (!isFinite(startIndex) || startIndex < 0) startIndex = 0;
    for (i = 0; i < rows.length; i += 1) {
      rowIndex = (startIndex + i) % rows.length;
      simTarget = BuildSimTargetFromRosterMatch(root, rowMatches[rowIndex], "roster_next");
      if (!simTarget) continue;
      known = ResolveRowKnownAccount(root, simTarget, "probe_next_existing_account");
      if (known && known.account) {
        if (simTarget.candidate && TopBarHasRankForAccount(simTarget.candidate, known.account)) {
          skippedKnown += 1;
          continue;
        }
        if (!probeKnownPlayerListOnlyRows || simTarget.candidate) {
          if (ApplyKnownRowAccountIfNeeded(simTarget, known, "probe_next_known_cache", snapshot.topbar)) {
            appliedKnown += 1;
          } else {
            failedKnown += 1;
          }
          continue;
        }
      }
      probeRecord = ReadRowProbeAttemptRecord(root, simTarget);
      if (probeRecord.count >= SIM_PROBE_MAX_ATTEMPTS_PER_ROW) {
        skippedProbed += 1;
        continue;
      }
      if (!selectedSimTarget) {
        selectedSimTarget = simTarget;
        selectedRowIndex = rowIndex;
        selectedProbeAttempt = probeRecord.count + 1;
      }
    }
    if (selectedSimTarget) {
      attempt = FindSimAttemptByMethod(selectedSimTarget, verified.method, verified.targetName);
      if (!attempt) {
        return false;
      }
      SetPanelAttribute(root, "topbar_rank_sim_roster_next_row_index", (selectedRowIndex + 1) % rows.length);
      storedAttempt = StoreRowProbeAttempted(root, selectedSimTarget, selectedRowIndex, "verified_roster_next") || selectedProbeAttempt;
      return RunSimAttempt(root, selectedSimTarget, attempt, "verified", rows.length, "verified_roster_next");
    }
    return appliedKnown > 0;
  }

  function CompleteSimSuccess(root, active, result) {
    StoreCompletedSimToken(root, active.token);
    StoreVerifiedSimOpen(root, active, result);
    ClearActiveSimOpen(root, active.token);
    return true;
  }

  function FindPlayerListRowNamePanel(row) {
    return FindChildCached(row, "__topbarRankPlayerListNamePanel", "PlayerName");
  }

  function FindPlayerListRowRankImage(row) {
    return FindChildCached(row, "__topbarRankPlayerListRankImage", "TopbarRankPlayerListRankImage");
  }

  function MarkSimSuccess(result, profile) {
    var root = profile && IsPanelValid(profile.root) ? GetDocumentRoot(profile.root) : GetDocumentRoot(GetContextPanel());
    var active = ReadActiveSimOpen(root);
    if (!active) return false;
    if (IsVerifiedRosterActive(active) && result !== "profile_account_found") {
      return false;
    }
    if (profile && active.rowNameNorm) {
      if (profile.norms && profile.norms.length) {
        if (!ProfileHasNameNorm(profile, active.rowNameNorm)) {
          if (result === "profile_account_found" && ApplyVerifiedActiveSimProfileAccount(root, active, profile, "profile_name_alias_or_placeholder")) {
            return CompleteSimSuccess(root, active, result);
          }
          if (result === "profile_account_found") {
          }
          return false;
        }
      } else if (result === "profile_account_found" && ApplyVerifiedActiveSimProfileAccount(root, active, profile, "missing_profile_name_active_account")) {
        return CompleteSimSuccess(root, active, result);
      } else if (!profile.norms || !profile.norms.length) {
        return false;
      }
    }
    return CompleteSimSuccess(root, active, result);
  }

  function FindNearestPlayerListRow(panel) {
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var guard = 0;
    while (IsPanelValid(current) && guard < 20) {
      if (HasClass(current, PLAYER_LIST_ROW_CLASS) || FindPlayerListRowNamePanel(current)) return current;
      current = GetParent(current);
      guard += 1;
    }
    return null;
  }

  function ReadRowName(row) {
    return ReadText(FindPlayerListRowNamePanel(row)) || ReadTextTree(row, 3, 36);
  }

  function MarkPlayerListHover(panel, source) {
    var row = FindNearestPlayerListRow(IsPanelValid(panel) ? panel : GetContextPanel());
    var root = GetDocumentRoot(row);
    var name = ReadRowName(row);
    var nameNorm = NormalizeName(name);
    var match = FindUniqueTopBarByName(root, nameNorm);
    var token;
    if (!nameNorm || !match.candidate) {
      return false;
    }
    token = String(NowMs()) + "_row_" + String(match.candidate.index);
    SetPanelAttribute(match.candidate.image, "topbar_rank_hover_token", token);
    SetPanelAttribute(match.candidate.root, "topbar_rank_hover_token", token);
    StoreManualTarget(match.candidate, name, nameNorm, source || "players_list_hover", token, row);
    state.hoverToken = {
      token: token,
      nameNorm: nameNorm,
      name: name,
      candidate: match.candidate,
      row: row,
      source: source || "players_list_hover",
      at: NowMs()
    };
    return true;
  }

  function ClearPlayerListHover(source) {
    var token = state.hoverToken ? state.hoverToken.token : "";
    state.hoverToken = null;
  }

  function ApplyPlayerListRowRankImage(row, accountId, source) {
    var account = NormalizeAccountId(accountId);
    var image;
    var rowName = "";
    var url;
    var storedUrl;
    if (!IsPanelValid(row) || !account) {
      return false;
    }
    image = FindPlayerListRowRankImage(row);
    if (!IsPanelValid(image)) {
      return false;
    }
    url = BuildRankImageUrl(account);
    if (!url) {
      return false;
    }
    storedUrl = GetPanelAttribute(image, "topbar_rank_player_list_rank_url", "");
    try {
      if (storedUrl !== url || GetPanelAttribute(image, "topbar_rank_player_list_rank_version", "") !== CACHE_VERSION) {
        if (typeof image.SetImage !== "function") throw "SetImage_missing";
        image.SetImage(url);
        SetPanelAttribute(image, "topbar_rank_player_list_rank_url", url);
        SetPanelAttribute(image, "topbar_rank_player_list_rank_account", account);
        SetPanelAttribute(image, "topbar_rank_player_list_rank_version", CACHE_VERSION);
        rowName = rowName || ReadRowName(row);
      }
      AddClass(image, PLAYER_LIST_RANK_VISIBLE_CLASS);
      MarkTopbarRankMatchActiveIfHudActive(row, source || "player_list_rank_image_set");
      return true;
    } catch (e0) {}
    return false;
  }

  function ClearPlayerListRowRankState(row) {
    var image = FindPlayerListRowRankImage(row);
    var storedUrl;
    var wasVisible;
    if (!IsPanelValid(image)) return false;
    storedUrl = GetPanelAttribute(image, "topbar_rank_player_list_rank_url", "");
    wasVisible = HasClass(image, PLAYER_LIST_RANK_VISIBLE_CLASS);
    try {
      if ((storedUrl || wasVisible) && typeof image.SetImage === "function") image.SetImage("");
    } catch (e0) {}
    RemoveClass(image, PLAYER_LIST_RANK_VISIBLE_CLASS);
    SetPanelAttribute(image, "topbar_rank_player_list_rank_account", "");
    SetPanelAttribute(image, "topbar_rank_player_list_rank_url", "");
    SetPanelAttribute(image, "topbar_rank_player_list_rank_version", "");
    return true;
  }

  function MaybeClearPlayerListRowForMatchReset(docRoot, row, resetEpoch) {
    var epoch = resetEpoch !== undefined ? resetEpoch : GetPanelAttribute(docRoot, "topbar_rank_match_cache_reset_epoch", "");
    var image;
    if (!epoch || !IsPanelValid(row)) return false;
    image = FindPlayerListRowRankImage(row);
    if (!IsPanelValid(image)) return false;
    if (GetPanelAttribute(image, "topbar_rank_match_cache_cleared_epoch", "") === epoch) return false;
    ClearPlayerListRowRankState(row);
    SetPanelAttribute(image, "topbar_rank_match_cache_cleared_epoch", epoch);
    return true;
  }

  function FindPlayerListRows(root) {
    return FindChildrenWithClass(GetDocumentRoot(root), PLAYER_LIST_ROW_CLASS);
  }

  function FindUniquePlayerListRowByNameNorm(root, nameNorm) {
    var norm = NormalizeName(nameNorm);
    var rows;
    var row;
    var rowNorm;
    var found = null;
    var count = 0;
    var i;
    if (!norm) return null;
    rows = FindPlayerListRows(root);
    for (i = 0; i < rows.length; i += 1) {
      row = rows[i];
      rowNorm = NormalizeName(ReadRowName(row));
      if (rowNorm !== norm) continue;
      count += 1;
      if (count === 1) found = row;
      else return null;
    }
    return count === 1 ? found : null;
  }

  function ResolveVerifiedActiveSimPlayerListRow(root, active) {
    var docRoot = GetDocumentRoot(root);
    var rowRoot;
    var rowNorm;
    if (active && IsPanelValid(active.row)) {
      rowRoot = GetDocumentRoot(active.row);
      rowNorm = NormalizeName(ReadRowName(active.row));
      if ((!IsPanelValid(docRoot) || !IsPanelValid(rowRoot) || rowRoot === docRoot) && rowNorm && rowNorm === active.rowNameNorm) return active.row;
    }
    return FindUniquePlayerListRowByNameNorm(docRoot, active ? active.rowNameNorm : "");
  }

  function ApplyVerifiedActiveSimPlayerListRank(root, active, accountId, source) {
    var account = NormalizeAccountId(accountId);
    var row;
    if (!account || !active || !active.rowNameNorm) return false;
    row = ResolveVerifiedActiveSimPlayerListRow(root, active);
    if (!IsPanelValid(row)) {
      return false;
    }
    return ApplyPlayerListRowRankImage(row, account, source || "sim_active_verified_account");
  }

  function BuildEscapeRoster(root, forceTopBarRefresh) {
    var docRoot = GetDocumentRoot(root);
    var rows = FindPlayerListRows(docRoot);
    var topbar = FindTopBarCandidates(docRoot, !!forceTopBarRefresh);
    var matched = 0;
    var ambiguous = 0;
    var missing = 0;
    var skipped = 0;
    var uniqueTopbarNames = {};
    var topbarNameMap = {};
    var uniqueMatchedTopbar = {};
    var uniqueTopbarNameCount = 0;
    var uniqueMatchedTopbarCount = 0;
    var firstMissingName = "";
    var firstAmbiguousName = "";
    var firstSkippedName = "";
    var topbarOnlyReason = "";
    var matches = [];
    var i;
    var resetEpoch;
    var name;
    var norm;
    var match;
    var topbarNameEntry;
    var uid;
    resetEpoch = GetPanelAttribute(docRoot, "topbar_rank_match_cache_reset_epoch", "");
    if (resetEpoch) {
      for (i = 0; i < rows.length; i += 1) {
        MaybeClearPlayerListRowForMatchReset(docRoot, rows[i], resetEpoch);
      }
    }
    for (i = 0; i < topbar.length; i += 1) {
      if (!topbar[i].nameNorm) continue;
      topbarNameEntry = topbarNameMap[topbar[i].nameNorm];
      if (topbarNameEntry) {
        topbarNameEntry.count += 1;
        topbarNameEntry.candidate = null;
      } else {
        topbarNameMap[topbar[i].nameNorm] = { count: 1, candidate: topbar[i] };
      }
      if (!uniqueTopbarNames[topbar[i].nameNorm]) {
        uniqueTopbarNames[topbar[i].nameNorm] = true;
        uniqueTopbarNameCount += 1;
      }
    }
    for (i = 0; i < rows.length; i += 1) {
      name = ReadRowName(rows[i]);
      norm = NormalizeName(name);
      if (!norm) {
        skipped += 1;
        if (!firstSkippedName) firstSkippedName = name || "<empty>";
        matches.push({ row: rows[i], rowIndex: i, name: name || "", nameNorm: "", candidate: null, status: "skipped" });
        continue;
      }
      topbarNameEntry = topbarNameMap[norm];
      match = topbarNameEntry ? { candidate: topbarNameEntry.count === 1 ? topbarNameEntry.candidate : null, count: topbarNameEntry.count, total: topbar.length } : { candidate: null, count: 0, total: topbar.length };
      if (match.candidate) {
        matched += 1;
        uid = match.candidate.uid || String(match.candidate.index);
        if (uid && !uniqueMatchedTopbar[uid]) {
          uniqueMatchedTopbar[uid] = true;
          uniqueMatchedTopbarCount += 1;
        }
        matches.push({ row: rows[i], rowIndex: i, name: name || "", nameNorm: norm, candidate: match.candidate, status: "matched" });
      } else if (match.count > 1) {
        ambiguous += 1;
        if (!firstAmbiguousName) firstAmbiguousName = name || "<empty>";
        matches.push({ row: rows[i], rowIndex: i, name: name || "", nameNorm: norm, candidate: null, status: "ambiguous", count: match.count });
      } else {
        missing += 1;
        if (!firstMissingName) firstMissingName = name || "<empty>";
        matches.push({ row: rows[i], rowIndex: i, name: name || "", nameNorm: norm, candidate: null, status: "missing" });
      }
    }
    if (topbar.length === 12 && uniqueTopbarNameCount === 12 && (!rows.length || matched !== 12 || ambiguous || missing || skipped)) {
      topbarOnlyReason = rows.length ? "stale_or_mismatched_rows" : "no_rows";
      rows = [];
      matches = [];
      matched = 0;
      ambiguous = 0;
      missing = 0;
      skipped = 0;
      firstMissingName = "";
      firstAmbiguousName = "";
      firstSkippedName = "";
      uniqueMatchedTopbar = {};
      uniqueMatchedTopbarCount = 0;
      for (i = 0; i < topbar.length; i += 1) {
        if (!topbar[i].nameNorm) {
          skipped += 1;
          if (!firstSkippedName) firstSkippedName = topbar[i].name || "<empty>";
          matches.push({ row: null, rowIndex: i, name: topbar[i].name || "", nameNorm: "", candidate: null, status: "skipped", source: "topbar_only" });
          rows.push(topbar[i].root);
          continue;
        }
        matched += 1;
        uid = topbar[i].uid || String(topbar[i].index);
        if (uid && !uniqueMatchedTopbar[uid]) {
          uniqueMatchedTopbar[uid] = true;
          uniqueMatchedTopbarCount += 1;
        }
        matches.push({ row: null, rowIndex: i, name: topbar[i].name || "", nameNorm: topbar[i].nameNorm || "", candidate: topbar[i], status: "matched", source: "topbar_only" });
        rows.push(topbar[i].root);
      }
    }
    return {
      rows: rows,
      topbar: topbar,
      matches: matches,
      matched: matched,
      ambiguous: ambiguous,
      missing: missing,
      skipped: skipped,
      uniqueTopbarNames: uniqueTopbarNameCount,
      uniqueMatchedTopbar: uniqueMatchedTopbarCount,
      firstMissingName: firstMissingName,
      firstAmbiguousName: firstAmbiguousName,
      firstSkippedName: firstSkippedName,
      topbarOnlyReason: topbarOnlyReason,
      topbarOnly: rows.length === 12 && matches.length === 12 && matches[0] && matches[0].source === "topbar_only"
    };
  }

  function BuildPlayerListOnlyRoster(root, rowsOverride) {
    var rows = rowsOverride || FindPlayerListRows(root);
    var matches = [];
    var matched = 0;
    var skipped = 0;
    var firstSkippedName = "";
    var i;
    var name;
    var norm;
    for (i = 0; i < rows.length; i += 1) {
      name = ReadRowName(rows[i]);
      norm = NormalizeName(name);
      if (!norm) {
        skipped += 1;
        if (!firstSkippedName) firstSkippedName = name || "<empty>";
        matches.push({ row: rows[i], rowIndex: i, name: name || "", nameNorm: "", candidate: null, status: "skipped", source: "player_list_only" });
        continue;
      }
      matched += 1;
      matches.push({ row: rows[i], rowIndex: i, name: name || "", nameNorm: norm, candidate: null, status: "matched", source: "player_list_only" });
    }
    return {
      rows: rows,
      topbar: [],
      matches: matches,
      matched: matched,
      ambiguous: 0,
      missing: 0,
      skipped: skipped,
      uniqueTopbarNames: 0,
      uniqueMatchedTopbar: 0,
      firstMissingName: "",
      firstAmbiguousName: "",
      firstSkippedName: firstSkippedName,
      topbarOnlyReason: "",
      topbarOnly: false,
      playerListOnly: true
    };
  }

  function EscapeRosterReady(roster) {
    return roster && !roster.topbarOnly && roster.rows && roster.topbar && roster.rows.length === 12 && roster.topbar.length === 12 && roster.matched === 12 && roster.ambiguous === 0 && roster.missing === 0 && roster.skipped === 0 && roster.uniqueMatchedTopbar >= REQUIRED_LOADED && roster.uniqueTopbarNames === 12;
  }

  function PlayerListOnlyRosterReady(roster) {
    return roster && roster.playerListOnly && roster.rows && roster.rows.length === 12 && roster.matched === 12 && roster.ambiguous === 0 && roster.missing === 0 && roster.skipped === 0;
  }

  function TopBarOnlyRosterReady(roster) {
    return roster && roster.topbarOnly && roster.rows && roster.topbar && roster.rows.length === 12 && roster.topbar.length === 12 && roster.matched === 12 && roster.ambiguous === 0 && roster.missing === 0 && roster.skipped === 0 && roster.uniqueTopbarNames === 12 && roster.uniqueMatchedTopbar >= REQUIRED_LOADED;
  }

  function IsHudActiveForTopBarOnlyAuto(transition) {
    if (!transition || transition.reason) return false;
    return Number(transition.gameTimeSec || 0) > 0 || transition.scoreboardOpen === "yes" || transition.activeSpectator === "yes";
  }

  function AutoProbeRosterReady(roster, transition) {
    if (EscapeRosterReady(roster) || PlayerListOnlyRosterReady(roster)) return true;
    return TopBarOnlyRosterReady(roster) && IsHudActiveForTopBarOnlyAuto(transition);
  }

  function ReadPlayerListRowRankAccount(row) {
    var image = FindPlayerListRowRankImage(row);
    if (!IsPanelValid(image)) return "";
    if (GetPanelAttribute(image, "topbar_rank_player_list_rank_version", "") !== CACHE_VERSION) return "";
    return NormalizeAccountId(GetPanelAttribute(image, "topbar_rank_player_list_rank_account", ""));
  }

  function BuildTopBarIdentityPart(candidate) {
    if (!candidate) return "";
    return [
      "t",
      String(candidate.index),
      String(candidate.uid || ""),
      String(candidate.nameNorm || ""),
      String(candidate.teamSide || "")
    ].join(":");
  }

  function BuildTopBarIdlePart(candidate) {
    var account;
    var loadedAccount = "";
    if (!candidate) return "";
    account = ReadTopBarAccount(candidate);
    if (account && TopBarHasRankForAccount(candidate, account)) loadedAccount = account;
    return BuildTopBarIdentityPart(candidate) + ":" + loadedAccount;
  }

  function IdleSignatureHasExactPart(signature, part) {
    var parts;
    var i;
    if (!signature || !part) return false;
    parts = String(signature).split("|");
    for (i = 0; i < parts.length; i += 1) {
      if (parts[i] === part) return true;
    }
    return false;
  }

  function BuildRowIdlePart(row, index, nameNorm) {
    return BuildRowIdentityPart(row, index, nameNorm) + ":" + ReadPlayerListRowRankAccount(row);
  }

  function BuildRowIdentityPart(row, index, nameNorm) {
    return [
      "r",
      String(index),
      String(nameNorm || "")
    ].join(":");
  }

  function BuildTopbarRankIdentitySignature(roster) {
    var parts;
    var i;
    var rowMatch;
    var row;
    var nameNorm;
    if (!roster || !roster.rows || !roster.topbar || !roster.matches) return "";
    parts = [
      CACHE_VERSION,
      REQUIRED_LOADED,
      SIM_PROBE_MAX_ATTEMPTS_PER_ROW,
      roster.rows.length,
      roster.topbar.length,
      roster.matched || 0,
      roster.uniqueMatchedTopbar || 0,
      roster.uniqueTopbarNames || 0,
      roster.topbarOnly ? "topbar_only" : "player_list"
    ];
    for (i = 0; i < roster.topbar.length; i += 1) {
      parts.push(BuildTopBarIdentityPart(roster.topbar[i]));
    }
    for (i = 0; i < roster.rows.length; i += 1) {
      rowMatch = roster.matches[i] || null;
      row = rowMatch && rowMatch.row ? rowMatch.row : roster.rows[i];
      nameNorm = rowMatch && rowMatch.nameNorm ? rowMatch.nameNorm : NormalizeName(ReadRowName(row));
      parts.push(BuildRowIdentityPart(row, i, nameNorm));
    }
    return parts.join("|");
  }

  function IsLoadedIdlePart(part) {
    var text = String(part || "");
    var pieces;
    var account;
    if (text.indexOf("t:") !== 0 && text.indexOf("r:") !== 0) return false;
    pieces = text.split(":");
    account = NormalizeAccountId(pieces.length ? pieces[pieces.length - 1] : "");
    return !!account;
  }

  function LoadedIdlePartsStillPresent(storedSig, currentSig) {
    var parts;
    var i;
    if (!storedSig || !currentSig) return false;
    parts = String(storedSig).split("|");
    for (i = 0; i < parts.length; i += 1) {
      if (IsLoadedIdlePart(parts[i]) && !IdleSignatureHasExactPart(currentSig, parts[i])) return false;
    }
    return true;
  }

  function CountLoadedTopBarIdleParts(roster) {
    var loaded = 0;
    var account;
    var i;
    if (!roster || !roster.topbar) return 0;
    for (i = 0; i < roster.topbar.length; i += 1) {
      account = ReadTopBarAccount(roster.topbar[i]);
      if (account && TopBarHasRankForAccount(roster.topbar[i], account)) loaded += 1;
    }
    return loaded;
  }

  function CountLoadedRowIdleParts(roster) {
    var loaded = 0;
    var rowMatch;
    var row;
    var i;
    if (!roster || !roster.rows) return 0;
    for (i = 0; i < roster.rows.length; i += 1) {
      rowMatch = roster.matches && roster.matches[i] ? roster.matches[i] : null;
      row = rowMatch && rowMatch.row ? rowMatch.row : roster.rows[i];
      if (ReadPlayerListRowRankAccount(row)) loaded += 1;
    }
    return loaded;
  }

  function BuildTopbarRankIdleSignature(roster) {
    var parts;
    var i;
    var rowMatch;
    var row;
    var nameNorm;
    if (!roster || !roster.rows || !roster.topbar || !roster.matches) return "";
    parts = [
      CACHE_VERSION,
      REQUIRED_LOADED,
      SIM_PROBE_MAX_ATTEMPTS_PER_ROW,
      roster.rows.length,
      roster.topbar.length,
      roster.matched || 0,
      roster.uniqueMatchedTopbar || 0,
      roster.uniqueTopbarNames || 0,
      roster.topbarOnly ? "topbar_only" : "player_list"
    ];
    for (i = 0; i < roster.topbar.length; i += 1) {
      parts.push(BuildTopBarIdlePart(roster.topbar[i]));
    }
    for (i = 0; i < roster.rows.length; i += 1) {
      rowMatch = roster.matches[i] || null;
      row = rowMatch && rowMatch.row ? rowMatch.row : roster.rows[i];
      nameNorm = rowMatch && rowMatch.nameNorm ? rowMatch.nameNorm : NormalizeName(ReadRowName(row));
      parts.push(BuildRowIdlePart(row, i, nameNorm));
    }
    return parts.join("|");
  }

  function BuildStableEscapeRosterSignature(roster) {
    return BuildTopbarRankIdentitySignature(roster);
  }

  function ClearStableEscapeRosterState(root) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    SetPanelAttribute(docRoot, "topbar_rank_escape_roster_stable_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_roster_stable_pending_sig", "");
    return true;
  }

  function ScheduleStableEscapeRosterRetry(root, source, sig) {
    var docRoot = GetDocumentRoot(root);
    var stableSource = source || "escape_auto";
    if (!IsPanelValid(docRoot) || !sig) return false;
    try {
      if (!$.Schedule) return false;
    } catch (e0) {
      return false;
    }
    if (GetPanelAttribute(docRoot, "topbar_rank_escape_roster_stable_pending_sig", "") === sig) return false;
    SetPanelAttribute(docRoot, "topbar_rank_escape_roster_stable_pending_sig", sig);
    try {
      $.Schedule(ESCAPE_AUTO_READY_RETRY_DELAY_SECONDS, function() {
        var retryRoot = GetDocumentRoot(docRoot);
        if (!IsPanelValid(retryRoot)) return;
        if (GetPanelAttribute(retryRoot, "topbar_rank_escape_roster_stable_pending_sig", "") !== sig) return;
        SetPanelAttribute(retryRoot, "topbar_rank_escape_roster_stable_pending_sig", "");
        if (IsTopbarRankRuntimeIdleCurrent(retryRoot, stableSource + "_stable_retry_idle", true)) return;
        EscapeAutoPopulate(retryRoot, stableSource);
      });
      return true;
    } catch (e1) {
      SetPanelAttribute(docRoot, "topbar_rank_escape_roster_stable_pending_sig", "");
    }
    return false;
  }

  function HasStableEscapeRoster(root, roster, source) {
    var docRoot = GetDocumentRoot(root);
    var sig;
    if (!IsPanelValid(docRoot)) return true;
    sig = BuildStableEscapeRosterSignature(roster);
    if (!sig) return true;
    if (GetPanelAttribute(docRoot, "topbar_rank_escape_roster_stable_sig", "") === sig) return true;
    if (!ScheduleStableEscapeRosterRetry(docRoot, source || "escape_auto", sig)) return true;
    SetPanelAttribute(docRoot, "topbar_rank_escape_roster_stable_sig", sig);
    return false;
  }


  function HasTopbarRankRuntimeIdle(root) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    return !!GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_sig", "");
  }

  function IsRuntimeIdleLatched(root) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    return !!GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_sig", "");
  }

  function GetRuntimeIdleLoaded(root) {
    var docRoot = GetDocumentRoot(root);
    var loaded;
    if (!IsPanelValid(docRoot)) return REQUIRED_LOADED;
    loaded = Number(GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_loaded", REQUIRED_LOADED) || REQUIRED_LOADED);
    return isFinite(loaded) ? loaded : REQUIRED_LOADED;
  }

  function SetTopbarRankRuntimeIdleState(docRoot, roster, sig, loaded) {
    if (!IsPanelValid(docRoot)) return false;
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_sig", sig || "");
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_identity_sig", BuildTopbarRankIdentitySignature(roster));
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_topbar_loaded", CountLoadedTopBarIdleParts(roster));
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_row_loaded", CountLoadedRowIdleParts(roster));
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_loaded", loaded);
    return true;
  }

  function ClearTopbarRankRuntimeIdleAttributes(docRoot) {
    if (!IsPanelValid(docRoot)) return false;
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_identity_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_topbar_loaded", "");
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_row_loaded", "");
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_at", "");
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_loaded", "");
    return true;
  }

  function TryRefreshRuntimeIdleForRankGrowth(docRoot, roster, currentSig, source) {
    var storedSig;
    var storedIdentity;
    var currentIdentity;
    if (!IsPanelValid(docRoot) || !roster || !currentSig) return false;
    storedSig = GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_sig", "");
    storedIdentity = GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_identity_sig", "");
    currentIdentity = BuildTopbarRankIdentitySignature(roster);
    if (!storedSig || !storedIdentity || !currentIdentity || storedIdentity !== currentIdentity) return false;
    if (!LoadedIdlePartsStillPresent(storedSig, currentSig)) return false;
    SetTopbarRankRuntimeIdleState(docRoot, roster, currentSig, GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_loaded", "") || REQUIRED_LOADED);
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_completed_sig", currentSig);
    return true;
  }

  function ClearTopbarRankTransientState(root) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_token", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_step", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_max_steps", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_active_until", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_continue_pending", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_ready_retry_pending_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_ready_retry_done_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_completed_at", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_completed_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_topbar_retry_at", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_open_watch_token", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_open_watch_count", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_count", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_pending_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_last_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_row_ready_pending", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_intent_pending", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_check_pending", "");
    ClearStableEscapeRosterState(docRoot);
    SetPanelAttribute(docRoot, "topbar_rank_sim_roster_next_row_index", "");
    SetPanelAttribute(docRoot, "topbar_rank_prompt_state_apply_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_sim_completed_token", "");
    state.completedSimToken = "";
    state.probedRowOpenKeys = {};
    ClearActiveSimOpen(docRoot);
    MarkTopBarCandidateCacheDirty(docRoot);
    return true;
  }

  function MarkTopbarRankMatchActive(root) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    SetPanelAttribute(docRoot, "topbar_rank_match_cache_lobby_active", "");
    return true;
  }

  function MarkTopbarRankMatchActiveIfHudActive(root, source, roster) {
    var docRoot = GetDocumentRoot(root);
    var transition;
    if (!IsPanelValid(docRoot)) return false;
    if (GetPanelAttribute(docRoot, "topbar_rank_match_cache_lobby_active", "") !== "yes") return false;
    transition = ReadHudTransitionInfo(docRoot, roster || null);
    if (IsHudTransitionStopReason(transition.reason)) return false;
    MarkTopbarRankMatchActive(docRoot);
    return true;
  }

  function ClearLastProfileAttributes(root) {
    SetPanelAttribute(root, "topbar_rank_last_account_id", "");
    SetPanelAttribute(root, "topbar_rank_last_steamid3", "");
    SetPanelAttribute(root, "topbar_rank_last_steam64", "");
    SetPanelAttribute(root, "topbar_rank_last_profile_name", "");
    SetPanelAttribute(root, "topbar_rank_last_profile_name_norm", "");
    SetPanelAttribute(root, "topbar_rank_profile_quarantine_account", "");
    SetPanelAttribute(root, "topbar_rank_profile_quarantine_token", "");
    SetPanelAttribute(root, "topbar_rank_profile_quarantine_reason", "");
  }

  function ClearSharedAccountCaches() {
    ForEachSharedStore(function(sharedRoot) {
      var shared = EnsureSharedCache(sharedRoot);
      if (!shared) return;
      shared.version = CACHE_VERSION;
      shared.knownAccountsByNameNorm = {};
      shared.knownOrder = [];
    });
  }

  function MaybeClearTopBarForMatchReset(docRoot, root, image, source) {
    var epoch = GetPanelAttribute(docRoot, "topbar_rank_match_cache_reset_epoch", "");
    var clearedEpoch;
    var candidate;
    if (!epoch || !IsPanelValid(root) || !IsPanelValid(image)) return false;
    clearedEpoch = GetPanelAttribute(image, "topbar_rank_match_cache_cleared_epoch", "") || GetPanelAttribute(root, "topbar_rank_match_cache_cleared_epoch", "");
    if (clearedEpoch === epoch) return false;
    candidate = { root: root, image: image, name: ReadText(FindChild(root, "PlayerName")) || "", nameNorm: "", index: GetPanelAttribute(image, "topbar_rank_topbar_index", "") || GetPanelAttribute(root, "topbar_rank_topbar_index", "") || "" };
    ClearTopBarRankPanelState(candidate);
    SetPanelAttribute(image, "topbar_rank_match_cache_cleared_epoch", epoch);
    SetPanelAttribute(root, "topbar_rank_match_cache_cleared_epoch", epoch);
    return true;
  }

  function IsProfileCardResetRoot(panel) {
    return IsPanelValid(panel) && (HasClass(panel, "TopbarRankProfileCardRoot") || GetPanelType(panel) === "CitadelProfileCard" || GetPanelId(panel) === "ProfileCard");
  }

  function ClearProfileCardRankForMatchReset(profileRoot, resetEpoch) {
    var media;
    var localBadge;
    var clearedEpoch;
    var hasState;
    if (!IsProfileCardResetRoot(profileRoot)) return false;
    media = FindChildCached(profileRoot, "__topbarRankMediaPanel", "TopbarRankProfileRankImage");
    if (!IsPanelValid(media)) return false;
    clearedEpoch = GetPanelAttribute(media, "topbar_rank_match_cache_cleared_epoch", "") || GetPanelAttribute(profileRoot, "topbar_rank_match_cache_cleared_epoch", "");
    if (resetEpoch && clearedEpoch === String(resetEpoch)) return false;
    hasState = !!(GetPanelAttribute(media, "topbar_rank_account_id", "")
      || GetPanelAttribute(media, "topbar_rank_rank_url", "")
      || GetPanelAttribute(profileRoot, "topbar_rank_profile_watch_token", "")
      || GetPanelAttribute(profileRoot, "topbar_rank_profile_applied_account", "")
      || GetPanelAttribute(profileRoot, "topbar_rank_profile_topbar_applied", ""));
    if (!hasState) return false;
    localBadge = FindChildCached(profileRoot, "__topbarRankLocalBadgePanel", "TopbarRankProfileLocalBadge");
    ClearProfileWatchAttributes(profileRoot);
    SetPanelAttribute(profileRoot, "topbar_rank_profile_applied_account", "");
    SetPanelAttribute(profileRoot, "topbar_rank_profile_topbar_applied", "");
    SetPanelAttribute(profileRoot, "topbar_rank_profile_seen_at", "");
    SetPanelAttribute(profileRoot, "topbar_rank_profile_pending_stale_account", "");
    SetPanelVisible(localBadge, false);
    ClearProfileRankMedia({ root: profileRoot, media: media });
    if (resetEpoch) {
      SetPanelAttribute(media, "topbar_rank_match_cache_cleared_epoch", resetEpoch);
      SetPanelAttribute(profileRoot, "topbar_rank_match_cache_cleared_epoch", resetEpoch);
    }
    return true;
  }

  function ClearProfileCardRanksForMatchReset(root, resetEpoch) {
    var docRoot = GetDocumentRoot(root);
    var profileRoots;
    var directProfile;
    var cleared = 0;
    var i;
    if (!IsPanelValid(docRoot)) return 0;
    if (IsProfileCardResetRoot(docRoot) && ClearProfileCardRankForMatchReset(docRoot, resetEpoch)) cleared += 1;
    directProfile = FindChildCached(docRoot, "__topbarRankProfileCardPanel", "ProfileCard");
    if (ClearProfileCardRankForMatchReset(directProfile, resetEpoch)) cleared += 1;
    profileRoots = FindChildrenWithClass(docRoot, "TopbarRankProfileCardRoot");
    for (i = 0; i < profileRoots.length; i += 1) {
      if (ClearProfileCardRankForMatchReset(profileRoots[i], resetEpoch)) cleared += 1;
    }
    return cleared;
  }

  function ClearTopbarRankMatchCache(root, reason, source, roster) {
    var docRoot = GetDocumentRoot(root);
    var alreadyActive;
    var epoch;
    var candidates;
    var rows;
    var i;
    if (!IsPanelValid(docRoot)) return false;
    if (!ClearTopbarRankRuntimeIdle(docRoot, reason || "match_cache_reset", source || "match_cache_reset", roster)) ClearTopbarRankTransientState(docRoot);
    alreadyActive = GetPanelAttribute(docRoot, "topbar_rank_match_cache_lobby_active", "") === "yes";
    if (alreadyActive) {
      ClearProfileCardRanksForMatchReset(docRoot, GetPanelAttribute(docRoot, "topbar_rank_match_cache_reset_epoch", ""));
      return false;
    }
    epoch = Number(GetPanelAttribute(docRoot, "topbar_rank_match_cache_reset_epoch", "0") || 0);
    if (!isFinite(epoch) || epoch < 0) epoch = 0;
    epoch += 1;
    SetPanelAttribute(docRoot, "topbar_rank_match_cache_reset_epoch", epoch);
    SetPanelAttribute(docRoot, "topbar_rank_match_cache_lobby_active", "yes");
    SetPanelAttribute(docRoot, "topbar_rank_match_cache_reset_reason", reason || "unknown");
    state.knownAccountsByNameNorm = {};
    state.knownOrder = [];
    state.hoverToken = null;
    state.profileQuarantine = null;
    ClearRootIndexedCache(docRoot, reason || "match_transition");
    ClearSharedAccountCaches();
    ClearLastProfileAttributes(docRoot);
    ClearProfileCardRanksForMatchReset(docRoot, epoch);
    candidates = FindTopBarCandidates(docRoot, true);
    for (i = 0; i < candidates.length; i += 1) {
      if (ClearTopBarRankPanelState(candidates[i])) {
        SetPanelAttribute(candidates[i].image, "topbar_rank_match_cache_cleared_epoch", epoch);
        SetPanelAttribute(candidates[i].root, "topbar_rank_match_cache_cleared_epoch", epoch);
      }
    }
    rows = roster && roster.rows && !roster.topbarOnly ? roster.rows : FindPlayerListRows(docRoot);
    for (i = 0; i < rows.length; i += 1) {
      if (ClearPlayerListRowRankState(rows[i])) {
        SetPanelAttribute(FindPlayerListRowRankImage(rows[i]), "topbar_rank_match_cache_cleared_epoch", epoch);
      }
    }
    HideAllTeamAverageImages(docRoot);
    MarkTopBarCandidateCacheDirty(docRoot);
    return true;
  }

  function IsHudTransitionStopReason(reason) {
    return reason === "hideout_transition" || reason === "lobby_or_hideout_transition";
  }

  function StopTopbarRankAutomationForHudTransition(root, source, roster, reason) {
    var docRoot = GetDocumentRoot(root);
    var clearedIdle = false;
    if (!IsPanelValid(docRoot) || !IsHudTransitionStopReason(reason)) return false;
    clearedIdle = ClearTopbarRankRuntimeIdle(docRoot, reason, source || "hud_transition", roster);
    if (!clearedIdle) ClearTopbarRankTransientState(docRoot);
    ClearTopbarRankMatchCache(docRoot, reason, source || "hud_transition", roster);
    return true;
  }

  function ClearTopbarRankRuntimeIdle(root, reason, source, roster) {
    var docRoot = GetDocumentRoot(root);
    var oldSig;
    if (!IsPanelValid(docRoot)) return false;
    oldSig = GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_sig", "");
    if (!oldSig) {
      ClearTopbarRankRuntimeIdleAttributes(docRoot);
      return false;
    }
    ClearTopbarRankRuntimeIdleAttributes(docRoot);
    ClearTopbarRankTransientState(docRoot);
    return true;
  }

  function IsTopbarRankRuntimeIdleActive(root, roster, source) {
    var docRoot = GetDocumentRoot(root);
    var storedSig;
    var currentSig;
    var transition;
    if (!IsPanelValid(docRoot)) return false;
    storedSig = GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_sig", "");
    if (!storedSig) return false;
    if (!roster) return true;
    transition = ReadHudTransitionInfo(docRoot, roster);
    if (IsHudTransitionStopReason(transition.reason)) {
      StopTopbarRankAutomationForHudTransition(docRoot, source || "unknown", roster, transition.reason);
      return false;
    }
    currentSig = BuildTopbarRankIdleSignature(roster);
    if (currentSig && currentSig === storedSig) {
      return true;
    }
    if (TryRefreshRuntimeIdleForRankGrowth(docRoot, roster, currentSig, source || "unknown")) return true;
    ClearTopbarRankRuntimeIdle(docRoot, "signature_changed", source || "unknown", roster);
    return false;
  }

  function IsTopbarRankRuntimeIdleCurrent(root, source, forceTopBarRefresh) {
    var docRoot = GetDocumentRoot(root);
    if (!HasTopbarRankRuntimeIdle(docRoot)) return false;
    return IsTopbarRankRuntimeIdleActive(docRoot, BuildEscapeRoster(docRoot, !!forceTopBarRefresh), source || "runtime_idle_current");
  }

  function MaybeResetIdleForTopBarCandidate(root, candidate, source) {
    var docRoot = GetDocumentRoot(root);
    var storedSig;
    var candidatePart;
    var roster;
    if (!IsPanelValid(docRoot) || !candidate) return false;
    storedSig = GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_sig", "");
    if (!storedSig) return false;
    candidatePart = BuildTopBarIdlePart(candidate);
    if (candidatePart && IdleSignatureHasExactPart(storedSig, candidatePart)) {
      return false;
    }
    roster = BuildEscapeRoster(docRoot);
    return ClearTopbarRankRuntimeIdle(docRoot, "topbar_candidate_changed", source || "topbar_register", roster);
  }

  function EnterTopbarRankRuntimeIdle(root, roster, loaded, source) {
    var docRoot = GetDocumentRoot(root);
    var sig;
    var now;
    if (!IsPanelValid(docRoot) || !EscapeRosterReady(roster) || Number(loaded || 0) < REQUIRED_LOADED) return false;
    if (!UpdateTeamAverageRanks(docRoot, (source || "runtime_idle") + "_idle_enter", roster.topbar)) return false;
    sig = BuildTopbarRankIdleSignature(roster);
    if (!sig) return false;
    if (GetPanelAttribute(docRoot, "topbar_rank_runtime_idle_sig", "") === sig) return true;
    now = NowMs();
    SetTopbarRankRuntimeIdleState(docRoot, roster, sig, loaded);
    SetPanelAttribute(docRoot, "topbar_rank_runtime_idle_at", now);
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_completed_sig", sig);
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_token", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_step", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_max_steps", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_active_until", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_continue_pending", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_ready_retry_pending_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_open_watch_token", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_open_watch_count", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_count", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_pending_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_last_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_row_ready_pending", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_check_pending", "");
    ClearStableEscapeRosterState(docRoot);
    ClearActiveSimOpen(docRoot);
    return true;
  }

  function IsNearReadyEscapeRoster(roster) {
    return roster && !roster.topbarOnly && roster.rows && roster.topbar &&
      roster.rows.length === 12 &&
      roster.topbar.length === 12 &&
      roster.matched === 12 &&
      roster.ambiguous === 0 &&
      roster.missing === 0 &&
      roster.skipped === 0 &&
      roster.uniqueTopbarNames === 12 &&
      roster.uniqueMatchedTopbar >= 10;
  }

  function ScheduleEscapeAutoReadyRetry(root, source, roster) {
    var docRoot = GetDocumentRoot(root);
    var sig;
    var doneSig;
    if (!IsPanelValid(docRoot) || !IsNearReadyEscapeRoster(roster)) return false;
    if (IsTopbarRankRuntimeIdleActive(docRoot, roster, source || "topbar_ready")) return false;
    try {
      if (!$.Schedule) return false;
    } catch (e0) {
      return false;
    }
    sig = [
      roster.rows.length,
      roster.topbar.length,
      roster.matched || 0,
      roster.uniqueMatchedTopbar || 0,
      roster.uniqueTopbarNames || 0,
      roster.firstMissingName || "",
      roster.firstAmbiguousName || "",
      source || "topbar_ready"
    ].join("|");
    doneSig = GetPanelAttribute(docRoot, "topbar_rank_escape_auto_ready_retry_done_sig", "");
    if (doneSig === sig || GetPanelAttribute(docRoot, "topbar_rank_escape_auto_ready_retry_pending_sig", "") === sig) return false;
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_ready_retry_pending_sig", sig);
    try {
      $.Schedule(ESCAPE_AUTO_READY_RETRY_DELAY_SECONDS, function() {
        var retryRoot = GetDocumentRoot(docRoot);
        var retryRoster;
        if (!IsPanelValid(retryRoot)) return;
        if (GetPanelAttribute(retryRoot, "topbar_rank_escape_auto_ready_retry_pending_sig", "") !== sig) return;
        SetPanelAttribute(retryRoot, "topbar_rank_escape_auto_ready_retry_pending_sig", "");
        if (IsTopbarRankRuntimeIdleCurrent(retryRoot, (source || "topbar_ready") + "_retry_idle", true)) return;
        SetPanelAttribute(retryRoot, "topbar_rank_escape_auto_ready_retry_done_sig", sig);
        retryRoster = BuildEscapeRoster(retryRoot);
        if (IsTopbarRankRuntimeIdleActive(retryRoot, retryRoster, (source || "topbar_ready") + "_retry")) return;
        MaybeTriggerEscapeAutoFromTopBar(retryRoot, (source || "topbar_ready") + "_retry");
      });
      return true;
    } catch (e1) {
      SetPanelAttribute(docRoot, "topbar_rank_escape_auto_ready_retry_pending_sig", "");
    }
    return false;
  }

  function TopBarWaitSignature(roster, source, reason) {
    var stableSource = NormalizeTopBarWaitSource(source);
    if (!roster) return stableSource + "|" + String(reason || "missing_roster");
    return [
      stableSource,
      reason || "roster_not_confirmed",
      roster.rows ? roster.rows.length : 0,
      roster.topbar ? roster.topbar.length : 0,
      roster.matched || 0,
      roster.uniqueMatchedTopbar || 0,
      roster.missing || 0,
      roster.ambiguous || 0,
      roster.skipped || 0,
      roster.firstMissingName || "",
      roster.firstAmbiguousName || ""
    ].join("|");
  }

  function ShouldUseSlowTopBarWaitRetry(roster, reason) {
    if (reason === "rows_not_ready") return true;
    if (reason === "topbar_partial_player_list_ready") return true;
    return !IsNearReadyEscapeRoster(roster);
  }

  function ShouldStopRepeatedNotReadyTopBarWait(roster, reason, count) {
    if (count <= 0) return false;
    if (reason === "rows_not_ready") return false;
    return reason === "topbar_partial_player_list_ready" && ShouldUseSlowTopBarWaitRetry(roster, reason);
  }


  function ScheduleTopBarWaitRetry(root, source, roster, reason) {
    var docRoot = GetDocumentRoot(root);
    var stableSource = NormalizeTopBarWaitSource(source);
    var count;
    var sig;
    var lastSig;
    var delay;
    if (!IsPanelValid(docRoot)) return false;
    try {
      if (!$.Schedule) return false;
    } catch (e0) {
      return false;
    }
    sig = TopBarWaitSignature(roster, stableSource, reason);
    count = Number(GetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_count", "0") || 0);
    if (!isFinite(count) || count < 0) count = 0;
    lastSig = GetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_last_sig", "");
    if (lastSig !== sig) {
      count = 0;
      SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_last_sig", sig);
    } else if (ShouldStopRepeatedNotReadyTopBarWait(roster, reason, count)) {
      return false;
    }
    if (count >= TOPBAR_READY_WAIT_RETRY_MAX) return false;
    if (GetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_pending_sig", "") === sig) return false;
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_count", count + 1);
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_pending_sig", sig);
    delay = ShouldUseSlowTopBarWaitRetry(roster, reason) ? TOPBAR_READY_WAIT_SLOW_RETRY_DELAY_SECONDS : (count < TOPBAR_READY_WAIT_FAST_RETRY_MAX ? ESCAPE_AUTO_READY_RETRY_DELAY_SECONDS : TOPBAR_READY_WAIT_SLOW_RETRY_DELAY_SECONDS);
    try {
      $.Schedule(delay, function() {
        var retryRoot = GetDocumentRoot(docRoot);
        if (!IsPanelValid(retryRoot)) return;
        if (GetPanelAttribute(retryRoot, "topbar_rank_topbar_ready_wait_retry_pending_sig", "") !== sig) return;
        SetPanelAttribute(retryRoot, "topbar_rank_topbar_ready_wait_retry_pending_sig", "");
        MaybeTriggerEscapeAutoFromTopBar(retryRoot, stableSource);
      });
      return true;
    } catch (e1) {
      SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_pending_sig", "");
    }
    return false;
  }

  function HasPendingTopBarWaitRetry(root) {
    return !!GetPanelAttribute(GetDocumentRoot(root), "topbar_rank_topbar_ready_wait_retry_pending_sig", "");
  }


  function MaybeTriggerEscapeAutoFromTopBar(root, source) {
    var docRoot = GetDocumentRoot(root);
    var sourceName = NormalizeTopBarWaitSource(source);
    var roster;
    var transition;
    var now;
    var lastReady;
    if (!IsPanelValid(docRoot)) return false;
    if (HasPendingTopBarWaitRetry(docRoot)) return false;
    roster = BuildEscapeRoster(docRoot);
    if (IsTopbarRankRuntimeIdleActive(docRoot, roster, sourceName)) return false;
    transition = ReadHudTransitionInfo(docRoot, roster);
    if (transition.reason) {
      if (IsHudTransitionStopReason(transition.reason)) StopTopbarRankAutomationForHudTransition(docRoot, sourceName, roster, transition.reason);
      else ScheduleTopBarWaitRetry(docRoot, sourceName, roster, transition.reason);
      return false;
    }
    MarkTopbarRankMatchActive(docRoot);
    if (ShouldUsePlayerListOnlyAuto(docRoot, roster, sourceName)) {
      roster = BuildPlayerListOnlyRoster(docRoot, roster.rows);
      roster.playerListOnlyFallback = true;
    }
    if (!roster.rows || roster.rows.length !== 12) {
      ScheduleTopBarWaitRetry(docRoot, sourceName, roster, "rows_not_ready");
      return false;
    }
    if (!AutoProbeRosterReady(roster, transition)) {
      ScheduleEscapeAutoReadyRetry(docRoot, sourceName, roster);
      ScheduleTopBarWaitRetry(docRoot, sourceName, roster, "roster_not_confirmed");
      return false;
    }
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_count", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_pending_sig", "");
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_wait_retry_last_sig", "");
    now = NowMs();
    lastReady = Number(GetPanelAttribute(docRoot, "topbar_rank_escape_auto_topbar_retry_at", "0") || 0);
    if (isFinite(lastReady) && lastReady > 0 && now - lastReady >= 0 && now - lastReady < ESCAPE_AUTO_TOPBAR_RETRY_THROTTLE_MS) {
      return false;
    }
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_topbar_retry_at", now);
    if (PlayerListOnlyRosterReady(roster)) ScheduleTopBarWaitRetry(docRoot, sourceName, roster, "topbar_partial_player_list_ready");
    return EscapeAutoPopulate(docRoot, sourceName, roster, transition);
  }

  function ScheduleTopBarReadyCheck(root, source) {
    var docRoot = GetDocumentRoot(root);
    var sourceName = source || "topbar_register";
    var hasSchedule = false;
    if (!IsPanelValid(docRoot)) return false;
    try {
      hasSchedule = !!$.Schedule;
    } catch (e0) {
      hasSchedule = false;
    }
    if (!hasSchedule) {
      if (IsTopbarRankRuntimeIdleCurrent(docRoot, sourceName + "_idle_check", true)) return false;
      return MaybeTriggerEscapeAutoFromTopBar(docRoot, sourceName + "_direct");
    }
    if (HasPendingTopBarWaitRetry(docRoot)) return false;
    if (GetPanelAttribute(docRoot, "topbar_rank_topbar_ready_check_pending", "") === "yes") return false;
    if (IsTopbarRankRuntimeIdleCurrent(docRoot, sourceName + "_idle_check", true)) return false;
    SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_check_pending", "yes");
    try {
      $.Schedule(ESCAPE_ROW_READY_COALESCE_DELAY_SECONDS, function() {
        var retryRoot = GetDocumentRoot(docRoot);
        if (!IsPanelValid(retryRoot)) return;
        SetPanelAttribute(retryRoot, "topbar_rank_topbar_ready_check_pending", "");
        if (IsTopbarRankRuntimeIdleCurrent(retryRoot, sourceName + "_coalesced_idle_check", true)) return;
        MaybeTriggerEscapeAutoFromTopBar(retryRoot, sourceName + "_coalesced");
      });
      return true;
    } catch (e1) {
      SetPanelAttribute(docRoot, "topbar_rank_topbar_ready_check_pending", "");
    }
    return false;
  }


  function WriteEscapePromptVisualSignature(root, stateName, loaded, blocked, rows) {
    var docRoot = GetDocumentRoot(root);
    var sig = String(stateName || "") + "|" + String(loaded || 0) + "|" + String(blocked || 0) + "|" + String(rows || 0);
    if (!IsPanelValid(docRoot)) return;
    if (GetPanelAttribute(docRoot, "topbar_rank_prompt_visual_sig", "") !== sig) {
      SetPanelAttribute(docRoot, "topbar_rank_prompt_visual_sig", sig);
    }
  }

  function UpdateEscapePrompt(root, loaded, blocked, rows, topbarCount) {
    var docRoot = GetDocumentRoot(root);
    var resolvedTopbarCount = topbarCount === undefined || topbarCount === null ? FindTopBarCandidates(docRoot).length : Number(topbarCount || 0);
    var stateName = "needs_manual_profiles";
    var sig;
    loaded = Number(loaded || 0);
    blocked = Number(blocked || 0);
    rows = Number(rows || 0);
    if (!isFinite(resolvedTopbarCount) || resolvedTopbarCount < 0) resolvedTopbarCount = 0;
    if (!resolvedTopbarCount) stateName = "no_topbar";
    else if (loaded >= REQUIRED_LOADED) stateName = "ready";
    else if (!rows) stateName = "needs_escape";
    sig = stateName + "|" + String(loaded) + "|" + String(blocked) + "|" + String(rows) + "|" + String(resolvedTopbarCount);
    if (GetPanelAttribute(docRoot, "topbar_rank_prompt_state_apply_sig", "") !== sig) {
      SetPanelAttribute(docRoot, "topbar_rank_prompt_state_apply_sig", sig);
      RemoveClass(docRoot, "TopbarRankTopBarNeedsManualProfiles");
      RemoveClass(docRoot, "TopbarRankTopBarNeedsEscapePrompt");
      RemoveClass(docRoot, "TopbarRankCleanRanksReady");
      if (stateName === "ready") AddClass(docRoot, "TopbarRankCleanRanksReady");
      else if (stateName === "needs_manual_profiles") AddClass(docRoot, "TopbarRankTopBarNeedsManualProfiles");
      else if (stateName === "needs_escape") AddClass(docRoot, "TopbarRankTopBarNeedsEscapePrompt");
    }
    WriteEscapePromptVisualSignature(docRoot, stateName, loaded, blocked, rows);
    return stateName;
  }

  function CleanupProfileContext(source) {
    try {
      if (typeof DismissAllContextMenus === "function") {
        DismissAllContextMenus();
      } else if ($.DispatchEvent) {
        $.DispatchEvent("DismissAllContextMenus");
      }
    } catch (e0) {}
    try {
      if (typeof DropInputFocus === "function") {
        DropInputFocus();
      } else if ($.DispatchEvent) {
        $.DispatchEvent("DropInputFocus");
      }
    } catch (e1) {}
  }

  function ScheduleCleanupProfileContext(source, delaySeconds) {
    var wait = Number(delaySeconds);
    if (!isFinite(wait) || wait < 0) wait = CONTEXT_CLEANUP_DELAY_SECONDS;
    try {
      if ($.Schedule) {
        $.Schedule(wait, function() {
          CleanupProfileContext((source || "unknown") + "_delayed");
        });
        return true;
      }
    } catch (e0) {}
    CleanupProfileContext(source || "unknown");
    return false;
  }

  function RememberEscapePreloadResult(root, source, loaded, blocked, skipped, failed) {
    if (!IsPanelValid(root)) return;
    SetPanelAttribute(root, "topbar_rank_escape_preload_last_source", source || "");
    SetPanelAttribute(root, "topbar_rank_escape_preload_last_loaded", Number(loaded || 0));
    SetPanelAttribute(root, "topbar_rank_escape_preload_last_blocked", Number(blocked || 0));
    SetPanelAttribute(root, "topbar_rank_escape_preload_last_skipped", Number(skipped || 0));
    SetPanelAttribute(root, "topbar_rank_escape_preload_last_failed", Number(failed || 0));
  }

  function ScheduleCleanupAfterAutoComplete(root, source, preloadLoaded) {
    var blocked = Number(GetPanelAttribute(root, "topbar_rank_escape_preload_last_blocked", "0") || 0);
    var failed = Number(GetPanelAttribute(root, "topbar_rank_escape_preload_last_failed", "0") || 0);
    if (ReadActiveSimOpen(root) || Number(preloadLoaded || 0) < REQUIRED_LOADED || blocked > 0 || failed > 0) {
      ScheduleCleanupProfileContext(source || "escape_auto_complete", CONTEXT_CLEANUP_DELAY_SECONDS);
    }
  }

  function EscapePreloadFromCache(panel, source, roster) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var snapshot = roster || BuildEscapeRoster(root);
    var rows = snapshot.rows || [];
    var topbar = snapshot.topbar || [];
    var rowMatches = snapshot.matches || [];
    var loaded = 0;
    var blocked = 0;
    var skipped = 0;
    var failed = 0;
    var i;
    var row;
    var rowMatch;
    var name;
    var norm;
    var match;
    var cached;
    var topbarAccount;
    var fullRosterReady = EscapeRosterReady(snapshot);
    var playerListOnlyReady = PlayerListOnlyRosterReady(snapshot);
    var transition = ReadHudTransitionInfo(root, snapshot);
    var topbarOnlyReady = TopBarOnlyRosterReady(snapshot) && IsHudActiveForTopBarOnlyAuto(transition);
    var topBarBatchDirty = false;
    var terminalReady = false;
    if (IsTopbarRankRuntimeIdleActive(root, snapshot, source || "escape_preload")) return Number(GetPanelAttribute(root, "topbar_rank_runtime_idle_loaded", REQUIRED_LOADED) || REQUIRED_LOADED);
    if (IsHudTransitionStopReason(transition.reason)) {
      StopTopbarRankAutomationForHudTransition(root, source || "escape_preload", snapshot, transition.reason);
      RememberEscapePreloadResult(root, source || "escape_preload", 0, rows.length, 0, 0);
      return 0;
    }
    if (!AutoProbeRosterReady(snapshot, transition)) {
      UpdateEscapePrompt(root, 0, rows.length || 0, rows.length || 0, topbar.length || 0);
      RememberEscapePreloadResult(root, source || "escape_preload", 0, rows.length || 0, 0, 0);
      return 0;
    }
    BeginTopBarBatch(root);
    try {
      for (i = 0; i < rows.length; i += 1) {
        rowMatch = rowMatches[i] || null;
        row = rowMatch && rowMatch.row ? rowMatch.row : rows[i];
        name = rowMatch ? rowMatch.name : ReadRowName(row);
        norm = rowMatch ? rowMatch.nameNorm : NormalizeName(name);
        if (!norm) {
          skipped += 1;
          continue;
        }
        match = rowMatch && rowMatch.candidate ? { candidate: rowMatch.candidate, count: 1 } : FindUniqueTopBarInCandidates(topbar, norm);
        if (!match.candidate) {
          if (playerListOnlyReady) {
            cached = LookupCacheByNameNorm(norm, root);
            if (cached && ApplyPlayerListRowRankImage(row, cached.account, "escape_player_list_cache")) {
              loaded += 1;
            } else {
              blocked += 1;
            }
            continue;
          }
          skipped += 1;
          continue;
        }
        if (topbarOnlyReady) {
          topbarAccount = ReadTopBarAccount(match.candidate);
          if (topbarAccount && TopBarHasRankForAccount(match.candidate, topbarAccount)) {
            loaded += 1;
            continue;
          }
          cached = LookupCacheByNameNorm(norm, root);
          if (!cached) {
            blocked += 1;
            continue;
          }
          if (ApplyTopBarImage(match.candidate, cached.account, "escape_topbar_only_cache", topbar)) loaded += 1;
          else failed += 1;
          continue;
        }
        topbarAccount = ReadTopBarAccount(match.candidate);
        if (topbarAccount && TopBarHasRankForAccount(match.candidate, topbarAccount)) {
          if (ApplyPlayerListRowRankImage(row, topbarAccount, "escape_topbar_loaded")) {
            loaded += 1;
          } else failed += 1;
          continue;
        }
        cached = LookupCacheByNameNorm(norm, root);
        if (!cached) {
          blocked += 1;
          continue;
        }
        if (TopBarHasRankForAccount(match.candidate, cached.account)) {
          if (ApplyPlayerListRowRankImage(row, cached.account, "escape_cache_topbar_loaded")) {
            loaded += 1;
          } else failed += 1;
        } else if (ApplyTopBarImage(match.candidate, cached.account, "escape_cache", topbar)) {
          if (ApplyPlayerListRowRankImage(row, cached.account, "escape_cache")) loaded += 1;
          else failed += 1;
        } else failed += 1;
      }
    } finally {
      topBarBatchDirty = EndTopBarBatch(root, source || "escape_preload", loaded, blocked, rows.length, topbar.length, true);
    }
    RememberEscapePreloadResult(root, source || "escape_preload", loaded, blocked, skipped, failed);
    if (loaded >= REQUIRED_LOADED && (fullRosterReady || topbarOnlyReady)) {
      if (fullRosterReady) terminalReady = EnterTopbarRankRuntimeIdle(root, snapshot, loaded, source || "escape_preload");
      else if (topbarOnlyReady) terminalReady = UpdateTeamAverageRanks(root, source || "escape_preload_topbar_only_ready", topbar);
      ScheduleCleanupProfileContext("escape_preload_ready", CONTEXT_CLEANUP_DELAY_SECONDS);
    }
    if (topBarBatchDirty && !terminalReady && !HasTopbarRankRuntimeIdle(root)) ScheduleTopBarReadyCheck(root, source || "escape_preload");
    return loaded;
  }

  function ClearEscapeAutoState(root, token) {
    if (token && GetPanelAttribute(root, "topbar_rank_escape_auto_token", "") !== token) return;
    SetPanelAttribute(root, "topbar_rank_escape_auto_token", "");
    SetPanelAttribute(root, "topbar_rank_escape_auto_step", "");
    SetPanelAttribute(root, "topbar_rank_escape_auto_max_steps", "");
    SetPanelAttribute(root, "topbar_rank_escape_auto_active_until", "");
    SetPanelAttribute(root, "topbar_rank_escape_auto_continue_pending", "");
    SetPanelAttribute(root, "topbar_rank_escape_auto_completed_at", NowMs());
  }

  function EscapeAutoStep(root, token, step, maxSteps, rosterSnapshot) {
    var currentToken = GetPanelAttribute(root, "topbar_rank_escape_auto_token", "");
    var didWork = false;
    var hasActiveOpen = false;
    var roster;
    var preloadLoaded;
    var transition;
    if (!token || currentToken !== token) return false;
    roster = rosterSnapshot || BuildEscapeRoster(root);
    if (!rosterSnapshot && ShouldUsePlayerListOnlyAuto(root, roster, "escape_auto_step")) roster = BuildPlayerListOnlyRoster(root, roster.rows);
    if (IsTopbarRankRuntimeIdleActive(root, roster, "escape_auto_step")) {
      ClearEscapeAutoState(root, token);
      return false;
    }
    transition = ReadHudTransitionInfo(root, roster);
    if (IsHudTransitionStopReason(transition.reason)) {
      StopTopbarRankAutomationForHudTransition(root, "escape_auto_step", roster, transition.reason);
      return false;
    }
    MarkTopbarRankMatchActive(root);
    if (!AutoProbeRosterReady(roster, transition)) {
      ClearEscapeAutoState(root, token);
      return false;
    }
    if (step >= maxSteps) {
      ClearEscapeAutoState(root, token);
      preloadLoaded = EscapePreloadFromCache(root, "escape_auto_complete_max_steps", roster);
      ScheduleCleanupAfterAutoComplete(root, "escape_auto_complete_max_steps", preloadLoaded);
      return false;
    }
    SetPanelAttribute(root, "topbar_rank_escape_auto_step", step + 1);
    SetPanelAttribute(root, "topbar_rank_escape_auto_active_until", NowMs() + ESCAPE_AUTO_ACTIVE_TTL_MS);
    didWork = SimulateNextVisiblePlayerListRowOpen(root, roster);
    if (!didWork) {
      ClearEscapeAutoState(root, token);
      preloadLoaded = EscapePreloadFromCache(root, "escape_auto_complete_no_more_work", roster);
      ScheduleCleanupAfterAutoComplete(root, "escape_auto_complete_no_more_work", preloadLoaded);
      return false;
    }
    hasActiveOpen = !!ReadActiveSimOpen(root);
    if (!hasActiveOpen) return EscapeAutoStep(root, token, step + 1, maxSteps, roster);
    return true;
  }

  function SchedulePacedEscapeAutoStep(root, token, step, maxSteps) {
    var docRoot = GetDocumentRoot(root);
    var pendingKey;
    if (!IsPanelValid(docRoot) || !token) return false;
    pendingKey = token + "|" + String(step) + "|" + String(maxSteps);
    try {
      if (!$.Schedule) return false;
    } catch (e0) {
      return false;
    }
    if (GetPanelAttribute(docRoot, "topbar_rank_escape_auto_continue_pending", "") === pendingKey) return true;
    SetPanelAttribute(docRoot, "topbar_rank_escape_auto_continue_pending", pendingKey);
    try {
      $.Schedule(ESCAPE_AUTO_CONTINUE_PACE_DELAY_SECONDS, function() {
        var retryRoot = GetDocumentRoot(docRoot);
        if (!IsPanelValid(retryRoot)) return;
        if (GetPanelAttribute(retryRoot, "topbar_rank_escape_auto_continue_pending", "") !== pendingKey) return;
        SetPanelAttribute(retryRoot, "topbar_rank_escape_auto_continue_pending", "");
        if (GetPanelAttribute(retryRoot, "topbar_rank_escape_auto_token", "") !== token) return;
        if (IsTopbarRankRuntimeIdleCurrent(retryRoot, "escape_auto_continue_paced")) return;
        EscapeAutoStep(retryRoot, token, step, maxSteps);
      });
      return true;
    } catch (e1) {
      SetPanelAttribute(docRoot, "topbar_rank_escape_auto_continue_pending", "");
    }
    return false;
  }


  function ContinueEscapeAutoAfterAttempt(root, reason) {
    var token = GetPanelAttribute(root, "topbar_rank_escape_auto_token", "");
    var step;
    var maxSteps;
    var roster;
    var transition;
    if (!token) return false;
    if (IsTopbarRankRuntimeIdleCurrent(root, "escape_auto_continue")) return false;
    roster = BuildEscapeRoster(root, true);
    transition = ReadHudTransitionInfo(root, roster);
    if (IsHudTransitionStopReason(transition.reason)) {
      StopTopbarRankAutomationForHudTransition(root, "escape_auto_continue", roster, transition.reason);
      return false;
    }
    step = Number(GetPanelAttribute(root, "topbar_rank_escape_auto_step", "0") || 0);
    maxSteps = Number(GetPanelAttribute(root, "topbar_rank_escape_auto_max_steps", "0") || 0);
    if (!isFinite(step) || step < 0) step = 0;
    if (!isFinite(maxSteps) || maxSteps <= 0) {
      ClearEscapeAutoState(root, token);
      EscapePreloadFromCache(root, "escape_auto_complete_missing_max_steps");
      return false;
    }
    if (SchedulePacedEscapeAutoStep(root, token, step, maxSteps)) return true;
    return EscapeAutoStep(root, token, step, maxSteps);
  }

  function EscapeAutoPopulate(panel, source, rosterSnapshot, transitionSnapshot) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var roster;
    var loaded = 0;
    var now = NowMs();
    var activeToken;
    var activeUntil;
    var completedAt;
    var completedSig;
    var currentSig;
    var waitReason;
    var token;
    var maxSteps;
    var transition;
    var playerListOnlyFallback = false;
    roster = rosterSnapshot || BuildEscapeRoster(root, true);
    playerListOnlyFallback = !!(roster && roster.playerListOnlyFallback);
    if (IsTopbarRankRuntimeIdleActive(root, roster, source || "escape_auto")) return Number(GetPanelAttribute(root, "topbar_rank_runtime_idle_loaded", REQUIRED_LOADED) || REQUIRED_LOADED);
    transition = transitionSnapshot || ReadHudTransitionInfo(root, roster);
    if (transition.reason) {
      if (IsHudTransitionStopReason(transition.reason)) StopTopbarRankAutomationForHudTransition(root, source || "escape_auto", roster, transition.reason);
      else ScheduleTopBarWaitRetry(root, source || "escape_auto", roster, transition.reason);
      return 0;
    }
    MarkTopbarRankMatchActive(root);
    if (ShouldUsePlayerListOnlyAuto(root, roster, source || "escape_auto")) {
      roster = BuildPlayerListOnlyRoster(root, roster.rows);
      roster.playerListOnlyFallback = true;
      playerListOnlyFallback = true;
    }
    if (!AutoProbeRosterReady(roster, transition)) {
      waitReason = (!roster.rows || roster.rows.length !== 12) ? "rows_not_ready" : "roster_not_confirmed";
      ScheduleEscapeAutoReadyRetry(root, source || "escape_auto", roster);
      ScheduleTopBarWaitRetry(root, source || "escape_auto", roster, waitReason);
      return 0;
    }
    if (PlayerListOnlyRosterReady(roster)) ScheduleTopBarWaitRetry(root, source || "escape_auto", roster, "topbar_partial_player_list_ready");
    loaded = EscapePreloadFromCache(root, source || "escape_auto", roster);
    if (loaded >= REQUIRED_LOADED) {
      if (EscapeRosterReady(roster)) {
        EnterTopbarRankRuntimeIdle(root, roster, loaded, source || "escape_auto");
        return loaded;
      }
      if (TopBarOnlyRosterReady(roster)) {
        UpdateTeamAverageRanks(root, source || "escape_auto_topbar_only_ready", roster.topbar);
        return loaded;
      }
      if (!PlayerListOnlyRosterReady(roster)) {
        ScheduleTopBarWaitRetry(root, source || "escape_auto", roster, "topbar_partial_player_list_ready");
        return loaded;
      }
    }
    if (ReadActiveSimOpen(root)) {
      return loaded;
    }
    activeToken = GetPanelAttribute(root, "topbar_rank_escape_auto_token", "");
    activeUntil = Number(GetPanelAttribute(root, "topbar_rank_escape_auto_active_until", "0") || 0);
    if (activeToken && isFinite(activeUntil) && activeUntil > now) {
      return loaded;
    }
    completedAt = Number(GetPanelAttribute(root, "topbar_rank_escape_auto_completed_at", "0") || 0);
    completedSig = GetPanelAttribute(root, "topbar_rank_escape_auto_completed_sig", "");
    currentSig = BuildTopbarRankIdleSignature(roster);
    if (isFinite(completedAt) && completedAt > 0 && now - completedAt >= 0 && now - completedAt < ESCAPE_AUTO_RECENT_COMPLETE_MS && (!completedSig || completedSig === currentSig)) {
      return loaded;
    }
    if (!SourceAllowsProfileAutoOpen(source || "escape_auto", playerListOnlyFallback) && NormalizeTopBarWaitSource(source || "escape_auto") === "topbar_player_onload_coalesced" && EscapeRosterReady(roster)) {
      playerListOnlyFallback = true;
    }
    if (!SourceAllowsProfileAutoOpen(source || "escape_auto", playerListOnlyFallback)) {
      return loaded;
    }
    if (!HasStableEscapeRoster(root, roster, source || "escape_auto")) {
      return loaded;
    }
    token = String(now) + "_escape_auto";
    maxSteps = roster.rows.length * SIM_PROBE_MAX_ATTEMPTS_PER_ROW;
    SetPanelAttribute(root, "topbar_rank_escape_auto_token", token);
    SetPanelAttribute(root, "topbar_rank_escape_auto_step", "0");
    SetPanelAttribute(root, "topbar_rank_escape_auto_max_steps", maxSteps);
    SetPanelAttribute(root, "topbar_rank_escape_auto_active_until", now + ESCAPE_AUTO_ACTIVE_TTL_MS);
    StartTopBarLoadingStatusForRoster(root, roster, token);
    EscapeAutoStep(root, token, 0, maxSteps, roster);
    return loaded;
  }

  function EscapeAutoPopulateFromRowReady(panel, source) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var hasSchedule = false;
    if (!IsPanelValid(root)) return 0;
    try {
      hasSchedule = !!$.Schedule;
    } catch (e0) {
      hasSchedule = false;
    }
    if (!hasSchedule) {
      if (IsTopbarRankRuntimeIdleCurrent(root, source || "escape_menu_players_list_row_ready", true)) return 0;
      return EscapeAutoPopulate(root, source || "escape_menu_players_list_row_ready");
    }
    if (GetPanelAttribute(root, "topbar_rank_escape_row_ready_pending", "") === "yes") return 0;
    if (IsTopbarRankRuntimeIdleCurrent(root, source || "escape_menu_players_list_row_ready", true)) return 0;
    SetPanelAttribute(root, "topbar_rank_escape_row_ready_pending", "yes");
    try {
      $.Schedule(ESCAPE_ROW_READY_COALESCE_DELAY_SECONDS, function() {
        var docRoot = GetDocumentRoot(root);
        if (!IsPanelValid(docRoot)) return;
        SetPanelAttribute(docRoot, "topbar_rank_escape_row_ready_pending", "");
        if (IsTopbarRankRuntimeIdleCurrent(docRoot, (source || "escape_menu_players_list_row_ready") + "_coalesced", true)) return;
        EscapeAutoPopulate(docRoot, (source || "escape_menu_players_list_row_ready") + "_coalesced");
      });
      return 0;
    } catch (e1) {
      SetPanelAttribute(root, "topbar_rank_escape_row_ready_pending", "");
      return EscapeAutoPopulate(root, source || "escape_menu_players_list_row_ready");
    }
  }

  function ClearEscapeOpenWatch(root, token) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    if (token && GetPanelAttribute(docRoot, "topbar_rank_escape_open_watch_token", "") !== token) return false;
    SetPanelAttribute(docRoot, "topbar_rank_escape_open_watch_token", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_open_watch_count", "");
    SetPanelAttribute(docRoot, "topbar_rank_escape_intent_pending", "");
    return true;
  }

  function ScheduleEscapeOpenWatchTick(root, source, token, count) {
    var delay = count < ESCAPE_OPEN_WATCH_FAST_RETRY_MAX ? ESCAPE_OPEN_WATCH_FAST_DELAY_SECONDS : ESCAPE_OPEN_WATCH_SLOW_DELAY_SECONDS;
    try {
      $.Schedule(delay, function() {
        var docRoot = GetDocumentRoot(root);
        var loaded;
        var activeUntil;
        if (!IsPanelValid(docRoot)) return;
        if (GetPanelAttribute(docRoot, "topbar_rank_escape_open_watch_token", "") !== token) return;
        SetPanelAttribute(docRoot, "topbar_rank_escape_intent_pending", "");
        if (IsTopbarRankRuntimeIdleCurrent(docRoot, (source || "escape_menu_open") + "_open_watch", true)) {
          ClearEscapeOpenWatch(docRoot, token);
          return;
        }
        loaded = EscapeAutoPopulate(docRoot, (source || "escape_menu_open") + "_open_watch");
        if (Number(loaded || 0) >= REQUIRED_LOADED || IsTopbarRankRuntimeIdleCurrent(docRoot, (source || "escape_menu_open") + "_open_watch_loaded", true)) {
          ClearEscapeOpenWatch(docRoot, token);
          return;
        }
        activeUntil = Number(GetPanelAttribute(docRoot, "topbar_rank_escape_auto_active_until", "0") || 0);
        if (GetPanelAttribute(docRoot, "topbar_rank_escape_auto_token", "") && isFinite(activeUntil) && activeUntil > NowMs()) {
          ClearEscapeOpenWatch(docRoot, token);
          return;
        }
        if (count + 1 >= ESCAPE_OPEN_WATCH_RETRY_MAX) {
          ClearEscapeOpenWatch(docRoot, token);
          return;
        }
        SetPanelAttribute(docRoot, "topbar_rank_escape_open_watch_count", count + 1);
        ScheduleEscapeOpenWatchTick(docRoot, source, token, count + 1);
      });
      return true;
    } catch (e0) {}
    ClearEscapeOpenWatch(root, token);
    return false;
  }

  function StartTopbarRankAutoloadIntent(panel, source) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var sourceName = source || "escape_menu_open_main_menu";
    var hasSchedule = false;
    var token;
    if (!IsPanelValid(root)) return 0;
    try {
      hasSchedule = !!$.Schedule;
    } catch (e0) {
      hasSchedule = false;
    }
    if (!hasSchedule) {
      if (IsTopbarRankRuntimeIdleCurrent(root, sourceName, true)) return 0;
      return EscapeAutoPopulate(root, sourceName);
    }
    if (GetPanelAttribute(root, "topbar_rank_escape_intent_pending", "") === "yes" || GetPanelAttribute(root, "topbar_rank_escape_open_watch_token", "")) return 0;
    if (IsTopbarRankRuntimeIdleCurrent(root, sourceName, true)) return 0;
    token = String(NowMs()) + "_escape_open_watch";
    SetPanelAttribute(root, "topbar_rank_escape_intent_pending", "yes");
    SetPanelAttribute(root, "topbar_rank_escape_open_watch_token", token);
    SetPanelAttribute(root, "topbar_rank_escape_open_watch_count", "0");
    if (!ScheduleEscapeOpenWatchTick(root, sourceName, token, 0)) {
      return EscapeAutoPopulate(root, sourceName);
    }
    return 0;
  }

  function TryOpenExternalUrlWithSteamOverlay(url, methodName) {
    if (!url || !methodName) return false;
    try {
      if (typeof SteamOverlayAPI !== "undefined" && SteamOverlayAPI && typeof SteamOverlayAPI[methodName] === "function") {
        SteamOverlayAPI[methodName](url);
        return true;
      }
    } catch (e0) {}
    return false;
  }

  function TryOpenExternalUrlWithDispatch(url, eventName) {
    if (!url || !eventName) return false;
    try {
      if ($.DispatchEvent) {
        $.DispatchEvent(eventName, url);
        return true;
      }
    } catch (e0) {}
    return false;
  }

  function OpenExternalUrl(url, source) {
    var targetUrl = String(url || "");
    if (!targetUrl) {
      return false;
    }
    if (TryOpenExternalUrlWithSteamOverlay(targetUrl, "OpenURL")) {
      return true;
    }
    if (TryOpenExternalUrlWithSteamOverlay(targetUrl, "OpenExternalBrowserURL")) {
      return true;
    }
    if (TryOpenExternalUrlWithDispatch(targetUrl, "ExternalBrowserGoToURL")) {
      return true;
    }
    return false;
  }

  function OpenStatlocker(panel) {
    var account = TriggerProfileCard(IsPanelValid(panel) ? panel : GetContextPanel(), "statlocker_button");
    var url;
    if (!account) return;
    url = BuildStatlockerProfileUrl(account);
    if (!url) {
      return;
    }
    OpenExternalUrl(url, "statlocker");
  }

  function OpenDeadlock(panel) {
    var account = TriggerProfileCard(IsPanelValid(panel) ? panel : GetContextPanel(), "deadlock_button");
    var accountNumber = Number(account);
    if (!account || !isFinite(accountNumber)) return;
    try {
      if (typeof CitadelShowProfilePageForAccount === "function") CitadelShowProfilePageForAccount(accountNumber);
    } catch (e0) {}
  }

  function CreateBridge() {
    return {
      version: BRIDGE_VERSION
    };
  }

  try {
    if ($[BRIDGE_KEY] && $[BRIDGE_KEY].version === BRIDGE_VERSION && $[BRIDGE_KEY].state) state = $[BRIDGE_KEY].state;
  } catch (e0) {}

  var startupPanel = $.GetContextPanel ? $.GetContextPanel() : null;
  var startupRole = DetectTopbarRankContextRole(startupPanel, "script_loaded") || "";

  function InstallTopbarRankWrapper(role, wrapperName, handler) {
    if (!role || !RoleAllowsWrapper(role, wrapperName)) {
      try { $[wrapperName] = undefined; } catch (e0) {}
      return false;
    }
    try {
      $[wrapperName] = function() {
        return handler.apply(this, arguments);
      };
    } catch (e1) {}
    return true;
  }

  try {
    if (!$[BRIDGE_KEY] || $[BRIDGE_KEY].version !== BRIDGE_VERSION) $[BRIDGE_KEY] = CreateBridge();
    $[BRIDGE_KEY].state = state;
  } catch (e1) {}

  InstallTopbarRankWrapper(startupRole, "TopbarRankTriggerProfileCard", function(source) {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("profile_trigger", panel, source || "profile_card")) return "";
    return TriggerProfileCard(panel, source || "profile_card");
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankOpenStatlocker", function() {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("statlocker_open", panel, "statlocker_button")) return "";
    return OpenStatlocker(panel);
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankContextMenuTriggerProfileCard", function(source) {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("context_menu_profile_trigger", panel, source || "context_menu_player_onload")) return "";
    return TriggerProfileCard(panel, source || "context_menu_player_onload");
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankContextMenuOpenStatlocker", function() {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("context_menu_statlocker_open", panel, "context_menu_statlocker_button")) return "";
    return OpenStatlocker(panel);
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankContextMenuOpenDeadlock", function() {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("deadlock_open", panel, "context_menu_deadlock_button")) return "";
    return OpenDeadlock(panel);
  });
  try { $["TopbarRankOpenDeadlock"] = undefined; } catch (e2) {}
  InstallTopbarRankWrapper(startupRole, "TopbarRankRegisterTopBarPlayer", function(source) {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("topbar_player_register", panel, source || "topbar_player_onload")) return null;
    return RegisterTopBarPlayer(panel, source || "topbar_player_onload");
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankMarkTopBarHover", function(source) {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("topbar_player_hover", panel, source || "topbar_hover")) return false;
    if (IsRuntimeIdleLatched(panel)) return false;
    if (IsTopbarRankRuntimeIdleCurrent(panel, source || "topbar_hover")) return false;
    return MarkTopBarHover(panel, source || "topbar_hover");
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankTopBarRootLoaded", function(source) {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    var docRoot = GetDocumentRoot(panel);
    var candidates;
    var rankState;
    if (!GuardTopbarRankAction("topbar_root_loaded", panel, source || "topbar_root_onload")) return false;
    candidates = FindTopBarCandidates(docRoot);
    rankState = CountTopBarRankState(docRoot, candidates);
    AddClass(docRoot, "TopbarRankTopBarNeedsEscapePrompt");
    WriteEscapePromptVisualSignature(docRoot, "needs_escape", rankState.loaded, 0, 0);
    UpdateTeamAverageRanks(docRoot, source || "topbar_root_onload", candidates);
    ScheduleTopBarReadyCheck(docRoot, source || "topbar_root_onload");
    return true;
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankMarkPlayerListHover", function(source) {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("player_list_hover", panel, source || "players_list_hover")) return false;
    if (IsRuntimeIdleLatched(panel)) return false;
    if (IsTopbarRankRuntimeIdleCurrent(panel, source || "players_list_hover")) return false;
    return MarkPlayerListHover(panel, source || "players_list_hover");
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankClearPlayerListHover", function(source) {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("player_list_clear", panel, source || "players_list_out")) return false;
    if (IsRuntimeIdleLatched(panel)) {
      state.hoverToken = null;
      return false;
    }
    if (IsTopbarRankRuntimeIdleCurrent(panel, source || "players_list_out")) {
      state.hoverToken = null;
      return false;
    }
    return ClearPlayerListHover(source || "players_list_out");
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankEscapePreloadFromPlayerList", function(source) {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (SourceHasPrefix(source || "", "escape_menu_players_list_row_ready")) {
      if (!GuardTopbarRankAction("player_list_row_ready", panel, source || "escape_menu_players_list_row_ready")) return 0;
      if (IsRuntimeIdleLatched(panel)) return 0;
      return EscapeAutoPopulateFromRowReady(panel, source || "escape_menu_players_list_row_ready");
    }
    if (!GuardTopbarRankAction("escape_preload", panel, source || "escape")) return 0;
    if (IsRuntimeIdleLatched(panel)) return GetRuntimeIdleLoaded(panel);
    if (IsTopbarRankRuntimeIdleCurrent(panel, source || "escape", true)) return GetRuntimeIdleLoaded(panel);
    return StartTopbarRankAutoloadIntent(panel, source || "escape");
  });
  InstallTopbarRankWrapper(startupRole, "TopbarRankRegisterPlayerListRowReady", function(source) {
    var panel = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!GuardTopbarRankAction("player_list_row_ready", panel, source || "escape_menu_players_list_row_ready")) return 0;
    if (IsRuntimeIdleLatched(panel)) return 0;
    return EscapeAutoPopulateFromRowReady(panel, source || "escape_menu_players_list_row_ready");
  });

})();
