(() => {
  "use strict";

  const LOG_PREFIX = "[PokerDebug]";
  const CHAT_ROOT_ID = "Chat";
  const CHAT_MESSAGES_ID = "ChatMessages";
  const MESSAGE_SOURCE_ID = "MessageSource";
  const MESSAGE_CONTENTS_ID = "MessageContents";
  const LOGGED_FLAG = "__pokerDebugLogged";
  const UNKNOWN_RETRY_FLAG = "__pokerDebugUnknownRetries";
  const FAST_POLL_SECONDS = 0.1;
  const SLOW_POLL_SECONDS = 0.5;
  const EMPTY_NAME = "<unknown>";
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
  const CHAT_EVENT = BridgeContract.chatEvent;
  const CLIENT_OUTPUT_EVENT = BridgeContract.clientOutputEvent;
  const READY_SEATS_KEY = BridgeContract.keys.readySeats;
  const READY_REVISION_KEY = BridgeContract.keys.readyRevision;
  const CHAT_MESSAGES_KEY = BridgeContract.keys.chatMessages;
  const CHAT_SEQ_KEY = BridgeContract.keys.chatSequence;
  const LOCAL_PLAYER_NAME_KEY = BridgeContract.keys.localPlayerName;
  const UNKNOWN_SENDER_MAX_DELAYS = 6;

  const LABEL_TEXT_BUFFER = [];

  const State = {
    chat: null,
    messages: null,
    bootLogged: false,
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

  function getReadySeats() {
    const config = getConfig();
    config[READY_SEATS_KEY] = config[READY_SEATS_KEY] || {};
    if (typeof config[READY_REVISION_KEY] !== "number") config[READY_REVISION_KEY] = 0;
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

  function isPartyLeaderMessage(text) {
    return normalizeMessage(text).indexOf("party leader poker party ") === 0;
  }

  function isPartyJoinMessage(text) {
    return normalizeMessage(text).indexOf("party join poker party ") === 0;
  }

  function isPartyLeaveMessage(text) {
    return normalizeMessage(text).indexOf("party leave poker party ") === 0;
  }

  function isResumeLeaderMessage(text) {
    return normalizeMessage(text).indexOf("resume leader poker resume ") === 0;
  }

  function isResumeReadyMessage(text) {
    return normalizeMessage(text).indexOf("resume ready poker resume ") === 0;
  }

  function isResumeStartMessage(text) {
    return normalizeMessage(text).indexOf("poker resume ") === 0;
  }

  function isShortResumeStartMessage(text) {
    const normalized = normalizeMessage(text);
    return normalized.indexOf("poker resume ") === 0 && normalized.indexOf(" roster ") < 0;
  }

  function isProgressOfferMessage(text) {
    return normalizeMessage(text).indexOf("progress offer poker progress ") === 0;
  }

  function isProgressChunkMessage(text) {
    return normalizeMessage(text).indexOf("progress chunk poker progress ") === 0;
  }

  function isReadyChatMessage(text) {
    const normalized = normalizeMessage(text);
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
      isPartyLeaderMessage(text) ||
      isPartyJoinMessage(text)
    );
  }

  function isPokerBridgeMessage(text) {
    const normalized = normalizeMessage(text);
    return isReadyChatMessage(text) ||
      isPartyLeaderMessage(text) ||
      isPartyJoinMessage(text) ||
      isPartyLeaveMessage(text) ||
      isResumeLeaderMessage(text) ||
      isResumeReadyMessage(text) ||
      isResumeStartMessage(text) ||
      isProgressOfferMessage(text) ||
      isProgressChunkMessage(text) ||
      normalized === "check" ||
      normalized === "call" ||
      normalized === "fold" ||
      normalized === "all in" ||
      normalized === "allin" ||
      normalized.indexOf("bet ") === 0 ||
      normalized.indexOf("raise ") === 0 ||
      normalized.indexOf("poker start") === 0 ||
      normalized.indexOf("start poker") === 0;
  }

  function isPartyAuthorityMessage(text) {
    return isPartyLeaderMessage(text) ||
      isPartyJoinMessage(text) ||
      isPartyLeaveMessage(text);
  }

  function isResumeAuthorityMessage(text) {
    return isResumeLeaderMessage(text) ||
      isResumeReadyMessage(text) ||
      isResumeStartMessage(text);
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

  function appendChatRecord(record) {
    if (!record || !record.message) return null;
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
    return entry;
  }

  function dispatchChatSnapshot(reason) {
    const config = getConfig();
    dispatchChatEvent({
      event: CHAT_EVENT,
      action: "snapshot",
      reason: reason || "",
      seq: config[CHAT_SEQ_KEY] || 0,
      messages: getChatMessages(),
    });
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
        $.DispatchEvent(CLIENT_OUTPUT_EVENT, json);
      } catch (e) {}
    };

    if (action === "snapshot") {
      PokerMetrics.increment("readySnapshotDispatch");
      emit({
        event: BridgeContract.readyEvent,
        action: "snapshot",
        reason: reason || "",
      });
      return { readyChanged: false, action: "snapshot" };
    }

    if (action === "clear") {
      config[READY_SEATS_KEY] = {};
      config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
      emit({
        event: BridgeContract.readyEvent,
        action: "clear",
        reason: reason || "",
        seats: [],
      });
      try {
        $.Msg(LOG_PREFIX + " ready seats cleared" + (reason ? " (" + reason + ")" : ""));
      } catch (e) {}
      return { readyChanged: true, action: "clear" };
    }

    if (!record || !shouldAcceptReadySender(record.sender)) return { readyChanged: false, action: "" };
    const key = normalizePlayerKey(record.sender);
    const seats = getReadySeats();

    if (action === "ready") {
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

    if (action === "leave") {
      if (!seats[key]) return { readyChanged: false, action: "" };
      delete seats[key];
      config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
      emit({
        event: BridgeContract.readyEvent,
        action: "leave",
        key: key,
        name: record.sender,
      });
      try {
        $.Msg(LOG_PREFIX + " ready " + record.sender + " removed (" + Object.keys(seats).length + ")");
      } catch (e) {}
      return { readyChanged: true, action: "leave" };
    }

    return { readyChanged: false, action: "" };
  }

  function handleChatSnapshotRequest(reason) {
    PokerMetrics.increment("chatSnapshotRequest");
    ChatBridgeIntake.scanOnce();
    dispatchChatSnapshot(reason || "request");
    PokerMetrics.increment("chatSnapshotDispatch");
  }

  function handleClientOutput(payload) {
    try {
      if (typeof payload !== "string" || !payload) return;
      const event = JSON.parse(payload);
      if (!event || !event.event) return;
      if (event.event === BridgeContract.readyRequestEvent) mutateReadySeats("snapshot", null, "request");
      if (event.event === BridgeContract.readyClearRequestEvent) mutateReadySeats("clear", null, event.reason || "request");
      if (event.event === BridgeContract.chatSnapshotRequestEvent) ChatBridgeIntake.handleSnapshotRequest("request");
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

    if (isSelf && isUnknownSender(sender)) {
      const config = getConfig();
      const rememberedName = String(config[LOCAL_PLAYER_NAME_KEY] || "").replace(/\s+/g, " ").trim();
      if (shouldAcceptReadySender(rememberedName)) sender = rememberedName;
    }

    if (!message) return null;

    return {
      sender: sender,
      channel: channel,
      message: message,
      isSelf: isSelf,
    };
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

  function getChatRowDecision(record, messagePanel) {
    const message = record && record.message;
    const match = getCommandFamilyMatch(message);
    const commandName = match && match.name ? match.name : "";
    const readyLike = !!(record && isReadyChatMessage(message, match));
    const leaveReadySeat = commandName === "party-leave";
    let status = record ? "consumed" : "ignored";
    let waiting = false;

    if (record && !record.isSelf && isUnknownSender(record.sender) && (readyLike || match)) {
      if (!messagePanel) {
        status = "delayed";
      } else {
        const retries = (messagePanel[UNKNOWN_RETRY_FLAG] || 0) + 1;
        messagePanel[UNKNOWN_RETRY_FLAG] = retries;
        if (match && match.unknownSenderDelay === "always") {
          if (retries > UNKNOWN_SENDER_MAX_DELAYS) {
            messagePanel[UNKNOWN_WAITING_FLAG] = true;
            waiting = true;
            status = "delayed";
          } else {
            status = "delayed";
          }
        } else if (retries <= UNKNOWN_SENDER_MAX_DELAYS) {
          status = "delayed";
        }
      }
    }

    return {
      status: status,
      waiting: waiting,
      match: match,
      commandName: commandName,
      readyLike: readyLike,
      leaveReadySeat: leaveReadySeat,
    };
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
        messagePanel[ROW_SIGNATURE_FLAG] = rowSignature;
        return { status: "ignored" };
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
    messagePanel[LOGGED_FLAG] = true;
    setPendingRow(messagePanel, false);
    logChatMessage(record);
    appendChatRecord(record);
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


  function logChatMessage(record) {
    const channel = record.channel ? record.channel + " " : "";
    try {
      $.Msg(LOG_PREFIX + " chat " + channel + record.sender + ": " + record.message);
    } catch (e) {}
  }

  function resolveChatMessages() {
    if (isValid(State.messages)) return State.messages;

    const context = $.GetContextPanel();
    let root = context;
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    const chat = isValid(State.chat) ? State.chat : findChild(root, CHAT_ROOT_ID);
    State.chat = isValid(chat) ? chat : null;

    const messages =
      findChild(State.chat, CHAT_MESSAGES_ID) ||
      findChild(context, CHAT_MESSAGES_ID) ||
      findChild(root, CHAT_MESSAGES_ID);
    State.messages = isValid(messages) ? messages : null;

    if (State.messages && !State.bootLogged) {
      State.bootLogged = true;
      try {
        $.Msg(LOG_PREFIX + " loaded; watching ChatMessages for sender/content debug output");
      } catch (e) {}
    }

    return State.messages;
  }

  function scanChatMessages() {
    const messages = resolveChatMessages();
    if (!isValid(messages)) {
      State.messages = null;
      $.Schedule(SLOW_POLL_SECONDS, scanChatMessages);
      return;
    }

    const count = childCount(messages);
    let pollFast = false;
    for (let i = 0; i < count; i += 1) {
      const messagePanel = childAt(messages, i);
      const result = ChatBridgeIntake.consumeRow(messagePanel);
      if (result && (result.status === "consumed" || result.status === "delayed")) pollFast = true;
    }

    $.Schedule(pollFast ? FAST_POLL_SECONDS : SLOW_POLL_SECONDS, scanChatMessages);
  }

  function exportTestHooks() {
    try {
      globalThis.__PokerChatDebugTestHooks = {
        isReadyChatMessage: isReadyChatMessage,
        markPlayerReady: (record) =>
          mutateReadySeats(isReadyChatMessage(record && record.message) ? "ready" : "", record).readyChanged,
        handleClientOutput: handleClientOutput,
        getChatMessages: getChatMessages,
        scanChatMessages: scanChatMessages,
        PokerMetrics: PokerMetrics,
        modules: {
          BridgeContract: BridgeContract,
          ChatBridgeIntake: ChatBridgeIntake,
        },
      };
    } catch (e) {}
  }

  exportTestHooks();
  try {
    $.RegisterForUnhandledEvent(CLIENT_OUTPUT_EVENT, handleClientOutput);
  } catch (e) {}


  try {
    if (!globalThis.__PokerTestMode) scanChatMessages();
  } catch (e) {
    scanChatMessages();
  }
})();
