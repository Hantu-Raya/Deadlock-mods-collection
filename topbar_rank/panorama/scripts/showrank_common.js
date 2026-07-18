(() => {
  "use strict";

  var BRIDGE_KEY = "__ShowRankWebMediaBridgeClean";
  var BRIDGE_VERSION = 236;
  var CACHE_VERSION = String(BRIDGE_VERSION);
  var RANK_API_URL_PREFIX = "https://api.deadlock-api.com/v1/players/";
  var RANK_IMAGE_URL_SUFFIX = "/rank-predict/image?format=webp";
  var STATLOCKER_MATCHES_URL_PREFIX = "https://statlocker.gg/profile/";
  var STATLOCKER_MATCHES_URL_SUFFIX = "/matches";
  var TEAM_AVERAGE_API_URL_PREFIX =
    "https://api.deadlock-api.com/v1/players/rank-predict/image?account_ids=";
  var TEAM_AVERAGE_API_URL_SUFFIX = "&format=webp";
  var STEAM64_BASE = "76561197960265728";
  var STEAMID3_PATTERN = /^\[U:1:(\d+)\]$/i;
  var MIN_ACCOUNT_ID = 100000;
  var MAX_ACCOUNT_ID = 4294967295;
  var TOPBAR_PLAYER_CLASS = "ShowRankCleanTopBarPlayer";
  var TOPBAR_IMAGE_CLASS = "ShowRankTopBarRankImage";
  var TOPBAR_VISIBLE_CLASS = "ShowRankTopBarRankVisible";
  var TOPBAR_STATUS_IMAGE_CLASS = "ShowRankTopBarStatusImage";
  var TOPBAR_STATUS_VISIBLE_CLASS = "ShowRankTopBarStatusVisible";
  var TOPBAR_STATUS_LOADING_CLASS = "ShowRankTopBarStatusLoading";
  var TEAM_AVERAGE_VISIBLE_CLASS = "ShowRankTeamAverageRankVisible";
  var TEAM_AVERAGE_REQUIRED_ACCOUNTS = 6;
  var TOPBAR_MISSING_RANK_IMAGE_URL =
    "s2r://panorama/images/ranked/badges/rank0/badge_sm_psd.vtex";
  var TOPBAR_LOADING_SPINNER_IMAGE_URL =
    "s2r://panorama/images/control_icons/spinner_png.vtex";
  var TOPBAR_LOADING_TIMEOUT_SECONDS = 20.0;
  var PLAYER_LIST_ROW_CLASS = "ShowRankCleanPlayersListEntry";
  var PLAYER_LIST_RANK_VISIBLE_CLASS = "ShowRankPlayerListRankVisible";
  var REQUIRED_LOADED = 11;
  var ESCAPE_ROSTER_SIZE = 12;
  var ESCAPE_NEAR_REQUIRED_MATCHED = 10;
  var MANUAL_TARGET_TTL_MS = 1500;
  var SIM_ACTIVE_TTL_MS = 7000;
  var SIM_PROBE_MAX_ATTEMPTS_PER_ROW = 2;
  var ESCAPE_AUTO_ACTIVE_TTL_MS = 26000;
  var ESCAPE_AUTO_RECENT_COMPLETE_MS = 2500;
  var ESCAPE_AUTO_TOPBAR_RETRY_THROTTLE_MS = 350;
  var TOPBAR_READY_WAIT_RETRY_MAX = 50;
  var TOPBAR_READY_WAIT_FAST_RETRY_MAX = 20;
  var TOPBAR_READY_WAIT_SLOW_RETRY_DELAY_SECONDS = 1.5;
  var CONTEXT_CLEANUP_DELAY_SECONDS = 0.5;
  var ESCAPE_ROW_READY_COALESCE_DELAY_SECONDS = 0.05;
  var TOPBAR_READY_COALESCE_DELAY_SECONDS = 0.2;
  var ESCAPE_AUTO_READY_RETRY_DELAY_SECONDS = 0.5;
  var ESCAPE_OPEN_WATCH_FAST_RETRY_MAX = 8;
  var ESCAPE_OPEN_WATCH_RETRY_MAX = 40;
  var ESCAPE_OPEN_WATCH_FAST_DELAY_SECONDS = 0.15;
  var ESCAPE_OPEN_WATCH_SLOW_DELAY_SECONDS = 1.0;
  var ESCAPE_VISIBLE_WATCH_RETRY_MAX = 300;
  var ESCAPE_VISIBLE_WATCH_DELAY_SECONDS = 1.0;
  var PROFILE_TOOLTIP_ACTIVE_WATCH_MS = 45000;
  var PROFILE_TOOLTIP_FAST_WATCH_MS = 2500;
  var PROFILE_TOOLTIP_FAST_WATCH_INTERVAL = 0.2;
  var PROFILE_TOOLTIP_IDLE_WATCH_INTERVAL = 1.0;
  var DEFAULT_VERIFIED_SIM_METHOD = "DispatchEvent.ActivatedWithMouse";
  var DEFAULT_VERIFIED_SIM_TARGET = "MainContents";
  var TOPBAR_VERIFIED_SIM_TARGET = "PlayerDetailsContainer";
  var CONNECTED_HIDEOUT_CLASS_NAMES = ["connectedToHideout"];
  var LOBBY_OR_PREGAME_CLASS_NAMES = [
    "GameStatePreGame",
    "GameStatePreGameWait",
  ].concat(CONNECTED_HIDEOUT_CLASS_NAMES);
  var ACTIVE_SPECTATOR_CLASS_NAMES = [
    "spec_mode",
    "replay_playback",
    "deathReplayActive",
    "TeamSpectator",
  ];
  var SCOREBOARD_OPEN_CLASS = "gScoreboardOpen";
  var ESCAPE_MENU_OPEN_CLASS = "ShowEscapeMenu";
  var ESCAPE_MENU_PLAYERS_CLASS = "ShowPlayers";
  var MINIMAP_SIGNAL_PANEL_IDS = [
    "minimap_persp",
    "minimap_container",
    "HudMinimapContainer",
    "hud_minimap",
  ];
  var MINIMAP_HIDDEN_CLASS_NAMES = ["modifier_state_no_minimap"];
  var PROFILE_WATCH_INTERVALS = [0.05, 0.15, 0.3, 0.6, 1.0, 1.5, 2.0];
  var VERIFIED_SIM_NO_EFFECT_DELAY_SECONDS = 6.25;
  var TOPBAR_VERIFIED_SIM_NO_EFFECT_DELAY_SECONDS = 1.25;
  var SHOWRANK_CONTEXT_ROLES = {
    PROFILE_CARD: "profile_card",
    CONTEXT_MENU: "context_menu",
    TOPBAR_ROOT: "topbar_root",
    TOPBAR_PLAYER: "topbar_player",
    HUD_ESCAPE_MENU: "hud_escape_menu",
    PLAYERS_LIST_ENTRY: "players_list_entry",
  };
  var SHOWRANK_ACTION_ROLES = [
    ["profile_trigger", [SHOWRANK_CONTEXT_ROLES.PROFILE_CARD]],
    ["statlocker_open", [SHOWRANK_CONTEXT_ROLES.PROFILE_CARD]],
    [
      "context_menu_statlocker_open",
      [SHOWRANK_CONTEXT_ROLES.CONTEXT_MENU],
    ],
    ["deadlock_open", [SHOWRANK_CONTEXT_ROLES.CONTEXT_MENU]],
    ["topbar_player_hover", [SHOWRANK_CONTEXT_ROLES.TOPBAR_PLAYER]],
    ["player_list_hover", [SHOWRANK_CONTEXT_ROLES.PLAYERS_LIST_ENTRY]],
    ["player_list_clear", [SHOWRANK_CONTEXT_ROLES.PLAYERS_LIST_ENTRY]],
    ["escape_preload", [SHOWRANK_CONTEXT_ROLES.HUD_ESCAPE_MENU]],
    ["player_list_row_ready", [SHOWRANK_CONTEXT_ROLES.PLAYERS_LIST_ENTRY]],
  ];
  var SHOWRANK_WRAPPER_ACTIONS = [
    ["ShowRankTriggerProfileCard", "profile_trigger"],
    ["ShowRankOpenStatlocker", "statlocker_open"],
    [
      "ShowRankContextMenuOpenStatlocker",
      "context_menu_statlocker_open",
    ],
    ["ShowRankContextMenuOpenDeadlock", "deadlock_open"],
    ["ShowRankMarkTopBarHover", "topbar_player_hover"],
    ["ShowRankMarkPlayerListHover", "player_list_hover"],
    ["ShowRankClearPlayerListHover", "player_list_clear"],
    ["ShowRankEscapePreloadFromPlayerList", "escape_preload"],
    ["ShowRankRegisterPlayerListRowReady", "player_list_row_ready"],
  ];
  var HUD_ESCAPE_SOURCES = ["escape_menu_onload", "escape_menu_open_main_menu"];
  var HUD_ESCAPE_PREFIXES = [
    "escape_menu_players_tab_",
    "escape_menu_players_list_onload",
  ];
  var PLAYER_LIST_PREFIXES = [
    "escape_menu_players_list_row_ready",
    "players_list_",
  ];
  var PROFILE_SOURCE_PREFIXES = ["profile_card_", "account_id_"];
  var SHOWRANK_PANEL_ROLE_RULES = [
    [
      SHOWRANK_CONTEXT_ROLES.PLAYERS_LIST_ENTRY,
      "CitadelPlayersListEntry",
      "",
      PLAYER_LIST_ROW_CLASS,
    ],
    [
      SHOWRANK_CONTEXT_ROLES.TOPBAR_PLAYER,
      "CitadelHudTopBarPlayer",
      "",
      TOPBAR_PLAYER_CLASS,
    ],
    [SHOWRANK_CONTEXT_ROLES.TOPBAR_ROOT, "CitadelHudTopBar", "", ""],
    [
      SHOWRANK_CONTEXT_ROLES.CONTEXT_MENU,
      "CitadelContextMenuPlayer",
      "",
      "ShowRankPlayerContextMenuRoot",
    ],
    [
      SHOWRANK_CONTEXT_ROLES.HUD_ESCAPE_MENU,
      "CitadelHudEscapeMenu",
      "PlayersList",
      "",
    ],
    [SHOWRANK_CONTEXT_ROLES.HUD_ESCAPE_MENU, "", "EscapeMenu", ""],
    [
      SHOWRANK_CONTEXT_ROLES.PROFILE_CARD,
      "CitadelProfileCard",
      "ProfileCard",
      "ShowRankProfileCardRoot",
    ],
  ];
  var ESCAPE_FAST_STABLE_RETRY_PREFIXES = [
    "escape_menu_",
    "players_list_",
    "escape_auto",
  ];
  var PROFILE_AUTO_OPEN_PREFIXES = [
    "escape_menu_",
    "players_list_",
    "manual_token_",
    "escape_auto",
  ];
  var PROFILE_HOVER_REFRESH_SOURCES = [
    "profile_card_mouseover",
    "profile_card_tooltip_mouseover",
  ];
  var PROFILE_TOOLTIP_ONLOAD_SOURCES = [
    "profile_card_onload",
    "account_id_onload",
  ];
  var PROFILE_REPEATABLE_ONLOAD_SOURCES = [
    "profile_card_onload",
    "context_menu_profile_card_onload",
    "account_id_onload",
  ];
  var state = {
    hoverToken: null,
    profileWatchSeq: 0,
    activeSimOpen: null,
    completedSimToken: "",
    topBarBatchDepth: 0,
    topBarBatchRoot: null,
    topBarBatchDirty: false,
    topBarCandidateCacheRoot: null,
    topBarCandidateCache: null,
    topBarCandidateCacheDirty: true,
    topBarCandidateStructuralGeneration: 0,
    topBarCandidateRankRevision: 0,
    topBarCandidateSnapshotRankRevision: -1,
    topBarCandidateSnapshotRoot: null,
    topBarCandidateSnapshot: null,
    sharedStoreTargets: null,
    sharedStoreTargetsVersion: "",
  };

  // Panel and Source Primitives
  function NowMs() {
    try {
      if (Date && Date.now) return Date.now();
    } catch (e0) {}
    return 0;
  }

  function IsPanelValid(panel) {
    if (!panel) return false;
    if (!panel.IsValid) return true;
    try {
      return panel.IsValid();
    } catch (e0) {
      return false;
    }
  }

  function GetContextPanel() {
    try {
      if ($.GetContextPanel) return $.GetContextPanel();
    } catch (e0) {}
    return null;
  }

  var TryOpenExternalUrlWithSteamOverlay = function(url, methodName) { if (!url || !methodName) return false;
  try {
    if (
      typeof SteamOverlayAPI !== "undefined" &&
      SteamOverlayAPI &&
      typeof SteamOverlayAPI[methodName] === "function"
    ) {
      SteamOverlayAPI[methodName](url);
      return true;
    }
  } catch (e0) {}
  return false; };



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
    try {
      return panel.GetParent();
    } catch (e0) {
      return null;
    }
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
    if (
      !IsPanelValid(root) ||
      !className ||
      !root.FindChildrenWithClassTraverse
    )
      return [];
    try {
      result = root.FindChildrenWithClassTraverse(className);
    } catch (e0) {
      result = null;
    }
    return result || [];
  }

  function HasClass(panel, className) {
    if (!IsPanelValid(panel) || !panel.BHasClass) return false;
    try {
      return !!panel.BHasClass(className);
    } catch (e0) {
      return false;
    }
  }

  function AddClass(panel, className) {
    if (!IsPanelValid(panel) || !className || !panel.AddClass) return;
    if (HasClass(panel, className)) return;
    try {
      panel.AddClass(className);
    } catch (e0) {}
  }

  function RemoveClass(panel, className) {
    if (!IsPanelValid(panel) || !className || !panel.RemoveClass) return;
    if (!HasClass(panel, className)) return;
    try {
      panel.RemoveClass(className);
    } catch (e0) {}
  }

  function SourceHasPrefix(source, prefix) {
    return String(source || "").indexOf(prefix) === 0;
  }

  function SourceIsAny(source, values) {
    var text = String(source || "");
    var i;
    for (i = 0; i < values.length; i += 1) if (text === values[i]) return true;
    return false;
  }

  function SourceHasAnyPrefix(source, prefixes) {
    var i;
    for (i = 0; i < prefixes.length; i += 1)
      if (SourceHasPrefix(source, prefixes[i])) return true;
    return false;
  }





  function NormalizeTopBarWaitSource(source) {
    var text = String(source || "topbar_ready");
    text = text.replace(/(?:_wait_retry)+/g, "");
    return text || "topbar_ready";
  }

  // Role Detection and Wrapper Guards
  function DetectShowRankContextRole(panel, source) {
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var guard = 0;
    var type;
    var id;
    var i;
    var rule;
    var docRoot;
    var sourceText;
    while (IsPanelValid(current) && guard < 24) {
      type = GetPanelType(current);
      id = GetPanelId(current);
      for (i = 0; i < SHOWRANK_PANEL_ROLE_RULES.length; i += 1) {
        rule = SHOWRANK_PANEL_ROLE_RULES[i];
        if (
          (rule[1] && type === rule[1]) ||
          (rule[2] && id === rule[2]) ||
          (rule[3] && HasClass(current, rule[3]))
        )
          return rule[0];
      }
      current = GetParent(current);
      guard += 1;
    }
    docRoot = GetDocumentRoot(panel);
    if (IsPanelValid(docRoot)) {
      if (
        FindChild(docRoot, "MenuOptionsContainer") &&
        FindChild(docRoot, "ProfileCard")
      )
        return SHOWRANK_CONTEXT_ROLES.CONTEXT_MENU;
      if (
        FindChild(docRoot, "AccountID") &&
        (FindChild(docRoot, "WebMediaDemoMedia") ||
          FindChild(docRoot, "WebMediaDemoAccountLabel"))
      )
        return SHOWRANK_CONTEXT_ROLES.PROFILE_CARD;
      if (FindChild(docRoot, "PlayersList") || FindChild(docRoot, "EscapeMenu"))
        return SHOWRANK_CONTEXT_ROLES.HUD_ESCAPE_MENU;
    }
    sourceText = String(source || "");
    if (SourceHasPrefix(sourceText, "context_menu_"))
      return SHOWRANK_CONTEXT_ROLES.CONTEXT_MENU;
    if (SourceHasPrefix(sourceText, "topbar_root_"))
      return SHOWRANK_CONTEXT_ROLES.TOPBAR_ROOT;
    if (SourceHasPrefix(sourceText, "topbar_"))
      return SHOWRANK_CONTEXT_ROLES.TOPBAR_PLAYER;
    if (
      SourceIsAny(sourceText, HUD_ESCAPE_SOURCES) ||
      SourceHasAnyPrefix(sourceText, HUD_ESCAPE_PREFIXES)
    )
      return SHOWRANK_CONTEXT_ROLES.HUD_ESCAPE_MENU;
    if (SourceHasAnyPrefix(sourceText, PLAYER_LIST_PREFIXES))
      return SHOWRANK_CONTEXT_ROLES.PLAYERS_LIST_ENTRY;
    if (
      SourceHasAnyPrefix(sourceText, PROFILE_SOURCE_PREFIXES) ||
      sourceText === "statlocker_button"
    )
      return SHOWRANK_CONTEXT_ROLES.PROFILE_CARD;
    return "";
  }

  function RoleAllowsAction(role, action) {
    var i;
    var j;
    var roles;
    for (i = 0; i < SHOWRANK_ACTION_ROLES.length; i += 1)
      if (SHOWRANK_ACTION_ROLES[i][0] === action) {
        roles = SHOWRANK_ACTION_ROLES[i][1];
        for (j = 0; roles && j < roles.length; j += 1)
          if (roles[j] === role) return true;
      }
    return false;
  }


  function GuardShowRankAction(action, panel, source) {
    var role = DetectShowRankContextRole(panel, source);
    if (RoleAllowsAction(role, action)) return role;
    return "";
  }

  function FindChildCached(root, key, id) {
    var child = null;
    if (!IsPanelValid(root) || !key || !id) return null;
    try {
      child = root[key];
    } catch (e0) {
      child = null;
    }
    if (IsPanelValid(child)) return child;
    child = FindChild(root, id);
    try {
      if (IsPanelValid(child)) root[key] = child;
    } catch (e1) {}
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
          if (currentString !== stringValue)
            panel.SetAttributeString(key, stringValue);
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

  function AttrSpecValue(values, spec) {
    var value = values ? values[spec[1]] : "";
    return value === undefined || value === null || value === ""
      ? spec.length > 2
        ? spec[2]
        : ""
      : String(value);
  }

  var AttrSpecNameForKey = function (attrs, key) {
    var i;
    for (i = 0; attrs && i < attrs.length; i += 1)
      if (attrs[i][1] === key) return attrs[i][0];
    return key;
  };


  function WriteAttrSpecs(panel, attrs, values, clearMissing) {
    var i;
    var spec;
    if (!IsPanelValid(panel)) return false;
    for (i = 0; attrs && i < attrs.length; i += 1) {
      spec = attrs[i];
      if (!clearMissing && (!values || values[spec[1]] === undefined))
        continue;
      SetPanelAttribute(panel, spec[0], AttrSpecValue(values, spec));
    }
    return true;
  }

  function ReadAttrSpecs(panel, attrs) {
    var values = {};
    var i;
    var spec;
    if (!IsPanelValid(panel)) return values;
    for (i = 0; attrs && i < attrs.length; i += 1) {
      spec = attrs[i];
      values[spec[1]] = GetPanelAttribute(
        panel,
        spec[0],
        spec.length > 2 ? spec[2] : "",
      );
    }
    return values;
  }


  function GetPanelId(panel) {
    try {
      return IsPanelValid(panel) ? String(panel.id || "") : "";
    } catch (e0) {
      return "";
    }
  }

  function GetPanelType(panel) {
    try {
      return IsPanelValid(panel) ? String(panel.paneltype || "") : "";
    } catch (e0) {
      return "";
    }
  }

  function ReadText(panel) {
    if (!IsPanelValid(panel)) return "";
    try {
      if (panel.text !== undefined && panel.text !== null)
        return NormalizeWhitespace(panel.text);
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
      try {
        childCount = entry.panel.GetChildCount
          ? Number(entry.panel.GetChildCount() || 0)
          : 0;
      } catch (e0) {
        childCount = 0;
      }
      for (
        i = 0;
        i < childCount && queue.length + visited < (maxNodes || 48);
        i += 1
      ) {
        try {
          queue.push({
            panel: entry.panel.GetChild(i),
            depth: entry.depth + 1,
          });
        } catch (e1) {}
      }
    }
    return "";
  }


  var ParseGameClockSeconds = function(text) { var value = NormalizeWhitespace(text);
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
  return negative ? -total : total; };

  var ReadGameTimeInfo = function(root) { var docRoot = GetDocumentRoot(root);
  var topBar =
    FindChildCached(docRoot, "__showRankTopBarPanel", "TopBar") || docRoot;
  var gameTime = FindChildCached(
    topBar,
    "__showRankGameTimePanel",
    "GameTime",
  );
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
  return { text: "", seconds: -1 }; };

  function PanelHasAnyClass(panel, classNames) {
    var i;
    if (!IsPanelValid(panel) || !classNames) return false;
    for (i = 0; i < classNames.length; i += 1) {
      if (HasClass(panel, classNames[i])) return true;
    }
    return false;
  }


  function FindHudSignalPanel(root) {
    var docRoot = GetDocumentRoot(root);
    var hud;
    if (GetPanelId(root) === "Hud") return root;
    if (GetPanelId(docRoot) === "Hud") return docRoot;
    hud = FindChildCached(docRoot, "__showRankHudPanel", "Hud");
    return IsPanelValid(hud) ? hud : null;
  }

  function HudOrRootHasAnyClass(root, classNames) {
    var docRoot = GetDocumentRoot(root);
    var hud = FindHudSignalPanel(docRoot);
    return (
      PanelHasAnyClass(hud, classNames) ||
      PanelHasAnyClass(root, classNames) ||
      PanelHasAnyClass(docRoot, classNames)
    );
  }









  var BuildHudTransitionResult = function(phase,
  reason,
  gameTime,
  scoreboardOpen,
  minimapHidden,
  hideout,
  lobbyOrPregame,
  activeSpectator,
  rows,
  topbar,
  matched,) { return {
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
    matched: matched,
  }; };

  function ReadHudTransitionInfo(root, roster) {
    var docRoot = GetDocumentRoot(root);
    function hasLobbyOrPregameState(scopeRoot) {
      return HudOrRootHasAnyClass(scopeRoot, LOBBY_OR_PREGAME_CLASS_NAMES);
    }
    function isPanelHiddenSignal(panel) {
      if (!IsPanelValid(panel)) return false;
      try {
        if (panel.visible === false) return true;
      } catch (e0) {}
      return PanelHasAnyClass(panel, MINIMAP_HIDDEN_CLASS_NAMES);
    }
    function isScoreboardOpen(scopeRoot) {
      var scopeDoc = GetDocumentRoot(scopeRoot);
      var topBar;
      var hud;
      var minimap;
      if (
        HasClass(scopeRoot, SCOREBOARD_OPEN_CLASS) ||
        HasClass(scopeDoc, SCOREBOARD_OPEN_CLASS)
      )
        return true;
      hud = FindHudSignalPanel(scopeDoc);
      if (HasClass(hud, SCOREBOARD_OPEN_CLASS)) return true;
      topBar = FindChildCached(scopeDoc, "__showRankTopBarPanel", "TopBar");
      if (HasClass(topBar, SCOREBOARD_OPEN_CLASS)) return true;
      minimap = FindChildCached(
        scopeDoc,
        "__showRankScoreboardSignalPanel",
        "minimap_persp",
      );
      if (HasClass(minimap, SCOREBOARD_OPEN_CLASS)) return true;
    }
    function hasHiddenMinimapSignal(scopeRoot) {
      var scopeDoc = GetDocumentRoot(scopeRoot);
      var i;
      var panel;
      if (
        PanelHasAnyClass(scopeRoot, MINIMAP_HIDDEN_CLASS_NAMES) ||
        PanelHasAnyClass(scopeDoc, MINIMAP_HIDDEN_CLASS_NAMES)
      )
        return true;
      for (i = 0; i < MINIMAP_SIGNAL_PANEL_IDS.length; i += 1) {
        panel = FindChildCached(
          scopeDoc,
          "__showRankMinimapSignalPanel" + i,
          MINIMAP_SIGNAL_PANEL_IDS[i],
        );
        if (isPanelHiddenSignal(panel)) return true;
      }
      return false;
    }
    var gameTime = ReadGameTimeInfo(docRoot);
    var hideout = HudOrRootHasAnyClass(docRoot, CONNECTED_HIDEOUT_CLASS_NAMES);
    var lobbyOrPregame = hasLobbyOrPregameState(docRoot);
    var activeSpectator = HudOrRootHasAnyClass(
      docRoot,
      ACTIVE_SPECTATOR_CLASS_NAMES,
    );
    var rows =
      roster && roster.rows
        ? roster.rows.length
        : FindPlayerListRows(docRoot).length;
    var topbar =
      roster && roster.topbar
        ? roster.topbar.length
        : ReadTopBarCandidateSnapshot(docRoot).candidates.length;
    var matched = roster ? Number(roster.matched || 0) : 0;
    var scoreboardOpen;
    var minimapHidden;
    var zeroClockHiddenHud;
    var reason = "";
    var phase = "unknown";
    if (hideout)
      return BuildHudTransitionResult(
        "hideout",
        "hideout_transition",
        gameTime,
        false,
        false,
        hideout,
        lobbyOrPregame,
        activeSpectator,
        rows,
        topbar,
        matched,
      );
    if (lobbyOrPregame)
      return BuildHudTransitionResult(
        "lobby_or_pregame",
        "lobby_or_hideout_transition",
        gameTime,
        false,
        false,
        hideout,
        lobbyOrPregame,
        activeSpectator,
        rows,
        topbar,
        matched,
      );
    scoreboardOpen = isScoreboardOpen(docRoot);
    minimapHidden = hasHiddenMinimapSignal(docRoot);
    zeroClockHiddenHud =
      gameTime.seconds === 0 && minimapHidden && !scoreboardOpen;
    if (zeroClockHiddenHud) {
      phase = "lobby_or_pregame";
      reason = "lobby_or_hideout_transition";
    } else if (gameTime.seconds === 0) {
      phase = "lobby_or_pregame";
    } else if (gameTime.seconds > 0) {
      phase = "game_time_seen";
    }
    return BuildHudTransitionResult(
      phase,
      reason,
      gameTime,
      scoreboardOpen,
      minimapHidden,
      hideout,
      lobbyOrPregame,
      activeSpectator,
      rows,
      topbar,
      matched,
    );
  }

  var EscapeMenuAutoTriggerSignature = function(roster) { return BuildShowRankIdentitySignature(roster) || BuildShowRankIdleSignature(roster); };


  function IsEscapePlayersMenuOpen(root) {
    var docRoot = GetDocumentRoot(root);
    var menu;
    if (!IsPanelValid(docRoot)) return false;
    if (
      GetPanelId(docRoot) === "EscapeMenu" ||
      GetPanelType(docRoot) === "CitadelHudEscapeMenu"
    )
      menu = docRoot;
    else
      menu = FindChildCached(docRoot, "__showRankEscapeMenuPanel", "EscapeMenu");
    return (
      IsPanelValid(menu) &&
      (HasClass(menu, ESCAPE_MENU_OPEN_CLASS) ||
        HasClass(docRoot, ESCAPE_MENU_OPEN_CLASS)) &&
      (HasClass(menu, ESCAPE_MENU_PLAYERS_CLASS) ||
        HasClass(docRoot, ESCAPE_MENU_PLAYERS_CLASS))
    );
  }

  function IsEscapeMenuAutoTriggerAvailable(root, sourceName, roster) {
    var docRoot = GetDocumentRoot(root);
    var sig;
    var usedSig;
    if (!IsEscapePlayersMenuOpen(docRoot)) return false;
    if (sourceName !== "topbar_player_onload_coalesced") return false;
    if (!roster || !roster.topbar || roster.topbar.length <= 0) return false;
    sig = EscapeMenuAutoTriggerSignature(roster);
    if (!sig) return false;
    usedSig = GetPanelAttribute(docRoot, "showrank_escape_menu_auto_trigger_sig", "");
    return usedSig !== sig;
  }


  function SourceShouldWaitForEscapeMenuTrigger(root, sourceName, roster) {
    return (
      sourceName === "topbar_player_onload_coalesced" &&
      !IsEscapeMenuAutoTriggerAvailable(root, sourceName, roster)
    );
  }

  var SourceIsRowReadyAutoSource = function(sourceName) {
  var text = String(sourceName || "");
  return (
    text.indexOf("players_list_row_ready") >= 0 ||
    text.indexOf("row_ready") >= 0
  ); };



  var SourceAllowsTopBarCoalescedAutoOpen = function(root, sourceName, roster) {
  if (!IsEscapeMenuAutoTriggerAvailable(root, sourceName, roster))
    return false;
  return (
    EscapeRosterReady(roster) ||
    !!(
      roster &&
      roster.topbarOnly &&
      roster.topbar &&
      roster.topbar.length === 12 &&
      roster.uniqueTopbarNames === 12 &&
      roster.uniqueMatchedTopbar >= REQUIRED_LOADED
    )
  ); };


  var SourceAllowsRowReadyAutoOpen = function(root, roster) {
  if (!IsEscapePlayersMenuOpen(root)) return false;
  return SourceAllowsTopBarCoalescedAutoOpen(
    root,
    "topbar_player_onload_coalesced",
    roster,
  ); };


  var SourceAllowsProfileAutoOpen = function(root, sourceName, roster) {
  if (SourceIsRowReadyAutoSource(sourceName))
    return SourceAllowsRowReadyAutoOpen(root, roster);
  return (
    sourceName === "escape" ||
    SourceHasAnyPrefix(sourceName, PROFILE_AUTO_OPEN_PREFIXES) ||
    SourceAllowsTopBarCoalescedAutoOpen(root, sourceName, roster)
  ); };



  function NormalizeWhitespace(value) {
    return String(value || "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "");
  }

  function NormalizeName(value) {
    var text = NormalizeWhitespace(value);
    try {
      if (text && text.normalize) text = text.normalize("NFC");
    } catch (e0) {}
    return text.toLowerCase();
  }

  function CleanDecimal(value) {
    return String(value || "").replace(/^0+/, "") || "0";
  }

  function CompareDecimal(left, right) {
    var a = CleanDecimal(left);
    var b = CleanDecimal(right);
    if (a.length !== b.length) return a.length > b.length ? 1 : -1;
    if (a === b) return 0;
    return a > b ? 1 : -1;
  }

  function DecimalMath(value, otherValue, subtract) {
    var a = CleanDecimal(value);
    var b = CleanDecimal(otherValue);
    var result = "";
    var carry = 0;
    var ai = a.length - 1;
    var bi = b.length - 1;
    var digit;
    var sum;
    if (subtract && CompareDecimal(a, b) < 0) return "";
    while (ai >= 0 || bi >= 0 || (!subtract && carry)) {
      sum =
        (ai >= 0 ? Number(a.charAt(ai)) : 0) +
        (subtract
          ? -carry - (bi >= 0 ? Number(b.charAt(bi)) : 0)
          : (bi >= 0 ? Number(b.charAt(bi)) : 0) + carry);
      if (subtract && sum < 0) {
        digit = sum + 10;
        carry = 1;
      } else {
        digit = subtract ? sum : sum % 10;
        carry = subtract ? 0 : Math.floor(sum / 10);
      }
      result = String(digit) + result;
      ai -= 1;
      bi -= 1;
    }
    return CleanDecimal(result);
  }

  function IsValidAccountId(accountId) {
    var text = String(accountId || "");
    var numberValue = /^\d{1,10}$/.test(text) ? Number(text) : NaN;
    return (
      isFinite(numberValue) &&
      numberValue >= MIN_ACCOUNT_ID &&
      numberValue <= MAX_ACCOUNT_ID
    );
  }

  var IsBlockedAccountText = function (text) {
    return !text || /[{}]/.test(text) || /^#/.test(text) || /^nan$/i.test(text);
  };

  var NormalizeAccountDigits = function (digits) {
    var account = String(digits || "").replace(/[^0-9]/g, "").replace(/^0+/, "") || "0";
    if (account === "0") return "";
    return account.length === 17
      ? NormalizeSteam64(account)
      : IsValidAccountId(account) ? account : "";
  };

  function NormalizeAccountId(value) {
    var text = NormalizeWhitespace(value);
    var match;
    if (IsBlockedAccountText(text)) return "";
    match = text.match(STEAMID3_PATTERN);
    if (match && match[1]) return IsValidAccountId(match[1]) ? match[1] : "";
    if (/^\d{17}$/.test(text) || /^\d{1,10}$/.test(text))
      return NormalizeAccountDigits(text);
    return /\baccount\s*id\b/i.test(text) ? NormalizeAccountDigits(text) : "";
  }

  function NormalizeAccountLabelText(value) {
    var account = NormalizeAccountId(value);
    var text = NormalizeWhitespace(value);
    var matches;
    var found = "";
    var candidate;
    var i;
    if (account) return account;
    if (IsBlockedAccountText(text)) return "";
    matches = text.match(/[0-9][0-9\s.,'’_-]{4,}[0-9]/g);
    if (!matches) return "";
    for (i = 0; i < matches.length; i += 1) {
      candidate = NormalizeAccountDigits(matches[i]);
      if (!candidate) continue;
      if (found && found !== candidate) return "";
      found = candidate;
    }
    return found;
  }

  function NormalizeSteamId3(value) {
    var match = NormalizeWhitespace(value).match(STEAMID3_PATTERN);
    return match && IsValidAccountId(match[1]) ? match[1] : "";
  }

  function NormalizeSteam64(value) {
    var text = NormalizeWhitespace(value);
    var account;
    if (!/^\d{17}$/.test(text)) return "";
    account = DecimalMath(text, STEAM64_BASE, true);
    return IsValidAccountId(account) ? account : "";
  }

  function HasIdentityValue(value) {
    return value !== undefined && value !== null && String(value || "") !== "";
  }

  function VerifyAccountIdentity(accountId, steamid3, steam64) {
    var account = NormalizeAccountId(accountId);
    var id3Account;
    var steam64Account;
    var hasIdentityWitness = false;
    if (!account) return "";
    if (HasIdentityValue(steamid3)) {
      id3Account = NormalizeSteamId3(steamid3);
      if (!id3Account || id3Account !== account) return "";
      hasIdentityWitness = true;
    }
    if (HasIdentityValue(steam64)) {
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
    return account ? DecimalMath(STEAM64_BASE, account, false) : "";
  }

  function BuildRankImageUrl(accountId) {
    var account = NormalizeAccountId(accountId);
    return account
      ? RANK_API_URL_PREFIX +
          encodeURIComponent(account) +
          RANK_IMAGE_URL_SUFFIX
      : "";
  }

  function BuildTeamAverageImageUrl(accounts) {
    var normalized = [];
    var seen = {};
    var i;
    var account;
    if (!accounts || accounts.length !== TEAM_AVERAGE_REQUIRED_ACCOUNTS)
      return "";
    for (i = 0; i < accounts.length; i += 1) {
      account = NormalizeAccountId(accounts[i]);
      if (!account || seen[account]) return "";
      seen[account] = true;
      normalized.push(account);
    }
    return normalized.length === TEAM_AVERAGE_REQUIRED_ACCOUNTS
      ? TEAM_AVERAGE_API_URL_PREFIX +
          normalized.join(",") +
          TEAM_AVERAGE_API_URL_SUFFIX
      : "";
  }

  var IsLikelyPlayerName = function(value) { var text = NormalizeWhitespace(value);
  var norm = NormalizeName(text);
  if (!text || text.length > 64) return false;
  if (text.charAt(0) === "#" || /[{}]/.test(text)) return false;
  if (/^[.\-_\s]+$/.test(text)) return false;
  if (norm === "account id" || norm.indexOf("account id:") === 0)
    return false;
  if (norm === "loading" || norm === "unknown") return false;
  if (NormalizeAccountId(text)) return false;
  return true; };

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

  var ReadProfileNames = function(profileRoot) { var names = [];
  var norms = [];
  var parent = GetParent(profileRoot);
  var userName = FindChildCached(
    profileRoot,
    "__showRankUserNamePanel",
    "UserName",
  );
  var userNick = FindChildCached(
    profileRoot,
    "__showRankUserNicknamePanel",
    "UserNickname",
  );
  var playerContainer = FindChildCached(
    parent,
    "__showRankPlayerContainerPanel",
    "PlayerContainer",
  );
  AddUniqueName(names, norms, ReadTextTree(userName, 3, 24));
  AddUniqueName(names, norms, ReadTextTree(userNick, 3, 24));
  AddUniqueName(names, norms, ReadTextTree(playerContainer, 3, 36));
  return { names: names, norms: norms }; };

  var GetSharedStoreTargets = function() { var targets = [];
  var config;
  if (
    state.sharedStoreTargets &&
    state.sharedStoreTargetsVersion === CACHE_VERSION
  )
    return state.sharedStoreTargets;
  try {
    if (
      typeof GameUI !== "undefined" &&
      GameUI &&
      typeof GameUI.CustomUIConfig === "function"
    ) {
      config = GameUI.CustomUIConfig();
      if (config)
        targets.push({ root: config, name: "GameUI.CustomUIConfig" });
    }
  } catch (e0) {}
  try {
    if (typeof globalThis !== "undefined" && globalThis)
      targets.push({ root: globalThis, name: "globalThis" });
  } catch (e1) {}
  try {
    targets.push({ root: $, name: "$" });
  } catch (e2) {}
  state.sharedStoreTargets = targets;
  state.sharedStoreTargetsVersion = CACHE_VERSION;
  return targets; };

  function ForEachSharedStore(callback) {
    var targets = GetSharedStoreTargets();
    var i;
    for (i = 0; i < targets.length; i += 1) {
      try {
        callback(targets[i].root, targets[i].name);
      } catch (e0) {}
    }
  }

  // Direct profile account witness
  var StoreProfileWitness = function(accountId, names, norms, source, panel) { var account = NormalizeAccountId(accountId);
  var root = GetDocumentRoot(panel);
  var steamid3;
  var steam64;
  if (!account) return false;
  MarkShowRankMatchActiveIfHudActive(root, source || "profile_card");
  steamid3 = BuildSteamId3(account);
  steam64 = BuildSteam64(account);
  if (IsPanelValid(root)) {
    SetPanelAttribute(root, "showrank_last_account_id", account);
    SetPanelAttribute(root, "showrank_last_steamid3", steamid3);
    SetPanelAttribute(root, "showrank_last_steam64", steam64);
    SetPanelAttribute(
      root,
      "showrank_last_profile_name",
      names && names[0] ? names[0] : "",
    );
    SetPanelAttribute(
      root,
      "showrank_last_profile_name_norm",
      norms && norms[0] ? norms[0] : "",
    );
  }
  return true; };
  // Profile Card Reading and Binding
  var FindProfileRoot = function(panel) { var current = IsPanelValid(panel) ? panel : GetContextPanel();
  var guard = 0;
  var child;
  var best = null;
  while (IsPanelValid(current) && guard < 20) {
    if (
      (FindChildCached(current, "__showRankAccountIdPanel", "AccountID") ||
        GetPanelId(current) === "AccountID") &&
      (FindChildCached(
        current,
        "__showRankMediaPanel",
        "WebMediaDemoMedia",
      ) ||
        FindChildCached(
          current,
          "__showRankAccountLabelPanel",
          "WebMediaDemoAccountLabel",
        ))
    ) {
      best = current;
      if (
        GetPanelType(current) === "CitadelProfileCard" ||
        GetPanelId(current) === "ProfileCard"
      )
        return current;
    }
    child = FindChildCached(
      current,
      "__showRankProfileCardPanel",
      "ProfileCard",
    );
    if (IsPanelValid(child)) return child;
    current = GetParent(current);
    guard += 1;
  }
  return IsPanelValid(best)
    ? best
    : IsPanelValid(panel)
      ? panel
      : GetContextPanel(); };

  function ReadProfile(panel) {
    var root = FindProfileRoot(panel);
    var hiddenAccountLabel = FindChildCached(
      root,
      "__showRankHiddenAccountLabelPanel",
      "ShowRankHiddenAccountID",
    );
    var accountLabel = FindChildCached(
      root,
      "__showRankAccountLabelPanel",
      "WebMediaDemoAccountLabel",
    );
    var hiddenAccount = NormalizeAccountLabelText(ReadText(hiddenAccountLabel));
    var visibleAccount = NormalizeAccountLabelText(ReadText(accountLabel));
    var accountMismatch =
      hiddenAccount && visibleAccount && hiddenAccount !== visibleAccount;
    var account = accountMismatch ? "" : hiddenAccount || visibleAccount;
    var media = FindChildCached(
      root,
      "__showRankMediaPanel",
      "WebMediaDemoMedia",
    );
    var localBadge = FindChildCached(
      root,
      "__showRankLocalBadgePanel",
      "WebMediaDemoLocalBadge",
    );
    var profileNames = ReadProfileNames(root);
    return {
      root: root,
      account: account,
      accountMismatch: !!accountMismatch,
      media: media,
      localBadge: localBadge,
      names: profileNames.names,
      norms: profileNames.norms,
      url: BuildRankImageUrl(account),
      seenAt:
        Number(GetPanelAttribute(root, "showrank_profile_seen_at", "")) ||
        NowMs(),
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
    try {
      currentVisible = panel.visible;
    } catch (e0) {
      currentVisible = null;
    }
    try {
      currentVisibility = String(panel.style.visibility || "");
    } catch (e1) {
      currentVisibility = "";
    }
    try {
      currentOpacity = String(panel.style.opacity || "");
    } catch (e2) {
      currentOpacity = "";
    }
    if (
      currentVisible === desired &&
      currentVisibility === visibility &&
      currentOpacity === opacity
    )
      return;
    try {
      panel.visible = desired;
    } catch (e3) {}
    try {
      panel.style.visibility = visibility;
    } catch (e4) {}
    try {
      panel.style.opacity = opacity;
    } catch (e5) {}
  }

  var IsActiveSimProfileMismatch = function(active, profile) { if (
    !active ||
    !profile ||
    !IsVerifiedRosterActive(active) ||
    !active.rowNameNorm
  )
    return false;
  if (!profile.norms || !profile.norms.length) return false;
  return !ProfileHasNameNorm(profile, active.rowNameNorm); };

  var IsProfileTooltipPanel = function(panel) { var current = IsPanelValid(panel) ? panel : GetContextPanel();
  var guard = 0;
  var id;
  var type;
  while (IsPanelValid(current) && guard < 10) {
    id = GetPanelId(current);
    type = GetPanelType(current);
    if (
      type === "CitadelTooltipProfileCard" ||
      id === "CitadelProfileCardTooltip" ||
      id === "ShowRankProfileCardTooltip"
    )
      return true;
    current = GetParent(current);
    guard += 1;
  }
  return false; };

  var ProfileNameMatchesOtherTopBar = function(root, active, profile, candidates) { var i;
  var match;
  var activeUid = String(active && active.topbarUid ? active.topbarUid : "");
  var activeIndex = String(
    active && active.topbarIndex !== undefined && active.topbarIndex !== null
      ? active.topbarIndex
      : "",
  );
  var topbarCandidates =
    candidates && candidates.length ? candidates : ReadTopBarCandidateSnapshot(root).candidates;
  if (!profile || !profile.norms || !profile.norms.length) return null;
  for (i = 0; i < profile.norms.length; i += 1) {
    if (!profile.norms[i] || profile.norms[i] === active.rowNameNorm)
      continue;
    match = FindUniqueTopBarInCandidates(topbarCandidates, profile.norms[i]);
    if (!match || !match.candidate) continue;
    if (activeUid && String(match.candidate.uid || "") === activeUid)
      continue;
    if (
      !activeUid &&
      activeIndex &&
      String(match.candidate.index) === activeIndex
    )
      continue;
    return match.candidate;
  }
  return null; };

  function ApplyVerifiedActiveSimProfileAccount(root, active, profile, reason) {
    var account = profile ? NormalizeAccountId(profile.account) : "";
    var candidate;
    var candidates;
    var otherName;
    var duplicate;
    if (
      !account ||
      !active ||
      !IsVerifiedRosterActive(active) ||
      !active.rowNameNorm
    )
      return false;
    candidate = ResolveActiveSimCandidate(root, active);
    if (!candidate) {
      return false;
    }
    candidates = ReadTopBarCandidateSnapshot(root).candidates;
    otherName = ProfileNameMatchesOtherTopBar(
      root,
      active,
      profile,
      candidates,
    );
    if (otherName) {
      return false;
    }
    duplicate = FindOtherTopBarWithAccount(candidate, account, candidates);
    if (duplicate) {
      return false;
    }
    if (
      !ApplyTopBarImage(
        candidate,
        account,
        "sim_active_verified_account",
        candidates,
      )
    ) {
      return false;
    }
    StoreProfileWitness(
      account,
      [candidate.name || active.rowName || ""],
      [candidate.nameNorm || active.rowNameNorm || ""],
      "sim_active_verified_account",
      candidate.root || root,
    );
    ApplyVerifiedActiveSimPlayerListRank(
      root,
      active,
      account,
      "sim_active_verified_account",
    );
    return true;
  }

  var PROFILE_RANK_IMAGE_ATTRS = [
    ["showrank_account_id", "account"],
    ["showrank_rank_url", "url"],
  ];

  var ApplyProfileRankMedia = function(profile) { var account = NormalizeAccountId(
    profile && profile.account ? profile.account : "",
  );
  var url = profile && profile.url ? profile.url : BuildRankImageUrl(account);
  var pendingStale;
  if (!profile || !account || !IsPanelValid(profile.media) || !url)
    return false;
  if (
    !ApplyRankImagePanel(
      profile.media,
      url,
      "",
      PROFILE_RANK_IMAGE_ATTRS,
      { account: account, url: url },
    )
  )
    return false;
  SetPanelVisible(profile.media, true);
  pendingStale = NormalizeAccountId(
    GetPanelAttribute(
      profile.root,
      "showrank_profile_pending_stale_account",
      "",
    ),
  );
  if (pendingStale && pendingStale !== account)
    SetPanelAttribute(
      profile.root,
      "showrank_profile_pending_stale_account",
      "",
    );
  return true; };

  function ApplyProfile(profile, eventSource) {
    var acceptedActiveSim;
    var root = GetDocumentRoot(profile.root);
    var activeBefore;
    var autoMismatch;
    var profilePanel = IsPanelValid(profile.root) ? profile.root : null;
    var repeatedSuccessfulApply = false;
    var topbarApplied = false;
    if (IsPanelValid(profile.root))
      SetPanelAttribute(profile.root, "showrank_profile_watch_token", "");
    if (IsPanelValid(profile.localBadge))
      SetPanelVisible(profile.localBadge, false);
    activeBefore = ReadActiveSimOpen(root);
    autoMismatch = IsActiveSimProfileMismatch(activeBefore, profile);
    acceptedActiveSim = MarkSimSuccess("profile_account_found", profile);

    repeatedSuccessfulApply =
      IsPanelValid(profilePanel) &&
      GetPanelAttribute(
        profilePanel,
        "showrank_profile_applied_account",
        "",
      ) === profile.account &&
      GetPanelAttribute(profilePanel, "showrank_profile_topbar_applied", "") ===
        "yes";
    ApplyProfileRankMedia(profile);
    if (autoMismatch && !acceptedActiveSim) {
      return profile.account;
    }
    if (
      acceptedActiveSim &&
      (autoMismatch || !profile.norms || !profile.norms.length)
    ) {
      if (IsPanelValid(profilePanel)) {
        SetPanelAttribute(
          profilePanel,
          "showrank_profile_applied_account",
          profile.account,
        );
        SetPanelAttribute(
          profilePanel,
          "showrank_profile_topbar_applied",
          "yes",
        );
      }
      ContinueEscapeAutoAfterAttempt(root, "profile_account_found");
      return profile.account;
    }
    if (repeatedSuccessfulApply) {
      if (acceptedActiveSim)
        ContinueEscapeAutoAfterAttempt(root, "profile_account_found");
      return profile.account;
    }
    StoreProfileWitness(
      profile.account,
      profile.names,
      profile.norms,
      "profile_card",
      profile.root,
    );
    topbarApplied = ApplyProfileToTopBar(profile);
    ApplyRecentManualTargetRow(profile, eventSource);
    if (IsPanelValid(profilePanel)) {
      SetPanelAttribute(
        profilePanel,
        "showrank_profile_applied_account",
        profile.account,
      );
      SetPanelAttribute(
        profilePanel,
        "showrank_profile_topbar_applied",
        topbarApplied ? "yes" : "no",
      );
    }
    if (acceptedActiveSim)
      ContinueEscapeAutoAfterAttempt(root, "profile_account_found");
    return profile.account;
  }

  var PROFILE_WATCH_ATTRS = [
    ["showrank_profile_watch_token", "token"],
    ["showrank_profile_watch_initial_account", "initial_account"],
    ["showrank_profile_watch_mode", "mode"],
    ["showrank_profile_watch_last_account", "last_account"],
    ["showrank_profile_watch_active_until", "active_until"],
    ["showrank_profile_watch_fast_until", "fast_until"],
  ];


  function ProfileWatchAttrName(key) {
    return AttrSpecNameForKey(PROFILE_WATCH_ATTRS, key);
  }

  function GetProfileWatchAttr(root, key, fallback) {
    return GetPanelAttribute(root, ProfileWatchAttrName(key), fallback || "");
  }

  function SetProfileWatchAttr(root, key, value) {
    SetPanelAttribute(root, ProfileWatchAttrName(key), value || "");
  }

  function GetProfileWatchNumber(root, key, fallback) {
    var value = Number(GetProfileWatchAttr(root, key, String(fallback || 0)) || fallback || 0);
    return isFinite(value) ? value : Number(fallback || 0);
  }

  function ClearProfileWatchAttributes(root) {
    WriteAttrSpecs(root, PROFILE_WATCH_ATTRS, {}, true);
  }

  function NewProfileWatchToken(now) {
    state.profileWatchSeq += 1;
    return String(now || NowMs()) + "_" + String(state.profileWatchSeq);
  }

  function FinishProfileAccountWatch(root) {
    SetProfileWatchAttr(root, "token", "");
    SetProfileWatchAttr(root, "initial_account", "");
  }

  function RefreshProfileTooltipActiveWatch(root, now) {
    SetProfileWatchAttr(root, "active_until", now + PROFILE_TOOLTIP_ACTIVE_WATCH_MS);
    SetProfileWatchAttr(root, "fast_until", now + PROFILE_TOOLTIP_FAST_WATCH_MS);
  }

  function RunProfileAccountWatchTick(root, source, token, attempt) {
    var profile = ReadProfile(root);
    var initialAccount = GetProfileWatchAttr(root, "initial_account", "");
    var account = NormalizeAccountId(profile.account);
    if (profile.account && (!initialAccount || account !== initialAccount)) {
      FinishProfileAccountWatch(root);
      ApplyProfile(profile, (source || "profile_card") + "_watch");
      return;
    }
    if (attempt >= PROFILE_WATCH_INTERVALS.length) {
      FinishProfileAccountWatch(root);
      return;
    }
    ScheduleProfileWatchTick(
      root,
      source,
      token,
      attempt + 1,
      PROFILE_WATCH_INTERVALS[attempt],
    );
  }

  function RunProfileTooltipActiveWatchTick(root, source, token) {
    var profile;
    var account;
    var lastAccount;
    var now = NowMs();
    var activeUntil = GetProfileWatchNumber(root, "active_until", 0);
    var fastUntil;
    var nextDelay;
    if (!isFinite(activeUntil) || now > activeUntil) {
      ClearProfileWatchAttributes(root);
      return;
    }
    profile = ReadProfile(root);
    account = NormalizeAccountId(profile.account);
    lastAccount = NormalizeAccountId(GetProfileWatchAttr(root, "last_account", ""));
    if (account && account !== lastAccount) {
      SetProfileWatchAttr(root, "last_account", account);
      RefreshProfileTooltipActiveWatch(root, now);
      ApplyProfile(profile, (source || "profile_card") + "_tooltip_watch");
      SetProfileWatchAttr(root, "token", token);
      SetProfileWatchAttr(root, "mode", "tooltip_active");
    } else if (
      account &&
      account === lastAccount &&
      !IsProfileTooltipMediaCurrent(profile, account)
    ) {
      RefreshProfileTooltipActiveWatch(root, now);
      ApplyProfile(profile, (source || "profile_card") + "_tooltip_watch");
      SetProfileWatchAttr(root, "token", token);
      SetProfileWatchAttr(root, "mode", "tooltip_active");
      SetProfileWatchAttr(root, "last_account", account);
    } else if (
      !account &&
      IsPanelValid(profile.media) &&
      GetPanelAttribute(profile.media, "showrank_account_id", "")
    ) {
      ClearProfileRankMedia(profile);
    }
    fastUntil = GetProfileWatchNumber(root, "fast_until", 0);
    if (
      account &&
      account === lastAccount &&
      IsStableProfileTooltipWatchAccount(profile, account, fastUntil, now)
    ) {
      ClearProfileWatchAttributes(root);
      return;
    }
    if (!isFinite(fastUntil)) fastUntil = 0;
    nextDelay =
      now < fastUntil
        ? PROFILE_TOOLTIP_FAST_WATCH_INTERVAL
        : PROFILE_TOOLTIP_IDLE_WATCH_INTERVAL;
    ScheduleProfileWatchTick(root, source, token, 0, nextDelay);
  }

  function RunProfileWatchTick(root, source, token, attempt) {
    if (GetProfileWatchAttr(root, "mode", "") !== "tooltip_active") {
      RunProfileAccountWatchTick(root, source, token, attempt);
      return;
    }
    RunProfileTooltipActiveWatchTick(root, source, token);
  }

  function ScheduleProfileWatchTick(root, source, token, attempt, delay) {
    try {
      $.Schedule(delay, function () {
        if (!IsPanelValid(root)) return;
        if (GetProfileWatchAttr(root, "token", "") !== token) return;
        RunProfileWatchTick(root, source, token, attempt);
      });
    } catch (e0) {}
  }

  function StartProfileWatch(
    profile,
    source,
    waitForAccountChange,
    forceRestart,
  ) {
    var root = profile && IsPanelValid(profile.root) ? profile.root : null;
    var token;
    var initialAccount = NormalizeAccountId(
      profile && profile.account ? profile.account : "",
    );
    if (!$.Schedule || !IsPanelValid(root)) return;
    if (GetProfileWatchAttr(root, "token", "")) {
      if (!forceRestart) return;
      ClearProfileWatchAttributes(root);
    }
    token = NewProfileWatchToken();
    SetProfileWatchAttr(root, "token", token);
    SetProfileWatchAttr(root, "initial_account", waitForAccountChange ? initialAccount : "");
    ScheduleProfileWatchTick(
      root,
      source,
      token,
      1,
      PROFILE_WATCH_INTERVALS[0],
    );
  }

  function IsProfileTooltipMediaCurrent(profile, account) {
    var mediaAccount;
    var mediaUrl;
    var visible = true;
    if (!account || !profile || !IsPanelValid(profile.media)) return false;
    mediaAccount = NormalizeAccountId(
      GetPanelAttribute(profile.media, "showrank_account_id", ""),
    );
    mediaUrl = GetPanelAttribute(profile.media, "showrank_rank_url", "");
    try {
      visible = profile.media.visible !== false;
    } catch (e0) {
      visible = true;
    }
    return (
      mediaAccount === account &&
      mediaUrl === BuildRankImageUrl(account) &&
      visible
    );
  }
  function IsStableProfileTooltipWatchAccount(
    profile,
    account,
    fastUntil,
    now,
  ) {
    if (!account || !profile || !IsPanelValid(profile.media)) return false;
    if (isFinite(fastUntil) && now < fastUntil) return false;
    return IsProfileTooltipMediaCurrent(profile, account);
  }

  function StartProfileTooltipActiveWatch(profile, source) {
    var root = profile && IsPanelValid(profile.root) ? profile.root : null;
    var initialAccount = NormalizeAccountId(
      profile && profile.account ? profile.account : "",
    );
    var existingToken;
    var now;
    var token;
    if (!$.Schedule || !IsPanelValid(root)) return;
    now = NowMs();
    existingToken = GetProfileWatchAttr(root, "token", "");
    if (existingToken && GetProfileWatchAttr(root, "mode", "") === "tooltip_active") {
      RefreshProfileTooltipActiveWatch(root, now);
      if (initialAccount) SetProfileWatchAttr(root, "last_account", initialAccount);
      return;
    }
    token = NewProfileWatchToken(now);
    SetProfileWatchAttr(root, "token", token);
    SetProfileWatchAttr(root, "initial_account", initialAccount);
    SetProfileWatchAttr(root, "mode", "tooltip_active");
    SetProfileWatchAttr(root, "last_account", initialAccount);
    RefreshProfileTooltipActiveWatch(root, now);
    ScheduleProfileWatchTick(
      root,
      source,
      token,
      0,
      PROFILE_TOOLTIP_FAST_WATCH_INTERVAL,
    );
  }



  var IsHideoutProfileHoverRefreshAllowed = function(panel) { var root = GetDocumentRoot(panel);
  var current = IsPanelValid(panel) ? panel : GetContextPanel();
  var guard = 0;
  if (!IsPanelValid(root)) return false;
  if (HudOrRootHasAnyClass(root, CONNECTED_HIDEOUT_CLASS_NAMES)) return true;
  while (IsPanelValid(current) && guard < 14) {
    if (PanelHasAnyClass(current, CONNECTED_HIDEOUT_CLASS_NAMES)) return true;
    current = GetParent(current);
    guard += 1;
  }
  return false; };



  var ShouldSkipRepeatedProfileOnload = function(profile, source) { var account = NormalizeAccountId(
    profile && profile.account ? profile.account : "",
  );
  var mediaAccount;
  var mediaUrl;
  if (
    !account ||
    !profile ||
    !IsPanelValid(profile.root) ||
    !IsPanelValid(profile.media)
  )
    return false;
  if (!SourceIsAny(source, PROFILE_REPEATABLE_ONLOAD_SOURCES)) return false;
  if (
    GetPanelAttribute(
      profile.root,
      "showrank_profile_applied_account",
      "",
    ) !== account
  )
    return false;
  if (
    GetPanelAttribute(profile.root, "showrank_profile_topbar_applied", "") !==
    "yes"
  )
    return false;
  mediaAccount = NormalizeAccountId(
    GetPanelAttribute(profile.media, "showrank_account_id", ""),
  );
  mediaUrl = GetPanelAttribute(profile.media, "showrank_rank_url", "");
  return (
    mediaAccount === account &&
    mediaUrl === (profile.url || BuildRankImageUrl(account))
  ); };


  var StartProfileTooltipAccountWatch = function(profile,
  source,
  isHoverRefresh,) { if (!isHoverRefresh) {
    if (!profile || !SourceIsAny(source, PROFILE_TOOLTIP_ONLOAD_SOURCES))
      return false;
    if (!IsProfileTooltipPanel(profile.root)) return false;
    if (!IsHideoutProfileHoverRefreshAllowed(profile.root)) return false;
  }
  StartProfileTooltipActiveWatch(profile, source);
  return true; };

  var ClearProfileRankMedia = function(profile) {
    if (!profile || !IsPanelValid(profile.media)) return false;
    if (GetPanelAttribute(profile.media, "showrank_rank_url", ""))
      TrySetImage(profile.media, "");
    SetPanelVisible(profile.media, false);
    SetPanelAttribute(profile.media, "showrank_account_id", "");
    SetPanelAttribute(profile.media, "showrank_rank_url", "");
    return true;
  };

  var ClearProfileLocalAccountState = function(root, reason) { var docRoot = GetDocumentRoot(root);
  if (!IsPanelValid(docRoot)) return false;
  ClearLastProfileAttributes(docRoot);
  return true; };

  var ShouldDeferReusedProfileHoverAccount = function(profile) { var account = NormalizeAccountId(
    profile && profile.account ? profile.account : "",
  );
  var mediaAccount;
  var pendingStale;
  if (
    !account ||
    !profile ||
    !IsPanelValid(profile.root) ||
    !IsPanelValid(profile.media)
  )
    return false;
  pendingStale = NormalizeAccountId(
    GetPanelAttribute(
      profile.root,
      "showrank_profile_pending_stale_account",
      "",
    ),
  );
  if (pendingStale && pendingStale === account) return true;
  mediaAccount = NormalizeAccountId(
    GetPanelAttribute(profile.media, "showrank_account_id", ""),
  );
  return !!(
    mediaAccount &&
    mediaAccount === account &&
    GetPanelAttribute(profile.media, "showrank_rank_url", "")
  ); };

  var DeferReusedProfileHoverAccount = function(profile, source) { var account = NormalizeAccountId(
    profile && profile.account ? profile.account : "",
  );
  if (!account || !profile || !IsPanelValid(profile.root)) return false;
  ClearProfileLocalAccountState(profile.root, "profile_reused_hover");
  SetPanelAttribute(
    profile.root,
    "showrank_profile_pending_stale_account",
    account,
  );
  if (IsPanelValid(profile.localBadge))
    SetPanelVisible(profile.localBadge, false);
  ClearProfileRankMedia(profile);
  StartProfileWatch(profile, source, true, true);
  return true; };

  var StampProfileSeen = function(profile) { profile.seenAt = NowMs();
  if (IsPanelValid(profile.root))
    SetPanelAttribute(
      profile.root,
      "showrank_profile_seen_at",
      profile.seenAt,
    ); };

  var HandleRestrictedProfileHover = function(profile, source) { if (profile.account) {
    if (ShouldDeferReusedProfileHoverAccount(profile)) {
      DeferReusedProfileHoverAccount(profile, source);
      return "";
    }
    if (IsPanelValid(profile.localBadge))
      SetPanelVisible(profile.localBadge, false);
    ApplyProfileRankMedia(profile);
    StartProfileWatch(profile, source, true, true);
    return profile.account;
  }
  if (IsPanelValid(profile.localBadge)) SetPanelVisible(profile.localBadge, false);
  ClearProfileLocalAccountState(
    profile.root,
    "profile_missing_account_hover",
  );
  ClearProfileRankMedia(profile);
  StartProfileWatch(profile, source, false, true);
  return ""; };

  var MarkProfileSourceSimSuccess = function(profile, source) { if (String(source || "").indexOf("context_menu_player_onload") >= 0)
    MarkSimSuccess("context_menu_player_onload", profile);
  else if (
    String(source || "").indexOf("profile_card_onload") >= 0 ||
    String(source || "").indexOf("context_menu_profile_card_onload") >= 0 ||
    String(source || "").indexOf("account_id_onload") >= 0
  )
    MarkSimSuccess("profile_card_onload", profile); };

  var HandleMissingProfileAccount = function(profile, source, isHoverRefresh) { if (IsPanelValid(profile.localBadge)) SetPanelVisible(profile.localBadge, false);
  if (isHoverRefresh || profile.accountMismatch) {
    ClearProfileLocalAccountState(
      profile.root,
      profile.accountMismatch
        ? "profile_mismatched_account"
        : "profile_missing_account_hover",
    );
    ClearProfileRankMedia(profile);
  }
  if (!StartProfileTooltipAccountWatch(profile, source, isHoverRefresh))
    StartProfileWatch(profile, source);
  return ""; };

  function TriggerProfileCard(panel, source) {
    var targetPanel = IsPanelValid(panel) ? panel : GetContextPanel();
    var isHoverRefresh = SourceIsAny(source, PROFILE_HOVER_REFRESH_SOURCES);
    var allowFullHoverRefresh = true;
    var profile;
    var account;
    if (String(source || "") === "context_menu_player_mouseover") {
      return "";
    }
    if (isHoverRefresh)
      allowFullHoverRefresh = IsHideoutProfileHoverRefreshAllowed(targetPanel);
    profile = ReadProfile(targetPanel);

    StampProfileSeen(profile);
    if (ShouldSkipRepeatedProfileOnload(profile, source)) {

      return profile.account;
    }
    if (isHoverRefresh && !allowFullHoverRefresh) {
      return HandleRestrictedProfileHover(profile, source);
    }
    if (isHoverRefresh && ShouldDeferReusedProfileHoverAccount(profile)) {
      DeferReusedProfileHoverAccount(profile, source);
      return "";
    }
    MarkProfileSourceSimSuccess(profile, source);
    if (!profile.account) {
      return HandleMissingProfileAccount(profile, source, isHoverRefresh);
    }
    account = ApplyProfile(profile, source);
    StartProfileTooltipAccountWatch(profile, source, isHoverRefresh);
    return account;
  }
  function OpenStatlocker(panel) {
    var account = TriggerProfileCard(panel, "statlocker_button");
    var targetUrl;
    if (!account) return;
    targetUrl =
      STATLOCKER_MATCHES_URL_PREFIX +
      encodeURIComponent(account) +
      STATLOCKER_MATCHES_URL_SUFFIX;
    if (TryOpenExternalUrlWithSteamOverlay(targetUrl, "OpenURL")) return;
    if (TryOpenExternalUrlWithSteamOverlay(targetUrl, "OpenExternalBrowserURL"))
      return;
    try {
      if ($.DispatchEvent)
        $.DispatchEvent("ExternalBrowserGoToURL", targetUrl);
    } catch (e0) {}
  }

  function OpenDeadlock(panel) {
    var account = TriggerProfileCard(panel, "deadlock_button");
    var accountNumber = Number(account);
    if (!account || !isFinite(accountNumber)) return;
    try {
      if (typeof CitadelShowProfilePageForAccount === "function")
        CitadelShowProfilePageForAccount(accountNumber);
    } catch (e0) {}
  }


  function EnsureTopBarUid(root, image, docRoot) {
    var uid;
    var next;
    var scope = GetDocumentRoot(docRoot || root || image);
    if (!IsPanelValid(root) && !IsPanelValid(image)) return "";
    uid =
      GetPanelAttribute(image, "showrank_topbar_uid", "") ||
      GetPanelAttribute(root, "showrank_topbar_uid", "");
    if (!uid) {
      next = Number(
        GetPanelAttribute(scope, "showrank_topbar_uid_next", "0") || 0,
      );
      if (!isFinite(next) || next < 0) next = 0;
      next += 1;
      SetPanelAttribute(scope, "showrank_topbar_uid_next", next);
      uid = "tb" + String(next) + "_" + String(NowMs());
    }
    SetPanelAttribute(root, "showrank_topbar_uid", uid);
    SetPanelAttribute(image, "showrank_topbar_uid", uid);
    return uid;
  }

  var CacheTopBarNamePanel = function(root, image, namePanel) { if (!IsPanelValid(namePanel)) return null;
  try {
    if (IsPanelValid(root)) root.__showRankPlayerNamePanel = namePanel;
  } catch (e0) {}
  try {
    if (IsPanelValid(image)) image.__showRankPlayerNamePanel = namePanel;
  } catch (e1) {}
  return namePanel; };

  var GetCachedTopBarNamePanel = function(root, image) { var panel = null;
  try {
    panel = IsPanelValid(root) ? root.__showRankPlayerNamePanel : null;
  } catch (e0) {
    panel = null;
  }
  if (IsPanelValid(panel)) return panel;
  try {
    panel = IsPanelValid(image) ? image.__showRankPlayerNamePanel : null;
  } catch (e1) {
    panel = null;
  }
  return IsPanelValid(panel) ? panel : null; };

  var ReadTopBarLiveName = function(root, image) { var namePanel = GetCachedTopBarNamePanel(root, image);
  var name = IsPanelValid(namePanel) ? ReadText(namePanel) : "";
  if (name) return name;
  return (
    GetPanelAttribute(root, "showrank_player_name", "") ||
    GetPanelAttribute(image, "showrank_player_name", "") ||
    ""
  ); };

  var ReadExistingTopBarUid = function(root, image) { return (
    GetPanelAttribute(root, "showrank_topbar_uid", "") ||
    GetPanelAttribute(image, "showrank_topbar_uid", "")
  ); };

  var FindPanelRefIndex = function(list, panel) { var i;
  if (!IsPanelValid(panel)) return -1;
  for (i = 0; i < list.length; i += 1) {
    if (list[i] === panel) return i;
  }
  return -1; };

  function TopBarCandidateValidationScore(candidate) {
    var score = 0;
    if (!candidate) return score;
    if (candidate.nameNorm) score += 1;
    if (candidate.teamSide) score += 2;
    if (candidate.account) score += 4;
    if (
      candidate.rankUrl &&
      candidate.account &&
      candidate.rankUrl === BuildRankImageUrl(candidate.account)
    )
      score += 4;
    return score;
  }

  // Top-Bar Candidate Discovery
  function CreateTopBarCandidateDedupIndexes() {
    return { roots: [], images: [], uids: {}, fallback: {} };
  }

  function IsUsableTopBarCandidate(candidate) {
    return (
      !!candidate &&
      IsPanelValid(candidate.image) &&
      IsPanelValid(candidate.root)
    );
  }

  function TopBarCandidateDedupFallbackKey(candidate) {
    return (candidate.teamSide || "unknown") + "|" + (candidate.nameNorm || "");
  }

  function IndexTopBarCandidate(indexes, item, slot, key) {
    indexes.roots[slot] = item.root;
    indexes.images[slot] = item.image;
    if (item.uid) indexes.uids[item.uid] = slot;
    if (item.nameNorm) indexes.fallback[key] = slot;
  }

  function FindTopBarCandidateDuplicateIndex(indexes, candidate, useFallback, fallbackKey) {
    var duplicateIndex = FindPanelRefIndex(indexes.images, candidate.image);
    if (duplicateIndex < 0)
      duplicateIndex = FindPanelRefIndex(indexes.roots, candidate.root);
    if (
      duplicateIndex < 0 &&
      candidate.uid &&
      Object.prototype.hasOwnProperty.call(indexes.uids, candidate.uid)
    )
      duplicateIndex = indexes.uids[candidate.uid];
    if (
      duplicateIndex < 0 &&
      useFallback &&
      candidate.nameNorm &&
      Object.prototype.hasOwnProperty.call(indexes.fallback, fallbackKey)
    )
      duplicateIndex = indexes.fallback[fallbackKey];
    return duplicateIndex;
  }

  function EnsureDedupedTopBarCandidateIdentity(docRoot, candidate, index) {
    candidate.index = index;
    candidate.uid = EnsureTopBarUid(candidate.root, candidate.image, docRoot);
  }

  function ReplaceTopBarCandidateIfBetter(
    docRoot,
    result,
    indexes,
    candidate,
    duplicateIndex,
    fallbackKey
  ) {
    var existing = result[duplicateIndex];
    if (
      TopBarCandidateValidationScore(candidate) <=
      TopBarCandidateValidationScore(existing)
    )
      return;
    EnsureDedupedTopBarCandidateIdentity(docRoot, candidate, duplicateIndex);
    result[duplicateIndex] = candidate;
    IndexTopBarCandidate(indexes, candidate, duplicateIndex, fallbackKey);
  }

  function AppendTopBarCandidate(docRoot, result, indexes, candidate, fallbackKey) {
    EnsureDedupedTopBarCandidateIdentity(docRoot, candidate, result.length);
    result.push(candidate);
    IndexTopBarCandidate(indexes, candidate, candidate.index, fallbackKey);
  }

  function DeduplicateTopBarCandidates(docRoot, rawCandidates) {
    var result = [];
    var indexes = CreateTopBarCandidateDedupIndexes();
    var useFallback = rawCandidates && rawCandidates.length > 12;
    var i;
    var candidate;
    var duplicateIndex;
    var fallbackKey;
    if (!rawCandidates || !rawCandidates.length) return result;
    for (i = 0; i < rawCandidates.length; i += 1) {
      candidate = rawCandidates[i];
      if (!IsUsableTopBarCandidate(candidate)) continue;
      fallbackKey = TopBarCandidateDedupFallbackKey(candidate);
      duplicateIndex = FindTopBarCandidateDuplicateIndex(
        indexes,
        candidate,
        useFallback,
        fallbackKey
      );
      if (duplicateIndex >= 0) {
        ReplaceTopBarCandidateIfBetter(
          docRoot,
          result,
          indexes,
          candidate,
          duplicateIndex,
          fallbackKey
        );
      } else {
        AppendTopBarCandidate(docRoot, result, indexes, candidate, fallbackKey);
      }
    }
    return result;
  }

  function BuildTopBarCandidate(root, image, index, uid, name, nameNorm, account, rankUrl, teamSide) {
    account = NormalizeAccountId(account);
    return {
      root: root,
      image: image,
      index: index,
      uid: uid,
      name: name || "",
      nameNorm: nameNorm || NormalizeName(name),
      account: account,
      accountVersion: account ? CACHE_VERSION : "",
      rankUrl:
        rankUrl ||
        ReadTopBarRankUrl({
          root: root,
          image: image,
          account: account,
          accountVersion: account ? CACHE_VERSION : "",
        }),
      steamid3: account ? BuildSteamId3(account) : "",
      steam64: account ? BuildSteam64(account) : "",
      teamSide: teamSide,
    };
  }

  function AttachTopBarRegistration(root, image, namePanel) {
    AddClass(root, TOPBAR_PLAYER_CLASS);
    AddClass(image, TOPBAR_IMAGE_CLASS);
    try {
      image.__showRankTopBarRoot = root;
    } catch (e0) {}
    CacheTopBarNamePanel(root, image, namePanel);
  }

  function ReadTopBarNameState(root, image) {
    return {
      previous:
        GetPanelAttribute(image, "showrank_player_name_norm", "") ||
        GetPanelAttribute(root, "showrank_player_name_norm", ""),
      bound:
        GetPanelAttribute(image, "showrank_bound_name_norm", "") ||
        GetPanelAttribute(root, "showrank_bound_name_norm", ""),
    };
  }

  function WriteTopBarNameState(root, image, name, nameNorm) {
    SetPanelAttribute(root, "showrank_player_name", name || "");
    SetPanelAttribute(root, "showrank_player_name_norm", nameNorm || "");
    SetPanelAttribute(image, "showrank_player_name", name || "");
    SetPanelAttribute(image, "showrank_player_name_norm", nameNorm || "");
  }

  function MaybeClearTopBarForNameChange(candidate, nameState, nameNorm) {
    if (nameState.previous && nameState.previous !== nameNorm) {
      ClearTopBarRankState(candidate, "topbar_name_changed");
    } else if (nameState.bound && nameNorm && nameState.bound !== nameNorm) {
      ClearTopBarRankState(candidate, "topbar_bound_name_changed");
    }
  }

  function ReadTopBarRegistrationFacts(panel) {
    var root = IsPanelValid(panel) ? panel : GetContextPanel();
    var docRoot = GetDocumentRoot(root);
    var image = FindChild(root, "ShowRankTopBarRankImage");
    var namePanel = FindChild(root, "PlayerName");
    var name = ReadText(namePanel);
    var nameNorm = NormalizeName(name);
    if (!IsPanelValid(root) || !IsPanelValid(image)) return null;
    return {
      root: root,
      docRoot: docRoot,
      image: image,
      namePanel: namePanel,
      name: name || "",
      nameNorm: nameNorm || "",
    };
  }

  function RegisterTopBarPlayer(panel, source) {
    var facts = ReadTopBarRegistrationFacts(panel);
    var nameState;
    var candidate;
    var uid;
    var teamSide;
    if (!facts) return null;
    AttachTopBarRegistration(facts.root, facts.image, facts.namePanel);
    MaybeClearTopBarForMatchReset(
      facts.docRoot,
      facts.root,
      facts.image,
      source || "topbar_register",
    );
    uid = EnsureTopBarUid(facts.root, facts.image, facts.docRoot);
    teamSide = DetectTopBarTeamSide(facts.root);
    if (teamSide) SetPanelAttribute(facts.image, "showrank_team_side", teamSide);
    nameState = ReadTopBarNameState(facts.root, facts.image);
    WriteTopBarNameState(facts.root, facts.image, facts.name, facts.nameNorm);
    candidate = BuildTopBarCandidate(
      facts.root,
      facts.image,
      -1,
      uid,
      facts.name,
      facts.nameNorm,
      ReadTopBarAccount({ root: facts.root, image: facts.image }),
      "",
      teamSide,
    );
    TopBarCandidateStoreUpsert(
      facts.docRoot,
      ReadTopBarCandidateSnapshot(facts.docRoot).candidates,
      candidate,
    );
    SetPanelAttribute(facts.root, "showrank_topbar_index", candidate.index);
    SetPanelAttribute(facts.image, "showrank_topbar_index", candidate.index);
    MaybeResetIdleForTopBarCandidate(
      facts.docRoot,
      candidate,
      source || "topbar_register",
    );
    MaybeClearTopBarForNameChange(candidate, nameState, facts.nameNorm);
    ScheduleTopBarReadyCheck(facts.docRoot, source || "topbar_register");
    return candidate;
  }
  var MarkTopBarHover = function(panel, source) { var sourceName = source || "topbar_hover";
  var contextPanel = IsPanelValid(panel) ? panel : GetContextPanel();
  var candidate =
    ReadRegisteredTopBarCandidate(contextPanel) ||
    RegisterTopBarPlayer(contextPanel, sourceName);
  var now;
  var token;
  if (!candidate || !candidate.nameNorm) return false;
  now = NowMs();
  token = String(now) + "_" + String(candidate.index);
  SetPanelAttribute(candidate.image, "showrank_hover_token", token);
  SetPanelAttribute(candidate.root, "showrank_hover_token", token);
  StoreManualTarget(
    candidate,
    candidate.name,
    candidate.nameNorm,
    sourceName,
    token,
  );
  state.hoverToken = {
    token: token,
    nameNorm: candidate.nameNorm,
    name: candidate.name,
    candidate: candidate,
    source: sourceName,
    at: now,
  };
  return true; };


  function IsTopBarPlayerRoot(panel) {
    return (
      IsPanelValid(panel) &&
      (HasClass(panel, TOPBAR_PLAYER_CLASS) ||
        GetPanelType(panel) === "CitadelHudTopBarPlayer")
    );
  }

  function ResolveTopBarPlayerRootFromImage(image) {
    var panelRoot = GetParent(image);
    var parent;
    while (IsPanelValid(panelRoot) && !IsTopBarPlayerRoot(panelRoot)) {
      parent = GetParent(panelRoot);
      if (!IsPanelValid(parent)) break;
      panelRoot = parent;
    }
    if (IsTopBarPlayerRoot(panelRoot)) return panelRoot;
    try {
      panelRoot = image.__showRankTopBarRoot;
    } catch (e0) {
      panelRoot = null;
    }
    while (IsPanelValid(panelRoot) && !IsTopBarPlayerRoot(panelRoot)) {
      parent = GetParent(panelRoot);
      if (!IsPanelValid(parent)) break;
      panelRoot = parent;
    }
    return IsTopBarPlayerRoot(panelRoot) ? panelRoot : GetParent(image);
  }

  var FindTopBarRootFromPanel = function(panel) { var current = IsPanelValid(panel) ? panel : GetContextPanel();
  var guard = 0;
  while (IsPanelValid(current) && guard < 20) {
    if (IsTopBarPlayerRoot(current)) return current;
    current = GetParent(current);
    guard += 1;
  }
  return IsPanelValid(panel) ? panel : GetContextPanel(); };

  function ReadRegisteredTopBarCandidate(panel) {
    var root = FindTopBarRootFromPanel(panel);
    var image;
    var name;
    var nameNorm;
    var index;
    var uid;
    var teamSide;
    if (!IsPanelValid(root)) return null;
    image = FindChild(root, "ShowRankTopBarRankImage");
    if (!IsPanelValid(image)) return null;
    name = ReadTopBarLiveName(root, image);
    nameNorm =
      GetPanelAttribute(root, "showrank_player_name_norm", "") ||
      GetPanelAttribute(image, "showrank_player_name_norm", "") ||
      NormalizeName(name);
    uid =
      GetPanelAttribute(root, "showrank_topbar_uid", "") ||
      GetPanelAttribute(image, "showrank_topbar_uid", "");
    index = Number(
      GetPanelAttribute(root, "showrank_topbar_index", "") ||
        GetPanelAttribute(image, "showrank_topbar_index", ""),
    );
    teamSide =
      GetPanelAttribute(root, "showrank_team_side", "") ||
      GetPanelAttribute(image, "showrank_team_side", "");
    if (!nameNorm || !uid || !isFinite(index) || index < 0) return null;
    return {
      root: root,
      image: image,
      name: name || "",
      nameNorm: nameNorm,
      index: index,
      uid: uid,
      teamSide: teamSide,
      account: ReadTopBarAccount({ root: root, image: image }),
    };
  }

  function TopBarCandidateStoreEntryAttached(candidate, docRoot) {
    return !!(
      candidate &&
      IsPanelValid(docRoot) &&
      IsPanelValid(candidate.root) &&
      IsPanelValid(candidate.image) &&
      GetDocumentRoot(candidate.root) === docRoot &&
      GetDocumentRoot(candidate.image) === docRoot
    );
  }

  function TopBarCandidateStoreCacheAttached(candidates, docRoot) {
    var i;
    if (!candidates || !candidates.length) return false;
    for (i = 0; i < candidates.length; i += 1)
      if (!TopBarCandidateStoreEntryAttached(candidates[i], docRoot))
        return false;
    return true;
  }

  var TopBarCandidateStoreReadCache = function(root) { var docRoot = GetDocumentRoot(root);
  if (!IsPanelValid(docRoot)) return null;
  if (state.topBarCandidateCacheDirty) return null;
  if (state.topBarCandidateCacheRoot !== docRoot) return null;
  if (!TopBarCandidateStoreCacheAttached(state.topBarCandidateCache, docRoot)) {
    TopBarCandidateStoreInvalidate(docRoot);
    return null;
  }
  return state.topBarCandidateCache;
  };

  function TopBarCandidateStoreClearSnapshot(root) {
    var docRoot = GetDocumentRoot(root);
    if (
      !IsPanelValid(docRoot) ||
      state.topBarCandidateSnapshotRoot === docRoot
    ) {
      state.topBarCandidateSnapshotRoot = null;
      state.topBarCandidateSnapshot = null;
      state.topBarCandidateSnapshotRankRevision = -1;
    }
  }

  var TopBarCandidateStoreWriteCache = function(root, candidates) { var docRoot = GetDocumentRoot(root);
  if (!IsPanelValid(docRoot) || !candidates) return candidates || [];
  state.topBarCandidateStructuralGeneration += 1;
  state.topBarCandidateCacheRoot = docRoot;
  state.topBarCandidateCache = candidates;
  state.topBarCandidateCacheDirty = false;
  TopBarCandidateStoreClearSnapshot(docRoot);
  return candidates; };

  var TopBarCandidateStoreInvalidate = function(root) { var docRoot = GetDocumentRoot(root);
  state.topBarCandidateStructuralGeneration += 1;
  if (!IsPanelValid(docRoot)) {
    state.topBarCandidateCacheDirty = true;
    TopBarCandidateStoreClearSnapshot(null);
    return;
  }
  if (state.topBarCandidateCacheRoot === docRoot) {
    state.topBarCandidateCacheDirty = true;
    TopBarCandidateStoreClearSnapshot(docRoot);
  } };

  var TopBarCandidateStoreMarkRankDirty = function(root) { var docRoot = GetDocumentRoot(root);
  state.topBarCandidateRankRevision += 1;
  if (!IsPanelValid(docRoot)) {
    TopBarCandidateStoreClearSnapshot(null);
    return;
  }
  if (state.topBarCandidateSnapshotRoot === docRoot)
    TopBarCandidateStoreClearSnapshot(docRoot);
  };

  var TopBarCandidateStoreFindSlot = function(candidates, candidate) { var i;
  var uid;
  if (!candidates || !candidate) return -1;
  uid = candidate.uid || "";
  for (i = 0; i < candidates.length; i += 1) {
    if (!candidates[i]) continue;
    if (candidate.image && candidates[i].image === candidate.image) return i;
    if (candidate.root && candidates[i].root === candidate.root) return i;
    if (uid && candidates[i].uid === uid) return i;
  }
  return -1; };

  function TopBarCandidateHasMatchingName(cached, candidate) {
    return !!cached && !!candidate && !!cached.nameNorm && cached.nameNorm === candidate.nameNorm;
  }

  function TopBarCandidateSharesStablePanelIdentity(cached, candidate) {
    if (cached.uid && cached.uid === candidate.uid) return true;
    if (cached.image && cached.image === candidate.image) return true;
    if (cached.root && cached.root === candidate.root) return true;
    return false;
  }

  function TopBarCandidateOptionalFieldMatches(cached, candidate, key) {
    if (!cached[key] && !candidate[key]) return true;
    return cached[key] === candidate[key];
  }

  function TopBarCandidateStoreEntryMatches(cached, candidate) {
    if (!TopBarCandidateHasMatchingName(cached, candidate)) return false;
    if (!TopBarCandidateSharesStablePanelIdentity(cached, candidate)) return false;
    if (!TopBarCandidateOptionalFieldMatches(cached, candidate, "account"))
      return false;
    if (!TopBarCandidateOptionalFieldMatches(cached, candidate, "accountVersion"))
      return false;
    return TopBarCandidateOptionalFieldMatches(cached, candidate, "rankUrl");
  }

  function TopBarCandidateStoreCoversPartialScan(cached, candidates, docRoot) {
    var i;
    var j;
    var matched;
    if (
      !TopBarCandidateStoreCacheAttached(cached, docRoot) ||
      !candidates ||
      cached.length < TEAM_AVERAGE_REQUIRED_ACCOUNTS * 2 ||
      !candidates.length ||
      candidates.length >= cached.length
    )
      return false;
    for (i = 0; i < candidates.length; i += 1) {
      matched = false;
      for (j = 0; j < cached.length; j += 1) {
        if (TopBarCandidateStoreEntryMatches(cached[j], candidates[i])) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  }

  function TopBarCandidateStoreWriteBest(root, candidates, forceRefresh) {
    var docRoot = GetDocumentRoot(root);
    var cached = state.topBarCandidateCache;
    if (forceRefresh)
      return TopBarCandidateStoreWriteCache(docRoot, candidates);
    if (
      !state.topBarCandidateCacheDirty &&
      TopBarCandidateStoreCoversPartialScan(cached, candidates, docRoot)
    )
      return cached;
    return TopBarCandidateStoreWriteCache(docRoot, candidates);
  }

  function TopBarCandidateStoreUpsert(root, candidates, candidate) {
    var docRoot = GetDocumentRoot(root);
    var list = candidates || [];
    var slot;
    if (
      !IsPanelValid(docRoot) ||
      !candidate ||
      !IsPanelValid(candidate.root) ||
      !IsPanelValid(candidate.image)
    )
      return list;
    slot = TopBarCandidateStoreFindSlot(list, candidate);
    if (slot < 0) slot = list.length;
    candidate.index = slot;
    if (!candidate.uid)
      candidate.uid = EnsureTopBarUid(candidate.root, candidate.image, docRoot);
    list[slot] = candidate;
    return TopBarCandidateStoreWriteCache(docRoot, list);
  }


  var ClearTopBarCandidateAccount = function(candidate, reason) { ClearTopBarRankState(candidate, reason, true);
  candidate.account = "";
  candidate.rankUrl = ""; };


  function TopBarCandidateStoreRead(root, forceRefresh) {
    var docRoot = GetDocumentRoot(root);
    var cached;
    var images;
    var raw = [];
    var i;
    var image;
    var panelRoot;
    var liveName;
    var boundNameNorm;
    var candidate;
    var teamSide;
    if (forceRefresh && IsPanelValid(docRoot))
      TopBarCandidateStoreClearSnapshot(docRoot);
    cached = forceRefresh ? null : TopBarCandidateStoreReadCache(docRoot);
    var candidates;
    if (cached) return cached;
    images = FindChildrenWithClass(docRoot, TOPBAR_IMAGE_CLASS);
    for (i = 0; i < images.length; i += 1) {
      image = images[i];
      panelRoot = ResolveTopBarPlayerRootFromImage(image);
      if (!IsPanelValid(panelRoot)) continue;
      teamSide = DetectTopBarTeamSide(panelRoot);
      if (teamSide) SetPanelAttribute(image, "showrank_team_side", teamSide);
      liveName = ReadTopBarLiveName(panelRoot, image);
      if (!liveName) continue;
      candidate = BuildTopBarCandidate(
        panelRoot,
        image,
        raw.length,
        ReadExistingTopBarUid(panelRoot, image),
        liveName,
        NormalizeName(liveName),
        "",
        "",
        teamSide,
      );
      boundNameNorm =
        GetPanelAttribute(image, "showrank_bound_name_norm", "") ||
        GetPanelAttribute(panelRoot, "showrank_bound_name_norm", "");
      if (
        boundNameNorm &&
        candidate.nameNorm &&
        boundNameNorm !== candidate.nameNorm
      ) {
        ClearTopBarCandidateAccount(candidate, "topbar_bound_name_changed");
      } else {
        ReadTopBarCandidateEvidence(candidate);
      }
      raw.push(candidate);
    }
    candidates = DeduplicateTopBarCandidates(docRoot, raw);
    return TopBarCandidateStoreWriteBest(docRoot, candidates, !!forceRefresh);
  }


  function AddUniqueTopBarSnapshotAccount(list, seen, account) {
    account = String(account || "");
    if (!account || seen[account]) return;
    seen[account] = true;
    list.push(account);
  }

  function CreateTopBarSnapshotReadiness(snapshot) {
    var required = TEAM_AVERAGE_REQUIRED_ACCOUNTS * 2;
    var topbarCount = Number(snapshot.topbarCount || 0);
    var loadedCount = Number(snapshot.loadedCount || 0);
    return {
      completeUniqueTopBarRoster:
        topbarCount === required && snapshot.uniqueNameCount === required,
      teamAverageInputsReady:
        topbarCount === required &&
        !!snapshot.allTeamSidesKnown &&
        snapshot.friendlyCount === TEAM_AVERAGE_REQUIRED_ACCOUNTS &&
        snapshot.enemyCount === TEAM_AVERAGE_REQUIRED_ACCOUNTS,
      allRanksLoaded: topbarCount >= required && loadedCount >= topbarCount,
      missingRankCount: Math.max(0, topbarCount - loadedCount),
    };
  }


  function CreateTopBarCandidateSnapshot(candidates, generation) {
    var friendlySeen = {};
    var enemySeen = {};
    var seen = {};
    var i;
    var candidate;
    var key;
    var nameNorm;
    var entry;
    var teamSide;
    var rankState;
    var snapshot = {
      candidates: candidates || [],
      generation: String(generation === undefined || generation === null ? "" : generation),
      rankRevision: state.topBarCandidateRankRevision,
      nameMap: {},
      duplicateNames: {},
      uniqueNameCount: 0,
      loadedCount: 0,
      topbarCount: 0,
      teamSideCandidates: { "friendly": [], "enemy": [] },
      friendlyAccounts: [],
      enemyAccounts: [],
      friendlyCount: 0,
      enemyCount: 0,
      allTeamSidesKnown: true,
    };
    for (i = 0; i < snapshot.candidates.length; i += 1) {
      candidate = snapshot.candidates[i];
      if (!candidate) {
        snapshot.allTeamSidesKnown = false;
        continue;
      }
      rankState = ReadTopBarCandidateEvidence(candidate);
      key =
        candidate.uid ||
        String(candidate.index) + "|" + String(candidate.nameNorm || "");
      if (key && !seen[key]) {
        seen[key] = true;
        snapshot.topbarCount += 1;
        if (rankState.loaded) snapshot.loadedCount += 1;
      }
      teamSide = candidate.teamSide || "";
      if (teamSide === "friendly" || teamSide === "enemy") {
        snapshot.teamSideCandidates[teamSide].push(candidate);
        if (rankState.account && rankState.rankUrl) {
          if (teamSide === "friendly")
            AddUniqueTopBarSnapshotAccount(
              snapshot.friendlyAccounts,
              friendlySeen,
              rankState.account,
            );
          else
            AddUniqueTopBarSnapshotAccount(
              snapshot.enemyAccounts,
              enemySeen,
              rankState.account,
            );
        }
      } else {
        snapshot.allTeamSidesKnown = false;
      }
      nameNorm = candidate.nameNorm || "";
      if (!nameNorm) continue;
      entry = snapshot.nameMap[nameNorm];
      if (entry) {
        entry.count += 1;
        entry.candidate = null;
        snapshot.duplicateNames[nameNorm] = true;
        continue;
      }
      snapshot.nameMap[nameNorm] = { count: 1, candidate: candidate };
      snapshot.uniqueNameCount += 1;
    }
    snapshot.friendlyCount = snapshot.friendlyAccounts.length;
    snapshot.enemyCount = snapshot.enemyAccounts.length;
    snapshot.readiness = CreateTopBarSnapshotReadiness(snapshot);
    return snapshot;
  }

  function TopBarCandidateStoreSnapshotForCandidates(root, candidates) {
    var docRoot = root ? GetDocumentRoot(root) : null;
    if (!candidates) return ReadTopBarCandidateSnapshot(docRoot);
    if (
      IsPanelValid(docRoot) &&
      state.topBarCandidateCacheRoot === docRoot &&
      state.topBarCandidateCache === candidates
    )
      return ReadTopBarCandidateSnapshot(docRoot);
    if (
      state.topBarCandidateCache === candidates &&
      state.topBarCandidateSnapshot &&
      state.topBarCandidateSnapshot.candidates === candidates &&
      state.topBarCandidateSnapshotRankRevision === state.topBarCandidateRankRevision
    )
      return state.topBarCandidateSnapshot;
    return CreateTopBarCandidateSnapshot(
      candidates,
      state.topBarCandidateStructuralGeneration,
    );
  }

  function ReadTopBarCandidateSnapshot(root, forceRefresh) {
    var docRoot = GetDocumentRoot(root);
    var candidates = TopBarCandidateStoreRead(docRoot, forceRefresh);
    var cached =
      !forceRefresh && state.topBarCandidateSnapshotRoot === docRoot
        ? state.topBarCandidateSnapshot
        : null;
    var snapshot;
    if (
      cached &&
      cached.candidates === candidates &&
      state.topBarCandidateSnapshotRankRevision === state.topBarCandidateRankRevision
    )
      return cached;
    snapshot = CreateTopBarCandidateSnapshot(
      candidates,
      state.topBarCandidateStructuralGeneration,
    );
    if (IsPanelValid(docRoot)) {
      state.topBarCandidateSnapshotRoot = docRoot;
      state.topBarCandidateSnapshot = snapshot;
      state.topBarCandidateSnapshotRankRevision = state.topBarCandidateRankRevision;
    }
    return snapshot;
  }


  function FindUniqueTopBarInSnapshot(snapshot, nameNorm) {
    var entry = snapshot && snapshot.nameMap ? snapshot.nameMap[nameNorm] : null;
    return {
      candidate: entry && entry.count === 1 ? entry.candidate : null,
      count: entry ? entry.count : 0,
      total: snapshot && snapshot.candidates ? snapshot.candidates.length : 0
    };
  }

  function FindUniqueTopBarInCandidates(candidates, nameNorm) {
    if (!candidates || !nameNorm)
      return {
        candidate: null,
        count: 0,
        total: candidates ? candidates.length : 0,
      };
    return FindUniqueTopBarInSnapshot(
      TopBarCandidateStoreSnapshotForCandidates(null, candidates),
      nameNorm
    );
  }

  var FindUniqueTopBarByName = function(root, nameNorm) { return FindUniqueTopBarInSnapshot(
    ReadTopBarCandidateSnapshot(root),
    nameNorm
  ); };

  function CreateEmptyTopBarEvidence() { return {
    account: "",
    rankUrl: "",
    steamid3: "",
    steam64: "",
    accountVersion: "",
    verified: false,
    loaded: false,
    ready: false,
    reason: "missing_image_account",
  }; }

  function ApplyTopBarEvidenceToCandidate(candidate, rankState) { if (!candidate) return rankState;
  candidate.account = rankState.account || "";
  candidate.rankUrl = rankState.rankUrl || "";
  candidate.steamid3 = rankState.steamid3 || "";
  candidate.steam64 = rankState.steam64 || "";
  candidate.accountVersion = rankState.account
    ? rankState.accountVersion || CACHE_VERSION
    : "";
  candidate.loadedAccount = rankState.loaded ? rankState.account : "";
  candidate.rankReady = !!rankState.ready;
  candidate.rankLoaded = !!rankState.loaded;
  candidate.rankVerified = !!rankState.verified;
  candidate.rankReason = rankState.reason || "";
  return rankState; }

  function ReadTopBarPanelEvidence(panel) {
    return {
      accountText: GetPanelAttribute(panel, "showrank_account_id", ""),
      accountVersion: GetPanelAttribute(panel, "showrank_account_version", ""),
      rankUrl: GetPanelAttribute(panel, "showrank_rank_url", ""),
      steamid3: GetPanelAttribute(panel, "showrank_steamid3", ""),
      steam64: GetPanelAttribute(panel, "showrank_steam64", ""),
    };
  }

  function ClassifyTopBarEvidenceFacts(input) { input = input || {};
  function text(value) {
    return value === undefined || value === null ? "" : String(value);
  }
  function empty(reason) {
    return {
      account: "",
      rankUrl: "",
      steamid3: "",
      steam64: "",
      accountVersion: "",
      verified: false,
      loaded: false,
      ready: false,
      reason: reason,
    };
  }
  var cachedAccount = text(input.cachedAccount);
  var cachedRankUrl = text(input.cachedRankUrl);
  var cachedSteamid3 = text(input.cachedSteamid3);
  var cachedSteam64 = text(input.cachedSteam64);
  var cachedAccountVersion = text(input.cachedAccountVersion);
  var imageAccount = text(input.imageAccount);
  var imageRankUrl = text(input.imageRankUrl);
  var imageAccountVersion = text(input.imageAccountVersion);
  var rootAccount = text(input.rootAccount);
  var expectedRankUrl = text(input.expectedRankUrl);
  var expectedCacheVersion = text(input.expectedCacheVersion);
  var hasVisibleClass = !!input.hasVisibleClass;
  var loaded;
  var cachedVersionMatches =
    !!expectedCacheVersion && cachedAccountVersion === expectedCacheVersion;
  if (input.cachedIdentityVerified === true && cachedAccount && cachedVersionMatches) {
    loaded = !!(
      cachedRankUrl &&
      expectedRankUrl &&
      cachedRankUrl === expectedRankUrl &&
      hasVisibleClass
    );
    return {
      account: cachedAccount,
      rankUrl: cachedRankUrl,
      steamid3: cachedSteamid3,
      steam64: cachedSteam64,
      accountVersion: cachedAccountVersion,
      verified: true,
      loaded: loaded,
      ready: loaded,
      reason: loaded ? "loaded" : "cached_not_loaded",
    };
  }
  if (imageAccount && rootAccount && imageAccount !== rootAccount)
    return empty("split_brain");
  if (!imageAccount) return empty("missing_image_account");
  if (imageAccountVersion && imageAccountVersion !== expectedCacheVersion)
    return empty("stale_account_version");
  loaded = !!(
    imageRankUrl &&
    expectedRankUrl &&
    imageRankUrl === expectedRankUrl &&
    hasVisibleClass
  );
  return {
    account: imageAccount,
    rankUrl: imageRankUrl,
    steamid3: "",
    steam64: "",
    accountVersion: imageAccountVersion,
    verified: true,
    loaded: loaded,
    ready: loaded,
    reason: loaded ? "loaded" : "verified_not_loaded",
  }; }

  function ReadTopBarCandidateEvidence(candidate) { var rankState = CreateEmptyTopBarEvidence();
  var imageEvidence;
  var rootEvidence;
  var imageAccount;
  var rootAccount;
  var cachedAccount;
  var expectedAccount;
  if (!candidate) return rankState;
  if (
    candidate.accountVersion === CACHE_VERSION &&
    candidate.account &&
    (candidate.steamid3 || candidate.steam64)
  ) {
    cachedAccount = VerifyAccountIdentity(
      candidate.account,
      candidate.steamid3 || "",
      candidate.steam64 || "",
    );
    if (cachedAccount) {
      rankState = ClassifyTopBarEvidenceFacts({
        cachedAccount: cachedAccount,
        cachedRankUrl: candidate.rankUrl || "",
        cachedSteamid3: candidate.steamid3 || "",
        cachedSteam64: candidate.steam64 || "",
        cachedAccountVersion: CACHE_VERSION,
        cachedIdentityVerified: true,
        expectedCacheVersion: CACHE_VERSION,
        expectedRankUrl: BuildRankImageUrl(cachedAccount),
        hasVisibleClass: HasClass(candidate.image, TOPBAR_VISIBLE_CLASS),
      });
      return ApplyTopBarEvidenceToCandidate(candidate, rankState);
    }
  }
  imageEvidence = ReadTopBarPanelEvidence(candidate.image);
  rootEvidence = ReadTopBarPanelEvidence(candidate.root);
  imageAccount = VerifyAccountIdentity(
    imageEvidence.accountText,
    imageEvidence.steamid3,
    imageEvidence.steam64,
  );
  rootAccount = VerifyAccountIdentity(
    rootEvidence.accountText,
    rootEvidence.steamid3,
    rootEvidence.steam64,
  );
  expectedAccount = imageAccount || rootAccount || "";
  rankState = ClassifyTopBarEvidenceFacts({
    imageAccount: imageAccount,
    imageRankUrl: imageEvidence.rankUrl,
    imageAccountVersion: imageEvidence.accountVersion,
    rootAccount: rootAccount,
    expectedCacheVersion: CACHE_VERSION,
    expectedRankUrl: expectedAccount
      ? BuildRankImageUrl(expectedAccount)
      : "",
    hasVisibleClass: HasClass(candidate.image, TOPBAR_VISIBLE_CLASS),
  });
  if (rankState.account && imageAccount === rankState.account) {
    rankState.steamid3 = imageEvidence.steamid3 || "";
    rankState.steam64 = imageEvidence.steam64 || "";
  }
  return ApplyTopBarEvidenceToCandidate(candidate, rankState); }

  function ReadTopBarAccount(candidate) {
    return ReadTopBarCandidateEvidence(candidate).account;
  }

  function FindOtherTopBarWithAccount(candidate, accountId, candidates) {
    var account = NormalizeAccountId(accountId);
    var topbarCandidates;
    var i;
    var otherAccount;
    if (!candidate || !account) return null;
    topbarCandidates =
      candidates && candidates.length
        ? candidates
        : ReadTopBarCandidateSnapshot(GetDocumentRoot(candidate.root)).candidates;
    for (i = 0; i < topbarCandidates.length; i += 1) {
      if (
        topbarCandidates[i].image === candidate.image ||
        topbarCandidates[i].root === candidate.root
      )
        continue;
      if (
        candidate.uid &&
        topbarCandidates[i].uid &&
        candidate.uid === topbarCandidates[i].uid
      )
        continue;
      otherAccount =
        topbarCandidates[i].account ||
        ReadTopBarCandidateEvidence(topbarCandidates[i]).account;
      if (otherAccount !== account) continue;
      return topbarCandidates[i];
    }
    return null;
  }

  function ReadTopBarRankUrl(candidate) {
    return ReadTopBarCandidateEvidence(candidate).rankUrl;
  }

  function TopBarHasRankForAccount(candidate, accountId) {
    var account = NormalizeAccountId(accountId);
    var rankState = ReadTopBarCandidateEvidence(candidate);
    return !!(
      account &&
      rankState.account === account &&
      rankState.loaded
    );
  }

  function DetectTopBarTeamSide(panel) {
    var current = IsPanelValid(panel) ? panel : null;
    var guard = 0;
    var id;
    var stored;
    stored = GetPanelAttribute(panel, "showrank_team_side", "");
    if (stored === "friendly" || stored === "enemy") return stored;
    while (IsPanelValid(current) && guard < 32) {
      id = GetPanelId(current);
      if (id === "TeamFriendly") {
        SetPanelAttribute(panel, "showrank_team_side", "friendly");
        return "friendly";
      }
      if (id === "TeamEnemy") {
        SetPanelAttribute(panel, "showrank_team_side", "enemy");
        return "enemy";
      }
      current = GetParent(current);
      guard += 1;
    }
    return "";
  }

  var TEAM_AVERAGE_IMAGE_ATTRS = [
    ["showrank_team_average_url", "url"],
    ["showrank_team_average_accounts", "accounts"],
    ["showrank_team_average_version", "version"],
  ];
  var PLAYER_LIST_RANK_IMAGE_ATTRS = [
    ["showrank_player_list_rank_url", "url"],
    ["showrank_player_list_rank_account", "account"],
    ["showrank_player_list_rank_version", "version"],
  ];


  var TrySetImage = function(panel, url) { try {
    if (!IsPanelValid(panel) || typeof panel.SetImage !== "function")
      return false;
    panel.SetImage(url || "");
    return true;
  } catch (e0) {}
  return false; };

  function ApplyRankImagePanel(panel, url, visibleClass, attrs, values) {
    var urlAttr = (attrs && attrs[0] && attrs[0][0]) || "";
    if (!urlAttr || GetPanelAttribute(panel, urlAttr, "") !== url)
      if (!TrySetImage(panel, url)) return false;
    WriteAttrSpecs(panel, attrs, values, false);
    AddClass(panel, visibleClass);
    return true;
  }

  var ClearRankImagePanel = function(panel, visibleClass, attrs, values, clearMissing) { var storedUrl;
  var wasVisible;
  if (!IsPanelValid(panel)) return false;
  storedUrl = GetPanelAttribute(panel, (attrs && attrs[0] && attrs[0][0]) || "url", "");
  wasVisible = HasClass(panel, visibleClass);
  if (storedUrl || wasVisible) TrySetImage(panel, "");
  RemoveClass(panel, visibleClass);
  WriteAttrSpecs(panel, attrs, values || {}, !!clearMissing);
  return true; };

  var FindTeamAverageImage = function(root, side) {
    var docRoot = GetDocumentRoot(root);
    var key = "";
    var id = "";
    if (side === "friendly") {
      key = "__showRankAverageFriendlyImage";
      id = "ShowRankAverageFriendlyImage";
    } else if (side === "enemy") {
      key = "__showRankAverageEnemyImage";
      id = "ShowRankAverageEnemyImage";
    } else {
      return null;
    }
    return FindChildCached(docRoot, key, id);
  };

  var HideTeamAverageImage = function(root, side) { var image = FindTeamAverageImage(root, side);
  var values;
  if (!IsPanelValid(image)) return;
  values = ReadAttrSpecs(image, TEAM_AVERAGE_IMAGE_ATTRS);
  if (
    !values.url &&
    !values.accounts &&
    values.version === CACHE_VERSION &&
    !HasClass(image, TEAM_AVERAGE_VISIBLE_CLASS)
  )
    return;
  ClearRankImagePanel(
    image,
    TEAM_AVERAGE_VISIBLE_CLASS,
    TEAM_AVERAGE_IMAGE_ATTRS,
    { url: "", accounts: "", version: CACHE_VERSION },
    false,
  ); };

  var HideAllTeamAverageImages = function(root) { HideTeamAverageImage(root, "friendly");
  HideTeamAverageImage(root, "enemy"); };

  var UpdateTeamAverageSide = function(root, sideCandidates, side, source) { var accounts = [];
  var seen = {};
  var i;
  var candidate;
  var evidence;
  var account;
  sideCandidates = sideCandidates || [];
  if (sideCandidates.length !== TEAM_AVERAGE_REQUIRED_ACCOUNTS) {
    HideTeamAverageImage(root, side);
    return false;
  }
  for (i = 0; i < sideCandidates.length; i += 1) {
    candidate = sideCandidates[i];
    evidence = null;
    if (!candidate.account || !candidate.rankUrl)
      evidence = ReadTopBarCandidateEvidence(candidate);
    account = candidate.account || (evidence && evidence.account) || "";
    if (
      !account ||
      seen[account] ||
      !(candidate.rankUrl || (evidence && evidence.rankUrl)) ||
      accounts.length >= TEAM_AVERAGE_REQUIRED_ACCOUNTS
    ) {
      HideTeamAverageImage(root, side);
      return false;
    }
    seen[account] = true;
    accounts.push(account);
  }
  return ApplyTeamAverageImage(
    root,
    side,
    accounts,
    source || "topbar_rank_update",
  ); };

  function ApplyTeamAverageImage(root, side, accounts, source) {
    var image = FindTeamAverageImage(root, side);
    var url = BuildTeamAverageImageUrl(accounts);
    if (!IsPanelValid(image)) return false;
    if (!url) {
      HideTeamAverageImage(root, side);
      return false;
    }
    if (
      GetPanelAttribute(image, "showrank_team_average_url", "") !== url ||
      GetPanelAttribute(image, "showrank_team_average_version", "") !==
        CACHE_VERSION
    )
      return ApplyRankImagePanel(
        image,
        url,
        TEAM_AVERAGE_VISIBLE_CLASS,
        TEAM_AVERAGE_IMAGE_ATTRS,
        {
          url: url,
          accounts: accounts.join(","),
          version: CACHE_VERSION,
        },
      );
    AddClass(image, TEAM_AVERAGE_VISIBLE_CLASS);
    return true;
  }

  function UpdateTeamAverageRanks(root, source, candidates) {
    var docRoot = GetDocumentRoot(root);
    var snapshot;
    var friendlyReady;
    var enemyReady;
    if (!IsPanelValid(docRoot)) return false;
    snapshot = candidates
      ? TopBarCandidateStoreSnapshotForCandidates(docRoot, candidates)
      : ReadTopBarCandidateSnapshot(docRoot);
    candidates = snapshot.candidates;
    if (candidates.length !== 12 || !snapshot.allTeamSidesKnown) {
      HideAllTeamAverageImages(docRoot);
      return false;
    }
    friendlyReady = UpdateTeamAverageSide(
      docRoot,
      snapshot.teamSideCandidates["friendly"],
      "friendly",
      source,
    );
    enemyReady = UpdateTeamAverageSide(
      docRoot,
      snapshot.teamSideCandidates["enemy"],
      "enemy",
      source,
    );
    return friendlyReady && enemyReady;
  }

  var ResolveRowKnownAccount = function(simTarget) {
    if (!simTarget || !simTarget.candidate) return null;
    if (
      simTarget.candidate.account &&
      simTarget.candidate.rankLoaded
    )
      return {
        account: simTarget.candidate.account,
        source: "topbar_rank_loaded",
      };
    return null;
  };

  var ApplyKnownRowAccountIfNeeded = function(simTarget, known, method, candidates) { if (!simTarget || !known || !known.account) return false;
  if (!simTarget.candidate) {
    if (simTarget.row)
      return ApplyPlayerListRowRankImage(
        simTarget.row,
        known.account,
        method || "known_row_topbar_loaded",
      );
    return false;
  }
  if (TopBarHasRankForAccount(simTarget.candidate, known.account))
    return false;
  return ApplyTopBarImage(
    simTarget.candidate,
    known.account,
    method || "known_row_topbar_loaded",
    candidates,
  ); };


  var TOPBAR_RANK_STATE_ATTRS = [
    ["showrank_account_id", "account"],
    ["showrank_rank_url", "rankUrl"],
    ["showrank_steamid3", "steamid3"],
    ["showrank_steam64", "steam64"],
    ["showrank_account_version", "accountVersion"],
    ["showrank_bound_name", "boundName"],
    ["showrank_bound_name_norm", "boundNameNorm"],
  ];

  function TopBarCandidateCacheAttributeChanged(key) {
    return (
      key === "showrank_account_id" ||
      key === "showrank_account_version" ||
      key === "showrank_rank_url" ||
      key === "showrank_steamid3" ||
      key === "showrank_steam64"
    );
  }


  // Top-Bar Rank and Status State
  var SetTopBarRankAttributes = function(candidate, key, value) { if (!candidate) return;
  if (TopBarCandidateCacheAttributeChanged(key))
    TopBarCandidateStoreMarkRankDirty(candidate.root || candidate.image);
  SetPanelAttribute(candidate.image, key, value);
  if (value && key.indexOf("showrank_account_") === 0) return;
  if (value && (key === "showrank_rank_url" || key.indexOf("showrank_steam") === 0))
    return;
  SetPanelAttribute(candidate.root, key, value); };

  var WriteTopBarAttrSpecs = function(candidate, attrs, values, clearMissing) { var i;
  var spec;
  if (!candidate) return;
  for (i = 0; attrs && i < attrs.length; i += 1) {
    spec = attrs[i];
    if (!clearMissing && (!values || values[spec[1]] === undefined))
      continue;
    SetTopBarRankAttributes(
      candidate,
      spec[0],
      AttrSpecValue(values, spec),
    );
  } };

  var WriteTopBarRankState = function(candidate, values, clearMissing) { WriteTopBarAttrSpecs(candidate, TOPBAR_RANK_STATE_ATTRS, values, clearMissing); };

  var FindTopBarStatusImage = function(candidate) { var status;
  if (!candidate || !IsPanelValid(candidate.root)) return null;
  try {
    status = candidate.root.__showRankTopBarStatusImage;
  } catch (e0) {
    status = null;
  }
  if (IsPanelValid(status)) return status;
  status = FindChild(candidate.root, "ShowRankTopBarStatusImage");
  try {
    if (IsPanelValid(status))
      candidate.root.__showRankTopBarStatusImage = status;
  } catch (e1) {}
  return IsPanelValid(status) ? status : null; };


  var SetTopBarStatusImage = function(candidate, mode, source, token) { var status = FindTopBarStatusImage(candidate);
  var nextMode = String(mode || "");
  var loading = nextMode === "loading";
  var statusUrl = loading ? TOPBAR_LOADING_SPINNER_IMAGE_URL : TOPBAR_MISSING_RANK_IMAGE_URL;
  if (!IsPanelValid(status)) return false;
  AddClass(status, TOPBAR_STATUS_IMAGE_CLASS);
  if (nextMode === "hide") {
    RemoveClass(status, TOPBAR_STATUS_LOADING_CLASS);
    RemoveClass(status, TOPBAR_STATUS_VISIBLE_CLASS);
    SetPanelAttribute(status, "showrank_status_token", "");
    SetPanelVisible(status, false);
  } else {
    if (GetPanelAttribute(status, "showrank_status_url", "") !== statusUrl && TrySetImage(status, statusUrl))
      SetPanelAttribute(status, "showrank_status_url", statusUrl);
    SetPanelAttribute(status, "showrank_status_token", loading ? token || "" : "");
    if (loading) AddClass(status, TOPBAR_STATUS_LOADING_CLASS);
    else RemoveClass(status, TOPBAR_STATUS_LOADING_CLASS);
    AddClass(status, TOPBAR_STATUS_VISIBLE_CLASS);
    SetPanelVisible(status, true);
  }
  SetPanelAttribute(status, "showrank_status_mode", nextMode);
  return true; };


  var ClearTopBarLoadingStatusForCandidates = function(candidates, token) { var i;
  var status;
  var cleared = 0;
  if (!candidates) return 0;
  for (i = 0; i < candidates.length; i += 1) {
    if (!candidates[i]) continue;
    status = FindTopBarStatusImage(candidates[i]);
    if (
      !IsPanelValid(status) ||
      !HasClass(status, TOPBAR_STATUS_LOADING_CLASS)
    )
      continue;
    if (
      token &&
      GetPanelAttribute(status, "showrank_status_token", "") !== token
    )
      continue;
    if (SetTopBarStatusImage(candidates[i], "placeholder", "loading_timeout"))
      cleared += 1;
  }
  return cleared; };

  var ScheduleTopBarLoadingStatusTimeout = function(root, token, candidates) { var docRoot = GetDocumentRoot(root);
  var pendingKey;
  if (!IsPanelValid(docRoot) || !token) return false;
  pendingKey = token + "|status_timeout";
  if (
    GetPanelAttribute(docRoot, "showrank_status_timeout_pending", "") ===
    pendingKey
  )
    return true;
  SetPanelAttribute(docRoot, "showrank_status_timeout_pending", pendingKey);
  try {
    if (!$.Schedule) return false;
    $.Schedule(TOPBAR_LOADING_TIMEOUT_SECONDS, function () {
      var retryRoot = GetDocumentRoot(docRoot);
      if (!IsPanelValid(retryRoot)) return;
      if (
        GetPanelAttribute(
          retryRoot,
          "showrank_status_timeout_pending",
          "",
        ) === pendingKey
      ) {
        SetPanelAttribute(retryRoot, "showrank_status_timeout_pending", "");
        ClearTopBarLoadingStatusForCandidates(candidates, token);
      }
    });
    return true;
  } catch (e0) {}
  SetPanelAttribute(docRoot, "showrank_status_timeout_pending", "");
  return false; };

  var SetTopBarStatusForUnboundCandidates = function(candidates,
  mode,
  source,
  token,
  scheduleTimeout,) { var i;
  var count = 0;
  var root = null;
  if (!candidates) return 0;
  for (i = 0; i < candidates.length; i += 1) {
    if (!candidates[i] || candidates[i].account) continue;
    if (!root && IsPanelValid(candidates[i].root)) root = candidates[i].root;
    if (SetTopBarStatusImage(candidates[i], mode, source, token)) count += 1;
  }
  if (scheduleTimeout && count > 0)
    ScheduleTopBarLoadingStatusTimeout(
      root || (candidates[0] && candidates[0].root),
      token,
      candidates,
    );
  return count; };

  var SetTopBarLoadingForCandidates = function(candidates, source) { var token = String(NowMs()) + "_" + String(source || "loading");
  return SetTopBarStatusForUnboundCandidates(
    candidates,
    "loading",
    source || "loading",
    token,
    true,
  ); };

  var SetTopBarPlaceholderForCandidates = function(candidates, source) { return SetTopBarStatusForUnboundCandidates(
    candidates,
    "placeholder",
    source || "placeholder",
    "",
    false,
  ); };


  var ClearTopBarRankPanelState = function(candidate) { var shouldClearImage;
  if (!candidate || !IsPanelValid(candidate.image)) return false;
  shouldClearImage = !!(
    ReadTopBarRankUrl(candidate) ||
    ReadTopBarAccount(candidate) ||
    HasClass(candidate.image, TOPBAR_VISIBLE_CLASS)
  );
  if (shouldClearImage) TrySetImage(candidate.image, "");
  RemoveClass(candidate.image, TOPBAR_VISIBLE_CLASS);
  WriteTopBarRankState(candidate, {}, true);
  candidate.account = "";
  SetTopBarStatusImage(candidate, "placeholder", "rank_clear");
  candidate.rankUrl = "";
  candidate.accountVersion = CACHE_VERSION;
  return true; };

  function ClearTopBarRankState(candidate, reason, skipRefresh) {
    if (!ClearTopBarRankPanelState(candidate)) return false;
    ClearShowRankRuntimeIdle(
      candidate.root || candidate.image,
      reason || "topbar_rank_state_clear",
    );
    if (
      reason === "topbar_name_changed" ||
      reason === "topbar_bound_name_changed"
    ) {
      ClearShowRankTransientState(
        candidate.root || candidate.image,
        true,
      );
      TopBarCandidateStoreInvalidate(candidate.root || candidate.image);
    } else {
      TopBarCandidateStoreMarkRankDirty(candidate.root || candidate.image);
    }
    if (!skipRefresh)
      UpdateTeamAverageRanks(
        candidate.root || candidate.image,
        reason || "topbar_rank_state_clear",
      );
    return true;
  }

  function BuildManualTargetRowKey(candidate, nameNorm) {
    if (!candidate || !nameNorm) return "";
    return (
      String(candidate.uid || candidate.index || "") +
      "|" +
      String(nameNorm || "")
    );
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

  function StoreDirectManualTargetRow(row, name, nameNorm, source, token) {
    var key;
    var entry;
    if (!IsPanelValid(row) || !nameNorm) return false;
    if (!state.manualTargetRows) state.manualTargetRows = {};
    entry = {
      row: row,
      name: name || "",
      nameNorm: nameNorm,
      at: NowMs(),
      source: source || "players_list_activate",
      direct: true,
    };
    key = token || "direct_row_" + String(entry.at);
    state.manualTargetRows[String(key)] = entry;
    return true;
  }

  function ManualTargetRowMatchesProfile(profile, row, nameNorm) {
    var rowNorm;
    if (!profile || !IsPanelValid(row) || !nameNorm) return false;
    rowNorm = NormalizeName(ReadRowName(row));
    if (!rowNorm || rowNorm !== nameNorm) return false;
    if (profile.norms && profile.norms.length)
      return ProfileHasNameNorm(profile, nameNorm);
    return true;
  }
  function RememberManualTargetEntry(seen, entry) {
    var i;
    if (!entry) return false;
    for (i = 0; i < seen.length; i += 1) {
      if (seen[i] === entry) return false;
    }
    seen.push(entry);
    return true;
  }

  function FindRecentManualTargetRow(profile) {
    var rowStore = state.manualTargetRows || {};
    var profileSeenAt =
      profile && Number(profile.seenAt) ? Number(profile.seenAt) : NowMs();
    var seen = [];
    var best = null;
    var key;
    var entry;
    var age;
    for (key in rowStore) {
      if (!Object.prototype.hasOwnProperty.call(rowStore, key)) continue;
      entry = rowStore[key];
      if (!RememberManualTargetEntry(seen, entry)) continue;
      if (!IsPanelValid(entry.row)) continue;
      age = profileSeenAt - Number(entry.at || 0);
      if (!isFinite(age) || age < 0 || age > MANUAL_TARGET_TTL_MS) continue;
      if (!ManualTargetRowMatchesProfile(profile, entry.row, entry.nameNorm))
        continue;
      if (!best || Number(entry.at || 0) > Number(best.at || 0)) best = entry;
    }
    return best && IsPanelValid(best.row) ? best.row : null;
  }

  function ApplyRecentManualTargetRow(profile, source) {
    var row = FindRecentManualTargetRow(profile);
    if (!row || !profile || !profile.account) return false;
    if (
      !ApplyPlayerListRowRankImage(
        row,
        profile.account,
        (source || "manual_target") + "_player_list_direct",
      )
    )
      return false;
    state.manualTargetRows = {};
    return true;
  }

  var MANUAL_TARGET_ATTRS = [
    ["showrank_manual_target_token", "token"],
    ["showrank_manual_target_name", "name"],
    ["showrank_manual_target_name_norm", "nameNorm"],
    ["showrank_manual_target_topbar_index", "topbarIndex"],
    ["showrank_manual_target_topbar_uid", "topbarUid"],
    ["showrank_manual_target_at", "at"],
    ["showrank_manual_target_source", "source"],
  ];

  function WriteManualTargetAttrs(candidate, values, clearMissing) {
    WriteTopBarAttrSpecs(candidate, MANUAL_TARGET_ATTRS, values, clearMissing);
  }


  function StoreManualTarget(candidate, name, nameNorm, source, token, row) {
    var at = NowMs();
    if (!candidate || !IsPanelValid(candidate.image) || !nameNorm) return false;
    WriteManualTargetAttrs(
      candidate,
      {
        token: token || "",
        name: name || "",
        nameNorm: nameNorm || "",
        topbarIndex: candidate.index,
        topbarUid: candidate.uid || "",
        at: at,
        source: source || "manual",
      },
      false,
    );
    StoreManualTargetRow(candidate, nameNorm, token || "", row);
    return true;
  }

  function ClearManualTarget(candidate) {
    if (!candidate || !IsPanelValid(candidate.image)) return false;
    WriteManualTargetAttrs(candidate, {}, true);
    return true;
  }

  function ReadManualTarget(candidate) {
    var rawAt;
    var at;
    var nameNorm;
    var token;
    function readAttr(key) {
      var attr = AttrSpecNameForKey(MANUAL_TARGET_ATTRS, key);
      return attr && attr !== key
        ? GetPanelAttribute(candidate.image, attr, "") ||
            GetPanelAttribute(candidate.root, attr, "")
        : "";
    }
    if (!candidate || !IsPanelValid(candidate.image)) return null;
    nameNorm = readAttr("nameNorm");
    rawAt = readAttr("at");
    at = Number(rawAt || 0);
    if (!nameNorm || !isFinite(at) || at <= 0) return null;
    token = readAttr("token");
    return {
      candidate: candidate,
      token: token,
      name: readAttr("name"),
      nameNorm: nameNorm,
      topbarIndex: candidate.index,
      topbarUid: readAttr("topbarUid") || candidate.uid || "",
      at: at,
      source: readAttr("source"),
      row: ReadManualTargetRow(candidate, nameNorm, token),
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
    var profileSeenAt =
      profile && Number(profile.seenAt) ? Number(profile.seenAt) : now;
    var best = null;
    var i;
    var target;
    var age;
    for (i = 0; i < candidates.length; i += 1) {
      target = ReadManualTarget(candidates[i]);
      if (!target) continue;
      age = profileSeenAt - target.at;
      if (!isFinite(age) || age < 0 || age > MANUAL_TARGET_TTL_MS) continue;
      if (target.candidate.nameNorm && target.candidate.nameNorm !== target.nameNorm)
        continue;
      if (!best || target.at > best.at) best = target;
    }
    if (!best) return null;
    if (
      profile.norms &&
      profile.norms.length &&
      ProfileHasNameNorm(profile, best.nameNorm)
    )
      return { candidate: best.candidate, method: "manual_token", row: best.row };
    return null;
  }

  function BeginTopBarBatch(root) {
    state.topBarBatchDepth = Number(state.topBarBatchDepth || 0) + 1;
    state.topBarBatchRoot = GetDocumentRoot(root);
    state.topBarBatchDirty = false;
  }

  function MarkTopBarBatchDirty(root) {
    if (Number(state.topBarBatchDepth || 0) <= 0) return;
    state.topBarBatchDirty = true;
    if (!IsPanelValid(state.topBarBatchRoot))
      state.topBarBatchRoot = GetDocumentRoot(root);
  }




  function EndTopBarBatch(
    root,
    source,
    loaded,
    blocked,
    rows,
    topbarCount,
    deferReadyCheck,
  ) {
    var docRoot = GetDocumentRoot(root || state.topBarBatchRoot);
    var candidates = null;
    var counts;
    var wasDirty = state.topBarBatchDirty;
    state.topBarBatchDepth = Math.max(
      0,
      Number(state.topBarBatchDepth || 0) - 1,
    );
    if (state.topBarBatchDepth > 0) return false;
    if (
      wasDirty ||
      topbarCount === undefined ||
      topbarCount === null
    )
      candidates = ReadTopBarCandidateSnapshot(docRoot).candidates;
    counts = {
      rows: rows,
      topbarCount: topbarCount,
    };
    if (counts.topbarCount === undefined || counts.topbarCount === null)
      counts.topbarCount = candidates
        ? candidates.length
        : ReadTopBarCandidateSnapshot(docRoot).candidates.length;
    if (counts.rows === undefined || counts.rows === null)
      counts.rows = FindPlayerListRows(docRoot).length;
    counts.rows = Number(counts.rows || 0);
    if (wasDirty)
      UpdateTeamAverageRanks(docRoot, source || "topbar_batch", candidates);
    if (loaded || !wasDirty) {
      UpdateEscapePrompt(
        docRoot,
        Number(loaded || 0),
        Number(blocked || 0),
        counts.rows,
        counts.topbarCount,
      );
    } else {
      var snapshot = TopBarCandidateStoreSnapshotForCandidates(docRoot, candidates);
      UpdateEscapePrompt(
        docRoot,
        snapshot.loadedCount,
        Number(blocked || 0),
        counts.rows,
        snapshot.topbarCount,
      );
    }
    if (wasDirty && !deferReadyCheck && !HasShowRankRuntimeIdle(docRoot))
      ScheduleTopBarReadyCheck(docRoot, source || "topbar_batch");
    state.topBarBatchRoot = null;
    state.topBarBatchDirty = false;
    return !!wasDirty;
  }

  function ResolveStoredTopBarAccountConflict(candidate, stored, account, methodName) {
    if (!stored || stored === account) return true;
    if (methodName === "sim_active_verified_account") {
      ClearTopBarRankState(candidate, "sim_active_override_stored_account");
      return true;
    }
    if (methodName.indexOf("manual_token") !== 0) return false;
    ClearTopBarRankState(candidate, "manual_token_override_stored_account");
    return true;
  }

  function MethodCanClearDuplicateTopBarAccount(methodName) {
    return methodName.indexOf("manual_token") === 0;
  }

  function ResolveDuplicateTopBarAccount(candidate, account, methodName, candidates) {
    var duplicate = FindOtherTopBarWithAccount(candidate, account, candidates);
    if (!duplicate) return true;
    if (!MethodCanClearDuplicateTopBarAccount(methodName)) return false;
    ClearTopBarRankState(duplicate, "duplicate_account_other_topbar", true);
    return true;
  }

  function RefreshTopBarAfterRankCommit(candidate, method, candidates) {
    var root = candidate.root || candidate.image;
    var rankState;
    if (candidates)
      TopBarCandidateStoreUpsert(root, candidates, candidate);
    else TopBarCandidateStoreInvalidate(root);
    MarkShowRankMatchActiveIfHudActive(root, method || "topbar_rank_image_set");
    if (Number(state.topBarBatchDepth || 0) > 0) {
      MarkTopBarBatchDirty(root);
      return;
    }
    rankState = TopBarCandidateStoreSnapshotForCandidates(root, candidates);
    UpdateTeamAverageRanks(root, method || "topbar_rank_image_set", candidates);
    UpdateEscapePrompt(
      root,
      rankState.loadedCount,
      0,
      FindPlayerListRows(root).length,
      rankState.topbarCount,
    );
    ScheduleTopBarReadyCheck(root, method || "topbar_rank_image_set");
  }

  function CommitTopBarRankImage(candidate, account, url, method, candidates) {
    var steamid3 = BuildSteamId3(account);
    var steam64 = BuildSteam64(account);
    var status;
    try {
      if (typeof candidate.image.SetImage !== "function")
        throw "SetImage_missing";
      candidate.image.SetImage(url);
      AddClass(candidate.image, TOPBAR_VISIBLE_CLASS);
      SetPanelVisible(candidate.image, true);
      status = FindTopBarStatusImage(candidate);
      if (
        IsPanelValid(status) &&
        !(
          HasClass(status, TOPBAR_STATUS_LOADING_CLASS) &&
          GetPanelAttribute(status, "showrank_status_token", "")
        )
      )
        SetTopBarStatusImage(candidate, "hide", method || "rank_image_set");
      WriteTopBarRankState(
        candidate,
        {
          account: account,
          rankUrl: url,
          steamid3: steamid3,
          steam64: steam64,
          accountVersion: CACHE_VERSION,
          boundName: candidate.name || "",
          boundNameNorm: candidate.nameNorm || "",
        },
        false,
      );
      if (candidate.uid)
        SetTopBarRankAttributes(
          candidate,
          "showrank_topbar_uid",
          candidate.uid,
        );
      candidate.account = account;
      candidate.rankUrl = url;
      candidate.accountVersion = CACHE_VERSION;
      candidate.steamid3 = steamid3;
      candidate.steam64 = steam64;
      RefreshTopBarAfterRankCommit(candidate, method, candidates);
      return true;
    } catch (e0) {}
    return false;
  }

  function ApplyTopBarImage(candidate, accountId, method, candidates) {
    var account = NormalizeAccountId(accountId);
    var url = BuildRankImageUrl(account);
    var rankState;
    var stored;
    var storedUrl;
    var methodName = String(method || "");
    if (!candidate || !IsPanelValid(candidate.image) || !account || !url)
      return false;
    rankState = ReadTopBarCandidateEvidence(candidate);
    stored = rankState.account;
    if (
      !ResolveStoredTopBarAccountConflict(candidate, stored, account, methodName)
    )
      return false;
    if (!ResolveDuplicateTopBarAccount(candidate, account, methodName, candidates))
      return false;
    storedUrl = rankState.rankUrl;
    if (stored === account && storedUrl === url && rankState.loaded)
      return true;
    return CommitTopBarRankImage(candidate, account, url, method, candidates);
  }

  function BuildProfileTopBarSelection(candidate, method, manualMatch) {
    return { candidate: candidate, method: method, manualMatch: manualMatch };
  }

  function SelectProfileAccountCandidate(candidates, profile) {
    var i;
    for (i = 0; i < candidates.length; i += 1) {
      if (candidates[i].account && candidates[i].account === profile.account)
        return BuildProfileTopBarSelection(candidates[i], "account", null);
    }
    return null;
  }


  function SelectProfileHoverCandidate(candidates, profile) {
    var i;
    if (!state.hoverToken) return null;
    for (i = 0; profile.norms && i < profile.norms.length; i += 1) {
      if (state.hoverToken.nameNorm === profile.norms[i])
        return BuildProfileTopBarSelection(
          state.hoverToken.candidate,
          "manual_hover_token",
          null,
        );
    }
    return null;
  }


  function SelectProfileTopBarCandidate(candidates, profile) {
    var manualMatch = FindRecentManualTargetCandidate(candidates, profile);
    if (manualMatch && manualMatch.candidate)
      return BuildProfileTopBarSelection(
        manualMatch.candidate,
        manualMatch.method,
        manualMatch,
      );
    return (
      SelectProfileAccountCandidate(candidates, profile) ||
      SelectProfileHoverCandidate(candidates, profile)
    );
  }

  function ApplyProfileTopBarSideEffects(root, selected, profile, method, manualMatch) {
    if (method.indexOf("manual_token") === 0) ClearManualTarget(selected);

    if (manualMatch && manualMatch.row && method.indexOf("manual_token") === 0)
      ApplyPlayerListRowRankImage(
        manualMatch.row,
        profile.account,
        method + "_player_list",
      );
  }

  function ApplyProfileToTopBar(profile) {
    var root = GetDocumentRoot(profile.root);
    var candidates = ReadTopBarCandidateSnapshot(root).candidates;
    var selection = SelectProfileTopBarCandidate(candidates, profile);
    if (!selection || !selection.candidate) return false;
    if (
      !ApplyTopBarImage(
        selection.candidate,
        profile.account,
        selection.method,
        candidates,
      )
    )
      return false;
    ApplyProfileTopBarSideEffects(
      root,
      selection.candidate,
      profile,
      selection.method,
      selection.manualMatch,
    );
    return true;
  }

  // Active Profile Open Simulation
  function FindTopBarOpenTarget(candidate) {
    var target;
    if (!candidate || !IsPanelValid(candidate.root)) return null;
    target = FindChild(candidate.root, "PlayerDetailsContainer");
    if (IsPanelValid(target)) return target;
    target = FindChild(candidate.root, "PlayerNameNWContainer");
    if (IsPanelValid(target)) return target;
    return candidate.root;
  }

  function BuildSimTargetFromTopBarCandidate(root, candidate, sourceEvent) {
    var target;
    if (!candidate || !IsPanelValid(candidate.root) || !candidate.nameNorm)
      return null;
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
      sourceEvent: sourceEvent || "topbar_roster_next",
    };
  }

  function BuildSimTargetFromRosterMatch(root, rowMatch, sourceEvent) {
    if (!rowMatch || rowMatch.status !== "matched") return null;
    if (rowMatch.source === "topbar_only")
      return BuildSimTargetFromTopBarCandidate(
        root,
        rowMatch.candidate,
        sourceEvent || "topbar_roster_next",
      );
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
        sourceEvent: sourceEvent || "player_list_only_next",
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
      sourceEvent: sourceEvent || "roster_next",
    };
  }

  var ACTIVE_SIM_ATTRS = [
    ["showrank_sim_active_token", "token", ""],
    ["showrank_sim_active_row_name", "rowName", ""],
    ["showrank_sim_active_row_name_norm", "rowNameNorm", ""],
    ["showrank_sim_active_topbar_index", "topbarIndex", ""],
    ["showrank_sim_active_topbar_uid", "topbarUid", ""],
    ["showrank_sim_active_started_at", "startedAt", 0],
    ["showrank_sim_active_method", "method", ""],
    ["showrank_sim_active_target", "targetName", ""],
    ["showrank_sim_active_source", "source", ""],
  ];
  var ACTIVE_SIM_SHARED_RECORD = "showrank_sim_shared_record";


  function EnsureSharedActiveSimRecord(sharedRoot) {
    var record;
    if (!sharedRoot) return null;
    record = sharedRoot[ACTIVE_SIM_SHARED_RECORD];
    if (!record) {
      record = { active: null, completedToken: "" };
      sharedRoot[ACTIVE_SIM_SHARED_RECORD] = record;
    }
    return record;
  }

  function StoreActiveSimOpen(root, active) {
    var match;
    var record = {};
    var i;
    var spec;
    if (!active) return;
    if (active.candidate && !active.topbarUid)
      active.topbarUid = active.candidate.uid || "";
    else if (!active.candidate && active.rowNameNorm) {
      match = FindUniqueTopBarByName(root || active.root, active.rowNameNorm);
      if (match && match.candidate) {
        active.candidate = match.candidate;
        if (!active.topbarUid) active.topbarUid = match.candidate.uid || "";
      }
    }
    state.activeSimOpen = active;
    WriteAttrSpecs(root || active.root, ACTIVE_SIM_ATTRS, active, true);
    for (i = 0; i < ACTIVE_SIM_ATTRS.length; i += 1) {
      spec = ACTIVE_SIM_ATTRS[i];
      record[spec[1]] = AttrSpecValue(active, spec);
    }
    ForEachSharedStore(function (sharedRoot) {
      try {
        EnsureSharedActiveSimRecord(sharedRoot).active = record;
      } catch (e0) {}
    });
  }

  function BuildActiveSimFromAttrs(
    source,
    token,
    rowName,
    rowNameNorm,
    topbarIndex,
    topbarUid,
    startedAt,
    method,
    targetName,
    openSource,
  ) {
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
      storageSource: source || "",
    };
  }

  function ActiveSimFromValues(source, values) {
    if (!values) return null;
    return BuildActiveSimFromAttrs(
      source,
      values["token"],
      values["rowName"],
      values["rowNameNorm"],
      values["topbarIndex"],
      values["topbarUid"],
      values["startedAt"],
      values["method"],
      values["targetName"],
      values["source"],
    );
  }


  function ActiveSimBelongsToRoot(root, active) {
    var docRoot = GetDocumentRoot(root);
    var candidateRoot;
    if (!active || !active.candidate || !IsPanelValid(active.candidate.root))
      return true;
    candidateRoot = GetDocumentRoot(active.candidate.root);
    return (
      !IsPanelValid(docRoot) ||
      !IsPanelValid(candidateRoot) ||
      candidateRoot === docRoot
    );
  }

  function ActiveSimForRoot(root, active) {
    if (!active || !ActiveSimBelongsToRoot(root, active)) return null;
    if (SourceHasPrefix(active.storageSource, "shared:")) {
      if (!active.candidate)
        active.candidate = ResolveActiveSimCandidate(root, active);
      if (!active.candidate) return null;
    }
    return active;
  }

  function ReadActiveSimOpen(root) {
    var now = NowMs();
    var best = ActiveSimForRoot(root, state.activeSimOpen);
    var active;
    active = ActiveSimForRoot(
      root,
      ActiveSimFromValues("root_attr", ReadAttrSpecs(root, ACTIVE_SIM_ATTRS)),
    );
    if (active && (!best || active.startedAt > best.startedAt)) best = active;
    ForEachSharedStore(function (sharedRoot, sharedName) {
      if (!sharedRoot) return;
      active = ActiveSimForRoot(
        root,
        ActiveSimFromValues(
          "shared:" + sharedName,
          sharedRoot[ACTIVE_SIM_SHARED_RECORD] &&
            sharedRoot[ACTIVE_SIM_SHARED_RECORD].active,
        ),
      );
      if (active && (!best || active.startedAt > best.startedAt)) best = active;
    });
    if (!best) return null;
    if (
      Number(now) - Number(best.startedAt || 0) < 0 ||
      Number(now) - Number(best.startedAt || 0) > SIM_ACTIVE_TTL_MS
    )
      return null;
    return best;
  }

  function IsVerifiedRosterActive(active) {
    if (!active) return false;
    return (
      active.source === "verified_roster_next" &&
      active.method === DEFAULT_VERIFIED_SIM_METHOD &&
      (active.targetName === DEFAULT_VERIFIED_SIM_TARGET ||
        active.targetName === TOPBAR_VERIFIED_SIM_TARGET)
    );
  }

  function ActiveCandidateMatches(active, candidate, activeIndex, activeUid) {
    if (!candidate || !IsPanelValid(candidate.root)) return false;
    if (activeUid && String(candidate.uid || "") !== activeUid) return false;
    if (!activeUid && activeIndex && String(candidate.index) !== activeIndex)
      return false;
    if (
      active.rowNameNorm &&
      candidate.nameNorm &&
      candidate.nameNorm !== active.rowNameNorm
    )
      return false;
    return true;
  }

  function ResolveActiveSimCandidate(root, active) {
    var candidates;
    var i;
    var activeIndex = String(
      active && active.topbarIndex !== undefined && active.topbarIndex !== null
        ? active.topbarIndex
        : "",
    );
    var activeUid = String(active && active.topbarUid ? active.topbarUid : "");
    var match;
    if (!active) return null;
    if (active.candidate) {
      if (ActiveCandidateMatches(active, active.candidate, activeIndex, activeUid))
        return active.candidate;
      active.candidate = null;
    }
    candidates = ReadTopBarCandidateSnapshot(root).candidates;
    if (activeUid) {
      for (i = 0; i < candidates.length; i += 1) {
        if (ActiveCandidateMatches(active, candidates[i], activeIndex, activeUid))
          return candidates[i];
      }
    }
    if (activeIndex) {
      for (i = 0; i < candidates.length; i += 1) {
        if (ActiveCandidateMatches(active, candidates[i], activeIndex, ""))
          return candidates[i];
      }
    }
    if (active.rowNameNorm) {
      match = FindUniqueTopBarByName(root, active.rowNameNorm);
      if (match && match.candidate) return match.candidate;
    }
    return null;
  }


  function ClearActiveSimOpen(root, token) {
    if (!token || (state.activeSimOpen && state.activeSimOpen.token === token))
      state.activeSimOpen = null;
    WriteAttrSpecs(root, ACTIVE_SIM_ATTRS, {}, true);
    ForEachSharedStore(function (sharedRoot) {
      var record;
      try {
        record = sharedRoot[ACTIVE_SIM_SHARED_RECORD];
        if (
          token &&
          record &&
          record.active &&
          record.active.token &&
          record.active.token !== token
        )
          return;
        if (record) record.active = null;
      } catch (e0) {}
    });
  }

  function StoreCompletedSimToken(root, token) {
    if (!token) return;
    state.completedSimToken = token;
    SetPanelAttribute(root, "showrank_sim_completed_token", token);
    ForEachSharedStore(function (sharedRoot) {
      try {
        EnsureSharedActiveSimRecord(sharedRoot).completedToken = token;
      } catch (e0) {}
    });
  }

  function IsCompletedSimToken(root, token) {
    if (!token) return false;
    if (state.completedSimToken === token) return true;
    if (GetPanelAttribute(root, "showrank_sim_completed_token", "") === token)
      return true;
    var found = false;
    ForEachSharedStore(function (sharedRoot) {
      var record;
      if (found) return;
      try {
        record = sharedRoot[ACTIVE_SIM_SHARED_RECORD];
        if (record && record.completedToken === token) found = true;
      } catch (e0) {}
    });
    return found;
  }

  function SimAttemptList(simTarget) {
    var main;
    if (simTarget && simTarget.targetKind === "topbar") {
      return [
        {
          method: DEFAULT_VERIFIED_SIM_METHOD,
          targetName: TOPBAR_VERIFIED_SIM_TARGET,
          target: simTarget.target || FindTopBarOpenTarget(simTarget.candidate),
          eventName: "Activated",
          eventArg: "mouse",
        },
      ];
    }
    main = FindChild(simTarget.row, "MainContents") || simTarget.row;
    return [
      {
        method: DEFAULT_VERIFIED_SIM_METHOD,
        targetName: DEFAULT_VERIFIED_SIM_TARGET,
        target: main,
        eventName: "Activated",
        eventArg: "mouse",
      },
    ];
  }

  function SimNoEffectDelaySeconds(method, targetKind) {
    if (method !== DEFAULT_VERIFIED_SIM_METHOD) return 1.0;
    if (targetKind === "topbar")
      return TOPBAR_VERIFIED_SIM_NO_EFFECT_DELAY_SECONDS;
    return VERIFIED_SIM_NO_EFFECT_DELAY_SECONDS;
  }

  function FinishSimAttempt(originRoot, token, method, rowName, targetKind) {
    try {
      $.Schedule(
        SimNoEffectDelaySeconds(method, targetKind),
        function () {
          var root = GetDocumentRoot(
            IsPanelValid(originRoot) ? originRoot : GetContextPanel(),
          );
          var active;
          if (IsCompletedSimToken(root, token)) return;
          active = ReadActiveSimOpen(root);
          if (!active || active.token !== token) {
            return;
          }
          IncrementEscapeAutoNoEffectCount(root);
          StoreCompletedSimToken(root, token);
          ClearActiveSimOpen(root, token);
          ContinueEscapeAutoAfterAttempt(root, "sim_click_no_effect");
        },
      );
    } catch (e0) {}
  }



  function BuildActiveSimOpenRecord(root, simTarget, attempt, token, source) {
    return {
      root: root,
      token: token,
      rowName: simTarget.rowName,
      rowNameNorm: simTarget.rowNameNorm,
      row: simTarget.row,
      topbarIndex: simTarget.topbarIndex,
      topbarUid:
        simTarget.topbarUid ||
        (simTarget.candidate ? simTarget.candidate.uid : ""),
      startedAt: NowMs(),
      method: attempt.method,
      targetName: attempt.targetName,
      source: source || "sim",
      targetKind: simTarget.targetKind || "row",
      candidate: simTarget.candidate,
    };
  }

  function FindVerifiedSimAttempt(simTarget) {
    var attempts = SimAttemptList(simTarget);
    var i;
    for (i = 0; i < attempts.length; i += 1) {
      if (
        attempts[i].method === DEFAULT_VERIFIED_SIM_METHOD &&
        (attempts[i].targetName === DEFAULT_VERIFIED_SIM_TARGET ||
          attempts[i].targetName === TOPBAR_VERIFIED_SIM_TARGET)
      )
        return attempts[i];
    }
    return null;
  }
  function RunSimAttempt(root, simTarget, attempt, attemptIndex, source) {
    var token;
    if (!simTarget || !attempt) return false;
    token = String(NowMs()) + "_sim_" + String(attemptIndex);
    StoreActiveSimOpen(
      root,
      BuildActiveSimOpenRecord(root, simTarget, attempt, token, source),
    );
    try {
      if (!IsPanelValid(attempt.target)) {

        ClearActiveSimOpen(root, token);
        return false;
      }
      if (!attempt.eventName || !$.DispatchEvent) {

        ClearActiveSimOpen(root, token);
        return false;
      }
      if (attempt.eventArg !== undefined && attempt.eventArg !== null)
        $.DispatchEvent(attempt.eventName, attempt.target, attempt.eventArg);
      else $.DispatchEvent(attempt.eventName, attempt.target);
    } catch (e0) {

      ClearActiveSimOpen(root, token);
      return false;
    }
    if ($.Schedule)
      FinishSimAttempt(
        root,
        token,
        attempt.method,
        simTarget.rowName,
        simTarget.targetKind,
      );
    return true;
  }

  function SimulateNextVisiblePlayerListRowOpen(panel, roster) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var snapshot = roster || BuildEscapeRoster(root);
    var rows = snapshot.rows || [];
    var rowMatches = snapshot.matches || [];
    var startIndex;
    var i;
    var rowIndex;
    var simTarget;
    var attempt;
    var known;
    var selectedSimTarget = null;
    var selectedRowIndex = -1;
    var appliedKnown = 0;
    var transition = ReadHudTransitionInfo(root, snapshot);

    if (!AutoProbeRosterReady(snapshot, transition)) {

      return false;
    }
    if (!rows.length) {

      return false;
    }
    startIndex = Number(
      GetPanelAttribute(root, "showrank_sim_roster_next_row_index", "0") || 0,
    );
    if (!isFinite(startIndex) || startIndex < 0) startIndex = 0;
    for (i = 0; i < rows.length; i += 1) {
      rowIndex = (startIndex + i) % rows.length;
      simTarget = BuildSimTargetFromRosterMatch(
        root,
        rowMatches[rowIndex],
        "roster_next",
      );
      if (!simTarget) continue;
      known = ResolveRowKnownAccount(simTarget);
      if (known && known.account) {
        if (
          simTarget.candidate &&
          TopBarHasRankForAccount(simTarget.candidate, known.account)
        )
          continue;
        if (
          ApplyKnownRowAccountIfNeeded(
            simTarget,
            known,
            "probe_next_topbar_loaded",
            snapshot.topbar,
          )
        )
          appliedKnown += 1;
        continue;
      }
      if (!selectedSimTarget) {
        selectedSimTarget = simTarget;
        selectedRowIndex = rowIndex;
      }
    }
    if (selectedSimTarget) {
      attempt = FindVerifiedSimAttempt(selectedSimTarget);
      if (!attempt) return false;
      SetPanelAttribute(
        root,
        "showrank_sim_roster_next_row_index",
        (selectedRowIndex + 1) % rows.length,
      );

      return RunSimAttempt(
        root,
        selectedSimTarget,
        attempt,
        "verified",
        "verified_roster_next",
      );
    }

    return appliedKnown > 0;
  }

  function CompleteSimSuccess(root, active) {
    StoreCompletedSimToken(root, active.token);
    ClearActiveSimOpen(root, active.token);
    return true;
  }

  // Player-List Row State
  function FindPlayerListRowNamePanel(row) {
    return FindChildCached(row, "__showRankPlayerListNamePanel", "PlayerName");
  }

  function FindPlayerListRowRankImage(row) {
    return FindChildCached(
      row,
      "__showRankPlayerListRankImage",
      "ShowRankPlayerListRankImage",
    );
  }

  function MarkSimSuccess(result, profile) {
    var root =
      profile && IsPanelValid(profile.root)
        ? GetDocumentRoot(profile.root)
        : GetDocumentRoot(GetContextPanel());
    var active = ReadActiveSimOpen(root);
    if (!active) return false;
    if (IsVerifiedRosterActive(active) && result !== "profile_account_found") {

      return false;
    }
    if (profile && active.rowNameNorm) {
      if (profile.norms && profile.norms.length) {
        if (!ProfileHasNameNorm(profile, active.rowNameNorm)) {
          if (
            result === "profile_account_found" &&
            ApplyVerifiedActiveSimProfileAccount(
              root,
              active,
              profile,
              "profile_name_alias_or_placeholder",
            )
          ) {

            return CompleteSimSuccess(root, active);
          }

          return false;
        }
      } else if (
        result === "profile_account_found" &&
        ApplyVerifiedActiveSimProfileAccount(
          root,
          active,
          profile,
          "missing_profile_name_active_account",
        )
      ) {
        return CompleteSimSuccess(root, active);
      } else if (!profile.norms || !profile.norms.length) {

        return false;
      }
    }
    if (result === "profile_account_found" && IsVerifiedRosterActive(active))
      ApplyVerifiedActiveSimProfileAccount(
        root,
        active,
        profile,
        "profile_account_found",
      );
    return CompleteSimSuccess(root, active);
  }

  function FindNearestPlayerListRow(panel) {
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var guard = 0;
    while (IsPanelValid(current) && guard < 20) {
      if (
        HasClass(current, PLAYER_LIST_ROW_CLASS) ||
        FindPlayerListRowNamePanel(current)
      )
        return current;
      current = GetParent(current);
      guard += 1;
    }
    return null;
  }

  function ReadRowName(row) {
    return (
      ReadText(FindPlayerListRowNamePanel(row)) || ReadTextTree(row, 3, 36)
    );
  }

  function MarkPlayerListHover(panel, source) {
    var row = FindNearestPlayerListRow(
      IsPanelValid(panel) ? panel : GetContextPanel(),
    );
    var root = GetDocumentRoot(row);
    var sourceName = source || "players_list_hover";
    var directManualStored = false;
    var name = ReadRowName(row);
    var nameNorm = NormalizeName(name);
    var match;
    var token;
    if (sourceName === "players_list_activate")
      directManualStored = StoreDirectManualTargetRow(
        row,
        name,
        nameNorm,
        sourceName,
        "",
      );
    if (!nameNorm) return directManualStored;
    match = FindUniqueTopBarByName(root, nameNorm);
    if (!match.candidate) return directManualStored;
    token = String(NowMs()) + "_row_" + String(match.candidate.index);
    SetPanelAttribute(match.candidate.image, "showrank_hover_token", token);
    SetPanelAttribute(match.candidate.root, "showrank_hover_token", token);
    StoreManualTarget(
      match.candidate,
      name,
      nameNorm,
      sourceName,
      token,
      row,
    );
    state.hoverToken = {
      token: token,
      nameNorm: nameNorm,
      name: name,
      candidate: match.candidate,
      row: row,
      source: sourceName,
      at: NowMs(),
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
    var url;
    if (!IsPanelValid(row) || !account) return false;
    image = FindPlayerListRowRankImage(row);
    if (!IsPanelValid(image)) return false;
    url = BuildRankImageUrl(account);
    if (!url) return false;
    if (
      GetPanelAttribute(image, "showrank_player_list_rank_url", "") !== url ||
      GetPanelAttribute(image, "showrank_player_list_rank_version", "") !==
        CACHE_VERSION
    ) {
      if (
        !ApplyRankImagePanel(
          image,
          url,
          PLAYER_LIST_RANK_VISIBLE_CLASS,
          PLAYER_LIST_RANK_IMAGE_ATTRS,
          { url: url, account: account, version: CACHE_VERSION },
        )
      )
        return false;
    } else AddClass(image, PLAYER_LIST_RANK_VISIBLE_CLASS);
    MarkShowRankMatchActiveIfHudActive(
      row,
      source || "player_list_rank_image_set",
    );
    return true;
  }

  function ClearPlayerListRowRankState(row) {
    return ClearRankImagePanel(
      FindPlayerListRowRankImage(row),
      PLAYER_LIST_RANK_VISIBLE_CLASS,
      PLAYER_LIST_RANK_IMAGE_ATTRS,
      {},
      true,
    );
  }

  function MaybeClearPlayerListRowForMatchReset(docRoot, row, resetEpoch) {
    var epoch =
      resetEpoch !== undefined
        ? resetEpoch
        : GetPanelAttribute(docRoot, "showrank_match_cache_reset_epoch", "");
    var image;
    if (!epoch || !IsPanelValid(row)) return false;
    image = FindPlayerListRowRankImage(row);
    if (!IsPanelValid(image)) return false;
    if (
      GetPanelAttribute(image, "showrank_match_cache_cleared_epoch", "") ===
      epoch
    )
      return false;
    ClearPlayerListRowRankState(row);
    SetPanelAttribute(image, "showrank_match_cache_cleared_epoch", epoch);
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
      if (
        (!IsPanelValid(docRoot) ||
          !IsPanelValid(rowRoot) ||
          rowRoot === docRoot) &&
        rowNorm &&
        rowNorm === active.rowNameNorm
      )
        return active.row;
    }
    return FindUniquePlayerListRowByNameNorm(
      docRoot,
      active ? active.rowNameNorm : "",
    );
  }

  function ApplyVerifiedActiveSimPlayerListRank(
    root,
    active,
    accountId,
    source,
  ) {
    var account = NormalizeAccountId(accountId);
    var row;
    if (!account || !active || !active.rowNameNorm) return false;
    row = ResolveVerifiedActiveSimPlayerListRow(root, active);
    if (!IsPanelValid(row)) {
      return false;
    }
    return ApplyPlayerListRowRankImage(
      row,
      account,
      source || "sim_active_verified_account",
    );
  }

  function BuildEscapeRosterCandidateLoaded(candidate) {
    return !!(
      candidate &&
      (candidate.rankLoaded ||
        candidate.loaded ||
        candidate.rankReady ||
        candidate.ready ||
        candidate.loadedAccount)
    );
  }

  function BuildEscapeRosterRowEvidence(row) {
    var name = ReadRowName(row);
    return {
      row: row,
      name: name || "",
      nameNorm: NormalizeName(name),
      account:
        NormalizeAccountId(
          GetPanelAttribute(row, "showrank_account_id", "") ||
            GetPanelAttribute(row, "account_id", ""),
        ),
      loadedAccount: ReadPlayerListRowRankAccount(row),
    };
  }

  function ApplyMatchResetToPlayerListRows(docRoot, rows, resetEpoch) {
    var i;
    if (!resetEpoch) return;
    for (i = 0; i < rows.length; i += 1)
      MaybeClearPlayerListRowForMatchReset(docRoot, rows[i], resetEpoch);
  }

  function BuildRosterReadiness(result, requiredLoaded, nearRequired) {
    var structural =
      result.rows.length === ESCAPE_ROSTER_SIZE &&
      result.matched === ESCAPE_ROSTER_SIZE &&
      result.ambiguous === 0 &&
      result.missing === 0 &&
      result.skipped === 0 &&
      result.topbar.length === ESCAPE_ROSTER_SIZE &&
      result.uniqueTopbarNames === ESCAPE_ROSTER_SIZE;
    var fullThreshold = Number(requiredLoaded);
    var nearThreshold = Number(nearRequired);
    var loaded = Number(result.combinedLoaded);
    if (!isFinite(fullThreshold) || fullThreshold < 0)
      fullThreshold = REQUIRED_LOADED;
    if (!isFinite(nearThreshold) || nearThreshold < 0)
      nearThreshold = ESCAPE_NEAR_REQUIRED_MATCHED;
    if (!isFinite(loaded))
      loaded = Number(result.uniqueMatchedTopbar || 0);
    if (result.topbarOnly)
      return {
        kind: "topbar_only",
        reason: result.topbarOnlyReason || "topbar_only",
        nearKind: "topbar_only",
      };
    if (!structural)
      return {
        kind:
          result.ambiguous || result.missing || result.skipped
            ? "blocked"
            : "wait",
        reason:
          result.ambiguous || result.missing || result.skipped
            ? "ambiguous_or_missing_rows"
            : "not_ready",
        nearKind: "wait",
      };
    return {
      kind: loaded >= fullThreshold ? "full" : "probe_safe",
      reason: loaded >= fullThreshold ? "full_roster" : "partial_roster",
      nearKind: loaded >= nearThreshold ? "full" : "probe_safe",
    };
  }
  function CountRosterLoadedCandidates(topbar) {
    var count = 0;
    var i;
    var evidence;
    for (i = 0; i < (topbar || []).length; i += 1) {
      if (!topbar[i]) continue;
      evidence = topbar[i].rankLoaded
        ? null
        : ReadTopBarCandidateEvidence(topbar[i]);
      if (topbar[i].rankLoaded || (evidence && evidence.loaded)) count += 1;
    }
    return count;
  }

  function BuildEscapeRosterReadModel(rows, topbarSnapshot) {
    var topbar = topbarSnapshot && topbarSnapshot.candidates
      ? topbarSnapshot.candidates
      : [];
    var matches = [];
    var topbarCurrent = !(
      topbarSnapshot &&
      (topbarSnapshot.current === false ||
        topbarSnapshot.detached === true ||
        topbarSnapshot.generationStale === true ||
        topbarSnapshot.staleGeneration === true)
    );
    var matchedKeys = {};
    var matched = 0;
    var ambiguous = 0;
    var missing = 0;
    var skipped = 0;
    var uniqueMatchedTopbar = 0;
    var firstMissingName = "";
    var firstAmbiguousName = "";
    var firstSkippedName = "";
    var loadedRows = 0;
    var loadedTopbar = 0;
    var uniqueTopbarNames = topbarSnapshot.uniqueNameCount || 0;
    var i;
    var j;
    var rowEvidence;
    var candidate;
    var candidateMatches;
    var item;
    var key;
    var seenNames = {};
    if (!uniqueTopbarNames) {
      uniqueTopbarNames = 0;
      for (i = 0; i < topbar.length; i += 1) {
        if (
          topbar[i] &&
          topbar[i].nameNorm &&
          !seenNames[topbar[i].nameNorm]
        ) {
          seenNames[topbar[i].nameNorm] = true;
          uniqueTopbarNames += 1;
        }
      }
    }
    if (topbarSnapshot && isFinite(Number(topbarSnapshot.loadedCount)))
      loadedTopbar = Number(topbarSnapshot.loadedCount);
    else {
      for (i = 0; i < topbar.length; i += 1)
        if (BuildEscapeRosterCandidateLoaded(topbar[i])) loadedTopbar += 1;
    }
    for (i = 0; i < rows.length; i += 1) {
      rowEvidence = BuildEscapeRosterRowEvidence(rows[i]);
      item = {
        row: rowEvidence.row,
        rowIndex: i,
        name: rowEvidence.name,
        nameNorm: rowEvidence.nameNorm,
        loadedAccount: rowEvidence.loadedAccount,
        candidate: null,
        status: "missing",
      };
      candidateMatches = [];
      if (!rowEvidence.nameNorm && !rowEvidence.account) {
        item.status = "skipped";
        skipped += 1;
        if (!firstSkippedName)
          firstSkippedName = rowEvidence.name || "<empty>";
      } else {
        for (j = 0; j < topbar.length; j += 1) {
          candidate = topbar[j];
          if (!candidate) continue;
          if (
            rowEvidence.account
              ? NormalizeAccountId(candidate.account || "") ===
                rowEvidence.account
              : rowEvidence.nameNorm &&
                NormalizeName(candidate.name || "") === rowEvidence.nameNorm
          )
            candidateMatches.push(candidate);
        }
        if (candidateMatches.length === 1) {
          item.status = "matched";
          item.candidate = candidateMatches[0];
          matched += 1;
          key =
            candidateMatches[0].uid ||
            String(candidateMatches[0].index || i);
          if (!matchedKeys[key]) {
            matchedKeys[key] = true;
            uniqueMatchedTopbar += 1;
          }
          if (
            BuildEscapeRosterCandidateLoaded(candidateMatches[0]) ||
            !!rowEvidence.loadedAccount
          )
            loadedRows += 1;
        } else if (candidateMatches.length > 1) {
          item.status = "ambiguous";
          item.count = candidateMatches.length;
          ambiguous += 1;
          if (!firstAmbiguousName)
            firstAmbiguousName = rowEvidence.name || "<empty>";
        } else {
          missing += 1;
          if (!firstMissingName)
            firstMissingName = rowEvidence.name || "<empty>";
        }
      }
      matches.push(item);
    }
    var completeCurrentTopbar =
      topbarCurrent &&
      topbar.length === ESCAPE_ROSTER_SIZE &&
      uniqueTopbarNames === ESCAPE_ROSTER_SIZE;
    var topbarOnly =
      completeCurrentTopbar &&
      (!rows.length || matched !== ESCAPE_ROSTER_SIZE || ambiguous || missing || skipped);
    var result = {
      rows: rows,
      topbar: topbar,
      matches: matches,
      matched: matched,
      ambiguous: ambiguous,
      missing: missing,
      skipped: skipped,
      uniqueTopbarNames: uniqueTopbarNames,
      uniqueMatchedTopbar: uniqueMatchedTopbar,
      firstMissingName: firstMissingName,
      firstAmbiguousName: firstAmbiguousName,
      firstSkippedName: firstSkippedName,
      topbarOnlyReason: topbarOnly
        ? rows.length
          ? "stale_or_mismatched_rows"
          : "no_rows"
        : "",
      rosterSize: ESCAPE_ROSTER_SIZE,
      requiredLoaded: REQUIRED_LOADED,
      nearRequiredMatched: ESCAPE_NEAR_REQUIRED_MATCHED,
      topbarOnly: topbarOnly,
      loadedRows: loadedRows,
      loadedTopbar: loadedTopbar,
      topbarLoaded: loadedTopbar,
      combinedLoaded: Math.max(loadedRows, loadedTopbar),
      topbarCount: topbar.length,
      topbarCurrent: topbarCurrent,
    };
    if (topbarOnly) {
      result.rows = [];
      result.matches = [];
      result.matched = 0;
      result.ambiguous = 0;
      result.missing = 0;
      result.skipped = 0;
      result.uniqueMatchedTopbar = 0;
      result.loadedRows = 0;
      for (i = 0; i < topbar.length; i += 1) {
        candidate = topbar[i] || {};
        item = {
          row: null,
          rowIndex: i,
          name: candidate.name || "",
          nameNorm: candidate.nameNorm || NormalizeName(candidate.name || ""),
          candidate: candidate.nameNorm || candidate.name ? candidate : null,
          status: candidate.nameNorm || candidate.name ? "matched" : "skipped",
          source: "topbar_only",
        };
        result.rows.push(candidate.root || null);
        result.matches.push(item);
        if (item.status === "matched") {
          result.matched += 1;
          result.uniqueMatchedTopbar += 1;
        } else result.skipped += 1;
      }
    }
    result.fallback = {
      kind: result.topbarOnly ? "topbar_only" : "none",
      reason: result.topbarOnly ? result.topbarOnlyReason : "",
    };
    result.identitySignature = BuildShowRankSignature(result, false);
    result.idleSignature = BuildShowRankSignature(result, true);
    result.readiness = BuildRosterReadiness(
      result,
      REQUIRED_LOADED,
      ESCAPE_NEAR_REQUIRED_MATCHED,
    );
    result.readinessKind = result.readiness.kind;
    result.readinessReason = result.readiness.reason;
    return result;
  }

  function BuildEscapeRosterFromSnapshot(root, topbarSnapshot) {
    var docRoot = GetDocumentRoot(root);
    var rows = FindPlayerListRows(docRoot);
    var resetEpoch = GetPanelAttribute(
      docRoot,
      "showrank_match_cache_reset_epoch",
      "",
    );
    ApplyMatchResetToPlayerListRows(docRoot, rows, resetEpoch);
    return BuildEscapeRosterReadModel(rows, topbarSnapshot);
  }

  function BuildEscapeRoster(root, forceTopBarRefresh) {
    var docRoot = GetDocumentRoot(root);
    return BuildEscapeRosterFromSnapshot(
      docRoot,
      ReadTopBarCandidateSnapshot(docRoot, !!forceTopBarRefresh),
    );
  }

  function BuildTopBarOnlyAutoRoster(root, reason) {
    var docRoot = GetDocumentRoot(root);
    var snapshot = ReadTopBarCandidateSnapshot(docRoot, true);
    var roster = BuildEscapeRosterReadModel(
      [],
      snapshot,
    );
    if (roster.topbar.length !== ESCAPE_ROSTER_SIZE)
      return BuildEscapeRoster(docRoot, true);
    if (reason) {
      roster.topbarOnlyReason = reason;
      roster.fallback.reason = reason;
      roster.readiness = BuildRosterReadiness(
        roster,
        REQUIRED_LOADED,
        ESCAPE_NEAR_REQUIRED_MATCHED,
      );
      roster.readinessKind = roster.readiness.kind;
      roster.readinessReason = roster.readiness.reason;
    }
    return roster;
  }



  function ClassifyReadyRoster(roster, transition, near) {
    var readiness;
    var kind;
    if (!roster) return "";
    readiness = roster.readiness || BuildRosterReadiness(roster);
    if (!readiness) return "";
    if (roster.topbarOnly) {
      if (near || readiness.kind !== "topbar_only") return "";
      return IsHudActiveForTopBarOnlyAuto(transition)
        ? "topbar_only_auto"
        : "topbar_only";
    }
    kind = near ? readiness.nearKind : readiness.kind;
    if (kind !== "full" && kind !== "probe_safe") return "";
    return near ? "escape_near" : "escape";
  }

  function EscapeRosterReady(roster) {
    return ClassifyReadyRoster(roster, null, false) === "escape";
  }


  function TopBarOnlyRosterReady(roster) {
    return SourceHasPrefix(ClassifyReadyRoster(roster, null, false), "topbar_only");
  }

  function IsHudActiveForTopBarOnlyAuto(transition) {
    if (!transition || transition.reason) return false;
    return (
      Number(transition.gameTimeSec || 0) > 0 ||
      transition.scoreboardOpen === "yes" ||
      transition.activeSpectator === "yes"
    );
  }

  function AutoProbeRosterReady(roster, transition) {
    var readyKind = ClassifyReadyRoster(roster, transition, false);
    return readyKind === "escape" || readyKind === "topbar_only_auto";
  }

  function ReadPlayerListRowRankAccount(row) {
    var image = FindPlayerListRowRankImage(row);
    if (!IsPanelValid(image)) return "";
    if (
      GetPanelAttribute(image, "showrank_player_list_rank_version", "") !==
      CACHE_VERSION
    )
      return "";
    return NormalizeAccountId(
      GetPanelAttribute(image, "showrank_player_list_rank_account", ""),
    );
  }

  function BuildTopBarIdentityPart(candidate) {
    if (!candidate) return "";
    return [
      "t",
      String(candidate.index),
      String(candidate.uid || ""),
      String(candidate.nameNorm || ""),
      String(candidate.teamSide || ""),
    ].join(":");
  }

  function BuildTopBarIdlePart(candidate) {
    var loadedAccount = "";
    var evidence;
    if (!candidate) return "";
    evidence = candidate.rankLoaded
      ? { account: candidate.account || "", loaded: true }
      : ReadTopBarCandidateEvidence(candidate);
    if (evidence.loaded) loadedAccount = evidence.account || "";
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

  function BuildRowIdlePart(row, index, nameNorm, loadedAccount) {
    return (
      BuildRowIdentityPart(row, index, nameNorm) +
      ":" +
      (loadedAccount !== undefined
        ? loadedAccount
        : ReadPlayerListRowRankAccount(row))
    );
  }

  function BuildRowIdentityPart(row, index, nameNorm) {
    return ["r", String(index), String(nameNorm || "")].join(":");
  }

  function BuildShowRankSignature(roster, includeLoaded) {
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
      roster.topbarOnly ? "topbar_only" : "player_list",
    ];
    for (i = 0; i < roster.topbar.length; i += 1)
      parts.push(
        includeLoaded
          ? BuildTopBarIdlePart(roster.topbar[i])
          : BuildTopBarIdentityPart(roster.topbar[i]),
      );
    for (i = 0; i < roster.rows.length; i += 1) {
      rowMatch = roster.matches[i] || null;
      row = rowMatch && rowMatch.row ? rowMatch.row : roster.rows[i];
      nameNorm =
        rowMatch && rowMatch.nameNorm
          ? rowMatch.nameNorm
          : NormalizeName(ReadRowName(row));
      parts.push(
        includeLoaded
          ? BuildRowIdlePart(
              row,
              i,
              nameNorm,
              rowMatch && rowMatch.loadedAccount,
            )
          : BuildRowIdentityPart(row, i, nameNorm),
      );
    }
    return parts.join("|");
  }

  function BuildShowRankIdentitySignature(roster) {
    return roster && roster.identitySignature
      ? roster.identitySignature
      : BuildShowRankSignature(roster, false);
  }

  function IsLoadedIdlePart(part) {
    var text = String(part || "");
    var pieces;
    var account;
    if (text.indexOf("t:") !== 0 && text.indexOf("r:") !== 0) return false;
    pieces = text.split(":");
    account = NormalizeAccountId(
      pieces.length ? pieces[pieces.length - 1] : "",
    );
    return !!account;
  }

  function LoadedIdlePartsStillPresent(storedSig, currentSig) {
    var parts;
    var i;
    if (!storedSig || !currentSig) return false;
    parts = String(storedSig).split("|");
    for (i = 0; i < parts.length; i += 1) {
      if (
        IsLoadedIdlePart(parts[i]) &&
        !IdleSignatureHasExactPart(currentSig, parts[i])
      )
        return false;
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
      if (account && TopBarHasRankForAccount(roster.topbar[i], account))
        loaded += 1;
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

  function BuildShowRankIdleSignature(roster) {
    return roster && roster.idleSignature
      ? roster.idleSignature
      : BuildShowRankSignature(roster, true);
  }


  function SchedulePendingSignature(
    docRoot,
    pendingAttr,
    sig,
    delay,
    callback,
  ) {
    if (!IsPanelValid(docRoot) || !sig || !(typeof $ !== "undefined" && $ && !!$.Schedule)) return false;
    if (GetPanelAttribute(docRoot, pendingAttr, "") === sig) return false;
    SetPanelAttribute(docRoot, pendingAttr, sig);
    try {
      $.Schedule(delay, function () {
        var retryRoot = GetDocumentRoot(docRoot);
        if (!IsPanelValid(retryRoot)) return;
        if (GetPanelAttribute(retryRoot, pendingAttr, "") !== sig) return;
        SetPanelAttribute(retryRoot, pendingAttr, "");
        callback(retryRoot);
      });
      return true;
    } catch (e1) {
      SetPanelAttribute(docRoot, pendingAttr, "");
    }
    return false;
  }

  function ScheduleCoalescedRuntimeCall(
    root,
    pendingAttr,
    directIdleSource,
    directSource,
    coalescedIdleSource,
    coalescedSource,
    callback,
    delaySeconds,
  ) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    if (!(typeof $ !== "undefined" && $ && !!$.Schedule)) {
      if (IsShowRankRuntimeIdleCurrent(docRoot, directIdleSource, true))
        return false;
      return callback(docRoot, directSource);
    }
    if (GetPanelAttribute(docRoot, pendingAttr, "") === "yes")
      return false;
    if (IsShowRankRuntimeIdleCurrent(docRoot, directIdleSource, true))
      return false;
    SetPanelAttribute(docRoot, pendingAttr, "yes");
    try {
      $.Schedule(delaySeconds || ESCAPE_ROW_READY_COALESCE_DELAY_SECONDS, function () {
        var retryRoot = GetDocumentRoot(docRoot);
        if (!IsPanelValid(retryRoot)) return;
        if (GetPanelAttribute(retryRoot, pendingAttr, "") !== "yes") return;
        SetPanelAttribute(retryRoot, pendingAttr, "");
        if (IsShowRankRuntimeIdleCurrent(retryRoot, coalescedIdleSource, true))
          return;
        callback(retryRoot, coalescedSource);
      });
      return true;
    } catch (e1) {
      SetPanelAttribute(docRoot, pendingAttr, "");
      return null;
    }
    return false;
  }


  function ClearStableEscapeRosterState(root) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    SetPanelAttribute(docRoot, "showrank_escape_roster_stable_sig", "");
    SetPanelAttribute(docRoot, "showrank_escape_roster_stable_pending_sig", "");
    return true;
  }

  function StableEscapeRosterRetryDelay(source) {
    var sourceName = NormalizeTopBarWaitSource(source || "");
    if (
      sourceName === "escape" ||
      SourceHasAnyPrefix(sourceName, ESCAPE_FAST_STABLE_RETRY_PREFIXES)
    )
      return ESCAPE_OPEN_WATCH_FAST_DELAY_SECONDS;
    return ESCAPE_AUTO_READY_RETRY_DELAY_SECONDS;
  }

  function ScheduleStableEscapeRosterRetry(
    root,
    source,
    sig,
    preferTopBar,
  ) {
    var docRoot = GetDocumentRoot(root);
    var stableSource = source || "escape_auto";
    if (!IsPanelValid(docRoot) || !sig) return false;
    return SchedulePendingSignature(
      docRoot,
      "showrank_escape_roster_stable_pending_sig",
      sig,
      StableEscapeRosterRetryDelay(stableSource),
      function (retryRoot) {
        var currentRoster = BuildEscapeRoster(retryRoot);
        var i;
        if (preferTopBar && currentRoster && currentRoster.matches) {
          currentRoster.topbarOnly = true;
          for (i = 0; i < currentRoster.matches.length; i += 1) {
            if (
              currentRoster.matches[i] &&
              currentRoster.matches[i].status === "matched" &&
              currentRoster.matches[i].candidate
            )
              currentRoster.matches[i].source = "topbar_only";
          }
          currentRoster.readiness = BuildRosterReadiness(currentRoster);
          currentRoster.readinessKind = currentRoster.readiness.kind;
          currentRoster.readinessReason = currentRoster.readiness.reason;
          currentRoster.fallback = {
            kind: "topbar_only",
            reason: currentRoster.topbarOnlyReason || "topbar_only",
          };
        }
        if (
          HasShowRankRuntimeIdle(retryRoot) &&
          IsShowRankRuntimeIdleActive(
            retryRoot,
            currentRoster,
            stableSource + "_stable_retry_idle",
          )
        )
          return;
        SetPanelAttribute(
          retryRoot,
          "showrank_escape_roster_stable_sig",
          BuildShowRankIdentitySignature(currentRoster),
        );
        EscapeAutoPopulate(retryRoot, stableSource, currentRoster);
      },
    );
  }

  function HasStableEscapeRoster(root, roster, source) {
    var docRoot = GetDocumentRoot(root);
    var sig;
    if (!IsPanelValid(docRoot)) return true;
    sig = BuildShowRankIdentitySignature(roster);
    if (!sig) return true;
    if (
      GetPanelAttribute(docRoot, "showrank_escape_roster_stable_sig", "") ===
      sig
    )
      return true;
    if (
      !ScheduleStableEscapeRosterRetry(
        docRoot,
        source || "escape_auto",
        sig,
        !!(roster && roster.topbarOnly),
      )
    )
      return true;
    SetPanelAttribute(docRoot, "showrank_escape_roster_stable_sig", sig);
    return false;
  }

  var RUNTIME_IDLE_ATTRS = [
    ["showrank_runtime_idle_sig", "sig"],
    ["showrank_runtime_idle_identity_sig", "identitySig"],
    ["showrank_runtime_idle_topbar_loaded", "topbarLoaded"],
    ["showrank_runtime_idle_row_loaded", "rowLoaded"],
    ["showrank_runtime_idle_at", "at"],
    ["showrank_runtime_idle_loaded", "loaded"],
  ];


  function HasShowRankRuntimeIdle(root) {
    var docRoot = GetDocumentRoot(root);
    return IsPanelValid(docRoot) && !!GetPanelAttribute(docRoot, AttrSpecNameForKey(RUNTIME_IDLE_ATTRS, "sig"), "");
  }

  function IsRuntimeIdleLatched(root) {
    return HasShowRankRuntimeIdle(root);
  }

  function GetRuntimeIdleLoaded(root) {
    var docRoot = GetDocumentRoot(root);
    var loaded;
    if (!IsPanelValid(docRoot)) return REQUIRED_LOADED;
    loaded = Number(
      GetPanelAttribute(docRoot, AttrSpecNameForKey(RUNTIME_IDLE_ATTRS, "loaded"), REQUIRED_LOADED) || REQUIRED_LOADED,
    );
    return isFinite(loaded) ? loaded : REQUIRED_LOADED;
  }

  function SetShowRankRuntimeIdleState(docRoot, roster, sig, loaded) {
    return WriteAttrSpecs(docRoot, RUNTIME_IDLE_ATTRS, {
      sig: sig || "",
      identitySig: BuildShowRankIdentitySignature(roster),
      topbarLoaded: CountLoadedTopBarIdleParts(roster),
      rowLoaded: CountLoadedRowIdleParts(roster),
      loaded: loaded,
    }, false);
  }

  function ClearShowRankRuntimeIdleAttributes(docRoot) {
    return WriteAttrSpecs(docRoot, RUNTIME_IDLE_ATTRS, {}, true);
  }

  function TryRefreshRuntimeIdleForRankGrowth(
    docRoot,
    roster,
    currentSig,
    source,
  ) {
    var storedSig;
    var storedIdentity;
    var currentIdentity;
    if (!IsPanelValid(docRoot) || !roster || !currentSig) return false;
    storedSig = GetPanelAttribute(docRoot, AttrSpecNameForKey(RUNTIME_IDLE_ATTRS, "sig"), "");
    storedIdentity = GetPanelAttribute(docRoot, AttrSpecNameForKey(RUNTIME_IDLE_ATTRS, "identitySig"), "");
    currentIdentity = BuildShowRankIdentitySignature(roster);
    if (
      !storedSig ||
      !storedIdentity ||
      !currentIdentity ||
      storedIdentity !== currentIdentity
    )
      return false;
    if (!LoadedIdlePartsStillPresent(storedSig, currentSig)) return false;
    SetShowRankRuntimeIdleState(
      docRoot,
      roster,
      currentSig,
      GetPanelAttribute(docRoot, AttrSpecNameForKey(RUNTIME_IDLE_ATTRS, "loaded"), "") || REQUIRED_LOADED,
    );
    SetPanelAttribute(
      docRoot,
      "showrank_escape_auto_completed_sig",
      currentSig,
    );
    return true;
  }

  var SHOWRANK_TRANSIENT_CLEAR_ATTRS = [
    "showrank_escape_auto_token",
    "showrank_escape_auto_step",
    "showrank_escape_auto_max_steps",
    "showrank_escape_auto_active_until",
    "showrank_escape_auto_ready_retry_pending_sig",
    "showrank_escape_auto_ready_retry_done_sig",
    "showrank_escape_auto_completed_at",
    "showrank_escape_auto_completed_sig",
    "showrank_escape_auto_topbar_retry_at",
    "showrank_escape_menu_auto_trigger_sig",
    "showrank_escape_open_watch_token",
    "showrank_escape_open_watch_count",
    "showrank_topbar_ready_wait_retry_count",
    "showrank_topbar_ready_wait_retry_pending_sig",
    "showrank_topbar_ready_wait_retry_last_sig",
    "showrank_topbar_ready_wait_retry_generation",
    "showrank_escape_row_ready_pending",
    "showrank_escape_intent_pending",
    "showrank_topbar_ready_check_pending",
    "showrank_escape_roster_stable_sig",
    "showrank_escape_roster_stable_pending_sig",
    "showrank_sim_roster_next_row_index",
    "showrank_escape_auto_no_effect_count",
    "showrank_prompt_state_apply_sig",
    "showrank_sim_completed_token",
  ];

  function ClearShowRankTransientState(root, preserveTopBarCandidates) {
    var docRoot = GetDocumentRoot(root);
    var i;
    if (IsPanelValid(docRoot)) {
      for (i = 0; i < SHOWRANK_TRANSIENT_CLEAR_ATTRS.length; i += 1)
        SetPanelAttribute(docRoot, SHOWRANK_TRANSIENT_CLEAR_ATTRS[i], "");
    }
    state.completedSimToken = "";
    ClearActiveSimOpen(docRoot);
    ClearEscapeVisibleWatch(docRoot);
    if (!preserveTopBarCandidates) TopBarCandidateStoreInvalidate(docRoot);
    return true;
  }

  function MarkShowRankMatchActive(root) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    SetPanelAttribute(docRoot, "showrank_match_cache_lobby_active", "");
    return true;
  }

  function MarkShowRankMatchActiveIfHudActive(root, source, roster) {
    var docRoot = GetDocumentRoot(root);
    var transition;
    if (!IsPanelValid(docRoot)) return false;
    if (
      GetPanelAttribute(docRoot, "showrank_match_cache_lobby_active", "") !==
      "yes"
    )
      return false;
    transition = ReadHudTransitionInfo(docRoot, roster || null);
    if (IsHudTransitionStopReason(transition.reason)) return false;
    MarkShowRankMatchActive(docRoot);
    return true;
  }

  function ClearLastProfileAttributes(root) {
    SetPanelAttribute(root, "showrank_last_account_id", "");
    SetPanelAttribute(root, "showrank_last_steamid3", "");
    SetPanelAttribute(root, "showrank_last_steam64", "");
    SetPanelAttribute(root, "showrank_last_profile_name", "");
    SetPanelAttribute(root, "showrank_last_profile_name_norm", "");
  }


  function MaybeClearTopBarForMatchReset(docRoot, root, image, source) {
    var epoch = GetPanelAttribute(
      docRoot,
      "showrank_match_cache_reset_epoch",
      "",
    );
    var clearedEpoch;
    var candidate;
    if (!epoch || !IsPanelValid(root) || !IsPanelValid(image)) return false;
    clearedEpoch =
      GetPanelAttribute(image, "showrank_match_cache_cleared_epoch", "") ||
      GetPanelAttribute(root, "showrank_match_cache_cleared_epoch", "");
    if (clearedEpoch === epoch) return false;
    candidate = {
      root: root,
      image: image,
      name: ReadText(FindChild(root, "PlayerName")) || "",
      nameNorm: "",
      index:
        GetPanelAttribute(image, "showrank_topbar_index", "") ||
        GetPanelAttribute(root, "showrank_topbar_index", "") ||
        "",
    };
    ClearTopBarRankPanelState(candidate);
    SetPanelAttribute(image, "showrank_match_cache_cleared_epoch", epoch);
    SetPanelAttribute(root, "showrank_match_cache_cleared_epoch", epoch);
    return true;
  }

  function IsProfileCardResetRoot(panel) {
    return (
      IsPanelValid(panel) &&
      (HasClass(panel, "ShowRankProfileCardRoot") ||
        GetPanelType(panel) === "CitadelProfileCard" ||
        GetPanelId(panel) === "ProfileCard")
    );
  }

  function ClearProfileCardRankForMatchReset(profileRoot, resetEpoch) {
    var media;
    var localBadge;
    var clearedEpoch;
    var hasState;
    if (!IsProfileCardResetRoot(profileRoot)) return false;
    media = FindChildCached(
      profileRoot,
      "__showRankMediaPanel",
      "WebMediaDemoMedia",
    );
    if (!IsPanelValid(media)) return false;
    clearedEpoch =
      GetPanelAttribute(media, "showrank_match_cache_cleared_epoch", "") ||
      GetPanelAttribute(profileRoot, "showrank_match_cache_cleared_epoch", "");
    if (resetEpoch && clearedEpoch === String(resetEpoch)) return false;
    hasState = !!(
      GetPanelAttribute(media, "showrank_account_id", "") ||
      GetPanelAttribute(media, "showrank_rank_url", "") ||
      GetPanelAttribute(profileRoot, "showrank_profile_watch_token", "") ||
      GetPanelAttribute(profileRoot, "showrank_profile_applied_account", "") ||
      GetPanelAttribute(profileRoot, "showrank_profile_topbar_applied", "")
    );
    if (!hasState) return false;
    localBadge = FindChildCached(
      profileRoot,
      "__showRankLocalBadgePanel",
      "WebMediaDemoLocalBadge",
    );
    ClearProfileWatchAttributes(profileRoot);
    SetPanelAttribute(profileRoot, "showrank_profile_applied_account", "");
    SetPanelAttribute(profileRoot, "showrank_profile_topbar_applied", "");
    SetPanelAttribute(profileRoot, "showrank_profile_seen_at", "");
    SetPanelAttribute(
      profileRoot,
      "showrank_profile_pending_stale_account",
      "",
    );
    SetPanelVisible(localBadge, false);
    ClearProfileRankMedia({ root: profileRoot, media: media });
    if (resetEpoch) {
      SetPanelAttribute(
        media,
        "showrank_match_cache_cleared_epoch",
        resetEpoch,
      );
      SetPanelAttribute(
        profileRoot,
        "showrank_match_cache_cleared_epoch",
        resetEpoch,
      );
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
    if (
      IsProfileCardResetRoot(docRoot) &&
      ClearProfileCardRankForMatchReset(docRoot, resetEpoch)
    )
      cleared += 1;
    directProfile = FindChildCached(
      docRoot,
      "__showRankProfileCardPanel",
      "ProfileCard",
    );
    if (ClearProfileCardRankForMatchReset(directProfile, resetEpoch))
      cleared += 1;
    profileRoots = FindChildrenWithClass(docRoot, "ShowRankProfileCardRoot");
    for (i = 0; i < profileRoots.length; i += 1) {
      if (ClearProfileCardRankForMatchReset(profileRoots[i], resetEpoch))
        cleared += 1;
    }
    return cleared;
  }

  // Match Transition and Runtime Idle State
  function NextMatchCacheResetEpoch(docRoot) {
    var epoch = Number(
      GetPanelAttribute(docRoot, "showrank_match_cache_reset_epoch", "0") || 0,
    );
    if (!isFinite(epoch) || epoch < 0) epoch = 0;
    return epoch + 1;
  }

  function MarkMatchCacheResetActive(docRoot, epoch, reason) {
    SetPanelAttribute(docRoot, "showrank_match_cache_reset_epoch", epoch);
    SetPanelAttribute(docRoot, "showrank_match_cache_lobby_active", "yes");
    SetPanelAttribute(
      docRoot,
      "showrank_match_cache_reset_reason",
      reason || "unknown",
    );
    SetPanelAttribute(docRoot, "showrank_escape_menu_auto_trigger_sig", "");
  }


  function ClearAccountCachesForMatchReset(docRoot) {
    state.hoverToken = null;
    ClearLastProfileAttributes(docRoot);
  }

  function ClearTopBarRanksForMatchReset(docRoot, epoch) {
    var candidates = ReadTopBarCandidateSnapshot(docRoot, true).candidates;
    var i;
    for (i = 0; i < candidates.length; i += 1) {
      if (ClearTopBarRankPanelState(candidates[i])) {
        SetPanelAttribute(
          candidates[i].image,
          "showrank_match_cache_cleared_epoch",
          epoch,
        );
        SetPanelAttribute(
          candidates[i].root,
          "showrank_match_cache_cleared_epoch",
          epoch,
        );
      }
    }
  }

  function ClearPlayerListRanksForMatchReset(docRoot, epoch, roster) {
    var rows =
      roster && roster.rows && !roster.topbarOnly
        ? roster.rows
        : FindPlayerListRows(docRoot);
    var i;
    for (i = 0; i < rows.length; i += 1) {
      if (ClearPlayerListRowRankState(rows[i])) {
        SetPanelAttribute(
          FindPlayerListRowRankImage(rows[i]),
          "showrank_match_cache_cleared_epoch",
          epoch,
        );
      }
    }
  }

  function ClearShowRankMatchCache(root, reason, source, roster) {
    var docRoot = GetDocumentRoot(root);
    var epoch;
    var alreadyActive;
    if (!IsPanelValid(docRoot)) return false;
    if (
      !ClearShowRankRuntimeIdle(
        docRoot,
        reason || "match_cache_reset",
        source || "match_cache_reset",
        roster,
      )
    )
      ClearShowRankTransientState(docRoot);
    alreadyActive =
      GetPanelAttribute(docRoot, "showrank_match_cache_lobby_active", "") ===
      "yes";
    if (alreadyActive) {
      ClearProfileCardRanksForMatchReset(
        docRoot,
        GetPanelAttribute(docRoot, "showrank_match_cache_reset_epoch", ""),
      );
      return false;
    }
    epoch = NextMatchCacheResetEpoch(docRoot);
    MarkMatchCacheResetActive(docRoot, epoch, reason);
    ClearAccountCachesForMatchReset(docRoot);
    ClearProfileCardRanksForMatchReset(docRoot, epoch);
    ClearTopBarRanksForMatchReset(docRoot, epoch);
    ClearPlayerListRanksForMatchReset(docRoot, epoch, roster);
    HideAllTeamAverageImages(docRoot);
    TopBarCandidateStoreInvalidate(docRoot);
    return true;
  }

  function IsHudTransitionStopReason(reason) {
    return (
      reason === "hideout_transition" ||
      reason === "lobby_or_hideout_transition"
    );
  }

  function StopShowRankAutomationForHudTransition(
    root,
    source,
    roster,
    reason,
  ) {
    var docRoot = GetDocumentRoot(root);
    var clearedIdle = false;
    if (!IsPanelValid(docRoot) || !IsHudTransitionStopReason(reason))
      return false;
    clearedIdle = ClearShowRankRuntimeIdle(
      docRoot,
      reason,
      source || "hud_transition",
      roster,
    );
    if (!clearedIdle) ClearShowRankTransientState(docRoot);
    ClearShowRankMatchCache(
      docRoot,
      reason,
      source || "hud_transition",
      roster,
    );
    return true;
  }

  function ClearShowRankRuntimeIdle(root, reason, source, roster) {
    var docRoot = GetDocumentRoot(root);
    var oldSig;
    if (!IsPanelValid(docRoot)) return false;
    oldSig = GetPanelAttribute(docRoot, "showrank_runtime_idle_sig", "");
    if (!oldSig) {
      ClearShowRankRuntimeIdleAttributes(docRoot);
      return false;
    }
    ClearShowRankRuntimeIdleAttributes(docRoot);
    ClearShowRankTransientState(docRoot);
    return true;
  }

  function IsShowRankRuntimeIdleActive(root, roster, source) {
    var docRoot = GetDocumentRoot(root);
    var storedSig;
    var currentSig;
    var transition;
    if (!IsPanelValid(docRoot)) return false;
    storedSig = GetPanelAttribute(docRoot, "showrank_runtime_idle_sig", "");
    if (!storedSig) return false;
    if (!roster) return true;
    transition = ReadHudTransitionInfo(docRoot, roster);
    if (IsHudTransitionStopReason(transition.reason)) {
      StopShowRankAutomationForHudTransition(
        docRoot,
        source || "unknown",
        roster,
        transition.reason,
      );
      return false;
    }
    currentSig = BuildShowRankIdleSignature(roster);
    if (currentSig && currentSig === storedSig) {
      return true;
    }
    if (
      TryRefreshRuntimeIdleForRankGrowth(
        docRoot,
        roster,
        currentSig,
        source || "unknown",
      )
    )
      return true;
    ClearShowRankRuntimeIdle(
      docRoot,
      "signature_changed",
      source || "unknown",
      roster,
    );
    return false;
  }

  function IsShowRankRuntimeIdleCurrent(root, source, forceTopBarRefresh) {
    var docRoot = GetDocumentRoot(root);
    if (!HasShowRankRuntimeIdle(docRoot)) return false;
    return IsShowRankRuntimeIdleActive(
      docRoot,
      BuildEscapeRoster(docRoot, !!forceTopBarRefresh),
      source || "runtime_idle_current",
    );
  }

  function MaybeResetIdleForTopBarCandidate(root, candidate, source) {
    var docRoot = GetDocumentRoot(root);
    var storedSig;
    var candidatePart;
    var roster;
    if (!IsPanelValid(docRoot) || !candidate) return false;
    storedSig = GetPanelAttribute(docRoot, "showrank_runtime_idle_sig", "");
    if (!storedSig) return false;
    candidatePart = BuildTopBarIdlePart(candidate);
    if (candidatePart && IdleSignatureHasExactPart(storedSig, candidatePart)) {
      return false;
    }
    roster = BuildEscapeRoster(docRoot);
    return ClearShowRankRuntimeIdle(
      docRoot,
      "topbar_candidate_changed",
      source || "topbar_register",
      roster,
    );
  }

  function EnterShowRankRuntimeIdle(root, roster, loaded, source) {
    var docRoot = GetDocumentRoot(root);
    var sig;
    var now;
    if (
      !IsPanelValid(docRoot) ||
      !EscapeRosterReady(roster) ||
      Number(loaded || 0) < REQUIRED_LOADED
    )
      return false;
    if (
      !UpdateTeamAverageRanks(
        docRoot,
        (source || "runtime_idle") + "_idle_enter",
        roster.topbar,
      )
    )
      return false;
    sig = BuildShowRankIdleSignature(roster);
    if (!sig) return false;
    ClearEscapeVisibleWatch(docRoot);
    if (GetPanelAttribute(docRoot, "showrank_runtime_idle_sig", "") === sig)
      return true;
    now = NowMs();
    SetShowRankRuntimeIdleState(docRoot, roster, sig, loaded);
    SetPanelAttribute(docRoot, "showrank_runtime_idle_at", now);
    SetPanelAttribute(docRoot, "showrank_escape_auto_completed_sig", sig);
    SetPanelAttribute(docRoot, "showrank_escape_auto_token", "");
    SetPanelAttribute(docRoot, "showrank_escape_auto_step", "");
    SetPanelAttribute(docRoot, "showrank_escape_auto_max_steps", "");
    SetPanelAttribute(docRoot, "showrank_escape_auto_active_until", "");
    SetPanelAttribute(
      docRoot,
      "showrank_escape_auto_ready_retry_pending_sig",
      "",
    );
    SetPanelAttribute(docRoot, "showrank_escape_open_watch_token", "");
    SetPanelAttribute(docRoot, "showrank_escape_open_watch_count", "");
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_count", "");
    SetPanelAttribute(
      docRoot,
      "showrank_topbar_ready_wait_retry_pending_sig",
      "",
    );
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_last_sig", "");
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_generation", "");
    SetPanelAttribute(docRoot, "showrank_escape_row_ready_pending", "");
    SetPanelAttribute(docRoot, "showrank_topbar_ready_check_pending", "");
    ClearStableEscapeRosterState(docRoot);
    ClearActiveSimOpen(docRoot);
    return true;
  }

  function IsNearReadyEscapeRoster(roster) {
    return ClassifyReadyRoster(roster, null, true) === "escape_near";
  }

  function ScheduleEscapeAutoReadyRetry(root, source, roster) {
    var docRoot = GetDocumentRoot(root);
    var sig;
    var doneSig;
    if (!IsPanelValid(docRoot) || !IsNearReadyEscapeRoster(roster))
      return false;
    if (IsShowRankRuntimeIdleActive(docRoot, roster, source || "topbar_ready"))
      return false;
    sig = [
      roster.rows.length,
      roster.topbar.length,
      roster.matched || 0,
      roster.uniqueMatchedTopbar || 0,
      roster.uniqueTopbarNames || 0,
      roster.firstMissingName || "",
      roster.firstAmbiguousName || "",
      source || "topbar_ready",
    ].join("|");
    doneSig = GetPanelAttribute(
      docRoot,
      "showrank_escape_auto_ready_retry_done_sig",
      "",
    );
    if (doneSig === sig) return false;
    return SchedulePendingSignature(
      docRoot,
      "showrank_escape_auto_ready_retry_pending_sig",
      sig,
      ESCAPE_AUTO_READY_RETRY_DELAY_SECONDS,
      function (retryRoot) {
        var retryRoster;
        if (
          IsShowRankRuntimeIdleCurrent(
            retryRoot,
            (source || "topbar_ready") + "_retry_idle",
            true,
          )
        )
          return;
        SetPanelAttribute(
          retryRoot,
          "showrank_escape_auto_ready_retry_done_sig",
          sig,
        );
        retryRoster = BuildEscapeRoster(retryRoot);
        if (
          IsShowRankRuntimeIdleActive(
            retryRoot,
            retryRoster,
            (source || "topbar_ready") + "_retry",
          )
        )
          return;
        MaybeTriggerEscapeAutoFromTopBar(
          retryRoot,
          (source || "topbar_ready") + "_retry",
        );
      },
    );
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
      roster.firstAmbiguousName || "",
    ].join("|");
  }

  function ShouldUseSlowTopBarWaitRetry(roster, reason) {
    if (reason === "rows_not_ready") return true;
    return !IsNearReadyEscapeRoster(roster);
  }

  function ScheduleBoundedPendingSignature(
    docRoot,
    countAttr,
    lastSigAttr,
    pendingAttr,
    sig,
    maxCount,
    delayForCount,
    callback,
  ) {
    var count = Number(GetPanelAttribute(docRoot, countAttr, "0") || 0);
    if (!isFinite(count) || count < 0) count = 0;
    if (GetPanelAttribute(docRoot, lastSigAttr, "") !== sig) {
      count = 0;
      SetPanelAttribute(docRoot, lastSigAttr, sig);
    }
    if (GetPanelAttribute(docRoot, pendingAttr, "") === sig) return false;
    if (count >= maxCount) return false;
    SetPanelAttribute(docRoot, countAttr, count + 1);
    return SchedulePendingSignature(
      docRoot,
      pendingAttr,
      sig,
      delayForCount(count),
      callback,
    );
  }

  function ScheduleTopBarWaitRetry(root, source, roster, reason) {
    var docRoot = GetDocumentRoot(root);
    var stableSource = NormalizeTopBarWaitSource(source);
    var sig;
    var useSlowRetry;
    var generation;
    var scheduled;
    if (!IsPanelValid(docRoot)) return false;
    sig = TopBarWaitSignature(roster, stableSource, reason);
    useSlowRetry = ShouldUseSlowTopBarWaitRetry(roster, reason);
    generation = ReadTopBarCandidateSnapshot(docRoot).generation || "";
    scheduled = ScheduleBoundedPendingSignature(
      docRoot,
      "showrank_topbar_ready_wait_retry_count",
      "showrank_topbar_ready_wait_retry_last_sig",
      "showrank_topbar_ready_wait_retry_pending_sig",
      sig,
      TOPBAR_READY_WAIT_RETRY_MAX,
      function (count) {
        return useSlowRetry || count >= TOPBAR_READY_WAIT_FAST_RETRY_MAX
          ? TOPBAR_READY_WAIT_SLOW_RETRY_DELAY_SECONDS
          : ESCAPE_AUTO_READY_RETRY_DELAY_SECONDS;
      },
      function (retryRoot) {
        MaybeTriggerEscapeAutoFromTopBar(retryRoot, stableSource);
      },
    );
    if (scheduled)
      SetPanelAttribute(
        docRoot,
        "showrank_topbar_ready_wait_retry_generation",
        generation,
      );
    return scheduled;
  }

  function CanRefreshFullTopBarAutoDuringPendingWait(root, sourceName) {
    var candidates;
    if (sourceName !== "topbar_player_onload_coalesced") return false;
    candidates = ReadTopBarCandidateSnapshot(root).candidates;
    return !!(candidates && candidates.length >= 12);
  }

  function SupersedeStaleTopBarWaitForPlayerOnload(root, source) {
    var docRoot = GetDocumentRoot(root);
    var pending = GetPanelAttribute(
      docRoot,
      "showrank_topbar_ready_wait_retry_pending_sig",
      "",
    );
    var pendingGeneration;
    var currentGeneration;
    if (source !== "topbar_player_onload" || !pending) return false;
    pendingGeneration = GetPanelAttribute(
      docRoot,
      "showrank_topbar_ready_wait_retry_generation",
      "",
    );
    currentGeneration = ReadTopBarCandidateSnapshot(docRoot).generation || "";
    if (
      pendingGeneration &&
      currentGeneration &&
      pendingGeneration === currentGeneration
    )
      return false;
    if (HasShowRankRuntimeIdle(docRoot))
      ClearShowRankRuntimeIdle(
        docRoot,
        "topbar_candidate_generation_changed",
        source,
      );
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_count", "");
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_pending_sig", "");
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_last_sig", "");
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_generation", "");
    SetPanelAttribute(docRoot, "showrank_topbar_ready_check_pending", "");
    return true;
  }

  function MaybeTriggerEscapeAutoFromTopBar(root, source) {
    var docRoot = GetDocumentRoot(root);
    var sourceName = NormalizeTopBarWaitSource(source);
    var roster;
    var transition;
    var now;
    var lastReady;
    var forceTopBarRefresh = false;
    if (!IsPanelValid(docRoot)) return false;
    if (!!GetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_pending_sig", "")) {
      if (!CanRefreshFullTopBarAutoDuringPendingWait(docRoot, sourceName))
        return false;
      forceTopBarRefresh = true;
    }
    roster = BuildEscapeRoster(docRoot, forceTopBarRefresh);
    if (IsShowRankRuntimeIdleActive(docRoot, roster, sourceName)) return false;
    transition = ReadHudTransitionInfo(docRoot, roster);
    if (transition.reason) {
      if (IsHudTransitionStopReason(transition.reason))
        StopShowRankAutomationForHudTransition(
          docRoot,
          sourceName,
          roster,
          transition.reason,
        );
      else
        ScheduleTopBarWaitRetry(docRoot, sourceName, roster, transition.reason);
      return false;
    }
    MarkShowRankMatchActive(docRoot);
    if (!roster.rows || roster.rows.length !== 12) {
      ScheduleTopBarWaitRetry(docRoot, sourceName, roster, "rows_not_ready");
      return false;
    }
    if (!AutoProbeRosterReady(roster, transition)) {
      if (!SourceShouldWaitForEscapeMenuTrigger(docRoot, sourceName, roster))
        ScheduleEscapeAutoReadyRetry(docRoot, sourceName, roster);
      ScheduleTopBarWaitRetry(
        docRoot,
        sourceName,
        roster,
        "roster_not_confirmed",
      );
      return false;
    }
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_count", "");
    SetPanelAttribute(
      docRoot,
      "showrank_topbar_ready_wait_retry_pending_sig",
      "",
    );
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_last_sig", "");
    SetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_generation", "");
    now = NowMs();
    lastReady = Number(
      GetPanelAttribute(docRoot, "showrank_escape_auto_topbar_retry_at", "0") ||
        0,
    );
    if (
      isFinite(lastReady) &&
      lastReady > 0 &&
      now - lastReady >= 0 &&
      now - lastReady < ESCAPE_AUTO_TOPBAR_RETRY_THROTTLE_MS
    ) {
      return false;
    }
    SetPanelAttribute(docRoot, "showrank_escape_auto_topbar_retry_at", now);
    return EscapeAutoPopulate(docRoot, sourceName, roster, transition);
  }
  function ScheduleTopBarReadyCheck(root, source) {
    var docRoot = GetDocumentRoot(root);
    var sourceName = source || "topbar_register";
    var coalescedSource = sourceName + "_coalesced";
    var superseded = SupersedeStaleTopBarWaitForPlayerOnload(
      docRoot,
      sourceName,
    );
    if (
      superseded &&
      CanRefreshFullTopBarAutoDuringPendingWait(
        docRoot,
        NormalizeTopBarWaitSource(coalescedSource),
      )
    )
      return MaybeTriggerEscapeAutoFromTopBar(docRoot, coalescedSource);
    if (
      typeof $ !== "undefined" &&
      $ &&
      !!$.Schedule &&
      !!GetPanelAttribute(docRoot, "showrank_topbar_ready_wait_retry_pending_sig", "")
    ) {
      return CanRefreshFullTopBarAutoDuringPendingWait(
        docRoot,
        NormalizeTopBarWaitSource(coalescedSource),
      )
        ? MaybeTriggerEscapeAutoFromTopBar(docRoot, coalescedSource)
        : false;
    }
    return !!ScheduleCoalescedRuntimeCall(
      docRoot,
      "showrank_topbar_ready_check_pending",
      sourceName + "_idle_check",
      sourceName + "_direct",
      sourceName + "_coalesced_idle_check",
      coalescedSource,
      MaybeTriggerEscapeAutoFromTopBar,
      TOPBAR_READY_COALESCE_DELAY_SECONDS,
    );
  }


  function UpdateEscapePrompt(root, loaded, blocked, rows, topbarCount) {
    var docRoot = GetDocumentRoot(root);
    var resolvedTopbarCount =
      topbarCount === undefined || topbarCount === null
        ? ReadTopBarCandidateSnapshot(docRoot).candidates.length
        : Number(topbarCount || 0);
    var stateName = "needs_manual_profiles";
    var sig;
    loaded = Number(loaded || 0);
    blocked = Number(blocked || 0);
    rows = Number(rows || 0);
    if (!isFinite(resolvedTopbarCount) || resolvedTopbarCount < 0)
      resolvedTopbarCount = 0;
    if (!resolvedTopbarCount) stateName = "no_topbar";
    else if (loaded >= REQUIRED_LOADED) stateName = "ready";
    else if (!rows) stateName = "needs_escape";
    sig =
      stateName +
      "|" +
      String(loaded) +
      "|" +
      String(blocked) +
      "|" +
      String(rows) +
      "|" +
      String(resolvedTopbarCount);
    if (
      GetPanelAttribute(docRoot, "showrank_prompt_state_apply_sig", "") !== sig
    ) {
      SetPanelAttribute(docRoot, "showrank_prompt_state_apply_sig", sig);
      RemoveClass(docRoot, "ShowRankTopBarNeedsManualProfiles");
      RemoveClass(docRoot, "ShowRankTopBarNeedsEscapePrompt");
      RemoveClass(docRoot, "ShowRankCleanRanksReady");
      if (stateName === "ready") AddClass(docRoot, "ShowRankCleanRanksReady");
      else if (stateName === "needs_manual_profiles")
        AddClass(docRoot, "ShowRankTopBarNeedsManualProfiles");
      else if (stateName === "needs_escape")
        AddClass(docRoot, "ShowRankTopBarNeedsEscapePrompt");
    }
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
        $.Schedule(wait, function () {
          CleanupProfileContext((source || "unknown") + "_delayed");
        });
        return true;
      }
    } catch (e0) {}
    CleanupProfileContext(source || "unknown");
    return false;
  }

  function RememberEscapePreloadResult(
    root,
    source,
    loaded,
    blocked,
    skipped,
    failed,
  ) {
    if (!IsPanelValid(root)) return;
    SetPanelAttribute(
      root,
      "showrank_escape_preload_last_source",
      source || "",
    );
    SetPanelAttribute(
      root,
      "showrank_escape_preload_last_loaded",
      Number(loaded || 0),
    );
    SetPanelAttribute(
      root,
      "showrank_escape_preload_last_blocked",
      Number(blocked || 0),
    );
    SetPanelAttribute(
      root,
      "showrank_escape_preload_last_skipped",
      Number(skipped || 0),
    );
    SetPanelAttribute(
      root,
      "showrank_escape_preload_last_failed",
      Number(failed || 0),
    );
  }

  function ScheduleCleanupAfterAutoComplete(root, source, preloadLoaded) {
    var blocked = Number(
      GetPanelAttribute(root, "showrank_escape_preload_last_blocked", "0") || 0,
    );
    var failed = Number(
      GetPanelAttribute(root, "showrank_escape_preload_last_failed", "0") || 0,
    );
    if (
      ReadActiveSimOpen(root) ||
      Number(preloadLoaded || 0) < REQUIRED_LOADED ||
      blocked > 0 ||
      failed > 0
    ) {
      ScheduleCleanupProfileContext(
        source || "escape_auto_complete",
        CONTEXT_CLEANUP_DELAY_SECONDS,
      );
    }
  }


  function ApplyTopBarOnlyPreloadRow(root, norm, match, topbar) {
    var topbarAccount = ReadTopBarAccount(match.candidate);
    if (
      topbarAccount &&
      TopBarHasRankForAccount(match.candidate, topbarAccount)
    )
      return "loaded";
    return "blocked";
  }

  function ApplyMatchedEscapePreloadRow(root, row, norm, match, topbar) {
    var topbarAccount = ReadTopBarAccount(match.candidate);
    if (
      topbarAccount &&
      TopBarHasRankForAccount(match.candidate, topbarAccount)
    ) {
      return ApplyPlayerListRowRankImage(
        row,
        topbarAccount,
        "escape_topbar_loaded",
      )
        ? "loaded"
        : "failed";
    }
    return "blocked";
  }

  function ApplyEscapePreloadRow(root, row, norm, match, topbar, topbarOnlyReady) {
    if (!match.candidate) return "skipped";
    if (topbarOnlyReady)
      return ApplyTopBarOnlyPreloadRow(root, norm, match, topbar);
    return ApplyMatchedEscapePreloadRow(root, row, norm, match, topbar);
  }

  // Escape Preload and Autoload FSM
  function CountEscapePreloadResult(counts, result) {
    if (result === "loaded") counts.loaded += 1;
    else if (result === "blocked") counts.blocked += 1;
    else if (result === "skipped") counts.skipped += 1;
    else counts.failed += 1;
  }

  function BuildEscapePreloadMatch(rowMatch, topbar, norm) {
    return rowMatch
      ? {
          candidate: rowMatch.candidate || null,
          count: rowMatch.count || (rowMatch.candidate ? 1 : 0),
          total: topbar.length,
        }
      : FindUniqueTopBarInCandidates(topbar, norm);
  }

  function FinishEscapePreloadIfReady(
    root,
    snapshot,
    topbar,
    loaded,
    sourceName,
    fullRosterReady,
    topbarOnlyReady,
  ) {
    var terminalReady = false;
    if (loaded < REQUIRED_LOADED || (!fullRosterReady && !topbarOnlyReady))
      return false;
    if (fullRosterReady)
      terminalReady = EnterShowRankRuntimeIdle(
        root,
        snapshot,
        loaded,
        sourceName,
      );
    else if (topbarOnlyReady)
      terminalReady = UpdateTeamAverageRanks(
        root,
        sourceName + "_topbar_only_ready",
        topbar,
      );
    ScheduleCleanupProfileContext(
      "escape_preload_ready",
      CONTEXT_CLEANUP_DELAY_SECONDS,
    );
    return terminalReady;
  }
  function ApplyEscapePreloadRows(
    counts,
    root,
    rows,
    topbar,
    rowMatches,
    topbarOnlyReady,
  ) {
    var i;
    var row;
    var rowMatch;
    var name;
    var norm;
    var match;
    var result;
    for (i = 0; i < rows.length; i += 1) {
      rowMatch = rowMatches[i] || null;
      row = rowMatch && rowMatch.row ? rowMatch.row : rows[i];
      name = rowMatch ? rowMatch.name : ReadRowName(row);
      norm = rowMatch ? rowMatch.nameNorm : NormalizeName(name);
      if (!norm) {
        counts.skipped += 1;
        continue;
      }
      match = BuildEscapePreloadMatch(rowMatch, topbar, norm);
      result = ApplyEscapePreloadRow(
        root,
        row,
        norm,
        match,
        topbar,
        topbarOnlyReady,
      );
      CountEscapePreloadResult(counts, result);
    }
  }

  function EscapePreloadFromCache(panel, source, roster) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var sourceName = source || "escape_preload";
    var snapshot = roster || BuildEscapeRoster(root);
    var rows = snapshot.rows || [];
    var topbar = snapshot.topbar || [];
    var rowMatches = snapshot.matches || [];
    var counts = { loaded: 0, blocked: 0, skipped: 0, failed: 0 };
    var fullRosterReady = EscapeRosterReady(snapshot);
    var transition = ReadHudTransitionInfo(root, snapshot);
    var topbarOnlyReady =
      TopBarOnlyRosterReady(snapshot) &&
      IsHudActiveForTopBarOnlyAuto(transition);
    var topBarBatchDirty = false;
    var terminalReady = false;
    if (IsShowRankRuntimeIdleActive(root, snapshot, sourceName))
      return Number(
        GetPanelAttribute(
          root,
          "showrank_runtime_idle_loaded",
          REQUIRED_LOADED,
        ) || REQUIRED_LOADED,
      );
    if (IsHudTransitionStopReason(transition.reason)) {
      StopShowRankAutomationForHudTransition(
        root,
        sourceName,
        snapshot,
        transition.reason,
      );
      RememberEscapePreloadResult(root, sourceName, 0, rows.length, 0, 0);
      return 0;
    }
    if (!AutoProbeRosterReady(snapshot, transition)) {
      UpdateEscapePrompt(
        root,
        0,
        rows.length || 0,
        rows.length || 0,
        topbar.length || 0,
      );
      RememberEscapePreloadResult(root, sourceName, 0, rows.length || 0, 0, 0);
      return 0;
    }
    BeginTopBarBatch(root);
    try {
      ApplyEscapePreloadRows(
        counts,
        root,
        rows,
        topbar,
        rowMatches,
        topbarOnlyReady,
      );
    } finally {
      topBarBatchDirty = EndTopBarBatch(
        root,
        sourceName,
        counts.loaded,
        counts.blocked,
        rows.length,
        topbar.length,
        true,
      );
    }
    RememberEscapePreloadResult(
      root,
      sourceName,
      counts.loaded,
      counts.blocked,
      counts.skipped,
      counts.failed,
    );
    terminalReady = FinishEscapePreloadIfReady(
      root,
      snapshot,
      topbar,
      counts.loaded,
      sourceName,
      fullRosterReady,
      topbarOnlyReady,
    );
    if (topBarBatchDirty && !terminalReady && !HasShowRankRuntimeIdle(root))
      ScheduleTopBarReadyCheck(root, sourceName);
    return counts.loaded;
  }

  function ClearEscapeAutoState(root, token) {
    if (
      token &&
      GetPanelAttribute(root, "showrank_escape_auto_token", "") !== token
    )
      return;
    SetPanelAttribute(root, "showrank_escape_auto_token", "");
    SetPanelAttribute(root, "showrank_escape_auto_step", "");
    SetPanelAttribute(root, "showrank_escape_auto_max_steps", "");
    SetPanelAttribute(root, "showrank_escape_auto_active_until", "");
    SetPanelAttribute(root, "showrank_sim_roster_next_row_index", "");
    SetPanelAttribute(root, "showrank_escape_auto_completed_at", NowMs());
    SetPanelAttribute(root, "showrank_escape_auto_no_effect_count", "");
  }

  function ReadEscapeAutoNoEffectCount(root) {
    var count = Number(
      GetPanelAttribute(root, "showrank_escape_auto_no_effect_count", "0") || 0,
    );
    return isFinite(count) && count > 0 ? count : 0;
  }

  function IncrementEscapeAutoNoEffectCount(root) {
    var count = ReadEscapeAutoNoEffectCount(root) + 1;
    SetPanelAttribute(root, "showrank_escape_auto_no_effect_count", count);
    return count;
  }

  function MaybeExtendEscapeAutoForNoEffect(root, roster, step, maxSteps) {
    var rows = roster && roster.rows ? roster.rows.length : 0;
    var loaded = CountLoadedRowIdleParts(roster);
    var noEffectCount = ReadEscapeAutoNoEffectCount(root);
    var targetMax;
    var hardMax;
    if (!rows || !noEffectCount || loaded <= 0 || loaded >= rows) return maxSteps;
    hardMax = rows * SIM_PROBE_MAX_ATTEMPTS_PER_ROW;
    targetMax = rows + noEffectCount;
    if (targetMax > hardMax) targetMax = hardMax;
    if (targetMax <= maxSteps || step >= hardMax) return maxSteps;
    SetPanelAttribute(root, "showrank_escape_auto_max_steps", targetMax);
    return targetMax;
  }

  function RestoreTopBarPlaceholderIfAutoInactive(root, roster, source) {
    var candidates;
    if (ReadActiveSimOpen(root)) return 0;
    candidates = ReadTopBarCandidateSnapshot(root, true).candidates;
    if (!candidates.length && roster) candidates = roster.topbar;
    return SetTopBarPlaceholderForCandidates(
      candidates,
      source || "auto_inactive",
    );
  }

  function StopEscapeAutoAndRestore(root, token, roster, source) {
    ClearEscapeAutoState(root, token);
    RestoreTopBarPlaceholderIfAutoInactive(root, roster, source);
    return false;
  }

  function StopEscapeAutoForTransition(root, source, roster, transition) {
    StopShowRankAutomationForHudTransition(
      root,
      source,
      roster,
      transition.reason,
    );
    return false;
  }

  function CompleteEscapeAutoMaxSteps(root, token, roster) {
    var preloadLoaded;
    ClearEscapeAutoState(root, token);
    SetPanelAttribute(
      root,
      "showrank_escape_auto_completed_sig",
      BuildShowRankIdleSignature(roster),
    );
    preloadLoaded = EscapePreloadFromCache(
      root,
      "escape_auto_complete_max_steps",
      roster,
    );
    SetTopBarPlaceholderForCandidates(roster.topbar, "escape_auto_max_steps");
    ScheduleCleanupAfterAutoComplete(
      root,
      "escape_auto_complete_max_steps",
      preloadLoaded,
    );
  }

  function CompleteEscapeAutoNoMoreWork(root, token, roster) {
    var preloadLoaded;
    ClearEscapeAutoState(root, token);
    preloadLoaded = EscapePreloadFromCache(
      root,
      "escape_auto_complete_no_more_work",
      roster,
    );
    RestoreTopBarPlaceholderIfAutoInactive(
      root,
      roster,
      "escape_auto_no_more_work",
    );
    ScheduleCleanupAfterAutoComplete(
      root,
      "escape_auto_complete_no_more_work",
      preloadLoaded,
    );
  }

  function EscapeAutoStep(root, token, step, maxSteps, rosterSnapshot) {
    var currentToken = GetPanelAttribute(
      root,
      "showrank_escape_auto_token",
      "",
    );
    var didWork = false;
    var hasActiveOpen = false;
    var roster;
    var transition;
    if (!token || currentToken !== token) {
      return false;
    }
    roster = rosterSnapshot || BuildEscapeRoster(root);
    if (IsShowRankRuntimeIdleActive(root, roster, "escape_auto_step"))
      return StopEscapeAutoAndRestore(root, token, roster, "escape_auto_idle");
    transition = ReadHudTransitionInfo(root, roster);

    if (IsHudTransitionStopReason(transition.reason))
      return StopEscapeAutoForTransition(
        root,
        "escape_auto_step",
        roster,
        transition,
      );
    MarkShowRankMatchActive(root);
    if (!AutoProbeRosterReady(roster, transition))
      return StopEscapeAutoAndRestore(
        root,
        token,
        roster,
        "escape_auto_not_ready",
      );
    if (step >= maxSteps) {
      maxSteps = MaybeExtendEscapeAutoForNoEffect(root, roster, step, maxSteps);
      if (step < maxSteps) return EscapeAutoStep(root, token, step, maxSteps, roster);
      CompleteEscapeAutoMaxSteps(root, token, roster);
      return false;
    }
    SetPanelAttribute(root, "showrank_escape_auto_step", step + 1);
    SetPanelAttribute(
      root,
      "showrank_escape_auto_active_until",
      NowMs() + ESCAPE_AUTO_ACTIVE_TTL_MS,
    );
    didWork = SimulateNextVisiblePlayerListRowOpen(root, roster);

    if (!didWork) {
      CompleteEscapeAutoNoMoreWork(root, token, roster);
      return false;
    }
    hasActiveOpen = !!ReadActiveSimOpen(root);

    if (hasActiveOpen) {
      SetTopBarLoadingForCandidates(roster.topbar, "escape_auto_step");
      return true;
    }
    return EscapeAutoStep(root, token, step + 1, maxSteps, roster);
  }

  function ContinueEscapeAutoAfterAttempt(root, reason) {
    var token = GetPanelAttribute(root, "showrank_escape_auto_token", "");
    var step;
    var maxSteps;
    var roster;
    var transition;
    if (!token) return false;
    if (IsShowRankRuntimeIdleCurrent(root, "escape_auto_continue"))
      return false;
    roster = BuildEscapeRoster(root, true);
    transition = ReadHudTransitionInfo(root, roster);
    if (IsHudTransitionStopReason(transition.reason))
      return StopEscapeAutoForTransition(
        root,
        "escape_auto_continue",
        roster,
        transition,
      );
    step = Number(
      GetPanelAttribute(root, "showrank_escape_auto_step", "0") || 0,
    );
    maxSteps = Number(
      GetPanelAttribute(root, "showrank_escape_auto_max_steps", "0") || 0,
    );
    if (!isFinite(step) || step < 0) step = 0;
    if (!isFinite(maxSteps) || maxSteps <= 0) {
      ClearEscapeAutoState(root, token);
      EscapePreloadFromCache(root, "escape_auto_complete_missing_max_steps");
      return false;
    }
    return EscapeAutoStep(root, token, step, maxSteps);
  }

  function HasCurrentEscapeAutoToken(root, now) {
    var activeToken = GetPanelAttribute(root, "showrank_escape_auto_token", "");
    var activeUntil = Number(
      GetPanelAttribute(root, "showrank_escape_auto_active_until", "0") || 0,
    );
    return !!(activeToken && isFinite(activeUntil) && activeUntil > now);
  }

  function ShouldThrottleRecentEscapeAutoComplete(root, roster, now) {
    var completedAt = Number(
      GetPanelAttribute(root, "showrank_escape_auto_completed_at", "0") || 0,
    );
    var completedSig = GetPanelAttribute(
      root,
      "showrank_escape_auto_completed_sig",
      "",
    );
    var currentSig = BuildShowRankIdleSignature(roster);
    return !!(
      isFinite(completedAt) &&
      completedAt > 0 &&
      now - completedAt >= 0 &&
      now - completedAt < ESCAPE_AUTO_RECENT_COMPLETE_MS &&
      (!completedSig || completedSig === currentSig)
    );
  }

  function StartEscapeAutoStep(root, roster, now) {
    var token = String(now) + "_escape_auto";
    var maxSteps = roster.rows.length;
    SetPanelAttribute(root, "showrank_escape_auto_token", token);
    SetPanelAttribute(root, "showrank_escape_auto_step", "0");
    SetPanelAttribute(root, "showrank_escape_auto_max_steps", maxSteps);
    SetPanelAttribute(root, "showrank_escape_auto_no_effect_count", "0");
    SetPanelAttribute(root, "showrank_sim_roster_next_row_index", "0");
    SetPanelAttribute(
      root,
      "showrank_escape_auto_active_until",
      now + ESCAPE_AUTO_ACTIVE_TTL_MS,
    );
    EscapeAutoStep(root, token, 0, maxSteps, roster);
  }


  function HandleEscapeAutoNotReady(ctx, scheduleReadyRetry) {
    var waitReason =
      !ctx.roster.rows || ctx.roster.rows.length !== 12
        ? "rows_not_ready"
        : "roster_not_confirmed";
    if (scheduleReadyRetry)
      ScheduleEscapeAutoReadyRetry(ctx.root, ctx.source, ctx.roster);
    ScheduleTopBarWaitRetry(ctx.root, ctx.source, ctx.roster, waitReason);
    RestoreTopBarPlaceholderIfAutoInactive(
      ctx.root,
      ctx.roster,
      ctx.source + "_not_ready",
    );
    return 0;
  }

  function EnsureEscapeAutoPreloaded(ctx) {
    if (!ctx.preloaded) {
      ctx.loaded = EscapePreloadFromCache(ctx.root, ctx.source, ctx.roster);
      ctx.preloaded = true;
    }
    return ctx.loaded;
  }

  function StopEscapeAutoPopulateForTransition(ctx) {
    StopShowRankAutomationForHudTransition(
      ctx.root,
      ctx.source,
      ctx.roster,
      ctx.transition.reason,
    );
    return 0;
  }

  function WaitEscapeAutoPopulateForTransition(ctx) {
    ScheduleTopBarWaitRetry(
      ctx.root,
      ctx.source,
      ctx.roster,
      ctx.transition.reason,
    );
    RestoreTopBarPlaceholderIfAutoInactive(
      ctx.root,
      ctx.roster,
      ctx.source + "_transition_wait",
    );
    return 0;
  }

  function ReadEscapeAutoRuntimeIdleLoaded(ctx) {
    return Number(
      GetPanelAttribute(
        ctx.root,
        "showrank_runtime_idle_loaded",
        REQUIRED_LOADED,
      ) || REQUIRED_LOADED,
    );
  }

  function ReadEscapeAutoReadinessFacts(ctx) {
    var facts = {
      transitionStop: false,
      transitionWait: false,
      runtimeIdleActive: false,
      runtimeIdleLoaded: 0,
      autoProbeReady: false,
    };
    facts.transitionStop = !!(
      ctx.transition && IsHudTransitionStopReason(ctx.transition.reason)
    );
    facts.transitionWait = !!(
      !facts.transitionStop &&
      ctx.transition &&
      ctx.transition.reason
    );
    facts.runtimeIdleActive = IsShowRankRuntimeIdleActive(
      ctx.root,
      ctx.roster,
      ctx.source,
    );
    facts.runtimeIdleLoaded = facts.runtimeIdleActive
      ? ReadEscapeAutoRuntimeIdleLoaded(ctx)
      : 0;
    facts.autoProbeReady = AutoProbeRosterReady(ctx.roster, ctx.transition);
    return facts;
  }


  function BuildEscapeAutoPlannerFacts(ctx) {
    var triggerSig = EscapeMenuAutoTriggerSignature(ctx.roster);
    var usedTriggerSig = GetPanelAttribute(
      ctx.root,
      "showrank_escape_menu_auto_trigger_sig",
      "",
    );
    var transitionReason =
      ctx.transition && ctx.transition.reason
        ? ctx.transition.reason
        : "active";
    var facts = {
      source: ctx.sourceName,
      transitionReason: transitionReason,
      transitionStops: !!(
        ctx.transition && IsHudTransitionStopReason(ctx.transition.reason)
      ),
      runtimeIdleActive: !!ctx.facts.runtimeIdleActive,
      readinessKind:
        (ctx.roster && ctx.roster.readinessKind) ||
        (EscapeRosterReady(ctx.roster)
          ? "escape"
          : TopBarOnlyRosterReady(ctx.roster)
            ? "topbar_only"
            : "wait"),
      readinessReason:
        (ctx.roster && ctx.roster.readinessReason) || "",
      escapeRosterReady: EscapeRosterReady(ctx.roster),
      topBarOnlyReady: TopBarOnlyRosterReady(ctx.roster),
      hudActiveForTopBarOnlyAuto: IsHudActiveForTopBarOnlyAuto(ctx.transition),
      escapePlayersOpen: IsEscapePlayersMenuOpen(ctx.root),
      hasAutoTriggerSignature: !!triggerSig,
      autoTriggerUsed: !!triggerSig && usedTriggerSig === triggerSig,
      autoProbeRosterReady: !!ctx.facts.autoProbeReady,
      stableRoster:
        GetPanelAttribute(
          ctx.root,
          "showrank_escape_roster_stable_sig",
          "",
        ) === BuildShowRankIdentitySignature(ctx.roster),
      loaded: CountRosterLoadedCandidates(ctx.roster.topbar),
      requiredLoaded: REQUIRED_LOADED,
      activeSimOpen: !!ReadActiveSimOpen(ctx.root),
      activeToken: HasCurrentEscapeAutoToken(ctx.root, ctx.now),
      recentComplete: ShouldThrottleRecentEscapeAutoComplete(
        ctx.root,
        ctx.roster,
        ctx.now,
      ),
    };
    return facts;
  }

  function EscapeAutoPlannerDecision(
    step,
    shouldPreload,
    shouldRestorePlaceholder,
    shouldScheduleReadyRetry,
  ) {
    return {
      step: step,
      shouldPreload: !!shouldPreload,
      shouldRestorePlaceholder: !!shouldRestorePlaceholder,
      shouldScheduleReadyRetry: !!shouldScheduleReadyRetry,
    };
  }

  function ClassifyEscapeAutoPlannerStep(ctx) {
    var facts = BuildEscapeAutoPlannerFacts(ctx);
    ctx.planFacts = facts;
    if (facts.transitionStops)
      return EscapeAutoPlannerDecision("transition_stop", false, true, false);
    if (facts.transitionReason && facts.transitionReason !== "active")
      return EscapeAutoPlannerDecision("transition_wait", false, true, false);
    if (facts.runtimeIdleActive)
      return EscapeAutoPlannerDecision("runtime_idle", false, false, false);
    if (
      !facts.autoProbeRosterReady &&
      SourceShouldWaitForEscapeMenuTrigger(ctx.root, ctx.sourceName, ctx.roster)
    )
      return EscapeAutoPlannerDecision(
        "not_ready_passive",
        false,
        true,
        false,
      );
    if (!facts.autoProbeRosterReady)
      return EscapeAutoPlannerDecision("not_ready_intent", false, true, true);
    if (
      facts.loaded >= facts.requiredLoaded &&
      (facts.escapeRosterReady || facts.topBarOnlyReady)
    )
      return EscapeAutoPlannerDecision("preload_complete", true, false, false);
    if (facts.activeSimOpen)
      return EscapeAutoPlannerDecision("active_sim_open", true, false, false);
    if (facts.activeToken)
      return EscapeAutoPlannerDecision("active_token", true, true, false);
    if (facts.recentComplete)
      return EscapeAutoPlannerDecision("recent_complete", true, true, false);
    if (!SourceAllowsProfileAutoOpen(ctx.root, ctx.sourceName, ctx.roster))
      return EscapeAutoPlannerDecision("source_blocked", true, true, false);
    if (!facts.stableRoster)
      return EscapeAutoPlannerDecision("wait_stable", true, true, false);
    return EscapeAutoPlannerDecision("start_auto", true, false, false);
  }

  function ApplyEscapeAutoPlannerStep(ctx, decision) {
    var handledLoaded;
    if (!decision) return -1;
    if (decision.step === "transition_stop")
      return StopEscapeAutoPopulateForTransition(ctx);
    if (decision.step === "transition_wait")
      return WaitEscapeAutoPopulateForTransition(ctx);
    if (decision.step === "runtime_idle") return ctx.facts.runtimeIdleLoaded;
    if (
      decision.step === "not_ready_passive" ||
      decision.step === "not_ready_intent"
    )
      return HandleEscapeAutoNotReady(
        ctx,
        decision.shouldScheduleReadyRetry,
      );
    if (decision.shouldPreload) EnsureEscapeAutoPreloaded(ctx);
    if (decision.step === "source_blocked")
      return HandleEscapeAutoSourceBlocked(ctx);
    if (decision.step === "wait_stable") {
      HasStableEscapeRoster(ctx.root, ctx.roster, ctx.source);
      return WaitEscapeAutoForStableRoster(ctx);
    }
    if (
      decision.step === "preload_complete" ||
      decision.step === "active_sim_open"
    ) {
      handledLoaded = FinishEscapeAutoIfPreloadComplete(ctx);
      return handledLoaded >= 0
        ? handledLoaded
        : FinishEscapeAutoIfTemporarilyBlocked(ctx);
    }
    if (
      decision.step === "active_token" ||
      decision.step === "recent_complete"
    )
      return FinishEscapeAutoIfTemporarilyBlocked(ctx);
    return -1;
  }



  function FinishEscapeAutoIfPreloadComplete(ctx) {
    if (
      ctx.loaded < REQUIRED_LOADED ||
      !(EscapeRosterReady(ctx.roster) || TopBarOnlyRosterReady(ctx.roster))
    )
      return -1;
    if (EscapeRosterReady(ctx.roster)) {
      EnterShowRankRuntimeIdle(ctx.root, ctx.roster, ctx.loaded, ctx.source);
      return ctx.loaded;
    }
    UpdateTeamAverageRanks(
      ctx.root,
      ctx.rawSource || "escape_auto_topbar_only_ready",
      ctx.roster.topbar,
    );
    return ctx.loaded;
  }

  function FinishEscapeAutoIfTemporarilyBlocked(ctx) {
    if (ReadActiveSimOpen(ctx.root)) return ctx.loaded;
    if (HasCurrentEscapeAutoToken(ctx.root, ctx.now)) {
      RestoreTopBarPlaceholderIfAutoInactive(
        ctx.root,
        ctx.roster,
        ctx.source + "_token_without_active_open",
      );
      return ctx.loaded;
    }
    if (ShouldThrottleRecentEscapeAutoComplete(ctx.root, ctx.roster, ctx.now)) {
      RestoreTopBarPlaceholderIfAutoInactive(
        ctx.root,
        ctx.roster,
        ctx.source + "_recent_complete",
      );
      return ctx.loaded;
    }
    return -1;
  }

  function HandleEscapeAutoSourceBlocked(ctx) {
    if (SourceIsRowReadyAutoSource(ctx.sourceName)) {
      if (!HasStableEscapeRoster(ctx.root, ctx.roster, ctx.source)) {
        RestoreTopBarPlaceholderIfAutoInactive(
          ctx.root,
          ctx.roster,
          ctx.source + "_wait_stable_row_ready",
        );
        return ctx.loaded;
      }
    }
    RestoreTopBarPlaceholderIfAutoInactive(
      ctx.root,
      ctx.roster,
      ctx.source + "_source_blocked",
    );
    return ctx.loaded;
  }

  function WaitEscapeAutoForStableRoster(ctx) {
    RestoreTopBarPlaceholderIfAutoInactive(
      ctx.root,
      ctx.roster,
      ctx.source + "_wait_stable_roster",
    );
    return ctx.loaded;
  }

  function ArmEscapeMenuAutoTrigger(ctx) {
    var triggerSig;
    if (!IsEscapeMenuAutoTriggerAvailable(ctx.root, ctx.sourceName, ctx.roster))
      return;
    triggerSig = EscapeMenuAutoTriggerSignature(ctx.roster);
    SetPanelAttribute(
      ctx.root,
      "showrank_escape_menu_auto_trigger_sig",
      triggerSig,
    );
  }

  function EscapeAutoPopulate(
    panel,
    source,
    rosterSnapshot,
    transitionSnapshot,
  ) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var autoSource = source || "escape_auto";
    var roster = rosterSnapshot || BuildEscapeRoster(root, true);
    var ctx = {
      root: root,
      source: autoSource,
      rawSource: source,
      sourceName: NormalizeTopBarWaitSource(autoSource),
      roster: roster,
      transition: transitionSnapshot || ReadHudTransitionInfo(root, roster),
      loaded: 0,
      now: NowMs(),
      preloaded: false,
    };
    var plannerDecision;
    var handledLoaded;
    ctx.facts = ReadEscapeAutoReadinessFacts(ctx);
    plannerDecision = ClassifyEscapeAutoPlannerStep(ctx);
    handledLoaded = ApplyEscapeAutoPlannerStep(ctx, plannerDecision);
    if (handledLoaded >= 0) return handledLoaded;
    handledLoaded = FinishEscapeAutoIfPreloadComplete(ctx);
    if (handledLoaded >= 0) return handledLoaded;
    handledLoaded = FinishEscapeAutoIfTemporarilyBlocked(ctx);
    if (handledLoaded >= 0) return handledLoaded;
    if (plannerDecision.step !== "start_auto") return ctx.loaded;
    ArmEscapeMenuAutoTrigger(ctx);
    StartEscapeAutoStep(ctx.root, ctx.roster, ctx.now);
    return ctx.loaded;
  }

  function EscapeAutoPopulateFromRowReady(panel, source) {
    var root = IsPanelValid(panel) ? panel : GetContextPanel();
    var sourceName = source || "escape_menu_players_list_row_ready";
    var result = ScheduleCoalescedRuntimeCall(
      root,
      "showrank_escape_row_ready_pending",
      sourceName,
      sourceName,
      sourceName + "_coalesced",
      sourceName + "_coalesced",
      EscapeAutoPopulate,
    );
    if (result === null) return EscapeAutoPopulate(root, sourceName);
    return result === true ? 0 : result || 0;
  }

  function ClearEscapeOpenWatch(root, token) {
    var docRoot = GetDocumentRoot(root);
    if (!IsPanelValid(docRoot)) return false;
    if (
      token &&
      GetPanelAttribute(docRoot, "showrank_escape_open_watch_token", "") !==
        token
    )
      return false;
    SetPanelAttribute(docRoot, "showrank_escape_open_watch_token", "");
    SetPanelAttribute(docRoot, "showrank_escape_open_watch_count", "");
    SetPanelAttribute(docRoot, "showrank_escape_intent_pending", "");
    return true;
  }

  function HasActiveEscapeAuto(root) {
    var activeUntil = Number(
      GetPanelAttribute(root, "showrank_escape_auto_active_until", "0") || 0,
    );
    return (
      !!GetPanelAttribute(root, "showrank_escape_auto_token", "") &&
      isFinite(activeUntil) &&
      activeUntil > NowMs()
    );
  }

  var EscapeAutoPopulateHasPendingWork = function(root, loaded) {
  return (
    Number(loaded || 0) >= REQUIRED_LOADED ||
    HasShowRankRuntimeIdle(root) ||
    HasActiveEscapeAuto(root) ||
    !!GetPanelAttribute(root, "showrank_escape_roster_stable_pending_sig", "") ||
    !!GetPanelAttribute(
      root,
      "showrank_topbar_ready_wait_retry_pending_sig",
      "",
    )
  ); };


  function ScheduleEscapeOpenWatchTick(root, source, token, count) {
    var watchSource = (source || "escape_menu_open") + "_open_watch";
    var delay =
      count < ESCAPE_OPEN_WATCH_FAST_RETRY_MAX
        ? ESCAPE_OPEN_WATCH_FAST_DELAY_SECONDS
        : ESCAPE_OPEN_WATCH_SLOW_DELAY_SECONDS;
    try {
      $.Schedule(delay, function () {
        var docRoot = GetDocumentRoot(root);
        var loaded;
        if (
          !IsPanelValid(docRoot) ||
          GetPanelAttribute(docRoot, "showrank_escape_open_watch_token", "") !==
            token
        )
          return;
        SetPanelAttribute(docRoot, "showrank_escape_intent_pending", "");
        if (IsShowRankRuntimeIdleCurrent(docRoot, watchSource, true)) {
          ClearEscapeOpenWatch(docRoot, token);
          return;
        }
        loaded = EscapeAutoPopulate(docRoot, watchSource);
        if (
          Number(loaded || 0) >= REQUIRED_LOADED ||
          IsShowRankRuntimeIdleCurrent(docRoot, watchSource + "_loaded", true) ||
          HasActiveEscapeAuto(docRoot) ||
          count + 1 >= ESCAPE_OPEN_WATCH_RETRY_MAX
        ) {
          ClearEscapeOpenWatch(docRoot, token);
          return;
        }
        SetPanelAttribute(
          docRoot,
          "showrank_escape_open_watch_count",
          count + 1,
        );
        ScheduleEscapeOpenWatchTick(docRoot, source, token, count + 1);
      });
      return true;
    } catch (e0) {}
    ClearEscapeOpenWatch(root, token);
    return false;
  }


  function ClearEscapeVisibleWatch(root, token) {
    var docRoot = GetDocumentRoot(root);
    var currentToken;
    if (!IsPanelValid(docRoot)) return false;
    currentToken = GetPanelAttribute(docRoot, "showrank_escape_visible_watch_token", "");
    if (token && currentToken && currentToken !== token) return false;
    SetPanelAttribute(docRoot, "showrank_escape_visible_watch_token", "");
    SetPanelAttribute(docRoot, "showrank_escape_visible_watch_count", "");
    return true;
  }

  function ScheduleEscapeVisibleWatchTick(root, source, token, count) {
    if (count >= ESCAPE_VISIBLE_WATCH_RETRY_MAX) {
      ClearEscapeVisibleWatch(root, token);
      return false;
    }
    try {
      $.Schedule(ESCAPE_VISIBLE_WATCH_DELAY_SECONDS, function () {
        var docRoot = GetDocumentRoot(root);
        var currentToken;
        var roster;
        var loaded;
        var idleBefore;
        if (!IsPanelValid(docRoot)) return;
        currentToken = GetPanelAttribute(
          docRoot,
          "showrank_escape_visible_watch_token",
          "",
        );
        if (!currentToken || currentToken !== token) return;
        if (!IsEscapePlayersMenuOpen(docRoot)) {
          ClearEscapeVisibleWatch(docRoot, token);
          return;
        }
        idleBefore = HasShowRankRuntimeIdle(docRoot);
        roster = BuildTopBarOnlyAutoRoster(docRoot, "visible_watch_topbar");
        loaded = EscapeAutoPopulate(
          docRoot,
          (source || "escape_menu_visible_watch") + "_tick",
          roster,
        );
        if (
          (idleBefore && !HasShowRankRuntimeIdle(docRoot)) ||
          (!idleBefore && EscapeAutoPopulateHasPendingWork(docRoot, loaded))
        ) {
          ClearEscapeVisibleWatch(docRoot, token);
          return;
        }
        if (count + 1 >= ESCAPE_VISIBLE_WATCH_RETRY_MAX) {
          ClearEscapeVisibleWatch(docRoot, token);
          return;
        }
        SetPanelAttribute(
          docRoot,
          "showrank_escape_visible_watch_count",
          count + 1,
        );
        ScheduleEscapeVisibleWatchTick(docRoot, source, token, count + 1);
      });
      return true;
    } catch (e0) {
      ClearEscapeVisibleWatch(root, token);
      return false;
    }
  }

  function EnsureEscapeVisibleWatch(root, source) {
    var docRoot = GetDocumentRoot(root);
    var token;
    if (
      !IsPanelValid(docRoot) ||
      !(typeof $ !== "undefined" && $ && !!$.Schedule)
    )
      return false;
    if (GetPanelAttribute(docRoot, "showrank_escape_visible_watch_token", ""))
      return false;
    token = String(NowMs()) + "_escape_visible_watch";
    SetPanelAttribute(docRoot, "showrank_escape_visible_watch_token", token);
    SetPanelAttribute(docRoot, "showrank_escape_visible_watch_count", "0");
    return ScheduleEscapeVisibleWatchTick(docRoot, source, token, 0);
  }


  function IsManualRetrySource(sourceName) {
    return String(sourceName || "") === "players_list_retry_missing";
  }

  function StartManualRetryIntent(panel, source) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var sourceName = source || "players_list_retry_missing";
    var snapshot;
    var roster;
    var rowCount;
    var rowLoaded;
    if (!IsPanelValid(root)) return 0;
    snapshot = ReadTopBarCandidateSnapshot(root, true);
    roster = BuildEscapeRosterFromSnapshot(root, snapshot);
    rowCount = roster && roster.rows ? roster.rows.length : 0;
    rowLoaded = CountLoadedRowIdleParts(roster);
    if (
      snapshot.readiness &&
      snapshot.readiness.allRanksLoaded &&
      (!rowCount || rowLoaded >= rowCount)
    )
      return snapshot.loadedCount;
    ClearShowRankRuntimeIdle(root, "manual_retry_intent", sourceName, roster);
    ClearShowRankTransientState(root);
    return StartShowRankAutoloadIntent(root, sourceName);
  }

  function StartShowRankAutoloadIntent(panel, source) {
    var root = GetDocumentRoot(IsPanelValid(panel) ? panel : GetContextPanel());
    var sourceName = source || "escape_menu_open_main_menu";
    var token;
    var existingWatchToken;
    var roster;
    var loaded;
    if (!IsPanelValid(root)) return 0;
    if (!(typeof $ !== "undefined" && $ && !!$.Schedule)) {
      if (IsShowRankRuntimeIdleCurrent(root, sourceName, true)) {
        EnsureEscapeVisibleWatch(root, sourceName);
        return 0;
      }
      return EscapeAutoPopulate(root, sourceName);
    }
    existingWatchToken = GetPanelAttribute(
      root,
      "showrank_escape_open_watch_token",
      "",
    );
    if (
      GetPanelAttribute(root, "showrank_escape_intent_pending", "") === "yes" ||
      existingWatchToken
    ) {
      if (sourceName !== "escape_menu_onload") {
        loaded = EscapeAutoPopulate(root, sourceName);
        if (EscapeAutoPopulateHasPendingWork(root, loaded))
          ClearEscapeOpenWatch(root, existingWatchToken);
      }
      return 0;
    }
    if (IsShowRankRuntimeIdleCurrent(root, sourceName, true)) {
      EnsureEscapeVisibleWatch(root, sourceName);
      return 0;
    }
    roster = BuildEscapeRoster(root, true);
    if (roster.rows && roster.rows.length === 12) {
      loaded = EscapeAutoPopulate(root, sourceName, roster);
      if (EscapeAutoPopulateHasPendingWork(root, loaded))
        return 0;
    }
    token = String(NowMs()) + "_escape_open_watch";
    SetPanelAttribute(root, "showrank_escape_intent_pending", "yes");
    SetPanelAttribute(root, "showrank_escape_open_watch_token", token);
    SetPanelAttribute(root, "showrank_escape_open_watch_count", "0");
    if (!ScheduleEscapeOpenWatchTick(root, sourceName, token, 0))
      return EscapeAutoPopulate(root, sourceName);
    return 0;
  }

  function CreateBridge() {
    return {
      version: BRIDGE_VERSION,
    };
  }

  try {
    if (
      $[BRIDGE_KEY] &&
      $[BRIDGE_KEY].version === BRIDGE_VERSION &&
      $[BRIDGE_KEY].state
    )
      state = $[BRIDGE_KEY].state;
  } catch (e0) {}

  // Startup Bootstrap and XML Wrappers
  var startupPanel = $.GetContextPanel ? $.GetContextPanel() : null;
  var startupRole =
    DetectShowRankContextRole(startupPanel, "script_loaded") || "";


  function RunTopBarRootStartup() {
    var docRoot = GetDocumentRoot(startupPanel);
    var snapshot = ReadTopBarCandidateSnapshot(docRoot);
    var candidates = snapshot.candidates;
    UpdateEscapePrompt(docRoot, snapshot.loadedCount, 0, 0, snapshot.topbarCount);
    UpdateTeamAverageRanks(docRoot, "topbar_root_onload", candidates);
    ScheduleTopBarReadyCheck(docRoot, "topbar_root_onload");
    return true;
  }

  var SHOWRANK_STARTUP_ACTIONS = [
    [
      SHOWRANK_CONTEXT_ROLES.TOPBAR_PLAYER,
      function () {
        return !!RegisterTopBarPlayer(startupPanel, "topbar_player_onload");
      },
    ],
    [
      SHOWRANK_CONTEXT_ROLES.PLAYERS_LIST_ENTRY,
      function () {
        EscapeAutoPopulateFromRowReady(
          startupPanel,
          "escape_menu_players_list_row_ready",
        );
        return true;
      },
    ],
    [
      SHOWRANK_CONTEXT_ROLES.HUD_ESCAPE_MENU,
      function () {
        StartShowRankAutoloadIntent(startupPanel, "escape_menu_onload");
        EnsureEscapeVisibleWatch(startupPanel, "escape_menu_visible_watch");
        return true;
      },
    ],
    [
      SHOWRANK_CONTEXT_ROLES.PROFILE_CARD,
      function () {
        return !!TriggerProfileCard(startupPanel, "profile_card_onload");
      },
    ],
    [
      SHOWRANK_CONTEXT_ROLES.CONTEXT_MENU,
      function () {
        return !!TriggerProfileCard(startupPanel, "context_menu_player_onload");
      },
    ],
    [SHOWRANK_CONTEXT_ROLES.TOPBAR_ROOT, RunTopBarRootStartup],
  ];

  function GetStartupAction(role) {
    var i;
    for (i = 0; i < SHOWRANK_STARTUP_ACTIONS.length; i += 1)
      if (SHOWRANK_STARTUP_ACTIONS[i][0] === role)
        return SHOWRANK_STARTUP_ACTIONS[i][1];
    return null;
  }


  function ScheduleStartupAutoAction(attempt) {
    var action = GetStartupAction(startupRole);
    var delay = attempt > 0 ? 0.25 : 0.05;
    if (!action) return;

    try {
      if ($.Schedule) {
        $.Schedule(delay, function () {
          if (!action(attempt) && attempt < 4) ScheduleStartupAutoAction(attempt + 1);
        });
        return;
      }
    } catch (e0) {}
    if (!action(attempt) && attempt < 4) ScheduleStartupAutoAction(attempt + 1);
  }

  function InstallShowRankWrapper(wrapperName, handler) {
    var i;
    var allowed = false;
    for (i = 0; i < SHOWRANK_WRAPPER_ACTIONS.length; i += 1)
      if (SHOWRANK_WRAPPER_ACTIONS[i][0] === wrapperName) {
        allowed = RoleAllowsAction(startupRole, SHOWRANK_WRAPPER_ACTIONS[i][1]);
        break;
      }
    if (!startupRole || !allowed) {
      try {
        $[wrapperName] = undefined;
      } catch (e0) {}
      return false;
    }
    try {
      $[wrapperName] = function () {
        return handler.apply(this, arguments);
      };
    } catch (e1) {}
    return true;
  }
  function GetGuardedContextPanel(action, sourceName) {
    var panel = GetContextPanel();
    return GuardShowRankAction(action, panel, sourceName) ? panel : null;
  }

  function IsRuntimeBlockedForSource(panel, sourceName, allowCurrent) {
    if (allowCurrent)
      return IsShowRankRuntimeIdleCurrent(panel, sourceName, true);
    return IsRuntimeIdleLatched(panel);
  }

  var SHOWRANK_WRAPPER_INSTALLS = [
    ["ShowRankTriggerProfileCard", "profile_trigger", "profile_card", "profile"],
    ["ShowRankOpenStatlocker", "statlocker_open", "statlocker_button", "statlocker"],
    [
      "ShowRankContextMenuOpenStatlocker",
      "context_menu_statlocker_open",
      "context_menu_statlocker_button",
      "statlocker",
    ],
    [
      "ShowRankContextMenuOpenDeadlock",
      "deadlock_open",
      "context_menu_deadlock_button",
      "deadlock",
    ],
    ["ShowRankMarkTopBarHover", "topbar_player_hover", "topbar_hover", "topbar_hover"],
    ["ShowRankMarkPlayerListHover", "player_list_hover", "players_list_hover", "player_hover"],
    ["ShowRankClearPlayerListHover", "player_list_clear", "players_list_out", "player_clear"],
    ["ShowRankEscapePreloadFromPlayerList", "escape_preload", "escape", "escape_preload"],
    [
      "ShowRankRegisterPlayerListRowReady",
      "player_list_row_ready",
      "escape_menu_players_list_row_ready",
      "row_ready",
    ],
  ];


  function RunShowRankWrapper(entry, source) {
    var sourceName = source || entry[2];
    var kind = entry[3];
    var panel = GetGuardedContextPanel(entry[1], sourceName);
    if (!panel)
      return kind === "profile" || kind === "statlocker" || kind === "deadlock"
        ? ""
        : kind === "escape_preload" || kind === "row_ready"
          ? 0
          : false;
    if (kind === "profile") return TriggerProfileCard(panel, sourceName);
    if (kind === "statlocker") return OpenStatlocker(panel);
    if (kind === "deadlock") return OpenDeadlock(panel);
    if (kind === "escape_preload") {
      if (IsManualRetrySource(sourceName))
        return StartManualRetryIntent(panel, sourceName);
      if (IsRuntimeBlockedForSource(panel, sourceName, true))
        return GetRuntimeIdleLoaded(panel);
      return StartShowRankAutoloadIntent(panel, sourceName);
    }
    if (kind === "row_ready") {
      if (IsRuntimeBlockedForSource(panel, sourceName, true))
        return GetRuntimeIdleLoaded(panel);
      return EscapeAutoPopulateFromRowReady(panel, sourceName);
    }
    if (kind === "player_clear") {
      if (IsRuntimeBlockedForSource(panel, sourceName, false)) {
        ClearPlayerListHover(sourceName);
        return false;
      }
      return ClearPlayerListHover(sourceName);
    }
    if (IsRuntimeBlockedForSource(panel, sourceName, false)) return false;
    return kind === "topbar_hover"
      ? MarkTopBarHover(panel, sourceName)
      : MarkPlayerListHover(panel, sourceName);
  }

  function InstallShowRankWrapperEntry(entry) {
    InstallShowRankWrapper(entry[0], function (source) {
      return RunShowRankWrapper(entry, source);
    });
  }

  function InstallCommonWrappers() {
    var i;
    for (i = 0; i < SHOWRANK_WRAPPER_INSTALLS.length; i += 1)
      InstallShowRankWrapperEntry(SHOWRANK_WRAPPER_INSTALLS[i]);
    try {
      $["ShowRankOpenDeadlock"] = undefined;
    } catch (e1) {}
  }


  function PublishShowRankSharedApi() {
    var bridge;
    try {
      if (!$[BRIDGE_KEY] || $[BRIDGE_KEY].version !== BRIDGE_VERSION)
        $[BRIDGE_KEY] = CreateBridge();
      bridge = $[BRIDGE_KEY];
      bridge.state = state;
      bridge.api = {
        state: state,
        InstallShowRankWrapper: InstallShowRankWrapper,
        GuardShowRankAction: GuardShowRankAction,
        IsPanelValid: IsPanelValid,
        TriggerProfileCard: TriggerProfileCard,
        SetPanelAttribute: SetPanelAttribute,
        NowMs: NowMs,
        IsRuntimeIdleLatched: IsRuntimeIdleLatched,
        IsShowRankRuntimeIdleCurrent: IsShowRankRuntimeIdleCurrent,
        RegisterTopBarPlayer: RegisterTopBarPlayer,
        ReadRegisteredTopBarCandidate: ReadRegisteredTopBarCandidate,
        StoreManualTarget: StoreManualTarget,
        MarkPlayerListHover: MarkPlayerListHover,
        ClearPlayerListHover: ClearPlayerListHover,
        GetRuntimeIdleLoaded: GetRuntimeIdleLoaded,
        EscapeAutoPopulateFromRowReady: EscapeAutoPopulateFromRowReady,
        StartShowRankAutoloadIntent: StartShowRankAutoloadIntent,
      };
    } catch (e1) {}
  }

  InstallCommonWrappers();
  PublishShowRankSharedApi();
  ScheduleStartupAutoAction(0);
})();
