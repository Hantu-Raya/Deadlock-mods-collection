'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadLayout, MockPanel, runInVm, latestPublishedConfig } = require('./boot-layout');
const { profile, launch, CURRENT } = require('./storage-fixture');
const { presetControls } = require('./preset-controls');
const copy = value => JSON.parse(JSON.stringify(value));
function menu(options = {}) {
  const b = loadLayout('hud_escape_menu.xml'); b.includeScripts();
  const h = b.harness; let api, hydrated = true;
  let bundle = { settings: copy(h.$.HPColorsV3Settings.defaults), presets: [], ...options.bundle };
  const commits = [];
  h.$.HPColorsV3Store = {
    attach(value) { api = value; (api.hydrateSettings || api.applySettings)(bundle.settings); },
    commit(config) {
      bundle.settings = copy(config.settings);
      if (Object.keys(config.rules || {}).length) bundle.rules = copy(config.rules); else delete bundle.rules;
      commits.push(copy(bundle));
    },
    getBundle() { return copy(bundle); }, isHydrated() { return hydrated; },
    replaceBundle(next) {
      next = copy(next);
      if (h.$.HPColorsV3Codec.encodeRecord(next).length > 192000) throw new Error('Save exceeds 192,000 characters; remove presets');
      if (next.presets.length > 128) throw new Error('A bundle can contain at most 128 presets');
      bundle = next; commits.push(copy(bundle)); api.refreshPresets(); return true;
    },
    exportBundleCode(settings) { const result = h.$.HPColorsV3Sharing.exportBundleCode({ ...bundle, settings }); if (!result.ok) throw new Error(result.message); return result.code; },
    decodeBundleCode(text) { const result = h.$.HPColorsV3Sharing.importBundleCode(text); if (!result.ok) throw new Error(result.message); return result.bundle; },
  };
  const native = h.contextPanel.FindChildTraverse('HPColorsNativePicker');
  if (native && options.native !== false) new MockPanel('TextEntry', native, 'HexValue');
  if (native && options.native === false) native.DeleteAsync(0);
  let focused = null;
  (function patch(panel) {
    panel.SetFocus = () => {
      if (focused === panel) return;
      const previous = focused; focused = panel;
      if (previous) { previous.focused = false; if (previous.events.onblur) previous.events.onblur(); }
      panel.focused = true; if (panel.events.onfocus) panel.events.onfocus();
    };
    panel.Children().forEach(patch);
  })(h.contextPanel);
  const dispatch = h.$.DispatchEvent;
  h.$.DispatchEvent = (...args) => {
    const result = dispatch(...args);
    if (args[0] === 'TextEntryChanged' && native && native.events.CitadelColorPickerColorChanged) native.events.CitadelColorPickerColorChanged(255, 255, 255);
    return result;
  };
  b.onload(); h.$.HPColorsMenuToggle();
  const find = id => { const p = h.contextPanel.FindChildTraverse(id); assert.ok(p, id); return p; };
  const fire = (id, event, ...args) => { const fn = find(id).events[event]; assert.equal(typeof fn, 'function', id + ':' + event); fn(...args); };
  return { b, h, find, fire, ...presetControls(find, id => fire(id, 'onactivate')), commits, settings: () => copy(api.getSettings()), bundle: () => copy(bundle),
    activate: id => fire(id, 'onactivate'), submit: (id, text) => { find(id).text = text; fire(id, 'ontextentrysubmit'); },
    cancel: () => runInVm(b.panelNode.attrs.oncancel, b.context), hydrated: value => { hydrated = value; }, api: () => api };
}

test('ticket 31: credits opens exact user text and data-backed portraits; CLOSE, ESC and backdrop leave settings, storage and Undo untouched', () => {
  const m = menu(), before = m.bundle(), settings = m.settings(), commits = m.commits.length;
  const publication = copy(latestPublishedConfig(m.h)), fires = m.h.dispatches.filter(event => event[0] === 'ClientUI_FireOutput').length;
  const entries = [
    ['Yesdaddy', 'yesdaddy', 85, 'hero_chessmaster', 'file://{images}/heroes/chessmaster_sm.psd', 'Taking his own time testing my mods and giving alot of Good suggestions'],
    ['Razorrzr', 'razorrzr', 31, 'hero_lash', 'file://{images}/heroes/lash_sm.psd', 'Critizing my ui and giving a solid gold'],
  ];
  const dialog = m.find('HPColorsCreditsDialog');
  assert.equal(dialog.BHasClass('Open'), false);
  for (const close of ['HPColorsCreditsCloseButton', 'HPColorsCreditsEscClose', null, 'HPColorsCreditsBackdrop']) {
    m.activate('HPColorsPreviewCreditsButton');
    assert.equal(dialog.BHasClass('Open'), true);
    assert.equal(m.find('HPColorsCreditsCloseButton').focused, true);
    for (const [id, name, heroId, key, portrait, text] of entries) {
      const hero = m.h.$.HPColorsV3Settings.heroes.find(hero => hero.key === key);
      assert.equal(hero.id, heroId); assert.equal(hero.portrait, portrait);
      assert.equal(m.find('HPColorsCredits' + id + 'Name').text, name);
      assert.equal(m.find('HPColorsCredits' + id + 'Text').text, text);
      assert.equal(m.find('HPColorsCredits' + id + 'Portrait').src, portrait);
    }
    if (close) m.activate(close); else m.cancel();
    assert.equal(dialog.BHasClass('Open'), false);
    assert.equal(m.find('HPColorsPreviewCreditsButton').focused, true);
    assert.equal(m.find('HPColorsMenuHost').BHasClass('HPC3Open'), true);
    assert.deepEqual(m.settings(), settings); assert.deepEqual(m.bundle(), before);
    assert.equal(m.commits.length, commits); assert.equal(m.find('HPColorsUndoButton').enabled, false);
    assert.deepEqual(copy(latestPublishedConfig(m.h)), publication);
    assert.equal(m.h.dispatches.filter(event => event[0] === 'ClientUI_FireOutput').length, fires);
  }
  const hero = m.h.$.HPColorsV3Settings.heroes.find(hero => hero.key === 'hero_chessmaster');
  hero.portrait = 'file://{images}/heroes/generated-credit-fixture.psd';
  m.activate('HPColorsPreviewCreditsButton');
  assert.equal(m.find('HPColorsCreditsYesdaddyPortrait').src, hero.portrait, 'the generated hero catalog supplies the image, not a copied path');
});

// Ticket 43: the credits dialog asks for bug reports and feedback on the author's Discord. FEEDBACK copies
// the username (the menu's own CopyStringToClipboard, as preset COPY); a refused or throwing clipboard
// still leaves the name readable. Nothing else changes: settings, storage, Undo and publication stay.
test('ticket 43: credits FEEDBACK copies the Discord username, and a failed copy keeps it readable', () => {
  const m = menu(), before = m.bundle(), settings = m.settings(), commits = m.commits.length;
  m.activate('HPColorsPreviewCreditsButton');
  const button = m.find('HPColorsFeedbackCopyButton'), status = m.find('HPColorsFeedbackStatus');
  assert.match(m.find('HPColorsFeedbackText').text, /hanturaya101/); assert.match(m.find('HPColorsFeedbackText').text, /Discord/);
  for (let p = button.GetParent(); p && p.id !== 'HPColorsCreditsDialog'; p = p.GetParent())
    assert.equal(p.BHasClass('HPC3CreditEntry'), false, 'not inside a credit entry (hittestchildren false)');
  assert.equal(status.text, '');
  const copies = () => m.h.dispatches.filter(event => event[0] === 'CopyStringToClipboard').map(event => event[1]);
  const n = copies().length;
  m.activate('HPColorsFeedbackCopyButton');
  assert.deepEqual(copies().slice(n), ['hanturaya101']);
  assert.match(status.text, /copied/i); assert.match(status.text, /hanturaya101/);
  assert.equal(m.find('HPColorsCreditsDialog').BHasClass('Open'), true, 'the dialog stays open');
  const dispatch = m.h.$.DispatchEvent;
  for (const fail of [() => false, () => { throw new Error('Invalid number of arguments for event in DispatchEvent for CopyStringToClipboard'); }]) {
    m.h.$.DispatchEvent = (...args) => args[0] === 'CopyStringToClipboard' ? fail() : dispatch(...args);
    m.activate('HPColorsFeedbackCopyButton');
    assert.doesNotMatch(status.text, /copied/i); assert.match(status.text, /hanturaya101/);
  }
  m.h.$.DispatchEvent = dispatch;
  m.activate('HPColorsCreditsCloseButton'); m.activate('HPColorsPreviewCreditsButton');
  assert.equal(status.text, '', 'reopening starts without an old status');
  assert.deepEqual(m.settings(), settings); assert.deepEqual(m.bundle(), before); assert.equal(m.commits.length, commits);
});

test('ticket 31: credits excludes every dialog/picker, cancels stale confirmations and preserves existing Undo', () => {
  const m = menu(), initial = m.settings();
  m.submit('HPColorsBarColorLowEnemyHex', '#123456');
  m.activate('HPColorsPresetSaveButton');
  m.find('HPColorsBundleCodeEntry').text = m.h.$.HPColorsV3Sharing.exportBundleCode(m.bundle()).code;
  const condition = m.h.$.HPColorsV3Settings.controls.find(row => row.key === 'barWidth' && row.side === 'enemy');
  const openers = [
    ['HPColorsResetPageDialog', () => m.activate('HPColorsResetPageButton')],
    ['HPColorsPickerDialog', () => m.activate('HPColorsBarColorLowEnemySwatch')],
    ['HPColorsConditionDialog', () => m.activate(condition.conditionId)],
    ['HPColorsHeroDialog', () => m.preset('baked_default', 'Heroes')],
    ['HPColorsPresetDeleteDialog', () => m.preset(0, 'Delete')],
    ['HPColorsBundleReplaceDialog', () => m.activate('HPColorsBundleReplaceButton')],
  ];
  const dialogs = m.find('HPColorsMenuHost').Children().filter(panel => panel.BHasClass('HPC3Dialog'));
  const onlyOpen = id => assert.deepEqual(dialogs.filter(panel => panel.BHasClass('Open')).map(panel => panel.id), [id]);
  for (const [id, open] of openers) {
    open(); onlyOpen(id);
    const before = m.bundle(), commits = m.commits.length;
    m.activate('HPColorsPreviewCreditsButton'); onlyOpen('HPColorsCreditsDialog');
    for (const confirm of ['ResetPage', 'PresetDelete', 'BundleReplace']) m.activate('HPColors' + confirm + 'ConfirmButton');
    assert.deepEqual(m.bundle(), before); assert.equal(m.commits.length, commits);
    assert.equal(m.find('HPColorsUndoButton').enabled, true);
    open(); onlyOpen(id);
    m.cancel();
  }
  m.activate('HPColorsPreviewCreditsButton'); m.activate('HPColorsNavNameButton');
  assert.equal(m.find('HPColorsCreditsDialog').BHasClass('Open'), false);
  m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), initial);
  m.activate('HPColorsPreviewCreditsButton'); m.activate('HPColorsCloseButton'); m.h.$.HPColorsMenuToggle();
  assert.equal(m.find('HPColorsCreditsDialog').BHasClass('Open'), false, 'closing and reopening the editor leaves no modal behind');
});

test('Undo retains forty immutable settings records and ignores no-op/hydration/folds', () => {
  const m = menu(); const initial = m.settings();
  assert.equal(m.find('HPColorsUndoButton').enabled, false);
  for (let i = 1; i <= 45; i++) m.submit('HPColorsBarColorLowEnemyHex', '#' + i.toString(16).padStart(6, '0'));
  m.submit('HPColorsBarColorLowEnemyHex', '#00002D');
  const fold = m.h.$.HPColorsV3Settings.menu.folds[0]; m.activate(fold.toggleId);
  for (let i = 0; i < 40; i++) m.activate('HPColorsUndoButton');
  assert.equal(m.settings().side.enemy.barColorLow, '#000005');
  assert.equal(m.find('HPColorsUndoButton').enabled, false);
  assert.equal(m.find(fold.id).BHasClass('Open'), !fold.open);
  const hydrated = copy(initial); hydrated.side.enemy.barColorLow = '#ABCDEF'; m.api().applySettings(hydrated);
  assert.equal(m.find('HPColorsUndoButton').enabled, false);
});

test('Slider gestures finish on release, blur or page change and ignore return-to-opening drags', () => {
  const m = menu(); const row = m.h.$.HPColorsV3Settings.controls.find(r => r.key === 'lowThreshold'); const original = m.settings();
  const slider = m.find(row.sliderId);
  for (const value of [26, 27, 28]) slider.value = value;
  m.h.releaseSlider(slider); m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), original);
  slider.value = 30; m.fire(row.sliderId, 'onblur');
  slider.value = 31;
  m.activate('HPColorsUndoButton'); assert.equal(m.settings().shared[row.key], 30);
  m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), original);
  slider.value = 32;
  m.activate('HPColorsNavPresetsButton'); m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), original);
  for (const value of [26, 25]) slider.value = value;
  m.h.releaseSlider(slider);
  assert.equal(m.find('HPColorsUndoButton').enabled, false, 'return-to-opening drag is a no-op');
});

test('Page reset confirms captured page, names hidden Advanced settings and both sides, one Undo record', () => {
  const m = menu(); const controls = m.h.$.HPColorsV3Settings.controls;
  const bar = controls.filter(r => r.page === 'Bar'); const next = m.settings();
  for (const row of bar) {
    const values = row.side === 'shared' ? next.shared : next.side[row.side];
    if (row.type === 'color') values[row.key] = '#123456';
    if (row.type === 'boolean') values[row.key] = !row.default;
    if (row.type === 'number') values[row.key] = row.default < row.bounds[1] ? row.default + row.step : row.default - row.step;
    if (row.type === 'enum') values[row.key] = row.options.find(option => option.value !== row.default).value;
  }
  assert.equal(m.api().applySettings(next), true); const before = m.settings(); const commits = m.commits.length;
  m.activate('HPColorsResetPageButton');
  assert.match(m.find('HPColorsResetPageMessage').text, /enemy and ally/i);
  assert.match(m.find('HPColorsResetPageMessage').text, /hidden Advanced/i);
  for (const row of bar.filter(r => r.level === 'advanced')) assert.ok(m.find('HPColorsResetPageMessage').text.includes(row.name || row.key));
  assert.equal(m.commits.length, commits); m.cancel(); assert.deepEqual(m.settings(), before);
  m.activate('HPColorsResetPageButton'); m.activate('HPColorsNavPresetsButton'); m.activate('HPColorsResetPageConfirmButton');
  assert.deepEqual(m.settings(), before, 'navigation cancels stale confirmation');
  m.activate('HPColorsNavBarButton'); m.activate('HPColorsResetPageButton'); m.activate('HPColorsResetPageConfirmButton');
  for (const row of bar) assert.equal((row.side === 'shared' ? m.settings().shared : m.settings().side[row.side])[row.key], row.default);
  m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), before);
});

test('Native picker seeds without edit, rejects invalid channels, accepts RGB, shares Undo and Escape restores opening color', () => {
  const m = menu(); const start = m.settings();
  m.activate('HPColorsBarColorLowEnemySwatch');
  assert.equal(m.find('HexValue').text, start.side.enemy.barColorLow.slice(1));
  assert.ok(m.h.dispatches.some(e => e[0] === 'TextEntryChanged' && e[1].id === 'HexValue'));
  const change = (...rgb) => m.fire('HPColorsNativePicker', 'CitadelColorPickerColorChanged', ...rgb);
  change(256, 2, 3); change(-1, 2, 3); change(NaN, 2, 3); assert.deepEqual(m.settings(), start);
  change(1, 2, 3); change(4, 5, 6); assert.equal(m.settings().side.enemy.barColorLow, '#040506');
  m.activate('HPColorsPickerDoneButton'); m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), start);
  m.submit('HPColorsBarColorMidEnemyHex', '#445566'); const beforePicker = m.settings();
  m.activate('HPColorsBarColorLowEnemySwatch'); change(10, 20, 30); m.cancel(); assert.deepEqual(m.settings(), beforePicker);
  m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), start, 'cancel preserves the older Undo record');
  assert.equal(m.find('HPColorsUndoButton').enabled, false);
});

test('Missing native picker keeps boot ready and hex-only picker supports cancel and one-step Undo', () => {
  const m = menu({ native: false }); const start = m.settings();
  assert.equal(m.find('HPColorsMenuHost').GetAttributeString('hpv3_boot', ''), 'ready');
  m.activate('HPColorsBarColorLowEnemySwatch'); assert.match(m.find('HPColorsPickerStatus').text, /hex/i);
  m.submit('HPColorsPickerHex', 'aabbcc'); m.submit('HPColorsPickerHex', '#010203'); m.cancel(); assert.deepEqual(m.settings(), start);
  m.activate('HPColorsBarColorLowEnemySwatch'); m.find('HPColorsPickerHex').text = '#112233'; m.activate('HPColorsPickerDoneButton');
  assert.equal(m.settings().side.enemy.barColorLow, '#112233', 'DONE also accepts an unsubmitted hex draft');
  m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), start);
});

test('Preset library names, apply/Undo, rename/reorder/copy, confirmed delete and baked hide/restore export intact', () => {
  const m = menu(); m.activate('HPColorsNavPresetsButton');
  m.submit('HPColorsPresetNameEntry', '  '); m.activate('HPColorsPresetSaveButton');
  assert.equal(m.bundle().presets.length, 1); assert.equal(m.bundle().presets[0].name, 'PRESET 1');
  m.submit('HPColorsBarColorLowEnemyHex', '#112233'); m.submit('HPColorsPresetNameEntry', '  Second  '); m.activate('HPColorsPresetSaveButton');
  assert.equal(m.bundle().presets[1].name, 'Second');
  m.preset(0, 'Apply'); assert.notEqual(m.settings().side.enemy.barColorLow, '#112233');
  m.activate('HPColorsUndoButton'); assert.equal(m.settings().side.enemy.barColorLow, '#112233');
  m.select(0).text = 'Renamed'; m.activate('HPColorsPresetSelectedRenameButton');
  m.preset(0, 'Down'); assert.deepEqual(m.bundle().presets.map(p => p.name), ['Second', 'Renamed']);
  m.preset(0, 'Copy'); assert.equal(m.bundle().presets.length, 2);
  const single = m.h.$.HPColorsV3Sharing.importBundleCode(m.h.clipboardWrites.at(-1));
  assert.equal(single.ok, true); assert.equal(single.bundle.presets.length, 1); assert.equal(single.bundle.presets[0].name, 'Second');
  m.preset(0, 'Delete'); assert.equal(m.bundle().presets.length, 2);
  m.activate('HPColorsPresetDeleteCancelButton'); assert.equal(m.bundle().presets.length, 2);
  m.preset(0, 'Delete'); m.activate('HPColorsPresetDeleteConfirmButton'); assert.equal(m.bundle().presets.length, 1);
  assert.deepEqual(m.bundle().hiddenBakedPresetIds, ['baked_default'], 'saving hides the baked default as in v2');
  m.activate('HPColorsPresetRestoreButton');
  m.preset('baked_default', 'Delete'); assert.deepEqual(m.bundle().hiddenBakedPresetIds, ['baked_default']);
  m.activate('HPColorsBundleCopyButton'); const exported = m.h.$.HPColorsV3Sharing.importBundleCode(m.find('HPColorsBundleCodeEntry').text);
  assert.equal(exported.ok, true); assert.deepEqual(copy(exported.bundle.presets), m.bundle().presets);
  assert.deepEqual(copy(exported.bundle.hiddenBakedPresetIds), ['baked_default']);
  m.activate('HPColorsPresetRestoreButton'); assert.deepEqual(m.bundle().hiddenBakedPresetIds, []);
  m.select('baked_default').text = 'Stock'; m.activate('HPColorsPresetSelectedRenameButton');
  assert.equal(m.bundle().bakedPresetNameOverrides.baked_default, 'Stock');
});

test('Preset cap, name validation, store-size refusal and hydration gate are atomic; all library tiles mount in a bounded scroll area', () => {
  const seed = menu().settings();
  const presets = Array.from({ length: 128 }, (_, i) => ({ id: 'p' + i, name: 'PRESET ' + (i + 1), settings: seed }));
  const m = menu({ bundle: { presets } }); m.activate('HPColorsNavPresetsButton');
  assert.equal(m.tiles().length, 128);
  assert.equal(m.tiles()[8].FindChildrenWithClassTraverse('HPC3PresetTileName')[0].text, 'PRESET 9');
  m.activate('HPColorsPresetSaveButton'); assert.match(m.find('HPColorsPresetStatus').text, /128/); assert.equal(m.bundle().presets.length, 128);
  m.preset(0, 'Copy'); assert.equal(m.bundle().presets.length, 128);
  const n = menu(); n.find('HPColorsPresetNameEntry').text = 'x'.repeat(49); n.activate('HPColorsPresetSaveButton'); assert.equal(n.bundle().presets.length, 0);
  n.hydrated(false); n.activate('HPColorsPresetSaveButton'); assert.equal(n.bundle().presets.length, 0); assert.match(n.find('HPColorsPresetStatus').text, /load/i);
  const big = menu({ bundle: { oversized: 'x'.repeat(150000) } }); big.activate('HPColorsPresetSaveButton');
  assert.equal(big.bundle().presets.length, 0); assert.match(big.find('HPColorsPresetStatus').text, /192,000/);
});

test('Auto PRESET N naming skips case-insensitive collisions and preserves imported metadata', () => {
  const seed = menu().settings(); const m = menu({ bundle: { presets: [{ id: 'p0', name: 'preset 1', settings: seed, routing: { keep: true } }], nextUserPresetNumber: 1, routing: { hero: 'p0' } } });
  m.activate('HPColorsPresetSaveButton'); assert.equal(m.bundle().presets[1].name, 'PRESET 2');
  assert.deepEqual(m.bundle().routing, { hero: 'p0' }); assert.deepEqual(m.bundle().presets[0].routing, { keep: true });
  const artifact = path.resolve(__dirname, '../.build/evidence/ticket10-menu-actions.json'); fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, JSON.stringify({ settings: m.settings(), bundle: m.bundle(), presetsRendered: m.find('HPColorsPresetList').Children().length }, null, 2));
});

test('Malformed imported library metadata does not crash hydration or trap automatic names', () => {
  const m = menu({ bundle: { hiddenBakedPresetIds: {}, bakedPresetNameOverrides: { baked_default: 42 }, nextUserPresetNumber: Number.MAX_SAFE_INTEGER } });
  assert.equal(m.find('HPColorsPresetDefaultNameLabel').text, 'Rewrite Default');
  m.activate('HPColorsPresetSaveButton');
  assert.equal(m.bundle().presets[0].name, 'PRESET 1');
  assert.deepEqual(m.bundle().hiddenBakedPresetIds, ['baked_default']);
});

test('Preset copy refusal is visible and a refreshed library cancels stale deletion', () => {
  const m = menu(); m.activate('HPColorsPresetSaveButton');
  const dispatch = m.h.$.DispatchEvent;
  m.h.$.DispatchEvent = (...args) => args[0] === 'CopyStringToClipboard' ? false : dispatch(...args);
  m.preset(0, 'Copy');
  assert.match(m.find('HPColorsPresetStatus').text, /could not be copied/i);
  m.preset(0, 'Delete');
  m.api().refreshPresets();
  m.activate('HPColorsPresetDeleteConfirmButton');
  assert.equal(m.bundle().presets.length, 1);
});

test('ticket 27: every EscClose uses the existing cancel route without committing drafts or retaining a stale confirmation', () => {
  const seedMenu = menu(), seed = seedMenu.settings();
  const slot = seedMenu.h.$.HPColorsV3Settings.slots.find(row => row.setting === 'barWidth' && row.side === 'enemy').slot;
  const rules = { [slot]: { slot: 1, minTier: 2, value: 158 } };
  const m = menu({ bundle: { rules, presets: [{ id: 'keep', name: 'Keep', settings: seed }] } });
  m.submit('HPColorsBarColorLowEnemyHex', '#123456');
  const opening = m.settings(), commits = m.commits.length;
  m.activate('HPColorsResetPageButton'); m.activate('HPColorsResetPageEscClose'); m.activate('HPColorsResetPageConfirmButton');
  assert.equal(m.find('HPColorsResetPageDialog').BHasClass('Open'), false); assert.deepEqual(m.settings(), opening); assert.equal(m.commits.length, commits);

  m.activate('HPColorsBarColorLowEnemySwatch'); m.submit('HPColorsPickerHex', '#654321');
  assert.equal(m.settings().side.enemy.barColorLow, '#654321'); m.activate('HPColorsPickerEscClose');
  assert.equal(m.find('HPColorsPickerDialog').BHasClass('Open'), false); assert.deepEqual(m.settings(), opening);
  assert.equal(m.find('HPColorsBarColorLowEnemySwatch').focused, true);
  m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), seed, 'picker cancel retains the pre-picker Undo record');

  const control = m.h.$.HPColorsV3Settings.controls.find(row => row.type === 'color'), ruleBefore = copy(m.api().getRules());
  m.activate(control.conditionId); m.find('HPColorsConditionHex').text = '#102030'; m.fire('HPColorsConditionHex', 'ontextentrychange');
  m.activate('HPColorsConditionSlot2'); m.activate('HPColorsConditionSlot2');
  assert.equal(m.find('HPColorsConditionSlot2').BHasClass('Checked'), true); assert.equal(m.find('HPColorsConditionSlot2Label').text, 'TIER 2+');
  m.activate('HPColorsConditionSwatch'); m.submit('HPColorsPickerHex', '#405060'); m.activate('HPColorsPickerEscClose');
  assert.equal(m.find('HPColorsConditionDialog').BHasClass('Open'), true); assert.equal(m.find('HPColorsConditionHex').text, '#102030');
  m.activate('HPColorsConditionEscClose'); m.activate('HPColorsConditionApplyButton');
  assert.equal(m.find('HPColorsConditionDialog').BHasClass('Open'), false); assert.deepEqual(copy(m.api().getRules()), ruleBefore); assert.deepEqual(m.settings(), seed);
  assert.deepEqual(m.bundle().rules, rules, 'the mock commit keeps the stored authored rule');
  assert.equal(m.find(control.conditionId).focused, true);

  m.activate('HPColorsNavPresetsButton'); const beforeDelete = m.bundle(), deleteCommits = m.commits.length;
  m.preset(0, 'Delete'); m.activate('HPColorsPresetDeleteEscClose'); m.activate('HPColorsPresetDeleteConfirmButton');
  assert.equal(m.find('HPColorsPresetDeleteDialog').BHasClass('Open'), false); assert.deepEqual(m.bundle(), beforeDelete); assert.equal(m.commits.length, deleteCommits);
  const next = copy(beforeDelete); next.settings.side.enemy.barColorLow = '#AABBCC'; next.presets = [];
  const code = m.h.$.HPColorsV3Sharing.exportBundleCode(next); assert.equal(code.ok, true);
  m.find('HPColorsBundleCodeEntry').text = code.code; m.activate('HPColorsBundleReplaceButton');
  assert.equal(m.find('HPColorsBundleReplaceDialog').BHasClass('Open'), true);
  m.activate('HPColorsBundleReplaceEscClose'); m.activate('HPColorsBundleReplaceConfirmButton');
  assert.equal(m.find('HPColorsBundleReplaceDialog').BHasClass('Open'), false); assert.deepEqual(m.bundle(), beforeDelete); assert.equal(m.commits.length, deleteCommits);

  m.preset('baked_default', 'Heroes');
  const toggle = m.find('HPColorsHeroItem0Toggle'), hero = toggle.GetAttributeString('hpv3_hero_key', '');
  assert.equal(toggle.BHasClass('HPC3HeroTile'), true); assert.equal(toggle.BHasClass('SelectedHero'), false);
  m.activate(toggle.id); assert.equal(m.bundle().heroPresets[hero], 'baked_default');
  assert.equal(m.find(toggle.id).BHasClass('SelectedHero'), true); assert.equal(m.find(toggle.id).BHasClass('Checked'), true);
  const assigned = m.bundle(), heroCommits = m.commits.length; m.activate('HPColorsHeroEscClose');
  assert.equal(m.find('HPColorsHeroDialog').BHasClass('Open'), false); assert.deepEqual(m.bundle(), assigned); assert.equal(m.commits.length, heroCommits);
  assert.equal(m.find('HPColorsPresetSelectedHeroesButton').focused, true);
  assert.equal(m.find('HPColorsMenuHost').BHasClass('HPC3Open'), true, 'close only the dialog, not the editor');
});

test('stored rules survive condition cancel, keyboard Escape, side selection, preview side and menu close through a real storage restart', () => {
  const seed = menu(), contract = seed.h.$.HPColorsV3Settings;
  const row = contract.controls.find(row => row.key === 'barWidth' && row.side === 'enemy');
  const cell = contract.slots.find(slot => slot.setting === row.key && slot.side === row.side).slot;
  const rules = { [cell]: { slot: 1, minTier: 2, value: 158 } };
  const disk = profile({ [CURRENT]: seed.h.$.HPColorsV3Codec.encodeRecord({ settings: seed.settings(), rules, presets: [] }) });
  const m = launch(disk); m.run(3000);
  const h = m.harness, store = h.$.HPColorsV3Store;
  const find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  const fire = (id, event = 'onactivate') => { assert.equal(typeof find(id).events[event], 'function', id + ':' + event); find(id).events[event](); };
  const unchanged = () => assert.deepEqual(copy(store.getBundle().rules), rules);
  unchanged(); h.$.HPColorsMenuToggle();
  for (const cancel of [() => fire('HPColorsConditionEscClose'), () => h.$.HPColorsMenuCancel()]) {
    fire(row.conditionId); find('HPColorsConditionNumberEntry').text = '120'; fire('HPColorsConditionNumberEntry', 'ontextentrychange');
    cancel(); assert.equal(find('HPColorsConditionDialog').BHasClass('Open'), false);
    assert.equal(find('HPColorsMenuHost').BHasClass('HPC3Open'), true); unchanged();
  }
  const group = h.$.HPColorsV3Settings.menu.groups.find(group => group.sides);
  for (const tab of [group.sides[1], group.sides[0]]) { fire(tab.id); unchanged(); }
  for (const side of ['Ally', 'Enemy']) { fire('HPColorsPreviewSideOption' + side); unchanged(); }
  m.edit('#112233'); unchanged(); // Force an ordinary commit to carry the authored rule through storage.
  fire('HPColorsCloseButton'); assert.equal(find('HPColorsMenuHost').BHasClass('HPC3Open'), false); unchanged();
  h.$.HPColorsMenuToggle(); h.$.HPColorsMenuCancel(); assert.equal(find('HPColorsMenuHost').BHasClass('HPC3Open'), false); unchanged();
  m.run(8000); assert.deepEqual(copy(m.codec.classifyRecord(disk.disk.get(CURRENT)).bundle.rules), rules);
  const restarted = launch(disk); restarted.run(3000);
  assert.deepEqual(copy(restarted.harness.$.HPColorsV3Store.getBundle().rules), rules);
  assert.equal(restarted.settings().side.enemy.barColorLow, '#112233');
});

test('round 3: selecting a preset never applies; rename, reorder and hydration retain its id and mounted tile', () => {
  const defaults = menu().settings(), other = copy(defaults); other.side.enemy.barColorLow = '#112233';
  const m = menu({ bundle: { presets: [{ id: 'a.b', name: 'First', settings: other }, { id: 'a_b', name: 'Second', settings: defaults }] } });
  const before = m.settings(), commits = m.commits.length, first = m.tiles()[0], list = m.find('HPColorsPresetList');
  let scrolled = 0; first.ScrollParentToMakePanelFit = () => scrolled++;
  list.scrollOffsetY = 127;
  m.select(0); assert.deepEqual(m.settings(), before); assert.equal(m.commits.length, commits);
  assert.equal(first.BHasClass('Selected'), true); assert.equal(m.tiles()[1].BHasClass('Selected'), false);
  assert.notEqual(first.id, m.tiles()[1].id, 'arbitrary valid ids cannot collide after sanitizing');
  m.find('HPColorsPresetSelectedNameEntry').text = 'Renamed'; m.activate('HPColorsPresetSelectedRenameButton');
  assert.ok(m.tiles()[0] === first); assert.equal(first.BHasClass('Selected'), true);
  assert.equal(list.scrollOffsetY, 127);
  m.activate('HPColorsPresetSelectedDownButton');
  assert.ok(m.tiles()[1] === first); assert.equal(first.BHasClass('Selected'), true);
  assert.equal(m.find('HPColorsPresetSelectedNameEntry').text, 'Renamed'); assert.ok(scrolled > 0);
  m.activate('HPColorsPresetSelectedCopyButton');
  const exported = m.h.$.HPColorsV3Sharing.importBundleCode(m.h.clipboardWrites.at(-1));
  assert.equal(exported.bundle.presets[0].id, 'a.b', 'toolbar acts on selection, not current index');
  m.h.$.HPColorsV3Store.replaceBundle({ ...m.bundle(), presets: m.bundle().presets.map(p => ({ ...p, name: p.id === 'a.b' ? 'Hydrated' : p.name })) });
  assert.equal(m.find('HPColorsPresetSelectedNameEntry').text, 'Hydrated'); assert.equal(first.BHasClass('Selected'), true);
  assert.ok(m.tiles()[1] === first); assert.ok(m.find('HPColorsPresetList') === list);
});

test('round 3: the first hero gear toggles only default-for-unassigned and grid toggles never remount tiles', () => {
  const m = menu({ bundle: { heroPresets: { hero_inferno: 'baked_default' } } });
  m.preset('baked_default', 'Heroes');
  const list = m.find('HPColorsHeroList'), tiles = list.Children(), gear = tiles[0];
  assert.equal(gear.id, 'HPColorsHeroDefaultToggle');
  m.activate(gear.id); assert.equal(m.bundle().heroDefault, 'baked_default');
  assert.deepEqual(m.bundle().heroPresets, { hero_inferno: 'baked_default' });
  assert.equal(gear.BHasClass('SelectedHero'), true);
  m.activate(gear.id); assert.equal(m.bundle().heroDefault, null);
  for (let i = 0; i < tiles.length; i++) assert.ok(list.Children()[i] === tiles[i]);
  m.activate('HPColorsHeroCloseButton'); m.preset('baked_default', 'Heroes');
  assert.ok(list.Children()[0] !== gear, 'one fresh grid per dialog open');
});

test('round 3: hero portraits use data paths and deliberate null fallbacks; search dims, counts and scrolls without rebuilding', () => {
  const m = menu(); m.preset('baked_default', 'Heroes');
  const list = m.find('HPColorsHeroList'), tiles = list.Children(), contract = m.h.$.HPColorsV3Settings;
  for (const tile of tiles.slice(1)) {
    const hero = contract.heroes.find(hero => hero.key === tile.GetAttributeString('hpv3_hero_key', ''));
    const image = tile.FindChildrenWithClassTraverse('HPC3HeroPortrait')[0];
    assert.equal(image.src, hero.portrait || 's2r://panorama/images/control_icons/no_hero_png.vtex');
  }
  const match = tiles.find(tile => tile.GetAttributeString('hpv3_hero_key', '') === 'hero_inferno');
  let scrolls = 0; match.ScrollParentToMakePanelFit = () => scrolls++;
  m.find('HPColorsHeroSearchField').text = 'infernus'; m.fire('HPColorsHeroSearchField', 'ontextentrychange');
  assert.equal(list.BHasClass('HeroSearchActive'), true); assert.equal(match.BHasClass('HeroSearchMatch'), true); assert.equal(scrolls, 1);
  assert.equal(m.find('HPColorsHeroMatchCount').text, '1 / 45 heroes');
  const { computed } = require('./style-cascade'), miss = tiles.find(tile => !tile.BHasClass('HeroSearchMatch'));
  assert.equal(computed(miss, 'opacity'), '0.2'); assert.equal(computed(miss, 'brightness'), '0.6'); assert.equal(computed(miss, 'saturation'), '0.3');
  m.find('HPColorsHeroSearchField').text = ''; m.fire('HPColorsHeroSearchField', 'ontextentrychange');
  assert.equal(list.BHasClass('HeroSearchActive'), false); assert.equal(m.find('HPColorsHeroMatchCount').text, '45 / 45 heroes');
  assert.ok(list.Children()[1] === tiles[1]);
});

test('round 3: rejected import and hex/number commits shake fields, not intermediate condition keystrokes', () => {
  const m = menu(), store = m.h.$.HPColorsV3Store;
  store.importSettingsCode = () => { throw new Error('should not mutate'); };
  store.decodeSettingsCode = () => { throw new Error('Invalid code'); };
  m.find('HPColorsSettingsCodeEntry').text = 'bad'; m.activate('HPColorsSettingsImportButton');
  assert.equal(m.find('HPColorsSettingsCodeEntry').BHasClass('HPC3NegativeShake'), true);
  assert.match(m.find('HPColorsCodeStatus').text, /Invalid code/);
  m.submit('HPColorsBarColorLowEnemyHex', '#BAD');
  assert.equal(m.find('HPColorsBarColorLowEnemyHex').BHasClass('HPC3NegativeShake'), true);
  const row = m.h.$.HPColorsV3Settings.controls.find(row => row.key === 'lowThreshold');
  m.submit(row.entryId, 'nope'); assert.equal(m.find(row.entryId).BHasClass('HPC3NegativeShake'), true);
  m.activate('HPColorsConditionBarColorLowEnemy'); m.find('HPColorsConditionHex').text = '#B';
  m.fire('HPColorsConditionHex', 'ontextentrychange'); assert.equal(m.find('HPColorsConditionHex').BHasClass('HPC3NegativeShake'), false);
  m.fire('HPColorsConditionHex', 'ontextentrysubmit'); assert.equal(m.find('HPColorsConditionHex').BHasClass('HPC3NegativeShake'), true);
  assert.match(m.find('HPColorsConditionStatus').text, /valid/);
  m.activate('HPColorsConditionCancelButton'); m.activate('HPColorsBarColorLowEnemySwatch');
  const opening = m.settings(); m.find('HPColorsPickerHex').text = '#bad'; m.activate('HPColorsPickerDoneButton');
  assert.equal(m.find('HPColorsPickerDialog').BHasClass('Open'), true);
  assert.equal(m.find('HPColorsPickerHex').BHasClass('HPC3NegativeShake'), true);
  assert.match(m.find('HPColorsPickerStatus').text, /valid hex/); assert.deepEqual(m.settings(), opening);
  m.activate('HPColorsPickerCancelButton');
});

test('round 3: notice confirmations focus Cancel and return focus to their exact toolbar or page opener', () => {
  const m = menu(); m.activate('HPColorsResetPageButton');
  assert.equal(m.find('HPColorsResetPageCancelButton').focused, true);
  m.cancel(); assert.equal(m.find('HPColorsResetPageButton').focused, true);
  m.activate('HPColorsPresetSaveButton'); m.preset(0, 'Delete');
  assert.equal(m.find('HPColorsPresetDeleteCancelButton').focused, true);
  m.cancel(); assert.equal(m.find('HPColorsPresetSelectedDeleteButton').focused, true);
  m.find('HPColorsBundleCodeEntry').text = m.h.$.HPColorsV3Sharing.exportBundleCode(m.bundle()).code;
  m.activate('HPColorsBundleReplaceButton'); assert.equal(m.find('HPColorsBundleReplaceCancelButton').focused, true);
  m.cancel(); assert.equal(m.find('HPColorsBundleReplaceButton').focused, true);
});

test('round 3: script reinclusion adopts stable library tiles without duplicates and rebinds retired callbacks', () => {
  const m = menu(); m.activate('HPColorsPresetSaveButton'); m.activate('HPColorsPresetSaveButton');
  const tiles = m.tiles();
  runInVm(fs.readFileSync(path.join(__dirname, '../panorama/scripts/hp_colors_v3_menu.js'), 'utf8'), m.b.context);
  m.b.onload();
  assert.equal(m.tiles().length, 2);
  for (let i = 0; i < tiles.length; i++) assert.ok(m.tiles()[i] === tiles[i]);
  m.select(1); assert.equal(m.tiles()[1].BHasClass('Selected'), true);
  m.find('HPColorsPresetSelectedNameEntry').text = 'After reload'; m.activate('HPColorsPresetSelectedRenameButton');
  assert.equal(m.bundle().presets[1].name, 'After reload');
});

test('round 3 polish: refused SAVE NEW retains the selected tile and actionable toolbar', () => {
  const m = menu(); m.activate('HPColorsPresetSaveButton');
  const selected = m.tiles()[0], original = m.bundle(), replace = m.h.$.HPColorsV3Store.replaceBundle;
  m.h.$.HPColorsV3Store.replaceBundle = () => false;
  m.find('HPColorsPresetNameEntry').text = 'Refused'; m.activate('HPColorsPresetSaveButton');
  assert.deepEqual(m.bundle(), original); assert.equal(selected.BHasClass('Selected'), true);
  assert.equal(m.find('HPColorsPresetNameEntry').text, 'Refused');
  assert.match(m.find('HPColorsPresetStatus').text, /refused/i);
  m.h.$.HPColorsV3Store.replaceBundle = replace;
  m.find('HPColorsPresetSelectedNameEntry').text = 'Still selected'; m.activate('HPColorsPresetSelectedRenameButton');
  assert.equal(m.bundle().presets[0].name, 'Still selected');
  assert.equal(m.find('HPColorsPresetSelectedApplyButton').enabled, true);
});

test('round 3 polish: REPLACE ALL immediately resyncs the applied check on retained tiles', () => {
  const m = menu(); m.activate('HPColorsPresetSaveButton'); m.activate('HPColorsPresetSaveButton');
  const [first, second] = m.tiles(), presets = m.bundle().presets;
  m.api().applyPresetSettings(presets[0].settings, presets[0].id, false, false, {});
  assert.equal(first.BHasClass('Applied'), true); assert.equal(second.BHasClass('Applied'), false);
  const replacement = { ...m.bundle(), sourcePresetId: presets[1].id, sourceWasMapped: false };
  m.find('HPColorsBundleCodeEntry').text = m.h.$.HPColorsV3Sharing.exportBundleCode(replacement).code;
  m.activate('HPColorsBundleReplaceButton'); m.activate('HPColorsBundleReplaceConfirmButton');
  assert.match(m.find('HPColorsCodeStatus').text, /Bundle replaced/);
  assert.ok(m.tiles()[0] === first); assert.ok(m.tiles()[1] === second);
  assert.equal(first.BHasClass('Applied'), false); assert.equal(second.BHasClass('Applied'), true);
  const { computed } = require('./style-cascade');
  assert.equal(computed(second.FindChildrenWithClassTraverse('HPC3PresetSource')[0], 'visibility'), 'visible');
  assert.equal(computed(first.FindChildrenWithClassTraverse('HPC3PresetSource')[0], 'visibility'), 'collapse');
});

test('round 3 polish: invalid picker draft survives blur and DONE rejects it before closing', () => {
  const m = menu({ native: false }), opening = m.settings();
  m.activate('HPColorsBarColorLowEnemySwatch');
  m.find('HPColorsPickerHex').text = '#bad'; m.find('HPColorsPickerDoneButton').SetFocus();
  assert.equal(m.find('HPColorsPickerHex').text, '#bad', 'native blur runs before activation');
  m.activate('HPColorsPickerDoneButton');
  assert.equal(m.find('HPColorsPickerDialog').BHasClass('Open'), true);
  assert.deepEqual(m.settings(), opening); assert.match(m.find('HPColorsPickerStatus').text, /valid hex/);
  m.find('HPColorsPickerHex').text = '#112233'; m.activate('HPColorsPickerDoneButton');
  assert.equal(m.find('HPColorsPickerDialog').BHasClass('Open'), false);
  assert.equal(m.settings().side.enemy.barColorLow, '#112233');
});

test('round 3 polish: empty hidden-default library has no ghost selection and can restore or save', () => {
  const m = menu(); m.preset('baked_default', 'Delete');
  const entry = m.find('HPColorsPresetSelectedNameEntry');
  assert.equal(m.find('HPColorsPresetDefault').BHasClass('Selected'), false);
  assert.equal(entry.text, ''); assert.equal(entry.enabled, false);
  for (const role of ['Apply', 'Rename', 'Up', 'Down', 'Copy', 'Delete', 'Heroes', 'Default']) {
    const button = m.find('HPColorsPresetSelected' + role + 'Button');
    assert.equal(button.enabled, false); assert.equal(button.BHasClass('Checked'), false);
    m.activate(button.id);
  }
  assert.equal(m.find('HPColorsHeroDialog').BHasClass('Open'), false);
  assert.equal(m.find('HPColorsPresetRestoreButton').enabled, true);
  assert.equal(m.find('HPColorsPresetLibraryHeading').text, 'LIBRARY · 0/128');
  m.activate('HPColorsPresetRestoreButton');
  assert.equal(entry.enabled, true); assert.equal(entry.text, 'Rewrite Default');
  assert.equal(m.find('HPColorsPresetDefault').BHasClass('Selected'), true);
  m.preset('baked_default', 'Delete'); m.activate('HPColorsPresetSaveButton');
  assert.equal(m.tiles()[0].BHasClass('Selected'), true); assert.equal(entry.enabled, true);
  assert.equal(m.find('HPColorsPresetLibraryHeading').text, 'LIBRARY · 1/128');
});

test('round 3 polish: default gear is named Default and never displays another-owner dot', () => {
  const m = menu({ bundle: { heroDefault: 'baked_default' } });
  m.activate('HPColorsPresetSaveButton'); m.preset(0, 'Heroes');
  const gear = m.find('HPColorsHeroDefaultToggle'), { computed } = require('./style-cascade');
  assert.equal(gear.FindChildrenWithClassTraverse('HPC3HeroName')[0].text, 'Default');
  assert.equal(gear.BHasClass('AssignedElsewhere'), false);
  assert.equal(computed(gear.FindChildrenWithClassTraverse('HPC3HeroAssignedDot')[0], 'visibility'), 'collapse');
  m.fire(gear.id, 'onfocus'); assert.match(m.h.dispatches.at(-1)[2], /Default for unassigned heroes/);
  m.activate(gear.id); assert.equal(gear.BHasClass('SelectedHero'), true);
  assert.equal(computed(gear.FindChildrenWithClassTraverse('HPC3HeroName')[0], 'visibility'), 'visible');
  m.activate('HPColorsHeroCloseButton'); assert.equal(m.find('HPColorsPresetSelectedHeroesButton').focused, true);
});

test('round 3 polish: dialog return focus styling clears when focus moves without a stuck class', () => {
  const m = menu(); m.activate('HPColorsPresetSaveButton'); m.preset(0, 'Delete'); m.cancel();
  const opener = m.find('HPColorsPresetSelectedDeleteButton'), { computed } = require('./style-cascade');
  assert.equal(opener.focused, true); assert.equal(computed(opener, 'brightness'), '1.3');
  m.find('HPColorsPresetNameEntry').SetFocus();
  assert.equal(opener.focused, false); assert.equal(computed(opener, 'brightness'), undefined);
  assert.equal(opener.BHasClass('Checked'), false); assert.equal(opener.BHasClass('Selected'), false);
});

test('ticket 29: Bundle COPY round-trips the live draft, default source and hero routes through real storage', () => {
  const f = launch(profile()); f.run(2000);
  const h = f.harness, store = h.$.HPColorsV3Store;
  const find = id => h.contextPanel.FindChildTraverse(id);
  const copyBundle = () => {
    find('HPColorsBundleCopyButton').events.onactivate();
    assert.equal(find('HPColorsCodeStatus').text, 'Bundle code copied.');
    assert.equal(h.clipboardWrites.at(-1), find('HPColorsBundleCodeEntry').text);
    assert.deepEqual(copy(store.decodeBundleCode(h.clipboardWrites.at(-1))), copy(store.getBundle()));
  };
  copyBundle();
  const bundle = store.getBundle();
  bundle.presets = [{ id: 'user-1', name: 'My preset', settings: copy(bundle.settings) }];
  bundle.sourcePresetId = 'baked_default'; bundle.sourceWasMapped = false;
  bundle.bakedPresetHidden = true;
  bundle.heroPresets = { hero_inferno: 'user-1' }; bundle.heroDefault = 'baked_default';
  store.replaceBundle(bundle); f.edit('#123456'); copyBundle();
  store.applyPreset(bundle.presets[0], false, false); copyBundle();
  for (const metadata of [{ sourcePresetId: 'missing' }, { heroDefault: 'missing' },
    { heroPresets: { hero_inferno: 'missing' } }]) {
    const before = copy(store.getBundle());
    assert.throws(() => store.replaceBundle({ ...before, ...metadata }), /preset/i);
    assert.deepEqual(copy(store.getBundle()), before, 'invalid routes cannot reach the exportable draft');
  }
});

test('ticket 29: oversized Bundle COPY reports its limit without replacing the clipboard or draft', () => {
  const f = launch(profile()); f.run(2000);
  const h = f.harness, store = h.$.HPColorsV3Store;
  const find = id => h.contextPanel.FindChildTraverse(id);
  find('HPColorsBundleCopyButton').events.onactivate();
  const code = find('HPColorsBundleCodeEntry').text, copies = h.clipboardWrites.length;
  const bundle = store.getBundle(), dense = copy(bundle.settings);
  h.$.HPColorsV3Settings.controls.filter(row => row.type === 'color').forEach(row => {
    (row.side === 'shared' ? dense.shared : dense.side[row.side])[row.key] = '#123456';
  });
  bundle.presets = Array.from({ length: 128 }, (_, i) => ({ id: 'user-' + i, name: 'Preset ' + i, settings: copy(dense) }));
  assert.equal(store.replaceBundle(bundle), true, 'valid save can exceed the smaller share-code limit');
  const before = copy(store.getBundle());
  find('HPColorsBundleCopyButton').events.onactivate();
  assert.match(find('HPColorsCodeStatus').text, /32,768.*fewer presets/);
  assert.equal(h.clipboardWrites.length, copies);
  assert.equal(find('HPColorsBundleCodeEntry').text, code);
  assert.deepEqual(copy(store.getBundle()), before);
});

test('ticket 29: native numeric and hue drags each undo once after SliderReleased or release-outside blur', () => {
  for (const [id, values] of [['HPColorsLowThresholdSlider', [26, 40, 62, 64]],
    ['HPColorsBarColorLowEnemyHueSlider', [100, 300, 600]]]) {
    for (const end of ['SliderReleased', 'onblur']) {
      const m = menu(), before = m.settings(), slider = m.find(id);
      for (const value of values) slider.value = value;
      if (end === 'SliderReleased') m.h.releaseSlider(slider);
      else m.fire(id, end);
      m.activate('HPColorsUndoButton');
      assert.deepEqual(m.settings(), before, id + ':' + end);
      assert.equal(m.find('HPColorsUndoButton').enabled, false, 'one gesture, not a history entry per value event');
    }
  }
});

test('ticket 29: keyboard values without SliderReleased finish at blur before a later same-row or different-row drag', () => {
  for (const [id, values] of [['HPColorsLowThresholdSlider', [26, 40, 64]],
    ['HPColorsBarColorLowEnemyHueSlider', [100, 300, 600]]]) {
    const m = menu(), original = m.settings(), slider = m.find(id);
    slider.value = values[0]; m.fire(id, 'onblur');
    const afterKeyboard = m.settings();
    slider.value = values[1]; slider.value = values[2]; m.h.releaseSlider(slider);
    m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), afterKeyboard);
    m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), original);
    slider.value = values[0]; // No native release and no blur: another row still separates history.
    const beforeOther = m.settings(), other = m.find('HPColorsBarWidthEnemySlider');
    other.value = 150; other.value = 175;
    m.h.releaseSlider(slider); // A delayed release from the earlier row must not end this drag.
    other.value = 200; m.h.releaseSlider(other);
    m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), beforeOther);
    m.activate('HPColorsUndoButton'); assert.deepEqual(m.settings(), original);
  }
});

for (const kind of ['Settings', 'Bundle']) {
  for (const failure of ['throw', 'false']) {
    test(`ticket 29: ${kind} COPY falls back when direct clipboard returns ${failure}`, () => {
      const harnessOptions = failure === 'throw'
        ? { clipboardThrows: 'Invalid number of arguments for event in DispatchEvent for CopyStringToClipboard' }
        : { clipboardResult: false };
      const f = launch(profile(), { boot: () => loadLayout('hud_escape_menu.xml', { harnessOptions }) }); f.run(2000);
      const h = f.harness, find = id => h.contextPanel.FindChildTraverse(id);
      const entry = find('HPColors' + kind + 'CodeEntry');
      find('HPColors' + kind + 'CopyButton').events.onactivate();
      assert.equal(find('HPColorsCodeStatus').text, kind + ' code copied.');
      assert.match(entry.text, /^HPC3/);
      assert.equal(h.clipboardWrites.at(-1), entry.text);
      assert.equal(entry.focused, true);
      assert.equal(entry.allSelected, true);
      const fallback = h.dispatches.filter(args => args[0] === 'TextEntryCopyToClipboard');
      assert.equal(fallback.length, 1);
      assert.ok(fallback[0][1] === entry);
    });
  }
  for (const failure of ['throw', 'false']) {
    test(`ticket 29: ${kind} COPY offers manual copy when both routes fail (${failure})`, () => {
      const harnessOptions = {
        clipboardThrows: 'Invalid number of arguments for event in DispatchEvent for CopyStringToClipboard',
        ...(failure === 'throw' ? { textEntryCopyThrows: true } : { textEntryCopyResult: false }),
      };
      const f = launch(profile(), { boot: () => loadLayout('hud_escape_menu.xml', { harnessOptions }) }); f.run(2000);
      const h = f.harness, find = id => h.contextPanel.FindChildTraverse(id);
      find('HPColors' + kind + 'CopyButton').events.onactivate();
      const status = find('HPColorsCodeStatus');
      assert.match(status.text, /code.*box.*copy.*manually/i);
      assert.equal(status.BHasClass('ToneError'), false);
      assert.match(find('HPColors' + kind + 'CodeEntry').text, /^HPC3/);
      assert.equal(h.clipboardWrites.length, 0);
    });
  }
}
