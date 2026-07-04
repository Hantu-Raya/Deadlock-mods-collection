(() => {
  "use strict";

  const LOG_PREFIX = "[PokerMenu]";
  const TEST_READY_MESSAGE = "ready";
  const CHAT_RETRY_DELAYS = [0.05, 0.1, 0.2, 0.35, 0.6, 1.0];
  const CHAT_ALL_LABEL = "#citadel_chat_all";
  const CLIENT_OUTPUT_EVENT = "ClientUI_FireOutput";
  const READY_EVENT = "PokerReadySeatsChanged";
  const READY_REQUEST_EVENT = "PokerReadySeatsRequest";
  const CHAT_EVENT = "PokerChatMessage";
  const CHAT_SNAPSHOT_REQUEST_EVENT = "PokerChatSnapshotRequest";
  const READY_SEATS_KEY = "PokerReadySeats";
  const READY_REVISION_KEY = "PokerReadyRevision";
  const LOCAL_PLAYER_KEY = "PokerLocalPlayerKey";
  const LOCAL_PLAYER_NAME_KEY = "PokerLocalPlayerName";
  const PENDING_SELF_ACTION_KEY = "PokerPendingSelfAction";
  const PARTY_STATE_KEY = "PokerPartyState";
  const PARTY_LEADER_PREFIX = "[party leader]";
  const PARTY_JOIN_PREFIX = "[party join]";
  const START_ROSTER_MARKER = "roster";
  const START_HAND_MARKER = "hand";
  const MIN_READY_PLAYERS = 2;
  const STARTING_STACK = 10000;
  const SMALL_BLIND = 100;
  const BIG_BLIND = 200;
  const ACTION_BET_EXTRA = 300;

  const IDS = {
    rootButton: "PokerMenuButton",
    panel: "PokerAnitaPanel",
    closeButton: "PokerCloseButton",
    readyChatButton: "PokerReadyChatButton",
    startButton: "PokerStartButton",
    startButtonLabel: "PokerStartButtonLabel",
    readyCount: "PokerReadyCountLabel",
    seatsList: "PokerSeatsList",
    status: "PokerStatusLabel",
    pot: "PokerPotLabel",
    phase: "PokerPhaseLabel",
    announcer: "PokerAnnouncerOverlay",
    announcerTitle: "PokerAnnouncerTitle",
    announcerBody: "PokerAnnouncerBody",
    community: "PokerCommunityCards",
    players: "PokerPlayersList",
    actions: "PokerActionButtons",
    log: "PokerGameLog",
    chat: "Chat",
    chatControls: "ChatControls",
    chatInput: "ChatInput",
    chatTargetLabel: "ChatTargetLabel",
    partyControls: "PokerPartyControls",
    partyHostButton: "PokerHostPartyButton",
    partyJoinButton: "PokerJoinPartyButton",
    partyStatus: "PokerPartyStatusLabel",
  };

  const CLASSES = {
    visible: "PokerMenuVisible",
    open: "Open",
    active: "Active",
    eligible: "Eligible",
    disabled: "Disabled",
    hidden: "PokerHidden",
    current: "Current",
    folded: "Folded",
    eliminated: "Eliminated",
    red: "RedSuit",
    black: "BlackSuit",
  };

  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const SUITS = ["S", "H", "D", "C"];
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
    menuButton: null,
    closeButton: null,
    readyChatButton: null,
    startButton: null,
    startButtonLabel: null,
    readyCount: null,
    seatsList: null,
    status: null,
    pot: null,
    phase: null,
    announcer: null,
    announcerTitle: null,
    announcerBody: null,
    community: null,
    players: null,
    actions: null,
    log: null,
    chat: null,
    chatInput: null,
    chatTargetLabel: null,
    partyControls: null,
    partyHostButton: null,
    partyJoinButton: null,
    partyStatus: null,
    isOpen: false,
    eventsBound: false,
    readyRevision: -1,
    readyCountValue: 0,
    lastSendMs: 0,
    refreshLoopStarted: false,
    processedChatSeq: 0,
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
    if (text.indexOf("party leader poker party ") === 0) return { type: "leader", id: extractPartyId(record, "[party leader]") || text.split(/\s+/).pop() };
    if (text.indexOf("party join poker party ") === 0) return { type: "join", id: extractPartyId(record, "[party join]") || text.split(/\s+/).pop() };
    return null;
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
    party.id = partyId || party.id;
    if (record && record.isSelf && party.mode === "leader" && isUnknownSender(record.sender)) {
      savePartyState();
      return false;
    }
    if (!record || isUnknownSender(record.sender)) return false;
    const key = normalizePlayerKey(record.sender);
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
    return true;
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

  function encodeRoster(roster) {
    if (!roster || !roster.length) return "";
    return roster.map((player) => encodeURIComponent(player.key || "") + "~" + encodeURIComponent(player.name || "")).join("|");
  }

  function decodeRoster(token) {
    const text = String(token || "");
    if (!text) return [];
    const roster = [];
    const entries = text.split("|");
    for (let i = 0; i < entries.length; i += 1) {
      const parts = entries[i].split("~");
      if (parts.length !== 2) return [];
      try {
        const key = normalizePlayerKey(decodeURIComponent(parts[0]));
        const name = decodeURIComponent(parts[1]).replace(/\s+/g, " ").trim();
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
    return "poker start " + seed + " " + START_HAND_MARKER + " " + syncedHandNumber + " " + START_ROSTER_MARKER + " " + encodeRoster(roster);
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
    return list;
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

  function setStatus(text) {
    cachePanels();
    setText(State.status, text);
  }

  function setPanelClass(panel, className, enabled) {
    if (!isValid(panel)) return;
    try {
      panel.SetHasClass(className, !!enabled);
    } catch (e) {}
  }

  function setOpen(open) {
    cachePanels();
    State.isOpen = !!open;
    setPanelClass(State.root, CLASSES.visible, State.isOpen);
    setPanelClass(State.panel, CLASSES.open, State.isOpen);
    setPanelClass(State.menuButton, CLASSES.active, State.isOpen);
    if (State.isOpen) {
      requestReadySnapshotBurst();
      requestChatSnapshot();
      updateReadySeats(true);
      renderGame();
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

  function createCard(parent, card, small) {
    const panel = createPanel("Panel", parent, "", small ? "PokerCard Small" : "PokerCard");
    if (!panel) return null;
    const red = card && (card.suit === "H" || card.suit === "D");
    setPanelClass(panel, red ? CLASSES.red : CLASSES.black, true);
    createLabel(panel, "PokerCardRank", card ? card.rank : "?");
    createLabel(panel, "PokerCardSuit", card ? card.suit : "?");
    return panel;
  }

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

  function getStartGate(count) {
    const activeGame = !!(State.game && State.game.active);
    if (activeGame) return { hidden: true, enabled: false, label: "", reason: "" };
    const finished = !!(State.game && State.game.finished && remainingPlayersWithChips() > 1);
    const rosterCount = getPartyRoster().length;
    const party = ensureParty();
    if (party.mode === "leader") {
      if (!party.leaderKey) return { hidden: false, enabled: false, label: "WAITING FOR NAME", reason: "Leader sender is not known yet." };
      if (rosterCount < MIN_READY_PLAYERS) return { hidden: false, enabled: false, label: "WAITING FOR PARTY", reason: "Need 2 joined party players to start." };
      return { hidden: false, enabled: true, label: finished ? "NEXT SYNCED HAND" : "START SYNCED HAND", reason: "" };
    }
    if (party.mode === "member") {
      return { hidden: false, enabled: false, label: "WAITING FOR LEADER", reason: "Only " + (party.leaderName || "<leader>") + " can start the synced hand." };
    }
    return { hidden: false, enabled: false, label: "HOST OR JOIN PARTY", reason: "Host a synced table or join a [party leader] before starting." };
  }

  function updateStartButton(count) {
    const gate = getStartGate(count);
    const activeGame = !!(State.game && State.game.active);
    setPanelClass(State.startButton, CLASSES.hidden, gate.hidden);
    setPanelClass(State.readyChatButton, CLASSES.hidden, activeGame);
    setPanelClass(State.partyControls, CLASSES.hidden, activeGame);
    setPanelClass(State.startButton, CLASSES.eligible, gate.enabled);
    setPanelClass(State.startButton, CLASSES.disabled, !gate.enabled);
    try {
      State.startButton.hittest = gate.enabled && !activeGame;
    } catch (e) {}
    setText(State.startButtonLabel, gate.label);
    if (gate.reason) setText(State.partyStatus, gate.reason);
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
    setText(State.readyCount, count + "/" + MIN_READY_PLAYERS + " ready");
    updateStartButton(count);
    if (!State.game || !State.game.active) {
      setStatus(isStartEligible(count) ? "Ready to start with " + count + " players." : "Waiting for " + (MIN_READY_PLAYERS - count) + " more ready player" + (MIN_READY_PLAYERS - count === 1 ? "." : "s."));
    }
    log("render ready seats: " + count + " player(s), revision " + revision);
  }

  function upsertReadySeat(entry) {
    if (!entry || !entry.name) return false;
    const key = normalizePlayerKey(entry.key || entry.name);
    if (!key) return false;
    const seats = getReadySeats();
    seats[key] = {
      key: key,
      name: entry.name,
      channel: entry.channel || "",
      message: entry.message || "",
      readyAt: entry.readyAt || Date.now(),
    };
    if (entry.isSelf) rememberLocalPlayer(entry.name);
    return true;
  }

  function applyReadyPayload(event) {
    if (!event || event.event !== READY_EVENT) return false;
    let changed = false;
    if (event.seats && event.seats.length) {
      for (let i = 0; i < event.seats.length; i += 1) changed = upsertReadySeat(event.seats[i]) || changed;
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
    if (event.event === READY_EVENT) {
      if (applyReadyPayload(event)) {
        log("received ready payload; rendering seats");
        updateReadySeats(true);
      }
      return;
    }
    if (event.event === CHAT_EVENT) {
      processChatPayload(event);
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

  function submitChatInput(input, message) {
    try {
      input.text = message;
      $.DispatchEvent("CitadelChatInputSubmitted", input);
      input.text = "";
      closeChatInput(input);
      setStatus("Sent: " + message);
      log("sent chat: " + message);
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

  function sendChatMessage(message) {
    const now = Date.now();
    if (now - State.lastSendMs < 800) {
      const waitMs = Math.max(50, 800 - (now - State.lastSendMs));
      const current = getCurrentPlayer();
      setStatus("Ignored rapid click. Pending command " + message + " for " + (current ? current.name : "<none>") + ". Wait " + waitMs + "ms.");
      log("send throttle ignored message=" + message + " current=" + (current ? current.name : "<none>") + " elapsedMs=" + (now - State.lastSendMs) + " waitMs=" + waitMs + " lastSendMs=" + State.lastSendMs);
      return;
    }
    State.lastSendMs = now;
    setOpen(true);
    setStatus("Opening chat and sending: " + message);
    try {
      $.DispatchEvent("CitadelConCommand", "say_chat_team");
    } catch (e) {}
    $.Schedule(CHAT_RETRY_DELAYS[0], () => retrySendChat(message, 0, 0));
  }

  function sendReadyChat() {
    sendChatMessage(TEST_READY_MESSAGE);
  }

  function sendPartyLeaderCommand() {
    if (State.game && State.game.active) {
      setStatus("Finish the current hand before changing party leader.");
      return;
    }
    const remembered = getRememberedLocalPlayerName();
    const party = ensureParty();
    const partyId = party.id || makePartyId(remembered || "leader");
    party.mode = "leader";
    party.id = partyId;
    savePartyState();
    renderGame();
    sendChatMessage(PARTY_LEADER_PREFIX + " poker party " + partyId);
    setStatus("Sent [party leader]. Wait for joiners, then start the synced hand.");
  }

  function sendPartyJoinCommand() {
    if (State.game && State.game.active) {
      setStatus("Finish the current hand before joining another party.");
      return;
    }
    requestChatSnapshot();
    const party = ensureParty();
    if (!party.id || !party.leaderKey) {
      setStatus("No [party leader] found yet. Ask the host to press HOST PARTY, then click JOIN PARTY again.");
      return;
    }
    party.mode = "member";
    savePartyState();
    renderGame();
    sendChatMessage(PARTY_JOIN_PREFIX + " poker party " + party.id);
  }

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
    while (State.game.log.length > 8) State.game.log.shift();
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

  function createGameFromReady(seed, rosterOverride, handNumberOverride) {
    const override = rosterOverride && rosterOverride.length >= MIN_READY_PLAYERS ? rosterOverride : null;
    const seats = override || getReadySeatArray();
    if (seats.length < MIN_READY_PLAYERS) {
      setStatus("Need 2 ready players to start.");
      return null;
    }
    const players = [];
    for (let i = 0; i < seats.length; i += 1) {
      const seatKey = seats[i].key || seats[i].name;
      const key = normalizePlayerKey(seatKey || seats[i].name);
      const name = seats[i].name || seats[i].key || "Player";
      const prior = State.bankrolls[key];
      const stack = typeof prior === "number" ? prior : STARTING_STACK;
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

    const dealerIndex = resolveDealerIndex(players);
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
    while (game.log.length > 8) game.log.shift();
  }

  function sendStartCommand() {
    if (State.game && State.game.active) return;
    const party = ensureParty();
    if (party.mode !== "leader") {
      setStatus("Only the [party leader] can start the synced hand.");
      return;
    }
    if (!party.leaderKey) {
      setStatus("Leader sender is not known yet. Type ready or reopen party chat so Deadlock exposes your name.");
      return;
    }
    const roster = getPartyRoster();
    if (roster.length < MIN_READY_PLAYERS) {
      setStatus("Need 2 joined party players to start.");
      return;
    }
    const seed = "s" + Date.now().toString(36);
    sendChatMessage(buildSynchronizedStartCommand(seed, roster, getNextHandNumber()));
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
    setStatus(status);
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

  function findGamePlayerByKey(key) {
    if (!State.game) return null;
    for (let i = 0; i < State.game.players.length; i += 1) if (State.game.players[i].key === key) return State.game.players[i];
    return null;
  }

  function findGamePlayer(sender) {
    return findGamePlayerByKey(normalizePlayerKey(sender));
  }

  function resolveSelfRecord(record) {
    if (!record || !record.isSelf) return record;
    if (!isUnknownSender(record.sender)) {
      rememberLocalPlayer(record.sender);
      return record;
    }
    const localPlayer = findGamePlayerByKey(State.localPlayerKey);
    const rememberedName = getRememberedLocalPlayerName();
    const name = localPlayer ? localPlayer.name : rememberedName;
    if (!name) return record;
    const resolved = {};
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i += 1) resolved[keys[i]] = record[keys[i]];
    resolved.sender = name;
    rememberLocalPlayer(name);
    return resolved;
  }

  function resolveUnknownActionRecord(record, text) {
    if (!record || record.isSelf || !isUnknownSender(record.sender) || !isActionText(text)) return record;
    const current = getCurrentPlayer();
    if (!State.game || !State.game.active || !current || !current.name) return record;
    if (!isLegalLocalCommand(text, current)) return record;
    const resolved = {};
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i += 1) resolved[keys[i]] = record[keys[i]];
    resolved.sender = current.name;
    log("resolved unknown action sender to current actor " + current.name);
    return resolved;
  }

  function processChatRecord(record) {
    if (!record || !record.message) return;
    const resolvedRecord = resolveSelfRecord(record);
    const text = normalizeText(resolvedRecord.message);
    if (!text) return;
    const partyMessage = parsePartyMessage(resolvedRecord);
    if (partyMessage) {
      if (partyMessage.type === "leader") recordPartyLeader(resolvedRecord, partyMessage.id);
      else recordPartyJoin(resolvedRecord, partyMessage.id);
      updateReadySeats(true);
      renderGame();
      return;
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
            setStatus("Invalid synced poker hand number.");
            return;
          }
        }
        const decodedRoster = decodeRoster(parts.slice(rosterIndex + 1).join(""));
        if (decodedRoster.length < MIN_READY_PLAYERS) {
          setStatus("Invalid synced poker roster.");
          return;
        }
        const starterKey = normalizePlayerKey(resolvedRecord.sender);
        const party = ensureParty();
        if (party.leaderKey && starterKey !== party.leaderKey) {
          debugActionState("reject-non-leader-start sender=" + resolvedRecord.sender + " leader=" + party.leaderName, resolvedRecord, null);
          setStatus("Only " + (party.leaderName || "<leader>") + " can start the synced hand.");
          return;
        }
        if (!party.leaderKey) {
          if (!decodedRoster[0] || decodedRoster[0].key !== starterKey) {
            debugActionState("reject-non-leader-start sender=" + resolvedRecord.sender + " leader=" + (decodedRoster[0] ? decodedRoster[0].name : "<unknown>"), resolvedRecord, null);
            setStatus("Only " + (decodedRoster[0] ? decodedRoster[0].name : "<leader>") + " can start the synced hand.");
            return;
          }
          applyPartyRoster(decodedRoster, resolvedRecord.isSelf ? "leader" : "member", ensureParty().id);
        }
        applyPartyRoster(decodedRoster, party.mode, party.id);
        rememberLocalFromPartyRoster(decodedRoster);
        State.game = createGameFromReady(seed, decodedRoster, syncedHandNumber || undefined);
        if (State.game) {
          setStatus("Poker started. " + getCurrentPlayer().name + " acts first.");
          log("game started seed " + seed);
          renderGame();
        }
        return;
      }
      const seed = parts.length > 2 ? parts.slice(2).join(" ") : String(Date.now());
      State.game = createGameFromReady(seed + " " + resolvedRecord.sender);
      if (State.game) {
        setStatus("Poker started. " + getCurrentPlayer().name + " acts first.");
        log("game started seed " + seed);
        renderGame();
      }
      return;
    }
    if (text === "all in" || text === "allin") {
      debugActionState("reject-unknown-action command=" + text, resolvedRecord, findGamePlayer(resolvedRecord.sender));
      return;
    }
    if (!isActionText(text)) return;
    if (!State.game || !State.game.active) {
      debugActionState("drop-no-active-game message=" + text, resolvedRecord, null);
      return;
    }
    const actionRecord = resolveUnknownActionRecord(resolvedRecord, text);
    const player = findGamePlayer(actionRecord.sender);
    if (!player) {
      debugActionState("reject-unknown-sender command=" + text + " amount=" + parseAmount(text) + " toCall=0 minRaise=" + (State.game ? State.game.minRaise || getCurrentBigBlind(State.game) : BIG_BLIND) + " currentBet=" + (State.game ? State.game.currentBet : 0) + " playerBet=<none> playerStack=<none> playerCommitted=<none>", actionRecord, null);
      return;
    }
    if (text === "check") applyLegalAction(player, "check", 0, actionRecord);
    else if (text === "call") applyLegalAction(player, "call", 0, actionRecord);
    else if (text === "fold") applyLegalAction(player, "fold", 0, actionRecord);
    else if (text.indexOf("bet") === 0) applyLegalAction(player, "bet", parseAmount(text), actionRecord);
    else if (text.indexOf("raise") === 0) applyLegalAction(player, "raise", parseAmount(text), actionRecord);
  }

  function processChatPayload(event) {
    if (!event) return;
    if (event.messages && event.messages.length) {
      for (let i = 0; i < event.messages.length; i += 1) {
        const message = event.messages[i];
        if (message.seq && message.seq <= State.processedChatSeq) continue;
        State.processedChatSeq = Math.max(State.processedChatSeq, message.seq || 0);
        processChatRecord(message);
      }
      return;
    }
    if (event.seq && event.seq <= State.processedChatSeq) return;
    State.processedChatSeq = Math.max(State.processedChatSeq, event.seq || 0);
    processChatRecord(event);
  }

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
    const config = getConfig();
    config[PENDING_SELF_ACTION_KEY] = {
      message: command,
      sentAt: Date.now(),
      phase: phase,
    };
    log("action click label=" + (label || command) + " command=" + command + " phase=" + phase + " current=" + (current ? current.name : "<none>") + " toCall=" + toCall);
    sendChatMessage(command);
  }

  function renderCommunity() {
    if (!isValid(State.community)) return;
    clearChildren(State.community);
    const cards = State.game ? State.game.community : [];
    for (let i = 0; i < 5; i += 1) createCard(State.community, cards[i] || null, false);
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

  function renderPlayers() {
    if (!isValid(State.players)) return;
    clearChildren(State.players);
    const game = State.game;
    const source = game && game.players.length ? game.players : getReadySeatArray().map((seat) => ({ key: normalizePlayerKey(seat.name), name: seat.name, stack: STARTING_STACK, bet: 0, cards: [], folded: false }));
    for (let i = 0; i < source.length; i += 1) {
      const player = source[i];
      const row = createPanel("Panel", State.players, "", "PokerPlayerRow");
      if (game && game.active && i === game.currentIndex) setPanelClass(row, CLASSES.current, true);
      if (player.folded) setPanelClass(row, CLASSES.folded, true);
      if (player.stack <= 0) setPanelClass(row, CLASSES.eliminated, true);
      const info = createPanel("Panel", row, "", "PokerPlayerInfo");
      createLabel(info, "PokerPlayerName", player.name || "Player");
      createLabel(info, "PokerPlayerStack", getPlayerChipText(game, player, i));
      const cards = createPanel("Panel", row, "", "PokerHoleCards");
      const revealCards = player.cards && player.cards.length && (!game || !game.active || player.key === State.localPlayerKey);
      if (revealCards) {
        createCard(cards, player.cards[0], true);
        createCard(cards, player.cards[1], true);
      } else {
        createCard(cards, null, true);
        createCard(cards, null, true);
      }
      createLabel(row, "PokerPlayerState", player.folded ? "FOLD" : player.result || (game && game.active && i === game.currentIndex ? (player.key === State.localPlayerKey ? "YOUR TURN" : "TURN") : ""));
    }
  }

  function addActionButton(label, command, className, enabled) {
    const button = createPanel("Button", State.actions, "", className || "PokerActionButton");
    const active = enabled !== false;
    setPanelClass(button, CLASSES.disabled, !active);
    try {
      button.hittest = active;
    } catch (e) {}
    createLabel(button, "PokerActionButtonLabel", label);
    if (!active) return;
    try {
      button.SetPanelEvent("onactivate", () => sendAction(command, label));
    } catch (e) {}
  }

  function renderActionChoices(actor, enabled) {
    const game = State.game;
    if (!actor || !game) return;
    const legal = getLegalActions(actor);
    if (legal.check) addActionButton("CHECK", "check", "PokerActionButton", enabled);
    if (legal.call) addActionButton("CALL $" + legal.toCall, "call", "PokerActionButton", enabled);
    if (game.currentBet === 0) {
      const minimumBet = getCurrentBigBlind(game);
      const largerBet = getLargeActionTarget(game);
      if (legal.canBetTarget(minimumBet)) addActionButton("BET $" + minimumBet, "bet $" + minimumBet, "PokerActionButton", enabled);
      if (largerBet > minimumBet && legal.canBetTarget(largerBet)) addActionButton("BET $" + largerBet, "bet $" + largerBet, "PokerActionButton", enabled);
    } else {
      const minimumRaiseTo = getMinimumRaiseTo(game);
      const largerRaiseTo = game.currentBet + getLargeActionTarget(game);
      if (legal.canRaiseTarget(minimumRaiseTo)) addActionButton("RAISE TO $" + minimumRaiseTo, "raise $" + minimumRaiseTo, "PokerActionButton", enabled);
      if (largerRaiseTo > minimumRaiseTo && legal.canRaiseTarget(largerRaiseTo)) addActionButton("RAISE TO $" + largerRaiseTo, "raise $" + largerRaiseTo, "PokerActionButton", enabled);
    }
    if (legal.fold) addActionButton("FOLD", "fold", "PokerActionButton Danger", enabled);
  }

  function renderActions() {
    if (!isValid(State.actions)) return;
    clearChildren(State.actions);
    const activeGame = !!(State.game && State.game.active);
    setPanelClass(State.actions, CLASSES.hidden, !activeGame);
    if (!activeGame) return;
    const current = getCurrentPlayer();
    const local = getLocalPlayer();
    createLabel(State.actions, "PokerActionHint", getActionStatusText());
    if (!current) return;

    if (!local) {
      createLabel(State.actions, "PokerActionHint", "Chat sender unknown. Type ready or reopen party chat so Deadlock exposes your name before acting.");
      renderActionChoices(current, false);
      return;
    }

    if (current.key !== local.key) {
      createLabel(State.actions, "PokerActionHint", "Waiting for " + current.name + ". Their available choices are shown read-only below.");
      renderActionChoices(current, false);
      return;
    }

    renderActionChoices(local, true);
  }

  function renderLog() {
    if (!isValid(State.log)) return;
    clearChildren(State.log);
    const entries = State.game && State.game.log.length ? State.game.log : ["Waiting for players.", "Ready players become seats.", "Start creates a $10000 stack game with blinds that rise $100/$200 each hand."];
    for (let i = 0; i < entries.length; i += 1) createLabel(State.log, "PokerLogLine", entries[i]);
  }

  function renderAnnouncer() {
    if (!isValid(State.announcer)) return;
    const game = State.game;
    const announcement = game && game.announcement;
    const title = announcement && announcement.title ? announcement.title : "Poker announcer";
    const detail = announcement && announcement.detail ? announcement.detail : "Ready up, start a hand, and the table will call blinds, turns, checks, bets, raises, folds, and winners here.";
    setText(State.announcerTitle, title);
    setText(State.announcerBody, detail);
  }

  function renderGame() {
    cachePanels();
    const game = State.game;
    setText(State.pot, game ? "POT $" + game.pot : "POT $0");
    setText(State.phase, game ? String(game.phase || "lobby").toUpperCase() : "LOBBY");
    if (game && game.active) setStatus(getActionStatusText());
    renderAnnouncer();
    renderCommunity();
    renderPlayers();
    renderActions();
    renderLog();
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
    State.closeButton = isValid(State.closeButton) ? State.closeButton : findChild(root, IDS.closeButton);
    State.readyChatButton = isValid(State.readyChatButton) ? State.readyChatButton : findChild(root, IDS.readyChatButton);
    State.startButton = isValid(State.startButton) ? State.startButton : findChild(root, IDS.startButton);
    State.startButtonLabel = isValid(State.startButtonLabel) ? State.startButtonLabel : findChild(root, IDS.startButtonLabel);
    State.partyControls = isValid(State.partyControls) ? State.partyControls : findChild(root, IDS.partyControls);
    State.partyHostButton = isValid(State.partyHostButton) ? State.partyHostButton : findChild(root, IDS.partyHostButton);
    State.partyJoinButton = isValid(State.partyJoinButton) ? State.partyJoinButton : findChild(root, IDS.partyJoinButton);
    State.partyStatus = isValid(State.partyStatus) ? State.partyStatus : findChild(root, IDS.partyStatus);
    State.readyCount = isValid(State.readyCount) ? State.readyCount : findChild(root, IDS.readyCount);
    State.seatsList = isValid(State.seatsList) ? State.seatsList : findChild(root, IDS.seatsList);
    State.status = isValid(State.status) ? State.status : findChild(root, IDS.status);
    State.pot = isValid(State.pot) ? State.pot : findChild(root, IDS.pot);
    State.phase = isValid(State.phase) ? State.phase : findChild(root, IDS.phase);
    State.announcer = isValid(State.announcer) ? State.announcer : findChild(root, IDS.announcer);
    State.announcerTitle = isValid(State.announcerTitle) ? State.announcerTitle : findChild(root, IDS.announcerTitle);
    State.announcerBody = isValid(State.announcerBody) ? State.announcerBody : findChild(root, IDS.announcerBody);
    State.community = isValid(State.community) ? State.community : findChild(root, IDS.community);
    State.players = isValid(State.players) ? State.players : findChild(root, IDS.players);
    State.actions = isValid(State.actions) ? State.actions : findChild(root, IDS.actions);
    State.log = isValid(State.log) ? State.log : findChild(root, IDS.log);
  }

  function boot() {
    cachePanels();
    State.party = getPartyState();
    bindButton(State.menuButton, toggleOpen);
    bindButton(State.closeButton, closeMenu);
    bindButton(State.readyChatButton, sendReadyChat);
    bindButton(State.partyHostButton, sendPartyLeaderCommand);
    bindButton(State.partyJoinButton, sendPartyJoinCommand);
    bindButton(State.startButton, sendStartCommand);
    if (!State.eventsBound && State.menuButton && State.panel && State.readyChatButton && State.partyHostButton && State.partyJoinButton && State.startButton && State.seatsList && State.players) {
      State.eventsBound = true;
      try {
        $.RegisterForUnhandledEvent(CLIENT_OUTPUT_EVENT, handleBridgeEvent);
      } catch (e) {}
      requestReadySnapshotBurst();
      requestChatSnapshot();
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
      globalThis.PokerEscapeMenuHostParty = sendPartyLeaderCommand;
      globalThis.PokerEscapeMenuJoinParty = sendPartyJoinCommand;
      $.GetContextPanel().PokerEscapeMenuToggle = toggleOpen;
      $.GetContextPanel().PokerEscapeMenuClose = closeMenu;
      $.GetContextPanel().PokerEscapeMenuSendReadyChat = sendReadyChat;
      $.GetContextPanel().PokerEscapeMenuStart = sendStartCommand;
      $.GetContextPanel().PokerEscapeMenuHostParty = sendPartyLeaderCommand;
      $.GetContextPanel().PokerEscapeMenuJoinParty = sendPartyJoinCommand;
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
        getCallAmount: getCallAmount,
        getMinimumRaiseTo: getMinimumRaiseTo,
        getLegalActions: getLegalActions,
        applyLegalAction: applyLegalAction,
        completeActionAdvance: completeActionAdvance,
        hasBettingRoundSettled: hasBettingRoundSettled,
        buildPots: buildPots,
        showdown: showdown,
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
