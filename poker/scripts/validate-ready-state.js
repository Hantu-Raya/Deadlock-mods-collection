#!/usr/bin/env node
'use strict';

const path = require('node:path');
const harness = require('./poker-panorama-vm');
const { createValidatorContext, runScript, drainScheduledCallbacks, drainDueScheduledCallbacks, advanceScheduledTime, lastScheduledDelay, appendChatPanel, clearDomWrites, takeDomWrites } = harness;

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

function applyMenuRecord(hooks, record) {
  return hooks.modules.CommandReducer.applyPayload({ event: 'PokerChatMessage', ...record });
}

function snapshot(hooks) {
  return hooks.getStateSnapshot();
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

function routeMenuChatSnapshotRequests(menuRuntime, chatRuntime, messageStart = 0) {
  const chatHooks = chatRuntime && chatRuntime.sandbox && chatRuntime.sandbox.__PokerChatDebugTestHooks;
  const menuHooks = menuRuntime && menuRuntime.sandbox && menuRuntime.sandbox.__PokerEscapeMenuTestHooks;
  assert(chatHooks && menuHooks, 'snapshot routing should have chat and menu hooks');
  if (!chatHooks || !menuHooks) return [];
  const requestPayloads = menuRuntime.dispatches
    .slice(messageStart)
    .map(parseDispatchPayload)
    .filter((payload) => payload && payload.event === 'PokerChatSnapshotRequest');
  assert(requestPayloads.length > 0, 'open menu should dispatch PokerChatSnapshotRequest');
  const chatStart = chatRuntime.dispatches.length;
  for (const payload of requestPayloads) chatHooks.handleClientOutput(JSON.stringify(payload));
  const snapshots = chatRuntime.dispatches
    .slice(chatStart)
    .map(parseDispatchPayload)
    .filter((payload) => payload && payload.event === 'PokerChatMessage' && payload.action === 'snapshot');
  assert(snapshots.length > 0, 'chat bridge should answer PokerChatSnapshotRequest with a chat snapshot');
  for (const snapshot of snapshots) menuHooks.handleReadyEvent(JSON.stringify(snapshot));
  drainScheduledCallbacks(menuRuntime, 64);
  return snapshots;
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

function createMenuRuntime(options = {}) {
  const runtime = createValidatorContext();
  if (options.testMode === false) runtime.sandbox.__PokerTestMode = false;
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
function findRuntimePanel(runtime, id) {
  return runtime && runtime.panels && runtime.panels.root && runtime.panels.root.FindChildTraverse
    ? runtime.panels.root.FindChildTraverse(id)
    : null;
}

function runtimeButtonHidden(runtime, id) {
  const panel = findRuntimePanel(runtime, id);
  if (!panel) return true;
  try {
    if (typeof panel.BHasClass === 'function') return !!panel.BHasClass('PokerHidden');
  } catch (error) {}
  return !!(panel.classes && panel.classes.PokerHidden);
}

function runtimeButtonEnabled(runtime, id) {
  const panel = findRuntimePanel(runtime, id);
  if (!panel || runtimeButtonHidden(runtime, id)) return false;
  return panel.hittest !== false && !(panel.classes && panel.classes.Disabled);
}

function seedPartyForReady(hooks, names, partyId) {
  if (!hooks) return;
  hooks.seedPartyForTest(names.map((name) => ({ key: String(name).toLowerCase(), name })), partyId || 'pvalidator-ready', 'leader');
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

const runtime = createValidatorContext({ nowStep: 1 });
runScript(runtime.sandbox, CHAT_SCRIPT);
runScript(runtime.sandbox, MENU_SCRIPT);

const chatHooks = runtime.sandbox.__PokerChatDebugTestHooks;
const menuHooks = runtime.sandbox.__PokerEscapeMenuTestHooks;

assert(chatHooks, 'chat test hooks were not exported');
assert(menuHooks, 'escape menu test hooks were not exported');

if (chatHooks && menuHooks) {
  for (const functionName of ['getChatMessages', 'handleClientOutput']) {
    assert(typeof chatHooks[functionName] === 'function', `chat hooks should expose ${functionName} behavior hook`);
  }
  assert(chatHooks.modules && chatHooks.modules.ChatBridgeIntake, 'chat hooks should expose ChatBridgeIntake behavior seam');
  assert(chatHooks.modules.PokerMetrics, 'chat hooks should expose PokerMetrics behavior counters');
  for (const phrase of readyPhrases) {
    const phraseRuntime = createChatRuntime();
    const phraseHooks = phraseRuntime.sandbox.__PokerChatDebugTestHooks;
    appendChatPanel(phraseRuntime, 'Ready Tester', '[All]', phrase, false);
    phraseHooks.modules.ChatBridgeIntake.scanOnce();
    assertEqual(seatCount(phraseRuntime.config), 1, `ready phrase should create one visible ready seat (${phrase})`);
  }

  for (const phrase of nonReadyPhrases) {
    const phraseRuntime = createChatRuntime();
    const phraseHooks = phraseRuntime.sandbox.__PokerChatDebugTestHooks;
    appendChatPanel(phraseRuntime, 'Ready Tester', '[All]', phrase, false);
    phraseHooks.modules.ChatBridgeIntake.scanOnce();
    assertEqual(seatCount(phraseRuntime.config), 0, `non-ready phrase should not create a ready seat (${phrase})`);
  }

  appendChatPanel(runtime, 'Abrams', '[All]', 'ready', false);
  chatHooks.modules.ChatBridgeIntake.scanOnce();
  appendChatPanel(runtime, 'Bebop', '[Team]', 'join poker', false);
  chatHooks.modules.ChatBridgeIntake.scanOnce();
  appendChatPanel(runtime, 'Calico', '[All]', 'i am ready', false);
  chatHooks.modules.ChatBridgeIntake.scanOnce();

  assertEqual(seatCount(runtime.config), 3, 'three distinct ready senders should create exactly three seats');
  assertEqual(runtime.config.PokerReadyRevision, 3, 'three accepted ready senders should bump revision three times');

  const beforeDuplicate = runtime.config.PokerReadySeats.abrams;
  assert(beforeDuplicate, 'Abrams seat should exist before duplicate update');
  appendChatPanel(runtime, '  ABRAMS  ', '[Team]', 'poker ready', false);
  chatHooks.modules.ChatBridgeIntake.scanOnce();
  assertEqual(seatCount(runtime.config), 3, 'duplicate ready sender should update its seat instead of adding a fourth');
  assertEqual(runtime.config.PokerReadySeats.abrams.message, 'poker ready', 'duplicate sender should update the stored message');
  assertEqual(runtime.config.PokerReadySeats.abrams.channel, '[Team]', 'duplicate sender should update the stored channel');
  assert(runtime.config.PokerReadySeats.abrams.readyAt > beforeDuplicate.readyAt, 'duplicate sender should refresh the ready timestamp');
  assertEqual(runtime.config.PokerReadyRevision, 4, 'duplicate ready sender should bump revision without adding a seat');

  appendChatPanel(runtime, '<unknown>', '[All]', 'ready', false);
  for (let i = 0; i < 8; i += 1) chatHooks.modules.ChatBridgeIntake.scanOnce();
  assertEqual(seatCount(runtime.config), 3, 'unknown ready sender should not add a seat');
  assertEqual(runtime.config.PokerReadyRevision, 4, 'unknown ready sender should not bump revision');

  const readyDispatches = runtime.dispatches
    .map(parseDispatchPayload)
    .filter((payload) => payload && payload.event === 'PokerReadySeatsChanged');
  assertEqual(readyDispatches.length, 4, 'accepted ready rows should dispatch one ready-seat update each');
  for (let i = 0; i < readyDispatches.length; i += 1) {
    assertEqual(readyDispatches[i].event, 'PokerReadySeatsChanged', `ready dispatch ${i + 1} should carry the ready-seat event`);
  }

  for (const phrase of resumeBridgePhrases) {
    const beforeSeatCount = seatCount(runtime.config);
    const beforeReadyDispatches = runtime.dispatches
      .map(parseDispatchPayload)
      .filter((payload) => payload && payload.event === 'PokerReadySeatsChanged').length;
    appendChatPanel(runtime, 'ResumeUser', '[Party]', phrase, false);
    chatHooks.modules.ChatBridgeIntake.scanOnce();
    assertEqual(seatCount(runtime.config), beforeSeatCount, `resume bridge phrase should not change ready seats (${phrase})`);
    const afterReadyDispatches = runtime.dispatches
      .map(parseDispatchPayload)
      .filter((payload) => payload && payload.event === 'PokerReadySeatsChanged').length;
    assertEqual(afterReadyDispatches, beforeReadyDispatches, `resume bridge phrase should not dispatch a ready-seat update (${phrase})`);
  }

  const delayedActionRuntime = createChatRuntime();
  const delayedActionHooks = delayedActionRuntime.sandbox.__PokerChatDebugTestHooks;
  assert(delayedActionHooks, 'delayed unknown sender chat hooks should be exported');
  if (delayedActionHooks) {
    const delayedActionRow = appendChatPanel(delayedActionRuntime, '<unknown>', '[All]', 'bet 200', false);
    delayedActionHooks.modules.ChatBridgeIntake.scanOnce();
    assertEqual(delayedActionHooks.getChatMessages().length, 0, 'unknown non-self action-looking bet should be delayed while sender is unknown');
    assertEqual(delayedActionRuntime.dispatches.length, 0, 'unknown non-self action-looking bet should not dispatch a normal chat record while sender is unknown');

    delayedActionRow.senderLabel.text = 'Pocket';
    delayedActionHooks.modules.ChatBridgeIntake.scanOnce();
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
      fallbackActionHooks.modules.ChatBridgeIntake.scanOnce();
      assertEqual(fallbackActionHooks.getChatMessages().length, 0, 'unknown non-self raise should be delayed on the first scan while sender is unknown');
      assertEqual(fallbackActionRuntime.dispatches.length, 0, 'unknown non-self raise should not dispatch on the first scan while sender is unknown');

      fallbackActionHooks.modules.ChatBridgeIntake.scanOnce();
      assertEqual(fallbackActionHooks.getChatMessages().length, 0, 'unknown non-self raise should remain delayed on a second scan while sender is unknown');
      assertEqual(fallbackActionRuntime.dispatches.length, 0, 'unknown non-self raise should not dispatch on a second scan while sender is unknown');

      for (let i = 0; i < 8 && fallbackActionHooks.getChatMessages().length === 0; i += 1) {
        fallbackActionHooks.modules.ChatBridgeIntake.scanOnce();
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

    const fallbackMatchEndRuntime = createChatRuntime();
    const fallbackMatchEndHooks = fallbackMatchEndRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(fallbackMatchEndHooks, 'fallback unknown sender match-end hooks should be exported');
    if (fallbackMatchEndHooks) {
      const matchEndMessage = '[match end] poker party pbridge-match seed sbridge-match hand 1';
      const fallbackMatchEndRow = appendChatPanel(fallbackMatchEndRuntime, '<unknown>', '[Party]', matchEndMessage, false);
      for (let i = 0; i < 7; i += 1) fallbackMatchEndHooks.modules.ChatBridgeIntake.scanOnce();
      const fallbackMatchEndMessages = fallbackMatchEndHooks.getChatMessages();
      assertEqual(fallbackMatchEndMessages.length, 1, 'unknown non-self match-end should dispatch after bounded bridge retry');
      assertEqual(fallbackMatchEndMessages[0].sender, '<unknown>', 'unknown non-self match-end bridge dispatch should keep the unknown sender marker');
      assertEqual(fallbackMatchEndMessages[0].message, matchEndMessage, 'unknown non-self match-end bridge dispatch should preserve the exact message text');
      assertEqual(seatCount(fallbackMatchEndRuntime.config), 0, 'unknown non-self match-end bridge dispatch should not create ready seats');
      assertEqual(fallbackMatchEndRuntime.dispatches.length, 1, 'unknown non-self match-end bridge dispatch should emit one chat event');
      const fallbackMatchEndPayload = parseDispatchPayload(fallbackMatchEndRuntime.dispatches[0]);
      if (fallbackMatchEndPayload) {
        assertEqual(fallbackMatchEndPayload.event, 'PokerChatMessage', 'unknown non-self match-end dispatch should carry a bridged chat message');
        assertEqual(fallbackMatchEndPayload.sender, '<unknown>', 'unknown non-self match-end payload should keep the unknown sender marker');
        assertEqual(fallbackMatchEndPayload.message, matchEndMessage, 'unknown non-self match-end payload should preserve the exact message text');
      }
      fallbackMatchEndRow.senderLabel.text = 'MatchLeader';
      fallbackMatchEndHooks.modules.ChatBridgeIntake.scanOnce();
      assertEqual(fallbackMatchEndHooks.getChatMessages().length, 1, 'bounded unknown match-end should not redispatch when only the sender label stabilizes');
      assertEqual(fallbackMatchEndRuntime.dispatches.length, 1, 'bounded unknown match-end should emit one authoritative record after sender stabilization');
    }



    function assertDelayedUnknownPartyAuthorityRecovery(message, stabilizedSender) {
      const authorityRuntime = createChatRuntime();
      const authorityHooks = authorityRuntime.sandbox.__PokerChatDebugTestHooks;
      assert(authorityHooks, `delayed unknown sender party authority hooks should be exported (${message})`);
      if (!authorityHooks) return;

      const authorityRow = appendChatPanel(authorityRuntime, '<unknown>', '[Party]', message, false);
      for (let i = 0; i < 8; i += 1) {
        authorityHooks.modules.ChatBridgeIntake.scanOnce();
      }
      assertEqual(authorityHooks.getChatMessages().length, 0, `unknown non-self party authority row should remain delayed through retry exhaustion (${message})`);
      assertEqual(authorityRuntime.dispatches.length, 0, `unknown non-self party authority row should not emit a bridge event before sender stabilizes (${message})`);

      authorityRow.senderLabel.text = stabilizedSender;
      authorityHooks.modules.ChatBridgeIntake.scanOnce();
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

    const noSyntheticAuthorityRuntime = createChatRuntime();
    const noSyntheticAuthorityHooks = noSyntheticAuthorityRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(noSyntheticAuthorityHooks, 'unknown party leader should not synthesize authority hooks should be exported');
    if (noSyntheticAuthorityHooks) {
      appendChatPanel(noSyntheticAuthorityRuntime, 'Host', '[Party]', '[party leader] poker party psynth', false);
      noSyntheticAuthorityHooks.modules.ChatBridgeIntake.scanOnce();
      const dispatchesBeforeUnknownLeader = noSyntheticAuthorityRuntime.dispatches.length;
      const unknownLeaderRow = appendChatPanel(noSyntheticAuthorityRuntime, '<unknown>', '[Party]', '[party leader] poker party psynth', false);
      for (let i = 0; i < 8; i += 1) noSyntheticAuthorityHooks.modules.ChatBridgeIntake.scanOnce();
      const provisionalLeaderMessages = noSyntheticAuthorityHooks.getChatMessages()
        .filter((record) => record && record.message === '[party leader] poker party psynth' && record.sender === '<unknown>');
      assertEqual(provisionalLeaderMessages.length, 1, 'unresolved unknown party leader should dispatch once as provisional lobby discovery');
      assertEqual(noSyntheticAuthorityRuntime.dispatches.length, dispatchesBeforeUnknownLeader + 1, 'provisional unknown party leader should emit one non-authoritative discovery event');

      unknownLeaderRow.senderLabel.text = 'Real Host';
      noSyntheticAuthorityHooks.modules.ChatBridgeIntake.scanOnce();
      const recoveredLeaderMessages = noSyntheticAuthorityHooks.getChatMessages()
        .filter((record) => record && record.message === '[party leader] poker party psynth' && record.sender === 'Real Host');
      assertEqual(recoveredLeaderMessages.length, 1, 'unknown party leader should still process once the real sender stabilizes');
    }

    const unknownPartyLeaveRuntime = createChatRuntime();
    const unknownPartyLeaveHooks = unknownPartyLeaveRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(unknownPartyLeaveHooks, 'unknown party leave release hooks should be exported');
    if (unknownPartyLeaveHooks) {
      const leaveMessage = '[party leave] poker party precover';
      appendChatPanel(unknownPartyLeaveRuntime, '<unknown>', '[Party]', leaveMessage, false);
      unknownPartyLeaveHooks.modules.ChatBridgeIntake.scanOnce();
      assertEqual(unknownPartyLeaveHooks.getChatMessages().length, 0, 'unknown non-self party leave should delay on the first bridge scan');
      assertEqual(unknownPartyLeaveRuntime.dispatches.length, 0, 'unknown non-self party leave should not dispatch on the first delayed bridge scan');
      for (let i = 0; i < 6; i += 1) unknownPartyLeaveHooks.modules.ChatBridgeIntake.scanOnce();
      const unknownPartyLeaveMessages = unknownPartyLeaveHooks.getChatMessages();
      assertEqual(unknownPartyLeaveMessages.length, 1, 'unknown non-self party leave should dispatch after bounded bridge retry');
      assertEqual(unknownPartyLeaveMessages[0].sender, '<unknown>', 'unknown party leave bridge dispatch should keep the unknown sender marker for menu-side authentication');
      assertEqual(unknownPartyLeaveMessages[0].message, leaveMessage, 'unknown party leave bridge dispatch should preserve the exact message text');
      assertEqual(unknownPartyLeaveRuntime.dispatches.length, 1, 'unknown party leave bridge dispatch should emit one chat event');
    }

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
      for (let i = 0; i < 9; i += 1) delayedPartyHooks.modules.ChatBridgeIntake.scanOnce();
      assertEqual(delayedPartyHooks.getChatMessages().length, 3, 'unknown non-self party leader should dispatch provisionally after bounded retry');
      assertEqual(delayedPartyRuntime.dispatches.length, 1, 'unknown non-self party leader should emit one provisional discovery while sender remains unknown');
      assertEqual(seatCount(delayedPartyRuntime.config), 0, 'unknown non-self party leader should not create ready seats from prior chat history');

      delayedPartyRow.senderLabel.text = 'Host';
      delayedPartyHooks.modules.ChatBridgeIntake.scanOnce();
      const delayedPartyMessages = delayedPartyHooks.getChatMessages();
      assertEqual(delayedPartyMessages.length, 4, 'provisional party leader should process again after the real sender stabilizes');
      const recoveredPartyMessage = delayedPartyMessages[3] || {};
      assertEqual(recoveredPartyMessage.sender, 'Host', 'recovered party leader should use the stabilized sender');
      assertEqual(recoveredPartyMessage.message, '[party leader] poker party pdelay', 'recovered party leader should preserve the original wire phrase');
      assertEqual(seatCount(delayedPartyRuntime.config), 1, 'recovered party leader should create a ready seat only after sender stabilization');
    }
    function assertUnknownPartyLeaderDoesNotFallback(label, existingMessages) {
      const negativeRuntime = createChatRuntime();
      const negativeHooks = negativeRuntime.sandbox.__PokerChatDebugTestHooks;
      assert(negativeHooks, `${label} negative fallback hooks should be exported`);
      if (!negativeHooks) return;
      negativeRuntime.config.PokerChatMessages = existingMessages || [];
      negativeRuntime.config.PokerChatSequence = (existingMessages || []).length;
      appendChatPanel(negativeRuntime, '<unknown>', '[Party]', `[party leader] poker party pnegative-${label}`, false);
      for (let i = 0; i < 9; i += 1) negativeHooks.modules.ChatBridgeIntake.scanOnce();
      assertEqual(
        negativeHooks.getChatMessages().length,
        (existingMessages || []).length + 1,
        `${label} unknown party leader should dispatch once as provisional discovery after bounded retry`,
      );
      assertEqual(negativeRuntime.dispatches.length, 1, `${label} unknown party leader should emit one provisional discovery without trusted authority`);
      assertEqual(seatCount(negativeRuntime.config), 0, `${label} unknown party leader should not create a ready seat`);
    }

    assertUnknownPartyLeaderDoesNotFallback('no-prior-leader', []);
    assertUnknownPartyLeaderDoesNotFallback('mismatched-leave', [
      { seq: 1, sender: 'Host', channel: '[Party]', message: '[party leader] poker party pold', isSelf: false },
      { seq: 2, sender: 'Other', channel: '[Party]', message: '[party leave] poker party pold', isSelf: false },
    ]);
    const delayedResumeAuthorityPhrases = [
      '[resume leader] poker resume rdelay',
      '[resume ready] poker resume rdelay',
    ];
    const shortResumeStartPhrase = 'poker resume rdelay hand 2 leader jdbeast seed sresume';

    function assertDelayedUnknownResumeAuthorityRecovery(message) {
      const delayedResumeRuntime = createChatRuntime();
      const delayedResumeHooks = delayedResumeRuntime.sandbox.__PokerChatDebugTestHooks;
      assert(delayedResumeHooks, `delayed unknown sender resume hooks should be exported (${message})`);
      if (!delayedResumeHooks) return;

      const delayedResumeRow = appendChatPanel(delayedResumeRuntime, '<unknown>', '[Party]', message, false);
      for (let i = 0; i < 8; i += 1) {
        delayedResumeHooks.modules.ChatBridgeIntake.scanOnce();
      }
      assertEqual(delayedResumeHooks.getChatMessages().length, 0, `unknown non-self resume authority row should remain delayed through retry exhaustion (${message})`);
      assertEqual(delayedResumeRuntime.dispatches.length, 0, `unknown non-self resume authority row should not dispatch before sender stabilizes (${message})`);

      delayedResumeRow.senderLabel.text = 'JDBeast';
      delayedResumeHooks.modules.ChatBridgeIntake.scanOnce();
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

    const delayedResumeStartRuntime = createChatRuntime();
    const delayedResumeStartHooks = delayedResumeStartRuntime.sandbox.__PokerChatDebugTestHooks;
    if (delayedResumeStartHooks) {
      appendChatPanel(delayedResumeStartRuntime, '<unknown>', '[Party]', shortResumeStartPhrase, false);
      for (let i = 0; i < 8; i += 1) delayedResumeStartHooks.modules.ChatBridgeIntake.scanOnce();
      const delayedResumeStartMessages = delayedResumeStartHooks.getChatMessages();
      assertEqual(delayedResumeStartMessages.length, 1, 'unknown short resume-start should dispatch after bounded retry exhaustion so menu-side leader resolution can run');
      assertEqual(delayedResumeStartMessages[0].sender, '<unknown>', 'unknown short resume-start should preserve unresolved sender for menu authority checks');
      assertEqual(delayedResumeStartMessages[0].message, shortResumeStartPhrase, 'unknown short resume-start should preserve the original wire phrase');
    }

    function assertDelayedUnknownProgressBridgeRecovery(message) {
      const delayedProgressRuntime = createChatRuntime();
      const delayedProgressHooks = delayedProgressRuntime.sandbox.__PokerChatDebugTestHooks;
      assert(delayedProgressHooks, `delayed unknown sender progress hooks should be exported (${message})`);
      if (!delayedProgressHooks) return;

      const delayedProgressRow = appendChatPanel(delayedProgressRuntime, '<unknown>', '[Party]', message, false);
      delayedProgressHooks.modules.ChatBridgeIntake.scanOnce();
      assertEqual(delayedProgressHooks.getChatMessages().length, 0, `unknown non-self progress bridge row should delay on the first scan (${message})`);
      assertEqual(delayedProgressRuntime.dispatches.length, 0, `unknown non-self progress bridge row should not dispatch before sender stabilizes (${message})`);

      delayedProgressRow.senderLabel.text = 'ProgressHost';
      delayedProgressHooks.modules.ChatBridgeIntake.scanOnce();
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

      delayedProgressHooks.modules.ChatBridgeIntake.scanOnce();
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
      casualHooks.modules.ChatBridgeIntake.scanOnce();
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

    const lowLatencyRuntime = createChatRuntime();
    const lowLatencyHooks = lowLatencyRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(lowLatencyHooks, 'low-latency incremental chat scan hooks should be exported');
    if (lowLatencyHooks) {
      for (let i = 0; i < 32; i += 1) {
        appendChatPanel(lowLatencyRuntime, `Old${i}`, '[All]', `old row ${i}`, false);
      }
      lowLatencyHooks.modules.ChatBridgeIntake.scanOnce();
      const beforeVisited = lowLatencyHooks.modules.PokerMetrics.snapshot().counters.chatRowsVisited || 0;
      appendChatPanel(lowLatencyRuntime, 'Fresh', '[Team]', 'fresh row', false);
      lowLatencyHooks.modules.ChatBridgeIntake.scanOnce();
      const afterVisited = lowLatencyHooks.modules.PokerMetrics.snapshot().counters.chatRowsVisited || 0;
      assertEqual(lowLatencyHooks.getChatMessages().length, 33, 'incremental chat scan should consume the new tail row after a large backlog');
      assertEqual(lowLatencyHooks.getChatMessages()[32].message, 'fresh row', 'incremental chat scan should preserve the fresh tail row text');
      assert(afterVisited - beforeVisited <= 8, `incremental chat scan should not rescan the full backlog for one new row (visited ${afterVisited - beforeVisited})`);

      const reusedTail = lowLatencyRuntime.panels.messages.GetChild(lowLatencyRuntime.panels.messages.GetChildCount() - 1);
      const reusedSender = reusedTail.FindChildTraverse('SenderName');
      const reusedChannel = reusedTail.FindChildTraverse('ChannelName');
      const reusedContents = reusedTail.FindChildTraverse('MessageContents');
      const reusedLabel = reusedContents && reusedContents.GetChild(0);
      if (reusedSender) reusedSender.text = 'Reuse';
      if (reusedChannel) reusedChannel.text = '[Party]';
      if (reusedLabel) reusedLabel.text = 'reused tail row';
      lowLatencyHooks.modules.ChatBridgeIntake.scanOnce();
      const reusedMessages = lowLatencyHooks.getChatMessages();
      assertEqual(reusedMessages.length, 34, 'incremental chat scan should detect a reused tail panel with new content');
      assertEqual(reusedMessages[33].message, 'reused tail row', 'incremental chat scan should consume the reused tail panel text');
    }
    const recursiveFallbackRuntime = createChatRuntime();
    const recursiveFallbackHooks = recursiveFallbackRuntime.sandbox.__PokerChatDebugTestHooks;
    assert(recursiveFallbackHooks, 'recursive chat-row lookup hooks should be exported');
    if (recursiveFallbackHooks) {
      const recursiveFallbackParts = appendChatPanel(recursiveFallbackRuntime, 'Fallback', '[Party]', 'recursive fallback row', false);
      const recursiveFallbackSource = recursiveFallbackParts.row.FindChildTraverse('MessageSource');
      recursiveFallbackParts.row.FindChildrenWithClassTraverse = undefined;
      if (recursiveFallbackSource) recursiveFallbackSource.FindChildrenWithClassTraverse = undefined;
      recursiveFallbackHooks.modules.ChatBridgeIntake.scanOnce();
      const recursiveFallbackMessages = recursiveFallbackHooks.getChatMessages();
      assertEqual(recursiveFallbackMessages.length, 1, 'disabling fast chat-row class traversal should still consume one visible row');
      assertEqual(recursiveFallbackMessages[0].sender, 'Fallback', 'recursive chat-row lookup should preserve the sender');
      assertEqual(recursiveFallbackMessages[0].channel, '[Party]', 'recursive chat-row lookup should preserve the channel');
      assertEqual(recursiveFallbackMessages[0].message, 'recursive fallback row', 'recursive chat-row lookup should preserve the message');
      const recursiveFallbackPayload = parseDispatchPayload(recursiveFallbackRuntime.dispatches[0]);
      if (recursiveFallbackPayload) {
        assertEqual(recursiveFallbackPayload.sender, 'Fallback', 'recursive chat-row dispatch should preserve the sender');
        assertEqual(recursiveFallbackPayload.channel, '[Party]', 'recursive chat-row dispatch should preserve the channel');
        assertEqual(recursiveFallbackPayload.message, 'recursive fallback row', 'recursive chat-row dispatch should preserve the message');
      }
    }

    const bridgeBehaviorCases = [
      { label: 'match-end', message: '[match end] poker party pbehavior seed sbehavior hand 1' },
      { label: 'progress offer', message: '[progress offer] poker progress rbehavior 1234abcd 2' },
      { label: 'progress chunk', message: '[progress chunk] poker progress rbehavior 1234abcd 1/2 chunk-body' },
      { label: 'bet', message: 'bet $200' },
      { label: 'raise', message: 'raise $400' },
    ];
    for (const behaviorCase of bridgeBehaviorCases) {
      const behaviorRuntime = createChatRuntime();
      const behaviorHooks = behaviorRuntime.sandbox.__PokerChatDebugTestHooks;
      assert(behaviorHooks, `${behaviorCase.label} behavior fixture should export chat hooks`);
      if (!behaviorHooks) continue;
      appendChatPanel(behaviorRuntime, '<unknown>', '[Party]', behaviorCase.message, false);
      behaviorHooks.scanChatMessages();
      assertEqual(behaviorHooks.getChatMessages().length, 0, `${behaviorCase.label} should delay an unresolved sender on the first scan`);
      assertEqual(behaviorRuntime.dispatches.length, 0, `${behaviorCase.label} should not dispatch before its bounded retry window`);
      assertEqual(lastScheduledDelay(behaviorRuntime), 0.1, `${behaviorCase.label} should keep fast polling while delayed`);
      for (let i = 0; i < 8 && behaviorHooks.getChatMessages().length === 0; i += 1) behaviorHooks.scanChatMessages();
      const behaviorMessages = behaviorHooks.getChatMessages();
      assertEqual(behaviorMessages.length, 1, `${behaviorCase.label} should dispatch after bounded unknown-sender delay`);
      assertEqual(behaviorMessages[0].sender, '<unknown>', `${behaviorCase.label} should dispatch with the unresolved sender marker`);
      assertEqual(behaviorMessages[0].message, behaviorCase.message, `${behaviorCase.label} should preserve its wire message`);
      assertEqual(behaviorRuntime.dispatches.length, 1, `${behaviorCase.label} should emit exactly one bridged dispatch`);
      const behaviorPayload = parseDispatchPayload(behaviorRuntime.dispatches[0]);
      if (behaviorPayload) {
        assertEqual(behaviorPayload.event, 'PokerChatMessage', `${behaviorCase.label} should dispatch a chat-message event`);
        assertEqual(behaviorPayload.sender, '<unknown>', `${behaviorCase.label} payload should preserve the unresolved sender marker`);
        assertEqual(behaviorPayload.message, behaviorCase.message, `${behaviorCase.label} payload should preserve its wire message`);
      }
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

    const bluffDirectFamilies = [
      { label: 'bd1-play', message: 'bd1 p deadbeef 1 01', isSelf: false, dispatchOnFirstScan: true },
      { label: 'bd1-shoot', message: 'bd1 r deadbeef 2', isSelf: false, dispatchOnFirstScan: true },
      { label: 'bd1-challenge', message: 'bd1 c deadbeef 1', isSelf: false, dispatchOnFirstScan: true },
      { label: 'bd1-start', message: 'bd1 s deadbeef 6334fc34', isSelf: false, dispatchOnFirstScan: false },
      { label: 'bd1-end', message: 'bd1 e deadbeef', isSelf: false, dispatchOnFirstScan: false },
    ];
    for (const familyCase of bluffDirectFamilies) {
      const familyRuntime = createChatRuntime();
      const familyHooks = familyRuntime.sandbox.__PokerChatDebugTestHooks;
      const familyRow = appendChatPanel(familyRuntime, '<unknown>', '[Party]', familyCase.message, familyCase.isSelf);
      familyHooks.modules.ChatBridgeIntake.scanOnce();
      if (familyCase.dispatchOnFirstScan) {
        assertEqual(familyHooks.getChatMessages().length, 1, `${familyCase.label} unknown sender should dispatch on its first scan`);
        assertEqual(familyRuntime.dispatches.length, 1, `${familyCase.label} unknown sender should emit one first-scan bridge event`);
        const familyPayload = parseDispatchPayload(familyRuntime.dispatches[0]);
        if (familyPayload) {
          assertEqual(familyPayload.sender, '<unknown>', `${familyCase.label} first-scan payload should preserve raw unknown sender`);
          assertEqual(familyPayload.message, familyCase.message, `${familyCase.label} first-scan payload should preserve the exact command`);
        }
      } else {
        assertEqual(familyHooks.getChatMessages().length, 0, `${familyCase.label} unknown sender should wait for stable sender resolution`);
        assertEqual(familyRuntime.dispatches.length, 0, `${familyCase.label} unknown sender should not dispatch on its first scan`);
        familyRow.senderLabel.text = 'Stable Leader';
        familyHooks.modules.ChatBridgeIntake.scanOnce();
        assertEqual(familyHooks.getChatMessages().length, 1, `${familyCase.label} should dispatch once after sender stabilization`);
        assertEqual(familyHooks.getChatMessages()[0].sender, 'Stable Leader', `${familyCase.label} should use the stabilized sender`);
        assertEqual(familyRuntime.dispatches.length, 1, `${familyCase.label} should emit exactly one stabilized bridge event`);
      }
    }

    const bluffStableAuthorityMessages = [
      'bd1 s deadbeef 6334fc34',
      'bd1 e deadbeef',
      '[party leave] poker party pbd1 bd1 deadbeef 1',
    ];
    for (const message of bluffStableAuthorityMessages) {
      for (const isSelf of [false, true]) {
        const authorityRuntime = createChatRuntime();
        const authorityHooks = authorityRuntime.sandbox.__PokerChatDebugTestHooks;
        const authorityRow = appendChatPanel(authorityRuntime, '<unknown>', '[Party]', message, isSelf);
        authorityHooks.modules.ChatBridgeIntake.scanOnce();
        assertEqual(authorityHooks.getChatMessages().length, 0, `${message} unknown ${isSelf ? 'self' : 'remote'} row should wait on its first scan`);
        for (let i = 0; i < 7; i += 1) authorityHooks.modules.ChatBridgeIntake.scanOnce();
        assertEqual(authorityHooks.getChatMessages().length, 0, `${message} unknown ${isSelf ? 'self' : 'remote'} row should remain pending until sender stabilization`);
        authorityRow.senderLabel.text = 'Stable Bluff Leader';
        authorityHooks.modules.ChatBridgeIntake.scanOnce();
        assertEqual(authorityHooks.getChatMessages().length, 1, `${message} should dispatch once after ${isSelf ? 'self' : 'remote'} sender stabilization`);
        assertEqual(authorityHooks.getChatMessages()[0].sender, 'Stable Bluff Leader', `${message} should preserve the stabilized sender`);
        assertEqual(authorityRuntime.dispatches.length, 1, `${message} should emit one stabilized bridge event`);
      }
    }

    const malformedScopedLeaveRuntime = createChatRuntime();
    const malformedScopedLeaveHooks = malformedScopedLeaveRuntime.sandbox.__PokerChatDebugTestHooks;
    appendChatPanel(
      malformedScopedLeaveRuntime,
      '<unknown>',
      '[Party]',
      '[party leave] poker party pbd1 bd1 deadbeef 1 extra',
      true,
    );
    malformedScopedLeaveHooks.modules.ChatBridgeIntake.scanOnce();
    assertEqual(malformedScopedLeaveHooks.getChatMessages().length, 1, 'extra-token scoped leave should fall back to ordinary party-leave classification');
    assertEqual(malformedScopedLeaveRuntime.dispatches.length, 1, 'extra-token scoped leave should dispatch once instead of entering strict Bluff authority wait');

    const ttlRuntime = createChatRuntime();
    const ttlHooks = ttlRuntime.sandbox.__PokerChatDebugTestHooks;
    const ttlUntil = ttlRuntime.clock.now() + 1000;
    ttlHooks.handleClientOutput(JSON.stringify({ event: 'BluffDeckFastPollRequest', until: ttlUntil }));
    assertEqual(ttlRuntime.config.TableGameFastPollUntil, ttlUntil, 'BluffDeckFastPollRequest should update only the bridge-local fast-poll TTL');
    ttlHooks.scanChatMessages();
    assertEqual(lastScheduledDelay(ttlRuntime), 0.1, 'active Bluff fast-poll TTL should select the existing 0.1-second recurrence');
    assertEqual(ttlRuntime.schedules.length, 1, 'fast-poll request should leave exactly one recurring scanner schedule');
    for (let i = 0; i < 9; i += 1) advanceScheduledTime(ttlRuntime, 100);
    assertEqual(lastScheduledDelay(ttlRuntime), 0.1, 'fast-poll recurrence should remain 0.1 seconds before TTL expiry');
    advanceScheduledTime(ttlRuntime, 100);
    assertEqual(lastScheduledDelay(ttlRuntime), 0.5, 'expired Bluff fast-poll TTL should return the sole scanner recurrence to 0.5 seconds');
    assertEqual(ttlRuntime.schedules.length, 1, 'TTL expiry should retain one scanner recurrence rather than creating a second loop');
    const ttlBeforeInvalid = ttlRuntime.config.TableGameFastPollUntil;
    ttlHooks.handleClientOutput(JSON.stringify({ event: 'BluffDeckFastPollRequest', until: ttlRuntime.clock.now() - 1 }));
    assertEqual(ttlRuntime.config.TableGameFastPollUntil, ttlBeforeInvalid, 'past Bluff fast-poll requests should be rejected');
    ttlHooks.handleClientOutput(JSON.stringify({ event: 'BluffDeckFastPollRequest', until: 'not-a-time' }));
    assertEqual(ttlRuntime.config.TableGameFastPollUntil, ttlBeforeInvalid, 'non-finite Bluff fast-poll requests should be rejected');
    const queuedActivityRuntime = createChatRuntime();
    const queuedActivityHooks = queuedActivityRuntime.sandbox.__PokerChatDebugTestHooks;
    queuedActivityHooks.handleClientOutput(JSON.stringify({
      event: 'PokerChatSendRequest',
      message: 'bd1 p deadbeef 1 01',
      requestId: 'bd1:deadbeef:1:ttl-queue',
      source: 'bluff-deck',
    }));
    assert(
      queuedActivityRuntime.config.TableGameFastPollUntil > queuedActivityRuntime.clock.now(),
      'queueing a classified bd1 message should extend the bridge-local fast-poll TTL',
    );
    const consumedActivityRuntime = createChatRuntime();
    const consumedActivityHooks = consumedActivityRuntime.sandbox.__PokerChatDebugTestHooks;
    appendChatPanel(consumedActivityRuntime, 'Abrams', '[Party]', 'bd1 c deadbeef 1', false);
    consumedActivityHooks.modules.ChatBridgeIntake.scanOnce();
    assert(
      consumedActivityRuntime.config.TableGameFastPollUntil > consumedActivityRuntime.clock.now(),
      'consuming a classified bd1 message should extend the bridge-local fast-poll TTL',
    );

    const bluffSnapshotRuntime = createChatRuntime();
    const bluffSnapshotHooks = bluffSnapshotRuntime.sandbox.__PokerChatDebugTestHooks;
    const freshBluffMessage = 'bd1 p deadbeef 1 01';
    appendChatPanel(bluffSnapshotRuntime, 'Abrams', '[Party]', freshBluffMessage, false);
    bluffSnapshotHooks.handleClientOutput(JSON.stringify({ event: 'PokerChatSnapshotRequest', source: 'bluff-validator' }));
    const bluffSnapshotPayload = bluffSnapshotRuntime.dispatches
      .map(parseDispatchPayload)
      .find((payload) => payload && payload.event === 'PokerChatMessage' && payload.action === 'snapshot');
    assert(bluffSnapshotPayload, 'chat snapshot request should dispatch a Bluff snapshot');
    const freshBluffRecord = (bluffSnapshotPayload && bluffSnapshotPayload.messages || [])
      .find((record) => record && record.message === freshBluffMessage);
    assert(freshBluffRecord, 'snapshot scan-before-snapshot path should include a freshly visible bd1 row');
    if (freshBluffRecord) {
      assertEqual(freshBluffRecord.sender, 'Abrams', 'fresh bd1 snapshot row should preserve sender');
      assertEqual(freshBluffRecord.message, freshBluffMessage, 'fresh bd1 snapshot row should preserve exact command text');
    }

    function bluffSendStatuses(runtime, requestId) {
      return runtime.dispatches
        .filter((dispatch) => dispatch && dispatch.name === 'ClientUI_FireOutput')
        .map(parseDispatchPayload)
        .filter((payload) => payload && payload.event === 'BluffDeckSendStatus' && payload.requestId === requestId);
    }
    const submittedBluffRuntime = createChatRuntime();
    const submittedBluffHooks = submittedBluffRuntime.sandbox.__PokerChatDebugTestHooks;
    const submittedTarget = submittedBluffRuntime.panels.root.FindChildTraverse('ChatTargetLabel');
    if (submittedTarget) submittedTarget.text = 'TEAM';
    const submittedRequestId = 'bd1:deadbeef:1:submitted';
    const submittedMessage = 'bd1 p deadbeef 1 01';
    clearDomWrites(submittedBluffRuntime);
    submittedBluffHooks.handleClientOutput(JSON.stringify({
      event: 'PokerChatSendRequest',
      message: submittedMessage,
      requestId: submittedRequestId,
      source: 'bluff-deck',
    }));
    advanceScheduledTime(submittedBluffRuntime, 100);
    advanceScheduledTime(submittedBluffRuntime, 100);
    const submittedStatuses = bluffSendStatuses(submittedBluffRuntime, submittedRequestId);
    assertEqual(submittedStatuses.length, 1, 'identity-bearing Bluff queue item should emit submitted exactly once');
    assertEqual(submittedStatuses[0] && submittedStatuses[0].message, submittedMessage, 'submitted status should preserve Bluff command text');
    const submittedWrites = takeDomWrites(submittedBluffRuntime);
    assert(
      submittedWrites.some((write) => write && write.id === 'ChatInput' && write.after === submittedMessage),
      'Bluff submission should use the reliable stock ChatInput lifecycle',
    );
    assert(
      submittedWrites.some((write) => write && write.id === 'ChatInput' && write.after === ''),
      'reliable Bluff submission should clear ChatInput after the stock submit event',
    );

    const failedBluffRuntime = createChatRuntime();
    const failedBluffHooks = failedBluffRuntime.sandbox.__PokerChatDebugTestHooks;
    const failedRequestId = 'bd1:deadbeef:1:failed';
    failedBluffHooks.handleClientOutput(JSON.stringify({
      event: 'PokerChatSendRequest',
      message: 'bd1 p deadbeef 1 01',
      requestId: failedRequestId,
      source: 'bluff-deck',
    }));
    drainDueScheduledCallbacks(failedBluffRuntime, 64);
    drainScheduledCallbacks(failedBluffRuntime, 64);
    const failedStatuses = bluffSendStatuses(failedBluffRuntime, failedRequestId);
    assertEqual(failedStatuses.length, 1, 'identity-bearing Bluff queue timeout should emit failed exactly once');
    assertEqual(failedStatuses[0] && failedStatuses[0].status, 'failed', 'unready stock sender should report failed status');

    const cancellationRuntime = createChatRuntime();
    const cancellationHooks = cancellationRuntime.sandbox.__PokerChatDebugTestHooks;
    const cancellationTarget = cancellationRuntime.panels.root.FindChildTraverse('ChatTargetLabel');
    if (cancellationTarget) cancellationTarget.text = '#citadel_chat_placeholder';
    const unrelatedPokerMessage = 'check';
    const cancelledBluffMessage = 'bd1 p deadbeef 1 01';
    const cancelledRequestId = 'bd1:deadbeef:1:cancelled';
    cancellationHooks.handleClientOutput(JSON.stringify({
      event: 'PokerChatSendRequest',
      message: unrelatedPokerMessage,
      source: 'poker',
    }));
    cancellationHooks.handleClientOutput(JSON.stringify({
      event: 'PokerChatSendRequest',
      message: cancelledBluffMessage,
      requestId: cancelledRequestId,
      source: 'bluff-deck',
    }));
    cancellationHooks.handleClientOutput(JSON.stringify({
      event: 'BluffDeckSendCancelRequest',
      requestId: cancelledRequestId,
    }));
    const cancelledStatuses = bluffSendStatuses(cancellationRuntime, cancelledRequestId);
    assertEqual(cancelledStatuses.length, 1, 'identity-bearing Bluff cancellation should emit cancelled exactly once');
    assertEqual(cancelledStatuses[0] && cancelledStatuses[0].status, 'cancelled', 'Bluff cancellation should report cancelled status');
    if (cancellationTarget) cancellationTarget.text = 'TEAM';
    drainScheduledCallbacks(cancellationRuntime, 16);
    const cancellationSubmissions = cancellationRuntime.dispatches
      .filter((event) => event.name === 'CitadelChatInputSubmitted')
      .map((event) => String(event.payloadTextAtDispatch || ''));
    assertEqual(JSON.stringify(cancellationSubmissions), JSON.stringify([unrelatedPokerMessage]), 'cancelling a Bluff queue entry must not remove or reorder an unrelated Poker queue item');
    assertEqual(bluffSendStatuses(cancellationRuntime, cancelledRequestId).length, 1, 'cancelled Bluff queue entry must never submit after cancellation');
  const eligibilityRuntime = createMenuRuntime();
  const eligibilityHooks = eligibilityRuntime.sandbox.__PokerEscapeMenuTestHooks;
  seedPartyForReady(eligibilityHooks, ['Host', 'Guest'], 'peligibility');
  eligibilityHooks.handleReadyEvent(JSON.stringify({ event: 'PokerReadySeatsChanged', action: 'snapshot', seats: [
    { key: 'host', name: 'Host', readyAt: 1 },
    { key: 'guest', name: 'Guest', readyAt: 2 },
  ], revision: 2 }));
  eligibilityHooks.modules.TableRenderer.render();
  assertEqual(runtimeButtonEnabled(eligibilityRuntime, 'PokerStartButton'), true, 'two ready party players should enable the rendered start button');

  const consumeRuntime = createChatRuntime();
  const consumeHooks = consumeRuntime.sandbox.__PokerChatDebugTestHooks;
  assert(consumeHooks, 'consume-row chat intake behavior hooks should be exported');
  if (consumeHooks) {
    appendChatPanel(consumeRuntime, 'Host', '[Party]', '[party leader] poker party pconsume', false);
    appendChatPanel(consumeRuntime, 'Guest', '[Party]', '[party join] poker party pconsume', false);
    consumeHooks.modules.ChatBridgeIntake.scanOnce();
    assertEqual(consumeHooks.getChatMessages().length, 2, 'party leader and join rows should be consumed through the scanner');
    assertEqual(seatCount(consumeRuntime.config), 2, 'party leader and join rows should create two ready seats through the scanner');
    const dispatchesBeforeLeave = consumeRuntime.dispatches.length;
    appendChatPanel(consumeRuntime, 'Guest', '[Party]', '[party leave] poker party pconsume', false);
    consumeHooks.modules.ChatBridgeIntake.scanOnce();
    assertEqual(seatCount(consumeRuntime.config), 1, 'party leave row should remove the matching ready seat through the scanner');
    const leavePayloads = consumeRuntime.dispatches.slice(dispatchesBeforeLeave).map(parseDispatchPayload).filter((payload) => payload && payload.event === 'PokerReadySeatsChanged');
    assertEqual(leavePayloads.length, 1, 'party leave consumeRow should dispatch one ready-seat payload');
    assertEqual(leavePayloads[0] && leavePayloads[0].event, 'PokerReadySeatsChanged', 'party leave payload should be a ready-seat change');
    assertEqual(leavePayloads[0] && leavePayloads[0].action, 'leave', 'party leave payload should use leave action');
  }

  const longBacklogRuntime = createChatRuntime();
  const longBacklogHooks = longBacklogRuntime.sandbox.__PokerChatDebugTestHooks;
  assert(longBacklogHooks && longBacklogHooks.modules.PokerMetrics, 'long-backlog chat scan metrics should be exposed');
  if (longBacklogHooks && longBacklogHooks.modules.PokerMetrics) {
    const backlogRows = 240;
    const maxRowsVisitedForTailScan = 32;
    const freshMessage = 'poker start slowbacklog hand 1 roster host~Host|guest~Guest';
    longBacklogHooks.modules.PokerMetrics.reset();
    for (let i = 0; i < backlogRows; i += 1) {
      appendChatPanel(longBacklogRuntime, `Backlog ${i}`, '[Team]', `old unrelated chat ${i}`, false);
    }
    appendChatPanel(longBacklogRuntime, 'Host', '[Party]', freshMessage, false);
    appendChatPanel(longBacklogRuntime, 'Tail Noise A', '[Team]', 'tail chatter a', false);
    appendChatPanel(longBacklogRuntime, 'Tail Noise B', '[Team]', 'tail chatter b', false);
    appendChatPanel(longBacklogRuntime, 'Tail Noise C', '[Team]', 'tail chatter c', false);

    longBacklogHooks.modules.ChatBridgeIntake.scanOnce();
    const longBacklogMetrics = longBacklogHooks.modules.PokerMetrics.snapshot();
    const rowsVisited = longBacklogMetrics.counters.chatRowsVisited || 0;
    assert(
      rowsVisited > 0 && rowsVisited <= maxRowsVisitedForTailScan,
      `first chat scan with a long backlog should visit a bounded tail, saw ${rowsVisited} rows`,
    );
    const freshRecord = longBacklogHooks.getChatMessages().find((record) => record && record.message === freshMessage);
    assert(freshRecord, 'first bounded tail scan should consume the fresh poker row near the tail');
    if (freshRecord) {
      assertEqual(freshRecord.sender, 'Host', 'fresh poker row near the tail should preserve its sender');
      assertEqual(freshRecord.channel, '[Party]', 'fresh poker row near the tail should preserve its channel');
    }
    const freshPayload = longBacklogRuntime.dispatches
      .map(parseDispatchPayload)
      .find((payload) => payload && payload.event === 'PokerChatMessage' && payload.message === freshMessage);
    assert(freshPayload, 'first bounded tail scan should dispatch the fresh poker row promptly');
  }

  const replaceSnapshotMenu = createMenuRuntime();
  const replaceSnapshotHooks = replaceSnapshotMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(replaceSnapshotHooks, 'ready snapshot replace-not-merge runtime should export menu hooks');
  if (replaceSnapshotHooks) {
    replaceSnapshotHooks.seedPartyForTest([
      { key: 'old-host', name: 'Old Host' },
      { key: 'old-guest', name: 'Old Guest' },
      { key: 'new-host', name: 'New Host' },
    ], 'preplace', 'leader');
    replaceSnapshotHooks.handleReadyEvent(JSON.stringify({
      event: 'PokerReadySeatsChanged',
      action: 'snapshot',
      reason: 'validator replace first',
      revision: 1,
      count: 2,
      seats: [
        { key: 'old-host', name: 'Old Host' },
        { key: 'old-guest', name: 'Old Guest' },
      ],
    }));
    assertEqual(seatCount(replaceSnapshotMenu.config), 2, 'ready snapshot replace-not-merge setup should seed two old seats');
    replaceSnapshotHooks.handleReadyEvent(JSON.stringify({
      event: 'PokerReadySeatsChanged',
      action: 'snapshot',
      reason: 'validator replace second',
      revision: 2,
      count: 1,
      seats: [{ key: 'new-host', name: 'New Host' }],
    }));
    const replacedSeats = replaceSnapshotMenu.config.PokerReadySeats || {};
    assertEqual(seatCount(replaceSnapshotMenu.config), 1, 'ready snapshot replace-not-merge should replace old seats with the second snapshot');
    assert(replacedSeats['new-host'], 'ready snapshot replace-not-merge should keep the new snapshot seat');
    assert(!replacedSeats['old-host'] && !replacedSeats['old-guest'], 'ready snapshot replace-not-merge should remove old seats absent from the second snapshot');
  }

  const partySnapshotChat = createChatRuntime();
  const partySnapshotMenu = createMenuRuntime();
  const partySnapshotChatHooks = partySnapshotChat.sandbox.__PokerChatDebugTestHooks;
  const partySnapshotMenuHooks = partySnapshotMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(partySnapshotChatHooks && partySnapshotMenuHooks, 'party snapshot runtimes should export hooks');
  if (partySnapshotChatHooks && partySnapshotMenuHooks) {
    const freshSnapshotMessage = '[party leader] poker party psnap';
    appendChatPanel(partySnapshotChat, 'Host', '[Party]', freshSnapshotMessage, false);
    partySnapshotChatHooks.handleClientOutput(JSON.stringify({ event: 'PokerChatSnapshotRequest', source: 'validator' }));
    const snapshotDispatch = partySnapshotChat.dispatches.map(parseDispatchPayload).find((payload) => payload && payload.event === 'PokerChatMessage' && payload.action === 'snapshot');
    assert(snapshotDispatch, 'chat snapshot request should dispatch a chat snapshot');
    const freshSnapshotRecord = (snapshotDispatch && snapshotDispatch.messages || []).find((record) => record && record.message === freshSnapshotMessage);
    assert(freshSnapshotRecord, 'direct chat snapshot request should scan and include a freshly appended Poker row');
    if (freshSnapshotRecord) {
      assertEqual(freshSnapshotRecord.sender, 'Host', 'direct chat snapshot should preserve the fresh row sender');
      assertEqual(freshSnapshotRecord.channel, '[Party]', 'direct chat snapshot should preserve the fresh row channel');
    }
    if (snapshotDispatch) {
      partySnapshotMenuHooks.handleReadyEvent(JSON.stringify(snapshotDispatch));
      assertEqual(partySnapshotMenu.config.PokerPartyState.leaderKey, 'host', 'fresh menu context should hydrate party leader state from chat snapshot replay');
      assertEqual(partySnapshotMenu.config.PokerPartyState.id, 'psnap', 'fresh menu context should hydrate party id from chat snapshot replay');
    }
  }

  const closedHostedMenu = createMenuRuntime({ testMode: false });
  const closedHostedHooks = closedHostedMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(closedHostedHooks && closedHostedHooks.modules && closedHostedHooks.modules.TableRenderer, 'closed hosted lobby replay runtime should export button-state hooks');
  if (closedHostedHooks && closedHostedHooks.modules && closedHostedHooks.modules.TableRenderer) {
    const liveLeader = { event: 'PokerChatMessage', action: 'append', seq: 1, sender: 'Host', channel: '[Party]', message: '[party leader] poker party pclosed-hosted', isSelf: false };
    closedHostedHooks.handleReadyEvent(JSON.stringify(liveLeader));
    assertEqual((closedHostedMenu.config.PokerPartyState || {}).id || '', '', 'closed live party leader payload should not hydrate party state before menu opens');
    closedHostedMenu.sandbox.PokerEscapeMenuToggle();
    closedHostedHooks.handleReadyEvent(JSON.stringify({
      event: 'PokerChatMessage',
      action: 'snapshot',
      reason: 'closed-open-replay',
      seq: 1,
      messages: [liveLeader],
    }));
    closedHostedHooks.modules.TableRenderer.render();
    const closedHostedParty = closedHostedMenu.config.PokerPartyState || {};
    assertEqual(closedHostedParty.id, 'pclosed-hosted', 'open-time chat snapshot should hydrate hosted lobby id seen while menu was closed');
    assertEqual(closedHostedParty.mode, 'none', 'open-time chat snapshot should keep foreign hosted lobby in discovered mode');
    closedHostedHooks.modules.TableRenderer.render();
    assertEqual(runtimeButtonEnabled(closedHostedMenu, 'PokerJoinPartyButton'), true, 'open-time hosted lobby replay should enable JOIN PARTY');
    assertEqual(runtimeButtonHidden(closedHostedMenu, 'PokerJoinPartyButton'), false, 'open-time hosted lobby replay should show JOIN PARTY');
  }

  const closedCancelledMenu = createMenuRuntime({ testMode: false });
  const closedCancelledHooks = closedCancelledMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(closedCancelledHooks && closedCancelledHooks.modules && closedCancelledHooks.modules.TableRenderer, 'closed cancelled lobby replay runtime should export button-state hooks');
  if (closedCancelledHooks && closedCancelledHooks.modules && closedCancelledHooks.modules.TableRenderer) {
    const cancelledLeader = { event: 'PokerChatMessage', action: 'append', seq: 1, sender: 'Host', channel: '[Party]', message: '[party leader] poker party pclosed-cancel', isSelf: false };
    const cancelledLeave = { event: 'PokerChatMessage', action: 'append', seq: 2, sender: 'Host', channel: '[Party]', message: '[party leave] poker party pclosed-cancel', isSelf: false };
    closedCancelledHooks.handleReadyEvent(JSON.stringify(cancelledLeader));
    closedCancelledHooks.handleReadyEvent(JSON.stringify(cancelledLeave));
    assertEqual((closedCancelledMenu.config.PokerPartyState || {}).id || '', '', 'closed live cancelled lobby payloads should not hydrate party state before menu opens');
    closedCancelledMenu.sandbox.PokerEscapeMenuToggle();
    closedCancelledHooks.handleReadyEvent(JSON.stringify({
      event: 'PokerChatMessage',
      action: 'snapshot',
      reason: 'closed-open-cancel-replay',
      seq: 2,
      messages: [cancelledLeader, cancelledLeave],
    }));
    closedCancelledHooks.modules.TableRenderer.render();
    const closedCancelledParty = closedCancelledMenu.config.PokerPartyState || {};
    assert(
      !(closedCancelledParty.id === 'pclosed-cancel' && closedCancelledParty.mode === 'none'),
      `open-time cancelled hosted lobby replay should not keep the expired lobby joinable: ${JSON.stringify(closedCancelledParty)}`,
    );
    closedCancelledHooks.modules.TableRenderer.render();
    assertEqual(runtimeButtonEnabled(closedCancelledMenu, 'PokerJoinPartyButton'), false, 'open-time cancelled hosted lobby replay should not enable JOIN PARTY');
    assertEqual(runtimeButtonHidden(closedCancelledMenu, 'PokerJoinPartyButton'), true, 'open-time cancelled hosted lobby replay should hide JOIN PARTY');
  }

  const routedHostedChat = createChatRuntime();
  const routedHostedMenu = createMenuRuntime({ testMode: false });
  const routedHostedChatHooks = routedHostedChat.sandbox.__PokerChatDebugTestHooks;
  const routedHostedHooks = routedHostedMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(routedHostedChatHooks && routedHostedHooks && routedHostedHooks.modules && routedHostedHooks.modules.TableRenderer, 'routed closed hosted lobby replay should export hooks');
  if (routedHostedChatHooks && routedHostedHooks && routedHostedHooks.modules && routedHostedHooks.modules.TableRenderer) {
    appendChatPanel(routedHostedChat, 'Host', '[Party]', '[party leader] poker party prouted-closed-hosted', false);
    const liveHostedPayloads = routedHostedChat.dispatches.map(parseDispatchPayload).filter((payload) => payload && payload.event === 'PokerChatMessage' && payload.action !== 'snapshot');
    for (const payload of liveHostedPayloads) routedHostedHooks.handleReadyEvent(JSON.stringify(payload));
    assertEqual((routedHostedMenu.config.PokerPartyState || {}).id || '', '', 'closed routed live party leader payload should not hydrate party state before menu opens');
    const routedRequestStart = routedHostedMenu.dispatches.length;
    routedHostedMenu.sandbox.PokerEscapeMenuToggle();
    routeMenuChatSnapshotRequests(routedHostedMenu, routedHostedChat, routedRequestStart);
    const routedHostedParty = routedHostedMenu.config.PokerPartyState || {};
    assertEqual(routedHostedParty.id, 'prouted-closed-hosted', 'actual open-time chat snapshot request should hydrate hosted lobby id seen while menu was closed');
    assertEqual(routedHostedParty.mode, 'none', 'actual open-time chat snapshot request should keep foreign hosted lobby discovered');
    routedHostedHooks.modules.TableRenderer.render();
    assertEqual(runtimeButtonEnabled(routedHostedMenu, 'PokerJoinPartyButton'), true, 'actual open-time hosted lobby replay should enable JOIN PARTY');
    assertEqual(runtimeButtonHidden(routedHostedMenu, 'PokerJoinPartyButton'), false, 'actual open-time hosted lobby replay should show JOIN PARTY');
  }

  const routedCancelledChat = createChatRuntime();
  const routedCancelledMenu = createMenuRuntime({ testMode: false });
  const routedCancelledChatHooks = routedCancelledChat.sandbox.__PokerChatDebugTestHooks;
  const routedCancelledHooks = routedCancelledMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(routedCancelledChatHooks && routedCancelledHooks && routedCancelledHooks.modules && routedCancelledHooks.modules.TableRenderer, 'routed closed cancelled lobby replay should export hooks');
  if (routedCancelledChatHooks && routedCancelledHooks && routedCancelledHooks.modules && routedCancelledHooks.modules.TableRenderer) {
    appendChatPanel(routedCancelledChat, 'Host', '[Party]', '[party leader] poker party prouted-closed-cancel', false);
    appendChatPanel(routedCancelledChat, 'Host', '[Party]', '[party leave] poker party prouted-closed-cancel', false);
    const liveCancelledPayloads = routedCancelledChat.dispatches.map(parseDispatchPayload).filter((payload) => payload && payload.event === 'PokerChatMessage' && payload.action !== 'snapshot');
    for (const payload of liveCancelledPayloads) routedCancelledHooks.handleReadyEvent(JSON.stringify(payload));
    assertEqual((routedCancelledMenu.config.PokerPartyState || {}).id || '', '', 'closed routed live cancelled lobby payloads should not hydrate party state before menu opens');
    const routedCancelRequestStart = routedCancelledMenu.dispatches.length;
    routedCancelledMenu.sandbox.PokerEscapeMenuToggle();
    routeMenuChatSnapshotRequests(routedCancelledMenu, routedCancelledChat, routedCancelRequestStart);
    const routedCancelledParty = routedCancelledMenu.config.PokerPartyState || {};
    assert(
      !(routedCancelledParty.id === 'prouted-closed-cancel' && routedCancelledParty.mode === 'none'),
      `actual open-time cancelled hosted lobby replay should not keep the expired lobby joinable: ${JSON.stringify(routedCancelledParty)}`,
    );
    routedCancelledHooks.modules.TableRenderer.render();
    assertEqual(runtimeButtonEnabled(routedCancelledMenu, 'PokerJoinPartyButton'), false, 'actual open-time cancelled hosted lobby replay should not enable JOIN PARTY');
    assertEqual(runtimeButtonHidden(routedCancelledMenu, 'PokerJoinPartyButton'), true, 'actual open-time cancelled hosted lobby replay should hide JOIN PARTY');
  }

  const repeatedSnapshotChat = createChatRuntime();
  const repeatedSnapshotMenu = createMenuRuntime({ testMode: false });
  const repeatedSnapshotChatHooks = repeatedSnapshotChat.sandbox.__PokerChatDebugTestHooks;
  const repeatedSnapshotHooks = repeatedSnapshotMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(repeatedSnapshotChatHooks && repeatedSnapshotHooks && repeatedSnapshotHooks.modules && repeatedSnapshotHooks.modules.TableRenderer, 'repeated chat snapshot replay should export hooks');
  if (repeatedSnapshotChatHooks && repeatedSnapshotHooks && repeatedSnapshotHooks.modules && repeatedSnapshotHooks.modules.TableRenderer) {
    appendChatPanel(repeatedSnapshotChat, 'Host', '[Party]', '[party leader] poker party prepeated-snapshot', false);
    const repeatedSnapshotStart = repeatedSnapshotChat.dispatches.length;
    repeatedSnapshotChatHooks.handleClientOutput(JSON.stringify({ event: 'PokerChatSnapshotRequest', source: 'validator-one' }));
    repeatedSnapshotChatHooks.handleClientOutput(JSON.stringify({ event: 'PokerChatSnapshotRequest', source: 'validator-two' }));
    const repeatedSnapshots = repeatedSnapshotChat.dispatches
      .slice(repeatedSnapshotStart)
      .map(parseDispatchPayload)
      .filter((payload) => payload && payload.event === 'PokerChatMessage' && payload.action === 'snapshot');
    assertEqual(repeatedSnapshots.length, 2, 'two explicit chat snapshot requests should produce two chat snapshots');
    repeatedSnapshotMenu.sandbox.PokerEscapeMenuToggle();
    const seqBeforeReplay = snapshot(repeatedSnapshotHooks).processedChatSeq;
    repeatedSnapshotHooks.handleReadyEvent(JSON.stringify(repeatedSnapshots[0]));
    const seqAfterFirstReplay = snapshot(repeatedSnapshotHooks).processedChatSeq;
    repeatedSnapshotHooks.handleReadyEvent(JSON.stringify(repeatedSnapshots[1]));
    const seqAfterSecondReplay = snapshot(repeatedSnapshotHooks).processedChatSeq;
    repeatedSnapshotHooks.modules.TableRenderer.render();
    const repeatedParty = repeatedSnapshotMenu.config.PokerPartyState || {};
    assert(seqAfterFirstReplay >= seqBeforeReplay, 'first repeated chat snapshot should not move processedChatSeq backwards');
    assert(seqAfterSecondReplay >= seqAfterFirstReplay, 'second repeated chat snapshot should leave processedChatSeq monotonic');
    assertEqual(repeatedParty.id, 'prepeated-snapshot', 'repeated chat snapshots should hydrate one discovered party id');
    assertEqual(repeatedParty.mode, 'none', 'repeated chat snapshots should keep the foreign lobby joinable');
    assertEqual(Object.keys(repeatedParty.members || {}).filter((key) => key === 'host').length, 1, 'repeated chat snapshots should keep one Host party member');
    assertEqual((repeatedParty.order || []).filter((key) => key === 'host').length, 1, 'repeated chat snapshots should keep one Host party order entry');
    repeatedSnapshotHooks.modules.TableRenderer.render();
    assertEqual(runtimeButtonEnabled(repeatedSnapshotMenu, 'PokerJoinPartyButton'), true, 'repeated chat snapshots should keep JOIN PARTY enabled once');
    assertEqual(runtimeButtonHidden(repeatedSnapshotMenu, 'PokerJoinPartyButton'), false, 'repeated chat snapshots should keep JOIN PARTY visible once');
    assertEqual(seatCount(repeatedSnapshotMenu.config), 0, 'repeated chat snapshots should not create duplicate ready seats');
  }

  const replayChat = createChatRuntime();

  const hostCloseMenu = createMenuRuntime({ testMode: false });
  const hostCloseHooks = hostCloseMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(hostCloseHooks && hostCloseHooks.modules && hostCloseHooks.modules.TableRenderer, 'host close cancellation runtime should export button-state hooks');
  if (hostCloseHooks && hostCloseHooks.modules && hostCloseHooks.modules.TableRenderer) {
    hostCloseMenu.sandbox.PokerEscapeMenuToggle();
    const hostCloseChatTarget = hostCloseMenu.panels.root.FindChildTraverse('ChatTargetLabel');
    if (hostCloseChatTarget) hostCloseChatTarget.text = 'TEAM';
    hostCloseHooks.handleReadyEvent(JSON.stringify({
      event: 'PokerChatMessage',
      action: 'append',
      seq: 1,
      sender: 'Host',
      channel: '[Party]',
      message: '[party leader] poker party phost-close-cancel',
      isSelf: true,
    }));
    drainScheduledCallbacks(hostCloseMenu, 64);
    assertEqual((hostCloseMenu.config.PokerPartyState || {}).id, 'phost-close-cancel', 'host close setup should hydrate local hosted party id');
    const closeDispatchStart = hostCloseMenu.dispatches.length;
    hostCloseMenu.sandbox.PokerEscapeMenuToggle();
    drainScheduledCallbacks(hostCloseMenu, 64);
    const closeMessages = hostCloseMenu.dispatches
      .slice(closeDispatchStart)
      .filter((event) => event.name === 'ClientUI_FireOutput')
      .map(parseDispatchPayload)
      .filter((payload) => payload && payload.event === 'PokerChatSendRequest')
      .map((payload) => String(payload.message || ''));
    assert(
      closeMessages.includes('[party leave] poker party phost-close-cancel'),
      `closing a hosted lobby should announce [party leave] so closed clients do not join an expired lobby: ${closeMessages.join('|') || '<none>'}`,
    );
    assertEqual((hostCloseMenu.config.PokerPartyState || {}).id || '', '', 'closing a hosted lobby should clear local hosted party state');
  }
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
    replayChatHooks.modules.ChatBridgeIntake.scanOnce();
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
    const immediateGame = snapshot(replayImmediateHooks).game;
    const snapshotGame = snapshot(replaySnapshotHooks).game;
    assert(immediateGame && snapshotGame, 'party/start snapshot replay should start a game on both paths');
    if (immediateGame && snapshotGame) {
      assertEqual(snapshotGame.seed, immediateGame.seed, 'party/start snapshot replay game seed');
      assertEqual(snapshotGame.handNumber, immediateGame.handNumber, 'party/start snapshot replay hand number');
      assertEqual(snapshotGame.players.map((player) => `${player.key}:${player.name}`).join('|'), immediateGame.players.map((player) => `${player.key}:${player.name}`).join('|'), 'party/start snapshot replay ordered player identities');
    }
  }

  const cancelledReplayMenu = createMenuRuntime();
  const cancelledReplayHooks = cancelledReplayMenu.sandbox.__PokerEscapeMenuTestHooks;
  assert(cancelledReplayHooks && cancelledReplayHooks.modules && cancelledReplayHooks.modules.TableRenderer, 'cancelled party snapshot replay runtime should export button-state hooks');
  if (cancelledReplayHooks && cancelledReplayHooks.modules && cancelledReplayHooks.modules.TableRenderer) {
    const cancelledRoster = [
      { key: 'host', name: 'Host' },
      { key: 'guest', name: 'Guest' },
    ];
    const cancelledStart = cancelledReplayHooks.buildSynchronizedStartCommand('scancelled-replay', cancelledRoster, 1);
    cancelledReplayHooks.handleReadyEvent(JSON.stringify({
      event: 'PokerChatMessage',
      action: 'snapshot',
      reason: 'test',
      seq: 4,
      messages: [
        { event: 'PokerChatMessage', action: 'append', seq: 1, sender: 'Host', channel: '[Party]', message: '[party leader] poker party pcancelled-replay', isSelf: false },
        { event: 'PokerChatMessage', action: 'append', seq: 2, sender: 'Guest', channel: '[Party]', message: '[party join] poker party pcancelled-replay', isSelf: false },
        { event: 'PokerChatMessage', action: 'append', seq: 3, sender: 'Host', channel: '[Party]', message: cancelledStart, isSelf: false },
        { event: 'PokerChatMessage', action: 'append', seq: 4, sender: 'Host', channel: '[Party]', message: '[match end] poker party pcancelled-replay seed scancelled-replay hand 1', isSelf: false },
      ],
    }));
    cancelledReplayHooks.modules.TableRenderer.render();
    const cancelledParty = cancelledReplayMenu.config.PokerPartyState || {};
    assert(
      !(cancelledParty.id === 'pcancelled-replay' && cancelledParty.mode === 'discovered'),
      `cancelled open-time party snapshot replay should not preserve the stale ended party as discovered joinable state: ${JSON.stringify(cancelledParty)}`,
    );
    cancelledReplayHooks.modules.TableRenderer.render();
    assertEqual(runtimeButtonEnabled(cancelledReplayMenu, 'PokerJoinPartyButton'), false, 'cancelled open-time party snapshot replay should not enable JOIN PARTY');
    assertEqual(runtimeButtonHidden(cancelledReplayMenu, 'PokerJoinPartyButton'), true, 'cancelled open-time party snapshot replay should hide JOIN PARTY');
  }

  const prematureJoin = createMenuRuntime();
  prematureJoin.sandbox.PokerEscapeMenuJoinParty();
  assertEqual(
    snapshot(prematureJoin.sandbox.__PokerEscapeMenuTestHooks).status.text,
    'Looking for a [party leader] message. Click JOIN PARTY again if the host just pressed HOST PARTY.',
    'join before chat snapshot arrival should show the exact retry status',
  );
  assert(
    !prematureJoin.dispatches.some((dispatch) => String(dispatch.payload || '').includes('[party join]')),
    'join before chat snapshot arrival should not send a [party join] chat command',
  );

  const syncRuntime = createMenuRuntime();
  const syncHooks = syncRuntime.sandbox.__PokerEscapeMenuTestHooks;
  assert(typeof syncRuntime.sandbox.PokerEscapeMenuToggle === 'function', 'menu should expose the public toggle command');
  assert(typeof syncRuntime.sandbox.PokerEscapeMenuClose === 'function', 'menu should expose the public close command');
  if (typeof syncRuntime.sandbox.PokerEscapeMenuToggle === 'function' && typeof syncRuntime.sandbox.PokerEscapeMenuClose === 'function') {
    const syncDispatchStart = syncRuntime.dispatches.length;
    const syncScheduleStart = syncRuntime.schedules.length;
    syncRuntime.sandbox.PokerEscapeMenuToggle();
    syncRuntime.sandbox.PokerEscapeMenuClose();
    syncRuntime.sandbox.PokerEscapeMenuToggle();
    let snapshot = syncHooks.getStateSnapshot();
    assertEqual(snapshot.sync.waitingForReadySnapshot, true, 'repeated menu opens should keep waiting for ready snapshot');
    assertEqual(snapshot.sync.waitingForChatSnapshot, true, 'repeated menu opens should keep waiting for chat snapshot');
    const syncRequests = syncRuntime.dispatches.slice(syncDispatchStart).map(parseDispatchPayload);
    const readyRequestCount = syncRequests.filter((payload) => payload && payload.event === 'PokerReadySeatsRequest').length;
    const chatRequestCount = syncRequests.filter((payload) => payload && payload.event === 'PokerChatSnapshotRequest').length;
    assert(readyRequestCount <= 2, `repeated menu opens should not dispatch more than one immediate ready request per explicit open: ${readyRequestCount}`);
    assertEqual(chatRequestCount, 2, 'repeated menu opens should dispatch one chat snapshot request per explicit open');
    assert(
      syncRuntime.schedules.length - syncScheduleStart <= 10,
      `repeated menu opens should keep delayed snapshot callbacks bounded: ${syncRuntime.schedules.length - syncScheduleStart}`,
    );
    assertEqual((syncRuntime.config.PokerPartyState && syncRuntime.config.PokerPartyState.id) || '', '', 'repeated menu opens before snapshots should not apply duplicate party state');
    assertEqual(syncHooks.getStateSnapshot().game, null, 'repeated menu opens before snapshots should not create game state');
    syncHooks.handleReadyEvent(JSON.stringify({ event: 'PokerReadySeatsChanged', action: 'snapshot', seats: [], revision: 0 }));
    snapshot = syncHooks.getStateSnapshot();
    assertEqual(snapshot.sync.waitingForReadySnapshot, false, 'ready snapshot should clear the ready waiting flag');
    syncHooks.handleReadyEvent(JSON.stringify({ event: 'PokerChatMessage', action: 'snapshot', seq: 0, messages: [] }));
    snapshot = syncHooks.getStateSnapshot();
    assertEqual(snapshot.sync.waitingForChatSnapshot, false, 'chat snapshot should clear the chat waiting flag');
  }

  const unknownAuthority = createMenuRuntime();
  const unknownHooks = unknownAuthority.sandbox.__PokerEscapeMenuTestHooks;
  applyMenuRecord(unknownHooks, { sender: '<unknown>', message: '[party leader] poker party pbad', seq: 1 });
  applyMenuRecord(unknownHooks, { sender: '<unknown>', message: '[resume leader] poker resume rbad', seq: 2 });
  applyMenuRecord(unknownHooks, { sender: '<unknown>', message: 'poker start seed hand 1 roster abrams~Abrams|bebop~Bebop', seq: 3 });
  assert(!unknownAuthority.config.PokerPartyState || !unknownAuthority.config.PokerPartyState.leaderKey, 'unknown party leader row should be bridged but rejected by menu authority');
  assert(!unknownAuthority.config.PokerProgressState || !unknownAuthority.config.PokerProgressState.leaderKey, 'unknown resume leader row should be bridged but rejected by menu authority');
  assertEqual(snapshot(unknownHooks).game, null, 'unknown start row should not mutate State.game');

  const chatBridge = createChatRuntime();
  const menuBridge = createMenuRuntime();
  const bridgeChatHooks = chatBridge.sandbox.__PokerChatDebugTestHooks;
  const bridgeMenuHooks = menuBridge.sandbox.__PokerEscapeMenuTestHooks;
  assert(bridgeChatHooks, 'separate chat test hooks were not exported');
  assert(bridgeMenuHooks, 'separate menu test hooks were not exported');
  assert(chatBridge.config !== menuBridge.config, 'separate chat and menu contexts should not share CustomUIConfig objects');

  if (bridgeChatHooks && bridgeMenuHooks) {
    appendChatPanel(chatBridge, 'Dynamo', '[Team]', 'ready', false);
    appendChatPanel(chatBridge, 'Haze', '[Party]', 'join poker', false);
    bridgeChatHooks.modules.ChatBridgeIntake.scanOnce();
    assertEqual(seatCount(chatBridge.config), 2, 'separate chat context should store two ready seats');
    assertEqual(seatCount(menuBridge.config), 0, 'separate menu context should start with no ready seats');
    seedPartyForReady(bridgeMenuHooks, ['Dynamo', 'Haze'], 'pbridge-ready');

    for (const dispatch of chatBridge.dispatches) {
      bridgeMenuHooks.handleReadyEvent(dispatch.payload);
    }

    assertSameReadySeats(chatBridge.config, menuBridge.config, 'separate menu context should ingest chat ready payloads');

    const bridgeTarget = chatBridge.panels.root.FindChildTraverse('ChatTargetLabel');
    const bridgeInput = chatBridge.panels.root.FindChildTraverse('ChatInput');
    if (bridgeTarget) bridgeTarget.text = 'TEAM';
    const sendRequestStart = chatBridge.dispatches.length;
    const requestedMessage = '[party leader] poker party pbridge-send';
    bridgeChatHooks.handleClientOutput(JSON.stringify({ event: 'PokerChatSendRequest', message: requestedMessage, source: 'validator' }));
    drainScheduledCallbacks(chatBridge, 16);
    const bridgeSendEvents = chatBridge.dispatches.slice(sendRequestStart);
    const bridgeSubmit = bridgeSendEvents.find((event) => event.name === 'CitadelChatInputSubmitted');
    assert(bridgeSubmit, 'chat-context send request should submit through the stock ChatInput');
    if (bridgeSubmit) {
      assertEqual(bridgeSubmit.payloadId, 'ChatInput', 'chat-context send request should target #ChatInput');
      assertEqual(bridgeSubmit.payloadTextAtDispatch, requestedMessage, 'chat-context send request should preserve the command at submission');
    }
    assertEqual(bridgeInput && bridgeInput.text, '', 'chat-context send request should clear #ChatInput after submission');

    const queuedSendChat = createChatRuntime();
    const queuedSendHooks = queuedSendChat.sandbox.__PokerChatDebugTestHooks;
    const queuedTarget = queuedSendChat.panels.root.FindChildTraverse('ChatTargetLabel');
    if (queuedTarget) queuedTarget.text = '#citadel_chat_placeholder';
    queuedSendHooks.handleClientOutput(JSON.stringify({ event: 'PokerChatSendRequest', message: 'check', source: 'validator' }));
    queuedSendHooks.handleClientOutput(JSON.stringify({ event: 'PokerChatSendRequest', message: 'call $200', source: 'validator' }));
    assertEqual(
      queuedSendChat.dispatches.filter((event) => event.name === 'CitadelConCommand' && event.payload === 'say_chat_team').length,
      1,
      'queued chat requests should open stock chat once',
    );
    assertEqual(queuedSendChat.schedules.length, 1, 'queued chat requests should share one retry schedule');
    if (queuedTarget) queuedTarget.text = 'TEAM';
    drainScheduledCallbacks(queuedSendChat, 16);
    const queuedSubmissions = queuedSendChat.dispatches
      .filter((event) => event.name === 'CitadelChatInputSubmitted')
      .map((event) => String(event.payloadTextAtDispatch || ''));
    assertEqual(JSON.stringify(queuedSubmissions), JSON.stringify(['check', 'call $200']), 'queued chat requests should submit once in FIFO order');
    assertEqual(
      queuedSendChat.dispatches.filter((event) => event.name === 'CitadelConCommand' && event.payload === 'say_chat_team').length,
      2,
      'queued chat requests should reopen stock chat before each submission',
    );

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
