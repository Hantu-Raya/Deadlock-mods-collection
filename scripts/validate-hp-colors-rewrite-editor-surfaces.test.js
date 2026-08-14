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
const ENEMY_BAR_DEFAULTS = {
  enemyEnabled: true,
  enemyVisible: true,
  enemyMode: 'gradient',
  enemyLow: '#E16161',
  enemyMid: '#FF7B00',
  enemyHigh: '#00FF00',
  lowThreshold: 25,
  highThreshold: 65,
  enemyTeamHigh: false,
  excludeBuildings: false,
  excludeBosses: false,
};
const ENEMY_BAR_KEYS = Object.keys(ENEMY_BAR_DEFAULTS);

function installLayoutPanels(harness) {
  const ids = new Set(
    Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
  );
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
    }));
  }
}

function bootMenu(menuState, options = {}) {
  const harness = createPanoramaHarness();
  installLayoutPanels(harness);
  installTopBarIdentityTree(harness, {
    heroName: options.heroName === undefined ? 'SHIV' : options.heroName,
    gameTime: options.gameTime === undefined ? '00:01' : options.gameTime,
  });
  harness.root.SetAttributeString(
    MENU_STATE_ATTR,
    JSON.stringify(menuState || { version: 1, values: {}, scopes: [] }),
  );
  if (options.publishedSnapshot !== undefined) {
    harness.root.SetAttributeString(
      CONFIG_ATTR,
      JSON.stringify(options.publishedSnapshot),
    );
  }
  runInVm(menuSource, createVmContext(harness), 'hp_colors_menu.js');
  harness.$.HPColorsMenuBoot();
  return { harness };
}

function panel(fixture, id) {
  const found = fixture.harness.root.FindChildTraverse(id);
  assert.ok(found, `expected ${id} panel`);
  return found;
}

function openEditor(fixture) {
  const button = panel(fixture, 'HPColorsMenuButton');
  assert.equal(typeof button.events.onactivate, 'function');
  button.events.onactivate();
}

function selectEnemyBar(fixture) {
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ENEMY BAR');
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

function observeRootAttributeWrites(harness) {
  const writes = [];
  const original = harness.root.SetAttributeString.bind(harness.root);
  harness.root.SetAttributeString = (name, value) => {
    writes.push({ name: String(name), value: String(value) });
    return original(name, value);
  };
  return writes;
}


function changedEnemyValues() {
  return {
    enemyEnabled: false,
    enemyVisible: false,
    enemyMode: 'fixed',
    enemyLow: '#111111',
    enemyMid: '#222222',
    enemyHigh: '#333333',
    lowThreshold: 10,
    highThreshold: 90,
    enemyTeamHigh: true,
    excludeBuildings: true,
    excludeBosses: true,
    allyLow: '#445566',
    widthScale: 123,
  };
}

function requestReset(fixture) {
  const button = panel(fixture, 'HPColorsResetSectionButton');
  assert.equal(button.enabled, true);
  assert.equal(typeof button.events.onactivate, 'function');
  button.events.onactivate();
}

function confirmReset(fixture) {
  const button = panel(fixture, 'HPColorsResetConfirmButton');
  assert.equal(typeof button.events.onactivate, 'function');
  button.events.onactivate();
}

test('reset request opens confirmation without mutation, history, or dispatch', () => {
  const fixture = bootMenu({
    version: 1,
    values: changedEnemyValues(),
    scopes: [],
  });
  openEditor(fixture);
  selectEnemyBar(fixture);
  const beforeState = readMenuState(fixture);
  const beforeConfig = readConfig(fixture);
  const beforeDispatchCount = configDispatches(fixture).length;
  const writes = observeRootAttributeWrites(fixture.harness);
  const undo = panel(fixture, 'HPColorsUndoButton');
  const dialog = panel(fixture, 'HPColorsResetDialog');

  assert.equal(dialog.BHasClass('Open'), false);
  assert.equal(undo.enabled, false);
  assert.equal(undo.BHasClass('Disabled'), true);
  requestReset(fixture);

  assert.equal(dialog.BHasClass('Open'), true);
  assert.equal(panel(fixture, 'HPColorsResetDialogTitle').text, 'RESET BAR');
  assert.match(panel(fixture, 'HPColorsResetDialogMessage').text, /ENEMY \/ BAR/);
  assert.deepEqual(readMenuState(fixture), beforeState);
  assert.deepEqual(readConfig(fixture), beforeConfig);
  assert.equal(configDispatches(fixture).length, beforeDispatchCount);
  assert.equal(writes.length, 0);
  assert.equal(undo.enabled, false);
  assert.equal(undo.BHasClass('Disabled'), true);
});

test('cancel closes reset confirmation and remains inert', () => {
  const fixture = bootMenu({
    version: 1,
    values: changedEnemyValues(),
    scopes: [],
  });
  openEditor(fixture);
  selectEnemyBar(fixture);
  requestReset(fixture);
  const beforeState = readMenuState(fixture);
  const beforeConfig = readConfig(fixture);
  const beforeDispatchCount = configDispatches(fixture).length;
  const writes = observeRootAttributeWrites(fixture.harness);

  panel(fixture, 'HPColorsResetCancelButton').events.onactivate();

  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), false);
  assert.deepEqual(readMenuState(fixture), beforeState);
  assert.deepEqual(readConfig(fixture), beforeConfig);
  assert.equal(configDispatches(fixture).length, beforeDispatchCount);
  assert.equal(writes.length, 0);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'LIVE');
});

test('confirm resets only the captured tab and one Undo restores every reset value', () => {
  const fixture = bootMenu({
    version: 1,
    values: changedEnemyValues(),
    scopes: [],
  });
  openEditor(fixture);
  selectEnemyBar(fixture);
  const beforeState = readMenuState(fixture);
  const beforeConfig = readConfig(fixture);
  const beforeDispatchCount = configDispatches(fixture).length;

  requestReset(fixture);
  panel(fixture, 'HPColorsCategoryAlly').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), true);
  confirmReset(fixture);

  const resetState = readMenuState(fixture);
  const resetConfig = readConfig(fixture);
  for (const key of ENEMY_BAR_KEYS)
    assert.equal(resetState.values[key], ENEMY_BAR_DEFAULTS[key], key);
  for (const key of Object.keys(beforeState.values)) {
    if (!ENEMY_BAR_KEYS.includes(key))
      assert.equal(resetState.values[key], beforeState.values[key], key);
  }
  assert.equal(resetConfig.revision, beforeConfig.revision + 1);
  assert.deepEqual(resetConfig.values, resetState.values);
  assert.equal(configDispatches(fixture).length, beforeDispatchCount + 1);
  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'SECTION RESET · UNDO AVAILABLE');
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, true);
  assert.equal(panel(fixture, 'HPColorsUndoButton').BHasClass('Disabled'), false);

  panel(fixture, 'HPColorsUndoButton').events.onactivate();

  const undoState = readMenuState(fixture);
  const undoConfig = readConfig(fixture);
  assert.deepEqual(undoState.values, beforeState.values);
  assert.deepEqual(undoState.scopes, beforeState.scopes);
  assert.deepEqual(undoConfig.values, beforeConfig.values);
  assert.equal(undoConfig.revision, beforeConfig.revision + 2);
  assert.equal(configDispatches(fixture).length, beforeDispatchCount + 2);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
  assert.equal(panel(fixture, 'HPColorsUndoButton').BHasClass('Disabled'), true);
});

test('already-default section stays closed without a write, revision, history, or dispatch', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(fixture);
  selectEnemyBar(fixture);
  const beforeStateRaw = fixture.harness.root.GetAttributeString(MENU_STATE_ATTR, '');
  const beforeConfigRaw = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  const beforeConfig = readConfig(fixture);
  const beforeDispatchCount = configDispatches(fixture).length;
  const writes = observeRootAttributeWrites(fixture.harness);

  requestReset(fixture);

  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'SECTION ALREADY DEFAULT');
  assert.equal(fixture.harness.root.GetAttributeString(MENU_STATE_ATTR, ''), beforeStateRaw);
  assert.equal(fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''), beforeConfigRaw);
  assert.equal(readConfig(fixture).revision, beforeConfig.revision);
  assert.equal(configDispatches(fixture).length, beforeDispatchCount);
  assert.equal(writes.length, 0);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
});

test('reset of an inactive current hero row changes menu state but suppresses equal effective publication', () => {
  const fixture = bootMenu(
    {
      version: 1,
      values: changedEnemyValues(),
      scopes: [
        {
          id: 'scope_current',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#AAAAAA' },
        },
        {
          id: 'scope_all',
          mode: 'all',
          heroes: [],
          values: {},
        },
      ],
    },
    { heroName: '' },
  );
  fixture.harness.dispatches.length = 0;
  openEditor(fixture);
  selectEnemyBar(fixture);
  const beforeState = readMenuState(fixture);
  const beforeConfig = readConfig(fixture);
  const beforeDispatchCount = configDispatches(fixture).length;
  const writes = observeRootAttributeWrites(fixture.harness);

  requestReset(fixture);
  confirmReset(fixture);

  const afterState = readMenuState(fixture);
  assert.notEqual(afterState.values.enemyLow, beforeState.values.enemyLow);
  assert.deepEqual(afterState.scopes, beforeState.scopes);
  assert.deepEqual(readConfig(fixture), beforeConfig);
  assert.equal(configDispatches(fixture).length, beforeDispatchCount);
  assert.ok(
    writes.some((write) => write.name === MENU_STATE_ATTR),
    'reset should persist the changed canonical menu state',
  );
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, true);
});

test('Presets page hides Reset Section and Undo', () => {
  const fixture = bootMenu({
    version: 1,
    values: changedEnemyValues(),
    scopes: [],
  });
  openEditor(fixture);
  panel(fixture, 'HPColorsTab2').events.onactivate();

  const reset = panel(fixture, 'HPColorsResetSectionButton');
  const undo = panel(fixture, 'HPColorsUndoButton');
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'PRESET LIBRARY');
  assert.equal(reset.enabled, false);
  assert.equal(reset.BHasClass('Disabled'), true);
  assert.equal(reset.BHasClass('HPColorsFooterActionHidden'), true);
  assert.equal(undo.BHasClass('HPColorsFooterActionHidden'), true);
  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), false);

  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  assert.equal(reset.BHasClass('HPColorsFooterActionHidden'), false);
  assert.equal(undo.BHasClass('HPColorsFooterActionHidden'), false);
});

test('Escape closes reset confirmation before closing the editor', () => {
  const fixture = bootMenu({
    version: 1,
    values: changedEnemyValues(),
    scopes: [],
  });
  openEditor(fixture);
  selectEnemyBar(fixture);
  requestReset(fixture);
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), true);
  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), true);

  harnessCancel(fixture);

  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), true);
  harnessCancel(fixture);
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), false);
});

function harnessCancel(fixture) {
  assert.equal(typeof fixture.harness.$.HPColorsMenuCancel, 'function');
  fixture.harness.$.HPColorsMenuCancel();
}

test('stale reset feedback callback cannot overwrite LIVE after editor close', () => {
  const fixture = bootMenu({
    version: 1,
    values: changedEnemyValues(),
    scopes: [],
  });
  openEditor(fixture);
  selectEnemyBar(fixture);
  requestReset(fixture);
  confirmReset(fixture);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'SECTION RESET · UNDO AVAILABLE');
  assert.ok(
    fixture.harness.scheduler.jobs.some((job) => Number(job.delay) === 1.25),
    'expected delayed reset feedback callback',
  );

  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'LIVE');

  fixture.harness.scheduler.runByDelay(1.25);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'LIVE');
});
