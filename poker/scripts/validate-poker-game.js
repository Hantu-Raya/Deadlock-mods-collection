#!/usr/bin/env node
'use strict';

const path = require('node:path');
const harness = require('./poker-panorama-vm');
const {
  createValidatorContext,
  runScript,
  findPanel,
  findDescendantsWithClass,
  firstDescendantWithClass,
  panelText,
  hasClass,
  drainScheduledCallbacks,
  renderedActionButtons,
  renderedPlayerRows,
  renderedTableSeats,
  capturePanelIdentity,
} = harness;

const ROOT = path.resolve(__dirname, '..');
const MENU_SCRIPT = path.join(ROOT, 'panorama', 'scripts', 'poker_escape_menu.js');
const failures = [];
const MAX_PROGRESS_CHAT_COMMAND_LENGTH = 80;

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


function assertPanelHidden(runtime, id, message) {
  const panel = findPanel(runtime, id);
  assert(panel, `${message} should have #${id}`);
  assert(hasClass(panel, 'PokerHidden'), `${message} should hide #${id}`);
}

function assertPanelVisible(runtime, id, message) {
  const panel = findPanel(runtime, id);
  assert(panel, `${message} should have #${id}`);
  assert(!hasClass(panel, 'PokerHidden'), `${message} should show #${id}`);
}

function assertButtonAffordance(runtime, id, expected, message) {
  const panel = findPanel(runtime, id);
  assert(panel, `${message} should have #${id}`);
  if (Object.prototype.hasOwnProperty.call(expected, 'hidden')) {
    assertEqual(hasClass(panel, 'PokerHidden'), !!expected.hidden, `${message} hidden state for #${id}`);
    if (expected.hidden) assertEqual(panel.hittest, false, `${message} hidden #${id} should not accept pointer hits`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'enabled')) {
    assertEqual(hasClass(panel, 'Disabled'), !expected.enabled, `${message} disabled state for #${id}`);
    assertEqual(panel.hittest !== false, !!expected.enabled, `${message} hittest state for #${id}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'readOnly')) {
    assertEqual(hasClass(panel, 'ReadOnly'), !!expected.readOnly, `${message} read-only state for #${id}`);
    if (expected.readOnly) assertEqual(panel.hittest, false, `${message} read-only #${id} should not accept pointer hits`);
  }
}

function assertProgressImportAvailable(runtime, message) {
  assertButtonAffordance(runtime, 'PokerProgressControls', { hidden: false }, message);
  assertButtonAffordance(runtime, 'PokerProgressCodeInput', { hidden: false }, message);
  assert(findPanel(runtime, 'PokerProgressControls').hittest !== false, `${message} visible progress controls should accept pointer hits`);
  assertButtonAffordance(runtime, 'PokerImportProgressButton', { hidden: false, enabled: true }, message);
}

function assertProgressImportHidden(runtime, message) {
  assertButtonAffordance(runtime, 'PokerProgressCodeInput', { hidden: true, enabled: false }, message);
  assertButtonAffordance(runtime, 'PokerImportProgressButton', { hidden: true, enabled: false }, message);
}

function assertCopyProgressAvailable(runtime, message) {
  assertButtonAffordance(runtime, 'PokerProgressControls', { hidden: false }, message);
  assert(findPanel(runtime, 'PokerProgressControls').hittest !== false, `${message} visible progress controls should accept pointer hits`);
  assertButtonAffordance(runtime, 'PokerExportProgressButton', { hidden: false, enabled: true }, message);
  assertProgressImportHidden(runtime, message);
}

function assertNoGamePlayerRail(runtime, message) {
  assertPanelVisible(runtime, 'PokerTableSurface', message);
  assertPanelVisible(runtime, 'PokerPlayersList', message);
  assertPanelHidden(runtime, 'PokerSeatsList', message);
  assertPanelHidden(runtime, 'PokerTableSeats', message);
  assertPanelHidden(runtime, 'PokerGameLog', message);
  assertPanelHidden(runtime, 'PokerEndMatchButton', message);
}

function assertMatchPanelsVisible(runtime, message) {
  assertPanelVisible(runtime, 'PokerTableSurface', message);
  assertPanelVisible(runtime, 'PokerPlayersList', message);
  assertPanelHidden(runtime, 'PokerSeatsList', message);
  assertPanelVisible(runtime, 'PokerTableSeats', message);
  assertPanelVisible(runtime, 'PokerGameLog', message);
  assertPanelVisible(runtime, 'PokerEndMatchButton', message);
}

function pokerLogLines(runtime) {
  return findDescendantsWithClass(findPanel(runtime, 'PokerGameLog'), 'PokerLogLine', []);
}

function firstPokerCard(panel) {
  return firstDescendantWithClass(panel, 'PokerCard');
}


function collectPanelTexts(panel, out) {
  if (!out) out = [];
  if (!panel || panel.deleted) return out;
  if (panel.text) out.push(String(panel.text));
  for (const child of panel.children || []) collectPanelTexts(child, out);
  return out;
}

function renderedPlayerCards(runtime, playerName) {
  const row = renderedPlayerRows(runtime).find((entry) => entry.name === playerName);
  return row ? row.cardKeys : [];
}

function playerListRows(runtime) {
  return renderedPlayerRows(runtime).map((entry) => entry.panel);
}

function playerListNames(runtime) {
  return playerListRows(runtime).map((row) => panelText(firstDescendantWithClass(row, 'PokerPlayerName')));
}

function playerListRowNamed(runtime, playerName) {
  const rows = playerListRows(runtime);
  for (const row of rows) {
    if (panelText(firstDescendantWithClass(row, 'PokerPlayerName')) === playerName) return row;
  }
  return null;
}

function assertPlayerListRosterRow(runtime, playerName, bankroll, state, message) {
  const row = playerListRowNamed(runtime, playerName);
  assert(row, `${message} should show ${playerName} in #PokerPlayersList`);
  if (!row) return;
  const stackText = panelText(firstDescendantWithClass(row, 'PokerPlayerStack'));
  const stateText = panelText(firstDescendantWithClass(row, 'PokerPlayerState'));
  assert(stackText.includes(`$${bankroll}`), `${message} should show ${playerName} bankroll $${bankroll} in #PokerPlayersList: ${stackText || '<empty>'}`);
  assertEqual(stateText, state, `${message} state label for ${playerName} in #PokerPlayersList`);
}

function persistedProgressCode(runtime) {
  const persisted = runtime && runtime.config ? runtime.config.PokerProgressState : null;
  return persisted && typeof persisted === 'object' ? String(persisted.code || '') : '';
}

function assertResumeCleared(runtimeBundle, message) {
  const hooks = runtimeBundle.hooks;
  const resume = hooks && hooks.state ? hooks.state.resume : null;
  assert(resume, `${message} should keep a default in-memory resume object`);
  assertEqual(resume && (resume.code || ''), '', `${message} should clear in-memory resume code`);
  assertEqual(resume && (resume.id || ''), '', `${message} should clear in-memory resume id`);
  assertEqual(!!(resume && resume.payload), false, `${message} should clear in-memory resume payload`);
  assertEqual(Object.keys((resume && resume.ready) || {}).length, 0, `${message} should clear in-memory resume ready state`);
  assertEqual(((resume && resume.order) || []).length, 0, `${message} should clear in-memory resume order`);
  assertEqual(persistedProgressCode(runtimeBundle.runtime), '', `${message} should clear persisted progress code`);
}

function assertImportedProgressEscapeCleared(runtimeBundle, message) {
  assertResumeCleared(runtimeBundle, message);
  const input = findPanel(runtimeBundle.runtime, 'PokerProgressCodeInput');
  assert(input, `${message} should keep the progress code input mounted`);
  const inputText = panelText(input);
  assertEqual(inputText, '', `${message} should clear visible progress code input`);
  assert(
    inputText.indexOf('POKERPROG1-') === -1,
    `${message} should not leave a stale POKERPROG1 code in the progress input: ${inputText || '<empty>'}`,
  );
  assertEqual(
    panelText(findPanel(runtimeBundle.runtime, 'PokerProgressCodeLabel')),
    'Finish a hand to copy progress, or paste a code to resume.',
    `${message} should restore the default progress import prompt`,
  );
  assertButtonAffordance(runtimeBundle.runtime, 'PokerResumeLeaderButton', { hidden: true, enabled: false }, message);
}

function progressTransferCount(hooks) {
  return Object.keys((hooks && hooks.state && hooks.state.progressTransfers) || {}).length;
}

function assertProgressTransfersCleared(runtimeBundle, message) {
  assertEqual(progressTransferCount(runtimeBundle && runtimeBundle.hooks), 0, `${message} should clear pending progress transfers`);
}

function assertPlayerListOmitsImportedResumeRoster(runtime, payload, message) {
  const playersList = findPanel(runtime, 'PokerPlayersList');
  const text = collectPanelTexts(playersList, []).join('|');
  const roster = payload && Array.isArray(payload.roster) ? payload.roster : [];
  const bankrolls = (payload && payload.bankrolls) || {};
  for (const entry of roster) {
    const name = entry && entry.name ? String(entry.name) : '';
    const key = entry && entry.key ? String(entry.key).toLowerCase() : name.toLowerCase();
    const bankroll = bankrolls[key];
    if (name) {
      assert(!text.includes(name), `${message} should not keep imported resume roster name ${name} in #PokerPlayersList: ${text || '<empty>'}`);
    }
    if (bankroll > 0) {
      assert(!text.includes(`$${bankroll}`), `${message} should not keep imported resume bankroll $${bankroll} in #PokerPlayersList: ${text || '<empty>'}`);
    }
  }
  for (const staleState of ['WAITING', 'LEADER', 'READY', 'OUT']) {
    assert(!text.includes(staleState), `${message} should not keep imported resume state ${staleState} in #PokerPlayersList: ${text || '<empty>'}`);
  }
}

function tableSeatRows(runtime) {
  return renderedTableSeats(runtime).map((entry) => entry.panel);
}

function tableSeatNames(runtime) {
  return renderedTableSeats(runtime).map((entry) => entry.name);
}

function renderedTableSeatCards(runtime, playerName) {
  const row = renderedTableSeats(runtime).find((entry) => entry.name === playerName);
  return row ? row.cardKeys : [];
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

function hasProgressResumeHooks(hooks, message) {
  let ok = true;
  for (const name of [
    'buildProgressSaveCode',
    'decodeProgressSaveCode',
    'importProgressSaveCode',
    'buildResumeLeaderCommand',
    'buildResumeReadyCommand',
    'buildResumeStartCommand',
    'getResumeGate',
    'getResumeId',
    'resolveResumeNextDealerKey',
    'cryptProgressBytes',
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
  return renderedActionButtons(runtime).map((entry) => entry.panel);
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
    assert(hasClass(button, 'ReadOnly'), `${message} ${label} button should have the read-only class`);
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
  const startLabel = findPanel(runtime, 'PokerStartButtonLabel');
  const actions = findPanel(runtime, 'PokerActionButtons');

  assert(hasClass(actions, 'PokerHidden'), `${message} should hide action buttons`);
  assertEqual(actions ? actions.GetChildCount() : 0, 0, `${message} should remove stale action button children`);
  assert(!hasClass(startButton, 'PokerHidden'), `${message} should restore the start button`);
  assertEqual(panelText(startLabel), 'HOST OR JOIN PARTY', `${message} should require hosting or joining a synced party before the next hand`);
}

function assertStartButtonGate(runtime, expectedLabel, expectedEnabled, expectedHidden, message) {
  assertButtonAffordance(runtime, 'PokerStartButton', { hidden: expectedHidden, enabled: expectedEnabled }, message);
  assertEqual(panelText(findPanel(runtime, 'PokerStartButtonLabel')), expectedLabel, `${message} start label`);
}

function assertStartButtonReady(runtime, expectedLabel, message) {
  assertStartButtonGate(runtime, expectedLabel, true, false, message);
  const panel = findPanel(runtime, 'PokerStartButton');
  assert(panel, `${message} should have #PokerStartButton`);
  assert(hasClass(panel, 'Eligible'), `${message} should mark #PokerStartButton eligible`);
}

function readyPayload(name, readyAt, isSelf) {
  const key = String(name).toLowerCase();
  const payload = {
    event: 'PokerReadySeatsChanged',
    key,
    name,
    channel: '[Team]',
    message: 'ready',
    readyAt,
    revision: readyAt,
  };
  if (isSelf) payload.isSelf = true;
  return JSON.stringify(payload);
}

function readySnapshotPayload(entries, revision) {
  return JSON.stringify({
    event: 'PokerReadySeatsChanged',
    action: 'snapshot',
    seats: entries.map((entry, index) => {
      const name = entry.name || entry;
      return {
        key: String(entry.key || name).toLowerCase(),
        name,
        channel: entry.channel || '[Team]',
        message: entry.message || 'ready',
        readyAt: entry.readyAt || revision + index,
      };
    }),
    revision,
  });
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

function clearPartyForLegacyReady(hooks) {
  if (!hooks || !hooks.state) return;
  hooks.state.party = { id: '', mode: 'none', leaderKey: '', leaderName: '', members: {}, order: [] };
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

  seedPartyForReady(gameHooks, names, 'pgame-ready');
  for (let i = 0; i < names.length; i += 1) {
    gameHooks.handleReadyEvent(readyPayload(names[i], i + 1));
  }

  const starter = startRecord || { sender: names[0], message: `poker start ${seed || 'fixed-seed'}` };
  gameHooks.processChatRecord(starter);
  return { runtime: gameRuntime, hooks: gameHooks, game: gameHooks.state.game };
}

function createEngineFixture(overrides) {
  const fixture = createGameRuntime(['Abrams', 'Bebop', 'Calico'], 'engine-fixture');
  const game = fixture.game;
  const source = overrides || {};
  if (game && source.players) game.players = source.players;
  if (game && source.community) game.community = source.community;
  if (game && Object.prototype.hasOwnProperty.call(source, 'pot')) game.pot = source.pot;
  if (game && source.phase) game.phase = source.phase;
  if (game && Object.prototype.hasOwnProperty.call(source, 'currentIndex')) game.currentIndex = source.currentIndex;
  if (game && Object.prototype.hasOwnProperty.call(source, 'currentBet')) game.currentBet = source.currentBet;
  if (game && Object.prototype.hasOwnProperty.call(source, 'minRaise')) game.minRaise = source.minRaise;
  if (game && Object.prototype.hasOwnProperty.call(source, 'lastRaise')) game.lastRaise = source.lastRaise;
  return { runtime: fixture.runtime, hooks: fixture.hooks, game };
}

function createMenuRuntime() {
  const menuRuntime = createValidatorContext();
  runScript(menuRuntime.sandbox, MENU_SCRIPT);
  const menuHooks = menuRuntime.sandbox.__PokerEscapeMenuTestHooks;
  assert(menuHooks, 'escape menu test hooks were not exported for isolated menu runtime');
  return { runtime: menuRuntime, hooks: menuHooks };
}

function createProgressCodeRuntime(names, seed) {
  const progressRuntime = createGameRuntime(names, seed || 'progress-save');
  if (!progressRuntime.hooks || !progressRuntime.game) return { runtime: progressRuntime.runtime, hooks: progressRuntime.hooks, game: progressRuntime.game, code: '', payload: null, id: '' };
  const game = progressRuntime.game;
  progressRuntime.hooks.processChatRecord({ sender: currentPlayer(game).name, message: 'call' });
  progressRuntime.hooks.processChatRecord({ sender: currentPlayer(game).name, message: 'check' });
  progressRuntime.hooks.processChatRecord({ sender: currentPlayer(game).name, message: 'bet $300' });
  progressRuntime.hooks.processChatRecord({ sender: currentPlayer(game).name, message: 'fold' });
  const progress = progressRuntime.hooks.buildProgressSaveCode();
  assertEqual(progress.ok, true, 'progress helper should create an exportable finished hand');
  return {
    runtime: progressRuntime.runtime,
    hooks: progressRuntime.hooks,
    game,
    code: progress.code || '',
    payload: progress.payload || null,
    id: progress.id || '',
  };
}

function progressChecksumFromCode(code) {
  const match = String(code || '').match(/^POKERPROG1-([0-9a-f]{8})-/i);
  return match ? match[1].toLowerCase() : '';
}

function encodeProgressChatChunk(text) {
  return String(text || '');
}

function decodeProgressChatChunk(text) {
  return String(text || '');
}

function splitProgressCodeForChat(code, chunkCount) {
  const text = String(code || '');
  const count = Math.max(2, Math.floor(chunkCount || 2));
  const size = Math.ceil(text.length / count);
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(encodeProgressChatChunk(text.slice(i, i + size)));
  }
  return chunks;
}

function buildProgressOfferMessage(id, checksum, chunkCount) {
  return `[progress offer] poker progress ${id} ${checksum} ${chunkCount}`;
}

function buildProgressChunkMessage(id, checksum, index, chunkCount, chunk) {
  return `[progress chunk] poker progress ${id} ${checksum} ${index}/${chunkCount} ${chunk}`;
}

function submittedChatMessages(runtime, startIndex) {
  return runtime.dispatches
    .slice(startIndex || 0)
    .filter((event) => event.name === 'CitadelChatInputSubmitted')
    .map((event) => String(event.payloadText || ''));
}

function parseProgressShareMessages(messages) {
  const offers = [];
  const chunks = [];
  const offerPattern = /^\[progress offer\] poker progress ([a-z0-9-]+) ([0-9a-f]{8}) ([1-9]\d*)$/i;
  const chunkPattern = /^\[progress chunk\] poker progress ([a-z0-9-]+) ([0-9a-f]{8}) ([1-9]\d*)\/([1-9]\d*) ([A-Za-z0-9_-]+)$/i;
  for (const message of messages || []) {
    const offer = String(message || '').match(offerPattern);
    if (offer) {
      offers.push({ id: offer[1].toLowerCase(), checksum: offer[2].toLowerCase(), count: Number(offer[3]), message });
      continue;
    }
    const chunk = String(message || '').match(chunkPattern);
    if (chunk) {
      chunks.push({
        id: chunk[1].toLowerCase(),
        checksum: chunk[2].toLowerCase(),
        index: Number(chunk[3]),
        count: Number(chunk[4]),
        chunk: chunk[5],
        message,
      });
    }
  }
  return { offers, chunks };
}

function createSyncedPartyRuntime(localName, seed, roster, handNumber) {
  const synced = createMenuRuntime();
  if (!synced.hooks || !hasPartySyncHooks(synced.hooks, `synced party runtime for ${localName}`)) {
    return { runtime: synced.runtime, hooks: synced.hooks, game: null, startCommand: '' };
  }

  const startCommand = synced.hooks.buildSynchronizedStartCommand(seed, roster, handNumber);
  const leaderName = roster && roster[0] && roster[0].name ? roster[0].name : 'Abrams';
  const memberName = roster && roster[1] && roster[1].name ? roster[1].name : 'Bebop';
  for (const record of [
    { sender: leaderName, message: '[party leader] poker party psync', isSelf: localName === leaderName },
    { sender: memberName, message: '[party join] poker party psync', isSelf: localName === memberName },
    { sender: leaderName, message: startCommand, isSelf: localName === leaderName },
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
  const progressHooksAvailable = hasProgressResumeHooks(hooks, 'escape menu progress resume hooks');
  const modules = hooks.modules || {};
  for (const [moduleName, functionNames] of Object.entries({
    StartSync: ['openMenu', 'requestFreshState', 'noteBridgeEvent', 'getProjection', 'afterSnapshotApplied'],
    CommandReducer: ['decode', 'apply', 'applyRecord', 'applyPayload'],
    PokerEngine: ['createGame', 'getLegalActions', 'applyAction', 'advanceAfterAction', 'buildPots', 'showdown', 'evaluateHand', 'compareHands'],
    ProgressResume: ['applyStartCommand'],
    PendingSelfAction: ['record', 'read', 'clear', 'resolveSelfRecord', 'markApplied'],
    CardPresenter: ['render', 'update', 'imageSrc', 'displayRank', 'suitGlyph'],
    TableRenderer: ['renderGame', 'renderCommunity', 'renderPlayers', 'renderTableSeats', 'renderActions', 'renderLog'],
    Affordance: ['apply', 'button', 'hidden'],
    PokerButtonState: ['get', 'getStartGate', 'getResumeGate'],
    LateJoinQueue: ['queued', 'buyIn', 'apply', 'describe'],
  })) {
    assert(modules[moduleName], `${moduleName} module should be exposed to behavior-level hooks`);
    for (const functionName of functionNames) {
      assert(
        modules[moduleName] && typeof modules[moduleName][functionName] === 'function',
        `${moduleName}.${functionName} should be exposed as a behavior-level hook`,
      );
    }
  }
  if (modules.CommandReducer) {
    const decodedResumeStart = modules.CommandReducer.decode({ sender: 'Abrams', message: 'poker resume r123 hand 2 leader hantu%20raya roster abrams~Abrams|hantu%20raya~Hantu%20Raya seed sresume' });
    assertEqual(decodedResumeStart.type, 'resume-start', 'command reducer should decode resume-start records once');
    assertEqual(decodedResumeStart.id, 'r123', 'command reducer resume-start decode should expose id');
    assertEqual(decodedResumeStart.handNumber, 2, 'command reducer resume-start decode should expose hand number');
    assertEqual(decodedResumeStart.leaderKey, 'hantu raya', 'command reducer resume-start decode should normalize decoded leader key');
    assertEqual(decodedResumeStart.rosterText, 'abrams~Abrams|hantu%20raya~Hantu%20Raya', 'command reducer resume-start decode should expose raw roster token');
    assertEqual(decodedResumeStart.seed, 'sresume', 'command reducer resume-start decode should expose seed');

    const decodedSyncedStart = modules.CommandReducer.decode({ sender: 'Abrams', message: 'poker start ssync hand 3 roster abrams~Abrams|bebop~Bebop' });
    assertEqual(decodedSyncedStart.type, 'start', 'command reducer should decode synced start records once');
    assertEqual(decodedSyncedStart.seed, 'ssync', 'command reducer synced start decode should expose seed');
    assertEqual(decodedSyncedStart.handNumber, 3, 'command reducer synced start decode should expose hand number');
    assertEqual(decodedSyncedStart.roster.length, 2, 'command reducer synced start decode should expose decoded roster');
    assertEqual(decodedSyncedStart.rosterText, 'abrams~Abrams|bebop~Bebop', 'command reducer synced start decode should expose raw roster text');

    const decodedAction = modules.CommandReducer.decode({ sender: 'Abrams', message: 'raise $400' });
    assertEqual(decodedAction.type, 'action', 'command reducer should decode action records once');
    assertEqual(decodedAction.action, 'raise', 'command reducer action decode should expose action');
    assertEqual(decodedAction.amount, 400, 'command reducer action decode should expose amount');
    assertEqual(modules.CommandReducer.decode({ sender: 'Abrams', message: 'all in' }).type, 'all-in-unsupported', 'command reducer should decode unsupported all-in explicitly');

    const reducerRuntime = createMenuRuntime();
    if (reducerRuntime.hooks && reducerRuntime.hooks.modules && reducerRuntime.hooks.modules.CommandReducer) {
      const reducer = reducerRuntime.hooks.modules.CommandReducer;
      const malformedRoster = reducer.applyRecord({ sender: 'Abrams', message: 'poker start ssync hand 1 roster bad%zz~Abrams' });
      assertEqual(malformedRoster.status, 'Invalid synced poker roster.', 'command reducer applyRecord should reject malformed synced rosters');
      const unknownStart = reducer.applyRecord({ sender: '<unknown>', message: 'poker start ssync hand 1 roster abrams~Abrams|bebop~Bebop' });
      assertEqual(unknownStart.debugReason, 'debug', 'command reducer applyRecord should reject unresolved synced starts at the reducer seam');
      const unsupportedAllIn = reducer.applyRecord({ sender: 'Abrams', message: 'all in' });
      assertEqual(unsupportedAllIn.debugReason, 'debug', 'command reducer applyRecord should reject unsupported all-in explicitly');
    }
  }
  if (progressHooksAvailable) {
    assertEqual(
      hooks.buildResumeLeaderCommand('r123'),
      '[resume leader] poker resume r123',
      'resume leader command builder should use the exact wire phrase',
    );
    assertEqual(
      hooks.buildResumeReadyCommand('r123'),
      '[resume ready] poker resume r123',
      'resume ready command builder should use the exact wire phrase',
    );
    assertEqual(
      hooks.buildResumeStartCommand('r123', 'abrams', partyRoster, 2, 'sresume'),
      'poker resume r123 hand 2 leader abrams seed sresume',
      'resume start command builder should use the exact marker order',
    );
    const samePrefix = hooks.textToUtf8Bytes ? hooks.textToUtf8Bytes('same-prefix') : [115, 97, 109, 101, 45, 112, 114, 101, 102, 105, 120];
    const encryptedA = hooks.cryptProgressBytes(samePrefix, 'seed-a');
    const encryptedB = hooks.cryptProgressBytes(samePrefix, 'seed-b');
    assertEqual(
      JSON.stringify(encryptedA) === JSON.stringify(encryptedB),
      false,
      'progress cipher should hash string seeds so different string seeds produce different byte streams',
    );
  }
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
      JSON.stringify(hooks.decodeRoster('abrams|hantu%20raya')),
      JSON.stringify([
        { key: 'abrams', name: 'Abrams' },
        { key: 'hantu raya', name: 'Hantu Raya' },
      ]),
      'party roster decoder should accept compact key-only roster entries',
    );
    assertEqual(
      JSON.stringify(hooks.decodeRoster('bad%zz~Abrams|bebop~Bebop')),
      JSON.stringify([]),
      'party roster decoder should reject malformed URI escapes',
    );
    assertEqual(
      hooks.buildSynchronizedStartCommand('ssync', partyRoster),
      'poker start ssync hand 1 roster abrams~Abrams|bebop~Bebop',
      'synchronized start builder should preserve names for non-space roster keys',
    );
    assertEqual(
      hooks.buildSynchronizedStartCommand('ssync-space-key', [
        { key: 'jdbeast', name: 'JDBeast' },
        { key: 'hantu raya', name: 'Hantu Raya' },
      ]),
      'poker start ssync-space-key hand 1 roster jdbeast~JDBeast|hantu%20raya',
      'synchronized start builder should compact only roster entries whose keys contain spaces',
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

    const emptyButtonRuntime = createMenuRuntime();
    if (emptyButtonRuntime.hooks) {
      const emptyHooks = emptyButtonRuntime.hooks;
      emptyHooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(emptyButtonRuntime.runtime, 'HOST OR JOIN PARTY', false, false, 'empty lobby button state');
      assertButtonAffordance(emptyButtonRuntime.runtime, 'PokerHostPartyButton', { hidden: false, enabled: true }, 'empty lobby button state');
      assertButtonAffordance(emptyButtonRuntime.runtime, 'PokerJoinPartyButton', { hidden: true, enabled: false }, 'empty lobby button state');
      assertButtonAffordance(emptyButtonRuntime.runtime, 'PokerReadyChatButton', { hidden: true, enabled: false }, 'empty lobby button state');
      assertButtonAffordance(emptyButtonRuntime.runtime, 'PokerProgressControls', { hidden: true }, 'empty lobby button state');
      assertProgressImportHidden(emptyButtonRuntime.runtime, 'empty lobby button state');
      assertButtonAffordance(emptyButtonRuntime.runtime, 'PokerExportProgressButton', { hidden: true, enabled: false }, 'empty lobby button state');
      assertButtonAffordance(emptyButtonRuntime.runtime, 'PokerResumeControls', { hidden: true }, 'empty lobby button state');
      assertButtonAffordance(emptyButtonRuntime.runtime, 'PokerLeaveLobbyButton', { hidden: true }, 'empty lobby button state');

      emptyHooks.state.localPlayerKey = 'abrams';
      emptyButtonRuntime.runtime.config.PokerLocalPlayerKey = 'abrams';
      emptyButtonRuntime.runtime.config.PokerLocalPlayerName = 'Abrams';
      emptyHooks.modules.TableRenderer.renderGame();
      assertButtonAffordance(emptyButtonRuntime.runtime, 'PokerReadyChatButton', { hidden: true, enabled: false }, 'empty lobby known local button state');

      const discoveredPartyRuntime = createMenuRuntime();
      if (discoveredPartyRuntime.hooks && hasPartySyncHooks(discoveredPartyRuntime.hooks, 'fresh discovered party button-state hooks')) {
        const discoveredHooks = discoveredPartyRuntime.hooks;
        discoveredHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party pdiscover', isSelf: false });
        discoveredHooks.modules.TableRenderer.renderGame();
        assertButtonAffordance(discoveredPartyRuntime.runtime, 'PokerJoinPartyButton', { hidden: false, enabled: true }, 'fresh discovered party button state');
        assertButtonAffordance(discoveredPartyRuntime.runtime, 'PokerReadyChatButton', { hidden: true, enabled: false }, 'fresh discovered party button state');
      }
    }

    const memberButtonRuntime = createMenuRuntime();
    if (memberButtonRuntime.hooks && hasPartySyncHooks(memberButtonRuntime.hooks, 'party member button-state hooks')) {
      const memberHooks = memberButtonRuntime.hooks;
      memberHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party pbuttons', isSelf: false });
      memberHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party pbuttons', isSelf: true });
      memberHooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(memberButtonRuntime.runtime, 'WAITING FOR LEADER', false, true, 'party member lobby button state');
      assertButtonAffordance(memberButtonRuntime.runtime, 'PokerHostPartyButton', { hidden: true, enabled: false }, 'party member lobby button state');
      assertButtonAffordance(memberButtonRuntime.runtime, 'PokerJoinPartyButton', { hidden: true, enabled: false }, 'party member lobby button state');
      assertButtonAffordance(memberButtonRuntime.runtime, 'PokerReadyChatButton', { hidden: true, enabled: false }, 'party member lobby button state');
      assertProgressImportHidden(memberButtonRuntime.runtime, 'party member lobby button state');
      assert(panelText(findPanel(memberButtonRuntime.runtime, 'PokerPartyStatusLabel')).includes('Only Abrams can start the synced hand.'), 'party member lobby button state should name the leader who can start');
    }

    const leaderOneButtonRuntime = createMenuRuntime();
    if (leaderOneButtonRuntime.hooks && hasPartySyncHooks(leaderOneButtonRuntime.hooks, 'party leader one-player button-state hooks')) {
      const leaderOneHooks = leaderOneButtonRuntime.hooks;
      leaderOneHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party pone', isSelf: true });
      leaderOneHooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(leaderOneButtonRuntime.runtime, 'WAITING FOR PARTY', false, false, 'party leader one-player button state');
      assert(panelText(findPanel(leaderOneButtonRuntime.runtime, 'PokerPartyStatusLabel')).includes('Need 2 joined party players to start.'), 'party leader one-player button state should explain the party minimum');
      assertProgressImportAvailable(leaderOneButtonRuntime.runtime, 'party leader one-player import controls');
      assertButtonAffordance(leaderOneButtonRuntime.runtime, 'PokerHostPartyButton', { hidden: true, enabled: false }, 'party leader one-player button state');
      assertButtonAffordance(leaderOneButtonRuntime.runtime, 'PokerJoinPartyButton', { hidden: true, enabled: false }, 'party leader one-player button state');
    }

    const leaderTwoButtonRuntime = createMenuRuntime();
    if (leaderTwoButtonRuntime.hooks && hasPartySyncHooks(leaderTwoButtonRuntime.hooks, 'party leader two-player button-state hooks')) {
      const leaderTwoHooks = leaderTwoButtonRuntime.hooks;
      leaderTwoHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party ptwo', isSelf: true });
      leaderTwoHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party ptwo', isSelf: false });
      leaderTwoHooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(leaderTwoButtonRuntime.runtime, 'START SYNCED HAND', true, false, 'party leader two-player button state');
      assertProgressImportAvailable(leaderTwoButtonRuntime.runtime, 'party leader two-player import controls');
      leaderTwoHooks.state.game = {
        active: false,
        finished: true,
        phase: 'finished',
        pot: 0,
        currentBet: 0,
        community: [],
        log: [],
        announcement: null,
        handNumber: 1,
        players: [
          { key: 'abrams', name: 'Abrams', stack: 10200, bet: 0, committed: 0, cards: [], folded: false, acted: false },
          { key: 'bebop', name: 'Bebop', stack: 9800, bet: 0, committed: 0, cards: [], folded: true, acted: false },
        ],
      };
      leaderTwoHooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(leaderTwoButtonRuntime.runtime, 'NEXT SYNCED HAND', true, false, 'party leader finished-hand button state');
      assertCopyProgressAvailable(leaderTwoButtonRuntime.runtime, 'party leader finished-hand progress controls');
    }

    const progressReplaySource = createProgressCodeRuntime(['Abrams', 'Bebop'], 'progress-replay-source');
    if (progressReplaySource.hooks && progressReplaySource.code) {
      const checksum = progressChecksumFromCode(progressReplaySource.code);
      const chunks = splitProgressCodeForChat(progressReplaySource.code, 3);
      const progressMessages = [buildProgressOfferMessage(progressReplaySource.id, checksum, chunks.length)];
      for (let i = 0; i < chunks.length; i += 1) {
        progressMessages.push(buildProgressChunkMessage(progressReplaySource.id, checksum, i + 1, chunks.length, chunks[i]));
      }

      const immediateProgressReplay = createMenuRuntime();
      const snapshotProgressReplay = createMenuRuntime();
      if (immediateProgressReplay.hooks && snapshotProgressReplay.hooks) {
        for (const message of progressMessages) {
          immediateProgressReplay.hooks.processChatRecord({ sender: 'Abrams', channel: '[Party]', message, isSelf: false });
        }
        const snapshotMessages = progressMessages.map((message, index) => ({
          seq: index + 1,
          sender: 'Abrams',
          channel: '[Party]',
          message,
          isSelf: false,
        }));
        snapshotProgressReplay.hooks.modules.CommandReducer.applyPayload({
          event: 'PokerChatMessage',
          action: 'snapshot',
          reason: 'progress-replay-test',
          seq: snapshotMessages.length,
          messages: snapshotMessages,
        });
        assertEqual(immediateProgressReplay.hooks.state.resume.id, progressReplaySource.id, 'progress immediate replay should import the shared progress id');
        assertEqual(snapshotProgressReplay.hooks.state.resume.id, progressReplaySource.id, 'progress snapshot replay should import the shared progress id');
        assertEqual(snapshotProgressReplay.hooks.state.resume.id, immediateProgressReplay.hooks.state.resume.id, 'progress snapshot replay should match immediate replay resume id');
        assertEqual(immediateProgressReplay.hooks.state.game, null, 'progress immediate replay should not create a game before resume start');
        assertEqual(snapshotProgressReplay.hooks.state.game, null, 'progress snapshot replay should not create a game before resume start');
      }
    }

    const emptyLobbyRuntime = createMenuRuntime();
    if (emptyLobbyRuntime.hooks) {
      emptyLobbyRuntime.hooks.modules.TableRenderer.renderGame();
      assertPanelHidden(emptyLobbyRuntime.runtime, 'PokerLeaveLobbyButton', 'empty lobby render');
      emptyLobbyRuntime.hooks.state.resume = { id: 'rleave' };
      emptyLobbyRuntime.hooks.modules.TableRenderer.renderGame();
      assertPanelVisible(emptyLobbyRuntime.runtime, 'PokerLeaveLobbyButton', 'resume lobby render');
    }

    const lobbyRuntime = createMenuRuntime();
    if (lobbyRuntime.hooks && hasPartySyncHooks(lobbyRuntime.hooks, 'lobby table visibility party hooks')) {
      lobbyRuntime.hooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party plobby', isSelf: true });
      lobbyRuntime.hooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party plobby', isSelf: false });
      assertEqual(lobbyRuntime.hooks.state.game, null, 'lobby party waiting should not create a game');
      assertNoGamePlayerRail(lobbyRuntime.runtime, 'lobby party waiting');
      assertPanelVisible(lobbyRuntime.runtime, 'PokerLeaveLobbyButton', 'lobby party waiting');
    }

    const localLeaveRuntime = createMenuRuntime();
    if (localLeaveRuntime.hooks && hasPartySyncHooks(localLeaveRuntime.hooks, 'local leave command party hooks')) {
      const chatTarget = findPanel(localLeaveRuntime.runtime, 'ChatTargetLabel');
      if (chatTarget) chatTarget.text = 'TEAM';
      localLeaveRuntime.hooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party pleave', isSelf: true });
      assertPanelVisible(localLeaveRuntime.runtime, 'PokerLeaveLobbyButton', 'local leave command setup');
      assertHookFunction(localLeaveRuntime.runtime.sandbox, 'PokerEscapeMenuLeaveLobby', 'global ESC menu leave-lobby hook');
      assertEqual(
        typeof localLeaveRuntime.runtime.panels.root.PokerEscapeMenuLeaveLobby,
        'function',
        'context panel leave-lobby hook should be exported',
      );
      localLeaveRuntime.runtime.sandbox.PokerEscapeMenuLeaveLobby();
      assertEqual(localLeaveRuntime.hooks.state.party.id, '', 'local leave command should clear local party state');
      assertEqual(localLeaveRuntime.hooks.state.game, null, 'local leave command should clear local active game state');
      for (let i = 0; i < 8 && localLeaveRuntime.runtime.schedules.length; i += 1) {
        localLeaveRuntime.runtime.schedules.shift().callback();
      }
      assert(
        localLeaveRuntime.runtime.dispatches.some(
          (event) => event.name === 'CitadelChatInputSubmitted' && event.payloadText === '[party leave] poker party pleave',
        ),
        'local leave command should submit the party leave chat record',
      );
    }

    const staleHostRuntime = createMenuRuntime();
    if (staleHostRuntime.hooks && hasPartySyncHooks(staleHostRuntime.hooks, 'stale host party id regression hooks')) {
      const staleHooks = staleHostRuntime.hooks;
      const stalePartyId = 'pstale-host';
      const staleChatTarget = findPanel(staleHostRuntime.runtime, 'ChatTargetLabel');
      if (staleChatTarget) staleChatTarget.text = 'TEAM';
      staleHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party ' + stalePartyId, isSelf: false });
      staleHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party ' + stalePartyId, isSelf: true });
      assertEqual(staleHooks.state.party.id, stalePartyId, 'stale host regression setup should join the old lobby id');
      assertEqual(staleHooks.state.party.mode, 'member', 'stale host regression setup should join as a member before leaving');
      assertHookFunction(staleHostRuntime.runtime.sandbox, 'PokerEscapeMenuLeaveLobby', 'stale host regression leave-lobby hook');
      assertHookFunction(staleHostRuntime.runtime.sandbox, 'PokerEscapeMenuHostParty', 'stale host regression host-party hook');
      staleHostRuntime.runtime.sandbox.PokerEscapeMenuLeaveLobby();
      assertEqual(staleHooks.state.party.id, '', 'stale host regression leave should clear the old lobby id');
      assertEqual(staleHooks.state.game, null, 'stale host regression leave should clear any active game');
      for (let i = 0; i < 8 && staleHostRuntime.runtime.schedules.length; i += 1) {
        staleHostRuntime.runtime.schedules.shift().callback();
      }
      const fixedHostNow = 1700000100000;
      staleHostRuntime.runtime.sandbox.Date.now = () => fixedHostNow;
      staleHooks.state.lastSendMs = fixedHostNow - 700;
      staleHooks.state.lastLobbyLeaveMs = fixedHostNow - 700;
      const dispatchesBeforeHost = staleHostRuntime.runtime.dispatches.length;
      staleHostRuntime.runtime.sandbox.PokerEscapeMenuHostParty();
      for (let i = 0; i < 8 && staleHostRuntime.runtime.schedules.length; i += 1) {
        staleHostRuntime.runtime.schedules.shift().callback();
      }
      const hostCommands = staleHostRuntime.runtime.dispatches
        .slice(dispatchesBeforeHost)
        .filter((event) => event.name === 'CitadelChatInputSubmitted' && String(event.payloadText || '').indexOf('[party leader] poker party ') === 0)
        .map((event) => event.payloadText);
      assert(hostCommands.length > 0, 'throttle repro should submit a fresh [party leader] after recent leave instead of suppressing recovery');
      if (hostCommands.length > 0) {
        const hostCommand = hostCommands[hostCommands.length - 1] || '';
        const freshPartyId = hostCommand.replace('[party leader] poker party ', '');
        assert(freshPartyId && freshPartyId !== stalePartyId, 'stale host regression host command should use a fresh party id instead of the stale lobby id');
        assertEqual(staleHooks.state.party.mode, 'leader', 'stale host regression host click should leave local state in leader mode');
        assertEqual(staleHooks.state.party.id, freshPartyId, 'stale host regression local leader state should use the fresh host command id');

        const sentPartyId = staleHooks.state.party.id;
        staleHooks.state.lastSendMs = fixedHostNow - 700;
        staleHooks.state.lastLobbyLeaveMs = 0;
        const dispatchesBeforeRapidHost = staleHostRuntime.runtime.dispatches.length;
        staleHostRuntime.runtime.sandbox.PokerEscapeMenuHostParty();
        for (let i = 0; i < 8 && staleHostRuntime.runtime.schedules.length; i += 1) {
          staleHostRuntime.runtime.schedules.shift().callback();
        }
        const rapidHostCommands = staleHostRuntime.runtime.dispatches
          .slice(dispatchesBeforeRapidHost)
          .filter((event) => event.name === 'CitadelChatInputSubmitted' && String(event.payloadText || '').indexOf('[party leader] poker party ') === 0)
          .map((event) => event.payloadText);
        assertEqual(rapidHostCommands.length, 0, 'second rapid host without a fresh leave should stay throttled');
        assertEqual(staleHooks.state.party.id, sentPartyId, 'second rapid host without a fresh leave should not replace local party state with an unsent id');
      }
    }

    const foreignLeaderRuntime = createMenuRuntime();
    if (foreignLeaderRuntime.hooks && hasPartySyncHooks(foreignLeaderRuntime.hooks, 'foreign leader while hosting regression hooks')) {
      const foreignHooks = foreignLeaderRuntime.hooks;
      const localPartyId = 'plocal-a';
      const foreignPartyId = 'pforeign-b';
      const foreignChatTarget = findPanel(foreignLeaderRuntime.runtime, 'ChatTargetLabel');
      if (foreignChatTarget) foreignChatTarget.text = 'TEAM';
      foreignHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party ' + localPartyId, isSelf: true });
      assertEqual(foreignHooks.state.party.id, localPartyId, 'foreign leader regression setup should retain the local hosted party id');
      assertEqual(foreignHooks.state.party.mode, 'leader', 'foreign leader regression setup should mark the local user as hosting');
      foreignHooks.processChatRecord({ sender: 'Bebop', message: '[party leader] poker party ' + foreignPartyId, isSelf: false });
      assertEqual(foreignHooks.state.party.id, localPartyId, 'foreign party leader should not replace the local hosted party id');
      assertEqual(foreignHooks.state.party.mode, 'leader', 'foreign party leader should not demote the local host');
      assertEqual(foreignHooks.state.party.leaderKey, 'abrams', 'foreign party leader should not replace the local leader key');
      const dispatchesBeforeJoin = foreignLeaderRuntime.runtime.dispatches.length;
      foreignLeaderRuntime.runtime.sandbox.PokerEscapeMenuJoinParty();
      for (let i = 0; i < 8 && foreignLeaderRuntime.runtime.schedules.length; i += 1) {
        foreignLeaderRuntime.runtime.schedules.shift().callback();
      }
      const foreignJoinCommands = foreignLeaderRuntime.runtime.dispatches
        .slice(dispatchesBeforeJoin)
        .filter((event) => event.name === 'CitadelChatInputSubmitted' && String(event.payloadText || '').indexOf('[party join] poker party ') === 0)
        .map((event) => event.payloadText);
      assert(
        foreignJoinCommands.every((command) => command !== '[party join] poker party ' + foreignPartyId),
        `foreign party leader should not make the local menu join the foreign party id: ${foreignJoinCommands.join('|') || '<none>'}`,
      );
      assertEqual(foreignHooks.state.party.id, localPartyId, 'join after a foreign leader should still target the retained local hosted party id');
    }

    const staleReadyRuntime = createMenuRuntime();
    if (staleReadyRuntime.hooks && hasPartySyncHooks(staleReadyRuntime.hooks, 'stale ready clear host regression hooks')) {
      const staleReadyHooks = staleReadyRuntime.hooks;
      const oldPartyId = 'pold-ready';
      const staleReadyChatTarget = findPanel(staleReadyRuntime.runtime, 'ChatTargetLabel');
      if (staleReadyChatTarget) staleReadyChatTarget.text = 'TEAM';
      staleReadyHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party ' + oldPartyId, isSelf: false });
      staleReadyHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party ' + oldPartyId, isSelf: true });
      staleReadyHooks.handleReadyEvent(readySnapshotPayload([
        { key: 'abrams', name: 'Abrams', readyAt: 10 },
        { key: 'bebop', name: 'Bebop', readyAt: 11 },
      ], 11));
      assertEqual(staleReadyHooks.getReadySeatArray().length, 2, 'stale ready regression setup should ingest the old ready snapshot before leaving');
      staleReadyRuntime.runtime.sandbox.PokerEscapeMenuLeaveLobby();
      for (let i = 0; i < 8 && staleReadyRuntime.runtime.schedules.length; i += 1) {
        staleReadyRuntime.runtime.schedules.shift().callback();
      }
      assertEqual(staleReadyHooks.getReadySeatArray().length, 0, 'leave clear should empty old ready seats before fresh hosting');
      staleReadyHooks.handleReadyEvent(readySnapshotPayload([
        { key: 'abrams', name: 'Abrams', readyAt: 10 },
        { key: 'bebop', name: 'Bebop', readyAt: 11 },
      ], 11));
      const readySeatsAfterStaleSnapshot = staleReadyHooks.getReadySeatArray();
      assert(
        !readySeatsAfterStaleSnapshot.some((seat) => seat.key === 'bebop'),
        `stale ready snapshot after leave should not resurrect the old joined seat: ${readySeatsAfterStaleSnapshot.map((seat) => seat.key).join('|') || '<empty>'}`,
      );
      const dispatchesBeforeFreshHost = staleReadyRuntime.runtime.dispatches.length;
      staleReadyRuntime.runtime.sandbox.PokerEscapeMenuHostParty();
      for (let i = 0; i < 8 && staleReadyRuntime.runtime.schedules.length; i += 1) {
        staleReadyRuntime.runtime.schedules.shift().callback();
      }
      const freshHostCommands = staleReadyRuntime.runtime.dispatches
        .slice(dispatchesBeforeFreshHost)
        .filter((event) => event.name === 'CitadelChatInputSubmitted' && String(event.payloadText || '').indexOf('[party leader] poker party ') === 0)
        .map((event) => event.payloadText);
      assert(freshHostCommands.length > 0, 'fresh host after leave should submit a new party leader command');
      const freshReadyHostCommand = freshHostCommands[freshHostCommands.length - 1] || '';
      const freshReadyPartyId = freshReadyHostCommand.replace('[party leader] poker party ', '');
      assert(freshReadyPartyId && freshReadyPartyId !== oldPartyId, 'fresh host after leave should use a new party id instead of the old stale id');
      assertEqual(staleReadyHooks.state.party.id, freshReadyPartyId, 'fresh host after leave should retain the fresh party id in local state');
      assertEqual(staleReadyHooks.getReadySeatArray().length, 0, 'fresh host after stale ready snapshot should keep old ready seats cleared');
    }

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
    assertEqual(gate.hidden, true, 'member start gate should hide the leader-only start/next-hand button');

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

  seedPartyForReady(hooks, ['Abrams', 'Bebop'], 'pmain-ready');
  hooks.handleReadyEvent(readyPayload('Abrams', 1));
  assertEqual(hooks.getReadySeatArray().length, 1, 'first ready payload should create one seat');
  assertEqual(hooks.isStartEligible(hooks.getReadySeatArray().length), false, 'one ready player should not be start eligible');

  hooks.handleReadyEvent(readyPayload('Bebop', 2));
  assertEqual(hooks.getReadySeatArray().length, 2, 'second ready payload should create a second seat');
  assertEqual(hooks.isStartEligible(hooks.getReadySeatArray().length), true, 'two ready payloads should make start eligible');

  const readyRailRuntime = createMenuRuntime();
  if (readyRailRuntime.hooks) {
    const readyNames = [
      'Player 01',
      'Player 02',
      'Player 03',
      'Player 04',
      'Player 05',
      'Player 06',
      'Player 07',
      'Player 08',
      'Player 09',
      'Player 10',
      'Player 11',
      'Player 12',
      'Player 13',
    ];
    seedPartyForReady(readyRailRuntime.hooks, readyNames, 'prail-ready');
    for (let i = 0; i < readyNames.length; i += 1) {
      readyRailRuntime.hooks.handleReadyEvent(readyPayload(readyNames[i], i + 1));
    }
    assertEqual(readyRailRuntime.hooks.getReadySeatArray().length, 12, 'ready rail should cap rendered ready state at twelve seats');
    assertEqual(readyRailRuntime.hooks.isStartEligible(readyRailRuntime.hooks.getReadySeatArray().length), true, 'twelve capped ready seats should remain start eligible');
    assertEqual(panelText(findPanel(readyRailRuntime.runtime, 'PokerReadyCountLabel')), '12', 'ready rail summary should show the maximum seat count, not the transient ready count');
    readyRailRuntime.hooks.modules.TableRenderer.renderGame();
    assertNoGamePlayerRail(readyRailRuntime.runtime, 'ready lobby rail render');
    const readyPlayerNames = playerListNames(readyRailRuntime.runtime);
    assertEqual(readyPlayerNames.length, 12, 'ready lobby rail render should show the twelve capped ready players in #PokerPlayersList');
    assert(readyPlayerNames.includes('Player 01'), `ready lobby rail render should include the first ready player: ${readyPlayerNames.join('|') || '<empty>'}`);
    assert(readyPlayerNames.includes('Player 12'), `ready lobby rail render should include the twelfth ready player: ${readyPlayerNames.join('|') || '<empty>'}`);
    assert(!readyPlayerNames.includes('Player 13'), `ready lobby rail render should not include a thirteenth overflow ready player: ${readyPlayerNames.join('|') || '<empty>'}`);
  }

  clearPartyForLegacyReady(hooks);
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
    assertPanelHidden(runtime, 'PokerExportProgressButton', 'active hand progress controls');
    hooks.state.localPlayerKey = firstActor.key;
    runtime.config.PokerLocalPlayerKey = firstActor.key;
    runtime.config.PokerLocalPlayerName = firstActor.name;
    hooks.modules.TableRenderer.renderGame();
    assertButtonAffordance(runtime, 'PokerStartButton', { hidden: true, enabled: false }, 'active local actor button state');
    assertButtonAffordance(runtime, 'PokerReadyChatButton', { hidden: true, enabled: false }, 'active local actor button state');
    assertButtonAffordance(runtime, 'PokerProgressControls', { hidden: true }, 'active local actor button state');
    assertButtonAffordance(runtime, 'PokerResumeControls', { hidden: true }, 'active local actor button state');
    assertButtonAffordance(runtime, 'PokerPartyControls', { hidden: true }, 'active local actor button state');
    assertEnabledActionButtons(runtime, ['CALL $100', 'RAISE TO $400', 'RAISE TO $700', 'FOLD'], 'active local actor');

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

    hooks.state.localPlayerKey = 'abrams';
    runtime.config.PokerLocalPlayerKey = 'abrams';
    runtime.config.PokerLocalPlayerName = 'Abrams';
    const progressChatTarget = findPanel(runtime, 'ChatTargetLabel');
    if (progressChatTarget) progressChatTarget.text = 'TEAM';
    const progressShareStart = runtime.dispatches.length;
    const manualThrottleSentinel = 123456789;
    hooks.state.lastSendMs = manualThrottleSentinel;
    const folder = currentPlayer(game);
    hooks.processChatRecord({ sender: folder.name, message: 'fold' });
    assertEqual(game.finished, true, 'fold should finish the hand when one player remains');
    assertEqual(game.active, false, 'finished hand should no longer be active');
    assertEqual(game.phase, 'finished', 'finished hand should use the finished phase');
    assertEqual(bettor.stack, 10200, 'fold winner should receive the full pot including blinds');
    assertInactiveLobbyControls(runtime, 'finished hand render');
    assertCopyProgressAvailable(runtime, 'finished hand progress export button state');
    assertButtonAffordance(runtime, 'PokerActionButtons', { hidden: true }, 'finished hand progress export button state');
    assertEqual(findPanel(runtime, 'PokerActionButtons').GetChildCount(), 0, 'finished hand progress export button state should remove action button children');
    assertButtonAffordance(runtime, 'PokerResumeControls', { hidden: true }, 'finished hand progress export button state');
    assertAnnouncerIncludes(
      runtime,
      [bettor.name, 'wins by fold', 'Pot $700', 'awarded'],
      'fold win',
    );

    if (progressHooksAvailable) {
      const progress = hooks.buildProgressSaveCode();
      assertEqual(progress.ok, true, 'finished hand should export progress');
      assert(progress.code && progress.code.indexOf('POKERPROG1-') === 0, 'progress export should use the POKERPROG1 prefix');
      assertEqual(String(progress.code).includes('Abrams'), false, 'progress code should not include the first player name');
      assertEqual(String(progress.code).includes('Bebop'), false, 'progress code should not include the second player name');
      const decoded = hooks.decodeProgressSaveCode(progress.code);
      assertEqual(decoded.ok, true, 'exported progress code should decode');
      if (decoded.ok) {
        assertEqual(decoded.payload.version, 1, 'decoded progress payload should use version 1');
        assertEqual(decoded.payload.kind, 'poker-progress', 'decoded progress payload should use the progress kind');
        assertEqual(JSON.stringify(decoded.payload.roster), JSON.stringify(playerIdentities(game)), 'decoded progress payload should preserve saved roster order');
        for (const player of game.players) {
          assert(Object.prototype.hasOwnProperty.call(decoded.payload.bankrolls, player.key), `decoded progress bankrolls should include ${player.key}`);
        }
        assertEqual(decoded.payload.lastHandNumber, game.handNumber, 'decoded progress should keep the finished hand number');
        assertEqual(decoded.payload.nextHandNumber, game.handNumber + 1, 'decoded progress should keep the next hand number');
        assertEqual(decoded.payload.dealerKey, game.players[game.dealerIndex].key, 'decoded progress should keep the saved dealer key');
        assertEqual(decoded.id, hooks.getResumeId(decoded.payload), 'decoded progress id should match getResumeId');
      }
    }
      const copyProgressRuntime = createProgressCodeRuntime(['Copy Leader', 'Copy Member'], 'copy-progress-regression');
      if (copyProgressRuntime.code && copyProgressRuntime.payload) {
        const copyRuntime = copyProgressRuntime.runtime;
        const copyHooks = copyProgressRuntime.hooks;
        copyHooks.modules.TableRenderer.renderGame();
        assertCopyProgressAvailable(copyRuntime, 'copy progress regression copy-only progress controls');
        const copyInput = findPanel(copyRuntime, 'PokerProgressCodeInput');
        assert(copyInput, 'copy progress regression should have a progress code input');
        assertEqual(panelText(copyInput), '', 'copy progress regression should start with an empty import text entry');
        const copyStart = copyRuntime.dispatches.length;
        const copyHandler = copyRuntime.sandbox.PokerEscapeMenuCopyProgress;
        assertEqual(typeof copyHandler, 'function', 'copy progress regression should expose the copy handler');
        const copyResult = typeof copyHandler === 'function' ? copyHandler() : { ok: false };
        assertEqual(copyResult && copyResult.ok, true, 'copy progress regression should return an ok export result');
        assert(copyResult && copyResult.code && copyResult.code.indexOf('POKERPROG1-') === 0, 'copy progress regression should return a POKERPROG1 code');
        assertEqual(panelText(findPanel(copyRuntime, 'PokerStatusLabel')).indexOf('progress ' + copyResult.id) >= 0, true, 'copy progress regression should update status with the exported progress id');
        assertEqual(panelText(copyInput), '', 'copy progress regression should not populate the import text entry');
        assertEqual(!!(copyHooks.state.resume && copyHooks.state.resume.payload), false, 'copy progress regression should not create imported resume payload state');
        copyHooks.modules.TableRenderer.renderGame();
        assertCopyProgressAvailable(copyRuntime, 'copy progress regression should keep copy-only progress controls');
        assertButtonAffordance(copyRuntime, 'PokerResumeControls', { hidden: true }, 'copy progress regression should not reveal imported resume controls');
        assertStartButtonGate(copyRuntime, 'NEXT SYNCED HAND', true, false, 'copy progress regression should leave the normal finished-hand start path available');
        drainScheduledCallbacks(copyRuntime, 256);
        const copyMessages = submittedChatMessages(copyRuntime, copyStart);
        const copyShare = parseProgressShareMessages(copyMessages);
        assertEqual(copyShare.offers.length, 0, `copy progress regression should not submit progress offers: ${copyMessages.join('|') || '<none>'}`);
        assertEqual(copyShare.chunks.length, 0, `copy progress regression should not submit progress chunks: ${copyMessages.join('|') || '<none>'}`);
      }


    if (progressHooksAvailable) {
      drainScheduledCallbacks(runtime, 256);
      const finishedHandMessages = submittedChatMessages(runtime, progressShareStart);
      const finishedHandShare = parseProgressShareMessages(finishedHandMessages);
      assertEqual(finishedHandShare.offers.length, 0, `finished hand should not auto-submit progress offers: ${finishedHandMessages.join('|') || '<none>'}`);
      assertEqual(finishedHandShare.chunks.length, 0, `finished hand should not auto-submit progress chunks: ${finishedHandMessages.join('|') || '<none>'}`);
      assert(
        !finishedHandMessages.some((message) => message.indexOf('POKERPROG1-') === 0),
        `finished hand should not rely on one raw full POKERPROG1 chat command: ${finishedHandMessages.join('|') || '<none>'}`,
      );
      assertEqual(
        hooks.state.lastSendMs,
        manualThrottleSentinel,
        'finished hand should not advance the manual command throttle timestamp',
      );
    }

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
    assertEqual(syncedAbrams.startCommand, 'poker start ssync hand 1 roster abrams~Abrams|bebop~Bebop', 'synced runtime should preserve non-space roster names in the start command');
    assertEqual(syncedAbrams.game.seed, 'ssync', 'synced roster start should use the shared seed without appending sender text');
    assertEqual(syncedBebop.game.seed, 'ssync', 'second synced roster start should use the same shared seed without appending sender text');
    assertSameSyncedGame(syncedBebop.game, syncedAbrams.game, 'two clients receiving the same roster start');
    assertMatchPanelsVisible(syncedAbrams.runtime, 'synced active hand render');
    assertPanelHidden(syncedBebop.runtime, 'PokerEndMatchButton', 'synced member active hand render');
    assertPanelVisible(syncedAbrams.runtime, 'PokerLeaveLobbyButton', 'synced active hand render');
    assertActiveGameControls(
      syncedAbrams.runtime,
      currentPlayer(syncedAbrams.game).name,
      syncedAbrams.game.phase,
      ['CALL $100', 'RAISE TO $400', 'RAISE TO $700', 'FOLD'],
      ['CHECK', 'BET $200', 'BET $500'],
      'synced active hand render',
    );

    syncedAbrams.game.log = [
      'history line 1',
      'history line 2',
      'history line 3',
      'history line 4',
      'history line 5',
      'history line 6',
      'history line 7',
      'history line 8',
      'history line 9',
      'history line 10',
      'history line 11',
      'history line 12',
      'history line 13',
      'history line 14',
    ];
    syncedAbrams.hooks.processChatRecord({ sender: '<unknown>', message: 'check', isSelf: false });
    const syncedLogLines = pokerLogLines(syncedAbrams.runtime);
    const syncedLogTexts = collectPanelTexts(findPanel(syncedAbrams.runtime, 'PokerGameLog'), []);
    const syncedLogText = syncedLogTexts.join('|');
    assertEqual(syncedLogLines.length, 12, `synced active hand render should cap visible log rows at twelve: ${syncedLogText || '<empty>'}`);
    assert(!syncedLogTexts.includes('history line 1'), `synced active hand render should drop older log rows: ${syncedLogText || '<empty>'}`);
    assert(!syncedLogTexts.includes('history line 2'), `synced active hand render should drop older log rows: ${syncedLogText || '<empty>'}`);
    assert(!syncedLogTexts.includes('history line 3'), `synced active hand render should drop older log rows: ${syncedLogText || '<empty>'}`);
    assert(syncedLogTexts.includes('history line 14'), `synced active hand render should keep the newest history rows: ${syncedLogText || '<empty>'}`);

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

    assertHookFunction(syncedAbrams.runtime.sandbox, 'PokerEscapeMenuEndMatch', 'global ESC menu end-match hook');
    syncedAbrams.runtime.sandbox.PokerEscapeMenuEndMatch();
    assertEqual(syncedAbrams.hooks.state.game, null, 'end-match hook should clear the synced hand state');
    assertNoGamePlayerRail(syncedAbrams.runtime, 'end-match render');
    assertEqual(pokerLogLines(syncedAbrams.runtime).length, 0, 'end-match render should clear stale visible log rows');
  }

  const tableRoster = [
    { key: 'abrams', name: 'Abrams' },
    { key: 'bebop', name: 'Bebop' },
    { key: 'calico', name: 'Calico' },
  ];
  const tableRuntime = createSyncedPartyRuntime('Abrams', 'stable-table-seats', tableRoster, 1);
  if (tableRuntime.hooks && tableRuntime.game) {
    tableRuntime.hooks.modules.TableRenderer.renderGame();
    const playersList = findPanel(tableRuntime.runtime, 'PokerPlayersList');
    const tableSeats = findPanel(tableRuntime.runtime, 'PokerTableSeats');
    assert(playersList && tableSeats && playersList !== tableSeats, 'table render should keep #PokerPlayersList and #PokerTableSeats as distinct surfaces');
    assertEqual(
      findDescendantsWithClass(playersList, 'PokerTableSeat', []).length,
      0,
      'table render should not put compact table-edge seats in the full left player list',
    );
    assertEqual(
      findDescendantsWithClass(tableSeats, 'PokerPlayerRow', []).length,
      0,
      'table render should not put full left-list player rows in the compact table-edge overlay',
    );
    const rows = tableSeatRows(tableRuntime.runtime);
    const names = tableSeatNames(tableRuntime.runtime);
    assertEqual(rows.length, 3, 'synced three-player table render should create one table-edge seat per player');
    for (const name of ['Abrams', 'Bebop', 'Calico']) {
      assert(names.includes(name), `synced three-player table render should include ${name} in table-edge seats: ${names.join('|') || '<empty>'}`);
    }
    assertEqual(
      JSON.stringify(renderedTableSeatCards(tableRuntime.runtime, 'Abrams')),
      JSON.stringify(tableRuntime.game.players[0].cards.map(cardKey)),
      'Abrams client table-edge seat should reveal Abrams hole cards',
    );
    assertEqual(
      JSON.stringify(renderedTableSeatCards(tableRuntime.runtime, 'Bebop')),
      JSON.stringify(['??', '??']),
      'Abrams client table-edge seat should keep Bebop hole cards hidden during an active hand',
    );
    assertEqual(
      JSON.stringify(renderedTableSeatCards(tableRuntime.runtime, 'Calico')),
      JSON.stringify(['??', '??']),
      'Abrams client table-edge seat should keep Calico hole cards hidden during an active hand',
    );
    assert(rows.some((row) => hasClass(row, 'Current')), 'synced three-player table render should mark the current actor table-edge seat');
  }

  const overflowRuntime = createGameRuntime(['Abrams', 'Bebop', 'Calico', 'Dynamo', 'Eagle', 'Fathom', 'Geist'], 'seat-overflow');
  if (overflowRuntime.hooks && overflowRuntime.game) {
    overflowRuntime.hooks.modules.TableRenderer.renderGame();
    assertEqual(tableSeatRows(overflowRuntime.runtime).length, 6, 'seven-player table render should cap table-edge seats at six');
    const tableText = collectPanelTexts(findPanel(overflowRuntime.runtime, 'PokerTableSeats'), []).join('|');
    assert(tableText.includes('+1 players in list'), `seven-player table render should show the overflow count on the felt: ${tableText || '<empty>'}`);
    const playerListText = collectPanelTexts(findPanel(overflowRuntime.runtime, 'PokerPlayersList'), []).join('|');
    assert(playerListText.includes('Geist'), `seven-player table render should keep overflow player Geist in the left player list: ${playerListText || '<empty>'}`);
  }

  const visibilityRuntime = createMenuRuntime();
  if (visibilityRuntime.hooks) {
    visibilityRuntime.hooks.modules.TableRenderer.renderGame();
    assertNoGamePlayerRail(visibilityRuntime.runtime, 'empty no-game rail render');
    assertEqual(playerListRows(visibilityRuntime.runtime).length, 0, 'empty no-game rail render should not invent player rows');
    seedPartyForReady(visibilityRuntime.hooks, ['Abrams', 'Bebop'], 'pvisible-ready');
    visibilityRuntime.hooks.handleReadyEvent(readyPayload('Abrams', 1));
    visibilityRuntime.hooks.handleReadyEvent(readyPayload('Bebop', 2));
    visibilityRuntime.hooks.modules.TableRenderer.renderGame();
    assertNoGamePlayerRail(visibilityRuntime.runtime, 'ready no-game rail render');
    const readyNames = playerListNames(visibilityRuntime.runtime);
    assertEqual(JSON.stringify(readyNames), JSON.stringify(['Abrams', 'Bebop']), 'ready no-game rail render should show ready players through #PokerPlayersList in ready order');
    visibilityRuntime.hooks.processChatRecord({ sender: 'Abrams', message: 'poker start table-visibility' });
    visibilityRuntime.hooks.modules.TableRenderer.renderGame();
    assertPanelVisible(visibilityRuntime.runtime, 'PokerPlayersList', 'assigned-game table render');
    assertPanelVisible(visibilityRuntime.runtime, 'PokerTableSeats', 'assigned-game table render');
  }

  const windowRuntime = createMenuRuntime();
  if (windowRuntime.hooks) {
    const compatibilityAnchor = findPanel(windowRuntime.runtime, 'PokerAnitaPanel');
    const lobbyWindow = findPanel(windowRuntime.runtime, 'PokerLobbyWindow');
    const tableWindow = findPanel(windowRuntime.runtime, 'PokerTableWindow');
    const playersWindow = findPanel(windowRuntime.runtime, 'PokerPlayersWindow');
    const historyWindow = findPanel(windowRuntime.runtime, 'PokerHistoryWindow');
    const actionsWindow = findPanel(windowRuntime.runtime, 'PokerActionsWindow');
    const leaveLobbyButton = findPanel(windowRuntime.runtime, 'PokerLeaveLobbyButton');
    assert(lobbyWindow && tableWindow && playersWindow && historyWindow && actionsWindow && leaveLobbyButton, 'five-window menu runtime should provide all poker floating windows and leave-lobby button for cache/open logic');
    assert(compatibilityAnchor && compatibilityAnchor !== lobbyWindow && compatibilityAnchor !== tableWindow, 'five-window menu runtime should keep #PokerAnitaPanel as a separate hidden compatibility anchor');
    assert(hasClass(compatibilityAnchor, 'PokerHidden'), 'five-window menu runtime should keep #PokerAnitaPanel hidden');
    assertEqual(windowRuntime.hooks.state.lobbyWindow, null, 'five-window menu runtime should start before caching #PokerLobbyWindow');
    assertEqual(windowRuntime.hooks.state.tableWindow, null, 'five-window menu runtime should start before caching #PokerTableWindow');
    assertEqual(windowRuntime.hooks.state.playersWindow, null, 'five-window menu runtime should start before caching #PokerPlayersWindow');
    assertEqual(windowRuntime.hooks.state.historyWindow, null, 'five-window menu runtime should start before caching #PokerHistoryWindow');
    assertEqual(windowRuntime.hooks.state.actionsWindow, null, 'five-window menu runtime should start before caching #PokerActionsWindow');
    assertEqual(windowRuntime.hooks.state.leaveLobbyButton, null, 'five-window menu runtime should start before caching #PokerLeaveLobbyButton');
    windowRuntime.runtime.sandbox.PokerEscapeMenuToggle();
    assertEqual(windowRuntime.hooks.state.lobbyWindow, lobbyWindow, 'five-window menu open should cache #PokerLobbyWindow');
    assertEqual(windowRuntime.hooks.state.tableWindow, tableWindow, 'five-window menu open should cache #PokerTableWindow');
    assertEqual(windowRuntime.hooks.state.playersWindow, playersWindow, 'five-window menu open should cache #PokerPlayersWindow');
    assertEqual(windowRuntime.hooks.state.historyWindow, historyWindow, 'five-window menu open should cache #PokerHistoryWindow');
    assertEqual(windowRuntime.hooks.state.actionsWindow, actionsWindow, 'five-window menu open should cache #PokerActionsWindow');
    assertEqual(windowRuntime.hooks.state.leaveLobbyButton, leaveLobbyButton, 'five-window menu open should cache #PokerLeaveLobbyButton');
    assert(hasClass(windowRuntime.runtime.panels.root, 'PokerMenuVisible'), 'five-window menu open should mark the shared root visible');
    assert(!hasClass(compatibilityAnchor, 'Open'), 'five-window menu open should not mark hidden #PokerAnitaPanel open');
    assert(hasClass(lobbyWindow, 'Open'), 'five-window menu open should mark #PokerLobbyWindow open');
    assert(hasClass(tableWindow, 'Open'), 'five-window menu open should mark #PokerTableWindow open');
    assert(hasClass(playersWindow, 'Open'), 'five-window menu open should mark #PokerPlayersWindow open');
    assert(hasClass(actionsWindow, 'Open'), 'five-window menu open should mark #PokerActionsWindow open');
    windowRuntime.runtime.sandbox.PokerEscapeMenuClose();
    assert(!hasClass(windowRuntime.runtime.panels.root, 'PokerMenuVisible'), 'five-window menu close should clear the shared root visibility class');
    assert(!hasClass(lobbyWindow, 'Open'), 'five-window menu close should clear #PokerLobbyWindow open state');
    assert(!hasClass(tableWindow, 'Open'), 'five-window menu close should clear #PokerTableWindow open state');
    assert(!hasClass(playersWindow, 'Open'), 'five-window menu close should clear #PokerPlayersWindow open state');
    assert(!hasClass(actionsWindow, 'Open'), 'five-window menu close should clear #PokerActionsWindow open state');
  }

  const twoPlayerLeaveRuntime = createSyncedPartyRuntime('Abrams', 'stwo-player-leave', syncedRoster, 1);
  if (twoPlayerLeaveRuntime.hooks && twoPlayerLeaveRuntime.game) {
    const twoPlayerLeaveHooks = twoPlayerLeaveRuntime.hooks;
    const twoPlayerLeaveGame = twoPlayerLeaveRuntime.game;
    twoPlayerLeaveHooks.handleReadyEvent(readyPayload('Abrams', 41, true));
    twoPlayerLeaveHooks.handleReadyEvent(readyPayload('Bebop', 42, false));
    assertEqual(twoPlayerLeaveGame.players.length, 2, 'two-player active leave regression setup should start an active hand with two players');
    assert(
      twoPlayerLeaveHooks.getReadySeatArray().some((seat) => seat.key === 'bebop'),
      'two-player active leave regression setup should include Bebop in ready seats before leaving',
    );
    twoPlayerLeaveHooks.processChatRecord({ sender: 'Bebop', message: '[party leave] poker party psync', isSelf: false });
    assertEqual(twoPlayerLeaveHooks.state.game, null, 'remote leave from a two-player active hand should reset the remaining client to the lobby');
    assertEqual(twoPlayerLeaveHooks.state.party.id, '', 'remote leave from a two-player active hand should clear the joined party id');
    assertEqual(twoPlayerLeaveHooks.state.party.mode, 'none', 'remote leave from a two-player active hand should clear party mode for lobby controls');
    assertEqual(twoPlayerLeaveHooks.getPartyRoster().length, 0, 'remote leave from a two-player active hand should leave no stale party roster');
    assertEqual(twoPlayerLeaveHooks.getReadySeatArray().length, 0, 'remote leave from a two-player active hand should clear stale ready seats');
    twoPlayerLeaveHooks.modules.TableRenderer.renderGame();
    assertInactiveLobbyControls(twoPlayerLeaveRuntime.runtime, 'remote two-player active leave reset');
    assertPanelVisible(twoPlayerLeaveRuntime.runtime, 'PokerPartyControls', 'remote two-player active leave reset');
  }

  const partyLeaveRuntime = createSyncedPartyRuntime('Abrams', 'sleave-party', tableRoster, 1);
  if (partyLeaveRuntime.hooks && partyLeaveRuntime.game) {
    const leaveHooks = partyLeaveRuntime.hooks;
    const leaveGame = partyLeaveRuntime.game;
    leaveHooks.handleReadyEvent(readyPayload('Bebop', 42));
    assertEqual(leaveGame.players.length, 3, 'three-player non-leader leave regression setup should start an active hand with three players');
    assert(
      leaveHooks.getReadySeatArray().some((seat) => seat.key === 'bebop'),
      'three-player non-leader leave regression setup should include Bebop in ready seats before leaving',
    );
    const leavingPlayer = leaveGame.players.find((player) => player.key === 'bebop');
    assert(leavingPlayer, 'three-player non-leader leave regression setup should include Bebop in the active hand');
    if (leavingPlayer) {
      leaveGame.currentIndex = leaveGame.players.indexOf(leavingPlayer);
      leaveHooks.processChatRecord({ sender: 'Bebop', message: '[party leave] poker party psync', isSelf: false });
      assertEqual(leaveHooks.state.game, leaveGame, 'remote non-leader leave from a three-player active hand should keep the current hand');
      assertEqual(leaveGame.active, true, 'remote non-leader leave from a three-player active hand should remain active');
      assert(
        !leaveHooks.getPartyRoster().some((member) => member.key === 'bebop'),
        'remote non-leader leave should remove the sender from the synced party roster',
      );
      assert(
        !leaveHooks.getReadySeatArray().some((seat) => seat.key === 'bebop'),
        'remote non-leader leave should remove the sender from ready seats',
      );
      assertEqual(leavingPlayer.folded, true, 'remote non-leader leave during an active hand should fold the leaving player');
      assertGreaterThan(
        leaveGame.players.filter((player) => !player.folded && player.stack > 0).length,
        1,
        'remote non-leader leave during a three-player active hand should leave at least two active contestants',
      );
      assert(
        currentPlayer(leaveGame).key !== 'bebop',
        'remote non-leader leave should advance the turn candidate away from the leaving player',
      );
      assert(
        leaveGame.log.some((line) => String(line).toLowerCase().includes('bebop left') && String(line).toLowerCase().includes('fold')),
        `remote non-leader leave should log that Bebop left and folded: ${(leaveGame.log || []).join('|') || '<empty>'}`,
      );
      assertAnnouncerIncludes(partyLeaveRuntime.runtime, ['Bebop', 'left', 'fold'], 'remote non-leader leave during a three-player active hand');
    }
  }

  const leaderLeaveRuntime = createSyncedPartyRuntime('Bebop', 'sleader-leave', tableRoster, 1);
  if (leaderLeaveRuntime.hooks && leaderLeaveRuntime.game) {
    const leaderLeaveHooks = leaderLeaveRuntime.hooks;
    const leaderLeaveGame = leaderLeaveRuntime.game;
    assertEqual(leaderLeaveHooks.state.party.mode, 'member', 'three-player leader leave regression setup should be joined as a member');
    assertEqual(!!leaderLeaveHooks.state.game, true, 'three-player leader leave regression setup should start an active hand');
    leaderLeaveHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party pnew', isSelf: false });
    assertEqual(
      leaderLeaveHooks.state.party.id,
      'psync',
      'active member should not abandon the current hand immediately when a leader re-host row arrives early',
    );
    const leavingLeader = leaderLeaveGame.players.find((player) => player.key === 'abrams');
    assert(leavingLeader, 'three-player leader leave regression setup should include Abrams in the active hand');
    if (leavingLeader) {
      leaderLeaveGame.currentIndex = leaderLeaveGame.players.indexOf(leavingLeader);
      leaderLeaveHooks.processChatRecord({ sender: 'Abrams', message: '[party leave] poker party psync', isSelf: false });
      assertEqual(leaderLeaveHooks.state.game, leaderLeaveGame, 'remote leader leave from a three-player active hand should keep the current hand');
      assertEqual(leaderLeaveGame.active, true, 'remote leader leave from a three-player active hand should remain active');
      assertEqual(leavingLeader.folded, true, 'remote leader leave during a three-player active hand should fold the leader');
      assertGreaterThan(
        leaderLeaveGame.players.filter((player) => !player.folded && player.stack > 0).length,
        1,
        'remote leader leave during a three-player active hand should leave at least two active contestants',
      );
      assert(
        currentPlayer(leaderLeaveGame).key !== 'abrams',
        'remote leader leave should advance the turn candidate away from the leaving leader',
      );
      assert(
        leaderLeaveGame.log.some((line) => String(line).toLowerCase().includes('abrams left') && String(line).toLowerCase().includes('fold')),
        `remote leader leave should log that Abrams left and folded: ${(leaderLeaveGame.log || []).join('|') || '<empty>'}`,
      );
      assertAnnouncerIncludes(leaderLeaveRuntime.runtime, ['Abrams', 'left', 'fold'], 'remote leader leave during a three-player active hand');
    }
  }

  const lateJoinRuntime = createSyncedPartyRuntime('Abrams', 'slate', syncedRoster, 1);
  if (lateJoinRuntime.hooks && lateJoinRuntime.game && lateJoinRuntime.hooks.modules && lateJoinRuntime.hooks.modules.LateJoinQueue) {
    const lateJoinHooks = lateJoinRuntime.hooks;
    const lateJoinQueue = lateJoinHooks.modules.LateJoinQueue;
    lateJoinHooks.processChatRecord({ sender: 'Calico', message: '[party join] poker party psync', isSelf: false });
    assertEqual(
      JSON.stringify(lateJoinHooks.getPartyRoster()),
      JSON.stringify([
        { key: 'abrams', name: 'Abrams' },
        { key: 'bebop', name: 'Bebop' },
        { key: 'calico', name: 'Calico' },
      ]),
      'active-hand party join should append Calico to the party roster',
    );
    assertEqual(
      JSON.stringify(lateJoinHooks.state.game.players.map((player) => player.name)),
      JSON.stringify(['Abrams', 'Bebop']),
      'active-hand party join should not add Calico to the current pot or turn order',
    );
    assertEqual(lateJoinQueue.describe().count, 1, 'late join queue should describe Calico as waiting for the next hand');
    lateJoinHooks.state.bankrolls = { abrams: 16000, bebop: 4000 };
    const lateJoinResult = lateJoinQueue.apply(null, 'finish');
    assertEqual(lateJoinResult.applied, 1, 'late join apply should fund one queued player');
    assertEqual(lateJoinResult.buyIn, 4000, 'late join buy-in should use the smallest positive continuing bankroll');
    assertEqual(lateJoinHooks.state.bankrolls.calico, 4000, 'Calico late join buy-in should be $4000, not the starting stack');
    lateJoinHooks.state.game.active = false;
    lateJoinHooks.state.game.finished = true;
    lateJoinHooks.state.game.phase = 'finished';
    const lateJoinNextRoster = [
      { key: 'abrams', name: 'Abrams' },
      { key: 'bebop', name: 'Bebop' },
      { key: 'calico', name: 'Calico' },
    ];
    lateJoinHooks.processChatRecord({ sender: 'Abrams', message: lateJoinHooks.buildSynchronizedStartCommand('slate-hand-two', lateJoinNextRoster, 2), isSelf: true });
    const lateJoinNextGame = lateJoinHooks.state.game;
    assert(lateJoinNextGame, 'next synced hand after late join should create a game');
    if (lateJoinNextGame) {
      const nextAbrams = lateJoinNextGame.players.find((player) => player.key === 'abrams');
      const nextBebop = lateJoinNextGame.players.find((player) => player.key === 'bebop');
      const nextCalico = lateJoinNextGame.players.find((player) => player.key === 'calico');
      assertEqual(lateJoinNextGame.players.length, 3, 'next synced hand should seat the late joiner');
      assert(nextCalico, 'next synced hand should include Calico');
      if (nextCalico) assertEqual(nextCalico.stack + nextCalico.bet, 4000, 'Calico should bring the fair late buy-in into hand two');
      if (nextAbrams) assertEqual(nextAbrams.stack + nextAbrams.bet, 16000, 'Abrams should preserve the continuing bankroll into hand two');
      if (nextBebop) assertEqual(nextBebop.stack + nextBebop.bet, 4000, 'Bebop should preserve the continuing bankroll into hand two');
    }
  }

  const missedJoinStartRuntime = createMenuRuntime();
  if (missedJoinStartRuntime.hooks && missedJoinStartRuntime.hooks.modules && missedJoinStartRuntime.hooks.modules.LateJoinQueue) {
    const missedHooks = missedJoinStartRuntime.hooks;
    const missedRoster = [
      { key: 'abrams', name: 'Abrams' },
      { key: 'bebop', name: 'Bebop' },
      { key: 'calico', name: 'Calico' },
    ];
    missedHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party psync', isSelf: true });
    missedHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party psync', isSelf: false });
    missedHooks.state.bankrolls = { abrams: 16000, bebop: 4000 };
    missedHooks.processChatRecord({ sender: 'Abrams', message: missedHooks.buildSynchronizedStartCommand('slate-missed-join', missedRoster, 2), isSelf: true });
    const missedJoinGame = missedHooks.state.game;
    assert(missedJoinGame, 'synced start fallback should create the next hand when a missed late join appears only in the roster');
    if (missedJoinGame) {
      const missedCalico = missedJoinGame.players.find((player) => player.key === 'calico');
      assertEqual(missedJoinGame.players.length, 3, 'synced start fallback should seat the roster-only late joiner');
      assert(missedCalico, 'synced start fallback should include Calico from the roster');
      if (missedCalico) assertEqual(missedCalico.stack + missedCalico.bet, 4000, 'synced start fallback should fund Calico from the smallest continuing bankroll');
      assertEqual(missedHooks.state.bankrolls.calico, 4000, 'synced start fallback should persist Calico fair buy-in before game creation');
    }
  }

  const zeroBuyInStartRuntime = createMenuRuntime();
  if (zeroBuyInStartRuntime.hooks && zeroBuyInStartRuntime.hooks.modules && zeroBuyInStartRuntime.hooks.modules.LateJoinQueue) {
    const zeroHooks = zeroBuyInStartRuntime.hooks;
    const zeroRoster = [
      { key: 'abrams', name: 'Abrams' },
      { key: 'bebop', name: 'Bebop' },
      { key: 'calico', name: 'Calico' },
    ];
    zeroHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party psync', isSelf: true });
    zeroHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party psync', isSelf: false });
    zeroHooks.state.bankrolls = { abrams: 0, bebop: 0 };
    zeroHooks.processChatRecord({ sender: 'Abrams', message: zeroHooks.buildSynchronizedStartCommand('slate-zero-buyin', zeroRoster, 2), isSelf: true });
    assertEqual(zeroHooks.state.game, null, 'synced start with no positive continuing bankroll should not seat missing roster entries with the starting stack');
    assertEqual(
      Object.prototype.hasOwnProperty.call(zeroHooks.state.bankrolls, 'calico'),
      false,
      'synced start with no positive continuing bankroll should not create a Calico bankroll',
    );
  }

  const staleBankrollFreshStartRuntime = createMenuRuntime();
  if (staleBankrollFreshStartRuntime.hooks && hasPartySyncHooks(staleBankrollFreshStartRuntime.hooks, 'stale bankroll fresh synced start runtime')) {
    const freshHooks = staleBankrollFreshStartRuntime.hooks;
    const freshRoster = [
      { key: 'jdbeast', name: 'JDBeast' },
      { key: 'hantu raya', name: 'Hantu Raya' },
    ];
    freshHooks.processChatRecord({ sender: 'JDBeast', message: '[party leader] poker party pfresh', isSelf: true });
    freshHooks.processChatRecord({ sender: 'Hantu Raya', message: '[party join] poker party pfresh', isSelf: false });
    freshHooks.state.bankrolls = { abrams: 0, bebop: 3500, jdbeast: 0 };
    freshHooks.processChatRecord({ sender: 'JDBeast', message: freshHooks.buildSynchronizedStartCommand('sfresh-stale-bankroll', freshRoster, 1), isSelf: true });
    const freshStartGame = freshHooks.state.game;
    assert(freshStartGame, 'fresh synced hand 1 should start even when stale prior-match bankrolls are nonempty');
    if (freshStartGame) {
      const freshPlayers = Array.isArray(freshStartGame.players) ? freshStartGame.players : [];
      const freshLeader = freshPlayers.find((player) => player.key === 'jdbeast');
      const freshMember = freshPlayers.find((player) => player.key === 'hantu raya');
      assertEqual(freshStartGame.handNumber, 1, 'fresh synced hand 1 should preserve the hand 1 wire number');
      assertEqual(freshPlayers.length, 2, 'fresh synced hand 1 should seat the new roster despite stale bankrolls');
      assert(freshLeader, 'fresh synced hand 1 should include JDBeast');
      assert(freshMember, 'fresh synced hand 1 should include Hantu Raya');
      if (freshLeader) assertEqual(freshLeader.stack + freshLeader.bet, 10000, 'fresh synced hand 1 should reset JDBeast to the starting stack total');
      if (freshMember) assertEqual(freshMember.stack + freshMember.bet, 10000, 'fresh synced hand 1 should reset Hantu Raya to the starting stack total');
    }
  }

  const activeBankrollHandOneRuntime = createMenuRuntime();
  if (activeBankrollHandOneRuntime.hooks && hasPartySyncHooks(activeBankrollHandOneRuntime.hooks, 'active bankroll hand one start runtime')) {
    const activeHooks = activeBankrollHandOneRuntime.hooks;
    const activeRoster = [
      { key: 'abrams', name: 'Abrams' },
      { key: 'bebop', name: 'Bebop' },
    ];
    activeHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party pactive', isSelf: true });
    activeHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party pactive', isSelf: false });
    activeHooks.state.bankrolls = { abrams: 16000, bebop: 4000 };
    const activeBankrollsBefore = JSON.stringify(activeHooks.state.bankrolls);
    activeHooks.state.game = { seed: 'active-sentinel', handNumber: 99, active: true, finished: false, phase: 'preflop', players: [], log: [] };
    const activeGameBefore = activeHooks.state.game;
    const activeGameBeforeJson = JSON.stringify(activeGameBefore);
    activeHooks.processChatRecord({ sender: 'Abrams', message: activeHooks.buildSynchronizedStartCommand('sactive-hand-one-boundary', activeRoster, 1), isSelf: true });
    assertEqual(JSON.stringify(activeHooks.state.bankrolls), activeBankrollsBefore, 'active synced hand 1 start row should not clear existing bankrolls');
    assert(activeHooks.state.game === activeGameBefore, 'active synced hand 1 start row should keep the current active game object');
    assertEqual(JSON.stringify(activeHooks.state.game), activeGameBeforeJson, 'active synced hand 1 start row should not mutate the current active game state');
  }

  const bustedLateJoinRuntime = createMenuRuntime();
  if (bustedLateJoinRuntime.hooks && bustedLateJoinRuntime.hooks.modules && bustedLateJoinRuntime.hooks.modules.LateJoinQueue) {
    const bustedHooks = bustedLateJoinRuntime.hooks;
    const bustedQueue = bustedHooks.modules.LateJoinQueue;
    bustedHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party psync', isSelf: true });
    bustedHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party psync', isSelf: false });
    bustedHooks.state.bankrolls = { abrams: 16000, bebop: 4000, calico: 0 };
    bustedHooks.processChatRecord({ sender: 'Calico', message: '[party join] poker party psync', isSelf: false });
    const bustedApply = bustedQueue.apply(null, 'finish');
    assertEqual(bustedHooks.state.bankrolls.calico, 0, 'busted player with an existing zero bankroll should not receive a late rebuy');
    assertEqual(bustedApply.applied, 0, 'busted existing player should not be treated as a newly funded entrant');
    assertEqual(bustedQueue.describe().names.indexOf('Calico'), -1, 'busted existing player should not be queued as a late joiner');
  }

  const unknownLeaderHandTwoRuntime = createMenuRuntime();
  if (unknownLeaderHandTwoRuntime.hooks && hasPartySyncHooks(unknownLeaderHandTwoRuntime.hooks, 'unknown leader hand two start runtime')) {
    const unknownLeaderHooks = unknownLeaderHandTwoRuntime.hooks;
    const unknownLeaderRoster = [
      { key: 'jdbeast', name: 'JDBeast' },
      { key: 'hantu raya', name: 'Hantu Raya' },
    ];
    unknownLeaderHooks.processChatRecord({ sender: 'JDBeast', message: '[party leader] poker party psync', isSelf: false });
    unknownLeaderHooks.processChatRecord({ sender: 'Hantu Raya', message: '[party join] poker party psync', isSelf: true });
    unknownLeaderHooks.state.bankrolls = { jdbeast: 8700, 'hantu raya': 11300 };
    unknownLeaderHooks.state.game = { handNumber: 1, active: false, finished: true, phase: 'finished' };
    unknownLeaderHooks.processChatRecord({
      sender: '<unknown>',
      message: unknownLeaderHooks.buildSynchronizedStartCommand('sunknown-leader-hand-two', unknownLeaderRoster, 2),
      isSelf: false,
    });
    const unknownLeaderHandTwoGame = unknownLeaderHooks.state.game;
    assert(unknownLeaderHandTwoGame, 'unknown sender synced start from the known party leader should create hand 2');
    if (unknownLeaderHandTwoGame) {
      const handTwoPlayers = Array.isArray(unknownLeaderHandTwoGame.players) ? unknownLeaderHandTwoGame.players : [];
      const handTwoLeader = handTwoPlayers.find((player) => player.key === 'jdbeast');
      const handTwoMember = handTwoPlayers.find((player) => player.key === 'hantu raya');
      assertEqual(unknownLeaderHandTwoGame.handNumber, 2, 'unknown sender synced start from the known party leader should preserve the wire hand number');
      assertEqual(handTwoPlayers.length, 2, 'unknown sender synced start from the known party leader should seat the roster players');
      assert(handTwoLeader, 'unknown sender synced start from the known party leader should include JDBeast');
      assert(handTwoMember, 'unknown sender synced start from the known party leader should include Hantu Raya');
      if (handTwoLeader) assertEqual(handTwoLeader.stack + handTwoLeader.bet, 8700, 'JDBeast should carry the finished-hand bankroll into hand 2');
      if (handTwoMember) assertEqual(handTwoMember.stack + handTwoMember.bet, 11300, 'Hantu Raya should carry the finished-hand bankroll into hand 2');
    }
  }

  const unknownStartWithoutLeaderRuntime = createMenuRuntime();
  if (unknownStartWithoutLeaderRuntime.hooks && hasPartySyncHooks(unknownStartWithoutLeaderRuntime.hooks, 'unknown start without leader runtime')) {
    const boundaryHooks = unknownStartWithoutLeaderRuntime.hooks;
    const boundaryRoster = [
      { key: 'jdbeast', name: 'JDBeast' },
      { key: 'hantu raya', name: 'Hantu Raya' },
    ];
    boundaryHooks.processChatRecord({
      sender: '<unknown>',
      message: boundaryHooks.buildSynchronizedStartCommand('sunknown-no-leader', boundaryRoster, 2),
      isSelf: false,
    });
    assertEqual(boundaryHooks.state.game, null, 'unknown sender synced start without a known party leader should be rejected');
  }

  const unknownStartWrongLeaderRuntime = createMenuRuntime();
  if (unknownStartWrongLeaderRuntime.hooks && hasPartySyncHooks(unknownStartWrongLeaderRuntime.hooks, 'unknown start wrong leader runtime')) {
    const boundaryHooks = unknownStartWrongLeaderRuntime.hooks;
    const boundaryRoster = [
      { key: 'jdbeast', name: 'JDBeast' },
      { key: 'hantu raya', name: 'Hantu Raya' },
    ];
    boundaryHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party psync', isSelf: true });
    boundaryHooks.processChatRecord({
      sender: '<unknown>',
      message: boundaryHooks.buildSynchronizedStartCommand('sunknown-wrong-leader', boundaryRoster, 2),
      isSelf: false,
    });
    assertEqual(boundaryHooks.state.game, null, 'unknown sender synced start with a mismatched roster leader should be rejected');
  }

  const unknownLegacyStartRuntime = createMenuRuntime();
  if (unknownLegacyStartRuntime.hooks) {
    const legacyHooks = unknownLegacyStartRuntime.hooks;
    seedPartyForReady(legacyHooks, ['Abrams', 'Bebop'], 'plegacy-ready');
    legacyHooks.handleReadyEvent(readyPayload('Abrams', 1));
    legacyHooks.handleReadyEvent(readyPayload('Bebop', 2));
    assertEqual(legacyHooks.getReadySeatArray().length, 2, 'unknown legacy start setup should have two ready seats');
    legacyHooks.processChatRecord({ sender: '<unknown>', message: 'poker start sunknown-legacy', isSelf: false });
    assertEqual(legacyHooks.state.game, null, 'unknown sender legacy start without a roster should be rejected even when ready seats exist');
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

  if (progressHooksAvailable) {
    const saved = createProgressCodeRuntime(['Abrams', 'Bebop'], 'resume-progress');
    if (saved.code && saved.payload) {
      const secondClientResume = createMenuRuntime();
      const secondClientStatusText = () =>
        ['PokerStatusLabel', 'PokerPartyStatusLabel', 'PokerProgressCodeLabel', 'PokerResumeStatusLabel']
          .map((id) => panelText(findPanel(secondClientResume.runtime, id)))
          .join(' | ');
      assertEqual(secondClientResume.hooks.importProgressSaveCode(saved.code).ok, true, 'second saved client should import saved progress');
      secondClientResume.hooks.modules.TableRenderer.renderGame();
      assertButtonAffordance(secondClientResume.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'imported progress before resume leader second-client CTA');
      assert(
        !/\bready resume\b/i.test(secondClientStatusText()),
        `imported progress before resume leader should not tell users to click READY RESUME while the button is hidden: ${secondClientStatusText() || '<empty>'}`,
      );
      secondClientResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeLeaderCommand(saved.id), isSelf: false });
      clearPartyForLegacyReady(secondClientResume.hooks);
      secondClientResume.hooks.state.localPlayerKey = '';
      secondClientResume.runtime.config.PokerLocalPlayerKey = '';
      secondClientResume.runtime.config.PokerLocalPlayerName = '';
      secondClientResume.hooks.modules.TableRenderer.renderGame();
      assertEqual(secondClientResume.hooks.state.party.id, '', 'resume leader selected with unknown second-client sender CTA should not depend on a party id');
      assertButtonAffordance(secondClientResume.runtime, 'PokerReadyChatButton', { hidden: false, enabled: true }, 'resume leader selected with unknown second-client sender CTA');
      assertButtonAffordance(secondClientResume.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'resume leader selected with unknown second-client sender CTA');
      const unknownSecondClientStatus = secondClientStatusText();
      assert(
        (/\bidentify\b/i.test(unknownSecondClientStatus) || /\btype ready\b/i.test(unknownSecondClientStatus)) && /\bresume\b/i.test(unknownSecondClientStatus),
        `resume leader selected with unknown second-client sender should explain identification before resume ready: ${unknownSecondClientStatus || '<empty>'}`,
      );
      secondClientResume.hooks.handleReadyEvent(readyPayload('Bebop', 42, true));
      secondClientResume.hooks.modules.TableRenderer.renderGame();
      assertEqual(secondClientResume.hooks.state.party.id, '', 'self ready identification for saved second client should not recreate a party id');
      assert(
        !secondClientResume.hooks.getReadySeatArray().some((seat) => seat.key === 'bebop'),
        'self ready identification for saved second client should not need an accepted ready seat',
      );
      assertEqual(secondClientResume.hooks.state.localPlayerKey, 'bebop', 'self ready identification for saved second client should remember the local key');
      assertEqual(secondClientResume.runtime.config.PokerLocalPlayerKey, 'bebop', 'self ready identification for saved second client should persist the local key');
      assertEqual(secondClientResume.runtime.config.PokerLocalPlayerName, 'Bebop', 'self ready identification for saved second client should persist the local name');
      assertButtonAffordance(secondClientResume.runtime, 'PokerResumeReadyButton', { hidden: false, enabled: true }, 'resume leader selected after self ready identification second-client CTA');
      assertStartButtonGate(secondClientResume.runtime, 'WAITING FOR RESUME LEADER', false, true, 'resume leader selected after self ready identification second-client CTA');
      const secondClientChatTarget = findPanel(secondClientResume.runtime, 'ChatTargetLabel');
      if (secondClientChatTarget) secondClientChatTarget.text = 'TEAM';
      const resumeReadyStart = secondClientResume.runtime.dispatches.length;
      const resumeReadyHandler = secondClientResume.runtime.sandbox.PokerEscapeMenuResumeReady;
      assertEqual(typeof resumeReadyHandler, 'function', 'identified saved second client READY RESUME should expose an activation handler');
      if (typeof resumeReadyHandler === 'function') resumeReadyHandler();
      drainScheduledCallbacks(secondClientResume.runtime, 256);
      const secondClientReadyMessages = submittedChatMessages(secondClientResume.runtime, resumeReadyStart);
      assert(
        secondClientReadyMessages.includes(hooks.buildResumeReadyCommand(saved.id)),
        `identified saved second client READY RESUME should submit the resume-ready wire command: ${secondClientReadyMessages.join('|') || '<none>'}`,
      );
      assert(
        !secondClientReadyMessages.includes('ready resume'),
        `identified saved second client READY RESUME should not submit a bare ready-resume phrase: ${secondClientReadyMessages.join('|') || '<none>'}`,
      );
      const resumeA = createMenuRuntime();
      const resumeB = createMenuRuntime();
      const startCommand = hooks.buildResumeStartCommand(saved.id, 'abrams', saved.payload.roster, saved.payload.nextHandNumber, 'sresume');
      for (const target of [resumeA, resumeB]) {
        assertEqual(target.hooks.importProgressSaveCode(saved.code).ok, true, 'resume runtime should import saved progress');
        target.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeLeaderCommand(saved.id), isSelf: target === resumeA });
        target.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeReadyCommand(saved.id), isSelf: target === resumeB });
        target.hooks.processChatRecord({ sender: 'Abrams', message: startCommand, isSelf: target === resumeA });
      }
      assert(resumeA.hooks.state.game, 'resume leader runtime should create a resumed game');
      assert(resumeB.hooks.state.game, 'resume ready runtime should create a resumed game');
      if (resumeA.hooks.state.game && resumeB.hooks.state.game) {
        assertSameSyncedGame(resumeB.hooks.state.game, resumeA.hooks.state.game, 'two runtimes receiving the same resume start');
        assertEqual(resumeA.hooks.state.game.handNumber, saved.payload.nextHandNumber, 'resumed game should use the saved next hand number');
      }
        resumeA.hooks.modules.TableRenderer.renderGame();
        assertButtonAffordance(resumeA.runtime, 'PokerProgressControls', { hidden: true }, 'active resumed hand button state');
        assertButtonAffordance(resumeA.runtime, 'PokerResumeControls', { hidden: true }, 'active resumed hand button state');
        assertButtonAffordance(resumeA.runtime, 'PokerStartButton', { hidden: true, enabled: false }, 'active resumed hand button state');
        assertButtonAffordance(resumeA.runtime, 'PokerReadyChatButton', { hidden: true, enabled: false }, 'active resumed hand button state');
        assertMatchPanelsVisible(resumeA.runtime, 'active resumed hand button state');
        assertReadOnlyActionButtons(resumeA.runtime, ['CALL $200', 'RAISE TO $800', 'FOLD'], 'Waiting for Bebop', 'active resumed hand leader observer');
        resumeA.hooks.state.localPlayerKey = 'bebop';
        resumeA.runtime.config.PokerLocalPlayerKey = 'bebop';
        resumeA.runtime.config.PokerLocalPlayerName = 'Bebop';
        resumeA.hooks.modules.TableRenderer.renderGame();
        assertEnabledActionButtons(resumeA.runtime, ['CALL $200', 'RAISE TO $800', 'FOLD'], 'active resumed hand current actor');
    }

      const liveLogSaved = createProgressCodeRuntime(['JDBeast', 'Hantu Raya'], 'hantu-raya-resume-progress');
      if (liveLogSaved.code && liveLogSaved.payload) {
        assertEqual(liveLogSaved.payload.nextHandNumber, 2, 'JDBeast/Hantu Raya saved progress should resume at hand 2');
        assertEqual(
          JSON.stringify(liveLogSaved.payload.roster.map((entry) => ({ key: entry.key, name: entry.name }))),
          JSON.stringify([
            { key: 'jdbeast', name: 'JDBeast' },
            { key: 'hantu raya', name: 'Hantu Raya' },
          ]),
          'JDBeast/Hantu Raya saved progress should preserve the space-bearing player key and name',
        );
        assert(liveLogSaved.payload.bankrolls.jdbeast > 0, 'JDBeast/Hantu Raya saved progress should leave JDBeast funded for resume leader selection');
        assert(liveLogSaved.payload.bankrolls['hantu raya'] > 0, 'JDBeast/Hantu Raya saved progress should leave Hantu Raya funded for resume ready selection');
        const liveLogPartyId = 'pmr8kf956-1uxkydi';
        const importHostedLeaderProgress = (message) => {
          const leaderRuntime = createMenuRuntime();
          leaderRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: `[party leader] poker party ${liveLogPartyId}`,
            isSelf: true,
          });
          leaderRuntime.hooks.processChatRecord({
            sender: 'Hantu Raya',
            message: `[party join] poker party ${liveLogPartyId}`,
            isSelf: false,
          });
          leaderRuntime.hooks.modules.TableRenderer.renderGame();
          assertEqual(leaderRuntime.hooks.state.game, null, `${message} setup should remain an inactive lobby`);
          assertEqual(leaderRuntime.hooks.state.party.mode, 'leader', `${message} setup should keep JDBeast as party leader`);
          assertEqual(leaderRuntime.hooks.state.localPlayerKey, 'jdbeast', `${message} setup should remember JDBeast as the local sender`);
          assertProgressImportAvailable(leaderRuntime.runtime, `${message} no-active-game import controls`);

          const leaderInput = findPanel(leaderRuntime.runtime, 'PokerProgressCodeInput');
          assert(leaderInput, `${message} should have a progress code input`);
          if (leaderInput) leaderInput.text = liveLogSaved.code;
          const shareChatTarget = findPanel(leaderRuntime.runtime, 'ChatTargetLabel');
          if (shareChatTarget) shareChatTarget.text = 'TEAM';
          const importStart = leaderRuntime.runtime.dispatches.length;
          const shareNow = 1700000200000;
          leaderRuntime.runtime.sandbox.Date.now = () => shareNow;
          const importHandler = leaderRuntime.runtime.sandbox.PokerEscapeMenuImportProgress;
          assertEqual(typeof importHandler, 'function', `${message} should expose the import handler`);
          const importResult = typeof importHandler === 'function' ? importHandler() : { ok: false };
          assertEqual(importResult && importResult.ok, true, `${message} should import progress after hosting the party first`);
          leaderRuntime.hooks.modules.TableRenderer.renderGame();
          assertButtonAffordance(leaderRuntime.runtime, 'PokerResumeControls', { hidden: false }, `${message} imported progress button state`);
          assertButtonAffordance(leaderRuntime.runtime, 'PokerResumeLeaderButton', { hidden: true, enabled: false }, `${message} imported progress button state`);
          assertButtonAffordance(leaderRuntime.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, `${message} imported progress button state`);
          assertProgressImportAvailable(leaderRuntime.runtime, `${message} imported progress controls`);
          assertStartButtonGate(leaderRuntime.runtime, 'SHARING PROGRESS', false, false, `${message} share-guarded start button`);

          drainScheduledCallbacks(leaderRuntime.runtime, 256);
          const shareMessages = submittedChatMessages(leaderRuntime.runtime, importStart);
          const progressShareMessages = parseProgressShareMessages(shareMessages);
          const checksum = progressChecksumFromCode(liveLogSaved.code);
          assertEqual(progressShareMessages.offers.length, 1, `${message} should emit exactly one progress offer: ${shareMessages.join('|') || '<none>'}`);
          assertEqual(progressShareMessages.offers[0] && progressShareMessages.offers[0].id, liveLogSaved.id, `${message} progress offer id`);
          assertEqual(progressShareMessages.offers[0] && progressShareMessages.offers[0].checksum, checksum, `${message} progress offer checksum`);
          assertEqual(progressShareMessages.chunks.length, progressShareMessages.offers[0] ? progressShareMessages.offers[0].count : 0, `${message} should emit every advertised progress chunk`);
          assertEqual(progressShareMessages.chunks.every((chunk) => chunk.id === liveLogSaved.id && chunk.checksum === checksum), true, `${message} progress chunks should match the imported code`);
          assertEqual(shareMessages.some((chat) => chat.indexOf('[resume leader]') === 0 || chat.indexOf('[resume ready]') === 0), false, `${message} should not emit legacy resume ceremony commands while sharing progress`);

          const readyAt = leaderRuntime.hooks.state.progressShare && leaderRuntime.hooks.state.progressShare.readyAt;
          assert(readyAt > 0, `${message} should record a progress-share readyAt guard`);
          leaderRuntime.runtime.sandbox.Date.now = () => readyAt + 1;
          leaderRuntime.hooks.modules.TableRenderer.renderGame();
          assertStartButtonGate(leaderRuntime.runtime, 'NEXT SYNCED HAND', true, false, `${message} ready-to-start button`);
          return { leaderRuntime, shareMessages, progressShareMessages };
        };

        const postShareUnlockRuntime = createMenuRuntime();
        postShareUnlockRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: `[party leader] poker party ${liveLogPartyId}`,
          isSelf: true,
        });
        postShareUnlockRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: `[party join] poker party ${liveLogPartyId}`,
          isSelf: false,
        });
        postShareUnlockRuntime.hooks.modules.TableRenderer.renderGame();
        const postShareInput = findPanel(postShareUnlockRuntime.runtime, 'PokerProgressCodeInput');
        assert(postShareInput, 'hosted post-share unlock should have a progress code input');
        if (postShareInput) postShareInput.text = liveLogSaved.code;
        const postShareTarget = findPanel(postShareUnlockRuntime.runtime, 'ChatTargetLabel');
        if (postShareTarget) postShareTarget.text = 'TEAM';
        postShareUnlockRuntime.runtime.sandbox.Date.now = () => 1700000600000;
        const postShareImport = postShareUnlockRuntime.runtime.sandbox.PokerEscapeMenuImportProgress;
        assertEqual(typeof postShareImport, 'function', 'hosted post-share unlock should expose the import handler');
        if (typeof postShareImport === 'function') postShareImport();
        postShareUnlockRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(postShareUnlockRuntime.runtime, 'SHARING PROGRESS', false, false, 'hosted post-share unlock immediate button state');
        const postShareState = postShareUnlockRuntime.hooks.state.progressShare;
        let scheduledFinalUnlock = false;
        for (let i = 0; i < 256 && postShareUnlockRuntime.runtime.schedules.length && (postShareState.submittedCount || 0) < (postShareState.messageCount || 0); i += 1) {
          const callback = postShareUnlockRuntime.runtime.schedules.shift().callback;
          callback();
          if ((postShareState.submittedCount || 0) >= (postShareState.messageCount || 0) && postShareState.messageCount) {
            scheduledFinalUnlock = postShareUnlockRuntime.runtime.schedules.some((schedule) => Number(schedule.delay) >= 1 && Number(schedule.delay) <= 2);
          }
        }
        assertEqual(postShareState.submittedCount, postShareState.messageCount, 'hosted post-share unlock should submit every progress chat message');
        assert(scheduledFinalUnlock, 'hosted post-share unlock should schedule a final CTA refresh after the last progress chunk submit extends readyAt');
        const postShareReadyAt = postShareState.readyAt;
        const unlockScheduleIndex = postShareUnlockRuntime.runtime.schedules.findIndex((schedule) => Number(schedule.delay) >= 1 && Number(schedule.delay) <= 2);
        assert(unlockScheduleIndex >= 0, 'hosted post-share unlock should retain the final CTA refresh callback');
        postShareUnlockRuntime.runtime.sandbox.Date.now = () => postShareReadyAt + 1;
        if (unlockScheduleIndex >= 0) {
          const unlockSchedule = postShareUnlockRuntime.runtime.schedules.splice(unlockScheduleIndex, 1)[0];
          unlockSchedule.callback();
        }
        assertStartButtonReady(postShareUnlockRuntime.runtime, 'NEXT SYNCED HAND', 'hosted post-share unlock final scheduled button state');

        const startHostedLeaderResume = (leaderImport, message) => {
          const leaderRuntime = leaderImport.leaderRuntime;
          const chatTarget = findPanel(leaderRuntime.runtime, 'ChatTargetLabel');
          if (chatTarget) chatTarget.text = 'TEAM';
          const startAt = leaderRuntime.runtime.dispatches.length;
          const startHandler = leaderRuntime.runtime.sandbox.PokerEscapeMenuStart;
          assertEqual(typeof startHandler, 'function', `${message} should expose the start handler`);
          if (typeof startHandler === 'function') startHandler();
          drainScheduledCallbacks(leaderRuntime.runtime, 256);
          const startMessages = submittedChatMessages(leaderRuntime.runtime, startAt);
          const resumeStartPattern = new RegExp(`^poker resume ${liveLogSaved.id} hand ${liveLogSaved.payload.nextHandNumber} leader jdbeast seed s[0-9a-z]+$`);
          const resumeStartCommands = startMessages.filter((chat) => resumeStartPattern.test(chat));
          const legacyStarts = startMessages.filter((chat) => /^poker start\b/.test(chat) || /\broster\b/.test(chat));
          assertEqual(resumeStartCommands.length, 1, `${message} should emit one short resume-start command: ${startMessages.join('|') || '<none>'}`);
          assertEqual(legacyStarts.length, 0, `${message} should not emit a legacy roster start command: ${startMessages.join('|') || '<none>'}`);
          const resumeStartCommand = resumeStartCommands[0] || '';
          if (resumeStartCommand) {
            leaderRuntime.hooks.processChatRecord({
              sender: 'JDBeast',
              message: resumeStartCommand,
              isSelf: true,
            });
          }
          assertEqual(leaderRuntime.hooks.state.party.id, liveLogPartyId, `${message} should preserve the real hosted party id after resume start`);
          return resumeStartCommand;
        };

        const hostedNoChatShareRuntime = createMenuRuntime();
        hostedNoChatShareRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: `[party leader] poker party ${liveLogPartyId}`,
          isSelf: true,
        });
        hostedNoChatShareRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: `[party join] poker party ${liveLogPartyId}`,
          isSelf: false,
        });
        hostedNoChatShareRuntime.hooks.modules.TableRenderer.renderGame();
        const noChatInput = findPanel(hostedNoChatShareRuntime.runtime, 'PokerProgressCodeInput');
        assert(noChatInput, 'hosted no-chat progress share should have a progress code input');
        if (noChatInput) noChatInput.text = liveLogSaved.code;
        const noChatShareNow = 1700000300000;
        hostedNoChatShareRuntime.runtime.sandbox.Date.now = () => noChatShareNow;
        const noChatImport = hostedNoChatShareRuntime.runtime.sandbox.PokerEscapeMenuImportProgress;
        assertEqual(typeof noChatImport, 'function', 'hosted no-chat progress share should expose the import handler');
        if (typeof noChatImport === 'function') noChatImport();
        hostedNoChatShareRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(hostedNoChatShareRuntime.runtime, 'SHARING PROGRESS', false, false, 'hosted no-chat progress share immediate start button');
        drainScheduledCallbacks(hostedNoChatShareRuntime.runtime, 256);
        const noChatMessages = submittedChatMessages(hostedNoChatShareRuntime.runtime, 0);
        assertEqual(parseProgressShareMessages(noChatMessages).offers.length, 0, `hosted no-chat progress share should not submit an offer without a usable chat target: ${noChatMessages.join('|') || '<none>'}`);
        const noChatReadyAt = hostedNoChatShareRuntime.hooks.state.progressShare && hostedNoChatShareRuntime.hooks.state.progressShare.readyAt;
        assert(noChatReadyAt > 0, 'hosted no-chat progress share should record a readyAt guard');
        hostedNoChatShareRuntime.runtime.sandbox.Date.now = () => noChatReadyAt + 10000;
        hostedNoChatShareRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(hostedNoChatShareRuntime.runtime, 'SHARING PROGRESS', false, false, 'hosted no-chat progress share should stay blocked until progress chat is actually submitted');
        const noChatStartAt = hostedNoChatShareRuntime.runtime.dispatches.length;
        const noChatStart = hostedNoChatShareRuntime.runtime.sandbox.PokerEscapeMenuStart;
        assertEqual(typeof noChatStart, 'function', 'hosted no-chat progress share should expose the start handler');
        if (typeof noChatStart === 'function') noChatStart();
        drainScheduledCallbacks(hostedNoChatShareRuntime.runtime, 256);
        const noChatStartMessages = submittedChatMessages(hostedNoChatShareRuntime.runtime, noChatStartAt);
        assertEqual(noChatStartMessages.some((chat) => chat.indexOf('poker resume ') === 0), false, `hosted no-chat progress share should not send resume before the imported progress can reach members: ${noChatStartMessages.join('|') || '<none>'}`);

        const importBeforeJoinRuntime = createMenuRuntime();
        importBeforeJoinRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: `[party leader] poker party ${liveLogPartyId}`,
          isSelf: true,
        });
        importBeforeJoinRuntime.hooks.modules.TableRenderer.renderGame();
        const importBeforeJoinInput = findPanel(importBeforeJoinRuntime.runtime, 'PokerProgressCodeInput');
        assert(importBeforeJoinInput, 'hosted import-before-join should have a progress code input');
        if (importBeforeJoinInput) importBeforeJoinInput.text = liveLogSaved.code;
        const importBeforeJoinChatTarget = findPanel(importBeforeJoinRuntime.runtime, 'ChatTargetLabel');
        if (importBeforeJoinChatTarget) importBeforeJoinChatTarget.text = 'TEAM';
        const importBeforeJoinNow = 1700000400000;
        importBeforeJoinRuntime.runtime.sandbox.Date.now = () => importBeforeJoinNow;
        const importBeforeJoinHandler = importBeforeJoinRuntime.runtime.sandbox.PokerEscapeMenuImportProgress;
        assertEqual(typeof importBeforeJoinHandler, 'function', 'hosted import-before-join should expose the import handler');
        const importBeforeJoinResult = typeof importBeforeJoinHandler === 'function' ? importBeforeJoinHandler() : { ok: false };
        assertEqual(importBeforeJoinResult && importBeforeJoinResult.ok, true, 'hosted import-before-join should allow the leader to import before a member joins');
        importBeforeJoinRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(importBeforeJoinRuntime.runtime, 'WAITING FOR PARTY', false, false, 'hosted import-before-join single-player start button');
        drainScheduledCallbacks(importBeforeJoinRuntime.runtime, 256);
        assertEqual(parseProgressShareMessages(submittedChatMessages(importBeforeJoinRuntime.runtime, 0)).offers.length, 0, 'hosted import-before-join should not share progress before a saved party member joins');
        const importBeforeJoinShareStart = importBeforeJoinRuntime.runtime.dispatches.length;
        importBeforeJoinRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: `[party join] poker party ${liveLogPartyId}`,
          isSelf: false,
        });
        importBeforeJoinRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(importBeforeJoinRuntime.runtime, 'SHARING PROGRESS', false, false, 'hosted import-before-join should share progress after member joins');
        drainScheduledCallbacks(importBeforeJoinRuntime.runtime, 256);
        const importBeforeJoinShareMessages = submittedChatMessages(importBeforeJoinRuntime.runtime, importBeforeJoinShareStart);
        const importBeforeJoinProgressShare = parseProgressShareMessages(importBeforeJoinShareMessages);
        assertEqual(importBeforeJoinProgressShare.offers.length, 1, `hosted import-before-join should emit one progress offer after member joins: ${importBeforeJoinShareMessages.join('|') || '<none>'}`);
        assertEqual(importBeforeJoinProgressShare.chunks.length, importBeforeJoinProgressShare.offers[0] ? importBeforeJoinProgressShare.offers[0].count : 0, 'hosted import-before-join should emit every advertised progress chunk after member joins');
        const importBeforeJoinReadyAt = importBeforeJoinRuntime.hooks.state.progressShare && importBeforeJoinRuntime.hooks.state.progressShare.readyAt;
        assert(importBeforeJoinReadyAt > 0, 'hosted import-before-join should record a share guard after member joins');
        importBeforeJoinRuntime.runtime.sandbox.Date.now = () => importBeforeJoinReadyAt + 1;
        importBeforeJoinRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(importBeforeJoinRuntime.runtime, 'NEXT SYNCED HAND', true, false, 'hosted import-before-join ready-to-start button');

        const importBeforeJoinMemberRuntime = createMenuRuntime();
        importBeforeJoinMemberRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: `[party leader] poker party ${liveLogPartyId}`,
          isSelf: false,
        });
        importBeforeJoinMemberRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: `[party join] poker party ${liveLogPartyId}`,
          isSelf: true,
        });
        for (const chat of importBeforeJoinShareMessages) {
          if (chat.indexOf('[progress offer]') === 0 || chat.indexOf('[progress chunk]') === 0) {
            importBeforeJoinMemberRuntime.hooks.processChatRecord({
              sender: 'JDBeast',
              message: chat,
              isSelf: false,
            });
          }
        }
        assertEqual(importBeforeJoinMemberRuntime.hooks.state.resume.id, liveLogSaved.id, 'hosted import-before-join member should import progress shared after joining');
        const importBeforeJoinStartCommand = startHostedLeaderResume({ leaderRuntime: importBeforeJoinRuntime }, 'hosted import-before-join leader resume');
        if (importBeforeJoinStartCommand) {
          importBeforeJoinMemberRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: importBeforeJoinStartCommand,
            isSelf: false,
          });
        }
        assert(importBeforeJoinMemberRuntime.hooks.state.game && importBeforeJoinMemberRuntime.hooks.state.game.active, 'hosted import-before-join member should start after receiving shared progress before resume');

        const staleMemberLobbyRuntime = createSyncedPartyRuntime('Hantu Raya', 'sstale-member-rejoin', [
          { key: 'jdbeast', name: 'JDBeast' },
          { key: 'hantu raya', name: 'Hantu Raya' },
        ], 1);
        assert(staleMemberLobbyRuntime.game && staleMemberLobbyRuntime.game.active, 'stale member lobby setup should start with Hantu Raya in an active synced hand');
        staleMemberLobbyRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: '[party leave] poker party psync',
          isSelf: false,
        });
        staleMemberLobbyRuntime.hooks.modules.TableRenderer.renderGame();
        assertEqual(staleMemberLobbyRuntime.hooks.state.game, null, 'remote leader leave should clear member active game state before a new lobby');
        staleMemberLobbyRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: '[party leader] poker party pmr8m7dxq-1uxkydi',
          isSelf: false,
        });
        staleMemberLobbyRuntime.hooks.modules.TableRenderer.renderGame();
        assertButtonAffordance(staleMemberLobbyRuntime.runtime, 'PokerJoinPartyButton', { hidden: false, enabled: true }, 'stale member lobby should show JOIN PARTY after the old leader leaves and hosts again');
        const unknownLateLeaderRuntime = createSyncedPartyRuntime('Hantu Raya', 'sunknown-late-leader-rejoin', [
          { key: 'jdbeast', name: 'JDBeast' },
          { key: 'hantu raya', name: 'Hantu Raya' },
        ], 1);
        assert(unknownLateLeaderRuntime.game && unknownLateLeaderRuntime.game.active, 'unknown/late party leader discovery setup should start with Hantu Raya in an active synced hand');
        unknownLateLeaderRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: '[party leave] poker party psync',
          isSelf: false,
        });
        unknownLateLeaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertEqual(unknownLateLeaderRuntime.hooks.state.game, null, 'unknown/late party leader discovery should clear member game state before the new lobby row arrives');
        assertEqual(unknownLateLeaderRuntime.hooks.state.party.id, '', 'unknown/late party leader discovery should leave the member in an empty lobby before the new lobby row arrives');
        unknownLateLeaderRuntime.hooks.processChatRecord({
          sender: '<unknown>',
          message: '[party leader] poker party pmr8okjl1-1uxkydi',
          isSelf: false,
        });
        unknownLateLeaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertButtonAffordance(unknownLateLeaderRuntime.runtime, 'PokerJoinPartyButton', { hidden: false, enabled: true }, 'unknown/late party leader discovery should show JOIN PARTY for the foreign lobby while the sender is still <unknown>');
        const unknownLateLeaderChatTarget = findPanel(unknownLateLeaderRuntime.runtime, 'ChatTargetLabel');
        if (unknownLateLeaderChatTarget) unknownLateLeaderChatTarget.text = 'TEAM';
        const unknownLateLeaderJoinStart = unknownLateLeaderRuntime.runtime.dispatches.length;
        const unknownLateLeaderJoinHandler = unknownLateLeaderRuntime.runtime.sandbox.PokerEscapeMenuJoinParty;
        assertEqual(typeof unknownLateLeaderJoinHandler, 'function', 'unknown/late party leader discovery should expose the JOIN PARTY handler');
        if (typeof unknownLateLeaderJoinHandler === 'function') unknownLateLeaderJoinHandler();
        drainScheduledCallbacks(unknownLateLeaderRuntime.runtime, 256);
        const unknownLateLeaderJoinMessages = submittedChatMessages(unknownLateLeaderRuntime.runtime, unknownLateLeaderJoinStart);
        assert(
          unknownLateLeaderJoinMessages.includes('[party join] poker party pmr8okjl1-1uxkydi'),
          `unknown/late party leader discovery JOIN PARTY should submit the pending unknown-sender lobby id: ${unknownLateLeaderJoinMessages.join('|') || '<none>'}`,
        );


        const repeatImportRuntime = importHostedLeaderProgress('hosted repeat import guard setup');
        startHostedLeaderResume(repeatImportRuntime, 'hosted repeat import first resume');
        const repeatEndHandler = repeatImportRuntime.leaderRuntime.runtime.sandbox.PokerEscapeMenuEndMatch;
        assertEqual(typeof repeatEndHandler, 'function', 'hosted repeat import should expose end-match handler');
        if (typeof repeatEndHandler === 'function') repeatEndHandler();
        repeatImportRuntime.leaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(repeatImportRuntime.leaderRuntime.runtime, 'START SYNCED HAND', true, false, 'hosted repeat import should return to normal synced start after ending an imported match');
        assertProgressImportAvailable(repeatImportRuntime.leaderRuntime.runtime, 'hosted repeat import end-match hosted-leader import controls');
        const repeatLeaveHandler = repeatImportRuntime.leaderRuntime.runtime.sandbox.PokerEscapeMenuLeaveLobby;
        assertEqual(typeof repeatLeaveHandler, 'function', 'hosted repeat import should expose leave handler');
        if (typeof repeatLeaveHandler === 'function') repeatLeaveHandler();
        drainScheduledCallbacks(repeatImportRuntime.leaderRuntime.runtime, 256);
        repeatImportRuntime.leaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertProgressImportHidden(repeatImportRuntime.leaderRuntime.runtime, 'hosted repeat import leave-reset import controls');
        assertStartButtonGate(repeatImportRuntime.leaderRuntime.runtime, 'HOST OR JOIN PARTY', false, false, 'hosted repeat import leave should return to an empty lobby instead of stale import-progress guard');
        const repeatHostTarget = findPanel(repeatImportRuntime.leaderRuntime.runtime, 'ChatTargetLabel');
        if (repeatHostTarget) repeatHostTarget.text = 'TEAM';
        const repeatHostHandler = repeatImportRuntime.leaderRuntime.runtime.sandbox.PokerEscapeMenuHostParty;
        assertEqual(typeof repeatHostHandler, 'function', 'hosted repeat import should expose host handler');
        if (typeof repeatHostHandler === 'function') repeatHostHandler();
        drainScheduledCallbacks(repeatImportRuntime.leaderRuntime.runtime, 256);
        repeatImportRuntime.leaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(repeatImportRuntime.leaderRuntime.runtime, 'WAITING FOR PARTY', false, false, 'hosted repeat import rehost should wait for party instead of stale import-progress guard');
        repeatImportRuntime.leaderRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: '[party join] poker party ' + repeatImportRuntime.leaderRuntime.hooks.state.party.id,
          isSelf: false,
        });
        repeatImportRuntime.leaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(repeatImportRuntime.leaderRuntime.runtime, 'START SYNCED HAND', true, false, 'hosted repeat import rehost should return to normal synced start after a member joins');
        const repeatInput = findPanel(repeatImportRuntime.leaderRuntime.runtime, 'PokerProgressCodeInput');
        assert(repeatInput, 'hosted repeat import should keep a progress input for re-importing');
        assertProgressImportAvailable(repeatImportRuntime.leaderRuntime.runtime, 'hosted repeat import rehost import controls');
        if (repeatInput) repeatInput.text = liveLogSaved.code;
        const repeatReimportAt = repeatImportRuntime.leaderRuntime.runtime.dispatches.length;
        repeatImportRuntime.leaderRuntime.runtime.sandbox.Date.now = () => 1700000500000;
        const repeatImportHandler = repeatImportRuntime.leaderRuntime.runtime.sandbox.PokerEscapeMenuImportProgress;
        assertEqual(typeof repeatImportHandler, 'function', 'hosted repeat import should expose import handler for re-import');
        const repeatImportResult = typeof repeatImportHandler === 'function' ? repeatImportHandler() : { ok: false };
        assertEqual(repeatImportResult && repeatImportResult.ok, true, 'hosted repeat import should accept pasted progress after leave and rehost');
        repeatImportRuntime.leaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(repeatImportRuntime.leaderRuntime.runtime, 'SHARING PROGRESS', false, false, 'hosted repeat import should share pasted progress after leave and rehost');
        drainScheduledCallbacks(repeatImportRuntime.leaderRuntime.runtime, 256);
        const repeatShareMessages = submittedChatMessages(repeatImportRuntime.leaderRuntime.runtime, repeatReimportAt);
        const repeatShare = parseProgressShareMessages(repeatShareMessages);
        assertEqual(repeatShare.offers.length, 1, `hosted repeat import should offer re-imported progress after leave and rehost: ${repeatShareMessages.join('|') || '<none>'}`);
        assertEqual(repeatShare.chunks.length, repeatShare.offers[0] ? repeatShare.offers[0].count : 0, 'hosted repeat import should send all re-imported progress chunks after leave and rehost');
        const repeatReadyAt = repeatImportRuntime.leaderRuntime.hooks.state.progressShare && repeatImportRuntime.leaderRuntime.hooks.state.progressShare.readyAt;
        assert(repeatReadyAt > 0, 'hosted repeat import should record readyAt after re-import share');
        repeatImportRuntime.leaderRuntime.runtime.sandbox.Date.now = () => repeatReadyAt + 1;
        repeatImportRuntime.leaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertStartButtonGate(repeatImportRuntime.leaderRuntime.runtime, 'NEXT SYNCED HAND', true, false, 'hosted repeat import should unlock imported restart after re-share');
        const repeatStartHandler = repeatImportRuntime.leaderRuntime.runtime.sandbox.PokerEscapeMenuStart;
        assertEqual(typeof repeatStartHandler, 'function', 'hosted repeat import should expose start handler for re-imported progress');
        const repeatSecondStartAt = repeatImportRuntime.leaderRuntime.runtime.dispatches.length;
        if (typeof repeatStartHandler === 'function') repeatStartHandler();
        drainScheduledCallbacks(repeatImportRuntime.leaderRuntime.runtime, 256);
        const repeatSecondMessages = submittedChatMessages(repeatImportRuntime.leaderRuntime.runtime, repeatSecondStartAt);
        const repeatResumeCommands = repeatSecondMessages.filter((chat) => /^poker resume\b/.test(chat));
        assertEqual(repeatResumeCommands.length, 1, `hosted repeat import should restart with one poker resume command after leave and rehost: ${repeatSecondMessages.join('|') || '<none>'}`);
        assertEqual(repeatSecondMessages.some((chat) => chat.indexOf('poker start ') === 0), false, `hosted repeat import should not restart as a fresh poker start after importing progress: ${repeatSecondMessages.join('|') || '<none>'}`);

        const hostedLeaderImport = importHostedLeaderProgress('hosted JDBeast/Hantu Raya leader manual import');

        const hostedMemberResumeStartRuntime = createMenuRuntime();
        hostedMemberResumeStartRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: `[party leader] poker party ${liveLogPartyId}`,
          isSelf: false,
        });
        hostedMemberResumeStartRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: `[party join] poker party ${liveLogPartyId}`,
          isSelf: true,
        });
        for (const chat of hostedLeaderImport.shareMessages) {
          if (chat.indexOf('[progress offer]') === 0 || chat.indexOf('[progress chunk]') === 0) {
            hostedMemberResumeStartRuntime.hooks.processChatRecord({
              sender: 'JDBeast',
              message: chat,
              isSelf: false,
            });
          }
        }
        assertEqual(hostedMemberResumeStartRuntime.hooks.state.resume.id, liveLogSaved.id, 'hosted JDBeast/Hantu Raya member receiver should auto-import the leader-shared progress id');
        assert(hostedMemberResumeStartRuntime.hooks.state.resume.payload, 'hosted JDBeast/Hantu Raya member receiver should auto-import the leader-shared progress payload');
        assertEqual(hostedMemberResumeStartRuntime.hooks.state.game, null, 'hosted JDBeast/Hantu Raya member receiver should not start a game from progress chunks alone');
        hostedMemberResumeStartRuntime.hooks.modules.TableRenderer.renderGame();
        assertButtonAffordance(hostedMemberResumeStartRuntime.runtime, 'PokerResumeControls', { hidden: false }, 'hosted JDBeast/Hantu Raya member shared progress button state');
        assertButtonAffordance(hostedMemberResumeStartRuntime.runtime, 'PokerResumeLeaderButton', { hidden: true, enabled: false }, 'hosted JDBeast/Hantu Raya member shared progress button state');
        assertButtonAffordance(hostedMemberResumeStartRuntime.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'hosted JDBeast/Hantu Raya member shared progress button state');
        assertStartButtonGate(hostedMemberResumeStartRuntime.runtime, 'WAITING FOR LEADER', false, true, 'hosted JDBeast/Hantu Raya member shared progress start button');

        const hostedLeaderResumeStartCommand = startHostedLeaderResume(hostedLeaderImport, 'hosted JDBeast/Hantu Raya leader imported progress');
        if (hostedLeaderResumeStartCommand) {
          hostedMemberResumeStartRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: hostedLeaderResumeStartCommand,
            isSelf: false,
          });
        }
        const hostedMemberResumeStartGame = hostedMemberResumeStartRuntime.hooks.state.game;
        assert(hostedMemberResumeStartGame, 'hosted JDBeast/Hantu Raya member receiver should start the resumed hand from the hosted leader short resume command without resume leader/ready ceremony');
        if (hostedMemberResumeStartGame) {
          assertEqual(hostedMemberResumeStartGame.active, true, 'hosted JDBeast/Hantu Raya member receiver resumed hand should be active');
          assertEqual(hostedMemberResumeStartGame.handNumber, liveLogSaved.payload.nextHandNumber, 'hosted JDBeast/Hantu Raya member receiver resumed hand should use the saved next hand number');
          assertEqual(
            JSON.stringify(playerIdentities(hostedMemberResumeStartGame)),
            JSON.stringify([
              { key: 'jdbeast', name: 'JDBeast' },
              { key: 'hantu raya', name: 'Hantu Raya' },
            ]),
            'hosted JDBeast/Hantu Raya member receiver resumed hand should seat both saved players',
          );
        }

        const createHostedSharedProgressMemberRuntime = (message) => {
          const memberRuntime = createMenuRuntime();
          memberRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: `[party leader] poker party ${liveLogPartyId}`,
            isSelf: false,
          });
          memberRuntime.hooks.processChatRecord({
            sender: 'Hantu Raya',
            message: `[party join] poker party ${liveLogPartyId}`,
            isSelf: true,
          });
          for (const chat of hostedLeaderImport.shareMessages) {
            if (chat.indexOf('[progress offer]') === 0 || chat.indexOf('[progress chunk]') === 0) {
              memberRuntime.hooks.processChatRecord({
                sender: 'JDBeast',
                message: chat,
                isSelf: false,
              });
            }
          }
          assertEqual(memberRuntime.hooks.state.resume.id, liveLogSaved.id, `${message} should auto-import the leader-shared progress id`);
          assert(memberRuntime.hooks.state.resume.payload, `${message} should auto-import the leader-shared progress payload`);
          assertEqual(memberRuntime.hooks.state.game, null, `${message} should not start a game from progress chunks alone`);
          return memberRuntime;
        };

        if (hostedLeaderResumeStartCommand) {
          const hostedProgressShareMessages = hostedLeaderImport.shareMessages.filter((chat) => chat.indexOf('[progress offer]') === 0 || chat.indexOf('[progress chunk]') === 0);
          const hostedProgressChunkMessages = hostedProgressShareMessages.filter((chat) => chat.indexOf('[progress chunk]') === 0);
          assert(hostedProgressChunkMessages.length >= 2, 'hosted JDBeast/Hantu Raya shared progress fixture should require multiple chunks for live ordering coverage');
          const createHostedPartyOnlyMemberRuntime = (message) => {
            const memberRuntime = createMenuRuntime();
            memberRuntime.hooks.processChatRecord({
              sender: 'JDBeast',
              message: `[party leader] poker party ${liveLogPartyId}`,
              isSelf: false,
            });
            memberRuntime.hooks.processChatRecord({
              sender: 'Hantu Raya',
              message: `[party join] poker party ${liveLogPartyId}`,
              isSelf: true,
            });
            assertEqual(memberRuntime.hooks.state.party.id, liveLogPartyId, `${message} setup should join the live hosted party`);
            assertEqual(memberRuntime.hooks.state.party.leaderKey, 'jdbeast', `${message} setup should know JDBeast as the hosted party leader`);
            assertEqual(memberRuntime.hooks.state.localPlayerKey, 'hantu raya', `${message} setup should remember Hantu Raya as the local member`);
            return memberRuntime;
          };
          const replayProgressShareMessages = (memberRuntime, messages) => {
            for (const chat of messages) {
              memberRuntime.hooks.processChatRecord({
                sender: 'JDBeast',
                message: chat,
                isSelf: false,
              });
            }
          };

          const unknownHostedResumeStartRuntime = createHostedSharedProgressMemberRuntime('hosted JDBeast/Hantu Raya member unknown-sender resume-start');
          unknownHostedResumeStartRuntime.hooks.processChatRecord({
            sender: '<unknown>',
            message: hostedLeaderResumeStartCommand,
            isSelf: false,
          });
          const unknownHostedResumeStartGame = unknownHostedResumeStartRuntime.hooks.state.game;
          assert(
            unknownHostedResumeStartGame,
            'hosted JDBeast/Hantu Raya member should resolve unknown-sender short resume-start to the known hosted party leader when resume id and leader key match imported progress',
          );
          if (unknownHostedResumeStartGame) {
            assertEqual(unknownHostedResumeStartGame.active, true, 'hosted unknown-sender resume-start resumed hand should be active');
            assertEqual(unknownHostedResumeStartGame.handNumber, liveLogSaved.payload.nextHandNumber, 'hosted unknown-sender resume-start should use the saved next hand number');
            assertEqual(
              JSON.stringify(playerIdentities(unknownHostedResumeStartGame)),
              JSON.stringify([
                { key: 'jdbeast', name: 'JDBeast' },
                { key: 'hantu raya', name: 'Hantu Raya' },
              ]),
              'hosted unknown-sender resume-start should seat both saved players',
            );
          }

          const firstProgressMessagesBeforeResume = [];
          const remainingProgressMessagesAfterResume = [];
          let capturedFirstChunkBeforeResume = false;
          for (const chat of hostedProgressShareMessages) {
            if (chat.indexOf('[progress offer]') === 0) {
              firstProgressMessagesBeforeResume.push(chat);
            } else if (!capturedFirstChunkBeforeResume) {
              capturedFirstChunkBeforeResume = true;
              firstProgressMessagesBeforeResume.push(chat);
            } else {
              remainingProgressMessagesAfterResume.push(chat);
            }
          }
          assert(remainingProgressMessagesAfterResume.length > 0, 'hosted unknown-sender live ordering fixture should leave progress chunks after the early resume-start');

          const outOfOrderUnknownRuntime = createHostedPartyOnlyMemberRuntime('hosted JDBeast/Hantu Raya out-of-order unknown resume-start');
          replayProgressShareMessages(outOfOrderUnknownRuntime, firstProgressMessagesBeforeResume);
          assertEqual(outOfOrderUnknownRuntime.hooks.state.game, null, 'hosted out-of-order unknown resume-start setup should not start before the short resume command');
          assertEqual(!!(outOfOrderUnknownRuntime.hooks.state.resume && outOfOrderUnknownRuntime.hooks.state.resume.payload), false, 'hosted out-of-order unknown resume-start setup should not finish importing progress before all chunks arrive');
          outOfOrderUnknownRuntime.hooks.processChatRecord({
            sender: '<unknown>',
            message: hostedLeaderResumeStartCommand,
            isSelf: false,
          });
          assertEqual(outOfOrderUnknownRuntime.hooks.state.game, null, 'hosted out-of-order unknown resume-start should wait for matching shared progress to finish importing');
          replayProgressShareMessages(outOfOrderUnknownRuntime, remainingProgressMessagesAfterResume);
          const outOfOrderUnknownGame = outOfOrderUnknownRuntime.hooks.state.game;
          assert(
            outOfOrderUnknownGame,
            'hosted out-of-order unknown resume-start should replay after matching shared progress completes and create the resumed hand',
          );
          if (outOfOrderUnknownGame) {
            assertEqual(outOfOrderUnknownGame.active, true, 'hosted out-of-order unknown resume-start resumed hand should be active');
            assertEqual(outOfOrderUnknownGame.handNumber, liveLogSaved.payload.nextHandNumber, 'hosted out-of-order unknown resume-start should use the saved next hand number');
            assertEqual(
              JSON.stringify(playerIdentities(outOfOrderUnknownGame)),
              JSON.stringify([
                { key: 'jdbeast', name: 'JDBeast' },
                { key: 'hantu raya', name: 'Hantu Raya' },
              ]),
              'hosted out-of-order unknown resume-start should seat both saved players',
            );
          }
          assertEqual(outOfOrderUnknownRuntime.hooks.state.resume.id, '', 'hosted out-of-order unknown resume-start should clear imported resume state after replay starts');
          assertEqual(
            !!(outOfOrderUnknownRuntime.hooks.state.pendingResumeStarts && outOfOrderUnknownRuntime.hooks.state.pendingResumeStarts[liveLogSaved.id]),
            false,
            'hosted out-of-order unknown resume-start should clear the queued resume command after replay starts',
          );

          const outOfOrderWrongLeaderRuntime = createHostedPartyOnlyMemberRuntime('hosted JDBeast/Hantu Raya out-of-order wrong leader');
          replayProgressShareMessages(outOfOrderWrongLeaderRuntime, firstProgressMessagesBeforeResume);
          outOfOrderWrongLeaderRuntime.hooks.processChatRecord({
            sender: '<unknown>',
            message: hostedLeaderResumeStartCommand.replace(' leader jdbeast ', ' leader hantu%20raya '),
            isSelf: false,
          });
          replayProgressShareMessages(outOfOrderWrongLeaderRuntime, remainingProgressMessagesAfterResume);
          assert(outOfOrderWrongLeaderRuntime.hooks.state.resume.payload, 'hosted out-of-order wrong-leader negative should still import the shared progress after remaining chunks arrive');
          assertEqual(outOfOrderWrongLeaderRuntime.hooks.state.game, null, 'hosted out-of-order unknown resume-start with the wrong leader key should not replay into a game after import completes');

          const outOfOrderWrongIdRuntime = createHostedPartyOnlyMemberRuntime('hosted JDBeast/Hantu Raya out-of-order wrong resume id');
          replayProgressShareMessages(outOfOrderWrongIdRuntime, firstProgressMessagesBeforeResume);
          outOfOrderWrongIdRuntime.hooks.processChatRecord({
            sender: '<unknown>',
            message: hostedLeaderResumeStartCommand.replace(`poker resume ${liveLogSaved.id} `, 'poker resume rwrong-live-import '),
            isSelf: false,
          });
          replayProgressShareMessages(outOfOrderWrongIdRuntime, remainingProgressMessagesAfterResume);
          assert(outOfOrderWrongIdRuntime.hooks.state.resume.payload, 'hosted out-of-order wrong-id negative should still import the shared progress after remaining chunks arrive');
          assertEqual(outOfOrderWrongIdRuntime.hooks.state.game, null, 'hosted out-of-order unknown resume-start with the wrong resume id should not replay into a game after import completes');

          const unknownWrongLeaderRuntime = createHostedSharedProgressMemberRuntime('hosted JDBeast/Hantu Raya member unknown-sender wrong leader');
          const wrongLeaderResumeStartCommand = hostedLeaderResumeStartCommand.replace(' leader jdbeast ', ' leader hantu%20raya ');
          assert(wrongLeaderResumeStartCommand !== hostedLeaderResumeStartCommand, 'hosted unknown-sender wrong-leader fixture should change the leader key');
          unknownWrongLeaderRuntime.hooks.processChatRecord({
            sender: '<unknown>',
            message: wrongLeaderResumeStartCommand,
            isSelf: false,
          });
          assertEqual(
            unknownWrongLeaderRuntime.hooks.state.game,
            null,
            'hosted unknown-sender resume-start with the wrong leader key should not create a game even after matching progress imported',
          );
          assertEqual(unknownWrongLeaderRuntime.hooks.state.resume.id, liveLogSaved.id, 'hosted unknown-sender wrong-leader rejection should keep the imported resume id');

          const unknownWrongIdRuntime = createHostedSharedProgressMemberRuntime('hosted JDBeast/Hantu Raya member unknown-sender wrong resume id');
          const wrongIdResumeStartCommand = hostedLeaderResumeStartCommand.replace(`poker resume ${liveLogSaved.id} `, 'poker resume rwrong-live-import ');
          assert(wrongIdResumeStartCommand !== hostedLeaderResumeStartCommand, 'hosted unknown-sender wrong-id fixture should change the resume id');
          unknownWrongIdRuntime.hooks.processChatRecord({
            sender: '<unknown>',
            message: wrongIdResumeStartCommand,
            isSelf: false,
          });
          assertEqual(
            unknownWrongIdRuntime.hooks.state.game,
            null,
            'hosted unknown-sender resume-start with the wrong resume id should not create a game even when the leader key matches',
          );
          assertEqual(unknownWrongIdRuntime.hooks.state.resume.id, liveLogSaved.id, 'hosted unknown-sender wrong-id rejection should keep the imported resume id');
        }

        const detachedSharedProgressRuntime = createMenuRuntime();
        detachedSharedProgressRuntime.hooks.state.localPlayerKey = 'hantu raya';
        detachedSharedProgressRuntime.runtime.config.PokerLocalPlayerKey = 'hantu raya';
        detachedSharedProgressRuntime.runtime.config.PokerLocalPlayerName = 'Hantu Raya';
        clearPartyForLegacyReady(detachedSharedProgressRuntime.hooks);
        const detachedShareChecksum = progressChecksumFromCode(liveLogSaved.code);
        const detachedShareChunks = splitProgressCodeForChat(liveLogSaved.code, 4);
        detachedSharedProgressRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: buildProgressOfferMessage(liveLogSaved.id, detachedShareChecksum, detachedShareChunks.length),
          isSelf: false,
        });
        for (let i = 0; i < detachedShareChunks.length; i += 1) {
          detachedSharedProgressRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: buildProgressChunkMessage(liveLogSaved.id, detachedShareChecksum, i + 1, detachedShareChunks.length, detachedShareChunks[i]),
            isSelf: false,
          });
        }
        assertEqual(detachedSharedProgressRuntime.hooks.state.party.id, '', 'detached Hantu Raya shared-progress receiver should have no hosted party id');
        assertEqual(detachedSharedProgressRuntime.hooks.state.localPlayerKey, 'hantu raya', 'detached Hantu Raya shared-progress receiver should keep Hantu Raya as local identity');
        assertEqual(detachedSharedProgressRuntime.hooks.state.resume.id, liveLogSaved.id, 'detached Hantu Raya shared-progress receiver should store the leader-shared progress id');
        assert(detachedSharedProgressRuntime.hooks.state.resume.payload, 'detached Hantu Raya shared-progress receiver should store the leader-shared progress payload');
        assertEqual(detachedSharedProgressRuntime.hooks.state.game, null, 'detached Hantu Raya shared-progress receiver should not start a game from progress chunks alone');
        detachedSharedProgressRuntime.hooks.modules.TableRenderer.renderGame();
        assertButtonAffordance(detachedSharedProgressRuntime.runtime, 'PokerResumeLeaderButton', { hidden: true, enabled: false }, 'detached Hantu Raya shared-progress receiver role buttons');
        assertButtonAffordance(detachedSharedProgressRuntime.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'detached Hantu Raya shared-progress receiver role buttons');
        assertStartButtonGate(detachedSharedProgressRuntime.runtime, 'HOST OR JOIN PARTY', false, false, 'detached Hantu Raya shared-progress receiver start button');
        detachedSharedProgressRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: detachedSharedProgressRuntime.hooks.buildResumeLeaderCommand(liveLogSaved.id),
          isSelf: true,
        });
        assertEqual(detachedSharedProgressRuntime.hooks.state.game, null, 'detached Hantu Raya bad resume-leader self chat should not start a game');
        assert(detachedSharedProgressRuntime.hooks.state.resume.leaderKey !== 'hantu raya', 'detached Hantu Raya bad resume-leader self chat should not make Hantu Raya the resume leader');
        const detachedBadHantuStartCommand = `poker resume ${liveLogSaved.id} hand ${liveLogSaved.payload.nextHandNumber} leader hantu%20raya seed shantu-raya-bad`;
        detachedSharedProgressRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: detachedBadHantuStartCommand,
          isSelf: true,
        });
        assertEqual(detachedSharedProgressRuntime.hooks.state.game, null, 'detached Hantu Raya bad resume-start self chat should not create a game');
        assert(detachedSharedProgressRuntime.hooks.state.resume.leaderKey !== 'hantu raya', 'detached Hantu Raya bad resume-start self chat should not make Hantu Raya the resume leader');
        const detachedValidJdbeastStartCommand = `poker resume ${liveLogSaved.id} hand ${liveLogSaved.payload.nextHandNumber} leader jdbeast seed sjdbeast-detached-share`;
        detachedSharedProgressRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: detachedValidJdbeastStartCommand,
          isSelf: false,
        });
        const detachedSharedProgressGame = detachedSharedProgressRuntime.hooks.state.game;
        assert(detachedSharedProgressGame, 'detached Hantu Raya shared-progress receiver should start from JDBeast remote resume-start authority');
        if (detachedSharedProgressGame) {
          assertEqual(detachedSharedProgressGame.active, true, 'detached Hantu Raya shared-progress resumed hand should be active');
          assertEqual(detachedSharedProgressGame.handNumber, liveLogSaved.payload.nextHandNumber, 'detached Hantu Raya shared-progress resumed hand should use the saved next hand number');
          assertEqual(detachedSharedProgressGame.seed, 'sjdbeast-detached-share', 'detached Hantu Raya shared-progress resumed hand should use JDBeast remote resume-start seed');
          assertEqual(
            JSON.stringify(playerIdentities(detachedSharedProgressGame)),
            JSON.stringify([
              { key: 'jdbeast', name: 'JDBeast' },
              { key: 'hantu raya', name: 'Hantu Raya' },
            ]),
            'detached Hantu Raya shared-progress resumed hand should seat both saved players',
          );
        }

        const seedStaleForeignPartySharedProgressRuntime = (message, assertNoLocalStart) => {
          const staleRuntime = createMenuRuntime();
          staleRuntime.hooks.processChatRecord({
            sender: 'Hantu Raya',
            message: '[party leader] poker party pstale-foreign',
            isSelf: true,
          });
          staleRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: '[party join] poker party pstale-foreign',
            isSelf: false,
          });
          assertEqual(staleRuntime.hooks.state.party.mode, 'leader', `${message} setup should retain stale local leader mode`);
          assertEqual(staleRuntime.hooks.state.party.leaderKey, 'hantu raya', `${message} setup should retain stale Hantu Raya party leader key`);
          assertEqual(staleRuntime.hooks.state.localPlayerKey, 'hantu raya', `${message} setup should remember Hantu Raya as local identity`);
          staleRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: buildProgressOfferMessage(liveLogSaved.id, detachedShareChecksum, detachedShareChunks.length),
            isSelf: false,
          });
          for (let i = 0; i < detachedShareChunks.length; i += 1) {
            staleRuntime.hooks.processChatRecord({
              sender: 'JDBeast',
              message: buildProgressChunkMessage(liveLogSaved.id, detachedShareChecksum, i + 1, detachedShareChunks.length, detachedShareChunks[i]),
              isSelf: false,
            });
          }
          assertEqual(staleRuntime.hooks.state.resume.id, liveLogSaved.id, `${message} should import the leader-shared progress id`);
          assert(staleRuntime.hooks.state.resume.payload, `${message} should import the leader-shared progress payload`);
          assertEqual(staleRuntime.hooks.state.game, null, `${message} should not start a game from progress chunks alone`);
          const staleResume = staleRuntime.hooks.state.resume;
          if (Object.prototype.hasOwnProperty.call(staleResume, 'hostedLeaderKey')) {
            assertEqual(staleResume.hostedLeaderKey, 'jdbeast', `${message} should bind hosted shared-progress authority to JDBeast despite stale local party leader`);
          }
          assert(staleResume.leaderKey !== 'hantu raya', `${message} should not fall back to stale Hantu Raya resume leader authority`);
          if (staleResume.leaderKey) {
            assertEqual(staleResume.leaderKey, 'jdbeast', `${message} effective resume leader should be JDBeast when recorded`);
          }
          staleRuntime.hooks.modules.TableRenderer.renderGame();
          assertButtonAffordance(staleRuntime.runtime, 'PokerResumeLeaderButton', { hidden: true, enabled: false }, `${message} legacy resume leader button`);
          assertButtonAffordance(staleRuntime.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, `${message} legacy resume ready button`);
          if (assertNoLocalStart !== false) {
            const staleStartButton = findPanel(staleRuntime.runtime, 'PokerStartButton');
            const staleStartLabel = panelText(findPanel(staleRuntime.runtime, 'PokerStartButtonLabel'));
            const staleStartUsable = !!(staleStartButton && !hasClass(staleStartButton, 'PokerHidden') && !hasClass(staleStartButton, 'Disabled') && staleStartButton.hittest !== false);
            assert(!staleStartUsable, `${message} should not expose a usable stale Hantu Raya start control: ${staleStartLabel || '<empty>'}`);
          }
          return staleRuntime;
        };

        const staleForeignPartySharedProgressRuntime = seedStaleForeignPartySharedProgressRuntime('stale Hantu Raya party leader receiving JDBeast shared progress');
        staleForeignPartySharedProgressRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: staleForeignPartySharedProgressRuntime.hooks.buildResumeLeaderCommand(liveLogSaved.id),
          isSelf: true,
        });
        assertEqual(staleForeignPartySharedProgressRuntime.hooks.state.game, null, 'stale Hantu Raya party leader self resume-leader chat should not start a game');
        assert(staleForeignPartySharedProgressRuntime.hooks.state.resume.leaderKey !== 'hantu raya', 'stale Hantu Raya party leader self resume-leader chat should not make Hantu Raya the resume leader');
        if (Object.prototype.hasOwnProperty.call(staleForeignPartySharedProgressRuntime.hooks.state.resume, 'hostedLeaderKey')) {
          assertEqual(staleForeignPartySharedProgressRuntime.hooks.state.resume.hostedLeaderKey, 'jdbeast', 'stale Hantu Raya party leader self resume-leader chat should keep JDBeast hosted authority');
        }
        const staleBadHantuStartCommand = `poker resume ${liveLogSaved.id} hand ${liveLogSaved.payload.nextHandNumber} leader hantu%20raya seed shantu-stale-party-bad`;
        staleForeignPartySharedProgressRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: staleBadHantuStartCommand,
          isSelf: true,
        });
        assertEqual(staleForeignPartySharedProgressRuntime.hooks.state.game, null, 'stale Hantu Raya party leader self resume-start chat should not create a game');
        assert(staleForeignPartySharedProgressRuntime.hooks.state.resume.leaderKey !== 'hantu raya', 'stale Hantu Raya party leader self resume-start chat should not make Hantu Raya the resume leader');
        if (Object.prototype.hasOwnProperty.call(staleForeignPartySharedProgressRuntime.hooks.state.resume, 'hostedLeaderKey')) {
          assertEqual(staleForeignPartySharedProgressRuntime.hooks.state.resume.hostedLeaderKey, 'jdbeast', 'stale Hantu Raya party leader self resume-start chat should keep JDBeast hosted authority');
        }

        const staleForeignPartyJdbeastStartRuntime = seedStaleForeignPartySharedProgressRuntime('stale Hantu Raya party leader accepting JDBeast resume start', false);
        const staleValidJdbeastStartCommand = `poker resume ${liveLogSaved.id} hand ${liveLogSaved.payload.nextHandNumber} leader jdbeast seed sjdbeast-stale-party-share`;
        staleForeignPartyJdbeastStartRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: staleValidJdbeastStartCommand,
          isSelf: false,
        });
        const staleForeignPartySharedProgressGame = staleForeignPartyJdbeastStartRuntime.hooks.state.game;
        assert(staleForeignPartySharedProgressGame, 'stale Hantu Raya party leader receiver should start from JDBeast remote resume-start authority');
        if (staleForeignPartySharedProgressGame) {
          assertEqual(staleForeignPartySharedProgressGame.active, true, 'stale Hantu Raya party leader resumed hand should be active');
          assertEqual(staleForeignPartySharedProgressGame.handNumber, liveLogSaved.payload.nextHandNumber, 'stale Hantu Raya party leader resumed hand should use the saved next hand number');
          assertEqual(staleForeignPartySharedProgressGame.seed, 'sjdbeast-stale-party-share', 'stale Hantu Raya party leader resumed hand should use JDBeast remote resume-start seed');
          assertEqual(
            JSON.stringify(playerIdentities(staleForeignPartySharedProgressGame)),
            JSON.stringify([
              { key: 'jdbeast', name: 'JDBeast' },
              { key: 'hantu raya', name: 'Hantu Raya' },
            ]),
            'stale Hantu Raya party leader resumed hand should seat both saved players',
          );
        }

        const hostedLeaderEndSyncImport = importHostedLeaderProgress('hosted JDBeast/Hantu Raya leader end-sync import');
        const hostedMemberEndSyncRuntime = createMenuRuntime();
        hostedMemberEndSyncRuntime.hooks.processChatRecord({
          sender: 'JDBeast',
          message: `[party leader] poker party ${liveLogPartyId}`,
          isSelf: false,
        });
        hostedMemberEndSyncRuntime.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: `[party join] poker party ${liveLogPartyId}`,
          isSelf: true,
        });
        for (const chat of hostedLeaderEndSyncImport.shareMessages) {
          if (chat.indexOf('[progress offer]') === 0 || chat.indexOf('[progress chunk]') === 0) {
            hostedMemberEndSyncRuntime.hooks.processChatRecord({
              sender: 'JDBeast',
              message: chat,
              isSelf: false,
            });
          }
        }
        const hostedLeaderEndSyncStartCommand = startHostedLeaderResume(hostedLeaderEndSyncImport, 'hosted JDBeast/Hantu Raya leader end-sync resume');
        if (hostedLeaderEndSyncStartCommand) {
          hostedMemberEndSyncRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: hostedLeaderEndSyncStartCommand,
            isSelf: false,
          });
        }
        assert(hostedLeaderEndSyncImport.leaderRuntime.hooks.state.game && hostedLeaderEndSyncImport.leaderRuntime.hooks.state.game.active, 'hosted JDBeast/Hantu Raya end-sync leader setup should have an active imported game');
        assert(hostedMemberEndSyncRuntime.hooks.state.game && hostedMemberEndSyncRuntime.hooks.state.game.active, 'hosted JDBeast/Hantu Raya end-sync member setup should have an active imported game');
        hostedMemberEndSyncRuntime.hooks.modules.PendingSelfAction.record('call', hostedMemberEndSyncRuntime.hooks.state.game.players[1], hostedMemberEndSyncRuntime.hooks.state.game);
        const hostedLeaderEndSyncAt = hostedLeaderEndSyncImport.leaderRuntime.runtime.dispatches.length;
        const hostedLeaderEndSyncHandler = hostedLeaderEndSyncImport.leaderRuntime.runtime.sandbox.PokerEscapeMenuEndMatch;
        assertEqual(typeof hostedLeaderEndSyncHandler, 'function', 'hosted JDBeast/Hantu Raya end-sync leader should expose end-match handler');
        if (typeof hostedLeaderEndSyncHandler === 'function') hostedLeaderEndSyncHandler();
        drainScheduledCallbacks(hostedLeaderEndSyncImport.leaderRuntime.runtime, 256);
        const hostedLeaderEndSyncMessages = submittedChatMessages(hostedLeaderEndSyncImport.leaderRuntime.runtime, hostedLeaderEndSyncAt);
        const hostedEndCommandPattern = new RegExp(`^\\[match end\\] poker party ${liveLogPartyId}(?:\\s|$)`);
        const hostedEndCommands = hostedLeaderEndSyncMessages.filter((chat) => hostedEndCommandPattern.test(chat));
        assertEqual(hostedEndCommands.length, 1, `hosted JDBeast/Hantu Raya end-sync leader should submit exactly one chat match-end command for the hosted party: ${hostedLeaderEndSyncMessages.join('|') || '<none>'}`);
        if (hostedEndCommands[0]) {
          hostedMemberEndSyncRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: hostedEndCommands[0],
            isSelf: false,
          });
          hostedMemberEndSyncRuntime.hooks.modules.TableRenderer.renderGame();
          assertEqual(hostedMemberEndSyncRuntime.hooks.state.game, null, 'hosted JDBeast/Hantu Raya end-sync member should clear the active game from the leader match-end command');
          assertEqual(hostedMemberEndSyncRuntime.runtime.config.PokerPendingSelfAction, undefined, 'hosted JDBeast/Hantu Raya end-sync member should clear pending self action after remote match end');
          const hostedMemberEndSyncActions = findPanel(hostedMemberEndSyncRuntime.runtime, 'PokerActionButtons');
          assert(hasClass(hostedMemberEndSyncActions, 'PokerHidden'), 'hosted JDBeast/Hantu Raya end-sync member should hide action buttons after remote match end');
          assertEqual(hostedMemberEndSyncActions ? hostedMemberEndSyncActions.GetChildCount() : 0, 0, 'hosted JDBeast/Hantu Raya end-sync member should remove stale action buttons after remote match end');
          assertPanelHidden(hostedMemberEndSyncRuntime.runtime, 'PokerEndMatchButton', 'hosted JDBeast/Hantu Raya end-sync member lobby after remote match end');
          assertPanelHidden(hostedMemberEndSyncRuntime.runtime, 'PokerGameLog', 'hosted JDBeast/Hantu Raya end-sync member lobby after remote match end');
          assertEqual(hostedMemberEndSyncRuntime.hooks.state.party.id, liveLogPartyId, 'hosted JDBeast/Hantu Raya end-sync member should keep the hosted party id after remote match end');
          assertEqual(
            JSON.stringify(hostedMemberEndSyncRuntime.hooks.getPartyRoster().map((entry) => ({ key: entry.key, name: entry.name }))),
            JSON.stringify([
              { key: 'jdbeast', name: 'JDBeast' },
              { key: 'hantu raya', name: 'Hantu Raya' },
            ]),
            'hosted JDBeast/Hantu Raya end-sync member should keep both party roster members after remote match end',
          );
          assertStartButtonGate(hostedMemberEndSyncRuntime.runtime, 'WAITING FOR LEADER', false, true, 'hosted JDBeast/Hantu Raya end-sync member lobby button state after remote match end');
        }

        const assertDetachedImportedProgressCannotLead = (localName) => {
          const detachedRuntime = createMenuRuntime();
          const localKey = localName.toLowerCase();
          detachedRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: `[party leader] poker party ${liveLogPartyId}`,
            isSelf: localName === 'JDBeast',
          });
          detachedRuntime.hooks.processChatRecord({
            sender: 'Hantu Raya',
            message: `[party join] poker party ${liveLogPartyId}`,
            isSelf: localName === 'Hantu Raya',
          });
          detachedRuntime.hooks.processChatRecord({
            sender: 'JDBeast',
            message: `[party leave] poker party ${liveLogPartyId}`,
            isSelf: localName === 'JDBeast',
          });
          detachedRuntime.hooks.processChatRecord({
            sender: 'Hantu Raya',
            message: `[party leave] poker party ${liveLogPartyId}`,
            isSelf: localName === 'Hantu Raya',
          });
          detachedRuntime.hooks.importProgressSaveCode(liveLogSaved.code);
          detachedRuntime.hooks.state.localPlayerKey = localKey;
          detachedRuntime.runtime.config.PokerLocalPlayerKey = localKey;
          detachedRuntime.runtime.config.PokerLocalPlayerName = localName;
          detachedRuntime.hooks.modules.TableRenderer.renderGame();
          assertEqual(detachedRuntime.hooks.state.party.id, '', `${localName} detached imported progress setup should have no hosted party id`);
          assertEqual(detachedRuntime.hooks.getReadySeatArray().length, 0, `${localName} detached imported progress setup should have zero ready seats`);
          assert(detachedRuntime.hooks.state.resume && detachedRuntime.hooks.state.resume.payload, `${localName} detached imported progress setup should keep the imported resume payload`);
          assertButtonAffordance(detachedRuntime.runtime, 'PokerResumeLeaderButton', { hidden: true, enabled: false }, `${localName} detached imported progress role clarity`);
          assertButtonAffordance(detachedRuntime.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, `${localName} detached imported progress role clarity`);
          const roleClarityText = [
            panelText(findPanel(detachedRuntime.runtime, 'PokerStartButtonLabel')),
            panelText(findPanel(detachedRuntime.runtime, 'PokerStatusLabel')),
            panelText(findPanel(detachedRuntime.runtime, 'PokerPartyStatusLabel')),
            panelText(findPanel(detachedRuntime.runtime, 'PokerResumeStatusLabel')),
          ].join(' ');
          assert(
            /\bparty\b/i.test(roleClarityText) && /\b(host|join|leader|import)\b/i.test(roleClarityText),
            `${localName} detached imported progress should direct the user through a hosted party leader/import path: ${roleClarityText || '<empty>'}`,
          );
          assert(
            !/\bLEAD RESUME\b|\bREADY RESUME\b|\[resume leader\]/i.test(roleClarityText),
            `${localName} detached imported progress should not advertise legacy standalone resume ceremony: ${roleClarityText || '<empty>'}`,
          );
          const resumeLeaderChatTarget = findPanel(detachedRuntime.runtime, 'ChatTargetLabel');
          if (resumeLeaderChatTarget) resumeLeaderChatTarget.text = 'TEAM';
          const detachedLeaderStart = detachedRuntime.runtime.dispatches.length;
          const detachedLeaderHandler = detachedRuntime.runtime.sandbox.PokerEscapeMenuResumeLeader;
          assertEqual(typeof detachedLeaderHandler, 'function', `${localName} detached imported progress should expose resume leader handler`);
          if (typeof detachedLeaderHandler === 'function') detachedLeaderHandler();
          drainScheduledCallbacks(detachedRuntime.runtime, 256);
          const detachedLeaderMessages = submittedChatMessages(detachedRuntime.runtime, detachedLeaderStart);
          assertEqual(detachedLeaderMessages.some((chat) => chat.indexOf('[resume leader]') === 0), false, `${localName} detached imported progress resume leader handler should not emit a resume-leader command with zero ready seats and no hosted party: ${detachedLeaderMessages.join('|') || '<none>'}`);
        };
        assertDetachedImportedProgressCannotLead('JDBeast');
        assertDetachedImportedProgressCannotLead('Hantu Raya');

        const hostedLeaderLeaveStart = hostedLeaderImport.leaderRuntime.runtime.dispatches.length;
        const leaveHandler = hostedLeaderImport.leaderRuntime.runtime.sandbox.PokerEscapeMenuLeaveLobby;
        assertEqual(typeof leaveHandler, 'function', 'hosted JDBeast/Hantu Raya resumed leader should expose the leave handler');
        if (typeof leaveHandler === 'function') leaveHandler();
        drainScheduledCallbacks(hostedLeaderImport.leaderRuntime.runtime, 256);
        const hostedLeaderLeaveMessages = submittedChatMessages(hostedLeaderImport.leaderRuntime.runtime, hostedLeaderLeaveStart);
        assert(
          hostedLeaderLeaveMessages.includes(`[party leave] poker party ${liveLogPartyId}`),
          `hosted JDBeast/Hantu Raya resumed leader should leave the real hosted party id: ${hostedLeaderLeaveMessages.join('|') || '<none>'}`,
        );
        assert(
          !hostedLeaderLeaveMessages.includes(`[party leave] poker party ${liveLogSaved.id}`),
          `hosted JDBeast/Hantu Raya resumed leader should not leave with the resume id: ${hostedLeaderLeaveMessages.join('|') || '<none>'}`,
        );
        assertEqual(hostedLeaderImport.leaderRuntime.hooks.state.game, null, 'hosted JDBeast/Hantu Raya leave should clear the active game');
        assertResumeCleared(hostedLeaderImport.leaderRuntime, 'hosted JDBeast/Hantu Raya leave');
        assertProgressTransfersCleared(hostedLeaderImport.leaderRuntime, 'hosted JDBeast/Hantu Raya leave');
        hostedLeaderImport.leaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertImportedProgressEscapeCleared(hostedLeaderImport.leaderRuntime, 'hosted JDBeast/Hantu Raya leave');
        assertInactiveLobbyControls(hostedLeaderImport.leaderRuntime.runtime, 'hosted JDBeast/Hantu Raya leave');
        assertButtonAffordance(hostedLeaderImport.leaderRuntime.runtime, 'PokerHostPartyButton', { hidden: false, enabled: true }, 'hosted JDBeast/Hantu Raya leave empty-lobby button state');
        assertButtonAffordance(hostedLeaderImport.leaderRuntime.runtime, 'PokerJoinPartyButton', { hidden: true, enabled: false }, 'hosted JDBeast/Hantu Raya leave empty-lobby button state');
        assertProgressImportHidden(hostedLeaderImport.leaderRuntime.runtime, 'hosted JDBeast/Hantu Raya leave empty-lobby import controls');

        const hostedLeaderEndImport = importHostedLeaderProgress('hosted JDBeast/Hantu Raya leader end-match import');
        startHostedLeaderResume(hostedLeaderEndImport, 'hosted JDBeast/Hantu Raya leader end-match resume');
        const endHandler = hostedLeaderEndImport.leaderRuntime.runtime.sandbox.PokerEscapeMenuEndMatch;
        assertEqual(typeof endHandler, 'function', 'hosted JDBeast/Hantu Raya resumed leader should expose the end-match handler');
        if (typeof endHandler === 'function') endHandler();
        hostedLeaderEndImport.leaderRuntime.hooks.modules.TableRenderer.renderGame();
        assertEqual(hostedLeaderEndImport.leaderRuntime.hooks.state.game, null, 'hosted JDBeast/Hantu Raya end match should clear the game');
        assertResumeCleared(hostedLeaderEndImport.leaderRuntime, 'hosted JDBeast/Hantu Raya end match');
        assertProgressTransfersCleared(hostedLeaderEndImport.leaderRuntime, 'hosted JDBeast/Hantu Raya end match');
        assertImportedProgressEscapeCleared(hostedLeaderEndImport.leaderRuntime, 'hosted JDBeast/Hantu Raya end match');
        assertEqual(hostedLeaderEndImport.leaderRuntime.hooks.state.party.mode, 'leader', 'hosted JDBeast/Hantu Raya end match should keep the hosted party leader mode');
        assertEqual(hostedLeaderEndImport.leaderRuntime.hooks.state.party.id, liveLogPartyId, 'hosted JDBeast/Hantu Raya end match should keep the hosted party id');
        assertEqual(
          JSON.stringify(hostedLeaderEndImport.leaderRuntime.hooks.getPartyRoster().map((entry) => ({ key: entry.key, name: entry.name }))),
          JSON.stringify([
            { key: 'jdbeast', name: 'JDBeast' },
            { key: 'hantu raya', name: 'Hantu Raya' },
          ]),
          'hosted JDBeast/Hantu Raya end match should keep both party roster members',
        );
        assertStartButtonGate(hostedLeaderEndImport.leaderRuntime.runtime, 'START SYNCED HAND', true, false, 'hosted JDBeast/Hantu Raya end match hosted-party button state');
        assertProgressImportAvailable(hostedLeaderEndImport.leaderRuntime.runtime, 'hosted JDBeast/Hantu Raya end match hosted-leader import controls');

        const liveLogResume = createMenuRuntime();
        assertEqual(liveLogResume.hooks.importProgressSaveCode(liveLogSaved.code).ok, true, 'JDBeast/Hantu Raya receiver should import saved progress');
        const liveLogBuiltStartCommand = liveLogResume.hooks.buildResumeStartCommand(
          liveLogSaved.id,
          'jdbeast',
          liveLogSaved.payload.roster,
          liveLogSaved.payload.nextHandNumber,
          'shantu-raya-resume',
        );
        assert(
          liveLogBuiltStartCommand.length <= MAX_PROGRESS_CHAT_COMMAND_LENGTH,
          `JDBeast/Hantu Raya resume start builder should fit the chat-safe command length (${MAX_PROGRESS_CHAT_COMMAND_LENGTH}), got ${liveLogBuiltStartCommand.length}: ${liveLogBuiltStartCommand}`,
        );
        const liveLogShortStartCommand = `poker resume ${liveLogSaved.id} hand ${liveLogSaved.payload.nextHandNumber} leader jdbeast seed shantu-raya-resume`;
        assert(
          liveLogShortStartCommand.length <= MAX_PROGRESS_CHAT_COMMAND_LENGTH,
          `JDBeast/Hantu Raya short resume command fixture should fit the chat-safe command length (${MAX_PROGRESS_CHAT_COMMAND_LENGTH}), got ${liveLogShortStartCommand.length}: ${liveLogShortStartCommand}`,
        );
        assertEqual(
          liveLogShortStartCommand,
          `poker resume ${liveLogSaved.id} hand 2 leader jdbeast seed shantu-raya-resume`,
          'JDBeast/Hantu Raya short resume start command should match the proposed live-safe wire format',
        );
        liveLogResume.hooks.processChatRecord({
          sender: 'JDBeast',
          message: liveLogResume.hooks.buildResumeLeaderCommand(liveLogSaved.id),
          isSelf: true,
        });
        liveLogResume.hooks.processChatRecord({
          sender: 'Hantu Raya',
          message: liveLogResume.hooks.buildResumeReadyCommand(liveLogSaved.id),
          isSelf: false,
        });
        assertEqual(liveLogResume.hooks.getResumeGate().enabled, true, 'JDBeast/Hantu Raya resume gate should be startable after leader and ready messages');
        const liveLogStatusBeforeStart = panelText(findPanel(liveLogResume.runtime, 'PokerStatusLabel'));
        const liveLogMessagesBeforeStart = liveLogResume.runtime.messages.length;
        liveLogResume.hooks.processChatRecord({
          sender: 'JDBeast',
          message: liveLogShortStartCommand,
          isSelf: true,
        });
        const liveLogStartDiagnostics = [
          panelText(findPanel(liveLogResume.runtime, 'PokerStatusLabel')) !== liveLogStatusBeforeStart
            ? panelText(findPanel(liveLogResume.runtime, 'PokerStatusLabel'))
            : '',
        ]
          .concat(liveLogResume.runtime.messages.slice(liveLogMessagesBeforeStart))
          .join('\n')
          .toLowerCase();
        assert(
          !liveLogStartDiagnostics.includes('invalid synced poker roster'),
          `JDBeast/Hantu Raya short resume start should not reject the saved space-bearing roster: ${liveLogStartDiagnostics || '<empty>'}`,
        );
        const liveLogGame = liveLogResume.hooks.state.game;
        assert(liveLogGame, 'JDBeast/Hantu Raya resume start should create a resumed game');
        if (liveLogGame) {
          assertEqual(liveLogGame.active, true, 'JDBeast/Hantu Raya resumed game should be active');
          assertEqual(liveLogGame.handNumber, 2, 'JDBeast/Hantu Raya resumed game should start hand 2');
          assertEqual(liveLogGame.seed, 'shantu-raya-resume', 'JDBeast/Hantu Raya resumed game should use the resume seed');
          assertEqual(
            JSON.stringify(playerIdentities(liveLogGame)),
            JSON.stringify([
              { key: 'jdbeast', name: 'JDBeast' },
              { key: 'hantu raya', name: 'Hantu Raya' },
            ]),
            'JDBeast/Hantu Raya resumed game should seat both saved players',
          );
        }
      }

    if (saved.code && saved.payload) {
      const chunkedImport = createMenuRuntime();
      const checksum = progressChecksumFromCode(saved.code);
      const chunks = splitProgressCodeForChat(saved.code, 3);
      assert(chunks.length >= 2, 'progress handshake regression fixture should split into multiple chat chunks');
      chunkedImport.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressOfferMessage(saved.id, checksum, chunks.length),
        isSelf: false,
      });
      chunkedImport.hooks.modules.TableRenderer.renderGame();
      assertButtonAffordance(chunkedImport.runtime, 'PokerResumeControls', { hidden: true }, 'chunked progress offer button state');
      assertStartButtonGate(chunkedImport.runtime, 'HOST OR JOIN PARTY', false, false, 'chunked progress offer button state');
      assert(panelText(findPanel(chunkedImport.runtime, 'PokerStatusLabel')).includes('Receiving progress'), 'chunked progress offer should show receiving-progress status');
      for (let i = 0; i < chunks.length; i += 1) {
        chunkedImport.hooks.processChatRecord({
          sender: 'Seven',
          message: buildProgressChunkMessage(saved.id, checksum, i + 1, chunks.length, chunks[i]),
          isSelf: false,
        });
      }
      assertEqual(chunkedImport.hooks.state.game, null, 'chunked progress import should not create or start a game');
      assert(chunkedImport.hooks.state.resume && chunkedImport.hooks.state.resume.payload, 'chunked progress import should populate resume payload');
      if (chunkedImport.hooks.state.resume && chunkedImport.hooks.state.resume.payload) {
        assertEqual(chunkedImport.hooks.state.resume.id, saved.id, 'chunked progress import should use the offered resume id');
        assertEqual(chunkedImport.hooks.state.resume.code, saved.code, 'chunked progress import should reassemble and store the full progress code');
        assertEqual(JSON.stringify(chunkedImport.hooks.state.resume.payload), JSON.stringify(saved.payload), 'chunked progress import should import the same payload as the source code');
        assertEqual(Object.keys(chunkedImport.hooks.state.resume.ready || {}).length, 0, 'chunked progress import should not auto-ready any player');
        assertEqual(chunkedImport.hooks.state.resume.leaderKey || '', '', 'chunked progress import should not auto-select a resume leader');
        assertEqual((chunkedImport.hooks.state.resume.order || []).length, 0, 'chunked progress import should not add the progress sender to resume order');
        assertEqual(chunkedImport.hooks.getResumeGate().enabled, false, 'chunked progress import should still require hosted party authority before start');
        chunkedImport.hooks.state.localPlayerKey = 'abrams';
        chunkedImport.runtime.config.PokerLocalPlayerKey = 'abrams';
        chunkedImport.runtime.config.PokerLocalPlayerName = 'Abrams';
        chunkedImport.hooks.modules.TableRenderer.renderGame();
        assertButtonAffordance(chunkedImport.runtime, 'PokerResumeControls', { hidden: false }, 'chunked progress imported button state');
        assertButtonAffordance(chunkedImport.runtime, 'PokerResumeLeaderButton', { hidden: true, enabled: false }, 'chunked progress imported button state');
        assertButtonAffordance(chunkedImport.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'chunked progress imported button state');
        assertStartButtonGate(chunkedImport.runtime, 'HOST OR JOIN PARTY', false, false, 'chunked progress imported button state');
        const chunkedPartyStatus = panelText(findPanel(chunkedImport.runtime, 'PokerPartyStatusLabel'));
        const chunkedResumeStatus = panelText(findPanel(chunkedImport.runtime, 'PokerResumeStatusLabel'));
        assert(
          /host or join/i.test(chunkedPartyStatus + '\n' + chunkedResumeStatus) && /NEXT SYNCED HAND/.test(chunkedPartyStatus + '\n' + chunkedResumeStatus),
          `chunked progress imported button state should explain hosted party start requirement: ${chunkedPartyStatus || chunkedResumeStatus || '<empty>'}`,
        );
      }
      chunkedImport.hooks.processChatRecord({
        sender: 'Abrams',
        message: hooks.buildResumeLeaderCommand(saved.id),
        isSelf: true,
      });
      assertEqual(chunkedImport.hooks.state.game, null, 'chunked progress resume leader message should not start a game');
      assert(chunkedImport.hooks.state.resume.leaderKey !== 'abrams', 'chunked progress legacy resume leader message should not make Abrams the resume leader');
      assertEqual(chunkedImport.hooks.getResumeGate().enabled, false, 'chunked progress legacy resume leader message should not make the hosted progress startable');
      chunkedImport.hooks.processChatRecord({
        sender: 'Bebop',
        message: hooks.buildResumeReadyCommand(saved.id),
        isSelf: false,
      });
      assertEqual(chunkedImport.hooks.state.game, null, 'chunked progress resume ready message should not start a game');
      assert(chunkedImport.hooks.state.resume.leaderKey !== 'bebop', 'chunked progress legacy resume ready message should not make Bebop the resume leader');
      assertEqual(chunkedImport.hooks.getResumeGate().enabled, false, 'chunked progress legacy resume ready message should not make the hosted progress startable');
      const importedNoLeaderRuntime = createMenuRuntime();
      importedNoLeaderRuntime.hooks.importProgressSaveCode(saved.code);
      importedNoLeaderRuntime.hooks.state.localPlayerKey = 'abrams';
      importedNoLeaderRuntime.runtime.config.PokerLocalPlayerKey = 'abrams';
      importedNoLeaderRuntime.runtime.config.PokerLocalPlayerName = 'Abrams';
      importedNoLeaderRuntime.hooks.modules.TableRenderer.renderGame();
      assertButtonAffordance(importedNoLeaderRuntime.runtime, 'PokerResumeControls', { hidden: false }, 'imported progress no-leader button state');
      assertButtonAffordance(importedNoLeaderRuntime.runtime, 'PokerResumeLeaderButton', { hidden: false, enabled: true }, 'imported progress no-leader button state');
      assertButtonAffordance(importedNoLeaderRuntime.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'imported progress no-leader button state');
      assertStartButtonGate(importedNoLeaderRuntime.runtime, 'WAITING FOR RESUME LEADER', false, true, 'imported progress no-leader button state');
      assertEqual(importedNoLeaderRuntime.hooks.state.game, null, 'imported progress no-leader player list should not create a game');
      assertPanelVisible(importedNoLeaderRuntime.runtime, 'PokerPlayersList', 'imported progress no-leader player list');
      assertPlayerListRosterRow(importedNoLeaderRuntime.runtime, 'Abrams', saved.payload.bankrolls.abrams, 'WAITING', 'imported progress no-leader player list');
      assertPlayerListRosterRow(importedNoLeaderRuntime.runtime, 'Bebop', saved.payload.bankrolls.bebop, 'WAITING', 'imported progress no-leader player list');

      const staleResumeHostRuntime = createMenuRuntime();
      assertEqual(staleResumeHostRuntime.hooks.importProgressSaveCode(saved.code).ok, true, 'stale imported progress host setup should import saved progress');
      staleResumeHostRuntime.hooks.state.localPlayerKey = 'abrams';
      staleResumeHostRuntime.runtime.config.PokerLocalPlayerKey = 'abrams';
      staleResumeHostRuntime.runtime.config.PokerLocalPlayerName = 'Abrams';
      const staleResumeHostChatTarget = findPanel(staleResumeHostRuntime.runtime, 'ChatTargetLabel');
      if (staleResumeHostChatTarget) staleResumeHostChatTarget.text = 'TEAM';
      staleResumeHostRuntime.hooks.modules.TableRenderer.renderGame();
      const staleResumeHostInput = findPanel(staleResumeHostRuntime.runtime, 'PokerProgressCodeInput');
      assert(staleResumeHostInput, 'stale imported progress host setup should have a visible progress code input');
      if (staleResumeHostInput) staleResumeHostInput.text = saved.code;
      assert(
        panelText(staleResumeHostInput).indexOf('POKERPROG1-') === 0,
        `stale imported progress host setup should seed the pasted progress code input: ${panelText(staleResumeHostInput) || '<empty>'}`,
      );
      assertEqual(persistedProgressCode(staleResumeHostRuntime.runtime), saved.code, 'stale imported progress host setup should persist the imported progress code');
      assertButtonAffordance(staleResumeHostRuntime.runtime, 'PokerHostPartyButton', { hidden: false, enabled: true }, 'stale imported progress host button state');
      assertPlayerListRosterRow(staleResumeHostRuntime.runtime, 'Abrams', saved.payload.bankrolls.abrams, 'WAITING', 'stale imported progress host setup player list');
      assertPlayerListRosterRow(staleResumeHostRuntime.runtime, 'Bebop', saved.payload.bankrolls.bebop, 'WAITING', 'stale imported progress host setup player list');
      const staleResumeHostStart = staleResumeHostRuntime.runtime.dispatches.length;
      const staleResumeHostButton = findPanel(staleResumeHostRuntime.runtime, 'PokerHostPartyButton');
      const staleResumeHostHandler = staleResumeHostButton && typeof staleResumeHostButton.onactivate === 'function'
        ? staleResumeHostButton.onactivate
        : staleResumeHostRuntime.runtime.sandbox.PokerEscapeMenuHostParty;
      assertEqual(typeof staleResumeHostHandler, 'function', 'stale imported progress HOST should expose a button or VM handler seam');
      const staleResumeHostTransferChecksum = progressChecksumFromCode(saved.code);
      const staleResumeHostTransferChunks = splitProgressCodeForChat(saved.code, 3);
      assert(staleResumeHostTransferChunks.length >= 2, 'stale imported progress HOST transfer fixture should split into multiple chunks');
      staleResumeHostRuntime.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressOfferMessage(saved.id, staleResumeHostTransferChecksum, staleResumeHostTransferChunks.length),
        isSelf: false,
      });
      staleResumeHostRuntime.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressChunkMessage(saved.id, staleResumeHostTransferChecksum, 1, staleResumeHostTransferChunks.length, staleResumeHostTransferChunks[0]),
        isSelf: false,
      });
      assertGreaterThan(progressTransferCount(staleResumeHostRuntime.hooks), 0, 'stale imported progress HOST setup should have a pending progress transfer before hosting');
      if (typeof staleResumeHostHandler === 'function') staleResumeHostHandler();
      drainScheduledCallbacks(staleResumeHostRuntime.runtime, 256);
      const staleResumeHostMessages = submittedChatMessages(staleResumeHostRuntime.runtime, staleResumeHostStart);
      const staleResumeHostCommands = staleResumeHostMessages.filter((message) => message.indexOf('[party leader] poker party ') === 0);
      assert(staleResumeHostCommands.length > 0, `stale imported progress HOST should submit a party leader command: ${staleResumeHostMessages.join('|') || '<none>'}`);
      assertResumeCleared(staleResumeHostRuntime, 'stale imported progress HOST');
      assertProgressTransfersCleared(staleResumeHostRuntime, 'stale imported progress HOST');
      staleResumeHostRuntime.hooks.modules.TableRenderer.renderGame();
      assertImportedProgressEscapeCleared(staleResumeHostRuntime, 'stale imported progress HOST');
      assertPlayerListOmitsImportedResumeRoster(staleResumeHostRuntime.runtime, saved.payload, 'stale imported progress HOST player list');
      for (let i = 1; i < staleResumeHostTransferChunks.length; i += 1) {
        staleResumeHostRuntime.hooks.processChatRecord({
          sender: 'Seven',
          message: buildProgressChunkMessage(saved.id, staleResumeHostTransferChecksum, i + 1, staleResumeHostTransferChunks.length, staleResumeHostTransferChunks[i]),
          isSelf: false,
        });
      }
      assertResumeCleared(staleResumeHostRuntime, 'stale imported progress HOST after late stale chunks');
      staleResumeHostRuntime.hooks.modules.TableRenderer.renderGame();
      assertImportedProgressEscapeCleared(staleResumeHostRuntime, 'stale imported progress HOST after late stale chunks');
      assertPlayerListOmitsImportedResumeRoster(staleResumeHostRuntime.runtime, saved.payload, 'stale imported progress HOST player list');


      const staleResumePartyRuntime = createMenuRuntime();
      assertEqual(staleResumePartyRuntime.hooks.importProgressSaveCode(saved.code).ok, true, 'stale imported progress party join setup should import saved progress');
      staleResumePartyRuntime.hooks.processChatRecord({ sender: 'Calico', message: '[party leader] poker party pstale-import', isSelf: false });
      staleResumePartyRuntime.hooks.modules.TableRenderer.renderGame();
      const staleResumeJoinInput = findPanel(staleResumePartyRuntime.runtime, 'PokerProgressCodeInput');
      assert(staleResumeJoinInput, 'stale imported progress party join setup should have a visible progress code input');
      if (staleResumeJoinInput) staleResumeJoinInput.text = saved.code;
      assert(
        panelText(staleResumeJoinInput).indexOf('POKERPROG1-') === 0,
        `stale imported progress party join setup should seed the pasted progress code input: ${panelText(staleResumeJoinInput) || '<empty>'}`,
      );
      assertEqual(staleResumePartyRuntime.hooks.state.game, null, 'stale imported progress party join setup should not create a game');
      assertButtonAffordance(staleResumePartyRuntime.runtime, 'PokerPartyControls', { hidden: false }, 'stale imported progress incoming party leader button state');
      assertButtonAffordance(staleResumePartyRuntime.runtime, 'PokerJoinPartyButton', { hidden: false, enabled: true }, 'stale imported progress incoming party leader button state');
      assertPlayerListRosterRow(staleResumePartyRuntime.runtime, 'Abrams', saved.payload.bankrolls.abrams, 'WAITING', 'stale imported progress incoming party leader player list');
      assertPlayerListRosterRow(staleResumePartyRuntime.runtime, 'Bebop', saved.payload.bankrolls.bebop, 'WAITING', 'stale imported progress incoming party leader player list');
      assertEqual(persistedProgressCode(staleResumePartyRuntime.runtime), saved.code, 'stale imported progress party join setup should persist the imported progress code');
      const staleResumeJoinChatTarget = findPanel(staleResumePartyRuntime.runtime, 'ChatTargetLabel');
      if (staleResumeJoinChatTarget) staleResumeJoinChatTarget.text = 'TEAM';
      const staleResumeJoinStart = staleResumePartyRuntime.runtime.dispatches.length;
      const staleResumeJoinButton = findPanel(staleResumePartyRuntime.runtime, 'PokerJoinPartyButton');
      const staleResumeJoinHandler = staleResumeJoinButton && typeof staleResumeJoinButton.onactivate === 'function'
        ? staleResumeJoinButton.onactivate
        : staleResumePartyRuntime.runtime.sandbox.PokerEscapeMenuJoinParty;
      assertEqual(typeof staleResumeJoinHandler, 'function', 'stale imported progress JOIN should expose a button or VM handler seam');
      if (typeof staleResumeJoinHandler === 'function') staleResumeJoinHandler();
      drainScheduledCallbacks(staleResumePartyRuntime.runtime, 256);
      const staleResumeJoinMessages = submittedChatMessages(staleResumePartyRuntime.runtime, staleResumeJoinStart);
      assert(
        staleResumeJoinMessages.includes('[party join] poker party pstale-import'),
        `stale imported progress JOIN should submit the current party join command: ${staleResumeJoinMessages.join('|') || '<none>'}`,
      );
      assertResumeCleared(staleResumePartyRuntime, 'stale imported progress JOIN');
      staleResumePartyRuntime.hooks.modules.TableRenderer.renderGame();
      assertImportedProgressEscapeCleared(staleResumePartyRuntime, 'stale imported progress JOIN');
      assertPlayerListOmitsImportedResumeRoster(staleResumePartyRuntime.runtime, saved.payload, 'stale imported progress JOIN player list');


      importedNoLeaderRuntime.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeLeaderCommand(saved.id), isSelf: true });
      importedNoLeaderRuntime.hooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(importedNoLeaderRuntime.runtime, 'WAITING FOR RESUME READY', false, false, 'resume leader insufficient-ready button state');
      assertButtonAffordance(importedNoLeaderRuntime.runtime, 'PokerResumeLeaderButton', { hidden: true, enabled: false }, 'resume leader insufficient-ready button state');
      assertButtonAffordance(importedNoLeaderRuntime.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'resume leader insufficient-ready button state');
      assert(panelText(findPanel(importedNoLeaderRuntime.runtime, 'PokerResumeStatusLabel')).includes('Leader: Abrams'), 'resume leader insufficient-ready button state should name the resume leader');
      assertEqual(importedNoLeaderRuntime.hooks.state.game, null, 'resume leader insufficient-ready player list should not create a game');
      assertPlayerListRosterRow(importedNoLeaderRuntime.runtime, 'Abrams', saved.payload.bankrolls.abrams, 'LEADER', 'resume leader insufficient-ready player list');
      assertPlayerListRosterRow(importedNoLeaderRuntime.runtime, 'Bebop', saved.payload.bankrolls.bebop, 'WAITING', 'resume leader insufficient-ready player list');


      importedNoLeaderRuntime.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeReadyCommand(saved.id), isSelf: false });
      importedNoLeaderRuntime.hooks.state.localPlayerKey = 'abrams';
      importedNoLeaderRuntime.runtime.config.PokerLocalPlayerKey = 'abrams';
      importedNoLeaderRuntime.runtime.config.PokerLocalPlayerName = 'Abrams';
      importedNoLeaderRuntime.hooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(importedNoLeaderRuntime.runtime, 'START RESUME', true, false, 'resume ready quorum leader button state');
      assertButtonAffordance(importedNoLeaderRuntime.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'resume ready quorum leader button state');
      assert(panelText(findPanel(importedNoLeaderRuntime.runtime, 'PokerResumeStatusLabel')).includes('Ready: 2/2'), 'resume ready quorum leader button state should show full ready quorum');
      assertEqual(importedNoLeaderRuntime.hooks.state.game, null, 'resume ready quorum leader player list should not create a game');
      assertPlayerListRosterRow(importedNoLeaderRuntime.runtime, 'Abrams', saved.payload.bankrolls.abrams, 'LEADER', 'resume ready quorum leader player list');
      assertPlayerListRosterRow(importedNoLeaderRuntime.runtime, 'Bebop', saved.payload.bankrolls.bebop, 'READY', 'resume ready quorum leader player list');


      importedNoLeaderRuntime.hooks.state.localPlayerKey = 'bebop';
      importedNoLeaderRuntime.runtime.config.PokerLocalPlayerKey = 'bebop';
      importedNoLeaderRuntime.runtime.config.PokerLocalPlayerName = 'Bebop';
      importedNoLeaderRuntime.hooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(importedNoLeaderRuntime.runtime, 'WAITING FOR RESUME LEADER', false, true, 'resume ready quorum non-leader button state');
      assertButtonAffordance(importedNoLeaderRuntime.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'resume ready quorum non-leader button state');
      const nonLeaderResumeStatus = panelText(findPanel(importedNoLeaderRuntime.runtime, 'PokerResumeStatusLabel'));
      const nonLeaderPartyStatus = panelText(findPanel(importedNoLeaderRuntime.runtime, 'PokerPartyStatusLabel'));
      assert(
        nonLeaderResumeStatus.includes('Leader: Abrams') || nonLeaderPartyStatus.includes('Only Abrams can start this resume.'),
        `resume ready quorum non-leader button state should name the selected leader: ${nonLeaderResumeStatus || nonLeaderPartyStatus || '<empty>'}`,
      );

    }
    for (const resumeImportCase of [
      {
        name: 'id-only resume leader chat without local import',
        record: { sender: 'JDBeast', message: '[resume leader] poker resume rmissing', isSelf: false },
      },
      {
        name: 'id-only resume ready chat without local import',
        record: { sender: 'JDBeast', message: '[resume ready] poker resume rmissing', isSelf: false },
      },
    ]) {
      const missingImportRuntime = createMenuRuntime();
      const statusBeforeMissingImport = panelText(findPanel(missingImportRuntime.runtime, 'PokerStatusLabel'));
      const messagesBeforeMissingImport = missingImportRuntime.runtime.messages.length;
      missingImportRuntime.hooks.processChatRecord(resumeImportCase.record);
      assertEqual(missingImportRuntime.hooks.state.game, null, `${resumeImportCase.name} should not create a game`);
      assert(
        !missingImportRuntime.hooks.state.resume || !missingImportRuntime.hooks.state.resume.payload,
        `${resumeImportCase.name} should not create resume payload from id-only chat`,
      );
      assertDiagnosticContains(
        missingImportRuntime.runtime,
        messagesBeforeMissingImport,
        statusBeforeMissingImport,
        'Import matching progress',
        resumeImportCase.name,
      );
    }

    const invalidRuntime = createMenuRuntime();
    if (invalidRuntime.hooks) {
      const beforeGame = invalidRuntime.hooks.state.game;
      const invalid = invalidRuntime.hooks.importProgressSaveCode('not-a-progress-code');
      assertEqual(invalid.ok, false, 'invalid progress code should fail import');
      assertEqual(invalidRuntime.hooks.state.game, beforeGame, 'invalid progress import should leave State.game unchanged');
    }

    const activeImportRuntime = createGameRuntime(['Abrams', 'Bebop'], 'active-import');
    if (activeImportRuntime.hooks && activeImportRuntime.game && saved.code) {
      activeImportRuntime.hooks.state.resume = { id: 'sentinel' };
      const activeImport = activeImportRuntime.hooks.importProgressSaveCode(saved.code);
      assertEqual(activeImport.ok, false, 'active hand progress import should fail');
      assertEqual(activeImport.status, 'Finish the current hand before importing progress.', 'active hand progress import should return the exact status');
      assertEqual(activeImportRuntime.hooks.state.resume.id, 'sentinel', 'active hand progress import should leave State.resume unchanged');
    }

    if (saved.code && saved.payload) {
      const nonLeaderResume = createMenuRuntime();
      nonLeaderResume.hooks.importProgressSaveCode(saved.code);
      nonLeaderResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeLeaderCommand(saved.id) });
      nonLeaderResume.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeReadyCommand(saved.id) });
      const nonLeaderStatusBefore = panelText(findPanel(nonLeaderResume.runtime, 'PokerStatusLabel'));
      const nonLeaderMessagesBefore = nonLeaderResume.runtime.messages.length;
      nonLeaderResume.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeStartCommand(saved.id, 'abrams', saved.payload.roster, saved.payload.nextHandNumber, 'sbad') });
      assertEqual(nonLeaderResume.hooks.state.game, null, 'non-selected resume sender should not create a game');
      assertDiagnosticContains(nonLeaderResume.runtime, nonLeaderMessagesBefore, nonLeaderStatusBefore, 'reject-non-leader-resume', 'non-selected resume start sender');

      const mismatchResume = createMenuRuntime();
      mismatchResume.hooks.importProgressSaveCode(saved.code);
      mismatchResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeLeaderCommand(saved.id) });
      mismatchResume.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeReadyCommand(saved.id) });
      const mismatchStatusBefore = panelText(findPanel(mismatchResume.runtime, 'PokerStatusLabel'));
      const mismatchMessagesBefore = mismatchResume.runtime.messages.length;
      mismatchResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeStartCommand(saved.id, 'bebop', saved.payload.roster, saved.payload.nextHandNumber, 'smismatch') });
      assertEqual(mismatchResume.hooks.state.game, null, 'mismatched resume leader token should not create a game');
      assertDiagnosticContains(mismatchResume.runtime, mismatchMessagesBefore, mismatchStatusBefore, 'reject-resume-leader-mismatch', 'mismatched resume leader token');

      const wrongIdResume = createMenuRuntime();
      wrongIdResume.hooks.importProgressSaveCode(saved.code);
      wrongIdResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeLeaderCommand(saved.id) });
      wrongIdResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeStartCommand('rwrong', 'abrams', saved.payload.roster, saved.payload.nextHandNumber, 'swrong') });
      assertEqual(wrongIdResume.hooks.state.game, null, 'resume start with a mismatched id should not create a game');
    }

    const bustedDealerRuntime = createMenuRuntime();
    if (bustedDealerRuntime.hooks) {
      bustedDealerRuntime.hooks.state.game = {
        active: false,
        finished: true,
        handNumber: 4,
        dealerIndex: 0,
        pot: 0,
        currentBet: 0,
        phase: 'finished',
        community: [],
        log: [],
        announcement: null,
        players: [
          { key: 'abrams', name: 'Abrams', stack: 0, bet: 0, committed: 0, cards: [], folded: false, acted: false },
          { key: 'bebop', name: 'Bebop', stack: 5000, bet: 0, committed: 0, cards: [], folded: false, acted: false },
          { key: 'calico', name: 'Calico', stack: 6000, bet: 0, committed: 0, cards: [], folded: false, acted: false },
        ],
      };
      const bustedSave = bustedDealerRuntime.hooks.buildProgressSaveCode();
      assertEqual(bustedSave.ok, true, 'busted dealer finished table should still export when two players have chips');
      if (bustedSave.ok) {
        assertEqual(bustedDealerRuntime.hooks.resolveResumeNextDealerKey(bustedSave.payload), 'bebop', 'busted saved dealer should rotate to the next positive-bankroll player');
        const bustedResume = createMenuRuntime();
        bustedResume.hooks.importProgressSaveCode(bustedSave.code);
        bustedResume.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeLeaderCommand(bustedSave.id) });
        bustedResume.hooks.processChatRecord({ sender: 'Calico', message: hooks.buildResumeReadyCommand(bustedSave.id) });
        bustedResume.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeStartCommand(bustedSave.id, 'bebop', bustedSave.payload.roster, bustedSave.payload.nextHandNumber, 'sbusted') });
        assert(bustedResume.hooks.state.game, 'busted dealer resume should create a game');
        if (bustedResume.hooks.state.game) {
          assertEqual(bustedResume.hooks.state.game.players[bustedResume.hooks.state.game.dealerIndex].key, 'bebop', 'busted dealer resume should make the next positive-bankroll player dealer');
        }
      }
    }
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

    assertSameSyncedGame(unknownRaiseGame, knownRaiseGame, 'unknown non-self action from a known synced current actor should resolve to that actor');
    assertMoneySnapshot(
      moneySnapshot(unknownRaiseGame),
      moneySnapshot(knownRaiseGame),
      'unknown non-self synced current-actor raise should mutate money exactly like the named actor raise',
    );
  }

  const unknownFlopCheckRuntime = createSyncedPartyRuntime('JDBeast', 'sunknown-flop-check', [
    { key: 'jdbeast', name: 'JDBeast' },
    { key: 'hantu raya', name: 'Hantu Raya' },
  ], 1);
  if (unknownFlopCheckRuntime.hooks && unknownFlopCheckRuntime.game) {
    const game = unknownFlopCheckRuntime.game;
    assertEqual(currentPlayer(game).name, 'JDBeast', 'flop unknown check setup should start with the small blind acting preflop');
    unknownFlopCheckRuntime.hooks.processChatRecord({ sender: 'JDBeast', message: 'call', isSelf: true });
    assertEqual(currentPlayer(game).name, 'Hantu Raya', 'after small blind call, big blind should act preflop');
    unknownFlopCheckRuntime.hooks.processChatRecord({ sender: 'Hantu Raya', message: 'check', isSelf: false });
    assertEqual(game.phase, 'flop', 'big blind preflop check should advance to flop');
    assertEqual(currentPlayer(game).name, 'Hantu Raya', 'heads-up postflop first action remains with the big blind');
    unknownFlopCheckRuntime.hooks.processChatRecord({ sender: '<unknown>', message: 'check', isSelf: false });
    assertEqual(currentPlayer(game).name, 'JDBeast', 'unknown flop check from known synced current actor should advance turn to the other player');
  }

  const shortRosterNameRuntime = createMenuRuntime();
  if (shortRosterNameRuntime.hooks && hasPartySyncHooks(shortRosterNameRuntime.hooks, 'short roster name runtime')) {
    const shortHooks = shortRosterNameRuntime.hooks;
    shortHooks.processChatRecord({ sender: 'JDBeast', message: '[party leader] poker party pshort', isSelf: true });
    shortHooks.processChatRecord({ sender: 'Hantu Raya', message: '[party join] poker party pshort', isSelf: false });
    shortHooks.processChatRecord({ sender: 'JDBeast', message: 'poker start sshort-roster-name hand 1 roster jdbeast~JDBeast|hantu%20raya~H', isSelf: true });
    const shortNameGame = shortHooks.state.game;
    assert(shortNameGame, 'synced start with a shortened roster display name should create a game');
    if (shortNameGame) {
      const shortNameHantu = shortNameGame.players.find((player) => player.key === 'hantu raya');
      assert(shortNameHantu, 'synced start should include the Hantu Raya party member by key');
      if (shortNameHantu) assertEqual(shortNameHantu.name, 'Hantu Raya', 'synced start should prefer the known party member name over the shortened roster display name');
      assertEqual(currentPlayer(shortNameGame).name, 'JDBeast', 'short roster name setup should start with JDBeast acting preflop');
      shortHooks.processChatRecord({ sender: 'JDBeast', message: 'call', isSelf: true });
      assertEqual(currentPlayer(shortNameGame).name, 'Hantu Raya', 'short roster name setup should advance to the canonical Hantu Raya current actor');
      shortHooks.processChatRecord({ sender: '<unknown>', message: 'check', isSelf: false });
      assertEqual(shortNameGame.phase, 'flop', 'unknown action from canonical Hantu Raya current actor should resolve and apply');
    }
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
    const unknownHints = findDescendantsWithClass(findPanel(unknownLocalSynced.runtime, 'PokerActionButtons'), 'PokerActionHint', []);
    assertEqual(unknownHints.length, 1, 'unknown local synced action render should create exactly one action hint');
  }

  const snapshotStartRuntime = createMenuRuntime();
  if (snapshotStartRuntime.hooks && snapshotStartRuntime.hooks.modules && snapshotStartRuntime.hooks.modules.StartSync) {
    const snapshotStartCommand = snapshotStartRuntime.hooks.buildSynchronizedStartCommand('ssnapshot-open', syncedRoster, 1);
    snapshotStartRuntime.hooks.modules.StartSync.openMenu();
    snapshotStartRuntime.hooks.handleReadyEvent(JSON.stringify({
      event: 'PokerChatMessage',
      action: 'snapshot',
      seq: 1,
      messages: [{ seq: 1, sender: 'Abrams', message: snapshotStartCommand, isSelf: true }],
    }));
    assert(snapshotStartRuntime.hooks.state.game && snapshotStartRuntime.hooks.state.game.active, 'snapshotted start while menu is open should create an active game');
    assertPanelVisible(snapshotStartRuntime.runtime, 'PokerTableSurface', 'snapshotted start while menu is open');
  }

  const stableRenderRuntime = createSyncedPartyRuntime('Abrams', 'sstable-render', syncedRoster, 1);
  if (stableRenderRuntime.hooks && stableRenderRuntime.game) {
    stableRenderRuntime.hooks.processChatRecord({ sender: 'Abrams', message: 'call', isSelf: true });
    stableRenderRuntime.hooks.processChatRecord({ sender: 'Bebop', message: 'check' });
    const community = findPanel(stableRenderRuntime.runtime, 'PokerCommunityCards');
    const beforeCards = findDescendantsWithClass(community, 'PokerCard', []);
    stableRenderRuntime.hooks.modules.TableRenderer.renderGame();
    const afterCards = findDescendantsWithClass(community, 'PokerCard', []);
    assert(beforeCards[0] && afterCards[0] && beforeCards[0] === afterCards[0], 'stable table renderer should reuse the first community card panel across repeated renders');
    const waitingHints = findDescendantsWithClass(findPanel(stableRenderRuntime.runtime, 'PokerActionButtons'), 'PokerActionHint', []);
    assertEqual(waitingHints.length, 1, 'waiting-for-other-player action render should create exactly one action hint');
  }

  const actionReuseRuntime = createGameRuntime(['Abrams', 'Bebop'], 'action-cache');
  if (actionReuseRuntime.hooks && actionReuseRuntime.game) {
    const actionActor = currentPlayer(actionReuseRuntime.game);
    actionReuseRuntime.runtime.config.PokerLocalPlayerName = actionActor.name;
    actionReuseRuntime.hooks.modules.TableRenderer.renderGame();
    const firstActionButton = actionButtonPanels(actionReuseRuntime.runtime)[0];
    assert(firstActionButton, 'active local actor action cache should render an action button');

    actionReuseRuntime.hooks.modules.TableRenderer.renderGame();
    assert(actionButtonPanels(actionReuseRuntime.runtime)[0] === firstActionButton, 'active local actor action cache should reuse the first action button across unchanged renders');

    actionReuseRuntime.hooks.processChatRecord({ sender: actionActor.name, message: 'call', isSelf: true });
    actionReuseRuntime.hooks.modules.TableRenderer.renderGame();
    const changedActionButtons = actionButtonPanels(actionReuseRuntime.runtime);
    assert(
      firstActionButton.deleted || changedActionButtons.indexOf(firstActionButton) === -1,
      'active local actor action cache should remove stale action buttons when command/enabled/read-only state changes',
    );
  }

  const playerReuseRuntime = createGameRuntime(['Abrams', 'Bebop'], 'player-row-cache');
  if (playerReuseRuntime.hooks && playerReuseRuntime.game) {
    playerReuseRuntime.hooks.modules.TableRenderer.renderGame();
    const firstPlayerRow = playerListRows(playerReuseRuntime.runtime)[0];
    const firstPlayerCard = firstPokerCard(firstPlayerRow);
    playerReuseRuntime.hooks.modules.TableRenderer.renderGame();
    assert(playerListRows(playerReuseRuntime.runtime)[0] === firstPlayerRow, 'stable player renderer should reuse the first player row across unchanged renders');
    assert(firstPokerCard(playerListRows(playerReuseRuntime.runtime)[0]) === firstPlayerCard, 'stable player renderer should reuse the first player card across unchanged renders');
  }

  const tableSeatReuseRuntime = createGameRuntime(['Abrams', 'Bebop'], 'table-seat-cache');
  if (tableSeatReuseRuntime.hooks && tableSeatReuseRuntime.game) {
    tableSeatReuseRuntime.hooks.modules.TableRenderer.renderGame();
    const firstTableSeat = tableSeatRows(tableSeatReuseRuntime.runtime)[0];
    const firstTableSeatCard = firstPokerCard(firstTableSeat);
    tableSeatReuseRuntime.hooks.modules.TableRenderer.renderGame();
    assert(tableSeatRows(tableSeatReuseRuntime.runtime)[0] === firstTableSeat, 'stable table-seat renderer should reuse the first table seat across unchanged renders');
    assert(firstPokerCard(tableSeatRows(tableSeatReuseRuntime.runtime)[0]) === firstTableSeatCard, 'stable table-seat renderer should reuse the first table-seat card across unchanged renders');
  }

  const logReuseRuntime = createGameRuntime(['Abrams', 'Bebop'], 'log-row-cache');
  if (logReuseRuntime.hooks && logReuseRuntime.game) {
    logReuseRuntime.game.log = [
      'cache line 1',
      'cache line 2',
      'cache line 3',
      'cache line 4',
      'cache line 5',
      'cache line 6',
      'cache line 7',
      'cache line 8',
      'cache line 9',
      'cache line 10',
      'cache line 11',
      'cache line 12',
    ];
    logReuseRuntime.hooks.modules.TableRenderer.renderGame();
    const firstLogLine = pokerLogLines(logReuseRuntime.runtime)[0];
    const capturedLogLines = pokerLogLines(logReuseRuntime.runtime).slice();
    logReuseRuntime.hooks.modules.TableRenderer.renderGame();
    assert(pokerLogLines(logReuseRuntime.runtime)[0] === firstLogLine, 'stable log renderer should reuse the first log row across unchanged renders');

    logReuseRuntime.game.log.push('cache line 13');
    logReuseRuntime.hooks.modules.TableRenderer.renderGame();
    const appendedLogLines = pokerLogLines(logReuseRuntime.runtime);
    const appendedLogText = collectPanelTexts(findPanel(logReuseRuntime.runtime, 'PokerGameLog'), []).join('|');
    assertEqual(appendedLogLines.length, 12, `stable log renderer should keep the visible log capped at twelve rows: ${appendedLogText || '<empty>'}`);
    assert(appendedLogText.includes('cache line 13'), `stable log renderer should show the newest appended entry: ${appendedLogText || '<empty>'}`);
    assert(
      capturedLogLines.some((line) => appendedLogLines.indexOf(line) !== -1),
      'stable log renderer should reuse at least one existing log row after appending a new entry',
    );
  }

  const pendingRuntime = createSyncedPartyRuntime('Abrams', 'spending-self', syncedRoster, 1);
  if (pendingRuntime.hooks && pendingRuntime.game) {
    const pendingGame = pendingRuntime.game;
    pendingRuntime.hooks.state.localPlayerKey = '';
    delete pendingRuntime.runtime.config.PokerLocalPlayerName;
    pendingRuntime.hooks.modules.PendingSelfAction.record('call', pendingGame.players[0], pendingGame);
    pendingRuntime.hooks.processChatRecord({ sender: '<unknown>', message: 'call', isSelf: true });
    assertEqual(pendingGame.currentIndex, 1, 'fresh pending self call should resolve unknown self sender and advance the game');
    const duplicateState = JSON.stringify({ currentIndex: pendingGame.currentIndex, pot: pendingGame.pot, phase: pendingGame.phase });
    pendingRuntime.hooks.processChatRecord({ sender: '<unknown>', message: 'call', isSelf: true });
    assertEqual(JSON.stringify({ currentIndex: pendingGame.currentIndex, pot: pendingGame.pot, phase: pendingGame.phase }), duplicateState, 'duplicate self echo after pending clear should not advance the game again');
  }

  const stalePendingRuntime = createSyncedPartyRuntime('Abrams', 'sstale-pending', syncedRoster, 1);
  if (stalePendingRuntime.hooks && stalePendingRuntime.game) {
    const staleGame = stalePendingRuntime.game;
    stalePendingRuntime.hooks.state.localPlayerKey = '';
    delete stalePendingRuntime.runtime.config.PokerLocalPlayerName;
    stalePendingRuntime.hooks.modules.PendingSelfAction.record('call', staleGame.players[0], staleGame);
    staleGame.currentIndex = 1;
    const before = JSON.stringify({ currentIndex: staleGame.currentIndex, pot: staleGame.pot, phase: staleGame.phase });
    stalePendingRuntime.hooks.processChatRecord({ sender: '<unknown>', message: 'call', isSelf: true });
    assertEqual(JSON.stringify({ currentIndex: staleGame.currentIndex, pot: staleGame.pot, phase: staleGame.phase }), before, 'stale pending self action after currentIndex changes should not resolve');
  }

  const blockedPendingRuntime = createSyncedPartyRuntime('Abrams', 'sblocked-pending', syncedRoster, 1);
  if (blockedPendingRuntime.hooks && blockedPendingRuntime.game) {
    const blockedGame = blockedPendingRuntime.game;
    blockedPendingRuntime.hooks.state.localPlayerKey = '';
    delete blockedPendingRuntime.runtime.config.PokerLocalPlayerName;
    blockedPendingRuntime.hooks.modules.PendingSelfAction.record('call', blockedGame.players[0], blockedGame);
    blockedPendingRuntime.hooks.processChatRecord({ sender: '<unknown>', message: 'raise $400', isSelf: true });
    assertEqual(blockedGame.currentIndex, 0, 'wrong pending self action message should not resolve');
    const leaderBeforePendingParty = blockedPendingRuntime.hooks.state.party.leaderKey || '';
    blockedPendingRuntime.hooks.processChatRecord({ sender: '<unknown>', message: '[party leader] poker party pblocked', isSelf: true });
    assertEqual(blockedPendingRuntime.hooks.state.party.leaderKey || '', leaderBeforePendingParty, 'pending self action should not authorize party leader rows');
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
    observerRuntime.hooks.state.party = {
      id: 'pobserver',
      mode: 'none',
      leaderKey: 'abrams',
      leaderName: 'Abrams',
      members: {
        abrams: { key: 'abrams', name: 'Abrams' },
        jdbeast: { key: 'jdbeast', name: 'JDBeast' },
      },
      order: ['abrams', 'jdbeast'],
    };
    observerRuntime.hooks.state.localPlayerKey = 'calico';
    observerRuntime.runtime.config.PokerLocalPlayerKey = 'calico';
    observerRuntime.runtime.config.PokerLocalPlayerName = 'Calico';
    observerRuntime.hooks.modules.TableRenderer.renderGame();
    assertButtonAffordance(observerRuntime.runtime, 'PokerPartyControls', { hidden: false }, 'active observer late-join button state');
    assertButtonAffordance(observerRuntime.runtime, 'PokerJoinPartyButton', { hidden: false, enabled: true }, 'active observer late-join button state');
    assertButtonAffordance(observerRuntime.runtime, 'PokerStartButton', { hidden: true, enabled: false }, 'active observer late-join button state');
    assertButtonAffordance(observerRuntime.runtime, 'PokerReadyChatButton', { hidden: true, enabled: false }, 'active observer late-join button state');
    assertButtonAffordance(observerRuntime.runtime, 'PokerProgressControls', { hidden: true }, 'active observer late-join button state');
    assertButtonAffordance(observerRuntime.runtime, 'PokerResumeControls', { hidden: true }, 'active observer late-join button state');
    assertReadOnlyActionButtons(observerRuntime.runtime, ['CALL $200', 'RAISE TO $600', 'RAISE TO $900', 'FOLD'], null, 'active observer late-join button state');

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

  const allInCallFixture = createEngineFixture({});
  if (allInCallFixture.hooks && allInCallFixture.game) {
    const allInGame = allInCallFixture.game;
    const actor = currentPlayer(allInGame);
    actor.stack = 50;
    const beforeAllInCall = moneySnapshot(allInGame);
    allInCallFixture.hooks.processChatRecord({ sender: actor.name, message: 'call' });
    assertEqual(actor.stack, 0, 'all-in call fixture should allow a short stack to call with all remaining chips');
    assertEqual(actor.committed, beforeAllInCall.players[allInGame.players.indexOf(actor)].committed + 50, 'all-in call fixture should add the short stack committed chips');
    assertEqual(allInGame.pot, beforeAllInCall.pot + 50, 'all-in call fixture should move the all-in call into the pot');
  }

  const phaseAdvanceFixture = createEngineFixture({});
  if (phaseAdvanceFixture.hooks && phaseAdvanceFixture.game) {
    const phaseGame = phaseAdvanceFixture.game;
    phaseAdvanceFixture.hooks.processChatRecord({ sender: currentPlayer(phaseGame).name, message: 'call' });
    phaseAdvanceFixture.hooks.processChatRecord({ sender: currentPlayer(phaseGame).name, message: 'call' });
    phaseAdvanceFixture.hooks.processChatRecord({ sender: currentPlayer(phaseGame).name, message: 'check' });
    assertEqual(phaseGame.phase, 'flop', 'phase advancement fixture should advance from preflop to flop after the round settles');
    assertEqual(phaseGame.currentBet, 0, 'phase advancement fixture should reset current bet on the new street');
    assertEqual(phaseGame.minRaise, phaseGame.bigBlindAmount, 'phase advancement fixture should reset minimum raise to the big blind on the new street');
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
  {
    const missingSeedRuntime = createSyncedJoinedPartyRuntime('Bebop', 'sunknown-match-end-missing-seed', syncedRoster, 1, 'punknown-match-end-missing-seed');
    if (missingSeedRuntime.hooks && missingSeedRuntime.game) {
      const missingSeedBefore = missingSeedRuntime.hooks.getStateSnapshot();
      missingSeedRuntime.hooks.processChatRecord({
        sender: '<unknown>',
        message: '[match end] poker party punknown-match-end-missing-seed hand 1',
        isSelf: false,
      });
      const missingSeedAfter = missingSeedRuntime.hooks.getStateSnapshot();
      assertEqual(
        JSON.stringify(missingSeedAfter.game),
        JSON.stringify(missingSeedBefore.game),
        'unknown match-end without a seed should not authenticate or clear the current game',
      );
      assertEqual(
        missingSeedAfter.party.id,
        missingSeedBefore.party.id,
        'unknown match-end without a seed should preserve the current party',
      );
    }
    const missingHandRuntime = createSyncedJoinedPartyRuntime('Bebop', 'sunknown-match-end-missing-hand', syncedRoster, 1, 'punknown-match-end-missing-hand');
    if (missingHandRuntime.hooks && missingHandRuntime.game) {
      const missingHandBefore = missingHandRuntime.hooks.getStateSnapshot();
      missingHandRuntime.hooks.processChatRecord({
        sender: '<unknown>',
        message: '[match end] poker party punknown-match-end-missing-hand seed sunknown-match-end-missing-hand',
        isSelf: false,
      });
      const missingHandAfter = missingHandRuntime.hooks.getStateSnapshot();
      assertEqual(
        JSON.stringify(missingHandAfter.game),
        JSON.stringify(missingHandBefore.game),
        'unknown match-end without a hand number should not authenticate or clear the current game',
      );
      assertEqual(
        missingHandAfter.party.id,
        missingHandBefore.party.id,
        'unknown match-end without a hand number should preserve the current party',
      );
    }
  }

  {
    const nonLeaderRuntime = createSyncedJoinedPartyRuntime('Abrams', 'sknown-nonleader-match-end', syncedRoster, 1, 'pknown-nonleader-match-end');
    if (nonLeaderRuntime.hooks && nonLeaderRuntime.game) {
      const before = nonLeaderRuntime.hooks.getStateSnapshot();
      const game = before.game;
      const effect = nonLeaderRuntime.hooks.processChatRecord({
        sender: 'Bebop',
        message: `[match end] poker party pknown-nonleader-match-end seed ${game.seed} hand ${game.handNumber}`,
        isSelf: false,
      });
      const after = nonLeaderRuntime.hooks.getStateSnapshot();
      assertEqual(effect.consumed, true, 'known non-leader matching match-end should consume the recognized command');
      assertEqual(effect.render, false, 'known non-leader matching match-end should not request a render');
      assertEqual(after.game.active, true, 'known non-leader matching match-end should leave the current game active');
      assertEqual(after.game.seed, before.game.seed, 'known non-leader matching match-end should preserve game identity');
      assertEqual(after.game.handNumber, before.game.handNumber, 'known non-leader matching match-end should preserve hand identity');
      assertEqual(
        JSON.stringify(after.party),
        JSON.stringify(before.party),
        'known non-leader matching match-end should preserve party authority state',
      );
    }
  }

  {
    const discoveryRuntime = createMenuRuntime();
    if (discoveryRuntime.hooks) {
      discoveryRuntime.hooks.processChatRecord({
        sender: '<unknown>',
        message: '[party leader] poker party punknown-leader-discovery',
        isSelf: false,
      });
      drainImmediateCallbacks(discoveryRuntime.runtime);
      const discoveryState = discoveryRuntime.hooks.getStateSnapshot();
      assertEqual(discoveryState.party.id, 'punknown-leader-discovery', 'unknown party-leader discovery should expose the joinable party id');
      assertEqual(discoveryState.party.mode, 'none', 'unknown party-leader discovery should not enter leader mode before joining');
      assertEqual(discoveryState.party.leaderKey, '', 'unknown party-leader discovery should not set an authoritative leader key');
      assertEqual(discoveryState.party.leaderName, '', 'unknown party-leader discovery should not set an authoritative leader name');
      assertEqual(discoveryRuntime.hooks.getPartyRoster().length, 0, 'unknown party-leader discovery should not invent a roster member');
      assertButtonAffordance(
        discoveryRuntime.runtime,
        'PokerJoinPartyButton',
        { hidden: false, enabled: true },
        'unknown party-leader discovery should render a joinable party control',
      );
    }
  }

  {
    const mixedSnapshotRuntime = createMenuRuntime();
    if (mixedSnapshotRuntime.hooks && mixedSnapshotRuntime.hooks.modules && mixedSnapshotRuntime.hooks.modules.PokerMetrics) {
      const mixedHooks = mixedSnapshotRuntime.hooks;
      mixedHooks.modules.PokerMetrics.reset();
      mixedHooks.handleReadyEvent(JSON.stringify({
        event: 'PokerChatMessage',
        action: 'snapshot',
        reason: 'mixed-consumed-and-old',
        seq: 2,
        messages: [
          { seq: 1, sender: 'Abrams', message: '[party leader] poker party pmixed-consumed-old', isSelf: false },
          { seq: 2, sender: 'Bebop', message: '[party join] poker party pmixed-consumed-old', isSelf: false },
          { seq: 1, sender: 'Abrams', message: '[party leave] poker party pmixed-consumed-old', isSelf: false },
        ],
      }));
      const mixedMetrics = mixedHooks.modules.PokerMetrics.snapshot();
      const mixedState = mixedHooks.getStateSnapshot();
      assertEqual(
        JSON.stringify(mixedState.party.order),
        JSON.stringify(['abrams', 'bebop']),
        'mixed snapshot should produce one final party projection after consumed and old-sequence rows',
      );
      assert(
        mixedMetrics && mixedMetrics.counters && mixedMetrics.counters.renderFlush <= 1,
        `mixed snapshot should defer at most one render flush: ${JSON.stringify(mixedMetrics && mixedMetrics.counters)}`,
      );
    }
  }

  {
    const nonCurrentLeaveRuntime = createSyncedJoinedPartyRuntime('Abrams', 'snon-current-member-leave', tableRoster, 1, 'pnon-current-member-leave');
    if (nonCurrentLeaveRuntime.hooks && nonCurrentLeaveRuntime.game) {
      const leaveHooks = nonCurrentLeaveRuntime.hooks;
      const leaveGame = nonCurrentLeaveRuntime.game;
      const leavingPlayer = leaveGame.players.find((player) => player.key === 'bebop');
      const currentActor = leaveGame.players.find((player) => player.key === 'abrams');
      assert(leavingPlayer, 'non-current three-player leave setup should include Bebop');
      assert(currentActor, 'non-current three-player leave setup should include Abrams as the current actor');
      if (leavingPlayer && currentActor) {
        leaveGame.currentIndex = leaveGame.players.indexOf(currentActor);
        const currentActorKey = currentPlayer(leaveGame).key;
        leaveHooks.processChatRecord({
          sender: 'Bebop',
          message: '[party leave] poker party pnon-current-member-leave',
          isSelf: false,
        });
        assertEqual(leaveGame.active, true, 'non-current three-player leave should keep the hand active');
        assertEqual(leavingPlayer.folded, true, 'non-current three-player leave should fold the departed member');
        assertEqual(leavingPlayer.left, true, 'non-current three-player leave should mark the departed member left');
        assertEqual(leavingPlayer.acted, true, 'non-current three-player leave should mark the departed member acted');
        assertEqual(
          currentPlayer(leaveGame).key,
          currentActorKey,
          'non-current three-player leave should not advance the current actor',
        );
      }
    }
  }

  {
    const nonLeaderEndRuntime = createSyncedJoinedPartyRuntime('Bebop', 'snonleader-direct-end', syncedRoster, 1, 'pnonleader-direct-end');
    if (nonLeaderEndRuntime.hooks && nonLeaderEndRuntime.game) {
      const endHooks = nonLeaderEndRuntime.hooks;
      const before = endHooks.getStateSnapshot();
      const dispatchStart = nonLeaderEndRuntime.runtime.dispatches.length;
      assertHookFunction(nonLeaderEndRuntime.runtime.sandbox, 'PokerEscapeMenuEndMatch', 'non-leader direct end-match global');
      nonLeaderEndRuntime.runtime.sandbox.PokerEscapeMenuEndMatch();
      const after = endHooks.getStateSnapshot();
      const submitted = nonLeaderEndRuntime.runtime.dispatches
        .slice(dispatchStart)
        .filter((event) => event.name === 'CitadelChatInputSubmitted')
        .map((event) => String(event.payloadText || ''));
      assert(
        !submitted.some((message) => message.indexOf('[match end] poker party ') === 0),
        `non-leader direct end-match should not submit a match-end command: ${submitted.join('|') || '<none>'}`,
      );
      assertEqual(
        JSON.stringify(after.game),
        JSON.stringify(before.game),
        'non-leader direct end-match should leave the current game unchanged',
      );
      assertEqual(
        JSON.stringify(after.party),
        JSON.stringify(before.party),
        'non-leader direct end-match should leave party authority unchanged',
      );
    }
  }
}

if (failures.length > 0) {
  console.error('validate-poker-game: failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('validate-poker-game: ok');
