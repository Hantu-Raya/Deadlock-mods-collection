#!/usr/bin/env node
'use strict';

const path = require('node:path');
const harness = require('./poker-panorama-vm');
const { createValidatorContext, runScript, lastScheduledDelay, appendChatPanel } = harness;

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

function assertReadyDispatch(dispatch, message) {
  assert(dispatch, `${message} should dispatch`);
  if (!dispatch) return null;
  assertEqual(dispatch.name, 'ClientUI_FireOutput', `${message} should use ClientUI_FireOutput`);
  const payload = parseDispatchPayload(dispatch);
  if (payload) assertEqual(payload.event, 'PokerReadySeatsChanged', `${message} should carry the ready-seat event`);
  return payload;
}

function seedPartyForReady(hooks, names, partyId) {
  if (!hooks || !hooks.state) return;
  const members = {};
  const order = [];
  for (const name of names) {
    const key = String(name).toLowerCase();
    members[key] = { key, name };
    order.push(key);
  }
  hooks.state.party = {
    id: partyId || 'pvalidator-ready',
    mode: 'leader',
    leaderKey: order[0] || '',
    leaderName: names[0] || '',
    members,
    order,
  };
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

const resumeBridgePhrases = [
  '[resume leader] poker resume r123',
  '[resume ready] poker resume r123',
  'poker resume r123 hand 2 leader abrams roster abrams~Abrams|bebop~Bebop seed sresume',
];

const progressBridgePhrases = [
  '[progress offer] poker progress rabc 1234abcd 3',
  '[progress chunk] poker progress rabc 1234abcd 1/3 POKERPROG1-1234abcd-abcDEF_123',
];

const runtime = createValidatorContext();
runScript(runtime.sandbox, CHAT_SCRIPT);
runScript(runtime.sandbox, MENU_SCRIPT);

const chatHooks = runtime.sandbox.__PokerChatDebugTestHooks;
const menuHooks = runtime.sandbox.__PokerEscapeMenuTestHooks;

assert(chatHooks, 'chat test hooks were not exported');
assert(menuHooks, 'escape menu test hooks were not exported');

if (chatHooks && menuHooks) {
  assert(chatHooks.modules && chatHooks.modules.BridgeContract, 'chat hooks should expose BridgeContract module');
  assert(chatHooks.modules && chatHooks.modules.ChatBridgeIntake, 'chat hooks should expose ChatBridgeIntake module');
  for (const functionName of ['readRecord', 'shouldDelayUnknownSender', 'consumeRow', 'scan']) {
    assert(
      chatHooks.modules && chatHooks.modules.ChatBridgeIntake && typeof chatHooks.modules.ChatBridgeIntake[functionName] === 'function',
      `ChatBridgeIntake.${functionName} should be exposed`,
    );
  }
  assert(menuHooks.modules && menuHooks.modules.StartSync, 'menu hooks should expose StartSync module');
  for (const phrase of readyPhrases) {
    assertEqual(chatHooks.isReadyChatMessage(phrase), true, `ready phrase should be accepted (${phrase})`);
  }

  for (const phrase of nonReadyPhrases) {
    assertEqual(chatHooks.isReadyChatMessage(phrase), false, `non-ready phrase should be rejected (${phrase})`);
  }

  assertEqual(typeof chatHooks.shouldDelayUnknownSender, 'function', 'chat hooks should export shouldDelayUnknownSender for bridge contract assertions');
  assertEqual(typeof chatHooks.isPartyLeaderMessage, 'function', 'chat hooks should export isPartyLeaderMessage');
  assertEqual(typeof chatHooks.isPartyJoinMessage, 'function', 'chat hooks should export isPartyJoinMessage');
  assertEqual(typeof chatHooks.isResumeLeaderMessage, 'function', 'chat hooks should export isResumeLeaderMessage');
  assertEqual(typeof chatHooks.isResumeReadyMessage, 'function', 'chat hooks should export isResumeReadyMessage');
  assertEqual(typeof chatHooks.isResumeStartMessage, 'function', 'chat hooks should export isResumeStartMessage');
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
    for (const phrase of resumeBridgePhrases) {
      assertEqual(
        chatHooks.shouldDelayUnknownSender({ sender: '<unknown>', message: phrase, isSelf: false }, {}),
        true,
        `resume bridge phrase should be delayed while sender is unknown (${phrase})`,
      );
    }
    for (const phrase of progressBridgePhrases) {
      assertEqual(
        chatHooks.shouldDelayUnknownSender({ sender: '<unknown>', message: phrase, isSelf: false }, {}),
        true,
        `progress bridge phrase should be delayed while sender is unknown (${phrase})`,
      );
    }
  }
  if (typeof chatHooks.isPartyLeaderMessage === 'function') {
    assertEqual(chatHooks.isPartyLeaderMessage('[party leader] poker party p123'), true, 'party leader helper should accept the exact leader wire phrase');
    assertEqual(chatHooks.isPartyLeaderMessage('[party join] poker party p123'), false, 'party leader helper should reject the join wire phrase');
  }
  if (typeof chatHooks.isPartyJoinMessage === 'function') {
    assertEqual(chatHooks.isPartyJoinMessage('[party join] poker party p123'), true, 'party join helper should accept the exact join wire phrase');
    assertEqual(chatHooks.isPartyJoinMessage('[party leader] poker party p123'), false, 'party join helper should reject the leader wire phrase');
  }
  if (typeof chatHooks.isResumeLeaderMessage === 'function') {
    assertEqual(chatHooks.isResumeLeaderMessage('[resume leader] poker resume r123'), true, 'resume leader helper should accept the exact leader wire phrase');
    assertEqual(chatHooks.isResumeLeaderMessage('[resume ready] poker resume r123'), false, 'resume leader helper should reject the ready wire phrase');
  }
  if (typeof chatHooks.isResumeReadyMessage === 'function') {
    assertEqual(chatHooks.isResumeReadyMessage('[resume ready] poker resume r123'), true, 'resume ready helper should accept the exact ready wire phrase');
    assertEqual(chatHooks.isResumeReadyMessage('[resume leader] poker resume r123'), false, 'resume ready helper should reject the leader wire phrase');
  }
  if (typeof chatHooks.isResumeStartMessage === 'function') {
    assertEqual(chatHooks.isResumeStartMessage('poker resume r123 hand 2 leader abrams roster abrams~Abrams|bebop~Bebop seed sresume'), true, 'resume start helper should accept the exact start wire phrase');
    assertEqual(chatHooks.isResumeStartMessage('[resume ready] poker resume r123'), false, 'resume start helper should reject prefixed ready rows');
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

  for (const phrase of resumeBridgePhrases) {
    const beforeSeatCount = seatCount(runtime.config);
    const beforeDispatches = runtime.dispatches.length;
    assertEqual(chatHooks.isReadyChatMessage(phrase), false, `resume bridge phrase should not be a ready phrase (${phrase})`);
    assertEqual(chatHooks.markPlayerReady({ sender: 'ResumeUser', channel: '[Party]', message: phrase }), false, `resume bridge phrase should not create a ready seat (${phrase})`);
    assertEqual(seatCount(runtime.config), beforeSeatCount, `resume bridge phrase should not change ready seats (${phrase})`);
    assertEqual(runtime.dispatches.length, beforeDispatches, `resume bridge phrase should not dispatch a ready-seat update (${phrase})`);
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



    function assertDelayedUnknownPartyAuthorityRecovery(message, stabilizedSender) {
      const authorityRuntime = createChatRuntime();
      const authorityHooks = authorityRuntime.sandbox.__PokerChatDebugTestHooks;
      assert(authorityHooks, `delayed unknown sender party authority hooks should be exported (${message})`);
      if (!authorityHooks) return;

      const authorityRow = appendChatPanel(authorityRuntime, '<unknown>', '[Party]', message, false);
      for (let i = 0; i < 8; i += 1) {
        authorityHooks.scanChatMessages();
      }
      assertEqual(authorityHooks.getChatMessages().length, 0, `unknown non-self party authority row should remain delayed through retry exhaustion (${message})`);
      assertEqual(authorityRuntime.dispatches.length, 0, `unknown non-self party authority row should not emit a bridge event before sender stabilizes (${message})`);

      authorityRow.senderLabel.text = stabilizedSender;
      authorityHooks.scanChatMessages();
      const authorityMessages = authorityHooks.getChatMessages();
      assertEqual(authorityMessages.length, 1, `recovered party authority row should process exactly once after sender stabilizes (${message})`);
      assertEqual(authorityMessages[0].sender, stabilizedSender, `recovered party authority row should use stabilized sender (${message})`);
      assertEqual(authorityMessages[0].message, message, `recovered party authority row should preserve the original wire phrase (${message})`);
      if (authorityMessages.length === 1 && authorityMessages[0].sender === stabilizedSender && authorityMessages[0].message === message) {
        const authorityChatPayload = authorityRuntime.dispatches
          .map(parseDispatchPayload)
          .find((payload) => payload && payload.event === 'PokerChatMessage');
        assert(authorityChatPayload, `recovered party authority row should dispatch a bridged chat event (${message})`);
        if (authorityChatPayload) {
          assertEqual(authorityChatPayload.sender, stabilizedSender, `recovered party authority bridge event should use stabilized sender (${message})`);
          assertEqual(authorityChatPayload.message, message, `recovered party authority bridge event should preserve the original wire phrase (${message})`);
        }
      }
    }

    assertDelayedUnknownPartyAuthorityRecovery('[party join] poker party precover', 'Kaku');
    assertDelayedUnknownPartyAuthorityRecovery('[party leave] poker party precover', 'Kaku');

    const delayedPartyRuntime = createChatRuntime();
    const delayedPartyHooks = delayedPartyRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(delayedPartyHooks, 'delayed unknown sender party hooks should be exported');
    if (delayedPartyHooks) {
      delayedPartyRuntime.config.PokerChatMessages = [
        { seq: 1, sender: 'Host', channel: '[Party]', message: '[party leader] poker party pold', isSelf: false },
        { seq: 2, sender: 'Host', channel: '[Party]', message: '[party leave] poker party pold', isSelf: false },
      ];
      delayedPartyRuntime.config.PokerChatSequence = 2;
      const delayedPartyRow = appendChatPanel(delayedPartyRuntime, '<unknown>', '[Party]', '[party leader] poker party pdelay', false);
      delayedPartyHooks.scanChatMessages();
      assertEqual(delayedPartyHooks.getChatMessages().length, 2, 'unknown non-self party leader should delay on the first scan while sender is unknown');
      assertEqual(delayedPartyRuntime.dispatches.length, 0, 'unknown non-self party leader should not dispatch while the first scan is delayed');
      for (let i = 0; i < 8 && delayedPartyHooks.getChatMessages().length === 2; i += 1) {
        delayedPartyHooks.scanChatMessages();
      }
      const delayedPartyMessages = delayedPartyHooks.getChatMessages();
      assertEqual(delayedPartyMessages.length, 3, 'unknown non-self party leader should resolve from known leader context after bounded retry');
      const resolvedPartyMessage = delayedPartyMessages[2] || {};
      assertEqual(resolvedPartyMessage.sender, 'Host', 'resolved fallback party leader should use the trusted prior leader sender');
      assertEqual(resolvedPartyMessage.message, '[party leader] poker party pdelay', 'resolved fallback party leader should preserve the original wire phrase');
      assertEqual(seatCount(delayedPartyRuntime.config), 1, 'resolved fallback party leader should create a ready seat for the trusted leader');
      const delayedPartyPayload = delayedPartyRuntime.dispatches.map(parseDispatchPayload).find((payload) => payload && payload.event === 'PokerChatMessage');
      assert(delayedPartyPayload, 'resolved fallback party leader should dispatch one bridged chat event');
      if (delayedPartyPayload) {
        assertEqual(delayedPartyPayload.sender, 'Host', 'resolved fallback party leader dispatch should use trusted prior sender');
        const delayedPartyMenu = createMenuRuntime();
        const delayedPartyMenuHooks = delayedPartyMenu.sandbox.__PokerEscapeMenuTestHooks;
        delayedPartyMenuHooks.handleReadyEvent(JSON.stringify(delayedPartyPayload));
        const fallbackPartyState = delayedPartyMenu.config.PokerPartyState || {};
        assertEqual(fallbackPartyState.id, 'pdelay', 'resolved fallback party leader should let the menu discover the hosted party id');
        assertEqual(fallbackPartyState.leaderKey, 'host', 'resolved fallback party leader should authorize only the trusted prior sender');
        const partyButtonState = delayedPartyMenuHooks.modules.PokerButtonState.get();
        assertEqual(partyButtonState.controls.partyJoin.hidden, false, 'resolved fallback party leader should expose JOIN PARTY for party discovery');
        delayedPartyMenuHooks.processChatRecord({ sender: 'Local Hero', message: '[party join] poker party pdelay', isSelf: true });
        delayedPartyMenuHooks.processChatRecord({ sender: '<unknown>', message: 'poker start sfallback hand 1 roster host~Host|local%20hero~Local%20Hero', isSelf: false });
        assert(delayedPartyMenuHooks.state.game, 'resolved fallback party leader should let unknown start resolve through the trusted roster leader');
        if (delayedPartyMenuHooks.state.game) assertEqual(delayedPartyMenuHooks.state.game.seed, 'sfallback', 'resolved fallback party leader should start the synced fallback hand');
      }
    }
    const delayedResumeAuthorityPhrases = [
      '[resume leader] poker resume rdelay',
      '[resume ready] poker resume rdelay',
      'poker resume rdelay hand 2 leader jdbeast roster jdbeast~JDBeast|hantu%20raya~Hantu%20Raya seed sresume',
    ];

    function assertDelayedUnknownResumeAuthorityRecovery(message) {
      const delayedResumeRuntime = createChatRuntime();
      const delayedResumeHooks = delayedResumeRuntime.sandbox.__PokerChatDebugTestHooks;
      assert(delayedResumeHooks, `delayed unknown sender resume hooks should be exported (${message})`);
      if (!delayedResumeHooks) return;

      const delayedResumeRow = appendChatPanel(delayedResumeRuntime, '<unknown>', '[Party]', message, false);
      for (let i = 0; i < 8; i += 1) {
        delayedResumeHooks.scanChatMessages();
      }
      assertEqual(delayedResumeHooks.getChatMessages().length, 0, `unknown non-self resume authority row should remain delayed through retry exhaustion (${message})`);
      assertEqual(delayedResumeRuntime.dispatches.length, 0, `unknown non-self resume authority row should not dispatch before sender stabilizes (${message})`);

      delayedResumeRow.senderLabel.text = 'JDBeast';
      delayedResumeHooks.scanChatMessages();
      const delayedResumeMessages = delayedResumeHooks.getChatMessages();
      assertEqual(delayedResumeMessages.length, 1, `recovered resume authority row should process exactly once after sender stabilizes (${message})`);
      assertEqual(delayedResumeMessages[0].sender, 'JDBeast', `recovered resume authority row should use stabilized sender (${message})`);
      assertEqual(delayedResumeMessages[0].message, message, `recovered resume authority row should preserve the original wire phrase (${message})`);
      assertEqual(delayedResumeRuntime.dispatches.length, 1, `recovered resume authority row should dispatch one chat message only (${message})`);
      const delayedResumePayload = parseDispatchPayload(delayedResumeRuntime.dispatches[0]);
      if (delayedResumePayload) {
        assertEqual(delayedResumePayload.event, 'PokerChatMessage', `recovered resume authority dispatch should carry a bridged chat message (${message})`);
        assertEqual(delayedResumePayload.sender, 'JDBeast', `recovered resume authority dispatch should preserve the stabilized sender (${message})`);
        assertEqual(delayedResumePayload.message, message, `recovered resume authority dispatch should preserve the original wire phrase (${message})`);
      }
      assertEqual(seatCount(delayedResumeRuntime.config), 0, `recovered resume authority row should not create a ready seat (${message})`);
    }

    for (const message of delayedResumeAuthorityPhrases) {
      assertDelayedUnknownResumeAuthorityRecovery(message);
    }

    function assertDelayedUnknownProgressBridgeRecovery(message) {
      const delayedProgressRuntime = createChatRuntime();
      const delayedProgressHooks = delayedProgressRuntime.sandbox.__PokerChatDebugTestHooks;
      assert(delayedProgressHooks, `delayed unknown sender progress hooks should be exported (${message})`);
      if (!delayedProgressHooks) return;

      const delayedProgressRow = appendChatPanel(delayedProgressRuntime, '<unknown>', '[Party]', message, false);
      delayedProgressHooks.scanChatMessages();
      assertEqual(delayedProgressHooks.getChatMessages().length, 0, `unknown non-self progress bridge row should delay on the first scan (${message})`);
      assertEqual(delayedProgressRuntime.dispatches.length, 0, `unknown non-self progress bridge row should not dispatch before sender stabilizes (${message})`);

      delayedProgressRow.senderLabel.text = 'ProgressHost';
      delayedProgressHooks.scanChatMessages();
      const delayedProgressMessages = delayedProgressHooks.getChatMessages();
      assertEqual(delayedProgressMessages.length, 1, `recovered progress bridge row should process exactly once after sender stabilizes (${message})`);
      assertEqual(delayedProgressMessages[0].sender, 'ProgressHost', `recovered progress bridge row should use stabilized sender (${message})`);
      assertEqual(delayedProgressMessages[0].message, message, `recovered progress bridge row should preserve the original wire phrase (${message})`);
      assertEqual(delayedProgressRuntime.dispatches.length, 1, `recovered progress bridge row should dispatch one chat message only (${message})`);
      const delayedProgressPayload = parseDispatchPayload(delayedProgressRuntime.dispatches[0]);
      if (delayedProgressPayload) {
        assertEqual(delayedProgressPayload.event, 'PokerChatMessage', `recovered progress bridge dispatch should carry a bridged chat message (${message})`);
        assertEqual(delayedProgressPayload.sender, 'ProgressHost', `recovered progress bridge dispatch should preserve the stabilized sender (${message})`);
        assertEqual(delayedProgressPayload.message, message, `recovered progress bridge dispatch should preserve the original wire phrase (${message})`);
      }
      assertEqual(seatCount(delayedProgressRuntime.config), 0, `recovered progress bridge row should not create a ready seat (${message})`);

      delayedProgressHooks.scanChatMessages();
      assertEqual(delayedProgressHooks.getChatMessages().length, 1, `recovered progress bridge row should stay processed exactly once on a later scan (${message})`);
      assertEqual(delayedProgressRuntime.dispatches.length, 1, `recovered progress bridge row should not redispatch on a later scan (${message})`);
    }

    for (const message of progressBridgePhrases) {
      assertDelayedUnknownProgressBridgeRecovery(message);
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

    const stableRowRuntime = createChatRuntime();
    const stableRowHooks = stableRowRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(stableRowHooks, 'stable already-consumed chat row hooks should be exported');
    if (stableRowHooks) {
      appendChatPanel(stableRowRuntime, 'Pocket', '[All]', 'nice hand', false);
      stableRowHooks.scanChatMessages();
      assertEqual(stableRowHooks.getChatMessages().length, 1, 'stable non-poker row should store exactly one chat record on first scan');
      assertEqual(stableRowRuntime.dispatches.length, 1, 'stable non-poker row should dispatch exactly once on first scan');
      assertEqual(lastScheduledDelay(stableRowRuntime), 0.1, 'stable non-poker row first scan should keep fast polling after new work');

      stableRowHooks.scanChatMessages();
      assertEqual(stableRowHooks.getChatMessages().length, 1, 'already-consumed stable non-poker row should not create another chat record');
      assertEqual(stableRowRuntime.dispatches.length, 1, 'already-consumed stable non-poker row should not redispatch');
      assertEqual(lastScheduledDelay(stableRowRuntime), 0.5, 'already-consumed stable non-poker row should back off to slow polling');
    }

    const unresolvedAuthorityRuntime = createChatRuntime();
    const unresolvedAuthorityHooks = unresolvedAuthorityRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(unresolvedAuthorityHooks, 'unresolved unknown authority row hooks should be exported');
    if (unresolvedAuthorityHooks) {
      appendChatPanel(unresolvedAuthorityRuntime, '<unknown>', '[Party]', '[party join] poker party pschedule', false);
      unresolvedAuthorityHooks.scanChatMessages();
      assertEqual(unresolvedAuthorityHooks.getChatMessages().length, 0, 'unresolved unknown authority row should not create a chat record');
      assertEqual(unresolvedAuthorityRuntime.dispatches.length, 0, 'unresolved unknown authority row should not dispatch before sender stabilizes');
      assertEqual(lastScheduledDelay(unresolvedAuthorityRuntime), 0.1, 'unresolved unknown authority row should keep fast polling while delayed');
    }
  }

  assertEqual(menuHooks.isStartEligible(0), false, 'start eligibility should be false for 0 ready seats');
  assertEqual(menuHooks.isStartEligible(1), false, 'start eligibility should be false for 1 ready seat');
  assertEqual(menuHooks.isStartEligible(2), true, 'start eligibility should be true for 2 ready seats');
  assertEqual(menuHooks.isStartEligible(3), true, 'start eligibility should remain true for 3 ready seats');

  const consumeRuntime = createChatRuntime();
  const consumeHooks = consumeRuntime.sandbox.__PokerChatDebugTestHooks;
  assert(consumeHooks && consumeHooks.modules && consumeHooks.modules.ChatBridgeIntake, 'consume-row chat intake hooks should be exported');
  if (consumeHooks && consumeHooks.modules && consumeHooks.modules.ChatBridgeIntake) {
    const leaderRow = appendChatPanel(consumeRuntime, 'Host', '[Party]', '[party leader] poker party pconsume', false).row;
    const joinRow = appendChatPanel(consumeRuntime, 'Guest', '[Party]', '[party join] poker party pconsume', false).row;
    const leaderResult = consumeHooks.modules.ChatBridgeIntake.consumeRow(leaderRow);
    const joinResult = consumeHooks.modules.ChatBridgeIntake.consumeRow(joinRow);
    assertEqual(leaderResult.status, 'consumed', 'party leader row should be consumed by ChatBridgeIntake');
    assertEqual(joinResult.status, 'consumed', 'party join row should be consumed by ChatBridgeIntake');
    assertEqual(leaderResult.readyChanged, true, 'party leader row should create a ready-seat signal');
    assertEqual(joinResult.readyChanged, true, 'party join row should create a ready-seat signal');
    assertEqual(seatCount(consumeRuntime.config), 2, 'party leader and join rows should create two ready seats through consumeRow');
  }

  const partySnapshotChat = createChatRuntime();
  const partySnapshotMenu = createMenuRuntime();
  const partySnapshotChatHooks = partySnapshotChat.sandbox.__PokerChatDebugTestHooks;
  const partySnapshotMenuHooks = partySnapshotMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(partySnapshotChatHooks && partySnapshotMenuHooks, 'party snapshot runtimes should export hooks');
  if (partySnapshotChatHooks && partySnapshotMenuHooks) {
    appendChatPanel(partySnapshotChat, 'Host', '[Party]', '[party leader] poker party psnap', false);
    partySnapshotChatHooks.scanChatMessages();
    partySnapshotChatHooks.handleClientOutput(JSON.stringify({ event: 'PokerChatSnapshotRequest', source: 'validator' }));
    const snapshotDispatch = partySnapshotChat.dispatches.map(parseDispatchPayload).find((payload) => payload && payload.event === 'PokerChatMessage' && payload.action === 'snapshot');
    assert(snapshotDispatch, 'chat snapshot request should dispatch a chat snapshot');
    if (snapshotDispatch) {
      partySnapshotMenuHooks.handleReadyEvent(JSON.stringify(snapshotDispatch));
      assertEqual(partySnapshotMenu.config.PokerPartyState.leaderKey, 'host', 'fresh menu context should hydrate party leader state from chat snapshot replay');
      assertEqual(partySnapshotMenu.config.PokerPartyState.id, 'psnap', 'fresh menu context should hydrate party id from chat snapshot replay');
    }
  }

  const replayChat = createChatRuntime();
  const replayImmediateMenu = createMenuRuntime();
  const replaySnapshotMenu = createMenuRuntime();
  const replayChatHooks = replayChat.sandbox.__PokerChatDebugTestHooks;
  const replayImmediateHooks = replayImmediateMenu.sandbox.__PokerEscapeMenuTestHooks;
  const replaySnapshotHooks = replaySnapshotMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(replayChatHooks && replayImmediateHooks && replaySnapshotHooks, 'party/start replay equivalence runtimes should export hooks');
  if (replayChatHooks && replayImmediateHooks && replaySnapshotHooks) {
    const replayRoster = [
      { key: 'host', name: 'Host' },
      { key: 'guest', name: 'Guest' },
    ];
    const replayStart = replayImmediateHooks.buildSynchronizedStartCommand('spreplay', replayRoster, 1);
    appendChatPanel(replayChat, 'Host', '[Party]', '[party leader] poker party preplay', false);
    appendChatPanel(replayChat, 'Guest', '[Party]', '[party join] poker party preplay', false);
    appendChatPanel(replayChat, 'Host', '[Party]', replayStart, false);
    replayChatHooks.scanChatMessages();
    const immediatePayloads = replayChat.dispatches.map(parseDispatchPayload).filter((payload) => payload && payload.event === 'PokerChatMessage' && payload.action !== 'snapshot');
    for (const payload of immediatePayloads) replayImmediateHooks.handleReadyEvent(JSON.stringify(payload));
    replaySnapshotHooks.handleReadyEvent(JSON.stringify({
      event: 'PokerChatMessage',
      action: 'snapshot',
      reason: 'test',
      seq: immediatePayloads.length,
      messages: immediatePayloads,
    }));
    const immediateParty = replayImmediateMenu.config.PokerPartyState || {};
    const snapshotParty = replaySnapshotMenu.config.PokerPartyState || {};
    assertEqual(snapshotParty.id, immediateParty.id, 'party/start snapshot replay should keep the same party id as immediate dispatch');
    assertEqual(snapshotParty.id, 'preplay', 'party/start snapshot replay should hydrate the preplay party id');
    assertEqual(snapshotParty.mode, immediateParty.mode, 'party/start snapshot replay should keep the same party mode as immediate dispatch');
    assertEqual(snapshotParty.leaderKey, immediateParty.leaderKey, 'party/start snapshot replay should keep the same leader key as immediate dispatch');
    assertEqual(snapshotParty.leaderName, immediateParty.leaderName, 'party/start snapshot replay should keep the same leader name as immediate dispatch');
    assertEqual(Object.keys(snapshotParty.members || {}).sort().join(','), Object.keys(immediateParty.members || {}).sort().join(','), 'party/start snapshot replay should keep the same party members as immediate dispatch');
    const immediateGame = replayImmediateHooks.state.game;
    const snapshotGame = replaySnapshotHooks.state.game;
    assert(immediateGame && snapshotGame, 'party/start snapshot replay should start a game on both paths');
    if (immediateGame && snapshotGame) {
      assertEqual(snapshotGame.seed, immediateGame.seed, 'party/start snapshot replay game seed');
      assertEqual(snapshotGame.handNumber, immediateGame.handNumber, 'party/start snapshot replay hand number');
      assertEqual(snapshotGame.players.map((player) => `${player.key}:${player.name}`).join('|'), immediateGame.players.map((player) => `${player.key}:${player.name}`).join('|'), 'party/start snapshot replay ordered player identities');
    }
  }

  const prematureJoin = createMenuRuntime();
  prematureJoin.sandbox.PokerEscapeMenuJoinParty();
  assertEqual(
    prematureJoin.sandbox.__PokerEscapeMenuTestHooks.state.statusModel.text,
    'Looking for a [party leader] message. Click JOIN PARTY again if the host just pressed HOST PARTY.',
    'join before chat snapshot arrival should show the exact retry status',
  );
  assert(
    !prematureJoin.dispatches.some((dispatch) => String(dispatch.payload || '').includes('[party join]')),
    'join before chat snapshot arrival should not send a [party join] chat command',
  );

  const syncRuntime = createMenuRuntime();
  const syncHooks = syncRuntime.sandbox.__PokerEscapeMenuTestHooks;
  assert(syncHooks.modules && syncHooks.modules.StartSync, 'StartSync should be exposed through menu module hooks');
  if (syncHooks.modules && syncHooks.modules.StartSync) {
    syncHooks.modules.StartSync.requestFreshState('validator');
    let projection = syncHooks.modules.StartSync.getProjection();
    assertEqual(projection.waitingForReadySnapshot, true, 'requestFreshState should wait for ready snapshot');
    assertEqual(projection.waitingForChatSnapshot, true, 'requestFreshState should wait for chat snapshot');
    syncHooks.handleReadyEvent(JSON.stringify({ event: 'PokerReadySeatsChanged', action: 'snapshot', seats: [], revision: 0 }));
    projection = syncHooks.modules.StartSync.getProjection();
    assertEqual(projection.waitingForReadySnapshot, false, 'ready snapshot should clear StartSync ready waiting flag');
    syncHooks.handleReadyEvent(JSON.stringify({ event: 'PokerChatMessage', action: 'snapshot', seq: 0, messages: [] }));
    projection = syncHooks.modules.StartSync.getProjection();
    assertEqual(projection.waitingForChatSnapshot, false, 'chat snapshot should clear StartSync chat waiting flag');
  }

  const unknownAuthority = createMenuRuntime();
  const unknownHooks = unknownAuthority.sandbox.__PokerEscapeMenuTestHooks;
  unknownHooks.processChatRecord({ sender: '<unknown>', message: '[party leader] poker party pbad', seq: 1 });
  unknownHooks.processChatRecord({ sender: '<unknown>', message: '[resume leader] poker resume rbad', seq: 2 });
  unknownHooks.processChatRecord({ sender: '<unknown>', message: 'poker start seed hand 1 roster abrams~Abrams|bebop~Bebop', seq: 3 });
  assert(!unknownAuthority.config.PokerPartyState || !unknownAuthority.config.PokerPartyState.leaderKey, 'unknown party leader row should be bridged but rejected by menu authority');
  assert(!unknownAuthority.config.PokerProgressState || !unknownAuthority.config.PokerProgressState.leaderKey, 'unknown resume leader row should be bridged but rejected by menu authority');
  assertEqual(unknownHooks.state.game, null, 'unknown start row should not mutate State.game');

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
    seedPartyForReady(bridgeMenuHooks, ['Dynamo', 'Haze'], 'pbridge-ready');

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
      seedPartyForReady(snapshotMenuHooks, ['Dynamo', 'Haze'], 'psnapshot-ready');
      snapshotMenuHooks.handleReadyEvent(chatBridge.dispatches[chatBridge.dispatches.length - 1].payload);
      assertSameReadySeats(chatBridge.config, snapshotMenu.config, 'fresh menu context should ingest requested ready snapshot');
      assertEqual(snapshotMenuHooks.isStartEligible(seatCount(snapshotMenu.config)), true, 'fresh menu context should become start eligible after requested snapshot');
    }

    const beforeClearDispatches = chatBridge.dispatches.length;
    bridgeChatHooks.handleClientOutput(JSON.stringify({ event: 'PokerReadySeatsClearRequest', source: 'validator', reason: 'validator clear' }));
    assertEqual(seatCount(chatBridge.config), 0, 'ready-seat clear request should empty chat bridge ready seats');
    assertEqual(chatBridge.dispatches.length, beforeClearDispatches + 1, 'ready-seat clear request should dispatch one empty ready update');
    const clearPayload = assertReadyDispatch(chatBridge.dispatches[chatBridge.dispatches.length - 1], 'ready-seat clear request update');
    if (clearPayload) {
      assertEqual(clearPayload.action, 'clear', 'ready-seat clear request update should identify the clear action');
      assertEqual(clearPayload.reason, 'validator clear', 'ready-seat clear request update should preserve the clear reason');
      assertEqual(clearPayload.count, 0, 'ready-seat clear request update should report zero ready seats');
      assertEqual(JSON.stringify(clearPayload.seats), JSON.stringify([]), 'ready-seat clear request update should dispatch an empty ready-seat list');
      assertEqual(clearPayload.revision, chatBridge.config.PokerReadyRevision, 'ready-seat clear request update should include the current revision');
      bridgeMenuHooks.handleReadyEvent(chatBridge.dispatches[chatBridge.dispatches.length - 1].payload);
      assertEqual(seatCount(menuBridge.config), 0, 'menu bridge should empty ready seats after the clear update');
      assertEqual(bridgeMenuHooks.isStartEligible(seatCount(menuBridge.config)), false, 'menu bridge should no longer be start eligible after the clear update');
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
