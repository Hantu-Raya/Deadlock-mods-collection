'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  MockPanel,
  createPanoramaHarness,
  installTopBarIdentityTree,
  runHpColorsSourcesInVm,
} = require('./hp-colors-panorama-test-adapter');

const rewriteRoot = process.env.HP_COLORS_REWRITE_SOURCE_ROOT
  ? path.resolve(process.env.HP_COLORS_REWRITE_SOURCE_ROOT)
  : path.resolve(__dirname, '../hp_colors_rewrite_v2');
const layoutSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/layout/hud_escape_menu.xml'),
  'utf8',
);
const menuSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/hp_colors_v2_menu.js'),
  'utf8',
);
const canonicalMenuSource = fs.readFileSync(
  path.resolve(__dirname, '../hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_menu.js'),
  'utf8',
);
const menuStyleSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/styles/hp_colors_v2_menu.css'),
  'utf8',
);
const contractSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/hp_colors_v2_contract.js'),
  'utf8',
);
const stateSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/hp_colors_v2_state.js'),
  'utf8',
);
const MENU_STATE_ATTR = 'hp_colors_v2_menu_state';
const CONFIG_ATTR = 'hp_colors_v2_config';
const ENEMY_BAR_DEFAULTS = {
  enemyEnabled: true,
  enemyVisible: true,
  enemyMode: 'gradient',
  enemyLow: '#FD4949',
  enemyMid: '#FF7B00',
  enemyHigh: '#00FF00',
  enemyTeamHigh: false,
};
const ENEMY_BAR_KEYS = Object.keys(ENEMY_BAR_DEFAULTS);
// This harness loads no storage runtime, so the status chip's resting text is
// the save-unavailable state; the storage E2E suite covers the SAVED states.
const STATUS_WITHOUT_STORE = 'SAVE UNAVAILABLE';

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
  const harness = createPanoramaHarness(options.harnessOptions || {});
  installLayoutPanels(harness);
  const identityTree = installTopBarIdentityTree(harness, {
    heroName: options.heroName === undefined ? 'SHIV' : options.heroName,
    gameTime: options.gameTime === undefined ? '00:01' : options.gameTime,
  });
  if (typeof options.beforeBoot === 'function') {
    options.beforeBoot(harness, identityTree);
  }
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
  runHpColorsSourcesInVm(stateSource, menuSource, harness, {
    settingsContractSource: contractSource,
  });
  harness.$.HPColorsMenuBoot();
  return { harness, identityTree };
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

function selectStamina(fixture) {
  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ENEMY PLAYER STAMINA');
}

function selectOverviewLayout(fixture) {
  panel(fixture, 'HPColorsCategoryOverview').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'BAR LAYOUT');
}

function selectAllyBar(fixture) {
  panel(fixture, 'HPColorsCategoryAlly').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ALLY BAR');
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

function presetOption(fixture, presetId) {
  const options = panel(fixture, 'HPColorsPresetOptions');
  for (let index = 0; index < options.GetChildCount(); index += 1) {
    const option = options.GetChild(index);
    if (option.GetAttributeString('hp_colors_preset_id', '') === presetId) {
      return option;
    }
  }
  assert.fail(`expected preset option ${presetId}`);
}

function presetRowControl(fixture, presetId, className) {
  const control = presetOption(fixture, presetId)
    .FindChildrenWithClassTraverse(className)[0];
  assert.ok(control, `expected ${className} in preset row ${presetId}`);
  return control;
}

function presetRowMain(fixture, presetId) {
  return presetRowControl(fixture, presetId, 'HPColorsPresetOptionMain');
}

function presetRowHas(fixture, presetId, className) {
  return presetOption(fixture, presetId)
    .FindChildrenWithClassTraverse(className).length > 0;
}

function presetFeedback(fixture) {
  return panel(fixture, 'HPColorsPresetFeedback').text;
}

function scopeOption(fixture, heroKey) {
  const options = panel(fixture, 'HPColorsScopeOptions');
  for (let index = 0; index < options.GetChildCount(); index += 1) {
    const option = options.GetChild(index);
    if (option.GetAttributeString('hp_colors_scope_hero_key', '') === heroKey) {
      return option;
    }
  }
  assert.fail(`expected scope option ${heroKey}`);
}

function extractArrayDeclaration(source, name) {
  const declaration = source.match(
    new RegExp(`\\bvar ${name} = (\\[[\\s\\S]*?\\n  \\]);`),
  );
  assert.ok(declaration, `expected ${name} array declaration`);
  return vm.runInNewContext(declaration[1]);
}

function panelAncestryById(xml, options = {}) {
  const ancestry = new Map();
  const stack = [];
  const tokens = xml.match(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g) || [];
  for (const token of tokens) {
    if (token.startsWith('<!--')) continue;
    const closing = token.match(/^<\/([A-Za-z][\w.-]*)/);
    if (closing) {
      const opened = stack.pop();
      assert.equal(opened && opened.tag, closing[1], `closed ${closing[1]} in order`);
      continue;
    }
    const opening = token.match(/^<([A-Za-z][\w.-]*)/);
    if (!opening) continue;
    const id = token.match(/\bid="([^"]+)"/)?.[1] || '';
    if (id) {
      if (!options.allowDuplicates) assert.ok(!ancestry.has(id), `duplicate XML id ${id}`);
      ancestry.set(id, stack.map((entry) => entry.id).filter(Boolean));
    }
    if (!token.endsWith('/>')) stack.push({ tag: opening[1], id });
  }
  assert.equal(stack.length, 0, 'XML tags must be balanced');
  return ancestry;
}


function settleHeroRoute(fixture, enemyLow) {
  fixture.harness.scheduler.runUntil(
    () => readConfig(fixture).values.enemyLow === enemyLow,
    `expected hero route with enemyLow ${enemyLow}`,
  );
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

test('width slider preserves the legacy 230 percent maximum', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  const slider = panel(fixture, 'HPColorsWidthSlider');
  const entry = panel(fixture, 'HPColorsWidthEntry');

  assert.equal(slider.min, 60);
  assert.equal(slider.max, 230);
  slider.value = 230;
  slider.events.onvaluechanged();
  assert.equal(readMenuState(fixture).values.widthScale, 230);
  assert.equal(slider.value, 230);

  entry.text = '999';
  entry.events.ontextentrysubmit();
  assert.equal(readMenuState(fixture).values.widthScale, 230);
  assert.equal(slider.value, 230);
});

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
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, STATUS_WITHOUT_STORE);
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

test('master section reset owns the shared thresholds', () => {
  const fixture = bootMenu({
    version: 1,
    values: {
      enabled: false,
      lowThreshold: 10,
      highThreshold: 90,
      enemyLow: '#111111',
    },
    scopes: [],
  });
  openEditor(fixture);
  const beforeConfig = readConfig(fixture);

  requestReset(fixture);
  confirmReset(fixture);

  const resetValues = readMenuState(fixture).values;
  assert.equal(resetValues.enabled, true);
  assert.equal(resetValues.lowThreshold, 25);
  assert.equal(resetValues.highThreshold, 65);
  assert.equal(resetValues.enemyLow, '#111111');
  assert.equal(readConfig(fixture).revision, beforeConfig.revision + 1);
});

test('stamina section reset publishes defaults immediately', () => {
  const fixture = bootMenu({
    version: 1,
    values: {
      staminaWidth: 180,
      staminaHeight: 60,
      staminaOffsetX: 24,
      staminaOffsetY: -18,
      enemyStaminaColorEnabled: true,
      enemyStaminaColor: '#123456',
    },
    scopes: [],
  });
  openEditor(fixture);
  selectStamina(fixture);
  const beforeConfig = readConfig(fixture);
  const beforeDispatchCount = configDispatches(fixture).length;

  requestReset(fixture);
  confirmReset(fixture);

  const resetState = readMenuState(fixture);
  const resetConfig = readConfig(fixture);
  assert.equal(resetState.values.staminaWidth, 110);
  assert.equal(resetState.values.staminaHeight, 44.8);
  assert.equal(resetState.values.staminaOffsetX, 0);
  assert.equal(resetState.values.staminaOffsetY, 0);
  assert.equal(resetState.values.enemyStaminaColorEnabled, false);
  assert.equal(resetState.values.enemyStaminaColor, '#FD4949');
  assert.equal(resetConfig.revision, beforeConfig.revision + 1);
  assert.deepEqual(resetConfig.values, resetState.values);
  assert.equal(configDispatches(fixture).length, beforeDispatchCount + 1);
});

test('overview layout reset applies negative X immediately despite a late slider mouse-up', () => {
  const fixture = bootMenu({
    version: 1,
    values: {
      widthScale: 230,
      heightScale: 160,
      positionX: -200,
      positionY: 200,
    },
    scopes: [],
  });
  openEditor(fixture);
  selectOverviewLayout(fixture);
  const slider = panel(fixture, 'HPColorsPositionXSlider');
  const entry = panel(fixture, 'HPColorsPositionXEntry');
  slider.events.onmousedown();
  const beforeConfig = readConfig(fixture);

  requestReset(fixture);
  confirmReset(fixture);

  const resetState = readMenuState(fixture);
  const resetConfig = readConfig(fixture);
  assert.equal(resetState.values.widthScale, 100);
  assert.equal(resetState.values.heightScale, 100);
  assert.equal(resetState.values.positionX, 0);
  assert.equal(resetState.values.positionY, 0);
  assert.equal(slider.value, 0);
  assert.equal(entry.text, '0');
  assert.equal(resetConfig.revision, beforeConfig.revision + 1);
  assert.deepEqual(resetConfig.values, resetState.values);

  slider.events.onmouseup();
  assert.equal(readMenuState(fixture).values.positionX, 0);
  assert.equal(readConfig(fixture).values.positionX, 0);
});

test('ally bar reset applies immediately to the published snapshot', () => {
  const fixture = bootMenu({
    version: 1,
    values: {
      allyEnabled: true,
      allyVisible: false,
      allyTeamHigh: true,
    },
    scopes: [],
  });
  openEditor(fixture);
  selectAllyBar(fixture);
  const beforeConfig = readConfig(fixture);

  requestReset(fixture);
  confirmReset(fixture);

  const resetState = readMenuState(fixture);
  const resetConfig = readConfig(fixture);
  assert.equal(resetState.values.allyEnabled, false);
  assert.equal(resetState.values.allyVisible, true);
  assert.equal(resetState.values.allyTeamHigh, false);
  assert.equal(resetConfig.revision, beforeConfig.revision + 1);
  assert.deepEqual(resetConfig.values, resetState.values);
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

test('reset edits Current while preserving the hidden base and publishing its effective change', () => {
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
  assert.equal(afterState.values.enemyLow, beforeState.values.enemyLow);
  const beforeCurrent = beforeState.scopes.find((scope) => scope.id === 'scope_current');
  const afterCurrent = afterState.scopes.find((scope) => scope.id === 'scope_current');
  assert.notEqual(afterCurrent.values.enemyLow, beforeCurrent.values.enemyLow);
  assert.equal(readConfig(fixture).values.enemyLow, afterCurrent.values.enemyLow);
  assert.equal(configDispatches(fixture).length, beforeDispatchCount + 1);
  assert.ok(
    writes.some((write) => write.name === MENU_STATE_ATTR),
    'reset should persist the changed Current menu state',
  );
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, true);
});

test('hero route changes refresh open editor controls and the published snapshot', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Shiv',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: { enemyLow: '#222222' },
        conditions: null,
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'Haze',
        mode: 'selected',
        heroes: ['hero_haze'],
        values: { enemyLow: '#333333' },
        conditions: null,
      },
    ],
  });
  settleHeroRoute(fixture, '#222222');
  openEditor(fixture);
  selectEnemyBar(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
  assert.equal(panel(fixture, 'HPColorsEnemyLowHex').text, '#222222');

  fixture.identityTree.setHeroName('HAZE');
  settleHeroRoute(fixture, '#333333');

  assert.equal(readConfig(fixture).values.enemyLow, '#333333');
  assert.equal(panel(fixture, 'HPColorsEnemyLowHex').text, '#333333');
});

test('Current scope controls keep mode, summaries, and hero options synchronized', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryPresets').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();

  const all = panel(fixture, 'HPColorsCurrentScopeAll');
  const selected = panel(fixture, 'HPColorsCurrentScopeSelected');
  const summary = panel(fixture, 'HPColorsCurrentScopeSummary');
  const dialog = panel(fixture, 'HPColorsScopeDialog');
  const close = panel(fixture, 'HPColorsScopeCloseButton');
  const haze = scopeOption(fixture, 'hero_haze');
  const shiv = scopeOption(fixture, 'hero_shiv');

  assert.equal(all.BHasClass('Selected'), true);
  assert.equal(selected.BHasClass('Selected'), false);
  assert.equal(summary.text, 'ALL HEROES');
  assert.equal(haze.BHasClass('Selected'), false);
  assert.equal(shiv.BHasClass('Selected'), false);

  selected.events.onactivate();
  assert.equal(dialog.BHasClass('Open'), true);
  haze.events.onactivate();

  let current = readMenuState(fixture).scopes.find(
    (scope) => scope.id === 'scope_current',
  );
  assert.ok(current);
  assert.equal(current.mode, 'selected');
  assert.deepEqual(current.heroes, ['hero_haze']);
  assert.equal(all.BHasClass('Selected'), false);
  assert.equal(selected.BHasClass('Selected'), true);
  assert.equal(summary.text, 'ONLY THESE — Haze');
  assert.equal(haze.BHasClass('Selected'), true);
  assert.equal(shiv.BHasClass('Selected'), false);

  close.events.onactivate();
  assert.equal(dialog.BHasClass('Open'), false);
  all.events.onactivate();

  current = readMenuState(fixture).scopes.find(
    (scope) => scope.id === 'scope_current',
  );
  assert.equal(current.mode, 'all');
  assert.deepEqual(current.heroes, []);
  assert.equal(all.BHasClass('Selected'), true);
  assert.equal(selected.BHasClass('Selected'), false);
  assert.equal(summary.text, 'ALL HEROES');
  assert.equal(haze.BHasClass('Selected'), false);
  assert.equal(shiv.BHasClass('Selected'), false);

  selected.events.onactivate();
  haze.events.onactivate();
  shiv.events.onactivate();

  current = readMenuState(fixture).scopes.find(
    (scope) => scope.id === 'scope_current',
  );
  assert.equal(current.mode, 'selected');
  assert.deepEqual(current.heroes, ['hero_haze', 'hero_shiv']);
  assert.equal(summary.text, 'ONLY THESE — Haze, Shiv');
  assert.equal(haze.BHasClass('Selected'), true);
  assert.equal(shiv.BHasClass('Selected'), true);

  haze.events.onactivate();
  current = readMenuState(fixture).scopes.find(
    (scope) => scope.id === 'scope_current',
  );
  assert.equal(current.mode, 'selected');
  assert.deepEqual(current.heroes, ['hero_shiv']);
  assert.equal(summary.text, 'ONLY THESE — Shiv');
  assert.equal(haze.BHasClass('Selected'), false);
  assert.equal(shiv.BHasClass('Selected'), true);

  shiv.events.onactivate();
  current = readMenuState(fixture).scopes.find(
    (scope) => scope.id === 'scope_current',
  );
  assert.equal(current.mode, 'all');
  assert.deepEqual(current.heroes, []);
  assert.equal(all.BHasClass('Selected'), true);
  assert.equal(selected.BHasClass('Selected'), false);
  assert.equal(summary.text, 'ALL HEROES');
  assert.equal(haze.BHasClass('Selected'), false);
  assert.equal(shiv.BHasClass('Selected'), false);
});

function openPresetsForm(fixture) {
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryPresets').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();
}

function currentScope(fixture) {
  const current = readMenuState(fixture).scopes.find(
    (scope) => scope.id === 'scope_current',
  );
  assert.ok(current);
  return current;
}

test('scope switch offers All Except with its own picker wording', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openPresetsForm(fixture);

  const except = panel(fixture, 'HPColorsCurrentScopeExcept');
  const selected = panel(fixture, 'HPColorsCurrentScopeSelected');
  const dialog = panel(fixture, 'HPColorsScopeDialog');
  const title = panel(fixture, 'HPColorsScopeDialogTitle');
  const message = panel(fixture, 'HPColorsScopeDialogMessage');
  const close = panel(fixture, 'HPColorsScopeCloseButton');

  assert.equal(typeof except.events.onactivate, 'function');
  except.events.onactivate();
  assert.equal(dialog.BHasClass('Open'), true);
  assert.equal(title.text, 'ALL EXCEPT');
  assert.equal(message.text, 'Choose HEROES to skip.');

  close.events.onactivate();
  assert.equal(dialog.BHasClass('Open'), false);
  selected.events.onactivate();
  assert.equal(dialog.BHasClass('Open'), true);
  assert.equal(title.text, 'ONLY THESE');
  assert.equal(message.text, 'Choose HEROES to include.');
});

test('All Except picker marks skipped heroes and summarizes the skip list', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openPresetsForm(fixture);

  const all = panel(fixture, 'HPColorsCurrentScopeAll');
  const selected = panel(fixture, 'HPColorsCurrentScopeSelected');
  const except = panel(fixture, 'HPColorsCurrentScopeExcept');
  const summary = panel(fixture, 'HPColorsCurrentScopeSummary');
  const haze = scopeOption(fixture, 'hero_haze');
  const shiv = scopeOption(fixture, 'hero_shiv');
  const bebop = scopeOption(fixture, 'hero_bebop');
  const kelvin = scopeOption(fixture, 'hero_kelvin');

  except.events.onactivate();
  haze.events.onactivate();
  shiv.events.onactivate();

  let current = currentScope(fixture);
  assert.equal(current.mode, 'except');
  assert.deepEqual(current.heroes, ['hero_haze', 'hero_shiv']);
  assert.equal(haze.BHasClass('Skipped'), true);
  assert.equal(shiv.BHasClass('Skipped'), true);
  assert.equal(haze.BHasClass('Selected'), false);
  assert.equal(shiv.BHasClass('Selected'), false);
  assert.equal(bebop.BHasClass('Skipped'), false);
  assert.equal(except.BHasClass('Selected'), true);
  assert.equal(all.BHasClass('Selected'), false);
  assert.equal(selected.BHasClass('Selected'), false);
  assert.equal(summary.text, 'ALL EXCEPT — Haze, Shiv');

  bebop.events.onactivate();
  kelvin.events.onactivate();
  current = currentScope(fixture);
  assert.equal(current.mode, 'except');
  assert.deepEqual(
    current.heroes,
    ['hero_bebop', 'hero_haze', 'hero_kelvin', 'hero_shiv'],
  );
  assert.equal(summary.text, 'ALL EXCEPT — Bebop, Haze +2');
});

test('emptied All Except list becomes all but the picker stays in except mode', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openPresetsForm(fixture);

  const all = panel(fixture, 'HPColorsCurrentScopeAll');
  const except = panel(fixture, 'HPColorsCurrentScopeExcept');
  const dialog = panel(fixture, 'HPColorsScopeDialog');
  const haze = scopeOption(fixture, 'hero_haze');
  const shiv = scopeOption(fixture, 'hero_shiv');

  except.events.onactivate();
  haze.events.onactivate();
  assert.equal(currentScope(fixture).mode, 'except');

  haze.events.onactivate();
  let current = currentScope(fixture);
  assert.equal(current.mode, 'all');
  assert.deepEqual(current.heroes, []);
  assert.equal(all.BHasClass('Selected'), true);
  assert.equal(haze.BHasClass('Skipped'), false);
  assert.equal(dialog.BHasClass('Open'), true);

  shiv.events.onactivate();
  current = currentScope(fixture);
  assert.equal(current.mode, 'except');
  assert.deepEqual(current.heroes, ['hero_shiv']);
  assert.equal(shiv.BHasClass('Skipped'), true);
  assert.equal(shiv.BHasClass('Selected'), false);
});

test('closing the scope dialog returns focus to the button that opened it', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openPresetsForm(fixture);

  const selected = panel(fixture, 'HPColorsCurrentScopeSelected');
  const except = panel(fixture, 'HPColorsCurrentScopeExcept');
  const close = panel(fixture, 'HPColorsScopeCloseButton');

  selected.focused = false;
  except.focused = false;
  except.events.onactivate();
  close.events.onactivate();
  assert.equal(except.focused, true);
  assert.equal(selected.focused, false);

  selected.focused = false;
  except.focused = false;
  selected.events.onactivate();
  close.events.onactivate();
  assert.equal(selected.focused, true);
  assert.equal(except.focused, false);
});

test('library rows show HEROES summaries for All Except presets', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Skip Some',
        mode: 'except',
        heroes: ['hero_haze', 'hero_shiv'],
        values: { enemyLow: '#222222' },
        conditions: null,
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'Skip Many',
        mode: 'except',
        heroes: ['hero_bebop', 'hero_haze', 'hero_kelvin', 'hero_shiv'],
        values: { enemyLow: '#333333' },
        conditions: null,
      },
    ],
  });
  openPresetsForm(fixture);

  const scopeText = (id) => presetOption(fixture, id)
    .FindChildrenWithClassTraverse('HPColorsPresetOptionScope')[0].text;
  assert.equal(scopeText('user_0001'), 'ALL EXCEPT — Haze, Shiv');
  assert.equal(scopeText('user_0002'), 'ALL EXCEPT — Bebop, Haze +2');
});

test('stale settings clipboard callbacks cannot import into a reopened dialog', () => {
  const fixture = bootMenu(
    { version: 1, values: { widthScale: 100 }, scopes: [] },
    { harnessOptions: { clipboardText: '' } },
  );
  openEditor(fixture);
  panel(fixture, 'HPColorsTransferButton').events.onactivate();
  panel(fixture, 'HPColorsTransferImportButton').events.onactivate();
  panel(fixture, 'HPColorsTransferCloseButton').events.onactivate();
  panel(fixture, 'HPColorsTransferButton').events.onactivate();
  panel(fixture, 'HPColorsTransferInput').text = 'HPCR2[[1,120]]';

  fixture.harness.scheduler.runByDelay(0.05);

  assert.equal(readMenuState(fixture).values.widthScale, 100);
  assert.equal(
    panel(fixture, 'HPColorsTransferFeedback').text,
    'READY — CHOOSE COPY CURRENT OR IMPORT & APPLY',
  );
});

test('stale preset clipboard callbacks cannot affect a reopened dialog', () => {
  const fixture = bootMenu(
    { version: 1, values: {}, scopes: [] },
    { harnessOptions: { clipboardText: '' } },
  );
  openEditor(fixture);
  panel(fixture, 'HPColorsPresetImportButton').events.onactivate();
  panel(fixture, 'HPColorsPresetTransferConfirmButton').events.onactivate();
  panel(fixture, 'HPColorsPresetTransferCloseButton').events.onactivate();
  panel(fixture, 'HPColorsPresetImportButton').events.onactivate();
  panel(fixture, 'HPColorsPresetTransferInput').text = 'invalid';

  fixture.harness.scheduler.runByDelay(0.05);

  assert.equal(
    panel(fixture, 'HPColorsPresetTransferFeedback').text,
    'PASTE A PRESET CODE.',
  );
});

test('Preset Library keeps create separate and exposes the new restore flow', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Shiv Colors',
        mode: 'all',
        heroes: [],
        values: { enemyLow: '#222222' },
        conditions: null,
      },
    ],
  });
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryPresets').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();

  assert.equal(
    panel(fixture, 'HPColorsPageDescription').text,
    'Save your settings as presets. Choose HEROES to load them automatically.',
  );
  assert.equal(
    presetOption(fixture, 'baked_default')
      .FindChildrenWithClassTraverse('HPColorsPresetOptionName')[0].text,
    'Rewrite Default  ·  BUILT-IN',
  );

  const beforeConfig = readConfig(fixture);
  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  assert.equal(
    panel(fixture, 'HPColorsPresetSaveMode').text,
    'NEW PRESET',
  );
  assert.equal(
    panel(fixture, 'HPColorsPresetFeedback').text,
    'Name your preset, then choose HEROES.',
  );
  panel(fixture, 'HPColorsPresetNameInput').text = 'Fresh Snapshot';
  panel(fixture, 'HPColorsPresetSaveButton').events.onactivate();
  assert.deepEqual(readConfig(fixture), beforeConfig);
  assert.ok(
    readMenuState(fixture).userPresets.some(
      (preset) => preset.name === 'Fresh Snapshot',
    ),
  );
  assert.equal(panel(fixture, 'HPColorsPresetHiddenRow').BHasClass('Visible'), true);
  panel(fixture, 'HPColorsPresetRestoreBakedButton').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetHiddenRow').BHasClass('Visible'), false);
  assert.equal(
    panel(fixture, 'HPColorsPresetFeedback').text,
    'REWRITE DEFAULT SHOWN. YOUR SETTINGS DID NOT CHANGE.',
  );

  const editButton = presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit');
  editButton.events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
  assert.equal(
    panel(fixture, 'HPColorsPresetSaveButtonLabel').text,
    'SAVE',
  );
  assert.equal(
    panel(fixture, 'HPColorsPresetFeedback').text,
    'EDITING SHIV COLORS. SAVE updates this preset.',
  );
  panel(fixture, 'HPColorsPresetCancelEditButton').events.onactivate();
  assert.equal(
    panel(fixture, 'HPColorsPresetFeedback').text,
    'CLOSED.',
  );
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
});

test('editor close clears replace and delete confirmation transients', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#654321' },
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Session preset',
        mode: 'all',
        heroes: [],
        values: { enemyLow: '#123456' },
        conditions: null,
      },
    ],
  });
  openEditor(fixture);

  // Nothing saved matches the screen, so a row click asks first.
  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), true);
  assert.equal(
    presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowConfirmMessage').text,
    'DISCARD UNSAVED CHANGES?',
  );

  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  openEditor(fixture);
  let option = presetOption(fixture, 'user_0001');
  assert.equal(option.BHasClass('Confirming'), false);
  assert.equal(readConfig(fixture).values.enemyLow, '#654321');
  assert.ok(option.FindChildrenWithClassTraverse('HPColorsPresetOptionMain')[0]);

  option.FindChildrenWithClassTraverse('HPColorsPresetRowDelete')[0]
    .events.onactivate();
  assert.equal(
    presetOption(fixture, 'user_0001').BHasClass('Confirming'),
    true,
  );

  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  openEditor(fixture);
  assert.equal(
    presetOption(fixture, 'user_0001').BHasClass('Confirming'),
    false,
  );
});

test('menu boot can retry after a required panel appears', () => {
  const fixture = bootMenu(
    { version: 1, values: {}, scopes: [] },
    {
      beforeBoot(harness) {
        harness.root.FindChildTraverse('HPColorsDoneButton').DeleteAsync();
      },
    },
  );
  assert.equal(
    typeof panel(fixture, 'HPColorsMenuButton').events.onactivate,
    'undefined',
  );

  fixture.harness.root.add(new MockPanel('HPColorsDoneButton', {
    findCounts: fixture.harness.findCounts,
    childReadCounts: fixture.harness.childReadCounts,
  }));
  fixture.harness.$.HPColorsMenuBoot();

  assert.equal(
    typeof panel(fixture, 'HPColorsMenuButton').events.onactivate,
    'function',
  );
});

test('retired builder layout without the fifth rail button still shows its warning', () => {
  const fixture = bootMenu(
    { version: 1, values: {}, scopes: [] },
    {
      beforeBoot(harness) {
        harness.root
          .FindChildTraverse('HPColorsCategoryPresets')
          .DeleteAsync();
        harness.root.FindChildTraverse('HPColorsV2Store').DeleteAsync();
      },
    },
  );

  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'UPDATE PRESET FILE');
  openEditor(fixture);
  selectEnemyBar(fixture);
});

test('menu boot can retry after a transient CreatePanel failure', () => {
  const fixture = bootMenu(
    { version: 1, values: {}, scopes: [] },
    {
      beforeBoot(harness) {
        const createPanel = harness.$.CreatePanel;
        let failed = false;
        harness.$.CreatePanel = (type, parent, id) => {
          if (!failed && id === 'HPColorsScopeHeroOption3') {
            failed = true;
            return null;
          }
          return createPanel(type, parent, id);
        };
      },
    },
  );
  openEditor(fixture);
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsMenuButton').BHasClass('Loading'), true);

  fixture.harness.$.HPColorsMenuBoot();

  assert.equal(
    typeof panel(fixture, 'HPColorsMenuButton').events.onactivate,
    'function',
  );
  openEditor(fixture);
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), true);
  assert.equal(panel(fixture, 'HPColorsMenuButton').BHasClass('Loading'), false);
});

test('menu boot contains thrown panel creation errors and an explicit retry recovers', () => {
  const fixture = bootMenu(
    { version: 1, values: { enemyLow: '#123456' }, scopes: [] },
    {
      beforeBoot(harness) {
        const createPanel = harness.$.CreatePanel;
        let failed = false;
        harness.$.CreatePanel = (type, parent, id) => {
          if (!failed && id === 'HPColorsScopeHeroOption3') {
            failed = true;
            throw new Error('panel creation unavailable');
          }
          return createPanel(type, parent, id);
        };
      },
    },
  );
  assert.equal(configDispatches(fixture).length, 0);
  fixture.harness.$.HPColorsMenuBoot();
  openEditor(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#123456');

  const snapshot = fixture.harness.root.GetAttributeString(CONFIG_ATTR, '');
  const dispatchCount = configDispatches(fixture).length;
  const pendingJobs = fixture.harness.scheduler.jobs.length;
  fixture.harness.$.HPColorsMenuBoot();
  assert.equal(fixture.harness.root.GetAttributeString(CONFIG_ATTR, ''), snapshot);
  assert.equal(configDispatches(fixture).length, dispatchCount);
  assert.equal(fixture.harness.scheduler.jobs.length, pendingJobs);
});

test('color picker closes from its backdrop and condition swatches accept clicks', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(fixture);
  panel(fixture, 'HPColorsEnemyLowSwatch').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), true);
  assert.equal(
    typeof panel(fixture, 'HPColorsPickerBackdrop').events.onactivate,
    'function',
  );

  panel(fixture, 'HPColorsPickerBackdrop').events.onactivate();

  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), false);
  assert.equal(
    typeof panel(fixture, 'HPColorsConditionColorSwatch').events.onactivate,
    'function',
  );
});

test('native 6722 readout retires the pip-derived manual config workflow', () => {
  const fixture = bootMenu({ version: 1, values: { precisePipsEnabled: true }, scopes: [] });
  openEditor(fixture);
  assert.equal(fixture.harness.root.FindChildTraverse('HPColorsPrecisePipsToggle'), null);
  assert.equal(fixture.harness.root.FindChildTraverse('HPColorsPrecisePipsDialog'), null);
  assert.equal(readConfig(fixture).values.precisePipsEnabled, true, 'legacy wire value remains compatible');
});

test('sync contains panel API failures and keeps control events enabled', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  const undoButton = panel(fixture, 'HPColorsUndoButton');
  Object.defineProperty(undoButton, 'enabled', {
    configurable: true,
    get: () => false,
    set: () => {
      throw new Error('simulated panel failure');
    },
  });

  assert.doesNotThrow(() => openEditor(fixture));
  Object.defineProperty(undoButton, 'enabled', {
    configurable: true,
    writable: true,
    value: false,
  });
  panel(fixture, 'HPColorsMasterToggle').events.onactivate();

  assert.equal(readMenuState(fixture).values.enabled, false);
});

test('effect pages live under their healthbar categories', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
    scopes: [],
  });
  openEditor(fixture);

  assert.equal(
    fixture.harness.root.FindChildTraverse('HPColorsCategoryEffects'),
    null,
  );

  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab3').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ENEMY PULSE');
  panel(fixture, 'HPColorsTab4').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ENEMY KILL MARKER');

  panel(fixture, 'HPColorsCategoryAlly').events.onactivate();
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ALLY HP TEXT');
  panel(fixture, 'HPColorsTab3').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ALLY PULSE');
  assert.equal(panel(fixture, 'HPColorsTab4').BHasClass('Available'), false);
  assert.equal(panel(fixture, 'HPColorsTab5').BHasClass('Available'), false);

  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();
  assert.equal(
    panel(fixture, 'HPColorsPageTitle').text,
    'HEALTH PIPS & PLAYER LEVEL',
  );
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ENEMY PLAYER STAMINA');
});

test('every setting key has one tab owner and its controls live in that XML page', () => {
  const categories = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_DEFS');
  const toggles = extractArrayDeclaration(canonicalMenuSource, 'TOGGLE_CONTROLS');
  const modes = extractArrayDeclaration(canonicalMenuSource, 'MODE_CONTROLS');
  const sliders = extractArrayDeclaration(canonicalMenuSource, 'SLIDER_CONTROLS');
  const colors = extractArrayDeclaration(canonicalMenuSource, 'COLOR_CONTROLS');
  const defaultKeys = Object.keys(readConfig(bootMenu()).values)
    .filter(key => key !== 'precisePipsEnabled').sort();
  const keyOwners = new Map();
  const controlIdsByKey = new Map();

  function addControl(key, id) {
    if (!controlIdsByKey.has(key)) controlIdsByKey.set(key, []);
    controlIdsByKey.get(key).push(id);
  }
  for (const toggle of toggles) addControl(toggle.key, toggle.id);
  for (const mode of modes) addControl(mode.key, mode.id);
  for (const slider of sliders) {
    addControl(slider.key, `${slider.base}SliderHost`);
    addControl(slider.key, `${slider.base}Entry`);
  }
  for (const color of colors) {
    addControl(color.key, `${color.base}Swatch`);
    addControl(color.key, `${color.base}Hex`);
  }

  const pageAncestry = panelAncestryById(layoutSource);
  const tabs = categories.flatMap((category) => category.tabs);
  assert.deepEqual(
    [...categories].map((category) => category.name),
    ['GENERAL', 'ENEMY', 'ALLY', 'INDICATORS', 'PRESETS', 'UNITS'],
  );
  for (const category of categories)
    assert.ok(category.tabs.length <= 6, `${category.name} must fit six tab slots`);

  // CATEGORY_DEFS and control maps come from canonical source; layoutSource may be a lane layout.
  for (const tab of tabs) {
    assert.ok(pageAncestry.has(tab.pageId), `missing page ${tab.pageId}`);
    assert.equal(pageAncestry.get(tab.pageId).at(-1), 'HPColorsSettingsList', `${tab.pageId} must be a direct settings page`);
    for (const key of tab.keys) {
      if (!keyOwners.has(key)) keyOwners.set(key, []);
      keyOwners.get(key).push(tab);
    }
  }

  assert.deepEqual([...keyOwners.keys()].sort(), defaultKeys);
  for (const key of defaultKeys) {
    const owners = keyOwners.get(key);
    assert.equal(owners.length, 1, `${key} must belong to exactly one tab`);
    const controlIds = controlIdsByKey.get(key);
    assert.ok(controlIds && controlIds.length, `${key} must have controls`);
    for (const controlId of controlIds) {
      const ancestors = pageAncestry.get(controlId);
      assert.ok(ancestors, `missing XML control ${controlId} for ${key}`);
      assert.ok(
        ancestors.includes(owners[0].pageId),
        `${controlId} for ${key} must be inside ${owners[0].pageId}`,
      );
    }
  }
});


test('Presets page hides Reset Section but keeps Undo reachable', () => {
  const fixture = bootMenu({
    version: 1,
    values: changedEnemyValues(),
    scopes: [],
  });
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryPresets').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();

  const reset = panel(fixture, 'HPColorsResetSectionButton');
  const undo = panel(fixture, 'HPColorsUndoButton');
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'PRESET LIBRARY');
  assert.equal(reset.enabled, false);
  assert.equal(reset.BHasClass('Disabled'), true);
  assert.equal(reset.BHasClass('HPColorsFooterActionHidden'), true);
  assert.equal(undo.BHasClass('HPColorsFooterActionHidden'), false);
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

test('Escape at the menu root delegates through the native resume event', () => {
  const fixture = bootMenu({
    version: 1,
    values: changedEnemyValues(),
    scopes: [],
  });
  const nativeResumeFallback = 'if (!$.HPColorsMenuCancel()) $.DispatchEvent(&apos;CitadelResumePlaying&apos;, $.GetContextPanel())';

  assert.equal(harnessCancel(fixture), false);
  assert.equal(layoutSource.split(nativeResumeFallback).length - 1, 3);
  assert.doesNotMatch(layoutSource, /CitadelResumePlaying\(\)/);
});

function harnessCancel(fixture) {
  assert.equal(typeof fixture.harness.$.HPColorsMenuCancel, 'function');
  return fixture.harness.$.HPColorsMenuCancel();
}

test('stale reset feedback callback cannot overwrite the save status after editor close', () => {
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
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, STATUS_WITHOUT_STORE);

  fixture.harness.scheduler.runByDelay(1.25);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, STATUS_WITHOUT_STORE);
});

test('entering the hideout shows HIDEOUT and drops the hero route to the all-heroes preset', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Haze',
        mode: 'selected',
        heroes: ['hero_haze'],
        values: { enemyLow: '#222222' },
        conditions: null,
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'All Heroes',
        mode: 'all',
        heroes: [],
        values: { enemyLow: '#333333' },
        conditions: null,
      },
    ],
  }, { heroName: 'HAZE' });
  settleHeroRoute(fixture, '#222222');
  openEditor(fixture);

  fixture.identityTree.hud.AddClass('connectedToHideout');
  settleHeroRoute(fixture, '#333333');
  assert.equal(panel(fixture, 'HPColorsHeroIdentity').text, 'NO HERO DETECTED · HIDEOUT');
});

const LAYERED_ALL_SCOPE_HELP =
  'HEROES chooses when this preset loads automatically. See HOW PRESETS WORK for switching rules.';
const LAYERED_HERO_SCOPE_HELP =
  'HEROES chooses when this preset loads automatically. See HOW PRESETS WORK for switching rules.';

function layeredMenuState(extraAll = {}, extraHero = {}) {
  return {
    version: 1,
    values: Object.assign({ enemyLow: '#111111', enemyMid: '#444444' }, extraAll),
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Everyone',
        mode: 'all',
        heroes: [],
        values: Object.assign({ enemyLow: '#111111', enemyMid: '#444444' }, extraAll),
        conditions: null,
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'Shiv Only',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: Object.assign({ enemyLow: '#222222', enemyMid: '#444444' }, extraHero),
        own: ['enemyLow'].concat(Object.keys(extraHero)),
        conditions: null,
      },
    ],
  };
}

function installLayeredLayout(harness) {
  if (!harness.root.FindChildTraverse('HPColorsPresetScopeHelp')) {
    const help = new MockPanel('', {
      type: 'Label',
      classes: ['HPColorsPresetScopeHelp'],
      text: LAYERED_ALL_SCOPE_HELP,
    });
    help.SetParent(harness.root);
  }
}

function bootLayeredMenu(heroName, menuState = layeredMenuState()) {
  const fixture = bootMenu(menuState, {
    heroName,
    beforeBoot: (harness) => installLayeredLayout(harness),
  });
  settleHeroRoute(fixture, heroName === 'SHIV' ? '#222222' : '#111111');
  return fixture;
}

function scopeHelp(fixture) {
  const byId = fixture.harness.root.FindChildTraverse('HPColorsPresetScopeHelp');
  if (byId) return byId;
  const found = fixture.harness.root.FindChildrenWithClassTraverse('HPColorsPresetScopeHelp');
  assert.equal(found.length, 1, 'expected one scope help label');
  return found[0];
}

test('Layered presets scope help explains what a hero preset saves', () => {
  const hero = bootLayeredMenu('SHIV');
  openPresetsForm(hero);
  assert.equal(scopeHelp(hero).text, LAYERED_HERO_SCOPE_HELP);

  const all = bootLayeredMenu('HAZE');
  openPresetsForm(all);
  assert.equal(scopeHelp(all).text, LAYERED_ALL_SCOPE_HELP);
});

test('Layered presets EDIT on a hero preset loads it and explains the layered save', () => {
  const fixture = bootLayeredMenu('HAZE');
  openPresetsForm(fixture);
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowEdit').events.onactivate();
  assert.equal(
    panel(fixture, 'HPColorsPresetFeedback').text,
    'EDITING SHIV ONLY. SAVE updates this preset.',
  );
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
  assert.equal(currentScope(fixture).mode, 'selected');
  assert.deepEqual(currentScope(fixture).heroes, ['hero_shiv']);
  assert.equal(panel(fixture, 'HPColorsCurrentScopeSummary').text, 'ONLY THESE — Shiv');
  assert.equal(panel(fixture, 'HPColorsPresetSaveButtonLabel').text, 'SAVE');
});

test('Layered presets reset confirmation names the All Heroes settings', () => {
  const fixture = bootLayeredMenu('SHIV');
  openEditor(fixture);
  selectEnemyBar(fixture);
  requestReset(fixture);
  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), true);
  assert.equal(
    panel(fixture, 'HPColorsResetDialogMessage').text,
    'This section goes back to your All Heroes settings.',
  );
});

function twoPresetState(values = {}) {
  return {
    version: 1,
    values,
    scopes: [],
    userPresets: [
      {
        id: 'user_0001',
        kind: 'user',
        name: 'Shiv Colors',
        mode: 'all',
        heroes: [],
        values: { enemyLow: '#222222' },
        conditions: null,
      },
      {
        id: 'user_0002',
        kind: 'user',
        name: 'Second',
        mode: 'all',
        heroes: [],
        values: { enemyLow: '#333333' },
        conditions: null,
      },
    ],
  };
}

test('preset row body applies while its buttons never do', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  const before = readConfig(fixture).values.enemyLow;

  // No whole-row handler and no APPLY button remain.
  assert.equal(presetOption(fixture, 'user_0001').events.onactivate, undefined);
  assert.equal(presetRowHas(fixture, 'user_0001', 'HPColorsPresetRowApply'), false);
  assert.equal(presetRowHas(fixture, 'user_0001', 'HPColorsPresetRowEdit'), true);
  assert.equal(presetRowHas(fixture, 'baked_default', 'HPColorsPresetRowEdit'), false);
  assert.equal(
    presetRowControl(fixture, 'baked_default', 'HPColorsPresetRowDelete').Children()[0].text,
    'HIDE',
  );
  assert.equal(presetOption(fixture, 'baked_default').BHasClass('Active'), true);

  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowCopy').events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, before);
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Active'), false);
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowDelete').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), true);
  assert.equal(readConfig(fixture).values.enemyLow, before);
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowCancel').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), false);

  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
  assert.equal(presetFeedback(fixture), 'APPLIED SHIV COLORS.');
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Active'), true);
  assert.equal(
    presetRowControl(fixture, 'user_0001', 'HPColorsPresetOptionStatus').text,
    'ACTIVE',
  );
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);

  // UNDO is reachable on this page and reverts the apply.
  const undo = panel(fixture, 'HPColorsUndoButton');
  assert.equal(undo.BHasClass('HPColorsFooterActionHidden'), false);
  assert.equal(undo.enabled, true);
  undo.events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, before);
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Active'), false);
});

function rowStatus(fixture, presetId) {
  return {
    active: presetOption(fixture, presetId).BHasClass('Active'),
    text: presetRowControl(fixture, presetId, 'HPColorsPresetOptionStatus').text,
  };
}

function setWidthWithoutGesture(fixture, value) {
  const slider = panel(fixture, 'HPColorsWidthSlider');
  slider.value = value;
  slider.events.onvaluechanged();
  assert.equal(readConfig(fixture).values.widthScale, value);
}

function dragWidth(fixture, value) {
  const slider = panel(fixture, 'HPColorsWidthSlider');
  slider.events.onmousedown();
  slider.value = value;
  slider.events.onvaluechanged();
  slider.events.onmouseup();
  assert.equal(readConfig(fixture).values.widthScale, value);
}

function leaveAndReturnToPresets(fixture) {
  selectEnemyBar(fixture);
  panel(fixture, 'HPColorsCategoryPresets').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();
}

// Round 4 / T4: the tester saw a row stay ACTIVE while changing settings.
// The state already stopped matching; only the badge was stale because the
// live-edit paths never refreshed it. Drive the real menu, not the state.
test('ACTIVE badge leaves on a live edit without EDIT and returns on Undo', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: true, text: 'ACTIVE' });

  setWidthWithoutGesture(fixture, 150);
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: false, text: 'CHANGED' });
  assert.equal(readMenuState(fixture).scopes[0].sourcePresetId, 'user_0001');

  leaveAndReturnToPresets(fixture);
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: false, text: 'CHANGED' });

  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.widthScale, 100);
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: true, text: 'ACTIVE' });

  // A completed slider drag is the other live-edit path.
  dragWidth(fixture, 160);
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: false, text: 'CHANGED' });
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: true, text: 'ACTIVE' });
});

test('ACTIVE badge leaves when a hero preset inherited value changes', () => {
  const fixture = bootLayeredMenu('SHIV');
  openPresetsForm(fixture);
  // Routing applied Shiv Only; widthScale is inherited from Everyone, not own.
  assert.deepEqual(rowStatus(fixture, 'user_0002'), { active: true, text: 'ACTIVE' });
  assert.equal(readConfig(fixture).values.widthScale, 100);

  setWidthWithoutGesture(fixture, 170);
  assert.deepEqual(rowStatus(fixture, 'user_0002'), { active: false, text: 'CHANGED' });
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: false, text: '' });

  leaveAndReturnToPresets(fixture);
  assert.deepEqual(rowStatus(fixture, 'user_0002'), { active: false, text: 'CHANGED' });
  // The stale badge used to contradict this prompt; both now agree.
  presetRowMain(fixture, 'user_0002').events.onactivate();
  assert.equal(presetFeedback(fixture), 'DISCARD UNSAVED CHANGES?');
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowCancel').events.onactivate();

  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.widthScale, 100);
  assert.deepEqual(rowStatus(fixture, 'user_0002'), { active: true, text: 'ACTIVE' });
});

test('badge refresh keeps the typed name and EDITING marker while the form is open', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: true, text: 'EDITING' });
  const nameInput = panel(fixture, 'HPColorsPresetNameInput');
  nameInput.text = 'Renamed Live';
  const rowBefore = presetOption(fixture, 'user_0001');

  setWidthWithoutGesture(fixture, 150);
  assert.equal(nameInput.text, 'Renamed Live');
  assert.equal(presetOption(fixture, 'user_0001'), rowBefore, 'rows are not rebuilt on a live edit');
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: false, text: 'EDITING' });

  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: true, text: 'EDITING' });
  assert.equal(nameInput.text, 'Renamed Live');
});

test('the row being edited ignores body clicks and hides EDIT', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);

  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), true);
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
  const row = presetOption(fixture, 'user_0001');
  assert.equal(row.BHasClass('Editing'), true);
  assert.equal(row.BHasClass('Active'), true);
  assert.equal(
    presetRowControl(fixture, 'user_0001', 'HPColorsPresetOptionStatus').text,
    'EDITING',
  );
  assert.equal(presetRowHas(fixture, 'user_0001', 'HPColorsPresetRowEdit'), false);
  assert.equal(presetRowHas(fixture, 'user_0001', 'HPColorsPresetRowUp'), true);

  panel(fixture, 'HPColorsPresetNameInput').text = 'Renamed';
  const dispatchesBefore = configDispatches(fixture).length;
  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), true);
  assert.equal(panel(fixture, 'HPColorsPresetNameInput').text, 'Renamed');
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), false);
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Editing'), true);
  assert.equal(configDispatches(fixture).length, dispatchesBefore);

  panel(fixture, 'HPColorsPresetSaveButton').events.onactivate();
  assert.equal(presetFeedback(fixture), 'SAVED RENAMED.');
  assert.equal(
    readMenuState(fixture).userPresets.find((preset) => preset.id === 'user_0001').name,
    'Renamed',
  );
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
});

test('EDIT loads the target scope so saving an All Heroes preset keeps it All Heroes', () => {
  const fixture = bootLayeredMenu('SHIV');
  openPresetsForm(fixture);
  assert.equal(currentScope(fixture).mode, 'selected');
  assert.equal(presetOption(fixture, 'user_0002').BHasClass('Active'), true);

  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  assert.equal(currentScope(fixture).mode, 'all');
  assert.deepEqual(currentScope(fixture).heroes, []);
  assert.equal(readConfig(fixture).values.enemyLow, '#111111');
  assert.equal(panel(fixture, 'HPColorsCurrentScopeSummary').text, 'ALL HEROES');
  assert.equal(panel(fixture, 'HPColorsPresetSaveButtonLabel').text, 'SAVE');
  assert.equal(panel(fixture, 'HPColorsPresetNameInput').text, 'Everyone');

  panel(fixture, 'HPColorsPresetSaveButton').events.onactivate();
  assert.equal(presetFeedback(fixture), 'SAVED EVERYONE.');
  const saved = readMenuState(fixture).userPresets.find((preset) => preset.id === 'user_0001');
  assert.equal(saved.mode, 'all');
  assert.deepEqual(saved.heroes, []);
});

test('unsaved screen changes ask before a row click or EDIT replaces them', () => {
  const fixture = bootMenu(twoPresetState({ enemyLow: '#999999' }));
  openPresetsForm(fixture);
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Active'), false);
  assert.equal(presetOption(fixture, 'baked_default').BHasClass('Active'), false);

  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), true);
  assert.equal(
    presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowConfirmMessage').text,
    'DISCARD UNSAVED CHANGES?',
  );
  assert.equal(readConfig(fixture).values.enemyLow, '#999999');
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);

  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowCancel').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), false);
  assert.ok(presetRowMain(fixture, 'user_0001'));
  assert.equal(readConfig(fixture).values.enemyLow, '#999999');
  assert.equal(presetFeedback(fixture), 'KEPT YOUR CHANGES.');

  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), true);
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowConfirm').events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), true);
  assert.equal(panel(fixture, 'HPColorsPresetSaveMode').text, 'EDITING SHIV COLORS');
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Editing'), true);

  // The confirmed row now matches the screen, so a second row click applies at once.
  presetRowMain(fixture, 'user_0002').events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, '#333333');
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
});

test('an unsaved name in the form asks before another row replaces it', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  panel(fixture, 'HPColorsPresetNameInput').text = 'Shiv Colors v2';

  presetRowMain(fixture, 'user_0002').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0002').BHasClass('Confirming'), true);
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), true);
  assert.equal(panel(fixture, 'HPColorsPresetNameInput').text, 'Shiv Colors v2');
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowCancel').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetNameInput').text, 'Shiv Colors v2');

  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowEdit').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0002').BHasClass('Confirming'), true);
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowConfirm').events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, '#333333');
  assert.equal(panel(fixture, 'HPColorsPresetSaveMode').text, 'EDITING SECOND');
  assert.equal(panel(fixture, 'HPColorsPresetNameInput').text, 'Second');
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Editing'), false);
  assert.equal(presetOption(fixture, 'user_0002').BHasClass('Editing'), true);

  // SAVE now targets the retargeted row, never the previous one.
  panel(fixture, 'HPColorsPresetSaveButton').events.onactivate();
  const presets = readMenuState(fixture).userPresets;
  assert.equal(presets.find((preset) => preset.id === 'user_0001').name, 'Shiv Colors');
  assert.equal(presets.find((preset) => preset.id === 'user_0002').values.enemyLow, '#333333');

  // A typed name on a new preset is protected the same way.
  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  panel(fixture, 'HPColorsPresetNameInput').text = 'Draft';
  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), true);
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowCancel').events.onactivate();
  panel(fixture, 'HPColorsPresetNameInput').text = '';
  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, '#222222');
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
});

test('changing HEROES while editing shows the old and new selection and a SAVE AS label', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  const summary = panel(fixture, 'HPColorsCurrentScopeSummary');
  const label = panel(fixture, 'HPColorsPresetSaveButtonLabel');
  assert.equal(summary.text, 'ALL HEROES');
  assert.equal(label.text, 'SAVE');

  panel(fixture, 'HPColorsCurrentScopeSelected').events.onactivate();
  scopeOption(fixture, 'hero_haze').events.onactivate();
  assert.equal(summary.text, 'ALL HEROES → ONLY THESE — Haze');
  assert.equal(label.text, 'SAVE AS ONLY THESE');
  panel(fixture, 'HPColorsScopeCloseButton').events.onactivate();

  panel(fixture, 'HPColorsCurrentScopeAll').events.onactivate();
  assert.equal(summary.text, 'ALL HEROES');
  assert.equal(label.text, 'SAVE');

  panel(fixture, 'HPColorsCurrentScopeExcept').events.onactivate();
  scopeOption(fixture, 'hero_haze').events.onactivate();
  assert.equal(summary.text, 'ALL HEROES → ALL EXCEPT — Haze');
  assert.equal(label.text, 'SAVE AS ALL EXCEPT');
  panel(fixture, 'HPColorsScopeCloseButton').events.onactivate();

  panel(fixture, 'HPColorsPresetSaveButton').events.onactivate();
  assert.equal(presetFeedback(fixture), 'SAVED SHIV COLORS.');
  const saved = readMenuState(fixture).userPresets.find((preset) => preset.id === 'user_0001');
  assert.equal(saved.mode, 'except');
  assert.deepEqual(saved.heroes, ['hero_haze']);
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
});

test('preset guide and library hint describe the click-to-apply flow', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openPresetsForm(fixture);
  const guide = panel(fixture, 'HPColorsPresetGuideText').text.split('\n\n');
  assert.deepEqual(guide, [
    "- Click a preset to use it. To update it, change any setting, then press SAVE on its row. NEW PRESET saves your settings as a new preset.",
    "- ACTIVE: your settings match this preset. CHANGED: you edited it. SAVE keeps the changes. REVERT throws them away.",
    "- HEROES picks when a preset loads by itself. ONLY THESE: just the heroes you pick. ALL EXCEPT: every hero except those.",
    "- Hero presets only store what you changed. Everything else comes from your top ALL HEROES preset, or Rewrite Default if you have none. Ability conditions are saved in each preset.",
    "- When you switch heroes, the mod picks the highest match:\n1. An ONLY THESE preset for that hero.\n2. Otherwise, an ALL EXCEPT preset that doesn't skip that hero.\n3. Otherwise, your top ALL HEROES preset.\nIf changing characters does not change your preset, your unsaved edits stay.",
    "- Higher in the list wins. Switching heroes can replace changes you haven't saved. No ALL HEROES preset? Leaving an ONLY THESE or ALL EXCEPT preset with no match goes back to Rewrite Default.",
  ]);
  assert.match(
    layoutSource,
    /text="Click a preset to use it\. EDIT changes its name or HEROES\." class="HPColorsPresetLibraryHint"/,
  );
  assert.match(
    layoutSource,
    /id="HPColorsPresetCancelEditButton"[^>]*><Label text="CLOSE" \/>/,
  );
  assert.doesNotMatch(menuSource, /InlinePresetRename|presetInlineRename/);
  assert.doesNotMatch(menuStyleSource, /HPColorsPresetOptionName\.Editable|HPColorsPresetRowApply/);
  assert.match(menuStyleSource, /\.HPColorsPresetOption\.Active \{/);
  assert.match(menuStyleSource, /\.HPColorsPresetOption\.Editing \{/);
});

const LANE_LAYOUT_SOURCES = [
  ['rewrite_v2', layoutSource],
  ...['hp_colors_rewrite_v2_qollock', 'hp_colors_rewrite_v2_thirdeye'].map((lane) => [
    lane,
    fs.readFileSync(
      path.resolve(__dirname, '..', lane, 'panorama/layout/hud_escape_menu.xml'),
      'utf8',
    ),
  ]),
];

test('hero identity sits under the page description, outside the scroll list, in every layout', () => {
  for (const [lane, source] of LANE_LAYOUT_SOURCES) {
    // Lane layouts embed the stock escape menu, which repeats stock ids.
    const ancestry = panelAncestryById(source, { allowDuplicates: true });
    const identity = ancestry.get('HPColorsHeroIdentity');
    assert.ok(identity, `${lane}: identity label present`);
    assert.deepEqual(
      identity,
      ancestry.get('HPColorsSettingsList'),
      `${lane}: identity is a sibling of the settings list`,
    );
    assert.deepEqual(identity, ancestry.get('HPColorsPageDescription'), `${lane}: sibling of description`);
    assert.ok(!identity.includes('HPColorsSettingsList'), `${lane}: identity is not inside the scroller`);
    const order = ['HPColorsPageDescription', 'HPColorsHeroIdentity', 'HPColorsSettingsList'].map(
      (id) => source.indexOf(`id="${id}"`),
    );
    assert.ok(order[0] < order[1] && order[1] < order[2], `${lane}: description → identity → list`);
    assert.equal(
      (source.match(/id="HPColorsHeroIdentity"/g) || []).length,
      1,
      `${lane}: exactly one identity id`,
    );
    assert.match(
      source,
      /<Label text="REWRITE DEFAULT IS HIDDEN" class="HPColorsPresetHiddenMessage" \/>/,
      `${lane}: hidden-default message`,
    );
    assert.match(
      source,
      /id="HPColorsPresetRestoreBakedButton"[^>]*><Label text="SHOW PRESET" \/>/,
      `${lane}: show-row button`,
    );
    assert.match(
      source,
      /id="HPColorsDoneButton"[^>]*><Label text="EXIT" \/>/,
      `${lane}: footer EXIT`,
    );
    assert.match(
      source,
      /id="HPColorsPresetScopeHelp" text="HEROES chooses when this preset loads automatically\. See HOW PRESETS WORK for switching rules\."/,
      `${lane}: default scope help`,
    );
  }
  assert.match(menuStyleSource, /\.HPColorsPresetHeroValue \{[^}]*visibility: collapse;/);
  assert.match(menuStyleSource, /\.HPColorsPresetHeroValue\.Active \{\s*visibility: visible;/);
});

test('hero identity shows only on PRESETS and follows page changes without a hero change', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(fixture);
  const identity = panel(fixture, 'HPColorsHeroIdentity');
  assert.equal(identity.BHasClass('Active'), false);
  panel(fixture, 'HPColorsCategoryPresets').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();
  assert.equal(identity.BHasClass('Active'), true);
  const identityText = identity.text;
  assert.match(identityText, /^NO HERO DETECTED/);
  selectEnemyBar(fixture);
  assert.equal(identity.BHasClass('Active'), false);
  assert.equal(identity.text, identityText);
  panel(fixture, 'HPColorsCategoryOverview').events.onactivate();
  assert.equal(identity.BHasClass('Active'), false);
  panel(fixture, 'HPColorsCategoryPresets').events.onactivate();
  assert.equal(identity.BHasClass('Active'), true);
  assert.equal(identity.text, identityText);
});

function userOrder(fixture) {
  return readMenuState(fixture).userPresets.map((preset) => preset.id);
}

function rowOrder(fixture) {
  const options = panel(fixture, 'HPColorsPresetOptions');
  const ids = [];
  for (let index = 0; index < options.GetChildCount(); index += 1) {
    ids.push(options.GetChild(index).GetAttributeString('hp_colors_preset_id', ''));
  }
  return ids;
}

test('unsaved-change prompt names the discard question in feedback', () => {
  const fixture = bootMenu(twoPresetState({ enemyLow: '#999999' }));
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.equal(presetFeedback(fixture), 'DISCARD UNSAVED CHANGES?');
  assert.equal(
    presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowConfirmMessage').text,
    'DISCARD UNSAVED CHANGES?',
  );
});

test('move feedback names the preset and direction, never its slot id', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  assert.deepEqual(userOrder(fixture), ['user_0001', 'user_0002']);

  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowDown').events.onactivate();
  assert.deepEqual(userOrder(fixture), ['user_0002', 'user_0001']);
  assert.deepEqual(rowOrder(fixture), ['baked_default', 'user_0002', 'user_0001']);
  assert.equal(presetFeedback(fixture), 'MOVED SHIV COLORS DOWN.');
  assert.doesNotMatch(presetFeedback(fixture), /USER_0001/);

  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowUp').events.onactivate();
  assert.deepEqual(userOrder(fixture), ['user_0001', 'user_0002']);
  assert.equal(presetFeedback(fixture), 'MOVED SHIV COLORS UP.');

  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowUp').events.onactivate();
  assert.equal(presetFeedback(fixture), 'MOVED SECOND UP.');
  assert.deepEqual(userOrder(fixture), ['user_0002', 'user_0001']);
});

test('boundary reorder arrows stay present, dimmed, unfocusable, and inert', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  const configBefore = JSON.stringify(readConfig(fixture));
  const feedbackBefore = presetFeedback(fixture);

  const firstUp = presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowUp');
  const lastDown = presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowDown');
  for (const control of [firstUp, lastDown]) {
    assert.equal(control.BHasClass('Disabled'), true);
    assert.equal(control.enabled, false);
    assert.equal(control.hittest, false);
    assert.equal(control.canfocus, false);
  }
  for (const control of [
    presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowDown'),
    presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowUp'),
  ]) {
    assert.equal(control.BHasClass('Disabled'), false);
    assert.equal(control.enabled, true);
    assert.equal(control.hittest, true);
    assert.equal(control.canfocus, true);
  }
  assert.equal(presetRowHas(fixture, 'baked_default', 'HPColorsPresetRowUp'), false);

  firstUp.events.onactivate();
  lastDown.events.onactivate();
  assert.deepEqual(userOrder(fixture), ['user_0001', 'user_0002']);
  assert.deepEqual(rowOrder(fixture), ['baked_default', 'user_0001', 'user_0002']);
  assert.equal(JSON.stringify(readConfig(fixture)), configBefore);
  assert.equal(presetFeedback(fixture), feedbackBefore);
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Active'), false);
  assert.equal(presetOption(fixture, 'user_0002').BHasClass('Active'), false);
  assert.doesNotMatch(menuStyleSource, /\.HPColorsPresetRowDown\.Disabled \{\s*visibility: collapse/);
  assert.match(menuStyleSource, /\.HPColorsPresetRowDown\.Disabled:focus \{[^}]*opacity: 0\.3;/);

  // An enabled arrow moves only its own row and never applies it.
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowUp').events.onactivate();
  assert.deepEqual(userOrder(fixture), ['user_0002', 'user_0001']);
  assert.equal(JSON.stringify(readConfig(fixture)), configBefore);
  assert.equal(presetOption(fixture, 'user_0002').BHasClass('Active'), false);
});

test('a single user preset shows both reorder arrows dimmed', () => {
  const state = twoPresetState();
  state.userPresets = state.userPresets.slice(0, 1);
  const fixture = bootMenu(state);
  openPresetsForm(fixture);
  for (const className of ['HPColorsPresetRowUp', 'HPColorsPresetRowDown']) {
    const control = presetRowControl(fixture, 'user_0001', className);
    assert.equal(control.BHasClass('Disabled'), true);
    assert.equal(control.enabled, false);
    assert.equal(control.canfocus, false);
    control.events.onactivate();
  }
  assert.deepEqual(userOrder(fixture), ['user_0001']);
});

// ---------------------------------------------------------------------------
// Round 4: CHANGED row (T1) and exit prompt (T2). Driven through the real
// menu VM; the state suite covers sourceState itself.

function rowAction(fixture, presetId, className) {
  return presetRowControl(fixture, presetId, className);
}

function actionUsable(button) {
  return {
    disabled: button.BHasClass('Disabled'),
    enabled: button.enabled,
    hittest: button.hittest,
    canfocus: button.canfocus,
  };
}

const USABLE = { disabled: false, enabled: true, hittest: true, canfocus: true };
const HIDDEN = { disabled: true, enabled: false, hittest: false, canfocus: false };

function assertChangedRow(fixture, presetId) {
  const row = presetOption(fixture, presetId);
  assert.equal(row.BHasClass('Changed'), true, `${presetId} has Changed`);
  assert.equal(row.BHasClass('RowChanged'), true, `${presetId} has RowChanged`);
  assert.equal(rowStatus(fixture, presetId).text, 'CHANGED');
  assert.deepEqual(actionUsable(rowAction(fixture, presetId, 'HPColorsPresetRowEdit')), HIDDEN);
  assert.deepEqual(actionUsable(rowAction(fixture, presetId, 'HPColorsPresetRowSave')), USABLE);
  assert.deepEqual(actionUsable(rowAction(fixture, presetId, 'HPColorsPresetRowRevert')), USABLE);
}

function assertPlainUserRow(fixture, presetId, text) {
  const row = presetOption(fixture, presetId);
  assert.equal(row.BHasClass('Changed'), false, `${presetId} not Changed`);
  assert.equal(row.BHasClass('RowChanged'), false, `${presetId} not RowChanged`);
  assert.equal(rowStatus(fixture, presetId).text, text);
  assert.deepEqual(actionUsable(rowAction(fixture, presetId, 'HPColorsPresetRowEdit')), USABLE);
  assert.deepEqual(actionUsable(rowAction(fixture, presetId, 'HPColorsPresetRowSave')), HIDDEN);
  assert.deepEqual(actionUsable(rowAction(fixture, presetId, 'HPColorsPresetRowRevert')), HIDDEN);
}

function assertNoPresetBanner(fixture) {
  for (const id of ['HPColorsPresetSourceRow', 'HPColorsPresetSaveAsNewButton'])
    assert.equal(fixture.harness.root.FindChildTraverse(id), null, `${id} is gone`);
}

function exitDialog(fixture) {
  return {
    open: panel(fixture, 'HPColorsExitDialog').BHasClass('Open'),
    title: panel(fixture, 'HPColorsExitDialogTitle').text,
    message: panel(fixture, 'HPColorsExitDialogMessage').text,
    save: actionUsable(panel(fixture, 'HPColorsExitSaveButton')),
  };
}

function editorOpen(fixture) {
  return panel(fixture, 'HPColorsEditorRoot').BHasClass('Open');
}

function savedPreset(fixture, id) {
  return readMenuState(fixture).userPresets.find((preset) => preset.id === id);
}

function shivHazeState(extra = {}) {
  return {
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [],
    userPresets: [
      {
        id: 'user_0001', kind: 'user', name: 'Shiv', mode: 'selected', heroes: ['hero_shiv'],
        values: { enemyLow: '#222222' }, conditions: null,
      },
      {
        id: 'user_0002', kind: 'user', name: 'Haze', mode: 'selected', heroes: ['hero_haze'],
        values: { enemyLow: '#333333' }, conditions: null,
      },
    ],
    ...extra,
  };
}

test('CHANGED row: a live edit after applying a user preset swaps EDIT for SAVE/REVERT on that row only', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  assertPlainUserRow(fixture, 'user_0001', 'ACTIVE');
  assertPlainUserRow(fixture, 'user_0002', '');
  const rowBefore = presetOption(fixture, 'user_0001');

  setWidthWithoutGesture(fixture, 150);
  assert.equal(presetOption(fixture, 'user_0001'), rowBefore, 'rows are toggled, not rebuilt');
  assertChangedRow(fixture, 'user_0001');
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Active'), false);
  assertPlainUserRow(fixture, 'user_0002', '');
  assert.equal(readMenuState(fixture).scopes[0].sourcePresetId, 'user_0001');

  // The hidden EDIT is inert even if something activates it.
  rowAction(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), false);
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), false);

  // Navigating away and back keeps the CHANGED row.
  leaveAndReturnToPresets(fixture);
  assertChangedRow(fixture, 'user_0001');

  // The dirty-row guard still protects the other row.
  presetRowMain(fixture, 'user_0002').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0002').BHasClass('Confirming'), true);
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowCancel').events.onactivate();
  assertChangedRow(fixture, 'user_0001');
});

test('CHANGED row: an inherited hero preset value marks the hero source row', () => {
  const fixture = bootLayeredMenu('SHIV');
  openPresetsForm(fixture);
  assertPlainUserRow(fixture, 'user_0002', 'ACTIVE');
  assertPlainUserRow(fixture, 'user_0001', '');

  setWidthWithoutGesture(fixture, 170);
  assertChangedRow(fixture, 'user_0002');
  assertPlainUserRow(fixture, 'user_0001', '');
  assert.equal(readMenuState(fixture).scopes[0].sourcePresetId, 'user_0002');

  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assertPlainUserRow(fixture, 'user_0002', 'ACTIVE');
});

test('CHANGED row: EDITING outranks CHANGED and inline SAVE/REVERT hide while any form is open', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  setWidthWithoutGesture(fixture, 150);
  assert.deepEqual(rowStatus(fixture, 'user_0001'), { active: false, text: 'EDITING' });
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Changed'), false);
  assert.equal(presetRowHas(fixture, 'user_0001', 'HPColorsPresetRowSave'), false);

  // CLOSE returns the row to normal precedence: live width differs, so CHANGED.
  panel(fixture, 'HPColorsPresetCancelEditButton').events.onactivate();
  assertChangedRow(fixture, 'user_0001');

  // NEW PRESET while a CHANGED source exists is allowed; the source keeps its
  // badge but its actions hide until the form closes.
  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  assert.equal(rowStatus(fixture, 'user_0001').text, 'CHANGED');
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('RowChanged'), false);
  assert.deepEqual(actionUsable(rowAction(fixture, 'user_0001', 'HPColorsPresetRowSave')), HIDDEN);
  panel(fixture, 'HPColorsPresetCancelEditButton').events.onactivate();
  assertChangedRow(fixture, 'user_0001');
});

test('CHANGED row: two identical presets never mark the second source CHANGED while it still matches', () => {
  const state = twoPresetState();
  state.userPresets[1].values = { enemyLow: '#222222' };
  const fixture = bootMenu(state);
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0002').events.onactivate();
  assert.equal(readMenuState(fixture).scopes[0].sourcePresetId, 'user_0002');
  assertPlainUserRow(fixture, 'user_0001', 'ACTIVE');
  assertPlainUserRow(fixture, 'user_0002', '');

  setWidthWithoutGesture(fixture, 150);
  assertChangedRow(fixture, 'user_0002');
  assertPlainUserRow(fixture, 'user_0001', '');
});

test('inline SAVE confirms, keeps name and scope, and writes the current settings into the source', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  setWidthWithoutGesture(fixture, 150);

  rowAction(fixture, 'user_0001', 'HPColorsPresetRowSave').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), true);
  assert.equal(
    presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowConfirmMessage').text,
    'SAVE YOUR SETTINGS TO SHIV COLORS?',
  );
  assert.equal(presetFeedback(fixture), 'SAVE YOUR SETTINGS TO SHIV COLORS?');

  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowCancel').events.onactivate();
  assert.equal(presetFeedback(fixture), 'PRESET CHANGE CANCELED.');
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 100);
  assert.equal(readConfig(fixture).values.widthScale, 150);
  assertChangedRow(fixture, 'user_0001');

  rowAction(fixture, 'user_0001', 'HPColorsPresetRowSave').events.onactivate();
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowConfirm').events.onactivate();
  assert.equal(presetFeedback(fixture), 'SAVED SHIV COLORS.');
  const saved = savedPreset(fixture, 'user_0001');
  assert.equal(saved.name, 'Shiv Colors');
  assert.equal(saved.mode, 'all');
  assert.equal(saved.values.widthScale, 150);
  assert.equal(saved.values.enemyLow, '#222222');
  assert.equal(readConfig(fixture).values.widthScale, 150, 'SAVE never reloads');
  assertPlainUserRow(fixture, 'user_0001', 'ACTIVE');
  assert.equal(presetOption(fixture, 'user_0001').focused, true);
  assert.equal(savedPreset(fixture, 'user_0002').values.enemyLow, '#333333');
});

test('inline SAVE on a hero preset keeps ONLY THESE and records the changed key as own', () => {
  const fixture = bootLayeredMenu('SHIV');
  openPresetsForm(fixture);
  setWidthWithoutGesture(fixture, 170);
  rowAction(fixture, 'user_0002', 'HPColorsPresetRowSave').events.onactivate();
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowConfirm').events.onactivate();
  assert.equal(presetFeedback(fixture), 'SAVED SHIV ONLY.');
  const saved = savedPreset(fixture, 'user_0002');
  assert.equal(saved.mode, 'selected');
  assert.deepEqual(saved.heroes, ['hero_shiv']);
  assert.equal(saved.values.widthScale, 170);
  assert.ok(saved.own.includes('widthScale'));
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 100);
  assertPlainUserRow(fixture, 'user_0002', 'ACTIVE');
});

test('inline SAVE re-validates its target: a source replaced before CONFIRM changes nothing', () => {
  const fixture = bootMenu(shivHazeState());
  settleHeroRoute(fixture, '#222222');
  openPresetsForm(fixture);
  setWidthWithoutGesture(fixture, 150);
  assertChangedRow(fixture, 'user_0001');
  rowAction(fixture, 'user_0001', 'HPColorsPresetRowSave').events.onactivate();
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), true);

  // A hero switch routes to Haze; Shiv is no longer the source.
  fixture.identityTree.setHeroName('HAZE');
  settleHeroRoute(fixture, '#333333');
  const confirm = presetOption(fixture, 'user_0001').FindChildrenWithClassTraverse('HPColorsPresetRowConfirm')[0];
  assert.ok(confirm, 'the stale confirm row is still on screen');
  confirm.events.onactivate();
  assert.equal(presetFeedback(fixture), 'THAT PRESET NO LONGER EXISTS. NOTHING CHANGED.');
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 100);
  assert.equal(savedPreset(fixture, 'user_0002').values.widthScale, 100);
  assert.equal(presetOption(fixture, 'user_0001').BHasClass('Confirming'), false);
});

test('REVERT reloads the saved snapshot, keeps the source, and UNDO restores the live edits', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  setWidthWithoutGesture(fixture, 150);

  rowAction(fixture, 'user_0001', 'HPColorsPresetRowRevert').events.onactivate();
  assert.equal(presetFeedback(fixture), 'REVERTED TO SHIV COLORS. UNDO RESTORES YOUR CHANGES.');
  assert.equal(readConfig(fixture).values.widthScale, 100);
  assert.equal(readMenuState(fixture).scopes[0].sourcePresetId, 'user_0001');
  assertPlainUserRow(fixture, 'user_0001', 'ACTIVE');
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 100);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, true);

  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.widthScale, 150);
  assertChangedRow(fixture, 'user_0001');
});

test('changing HEROES drops the source: no CHANGED row, no banner, and the footer saves it as a new preset', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();

  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  panel(fixture, 'HPColorsCurrentScopeSelected').events.onactivate();
  scopeOption(fixture, 'hero_haze').events.onactivate();
  panel(fixture, 'HPColorsScopeCloseButton').events.onactivate();
  panel(fixture, 'HPColorsPresetCancelEditButton').events.onactivate();

  assert.equal(currentScope(fixture).mode, 'selected');
  assert.equal(currentScope(fixture).sourcePresetId, undefined);
  assertPlainUserRow(fixture, 'user_0001', '');
  assertPlainUserRow(fixture, 'user_0002', '');
  assertNoPresetBanner(fixture);
  assert.equal(saveToLabel(fixture), 'SAVE TO PRESET');

  // The footer dialog still saves the settings as a new preset.
  openSaveTo(fixture);
  panel(fixture, 'HPColorsSaveToNewButton').events.onactivate();
  assert.equal(readMenuState(fixture).userPresets.length, 3);
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  assertNoPresetBanner(fixture);
});

test('PRESETS banner is gone: no source banner panels exist, with no source, Rewrite Default, or zero presets', () => {
  const none = bootMenu({ version: 1, values: {}, scopes: [] });
  openPresetsForm(none);
  assertNoPresetBanner(none);
  setWidthWithoutGesture(none, 150);
  assertNoPresetBanner(none);
  // Saving as new works from the footer dialog, and both NEW PRESET entries stay.
  openSaveTo(none);
  panel(none, 'HPColorsSaveToNewButton').events.onactivate();
  assert.equal(savedPreset(none, 'user_0001').name, 'PRESET 1');
  assert.equal(savedPreset(none, 'user_0001').values.widthScale, 150);
  assert.equal(typeof panel(none, 'HPColorsPresetNewButton').events.onactivate, 'function');

  const baked = bootMenu(twoPresetState());
  openPresetsForm(baked);
  presetRowMain(baked, 'baked_default').events.onactivate();
  setWidthWithoutGesture(baked, 150);
  assertNoPresetBanner(baked);
  assertPlainUserRow(baked, 'user_0001', '');
  assertPlainUserRow(baked, 'user_0002', '');
  assert.equal(saveToLabel(baked), 'SAVE TO PRESET', 'Rewrite Default is never named as a save target');
  panel(baked, 'HPColorsPresetNewButton').events.onactivate();
  assert.equal(panel(baked, 'HPColorsPresetSaveMode').text, 'NEW PRESET');
});

test('hero auto-switch moves the source: the old CHANGED row clears and the new source row takes over', () => {
  const fixture = bootMenu(shivHazeState());
  settleHeroRoute(fixture, '#222222');
  openPresetsForm(fixture);
  setWidthWithoutGesture(fixture, 150);
  assertChangedRow(fixture, 'user_0001');

  fixture.identityTree.setHeroName('HAZE');
  settleHeroRoute(fixture, '#333333');
  assert.equal(readConfig(fixture).values.widthScale, 100, 'routing replaced the unsaved live edit');
  assertPlainUserRow(fixture, 'user_0001', '');
  assertPlainUserRow(fixture, 'user_0002', 'ACTIVE');
  assert.equal(readMenuState(fixture).scopes[0].sourcePresetId, 'user_0002');

  setWidthWithoutGesture(fixture, 160);
  assertChangedRow(fixture, 'user_0002');
  assertPlainUserRow(fixture, 'user_0001', '');
});

const CASE_A_BODY =
  "Your settings stay in use either way.\nSAVE updates SHIV COLORS.\nSwitching heroes can replace changes you haven't saved to a preset.\nUNDO ends when you exit.";
const CASE_B_BODY =
  'The name you typed will not be saved.\nYour settings stay in use.\nUNDO ends when you exit.';

function changedFixture() {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  setWidthWithoutGesture(fixture, 150);
  assertChangedRow(fixture, 'user_0001');
  return fixture;
}

test('exit prompt: EXIT and the owned cancel hook prompt for a CHANGED source, never for live-only edits', () => {
  const changed = changedFixture();
  panel(changed, 'HPColorsDoneButton').events.onactivate();
  assert.equal(editorOpen(changed), true);
  assert.deepEqual(exitDialog(changed), {
    open: true,
    title: 'SAVE CHANGES TO SHIV COLORS?',
    message: CASE_A_BODY,
    save: USABLE,
  });
  assert.equal(panel(changed, 'HPColorsExitReviewButton').focused, true);
  assert.equal(readConfig(changed).values.widthScale, 150);

  // Escape inside the prompt dismisses it and keeps the editor open.
  assert.equal(harnessCancel(changed), true);
  assert.equal(exitDialog(changed).open, false);
  assert.equal(editorOpen(changed), true);
  // The backdrop does the same.
  panel(changed, 'HPColorsDoneButton').events.onactivate();
  panel(changed, 'HPColorsExitBackdrop').events.onactivate();
  assert.equal(exitDialog(changed).open, false);
  assert.equal(editorOpen(changed), true);

  // The cancel hook (root oncancel, EscapeBackground, Resume/MenuBack) prompts too.
  assert.equal(harnessCancel(changed), true);
  assert.equal(exitDialog(changed).open, true);
  assert.equal(editorOpen(changed), true);

  // Live-only edits are already saved on this PC: no prompt.
  const liveOnly = bootMenu(twoPresetState());
  openEditor(liveOnly);
  setWidthWithoutGesture(liveOnly, 150);
  panel(liveOnly, 'HPColorsDoneButton').events.onactivate();
  assert.equal(exitDialog(liveOnly).open, false);
  assert.equal(editorOpen(liveOnly), false);
  assert.equal(readConfig(liveOnly).values.widthScale, 150);

  const zeroPresets = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(zeroPresets);
  setWidthWithoutGesture(zeroPresets, 150);
  assert.equal(harnessCancel(zeroPresets), true);
  assert.equal(exitDialog(zeroPresets).open, false);
  assert.equal(editorOpen(zeroPresets), false);
  assert.equal(harnessCancel(zeroPresets), false, 'the next cancel reaches native resume');
});

test('exit prompt: a nested subdialog closes first, then the next cancel prompts', () => {
  const fixture = changedFixture();
  selectEnemyBar(fixture);
  requestReset(fixture);
  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), true);
  assert.equal(harnessCancel(fixture), true);
  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), false);
  assert.equal(exitDialog(fixture).open, false);
  assert.equal(editorOpen(fixture), true);
  assert.equal(harnessCancel(fixture), true);
  assert.equal(exitDialog(fixture).open, true);
  assert.equal(editorOpen(fixture), true);
});

test('exit prompt: SAVE & EXIT writes the source then closes; EXIT keeps live values and the preset', () => {
  const save = changedFixture();
  panel(save, 'HPColorsDoneButton').events.onactivate();
  panel(save, 'HPColorsExitSaveButton').events.onactivate();
  assert.equal(exitDialog(save).open, false);
  assert.equal(editorOpen(save), false);
  assert.equal(savedPreset(save, 'user_0001').values.widthScale, 150);
  assert.equal(savedPreset(save, 'user_0001').name, 'Shiv Colors');
  assert.equal(readConfig(save).values.widthScale, 150);

  const discard = changedFixture();
  panel(discard, 'HPColorsDoneButton').events.onactivate();
  panel(discard, 'HPColorsExitDiscardButton').events.onactivate();
  assert.equal(exitDialog(discard).open, false);
  assert.equal(editorOpen(discard), false);
  assert.equal(savedPreset(discard, 'user_0001').values.widthScale, 100);
  assert.equal(readConfig(discard).values.widthScale, 150, 'nothing is reverted by exiting');
  assert.equal(readMenuState(discard).scopes[0].sourcePresetId, 'user_0001');
  openEditor(discard);
  assert.equal(panel(discard, 'HPColorsUndoButton').enabled, false, 'undo history ends on exit');
  assertChangedRow(discard, 'user_0001');
});

test('exit prompt: SAVE & EXIT refuses a target that changed under the dialog and stays open', () => {
  const fixture = bootMenu(shivHazeState());
  settleHeroRoute(fixture, '#222222');
  openPresetsForm(fixture);
  setWidthWithoutGesture(fixture, 150);
  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  assert.equal(exitDialog(fixture).title, 'SAVE CHANGES TO SHIV?');

  fixture.identityTree.setHeroName('HAZE');
  settleHeroRoute(fixture, '#333333');
  panel(fixture, 'HPColorsExitSaveButton').events.onactivate();
  assert.equal(exitDialog(fixture).open, true);
  assert.equal(editorOpen(fixture), true);
  assert.equal(panel(fixture, 'HPColorsExitFeedback').text, 'THAT PRESET NO LONGER EXISTS. NOTHING CHANGED.');
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 100);
  assert.equal(savedPreset(fixture, 'user_0002').values.widthScale, 100);
});

test('exit prompt: REVIEW PRESETS lands on PRESETS with undo history, typed name, and the CHANGED row kept', () => {
  const fixture = changedFixture();
  selectEnemyBar(fixture);
  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  assert.equal(exitDialog(fixture).open, true);
  panel(fixture, 'HPColorsExitReviewButton').events.onactivate();
  assert.equal(exitDialog(fixture).open, false);
  assert.equal(editorOpen(fixture), true);
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'PRESET LIBRARY');
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, true);
  assertChangedRow(fixture, 'user_0001');
  assert.equal(presetOption(fixture, 'user_0001').focused, true);

  // With a form open, the typed name survives and takes focus.
  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  panel(fixture, 'HPColorsPresetNameInput').text = 'Draft Name';
  selectEnemyBar(fixture);
  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  const both = exitDialog(fixture);
  assert.equal(both.title, 'SAVE CHANGES TO SHIV COLORS?');
  assert.equal(both.message, `${CASE_A_BODY}\nThe name you typed will not be saved.`);
  assert.deepEqual(both.save, USABLE);
  panel(fixture, 'HPColorsExitReviewButton').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetNameInput').text, 'Draft Name');
  assert.equal(panel(fixture, 'HPColorsPresetNameInput').focused, true);
  assert.equal(panel(fixture, 'HPColorsPresetForm').BHasClass('Active'), true);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, true);
});

test('exit prompt: an unsaved form name prompts Case B without a save button; an unchanged edit name does not prompt', () => {
  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  panel(fixture, 'HPColorsPresetNameInput').text = 'Draft';
  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  assert.deepEqual(exitDialog(fixture), {
    open: true,
    title: 'LEAVE WITHOUT SAVING THE PRESET?',
    message: CASE_B_BODY,
    save: HIDDEN,
  });
  panel(fixture, 'HPColorsExitSaveButton').events.onactivate();
  assert.equal(exitDialog(fixture).open, true, 'a hidden SAVE & EXIT is inert');
  assert.equal(readMenuState(fixture).userPresets.length, 2);
  panel(fixture, 'HPColorsExitDiscardButton').events.onactivate();
  assert.equal(editorOpen(fixture), false);
  assert.equal(readMenuState(fixture).userPresets.length, 2, 'no preset is created from the exit dialog');

  openPresetsForm(fixture);
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetNameInput').text, 'Shiv Colors');
  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  assert.equal(exitDialog(fixture).open, false);
  assert.equal(editorOpen(fixture), false);
});

test('layout parity: exit dialog, SAVE TO PRESET with its ▼ companion, no PRESETS banner, hint, and cancel hooks exist in every layout; row actions in the shared script and CSS', () => {
  const ids = [
    'HPColorsExitDialog', 'HPColorsExitBackdrop', 'HPColorsExitDialogTitle',
    'HPColorsExitDialogMessage', 'HPColorsExitFeedback', 'HPColorsExitSaveButton',
    'HPColorsExitReviewButton', 'HPColorsExitDiscardButton',
    'HPColorsSaveToPresetButton', 'HPColorsSaveToPresetLabel', 'HPColorsSaveToMoreButton',
    'HPColorsSaveToDialog', 'HPColorsSaveToBackdrop',
    'HPColorsSaveToOptions', 'HPColorsSaveToFeedback', 'HPColorsSaveToNewButton',
    'HPColorsSaveToCloseButton',
  ];
  const hookedControls = {
    rewrite_v2: ['CitadelHudEscapeMenu', 'EscapeBackground', 'EscapeButton'],
    hp_colors_rewrite_v2_qollock: ['CitadelHudEscapeMenu', 'EscapeBackground', 'EscapeButton', 'CloseBtn'],
    hp_colors_rewrite_v2_thirdeye: ['CitadelHudEscapeMenu', 'EscapeBackground', 'EscapeButton'],
  };
  for (const [lane, source] of LANE_LAYOUT_SOURCES) {
    const ancestry = panelAncestryById(source, { allowDuplicates: true });
    for (const id of ids) assert.ok(ancestry.has(id), `${lane}: ${id}`);
    assert.equal(ancestry.has('HPColorsPresetSourceRow'), false, lane);
    assert.equal(ancestry.has('HPColorsPresetSaveAsNewButton'), false, lane);
    assert.ok(ancestry.get('HPColorsExitSaveButton').includes('HPColorsExitDialog'), lane);
    assert.equal(source.split('<Label text="SAVE &amp; EXIT" />').length - 1, 1, lane);
    assert.equal(source.split('<Label text="REVIEW PRESETS" />').length - 1, 1, lane);
    assert.match(source, /id="HPColorsExitDiscardButton"[^>]*><Label text="EXIT" \/>/, lane);
    assert.equal(source.split('EXIT WITHOUT SAVING').length - 1, 0, lane);
    assert.equal(source.split('SAVE AS NEW PRESET').length - 1, 0, lane);
    assert.equal(source.split('YOUR SETTINGS ARE NOT SAVED TO A PRESET').length - 1, 0, lane);
    assert.equal(
      source.split('Click a preset to use it. EDIT changes its name or HEROES.').length - 1,
      1,
      lane,
    );
    for (const control of hookedControls[lane]) {
      const tag = source.match(new RegExp(`<${control === 'CitadelHudEscapeMenu' ? control : `[A-Za-z]+ id="${control}"`}[^>]*>`));
      assert.ok(tag && tag[0].includes('$.HPColorsMenuCancel'), `${lane}: ${control} routes through the cancel hook`);
    }
    // SAVE TO PRESET sits in the footer between the spacer and EXIT, and its
    // dialog owns its list, feedback, and both actions.
    const footer = source.match(/<Panel class="HPColorsEditorFooter">[\s\S]*?<\/Panel>\s*<\/Panel>/);
    assert.ok(footer, `${lane}: editor footer`);
    const footerIds = Array.from(footer[0].matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
    assert.deepEqual(footerIds, [
      'HPColorsPeekButton', 'HPColorsUndoButton', 'HPColorsResetSectionButton',
      'HPColorsTransferButton', 'HPColorsSaveToPresetButton', 'HPColorsSaveToPresetLabel',
      'HPColorsSaveToMoreButton', 'HPColorsDoneButton',
    ], lane);
    assert.ok(
      footer[0].indexOf('HPColorsFooterSpacer') < footer[0].indexOf('id="HPColorsSaveToPresetButton"'),
      `${lane}: SAVE TO PRESET follows the spacer`,
    );
    assert.ok(ancestry.get('HPColorsSaveToPresetButton').includes('HPColorsEditorRoot'), lane);
    for (const id of [
      'HPColorsSaveToBackdrop', 'HPColorsSaveToOptions', 'HPColorsSaveToFeedback',
      'HPColorsSaveToNewButton', 'HPColorsSaveToCloseButton',
    ])
      assert.ok(ancestry.get(id).includes('HPColorsSaveToDialog'), `${lane}: ${id} lives in the dialog`);
    assert.match(
      source,
      /id="HPColorsSaveToPresetButton" class="HPColorsSecondaryAction"><Label id="HPColorsSaveToPresetLabel" text="SAVE TO PRESET" \/><\/Button>\s*<Button id="HPColorsSaveToMoreButton" class="HPColorsSecondaryAction HPColorsFooterActionHidden"><Label text="▼" \/><\/Button>/,
      lane,
    );
    assert.equal(source.split('text="SAVE TO PRESET"').length - 1, 2, `${lane}: button label and dialog title`);
    assert.equal(source.split('<Label text="+ NEW PRESET (ALL HEROES)" />').length - 1, 1, lane);
    assert.equal(
      source.split('Pick a preset to save your current settings into. Its HEROES stay the same.').length - 1,
      1,
      lane,
    );
    assert.equal(source.split('id="HPColorsSaveToCloseButton"').length - 1, 1, lane);
    // Ghoul opacity is gone from every layout.
    assert.doesNotMatch(source, /HPColorsGhoulOpacity/, lane);
    assert.doesNotMatch(source, /GHOUL/i, lane);
  }
  for (const className of ['HPColorsPresetRowSave', 'HPColorsPresetRowRevert']) {
    assert.match(menuSource, new RegExp(`"${className}"`));
    assert.match(menuStyleSource, new RegExp(`\\.${className}\\b`));
  }
  assert.match(menuStyleSource, /\.HPColorsPresetOption\.Changed \{/);
  assert.match(menuStyleSource, /\.HPColorsPresetOption\.RowChanged \.HPColorsPresetRowEdit/);
  assert.match(menuStyleSource, /\.HPColorsExitSaveButton\.Disabled \{/);
  assert.match(menuStyleSource, /\.HPColorsSaveToOption\.Confirming \{/);
  assert.match(menuStyleSource, /#HPColorsSaveToPresetButton\.Unsaved \{/);
});

// ---------------------------------------------------------------------------
// Retired ghoul opacity: an old save may still carry it, nothing shows it.

test('an old save carrying ghoul opacity boots, publishes no ghoul keys, and the editor has no ghoul controls', () => {
  const rule = { slot: 1, minTier: 1, value: 20 };
  const oldValues = { enemyLow: '#123456', ghoulOpacityEnabled: true, ghoulOpacity: 35 };
  const fixture = bootMenu({
    version: 1,
    values: oldValues,
    conditions: { ghoulOpacity: rule },
    scopes: [{
      id: 'scope_current',
      mode: 'all',
      heroes: [],
      values: oldValues,
      conditions: { ghoulOpacity: rule },
    }],
    userPresets: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Old',
      mode: 'all',
      heroes: [],
      values: oldValues,
      conditions: { ghoulOpacityEnabled: { slot: 1, minTier: 1, value: true } },
      own: ['ghoulOpacity'],
    }],
  });
  assert.equal(typeof panel(fixture, 'HPColorsMenuButton').events.onactivate, 'function');
  openEditor(fixture);
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), true);

  const config = readConfig(fixture);
  assert.equal(config.values.enemyLow, '#123456');
  for (const key of ['ghoulOpacityEnabled', 'ghoulOpacity'])
    assert.equal(Object.hasOwn(config.values, key), false, key);
  assert.doesNotMatch(JSON.stringify(readMenuState(fixture)), /ghoul/i);

  selectEnemyBar(fixture);
  for (const id of [
    'HPColorsGhoulOpacityToggle', 'HPColorsGhoulOpacityRow', 'HPColorsGhoulOpacitySliderHost',
    'HPColorsGhoulOpacitySlider', 'HPColorsGhoulOpacityEntry',
  ])
    assert.equal(fixture.harness.root.FindChildTraverse(id), null, id);
  const categories = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_DEFS');
  assert.doesNotMatch(JSON.stringify(categories), /ghoul/i);

  // The section still resets and publishes without the retired pair.
  requestReset(fixture);
  confirmReset(fixture);
  assert.doesNotMatch(JSON.stringify(readConfig(fixture)), /ghoul/i);
  assert.doesNotMatch(JSON.stringify(readMenuState(fixture)), /ghoul/i);
});

// ---------------------------------------------------------------------------
// Footer SAVE TO PRESET: overwrite a chosen user preset with the live settings,
// or save them as a new All Heroes preset, without ever changing HEROES.

function saveToPresetState() {
  return {
    version: 1,
    values: {},
    scopes: [],
    userPresets: [
      {
        id: 'user_0001', kind: 'user', name: 'Everyone', mode: 'all', heroes: [],
        values: { enemyLow: '#222222' }, conditions: null,
      },
      {
        id: 'user_0002', kind: 'user', name: 'Haze Only', mode: 'selected', heroes: ['hero_haze'],
        values: { enemyLow: '#333333' }, own: ['enemyLow'], conditions: null,
      },
    ],
  };
}

function saveToButton(fixture) {
  return panel(fixture, 'HPColorsSaveToPresetButton');
}

function saveToDialog(fixture) {
  return panel(fixture, 'HPColorsSaveToDialog');
}

function saveToLabel(fixture) {
  return panel(fixture, 'HPColorsSaveToPresetLabel').text;
}

function saveToMore(fixture) {
  return panel(fixture, 'HPColorsSaveToMoreButton');
}

function saveToMoreShown(fixture) {
  return !saveToMore(fixture).BHasClass('HPColorsFooterActionHidden');
}

// While the source is CHANGED the main button saves in one click; the list
// then opens from the ▼ button. Otherwise the main button opens the list.
function openSaveTo(fixture) {
  const button = saveToMoreShown(fixture) ? saveToMore(fixture) : saveToButton(fixture);
  assert.equal(typeof button.events.onactivate, 'function');
  button.events.onactivate();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), true);
}

function saveToRows(fixture) {
  return panel(fixture, 'HPColorsSaveToOptions').Children();
}

function saveToRowIds(fixture) {
  return saveToRows(fixture).map((row) => row.GetAttributeString('hp_colors_save_to_id', ''));
}

function saveToRow(fixture, presetId) {
  const found = saveToRows(fixture).find(
    (row) => row.GetAttributeString('hp_colors_save_to_id', '') === presetId,
  );
  assert.ok(found, `expected SAVE TO row ${presetId}`);
  return found;
}

function saveToRowPart(fixture, presetId, className) {
  const part = saveToRow(fixture, presetId).FindChildrenWithClassTraverse(className)[0];
  assert.ok(part, `expected ${className} in SAVE TO row ${presetId}`);
  return part;
}

function saveToRowSave(fixture, presetId) {
  return saveToRowPart(fixture, presetId, 'HPColorsSaveToRowSave');
}

function saveToRowState(fixture, presetId) {
  return {
    armed: saveToRow(fixture, presetId).BHasClass('Confirming'),
    button: saveToRowSave(fixture, presetId).Children()[0].text,
    message: saveToRowPart(fixture, presetId, 'HPColorsSaveToOptionMessage').text,
    tag: saveToRowPart(fixture, presetId, 'HPColorsSaveToOptionTag').text,
  };
}

function armAndConfirmSaveTo(fixture, presetId) {
  saveToRowSave(fixture, presetId).events.onactivate();
  assert.equal(saveToRowState(fixture, presetId).armed, true);
  saveToRowSave(fixture, presetId).events.onactivate();
}

test('SAVE TO PRESET: the first SAVE only arms; the second replaces that preset, keeps its HEROES, and applies it', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  setWidthWithoutGesture(fixture, 150);
  assertChangedRow(fixture, 'user_0001');
  const everyoneBefore = savedPreset(fixture, 'user_0001');

  openSaveTo(fixture);
  assert.equal(saveToDialog(fixture).focused, true);
  // Only user presets are offered, in list order. Rewrite Default never is.
  assert.deepEqual(saveToRowIds(fixture), ['user_0001', 'user_0002']);
  // The preset the live settings came from is tagged so players find it fast.
  assert.deepEqual(saveToRowState(fixture, 'user_0001'), {
    armed: false, button: 'SAVE', message: '', tag: 'CHANGED',
  });
  assert.deepEqual(saveToRowState(fixture, 'user_0002'), {
    armed: false, button: 'SAVE', message: '', tag: '',
  });
  // The row body does nothing; only its own SAVE button acts.
  assert.equal(saveToRow(fixture, 'user_0002').events.onactivate, undefined);

  saveToRowSave(fixture, 'user_0002').events.onactivate();
  assert.deepEqual(saveToRowState(fixture, 'user_0002'), {
    armed: true, button: 'REPLACE?', message: 'CLICK AGAIN TO REPLACE HAZE ONLY', tag: '',
  });
  assert.equal(saveToDialog(fixture).BHasClass('Open'), true);
  assert.equal(savedPreset(fixture, 'user_0002').values.widthScale, 100, 'the first click saves nothing');

  saveToRowSave(fixture, 'user_0002').events.onactivate();
  const saved = savedPreset(fixture, 'user_0002');
  assert.equal(saved.name, 'Haze Only');
  assert.equal(saved.mode, 'selected');
  assert.deepEqual(saved.heroes, ['hero_haze']);
  assert.equal(saved.values.widthScale, 150);
  assert.ok(saved.own.includes('widthScale'));
  assert.deepEqual(savedPreset(fixture, 'user_0001'), everyoneBefore);
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);

  // The live settings now belong to the saved preset.
  assert.equal(currentScope(fixture).sourcePresetId, 'user_0002');
  assert.equal(currentScope(fixture).mode, 'selected');
  assert.deepEqual(currentScope(fixture).heroes, ['hero_haze']);
  assert.equal(readConfig(fixture).values.widthScale, 150);
  assertPlainUserRow(fixture, 'user_0001', '');
  assertPlainUserRow(fixture, 'user_0002', 'ACTIVE');
  assert.equal(presetFeedback(fixture), 'SAVED HAZE ONLY.');
  assert.equal(saveToButton(fixture).focused, true);

  // A short header note confirms it, then the resting status returns.
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'SAVED TO HAZE ONLY.');
  fixture.harness.scheduler.runByDelay(3);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, STATUS_WITHOUT_STORE);

  // Nothing is left unsaved, so EXIT closes without the exit prompt.
  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  assert.equal(exitDialog(fixture).open, false);
  assert.equal(editorOpen(fixture), false);
});

test('SAVE TO PRESET is not undoable, but applying the saved preset afterwards is', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  setWidthWithoutGesture(fixture, 150);
  openSaveTo(fixture);
  armAndConfirmSaveTo(fixture, 'user_0002');
  assert.equal(currentScope(fixture).sourcePresetId, 'user_0002');

  const undo = panel(fixture, 'HPColorsUndoButton');
  assert.equal(undo.enabled, true);
  undo.events.onactivate();
  assert.equal(currentScope(fixture).mode, 'all');
  assert.equal(currentScope(fixture).sourcePresetId, 'user_0001');
  assert.equal(readConfig(fixture).values.widthScale, 150);
  assert.equal(savedPreset(fixture, 'user_0002').values.widthScale, 150, 'the saved preset keeps its settings');
});

test('SAVE TO PRESET warns when the top All Heroes preset would also change hero presets', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  openSaveTo(fixture);
  saveToRowSave(fixture, 'user_0001').events.onactivate();
  assert.equal(
    saveToRowState(fixture, 'user_0001').message,
    'CLICK AGAIN TO REPLACE EVERYONE · ALSO CHANGES HERO PRESETS',
  );
  saveToRowSave(fixture, 'user_0002').events.onactivate();
  assert.equal(saveToRowState(fixture, 'user_0001').message, '');
  assert.equal(saveToRowState(fixture, 'user_0002').message, 'CLICK AGAIN TO REPLACE HAZE ONLY');

  // Only the top All Heroes preset is the one hero presets inherit from.
  const state = saveToPresetState();
  state.userPresets.push({
    id: 'user_0003', kind: 'user', name: 'Second All', mode: 'all', heroes: [],
    values: { enemyLow: '#444444' }, conditions: null,
  });
  const second = bootMenu(state);
  openPresetsForm(second);
  openSaveTo(second);
  saveToRowSave(second, 'user_0003').events.onactivate();
  assert.equal(saveToRowState(second, 'user_0003').message, 'CLICK AGAIN TO REPLACE SECOND ALL');

  // With no hero presets there is nothing else to warn about.
  const plain = bootMenu(twoPresetState());
  openPresetsForm(plain);
  openSaveTo(plain);
  saveToRowSave(plain, 'user_0001').events.onactivate();
  assert.equal(saveToRowState(plain, 'user_0001').message, 'CLICK AGAIN TO REPLACE SHIV COLORS');
});

test('SAVE TO PRESET disarms on another row, timeout, cancel, Escape, and reopen; a timeout never saves', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  setWidthWithoutGesture(fixture, 150);
  const before = readMenuState(fixture).userPresets;
  const timers = () => fixture.harness.scheduler.jobs.filter((job) => Number(job.delay) === 4);
  const armed = (id) => saveToRowState(fixture, id).armed;
  openSaveTo(fixture);

  // Arming another row disarms the first; the older timer cannot touch the newer arm.
  saveToRowSave(fixture, 'user_0001').events.onactivate();
  saveToRowSave(fixture, 'user_0002').events.onactivate();
  assert.equal(armed('user_0001'), false);
  assert.equal(saveToRowState(fixture, 'user_0001').button, 'SAVE');
  assert.equal(armed('user_0002'), true);
  assert.equal(timers().length, 2);
  timers()[0].fn();
  assert.equal(armed('user_0002'), true, 'a stale timer is ignored');
  timers()[1].fn();
  assert.equal(armed('user_0002'), false, 'the live timer disarms');
  assert.deepEqual(readMenuState(fixture).userPresets, before, 'a timeout never saves');
  assert.equal(saveToDialog(fixture).BHasClass('Open'), true);

  // After a timeout one click arms again instead of saving.
  saveToRowSave(fixture, 'user_0002').events.onactivate();
  assert.equal(armed('user_0002'), true);
  assert.deepEqual(readMenuState(fixture).userPresets, before);

  // CANCEL closes; reopening rebuilds the rows unarmed.
  panel(fixture, 'HPColorsSaveToCloseButton').events.onactivate();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  openSaveTo(fixture);
  assert.equal(armed('user_0002'), false);
  assert.deepEqual(readMenuState(fixture).userPresets, before);

  // Escape closes; reopening is unarmed again, and every older timer stays inert.
  saveToRowSave(fixture, 'user_0001').events.onactivate();
  assert.equal(armed('user_0001'), true);
  assert.equal(harnessCancel(fixture), true);
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  openSaveTo(fixture);
  assert.equal(armed('user_0001'), false);
  saveToRowSave(fixture, 'user_0001').events.onactivate();
  const pending = timers();
  pending.slice(0, -1).forEach((job) => job.fn());
  assert.equal(armed('user_0001'), true, 'timers from earlier arms cannot disarm this one');
  pending[pending.length - 1].fn();
  assert.equal(armed('user_0001'), false);

  // Closing the editor also ends the arm.
  saveToRowSave(fixture, 'user_0001').events.onactivate();
  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  openEditor(fixture);
  openSaveTo(fixture);
  assert.equal(armed('user_0001'), false);
  assert.deepEqual(readMenuState(fixture).userPresets, before);
});

test('an open SAVE TO PRESET dialog follows the current source and keeps its arm', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  setWidthWithoutGesture(fixture, 150);
  openSaveTo(fixture);
  saveToRowSave(fixture, 'user_0002').events.onactivate();
  assert.equal(saveToRowState(fixture, 'user_0001').tag, 'CHANGED');
  assert.equal(saveToRow(fixture, 'user_0001').BHasClass('Changed'), true);

  // UNDO (behind the dialog) puts the settings back on the saved preset: the
  // tag follows, the armed row stays armed, and the rows are not rebuilt.
  const rowsBefore = saveToRows(fixture);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(saveToRowState(fixture, 'user_0001').tag, '');
  assert.equal(saveToRow(fixture, 'user_0001').BHasClass('Changed'), false);
  assert.equal(saveToRowState(fixture, 'user_0002').armed, true);
  assert.deepEqual(saveToRows(fixture), rowsBefore);
});

test('SAVE TO PRESET re-reads its target: a preset deleted under an armed row saves nothing', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  setWidthWithoutGesture(fixture, 150);
  openSaveTo(fixture);
  saveToRowSave(fixture, 'user_0002').events.onactivate();
  const staleSave = saveToRowSave(fixture, 'user_0002');

  // The delete flow lives behind the dialog backdrop; drive it directly.
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowDelete').events.onactivate();
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowConfirm').events.onactivate();
  assert.equal(readMenuState(fixture).userPresets.length, 1);

  staleSave.events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSaveToFeedback').text, 'THAT PRESET NO LONGER EXISTS. NOTHING CHANGED.');
  assert.equal(saveToDialog(fixture).BHasClass('Open'), true);
  assert.deepEqual(saveToRowIds(fixture), ['user_0001']);
  assert.equal(readMenuState(fixture).userPresets.length, 1);
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 100);
});

test('SAVE TO PRESET lists only user presets with HEROES summaries, and explains an empty list', () => {
  const state = saveToPresetState();
  state.userPresets.push({
    id: 'user_0003', kind: 'user', name: 'Skip Some', mode: 'except',
    heroes: ['hero_haze', 'hero_shiv', 'hero_atlas'], values: {}, conditions: null,
  });
  const fixture = bootMenu(state);
  openPresetsForm(fixture);
  assert.ok(presetOption(fixture, 'baked_default'), 'Rewrite Default is a library row');
  openSaveTo(fixture);
  assert.deepEqual(saveToRowIds(fixture), ['user_0001', 'user_0002', 'user_0003']);
  const label = (id, className) => saveToRowPart(fixture, id, className).text;
  assert.deepEqual(
    ['user_0001', 'user_0002', 'user_0003'].map((id) => [
      label(id, 'HPColorsSaveToOptionName'),
      label(id, 'HPColorsSaveToOptionScope'),
    ]),
    [
      ['Everyone', 'ALL HEROES'],
      ['Haze Only', 'ONLY THESE — Haze'],
      ['Skip Some', 'ALL EXCEPT — Abrams, Haze +1'],
    ],
  );
  assert.equal(panel(fixture, 'HPColorsSaveToFeedback').text, '');

  const empty = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(empty);
  openSaveTo(empty);
  assert.deepEqual(saveToRowIds(empty), []);
  assert.equal(
    panel(empty, 'HPColorsSaveToFeedback').text,
    'No presets yet. NEW PRESET saves your settings as one.',
  );
  // The new-preset button still works with an empty list.
  panel(empty, 'HPColorsSaveToNewButton').events.onactivate();
  assert.equal(savedPreset(empty, 'user_0001').name, 'PRESET 1');
  openSaveTo(empty);
  assert.deepEqual(saveToRowIds(empty), ['user_0001']);
  assert.equal(panel(empty, 'HPColorsSaveToFeedback').text, '');
});

test('SAVE TO PRESET + NEW PRESET (ALL HEROES) saves the live hero settings as PRESET 3 for all heroes and applies it', () => {
  const fixture = bootLayeredMenu('SHIV');
  openPresetsForm(fixture);
  setWidthWithoutGesture(fixture, 170);
  const everyoneBefore = savedPreset(fixture, 'user_0001');
  const shivBefore = savedPreset(fixture, 'user_0002');
  assert.deepEqual(rowStatus(fixture, 'user_0002'), { active: false, text: 'CHANGED' });

  openSaveTo(fixture);
  panel(fixture, 'HPColorsSaveToNewButton').events.onactivate();

  const created = savedPreset(fixture, 'user_0003');
  assert.equal(created.name, 'PRESET 3');
  assert.equal(created.mode, 'all');
  assert.deepEqual(created.heroes, []);
  assert.equal(created.values.widthScale, 170);
  assert.equal(created.values.enemyLow, '#222222');
  assert.equal(Object.hasOwn(created, 'own'), false);
  assert.deepEqual(savedPreset(fixture, 'user_0001'), everyoneBefore);
  assert.deepEqual(savedPreset(fixture, 'user_0002'), shivBefore);
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);

  // It is applied: the live settings belong to it and apply to all heroes.
  assert.equal(currentScope(fixture).mode, 'all');
  assert.deepEqual(currentScope(fixture).heroes, []);
  assert.equal(currentScope(fixture).sourcePresetId, 'user_0003');
  assert.equal(readConfig(fixture).values.widthScale, 170);
  assert.deepEqual(rowStatus(fixture, 'user_0003'), { active: true, text: 'ACTIVE' });
  assert.deepEqual(rowStatus(fixture, 'user_0002'), { active: false, text: '' });
  assert.equal(presetFeedback(fixture), 'SAVED PRESET 3.');
  assert.equal(
    panel(fixture, 'HPColorsLiveStatus').text,
    'SAVED AS PRESET 3. SET ITS HEROES ON PRESETS.',
  );
  fixture.harness.scheduler.runByDelay(3);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, STATUS_WITHOUT_STORE);

  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  assert.equal(exitDialog(fixture).open, false);
  assert.equal(editorOpen(fixture), false);
});

test('SAVE TO PRESET + NEW PRESET skips a taken PRESET number, ignoring case', () => {
  const state = layeredMenuState();
  state.userPresets[0].name = 'preset 3';
  const fixture = bootLayeredMenu('SHIV', state);
  openPresetsForm(fixture);
  openSaveTo(fixture);
  panel(fixture, 'HPColorsSaveToNewButton').events.onactivate();
  assert.equal(savedPreset(fixture, 'user_0003').name, 'PRESET 4');
  assert.equal(
    panel(fixture, 'HPColorsLiveStatus').text,
    'SAVED AS PRESET 4. SET ITS HEROES ON PRESETS.',
  );
});

test('Escape closes SAVE TO PRESET first and keeps the editor open, ahead of the exit prompt', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  assert.equal(saveToButton(fixture).focused, false);
  openSaveTo(fixture);
  assert.equal(harnessCancel(fixture), true);
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  assert.equal(editorOpen(fixture), true);
  assert.equal(saveToButton(fixture).focused, true);
  assert.equal(harnessCancel(fixture), true);
  assert.equal(editorOpen(fixture), false);

  // The backdrop and the dialog's own cancel event close it as well.
  openEditor(fixture);
  openSaveTo(fixture);
  panel(fixture, 'HPColorsSaveToBackdrop').events.onactivate();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  openSaveTo(fixture);
  saveToDialog(fixture).events.oncancel();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  assert.equal(editorOpen(fixture), true);

  // With a CHANGED source the dialog still goes first; the next cancel prompts.
  const changed = changedFixture();
  openSaveTo(changed);
  assert.equal(harnessCancel(changed), true);
  assert.equal(saveToDialog(changed).BHasClass('Open'), false);
  assert.equal(exitDialog(changed).open, false);
  assert.equal(editorOpen(changed), true);
  assert.equal(harnessCancel(changed), true);
  assert.equal(exitDialog(changed).open, true);
});

test('opening SAVE TO PRESET closes the other dialogs and the color picker', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  const closed = (id) => panel(fixture, id).BHasClass('Open') === false;

  panel(fixture, 'HPColorsTransferButton').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsTransferDialog').BHasClass('Open'), true);
  openSaveTo(fixture);
  assert.equal(closed('HPColorsTransferDialog'), true);
  panel(fixture, 'HPColorsSaveToCloseButton').events.onactivate();

  panel(fixture, 'HPColorsCurrentScopeSelected').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsScopeDialog').BHasClass('Open'), true);
  openSaveTo(fixture);
  assert.equal(closed('HPColorsScopeDialog'), true);
  panel(fixture, 'HPColorsSaveToCloseButton').events.onactivate();

  panel(fixture, 'HPColorsPresetImportButton').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPresetTransferDialog').BHasClass('Open'), true);
  openSaveTo(fixture);
  assert.equal(closed('HPColorsPresetTransferDialog'), true);
  panel(fixture, 'HPColorsSaveToCloseButton').events.onactivate();

  panel(fixture, 'HPColorsEnemyLowSwatch').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), true);
  openSaveTo(fixture);
  assert.equal(closed('HPColorsPickerRoot'), true);
  assert.equal(saveToDialog(fixture).BHasClass('Open'), true);
});

test('the footer SAVE TO PRESET button is disabled and inert while the preset name form is open', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  const button = saveToButton(fixture);
  assert.equal(button.enabled, true);
  assert.equal(button.BHasClass('Disabled'), false);

  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  assert.equal(button.enabled, false);
  assert.equal(button.BHasClass('Disabled'), true);
  button.events.onactivate();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false, 'a disabled button opens nothing');

  panel(fixture, 'HPColorsPresetCancelEditButton').events.onactivate();
  assert.equal(button.enabled, true);
  assert.equal(button.BHasClass('Disabled'), false);

  // EDIT opens the same form, so it disables the button too.
  presetRowControl(fixture, 'user_0001', 'HPColorsPresetRowEdit').events.onactivate();
  assert.equal(button.enabled, false);
  panel(fixture, 'HPColorsPresetCancelEditButton').events.onactivate();
  assert.equal(button.enabled, true);
  openSaveTo(fixture);
});

test('the SAVE TO PRESET button glows while the settings on screen are not saved in a preset', () => {
  // The harness has no store, so the header chip is not showing the preset
  // name; the glow follows the saved-preset state on its own.
  const glows = (fixture) => saveToButton(fixture).BHasClass('Unsaved');

  // Untouched defaults match Rewrite Default: no glow. Any edit glows as a
  // reminder, UNDO back to defaults clears it, and NEW PRESET saves it away.
  const none = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(none);
  assert.equal(glows(none), false);
  setWidthWithoutGesture(none, 150);
  assert.equal(glows(none), true);
  assert.equal(saveToLabel(none), 'SAVE TO PRESET', 'no preset to name');
  assert.equal(saveToMoreShown(none), false);
  panel(none, 'HPColorsUndoButton').events.onactivate();
  assert.equal(glows(none), false);
  setWidthWithoutGesture(none, 140);
  assert.equal(glows(none), true);
  openSaveTo(none);
  panel(none, 'HPColorsSaveToNewButton').events.onactivate();
  assert.equal(glows(none), false);

  // Editing Rewrite Default glows too; the plain button opens the list.
  const baked = bootMenu(twoPresetState());
  openPresetsForm(baked);
  presetRowMain(baked, 'baked_default').events.onactivate();
  assert.equal(glows(baked), false);
  setWidthWithoutGesture(baked, 150);
  assert.equal(glows(baked), true);
  assert.equal(saveToLabel(baked), 'SAVE TO PRESET');
  // Applying a saved preset clears it.
  presetRowMain(baked, 'user_0001').events.onactivate();
  presetRowControl(baked, 'user_0001', 'HPColorsPresetRowConfirm').events.onactivate();
  assert.equal(glows(baked), false);

  const fixture = bootMenu(twoPresetState());
  openPresetsForm(fixture);
  assert.equal(glows(fixture), false);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.equal(glows(fixture), false);

  setWidthWithoutGesture(fixture, 150);
  assert.equal(glows(fixture), true);
  // The glow does not depend on which page is showing.
  selectEnemyBar(fixture);
  assert.equal(glows(fixture), true);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(glows(fixture), false);

  // REVERT clears it.
  setWidthWithoutGesture(fixture, 160);
  assert.equal(glows(fixture), true);
  leaveAndReturnToPresets(fixture);
  rowAction(fixture, 'user_0001', 'HPColorsPresetRowRevert').events.onactivate();
  assert.equal(glows(fixture), false);

  // SAVE TO that preset clears it too.
  setWidthWithoutGesture(fixture, 170);
  assert.equal(glows(fixture), true);
  openSaveTo(fixture);
  armAndConfirmSaveTo(fixture, 'user_0001');
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  assert.equal(glows(fixture), false);
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 170);

  // Saving into a different preset moves the source there, still not glowing.
  setWidthWithoutGesture(fixture, 120);
  assert.equal(glows(fixture), true);
  openSaveTo(fixture);
  armAndConfirmSaveTo(fixture, 'user_0002');
  assert.equal(currentScope(fixture).sourcePresetId, 'user_0002');
  assert.equal(glows(fixture), false);
});

test('the footer button names a CHANGED source and saves into it in one click, then returns to SAVE TO PRESET', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  const more = saveToMore(fixture);
  // Nothing applied yet: plain label, ▼ collapsed and inert.
  assert.equal(saveToLabel(fixture), 'SAVE TO PRESET');
  assert.equal(saveToMoreShown(fixture), false);
  assert.deepEqual(actionUsable(more), HIDDEN);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  assert.equal(saveToLabel(fixture), 'SAVE TO PRESET', 'an unchanged applied preset is not named');
  assert.equal(saveToMoreShown(fixture), false);

  // Editing the applied preset: name mode. UNDO flips it back.
  setWidthWithoutGesture(fixture, 150);
  assert.equal(saveToLabel(fixture), 'SAVE TO EVERYONE');
  assert.equal(saveToMoreShown(fixture), true);
  assert.deepEqual(actionUsable(more), USABLE);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(saveToLabel(fixture), 'SAVE TO PRESET');
  assert.equal(saveToMoreShown(fixture), false);
  assert.deepEqual(actionUsable(more), HIDDEN);

  // REVERT flips it back too.
  setWidthWithoutGesture(fixture, 160);
  assert.equal(saveToLabel(fixture), 'SAVE TO EVERYONE');
  leaveAndReturnToPresets(fixture);
  rowAction(fixture, 'user_0001', 'HPColorsPresetRowRevert').events.onactivate();
  assert.equal(saveToLabel(fixture), 'SAVE TO PRESET');
  assert.equal(saveToMoreShown(fixture), false);

  // Another preset as the source: the label follows it and one click saves into
  // it, keeping its name and HEROES, without opening the list dialog.
  presetRowMain(fixture, 'user_0002').events.onactivate();
  setWidthWithoutGesture(fixture, 140);
  assert.equal(saveToLabel(fixture), 'SAVE TO HAZE ONLY');
  assert.equal(saveToButton(fixture).BHasClass('Unsaved'), true);
  const everyoneBefore = savedPreset(fixture, 'user_0001');
  saveToButton(fixture).events.onactivate();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false, 'the list dialog stays closed');
  const saved = savedPreset(fixture, 'user_0002');
  assert.equal(saved.name, 'Haze Only');
  assert.equal(saved.mode, 'selected');
  assert.deepEqual(saved.heroes, ['hero_haze']);
  assert.equal(saved.values.widthScale, 140);
  assert.deepEqual(savedPreset(fixture, 'user_0001'), everyoneBefore);
  assert.equal(currentScope(fixture).sourcePresetId, 'user_0002');
  assert.equal(saveToButton(fixture).BHasClass('Unsaved'), false, 'the glow is off');
  assert.equal(saveToLabel(fixture), 'SAVE TO PRESET');
  assert.equal(saveToMoreShown(fixture), false);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'SAVED TO HAZE ONLY.');
  assert.equal(saveToButton(fixture).focused, true);
  assertPlainUserRow(fixture, 'user_0002', 'ACTIVE');

  // The saved settings are not CHANGED, so EXIT closes without the prompt.
  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  assert.equal(exitDialog(fixture).open, false);
  assert.equal(editorOpen(fixture), false);
});

test('the ▼ button opens the list for a CHANGED source and can save into another preset', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  setWidthWithoutGesture(fixture, 150);
  assert.equal(saveToMoreShown(fixture), true);
  const before = readMenuState(fixture).userPresets;

  saveToMore(fixture).events.onactivate();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), true);
  assert.deepEqual(saveToRowIds(fixture), ['user_0001', 'user_0002']);
  assert.deepEqual(readMenuState(fixture).userPresets, before, 'opening the list saves nothing');
  armAndConfirmSaveTo(fixture, 'user_0002');
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  assert.equal(savedPreset(fixture, 'user_0002').values.widthScale, 150);
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 100);
  assert.equal(saveToLabel(fixture), 'SAVE TO PRESET');
  assert.equal(saveToMoreShown(fixture), false);

  // Unchanged: the main button opens the list.
  saveToButton(fixture).events.onactivate();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), true);
});

test('SAVE TO <NAME> and ▼ are disabled and inert while the preset name form is open', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  setWidthWithoutGesture(fixture, 150);
  const before = readMenuState(fixture).userPresets;
  const main = saveToButton(fixture);
  const more = saveToMore(fixture);
  assert.equal(main.enabled, true);
  assert.equal(more.enabled, true);

  panel(fixture, 'HPColorsPresetNewButton').events.onactivate();
  assert.equal(main.enabled, false);
  assert.equal(main.BHasClass('Disabled'), true);
  assert.equal(more.enabled, false);
  assert.equal(more.BHasClass('Disabled'), true);
  main.events.onactivate();
  more.events.onactivate();
  assert.equal(saveToDialog(fixture).BHasClass('Open'), false);
  assert.deepEqual(readMenuState(fixture).userPresets, before, 'a disabled button saves nothing');

  panel(fixture, 'HPColorsPresetCancelEditButton').events.onactivate();
  assert.equal(main.enabled, true);
  assert.equal(more.enabled, true);
  assert.equal(saveToLabel(fixture), 'SAVE TO EVERYONE');
});

test('SAVE TO <NAME> truncates a long name with an ellipsis and still saves into it', () => {
  const state = saveToPresetState();
  state.userPresets[0].name = 'Very Long Preset Name';
  state.userPresets[1].name = 'ABCDEFGHIJ';
  const fixture = bootMenu(state);
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0001').events.onactivate();
  setWidthWithoutGesture(fixture, 150);
  assert.equal(saveToLabel(fixture), 'SAVE TO VERY LONG…');
  saveToButton(fixture).events.onactivate();
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 150);
  assert.equal(savedPreset(fixture, 'user_0001').name, 'Very Long Preset Name');
  assert.equal(saveToLabel(fixture), 'SAVE TO PRESET');

  // Exactly ten characters fit whole.
  presetRowMain(fixture, 'user_0002').events.onactivate();
  setWidthWithoutGesture(fixture, 130);
  assert.equal(saveToLabel(fixture), 'SAVE TO ABCDEFGHIJ');
});

test('SAVE TO <NAME> saves nothing when the source is deleted', () => {
  const fixture = bootMenu(saveToPresetState());
  openPresetsForm(fixture);
  presetRowMain(fixture, 'user_0002').events.onactivate();
  setWidthWithoutGesture(fixture, 150);
  assert.equal(saveToLabel(fixture), 'SAVE TO HAZE ONLY');

  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowDelete').events.onactivate();
  presetRowControl(fixture, 'user_0002', 'HPColorsPresetRowConfirm').events.onactivate();
  assert.equal(readMenuState(fixture).userPresets.length, 1);
  assert.equal(saveToLabel(fixture), 'SAVE TO PRESET');
  assert.equal(saveToMoreShown(fixture), false);
  // The settings are no longer saved anywhere, so the reminder glow stays on.
  assert.equal(saveToButton(fixture).BHasClass('Unsaved'), true);

  // The button no longer names a target: it just opens the list, saving nothing.
  saveToButton(fixture).events.onactivate();
  assert.equal(savedPreset(fixture, 'user_0001').values.widthScale, 100);
  assert.equal(saveToDialog(fixture).BHasClass('Open'), true);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text.startsWith('SAVED TO'), false);
});

test('the SAVE TO PRESET CSS animates only opacity and uses no shadows or clipping', () => {
  const css = menuStyleSource.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = Array.from(css.matchAll(/([^{}]*SaveTo[^{}]*)\{([^{}]*)\}/g));
  assert.ok(blocks.length >= 6, 'SAVE TO PRESET rules exist');
  for (const [, selector, body] of blocks) {
    assert.doesNotMatch(body, /box-shadow|clip-path/, selector.trim());
    const transition = body.match(/transition-property:\s*([^;]+);/);
    if (transition) assert.equal(transition[1].trim(), 'opacity', selector.trim());
  }
  const pulse = css.match(/@keyframes\s+'([^']*SaveTo[^']*)'\s*\{([\s\S]*?)\r?\n\}/);
  assert.ok(pulse, 'the glow has a keyframes block');
  const properties = Array.from(pulse[2].matchAll(/([a-z-]+)\s*:/g), (match) => match[1]);
  assert.ok(properties.length >= 2);
  assert.deepEqual(Array.from(new Set(properties)), ['opacity']);
  assert.match(css, new RegExp(`animation-name:\\s*${pulse[1]}\\s*;`));
});


test('all readout sliders start at zero and span the world-panel canvas in CSS pixels', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  for (const [base, key, limit] of [
    ['HPColorsReadoutOffsetX', 'readoutOffsetX', 200],
    ['HPColorsReadoutOffsetY', 'readoutOffsetY', 210],
    ['HPColorsAllyReadoutOffsetX', 'allyReadoutOffsetX', 200],
    ['HPColorsAllyReadoutOffsetY', 'allyReadoutOffsetY', 210],
    ['HPColorsEnemyPulseReadoutOffsetX', 'enemyPulseReadoutOffsetX', 200],
    ['HPColorsEnemyPulseReadoutOffsetY', 'enemyPulseReadoutOffsetY', 210],
  ]) {
    const slider = panel(fixture, base + 'Slider');
    const entry = panel(fixture, base + 'Entry');
    assert.equal(slider.min, -limit, key);
    assert.equal(slider.max, limit, key);
    assert.equal(slider.value, 0, key);
    assert.equal(entry.text, '0', key);
  }
});


test('Units pages expose independent gates, neutral HSL/hex, and scoped reset/Undo', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryUnits').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'NPC COLORING');
  assert.match(panel(fixture, 'HPColorsPageDescription').text, /independently/);
  const initial = readConfig(fixture);
  for (const key of [
    'npcEnemyEnabled',
    'npcAllyEnabled',
    'npcNeutralEnabled',
    'buildingEnemyEnabled',
    'buildingAllyEnabled',
  ])
    assert.equal(initial.values[key], false, key);

  panel(fixture, 'HPColorsNpcEnemyToggle').events.onactivate();
  panel(fixture, 'HPColorsNpcAllyToggle').events.onactivate();
  assert.equal(readConfig(fixture).values.npcEnemyEnabled, true);
  assert.equal(readConfig(fixture).values.npcAllyEnabled, true);
  assert.equal(readConfig(fixture).values.enemyEnabled, true);
  assert.equal(readConfig(fixture).values.allyEnabled, false);

  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'NEUTRAL COLORING');
  const neutralRow = panel(fixture, 'HPColorsNeutralColorRow');
  assert.equal(neutralRow.BHasClass('Disabled'), true);
  assert.equal(panel(fixture, 'HPColorsNeutralColorHex').text, '#5BEFB5');
  panel(fixture, 'HPColorsNpcNeutralToggle').events.onactivate();
  assert.equal(neutralRow.BHasClass('Disabled'), false);

  panel(fixture, 'HPColorsNeutralColorSwatch').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), true);
  const hue = panel(fixture, 'HPColorsPickerHueSlider');
  hue.value = (hue.value + 30) % 360;
  hue.events.onvaluechanged();
  assert.notEqual(readConfig(fixture).values.neutralColor, '#5BEFB5');
  panel(fixture, 'HPColorsPickerDone').events.onactivate();
  const neutralHex = panel(fixture, 'HPColorsNeutralColorHex');
  neutralHex.text = '#2468AC';
  neutralHex.events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.neutralColor, '#2468AC');

  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'BUILDING COLORING');
  panel(fixture, 'HPColorsBuildingEnemyToggle').events.onactivate();
  panel(fixture, 'HPColorsBuildingAllyToggle').events.onactivate();
  assert.equal(readConfig(fixture).values.buildingEnemyEnabled, true);
  assert.equal(readConfig(fixture).values.buildingAllyEnabled, true);
  assert.equal(readConfig(fixture).values.allyEnabled, false);

  panel(fixture, 'HPColorsTab0').events.onactivate();
  requestReset(fixture);
  confirmReset(fixture);
  const reset = readConfig(fixture).values;
  assert.equal(reset.npcEnemyEnabled, false);
  assert.equal(reset.npcAllyEnabled, false);
  assert.equal(reset.npcNeutralEnabled, true);
  assert.equal(reset.neutralColor, '#2468AC');
  assert.equal(reset.buildingEnemyEnabled, true);
  assert.equal(reset.buildingAllyEnabled, true);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.npcEnemyEnabled, true);
  assert.equal(readConfig(fixture).values.npcAllyEnabled, true);
});


test('a missing Units color control keeps menu boot retryable', () => {
  const fixture = bootMenu(
    { version: 1, values: {}, scopes: [] },
    {
      beforeBoot(harness) {
        harness.root.FindChildTraverse('HPColorsNeutralColorHex').DeleteAsync();
      },
    },
  );
  assert.equal(
    typeof fixture.harness.root.FindChildTraverse('HPColorsMenuButton').events.onactivate,
    'undefined',
  );
  fixture.harness.root.add(new MockPanel('HPColorsNeutralColorHex', {
    findCounts: fixture.harness.findCounts,
    childReadCounts: fixture.harness.childReadCounts,
  }));
  fixture.harness.$.HPColorsMenuBoot();
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryUnits').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'NEUTRAL COLORING');
});


test('Appearance toggles publish exact keys and reset/Undo only their section', () => {
  const keys = ['criticalIndicatorVisible', 'playerNamesVisible'];
  const ids = ['HPColorsCriticalIndicatorToggle', 'HPColorsPlayerNamesToggle'];
  const fixture = bootMenu({ version: 1, values: { widthScale: 123 }, scopes: [] });
  openEditor(fixture);
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'STOCK APPEARANCE');
  assert.equal(panel(fixture, 'HPColorsSettingsOverviewAppearance').BHasClass('Active'), true);
  for (let index = 0; index < keys.length; index++) {
    const before = readConfig(fixture);
    const dispatches = configDispatches(fixture).length;
    panel(fixture, ids[index]).events.onactivate();
    const after = readConfig(fixture);
    assert.equal(after.values[keys[index]], false);
    assert.deepEqual(after.values, { ...before.values, [keys[index]]: false });
    assert.equal(configDispatches(fixture).length, dispatches + 1);
    assert.deepEqual(Object.keys(after).sort(), ['magic_word', 'revision', 'values', 'version']);
  }
  requestReset(fixture);
  confirmReset(fixture);
  for (const key of keys) assert.equal(readConfig(fixture).values[key], true);
  assert.equal(readConfig(fixture).values.widthScale, 123);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  for (const key of keys) assert.equal(readConfig(fixture).values[key], false);
  assert.equal(readConfig(fixture).values.widthScale, 123);
});


test('each required Appearance panel supports explicit boot retry without duplicates', () => {
  for (const id of ['HPColorsSettingsOverviewAppearance', 'HPColorsCriticalIndicatorToggle',
    'HPColorsPlayerNamesToggle']) {
    const fixture = bootMenu(undefined, {
      beforeBoot(harness) { harness.root.FindChildTraverse(id).DeleteAsync(); },
    });
    assert.equal(configDispatches(fixture).length, 0, id);
    assert.equal(fixture.harness.scheduler.jobs.length, 0, id);
    fixture.harness.root.add(new MockPanel(id));
    fixture.harness.$.HPColorsMenuBoot();
    const dispatches = configDispatches(fixture).length;
    const jobs = fixture.harness.scheduler.jobs.length;
    fixture.harness.$.HPColorsMenuBoot();
    assert.equal(configDispatches(fixture).length, dispatches, id);
    assert.equal(fixture.harness.scheduler.jobs.length, jobs, id);
    openEditor(fixture);
    panel(fixture, 'HPColorsTab2').events.onactivate();
    panel(fixture, 'HPColorsCriticalIndicatorToggle').events.onactivate();
    assert.equal(readConfig(fixture).values.criticalIndicatorVisible, false, id);
  }
});
