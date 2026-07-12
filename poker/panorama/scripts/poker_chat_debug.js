(() => {
  "use strict";

  const LOG_PREFIX = "[PokerDebug]";
  const CHAT_ROOT_ID = "Chat";
  const CHAT_MESSAGES_ID = "ChatMessages";
  const MESSAGE_SOURCE_ID = "MessageSource";
  const CHAT_TARGET_LABEL_ID = "ChatTargetLabel";
  const CHAT_INPUT_ID = "ChatInput";
  const MESSAGE_CONTENTS_ID = "MessageContents";
  const LOGGED_FLAG = "__pokerDebugLogged";
  const UNKNOWN_RETRY_FLAG = "__pokerDebugUnknownRetries";
  const UNKNOWN_WAITING_FLAG = "__pokerDebugUnknownWaiting";
  const ROW_SIGNATURE_FLAG = "__pokerDebugRowSignature";
  const ROW_CONTENT_SIGNATURE_FLAG = "__pokerDebugRowContentSignature";
  const LOW_LATENCY_TAIL_SCAN_LIMIT = 8;
  const BOOTSTRAP_TAIL_SCAN_LIMIT = 32;
  const FAST_POLL_SECONDS = 0.1;
  const SEND_RETRY_SECONDS = 0.1;
  const SEND_RETRY_LIMIT = 30;
  const SUPPORTED_SEND_TARGET = /(^#citadel_chat_(?:team|party|all)$)|\b(?:team|party|all)\b/i;
  const SLOW_POLL_SECONDS = 0.5;
  const EMPTY_NAME = "<unknown>";
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
  const CHAT_EVENT = BridgeContract.chatEvent;
  const CLIENT_OUTPUT_EVENT = BridgeContract.clientOutputEvent;
  const READY_SEATS_KEY = BridgeContract.keys.readySeats;
  const READY_REVISION_KEY = BridgeContract.keys.readyRevision;
  const CHAT_MESSAGES_KEY = BridgeContract.keys.chatMessages;
  const CHAT_SEQ_KEY = BridgeContract.keys.chatSequence;
  const LOCAL_PLAYER_NAME_KEY = BridgeContract.keys.localPlayerName;
  const UNKNOWN_SENDER_MAX_DELAYS = 6;
  const METRICS_KEY = "PokerRuntimeMetrics";

  const LABEL_TEXT_BUFFER = [];

  const State = {
    chat: null,
    messages: null,
    targetLabel: null,
    input: null,
    sendQueue: [],
    sendRetryScheduled: false,
    sendAttempts: 0,
    sendReadyStreak: 0,
    bootLogged: false,
    scannedCount: 0,
    pendingRows: [],
  };

  function isValid(panel) {
    return !!(panel && (!panel.IsValid || panel.IsValid()));
  }

  function safeText(panel) {
    try {
      return String((panel && panel.text) || "").replace(/\s+/g, " ").trim();
    } catch (e) {
      return "";
    }
  }

  function childCount(panel) {
    if (!isValid(panel) || typeof panel.GetChildCount !== "function") return 0;
    try {
      return panel.GetChildCount() || 0;
    } catch (e) {
      return 0;
    }
  }

  function childAt(panel, index) {
    if (!isValid(panel) || typeof panel.GetChild !== "function") return null;
    try {
      return panel.GetChild(index);
    } catch (e) {
      return null;
    }
  }

  function hasClass(panel, className) {
    if (!isValid(panel) || typeof panel.BHasClass !== "function") return false;
    try {
      return panel.BHasClass(className);
    } catch (e) {
      return false;
    }
  }

  function findClass(root, className) {
    if (!isValid(root)) return null;
    if (typeof root.FindChildrenWithClassTraverse === "function") {
      try {
        const matches = root.FindChildrenWithClassTraverse(className);
        if (matches && matches.length) {
          for (let i = 0; i < matches.length; i += 1) {
            if (isValid(matches[i])) return matches[i];
          }
        }
      } catch (e) {}
    }
    if (hasClass(root, className)) return root;
    const count = childCount(root);
    for (let i = 0; i < count; i += 1) {
      const found = findClass(childAt(root, i), className);
      if (found) return found;
    }
    return null;
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
  function collectLabelTextInto(panel, out) {
    if (!isValid(panel)) return;

    const text = safeText(panel);
    if (text) out.push(text);

    const count = childCount(panel);
    for (let i = 0; i < count; i += 1) {
      collectLabelTextInto(childAt(panel, i), out);
    }
  }

  function getConfig() {
    try {
      if (typeof GameUI !== "undefined" && GameUI.CustomUIConfig) {
        return GameUI.CustomUIConfig();
      }
    } catch (e) {}

    try {
      globalThis.__PokerFallbackConfig = globalThis.__PokerFallbackConfig || {};
      return globalThis.__PokerFallbackConfig;
    } catch (e) {
      return {};
    }
  }
  function nowMs() {
    return Date.now ? Date.now() : 0;
  }
  function extendBluffFastPoll() {
    const config = getConfig();
    const until = nowMs() + 1000;
    const current = Number(config[BridgeContract.keys.tableGameFastPollUntil] || 0);
    config[BridgeContract.keys.tableGameFastPollUntil] = Math.max(current, until);
  }
  function acceptBluffFastPollUntil(until) {
    const value = Number(until);
    const now = nowMs();
    if (!isFinite(value) || value <= now) return false;
    const config = getConfig();
    const key = BridgeContract.keys.tableGameFastPollUntil;
    config[key] = Math.max(Number(config[key] || 0), value);
    return true;
  }
  function getMetricsStore() {
    const config = getConfig();
    config[METRICS_KEY] = config[METRICS_KEY] || { counters: {} }; config[METRICS_KEY].counters = config[METRICS_KEY].counters || {};
    return config[METRICS_KEY];
  }

  function resetMetrics() {
    const config = getConfig();
    config[METRICS_KEY] = { counters: {} };
    return config[METRICS_KEY];
  }

  function getMetricsSnapshot() {
    const store = getMetricsStore();
    return { counters: JSON.parse(JSON.stringify(store.counters || {})) };
  }

  function incrementMetric(name, amount) {
    if (!(globalThis.__PokerTestMode || globalThis.__PokerMetricsEnabled)) return 0;
    const store = getMetricsStore();
    const key = String(name || "");
    if (!key) return 0;
    const delta = amount || 1;
    store.counters[key] = (Number(store.counters[key]) || 0) + delta;
    return store.counters[key];
  }

  const PokerMetrics = {
    reset: resetMetrics,
    snapshot: getMetricsSnapshot,
    increment: incrementMetric,
  };

  function getReadySeats() {
    const config = getConfig();
    config[READY_SEATS_KEY] = config[READY_SEATS_KEY] || {}; if (typeof config[READY_REVISION_KEY] !== "number") config[READY_REVISION_KEY] = 0;
    return config[READY_SEATS_KEY];
  }

  function normalizeMessage(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const BLUFF_SCOPED_LEAVE_RE = /^\[party leave\]\s+poker party\s+\S+\s+bd1\s+[0-9a-f]{8}\s+[1-9]\d*$/i;
  const BLUFF_MESSAGE_RE = /^bd1\s/i;
  const BLUFF_FAMILY = "bluff-deck";
  const BLUFF_START_FAMILY = { name: "bd1-start", family: BLUFF_FAMILY, authority: BLUFF_FAMILY, unknownSenderDelay: "always", prefix: "bd1 s " };
  const BLUFF_PLAY_FAMILY = { name: "bd1-play", family: BLUFF_FAMILY, authority: BLUFF_FAMILY, unknownSenderDelay: "none", prefix: "bd1 p " };
  const BLUFF_CHALLENGE_FAMILY = { name: "bd1-challenge", family: BLUFF_FAMILY, authority: BLUFF_FAMILY, unknownSenderDelay: "none", prefix: "bd1 c " };
  const BLUFF_END_FAMILY = { name: "bd1-end", family: BLUFF_FAMILY, authority: BLUFF_FAMILY, unknownSenderDelay: "always", prefix: "bd1 e " };
  const BLUFF_SHOOT_FAMILY = { name: "bd1-shoot", family: BLUFF_FAMILY, authority: BLUFF_FAMILY, unknownSenderDelay: "none", prefix: "bd1 r " };
  const BLUFF_LEAVE_FAMILY = { name: "bd1-leave", family: BLUFF_FAMILY, authority: BLUFF_FAMILY, unknownSenderDelay: "always" };
  const COMMAND_FAMILIES = [
    { name: "party-leader", family: "party", authority: "party", unknownSenderDelay: "limited", prefix: "party leader poker party " },
    { name: "party-join", family: "party", authority: "party", unknownSenderDelay: "always", prefix: "party join poker party " },
    { name: "party-leave", family: "party", authority: "party", unknownSenderDelay: "limited", prefix: "party leave poker party " },
    { name: "match-end", family: "match", authority: "match", unknownSenderDelay: "limited", prefix: "match end poker party " },
    { name: "progress-offer", family: "progress", authority: "progress", unknownSenderDelay: "limited", prefix: "progress offer poker progress " },
    { name: "progress-chunk", family: "progress", authority: "progress", unknownSenderDelay: "limited", prefix: "progress chunk poker progress " },
    { name: "resume-leader", family: "resume", authority: "resume", unknownSenderDelay: "always", prefix: "resume leader poker resume " },
    { name: "resume-ready", family: "resume", authority: "resume", unknownSenderDelay: "always", prefix: "resume ready poker resume " },
    { name: "resume-start", family: "start", authority: "start", unknownSenderDelay: "resume-start", prefix: "poker resume " },
    { name: "bd1-start", family: "bluff-deck", authority: "bluff-deck", unknownSenderDelay: "always", prefix: "bd1 s " },
    { name: "bd1-play", family: "bluff-deck", authority: "bluff-deck", unknownSenderDelay: "none", prefix: "bd1 p " },
    { name: "bd1-shoot", family: "bluff-deck", authority: "bluff-deck", unknownSenderDelay: "none", prefix: "bd1 r " },
    { name: "bd1-challenge", family: "bluff-deck", authority: "bluff-deck", unknownSenderDelay: "none", prefix: "bd1 c " },
    { name: "bd1-end", family: "bluff-deck", authority: "bluff-deck", unknownSenderDelay: "always", prefix: "bd1 e " },
    { name: "start", family: "start", authority: "action", unknownSenderDelay: "limited", prefix: "poker start" },
    { name: "legacy-start", family: "start", authority: "action", unknownSenderDelay: "limited", prefix: "start poker" },
    { name: "check", family: "action", authority: "action", unknownSenderDelay: "limited", literal: "check" },
    { name: "call", family: "action", authority: "action", unknownSenderDelay: "limited", literal: "call" },
    { name: "fold", family: "action", authority: "action", unknownSenderDelay: "limited", literal: "fold" },
    { name: "all-in", family: "action", authority: "action", unknownSenderDelay: "limited", literal: "all in" },
    { name: "allin", family: "action", authority: "action", unknownSenderDelay: "limited", literal: "allin" },
    { name: "bet", family: "action", authority: "action", unknownSenderDelay: "limited", prefix: "bet " },
    { name: "raise", family: "action", authority: "action", unknownSenderDelay: "limited", prefix: "raise " },
  ];

  function isBluffDeckMessage(text) {
    const raw = String(text || "").trim();
    return BLUFF_MESSAGE_RE.test(raw) || BLUFF_SCOPED_LEAVE_RE.test(raw);
  }
  function getCommandFamilyMatch(text) {
    const raw = String(text || "").trim();
    if (BLUFF_SCOPED_LEAVE_RE.test(raw)) return BLUFF_LEAVE_FAMILY;
    if (/^bd1\s+r\s+[0-9a-f]{8}\s+[1-9]\d*$/i.test(raw)) return BLUFF_SHOOT_FAMILY;
    const normalized = normalizeMessage(raw);
    for (let i = 0; i < COMMAND_FAMILIES.length; i += 1) {
      const entry = COMMAND_FAMILIES[i];
      if (entry.literal && normalized === entry.literal) return entry;
      if (entry.prefix && normalized.indexOf(entry.prefix) === 0) return entry;
    }
    return null;
  }
  function isReadyChatMessage(text, familyMatch) {
    const normalized = normalizeMessage(text);
    const match = familyMatch || getCommandFamilyMatch(text);
    if (!normalized || normalized === "not ready" || normalized === "unready") return false;
    return (
      normalized === "ready" ||
      normalized === "ready up" ||
      normalized === "im ready" ||
      normalized === "i am ready" ||
      normalized === "poker ready" ||
      normalized === "ready poker" ||
      normalized === "join poker" ||
      normalized === "poker join" ||
      !!(match && (match.name === "party-leader" || match.name === "party-join"))
    );
  }
  function normalizePlayerKey(sender) {
    return String(sender || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function shouldAcceptReadySender(sender) {
    const key = normalizePlayerKey(sender);
    return !!key && key !== normalizePlayerKey(EMPTY_NAME);
  }

  function isUnknownSender(sender) {
    return normalizePlayerKey(sender) === normalizePlayerKey(EMPTY_NAME);
  }
  function getReadySeatArray() {
    const seats = getReadySeats();
    const list = Object.keys(seats).map((key) => seats[key]).filter((entry) => entry && entry.name);
    list.sort((a, b) => (a.readyAt || 0) - (b.readyAt || 0)); return list;
  }

  function getChatMessages() {
    const config = getConfig();
    config[CHAT_MESSAGES_KEY] = config[CHAT_MESSAGES_KEY] || []; if (typeof config[CHAT_SEQ_KEY] !== "number") config[CHAT_SEQ_KEY] = 0;
    return config[CHAT_MESSAGES_KEY];
  }

  function dispatchChatEvent(payload) {
    try {
      $.DispatchEvent(CLIENT_OUTPUT_EVENT, JSON.stringify(payload));
    } catch (e) {}
  }

  function mutateReadySeats(action, record, reason) {
    const config = getConfig();
    const emit = (payload) => {
      payload.seats = payload.seats || getReadySeatArray();
      payload.count = payload.seats.length;
      payload.revision = config[READY_REVISION_KEY] || 0;
      const json = JSON.stringify(payload);
      config[BridgeContract.keys.readyLastEvent] = json;
      try {
        $.DispatchEvent(BridgeContract.clientOutputEvent, json);
      } catch (e) {}
    };
    if (action === "snapshot") {
      PokerMetrics.increment("readySnapshotDispatch");
      emit({ event: BridgeContract.readyEvent, action: "snapshot", reason: reason || "" });
      return { readyChanged: false, action: "snapshot" };
    }
    if (action === "clear") {
      config[READY_SEATS_KEY] = {};
      config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
      emit({ event: BridgeContract.readyEvent, action: "clear", reason: reason || "", seats: [] });
      try {
        $.Msg(LOG_PREFIX + " ready seats cleared" + (reason ? " (" + reason + ")" : ""));
      } catch (e) {}
      return { readyChanged: true, action: "clear" };
    }
    if (!record || !shouldAcceptReadySender(record.sender) || (action !== "ready" && action !== "leave")) {
      return { readyChanged: false, action: "" };
    }
    const key = normalizePlayerKey(record.sender);
    const seats = getReadySeats();
    if (action === "leave") {
      if (!seats[key]) return { readyChanged: false, action: "" };
      delete seats[key];
      config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
      emit({ event: BridgeContract.readyEvent, action: "leave", key: key, name: record.sender });
      try {
        $.Msg(LOG_PREFIX + " ready " + record.sender + " removed (" + Object.keys(seats).length + ")");
      } catch (e) {}
      return { readyChanged: true, action: "leave" };
    }
    const now = Date.now ? Date.now() : 0;
    const previous = seats[key];
    seats[key] = {
      key: key,
      name: record.sender,
      channel: record.channel || "",
      message: record.message || "",
      readyAt: now,
    };
    config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
    if (record.isSelf) {
      const localConfig = getConfig();
      localConfig[BridgeContract.keys.localPlayerKey] = key;
      localConfig[LOCAL_PLAYER_NAME_KEY] = record.sender;
    }
    emit({
      event: BridgeContract.readyEvent,
      action: "ready",
      key: key,
      name: record.sender,
      channel: record.channel || "",
      message: record.message || "",
      isSelf: !!record.isSelf,
      updated: !previous,
    });
    try {
      $.Msg(LOG_PREFIX + " ready " + record.sender + " seated (" + Object.keys(seats).length + ")");
    } catch (e) {}
    return { readyChanged: true, action: "ready" };
  }

  function handleChatSnapshotRequest(reason) {
    PokerMetrics.increment("chatSnapshotRequest");
    ChatBridgeIntake.scanOnce();
    const config = getConfig();
    dispatchChatEvent({
      event: CHAT_EVENT,
      action: "snapshot",
      reason: reason || "",
      seq: config[CHAT_SEQ_KEY] || 0,
      messages: getChatMessages(),
    });
    PokerMetrics.increment("chatSnapshotDispatch");
  }
  function resolveSendPanels() {
    if (isValid(State.input) && isValid(State.targetLabel)) return;
    let root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    State.chat = isValid(State.chat) ? State.chat : findChild(root, CHAT_ROOT_ID);
    State.targetLabel = findChild(State.chat, CHAT_TARGET_LABEL_ID) || findChild(root, CHAT_TARGET_LABEL_ID);
    State.input = findChild(State.chat, CHAT_INPUT_ID) || findChild(root, CHAT_INPUT_ID);
  }
  function isSupportedSendTarget() {
    return SUPPORTED_SEND_TARGET.test(safeText(State.targetLabel));
  }
  function runSendRetry() {
    State.sendRetryScheduled = false;
    flushRequestedChat();
  }

  function scheduleSendRetry() {
    if (State.sendRetryScheduled) return;
    State.sendRetryScheduled = true;
    $.Schedule(SEND_RETRY_SECONDS, runSendRetry);
  }

  function normalizeQueueEntry(message, requestId) {
    return { message: String(message || ""), requestId: String(requestId || "") };
  }
  function dispatchBluffSendStatus(entry, status) {
    if (!entry || !entry.requestId) return;
    dispatchChatEvent({
      event: BridgeContract.bluffDeckSendStatusEvent,
      requestId: entry.requestId,
      message: entry.message,
      status: status,
    });
  }
  function cancelBluffQueue(requestId) {
    const wanted = String(requestId || "");
    if (!wanted) return false;
    for (let i = 0; i < State.sendQueue.length; i += 1) {
      const entry = normalizeQueueEntry(State.sendQueue[i].message || State.sendQueue[i], State.sendQueue[i].requestId);
      if (entry.requestId !== wanted) continue;
      State.sendQueue.splice(i, 1);
      dispatchBluffSendStatus(entry, "cancelled");
      if (!State.sendQueue.length) State.sendRetryScheduled = false;
      else startSendCycle();
      return true;
    }
    return false;
  }

  function startSendCycle() {
    if (!State.sendQueue.length || State.sendRetryScheduled) return;
    State.sendAttempts = 0;
    State.sendReadyStreak = 0;
    try {
      $.DispatchEvent("CitadelConCommand", "say_chat_team");
    } catch (e) {}
    scheduleSendRetry();
  }

  function flushRequestedChat() {
    if (!State.sendQueue.length) return;
    const queued = State.sendQueue[0];
    const entry = normalizeQueueEntry(queued.message || queued, queued.requestId);
    resolveSendPanels();
    if (!isValid(State.input) || !isSupportedSendTarget()) {
      State.sendReadyStreak = 0;
      State.sendAttempts += 1;
      if (State.sendAttempts <= SEND_RETRY_LIMIT) scheduleSendRetry();
      else {
        State.sendQueue.shift();
        $.Msg(LOG_PREFIX + " chat send timed out: " + entry.message);
        dispatchBluffSendStatus(entry, "failed");
        startSendCycle();
      }
      return;
    }
    if (State.sendReadyStreak < 1) {
      State.sendReadyStreak += 1;
      scheduleSendRetry();
      return;
    }
    State.sendQueue.shift();
    try {
      State.input.text = entry.message;
      $.DispatchEvent("CitadelChatInputSubmitted", State.input);
      State.input.text = "";
      $.DispatchEvent("CitadelChatInputBlur", State.input);
      $.DispatchEvent("DropInputFocus", State.input);
      $.Msg(LOG_PREFIX + " submitted requested chat: " + entry.message);
      dispatchBluffSendStatus(entry, "submitted");
    } catch (e) {
      $.Msg(LOG_PREFIX + " chat submit failed: " + entry.message);
      dispatchBluffSendStatus(entry, "failed");
    }
    startSendCycle();
  }

  function queueRequestedChat(message, requestId) {
    const entry = normalizeQueueEntry(message, requestId);
    State.sendQueue.push(entry);
    if (getCommandFamilyMatch(entry.message) && getCommandFamilyMatch(entry.message).family === BLUFF_FAMILY) {
      extendBluffFastPoll();
    }
    startSendCycle();
  }

  function handleClientOutput(payload) {
    try {
      if (typeof payload !== "string" || !payload) return;
      const event = JSON.parse(payload);
      if (!event || !event.event) return;
      if (event.event === BridgeContract.readyRequestEvent) mutateReadySeats("snapshot", null, "request");
      if (event.event === BridgeContract.readyClearRequestEvent) mutateReadySeats("clear", null, event.reason || "request");
      if (event.event === BridgeContract.chatSnapshotRequestEvent) ChatBridgeIntake.handleSnapshotRequest("request");
      if (event.event === BridgeContract.bluffDeckFastPollRequestEvent) acceptBluffFastPollUntil(event.until);
      if (event.event === BridgeContract.chatSendRequestEvent && typeof event.message === "string" && event.message) {
        queueRequestedChat(event.message, event.requestId);
      }
      if (event.event === BridgeContract.bluffDeckSendCancelRequestEvent && typeof event.requestId === "string") {
        cancelBluffQueue(event.requestId);
      }
    } catch (e) {}
  }
  function readChatMessage(messagePanel) {
    const source = findChild(messagePanel, MESSAGE_SOURCE_ID);
    const contents = findChild(messagePanel, MESSAGE_CONTENTS_ID);
    const senderPanel = findClass(source, "SenderName") || findClass(messagePanel, "SenderName");
    const channelPanel = findClass(source, "ChannelName") || findClass(messagePanel, "ChannelName");
    const rawSender = safeText(senderPanel) || EMPTY_NAME;
    const channel = safeText(channelPanel);
    LABEL_TEXT_BUFFER.length = 0;
    collectLabelTextInto(contents, LABEL_TEXT_BUFFER);
    const message = LABEL_TEXT_BUFFER.join(" ").replace(/\s+/g, " ").trim();
    const isSelf = hasClass(messagePanel, "IsSelf");
    let sender = rawSender;
    if (isSelf && isUnknownSender(sender) && !isBluffDeckMessage(message)) {
      const config = getConfig();
      const rememberedName = String(config[LOCAL_PLAYER_NAME_KEY] || "").replace(/\s+/g, " ").trim();
      if (shouldAcceptReadySender(rememberedName)) sender = rememberedName;
    }
    if (!message) return null;
    return { sender: sender, channel: channel, message: message, isSelf: isSelf };
  }
  function setPendingRow(messagePanel, pending) {
    const rows = State.pendingRows || (State.pendingRows = []);
    const index = rows.indexOf(messagePanel);
    if (pending && isValid(messagePanel) && !messagePanel[LOGGED_FLAG]) {
      if (index < 0) rows.push(messagePanel);
    } else if (index >= 0) {
      rows.splice(index, 1);
    }
  }

  function resetScanProgress() {
    State.scannedCount = 0; State.pendingRows = [];
  }

  function getChatRowDecision(record, messagePanel) {
    const message = record && record.message;
    const match = getCommandFamilyMatch(message);
    const commandName = match && match.name ? match.name : "";
    const readyLike = !!(record && isReadyChatMessage(message, match));
    const leaveReadySeat = commandName === "party-leave" || commandName === "bd1-leave";
    let status = record ? "consumed" : "ignored";
    let waiting = false;
    const unknownBluff = !!(match && match.family === BLUFF_FAMILY);
    const unknownSender = !!(record && isUnknownSender(record.sender));
    const shouldDelayUnknown = !!(record && unknownSender && (readyLike || match) && (!record.isSelf || unknownBluff));
    if (shouldDelayUnknown && !(match && match.unknownSenderDelay === "none")) {
      const retries = (messagePanel[UNKNOWN_RETRY_FLAG] || 0) + 1;
      messagePanel[UNKNOWN_RETRY_FLAG] = retries;
      if (retries <= UNKNOWN_SENDER_MAX_DELAYS || (match && match.unknownSenderDelay === "always")) {
        status = "delayed";
      }
      if (match && match.unknownSenderDelay === "always" && retries > UNKNOWN_SENDER_MAX_DELAYS) {
        messagePanel[UNKNOWN_WAITING_FLAG] = true;
        waiting = true;
      }
    }
    return { status, waiting, match, commandName, readyLike, leaveReadySeat };
  }
  function consumeChatRow(messagePanel) {
    if (!isValid(messagePanel)) return { status: "ignored" };
    const record = readChatMessage(messagePanel);
    const contentSignature = record
      ? [record.channel || "", record.message || "", record.isSelf ? "1" : "0"].join("\n")
      : "";
    const rowSignature = record ? [record.sender || "", contentSignature].join("\n") : "";
    const previousSignature = messagePanel[ROW_SIGNATURE_FLAG] || "";
    const previousContentSignature = messagePanel[ROW_CONTENT_SIGNATURE_FLAG] || "";
    if (messagePanel[LOGGED_FLAG]) {
      if (previousSignature === rowSignature) return { status: "ignored" };
      if (previousContentSignature === contentSignature && previousSignature.indexOf(EMPTY_NAME + "\n") === 0) {
        const stabilizedFamily = record && getCommandFamilyMatch(record.message);
        if (!(stabilizedFamily && stabilizedFamily.name === "party-leader" && !isUnknownSender(record.sender))) {
          messagePanel[ROW_SIGNATURE_FLAG] = rowSignature;
          return { status: "ignored" };
        }
      }
    }
    if (previousSignature !== rowSignature) {
      messagePanel[LOGGED_FLAG] = false;
      messagePanel[UNKNOWN_RETRY_FLAG] = 0;
      messagePanel[UNKNOWN_WAITING_FLAG] = false;
    }
    messagePanel[ROW_SIGNATURE_FLAG] = rowSignature;
    messagePanel[ROW_CONTENT_SIGNATURE_FLAG] = contentSignature;
    const decision = getChatRowDecision(record, messagePanel);
    setPendingRow(messagePanel, decision.status === "delayed");
    if (decision.status !== "consumed") return { status: decision.status, waiting: decision.waiting };
    if (decision.match && decision.match.family === BLUFF_FAMILY) extendBluffFastPoll();
    messagePanel[LOGGED_FLAG] = true;
    setPendingRow(messagePanel, false);
    const channel = record.channel ? record.channel + " " : "";
    try {
      $.Msg(LOG_PREFIX + " chat " + channel + record.sender + ": " + record.message);
    } catch (e) {}
    const config = getConfig();
    const messages = getChatMessages();
    config[CHAT_SEQ_KEY] = (config[CHAT_SEQ_KEY] || 0) + 1;
    const entry = {
      seq: config[CHAT_SEQ_KEY],
      sender: record.sender || EMPTY_NAME,
      channel: record.channel || "",
      message: record.message || "",
      isSelf: !!record.isSelf,
    };
    messages.push(entry);
    while (messages.length > 120) messages.shift();
    dispatchChatEvent({
      event: CHAT_EVENT,
      seq: entry.seq,
      sender: entry.sender,
      channel: entry.channel,
      message: entry.message,
      isSelf: entry.isSelf,
    });
    const readyMutation = mutateReadySeats(
      decision.readyLike ? "ready" : decision.leaveReadySeat ? "leave" : "",
      record,
    );
    return { status: "consumed", record: record, readyChanged: readyMutation.readyChanged, action: readyMutation.action };
  }
  const ChatBridgeIntake = {
    consumeRow: consumeChatRow,
    scanOnce: scanChatMessagesOnce,
    handleSnapshotRequest: handleChatSnapshotRequest,
  };

  function resolveChatMessages() {
    const context = $.GetContextPanel();
    let root = context;
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    const chat = isValid(State.chat) ? State.chat : findChild(root, CHAT_ROOT_ID);
    State.chat = isValid(chat) ? chat : null;

    const messages =
      findChild(State.chat, CHAT_MESSAGES_ID) ||
      findChild(context, CHAT_MESSAGES_ID) ||
      findChild(root, CHAT_MESSAGES_ID);
    const resolved = isValid(messages) ? messages : null;
    if (resolved !== State.messages) {
      State.messages = resolved;
      resetScanProgress();
    }

    if (State.messages && !State.bootLogged) {
      State.bootLogged = true;
      try {
        $.Msg(LOG_PREFIX + " loaded; watching ChatMessages for sender/content debug output");
      } catch (e) {}
    }

    return State.messages;
  }

  function scanChatMessagesOnce() {
    PokerMetrics.increment("chatScan");
    const messages = resolveChatMessages();
    if (!isValid(messages)) {
      State.messages = null;
      resetScanProgress();
      return false;
    }

    const count = childCount(messages);
    if (count < State.scannedCount) resetScanProgress();
    let visited = 0;
    let pollFast = false;
    const visitedRows = [];
    function consumeTrackedRow(messagePanel) {
      if (!isValid(messagePanel) || visitedRows.indexOf(messagePanel) >= 0) return;
      visitedRows.push(messagePanel);
      visited += 1;
      const result = ChatBridgeIntake.consumeRow(messagePanel);
      if (result && result.status === "consumed") PokerMetrics.increment("chatRowsConsumed");
      if (result && result.status === "delayed") PokerMetrics.increment("chatRowsDelayed");
      if (result && (result.status === "consumed" || (result.status === "delayed" && !result.waiting))) pollFast = true;
    }
    function consumeRange(start, end) {
      for (let i = Math.max(0, start); i < end; i += 1) consumeTrackedRow(childAt(messages, i));
    }

    const pending = (State.pendingRows || []).slice();
    State.pendingRows = [];
    for (let i = 0; i < pending.length; i += 1) consumeTrackedRow(pending[i]);

    const start = State.scannedCount;
    if (start === 0 && count > BOOTSTRAP_TAIL_SCAN_LIMIT) {
      consumeRange(Math.max(0, count - BOOTSTRAP_TAIL_SCAN_LIMIT), count);
      State.scannedCount = count;
    } else {
      State.scannedCount = count;
      consumeRange(start, count);
    }

    const tailStart = Math.max(0, count - LOW_LATENCY_TAIL_SCAN_LIMIT);
    consumeRange(tailStart, count);

    PokerMetrics.increment("chatRowsVisited", visited);
    return pollFast;
  }

  function scanChatMessages() {
    const pollFast = ChatBridgeIntake.scanOnce();
    const config = getConfig();
    const forcedFast = Date.now() < Number(config.TableGameFastPollUntil || 0);
    $.Schedule(pollFast || forcedFast ? FAST_POLL_SECONDS : SLOW_POLL_SECONDS, scanChatMessages);
  }

  try {
    globalThis.__PokerChatDebugTestHooks = {
      handleClientOutput: handleClientOutput,
      getChatMessages: getChatMessages,
      scanChatMessages: scanChatMessages,
      modules: { BridgeContract, ChatBridgeIntake, PokerMetrics },
    };
  } catch (e) {}

  try {
    $.RegisterForUnhandledEvent(CLIENT_OUTPUT_EVENT, handleClientOutput);
  } catch (e) {}
  try {
    if (!globalThis.__PokerTestMode) scanChatMessages();
  } catch (e) {
    scanChatMessages();
  }
})();
