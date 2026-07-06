(() => {
  "use strict";

  const LOG_PREFIX = "[PokerMenu]";
  const TEST_READY_MESSAGE = "ready";
  const CHAT_RETRY_DELAYS = [0.05, 0.1, 0.2, 0.35, 0.6, 1.0];
  const CHAT_ALL_LABEL = "#citadel_chat_all";
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
    rootButton: "PokerMenuButton",
    panel: "PokerAnitaPanel",
    tableWindow: "PokerTableWindow",
    lobbyWindow: "PokerLobbyWindow",
    playersWindow: "PokerPlayersWindow",
    historyWindow: "PokerHistoryWindow",
    actionsWindow: "PokerActionsWindow",
    closeButton: "PokerCloseButton",
    readyChatButton: "PokerReadyChatButton",
    startButton: "PokerStartButton",
    startButtonLabel: "PokerStartButtonLabel",
    endButton: "PokerEndMatchButton",
    leaveLobbyButton: "PokerLeaveLobbyButton",
    readyCount: "PokerReadyCountLabel",
    seatsList: "PokerSeatsList",
    status: "PokerStatusLabel",
    pot: "PokerPotLabel",
    phase: "PokerPhaseLabel",
    tableSurface: "PokerTableSurface",
    announcer: "PokerAnnouncerOverlay",
    announcerTitle: "PokerAnnouncerTitle",
    announcerBody: "PokerAnnouncerBody",
    community: "PokerCommunityCards",
    players: "PokerPlayersList",
    actions: "PokerActionButtons",
    tableSeats: "PokerTableSeats",
    log: "PokerGameLog",
    chat: "Chat",
    chatControls: "ChatControls",
    chatInput: "ChatInput",
    chatTargetLabel: "ChatTargetLabel",
    partyControls: "PokerPartyControls",
    partyHostButton: "PokerHostPartyButton",
    partyJoinButton: "PokerJoinPartyButton",
    partyStatus: "PokerPartyStatusLabel",
    progressControls: "PokerProgressControls",
    exportProgressButton: "PokerExportProgressButton",
    importProgressButton: "PokerImportProgressButton",
    progressCodeInput: "PokerProgressCodeInput",
    progressCodeLabel: "PokerProgressCodeLabel",
    resumeControls: "PokerResumeControls",
    resumeLeaderButton: "PokerResumeLeaderButton",
    resumeReadyButton: "PokerResumeReadyButton",
    resumeStatus: "PokerResumeStatusLabel",
    resumeLeaderList: "PokerResumeLeaderList",
  };

  const CLASSES = {
    visible: "PokerMenuVisible",
    open: "Open",
    active: "Active",
    eligible: "Eligible",
    disabled: "Disabled",
    readOnly: "ReadOnly",
    hidden: "PokerHidden",
    current: "Current",
    folded: "Folded",
    eliminated: "Eliminated",
    red: "RedSuit",
    black: "BlackSuit",
  };

  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const SUITS = ["S", "H", "D", "C"];
  const TABLE_EDGE_SEAT_LIMIT = 6;
  const TABLE_SEAT_LAYOUTS = {
    1: ["SeatBottom"],
    2: ["SeatLeft", "SeatRight"],
    3: ["SeatLeft", "SeatTopRight", "SeatBottomRight"],
    4: ["SeatTopLeft", "SeatTopRight", "SeatBottomRight", "SeatBottomLeft"],
    5: ["SeatLeft", "SeatTopLeft", "SeatTopRight", "SeatRight", "SeatBottom"],
    6: ["SeatTopLeft", "SeatTopRight", "SeatRight", "SeatBottomRight", "SeatBottomLeft", "SeatLeft"],
  };
  const TABLE_SEAT_POSITION_CLASSES = ["SeatTopLeft", "SeatTopRight", "SeatRight", "SeatBottomRight", "SeatBottomLeft", "SeatLeft", "SeatBottom"];

  const RANK_VALUE = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };

  const State = {
    root: null,
    panel: null,
    tableWindow: null,
    lobbyWindow: null,
    playersWindow: null,
    historyWindow: null,
    actionsWindow: null,
    menuButton: null,
    closeButton: null,
    readyChatButton: null,
    startButton: null,
    startButtonLabel: null,
    endButton: null,
    leaveLobbyButton: null,
    readyCount: null,
    seatsList: null,
    status: null,
    pot: null,
    phase: null,
    tableSurface: null,
    announcer: null,
    announcerTitle: null,
    announcerBody: null,
    community: null,
    players: null,
    tableSeats: null,
    actions: null,
    log: null,
    chat: null,
    chatInput: null,
    chatTargetLabel: null,
    partyControls: null,
    partyHostButton: null,
    partyJoinButton: null,
    partyStatus: null,
    progressControls: null,
    exportProgressButton: null,
    importProgressButton: null,
    progressCodeInput: null,
    progressCodeLabel: null,
    resumeControls: null,
    resumeLeaderButton: null,
    resumeReadyButton: null,
    resumeStatus: null,
    resumeLeaderList: null,
    isOpen: false,
    eventsBound: false,
    readyRevision: -1,
    readyCountValue: 0,
    lastSendMs: 0,
    lastLobbyLeaveMs: 0,
    refreshLoopStarted: false,
    processedChatSeq: 0,
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
      logRows: [],
      tableSeatRows: {},
      tableSeatOrderKey: "",
      tableSeatOverflow: null,
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
    requiresProgressImport: false,
    resumeRequiresHostedParty: false,
  };
  function isValid(panel) {
    return !!(panel && (!panel.IsValid || panel.IsValid()));
  }

  function log(message) {
    try {
      $.Msg(LOG_PREFIX + " " + message);
    } catch (e) {}
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

  function buildProgressPayload() {
    const game = State.game;
    if (!game || !game.finished || game.active) return { ok: false, status: "Finish the current hand before copying progress." };
    const dealer = game.players && game.players[game.dealerIndex];
    if (!dealer || !dealer.key) return { ok: false, status: "Cannot copy progress; dealer state is missing." };
    const bankrolls = {};
    const roster = [];
    const seen = {};
    let positive = 0;
    for (let i = 0; i < game.players.length; i += 1) {
      const player = game.players[i];
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
      dealerKey: normalizePlayerKey(dealer.key),
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
    const parts = [String(game.handNumber || 0), String(game.dealerIndex || 0)];
    for (let i = 0; i < game.players.length; i += 1) {
      const player = game.players[i] || {};
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

  function encodeProgressChatChunk(text) {
    return String(text || "");
  }

  function decodeProgressChatChunk(text) {
    return String(text || "");
  }

  function splitProgressCodeForChat(code) {
    const text = String(code || "");
    const chunks = [];
    for (let i = 0; i < text.length; i += PROGRESS_SHARE_CHUNK_SIZE) {
      chunks.push(encodeProgressChatChunk(text.slice(i, i + PROGRESS_SHARE_CHUNK_SIZE)));
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
    try {
      if (isValid(State.progressCodeInput)) State.progressCodeInput.text = "";
    } catch (e) {}
    setText(State.progressCodeLabel, "Finish a hand to copy progress, or paste a code to resume.");
    saveResumeState();
    if (reason) log("cleared resume state: " + reason);
  }

  function importProgressSaveCode(code) {
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
    renderGame();
    setStatus("Imported progress " + decoded.id + ". Choose a resume leader, then sync resume in chat.");
    return decoded;
  }

  function makePartyId(sender) {
    return "p" + Date.now().toString(36) + "-" + hashString(sender || "leader").toString(36);
  }

  function extractPartyId(record, prefix) {
    const raw = String(record && record.message ? record.message : "");
    const marker = prefix + " poker party ";
    const lower = raw.toLowerCase();
    const index = lower.indexOf(marker);
    if (index < 0) return "";
    const tail = raw.slice(index + marker.length).replace(/^\s+|\s+$/g, "");
    const token = tail.split(/\s+/)[0] || "";
    return token.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  }

  function parsePartyMessage(record) {
    const text = normalizeText(record && record.message);
    if (text.indexOf("party leader poker party ") === 0) return { type: "leader", id: extractPartyId(record, PARTY_LEADER_PREFIX) || text.split(/\s+/).pop() };
    if (text.indexOf("party join poker party ") === 0) return { type: "join", id: extractPartyId(record, PARTY_JOIN_PREFIX) || text.split(/\s+/).pop() };
    if (text.indexOf("party leave poker party ") === 0) return { type: "leave", id: extractPartyId(record, PARTY_LEAVE_PREFIX) || text.split(/\s+/).pop() };
    return null;
  }

  function buildMatchEndCommand(game, partyId) {
    return MATCH_END_PREFIX + " poker party " + partyId + " seed " + ((game && game.seed) || "") + " hand " + ((game && game.handNumber) || 0);
  }

  function parseMatchEndMessage(record) {
    const text = normalizeText(record && record.message);
    if (text.indexOf("match end poker party ") !== 0) return null;
    const id = extractPartyId(record, MATCH_END_PREFIX) || (text.split(/\s+/)[4] || "");
    return { type: "match-end", id: id };
  }

  function recordMatchEnd(record, matchEnd) {
    const party = ensureParty();
    if (!matchEnd || !matchEnd.id || !party.id || party.id !== matchEnd.id) return false;
    if (!record || record.isSelf || isUnknownSender(record.sender)) return false;
    const senderKey = normalizePlayerKey(record.sender);
    if (party.leaderKey && senderKey !== party.leaderKey) {
      debugActionState("reject-non-leader-match-end sender=" + record.sender + " leader=" + party.leaderName, record, null);
      return false;
    }
    const changed = !!(State.game || (State.resume && State.resume.id));
    State.game = null;
    PendingSelfAction.clear();
    clearResumeState("remote match end");
    State.requiresProgressImport = false;
    savePartyState();
    return changed;
  }

  function ensureParty() {
    if (!State.party || typeof State.party !== "object") State.party = defaultPartyState();
    State.party.members = State.party.members || {};
    State.party.order = State.party.order || [];
    return State.party;
  }

  function recordPartyLeader(record, partyId) {
    const party = ensureParty();
    if (State.game && State.game.active) {
      log("party leader ignored during active hand");
      return false;
    }
    if (record && record.isSelf && party.mode === "leader" && isUnknownSender(record.sender)) {
      savePartyState();
      return false;
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
      savePartyState();
      return true;
    }
    if (!record || isUnknownSender(record.sender)) return false;
    const key = normalizePlayerKey(record.sender);
    party.id = partyId || party.id;
    party.mode = record.isSelf ? "leader" : "none";
    party.leaderKey = key;
    party.leaderName = record.sender;
    party.members = {};
    party.members[key] = { key: key, name: record.sender };
    party.order = [key];
    if (record.isSelf) rememberLocalPlayer(record.sender);
    savePartyState();
    return true;
  }

  function recordPartyJoin(record, partyId) {
    const party = ensureParty();
    if (!party.id || party.id !== partyId) return false;
    if (!record || isUnknownSender(record.sender)) return false;
    const key = normalizePlayerKey(record.sender);
    if (!party.members[key]) party.order.push(key);
    party.members[key] = { key: key, name: record.sender };
    if (record.isSelf) {
      party.mode = "member";
      rememberLocalPlayer(record.sender);
    }
    savePartyState();
    shareImportedProgressFromHostedLeader("party-join-import");
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

  function removeGamePlayerForLeave(key, name) {
    const normalized = normalizePlayerKey(key);
    const game = State.game;
    if (!normalized || !game || !game.players || !game.players.length) return false;
    let index = -1;
    for (let i = 0; i < game.players.length; i += 1) {
      if (game.players[i].key === normalized) {
        index = i;
        break;
      }
    }
    if (index < 0) return false;
    const player = game.players[index];
    const label = name || player.name || "Player";
    if (game.active) {
      player.folded = true;
      player.acted = true;
      addGameLog(label + " left the lobby and folds.");
      if (activeContestants().length <= 1) awardFoldWin();
      else if (game.currentIndex === index) {
        game.currentIndex = nextActiveIndex(index);
        announce(label + " left the lobby", getTurnPrompt());
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
    if (!party.id || party.id !== partyId) return false;
    if (!record || isUnknownSender(record.sender)) return false;
    const key = normalizePlayerKey(record.sender);
    const name = record.sender;
    let changed = false;
    if (party.members[key]) {
      delete party.members[key];
      changed = true;
    }
    const nextOrder = [];
    for (let i = 0; i < party.order.length; i += 1) {
      const orderedKey = normalizePlayerKey(party.order[i]);
      if (orderedKey && orderedKey !== key) nextOrder.push(orderedKey);
    }
    if (nextOrder.length !== party.order.length) changed = true;
    party.order = nextOrder;
    const resetLobby = party.leaderKey === key || record.isSelf;
    const readyLeaveChanged = resetLobby
      ? clearReadySeats(record.isSelf ? "self leave" : "leader leave")
      : (record.isSelf ? clearReadySeats("self leave") : forgetReadySeat(key));
    if (resetLobby) {
      State.party = defaultPartyState();
      State.game = null;
      State.bankrolls = {};
      PendingSelfAction.clear();
      clearResumeState(record.isSelf ? "self leave" : "leader leave");
      State.requiresProgressImport = false;
      State.resumeRequiresHostedParty = true;
      changed = readyLeaveChanged || changed;
    } else {
      changed = readyLeaveChanged || changed;
      changed = removeGamePlayerForLeave(key, name) || changed;
    }
    savePartyState();
    return changed;
  }

  function getPartyRoster() {
    const party = ensureParty();
    const roster = [];
    for (let i = 0; i < party.order.length; i += 1) {
      const key = normalizePlayerKey(party.order[i]);
      const member = party.members[key];
      if (member && member.key && member.name && !isUnknownSender(member.name)) roster.push({ key: member.key, name: member.name });
    }
    return roster;
  }

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
      if (knownName && !isUnknownSender(knownName) && knownName.length > name.length) name = knownName;
      resolved.push({ key: key, name: name });
    }
    return resolved;
  }

  function getQueuedLateJoiners(rosterOverride) {
    const source = rosterOverride || getPartyRoster();
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
      const key = String(player.key || player.name || "");
      if (key.indexOf(" ") >= 0) return encodeURIComponent(key);
      return encodeURIComponent(key) + "~" + encodeURIComponent(player.name || key);
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

  function buildResumeStartCommand(id, leaderKey, roster, handNumber, seed) {
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

  function extractResumeId(record) {
    const raw = String(record && record.message ? record.message : "");
    const lower = raw.toLowerCase();
    const marker = "poker resume ";
    const index = lower.indexOf(marker);
    if (index < 0) return "";
    const tail = raw.slice(index + marker.length).replace(/^\s+|\s+$/g, "");
    const token = tail.split(/\s+/)[0] || "";
    return token.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 40);
  }

  function parseResumeMessage(record) {
    const text = normalizeText(record && record.message);
    if (text.indexOf("resume leader poker resume ") === 0) return { type: "leader", id: extractResumeId(record) };
    if (text.indexOf("resume ready poker resume ") === 0) return { type: "ready", id: extractResumeId(record) };
    return null;
  }

  function parseProgressShareMessage(record) {
    const raw = String(record && record.message ? record.message : "").replace(/^\s+|\s+$/g, "");
    let match = raw.match(/^\[progress offer\]\s+poker\s+progress\s+([a-z0-9-]+)\s+([0-9a-f]{8})\s+([1-9]\d*)$/i);
    if (match) {
      return { type: "offer", id: match[1].toLowerCase(), checksum: match[2].toLowerCase(), count: Math.floor(Number(match[3])) };
    }
    match = raw.match(/^\[progress chunk\]\s+poker\s+progress\s+([a-z0-9-]+)\s+([0-9a-f]{8})\s+([1-9]\d*)\/([1-9]\d*)\s+([A-Za-z0-9_-]+)$/i);
    if (match) {
      return {
        type: "chunk",
        id: match[1].toLowerCase(),
        checksum: match[2].toLowerCase(),
        index: Math.floor(Number(match[3])),
        count: Math.floor(Number(match[4])),
        chunk: match[5],
      };
    }
    return null;
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
    renderGame();
    setStatus(record.isSelf ? "Resume leader selected: " + record.sender + ". Waiting for saved players to mark resume ready." : "Resume leader selected: " + record.sender + ". Identify yourself with READY UP if your saved player name is not detected; the resume-ready button will appear after that.");
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
    renderGame();
    setStatus("Resume ready: " + Object.keys(resume.ready).length + " player(s).");
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
    try {
      panel.SetHasClass(className, !!enabled);
    } catch (e) {}
  }

  function applyHiddenAffordance(panel, hidden) {
    setPanelClass(panel, CLASSES.hidden, !!hidden);
    try {
      if (panel) panel.hittest = !hidden;
    } catch (e) {}
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
    try {
      panel.hittest = enabled && !readOnly;
    } catch (e) {}
  }

  function applyAffordance(panel, options) {
    applyButtonAffordance(panel, options);
  }

  const Affordance = {
    apply: applyAffordance,
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
      partyRoster: getPartyRoster(),
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
    const senderKey = normalizePlayerKey(record && record.sender);
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
    if (countSavedFundedPartyPlayers(resume, state.partyRoster || getPartyRoster()) < MIN_READY_PLAYERS) {
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
    if (State.requiresProgressImport) return makeGateDecision(false, false, "IMPORT PROGRESS", "Import progress before starting another imported match.");
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

  function buildPokerActionChoices(actor, enabled, readOnly) {
    const choices = [];
    const game = State.game;
    if (!actor || !game) return choices;
    const legal = getLegalActions(actor);
    if (legal.check) choices.push({ label: "CHECK", command: "check", className: "PokerActionButton", enabled: enabled, readOnly: readOnly });
    if (legal.call) choices.push({ label: "CALL $" + legal.toCall, command: "call", className: "PokerActionButton", enabled: enabled, readOnly: readOnly });
    if (game.currentBet === 0) {
      const minimumBet = getCurrentBigBlind(game);
      const largerBet = getLargeActionTarget(game);
      if (legal.canBetTarget(minimumBet)) choices.push({ label: "BET $" + minimumBet, command: "bet $" + minimumBet, className: "PokerActionButton", enabled: enabled, readOnly: readOnly });
      if (largerBet > minimumBet && legal.canBetTarget(largerBet)) choices.push({ label: "BET $" + largerBet, command: "bet $" + largerBet, className: "PokerActionButton", enabled: enabled, readOnly: readOnly });
    } else {
      const minimumRaiseTo = getMinimumRaiseTo(game);
      const largerRaiseTo = game.currentBet + getLargeActionTarget(game);
      if (legal.canRaiseTarget(minimumRaiseTo)) choices.push({ label: "RAISE TO $" + minimumRaiseTo, command: "raise $" + minimumRaiseTo, className: "PokerActionButton", enabled: enabled, readOnly: readOnly });
      if (largerRaiseTo > minimumRaiseTo && legal.canRaiseTarget(largerRaiseTo)) choices.push({ label: "RAISE TO $" + largerRaiseTo, command: "raise $" + largerRaiseTo, className: "PokerActionButton", enabled: enabled, readOnly: readOnly });
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
      if (!state.localPlayer) {
        actionHint = "Chat sender unknown. Type ready or reopen party chat so Deadlock exposes your name before acting.";
        actionChoices = buildPokerActionChoices(state.currentPlayer, false, true);
      } else if (state.currentPlayer.key !== state.localPlayer.key) {
        actionHint = "Waiting for " + state.currentPlayer.name + ". Their available choices are shown read-only below.";
        actionChoices = buildPokerActionChoices(state.currentPlayer, false, true);
      } else {
        actionHint = getActionStatusText();
        actionChoices = buildPokerActionChoices(state.localPlayer, true, false);
      }
    }

    const readyCount = countReadySavedPlayers(resume, false);
    const fundedCount = (state.resumeRoster || []).length;
    let resumeStatus = imported ? (hostedPartyRequiredResume ? "Imported progress loaded. Host or join a party; the party leader imports progress and starts NEXT SYNCED HAND." : "Leader: " + (resume.leaderName || "none") + ". Ready: " + readyCount + "/" + fundedCount + ".") : "Import progress to choose a resume leader.";
    if (hostedImportedResume && party.mode === "leader" && hostedResumeGate.enabled) resumeStatus = "Ready from imported progress. Click NEXT SYNCED HAND to start.";
    else if (hostedImportedResume && party.mode === "leader") resumeStatus = hostedResumeGate.reason || "Waiting to start synced imported progress.";
    else if (hostedImportedResume) resumeStatus = "Imported progress. Waiting for " + (party.leaderName || "<leader>") + " to start NEXT SYNCED HAND.";
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
        progressCodeLabel: imported ? "Imported progress " + resume.id + "." : "Finish a hand to copy progress, or paste a code to resume.",
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

  function setOpen(open) {
    cachePanels();
    State.isOpen = !!open;
    setPanelClass(State.root, CLASSES.visible, State.isOpen);
    setPanelClass(State.tableWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.lobbyWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.playersWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.actionsWindow, CLASSES.open, State.isOpen);
    setPanelClass(State.menuButton, CLASSES.active, State.isOpen);
    if (State.isOpen) StartSync.openMenu();
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
        if (!child || !child.DeleteAsync) break;
        child.DeleteAsync(0);
      }
    } catch (e) {}
  }

  function createPanel(type, parent, id, className) {
    if (!isValid(parent) || typeof $.CreatePanel !== "function") return null;
    try {
      const panel = $.CreatePanel(type, parent, id || "");
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


  function createCard(parent, card, small) {
    const panel = createPanel("Panel", parent, "", small ? "PokerCard Small" : "PokerCard");
    if (!panel) return null;
    const red = card && (card.suit === "H" || card.suit === "D");
    setPanelClass(panel, red ? CLASSES.red : CLASSES.black, true);
    createLabel(panel, "PokerCardRank", card ? getCardDisplayRank(card.rank) : "?");
    createLabel(panel, "PokerCardSuit", card ? getSuitGlyph(card.suit) : "?");
    createCardArt(panel, card);
    return panel;
  }

  function updateCardPanel(panel, card, small) {
    if (!isValid(panel)) return;
    const key = card ? makeCardLabel(card) : "back";
    if (panel.__pokerCardKey === key) return;
    panel.__pokerCardKey = key;
    setPanelClass(panel, CLASSES.red, !!(card && (card.suit === "H" || card.suit === "D")));
    setPanelClass(panel, CLASSES.black, !(card && (card.suit === "H" || card.suit === "D")));
    clearChildren(panel);
    createLabel(panel, "PokerCardRank", card ? getCardDisplayRank(card.rank) : "?");
    createLabel(panel, "PokerCardSuit", card ? getSuitGlyph(card.suit) : "?");
    createCardArt(panel, card);
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

  function renderSeatRows(seats) {
    cachePanels();
    if (!isValid(State.seatsList)) return;
    clearChildren(State.seatsList);
    if (!seats.length) {
      renderEmptySeats();
      return;
    }
    for (let i = 0; i < seats.length; i += 1) {
      const seat = seats[i];
      const row = createPanel("Panel", State.seatsList, "PokerSeat" + (i + 1), "PokerSeatRow");
      createLabel(row, "PokerSeatNumber", String(i + 1));
      createLabel(row, "PokerSeatName", seat.name || "Player");
      createLabel(row, "PokerSeatMeta", "READY");
    }
  }

  function getResumeGate() {
    return PokerButtonState.getResumeGate(getButtonStateSnapshot());
  }

  function renderResumeLeaderRows() {
    if (!isValid(State.resumeLeaderList)) return;
    clearChildren(State.resumeLeaderList);
    const resume = ensureResume();
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

  function renderProgressControls() {
    const buttonState = getCurrentButtonState();
    Affordance.hidden(State.progressControls, buttonState.controls.progressControls.hidden);
    Affordance.button(State.exportProgressButton, buttonState.controls.exportProgress);
    Affordance.button(State.importProgressButton, buttonState.controls.importProgress);
    Affordance.button(State.progressCodeInput, buttonState.controls.progressCodeInput);
    Affordance.hidden(State.resumeControls, buttonState.controls.resumeControls.hidden);
    Affordance.hidden(State.resumeLeaderList, buttonState.controls.resumeLeaderList.hidden);
    Affordance.button(State.resumeLeaderButton, buttonState.controls.resumeLeader);
    Affordance.button(State.resumeReadyButton, buttonState.controls.resumeReady);
    setText(State.progressCodeLabel, buttonState.text.progressCodeLabel);
    setText(State.resumeStatus, buttonState.text.resumeStatus);
    renderResumeLeaderRows();
  }

  function getStartGate(count) {
    return PokerButtonState.getStartGate(getButtonStateSnapshot(count));
  }

  function updateStartButton(count) {
    const buttonState = getCurrentButtonState(count);
    Affordance.button(State.startButton, buttonState.controls.start);
    Affordance.button(State.readyChatButton, buttonState.controls.readyChat);
    Affordance.hidden(State.partyControls, buttonState.controls.partyControls.hidden);
    Affordance.button(State.partyHostButton, buttonState.controls.partyHost);
    Affordance.button(State.partyJoinButton, buttonState.controls.partyJoin);
    setText(State.startButtonLabel, buttonState.text.startLabel);
    if (buttonState.text.partyStatus) setText(State.partyStatus, buttonState.text.partyStatus);
  }

  function updateReadySeats(force) {
    cachePanels();
    const revision = getReadyRevision();
    const seats = getReadySeatArray();
    const count = seats.length;
    if (!force && State.readyRevision === revision && State.readyCountValue === count) return;
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
    StartSync.noteBridgeEvent(event);
    if (event.event === READY_EVENT) {
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
    renderGame();
  }

  function openMenuSync() {
    requestFreshState("open");
    updateReadySeats(true);
    renderGame();
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
      updateReadySeats(false);
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

  function isUsableChatTarget(label) {
    if (!isValid(label)) return false;
    const text = String(label.text || "").trim();
    if (!text || text === "#citadel_chat_placeholder") return false;
    return text !== CHAT_ALL_LABEL && text.indexOf("(ALL)") === -1;
  }

  function markProgressShareSubmitted(message) {
    const share = State.progressShare || defaultProgressShareState();
    if (!share.sent || !share.id || !share.checksum) return;
    const parsed = parseProgressShareMessage({ message: message });
    if (!parsed || parsed.id !== share.id || parsed.checksum !== share.checksum) return;
    const messageCount = share.messageCount || (share.chunkCount ? share.chunkCount + 1 : 0);
    if (!messageCount) return;
    share.messageCount = messageCount;
    share.submittedCount = Math.min(messageCount, (share.submittedCount || 0) + 1);
    if (share.submittedCount >= messageCount) {
      const readyAt = Date.now() + PROGRESS_SHARE_START_GRACE_MS;
      share.readyAt = readyAt;
      $.Schedule(Math.max(0.1, (readyAt - Date.now()) / 1000), () => renderGame());
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
    setStatus("Opening chat and sending: " + message);
    try {
      $.DispatchEvent("CitadelConCommand", "say_chat_team");
    } catch (e) {}
    $.Schedule(CHAT_RETRY_DELAYS[0], () => retrySendChat(message, 0, 0));
    return true;
  }

  function sendBackgroundChatMessage(message) {
    const lastManualSendMs = State.lastSendMs;
    const sent = sendChatMessage(message, false, true);
    State.lastSendMs = lastManualSendMs;
    return sent;
  }

  function canShareProgressFromLocalLeader() {
    const party = ensureParty();
    if (party.mode === "leader") {
      if (party.leaderKey && State.localPlayerKey && party.leaderKey !== State.localPlayerKey) return false;
      return true;
    }
    const game = State.game;
    return !!(game && game.finished && !game.active && State.localPlayerKey && game.players && game.players[0] && game.players[0].key === State.localPlayerKey);
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
    $.Schedule(Math.max(0.1, (readyAt - Date.now()) / 1000), () => renderGame());
    setStatus("Sharing progress " + id + " to party. Players will import it from chat.");
    log("sharing progress " + id + " chunks=" + chunks.length + (reason ? " reason=" + reason : ""));
    return true;
  }

  function sendProgressShare(reason) {
    if (!canShareProgressFromLocalLeader()) return false;
    const progress = buildProgressSaveCode();
    if (!progress.ok || !progress.code || !progress.id) return false;
    return shareProgressCode(progress.code, progress.id, reason, getProgressShareKey());
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
      renderGame();
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
    State.party = defaultPartyState();
    const party = ensureParty();
    party.mode = "leader";
    party.id = partyId;
    if (remembered) {
      const leaderKey = normalizePlayerKey(remembered);
      party.leaderKey = leaderKey;
      party.leaderName = remembered;
      party.members[leaderKey] = { key: leaderKey, name: remembered };
      party.order = [leaderKey];
      rememberLocalPlayer(remembered);
    }
    clearReadySeats("host");
    savePartyState();
    renderGame();
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
      renderGame();
      return;
    }
    clearResumeState("join party");
    State.requiresProgressImport = false;
    State.resumeRequiresHostedParty = false;
    party.mode = "member";
    savePartyState();
    renderGame();
    sendChatMessage(PARTY_JOIN_PREFIX + " poker party " + party.id);
    if (activeGame) setStatus("Joined waitlist. You will be seated after this hand.");
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
      renderGame();
      return { ok: false, status: "Finish the current hand before copying progress." };
    }
    const result = buildProgressSaveCode();
    if (!result.ok) {
      setStatus(result.status || "Finish the current hand before copying progress.");
      renderGame();
      return result;
    }
    setText(State.progressCodeLabel, result.code);
    const copied = copyToClipboard(result.code, State.panel || null);
    setStatus(copied ? "Copied progress " + result.id + ". Save this code outside the game." : "Progress " + result.id + " ready. Copy the displayed code.");
    renderGame();
    return result;
  }

  function importProgressCodeFromInput() {
    const decision = getCurrentButtonState().controls.importProgress;
    if (!decision.enabled && State.game && State.game.active) {
      setStatus("Finish the current hand before importing progress.");
      renderGame();
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
    renderGame();
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
      renderGame();
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
      renderGame();
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
      renderGame();
      return;
    }
    const seed = "s" + Date.now().toString(36);
    sendChatMessage(buildResumeStartCommand(resume.id, resume.leaderKey, resume.payload.roster, resume.payload.nextHandNumber, seed));
  }

  function applyResumeStartCommand(command) {
    if (!command) return { consumed: false, readyChanged: false, render: false, status: "Invalid resume command.", debugReason: "invalid" };
    const resolvedRecord = command.record ? resolveSelfRecord(command.record) : resolveSelfRecord({ sender: command.leaderKey || "", message: "poker resume " + (command.id || "") + " hand " + (command.handNumber || "") + " leader " + (command.leaderKey || "") + " seed " + (command.seed || "") });
    if (!resolvedRecord || isUnknownSender(resolvedRecord.sender)) {
      debugActionState("reject-unknown-resume-start", resolvedRecord, null);
      return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "debug" };
    }
    const parts = String(resolvedRecord.message || "").replace(/^\s+|\s+$/g, "").split(/\s+/);
    const id = parts.length > 2 ? String(parts[2] || "").replace(/[^a-z0-9-]/gi, "").toLowerCase() : "";
    const handIndex = parts.indexOf(START_HAND_MARKER);
    const leaderIndex = parts.indexOf(START_LEADER_MARKER);
    const rosterIndex = parts.indexOf(START_ROSTER_MARKER);
    const seedIndex = parts.indexOf(START_SEED_MARKER);
    if (parts[0] !== "poker" || parts[1] !== "resume" || handIndex < 0 || leaderIndex < 0 || seedIndex < 0 || handIndex + 1 >= parts.length || leaderIndex + 1 >= parts.length || seedIndex + 1 >= parts.length) {
      return { consumed: true, readyChanged: false, render: false, status: "Invalid resume command.", debugReason: "status" };
    }
    const resume = ensureResume();
    if (!resume.payload || resume.id !== id) {
      return { consumed: true, readyChanged: false, render: false, status: "Import matching progress before resuming.", debugReason: "status" };
    }
    const handNumber = parseHandNumberToken(parts[handIndex + 1]);
    let parsedLeaderKey = "";
    try {
      parsedLeaderKey = normalizePlayerKey(decodeURIComponent(parts[leaderIndex + 1] || ""));
    } catch (e) {
      parsedLeaderKey = "";
    }
    const hostedSharedLeaderKey = getHostedSharedProgressLeaderKey(resume);
    if (hostedSharedLeaderKey && parsedLeaderKey !== hostedSharedLeaderKey) {
      debugActionState("reject-hosted-resume-leader-mismatch commandLeader=" + parsedLeaderKey + " hostedLeader=" + hostedSharedLeaderKey, resolvedRecord, null);
      return { consumed: true, readyChanged: false, render: false, status: "Only " + (resume.hostedLeaderName || resume.leaderName || "<leader>") + " can start this resume.", debugReason: "status" };
    }
    if (State.resumeRequiresHostedParty && !hostedSharedLeaderKey) {
      return { consumed: true, readyChanged: false, render: false, status: "Host or join the synced party before resuming.", debugReason: "status" };
    }
    if (!resume.leaderKey) {
      const leaderEntry = findProgressRosterEntry(resume.payload, parsedLeaderKey);
      if (!leaderEntry || getProgressBankroll(resume.payload, parsedLeaderKey) <= 0) {
        return { consumed: true, readyChanged: false, render: false, status: "Select and sync a resume leader before resuming.", debugReason: "status" };
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
      return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "debug" };
    }
    const starterKey = normalizePlayerKey(resolvedRecord.sender);
    if (starterKey !== resume.leaderKey) {
      debugActionState("reject-non-leader-resume sender=" + resolvedRecord.sender + " leader=" + (resume.leaderName || resume.leaderKey), resolvedRecord, null);
      return { consumed: true, readyChanged: false, render: false, status: "Only " + (resume.leaderName || "<leader>") + " can start this resume.", debugReason: "status" };
    }
    if (rosterIndex >= 0) {
      if (rosterIndex + 1 >= parts.length) return { consumed: true, readyChanged: false, render: false, status: "Invalid synced poker roster.", debugReason: "status" };
      const decodedRoster = decodeRoster(parts[rosterIndex + 1] || "");
      if (decodedRoster.length < MIN_READY_PLAYERS || canonicalProgressPayload({ version: 1, kind: "poker-progress", lastHandNumber: resume.payload.lastHandNumber, nextHandNumber: resume.payload.nextHandNumber, dealerKey: resume.payload.dealerKey, roster: decodedRoster, bankrolls: resume.payload.bankrolls, savedAt: resume.payload.savedAt }) !== canonicalProgressPayload(resume.payload)) {
        return { consumed: true, readyChanged: false, render: false, status: "Invalid synced poker roster.", debugReason: "status" };
      }
    }
    const seed = parts[seedIndex + 1] || "";
    const dealerKeyOverride = resolveResumeNextDealerKey(resume.payload);
    if (!dealerKeyOverride) {
      return { consumed: true, readyChanged: false, render: false, status: "Cannot resume; saved dealer state is invalid.", debugReason: "status" };
    }
    if (!applyResumeProgressForStart(resume.payload, parsedLeaderKey)) {
      return { consumed: true, readyChanged: false, render: false, status: "Cannot resume; saved dealer state is invalid.", debugReason: "status" };
    }
    State.game = createGameFromReady(seed, resume.payload.roster, handNumber, dealerKeyOverride);
    if (State.game) {
      State.game.importedResume = true;
      State.resume = defaultResumeState();
      saveResumeState();
      savePartyState();
      log("game resumed seed " + seed);
      return { consumed: true, readyChanged: false, render: true, status: "Poker resumed. " + getCurrentPlayer().name + " acts first.", debugReason: "resume-start" };
    }
    return { consumed: true, readyChanged: false, render: false, status: "Cannot resume; saved dealer state is invalid.", debugReason: "status" };
  }

  const ProgressResume = {
    validatePayload: validateProgressPayload,
    buildSaveCode: buildProgressSaveCode,
    decodeSaveCode: decodeProgressSaveCode,
    importSaveCode: importProgressSaveCode,
    getResumeId: getResumeId,
    getGate: getResumeGate,
    recordLeader: recordResumeLeader,
    recordReady: recordResumeReady,
    buildLeaderCommand: buildResumeLeaderCommand,
    buildReadyCommand: buildResumeReadyCommand,
    buildStartCommand: buildResumeStartCommand,
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

  function playersInHand() {
    if (!State.game) return [];
    const list = [];
    for (let i = 0; i < State.game.players.length; i += 1) {
      const player = State.game.players[i];
      if (!player.folded && player.stack >= 0) list.push(player);
    }
    return list;
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

  function getLocalCallAmount() {
    const game = State.game;
    if (!game || !game.active) return 0;
    const actor = getLocalPlayer() || getCurrentPlayer();
    return getCallAmount(actor);
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

  function getLargeActionTarget(game) {
    return getCurrentBigBlind(game) + ACTION_BET_EXTRA;
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
    if (game.currentBet === 0) {
      const minimumBet = getCurrentBigBlind(game);
      const largerBet = getLargeActionTarget(game);
      if (legal.canBetTarget(minimumBet)) choices.push("bet $" + minimumBet);
      if (largerBet > minimumBet && legal.canBetTarget(largerBet)) choices.push("bet $" + largerBet);
    } else {
      const minimumRaiseTo = getMinimumRaiseTo(game);
      const largerRaiseTo = game.currentBet + getLargeActionTarget(game);
      if (legal.canRaiseTarget(minimumRaiseTo)) choices.push("raise to $" + minimumRaiseTo);
      if (largerRaiseTo > minimumRaiseTo && legal.canRaiseTarget(largerRaiseTo)) choices.push("raise to $" + largerRaiseTo);
    }
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
      players.push({
        key: entry.key,
        name: entry.name,
        stack: stack,
        bet: 0,
        committed: 0,
        cards: [],
        folded: false,
        acted: false,
        result: null,
      });
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
        players.push({
          key: key,
          name: name,
          stack: stack,
          bet: 0,
          committed: 0,
          cards: [],
          folded: false,
          acted: false,
          result: null,
        });
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
      renderGame();
      return;
    }
    const party = ensureParty();
    const roster = getPartyRoster();
    const seed = "s" + Date.now().toString(36);
    sendChatMessage(buildSynchronizedStartCommand(seed, roster, getNextHandNumber()));
  }


  function endMatch() {
    if (!State.game) {
      setStatus("No poker match is active.");
      renderGame();
      return;
    }
    const endedGame = State.game;
    const party = ensureParty();
    if (party.id && party.mode === "leader") sendChatMessage(buildMatchEndCommand(endedGame, party.id), true, true);
    State.game = null;
    PendingSelfAction.clear();
    clearResumeState("end match");
    State.requiresProgressImport = false;
    setStatus("Match ended. Host a party or wait for players to join before showing the table again.");
    renderGame();
  }

  function leaveLobby() {
    const party = ensureParty();
    const partyId = party.id || "";
    if (partyId) {
      sendChatMessage(PARTY_LEAVE_PREFIX + " poker party " + partyId, true, true);
      State.lastLobbyLeaveMs = Date.now();
    }
    State.party = defaultPartyState();
    clearResumeState("leave lobby");
    State.requiresProgressImport = false;
    State.resumeRequiresHostedParty = true;
    State.game = null;
    clearReadySeats("leave");
    PendingSelfAction.clear();
    forgetReadySeat(State.localPlayerKey);
    savePartyState();
    renderGame();
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

  function dealNextStreet() {
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
      showdown();
      return false;
    }
    return true;
  }

  function dealRemainingCommunity() {
    const game = State.game;
    while (game && game.active && game.phase !== "river" && game.phase !== "finished") {
      if (!dealNextStreet()) return;
    }
  }

  function onlyOnePlayerCanAct() {
    const contestants = activeContestants();
    let withChips = 0;
    for (let i = 0; i < contestants.length; i += 1) if (contestants[i].stack > 0) withChips += 1;
    return contestants.length > 1 && withChips <= 1;
  }

  function advancePhase() {
    const game = State.game;
    if (!game || !game.active) return;
    if (activeContestants().length <= 1) {
      awardFoldWin();
      return;
    }
    if (onlyOnePlayerCanAct()) {
      dealRemainingCommunity();
      showdown();
      return;
    }
    resetRoundBets();
    if (!dealNextStreet()) return;
    game.currentIndex = firstActiveAfter(game.dealerIndex);
    game.streetOpenerIndex = game.currentIndex;
    announce(String(game.phase || "street").charAt(0).toUpperCase() + String(game.phase || "street").slice(1) + " dealt", getTurnPrompt());
    renderGame();
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

  function awardFoldWin() {
    const game = State.game;
    const alive = activeContestants();
    if (!alive.length) return;
    const winner = alive[0];
    const amount = game.pot;
    winner.stack += amount;
    game.pot = 0;
    State.bankrolls[winner.key] = winner.stack;
    addGameLog(winner.name + " wins $" + amount + " by fold.");
    announce(winner.name + " wins by fold", "Pot $" + amount + " awarded.");
    finishHand(winner.name + " wins by fold.");
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

  function showdown() {
    const game = State.game;
    if (!game) return;
    const pots = buildPots(game.players);
    game.pots = pots;
    let firstSummary = "";

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
      const names = orderedWinners.map((winner) => winner.name).join(", ");
      const line = "Pot $" + pot.amount + ": " + names + " win with " + bestHand.name + ".";
      addGameLog(line);
      if (!firstSummary) firstSummary = line;
    }

    game.pot = 0;
    for (let i = 0; i < game.players.length; i += 1) State.bankrolls[game.players[i].key] = game.players[i].stack;
    announce(firstSummary || "Showdown complete", "Winners paid. Start the next hand when ready.");
    finishHand(firstSummary || "Showdown complete.");
  }

  function finishHand(status) {
    const game = State.game;
    game.active = false;
    game.finished = true;
    game.phase = "finished";
    for (let i = 0; i < game.players.length; i += 1) {
      const player = game.players[i];
      State.bankrolls[player.key] = player.stack;
      if (player.stack <= 0) addGameLog(player.name + " is out.");
    }
    const lateJoinResult = LateJoinQueue.apply(null, "finish");
    PendingSelfAction.clear();
    const lateJoinStatus = formatLateJoinApplied(lateJoinResult);
    setStatus(lateJoinStatus ? status + " " + lateJoinStatus : status);
    renderGame();
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

  function applyLegalAction(player, action, amount, record) {
    const game = State.game;
    const current = getCurrentPlayer();
    if (!game || !game.active) {
      debugActionState("drop-inactive command=" + action, record, player);
      return;
    }
    if (!current) {
      debugActionState("drop-no-current command=" + action, record, player);
      return;
    }
    if (!player || current.key !== player.key) {
      rejectAction("reject-out-of-turn", action, amount || 0, record, player);
      return;
    }

    const toCall = getCallAmount(player);
    const legal = getLegalActions(player);
    let actionAnnouncement = "";
    if (action === "fold") {
      if (!legal.fold) {
        rejectAction("reject-unknown-action", action, amount || 0, record, player);
        return;
      }
      player.folded = true;
      player.acted = true;
      addGameLog(player.name + " folds.");
      actionAnnouncement = player.name + " folds.";
    } else if (action === "check") {
      if (!legal.check) {
        rejectAction("reject-illegal-check", action, amount || 0, record, player);
        return;
      }
      player.acted = true;
      addGameLog(player.name + " checks.");
      actionAnnouncement = player.name + " checks.";
    } else if (action === "call") {
      if (!legal.call) {
        rejectAction("reject-illegal-call", action, amount || 0, record, player);
        return;
      }
      const paid = commitChips(game, player, toCall);
      player.acted = true;
      addGameLog(player.name + " calls $" + paid + ".");
      actionAnnouncement = player.name + " calls $" + paid + ".";
    } else if (action === "bet") {
      if (!legal.canBetTarget(amount)) {
        rejectAction("reject-illegal-bet", action, amount || 0, record, player);
        return;
      }
      const previousCurrentBet = game.currentBet;
      const paidAmount = commitChips(game, player, amount - player.bet);
      game.currentBet = player.bet;
      game.lastRaise = game.currentBet - previousCurrentBet;
      game.minRaise = game.lastRaise;
      game.lastAggressorIndex = game.currentIndex;
      resetOtherActorsForAggression(player);
      player.acted = true;
      addGameLog(player.name + " bets $" + paidAmount + ".");
      actionAnnouncement = player.name + " bets $" + game.currentBet + ".";
    } else if (action === "raise") {
      if (!legal.canRaiseTarget(amount)) {
        rejectAction("reject-illegal-raise", action, amount || 0, record, player);
        return;
      }
      const previousCurrentBet = game.currentBet;
      const paidAmount = commitChips(game, player, amount - player.bet);
      game.currentBet = player.bet;
      game.lastRaise = game.currentBet - previousCurrentBet;
      game.minRaise = game.lastRaise;
      game.lastAggressorIndex = game.currentIndex;
      resetOtherActorsForAggression(player);
      player.acted = true;
      addGameLog(player.name + " raises to $" + game.currentBet + " (" + paidAmount + " more).");
      actionAnnouncement = player.name + " raises to $" + game.currentBet + ".";
    } else {
      rejectAction("reject-unknown-action", action, amount || 0, record, player);
      return;
    }

    completeActionAdvance(record, actionAnnouncement);
    if (record && record.isSelf) PendingSelfAction.markApplied(getActionCommandText(action, amount));
  }

  function completeActionAdvance(record, actionAnnouncement) {
    const game = State.game;
    if (!game || !game.active) return;
    if (activeContestants().length <= 1) awardFoldWin();
    else if (hasBettingRoundSettled()) advancePhase();
    else {
      game.currentIndex = nextActiveIndex(game.currentIndex);
      announce(actionAnnouncement || "Next turn", getTurnPrompt());
    }
    renderGame();
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

  function applyEngineAction(player, action, amount, record) {
    return applyLegalAction(player, action, amount, record);
  }

  const PokerEngine = {
    createGame: createEngineGame,
    getLegalActions: getLegalActions,
    applyAction: applyEngineAction,
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
    const resolved = {};
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i += 1) resolved[keys[i]] = record[keys[i]];
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
    const resolved = {};
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i += 1) resolved[keys[i]] = record[keys[i]];
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
    const resolved = {};
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i += 1) resolved[keys[i]] = record[keys[i]];
    resolved.sender = current.name;
    log("resolved unknown action sender to synced current actor " + current.name);
    return resolved;
  }

  function resolveUnknownSyncedStartRecord(record, decodedRoster) {
    if (!record || !isUnknownSender(record.sender)) return record;
    const party = ensureParty();
    if (!party.leaderKey || !decodedRoster || !decodedRoster[0] || decodedRoster[0].key !== party.leaderKey) return record;
    const resolved = {};
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i += 1) resolved[keys[i]] = record[keys[i]];
    resolved.sender = party.leaderName || decodedRoster[0].name;
    log("resolved unknown synced start sender to party leader " + resolved.sender);
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
      for (let i = 1; i <= chunks.length; i += 1) code += decodeProgressChatChunk(chunks[i - 1]);
    } catch (e) {
      return { ok: false, status: "Invalid shared progress chunk." };
    }
    if (checksumFromProgressCode(code) !== checksum) return { ok: false, status: "Invalid shared progress checksum." };
    const decoded = decodeProgressSaveCode(code);
    if (!decoded.ok || decoded.id !== id) return { ok: false, status: "Invalid shared progress code." };
    const imported = importProgressSaveCode(code);
    if (!imported.ok) return imported;
    return { ok: true, id: id, code: code, payload: imported.payload };
  }

  function applyProgressShareMessage(message) {
    if (!message || !message.id || !message.checksum || !message.count) return { consumed: false, readyChanged: false, render: false, status: "", debugReason: "progress-share" };
    if (message.record && message.record.isSelf) return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "progress-self" };
    if (message.type === "offer") {
      getProgressTransfer(message.id, message.checksum, message.count);
      const offerStatus = "Receiving progress " + message.id + " (0/" + message.count + " chunks).";
      setStatus(offerStatus);
      return { consumed: true, readyChanged: false, render: true, status: offerStatus, debugReason: "progress-offer" };
    }
    if (message.type !== "chunk" || message.index < 1 || message.index > message.count) {
      return { consumed: true, readyChanged: false, render: false, status: "Invalid shared progress chunk.", debugReason: "progress-chunk" };
    }
    const key = message.id + ":" + message.checksum;
    const transfer = State.progressTransfers && State.progressTransfers[key];
    if (!transfer) return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "progress-chunk" };
    transfer.chunks[message.index] = message.chunk;
    const ordered = [];
    for (let i = 1; i <= transfer.count; i += 1) {
      if (!transfer.chunks[i]) {
        const partialStatus = "Receiving progress " + transfer.id + " (" + Object.keys(transfer.chunks).length + "/" + transfer.count + " chunks).";
        setStatus(partialStatus);
        return { consumed: true, readyChanged: false, render: true, status: partialStatus, debugReason: "progress-chunk" };
      }
      ordered.push(transfer.chunks[i]);
    }
    const imported = importSharedProgressCode(transfer.id, transfer.checksum, ordered);
    delete State.progressTransfers[transfer.id + ":" + transfer.checksum];
    if (!imported.ok) {
      const status = imported.status || "Invalid shared progress code.";
      setStatus(status);
      return { consumed: true, readyChanged: false, render: true, status: status, debugReason: "progress-chunk" };
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
    setStatus(status);
    return { consumed: true, readyChanged: false, render: true, status: status, debugReason: "progress-chunk" };
  }

  function applyPokerCommand(command) {
    const effect = { consumed: false, readyChanged: false, render: false, status: "", debugReason: command && command.type ? command.type : "" };
    const resolvedRecord = command && command.record ? command.record : resolveSelfRecord(command);
    if (!resolvedRecord || !resolvedRecord.message) return effect;
    const text = command && command.text ? command.text : normalizeText(resolvedRecord.message);
    if (!text) return effect;
    effect.consumed = true;
    const partyMessage = parsePartyMessage(resolvedRecord);
    if (partyMessage) {
      if (isUnknownSender(resolvedRecord.sender) && partyMessage.type !== "leader") {
        debugActionState("reject-unknown-party-authority", resolvedRecord, null);
        return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "debug" };
      }
      let partyChanged = false;
      if (partyMessage.type === "leader") partyChanged = recordPartyLeader(resolvedRecord, partyMessage.id);
      else if (partyMessage.type === "join") {
        partyChanged = recordPartyJoin(resolvedRecord, partyMessage.id);
        if (partyChanged && State.game && State.game.active) {
          const joinedKey = normalizePlayerKey(resolvedRecord.sender);
          if (!Object.prototype.hasOwnProperty.call(State.bankrolls, joinedKey)) {
            return { consumed: true, readyChanged: true, render: true, status: resolvedRecord.sender + " will join after this hand.", debugReason: "party" };
          }
        }
      } else {
        partyChanged = recordPartyLeave(resolvedRecord, partyMessage.id);
      }
      return { consumed: true, readyChanged: true, render: true, status: "", debugReason: "party" };
    }
    const matchEndMessage = parseMatchEndMessage(resolvedRecord);
    if (matchEndMessage) {
      const changed = recordMatchEnd(resolvedRecord, matchEndMessage);
      return { consumed: true, readyChanged: false, render: true, status: changed ? "Match ended by party leader." : "", debugReason: "match-end" };
    }
    const progressShareMessage = parseProgressShareMessage(resolvedRecord);
    if (progressShareMessage) {
      progressShareMessage.record = resolvedRecord;
      return applyProgressShareMessage(progressShareMessage);
    }
    const resumeMessage = parseResumeMessage(resolvedRecord);
    if (resumeMessage) {
      if (isUnknownSender(resolvedRecord.sender)) {
        debugActionState("reject-unknown-resume-authority", resolvedRecord, null);
        return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "debug" };
      }
      const resume = ensureResume();
      if (!resume.payload || resume.id !== resumeMessage.id) {
        const status = "Import matching progress " + (resumeMessage.id || "") + " before joining this resume.";
        setStatus(status);
        return { consumed: true, readyChanged: false, render: true, status: status, debugReason: "status" };
      }
      const hostedSharedLeaderKey = getHostedSharedProgressLeaderKey(resume);
      if (State.resumeRequiresHostedParty && !hostedSharedLeaderKey) {
        const status = "Host or join the synced party before choosing a resume leader.";
        setStatus(status);
        return { consumed: true, readyChanged: false, render: true, status: status, debugReason: "status" };
      }
      if (hostedSharedLeaderKey && normalizePlayerKey(resolvedRecord.sender) !== hostedSharedLeaderKey) {
        const status = "Waiting for " + (resume.hostedLeaderName || resume.leaderName || "the host") + " to start NEXT SYNCED HAND.";
        setStatus(status);
        debugActionState("reject-non-hosted-resume-authority sender=" + resolvedRecord.sender + " leader=" + (resume.hostedLeaderName || resume.leaderName || hostedSharedLeaderKey), resolvedRecord, null);
        return { consumed: true, readyChanged: false, render: true, status: status, debugReason: "status" };
      }
      if (resumeMessage.type === "leader") recordResumeLeader(resolvedRecord, resumeMessage.id);
      else recordResumeReady(resolvedRecord, resumeMessage.id);
      return { consumed: true, readyChanged: false, render: true, status: "", debugReason: "render" };
    }
    if (text.indexOf("poker resume ") === 0) {
      return ProgressResume.applyStartCommand(command);
    }
    if (text.indexOf("poker start") === 0 || text.indexOf("start poker") === 0) {
      const parts = String(resolvedRecord.message).replace(/^\s+|\s+$/g, "").split(/\s+/);
      const rosterIndex = parts.indexOf(START_ROSTER_MARKER);
      const handIndex = parts.indexOf(START_HAND_MARKER);
      if (parts[0] === "poker" && parts[1] === "start" && rosterIndex >= 3) {
        const seed = parts[2] || String(Date.now());
        let syncedHandNumber = 0;
        if (handIndex >= 3 && handIndex + 1 < parts.length && handIndex < rosterIndex) {
          syncedHandNumber = parseHandNumberToken(parts[handIndex + 1]);
          if (!syncedHandNumber) {
            return { consumed: true, readyChanged: false, render: false, status: "Invalid synced poker hand number.", debugReason: "status" };
          }
        }
        const decodedRoster = resolveRosterNamesFromKnownParty(decodeRoster(parts.slice(rosterIndex + 1).join("")));
        if (decodedRoster.length < MIN_READY_PLAYERS) {
          return { consumed: true, readyChanged: false, render: false, status: "Invalid synced poker roster.", debugReason: "status" };
        }
        const startRecord = resolveUnknownSyncedStartRecord(resolvedRecord, decodedRoster);
        if (isUnknownSender(startRecord.sender)) {
          debugActionState("reject-unknown-start", startRecord, null);
          return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "debug" };
        }
        const starterKey = normalizePlayerKey(startRecord.sender);
        const party = ensureParty();
        if (party.leaderKey && starterKey !== party.leaderKey) {
          debugActionState("reject-non-leader-start sender=" + startRecord.sender + " leader=" + party.leaderName, startRecord, null);
          return { consumed: true, readyChanged: false, render: false, status: "Only " + (party.leaderName || "<leader>") + " can start the synced hand.", debugReason: "status" };
        }
        if (State.game && State.game.active) {
          log("ignored synced start during active hand seed " + seed);
          return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "start" };
        }
        if (!party.leaderKey) {
          if (!decodedRoster[0] || decodedRoster[0].key !== starterKey) {
            debugActionState("reject-non-leader-start sender=" + startRecord.sender + " leader=" + (decodedRoster[0] ? decodedRoster[0].name : "<unknown>"), startRecord, null);
            return { consumed: true, readyChanged: false, render: false, status: "Only " + (decodedRoster[0] ? decodedRoster[0].name : "<leader>") + " can start the synced hand.", debugReason: "status" };
          }
          applyPartyRoster(decodedRoster, startRecord.isSelf ? "leader" : "member", ensureParty().id);
        }
        const freshMatchBoundary = !State.game || State.game.finished || !State.game.active;
        if (syncedHandNumber === 1 && freshMatchBoundary && Object.keys(State.bankrolls).length > 0) {
          State.bankrolls = {};
          log("reset bankrolls for fresh synced hand 1");
        }
        applyPartyRoster(decodedRoster, party.mode, party.id);
        rememberLocalFromPartyRoster(decodedRoster);
        LateJoinQueue.apply(decodedRoster, "start");
        State.game = createGameFromReady(seed, decodedRoster, syncedHandNumber || undefined);
        if (State.game) {
          log("game started seed " + seed);
          return { consumed: true, readyChanged: false, render: true, status: "Poker started. " + getCurrentPlayer().name + " acts first.", debugReason: "start" };
        }
        return effect;
      }
      if (isUnknownSender(resolvedRecord.sender)) {
        debugActionState("reject-unknown-start", resolvedRecord, null);
        return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "debug" };
      }
      const seed = parts.length > 2 ? parts.slice(2).join(" ") : String(Date.now());
      State.game = createGameFromReady(seed + " " + resolvedRecord.sender);
      if (State.game) {
        log("game started seed " + seed);
        return { consumed: true, readyChanged: false, render: true, status: "Poker started. " + getCurrentPlayer().name + " acts first.", debugReason: "start" };
      }
      return effect;
    }
    if (text === "all in" || text === "allin") {
      debugActionState("reject-unknown-action command=" + text, resolvedRecord, findGamePlayer(resolvedRecord.sender));
      return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "debug" };
    }
    if (!isActionText(text)) return effect;
    if (!State.game || !State.game.active) {
      debugActionState("drop-no-active-game message=" + text, resolvedRecord, null);
      return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "debug" };
    }
    const actionRecord = resolveUnknownActionRecord(resolvedRecord, text);
    const player = findGamePlayer(actionRecord.sender);
    if (!player) {
      debugActionState("reject-unknown-sender command=" + text + " amount=" + parseAmount(text) + " toCall=0 minRaise=" + (State.game ? State.game.minRaise || getCurrentBigBlind(State.game) : BIG_BLIND) + " currentBet=" + (State.game ? State.game.currentBet : 0) + " playerBet=<none> playerStack=<none> playerCommitted=<none>", actionRecord, null);
      return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "debug" };
    }
    if (text === "check") applyLegalAction(player, "check", 0, actionRecord);
    else if (text === "call") applyLegalAction(player, "call", 0, actionRecord);
    else if (text === "fold") applyLegalAction(player, "fold", 0, actionRecord);
    else if (text.indexOf("bet") === 0) applyLegalAction(player, "bet", parseAmount(text), actionRecord);
    else if (text.indexOf("raise") === 0) applyLegalAction(player, "raise", parseAmount(text), actionRecord);
    return { consumed: true, readyChanged: false, render: false, status: "", debugReason: "action" };
  }

  function applyReducerEffect(effect, suppressRender) {
    const applied = effect || { consumed: false, readyChanged: false, render: false, status: "", debugReason: "" };
    if (applied.readyChanged) updateReadySeats(true);
    if (applied.status) setStatus(applied.status);
    if (applied.render && !suppressRender) renderGame();
    return applied;
  }

  function processChatRecord(record) {
    return applyReducerEffect(CommandReducer.applyRecord(record), false);
  }

  function processChatPayload(event) {
    return CommandReducer.applyPayload(event);
  }

  function decodePokerCommand(record) {
    const resolved = resolveSelfRecord(record);
    const text = normalizeText(resolved && resolved.message);
    if (!resolved || !text) return { type: "ignored", record: resolved || record, text: text };
    const party = parsePartyMessage(resolved);
    if (party && party.type === "leader") return { type: "party-leader", record: resolved, id: party.id };
    if (party && party.type === "join") return { type: "party-join", record: resolved, id: party.id };
    if (party && party.type === "leave") return { type: "party-leave", record: resolved, id: party.id };
    const matchEnd = parseMatchEndMessage(resolved);
    if (matchEnd) return { type: "match-end", record: resolved, id: matchEnd.id };
    const progressShare = parseProgressShareMessage(resolved);
    if (progressShare) return { type: "progress-" + progressShare.type, record: resolved, id: progressShare.id, checksum: progressShare.checksum, count: progressShare.count, index: progressShare.index || 0 };
    const resume = parseResumeMessage(resolved);
    if (resume && resume.type === "leader") return { type: "resume-leader", record: resolved, id: resume.id };
    if (resume && resume.type === "ready") return { type: "resume-ready", record: resolved, id: resume.id };
    if (text.indexOf("poker resume ") === 0) {
      const parts = String(resolved.message).replace(/^\s+|\s+$/g, "").split(/\s+/);
      const handIndex = parts.indexOf(START_HAND_MARKER);
      const leaderIndex = parts.indexOf(START_LEADER_MARKER);
      const rosterIndex = parts.indexOf(START_ROSTER_MARKER);
      const seedIndex = parts.indexOf(START_SEED_MARKER);
      return { type: "resume-start", record: resolved, id: parts[2] || "", handNumber: handIndex >= 0 ? parseHandNumberToken(parts[handIndex + 1]) : 0, leaderKey: leaderIndex >= 0 ? parts[leaderIndex + 1] || "" : "", roster: rosterIndex >= 0 ? parts[rosterIndex + 1] || "" : "", seed: seedIndex >= 0 ? parts[seedIndex + 1] || "" : "" };
    }
    if (text.indexOf("poker start") === 0 || text.indexOf("start poker") === 0) {
      const parts = String(resolved.message).replace(/^\s+|\s+$/g, "").split(/\s+/);
      const rosterIndex = parts.indexOf(START_ROSTER_MARKER);
      const handIndex = parts.indexOf(START_HAND_MARKER);
      return { type: "start", record: resolved, seed: parts[2] || "", handNumber: handIndex >= 0 ? parseHandNumberToken(parts[handIndex + 1]) : 0, roster: rosterIndex >= 0 ? decodeRoster(parts.slice(rosterIndex + 1).join("")) : [], legacySeed: parts.length > 2 ? parts.slice(2).join(" ") : "" };
    }
    if (text === "all in" || text === "allin") return { type: "all-in-unsupported", record: resolved, text: text };
    if (isActionText(text)) {
      let action = text;
      if (text.indexOf("bet") === 0) action = "bet";
      else if (text.indexOf("raise") === 0) action = "raise";
      return { type: "action", record: resolved, action: action, amount: parseAmount(text), text: text };
    }
    return { type: "ignored", record: resolved, text: text };
  }

  function emptyCommandEffect(debugReason) {
    return { consumed: false, readyChanged: false, render: false, status: "", debugReason: debugReason || "" };
  }

  function applyChatRecord(record) {
    return applyPokerCommand(decodePokerCommand(record)) || emptyCommandEffect("record");
  }

  function applyChatPayload(event) {
    let consumed = false;
    if (!event) return emptyCommandEffect("payload");
    if (event.messages && event.messages.length) {
      for (let i = 0; i < event.messages.length; i += 1) {
        const message = event.messages[i];
        if (message.seq && message.seq <= State.processedChatSeq) continue;
        State.processedChatSeq = Math.max(State.processedChatSeq, message.seq || 0);
        const effect = applyReducerEffect(applyChatRecord(message) || emptyCommandEffect("record"), true);
        consumed = effect.consumed || consumed;
      }
      if (consumed) renderGame();
      return { consumed: consumed, readyChanged: false, render: consumed, status: "", debugReason: "payload" };
    }
    if (event.seq && event.seq <= State.processedChatSeq) return emptyCommandEffect("old-seq");
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

  function sendAction(command, label) {
    const current = getCurrentPlayer();
    const local = getLocalPlayer();
    const phase = State.game ? State.game.phase : "lobby";
    if (!State.game || !State.game.active || !current) {
      setStatus("No active synced hand is waiting for an action.");
      renderGame();
      return;
    }
    if (!local) {
      setStatus("Chat sender unknown. Type ready or reopen party chat so Deadlock exposes your name before acting.");
      renderGame();
      return;
    }
    if (current.key !== local.key) {
      setStatus("Waiting for " + current.name + ". You are " + local.name + ".");
      renderGame();
      return;
    }
    if (!isLegalLocalCommand(command, local)) {
      setStatus("Action no longer legal for " + local.name + ". Waiting for " + current.name + ".");
      renderGame();
      return;
    }
    const toCall = getCallAmount(local);
    PendingSelfAction.record(command, local, State.game);
    log("action click label=" + (label || command) + " command=" + command + " phase=" + phase + " current=" + (current ? current.name : "<none>") + " toCall=" + toCall);
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

  function getPlayerRenderSource() {
    const game = State.game;
    if (game && game.players.length) return game.players;
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
        roster.push({
          key: key,
          name: entry.name || key,
          stack: stack,
          bet: 0,
          cards: [],
          folded: false,
          result: state,
        });
      }
      if (roster.length) return roster;
    }
    return getReadySeatArray().map((seat) => ({
      key: normalizePlayerKey(seat.name),
      name: seat.name,
      stack: STARTING_STACK,
      bet: 0,
      cards: [],
      folded: false,
    }));
  }

  function shouldRevealPlayerCards(game, player) {
    return !!(player.cards && player.cards.length && (!game || !game.active || player.key === State.localPlayerKey));
  }

  function getPlayerStateText(game, player, index) {
    return player.folded ? "FOLD" : player.result || (game && game.active && index === game.currentIndex ? (player.key === State.localPlayerKey ? "YOUR TURN" : "TURN") : "");
  }

  function renderPlayers() {
    if (!isValid(State.players)) return;
    const game = State.game;
    const source = getPlayerRenderSource();
    State.renderCache.playerRows = State.renderCache.playerRows || {};
    const orderKey = source.map((player) => player.key || normalizePlayerKey(player.name)).join("|");
    if (State.renderCache.playerOrderKey && State.renderCache.playerOrderKey !== orderKey) {
      // Panorama panel moving is not available in every runtime; reset only when display order changes.
      clearChildren(State.players);
      State.renderCache.playerRows = {};
    }
    State.renderCache.playerOrderKey = orderKey;
    const seen = {};
    for (let i = 0; i < source.length; i += 1) {
      const player = source[i];
      const key = player.key || normalizePlayerKey(player.name) || ("seat" + i);
      seen[key] = true;
      let rowState = State.renderCache.playerRows[key];
      if (!rowState || !isValid(rowState.row)) {
        const row = createPanel("Panel", State.players, "", "PokerPlayerRow");
        const info = createPanel("Panel", row, "", "PokerPlayerInfo");
        const name = createLabel(info, "PokerPlayerName", "");
        const stack = createLabel(info, "PokerPlayerStack", "");
        const cards = createPanel("Panel", row, "", "PokerHoleCards");
        const cardA = CardPresenter.render(cards, null, true);
        const cardB = CardPresenter.render(cards, null, true);
        const state = createLabel(row, "PokerPlayerState", "");
        rowState = { row: row, name: name, stack: stack, cards: [cardA, cardB], state: state };
        State.renderCache.playerRows[key] = rowState;
      }
      const row = rowState.row;
      setPanelClass(row, CLASSES.current, !!(game && game.active && i === game.currentIndex));
      setPanelClass(row, CLASSES.folded, !!player.folded);
      setPanelClass(row, CLASSES.eliminated, player.stack <= 0);
      setText(rowState.name, player.name || "Player");
      setText(rowState.stack, getPlayerChipText(game, player, i));
      if (shouldRevealPlayerCards(game, player)) {
        CardPresenter.update(rowState.cards[0], player.cards[0], true);
        CardPresenter.update(rowState.cards[1], player.cards[1], true);
      } else {
        CardPresenter.update(rowState.cards[0], null, true);
        CardPresenter.update(rowState.cards[1], null, true);
      }
      setText(rowState.state, getPlayerStateText(game, player, i));
    }
    const keys = Object.keys(State.renderCache.playerRows);
    for (let i = 0; i < keys.length; i += 1) {
      if (seen[keys[i]]) continue;
      const rowState = State.renderCache.playerRows[keys[i]];
      try {
        if (rowState && rowState.row && typeof rowState.row.DeleteAsync === "function") rowState.row.DeleteAsync(0);
      } catch (e) {}
      delete State.renderCache.playerRows[keys[i]];
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

  function renderTableSeats() {
    if (!isValid(State.tableSeats)) return;
    const game = State.game;
    const source = getPlayerRenderSource();
    const visible = source.slice(0, TABLE_EDGE_SEAT_LIMIT);
    const overflowCount = Math.max(0, source.length - TABLE_EDGE_SEAT_LIMIT);
    const orderKey = visible.map((player, index) => player.key || normalizePlayerKey(player.name) || ("seat" + index)).join("|") + "|overflow:" + overflowCount;
    if (State.renderCache.tableSeatOrderKey !== orderKey) {
      clearChildren(State.tableSeats);
      State.renderCache.tableSeatRows = {};
      State.renderCache.tableSeatOverflow = null;
    }
    State.renderCache.tableSeatOrderKey = orderKey;
    State.renderCache.tableSeatRows = State.renderCache.tableSeatRows || {};
    for (let i = 0; i < visible.length; i += 1) {
      const player = visible[i];
      const key = player.key || normalizePlayerKey(player.name) || ("seat" + i);
      let rowState = State.renderCache.tableSeatRows[key];
      if (!rowState || !isValid(rowState.seat)) {
        const seat = createPanel("Panel", State.tableSeats, "", "PokerTableSeat");
        const cards = createPanel("Panel", seat, "", "PokerTableSeatCards");
        const cardA = CardPresenter.render(cards, null, true);
        const cardB = CardPresenter.render(cards, null, true);
        const row = createPanel("Panel", seat, "", "PokerTableSeatMetaRow");
        const avatar = createPanel("Panel", row, "", "PokerTableSeatAvatar");
        const avatarLabel = createLabel(avatar, "", "");
        const text = createPanel("Panel", row, "", "PokerTableSeatText");
        const name = createLabel(text, "PokerTableSeatName", "");
        const stack = createLabel(text, "PokerTableSeatStack", "");
        const state = createLabel(text, "PokerTableSeatState", "");
        rowState = { seat: seat, avatarLabel: avatarLabel, name: name, stack: stack, state: state, cards: [cardA, cardB] };
        State.renderCache.tableSeatRows[key] = rowState;
      }
      const seat = rowState.seat;
      setPanelClass(seat, CLASSES.current, !!(game && game.active && i === game.currentIndex));
      setPanelClass(seat, CLASSES.folded, !!player.folded);
      setPanelClass(seat, CLASSES.eliminated, player.stack <= 0);
      for (let j = 0; j < TABLE_SEAT_POSITION_CLASSES.length; j += 1) setPanelClass(seat, TABLE_SEAT_POSITION_CLASSES[j], false);
      const positionClass = getTableSeatPositionClass(i, Math.min(source.length, TABLE_EDGE_SEAT_LIMIT));
      if (positionClass) setPanelClass(seat, positionClass, true);
      setText(rowState.avatarLabel, getPlayerInitial(player.name));
      setText(rowState.name, player.name || "Player");
      setText(rowState.stack, getPlayerChipText(game, player, i));
      setText(rowState.state, getPlayerStateText(game, player, i));
      if (shouldRevealPlayerCards(game, player)) {
        CardPresenter.update(rowState.cards[0], player.cards[0], true);
        CardPresenter.update(rowState.cards[1], player.cards[1], true);
      } else {
        CardPresenter.update(rowState.cards[0], null, true);
        CardPresenter.update(rowState.cards[1], null, true);
      }
    }
    if (overflowCount > 0) {
      if (!isValid(State.renderCache.tableSeatOverflow)) {
        State.renderCache.tableSeatOverflow = createLabel(State.tableSeats, "PokerTableOverflow", "");
      }
      setText(State.renderCache.tableSeatOverflow, "+" + overflowCount + " players in list");
    } else if (isValid(State.renderCache.tableSeatOverflow)) {
      try {
        if (typeof State.renderCache.tableSeatOverflow.DeleteAsync === "function") State.renderCache.tableSeatOverflow.DeleteAsync(0);
      } catch (e) {}
      State.renderCache.tableSeatOverflow = null;
    }
  }

  function addActionButton(label, command, className, enabled, readOnly) {
    const button = createPanel("Button", State.actions, "", className || "PokerActionButton");
    const active = enabled !== false;
    Affordance.button(button, { enabled: active, hidden: false, eligible: active, readOnly: !!readOnly });
    createLabel(button, "PokerActionButtonLabel", label);
    if (!active || readOnly) return;
    try {
      button.SetPanelEvent("onactivate", () => sendAction(command, label));
    } catch (e) {}
  }

  function renderActionChoices(actor, enabled, readOnly) {
    const game = State.game;
    if (!actor || !game) return;
    const legal = getLegalActions(actor);
    if (legal.check) addActionButton("CHECK", "check", "PokerActionButton", enabled, readOnly);
    if (legal.call) addActionButton("CALL $" + legal.toCall, "call", "PokerActionButton", enabled, readOnly);
    if (game.currentBet === 0) {
      const minimumBet = getCurrentBigBlind(game);
      const largerBet = getLargeActionTarget(game);
      if (legal.canBetTarget(minimumBet)) addActionButton("BET $" + minimumBet, "bet $" + minimumBet, "PokerActionButton", enabled, readOnly);
      if (largerBet > minimumBet && legal.canBetTarget(largerBet)) addActionButton("BET $" + largerBet, "bet $" + largerBet, "PokerActionButton", enabled, readOnly);
    } else {
      const minimumRaiseTo = getMinimumRaiseTo(game);
      const largerRaiseTo = game.currentBet + getLargeActionTarget(game);
      if (legal.canRaiseTarget(minimumRaiseTo)) addActionButton("RAISE TO $" + minimumRaiseTo, "raise $" + minimumRaiseTo, "PokerActionButton", enabled, readOnly);
      if (largerRaiseTo > minimumRaiseTo && legal.canRaiseTarget(largerRaiseTo)) addActionButton("RAISE TO $" + largerRaiseTo, "raise $" + largerRaiseTo, "PokerActionButton", enabled, readOnly);
    }
    if (legal.fold) addActionButton("FOLD", "fold", "PokerActionButton Danger", enabled, readOnly);
  }

  function renderActions() {
    if (!isValid(State.actions)) return;
    clearChildren(State.actions);
    const buttonState = getCurrentButtonState();
    Affordance.hidden(State.actions, buttonState.controls.actionContainer.hidden);
    if (buttonState.controls.actionContainer.hidden) return;
    if (buttonState.text.actionHint) createLabel(State.actions, "PokerActionHint", buttonState.text.actionHint);
    for (let i = 0; i < buttonState.actionChoices.length; i += 1) {
      const choice = buttonState.actionChoices[i];
      addActionButton(choice.label, choice.command, choice.className, choice.enabled, choice.readOnly);
    }
  }

  function renderLog() {
    if (!isValid(State.log)) return;
    const hasGame = !!State.game;
    setPanelClass(State.log, CLASSES.hidden, !hasGame);
    State.renderCache.logRows = State.renderCache.logRows || [];
    if (!hasGame) {
      clearChildren(State.log);
      State.renderCache.logRows = [];
      return;
    }
    const entries = State.game.log && State.game.log.length ? State.game.log : ["Hand history will appear here."];
    const start = Math.max(0, entries.length - MAX_GAME_LOG_ENTRIES);
    const visible = entries.slice(start);
    while (State.renderCache.logRows.length > visible.length) {
      const row = State.renderCache.logRows.pop();
      try {
        if (row && typeof row.DeleteAsync === "function") row.DeleteAsync(0);
      } catch (e) {}
    }
    for (let i = 0; i < visible.length; i += 1) {
      let row = State.renderCache.logRows[i];
      if (!isValid(row)) {
        row = createLabel(State.log, "PokerLogLine", "");
        State.renderCache.logRows[i] = row;
      }
      setText(row, visible[i]);
    }
  }

  function renderCommunityStable() {
    return renderCommunity();
  }

  function renderPlayersStable() {
    return renderPlayers();
  }

  function renderTableSeatsStable() {
    return renderTableSeats();
  }

  function renderActionsStable() {
    return renderActions();
  }

  function renderLogStable() {
    return renderLog();
  }

  const TableRenderer = {
    renderGame: renderGame,
    renderCommunity: renderCommunityStable,
    renderPlayers: renderPlayersStable,
    renderTableSeats: renderTableSeatsStable,
    renderActions: renderActionsStable,
    renderLog: renderLogStable,
  };

  function renderAnnouncer() {
    if (!isValid(State.announcer)) return;
    const game = State.game;
    const announcement = game && game.announcement;
    const title = announcement && announcement.title ? announcement.title : "Poker announcer";
    const detail = announcement && announcement.detail ? announcement.detail : "Ready up, start a hand, and the table will call blinds, turns, checks, bets, raises, folds, and winners here.";
    setText(State.announcerTitle, title);
    setText(State.announcerBody, detail);
  }


  function updateMatchPanels() {
    const hasGame = !!State.game;
    const buttonState = getCurrentButtonState();
    setPanelClass(State.tableSurface, CLASSES.hidden, false);
    setPanelClass(State.players, CLASSES.hidden, false);
    setPanelClass(State.seatsList, CLASSES.hidden, true);
    setPanelClass(State.tableSeats, CLASSES.hidden, !hasGame);
    setPanelClass(State.log, CLASSES.hidden, !hasGame);
    Affordance.button(State.endButton, buttonState.controls.endMatch);
    Affordance.button(State.leaveLobbyButton, buttonState.controls.leaveLobby);
  }

  function renderGame() {
    cachePanels();
    const game = State.game;
    const hasGame = !!game;
    setText(State.pot, game ? "POT $" + game.pot : "POT $0");
    setText(State.phase, game ? String(game.phase || "lobby").toUpperCase() : "LOBBY");
    updateMatchPanels();
    if (game && game.active) setStatus(getActionStatusText());
    renderAnnouncer();
    renderCommunity();
    renderPlayers();
    if (hasGame) renderTableSeats();
    renderActions();
    renderLog();
    renderProgressControls();
    updateStartButton(State.readyCountValue || getReadySeatArray().length);
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
    State.menuButton = isValid(State.menuButton) ? State.menuButton : findChild(root, IDS.rootButton);
    State.panel = isValid(State.panel) ? State.panel : findChild(root, IDS.panel);
    State.tableWindow = isValid(State.tableWindow) ? State.tableWindow : findChild(root, IDS.tableWindow);
    State.lobbyWindow = isValid(State.lobbyWindow) ? State.lobbyWindow : findChild(root, IDS.lobbyWindow);
    State.playersWindow = isValid(State.playersWindow) ? State.playersWindow : findChild(root, IDS.playersWindow);
    State.historyWindow = isValid(State.historyWindow) ? State.historyWindow : findChild(root, IDS.historyWindow);
    State.actionsWindow = isValid(State.actionsWindow) ? State.actionsWindow : findChild(root, IDS.actionsWindow);
    State.closeButton = isValid(State.closeButton) ? State.closeButton : findChild(root, IDS.closeButton);
    State.readyChatButton = isValid(State.readyChatButton) ? State.readyChatButton : findChild(root, IDS.readyChatButton);
    State.startButton = isValid(State.startButton) ? State.startButton : findChild(root, IDS.startButton);
    State.startButtonLabel = isValid(State.startButtonLabel) ? State.startButtonLabel : findChild(root, IDS.startButtonLabel);
    State.endButton = isValid(State.endButton) ? State.endButton : findChild(root, IDS.endButton);
    State.leaveLobbyButton = isValid(State.leaveLobbyButton) ? State.leaveLobbyButton : findChild(root, IDS.leaveLobbyButton);
    State.partyControls = isValid(State.partyControls) ? State.partyControls : findChild(root, IDS.partyControls);
    State.partyHostButton = isValid(State.partyHostButton) ? State.partyHostButton : findChild(root, IDS.partyHostButton);
    State.partyJoinButton = isValid(State.partyJoinButton) ? State.partyJoinButton : findChild(root, IDS.partyJoinButton);
    State.partyStatus = isValid(State.partyStatus) ? State.partyStatus : findChild(root, IDS.partyStatus);
    State.progressControls = isValid(State.progressControls) ? State.progressControls : findChild(root, IDS.progressControls);
    State.exportProgressButton = isValid(State.exportProgressButton) ? State.exportProgressButton : findChild(root, IDS.exportProgressButton);
    State.importProgressButton = isValid(State.importProgressButton) ? State.importProgressButton : findChild(root, IDS.importProgressButton);
    State.progressCodeInput = isValid(State.progressCodeInput) ? State.progressCodeInput : findChild(root, IDS.progressCodeInput);
    State.progressCodeLabel = isValid(State.progressCodeLabel) ? State.progressCodeLabel : findChild(root, IDS.progressCodeLabel);
    State.resumeControls = isValid(State.resumeControls) ? State.resumeControls : findChild(root, IDS.resumeControls);
    State.resumeLeaderButton = isValid(State.resumeLeaderButton) ? State.resumeLeaderButton : findChild(root, IDS.resumeLeaderButton);
    State.resumeReadyButton = isValid(State.resumeReadyButton) ? State.resumeReadyButton : findChild(root, IDS.resumeReadyButton);
    State.resumeStatus = isValid(State.resumeStatus) ? State.resumeStatus : findChild(root, IDS.resumeStatus);
    State.resumeLeaderList = isValid(State.resumeLeaderList) ? State.resumeLeaderList : findChild(root, IDS.resumeLeaderList);
    State.readyCount = isValid(State.readyCount) ? State.readyCount : findChild(root, IDS.readyCount);
    State.seatsList = isValid(State.seatsList) ? State.seatsList : findChild(root, IDS.seatsList);
    State.status = isValid(State.status) ? State.status : findChild(root, IDS.status);
    State.pot = isValid(State.pot) ? State.pot : findChild(root, IDS.pot);
    State.phase = isValid(State.phase) ? State.phase : findChild(root, IDS.phase);
    State.tableSurface = isValid(State.tableSurface) ? State.tableSurface : findChild(root, IDS.tableSurface);
    State.announcer = isValid(State.announcer) ? State.announcer : findChild(root, IDS.announcer);
    State.announcerTitle = isValid(State.announcerTitle) ? State.announcerTitle : findChild(root, IDS.announcerTitle);
    State.announcerBody = isValid(State.announcerBody) ? State.announcerBody : findChild(root, IDS.announcerBody);
    State.community = isValid(State.community) ? State.community : findChild(root, IDS.community);
    State.players = isValid(State.players) ? State.players : findChild(root, IDS.players);
    State.tableSeats = isValid(State.tableSeats) ? State.tableSeats : findChild(root, IDS.tableSeats);
    State.actions = isValid(State.actions) ? State.actions : findChild(root, IDS.actions);
    State.log = isValid(State.log) ? State.log : findChild(root, IDS.log);
  }

  function boot() {
    cachePanels();
    State.party = getPartyState();
    State.resume = getResumeState();
    bindButton(State.menuButton, toggleOpen);
    bindButton(State.closeButton, closeMenu);
    bindButton(State.readyChatButton, sendReadyChat);
    bindButton(State.partyHostButton, sendPartyLeaderCommand);
    bindButton(State.partyJoinButton, sendPartyJoinCommand);
    bindButton(State.startButton, sendStartCommand);
    bindButton(State.endButton, endMatch);
    bindButton(State.leaveLobbyButton, leaveLobby);
    bindButton(State.exportProgressButton, copyProgressCode);
    bindButton(State.importProgressButton, importProgressCodeFromInput);
    bindButton(State.resumeLeaderButton, sendResumeLeaderCommand);
    bindButton(State.resumeReadyButton, sendResumeReadyCommand);
    if (!State.eventsBound && State.menuButton && State.panel && State.tableWindow && State.lobbyWindow && State.playersWindow && State.actionsWindow && State.readyChatButton && State.partyHostButton && State.partyJoinButton && State.startButton && State.seatsList && State.players && State.tableSeats) {
      State.eventsBound = true;
      try {
        $.RegisterForUnhandledEvent(CLIENT_OUTPUT_EVENT, handleBridgeEvent);
      } catch (e) {}
      StartSync.requestFreshState("boot");
      updateReadySeats(true);
      renderGame();
      startRefreshLoop();
      log("ESC poker menu ready");
    }
    if (!State.eventsBound) $.Schedule(0.2, boot);
  }

  function exportGlobals() {
    try {
      globalThis.PokerEscapeMenuToggle = toggleOpen;
      globalThis.PokerEscapeMenuClose = closeMenu;
      globalThis.PokerEscapeMenuSendReadyChat = sendReadyChat;
      globalThis.PokerEscapeMenuStart = sendStartCommand;
      globalThis.PokerEscapeMenuEndMatch = endMatch;
      globalThis.PokerEscapeMenuLeaveLobby = leaveLobby;
      globalThis.PokerEscapeMenuHostParty = sendPartyLeaderCommand;
      globalThis.PokerEscapeMenuJoinParty = sendPartyJoinCommand;
      globalThis.PokerEscapeMenuCopyProgress = copyProgressCode;
      globalThis.PokerEscapeMenuImportProgress = importProgressCodeFromInput;
      globalThis.PokerEscapeMenuResumeLeader = sendResumeLeaderCommand;
      globalThis.PokerEscapeMenuResumeReady = sendResumeReadyCommand;
      $.GetContextPanel().PokerEscapeMenuToggle = toggleOpen;
      $.GetContextPanel().PokerEscapeMenuClose = closeMenu;
      $.GetContextPanel().PokerEscapeMenuSendReadyChat = sendReadyChat;
      $.GetContextPanel().PokerEscapeMenuStart = sendStartCommand;
      $.GetContextPanel().PokerEscapeMenuEndMatch = endMatch;
      $.GetContextPanel().PokerEscapeMenuLeaveLobby = leaveLobby;
      $.GetContextPanel().PokerEscapeMenuHostParty = sendPartyLeaderCommand;
      $.GetContextPanel().PokerEscapeMenuJoinParty = sendPartyJoinCommand;
      $.GetContextPanel().PokerEscapeMenuCopyProgress = copyProgressCode;
      $.GetContextPanel().PokerEscapeMenuImportProgress = importProgressCodeFromInput;
      $.GetContextPanel().PokerEscapeMenuResumeLeader = sendResumeLeaderCommand;
      $.GetContextPanel().PokerEscapeMenuResumeReady = sendResumeReadyCommand;
    } catch (e) {}
  }

  function exportTestHooks() {
    try {
      globalThis.__PokerEscapeMenuTestHooks = {
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
        getPartyRoster: getPartyRoster,
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
