'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadLayout, runInVm, latestPublishedConfig } = require('./boot-layout');
const { profile, launch, CURRENT } = require('./storage-fixture');
const { presetControls } = require('./preset-controls');
const copy = value => JSON.parse(JSON.stringify(value));
function focusModel(root) {
  let focused = null;
  (function patch(panel) {
    panel.SetFocus = () => {
      if (focused === panel) return;
      const previous = focused; focused = panel;
      if (previous) { previous.focused = false; if (previous.events.onblur) previous.events.onblur(); }
      panel.focused = true; if (panel.events.onfocus) panel.events.onfocus();
    };
    panel.Children().forEach(patch);
  })(root);
}
function controls(f) {
  const root = f.harness.contextPanel;
  const find = id => { const p = root.FindChildTraverse(id); assert.ok(p, id); return p; };
  const activate = id => { assert.equal(typeof find(id).events.onactivate, 'function', id); return find(id).events.onactivate(); };
  return { find, activate, ...presetControls(find, activate),
    submit: (id, text) => { find(id).text = text; find(id).events.ontextentrysubmit(); },
    cancel: () => runInVm(f.panelNode.attrs.oncancel, f.context),
    open: () => f.harness.$.HPColorsMenuToggle() };
}
function fake(options = {}) {
  const f = loadLayout('hud_escape_menu.xml'); focusModel(f.harness.contextPanel); f.includeScripts();
  if (options.longNames) {
    const contract = f.harness.$.HPColorsV3Settings;
    f.harness.$.HPColorsV3Settings = { ...contract, controls: contract.controls.map(row => row.level === 'advanced' ? { ...row, name: row.name + ' ' + 'X'.repeat(options.longNames === true ? 200 : options.longNames) } : row) };
  }
  let api; const commits = []; let settings = copy(f.harness.$.HPColorsV3Settings.defaults);
  f.harness.$.HPColorsV3Store = options.store === false ? null : {
    attach(value) { api = value; if (!options.pending) (api.hydrateSettings || api.applySettings)(settings); },
    commit(config) { commits.push(copy(config)); },
    getBundle() { return { settings: api ? api.getSettings() : settings, presets: [] }; },
    isHydrated() { return !options.pending; },
  };
  f.onload();
  return { ...f, ...controls(f), api: () => api, commits,
    settings: () => api ? api.getSettings() : latestPublishedConfig(f.harness).settings,
    run: ms => f.harness.scheduler.runFor(ms, 20000),
    publishes: () => f.harness.dispatches.filter(event => event[0] === 'ClientUI_FireOutput') };
}
function savedProfile() {
  const p = profile(); const seed = launch(p); seed.run(2000);
  const bundle = seed.harness.$.HPColorsV3Store.getBundle(); bundle.settings.side.enemy.barColorMid = '#ABCDEF';
  bundle.presets = ['A', 'B', 'C'].map((name, i) => ({ id: 'mine-' + i, name, settings: copy(bundle.settings) }));
  p.disk.set(CURRENT, seed.codec.encodeRecord(bundle));
  return { p, bundle };
}

test('audit A1: COPY is clipboard-only; single-preset and default imports append without replacing current look or existing library', () => {
  const { p, bundle } = savedProfile(); const f = launch(p); f.run(2000); const m = controls(f);
  m.find('HPColorsBundleCodeEntry').text = 'KEEP THIS DRAFT';
  m.preset(1, 'Copy');
  assert.equal(m.find('HPColorsBundleCodeEntry').text, 'KEEP THIS DRAFT');
  m.find('HPColorsBundleCodeEntry').text = f.harness.clipboardWrites.at(-1); m.activate('HPColorsBundleImportButton');
  let result = f.harness.$.HPColorsV3Store.getBundle();
  assert.deepEqual(Array.from(result.presets, p => p.name), ['A', 'B', 'C', 'B']);
  assert.equal(new Set(result.presets.map(p => p.id)).size, 4); assert.deepEqual(copy(result.settings), copy(bundle.settings));
  m.preset('baked_default', 'Copy');
  m.find('HPColorsBundleCodeEntry').text = f.harness.clipboardWrites.at(-1); m.activate('HPColorsBundleImportButton');
  result = f.harness.$.HPColorsV3Store.getBundle(); assert.equal(result.presets.length, 5);
  assert.equal(result.presets[4].name, 'Rewrite Default'); assert.deepEqual(copy(result.settings), copy(bundle.settings));
  f.run(5000); const restarted = launch(p); restarted.run(2000);
  assert.deepEqual(Array.from(restarted.harness.$.HPColorsV3Store.getBundle().presets, p => p.name), ['A', 'B', 'C', 'B', 'Rewrite Default']);
});

test('audit A1/A6: full bundle replacement has a separate confirmed action, supports cancel, and invalid decode is atomic', () => {
  const { p } = savedProfile(); const f = launch(p); f.run(2000); const m = controls(f); m.open();
  const before = copy(f.harness.$.HPColorsV3Store.getBundle());
  const bundle = copy(before); bundle.presets = [{ id: 'replacement', name: 'Replacement', settings: copy(before.settings) }]; bundle.settings.side.enemy.barColorLow = '#123456';
  m.find('HPColorsBundleCodeEntry').text = f.harness.$.HPColorsV3Sharing.exportBundleCode(bundle).code;
  m.activate('HPColorsBundleReplaceButton'); assert.deepEqual(copy(f.harness.$.HPColorsV3Store.getBundle()), before);
  m.cancel(); m.activate('HPColorsBundleReplaceConfirmButton'); assert.deepEqual(copy(f.harness.$.HPColorsV3Store.getBundle()), before);
  m.activate('HPColorsBundleReplaceButton'); m.activate('HPColorsBundleReplaceConfirmButton');
  assert.equal(f.harness.$.HPColorsV3Store.getBundle().presets[0].name, 'Replacement');
  m.activate('HPColorsUndoButton'); assert.equal(f.settings().side.enemy.barColorLow, before.settings.side.enemy.barColorLow);
  const real = f.harness.$.HPColorsV3Store;
  f.harness.$.HPColorsV3Store = { ...real, decodeBundleCode() { const invalid = copy(bundle); invalid.settings.side.enemy.barColorLow = 'bad'; return invalid; } };
  const stable = copy(real.getBundle()); m.activate('HPColorsBundleReplaceButton'); m.activate('HPColorsBundleReplaceConfirmButton');
  assert.deepEqual(copy(real.getBundle()), stable); assert.match(m.find('HPColorsCodeStatus').text, /cannot use|invalid/i);
});

for (const edit of ['hex', 'slider', 'picker']) test('audit A2: disk hydration drops stale ' + edit + ' history/gesture and picker without reverting restored look', () => {
  const { p } = savedProfile(); const f = launch(p, { navLatencySec: 3 }); const m = controls(f); focusModel(f.harness.contextPanel); m.open();
  if (edit === 'hex') f.edit('#112233');
  if (edit === 'slider') m.find('HPColorsLowThresholdSlider').value = 30;
  if (edit === 'picker') { m.activate('HPColorsBarColorLowEnemySwatch'); m.submit('HPColorsPickerHex', '#112233'); }
  f.run(6000);
  assert.equal(f.settings().side.enemy.barColorMid, '#ABCDEF'); assert.equal(m.find('HPColorsUndoButton').enabled, false);
  assert.equal(m.find('HPColorsPickerDialog').BHasClass('Open'), false);
  m.activate('HPColorsUndoButton'); m.cancel(); f.run(5000);
  assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorMid, '#ABCDEF');
});

test('audit A2: closing the editor clears only session history after committing a completed edit', () => {
  const f = fake(); f.open(); f.submit('HPColorsBarColorLowEnemyHex', '#112233');
  assert.equal(f.find('HPColorsUndoButton').enabled, true); f.activate('HPColorsCloseButton');
  f.open(); assert.equal(f.find('HPColorsUndoButton').enabled, false); f.activate('HPColorsUndoButton');
  assert.equal(f.settings().side.enemy.barColorLow, '#112233');
});

test('audit A3/A4: native-order slider blur cannot end picker history; one Escape only cancels picker', () => {
  const f = fake(); f.open(); const before = copy(f.settings()); const slider = f.find('HPColorsLowThresholdSlider');
  slider.SetFocus(); slider.value = slider.value; // A native value echo can start a no-op session.
  f.activate('HPColorsBarColorLowEnemySwatch'); // SetFocus to picker hex fires slider blur after the new picker gesture exists.
  f.submit('HPColorsPickerHex', '#010203'); f.submit('HPColorsPickerHex', '#040506');
  assert.equal(f.find('HPColorsPickerCard').events.oncancel, undefined, 'only root owns cancel routing');
  f.cancel(); assert.deepEqual(copy(f.settings()), before); assert.equal(f.find('HPColorsMenuHost').BHasClass('HPC3Open'), true);
  assert.equal(f.find('HPColorsUndoButton').enabled, false, 'cancelled picker edits never become standalone Undo steps');
  f.activate('HPColorsBarColorLowEnemySwatch'); f.submit('HPColorsPickerHex', '#070809'); f.activate('HPColorsPickerDoneButton');
  f.activate('HPColorsUndoButton'); assert.deepEqual(copy(f.settings()), before);
});

test('audit A3: picker cancellation uses its independent opening color when another row has ended the gesture', () => {
  const f = fake(); f.open(); const before = copy(f.settings());
  f.activate('HPColorsBarColorLowEnemySwatch'); f.submit('HPColorsPickerHex', '#010203');
  f.submit('HPColorsBarColorMidEnemyHex', '#445566'); before.side.enemy.barColorMid = '#445566';
  f.cancel(); assert.deepEqual(copy(f.settings()), before);
});

test('audit A5: reset wording lists actual scopes and distinct hidden names within a fixed bound', () => {
  const f = fake(); f.open();
  f.activate('HPColorsNavHPTextButton'); f.activate('HPColorsResetPageButton');
  assert.match(f.find('HPColorsResetPageMessage').text, /enemy and ally/i); assert.doesNotMatch(f.find('HPColorsResetPageMessage').text, /shared/i);
  f.activate('HPColorsResetPageCancelButton'); f.activate('HPColorsNavBarButton'); f.activate('HPColorsResetPageButton');
  const message = f.find('HPColorsResetPageMessage').text;
  assert.match(message, /shared/i); assert.ok(message.length <= 600);
  const advanced = f.harness.$.HPColorsV3Settings.controls.filter(row => row.page === 'Bar' && row.level === 'advanced');
  for (const name of new Set(advanced.map(row => row.name))) assert.equal(message.split(name).length - 1, 1, name);
});

test('audit A5: unusually long hidden-setting names are summarized rather than overflowing the confirmation', () => {
  const f = fake({ longNames: true }); f.open(); f.activate('HPColorsResetPageButton');
  const message = f.find('HPColorsResetPageMessage').text;
  assert.ok(message.length <= 600, message.length); assert.match(message, /\+\d+ more Advanced settings \(also reset\)/);
});

test('audit A7: cold boot and fresh ESC contexts without GameUI wait for disk restore without publishing defaults first', () => {
  const { p } = savedProfile(); const f = launch(p, { navLatencySec: 3 });
  const publishes = () => f.harness.dispatches.filter(event => event[0] === 'ClientUI_FireOutput').map(event => JSON.parse(event[1]));
  assert.equal(publishes().length, 0); f.run(2000); assert.equal(publishes().length, 0);
  f.run(4000); assert.ok(publishes().length > 0); assert.ok(publishes().every(config => config.settings.side.enemy.barColorMid === '#ABCDEF'));
  const fresh = fake({ pending: true });
  assert.equal(Object.hasOwn(fresh.context, 'GameUI'), false);
  assert.equal(latestPublishedConfig(fresh.harness), undefined);
  fresh.run(2000); assert.equal(fresh.publishes().length, 0);
  assert.equal(fresh.api().hydrateSettings(f.settings()), true);
  assert.equal(fresh.publishes().length, 1);
  assert.equal(latestPublishedConfig(fresh.harness).settings.side.enemy.barColorMid, '#ABCDEF');
});

test('audit A7: cold publication has a bounded timeout fallback and retire cancels its stale callback', () => {
  const f = fake({ pending: true }); assert.equal(f.publishes().length, 0); f.run(29999); assert.equal(f.publishes().length, 0);
  f.run(2); assert.equal(f.publishes().length, 1); assert.equal(f.settings().side.enemy.barColorLow, '#FD4949');
  const other = fake({ pending: true }); other.harness.$.HPColorsMenuPublisher.retire(); other.run(31000); assert.equal(other.publishes().length, 0);
});

for (const [id, key, final, opening] of [
  ['HPColorsLowThresholdSlider', 'lowThreshold', 52, 25],
  ['HPColorsBarColorLowEnemyHueSlider', 'barColorLow', '#F6FF00', '#FD4949'],
]) test('audit A8: a 1kHz ' + key + ' slider gesture throttles publication and saves once at SliderReleased', () => {
  const f = fake(); f.open();
  const before = f.publishes().length; const slider = f.find(id); const times = [];
  const dispatch = f.harness.$.DispatchEvent;
  f.harness.$.DispatchEvent = (...args) => { if (args[0] === 'ClientUI_FireOutput') times.push(f.harness.now); return dispatch(...args); };
  for (let i = 0; i < 200; i++) { slider.value = 26 + i % 20; f.run(1); }
  assert.ok(f.publishes().length - before <= 5); assert.equal(f.commits.length, 0);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 49, times.join(','));
  slider.value = key === 'lowThreshold' ? 52 : 225; f.harness.releaseSlider(slider);
  const value = () => key === 'lowThreshold' ? latestPublishedConfig(f.harness).settings.shared[key] : latestPublishedConfig(f.harness).settings.side.enemy[key];
  assert.equal(value(), final); assert.equal(f.commits.length, 1);
  f.activate('HPColorsUndoButton'); assert.equal(value(), opening);
  const artifact = path.resolve(__dirname, '../.build/evidence/ticket10-audit-gesture' + (key === 'lowThreshold' ? '' : '-hue') + '.json'); fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, JSON.stringify({ times, finalPublished: JSON.parse(f.publishes().at(-2)[1]), commits: f.commits.length }, null, 2));
});

test('audit A8: returning a drag to its opening value still publishes that final value, with no save or Undo record', () => {
  const f = fake(); f.open(); const slider = f.find('HPColorsLowThresholdSlider');
  slider.value = 30; f.run(60);
  assert.equal(latestPublishedConfig(f.harness).settings.shared.lowThreshold, 30);
  slider.value = 25; f.harness.releaseSlider(slider);
  assert.equal(latestPublishedConfig(f.harness).settings.shared.lowThreshold, 25);
  assert.equal(f.find('HPColorsUndoButton').enabled, false); assert.equal(f.commits.length, 0);
});

test('audit metadata: applying and saving a preset carries its pending v2 settings and native rules; default application clears them', () => {
  const { p, bundle } = savedProfile();
  const seed = launch(p); seed.run(2000);
  const cell = seed.harness.$.HPColorsV3Settings.slots.find(slot => slot.setting === 'staminaShape').slot;
  bundle.v2pending = { staminaShape: 'arrow' };
  bundle.rules = { [cell]: { slot: 1, minTier: 1, value: 'arrow' } };
  bundle.presets[0].settings.side.enemy.barColorLow = '#010203';
  bundle.presets[0].v2pending = { staminaShape: 'circle' };
  bundle.presets[0].rules = { [cell]: { slot: 1, minTier: 2, value: 'circle' } };
  p.disk.set(CURRENT, seed.codec.encodeRecord(bundle));
  const f = launch(p); f.run(2000); const m = controls(f);
  m.preset(0, 'Apply');
  let current = f.harness.$.HPColorsV3Store.getBundle();
  assert.deepEqual(copy(current.v2pending), bundle.presets[0].v2pending);
  assert.deepEqual(copy(current.rules), bundle.presets[0].rules);
  m.find('HPColorsPresetNameEntry').text = 'Copy of applied'; m.activate('HPColorsPresetSaveButton');
  current = f.harness.$.HPColorsV3Store.getBundle();
  assert.deepEqual(copy(current.presets.at(-1).v2pending), bundle.presets[0].v2pending);
  assert.deepEqual(copy(current.presets.at(-1).rules), bundle.presets[0].rules);
  m.preset('baked_default', 'Apply');
  current = f.harness.$.HPColorsV3Store.getBundle();
  assert.equal(Object.hasOwn(current, 'v2pending'), false);
  assert.equal(Object.hasOwn(current, 'rules'), false);
});

test('audit A6: codeAction rejects invalid preflight settings before calling any mutating import', () => {
  const f = fake(); let mutations = 0; const before = copy(f.settings()); const invalid = copy(before); invalid.side.enemy.barColorLow = 'bad';
  f.harness.$.HPColorsV3Store = {
    decodeSettingsCode() { return invalid; }, decodeBundleCode() { return { settings: invalid, presets: [] }; },
    importSettingsCode() { mutations++; return invalid; }, importBundleCode() { mutations++; return invalid; },
  };
  for (const kind of ['Settings', 'Bundle']) {
    f.find('HPColors' + kind + 'CodeEntry').text = 'BAD';
    f.activate('HPColors' + kind + 'ImportButton');
  }
  assert.equal(mutations, 0); assert.deepEqual(copy(f.settings()), before);
});

test('audit A6: missing decoder refuses import before any mutation', () => {
  const f = fake(); let mutations = 0; const before = copy(f.settings());
  f.harness.$.HPColorsV3Store = {
    importSettingsCode() { mutations++; return before; }, importBundleCode() { mutations++; return before; },
  };
  for (const kind of ['Settings', 'Bundle']) {
    f.find('HPColors' + kind + 'CodeEntry').text = 'CODE';
    f.activate('HPColors' + kind + 'ImportButton');
    assert.match(f.find('HPColorsCodeStatus').text, /validation.*unavailable/i);
  }
  assert.equal(mutations, 0); assert.deepEqual(copy(f.settings()), before);
});

test('audit A5: a hidden-setting name larger than the list budget is not described as absent', () => {
  const f = fake({ longNames: 600 }); f.open(); f.activate('HPColorsResetPageButton');
  const message = f.find('HPColorsResetPageMessage').text;
  assert.ok(message.length <= 600); assert.doesNotMatch(message, /none on this page/);
  assert.match(message, /\+\d+ more Advanced settings \(also reset\)/);
});

test('audit A9: dynamic name entries reject oversized text even when the native maxchars limit is bypassed', () => {
  const { p } = savedProfile(); const f = launch(p); f.run(2000); const m = controls(f);
  const before = copy(f.harness.$.HPColorsV3Store.getBundle());
  const entry = m.select(0); entry.maxchars = undefined; entry.text = 'X'.repeat(49);
  m.activate('HPColorsPresetSelectedRenameButton');
  assert.deepEqual(copy(f.harness.$.HPColorsV3Store.getBundle()), before);
  assert.match(m.find('HPColorsPresetStatus').text, /1–48/);
  entry.text = '  ' + 'X'.repeat(48) + '  '; m.activate('HPColorsPresetSelectedRenameButton');
  assert.equal(f.harness.$.HPColorsV3Store.getBundle().presets[0].name, 'X'.repeat(48));
});
