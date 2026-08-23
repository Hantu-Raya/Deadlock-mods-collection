'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  MockPanel,
  createPanoramaHarness,
  installTopBarIdentityTree,
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
const MENU_STATE_ATTR = 'hp_colors_rewrite_menu_state';
const CONFIG_ATTR = 'hp_colors_rewrite_config';
const PRESET_PANEL_IDS = [
  'HPColorsPresetNameInput',
  'HPColorsPresetSaveButton',
  'HPColorsPresetSaveMode',
  'HPColorsPresetNewButton',
  'HPColorsPresetOptions',
  'HPColorsPresetFeedback',
  'HPColorsPresetRestoreBakedButton',
  'HPColorsPresetCopyAllButton',
  'HPColorsPresetImportButton',
  'HPColorsPresetTransferDialog',
  'HPColorsPresetTransferInput',
  'HPColorsPresetTransferFeedback',
  'HPColorsPresetTransferConfirmButton',
  'HPColorsPresetTransferCloseButton',
];

function installLayoutPanels(harness, storeLabelText = '') {
  const ids = new Set([
    ...Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
    ...PRESET_PANEL_IDS,
  ]);
  ids.delete('HPColorsRewritePresetStore');
  ids.delete('HPColorsRewritePreset_001');
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
    }));
  }
  const store = new MockPanel('HPColorsRewritePresetStore', {
    classes: ['hp_colors_rewrite_preset_store'],
    hittest: false,
    hittestchildren: false,
    attributes: {
      hp_colors_rewrite_preset_contract: 'HPCRP1',
      hp_colors_rewrite_preset_version: '1',
    },
    findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts,
  });
  store.add(new MockPanel('HPColorsRewritePreset_001', {
    type: 'Label',
    classes: ['hp_colors_rewrite_preset_entry'],
    text: String(storeLabelText || ''),
    findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts,
  }));
  harness.root.add(store);
}

function encodeStoreText(value) {
  const text = String(value || '');
  const codeUnits = [];
  for (let index = 0; index < text.length; index += 1)
    codeUnits.push(text.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0'));
  return codeUnits.join('');
}

function bootPresetMenu(menuState, options = {}) {
  const harness = createPanoramaHarness();
  installLayoutPanels(harness, options.storeLabelText);
  const topBar = installTopBarIdentityTree(harness, {
    heroName: options.heroName === undefined ? 'SHIV' : options.heroName,
    gameTime: options.gameTime === undefined ? '00:01' : options.gameTime,
  });
  if (menuState !== undefined) {
    harness.root.SetAttributeString(
      MENU_STATE_ATTR,
      typeof menuState === 'string' ? menuState : JSON.stringify(menuState),
    );
  }
  if (options.publishedSnapshot !== undefined) {
    harness.root.SetAttributeString(
      CONFIG_ATTR,
      JSON.stringify(options.publishedSnapshot),
    );
  }
  runHpColorsSourcesInVm(stateSource, menuSource, harness);
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
  assert.equal(
    typeof button.events.onactivate,
    'function',
    `menu button unbound: ${fixture.harness.logs.join(' | ')}`,
  );
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
  return row;
}
function childWithClass(root, className) {
  if (!root || !root.IsValid()) return null;
  if (root.BHasClass(className)) return root;
  for (const child of root.Children()) {
    const found = childWithClass(child, className);
    if (found) return found;
  }
  return null;
}

function presetRowControl(fixture, id, className) {
  const control = childWithClass(presetRow(fixture, id), className);
  assert.ok(control, `expected ${className} for preset ${id}`);
  assert.equal(typeof control.events.onactivate, 'function');
  return control;
}


function savePreset(fixture, name) {
  if (!panel(fixture, 'HPColorsPresetForm').BHasClass('Active'))
    panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  panel(fixture, 'HPColorsPresetNameInput').text = name;
  panel(fixture, 'HPColorsPresetSaveButton').events.onactivate();
}

function selectPreset(fixture, id) {
  const row = presetRow(fixture, id);
  assert.equal(typeof row.events.onactivate, 'function');
  row.events.onactivate();
}

function applyPreset(fixture, id) {
  presetRowControl(fixture, id, 'HPColorsPresetRowApply').events.onactivate();
}

function renameSelectedPreset(fixture, name) {
  const id = readMenuState(fixture).selectedPresetId;
  const rowName = childWithClass(
    presetRow(fixture, id),
    'HPColorsPresetOptionName',
  );
  assert.equal(typeof rowName.events.onactivate, 'function');
  rowName.events.onactivate();
  const input = childWithClass(
    presetRow(fixture, id),
    'HPColorsPresetOptionName',
  );
  assert.ok(input.BHasClass('Editing'));
  input.text = name;
  assert.equal(typeof input.events.ontextentrysubmit, 'function');
  input.events.ontextentrysubmit();
}

function deleteOrHideSelectedPreset(fixture) {
  const id = readMenuState(fixture).selectedPresetId;
  presetRowControl(fixture, id, 'HPColorsPresetRowDelete').events.onactivate();
  presetRowControl(fixture, id, 'HPColorsPresetRowConfirm').events.onactivate();
}

function decodePresetTransfer(code) {
  assert.equal(String(code).slice(0, 6), 'HPCRP1');
  return JSON.parse(String(code).slice(6));
}
const REWRITE_PRESET_CODE = 'HPCRP1' + JSON.stringify({
  records: [
    {
      id: 'baked_default',
      kind: 'baked',
      name: 'Rewrite Default ✨',
      mode: 'off',
      heroes: [],
      values: [],
      conditions: null,
    },
    {
      id: 'user_0007',
      kind: 'user',
      name: 'Builder Shiv Ω',
      mode: 'selected',
      heroes: ['hero_shiv'],
      values: [[8, '#112233']],
      conditions: {
        enemyLow: { slot: 2, minTier: 3, value: '#445566' },
      },
    },
  ],
  hiddenBakedPresetIds: [],
  selectedPresetId: 'user_0007',
});

function importPresetTransfer(fixture, code) {
  panel(fixture, 'HPColorsPresetImportButton').events.onactivate();
  panel(fixture, 'HPColorsPresetTransferInput').text = code;
  panel(fixture, 'HPColorsPresetTransferConfirmButton').events.onactivate();
}

function assertRecordShape(record, expected) {
  assert.deepEqual(Object.keys(record).sort(), [
    'conditions',
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

test('Preset Library explains packaging, routing, priority, and actions', () => {
  for (const copy of [
    'Presets created or changed here last until Deadlock closes.',
    'Presets packaged with the V2 web builder return after restart.',
    'One preset VPK can contain both All Heroes and Selected Heroes presets.',
    'HOW PRESETS ARE CHOSEN',
    'HERO-SPECIFIC FIRST  ·  OTHERWISE ALL HEROES',
    'If two presets cover the same hero, the higher one in the list wins.',
    'Selected Heroes overrides All Heroes for the heroes you choose.',
    'Saves the current menu settings as a new library record.',
    'Loads the saved preset now. It does not edit the preset.',
    'Replaces the selected preset with the current menu settings, then loads it.',
  ]) {
    assert.match(layoutSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(layoutSource, /id="HPColorsPresetBuilderLink"/);
  assert.match(layoutSource, /ExternalBrowserGoToURL/);
  assert.doesNotMatch(layoutSource, /SteamOverlayOpenURL/);
  assert.match(
    layoutSource,
    /https:\/\/hantu-raya\.github\.io\/hp-colors-preset-builder\/v2\//,
  );
  assert.match(layoutSource, /id="HPColorsDonateButton"/);
  assert.match(layoutSource, /https:\/\/ko-fi\.com\/hantuaraya/);
  assert.match(
    layoutSource,
    /<CitadelHTMLPanel id="HPColorsSupporterTicker"[^>]*hittest="false"[^>]*acceptsfocus="false"/,
  );
  assert.match(layoutSource, /id="HPColorsPresetInfoToggle"/);
  assert.match(layoutSource, /id="HPColorsPresetGuide"/);
});

test('supporter ticker loads once per editor open and unloads on close', () => {
  const fixture = bootPresetMenu();
  const ticker = panel(fixture, 'HPColorsSupporterTicker');
  const urls = [];
  const ignoreCursorValues = [];
  ticker.SetURL = (url) => urls.push(url);
  ticker.SetIgnoreCursor = (value) => ignoreCursorValues.push(value);

  openEditor(fixture);
  openEditor(fixture);
  assert.deepEqual(urls, [
    'https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/',
  ]);
  assert.deepEqual(ignoreCursorValues, [true]);
  assert.equal(ticker.BHasClass('Open'), true);

  fixture.harness.$.HPColorsMenuCancel();
  assert.deepEqual(urls, [
    'https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/',
    'about:blank',
  ]);
  assert.equal(ticker.BHasClass('Open'), false);

  openEditor(fixture);
  assert.deepEqual(urls, [
    'https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/',
    'about:blank',
    'https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/',
  ]);
});

test('supporter ticker API failure does not block the editor lifecycle', () => {
  const fixture = bootPresetMenu();
  const ticker = panel(fixture, 'HPColorsSupporterTicker');
  ticker.SetURL = () => {
    throw new Error('HTML surface unavailable');
  };

  openEditor(fixture);
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), true);
  assert.equal(ticker.BHasClass('Open'), false);

  fixture.harness.$.HPColorsMenuCancel();
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), false);
});

test('installed XML HPCRP1 preset applies on cold boot before any lifecycle transition', () => {
  const fixture = bootPresetMenu(undefined, {
    storeLabelText: encodeStoreText(REWRITE_PRESET_CODE),
    publishedSnapshot: {
      version: 1,
      revision: 7,
      values: { enemyLow: '#ABCDEF' },
    },
  });
  const seeded = readMenuState(fixture);
  assert.deepEqual(seeded.userPresets.map((preset) => preset.id), ['user_0007']);
  assert.equal(seeded.userPresets[0].name, 'Builder Shiv Ω');
  assert.equal(seeded.userPresets[0].values.enemyLow, '#112233');
  assert.deepEqual(seeded.userPresets[0].conditions, {
    enemyLow: { slot: 2, minTier: 3, value: '#445566' },
  });
  const current = seeded.scopes.find((scope) => scope.id === 'scope_current');
  assert.ok(current);
  assert.equal(current.mode, 'selected');
  assert.deepEqual(current.heroes, ['hero_shiv']);
  assert.equal(current.values.enemyLow, '#112233');
  assert.equal(current.sourcePresetId, 'user_0007');
  assert.deepEqual(current.conditions, {
    enemyLow: { slot: 2, minTier: 3, value: '#445566' },
  });
  assert.deepEqual(seeded.conditions, {});
  assert.equal(seeded.values.enemyLow, '#E16161');
  assert.equal(seeded.selectedPresetId, 'user_0007');
  assert.equal(seeded.nextUserPresetNumber, 8);
  assert.deepEqual(seeded.bakedPresetNameOverrides, {});
  assert.deepEqual(seeded.hiddenBakedPresetIds, []);
  assert.equal(readConfig(fixture).values.enemyLow, '#112233');
  assert.equal(configDispatches(fixture).length, 1);
});

test('builder preset remains immutable while Current setting edits publish live', () => {
  const fixture = bootPresetMenu(undefined, {
    storeLabelText: encodeStoreText(REWRITE_PRESET_CODE),
  });
  openEditor(fixture);
  settleActiveHero(fixture);

  let state = readMenuState(fixture);
  const originalPresetVisible = state.userPresets[0].values.enemyVisible;
  assert.equal(
    state.scopes.find((scope) => scope.id === 'scope_current').values.enemyVisible,
    true,
  );
  fixture.harness.dispatches.length = 0;

  panel(fixture, 'HPColorsEnemyVisibleToggle').events.onactivate();

  state = readMenuState(fixture);
  assert.equal(state.values.enemyVisible, true);
  assert.equal(
    state.scopes.find((scope) => scope.id === 'scope_current').values.enemyVisible,
    false,
  );
  assert.equal(state.userPresets[0].values.enemyVisible, originalPresetVisible);
  assert.equal(readConfig(fixture).values.enemyVisible, false);
  assert.equal(configDispatches(fixture).length, 1);

  fixture.harness.dispatches.length = 0;
  const widthSlider = panel(fixture, 'HPColorsWidthSlider');
  widthSlider.events.onmousedown();
  widthSlider.value = 131;
  widthSlider.events.onvaluechanged();
  widthSlider.events.onmouseup();

  state = readMenuState(fixture);
  assert.equal(state.values.widthScale, 100);

  assert.equal(
    state.scopes.find((scope) => scope.id === 'scope_current').values.widthScale,
    131,
  );
  assert.equal(state.userPresets[0].values.widthScale, 100);
  assert.equal(readConfig(fixture).values.widthScale, 131);
  assert.equal(configDispatches(fixture).length, 1);
});

test('same preset route preserves Current edits across hideout and testing transitions', () => {
  const fixture = bootPresetMenu(undefined, {
    storeLabelText: encodeStoreText(REWRITE_PRESET_CODE),
    heroName: 'Shiv',
    gameTime: '',
  });
  openEditor(fixture);
  fixture.topBar.hud.AddClass('GameStatePreGame');
  runIdentityTick(fixture);
  assert.equal(
    readMenuState(fixture).scopes.find((scope) => scope.id === 'scope_current')
      .sourcePresetId,
    'user_0007',
  );

  panel(fixture, 'HPColorsWidthEntry').text = '131';
  panel(fixture, 'HPColorsWidthEntry').events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.widthScale, 131);

  fixture.harness.dispatches.length = 0;
  fixture.topBar.hud.RemoveClass('GameStatePreGame');
  fixture.topBar.setGameTime('00:01');
  settleActiveHero(fixture);
  assert.equal(readConfig(fixture).values.widthScale, 131);
  assert.equal(configDispatches(fixture).length, 0);

  panel(fixture, 'HPColorsWidthEntry').text = '142';
  panel(fixture, 'HPColorsWidthEntry').events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.widthScale, 142);

  fixture.harness.dispatches.length = 0;
  fixture.topBar.hud.AddClass('GameStatePreGame');
  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.widthScale, 142);

  fixture.topBar.hud.RemoveClass('GameStatePreGame');
  fixture.topBar.setGameTime('00:02');
  settleActiveHero(fixture);
  assert.equal(readConfig(fixture).values.widthScale, 142);
  assert.equal(configDispatches(fixture).length, 0);
  assert.equal(
    readMenuState(fixture).scopes.find((scope) => scope.id === 'scope_current')
      .sourcePresetId,
    'user_0007',
  );
});

test('XML HPCRP1 first boot preserves builder-hidden baked presets', () => {
  const builderCode = 'HPCRP1' + JSON.stringify({
    records: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'All Heroes',
        mode: 'all',
        heroes: [],
        values: [],
        conditions: null,
      },
    ],
    hiddenBakedPresetIds: ['baked_default'],
    selectedPresetId: 'user_0001',
  });
  const fixture = bootPresetMenu(undefined, {
    storeLabelText: encodeStoreText(builderCode),
  });
  const seeded = readMenuState(fixture);
  assert.deepEqual(seeded.hiddenBakedPresetIds, ['baked_default']);
  openEditor(fixture);
  assert.deepEqual(
    presetRows(fixture).map((row) =>
      row.GetAttributeString('hp_colors_preset_id', ''),
    ),
    ['user_0001'],
  );
});

test('malformed XML store hex fails closed and logs one transition', () => {
  const fixture = bootPresetMenu(undefined, { storeLabelText: '00GG' });
  const state = readMenuState(fixture);
  assert.deepEqual(state.userPresets, []);
  assert.equal(state.selectedPresetId, null);
  assert.equal(state.nextUserPresetNumber, 1);
  assert.equal(state.values.enemyLow, '#E16161');
  assert.deepEqual(state.conditions, {});
  assert.equal(
    fixture.harness.logs.filter((message) => message.includes('preset store unavailable')).length,
    1,
  );
});

test('empty XML store leaves normal defaults without a boot warning', () => {
  const fixture = bootPresetMenu(undefined, { storeLabelText: '' });
  const state = readMenuState(fixture);
  assert.deepEqual(state.userPresets, []);
  assert.equal(state.selectedPresetId, null);
  assert.equal(state.values.enemyLow, '#E16161');
  assert.equal(fixture.harness.logs.filter((message) => message.includes('preset store unavailable')).length, 0);
});

test('valid existing menu session wins over XML HPCRP1 seed data', () => {
  const existing = {
    version: 1,
    values: { enemyLow: '#010203' },
    conditions: {},
    scopes: [],
    userPresets: [{
      id: 'user_0002',
      kind: 'user',
      name: 'Existing Session',
      values: { enemyLow: '#010203' },
      mode: 'all',
      heroes: [],
      conditions: null,
    }],
    pendingPresetId: null,
    selectedPresetId: 'user_0002',
    nextUserPresetNumber: 3,
    bakedPresetNameOverrides: {},
    hiddenBakedPresetIds: [],
  };
  const fixture = bootPresetMenu(existing, {
    storeLabelText: encodeStoreText(REWRITE_PRESET_CODE),
    publishedSnapshot: {
      version: 1,
      revision: 2,
      values: { enemyLow: '#010203' },
    },
  });
  const state = readMenuState(fixture);
  assert.deepEqual(state.userPresets.map((preset) => preset.id), ['user_0002']);
  assert.equal(state.selectedPresetId, 'user_0002');
  assert.equal(state.nextUserPresetNumber, 3);
  assert.equal(state.values.enemyLow, '#010203');
  assert.deepEqual(state.bakedPresetNameOverrides, {});
  assert.deepEqual(state.hiddenBakedPresetIds, []);
});

test('XML-seeded presets return on a later boot without session state', () => {
  const storeLabelText = encodeStoreText(REWRITE_PRESET_CODE);
  const first = bootPresetMenu(undefined, { storeLabelText });
  const second = bootPresetMenu(undefined, { storeLabelText });
  const firstState = readMenuState(first);
  const secondState = readMenuState(second);
  assert.deepEqual(secondState.userPresets, firstState.userPresets);
  assert.equal(secondState.selectedPresetId, 'user_0007');
  assert.equal(secondState.nextUserPresetNumber, 8);
});

test('legacy user Global records migrate to All Heroes without applying', () => {
  const restoredUsers = [
    {
      id: 'user_0001',
      kind: 'user',
      name: 'Legacy Global',
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
  const beforeOpenConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  const beforeOpenDispatches = configDispatches(fixture).length;

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
    name: 'Legacy Global',
    mode: 'all',
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
  assert.equal(
    Object.prototype.hasOwnProperty.call(restoredState, 'pendingPresetId'),
    false,
  );
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeOpenConfig,
  );
  assert.equal(configDispatches(fixture).length, beforeOpenDispatches);
});

test('Save captures Current working values and scope metadata without publishing config', () => {
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
  assert.deepEqual(state.hiddenBakedPresetIds, []);
  assert.equal(state.userPresets[0].values.enemyLow, '#22AA44');
  assert.equal(state.userPresets[0].values.enemyVisible, false);
  assert.equal(state.userPresets[0].values.widthScale, 100);

  panel(fixture, 'HPColorsWidthEntry').text = '131';
  panel(fixture, 'HPColorsWidthEntry').events.ontextentrysubmit();
  fixture.harness.dispatches.length = 0;
  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  savePreset(fixture, 'Second Capture');

  state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0001', 'user_0002'],
  );
  assert.equal(state.userPresets[0].values.enemyLow, '#22AA44');
  assert.equal(state.userPresets[0].values.widthScale, 100);
  assert.equal(state.userPresets[1].values.enemyLow, '#22AA44');
  assert.equal(state.userPresets[1].values.widthScale, 131);
  assert.equal(configDispatches(fixture).length, 0);
});

test('legacy user Global applies as All Heroes while preserving the hidden base', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111', enemyVisible: true },
    scopes: [{
      id: 'scope_current',
      mode: 'selected',
      heroes: ['hero_haze'],
      values: { enemyLow: '#222222', enemyVisible: false },
    }],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Legacy Global',
      values: { enemyLow: '#AA0000', enemyVisible: false },
      mode: 'off',
      heroes: [],
    }],
    pendingPresetId: null,
  }, { heroName: 'Haze' });
  openEditor(fixture);
  settleActiveHero(fixture);

  let state = readMenuState(fixture);
  assert.equal(state.userPresets[0].mode, 'all');
  assert.equal(state.values.enemyLow, '#111111');
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
  fixture.harness.dispatches.length = 0;

  applyPreset(fixture, 'user_0001');
  state = readMenuState(fixture);
  assert.equal(state.values.enemyLow, '#111111');
  assert.equal(state.values.enemyVisible, true);
  const allScope = state.scopes.find((scope) => scope.id === 'scope_current');
  assert.ok(allScope);
  assert.equal(allScope.mode, 'all');
  assert.deepEqual(allScope.heroes, []);
  assert.equal(allScope.values.enemyLow, '#AA0000');
  assert.equal(readConfig(fixture).values.enemyLow, '#AA0000');
  assert.equal(configDispatches(fixture).length, 1);
});

test('Selected preset Apply publishes immediately while identity is unresolved', () => {
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
  fixture.harness.dispatches.length = 0;

  applyPreset(fixture, 'user_0001');

  const state = readMenuState(fixture);
  const current = state.scopes.find((scope) => scope.id === 'scope_current');
  assert.ok(current);
  assert.equal(current.mode, 'selected');
  assert.deepEqual(current.heroes, ['hero_haze']);
  assert.equal(current.values.enemyLow, '#22AA44');
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
  assert.equal(configDispatches(fixture).length, 1);
  assert.match(panel(fixture, 'HPColorsPresetFeedback').text, /APPLIED/i);
});


test('Selected preset Apply is immediate before automatic routing settles', () => {
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
  }, { heroName: '' });
  openEditor(fixture);
  fixture.harness.dispatches.length = 0;

  applyPreset(fixture, 'user_0001');
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
  assert.equal(configDispatches(fixture).length, 1);

  fixture.harness.dispatches.length = 0;
  fixture.topBar.setHeroName('Shiv');
  settleActiveHero(fixture);

  const afterRoute = readMenuState(fixture);
  assert.equal(
    afterRoute.scopes.some((scope) => scope.id === 'scope_current'),
    false,
  );
  assert.equal(readConfig(fixture).values.enemyLow, '#E16161');
  assert.equal(configDispatches(fixture).length, 1);
});

test('Applying a content-identical user preset restamps Current without publishing config metadata', () => {
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

  applyPreset(fixture, 'user_0001');

  const after = readConfig(fixture);
  assert.equal(configDispatches(fixture).length, 0);
  assert.equal(after.revision, before.revision);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeRaw,
  );
  assert.equal(after.values.enemyLow, '#111111');
  const current = readMenuState(fixture).scopes.find(
    (scope) => scope.id === 'scope_current',
  );
  assert.equal(current.sourcePresetId, 'user_0001');
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


test('a saved Shiv preset replaces a stale matching scope and republishes its changed snapshot', () => {
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

test('preset rows own their actions and inline rename can be canceled', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'First',
        values: { enemyLow: '#223344' },
        mode: 'all',
        heroes: [],
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'Second',
        values: { enemyLow: '#334455' },
        mode: 'all',
        heroes: [],
      },
    ],
    pendingPresetId: null,
  });
  openEditor(fixture);
  fixture.harness.dispatches.length = 0;

  for (const className of [
    'HPColorsPresetRowCopy',
    'HPColorsPresetRowApply',
    'HPColorsPresetRowDelete',
  ]) {
    assert.ok(childWithClass(presetRow(fixture, 'baked_default'), className));
    assert.ok(childWithClass(presetRow(fixture, 'user_0001'), className));
  }
  assert.equal(
    childWithClass(presetRow(fixture, 'baked_default'), 'HPColorsPresetRowUp'),
    null,
  );
  assert.equal(
    childWithClass(presetRow(fixture, 'baked_default'), 'HPColorsPresetRowDown'),
    null,
  );
  assert.equal(
    presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowUp').enabled,
    false,
  );
  assert.equal(
    presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowDown').enabled,
    true,
  );
  assert.equal(
    presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowUp').enabled,
    true,
  );
  assert.equal(
    presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowDown').enabled,
    false,
  );
  assert.equal(
    fixture.harness.root.FindChildTraverse('HPColorsPresetApplyButton'),
    null,
  );

  selectPreset(fixture, 'user_0001');
  childWithClass(
    presetRow(fixture, 'user_0001'),
    'HPColorsPresetOptionName',
  ).events.onactivate();
  const renameInput = childWithClass(
    presetRow(fixture, 'user_0001'),
    'HPColorsPresetOptionName',
  );
  assert.ok(renameInput.BHasClass('Editing'));
  renameInput.text = 'Discarded';
  assert.equal(typeof renameInput.events.oncancel, 'function');
  renameInput.events.oncancel();
  fixture.harness.scheduler.runAllByDelay(0.01);
  assert.notEqual(renameInput.focused, true);

  assert.equal(readMenuState(fixture).userPresets[0].name, 'First');
  assert.equal(
    childWithClass(
      presetRow(fixture, 'user_0001'),
      'HPColorsPresetOptionName',
    ).text,
    'First  ·  SESSION',
  );
  assert.equal(configDispatches(fixture).length, 0);
});

test('preset row Apply publishes immediately and remains an Apply action', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Haze',
      values: { enemyLow: '#22AA44' },
      mode: 'selected',
      heroes: ['hero_haze'],
    }],
  }, { heroName: '' });
  openEditor(fixture);
  fixture.harness.dispatches.length = 0;

  presetRowControl(
    fixture,
    'user_0001',
    'HPColorsPresetRowApply',
  ).events.onactivate();

  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
  assert.equal(configDispatches(fixture).length, 1);
  const apply = presetRowControl(
    fixture,
    'user_0001',
    'HPColorsPresetRowApply',
  );
  assert.equal(apply.Children()[0].text, 'APPLY');
});

test('repository selection and rename preserve live settings and stable IDs', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Shiv Session',
      values: { enemyLow: '#22AA44' },
      mode: 'selected',
      heroes: ['hero_shiv'],
    }],
    pendingPresetId: null,
  });
  openEditor(fixture);
  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;

  selectPreset(fixture, 'user_0001');
  let state = readMenuState(fixture);
  assert.equal(state.selectedPresetId, 'user_0001');
  assert.equal(state.values.enemyLow, '#111111');
  assert.equal(state.scopes.length, 0);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
  assert.equal(presetRow(fixture, 'user_0001').BHasClass('Selected'), true);
  assert.equal(presetRow(fixture, 'user_0001').BHasClass('Active'), false);
  assert.ok(
    childWithClass(
      presetRow(fixture, 'user_0001'),
      'HPColorsPresetOptionName',
    ).BHasClass('Editable'),
  );

  renameSelectedPreset(fixture, 'Shiv Ranked');
  state = readMenuState(fixture);
  assert.equal(state.userPresets[0].id, 'user_0001');
  assert.equal(state.userPresets[0].name, 'Shiv Ranked');
  assert.equal(state.selectedPresetId, 'user_0001');

  selectPreset(fixture, 'baked_default');
  renameSelectedPreset(fixture, 'Factory Defaults');
  state = readMenuState(fixture);
  assert.deepEqual(state.bakedPresetNameOverrides, {
    baked_default: 'Factory Defaults',
  });
  assert.equal(state.selectedPresetId, 'baked_default');
  assert.equal(
    childWithClass(
      presetRow(fixture, 'baked_default'),
      'HPColorsPresetOptionName',
    ).text,
    'Factory Defaults  ·  BAKED',
  );
  assert.equal(state.values.enemyLow, '#111111');
  assert.equal(state.scopes.length, 0);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
});

test('deleting an applied user repairs references without changing Current or reusing its ID', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Base',
        values: { enemyLow: '#334455' },
        mode: 'off',
        heroes: [],
      },
      {
        id: 'user_0003',
        kind: 'user',
        name: 'Applied Haze',
        values: { enemyLow: '#22AA44' },
        mode: 'selected',
        heroes: ['hero_haze'],
      },
    ],
    pendingPresetId: null,
  }, { heroName: '' });
  openEditor(fixture);
  applyPreset(fixture, 'user_0003');
  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;
  presetRowControl(
    fixture,
    'user_0003',
    'HPColorsPresetRowDelete',
  ).events.onactivate();
  assert.equal(presetRow(fixture, 'user_0003').BHasClass('Confirming'), true);
  presetRowControl(
    fixture,
    'user_0003',
    'HPColorsPresetRowCancel',
  ).events.onactivate();
  assert.equal(presetRow(fixture, 'user_0003').BHasClass('Confirming'), false);
  assert.deepEqual(
    readMenuState(fixture).userPresets.map((preset) => preset.id),
    ['user_0001', 'user_0003'],
  );
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
  deleteOrHideSelectedPreset(fixture);

  let state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0001'],
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(state, 'pendingPresetId'),
    false,
  );
  assert.equal(state.selectedPresetId, 'user_0001');
  assert.equal(state.nextUserPresetNumber, 4);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);

  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  savePreset(fixture, 'Replacement');
  state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0001', 'user_0004'],
  );
  assert.equal(state.nextUserPresetNumber, 5);
  assert.equal(state.selectedPresetId, 'user_0004');
  assert.equal(configDispatches(fixture).length, 0);
});

test('hiding baked rows preserves fallback behavior and restore order', () => {
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
  selectPreset(fixture, 'baked_default');
  fixture.harness.dispatches.length = 0;
  deleteOrHideSelectedPreset(fixture);

  let state = readMenuState(fixture);
  assert.deepEqual(state.hiddenBakedPresetIds, ['baked_default']);
  assert.equal(state.selectedPresetId, 'user_0001');
  assert.deepEqual(
    presetRows(fixture).map((row) =>
      row.GetAttributeString('hp_colors_preset_id', '')),
    ['user_0001'],
  );
  assert.equal(configDispatches(fixture).length, 0);

  fixture.topBar.setHeroName('Haze');
  runIdentityTick(fixture);
  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.enemyHigh, '#00FF00');
  assert.equal(configDispatches(fixture).length, 1);

  fixture.harness.dispatches.length = 0;
  panel(fixture, 'HPColorsPresetRestoreBakedButton').events.onactivate();
  state = readMenuState(fixture);
  assert.deepEqual(state.hiddenBakedPresetIds, []);
  assert.deepEqual(
    presetRows(fixture).map((row) =>
      row.GetAttributeString('hp_colors_preset_id', '')),
    ['baked_default', 'user_0001'],
  );
  assert.equal(configDispatches(fixture).length, 0);
});

test('reordering users preserves stable selection and live configuration', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'First Haze',
        values: { enemyLow: '#AA0000' },
        mode: 'selected',
        heroes: ['hero_haze'],
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'Second Haze',
        values: { enemyLow: '#00AA00' },
        mode: 'selected',
        heroes: ['hero_haze'],
      },
      {
        id: 'user_0003',
        kind: 'user',
        name: 'All',
        values: { enemyLow: '#334455' },
        mode: 'all',
        heroes: [],
      },
    ],
  }, { heroName: '' });
  openEditor(fixture);
  selectPreset(fixture, 'user_0002');
  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;

  presetRowControl(
    fixture,
    'user_0002',
    'HPColorsPresetRowUp',
  ).events.onactivate();
  let state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0002', 'user_0001', 'user_0003'],
  );
  assert.equal(state.selectedPresetId, 'user_0002');

  const blockedUp = presetRowControl(
    fixture,
    'user_0002',
    'HPColorsPresetRowUp',
  );
  assert.equal(blockedUp.enabled, false);
  blockedUp.events.onactivate();
  state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0002', 'user_0001', 'user_0003'],
  );

  selectPreset(fixture, 'user_0003');
  const blockedDown = presetRowControl(
    fixture,
    'user_0003',
    'HPColorsPresetRowDown',
  );
  assert.equal(blockedDown.enabled, false);
  blockedDown.events.onactivate();
  state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0002', 'user_0001', 'user_0003'],
  );
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
});

test('reordered first matching user becomes the next automatic route', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Red Haze',
        values: { enemyLow: '#AA0000' },
        mode: 'selected',
        heroes: ['hero_haze'],
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'Green Haze',
        values: { enemyLow: '#00AA00' },
        mode: 'selected',
        heroes: ['hero_haze'],
      },
    ],
    pendingPresetId: null,
  }, { heroName: '' });
  openEditor(fixture);
  fixture.harness.dispatches.length = 0;
  selectPreset(fixture, 'user_0002');
  presetRowControl(
    fixture,
    'user_0002',
    'HPColorsPresetRowUp',
  ).events.onactivate();
  assert.equal(configDispatches(fixture).length, 0);

  fixture.topBar.setHeroName('Haze');
  settleActiveHero(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#00AA00');
  assert.equal(configDispatches(fixture).length, 1);
});

test('create form stays distinct while a selected session row exposes Save & Apply', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { widthScale: 100 },
    scopes: [],
    userPresets: [],
    pendingPresetId: null,
  });
  openEditor(fixture);
  fixture.harness.dispatches.length = 0;

  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
  assert.equal(panel(fixture, 'HPColorsPresetNewButton').enabled, true);
  savePreset(fixture, 'Ranked');

  let state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0001'],
  );
  assert.equal(state.userPresets[0].name, 'Ranked');
  assert.equal(state.userPresets[0].values.widthScale, 100);
  assert.equal(state.selectedPresetId, 'user_0001');
  assert.deepEqual(state.hiddenBakedPresetIds, ['baked_default']);
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
  assert.equal(configDispatches(fixture).length, 0);

  panel(fixture, 'HPColorsWidthEntry').text = '131';
  panel(fixture, 'HPColorsWidthEntry').events.ontextentrysubmit();
  fixture.harness.dispatches.length = 0;
  selectPreset(fixture, 'user_0001');

  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), true);
  assert.equal(panel(fixture, 'HPColorsPresetNameInput').text, 'Ranked');
  assert.equal(
    panel(fixture, 'HPColorsPresetSaveButtonLabel').text,
    'SAVE & APPLY',
  );
  const saveAndApply = presetRowControl(
    fixture,
    'user_0001',
    'HPColorsPresetRowApply',
  );
  assert.equal(saveAndApply.Children()[0].text, 'SAVE & APPLY');
  assert.equal(saveAndApply.BHasClass('SaveAndApply'), true);
  assert.equal(
    panel(fixture, 'HPColorsPresetFeedback').text,
    'EDITING RANKED. SAVE & APPLY REPLACES THIS PRESET WITH YOUR CURRENT MENU SETTINGS, THEN LOADS IT.',
  );

  panel(fixture, 'HPColorsPresetNameInput').text = 'Ranked Revised';
  saveAndApply.events.onactivate();

  state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0001'],
  );
  assert.equal(state.userPresets[0].name, 'Ranked Revised');
  assert.equal(state.userPresets[0].values.widthScale, 131);
  assert.equal(state.nextUserPresetNumber, 2);
  assert.equal(state.selectedPresetId, 'user_0001');
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
  assert.match(panel(fixture, 'HPColorsPresetFeedback').text, /SAVED & APPLIED/i);
  assert.equal(configDispatches(fixture).length, 0);

  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetSaveButtonLabel').text, 'CREATE PRESET');
  savePreset(fixture, 'Second');
  state = readMenuState(fixture);
  assert.deepEqual(
    state.userPresets.map((preset) => preset.id),
    ['user_0001', 'user_0002'],
  );
  assert.equal(state.nextUserPresetNumber, 3);

  const beforeCancel = JSON.stringify(state.userPresets);
  selectPreset(fixture, 'user_0001');
  panel(fixture, 'HPColorsPresetCancelEditButton').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
  assert.equal(JSON.stringify(readMenuState(fixture).userPresets), beforeCancel);
  assert.match(panel(fixture, 'HPColorsPresetFeedback').text, /NOTHING CHANGED/i);
});

test('Copy selected exports one inert preset with complete metadata', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [{
      id: 'user_0004',
      kind: 'user',
      name: 'Haze Rules',
      values: { enemyLow: '#22AA44', widthScale: 117 },
      mode: 'selected',
      heroes: ['hero_haze'],
      conditions: {
        enemyLow: { slot: 2, minTier: 1, value: '#33AA55' },
      },
    }],
    pendingPresetId: null,
  });
  openEditor(fixture);
  selectPreset(fixture, 'user_0004');
  const beforeState = readMenuState(fixture);
  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;

  presetRowControl(
    fixture,
    'user_0004',
    'HPColorsPresetRowCopy',
  ).events.onactivate();

  assert.equal(fixture.harness.clipboardWrites.length, 1);
  const payload = decodePresetTransfer(fixture.harness.clipboardWrites[0]);
  assert.equal(payload.records.length, 1);
  assert.deepEqual(payload.records[0], {
    id: 'user_0004',
    kind: 'user',
    name: 'Haze Rules',
    mode: 'selected',
    heroes: ['hero_haze'],
    values: [[1, 117], [8, '#22AA44']],
    conditions: {
      enemyLow: { slot: 2, minTier: 1, value: '#33AA55' },
    },
  });
  assert.deepEqual(readMenuState(fixture), beforeState);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
});

test('Copy All exports deterministic baked-before-user repository state', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: {},
    scopes: [{
      id: 'scope_current',
      mode: 'all',
      heroes: [],
      values: { enemyLow: '#ABCDEF' },
    }],
    userPresets: [
      {
        id: 'user_0002',
        kind: 'user',
        name: 'All',
        values: { enemyLow: '#222222' },
        mode: 'all',
        heroes: [],
      },
      {
        id: 'user_0005',
        kind: 'user',
        name: 'Shiv',
        values: { enemyLow: '#555555' },
        mode: 'selected',
        heroes: ['hero_shiv'],
      },
    ],
    selectedPresetId: 'user_0005',
    hiddenBakedPresetIds: ['baked_default'],
    bakedPresetNameOverrides: { baked_default: 'Factory' },
    pendingPresetId: null,
  });
  openEditor(fixture);
  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;

  panel(fixture, 'HPColorsPresetCopyAllButton').events.onactivate();

  const payload = decodePresetTransfer(fixture.harness.clipboardWrites[0]);
  assert.deepEqual(payload.records.map((record) => record.id), [
    'baked_default',
    'user_0002',
    'user_0005',
  ]);
  assert.equal(
    payload.records.some((record) => record.id === 'scope_current'),
    false,
  );
  assert.equal(payload.records[0].name, 'Factory');
  assert.deepEqual(payload.hiddenBakedPresetIds, ['baked_default']);
  assert.equal(payload.selectedPresetId, 'user_0005');
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
});

test('preset and bundle import append atomically without applying settings', () => {
  const source = bootPresetMenu({
    version: 1,
    values: {},
    scopes: [],
    userPresets: [{
      id: 'user_0004',
      kind: 'user',
      name: 'Haze Rules',
      values: { enemyLow: '#22AA44', widthScale: 117 },
      mode: 'selected',
      heroes: ['hero_haze'],
      conditions: {
        enemyLow: { slot: 2, minTier: 1, value: '#33AA55' },
      },
    }],
    selectedPresetId: 'user_0004',
    pendingPresetId: null,
  });
  openEditor(source);
  panel(source, 'HPColorsPresetCopyAllButton').events.onactivate();
  const code = source.harness.clipboardWrites[0];

  const destination = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [{
      id: 'user_0007',
      kind: 'user',
      name: 'Existing',
      values: { enemyLow: '#777777' },
      mode: 'all',
      heroes: [],
    }],
    nextUserPresetNumber: 8,
    selectedPresetId: 'user_0007',
    pendingPresetId: null,
  });
  openEditor(destination);
  const beforeConfig = destination.harness.root.GetAttributeString(CONFIG_ATTR, '');
  const beforeRevision = readConfig(destination).revision;
  destination.harness.dispatches.length = 0;

  importPresetTransfer(destination, code);

  const state = readMenuState(destination);
  assert.deepEqual(state.userPresets.map((preset) => preset.id), [
    'user_0007',
    'user_0008',
  ]);
  assert.equal(state.userPresets[1].name, 'Haze Rules');
  assert.equal(state.userPresets[1].mode, 'selected');
  assert.deepEqual(state.userPresets[1].heroes, ['hero_haze']);
  assert.equal(state.userPresets[1].values.enemyLow, '#22AA44');
  assert.equal(state.userPresets[1].values.widthScale, 117);
  assert.deepEqual(state.userPresets[1].conditions, {
    enemyLow: { slot: 2, minTier: 1, value: '#33AA55' },
  });
  assert.equal(state.selectedPresetId, 'user_0008');
  assert.equal(state.nextUserPresetNumber, 9);
  assert.equal(readConfig(destination).revision, beforeRevision);
  assert.equal(
    destination.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(destination).length, 0);
  assert.match(
    panel(destination, 'HPColorsPresetTransferFeedback').text,
    /IMPORTED 1 PRESET/i,
  );
});

test('baked import clears a stale destination name override', () => {
  const source = bootPresetMenu({
    version: 1,
    values: {},
    scopes: [],
    userPresets: [],
    selectedPresetId: 'baked_default',
    pendingPresetId: null,
  });
  openEditor(source);
  panel(source, 'HPColorsPresetCopyAllButton').events.onactivate();

  const destination = bootPresetMenu({
    version: 1,
    values: {},
    scopes: [],
    userPresets: [],
    bakedPresetNameOverrides: { baked_default: 'Old Factory Name' },
    selectedPresetId: 'baked_default',
    pendingPresetId: null,
  });
  openEditor(destination);
  const beforeConfig = destination.harness.root.GetAttributeString(CONFIG_ATTR, '');

  importPresetTransfer(destination, source.harness.clipboardWrites[0]);

  assert.deepEqual(readMenuState(destination).bakedPresetNameOverrides, {});
  assert.equal(
    childWithClass(
      presetRow(destination, 'baked_default'),
      'HPColorsPresetOptionName',
    ).text,
    'Rewrite Default  ·  BAKED',
  );
  assert.equal(
    destination.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
});

test('bundle import rejects a selection hidden by the same payload', () => {
  const source = bootPresetMenu({
    version: 1,
    values: {},
    scopes: [],
    userPresets: [],
    selectedPresetId: 'baked_default',
    pendingPresetId: null,
  });
  openEditor(source);
  panel(source, 'HPColorsPresetCopyAllButton').events.onactivate();
  const payload = decodePresetTransfer(source.harness.clipboardWrites[0]);
  payload.hiddenBakedPresetIds = ['baked_default'];
  payload.selectedPresetId = 'baked_default';

  const destination = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [],
    pendingPresetId: null,
  });
  openEditor(destination);
  const beforeState = readMenuState(destination);
  const beforeConfig = destination.harness.root.GetAttributeString(CONFIG_ATTR, '');

  importPresetTransfer(destination, 'HPCRP1' + JSON.stringify(payload));

  assert.deepEqual(readMenuState(destination), beforeState);
  assert.equal(
    destination.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(
    panel(destination, 'HPColorsPresetTransferDialog').BHasClass('Error'),
    true,
  );
});

test('closing import ignores a delayed clipboard callback', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [],
    pendingPresetId: null,
  });
  openEditor(fixture);
  const beforeState = readMenuState(fixture);
  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');

  panel(fixture, 'HPColorsPresetImportButton').events.onactivate();
  panel(fixture, 'HPColorsPresetTransferConfirmButton').events.onactivate();
  panel(fixture, 'HPColorsPresetTransferCloseButton').events.onactivate();
  panel(fixture, 'HPColorsPresetTransferInput').text =
    'HPCRP1' + JSON.stringify({
      records: [{
        id: 'user_0001',
        kind: 'user',
        name: 'Stale Paste',
        mode: 'all',
        heroes: [],
        values: [],
      }],
    });
  fixture.harness.scheduler.runAllByDelay(0.05);

  assert.deepEqual(readMenuState(fixture), beforeState);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(
    panel(fixture, 'HPColorsPresetTransferDialog').BHasClass('Open'),
    false,
  );
});

test('invalid preset bundle is rejected without partial repository mutation', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [],
    pendingPresetId: null,
  });
  openEditor(fixture);
  const beforeState = readMenuState(fixture);
  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;
  const invalid = 'HPCRP1' + JSON.stringify({
    records: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Valid',
        mode: 'all',
        heroes: [],
        values: [],
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'Broken',
        mode: 'selected',
        heroes: ['not_a_hero'],
        values: [],
      },
    ],
  });

  importPresetTransfer(fixture, invalid);

  assert.deepEqual(readMenuState(fixture), beforeState);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
  assert.equal(
    panel(fixture, 'HPColorsPresetTransferDialog').BHasClass('Error'),
    true,
  );
});

test('baked imports reject noncanonical heroes and conditions atomically', () => {
  const fixture = bootPresetMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [],
    pendingPresetId: null,
  });
  openEditor(fixture);
  const beforeState = readMenuState(fixture);
  const beforeConfig = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  fixture.harness.dispatches.length = 0;
  const code = 'HPCRP1' + JSON.stringify({
    records: [{
      id: 'baked_default',
      kind: 'baked',
      name: 'Rewrite Default',
      mode: 'off',
      heroes: ['hero_haze'],
      values: [],
      conditions: { minHealth: 25 },
    }],
  });

  importPresetTransfer(fixture, code);

  assert.deepEqual(readMenuState(fixture), beforeState);
  assert.equal(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''),
    beforeConfig,
  );
  assert.equal(configDispatches(fixture).length, 0);
  assert.equal(
    panel(fixture, 'HPColorsPresetTransferDialog').BHasClass('Error'),
    true,
  );
});
