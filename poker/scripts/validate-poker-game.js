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
  drainDueScheduledCallbacks,
  advanceScheduledTime,
  renderedActionButtons,
  renderedPlayerRows,
  renderedTableSeats,
  renderedLogLines,
  clearDomWrites,
  takeDomWrites,
  capturePanelIdentity,
} = harness;

const ROOT = path.resolve(__dirname, '..');
const MENU_SCRIPT = path.join(ROOT, 'panorama', 'scripts', 'poker_escape_menu.js');
const failures = [];
const MAX_PROGRESS_CHAT_COMMAND_LENGTH = 80;
const MAX_SYNCED_START_CHAT_COMMAND_LENGTH = MAX_PROGRESS_CHAT_COMMAND_LENGTH;

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

function drainImmediateCallbacks(runtime, maxCallbacks = 128) {
  if (!runtime || !runtime.schedules) return;
  for (let i = 0; i < maxCallbacks; i += 1) {
    const index = runtime.schedules.findIndex((schedule) => Number(schedule && schedule.delay) === 0);
    if (index < 0) return;
    const schedule = runtime.schedules.splice(index, 1)[0];
    if (schedule && typeof schedule.callback === 'function') schedule.callback();
  }
}

function wrapImmediateRenderHooks(runtime, hooks) {
  if (!runtime || !hooks || hooks.__validatorImmediateRenderWrapped) return hooks;
  hooks.__validatorImmediateRenderWrapped = true;
  for (const functionName of ['processChatRecord', 'handleReadyEvent', 'showdown']) {
    if (typeof hooks[functionName] !== 'function') continue;
    const original = hooks[functionName];
    hooks[functionName] = function wrappedHook(...args) {
      const result = original.apply(this, args);
      drainImmediateCallbacks(runtime);
      return result;
    };
  }
  return hooks;
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

function rowClassSummary(entries) {
  return (entries || []).map((entry) => {
    const name = entry && entry.name ? entry.name : '<empty>';
    const classes = classNames(entry && entry.panel).join(',');
    return `${name}:${classes || '<none>'}`;
  }).join('|') || '<none>';
}

function assertPotWinnerRows(entries, winnerNames, rowLabel, message) {
  const expected = new Set(winnerNames || []);
  const seen = {};
  for (const entry of entries || []) {
    if (!entry || !entry.name) continue;
    seen[entry.name] = true;
    const shouldWin = expected.has(entry.name);
    assertEqual(
      hasClass(entry.panel, 'PotWinner'),
      shouldWin,
      `${message} should ${shouldWin ? 'mark' : 'not mark'} ${entry.name} as a PotWinner ${rowLabel}: ${rowClassSummary(entries)}`,
    );
  }
  for (const name of expected) {
    assert(seen[name], `${message} should render ${name} in ${rowLabel}: ${rowClassSummary(entries)}`);
  }
}

function assertPotWinnerFeedback(runtime, winnerNames, message) {
  assertPotWinnerRows(renderedPlayerRows(runtime), winnerNames, 'player row', message);
  assertPotWinnerRows(renderedTableSeats(runtime), winnerNames, 'table seat row', message);
  for (const id of ['PokerAnnouncerOverlay', 'PokerAnnouncerTitle', 'PokerAnnouncerBody']) {
    const panel = findPanel(runtime, id);
    assert(panel, `${message} should render #${id} for pot-winner feedback`);
    assert(hasClass(panel, 'PotWinner'), `${message} should mark #${id} as PotWinner`);
  }
}

function normalizeChipCountText(text) {
  const match = String(text || '').match(/(\d+)/);
  return match ? Number(match[1]) : NaN;
}

function renderedPotChipArt(runtime) {
  return findDescendantsWithClass(findPanel(runtime, 'PokerPotChips'), 'PokerPotChip', []).map((chip) => {
    const image = firstDescendantWithClass(chip, 'PokerPotChipImage');
    return {
      src: image && image.src ? String(image.src) : '',
      count: normalizeChipCountText(panelText(firstDescendantWithClass(chip, 'PokerPotChipCount')) || '1'),
      panel: chip,
    };
  });
}

function assertPotCenterArt(runtime, potAmount, expectedAssets, message) {
  assertPanelVisible(runtime, 'PokerPotCenter', message);
  assertPanelVisible(runtime, 'PokerPotChips', message);
  assertEqual(panelText(findPanel(runtime, 'PokerPotCenterAmount')), `$${potAmount}`, `${message} center amount`);
  const actual = renderedPotChipArt(runtime).map((chip) => ({
    asset: chip.src.split('/').pop(),
    count: chip.count,
  }));
  assertEqual(JSON.stringify(actual), JSON.stringify(expectedAssets), `${message} tiered chip art`);
}

function potAmountTexts(runtime) {
  return {
    header: panelText(findPanel(runtime, 'PokerPotLabel')),
    center: panelText(findPanel(runtime, 'PokerPotCenterAmount')),
  };
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
    assert(textIncludesFolded(actionLabels, label), `${message} should render ${label} action`);
  }
  for (const label of absentLabels || []) {
    assert(!textIncludesFolded(actionLabels, label), `${message} should not render illegal ${label} action`);
  }
  assert(panelText(status).toLowerCase().includes(String(currentName).toLowerCase()), `${message} status should expose the current actor`);
  assertEqual(panelText(phaseLabel), String(phase).toUpperCase(), `${message} phase label should expose the current phase`);
}

function assertObserverCurrentActorControls(runtime, currentName, expectedLabels, absentLabels, message) {
  const actions = findPanel(runtime, 'PokerActionButtons');
  const status = panelText(findPanel(runtime, 'PokerStatusLabel'));
  const actionText = collectPanelTexts(actions, []).join('|');
  const waitingHint = `Waiting for ${currentName}`;

  assert(!hasClass(actions, 'PokerHidden'), `${message} should keep the action area visible for observers`);
  assertGreaterThan(actionButtonPanels(runtime).length, 0, `${message} should render current actor choices`);
  assert(status.includes(waitingHint), `${message} should preserve the waiting hint for ${currentName}: ${status || '<empty>'}`);
  for (const label of expectedLabels || []) {
    assert(textIncludesFolded(actionText, label), `${message} should expose current actor ${label} option: ${actionText || '<empty>'}`);
  }
  for (const label of absentLabels || []) {
    assert(!textIncludesFolded(actionText, label), `${message} should not expose illegal ${label} option: ${actionText || '<empty>'}`);
  }
  assertReadOnlyActionButtons(runtime, expectedLabels, waitingHint, message);
}

function actionButtonPanels(runtime) {
  return renderedActionButtons(runtime).map((entry) => entry.panel);
}

function normalizedPanelText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function textIncludesFolded(haystack, needle) {
  return normalizedPanelText(haystack).includes(normalizedPanelText(needle));
}

function actionButtonSemantic(label) {
  const text = normalizedPanelText(label);
  if (/^CALL(\b|\s|\$)/.test(text)) return 'CALL';
  if (/^RAISE\b/.test(text)) return 'RAISE';
  if (/^FOLD\b/.test(text)) return 'FOLD';
  if (/^CHECK\b/.test(text)) return 'CHECK';
  if (/^BET\b/.test(text)) return 'BET';
  return text;
}

function actionButtonLabel(button) {
  return collectPanelTexts(button, []).join('|') || '<unlabeled>';
}

function allDescendants(panel, out) {
  if (!out) out = [];
  if (!panel || panel.deleted) return out;
  for (const child of panel.children || []) {
    if (!child || child.deleted) continue;
    out.push(child);
    allDescendants(child, out);
  }
  return out;
}

function classNames(panel) {
  return Object.keys((panel && panel.classes) || {}).filter((name) => panel.classes[name]);
}

function panelDescriptor(panel) {
  if (!panel) return '';
  return [
    panel.id || '',
    panel.type || '',
    classNames(panel).join(' '),
    collectPanelTexts(panel, []).join(' '),
  ].join(' ');
}

function isInsideActionButton(panel) {
  let cursor = panel;
  while (cursor) {
    if (cursor.type === 'Button' || hasClass(cursor, 'PokerActionButton')) return true;
    cursor = cursor.parent || null;
  }
  return false;
}

function actionNonButtonDescendants(runtime) {
  const actions = findPanel(runtime, 'PokerActionButtons');
  return allDescendants(actions, []).filter((panel) => !isInsideActionButton(panel));
}

function customRaiseAmountControls(runtime) {
  const amountControlPattern = /custom|raise|bet|amount|wager|stake|input|entry|slider/i;
  return actionNonButtonDescendants(runtime).filter((panel) => {
    if (!panel || panel.type === 'Button' || panel.type === 'Label') return false;
    return amountControlPattern.test(panelDescriptor(panel));
  });
}

function customRaiseDescriptor(runtime) {
  const controls = customRaiseAmountControls(runtime);
  const relatedPanels = new Set(controls);
  for (const panel of controls) {
    for (const child of allDescendants(panel, [])) relatedPanels.add(child);
  }
  for (const panel of actionNonButtonDescendants(runtime)) {
    if (/min|max|current|value|amount|invalid|illegal|error/i.test(panelDescriptor(panel))) relatedPanels.add(panel);
  }
  return Array.from(relatedPanels).map(panelDescriptor).join(' | ');
}

function findEditableCustomRaiseControl(runtime) {
  const controls = customRaiseAmountControls(runtime);
  return controls.find((panel) => /textentry|input|entry/i.test(`${panel.type || ''} ${panelDescriptor(panel)}`)) || controls[0] || null;
}

function invokePanelEvent(panel, eventName) {
  if (!panel || typeof panel[eventName] !== 'function') return;
  try {
    panel[eventName](panel);
  } catch (e) {
    try {
      panel[eventName]();
    } catch (ignored) {}
  }
}

function panelStateDescriptor(panel) {
  if (!panel) return '';
  const parts = [classNames(panel).join(' ')];
  for (const key of Object.keys(panel)) {
    if (['children', 'classes', 'deleted', 'id', 'parent', 'style', 'text', 'type'].includes(key)) continue;
    const value = panel[key];
    if (value == null || typeof value === 'function' || typeof value === 'object') continue;
    parts.push(`${key}:${String(value)}`);
  }
  for (const key of Object.keys((panel && panel.style) || {})) {
    parts.push(`style.${key}:${String(panel.style[key])}`);
  }
  return parts.join(' ');
}

function invalidCustomRaisePanels(runtime) {
  return actionNonButtonDescendants(runtime).filter((panel) => /invalid|illegal|error/i.test(panelStateDescriptor(panel)));
}

function assertRaiseFacingActionButtonContract(runtime, message) {
  const actions = findPanel(runtime, 'PokerActionButtons');
  const buttons = renderedActionButtons(runtime);
  const semantics = buttons.map((button) => actionButtonSemantic(button.label));

  assert(actions, `${message} should have #PokerActionButtons`);
  assert(!hasClass(actions, 'PokerHidden'), `${message} should keep the action area visible`);
  assertEqual(buttons.length, 3, `${message} should render exactly three visible action buttons`);
  assertEqual(JSON.stringify(semantics), JSON.stringify(['CALL', 'RAISE', 'FOLD']), `${message} action button semantics`);
  for (const button of buttons) {
    const label = String(button.label || '');
    const semantic = actionButtonSemantic(label);
    assert(button.enabled, `${message} ${label || '<unlabeled>'} button should be enabled for the local actor`);
    assert(button.hittest !== false, `${message} ${label || '<unlabeled>'} button should accept pointer hits`);
    assertEqual(typeof button.panel.onactivate, 'function', `${message} ${label || '<unlabeled>'} button should have an activation handler`);
    if (semantic === 'RAISE') {
      assert(!/\$\s*\d/.test(label), `${message} raise button should not encode a fixed raise size: ${label || '<empty>'}`);
    }
  }
}

function assertCustomRaiseAmountControlContract(runtime, minimumRaiseTo, message) {
  const controls = customRaiseAmountControls(runtime);
  const descriptor = customRaiseDescriptor(runtime);

  assertGreaterThan(controls.length, 0, `${message} should render a non-button custom raise amount control`);
  assert(/min|minimum/i.test(descriptor), `${message} custom raise amount UI should expose its minimum in text or classes: ${descriptor || '<empty>'}`);
  assert(/max|maximum/i.test(descriptor), `${message} custom raise amount UI should expose its maximum in text or classes: ${descriptor || '<empty>'}`);
  assert(/current|value|amount|input|entry/i.test(descriptor), `${message} custom raise amount UI should expose its current amount/value in text or classes: ${descriptor || '<empty>'}`);
  assert(
    String(descriptor).includes(String(minimumRaiseTo)),
    `${message} custom raise amount UI should expose the minimum raise target $${minimumRaiseTo}: ${descriptor || '<empty>'}`,
  );
}

function assertIllegalCustomRaiseAmountMarksInvalid(runtime, illegalAmount, message) {
  const editable = findEditableCustomRaiseControl(runtime);
  assert(editable, `${message} should expose an editable custom raise amount control`);
  if (!editable) return;
  editable.text = String(illegalAmount);
  for (const eventName of ['ontextentrychange', 'onchange', 'oninput', 'onvaluechanged', 'ontextchanged', 'ontextentrysubmit', 'oninputsubmit']) {
    invokePanelEvent(editable, eventName);
  }
  const invalidPanels = invalidCustomRaisePanels(runtime);
  assertGreaterThan(
    invalidPanels.length,
    0,
    `${message} should mark illegal custom raise amount ${illegalAmount} with an invalid/illegal/error class or state`,
  );
}

function summarizeDomWrites(writes) {
  const summary = {
    create: 0,
    delete: 0,
    deleteChildren: 0,
    class: 0,
    text: 0,
    hittest: 0,
    event: 0,
    imageSrc: 0,
    value: 0,
    valueAttr: 0,
    attr: 0,
    style: 0,
  };
  for (const write of writes || []) {
    if (!write || !write.type) continue;
    if (write.type === 'delete-children') {
      summary.deleteChildren += 1;
    } else if (write.type === 'image-src') {
      summary.imageSrc += 1;
    } else if (write.type === 'value-attr') {
      summary.valueAttr += 1;
    } else if (Object.prototype.hasOwnProperty.call(summary, write.type)) {
      summary[write.type] += 1;
    }
  }
  return summary;
}

function countRendered(runtime) {
  return {
    actionButtons: findDescendantsWithClass(findPanel(runtime, 'PokerActionButtons'), 'PokerActionButton', []).filter((panel) => panel.type === 'Button').length,
    playerRows: findDescendantsWithClass(findPanel(runtime, 'PokerPlayersList'), 'PokerPlayerRow', []).length,
    tableSeats: findDescendantsWithClass(findPanel(runtime, 'PokerTableSeats'), 'PokerTableSeat', []).length,
    logLines: findDescendantsWithClass(findPanel(runtime, 'PokerGameLog'), 'PokerLogLine', []).length,
    actionHints: findDescendantsWithClass(findPanel(runtime, 'PokerActionButtons'), 'PokerActionHint', []).length,
    customBetControls: findDescendantsWithClass(findPanel(runtime, 'PokerActionButtons'), 'PokerCustomBetControls', []).length,
    potChips: findDescendantsWithClass(findPanel(runtime, 'PokerPotChips'), 'PokerPotChip', []).length,
  };
}


function assertSamePanelList(actual, expected, message) {
  assertEqual(actual.length, expected.length, `${message} length`);
  const count = Math.min(actual.length, expected.length);
  for (let i = 0; i < count; i += 1) {
    assert(actual[i] === expected[i], `${message} panel ${i} identity`);
  }
}


function assertReadOnlyActionButtons(runtime, expectedLabels, expectedHint, message) {
  const actions = findPanel(runtime, 'PokerActionButtons');
  const status = panelText(findPanel(runtime, 'PokerStatusLabel'));
  const actionText = collectPanelTexts(actions, []).join('|');
  const buttons = actionButtonPanels(runtime);

  assert(!hasClass(actions, 'PokerHidden'), `${message} should keep the action area visible`);
  assertGreaterThan(buttons.length, 0, `${message} should render read-only action buttons`);
  if (expectedHint) {
    assert(
      status.toLowerCase().includes(String(expectedHint).toLowerCase()),
      `${message} should explain why actions are read-only: ${status || '<empty>'}`,
    );
  }
  for (const label of expectedLabels || []) {
    assert(textIncludesFolded(actionText, label), `${message} should show ${label} as a read-only legal option: ${actionText || '<empty>'}`);
  }
  for (const button of buttons) {
    const label = actionButtonLabel(button);
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
    assert(textIncludesFolded(actionText, label), `${message} should expose ${label} for the local actor: ${actionText || '<empty>'}`);
  }
  for (const button of buttons) {
    const label = actionButtonLabel(button);
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
  wrapImmediateRenderHooks(gameRuntime, gameHooks);

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
  return { runtime: menuRuntime, hooks: wrapImmediateRenderHooks(menuRuntime, menuHooks) };
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

function createSyncedJoinedPartyRuntime(localName, seed, roster, handNumber, partyId) {
  const synced = createMenuRuntime();
  if (!synced.hooks || !hasPartySyncHooks(synced.hooks, `synced joined party runtime for ${localName}`)) {
    return { runtime: synced.runtime, hooks: synced.hooks, game: null, startCommand: '' };
  }

  const players = roster || [];
  const leader = players[0] || { key: 'abrams', name: 'Abrams' };
  const id = partyId || 'psync';
  const startCommand = synced.hooks.buildSynchronizedStartCommand(seed, players, handNumber);
  synced.hooks.processChatRecord({
    sender: leader.name,
    message: `[party leader] poker party ${id}`,
    isSelf: localName === leader.name,
  });
  for (let i = 1; i < players.length; i += 1) {
    synced.hooks.processChatRecord({
      sender: players[i].name,
      message: `[party join] poker party ${id}`,
      isSelf: localName === players[i].name,
    });
  }
  synced.hooks.processChatRecord({ sender: leader.name, message: startCommand, isSelf: localName === leader.name });

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
      'poker start snatural-next hand 2 roster abrams|bebop',
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
wrapImmediateRenderHooks(runtime, hooks);

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
    PokerEngine: ['create', 'actions', 'apply', 'depart', 'progress', 'evaluate'],
    PartyReducer: ['apply', 'roster', 'reset'],
    ProgressResume: ['project', 'gates', 'getStartGate', 'getHostedStartGate', 'import', 'importCode', 'build', 'buildCode', 'applyShare', 'shareImported', 'selectHostedLeader', 'applyStartCommand'],
    PokerMetrics: ['reset', 'snapshot', 'increment', 'start', 'end'],
    RenderScheduler: ['defer', 'immediate', 'flush', 'isQueued'],
    PanelCache: ['refresh', 'get', 'invalidate', 'hasRequired'],
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
  if (modules.PartyReducer) {
    const partyContractRuntime = createMenuRuntime();
    const partyContractHooks = partyContractRuntime.hooks;
    const reducer = partyContractHooks && partyContractHooks.modules && partyContractHooks.modules.PartyReducer;
    if (reducer) {
      const leaderResult = reducer.apply({
        type: 'leader',
        partyId: 'pdeep',
        record: { sender: 'Abrams', isSelf: true },
      });
      assertEqual(
        JSON.stringify(Object.keys(leaderResult).sort()),
        JSON.stringify(['changed', 'gameDeparture', 'readyAction', 'render', 'resetCase', 'status']),
        'PartyReducer.apply should expose only the documented deep result fields',
      );
      assert(leaderResult.changed, 'PartyReducer.apply should accept a local party leader transition');
      assertEqual(JSON.stringify(reducer.roster()), JSON.stringify([{ key: 'abrams', name: 'Abrams' }]), 'PartyReducer.roster should project the hosted leader');
      const foreignResult = reducer.apply({
        type: 'leader',
        partyId: 'pforeign',
        record: { sender: 'Bebop', isSelf: false },
      });
      assertEqual(foreignResult.changed, false, 'PartyReducer.apply should reject a foreign leader while hosting');
      assertEqual(partyContractHooks.state.party.id, 'pdeep', 'foreign leader rejection should retain the hosted party id');
      reducer.reset('leave-lobby', 'PartyReducer contract fixture');
      assertEqual(partyContractHooks.state.party.id, '', 'PartyReducer.reset should clear the party singleton');
    }
  }
  if (modules.PokerEngine) {
    const engineRuntime = createGameRuntime(['Abrams', 'Bebop', 'Calico'], 'engine-surface');
    const engineHooks = engineRuntime.hooks;
    const engine = engineHooks && engineHooks.modules && engineHooks.modules.PokerEngine;
    if (engine && engineHooks && engineRuntime.game) {
      const created = engine.create({
        seed: 'engine-created',
        roster: [
          { key: 'abrams', name: 'Abrams' },
          { key: 'bebop', name: 'Bebop' },
          { key: 'calico', name: 'Calico' },
        ],
        handNumber: 2,
      });
      assert(created.ok && created.game, 'PokerEngine.create should create a deterministic hand from explicit options');
      const actor = currentPlayer(engineRuntime.game);
      const actionView = actor ? engine.actions(engineRuntime.game, actor.key, actor.key) : null;
      assert(actionView && actionView.currentKey === (actor ? actor.key : ''), 'PokerEngine.actions should project the requested current actor');
      if (actor && actionView) {
        const command = actionView.legal.check ? 'check' : 'call';
        const applied = engine.apply(engineRuntime.game, { type: command }, actor.key);
        assert(applied && applied.ok, 'PokerEngine.apply should apply a legal normalized action to the provided game');
      }
    }

    const twoPlayerDeparture = createGameRuntime(['Abrams', 'Bebop'], 'engine-depart-two');
    const twoEngine = twoPlayerDeparture.hooks && twoPlayerDeparture.hooks.modules && twoPlayerDeparture.hooks.modules.PokerEngine;
    if (twoEngine && twoPlayerDeparture.game) {
      const departing = twoPlayerDeparture.game.players[0];
      const result = twoEngine.depart(twoPlayerDeparture.game, departing.key, { name: departing.name });
      assert(result && result.reset, 'PokerEngine.depart should reset an active two-player hand');
      assertEqual(departing.left, undefined, 'two-player departure reset should not mark a player left before lobby reset');
      assertEqual(twoPlayerDeparture.game.active, true, 'two-player departure reset should leave the transition for PartyReducer to consume');
    }

    const nonCurrentDeparture = createGameRuntime(['Abrams', 'Bebop', 'Calico'], 'engine-depart-non-current');
    const nonCurrentEngine = nonCurrentDeparture.hooks && nonCurrentDeparture.hooks.modules && nonCurrentDeparture.hooks.modules.PokerEngine;
    if (nonCurrentEngine && nonCurrentDeparture.game) {
      const nonCurrentGame = nonCurrentDeparture.game;
      nonCurrentGame.currentIndex = 0;
      const beforeDeck = JSON.stringify(nonCurrentGame.deck);
      const nonCurrent = nonCurrentGame.players[2];
      const result = nonCurrentEngine.depart(nonCurrentGame, nonCurrent.key, { name: nonCurrent.name });
      assert(result && result.continuation, 'PokerEngine.depart should continue a three-player hand');
      assertEqual(nonCurrent.left, true, 'non-current departure should mark the player left');
      assertEqual(nonCurrent.folded, true, 'non-current departure should fold the player');
      assertEqual(nonCurrent.acted, true, 'non-current departure should mark the player acted');
      assertEqual(nonCurrentGame.currentIndex, 0, 'non-current departure should not advance the current actor');
      assertEqual(JSON.stringify(nonCurrentGame.deck), beforeDeck, 'non-current departure should preserve deterministic deck state');
    }

    const currentDeparture = createGameRuntime(['Abrams', 'Bebop', 'Calico'], 'engine-depart-current');
    const currentEngine = currentDeparture.hooks && currentDeparture.hooks.modules && currentDeparture.hooks.modules.PokerEngine;
    if (currentEngine && currentDeparture.game) {
      const currentGame = currentDeparture.game;
      const current = currentGame.players[1];
      currentGame.currentIndex = 1;
      const result = currentEngine.depart(currentGame, current.key, { name: current.name });
      assert(result && result.advanced, 'current departure should report an actor advance');
      assert(currentGame.currentIndex !== 1, 'current departure should advance away from the departed player');
      assert(currentGame.players[currentGame.currentIndex] && !currentGame.players[currentGame.currentIndex].left, 'current departure should select a non-departed actor');
    }

    const progressDeparture = createGameRuntime(['Abrams', 'Bebop', 'Calico'], 'engine-progress-departed');
    const progressEngine = progressDeparture.hooks && progressDeparture.hooks.modules && progressDeparture.hooks.modules.PokerEngine;
    if (progressEngine && progressDeparture.game) {
      const progressGame = progressDeparture.game;
      progressGame.active = false;
      progressGame.finished = true;
      progressGame.dealerIndex = 0;
      progressGame.players[0].left = true;
      progressGame.players[0].folded = true;
      const projection = progressEngine.progress(progressGame);
      assertEqual(JSON.stringify(projection.players.map((player) => player.key)), JSON.stringify(['bebop', 'calico']), 'PokerEngine.progress should exclude departed players');
      assert(projection.dealerKey === 'bebop' || projection.dealerKey === 'calico', 'PokerEngine.progress should re-anchor the dealer to an eligible player');
      assert(!projection.players.some((player) => player.left), 'PokerEngine.progress should not expose departed players to resume eligibility');
    }

    const departedAllIn = createGameRuntime(['Seven', 'Shiv', 'Viscous'], 'engine-depart-all-in');
    const departedAllInEngine = departedAllIn.hooks && departedAllIn.hooks.modules && departedAllIn.hooks.modules.PokerEngine;
    if (departedAllInEngine && departedAllIn.game) {
      const sideGame = departedAllIn.game;
      sideGame.players[0].stack = 0;
      sideGame.players[0].committed = 100;
      sideGame.players[1].stack = 0;
      sideGame.players[1].committed = 300;
      sideGame.players[2].stack = 0;
      sideGame.players[2].committed = 500;
      sideGame.players[0].bet = 100;
      sideGame.players[1].bet = 300;
      sideGame.players[2].bet = 500;
      sideGame.currentIndex = 1;
      const departed = departedAllInEngine.depart(sideGame, sideGame.players[0].key, { name: sideGame.players[0].name });
      const pots = departedAllIn.hooks.buildPots(sideGame.players);
      assert(departed && departed.continuation, 'departed all-in fixture should continue the three-player hand');
      assertEqual(pots[0].amount, 300, 'departed all-in player should still contribute committed chips to the main pot');
      assertEqual(pots[0].eligible.some((player) => player.key === sideGame.players[0].key), false, 'departed all-in player should remain folded and ineligible for side-pot awards');
    }
  }
  if (modules.PokerMetrics && modules.RenderScheduler && modules.TableRenderer) {
    const instrumentation = createMenuRuntime();
    const instrumentationHooks = instrumentation.hooks;
    const instrumentationModules = instrumentationHooks && instrumentationHooks.modules;
    assert(instrumentationModules && instrumentationModules.PokerMetrics, 'instrumentation fixture should expose PokerMetrics');
    assert(instrumentationModules && instrumentationModules.RenderScheduler, 'instrumentation fixture should expose RenderScheduler');
    assert(instrumentationModules && instrumentationModules.TableRenderer, 'instrumentation fixture should expose TableRenderer');
    if (instrumentationModules && instrumentationModules.PokerMetrics && instrumentationModules.RenderScheduler && instrumentationModules.TableRenderer) {
      instrumentationModules.PokerMetrics.reset();
      instrumentationModules.TableRenderer.renderGame();
      let metrics = instrumentationModules.PokerMetrics.snapshot();
      assert(
        metrics && metrics.timings && metrics.timings.renderGame && metrics.timings.renderGame.count > 0,
        'TableRenderer.renderGame should record renderGame timing in test mode',
      );

      clearDomWrites(instrumentation.runtime);
      instrumentationModules.TableRenderer.renderGame();
      const noOpWrites = summarizeDomWrites(takeDomWrites(instrumentation.runtime));
      assertEqual(noOpWrites.create, 0, 'repeated empty-lobby render should not create new panels');

      instrumentationModules.PokerMetrics.reset();
      let delayedScheduleRan = false;
      instrumentation.runtime.sandbox.$.Schedule(0.25, () => { delayedScheduleRan = true; });
      instrumentationModules.RenderScheduler.defer('validator-a');
      instrumentationModules.RenderScheduler.defer('validator-b');
      instrumentationModules.RenderScheduler.defer('validator-c');
      drainDueScheduledCallbacks(instrumentation.runtime, 8);
      metrics = instrumentationModules.PokerMetrics.snapshot();
      assertEqual(metrics.counters.renderFlush, 1, 'same-tick deferred renders should coalesce to one render flush');
      assertEqual(delayedScheduleRan, false, 'draining due callbacks at current virtual time should not run delayed callbacks');
      assert(
        metrics.counters.renderRequestCoalesced >= 1,
        `same-tick deferred renders should record coalescing: ${JSON.stringify(metrics.counters)}`,
      );
      advanceScheduledTime(instrumentation.runtime, 249, 8);
      assertEqual(delayedScheduleRan, false, 'advancing before a delayed callback due time should not run it');
      advanceScheduledTime(instrumentation.runtime, 1, 8);
      assertEqual(delayedScheduleRan, true, 'advancing to a delayed callback due time should run it');
    }
  }
  {
    function assertHostPartySubmitForTarget(targetText, message) {
      const submitRuntime = createMenuRuntime();
      const submitInput = findPanel(submitRuntime.runtime, 'ChatInput');
      const submitTarget = findPanel(submitRuntime.runtime, 'ChatTargetLabel');
      assert(submitInput, `${message} should have ChatInput`);
      assert(submitTarget, `${message} should have ChatTargetLabel`);
      if (submitTarget) submitTarget.text = targetText;
      const dispatchStart = submitRuntime.runtime.dispatches.length;
      submitRuntime.runtime.sandbox.PokerEscapeMenuHostParty();
      drainDueScheduledCallbacks(submitRuntime.runtime, 8);
      assertEqual(
        submitRuntime.runtime.dispatches.slice(dispatchStart).filter((event) => event.name === 'CitadelChatInputSubmitted').length,
        0,
        `${message} should not submit before the first delayed chat retry is due`,
      );
      advanceScheduledTime(submitRuntime.runtime, 50, 8);
      assertEqual(
        submitRuntime.runtime.dispatches.slice(dispatchStart).filter((event) => event.name === 'CitadelChatInputSubmitted').length,
        0,
        `${message} should wait for one stable chat retry before submitting`,
      );
      advanceScheduledTime(submitRuntime.runtime, 100, 8);
      const submitEvents = submitRuntime.runtime.dispatches.slice(dispatchStart);
      const submittedEvents = submitEvents.filter((event) => event.name === 'CitadelChatInputSubmitted');
      assertEqual(submittedEvents.length, 1, `${message} should submit one chat input event`);
      assertEqual(
        submitEvents.filter((event) => event.name === 'CitadelConCommand' && event.payload === 'say_chat_team').length,
        0,
        `${message} should not force team chat when a supported target is already open`,
      );
      const submittedEvent = submittedEvents[0];
      assertEqual(submittedEvent.payloadId, 'ChatInput', `${message} should capture the ChatInput panel id`);
      assert(
        String(submittedEvent.payloadTextAtDispatch || '').indexOf('[party leader] poker party ') === 0,
        `${message} should capture the party leader command before clearing input: ${submittedEvent.payloadTextAtDispatch || '<none>'}`,
      );
      assertEqual(submitInput && submitInput.text, '', `${message} should clear chat input text after submit`);
      const submitIndex = submitEvents.findIndex((event) => event.name === 'CitadelChatInputSubmitted');
      const blurIndex = submitEvents.findIndex((event) => event.name === 'CitadelChatInputBlur');
      const dropIndex = submitEvents.findIndex((event) => event.name === 'DropInputFocus');
      assert(blurIndex > submitIndex, `${message} should dispatch CitadelChatInputBlur after submit`);
      assert(dropIndex > submitIndex, `${message} should dispatch DropInputFocus after submit`);
    }
    assertHostPartySubmitForTarget('PARTY', 'host party command on PARTY target');
    assertHostPartySubmitForTarget('TEAM', 'host party command on TEAM target');
    assertHostPartySubmitForTarget('#citadel_chat_all', 'host party command on ALL target');
  }
  if (modules.PanelCache) {
    const cacheRuntime = createMenuRuntime();
    const cacheHooks = cacheRuntime.hooks;
    assert(cacheHooks && cacheHooks.modules && cacheHooks.modules.PanelCache, 'panel-cache fixture should expose PanelCache');
    if (cacheHooks && cacheHooks.modules && cacheHooks.modules.PanelCache) {
      cacheRuntime.runtime.sandbox.PokerEscapeMenuToggle();
      drainImmediateCallbacks(cacheRuntime.runtime);
      const oldLobbyWindow = cacheHooks.state.lobbyWindow;
      assert(oldLobbyWindow, 'panel-cache fixture should capture the initial lobby window');
      const partyBefore = JSON.stringify(cacheHooks.state.party);
      const gameBefore = cacheHooks.state.game;
      oldLobbyWindow.deleted = true;
      const replacement = cacheRuntime.runtime.panels.createPanel('Panel', cacheRuntime.runtime.panels.root, 'PokerLobbyWindow');
      cacheHooks.modules.PanelCache.invalidate('validator');
      cacheHooks.modules.PanelCache.refresh();
      assertEqual(cacheHooks.state.lobbyWindow, replacement, 'PanelCache.refresh should reacquire a replacement lobby window');
      assertEqual(JSON.stringify(cacheHooks.state.party), partyBefore, 'PanelCache.invalidate should not change party projection');
      assertEqual(cacheHooks.state.game, gameBefore, 'PanelCache.invalidate should not change game projection');

      const staleRuntime = createGameRuntime(['Abrams', 'Bebop', 'Calico'], 'panel-cache-stale-children');
      const staleHooks = staleRuntime.hooks;
      assert(staleHooks && staleHooks.modules && staleHooks.modules.PanelCache && staleRuntime.game, 'panel-cache stale-child fixture should expose active game and PanelCache');
      if (staleHooks && staleHooks.modules && staleHooks.modules.PanelCache && staleRuntime.game) {
        staleHooks.modules.TableRenderer.renderGame();
        const stalePartyBefore = JSON.stringify(staleHooks.state.party);
        const staleGameBefore = staleHooks.state.game;
        for (const target of [
          ['PokerPlayersList', 'PokerPlayerRow', 'players'],
          ['PokerTableSeats', 'PokerTableSeat', 'table seats'],
          ['PokerPotChips', 'PokerPotChip', 'pot chips'],
          ['PokerActionButtons', 'PokerActionButton', 'action buttons'],
        ]) {
          const oldParent = findPanel(staleRuntime.runtime, target[0]);
          const oldChild = findDescendantsWithClass(oldParent, target[1], [])[0] || null;
          assert(oldParent && oldChild, `panel-cache stale-child ${target[2]} setup should have parent and child`);
          if (!oldParent || !oldChild) continue;
          oldParent.deleted = true;
          const replacementParent = staleRuntime.runtime.panels.createPanel('Panel', staleRuntime.runtime.panels.root, target[0]);
          staleHooks.modules.PanelCache.invalidate(`validator-${target[0]}`);
          staleHooks.modules.PanelCache.refresh();
          staleHooks.modules.TableRenderer.renderGame();
          const currentParent = findPanel(staleRuntime.runtime, target[0]);
          const currentChild = findDescendantsWithClass(currentParent, target[1], [])[0] || null;
          assertEqual(currentParent, replacementParent, `PanelCache.refresh should reacquire replacement ${target[0]}`);
          assert(currentChild && currentChild !== oldChild, `panel-cache stale-child ${target[2]} should not reuse stale child panel identity`);
          assertEqual(staleHooks.state.game, staleGameBefore, `PanelCache.invalidate should preserve active game while replacing ${target[0]}`);
          assertEqual(JSON.stringify(staleHooks.state.party), stalePartyBefore, `PanelCache.invalidate should preserve party state while replacing ${target[0]}`);
        }
      }
    }
  }
  if (modules.CardPresenter) {
    const cardPresenter = modules.CardPresenter;
    const flipHost = runtime.panels.createPanel('Panel', runtime.panels.root, '', 'PokerCardFlipRegressionHost');
    const testCard = card('K', 'H');
    const cardPanel = cardPresenter.render(flipHost, testCard, false);
    const scheduledFlipCountBefore = runtime.schedules.length;
    cardPresenter.update(cardPanel, null, false);
    const scheduledFlipCompletions = runtime.schedules.splice(scheduledFlipCountBefore);
    const scheduledFlipCompletion = scheduledFlipCompletions[0] || {};
    const stableContents = firstDescendantWithClass(cardPanel, 'PokerCardContents');

    const flipLayers = findDescendantsWithClass(cardPanel, 'PokerCardFlipLayer', []);
    const outgoingFaceLayer = flipLayers.find((layer) => hasClass(layer, 'FlipToBack') && !hasClass(layer, 'QuestionFace'));
    const incomingQuestionLayer = flipLayers.find((layer) => hasClass(layer, 'FlipReveal') && hasClass(layer, 'QuestionFace'));
    const incomingQuestionText = collectPanelTexts(incomingQuestionLayer, []).join('|');
    const outgoingFaceText = collectPanelTexts(outgoingFaceLayer, []).join('|');

    assert(hasClass(cardPanel, 'FlipActive'), 'face-to-back card flip should mark the card panel active during the scheduled animation');
    assert(stableContents, 'face-to-back card flip should keep stable PokerCardContents mounted during the scheduled animation');
    assert(hasClass(stableContents, 'FlipHidden'), 'face-to-back card flip should hide stable PokerCardContents while flip layers animate');
    assertEqual(scheduledFlipCompletions.length, 1, 'face-to-back card flip should schedule one completion callback');
    assertEqual(scheduledFlipCompletion.delay, 1.2, 'face-to-back card flip completion should wait for the 1.2s animation');
    assert(outgoingFaceLayer, 'face-to-back card flip should keep the outgoing face layer animating with FlipToBack');
    assert(outgoingFaceText.includes('K') && outgoingFaceText.includes('♥'), `face-to-back card flip outgoing layer should preserve the old face before scheduled completion: ${outgoingFaceText || '<empty>'}`);
    assert(incomingQuestionLayer, 'face-to-back card flip should create an incoming question/back layer with FlipReveal and QuestionFace before scheduled completion');
    assert(incomingQuestionText.includes('?'), `face-to-back card flip incoming layer should make ? visible during the animation: ${incomingQuestionText || '<empty>'}`);

    drainScheduledCallbacks({ schedules: scheduledFlipCompletions }, 1);

    const finalStableContents = firstDescendantWithClass(cardPanel, 'PokerCardContents');
    const finalStableText = collectPanelTexts(finalStableContents, []).join('|');
    assert(!hasClass(cardPanel, 'FlipActive'), 'face-to-back card flip should remove FlipActive after scheduled completion');
    assert(finalStableContents, 'face-to-back card flip should keep stable PokerCardContents after scheduled completion');
    assert(!hasClass(finalStableContents, 'FlipHidden'), 'face-to-back card flip should reveal stable PokerCardContents after scheduled completion');
    assertEqual(finalStableText, '?|?', `face-to-back card flip stable contents should show the question/back face after scheduled completion: ${finalStableText || '<empty>'}`);
    assertEqual(findDescendantsWithClass(cardPanel, 'PokerCardFlipLayer', []).length, 0, 'face-to-back card flip should remove all flip layers after scheduled completion');

    const unchangedHost = runtime.panels.createPanel('Panel', runtime.panels.root, '', 'PokerCardUnchangedWriteHost');
    const unchangedFace = card('Q', 'S');
    const unchangedPanel = cardPresenter.render(unchangedHost, unchangedFace, false);
    cardPresenter.update(unchangedPanel, unchangedFace, false);
    clearDomWrites(runtime);
    cardPresenter.update(unchangedPanel, unchangedFace, false);
    const unchangedSrcWrites = takeDomWrites(runtime).filter((write) => write && (write.type === 'image-src' || (write.type === 'attr' && write.name === 'src')));
    assertEqual(unchangedSrcWrites.length, 0, 'unchanged face-card update should not rewrite image src or src attributes');
  }
  if (modules.CommandReducer) {
    const decodedResumeStart = modules.CommandReducer.decode({ sender: 'Abrams', message: 'poker resume r123 hand 2 leader hantu%20raya roster abrams~Abrams|hantu%20raya~Hantu%20Raya seed sresume' });
    assertEqual(decodedResumeStart.type, 'resume-start', 'command reducer should decode resume-start records once');
    assertEqual(decodedResumeStart.id, 'r123', 'command reducer resume-start decode should expose id');
    assertEqual(decodedResumeStart.handNumber, 2, 'command reducer resume-start decode should expose hand number');
    assertEqual(decodedResumeStart.leaderKey, 'hantu raya', 'command reducer resume-start decode should normalize decoded leader key');
    assertEqual(decodedResumeStart.rosterText, 'abrams~Abrams|hantu%20raya~Hantu%20Raya', 'command reducer resume-start decode should expose raw roster token');
    assertEqual(decodedResumeStart.seed, 'sresume', 'command reducer resume-start decode should expose seed');
    assertEqual(decodedResumeStart.hasRosterMarker, true, 'legacy received resume rows should retain their roster marker');
    const decodedParty = modules.CommandReducer.decode({ sender: 'Abrams', message: '[party join] poker party p123' });
    assertEqual(decodedParty.type, 'party-join', 'command reducer should decode party join records');
    assertEqual(decodedParty.family, 'party', 'party join decode should expose party family');
    assertEqual(decodedParty.partyId, 'p123', 'party join decode should expose party id');
    const decodedMatchEnd = modules.CommandReducer.decode({ sender: 'Abrams', message: '[match end] poker party p123 seed smatch hand 7' });
    assertEqual(decodedMatchEnd.type, 'match-end', 'command reducer should decode match-end records');
    assertEqual(decodedMatchEnd.family, 'match', 'match-end decode should expose match family');
    assertEqual(decodedMatchEnd.partyId, 'p123', 'match-end decode should expose party id');
    assertEqual(decodedMatchEnd.seed, 'smatch', 'match-end decode should expose seed');
    assertEqual(decodedMatchEnd.handNumber, 7, 'match-end decode should expose hand number');
    const decodedProgressOffer = modules.CommandReducer.decode({ sender: 'Abrams', message: '[progress offer] poker progress r123 deadbeef 3' });
    assertEqual(decodedProgressOffer.type, 'progress-offer', 'command reducer should decode progress offers');
    assertEqual(decodedProgressOffer.family, 'progress', 'progress offer decode should expose progress family');
    assertEqual(decodedProgressOffer.id, 'r123', 'progress offer decode should expose id');
    assertEqual(decodedProgressOffer.checksum, 'deadbeef', 'progress offer decode should expose checksum');
    assertEqual(decodedProgressOffer.count, 3, 'progress offer decode should expose chunk count');
    const decodedProgressChunk = modules.CommandReducer.decode({ sender: 'Abrams', message: '[progress chunk] poker progress r123 deadbeef 2/3 Ab-_9' });
    assertEqual(decodedProgressChunk.type, 'progress-chunk', 'command reducer should decode progress chunks');
    assertEqual(decodedProgressChunk.index, 2, 'progress chunk decode should expose chunk index');
    assertEqual(decodedProgressChunk.count, 3, 'progress chunk decode should expose chunk count');
    assertEqual(decodedProgressChunk.chunk, 'Ab-_9', 'progress chunk decode should preserve chunk payload');
    const decodedResumeLeader = modules.CommandReducer.decode({ sender: 'Abrams', message: '[resume leader] poker resume r123' });
    assertEqual(decodedResumeLeader.type, 'resume-leader', 'command reducer should decode resume leader records');
    assertEqual(decodedResumeLeader.family, 'resume', 'resume leader decode should expose resume family');
    assertEqual(decodedResumeLeader.id, 'r123', 'resume leader decode should expose id');
    const decodedResumeReady = modules.CommandReducer.decode({ sender: 'Abrams', message: '[resume ready] poker resume r123' });
    assertEqual(decodedResumeReady.type, 'resume-ready', 'command reducer should decode resume ready records');
    assertEqual(decodedResumeReady.id, 'r123', 'resume ready decode should expose id');

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

    const effectCases = [
      {
        name: 'ignored',
        record: { sender: 'Abrams', message: 'ordinary team chat' },
        expected: { consumed: false, readyChanged: false, render: false, status: '', debugReason: 'ignored' },
      },
      {
        name: 'changed',
        record: { sender: 'Abrams', message: '[progress offer] poker progress r-effect deadbeef 3' },
        expected: { consumed: true, readyChanged: false, render: true, status: 'Receiving progress r-effect (0/3 chunks).', debugReason: 'progress-offer' },
      },
      {
        name: 'rejected',
        record: { sender: 'Abrams', message: 'poker start ssync hand 1 roster bad%zz~Abrams' },
        expected: { consumed: true, readyChanged: false, render: false, status: 'Invalid synced poker roster.', debugReason: 'status' },
      },
    ];
    const effectKeys = ['consumed', 'debugReason', 'readyChanged', 'render', 'status'];
    function assertEffectShape(effect, expected, message) {
      assert(effect && typeof effect === 'object', `${message} should return an effect object`);
      assertEqual(JSON.stringify(Object.keys(effect || {}).sort()), JSON.stringify(effectKeys), `${message} should expose exactly the reducer effect keys`);
      for (const key of effectKeys) assertEqual(effect && effect[key], expected[key], `${message} ${key}`);
    }
    for (const effectCase of effectCases) {
      for (const api of ['apply', 'applyRecord', 'applyPayload']) {
        const isolated = createMenuRuntime();
        const isolatedReducer = isolated.hooks && isolated.hooks.modules && isolated.hooks.modules.CommandReducer;
        if (!isolatedReducer) continue;
        let effect = null;
        if (api === 'apply') effect = isolatedReducer.apply(isolatedReducer.decode(effectCase.record));
        else if (api === 'applyRecord') effect = isolatedReducer.applyRecord(effectCase.record);
        else effect = isolatedReducer.applyPayload({ event: 'PokerChatMessage', seq: 1, ...effectCase.record });
        assertEffectShape(effect, effectCase.expected, `command reducer ${api} ${effectCase.name} effect`);
        if (api === 'applyPayload' && effectCase.name === 'changed') {
          const metrics = isolatedReducer && isolated.hooks.modules.PokerMetrics.snapshot();
          assertEqual(metrics.counters.renderRequest, 1, 'command reducer applyPayload changed effect should request one render');
          assertEqual(panelText(findPanel(isolated.runtime, 'PokerStatusLabel')), effectCase.expected.status, 'command reducer applyPayload changed effect should write status once');
        }
      }
    }
    const actionEffectRuntime = createGameRuntime(['Abrams', 'Bebop'], 'effect-action');
    if (actionEffectRuntime.hooks && actionEffectRuntime.hooks.modules && actionEffectRuntime.hooks.modules.CommandReducer && actionEffectRuntime.game) {
      const actionReducer = actionEffectRuntime.hooks.modules.CommandReducer;
      const actionActor = currentPlayer(actionEffectRuntime.game);
      actionEffectRuntime.hooks.modules.PokerMetrics.reset();
      const actionEffect = actionEffectRuntime.hooks.processChatRecord({ sender: actionActor.name, message: 'fold', isSelf: true });
      assertEffectShape(
        actionEffect,
        { consumed: true, readyChanged: false, render: true, status: actionEffect.status, debugReason: 'action' },
        'command reducer action changed effect',
      );
      assert(actionEffect.status.includes('wins by fold'), `command reducer action changed effect should report the fold result: ${actionEffect.status || '<empty>'}`);
      const actionMetrics = actionEffectRuntime.hooks.modules.PokerMetrics.snapshot();
      assertEqual(actionMetrics.counters.renderRequest, 1, 'command reducer action changed effect should request one render');
      assertEqual(actionMetrics.counters.renderRequestCoalesced || 0, 0, 'command reducer action changed effect should not coalesce a duplicate render');
      assertEqual(
        panelText(findPanel(actionEffectRuntime.runtime, 'PokerStatusLabel')),
        actionEffect.status,
        'command reducer action changed effect should write status once',
      );
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
      hooks.buildResumeStartCommand('r123', 'abrams', 2, 'sresume'),
      'poker resume r123 hand 2 leader abrams seed sresume',
      'resume start command builder should use the chat-safe marker order',
    );
    assertEqual(hooks.buildResumeStartCommand('r123', 'abrams', 2, 'sresume').includes(' roster '), false, 'compact resume-start builder must omit roster marker');
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
      'poker start ssync hand 1 roster abrams|bebop',
      'synchronized start builder should use compact key-only roster entries to stay chat-safe',
    );
    assertEqual(
      hooks.buildSynchronizedStartCommand('ssync-space-key', [
        { key: 'jdbeast', name: 'JDBeast' },
        { key: 'hantu raya', name: 'Hantu Raya' },
      ]),
      'poker start ssync-space-key hand 1 roster jdbeast|hantu%20raya',
      'synchronized start builder should URI-escape compact key-only roster entries',
    );
    const liveLogCompactRoster = [
      { key: 'citadel_ability_psychic_lift', name: 'citadel_ability_psychic_lift' },
      { key: 'hantu raya', name: 'Hantu Raya' },
    ];
    const liveLogCompactStartCommand = hooks.buildSynchronizedStartCommand('s', liveLogCompactRoster, 1);
    assertEqual(
      liveLogCompactStartCommand,
      'poker start s hand 1 roster citadel_ability_psychic_lift|hantu%20raya',
      'compact synced roster start command should use key-only entries when a long key duplicates its display name',
    );
    assert(
      liveLogCompactStartCommand.length <= MAX_SYNCED_START_CHAT_COMMAND_LENGTH,
      `compact synced roster start command should stay chat-safe at ${MAX_SYNCED_START_CHAT_COMMAND_LENGTH} chars to avoid live-log truncation: ${liveLogCompactStartCommand.length} chars, ${liveLogCompactStartCommand}`,
    );
    assert(
      !liveLogCompactStartCommand.includes('~citadel_ability_psychic_lift'),
      `compact synced roster start command should omit duplicate long key/name text to avoid live-log truncation: ${liveLogCompactStartCommand}`,
    );
    if (modules.CommandReducer) {
      const decodedLiveLogCompactStart = modules.CommandReducer.decode({
        sender: 'citadel_ability_psychic_lift',
        message: liveLogCompactStartCommand,
      });
      assertEqual(decodedLiveLogCompactStart.type, 'start', 'compact synced roster start command should decode as a start record');
      assertEqual((decodedLiveLogCompactStart.roster || []).length, 2, 'compact synced roster start command should decode two roster entries');
      assertEqual(
        JSON.stringify((decodedLiveLogCompactStart.roster || []).map((entry) => entry.key)),
        JSON.stringify(['citadel_ability_psychic_lift', 'hantu raya']),
        'compact synced roster start command should preserve roster keys through CommandReducer.decode',
      );
    }
    const liveLogCompactRuntime = createMenuRuntime();
    if (liveLogCompactRuntime.hooks && hasPartySyncHooks(liveLogCompactRuntime.hooks, 'live-log compact synced roster runtime')) {
      const liveLogHooks = liveLogCompactRuntime.hooks;
      liveLogHooks.processChatRecord({ sender: 'citadel_ability_psychic_lift', message: '[party leader] poker party plive-log-compact', isSelf: true });
      liveLogHooks.processChatRecord({ sender: 'Hantu Raya', message: '[party join] poker party plive-log-compact', isSelf: false });
      const liveLogStatusBeforeStart = panelText(findPanel(liveLogCompactRuntime.runtime, 'PokerStatusLabel'));
      const liveLogMessagesBeforeStart = liveLogCompactRuntime.runtime.messages.length;
      liveLogHooks.processChatRecord({
        sender: 'citadel_ability_psychic_lift',
        message: liveLogCompactStartCommand,
        isSelf: true,
      });
      const liveLogCompactDiagnostics = [
        panelText(findPanel(liveLogCompactRuntime.runtime, 'PokerStatusLabel')) !== liveLogStatusBeforeStart
          ? panelText(findPanel(liveLogCompactRuntime.runtime, 'PokerStatusLabel'))
          : '',
      ]
        .concat(liveLogCompactRuntime.runtime.messages.slice(liveLogMessagesBeforeStart))
        .join('\n')
        .toLowerCase();
      assert(
        !liveLogCompactDiagnostics.includes('invalid synced poker roster'),
        `compact synced roster start command should not surface Invalid synced poker roster after real start apply: ${liveLogCompactDiagnostics || '<empty>'}`,
      );
      assert(liveLogHooks.state.game, 'compact synced roster start command should create a game through the real start path');
      if (liveLogHooks.state.game) {
        assertEqual(liveLogHooks.state.game.players.length, 2, 'compact synced roster start command should seat both live-log roster players');
      }
    }
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
      JSON.stringify(hooks.modules.PartyReducer.roster()),
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
      leaderTwoHooks.state.requiresProgressImport = true;
      leaderTwoHooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(leaderTwoButtonRuntime.runtime, '', false, true, 'party leader import-required start button state');
      assertProgressImportAvailable(leaderTwoButtonRuntime.runtime, 'party leader import-required import controls');
      leaderTwoHooks.state.requiresProgressImport = false;
      leaderTwoHooks.modules.TableRenderer.renderGame();
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

        for (const resumeSender of ['Abrams', '<unknown>']) {
          const hostedResumeRuntime = createMenuRuntime();
          if (hostedResumeRuntime.hooks) {
            hostedResumeRuntime.hooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party pprogress-replay', isSelf: true });
            hostedResumeRuntime.hooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party pprogress-replay', isSelf: false });
            for (const message of progressMessages) {
              hostedResumeRuntime.hooks.processChatRecord({ sender: 'Abrams', channel: '[Party]', message, isSelf: false });
            }
            assertEqual(hostedResumeRuntime.hooks.state.resume.id, progressReplaySource.id, `hosted shared progress should import before ${resumeSender} resume start`);
            const resumeStart = hostedResumeRuntime.hooks.buildResumeStartCommand(progressReplaySource.id, 'abrams', progressReplaySource.payload.nextHandNumber, 'sresume-replay');
            assert(
              resumeStart.length <= MAX_SYNCED_START_CHAT_COMMAND_LENGTH && resumeStart.indexOf(' roster ') < 0,
              `hosted resume start should stay chat-safe without a roster marker (${resumeStart.length}/${MAX_SYNCED_START_CHAT_COMMAND_LENGTH}): ${resumeStart}`,
            );
            hostedResumeRuntime.hooks.processChatRecord({ sender: resumeSender, message: resumeStart, isSelf: false });
            const resumedGame = hostedResumeRuntime.hooks.state.game;
            assert(resumedGame && resumedGame.importedResume, `hosted shared progress ${resumeSender} resume start should create an imported game`);
            if (resumedGame && resumedGame.players) {
              assertEqual(resumedGame.handNumber, progressReplaySource.payload.nextHandNumber, `hosted shared progress ${resumeSender} resume should use the saved next hand number`);
              for (const player of resumedGame.players) {
                const savedBankroll = progressReplaySource.payload.bankrolls[player.key];
                assertEqual(
                  player.stack + player.committed,
                  savedBankroll,
                  `hosted shared progress ${resumeSender} resume should preserve ${player.name}'s bankroll before automatic blinds`,
                );
              }
            }
          }
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

    const stableLobbyRuntime = createMenuRuntime();
    if (stableLobbyRuntime.hooks) {
      stableLobbyRuntime.hooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party plobby-stable', isSelf: true });
      stableLobbyRuntime.hooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party plobby-stable', isSelf: false });
      stableLobbyRuntime.hooks.modules.TableRenderer.renderGame();
      clearDomWrites(stableLobbyRuntime.runtime);
      stableLobbyRuntime.hooks.modules.TableRenderer.renderGame();
      const writes = summarizeDomWrites(takeDomWrites(stableLobbyRuntime.runtime));
      assertEqual(actionButtonPanels(stableLobbyRuntime.runtime).length, 0, 'stable lobby render should not show action buttons');
      assertEqual(tableSeatRows(stableLobbyRuntime.runtime).length, 0, 'stable lobby render should not show table seats');
      assertPanelVisible(stableLobbyRuntime.runtime, 'PokerLeaveLobbyButton', 'stable lobby repeated render');
      assertEqual(JSON.stringify(playerListNames(stableLobbyRuntime.runtime)), JSON.stringify(['Abrams', 'Bebop']), 'stable lobby repeated render should keep player-list names');
      assertEqual(writes.create, 0, 'stable lobby repeated render should not create panels');
      assertEqual(writes.delete, 0, 'stable lobby repeated render should not delete panels');
      assertEqual(writes.deleteChildren, 0, 'stable lobby repeated render should not clear child lists');
      assertEqual(writes.class, 0, 'stable lobby repeated render should not change classes');
      assertEqual(writes.text, 0, 'stable lobby repeated render should not change text');
      assertEqual(writes.hittest, 0, 'stable lobby repeated render should not change hittest');
      assertEqual(writes.event, 0, 'stable lobby repeated render should not rebind events');
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
      localLeaveRuntime.hooks.state.requiresProgressImport = true;
      localLeaveRuntime.hooks.state.resume = { id: 'rleave-local', ready: {}, order: [], payload: { roster: [] } };
      localLeaveRuntime.runtime.sandbox.PokerEscapeMenuLeaveLobby();
      assertEqual(localLeaveRuntime.hooks.state.party.id, '', 'local leave command should clear local party state');
      assertEqual(localLeaveRuntime.hooks.state.game, null, 'local leave command should clear local active game state');
      assertEqual(localLeaveRuntime.hooks.state.requiresProgressImport, false, 'local leave command should clear imported-progress start guard');
      assertEqual(!!(localLeaveRuntime.hooks.state.resume && localLeaveRuntime.hooks.state.resume.id), false, 'local leave command should clear resume state');
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

    const activeLeaderLeaveRuntime = createGameRuntime(['Abrams', 'Bebop'], 'sleaderleavebutton');
    if (activeLeaderLeaveRuntime.hooks && activeLeaderLeaveRuntime.game) {
      const activeLeaderLeaveButton = findPanel(activeLeaderLeaveRuntime.runtime, 'PokerLeaveLobbyButton');
      const activeLeaderChatTarget = findPanel(activeLeaderLeaveRuntime.runtime, 'ChatTargetLabel');
      if (activeLeaderChatTarget) activeLeaderChatTarget.text = 'TEAM';
      activeLeaderLeaveRuntime.hooks.modules.TableRenderer.renderGame();
      assertButtonAffordance(activeLeaderLeaveRuntime.runtime, 'PokerLeaveLobbyButton', { hidden: false, enabled: true }, 'active leader leave-lobby button path');
      assertHookFunction(activeLeaderLeaveRuntime.runtime.sandbox, 'PokerEscapeMenuLeaveLobby', 'active leader leave-lobby button path hook');
      const activeLeaderLeaveDispatchStart = activeLeaderLeaveRuntime.runtime.dispatches.length;
      activeLeaderLeaveRuntime.runtime.sandbox.PokerEscapeMenuLeaveLobby();
      drainScheduledCallbacks(activeLeaderLeaveRuntime.runtime, 256);
      const activeLeaderLeaveMessages = submittedChatMessages(activeLeaderLeaveRuntime.runtime, activeLeaderLeaveDispatchStart);
      assert(
        activeLeaderLeaveMessages.some((message) => /^\[match end\] poker party pgame-ready seed .+ hand 1$/.test(message)),
        `active leader leave-lobby button should send authenticated match-end before leaving: ${activeLeaderLeaveMessages.join('|') || '<none>'}`,
      );
      assert(
        activeLeaderLeaveMessages.includes('[party leave] poker party pgame-ready'),
        `active leader leave-lobby button should still send party leave: ${activeLeaderLeaveMessages.join('|') || '<none>'}`,
      );
      assertEqual(activeLeaderLeaveRuntime.hooks.state.party.id, '', 'active leader leave-lobby button should clear local party state');
      assertEqual(activeLeaderLeaveRuntime.hooks.state.game, null, 'active leader leave-lobby button should clear local active game state');

      const memberLeaveReplayRoster = [
        { key: 'abrams', name: 'Abrams' },
        { key: 'bebop', name: 'Bebop' },
      ];
      const memberLeaveReplay = createSyncedJoinedPartyRuntime('Bebop', 'smemberleavereplay', memberLeaveReplayRoster, 1, 'pmember-leave-replay');
      if (memberLeaveReplay.hooks && memberLeaveReplay.game) {
        memberLeaveReplay.runtime.config.PokerLocalPlayerKey = 'bebop';
        memberLeaveReplay.runtime.config.PokerLocalPlayerName = 'Bebop';
        const replayPartyId = memberLeaveReplay.hooks.state.party.id;
        const replaySeed = memberLeaveReplay.game.seed;
        memberLeaveReplay.hooks.processChatRecord({
          sender: '<unknown>',
          message: 'fold',
          isSelf: false,
        });
        assert(
          memberLeaveReplay.hooks.state.game && memberLeaveReplay.hooks.state.game.finished && !memberLeaveReplay.hooks.state.game.active,
          'member replay setup should finish the two-player hand before the leader leave rows arrive',
        );
        memberLeaveReplay.hooks.processChatRecord({
          sender: '<unknown>',
          message: `[match end] poker party ${replayPartyId} seed ${replaySeed} hand ${memberLeaveReplay.game.handNumber}`,
          isSelf: false,
        });
        assertEqual(memberLeaveReplay.hooks.state.game, null, 'member replay setup should clear active game from authenticated unknown match-end');
        assertEqual(memberLeaveReplay.hooks.state.party.id, replayPartyId, 'member replay setup should preserve party until the following leave row');
        memberLeaveReplay.hooks.processChatRecord({
          sender: '<unknown>',
          message: `[party leave] poker party ${replayPartyId}`,
          isSelf: false,
        });
        assertEqual(memberLeaveReplay.hooks.state.party.id, '', 'member replay should clear stale party after authenticated match-end followed by unknown leader leave');
        assertEqual(memberLeaveReplay.hooks.state.game, null, 'member replay should stay out of the active hand after unknown leader leave');
      }
    }

    const twoPlayerHostLeaveRuntime = createMenuRuntime();
    if (twoPlayerHostLeaveRuntime.hooks && hasPartySyncHooks(twoPlayerHostLeaveRuntime.hooks, 'two-player hosted-lobby host leave regression hooks')) {
      const twoPlayerHostLeaveHooks = twoPlayerHostLeaveRuntime.hooks;
      const twoPlayerHostLeavePartyId = 'phost-leave-two';
      twoPlayerHostLeaveHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party ' + twoPlayerHostLeavePartyId, isSelf: false });
      twoPlayerHostLeaveHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party ' + twoPlayerHostLeavePartyId, isSelf: true });
      twoPlayerHostLeaveHooks.modules.TableRenderer.renderGame();
      assertEqual(twoPlayerHostLeaveHooks.state.party.id, twoPlayerHostLeavePartyId, 'two-player hosted-lobby host leave setup should join Bebop to Abrams lobby');
      assertEqual(twoPlayerHostLeaveHooks.state.party.mode, 'member', 'two-player hosted-lobby host leave setup should mark Bebop as a member');
      assertPanelVisible(twoPlayerHostLeaveRuntime.runtime, 'PokerLeaveLobbyButton', 'two-player hosted-lobby host leave setup');
      twoPlayerHostLeaveHooks.processChatRecord({ sender: 'Abrams', message: '[party leave] poker party ' + twoPlayerHostLeavePartyId, isSelf: false });
      assertEqual(twoPlayerHostLeaveHooks.state.game, null, 'two-player hosted-lobby host leave should leave Bebop with no active game');
      assertEqual(twoPlayerHostLeaveHooks.state.party.id, '', 'two-player hosted-lobby host leave should clear Bebop party id instead of keeping the stale host lobby');
      assertEqual(twoPlayerHostLeaveHooks.state.party.mode, 'none', 'two-player hosted-lobby host leave should return Bebop to non-party mode');
      assertEqual(twoPlayerHostLeaveHooks.state.party.leaderKey, '', 'two-player hosted-lobby host leave should clear stale Abrams leader key');
      assertEqual(twoPlayerHostLeaveHooks.modules.PartyReducer.roster().length, 0, 'two-player hosted-lobby host leave should leave no stale Abrams roster entry');
      assert(
        !twoPlayerHostLeaveHooks.state.party.members.abrams,
        'two-player hosted-lobby host leave should remove Abrams from local party members',
      );
      twoPlayerHostLeaveHooks.modules.TableRenderer.renderGame();
      assertPanelHidden(twoPlayerHostLeaveRuntime.runtime, 'PokerLeaveLobbyButton', 'two-player hosted-lobby host leave reset');
    }

    const threePlayerHostLeaveRuntime = createMenuRuntime();
    if (threePlayerHostLeaveRuntime.hooks && hasPartySyncHooks(threePlayerHostLeaveRuntime.hooks, 'three-player hosted-lobby host transfer regression hooks')) {
      const threePlayerHostLeaveHooks = threePlayerHostLeaveRuntime.hooks;
      const threePlayerHostLeavePartyId = 'phost-leave-three';
      threePlayerHostLeaveHooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party ' + threePlayerHostLeavePartyId, isSelf: false });
      threePlayerHostLeaveHooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party ' + threePlayerHostLeavePartyId, isSelf: true });
      threePlayerHostLeaveHooks.processChatRecord({ sender: 'Dynamo', message: '[party join] poker party ' + threePlayerHostLeavePartyId, isSelf: false });
      assertEqual(
        JSON.stringify(threePlayerHostLeaveHooks.modules.PartyReducer.roster().map((member) => member.key)),
        JSON.stringify(['abrams', 'bebop', 'dynamo']),
        'three-player hosted-lobby host transfer setup should preserve join order before Abrams leaves',
      );
      threePlayerHostLeaveHooks.processChatRecord({ sender: 'Abrams', message: '[party leave] poker party ' + threePlayerHostLeavePartyId, isSelf: false });
      assertEqual(threePlayerHostLeaveHooks.state.party.id, threePlayerHostLeavePartyId, 'three-player hosted-lobby host transfer should keep the lobby id');
      assertEqual(threePlayerHostLeaveHooks.state.party.mode, 'leader', 'three-player hosted-lobby host transfer should promote local Bebop to leader mode');
      assertEqual(threePlayerHostLeaveHooks.state.party.leaderKey, 'bebop', 'three-player hosted-lobby host transfer should promote Bebop to leader');
      assertEqual(threePlayerHostLeaveHooks.state.party.leaderName, 'Bebop', 'three-player hosted-lobby host transfer should preserve Bebop leader name');
      assertEqual(
        JSON.stringify(threePlayerHostLeaveHooks.state.party.order),
        JSON.stringify(['bebop', 'dynamo']),
        'three-player hosted-lobby host transfer should remove Abrams from member order while preserving Bebop and Dynamo',
      );
      assertEqual(
        JSON.stringify(threePlayerHostLeaveHooks.modules.PartyReducer.roster()),
        JSON.stringify([
          { key: 'bebop', name: 'Bebop' },
          { key: 'dynamo', name: 'Dynamo' },
        ]),
        'three-player hosted-lobby host transfer should preserve only Bebop and Dynamo in roster order',
      );
      assert(
        !threePlayerHostLeaveHooks.state.party.members.abrams,
        'three-player hosted-lobby host transfer should remove Abrams from local party members',
      );
      threePlayerHostLeaveHooks.modules.TableRenderer.renderGame();
      assertPanelVisible(threePlayerHostLeaveRuntime.runtime, 'PokerLeaveLobbyButton', 'three-player hosted-lobby host transfer');
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
      drainScheduledCallbacks(staleReadyRuntime.runtime, 64);
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
      drainScheduledCallbacks(staleReadyRuntime.runtime, 64);
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
      ['CALL $100', 'RAISE', 'FOLD'],
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
    assertEnabledActionButtons(runtime, ['CALL', 'RAISE', 'FOLD'], 'active local actor');
    assertRaiseFacingActionButtonContract(runtime, 'active local actor raise-facing controls');
    assertCustomRaiseAmountControlContract(runtime, hooks.getMinimumRaiseTo(game), 'active local actor raise-facing controls');
    assertIllegalCustomRaiseAmountMarksInvalid(runtime, hooks.getMinimumRaiseTo(game) - 1, 'active local actor raise-facing controls');

    const raiseControlRuntime = createGameRuntime(['Abrams', 'Bebop', 'Calico'], 'custom-raise-submit');
    if (raiseControlRuntime.hooks && raiseControlRuntime.game) {
      const raiseControlGame = raiseControlRuntime.game;
      const raiseControlActor = currentPlayer(raiseControlGame);
      raiseControlRuntime.hooks.state.localPlayerKey = raiseControlActor.key;
      raiseControlRuntime.runtime.config.PokerLocalPlayerKey = raiseControlActor.key;
      raiseControlRuntime.runtime.config.PokerLocalPlayerName = raiseControlActor.name;
      raiseControlRuntime.hooks.modules.TableRenderer.renderGame();
      const raiseControl = findEditableCustomRaiseControl(raiseControlRuntime.runtime);
      const raiseButton = renderedActionButtons(raiseControlRuntime.runtime).find((button) => actionButtonSemantic(button.label) === 'RAISE');
      const raiseAmount = raiseControlRuntime.hooks.getMinimumRaiseTo(raiseControlGame);
      const raiseChatTarget = findPanel(raiseControlRuntime.runtime, 'ChatTargetLabel');
      if (raiseChatTarget) raiseChatTarget.text = 'TEAM';
      if (raiseControl) raiseControl.text = String(raiseAmount);
      const raiseDispatchStart = raiseControlRuntime.runtime.dispatches.length;
      assert(raiseButton && typeof raiseButton.panel.onactivate === 'function', 'active local actor custom raise controls should bind RAISE button activation');
      if (raiseButton && typeof raiseButton.panel.onactivate === 'function') raiseButton.panel.onactivate();
      drainScheduledCallbacks(raiseControlRuntime.runtime, 256);
      const raiseMessages = submittedChatMessages(raiseControlRuntime.runtime, raiseDispatchStart);
      assert(
        raiseMessages.includes(`raise $${raiseAmount}`),
        `active local actor custom raise controls should submit raise $${raiseAmount}: ${raiseMessages.join('|') || '<none>'}`,
      );
    }

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
    hooks.state.localPlayerKey = currentPlayer(game).name.toLowerCase().replace(/\s+/g, ' ').trim();
    runtime.config.PokerLocalPlayerKey = hooks.state.localPlayerKey;
    runtime.config.PokerLocalPlayerName = currentPlayer(game).name;
    hooks.modules.TableRenderer.renderGame();
    const openingBetButtons = renderedActionButtons(runtime);
    assertEqual(
      JSON.stringify(openingBetButtons.map((button) => actionButtonSemantic(button.label))),
      JSON.stringify(['CHECK', 'BET', 'FOLD']),
      'opening-action custom bet controls should render CHECK, BET, FOLD semantic buttons in order',
    );
    assertCustomRaiseAmountControlContract(runtime, hooks.getMinimumRaiseTo(game), 'opening-action custom bet controls');
    const betControl = findEditableCustomRaiseControl(runtime);
    const betButton = openingBetButtons.find((button) => actionButtonSemantic(button.label) === 'BET');
    const betAmount = hooks.getMinimumRaiseTo(game);
    const betChatTarget = findPanel(runtime, 'ChatTargetLabel');
    if (betChatTarget) betChatTarget.text = 'TEAM';
    if (betControl) betControl.text = String(betAmount);
    const betDispatchStart = runtime.dispatches.length;
    assert(betButton && typeof betButton.panel.onactivate === 'function', 'opening-action custom bet controls should bind BET button activation');
    if (betButton && typeof betButton.panel.onactivate === 'function') betButton.panel.onactivate();
    drainScheduledCallbacks(runtime, 256);
    const openingBetMessages = submittedChatMessages(runtime, betDispatchStart);
    assert(
      openingBetMessages.includes(`bet $${betAmount}`),
      `opening-action custom bet controls should submit bet $${betAmount} instead of custom-bet: ${openingBetMessages.join('|') || '<none>'}`,
    );
    assertIllegalCustomRaiseAmountMarksInvalid(runtime, betAmount - 1, 'opening-action custom bet controls');

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
    assertPotWinnerFeedback(runtime, [bettor.name], 'fold win');

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
        ['CALL $200', 'RAISE', 'FOLD'],
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
        ['CHECK', 'RAISE', 'FOLD'],
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
        ['Flop dealt', secondFlopActor.name, 'to act', 'check', 'bet $400-$9400'],
        'second hand flop prompt',
      );
      assertAnnouncerOmits(runtime, ['bet $200', 'bet $500'], 'second hand flop prompt');
      assertActiveGameControls(
        runtime,
        secondFlopActor.name,
        secondGame.phase,
        ['CHECK', 'BET', 'FOLD'],
        ['BET $200', 'BET $500', 'RAISE'],
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
    assertEqual(syncedAbrams.startCommand, 'poker start ssync hand 1 roster abrams|bebop', 'synced runtime should use compact key-only roster entries in the start command');
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
      ['CALL $100', 'RAISE', 'FOLD'],
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

    syncedAbrams.hooks.state.requiresProgressImport = true;
    syncedAbrams.hooks.state.resume = { id: 'rend-match', ready: {}, order: [], payload: { roster: [] } };
    assertHookFunction(syncedAbrams.runtime.sandbox, 'PokerEscapeMenuEndMatch', 'global ESC menu end-match hook');
    syncedAbrams.runtime.sandbox.PokerEscapeMenuEndMatch();
    assertEqual(syncedAbrams.hooks.state.game, null, 'end-match hook should clear the synced hand state');
    assertEqual(syncedAbrams.hooks.state.requiresProgressImport, false, 'end-match hook should clear imported-progress start guard');
    assertEqual(!!(syncedAbrams.hooks.state.resume && syncedAbrams.hooks.state.resume.id), false, 'end-match hook should clear resume state');
    assertNoGamePlayerRail(syncedAbrams.runtime, 'end-match render');
    assertEqual(pokerLogLines(syncedAbrams.runtime).length, 0, 'end-match render should clear stale visible log rows');
  }

  const duplicateJoinRuntime = createMenuRuntime();
  if (duplicateJoinRuntime.hooks) {
    duplicateJoinRuntime.hooks.processChatRecord({ sender: 'Abrams', message: '[party leader] poker party pduplicate-join', isSelf: true });
    duplicateJoinRuntime.hooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party pduplicate-join', isSelf: false });
    duplicateJoinRuntime.hooks.processChatRecord({ sender: 'Bebop', message: '[party join] poker party pduplicate-join', isSelf: false });
    duplicateJoinRuntime.hooks.modules.TableRenderer.renderGame();
    const duplicateParty = duplicateJoinRuntime.hooks.state.party || {};
    assertEqual(Object.keys(duplicateParty.members || {}).filter((key) => key === 'bebop').length, 1, 'duplicate party join should leave one Bebop party member');
    assertEqual((duplicateParty.order || []).filter((key) => key === 'bebop').length, 1, 'duplicate party join should leave one Bebop party order entry');
    assertEqual(JSON.stringify(playerListNames(duplicateJoinRuntime.runtime)), JSON.stringify(['Abrams', 'Bebop']), 'duplicate party join render should keep one player row per party member');
    assertEqual(countRendered(duplicateJoinRuntime.runtime).playerRows, 2, 'duplicate party join render should not duplicate player rows');
  }

  const wrongPartyLeaveRuntime = createSyncedPartyRuntime('Abrams', 'swrong-party-leave', syncedRoster, 1);
  if (wrongPartyLeaveRuntime.hooks && wrongPartyLeaveRuntime.game) {
    const wrongPartyBefore = JSON.stringify({
      partyId: wrongPartyLeaveRuntime.hooks.state.party && wrongPartyLeaveRuntime.hooks.state.party.id,
      partyOrder: wrongPartyLeaveRuntime.hooks.state.party && wrongPartyLeaveRuntime.hooks.state.party.order,
      players: wrongPartyLeaveRuntime.game.players.map((player) => ({
        key: player.key,
        folded: !!player.folded,
        eliminated: !!player.eliminated,
        active: player.active !== false,
      })),
      active: wrongPartyLeaveRuntime.game.active,
      finished: wrongPartyLeaveRuntime.game.finished,
      currentIndex: wrongPartyLeaveRuntime.game.currentIndex,
    });
    wrongPartyLeaveRuntime.hooks.processChatRecord({ sender: 'Bebop', message: '[party leave] poker party pnot-this-table', isSelf: false });
    wrongPartyLeaveRuntime.hooks.modules.TableRenderer.renderGame();
    const wrongPartyAfter = JSON.stringify({
      partyId: wrongPartyLeaveRuntime.hooks.state.party && wrongPartyLeaveRuntime.hooks.state.party.id,
      partyOrder: wrongPartyLeaveRuntime.hooks.state.party && wrongPartyLeaveRuntime.hooks.state.party.order,
      players: wrongPartyLeaveRuntime.game.players.map((player) => ({
        key: player.key,
        folded: !!player.folded,
        eliminated: !!player.eliminated,
        active: player.active !== false,
      })),
      active: wrongPartyLeaveRuntime.game.active,
      finished: wrongPartyLeaveRuntime.game.finished,
      currentIndex: wrongPartyLeaveRuntime.game.currentIndex,
    });
    assertEqual(wrongPartyAfter, wrongPartyBefore, 'known member leave for a different party id should not mutate current party or active game state');
    assertEqual(countRendered(wrongPartyLeaveRuntime.runtime).playerRows, 2, 'wrong-party leave render should keep the existing two player rows');
    assertEqual(countRendered(wrongPartyLeaveRuntime.runtime).tableSeats, 2, 'wrong-party leave render should keep the existing two table seats');
  }

  const duplicateSnapshotRuntime = createSyncedPartyRuntime('Abrams', 'sduplicate-open-snapshot', syncedRoster, 1);
  if (duplicateSnapshotRuntime.hooks && duplicateSnapshotRuntime.game) {
    const duplicateSnapshot = {
      event: 'PokerChatMessage',
      action: 'snapshot',
      reason: 'duplicate-open-snapshot',
      seq: 3,
      messages: [
        { seq: 1, sender: 'Abrams', message: '[party leader] poker party psync', isSelf: true },
        { seq: 2, sender: 'Bebop', message: '[party join] poker party psync', isSelf: false },
        { seq: 3, sender: 'Abrams', message: duplicateSnapshotRuntime.startCommand, isSelf: true },
      ],
    };
    duplicateSnapshotRuntime.runtime.sandbox.PokerEscapeMenuToggle();
    duplicateSnapshotRuntime.hooks.handleReadyEvent(JSON.stringify(duplicateSnapshot));
    drainScheduledCallbacks(duplicateSnapshotRuntime.runtime, 128);
    duplicateSnapshotRuntime.hooks.modules.TableRenderer.renderGame();
    const firstCounts = countRendered(duplicateSnapshotRuntime.runtime);
    assertEqual(firstCounts.playerRows, 2, 'open snapshot replay setup should render two player rows');
    assertEqual(firstCounts.tableSeats, 2, 'open snapshot replay setup should render two table seats');
    assertGreaterThan(firstCounts.actionButtons, 0, 'open snapshot replay setup should render active action buttons');
    duplicateSnapshotRuntime.runtime.sandbox.PokerEscapeMenuToggle();
    duplicateSnapshotRuntime.runtime.sandbox.PokerEscapeMenuToggle();
    duplicateSnapshotRuntime.hooks.handleReadyEvent(JSON.stringify(duplicateSnapshot));
    drainScheduledCallbacks(duplicateSnapshotRuntime.runtime, 128);
    duplicateSnapshotRuntime.hooks.modules.TableRenderer.renderGame();
    const secondCounts = countRendered(duplicateSnapshotRuntime.runtime);
    assertEqual(JSON.stringify(secondCounts), JSON.stringify(firstCounts), 'repeated open-time snapshot replay should not duplicate rendered action/player/table/log/hint/custom-bet/pot panels');
  }

  const tableRoster = [
    { key: 'abrams', name: 'Abrams' },
    { key: 'bebop', name: 'Bebop' },
    { key: 'calico', name: 'Calico' },
  ];

  const twoPlayerLeaderEndThenLeavePartyId = 'pleader-end-leave-two';
  const twoPlayerLeaderEndThenLeaveRuntime = createSyncedJoinedPartyRuntime('Bebop', 'stwo-leader-end-leave', syncedRoster, 1, twoPlayerLeaderEndThenLeavePartyId);
  if (twoPlayerLeaderEndThenLeaveRuntime.hooks && twoPlayerLeaderEndThenLeaveRuntime.game) {
    const endThenLeaveHooks = twoPlayerLeaderEndThenLeaveRuntime.hooks;
    assertEqual(endThenLeaveHooks.state.party.mode, 'member', 'two-player leader end-then-leave setup should make Bebop a joined member');
    assertEqual(endThenLeaveHooks.state.game.active, true, 'two-player leader end-then-leave setup should start an active hand');
    endThenLeaveHooks.processChatRecord({ sender: 'Abrams', message: `[match end] poker party ${twoPlayerLeaderEndThenLeavePartyId}`, isSelf: false });
    assertEqual(endThenLeaveHooks.state.game, null, 'leader match-end before party leave should clear the member active hand');
    endThenLeaveHooks.modules.TableRenderer.renderGame();
    assertNoGamePlayerRail(twoPlayerLeaderEndThenLeaveRuntime.runtime, 'leader match-end before party leave member lobby render');
    endThenLeaveHooks.processChatRecord({ sender: 'Abrams', message: `[party leave] poker party ${twoPlayerLeaderEndThenLeavePartyId}`, isSelf: false });
    assertEqual(endThenLeaveHooks.state.game, null, 'leader party leave after match-end should keep the member out of an active hand');
    assertEqual(endThenLeaveHooks.state.party.id, '', 'leader party leave after match-end should clear the member party id');
    assertEqual(endThenLeaveHooks.state.party.mode, 'none', 'leader party leave after match-end should return the member to non-party mode');
    assertEqual(endThenLeaveHooks.modules.PartyReducer.roster().length, 0, 'leader party leave after match-end should leave no stale two-player roster');
    endThenLeaveHooks.modules.TableRenderer.renderGame();
    assertNoGamePlayerRail(twoPlayerLeaderEndThenLeaveRuntime.runtime, 'leader match-end then party leave member lobby render');
    assertPanelHidden(twoPlayerLeaderEndThenLeaveRuntime.runtime, 'PokerLeaveLobbyButton', 'leader match-end then party leave member lobby render');
  }

  const twoPlayerUnknownMatchEndPartyId = 'pleader-unknown-match-end-two';
  const twoPlayerUnknownMatchEndRuntime = createSyncedJoinedPartyRuntime('Bebop', 'stwounknownmatchend', syncedRoster, 1, twoPlayerUnknownMatchEndPartyId);
  if (twoPlayerUnknownMatchEndRuntime.hooks && twoPlayerUnknownMatchEndRuntime.game) {
    const unknownMatchEndHooks = twoPlayerUnknownMatchEndRuntime.hooks;
    assertEqual(unknownMatchEndHooks.state.party.leaderKey, 'abrams', 'unknown match-end setup should know Abrams is party leader');
    assertEqual(unknownMatchEndHooks.state.game.active, true, 'unknown match-end setup should start an active hand');
    unknownMatchEndHooks.processChatRecord({ sender: '<unknown>', message: `[match end] poker party ${twoPlayerUnknownMatchEndPartyId} seed stwounknownmatchend hand 1`, isSelf: false });
    assertEqual(unknownMatchEndHooks.state.game, null, 'unknown match-end from the known current party leader with matching seed/hand should clear the member active hand');
    unknownMatchEndHooks.modules.TableRenderer.renderGame();
    assertNoGamePlayerRail(twoPlayerUnknownMatchEndRuntime.runtime, 'unknown match-end from known leader member lobby render');
  }

  const twoPlayerWrongUnknownMatchEndPartyId = 'pleader-wrong-unknown-match-end-two';
  const twoPlayerWrongUnknownMatchEndRuntime = createSyncedJoinedPartyRuntime('Bebop', 'stwo-wrong-unknown-match-end', syncedRoster, 1, twoPlayerWrongUnknownMatchEndPartyId);
  if (twoPlayerWrongUnknownMatchEndRuntime.hooks && twoPlayerWrongUnknownMatchEndRuntime.game) {
    const wrongUnknownMatchEndHooks = twoPlayerWrongUnknownMatchEndRuntime.hooks;
    wrongUnknownMatchEndHooks.processChatRecord({ sender: '<unknown>', message: `[match end] poker party ${twoPlayerWrongUnknownMatchEndPartyId} seed wrong-seed hand 99`, isSelf: false });
    assert(
      wrongUnknownMatchEndHooks.state.game && wrongUnknownMatchEndHooks.state.game.active,
      'unknown match-end with wrong seed/hand should not clear the member active hand',
    );
    assertEqual(wrongUnknownMatchEndHooks.state.party.leaderKey, 'abrams', 'unknown match-end with wrong seed/hand should preserve the current party leader');
    assert(
      !wrongUnknownMatchEndHooks.modules.PartyReducer.roster().some((member) => member.key === '<unknown>' || member.name === '<unknown>'),
      'unknown match-end with wrong seed/hand should not add an unknown party roster entry',
    );
    assert(
      !Object.prototype.hasOwnProperty.call(wrongUnknownMatchEndHooks.state.party.members || {}, '<unknown>'),
      'unknown match-end with wrong seed/hand should not add an unknown party member key',
    );
  }

  const twoPlayerLeaderLeaveOnlyPartyId = 'pleader-leave-two';
  const twoPlayerLeaderLeaveOnlyRuntime = createSyncedJoinedPartyRuntime('Bebop', 'stwo-leader-leave-only', syncedRoster, 1, twoPlayerLeaderLeaveOnlyPartyId);
  if (twoPlayerLeaderLeaveOnlyRuntime.hooks && twoPlayerLeaderLeaveOnlyRuntime.game) {
    const leaderLeaveOnlyHooks = twoPlayerLeaderLeaveOnlyRuntime.hooks;
    assertEqual(leaderLeaveOnlyHooks.state.party.mode, 'member', 'two-player leader leave-only setup should make Bebop a joined member');
    assertEqual(leaderLeaveOnlyHooks.state.game.active, true, 'two-player leader leave-only setup should start an active hand');
    leaderLeaveOnlyHooks.state.requiresProgressImport = true;
    leaderLeaveOnlyHooks.state.resume = { id: 'rtwo-leave', ready: {}, order: [], payload: { roster: [] } };
    leaderLeaveOnlyHooks.processChatRecord({ sender: 'Abrams', message: `[party leave] poker party ${twoPlayerLeaderLeaveOnlyPartyId}`, isSelf: false });
    assertEqual(leaderLeaveOnlyHooks.state.game, null, 'leader party leave from a two-player active hand should reset the member to the lobby');
    assertEqual(leaderLeaveOnlyHooks.state.party.id, '', 'leader party leave from a two-player active hand should clear the member party id');
    assertEqual(leaderLeaveOnlyHooks.state.party.mode, 'none', 'leader party leave from a two-player active hand should clear member party mode');
    assertEqual(leaderLeaveOnlyHooks.modules.PartyReducer.roster().length, 0, 'leader party leave from a two-player active hand should leave no stale member roster');
    assertEqual(leaderLeaveOnlyHooks.state.requiresProgressImport, false, 'leader party leave from a two-player active hand should clear imported-progress start guard');
    assertEqual(!!(leaderLeaveOnlyHooks.state.resume && leaderLeaveOnlyHooks.state.resume.id), false, 'leader party leave from a two-player active hand should clear resume state');
    assertEqual(leaderLeaveOnlyHooks.state.resumeRequiresHostedParty, true, 'leader party leave from a two-player active hand should require a hosted party before resume');
    leaderLeaveOnlyHooks.modules.TableRenderer.renderGame();
    assertNoGamePlayerRail(twoPlayerLeaderLeaveOnlyRuntime.runtime, 'leader party leave only two-player member lobby render');
    assertPanelHidden(twoPlayerLeaderLeaveOnlyRuntime.runtime, 'PokerLeaveLobbyButton', 'leader party leave only two-player member lobby render');
  }

  for (const localName of ['Bebop', 'Calico']) {
    const threePlayerLeaderLeavePartyId = `pleader-active-leave-${localName.toLowerCase()}`;
    const threePlayerLeaderLeaveRuntime = createSyncedJoinedPartyRuntime(localName, `sthree-leader-leave-${localName.toLowerCase()}`, tableRoster, 1, threePlayerLeaderLeavePartyId);
    if (threePlayerLeaderLeaveRuntime.hooks && threePlayerLeaderLeaveRuntime.game) {
      const transferHooks = threePlayerLeaderLeaveRuntime.hooks;
      const transferGame = threePlayerLeaderLeaveRuntime.game;
      assertEqual(
        JSON.stringify(transferHooks.state.party.order),
        JSON.stringify(['abrams', 'bebop', 'calico']),
        `three-player leader leave setup for ${localName} should preserve party join order`,
      );
      const leavingLeader = transferGame.players.find((player) => player.key === 'abrams');
      assert(leavingLeader, `three-player leader leave setup for ${localName} should include Abrams in the active hand`);
      if (leavingLeader) {
        transferGame.currentIndex = transferGame.players.indexOf(leavingLeader);
        transferHooks.processChatRecord({ sender: 'Abrams', message: `[party leave] poker party ${threePlayerLeaderLeavePartyId}`, isSelf: false });
        assertEqual(transferHooks.state.game, transferGame, `three-player leader leave for ${localName} should keep the active hand`);
        assertEqual(transferGame.active, true, `three-player leader leave for ${localName} should keep the hand active`);
        assertEqual(leavingLeader.folded, true, `three-player leader leave for ${localName} should fold the departing leader`);
        assertGreaterThan(
          transferGame.players.filter((player) => !player.folded && player.stack > 0).length,
          1,
          `three-player leader leave for ${localName} should leave two live contestants`,
        );
        assertEqual(transferHooks.state.party.leaderKey, 'bebop', `three-player leader leave for ${localName} should transfer leadership to next party member`);
        assertEqual(transferHooks.state.party.leaderName, 'Bebop', `three-player leader leave for ${localName} should preserve the promoted leader name`);
        assertEqual(
          transferHooks.state.party.mode,
          localName === 'Bebop' ? 'leader' : 'member',
          `three-player leader leave for ${localName} should set local party mode from the transferred leader`,
        );
        assertEqual(
          JSON.stringify(transferHooks.state.party.order),
          JSON.stringify(['bebop', 'calico']),
          `three-player leader leave for ${localName} should remove Abrams from party order`,
        );
        assertEqual(
          JSON.stringify(transferHooks.modules.PartyReducer.roster().map((member) => member.key)),
          JSON.stringify(['bebop', 'calico']),
          `three-player leader leave for ${localName} should keep only remaining party members in order`,
        );
        transferHooks.modules.TableRenderer.renderGame();
        assertPanelVisible(threePlayerLeaderLeaveRuntime.runtime, 'PokerTableSeats', `three-player leader leave for ${localName} active render`);
        assertPanelVisible(threePlayerLeaderLeaveRuntime.runtime, 'PokerGameLog', `three-player leader leave for ${localName} active render`);
        if (localName === 'Bebop') {
          assertPanelVisible(threePlayerLeaderLeaveRuntime.runtime, 'PokerEndMatchButton', `three-player leader leave for ${localName} active render`);
        } else {
          assertPanelHidden(threePlayerLeaderLeaveRuntime.runtime, 'PokerEndMatchButton', `three-player leader leave for ${localName} active render`);
        }
      }
    }
  }

  const leaderLeaveContinuationRuntime = createSyncedJoinedPartyRuntime('Bebop', 'sleader-leave-continue', tableRoster, 1, 'pleader-leave-continue');
  if (leaderLeaveContinuationRuntime.hooks && leaderLeaveContinuationRuntime.game) {
    const continuationHooks = leaderLeaveContinuationRuntime.hooks;
    const continuationGame = leaderLeaveContinuationRuntime.game;
    const leavingLeader = continuationGame.players.find((player) => player.key === 'abrams');
    assert(leavingLeader, 'leader-leave continuation setup should include Abrams in the active hand');
    if (leavingLeader) {
      continuationGame.currentIndex = continuationGame.players.indexOf(leavingLeader);
      continuationHooks.processChatRecord({ sender: 'Abrams', message: '[party leave] poker party pleader-leave-continue', isSelf: false });
      const actor = currentPlayer(continuationGame);
      assert(actor, 'leader-leave continuation should have a current actor after transfer');
      const legal = actor ? continuationHooks.getLegalActions(actor) : {};
      const command = legal.check ? 'check' : (legal.call ? 'call' : 'fold');
      continuationHooks.processChatRecord({ sender: actor.name, message: command, isSelf: actor.key === continuationHooks.state.localPlayerKey });
      assert(continuationHooks.state.game, 'leader-leave continuation should keep a hand after the next legal action');
      assert(
        continuationGame.log.some((line) => String(line).toLowerCase().includes(command)),
        `leader-leave continuation should log the applied ${command} action: ${(continuationGame.log || []).join('|') || '<empty>'}`,
      );
      assert(
        currentPlayer(continuationGame).key !== 'abrams',
        'leader-leave continuation should not point the current actor at the departed leader',
      );
    }
  }

  for (const localName of ['Abrams', 'Bebop']) {
    const threePlayerMemberLeavePartyId = `pmember-active-leave-${localName.toLowerCase()}`;
    const threePlayerMemberLeaveRuntime = createSyncedJoinedPartyRuntime(localName, `sthree-member-leave-${localName.toLowerCase()}`, tableRoster, 1, threePlayerMemberLeavePartyId);
    if (threePlayerMemberLeaveRuntime.hooks && threePlayerMemberLeaveRuntime.game) {
      const memberLeaveHooks = threePlayerMemberLeaveRuntime.hooks;
      const memberLeaveGame = threePlayerMemberLeaveRuntime.game;
      const leavingMember = memberLeaveGame.players.find((player) => player.key === 'calico');
      assert(leavingMember, `three-player non-host leave setup for ${localName} should include Calico in the active hand`);
      if (leavingMember) {
        memberLeaveGame.currentIndex = memberLeaveGame.players.indexOf(leavingMember);
        memberLeaveHooks.processChatRecord({ sender: 'Calico', message: `[party leave] poker party ${threePlayerMemberLeavePartyId}`, isSelf: false });
        assertEqual(memberLeaveHooks.state.game, memberLeaveGame, `three-player non-host leave for ${localName} should keep the active hand`);
        assertEqual(memberLeaveGame.active, true, `three-player non-host leave for ${localName} should not clear the table`);
        assertEqual(leavingMember.folded, true, `three-player non-host leave for ${localName} should fold the departing member`);
        assertEqual(memberLeaveHooks.state.party.leaderKey, 'abrams', `three-player non-host leave for ${localName} should not transfer leadership`);
        assertEqual(
          memberLeaveHooks.state.party.mode,
          localName === 'Abrams' ? 'leader' : 'member',
          `three-player non-host leave for ${localName} should preserve local party mode`,
        );
        assertEqual(
          JSON.stringify(memberLeaveHooks.state.party.order),
          JSON.stringify(['abrams', 'bebop']),
          `three-player non-host leave for ${localName} should remove only Calico from party order`,
        );
        memberLeaveHooks.modules.TableRenderer.renderGame();
        assertPanelVisible(threePlayerMemberLeaveRuntime.runtime, 'PokerTableSeats', `three-player non-host leave for ${localName} active render`);
        assertPanelVisible(threePlayerMemberLeaveRuntime.runtime, 'PokerGameLog', `three-player non-host leave for ${localName} active render`);
      }
    }
  }
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
    drainScheduledCallbacks(tableRuntime.runtime, 256);
    const startingPotTexts = potAmountTexts(tableRuntime.runtime);
    assertEqual(startingPotTexts.header, 'POT $300', 'active table pot animation setup header amount');
    assertEqual(startingPotTexts.center, '$300', 'active table pot animation setup center amount');
    tableRuntime.game.pot = 431;
    tableRuntime.hooks.modules.TableRenderer.renderGame();
    const immediatePotTexts = potAmountTexts(tableRuntime.runtime);
    assert(
      immediatePotTexts.header !== 'POT $431',
      `active table pot animation should not jump header amount to the final pot before scheduled callbacks drain: ${immediatePotTexts.header || '<empty>'}`,
    );
    assert(
      immediatePotTexts.center !== '$431',
      `active table pot animation should not jump center amount to the final pot before scheduled callbacks drain: ${immediatePotTexts.center || '<empty>'}`,
    );
    drainScheduledCallbacks(tableRuntime.runtime, 256);
    const finalPotTexts = potAmountTexts(tableRuntime.runtime);
    assertEqual(finalPotTexts.header, 'POT $431', 'active table pot animation final header amount after scheduled callbacks drain');
    assertPotCenterArt(
      tableRuntime.runtime,
      431,
      [
        { asset: 'pot_300_green_chips_512.vtex', count: 1 },
        { asset: 'pot_100_red_chips_512.vtex', count: 1 },
      ],
      'active table pot-center display after scheduled callbacks drain',
    );

    const potLifecycleRuntime = createGameRuntime(['Abrams', 'Bebop', 'Calico'], 'pot-chip-lifecycle');
    if (potLifecycleRuntime.hooks && potLifecycleRuntime.game) {
      potLifecycleRuntime.game.pot = 431;
      potLifecycleRuntime.hooks.modules.TableRenderer.renderGame();
      drainScheduledCallbacks(potLifecycleRuntime.runtime, 256);
      const firstChipPanels = findDescendantsWithClass(findPanel(potLifecycleRuntime.runtime, 'PokerPotChips'), 'PokerPotChip', []);
      assert(firstChipPanels.length > 1, 'pot-chip lifecycle should render multiple chip panels for $431');
      const threeHundredPanel = firstChipPanels[0];
      clearDomWrites(potLifecycleRuntime.runtime);
      potLifecycleRuntime.hooks.modules.TableRenderer.renderGame();
      const repeatChipWrites = takeDomWrites(potLifecycleRuntime.runtime).filter((write) => write.type === 'create' || write.type === 'image-src' || (write.type === 'attr' && write.name === 'src'));
      assertEqual(repeatChipWrites.length, 0, 'pot-chip lifecycle should not recreate or rewrite image sources for unchanged pot');
      potLifecycleRuntime.game.pot = 300;
      potLifecycleRuntime.hooks.modules.TableRenderer.renderGame();
      const threeHundredPanels = findDescendantsWithClass(findPanel(potLifecycleRuntime.runtime, 'PokerPotChips'), 'PokerPotChip', []);
      assertEqual(threeHundredPanels.length, 1, 'pot-chip lifecycle should retain only one chip panel for $300');
      assertEqual(threeHundredPanels[0], threeHundredPanel, 'pot-chip lifecycle should reuse the $300 chip panel when lower tiers disappear');
      assert(firstChipPanels.some((panel) => panel !== threeHundredPanel && panel.deleted), 'pot-chip lifecycle should delete disappeared lower-tier chip panels');
      potLifecycleRuntime.game.pot = 0;
      potLifecycleRuntime.hooks.modules.TableRenderer.renderGame();
      assertPanelHidden(potLifecycleRuntime.runtime, 'PokerPotChips', 'zero-pot chip lifecycle');
      assertEqual(findDescendantsWithClass(findPanel(potLifecycleRuntime.runtime, 'PokerPotChips'), 'PokerPotChip', []).length, 0, 'zero-pot chip lifecycle should remove all chip panels');
    }
  }

  const tableSeatContractNames = [
    'Abrams',
    'Bebop',
    'Calico',
    'Dynamo',
    'Eagle',
    'Fathom',
    'Geist',
    'Haze',
    'Ivy',
    'Kelvin',
    'Lash',
    'Mirage',
  ];

  const sixSeatRuntime = createGameRuntime(tableSeatContractNames.slice(0, 6), 'six-table-edge-seats');
  if (sixSeatRuntime.hooks && sixSeatRuntime.game) {
    sixSeatRuntime.hooks.modules.TableRenderer.renderGame();
    const sixTableNames = tableSeatNames(sixSeatRuntime.runtime);
    assertEqual(sixTableNames.length, 6, 'six-player table render should create six table-edge seats');
    for (const name of tableSeatContractNames.slice(0, 6)) {
      assert(sixTableNames.includes(name), `six-player table render should include ${name} on the table edge: ${sixTableNames.join('|') || '<empty>'}`);
    }
    const sixTableText = collectPanelTexts(findPanel(sixSeatRuntime.runtime, 'PokerTableSeats'), []).join('|');
    assert(!sixTableText.includes('players in list'), `six-player table render should not show an overflow label on the felt: ${sixTableText || '<empty>'}`);
  }

  const sevenSeatRuntime = createGameRuntime(tableSeatContractNames.slice(0, 7), 'seven-table-edge-seats');
  if (sevenSeatRuntime.hooks && sevenSeatRuntime.game) {
    sevenSeatRuntime.hooks.modules.TableRenderer.renderGame();
    const sevenTableNames = tableSeatNames(sevenSeatRuntime.runtime);
    assertEqual(sevenTableNames.length, 7, 'seven-player table render should create seven table-edge seats');
    for (const name of tableSeatContractNames.slice(0, 7)) {
      assert(sevenTableNames.includes(name), `seven-player table render should include ${name} on the table edge: ${sevenTableNames.join('|') || '<empty>'}`);
    }
    const sevenTableText = collectPanelTexts(findPanel(sevenSeatRuntime.runtime, 'PokerTableSeats'), []).join('|');
    assert(!sevenTableText.includes('+1 players in list'), `seven-player table render should not show the old +1 overflow label on the felt: ${sevenTableText || '<empty>'}`);
    assert(!sevenTableText.includes('players in list'), `seven-player table render should not show any overflow label on the felt: ${sevenTableText || '<empty>'}`);
    const sevenPlayerNames = playerListNames(sevenSeatRuntime.runtime);
    for (const name of tableSeatContractNames.slice(0, 7)) {
      assert(sevenPlayerNames.includes(name), `seven-player table render should keep ${name} in the full player list: ${sevenPlayerNames.join('|') || '<empty>'}`);
    }
  }

  const twelveSeatRuntime = createGameRuntime(tableSeatContractNames, 'twelve-table-edge-seats');
  if (twelveSeatRuntime.hooks && twelveSeatRuntime.game) {
    twelveSeatRuntime.hooks.modules.TableRenderer.renderGame();
    const twelveTableNames = tableSeatNames(twelveSeatRuntime.runtime);
    assertEqual(twelveTableNames.length, 12, 'twelve-player table render should create twelve table-edge seats');
    for (const name of tableSeatContractNames) {
      assert(twelveTableNames.includes(name), `twelve-player table render should include ${name} on the table edge: ${twelveTableNames.join('|') || '<empty>'}`);
    }
    const twelveTableText = collectPanelTexts(findPanel(twelveSeatRuntime.runtime, 'PokerTableSeats'), []).join('|');
    assert(!twelveTableText.includes('players in list'), `twelve-player table render should not show an overflow label on the felt: ${twelveTableText || '<empty>'}`);
    const twelvePlayerNames = playerListNames(twelveSeatRuntime.runtime);
    assertEqual(twelvePlayerNames.length, 12, 'twelve-player table render should keep all twelve players in the full player list');
    for (const name of tableSeatContractNames) {
      assert(twelvePlayerNames.includes(name), `twelve-player table render should keep ${name} in the full player list: ${twelvePlayerNames.join('|') || '<empty>'}`);
    }
  }

  const overCapacityRuntime = createGameRuntime(tableSeatContractNames, 'thirteen-table-edge-seats');
  if (overCapacityRuntime.hooks && overCapacityRuntime.game && typeof overCapacityRuntime.hooks.setGameForTest === 'function') {
    const extraPlayer = Object.assign({}, overCapacityRuntime.game.players[0], {
      key: 'viscous',
      name: 'Viscous',
      cards: overCapacityRuntime.game.players[0].cards,
    });
    overCapacityRuntime.game.players.push(extraPlayer);
    overCapacityRuntime.hooks.setGameForTest(overCapacityRuntime.game);
    overCapacityRuntime.hooks.modules.TableRenderer.renderGame();
    assertEqual(tableSeatRows(overCapacityRuntime.runtime).length, 12, 'thirteen-player defensive table render should show exactly twelve table seats');
    assertEqual(playerListRows(overCapacityRuntime.runtime).length, 12, 'thirteen-player defensive player list render should stay capped at MAX_TABLE_PLAYERS');
    assertEqual(findDescendantsWithClass(findPanel(overCapacityRuntime.runtime, 'PokerTableSeats'), 'PokerTableOverflow', []).length, 0, 'thirteen-player defensive render should not create PokerTableOverflow');
    const overCapacityText = collectPanelTexts(findPanel(overCapacityRuntime.runtime, 'PokerTableSeats'), []).join('|');
    assert(!overCapacityText.includes('players in list'), `thirteen-player defensive render should not show overflow text: ${overCapacityText || '<empty>'}`);
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
    assertEqual(twoPlayerLeaveHooks.modules.PartyReducer.roster().length, 0, 'remote leave from a two-player active hand should leave no stale party roster');
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
      leaveHooks.state.requiresProgressImport = true;
      leaveHooks.processChatRecord({ sender: 'Bebop', message: '[party leave] poker party psync', isSelf: false });
      assertEqual(leaveHooks.state.game, leaveGame, 'remote non-leader leave from a three-player active hand should keep the current hand');
      assertEqual(leaveGame.active, true, 'remote non-leader leave from a three-player active hand should remain active');
      assert(
        !leaveHooks.modules.PartyReducer.roster().some((member) => member.key === 'bebop'),
        'remote non-leader leave should remove the sender from the synced party roster',
      );
      assert(
        !leaveHooks.getReadySeatArray().some((seat) => seat.key === 'bebop'),
        'remote non-leader leave should remove the sender from ready seats',
      );
      assertEqual(leavingPlayer.folded, true, 'remote non-leader leave during an active hand should fold the leaving player');
      assertEqual(leavingPlayer.left, true, 'remote non-leader leave during an active hand should mark the leaving player left');
      assertEqual(leavingPlayer.acted, true, 'remote non-leader leave during an active hand should mark the leaving player acted');
      assertEqual(leaveHooks.state.requiresProgressImport, true, 'remote non-leader leave during a three-player active hand should not run a lobby reset case');
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

  const middleDealerLeaveRuntime = createSyncedPartyRuntime('Abrams', 'smiddle-dealer-leave', tableRoster, 1);
  if (middleDealerLeaveRuntime.hooks && middleDealerLeaveRuntime.game) {
    const middleDealerHooks = middleDealerLeaveRuntime.hooks;
    const middleDealerGame = middleDealerLeaveRuntime.game;
    const middleDealerPlayer = middleDealerGame.players.find((player) => player.key === 'bebop');
    assert(middleDealerPlayer, 'middle dealer leave setup should include Bebop in the active hand');
    if (middleDealerPlayer) {
      middleDealerGame.dealerIndex = middleDealerGame.players.indexOf(middleDealerPlayer);
      middleDealerHooks.processChatRecord({ sender: 'Bebop', message: '[party leave] poker party psync', isSelf: false });
      middleDealerHooks.showdown();
      const middleDealerProgress = middleDealerHooks.buildProgressSaveCode();
      assertEqual(middleDealerProgress.ok, true, 'middle dealer leave finished hand should export progress for remaining players');
      if (middleDealerProgress.ok) {
        assertEqual(
          JSON.stringify(middleDealerProgress.payload.roster.map((entry) => entry.key)),
          JSON.stringify(['abrams', 'calico']),
          'middle dealer leave progress export should exclude the departed middle-seat dealer',
        );
        assert(
          !Object.prototype.hasOwnProperty.call(middleDealerProgress.payload.bankrolls, 'bebop'),
          'middle dealer leave progress export should not preserve a bankroll for the departed middle-seat dealer',
        );
        assertEqual(
          middleDealerHooks.resolveResumeNextDealerKey(middleDealerProgress.payload),
          'calico',
          'middle dealer leave progress export should anchor rotation so the first remaining player after the departed dealer deals next',
        );
      }
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

      leaderLeaveHooks.showdown();
      const leftLeaderProgress = leaderLeaveHooks.buildProgressSaveCode();
      assertEqual(leftLeaderProgress.ok, true, 'three-player leader leave finished hand should still export progress for remaining players');
      if (leftLeaderProgress.ok) {
        const progressRosterKeys = leftLeaderProgress.payload.roster.map((entry) => entry.key);
        assertEqual(
          JSON.stringify(progressRosterKeys),
          JSON.stringify(['bebop', 'calico']),
          'three-player leader leave progress export should exclude the departed leader from the next hand roster',
        );
        assert(
          !Object.prototype.hasOwnProperty.call(leftLeaderProgress.payload.bankrolls, 'abrams'),
          'three-player leader leave progress export should not preserve a bankroll for the departed leader',
        );
        assertEqual(
          leaderLeaveHooks.resolveResumeNextDealerKey(leftLeaderProgress.payload),
          'bebop',
          'three-player leader leave progress export should make the next dealer the first remaining player when the old dealer left',
        );
        const resumeLeaderKey = leftLeaderProgress.payload.dealerKey || (leftLeaderProgress.payload.roster[0] && leftLeaderProgress.payload.roster[0].key) || '';
        const resumeStartCommand = leaderLeaveHooks.buildResumeStartCommand(leftLeaderProgress.id, resumeLeaderKey, leftLeaderProgress.payload.nextHandNumber, 'sresume-long');
        assert(
          resumeStartCommand.length <= MAX_SYNCED_START_CHAT_COMMAND_LENGTH,
          `departed leader resume-start command should fit chat-safe length ${MAX_SYNCED_START_CHAT_COMMAND_LENGTH}, got ${resumeStartCommand.length}: ${resumeStartCommand}`,
        );
        assertEqual(resumeStartCommand.includes(' roster '), false, 'departed leader resume-start command should not serialize a roster marker');
      }
  }

  const lateJoinRuntime = createSyncedPartyRuntime('Abrams', 'slate', syncedRoster, 1);
  if (lateJoinRuntime.hooks && lateJoinRuntime.game && lateJoinRuntime.hooks.modules && lateJoinRuntime.hooks.modules.LateJoinQueue) {
    const lateJoinHooks = lateJoinRuntime.hooks;
    const lateJoinQueue = lateJoinHooks.modules.LateJoinQueue;
    lateJoinHooks.processChatRecord({ sender: 'Calico', message: '[party join] poker party psync', isSelf: false });
    assertEqual(
      JSON.stringify(lateJoinHooks.modules.PartyReducer.roster()),
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
    'poker start ssync-hand-two hand 2 roster abrams|bebop',
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
    const unicodeProgress = createProgressCodeRuntime(['Élodie 🂡', 'Bebop'], 'progress-unicode-roundtrip');
    if (unicodeProgress.code && unicodeProgress.payload) {
      const unicodeImport = createMenuRuntime();
      const unicodeDecoded = unicodeImport.hooks.decodeProgressSaveCode(unicodeProgress.code);
      assertEqual(unicodeDecoded.ok, true, 'Unicode POKERPROG1 code should decode after export');
      assertEqual(unicodeDecoded.payload && unicodeDecoded.payload.roster[0].name, 'Élodie 🂡', 'Unicode POKERPROG1 decode should preserve the player name');
      const unicodeImported = unicodeImport.hooks.importProgressSaveCode(unicodeProgress.code);
      assertEqual(unicodeImported.ok, true, 'Unicode POKERPROG1 code should import after roundtrip');
      assertEqual(unicodeImported.payload && unicodeImported.payload.roster[0].name, 'Élodie 🂡', 'Unicode POKERPROG1 import should preserve the player name');
      unicodeImport.hooks.modules.TableRenderer.renderGame();
      const unicodeResumeRows = collectPanelTexts(findPanel(unicodeImport.runtime, 'PokerResumeLeaderList'), []).join('|');
      assert(unicodeResumeRows.includes('Élodie 🂡'), `Unicode imported progress should render the saved player name: ${unicodeResumeRows || '<empty>'}`);
    }
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
      const startCommand = hooks.buildResumeStartCommand(saved.id, 'abrams', saved.payload.nextHandNumber, 'sresume');
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
        assertReadOnlyActionButtons(resumeA.runtime, ['CALL $200', 'RAISE', 'FOLD'], 'Waiting for Bebop', 'active resumed hand leader observer');
        resumeA.hooks.state.localPlayerKey = 'bebop';
        resumeA.runtime.config.PokerLocalPlayerKey = 'bebop';
        resumeA.runtime.config.PokerLocalPlayerName = 'Bebop';
        resumeA.hooks.modules.TableRenderer.renderGame();
        assertEnabledActionButtons(resumeA.runtime, ['CALL $200', 'RAISE', 'FOLD'], 'active resumed hand current actor');
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
          drainScheduledCallbacks(postShareUnlockRuntime.runtime, 8);
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
            JSON.stringify(hostedMemberEndSyncRuntime.hooks.modules.PartyReducer.roster().map((entry) => ({ key: entry.key, name: entry.name }))),
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
          JSON.stringify(hostedLeaderEndImport.leaderRuntime.hooks.modules.PartyReducer.roster().map((entry) => ({ key: entry.key, name: entry.name }))),
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
        const liveLogBuiltStartCommand = liveLogResume.hooks.buildResumeStartCommand(liveLogSaved.id, 'jdbeast', liveLogSaved.payload.nextHandNumber, 'shantu-raya-resume');
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
    if (saved.code && saved.payload) {
      const tamperedLocalRuntime = createMenuRuntime();
      tamperedLocalRuntime.hooks.processChatRecord({
        sender: 'Abrams',
        message: '[party leader] poker party ptampered-local-code',
        isSelf: true,
      });
      tamperedLocalRuntime.hooks.importProgressSaveCode(saved.code);
      tamperedLocalRuntime.hooks.modules.TableRenderer.renderGame();
      const tamperedInput = findPanel(tamperedLocalRuntime.runtime, 'PokerProgressCodeInput');
      assert(tamperedInput, 'tampered local progress setup should expose the progress code input');
      const tamperedBeforeResume = JSON.stringify(tamperedLocalRuntime.hooks.state.resume);
      const tamperedBeforeParty = JSON.stringify(tamperedLocalRuntime.hooks.state.party);
      const tamperedCode = saved.code.replace(/^POKERPROG1-([0-9a-f])([0-9a-f]{7})-/i, (match, first, rest) => `POKERPROG1-${first === '0' ? '1' : '0'}${rest}-`);
      if (tamperedInput) tamperedInput.text = tamperedCode;
      const tamperedImportHandler = tamperedLocalRuntime.runtime.sandbox.PokerEscapeMenuImportProgress;
      assertEqual(typeof tamperedImportHandler, 'function', 'tampered local progress should expose the import button handler');
      const tamperedResult = typeof tamperedImportHandler === 'function' ? tamperedImportHandler() : { ok: true };
      drainImmediateCallbacks(tamperedLocalRuntime.runtime);
      assertEqual(tamperedResult.ok, false, 'tampered local progress code should be rejected');
      assertEqual(tamperedResult.status, 'Invalid progress code.', 'tampered local progress code should report invalid status');
      assertEqual(JSON.stringify(tamperedLocalRuntime.hooks.state.resume), tamperedBeforeResume, 'tampered local progress should preserve the existing resume state');
      assertEqual(JSON.stringify(tamperedLocalRuntime.hooks.state.party), tamperedBeforeParty, 'tampered local progress should preserve the existing party state');
      assertEqual(panelText(findPanel(tamperedLocalRuntime.runtime, 'PokerStatusLabel')), 'Invalid progress code.', 'tampered local progress should render the invalid status');
    }
    if (saved.code && saved.payload) {
      const wrongChecksumRuntime = createMenuRuntime();
      assertEqual(wrongChecksumRuntime.hooks.importProgressSaveCode(saved.code).ok, true, 'wrong-checksum transfer setup should import the existing local progress');
      wrongChecksumRuntime.hooks.state.localPlayerKey = 'abrams';
      wrongChecksumRuntime.runtime.config.PokerLocalPlayerKey = 'abrams';
      wrongChecksumRuntime.runtime.config.PokerLocalPlayerName = 'Abrams';
      wrongChecksumRuntime.hooks.modules.TableRenderer.renderGame();
      const wrongChecksumBefore = JSON.stringify(wrongChecksumRuntime.hooks.state.resume);
      const actualChecksum = progressChecksumFromCode(saved.code);
      const wrongChecksum = actualChecksum === '00000000' ? 'ffffffff' : '00000000';
      const wrongChecksumChunks = splitProgressCodeForChat(saved.code, 3);
      wrongChecksumRuntime.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressOfferMessage(saved.id, wrongChecksum, wrongChecksumChunks.length),
        isSelf: false,
      });
      for (let i = 0; i < wrongChecksumChunks.length; i += 1) {
        wrongChecksumRuntime.hooks.processChatRecord({
          sender: 'Seven',
          message: buildProgressChunkMessage(saved.id, wrongChecksum, i + 1, wrongChecksumChunks.length, wrongChecksumChunks[i]),
          isSelf: false,
        });
      }
      assertEqual(JSON.stringify(wrongChecksumRuntime.hooks.state.resume), wrongChecksumBefore, 'wrong-final-checksum transfer should preserve the imported payload and resume state');
      assertEqual(wrongChecksumRuntime.hooks.state.resume.leaderKey, '', 'wrong-final-checksum transfer should not select a resume leader');
      assertEqual(wrongChecksumRuntime.hooks.state.resume.hostedLeaderKey, '', 'wrong-final-checksum transfer should not grant hosted resume authority');
      assertEqual(progressTransferCount(wrongChecksumRuntime.hooks), 0, 'wrong-final-checksum transfer should discard the invalid transfer');
      assertEqual(wrongChecksumRuntime.hooks.getResumeGate().enabled, false, 'wrong-final-checksum transfer should not unlock resume start');
      assert(
        panelText(findPanel(wrongChecksumRuntime.runtime, 'PokerStatusLabel')).includes('Invalid shared progress checksum.'),
        `wrong-final-checksum transfer should render the checksum rejection status: ${panelText(findPanel(wrongChecksumRuntime.runtime, 'PokerStatusLabel')) || '<empty>'}`,
      );
    }
    if (saved.code && saved.payload) {
      const duplicateChunkRuntime = createMenuRuntime();
      const duplicateChecksum = progressChecksumFromCode(saved.code);
      const duplicateChunks = splitProgressCodeForChat(saved.code, 3);
      assert(duplicateChunks.length >= 3, 'duplicate progress chunk fixture should have at least three chunks');
      duplicateChunkRuntime.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressOfferMessage(saved.id, duplicateChecksum, duplicateChunks.length),
        isSelf: false,
      });
      duplicateChunkRuntime.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressChunkMessage(saved.id, duplicateChecksum, 1, duplicateChunks.length, duplicateChunks[0]),
        isSelf: false,
      });
      duplicateChunkRuntime.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressChunkMessage(saved.id, duplicateChecksum, 1, duplicateChunks.length, duplicateChunks[0]),
        isSelf: false,
      });
      assertEqual(!!duplicateChunkRuntime.hooks.state.resume.payload, false, 'duplicate progress chunk should not complete the transfer');
      assertEqual(progressTransferCount(duplicateChunkRuntime.hooks), 1, 'duplicate progress chunk should keep one pending transfer');
      assertEqual(duplicateChunkRuntime.hooks.getResumeGate().enabled, false, 'duplicate progress chunk should not unlock resume');
      duplicateChunkRuntime.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressChunkMessage(saved.id, duplicateChecksum, 2, duplicateChunks.length, duplicateChunks[1]),
        isSelf: false,
      });
      duplicateChunkRuntime.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressChunkMessage(saved.id, duplicateChecksum, 2, duplicateChunks.length, duplicateChunks[1]),
        isSelf: false,
      });
      assertEqual(!!duplicateChunkRuntime.hooks.state.resume.payload, false, 'duplicate progress chunks should not complete before every unique chunk arrives');
      assertEqual(progressTransferCount(duplicateChunkRuntime.hooks), 1, 'duplicate progress chunks should remain one pending transfer before completion');
      duplicateChunkRuntime.hooks.processChatRecord({
        sender: 'Seven',
        message: buildProgressChunkMessage(saved.id, duplicateChecksum, 3, duplicateChunks.length, duplicateChunks[2]),
        isSelf: false,
      });
      assertEqual(duplicateChunkRuntime.hooks.state.resume.id, saved.id, 'unique final progress chunk should complete the transfer after duplicates');
      assertEqual(JSON.stringify(duplicateChunkRuntime.hooks.state.resume.payload), JSON.stringify(saved.payload), 'unique final progress chunk should import the original payload');
    }
    const zeroStackSource = createGameRuntime(['Abrams', 'Bebop', 'Calico'], 'progress-zero-stack');
    if (zeroStackSource.hooks && zeroStackSource.game) {
      const zeroStackGame = zeroStackSource.hooks.state.game;
      zeroStackGame.active = false;
      zeroStackGame.finished = true;
      zeroStackGame.phase = 'finished';
      zeroStackGame.dealerIndex = 2;
      zeroStackGame.players[0].stack = 7000;
      zeroStackGame.players[0].bet = 0;
      zeroStackGame.players[0].committed = 0;
      zeroStackGame.players[1].stack = 5000;
      zeroStackGame.players[1].bet = 0;
      zeroStackGame.players[1].committed = 0;
      zeroStackGame.players[2].stack = 0;
      zeroStackGame.players[2].bet = 0;
      zeroStackGame.players[2].committed = 0;
      const zeroStackSave = zeroStackSource.hooks.buildProgressSaveCode();
      assertEqual(zeroStackSave.ok, true, 'zero-stack saved player should remain valid progress input while two players have chips');
      if (zeroStackSave.ok) {
        assertEqual(zeroStackSave.payload.bankrolls.calico, 0, 'zero-stack saved player should be represented with a zero bankroll');
        assertEqual(zeroStackSave.payload.roster.length, 3, 'zero-stack saved player should remain represented in the saved roster');
        const zeroStackResume = createMenuRuntime();
        assertEqual(zeroStackResume.hooks.importProgressSaveCode(zeroStackSave.code).ok, true, 'zero-stack saved progress should import');
        zeroStackResume.hooks.modules.TableRenderer.renderGame();
        const zeroStackRows = collectPanelTexts(findPanel(zeroStackResume.runtime, 'PokerResumeLeaderList'), []).join('|');
        assert(zeroStackRows.includes('Calico') && zeroStackRows.includes('$0  OUT'), `zero-stack saved player should render as OUT for resume validation: ${zeroStackRows || '<empty>'}`);
        zeroStackResume.hooks.processChatRecord({
          sender: 'Abrams',
          message: hooks.buildResumeLeaderCommand(zeroStackSave.id),
          isSelf: true,
        });
        zeroStackResume.hooks.processChatRecord({
          sender: 'Bebop',
          message: hooks.buildResumeReadyCommand(zeroStackSave.id),
          isSelf: false,
        });
        zeroStackResume.hooks.processChatRecord({
          sender: 'Abrams',
          message: hooks.buildResumeStartCommand(zeroStackSave.id, 'abrams', zeroStackSave.payload.nextHandNumber, 'sresume-zero-stack'),
          isSelf: true,
        });
        const zeroStackActivePlayers = zeroStackResume.hooks.state.game && zeroStackResume.hooks.state.game.players
          ? zeroStackResume.hooks.state.game.players.map((player) => player.key)
          : [];
        assertEqual(JSON.stringify(zeroStackActivePlayers), JSON.stringify(['abrams', 'bebop']), 'zero-stack saved player should be excluded from the active resumed roster');
      }
    }
    if (saved.code && saved.payload) {
      const resumeLeaderUi = createMenuRuntime();
      assertEqual(resumeLeaderUi.hooks.importProgressSaveCode(saved.code).ok, true, 'resume leader UI setup should import progress');
      resumeLeaderUi.hooks.state.localPlayerKey = 'abrams';
      resumeLeaderUi.runtime.config.PokerLocalPlayerKey = 'abrams';
      resumeLeaderUi.runtime.config.PokerLocalPlayerName = 'Abrams';
      const leaderChatTarget = findPanel(resumeLeaderUi.runtime, 'ChatTargetLabel');
      if (leaderChatTarget) leaderChatTarget.text = 'TEAM';
      resumeLeaderUi.hooks.modules.TableRenderer.renderGame();
      assertButtonAffordance(resumeLeaderUi.runtime, 'PokerResumeControls', { hidden: false }, 'resume leader UI should show resume controls after import');
      assertButtonAffordance(resumeLeaderUi.runtime, 'PokerResumeLeaderButton', { hidden: false, enabled: true }, 'resume leader UI should enable the leader button for a funded saved player');
      assertButtonAffordance(resumeLeaderUi.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'resume leader UI should hide READY RESUME for the unselected leader');
      assertStartButtonGate(resumeLeaderUi.runtime, 'WAITING FOR RESUME LEADER', false, true, 'resume leader UI should hide start before a leader is selected');
      assert(
        panelText(findPanel(resumeLeaderUi.runtime, 'PokerResumeStatusLabel')).includes('Leader: none'),
        `resume leader UI should render the unselected leader status: ${panelText(findPanel(resumeLeaderUi.runtime, 'PokerResumeStatusLabel')) || '<empty>'}`,
      );
      const leaderButtonStart = resumeLeaderUi.runtime.dispatches.length;
      const leaderButtonHandler = resumeLeaderUi.runtime.sandbox.PokerEscapeMenuResumeLeader;
      assertEqual(typeof leaderButtonHandler, 'function', 'resume leader UI should expose a leader button handler');
      if (typeof leaderButtonHandler === 'function') leaderButtonHandler();
      drainScheduledCallbacks(resumeLeaderUi.runtime, 256);
      const leaderButtonMessages = submittedChatMessages(resumeLeaderUi.runtime, leaderButtonStart);
      assert(leaderButtonMessages.includes(hooks.buildResumeLeaderCommand(saved.id)), `resume leader UI should submit the resume-leader command: ${leaderButtonMessages.join('|') || '<none>'}`);
      resumeLeaderUi.hooks.processChatRecord({
        sender: 'Abrams',
        message: hooks.buildResumeLeaderCommand(saved.id),
        isSelf: true,
      });
      resumeLeaderUi.hooks.modules.TableRenderer.renderGame();
      assertButtonAffordance(resumeLeaderUi.runtime, 'PokerResumeLeaderButton', { hidden: true, enabled: false }, 'resume leader UI should disable the leader button after selection');
      assertStartButtonGate(resumeLeaderUi.runtime, 'WAITING FOR RESUME READY', false, false, 'resume leader UI should show the ready quorum gate after leader selection');
      assert(
        panelText(findPanel(resumeLeaderUi.runtime, 'PokerResumeStatusLabel')).includes('Ready: 1/2'),
        `resume leader UI should render one ready saved player after selection: ${panelText(findPanel(resumeLeaderUi.runtime, 'PokerResumeStatusLabel')) || '<empty>'}`,
      );

      const resumeReadyUi = createMenuRuntime();
      assertEqual(resumeReadyUi.hooks.importProgressSaveCode(saved.code).ok, true, 'resume ready UI setup should import progress');
      resumeReadyUi.hooks.state.localPlayerKey = 'bebop';
      resumeReadyUi.runtime.config.PokerLocalPlayerKey = 'bebop';
      resumeReadyUi.runtime.config.PokerLocalPlayerName = 'Bebop';
      const readyChatTarget = findPanel(resumeReadyUi.runtime, 'ChatTargetLabel');
      if (readyChatTarget) readyChatTarget.text = 'TEAM';
      resumeReadyUi.hooks.processChatRecord({
        sender: 'Abrams',
        message: hooks.buildResumeLeaderCommand(saved.id),
        isSelf: false,
      });
      resumeReadyUi.hooks.modules.TableRenderer.renderGame();
      assertButtonAffordance(resumeReadyUi.runtime, 'PokerResumeLeaderButton', { hidden: false, enabled: true }, 'resume ready UI should keep leader selection available to a funded saved member');
      assertButtonAffordance(resumeReadyUi.runtime, 'PokerResumeReadyButton', { hidden: false, enabled: true }, 'resume ready UI should enable READY RESUME for the funded saved member');
      const readyButtonStart = resumeReadyUi.runtime.dispatches.length;
      const readyButtonHandler = resumeReadyUi.runtime.sandbox.PokerEscapeMenuResumeReady;
      assertEqual(typeof readyButtonHandler, 'function', 'resume ready UI should expose a ready button handler');
      if (typeof readyButtonHandler === 'function') readyButtonHandler();
      drainScheduledCallbacks(resumeReadyUi.runtime, 256);
      const readyButtonMessages = submittedChatMessages(resumeReadyUi.runtime, readyButtonStart);
      assert(readyButtonMessages.includes(hooks.buildResumeReadyCommand(saved.id)), `resume ready UI should submit the resume-ready command: ${readyButtonMessages.join('|') || '<none>'}`);
      resumeReadyUi.hooks.processChatRecord({
        sender: 'Bebop',
        message: hooks.buildResumeReadyCommand(saved.id),
        isSelf: true,
      });
      resumeReadyUi.hooks.modules.TableRenderer.renderGame();
      assertButtonAffordance(resumeReadyUi.runtime, 'PokerResumeReadyButton', { hidden: true, enabled: false }, 'resume ready UI should hide READY RESUME after the member is ready');
      assert(
        panelText(findPanel(resumeReadyUi.runtime, 'PokerResumeStatusLabel')).includes('Ready: 2/2'),
        `resume ready UI should render the full ready quorum: ${panelText(findPanel(resumeReadyUi.runtime, 'PokerResumeStatusLabel')) || '<empty>'}`,
      );
      resumeLeaderUi.hooks.processChatRecord({
        sender: 'Bebop',
        message: hooks.buildResumeReadyCommand(saved.id),
        isSelf: false,
      });
      resumeLeaderUi.hooks.modules.TableRenderer.renderGame();
      assertStartButtonGate(resumeLeaderUi.runtime, 'START RESUME', true, false, 'resume leader UI should enable START RESUME after the second saved player is ready');
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
      nonLeaderResume.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeStartCommand(saved.id, 'abrams', saved.payload.nextHandNumber, 'sbad') });
      assertEqual(nonLeaderResume.hooks.state.game, null, 'non-selected resume sender should not create a game');
      assertDiagnosticContains(nonLeaderResume.runtime, nonLeaderMessagesBefore, nonLeaderStatusBefore, 'reject-non-leader-resume', 'non-selected resume start sender');

      const mismatchResume = createMenuRuntime();
      mismatchResume.hooks.importProgressSaveCode(saved.code);
      mismatchResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeLeaderCommand(saved.id) });
      mismatchResume.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeReadyCommand(saved.id) });
      const mismatchStatusBefore = panelText(findPanel(mismatchResume.runtime, 'PokerStatusLabel'));
      const mismatchMessagesBefore = mismatchResume.runtime.messages.length;
      mismatchResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeStartCommand(saved.id, 'bebop', saved.payload.nextHandNumber, 'smismatch') });
      assertEqual(mismatchResume.hooks.state.game, null, 'mismatched resume leader token should not create a game');
      assertDiagnosticContains(mismatchResume.runtime, mismatchMessagesBefore, mismatchStatusBefore, 'reject-resume-leader-mismatch', 'mismatched resume leader token');

      const wrongIdResume = createMenuRuntime();
      wrongIdResume.hooks.importProgressSaveCode(saved.code);
      wrongIdResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeLeaderCommand(saved.id) });
      wrongIdResume.hooks.processChatRecord({ sender: 'Abrams', message: hooks.buildResumeStartCommand('rwrong', 'abrams', saved.payload.nextHandNumber, 'swrong') });
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
        bustedResume.hooks.processChatRecord({ sender: 'Bebop', message: hooks.buildResumeStartCommand(bustedSave.id, 'bebop', bustedSave.payload.nextHandNumber, 'sbusted') });
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
      ['CALL $100', 'RAISE', 'FOLD'],
      'sender unknown',
      'unknown local synced action render',
    );
    assert(
      panelText(findPanel(unknownLocalSynced.runtime, 'PokerStatusLabel')).toLowerCase().includes('sender unknown') ||
        panelText(findPanel(unknownLocalSynced.runtime, 'PokerStatusLabel')).includes('you <unknown>') ||
        collectPanelTexts(findPanel(unknownLocalSynced.runtime, 'PokerActionButtons'), []).join('|').toLowerCase().includes('sender unknown'),
      'unknown local synced action render should surface the unknown sender in status or hint text',
    );
    const unknownHints = findDescendantsWithClass(findPanel(unknownLocalSynced.runtime, 'PokerActionButtons'), 'PokerActionHint', []);
    assertEqual(unknownHints.length, 0, 'unknown local synced action render should keep hint text out of the action button row');
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
    const waitingActions = renderedActionButtons(stableRenderRuntime.runtime);
    const waitingHints = findDescendantsWithClass(findPanel(stableRenderRuntime.runtime, 'PokerActionButtons'), 'PokerActionHint', []);
    assert(waitingActions.length > 0, 'waiting-for-other-player action render should show read-only action buttons');
    assertEqual(waitingHints.length, 0, 'waiting-for-other-player action render should not let hint text crowd action buttons');
  }

  const stableActive = createSyncedPartyRuntime('Abrams', 'sstable-active-render', tableRoster, 1);
  if (stableActive.hooks && stableActive.game) {
    stableActive.hooks.modules.TableRenderer.renderGame();
    const firstActionPanels = actionButtonPanels(stableActive.runtime);
    const firstPlayerRows = playerListRows(stableActive.runtime);
    const firstTableRows = tableSeatRows(stableActive.runtime);
    const firstLogLines = pokerLogLines(stableActive.runtime);
    const firstHintCount = findDescendantsWithClass(findPanel(stableActive.runtime, 'PokerActionButtons'), 'PokerActionHint', []).length;
    clearDomWrites(stableActive.runtime);
    stableActive.hooks.modules.TableRenderer.renderGame();
    const secondActionPanels = actionButtonPanels(stableActive.runtime);
    const secondPlayerRows = playerListRows(stableActive.runtime);
    const secondTableRows = tableSeatRows(stableActive.runtime);
    const secondLogLines = pokerLogLines(stableActive.runtime);
    const secondHintCount = findDescendantsWithClass(findPanel(stableActive.runtime, 'PokerActionButtons'), 'PokerActionHint', []).length;
    const writes = summarizeDomWrites(takeDomWrites(stableActive.runtime));
    assertSamePanelList(secondActionPanels, firstActionPanels, 'stable active repeated render should keep action button identities');
    assertSamePanelList(secondPlayerRows, firstPlayerRows, 'stable active repeated render should keep player row identities');
    assertSamePanelList(secondTableRows, firstTableRows, 'stable active repeated render should keep table seat identities');
    assertSamePanelList(secondLogLines, firstLogLines, 'stable active repeated render should keep log line identities');
    assertEqual(secondHintCount, firstHintCount, 'stable active repeated render should keep action hint count stable');
    assertEqual(writes.create, 0, 'stable active repeated render should not create panels');
    assertEqual(writes.delete, 0, 'stable active repeated render should not delete panels');
    assertEqual(writes.deleteChildren, 0, 'stable active repeated render should not clear child lists');
    assertEqual(writes.class, 0, 'stable active repeated render should not change classes');
    assertEqual(writes.text, 0, 'stable active repeated render should not change text');
    assertEqual(writes.hittest, 0, 'stable active repeated render should not change hittest');
    assertEqual(writes.event, 0, 'stable active repeated render should not rebind events');
    assertEqual(writes.imageSrc, 0, 'stable active repeated render should not rewrite card or chip image src values');
    assertEqual(writes.value, 0, 'stable active repeated render should not rewrite control values');
    assertEqual(writes.valueAttr, 0, 'stable active repeated render should not rewrite control value attributes');
    assertEqual(writes.attr, 0, 'stable active repeated render should not rewrite DOM attributes');
    assertEqual(writes.style, 0, 'stable active repeated render should not rewrite style properties');
  }

  const actionReuseRuntime = createGameRuntime(['Abrams', 'Bebop'], 'action-cache');
  if (actionReuseRuntime.hooks && actionReuseRuntime.game) {
    const actionActor = currentPlayer(actionReuseRuntime.game);
    const observer = actionReuseRuntime.game.players.find((player) => player.key !== actionActor.key) || actionReuseRuntime.game.players[0];
    actionReuseRuntime.runtime.config.PokerLocalPlayerKey = actionActor.key;
    actionReuseRuntime.runtime.config.PokerLocalPlayerName = actionActor.name;
    actionReuseRuntime.hooks.state.localPlayerKey = actionActor.key;
    actionReuseRuntime.hooks.modules.TableRenderer.renderGame();
    const firstActions = renderedActionButtons(actionReuseRuntime.runtime);
    const firstLabels = firstActions.map((entry) => entry.label);
    const firstPanels = firstActions.map((entry) => entry.panel);
    assert(firstPanels[0], 'active local actor action cache should render an action button');

    actionReuseRuntime.runtime.config.PokerLocalPlayerKey = observer.key;
    actionReuseRuntime.runtime.config.PokerLocalPlayerName = observer.name;
    actionReuseRuntime.hooks.state.localPlayerKey = observer.key;
    clearDomWrites(actionReuseRuntime.runtime);
    actionReuseRuntime.hooks.modules.TableRenderer.renderGame();
    const secondActions = renderedActionButtons(actionReuseRuntime.runtime);
    const secondPanels = secondActions.map((entry) => entry.panel);
    assertEqual(JSON.stringify(secondActions.map((entry) => entry.label)), JSON.stringify(firstLabels), 'active actor action cache should keep action labels across observer affordance change');
    assertSamePanelList(secondPanels, firstPanels, 'active actor action cache should reuse action button identities across observer affordance change');
    for (const action of secondActions) {
      assertEqual(action.enabled, false, 'active actor action cache should disable observer action buttons');
      assertEqual(action.readOnly, true, 'active actor action cache should mark observer action buttons read-only');
      assertEqual(action.hittest, false, 'active actor action cache should disable pointer input for observer action buttons');
    }
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
      ['CALL $100', 'RAISE', 'FOLD'],
      'Waiting for Abrams',
      'self-unknown member before local turn',
    );
    memberHooks.processChatRecord({ sender: 'Abrams', message: 'call' });
    assertEqual(memberHooks.state.game.currentIndex, 1, 'self-unknown member synced start should advance to the inferred member after leader call');
    assertEnabledActionButtons(
      selfUnknownMemberRuntime.runtime,
      ['CHECK', 'RAISE', 'FOLD'],
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
      ['CALL $200', 'RAISE', 'FOLD'],
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
    assertReadOnlyActionButtons(observerRuntime.runtime, ['CALL $200', 'RAISE', 'FOLD'], null, 'active observer late-join button state');

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

  const showdownWinnerRuntime = createGameRuntime(['Paradox', 'Warden'], 'pot-winner-showdown');
  if (showdownWinnerRuntime.hooks && showdownWinnerRuntime.game) {
    const showdownWinnerGame = showdownWinnerRuntime.game;
    showdownWinnerGame.community = [card('2', 'H'), card('3', 'D'), card('4', 'S'), card('9', 'C'), card('K', 'D')];
    showdownWinnerGame.players[0].cards = [card('A', 'H'), card('A', 'D')];
    showdownWinnerGame.players[1].cards = [card('Q', 'C'), card('J', 'D')];
    showdownWinnerGame.players[0].bet = 200;
    showdownWinnerGame.players[1].bet = 200;
    showdownWinnerGame.players[0].committed = 200;
    showdownWinnerGame.players[1].committed = 200;
    showdownWinnerGame.players[0].folded = false;
    showdownWinnerGame.players[1].folded = false;
    showdownWinnerGame.pot = 400;
    showdownWinnerGame.phase = 'river';
    showdownWinnerGame.active = true;
    showdownWinnerGame.finished = false;
    showdownWinnerRuntime.hooks.showdown();
    assertEqual(showdownWinnerGame.finished, true, 'single-winner showdown should finish through showdown payout');
    assertPotWinnerFeedback(showdownWinnerRuntime.runtime, ['Paradox'], 'single-winner showdown');
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
    assertPotWinnerFeedback(sidePotRuntime.runtime, ['Short', 'Middle', 'Deep'], 'side pot showdown');
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
      assertEqual(discoveryRuntime.hooks.modules.PartyReducer.roster().length, 0, 'unknown party-leader discovery should not invent a roster member');
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
