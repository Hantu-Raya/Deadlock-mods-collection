'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { profile, launch, CURRENT } = require('./storage-fixture');
const { installTopBarIdentityTree, MockPanel } = require('../../scripts/hp-colors-panorama-test-adapter');
const { latestPublishedConfig, loadLayout } = require('./boot-layout');
const { presetControls } = require('./preset-controls');
const copy = value => JSON.parse(JSON.stringify(value));
function setup() {
  const disk = profile(), m = launch(disk, { boot: () => {
    const fixture = loadLayout('hud_escape_menu.xml');
    new MockPanel('HexValue', fixture.harness.contextPanel.FindChildTraverse('HPColorsNativePicker'));
    return fixture;
  } }), h = m.harness;
  const tree = installTopBarIdentityTree(h, { heroName: 'Infernus' }); m.run(3000);
  const find = id => { const p = h.contextPanel.FindChildTraverse(id); assert.ok(p, id); return p; };
  const fire = (id, event = 'onactivate') => { const fn = find(id).events[event]; assert.equal(typeof fn, 'function', id + ':' + event); fn(); };
  const contract = h.$.HPColorsV3Settings, sharing = h.$.HPColorsV3Sharing, store = h.$.HPColorsV3Store;
  const cell = (key, side = 'enemy') => contract.slots.find(s => s.setting === key && s.side === side).slot;
  return { ...m, h, disk, tree, find, fire, ...presetControls(find, fire), contract, sharing, store, cell, bundle: () => copy(store.getBundle()),
    published: () => latestPublishedConfig(h), rules: (key, value, slot = 1, minTier = 2, side = 'enemy') => ({ [cell(key, side)]: { slot, minTier, value } }) };
}

test('Native rules survive settings/bundle codes and save/restart, validate every cell and refuse oversize settings codes', () => {
  const m = setup(), settings = m.settings(), rules = m.rules('barColorLow', '#123456');
  const code = m.sharing.exportSettingsCode(settings, rules);
  assert.equal(code.ok, true);
  const decoded = m.sharing.importSettingsCode(code.code);
  assert.deepEqual(copy(decoded.rules), rules);
  const bundle = { settings, rules, presets: [{ id: 'A', name: 'A', settings, rules }] };
  const shared = m.sharing.importBundleCode(m.sharing.exportBundleCode(bundle).code);
  assert.deepEqual(copy(shared.bundle.rules), rules);
  assert.deepEqual(copy(shared.bundle.presets[0].rules), rules);
  m.store.replaceBundle(bundle); m.run(8000);
  assert.deepEqual(copy(m.codec.classifyRecord(m.disk.disk.get(CURRENT)).bundle.rules), rules);
  const next = launch(m.disk); next.run(3000);
  assert.deepEqual(copy(next.harness.$.HPColorsV3Store.getBundle().rules), rules);
  for (const invalid of [{ slot: 0, minTier: 2, value: '#123456' }, { slot: 1, minTier: 4, value: '#123456' }, { slot: 1, minTier: 2, value: 'red' }]) {
    assert.equal(m.sharing.exportSettingsCode(settings, { [m.cell('barColorLow')]: invalid }).ok, false);
  }
  assert.equal(m.sharing.exportSettingsCode(settings, { 9999: { slot: 1, minTier: 1, value: true } }).ok, false);
  const all = {};
  m.contract.controls.forEach(row => {
    const value = row.type === 'color' ? '#123456' : row.type === 'number' ? row.bounds[row.key === 'lowThreshold' ? 0 : 1] : row.type === 'boolean' ? !row.default : row.options.find(option => option.value !== row.default).value;
    all[m.cell(row.key, row.side)] = { slot: 4, minTier: 3, value };
    (row.side === 'shared' ? settings.shared : settings.side[row.side])[row.key] = value;
  });
  const oversize = m.sharing.exportSettingsCode(settings, all);
  assert.equal(oversize.ok, false); assert.equal(oversize.message, 'Settings code exceeds 4,096 characters');
});

function frame(record, tag = 'HPV2S1') {
  const payload = Buffer.from(JSON.stringify(record)).toString('base64url');
  let sum = 2166136261; for (const char of payload) sum = Math.imul(sum ^ char.charCodeAt(0), 16777619);
  return tag + '.' + (sum >>> 0).toString(16).padStart(8, '0') + '.' + payload;
}
test('V2 saves, pasted codes and previous v3 metadata map conditions to both cells once and discard retired keys', () => {
  const m = setup(), expected = { ...m.rules('barWidth', 158), ...m.rules('barWidth', 158, 1, 2, 'ally') };
  const conditions = { widthScale: { slot: 1, minTier: 2, value: 200 }, readoutFormat: { slot: 1, minTier: 1, value: 'retired' } };
  const disk = profile({ 'hantu.hpcolors.v2/state': frame({ m: 'HPV2STORE', s: 4, t: 1, b: { version: 1, values: {}, conditions } }) });
  const migrated = launch(disk); migrated.run(3000);
  const bundle = migrated.harness.$.HPColorsV3Store.getBundle();
  assert.deepEqual(copy(bundle.rules), expected); assert.equal(bundle.v2conditions, undefined);
  const legacy = 'HPCR2' + JSON.stringify({ v: [], c: conditions });
  const pasted = m.sharing.importSettingsCode(legacy);
  assert.equal(pasted.ok, true); assert.deepEqual(copy(pasted.rules), expected);
  assert.equal(pasted.metadata.v2conditions, undefined);
  const savedRules = { widthScale: { slot: 1, minTier: 2, value: 158 }, ghoulOpacity: { slot: 1, minTier: 1, value: 10 } };
  const old = frame({ v: 11, k: 'bundle', d: [], b: { v2conditions: savedRules },
    p: [{ id: 'A', name: 'A', d: [], v2conditions: savedRules }] });
  const upgraded = m.codec.classifyRecord(old);
  assert.equal(upgraded.kind, 'valid'); assert.deepEqual(copy(upgraded.bundle.rules), expected);
  assert.deepEqual(copy(upgraded.bundle.presets[0].rules), expected);
  assert.equal(upgraded.bundle.v2conditions, undefined); assert.equal(upgraded.bundle.presets[0].v2conditions, undefined);
});

function abilities(m) {
  const signature = m.tree.hud.add(new MockPanel('hud_signature'));
  const owner = signature.add(new MockPanel('abilities'));
  const slots = [1, 2, 3, 4].map(n => owner.add(new MockPanel('slot_signature_' + n)));
  const tier = (slot, value) => { for (let n = 0; n <= 3; n++) slots[slot - 1].SetHasClass('Tier' + n, n === value); };
  return { signature, owner, slots, tier };
}
test('Only referenced local signature slots are sampled; effective publication changes at/above the minimum, never saves over authored settings', () => {
  const m = setup(), a = abilities(m), authored = m.settings().side.enemy.barColorLow;
  a.tier(1, 3); a.tier(2, 3); m.run(2000);
  assert.deepEqual(a.slots.map(slot => slot.classReadCount), [0, 0, 0, 0], 'no rules means no tier reads');
  m.store.replaceBundle({ ...m.bundle(), rules: m.rules('barColorLow', '#123456') });
  assert.equal(m.published().settings.side.enemy.barColorLow, authored, 'newly referenced slot starts unknown');
  a.tier(1, 1); m.run(1000); assert.equal(m.published().settings.side.enemy.barColorLow, authored);
  a.tier(1, 2); m.run(1000); assert.equal(m.published().settings.side.enemy.barColorLow, '#123456');
  const revision = m.published().revision, events = m.h.dispatches.length;
  a.tier(1, 3); a.slots[0].AddClass('Tier1'); m.run(2000);
  assert.equal(m.published().revision, revision); assert.equal(m.h.dispatches.length, events, 'same effective value is not republished');
  assert.equal(m.settings().side.enemy.barColorLow, authored);
  m.find('HPColorsPresetNameEntry').text = 'Authored'; m.fire('HPColorsPresetSaveButton'); m.run(8000);
  const saved = m.codec.classifyRecord(m.disk.disk.get(CURRENT)).bundle;
  assert.equal(saved.settings.side.enemy.barColorLow, authored);
  assert.equal(saved.presets[0].settings.side.enemy.barColorLow, authored);
  assert.deepEqual(copy(saved.presets[0].rules), m.rules('barColorLow', '#123456'));
  assert.deepEqual(a.slots.slice(1).map(slot => slot.classReadCount), [0, 0, 0]);
  a.tier(1, -1); m.run(1000); assert.equal(m.published().settings.side.enemy.barColorLow, authored);
  a.tier(1, 3); m.tree.hud.AddClass('spec_mode'); m.run(1000);
  assert.equal(m.published().settings.side.enemy.barColorLow, authored);
  m.tree.hud.RemoveClass('spec_mode'); m.run(1000); assert.equal(m.published().settings.side.enemy.barColorLow, '#123456');
});

test('Hero/epoch changes and retired callbacks clear tiers; new slot references and invalid panels cannot reuse stale observations', () => {
  const m = setup(), a = abilities(m), authored = m.settings().side.enemy.barColorLow;
  m.store.replaceBundle({ ...m.bundle(), rules: m.rules('barColorLow', '#123456') });
  a.tier(1, 3); m.run(1000); assert.equal(m.published().settings.side.enemy.barColorLow, '#123456');
  const oldEpoch = m.h.scheduler.jobs.filter(job => job.delay === 1).map(job => job.fn);
  m.tree.setHeroName('Seven'); m.run(2000);
  assert.equal(m.published().settings.side.enemy.barColorLow, authored, 'settled hero change clears previous hero tiers');
  m.run(1000); assert.equal(m.published().settings.side.enemy.barColorLow, '#123456');
  m.tree.hud.AddClass('GameStatePreGame'); m.run(1000);
  assert.equal(m.published().settings.side.enemy.barColorLow, authored);
  const jobs = m.h.scheduler.jobs.length, dispatches = m.h.dispatches.length, reads = a.slots[0].classReadCount;
  oldEpoch.forEach(fn => fn());
  assert.equal(m.h.scheduler.jobs.length, jobs); assert.equal(m.h.dispatches.length, dispatches); assert.equal(a.slots[0].classReadCount, reads);
  m.tree.hud.RemoveClass('GameStatePreGame'); m.run(6000);
  m.store.replaceBundle({ ...m.bundle(), rules: m.rules('barColorLow', '#445566', 2) });
  assert.equal(m.published().settings.side.enemy.barColorLow, authored);
  a.tier(2, 2); m.run(1000); assert.equal(m.published().settings.side.enemy.barColorLow, '#445566');
  a.slots[1].DeleteAsync(); m.run(1000); assert.equal(m.published().settings.side.enemy.barColorLow, authored);
  const replacement = a.owner.add(new MockPanel('slot_signature_2', { classes: ['Tier3'] }));
  m.run(1000); assert.equal(m.published().settings.side.enemy.barColorLow, '#445566');
  assert.ok(replacement.classReadCount > 0);
  const oldGeneration = m.h.scheduler.jobs.filter(job => job.delay === 1).map(job => job.fn);
  m.includeScripts(); m.onload(); m.run(3000);
  const afterJobs = m.h.scheduler.jobs.length, afterDispatches = m.h.dispatches.length, afterReads = replacement.classReadCount;
  oldGeneration.forEach(fn => fn());
  assert.equal(m.h.scheduler.jobs.length, afterJobs); assert.equal(m.h.dispatches.length, afterDispatches); assert.equal(replacement.classReadCount, afterReads);
});

test('Explicit and automatic presets replace the complete rule set, and settings-code import shares the settings/rules Undo record', () => {
  const m = setup(), a = abilities(m), settings = m.settings(), rules = m.rules('barColorLow', '#123456');
  m.store.replaceBundle({ settings, rules, presets: [{ id: 'A', name: 'A', settings }, { id: 'B', name: 'B', settings, rules }], heroPresets: { hero_gigawatt: 'A' } });
  a.tier(1, 3); m.run(1000);
  m.preset(0, 'Apply'); assert.equal(m.bundle().rules, undefined);
  m.fire('HPColorsUndoButton'); assert.deepEqual(m.bundle().rules, rules);
  m.preset(1, 'Apply'); assert.deepEqual(m.bundle().rules, rules);
  m.tree.setHeroName('Seven'); m.run(2000); assert.equal(m.bundle().rules, undefined);
  const importedSettings = copy(settings); importedSettings.side.enemy.barColorHigh = '#ABCDEF';
  m.find('HPColorsSettingsCodeEntry').text = m.sharing.exportSettingsCode(importedSettings, rules).code; m.fire('HPColorsSettingsImportButton');
  assert.deepEqual(m.bundle().rules, rules); assert.equal(m.settings().side.enemy.barColorHigh, '#ABCDEF');
  m.fire('HPColorsUndoButton'); assert.equal(m.bundle().rules, undefined); assert.equal(m.settings().side.enemy.barColorHigh, settings.side.enemy.barColorHigh);
});

test('Every setting/search row opens an isolated typed condition draft; Apply/Remove, equality, Cancel/Escape and page reset share Undo', () => {
  const m = setup(); m.h.$.HPColorsMenuToggle();
  for (const row of m.contract.controls) assert.equal(typeof m.find(row.conditionId).events.onactivate, 'function', row.key + ':' + row.side);
  const boolean = m.contract.controls.find(row => row.key === 'barVisible' && row.side === 'enemy');
  m.fire(boolean.conditionId);
  assert.equal(m.find('HPColorsConditionDialog').BHasClass('Open'), true);
  assert.equal(m.find('HPColorsConditionApplyButton').enabled, false);
  m.fire('HPColorsConditionSlot2'); m.fire('HPColorsConditionSlot2'); m.fire('HPColorsConditionSlot2'); m.fire('HPColorsConditionSlot2');
  assert.match(m.find('HPColorsConditionSlot2Label').text, /TIER 1/);
  m.fire('HPColorsConditionBooleanToggle');
  assert.equal(m.find('HPColorsConditionApplyButton').enabled, true);
  assert.equal(m.bundle().rules, undefined, 'draft has no authored effect');
  m.fire('HPColorsConditionCancelButton'); assert.equal(m.bundle().rules, undefined);
  m.fire(boolean.conditionId); m.fire('HPColorsConditionBooleanToggle'); m.h.$.HPColorsMenuCancel();
  assert.equal(m.find('HPColorsConditionDialog').BHasClass('Open'), false); assert.equal(m.bundle().rules, undefined);
  m.fire(boolean.conditionId); m.fire('HPColorsConditionBooleanToggle'); m.fire('HPColorsConditionApplyButton');
  const rules = m.rules('barVisible', false, 1, 1);
  assert.deepEqual(m.bundle().rules, rules); assert.equal(m.find(boolean.conditionId).BHasClass('Marked'), true);
  assert.equal(m.settings().side.enemy.barVisible, true);
  m.fire(boolean.conditionId); m.fire('HPColorsConditionRemoveButton'); assert.equal(m.bundle().rules, undefined);
  m.fire('HPColorsUndoButton'); assert.deepEqual(m.bundle().rules, rules);
  m.fire('HPColorsUndoButton'); assert.equal(m.bundle().rules, undefined);
  assert.equal(m.find('HPColorsUndoButton').enabled, false, 'Apply and Remove are each exactly one entry');
  const number = m.contract.controls.find(row => row.key === 'barWidth' && row.side === 'enemy');
  m.fire(number.conditionId); m.find('HPColorsConditionNumberEntry').text = '120'; m.fire('HPColorsConditionNumberEntry', 'ontextentrysubmit'); m.fire('HPColorsConditionApplyButton');
  assert.equal(m.bundle().rules[m.cell('barWidth')].value, 120);
  const enumeration = m.contract.controls.find(row => row.key === 'barColorMode' && row.side === 'enemy');
  m.fire(enumeration.conditionId); m.fire('HPColorsConditionOption0'); m.fire('HPColorsConditionApplyButton');
  assert.equal(m.bundle().rules[m.cell('barColorMode')].value, enumeration.options[0].value);
  const before = m.bundle();
  m.fire('HPColorsResetPageButton'); m.fire('HPColorsResetPageConfirmButton'); assert.equal(m.bundle().rules, undefined);
  m.fire('HPColorsUndoButton'); assert.deepEqual(m.bundle().rules, before.rules); assert.deepEqual(m.settings(), before.settings);
  m.find('HPColorsSearchField').text = 'width'; m.fire('HPColorsSearchField', 'ontextentrychange');
  m.fire(number.conditionId); assert.equal(m.find('HPColorsConditionDialog').BHasClass('Open'), true);
});

test('Condition colour uses the native picker without leaking a draft; picker Escape restores the draft and Apply records only the rule', () => {
  const m = setup(); m.h.$.HPColorsMenuToggle();
  const native = m.find('HPColorsNativePicker');
  const row = m.contract.controls.find(row => row.key === 'barColorLow' && row.side === 'enemy'), authored = m.settings().side.enemy.barColorLow;
  m.fire(row.conditionId); m.find('HPColorsConditionHex').text = '#112233'; m.fire('HPColorsConditionHex', 'ontextentrysubmit');
  m.fire('HPColorsConditionSwatch');
  assert.equal(m.find('HexValue').text, '112233');
  m.fire('HPColorsNativePicker', 'CitadelColorPickerColorChanged'); // Invalid channels never change the draft.
  native.events.CitadelColorPickerColorChanged(4, 5, 6);
  assert.equal(m.find('HPColorsConditionHex').text, '#040506'); assert.equal(m.settings().side.enemy.barColorLow, authored);
  m.h.$.HPColorsMenuCancel(); assert.equal(m.find('HPColorsConditionHex').text, '#112233');
  m.fire('HPColorsConditionSwatch'); native.events.CitadelColorPickerColorChanged(10, 20, 30); m.fire('HPColorsPickerDoneButton');
  m.fire('HPColorsConditionApplyButton');
  assert.equal(m.bundle().rules[m.cell('barColorLow')].value, '#0A141E'); assert.equal(m.settings().side.enemy.barColorLow, authored);
  m.fire('HPColorsUndoButton'); assert.equal(m.bundle().rules, undefined); assert.equal(m.find('HPColorsUndoButton').enabled, false);
});

test('Rules enforce cell types, bounds/step and enum options at import; newer rules project safely without overwriting a future save', () => {
  const m = setup();
  for (const [key, side, value] of [['barWidth','enemy',0.01], ['barWidth','enemy',10000], ['barVisible','enemy','false'],
    ['barColorMode','enemy','invalid'], ['barColorLow','enemy','#abcd']]) {
    const c = [m.cell(key, side), 1, 1, value];
    assert.equal(m.sharing.exportSettingsCode(m.settings(), m.rules(key, value, 1, 1, side)).ok, false);
    const imported = m.sharing.importSettingsCode(frame({ v: 12, k: 'settings', d: [], c }, 'HPC3'));
    if (key === 'barVisible' || key === 'barColorLow') assert.equal(imported.ok, false);
    else { assert.equal(imported.newer, true); assert.deepEqual(copy(imported.rules), {}); }
  }
  const code = frame({ v: 12, k: 'settings', d: [], c: [m.cell('barColorMode'),1,1,'future-mode'] }, 'HPC3');
  const projected = m.sharing.importSettingsCode(code);
  assert.equal(projected.ok, true); assert.equal(projected.newer, true); assert.deepEqual(copy(projected.rules), {});
  const future = frame({ v: 13, k: 'bundle', d: [], c: [999, 1, 1, true, m.cell('barColorLow'), 1, 1, '#123456'], p: [] });
  const disk = profile({ [CURRENT]: future }), next = launch(disk); next.run(3000); next.edit('#ABCDEF'); next.run(3000);
  assert.equal(disk.disk.get(CURRENT), future);
  assert.equal(next.codec.classifyRecord(future).kind, 'newer');
  const malicious = frame({ v: 12, k: 'bundle', d: [], b: { rules: { 99999: { slot: 0, minTier: -1, value: true } } }, p: [] });
  assert.equal(m.codec.classifyRecord(malicious).kind, 'corrupt', 'metadata cannot bypass native rule validation');
});

test('Effective preview follows local upgrades, crossing thresholds normalize without changing the authored settings or rules', () => {
  const m = setup(), a = abilities(m); m.h.$.HPColorsMenuToggle();
  const settings = m.settings(); settings.side.enemy.barColorMode = 'fixed';
  const rules = { ...m.rules('barColorHigh','#123456'), ...m.rules('lowThreshold',90,1,1,'shared'), ...m.rules('highThreshold',20,1,1,'shared') };
  m.store.replaceBundle({ settings, rules, presets: [] }); a.tier(1, 2); m.run(1000);
  assert.equal(m.find('HPColorsPreviewBarFill').style.washColor, '#123456');
  assert.equal(m.find('HPColorsBarColorHighEnemyHex').text, settings.side.enemy.barColorHigh, 'editable values remain authored');
  assert.equal(m.published().settings.shared.lowThreshold, 19); assert.equal(m.published().settings.shared.highThreshold, 20);
  assert.equal(m.settings().shared.lowThreshold, settings.shared.lowThreshold);
  assert.deepEqual(m.bundle().rules, rules);
});

function historicalRule(record, key, expected, mode = 'save') {
  const disk = profile(mode === 'save' ? { [CURRENT]: frame(record) } : {});
  const m = launch(disk), h = m.harness;
  const tree = installTopBarIdentityTree(h, { heroName: 'Infernus' }), a = abilities({ h, tree });
  a.tier(1, 3); m.run(3000);
  if (mode === 'code') {
    const find = id => h.contextPanel.FindChildTraverse(id);
    find('HPColorsBundleCodeEntry').text = frame(record, 'HPC3');
    find('HPColorsBundleReplaceButton').events.onactivate();
    find('HPColorsBundleReplaceConfirmButton').events.onactivate();
  }
  m.run(8000);
  const slot = h.$.HPColorsV3Settings.slots.find(slot => slot.setting === key), cell = slot.slot;
  const value = settings => (slot.side === 'shared' ? settings.shared : settings.side[slot.side])[key];
  const check = bundle => {
    for (const item of [bundle, ...bundle.presets, ...(bundle.v2scopes || [])]) {
      assert.equal(item.rules[cell].value, expected, key + ' v' + record.v + ' ' + mode);
      assert.equal(item.v2conditions, undefined);
    }
  };
  check(h.$.HPColorsV3Store.getBundle());
  assert.equal(value(latestPublishedConfig(h).settings), expected, 'effective publication uses repaired pixels');
  check(m.codec.classifyRecord(disk.disk.get(CURRENT)).bundle);
  const restarted = launch(disk); restarted.run(3000);
  check(restarted.harness.$.HPColorsV3Store.getBundle());
}

test('audit 24: historical ultimate-size conditions convert percentage to pixels at v3 once, including presets and scopes', () => {
  const defaults = setup().settings();
  for (const version of [1, 2, 3]) for (const mode of ['save', 'code']) {
    const sourceValue = version < 3 ? 150 : 30;
    const metadata = { v2pending: { ultimateTimerSize: sourceValue },
      v2conditions: { ultimateTimerSize: { slot: 1, minTier: 2, value: sourceValue } } };
    const record = { v: version, k: 'bundle', d: [], p: [{ id: 'A', name: 'A', d: [], ...copy(metadata) }],
      b: { ...copy(metadata), v2scopes: [{ settings: copy(defaults), ...copy(metadata) }] } };
    historicalRule(record, 'ultSize', 30, mode);
  }
});

test('audit 24: rule-only unit repairs do not depend on pending metadata, and boundary pixel records never convert twice', () => {
  for (const [version, legacy, key, sourceValue, expected] of [
    [1, 'enemyKillMarkerWidth', 'killMarkerWidth', 50, 5],
    [2, 'enemyKillMarkerWidth', 'killMarkerWidth', 5, 5],
    [5, 'rejuvScale', 'rejuvSize', 150, 36],
    [6, 'rejuvScale', 'rejuvSize', 36, 36],
  ]) for (const pending of [false, true]) for (const mode of ['save', 'code']) {
    const metadata = { v2conditions: { [legacy]: { slot: 1, minTier: 2, value: sourceValue } },
      ...(pending ? { v2pending: {} } : {}) };
    historicalRule({ v: version, k: 'bundle', d: [], p: [], b: metadata }, key, expected, mode);
  }
});

test('HUD-style condition slots show detected hero glyphs with cached SetImage writes, rings, tier labels and unavailable states', () => {
  const m = setup(), a = abilities(m), writes = [[], [], [], []];
  const { computed } = require('./style-cascade');
  for (let slot = 1; slot <= 4; slot++) {
    const image = m.find('HPColorsConditionSlot' + slot + 'Image');
    image.SetImage = path => writes[slot - 1].push(path);
    Object.defineProperty(image, 'src', { get() { throw new Error('Image.src must not be read'); } });
  }
  const rules = m.rules('barVisible', false); m.store.replaceBundle({ ...m.bundle(), rules });
  a.tier(1, 1); m.run(1000); m.h.$.HPColorsMenuToggle();
  m.fire(m.contract.controls.find(row => row.key === 'barVisible' && row.side === 'enemy').conditionId);
  assert.deepEqual(writes.map(values => values[0]), [
    'file://{images}/hud/abilities/inferno_molotov.psd', 'file://{images}/hud/abilities/inferno_dash.psd',
    'file://{images}/hud/abilities/inferno_deflect.psd', 'file://{images}/hud/abilities/inferno_bomb.psd',
  ]);
  // Stock hud_ability_icon.css: the disc is ability_frame_passive_0 washed keybindBGColor (#e8e4ea).
  assert.match(computed(m.find('HPColorsConditionSlot1Disc'), 'backgroundImage'), /ability_frame_passive_0_psd\.vtex/);
  assert.equal(computed(m.find('HPColorsConditionSlot1Disc'), 'washColor'), '#e8e4ea');
  assert.equal(computed(m.find('HPColorsConditionSlot1Image'), 'washColor'), '#242A2C');
  assert.equal(m.find('HPColorsConditionSlot1NumberLabel').text, '1');
  assert.equal(m.find('HPColorsConditionSlot1').BHasClass('Unavailable'), false);
  assert.equal(m.find('HPColorsConditionSlot2').BHasClass('Unavailable'), true);
  assert.equal(m.find('HPColorsConditionSlot1').BHasClass('Checked'), true);
  assert.equal(m.find('HPColorsConditionSlot1Label').text, 'TIER 2+');
  m.fire('HPColorsConditionSlot1'); assert.equal(m.find('HPColorsConditionSlot1Label').text, 'TIER 3+');
  // Stock tier art: ring (passive_1) for tiers 1-3; the backing becomes triangles (passive_2) at tier 2, spikes (passive_3) at tier 3.
  // Unselected slots show their live tier (sampled for display while open); the selected slot shows the required tier in green.
  a.tier(3, 2); m.run(1000);
  assert.equal(m.find('HPColorsConditionSlot3').BHasClass('ShowTier2'), true, 'unreferenced slots still show their live tier');
  assert.equal(m.find('HPColorsConditionSlot3').BHasClass('Unavailable'), false);
  assert.equal(m.find('HPColorsConditionSlot1').BHasClass('ShowTier3'), true, 'the selected slot shows the required tier, not the live one');
  assert.equal(m.find('HPColorsConditionSlot1').BHasClass('ShowTier1'), false);
  assert.match(computed(m.find('HPColorsConditionSlot3TierArt'), 'backgroundImage'), /ability_frame_passive_2_psd\.vtex/);
  assert.equal(computed(m.find('HPColorsConditionSlot3TierArt'), 'washColor'), '#e8e4ea');
  assert.match(computed(m.find('HPColorsConditionSlot3Ring'), 'backgroundImage'), /ability_frame_passive_1_psd\.vtex/);
  assert.equal(computed(m.find('HPColorsConditionSlot3Ring'), 'visibility'), 'visible', 'the tier-1 ring stays on at tier 2');
  assert.match(computed(m.find('HPColorsConditionSlot1TierArt'), 'backgroundImage'), /ability_frame_passive_3_psd\.vtex/);
  assert.equal(computed(m.find('HPColorsConditionSlot1TierArt'), 'washColor'), '#5fe69e');
  assert.equal(computed(m.find('HPColorsConditionSlot1Ring'), 'visibility'), 'visible', 'the tier-1 ring stays on at tier 3');
  assert.equal(computed(m.find('HPColorsConditionSlot2Ring'), 'visibility'), 'collapse', 'tier -1/0 has no ring');
  assert.equal(computed(m.find('HPColorsConditionSlot2TierArt'), 'visibility'), 'collapse');
  m.fire('HPColorsConditionSlot2');
  assert.equal(m.find('HPColorsConditionSlot2').BHasClass('Checked'), true);
  assert.equal(m.find('HPColorsConditionSlot1').BHasClass('Checked'), false);
  m.fire('HPColorsConditionSlot2'); assert.equal(m.find('HPColorsConditionSlot2Label').text, 'TIER 1+');
  assert.deepEqual(m.bundle().rules, rules, 'slot/tier clicks remain a draft');
  m.fire('HPColorsConditionSlot2', 'onmouseover'); m.fire('HPColorsConditionSlot2', 'onmouseout');
  assert.ok(m.h.dispatches.some(event => event[0] === 'UIShowTextTooltip' && event[1] === m.find('HPColorsConditionSlot2')));
  assert.ok(m.h.dispatches.some(event => event[0] === 'UIHideTextTooltip' && event[1] === m.find('HPColorsConditionSlot2')));
  m.run(3000); assert.deepEqual(writes.map(values => values.length), [1, 1, 1, 1]);
  a.tier(1, -1); m.run(1000); assert.equal(m.find('HPColorsConditionSlot1').BHasClass('Unavailable'), true);
  m.tree.setHeroName('Seven'); m.run(2000);
  assert.deepEqual(writes.map(values => values.at(-1)), [
    'file://{images}/hud/abilities/giga_ball.psd', 'file://{images}/hud/abilities/giga_static.psd',
    'file://{images}/hud/abilities/giga_chain.psd', 'file://{images}/hud/abilities/giga_storm.psd',
  ]);
  m.fire('HPColorsConditionCancelButton');
  m.fire(m.contract.controls.find(row => row.key === 'barVisible' && row.side === 'enemy').conditionId);
  assert.deepEqual(writes.map(values => values.length), [2, 2, 2, 2], 'reopening with the same hero does not reset the images');
});

test('Unknown heroes and missing pinned icons use the number fallback inside the same selectable discs', () => {
  const m = setup(), writes = [[], [], [], []];
  m.tree.setHeroName(''); m.run(2000);
  for (let slot = 1; slot <= 4; slot++) m.find('HPColorsConditionSlot' + slot + 'Image').SetImage = path => writes[slot - 1].push(path);
  const row = m.contract.controls.find(row => row.key === 'barVisible' && row.side === 'enemy');
  m.h.$.HPColorsMenuToggle(); m.fire(row.conditionId);
  for (let slot = 1; slot <= 4; slot++) {
    assert.equal(m.find('HPColorsConditionSlot' + slot).BHasClass('HasIcon'), false);
    assert.equal(m.find('HPColorsConditionSlot' + slot + 'FallbackLabel').text, String(slot));
  }
  assert.deepEqual(writes, [[], [], [], []]);
  const infernus = m.contract.heroes.find(hero => hero.key === 'hero_inferno');
  infernus.abilities[1] = null;
  m.tree.setHeroName('Infernus'); m.run(2000);
  assert.equal(m.find('HPColorsConditionSlot1').BHasClass('HasIcon'), true);
  assert.equal(m.find('HPColorsConditionSlot2').BHasClass('HasIcon'), false);
  assert.equal(writes[1].length, 0);
  m.fire('HPColorsConditionSlot2'); assert.equal(m.find('HPColorsConditionSlot2').BHasClass('Checked'), true);
  m.tree.setHeroName(''); m.run(2000);
  assert.equal(m.find('HPColorsConditionSlot1').BHasClass('HasIcon'), false);
});
