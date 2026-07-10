(() => {
  "use strict";

  const LOG_PREFIX = "[PokerMenu]";
  const TEST_READY_MESSAGE = "ready";
  const CHAT_RETRY_DELAYS = [0.05, 0.1, 0.2, 0.35, 0.6, 1.0];
  const CHAT_TARGET_LABELS = {
    placeholder: "#citadel_chat_placeholder",
    all: "#citadel_chat_all",
    party: "#citadel_chat_party",
    team: "#citadel_chat_team",
  };
  const BridgeContract = {
    clientOutputEvent: "ClientUI_FireOutput",
    readyEvent: "PokerReadySeatsChanged",
    readyRequestEvent: "PokerReadySeatsRequest",
    readyClearRequestEvent: "PokerReadySeatsClearRequest",
    chatEvent: "PokerChatMessage",
    chatSnapshotRequestEvent: "PokerChatSnapshotRequest",
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
    playersWindow: "PokerPlayersWindow", historyWindow: "PokerHistoryWindow", actionsWindow: "PokerActionsWindow", closeButton: "PokerCloseButton",
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
  };

  const PANEL_BINDINGS = [
    ["menuButton", "rootButton"], ["panel", "panel"], ["tableWindow", "tableWindow"], ["lobbyWindow", "lobbyWindow"],
    ["playersWindow", "playersWindow"], ["historyWindow", "historyWindow"], ["actionsWindow", "actionsWindow"], ["closeButton", "closeButton"],
    ["readyChatButton", "readyChatButton"], ["startButton", "startButton"], ["startButtonLabel", "startButtonLabel"], ["endButton", "endButton"],
    ["leaveLobbyButton", "leaveLobbyButton"], ["partyControls", "partyControls"], ["partyHostButton", "partyHostButton"], ["partyJoinButton", "partyJoinButton"],
    ["partyStatus", "partyStatus"], ["progressControls", "progressControls"], ["exportProgressButton", "exportProgressButton"], ["importProgressButton", "importProgressButton"],
    ["progressCodeInput", "progressCodeInput"], ["progressCodeLabel", "progressCodeLabel"], ["resumeControls", "resumeControls"], ["resumeLeaderButton", "resumeLeaderButton"],
    ["resumeReadyButton", "resumeReadyButton"], ["resumeStatus", "resumeStatus"], ["resumeLeaderList", "resumeLeaderList"], ["readyCount", "readyCount"],
    ["seatsList", "seatsList"], ["status", "status"], ["pot", "pot"], ["potCenter", "potCenter"], ["potCenterAmount", "potCenterAmount"], ["potChips", "potChips"], ["phase", "phase"],
    ["tableSurface", "tableSurface"], ["announcer", "announcer"], ["announcerTitle", "announcerTitle"], ["announcerBody", "announcerBody"],
    ["community", "community"], ["players", "players"], ["tableSeats", "tableSeats"], ["actions", "actions"], ["log", "log"],
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
      communityCards: [],
      playerRows: {},
      actionButtons: {},
      actionHint: null,
      actionOrderKey: "",
      logRows: [],
      tableSeatRows: {},
      tableSeatOrderKey: "",
      potChipRows: {},
      potChipOrderKey: "",
      readySeatOrderKey: "",
      readySeatParent: null,
      resumeLeaderOrderKey: "",
      resumeLeaderParent: null,
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
  };
  State.root = null;
  for (let i = 0; i < PANEL_BINDINGS.length; i += 1) State[PANEL_BINDINGS[i][0]] = null;
  State.chat = null;
  State.chatInput = null;
  State.chatTargetLabel = null;
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
    enabled: metricsEnabled,
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

  function getProgressPlayers(game) {
    const players = game && game.players ? game.players : [];
    const out = [];
    for (let i = 0; i < players.length; i += 1) {
      if (!isDepartedPlayer(players[i])) out.push(players[i]);
    }
    return out;
  }

  function resolveProgressDealerKey(game, progressPlayers) {
    const players = progressPlayers || getProgressPlayers(game);
    if (!players.length) return "";
    const dealer = game && game.players ? game.players[game.dealerIndex] : null;
    const dealerKey = normalizePlayerKey(dealer && dealer.key);
    if (dealerKey && !isDepartedPlayer(dealer)) {
      for (let i = 0; i < players.length; i += 1) {
        if (normalizePlayerKey(players[i].key) === dealerKey) return dealerKey;
      }
    }
    const allPlayers = game && game.players ? game.players : [];
    let nextDealerKey = "";
    for (let offset = 1; offset <= allPlayers.length; offset += 1) {
      const candidate = allPlayers[((game.dealerIndex || 0) + offset) % allPlayers.length];
      const candidateKey = normalizePlayerKey(candidate && candidate.key);
      if (!candidateKey || isDepartedPlayer(candidate)) continue;
      for (let i = 0; i < players.length; i += 1) {
        if (normalizePlayerKey(players[i].key) === candidateKey) {
          nextDealerKey = candidateKey;
          break;
        }
      }
      if (nextDealerKey) break;
    }
    if (!nextDealerKey) nextDealerKey = normalizePlayerKey(players[0].key || players[0].name);
    for (let i = 0; i < players.length; i += 1) {
      if (normalizePlayerKey(players[i].key) === nextDealerKey) {
        const anchor = players[(i + players.length - 1) % players.length];
        return normalizePlayerKey(anchor.key || anchor.name);
      }
    }
    return normalizePlayerKey(players[players.length - 1].key || players[players.length - 1].name);
  }

  function buildProgressPayload() {
    const game = State.game;
    if (!game || !game.finished || game.active) return { ok: false, status: "Finish the current hand before copying progress." };
    const progressPlayers = getProgressPlayers(game);
    const dealerKey = resolveProgressDealerKey(game, progressPlayers);
    if (!dealerKey) return { ok: false, status: "Cannot copy progress; dealer state is missing." };
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

  function getProgressShareKey() {
    const game = State.game;
    if (!game || !game.finished || game.active || !game.players || !game.players.length) return "";
    const progressPlayers = getProgressPlayers(game);
    const parts = [String(game.handNumber || 0), resolveProgressDealerKey(game, progressPlayers)];
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

  function buildFreshProgressSaveCode() {
    const built = buildProgressPayload();
    if (!built.ok) return built;
    const payload = built.payload;
    const checksum = hashString(canonicalProgressPayload(payload)) >>> 0;
    const wrapper = { checksum: checksum, payload: payload };
    const bytes = textToUtf8Bytes(JSON.stringify(wrapper));
    const encrypted = cryptProgressBytes(bytes, PROGRESS_CODE_SECRET + "|" + checksum);
    return {
      ok: true,
      code: PROGRESS_CODE_PREFIX + "-" + checksumHex(checksum) + "-" + encodeBase64UrlBytes(encrypted),
      id: getResumeId(payload),
      payload: payload,
    };
  }

  function buildProgressSaveCode() {
    const shareKey = getProgressShareKey();
    if (shareKey && State.progressShare && State.progressShare.key === shareKey && State.progressShare.code) {
      const decoded = decodeProgressSaveCode(State.progressShare.code);
      if (decoded.ok && decoded.id === State.progressShare.id) {
        return { ok: true, code: State.progressShare.code, id: State.progressShare.id, payload: decoded.payload };
      }
    }
    const built = buildFreshProgressSaveCode();
    if (built.ok && shareKey) {
      State.progressShare = {
        key: shareKey,
        code: built.code,
        id: built.id,
        checksum: checksumFromProgressCode(built.code),
        chunkCount: 0,
        sent: false,
      };
    }
    return built;
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



  function splitProgressCodeForChat(code) {
    const text = String(code || "");
    const chunks = [];
    for (let i = 0; i < text.length; i += PROGRESS_SHARE_CHUNK_SIZE) {
      chunks.push(text.slice(i, i + PROGRESS_SHARE_CHUNK_SIZE));
    }
    return chunks;
  }

  function buildProgressOfferCommand(id, checksum, chunkCount) {
    return PROGRESS_OFFER_PREFIX + " poker progress " + id + " " + checksum + " " + chunkCount;
  }

  function buildProgressChunkCommand(id, checksum, index, chunkCount, chunk) {
    return PROGRESS_CHUNK_PREFIX + " poker progress " + id + " " + checksum + " " + index + "/" + chunkCount + " " + chunk;
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

  function importProgressSaveCode(code, suppressEffects) {
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
    if (!suppressEffects) {
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
    "remote-match-end": ["game"],
    "snapshot-match-end": ["game", "pendingLeaderLeaveAfterMatchEnd", "party"],
    "two-player-active-leave": ["party", "game", "bankrolls", "resumeRequiresHostedParty", "pendingPartyLeader", "pendingLeaderLeaveAfterMatchEnd"],
    "leader-or-self-leave": ["party", "game", "bankrolls", "resumeRequiresHostedParty", "pendingPartyLeader", "pendingLeaderLeaveAfterMatchEnd"],
    "leave-lobby": ["party", "game", "resumeRequiresHostedParty", "pendingLeaderLeaveAfterMatchEnd"],
    "end-match": ["game"],
  };
  const RESET_FIELD_DEFAULTS = {
    party: () => defaultPartyState(),
    game: () => null,
    bankrolls: () => ({}),
    resumeRequiresHostedParty: () => true,
    pendingPartyLeader: () => null,
    pendingLeaderLeaveAfterMatchEnd: () => null,
  };
  function resetPartyState(resetCase, reason) {
    const fields = RESET_FIELD_SETS[resetCase] || [];
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      const factory = RESET_FIELD_DEFAULTS[field];
      if (factory) State[field] = factory();
    }
    if (resetCase === LOBBY_RESET_CASES.hostClose) return;
    PendingSelfAction.clear();
    clearResumeState(reason);
    State.requiresProgressImport = false;
  }


  function findGamePlayerIndexByKey(key) {
    const normalized = normalizePlayerKey(key);
    const game = State.game;
    if (!normalized || !game || !game.players || !game.players.length) return -1;
    for (let i = 0; i < game.players.length; i += 1) {
      if (game.players[i].key === normalized) return i;
    }
    return -1;
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


  function removeGamePlayerForLeave(key, name) {
    const normalized = normalizePlayerKey(key);
    const game = State.game;
    const index = findGamePlayerIndexByKey(normalized);
    if (index < 0 || !game || !game.players || !game.players.length) return false;
    const player = game.players[index];
    const label = name || player.name || "Player";
    if (game.active) {
      player.folded = true;
      player.left = true;
      player.acted = true;
      addGameLog(label + " left the lobby and folds.");
      if (activeContestants().length <= 1) awardFoldWin();
      else {
        if (game.currentIndex === index) game.currentIndex = nextActiveIndex(index);
        announce(label + " left and folds", getTurnPrompt());
        if (hasBettingRoundSettled()) advancePhase();
      }
      return true;
    }
    game.players.splice(index, 1);
    if (game.dealerIndex >= game.players.length) game.dealerIndex = 0;
    if (game.currentIndex >= game.players.length) game.currentIndex = 0;
    if (game.players.length) addGameLog(label + " left the lobby.");
    delete State.bankrolls[normalized];
    return true;
  }


  function recordPartyLeave(record, partyId) {
    const party = ensureParty();
    if (!party.id || !samePartyId(party.id, partyId)) return null;
    if (!record || isUnknownSender(record.sender)) return null;
    const key = normalizePlayerKey(record.sender);
    const name = record.sender;
    if (!key || !party.members[key]) return null;
    const game = State.game;
    const gameIndex = findGamePlayerIndexByKey(key);
    const resetForTwoPlayerActiveLeave = !!(game && game.active && game.players && game.players.length <= 2 && gameIndex >= 0);
    const continueActiveLeave = !!(!record.isSelf && game && game.active && game.players && game.players.length > 2 && gameIndex >= 0);
    delete party.members[key];
    const memberIndex = (party.order || []).indexOf(key);
    if (memberIndex >= 0) party.order.splice(memberIndex, 1);
    const leaderLeaving = party.leaderKey === key;
    const transferLeader = leaderLeaving && !record.isSelf && !continueActiveLeave && !resetForTwoPlayerActiveLeave && party.order.length > 1;
    const resetLobby = resetForTwoPlayerActiveLeave || record.isSelf || (leaderLeaving && !transferLeader && !continueActiveLeave);
    const pendingLeader = State.pendingPartyLeader && State.pendingPartyLeader.key === key
      ? State.pendingPartyLeader
      : null;
    let departure = resetLobby
      ? (resetForTwoPlayerActiveLeave ? { key: key, name: name, reset: true } : null)
      : { key: key, name: name, active: !!(game && game.active) };
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
    if (departure && !departure.reset && departure.key) {
      removeGamePlayerForLeave(departure.key, departure.name);
    }
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
    if (readyAction.progressShareReason) shareImportedProgressFromHostedLeader(readyAction.progressShareReason);
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
      return recordPartyLeave(record, partyId)
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
    if (type === "join") {
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

  function describeLateJoinQueue() {
    const queued = getQueuedLateJoiners();
    return {
      count: queued.length,
      names: queued.map((entry) => entry.name),
      buyIn: computeLateJoinBuyIn(),
    };
  }

  const LateJoinQueue = {
    queued: getQueuedLateJoiners,
    buyIn: computeLateJoinBuyIn,
    apply: applyLateJoinBuyIns,
    describe: describeLateJoinQueue,
  };

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

  function encodeRoster(roster) {
    if (!roster || !roster.length) return "";
    return roster.map((player) => encodeURIComponent(player.key || "") + "~" + encodeURIComponent(player.name || "")).join("|");
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

  function setReadyStatus(text) {
    return setStatus(text, STATUS_PRIORITY.ready, 0);
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


  const Affordance = {
    apply: applyButtonAffordance,
    button: applyButtonAffordance,
    hidden: applyHiddenAffordance,
  };

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

  function getButtonStateSnapshot(count) {
    return {
      game: State.game,
      party: ensureParty(),
      resume: ensureResume(),
      localPlayerKey: State.localPlayerKey,
      readyCount: count || State.readyCountValue || getReadySeatArray().length,
      sync: StartSync.getProjection(),
      minReadyPlayers: MIN_READY_PLAYERS,
      partyRoster: PartyReducer.roster(),
      resumeRoster: getResumeRoster(),
      localProgressEntry: getLocalProgressEntry(),
      remainingPlayersWithChips: remainingPlayersWithChips(),
      currentPlayer: getCurrentPlayer(),
      localPlayer: getLocalPlayer(),
    };
  }

  function importedResumeRequiresHostedParty(snapshot) {
    const state = snapshot || getButtonStateSnapshot();
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
    const state = snapshot || getButtonStateSnapshot();
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

  function getHostedResumeStartGate(snapshot) {
    const state = snapshot || getButtonStateSnapshot();
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

  function canUseHostedResumeStart(snapshot) {
    return getHostedResumeStartGate(snapshot).enabled;
  }

  function getPokerResumeGate(snapshot) {
    const state = snapshot || getButtonStateSnapshot();
    const resume = state.resume || ensureResume();
    const imported = !!(resume && resume.payload && resume.id);
    if (!imported) return makeGateDecision(true, false, "", "");
    if (isHostedImportedResumeState(state)) return getHostedResumeStartGate(state);
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

  function getPokerStartGate(snapshot) {
    const state = snapshot || getButtonStateSnapshot();
    const game = state.game;
    const party = state.party || ensureParty();
    const resume = state.resume || ensureResume();
    const activeGame = !!(game && game.active);
    const imported = !!(resume && resume.payload && resume.id);
    const finishedProgressAvailable = !!(game && game.finished && !game.active && (state.remainingPlayersWithChips > 1 || countGamePlayersWithChips(game) > 1));
    if (activeGame) return makeGateDecision(true, false, "", "");
    if (imported) return getPokerResumeGate(state);
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

  function getCustomBetRange(actor) {
    const game = State.game;
    if (!actor || !game) return null;
    const legal = getLegalActions(actor);
    const maxTarget = Math.max(0, Number(actor.bet) || 0) + Math.max(0, Number(actor.stack) || 0);
    const action = game.currentBet === 0 ? "bet" : "raise";
    const minTarget = action === "bet" ? getCurrentBigBlind(game) : getMinimumRaiseTo(game);
    const canUseMinimum = action === "bet" ? legal.canBetTarget(minTarget) : legal.canRaiseTarget(minTarget);
    if (!canUseMinimum || maxTarget < minTarget) return null;
    return {
      action: action,
      min: minTarget,
      max: maxTarget,
      step: SMALL_BLIND,
      value: minTarget,
    };
  }

  function describeEngineTurn(game, actorKey, localKey) {
    const activeGame = game || State.game;
    const actor = actorKey ? findGamePlayerByKey(actorKey) : getCurrentPlayer();
    const current = getCurrentPlayer();
    const local = localKey ? findGamePlayerByKey(localKey) : getLocalPlayer();
    const legal = actor ? getLegalActions(actor) : null;
    const customBetRange = actor ? getCustomBetRange(actor) : null;
    const choices = actor ? buildPokerActionChoices(actor, !!(local && current && actor.key === local.key && current.key === local.key), !(local && current && actor.key === local.key && current.key === local.key)) : [];
    return {
      currentKey: current && current.key ? current.key : "",
      localKey: local && local.key ? local.key : (localKey || ""),
      actorKey: actor && actor.key ? actor.key : (actorKey || ""),
      phase: activeGame ? activeGame.phase || "" : "",
      pot: activeGame ? Number(activeGame.pot) || 0 : 0,
      currentBet: activeGame ? Number(activeGame.currentBet) || 0 : 0,
      toCall: actor ? getCallAmount(actor) : 0,
      minBetTarget: customBetRange && customBetRange.action === "bet" ? customBetRange.min : getCurrentBigBlind(activeGame),
      maxBetTarget: actor ? (Number(actor.bet) || 0) + (Number(actor.stack) || 0) : 0,
      minRaiseTarget: activeGame ? getMinimumRaiseTo(activeGame) : BIG_BLIND,
      maxRaiseTarget: actor ? (Number(actor.bet) || 0) + (Number(actor.stack) || 0) : 0,
      legal: {
        check: !!(legal && legal.check),
        call: !!(legal && legal.call),
        fold: !!(legal && legal.fold),
        bet: !!(customBetRange && customBetRange.action === "bet"),
        raise: !!(customBetRange && customBetRange.action === "raise"),
      },
      statusText: getActionStatusText(),
      actionChoices: choices,
    };
  }

  function getCustomBetCommandLabel(range, amount) {
    if (!range) return "";
    return (range.action === "bet" ? "BET $" : "RAISE TO $") + amount;
  }

  function buildPokerActionChoices(actor, enabled, readOnly) {
    const choices = [];
    const game = State.game;
    if (!actor || !game) return choices;
    const legal = getLegalActions(actor);
    if (legal.check) choices.push({ label: "CHECK", command: "check", className: "PokerActionButton", enabled: enabled, readOnly: readOnly });
    if (legal.call) choices.push({ label: "CALL $" + legal.toCall, command: "call", className: "PokerActionButton", enabled: enabled, readOnly: readOnly });
    const customBetRange = getCustomBetRange(actor);
    if (customBetRange) {
      choices.push({
        label: customBetRange.action === "bet" ? "BET" : "RAISE",
        command: "custom-" + customBetRange.action,
        className: "PokerActionButton",
        enabled: enabled,
        readOnly: readOnly,
        customBet: customBetRange,
      });
    }
    if (legal.fold) choices.push({ label: "FOLD", command: "fold", className: "PokerActionButton Danger", enabled: enabled, readOnly: readOnly });
    return choices;
  }

  function getPokerButtonState(snapshot) {
    const state = snapshot || getButtonStateSnapshot();
    const game = state.game;
    const party = state.party || ensureParty();
    const resume = state.resume || ensureResume();
    const activeGame = !!(game && game.active);
    const hasGame = !!game;
    const finishedProgressAvailable = !!(game && game.finished && !game.active && (state.remainingPlayersWithChips > 1 || countGamePlayersWithChips(game) > 1));
    const canUseManualImport = !!(!activeGame && !finishedProgressAvailable && party.mode === "leader" && party.id);
    const showProgressControls = !!(finishedProgressAvailable || canUseManualImport);
    const localSeated = !!state.localPlayer;
    const activeObserver = activeGame && !localSeated;
    const imported = !!(resume && resume.payload && resume.id);
    const hostedImportedResume = isHostedImportedResumeState(state);
    const hostedPartyRequiredResume = importedResumeRequiresHostedParty(state);
    const localSavedFunded = !!(state.localProgressEntry && getProgressBankroll(resume.payload, state.localProgressEntry.key) > 0);
    const localIsResumeLeader = !!(imported && resume.leaderKey && state.localPlayerKey === resume.leaderKey);
    const localAlreadyResumeReady = !!(imported && resume.ready && resume.ready[state.localPlayerKey]);
    const hostedResumeGate = getHostedResumeStartGate(state);
    const hostedResumeStart = hostedResumeGate.enabled;
    const needsResumeIdentity = !!(imported && !hostedPartyRequiredResume && !activeGame && !localSavedFunded);
    const canUseReadyChat = !!(!activeGame && needsResumeIdentity);
    const startGate = getPokerStartGate(state);
    const resumeGate = getPokerResumeGate(state);
    const resumeProjection = getProgressResumeProjection(state);
    const canJoinParty = !!(party.id && party.mode === "none" && (activeObserver || !activeGame));
    let partyStatus = "";
    if (state.sync && (state.sync.waitingForReadySnapshot || state.sync.waitingForChatSnapshot)) partyStatus = "Syncing poker chat state...";
    else if (activeObserver) partyStatus = "Join now to wait for the next hand.";
    else if (needsResumeIdentity && !state.localPlayerKey) partyStatus = "Identify yourself with READY UP so Deadlock exposes your saved player name; resume controls will unlock after that.";
    else if (needsResumeIdentity) partyStatus = "Detected sender is not in this imported progress. Use READY UP or reopen party chat from a saved player to unlock resume controls.";
    else if (hostedImportedResume && party.mode === "leader" && hostedResumeGate.enabled) partyStatus = "Ready from imported progress. Click NEXT SYNCED HAND to start.";
    else if (hostedImportedResume && party.mode === "leader") partyStatus = hostedResumeGate.reason || "";
    else if (hostedImportedResume) partyStatus = "Imported progress. Waiting for " + (party.leaderName || "<leader>") + " to start NEXT SYNCED HAND.";
    else if (hostedPartyRequiredResume) partyStatus = "Imported progress loaded. Host or join a Poker party; the party leader imports progress and starts NEXT SYNCED HAND.";
    else if (party.id && party.mode === "none" && !party.leaderKey) partyStatus = "Hosted Poker party found. Click JOIN PARTY to join the lobby.";
    else partyStatus = (imported ? resumeGate.reason : startGate.reason) || "";

    let actionHint = "";
    let actionChoices = [];
    if (activeGame && state.currentPlayer) {
      const turn = PokerEngine.describeTurn(game, state.currentPlayer.key, state.localPlayer && state.localPlayer.key);
      if (!state.localPlayer) {
        actionHint = "Chat sender unknown. Turn: " + state.currentPlayer.name + ". Type ready or reopen party chat so Deadlock exposes your name before acting.";
        actionChoices = turn.actionChoices;
      } else if (state.currentPlayer.key !== state.localPlayer.key) {
        actionHint = "Waiting for " + state.currentPlayer.name + ". Their available choices are shown read-only below.";
        actionChoices = turn.actionChoices;
      } else {
        actionHint = turn.statusText;
        actionChoices = turn.actionChoices;
      }
    }

    const resumeStatus = resumeProjection.resumeStatus;
    return {
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
        resumeStatus: resumeStatus,
        actionHint: actionHint,
      },
      actionChoices: actionChoices,
      gates: {
        start: startGate,
        resume: resumeGate,
      },
    };
  }

  function getCurrentButtonState(count) {
    return PokerButtonState.get(getButtonStateSnapshot(count));
  }

  const PokerButtonState = {
    get: getPokerButtonState,
    getStartGate: getPokerStartGate,
    getResumeGate: getPokerResumeGate,
  };
  function cancelHostedLobbyOnClose() {
    const party = ensureParty();
    if (!party.id || party.mode !== "leader") return;
    if (State.game && State.game.active) return;
    const partyId = party.id;
    sendChatMessage(PARTY_LEAVE_PREFIX + " poker party " + partyId, true, true);
    State.lastLobbyLeaveMs = Date.now();
    PartyReducer.reset(LOBBY_RESET_CASES.hostClose, "leader close");
    clearReadySeats("leader close");
    savePartyState();
    setStatus("Hosted Poker lobby closed.");
  }

  function setOpen(open) {
    cachePanels();
    const wasOpen = State.isOpen;
    State.isOpen = !!open;
    if (wasOpen && !State.isOpen) cancelHostedLobbyOnClose();
    setPanelClass(State.root, CLASSES.visible, State.isOpen);
    setPanelClass(State.tableWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.lobbyWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.playersWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.actionsWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.menuButton, CLASSES.active, State.isOpen);
    if (State.isOpen) {
      if (!isTestMode()) startRefreshLoop();
      StartSync.openMenu();
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

  function deleteActionRows() {
    const keys = Object.keys(State.renderCache.actionButtons || {});
    for (let i = 0; i < keys.length; i += 1) deletePanel(State.renderCache.actionButtons[keys[i]] && State.renderCache.actionButtons[keys[i]].button);
    State.renderCache.actionButtons = {};
    removeCustomBetControls();
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

  function renderCardPanel(parent, card, small) {
    return createCard(parent, card, small);
  }

  const CardPresenter = {
    render: renderCardPanel,
    update: updateCardPanel,
    imageSrc: getCardImageSrc,
    displayRank: getCardDisplayRank,
    suitGlyph: getSuitGlyph,
  };

  function renderEmptySeats() {
    if (!isValid(State.seatsList)) return;
    const row = createPanel("Panel", State.seatsList, "PokerSeatEmpty", "PokerSeatRow");
    addClass(row, "Empty");
    createLabel(row, "PokerSeatName", "No ready players yet");
    createLabel(row, "PokerSeatMeta", "Type ready in team or party chat to take a seat.");
  }

  function buildReadySeatOrderKey(seats) {
    const rows = seats || [];
    if (!rows.length) return "empty";
    const parts = [];
    for (let i = 0; i < rows.length; i += 1) {
      const seat = rows[i];
      parts.push(normalizePlayerKey(seat && (seat.key || seat.name)) + "|" + ((seat && seat.name) || "") + "|" + ((seat && seat.channel) || "") + "|" + ((seat && seat.message) || ""));
    }
    return parts.join("||");
  }

  function renderSeatRows(seats) {
    cachePanels();
    if (!isValid(State.seatsList)) return;
    const rows = seats || [];
    const key = buildReadySeatOrderKey(rows);
    if (State.renderCache.readySeatParent === State.seatsList && State.renderCache.readySeatOrderKey === key) return;
    State.renderCache.readySeatParent = State.seatsList;
    State.renderCache.readySeatOrderKey = key;
    clearChildren(State.seatsList);
    if (!rows.length) {
      renderEmptySeats();
      return;
    }
    for (let i = 0; i < rows.length; i += 1) {
      const seat = rows[i];
      const row = createPanel("Panel", State.seatsList, "PokerSeat" + (i + 1), "PokerSeatRow");
      createLabel(row, "PokerSeatNumber", String(i + 1));
      createLabel(row, "PokerSeatName", seat.name || "Player");
      createLabel(row, "PokerSeatMeta", "READY");
    }
  }

  function getResumeGate() {
    return PokerButtonState.getResumeGate(getButtonStateSnapshot());
  }

  function buildResumeLeaderOrderKey(resume) {
    const state = resume || ensureResume();
    const payload = state && state.payload;
    if (!payload || !payload.roster || !payload.roster.length) return "empty";
    const parts = [];
    for (let i = 0; i < payload.roster.length; i += 1) {
      const entry = payload.roster[i];
      const key = normalizePlayerKey(entry && (entry.key || entry.name));
      const stack = getProgressBankroll(payload, key);
      let status = "WAITING";
      if (stack <= 0) status = "OUT";
      else if (state.leaderKey === key) status = "LEADER";
      else if (state.ready && state.ready[key]) status = "READY";
      parts.push(key + "|" + ((entry && entry.name) || "") + "|" + stack + "|" + status);
    }
    return parts.join("||");
  }

  function renderResumeLeaderRows() {
    if (!isValid(State.resumeLeaderList)) return;
    const resume = ensureResume();
    const key = buildResumeLeaderOrderKey(resume);
    if (State.renderCache.resumeLeaderParent === State.resumeLeaderList && State.renderCache.resumeLeaderOrderKey === key) return;
    State.renderCache.resumeLeaderParent = State.resumeLeaderList;
    State.renderCache.resumeLeaderOrderKey = key;
    clearChildren(State.resumeLeaderList);
    const payload = resume.payload;
    if (!payload || !payload.roster || !payload.roster.length) {
      const row = createPanel("Panel", State.resumeLeaderList, "PokerResumeEmpty", "PokerSeatRow Empty");
      createLabel(row, "PokerSeatName", "No imported progress");
      createLabel(row, "PokerSeatMeta", "Paste a POKERPROG1 code.");
      return;
    }
    for (let i = 0; i < payload.roster.length; i += 1) {
      const entry = payload.roster[i];
      const key = normalizePlayerKey(entry.key);
      const stack = getProgressBankroll(payload, key);
      let status = "WAITING";
      if (stack <= 0) status = "OUT";
      else if (resume.leaderKey === key) status = "LEADER";
      else if (resume.ready && resume.ready[key]) status = "READY";
      const row = createPanel("Panel", State.resumeLeaderList, "PokerResumeSeat" + (i + 1), "PokerSeatRow");
      createLabel(row, "PokerSeatNumber", String(i + 1));
      createLabel(row, "PokerSeatName", entry.name || key);
      createLabel(row, "PokerSeatMeta", "$" + stack + "  " + status);
    }
  }

  function renderProgressControls(buttonState) {
    const state = buttonState || getCurrentButtonState();
    Affordance.hidden(State.progressControls, state.controls.progressControls.hidden);
    Affordance.button(State.exportProgressButton, state.controls.exportProgress);
    Affordance.button(State.importProgressButton, state.controls.importProgress);
    Affordance.button(State.progressCodeInput, state.controls.progressCodeInput);
    Affordance.hidden(State.resumeControls, state.controls.resumeControls.hidden);
    Affordance.hidden(State.resumeLeaderList, state.controls.resumeLeaderList.hidden);
    Affordance.button(State.resumeLeaderButton, state.controls.resumeLeader);
    Affordance.button(State.resumeReadyButton, state.controls.resumeReady);
    setText(State.progressCodeLabel, state.text.progressCodeLabel);
    setText(State.resumeStatus, state.text.resumeStatus);
    renderResumeLeaderRows();
  }

  function getStartGate(count) {
    return PokerButtonState.getStartGate(getButtonStateSnapshot(count));
  }

  function updateStartButton(count, buttonState) {
    const state = buttonState || getCurrentButtonState(count);
    Affordance.button(State.startButton, state.controls.start);
    Affordance.button(State.readyChatButton, state.controls.readyChat);
    Affordance.hidden(State.partyControls, state.controls.partyControls.hidden);
    Affordance.button(State.partyHostButton, state.controls.partyHost);
    Affordance.button(State.partyJoinButton, state.controls.partyJoin);
    setText(State.startButtonLabel, state.text.startLabel);
    if (state.text.partyStatus) setText(State.partyStatus, state.text.partyStatus);
  }

  function updateReadySeats(force) {
    cachePanels();
    const revision = getReadyRevision();
    const seats = getReadySeatArray();
    const count = seats.length;
    if (!force && State.readyRevision === revision && State.readyCountValue === count) return;
    PokerMetrics.increment("readyUpdate");
    State.readyRevision = revision;
    State.readyCountValue = count;
    renderSeatRows(seats);
    setText(State.readyCount, String(MAX_TABLE_PLAYERS));
    if (!State.game) renderPlayers();
    updateStartButton(count);
    if (!State.game || !State.game.active) {
      setReadyStatus(isStartEligible(count) ? "Ready to start with " + count + " players." : "Waiting for " + (MIN_READY_PLAYERS - count) + " more ready player" + (MIN_READY_PLAYERS - count === 1 ? "." : "s."));
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
    StartSync.noteBridgeEvent(event);
    if (event.event === READY_EVENT) {
      PokerMetrics.increment("readyPayload");
      if (applyReadyPayload(event)) {
        log("received ready payload; rendering seats");
        updateReadySeats(true);
      }
      StartSync.afterSnapshotApplied();
      return;
    }
    if (event.event === CHAT_EVENT) {
      processChatPayload(event);
      StartSync.afterSnapshotApplied();
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
    requestRender("snapshot-applied");
  }

  function openMenuSync() {
    PokerMetrics.increment("menuOpen");
    requestFreshState("open");
    updateReadySeats(true);
    RenderScheduler.immediate("open-menu");
    try {
      $.Schedule(0.05, StartSync.afterSnapshotApplied);
      $.Schedule(0.2, StartSync.afterSnapshotApplied);
      $.Schedule(0.75, StartSync.afterSnapshotApplied);
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

  const StartSync = {
    openMenu: openMenuSync,
    requestFreshState: requestFreshState,
    noteBridgeEvent: noteBridgeEvent,
    getProjection: getSyncProjection,
    afterSnapshotApplied: afterSnapshotApplied,
  };

  function startRefreshLoop() {
    if (State.refreshLoopStarted) return;
    State.refreshLoopStarted = true;
    const tick = () => {
      if (State.isOpen) updateReadySeats(false);
      $.Schedule(State.isOpen ? 0.35 : 1.0, tick);
    };
    $.Schedule(0.35, tick);
  }

  function resolveChatPanels() {
    const context = $.GetContextPanel();
    const root = getRoot(context);
    const chat = isValid(State.chat) ? State.chat : findChild(root, IDS.chat);
    State.chat = isValid(chat) ? chat : null;
    const controls = findChild(State.chat, IDS.chatControls);
    const input = findChild(controls, IDS.chatInput) || findChild(State.chat, IDS.chatInput) || findChild(root, IDS.chatInput);
    const label = findChild(controls, IDS.chatTargetLabel) || findChild(State.chat, IDS.chatTargetLabel) || findChild(root, IDS.chatTargetLabel);
    State.chatInput = isValid(input) ? input : null;
    State.chatTargetLabel = isValid(label) ? label : null;
    return !!(State.chatInput && State.chatTargetLabel);
  }

  function getSupportedChatTargetKind(label) {
    if (!isValid(label)) return "";
    const text = String(label.text || "").trim();
    if (!text || text === CHAT_TARGET_LABELS.placeholder) return "";
    const upper = text.toUpperCase();
    if (text === CHAT_TARGET_LABELS.all || upper === "ALL" || upper.indexOf("(ALL)") >= 0 || upper.indexOf("[ALL]") >= 0) return "all";
    if (text === CHAT_TARGET_LABELS.party || upper === "PARTY" || upper.indexOf("(PARTY)") >= 0 || upper.indexOf("[PARTY]") >= 0) return "party";
    if (text === CHAT_TARGET_LABELS.team || upper === "TEAM" || upper.indexOf("(TEAM)") >= 0 || upper.indexOf("[TEAM]") >= 0) return "team";
    return "";
  }

  function isUsableChatTarget(label) {
    return !!getSupportedChatTargetKind(label);
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
      $.Schedule(Math.max(0.1, (readyAt - Date.now()) / 1000), () => requestRender("progress-share-ready"));
    }
  }

  function submitChatInput(input, message) {
    try {
      input.text = message;
      $.DispatchEvent("CitadelChatInputSubmitted", input);
      input.text = "";
      closeChatInput(input);
      setStatus("Sent: " + message);
      log("sent chat: " + message);
      markProgressShareSubmitted(message);
      return true;
    } catch (e) {
      setStatus("Send failed; see console.");
      log("send failed");
      return false;
    }
  }

  function closeChatInput(input) {
    try {
      $.DispatchEvent("CitadelChatInputBlur", input);
    } catch (e) {}
    try {
      $.DispatchEvent("DropInputFocus", input);
    } catch (e) {}
  }

  function retrySendChat(message, attempt, readyStreak) {
    resolveChatPanels();
    if (!isValid(State.chatInput) || !isUsableChatTarget(State.chatTargetLabel)) {
      if (attempt >= CHAT_RETRY_DELAYS.length - 1) {
        setStatus("Chat not ready. Open team or party chat once, then retry.");
        return;
      }
      $.Schedule(CHAT_RETRY_DELAYS[attempt + 1], () => retrySendChat(message, attempt + 1, 0));
      return;
    }
    if (readyStreak < 1 && attempt < CHAT_RETRY_DELAYS.length - 1) {
      $.Schedule(CHAT_RETRY_DELAYS[attempt + 1], () => retrySendChat(message, attempt + 1, readyStreak + 1));
      return;
    }
    submitChatInput(State.chatInput, message);
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
    const hadUsableTarget = resolveChatPanels() && isValid(State.chatInput) && isUsableChatTarget(State.chatTargetLabel);
    setStatus("Opening chat and sending: " + message);
    if (!hadUsableTarget) {
      try {
        $.DispatchEvent("CitadelConCommand", "say_chat_team");
      } catch (e) {}
    }
    $.Schedule(CHAT_RETRY_DELAYS[0], () => retrySendChat(message, 0, 0));
    return true;
  }

  function sendBackgroundChatMessage(message) {
    const lastManualSendMs = State.lastSendMs;
    const sent = sendChatMessage(message, false, true);
    State.lastSendMs = lastManualSendMs;
    return sent;
  }


  function canShareImportedProgressFromHostedLeader(payload) {
    const state = getButtonStateSnapshot();
    const gate = getHostedResumeStartGate(state);
    return !!(payload && isHostedImportedResumeState(state) && state.party && state.party.mode === "leader" && gate.enabled);
  }

  function isProgressShareInProgressForResume(resume) {
    const share = State.progressShare || defaultProgressShareState();
    if (!(resume && resume.id && share.sent && share.id === resume.id)) return false;
    if (share.messageCount && (share.submittedCount || 0) < share.messageCount) return true;
    return !!(share.readyAt && Date.now() < share.readyAt);
  }

  function shareProgressCode(code, id, reason, shareKeyOverride) {
    const checksum = checksumFromProgressCode(code);
    const chunks = splitProgressCodeForChat(code);
    const shareKey = shareKeyOverride || getProgressShareKey();
    if (!checksum || !chunks.length || !shareKey) return false;
    if (State.progressShare && State.progressShare.key === shareKey && State.progressShare.sent) return false;
    const messages = [buildProgressOfferCommand(id, checksum, chunks.length)];
    for (let i = 0; i < chunks.length; i += 1) {
      messages.push(buildProgressChunkCommand(id, checksum, i + 1, chunks.length, chunks[i]));
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
    $.Schedule(Math.max(0.1, (readyAt - Date.now()) / 1000), () => requestRender("progress-share-ready"));
    setStatus("Sharing progress " + id + " to party. Players will import it from chat.");
    log("sharing progress " + id + " chunks=" + chunks.length + (reason ? " reason=" + reason : ""));
    return true;
  }


  function shareImportedProgressFromHostedLeader(reason) {
    const resume = ensureResume();
    if (!resume.code || !resume.id || !resume.payload) return false;
    if (!canShareImportedProgressFromHostedLeader(resume.payload)) return false;
    return shareProgressCode(resume.code, resume.id, reason, "import:" + resume.id + ":" + checksumFromProgressCode(resume.code));
  }

  function sendReadyChat() {
    sendChatMessage(TEST_READY_MESSAGE);
  }

  function sendPartyLeaderCommand() {
    const decision = getCurrentButtonState().controls.partyHost;
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
    State.lastLobbyLeaveMs = 0;
    clearResumeState("host party");
    State.resumeRequiresHostedParty = false;
    const partyId = makePartyId(remembered || "leader");
    const sent = sendChatMessage(PARTY_LEADER_PREFIX + " poker party " + partyId, false, !!bypassHostThrottle);
    if (!sent) return;
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
    StartSync.requestFreshState("join");
    const party = ensureParty();
    const activeGame = !!(State.game && State.game.active);
    const localSeated = !!findGamePlayerByKey(State.localPlayerKey);
    const decision = getCurrentButtonState().controls.partyJoin;
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
    const decision = getCurrentButtonState().controls.exportProgress;
    if (!decision.enabled && State.game && State.game.active) {
      setStatus("Finish the current hand before copying progress.");
      RenderScheduler.immediate("copy-progress-invalid");
      return { ok: false, status: "Finish the current hand before copying progress." };
    }
    const result = buildProgressSaveCode();
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
    const decision = getCurrentButtonState().controls.importProgress;
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
    const result = importProgressSaveCode(text);
    if (result.ok) State.requiresProgressImport = false;
    if (result.ok) shareImportedProgressFromHostedLeader("manual-import");
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
    const decision = getCurrentButtonState().controls.resumeLeader;
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
    const decision = getCurrentButtonState().controls.resumeReady;
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
    if (canUseHostedResumeStart(getButtonStateSnapshot())) selectHostedResumeLeader(resume);
    const gate = getResumeGate();
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
    if (!applyResumeProgressForStart(resume.payload, parsedLeaderKey)) return rejectedCommandEffect("Cannot resume; saved dealer state is invalid.", "status");
    State.game = createGameFromReady(seed, resume.payload.roster, handNumber, dealerKeyOverride);
    if (State.game) {
      State.game.importedResume = true;
      State.resume = defaultResumeState();
      saveResumeState();
      savePartyState();
      log("game resumed seed " + seed);
      return changedCommandEffect("Poker resumed. " + getCurrentPlayer().name + " acts first.", "resume-start");
    }
    return rejectedCommandEffect("Cannot resume; saved dealer state is invalid.", "status");
  }

  function getProgressResumeProjection(snapshot) {
    const state = snapshot || getButtonStateSnapshot();
    const resume = state.resume || ensureResume();
    const party = state.party || ensureParty();
    const imported = !!(resume && resume.payload && resume.id);
    const hostedImported = isHostedImportedResumeState(state);
    const hostedPartyRequired = importedResumeRequiresHostedParty(state);
    const localSavedFunded = !!(state.localProgressEntry && getProgressBankroll(resume.payload, state.localProgressEntry.key) > 0);
    const localIsLeader = !!(imported && resume.leaderKey && state.localPlayerKey === resume.leaderKey);
    const localAlreadyReady = !!(imported && resume.ready && resume.ready[state.localPlayerKey]);
    const readyCount = countReadySavedPlayers(resume, false);
    const fundedCount = (state.resumeRoster || []).length;
    const resumeGate = getPokerResumeGate(state);
    const hostedResumeGate = getHostedResumeStartGate(state);
    let resumeStatus = imported ? (hostedPartyRequired ? "Imported progress loaded. Host or join a party; the party leader imports progress and starts NEXT SYNCED HAND." : "Leader: " + (resume.leaderName || "none") + ". Ready: " + readyCount + "/" + fundedCount + ".") : "Import progress to choose a resume leader.";
    if (hostedImported && party.mode === "leader" && hostedResumeGate.enabled) resumeStatus = "Ready from imported progress. Click NEXT SYNCED HAND to start.";
    else if (hostedImported && party.mode === "leader") resumeStatus = hostedResumeGate.reason || "Waiting to start synced imported progress.";
    else if (hostedImported) resumeStatus = "Imported progress. Waiting for " + (party.leaderName || "<leader>") + " to start NEXT SYNCED HAND.";
    return {
      imported: imported,
      hostedImported: hostedImported,
      hostedPartyRequired: hostedPartyRequired,
      localSavedFunded: localSavedFunded,
      localIsLeader: localIsLeader,
      localAlreadyReady: localAlreadyReady,
      readyCount: readyCount,
      fundedCount: fundedCount,
      progressLabel: imported ? "Imported progress " + resume.id + "." : "Finish a hand to copy progress, or paste a code to resume.",
      resumeStatus: resumeStatus,
      partyStatus: (state.sync && (state.sync.waitingForReadySnapshot || state.sync.waitingForChatSnapshot)) ? "Syncing poker chat state..." : (imported ? resumeGate.reason : ""),
      controls: {
        progressControls: { hidden: false },
        exportProgress: makeButtonDecision(false, true, true, false, ""),
        importProgress: makeButtonDecision(false, true, true, false, ""),
        progressCodeInput: makeButtonDecision(false, true, true, false, ""),
        resumeControls: { hidden: !imported || !!(state.game && state.game.active) },
        resumeLeader: makeButtonDecision(false, false, false, false, ""),
        resumeReady: makeButtonDecision(false, false, false, false, ""),
        resumeLeaderList: { hidden: !imported },
      },
      gates: { resume: resumeGate, hostedResume: hostedResumeGate },
    };
  }

  function getProgressResumeGates(snapshot) {
    const state = snapshot || getButtonStateSnapshot();
    return {
      resume: getPokerResumeGate(state),
      hostedResume: getHostedResumeStartGate(state),
    };
  }

  const ProgressResume = {
    project: getProgressResumeProjection,
    gates: getProgressResumeGates,
    getStartGate: getPokerResumeGate,
    getHostedStartGate: getHostedResumeStartGate,
    "import": importProgressSaveCode,
    importCode: importProgressSaveCode,
    "build": buildProgressSaveCode,
    buildCode: buildProgressSaveCode,
    applyShare: applyProgressShareMessage,
    shareImported: shareImportedProgressFromHostedLeader,
    selectHostedLeader: selectHostedResumeLeader,
    applyStartCommand: applyResumeStartCommand,
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
    if (!State.game || !State.localPlayerKey) return null;
    for (let i = 0; i < State.game.players.length; i += 1) {
      if (State.game.players[i].key === State.localPlayerKey) return State.game.players[i];
    }
    return null;
  }

  function getCallAmount(player) {
    const game = State.game;
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

  function getLegalActions(player) {
    const game = State.game;
    const current = getCurrentPlayer();
    const toCall = getCallAmount(player);
    const currentActor = !!(game && game.active && player && current && player.key === current.key);
    const chipsAvailable = player ? (player.bet || 0) + (player.stack || 0) : 0;
    return {
      check: currentActor && toCall === 0,
      call: currentActor && toCall > 0,
      fold: currentActor && activeContestants().length > 1,
      toCall: toCall,
      canBetTarget: function canBetTarget(amount) {
        return currentActor && game.currentBet === 0 && amount >= getCurrentBigBlind(game) && amount <= chipsAvailable;
      },
      canRaiseTarget: function canRaiseTarget(amount) {
        return currentActor &&
          game.currentBet > 0 &&
          amount > game.currentBet &&
          amount - game.currentBet >= game.minRaise &&
          amount <= chipsAvailable;
      },
    };
  }

  function getTurnPrompt() {
    const game = State.game;
    const current = getCurrentPlayer();
    if (!game || !game.active || !current) return "";
    const legal = getLegalActions(current);
    const choices = [];
    if (legal.check) choices.push("check");
    if (legal.call) choices.push("call $" + legal.toCall);
    const customBetRange = getCustomBetRange(current);
    if (customBetRange) choices.push((customBetRange.action === "bet" ? "bet $" : "raise $") + customBetRange.min + "-$" + customBetRange.max);
    if (legal.fold) choices.push("fold");
    return current.name + " to act" + (choices.length ? ": " + choices.join(", ") + "." : ".");
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


  function getActionStatusText() {
    const game = State.game;
    if (!game || !game.active) return "";
    const current = getCurrentPlayer();
    const local = getLocalPlayer();
    const actor = local || current;
    const toCall = getCallAmount(actor);
    return String(game.phase || "lobby").toUpperCase() +
      " | turn " + (current ? current.name : "<none>") +
      " | pot $" + (game.pot || 0) +
      " | bet $" + (game.currentBet || 0) +
      " | you " + (local ? local.name : "<unknown>") +
      " | call $" + toCall;
  }

  function describeActionState(reason, record, player) {
    const game = State.game;
    const current = getCurrentPlayer();
    const sender = record && record.sender ? record.sender : "<unknown>";
    const senderKey = normalizePlayerKey(sender);
    const toCall = getCallAmount(player);
    return reason +
      " sender=" + sender +
      " senderKey=" + senderKey +
      " localKey=" + (State.localPlayerKey || "<unset>") +
      " current=" + (current ? current.name : "<none>") +
      " currentKey=" + (current ? current.key : "<none>") +
      " phase=" + (game ? game.phase : "<none>") +
      " pot=" + (game ? game.pot : 0) +
      " command=" + (record && record.message ? normalizeText(record.message) : "<none>") +
      " amount=" + (record && record.message ? parseAmount(record.message) : 0) +
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
      addGameLog("DEBUG " + reason + ": " + (getActionStatusText() || detail));
      renderLog();
    }
  }

  function isActionText(text) {
    return text === "check" || text === "call" || text === "fold" || text.indexOf("bet") === 0 || text.indexOf("raise") === 0;
  }

  function parseAmount(text) {
    const match = String(text || "").match(/(\d[\d,]*)\s*k?/i);
    if (!match) return 0;
    let amount = parseInt(match[1].replace(/,/g, ""), 10) || 0;
    if (/k/i.test(match[0])) amount *= 1000;
    return amount;
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

  function resolveDealerIndex(players) {
    const previous = State.game;
    if (!previous || !previous.players || !previous.players.length || previous.dealerIndex < 0) return 0;
    const previousDealer = previous.players[previous.dealerIndex];
    if (!previousDealer) return 0;
    let currentIndex = -1;
    for (let i = 0; i < players.length; i += 1) {
      if (players[i].key === previousDealer.key && players[i].stack > 0) {
        currentIndex = i;
        break;
      }
    }
    if (currentIndex < 0) return 0;
    for (let offset = 1; offset <= players.length; offset += 1) {
      const next = (currentIndex + offset) % players.length;
      if (players[next].stack > 0) return next;
    }
    return 0;
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

  function applyResumeProgressForStart(payload, leaderKey) {
    const valid = validateProgressPayload(payload);
    if (!valid.ok) return false;
    const source = valid.payload;
    const priorParty = ensureParty();
    const priorPartyId = priorParty && priorParty.id ? priorParty.id : "";
    const priorPartyMatchesLeader = !!(priorPartyId && priorParty.leaderKey && priorParty.leaderKey === leaderKey);
    State.bankrolls = {};
    const players = [];
    let dealerIndex = -1;
    for (let i = 0; i < source.roster.length; i += 1) {
      const entry = source.roster[i];
      const stack = getProgressBankroll(source, entry.key);
      State.bankrolls[entry.key] = stack;
      if (entry.key === source.dealerKey) dealerIndex = i;
      players.push(makeGamePlayer(entry.key, entry.name, stack));
    }
    if (dealerIndex < 0) return false;
    State.game = {
      active: false,
      finished: true,
      seed: "",
      deck: [],
      players: players,
      community: [],
      pot: 0,
      currentBet: 0,
      currentIndex: 0,
      phase: "finished",
      log: ["Progress imported."],
      handNumber: source.lastHandNumber,
      dealerIndex: dealerIndex,
      smallBlindIndex: 0,
      bigBlindIndex: 0,
      smallBlindAmount: 0,
      bigBlindAmount: 0,
      minRaise: 0,
      lastRaise: 0,
      streetOpenerIndex: -1,
      lastAggressorIndex: -1,
      pots: [],
      potWinnerKeys: {},
      announcement: null,
    };
    const party = defaultPartyState();
    party.id = priorPartyMatchesLeader ? priorPartyId : (State.resume ? State.resume.id : "");
    party.mode = leaderKey === State.localPlayerKey ? "leader" : "member";
    party.leaderKey = leaderKey;
    const leaderEntry = findProgressRosterEntry(source, leaderKey);
    party.leaderName = State.resume && State.resume.leaderName ? State.resume.leaderName : (leaderEntry ? leaderEntry.name : "");
    for (let i = 0; i < source.roster.length; i += 1) {
      const entry = source.roster[i];
      party.members[entry.key] = { key: entry.key, name: entry.name };
      party.order.push(entry.key);
    }
    State.party = party;
    savePartyState();
    return true;
  }

  function resolveDealerOverrideIndex(players, dealerKeyOverride) {
    if (!dealerKeyOverride) return resolveDealerIndex(players);
    const key = normalizePlayerKey(dealerKeyOverride);
    for (let i = 0; i < players.length; i += 1) {
      if (players[i].key === key) return i;
    }
    setStatus("Cannot resume; saved dealer state is invalid.");
    return -1;
  }

  function createGameFromReady(seed, rosterOverride, handNumberOverride, dealerKeyOverride) {
    const override = rosterOverride && rosterOverride.length >= MIN_READY_PLAYERS ? rosterOverride : null;
    const seats = override || getReadySeatArray();
    if (seats.length < MIN_READY_PLAYERS) {
      setStatus("Need 2 ready players to start.");
      return null;
    }
    const players = [];
    const hasBankrollState = Object.keys(State.bankrolls).length > 0;
    for (let i = 0; i < seats.length; i += 1) {
      const seatKey = seats[i].key || seats[i].name;
      const key = normalizePlayerKey(seatKey || seats[i].name);
      const name = seats[i].name || seats[i].key || "Player";
      const prior = State.bankrolls[key];
      const stack = typeof prior === "number" ? prior : (hasBankrollState ? 0 : STARTING_STACK);
      if (key && stack > 0) {
        players.push(makeGamePlayer(key, name, stack));
      }
    }
    if (players.length < MIN_READY_PLAYERS) return null;

    const dealerIndex = resolveDealerOverrideIndex(players, dealerKeyOverride);
    if (dealerIndex < 0) return null;
    const smallBlindIndex = players.length === 2 ? dealerIndex : (dealerIndex + 1) % players.length;
    const bigBlindIndex = (smallBlindIndex + 1) % players.length;
    const handNumber = handNumberOverride ? getBlindLevelForHand(handNumberOverride) : getNextHandNumber();
    const smallBlindAmount = getSmallBlindForHand(handNumber);
    const bigBlindAmount = getBigBlindForHand(handNumber);
    const game = {
      active: true,
      finished: false,
      seed: seed,
      deck: buildDeck(seed),
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
    return game;
  }

  function addGameLogTo(game, text) {
    game.log.push(text);
    while (game.log.length > MAX_GAME_LOG_ENTRIES) game.log.shift();
  }

  function sendStartCommand() {
    const gate = getStartGate(State.readyCountValue || getReadySeatArray().length);
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
    if (!State.game) {
      setStatus("No poker match is active.");
      RenderScheduler.immediate("end-match-invalid");
      return;
    }
    const party = ensureParty();
    if (party.id && party.mode !== "leader") return;
    const endedGame = State.game;
    if (party.id && party.mode === "leader") sendChatMessage(buildMatchEndCommand(endedGame, party.id), true, true);
    PartyReducer.reset(LOBBY_RESET_CASES.endMatch, "end match");
    setStatus("Match ended. Host a party or wait for players to join before showing the table again.");
    RenderScheduler.immediate("end-match");
  }

  function leaveLobby() {
    const party = ensureParty();
    const partyId = party.id || "";
    const activeGame = State.game;
    if (partyId && party.mode === "leader" && activeGame) {
      sendChatMessage(buildMatchEndCommand(activeGame, partyId), true, true);
    }
    if (partyId) {
      sendChatMessage(PARTY_LEAVE_PREFIX + " poker party " + partyId, true, true);
      State.lastLobbyLeaveMs = Date.now();
    }
    PartyReducer.reset(LOBBY_RESET_CASES.leaveLobby, "leave lobby");
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

  function nextActiveIndex(fromIndex) {
    return nextActorIndexFrom(State.game, fromIndex);
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
    announce(String(game.phase || "street").charAt(0).toUpperCase() + String(game.phase || "street").slice(1) + " dealt", getTurnPrompt());
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
    const lateJoinResult = LateJoinQueue.apply(null, "finish");
    PendingSelfAction.clear();
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

  function buildActionTransition(player, action, amount, record, options) {
    const game = State.game;
    const current = getCurrentPlayer();
    const normalizedAmount = amount || 0;
    const transition = {
      ok: false,
      status: "",
      debugReason: "",
      announcement: "",
      advance: false,
      action: action,
      amount: normalizedAmount,
      playerKey: player && player.key ? player.key : "",
      record: record || null,
      suppressRender: !!(options && options.suppressRender),
    };
    if (!game || !game.active) {
      transition.debugReason = "drop-inactive";
      return transition;
    }
    if (!current) {
      transition.debugReason = "drop-no-current";
      return transition;
    }
    if (!player || current.key !== player.key) {
      transition.debugReason = "reject-out-of-turn";
      return transition;
    }

    const toCall = getCallAmount(player);
    const legal = getLegalActions(player);
    if (action === "fold") {
      if (!legal.fold) {
        transition.debugReason = "reject-unknown-action";
        return transition;
      }
      transition.ok = true;
      transition.announcement = player.name + " folds.";
    } else if (action === "check") {
      if (!legal.check) {
        transition.debugReason = "reject-illegal-check";
        return transition;
      }
      transition.ok = true;
      transition.announcement = player.name + " checks.";
    } else if (action === "call") {
      if (!legal.call) {
        transition.debugReason = "reject-illegal-call";
        return transition;
      }
      transition.ok = true;
      transition.amount = Math.min(toCall, player.stack);
      transition.announcement = player.name + " calls $" + transition.amount + ".";
    } else if (action === "bet") {
      if (!legal.canBetTarget(normalizedAmount)) {
        transition.debugReason = "reject-illegal-bet";
        return transition;
      }
      transition.ok = true;
      transition.amount = normalizedAmount;
      transition.announcement = player.name + " bets $" + normalizedAmount + ".";
    } else if (action === "raise") {
      if (!legal.canRaiseTarget(normalizedAmount)) {
        transition.debugReason = "reject-illegal-raise";
        return transition;
      }
      transition.ok = true;
      transition.amount = normalizedAmount;
      transition.announcement = player.name + " raises to $" + normalizedAmount + ".";
    } else {
      transition.debugReason = "reject-unknown-action";
      return transition;
    }
    transition.advance = true;
    return transition;
  }

  function applyActionTransition(transition) {
    if (!transition) return transition;
    const player = transition.playerKey ? findGamePlayerByKey(transition.playerKey) : null;
    if (!transition.ok) {
      if (transition.debugReason === "drop-inactive" || transition.debugReason === "drop-no-current") {
        debugActionState(transition.debugReason + " command=" + transition.action, transition.record, player);
      } else {
        rejectAction(transition.debugReason || "reject-unknown-action", transition.action, transition.amount || 0, transition.record, player);
      }
      return transition;
    }
    const game = State.game;
    if (!game || !game.active || !player) return transition;
    if (transition.action === "fold") {
      player.folded = true;
      player.acted = true;
      addGameLog(player.name + " folds.");
    } else if (transition.action === "check") {
      player.acted = true;
      addGameLog(player.name + " checks.");
    } else if (transition.action === "call") {
      const paid = commitChips(game, player, getCallAmount(player));
      player.acted = true;
      transition.announcement = player.name + " calls $" + paid + ".";
      addGameLog(player.name + " calls $" + paid + ".");
    } else if (transition.action === "bet") {
      const previousCurrentBet = game.currentBet;
      const paidAmount = commitChips(game, player, transition.amount - player.bet);
      game.currentBet = player.bet;
      game.lastRaise = game.currentBet - previousCurrentBet;
      game.minRaise = game.lastRaise;
      game.lastAggressorIndex = game.currentIndex;
      resetOtherActorsForAggression(player);
      player.acted = true;
      transition.announcement = player.name + " bets $" + game.currentBet + ".";
      addGameLog(player.name + " bets $" + paidAmount + ".");
    } else if (transition.action === "raise") {
      const previousCurrentBet = game.currentBet;
      const paidAmount = commitChips(game, player, transition.amount - player.bet);
      game.currentBet = player.bet;
      game.lastRaise = game.currentBet - previousCurrentBet;
      game.minRaise = game.lastRaise;
      game.lastAggressorIndex = game.currentIndex;
      resetOtherActorsForAggression(player);
      player.acted = true;
      transition.announcement = player.name + " raises to $" + game.currentBet + ".";
      addGameLog(player.name + " raises to $" + game.currentBet + " (" + paidAmount + " more).");
    }
    if (transition.advance) completeActionAdvance(transition.record, transition.announcement, transition.suppressRender);
    if (transition.record && transition.record.isSelf) PendingSelfAction.markApplied(getActionCommandText(transition.action, transition.amount));
    return transition;
  }

  function applyLegalAction(player, action, amount, record, options) {
    return applyActionTransition(buildActionTransition(player, action, amount, record, options));
  }

  function completeActionAdvance(record, actionAnnouncement, suppressRender) {
    const game = State.game;
    if (!game || !game.active) return;
    if (activeContestants().length <= 1) awardFoldWin(suppressRender);
    else if (hasBettingRoundSettled()) advancePhase(suppressRender);
    else {
      game.currentIndex = nextActiveIndex(game.currentIndex);
      announce(actionAnnouncement || "Next turn", getTurnPrompt());
    }
    if (!suppressRender) RenderScheduler.defer("game-advance");
  }


  function createEngineGame(options) {
    options = options || {};
    const seats = options.seats || getReadySeatArray();
    const previousBankrolls = State.bankrolls;
    if (options.bankrolls) State.bankrolls = options.bankrolls;
    const game = createGameFromReady(options.seed, seats, options.handNumberOverride, options.dealerKeyOverride);
    if (options.bankrolls) State.bankrolls = previousBankrolls;
    return game ? { ok: true, game: game } : { ok: false, status: "Need 2 ready players to start." };
  }


  const PokerEngine = {
    createGame: createEngineGame,
    getLegalActions: getLegalActions,
    describeTurn: describeEngineTurn,
    buildActionTransition: buildActionTransition,
    applyAction: applyLegalAction,
    advanceAfterAction: completeActionAdvance,
    buildPots: buildPots,
    showdown: showdown,
    evaluateHand: evaluateHand,
    compareHands: compareHands,
  };

  function findGamePlayerByKey(key) {
    if (!State.game) return null;
    for (let i = 0; i < State.game.players.length; i += 1) if (State.game.players[i].key === key) return State.game.players[i];
    return null;
  }

  function findGamePlayer(sender) {
    return findGamePlayerByKey(normalizePlayerKey(sender));
  }

  function clearPendingSelfAction() {
    try {
      delete getConfig()[PENDING_SELF_ACTION_KEY];
    } catch (e) {}
  }

  function recordPendingSelfAction(command, local, game) {
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

  function readPendingSelfAction() {
    let pending = null;
    try {
      pending = getConfig()[PENDING_SELF_ACTION_KEY];
    } catch (e) {
      pending = null;
    }
    const game = State.game;
    const current = getCurrentPlayer();
    if (!pending || !game || !game.active || !current) {
      clearPendingSelfAction();
      return null;
    }
    if (Date.now() > Number(pending.expiresAt || 0)) {
      clearPendingSelfAction();
      return null;
    }
    if (pending.phase !== game.phase || pending.currentIndex !== game.currentIndex || normalizePlayerKey(pending.playerKey) !== current.key) {
      clearPendingSelfAction();
      return null;
    }
    return pending;
  }

  function resolvePendingSelfRecord(record, text) {
    if (!record || !record.isSelf || !isUnknownSender(record.sender)) return record;
    if (!isActionText(text)) return record;
    const pending = readPendingSelfAction();
    if (!pending) return record;
    if (normalizeText(pending.message) !== normalizeText(text)) return record;
    if (!pending.playerName || isUnknownSender(pending.playerName)) return record;
    const resolved = copyChatRecord(record);
    if (!resolved) return record;
    resolved.sender = pending.playerName;
    rememberLocalPlayer(pending.playerName);
    return resolved;
  }

  function markPendingSelfActionApplied(command) {
    const pending = readPendingSelfAction();
    if (!pending) return false;
    if (normalizeText(pending.message) !== normalizeText(command)) return false;
    clearPendingSelfAction();
    return true;
  }

  const PendingSelfAction = {
    record: recordPendingSelfAction,
    read: readPendingSelfAction,
    clear: clearPendingSelfAction,
    resolveSelfRecord: resolvePendingSelfRecord,
    markApplied: markPendingSelfActionApplied,
  };

  function resolveSelfRecord(record) {
    if (!record || !record.isSelf) return record;
    if (!isUnknownSender(record.sender)) {
      rememberLocalPlayer(record.sender);
      return record;
    }
    const localPlayer = findGamePlayerByKey(State.localPlayerKey);
    const rememberedName = getRememberedLocalPlayerName();
    const name = localPlayer ? localPlayer.name : rememberedName;
    if (!name) return PendingSelfAction.resolveSelfRecord(record, normalizeText(record.message));
    const resolved = copyChatRecord(record);
    if (!resolved) return record;
    resolved.sender = name;
    rememberLocalPlayer(name);
    return resolved;
  }

  function resolveUnknownActionRecord(record, text) {
    if (!record || record.isSelf || !isUnknownSender(record.sender) || !isActionText(text)) return record;
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
    if (!isLegalLocalCommand(text, current)) return record;
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
    return applyResumeStartCommand(decodePokerCommand(pending.record));
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
    if (!party.id || party.mode === "none" || party.leaderKey !== expectedLeaderKey) return record;
    const entry = findProgressRosterEntry(resume.payload, expectedLeaderKey);
    if (!entry || getProgressBankroll(resume.payload, expectedLeaderKey) <= 0) return record;
    const resolved = copyChatRecord(record) || {};
    resolved.sender = party.leaderName || resume.hostedLeaderName || entry.name || expectedLeaderKey;
    log("resolved unknown resume start sender to party leader " + resolved.sender);
    return resolved;
  }

  function getProgressTransfer(id, checksum, count) {
    const key = id + ":" + checksum;
    State.progressTransfers = State.progressTransfers || {};
    let transfer = State.progressTransfers[key];
    if (!transfer || transfer.count !== count) {
      transfer = { id: id, checksum: checksum, count: count, chunks: {} };
      State.progressTransfers[key] = transfer;
    }
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
    const imported = importProgressSaveCode(code, true);
    if (!imported.ok) return imported;
    return { ok: true, id: id, code: code, payload: imported.payload };
  }

  function applyProgressShareMessage(message) {
    if (!message || !message.id || !message.checksum || !message.count) return ignoredCommandEffect("progress-share");
    if (message.record && message.record.isSelf) return consumedNoChangeEffect("progress-self");
    if (message.type === "offer") {
      getProgressTransfer(message.id, message.checksum, message.count);
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
    const boundHostedLeader = bindHostedSharedProgressAuthority(imported, message.record);
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

  function applyProgressCommand(command, resolvedRecord) {
    return ProgressResume.applyShare({
      type: command.type === "progress-offer" ? "offer" : "chunk",
      id: command.id,
      checksum: command.checksum,
      count: command.count,
      index: command.index || 0,
      chunk: command.chunk || "",
      record: resolvedRecord,
    });
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
      LateJoinQueue.apply(decodedRoster, "start");
      State.game = createGameFromReady(seed, decodedRoster, command.handNumber || undefined);
      if (State.game) {
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
    State.game = createGameFromReady(seed + " " + resolvedRecord.sender);
    if (State.game) {
      log("game started seed " + seed);
      return changedCommandEffect("Poker started. " + getCurrentPlayer().name + " acts first.", "start");
    }
    return consumedNoChangeEffect("start");
  }

  function applyUnsupportedAllInCommand(command, resolvedRecord) {
    debugActionState("reject-unknown-action command=" + command.text, resolvedRecord, findGamePlayer(resolvedRecord.sender));
    return rejectedCommandEffect("", "debug");
  }

  function applyActionCommand(command, resolvedRecord) {
    const text = command.text || command.action || "";
    if (!State.game || !State.game.active) {
      debugActionState("drop-no-active-game message=" + text, resolvedRecord, null);
      return rejectedCommandEffect("", "debug");
    }
    const actionRecord = resolveUnknownActionRecord(resolvedRecord, text);
    const player = findGamePlayer(actionRecord.sender);
    if (!player) {
      debugActionState("reject-unknown-sender command=" + text + " amount=" + command.amount + " toCall=0 minRaise=" + (State.game ? State.game.minRaise || getCurrentBigBlind(State.game) : BIG_BLIND) + " currentBet=" + (State.game ? State.game.currentBet : 0) + " playerBet=<none> playerStack=<none> playerCommitted=<none>", actionRecord, null);
      return rejectedCommandEffect("", "debug");
    }
    State.reducerActionStatus = "";
    const transition = applyLegalAction(player, command.action, command.amount || 0, actionRecord, { suppressRender: true });
    const status = State.reducerActionStatus || "";
    State.reducerActionStatus = "";
    if (!transition || !transition.ok) return rejectedCommandEffect("", transition && transition.debugReason ? transition.debugReason : "action");
    return changedCommandEffect(status, "action");
  }

  const COMMAND_HANDLERS = {
    "party-leader": applyPartyCommand,
    "party-join": applyPartyCommand,
    "party-leave": applyPartyCommand,
    "match-end": applyMatchEndCommand,
    "progress-offer": applyProgressCommand,
    "progress-chunk": applyProgressCommand,
    "resume-leader": applyResumeAuthorityCommand,
    "resume-ready": applyResumeAuthorityCommand,
    "resume-start": applyResumeStartCommand,
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

  function processChatPayload(event) {
    return CommandReducer.applyPayload(event);
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
    { family: "action", type: "all-in-unsupported", exact: ["all in", "allin"] },
    { family: "action", type: "action", pattern: /^(check|call|fold|bet(?:\s+\$\d+)?|raise(?:\s+\$\d+)?)$/i },
    { family: "ignored", type: "ignored" },
  ];

  function decodePokerCommand(record) {
    const resolved = resolveSelfRecord(record);
    const rawText = String(resolved && resolved.message || "").replace(/^\s+|\s+$/g, "");
    const text = normalizeText(rawText);
    const ignored = { type: "ignored", family: "ignored", record: resolved || record, text: text };
    if (!resolved || !text) return ignored;
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
      } else if (definition.type === "action") {
        const action = (match && match[1] ? match[1] : text).toLowerCase();
        command.action = action.indexOf("bet") === 0 ? "bet" : (action.indexOf("raise") === 0 ? "raise" : action);
        command.amount = parseAmount(text);
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

  function applyChatRecord(record) {
    return applyPokerCommand(decodePokerCommand(record)) || ignoredCommandEffect("record");
  }

  function applyChatPayload(event) {
    PokerMetrics.increment("chatPayload");
    if (event && event.action === "snapshot") PokerMetrics.increment("chatSnapshotReplay");
    if (!event) return applyReducerEffect(ignoredCommandEffect("payload"), false);
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
      return applyReducerEffect(aggregate, false);
    }
    if (event.seq && event.seq <= State.processedChatSeq) return applyReducerEffect(ignoredCommandEffect("old-seq"), false);
    State.processedChatSeq = Math.max(State.processedChatSeq, event.seq || 0);
    return applyReducerEffect(applyChatRecord(event), false);
  }

  const CommandReducer = {
    decode: decodePokerCommand,
    apply: applyPokerCommand,
    applyRecord: applyChatRecord,
    applyPayload: applyChatPayload,
  };

  function isLegalLocalCommand(command, player) {
    const text = normalizeText(command);
    const legal = getLegalActions(player);
    if (text === "check") return legal.check;
    if (text === "call") return legal.call;
    if (text === "fold") return legal.fold;
    if (text.indexOf("bet") === 0) return legal.canBetTarget(parseAmount(text));
    if (text.indexOf("raise") === 0) return legal.canRaiseTarget(parseAmount(text));
    return false;
  }

  function validateLocalActionCommand(command) {
    const current = getCurrentPlayer();
    const local = getLocalPlayer();
    const phase = State.game ? State.game.phase : "lobby";
    const turn = current && local ? PokerEngine.describeTurn(State.game, current.key, local.key) : null;
    const toCall = turn ? turn.toCall : (local ? getCallAmount(local) : 0);
    if (!State.game || !State.game.active || !current) {
      return { ok: false, status: "No active synced hand is waiting for an action." };
    }
    if (!local) {
      return { ok: false, status: "Chat sender unknown. Type ready or reopen party chat so Deadlock exposes your name before acting." };
    }
    if (current.key !== local.key) {
      return { ok: false, status: "Waiting for " + current.name + ". You are " + local.name + "." };
    }
    if (!isLegalLocalCommand(command, local)) {
      return { ok: false, status: "Action no longer legal for " + local.name + ". Waiting for " + current.name + "." };
    }
    return { ok: true, current: current, local: local, phase: phase, toCall: toCall };
  }


  function sendAction(command, label) {
    const result = validateLocalActionCommand(command);
    if (!result.ok) {
      setStatus(result.status);
      RenderScheduler.immediate("send-action-invalid");
      return;
    }
    PendingSelfAction.record(command, result.local, State.game);
    log("action click label=" + (label || command) + " command=" + command + " phase=" + result.phase + " current=" + (result.current ? result.current.name : "<none>") + " toCall=" + result.toCall);
    sendChatMessage(command);
  }

  function renderCommunity() {
    if (!isValid(State.community)) return;
    const cards = State.game ? State.game.community : [];
    State.renderCache.communityCards = State.renderCache.communityCards || [];
    for (let i = 0; i < 5; i += 1) {
      let panel = State.renderCache.communityCards[i];
      if (!isValid(panel)) {
        panel = CardPresenter.render(State.community, null, false);
        State.renderCache.communityCards[i] = panel;
      }
      CardPresenter.update(panel, cards[i] || null, false);
    }
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

  function createPotChipRow(parent, model) {
    const panel = createPanel("Panel", parent, "", "PokerPotChip " + model.className);
    const image = createPanel("Image", panel, "", "PokerPotChipImage");
    const count = createLabel(panel, "PokerPotChipCount", "");
    return { panel: panel, image: image, count: count };
  }

  function updatePotChipRow(row, model) {
    if (!row || !model) return;
    setPanelClass(row.panel, model.className, true);
    setImageSource(row.image, getPotChipArtSrc(model.asset));
    setText(row.count, model.count > 1 ? "x" + model.count : "");
  }

  function deletePotChipRow(row) {
    deletePanel(row && row.panel);
  }

  function renderPotCenter(game) {
    if (!isValid(State.potCenter)) return;
    const amount = game ? Math.max(0, Math.floor(Number(game.pot) || 0)) : 0;
    animatePotAmount(amount);
    const chips = getPotChipArtRows(amount);
    if (!isValid(State.potChips)) return;
    setPanelClass(State.potChips, CLASSES.hidden, chips.length === 0);
    State.renderCache.potChipRows = State.renderCache.potChipRows || {};
    State.renderCache.potChipOrderKey = chips.map((chip) => chip.key + ":" + chip.count).join("|") || "empty";
    updateKeyedRows(State.renderCache.potChipRows, State.potChips, chips, createPotChipRow, updatePotChipRow, deletePotChipRow);
  }

  function makeRenderPlayer(key, name, stack, result) {
    return { key: key, name: name, stack: stack, bet: 0, cards: [], folded: false, result: result || "" };
  }

  function createHoleCards(parent) {
    return [CardPresenter.render(parent, null, true), CardPresenter.render(parent, null, true)];
  }


  function updateRenderedCardModels(cards, models) {
    CardPresenter.update(cards[0], models && models[0] || null, true);
    CardPresenter.update(cards[1], models && models[1] || null, true);
  }

  function applyRenderClasses(panel, classes) {
    classes = classes || {};
    setPanelClass(panel, CLASSES.current, !!classes.current);
    setPanelClass(panel, CLASSES.folded, !!classes.folded);
    setPanelClass(panel, CLASSES.eliminated, !!classes.eliminated);
    setPanelClass(panel, CLASSES.winner, !!classes.winner);
  }



  function getPlayerRenderSource() {
    const game = State.game;
    if (game && game.players.length) return game.players.slice(0, MAX_TABLE_PLAYERS);
    const resume = State.resume;
    if (resume && resume.payload && resume.payload.roster && resume.payload.roster.length) {
      const roster = [];
      for (let i = 0; i < resume.payload.roster.length; i += 1) {
        const entry = resume.payload.roster[i];
        const key = normalizePlayerKey(entry.key || entry.name);
        const stack = getProgressBankroll(resume.payload, key);
        if (!key || stack <= 0) continue;
        let state = "WAITING";
        if (resume.leaderKey === key) state = "LEADER";
        else if (resume.ready && resume.ready[key]) state = "READY";
        roster.push(makeRenderPlayer(key, entry.name || key, stack, state));
      }
      if (roster.length) return roster;
    }
    const readySeats = getReadySeatArray().map((seat) => makeRenderPlayer(normalizePlayerKey(seat.name), seat.name, STARTING_STACK));
    if (readySeats.length) return readySeats;
    const party = ensureParty();
    if (!State.requiresProgressImport && !(State.resume && State.resume.id) && party && party.order && party.order.length >= MIN_READY_PLAYERS) {
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

  function createPlayerRow(parent) {
    const row = createPanel("Panel", parent, "", "PokerPlayerRow");
    const info = createPanel("Panel", row, "", "PokerPlayerInfo");
    return {
      row: row,
      name: createLabel(info, "PokerPlayerName", ""),
      stack: createLabel(info, "PokerPlayerStack", ""),
      cards: createHoleCards(createPanel("Panel", row, "", "PokerHoleCards")),
      state: createLabel(row, "PokerPlayerState", ""),
    };
  }

  function updatePlayerRow(row, model) {
    applyRenderClasses(row.row, model.classes);
    setText(row.name, model.name || "Player");
    setText(row.stack, model.stackText);
    updateRenderedCardModels(row.cards, model.cards);
    setText(row.state, model.stateText);
  }

  function deletePlayerRow(row) {
    deletePanel(row && row.row);
  }

  function renderPlayers() {
    if (!isValid(State.players)) return;
    const metricStarted = PokerMetrics.start("renderPlayers");
    const rows = buildPlayerRenderModel();
    const orderKey = rows.map((row) => row.key).join("|");
    if (State.renderCache.playerOrderKey && State.renderCache.playerOrderKey !== orderKey) {
      clearChildren(State.players);
      State.renderCache.playerRows = {};
    }
    State.renderCache.playerOrderKey = orderKey;
    State.renderCache.playerRows = State.renderCache.playerRows || {};
    updateKeyedRows(State.renderCache.playerRows, State.players, rows, createPlayerRow, updatePlayerRow, deletePlayerRow);
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

  function buildPlayerRenderModel() {
    const game = State.game;
    const source = getPlayerRenderSource();
    const rows = [];
    for (let i = 0; i < source.length; i += 1) {
      rows.push(buildSharedPlayerProjection(game, source[i], i));
    }
    return rows;
  }

  function buildTableRenderModel() {
    const game = State.game;
    const source = getPlayerRenderSource();
    const visible = source.slice(0, TABLE_EDGE_SEAT_LIMIT);
    const densityClass = visible.length <= 6 ? "SeatScaleLarge" : (visible.length <= 8 ? "SeatScaleMedium" : "SeatScaleCompact");
    const rows = [];
    for (let i = 0; i < visible.length; i += 1) {
      const player = visible[i];
      const projection = buildSharedPlayerProjection(game, player, i);
      rows.push({
        key: projection.key,
        name: projection.name,
        initial: getPlayerInitial(projection.name),
        stackText: projection.stackText,
        stateText: projection.stateText,
        cards: projection.cards,
        positionClass: getTableSeatPositionClass(i, Math.min(source.length, TABLE_EDGE_SEAT_LIMIT)),
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

  function updateKeyedRows(cache, parent, models, createRow, updateRow, deleteRow) {
    const seen = {};
    const rows = models || [];
    for (let i = 0; i < rows.length; i += 1) {
      const model = rows[i];
      const key = model.key || ("row" + i);
      seen[key] = true;
      let row = cache[key];
      if (!row || !isValid(row.panel || row.row || row.seat || row)) {
        row = createRow(parent, model, i);
        cache[key] = row;
      }
      updateRow(row, model, i);
    }
    const keys = Object.keys(cache);
    for (let i = 0; i < keys.length; i += 1) {
      if (seen[keys[i]]) continue;
      if (deleteRow) deleteRow(cache[keys[i]]);
      delete cache[keys[i]];
    }
  }

  function getTableSeatPositionClass(index, count) {
    const visibleCount = Math.min(TABLE_EDGE_SEAT_LIMIT, Math.max(1, count || 1));
    const layout = TABLE_SEAT_LAYOUTS[visibleCount] || TABLE_SEAT_LAYOUTS[TABLE_EDGE_SEAT_LIMIT];
    return layout[index] || "";
  }


  function getPlayerInitial(name) {
    const text = String(name || "P").trim();
    return text ? text.charAt(0).toUpperCase() : "P";
  }


  function renderTableTurnArrow(visible, game) {
    if (!isValid(State.tableSeats)) return;
    const activeIndex = game && game.active ? Math.floor(Number(game.currentIndex) || 0) : -1;
    const hasActiveSeat = activeIndex >= 0 && activeIndex < visible.length;
    const positionClass = hasActiveSeat ? getTableSeatPositionClass(activeIndex, Math.min(visible.length, TABLE_EDGE_SEAT_LIMIT)) : "";
    const nextClass = positionClass;
    if (!isValid(State.renderCache.tableTurnArrow)) {
      State.renderCache.tableTurnArrow = createPanel("Panel", State.tableSeats, "", "PokerTableTurnArrow PokerHidden");
      State.renderCache.tableTurnArrowClass = "";
    }
    const arrow = State.renderCache.tableTurnArrow;
    if (State.renderCache.tableTurnArrowClass !== nextClass) {
      if (State.renderCache.tableTurnArrowClass) setPanelClass(arrow, State.renderCache.tableTurnArrowClass, false);
      if (nextClass) setPanelClass(arrow, nextClass, true);
      State.renderCache.tableTurnArrowClass = nextClass;
    }
    setPanelClass(arrow, CLASSES.hidden, !nextClass);
  }

  function createTableSeatRow(parent) {
    const seat = createPanel("Panel", parent, "", "PokerTableSeat");
    const cards = createHoleCards(createPanel("Panel", seat, "", "PokerTableSeatCards"));
    const row = createPanel("Panel", seat, "", "PokerTableSeatMetaRow");
    const avatar = createPanel("Panel", row, "", "PokerTableSeatAvatar");
    const text = createPanel("Panel", row, "", "PokerTableSeatText");
    return {
      seat: seat,
      avatarLabel: createLabel(avatar, "", ""),
      name: createLabel(text, "PokerTableSeatName", ""),
      stack: createLabel(text, "PokerTableSeatStack", ""),
      state: createLabel(text, "PokerTableSeatState", ""),
      cards: cards,
      positionClass: "",
      densityClass: "",
    };
  }

  function updateTableSeatRow(row, model) {
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
    updateRenderedCardModels(row.cards, model.cards);
  }

  function deleteTableSeatRow(row) {
    deletePanel(row && row.seat);
  }

  function renderTableSeats() {
    if (!isValid(State.tableSeats)) return;
    const metricStarted = PokerMetrics.start("renderTableSeats");
    const model = buildTableRenderModel();
    const orderKey = model.rows.map((row) => row.key).join("|");
    if (State.renderCache.tableSeatOrderKey !== orderKey) {
      clearChildren(State.tableSeats);
      State.renderCache.tableSeatRows = {};
      State.renderCache.tableTurnArrow = null;
      State.renderCache.tableTurnArrowClass = "";
    }
    State.renderCache.tableSeatOrderKey = orderKey;
    State.renderCache.tableSeatRows = State.renderCache.tableSeatRows || {};
    updateKeyedRows(State.renderCache.tableSeatRows, State.tableSeats, model.rows, createTableSeatRow, updateTableSeatRow, deleteTableSeatRow);
    renderTableTurnArrow(model.rows, State.game);
    PokerMetrics.end("renderTableSeats", metricStarted);
  }

  function getActionChoiceKey(choice) {
    return (choice.command || "") + "|" + (choice.className || "PokerActionButton");
  }

  function getActionOrderKey(choices, hasHint) {
    const rows = choices || [];
    const keys = [];
    for (let i = 0; i < rows.length; i += 1) keys.push(getActionChoiceKey(rows[i]));
    return (hasHint ? "hint:" : "buttons:") + keys.join("||");
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

  function isCustomBetAmountLegal(range, amount) {
    if (!range || !isFinite(amount)) return false;
    const game = State.game;
    const player = getLocalPlayer();
    if (!game || !player) return false;
    const legal = getLegalActions(player);
    if (amount < range.min || amount > range.max) return false;
    return range.action === "bet" ? legal.canBetTarget(amount) : legal.canRaiseTarget(amount);
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
    const legal = validNumber && isCustomBetAmountLegal(range, amount);
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
    setText(controls.value, getCustomBetCommandLabel(range, displayAmount));
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
      if (range) setStatus("Raise must be between $" + range.min + " and $" + range.max + ".");
      return;
    }
    State.renderCache.customBetValue = draft.amount;
    const command = range.action + " $" + draft.amount;
    sendAction(command, getCustomBetCommandLabel(range, draft.amount));
  }

  function createActionButtonRow(parent, choice) {
    const button = createPanel("Button", parent, "", choice.className || "PokerActionButton");
    const label = createLabel(button, "PokerActionButtonLabel", "");
    return { panel: button, button: button, label: label, lastCommand: "", lastLabel: "", lastEnabled: null, lastReadOnly: null };
  }

  function updateActionButtonRow(row, choice) {
    const enabled = choice.enabled !== false;
    const readOnly = !!choice.readOnly;
    Affordance.button(row.button, { enabled: enabled, hidden: false, eligible: enabled, readOnly: readOnly });
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
  }

  function deleteActionButtonRow(row) {
    deletePanel(row && row.button);
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
    const state = buttonState || getCurrentButtonState();
    State.renderCache.actionButtons = State.renderCache.actionButtons || {};
    Affordance.hidden(State.actions, state.controls.actionContainer.hidden);
    if (state.controls.actionContainer.hidden) {
      const cachedKeys = Object.keys(State.renderCache.actionButtons);
      deleteActionRows();
      if (isValid(State.renderCache.actionHint)) deletePanel(State.renderCache.actionHint);
      State.renderCache.actionButtons = {};
      State.renderCache.actionHint = null;
      State.renderCache.actionOrderKey = "";
      removeCustomBetControls();
      if (isValid(State.renderCache.actionButtonRow)) deletePanel(State.renderCache.actionButtonRow);
      State.renderCache.actionButtonRow = null;
      PokerMetrics.end("renderActions", metricStarted);
      return;
    }

    const choices = state.actionChoices || [];
    const hasButtons = choices.length > 0;
    const hasHint = !!state.text.actionHint && !hasButtons;
    const orderKey = getActionOrderKey(choices, hasHint);
    if (!hasHint && State.renderCache.actionOrderKey && State.renderCache.actionOrderKey !== orderKey) {
      deleteActionRows();
    }
    State.renderCache.actionOrderKey = orderKey;

    if (hasHint) {
      if (!isValid(State.renderCache.actionHint)) {
        State.renderCache.actionHint = createLabel(State.actions, "PokerActionHint", "");
      }
      setText(State.renderCache.actionHint, state.text.actionHint);
    } else if (isValid(State.renderCache.actionHint)) {
      deletePanel(State.renderCache.actionHint);
      State.renderCache.actionHint = null;
    }

    const buttonParent = getActionButtonParent();
    Affordance.hidden(buttonParent, !hasButtons);
    let customBetChoice = null;
    for (let i = 0; i < choices.length; i += 1) {
      if (choices[i] && choices[i].customBet) {
        customBetChoice = choices[i];
        break;
      }
    }
    updateKeyedRows(State.renderCache.actionButtons, buttonParent, choices, createActionButtonRow, updateActionButtonRow, deleteActionButtonRow);
    if (customBetChoice) {
      renderCustomBetControls(customBetChoice, buttonParent);
    } else {
      removeCustomBetControls();
    }
    PokerMetrics.end("renderActions", metricStarted);
  }

  function renderLog() {
    if (!isValid(State.log)) return;
    const metricStarted = PokerMetrics.start("renderLog");
    const hasGame = !!State.game;
    setPanelClass(State.log, CLASSES.hidden, !hasGame);
    State.renderCache.logRows = State.renderCache.logRows || [];
    if (!hasGame) {
      clearChildren(State.log);
      State.renderCache.logRows = [];
      PokerMetrics.end("renderLog", metricStarted);
      return;
    }
    const entries = State.game.log && State.game.log.length ? State.game.log : ["Hand history will appear here."];
    const start = Math.max(0, entries.length - MAX_GAME_LOG_ENTRIES);
    const visible = entries.slice(start);
    while (State.renderCache.logRows.length > visible.length) {
      deletePanel(State.renderCache.logRows.pop());
    }
    for (let i = 0; i < visible.length; i += 1) {
      let row = State.renderCache.logRows[i];
      if (!isValid(row)) {
        row = createLabel(State.log, "PokerLogLine", "");
        State.renderCache.logRows[i] = row;
      }
      setText(row, visible[i]);
    }
    PokerMetrics.end("renderLog", metricStarted);
  }


  const TableRenderer = {
    buildPlayerRenderModel: buildPlayerRenderModel,
    buildTableRenderModel: buildTableRenderModel,
    renderGame: renderGame,
    renderCommunity: renderCommunity,
    renderPlayers: renderPlayers,
    renderTableSeats: renderTableSeats,
    renderActions: renderActions,
    renderLog: renderLog,
  };

  function renderAnnouncer() {
    if (!isValid(State.announcer)) return;
    const game = State.game;
    const announcement = game && game.announcement;
    const title = announcement && announcement.title ? announcement.title : "Poker announcer";
    const detail = announcement && announcement.detail ? announcement.detail : "Ready up, start a hand, and the table will call blinds, turns, checks, bets, raises, folds, and winners here.";
    const hasWinnerFeedback = !!(game && game.potWinnerKeys && Object.keys(game.potWinnerKeys).length);
    setPanelClass(State.announcer, CLASSES.winner, hasWinnerFeedback);
    setPanelClass(State.announcerTitle, CLASSES.winner, hasWinnerFeedback);
    setPanelClass(State.announcerBody, CLASSES.winner, hasWinnerFeedback);
    setText(State.announcerTitle, title);
    setText(State.announcerBody, detail);
  }


  function updateMatchPanels(buttonState) {
    const hasGame = !!State.game;
    const state = buttonState || getCurrentButtonState();
    setPanelClass(State.tableSurface, CLASSES.hidden, false);
    setPanelClass(State.players, CLASSES.hidden, false);
    setPanelClass(State.seatsList, CLASSES.hidden, true);
    setPanelClass(State.tableSeats, CLASSES.hidden, !hasGame);
    setPanelClass(State.log, CLASSES.hidden, !hasGame);
    Affordance.button(State.endButton, state.controls.endMatch);
    Affordance.button(State.leaveLobbyButton, state.controls.leaveLobby);
  }

  function renderGame() {
    const metricStarted = PokerMetrics.start("renderGame");
    cachePanels();
    if (!shouldRunMenuWork()) {
      PokerMetrics.end("renderGame", metricStarted);
      return;
    }
    const game = State.game;
    const hasGame = !!game;
    const readyCount = State.readyCountValue || getReadySeatArray().length;
    const buttonState = getCurrentButtonState(readyCount);
    renderPotCenter(game);
    setText(State.phase, game ? String(game.phase || "lobby").toUpperCase() : "LOBBY");
    updateMatchPanels(buttonState);
    if (game && game.active) setStatus(buttonState.text.actionHint || getActionStatusText());
    renderAnnouncer();
    renderCommunity();
    renderPlayers();
    if (hasGame) renderTableSeats();
    renderActions(buttonState);
    renderLog();
    renderProgressControls(buttonState);
    updateStartButton(readyCount, buttonState);
    PokerMetrics.end("renderGame", metricStarted);
  }

  function flushScheduledRender() {
    State.renderCache.renderQueued = false;
    State.renderCache.renderReason = "";
    PokerMetrics.increment("renderFlush");
    if (shouldRunMenuWork()) renderGame();
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
    if (shouldRunMenuWork()) renderGame();
  }

  function isRenderQueued() {
    return !!State.renderCache.renderQueued;
  }

  const RenderScheduler = {
    defer: deferRender,
    immediate: immediateRender,
    flush: flushScheduledRender,
    isQueued: isRenderQueued,
  };

  function requestRender(reason) {
    RenderScheduler.defer(reason);
  }

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

  function getCachedPanel(stateKey) {
    const key = String(stateKey || "");
    if (!key || !Object.prototype.hasOwnProperty.call(State, key)) return null;
    const panel = State[key];
    return isValid(panel) ? panel : null;
  }

  function resetRenderChildCache() {
    const cache = State.renderCache || {};
    for (const key of [
      "communityCards", "playerRows", "playerOrderKey", "tableSeatRows", "tableSeatOrderKey",
      "tableTurnArrow", "tableTurnArrowClass", "potChipRows", "potChipOrderKey",
      "actionButtons", "actionHint", "actionOrderKey", "actionButtonRow",
      "customBetControls", "customBetChoice", "customBetRange", "customBetRangeKey",
      "logRows", "readySeatOrderKey", "readySeatParent", "resumeLeaderOrderKey", "resumeLeaderParent",
    ]) {
      if (!Object.prototype.hasOwnProperty.call(cache, key)) continue;
      if (/Rows$|Cards$|Buttons$/.test(key)) cache[key] = Array.isArray(cache[key]) ? [] : {};
      else cache[key] = key.indexOf("OrderKey") >= 0 || key.indexOf("Class") >= 0 ? "" : null;
    }
  }

  function invalidatePanelCache(reason) {
    for (let i = 0; i < PANEL_BINDINGS.length; i += 1) State[PANEL_BINDINGS[i][0]] = null;
    State.root = null;
    State.chat = null;
    State.chatInput = null;
    State.chatTargetLabel = null;
    resetRenderChildCache();
    State.renderCache.panelInvalidationReason = reason || "";
    return true;
  }

  const PanelCache = {
    refresh: cachePanels,
    get: getCachedPanel,
    invalidate: invalidatePanelCache,
    hasRequired: hasRequiredPanels,
  };

  function getCommandBindings() {
    return [
      ["PokerEscapeMenuToggle", "menuButton", toggleOpen], ["PokerEscapeMenuClose", "closeButton", closeMenu], ["PokerEscapeMenuSendReadyChat", "readyChatButton", sendReadyChat],
      ["PokerEscapeMenuStart", "startButton", sendStartCommand], ["PokerEscapeMenuEndMatch", "endButton", endMatch], ["PokerEscapeMenuLeaveLobby", "leaveLobbyButton", leaveLobby],
      ["PokerEscapeMenuHostParty", "partyHostButton", sendPartyLeaderCommand], ["PokerEscapeMenuJoinParty", "partyJoinButton", sendPartyJoinCommand], ["PokerEscapeMenuCopyProgress", "exportProgressButton", copyProgressCode],
      ["PokerEscapeMenuImportProgress", "importProgressButton", importProgressCodeFromInput], ["PokerEscapeMenuResumeLeader", "resumeLeaderButton", sendResumeLeaderCommand], ["PokerEscapeMenuResumeReady", "resumeReadyButton", sendResumeReadyCommand],
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
      party: copyForTest(ensureParty()),
      game: copyForTest(State.game),
      resume: copyForTest(ensureResume()),
      localPlayerKey: State.localPlayerKey || "",
      sync: copyForTest(State.sync),
      status: copyForTest(State.statusModel),
    };
  }

  function seedPartyForTest(entries, partyId, mode) {
    if (!globalThis.__PokerTestMode) return false;
    const roster = resolveRosterNamesFromKnownParty(entries || []);
    State.party = defaultPartyState();
    State.party.id = partyId || "ptest";
    State.party.mode = mode || "leader";
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
        getStartGate: getStartGate,
        updateReadySeats: updateReadySeats,
        handleReadyEvent: handleBridgeEvent,
        requestReadySnapshot: requestReadySnapshot,
        processChatRecord: processChatRecord,
        evaluateHand: evaluateHand,
        compareHands: compareHands,
        createGameFromReady: createGameFromReady,
        encodeRoster: encodeRoster,
        decodeRoster: decodeRoster,
        buildSynchronizedStartCommand: buildSynchronizedStartCommand,
        buildProgressSaveCode: buildProgressSaveCode,
        decodeProgressSaveCode: decodeProgressSaveCode,
        importProgressSaveCode: importProgressSaveCode,
        buildResumeLeaderCommand: buildResumeLeaderCommand,
        buildResumeReadyCommand: buildResumeReadyCommand,
        buildResumeStartCommand: buildResumeStartCommand,
        getResumeGate: getResumeGate,
        getResumeId: getResumeId,
        resolveResumeNextDealerKey: resolveResumeNextDealerKey,
        cryptProgressBytes: cryptProgressBytes,
        textToUtf8Bytes: textToUtf8Bytes,
        getCallAmount: getCallAmount,
        getMinimumRaiseTo: getMinimumRaiseTo,
        getLegalActions: getLegalActions,
        applyLegalAction: applyLegalAction,
        completeActionAdvance: completeActionAdvance,
        hasBettingRoundSettled: hasBettingRoundSettled,
        buildPots: buildPots,
        showdown: showdown,
        modules: {
          StartSync: StartSync,
          CommandReducer: CommandReducer,
          PokerEngine: PokerEngine,
          ProgressResume: ProgressResume,
          PendingSelfAction: PendingSelfAction,
          CardPresenter: CardPresenter,
          TableRenderer: TableRenderer,
          Affordance: Affordance,
          PokerButtonState: PokerButtonState,
          PokerMetrics: PokerMetrics,
          RenderScheduler: RenderScheduler,
          PanelCache: PanelCache,
          PartyReducer: PartyReducer,
          LateJoinQueue: LateJoinQueue,
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
