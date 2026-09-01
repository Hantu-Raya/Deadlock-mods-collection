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
  lowThreshold: 25,
  highThreshold: 65,
  enemyTeamHigh: false,
  ghoulOpacityEnabled: false,
  ghoulOpacity: 100,
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
  panel(fixture, 'HPColorsTab3').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ENEMY STAMINA');
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
    ghoulOpacityEnabled: true,
    ghoulOpacity: 35,
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

test('overview layout reset applies immediately to the published snapshot', () => {
  const fixture = bootMenu({
    version: 1,
    values: {
      widthScale: 230,
      heightScale: 160,
      positionX: 300,
      positionY: 200,
    },
    scopes: [],
  });
  openEditor(fixture);
  selectOverviewLayout(fixture);
  const beforeConfig = readConfig(fixture);

  requestReset(fixture);
  confirmReset(fixture);

  const resetState = readMenuState(fixture);
  const resetConfig = readConfig(fixture);
  assert.equal(resetState.values.widthScale, 100);
  assert.equal(resetState.values.heightScale, 100);
  assert.equal(resetState.values.positionX, 0);
  assert.equal(resetState.values.positionY, 0);
  assert.equal(resetConfig.revision, beforeConfig.revision + 1);
  assert.deepEqual(resetConfig.values, resetState.values);
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
    'PASTE AN HPCRP1 PRESET CODE.',
  );
});

test('editor close clears inline rename and delete confirmation transients', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
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

  let option = presetOption(fixture, 'user_0001');
  option.FindChildrenWithClassTraverse('HPColorsPresetOptionName')[0]
    .events.onactivate();
  assert.equal(
    presetOption(fixture, 'user_0001')
      .FindChildrenWithClassTraverse('HPColorsPresetOptionName')[0].type,
    'TextEntry',
  );

  panel(fixture, 'HPColorsDoneButton').events.onactivate();
  openEditor(fixture);
  option = presetOption(fixture, 'user_0001');
  assert.notEqual(
    option.FindChildrenWithClassTraverse('HPColorsPresetOptionName')[0].type,
    'TextEntry',
  );

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

test('menu boot can retry after a transient CreatePanel failure', () => {
  const fixture = bootMenu(
    { version: 1, values: {}, scopes: [] },
    {
      beforeBoot(harness) {
        const createPanel = harness.$.CreatePanel;
        let failed = false;
        harness.$.CreatePanel = (type, parent, id) => {
          if (!failed && id === 'HPColorsHeroOption3') {
            failed = true;
            return null;
          }
          return createPanel(type, parent, id);
        };
      },
    },
  );
  assert.equal(
    typeof panel(fixture, 'HPColorsMenuButton').events.onactivate,
    'undefined',
  );

  fixture.harness.$.HPColorsMenuBoot();

  assert.equal(
    typeof panel(fixture, 'HPColorsMenuButton').events.onactivate,
    'function',
  );
});

test('color picker closes from its backdrop and condition swatches accept clicks', () => {
  assert.match(
    layoutSource,
    /id="HPColorsConditionColorSwatch"[^>]*hittest="true"/,
  );
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
  panel(fixture, 'HPColorsTab3').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ALLY PULSE');
  assert.equal(panel(fixture, 'HPColorsTab4').BHasClass('Available'), false);

  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsHeaderCategory').text, 'HEALTH INFO');
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'HP TEXT');
});

test('shared thresholds live on the Enemy Bar page', () => {
  const enemyBarStart = layoutSource.indexOf(
    '<Panel id="HPColorsSettingsEnemyBar"',
  );
  const enemyBarEnd = layoutSource.indexOf(
    '<Panel id="HPColorsSettingsEnemyFeedback"',
    enemyBarStart,
  );
  assert.ok(enemyBarStart >= 0);
  assert.ok(enemyBarEnd > enemyBarStart);
  for (const id of [
    'HPColorsSharedLowThresholdRow',
    'HPColorsSharedHighThresholdRow',
  ]) {
    const rowIndex = layoutSource.indexOf(`id="${id}"`);
    assert.ok(rowIndex > enemyBarStart && rowIndex < enemyBarEnd, id);
  }
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

test('Preset INFO control occupies the page heading instead of the rule', () => {
  assert.match(
    layoutSource,
    /<Panel class="HPColorsPageHeading">[\s\S]*id="HPColorsPresetInfoToggle"[\s\S]*<\/Panel>\s*<Panel class="HPColorsPageRule" \/>/,
  );
  assert.doesNotMatch(
    layoutSource,
    /<Panel class="HPColorsPageRule">[\s\S]*id="HPColorsPresetInfoToggle"/,
  );
  assert.match(
    menuStyleSource,
    /\.HPColorsPresetInfoToggle\s*\{[^}]*visibility:\s*visible;[^}]*opacity:\s*0;/s,
  );
  assert.match(
    menuStyleSource,
    /\.HPColorsPresetInfoToggle\.Available\s*\{[^}]*opacity:\s*1;/s,
  );
});

test('Presets guide starts hidden and toggles only on the Presets page', () => {
  const fixture = bootMenu();
  openEditor(fixture);

  const info = panel(fixture, 'HPColorsPresetInfoToggle');
  const guide = panel(fixture, 'HPColorsPresetGuide');
  assert.equal(info.BHasClass('Available'), false);
  assert.equal(info.enabled, false);
  assert.equal(guide.BHasClass('Visible'), false);

  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(info.BHasClass('Available'), true);
  assert.equal(info.enabled, true);
  assert.equal(guide.BHasClass('Visible'), false);

  info.events.onactivate();
  assert.equal(info.BHasClass('Active'), true);
  assert.equal(guide.BHasClass('Visible'), true);

  info.events.onactivate();
  assert.equal(info.BHasClass('Active'), false);
  assert.equal(guide.BHasClass('Visible'), false);

  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  assert.equal(info.BHasClass('Available'), false);
  assert.equal(info.enabled, false);
  assert.equal(guide.BHasClass('Visible'), false);
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

test('entry and shared controls use their intended navigation surfaces', () => {
  const changeHeroIndex = layoutSource.indexOf('<Button id="changehero"');
  const subOptionsIndex = layoutSource.indexOf('<Panel id="SubOptions">');
  const feedbackIndex = layoutSource.indexOf('<Panel class="FeedbackRow">');
  const entryIndex = layoutSource.indexOf('<Button id="HPColorsMenuButton"');
  const settingsIndex = layoutSource.indexOf('<Panel class="SettingsRow">');
  assert.ok(changeHeroIndex >= 0);
  assert.ok(subOptionsIndex > changeHeroIndex);
  assert.ok(feedbackIndex > subOptionsIndex);
  assert.ok(entryIndex > feedbackIndex);
  assert.ok(settingsIndex > entryIndex);
  assert.match(
    layoutSource,
    /<Button id="HPColorsMenuButton" class="nav_menu_item minor">\s*<Label text="HP COLORS V2" class="menuButtonLabel" \/>\s*<\/Button>/,
  );
  assert.doesNotMatch(
    layoutSource,
    /HPColorsMenu(?:Accent|Swatch|Binding)|class="[^"]*HPColorsMenuButton/,
  );
  assert.match(layoutSource, /text="SHARED LOW THRESHOLD"/);
  assert.match(layoutSource, /text="SHARED HIGH THRESHOLD"/);
  assert.doesNotMatch(layoutSource, /HPColorsLowThreshold(?:SliderHost|Entry)/);
  assert.doesNotMatch(layoutSource, /HPColorsHighThreshold(?:SliderHost|Entry)/);

  const fixture = bootMenu();
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'SHIELDS');
  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'INDICATORS');
});
