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
  const READY_EVENT = BridgeContract.readyEvent;
  const READY_REQUEST_EVENT = BridgeContract.readyRequestEvent;
  const READY_CLEAR_REQUEST_EVENT = BridgeContract.readyClearRequestEvent;
  const CHAT_EVENT = BridgeContract.chatEvent;
  const CHAT_SNAPSHOT_REQUEST_EVENT = BridgeContract.chatSnapshotRequestEvent;
  const CLIENT_OUTPUT_EVENT = BridgeContract.clientOutputEvent;
  const READY_SEATS_KEY = BridgeContract.keys.readySeats;
  const READY_REVISION_KEY = BridgeContract.keys.readyRevision;
  const CHAT_MESSAGES_KEY = BridgeContract.keys.chatMessages;
  const CHAT_SEQ_KEY = BridgeContract.keys.chatSequence;
  const READY_LAST_EVENT_KEY = BridgeContract.keys.readyLastEvent;
  const LOCAL_PLAYER_KEY = BridgeContract.keys.localPlayerKey;
  const LOCAL_PLAYER_NAME_KEY = BridgeContract.keys.localPlayerName;
  const PENDING_SELF_ACTION_KEY = BridgeContract.keys.pendingSelfAction;
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

  function getRoot(panel) {
    let cursor = panel;
    while (cursor && cursor.GetParent && cursor.GetParent()) {
      cursor = cursor.GetParent();
    }
    return cursor || panel;
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

  function findPanelWithClassTraverse(root, className) {
    if (!isValid(root) || typeof root.FindChildrenWithClassTraverse !== "function") return null;
    try {
      const matches = root.FindChildrenWithClassTraverse(className);
      if (matches && matches.length) {
        for (let i = 0; i < matches.length; i += 1) {
          if (isValid(matches[i])) return matches[i];
        }
      }
    } catch (e) {}
    return null;
  }

  function findFirstClass(root, className) {
    return (
      findPanelWithClassTraverse(root, className) ||
      findPanelByClass(root, className)
    );
  }

  function findPanelByClass(root, className) {
    if (!isValid(root)) return null;
    if (hasClass(root, className)) return root;

    const count = childCount(root);
    for (let i = 0; i < count; i += 1) {
      const found = findPanelByClass(childAt(root, i), className);
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

  function collectLabelText(root) {
    LABEL_TEXT_BUFFER.length = 0;
    collectLabelTextInto(root, LABEL_TEXT_BUFFER);
    return LABEL_TEXT_BUFFER.join(" ").replace(/\s+/g, " ").trim();
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

  function rememberLocalPlayer(sender) {
    if (!shouldAcceptReadySender(sender)) return;
    const config = getConfig();
    config[LOCAL_PLAYER_KEY] = normalizePlayerKey(sender);
    config[LOCAL_PLAYER_NAME_KEY] = sender;
  }

  function getRememberedLocalPlayerName() {
    const config = getConfig();
    const name = String(config[LOCAL_PLAYER_NAME_KEY] || "").replace(/\s+/g, " ").trim();
    return shouldAcceptReadySender(name) ? name : "";
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

  function getChatMessages() {
    const config = getConfig();
    config[CHAT_MESSAGES_KEY] = config[CHAT_MESSAGES_KEY] || [];
    if (typeof config[CHAT_SEQ_KEY] !== "number") config[CHAT_SEQ_KEY] = 0;
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


  function dispatchReadyEvent(payload) {
    const config = getConfig();
    const seats = getReadySeatArray();
    payload.seats = payload.seats || seats;
    payload.count = seats.length;
    payload.revision = config[READY_REVISION_KEY] || 0;
    const json = JSON.stringify(payload);
    config[READY_LAST_EVENT_KEY] = json;
    try {
      $.DispatchEvent(CLIENT_OUTPUT_EVENT, json);
    } catch (e) {}
  }

  function dispatchReadySnapshot(reason) {
    dispatchReadyEvent({
      event: READY_EVENT,
      action: "snapshot",
      reason: reason || "",
    });
  }

  function clearReadySeats(reason) {
    const config = getConfig();
    config[READY_SEATS_KEY] = {};
    config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
    dispatchReadyEvent({
      event: READY_EVENT,
      action: "clear",
      reason: reason || "",
      seats: [],
    });
    try {
      $.Msg(LOG_PREFIX + " ready seats cleared" + (reason ? " (" + reason + ")" : ""));
    } catch (e) {}
    return true;
  }

  function handleClientOutput(payload) {
    try {
      if (typeof payload !== "string" || !payload) return;
      const event = JSON.parse(payload);
      if (!event || !event.event) return;
      if (event.event === READY_REQUEST_EVENT) dispatchReadySnapshot("request");
      if (event.event === READY_CLEAR_REQUEST_EVENT) clearReadySeats(event.reason || "request");
      if (event.event === CHAT_SNAPSHOT_REQUEST_EVENT) dispatchChatSnapshot("request");
    } catch (e) {}
  }

  function forgetReadySeat(record) {
    if (!record || !isPartyLeaveMessage(record.message) || !shouldAcceptReadySender(record.sender)) return false;
    const key = normalizePlayerKey(record.sender);
    const seats = getReadySeats();
    if (!seats[key]) return false;
    delete seats[key];
    const config = getConfig();
    config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
    dispatchReadyEvent({
      event: READY_EVENT,
      action: "leave",
      key: key,
      name: record.sender,
      seats: getReadySeatArray(),
    });
    try {
      $.Msg(LOG_PREFIX + " ready " + record.sender + " removed (" + Object.keys(seats).length + ")");
    } catch (e) {}
    return true;
  }

  function markPlayerReady(record) {
    if (!record || !isReadyChatMessage(record.message) || !shouldAcceptReadySender(record.sender)) return false;

    const key = normalizePlayerKey(record.sender);
    const now = Date.now ? Date.now() : 0;
    const seats = getReadySeats();
    const config = getConfig();
    const previous = seats[key];

    seats[key] = {
      key: key,
      name: record.sender,
      channel: record.channel || "",
      message: record.message || "",
      readyAt: now,
    };
    config[READY_REVISION_KEY] = (config[READY_REVISION_KEY] || 0) + 1;
    if (record.isSelf) rememberLocalPlayer(record.sender);

    dispatchReadyEvent({
      event: READY_EVENT,
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
    return true;
  }

  function readChatMessage(messagePanel) {
    const source = findChild(messagePanel, MESSAGE_SOURCE_ID);
    const contents = findChild(messagePanel, MESSAGE_CONTENTS_ID);
    const senderPanel =
      findFirstClass(source, "SenderName") ||
      findFirstClass(messagePanel, "SenderName");
    const channelPanel =
      findFirstClass(source, "ChannelName") ||
      findFirstClass(messagePanel, "ChannelName");
    const rawSender = safeText(senderPanel) || EMPTY_NAME;
    const channel = safeText(channelPanel);
    const message = collectLabelText(contents);
    const isSelf = hasClass(messagePanel, "IsSelf");
    let sender = rawSender;

    if (isSelf && isUnknownSender(sender)) {
      const rememberedName = getRememberedLocalPlayerName();
      if (rememberedName) sender = rememberedName;
    }

    if (!message) return null;

    return {
      sender: sender,
      channel: channel,
      message: message,
      isSelf: isSelf,
    };
  }

  function findTrustedPartyLeaderFallbackSender() {
    const messages = getChatMessages();
    let recentLeaveSender = "";
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const entry = messages[i];
      if (!entry || isUnknownSender(entry.sender)) continue;
      if (!recentLeaveSender && isPartyLeaveMessage(entry.message)) {
        recentLeaveSender = entry.sender;
        continue;
      }
      if (isPartyLeaderMessage(entry.message)) {
        if (!recentLeaveSender || normalizePlayerKey(entry.sender) === normalizePlayerKey(recentLeaveSender)) return entry.sender;
        return "";
      }
    }
    return "";
  }

  function resolveDelayedUnknownPartyLeader(record, messagePanel) {
    if (!record || record.isSelf || !messagePanel) return record;
    if (!isUnknownSender(record.sender) || !isPartyLeaderMessage(record.message)) return record;
    if ((messagePanel[UNKNOWN_RETRY_FLAG] || 0) <= UNKNOWN_SENDER_MAX_DELAYS) return record;
    const trustedSender = findTrustedPartyLeaderFallbackSender();
    if (!trustedSender) return record;
    return {
      sender: trustedSender,
      channel: record.channel,
      message: record.message,
      isSelf: false,
    };
  }

  function shouldDelayUnknownSender(record, messagePanel) {
    if (!record || record.isSelf || !isUnknownSender(record.sender)) return false;
    if (!isPokerBridgeMessage(record.message)) return false;
    if (!messagePanel) return true;
    messagePanel[UNKNOWN_RETRY_FLAG] = ((messagePanel[UNKNOWN_RETRY_FLAG] || 0) + 1);
    if (isPartyAuthorityMessage(record.message) || isResumeLeaderMessage(record.message) || isResumeReadyMessage(record.message)) return true;
    if (isShortResumeStartMessage(record.message)) return messagePanel[UNKNOWN_RETRY_FLAG] <= UNKNOWN_SENDER_MAX_DELAYS;
    if (isResumeStartMessage(record.message)) return true;
    return messagePanel[UNKNOWN_RETRY_FLAG] <= UNKNOWN_SENDER_MAX_DELAYS;
  }

  function classifyChatRow(record, messagePanel) {
    const message = record && record.message;
    let authority = "none";
    if (isPartyAuthorityMessage(message)) authority = "party";
    else if (isResumeLeaderMessage(message) || isResumeReadyMessage(message)) authority = "resume";
    else if (isResumeStartMessage(message)) authority = "start";
    else if (isProgressOfferMessage(message) || isProgressChunkMessage(message)) authority = "progress";
    else if (isPokerBridgeMessage(message) && !isReadyChatMessage(message)) authority = "action";

    const delayUnknown = shouldDelayUnknownSender(record, messagePanel);
    return {
      status: record ? (delayUnknown ? "delayed" : "consumed") : "ignored",
      delayUnknown: delayUnknown,
      authority: authority,
      readyLike: !!(record && isReadyChatMessage(record.message)),
    };
  }

  function consumeChatRow(messagePanel) {
    if (!isValid(messagePanel) || messagePanel[LOGGED_FLAG]) return { status: "ignored" };

    let record = readChatMessage(messagePanel);
    let decision = classifyChatRow(record, messagePanel);
    if (decision.status === "delayed") {
      const resolved = resolveDelayedUnknownPartyLeader(record, messagePanel);
      if (resolved !== record) {
        record = resolved;
        decision = classifyChatRow(record, null);
      }
    }
    if (decision.status !== "consumed") return { status: decision.status };

    messagePanel[LOGGED_FLAG] = true;
    logChatMessage(record);
    appendChatRecord(record);
    const readyChanged = markPlayerReady(record);
    if (!readyChanged) forgetReadySeat(record);
    return { status: "consumed", record: record, readyChanged: readyChanged };
  }

  const ChatBridgeIntake = {
    readRecord: readChatMessage,
    shouldDelayUnknownSender: shouldDelayUnknownSender,
    consumeRow: consumeChatRow,
    scan: scanChatMessages,
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
    const root = getRoot(context);
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
        isPartyLeaderMessage: isPartyLeaderMessage,
        isPartyJoinMessage: isPartyJoinMessage,
        isPartyLeaveMessage: isPartyLeaveMessage,
        isResumeLeaderMessage: isResumeLeaderMessage,
        isResumeReadyMessage: isResumeReadyMessage,
        isResumeStartMessage: isResumeStartMessage,
        normalizeMessage: normalizeMessage,
        normalizePlayerKey: normalizePlayerKey,
        markPlayerReady: markPlayerReady,
        forgetReadySeat: forgetReadySeat,
        clearReadySeats: clearReadySeats,
        getReadySeats: getReadySeats,
        getReadySeatArray: getReadySeatArray,
        handleClientOutput: handleClientOutput,
        getChatMessages: getChatMessages,
        appendChatRecord: appendChatRecord,
        readChatMessage: readChatMessage,
        shouldDelayUnknownSender: shouldDelayUnknownSender,
        scanChatMessages: scanChatMessages,
        localPlayerKeys: {
          key: LOCAL_PLAYER_KEY,
          name: LOCAL_PLAYER_NAME_KEY,
          pending: PENDING_SELF_ACTION_KEY,
        },
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
