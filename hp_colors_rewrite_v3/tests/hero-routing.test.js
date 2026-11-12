'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { profile, launch, CURRENT } = require('./storage-fixture');
const { installTopBarIdentityTree } = require('../../scripts/hp-colors-panorama-test-adapter');
const { latestPublishedConfig } = require('./boot-layout');
const copy = value => JSON.parse(JSON.stringify(value));
const { presetControls } = require('./preset-controls');
function v2Record(body) {
  const payload = Buffer.from(JSON.stringify({ m: 'HPV2STORE', s: 4, t: 1, b: body })).toString('base64url');
  let sum = 2166136261; for (const c of payload) sum = Math.imul(sum ^ c.charCodeAt(0), 16777619);
  return 'HPV2S1.' + (sum >>> 0).toString(16).padStart(8,'0') + '.' + payload;
}
function setup(seed) {
  const disk = profile(); const m = launch(disk);
  const tree = installTopBarIdentityTree(m.harness, { heroName: '' }); m.run(3000);
  const h = m.harness, store = () => h.$.HPColorsV3Store;
  const find = id => { const p = h.contextPanel.FindChildTraverse(id); assert.ok(p, id); return p; };
  const fire = (id, event = 'onactivate') => { const fn = find(id).events[event]; assert.equal(typeof fn, 'function', id + ':' + event); fn(); };
  const defaults = copy(h.$.HPColorsV3Settings.defaults);
  const presets = ['A','B','C'].map((name, index) => { const settings = copy(defaults); settings.side.enemy.barColorLow = ['#112233','#445566','#778899'][index]; return { id: name, name, settings }; });
  if (seed !== false) store().replaceBundle({ settings: defaults, presets, ...seed });
  return { ...m, h, tree, disk, find, fire, ...presetControls(find, fire), defaults, presets, store, bundle: () => copy(store().getBundle()),
    color: () => latestPublishedConfig(h).settings.side.enemy.barColorLow,
    edit: color => { find('HPColorsBarColorLowEnemyHex').text = color; fire('HPColorsBarColorLowEnemyHex','ontextentrysubmit'); } };
}

test('Native hero metadata validates catalog keys and preset references, survives save/restart and never leaks into settings codes', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A' }, heroDefault: 'baked_default' });
  m.run(8000);
  const saved = m.codec.classifyRecord(m.disk.disk.get(CURRENT));
  assert.equal(saved.kind, 'valid');
  assert.deepEqual(copy(saved.bundle.heroPresets), { hero_inferno: 'A' });
  const next = launch(m.disk); next.run(3000);
  assert.deepEqual(copy(next.harness.$.HPColorsV3Store.getBundle().heroPresets), { hero_inferno: 'A' });
  assert.equal(next.harness.$.HPColorsV3Store.getBundle().heroDefault, 'baked_default');
  const sharing = m.h.$.HPColorsV3Sharing;
  assert.equal(sharing.importSettingsCode(sharing.exportSettingsCode(m.settings()).code).heroPresets, undefined);
  for (const metadata of [{ heroPresets: { hero_fake: 'A' } }, { heroPresets: { hero_inferno: 'missing' } }, { heroDefault: 'missing' }, { heroDefault: 1 }, { heroPresets: [] },
    { sourcePresetId: 'missing' }, { sourceWasMapped: 'yes' }, { sourceWasMapped: true }]) {
    const result = sharing.exportBundleCode({ settings: m.defaults, presets: m.presets, ...metadata });
    assert.equal(result.ok, false, JSON.stringify(metadata));
  }
});

test('Two local TopBar samples route presets while the menu is closed; changes, same-source edits, unknown and fallback obey v2', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A', hero_gigawatt: 'B' }, heroDefault: 'C' });
  assert.equal(m.find('HPColorsMenuHost').BHasClass('HPC3Open'), false);
  m.tree.setHeroName('  inFERnus  '); m.run(1000);
  assert.equal(m.color(), m.defaults.side.enemy.barColorLow, 'one observation is not settled');
  m.run(1000); assert.equal(m.color(), '#112233');
  assert.equal(m.find('HPColorsUndoButton').enabled, false, 'automatic routes do not create history');
  m.edit('#ABCDEF'); m.run(2000); assert.equal(m.color(), '#ABCDEF', 'same source preserves edits');
  m.tree.replaceLocalPlayerCard('#hero_gigawatt'); m.run(2000); assert.equal(m.color(), '#445566');
  m.tree.setHeroName('unknown newcomer'); m.run(2000); assert.equal(m.color(), '#445566', 'unknown does not fall to the default');
  m.tree.setHeroName('Vindicta'); m.run(2000); assert.equal(m.color(), '#778899', 'unmapped known hero uses default');
  m.store().replaceBundle({ ...m.bundle(), heroDefault: null });
  m.tree.setHeroName('Infernus'); m.run(2000); assert.equal(m.color(), '#ABCDEF', 'A kept the edit made while it was applied (2026-11-02)');
  m.tree.setHeroName('Vindicta'); m.run(2000); assert.equal(m.color(), m.defaults.side.enemy.barColorLow, 'leaving mapped route without default restores baked default');
});

test('Routing waits for the whole slider or picker session, then applies without adding history', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A', hero_gigawatt: 'B' } });
  m.tree.setHeroName('Infernus'); m.run(2000);
  const row = m.h.$.HPColorsV3Settings.controls.find(row => row.key === 'lowThreshold');
  m.find(row.sliderId).value = 30;
  m.tree.setHeroName('Seven'); m.run(2000); assert.equal(m.color(), '#112233');
  m.h.releaseSlider(m.find(row.sliderId)); m.run(0); assert.equal(m.color(), '#445566');
  m.fire('HPColorsBarColorLowEnemySwatch');
  m.tree.setHeroName('Infernus'); m.run(2000); assert.equal(m.color(), '#445566');
  m.fire('HPColorsPickerDoneButton'); m.run(0); assert.equal(m.color(), '#112233');
});

test('Presets identity and portrait HEROES picker assign exclusively; DEFAULT toggles and map edits share settings Undo', () => {
  const m = setup({ heroPresets: { hero_inferno: 'B' }, heroDefault: 'C' });
  m.h.$.HPColorsMenuToggle(); m.fire('HPColorsNavPresetsButton');
  assert.equal(m.find('HPColorsHeroIdentityLabel').text, 'NO HERO DETECTED');
  m.tree.setHeroName('Infernus'); m.run(1000); assert.equal(m.find('HPColorsHeroIdentityLabel').text, 'DETECTING HERO');
  m.run(1000); assert.equal(m.find('HPColorsHeroIdentityLabel').text, 'INFERNUS');
  m.preset(0, 'Heroes');
  assert.equal(m.find('HPColorsHeroDialog').BHasClass('Open'), true);
  const tiles = m.find('HPColorsHeroList').Children();
  assert.equal(tiles.length, 46); // 45 playable heroes plus the default gear.
  // 6790 flags Violet (like Baba) in development but she is playable (not disabled), so she is listed.
  assert.equal(tiles.some(tile => tile.GetAttributeString('hpv3_hero_key', '') === 'hero_artist'), true);
  const infernus = tiles.find(tile => tile.GetAttributeString('hpv3_hero_key', '') === 'hero_inferno');
  m.find('HPColorsHeroSearchField').text = 'infernus'; m.fire('HPColorsHeroSearchField','ontextentrychange');
  assert.ok(m.find('HPColorsHeroList').Children()[0] === tiles[0], 'search does not rebuild the grid');
  assert.equal(m.find('HPColorsHeroMatchCount').text, '1 / 45 heroes');
  assert.equal(infernus.BHasClass('AssignedElsewhere'), true); infernus.events.onfocus();
  assert.ok(m.h.dispatches.some(event => event[0] === 'UIShowTextTooltip' && /Assigned to B/.test(event[2])));
  assert.equal(infernus.BHasClass('Checked'), false);
  m.edit('#ABCDEF'); m.fire(infernus.id);
  assert.deepEqual(m.bundle().heroPresets, { hero_inferno: 'A' });
  assert.equal(infernus.BHasClass('Checked'), true);
  m.fire('HPColorsUndoButton');
  assert.deepEqual(m.bundle().heroPresets, { hero_inferno: 'B' });
  assert.equal(m.color(), '#ABCDEF', 'map Undo restores the settings from the same snapshot');
  m.fire(infernus.id); m.fire(infernus.id);
  assert.deepEqual(m.bundle().heroPresets, {});
  for (const query of ['baba', 'violet']) {
    m.find('HPColorsHeroSearchField').text = query; m.fire('HPColorsHeroSearchField','ontextentrychange');
    assert.equal(m.find('HPColorsHeroMatchCount').text, '1 / 45 heroes', 'playable development hero is listed: ' + query);
  }
  for (const query of ['testhero', 'generic person', 'kali']) { // needs-testing or disabled heroes stay hidden
    m.find('HPColorsHeroSearchField').text = query; m.fire('HPColorsHeroSearchField','ontextentrychange');
    assert.ok(m.find('HPColorsHeroMatchCount').text.startsWith('0 / 45 heroes'), query);
  }
  m.fire('HPColorsHeroCloseButton'); assert.equal(m.find('HPColorsHeroDialog').BHasClass('Open'), false);
  m.preset(0, 'Default'); assert.equal(m.bundle().heroDefault, 'A');
  m.select(2); assert.equal(m.find('HPColorsPresetSelectedDefaultButton').BHasClass('Checked'), false);
  m.preset('baked_default', 'Default'); assert.equal(m.bundle().heroDefault, 'baked_default');
  m.fire('HPColorsPresetSelectedDefaultButton'); assert.equal(m.bundle().heroDefault, null);
  m.fire('HPColorsUndoButton'); assert.equal(m.bundle().heroDefault, 'baked_default');
});

test('Pregame retains its route, hideout uses default, two unknown samples clear identity and old epoch polls cannot sample, route or schedule', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A' }, heroDefault: 'C' });
  m.tree.setHeroName('Infernus'); m.run(2000);
  m.tree.hud.AddClass('GameStatePreGame'); m.run(1000); assert.equal(m.color(), '#112233');
  m.tree.hud.RemoveClass('GameStatePreGame'); m.run(6000); assert.equal(m.color(), '#112233');
  const oldEpoch = m.h.scheduler.jobs.filter(job => job.delay === 1).map(job => job.fn);
  assert.ok(oldEpoch.length);
  m.tree.hud.AddClass('connectedToHideout'); m.run(1000);
  assert.equal(m.color(), '#778899'); assert.equal(m.find('HPColorsHeroIdentityLabel').text, 'IN HIDEOUT');
  m.edit('#ABCDEF'); const jobs = m.h.scheduler.jobs.length, dispatches = m.h.dispatches.length;
  oldEpoch.forEach(fn => { fn(); fn(); });
  assert.equal(m.h.scheduler.jobs.length, jobs); assert.equal(m.h.dispatches.length, dispatches);
  assert.equal(m.color(), '#ABCDEF', 'stale epoch did not fall back or sample old hero');
  m.tree.hud.RemoveClass('connectedToHideout'); m.run(6000); assert.equal(m.color(), '#112233');
  m.tree.setHeroName(''); m.run(1000); assert.equal(m.find('HPColorsHeroIdentityLabel').text, 'INFERNUS');
  m.run(1000); assert.equal(m.find('HPColorsHeroIdentityLabel').text, 'NO HERO DETECTED');
  assert.equal(m.color(), '#112233', 'clearing identity leaves the current look');
});

test('Reinclusion and layout reload retire old generations without duplicate watches or losing same-source edits', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A' } });
  m.tree.setHeroName('Infernus'); m.run(2000); m.edit('#ABCDEF');
  const oldGeneration = m.h.scheduler.jobs.filter(job => job.delay === 1).map(job => job.fn);
  m.includeScripts(); m.onload(); m.run(3000);
  assert.equal(m.color(), '#ABCDEF', 'same-source edits survive warm reinclusion');
  const jobs = m.h.scheduler.jobs.length, dispatches = m.h.dispatches.length;
  oldGeneration.forEach(fn => { fn(); fn(); });
  assert.equal(m.h.scheduler.jobs.length, jobs); assert.equal(m.h.dispatches.length, dispatches);
  const beforeReload = m.h.scheduler.jobs.filter(job => job.delay === 1).map(job => job.fn);
  m.reload(); m.run(3000);
  const afterJobs = m.h.scheduler.jobs.length, afterDispatches = m.h.dispatches.length;
  beforeReload.forEach(fn => { fn(); fn(); });
  assert.equal(m.h.scheduler.jobs.length, afterJobs); assert.equal(m.h.dispatches.length, afterDispatches);
  m.tree.setHeroName('Seven'); m.run(2000); assert.equal(m.color(), m.defaults.side.enemy.barColorLow);
});

test('Delete removes map/default references, reorder preserves them and ordinary IMPORT never takes routing metadata', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A', hero_gigawatt: 'B' }, heroDefault: 'A' });
  m.preset(0, 'Apply');
  m.preset(0, 'Down');
  assert.deepEqual(m.bundle().heroPresets, { hero_inferno: 'A', hero_gigawatt: 'B' });
  const code = m.h.$.HPColorsV3Sharing.exportBundleCode({ settings: m.presets[2].settings, presets: m.presets, heroPresets: { hero_inferno: 'C' }, heroDefault: 'C' }).code;
  m.find('HPColorsBundleCodeEntry').text = code; m.fire('HPColorsBundleImportButton');
  const appended = m.bundle().presets.slice(3);
  assert.equal(appended.length, 3); assert.ok(appended.every(preset => !['A','B','C'].includes(preset.id)));
  assert.deepEqual(m.bundle().heroPresets, { hero_inferno: 'A', hero_gigawatt: 'B' }); assert.equal(m.bundle().heroDefault, 'A');
  assert.equal(m.bundle().sourcePresetId, 'A'); assert.equal(m.bundle().sourceWasMapped, true);
  m.preset(1, 'Delete'); m.fire('HPColorsPresetDeleteConfirmButton');
  assert.deepEqual(m.bundle().heroPresets, { hero_gigawatt: 'B' }); assert.equal(m.bundle().heroDefault, null);
  assert.equal(m.bundle().presets.some(preset => preset.id === 'A'), false);
  assert.equal(m.bundle().sourcePresetId, null); assert.equal(m.bundle().sourceWasMapped, false);
});

test('REPLACE ALL remaps the built-in copy consistently and restores only surviving hero routes', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A' }, heroDefault: 'B' });
  const sharing = m.h.$.HPColorsV3Sharing;
  const code = sharing.exportBundleCode({ settings: m.presets[2].settings,
    presets: [{ id: 'baked_default', name: 'Imported default', settings: m.defaults }],
    heroPresets: { hero_inferno: 'baked_default' }, heroDefault: 'baked_default', sourcePresetId: 'baked_default', sourceWasMapped: true }).code;
  m.find('HPColorsBundleCodeEntry').text = code; m.fire('HPColorsBundleReplaceButton'); m.fire('HPColorsBundleReplaceConfirmButton');
  const bundle = m.bundle();
  assert.equal(bundle.presets.length, 1); assert.notEqual(bundle.presets[0].id, 'baked_default');
  assert.equal(bundle.heroPresets.hero_inferno, bundle.presets[0].id); assert.equal(bundle.heroDefault, bundle.presets[0].id);
  assert.equal(bundle.sourcePresetId, bundle.presets[0].id); assert.equal(bundle.sourceWasMapped, true);
  assert.equal(m.color(), '#778899');
  const partial = sharing.exportBundleCode({ settings: m.defaults, presets: m.presets,
    heroPresets: { hero_inferno: 'A', hero_gigawatt: 'B' }, heroDefault: 'B', sourcePresetId: 'B', sourceWasMapped: true }).code;
  const wire = JSON.parse(Buffer.from(partial.split('.')[2], 'base64url').toString());
  wire.p = wire.p.filter(preset => preset.id !== 'B');
  const payload = Buffer.from(JSON.stringify(wire)).toString('base64url');
  m.find('HPColorsBundleCodeEntry').text = 'HPC3.' + m.codec.checksum(payload) + '.' + payload;
  m.fire('HPColorsBundleReplaceButton'); m.fire('HPColorsBundleReplaceConfirmButton');
  assert.deepEqual(m.bundle().heroPresets, { hero_inferno: 'A' }); assert.equal(m.bundle().heroDefault, null);
  assert.equal(m.bundle().sourcePresetId, null); assert.equal(m.bundle().sourceWasMapped, false);
});

test('V2 save conversion resolves first selected, then except, then all against the catalog, with one native default', () => {
  const records = [
    { id: 'except', name: 'Except', mode: 'except', heroes: ['hero_inferno','hero_hornet'], values: { enemyLow: '#112233' } },
    { id: 'all', name: 'All', mode: 'all', heroes: [], values: { enemyLow: '#445566' } },
    { id: 'selected', name: 'Selected', mode: 'selected', heroes: ['hero_inferno'], values: { enemyLow: '#778899' } },
    { id: 'selected-later', name: 'Selected later', mode: 'selected', heroes: ['hero_inferno'], values: { enemyLow: '#AABBCC' } },
    { id: 'except-later', name: 'Except later', mode: 'except', heroes: ['hero_hornet'], values: { enemyLow: '#DDEEFF' } },
    { id: 'all-later', name: 'All later', mode: 'all', heroes: [], values: {} },
  ];
  const body = { version: 1, values: {}, userPresets: records,
    scopes: [{ id: 'old-scope', mode: 'except', heroes: ['hero_inferno'], values: {} }] };
  const p = profile({ 'hantu.hpcolors.v2/state': v2Record(body) });
  const m = launch(p); const tree = installTopBarIdentityTree(m.harness, { heroName: 'Infernus' }); m.run(5000);
  let bundle = copy(m.harness.$.HPColorsV3Store.getBundle());
  assert.equal(bundle.heroPresets.hero_inferno, 'selected'); assert.equal(bundle.heroPresets.hero_gigawatt, 'except');
  assert.equal(bundle.heroPresets.hero_hornet, 'all'); assert.equal(bundle.heroDefault, 'all');
  assert.ok(bundle.presets.concat(bundle.v2scopes).every(item => !Object.hasOwn(item, 'mode') && !Object.hasOwn(item, 'heroes')));
  assert.equal(latestPublishedConfig(m.harness).settings.side.enemy.barColorLow, '#778899');
  tree.setHeroName('Seven'); m.run(2000); assert.equal(latestPublishedConfig(m.harness).settings.side.enemy.barColorLow, '#112233');
  const again = launch(p); again.run(3000); bundle = copy(again.harness.$.HPColorsV3Store.getBundle());
  assert.equal(bundle.heroDefault, 'all'); assert.equal(bundle.heroPresets.hero_inferno, 'selected');
});

test('Explicit Apply is the same routing source, and an edit is saved into the applied preset across restart', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A' } });
  m.preset(0, 'Apply'); m.edit('#ABCDEF');
  m.tree.setHeroName('Infernus'); m.run(2000); assert.equal(m.color(), '#ABCDEF', 'Apply sets the source even before detection');
  m.run(8000);
  const restarted = launch(m.disk);
  installTopBarIdentityTree(restarted.harness, { heroName: 'Infernus' }); restarted.run(5000);
  assert.equal(latestPublishedConfig(restarted.harness).settings.side.enemy.barColorLow, '#ABCDEF');
  const bundle = restarted.harness.$.HPColorsV3Store.getBundle();
  // User, 2026-11-02: edits made while a custom preset is applied are kept in that preset.
  assert.equal(bundle.presets[0].settings.side.enemy.barColorLow, '#ABCDEF', 'the applied preset keeps the edit');
  assert.equal(bundle.sourcePresetId, 'A'); assert.equal(bundle.sourceWasMapped, true);
  const settingsWire = JSON.parse(Buffer.from(m.h.$.HPColorsV3Sharing.exportSettingsCode(m.settings()).code.split('.')[2], 'base64url').toString());
  for (const key of ['heroPresets','heroDefault','sourcePresetId','sourceWasMapped']) {
    assert.equal(Object.hasOwn(settingsWire, key), false); assert.equal(Object.hasOwn(latestPublishedConfig(m.h), key), false);
  }
});

test('Hero map/default are conservative metadata keys: disjoint keys merge, any shared map edit conflicts', () => {
  for (const overlap of [false, true]) {
    const m = setup({ heroPresets: {}, heroDefault: null }); m.run(8000);
    const baseline = copy(m.codec.classifyRecord(m.disk.disk.get(CURRENT)).bundle);
    const local = m.bundle(); local.heroPresets.hero_inferno = 'A'; m.store().replaceBundle(local);
    const remote = copy(baseline);
    if (overlap) remote.heroPresets.hero_gigawatt = 'B'; else remote.heroDefault = 'C';
    const bytes = m.codec.encodeRecord(remote); m.disk.disk.set(CURRENT, bytes); m.run(10000);
    if (overlap) {
      assert.match(m.status(), /^CONFLICT:.*metadata heroPresets/);
      assert.equal(m.disk.disk.get(CURRENT), bytes);
      assert.deepEqual(m.bundle().heroPresets, { hero_inferno: 'A' });
    } else {
      const saved = m.codec.classifyRecord(m.disk.disk.get(CURRENT)).bundle;
      assert.deepEqual(copy(saved.heroPresets), { hero_inferno: 'A' }); assert.equal(saved.heroDefault, 'C');
      assert.equal(m.status(), 'Saved; merged a change saved elsewhere');
    }
  }
});

test('V2 Current source survives conversion so settling its hero does not discard unsaved edits', () => {
  const body = { version: 1, values: {}, userPresets: [
    { id: 'user_0001', name: 'Infernus', mode: 'selected', heroes: ['hero_inferno'], values: { enemyLow: '#112233' } }],
    scopes: [{ id: 'scope_current', sourcePresetId: 'user_0001', mode: 'selected', heroes: ['hero_inferno'], values: { enemyLow: '#ABCDEF' } }] };
  const m = launch(profile({ 'hantu.hpcolors.v2/state': v2Record(body) }));
  installTopBarIdentityTree(m.harness, { heroName: 'Infernus' }); m.run(5000);
  assert.equal(latestPublishedConfig(m.harness).settings.side.enemy.barColorLow, '#ABCDEF');
  const bundle = m.harness.$.HPColorsV3Store.getBundle();
  assert.equal(bundle.sourcePresetId, 'user_0001'); assert.equal(bundle.sourceWasMapped, true); assert.equal(bundle.heroDefault, null);
});

test('Deferred route callbacks reject both retired generations and lifecycle epochs', () => {
  for (const boundary of ['epoch', 'generation']) {
    const m = setup({ heroPresets: { hero_inferno: 'A', hero_gigawatt: 'B' }, heroDefault: 'C' });
    m.tree.setHeroName('Infernus'); m.run(2000);
    const row = m.h.$.HPColorsV3Settings.controls.find(row => row.key === 'lowThreshold');
    m.find(row.sliderId).value = 30; m.tree.setHeroName('Seven'); m.run(2000);
    m.h.releaseSlider(m.find(row.sliderId));
    const deferred = m.h.scheduler.jobs.filter(job => job.delay === 0).map(job => job.fn);
    assert.ok(deferred.length);
    if (boundary === 'epoch') {
      m.tree.hud.AddClass('connectedToHideout');
      m.h.scheduler.jobs.filter(job => job.delay === 1).forEach(job => job.fn());
    } else { m.includeScripts(); m.onload(); }
    m.edit('#ABCDEF');
    const jobs = m.h.scheduler.jobs.length, dispatches = m.h.dispatches.length;
    deferred.forEach(fn => fn());
    assert.equal(m.color(), '#ABCDEF'); assert.equal(m.h.dispatches.length, dispatches); assert.equal(m.h.scheduler.jobs.length, jobs);
  }
});

test('No route keeps an ordinary edit, while explicit built-in default and hideout fallback use the shipped settings', () => {
  const m = setup({ heroPresets: {}, heroDefault: null }); m.edit('#ABCDEF');
  m.tree.setHeroName('Seven'); m.run(2000); assert.equal(m.color(), '#ABCDEF');
  m.store().replaceBundle({ ...m.bundle(), heroDefault: 'baked_default' }); m.run(1000);
  assert.equal(m.color(), m.defaults.side.enemy.barColorLow);
  m.store().replaceBundle({ ...m.bundle(), heroPresets: { hero_inferno: 'A' }, heroDefault: null });
  m.tree.setHeroName('Infernus'); m.run(2000); assert.equal(m.color(), '#112233');
  m.tree.hud.AddClass('connectedToHideout'); m.run(1000); assert.equal(m.color(), m.defaults.side.enemy.barColorLow);
});

test('audit 23: migrated hero-scoped Current keeps its fallback origin without a surviving source preset', () => {
  for (const mode of ['selected', 'except']) for (const source of ['deleted', 'absent']) {
    const current = { id: 'scope_current', mode, heroes: ['hero_inferno'], values: { enemyLow: '#ABCDEF' } };
    if (source === 'deleted') current.sourcePresetId = 'user_0001';
    const p = profile({ 'hantu.hpcolors.v2/state': v2Record({ version: 1, values: {}, userPresets: [], scopes: [current] }) });
    const migrated = launch(p); migrated.run(5000);
    const bundle = copy(migrated.harness.$.HPColorsV3Store.getBundle());
    assert.equal(bundle.sourcePresetId, null, mode + '/' + source + ': no dangling source id');
    assert.equal(bundle.sourceWasMapped, true, mode + '/' + source + ': scoped origin is independent of source existence');
    assert.equal(bundle.settings.side.enemy.barColorLow, '#ABCDEF', 'no detected hero preserves the Current look');
    const again = launch(p);
    installTopBarIdentityTree(again.harness, { heroName: 'Seven' }); again.run(5000);
    assert.equal(latestPublishedConfig(again.harness).settings.side.enemy.barColorLow, '#FD4949', 'known hero takes the built-in fallback after restart');
    assert.equal(again.harness.$.HPColorsV3Store.getBundle().sourceWasMapped, false);
  }
});

test('audit 23: source-only explicit Apply creates exactly one Undo record and restores the previous routing source', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A' } });
  m.store().replaceBundle({ ...m.bundle(), settings: m.defaults,
    presets: m.presets.map(preset => ({ ...preset, settings: copy(m.defaults) })) });
  m.preset(0, 'Apply');
  m.h.$.HPColorsMenuToggle(); m.h.$.HPColorsMenuToggle(); m.h.$.HPColorsMenuToggle();
  assert.equal(m.find('HPColorsUndoButton').enabled, false, 'a fresh menu has no earlier history');
  m.preset(1, 'Apply');
  assert.equal(m.bundle().sourcePresetId, 'B'); assert.equal(m.bundle().sourceWasMapped, false);
  assert.equal(m.find('HPColorsUndoButton').enabled, true, 'equal scalar settings must not suppress source history');
  m.fire('HPColorsUndoButton');
  assert.equal(m.bundle().sourcePresetId, 'A'); assert.equal(m.bundle().sourceWasMapped, true);
  assert.deepEqual(copy(m.settings()), m.defaults);
  assert.equal(m.find('HPColorsUndoButton').enabled, false, 'one Apply is exactly one Undo entry');
  m.edit('#ABCDEF'); m.tree.setHeroName('Infernus'); m.run(2000);
  assert.equal(m.color(), '#ABCDEF', 'Undo restored the same-source guard, not only the values');
});

test('audit 23: legacy user Off normalizes to All before base materialization and routing; baked Off never becomes a default', () => {
  const rows = [
    { id: 'user_0001', name: 'User Off', mode: 'off', heroes: [], values: { widthScale: 200, enemyLow: '#112233' } },
    { id: 'user_0002', name: 'Selected', mode: 'selected', heroes: ['hero_inferno'], own: ['enemyLow'], values: { widthScale: 300, enemyLow: '#AABBCC' } },
    { id: 'user_0003', name: 'Later All', mode: 'all', heroes: [], values: { widthScale: 400, enemyLow: '#445566' } },
  ];
  const legacy = require('./fixtures/v2-contract.json');
  const pairs = keys => keys.flatMap((key, index) => Object.hasOwn(legacy.defaults, key) && legacy.defaults[key] !== legacy.codecDefaults[key] ? [[index, legacy.defaults[key]]] : []);
  const baked = { id: 'baked_default', kind: 'baked', name: 'Baked Off', mode: 'off', heroes: [], values: pairs(legacy.codecKeys),
    conditions: null, hpv2: { v: 2, values: pairs(legacy.extensionKeys), conditions: {} } };
  for (const input of ['save', 'code']) {
    let m, tree;
    if (input === 'save') {
      m = launch(profile({ 'hantu.hpcolors.v2/state': v2Record({ version: 1, values: {}, userPresets: rows }) }));
      tree = installTopBarIdentityTree(m.harness, { heroName: 'Infernus' }); m.run(5000);
    } else {
      m = setup(false); tree = m.tree;
      const records = [baked, ...rows.map(row => ({ ...row, kind: 'user', conditions: null,
        values: Object.entries(row.values).map(([key, value]) => [legacy.codecKeys.indexOf(key), value]),
        hpv2: { v: 2, values: [], conditions: {} } }))];
      m.find('HPColorsBundleCodeEntry').text = 'HPCRP1' + JSON.stringify({ records, selectedPresetId: 'user_0001' });
      m.fire('HPColorsBundleReplaceButton'); m.fire('HPColorsBundleReplaceConfirmButton');
      tree.setHeroName('Infernus'); m.run(2000);
    }
    const bundle = copy(m.harness.$.HPColorsV3Store.getBundle());
    assert.equal(bundle.heroDefault, 'user_0001', input + ': normalized Off is the first user All');
    assert.equal(bundle.heroPresets.hero_inferno, 'user_0002'); assert.equal(bundle.heroPresets.hero_gigawatt, 'user_0001');
    assert.equal(bundle.presets.find(preset => preset.id === 'user_0002').settings.side.enemy.barWidth, 158, 'own materializes over normalized Off, not the later All');
    assert.equal(latestPublishedConfig(m.harness).settings.side.enemy.barColorLow, '#AABBCC');
    tree.setHeroName('Seven'); m.run(2000);
    assert.equal(latestPublishedConfig(m.harness).settings.side.enemy.barColorLow, '#112233');
  }
});

test('ticket 27 changed nav stars follow automatic hero routes and clear on return to baked defaults', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A' } });
  const group = m.h.$.HPColorsV3Settings.menu.groups.find(group => group.page === 'Bar' && group.name === 'Colors');
  const buttons = [m.find('HPColorsNavBarButton'), m.find(group.subNavId)];
  for (const button of buttons) assert.equal(button.BHasClass('Changed'), false);
  m.tree.setHeroName('Infernus'); m.run(2000);
  for (const button of buttons) assert.equal(button.BHasClass('Changed'), true);
  assert.equal(m.find('HPColorsNavHPTextButton').BHasClass('Changed'), false);
  m.tree.setHeroName('Seven'); m.run(2000);
  for (const button of buttons) assert.equal(button.BHasClass('Changed'), false);
});

test('ticket 27 preset glyph DEFAULT state updates with assignment and Undo; hero names are passive', () => {
  const m = setup({});
  m.h.$.HPColorsMenuToggle(); m.fire('HPColorsNavPresetsButton'); m.select(0);
  const toggle = m.find('HPColorsPresetSelectedDefaultButton');
  assert.equal(toggle.BHasClass('Checked'), false); m.fire(toggle.id);
  assert.equal(toggle.BHasClass('Checked'), true);
  m.fire('HPColorsUndoButton'); assert.equal(toggle.BHasClass('Checked'), false);
  m.preset('baked_default', 'Default'); assert.equal(toggle.BHasClass('Checked'), true);
  m.preset(0, 'Heroes');
  for (const name of m.find('HPColorsHeroList').FindChildrenWithClassTraverse('HPC3HeroName')) assert.equal(name.hittest, false);
  m.fire('HPColorsHeroEscClose'); assert.equal(m.find('HPColorsHeroDialog').BHasClass('Open'), false);
});

test('round 3: selected-for-actions, applied-source and default-for-unassigned are independent tile markers', () => {
  const m = setup({ heroDefault: 'C' });
  m.h.$.HPColorsMenuToggle(); m.fire('HPColorsNavPresetsButton');
  m.preset(0, 'Apply'); m.select(1);
  const [a, b, c] = m.tiles();
  assert.equal(a.BHasClass('Applied'), true); assert.equal(a.BHasClass('Selected'), false);
  assert.equal(b.BHasClass('Selected'), true); assert.equal(b.BHasClass('Applied'), false);
  assert.equal(c.BHasClass('HeroDefault'), true); assert.equal(c.BHasClass('Selected'), false);
  m.fire('HPColorsPresetSelectedApplyButton');
  assert.equal(b.BHasClass('Applied'), true); assert.equal(a.BHasClass('Applied'), false);
  m.fire('HPColorsUndoButton');
  assert.equal(a.BHasClass('Applied'), true); assert.equal(b.BHasClass('Selected'), true);
});

test('a preset applied by hand stays until the hero, phase or route changes, even with a hero default', () => {
  // User, 2026-11-02: applying Default while a hero default (C) was set came back to C a second later.
  const m = setup({ heroPresets: { hero_inferno: 'A' }, heroDefault: 'C' });
  m.h.$.HPColorsMenuToggle(); m.fire('HPColorsNavPresetsButton');
  m.tree.setHeroName('Vindicta'); m.run(2000); assert.equal(m.color(), '#778899', 'the hero default applies to an unmapped hero');
  m.fire('HPColorsPresetDefault'); m.fire('HPColorsPresetSelectedApplyButton'); m.run(6000);
  assert.equal(m.color(), m.defaults.side.enemy.barColorLow, 'Default applied by hand stays');
  assert.deepEqual(copy(latestPublishedConfig(m.h).settings), m.defaults, 'every setting is back to default');
  m.tree.setHeroName('Seven'); m.run(2000); assert.equal(m.color(), '#778899', 'a new hero routes again');
  m.tree.setHeroName('Infernus'); m.run(2000); assert.equal(m.color(), '#112233', 'a mapped hero routes to its preset');
});

test('edits follow the applied custom preset only; the baked Default and other presets keep their values', () => {
  const m = setup();
  m.preset(1, 'Apply'); m.edit('#ABCDEF'); m.run(1000);
  let bundle = m.bundle();
  assert.equal(bundle.presets[1].settings.side.enemy.barColorLow, '#ABCDEF', 'B follows the edit');
  assert.equal(bundle.presets[0].settings.side.enemy.barColorLow, '#112233', 'A is untouched');
  m.fire('HPColorsPresetDefault'); m.fire('HPColorsPresetSelectedApplyButton'); m.edit('#FEDCBA'); m.run(1000);
  bundle = m.bundle();
  assert.deepEqual(bundle.presets.map(p => p.settings.side.enemy.barColorLow), ['#112233', '#ABCDEF', '#778899'], 'editing on Default changes no preset');
  m.preset(1, 'Apply'); m.run(1000); assert.equal(m.color(), '#ABCDEF', 'applying B again restores its edited values');
});

// Re-audit 2026-11-02 (PresetsReview R1, R1b, R2, R5, R6). Ways the once-per-route rule can fail: the route key
// survives a phase round trip, so the same hero and target never route again after a lobby or a hero-testing
// restart; a script reload forgets the key and re-routes over a preset applied by hand; a store that refuses
// every route is retried with a full library copy each second; SAVE NEW leaves the old preset applied, so
// later edits keep going into it.
function applyDefaultByHand(m) {
  m.h.$.HPColorsMenuToggle(); m.fire('HPColorsNavPresetsButton'); m.fire('HPColorsPresetDefault'); m.fire('HPColorsPresetSelectedApplyButton');
}
test('a phase round trip routes the same hero again: lobby and hero-testing restart', () => {
  for (const roundTrip of [
    m => { m.tree.hud.AddClass('GameStatePreGame'); m.run(6000); m.tree.hud.RemoveClass('GameStatePreGame'); m.run(6000); },
    m => { m.tree.setGameTime('-0:30'); m.run(3000); m.tree.setGameTime('0:05'); m.run(6000); }]) {
    const m = setup({ heroPresets: { hero_inferno: 'A' }, heroDefault: 'C' });
    m.tree.setHeroName('Infernus'); m.run(2000); assert.equal(m.color(), '#112233');
    applyDefaultByHand(m); m.run(3000); assert.equal(m.color(), m.defaults.side.enemy.barColorLow, 'Default by hand stays');
    roundTrip(m);
    assert.equal(m.color(), '#112233', 'the route fires again once the phase changed');
  }
});
test('a script reload keeps a preset applied by hand', () => {
  const m = setup({ heroPresets: { hero_inferno: 'A' }, heroDefault: 'C' });
  m.tree.setHeroName('Infernus'); m.run(2000);
  applyDefaultByHand(m); m.run(3000); assert.equal(m.color(), m.defaults.side.enemy.barColorLow);
  m.includeScripts(); m.onload(); m.run(3000);
  assert.equal(m.color(), m.defaults.side.enemy.barColorLow, 'the route already fired for this hero before the reload');
  m.tree.setHeroName('Seven'); m.run(2000); assert.equal(m.color(), '#778899', 'a new hero still routes after the reload');
});
test('a store that refuses every route is not asked with a library copy each second', () => {
  const seed = setup({ heroPresets: { hero_inferno: 'A' } }); seed.run(8000);
  const parts = seed.disk.disk.get(CURRENT).split('.');
  const body = JSON.parse(Buffer.from(parts[2], 'base64url').toString()); body.v = seed.h.$.HPColorsV3Settings.recordVersion + 1;
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  seed.disk.disk.set(CURRENT, 'HPV2S1.' + seed.codec.checksum(payload) + '.' + payload);
  const m = launch(seed.disk); installTopBarIdentityTree(m.harness, { heroName: 'Infernus' }); m.run(3000);
  assert.equal(m.status(), 'Save from a newer version');
  const real = m.harness.$.HPColorsV3Store; let copies = 0;
  m.harness.$.HPColorsV3Store = Object.assign({}, real, { getBundle: (...args) => { copies++; return real.getBundle(...args); } });
  m.run(10000);
  assert.ok(copies <= 1, 'library copied ' + copies + ' times in 10 s');
});
test('SAVE NEW makes the new preset the applied one, so later edits go into it', () => {
  const m = setup();
  m.h.$.HPColorsMenuToggle(); m.fire('HPColorsNavPresetsButton');
  m.preset(1, 'Apply'); m.edit('#ABCDEF'); m.run(1000);
  m.find('HPColorsPresetNameEntry').text = 'Variant'; m.fire('HPColorsPresetSaveButton'); m.run(1000);
  let bundle = m.bundle();
  assert.equal(bundle.presets.length, 4); assert.equal(bundle.sourcePresetId, bundle.presets[3].id, 'the new preset is applied');
  assert.equal(bundle.sourceWasMapped, false);
  m.edit('#FEDCBA'); m.run(1000); bundle = m.bundle();
  assert.equal(bundle.presets[3].settings.side.enemy.barColorLow, '#FEDCBA', 'the edit goes into the new preset');
  assert.equal(bundle.presets[1].settings.side.enemy.barColorLow, '#ABCDEF', 'B keeps what it had when SAVE NEW was pressed');
});

