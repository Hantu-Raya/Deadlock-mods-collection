#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CHAT_SCRIPT = path.join(ROOT, 'panorama', 'scripts', 'poker_chat_debug.js');
const MENU_SCRIPT = path.join(ROOT, 'panorama', 'scripts', 'poker_escape_menu.js');
const failures = [];

function relative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function readScript(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`cannot read ${relative(filePath)}: ${error.message}`);
    return '';
  }
}

function runScript(context, filePath) {
  const source = readScript(filePath);
  if (!source) return;

  try {
    vm.runInContext(source, context, { filename: relative(filePath) });
  } catch (error) {
    fail(`cannot load ${relative(filePath)}: ${error.stack || error.message}`);
  }
}

function createPanelFactory() {
  const panelsById = Object.create(null);

  function addClasses(panel, classNames) {
    for (const className of String(classNames || '').split(/\s+/)) {
      if (className) panel.classes[className] = true;
    }
  }

  function createPanel(type, parent, id, classNames, text) {
    const panel = {
      id: id || '',
      type,
      parent: parent || null,
      children: [],
      classes: Object.create(null),
      text: text || '',
      deleted: false,
      IsValid() {
        return !this.deleted;
      },
      GetParent() {
        return this.parent;
      },
      GetChildCount() {
        return this.children.length;
      },
      GetChild(index) {
        return this.children[index] || null;
      },
      BHasClass(className) {
        return !!this.classes[className];
      },
      FindChildTraverse(searchId) {
        if (this.id === searchId) return this;
        for (const child of this.children) {
          const found = child.FindChildTraverse(searchId);
          if (found) return found;
        }
        return panelsById[searchId] || null;
      },
      FindChildrenWithClassTraverse(className) {
        const matches = [];
        if (this.BHasClass(className)) matches.push(this);
        for (const child of this.children) {
          matches.push(...child.FindChildrenWithClassTraverse(className));
        }
        return matches;
      },
    };

    addClasses(panel, classNames);
    if (parent) parent.children.push(panel);
    if (id) panelsById[id] = panel;
    return panel;
  }

  const root = createPanel('Panel', null, 'PokerReadyValidatorRoot');
  const chat = createPanel('Panel', root, 'Chat');
  const messages = createPanel('Panel', chat, 'ChatMessages');
  return { createPanel, root, chat, messages };
}

function createValidatorContext() {
  const config = {};
  const dispatches = [];
  const messages = [];
  const schedules = [];
  const panels = createPanelFactory();
  let now = 1000;

  function MockDate(...args) {
    return args.length > 0 ? new Date(...args) : new Date(now);
  }
  MockDate.now = () => {
    now += 1;
    return now;
  };
  MockDate.parse = Date.parse;
  MockDate.UTC = Date.UTC;
  MockDate.prototype = Date.prototype;

  const sandbox = {
    __PokerTestMode: true,
    GameUI: {
      CustomUIConfig: () => config,
    },
    Date: MockDate,
    $: {
      DispatchEvent: (name, payload) => {
        dispatches.push({ name, payload });
      },
      GetContextPanel: () => panels.root,
      Msg: (message) => {
        messages.push(String(message));
      },
      RegisterForUnhandledEvent: () => {},
      Schedule: (delay, callback) => {
        schedules.push({ delay, callback });
      },
    },
  };

  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return { sandbox, config, dispatches, messages, schedules, panels };
}

function seatKeys(config) {
  return Object.keys(config.PokerReadySeats || {}).sort();
}

function seatCount(config) {
  return seatKeys(config).length;
}

function parseDispatchPayload(dispatch) {
  try {
    return JSON.parse(dispatch.payload);
  } catch (error) {
    fail(`dispatch payload is not JSON: ${dispatch.payload}`);
    return null;
  }
}

function assertSameReadySeats(expectedConfig, actualConfig, message) {
  const expectedKeys = seatKeys(expectedConfig);
  const actualKeys = seatKeys(actualConfig);
  assertEqual(actualKeys.join(','), expectedKeys.join(','), `${message} keys`);

  for (const key of expectedKeys) {
    const expected = expectedConfig.PokerReadySeats[key];
    const actual = actualConfig.PokerReadySeats && actualConfig.PokerReadySeats[key];
    assert(actual, `${message} should include ${key}`);
    if (!actual) continue;
    assertEqual(actual.key, expected.key, `${message} ${key} key`);
    assertEqual(actual.name, expected.name, `${message} ${key} name`);
    assertEqual(actual.channel, expected.channel, `${message} ${key} channel`);
    assertEqual(actual.message, expected.message, `${message} ${key} message`);
    assertEqual(actual.readyAt, expected.readyAt, `${message} ${key} ready timestamp`);
  }
}

function createChatRuntime() {
  const runtime = createValidatorContext();
  runScript(runtime.sandbox, CHAT_SCRIPT);
  return runtime;
}

function createMenuRuntime() {
  const runtime = createValidatorContext();
  runScript(runtime.sandbox, MENU_SCRIPT);
  return runtime;
}

function appendChatPanel(runtime, sender, channel, message, isSelf) {
  const row = runtime.panels.createPanel('Panel', runtime.panels.messages, '', isSelf ? 'IsSelf' : '');
  const source = runtime.panels.createPanel('Panel', row, 'MessageSource');
  const contents = runtime.panels.createPanel('Panel', row, 'MessageContents');
  const senderLabel = runtime.panels.createPanel('Label', source, '', 'SenderName', sender);
  runtime.panels.createPanel('Label', source, '', 'ChannelName', channel || '');
  runtime.panels.createPanel('Label', contents, '', '', message);
  return { row, senderLabel };
}

function assertReadyDispatch(dispatch, message) {
  assert(dispatch, `${message} should dispatch`);
  if (!dispatch) return null;
  assertEqual(dispatch.name, 'ClientUI_FireOutput', `${message} should use ClientUI_FireOutput`);
  const payload = parseDispatchPayload(dispatch);
  if (payload) assertEqual(payload.event, 'PokerReadySeatsChanged', `${message} should carry the ready-seat event`);
  return payload;
}


const readyPhrases = [
  'ready',
  'ready up',
  'im ready',
  'i am ready',
  'poker ready',
  'ready poker',
  'join poker',
  'poker join',
  '[party leader] poker party p123',
  '[party join] poker party p123',
];

const nonReadyPhrases = [
  'not ready',
  'unready',
  'bet - $200',
];

const runtime = createValidatorContext();
runScript(runtime.sandbox, CHAT_SCRIPT);
runScript(runtime.sandbox, MENU_SCRIPT);

const chatHooks = runtime.sandbox.__PokerChatDebugTestHooks;
const menuHooks = runtime.sandbox.__PokerEscapeMenuTestHooks;

assert(chatHooks, 'chat test hooks were not exported');
assert(menuHooks, 'escape menu test hooks were not exported');

if (chatHooks && menuHooks) {
  for (const phrase of readyPhrases) {
    assertEqual(chatHooks.isReadyChatMessage(phrase), true, `ready phrase should be accepted (${phrase})`);
  }

  for (const phrase of nonReadyPhrases) {
    assertEqual(chatHooks.isReadyChatMessage(phrase), false, `non-ready phrase should be rejected (${phrase})`);
  }

  assertEqual(typeof chatHooks.shouldDelayUnknownSender, 'function', 'chat hooks should export shouldDelayUnknownSender for bridge contract assertions');
  assertEqual(typeof chatHooks.isPartyLeaderMessage, 'function', 'chat hooks should export isPartyLeaderMessage');
  assertEqual(typeof chatHooks.isPartyJoinMessage, 'function', 'chat hooks should export isPartyJoinMessage');
  if (typeof chatHooks.shouldDelayUnknownSender === 'function') {
    assertEqual(
      chatHooks.shouldDelayUnknownSender({ sender: '<unknown>', message: '[party leader] poker party p123', isSelf: false }, {}),
      true,
      'party leader phrase should be treated as a poker bridge message while sender is unknown',
    );
    assertEqual(
      chatHooks.shouldDelayUnknownSender({ sender: '<unknown>', message: '[party join] poker party p123', isSelf: false }, {}),
      true,
      'party join phrase should be treated as a poker bridge message while sender is unknown',
    );
  }
  if (typeof chatHooks.isPartyLeaderMessage === 'function') {
    assertEqual(chatHooks.isPartyLeaderMessage('[party leader] poker party p123'), true, 'party leader helper should accept the exact leader wire phrase');
    assertEqual(chatHooks.isPartyLeaderMessage('[party join] poker party p123'), false, 'party leader helper should reject the join wire phrase');
  }
  if (typeof chatHooks.isPartyJoinMessage === 'function') {
    assertEqual(chatHooks.isPartyJoinMessage('[party join] poker party p123'), true, 'party join helper should accept the exact join wire phrase');
    assertEqual(chatHooks.isPartyJoinMessage('[party leader] poker party p123'), false, 'party join helper should reject the leader wire phrase');
  }

  assertEqual(chatHooks.markPlayerReady({ sender: 'Abrams', channel: '[All]', message: 'ready' }), true, 'first ready sender should be marked');
  assertEqual(chatHooks.markPlayerReady({ sender: 'Bebop', channel: '[Team]', message: 'join poker' }), true, 'second ready sender should be marked');
  assertEqual(chatHooks.markPlayerReady({ sender: 'Calico', channel: '[All]', message: 'i am ready' }), true, 'third ready sender should be marked');
  assertEqual(seatCount(runtime.config), 3, 'three distinct ready senders should create exactly three seats');
  assertEqual(runtime.config.PokerReadyRevision, 3, 'three accepted ready senders should bump revision three times');

  const beforeDuplicate = runtime.config.PokerReadySeats.abrams;
  assert(beforeDuplicate, 'Abrams seat should exist before duplicate update');
  assertEqual(chatHooks.markPlayerReady({ sender: '  ABRAMS  ', channel: '[Team]', message: 'poker ready' }), true, 'duplicate ready sender should still be accepted');
  assertEqual(seatCount(runtime.config), 3, 'duplicate ready sender should update its seat instead of adding a fourth');
  assertEqual(runtime.config.PokerReadySeats.abrams.message, 'poker ready', 'duplicate sender should update the stored message');
  assertEqual(runtime.config.PokerReadySeats.abrams.channel, '[Team]', 'duplicate sender should update the stored channel');
  assert(runtime.config.PokerReadySeats.abrams.readyAt > beforeDuplicate.readyAt, 'duplicate sender should refresh the ready timestamp');
  assertEqual(runtime.config.PokerReadyRevision, 4, 'duplicate ready sender should bump revision without adding a seat');

  assertEqual(chatHooks.markPlayerReady({ sender: '<unknown>', channel: '[All]', message: 'ready' }), false, 'unknown ready sender should be rejected');
  assertEqual(seatCount(runtime.config), 3, 'unknown ready sender should not add a seat');
  assertEqual(runtime.config.PokerReadyRevision, 4, 'unknown ready sender should not bump revision');

  assertEqual(runtime.dispatches.length, 4, 'accepted ready marks should dispatch once each');
  for (let i = 0; i < runtime.dispatches.length; i += 1) {
    const dispatch = runtime.dispatches[i];
    assertEqual(dispatch.name, 'ClientUI_FireOutput', `dispatch ${i + 1} should use ClientUI_FireOutput`);
    const payload = parseDispatchPayload(dispatch);
    if (payload) {
      assertEqual(payload.event, 'PokerReadySeatsChanged', `dispatch ${i + 1} should carry the ready-seat event`);
    }
  }

  const delayedActionRuntime = createChatRuntime();
  const delayedActionHooks = delayedActionRuntime.sandbox.__PokerChatDebugTestHooks;
  assert(delayedActionHooks, 'delayed unknown sender chat hooks should be exported');
  if (delayedActionHooks) {
    const delayedActionRow = appendChatPanel(delayedActionRuntime, '<unknown>', '[All]', 'bet 200', false);
    delayedActionHooks.scanChatMessages();
    assertEqual(delayedActionHooks.getChatMessages().length, 0, 'unknown non-self action-looking bet should be delayed while sender is unknown');
    assertEqual(delayedActionRuntime.dispatches.length, 0, 'unknown non-self action-looking bet should not dispatch a normal chat record while sender is unknown');

    delayedActionRow.senderLabel.text = 'Pocket';
    delayedActionHooks.scanChatMessages();
    const delayedMessages = delayedActionHooks.getChatMessages();
    assertEqual(delayedMessages.length, 1, 'unknown non-self action-looking bet should process after the sender stabilizes');
    assertEqual(delayedMessages[0].sender, 'Pocket', 'delayed action-looking bet should use the stabilized sender');
    assertEqual(delayedMessages[0].message, 'bet 200', 'delayed action-looking bet should preserve the original command text');
    assertEqual(delayedActionRuntime.dispatches.length, 1, 'delayed action-looking bet should dispatch once after the sender stabilizes');

    const fallbackActionRuntime = createChatRuntime();
    const fallbackActionHooks = fallbackActionRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(fallbackActionHooks, 'fallback unknown sender action hooks should be exported');
    if (fallbackActionHooks) {
      appendChatPanel(fallbackActionRuntime, '<unknown>', '[All]', 'raise $400', false);
      fallbackActionHooks.scanChatMessages();
      assertEqual(fallbackActionHooks.getChatMessages().length, 0, 'unknown non-self raise should be delayed on the first scan while sender is unknown');
      assertEqual(fallbackActionRuntime.dispatches.length, 0, 'unknown non-self raise should not dispatch on the first scan while sender is unknown');

      fallbackActionHooks.scanChatMessages();
      assertEqual(fallbackActionHooks.getChatMessages().length, 0, 'unknown non-self raise should remain delayed on a second scan while sender is unknown');
      assertEqual(fallbackActionRuntime.dispatches.length, 0, 'unknown non-self raise should not dispatch on a second scan while sender is unknown');

      for (let i = 0; i < 8 && fallbackActionHooks.getChatMessages().length === 0; i += 1) {
        fallbackActionHooks.scanChatMessages();
      }
      const fallbackActionMessages = fallbackActionHooks.getChatMessages();
      assertEqual(fallbackActionMessages.length, 1, 'unknown non-self raise should eventually dispatch if the sender label never stabilizes');
      assertEqual(fallbackActionMessages[0].sender, '<unknown>', 'fallback unknown non-self raise should keep the unknown sender marker for menu-side resolution');
      assertEqual(fallbackActionMessages[0].message, 'raise $400', 'fallback unknown non-self raise should preserve the original command text');
      assertEqual(fallbackActionRuntime.dispatches.length, 1, 'fallback unknown non-self raise should dispatch exactly once');
      const fallbackActionPayload = parseDispatchPayload(fallbackActionRuntime.dispatches[0]);
      if (fallbackActionPayload) {
        assertEqual(fallbackActionPayload.event, 'PokerChatMessage', 'fallback unknown non-self raise dispatch should carry a bridged chat message');
        assertEqual(fallbackActionPayload.sender, '<unknown>', 'fallback unknown non-self raise dispatch should preserve the unknown sender marker');
        assertEqual(fallbackActionPayload.message, 'raise $400', 'fallback unknown non-self raise dispatch should preserve the original command text');
      }
    }


    const delayedPartyRuntime = createChatRuntime();
    const delayedPartyHooks = delayedPartyRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(delayedPartyHooks, 'delayed unknown sender party hooks should be exported');
    if (delayedPartyHooks) {
      const delayedPartyRow = appendChatPanel(delayedPartyRuntime, '<unknown>', '[Party]', '[party leader] poker party pdelay', false);
      delayedPartyHooks.scanChatMessages();
      assertEqual(delayedPartyHooks.getChatMessages().length, 0, 'unknown non-self party leader should be delayed while sender is unknown');
      assertEqual(delayedPartyRuntime.dispatches.length, 0, 'unknown non-self party leader should not dispatch a ready-seat update while sender is unknown');

      delayedPartyRow.senderLabel.text = 'HostName';
      delayedPartyHooks.scanChatMessages();
      const delayedPartyMessages = delayedPartyHooks.getChatMessages();
      assertEqual(delayedPartyMessages.length, 1, 'unknown non-self party leader should process after the sender stabilizes');
      assertEqual(delayedPartyMessages[0].sender, 'HostName', 'delayed party leader should use the stabilized sender');
      assertEqual(delayedPartyMessages[0].message, '[party leader] poker party pdelay', 'delayed party leader should preserve the original wire phrase');
      assertEqual(delayedPartyRuntime.dispatches.length, 2, 'delayed party leader should dispatch one chat message and one ready-seat update after the sender stabilizes');
      const delayedPartyEvents = delayedPartyRuntime.dispatches.map(parseDispatchPayload).filter(Boolean).map((payload) => payload.event).sort().join(',');
      assertEqual(delayedPartyEvents, 'PokerChatMessage,PokerReadySeatsChanged', 'delayed party leader should dispatch both the bridged chat record and ready-seat update');
      assertEqual(seatCount(delayedPartyRuntime.config), 1, 'delayed party leader should create one ready seat after sender stabilization');
    }
    const casualRuntime = createChatRuntime();
    const casualHooks = casualRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(casualHooks, 'casual unknown sender chat hooks should be exported');
    if (casualHooks) {
      appendChatPanel(casualRuntime, '<unknown>', '[All]', 'nice hand', false);
      casualHooks.scanChatMessages();
      const casualMessages = casualHooks.getChatMessages();
      assertEqual(casualMessages.length, 1, 'non-poker unknown chat should not be delayed forever');
      assertEqual(casualMessages[0].sender, '<unknown>', 'non-poker unknown chat should keep the unknown sender marker');
      assertEqual(casualMessages[0].message, 'nice hand', 'non-poker unknown chat should preserve the message text');
    }
  }

  assertEqual(menuHooks.isStartEligible(0), false, 'start eligibility should be false for 0 ready seats');
  assertEqual(menuHooks.isStartEligible(1), false, 'start eligibility should be false for 1 ready seat');
  assertEqual(menuHooks.isStartEligible(2), true, 'start eligibility should be true for 2 ready seats');
  assertEqual(menuHooks.isStartEligible(3), true, 'start eligibility should remain true for 3 ready seats');

  const chatBridge = createChatRuntime();
  const menuBridge = createMenuRuntime();
  const bridgeChatHooks = chatBridge.sandbox.__PokerChatDebugTestHooks;
  const bridgeMenuHooks = menuBridge.sandbox.__PokerEscapeMenuTestHooks;
  assert(bridgeChatHooks, 'separate chat test hooks were not exported');
  assert(bridgeMenuHooks, 'separate menu test hooks were not exported');
  assert(chatBridge.config !== menuBridge.config, 'separate chat and menu contexts should not share CustomUIConfig objects');

  if (bridgeChatHooks && bridgeMenuHooks) {
    assertEqual(bridgeChatHooks.markPlayerReady({ sender: 'Dynamo', channel: '[Team]', message: 'ready' }), true, 'separate chat first ready sender should be marked');
    assertEqual(bridgeChatHooks.markPlayerReady({ sender: 'Haze', channel: '[Party]', message: 'join poker' }), true, 'separate chat second ready sender should be marked');
    assertEqual(seatCount(chatBridge.config), 2, 'separate chat context should store two ready seats');
    assertEqual(seatCount(menuBridge.config), 0, 'separate menu context should start with no ready seats');

    for (const dispatch of chatBridge.dispatches) {
      bridgeMenuHooks.handleReadyEvent(dispatch.payload);
    }

    assertSameReadySeats(chatBridge.config, menuBridge.config, 'separate menu context should ingest chat ready payloads');
    assertEqual(bridgeMenuHooks.isStartEligible(seatCount(menuBridge.config)), true, 'separate menu context should become start eligible after two ready payloads');

    const beforeRequestDispatches = chatBridge.dispatches.length;
    bridgeChatHooks.handleClientOutput(JSON.stringify({ event: 'PokerReadySeatsRequest', source: 'validator' }));
    assertEqual(chatBridge.dispatches.length, beforeRequestDispatches + 1, 'ready-seat request should dispatch one snapshot');
    const snapshotPayload = assertReadyDispatch(chatBridge.dispatches[chatBridge.dispatches.length - 1], 'ready-seat request snapshot');
    if (snapshotPayload) {
      assertEqual(snapshotPayload.action, 'snapshot', 'ready-seat request snapshot should identify snapshot action');
      assertEqual(snapshotPayload.reason, 'request', 'ready-seat request snapshot should identify request reason');
      assertEqual(snapshotPayload.count, 2, 'ready-seat request snapshot should include two ready seats');
      assertEqual(snapshotPayload.revision, chatBridge.config.PokerReadyRevision, 'ready-seat request snapshot should include the current revision');
    }

    const snapshotMenu = createMenuRuntime();
    const snapshotMenuHooks = snapshotMenu.sandbox.__PokerEscapeMenuTestHooks;
    assert(snapshotMenuHooks, 'fresh snapshot menu test hooks were not exported');
    if (snapshotMenuHooks && chatBridge.dispatches[chatBridge.dispatches.length - 1]) {
      snapshotMenuHooks.handleReadyEvent(chatBridge.dispatches[chatBridge.dispatches.length - 1].payload);
      assertSameReadySeats(chatBridge.config, snapshotMenu.config, 'fresh menu context should ingest requested ready snapshot');
      assertEqual(snapshotMenuHooks.isStartEligible(seatCount(snapshotMenu.config)), true, 'fresh menu context should become start eligible after requested snapshot');
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`validate-ready-state: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('validate-ready-state: ok');
}
