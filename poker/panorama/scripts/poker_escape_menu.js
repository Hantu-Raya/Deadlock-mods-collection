(() => {
  "use strict";
  const LOG_PREFIX = "[PokerMenu]";
  const TEST_READY_MESSAGE = "ready";
  const BridgeContract = {
    clientOutputEvent: "ClientUI_FireOutput",
    readyEvent: "PokerReadySeatsChanged",
    readyRequestEvent: "PokerReadySeatsRequest",
    readyClearRequestEvent: "PokerReadySeatsClearRequest",
    chatEvent: "PokerChatMessage",
    chatSnapshotRequestEvent: "PokerChatSnapshotRequest",
    chatSendRequestEvent: "PokerChatSendRequest",
    bluffDeckFastPollRequestEvent: "BluffDeckFastPollRequest",
    bluffDeckSendStatusEvent: "BluffDeckSendStatus",
    bluffDeckSendCancelRequestEvent: "BluffDeckSendCancelRequest",
    keys: {
      readySeats: "PokerReadySeats",
      readyRevision: "PokerReadyRevision",
      chatMessages: "PokerChatMessages",
      chatSequence: "PokerChatSequence",
      readyLastEvent: "PokerLastReadyEvent",
      localPlayerKey: "PokerLocalPlayerKey",
      localPlayerName: "PokerLocalPlayerName",
      pendingSelfAction: "PokerPendingSelfAction",
      partyState: "PokerPartyState",
      progressState: "PokerProgressState",
      bluffDeckMatchState: "BluffDeckMatchState",
      tableGameFastPollUntil: "TableGameFastPollUntil",
    },
  };
  const CLIENT_OUTPUT_EVENT = BridgeContract.clientOutputEvent;
  const READY_EVENT = BridgeContract.readyEvent;
  const READY_REQUEST_EVENT = BridgeContract.readyRequestEvent;
  const CHAT_EVENT = BridgeContract.chatEvent;
  const CHAT_SNAPSHOT_REQUEST_EVENT = BridgeContract.chatSnapshotRequestEvent;
  const READY_SEATS_KEY = BridgeContract.keys.readySeats;
  const READY_REVISION_KEY = BridgeContract.keys.readyRevision;
  const READY_CLEAR_REQUEST_EVENT = BridgeContract.readyClearRequestEvent;
  const LOCAL_PLAYER_KEY = BridgeContract.keys.localPlayerKey;
  const LOCAL_PLAYER_NAME_KEY = BridgeContract.keys.localPlayerName;
  const PENDING_SELF_ACTION_KEY = BridgeContract.keys.pendingSelfAction;
  const BLUFF_DECK_MATCH_STATE_KEY = BridgeContract.keys.bluffDeckMatchState;
  const TABLE_GAME_FAST_POLL_UNTIL_KEY = BridgeContract.keys.tableGameFastPollUntil;
  const PARTY_STATE_KEY = BridgeContract.keys.partyState;
  const PROGRESS_STATE_KEY = BridgeContract.keys.progressState;
  const METRICS_KEY = "PokerRuntimeMetrics";
  const PARTY_LEADER_PREFIX = "[party leader]";
  const PARTY_JOIN_PREFIX = "[party join]";
  const PARTY_LEAVE_PREFIX = "[party leave]";
  const PROGRESS_CODE_PREFIX = "POKERPROG1";
  const PROGRESS_CODE_SECRET = "DeadlockPokerProgressV1";
  const RESUME_LEADER_PREFIX = "[resume leader]";
  const RESUME_READY_PREFIX = "[resume ready]";
  const MATCH_END_PREFIX = "[match end]";
  const PROGRESS_OFFER_PREFIX = "[progress offer]";
  const PROGRESS_CHUNK_PREFIX = "[progress chunk]";
  const PROGRESS_SHARE_CHUNK_SIZE = 24;
  const PROGRESS_SHARE_SEND_INTERVAL = 0.85;
  const PROGRESS_SHARE_START_GRACE_MS = 1200;
  const LEADER_LEAVE_AFTER_MATCH_END_WINDOW_MS = 10000;
  const START_ROSTER_MARKER = "roster";
  const START_HAND_MARKER = "hand";
  const START_LEADER_MARKER = "leader";
  const START_SEED_MARKER = "seed";
  const MIN_READY_PLAYERS = 2;
  const MAX_TABLE_PLAYERS = 12;
  const STARTING_STACK = 10000;
  const SMALL_BLIND = 100;
  const BIG_BLIND = 200;
  const ACTION_BET_EXTRA = 300;
  const MAX_GAME_LOG_ENTRIES = 12;
  const PENDING_SELF_ACTION_TTL_MS = 5000;
  const BLUFF_PREPARE_DEADLINE_MS = 3500;
  const BLUFF_ECHO_DEADLINE_MS = 3000;
  const BLUFF_DECK_HISTORY_LIMIT = 12;
  let bluffRequestSerial = 0;
  const STATUS_LOCK_MS = 1600;
  const STATUS_PRIORITY = {
    ready: 10,
    sync: 20,
    gate: 30,
    progress: 40,
    resume: 50,
    action: 60,
    error: 70,
  };
  const IDS = {
    rootButton: "PokerMenuButton", panel: "PokerAnitaPanel", tableWindow: "PokerTableWindow", lobbyWindow: "PokerLobbyWindow",
    playersWindow: "PokerPlayersWindow", historyWindow: "PokerHistoryWindow", actionsWindow: "PokerActionsWindow", closeButton: "PokerCloseButton", backButton: "PokerBackButton",
    readyChatButton: "PokerReadyChatButton", startButton: "PokerStartButton", startButtonLabel: "PokerStartButtonLabel", endButton: "PokerEndMatchButton",
    leaveLobbyButton: "PokerLeaveLobbyButton", readyCount: "PokerReadyCountLabel", seatsList: "PokerSeatsList", status: "PokerStatusLabel",
    pot: "PokerPotLabel", potCenter: "PokerPotCenter", potCenterAmount: "PokerPotCenterAmount", potChips: "PokerPotChips",
    phase: "PokerPhaseLabel", tableSurface: "PokerTableSurface", announcer: "PokerAnnouncerOverlay",
    announcerTitle: "PokerAnnouncerTitle", announcerBody: "PokerAnnouncerBody", community: "PokerCommunityCards", players: "PokerPlayersList",
    actions: "PokerActionButtons", tableSeats: "PokerTableSeats", log: "PokerGameLog", chat: "Chat",
    chatControls: "ChatControls", chatInput: "ChatInput", chatTargetLabel: "ChatTargetLabel", partyControls: "PokerPartyControls",
    partyHostButton: "PokerHostPartyButton", partyJoinButton: "PokerJoinPartyButton", partyStatus: "PokerPartyStatusLabel", progressControls: "PokerProgressControls",
    exportProgressButton: "PokerExportProgressButton", importProgressButton: "PokerImportProgressButton", progressCodeInput: "PokerProgressCodeInput", progressCodeLabel: "PokerProgressCodeLabel",
    resumeControls: "PokerResumeControls", resumeLeaderButton: "PokerResumeLeaderButton", resumeReadyButton: "PokerResumeReadyButton", resumeStatus: "PokerResumeStatusLabel",
    resumeLeaderList: "PokerResumeLeaderList",
    pickerWindow: "TableGamePickerWindow", pickerWarning: "TableGamePickerWarning", pickerPokerButton: "TableGamePickerPokerButton", pickerPokerLabel: "TableGamePickerPokerLabel", pickerBluffButton: "TableGamePickerBluffButton", pickerBluffLabel: "TableGamePickerBluffLabel",
    bluffWindow: "BluffDeckWindow", bluffHistoryWindow: "BluffDeckHistoryWindow", bluffCardTable: "BluffDeckCardTable", bluffTableSeats: "BluffDeckTableSeats", bluffCloseButton: "BluffDeckCloseButton", bluffBackButton: "BluffDeckBackButton", bluffHeader: "BluffDeckHeaderLabel", bluffAnnouncement: "BluffDeckAnnouncementOverlay", bluffAnnouncementTitle: "BluffDeckAnnouncementTitle", bluffAnnouncementBody: "BluffDeckAnnouncementBody", bluffHostButton: "BluffDeckHostButton", bluffJoinButton: "BluffDeckJoinButton",
    bluffLeaveButton: "BluffDeckLeaveButton", bluffStartButton: "BluffDeckStartButton", bluffEndButton: "BluffDeckEndButton",
    bluffTarget: "BluffDeckTargetLabel", bluffTargetCard: "BluffDeckTargetCard", bluffTurn: "BluffDeckTurnLabel", bluffPrevious: "BluffDeckPreviousPlayLabel",
    bluffPlayedCards: "BluffDeckPlayedCards", bluffSlots: "BluffDeckCardSlots", bluffAction: "BluffDeckActionLabel", bluffPlayButton: "BluffDeckPlayButton",
    bluffChallengeButton: "BluffDeckChallengeButton", bluffPending: "BluffDeckPendingLabel", bluffResult: "BluffDeckResultLabel", bluffLog: "BluffDeckLog",
    bluffSlot0: "BluffDeckSlot0", bluffSlot1: "BluffDeckSlot1", bluffSlot2: "BluffDeckSlot2", bluffSlot3: "BluffDeckSlot3", bluffSlot4: "BluffDeckSlot4",
  };
  const PANEL_BINDINGS = [
    ["menuButton", "rootButton"], ["panel", "panel"], ["tableWindow", "tableWindow"], ["lobbyWindow", "lobbyWindow"],
    ["playersWindow", "playersWindow"], ["historyWindow", "historyWindow"], ["actionsWindow", "actionsWindow"], ["closeButton", "closeButton"], ["backButton", "backButton"],
    ["readyChatButton", "readyChatButton"], ["startButton", "startButton"], ["startButtonLabel", "startButtonLabel"], ["endButton", "endButton"],
    ["leaveLobbyButton", "leaveLobbyButton"], ["partyControls", "partyControls"], ["partyHostButton", "partyHostButton"], ["partyJoinButton", "partyJoinButton"],
    ["partyStatus", "partyStatus"], ["progressControls", "progressControls"], ["exportProgressButton", "exportProgressButton"], ["importProgressButton", "importProgressButton"],
    ["progressCodeInput", "progressCodeInput"], ["progressCodeLabel", "progressCodeLabel"], ["resumeControls", "resumeControls"], ["resumeLeaderButton", "resumeLeaderButton"],
    ["resumeReadyButton", "resumeReadyButton"], ["resumeStatus", "resumeStatus"], ["resumeLeaderList", "resumeLeaderList"], ["readyCount", "readyCount"],
    ["seatsList", "seatsList"], ["status", "status"], ["pot", "pot"], ["potCenter", "potCenter"], ["potCenterAmount", "potCenterAmount"], ["potChips", "potChips"], ["phase", "phase"],
    ["tableSurface", "tableSurface"], ["announcer", "announcer"], ["announcerTitle", "announcerTitle"], ["announcerBody", "announcerBody"],
    ["community", "community"], ["players", "players"], ["tableSeats", "tableSeats"], ["actions", "actions"], ["log", "log"],
    ["pickerWindow", "pickerWindow"], ["pickerWarning", "pickerWarning"], ["pickerPokerButton", "pickerPokerButton"], ["pickerPokerLabel", "pickerPokerLabel"], ["pickerBluffButton", "pickerBluffButton"], ["pickerBluffLabel", "pickerBluffLabel"],
    ["bluffWindow", "bluffWindow"], ["bluffHistoryWindow", "bluffHistoryWindow"], ["bluffCardTable", "bluffCardTable"], ["bluffTableSeats", "bluffTableSeats"], ["bluffCloseButton", "bluffCloseButton"], ["bluffBackButton", "bluffBackButton"], ["bluffHeader", "bluffHeader"], ["bluffAnnouncement", "bluffAnnouncement"], ["bluffAnnouncementTitle", "bluffAnnouncementTitle"], ["bluffAnnouncementBody", "bluffAnnouncementBody"], ["bluffHostButton", "bluffHostButton"], ["bluffJoinButton", "bluffJoinButton"],
    ["bluffLeaveButton", "bluffLeaveButton"], ["bluffStartButton", "bluffStartButton"], ["bluffEndButton", "bluffEndButton"], ["bluffTarget", "bluffTarget"], ["bluffTargetCard", "bluffTargetCard"],
    ["bluffTurn", "bluffTurn"], ["bluffPrevious", "bluffPrevious"], ["bluffPlayedCards", "bluffPlayedCards"], ["bluffSlots", "bluffSlots"],
    ["bluffAction", "bluffAction"], ["bluffPlayButton", "bluffPlayButton"], ["bluffChallengeButton", "bluffChallengeButton"], ["bluffPending", "bluffPending"],
    ["bluffResult", "bluffResult"], ["bluffLog", "bluffLog"], ["bluffSlot0", "bluffSlot0"], ["bluffSlot1", "bluffSlot1"],
    ["bluffSlot2", "bluffSlot2"], ["bluffSlot3", "bluffSlot3"], ["bluffSlot4", "bluffSlot4"],
  ];
  const BOOT_REQUIRED_PANELS = ["menuButton", "panel", "tableWindow", "lobbyWindow", "playersWindow", "actionsWindow", "readyChatButton", "partyHostButton", "partyJoinButton", "startButton", "seatsList", "players", "tableSeats"];
  const CLASSES = {
    visible: "PokerMenuVisible", open: "Open", active: "Active", eligible: "Eligible", disabled: "Disabled", readOnly: "ReadOnly",
    hidden: "PokerHidden", current: "Current", folded: "Folded", eliminated: "Eliminated", winner: "PotWinner", red: "RedSuit", black: "BlackSuit",
  };
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const SUITS = ["S", "H", "D", "C"];
  const TABLE_EDGE_SEAT_LIMIT = MAX_TABLE_PLAYERS;
  const TABLE_SEAT_LAYOUTS = {
    1: ["SeatBottom"],
    2: ["SeatLeft", "SeatRight"],
    3: ["SeatLeft", "SeatTopRight", "SeatBottomRight"],
    4: ["SeatTopLeft", "SeatTopRight", "SeatBottomRight", "SeatBottomLeft"],
    5: ["SeatLeft", "SeatTopLeft", "SeatTopRight", "SeatRight", "SeatBottom"],
    6: ["SeatTopLeft", "SeatTopRight", "SeatRight", "SeatBottomRight", "SeatBottomLeft", "SeatLeft"],
    7: ["SeatTopLeft", "SeatTopCenter", "SeatTopRight", "SeatRightUpper", "SeatRightLower", "SeatBottomRight", "SeatBottomLeft"],
    8: ["SeatTopFarLeft", "SeatTopLeft", "SeatTopRight", "SeatTopFarRight", "SeatRight", "SeatBottomRight", "SeatBottomLeft", "SeatLeft"],
    9: ["SeatTopFarLeft", "SeatTopLeft", "SeatTopRight", "SeatTopFarRight", "SeatRight", "SeatBottomRight", "SeatBottomCenter", "SeatBottomLeft", "SeatLeft"],
    10: ["SeatTopFarLeft", "SeatTopLeft", "SeatTopRight", "SeatTopFarRight", "SeatRightUpper", "SeatRightLower", "SeatBottomRight", "SeatBottomCenter", "SeatBottomLeft", "SeatLeft"],
    11: ["SeatTopFarLeft", "SeatTopLeft", "SeatTopRight", "SeatTopFarRight", "SeatRightUpper", "SeatRightLower", "SeatBottomFarRight", "SeatBottomRight", "SeatBottomLeft", "SeatBottomFarLeft", "SeatLeft"],
    12: ["SeatTopFarLeft", "SeatTopLeft", "SeatTopRight", "SeatTopFarRight", "SeatRightUpper", "SeatRightLower", "SeatBottomFarRight", "SeatBottomRight", "SeatBottomLeft", "SeatBottomFarLeft", "SeatLeftLower", "SeatLeftUpper"],
  };
  const POT_CHIP_ART_TIERS = [
    { value: 2500, className: "PokerPotStack2500", asset: "pot_2500_plus_mixed_chips_512.vtex", label: "$2500+" },
    { value: 1000, className: "PokerPotStack1000", asset: "pot_1000_black_chips_512.vtex", label: "$1000" },
    { value: 500, className: "PokerPotStack500", asset: "pot_500_green_chips_512.vtex", label: "$500" },
    { value: 300, className: "PokerPotStack300", asset: "pot_300_green_chips_512.vtex", label: "$300" },
    { value: 100, className: "PokerPotStack100", asset: "pot_100_red_chips_512.vtex", label: "$100" },
  ];
  const RANK_VALUE = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
    "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
  };
  const State = {
    isOpen: false,
    selectedTableGame: "",
    tablePickerRequested: false,
    pickerSourceGame: "",
    pendingTableSwitch: "",
    terminalTableGame: "",
    eventsBound: false,
    readyRevision: -1,
    readyCountValue: 0,
    lastSendMs: 0,
    lastLobbyLeaveMs: 0,
    refreshLoopStarted: false,
    processedChatSeq: 0,
    replayingChatSnapshot: false,
    sync: {
      waitingForReadySnapshot: false,
      waitingForChatSnapshot: false,
      lastReadySnapshotMs: 0,
      lastChatSnapshotMs: 0,
      openRequestMs: 0,
      reason: "",
    },
    statusModel: { text: "", priority: 0, lockUntilMs: 0 },
    renderCache: {
      communityCards: {},
      readySeatRows: {},
      resumeLeaderRows: {},
      playerRows: {},
      tableSeatRows: {},
      potChipRows: {},
      actionButtons: {},
      actionHint: null,
      actionButtonRow: null,
      customBetControls: null,
      customBetChoice: null,
      customBetRange: null,
      customBetRangeKey: "",
      logRows: {},
      tableTurnArrow: null,
      tableTurnArrowClass: "",
      renderQueued: false,
      renderReason: "",
      potDisplayValue: 0,
      potDisplayTarget: 0,
      potAnimationToken: 0,
      potDisplayInitialized: false,
    },
    localPlayerKey: "",
    bankrolls: {},
    game: null,
    bluffDeck: {
      game: null,
      selectedMask: 0,
      pending: null,
      transcript: [],
      revision: 0,
    },
    party: {
      id: "",
      mode: "none",
      leaderKey: "",
      leaderName: "",
      members: {},
      order: [],
    },
    resume: null,
    progressShare: defaultProgressShareState(),
    progressTransfers: {},
    pendingResumeStarts: {},
    requiresProgressImport: false,
    pendingPartyLeader: null,
    pendingLeaderLeaveAfterMatchEnd: null,
    resumeRequiresHostedParty: false,
    progressSharePartyId: "",
    progressShareRequested: false,
  };
  State.root = null;
  for (let i = 0; i < PANEL_BINDINGS.length; i += 1) State[PANEL_BINDINGS[i][0]] = null;
  function isValid(panel) {
    return !!(panel && (!panel.IsValid || panel.IsValid()));
  }
  function log(message) {
    try {
      $.Msg(LOG_PREFIX + " " + message);
    } catch (e) {}
  }
  function isTestMode() {
    try {
      return !!globalThis.__PokerTestMode;
    } catch (e) {
      return false;
    }
  }
  function shouldRunMenuWork() {
    return State.isOpen || isTestMode();
  }
  function getRoot(panel) {
    let cursor = panel;
    while (cursor && cursor.GetParent && cursor.GetParent()) cursor = cursor.GetParent();
    return cursor || panel;
  }
  function findChild(root, id) {
    if (!isValid(root) || typeof root.FindChildTraverse !== "function") return null;
    try {
      const found = root.FindChildTraverse(id);
      return isValid(found) ? found : null;
    } catch (e) {
      return null;
    }
  }
  function getConfig() {
    try {
      if (typeof GameUI !== "undefined" && GameUI.CustomUIConfig) return GameUI.CustomUIConfig();
    } catch (e) {}
    try {
      globalThis.__PokerFallbackConfig = globalThis.__PokerFallbackConfig || {};
      return globalThis.__PokerFallbackConfig;
    } catch (e) {
      return {};
    }
  }
  let bluffDeckHydrationCandidate = null;
  function getBluffDeckMatchState() {
    try {
      const stored = getConfig()[BLUFF_DECK_MATCH_STATE_KEY];
      if (!stored || typeof stored !== "object") return null;
      const sourceChatSeq = Number(stored.sourceChatSeq);
      if (stored.version !== 1 || !Number.isInteger(sourceChatSeq) || sourceChatSeq < 0 || !stored.game) {
        delete getConfig()[BLUFF_DECK_MATCH_STATE_KEY];
        return null;
      }
      return { version: 1, sourceChatSeq: sourceChatSeq, game: stored.game };
    } catch (e) {
      try { delete getConfig()[BLUFF_DECK_MATCH_STATE_KEY]; } catch (ignored) {}
      return null;
    }
  }
  function saveBluffDeckMatchState(sourceChatSeq) {
    const game = State.bluffDeck && State.bluffDeck.game;
    if (!game) return false;
    try {
      BluffDeckEngine.assertInvariants(game);
      const seq = Number(sourceChatSeq);
      if (!Number.isInteger(seq) || seq < 0) return false;
      const stored = { version: 1, sourceChatSeq: seq, game: copyForTest(game) };
      getConfig()[BLUFF_DECK_MATCH_STATE_KEY] = stored;
      State.bluffDeck.revision += 1;
      return true;
    } catch (e) {
      return false;
    }
  }
  function clearBluffDeckMatchState() {
    bluffDeckHydrationCandidate = null;
    try {
      delete getConfig()[BLUFF_DECK_MATCH_STATE_KEY];
    } catch (e) {}
    if (State.bluffDeck) {
      State.bluffDeck.game = null;
      resetBluffDeckTranscript();
    }
    return true;
  }
  function getActiveTableGameType() {
    if (State.game && State.game.active) return "poker";
    if (State.bluffDeck.game && State.bluffDeck.game.active) return "bluff-deck";
    return "";
  }
  function metricsEnabled() {
    try {
      return !!(isTestMode() || globalThis.__PokerMetricsEnabled);
    } catch (e) {
      return false;
    }
  }
  function getMetricsStore() {
    const config = getConfig();
    config[METRICS_KEY] = config[METRICS_KEY] || { counters: {}, timings: {} };
    config[METRICS_KEY].counters = config[METRICS_KEY].counters || {};
    config[METRICS_KEY].timings = config[METRICS_KEY].timings || {};
    return config[METRICS_KEY];
  }
  function resetMetrics() {
    const config = getConfig();
    config[METRICS_KEY] = { counters: {}, timings: {} };
    return config[METRICS_KEY];
  }
  function getMetricsSnapshot() {
    const store = getMetricsStore();
    return {
      counters: JSON.parse(JSON.stringify(store.counters || {})),
      timings: JSON.parse(JSON.stringify(store.timings || {})),
    };
  }
  function incrementMetric(name, amount) {
    if (!metricsEnabled()) return 0;
    const store = getMetricsStore();
    const key = String(name || "");
    if (!key) return 0;
    const delta = amount || 1;
    store.counters[key] = (Number(store.counters[key]) || 0) + delta;
    return store.counters[key];
  }
  function startMetric(name) {
    if (!metricsEnabled() || !name) return 0;
    return Date.now();
  }
  function endMetric(name, started) {
    if (!metricsEnabled() || !name || !started) return;
    const elapsed = Math.max(0, Date.now() - started);
    const store = getMetricsStore();
    const timing = store.timings[name] || { count: 0, totalMs: 0, maxMs: 0 };
    timing.count += 1;
    timing.totalMs += elapsed;
    timing.maxMs = Math.max(timing.maxMs || 0, elapsed);
    store.timings[name] = timing;
  }
  const PokerMetrics = {
    reset: resetMetrics,
    snapshot: getMetricsSnapshot,
    increment: incrementMetric,
    start: startMetric,
    end: endMetric,
  };
  function getReadySeats() {
    const config = getConfig();
    config[READY_SEATS_KEY] = config[READY_SEATS_KEY] || {};
    if (typeof config[READY_REVISION_KEY] !== "number") config[READY_REVISION_KEY] = 0;
    return config[READY_SEATS_KEY];
  }
  function getReadyRevision() {
    const config = getConfig();
    return typeof config[READY_REVISION_KEY] === "number" ? config[READY_REVISION_KEY] : 0;
  }
  function normalizeText(text) {
    return String(text || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9$]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function normalizePartyId(id) {
    return String(id || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function samePartyId(left, right) {
    const leftId = normalizePartyId(left);
    const rightId = normalizePartyId(right);
    return !!(leftId && rightId && leftId === rightId);
  }
  function normalizePlayerKey(sender) {
    return String(sender || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function isUnknownSender(sender) {
    const key = normalizePlayerKey(sender);
    return !key || key === normalizePlayerKey("<unknown>");
  }
  function rememberLocalPlayer(sender) {
    if (isUnknownSender(sender)) return;
    const key = normalizePlayerKey(sender);
    State.localPlayerKey = key;
    const config = getConfig();
    config[LOCAL_PLAYER_KEY] = key;
    config[LOCAL_PLAYER_NAME_KEY] = sender;
  }
  function getRememberedLocalPlayerName() {
    const config = getConfig();
    const name = String(config[LOCAL_PLAYER_NAME_KEY] || "").replace(/\s+/g, " ").trim();
    return isUnknownSender(name) ? "" : name;
  }
  function defaultPartyState() {
    return {
      id: "",
      mode: "none",
      leaderKey: "",
      leaderName: "",
      members: {},
      order: [],
    };
  }
  function sanitizePartyMode(mode) {
    return mode === "leader" || mode === "member" ? mode : "none";
  }
  function getPartyState() {
    const fallback = defaultPartyState();
    try {
      const config = getConfig();
      const stored = config[PARTY_STATE_KEY];
      if (!stored || typeof stored !== "object") return fallback;
      const party = defaultPartyState();
      party.id = String(stored.id || "").replace(/[^a-z0-9-]/gi, "");
      party.mode = sanitizePartyMode(stored.mode);
      party.leaderKey = normalizePlayerKey(stored.leaderKey || "");
      party.leaderName = isUnknownSender(stored.leaderName) ? "" : String(stored.leaderName || "").replace(/\s+/g, " ").trim();
      const members = stored.members && typeof stored.members === "object" ? stored.members : {};
      const keys = Object.keys(members);
      for (let i = 0; i < keys.length; i += 1) {
        const member = members[keys[i]];
        const key = normalizePlayerKey(member && (member.key || keys[i]));
        const name = member && member.name ? String(member.name).replace(/\s+/g, " ").trim() : "";
        if (key && !isUnknownSender(name)) party.members[key] = { key: key, name: name };
      }
      const order = stored.order && stored.order.length ? stored.order : keys;
      for (let i = 0; i < order.length; i += 1) {
        const key = normalizePlayerKey(order[i]);
        if (key && party.members[key] && party.order.indexOf(key) === -1) party.order.push(key);
      }
      if (party.leaderKey && party.members[party.leaderKey] && party.order.indexOf(party.leaderKey) !== 0) {
        party.order = [party.leaderKey].concat(party.order.filter((key) => key !== party.leaderKey));
      }
      return party;
    } catch (e) {
      return fallback;
    }
  }
  function savePartyState() {
    try {
      const config = getConfig();
      config[PARTY_STATE_KEY] = State.party || defaultPartyState();
    } catch (e) {}
  }
  function defaultResumeState() {
    return {
      code: "",
      id: "",
      payload: null,
      leaderKey: "",
      leaderName: "",
      hostedLeaderKey: "",
      hostedLeaderName: "",
      ready: {},
      order: [],
    };
  }
  function defaultProgressShareState() {
    return {
      key: "",
      code: "",
      id: "",
      checksum: "",
      chunkCount: 0,
      sent: false,
      messageCount: 0,
      submittedCount: 0,
      readyAt: 0,
    };
  }
  function findProgressRosterEntry(payload, key) {
    const normalized = normalizePlayerKey(key);
    const roster = payload && payload.roster ? payload.roster : [];
    for (let i = 0; i < roster.length; i += 1) {
      if (normalizePlayerKey(roster[i].key) === normalized) return roster[i];
    }
    return null;
  }
  function getProgressBankroll(payload, key) {
    if (!payload || !payload.bankrolls) return 0;
    return Number(payload.bankrolls[normalizePlayerKey(key)]) || 0;
  }
  function getLocalProgressEntry() {
    const resume = ensureResume();
    const payload = resume.payload;
    if (!payload) return null;
    const byKey = findProgressRosterEntry(payload, State.localPlayerKey);
    if (byKey) return byKey;
    return findProgressRosterEntry(payload, getRememberedLocalPlayerName());
  }
  function validateProgressPayload(payload) {
    if (!payload || typeof payload !== "object") return { ok: false, status: "Invalid progress code." };
    if (payload.version !== 1 || payload.kind !== "poker-progress") return { ok: false, status: "Invalid progress code." };
    if (!payload.roster || !payload.roster.length || !payload.bankrolls || typeof payload.bankrolls !== "object") return { ok: false, status: "Invalid progress code." };
    const roster = [];
    const seen = {};
    let positive = 0;
    for (let i = 0; i < payload.roster.length; i += 1) {
      const entry = payload.roster[i] || {};
      const key = normalizePlayerKey(entry.key || entry.name);
      const name = String(entry.name || entry.key || "").replace(/\s+/g, " ").trim();
      if (!key || isUnknownSender(name) || seen[key]) return { ok: false, status: "Invalid progress code." };
      if (!Object.prototype.hasOwnProperty.call(payload.bankrolls, key)) return { ok: false, status: "Invalid progress code." };
      const bankroll = Number(payload.bankrolls[key]);
      if (!isFinite(bankroll) || bankroll < 0) return { ok: false, status: "Invalid progress code." };
      if (bankroll > 0) positive += 1;
      seen[key] = true;
      roster.push({ key: key, name: name });
    }
    const dealerKey = normalizePlayerKey(payload.dealerKey);
    if (!dealerKey || !seen[dealerKey]) return { ok: false, status: "Invalid progress code." };
    const lastHandNumber = Math.floor(Number(payload.lastHandNumber));
    const nextHandNumber = Math.floor(Number(payload.nextHandNumber));
    if (lastHandNumber <= 0 || nextHandNumber !== lastHandNumber + 1) return { ok: false, status: "Invalid progress code." };
    if (positive < MIN_READY_PLAYERS) return { ok: false, status: "Invalid progress code." };
    const bankrolls = {};
    for (let i = 0; i < roster.length; i += 1) {
      const key = roster[i].key;
      bankrolls[key] = Number(payload.bankrolls[key]) || 0;
    }
    return {
      ok: true,
      payload: {
        version: 1,
        kind: "poker-progress",
        lastHandNumber: lastHandNumber,
        nextHandNumber: nextHandNumber,
        dealerKey: dealerKey,
        roster: roster,
        bankrolls: bankrolls,
        savedAt: Number(payload.savedAt) || 0,
      },
    };
  }
  function canonicalProgressPayload(payload) {
    const valid = validateProgressPayload(payload);
    const source = valid.ok ? valid.payload : payload;
    const bankrolls = {};
    const bankrollKeys = Object.keys(source.bankrolls || {}).sort();
    for (let i = 0; i < bankrollKeys.length; i += 1) {
      const key = bankrollKeys[i];
      bankrolls[key] = Number(source.bankrolls[key]) || 0;
    }
    return JSON.stringify({
      version: source.version,
      kind: source.kind,
      lastHandNumber: source.lastHandNumber,
      nextHandNumber: source.nextHandNumber,
      dealerKey: source.dealerKey,
      roster: (source.roster || []).map((entry) => ({ key: entry.key, name: entry.name })),
      bankrolls: bankrolls,
      savedAt: source.savedAt,
    });
  }
  function getResumeId(payload) {
    return "r" + (hashString(canonicalProgressPayload(payload)) >>> 0).toString(36);
  }
  function textToUtf8Bytes(text) {
    const input = String(text || "");
    const bytes = [];
    for (let i = 0; i < input.length; i += 1) {
      let code = input.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
        const next = input.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
          i += 1;
        }
      }
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6));
        bytes.push(0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12));
        bytes.push(0x80 | ((code >> 6) & 0x3f));
        bytes.push(0x80 | (code & 0x3f));
      } else {
        bytes.push(0xf0 | (code >> 18));
        bytes.push(0x80 | ((code >> 12) & 0x3f));
        bytes.push(0x80 | ((code >> 6) & 0x3f));
        bytes.push(0x80 | (code & 0x3f));
      }
    }
    return bytes;
  }
  function utf8BytesToText(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
      const first = bytes[i] & 255;
      if (first < 0x80) out += String.fromCharCode(first);
      else if ((first & 0xe0) === 0xc0) {
        const second = bytes[++i] & 0x3f;
        out += String.fromCharCode(((first & 0x1f) << 6) | second);
      } else if ((first & 0xf0) === 0xe0) {
        const second = bytes[++i] & 0x3f;
        const third = bytes[++i] & 0x3f;
        out += String.fromCharCode(((first & 0x0f) << 12) | (second << 6) | third);
      } else {
        const second = bytes[++i] & 0x3f;
        const third = bytes[++i] & 0x3f;
        const fourth = bytes[++i] & 0x3f;
        let code = ((first & 0x07) << 18) | (second << 12) | (third << 6) | fourth;
        code -= 0x10000;
        out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      }
    }
    return out;
  }
  function encodeBase64UrlBytes(bytes) {
    const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i] & 255;
      const b = i + 1 < bytes.length ? bytes[i + 1] & 255 : 0;
      const c = i + 2 < bytes.length ? bytes[i + 2] & 255 : 0;
      out += table[(a >> 2) & 63];
      out += table[((a & 3) << 4) | ((b >> 4) & 15)];
      if (i + 1 < bytes.length) out += table[((b & 15) << 2) | ((c >> 6) & 3)];
      if (i + 2 < bytes.length) out += table[c & 63];
    }
    return out;
  }
  function decodeBase64UrlBytes(text) {
    const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const input = String(text || "");
    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < input.length; i += 1) {
      const index = table.indexOf(input.charAt(i));
      if (index < 0) return [];
      buffer = (buffer << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 255);
      }
    }
    return bytes;
  }
  function cryptProgressBytes(bytes, seed) {
    const rand = seededRandom(hashString(seed));
    const out = [];
    for (let i = 0; i < bytes.length; i += 1) out.push((bytes[i] & 255) ^ Math.floor(rand() * 256));
    return out;
  }
  function isDepartedPlayer(player) {
    return !!(player && player.left);
  }
  function buildProgressPayload(gameOverride) {
    const game = gameOverride || State.game;
    if (!game || !game.finished || game.active) return { ok: false, status: "Finish the current hand before copying progress." };
    const progressState = PokerEngine.progress(game);
    const progressPlayers = progressState.players;
    const dealerKey = progressState.dealerKey;
    const bankrolls = {};
    const roster = [];
    const seen = {};
    let positive = 0;
    for (let i = 0; i < progressPlayers.length; i += 1) {
      const player = progressPlayers[i];
      const key = normalizePlayerKey(player.key || player.name);
      if (!key || seen[key]) return { ok: false, status: "Cannot copy progress; dealer state is missing." };
      const stack = Number(player.stack) || 0;
      roster.push({ key: key, name: player.name || player.key || "Player" });
      bankrolls[key] = stack;
      if (stack > 0) positive += 1;
      seen[key] = true;
    }
    if (positive < MIN_READY_PLAYERS) return { ok: false, status: "Need 2 players with chips to save progress." };
    const payload = {
      version: 1,
      kind: "poker-progress",
      lastHandNumber: game.handNumber,
      nextHandNumber: game.handNumber + 1,
      dealerKey: dealerKey,
      roster: roster,
      bankrolls: bankrolls,
      savedAt: Date.now(),
    };
    const valid = validateProgressPayload(payload);
    return valid.ok ? { ok: true, payload: valid.payload } : { ok: false, status: valid.status };
  }
  function checksumHex(checksum) {
    return ("00000000" + (checksum >>> 0).toString(16)).slice(-8);
  }
  function getProgressShareKey(gameOverride) {
    const game = gameOverride || State.game;
    if (!game || !game.finished || game.active || !game.players || !game.players.length) return "";
    const progressState = PokerEngine.progress(game);
    const progressPlayers = progressState.players;
    const parts = [String(game.handNumber || 0), progressState.dealerKey];
    for (let i = 0; i < progressPlayers.length; i += 1) {
      const player = progressPlayers[i] || {};
      parts.push(normalizePlayerKey(player.key || player.name) + ":" + String(Number(player.stack) || 0));
    }
    return parts.join("|");
  }
  function checksumFromProgressCode(code) {
    const match = String(code || "").match(/^POKERPROG1-([0-9a-f]{8})-/i);
    return match ? match[1].toLowerCase() : "";
  }
  function buildProgressSaveCode(gameOverride) {
    const shareKey = getProgressShareKey(gameOverride);
    if (shareKey && State.progressShare && State.progressShare.key === shareKey && State.progressShare.code) {
      const decoded = decodeProgressSaveCode(State.progressShare.code);
      if (decoded.ok && decoded.id === State.progressShare.id) {
        return { ok: true, code: State.progressShare.code, id: State.progressShare.id, payload: decoded.payload };
      }
    }
    const built = buildProgressPayload(gameOverride);
    if (!built.ok) return built;
    const payload = built.payload;
    const checksum = hashString(canonicalProgressPayload(payload)) >>> 0;
    const wrapper = { checksum: checksum, payload: payload };
    const encrypted = cryptProgressBytes(textToUtf8Bytes(JSON.stringify(wrapper)), PROGRESS_CODE_SECRET + "|" + checksum);
    const result = {
      ok: true,
      code: PROGRESS_CODE_PREFIX + "-" + checksumHex(checksum) + "-" + encodeBase64UrlBytes(encrypted),
      id: getResumeId(payload),
      payload: payload,
    };
    if (shareKey) {
      State.progressShare = {
        key: shareKey,
        code: result.code,
        id: result.id,
        checksum: checksumHex(checksum),
        chunkCount: 0,
        sent: false,
      };
    }
    return result;
  }
  function decodeProgressSaveCode(code) {
    const text = String(code || "").replace(/^\s+|\s+$/g, "");
    const match = text.match(/^POKERPROG1-([0-9a-f]{8})-([A-Za-z0-9_-]+)$/);
    if (!match) return { ok: false, status: "Invalid progress code." };
    const checksum = parseInt(match[1], 16) >>> 0;
    try {
      const encrypted = decodeBase64UrlBytes(match[2]);
      if (!encrypted.length) return { ok: false, status: "Invalid progress code." };
      const bytes = cryptProgressBytes(encrypted, PROGRESS_CODE_SECRET + "|" + checksum);
      const wrapper = JSON.parse(utf8BytesToText(bytes));
      if (!wrapper || (wrapper.checksum >>> 0) !== checksum) return { ok: false, status: "Invalid progress code." };
      const valid = validateProgressPayload(wrapper.payload);
      if (!valid.ok) return { ok: false, status: "Invalid progress code." };
      if ((hashString(canonicalProgressPayload(valid.payload)) >>> 0) !== checksum) return { ok: false, status: "Invalid progress code." };
      return { ok: true, id: getResumeId(valid.payload), payload: valid.payload };
    } catch (e) {
      return { ok: false, status: "Invalid progress code." };
    }
  }
  function getResumeState() {
    const fallback = defaultResumeState();
    try {
      const stored = getConfig()[PROGRESS_STATE_KEY];
      if (!stored || typeof stored !== "object" || !stored.code) return fallback;
      const decoded = decodeProgressSaveCode(stored.code);
      if (!decoded.ok) return fallback;
      const resume = defaultResumeState();
      resume.code = String(stored.code);
      resume.id = decoded.id;
      resume.payload = decoded.payload;
      const storedId = String(stored.id || "");
      if (storedId && storedId !== decoded.id) return resume;
      const leaderKey = normalizePlayerKey(stored.leaderKey || "");
      if (leaderKey && findProgressRosterEntry(decoded.payload, leaderKey) && getProgressBankroll(decoded.payload, leaderKey) > 0) {
        resume.leaderKey = leaderKey;
        resume.leaderName = String(stored.leaderName || "").replace(/\s+/g, " ").trim();
      }
      const hostedLeaderKey = normalizePlayerKey(stored.hostedLeaderKey || "");
      if (hostedLeaderKey && findProgressRosterEntry(decoded.payload, hostedLeaderKey) && getProgressBankroll(decoded.payload, hostedLeaderKey) > 0) {
        resume.hostedLeaderKey = hostedLeaderKey;
        resume.hostedLeaderName = String(stored.hostedLeaderName || "").replace(/\s+/g, " ").trim();
      }
      const ready = stored.ready && typeof stored.ready === "object" ? stored.ready : {};
      const order = stored.order && stored.order.length ? stored.order : Object.keys(ready);
      for (let i = 0; i < order.length; i += 1) {
        const key = normalizePlayerKey(order[i]);
        const entry = ready[key];
        const rosterEntry = findProgressRosterEntry(decoded.payload, key);
        if (!key || !entry || !rosterEntry || getProgressBankroll(decoded.payload, key) <= 0) continue;
        resume.ready[key] = { key: key, name: String(entry.name || rosterEntry.name).replace(/\s+/g, " ").trim() };
        if (resume.order.indexOf(key) === -1) resume.order.push(key);
      }
      return resume;
    } catch (e) {
      return fallback;
    }
  }
  function saveResumeState() {
    try {
      const resume = State.resume || defaultResumeState();
      getConfig()[PROGRESS_STATE_KEY] = {
        code: resume.code || "",
        id: resume.id || "",
        leaderKey: resume.leaderKey || "",
        leaderName: resume.leaderName || "",
        hostedLeaderKey: resume.hostedLeaderKey || "",
        hostedLeaderName: resume.hostedLeaderName || "",
        ready: resume.ready || {},
        order: resume.order || [],
      };
    } catch (e) {}
  }
  function clearResumeState(reason) {
    State.resume = defaultResumeState();
    State.progressTransfers = {};
    State.progressShare = defaultProgressShareState();
    State.pendingResumeStarts = {};
    try {
      if (isValid(State.progressCodeInput)) State.progressCodeInput.text = "";
    } catch (e) {}
    setText(State.progressCodeLabel, "Finish a hand to copy progress, or paste a code to resume.");
    saveResumeState();
    if (reason) log("cleared resume state: " + reason);
  }
  function importProgressSaveCode(code, source) {
    if (State.game && State.game.active) return { ok: false, status: "Finish the current hand before importing progress." };
    const decoded = decodeProgressSaveCode(code);
    if (!decoded.ok) return decoded;
    State.resume = {
      code: String(code || "").replace(/^\s+|\s+$/g, ""),
      id: decoded.id,
      payload: decoded.payload,
      leaderKey: "",
      leaderName: "",
      hostedLeaderKey: "",
      hostedLeaderName: "",
      ready: {},
      order: [],
    };
    saveResumeState();
    if (source !== "shared" && source !== "transfer") {
      RenderScheduler.defer("progress-import");
      setStatus("Imported progress " + decoded.id + ". Choose a resume leader, then sync resume in chat.");
    }
    return decoded;
  }
  function makePartyId(sender) {
    return "p" + Date.now().toString(36) + "-" + hashString(sender || "leader").toString(36);
  }
  function buildMatchEndCommand(game, partyId) {
    return MATCH_END_PREFIX + " poker party " + partyId + " seed " + ((game && game.seed) || "") + " hand " + ((game && game.handNumber) || 0);
  }
  function resolveUnknownMatchEndRecord(record, matchEnd, party) {
    if (!record || record.isSelf || !isUnknownSender(record.sender)) return record;
    if (!matchEnd || !matchEnd.id || !party || !party.id || !samePartyId(party.id, matchEnd.id)) return record;
    const game = State.game;
    if (!game || (!game.active && !game.finished) || !party.leaderKey) return record;
    if (!matchEnd.seed || String(game.seed || "").toLowerCase() !== String(matchEnd.seed).toLowerCase()) return record;
    if (!matchEnd.handNumber || Number(game.handNumber) !== Number(matchEnd.handNumber)) return record;
    const resolved = copyChatRecord(record) || {};
    resolved.sender = party.leaderName || party.leaderKey;
    log("resolved unknown match end sender to party leader " + resolved.sender);
    return resolved;
  }
  function rememberLeaderLeaveAfterMatchEnd(party, senderKey, senderName) {
    if (!party || !party.id || !senderKey) return;
    State.pendingLeaderLeaveAfterMatchEnd = {
      partyId: party.id,
      leaderKey: senderKey,
      leaderName: senderName || senderKey,
      atMs: Date.now ? Date.now() : 0,
    };
  }
  function resolveUnknownLeaderLeaveAfterMatchEnd(record, partyId, party) {
    if (!record || record.isSelf || !isUnknownSender(record.sender)) return record;
    const pending = State.pendingLeaderLeaveAfterMatchEnd;
    if (!pending || !party || !party.id || !partyId || !samePartyId(pending.partyId, partyId) || !samePartyId(party.id, partyId)) return record;
    if (!pending.leaderKey || party.leaderKey !== pending.leaderKey) return record;
    const now = Date.now ? Date.now() : 0;
    if (pending.atMs && now - pending.atMs > LEADER_LEAVE_AFTER_MATCH_END_WINDOW_MS) return record;
    const resolved = copyChatRecord(record) || {};
    resolved.sender = pending.leaderName || pending.leaderKey;
    log("resolved unknown party leave sender after authenticated match end to " + resolved.sender);
    return resolved;
  }
  function ensureParty() {
    if (!State.party || typeof State.party !== "object") State.party = defaultPartyState();
    State.party.members = State.party.members || {};
    State.party.order = State.party.order || [];
    return State.party;
  }
  function applyPartyLeaderTransition(record, partyId) {
    const party = ensureParty();
    if (State.game && State.game.active) {
      const pendingKey = record && !record.isSelf && !isUnknownSender(record.sender)
        ? normalizePlayerKey(record.sender)
        : "";
      if (pendingKey && party.leaderKey === pendingKey && partyId && partyId !== party.id) {
        State.pendingPartyLeader = { id: partyId, sender: record.sender, key: pendingKey };
        log("queued party leader " + partyId + " until active hand ends");
      } else {
        log("party leader ignored during active hand");
      }
      return false;
    }
    if (record && record.isSelf && party.mode === "leader" && isUnknownSender(record.sender)) return false;
    if (record && record.isSelf && isUnknownSender(record.sender)) {
      if (party.mode === "leader" && party.id === partyId) return false;
      party.id = partyId || party.id;
      party.mode = "leader";
      party.leaderKey = "";
      party.leaderName = "";
      party.members = {};
      party.order = [];
      return true;
    }
    if (party.mode === "leader" && party.id && partyId && party.id !== partyId && record && !record.isSelf) {
      log("ignored foreign party leader " + partyId + " while hosting " + party.id);
      return false;
    }
    if ((!record || isUnknownSender(record.sender)) && partyId && !(record && record.isSelf) && party.mode === "none" && (!party.id || party.id === partyId)) {
      party.id = partyId;
      party.mode = "none";
      party.leaderKey = "";
      party.leaderName = "";
      party.members = {};
      party.order = [];
      return true;
    }
    if (!record || isUnknownSender(record.sender)) return false;
    const key = normalizePlayerKey(record.sender);
    if (!key) return false;
    party.id = partyId || party.id;
    party.mode = record.isSelf ? "leader" : "none";
    party.leaderKey = key;
    party.leaderName = record.sender;
    party.members = {};
    party.members[key] = { key: key, name: record.sender };
    party.order = [key];
    if (record.isSelf) rememberLocalPlayer(record.sender);
    return true;
  }
  function applyPartyJoinTransition(record, partyId) {
    const party = ensureParty();
    if (!party.id || party.id !== partyId) return false;
    if (!record || isUnknownSender(record.sender)) {
      if (record && record.isSelf) {
        party.mode = "member";
        return true;
      }
      return false;
    }
    const key = normalizePlayerKey(record.sender);
    if (!key) return false;
    if (!party.members[key]) party.order.push(key);
    party.members[key] = { key: key, name: record.sender };
    if (record.isSelf) {
      party.mode = "member";
      rememberLocalPlayer(record.sender);
    }
    return true;
  }
  function forgetReadySeat(key) {
    const normalized = normalizePlayerKey(key);
    if (!normalized) return false;
    const seats = getReadySeats();
    if (!seats[normalized]) return false;
    delete seats[normalized];
    try {
      const config = getConfig();
      config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
    } catch (e) {}
    return true;
  }
  function canAcceptReadyEntry(entry) {
    const key = normalizePlayerKey(entry && (entry.key || entry.name));
    if (!key) return false;
    const party = ensureParty();
    if (!party.id) return false;
    if (entry && entry.isSelf) return true;
    if (State.localPlayerKey && key === State.localPlayerKey) return true;
    return !!(party.members && party.members[key]);
  }
  function replaceReadySeats(entries) {
    const next = {};
    const list = entries || [];
    for (let i = 0; i < list.length && i < MAX_TABLE_PLAYERS; i += 1) {
      const entry = list[i];
      const key = normalizePlayerKey(entry && (entry.key || entry.name));
      if (!key || !entry || !entry.name || !canAcceptReadyEntry(entry)) continue;
      next[key] = {
        key: key,
        name: entry.name,
        channel: entry.channel || "",
        message: entry.message || "",
        readyAt: entry.readyAt || Date.now(),
      };
    }
    const config = getConfig();
    const before = JSON.stringify(config[READY_SEATS_KEY] || {});
    const after = JSON.stringify(next);
    config[READY_SEATS_KEY] = next;
    if (before !== after) config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
    return before !== after;
  }
  function clearReadySeats(reason) {
    const changed = replaceReadySeats([]);
    try {
      $.DispatchEvent(CLIENT_OUTPUT_EVENT, JSON.stringify({ event: READY_CLEAR_REQUEST_EVENT, reason: reason || "", source: "poker_escape_menu" }));
    } catch (e) {}
    return changed;
  }
  const LOBBY_RESET_CASES = {
    remoteMatchEnd: "remote-match-end",
    snapshotMatchEnd: "snapshot-match-end",
    twoPlayerActiveLeave: "two-player-active-leave",
    leaderOrSelfLeave: "leader-or-self-leave",
    endMatch: "end-match",
    leaveLobby: "leave-lobby",
    hostClose: "host-close",
  };
  const RESET_FIELD_SETS = {
    "host-close": ["party"],
    "remote-match-end": ["game", "bluffDeck"],
    "snapshot-match-end": ["game", "pendingLeaderLeaveAfterMatchEnd", "party", "bluffDeck"],
    "two-player-active-leave": ["party", "game", "bankrolls", "resumeRequiresHostedParty", "pendingPartyLeader", "pendingLeaderLeaveAfterMatchEnd", "bluffDeck"],
    "leader-or-self-leave": ["party", "game", "bankrolls", "resumeRequiresHostedParty", "pendingPartyLeader", "pendingLeaderLeaveAfterMatchEnd", "bluffDeck"],
    "leave-lobby": ["party", "game", "resumeRequiresHostedParty", "pendingLeaderLeaveAfterMatchEnd", "bluffDeck"],
    "end-match": ["game", "bluffDeck"],
  };
  const RESET_FIELD_DEFAULTS = {
    party: () => defaultPartyState(),
    game: () => null,
    bluffDeck: () => ({ game: null, selectedMask: 0, pending: null, transcript: [], revision: State.bluffDeck.revision + 1 }),
    bankrolls: () => ({}),
    resumeRequiresHostedParty: () => true,
    pendingPartyLeader: () => null,
    pendingLeaderLeaveAfterMatchEnd: () => null,
  };
  function resetPartyState(resetCase, reason) {
    const fields = RESET_FIELD_SETS[resetCase] || [];
    const preserveActiveBluff = !!(State.bluffDeck && State.bluffDeck.game
      && (State.bluffDeck.game.active || resetCase === LOBBY_RESET_CASES.leaderOrSelfLeave));
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      if (field === "bluffDeck" && preserveActiveBluff) {
        State.bluffDeck.selectedMask = 0;
        State.bluffDeck.pending = null;
        continue;
      }
      const factory = RESET_FIELD_DEFAULTS[field];
      if (factory) State[field] = factory();
    }
    if (resetCase === LOBBY_RESET_CASES.hostClose) return;
    clearLocalActionEcho();
    clearResumeState(reason);
    State.requiresProgressImport = false;
  }
  function promotePartyLeaderAfterLeave(leavingKey) {
    const party = ensureParty();
    if (!party.leaderKey || party.leaderKey !== normalizePlayerKey(leavingKey)) return null;
    let nextKey = "";
    for (let i = 0; i < party.order.length; i += 1) {
      const orderedKey = normalizePlayerKey(party.order[i]);
      if (orderedKey && party.members[orderedKey]) {
        nextKey = orderedKey;
        break;
      }
    }
    if (!nextKey) {
      const keys = Object.keys(party.members || {});
      nextKey = keys.length ? normalizePlayerKey(keys[0]) : "";
    }
    if (!nextKey || !party.members[nextKey]) {
      party.leaderKey = "";
      party.leaderName = "";
      party.mode = party.id ? "member" : "none";
      return { key: "", name: "" };
    }
    party.leaderKey = nextKey;
    party.leaderName = party.members[nextKey].name || nextKey;
    party.mode = nextKey === State.localPlayerKey ? "leader" : "member";
    return { key: nextKey, name: party.leaderName };
  }
  function recordPartyLeave(record, partyId, scoped) {
    const party = ensureParty();
    if (!party.id || !samePartyId(party.id, partyId)) return null;
    if (!record || isUnknownSender(record.sender)) return null;
    const key = normalizePlayerKey(record.sender);
    const name = record.sender;
    if (!key || !party.members[key]) return null;
    const game = State.game;
    const bluffGame = State.bluffDeck && State.bluffDeck.game;
    let bluffDeparture = null;
    const bluffSeat = bluffGame && bluffGame.active
      ? bluffGame.players.find((player) => player.key === key && player.status === "active")
      : null;
    if (scoped && bluffGame && bluffGame.active && bluffSeat
      && scoped.matchId === bluffGame.id && scoped.nextSeq === bluffGame.seq + 1) {
      bluffDeparture = BluffDeckEngine.depart(bluffGame, key);
      if (bluffDeparture && bluffDeparture.changed) {
        State.bluffDeck.selectedMask = 0;
        State.bluffDeck.pending = null;
        bluffPersistTransition(record);
      } else {
        bluffDeparture = null;
      }
    }
    const engineDeparture = !record.isSelf && game
      ? PokerEngine.depart(game, key, { name: name, isSelf: !!record.isSelf })
      : null;
    const departureTransition = engineDeparture && engineDeparture.ok ? engineDeparture : null;
    const resetForTwoPlayerActiveLeave = !!(departureTransition && departureTransition.reset);
    const continueActiveLeave = !!(departureTransition && departureTransition.continuation);
    if (continueActiveLeave) State.requiresProgressImport = true;
    delete party.members[key];
    const memberIndex = (party.order || []).indexOf(key);
    if (memberIndex >= 0) party.order.splice(memberIndex, 1);
    const leaderLeaving = party.leaderKey === key;
    const bluffActiveCount = bluffGame && bluffGame.players
      ? bluffGame.players.filter((player) => player.status === "active").length
      : 0;
    const transferLeader = leaderLeaving && !record.isSelf && !continueActiveLeave && !resetForTwoPlayerActiveLeave
      && (bluffDeparture ? bluffActiveCount >= 2 : party.order.length > 1);
    const resetLobby = resetForTwoPlayerActiveLeave || record.isSelf || (leaderLeaving && !transferLeader && !continueActiveLeave);
    const pendingLeader = State.pendingPartyLeader && State.pendingPartyLeader.key === key
      ? State.pendingPartyLeader
      : null;
    let departure = resetLobby
      ? (resetForTwoPlayerActiveLeave ? departureTransition : (bluffDeparture || null))
      : (bluffDeparture || departureTransition || { key: key, name: name, active: !!(game && game.active) });
    if (pendingLeader && resetLobby && !resetForTwoPlayerActiveLeave) {
      if (!departure) departure = {};
      departure.pendingLeader = pendingLeader;
    }
    if ((continueActiveLeave || transferLeader) && leaderLeaving) {
      const leaderTransfer = promotePartyLeaderAfterLeave(key);
      if (leaderTransfer) {
        if (!departure) departure = {};
        departure.leaderTransfer = leaderTransfer;
      }
    }
    State.pendingLeaderLeaveAfterMatchEnd = null;
    return makePartyResult(
      true,
      resetLobby
        ? { type: "clear", reason: resetForTwoPlayerActiveLeave ? "two player leave" : (record.isSelf ? "self leave" : "leader leave") }
        : (record.isSelf ? { type: "clear", reason: "self leave" } : { type: "remove", key: key }),
      resetForTwoPlayerActiveLeave ? LOBBY_RESET_CASES.twoPlayerActiveLeave : (resetLobby ? LOBBY_RESET_CASES.leaderOrSelfLeave : ""),
      departure,
      "",
      true,
    );
  }
  function makePartyResult(changed, readyAction, resetCase, gameDeparture, status, render) {
    return {
      changed: !!changed,
      readyAction: readyAction || { type: "none" },
      resetCase: resetCase || "",
      gameDeparture: gameDeparture || null,
      status: status || "",
      render: render == null ? !!changed : !!render,
    };
  }
  function applyPartyResultEffects(result, reason) {
    if (!result || (!result.changed && !result.resetCase)) return null;
    const departure = result.gameDeparture || null;
    if (departure && departure.reset) {
      addGameLog(departure.name + " left the lobby. Returning to poker lobby.");
      announce(departure.name + " left", "Only two players were seated, so the hand was reset.");
    }
    if (result.resetCase) PartyReducer.reset(result.resetCase, reason || result.status || "party");
    if (departure && departure.pendingLeader) {
      applyPartyLeaderTransition(
        { sender: departure.pendingLeader.sender, isSelf: false },
        departure.pendingLeader.id,
      );
    }
    if (departure && departure.leaderTransfer && departure.leaderTransfer.key) {
      addGameLog(departure.leaderTransfer.name + " is now party leader.");
    }
    const readyAction = result.readyAction || {};
    let readyChanged = false;
    if (readyAction.type === "clear") {
      readyChanged = clearReadySeats(readyAction.reason || "party") || readyChanged;
    } else if (readyAction.type === "remove") {
      readyChanged = forgetReadySeat(readyAction.key);
    }
    savePartyState();
    if (readyAction.progressShareReason) ProgressResume.shareImported(readyAction.progressShareReason);
    return { readyChanged: readyChanged };
  }
  function applyPartyTransition(command) {
    const event = command || {};
    const type = event.type === "party-leader" ? "leader"
      : (event.type === "party-join" ? "join" : event.type);
    const record = event.record || null;
    const partyId = event.partyId || "";
    const party = ensureParty();
    if (type === "match-end") {
      const matchEndRecord = resolveUnknownMatchEndRecord(
        record,
        { id: partyId, seed: event.seed || "", handNumber: event.handNumber || 0 },
        party,
      );
      if (!matchEndRecord || matchEndRecord.isSelf || isUnknownSender(matchEndRecord.sender) || !party.id || !samePartyId(party.id, partyId)) {
        return makePartyResult(false, { type: "none" }, "", null, "", false);
      }
      const snapshotDiscovery = !!(State.replayingChatSnapshot && party.mode === "none");
      const senderKey = normalizePlayerKey(matchEndRecord.sender);
      if (!senderKey || (party.leaderKey && senderKey !== party.leaderKey) || (!party.leaderKey && !snapshotDiscovery)) {
        debugActionState("reject-non-leader-match-end sender=" + matchEndRecord.sender + " leader=" + party.leaderName, matchEndRecord, null);
        return makePartyResult(false, { type: "none" }, "", null, "", false);
      }
      const changed = !!(State.game || (State.resume && State.resume.id) || snapshotDiscovery);
      if (changed && !snapshotDiscovery) rememberLeaderLeaveAfterMatchEnd(party, senderKey, matchEndRecord.sender);
      return makePartyResult(
        changed,
        { type: "none" },
        snapshotDiscovery ? LOBBY_RESET_CASES.snapshotMatchEnd : LOBBY_RESET_CASES.remoteMatchEnd,
        null,
        "Match ended by party leader.",
        changed,
      );
    }
    if (type === "leave") {
      return recordPartyLeave(record, partyId, command.scopedBluffLeave)
        || makePartyResult(false, { type: "none" }, "", null, "", false);
    }
    const beforeId = party.id || "";
    const beforeMode = party.mode || "none";
    let changed = false;
    if (type === "leader") changed = applyPartyLeaderTransition(record, partyId);
    else if (type === "join") changed = applyPartyJoinTransition(record, partyId);
    if (!changed) return makePartyResult(false, { type: "none" }, "", null, "", false);
    let readyAction = { type: "none" };
    let status = "";
    if (type === "leader" && (beforeId !== partyId || beforeMode !== "leader")) {
      readyAction = { type: "clear", reason: "party leader" };
    }
    if (type === "join" && ((State.game && State.game.active) || samePartyId(State.progressSharePartyId, partyId))) {
      readyAction.progressShareReason = "party-join-import";
      if (State.game && State.game.active && record && !Object.prototype.hasOwnProperty.call(State.bankrolls, normalizePlayerKey(record.sender))) {
        status = String(record.sender || "Player") + " will join after this hand.";
      }
    }
    return makePartyResult(changed, readyAction, "", null, status, true);
  }
  function projectPartyRoster() {
    const party = ensureParty();
    const roster = [];
    const order = party.order || [];
    for (let i = 0; i < order.length; i += 1) {
      const key = normalizePlayerKey(order[i]);
      const member = party.members && party.members[key];
      if (member && member.key && member.name && !isUnknownSender(member.name)) {
        roster.push({ key: member.key, name: member.name });
      }
    }
    return roster;
  }
  const PartyReducer = {
    apply: applyPartyTransition,
    roster: projectPartyRoster,
    reset: resetPartyState,
  };
  function resolveRosterNamesFromKnownParty(roster) {
    if (!roster || !roster.length) return roster || [];
    const party = ensureParty();
    const resolved = [];
    for (let i = 0; i < roster.length; i += 1) {
      const entry = roster[i] || {};
      const key = normalizePlayerKey(entry.key || entry.name);
      let name = String(entry.name || entry.key || "").replace(/\s+/g, " ").trim();
      const known = key && party.members ? party.members[key] : null;
      const knownName = known && known.name ? String(known.name).replace(/\s+/g, " ").trim() : "";
      if (knownName && !isUnknownSender(knownName) && knownName !== name) name = knownName;
      resolved.push({ key: key, name: name });
    }
    return resolved;
  }
  function getQueuedLateJoiners(rosterOverride) {
    const source = rosterOverride || PartyReducer.roster();
    const queued = [];
    const hasBankrollState = Object.keys(State.bankrolls).length > 0;
    const activeGame = !!(State.game && State.game.active);
    if (!activeGame && !hasBankrollState) return queued;
    for (let i = 0; i < source.length; i += 1) {
      const entry = source[i] || {};
      const key = normalizePlayerKey(entry.key || entry.name);
      const name = String(entry.name || entry.key || "").replace(/\s+/g, " ").trim();
      if (!key || isUnknownSender(name)) continue;
      if (Object.prototype.hasOwnProperty.call(State.bankrolls, key)) continue;
      if (findGamePlayerByKey(key)) continue;
      queued.push({ key: key, name: name });
    }
    return queued;
  }
  function computeLateJoinBuyIn() {
    const keys = Object.keys(State.bankrolls);
    const values = [];
    for (let i = 0; i < keys.length; i += 1) {
      const value = Number(State.bankrolls[keys[i]]);
      if (isFinite(value) && value > 0) values.push(value);
    }
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    return Math.min(STARTING_STACK, values[0]);
  }
  function applyLateJoinBuyIns(rosterOverride, reason) {
    const bankrollKeys = Object.keys(State.bankrolls);
    if (!bankrollKeys.length) return { applied: 0, buyIn: 0, players: [] };
    const buyIn = computeLateJoinBuyIn();
    if (buyIn <= 0) return { applied: 0, buyIn: 0, players: [] };
    const queued = getQueuedLateJoiners(rosterOverride);
    const players = [];
    for (let i = 0; i < queued.length; i += 1) {
      const entry = queued[i];
      State.bankrolls[entry.key] = buyIn;
      players.push({ key: entry.key, name: entry.name, stack: buyIn });
      if (State.game) addGameLog(entry.name + " joins next hand with $" + buyIn + ".");
    }
    return { applied: players.length, buyIn: buyIn, players: players };
  }
  function formatLateJoinApplied(result) {
    if (!result || !result.applied) return "";
    const names = result.players.map((player) => player.name).join(", ");
    return names + (result.applied === 1 ? " joins" : " join") + " next hand with $" + result.buyIn + ".";
  }
  function displayNameFromPlayerKey(key) {
    const text = String(key || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    const words = text.split(" ");
    for (let i = 0; i < words.length; i += 1) {
      if (words[i]) words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);
    }
    return words.join(" ");
  }
  function repairDecodedRosterName(key, name) {
    const cleanName = String(name || "").replace(/\s+/g, " ").trim();
    if (cleanName.length > 1) return cleanName;
    const fallback = displayNameFromPlayerKey(key);
    return fallback || cleanName;
  }
  function encodeCompactRoster(roster) {
    if (!roster || !roster.length) return "";
    return roster.map((player) => {
      const key = normalizePlayerKey(player && (player.key || player.name));
      return encodeURIComponent(key);
    }).join("|");
  }
  function decodeRoster(token) {
    const text = String(token || "");
    if (!text) return [];
    const roster = [];
    const entries = text.split("|");
    for (let i = 0; i < entries.length; i += 1) {
      const parts = entries[i].split("~");
      if (parts.length !== 1 && parts.length !== 2) return [];
      try {
        const key = normalizePlayerKey(decodeURIComponent(parts[0]));
        const rawName = parts.length === 2 ? decodeURIComponent(parts[1]).replace(/\s+/g, " ").trim() : "";
        const name = repairDecodedRosterName(key, rawName);
        if (!key || isUnknownSender(name)) return [];
        roster.push({ key: key, name: name });
      } catch (e) {
        return [];
      }
    }
    return roster.length >= MIN_READY_PLAYERS ? roster : [];
  }
  function getNextHandNumber() {
    return State.game && State.game.handNumber ? State.game.handNumber + 1 : 1;
  }
  function parseHandNumberToken(token) {
    const value = Math.floor(Number(token));
    return value > 0 ? value : 0;
  }
  function buildSynchronizedStartCommand(seed, roster, handNumber) {
    const syncedHandNumber = getBlindLevelForHand(handNumber || getNextHandNumber());
    return "poker start " + seed + " " + START_HAND_MARKER + " " + syncedHandNumber + " " + START_ROSTER_MARKER + " " + encodeCompactRoster(resolveRosterNamesFromKnownParty(roster));
  }
  function buildResumeLeaderCommand(id) {
    return RESUME_LEADER_PREFIX + " poker resume " + id;
  }
  function buildResumeReadyCommand(id) {
    return RESUME_READY_PREFIX + " poker resume " + id;
  }
  function buildResumeStartCommand(id, leaderKey, handNumber, seed) {
    return "poker resume " + id + " " + START_HAND_MARKER + " " + handNumber + " " + START_LEADER_MARKER + " " + encodeURIComponent(leaderKey) + " " + START_SEED_MARKER + " " + seed;
  }
  function getResumeRoster() {
    const resume = State.resume;
    const payload = resume && resume.payload;
    if (!payload || !payload.roster) return [];
    const roster = [];
    for (let i = 0; i < payload.roster.length; i += 1) {
      const entry = payload.roster[i];
      if (getProgressBankroll(payload, entry.key) > 0) roster.push({ key: entry.key, name: entry.name });
    }
    return roster;
  }
  function ensureResume() {
    if (!State.resume || typeof State.resume !== "object") State.resume = defaultResumeState();
    State.resume.ready = State.resume.ready || {};
    State.resume.order = State.resume.order || [];
    return State.resume;
  }
  function recordResumeLeader(record, id) {
    const resume = ensureResume();
    if (State.game && State.game.active) return false;
    if (!resume.payload || resume.id !== id) return false;
    if (!record || isUnknownSender(record.sender)) return false;
    const key = normalizePlayerKey(record.sender);
    const entry = findProgressRosterEntry(resume.payload, key);
    if (!entry || getProgressBankroll(resume.payload, key) <= 0) return false;
    resume.leaderKey = key;
    resume.leaderName = record.sender;
    resume.ready = {};
    resume.ready[key] = { key: key, name: record.sender };
    resume.order = [key];
    if (record.isSelf) rememberLocalPlayer(record.sender);
    saveResumeState();
    return true;
  }
  function recordResumeReady(record, id) {
    const resume = ensureResume();
    if (State.game && State.game.active) return false;
    if (!resume.payload || resume.id !== id) return false;
    if (!record || isUnknownSender(record.sender) || !resume.leaderKey) return false;
    const key = normalizePlayerKey(record.sender);
    const entry = findProgressRosterEntry(resume.payload, key);
    if (!entry || getProgressBankroll(resume.payload, key) <= 0) return false;
    resume.ready[key] = { key: key, name: record.sender };
    if (resume.order.indexOf(key) === -1) resume.order.push(key);
    if (record.isSelf) rememberLocalPlayer(record.sender);
    saveResumeState();
    return true;
  }
  function applyPartyRoster(roster, mode, partyId) {
    if (!roster || roster.length < MIN_READY_PLAYERS) return false;
    const party = ensureParty();
    party.id = partyId || party.id;
    party.mode = sanitizePartyMode(mode || party.mode);
    party.leaderKey = roster[0].key;
    party.leaderName = roster[0].name;
    party.members = {};
    party.order = [];
    for (let i = 0; i < roster.length; i += 1) {
      const key = normalizePlayerKey(roster[i].key || roster[i].name);
      const name = roster[i].name || roster[i].key;
      if (key && !isUnknownSender(name)) {
        party.members[key] = { key: key, name: name };
        party.order.push(key);
      }
    }
    savePartyState();
    return true;
  }
  function rememberLocalFromPartyRoster(roster) {
    if (State.localPlayerKey || !roster || roster.length < MIN_READY_PLAYERS) return;
    const party = ensureParty();
    if (party.mode === "leader" && roster[0]) {
      rememberLocalPlayer(roster[0].name);
      return;
    }
    if (party.mode === "member" && roster.length === MIN_READY_PLAYERS) {
      for (let i = 0; i < roster.length; i += 1) {
        if (roster[i].key !== party.leaderKey) {
          rememberLocalPlayer(roster[i].name);
          return;
        }
      }
    }
  }
  function getReadySeatArray() {
    const seats = getReadySeats();
    const keys = Object.keys(seats);
    const list = [];
    for (let i = 0; i < keys.length; i += 1) {
      const entry = seats[keys[i]];
      if (entry && entry.name) list.push(entry);
    }
    list.sort((a, b) => (a.readyAt || 0) - (b.readyAt || 0));
    return list.slice(0, MAX_TABLE_PLAYERS);
  }
  function isStartEligible(count) {
    return count >= MIN_READY_PLAYERS;
  }
  function setText(panel, text) {
    if (!isValid(panel)) return;
    try {
      if (panel.text !== text) panel.text = text;
    } catch (e) {}
  }
  function hasPanelClass(panel, className) {
    if (!isValid(panel)) return null;
    try {
      if (typeof panel.BHasClass === "function") return !!panel.BHasClass(className);
      if (panel.classes) return !!panel.classes[className];
    } catch (e) {}
    return null;
  }
  function setHitTest(panel, enabled) {
    if (!isValid(panel)) return;
    const next = !!enabled;
    try {
      if (panel.hittest !== next) panel.hittest = next;
    } catch (e) {}
  }
  function setStatus(text, priority, ttlMs) {
    cachePanels();
    const statusText = String(text || "");
    const statusPriority = typeof priority === "number" ? priority : STATUS_PRIORITY.action;
    const lockMs = typeof ttlMs === "number" ? ttlMs : (statusPriority > STATUS_PRIORITY.ready ? STATUS_LOCK_MS : 0);
    const now = Date.now ? Date.now() : 0;
    if (State.statusModel && State.statusModel.lockUntilMs > now && statusPriority < State.statusModel.priority) return false;
    State.statusModel = {
      text: statusText,
      priority: statusPriority,
      lockUntilMs: lockMs > 0 ? now + lockMs : 0,
    };
    setText(State.status, statusText);
    return true;
  }
  function setPanelClass(panel, className, enabled) {
    if (!isValid(panel)) return;
    const next = !!enabled;
    try {
      const current = hasPanelClass(panel, className);
      if (current === next) return;
      panel.SetHasClass(className, next);
    } catch (e) {}
  }
  function applyHiddenAffordance(panel, hidden) {
    setPanelClass(panel, CLASSES.hidden, !!hidden);
    setHitTest(panel, !hidden);
  }
  function applyButtonAffordance(panel, options) {
    if (!isValid(panel)) return;
    const opts = options || {};
    const hidden = !!opts.hidden;
    const enabled = !!opts.enabled && !hidden;
    const eligible = !!opts.eligible && !hidden;
    const readOnly = !!opts.readOnly && !hidden;
    setPanelClass(panel, CLASSES.hidden, hidden);
    setPanelClass(panel, CLASSES.eligible, eligible);
    setPanelClass(panel, CLASSES.disabled, !enabled);
    setPanelClass(panel, CLASSES.readOnly, readOnly);
    setHitTest(panel, enabled && !readOnly);
  }
  function makeButtonDecision(hidden, enabled, eligible, readOnly, reason) {
    return {
      hidden: !!hidden,
      enabled: !!enabled && !hidden,
      eligible: !!eligible && !hidden,
      readOnly: !!readOnly && !hidden,
      reason: reason || "",
    };
  }
  function makeGateDecision(hidden, enabled, label, reason) {
    return {
      hidden: !!hidden,
      enabled: !!enabled && !hidden,
      label: label || "",
      reason: reason || "",
    };
  }
  function getViewModelState(count) {
    return {
      game: State.game,
      party: ensureParty(),
      resume: ensureResume(),
      localPlayerKey: normalizePlayerKey(getConfig()[LOCAL_PLAYER_KEY]) || State.localPlayerKey,
      readyCount: count || State.readyCountValue || getReadySeatArray().length,
      sync: getSyncProjection(),
      minReadyPlayers: MIN_READY_PLAYERS,
      partyRoster: PartyReducer.roster(),
      resumeRoster: getResumeRoster(),
      localProgressEntry: getLocalProgressEntry(),
      remainingPlayersWithChips: remainingPlayersWithChips(),
      currentPlayer: getCurrentPlayer(),
      localPlayer: getLocalPlayer(),
      readySeats: getReadySeatArray(),
    };
  }
  function importedResumeRequiresHostedParty(snapshot) {
    const state = snapshot || getViewModelState();
    const resume = state.resume || ensureResume();
    return !!((State.resumeRequiresHostedParty || (resume && resume.hostedLeaderKey)) && resume.payload && resume.id && !isHostedImportedResumeState(state));
  }
  function countReadySavedPlayers(resume, includeLeaderFallback) {
    if (!resume || !resume.payload) return 0;
    let readyCount = 0;
    const keys = Object.keys(resume.ready || {});
    for (let i = 0; i < keys.length; i += 1) {
      const key = normalizePlayerKey(keys[i]);
      if (findProgressRosterEntry(resume.payload, key) && getProgressBankroll(resume.payload, key) > 0) readyCount += 1;
    }
    if (includeLeaderFallback && resume.leaderKey && !(resume.ready && resume.ready[resume.leaderKey])) readyCount += 1;
    return readyCount;
  }
  function countSavedFundedPartyPlayers(resume, partyRoster) {
    if (!resume || !resume.payload) return 0;
    const roster = partyRoster || [];
    let count = 0;
    for (let i = 0; i < roster.length; i += 1) {
      const key = normalizePlayerKey(roster[i] && (roster[i].key || roster[i].name));
      if (key && findProgressRosterEntry(resume.payload, key) && getProgressBankroll(resume.payload, key) > 0) count += 1;
    }
    return count;
  }
  function isHostedImportedResumeState(snapshot) {
    const state = snapshot || getViewModelState();
    const resume = state.resume || ensureResume();
    const party = state.party || ensureParty();
    if (resume.hostedLeaderKey && party.leaderKey && party.leaderKey !== resume.hostedLeaderKey) return false;
    return !!(resume.payload && resume.id && party.id && party.leaderKey && party.mode !== "none");
  }
  function getHostedSharedProgressLeaderKey(resume) {
    const state = resume || ensureResume();
    return normalizePlayerKey(state.hostedLeaderKey || "");
  }
  function bindHostedSharedProgressAuthority(imported, record) {
    const resume = ensureResume();
    const party = ensureParty();
    if (!imported || !imported.payload || !resume.payload || !resume.id) return false;
    const rawSender = record && record.sender;
    const senderKey = isUnknownSender(rawSender) ? "" : normalizePlayerKey(rawSender);
    let leaderKey = "";
    let leaderName = "";
    if (party.leaderKey && (!senderKey || senderKey === party.leaderKey)) {
      leaderKey = party.leaderKey;
      leaderName = party.leaderName || "";
    } else if (senderKey) {
      leaderKey = senderKey;
      leaderName = record.sender || "";
    } else if (party.leaderKey) {
      leaderKey = party.leaderKey;
      leaderName = party.leaderName || "";
    }
    if (!leaderKey || !findProgressRosterEntry(resume.payload, leaderKey) || getProgressBankroll(resume.payload, leaderKey) <= 0) return false;
    const entry = findProgressRosterEntry(resume.payload, leaderKey);
    leaderName = leaderName || (entry && entry.name) || leaderKey;
    resume.hostedLeaderKey = leaderKey;
    resume.hostedLeaderName = leaderName;
    resume.leaderKey = leaderKey;
    resume.leaderName = leaderName;
    resume.ready = {};
    resume.ready[leaderKey] = { key: leaderKey, name: leaderName };
    resume.order = [leaderKey];
    State.resumeRequiresHostedParty = true;
    saveResumeState();
    return true;
  }
  function buildHostedResumeGate(snapshot) {
    const state = snapshot || getViewModelState();
    const resume = state.resume || ensureResume();
    const party = state.party || ensureParty();
    if (!resume.payload || !resume.id) return makeGateDecision(true, false, "", "");
    if (state.game && state.game.active) return makeGateDecision(true, false, "", "Finish the current hand before resuming.");
    if (party.mode !== "leader") return makeGateDecision(true, false, "WAITING FOR LEADER", "Only " + (party.leaderName || "<leader>") + " can start the synced resume.");
    if (!party.leaderKey) return makeGateDecision(false, false, "WAITING FOR NAME", "Leader sender is not known yet.");
    if (state.localPlayerKey !== party.leaderKey) return makeGateDecision(true, false, "WAITING FOR LEADER", "Only " + (party.leaderName || "<leader>") + " can start the synced resume.");
    if (!findProgressRosterEntry(resume.payload, party.leaderKey) || getProgressBankroll(resume.payload, party.leaderKey) <= 0) {
      return makeGateDecision(false, false, "WAITING FOR MATCHING SAVE", "Party leader is not a funded player in this progress.");
    }
    if (countSavedFundedPartyPlayers(resume, state.partyRoster || PartyReducer.roster()) < MIN_READY_PLAYERS) {
      return makeGateDecision(false, false, "WAITING FOR PARTY", "Need 2 hosted party players in this progress to start.");
    }
    if (isProgressShareInProgressForResume(resume)) {
      return makeGateDecision(false, false, "SHARING PROGRESS", "Sharing imported progress through chat before start.");
    }
    return makeGateDecision(false, true, "NEXT SYNCED HAND", "");
  }
  function buildResumeGate(snapshot, hostedResumeGate) {
    const state = snapshot || getViewModelState();
    const resume = state.resume || ensureResume();
    const imported = !!(resume && resume.payload && resume.id);
    if (!imported) return makeGateDecision(true, false, "", "");
    const hostedGate = hostedResumeGate || (isHostedImportedResumeState(state) ? buildHostedResumeGate(state) : null);
    if (hostedGate) return hostedGate;
    if (state.game && state.game.active) return makeGateDecision(true, false, "", "Finish the current hand before resuming.");
    if (importedResumeRequiresHostedParty(state)) return makeGateDecision(false, false, "HOST OR JOIN PARTY", "Host or join a Poker party, then have the party leader import this progress.");
    if (state.localPlayerKey !== resume.leaderKey) return makeGateDecision(true, false, "WAITING FOR RESUME LEADER", "Only " + (resume.leaderName || "<leader>") + " can start this resume.");
    if (countReadySavedPlayers(resume, true) < MIN_READY_PLAYERS) {
      return makeGateDecision(false, false, "WAITING FOR RESUME READY", "Need 2 saved players with chips ready to resume.");
    }
    return makeGateDecision(false, true, "START RESUME", "");
  }
  function countGamePlayersWithChips(game) {
    if (!game || !game.players) return 0;
    let count = 0;
    for (let i = 0; i < game.players.length; i += 1) {
      if ((Number(game.players[i] && game.players[i].stack) || 0) > 0) count += 1;
    }
    return count;
  }
  function buildStartGate(snapshot, resumeGate) {
    const state = snapshot || getViewModelState();
    const game = state.game;
    const party = state.party || ensureParty();
    const resume = state.resume || ensureResume();
    const activeGame = !!(game && game.active);
    if (getActiveTableGameType() === "bluff-deck") return makeGateDecision(true, false, "", "Finish the active Bluff Deck match before starting Poker.");
    const imported = !!(resume && resume.payload && resume.id);
    const finishedProgressAvailable = !!(game && game.finished && !game.active && (state.remainingPlayersWithChips > 1 || countGamePlayersWithChips(game) > 1));
    if (activeGame) return makeGateDecision(true, false, "", "");
    if (imported) return resumeGate || buildResumeGate(state);
    if (State.requiresProgressImport) return makeGateDecision(true, false, "", "Import progress before starting another imported match.");
    if (party.mode === "leader") {
      if (!party.leaderKey) return makeGateDecision(false, false, "WAITING FOR NAME", "Leader sender is not known yet.");
      if ((state.partyRoster || []).length < MIN_READY_PLAYERS) return makeGateDecision(false, false, "WAITING FOR PARTY", "Need 2 joined party players to start.");
      return makeGateDecision(false, true, finishedProgressAvailable ? "NEXT SYNCED HAND" : "START SYNCED HAND", "");
    }
    if (party.mode === "member") {
      return makeGateDecision(true, false, "WAITING FOR LEADER", "Only " + (party.leaderName || "<leader>") + " can start the synced hand.");
    }
    return makeGateDecision(false, false, "HOST OR JOIN PARTY", "Host a synced table or join a [party leader] before starting.");
  }
  function buildViewModel(state) {
    const snapshot = state || getViewModelState();
    const game = snapshot.game;
    const party = snapshot.party || ensureParty();
    const resume = snapshot.resume || ensureResume();
    const activeGame = !!(game && game.active);
    const hasGame = !!game;
    const finishedProgressAvailable = !!(game && game.finished && !game.active && (snapshot.remainingPlayersWithChips > 1 || countGamePlayersWithChips(game) > 1));
    const canUseManualImport = !!(!activeGame && !finishedProgressAvailable && party.mode === "leader" && party.id);
    const showProgressControls = !!(finishedProgressAvailable || canUseManualImport);
    const localSeated = !!snapshot.localPlayer;
    const activeObserver = activeGame && !localSeated;
    const imported = !!(resume && resume.payload && resume.id);
    const hostedImportedResume = isHostedImportedResumeState(snapshot);
    const hostedPartyRequiredResume = importedResumeRequiresHostedParty(snapshot);
    const localSavedFunded = !!(snapshot.localProgressEntry && getProgressBankroll(resume.payload, snapshot.localProgressEntry.key) > 0);
    const localIsResumeLeader = !!(imported && resume.leaderKey && snapshot.localPlayerKey === resume.leaderKey);
    const localAlreadyResumeReady = !!(imported && resume.ready && resume.ready[snapshot.localPlayerKey]);
    const hostedResumeGate = buildHostedResumeGate(snapshot);
    const hostedResumeStart = hostedResumeGate.enabled;
    const needsResumeIdentity = !!(imported && !hostedPartyRequiredResume && !activeGame && !localSavedFunded);
    const canUseReadyChat = !!(!activeGame && needsResumeIdentity);
    const resumeGate = ViewModel.resumeGate(snapshot, hostedImportedResume ? hostedResumeGate : null);
    const startGate = ViewModel.startGate(snapshot, resumeGate);
    const resumeReadyCount = countReadySavedPlayers(resume, false);
    const resumeFundedCount = (snapshot.resumeRoster || []).length;
    let resumeStatus = imported ? (hostedPartyRequiredResume ? "Imported progress loaded. Host or join a party; the party leader imports progress and starts NEXT SYNCED HAND." : "Leader: " + (resume.leaderName || "none") + ". Ready: " + resumeReadyCount + "/" + resumeFundedCount + ".") : "Import progress to choose a resume leader.";
    if (hostedImportedResume && party.mode === "leader" && hostedResumeGate.enabled) resumeStatus = "Ready from imported progress. Click NEXT SYNCED HAND to start.";
    else if (hostedImportedResume && party.mode === "leader") resumeStatus = hostedResumeGate.reason || "Waiting to start synced imported progress.";
    else if (hostedImportedResume) resumeStatus = "Imported progress. Waiting for " + (party.leaderName || "<leader>") + " to start NEXT SYNCED HAND.";
    const resumeProjection = {
      imported: imported,
      hostedImported: hostedImportedResume,
      hostedPartyRequired: hostedPartyRequiredResume,
      localSavedFunded: localSavedFunded,
      localIsLeader: localIsResumeLeader,
      localAlreadyReady: localAlreadyResumeReady,
      readyCount: resumeReadyCount,
      fundedCount: resumeFundedCount,
      progressLabel: imported ? "Imported progress " + resume.id + "." : "Finish a hand to copy progress, or paste a code to resume.",
      resumeStatus: resumeStatus,
      partyStatus: (snapshot.sync && (snapshot.sync.waitingForReadySnapshot || snapshot.sync.waitingForChatSnapshot)) ? "Syncing poker chat state..." : (imported ? resumeGate.reason : ""),
    };
    const canJoinParty = !!(party.id && (party.mode === "none" || activeObserver) && (activeObserver || !activeGame));
    let partyStatus = "";
    if (snapshot.sync && (snapshot.sync.waitingForReadySnapshot || snapshot.sync.waitingForChatSnapshot)) partyStatus = "Syncing poker chat state...";
    else if (activeObserver) partyStatus = "Join now to wait for the next hand.";
    else if (needsResumeIdentity && !snapshot.localPlayerKey) partyStatus = "Identify yourself with READY UP so Deadlock exposes your saved player name; resume controls will unlock after that.";
    else if (needsResumeIdentity) partyStatus = "Detected sender is not in this imported progress. Use READY UP or reopen party chat from a saved player to unlock resume controls.";
    else if (hostedImportedResume && party.mode === "leader" && hostedResumeGate.enabled) partyStatus = "Ready from imported progress. Click NEXT SYNCED HAND to start.";
    else if (hostedImportedResume && party.mode === "leader") partyStatus = hostedResumeGate.reason || "";
    else if (hostedImportedResume) partyStatus = "Imported progress. Waiting for " + (party.leaderName || "<leader>") + " to start NEXT SYNCED HAND.";
    else if (hostedPartyRequiredResume) partyStatus = "Imported progress loaded. Host or join a Poker party; the party leader imports progress and starts NEXT SYNCED HAND.";
    else if (party.id && party.mode === "none" && !party.leaderKey) partyStatus = "Hosted Poker party found. Click JOIN PARTY to join the lobby.";
    else partyStatus = (imported ? resumeGate.reason : startGate.reason) || "";
    let actionHint = "";
    let actionChoices = [];
    if (activeGame && snapshot.currentPlayer) {
      const turn = PokerEngine.actions(game, snapshot.currentPlayer.key, snapshot.localPlayer && snapshot.localPlayer.key);
      if (!snapshot.localPlayer) {
        actionHint = "Chat sender unknown. Turn: " + snapshot.currentPlayer.name + ". Type ready or reopen party chat so Deadlock exposes your name before acting.";
        actionChoices = turn.actionChoices;
      } else if (snapshot.currentPlayer.key !== snapshot.localPlayer.key) {
        actionHint = "Waiting for " + snapshot.currentPlayer.name + ". Their available choices are shown read-only below.";
        actionChoices = turn.actionChoices;
      } else {
        actionHint = turn.statusText;
        actionChoices = turn.actionChoices;
      }
    }
    const playerRows = buildPlayerRenderModelForState(snapshot);
    const tableModel = buildTableRenderModelForState(snapshot, playerRows);
    const readyRows = buildReadySeatModels(snapshot.readySeats);
    const resumeRows = buildResumeLeaderModels(resume);
    const communityRows = [];
    const community = game && game.community ? game.community : [];
    for (let i = 0; i < 5; i += 1) communityRows.push({ key: String(i), card: community[i] || null });
    const potAmount = game ? Math.max(0, Math.floor(Number(game.pot) || 0)) : 0;
    const logEntries = game && game.log && game.log.length ? game.log : (hasGame ? ["Hand history will appear here."] : []);
    const logStart = Math.max(0, logEntries.length - MAX_GAME_LOG_ENTRIES);
    const logRows = logEntries.slice(logStart).map((text, index) => ({ key: String(index), text: text }));
    const announcement = game && game.announcement;
    const hasWinnerFeedback = !!(game && game.potWinnerKeys && Object.keys(game.potWinnerKeys).length);
    return {
      state: snapshot,
      controls: {
        readyChat: makeButtonDecision(!canUseReadyChat, canUseReadyChat, false, false, ""),
        partyControls: { hidden: activeGame && !activeObserver },
        partyHost: makeButtonDecision(activeGame || party.mode !== "none", !activeGame && party.mode === "none", false, false, ""),
        partyJoin: makeButtonDecision(!canJoinParty, canJoinParty, canJoinParty, false, ""),
        progressControls: { hidden: !showProgressControls },
        exportProgress: makeButtonDecision(!finishedProgressAvailable, finishedProgressAvailable, finishedProgressAvailable, false, ""),
        importProgress: makeButtonDecision(!canUseManualImport, canUseManualImport, canUseManualImport, false, ""),
        progressCodeInput: makeButtonDecision(!canUseManualImport, canUseManualImport, canUseManualImport, false, ""),
        resumeControls: { hidden: !imported || activeGame },
        resumeLeader: makeButtonDecision(hostedImportedResume || hostedPartyRequiredResume || hostedResumeStart || !imported || activeGame || !localSavedFunded || localIsResumeLeader, !hostedImportedResume && !hostedPartyRequiredResume && !hostedResumeStart && imported && !activeGame && localSavedFunded && !localIsResumeLeader, !hostedImportedResume && !hostedPartyRequiredResume && !hostedResumeStart && imported && !activeGame && localSavedFunded && !localIsResumeLeader, false, ""),
        resumeReady: makeButtonDecision(hostedImportedResume || hostedPartyRequiredResume || !imported || activeGame || !localSavedFunded || !resume.leaderKey || localIsResumeLeader || localAlreadyResumeReady, !hostedImportedResume && !hostedPartyRequiredResume && imported && !activeGame && localSavedFunded && !!resume.leaderKey && !localIsResumeLeader && !localAlreadyResumeReady, !hostedImportedResume && !hostedPartyRequiredResume && imported && !activeGame && localSavedFunded && !!resume.leaderKey && !localIsResumeLeader && !localAlreadyResumeReady, false, ""),
        resumeLeaderList: { hidden: !imported },
        start: makeButtonDecision(startGate.hidden, startGate.enabled, startGate.enabled, false, startGate.reason),
        endMatch: makeButtonDecision(!hasGame || party.mode !== "leader", hasGame && party.mode === "leader", false, false, ""),
        leaveLobby: makeButtonDecision(!(party.id || party.mode !== "none" || hasGame || (resume && resume.id)), party.id || party.mode !== "none" || hasGame || (resume && resume.id), false, false, ""),
        actionContainer: { hidden: !activeGame },
      },
      text: {
        startLabel: startGate.label,
        partyStatus: partyStatus,
        progressCodeLabel: resumeProjection.progressLabel,
        resumeStatus: resumeProjection.resumeStatus,
        actionHint: actionHint,
      },
      hasGame: hasGame,
      activeGame: activeGame,
      phase: game ? String(game.phase || "lobby").toUpperCase() : "LOBBY",
      announcer: {
        title: announcement && announcement.title ? announcement.title : "Poker announcer",
        detail: announcement && announcement.detail ? announcement.detail : "Ready up, start a hand, and the table will call blinds, turns, checks, bets, raises, folds, and winners here.",
        winner: hasWinnerFeedback,
      },
      pot: { amount: potAmount, chips: getPotChipArtRows(potAmount) },
      communityRows: communityRows,
      actions: { rows: actionChoices, hint: actionHint },
      logRows: logRows,
      readyRows: readyRows,
      resumeRows: resumeRows,
      playerRows: playerRows,
      table: tableModel,
      progress: resumeProjection,
      gates: { start: startGate, resume: resumeGate, hostedResume: hostedResumeGate },
    };
  }
  const ViewModel = {
    build: buildViewModel,
    startGate: buildStartGate,
    resumeGate: buildResumeGate,
  };
  function cancelHostedLobbyOnClose() {
    const party = ensureParty();
    if (!party.id || party.mode !== "leader") return;
    if (State.game && State.game.active) return;
    if (State.bluffDeck && State.bluffDeck.game && State.bluffDeck.game.active) return;
    const partyId = party.id;
    sendChatMessage(PARTY_LEAVE_PREFIX + " poker party " + partyId, true, true);
    State.lastLobbyLeaveMs = Date.now();
    PartyReducer.reset(LOBBY_RESET_CASES.hostClose, "leader close");
    clearReadySeats("leader close");
    savePartyState();
    setStatus("Hosted Poker lobby closed.");
  }
  function tableGameName(gameType) {
    return gameType === "bluff-deck" ? "Bluff Deck" : "Poker";
  }
  function tableSyncPending() {
    return !!(State.sync && (State.sync.waitingForReadySnapshot || State.sync.waitingForChatSnapshot));
  }
  function getTerminalTableGameType() {
    if (State.game && !State.game.active) return "poker";
    const bluffGame = State.bluffDeck && State.bluffDeck.game;
    if (bluffGame && !bluffGame.active) return "bluff-deck";
    return State.terminalTableGame || "";
  }
  function getTablePickerSource() {
    return getActiveTableGameType() || getTerminalTableGameType() || State.pickerSourceGame || "";
  }
  function clearLocalTableForSwitch() {
    PartyReducer.reset(LOBBY_RESET_CASES.leaveLobby, "switch table");
    savePartyState();
  }
  function leaveTerminalTableForSwitch() {
    const party = ensureParty();
    if (party.mode === "leader" || party.mode === "member") leaveLobby();
    else clearLocalTableForSwitch();
    State.terminalTableGame = "";
  }
  function selectTableGame(gameType) {
    const next = String(gameType || "").toLowerCase();
    if (next !== "poker" && next !== "bluff-deck") return false;
    const active = getActiveTableGameType();
    if (active && active !== next) {
      setStatus("Finish the active " + tableGameName(active) + " match before switching games.", STATUS_PRIORITY.gate);
      RenderScheduler.immediate("table-game-switch-rejected");
      return false;
    }
    const terminal = getTerminalTableGameType();
    const source = getTablePickerSource();
    const destructiveSwitch = !!(terminal && source === terminal && source !== next);
    if (destructiveSwitch && (tableSyncPending() || (State.bluffDeck && State.bluffDeck.pending))) {
      RenderScheduler.immediate("table-game-switch-waiting");
      return false;
    }
    if (destructiveSwitch && State.pendingTableSwitch !== next) {
      State.pendingTableSwitch = next;
      RenderScheduler.immediate("table-game-switch-confirm");
      return false;
    }
    if (destructiveSwitch) leaveTerminalTableForSwitch();
    State.pendingTableSwitch = "";
    State.pickerSourceGame = "";
    State.tablePickerRequested = false;
    State.selectedTableGame = next;
    setPanelClass(State.pickerPokerButton, "Selected", next === "poker");
    setPanelClass(State.pickerBluffButton, "Selected", next === "bluff-deck");
    if (next === "bluff-deck") requestBluffDeckFastPoll();
    RenderScheduler.immediate(destructiveSwitch ? "table-game-switched-after-leave" : "table-game-selected");
    return true;
  }
  function backToTablePicker() {
    if (!State.isOpen || !State.selectedTableGame) return false;
    State.pickerSourceGame = State.selectedTableGame;
    State.selectedTableGame = "";
    State.pendingTableSwitch = "";
    State.tablePickerRequested = true;
    RenderScheduler.immediate("table-game-back");
    return true;
  }
  function selectBluffSlot(index) {
    const game = State.bluffDeck && State.bluffDeck.game;
    const local = game && bdPlayerAt(game, localBluffKey());
    const slot = Number(index);
    if (!canSelectBluffCards(game, local)) return false;
    if (!local || !Array.isArray(local.hand) || !Number.isInteger(slot) || slot < 0 || slot >= local.hand.length) return false;
    const bit = 1 << slot;
    if ((local.remainingMask & bit) === 0) return false;
    const selected = Number(State.bluffDeck.selectedMask) || 0;
    return BluffDeckActions.selectMask(selected & bit ? selected & ~bit : selected | bit);
  }
  function selectBluffSlot0() { return selectBluffSlot(0); }
  function selectBluffSlot1() { return selectBluffSlot(1); }
  function selectBluffSlot2() { return selectBluffSlot(2); }
  function selectBluffSlot3() { return selectBluffSlot(3); }
  function selectBluffSlot4() { return selectBluffSlot(4); }
  function hidePokerSurface(hidden) {
    for (const panel of [State.lobbyWindow, State.tableWindow, State.playersWindow, State.historyWindow, State.actionsWindow]) {
      applyHiddenAffordance(panel, hidden);
    }
  }
  function hideBluffSurface(hidden) {
    for (const panel of [State.bluffWindow, State.bluffHistoryWindow]) {
      applyHiddenAffordance(panel, hidden);
    }
  }
  function setOpen(open) {
    cachePanels();
    const wasOpen = State.isOpen;
    State.isOpen = !!open;
    if (wasOpen && !State.isOpen) cancelHostedLobbyOnClose();
    if (!State.isOpen) State.pendingTableSwitch = "";
    setPanelClass(State.root, CLASSES.visible, State.isOpen);
    setPanelClass(State.tableWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.lobbyWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.playersWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.actionsWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.historyWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.pickerWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.bluffWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.bluffHistoryWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.menuButton, CLASSES.active, State.isOpen);
    if (State.isOpen) {
      if (!isTestMode()) startRefreshLoop();
      requestBluffDeckFastPoll();
      openMenuSync();
    }
  }
  function toggleOpen() {
    setOpen(!State.isOpen);
  }
  function closeMenu() {
    setOpen(false);
  }
  function addClass(panel, className) {
    if (!isValid(panel)) return;
    try {
      if (typeof panel.AddClass === "function") panel.AddClass(className);
      else panel.SetHasClass(className, true);
    } catch (e) {}
  }
  function deletePanel(panel) {
    try {
      if (panel && typeof panel.DeleteAsync === "function") panel.DeleteAsync(0);
    } catch (e) {}
  }
  function clearChildren(parent) {
    if (!isValid(parent)) return;
    try {
      if (typeof parent.RemoveAndDeleteChildren === "function") {
        parent.RemoveAndDeleteChildren();
        return;
      }
    } catch (e) {}
    try {
      while (parent.GetChildCount && parent.GetChildCount() > 0) {
        const child = parent.GetChild(0);
        if (!child) break;
        deletePanel(child);
      }
    } catch (e) {}
  }
  function createPanel(type, parent, id, className, attrs) {
    if (!isValid(parent) || typeof $.CreatePanel !== "function") return null;
    try {
      const panel = attrs ? $.CreatePanel(type, parent, id || "", attrs) : $.CreatePanel(type, parent, id || "");
      if (className) {
        const classes = String(className).split(/\s+/);
        for (let i = 0; i < classes.length; i += 1) if (classes[i]) addClass(panel, classes[i]);
      }
      return panel;
    } catch (e) {
      return null;
    }
  }

  function createLabel(parent, className, text) {
    const label = createPanel("Label", parent, "", className);
    if (label) label.text = text;
    return label;
  }

  function makeCardLabel(card) {
    if (!card) return "??";
    return card.rank + card.suit;
  }

  function getSuitGlyph(suit) {
    if (suit === "S") return "♠";
    if (suit === "H") return "♥";
    if (suit === "D") return "♦";
    if (suit === "C") return "♣";
    return "◆";
  }

  function getCardDisplayRank(rank) {
    return rank === "T" ? "10" : String(rank || "?");
  }

  function getCardFaceName(rank) {
    if (rank === "A") return "ACE";
    if (rank === "K") return "KING";
    if (rank === "Q") return "QUEEN";
    if (rank === "J") return "JACK";
    if (rank === "T") return "TEN";
    return "";
  }

  function getCardImageKey(card) {
    if (!card) return "joker";
    if (card.rank === "A") return "ace";
    if (card.rank === "K") return "king";
    if (card.rank === "Q") return "queen";
    if (card.rank === "J") return "jack";
    if (card.suit === "H") return "heart";
    if (card.suit === "D") return "diamond";
    if (card.suit === "S") return "spade";
    if (card.suit === "C") return "club";
    return "joker";
  }

  function getCardImageAsset(card) {
    const key = getCardImageKey(card);
    const prefix = key === "heart" || key === "diamond" || key === "spade" || key === "club" ? "card_suit_" : "card_face_";
    return prefix + key + ".vtex";
  }

  function getCardImageSrc(card) {
    return "s2r://panorama/images/poker/cards/" + getCardImageAsset(card);
  }

  function getCardArtClass(card) {
    const key = getCardImageKey(card);
    return "Art" + key.charAt(0).toUpperCase() + key.slice(1);
  }

  function setImageSource(image, src) {
    if (!image || image.__pokerImageSrc === src) return;
    let applied = false;
    try {
      if (typeof image.SetImage === "function") {
        image.SetImage(src);
        applied = true;
      }
    } catch (e) {}
    if (!applied) {
      try {
        if (typeof image.SetAttributeString === "function") {
          image.SetAttributeString("src", src);
          applied = true;
        }
      } catch (e) {}
    }
    try {
      image.src = src;
      applied = true;
    } catch (e) {}
    if (applied) image.__pokerImageSrc = src;
  }

  function createCardArt(parent, card) {
    const art = createPanel("Panel", parent, "", "PokerCardArt");
    if (!art) return;
    addClass(art, getCardArtClass(card));
    if (!card) addClass(art, "Hidden");
    else if (getCardFaceName(card.rank)) addClass(art, "Face");
    else addClass(art, "Pips");
    const image = createPanel("Image", art, "", "PokerCardVtexArt");
    setImageSource(image, getCardImageSrc(card));
    return art;
  }

  function renderCardContents(parent, card) {
    createLabel(parent, "PokerCardRank", card ? getCardDisplayRank(card.rank) : "?");
    createLabel(parent, "PokerCardSuit", card ? getSuitGlyph(card.suit) : "?");
    createCardArt(parent, card);
  }

  function renderStableCardContents(panel, card, hidden) {
    const contents = createPanel("Panel", panel, "", hidden ? "PokerCardContents FlipHidden" : "PokerCardContents");
    if (!contents) return null;
    applyCardVisualState(contents, card);
    panel.__pokerCardContents = contents;
    renderCardContents(contents, card);
    return contents;
  }

  function setStableCardContentsHidden(panel, hidden) {
    const contents = panel && panel.__pokerCardContents;
    if (isValid(contents)) setPanelClass(contents, "FlipHidden", !!hidden);
  }

  function applyCardVisualState(panel, card) {
    const red = card && (card.suit === "H" || card.suit === "D");
    setPanelClass(panel, CLASSES.red, !!red);
    setPanelClass(panel, CLASSES.black, !red);
    setPanelClass(panel, "CardBack", !card);
  }

  function createCard(parent, card, small) {
    const panel = createPanel("Panel", parent, "", small ? "PokerCard Small" : "PokerCard");
    if (!panel) return null;
    panel.__pokerCardKey = card ? makeCardLabel(card) : "back";
    panel.__pokerCardValue = card || null;
    applyCardVisualState(panel, card);
    renderStableCardContents(panel, card, false);
    return panel;
  }

  function createCardFlipLayer(panel, card, className, showQuestionFace) {
    const layer = createPanel("Panel", panel, "", "PokerCardFlipLayer " + className + (showQuestionFace ? " QuestionFace" : ""));
    if (!layer) return null;
    if (showQuestionFace) {
      setPanelClass(layer, CLASSES.red, false);
      setPanelClass(layer, CLASSES.black, true);
      setPanelClass(layer, "CardBack", false);
    } else {
      applyCardVisualState(layer, card);
    }
    renderCardContents(layer, card);
    return layer;
  }

  function completeCardFlip(panel, key, layers, finalCard) {
    const finish = () => {
      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];
        if (isValid(layer) && typeof layer.DeleteAsync === "function") layer.DeleteAsync(0);
      }
      if (!isValid(panel) || panel.__pokerCardKey !== key) return;
      if (arguments.length >= 4) applyCardVisualState(panel, finalCard);
      setStableCardContentsHidden(panel, false);
      setPanelClass(panel, "FlipActive", false);
    };
    try {
      $.Schedule(1.2, finish);
    } catch (e) {
      finish();
    }
  }

  function updateCardPanel(panel, card, small) {
    if (!isValid(panel)) return;
    const key = card ? makeCardLabel(card) : "back";
    const previousKey = panel.__pokerCardKey || "back";
    if (previousKey === key) return;
    const previousCard = panel.__pokerCardValue || null;
    panel.__pokerCardKey = key;
    panel.__pokerCardValue = card || null;

    if (previousKey === "back" && key !== "back") {
      setPanelClass(panel, "FlipActive", true);
      clearChildren(panel);
      renderStableCardContents(panel, card, true);
      const backLayer = createCardFlipLayer(panel, null, "FlipToBack", true);
      const revealLayer = createCardFlipLayer(panel, card, "FlipReveal");
      completeCardFlip(panel, key, [backLayer, revealLayer], card);
      return;
    }

    if (previousKey !== "back" && key === "back") {
      clearChildren(panel);
      renderStableCardContents(panel, null, true);
      const oldLayer = createCardFlipLayer(panel, previousCard, "FlipToBack");
      const questionLayer = createCardFlipLayer(panel, null, "FlipReveal", true);
      setPanelClass(panel, "FlipActive", true);
      completeCardFlip(panel, key, [oldLayer, questionLayer], null);
      return;
    }

    applyCardVisualState(panel, card);
    clearChildren(panel);
    renderStableCardContents(panel, card, false);
  }

  function renderSeatRows(cacheKey, parent, models) {
    if (!isValid(parent)) return;
    State.renderCache[cacheKey] = State.renderCache[cacheKey] || {};
    Rows.update(State.renderCache[cacheKey], parent, models || [], RowSpecs.seat);
  }

  function buildReadySeatModels(seats) {
    const rows = seats || [];
    if (!rows.length) return [{ key: "empty", idPrefix: "PokerSeat", empty: true, name: "No ready players yet", meta: "Type ready in team or party chat to take a seat.", number: "" }];
    return rows.map((seat, index) => ({
      key: normalizePlayerKey(seat && (seat.key || seat.name)) || ("seat" + index),
      idPrefix: "PokerSeat",
      empty: false,
      number: String(index + 1),
      name: seat && seat.name ? seat.name : "Player",
      meta: "READY",
    }));
  }

  function buildResumeLeaderModels(resume) {
    const state = resume || ensureResume();
    const payload = state && state.payload;
    if (!payload || !payload.roster || !payload.roster.length) {
      return [{ key: "empty", idPrefix: "PokerResumeSeat", empty: true, name: "No imported progress", meta: "Paste a POKERPROG1 code.", number: "" }];
    }
    return payload.roster.map((entry, index) => {
      const key = normalizePlayerKey(entry && (entry.key || entry.name)) || ("resume" + index);
      const stack = getProgressBankroll(payload, key);
      const status = stack <= 0 ? "OUT" : (state.leaderKey === key ? "LEADER" : (state.ready && state.ready[key] ? "READY" : "WAITING"));
      return {
        key: key,
        idPrefix: "PokerResumeSeat",
        empty: false,
        number: String(index + 1),
        name: entry && entry.name ? entry.name : key,
        meta: "$" + stack + "  " + status,
      };
    });
  }

  function renderProgressControls(state) {
    if (!state) return;
    applyHiddenAffordance(State.progressControls, state.controls.progressControls.hidden);
    applyButtonAffordance(State.exportProgressButton, state.controls.exportProgress);
    applyButtonAffordance(State.importProgressButton, state.controls.importProgress);
    applyButtonAffordance(State.progressCodeInput, state.controls.progressCodeInput);
    applyHiddenAffordance(State.resumeControls, state.controls.resumeControls.hidden);
    applyHiddenAffordance(State.resumeLeaderList, state.controls.resumeLeaderList.hidden);
    applyButtonAffordance(State.resumeLeaderButton, state.controls.resumeLeader);
    applyButtonAffordance(State.resumeReadyButton, state.controls.resumeReady);
    setText(State.progressCodeLabel, state.text.progressCodeLabel);
    setText(State.resumeStatus, state.text.resumeStatus);
    renderSeatRows("resumeLeaderRows", State.resumeLeaderList, state.resumeRows);
  }

  function updateStartButton(state) {
    if (!state) return;
    applyButtonAffordance(State.startButton, state.controls.start);
    applyButtonAffordance(State.readyChatButton, state.controls.readyChat);
    applyHiddenAffordance(State.partyControls, state.controls.partyControls.hidden);
    applyButtonAffordance(State.partyHostButton, state.controls.partyHost);
    applyButtonAffordance(State.partyJoinButton, state.controls.partyJoin);
    setText(State.startButtonLabel, state.text.startLabel);
    if (state.text.partyStatus) setText(State.partyStatus, state.text.partyStatus);
  }

  function updateReadySeats(force) {
    cachePanels();
    const revision = getReadyRevision();
    const seats = getReadySeatArray();
    const count = seats.length;
    if (!force && State.readyRevision === revision && State.readyCountValue === count) return;
    const viewModel = ViewModel.build(getViewModelState(count));
    PokerMetrics.increment("readyUpdate");
    State.readyRevision = revision;
    State.readyCountValue = count;
    renderSeatRows("readySeatRows", State.seatsList, viewModel.readyRows);
    setText(State.readyCount, String(MAX_TABLE_PLAYERS));
    if (!viewModel.hasGame) renderPlayers(viewModel);
    updateStartButton(viewModel);
    if (!viewModel.activeGame) {
      setStatus(count >= MIN_READY_PLAYERS ? "Ready to start with " + count + " players." : "Waiting for " + (MIN_READY_PLAYERS - count) + " more ready player" + (MIN_READY_PLAYERS - count === 1 ? "." : "s."), STATUS_PRIORITY.ready, 0);
    }
    log("render ready seats: " + count + " player(s), revision " + revision);
  }

  function upsertReadySeat(entry) {
    if (!entry || !entry.name) return false;
    const previousLocalKey = State.localPlayerKey || "";
    if (entry.isSelf) rememberLocalPlayer(entry.name);
    const localIdentityChanged = !!(entry.isSelf && State.localPlayerKey && State.localPlayerKey !== previousLocalKey);
    if (!canAcceptReadyEntry(entry)) return localIdentityChanged;
    const key = normalizePlayerKey(entry.key || entry.name);
    if (!key) return localIdentityChanged;
    const seats = getReadySeats();
    seats[key] = {
      key: key,
      name: entry.name,
      channel: entry.channel || "",
      message: entry.message || "",
      readyAt: entry.readyAt || Date.now(),
    };
    return true;
  }

  function applyReadyPayload(event) {
    if (!event || event.event !== READY_EVENT) return false;
    let changed = false;
    if (event.seats) {
      changed = replaceReadySeats(event.seats) || changed;
    } else if (event.key || event.name) {
      changed = upsertReadySeat(event) || changed;
    }
    if (changed) {
      const config = getConfig();
      const incomingRevision = typeof event.revision === "number" ? event.revision : 0;
      config[READY_REVISION_KEY] = Math.max((config[READY_REVISION_KEY] || 0) + 1, incomingRevision);
    }
    return changed;
  }

  function handleBridgeEvent(payload) {
    let event = null;
    try {
      if (typeof payload !== "string" || !payload) return;
      event = JSON.parse(payload);
    } catch (e) {
      return;
    }
    if (!event || !event.event) return;
    if (!shouldRunMenuWork()) return;
    noteBridgeEvent(event);
    if (event.event === "BluffDeckSendStatus") {
      handleBluffDeckSendStatus(event);
      return;
    }
    if (event.event === READY_EVENT) {
      PokerMetrics.increment("readyPayload");
      if (applyReadyPayload(event)) {
        log("received ready payload; rendering seats");
        updateReadySeats(true);
      }
      afterSnapshotApplied();
      return;
    }
    if (event.event === CHAT_EVENT) {
      CommandReducer.applyPayload(event, true);
      afterSnapshotApplied();
    }
  }

  function requestReadySnapshot() {
    try {
      $.DispatchEvent(CLIENT_OUTPUT_EVENT, JSON.stringify({ event: READY_REQUEST_EVENT, source: "poker_escape_menu" }));
    } catch (e) {}
  }

  function requestReadySnapshotBurst() {
    requestReadySnapshot();
    try {
      $.Schedule(0.2, requestReadySnapshot);
      $.Schedule(0.75, requestReadySnapshot);
    } catch (e) {}
  }

  function requestChatSnapshot() {
    try {
      $.DispatchEvent(CLIENT_OUTPUT_EVENT, JSON.stringify({ event: CHAT_SNAPSHOT_REQUEST_EVENT, source: "poker_escape_menu" }));
    } catch (e) {}
  }

  function requestFreshState(reason) {
    State.sync.waitingForReadySnapshot = true;
    State.sync.waitingForChatSnapshot = true;
    State.sync.reason = "Syncing poker chat state...";
    State.sync.openRequestMs = Date.now();
    requestReadySnapshotBurst();
    requestChatSnapshot();
    setStatus(State.sync.reason, STATUS_PRIORITY.sync);
  }

  function afterSnapshotApplied() {
    if (!State.sync.waitingForReadySnapshot && !State.sync.waitingForChatSnapshot) {
      State.sync.reason = "";
    }
    updateReadySeats(true);
    RenderScheduler.defer("snapshot-applied");
  }

  function openMenuSync() {
    PokerMetrics.increment("menuOpen");
    requestFreshState("open");
    updateReadySeats(true);
    RenderScheduler.immediate("open-menu");
    try {
      $.Schedule(0.05, afterSnapshotApplied);
      $.Schedule(0.2, afterSnapshotApplied);
      $.Schedule(0.75, afterSnapshotApplied);
    } catch (e) {}
  }

  function noteBridgeEvent(event) {
    if (!event || !event.event) return;
    if (event.event === BridgeContract.readyEvent && event.action === "snapshot" && State.sync.waitingForReadySnapshot) {
      State.sync.waitingForReadySnapshot = false;
      State.sync.lastReadySnapshotMs = Date.now();
    }
    if (event.event === BridgeContract.chatEvent && event.action === "snapshot" && State.sync.waitingForChatSnapshot) {
      State.sync.waitingForChatSnapshot = false;
      State.sync.lastChatSnapshotMs = Date.now();
    }
  }

  function getSyncProjection() {
    return {
      waitingForReadySnapshot: State.sync.waitingForReadySnapshot,
      waitingForChatSnapshot: State.sync.waitingForChatSnapshot,
      lastReadySnapshotMs: State.sync.lastReadySnapshotMs,
      lastChatSnapshotMs: State.sync.lastChatSnapshotMs,
      openRequestMs: State.sync.openRequestMs,
      reason: State.sync.reason,
    };
  }

  function requestBluffDeckFastPoll() {
    if (!State.bluffDeck || !State.bluffDeck.game || !State.bluffDeck.game.active) return false;
    try {
      $.DispatchEvent(CLIENT_OUTPUT_EVENT, JSON.stringify({
        event: BridgeContract.bluffDeckFastPollRequestEvent,
        until: Date.now() + 1000,
      }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function startRefreshLoop() {
    if (State.refreshLoopStarted) return;
    State.refreshLoopStarted = true;
    const tick = () => {
      if (State.isOpen) {
        updateReadySeats(false);
        requestBluffDeckFastPoll();
      }
      $.Schedule(State.isOpen ? 0.35 : 1.0, tick);
    };
    $.Schedule(0.35, tick);
  }

  function markProgressShareSubmitted(message) {
    const share = State.progressShare || defaultProgressShareState();
    if (!share.sent || !share.id || !share.checksum) return;
    const parsed = CommandReducer.decode({ message: message });
    if (!parsed || (parsed.type !== "progress-offer" && parsed.type !== "progress-chunk") || parsed.id !== share.id || parsed.checksum !== share.checksum) return;
    const messageCount = share.messageCount || (share.chunkCount ? share.chunkCount + 1 : 0);
    if (!messageCount) return;
    share.messageCount = messageCount;
    share.submittedCount = Math.min(messageCount, (share.submittedCount || 0) + 1);
    if (share.submittedCount >= messageCount) {
      const readyAt = Date.now() + PROGRESS_SHARE_START_GRACE_MS;
      share.readyAt = readyAt;
      $.Schedule(Math.max(0.1, (readyAt - Date.now()) / 1000), () => RenderScheduler.defer("progress-share-ready"));
    }
  }

  function sendChatMessage(message, skipOpenSync, forceSend) {
    const now = Date.now();
    if (!forceSend && now - State.lastSendMs < 800) {
      const waitMs = Math.max(50, 800 - (now - State.lastSendMs));
      const current = getCurrentPlayer();
      setStatus("Ignored rapid click. Pending command " + message + " for " + (current ? current.name : "<none>") + ". Wait " + waitMs + "ms.");
      log("send throttle ignored message=" + message + " current=" + (current ? current.name : "<none>") + " elapsedMs=" + (now - State.lastSendMs) + " waitMs=" + waitMs + " lastSendMs=" + State.lastSendMs);
      return false;
    }
    State.lastSendMs = now;
    if (!skipOpenSync) setOpen(true);
    setStatus("Sending through poker chat bridge: " + message);
    try {
      $.DispatchEvent(CLIENT_OUTPUT_EVENT, JSON.stringify({
        event: BridgeContract.chatSendRequestEvent,
        message: message,
        source: "poker_escape_menu",
      }));
      markProgressShareSubmitted(message);
      return true;
    } catch (e) {
      setStatus("Chat bridge send failed; see console.");
      log("chat bridge send failed");
      return false;
    }
  }

  function sendBackgroundChatMessage(message) {
    const lastManualSendMs = State.lastSendMs;
    const sent = sendChatMessage(message, false, true);
    State.lastSendMs = lastManualSendMs;
    return sent;
  }

  function isProgressShareInProgressForResume(resume) {
    const share = State.progressShare || defaultProgressShareState();
    if (!(resume && resume.id && share.sent && share.id === resume.id)) return false;
    if (share.messageCount && (share.submittedCount || 0) < share.messageCount) return true;
    return !!(share.readyAt && Date.now() < share.readyAt);
  }

  function shareProgressCode(code, id, reason, shareKeyOverride) {
    const checksum = checksumFromProgressCode(code);
    const text = String(code || "");
    const chunks = [];
    for (let i = 0; i < text.length; i += PROGRESS_SHARE_CHUNK_SIZE) chunks.push(text.slice(i, i + PROGRESS_SHARE_CHUNK_SIZE));
    const shareKey = shareKeyOverride || getProgressShareKey();
    if (!checksum || !chunks.length || !shareKey) return false;
    if (State.progressShare && State.progressShare.key === shareKey && State.progressShare.sent) return false;
    const messages = [PROGRESS_OFFER_PREFIX + " poker progress " + id + " " + checksum + " " + chunks.length];
    for (let i = 0; i < chunks.length; i += 1) {
      messages.push(PROGRESS_CHUNK_PREFIX + " poker progress " + id + " " + checksum + " " + (i + 1) + "/" + chunks.length + " " + chunks[i]);
    }
    const readyAt = Date.now() + Math.ceil((0.2 + Math.max(0, messages.length - 1) * PROGRESS_SHARE_SEND_INTERVAL) * 1000) + PROGRESS_SHARE_START_GRACE_MS;
    State.progressShare = {
      key: shareKey,
      code: code,
      id: id,
      checksum: checksum,
      chunkCount: chunks.length,
      sent: true,
      messageCount: messages.length,
      submittedCount: 0,
      readyAt: readyAt,
    };
    for (let i = 0; i < messages.length; i += 1) {
      $.Schedule(0.2 + i * PROGRESS_SHARE_SEND_INTERVAL, () => sendBackgroundChatMessage(messages[i]));
    }
    $.Schedule(Math.max(0.1, (readyAt - Date.now()) / 1000), () => RenderScheduler.defer("progress-share-ready"));
    setStatus("Sharing progress " + id + " to party. Players will import it from chat.");
    log("sharing progress " + id + " chunks=" + chunks.length + (reason ? " reason=" + reason : ""));
    return true;
  }

  function shareImportedProgressFromHostedLeader(reason) {
    const resume = ensureResume();
    const state = getViewModelState();
    if (!resume.code || !resume.id || !resume.payload || !isHostedImportedResumeState(state)) return false;
    if (!state.party || state.party.mode !== "leader" || !ViewModel.build(state).gates.hostedResume.enabled) return false;
    return shareProgressCode(resume.code, resume.id, reason, "import:" + resume.id + ":" + checksumFromProgressCode(resume.code));
  }

  function sendReadyChat() {
    sendChatMessage(TEST_READY_MESSAGE);
  }

  function sendPartyLeaderCommand() {
    const decision = ViewModel.build().controls.partyHost;
    if (!decision.enabled) {
      if (State.game && State.game.active) setStatus("Finish the current hand before changing party leader.");
      else if (ensureParty().mode === "leader") setStatus("Already hosting this party.");
      else if (ensureParty().mode === "member") setStatus("Leave the current party before hosting.");
      else setStatus(decision.reason || "Host party is not available right now.");
      RenderScheduler.immediate("party-leader-invalid");
      return;
    }
    const remembered = getRememberedLocalPlayerName();
    const bypassHostThrottle = State.lastLobbyLeaveMs && Date.now() - State.lastLobbyLeaveMs < 1200;
    const resumeHost = !!State.progressShareRequested;
    const partyId = makePartyId(remembered || "leader");
    const sent = sendChatMessage(PARTY_LEADER_PREFIX + " poker party " + partyId, false, !!bypassHostThrottle);
    if (!sent) return;
    State.lastLobbyLeaveMs = 0;
    if (!resumeHost) {
      State.game = null;
      State.bankrolls = {};
    }
    clearResumeState("host party");
    State.resumeRequiresHostedParty = false;
    State.progressShareRequested = false;
    State.progressSharePartyId = resumeHost ? partyId : "";
    const leaderResult = PartyReducer.apply({
      type: "leader",
      partyId: partyId,
      record: { sender: remembered || "<unknown>", isSelf: true },
    });
    if (!applyPartyResultEffects(leaderResult)) return;
    RenderScheduler.immediate("party-leader");
    setStatus("Sent [party leader]. Wait for joiners, then start the synced hand.");
  }

  function sendPartyJoinCommand() {
    requestFreshState("join");
    const party = ensureParty();
    const activeGame = !!(State.game && State.game.active);
    const localSeated = !!findGamePlayerByKey(State.localPlayerKey);
    const decision = ViewModel.build().controls.partyJoin;
    if (!decision.enabled) {
      if (!party.id) setStatus("Looking for a [party leader] message. Click JOIN PARTY again if the host just pressed HOST PARTY.", STATUS_PRIORITY.gate);
      else if (activeGame && localSeated) setStatus("You are already seated in this hand.");
      else if (party.mode === "member") setStatus("Already joined this party.");
      else setStatus(decision.reason || "Join party is not available right now.");
      RenderScheduler.immediate("party-join-invalid");
      return;
    }
    clearResumeState("join party");
    State.requiresProgressImport = false;
    State.resumeRequiresHostedParty = false;
    const joinResult = PartyReducer.apply({
      type: "join",
      partyId: party.id,
      record: { sender: getRememberedLocalPlayerName() || State.localPlayerKey || "<unknown>", isSelf: true },
    });
    if (!applyPartyResultEffects(joinResult)) return;
    RenderScheduler.immediate("party-join");
    sendChatMessage(PARTY_JOIN_PREFIX + " poker party " + party.id);
    if (joinResult.status || activeGame) setStatus(joinResult.status || "Joined waitlist. You will be seated after this hand.");
  }

  function copyToClipboard(value, panel) {
    let copied = false;
    try {
      $.DispatchEvent("CopyStringToClipboard", value);
      copied = true;
    } catch (e) {}
    try {
      $.DispatchEvent("CopyStringToClipboard", value, panel);
      copied = true;
    } catch (e) {}
    try {
      $.DispatchEventAsync(0, "CopyStringToClipboard", value);
      copied = true;
    } catch (e) {}
    return copied;
  }

  function copyProgressCode() {
    const decision = ViewModel.build().controls.exportProgress;
    if (!decision.enabled && State.game && State.game.active) {
      setStatus("Finish the current hand before copying progress.");
      RenderScheduler.immediate("copy-progress-invalid");
      return { ok: false, status: "Finish the current hand before copying progress." };
    }
    const result = ProgressResume.build(State.game);
    if (!result.ok) {
      setStatus(result.status || "Finish the current hand before copying progress.");
      RenderScheduler.immediate("copy-progress-invalid");
      return result;
    }
    setText(State.progressCodeLabel, result.code);
    const copied = copyToClipboard(result.code, State.panel || null);
    setStatus(copied ? "Copied progress " + result.id + ". Save this code outside the game." : "Progress " + result.id + " ready. Copy the displayed code.");
    RenderScheduler.immediate("copy-progress");
    return result;
  }

  function importProgressCodeFromInput() {
    const decision = ViewModel.build().controls.importProgress;
    if (!decision.enabled && State.game && State.game.active) {
      setStatus("Finish the current hand before importing progress.");
      RenderScheduler.immediate("import-progress-invalid");
      return { ok: false, status: "Finish the current hand before importing progress." };
    }
    const text = String(State.progressCodeInput && State.progressCodeInput.text ? State.progressCodeInput.text : "").replace(/^\s+|\s+$/g, "");
    if (!text) {
      setStatus("Paste a progress code first.");
      return { ok: false, status: "Paste a progress code first." };
    }
    const result = ProgressResume.importCode(text, "manual");
    if (result.ok) {
      State.requiresProgressImport = false;
      State.progressShareRequested = true;
      const hostedParty = ensureParty();
      if (hostedParty.mode === "leader" && hostedParty.id) State.progressSharePartyId = hostedParty.id;
      ProgressResume.shareImported("manual-import");
    }
    if (!result.ok) setStatus(result.status || "Invalid progress code.");
    RenderScheduler.immediate(result.ok ? "import-progress" : "import-progress-invalid");
    return result;
  }

  function getKnownLocalResumePlayer(payload) {
    const remembered = getRememberedLocalPlayerName();
    if (remembered) rememberLocalPlayer(remembered);
    const key = State.localPlayerKey;
    if (!key || !payload || !findProgressRosterEntry(payload, key) || getProgressBankroll(payload, key) <= 0) return null;
    const entry = findProgressRosterEntry(payload, key);
    return { key: key, name: remembered || entry.name };
  }

  function sendResumeLeaderCommand() {
    const resume = ensureResume();
    const decision = ViewModel.build().controls.resumeLeader;
    if (!decision.enabled) {
      if (!resume.payload) setStatus("Import progress before choosing a resume leader.");
      else if (State.game && State.game.active) setStatus("Finish the current hand before choosing a resume leader.");
      else if (!getKnownLocalResumePlayer(resume.payload)) setStatus(State.localPlayerKey ? "Only saved players with chips can lead this resume." : "Type ready or reopen party chat so Deadlock exposes your sender name.");
      else if (State.localPlayerKey === resume.leaderKey) setStatus("You are already the resume leader.");
      else setStatus(decision.reason || "Choose resume leader is not available right now.");
      RenderScheduler.immediate("resume-leader-invalid");
      return;
    }
    sendChatMessage(buildResumeLeaderCommand(resume.id));
  }

  function sendResumeReadyCommand() {
    const resume = ensureResume();
    const decision = ViewModel.build().controls.resumeReady;
    if (!decision.enabled) {
      if (!resume.payload) setStatus("Import progress before readying resume.");
      else if (State.game && State.game.active) setStatus("Finish the current hand before readying resume.");
      else if (!resume.leaderKey) setStatus("Wait for the resume leader first.");
      else if (!getKnownLocalResumePlayer(resume.payload)) setStatus(State.localPlayerKey ? "Only saved players with chips can ready this resume." : "Type ready or reopen party chat so Deadlock exposes your sender name.");
      else if (State.localPlayerKey === resume.leaderKey) setStatus("The resume leader is already counted ready.");
      else if (resume.ready && resume.ready[State.localPlayerKey]) setStatus("Already ready for this resume.");
      else setStatus(decision.reason || "Ready resume is not available right now.");
      RenderScheduler.immediate("resume-ready-invalid");
      return;
    }
    sendChatMessage(buildResumeReadyCommand(resume.id));
  }

  function selectHostedResumeLeader(resume) {
    const party = ensureParty();
    if (!resume || !resume.payload || party.mode !== "leader" || !party.leaderKey) return false;
    if (!findProgressRosterEntry(resume.payload, party.leaderKey) || getProgressBankroll(resume.payload, party.leaderKey) <= 0) return false;
    resume.leaderKey = party.leaderKey;
    resume.leaderName = party.leaderName || (findProgressRosterEntry(resume.payload, party.leaderKey) || {}).name || party.leaderKey;
    resume.ready = {};
    resume.ready[party.leaderKey] = { key: party.leaderKey, name: resume.leaderName };
    resume.order = [party.leaderKey];
    saveResumeState();
    return true;
  }

  function sendResumeStartCommand() {
    const resume = ensureResume();
    let viewModel = ViewModel.build();
    if (viewModel.gates.hostedResume.enabled) {
      selectHostedResumeLeader(resume);
      viewModel = ViewModel.build();
    }
    const gate = viewModel.gates.resume;
    if (!gate.enabled) {
      setStatus(gate.reason || gate.label || "Select and sync a resume leader before resuming.");
      RenderScheduler.immediate("resume-start-invalid");
      return;
    }
    const seed = "s" + Date.now().toString(36);
    sendChatMessage(buildResumeStartCommand(resume.id, resume.leaderKey, resume.payload.nextHandNumber, seed));
  }

  function applyResumeStartCommand(command) {
    if (!command) return ignoredCommandEffect("invalid", "Invalid resume command.");
    let resolvedRecord = command.record
      ? resolveSelfRecord(command.record)
      : resolveSelfRecord({ sender: command.leaderKey || "", message: "poker resume " + (command.id || "") + " hand " + (command.handNumber || "") + " leader " + (command.leaderKey || "") + " seed " + (command.seed || "") });
    const parsed = command;
    if (!resolvedRecord || parsed.type !== "resume-start" || !parsed.valid) return rejectedCommandEffect("Invalid resume command.", "status");
    const id = parsed.id || command.id;
    const handNumber = parsed.handNumber || command.handNumber;
    const parsedLeaderKey = normalizePlayerKey(parsed.leaderKey || command.leaderKey);
    const rosterText = parsed.rosterText || "";
    const seed = parsed.seed || command.seed;
    const resume = ensureResume();
    if (!resume.payload || resume.id !== id) {
      rememberPendingResumeStartCommand({ record: resolvedRecord }, id);
      return rejectedCommandEffect("Import matching progress before resuming.", "status");
    }
    resolvedRecord = resolveUnknownHostedResumeStartRecord(resolvedRecord, id, parsedLeaderKey);
    if (!resolvedRecord || isUnknownSender(resolvedRecord.sender)) {
      debugActionState("reject-unknown-resume-start", resolvedRecord, null);
      return rejectedCommandEffect("", "debug");
    }
    const hostedSharedLeaderKey = getHostedSharedProgressLeaderKey(resume);
    if (hostedSharedLeaderKey && parsedLeaderKey !== hostedSharedLeaderKey) {
      debugActionState("reject-hosted-resume-leader-mismatch commandLeader=" + parsedLeaderKey + " hostedLeader=" + hostedSharedLeaderKey, resolvedRecord, null);
      return rejectedCommandEffect("Only " + (resume.hostedLeaderName || resume.leaderName || "<leader>") + " can start this resume.", "status");
    }
    if (State.resumeRequiresHostedParty && !hostedSharedLeaderKey) {
      return rejectedCommandEffect("Host or join the synced party before resuming.", "status");
    }
    if (!resume.leaderKey) {
      const leaderEntry = findProgressRosterEntry(resume.payload, parsedLeaderKey);
      if (!leaderEntry || getProgressBankroll(resume.payload, parsedLeaderKey) <= 0) {
        return rejectedCommandEffect("Select and sync a resume leader before resuming.", "status");
      }
      resume.leaderKey = parsedLeaderKey;
      resume.leaderName = leaderEntry.name || parsedLeaderKey;
      resume.ready = {};
      resume.ready[parsedLeaderKey] = { key: parsedLeaderKey, name: resume.leaderName };
      resume.order = [parsedLeaderKey];
      saveResumeState();
    }
    if (!handNumber || parsedLeaderKey !== resume.leaderKey) {
      debugActionState("reject-resume-leader-mismatch commandLeader=" + parsedLeaderKey + " selectedLeader=" + resume.leaderKey, resolvedRecord, null);
      return rejectedCommandEffect("", "debug");
    }
    const starterKey = normalizePlayerKey(resolvedRecord.sender);
    if (starterKey !== resume.leaderKey) {
      debugActionState("reject-non-leader-resume sender=" + resolvedRecord.sender + " leader=" + (resume.leaderName || resume.leaderKey), resolvedRecord, null);
      return rejectedCommandEffect("Only " + (resume.leaderName || "<leader>") + " can start this resume.", "status");
    }
    if (parsed.hasRosterMarker && !rosterText) return rejectedCommandEffect("Invalid synced poker roster.", "status");
    if (rosterText) {
      const decodedRoster = decodeRoster(rosterText);
      if (decodedRoster.length < MIN_READY_PLAYERS || canonicalProgressPayload({ version: 1, kind: "poker-progress", lastHandNumber: resume.payload.lastHandNumber, nextHandNumber: resume.payload.nextHandNumber, dealerKey: resume.payload.dealerKey, roster: decodedRoster, bankrolls: resume.payload.bankrolls, savedAt: resume.payload.savedAt }) !== canonicalProgressPayload(resume.payload)) {
        return rejectedCommandEffect("Invalid synced poker roster.", "status");
      }
    }
    const dealerKeyOverride = resolveResumeNextDealerKey(resume.payload);
    if (!dealerKeyOverride) return rejectedCommandEffect("Cannot resume; saved dealer state is invalid.", "status");
    const progressValidation = validateProgressPayload(resume.payload);
    if (!progressValidation.ok) return rejectedCommandEffect("Cannot resume; saved dealer state is invalid.", "status");
    const source = progressValidation.payload;
    const priorParty = ensureParty();
    const priorPartyId = priorParty && priorParty.id ? priorParty.id : "";
    const priorPartyMatchesLeader = !!(priorPartyId && priorParty.leaderKey && priorParty.leaderKey === parsedLeaderKey);
    const party = defaultPartyState();
    party.id = priorPartyMatchesLeader ? priorPartyId : (State.resume ? State.resume.id : "");
    party.mode = parsedLeaderKey === State.localPlayerKey ? "leader" : "member";
    party.leaderKey = parsedLeaderKey;
    const leaderEntry = findProgressRosterEntry(source, parsedLeaderKey);
    party.leaderName = State.resume && State.resume.leaderName ? State.resume.leaderName : (leaderEntry ? leaderEntry.name : "");
    for (let i = 0; i < source.roster.length; i += 1) {
      const entry = source.roster[i];
      party.members[entry.key] = { key: entry.key, name: entry.name };
      party.order.push(entry.key);
    }
    State.party = party;
    savePartyState();
    const created = PokerEngine.create({
      seed: seed,
      roster: source.roster,
      handNumber: handNumber,
      dealerKey: dealerKeyOverride,
      previousGame: null,
      progressPayload: source,
    });
    if (created.ok && created.game) {
      State.bankrolls = created.bankrolls;
      State.game = created.game;
      State.game.importedResume = true;
      State.resume = defaultResumeState();
      saveResumeState();
      savePartyState();
      log("game resumed seed " + seed);
      return changedCommandEffect("Poker resumed. " + getCurrentPlayer().name + " acts first.", "resume-start");
    }
    return rejectedCommandEffect(created.status || "Cannot resume; saved dealer state is invalid.", "status");
  }

  const ProgressResume = {
    build: buildProgressSaveCode,
    importCode: importProgressSaveCode,
    applyCommand(command) {
      if (!command || !command.type) return ignoredCommandEffect("progress-resume");
      const resolvedRecord = command.record ? command.record : resolveSelfRecord(command);
      if (!resolvedRecord || !resolvedRecord.message) {
        return command.type === "resume-start" ? applyResumeStartCommand(command) : ignoredCommandEffect("progress-resume");
      }
      if (command.type === "progress-offer" || command.type === "progress-chunk") {
        return applyProgressShareMessage({
          type: command.type === "progress-offer" ? "offer" : "chunk",
          id: command.id,
          checksum: command.checksum,
          count: command.count,
          index: command.index || 0,
          chunk: command.chunk || "",
          record: resolvedRecord,
        });
      }
      if (command.type === "resume-leader" || command.type === "resume-ready") return applyResumeAuthorityCommand(command, resolvedRecord);
      if (command.type === "resume-start") return applyResumeStartCommand(Object.assign({}, command, { record: resolvedRecord }));
      return ignoredCommandEffect("progress-resume");
    },
    shareImported: shareImportedProgressFromHostedLeader,
  };

  function hashString(text) {
    let hash = 2166136261;
    const input = String(text || "seed");
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0;
  }
  function seededRandom(seed) {
    let value = seed >>> 0;
    return function rand() {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildDeck(seedText) {
    const deck = [];
    for (let s = 0; s < SUITS.length; s += 1) {
      for (let r = 0; r < RANKS.length; r += 1) deck.push({ rank: RANKS[r], suit: SUITS[s], value: RANK_VALUE[RANKS[r]] });
    }
    const rand = seededRandom(hashString(seedText));
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const temp = deck[i];
      deck[i] = deck[j];
      deck[j] = temp;
    }
    return deck;
  }

  function drawCard(game) {
    return game.deck.shift();
  }

  function remainingPlayersWithChips() {
    const keys = Object.keys(State.bankrolls);
    let count = 0;
    for (let i = 0; i < keys.length; i += 1) if (State.bankrolls[keys[i]] > 0) count += 1;
    return count;
  }

  function getCurrentPlayer() {
    if (!State.game || !State.game.players.length) return null;
    return State.game.players[State.game.currentIndex] || null;
  }

  function addGameLog(text) {
    if (!State.game) return;
    State.game.log.push(text);
    while (State.game.log.length > MAX_GAME_LOG_ENTRIES) State.game.log.shift();
  }

  function getLocalPlayer() {
    if (!State.game) return null;
    const localKey = normalizePlayerKey(getConfig()[LOCAL_PLAYER_KEY]) || State.localPlayerKey;
    if (!localKey) return null;
    for (let i = 0; i < State.game.players.length; i += 1) {
      if (State.game.players[i].key === localKey) return State.game.players[i];
    }
    return null;
  }

  function getCallAmount(player, gameOverride) {
    const game = gameOverride || State.game;
    if (!game || !player) return 0;
    return Math.max(0, (game.currentBet || 0) - (player.bet || 0));
  }

  function getBlindLevelForHand(handNumber) {
    const level = Math.floor(Number(handNumber) || 1);
    return level > 0 ? level : 1;
  }

  function getSmallBlindForHand(handNumber) {
    return getBlindLevelForHand(handNumber) * SMALL_BLIND;
  }

  function getBigBlindForHand(handNumber) {
    return getBlindLevelForHand(handNumber) * BIG_BLIND;
  }

  function getCurrentBigBlind(game) {
    return game && game.bigBlindAmount ? game.bigBlindAmount : BIG_BLIND;
  }

  function getMinimumRaiseTo(game) {
    return (game ? game.currentBet || 0 : 0) + (game ? game.minRaise || getCurrentBigBlind(game) : BIG_BLIND);
  }

  function setGameAnnouncement(game, title, detail) {
    if (!game) return;
    game.announcement = {
      title: title || "",
      detail: detail || "",
    };
  }

  function announce(title, detail) {
    if (!State.game) return;
    setGameAnnouncement(State.game, title, detail);
  }

  function describeActionState(reason, record, player) {
    const game = State.game;
    const current = getCurrentPlayer();
    const sender = record && record.sender ? record.sender : "<unknown>";
    const senderKey = normalizePlayerKey(sender);
    const toCall = getCallAmount(player);
    const debugAction = record && record.message ? PokerEngine.decodeAction(record.message) : null;
    const debugAmount = debugAction ? debugAction.amount : 0;
    return reason +
      " sender=" + sender +
      " senderKey=" + senderKey +
      " localKey=" + (State.localPlayerKey || "<unset>") +
      " current=" + (current ? current.name : "<none>") +
      " currentKey=" + (current ? current.key : "<none>") +
      " phase=" + (game ? game.phase : "<none>") +
      " pot=" + (game ? game.pot : 0) +
      " command=" + (record && record.message ? normalizeText(record.message) : "<none>") +
      " amount=" + debugAmount +
      " toCall=" + toCall +
      " minRaise=" + (game ? game.minRaise || getCurrentBigBlind(game) : BIG_BLIND) +
      " currentBet=" + (game ? game.currentBet : 0) +
      " playerBet=" + (player ? player.bet : "<none>") +
      " playerStack=" + (player ? player.stack : "<none>") +
      " playerCommitted=" + (player ? player.committed : "<none>") +
      " seq=" + (record && record.seq ? record.seq : "<none>");
  }

  function debugActionState(reason, record, player) {
    const detail = describeActionState(reason, record, player);
    log("action debug " + detail);
    setStatus("DEBUG " + detail);
    if (State.game) {
      addGameLog("DEBUG " + reason + ": " + (PokerEngine.actions(State.game, getCurrentPlayer() && getCurrentPlayer().key, State.localPlayerKey).statusText || detail));
      renderLog(ViewModel.build());
    }
  }

  function compareNumberArrays(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  }

  function uniqueSorted(values) {
    const out = [];
    const seen = {};
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (!seen[value]) {
        seen[value] = true;
        out.push(value);
      }
    }
    out.sort((a, b) => b - a);
    return out;
  }

  function findStraightHigh(values) {
    const unique = uniqueSorted(values);
    if (unique.indexOf(14) !== -1) unique.push(1);
    let run = 1;
    for (let i = 1; i < unique.length; i += 1) {
      if (unique[i - 1] - unique[i] === 1) {
        run += 1;
        if (run >= 5) return unique[i - 4];
      } else if (unique[i - 1] !== unique[i]) {
        run = 1;
      }
    }
    return 0;
  }

  function evaluateHand(cards) {
    const values = [];
    const counts = {};
    const suits = {};
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      values.push(card.value);
      counts[card.value] = (counts[card.value] || 0) + 1;
      suits[card.suit] = suits[card.suit] || [];
      suits[card.suit].push(card.value);
    }
    values.sort((a, b) => b - a);
    let flushValues = null;
    const suitKeys = Object.keys(suits);
    for (let i = 0; i < suitKeys.length; i += 1) {
      const suited = suits[suitKeys[i]];
      if (suited.length >= 5) {
        suited.sort((a, b) => b - a);
        flushValues = suited;
        break;
      }
    }
    if (flushValues) {
      const sf = findStraightHigh(flushValues);
      if (sf) return { category: 8, kickers: [sf], name: sf === 14 ? "Royal flush" : "Straight flush" };
    }
    const byCount = Object.keys(counts).map((value) => ({ value: parseInt(value, 10), count: counts[value] })).sort((a, b) => b.count - a.count || b.value - a.value);
    if (byCount[0] && byCount[0].count === 4) {
      const quad = byCount[0].value;
      const kicker = values.filter((value) => value !== quad)[0] || 0;
      return { category: 7, kickers: [quad, kicker], name: "Four of a kind" };
    }
    const trips = byCount.filter((item) => item.count >= 3).map((item) => item.value);
    const pairs = byCount.filter((item) => item.count >= 2).map((item) => item.value);
    if (trips.length && (pairs.length > 1 || pairs[0] !== trips[0])) {
      const trip = trips[0];
      let pair = 0;
      for (let i = 0; i < pairs.length; i += 1) if (pairs[i] !== trip) { pair = pairs[i]; break; }
      if (!pair && trips.length > 1) pair = trips[1];
      return { category: 6, kickers: [trip, pair], name: "Full house" };
    }
    if (flushValues) return { category: 5, kickers: flushValues.slice(0, 5), name: "Flush" };
    const straight = findStraightHigh(values);
    if (straight) return { category: 4, kickers: [straight], name: "Straight" };
    if (trips.length) {
      const trip = trips[0];
      const kickers = values.filter((value) => value !== trip).slice(0, 2);
      return { category: 3, kickers: [trip].concat(kickers), name: "Three of a kind" };
    }
    if (pairs.length >= 2) {
      const first = pairs[0];
      const second = pairs[1];
      const kicker = values.filter((value) => value !== first && value !== second)[0] || 0;
      return { category: 2, kickers: [first, second, kicker], name: "Two pair" };
    }
    if (pairs.length === 1) {
      const pairValue = pairs[0];
      const kickers = values.filter((value) => value !== pairValue).slice(0, 3);
      return { category: 1, kickers: [pairValue].concat(kickers), name: "Pair" };
    }
    return { category: 0, kickers: values.slice(0, 5), name: "High card" };
  }

  function compareHands(a, b) {
    if (a.category !== b.category) return a.category - b.category;
    return compareNumberArrays(a.kickers, b.kickers);
  }

  function resolveResumeNextDealerKey(payload) {
    const roster = payload && payload.roster ? payload.roster : [];
    const dealerKey = normalizePlayerKey(payload && payload.dealerKey);
    if (!roster.length || !dealerKey) return "";
    let dealerIndex = -1;
    for (let i = 0; i < roster.length; i += 1) {
      if (normalizePlayerKey(roster[i].key) === dealerKey) {
        dealerIndex = i;
        break;
      }
    }
    if (dealerIndex < 0) return "";
    for (let offset = 1; offset <= roster.length; offset += 1) {
      const index = (dealerIndex + offset) % roster.length;
      const key = normalizePlayerKey(roster[index].key);
      if (getProgressBankroll(payload, key) > 0) return key;
    }
    return "";
  }

  function makeGamePlayer(key, name, stack) {
    return { key: key, name: name, stack: stack, bet: 0, committed: 0, cards: [], folded: false, acted: false, result: null };
  }

  function addGameLogTo(game, text) {
    game.log.push(text);
    while (game.log.length > MAX_GAME_LOG_ENTRIES) game.log.shift();
  }

  function sendStartCommand() {
    if (getActiveTableGameType() === "bluff-deck") {
      setStatus("Finish the active Bluff Deck match before starting Poker.");
      RenderScheduler.immediate("start-bluff-active");
      return;
    }
    const viewModel = ViewModel.build(getViewModelState(State.readyCountValue || getReadySeatArray().length));
    const gate = viewModel.gates.start;
    if (State.resume && State.resume.payload) {
      sendResumeStartCommand();
      return;
    }
    if (!gate.enabled) {
      setStatus(gate.reason || gate.label || "Only the [party leader] can start the synced hand.");
      RenderScheduler.immediate("start-invalid");
      return;
    }
    const party = ensureParty();
    const roster = PartyReducer.roster();
    const seed = "s" + Date.now().toString(36);
    sendChatMessage(buildSynchronizedStartCommand(seed, roster, getNextHandNumber()));
  }

  function endMatch() {
    const bluffGame = State.bluffDeck && State.bluffDeck.game;
    if (bluffGame && bluffGame.active) {
      sendBluffDeckEnd();
      return;
    }
    if (!State.game) {
      setStatus("No poker match is active.");
      RenderScheduler.immediate("end-match-invalid");
      return;
    }
    const party = ensureParty();
    if (party.id && party.mode !== "leader") return;
    const endedGame = State.game;
    if (party.id && party.mode === "leader") sendChatMessage(buildMatchEndCommand(endedGame, party.id), true, true);
    State.terminalTableGame = "poker";
    PartyReducer.reset(LOBBY_RESET_CASES.endMatch, "end match");
    setStatus("Match ended. Host a party or wait for players to join before showing the table again.");
    RenderScheduler.immediate("end-match");
  }

  function leaveLobby() {
    const party = ensureParty();
    const partyId = party.id || "";
    const activeGame = State.game;
    const bluffGame = State.bluffDeck && State.bluffDeck.game;
    const localKey = localBluffKey();
    const bluffSeat = bluffGame && bluffGame.active && bluffGame.players
      ? bluffGame.players.find((player) => player.key === localKey && player.status === "active")
      : null;
    if (partyId && bluffSeat) {
      const scoped = buildScopedBluffPartyLeave(partyId, bluffGame);
      if (scoped) {
        sendChatMessage(scoped, true, true);
        State.lastLobbyLeaveMs = Date.now();
        setStatus("Leaving Bluff Deck match...");
        RenderScheduler.immediate("leave-bluff");
        return;
      }
    }
    if (partyId && party.mode === "leader" && activeGame) {
      sendChatMessage(buildMatchEndCommand(activeGame, partyId), true, true);
    }
    if (partyId) {
      sendChatMessage(PARTY_LEAVE_PREFIX + " poker party " + partyId, true, true);
      State.lastLobbyLeaveMs = Date.now();
    }
    PartyReducer.reset(LOBBY_RESET_CASES.leaveLobby, "leave lobby");
    State.terminalTableGame = "";
    State.pendingTableSwitch = "";
    clearReadySeats("leave");
    savePartyState();
    RenderScheduler.immediate("leave-lobby");
    setStatus("Left poker lobby. Sent leave notice; host or join a party to start a new lobby.");
  }
  function commitChips(game, player, amount) {
    if (!game || !player) return 0;
    const chips = Math.max(0, Math.min(amount, player.stack));
    player.stack -= chips;
    player.bet += chips;
    player.committed += chips;
    game.pot += chips;
    return chips;
  }

  function nextActorIndexFrom(game, fromIndex) {
    if (!game || !game.players.length) return 0;
    for (let offset = 1; offset <= game.players.length; offset += 1) {
      const index = (fromIndex + offset) % game.players.length;
      const player = game.players[index];
      if (!player.folded && player.stack > 0) return index;
    }
    return fromIndex;
  }

  function activeContestants() {
    const out = [];
    if (!State.game) return out;
    for (let i = 0; i < State.game.players.length; i += 1) {
      const player = State.game.players[i];
      if (!player.folded) out.push(player);
    }
    return out;
  }

  function hasBettingRoundSettled() {
    const game = State.game;
    if (!game) return false;
    for (let i = 0; i < game.players.length; i += 1) {
      const player = game.players[i];
      if (player.folded || player.stack === 0) continue;
      if (!player.acted) return false;
      if (player.bet !== game.currentBet) return false;
    }
    return true;
  }

  function resetRoundBets() {
    const game = State.game;
    for (let i = 0; i < game.players.length; i += 1) {
      game.players[i].bet = 0;
      game.players[i].acted = false;
    }
    const bigBlindAmount = getCurrentBigBlind(game);
    game.currentBet = 0;
    game.minRaise = bigBlindAmount;
    game.lastRaise = bigBlindAmount;
    game.lastAggressorIndex = -1;
  }

  function dealNextStreet(suppressRender) {
    const game = State.game;
    if (game.phase === "preflop") {
      game.community.push(drawCard(game), drawCard(game), drawCard(game));
      game.phase = "flop";
      addGameLog("Flop dealt.");
    } else if (game.phase === "flop") {
      game.community.push(drawCard(game));
      game.phase = "turn";
      addGameLog("Turn dealt.");
    } else if (game.phase === "turn") {
      game.community.push(drawCard(game));
      game.phase = "river";
      addGameLog("River dealt.");
    } else {
      showdown(suppressRender);
      return false;
    }
    return true;
  }

  function dealRemainingCommunity(suppressRender) {
    const game = State.game;
    while (game && game.active && game.phase !== "river" && game.phase !== "finished") {
      if (!dealNextStreet(suppressRender)) return;
    }
  }

  function onlyOnePlayerCanAct() {
    const contestants = activeContestants();
    let withChips = 0;
    for (let i = 0; i < contestants.length; i += 1) if (contestants[i].stack > 0) withChips += 1;
    return contestants.length > 1 && withChips <= 1;
  }

  function advancePhase(suppressRender) {
    const game = State.game;
    if (!game || !game.active) return;
    if (activeContestants().length <= 1) {
      awardFoldWin(suppressRender);
      return;
    }
    if (onlyOnePlayerCanAct()) {
      dealRemainingCommunity(suppressRender);
      showdown(suppressRender);
      return;
    }
    resetRoundBets();
    if (!dealNextStreet(suppressRender)) return;
    game.currentIndex = firstActiveAfter(game.dealerIndex);
    game.streetOpenerIndex = game.currentIndex;
    announce(String(game.phase || "street").charAt(0).toUpperCase() + String(game.phase || "street").slice(1) + " dealt", PokerEngine.actions(game, game.players[game.currentIndex].key, "").prompt);
    if (!suppressRender) RenderScheduler.defer("game-advance");
  }

  function firstActiveAfter(index) {
    const game = State.game;
    if (!game || !game.players.length) return 0;
    for (let offset = 1; offset <= game.players.length; offset += 1) {
      const candidate = (index + offset) % game.players.length;
      const player = game.players[candidate];
      if (!player.folded && player.stack > 0) return candidate;
    }
    return index || 0;
  }

  function markPotWinners(winners) {
    const game = State.game;
    if (!game) return;
    const keys = {};
    for (let i = 0; i < (winners || []).length; i += 1) {
      const key = normalizePlayerKey(winners[i] && (winners[i].key || winners[i].name));
      if (key) keys[key] = true;
    }
    game.potWinnerKeys = keys;
  }

  function awardFoldWin(suppressRender) {
    const game = State.game;
    const alive = activeContestants();
    if (!alive.length) return;
    const winner = alive[0];
    const amount = game.pot;
    winner.stack += amount;
    game.pot = 0;
    State.bankrolls[winner.key] = winner.stack;
    markPotWinners([winner]);
    addGameLog(winner.name + " wins $" + amount + " by fold.");
    announce(winner.name + " wins by fold", "Pot $" + amount + " awarded.");
    finishHand(winner.name + " wins by fold.", suppressRender);
  }

  function buildPots(players) {
    const levels = [];
    const seen = {};
    for (let i = 0; i < players.length; i += 1) {
      const committed = Math.max(0, players[i].committed || 0);
      if (committed > 0 && !seen[committed]) {
        seen[committed] = true;
        levels.push(committed);
      }
    }
    levels.sort((a, b) => a - b);

    const pots = [];
    let previous = 0;
    for (let i = 0; i < levels.length; i += 1) {
      const level = levels[i];
      let count = 0;
      const eligible = [];
      for (let p = 0; p < players.length; p += 1) {
        if ((players[p].committed || 0) >= level) {
          count += 1;
          if (!players[p].folded) eligible.push(players[p]);
        }
      }
      const amount = (level - previous) * count;
      if (amount > 0 && eligible.length) pots.push({ amount: amount, eligible: eligible });
      previous = level;
    }
    return pots;
  }

  function sortedWinnersFromDealerLeft(winners) {
    const game = State.game;
    if (!game || !game.players.length) return winners;
    const out = [];
    for (let offset = 1; offset <= game.players.length; offset += 1) {
      const index = (game.dealerIndex + offset) % game.players.length;
      const player = game.players[index];
      for (let w = 0; w < winners.length; w += 1) {
        if (winners[w].key === player.key) out.push(winners[w]);
      }
    }
    return out.length ? out : winners;
  }

  function showdown(suppressRender) {
    const game = State.game;
    if (!game) return;
    const pots = buildPots(game.players);
    game.pots = pots;
    let firstSummary = "";
    const allWinners = [];

    for (let p = 0; p < pots.length; p += 1) {
      const pot = pots[p];
      let bestHand = null;
      let winners = [];
      for (let i = 0; i < pot.eligible.length; i += 1) {
        const player = pot.eligible[i];
        const hand = evaluateHand(player.cards.concat(game.community));
        player.result = hand.name;
        const cmp = bestHand ? compareHands(hand, bestHand) : 1;
        if (cmp > 0) {
          bestHand = hand;
          winners = [player];
        } else if (cmp === 0) {
          winners.push(player);
        }
      }
      if (!bestHand || !winners.length) continue;
      const orderedWinners = sortedWinnersFromDealerLeft(winners);
      const share = Math.floor(pot.amount / orderedWinners.length);
      let remainder = pot.amount - share * orderedWinners.length;
      for (let w = 0; w < orderedWinners.length; w += 1) {
        orderedWinners[w].stack += share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
      }
      for (let o = 0; o < orderedWinners.length; o += 1) allWinners.push(orderedWinners[o]);
      const names = orderedWinners.map((winner) => winner.name).join(", ");
      const line = "Pot $" + pot.amount + ": " + names + " win with " + bestHand.name + ".";
      addGameLog(line);
      if (!firstSummary) firstSummary = line;
    }

    markPotWinners(allWinners);
    game.pot = 0;
    for (let i = 0; i < game.players.length; i += 1) State.bankrolls[game.players[i].key] = game.players[i].stack;
    announce(firstSummary || "Showdown complete", "Winners paid. Start the next hand when ready.");
    finishHand(firstSummary || "Showdown complete.", suppressRender);
  }

  function finishHand(status, suppressRender) {
    const game = State.game;
    game.active = false;
    game.finished = true;
    game.phase = "finished";
    for (let i = 0; i < game.players.length; i += 1) {
      const player = game.players[i];
      if (isDepartedPlayer(player)) {
        delete State.bankrolls[player.key];
        continue;
      }
      State.bankrolls[player.key] = player.stack;
      if (player.stack <= 0) addGameLog(player.name + " is out.");
    }
    const lateJoinResult = applyLateJoinBuyIns(null, "finish");
    clearLocalActionEcho();
    const lateJoinStatus = formatLateJoinApplied(lateJoinResult);
    const finalStatus = lateJoinStatus ? status + " " + lateJoinStatus : status;
    if (suppressRender) State.reducerActionStatus = finalStatus;
    else {
      setStatus(finalStatus);
      RenderScheduler.defer("game-advance");
    }
  }

  function rejectAction(prefix, command, amount, record, player) {
    const game = State.game;
    const suggestion = prefix === "reject-illegal-bet" && game && game.currentBet > 0 ? " use=raise $" + Math.max(amount || 0, getMinimumRaiseTo(game)) : "";
    debugActionState(prefix + " command=" + command + " amount=" + amount + suggestion + " toCall=" + getCallAmount(player) + " minRaise=" + (game ? game.minRaise || getCurrentBigBlind(game) : BIG_BLIND) + " currentBet=" + (game ? game.currentBet : 0) + " playerBet=" + (player ? player.bet : "<none>") + " playerStack=" + (player ? player.stack : "<none>") + " playerCommitted=" + (player ? player.committed : "<none>"), record, player);
  }

  function resetOtherActorsForAggression(player) {
    const game = State.game;
    for (let i = 0; i < game.players.length; i += 1) {
      const other = game.players[i];
      if (!other.folded && other.stack > 0 && other.key !== player.key) other.acted = false;
    }
  }

  function getActionCommandText(action, amount) {
    if (action === "bet" || action === "raise") return action + " $" + (amount || 0);
    return action;
  }

  function advanceEngineAction(record, actionAnnouncement, suppressRender) {
    const game = State.game;
    if (!game || !game.active) return;
    if (activeContestants().length <= 1) awardFoldWin(suppressRender);
    else if (hasBettingRoundSettled()) advancePhase(suppressRender);
    else {
      game.currentIndex = nextActorIndexFrom(game, game.currentIndex);
      announce(actionAnnouncement || "Next turn", PokerEngine.actions(game, game.players[game.currentIndex].key, "").prompt);
    }
    if (!suppressRender) RenderScheduler.defer("game-advance");
  }

  function engineApplyAction(game, action, actorKey, options) {
    options = options || {};
    const result = {
      ok: false,
      changed: false,
      status: "",
      log: "",
      announcement: null,
      pendingSelfApplied: false,
      render: false,
    };
    const normalized = normalizeEngineAction(action);
    const previousGame = State.game;
    State.game = game || previousGame;
    try {
      const activeGame = State.game;
      const player = enginePlayer(activeGame, actorKey);
      const current = activeGame && activeGame.players ? activeGame.players[activeGame.currentIndex] : null;
      const record = options.record || (action && action.record) || null;
      if (!normalized) {
        debugActionState("reject-unknown-action", record, player);
        return result;
      }
      if (!activeGame || !activeGame.active) {
        debugActionState("drop-inactive command=" + normalized.text, record, player);
        return result;
      }
      if (!current) {
        debugActionState("drop-no-current command=" + normalized.text, record, player);
        return result;
      }
      const policy = engineActionPolicy(activeGame, player && player.key, "");
      const legal = policy.legal;
      if (!policy.isLegal(normalized)) {
        const prefix = !player || !current || current.key !== player.key
          ? "reject-out-of-turn"
          : "reject-illegal-" + normalized.action;
        rejectAction(prefix, normalized.action, normalized.amount, record, player);
        return result;
      }
      let actionAmount = normalized.amount;
      let logText = "";
      let actionAnnouncement = "";
      if (normalized.action === "fold") {
        player.folded = true;
        player.acted = true;
        logText = player.name + " folds.";
        actionAnnouncement = logText;
        addGameLog(logText);
      } else if (normalized.action === "check") {
        player.acted = true;
        logText = player.name + " checks.";
        actionAnnouncement = logText;
        addGameLog(logText);
      } else if (normalized.action === "call") {
        actionAmount = Math.min(legal.toCall, player.stack);
        const paid = commitChips(activeGame, player, actionAmount);
        player.acted = true;
        actionAmount = paid;
        logText = player.name + " calls $" + paid + ".";
        actionAnnouncement = logText;
        addGameLog(logText);
      } else if (normalized.action === "bet" || normalized.action === "raise") {
        const previousCurrentBet = activeGame.currentBet;
        const paidAmount = commitChips(activeGame, player, actionAmount - player.bet);
        activeGame.currentBet = player.bet;
        activeGame.lastRaise = activeGame.currentBet - previousCurrentBet;
        activeGame.minRaise = activeGame.lastRaise;
        activeGame.lastAggressorIndex = activeGame.currentIndex;
        resetOtherActorsForAggression(player);
        player.acted = true;
        logText = normalized.action === "bet"
          ? player.name + " bets $" + paidAmount + "."
          : player.name + " raises to $" + activeGame.currentBet + " (" + paidAmount + " more).";
        actionAnnouncement = normalized.action === "bet"
          ? player.name + " bets $" + activeGame.currentBet + "."
          : player.name + " raises to $" + activeGame.currentBet + ".";
        addGameLog(logText);
      }
      const suppressRender = !!options.suppressRender;
      State.reducerActionStatus = "";
      advanceEngineAction(record, actionAnnouncement, suppressRender);
      const localActionEchoApplied = record && record.isSelf
        ? markLocalActionEchoApplied(getActionCommandText(normalized.action, actionAmount))
        : false;
      result.ok = true;
      result.changed = true;
      result.status = State.reducerActionStatus || actionAnnouncement;
      result.log = logText;
      result.announcement = actionAnnouncement || null;
      result.pendingSelfApplied = !!localActionEchoApplied;
      result.render = !suppressRender;
      State.reducerActionStatus = "";
      return result;
    } finally {
      State.game = previousGame;
    }
  }

  function createEngine(options) {
    options = options || {};
    const progressValidation = Object.prototype.hasOwnProperty.call(options, "progressPayload")
      ? validateProgressPayload(options.progressPayload)
      : null;
    if (progressValidation && !progressValidation.ok) {
      const invalidBankrolls = Object.prototype.hasOwnProperty.call(options, "bankrolls") ? options.bankrolls : State.bankrolls;
      return { ok: false, game: null, bankrolls: invalidBankrolls || {}, status: progressValidation.status || "Invalid progress code." };
    }
    const progressPayload = progressValidation ? progressValidation.payload : null;
    const seats = options.roster || (progressPayload && progressPayload.roster) || getReadySeatArray();
    const bankrolls = Object.prototype.hasOwnProperty.call(options, "bankrolls")
      ? (options.bankrolls || {})
      : ((progressPayload && progressPayload.bankrolls) || State.bankrolls || {});
    const previousGame = Object.prototype.hasOwnProperty.call(options, "previousGame") ? options.previousGame : State.game;
    if (!seats || seats.length < MIN_READY_PLAYERS) {
      return { ok: false, game: null, bankrolls: bankrolls, status: "Need 2 ready players to start." };
    }
    const players = [];
    const hasBankrollState = Object.keys(bankrolls).length > 0;
    for (let i = 0; i < seats.length; i += 1) {
      const seat = seats[i] || {};
      const key = normalizePlayerKey(seat.key || seat.name);
      const name = seat.name || seat.key || "Player";
      const prior = bankrolls[key];
      const stack = typeof prior === "number" ? prior : (hasBankrollState ? 0 : STARTING_STACK);
      if (key && stack > 0) players.push(makeGamePlayer(key, name, stack));
    }
    if (players.length < MIN_READY_PLAYERS) {
      return { ok: false, game: null, bankrolls: bankrolls, status: "Need 2 ready players to start." };
    }
    let dealerIndex = -1;
    const requestedDealerKey = normalizePlayerKey(options.dealerKey);
    if (requestedDealerKey) {
      for (let i = 0; i < players.length; i += 1) {
        if (players[i].key === requestedDealerKey) {
          dealerIndex = i;
          break;
        }
      }
      if (dealerIndex < 0) {
        return { ok: false, game: null, bankrolls: bankrolls, status: "Cannot resume; saved dealer state is invalid." };
      }
    } else {
      let previousDealerIndex = -1;
      const previousPlayers = previousGame && previousGame.players ? previousGame.players : [];
      const previousDealer = previousPlayers[previousGame && previousGame.dealerIndex];
      const previousDealerKey = normalizePlayerKey(previousDealer && previousDealer.key);
      for (let i = 0; i < players.length; i += 1) {
        if (players[i].key === previousDealerKey && players[i].stack > 0) {
          previousDealerIndex = i;
          break;
        }
      }
      if (previousDealerIndex >= 0) {
        for (let offset = 1; offset <= players.length; offset += 1) {
          const next = (previousDealerIndex + offset) % players.length;
          if (players[next].stack > 0) {
            dealerIndex = next;
            break;
          }
        }
      }
      if (dealerIndex < 0) dealerIndex = 0;
    }
    const requestedHandNumber = options.handNumber || (progressPayload && progressPayload.nextHandNumber);
    const handNumber = requestedHandNumber
      ? getBlindLevelForHand(requestedHandNumber)
      : getBlindLevelForHand(previousGame && previousGame.handNumber ? previousGame.handNumber + 1 : 1);
    const smallBlindIndex = players.length === 2 ? dealerIndex : (dealerIndex + 1) % players.length;
    const bigBlindIndex = (smallBlindIndex + 1) % players.length;
    const smallBlindAmount = getSmallBlindForHand(handNumber);
    const bigBlindAmount = getBigBlindForHand(handNumber);
    const game = {
      active: true,
      finished: false,
      seed: options.seed,
      deck: buildDeck(options.seed),
      players: players,
      community: [],
      pot: 0,
      currentBet: bigBlindAmount,
      currentIndex: 0,
      phase: "preflop",
      log: [],
      handNumber: handNumber,
      dealerIndex: dealerIndex,
      smallBlindIndex: smallBlindIndex,
      bigBlindIndex: bigBlindIndex,
      smallBlindAmount: smallBlindAmount,
      bigBlindAmount: bigBlindAmount,
      minRaise: bigBlindAmount,
      lastRaise: bigBlindAmount,
      streetOpenerIndex: -1,
      lastAggressorIndex: bigBlindIndex,
      pots: [],
      potWinnerKeys: {},
      announcement: null,
    };
    for (let r = 0; r < 2; r += 1) for (let p = 0; p < players.length; p += 1) players[p].cards.push(drawCard(game));
    commitChips(game, players[smallBlindIndex], smallBlindAmount);
    commitChips(game, players[bigBlindIndex], bigBlindAmount);
    game.currentIndex = nextActorIndexFrom(game, bigBlindIndex);
    game.streetOpenerIndex = game.currentIndex;
    addGameLogTo(game, "Hand " + game.handNumber + " started. Stacks begin at $" + STARTING_STACK + ".");
    addGameLogTo(game, "Blinds posted: " + players[smallBlindIndex].name + " $" + smallBlindAmount + ", " + players[bigBlindIndex].name + " $" + bigBlindAmount + ".");
    setGameAnnouncement(game, "Blinds posted", players[smallBlindIndex].name + " small blind $" + smallBlindAmount + ". " + players[bigBlindIndex].name + " big blind $" + bigBlindAmount + ". " + players[game.currentIndex].name + " acts first.");
    return { ok: true, game: game, bankrolls: bankrolls, status: "" };
  }

  function enginePlayer(game, key) {
    const normalized = normalizePlayerKey(key);
    if (!game || !game.players || !normalized) return null;
    for (let i = 0; i < game.players.length; i += 1) {
      if (normalizePlayerKey(game.players[i].key) === normalized) return game.players[i];
    }
    return null;
  }

  function engineActionPolicy(game, actorKey, localKey) {
    const activeGame = game || null;
    const players = activeGame && activeGame.players ? activeGame.players : [];
    const current = activeGame && players.length ? players[activeGame.currentIndex] || null : null;
    const actor = actorKey ? enginePlayer(activeGame, actorKey) : current;
    const local = localKey ? enginePlayer(activeGame, localKey) : null;
    const currentActor = !!(activeGame && activeGame.active && actor && current && actor.key === current.key);
    const toCall = actor ? getCallAmount(actor, activeGame) : 0;
    const chipsAvailable = actor ? (Number(actor.bet) || 0) + (Number(actor.stack) || 0) : 0;
    const contestants = players.filter((player) => player && !player.folded);
    const legal = {
      check: currentActor && toCall === 0,
      call: currentActor && toCall > 0,
      fold: currentActor && contestants.length > 1,
      toCall: toCall,
      canBetTarget: function canBetTarget(amount) {
        return currentActor && activeGame.currentBet === 0 && amount >= getCurrentBigBlind(activeGame) && amount <= chipsAvailable;
      },
      canRaiseTarget: function canRaiseTarget(amount) {
        return currentActor &&
          activeGame.currentBet > 0 &&
          amount > activeGame.currentBet &&
          amount - activeGame.currentBet >= (activeGame.minRaise || getCurrentBigBlind(activeGame)) &&
          amount <= chipsAvailable;
      },
    };
    const kind = activeGame && activeGame.currentBet === 0 ? "bet" : "raise";
    const minTarget = activeGame ? (kind === "bet" ? getCurrentBigBlind(activeGame) : getMinimumRaiseTo(activeGame)) : BIG_BLIND;
    const isLegal = function isLegal(action) {
      const decoded = normalizeEngineAction(action);
      if (!decoded) return false;
      if (decoded.action === "check") return !!legal.check;
      if (decoded.action === "call") return !!legal.call;
      if (decoded.action === "fold") return !!legal.fold;
      if (decoded.action === "bet") return legal.canBetTarget(decoded.amount);
      if (decoded.action === "raise") return legal.canRaiseTarget(decoded.amount);
      return false;
    };
    const custom = !!(activeGame && actor && isLegal({ action: kind, amount: minTarget }) && chipsAvailable >= minTarget)
      ? {
        action: kind,
        min: minTarget,
        max: chipsAvailable,
        step: SMALL_BLIND,
        value: minTarget,
        isLegal: function isLegalCustomAmount(amount) {
          return isLegal({ action: kind, amount: amount });
        },
        command: function customCommand(amount) {
          return getActionCommandText(kind, amount);
        },
        label: function customLabel(amount) {
          return (kind === "bet" ? "BET $" : "RAISE TO $") + amount;
        },
        invalidStatus: function invalidCustomStatus() {
          return (kind === "bet" ? "Bet" : "Raise") + " must be between $" + minTarget + " and $" + chipsAvailable + ".";
        },
      }
      : null;
    legal.bet = !!(custom && kind === "bet");
    legal.raise = !!(custom && kind === "raise");
    const enabled = !!(local && current && actor && actor.key === local.key && current.key === local.key);
    const choices = [];
    if (legal.check) choices.push({ label: "CHECK", command: "check", className: "PokerActionButton", enabled: enabled, readOnly: !enabled });
    if (legal.call) choices.push({ label: "CALL $" + legal.toCall, command: "call", className: "PokerActionButton", enabled: enabled, readOnly: !enabled });
    if (custom) choices.push({ label: kind === "bet" ? "BET" : "RAISE", command: "custom-" + kind, className: "PokerActionButton", enabled: enabled, readOnly: !enabled, customBet: custom });
    if (legal.fold) choices.push({ label: "FOLD", command: "fold", className: "PokerActionButton Danger", enabled: enabled, readOnly: !enabled });
    const promptChoices = [];
    if (legal.check) promptChoices.push("check");
    if (legal.call) promptChoices.push("call $" + toCall);
    if (custom) promptChoices.push(kind + " $" + custom.min + "-$" + custom.max);
    if (legal.fold) promptChoices.push("fold");
    const prompt = activeGame && activeGame.active && current
      ? current.name + " to act" + (promptChoices.length ? ": " + promptChoices.join(", ") + "." : ".")
      : "";
    const statusText = activeGame && activeGame.active
      ? String(activeGame.phase || "lobby").toUpperCase() +
        " | turn " + (current ? current.name : "<none>") +
        " | pot $" + (activeGame.pot || 0) +
        " | bet $" + (activeGame.currentBet || 0) +
        " | you " + (local ? local.name : "<unknown>") +
        " | call $" + toCall
      : "";
    const invalidStatus = function invalidStatus(action) {
      if (!activeGame || !activeGame.active || !current) return "No active synced hand is waiting for an action.";
      if (!local) return "Chat sender unknown. Type ready or reopen party chat so Deadlock exposes your name before acting.";
      if (current.key !== local.key) return "Waiting for " + current.name + ". You are " + local.name + ".";
      if (!isLegal(action)) return "Action no longer legal for " + local.name + ". Waiting for " + current.name + ".";
      return "";
    };
    return {
      currentKey: current && current.key ? current.key : "",
      localKey: local && local.key ? local.key : (localKey || ""),
      actorKey: actor && actor.key ? actor.key : (actorKey || ""),
      phase: activeGame ? activeGame.phase || "" : "",
      pot: activeGame ? Number(activeGame.pot) || 0 : 0,
      currentBet: activeGame ? Number(activeGame.currentBet) || 0 : 0,
      toCall: toCall,
      minBetTarget: custom && kind === "bet" ? custom.min : getCurrentBigBlind(activeGame),
      maxBetTarget: chipsAvailable,
      minRaiseTarget: activeGame ? getMinimumRaiseTo(activeGame) : BIG_BLIND,
      maxRaiseTarget: chipsAvailable,
      legal: legal,
      isLegal: isLegal,
      invalidStatus: invalidStatus,
      prompt: prompt,
      ranges: { bet: kind === "bet" ? custom : null, raise: kind === "raise" ? custom : null },
      readOnly: !enabled,
      illegal: { customAmount: !!(activeGame && actor && !custom && (kind === "bet" || kind === "raise")) },
      statusText: statusText,
      actionChoices: choices,
    };
  }

  const ACTION_WIRE_TABLE = [
    { action: "check", pattern: /^check$/i },
    { action: "call", pattern: /^call$/i },
    { action: "fold", pattern: /^fold$/i },
    { action: "bet", pattern: /^bet\s+\$(\d+)$/i },
    { action: "raise", pattern: /^raise\s+\$(\d+)$/i },
    { type: "all-in-unsupported", unsupported: true, pattern: /^all(?:\s+|-)?in$/i },
  ];

  function decodeActionWire(text, record) {
    const normalized = String(text || "").replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
    if (!normalized) return null;
    for (let i = 0; i < ACTION_WIRE_TABLE.length; i += 1) {
      const definition = ACTION_WIRE_TABLE[i];
      const match = normalized.match(definition.pattern);
      if (!match) continue;
      if (definition.unsupported) {
        return { type: definition.type, family: "action", action: "all-in", amount: 0, text: normalizeText(normalized), record: record || null, unsupported: true };
      }
      return { type: "action", family: "action", action: definition.action, amount: match[1] ? Number(match[1]) : 0, text: normalizeText(normalized), record: record || null };
    }
    return null;
  }

  function normalizeEngineAction(action) {
    if (typeof action === "string") {
      const parsed = decodeActionWire(action);
      return parsed && !parsed.unsupported ? parsed : null;
    }
    const source = action && typeof action === "object" ? action : {};
    const raw = normalizeText(source.action || source.type || "");
    if ((raw === "bet" || raw === "raise") && source.amount != null) {
      const amount = Number(source.amount);
      if (!Number.isFinite(amount) || amount < 0) return null;
      return { type: "action", family: "action", action: raw, amount: Math.floor(amount), text: getActionCommandText(raw, amount), record: source.record || null };
    }
    const parsed = decodeActionWire(raw);
    return parsed && !parsed.unsupported ? parsed : null;
  }

  function departEngineGame(game, playerKey, context) {
    const key = normalizePlayerKey(playerKey);
    const player = enginePlayer(game, key);
    if (!game || !player) return { ok: false, changed: false, reset: false, continuation: false, key: key || "" };
    const name = context && context.name ? context.name : (player.name || key || "Player");
    const active = !!game.active;
    const index = game.players.indexOf(player);
    const base = {
      ok: true,
      key: key,
      name: name,
      continuation: !!active,
      reset: false,
      log: name + (active ? " left the lobby and folds." : " left the lobby."),
      announcement: active ? { title: name + " left and folds", detail: "" } : null,
    };
    if (active && game.players.length <= 2) {
      base.reset = true;
      base.continuation = false;
      base.announcement = { title: name + " left", detail: "Only two players were seated, so the hand was reset." };
      return base;
    }
    const previousGame = State.game;
    State.game = game;
    try {
      if (active) {
        const wasCurrent = game.currentIndex === index;
        player.folded = true;
        player.left = true;
        player.acted = true;
        addGameLogTo(game, base.log);
        if (activeContestants().length <= 1) awardFoldWin();
        else {
          if (wasCurrent) game.currentIndex = nextActorIndexFrom(game, index);
          announce(base.announcement.title, PokerEngine.actions(game, game.players[game.currentIndex].key, "").prompt);
          if (hasBettingRoundSettled()) advancePhase();
        }
        base.advanced = wasCurrent;
        return base;
      }
      game.players.splice(index, 1);
      if (game.dealerIndex >= game.players.length) game.dealerIndex = 0;
      if (game.currentIndex >= game.players.length) game.currentIndex = 0;
      if (game.players.length) addGameLogTo(game, base.log);
      if (State.bankrolls) delete State.bankrolls[key];
      return base;
    } finally {
      State.game = previousGame;
    }
  }

  function progressEngine(game) {
    const players = game && game.players ? game.players : [];
    const eligible = [];
    for (let i = 0; i < players.length; i += 1) {
      if (!isDepartedPlayer(players[i])) eligible.push(players[i]);
    }
    if (!eligible.length) return { players: eligible, dealerKey: "" };
    const dealer = players[game.dealerIndex];
    const dealerKey = normalizePlayerKey(dealer && dealer.key);
    if (dealerKey && !isDepartedPlayer(dealer) && eligible.some((player) => normalizePlayerKey(player.key) === dealerKey)) {
      return { players: eligible, dealerKey: dealerKey };
    }
    let nextDealerKey = "";
    for (let offset = 1; offset <= players.length; offset += 1) {
      const candidate = players[((game.dealerIndex || 0) + offset) % players.length];
      const candidateKey = normalizePlayerKey(candidate && candidate.key);
      if (!candidateKey || isDepartedPlayer(candidate)) continue;
      if (eligible.some((player) => normalizePlayerKey(player.key) === candidateKey)) {
        nextDealerKey = candidateKey;
        break;
      }
    }
    if (!nextDealerKey) nextDealerKey = normalizePlayerKey(eligible[0].key || eligible[0].name);
    for (let i = 0; i < eligible.length; i += 1) {
      if (normalizePlayerKey(eligible[i].key) === nextDealerKey) {
        const anchor = eligible[(i + eligible.length - 1) % eligible.length];
        return { players: eligible, dealerKey: normalizePlayerKey(anchor.key || anchor.name) };
      }
    }
    return { players: eligible, dealerKey: normalizePlayerKey(eligible[eligible.length - 1].key || eligible[eligible.length - 1].name) };
  }

  const BD_ACE = 0;
  const BD_KING = 1;
  const BD_QUEEN = 2;
  const BD_JOKER = 3;
  const BD_LABELS = Object.freeze(["ACE", "KING", "QUEEN", "JOKER"]);
  const BD_DECK = Object.freeze([BD_ACE, BD_ACE, BD_ACE, BD_ACE, BD_ACE, BD_ACE, BD_KING, BD_KING, BD_KING, BD_KING, BD_KING, BD_KING, BD_QUEEN, BD_QUEEN, BD_QUEEN, BD_QUEEN, BD_QUEEN, BD_QUEEN, BD_JOKER, BD_JOKER]);
  const BD_MASK = 31;
  const BD_EMPTY_RESULT = Object.freeze({ changed: false, status: "rejected", roundEnded: false, matchEnded: false });

  function bdHex8(value) {
    return (value >>> 0).toString(16).padStart(8, "0").toLowerCase();
  }
  function bdCount(mask) {
    let value = mask >>> 0;
    let count = 0;
    while (value) {
      value &= value - 1;
      count += 1;
    }
    return count;
  }
  function bdPlayerKey(value) {
    return normalizePlayerKey(value);
  }
  function bdPlayerAt(game, key) {
    const wanted = bdPlayerKey(key);
    if (!wanted) return null;
    for (let i = 0; i < game.players.length; i += 1) {
      if (game.players[i].key === wanted) return game.players[i];
    }
    return null;
  }
  function bdActivePlayers(game) {
    const result = [];
    for (let i = 0; i < game.players.length; i += 1) {
      if (game.players[i].status === "active") result.push(game.players[i]);
    }
    return result;
  }
  function bdActiveWithCards(game) {
    const result = [];
    for (let i = 0; i < game.players.length; i += 1) {
      const player = game.players[i];
      if (player.status === "active" && player.remainingMask !== 0) result.push(player);
    }
    return result;
  }
  function bdNextIndex(game, fromIndex, requireCards) {
    const count = game.players.length;
    for (let offset = 1; offset <= count; offset += 1) {
      const index = (fromIndex + offset + count) % count;
      const player = game.players[index];
      if (player.status !== "active") continue;
      if (requireCards && player.remainingMask === 0) continue;
      return index;
    }
    return -1;
  }
  function bdDeal(game) {
    const deck = BD_DECK.slice();
    const random = seededRandom(hashString(game.id + "|bd1|deck|" + game.round));
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const temp = deck[i];
      deck[i] = deck[j];
      deck[j] = temp;
    }
    for (let i = 0; i < game.players.length; i += 1) {
      if (game.players[i].status === "active") game.players[i].hand = [];
      else if (!Array.isArray(game.players[i].hand) || game.players[i].hand.length !== 5) game.players[i].hand = [BD_ACE, BD_ACE, BD_ACE, BD_ACE, BD_ACE];
      game.players[i].remainingMask = 0;
    }
    const active = bdActivePlayers(game);
    let cursor = 0;
    for (let pass = 0; pass < 5; pass += 1) {
      for (let i = 0; i < active.length; i += 1) {
        active[i].hand.push(deck[cursor]);
        active[i].remainingMask |= 1 << pass;
        cursor += 1;
      }
    }
    const targetRandom = seededRandom(hashString(game.id + "|bd1|target|" + game.round));
    game.target = Math.floor(targetRandom() * 3);
  }
  function bdCanonical(game) {
    const players = [];
    for (let i = 0; i < game.players.length; i += 1) {
      const player = game.players[i];
      players.push({
        key: player.key,
        name: player.name,
        status: player.status,
        hand: player.hand.slice(),
        remainingMask: player.remainingMask,
        outIndex: player.outIndex,
        riskIndex: player.riskIndex,
      });
    }
    const canonical = {
      version: game.version,
      ruleset: game.ruleset,
      id: game.id,
      rosterHash: game.rosterHash,
      active: game.active,
      finished: game.finished,
      aborted: game.aborted,
      endReason: game.endReason,
      desynced: game.desynced,
      round: game.round,
      seq: game.seq,
      target: game.target,
      currentIndex: game.currentIndex,
      lastPlay: game.lastPlay ? { actorIndex: game.lastPlay.actorIndex, mask: game.lastPlay.mask, count: game.lastPlay.count } : null,
      lastResult: null,
      winnerKey: game.winnerKey,
      players: players,
      log: game.log.slice(),
    };
    if (game.lastResult) {
      canonical.lastResult = {};
      const fields = ["actorIndex", "accusedIndex", "mask", "revealed", "truthful", "loserIndex", "riskBefore", "riskAfter", "eliminated"];
      for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i];
        if (Object.prototype.hasOwnProperty.call(game.lastResult, field)) {
          const value = game.lastResult[field];
          canonical.lastResult[field] = Array.isArray(value) ? value.slice() : value;
        }
      }
    }
    // Keep the historical null-state hash stable, but include all pending-shot
    // fields once a challenge has committed a reveal.
    if (game.pendingShot) {
      canonical.pendingShot = {
        shooterIndex: game.pendingShot.shooterIndex,
        challengeSeq: game.pendingShot.challengeSeq,
      };
    }
    return canonical;
  }
  function bdInvalid(reason) {
    throw new Error("Invalid Bluff Deck state: " + reason);
  }
  function bdValidMask(mask) {
    return Number.isInteger(mask) && mask >= 0 && mask <= BD_MASK;
  }
  function bdAssert(game) {
    if (!game || typeof game !== "object") bdInvalid("missing game");
    if (game.version !== 1 || game.ruleset !== "basic-v1") bdInvalid("version");
    if (typeof game.id !== "string" || !/^[0-9a-f]{8}$/i.test(game.id)) bdInvalid("match id");
    if (typeof game.rosterHash !== "string" || !/^[0-9a-f]{8}$/i.test(game.rosterHash)) bdInvalid("roster hash");
    if (!Array.isArray(game.players) || game.players.length < 2 || game.players.length > 4) bdInvalid("seat count");
    if (!Number.isInteger(game.round) || game.round < 1 || !Number.isInteger(game.seq) || game.seq < 0) bdInvalid("counters");
    if (!Number.isInteger(game.target) || game.target < BD_ACE || game.target > BD_QUEEN) bdInvalid("target");
    if (!Number.isInteger(game.currentIndex) || game.currentIndex < 0 || game.currentIndex >= game.players.length) bdInvalid("current index");
    if (!Array.isArray(game.log) || game.log.length > 8) bdInvalid("log");
    if (game.lastResult !== null && (!game.lastResult || typeof game.lastResult !== "object")) bdInvalid("last result");
    if (game.pendingShot !== null) {
      if (!game.pendingShot || !Number.isInteger(game.pendingShot.shooterIndex)
        || game.pendingShot.shooterIndex < 0 || game.pendingShot.shooterIndex >= game.players.length
        || !Number.isInteger(game.pendingShot.challengeSeq) || game.pendingShot.challengeSeq < 1
        || !game.lastPlay || !game.lastResult || game.lastResult.loserIndex !== game.pendingShot.shooterIndex
        || game.lastResult.riskAfter !== null || game.lastResult.eliminated !== null
        || game.players[game.pendingShot.shooterIndex].status !== "active"
        || game.currentIndex !== game.pendingShot.shooterIndex || !game.active) bdInvalid("pending shot");
    }
    const keys = [];
    let activeCount = 0;
    let winnerCount = 0;
    for (let i = 0; i < game.players.length; i += 1) {
      const player = game.players[i];
      if (!player || typeof player.key !== "string" || !player.key || player.key !== bdPlayerKey(player.key)) bdInvalid("seat key");
      if (keys.indexOf(player.key) !== -1) bdInvalid("duplicate seat");
      keys.push(player.key);
      if (typeof player.name !== "string" || !player.name) bdInvalid("seat name");
      if (player.status !== "active" && player.status !== "eliminated" && player.status !== "left") bdInvalid("seat status");
      if (!Array.isArray(player.hand) || player.hand.length !== 5) bdInvalid("hand");
      if (!bdValidMask(player.remainingMask)) bdInvalid("mask");
      if (!Number.isInteger(player.outIndex) || player.outIndex < 0 || player.outIndex > 5) bdInvalid("out index");
      if (!Number.isInteger(player.riskIndex) || player.riskIndex < 0 || player.riskIndex > 6) bdInvalid("risk index");
      if (player.status === "active") {
        activeCount += 1;
        if (player.riskIndex > 5) bdInvalid("active seat");
      } else if (player.remainingMask !== 0) bdInvalid("inactive hand");
      if (player.status === "eliminated" && player.riskIndex <= player.outIndex) bdInvalid("eliminated risk");
      for (let j = 0; j < player.hand.length; j += 1) {
        if (!Number.isInteger(player.hand[j]) || player.hand[j] < BD_ACE || player.hand[j] > BD_JOKER) bdInvalid("rank");
      }
      if (player.key === game.winnerKey) winnerCount += 1;
    }
    if (game.rosterHash !== bdHex8(hashString(keys.join("|")))) bdInvalid("roster hash");
    if (game.active) {
      if (game.finished || game.aborted || game.endReason) bdInvalid("active terminal flags");
      if (activeCount < 2) bdInvalid("active seats");
    } else if (game.finished) {
      if (game.aborted || game.endReason || activeCount !== 1 || winnerCount !== 1 || game.pendingShot !== null) bdInvalid("natural terminal");
    } else if (!game.aborted || game.endReason !== "leader" || game.winnerKey || activeCount < 2 || game.pendingShot !== null) {
      bdInvalid("manual terminal");
    }
    if (game.winnerKey && winnerCount !== 1) bdInvalid("winner");
    if (!game.winnerKey && winnerCount !== 0) bdInvalid("winner");
    if (game.lastPlay !== null) {
      const play = game.lastPlay;
      if (!play || !Number.isInteger(play.actorIndex) || play.actorIndex < 0 || play.actorIndex >= game.players.length) bdInvalid("last play actor");
      if (!bdValidMask(play.mask) || play.mask === 0 || !Number.isInteger(play.count) || play.count < 1 || play.count > 3 || play.count !== bdCount(play.mask)) bdInvalid("last play");
      const actor = game.players[play.actorIndex];
      if ((play.mask & ~((1 << actor.hand.length) - 1)) !== 0) bdInvalid("last play slots");
    }
    return true;
  }
  function bdForcedChallenge(game) {
    return !!game.lastPlay && !game.pendingShot && bdActiveWithCards(game).length === 1
      && game.players[game.currentIndex].status === "active" && game.players[game.currentIndex].remainingMask !== 0;
  }
  function bdResult(status, changed, roundEnded, matchEnded) {
    return { changed: !!changed, status: status, roundEnded: !!roundEnded, matchEnded: !!matchEnded };
  }
  function bdCreate(input) {
    if (!input || typeof input !== "object") throw new Error("Invalid Bluff Deck roster");
    const id = String(input.id || "").trim().toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id)) throw new Error("Invalid Bluff Deck match id");
    if (!Array.isArray(input.roster) || input.roster.length < 2 || input.roster.length > 4) throw new Error("Invalid Bluff Deck roster");
    const players = [];
    const keys = [];
    for (let i = 0; i < input.roster.length; i += 1) {
      const entry = input.roster[i];
      const key = bdPlayerKey(entry && entry.key);
      const name = String(entry && entry.name || "").replace(/\s+/g, " ").trim();
      if (!key || !name || keys.indexOf(key) !== -1) throw new Error("Invalid Bluff Deck roster");
      keys.push(key);
      players.push({ key: key, name: name, status: "active", hand: [], remainingMask: BD_MASK, outIndex: Math.floor(seededRandom(hashString(id + "|bd1|risk|" + key))() * 6), riskIndex: 0 });
    }
    const game = {
      version: 1, ruleset: "basic-v1", id: id, rosterHash: bdHex8(hashString(keys.join("|"))),
      active: true, finished: false, aborted: false, endReason: "", desynced: false,
      round: 1, seq: 0, target: BD_ACE,
      currentIndex: Math.floor(seededRandom(hashString(id + "|bd1|starter"))() * players.length),
      lastPlay: null, lastResult: null, pendingShot: null, winnerKey: "", players: players, log: [],
    };
    bdDeal(game);
    bdAssert(game);
    return game;
  }
  function bdLegalActions(game, actorKey) {
    const unavailable = { canPlay: false, canChallenge: false, canShoot: false, minCards: 0, maxCards: 0, legal: { play: false, challenge: false, shoot: false, forcedChallenge: false } };
    if (!game || !game.active || game.desynced || !Array.isArray(game.players)) return unavailable;
    const index = game.players.findIndex((player) => player.key === bdPlayerKey(actorKey));
    if (index !== game.currentIndex || game.players[index].status !== "active") return unavailable;
    if (game.pendingShot) {
      const canShoot = game.pendingShot.shooterIndex === index;
      return { canPlay: false, canChallenge: false, canShoot: canShoot, minCards: 0, maxCards: 0, legal: { play: false, challenge: false, shoot: canShoot, forcedChallenge: false } };
    }
    if (bdForcedChallenge(game)) return { canPlay: false, canChallenge: true, canShoot: false, minCards: 0, maxCards: 0, legal: { play: false, challenge: true, shoot: false, forcedChallenge: true } };
    if (game.players[index].remainingMask === 0) return unavailable;
    return { canPlay: true, canChallenge: !!game.lastPlay, canShoot: false, minCards: 1, maxCards: 3, legal: { play: true, challenge: !!game.lastPlay, shoot: false, forcedChallenge: false } };
  }
  function bdApply(game, actorKey, action, options) {
    // Keep old callers harmless while exposing the documented (game, actor, action) API.
    if (action === undefined && actorKey && typeof actorKey === "object") {
      action = actorKey;
      actorKey = "";
    }
    if (!game || !Array.isArray(game.players) || !action || typeof action !== "object") return BD_EMPTY_RESULT;
    bdAssert(game);
    const matchId = action.id || action.matchId || (options && (options.id || options.matchId)) || "";
    if (matchId && String(matchId).toLowerCase() !== game.id) return BD_EMPTY_RESULT;
    const seq = action.seq != null ? action.seq : (options && options.seq);
    if (seq != null && Number(seq) !== game.seq + 1) return BD_EMPTY_RESULT;
    const index = game.players.findIndex((player) => player.key === bdPlayerKey(actorKey));
    if (!game.active || game.desynced || index !== game.currentIndex || game.players[index].status !== "active") return BD_EMPTY_RESULT;
    if (action.type === "play") {
      const mask = action.mask;
      if (game.pendingShot || bdForcedChallenge(game) || !bdValidMask(mask) || mask === 0 || (mask & ~game.players[index].remainingMask) !== 0) return BD_EMPTY_RESULT;
      const count = bdCount(mask);
      if (count < 1 || count > 3) return BD_EMPTY_RESULT;
      game.lastResult = null;
      game.players[index].remainingMask &= ~mask;
      game.lastPlay = { actorIndex: index, mask: mask, count: count };
      game.seq += 1;
      const next = bdNextIndex(game, index, true);
      game.currentIndex = next < 0 ? index : next;
      bdAssert(game);
      return bdResult(game.players[index].name.toUpperCase() + " PLAYED " + count + " CARD" + (count === 1 ? "" : "S"), true, false, false);
    }
    if (action.type === "challenge") {
      if (game.pendingShot || !game.lastPlay) return BD_EMPTY_RESULT;
      const play = game.lastPlay;
      const accused = game.players[play.actorIndex];
      const revealed = [];
      let truthful = true;
      for (let slot = 0; slot < accused.hand.length; slot += 1) {
        if ((play.mask & (1 << slot)) === 0) continue;
        revealed.push(accused.hand[slot]);
        if (accused.hand[slot] !== game.target && accused.hand[slot] !== BD_JOKER) truthful = false;
      }
      const loserIndex = truthful ? index : play.actorIndex;
      game.lastResult = {
        actorIndex: index, accusedIndex: play.actorIndex, mask: play.mask, revealed: revealed,
        truthful: truthful, loserIndex: loserIndex, riskBefore: game.players[loserIndex].riskIndex,
        riskAfter: null, eliminated: null,
      };
      game.pendingShot = { shooterIndex: loserIndex, challengeSeq: game.seq + 1 };
      game.currentIndex = loserIndex;
      game.seq += 1;
      bdAppendLog(game, bdChallengeText(game.lastResult, game));
      bdAssert(game);
      return bdResult((truthful ? "CALLER" : "ACCUSED") + " MUST PULL TRIGGER", true, false, false);
    }
    if (action.type !== "shoot" || !game.pendingShot || game.pendingShot.shooterIndex !== index) return BD_EMPTY_RESULT;
    const result = game.lastResult;
    const loser = game.players[index];
    const riskBefore = loser.riskIndex;
    loser.riskIndex += 1;
    const eliminated = riskBefore === loser.outIndex;
    if (eliminated) {
      loser.status = "eliminated";
      loser.remainingMask = 0;
    }
    result.riskAfter = loser.riskIndex;
    result.eliminated = eliminated;
    game.seq += 1;
    game.pendingShot = null;
    game.lastPlay = null;
    const active = bdActivePlayers(game);
    const text = bdResultText(result, game);
    if (active.length === 1) {
      game.active = false;
      game.finished = true;
      game.winnerKey = active[0].key;
      game.currentIndex = game.players.indexOf(active[0]);
      bdAppendLog(game, text);
      bdAssert(game);
      return bdResult((result.truthful ? "CALLER" : "ACCUSED") + " RESULT: " + (eliminated ? "OUT" : "SAFE"), true, true, true);
    }
    game.round += 1;
    bdDeal(game);
    game.currentIndex = loser.status === "active" ? index : bdNextIndex(game, index, false);
    bdAppendLog(game, text);
    bdAssert(game);
    return bdResult((result.truthful ? "CALLER" : "ACCUSED") + " RESULT: " + (eliminated ? "OUT" : "SAFE"), true, true, false);
  }
  function bdChallengeText(result) {
    return "REVEAL: " + result.revealed.map((rank) => "[" + BD_LABELS[rank] + "]").join(" ") + " — " + (result.truthful ? "TRUTH" : "LIE")
      + "\n" + (result.truthful ? "CALLER" : "ACCUSED") + " RESULT: PENDING\nPULL TRIGGER";
  }
  function bdResultText(result) {
    return "REVEAL: " + result.revealed.map((rank) => "[" + BD_LABELS[rank] + "]").join(" ") + " — " + (result.truthful ? "TRUTH" : "LIE")
      + "\n" + (result.truthful ? "CALLER" : "ACCUSED") + " RESULT: " + (result.eliminated ? "OUT" : "SAFE") + (result.eliminated ? "\nPLAYER ELIMINATED" : "");
  }
  function bdAppendLog(game, text) {
    game.log.push(text);
    if (game.log.length > 8) game.log.splice(0, game.log.length - 8);
  }
  function bdDepart(game, playerKey) {
    if (!game || !game.active || !Array.isArray(game.players)) return BD_EMPTY_RESULT;
    bdAssert(game);
    const index = game.players.findIndex((player) => player.key === bdPlayerKey(playerKey));
    if (index < 0 || game.players[index].status !== "active") return BD_EMPTY_RESULT;
    const leaver = game.players[index];
    game.lastResult = null;
    game.lastPlay = null;
    game.pendingShot = null;
    leaver.status = "left";
    leaver.remainingMask = 0;
    game.seq += 1;
    const active = bdActivePlayers(game);
    if (active.length === 1) {
      game.active = false;
      game.finished = true;
      game.winnerKey = active[0].key;
      game.currentIndex = game.players.indexOf(active[0]);
      bdAppendLog(game, leaver.name + " LEFT");
      bdAssert(game);
      return bdResult("finished", true, true, true);
    }
    game.round += 1;
    bdDeal(game);
    game.currentIndex = bdNextIndex(game, index, false);
    bdAppendLog(game, leaver.name + " LEFT");
    bdAssert(game);
    return bdResult("departed", true, true, false);
  }
  function bdAbort(game) {
    if (!game || !game.active) return BD_EMPTY_RESULT;
    bdAssert(game);
    game.active = false;
    game.finished = false;
    game.aborted = true;
    game.endReason = "leader";
    game.winnerKey = "";
    game.lastPlay = null;
    game.pendingShot = null;
    game.lastResult = null;
    bdAssert(game);
    return bdResult("aborted", true, true, true);
  }
  function bdProject(game, localPlayerKey, selectedMask, pending) {
    let providedLocal = null;
    let providedLegal = null;
    if (localPlayerKey && typeof localPlayerKey === "object") {
      const options = localPlayerKey;
      localPlayerKey = options.localPlayerKey || options.localKey || "";
      selectedMask = options.selectionMask || options.selectedMask || 0;
      pending = options.pending || options.pendingText || pending;
      providedLocal = options.localPlayer || null;
      providedLegal = options.legalActions || null;
    } else if (selectedMask && typeof selectedMask === "object") {
      pending = selectedMask.pending || selectedMask.pendingText || pending;
      selectedMask = selectedMask.selectionMask || selectedMask.selectedMask || 0;
    }
    const empty = { headerText: "", targetText: "", turnText: "", previousPlayText: "", handText: "", opponentTexts: [], actionText: "", pendingText: "", resultText: "", logTexts: [] };
    if (!game || !Array.isArray(game.players)) return empty;
    const local = providedLocal || bdPlayerAt(game, localPlayerKey);
    const selected = bdValidMask(selectedMask) ? selectedMask : 0;
    const model = {
      headerText: game.active ? "BLUFF DECK\nROUND " + game.round : "BLUFF DECK\nMATCH ENDED",
      targetText: "TARGET\n" + BD_LABELS[game.target],
      turnText: game.active ? "TURN\n" + game.players[game.currentIndex].name.toUpperCase() : "",
      previousPlayText: game.lastPlay ? game.players[game.lastPlay.actorIndex].name.toUpperCase() + " PLAYED " + game.lastPlay.count + " CARD" + (game.lastPlay.count === 1 ? "" : "S") : "",
      handText: "", opponentTexts: [], actionText: "", pendingText: "", resultText: "", logTexts: Array.isArray(game.log) ? game.log.slice() : [],
    };
    if (local) {
      const labels = [];
      for (let i = 0; i < local.hand.length; i += 1) labels.push("[" + BD_LABELS[local.hand[i]] + ((selected & local.remainingMask & (1 << i)) !== 0 ? "*" : "") + "]");
      model.handText = labels.join(" ");
      for (let i = 0; i < game.players.length; i += 1) {
        const opponent = game.players[i];
        if (opponent === local) continue;
        if (opponent.status === "active") model.opponentTexts.push(opponent.name.toUpperCase() + "\nCARDS " + bdCount(opponent.remainingMask) + "\nRISK " + opponent.riskIndex + "/6");
        else model.opponentTexts.push(opponent.name.toUpperCase() + "\n" + opponent.status.toUpperCase());
      }
      if (!game.active) model.actionText = "MATCH ENDED";
      else if (game.pendingShot && game.pendingShot.shooterIndex === game.players.indexOf(local)) model.actionText = "PULL TRIGGER";
      else {
        const legal = providedLegal || bdLegalActions(game, local.key);
        const parts = [];
        if (legal.canPlay) parts.push("PLAY " + bdCount(selected & local.remainingMask) + " SELECTED");
        if (legal.canChallenge) parts.push("LIE");
        model.actionText = parts.length ? parts.join("\n") : "WAITING";
      }
    } else if (!game.active) model.actionText = "MATCH ENDED";
    else model.actionText = "WAITING";
    if (game.lastResult) model.resultText = game.pendingShot ? bdChallengeText(game.lastResult) : bdResultText(game.lastResult);
    if (game.aborted) model.resultText = "MATCH ENDED BY TABLE LEADER";
    if (pending) model.pendingText = pending.bridgeStatus === "cancelling" ? "CANCELLING..." : "SENDING...";
    return model;
  }
  function bdDebugHash(game) {
    return bdHex8(hashString(JSON.stringify(bdCanonical(game))));
  }
  const BluffDeckEngine = {
    create: bdCreate,
    legalActions: bdLegalActions,
    apply: bdApply,
    abort: bdAbort,
    depart: bdDepart,
    projectText: bdProject,
    debugHash: bdDebugHash,
    assertInvariants: bdAssert,
  };

  function projectBluffControlState(input) {
    const options = input && typeof input === "object" ? input : {};
    const game = options.game && typeof options.game === "object" ? options.game : null;
    const party = options.party && typeof options.party === "object" ? options.party : {};
    const legal = options.legal && typeof options.legal === "object" ? options.legal : {};
    const localKey = bdPlayerKey(options.localKey || options.localPlayerKey || "");
    const current = game && Array.isArray(game.players) && game.players[game.currentIndex] ? game.players[game.currentIndex] : null;
    const local = options.localPlayer || (game ? bdPlayerAt(game, localKey) : null);
    const bluffActive = !!(game && game.active);
    const tableActive = !!(bluffActive || options.otherActive);
    const partyId = String(party.id || "").trim();
    const mode = String(party.mode || "none").toLowerCase();
    const memberCount = Array.isArray(options.roster)
      ? options.roster.length
      : Array.isArray(party.order)
        ? party.order.filter((key) => party.members && party.members[bdPlayerKey(key)]).length
        : Object.keys(party.members || {}).length;
    const isLeader = options.isLeader == null
      ? !!(localKey && party.leaderKey && bdPlayerKey(party.leaderKey) === localKey)
      : !!options.isLeader;
    const choice = function choice(hidden, enabled, label, eligible, readOnly) {
      return {
        hidden: !!hidden,
        enabled: !!enabled && !hidden,
        eligible: !!eligible && !hidden,
        readOnly: !!readOnly && !hidden,
        label: String(label || ""),
      };
    };
    const controls = {
      host: choice(tableActive || !!partyId || mode !== "none", !tableActive && !partyId && mode === "none", "HOST", false, false),
      join: choice(tableActive || !partyId || mode !== "none", !tableActive && !!partyId && mode === "none", "JOIN", false, false),
      leave: choice(!partyId, !!partyId, "LEAVE", false, false),
      start: choice(tableActive || mode !== "leader" || !isLeader || memberCount < 2 || memberCount > 4, !tableActive && mode === "leader" && isLeader && memberCount >= 2 && memberCount <= 4, "START BLUFF", false, false),
      end: choice(!bluffActive || !isLeader || mode !== "leader", bluffActive && isLeader && mode === "leader", "END", false, false),
      play: choice(true, false, "PLAY SELECTED", false, false),
      challenge: choice(true, false, "LIE", false, false),
    };
    if (options.pending) {
      controls.play = choice(false, false, "PLAY SELECTED", false, false);
      controls.challenge = choice(false, false, legal.canShoot ? "PULL TRIGGER" : "LIE", false, false);
      return controls;
    }
    if (!bluffActive || !local || !current || current.key !== local.key) return controls;
    const selectedMask = bdValidMask(options.selectedMask) ? options.selectedMask : 0;
    const selectedCount = bdCount(selectedMask & (local.remainingMask || 0));
    if (legal.canShoot) {
      controls.challenge = choice(false, true, "PULL TRIGGER", true, false);
    } else if (legal.canPlay) {
      const minCards = Number.isInteger(legal.minCards) ? legal.minCards : 1;
      const maxCards = Number.isInteger(legal.maxCards) ? legal.maxCards : 3;
      const eligible = selectedCount >= minCards && selectedCount <= maxCards;
      controls.play = choice(false, eligible, "PLAY SELECTED", eligible, false);
      if (legal.canChallenge) controls.challenge = choice(false, true, "LIE", true, false);
    }
    return controls;
  }
  const BluffDeckControlState = { project: projectBluffControlState };

  const PokerEngine = {
    create: createEngine,
    decodeAction: decodeActionWire,
    actions: engineActionPolicy,
    apply: engineApplyAction,
    depart: departEngineGame,
    progress: progressEngine,
    evaluate: evaluateHand,
    compare: compareHands,
    pots: buildPots,
    showdown: showdown,
  };

  function findGamePlayerByKey(key) {
    if (!State.game) return null;
    for (let i = 0; i < State.game.players.length; i += 1) if (State.game.players[i].key === key) return State.game.players[i];
    return null;
  }

  function clearLocalActionEcho() {
    try {
      delete getConfig()[PENDING_SELF_ACTION_KEY];
    } catch (e) {}
  }
  function recordLocalActionEcho(command, local, game) {
    if (!command || !local || !game || !game.active) return;
    const now = Date.now();
    try {
      getConfig()[PENDING_SELF_ACTION_KEY] = {
        message: command,
        playerKey: local.key,
        playerName: local.name,
        phase: game.phase,
        currentIndex: game.currentIndex,
        sentAt: now,
        expiresAt: now + PENDING_SELF_ACTION_TTL_MS,
      };
    } catch (e) {}
  }

  function readLocalActionEcho() {
    let pending = null;
    try {
      pending = getConfig()[PENDING_SELF_ACTION_KEY];
    } catch (e) {
      pending = null;
    }
    const game = State.game;
    const current = getCurrentPlayer();
    if (!pending || !game || !game.active || !current) {
      clearLocalActionEcho();
      return null;
    }
    if (Date.now() > Number(pending.expiresAt || 0)) {
      clearLocalActionEcho();
      return null;
    }
    if (pending.phase !== game.phase || pending.currentIndex !== game.currentIndex || normalizePlayerKey(pending.playerKey) !== current.key) {
      clearLocalActionEcho();
      return null;
    }
    return pending;
  }
  function resolveLocalActionEchoRecord(record, text) {
    if (!record || !record.isSelf || !isUnknownSender(record.sender)) return record;
    if (!PokerEngine.decodeAction(text)) return record;
    const pending = readLocalActionEcho();
    if (!pending) return record;
    if (normalizeText(pending.message) !== normalizeText(text)) return record;
    if (!pending.playerName || isUnknownSender(pending.playerName)) return record;
    const resolved = copyChatRecord(record);
    if (!resolved) return record;
    resolved.sender = pending.playerName;
    rememberLocalPlayer(pending.playerName);
    return resolved;
  }

  function markLocalActionEchoApplied(command) {
    const pending = readLocalActionEcho();
    if (!pending) return false;
    if (normalizeText(pending.message) !== normalizeText(command)) return false;
    clearLocalActionEcho();
    return true;
  }

  function resolveSelfRecord(record) {
    if (!record || !record.isSelf) return record;
    const isAction = !!PokerEngine.decodeAction(record.message);
    const pending = isAction ? readLocalActionEcho() : null;
    if (isAction && pending) {
      const echoed = resolveLocalActionEchoRecord(record, normalizeText(record.message));
      if (isUnknownSender(echoed.sender)) return echoed;
      return echoed;
    }
    if (!isUnknownSender(record.sender)) {
      rememberLocalPlayer(record.sender);
      return record;
    }
    const localPlayer = findGamePlayerByKey(State.localPlayerKey);
    const rememberedName = getRememberedLocalPlayerName();
    const name = localPlayer ? localPlayer.name : rememberedName;
    if (!name) return resolveLocalActionEchoRecord(record, normalizeText(record.message));
    const resolved = copyChatRecord(record);
    if (!resolved) return record;
    resolved.sender = name;
    rememberLocalPlayer(name);
    return resolved;
  }

  function resolveUnknownActionRecord(record, text) {
    if (!record || record.isSelf || !isUnknownSender(record.sender)) return record;
    const decoded = PokerEngine.decodeAction(text);
    if (!decoded) return record;
    const game = State.game;
    const current = getCurrentPlayer();
    if (!game || !game.active || !current || !current.name) return record;
    if (current.key === State.localPlayerKey) return record;
    const party = ensureParty();
    const knownPartyActor = Boolean(
      (party.members && party.members[current.key]) ||
      party.leaderKey === current.key ||
      (party.order && party.order.indexOf(current.key) !== -1)
    );
    if (!knownPartyActor) return record;
    if (!PokerEngine.actions(game, current.key, "").isLegal(decoded)) return record;
    const resolved = copyChatRecord(record);
    if (!resolved) return record;
    resolved.sender = current.name;
    log("resolved unknown action sender to synced current actor " + current.name);
    return resolved;
  }

  function resolveUnknownSyncedStartRecord(record, decodedRoster) {
    if (!record || !isUnknownSender(record.sender)) return record;
    const party = ensureParty();
    if (!party.leaderKey || !decodedRoster || !decodedRoster[0] || decodedRoster[0].key !== party.leaderKey) return record;
    const resolved = copyChatRecord(record);
    if (!resolved) return record;
    resolved.sender = party.leaderName || decodedRoster[0].name;
    log("resolved unknown synced start sender to party leader " + resolved.sender);
    return resolved;
  }

  function copyChatRecord(record) {
    if (!record || !record.message) return null;
    const copy = {};
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i += 1) copy[keys[i]] = record[keys[i]];
    return copy;
  }

  function rememberPendingResumeStartCommand(command, id) {
    const key = String(id || "").replace(/[^a-z0-9-]/gi, "").toLowerCase();
    if (!key || !command) return false;
    const record = copyChatRecord(command.record);
    if (!record || !record.message) return false;
    State.pendingResumeStarts = State.pendingResumeStarts || {};
    State.pendingResumeStarts[key] = { record: record };
    log("queued resume start " + key + " until matching progress imports");
    return true;
  }

  function takePendingResumeStartCommand(id) {
    const key = String(id || "").replace(/[^a-z0-9-]/gi, "").toLowerCase();
    const pending = key && State.pendingResumeStarts ? State.pendingResumeStarts[key] : null;
    if (pending) delete State.pendingResumeStarts[key];
    return pending || null;
  }

  function applyPendingResumeStartCommand(id) {
    const pending = takePendingResumeStartCommand(id);
    if (!pending) return null;
    log("replaying pending resume start " + id);
    return ProgressResume.applyCommand(decodePokerCommand(pending.record));
  }

  function resolveUnknownHostedResumeStartRecord(record, id, parsedLeaderKey) {
    if (!record || !isUnknownSender(record.sender)) return record;
    const resume = ensureResume();
    const party = ensureParty();
    const leaderKey = normalizePlayerKey(parsedLeaderKey);
    if (!resume.payload || resume.id !== id || !leaderKey) return record;
    const hostedLeaderKey = getHostedSharedProgressLeaderKey(resume);
    const expectedLeaderKey = hostedLeaderKey || (party.id && party.leaderKey ? party.leaderKey : "");
    if (!expectedLeaderKey || leaderKey !== expectedLeaderKey) return record;
    if (!party.id || party.mode === "none") return record;
    if (party.leaderKey && party.leaderKey !== expectedLeaderKey) return record;
    const entry = findProgressRosterEntry(resume.payload, expectedLeaderKey);
    if (!entry || getProgressBankroll(resume.payload, expectedLeaderKey) <= 0) return record;
    const resolved = copyChatRecord(record) || {};
    resolved.sender = resume.hostedLeaderName || party.leaderName || entry.name || expectedLeaderKey;
    log("resolved unknown resume start sender to party leader " + resolved.sender);
    return resolved;
  }

  function getProgressTransfer(id, checksum, count, record) {
    const key = id + ":" + checksum;
    State.progressTransfers = State.progressTransfers || {};
    let transfer = State.progressTransfers[key];
    if (!transfer || transfer.count !== count) {
      transfer = { id: id, checksum: checksum, count: count, chunks: {}, authorityRecord: null };
      State.progressTransfers[key] = transfer;
    }
    if (record && !isUnknownSender(record.sender)) transfer.authorityRecord = copyChatRecord(record);
    return transfer;
  }

  function importSharedProgressCode(id, checksum, chunks) {
    let code = "";
    try {
      for (let i = 1; i <= chunks.length; i += 1) code += String(chunks[i - 1] || "");
    } catch (e) {
      return { ok: false, status: "Invalid shared progress chunk." };
    }
    if (checksumFromProgressCode(code) !== checksum) return { ok: false, status: "Invalid shared progress checksum." };
    const decoded = decodeProgressSaveCode(code);
    if (!decoded.ok || decoded.id !== id) return { ok: false, status: "Invalid shared progress code." };
    const imported = ProgressResume.importCode(code, "shared");
    if (!imported.ok) return imported;
    return { ok: true, id: id, code: code, payload: imported.payload };
  }

  function applyProgressShareMessage(message) {
    if (!message || !message.id || !message.checksum || !message.count) return ignoredCommandEffect("progress-share");
    if (message.record && message.record.isSelf) return consumedNoChangeEffect("progress-self");
    if (message.type === "offer") {
      getProgressTransfer(message.id, message.checksum, message.count, message.record);
      const offerStatus = "Receiving progress " + message.id + " (0/" + message.count + " chunks).";
      return changedCommandEffect(offerStatus, "progress-offer");
    }
    if (message.type !== "chunk" || message.index < 1 || message.index > message.count) {
      return rejectedCommandEffect("Invalid shared progress chunk.", "progress-chunk");
    }
    const key = message.id + ":" + message.checksum;
    const transfer = State.progressTransfers && State.progressTransfers[key];
    if (!transfer) return consumedNoChangeEffect("progress-chunk");
    transfer.chunks[message.index] = message.chunk;
    const ordered = [];
    for (let i = 1; i <= transfer.count; i += 1) {
      if (!transfer.chunks[i]) {
        const partialStatus = "Receiving progress " + transfer.id + " (" + Object.keys(transfer.chunks).length + "/" + transfer.count + " chunks).";
        return changedCommandEffect(partialStatus, "progress-chunk");
      }
      ordered.push(transfer.chunks[i]);
    }
    const imported = importSharedProgressCode(transfer.id, transfer.checksum, ordered);
    delete State.progressTransfers[transfer.id + ":" + transfer.checksum];
    if (!imported.ok) {
      const status = imported.status || "Invalid shared progress code.";
      return changedCommandEffect(status, "progress-chunk");
    }
    const party = ensureParty();
    const boundHostedLeader = bindHostedSharedProgressAuthority(imported, transfer.authorityRecord || message.record);
    if (!boundHostedLeader) {
      State.resumeRequiresHostedParty = true;
      saveResumeState();
    }
    const status = party.id && party.leaderKey && party.mode !== "none"
      ? "Imported shared progress " + imported.id + ". Waiting for " + (party.leaderName || "the leader") + " to start NEXT SYNCED HAND."
      : (boundHostedLeader
        ? "Imported shared progress " + imported.id + ". Host or join " + ((ensureResume().hostedLeaderName) || "the host") + "'s Poker party; only the host starts NEXT SYNCED HAND."
        : "Imported shared progress " + imported.id + ". Host or join the synced Poker party; wait for the host to start NEXT SYNCED HAND.");
    const pendingResumeStart = applyPendingResumeStartCommand(imported.id);
    if (pendingResumeStart) return pendingResumeStart;
    return changedCommandEffect(status, "progress-chunk");
  }

  function applyPartyCommand(command, resolvedRecord) {
    const partyType = command.type === "party-leader" ? "leader" : (command.type === "party-join" ? "join" : "leave");
    if (partyType === "leave") resolvedRecord = resolveUnknownLeaderLeaveAfterMatchEnd(resolvedRecord, command.partyId, ensureParty());
    if (isUnknownSender(resolvedRecord.sender) && partyType !== "leader") {
      debugActionState("reject-unknown-party-authority", resolvedRecord, null);
      return rejectedCommandEffect("", "debug");
    }
    const result = PartyReducer.apply({
      type: partyType,
      record: resolvedRecord,
      partyId: command.partyId,
      scopedBluffLeave: command.scopedBluffLeave || null,
    });
    const applied = applyPartyResultEffects(result);
    if (!applied) return consumedNoChangeEffect("party");
    return commandEffect(true, applied.readyChanged, !!result.render, result.status || "", "party");
  }

  function applyMatchEndCommand(command, resolvedRecord) {
    const result = PartyReducer.apply({
      type: "match-end",
      partyId: command.partyId,
      seed: command.seed || "",
      handNumber: command.handNumber || 0,
      record: resolvedRecord,
    });
    const applied = applyPartyResultEffects(result, "remote match end");
    if (!applied || !result.changed) return consumedNoChangeEffect("match-end");
    return commandEffect(true, applied.readyChanged, !!result.render, result.status || "Match ended by party leader.", "match-end");
  }

  function applyResumeAuthorityCommand(command, resolvedRecord) {
    if (isUnknownSender(resolvedRecord.sender)) {
      debugActionState("reject-unknown-resume-authority", resolvedRecord, null);
      return rejectedCommandEffect("", "debug");
    }
    const resume = ensureResume();
    if (!resume.payload || resume.id !== command.id) {
      return rejectedCommandEffect("Import matching progress " + (command.id || "") + " before joining this resume.", "status");
    }
    const hostedSharedLeaderKey = getHostedSharedProgressLeaderKey(resume);
    if (State.resumeRequiresHostedParty && !hostedSharedLeaderKey) {
      return rejectedCommandEffect("Host or join the synced party before choosing a resume leader.", "status");
    }
    if (hostedSharedLeaderKey && normalizePlayerKey(resolvedRecord.sender) !== hostedSharedLeaderKey) {
      const status = "Waiting for " + (resume.hostedLeaderName || resume.leaderName || "the host") + " to start NEXT SYNCED HAND.";
      debugActionState("reject-non-hosted-resume-authority sender=" + resolvedRecord.sender + " leader=" + (resume.hostedLeaderName || resume.leaderName || hostedSharedLeaderKey), resolvedRecord, null);
      return rejectedCommandEffect(status, "status");
    }
    const changed = command.type === "resume-leader"
      ? recordResumeLeader(resolvedRecord, command.id)
      : recordResumeReady(resolvedRecord, command.id);
    if (!changed) return consumedNoChangeEffect("resume");
    const status = command.type === "resume-leader"
      ? (resolvedRecord.isSelf
        ? "Resume leader selected: " + resolvedRecord.sender + ". Waiting for saved players to mark resume ready."
        : "Resume leader selected: " + resolvedRecord.sender + ". Identify yourself with READY UP if your saved player name is not detected; the resume-ready button will appear after that.")
      : "Resume ready: " + Object.keys(resume.ready).length + " player(s).";
    return changedCommandEffect(status, command.type);
  }

  function applyStartCommand(command, resolvedRecord) {
    if (getActiveTableGameType() === "bluff-deck") return rejectedCommandEffect("Finish the active Bluff Deck match before starting Poker.", "start");
    if (command.rosterText) {
      const seed = command.seed || String(Date.now());
      if (command.hasHandMarker && !command.handNumber) return rejectedCommandEffect("Invalid synced poker hand number.", "status");
      const decodedRoster = resolveRosterNamesFromKnownParty(command.roster || []);
      if (decodedRoster.length < MIN_READY_PLAYERS) return rejectedCommandEffect("Invalid synced poker roster.", "status");
      const startRecord = resolveUnknownSyncedStartRecord(resolvedRecord, decodedRoster);
      if (isUnknownSender(startRecord.sender)) {
        debugActionState("reject-unknown-start", startRecord, null);
        return rejectedCommandEffect("", "debug");
      }
      const starterKey = normalizePlayerKey(startRecord.sender);
      const party = ensureParty();
      if (party.leaderKey && starterKey !== party.leaderKey) {
        debugActionState("reject-non-leader-start sender=" + startRecord.sender + " leader=" + party.leaderName, startRecord, null);
        return rejectedCommandEffect("Only " + (party.leaderName || "<leader>") + " can start the synced hand.", "status");
      }
      if (State.game && State.game.active) {
        log("ignored synced start during active hand seed " + seed);
        return consumedNoChangeEffect("start");
      }
      if (!party.leaderKey) {
        if (!decodedRoster[0] || decodedRoster[0].key !== starterKey) {
          debugActionState("reject-non-leader-start sender=" + startRecord.sender + " leader=" + (decodedRoster[0] ? decodedRoster[0].name : "<unknown>"), startRecord, null);
          return rejectedCommandEffect("Only " + (decodedRoster[0] ? decodedRoster[0].name : "<leader>") + " can start the synced hand.", "status");
        }
        applyPartyRoster(decodedRoster, startRecord.isSelf ? "leader" : "member", ensureParty().id);
      }
      const freshMatchBoundary = !State.game || State.game.finished || !State.game.active;
      if (command.handNumber === 1 && freshMatchBoundary && Object.keys(State.bankrolls).length > 0) {
        State.bankrolls = {};
        log("reset bankrolls for fresh synced hand 1");
      }
      applyPartyRoster(decodedRoster, party.mode, party.id);
      rememberLocalFromPartyRoster(decodedRoster);
      applyLateJoinBuyIns(decodedRoster, "start");
      const created = PokerEngine.create({
        seed: seed,
        roster: decodedRoster,
        handNumber: command.handNumber || undefined,
        previousGame: State.game,
      });
      if (created.ok && created.game) {
        State.bankrolls = created.bankrolls;
        State.game = created.game;
        log("game started seed " + seed);
        return changedCommandEffect("Poker started. " + getCurrentPlayer().name + " acts first.", "start");
      }
      return consumedNoChangeEffect("start");
    }
    if (isUnknownSender(resolvedRecord.sender)) {
      debugActionState("reject-unknown-start", resolvedRecord, null);
      return rejectedCommandEffect("", "debug");
    }
    const seed = command.legacySeed || String(Date.now());
    const created = PokerEngine.create({
      seed: seed + " " + resolvedRecord.sender,
      roster: getReadySeatArray(),
      previousGame: State.game,
    });
    if (created.ok && created.game) {
      State.bankrolls = created.bankrolls;
      State.game = created.game;
      log("game started seed " + seed);
      return changedCommandEffect("Poker started. " + getCurrentPlayer().name + " acts first.", "start");
    }
    return consumedNoChangeEffect("start");
  }

  function applyUnsupportedAllInCommand(command, resolvedRecord) {
    debugActionState("reject-unknown-action command=" + command.text, resolvedRecord, findGamePlayerByKey(normalizePlayerKey(resolvedRecord.sender)));
    return rejectedCommandEffect("", "debug");
  }

  function applyActionCommand(command, resolvedRecord) {
    const text = command.text || command.action || "";
    if (!State.game || !State.game.active) {
      debugActionState("drop-no-active-game message=" + text, resolvedRecord, null);
      return rejectedCommandEffect("", "debug");
    }
    const actionRecord = resolveUnknownActionRecord(resolvedRecord, text);
    const player = findGamePlayerByKey(normalizePlayerKey(actionRecord.sender));
    if (!player) {
      debugActionState("reject-unknown-sender command=" + text + " amount=" + command.amount + " toCall=0 minRaise=" + (State.game ? State.game.minRaise || getCurrentBigBlind(State.game) : BIG_BLIND) + " currentBet=" + (State.game ? State.game.currentBet : 0) + " playerBet=<none> playerStack=<none> playerCommitted=<none>", actionRecord, null);
      return rejectedCommandEffect("", "debug");
    }
    const applied = PokerEngine.apply(
      State.game,
      { action: command.action, amount: command.amount, record: actionRecord },
      player.key,
      { record: actionRecord, suppressRender: true },
    );
    if (!applied || !applied.ok || !applied.changed) return rejectedCommandEffect("", "action");
    return changedCommandEffect(applied.status || "", "action");
  }

  const COMMAND_HANDLERS = {
    "party-leader": applyPartyCommand,
    "party-join": applyPartyCommand,
    "party-leave": applyPartyCommand,
    "match-end": applyMatchEndCommand,
    "progress-offer": ProgressResume.applyCommand,
    "progress-chunk": ProgressResume.applyCommand,
    "resume-leader": ProgressResume.applyCommand,
    "resume-ready": ProgressResume.applyCommand,
    "resume-start": ProgressResume.applyCommand,
    "start": applyStartCommand,
    "all-in-unsupported": applyUnsupportedAllInCommand,
    "action": applyActionCommand,
  };

  function applyPokerCommand(command) {
    const ignored = ignoredCommandEffect(command && command.type ? command.type : "");
    if (!command || !command.type || command.type === "ignored") return ignored;
    const resolvedRecord = command.record ? command.record : resolveSelfRecord(command);
    if (!resolvedRecord || !resolvedRecord.message) return ignored;
    const handler = COMMAND_HANDLERS[command.type];
    if (!handler) return consumedNoChangeEffect(command.type);
    return handler(command, resolvedRecord) || consumedNoChangeEffect(command.type);
  }

  function applyReducerEffect(effect, suppressRender) {
    const applied = effect && typeof effect === "object"
      ? {
        consumed: !!effect.consumed,
        readyChanged: !!effect.readyChanged,
        render: !!effect.render,
        status: effect.status || "",
        debugReason: effect.debugReason || "",
      }
      : ignoredCommandEffect("");
    if (applied.readyChanged) updateReadySeats(true);
    if (applied.status) setStatus(applied.status);
    if (applied.render && !suppressRender) RenderScheduler.defer(applied.debugReason || "reducer");
    return applied;
  }

  function processChatRecord(record) {
    return applyReducerEffect(CommandReducer.applyRecord(record), false);
  }

  const COMMAND_DEFINITIONS = [
    { family: "party", type: "party-leader", prefix: "party leader poker party ", field: "partyId" },
    { family: "party", type: "party-join", prefix: "party join poker party ", field: "partyId" },
    { family: "party", type: "party-leave", prefix: "party leave poker party ", field: "partyId" },
    { family: "match", type: "match-end", prefix: "match end poker party ", markers: ["seed", "hand"], field: "partyId" },
    { family: "progress", type: "progress-offer", pattern: /^\[progress offer\]\s+poker\s+progress\s+([a-z0-9-]+)\s+([0-9a-f]{8})\s+([1-9]\d*)$/i },
    { family: "progress", type: "progress-chunk", pattern: /^\[progress chunk\]\s+poker\s+progress\s+([a-z0-9-]+)\s+([0-9a-f]{8})\s+([1-9]\d*)\/([1-9]\d*)\s+([A-Za-z0-9_-]+)$/i },
    { family: "resume", type: "resume-leader", prefix: "resume leader poker resume ", field: "id" },
    { family: "resume", type: "resume-ready", prefix: "resume ready poker resume ", field: "id" },
    { family: "resume", type: "resume-start", prefix: "poker resume ", markers: ["hand", "leader", "seed"], optionalMarker: "roster", field: "id" },
    { family: "start", type: "start", prefixes: ["poker start ", "start poker"], markers: ["hand"], optionalMarker: "roster" },
    { family: "ignored", type: "ignored" },
  ];

  function decodePokerCommand(record) {
    const resolved = resolveSelfRecord(record);
    const rawText = String(resolved && resolved.message || "").replace(/^\s+|\s+$/g, "");
    const text = normalizeText(rawText);
    const ignored = { type: "ignored", family: "ignored", record: resolved || record, text: text };
    if (!resolved || !text) return ignored;
    const staticAction = PokerEngine.decodeAction(rawText, resolved);
    if (staticAction) return staticAction;
    const parts = rawText.split(/\s+/).filter(Boolean);
    const readMarker = (marker) => {
      const match = rawText.match(new RegExp("(?:^|\\s)" + marker + "\\s+([^\\s]+)", "i"));
      return match ? match[1] : "";
    };
    const decodeKey = (value) => {
      try {
        return normalizePlayerKey(decodeURIComponent(value || ""));
      } catch (e) {
        return "";
      }
    };
    const cleanId = (value, maxLength) => String(value || "").replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, maxLength || 40);
    for (let i = 0; i < COMMAND_DEFINITIONS.length; i += 1) {
      const definition = COMMAND_DEFINITIONS[i];
      let match = null;
      if (definition.pattern) {
        match = rawText.match(definition.pattern) || text.match(definition.pattern);
        if (!match) continue;
      } else if (definition.exact) {
        if (definition.exact.indexOf(text) === -1) continue;
      } else if (definition.prefix) {
        if (text.indexOf(definition.prefix) !== 0) continue;
      } else if (definition.prefixes) {
        let matched = false;
        for (let j = 0; j < definition.prefixes.length; j += 1) {
          if (text.indexOf(definition.prefixes[j]) === 0) {
            matched = true;
            break;
          }
        }
        if (!matched) continue;
      }
      if (definition.type === "ignored") return ignored;
      const command = { type: definition.type, family: definition.family, record: resolved, text: text };
      if (definition.type === "party-leader" || definition.type === "party-join" || definition.type === "party-leave" || definition.type === "match-end") {
        const partyMatch = rawText.match(/poker\s+party\s+([a-z0-9-]+)/i);
        command.partyId = cleanId(partyMatch && partyMatch[1]);
        if (definition.type === "party-leave") {
          const scoped = rawText.match(/^\[party leave\]\s+poker party\s+(\S+)\s+bd1\s+([0-9a-f]{8})\s+([1-9]\d*)$/i);
          if (scoped) {
            command.scopedBluffLeave = {
              matchId: scoped[2].toLowerCase(),
              nextSeq: Number(scoped[3]),
            };
          }
        }
      } else if (definition.type === "progress-offer") {
        command.id = match[1].toLowerCase();
        command.checksum = match[2].toLowerCase();
        command.count = Math.floor(Number(match[3]));
      } else if (definition.type === "progress-chunk") {
        command.id = match[1].toLowerCase();
        command.checksum = match[2].toLowerCase();
        command.index = Math.floor(Number(match[3]));
        command.count = Math.floor(Number(match[4]));
        command.chunk = match[5];
      } else if (definition.type === "resume-leader" || definition.type === "resume-ready") {
        const resumeMatch = rawText.match(/poker\s+resume\s+([a-z0-9-]+)/i);
        command.id = cleanId(resumeMatch && resumeMatch[1]);
      } else if (definition.type === "resume-start") {
        const resumeMatch = rawText.match(/^poker\s+resume\s+([a-z0-9-]+)/i);
        const handToken = readMarker(START_HAND_MARKER);
        const leaderToken = readMarker(START_LEADER_MARKER);
        const seedToken = readMarker(START_SEED_MARKER);
        const rosterToken = readMarker(START_ROSTER_MARKER);
        command.id = cleanId(resumeMatch && resumeMatch[1]);
        command.handNumber = parseHandNumberToken(handToken);
        command.leaderKey = decodeKey(leaderToken);
        command.seed = seedToken;
        command.rosterText = rosterToken;
        command.hasRosterMarker = rawText.toLowerCase().indexOf(" " + START_ROSTER_MARKER + " ") >= 0;
        command.valid = !!(resumeMatch && handToken && leaderToken && seedToken);
      } else if (definition.type === "start") {
        const syncedStart = text.indexOf("poker start ") === 0;
        const handToken = readMarker(START_HAND_MARKER);
        const rosterToken = readMarker(START_ROSTER_MARKER);
        command.seed = syncedStart ? (parts[2] || "") : "";
        command.handNumber = parseHandNumberToken(handToken);
        command.hasHandMarker = text.indexOf(" " + START_HAND_MARKER + " ") >= 0;
        command.rosterText = rosterToken;
        command.roster = rosterToken ? decodeRoster(rosterToken) : [];
        command.legacySeed = parts.length > 2 ? parts.slice(2).join(" ") : "";
      }
      if (definition.type === "match-end") {
        command.seed = readMarker(START_SEED_MARKER);
        command.handNumber = parseHandNumberToken(readMarker(START_HAND_MARKER));
      }
      return command;
    }
    return ignored;
  }

  function commandEffect(consumed, readyChanged, render, status, debugReason) {
    return {
      consumed: !!consumed,
      readyChanged: !!readyChanged,
      render: !!render,
      status: status || "",
      debugReason: debugReason || "",
    };
  }

  function ignoredCommandEffect(debugReason, status) {
    return commandEffect(false, false, false, status, debugReason);
  }

  function consumedNoChangeEffect(debugReason, status) {
    return commandEffect(true, false, false, status, debugReason);
  }

  function rejectedCommandEffect(status, debugReason) {
    return commandEffect(true, false, false, status, debugReason);
  }

  function changedCommandEffect(status, debugReason, readyChanged) {
    return commandEffect(true, !!readyChanged, true, status, debugReason);
  }

  function mergeCommandEffects(previous, next) {
    const left = previous || ignoredCommandEffect("payload");
    const right = next || ignoredCommandEffect("record");
    return commandEffect(
      left.consumed || right.consumed,
      left.readyChanged || right.readyChanged,
      left.render || right.render,
      right.status || left.status,
      right.debugReason || left.debugReason || "payload",
    );
  }

  function bluffRosterFromParty(party) {
    const source = party || ensureParty();
    const roster = [];
    const order = Array.isArray(source.order) ? source.order : [];
    const members = source.members && typeof source.members === "object" ? source.members : {};
    for (let i = 0; i < order.length && roster.length < 4; i += 1) {
      const key = normalizePlayerKey(order[i]);
      const member = members[key];
      if (!key || !member || roster.some((entry) => entry.key === key)) continue;
      roster.push({ key: key, name: String(member.name || key).replace(/\s+/g, " ").trim() || key });
    }
    return roster;
  }
  function bluffRosterHash(roster) {
    const keys = [];
    for (let i = 0; i < roster.length; i += 1) keys.push(roster[i].key);
    return bdHex8(hashString(keys.join("|")));
  }
  function bluffKnownPartyKey(key, party) {
    const normalized = normalizePlayerKey(key);
    const source = party || ensureParty();
    return !!(normalized && ((source.members && source.members[normalized]) || source.leaderKey === normalized || (source.order || []).indexOf(normalized) >= 0));
  }
  function bluffSeq(record) {
    const value = Number(record && record.seq);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  }
  function decodeBluffDeckCommand(text) {
    const raw = String(text || "").trim();
    if (raw.slice(0, 4).toLowerCase() !== "bd1 ") return null;
    let match = raw.match(/^bd1\s+r\s+([0-9a-f]{8})\s+([1-9]\d*)$/i);
    if (match) return { type: "shoot", matchId: match[1].toLowerCase(), seq: Number(match[2]), raw: raw };
    match = raw.match(/^bd1\s+s\s+([0-9a-f]{8})\s+([0-9a-f]{8})$/i);
    if (match) return { type: "start", matchId: match[1].toLowerCase(), rosterHash: match[2].toLowerCase(), raw: raw };
    match = raw.match(/^bd1\s+p\s+([0-9a-f]{8})\s+([1-9]\d*)\s+([0-9a-f]{1,2})$/i);
    if (match) return { type: "play", matchId: match[1].toLowerCase(), seq: Number(match[2]), mask: parseInt(match[3], 16), raw: raw };
    match = raw.match(/^bd1\s+c\s+([0-9a-f]{8})\s+([1-9]\d*)$/i);
    if (match) return { type: "challenge", matchId: match[1].toLowerCase(), seq: Number(match[2]), raw: raw };
    match = raw.match(/^bd1\s+e\s+([0-9a-f]{8})$/i);
    if (match) return { type: "end", matchId: match[1].toLowerCase(), raw: raw };
    return { type: "invalid", raw: raw };
  }
  function buildBluffDeckStart(party, matchId) {
    const id = String(matchId || "").trim().toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id)) return "";
    const roster = bluffRosterFromParty(party);
    if (roster.length < 2 || roster.length > 4) return "";
    return "bd1 s " + id + " " + bluffRosterHash(roster);
  }
  function buildBluffDeckPlay(game, mask) {
    if (!game || !/^[0-9a-f]{8}$/i.test(String(game.id || "")) || !Number.isInteger(mask) || mask < 0 || mask > 255) return "";
    return "bd1 p " + String(game.id).toLowerCase() + " " + (game.seq + 1) + " " + mask.toString(16);
  }
  function buildBluffDeckChallenge(game) {
    if (!game || !/^[0-9a-f]{8}$/i.test(String(game.id || ""))) return "";
    return "bd1 c " + String(game.id).toLowerCase() + " " + (game.seq + 1);
  }
  function buildBluffDeckShoot(game) {
    if (!game || !/^[0-9a-f]{8}$/i.test(String(game.id || ""))) return "";
    return "bd1 r " + String(game.id).toLowerCase() + " " + (game.seq + 1);
  }
  function buildBluffDeckEnd(game) {
    if (!game || !/^[0-9a-f]{8}$/i.test(String(game.id || ""))) return "";
    return "bd1 e " + String(game.id).toLowerCase();
  }
  function buildScopedBluffPartyLeave(partyId, game) {
    const id = String(partyId || "").trim();
    const matchId = String(game && game.id || "").trim().toLowerCase();
    const nextSeq = Number(game && game.seq) + 1;
    if (!id || !/^[0-9a-f]{8}$/.test(matchId) || !Number.isInteger(nextSeq) || nextSeq < 1) return "";
    return PARTY_LEAVE_PREFIX + " poker party " + id + " bd1 " + matchId + " " + nextSeq;
  }
  function bluffPersistTransition(record) {
    const seq = Math.max(State.processedChatSeq || 0, bluffSeq(record));
    saveBluffDeckMatchState(seq);
  }
  function resetBluffDeckTranscript() {
    if (State.bluffDeck) State.bluffDeck.transcript = [];
  }
  function bluffTranscriptName(game, index) {
    const player = game && Array.isArray(game.players) ? game.players[index] : null;
    return player && player.name ? String(player.name).toUpperCase() : "";
  }
  function appendBluffDeckTranscript(command, game, result) {
    if (!State.bluffDeck || !game || !result || !result.changed) return;
    let text = "";
    if (command.type === "play" && game.lastPlay) {
      const actor = bluffTranscriptName(game, game.lastPlay.actorIndex);
      if (actor) text = actor + " PLAYED " + game.lastPlay.count + " CARD" + (game.lastPlay.count === 1 ? "" : "S");
    } else if (command.type === "challenge" && game.lastResult) {
      const caller = bluffTranscriptName(game, game.lastResult.actorIndex);
      const accused = bluffTranscriptName(game, game.lastResult.accusedIndex);
      if (caller && accused) text = caller + " CALLED LIE ON " + accused;
    } else if (command.type === "shoot" && game.lastResult) {
      const actor = bluffTranscriptName(game, game.lastResult.loserIndex);
      if (actor) text = actor + " PULLED TRIGGER: " + (game.lastResult.eliminated ? "OUT" : "SAFE");
    }
    if (!text) return;
    const rows = Array.isArray(State.bluffDeck.transcript) ? State.bluffDeck.transcript : [];
    if (rows.length && rows[rows.length - 1] === text) return;
    rows.push(text);
    if (rows.length > BLUFF_DECK_HISTORY_LIMIT) rows.splice(0, rows.length - BLUFF_DECK_HISTORY_LIMIT);
    State.bluffDeck.transcript = rows;
  }
  function applyBluffDeckRecord(record) {
    const command = decodeBluffDeckCommand(record && record.message);
    if (!command) return ignoredCommandEffect("not-bluff");
    if (command.type === "invalid") return rejectedCommandEffect("", "bluff-invalid");
    incrementMetric("bluffCommandObserved");
    let sender = normalizePlayerKey(record && record.sender);
    const party = ensureParty();
    const unknownSender = isUnknownSender(sender);
    if (!unknownSender && !bluffKnownPartyKey(sender, party)) return rejectedCommandEffect("", "bluff-unauthorized");
    if (command.type === "start") {
      if (party.leaderKey !== sender) return rejectedCommandEffect("Only the party leader can start Bluff Deck.", "bluff-start");
      if (getActiveTableGameType() === "poker") return rejectedCommandEffect("Finish the active Poker game before starting Bluff Deck.", "bluff-start");
      const roster = bluffRosterFromParty(party);
      if (roster.length < 2 || roster.length > 4 || bluffRosterHash(roster) !== command.rosterHash) {
        requestChatSnapshot();
        return rejectedCommandEffect("Bluff Deck roster mismatch; observing chat history.", "bluff-roster");
      }
      if (State.bluffDeck.game && State.bluffDeck.game.active) return consumedNoChangeEffect("bluff-start");
      try {
        State.bluffDeck.game = BluffDeckEngine.create({ id: command.matchId, roster: roster });
        State.bluffDeck.selectedMask = 0;
        State.bluffDeck.pending = null;
        resetBluffDeckTranscript();
        bluffPersistTransition(record);
        requestBluffDeckFastPoll();
        return changedCommandEffect("Bluff Deck started.", "bluff-start");
      } catch (e) {
        return rejectedCommandEffect("", "bluff-start-invalid");
      }
    }
    const game = State.bluffDeck.game;
    if (!game || game.id !== command.matchId || !game.active) return consumedNoChangeEffect("bluff-foreign-or-inactive");
    if (unknownSender && (command.type === "play" || command.type === "challenge" || command.type === "shoot")) {
      const current = game.players[game.currentIndex];
      const expectedSeq = game.seq + 1;
      const actionLegal = current && current.status === "active" && command.seq === expectedSeq &&
        (command.type === "challenge"
          ? BluffDeckEngine.legalActions(game, current.key).canChallenge
          : command.type === "shoot"
            ? BluffDeckEngine.legalActions(game, current.key).canShoot
            : (BluffDeckEngine.legalActions(game, current.key).canPlay && Number.isInteger(command.mask) && command.mask > 0 && command.mask <= BD_MASK && (command.mask & ~current.remainingMask) === 0 && bdCount(command.mask) >= 1 && bdCount(command.mask) <= 3));
      if (record && record.isSelf) {
        const pending = State.bluffDeck.pending;
        if (!pending || pending.message !== String(record.message || "") || pending.matchId !== command.matchId || pending.expectedSeq !== command.seq || !actionLegal) {
          return rejectedCommandEffect("", "bluff-unknown-self");
        }
      } else if (!current || !bluffKnownPartyKey(current.key, party) || !actionLegal) {
        return rejectedCommandEffect("", "bluff-unknown");
      }
      sender = current.key;
    }
    if (!game || game.id !== command.matchId || !game.active) return consumedNoChangeEffect("bluff-foreign-or-inactive");
    if (command.type === "end") {
      if (party.leaderKey !== sender) return rejectedCommandEffect("", "bluff-end-authority");
      const ended = BluffDeckEngine.abort(game);
      if (!ended.changed) return consumedNoChangeEffect("bluff-end");
      State.bluffDeck.pending = null;
      resetBluffDeckTranscript();
      incrementMetric("bluffCommandApplied");
      bluffPersistTransition(record);
      return changedCommandEffect("MATCH ENDED BY TABLE LEADER", "bluff-end");
    }
    const seat = game.players[game.currentIndex];
    if (!seat || seat.key !== sender) return rejectedCommandEffect("", "bluff-unauthorized");
    const expected = game.seq + 1;
    if (command.seq <= game.seq) return consumedNoChangeEffect("bluff-stale");
    const legal = BluffDeckEngine.legalActions(game, sender);
    const legalAction = command.type === "challenge"
      ? legal.canChallenge
      : command.type === "shoot"
        ? legal.canShoot
        : (legal.canPlay && Number.isInteger(command.mask) && command.mask > 0 && command.mask <= BD_MASK && (command.mask & ~seat.remainingMask) === 0 && bdCount(command.mask) >= 1 && bdCount(command.mask) <= 3);
    if (!legalAction) return rejectedCommandEffect("", "bluff-illegal");
    if (command.seq > expected) {
      if (game.desynced) return consumedNoChangeEffect("bluff-gap");
      game.desynced = true;
      State.bluffDeck.selectedMask = 0;
      State.bluffDeck.pending = null;
      incrementMetric("bluffSequenceGap");
      bluffPersistTransition(record);
      requestChatSnapshot();
      return changedCommandEffect("Bluff Deck state gap; observing chat history.", "bluff-gap");
    }
    let result;
    try {
      const action = command.type === "challenge" ? { type: "challenge" } : command.type === "shoot" ? { type: "shoot" } : { type: "play", mask: command.mask };
      result = BluffDeckEngine.apply(game, sender, action);
    } catch (e) {
      return rejectedCommandEffect("", "bluff-apply-invalid");
    }
    if (!result || !result.changed) return rejectedCommandEffect("", "bluff-rejected");
    State.bluffDeck.pending = null;
    State.bluffDeck.selectedMask = 0;
    appendBluffDeckTranscript(command, game, result);
    incrementMetric("bluffCommandApplied");
    bluffPersistTransition(record);
    return changedCommandEffect(result.status || "", "bluff-" + command.type);
  }
  function restoreBluffDeckCandidate(messages) {
    if (!bluffDeckHydrationCandidate) return;
    const candidate = bluffDeckHydrationCandidate;
    let valid = true;
    try {
      if (candidate.version !== 1 || !candidate.game || candidate.game.ruleset !== "basic-v1") valid = false;
      else BluffDeckEngine.assertInvariants(candidate.game);
    } catch (e) {
      valid = false;
    }
    let hasStart = false;
    let highWater = 0;
    const rows = Array.isArray(messages) ? messages : [];
    for (let i = 0; valid && i < rows.length; i += 1) {
      const row = rows[i] || {};
      highWater = Math.max(highWater, bluffSeq(row));
      const decoded = decodeBluffDeckCommand(row.message);
      if (decoded && decoded.type === "start" && decoded.matchId === candidate.game.id && decoded.rosterHash === candidate.game.rosterHash) hasStart = true;
    }
    if (!valid || !hasStart || highWater < candidate.sourceChatSeq) {
      clearBluffDeckMatchState();
      setStatus("MATCH STATE UNAVAILABLE — OBSERVE UNTIL NEXT MATCH");
      return;
    }
    State.bluffDeck.game = candidate.game;
    resetBluffDeckTranscript();
    State.processedChatSeq = Math.max(State.processedChatSeq, candidate.sourceChatSeq);
    bluffDeckHydrationCandidate = null;
  }
  function bluffPendingMatches(event, pending) {
    return !!(pending
      && event
      && String(event.requestId || "") === String(pending.requestId || "")
      && String(event.message || "") === String(pending.message || ""));
  }
  function clearBluffPending(reason) {
    if (!State.bluffDeck.pending) return false;
    State.bluffDeck.pending = null;
    RenderScheduler.defer(reason || "bluff-pending-clear");
    return true;
  }
  function scheduleBluffPendingDeadline(pending) {
    if (!pending) return;
    const requestId = pending.requestId;
    const message = pending.message;
    const waitMs = pending.bridgeStatus === "submitted" ? BLUFF_ECHO_DEADLINE_MS : BLUFF_PREPARE_DEADLINE_MS;
    try {
      $.Schedule(waitMs / 1000, () => {
        const current = State.bluffDeck.pending;
        if (!current || current.requestId !== requestId || current.message !== message) return;
        if (current.bridgeStatus === "queued") {
          current.bridgeStatus = "cancelling";
          try {
            $.DispatchEvent(CLIENT_OUTPUT_EVENT, JSON.stringify({
              event: "BluffDeckSendCancelRequest",
              requestId: requestId,
            }));
          } catch (e) {}
          RenderScheduler.defer("bluff-send-cancelling");
          return;
        }
        if (current.bridgeStatus === "submitted") {
          State.bluffDeck.pending = null;
          incrementMetric("bluffPendingTimeout");
          requestChatSnapshot();
          RenderScheduler.defer("bluff-pending-timeout");
        }
      });
    } catch (e) {}
  }
  function handleBluffDeckSendStatus(event) {
    const pending = State.bluffDeck.pending;
    if (!bluffPendingMatches(event, pending)) return false;
    const status = String(event.status || "").toLowerCase();
    if (status === "submitted") {
      if (pending.bridgeStatus !== "queued") return false;
      pending.bridgeStatus = "submitted";
      pending.sentAt = Date.now();
      pending.expiresAt = pending.sentAt + BLUFF_ECHO_DEADLINE_MS;
      incrementMetric("bluffSendSubmitted");
      scheduleBluffPendingDeadline(pending);
      RenderScheduler.defer("bluff-send-submitted");
      return true;
    }
    if (status === "failed" || status === "cancelled") {
      if (pending.bridgeStatus === "submitted" && status === "cancelled") return false;
      State.bluffDeck.pending = null;
      RenderScheduler.defer("bluff-send-" + status);
      return true;
    }
    return false;
  }
  function makeBluffRequestIdentity(message, expectedSeq) {
    const game = State.bluffDeck && State.bluffDeck.game;
    const matchId = String(game && game.id || "").toLowerCase();
    const seq = Number(expectedSeq);
    if (!/^[0-9a-f]{8}$/.test(matchId) || !Number.isInteger(seq) || seq < 1 || !message) return null;
    bluffRequestSerial += 1;
    return "bd1:" + matchId + ":" + seq + ":" + bluffRequestSerial;
  }
  function sendBluffDeckCommand(message, expectedSeq, requestId) {
    const game = State.bluffDeck && State.bluffDeck.game;
    const matchId = String(game && game.id || "").toLowerCase();
    const seq = Number(expectedSeq);
    if (!/^[0-9a-f]{8}$/.test(matchId) || !Number.isInteger(seq) || seq < 1 || !message) return null;
    const id = requestId || makeBluffRequestIdentity(message, expectedSeq);
    if (!id) return null;
    try {
      $.DispatchEvent(CLIENT_OUTPUT_EVENT, JSON.stringify({
        event: BridgeContract.chatSendRequestEvent,
        message: String(message),
        source: "bluff-deck",
        requestId: id,
      }));
      return { requestId: id, message: String(message), sent: true };
    } catch (e) {
      return { requestId: id, message: String(message), sent: false };
    }
  }
  function installBluffPending(message, game, expectedSeq) {
    const requestId = makeBluffRequestIdentity(message, expectedSeq);
    if (!requestId) return null;
    const now = Date.now();
    State.bluffDeck.pending = {
      message: message,
      matchId: game.id,
      expectedSeq: expectedSeq,
      requestId: requestId,
      bridgeStatus: "queued",
      requestedAt: now,
      sentAt: 0,
      expiresAt: now + BLUFF_PREPARE_DEADLINE_MS,
    };
    requestBluffDeckFastPoll();
    return sendBluffDeckCommand(message, expectedSeq, requestId);
  }
  function localBluffKey() {
    return normalizePlayerKey(State.localPlayerKey || getRememberedLocalPlayerName());
  }
  function localBluffLeader(party) {
    const localKey = localBluffKey();
    return !!(party && localKey && party.leaderKey === localKey && party.members && party.members[localKey]);
  }
  function sendBluffDeckStart() {
    const party = ensureParty();
    if (getActiveTableGameType() || !localBluffLeader(party)) return false;
    const roster = bluffRosterFromParty(party);
    if (roster.length < 2 || roster.length > 4) return false;
    const matchId = bdHex8(hashString(String(party.id || "") + "|bd1|" + Date.now() + "|" + normalizePlayerKey(party.leaderKey)));
    const message = BluffDeckCommandReducer.buildStart(party, matchId);
    if (!message || !sendChatMessage(message)) return false;
    return true;
  }
  function sendBluffDeckEnd() {
    const party = ensureParty();
    const game = State.bluffDeck && State.bluffDeck.game;
    if (!game || !game.active || !localBluffLeader(party)) return false;
    const message = BluffDeckCommandReducer.buildEnd(game);
    if (!message || !sendChatMessage(message, false, true)) return false;
    return true;
  }
  function canSelectBluffCards(game, local) {
    if (!game || !game.active || !local || State.bluffDeck.pending) return false;
    const legal = BluffDeckEngine.legalActions(game, local.key);
    return !!(legal && legal.canPlay);
  }
  function selectBluffMask(mask) {
    const game = State.bluffDeck && State.bluffDeck.game;
    const local = game && bdPlayerAt(game, localBluffKey());
    const value = Number(mask);
    if (!canSelectBluffCards(game, local) || !Number.isInteger(value) || value < 0 || value > BD_MASK || (value & ~local.remainingMask) !== 0) return false;
    if (State.bluffDeck.selectedMask === value) return true;
    State.bluffDeck.selectedMask = value;
    incrementMetric("bluffSelectionChange");
    RenderScheduler.defer("bluff-selection");
    return true;
  }
  function sendBluffPlay() {
    const game = State.bluffDeck && State.bluffDeck.game;
    if (State.bluffDeck.pending) {
      incrementMetric("bluffDuplicateBlocked");
      return false;
    }
    const key = localBluffKey();
    const local = game && bdPlayerAt(game, key);
    const legal = game && local ? BluffDeckEngine.legalActions(game, key) : null;
    const mask = State.bluffDeck.selectedMask;
    if (!game || !local || !legal || !legal.canPlay || !Number.isInteger(mask) || mask === 0 || (mask & ~local.remainingMask) !== 0 || bdCount(mask) < 1 || bdCount(mask) > 3) return false;
    const message = BluffDeckCommandReducer.buildPlay(game, mask);
    const expectedSeq = game.seq + 1;
    const request = installBluffPending(message, game, expectedSeq);
    if (!request || !request.sent) {
      State.bluffDeck.pending = null;
      RenderScheduler.defer("bluff-play-send-failed");
      return false;
    }
    incrementMetric("bluffSendRequested");
    setStatus("SENDING PLAY...");
    RenderScheduler.defer("bluff-play-send");
    scheduleBluffPendingDeadline(State.bluffDeck.pending);
    return true;
  }
  function sendBluffChallenge() {
    const game = State.bluffDeck && State.bluffDeck.game;
    if (State.bluffDeck.pending) {
      incrementMetric("bluffDuplicateBlocked");
      return false;
    }
    const key = localBluffKey();
    const legal = game ? BluffDeckEngine.legalActions(game, key) : null;
    if (!game || !legal || (!legal.canChallenge && !legal.canShoot)) return false;
    const shooting = !!legal.canShoot;
    const message = shooting ? BluffDeckCommandReducer.buildShoot(game) : BluffDeckCommandReducer.buildChallenge(game);
    const expectedSeq = game.seq + 1;
    const request = installBluffPending(message, game, expectedSeq);
    if (!request || !request.sent) {
      State.bluffDeck.pending = null;
      RenderScheduler.defer(shooting ? "bluff-shoot-send-failed" : "bluff-challenge-send-failed");
      return false;
    }
    incrementMetric("bluffSendRequested");
    setStatus(shooting ? "SENDING SHOOT..." : "SENDING CHALLENGE...");
    RenderScheduler.defer(shooting ? "bluff-shoot-send" : "bluff-challenge-send");
    scheduleBluffPendingDeadline(State.bluffDeck.pending);
    return true;
  }
  function sendBluffShoot() {
    return sendBluffChallenge();
  }
  const BluffDeckActions = {
    sendStart: sendBluffDeckStart,
    sendEnd: sendBluffDeckEnd,
    selectMask: selectBluffMask,
    sendPlay: sendBluffPlay,
    sendChallenge: sendBluffChallenge,
    sendShoot: sendBluffShoot,
  };
  const BluffDeckCommandReducer = {
    decode: decodeBluffDeckCommand,
    applyRecord: applyBluffDeckRecord,
    buildStart: buildBluffDeckStart,
    buildPlay: buildBluffDeckPlay,
    buildChallenge: buildBluffDeckChallenge,
    buildShoot: buildBluffDeckShoot,
    buildEnd: buildBluffDeckEnd,
  };

  function applyChatRecord(record) {
    const message = String(record && record.message || "").trim();
    if (message.slice(0, 4).toLowerCase() === "bd1 ") return BluffDeckCommandReducer.applyRecord(record);
    return applyPokerCommand(decodePokerCommand(record)) || ignoredCommandEffect("record");
  }

  function applyChatPayload(event, suppressRender) {
    PokerMetrics.increment("chatPayload");
    if (event && event.action === "snapshot") PokerMetrics.increment("chatSnapshotReplay");
    if (!event) return applyReducerEffect(ignoredCommandEffect("payload"), !!suppressRender);
    if (event.action === "snapshot" && event.messages && event.messages.length) restoreBluffDeckCandidate(event.messages);
    if (event.messages && event.messages.length) {
      const wasReplayingSnapshot = State.replayingChatSnapshot;
      let aggregate = ignoredCommandEffect("payload");
      State.replayingChatSnapshot = event.action === "snapshot";
      try {
        for (let i = 0; i < event.messages.length; i += 1) {
          const message = event.messages[i];
          if (message.seq && message.seq <= State.processedChatSeq) continue;
          State.processedChatSeq = Math.max(State.processedChatSeq, message.seq || 0);
          aggregate = mergeCommandEffects(aggregate, applyChatRecord(message));
        }
      } finally {
        State.replayingChatSnapshot = wasReplayingSnapshot;
      }
      return applyReducerEffect(aggregate, !!suppressRender);
    }
    if (event.seq && event.seq <= State.processedChatSeq) return applyReducerEffect(ignoredCommandEffect("old-seq"), !!suppressRender);
    State.processedChatSeq = Math.max(State.processedChatSeq, event.seq || 0);
    return applyReducerEffect(applyChatRecord(event), !!suppressRender);
  }

  const CommandReducer = {
    decode: decodePokerCommand,
    applyRecord: applyChatRecord,
    applyPayload: applyChatPayload,
  };

  function sendAction(command, label) {
    const current = getCurrentPlayer();
    const local = getLocalPlayer();
    const decoded = PokerEngine.decodeAction(command);
    const turn = PokerEngine.actions(State.game, current && current.key, local && local.key);
    const status = turn.invalidStatus(decoded);
    if (status) {
      setStatus(status);
      RenderScheduler.immediate("send-action-invalid");
      return;
    }
    recordLocalActionEcho(command, local, State.game);
    log("action click label=" + (label || command) + " command=" + command + " phase=" + (State.game.phase || "") + " current=" + current.name + " toCall=" + turn.toCall);
    sendChatMessage(command);
  }

  function renderCommunity(model) {
    if (!isValid(State.community)) return;
    State.renderCache.communityCards = State.renderCache.communityCards || {};
    Rows.update(State.renderCache.communityCards, State.community, model.communityRows, RowSpecs.communityCard);
  }

  function getPlayerChipText(game, player, index) {
    let text = "$" + (player.stack || 0);
    if (player.bet) {
      const isBlind = game &&
        game.phase === "preflop" &&
        (index === game.smallBlindIndex || index === game.bigBlindIndex) &&
        player.committed === player.bet;
      text += isBlind ? "  blind $" + player.bet : "  bet $" + player.bet;
    }
    if (player.committed && player.committed !== player.bet) text += "  committed $" + player.committed;
    return text;
  }

  function getPotChipArtSrc(asset) {
    return "s2r://panorama/images/poker/chips/" + asset;
  }

  function getPotChipArtRows(amount) {
    let remaining = Math.max(0, Math.floor(Number(amount) || 0));
    const out = [];
    for (let i = 0; i < POT_CHIP_ART_TIERS.length; i += 1) {
      const tier = POT_CHIP_ART_TIERS[i];
      const count = Math.floor(remaining / tier.value);
      if (!count) continue;
      out.push({ key: String(tier.value), value: tier.value, className: tier.className, asset: tier.asset, label: tier.label, count: count });
      remaining -= count * tier.value;
    }
    return out;
  }

  function setPotAmountText(amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    setText(State.pot, "POT $" + value);
    setText(State.potCenterAmount, "$" + value);
  }

  function stepPotAmount(token) {
    if (token !== State.renderCache.potAnimationToken || !shouldRunMenuWork()) return;
    const current = Math.max(0, Math.floor(Number(State.renderCache.potDisplayValue) || 0));
    const target = Math.max(0, Math.floor(Number(State.renderCache.potDisplayTarget) || 0));
    if (current === target) {
      setPotAmountText(target);
      return;
    }
    const delta = target - current;
    const step = Math.max(1, Math.ceil(Math.abs(delta) / 16));
    const next = delta > 0 ? Math.min(target, current + step) : Math.max(target, current - step);
    State.renderCache.potDisplayValue = next;
    setPotAmountText(next);
    if (next === target) return;
    try {
      $.Schedule(0.035, () => stepPotAmount(token));
    } catch (e) {
      State.renderCache.potDisplayValue = target;
      setPotAmountText(target);
    }
  }

  function animatePotAmount(amount) {
    const target = Math.max(0, Math.floor(Number(amount) || 0));
    if (!State.renderCache.potDisplayInitialized) {
      State.renderCache.potDisplayInitialized = true;
      State.renderCache.potDisplayValue = target;

      State.renderCache.potDisplayTarget = target;
      setPotAmountText(target);
      return;
    }
    if (State.renderCache.potDisplayTarget === target && State.renderCache.potDisplayValue === target) {
      setPotAmountText(target);
      return;
    }
    State.renderCache.potDisplayTarget = target;
    State.renderCache.potAnimationToken += 1;
    const token = State.renderCache.potAnimationToken;
    setPotAmountText(State.renderCache.potDisplayValue);
    try {
      $.Schedule(0.035, () => stepPotAmount(token));
    } catch (e) {
      State.renderCache.potDisplayValue = target;
      setPotAmountText(target);
    }
  }

  function renderPotCenter(model) {
    if (!isValid(State.potCenter)) return;
    const pot = model.pot;
    animatePotAmount(pot.amount);
    if (!isValid(State.potChips)) return;
    setPanelClass(State.potChips, CLASSES.hidden, pot.chips.length === 0);
    State.renderCache.potChipRows = State.renderCache.potChipRows || {};
    Rows.update(State.renderCache.potChipRows, State.potChips, pot.chips, RowSpecs.potChip);
  }

  function makeRenderPlayer(key, name, stack, result) {
    return { key: key, name: name, stack: stack, bet: 0, cards: [], folded: false, result: result || "" };
  }

  function createHoleCards(parent) {
    return [createCard(parent, null, true), createCard(parent, null, true)];
  }
  function removeTableSeatCards(row) {
    if (!row || !row.cardsParent) return;
    deletePanel(row.cardsParent);
    row.cardsParent = null;
    row.cards = [];
  }

  function ensureTableSeatCards(row, count) {
    const desired = Math.max(0, Math.min(5, Number(count) || 0));
    if (!row || !row.seat || desired === 0) {
      if (row) removeTableSeatCards(row);
      return [];
    }
    if (!isValid(row.cardsParent)) {
      row.cardsParent = createPanel("Panel", row.seat, "", "PokerTableSeatCards");
      row.cards = [];
    }
    while (row.cards.length < desired) row.cards.push(createCard(row.cardsParent, null, true));
    while (row.cards.length > desired) deletePanel(row.cards.pop());
    return row.cards;
  }

  function updateTableSeatCards(row, model) {
    const mode = model && model.cardMode ? model.cardMode : "hole-cards";
    const count = mode === "none" ? 0 : (mode === "public-count" ? model.publicCardCount : (mode === "hole-cards" ? 2 : 0));
    const cards = ensureTableSeatCards(row, count);
    for (let i = 0; i < cards.length; i += 1) updateCardPanel(cards[i], model && model.cards && model.cards[i] || null, true);
  }

  function updateRenderedCardModels(cards, models) {
    updateCardPanel(cards[0], models && models[0] || null, true);
    updateCardPanel(cards[1], models && models[1] || null, true);
  }

  function applyRenderClasses(panel, classes) {
    classes = classes || {};
    setPanelClass(panel, CLASSES.current, !!classes.current);
    setPanelClass(panel, CLASSES.folded, !!classes.folded);
    setPanelClass(panel, CLASSES.eliminated, !!classes.eliminated);
    setPanelClass(panel, CLASSES.winner, !!classes.winner);
  }

  function getPlayerRenderSource(snapshot) {
    const state = snapshot || {};
    const game = state.game !== undefined ? state.game : State.game;
    if (game && game.players.length) return game.players.slice(0, MAX_TABLE_PLAYERS);
    const resume = state.resume || State.resume;
    if (resume && resume.payload && resume.payload.roster && resume.payload.roster.length) {
      const roster = [];
      for (let i = 0; i < resume.payload.roster.length; i += 1) {
        const entry = resume.payload.roster[i];
        const key = normalizePlayerKey(entry.key || entry.name);
        const stack = getProgressBankroll(resume.payload, key);
        if (!key || stack <= 0) continue;
        let playerState = "WAITING";
        if (resume.leaderKey === key) playerState = "LEADER";
        else if (resume.ready && resume.ready[key]) playerState = "READY";
        roster.push(makeRenderPlayer(key, entry.name || key, stack, playerState));
      }
      if (roster.length) return roster;
    }
    const readySource = state.readySeats || getReadySeatArray();
    const readySeats = readySource.map((seat) => makeRenderPlayer(normalizePlayerKey(seat.name), seat.name, STARTING_STACK));
    if (readySeats.length) return readySeats;
    const party = state.party || ensureParty();
    if (!State.requiresProgressImport && !(resume && resume.id) && party && party.order && party.order.length >= MIN_READY_PLAYERS) {
      const roster = [];
      for (let i = 0; i < party.order.length; i += 1) {
        const key = normalizePlayerKey(party.order[i]);
        const member = party.members && party.members[key];
        if (!key || !member) continue;
        roster.push(makeRenderPlayer(key, member.name || key, STARTING_STACK, party.leaderKey === key ? "LEADER" : "JOINED"));
      }
      if (roster.length) return roster;
    }
    return readySeats;
  }

  function shouldRevealPlayerCards(game, player) {
    return !!(player.cards && player.cards.length && (!game || !game.active || player.key === State.localPlayerKey));
  }

  function getPlayerStateText(game, player, index) {
    return player.left ? "LEFT / FOLD" : (player.folded ? "FOLD" : player.result || (game && game.active && index === game.currentIndex ? (player.key === State.localPlayerKey ? "YOUR TURN" : "TURN") : ""));
  }

  function renderPlayers(viewModel) {
    if (!isValid(State.players)) return;
    const metricStarted = PokerMetrics.start("renderPlayers");
    const rows = viewModel && viewModel.playerRows ? viewModel.playerRows : [];
    State.renderCache.playerRows = State.renderCache.playerRows || {};
    Rows.update(State.renderCache.playerRows, State.players, rows, RowSpecs.player);
    PokerMetrics.end("renderPlayers", metricStarted);
  }

  function buildSharedPlayerProjection(game, player, index) {
    const key = player.key || normalizePlayerKey(player.name) || ("seat" + index);
    const winners = game && game.potWinnerKeys;
    return {
      key: key,
      name: player.name || "Player",
      stackText: getPlayerChipText(game, player, index),
      stateText: getPlayerStateText(game, player, index),
      cards: shouldRevealPlayerCards(game, player) ? [player.cards && player.cards[0] || null, player.cards && player.cards[1] || null] : [null, null],
      classes: {
        current: !!(game && game.active && index === game.currentIndex),
        folded: !!player.folded,
        eliminated: player.stack <= 0,
        winner: !!(key && winners && winners[key]),
      },
    };
  }

  function buildPlayerRenderModelForState(state) {
    const snapshot = state || {};
    const game = snapshot.game !== undefined ? snapshot.game : State.game;
    const source = getPlayerRenderSource(snapshot);
    const rows = [];
    for (let i = 0; i < source.length; i += 1) rows.push(buildSharedPlayerProjection(game, source[i], i));
    return rows;
  }

  function buildTableRenderModelForState(state, playerRows) {
    const snapshot = state || {};
    const game = snapshot.game !== undefined ? snapshot.game : State.game;
    const projections = playerRows || buildPlayerRenderModelForState(snapshot);
    const visible = projections.slice(0, TABLE_EDGE_SEAT_LIMIT);
    const densityClass = visible.length <= 6 ? "SeatScaleLarge" : (visible.length <= 8 ? "SeatScaleMedium" : "SeatScaleCompact");
    const rows = [];
    for (let i = 0; i < visible.length; i += 1) {
      const projection = visible[i];
      rows.push({
        key: projection.key,
        name: projection.name,
        initial: getPlayerInitial(projection.name),
        stackText: projection.stackText,
        stateText: projection.stateText,
        cardMode: "hole-cards",
        cards: projection.cards,
        positionClass: getTableSeatPositionClass(i, Math.min(projections.length, TABLE_EDGE_SEAT_LIMIT)),
        densityClass: densityClass,
        classes: projection.classes,
      });
    }
    return {
      rows: rows,
      arrowClass: game && game.active && game.currentIndex >= 0 ? getTableSeatPositionClass(game.currentIndex, Math.min(visible.length, TABLE_EDGE_SEAT_LIMIT)) : "",
      hidden: !game,
    };
  }

  function getRowPanel(row) {
    return row && (row.panel || row.row || row.seat || row);
  }

  function moveRowBefore(parent, panel, index) {
    if (!parent || !panel) return;
    let sibling = null;
    try {
      sibling = typeof parent.GetChild === "function" ? parent.GetChild(index) : null;
    } catch (e) {}
    if (sibling === panel) return;
    try {
      if (sibling && typeof parent.MoveChildBefore === "function") {
        parent.MoveChildBefore(panel, sibling);
        return;
      }
      if (!sibling && typeof parent.MoveChildToFront === "function") {
        parent.MoveChildToFront(panel);
        return;
      }
    } catch (eMove) {}
    if (!Array.isArray(parent.children)) return;
    const children = parent.children;
    const currentIndex = children.indexOf(panel);
    if (currentIndex < 0) return;
    children.splice(currentIndex, 1);
    const targetIndex = Math.min(index, children.length);
    children.splice(targetIndex, 0, panel);
  }

  const Rows = {
    update: function (cache, parent, models, spec) {
      if (!cache || !parent || !spec) return;
      const rows = models || [];
      const seen = {};
      const ordered = [];
      for (let i = 0; i < rows.length; i += 1) {
        const model = rows[i] || {};
        const key = String(model.key || ("row" + i));
        seen[key] = true;
        let row = cache[key];
        if (!row || !isValid(getRowPanel(row))) {
          row = spec.create(parent, model, i);
          cache[key] = row;
        }
        spec.update(row, model, i);
        ordered.push(row);
      }
      const cachedKeys = Object.keys(cache);
      for (let i = 0; i < cachedKeys.length; i += 1) {
        const key = cachedKeys[i];
        if (seen[key]) continue;
        spec.remove(cache[key]);
        delete cache[key];
      }
      for (let i = 0; i < ordered.length; i += 1) moveRowBefore(parent, getRowPanel(ordered[i]), i);
    },
  };

  const RowSpecs = {
    seat: {
      create: (parent, model) => {
        const row = createPanel("Panel", parent, (model.idPrefix || "PokerSeat") + model.key, "PokerSeatRow");
        return { row: row, number: createLabel(row, "PokerSeatNumber", ""), name: createLabel(row, "PokerSeatName", ""), meta: createLabel(row, "PokerSeatMeta", "") };
      },
      update: (row, model) => {
        setPanelClass(row.row, "Empty", !!model.empty);
        setText(row.number, model.empty ? "" : model.number);
        setText(row.name, model.name);
        setText(row.meta, model.meta);
      },
      remove: (row) => deletePanel(row && row.row),
    },
    communityCard: {
      create: (parent) => createCard(parent, null, false),
      update: (panel, model) => updateCardPanel(panel, model.card || null, false),
      remove: (panel) => deletePanel(panel),
    },
    potChip: {
      create: (parent, model) => {
        const panel = createPanel("Panel", parent, "", "PokerPotChip " + model.className);
        return { panel: panel, image: createPanel("Image", panel, "", "PokerPotChipImage"), count: createLabel(panel, "PokerPotChipCount", "") };
      },
      update: (row, model) => {
        if (!row || !model) return;
        setPanelClass(row.panel, model.className, true);
        setImageSource(row.image, getPotChipArtSrc(model.asset));
        setText(row.count, model.count > 1 ? "x" + model.count : "");
      },
      remove: (row) => deletePanel(row && row.panel),
    },
    player: {
      create: (parent) => {
        const row = createPanel("Panel", parent, "", "PokerPlayerRow");
        const info = createPanel("Panel", row, "", "PokerPlayerInfo");
        return { row: row, name: createLabel(info, "PokerPlayerName", ""), stack: createLabel(info, "PokerPlayerStack", ""), cards: createHoleCards(createPanel("Panel", row, "", "PokerHoleCards")), state: createLabel(row, "PokerPlayerState", "") };
      },
      update: (row, model) => {
        applyRenderClasses(row.row, model.classes);
        setText(row.name, model.name || "Player");
        setText(row.stack, model.stackText);
        updateRenderedCardModels(row.cards, model.cards);
        setText(row.state, model.stateText);
      },
      remove: (row) => deletePanel(row && row.row),
    },
    tableSeat: {
      create: (parent) => {
        const seat = createPanel("Panel", parent, "", "PokerTableSeat");
        const row = createPanel("Panel", seat, "", "PokerTableSeatMetaRow");
        const avatar = createPanel("Panel", row, "", "PokerTableSeatAvatar");
        const text = createPanel("Panel", row, "", "PokerTableSeatText");
        return { seat: seat, avatarLabel: createLabel(avatar, "", ""), name: createLabel(text, "PokerTableSeatName", ""), stack: createLabel(text, "PokerTableSeatStack", ""), state: createLabel(text, "PokerTableSeatState", ""), cardsParent: null, cards: [], positionClass: "", densityClass: "" };
      },
      update: (row, model) => {
        const seat = row.seat;
        applyRenderClasses(seat, model.classes);
        if (row.positionClass !== model.positionClass) {
          if (row.positionClass) setPanelClass(seat, row.positionClass, false);
          if (model.positionClass) setPanelClass(seat, model.positionClass, true);
          row.positionClass = model.positionClass || "";
        }
        if (row.densityClass !== model.densityClass) {
          if (row.densityClass) setPanelClass(seat, row.densityClass, false);
          if (model.densityClass) setPanelClass(seat, model.densityClass, true);
          row.densityClass = model.densityClass || "";
        }
        setText(row.avatarLabel, model.initial);
        setText(row.name, model.name || "Player");
        setText(row.stack, model.stackText);
        setText(row.state, model.stateText);
        updateTableSeatCards(row, model);
      },
      remove: (row) => deletePanel(row && row.seat),
    },
    actionButton: {
      create: (parent, choice) => {
        const button = createPanel("Button", parent, "", choice.className || "PokerActionButton");
        return { panel: button, button: button, label: createLabel(button, "PokerActionButtonLabel", ""), lastCommand: "", lastLabel: "", lastEnabled: null, lastReadOnly: null };
      },
      update: (row, choice) => {
        const enabled = choice.enabled !== false;
        const readOnly = !!choice.readOnly;
        applyButtonAffordance(row.button, { enabled: enabled, hidden: false, eligible: enabled, readOnly: readOnly });
        setText(row.label, choice.label);
        const changed = row.lastCommand !== choice.command || row.lastLabel !== choice.label || row.lastEnabled !== enabled || row.lastReadOnly !== readOnly;
        if (changed) {
          try {
            if (enabled && !readOnly) row.button.SetPanelEvent("onactivate", () => choice.customBet ? sendCustomBetAction(choice) : sendAction(choice.command, choice.label));
            else if (row.button.onactivate) delete row.button.onactivate;
          } catch (e) {}
          row.lastCommand = choice.command;
          row.lastLabel = choice.label;
          row.lastEnabled = enabled;
          row.lastReadOnly = readOnly;
        }
      },
      remove: (row) => deletePanel(row && row.button),
    },
    log: {
      create: (parent) => createLabel(parent, "PokerLogLine", ""),
      update: (row, model) => setText(row, model.text),
      remove: (row) => deletePanel(row),
    },
    bluffText: {
      create: (parent, model) => ({ panel: createLabel(parent, model.className || "", ""), className: "" }),
      update: (row, model) => {
        const nextClasses = String(model.className || "").split(/\s+/).filter(Boolean);
        const oldClasses = row.className ? row.className.split(/\s+/).filter(Boolean) : [];
        for (let i = 0; i < oldClasses.length; i += 1) setPanelClass(row.panel, oldClasses[i], false);
        for (let i = 0; i < nextClasses.length; i += 1) setPanelClass(row.panel, nextClasses[i], true);
        row.className = nextClasses.join(" ");
        setText(row.panel, model.text);
      },
      remove: (row) => deletePanel(row && row.panel),
    },
    bluffPlayedCard: {
      create: (parent) => {
        const panel = createPanel("Panel", parent, "", "BluffDeckPlayedCard");
        return { panel: panel, rank: null, art: createCardArt(panel, null), className: "" };
      },
      update: (row, model) => {
        const nextClasses = String(model.className || "").split(/\s+/).filter(Boolean);
        const oldClasses = row.className ? row.className.split(/\s+/).filter(Boolean) : [];
        for (let i = 0; i < oldClasses.length; i += 1) setPanelClass(row.panel, oldClasses[i], false);
        for (let i = 0; i < nextClasses.length; i += 1) setPanelClass(row.panel, nextClasses[i], true);
        row.className = nextClasses.join(" ");
        if (model.revealed && !row.rank) row.rank = createLabel(row.panel, "PokerCardRank", "");
        if (row.rank) setText(row.rank, model.rankLabel || "");
        setImageSource(bluffPanelChild(row.art, 0), model.rank ? getCardImageSrc({ rank: model.rank }) : "");
      },
      remove: (row) => deletePanel(row && row.panel),
    },
  };
  function getTableSeatPositionClass(index, count) {
    const visibleCount = Math.min(TABLE_EDGE_SEAT_LIMIT, Math.max(1, count || 1));
    const layout = TABLE_SEAT_LAYOUTS[visibleCount] || TABLE_SEAT_LAYOUTS[TABLE_EDGE_SEAT_LIMIT];
    return layout[index] || "";
  }

  function getPlayerInitial(name) {
    const text = String(name || "P").trim();
    return text ? text.charAt(0).toUpperCase() : "P";
  }

  function renderTableTurnArrow(parent, cache, positionClass) {
    if (!isValid(parent)) return;
    const nextClass = positionClass || "";
    if (!isValid(cache.arrow)) {
      cache.arrow = createPanel("Panel", parent, "", "PokerTableTurnArrow PokerHidden");
      cache.arrowClass = "";
    }
    const arrow = cache.arrow;
    if (cache.arrowClass !== nextClass) {
      if (cache.arrowClass) setPanelClass(arrow, cache.arrowClass, false);
      if (nextClass) setPanelClass(arrow, nextClass, true);
      cache.arrowClass = nextClass;
    }
    setPanelClass(arrow, CLASSES.hidden, !nextClass);
  }

  const TableSeatRenderer = (() => {
    const entries = [];
    function cacheFor(parent) {
      for (let i = 0; i < entries.length; i += 1) {
        if (entries[i].parent === parent) return entries[i];
      }
      const entry = { parent: parent, rows: {}, arrow: null, arrowClass: "" };
      entries.push(entry);
      return entry;
    }
    return {
      render: (parent, rows, arrowClass) => {
        if (!isValid(parent)) return;
        const cache = cacheFor(parent);
        Rows.update(cache.rows, parent, rows || [], RowSpecs.tableSeat);
        renderTableTurnArrow(parent, cache, arrowClass);
      },
      reset: () => {
        entries.length = 0;
      },
    };
  })();

  function renderTableSeats(viewModel) {
    if (!isValid(State.tableSeats)) return;
    const metricStarted = PokerMetrics.start("renderTableSeats");
    const model = viewModel.table;
    TableSeatRenderer.render(State.tableSeats, model.rows, model.arrowClass);
    PokerMetrics.end("renderTableSeats", metricStarted);
  }

  function clampCustomBetAmount(value, range) {
    const amount = Math.floor(Number(value));
    if (!range || !isFinite(amount)) return range ? range.min : 0;
    return Math.max(range.min, Math.min(range.max, amount));
  }

  function parseCustomBetInput(text) {
    const raw = String(text == null ? "" : text).replace(/[$,]/g, "").trim();
    if (!raw) return { hasInput: false, amount: 0, validNumber: false };
    const amount = Math.floor(Number(raw));
    return { hasInput: true, amount: amount, validNumber: isFinite(amount) };
  }

  function getCustomBetDraft(range) {
    const controls = State.renderCache.customBetControls || {};
    const input = controls.input;
    const slider = controls.slider;
    const parsed = parseCustomBetInput(input && input.text);
    let amount = parsed.amount;
    let validNumber = parsed.validNumber;
    if (!parsed.hasInput && slider && isFinite(Number(slider.value))) {
      amount = Math.floor(Number(slider.value));
      validNumber = true;
    }
    const legal = validNumber && !!(range && range.isLegal && range.isLegal(amount));
    return {
      amount: amount,
      legal: legal,
      invalid: !legal,
    };
  }

  function setCustomBetIllegal(controls, illegal) {
    if (!controls) return;
    setPanelClass(controls.root, "Illegal", !!illegal);
    setPanelClass(controls.input, "Illegal", !!illegal);
    setPanelClass(controls.value, "Illegal", !!illegal);
    setPanelClass(controls.range, "Illegal", !!illegal);
  }

  function setCustomBetSliderValue(slider, amount) {
    if (!slider || !isFinite(amount)) return;
    try {
      if (Math.floor(Number(slider.value)) === amount) return;
    } catch (e) {}
    State.renderCache.customBetSliderSyncing = true;
    try {
      if (typeof slider.SetValueNoEvents === "function") {
        slider.SetValueNoEvents(amount);
      } else {
        slider.value = amount;
      }
    } catch (eSet) {
    } finally {
      State.renderCache.customBetSliderSyncing = false;
    }
  }

  function updateCustomBetVisuals(range, skipSliderSync) {
    const controls = State.renderCache.customBetControls;
    if (!controls || !range) return;
    const draft = getCustomBetDraft(range);
    const displayAmount = draft.legal ? draft.amount : clampCustomBetAmount(draft.amount, range);
    if (draft.legal) State.renderCache.customBetValue = displayAmount;
    setText(controls.value, range.label(displayAmount));
    setText(controls.range, "MIN $" + range.min + "  MAX $" + range.max);
    setCustomBetIllegal(controls, draft.invalid);
    if (!skipSliderSync && !State.renderCache.customBetSliderSyncing && controls.slider && isFinite(displayAmount)) {
      setCustomBetSliderValue(controls.slider, displayAmount);
    }
  }

  function ensureCustomBetControls(parent) {
    let controls = State.renderCache.customBetControls;
    if (controls && isValid(controls.root) && controls.root.GetParent && controls.root.GetParent() !== parent) {
      deletePanel(controls.root);
      controls = null;
      State.renderCache.customBetControls = null;
    }
    if (controls && isValid(controls.root)) return controls;
    const root = createPanel("Panel", parent || State.actions, "", "PokerCustomBetControls");
    const head = createPanel("Panel", root, "", "PokerCustomBetHead");
    const title = createLabel(head, "PokerCustomBetTitle", "");
    const input = createPanel("TextEntry", head, "", "PokerCustomBetInput");
    const value = createLabel(head, "PokerCustomBetValue", "");
    const sliderRow = createPanel("Panel", root, "", "PokerCustomBetSliderRow");
    const minus = createLabel(sliderRow, "PokerCustomBetStepLabel", "-");
    const slider = createPanel("Slider", sliderRow, "", "PokerCustomBetSlider HorizontalSlider", { direction: "horizontal" });
    const plus = createLabel(sliderRow, "PokerCustomBetStepLabel", "+");
    const range = createLabel(root, "PokerCustomBetRange", "");
    controls = {
      root: root,
      head: head,
      title: title,
      input: input,
      value: value,
      sliderRow: sliderRow,
      minus: minus,
      slider: slider,
      plus: plus,
      range: range,
    };
    State.renderCache.customBetControls = controls;
    try {
      input.SetPanelEvent("ontextentrychange", () => updateCustomBetVisuals(State.renderCache.customBetRange));
      input.SetPanelEvent("oninputsubmit", () => sendCustomBetAction(State.renderCache.customBetChoice));
      input.SetPanelEvent("ontextentrysubmit", () => sendCustomBetAction(State.renderCache.customBetChoice));
    } catch (e) {}
    try {
      slider.SetPanelEvent("onvaluechanged", () => {
        if (State.renderCache.customBetSliderSyncing) return;
        const liveRange = State.renderCache.customBetRange;
        if (!liveRange) return;
        const amount = clampCustomBetAmount(slider.value, liveRange);
        State.renderCache.customBetSliderSyncing = true;
        State.renderCache.customBetValue = amount;
        setText(input, String(amount));
        State.renderCache.customBetSliderSyncing = false;
        updateCustomBetVisuals(liveRange, true);
      });
    } catch (e) {}
    return controls;
  }

  function removeCustomBetControls() {
    const controls = State.renderCache.customBetControls;
    if (controls && isValid(controls.root)) deletePanel(controls.root);
    State.renderCache.customBetControls = null;
    State.renderCache.customBetChoice = null;
    State.renderCache.customBetRange = null;
    State.renderCache.customBetRangeKey = "";
  }

  function renderCustomBetControls(choice, parent) {
    if (!choice || !choice.customBet || choice.readOnly || choice.enabled === false) {
      removeCustomBetControls();
      return;
    }
    const range = choice.customBet;
    const controls = ensureCustomBetControls(parent || State.actions);
    State.renderCache.customBetChoice = choice;
    State.renderCache.customBetRange = range;
    setText(controls.title, range.action === "bet" ? "Custom bet" : "Custom raise");
    const rangeKey = range.action + "|" + range.min + "|" + range.max + "|" + range.step;
    const previousValue = State.renderCache.customBetValue || range.value || range.min;
    const amount = clampCustomBetAmount(previousValue, range);
    if (State.renderCache.customBetRangeKey !== rangeKey) {
      State.renderCache.customBetRangeKey = rangeKey;
      setText(controls.input, String(amount));
      try {
        controls.slider.min = range.min;
        controls.slider.max = range.max;
        controls.slider.increment = range.step;
        setCustomBetSliderValue(controls.slider, amount);
      } catch (e) {}
    }
    updateCustomBetVisuals(range);
  }

  function sendCustomBetAction(choice) {
    const range = choice && choice.customBet ? choice.customBet : State.renderCache.customBetRange;
    const controls = State.renderCache.customBetControls;
    const draft = getCustomBetDraft(range);
    if (!draft.legal) {
      setCustomBetIllegal(controls, true);
      if (range) setStatus(range.invalidStatus());
      return;
    }
    State.renderCache.customBetValue = draft.amount;
    sendAction(range.command(draft.amount), range.label(draft.amount));
  }

  function getActionButtonParent() {
    if (!isValid(State.renderCache.actionButtonRow)) {
      State.renderCache.actionButtonRow = createPanel("Panel", State.actions, "", "PokerActionButtonRow");
    }
    return isValid(State.renderCache.actionButtonRow) ? State.renderCache.actionButtonRow : State.actions;
  }

  function renderActions(buttonState) {
    if (!isValid(State.actions)) return;
    const metricStarted = PokerMetrics.start("renderActions");
    const state = buttonState;
    State.renderCache.actionButtons = State.renderCache.actionButtons || {};
    applyHiddenAffordance(State.actions, state.controls.actionContainer.hidden);
    const buttonParent = getActionButtonParent();
    if (state.controls.actionContainer.hidden) {
      Rows.update(State.renderCache.actionButtons, buttonParent, [], RowSpecs.actionButton);
      if (isValid(State.renderCache.actionHint)) deletePanel(State.renderCache.actionHint);
      State.renderCache.actionHint = null;
      removeCustomBetControls();
      PokerMetrics.end("renderActions", metricStarted);
      return;
    }

    const choices = state.actions.rows;
    const hasButtons = choices.length > 0;
    const hasHint = !!state.actions.hint && !hasButtons;
    if (hasHint) {
      if (!isValid(State.renderCache.actionHint)) {
        State.renderCache.actionHint = createLabel(State.actions, "PokerActionHint", "");
      }
      setText(State.renderCache.actionHint, state.actions.hint);
    } else if (isValid(State.renderCache.actionHint)) {
      deletePanel(State.renderCache.actionHint);
      State.renderCache.actionHint = null;
    }

    applyHiddenAffordance(buttonParent, !hasButtons);
    let customBetChoice = null;
    for (let i = 0; i < choices.length; i += 1) {
      if (choices[i] && choices[i].customBet) {
        customBetChoice = choices[i];
        break;
      }
    }
    Rows.update(State.renderCache.actionButtons, buttonParent, choices, RowSpecs.actionButton);
    if (customBetChoice) renderCustomBetControls(customBetChoice, buttonParent);
    else removeCustomBetControls();
    PokerMetrics.end("renderActions", metricStarted);
  }

  function renderLog(model) {
    if (!isValid(State.log)) return;
    const metricStarted = PokerMetrics.start("renderLog");
    setPanelClass(State.log, CLASSES.hidden, !model.hasGame);
    State.renderCache.logRows = State.renderCache.logRows || {};
    Rows.update(State.renderCache.logRows, State.log, model.logRows, RowSpecs.log);
    PokerMetrics.end("renderLog", metricStarted);
  }

  function invalidateRenderer(reason) {
    resetRenderChildCache();
    State.renderCache.renderReason = reason || "";
    return true;
  }

  function bluffPanelChild(panel, index) {
    try { return panel && typeof panel.GetChild === "function" ? panel.GetChild(index) : null; } catch (e) { return null; }
  }
  function renderBluffTargetCard(target) {
    const face = bluffPanelChild(State.bluffTargetCard, 0);
    if (!isValid(face)) return;
    if (!State.renderCache.bluffTargetRank) {
      const fallback = bluffPanelChild(face, 0);
      if (isValid(fallback)) setPanelClass(fallback, CLASSES.hidden, true);
      State.renderCache.bluffTargetRank = createLabel(face, "PokerCardRank", "");
      State.renderCache.bluffTargetArt = createCardArt(face, target ? { rank: target } : null);
    }
    setText(State.renderCache.bluffTargetRank, target || "?");
    setImageSource(bluffPanelChild(State.renderCache.bluffTargetArt, 0), target ? getCardImageSrc({ rank: target }) : "");
  }
  function bluffSlotContents(button) {
    if (!isValid(button) || typeof button.GetChildCount !== "function") return null;
    try {
      for (let i = 0; i < button.GetChildCount(); i += 1) {
        const child = button.GetChild(i);
        if (child && child.BHasClass && child.BHasClass("BluffDeckSlotContents")) return child;
      }
    } catch (e) {}
    return createPanel("Panel", button, "", "BluffDeckSlotContents PokerCardContents");
  }
  function bluffSlotGlyph(button, index) {
    State.renderCache.bluffSlotGlyphs = State.renderCache.bluffSlotGlyphs || [];
    if (isValid(State.renderCache.bluffSlotGlyphs[index])) return State.renderCache.bluffSlotGlyphs[index];
    const contents = bluffSlotContents(button);
    let glyph = null;
    if (isValid(contents) && typeof contents.GetChildCount === "function") {
      try {
        for (let i = 0; i < contents.GetChildCount(); i += 1) {
          const child = contents.GetChild(i);
          if (child && child.BHasClass && child.BHasClass("BluffDeckSlotRankGlyph")) {
            glyph = child;
            break;
          }
        }
      } catch (e) {}
    }
    if (!glyph) glyph = createLabel(isValid(contents) ? contents : button, "BluffDeckSlotRankGlyph", "");
    State.renderCache.bluffSlotGlyphs[index] = glyph;
    return glyph;
  }
  function bluffRankGlyph(rank) {
    return rank === BD_ACE ? "A" : rank === BD_KING ? "K" : rank === BD_QUEEN ? "Q" : rank === BD_JOKER ? "J" : "";
  }
  function projectBluffTableSeats(game, party) {
    const source = game && Array.isArray(game.players) ? game.players : bluffRosterFromParty(party);
    const rows = [];
    const count = Math.min(TABLE_EDGE_SEAT_LIMIT, source.length);
    const densityClass = count <= 6 ? "SeatScaleLarge" : (count <= 8 ? "SeatScaleMedium" : "SeatScaleCompact");
    const publicPlay = game && game.lastPlay
      && Number.isInteger(game.lastPlay.actorIndex)
      && Number.isInteger(game.lastPlay.count)
      && game.lastPlay.count >= 1 && game.lastPlay.count <= 3
      ? game.lastPlay : null;
    for (let i = 0; i < count; i += 1) {
      const player = source[i] || {};
      const key = normalizePlayerKey(player.key) || ("bluff-seat-" + i);
      const name = String(player.name || key).replace(/\s+/g, " ").trim() || "Player";
      const active = !!(game && game.active);
      const eliminated = player.status === "eliminated";
      const left = player.status === "left";
      const publicActor = !!(publicPlay && publicPlay.actorIndex === i);
      const publicCount = publicActor ? publicPlay.count : 0;
      let stateText = "WAITING";
      if (game) {
        if (eliminated) stateText = "OUT";
        else if (left) stateText = "LEFT";
        else if (game.finished && game.winnerKey === key) stateText = "WINNER";
        else if (!game.active) stateText = "MATCH ENDED";
        else if (i === game.currentIndex) stateText = "TURN";
      }
      if (publicActor) stateText = "PLAYED " + publicCount;
      const stackText = game
        ? "CARDS " + bdCount(Number(player.remainingMask) || 0) + "  RISK " + (Number(player.riskIndex) || 0) + "/6"
        : "WAITING";
      const publicCards = [];
      for (let j = 0; j < publicCount; j += 1) publicCards.push(null);
      rows.push({
        key: key,
        name: name,
        initial: getPlayerInitial(name),
        stackText: stackText,
        stateText: stateText,
        cardMode: publicActor ? "public-count" : "none",
        publicCardCount: publicCount,
        cards: publicCards,
        positionClass: getTableSeatPositionClass(i, count),
        densityClass: densityClass,
        classes: {
          current: active && i === game.currentIndex && !eliminated && !left,
          folded: false,
          eliminated: eliminated,
          winner: !!(game && game.finished && game.winnerKey === key),
        },
      });
    }
    return {
      rows: rows,
      arrowClass: game && game.active && game.currentIndex >= 0 ? getTableSeatPositionClass(game.currentIndex, count) : "",
    };
  }
  const BluffDeckSeatProjection = { project: projectBluffTableSeats };

  function bluffViewName(player) {
    return String(player && player.name || "Player").replace(/\s+/g, " ").trim().toUpperCase() || "PLAYER";
  }
  function bluffViewStateClass(game, pending, localKey, localPlayer) {
    if (pending) return "Pending";
    if (game && !game.active) return "Finished";
    if (game && game.active && (game.lastResult || game.pendingShot)) return "Challenge";
    if (game && game.active) {
      const current = game.players && game.players[game.currentIndex];
      if (current && localPlayer && current.key === localKey) return "LocalTurn";
      return "OpponentTurn";
    }
    if (localKey || (game && game.players && game.players.length)) return "Lobby";
    return "Idle";
  }
  function buildBluffDeckAnnouncement(stateClass, game, current, localKey, textProjection) {
    if (stateClass === "Pending") return { tone: "pending", title: "ACTION PENDING", body: "WAITING FOR CHAT CONFIRMATION" };
    if (stateClass === "Finished") {
      if (game && game.aborted) return { tone: "danger", title: "TABLE ENDED", body: "MATCH ENDED BY TABLE LEADER" };
      const winner = game && game.winnerKey ? bdPlayerAt(game, game.winnerKey) : null;
      return { tone: "result", title: winner ? bluffViewName(winner) + " WINS" : "MATCH COMPLETE", body: "THE BLUFF DECK MATCH IS OVER" };
    }
    if (stateClass === "Challenge") {
      const result = game && game.lastResult;
      return {
        tone: result && result.eliminated ? "danger" : "result",
        title: game && game.pendingShot ? "PULL TRIGGER" : "CHALLENGE RESULT",
        body: textProjection.resultText || "REVEAL COMPLETE",
      };
    }
    if (stateClass === "LocalTurn") {
      return { tone: "turn", title: "YOUR TURN", body: game && game.pendingShot ? "PULL TRIGGER" : "CHOOSE YOUR PLAY" };
    }
    if (stateClass === "OpponentTurn") {
      return { tone: "turn", title: current ? bluffViewName(current) + "'S TURN" : "OPPONENT TURN", body: current ? "WAITING FOR " + bluffViewName(current) : "WAITING FOR THE OTHER PLAYER" };
    }
    if (stateClass === "Lobby") return { tone: "neutral", title: "WAITING FOR PLAYERS", body: "START BLUFF WHEN 2-4 PLAYERS ARE READY" };
    return { tone: "neutral", title: "BLUFF DECK", body: "HOST OR JOIN A PARTY TO BEGIN" };
  }
  function buildBluffDeckViewModel(state) {
    const source = state && typeof state === "object" ? state : {};
    const bluffState = source.bluffDeck && typeof source.bluffDeck === "object" ? source.bluffDeck : {};
    const game = bluffState.game && typeof bluffState.game === "object" ? bluffState.game : null;
    const pending = bluffState.pending && typeof bluffState.pending === "object" ? bluffState.pending : null;
    const party = source.party && typeof source.party === "object" ? source.party : {};
    const localKey = bdPlayerKey(source.localPlayerKey || "");
    const roster = bluffRosterFromParty(party);
    const localPlayer = game ? bdPlayerAt(game, localKey) : null;
    const legalActions = game && localPlayer ? BluffDeckEngine.legalActions(game, localPlayer.key) : {};
    const selectedMask = bdValidMask(bluffState.selectedMask) ? bluffState.selectedMask : 0;
    const textProjection = BluffDeckEngine.projectText(game, {
      localPlayerKey: localKey,
      selectedMask: selectedMask,
      pending: pending,
      localPlayer: localPlayer,
      legalActions: legalActions,
    });
    const seatProjection = BluffDeckSeatProjection.project(game, party);
    const controlProjection = BluffDeckControlState.project({
      game: game,
      legal: legalActions,
      pending: pending,
      party: party,
      roster: roster,
      localKey: localKey,
      localPlayer: localPlayer,
      selectedMask: selectedMask,
      isLeader: !!(localKey && party.leaderKey && bdPlayerKey(party.leaderKey) === localKey),
      otherActive: !!(source.game && source.game.active),
    });
    const stateClass = bluffViewStateClass(game, pending, localKey, localPlayer);
    const current = game && game.players && game.players[game.currentIndex] ? game.players[game.currentIndex] : null;
    const revealed = game && game.pendingShot && game.lastResult && Array.isArray(game.lastResult.revealed) ? game.lastResult.revealed : null;
    const playedCount = revealed ? revealed.length : (game && game.lastPlay ? game.lastPlay.count : 0);
    const played = [];
    for (let i = 0; i < playedCount; i += 1) {
      const rank = revealed ? bluffRankGlyph(revealed[i]) : "";
      const tilt = (hashString(String(game && game.id || "") + "|" + i) >>> 0) % 7;
      const className = "BluffDeckStackTilt" + tilt + (revealed ? " BluffDeckRevealCount" + playedCount + " BluffDeckRevealSlot" + i + " Revealed" : " CardBack");
      played.push({ key: "played-" + i, rank: rank, rankLabel: revealed ? (rank ? BD_LABELS[revealed[i]] : "JOKER") : "", revealed: !!revealed, className: className });
    }
    const slots = [];
    for (let i = 0; i < 5; i += 1) {
      const hasCard = !!(localPlayer && Array.isArray(localPlayer.hand) && i < localPlayer.hand.length && (localPlayer.remainingMask & (1 << i)) !== 0);
      const rank = hasCard ? bluffRankGlyph(localPlayer.hand[i]) : "";
      const selected = hasCard && (selectedMask & (1 << i)) !== 0;
      slots.push({ key: "slot-" + i, rank: rank, valid: hasCard, selected: selected, disabled: !hasCard || !!pending || stateClass !== "LocalTurn" });
    }
    const minCards = Number.isInteger(legalActions.minCards) ? legalActions.minCards : 1;
    const maxCards = Number.isInteger(legalActions.maxCards) ? legalActions.maxCards : 3;
    let actionHint = "HOST OR JOIN A PARTY";
    if (stateClass === "Pending") actionHint = "ACTION LOCKED UNTIL CHAT CONFIRMS";
    else if (stateClass === "Finished") actionHint = "MATCH COMPLETE";
    else if (stateClass === "Lobby") actionHint = "START BLUFF WHEN 2-4 PLAYERS ARE READY";
    else if (stateClass === "OpponentTurn") actionHint = current ? "WAITING FOR " + bluffViewName(current) : "WAITING FOR THE OTHER PLAYER";
    else if (stateClass === "Challenge") actionHint = game && game.pendingShot ? "PULL TRIGGER" : "RESULT CONFIRMED";
    else if (stateClass === "LocalTurn" && legalActions.canShoot) actionHint = "PULL TRIGGER";
    else if (stateClass === "LocalTurn" && legalActions.canPlay) {
      const count = bdCount(selectedMask & (localPlayer ? localPlayer.remainingMask : 0));
      actionHint = count < minCards || count > maxCards ? "SELECT " + minCards + "-" + maxCards + " CARDS" : (legalActions.canChallenge ? "SELECT CARDS OR CALL LIE" : "SELECT CARDS TO PLAY");
    }
    const transcript = bluffState.transcript && Array.isArray(bluffState.transcript) ? bluffState.transcript.slice(-BLUFF_DECK_HISTORY_LIMIT) : [];
    const hasHistory = transcript.length > 0;
    const logTexts = hasHistory ? transcript : ["NO TURNS YET"];
    const target = game ? (game.target === BD_ACE ? "A" : game.target === BD_KING ? "K" : "Q") : "";
    const phase = game ? (game.active ? "ROUND " + game.round : "MATCH ENDED") : (party.id ? "LOBBY" : "IDLE");
    const announcement = buildBluffDeckAnnouncement(stateClass, game, current, localKey, textProjection);
    return {
      stateClass: stateClass,
      header: { title: "BLUFF DECK", phase: phase, target: target, turn: textProjection.turnText || "WAITING FOR MATCH" },
      announcement: announcement,
      seats: { rows: seatProjection.rows, arrowClass: seatProjection.arrowClass },
      cards: { targetRank: target, played: played, slots: slots },
      actions: { hint: actionHint, play: controlProjection.play, challenge: controlProjection.challenge },
      lifecycle: { host: controlProjection.host, join: controlProjection.join, leave: controlProjection.leave, start: controlProjection.start, end: controlProjection.end },
      feedback: {
        statusText: pending ? (pending.bridgeStatus === "cancelling" ? "CANCELLING..." : "SENDING...") : "",
        resultText: textProjection.resultText || (game && game.aborted ? "MATCH ENDED BY TABLE LEADER" : ""),
        previousPlayText: textProjection.previousPlayText || "",
        logRows: logTexts.map((text, index) => ({
          key: "log-" + index,
          text: (hasHistory ? String(index + 1).padStart(2, "0") + "  " : "") + text,
          className: "BluffDeckLogRow" + (hasHistory && index === logTexts.length - 1 ? " Latest" : ""),
        })),
      },
    };
  }
  const BluffDeckViewModel = { build: buildBluffDeckViewModel };
  function renderBluffDeck(model) {
    if (!model) return;
    setText(State.bluffHeader, model.header.title + " · " + model.header.phase);
    if (model.stateClass !== "LocalTurn" && State.bluffDeck && State.bluffDeck.selectedMask) {
      State.bluffDeck.selectedMask = 0;
      for (let i = 0; i < model.cards.slots.length; i += 1) model.cards.slots[i].selected = false;
    }
    setText(State.bluffAnnouncementTitle, model.announcement.title);
    setText(State.bluffAnnouncementBody, model.announcement.body);
    const previousClass = State.renderCache.bluffStateClass || ""; const stateClassPanels = [State.bluffWindow, State.bluffHistoryWindow, State.bluffAnnouncement];
    if (previousClass) for (let i = 0; i < stateClassPanels.length; i += 1) setPanelClass(stateClassPanels[i], previousClass, false);
    for (let i = 0; i < stateClassPanels.length; i += 1) setPanelClass(stateClassPanels[i], model.stateClass, true);
    State.renderCache.bluffStateClass = model.stateClass;
    setText(State.bluffTarget, "TARGET: " + (model.cards.targetRank || "—"));
    renderBluffTargetCard(model.cards.targetRank);
    setText(State.bluffTurn, model.header.turn || "WAITING FOR MATCH");
    setText(State.bluffPrevious, model.feedback.previousPlayText);
    setText(State.bluffAction, model.actions.hint);
    setText(State.bluffPending, model.feedback.statusText);
    setText(State.bluffResult, model.feedback.resultText);
    setPanelClass(State.bluffTableSeats, CLASSES.hidden, !model.seats.rows.length);
    TableSeatRenderer.render(State.bluffTableSeats, model.seats.rows, model.seats.arrowClass);
    State.renderCache.bluffLogRows = State.renderCache.bluffLogRows || {};
    State.renderCache.bluffPlayedRows = State.renderCache.bluffPlayedRows || {};
    Rows.update(State.renderCache.bluffLogRows, State.bluffLog, model.feedback.logRows, RowSpecs.bluffText);
    Rows.update(State.renderCache.bluffPlayedRows, State.bluffPlayedCards, model.cards.played, RowSpecs.bluffPlayedCard);
    const slotPanels = [State.bluffSlot0, State.bluffSlot1, State.bluffSlot2, State.bluffSlot3, State.bluffSlot4];
    for (let i = 0; i < slotPanels.length; i += 1) {
      const button = slotPanels[i];
      const slot = model.cards.slots[i] || {};
      applyButtonAffordance(button, { hidden: !slot.valid, enabled: slot.valid && !slot.disabled });
      setPanelClass(button, "Selected", !!slot.selected);
      const glyph = bluffSlotGlyph(button, i);
      const contents = bluffSlotContents(button);
      State.renderCache.bluffSlotArts = State.renderCache.bluffSlotArts || [];
      const art = State.renderCache.bluffSlotArts[i] || (State.renderCache.bluffSlotArts[i] = createCardArt(contents || button, slot.rank ? { rank: slot.rank } : null));
      setPanelClass(art, CLASSES.hidden, !slot.valid);
      setImageSource(bluffPanelChild(art, 0), slot.rank ? getCardImageSrc({ rank: slot.rank }) : "");
      setText(glyph, slot.valid ? slot.rank : "");
      setPanelClass(glyph, CLASSES.hidden, !slot.valid);
    }
    const renderControl = (panel, decision) => {
      applyButtonAffordance(panel, decision);
      setButtonLabel(panel, decision.label);
    };
    renderControl(State.bluffHostButton, model.lifecycle.host);
    renderControl(State.bluffJoinButton, model.lifecycle.join);
    renderControl(State.bluffLeaveButton, model.lifecycle.leave);
    renderControl(State.bluffStartButton, model.lifecycle.start);
    renderControl(State.bluffEndButton, model.lifecycle.end);
    renderControl(State.bluffPlayButton, model.actions.play);
    renderControl(State.bluffChallengeButton, model.actions.challenge);
  }
  const BluffDeckRenderer = { render: renderBluffDeck };
  const TableRenderer = { render: render, invalidate: invalidateRenderer };

  function renderAnnouncer(model) {
    if (!isValid(State.announcer)) return;
    const announcement = model.announcer;
    setPanelClass(State.announcer, CLASSES.winner, announcement.winner);
    setPanelClass(State.announcerTitle, CLASSES.winner, announcement.winner);
    setPanelClass(State.announcerBody, CLASSES.winner, announcement.winner);
    setText(State.announcerTitle, announcement.title);
    setText(State.announcerBody, announcement.detail);
  }

  function updateMatchPanels(model) {
    setPanelClass(State.tableSurface, CLASSES.hidden, false);
    setPanelClass(State.players, CLASSES.hidden, false);
    setPanelClass(State.seatsList, CLASSES.hidden, true);
    setPanelClass(State.tableSeats, CLASSES.hidden, !model.hasGame);
    setPanelClass(State.log, CLASSES.hidden, !model.hasGame);
    applyButtonAffordance(State.endButton, model.controls.endMatch);
    applyButtonAffordance(State.leaveLobbyButton, model.controls.leaveLobby);
  }

  function setButtonLabel(button, text) {
    if (!isValid(button)) return;
    let label = null;
    try { label = button.GetChild && button.GetChild(0); } catch (e) {}
    setText(label, text);
  }

  function pickerChoiceLabel(target, active, terminal, source) {
    const targetName = tableGameName(target).toUpperCase();
    if (source === target) return "RETURN TO " + targetName;
    if (active && active !== target) return targetName + " · MATCH LOCKED";
    if (terminal && terminal !== target) {
      if (State.pendingTableSwitch === target) return "CONFIRM LEAVE & OPEN " + targetName;
      return "LEAVE " + tableGameName(terminal).toUpperCase() + " & OPEN " + targetName;
    }
    return targetName;
  }

  function renderTableGamePicker(active) {
    const terminal = getTerminalTableGameType();
    const source = getTablePickerSource();
    const transitionWaiting = !!(terminal && (tableSyncPending() || (State.bluffDeck && State.bluffDeck.pending)));
    let warning = "";
    if (active) {
      warning = tableGameName(active).toUpperCase() + " MATCH IN PROGRESS — OTHER TABLE GAMES REMAIN LOCKED UNTIL THE MATCH ENDS.";
    } else if (terminal && transitionWaiting) {
      warning = "WAITING FOR THE FINISHED " + tableGameName(terminal).toUpperCase() + " TABLE TO SETTLE. SWITCHING IS TEMPORARILY LOCKED.";
    } else if (terminal) {
      const party = ensureParty();
      const target = terminal === "poker" ? "Bluff Deck" : "Poker";
      if (party.mode === "leader") warning = "LEAVING " + tableGameName(terminal).toUpperCase() + " MAY MOVE LOBBY LEADERSHIP TO ANOTHER PLAYER.";
      else if (party.mode === "member") warning = "OPENING " + target.toUpperCase() + " WILL LEAVE YOUR CURRENT " + tableGameName(terminal).toUpperCase() + " LOBBY.";
      else warning = "OPENING " + target.toUpperCase() + " WILL CLEAR THIS FINISHED " + tableGameName(terminal).toUpperCase() + " VIEW LOCALLY.";
      if (terminal === "poker" && State.game && State.game.finished) warning += " COPY POKER PROGRESS FIRST IF YOU WANT TO RESUME.";
      warning += State.pendingTableSwitch
        ? " CLICK " + pickerChoiceLabel(State.pendingTableSwitch, "", terminal, source) + " AGAIN TO CONFIRM."
        : " THE FIRST CLICK ARMS THE SWITCH; THE SECOND CONFIRMS IT.";
    }
    setText(State.pickerWarning, warning);
    applyHiddenAffordance(State.pickerWarning, !warning);
    setText(State.pickerPokerLabel, pickerChoiceLabel("poker", active, terminal, source));
    setText(State.pickerBluffLabel, pickerChoiceLabel("bluff-deck", active, terminal, source));
    const pokerCrossTerminal = !!(terminal && source === terminal && terminal !== "poker");
    const bluffCrossTerminal = !!(terminal && source === terminal && terminal !== "bluff-deck");
    applyButtonAffordance(State.pickerPokerButton, {
      hidden: false,
      enabled: (!active || active === "poker") && !(pokerCrossTerminal && transitionWaiting),
    });
    applyButtonAffordance(State.pickerBluffButton, {
      hidden: false,
      enabled: (!active || active === "bluff-deck") && !(bluffCrossTerminal && transitionWaiting),
    });
  }

  function renderTableGameSurface(model) {
    const active = getActiveTableGameType();
    if (State.isOpen && !State.selectedTableGame && !State.tablePickerRequested && active) State.selectedTableGame = active;
    const selected = State.selectedTableGame;
    const showPoker = selected === "poker";
    const showBluff = selected === "bluff-deck";
    const showPicker = !selected;
    hidePokerSurface(!showPoker || !State.isOpen);
    hideBluffSurface(!showBluff || !State.isOpen);
    applyHiddenAffordance(State.pickerWindow, !showPicker || !State.isOpen);
    setPanelClass(State.pickerPokerButton, "Selected", showPoker);
    setPanelClass(State.pickerBluffButton, "Selected", showBluff);
    renderTableGamePicker(active);
    if (showBluff) BluffDeckRenderer.render(BluffDeckViewModel.build(State));
    return showPoker || showBluff;
  }

  function render(model) {
    if (!model) return;
    const metricStarted = PokerMetrics.start("renderGame");
    cachePanels();
    if (!shouldRunMenuWork()) {
      PokerMetrics.end("renderGame", metricStarted);
      return;
    }
    if (State.isOpen) {
      const tableSurfaceRendered = renderTableGameSurface(model);
      if (State.selectedTableGame !== "poker" || !tableSurfaceRendered) {
        PokerMetrics.end("renderGame", metricStarted);
        return;
      }
    }
    renderPotCenter(model);
    setText(State.phase, model.phase);
    updateMatchPanels(model);
    if (model.activeGame) setStatus(model.actions.hint);
    renderAnnouncer(model);
    renderCommunity(model);
    renderPlayers(model);
    if (model.hasGame) renderTableSeats(model);
    renderActions(model);
    renderLog(model);
    renderProgressControls(model);
    updateStartButton(model);
    PokerMetrics.end("renderGame", metricStarted);
  }

  function flushScheduledRender() {
    State.renderCache.renderQueued = false;
    State.renderCache.renderReason = "";
    PokerMetrics.increment("renderFlush");
    if (shouldRunMenuWork()) render(ViewModel.build());
  }

  function deferRender(reason) {
    PokerMetrics.increment("renderRequest");
    if (!shouldRunMenuWork()) {
      State.renderCache.renderReason = reason || State.renderCache.renderReason || "";
      return;
    }
    if (State.renderCache.renderQueued) {
      PokerMetrics.increment("renderRequestCoalesced");
      State.renderCache.renderReason = reason || State.renderCache.renderReason || "";
      return;
    }
    State.renderCache.renderQueued = true;
    State.renderCache.renderReason = reason || "";
    try {
      $.Schedule(0, flushScheduledRender);
    } catch (e) {
      flushScheduledRender();
    }
  }

  function immediateRender(reason) {
    State.renderCache.renderQueued = false;
    State.renderCache.renderReason = reason || "";
    PokerMetrics.increment("renderImmediate");
    if (shouldRunMenuWork()) render(ViewModel.build());
  }

  const RenderScheduler = {
    defer: deferRender,
    immediate: immediateRender,
  };

  function bindButton(panel, handler) {
    if (!isValid(panel) || panel.__pokerMenuBound) return;
    panel.__pokerMenuBound = true;
    try {
      panel.SetPanelEvent("onactivate", handler);
    } catch (e) {}
  }

  function cachePanels() {
    const context = $.GetContextPanel();
    const root = getRoot(context);
    State.root = isValid(State.root) ? State.root : root;
    for (let i = 0; i < PANEL_BINDINGS.length; i += 1) {
      const binding = PANEL_BINDINGS[i];
      State[binding[0]] = isValid(State[binding[0]]) ? State[binding[0]] : findChild(root, IDS[binding[1]]);
    }
  }

  function resetRenderChildCache() {
    TableSeatRenderer.reset();
    const cache = State.renderCache || {};
    for (const key of [
      "communityCards", "readySeatRows", "resumeLeaderRows", "playerRows", "tableSeatRows",
      "tableTurnArrow", "tableTurnArrowClass", "potChipRows",
      "actionButtons", "actionHint", "actionButtonRow",
      "customBetControls", "customBetChoice", "customBetRange", "customBetRangeKey",
      "bluffTargetRank", "bluffTargetArt", "bluffSlotArts", "bluffStateClass", "bluffLogRows", "bluffPlayedRows", "logRows",
    ]) {
      if (!Object.prototype.hasOwnProperty.call(cache, key)) continue;
      if (key === "bluffSlotArts") cache[key] = [];
      else if (/Rows$|Cards$|Buttons$/.test(key)) cache[key] = Array.isArray(cache[key]) ? [] : {};
      else cache[key] = key.indexOf("OrderKey") >= 0 || key.indexOf("Class") >= 0 ? "" : null;
    }
  }

  function invalidatePanelCache(reason) {
    for (let i = 0; i < PANEL_BINDINGS.length; i += 1) State[PANEL_BINDINGS[i][0]] = null;
    State.root = null;
    invalidateRenderer(reason);
    State.renderCache.panelInvalidationReason = reason || "";
    return true;
  }

  const PanelCache = {
    refresh: cachePanels,
    invalidate: invalidatePanelCache,
  };

  function getCommandBindings() {
    return [
      ["PokerEscapeMenuToggle", "menuButton", toggleOpen], ["PokerEscapeMenuClose", "closeButton", closeMenu], ["PokerEscapeMenuBackToPicker", "backButton", backToTablePicker], ["PokerEscapeMenuSendReadyChat", "readyChatButton", sendReadyChat],
      ["PokerEscapeMenuStart", "startButton", sendStartCommand], ["PokerEscapeMenuEndMatch", "endButton", endMatch], ["PokerEscapeMenuLeaveLobby", "leaveLobbyButton", leaveLobby],
      ["PokerEscapeMenuHostParty", "partyHostButton", sendPartyLeaderCommand], ["PokerEscapeMenuJoinParty", "partyJoinButton", sendPartyJoinCommand], ["PokerEscapeMenuCopyProgress", "exportProgressButton", copyProgressCode],
      ["PokerEscapeMenuImportProgress", "importProgressButton", importProgressCodeFromInput], ["PokerEscapeMenuResumeLeader", "resumeLeaderButton", sendResumeLeaderCommand], ["PokerEscapeMenuResumeReady", "resumeReadyButton", sendResumeReadyCommand],
      ["PokerEscapeMenuSelectPoker", "pickerPokerButton", () => selectTableGame("poker")], ["PokerEscapeMenuSelectBluffDeck", "pickerBluffButton", () => selectTableGame("bluff-deck")],
      ["PokerEscapeMenuClose", "bluffCloseButton", closeMenu], ["PokerEscapeMenuHostParty", "bluffHostButton", sendPartyLeaderCommand], ["PokerEscapeMenuJoinParty", "bluffJoinButton", sendPartyJoinCommand],
      ["PokerEscapeMenuBackToPicker", "bluffBackButton", backToTablePicker],
      ["PokerEscapeMenuLeaveLobby", "bluffLeaveButton", leaveLobby], ["PokerEscapeMenuBluffStart", "bluffStartButton", BluffDeckActions.sendStart], ["PokerEscapeMenuBluffEnd", "bluffEndButton", BluffDeckActions.sendEnd],
      ["PokerEscapeMenuBluffPlay", "bluffPlayButton", BluffDeckActions.sendPlay], ["PokerEscapeMenuBluffChallenge", "bluffChallengeButton", BluffDeckActions.sendChallenge],
      ["PokerEscapeMenuSelectBluffSlot0", "bluffSlot0", selectBluffSlot0], ["PokerEscapeMenuSelectBluffSlot1", "bluffSlot1", selectBluffSlot1],
      ["PokerEscapeMenuSelectBluffSlot2", "bluffSlot2", selectBluffSlot2], ["PokerEscapeMenuSelectBluffSlot3", "bluffSlot3", selectBluffSlot3],
      ["PokerEscapeMenuSelectBluffSlot4", "bluffSlot4", selectBluffSlot4],
    ];
  }

  function hasRequiredPanels() {
    for (let i = 0; i < BOOT_REQUIRED_PANELS.length; i += 1) if (!State[BOOT_REQUIRED_PANELS[i]]) return false;
    return true;
  }

  function boot() {
    cachePanels();
    State.party = getPartyState();
    State.resume = getResumeState();
    if (!bluffDeckHydrationCandidate) bluffDeckHydrationCandidate = getBluffDeckMatchState();
    const bindings = getCommandBindings();
    for (let i = 0; i < bindings.length; i += 1) bindButton(State[bindings[i][1]], bindings[i][2]);
    if (!State.eventsBound && hasRequiredPanels()) {
      State.eventsBound = true;
      try {
        $.RegisterForUnhandledEvent(CLIENT_OUTPUT_EVENT, handleBridgeEvent);
      } catch (e) {}
      log("ESC poker menu ready");
    }
    if (!State.eventsBound) $.Schedule(0.2, boot);
  }

  function exportGlobals() {
    try {
      const bindings = getCommandBindings();
      const context = $.GetContextPanel();
      for (let i = 0; i < bindings.length; i += 1) {
        const name = bindings[i][0];
        const handler = bindings[i][2];
        globalThis[name] = handler;
        if (context) context[name] = handler;
      }
      globalThis.PokerEscapeMenuSelectTableGame = selectTableGame;
      globalThis.PokerEscapeMenuSelectBluffSlot = selectBluffSlot;
      if (context) {
        context.PokerEscapeMenuSelectTableGame = selectTableGame;
        context.PokerEscapeMenuSelectBluffSlot = selectBluffSlot;
      }
    } catch (e) {}
  }

  function copyForTest(value) {
    try {
      return JSON.parse(JSON.stringify(value == null ? null : value));
    } catch (e) {
      return value;
    }
  }

  function getStateSnapshot() {
    return {
      selectedTableGame: State.selectedTableGame || "",
      party: copyForTest(ensureParty()),
      game: copyForTest(State.game),
      bluffDeck: copyForTest(State.bluffDeck),
      bankrolls: copyForTest(State.bankrolls || {}),
      resume: copyForTest(ensureResume()),
      readySeats: copyForTest(getReadySeatArray()),
      requiresProgressImport: !!State.requiresProgressImport,
      resumeRequiresHostedParty: !!State.resumeRequiresHostedParty,
      lastSendMs: State.lastSendMs,
      localPlayerKey: State.localPlayerKey || "",
      sync: copyForTest(State.sync),
      status: copyForTest(State.statusModel),
      progressTransfers: copyForTest(State.progressTransfers || {}),
      processedChatSeq: State.processedChatSeq || 0,
    };
  }

  function seedPartyForTest(entries, partyId, mode) {
    if (!globalThis.__PokerTestMode) return false;
    const roster = resolveRosterNamesFromKnownParty(entries || []);
    State.party = defaultPartyState();
    State.party.id = partyId == null ? "ptest" : partyId;
    State.party.mode = mode == null ? "leader" : mode;
    State.party.order = [];
    State.party.members = {};
    for (let i = 0; i < roster.length; i += 1) {
      State.party.order.push(roster[i].key);
      State.party.members[roster[i].key] = { key: roster[i].key, name: roster[i].name };
    }
    State.party.leaderKey = State.party.order[0] || "";
    State.party.leaderName = State.party.leaderKey && State.party.members[State.party.leaderKey] ? State.party.members[State.party.leaderKey].name : "";
    savePartyState();
    return true;
  }

  function setGameForTest(game) {
    if (!globalThis.__PokerTestMode) return false;
    State.game = game || null;
    return true;
  }

  function exportTestHooks() {
    try {
      globalThis.__PokerEscapeMenuTestHooks = {
        getStateSnapshot: getStateSnapshot,
        seedPartyForTest: seedPartyForTest,
        setGameForTest: setGameForTest,
        getReadySeats: getReadySeats,
        getReadySeatArray: getReadySeatArray,
        isStartEligible: isStartEligible,
        updateReadySeats: updateReadySeats,
        handleReadyEvent: handleBridgeEvent,
        requestReadySnapshot: requestReadySnapshot,
        processChatRecord: processChatRecord,
        getQueuedLateJoiners: getQueuedLateJoiners,
        computeLateJoinBuyIn: computeLateJoinBuyIn,
        applyLateJoinBuyIns: applyLateJoinBuyIns,
        decodeRoster: decodeRoster,
        buildSynchronizedStartCommand: buildSynchronizedStartCommand,
        buildResumeLeaderCommand: buildResumeLeaderCommand,
        buildResumeReadyCommand: buildResumeReadyCommand,
        buildResumeStartCommand: buildResumeStartCommand,
        modules: {
          BluffDeckCommandReducer: BluffDeckCommandReducer,
          CommandReducer: CommandReducer,
          PokerEngine: PokerEngine,
          BluffDeckEngine: BluffDeckEngine,
          BluffDeckActions: BluffDeckActions,
          BluffDeckControlState: BluffDeckControlState,
          BluffDeckSeatProjection: BluffDeckSeatProjection,
          BluffDeckViewModel: BluffDeckViewModel,
          BluffDeckRenderer: BluffDeckRenderer,
          TableSeatRenderer: TableSeatRenderer,
          TableGamePicker: { select: selectTableGame, selectBluffSlot: selectBluffSlot },
          ProgressResume: ProgressResume,
          ViewModel: ViewModel,
          TableRenderer: TableRenderer,
          PokerMetrics: PokerMetrics,
          RenderScheduler: RenderScheduler,
          PanelCache: PanelCache,
          PartyReducer: PartyReducer,
        },
        state: State,
      };
    } catch (e) {}
  }

  exportGlobals();
  exportTestHooks();
  try {
    if (!globalThis.__PokerTestMode) boot();
  } catch (e) {
    boot();
  }
})();
