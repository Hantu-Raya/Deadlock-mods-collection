'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  MockPanel,
  createPanoramaHarness,
  runHpColorsSourcesInVm,
} = require('./hp-colors-panorama-test-adapter');

const rewriteRoot = path.resolve(__dirname, '../hp_colors_rewrite');
const layoutSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/layout/hud_escape_menu.xml'),
  'utf8',
);
const menuSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/hp_colors_menu.js'),
  'utf8',
);
const stateSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/hp_colors_state.js'),
  'utf8',
);

function installLayoutPanels(harness) {
  const ids = new Set(
    Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
  );
  for (const id of ids) {
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
    }));
  }
}

function bootMenu(options = {}) {
  const harness = createPanoramaHarness(options);
  installLayoutPanels(harness);
  runHpColorsSourcesInVm(stateSource, menuSource, harness);
  harness.$.HPColorsMenuBoot();
  harness.root.FindChildTraverse('HPColorsMenuButton').events.onactivate();
  harness.dispatches.length = 0;
  return harness;
}

function snapshot(harness) {
  return JSON.parse(
    harness.root.GetAttributeString('hp_colors_rewrite_config', '{}'),
  );
}

function configDispatches(harness) {
  return harness.dispatches.filter((args) => args[0] === 'ClientUI_FireOutput');
}

function openTransfer(harness) {
  harness.root.FindChildTraverse('HPColorsTransferButton').events.onactivate();
  return {
    root: harness.root.FindChildTraverse('HPColorsTransferDialog'),
    input: harness.root.FindChildTraverse('HPColorsTransferInput'),
    feedback: harness.root.FindChildTraverse('HPColorsTransferFeedback'),
    exportButton: harness.root.FindChildTraverse('HPColorsTransferExportButton'),
    importButton: harness.root.FindChildTraverse('HPColorsTransferImportButton'),
    closeButton: harness.root.FindChildTraverse('HPColorsTransferCloseButton'),
  };
}

function importText(harness, text) {
  const dialog = openTransfer(harness);
  dialog.input.text = text;
  dialog.importButton.events.onactivate();
  return dialog;
}

test('transfer dialog hides export code and retains one import field', () => {
  for (const id of [
    'HPColorsTransferButton',
    'HPColorsTransferDialog',
    'HPColorsTransferInput',
    'HPColorsTransferFeedback',
    'HPColorsTransferExportButton',
    'HPColorsTransferImportButton',
    'HPColorsTransferCloseButton',
  ]) assert.match(layoutSource, new RegExp(`id="${id}"`));
  assert.doesNotMatch(layoutSource, /HPColorsTransferExportText/);
  assert.match(layoutSource, /id="HPColorsTransferInput"[^>]*multiline="false"/);
});

test('opening transfer waits for an explicit user action', () => {
  const harness = bootMenu();
  const dialog = openTransfer(harness);

  assert.equal(
    harness.dispatches.some(
      (args) =>
        args[0] === 'TextEntryCopyToClipboard' ||
        args[0] === 'CopyStringToClipboard',
    ),
    false,
  );
  assert.equal(harness.clipboardWrites.length, 0);
  assert.equal(dialog.input.text, '');
  assert.equal(
    dialog.feedback.text,
    'READY — CHOOSE COPY CURRENT OR IMPORT & APPLY',
  );
  assert.equal(configDispatches(harness).length, 0);
});

test('compact export omits defaults and round-trips changed settings', () => {
  const source = bootMenu();
  source.root.FindChildTraverse('HPColorsEnemyVisibleToggle').events.onactivate();
  source.root.FindChildTraverse('HPColorsWidthEntry').text = '125';
  source.root.FindChildTraverse('HPColorsWidthEntry').events.ontextentrysubmit();
  const sourceDialog = openTransfer(source);
  sourceDialog.exportButton.events.onactivate();
  const code = source.clipboardWrites[0];

  assert.equal(code.includes('\n'), false);
  assert.equal(code.length < 100, true, code);
  assert.equal(sourceDialog.input.text, '');

  const destination = bootMenu();
  destination.clipboardText = code;
  destination.dispatches.length = 0;
  const beforeRevision = snapshot(destination).revision;
  const dialog = openTransfer(destination);
  dialog.importButton.events.onactivate();

  assert.equal(dialog.feedback.text, 'PASTED AND APPLIED');
  assert.equal(snapshot(destination).values.enemyVisible, false);
  assert.equal(snapshot(destination).values.widthScale, 125);
  assert.equal(configDispatches(destination).length, 1);
  assert.equal(snapshot(destination).revision, beforeRevision + 1);
});

test('copy current refreshes the compact clipboard code without showing it', () => {
  const harness = bootMenu();
  const dialog = openTransfer(harness);
  harness.root.FindChildTraverse('HPColorsEnemyVisibleToggle').events.onactivate();
  harness.dispatches.length = 0;
  dialog.exportButton.events.onactivate();

  assert.equal(harness.clipboardWrites.length, 1);
  assert.match(harness.clipboardWrites[0], /^HPCR2\{/);
  assert.equal(dialog.input.text, '');
  assert.equal(dialog.feedback.text, 'CURRENT SETTINGS COPIED');
  assert.equal(configDispatches(harness).length, 0);
});

test('manual one-line input remains available when clipboard paste is unavailable', () => {
  const harness = bootMenu({ clipboardPasteResult: false });
  const payload = 'HPCR2[[6,false],[1,120]]';
  const dialog = importText(harness, payload);

  assert.equal(dialog.feedback.text, 'IMPORTED AND APPLIED');
  assert.equal(snapshot(harness).values.enemyVisible, false);
  assert.equal(snapshot(harness).values.widthScale, 120);
  assert.equal(configDispatches(harness).length, 1);
});

test('automatic paste failure keeps the input visible and state unchanged', () => {
  const harness = bootMenu({ clipboardPasteResult: false });
  const before = snapshot(harness).values;
  const dialog = openTransfer(harness);
  harness.dispatches.length = 0;
  dialog.importButton.events.onactivate();

  assert.equal(dialog.feedback.text, 'CLIPBOARD PASTE UNAVAILABLE — PASTE CODE MANUALLY');
  assert.equal(dialog.root.BHasClass('Error'), true);
  assert.deepEqual(snapshot(harness).values, before);
  assert.equal(configDispatches(harness).length, 0);
});

test('compact import rejects malformed, duplicate, and wrong-type pairs', () => {
  for (const code of [
    'broken',
    'HPCR2{}',
    'HPCR2[[1,120],[1,130]]',
    'HPCR2[[6,"false"]]',
    'HPCR2[[-1,true]]',
    'HPCR2[[999,true]]',
  ]) {
    const harness = bootMenu();
    const before = snapshot(harness).values;
    const dialog = importText(harness, code);
    assert.equal(dialog.root.BHasClass('Error'), true, code);
    assert.deepEqual(snapshot(harness).values, before, code);
    assert.equal(configDispatches(harness).length, 0, code);
  }
});

test('compact code uses canonical ascending setting indexes', () => {
  const harness = bootMenu();
  harness.root.FindChildTraverse('HPColorsEnemyVisibleToggle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsWidthEntry').text = '125';
  harness.root.FindChildTraverse('HPColorsWidthEntry').events.ontextentrysubmit();
  const dialog = openTransfer(harness);
  dialog.exportButton.events.onactivate();
  const code = harness.clipboardWrites[0];
  const payload = JSON.parse(code.slice(5));
  assert.deepEqual(payload.v.map((pair) => pair[0]), [1, 6]);
  assert.deepEqual(payload.c, {});
});

test('valid compact import creates one Undo entry', () => {
  const harness = bootMenu();
  const before = snapshot(harness).values;
  importText(harness, 'HPCR2[[6,false]]');
  harness.dispatches.length = 0;
  const undo = harness.root.FindChildTraverse('HPColorsUndoButton');
  assert.equal(undo.enabled, true);
  undo.events.onactivate();
  assert.deepEqual(snapshot(harness).values, before);
  assert.equal(configDispatches(harness).length, 1);
  assert.equal(undo.enabled, false);
});

test('identical compact import does not publish or create history', () => {
  const harness = bootMenu();
  const dialog = importText(harness, 'HPCR2[]');
  assert.equal(dialog.feedback.text, 'SETTINGS ALREADY MATCH');
  assert.equal(configDispatches(harness).length, 0);
  assert.equal(harness.root.FindChildTraverse('HPColorsUndoButton').enabled, false);
});

test('native TextEntry copy succeeds when bare string copy is unavailable', () => {
  const harness = bootMenu({ clipboardResult: false });
  const dialog = openTransfer(harness);
  dialog.exportButton.events.onactivate();
  assert.equal(harness.clipboardWrites.length, 1);
  assert.equal(
    harness.clipboardWrites[0],
    'HPCR2{"v":[],"c":{}}',
  );
  assert.equal(dialog.input.text, '');
  assert.equal(dialog.feedback.text, 'CURRENT SETTINGS COPIED');
  assert.equal(dialog.root.BHasClass('Error'), false);
});

test('clipboard copy failure keeps compact code hidden with concrete feedback', () => {
  const harness = bootMenu({
    clipboardResult: false,
    textEntryCopyResult: false,
  });
  const dialog = openTransfer(harness);
  dialog.exportButton.events.onactivate();
  assert.equal(harness.clipboardWrites.length, 0);
  assert.equal(dialog.input.text, '');
  assert.equal(dialog.feedback.text, 'COPY FAILED — SETTINGS CODE NOT COPIED');
  assert.equal(dialog.root.BHasClass('Error'), true);
});

test('Escape closes transfer before the editor', () => {
  const harness = bootMenu();
  const dialog = openTransfer(harness);
  harness.$.HPColorsMenuCancel();
  assert.equal(dialog.root.BHasClass('Open'), false);
  assert.equal(harness.root.FindChildTraverse('HPColorsEditorRoot').BHasClass('Open'), true);
});
