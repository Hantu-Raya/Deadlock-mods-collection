#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
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

function assertGreaterThan(actual, expected, message) {
  if (!(actual > expected)) {
    fail(`${message}: expected ${JSON.stringify(actual)} to be greater than ${JSON.stringify(expected)}`);
  }
}

function findPanel(runtime, id) {
  return runtime.panels.root.FindChildTraverse(id);
}

function panelText(panel) {
  return panel ? String(panel.text || '') : '';
}

function announcerText(runtime) {
  const titlePanel = findPanel(runtime, 'PokerAnnouncerTitle');
  const bodyPanel = findPanel(runtime, 'PokerAnnouncerBody');
  return {
    title: panelText(titlePanel),
    body: panelText(bodyPanel),
    combined: `${panelText(titlePanel)}\n${panelText(bodyPanel)}`,
  };
}

function assertAnnouncerIncludes(runtime, expectedParts, message) {
  const overlay = findPanel(runtime, 'PokerAnnouncerOverlay');
  const title = findPanel(runtime, 'PokerAnnouncerTitle');
  const body = findPanel(runtime, 'PokerAnnouncerBody');
  const text = announcerText(runtime).combined.toLowerCase();

  assert(overlay, `${message} should have a PokerAnnouncerOverlay panel`);
  assert(title, `${message} should have a PokerAnnouncerTitle panel`);
  assert(body, `${message} should have a PokerAnnouncerBody panel`);
  for (const part of expectedParts) {
    assert(text.includes(String(part).toLowerCase()), `${message} announcer should include ${part}: ${text || '<empty>'}`);
  }
}

function assertAnnouncerOmits(runtime, unexpectedParts, message) {
  const text = announcerText(runtime).combined.toLowerCase();
  for (const part of unexpectedParts) {
    assert(!text.includes(String(part).toLowerCase()), `${message} announcer should not include ${part}: ${text || '<empty>'}`);
  }
}


function hasClass(panel, className) {
  return !!(panel && panel.classes && panel.classes[className]);
}

function collectPanelTexts(panel, out) {
  if (!out) out = [];
  if (!panel || panel.deleted) return out;
  if (panel.text) out.push(String(panel.text));
  for (const child of panel.children || []) collectPanelTexts(child, out);
  return out;
}

function findDescendantsWithClass(panel, className, out) {
  const matches = out || [];
  if (!panel || panel.deleted) return matches;
  if (hasClass(panel, className)) matches.push(panel);
  for (const child of panel.children || []) findDescendantsWithClass(child, className, matches);
  return matches;
}

function firstDescendantWithClass(panel, className) {
  const matches = findDescendantsWithClass(panel, className, []);
  return matches.length ? matches[0] : null;
}

function renderedPlayerCards(runtime, playerName) {
  const playersList = findPanel(runtime, 'PokerPlayersList');
  const rows = findDescendantsWithClass(playersList, 'PokerPlayerRow', []);
  for (const row of rows) {
    const name = panelText(firstDescendantWithClass(row, 'PokerPlayerName'));
    if (name !== playerName) continue;
    const holeCards = firstDescendantWithClass(row, 'PokerHoleCards');
    return findDescendantsWithClass(holeCards, 'PokerCard', []).map((cardPanel) => {
      return panelText(firstDescendantWithClass(cardPanel, 'PokerCardRank')) +
        panelText(firstDescendantWithClass(cardPanel, 'PokerCardSuit'));
    });
  }
  return [];
}

function assertHookFunction(hooks, name, message) {
  const ok = !!hooks && typeof hooks[name] === 'function';
  assert(ok, `${message} should export ${name}`);
  return ok;
}

function hasPartySyncHooks(hooks, message) {
  let ok = true;
  for (const name of [
    'buildSynchronizedStartCommand',
    'encodeRoster',
    'decodeRoster',
    'getPartyRoster',
    'getStartGate',
  ]) {
    ok = assertHookFunction(hooks, name, message) && ok;
  }
  return ok;
}

function playerHoleCardKeys(game) {
  return game.players.map((player) => ({
    key: player.key,
    name: player.name,
    cards: player.cards.map(cardKey),
  }));
}

function playerIdentities(game) {
  return game.players.map((player) => ({ key: player.key, name: player.name }));
}

function assertSameSyncedGame(actual, expected, message) {
  assertEqual(actual.seed, expected.seed, `${message} seed`);
  assertEqual(JSON.stringify(playerIdentities(actual)), JSON.stringify(playerIdentities(expected)), `${message} ordered player identities`);
  assertEqual(JSON.stringify(playerHoleCardKeys(actual)), JSON.stringify(playerHoleCardKeys(expected)), `${message} player hole cards`);
  assertEqual(actual.pot, expected.pot, `${message} pot`);
  assertEqual(actual.currentBet, expected.currentBet, `${message} currentBet`);
  assertEqual(actual.handNumber, expected.handNumber, `${message} handNumber`);
  assertEqual(actual.smallBlindAmount, expected.smallBlindAmount, `${message} smallBlindAmount`);
  assertEqual(actual.bigBlindAmount, expected.bigBlindAmount, `${message} bigBlindAmount`);
  assertEqual(actual.minRaise, expected.minRaise, `${message} minRaise`);
  assertEqual(actual.lastRaise, expected.lastRaise, `${message} lastRaise`);
  assertEqual(actual.dealerIndex, expected.dealerIndex, `${message} dealerIndex`);
  assertEqual(actual.smallBlindIndex, expected.smallBlindIndex, `${message} smallBlindIndex`);
  assertEqual(actual.bigBlindIndex, expected.bigBlindIndex, `${message} bigBlindIndex`);
  assertEqual(actual.currentIndex, expected.currentIndex, `${message} currentIndex`);
}

function assertDiagnosticIncludesTurnContext(runtime, messageStart, previousStatus, senderName, currentName, phase, message) {
  const status = panelText(findPanel(runtime, 'PokerStatusLabel'));
  const parts = [];
  if (status && status !== previousStatus) parts.push(status);
  for (let i = messageStart; i < runtime.messages.length; i += 1) parts.push(runtime.messages[i]);
  const diagnostic = parts.join('\n').toLowerCase();

  assert(diagnostic.length > 0, `${message} should emit a visible status or console diagnostic`);
  assert(diagnostic.includes(String(senderName).toLowerCase()), `${message} diagnostic should include rejected sender (${senderName}): ${diagnostic || '<empty>'}`);
  assert(diagnostic.includes(String(currentName).toLowerCase()), `${message} diagnostic should include current actor (${currentName}): ${diagnostic || '<empty>'}`);
  assert(diagnostic.includes(String(phase).toLowerCase()), `${message} diagnostic should include current phase (${phase}): ${diagnostic || '<empty>'}`);
}

function assertDiagnosticContains(runtime, messageStart, previousStatus, expected, message) {
  const status = panelText(findPanel(runtime, 'PokerStatusLabel'));
  const parts = [];
  if (status && status !== previousStatus) parts.push(status);
  for (let i = messageStart; i < runtime.messages.length; i += 1) parts.push(runtime.messages[i]);
  const diagnostic = parts.join('\n').toLowerCase();
  assert(diagnostic.includes(String(expected).toLowerCase()), `${message} diagnostic should include ${expected}: ${diagnostic || '<empty>'}`);
}

function assertActiveGameControls(runtime, currentName, phase, expectedLabels, absentLabels, message) {
  const startButton = findPanel(runtime, 'PokerStartButton');
  const readyButton = findPanel(runtime, 'PokerReadyChatButton');
  const actions = findPanel(runtime, 'PokerActionButtons');
  const status = findPanel(runtime, 'PokerStatusLabel');
  const phaseLabel = findPanel(runtime, 'PokerPhaseLabel');
  const actionLabels = collectPanelTexts(actions, []).join('|');

  assert(hasClass(startButton, 'PokerHidden'), `${message} should hide the start button`);
  assert(hasClass(readyButton, 'PokerHidden'), `${message} should hide the ready-chat button`);
  assert(!hasClass(actions, 'PokerHidden'), `${message} should show action buttons`);
  assertGreaterThan(actions ? actions.GetChildCount() : 0, 0, `${message} should render action button children`);
  for (const label of expectedLabels || []) {
    assert(actionLabels.includes(label), `${message} should render ${label} action`);
  }
  for (const label of absentLabels || []) {
    assert(!actionLabels.includes(label), `${message} should not render illegal ${label} action`);
  }
  assert(panelText(status).toLowerCase().includes(String(currentName).toLowerCase()), `${message} status should expose the current actor`);
  assertEqual(panelText(phaseLabel), String(phase).toUpperCase(), `${message} phase label should expose the current phase`);
}

function assertObserverCurrentActorControls(runtime, currentName, expectedLabels, absentLabels, message) {
  const actions = findPanel(runtime, 'PokerActionButtons');
  const actionText = collectPanelTexts(actions, []).join('|');
  const waitingHint = `Waiting for ${currentName}`;

  assert(!hasClass(actions, 'PokerHidden'), `${message} should keep the action area visible for observers`);
  assertGreaterThan(actions ? actions.GetChildCount() : 0, 1, `${message} should render the waiting hint plus current actor choices`);
  assert(actionText.includes(waitingHint), `${message} should preserve the waiting hint for ${currentName}: ${actionText || '<empty>'}`);
  for (const label of expectedLabels || []) {
    assert(actionText.includes(label), `${message} should expose current actor ${label} option: ${actionText || '<empty>'}`);
  }
  for (const label of absentLabels || []) {
    assert(!actionText.includes(label), `${message} should not expose illegal ${label} option: ${actionText || '<empty>'}`);
  }
  assertReadOnlyActionButtons(runtime, expectedLabels, waitingHint, message);
}

function actionButtonPanels(runtime) {
  return findDescendantsWithClass(findPanel(runtime, 'PokerActionButtons'), 'PokerActionButton', [])
    .filter((panel) => panel.type === 'Button');
}

function assertReadOnlyActionButtons(runtime, expectedLabels, expectedHint, message) {
  const actions = findPanel(runtime, 'PokerActionButtons');
  const actionText = collectPanelTexts(actions, []).join('|');
  const buttons = actionButtonPanels(runtime);

  assert(!hasClass(actions, 'PokerHidden'), `${message} should keep the action area visible`);
  assertGreaterThan(buttons.length, 0, `${message} should render read-only action buttons`);
  if (expectedHint) {
    assert(
      actionText.toLowerCase().includes(String(expectedHint).toLowerCase()),
      `${message} should explain why actions are read-only: ${actionText || '<empty>'}`,
    );
  }
  for (const label of expectedLabels || []) {
    assert(actionText.includes(label), `${message} should show ${label} as a read-only legal option: ${actionText || '<empty>'}`);
  }
  for (const button of buttons) {
    const label = collectPanelTexts(button, []).join('|') || '<unlabeled>';
    assert(hasClass(button, 'Disabled'), `${message} ${label} button should have the disabled class`);
    assertEqual(button.hittest, false, `${message} ${label} button should not accept pointer hits`);
    assertEqual(typeof button.onactivate, 'undefined', `${message} ${label} button should not have an activation handler`);
  }
}

function assertEnabledActionButtons(runtime, expectedLabels, message) {
  const actions = findPanel(runtime, 'PokerActionButtons');
  const actionText = collectPanelTexts(actions, []).join('|');
  const buttons = actionButtonPanels(runtime);

  assert(!hasClass(actions, 'PokerHidden'), `${message} should keep the action area visible`);
  assertGreaterThan(buttons.length, 0, `${message} should render actionable buttons`);
  for (const label of expectedLabels || []) {
    assert(actionText.includes(label), `${message} should expose ${label} for the local actor: ${actionText || '<empty>'}`);
  }
  for (const button of buttons) {
    const label = collectPanelTexts(button, []).join('|') || '<unlabeled>';
    assert(!hasClass(button, 'Disabled'), `${message} ${label} button should not have the disabled class`);
    assert(button.hittest !== false, `${message} ${label} button should accept pointer hits`);
    assertEqual(typeof button.onactivate, 'function', `${message} ${label} button should have an activation handler`);
  }
}


function assertInactiveLobbyControls(runtime, message) {
  const startButton = findPanel(runtime, 'PokerStartButton');
  const readyButton = findPanel(runtime, 'PokerReadyChatButton');
  const startLabel = findPanel(runtime, 'PokerStartButtonLabel');
  const actions = findPanel(runtime, 'PokerActionButtons');

  assert(hasClass(actions, 'PokerHidden'), `${message} should hide action buttons`);
  assertEqual(actions ? actions.GetChildCount() : 0, 0, `${message} should remove stale action button children`);
  assert(!hasClass(startButton, 'PokerHidden'), `${message} should restore the start button`);
  assert(!hasClass(readyButton, 'PokerHidden'), `${message} should restore the ready-chat button`);
  assertEqual(panelText(startLabel), 'HOST OR JOIN PARTY', `${message} should require hosting or joining a synced party before the next hand`);
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
  let nextId = 0;

  function createPanel(type, parent, id) {
    const panel = {
      id: id || `${type}_${++nextId}`,
      type,
      parent: parent || null,
      children: [],
      classes: Object.create(null),
      text: '',
      hittest: true,
      deleted: false,
      IsValid() {
        return !this.deleted;
      },
      GetParent() {
        return this.parent;
      },
      FindChildTraverse(searchId) {
        if (this.id === searchId) return this;
        for (const child of this.children) {
          const found = child.FindChildTraverse(searchId);
          if (found) return found;
        }
        return panelsById[searchId] || null;
      },
      SetHasClass(className, enabled) {
        this.classes[className] = !!enabled;
      },
      AddClass(className) {
        this.classes[className] = true;
      },
      RemoveAndDeleteChildren() {
        for (const child of this.children) child.deleted = true;
        this.children = [];
      },
      GetChildCount() {
        return this.children.length;
      },
      GetChild(index) {
        return this.children[index] || null;
      },
      DeleteAsync() {
        this.deleted = true;
        if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      },
      SetPanelEvent(eventName, handler) {
        this[eventName] = handler;
      },
    };

    if (parent) parent.children.push(panel);
    if (id) panelsById[id] = panel;
    return panel;
  }

  const root = createPanel('Panel', null, 'PokerValidatorRoot');
  for (const id of [
    'PokerMenuButton',
    'PokerAnitaPanel',
    'PokerCloseButton',
    'PokerReadyChatButton',
    'PokerStartButton',
    'PokerStartButtonLabel',
    'PokerReadyCountLabel',
    'PokerSeatsList',
    'PokerStatusLabel',
    'PokerPotLabel',
    'PokerPhaseLabel',
    'PokerAnnouncerOverlay',
    'PokerAnnouncerTitle',
    'PokerAnnouncerBody',
    'PokerCommunityCards',
    'PokerPlayersList',
    'PokerActionButtons',
    'PokerPartyControls',
    'PokerHostPartyButton',
    'PokerJoinPartyButton',
    'PokerPartyStatusLabel',
    'PokerGameLog',
    'Chat',
    'ChatControls',
    'ChatInput',
    'ChatTargetLabel',
  ]) {
    createPanel('Panel', root, id);
  }

  return { createPanel, root };
}

function createValidatorContext() {
  const config = {};
  const dispatches = [];
  const messages = [];
  const schedules = [];
  const panels = createPanelFactory();
  let now = 1700000000000;

  function MockDate(...args) {
    return args.length > 0 ? new Date(...args) : new Date(now);
  }
  MockDate.now = () => {
    now += 1000;
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
      CreatePanel: panels.createPanel,
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

function readyPayload(name, readyAt) {
  const key = String(name).toLowerCase();
  return JSON.stringify({
    event: 'PokerReadySeatsChanged',
    key,
    name,
    channel: '[Team]',
    message: 'ready',
    readyAt,
    revision: readyAt,
  });
}

function currentPlayer(game) {
  return game.players[game.currentIndex];
}

function card(rank, suit) {
  const values = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
  const value = values[rank] || Number(rank);
  return { rank, suit, value };
}

function cardKey(cardValue) {
  return `${cardValue.rank}${cardValue.suit}`;
}

function createGameRuntime(names, seed, startRecord) {
  const gameRuntime = createValidatorContext();
  runScript(gameRuntime.sandbox, MENU_SCRIPT);
  const gameHooks = gameRuntime.sandbox.__PokerEscapeMenuTestHooks;
  assert(gameHooks, 'escape menu test hooks were not exported for isolated game runtime');
  if (!gameHooks) return { runtime: gameRuntime, hooks: null, game: null };

  for (let i = 0; i < names.length; i += 1) {
    gameHooks.handleReadyEvent(readyPayload(names[i], i + 1));
  }

  const starter = startRecord || { sender: names[0], message: `poker start ${seed || 'fixed-seed'}` };
  gameHooks.processChatRecord(starter);
  return { runtime: gameRuntime, hooks: gameHooks, game: gameHooks.state.game };
}

function createMenuRuntime() {
  const menuRuntime = createValidatorContext();
  runScript(menuRuntime.sandbox, MENU_SCRIPT);
  const menuHooks = menuRuntime.sandbox.__PokerEscapeMenuTestHooks;
  assert(menuHooks, 'escape menu test hooks were not exported for isolated menu runtime');
  return { runtime: menuRuntime, hooks: menuHooks };
}

function createSyncedPartyRuntime(localName, seed, roster, handNumber) {
  const synced = createMenuRuntime();
  if (!synced.hooks || !hasPartySyncHooks(synced.hooks, `synced party runtime for ${localName}`)) {
    return { runtime: synced.runtime, hooks: synced.hooks, game: null, startCommand: '' };
  }

  const startCommand = synced.hooks.buildSynchronizedStartCommand(seed, roster, handNumber);
  for (const record of [
    { sender: 'Abrams', message: '[party leader] poker party psync', isSelf: localName === 'Abrams' },
    { sender: 'Bebop', message: '[party join] poker party psync', isSelf: localName === 'Bebop' },
    { sender: 'Abrams', message: startCommand, isSelf: localName === 'Abrams' },
  ]) {
    synced.hooks.processChatRecord(record);
  }

  return { runtime: synced.runtime, hooks: synced.hooks, game: synced.hooks.state.game, startCommand };
}

function createSyncedHandOverrideRuntime(localName, startCommand, roster, hasPriorHandState) {
  const synced = createMenuRuntime();
  if (!synced.hooks || !hasPartySyncHooks(synced.hooks, `hand override runtime for ${localName}`)) {
    return { runtime: synced.runtime, hooks: synced.hooks, game: null };
  }

  synced.hooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party psync', isSelf: localName === 'Abrams' });
  synced.hooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party psync', isSelf: localName === 'Bebop' });
  if (hasPriorHandState) {
    synced.hooks.state.game = { handNumber: 1 };
    assertEqual(
      synced.hooks.buildSynchronizedStartCommand('snatural-next', roster),
      'poker start snatural-next hand 2 roster abrams~Abrams|bebop~Bebop',
      'runtime with prior local hand state should naturally build hand 2 starts',
    );
  }
  synced.hooks.processChatRecord({ sender: 'Abrams', message: startCommand, isSelf: localName === 'Abrams' });

  return { runtime: synced.runtime, hooks: synced.hooks, game: synced.hooks.state.game };
}

function moneySnapshot(game) {
  return {
    pot: game.pot,
    currentBet: game.currentBet,
    players: game.players.map((player) => ({
      key: player.key,
      stack: player.stack,
      bet: player.bet,
      committed: player.committed,
    })),
  };
}

function assertMoneySnapshot(actual, expected, message) {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

const runtime = createValidatorContext();
runScript(runtime.sandbox, MENU_SCRIPT);
const hooks = runtime.sandbox.__PokerEscapeMenuTestHooks;

assert(hooks, 'escape menu test hooks were not exported');

if (hooks) {
  const partyRoster = [
    { key: 'abrams', name: 'Abrams' },
    { key: 'bebop', name: 'Bebop' },
  ];
  const partyHooksAvailable = hasPartySyncHooks(hooks, 'escape menu party sync hooks');
  if (partyHooksAvailable) {
    assertEqual(
      hooks.encodeRoster(partyRoster),
      'abrams~Abrams|bebop~Bebop',
      'party roster encoder should serialize key/name pairs with the wire separator',
    );
    const encodedSpecialRoster = hooks.encodeRoster([{ key: 'ivy space', name: 'Ivy & Co' }]);
    assertEqual(
      encodedSpecialRoster,
      'ivy%20space~Ivy%20%26%20Co',
      'party roster encoder should URI-escape keys and names',
    );
    assertEqual(
      JSON.stringify(hooks.decodeRoster('abrams~Abrams|bebop~Bebop')),
      JSON.stringify(partyRoster),
      'party roster decoder should recover ordered key/name pairs',
    );
    assertEqual(
      JSON.stringify(hooks.decodeRoster('bad%zz~Abrams|bebop~Bebop')),
      JSON.stringify([]),
      'party roster decoder should reject malformed URI escapes',
    );
    assertEqual(
      hooks.buildSynchronizedStartCommand('ssync', partyRoster),
      'poker start ssync hand 1 roster abrams~Abrams|bebop~Bebop',
      'synchronized start builder should use the exact roster wire phrase',
    );
    hooks.state.party = {
      id: 'psync',
      mode: 'leader',
      leaderKey: 'abrams',
      leaderName: 'Abrams',
      members: {
        abrams: { key: 'abrams', name: 'Abrams' },
        bebop: { key: 'bebop', name: 'Bebop' },
        unknown: { key: 'unknown', name: '<unknown>' },
      },
      order: ['abrams', 'missing', 'bebop', 'unknown'],
    };
    assertEqual(
      JSON.stringify(hooks.getPartyRoster()),
      JSON.stringify(partyRoster),
      'party roster should return known non-unknown members in party order',
    );
    hooks.state.party = { id: '', mode: 'none', leaderKey: '', leaderName: '', members: {}, order: [] };
  }

  const startGateRuntime = createMenuRuntime();
  if (startGateRuntime.hooks && hasPartySyncHooks(startGateRuntime.hooks, 'start gate party sync hooks')) {
    const gateHooks = startGateRuntime.hooks;
    gateHooks.state.game = null;
    gateHooks.state.party = { id: '', mode: 'none', leaderKey: '', leaderName: '', members: {}, order: [] };
    let gate = gateHooks.getStartGate(0);
    assertEqual(gate.label, 'HOST OR JOIN PARTY', 'start gate without a party should ask the player to host or join');
    assertEqual(gate.enabled, false, 'start gate without a party should be disabled');

    gateHooks.state.party = { id: 'psync', mode: 'member', leaderKey: 'abrams', leaderName: 'Abrams', members: {}, order: [] };
    gate = gateHooks.getStartGate(2);
    assertEqual(gate.label, 'WAITING FOR LEADER', 'member start gate should wait for the party leader');
    assertEqual(gate.reason, 'Only Abrams can start the synced hand.', 'member start gate should name the leader who can start');
    assertEqual(gate.enabled, false, 'member start gate should be disabled');

    gateHooks.state.party = {
      id: 'psync',
      mode: 'leader',
      leaderKey: 'abrams',
      leaderName: 'Abrams',
      members: {
        abrams: { key: 'abrams', name: 'Abrams' },
      },
      order: ['abrams'],
    };
    gate = gateHooks.getStartGate(2);
    assertEqual(gate.label, 'WAITING FOR PARTY', 'leader start gate with one roster player should wait for the roster even when ready-seat count is two');
    assertEqual(gate.reason, 'Need 2 joined party players to start.', 'leader start gate with one roster player should explain the roster minimum');
    assertEqual(gate.enabled, false, 'leader start gate with one roster player should be disabled');

    gateHooks.state.party = {
      id: 'psync',
      mode: 'leader',
      leaderKey: 'abrams',
      leaderName: 'Abrams',
      members: {
        abrams: { key: 'abrams', name: 'Abrams' },
        bebop: { key: 'bebop', name: 'Bebop' },
      },
      order: ['abrams', 'bebop'],
    };
    gate = gateHooks.getStartGate(0);
    assertEqual(gate.label, 'START SYNCED HAND', 'leader start gate with two party players should offer a synced start');
    assertEqual(gate.enabled, true, 'leader start gate with two party players should be enabled');
  }

  hooks.handleReadyEvent(readyPayload('Abrams', 1));
  assertEqual(hooks.getReadySeatArray().length, 1, 'first ready payload should create one seat');
  assertEqual(hooks.isStartEligible(hooks.getReadySeatArray().length), false, 'one ready player should not be start eligible');

  hooks.handleReadyEvent(readyPayload('Bebop', 2));
  assertEqual(hooks.getReadySeatArray().length, 2, 'second ready payload should create a second seat');
  assertEqual(hooks.isStartEligible(hooks.getReadySeatArray().length), true, 'two ready payloads should make start eligible');

  hooks.processChatRecord({ sender: 'Abrams', message: 'poker start fixed-seed' });
  const game = hooks.state.game;
  assert(game, 'poker start fixed-seed should create a game');

  if (game) {
    assertEqual(game.players.length, 2, 'started game should include two players');
    assertEqual(game.pot, 300, 'started game should post the $100/$200 blinds into the pot');
    assertEqual(game.currentBet, 200, 'started game should begin with the big blind as current bet');
    assertEqual(game.community.length, 0, 'started game should have no community cards');
    assertEqual(game.phase, 'preflop', 'started game should begin in preflop');
    assertEqual(game.dealerIndex, 0, 'first hand dealer should start at the first ready seat');
    assertEqual(game.smallBlindIndex, 0, 'two-player hand should put the dealer in the small blind');
    assertEqual(game.bigBlindIndex, 1, 'two-player hand should put the second seat in the big blind');
    assertEqual(game.currentIndex, 0, 'two-player preflop should start with the small blind');
    assertEqual(game.players[0].stack, 9900, 'small blind should start with $100 committed from a $10000 stack');
    assertEqual(game.players[0].bet, 100, 'small blind should have a $100 street bet');
    assertEqual(game.players[0].committed, 100, 'small blind should have $100 committed to the hand');
    assertEqual(game.players[1].stack, 9800, 'big blind should start with $200 committed from a $10000 stack');
    assertEqual(game.players[1].bet, 200, 'big blind should have a $200 street bet');
    assertEqual(game.players[1].committed, 200, 'big blind should have $200 committed to the hand');
    const playerLabels = collectPanelTexts(findPanel(runtime, 'PokerPlayersList'), []).join('|');
    assert(playerLabels.includes('$9900  blind $100'), `initial hand render should label the small blind chips as blind $100: ${playerLabels || '<empty>'}`);
    assert(playerLabels.includes('$9800  blind $200'), `initial hand render should label the big blind chips as blind $200: ${playerLabels || '<empty>'}`);
    for (const player of game.players) {
      assertEqual(player.cards.length, 2, `${player.name} should receive two hole cards`);
    }


    const holeCards = game.players.flatMap((player) => player.cards).map(cardKey);
    assertEqual(new Set(holeCards).size, 4, 'dealt hole cards should be unique');

    const firstActor = currentPlayer(game);
    assertAnnouncerIncludes(
      runtime,
      ['Blinds posted', 'Abrams', 'small blind', '$100', 'Bebop', 'big blind', '$200', firstActor.name, 'acts first'],
      'initial hand start',
    );

    assertActiveGameControls(
      runtime,
      firstActor.name,
      game.phase,
      ['CALL $100', 'RAISE TO $400', 'RAISE TO $700', 'FOLD'],
      ['CHECK', 'BET $200', 'BET $500'],
      'active game render',
    );

    const rejectedSender = game.players[1];
    const turnBeforeRejectedCheck = game.currentIndex;
    const phaseBeforeRejectedCheck = game.phase;
    const statusBeforeRejectedCheck = panelText(findPanel(runtime, 'PokerStatusLabel'));
    const messagesBeforeRejectedCheck = runtime.messages.length;
    hooks.processChatRecord({ sender: rejectedSender.name, message: 'check' });
    assertEqual(game.currentIndex, turnBeforeRejectedCheck, 'non-current check should leave the turn unchanged');
    assertEqual(game.players[1].acted, false, 'non-current check should not mark the rejected sender as acted');
    assertDiagnosticIncludesTurnContext(
      runtime,
      messagesBeforeRejectedCheck,
      statusBeforeRejectedCheck,
      rejectedSender.name,
      currentPlayer(game).name,
      phaseBeforeRejectedCheck,
      'non-current check',
    );

    hooks.processChatRecord({ sender: firstActor.name, message: 'call' });
    assertEqual(game.currentIndex, 1, 'small blind call should advance action to the big blind');
    assertEqual(game.players[0].acted, true, 'calling player should be marked as acted');
    assertEqual(game.players[0].stack, 9800, 'small blind call should commit only the $100 call amount');
    assertEqual(game.players[0].bet, 200, 'small blind call should match the big blind');
    assertEqual(game.players[0].committed, 200, 'small blind call should update committed chips');
    assertEqual(game.pot, 400, 'small blind call should add exactly $100 to the blind pot');
    assertEqual(game.currentBet, 200, 'small blind call should leave the current bet at the big blind');


    const secondActor = currentPlayer(game);
    assertAnnouncerIncludes(
      runtime,
      [firstActor.name, 'calls', '$100', secondActor.name, 'to act', 'check', 'raise', 'fold'],
      'legal call action',
    );

    const beforeBigBlindCheck = moneySnapshot(game);
    hooks.processChatRecord({ sender: secondActor.name, message: 'check' });
    assertEqual(game.players[1].stack, beforeBigBlindCheck.players[1].stack, 'check cannot increase bet should leave checker stack unchanged');
    assertEqual(game.players[1].committed, beforeBigBlindCheck.players[1].committed, 'check cannot increase bet should leave checker committed chips unchanged');
    assertEqual(game.pot, beforeBigBlindCheck.pot, 'check cannot increase bet should leave pot unchanged');
    assertEqual(game.phase, 'flop', 'big blind check should settle the preflop round and deal the flop');
    assertEqual(game.community.length, 3, 'flop should deal three community cards');
    assertEqual(game.currentIndex, 1, 'postflop action should start left of the dealer');

    assertAnnouncerIncludes(
      runtime,
      ['Flop dealt', currentPlayer(game).name, 'to act', 'check', 'bet', '$200'],
      'street advance after big blind check',
    );

    const bettor = currentPlayer(game);
    hooks.processChatRecord({ sender: bettor.name, message: 'bet $300' });
    assertEqual(bettor.stack, 9500, 'bet should subtract the target total from the bettor stack on a new street');
    assertEqual(bettor.bet, 300, 'bet should record the bettor target total');
    assertEqual(bettor.committed, 500, 'bet should add the target total to prior blind commitments');
    assertEqual(game.currentBet, 300, 'bet should set the current bet');
    assertEqual(game.pot, 700, 'bet should add chips to the existing blind pot');

    const folder = currentPlayer(game);
    hooks.processChatRecord({ sender: folder.name, message: 'fold' });
    assertEqual(game.finished, true, 'fold should finish the hand when one player remains');
    assertEqual(game.active, false, 'finished hand should no longer be active');
    assertEqual(game.phase, 'finished', 'finished hand should use the finished phase');
    assertEqual(bettor.stack, 10200, 'fold winner should receive the full pot including blinds');
    assertInactiveLobbyControls(runtime, 'finished hand render');
    assertAnnouncerIncludes(
      runtime,
      [bettor.name, 'wins by fold', 'Pot $700', 'awarded'],
      'fold win',
    );

    hooks.processChatRecord({ sender: 'Abrams', message: 'poker start blind-second-hand' });
    const secondGame = hooks.state.game;
    assert(secondGame && secondGame !== game, 'second hand start should create a new game from the same ready roster');
    if (secondGame) {
      assertEqual(secondGame.handNumber, 2, 'second hand should increment the hand number before assigning blinds');
      assertEqual(secondGame.smallBlindAmount, 200, 'second hand should use a $200 small blind');
      assertEqual(secondGame.bigBlindAmount, 400, 'second hand should use a $400 big blind');
      assertEqual(secondGame.pot, 600, 'second hand should post the $200/$400 blinds into the pot');
      assertEqual(secondGame.currentBet, 400, 'second hand should begin with the $400 big blind as currentBet');
      assertEqual(secondGame.minRaise, 400, 'second hand preflop minimum raise should be the $400 big blind');
      assertEqual(secondGame.lastRaise, 400, 'second hand last raise should start at the $400 big blind');
      assertEqual(secondGame.dealerIndex, 1, 'second hand dealer should rotate to the next live player');
      assertEqual(secondGame.smallBlindIndex, 1, 'two-player second hand should put the new dealer in the small blind');
      assertEqual(secondGame.bigBlindIndex, 0, 'two-player second hand should put the other player in the big blind');
      assertEqual(secondGame.currentIndex, 1, 'two-player second hand preflop should start with the small blind');
      assertEqual(secondGame.players[0].stack, 9400, 'second hand big blind should remove $400 from Abrams carried stack');
      assertEqual(secondGame.players[0].bet, 400, 'second hand big blind should have a $400 street bet');
      assertEqual(secondGame.players[0].committed, 400, 'second hand big blind should have $400 committed');
      assertEqual(secondGame.players[1].stack, 10000, 'second hand small blind should remove $200 from Bebop carried stack');
      assertEqual(secondGame.players[1].bet, 200, 'second hand small blind should have a $200 street bet');
      assertEqual(secondGame.players[1].committed, 200, 'second hand small blind should have $200 committed');
      assert(secondGame.log.some((line) => line === 'Hand 2 started. Stacks begin at $10000.'), 'second hand log should record hand 2 start');
      assert(secondGame.log.some((line) => line === 'Blinds posted: Bebop $200, Abrams $400.'), 'second hand log should record $200/$400 blind posts');
      const secondPlayerLabels = collectPanelTexts(findPanel(runtime, 'PokerPlayersList'), []).join('|');
      assert(secondPlayerLabels.includes('$9400  blind $400'), `second hand render should label Abrams as the $400 big blind: ${secondPlayerLabels || '<empty>'}`);
      assert(secondPlayerLabels.includes('$10000  blind $200'), `second hand render should label Bebop as the $200 small blind: ${secondPlayerLabels || '<empty>'}`);
      const secondLogLabels = collectPanelTexts(findPanel(runtime, 'PokerGameLog'), []).join('|');
      assert(secondLogLabels.includes('Blinds posted: Bebop $200, Abrams $400.'), `second hand rendered log should include $200/$400 blinds: ${secondLogLabels || '<empty>'}`);

      const secondFirstActor = currentPlayer(secondGame);
      assertEqual(secondFirstActor.name, 'Bebop', 'second hand first actor should be the $200 small blind');
      assertEqual(hooks.getCallAmount(secondFirstActor), 200, 'second hand small blind should face a $200 call into the $400 big blind');
      assertEqual(hooks.getMinimumRaiseTo(secondGame), 800, 'second hand minimum preflop raise target should be $800');
      assertAnnouncerIncludes(
        runtime,
        ['Blinds posted', 'Bebop', 'small blind', '$200', 'Abrams', 'big blind', '$400', secondFirstActor.name, 'acts first'],
        'second hand start',
      );
      assertActiveGameControls(
        runtime,
        secondFirstActor.name,
        secondGame.phase,
        ['CALL $200', 'RAISE TO $800', 'FOLD'],
        ['CALL $100', 'RAISE TO $400', 'RAISE TO $700', 'BET $200', 'BET $500'],
        'second hand preflop render',
      );

      hooks.processChatRecord({ sender: secondFirstActor.name, message: 'call' });
      assertEqual(secondGame.currentIndex, 0, 'second hand small blind call should advance action to the big blind');
      assertEqual(secondGame.players[1].stack, 9800, 'second hand small blind call should commit $200 more');
      assertEqual(secondGame.players[1].bet, 400, 'second hand small blind call should match the $400 big blind');
      assertEqual(secondGame.players[1].committed, 400, 'second hand small blind call should update committed chips to $400');
      assertEqual(secondGame.pot, 800, 'second hand small blind call should add $200 to the $600 blind pot');
      assertEqual(secondGame.currentBet, 400, 'second hand small blind call should leave currentBet at the $400 big blind');
      const secondBigBlindActor = currentPlayer(secondGame);
      assertEqual(secondBigBlindActor.name, 'Abrams', 'second hand big blind should act after the small blind calls');
      assertEqual(hooks.getCallAmount(secondBigBlindActor), 0, 'second hand big blind should be able to check after the call');
      assertEqual(hooks.getMinimumRaiseTo(secondGame), 800, 'second hand big blind minimum raise target should still be $800');
      assertActiveGameControls(
        runtime,
        secondBigBlindActor.name,
        secondGame.phase,
        ['CHECK', 'RAISE TO $800', 'FOLD'],
        ['CALL $100', 'CALL $200', 'RAISE TO $400', 'RAISE TO $700'],
        'second hand big blind option render',
      );

      hooks.processChatRecord({ sender: secondBigBlindActor.name, message: 'check' });
      assertEqual(secondGame.phase, 'flop', 'second hand big blind check should advance to the flop');
      assertEqual(secondGame.community.length, 3, 'second hand flop should deal three community cards');
      assertEqual(secondGame.currentBet, 0, 'second hand flop should reset currentBet to zero');
      assertEqual(secondGame.minRaise, 400, 'second hand flop minimum bet/raise should reset to the current $400 big blind');
      assertEqual(secondGame.lastRaise, 400, 'second hand flop lastRaise should reset to the current $400 big blind');
      const secondFlopActor = currentPlayer(secondGame);
      assertEqual(secondFlopActor.name, 'Abrams', 'second hand flop action should start left of the dealer');
      const secondFlopLegal = hooks.getLegalActions(secondFlopActor);
      assert(secondFlopLegal.canBetTarget(400), 'second hand flop should allow a minimum $400 bet');
      assert(!secondFlopLegal.canBetTarget(300), 'second hand flop should reject bets below the $400 big blind');
      assertAnnouncerIncludes(
        runtime,
        ['Flop dealt', secondFlopActor.name, 'to act', 'check', 'bet $400', 'bet $700'],
        'second hand flop prompt',
      );
      assertAnnouncerOmits(runtime, ['bet $200', 'bet $500'], 'second hand flop prompt');
      assertActiveGameControls(
        runtime,
        secondFlopActor.name,
        secondGame.phase,
        ['CHECK', 'BET $400', 'BET $700', 'FOLD'],
        ['BET $200', 'BET $500', 'RAISE TO $800'],
        'second hand flop render',
      );

      hooks.processChatRecord({ sender: secondFlopActor.name, message: 'bet $400' });
      assertEqual(secondGame.currentBet, 400, 'second hand flop minimum bet should set currentBet to $400');
      assertEqual(secondGame.minRaise, 400, 'second hand flop minimum bet should keep minRaise at $400');
      const secondFlopFolder = currentPlayer(secondGame);
      hooks.processChatRecord({ sender: secondFlopFolder.name, message: 'fold' });
      assertEqual(secondGame.finished, true, 'second hand fold after a flop bet should finish the hand');

      hooks.processChatRecord({ sender: 'Abrams', message: 'poker start blind-third-hand' });
      const thirdGame = hooks.state.game;
      assert(thirdGame && thirdGame !== secondGame, 'third hand start should create a new game from the same ready roster');
      if (thirdGame) {
        assertEqual(thirdGame.handNumber, 3, 'third hand should increment the hand number before assigning blinds');
        assertEqual(thirdGame.smallBlindAmount, 300, 'third hand should use a $300 small blind');
        assertEqual(thirdGame.bigBlindAmount, 600, 'third hand should use a $600 big blind');
        assertEqual(thirdGame.pot, 900, 'third hand should post the $300/$600 blinds into the pot');
        assertEqual(thirdGame.currentBet, 600, 'third hand should begin with the $600 big blind as currentBet');
        assertEqual(thirdGame.minRaise, 600, 'third hand minimum raise should be the $600 big blind');
        assertEqual(thirdGame.players[thirdGame.smallBlindIndex].bet, 300, 'third hand small blind player should have a $300 street bet');
        assertEqual(thirdGame.players[thirdGame.bigBlindIndex].bet, 600, 'third hand big blind player should have a $600 street bet');
      }
    }

  }

  const syncedRoster = [
    { key: 'abrams', name: 'Abrams' },
    { key: 'bebop', name: 'Bebop' },
  ];
  const syncedAbrams = createSyncedPartyRuntime('Abrams', 'ssync', syncedRoster, 1);
  const syncedBebop = createSyncedPartyRuntime('Bebop', 'ssync', syncedRoster, 1);
  if (syncedAbrams.hooks && syncedBebop.hooks && syncedAbrams.game && syncedBebop.game) {
    assertEqual(syncedAbrams.startCommand, 'poker start ssync hand 1 roster abrams~Abrams|bebop~Bebop', 'synced runtime should use the exact roster start command');
    assertEqual(syncedAbrams.game.seed, 'ssync', 'synced roster start should use the shared seed without appending sender text');
    assertEqual(syncedBebop.game.seed, 'ssync', 'second synced roster start should use the same shared seed without appending sender text');
    assertSameSyncedGame(syncedBebop.game, syncedAbrams.game, 'two clients receiving the same roster start');

    const abramsActualCards = syncedAbrams.game.players[0].cards.map(cardKey);
    const bebopActualCards = syncedAbrams.game.players[1].cards.map(cardKey);
    assertEqual(
      JSON.stringify(renderedPlayerCards(syncedAbrams.runtime, 'Abrams')),
      JSON.stringify(abramsActualCards),
      'Abrams client should reveal Abrams hole cards',
    );
    assertEqual(
      JSON.stringify(renderedPlayerCards(syncedAbrams.runtime, 'Bebop')),
      JSON.stringify(['??', '??']),
      'Abrams client should keep Bebop hole cards hidden',
    );
    assertEqual(
      JSON.stringify(renderedPlayerCards(syncedBebop.runtime, 'Bebop')),
      JSON.stringify(bebopActualCards),
      'Bebop client should reveal Bebop hole cards',
    );
    assertEqual(
      JSON.stringify(renderedPlayerCards(syncedBebop.runtime, 'Abrams')),
      JSON.stringify(['??', '??']),
      'Bebop client should keep Abrams hole cards hidden',
    );
  }

  const syncedHandTwoCommand = hooks.buildSynchronizedStartCommand('ssync-hand-two', syncedRoster, 2);
  assertEqual(
    syncedHandTwoCommand,
    'poker start ssync-hand-two hand 2 roster abrams~Abrams|bebop~Bebop',
    'explicit synchronized start builder should pin hand 2 in the wire phrase',
  );
  const priorHandSynced = createSyncedHandOverrideRuntime('Abrams', syncedHandTwoCommand, syncedRoster, true);
  const freshHandSynced = createSyncedHandOverrideRuntime('Bebop', syncedHandTwoCommand, syncedRoster, false);
  if (priorHandSynced.hooks && freshHandSynced.hooks && priorHandSynced.game && freshHandSynced.game) {
    assertEqual(priorHandSynced.game.handNumber, 2, 'prior-state synced command should create hand 2');
    assertEqual(freshHandSynced.game.handNumber, 2, 'fresh synced command should create hand 2');
    for (const syncedGame of [priorHandSynced.game, freshHandSynced.game]) {
      assertEqual(syncedGame.smallBlindAmount, 200, 'hand 2 synced command should use a $200 small blind');
      assertEqual(syncedGame.bigBlindAmount, 400, 'hand 2 synced command should use a $400 big blind');
      assertEqual(syncedGame.pot, 600, 'hand 2 synced command should post the $200/$400 blinds into the pot');
      assertEqual(syncedGame.currentBet, 400, 'hand 2 synced command should begin with the $400 big blind as currentBet');
      assertEqual(syncedGame.minRaise, 400, 'hand 2 synced command should set the preflop minRaise to the $400 big blind');
      assertEqual(syncedGame.lastRaise, 400, 'hand 2 synced command should set the initial lastRaise to the $400 big blind');
    }
    assertSameSyncedGame(
      freshHandSynced.game,
      priorHandSynced.game,
      'hand 2 roster start across fresh and prior local hand state',
    );
  }

  const knownRaiseRuntime = createSyncedPartyRuntime('Abrams', 'sunknown-raise', syncedRoster, 1);
  const unknownRaiseRuntime = createSyncedPartyRuntime('Bebop', 'sunknown-raise', syncedRoster, 1);
  if (knownRaiseRuntime.hooks && unknownRaiseRuntime.hooks && knownRaiseRuntime.game && unknownRaiseRuntime.game) {
    const knownRaiseGame = knownRaiseRuntime.game;
    const unknownRaiseGame = unknownRaiseRuntime.game;
    const knownRaiseActor = currentPlayer(knownRaiseGame);
    const unknownRaiseActor = currentPlayer(unknownRaiseGame);
    assertEqual(knownRaiseActor.name, 'Abrams', 'known raise setup should start with Abrams as the current actor');
    assertEqual(unknownRaiseActor.name, 'Abrams', 'unknown non-self raise setup should start with Abrams as the current actor');

    knownRaiseRuntime.hooks.processChatRecord({ sender: knownRaiseActor.name, message: 'raise $400', isSelf: true });
    unknownRaiseRuntime.hooks.processChatRecord({ sender: '<unknown>', message: 'raise $400', isSelf: false });

    assertSameSyncedGame(unknownRaiseGame, knownRaiseGame, 'unknown non-self raise resolved to current actor');
    assertMoneySnapshot(
      moneySnapshot(unknownRaiseGame),
      moneySnapshot(knownRaiseGame),
      'unknown non-self raise should mutate money exactly like the named current actor raise',
    );
    assertEqual(unknownRaiseGame.players[0].bet, 400, 'unknown non-self raise should set the current actor street bet to $400');
    assertEqual(unknownRaiseGame.players[0].committed, 400, 'unknown non-self raise should set the current actor committed chips to $400');
    assertEqual(unknownRaiseGame.players[0].stack, 9600, 'unknown non-self raise should charge only the chips needed to reach $400');
    assertEqual(unknownRaiseGame.currentBet, 400, 'unknown non-self raise should update the table current bet');
    assertEqual(unknownRaiseGame.pot, 600, 'unknown non-self raise should add only the raise delta to the blind pot');
    assertEqual(unknownRaiseGame.currentIndex, 1, 'unknown non-self raise should advance action to the next player');
    assertEqual(currentPlayer(unknownRaiseGame).name, 'Bebop', 'unknown non-self raise should leave Bebop to act next');
  }

  const unknownIllegalRuntime = createSyncedPartyRuntime('Bebop', 'sunknown-illegal-bet', syncedRoster, 1);
  if (unknownIllegalRuntime.hooks && unknownIllegalRuntime.game) {
    const unknownIllegalGame = unknownIllegalRuntime.game;
    const unknownIllegalActor = currentPlayer(unknownIllegalGame);
    assertEqual(unknownIllegalActor.name, 'Abrams', 'unknown illegal action setup should start with Abrams as the current actor');
    assertEqual(unknownIllegalGame.currentBet, 200, 'unknown illegal action setup should have Abrams facing the big blind');
    assertEqual(unknownIllegalActor.bet, 100, 'unknown illegal action setup should have Abrams posted the small blind only');

    const beforeUnknownIllegalMoney = moneySnapshot(unknownIllegalGame);
    const beforeUnknownIllegalState = JSON.stringify({
      active: unknownIllegalGame.active,
      finished: unknownIllegalGame.finished,
      phase: unknownIllegalGame.phase,
      currentIndex: unknownIllegalGame.currentIndex,
      dealerIndex: unknownIllegalGame.dealerIndex,
      smallBlindIndex: unknownIllegalGame.smallBlindIndex,
      bigBlindIndex: unknownIllegalGame.bigBlindIndex,
      minRaise: unknownIllegalGame.minRaise,
      community: unknownIllegalGame.community.map(cardKey),
      players: unknownIllegalGame.players.map((player) => ({
        key: player.key,
        name: player.name,
        stack: player.stack,
        bet: player.bet,
        committed: player.committed,
        folded: player.folded,
        acted: player.acted,
        allIn: player.allIn,
      })),
    });
    const statusBeforeUnknownIllegal = panelText(findPanel(unknownIllegalRuntime.runtime, 'PokerStatusLabel'));
    const messagesBeforeUnknownIllegal = unknownIllegalRuntime.runtime.messages.length;

    unknownIllegalRuntime.hooks.processChatRecord({ sender: '<unknown>', message: 'bet $200', isSelf: false });

    assertMoneySnapshot(
      moneySnapshot(unknownIllegalGame),
      beforeUnknownIllegalMoney,
      'unknown non-self illegal bet should not mutate money',
    );
    assertEqual(
      JSON.stringify({
        active: unknownIllegalGame.active,
        finished: unknownIllegalGame.finished,
        phase: unknownIllegalGame.phase,
        currentIndex: unknownIllegalGame.currentIndex,
        dealerIndex: unknownIllegalGame.dealerIndex,
        smallBlindIndex: unknownIllegalGame.smallBlindIndex,
        bigBlindIndex: unknownIllegalGame.bigBlindIndex,
        minRaise: unknownIllegalGame.minRaise,
        community: unknownIllegalGame.community.map(cardKey),
        players: unknownIllegalGame.players.map((player) => ({
          key: player.key,
          name: player.name,
          stack: player.stack,
          bet: player.bet,
          committed: player.committed,
          folded: player.folded,
          acted: player.acted,
          allIn: player.allIn,
        })),
      }),
      beforeUnknownIllegalState,
      'unknown non-self illegal bet should leave currentIndex and game state unchanged',
    );
    assertDiagnosticContains(
      unknownIllegalRuntime.runtime,
      messagesBeforeUnknownIllegal,
      statusBeforeUnknownIllegal,
      'reject-unknown-sender',
      'unknown non-self illegal bet should not resolve to the current actor',
    );
  }

  const unknownLocalSynced = createSyncedPartyRuntime('', 'sunknown-local', syncedRoster, 1);
  if (unknownLocalSynced.hooks && unknownLocalSynced.game) {
    assertEqual(unknownLocalSynced.hooks.state.localPlayerKey, '', 'unknown local synced start should not invent a local player key');
    assertReadOnlyActionButtons(
      unknownLocalSynced.runtime,
      ['CALL $100', 'RAISE TO $400', 'RAISE TO $700', 'FOLD'],
      'sender unknown',
      'unknown local synced action render',
    );
    assert(
      panelText(findPanel(unknownLocalSynced.runtime, 'PokerStatusLabel')).includes('you <unknown>') ||
        collectPanelTexts(findPanel(unknownLocalSynced.runtime, 'PokerActionButtons'), []).join('|').toLowerCase().includes('sender unknown'),
      'unknown local synced action render should surface the unknown sender in status or hint text',
    );
  }

  const selfUnknownMemberRuntime = createMenuRuntime();
  if (selfUnknownMemberRuntime.hooks && hasPartySyncHooks(selfUnknownMemberRuntime.hooks, 'self-unknown member synced start hooks')) {
    const memberHooks = selfUnknownMemberRuntime.hooks;
    const memberStartCommand = memberHooks.buildSynchronizedStartCommand('smember-local', syncedRoster, 1);
    memberHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party psync' });
    memberHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party psync' });
    memberHooks.state.party.mode = 'member';
    memberHooks.state.localPlayerKey = '';
    memberHooks.processChatRecord({ sender: 'Abrams', message: memberStartCommand });
    assertEqual(memberHooks.state.localPlayerKey, 'bebop', 'self-unknown member synced start should infer the only non-leader roster member as local');
    assertEqual(
      JSON.stringify(renderedPlayerCards(selfUnknownMemberRuntime.runtime, 'Bebop')),
      JSON.stringify(memberHooks.state.game.players[1].cards.map(cardKey)),
      'self-unknown member synced start should reveal only the inferred member hole cards',
    );
    assertEqual(
      JSON.stringify(renderedPlayerCards(selfUnknownMemberRuntime.runtime, 'Abrams')),
      JSON.stringify(['??', '??']),
      'self-unknown member synced start should keep the leader hole cards hidden from the inferred member',
    );
    assertReadOnlyActionButtons(
      selfUnknownMemberRuntime.runtime,
      ['CALL $100', 'RAISE TO $400', 'RAISE TO $700', 'FOLD'],
      'Waiting for Abrams',
      'self-unknown member before local turn',
    );
    memberHooks.processChatRecord({ sender: 'Abrams', message: 'call' });
    assertEqual(memberHooks.state.game.currentIndex, 1, 'self-unknown member synced start should advance to the inferred member after leader call');
    assertEnabledActionButtons(
      selfUnknownMemberRuntime.runtime,
      ['CHECK', 'RAISE TO $400', 'RAISE TO $700', 'FOLD'],
      'self-unknown member local turn',
    );
  }


  const nonLeaderRuntime = createMenuRuntime();
  if (nonLeaderRuntime.hooks && hasPartySyncHooks(nonLeaderRuntime.hooks, 'non-leader synced start hooks')) {
    const startCommand = nonLeaderRuntime.hooks.buildSynchronizedStartCommand('ssync', syncedRoster, 1);
    nonLeaderRuntime.hooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party psync' });
    nonLeaderRuntime.hooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party psync' });
    const statusBeforeNonLeaderStart = panelText(findPanel(nonLeaderRuntime.runtime, 'PokerStatusLabel'));
    const messagesBeforeNonLeaderStart = nonLeaderRuntime.runtime.messages.length;
    nonLeaderRuntime.hooks.processChatRecord({ sender: 'Bebop', message: startCommand });
    assertEqual(nonLeaderRuntime.hooks.state.game, null, 'non-leader synced start should not create a game');
    assert(
      panelText(findPanel(nonLeaderRuntime.runtime, 'PokerStatusLabel')).includes('Only Abrams can start'),
      'non-leader synced start should show the leader-only start status',
    );
    assertDiagnosticContains(
      nonLeaderRuntime.runtime,
      messagesBeforeNonLeaderStart,
      statusBeforeNonLeaderStart,
      'reject-non-leader-start',
      'non-leader synced start',
    );
  }

  const checkRuntime = createGameRuntime(['Calico', 'Dynamo', 'Ivy'], 'check-cannot-increase-bet');
  if (checkRuntime.hooks && checkRuntime.game) {
    const checkGame = checkRuntime.game;
    const checker = checkGame.players[2];
    checkGame.currentIndex = 2;
    checkGame.players[0].stack = 9800;
    checkGame.players[0].bet = 200;
    checkGame.players[0].committed = 200;
    checkGame.players[0].acted = false;
    checkGame.pot = 500;
    checkGame.currentBet = 200;
    const beforeCheck = moneySnapshot(checkGame);
    assertEqual(checkRuntime.hooks.getCallAmount(checker), 0, 'check cannot increase bet setup should give checker no call amount');
    checkRuntime.hooks.processChatRecord({ sender: checker.name, message: 'check' });
    assertMoneySnapshot(moneySnapshot(checkGame), beforeCheck, 'check cannot increase bet should not mutate stacks, bets, committed chips, pot, or currentBet');
    assertEqual(checkGame.currentIndex, 0, 'check cannot increase bet should advance to the next unsettled actor');
  }

  const raiseRuntime = createGameRuntime(['Geist', 'Haze'], 'target-total-raise');
  if (raiseRuntime.hooks && raiseRuntime.game) {
    const raiseGame = raiseRuntime.game;
    const raiser = currentPlayer(raiseGame);
    raiseRuntime.hooks.processChatRecord({ sender: raiser.name, message: 'raise $400' });
    assertEqual(raiser.bet, 400, 'bet amount is target total should set raiser street bet to exactly $400');
    assertEqual(raiser.committed, 400, 'bet amount is target total should set total hand commitment to exactly $400 preflop');
    assertEqual(raiser.stack, 9600, 'bet amount is target total should charge only chips needed to reach $400');
    assertEqual(raiseGame.currentBet, 400, 'bet amount is target total should set currentBet to the target total');
    assertEqual(raiseGame.pot, 600, 'bet amount is target total should add only $300 over the small blind, not $400 over currentBet');
  }

  const observerRuntime = createGameRuntime(
    ['Observer', 'JDBeast'],
    'observer-current-actor-options',
    { sender: 'Observer', message: 'poker start observer-current-actor-options', isSelf: true },
  );
  if (observerRuntime.hooks && observerRuntime.game) {
    const observerGame = observerRuntime.game;
    const localObserver = currentPlayer(observerGame);
    observerRuntime.hooks.processChatRecord({ sender: localObserver.name, message: 'raise $400', isSelf: true });

    const observedActor = currentPlayer(observerGame);
    assertEqual(observedActor.name, 'JDBeast', 'observer current actor choices setup should pass action to the non-local player after a raise');
    assertEqual(observerRuntime.hooks.state.localPlayerKey, localObserver.key, 'observer current actor choices setup should remember the local seat');
    assertEqual(observerRuntime.hooks.getCallAmount(observedActor), 200, 'observer current actor choices setup should make the current actor face a $200 call');
    assertObserverCurrentActorControls(
      observerRuntime.runtime,
      observedActor.name,
      ['CALL $200', 'RAISE TO $600', 'RAISE TO $900', 'FOLD'],
      ['CHECK', 'BET $200', 'BET $500'],
      'observer current actor choices',
    );

    const beforeIllegalBet = moneySnapshot(observerGame);
    const statusBeforeIllegalBet = panelText(findPanel(observerRuntime.runtime, 'PokerStatusLabel'));
    const messagesBeforeIllegalBet = observerRuntime.runtime.messages.length;
    observerRuntime.hooks.processChatRecord({ sender: observedActor.name, message: 'bet $500' });
    assertMoneySnapshot(moneySnapshot(observerGame), beforeIllegalBet, 'illegal bet while facing currentBet should not mutate money');
    assertDiagnosticContains(observerRuntime.runtime, messagesBeforeIllegalBet, statusBeforeIllegalBet, 'reject-illegal-bet', 'illegal bet while facing currentBet');
    assertDiagnosticContains(observerRuntime.runtime, messagesBeforeIllegalBet, statusBeforeIllegalBet, 'use=raise', 'illegal bet while facing currentBet');
    assertDiagnosticContains(observerRuntime.runtime, messagesBeforeIllegalBet, statusBeforeIllegalBet, 'toCall=200', 'illegal bet while facing currentBet');
    assertDiagnosticContains(observerRuntime.runtime, messagesBeforeIllegalBet, statusBeforeIllegalBet, 'minRaise=200', 'illegal bet while facing currentBet');
    assertDiagnosticContains(observerRuntime.runtime, messagesBeforeIllegalBet, statusBeforeIllegalBet, 'currentBet=400', 'illegal bet while facing currentBet');
    assertDiagnosticContains(observerRuntime.runtime, messagesBeforeIllegalBet, statusBeforeIllegalBet, 'playerBet=200', 'illegal bet while facing currentBet');
  }

  const selfRuntime = createGameRuntime(
    ['Kelvin', 'Lash'],
    'unknown-self-sender',
    { sender: 'Kelvin', message: 'poker start unknown-self-sender', isSelf: true },
  );
  if (selfRuntime.hooks && selfRuntime.game) {
    const localPlayer = selfRuntime.game.players[0];
    selfRuntime.hooks.processChatRecord({ sender: '<unknown>', message: 'call', isSelf: true });
    assertEqual(localPlayer.bet, 200, 'unknown self sender uses local seat should apply the action to the remembered local player');
    assertEqual(localPlayer.stack, 9800, 'unknown self sender uses local seat should commit the local call amount');
    assertEqual(selfRuntime.game.currentIndex, 1, 'unknown self sender uses local seat should advance from the local actor after a legal action');
  }

  const unknownRuntime = createGameRuntime(['Mirage', 'Pocket'], 'unknown-non-self');
  if (unknownRuntime.hooks && unknownRuntime.game) {
    const unknownGame = unknownRuntime.game;
    const beforeUnknown = moneySnapshot(unknownGame);
    const statusBeforeUnknown = panelText(findPanel(unknownRuntime.runtime, 'PokerStatusLabel'));
    const messagesBeforeUnknown = unknownRuntime.runtime.messages.length;
    unknownRuntime.hooks.processChatRecord({ sender: '<unknown>', message: 'check', isSelf: false });
    assertMoneySnapshot(moneySnapshot(unknownGame), beforeUnknown, 'unknown non-self check does not mutate money');
    assertDiagnosticContains(unknownRuntime.runtime, messagesBeforeUnknown, statusBeforeUnknown, 'reject-unknown-sender', 'unknown non-self check does not mutate money');
  }

  const streetRuntime = createGameRuntime(['Calico', 'Dynamo', 'Ivy'], 'announcer-street-current-index');
  if (streetRuntime.hooks && streetRuntime.game) {
    const streetGame = streetRuntime.game;
    streetRuntime.hooks.processChatRecord({ sender: streetGame.players[0].name, message: 'call' });
    streetRuntime.hooks.processChatRecord({ sender: streetGame.players[1].name, message: 'call' });
    assertEqual(streetGame.currentIndex, 2, 'announcer street setup should leave the big blind to close preflop');
    streetRuntime.hooks.processChatRecord({ sender: streetGame.players[2].name, message: 'check' });
    assertEqual(streetGame.phase, 'flop', 'street advance announcer should move to the flop');
    assertEqual(streetGame.currentIndex, 1, 'street advance announcer should update currentIndex before announcing the next actor');
    assertAnnouncerIncludes(
      streetRuntime.runtime,
      ['Flop dealt', 'Dynamo', 'to act', 'check', 'bet', '$200'],
      'street advance announcer',
    );
    assertAnnouncerOmits(streetRuntime.runtime, ['Ivy to act'], 'street advance announcer');
  }

  const showdownRuntime = createGameRuntime(['Paradox', 'Warden'], 'announcer-showdown');
  if (showdownRuntime.hooks && showdownRuntime.game) {
    const showdownGame = showdownRuntime.game;
    showdownRuntime.hooks.processChatRecord({ sender: showdownGame.players[0].name, message: 'call' });
    showdownRuntime.hooks.processChatRecord({ sender: showdownGame.players[1].name, message: 'check' });
    showdownRuntime.hooks.processChatRecord({ sender: showdownGame.players[1].name, message: 'check' });
    showdownRuntime.hooks.processChatRecord({ sender: showdownGame.players[0].name, message: 'check' });
    showdownRuntime.hooks.processChatRecord({ sender: showdownGame.players[1].name, message: 'check' });
    showdownRuntime.hooks.processChatRecord({ sender: showdownGame.players[0].name, message: 'check' });
    showdownRuntime.hooks.processChatRecord({ sender: showdownGame.players[1].name, message: 'check' });
    showdownRuntime.hooks.processChatRecord({ sender: showdownGame.players[0].name, message: 'check' });
    assertEqual(showdownGame.finished, true, 'showdown announcer setup should finish the hand through chat actions');
    assertAnnouncerIncludes(
      showdownRuntime.runtime,
      ['Pot $400', 'win with', 'Winners paid'],
      'showdown announcer',
    );
    assert(
      announcerText(showdownRuntime.runtime).combined.includes('Paradox') ||
        announcerText(showdownRuntime.runtime).combined.includes('Warden'),
      `showdown announcer should name a winner: ${announcerText(showdownRuntime.runtime).combined || '<empty>'}`,
    );
  }


  const sidePotRuntime = createGameRuntime(['Seven', 'Shiv', 'Viscous'], 'side-pot-levels');
  if (sidePotRuntime.hooks && sidePotRuntime.game) {
    const sideGame = sidePotRuntime.game;
    sideGame.players[0].name = 'Short';
    sideGame.players[0].key = 'short';
    sideGame.players[1].name = 'Middle';
    sideGame.players[1].key = 'middle';
    sideGame.players[2].name = 'Deep';
    sideGame.players[2].key = 'deep';
    sideGame.dealerIndex = 2;
    sideGame.community = [card('2', 'H'), card('3', 'D'), card('4', 'S'), card('9', 'C'), card('K', 'D')];
    sideGame.players[0].cards = [card('A', 'H'), card('A', 'D')];
    sideGame.players[1].cards = [card('K', 'H'), card('Q', 'S')];
    sideGame.players[2].cards = [card('Q', 'C'), card('J', 'D')];
    sideGame.players[0].stack = 0;
    sideGame.players[1].stack = 0;
    sideGame.players[2].stack = 0;
    sideGame.players[0].bet = 100;
    sideGame.players[1].bet = 300;
    sideGame.players[2].bet = 500;
    sideGame.players[0].committed = 100;
    sideGame.players[1].committed = 300;
    sideGame.players[2].committed = 500;
    sideGame.players[0].folded = false;
    sideGame.players[1].folded = false;
    sideGame.players[2].folded = false;
    sideGame.pot = 900;
    sideGame.phase = 'river';
    sideGame.active = true;
    sideGame.finished = false;

    const pots = sidePotRuntime.hooks.buildPots(sideGame.players);
    assertEqual(pots.map((pot) => pot.amount).join(','), '300,400,200', 'side pot splits by committed levels should build main and side pot amounts from commitments');
    assertEqual(pots[0].eligible.map((player) => player.name).join(','), 'Short,Middle,Deep', 'side pot splits by committed levels should let all live players contest the main pot');
    assertEqual(pots[1].eligible.map((player) => player.name).join(','), 'Middle,Deep', 'side pot splits by committed levels should exclude the short stack from the first side pot');
    assertEqual(pots[2].eligible.map((player) => player.name).join(','), 'Deep', 'side pot splits by committed levels should leave the largest overage to the deep stack');

    sidePotRuntime.hooks.showdown();
    assertEqual(sideGame.players[0].stack, 300, 'side pot splits by committed levels should award the main pot to the best all-player hand');
    assertEqual(sideGame.players[1].stack, 400, 'side pot splits by committed levels should award the first side pot to its best eligible hand');
    assertEqual(sideGame.players[2].stack, 200, 'side pot splits by committed levels should return the uncontested overage side pot to the only eligible player');
    assertEqual(sideGame.pot, 0, 'side pot splits by committed levels should clear the table pot after payout');
    assert(sideGame.log.some((line) => line === 'Pot $300: Short win with Pair.'), 'side pot splits by committed levels should log the main pot winner');
    assert(sideGame.log.some((line) => line === 'Pot $400: Middle win with Pair.'), 'side pot splits by committed levels should log the first side pot winner');
    assert(sideGame.log.some((line) => line === 'Pot $200: Deep win with High card.'), 'side pot splits by committed levels should log the overage side pot winner');
  }

  const royalFlush = hooks.evaluateHand([
    card('T', 'H'), card('J', 'H'), card('Q', 'H'), card('K', 'H'), card('A', 'H'), card('2', 'C'), card('3', 'D'),
  ]);
  const straightFlush = hooks.evaluateHand([
    card('9', 'H'), card('T', 'H'), card('J', 'H'), card('Q', 'H'), card('K', 'H'), card('2', 'C'), card('3', 'D'),
  ]);
  const fourOfKind = hooks.evaluateHand([
    card('A', 'S'), card('A', 'H'), card('A', 'D'), card('A', 'C'), card('8', 'S'), card('4', 'H'), card('2', 'D'),
  ]);
  const pair = hooks.evaluateHand([
    card('6', 'S'), card('6', 'D'), card('A', 'C'), card('Q', 'H'), card('9', 'S'), card('4', 'D'), card('2', 'C'),
  ]);
  const highCard = hooks.evaluateHand([
    card('A', 'S'), card('K', 'D'), card('9', 'C'), card('7', 'H'), card('5', 'S'), card('3', 'D'), card('2', 'C'),
  ]);

  assertEqual(royalFlush.name, 'Royal flush', 'royal flush ranks highest should recognize an ace-high straight flush by name');
  assertEqual(straightFlush.name, 'Straight flush', 'straight flush should be recognized by name');
  assertEqual(fourOfKind.name, 'Four of a kind', 'four of a kind should be recognized by name');
  assertEqual(pair.name, 'Pair', 'pair should be recognized by name');
  assertEqual(highCard.name, 'High card', 'high card should be recognized by name');
  assertGreaterThan(hooks.compareHands(royalFlush, straightFlush), 0, 'royal flush ranks highest should compare above a king-high straight flush');
  assertGreaterThan(hooks.compareHands(straightFlush, fourOfKind), 0, 'straight flush should rank above four of a kind');
  assertGreaterThan(hooks.compareHands(pair, highCard), 0, 'pair should rank above high card');
}

if (failures.length > 0) {
  console.error('validate-poker-game: failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('validate-poker-game: ok');
