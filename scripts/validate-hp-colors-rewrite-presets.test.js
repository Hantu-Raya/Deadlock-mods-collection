'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  installTopBarIdentityTree,
  runInVm,
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
const MENU_STATE_ATTR = 'hp_colors_rewrite_menu_state';
const CONFIG_ATTR = 'hp_colors_rewrite_config';
const PRESET_PANEL_IDS = [
  'HPColorsPresetNameInput',
  'HPColorsPresetSaveButton',
  'HPColorsPresetOptions',
  'HPColorsPresetFeedback',
];

function installLayoutPanels(harness) {
  const ids = new Set([
    ...Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
    ...PRESET_PANEL_IDS,
  ]);
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
    }));
  }
}

function bootPresetMenu(menuState, options = {}) {
  const harness = createPanoramaHarness();
  installLayoutPanels(harness);
  const topBar = installTopBarIdentityTree(harness, {
    heroName: options.heroName === undefined ? 'SHIV' : options.heroName,
    gameTime: options.gameTime === undefined ? '00:01' : options.gameTime,
  });
  harness.root.SetAttributeString(MENU_STATE_ATTR, JSON.stringify(menuState));
  if (options.publishedSnapshot !== undefined) {
    harness.root.SetAttributeString(
      CONFIG_ATTR,
      JSON.stringify(options.publishedSnapshot),
    );
  }
  runInVm(menuSource, createVmContext(harness), 'hp_colors_menu.js');
  harness.$.HPColorsMenuBoot();
  return { harness, topBar };
}

function runIdentityTick(fixture) {
  const jobs = fixture.harness.scheduler.jobs;
  let selectedIndex = -1;
  for (let index = 0; index < jobs.length; index += 1) {
    if (!jobs[index].fn || jobs[index].fn.name !== 'identityTick') continue;
    if (
      selectedIndex < 0 ||
      jobs[index].due < jobs[selectedIndex].due ||
      (jobs[index].due === jobs[selectedIndex].due &&
        jobs[index].order < jobs[selectedIndex].order)
    ) selectedIndex = index;
  }
  assert.notEqual(selectedIndex, -1, 'expected identityTick callback');
  const job = jobs.splice(selectedIndex, 1)[0];
  fixture.harness.now = Math.max(fixture.harness.now, Number(job.due) || 0);
  job.fn();
}

function settleActiveHero(fixture) {
  runIdentityTick(fixture);
  runIdentityTick(fixture);
  runIdentityTick(fixture);
}

function openEditor(fixture) {
  const button = fixture.harness.root.FindChildTraverse('HPColorsMenuButton');
  assert.equal(typeof button.events.onactivate, 'function');
  button.events.onactivate();
}

function panel(fixture, id) {
  const found = fixture.harness.root.FindChildTraverse(id);
  assert.ok(found, `expected ${id} panel`);
  return found;
}

function readMenuState(fixture) {
  return JSON.parse(
    fixture.harness.root.GetAttributeString(MENU_STATE_ATTR, '{}'),
  );
}

function readConfig(fixture) {
  return JSON.parse(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, '{}'),
  );
}

function configDispatches(fixture) {
  return fixture.harness.dispatches.filter(
    (args) => args[0] === 'ClientUI_FireOutput',
  );
}

function presetRows(fixture) {
  const rows = [];
  const options = panel(fixture, 'HPColorsPresetOptions');
  function visit(current) {
    if (!current || !current.IsValid()) return;
    const id = current.GetAttributeString('hp_colors_preset_id', '');
    if (id) rows.push(current);
    for (const child of current.Children()) visit(child);
  }
  visit(options);
  return rows;
}

function presetRow(fixture, id) {
  const row = presetRows(fixture).find(
    (candidate) => candidate.GetAttributeString('hp_colors_preset_id', '') === id,
  );
  assert.ok(row, `expected preset row ${id}`);
  assert.equal(typeof row.events.onactivate, 'function');
  return row;
}

function savePreset(fixture, name) {
  panel(fixture, 'HPColorsPresetNameInput').text = name;
  panel(fixture, 'HPColorsPresetSaveButton').events.onactivate();
}

function assertRecordShape(record, expected) {
  assert.deepEqual(Object.keys(record).sort(), [
    'heroes',
    'id',
    'kind',
    'mode',
    'name',
    'values',
  ]);
  assert.equal(record.id, expected.id);
  assert.equal(record.kind, 'user');
  assert.equal(record.name, expected.name);
  assert.equal(record.mode, expected.mode);
  assert.deepEqual(record.heroes, expected.heroes);
}

test('baked preset rows precede restored session users in the DOM', () => {
  const restoredUsers = [
    {
      id: 'user_0001',
      kind: 'user',
      name: 'Saved Base',
      values: { enemyLow: '#222222' },
      mode: 'off',
      heroes: [],
    },
    {
      id: 'user_0002',
      kind: 'user',
      name: 'Saved Haze',
      values: { enemyLow: '#333333' },
      mode: 'selected',
      heroes: ['hero_haze'],
    },
  ];
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: restoredUsers,
    pendingPresetId: 'user_0002',
  });

  openEditor(fixture);

  assert.deepEqual(
    presetRows(fixture).map((row) =>
      row.GetAttributeString('hp_colors_preset_id', '')),
    ['baked_default', 'user_0001', 'user_0002'],
  );
  const restoredState = readMenuState(fixture);
  assert.equal(restoredState.userPresets.length, 2);
  assertRecordShape(restoredState.userPresets[0], {
    id: 'user_0001',
    name: 'Saved Base',
    mode: 'off',
    heroes: [],
  });
  assertRecordShape(restoredState.userPresets[1], {
    id: 'user_0002',
    name: 'Saved Haze',
    mode: 'selected',
    heroes: ['hero_haze'],
  });
  assert.equal(restoredState.userPresets[0].values.enemyLow, '#222222');
  assert.equal(restoredState.userPresets[1].values.enemyLow, '#333333');
  assert.equal(restoredState.pendingPresetId, 'user_0002');
});

test('Save captures current editor values and scope metadata without publishing config', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: {
      enemyLow: '#111111',
      enemyVisible: true,
      widthScale: 100,
    },
    scopes: [{
      id: 'scope_current',
      mode: 'selected',
      heroes: ['hero_haze'],
      values: {
        enemyLow: '#22AA44',
        enemyVisible: false,
        widthScale: 100,
      },
    }],
    userPresets: [],
    pendingPresetId: null,
  }, { heroName: 'Haze' });
  openEditor(fixture);
  settleActiveHero(fixture);

  const beforeSaveConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  const beforeSaveDispatches = configDispatches(fixture).length;
  savePreset(fixture, 'Scoped Capture');

  let state = readMenuState(fixture);
  assert.equal(configDispatches(fixture).length, beforeSaveDispatches);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeSaveConfig,
  );
  assert.equal(state.userPresets.length, 1);
  assertRecordShape(state.userPresets[0], {
    id: 'user_0001',
    name: 'Scoped Capture',
    mode: 'selected',
    heroes: ['hero_haze'],
  });
  assert.equal(state.userPresets[0].values.enemyLow, '#111111');
  assert.equal(state.userPresets[0].values.enemyVisible, true);
  assert.equal(state.userPresets[0].values.widthScale, 100);

  panel(fixture, 'HPColorsWidthEntry').text = '131';
  panel(fixture, 'HPColorsWidthEntry').events.ontextentrysubmit();
  fixture.harness.dispatches.length = 0;
  savePreset(fixture, 'Second Capture');

  state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0001', 'user_0002'],
  );
  assert.equal(state.userPresets[0].values.enemyLow, '#111111');
  assert.equal(state.userPresets[0].values.widthScale, 100);
  assert.equal(state.userPresets[1].values.enemyLow, '#111111');
  assert.equal(state.userPresets[1].values.widthScale, 131);
  assert.equal(configDispatches(fixture).length, 0);
});

test('Off replaces the global base while All preserves it and replaces Current scope', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111', enemyVisible: true },
    scopes: [{
      id: 'scope_current',
      mode: 'selected',
      heroes: ['hero_haze'],
      values: { enemyLow: '#222222', enemyVisible: false },
    }],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Global Override',
        values: { enemyLow: '#AA0000', enemyVisible: false },
        mode: 'off',
        heroes: [],
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'All Override',
        values: { enemyLow: '#00AA00', enemyVisible: true },
        mode: 'all',
        heroes: [],
      },
    ],
    pendingPresetId: null,
  }, { heroName: 'Haze' });
  openEditor(fixture);
  settleActiveHero(fixture);

  fixture.harness.dispatches.length = 0;
  presetRow(fixture, 'user_0001').events.onactivate();
  let state = readMenuState(fixture);
  assert.equal(state.values.enemyLow, '#AA0000');
  assert.equal(state.values.enemyVisible, false);
  const offScope = state.scopes.find((scope) => scope.id === 'scope_current');
  assert.ok(!offScope || offScope.mode === 'off');
  assert.equal(readConfig(fixture).values.enemyLow, '#AA0000');
  assert.equal(configDispatches(fixture).length, 1);

  fixture.harness.dispatches.length = 0;
  presetRow(fixture, 'user_0002').events.onactivate();
  state = readMenuState(fixture);
  assert.equal(state.values.enemyLow, '#AA0000');
  assert.equal(state.values.enemyVisible, false);
  const allScope = state.scopes.find((scope) => scope.id === 'scope_current');
  assert.ok(allScope);
  assert.equal(allScope.mode, 'all');
  assert.equal(allScope.heroes.length, 0);
  assert.equal(allScope.values.enemyLow, '#00AA00');
  assert.equal(readConfig(fixture).values.enemyLow, '#00AA00');
  assert.equal(configDispatches(fixture).length, 1);
});

test('Selected preset waits for unknown identity, applies once after a match, and keeps global base', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Haze Only',
      values: { enemyLow: '#22AA44' },
      mode: 'selected',
      heroes: ['hero_haze'],
    }],
    pendingPresetId: null,
  }, { heroName: '' });
  openEditor(fixture);

  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;
  presetRow(fixture, 'user_0001').events.onactivate();
  let state = readMenuState(fixture);
  assert.equal(state.pendingPresetId, 'user_0001');
  assert.equal(state.values.enemyLow, '#111111');
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
  assert.match(panel(fixture, 'HPColorsPresetFeedback').text, /WAIT/i);

  fixture.topBar.setHeroName('Haze');
  settleActiveHero(fixture);
  state = readMenuState(fixture);
  assert.equal(state.pendingPresetId, null);
  assert.equal(state.values.enemyLow, '#111111');
  const selectedScope = state.scopes.find((scope) => scope.id === 'scope_current');
  assert.ok(selectedScope);
  assert.equal(selectedScope.mode, 'selected');
  assert.deepEqual(selectedScope.heroes, ['hero_haze']);
  assert.equal(selectedScope.values.enemyLow, '#22AA44');
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
  assert.equal(configDispatches(fixture).length, 1);
  assert.match(panel(fixture, 'HPColorsPresetFeedback').text, /APPL|MATCH/i);

  fixture.harness.dispatches.length = 0;
  runIdentityTick(fixture);
  assert.equal(configDispatches(fixture).length, 0);
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
});

test('Selected preset rejects a settled hero mismatch without mutation or publication', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Haze Only',
      values: { enemyLow: '#22AA44' },
      mode: 'selected',
      heroes: ['hero_haze'],
    }],
    pendingPresetId: null,
  }, { heroName: '' });
  openEditor(fixture);
  const beforeState = readMenuState(fixture);
  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;

  presetRow(fixture, 'user_0001').events.onactivate();
  fixture.topBar.setHeroName('Shiv');
  settleActiveHero(fixture);

  const afterState = readMenuState(fixture);
  assert.equal(afterState.pendingPresetId, null);
  assert.equal(afterState.values.enemyLow, beforeState.values.enemyLow);
  assert.equal(
    afterState.scopes.some((scope) => scope.id === 'scope_current'),
    false,
  );
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
  assert.match(panel(fixture, 'HPColorsPresetFeedback').text, /MATCH|REJECT/i);
});

test('Applying an identical effective preset does not publish or leak preset metadata', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Same All',
      values: { enemyLow: '#111111' },
      mode: 'all',
      heroes: [],
    }],
    pendingPresetId: null,
  });
  openEditor(fixture);
  const before = readConfig(fixture);
  const beforeRaw = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;

  presetRow(fixture, 'user_0001').events.onactivate();

  const after = readConfig(fixture);
  assert.equal(configDispatches(fixture).length, 0);
  assert.equal(after.revision, before.revision);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeRaw,
  );
  assert.equal(after.values.enemyLow, '#111111');
  for (const key of [
    'id',
    'kind',
    'name',
    'mode',
    'heroes',
    'userPresets',
    'pendingPresetId',
    'preset',
  ]) assert.equal(Object.prototype.hasOwnProperty.call(after, key), false, key);
});

test('a manual settings edit cancels a waiting Selected preset', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111', enemyVisible: true },
    scopes: [],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Haze Only',
      values: { enemyLow: '#22AA44', enemyVisible: true },
      mode: 'selected',
      heroes: ['hero_haze'],
    }],
    pendingPresetId: null,
  }, { heroName: '' });
  openEditor(fixture);

  presetRow(fixture, 'user_0001').events.onactivate();
  assert.equal(readMenuState(fixture).pendingPresetId, 'user_0001');

  panel(fixture, 'HPColorsEnemyVisibleToggle').events.onactivate();
  assert.equal(readMenuState(fixture).pendingPresetId, null);

  fixture.harness.dispatches.length = 0;
  fixture.topBar.setHeroName('Haze');
  settleActiveHero(fixture);

  const state = readMenuState(fixture);
  assert.equal(state.values.enemyVisible, false);
  assert.equal(
    state.scopes.some((scope) => scope.id === 'scope_current'),
    false,
  );
  assert.equal(configDispatches(fixture).length, 0);
});

test('a saved Shiv preset replaces a stale matching scope on return to Shiv', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#22AA44' },
    scopes: [{
      id: 'scope_current',
      mode: 'selected',
      heroes: ['hero_shiv'],
      values: { enemyLow: '#00FF00' },
    }],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Shiv Session',
      values: { enemyLow: '#22AA44' },
      mode: 'selected',
      heroes: ['hero_shiv'],
    }],
    pendingPresetId: null,
  }, { heroName: 'Shiv' });
  openEditor(fixture);
  fixture.harness.dispatches.length = 0;
  settleActiveHero(fixture);

  const state = readMenuState(fixture);
  const selectedScope = state.scopes.find(
    (scope) => scope.id === 'scope_current',
  );
  assert.ok(selectedScope);
  assert.equal(selectedScope.mode, 'selected');
  assert.deepEqual(selectedScope.heroes, ['hero_shiv']);
  assert.equal(selectedScope.values.enemyLow, '#22AA44');
  assert.equal(state.values.enemyLow, '#22AA44');
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
  assert.equal(configDispatches(fixture).length, 0);
});

test('a canceled wait suppresses only the next settled identity transition', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111', enemyVisible: true },
    scopes: [],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Shiv Session',
      values: { enemyLow: '#22AA44', enemyVisible: true },
      mode: 'selected',
      heroes: ['hero_shiv'],
    }],
    pendingPresetId: null,
  }, { heroName: '' });
  openEditor(fixture);

  presetRow(fixture, 'user_0001').events.onactivate();
  panel(fixture, 'HPColorsEnemyVisibleToggle').events.onactivate();

  fixture.topBar.setHeroName('Haze');
  settleActiveHero(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#111111');

  fixture.harness.dispatches.length = 0;
  fixture.topBar.setHeroName('Shiv');
  runIdentityTick(fixture);
  runIdentityTick(fixture);

  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
  assert.equal(configDispatches(fixture).length, 1);
});

test('leaving Shiv restores the saved All Heroes fallback automatically', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [{
      id: 'scope_current',
      mode: 'selected',
      heroes: ['hero_shiv'],
      values: { enemyLow: '#22AA44' },
    }],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'All Heroes',
        values: { enemyLow: '#334455' },
        mode: 'all',
        heroes: [],
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'Shiv Session',
        values: { enemyLow: '#22AA44' },
        mode: 'selected',
        heroes: ['hero_shiv'],
      },
    ],
    pendingPresetId: null,
  }, { heroName: 'Shiv' });
  openEditor(fixture);
  settleActiveHero(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');

  fixture.harness.dispatches.length = 0;
  fixture.topBar.setHeroName('Haze');
  runIdentityTick(fixture);
  runIdentityTick(fixture);

  const state = readMenuState(fixture);
  const current = state.scopes.find(
    (scope) => scope.id === 'scope_current',
  );
  assert.ok(current);
  assert.equal(current.mode, 'all');
  assert.equal(current.values.enemyLow, '#334455');
  assert.equal(state.values.enemyLow, '#111111');
  assert.equal(readConfig(fixture).values.enemyLow, '#334455');
  assert.equal(configDispatches(fixture).length, 1);
});

test('leaving the only Selected preset restores baked defaults automatically', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyHigh: '#FF66CC' },
    scopes: [{
      id: 'scope_current',
      mode: 'selected',
      heroes: ['hero_shiv'],
      values: { enemyHigh: '#FF66CC' },
    }],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Shiv Pink',
      values: { enemyHigh: '#FF66CC' },
      mode: 'selected',
      heroes: ['hero_shiv'],
    }],
    pendingPresetId: null,
  }, { heroName: 'Shiv' });
  openEditor(fixture);
  settleActiveHero(fixture);
  assert.equal(readConfig(fixture).values.enemyHigh, '#FF66CC');

  fixture.harness.dispatches.length = 0;
  fixture.topBar.setHeroName('Haze');
  runIdentityTick(fixture);
  runIdentityTick(fixture);

  const state = readMenuState(fixture);
  assert.equal(state.values.enemyHigh, '#00FF00');
  assert.equal(
    state.scopes.some((scope) => scope.id === 'scope_current'),
    false,
  );
  assert.equal(readConfig(fixture).values.enemyHigh, '#00FF00');
  assert.equal(configDispatches(fixture).length, 1);
});
