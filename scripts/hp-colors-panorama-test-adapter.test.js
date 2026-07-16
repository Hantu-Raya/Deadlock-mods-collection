'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
  createPresetEntryPanel,
  installPresetStore,
  installHeroProgressTree,
  installGameTimeTree,
  buildUnitStatusTree,
  encodeBase64Url,
  decodeBase64UrlJson,
  findByClass,
  panelHasClass,
  getStyleWriteCount,
  getStyleWrites,
  assertObjectFields,
  dispatchClientUiPayload,
} = require('./hp-colors-panorama-test-adapter.js');

test('MockPanel supports tree traversal and child APIs', () => {
  const root = new MockPanel('Root');
  const branch = root.add(new MockPanel('Branch'));
  const leaf = branch.add(new MockPanel('Leaf'));

  assert.equal(root.GetChildCount(), 1);
  assert.equal(root.GetChild(0), branch);
  assert.equal(leaf.GetParent(), branch);
  assert.equal(root.FindChildTraverse('Leaf'), leaf);
  assert.deepEqual(root.Children(), [branch]);

  leaf.DeleteAsync();
  assert.equal(leaf.IsValid(), false);
  assert.equal(root.FindChildTraverse('Leaf'), null);
});

test('MockPanel class API stores classes as a Set', () => {
  const panel = new MockPanel('Panel', { classes: ['one'] });
  assert.ok(panel.classes instanceof Set);
  assert.equal(panelHasClass(panel, 'one'), true);
  panel.AddClass('two');
  panel.ToggleClass('one');
  panel.SetHasClass('three', true);
  panel.RemoveClass('two');
  assert.equal(panel.BHasClass('one'), false);
  assert.equal(panelHasClass(panel, 'two'), false);
  assert.equal(panelHasClass(panel, 'three'), true);
});

test('style write helpers track writes and deletes canonically', () => {
  const panel = new MockPanel('Panel');
  panel.style.washColor = '#112233';
  panel.style.visibility = 'visible';
  panel.style.washColor = '#445566';
  delete panel.style.visibility;

  assert.equal(getStyleWriteCount(panel, 'washColor'), 2);
  assert.equal(getStyleWriteCount(panel, 'visibility'), 2);
  assert.deepEqual(getStyleWrites(panel, 'washColor').map((write) => write.value), ['#112233', '#445566']);
});

test('scheduler preserves order and supports delay/function selection', () => {
  const harness = createPanoramaHarness({ now: 1000 });
  const calls = [];
  function later() { calls.push('later'); }
  function first() { calls.push('first'); }
  function sameDelay() { calls.push('sameDelay'); }

  harness.scheduler.schedule(0.2, later);
  harness.scheduler.schedule(0.1, first);
  harness.scheduler.schedule(0.1, sameDelay);
  assert.equal(harness.scheduler.nextDelayByFunctionName('later'), 0.2);
  harness.scheduler.runNext();
  harness.scheduler.runNext();
  assert.deepEqual(calls, ['first', 'sameDelay']);
  const job = harness.scheduler.takeByFunctionName('later');
  assert.equal(job.fn, later);

  harness.scheduler.schedule(0.5, later);
  harness.scheduler.schedule(0.5, first);
  assert.equal(harness.scheduler.runAllByDelay(0.5), 2);
  assert.deepEqual(calls.slice(-2), ['later', 'first']);
});

test('harness exposes shared store and event dispatch', () => {
  const harness = createPanoramaHarness({ shared: { existing: 1 } });
  const context = createVmContext(harness);
  runInVm("GameUI.CustomUIConfig().written = 2; $.RegisterForUnhandledEvent('ClientUI_FireOutput', function (payload) { $.DispatchEvent('seen', payload); });", context, 'inline.js');
  assert.equal(harness.shared.existing, 1);
  assert.equal(harness.shared.written, 2);

  dispatchClientUiPayload(harness, { magic_word: 'X' });
  assert.deepEqual(harness.dispatches, [['seen', '{"magic_word":"X"}']]);
  const button = harness.$.CreatePanel('Button', harness.root, 'MeasuredButton');
  button.SetPanelEvent('onactivate', () => {});
  assert.equal(harness.eventSetCounter.count, 1);
  harness.reset();
  assert.equal(harness.eventSetCounter.count, 0);
});

test('preset store installation and codec helpers build valid entry panels', () => {
  const harness = createPanoramaHarness();
  const encoded = encodeBase64Url(JSON.stringify({ version: 1, values: { hp_enabled: true } }));
  assert.deepEqual(decodeBase64UrlJson(encoded).values, { hp_enabled: true });

  const custom = createPresetEntryPanel('Custom', { version: 1, values: { hp_color_low: '#111111' } });
  const store = installPresetStore(harness, [custom, { id: 'HPColorsPreset_001', name: 'Main', values: { hp_enabled: false } }]);
  assert.equal(store.id, 'HPColorsPresetStore');
  assert.equal(store.FindChildrenWithClassTraverse('hp_colors_preset_entry').length, 2);
  assert.equal(decodeBase64UrlJson(custom.text).values.hp_color_low, '#111111');
});

test('hero and game-time fixtures match Panorama lookup shape', () => {
  const harness = createPanoramaHarness();
  const progress = installHeroProgressTree(harness, 'hero_haze');
  const gameTime = installGameTimeTree(harness, 'Round 0 00:75');

  assert.equal(harness.root.FindChildTraverse('gameplay_hud_alive').FindChildTraverse('progress'), progress);
  assert.equal(panelHasClass(progress, 'hero_haze'), true);
  assert.equal(findByClass(harness.root, 'GameTime')[0], gameTime);
  assert.equal(gameTime.GetAttributeString('text', ''), 'Round 0 00:75');
});

test('unit-status fixture returns all runtime refs', () => {
  const harness = createPanoramaHarness();
  const tree = buildUnitStatusTree(harness, { barWidth: 82, parentWidth: 100, levelText: '12', pipText: '||||' });
  for (const name of [
    'root', 'unitStatus', 'infoHealth', 'unitHealthbar', 'redParent', 'lagging', 'rb', 'bg',
    'heal', 'delta', 'pip', 'ult', 'ultIcon', 'levelContainer', 'level', 'name',
    'counterAnchor', 'counter', 'killZone', 'killMarker',
  ]) assert.ok(tree[name], `missing ${name}`);

  assert.equal(tree.rb, tree.lagging);
  assert.equal(tree.ultIcon, tree.ult);
  assert.equal(tree.killMarker, tree.killZone);
  assertObjectFields({ teamId: 2, flags: 4 }, { teamId: 2, flags: 4 }, 'fixture sanity');
});
