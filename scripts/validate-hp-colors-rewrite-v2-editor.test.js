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
const legacyLayoutSource = fs.readFileSync(path.resolve(__dirname, '../hp_colors_rewrite/panorama/layout/hud_escape_menu.xml'), 'utf8');
const MENU_STATE_ATTR = 'hp_colors_v2_menu_state';
const contractContext = vm.createContext({ $: {} });
vm.runInContext(contractSource, contractContext);
const shippedDefaults = JSON.parse(JSON.stringify(
  contractContext.$.HPColorsV2ContractFactory.create().defaults,
));
const CONFIG_ATTR = 'hp_colors_v2_config';
const PLAYER_BAR_DEFAULTS = Object.fromEntries(["enemyEnabled", "enemyVisible", "enemyMode", "enemyLow", "enemyMid", "enemyHigh", "enemyTeamHigh", "enemyHealing", "enemyDelta", "enemyBulletShield", "enemyRatkingArmor", "allyEnabled", "allyVisible", "allyMode", "allyLow", "allyMid", "allyHigh", "allyTeamHigh", "allyHealing", "allyDelta", "allyBulletShield", "allyRatkingArmor"].map(key => [key, shippedDefaults[key]]));
const PLAYER_BAR_KEYS = Object.keys(PLAYER_BAR_DEFAULTS);
// This harness loads no storage runtime, so the status chip's resting text is
// the save-unavailable state; the storage E2E suite covers the SAVED states.
const STATUS_WITHOUT_STORE = 'SAVE UNAVAILABLE';

function installLayoutTree(harness, source) {
  const stack = [harness.root];
  for (const token of source.match(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g) || []) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    const tag = token.match(/^<([A-Za-z][\w.-]*)/)[1];
    const id = token.match(/\bid="([^"]+)"/)?.[1] || '';
    let child = stack.at(-1);
    if (!['root', 'styles', 'scripts', 'include', 'snippets', 'snippet'].includes(tag)) {
      child = child.add(new MockPanel(id, {
        classes: (token.match(/\bclass="([^"]*)"/)?.[1] || '').split(' ').filter(Boolean),
        findCounts: harness.findCounts, childReadCounts: harness.childReadCounts,
      }));
      child.SetFocus = () => {
        const previous = harness.layoutFocus;
        if (previous === child) return;
        if (previous) {
          previous.focused = false;
          previous.events.onblur?.();
        }
        harness.layoutFocus = child;
        child.focused = true;
      };
      child.BHasKeyFocus = () => child.focused;
      child.BHasDescendantKeyFocus = () => child.Children().some(item => item.BHasKeyFocus?.() || item.BHasDescendantKeyFocus?.());
    }
    if (!token.endsWith('/>')) stack.push(child);
  }
}

function installLayoutPanels(harness, source = layoutSource, tree = false) {
  if (tree) installLayoutTree(harness, source);
  const ids = new Set(
    Array.from(source.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
  );
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
    }));
  }
  const native = harness.root.FindChildTraverse('HPColorsNativePicker');
  if (native) {
    const hex = native.add(new MockPanel('HexValue'));
    const dispatch = harness.$.DispatchEvent;
    harness.$.DispatchEvent = (...args) => {
      if (args[0] === 'TextEntryChanged' && args[1] === hex) {
        const rgb = hex.text.replace('#', '').match(/../g).map((byte) => parseInt(byte, 16));
        if (native.events.CitadelColorPickerColorChanged)
          native.events.CitadelColorPickerColorChanged(...rgb);
      }
      return dispatch(...args);
    };
  }
  const shape = harness.root.FindChildTraverse('HPColorsStaminaShape');
  if (shape) for (const option of ['arrow', 'circle', 'box'])
    shape.AddOption(harness.root.FindChildTraverse(option));
}

function bootMenu(menuState, options = {}) {
  const harness = createPanoramaHarness(options.harnessOptions || {});
  installLayoutPanels(harness, options.layout || layoutSource, options.tree);
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
    globals: options.globals,
  });
  if (options.stateReadCounter || options.intents) {
    const factory = harness.$.HPColorsV2StateFactory;
    harness.$.HPColorsV2StateFactory = { create(config) {
      const instance = factory.create(config);
      return { send(intent) {
        if (options.intents) options.intents.push(intent.type);
        return instance.send(intent);
      }, read() {
        if (options.stateReadCounter) options.stateReadCounter.count++;
        return instance.read();
      } };
    } };
  }
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
  panel(fixture, 'HPColorsPlayerSideEnemy').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'BARS');
}

function selectStamina(fixture) {
  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSettingsStamina').BHasClass('Active'), true);
}

function selectOverviewLayout(fixture) {
  panel(fixture, 'HPColorsCategoryOverview').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'LAYOUT');
}

function selectAllyBar(fixture) {
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();
  panel(fixture, 'HPColorsPlayerSideAlly').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'BARS');
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

test('width slider reaches the 400 percent maximum and clamps typed values', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  const slider = panel(fixture, 'HPColorsWidthSlider');
  const entry = panel(fixture, 'HPColorsWidthEntry');

  assert.equal(slider.min, 60);
  assert.equal(slider.max, 400);
  slider.value = 400;
  slider.events.onvaluechanged();
  assert.equal(readMenuState(fixture).values.widthScale, 400);
  assert.equal(slider.value, 400);

  entry.text = '999';
  entry.events.ontextentrysubmit();
  assert.equal(readMenuState(fixture).values.widthScale, 400);
  assert.equal(slider.value, 400);
});

test('movement slider windows preserve full typed bounds and pip opacity visibility', () => {
  const fixture = bootMenu({ version: 1, values: { enemyPipColorEnabled: false }, scopes: [] });
  openEditor(fixture);
  for (const base of ['Position', 'StaminaOffset', 'UltOffset', 'LevelOffset']) {
    for (const axis of ['X', 'Y']) {
      const key = `${base[0].toLowerCase()}${base.slice(1)}${axis}`;
      const slider = panel(fixture, `HPColors${base}${axis}Slider`);
      const entry = panel(fixture, `HPColors${base}${axis}Entry`);
      const percent = base === 'UltOffset' || base === 'LevelOffset';
      const displayScale = percent ? 100 / (axis === 'X' ? 76 : 18) : 1;
      const limit = axis === 'X' ? 30 : 20;
      assert.ok(Math.abs(slider.min + limit * displayScale) < 1e-10, key);
      assert.ok(Math.abs(slider.max - limit * displayScale) < 1e-10, key);
      for (const direction of [-1, 1]) {
        slider.events.onmousedown();
        slider.value = direction * limit * displayScale;
        slider.events.onvaluechanged();
        slider.events.onmouseup();
        assert.equal(readMenuState(fixture).values[key], direction * limit * 10, key);
        entry.text = String(direction * 150 * displayScale);
        entry.events.ontextentrysubmit();
        assert.equal(readMenuState(fixture).values[key], direction * 1500, key);
        const displayed = Math.round(direction * 150 * displayScale * 10) / 10;
        assert.equal(entry.text, String(displayed), key);
        assert.ok(Math.abs(slider.value - direction * limit * displayScale) < 1e-10, key);
        assert.equal(readConfig(fixture).values[key], direction * 1500, key);
      }
    }
  }
  assert.equal(readMenuState(fixture).values.enemyPipColorEnabled, false);
  assert.equal(readMenuState(fixture).values.allyPipColorEnabled, false);
  assert.equal(panel(fixture, 'HPColorsPipOpacityRow').BHasClass('FeatureOff'), false);
  panel(fixture, 'HPColorsPipsVisibleToggle').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPipOpacityRow').BHasClass('FeatureOff'), true);
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
  assert.equal(panel(fixture, 'HPColorsResetDialogTitle').text, 'RESET BARS');
  assert.match(panel(fixture, 'HPColorsResetDialogMessage').text, /both enemy and ally/);
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
  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsResetDialog').BHasClass('Open'), true);
  confirmReset(fixture);

  const resetState = readMenuState(fixture);
  const resetConfig = readConfig(fixture);
  for (const key of PLAYER_BAR_KEYS)
    assert.equal(resetState.values[key], PLAYER_BAR_DEFAULTS[key], key);
  for (const key of Object.keys(beforeState.values)) {
    if (!PLAYER_BAR_KEYS.includes(key))
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
  assert.equal(resetState.values.staminaOffsetX, 0, 'offset belongs to STAMINA');
  assert.equal(resetState.values.staminaOffsetY, 0, 'offset belongs to STAMINA');
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
  assert.equal(resetState.values.widthScale, 148);
  assert.equal(resetState.values.heightScale, 80);
  assert.equal(resetState.values.positionX, 0);
  assert.equal(resetState.values.positionY, -38);
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

test('HEROES picker lists, searches and selects new retail heroes by stable key', () => {
  const heroes = [
    ['hero_baba', 'Baba'],
    ['hero_deadpack', 'Deadman Danny'],
    ['hero_nurse', 'Nurse Harrow'],
    ['hero_ratking', 'Rat King'],
    ['hero_chessmaster', 'Solomon'],
    ['hero_artist', 'Violet'],
  ];
  for (const [key, name] of heroes) {
    const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
    openPresetsForm(fixture);
    const option = scopeOption(fixture, key);
    assert.equal(option.GetChild(0).text, name);
    for (const [mode, control, summary, selectedClass] of [
      ['selected', 'HPColorsCurrentScopeSelected', 'ONLY THESE', 'Selected'],
      ['except', 'HPColorsCurrentScopeExcept', 'ALL EXCEPT', 'Skipped'],
    ]) {
      panel(fixture, 'HPColorsCurrentScopeAll').events.onactivate();
      panel(fixture, control).events.onactivate();
      const search = panel(fixture, 'HPColorsScopeSearch');
      for (const query of [name.toLowerCase(), key]) {
        search.text = query;
        search.events.ontextentrychange();
        assert.equal(option.BHasClass('FilteredOut'), false);
        assert.equal(scopeOption(fixture, 'hero_haze').BHasClass('FilteredOut'), true);
      }
      search.text = 'no matching hero';
      search.events.ontextentrychange();
      assert.equal(option.BHasClass('FilteredOut'), true);
      search.text = '';
      search.events.ontextentrychange();
      option.events.onactivate();
      assert.equal(currentScope(fixture).mode, mode);
      assert.deepEqual(currentScope(fixture).heroes, [key]);
      assert.equal(option.BHasClass(selectedClass), true);
      assert.equal(panel(fixture, 'HPColorsCurrentScopeSummary').text, `${summary} — ${name}`);
      option.events.onactivate();
      assert.deepEqual(currentScope(fixture).heroes, []);
    }
  }
});

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
    'Save settings as presets and choose their heroes.',
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

test('retired builder four-rail layout still shows its warning', () => {
  const fixture = bootMenu(undefined, { layout: legacyLayoutSource });
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'OLD PRESET VPK');
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ENEMY BAR');
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

// Failure modes: the QOLLOCK pak02 ships its own Escape-menu copy; when it lags the
// canonical menu, a missing row or slider host stops boot, the HP COLORS V2 button stays
// greyed out and saved settings never publish (2.2.0 QOLLOCK build).
test('the shipped QOLLOCK Escape menu boots the editor and publishes settings', () => {
  const qollockLayout = fs.readFileSync(path.resolve(__dirname,
    '../hp_colors_rewrite_v2_qollock/panorama/layout/hud_escape_menu.xml'), 'utf8');
  const fixture = bootMenu({ version: 1, values: { enemyLow: '#123456' }, scopes: [] }, { layout: qollockLayout });
  assert.equal(panel(fixture, 'HPColorsMenuButton').BHasClass('Loading'), false, 'menu booted');
  openEditor(fixture);
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), true);
  assert.equal(readConfig(fixture).values.enemyLow, '#123456', 'saved settings published');
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

function nativeColor(fixture, r, g, b) {
  panel(fixture, 'HPColorsNativePicker').events.CitadelColorPickerColorChanged(r, g, b);
}

test('native picker seed is inert, RGB previews live, and each session has one Undo', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  const before = readConfig(fixture).values.enemyLow;
  const count = configDispatches(fixture).length;
  panel(fixture, 'HPColorsEnemyLowSwatch').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsNativePicker').FindChildTraverse('HexValue').text, before.slice(1));
  assert.equal(configDispatches(fixture).length, count);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
  nativeColor(fixture, 16, 32, 48);
  assert.equal(readConfig(fixture).values.enemyLow, '#102030');
  nativeColor(fixture, 0, 255, 1);
  assert.equal(readConfig(fixture).values.enemyLow, '#00FF01');
  panel(fixture, 'HPColorsPickerDone').events.onactivate();
  panel(fixture, 'HPColorsEnemyLowSwatch').events.onactivate();
  nativeColor(fixture, 255, 255, 255);
  panel(fixture, 'HPColorsPickerBackdrop').events.onactivate();
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, '#00FF01');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, before);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
});

test('native picker Escape restores opening color without Undo and returns focus', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  const before = readConfig(fixture).values.enemyLow;
  const swatch = panel(fixture, 'HPColorsEnemyLowSwatch');
  swatch.events.onactivate();
  nativeColor(fixture, 1, 2, 3);
  fixture.harness.$.HPColorsMenuCancel();
  assert.equal(readConfig(fixture).values.enemyLow, before);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
  assert.equal(swatch.focused, true);
});

test('native construction failure keeps hex-only picker editing available and logs once', () => {
  const fixture = bootMenu(undefined, { beforeBoot(harness) {
    const native = harness.root.FindChildTraverse('HPColorsNativePicker');
    if (native) native.RemoveAndDeleteChildren();
  } });
  openEditor(fixture);
  const swatch = panel(fixture, 'HPColorsEnemyLowSwatch');
  swatch.events.onactivate();
  const hex = panel(fixture, 'HPColorsPickerHex');
  hex.text = '#2468AC';
  hex.events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.enemyLow, '#2468AC');
  panel(fixture, 'HPColorsPickerDone').events.onactivate();
  swatch.events.onactivate();
  assert.equal(fixture.harness.logs.filter((line) => /native color picker/i.test(line)).length, 1);
});

test('invalid native picker falls back without blocking boot or recording opening as Undo', () => {
  const fixture = bootMenu(undefined, { beforeBoot(harness) {
    harness.root.FindChildTraverse('HPColorsNativePicker').valid = false;
  } });
  openEditor(fixture);
  panel(fixture, 'HPColorsEnemyLowSwatch').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
  const hex = panel(fixture, 'HPColorsPickerHex');
  hex.text = '#ABCDEF';
  hex.events.ontextentrysubmit();
  fixture.harness.$.HPColorsMenuCancel();
  assert.equal(readConfig(fixture).values.enemyLow, shippedDefaults.enemyLow);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
});

test('native condition picker changes only its draft and Escape restores that draft', () => {
  const fixture = bootMenu(undefined, { beforeBoot(harness) {
    harness.root.FindChildTraverse('HPColorsEnemyLowRow').AddClass('HPColorsSettingRow');
    harness.root.FindChildTraverse('HPColorsEnemyLowSwatch')
      .SetParent(harness.root.FindChildTraverse('HPColorsEnemyLowRow'));
  } });
  openEditor(fixture);
  panel(fixture, 'HPColorsCondition_enemyLow').events.onactivate();
  const before = readConfig(fixture);
  const draft = panel(fixture, 'HPColorsConditionColorEntry').text;
  panel(fixture, 'HPColorsConditionColorSwatch').events.onactivate();
  nativeColor(fixture, 12, 34, 56);
  assert.equal(panel(fixture, 'HPColorsConditionColorEntry').text, '#0C2238');
  assert.deepEqual(readConfig(fixture), before);
  fixture.harness.$.HPColorsMenuCancel();
  assert.equal(panel(fixture, 'HPColorsConditionColorEntry').text, draft);
  panel(fixture, 'HPColorsConditionColorSwatch').events.onactivate();
  nativeColor(fixture, 65, 43, 21);
  panel(fixture, 'HPColorsPickerDone').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsConditionColorEntry').text, '#412B15');
  assert.deepEqual(readConfig(fixture), before);
  panel(fixture, 'HPColorsConditionApplyButton').events.onactivate();
  assert.equal(readMenuState(fixture).conditions.enemyLow.value, '#412B15');
});

test('native 6722 readout retires the pip-derived manual config workflow', () => {
  const fixture = bootMenu({ version: 1, values: { precisePipsEnabled: true }, scopes: [] });
  openEditor(fixture);
  assert.equal(fixture.harness.root.FindChildTraverse('HPColorsPrecisePipsToggle'), null);
  assert.equal(fixture.harness.root.FindChildTraverse('HPColorsPrecisePipsDialog'), null);
  assert.equal(readConfig(fixture).values.precisePipsEnabled, undefined, 'retired legacy value is dropped on load');
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

test('unchanged warm sync avoids panel traversal and redundant writes', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  const entry = panel(fixture, 'HPColorsWidthEntry');
  const before = { ...fixture.harness.operationCounts };
  for (let index = 0; index < 3; index++) entry.events.oncancel();
  for (const counter of ['findTraversals', 'textWrites', 'styleWrites', 'classWrites']) {
    assert.equal(fixture.harness.operationCounts[counter], before[counter], counter);
  }
});

test('old-layout sync does not rescan absent Appearance and pip-opacity controls', () => {
  const fixture = bootMenu(undefined, { layout: legacyLayoutSource, beforeBoot(harness) {
    for (const child of harness.root.Children()) {
      if (/^HPColors(?:Name|EnemyName|AllyName|PipOpacity)/.test(child.id))
        child.DeleteAsync();
    }
  } });
  openEditor(fixture);
  const entry = panel(fixture, 'HPColorsWidthEntry');
  const before = { ...fixture.harness.findCounts };
  for (let index = 0; index < 3; index++) entry.events.oncancel();
  for (const id of Object.keys(fixture.harness.findCounts)) {
    if (/^HPColors(?:Name|EnemyName|AllyName|PipOpacity)/.test(id))
      assert.equal(fixture.harness.findCounts[id], before[id], id);
  }
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'OLD PRESET VPK');
});

test('sync reacquires an invalid cached control without changing the settings', () => {
  for (const legacy of [false, true]) {
    const fixture = bootMenu(undefined, { layout: legacy ? legacyLayoutSource : layoutSource });
    openEditor(fixture);
    const before = readConfig(fixture);
    const entry = panel(fixture, 'HPColorsWidthEntry');
    const swatch = panel(fixture, 'HPColorsEnemyLowSwatch');
    swatch.DeleteAsync();
    const replacement = fixture.harness.root.add(new MockPanel('HPColorsEnemyLowSwatch'));
    entry.events.oncancel();
    assert.equal(replacement.style.backgroundColor, before.values.enemyLow);
    assert.deepEqual(readConfig(fixture), before);
  }
});

test('condition indicator sync shares one settings snapshot for all configured rows', () => {
  const stateReadCounter = { count: 0 };
  const controls = [
    ['widthScale', 'HPColorsWidth', 'HPColorsWidthScaleRow', 200],
    ['heightScale', 'HPColorsHeight', 'HPColorsHeightScaleRow', 130],
    ['positionX', 'HPColorsPositionX', 'HPColorsPositionXRow', 10],
    ['positionY', 'HPColorsPositionY', 'HPColorsPositionYRow', 10],
    ['lowThreshold', 'HPColorsSharedLowThreshold', 'HPColorsSharedLowThresholdRow', 10],
    ['highThreshold', 'HPColorsSharedHighThreshold', 'HPColorsSharedHighThresholdRow', 90],
  ];
  const fixture = bootMenu({ version: 1, values: {}, scopes: [], conditions:
    Object.fromEntries(controls.map(([key, , , value]) =>
      [key, { slot: 1, minTier: 1, value }])) }, {
    stateReadCounter,
    beforeBoot(harness) {
      for (const [, base, rowId] of controls) {
        const row = harness.root.FindChildTraverse(rowId);
        row.AddClass('HPColorsSettingRow');
        harness.root.FindChildTraverse(base + 'SliderHost').SetParent(row);
        harness.root.FindChildTraverse(base + 'Entry').SetParent(row);
      }
    },
  });
  openEditor(fixture);
  const entry = panel(fixture, 'HPColorsWidthEntry');
  stateReadCounter.count = 0;
  entry.events.oncancel();
  assert.ok(stateReadCounter.count <= 6, `sync read state ${stateReadCounter.count} times`);
  for (const [key] of controls) {
    const indicator = panel(fixture, 'HPColorsCondition_' + key);
    assert.equal(indicator.BHasClass('Configured'), true, key);
    assert.equal(indicator.BHasClass('Unavailable'), true, key);
  }
});

test('Players effect pages share side selection and fit three tab slots', () => {
  const fixture = bootMenu(); openEditor(fixture);
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'ALERTS');
  assert.equal(panel(fixture, 'HPColorsSettingsEnemyPulse').BHasClass('Active'), true);
  panel(fixture, 'HPColorsPlayerSideAlly').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'HP TEXT');
  assert.equal(panel(fixture, 'HPColorsSettingsAllyReadout').BHasClass('SideCollapsed'), false);
  for (const index of [3, 4, 5]) assert.equal(panel(fixture, 'HPColorsTab' + index).BHasClass('Available'), false);
  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'LINES & LEVEL');
  panel(fixture, 'HPColorsTab3').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'PICKUPS');
});

test('every setting key has one tab owner and its controls live in that XML page', () => {
  const categories = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_DEFS');
  const toggles = extractArrayDeclaration(canonicalMenuSource, 'TOGGLE_CONTROLS');
  const modes = extractArrayDeclaration(canonicalMenuSource, 'MODE_CONTROLS');
  const sliders = extractArrayDeclaration(canonicalMenuSource, 'SLIDER_CONTROLS');
  const colors = extractArrayDeclaration(canonicalMenuSource, 'COLOR_CONTROLS');
  const defaultKeys = Object.keys(readConfig(bootMenu()).values).sort();
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
  addControl('staminaShape', 'HPColorsStaminaShape');

  const thirdEyeXml = require('./compose-hp-colors-rewrite-v2-thirdeye').buildEscapeMenu({
    canonicalXml: fs.readFileSync(path.resolve(__dirname, '../hp_colors_rewrite_v2/panorama/layout/hud_escape_menu.xml'), 'utf8'),
    thirdEyeXml: fs.readFileSync(path.resolve(__dirname, '../hp_colors_rewrite_v2_thirdeye/source_snapshots/hud_escape_menu.xml'), 'utf8'),
    bridgeAsset: 'hp_colors_thirdeye_bridge.vjs_c', windowAsset: 'hp_colors_thirdeye_window.vjs_c', packageHash: 'b'.repeat(64),
  });
  const ownershipLayouts = [['selected canonical-derived layout', layoutSource], ['fresh Third Eye composition', thirdEyeXml]];
  const tabs = categories.flatMap((category) => category.tabs);
  assert.deepEqual(
    [...categories].map((category) => category.name),
    ['GENERAL', 'PLAYERS', 'INDICATORS', 'UNITS', 'PRESETS'],
  );
  for (const category of categories)
    assert.ok(category.tabs.length <= 4, `${category.name} must fit four used slots`);

  // The same complete control/ownership matrix covers the selected build-stage
  // layout (including ShowRank when supplied by its wrapper) and fresh Third Eye.
  for (const [lane, xml] of ownershipLayouts) {
    keyOwners.clear();
    const pageAncestry = panelAncestryById(xml, { allowDuplicates: true });
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
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'LIBRARY');
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
    'This page goes back to your All Heroes settings. Includes hidden settings and both sides. This can be undone.',
  );
});

function twoPresetState(values = {}) {
  // Start on today's Rewrite Default; sparse saved presets still restore the
  // frozen stock baseline, so applying them is a real, undoable transition.
  return {
    version: 1,
    // These are current shipped offsets, not a legacy save to migrate.
    offsetVersion: 2,
    values: { ...shippedDefaults, ...values },
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

// Failure modes: contract and slider limits disagree, typed values still clamp at the old
// 230/160 limits, or the lower bound moves.
test('bar width and height accept 60-400% from the slider and typed entry', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  selectOverviewLayout(fixture);
  for (const [base, key] of [['HPColorsWidth', 'widthScale'], ['HPColorsHeight', 'heightScale']]) {
    const slider = panel(fixture, base + 'Slider');
    assert.equal(slider.max, 400, key);
    assert.equal(slider.min, 60, key);
    const entry = panel(fixture, base + 'Entry');
    entry.text = '350';
    entry.events.ontextentrysubmit();
    assert.equal(readConfig(fixture).values[key], 350, key);
    entry.text = '999';
    entry.events.ontextentrysubmit();
    assert.equal(readConfig(fixture).values[key], 400, key);
    entry.text = '10';
    entry.events.ontextentrysubmit();
    assert.equal(readConfig(fixture).values[key], 60, key);
  }
});

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
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'LIBRARY');
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
    // Match today's baked preset so the first row click does not need a
    // discard confirmation before exercising SAVE TO PRESET.
    version: 1,
    // Shipped defaults already use the current bar-relative offset contract.
    offsetVersion: 2,
    values: shippedDefaults,
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
  const none = bootMenu({ version: 1, offsetVersion: 2, values: shippedDefaults, scopes: [] });
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


test('all readout sliders preserve explicit centered zero and physical canvas windows in percent', () => {
  // Exercise current coordinates directly; legacy X=0 migrates to a new anchor.
  const fixture = bootMenu({ version: 1, offsetVersion: 2, values: {
    widthScale: 100, heightScale: 100, readoutOffsetX: 0, readoutOffsetY: 0,
    allyReadoutOffsetX: 0, allyReadoutOffsetY: 0,
    enemyPulseReadoutOffsetX: 0, enemyPulseReadoutOffsetY: 0,
  }, scopes: [] });
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
    const scale = 100 / (/X$/.test(key) ? 76 : 18);
    assert.equal(slider.min, -limit * scale, key);
    assert.equal(slider.max, limit * scale, key);
    assert.equal(slider.value, 0, key);
    assert.equal(entry.text, '0', key);
  }
});


test('Units pages expose independent gates, neutral native/hex, and scoped reset/Undo', () => {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryUnits').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSettingsNpc').BHasClass('Active'), true);
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

  assert.equal(panel(fixture, 'HPColorsTabStrip').BHasClass('SinglePage'), true);
  const neutralRow = panel(fixture, 'HPColorsNeutralColorRow');
  assert.equal(neutralRow.BHasClass('Disabled'), true);
  assert.equal(panel(fixture, 'HPColorsNeutralColorHex').text, '#5BEFB5');
  panel(fixture, 'HPColorsNpcNeutralToggle').events.onactivate();
  assert.equal(neutralRow.BHasClass('Disabled'), false);

  panel(fixture, 'HPColorsNeutralColorSwatch').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), true);
  nativeColor(fixture, 32, 64, 96);
  assert.notEqual(readConfig(fixture).values.neutralColor, '#5BEFB5');
  panel(fixture, 'HPColorsPickerDone').events.onactivate();
  const neutralHex = panel(fixture, 'HPColorsNeutralColorHex');
  neutralHex.text = '#2468AC';
  neutralHex.events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.neutralColor, '#2468AC');


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
  assert.equal(reset.npcNeutralEnabled, false);
  assert.equal(reset.neutralColor, shippedDefaults.neutralColor);
  assert.equal(reset.buildingEnemyEnabled, false);
  assert.equal(reset.buildingAllyEnabled, false);
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
  assert.equal(panel(fixture, 'HPColorsSettingsNpc').BHasClass('Active'), true);
});


test('Appearance toggles publish exact keys and reset/Undo only their section', () => {
  const keys = ['criticalIndicatorVisible', 'playerNamesVisible'];
  const ids = ['HPColorsCriticalIndicatorToggle', 'HPColorsPlayerNamesToggle'];
  const fixture = bootMenu({ version: 1, values: { widthScale: 123 }, scopes: [] });
  openEditor(fixture);
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPageTitle').text, 'NAMES & LABELS');
  assert.equal(panel(fixture, 'HPColorsSettingsOverviewAppearance').BHasClass('Active'), true);
  for (let index = 0; index < keys.length; index++) {
    const before = readConfig(fixture);
    const dispatches = configDispatches(fixture).length;
    panel(fixture, ids[index]).events.onactivate();
    const after = readConfig(fixture);
    assert.equal(after.values[keys[index]], false);
    assert.deepEqual(after.values, { ...before.values, [keys[index]]: false });
    assert.equal(configDispatches(fixture).length, dispatches + 1);
    assert.deepEqual(Object.keys(after).sort(), ['magic_word', 'revision', 'showBounds', 'values', 'version']);
    assert.equal(after.showBounds, false);
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

test('restored editor has twelve tabs and retains CSS-pixel legacy input', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  let tabs = 0;
  for (const rail of ['Overview', 'Enemy', 'Readout', 'Presets', 'Units']) {
    panel(fixture, 'HPColorsCategory' + rail).events.onactivate();
    for (let index = 0; index < 6; index++) {
      const tab = panel(fixture, 'HPColorsTab' + index);
      if (!tab.BHasClass('Available')) continue;
      tabs++;
    }
  }
  assert.equal(tabs, 12);
  selectOverviewLayout(fixture);
  const entry = panel(fixture, 'HPColorsPositionXEntry');
  entry.text = '-12.3';
  entry.events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.positionX, -123);
  assert.equal(entry.text, '-12.3');
  const slider = panel(fixture, 'HPColorsPositionXSlider');
  assert.equal(slider.min, -30);
  assert.equal(slider.max, 30);
  assert.equal(slider.increment, 0.1);
  slider.events.onmousedown();
  slider.value = -15.6;
  slider.events.onvaluechanged();
  slider.events.onmouseup();
  assert.equal(readConfig(fixture).values.positionX, -156);
  assert.equal(entry.text, '-15.6');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.positionX, -123);
  selectEnemyBar(fixture);
  assert.equal(panel(fixture, 'HPColorsEnemyTeamHighRow').BHasClass('FeatureOff'), false);
  assert.match(layoutSource, /RESET PAGE/);
});

test("layout reset captures only its fourteen keys in one Undo", () => {
  const categories = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_DEFS');
  const keys = categories[0].tabs[1].keys;
  assert.equal(keys.length, 14);
  const values = Object.fromEntries(keys.map(key => [key, key === 'accessoryAnchorEnabled' ? false :
    key === "barOutlineEnabled" ? false : key === "barOutlineThickness" ? 2 :
    key === "barOutlineCustomColor" ? true : key === "allyBarOutlineColor" ? "#ABCDEF" :
    key === "barOutlineOpacity" ? 37 : key === "barOutlineColor" ? "#123456" :
    key === 'damageShakeEnabled' ? false : key === 'damageShakeIntensity' ? 7 :
    key === 'barMask' ? 'original' : /Scale$/.test(key) ? 60 : -10]));
  // This checks page ownership, not the separate legacy-offset migration.
  const fixture = bootMenu({ version: 1, offsetVersion: 2, values: {
    ...values, enemyPulseReadoutOffsetX: 55, pickupOffsetX: 66,
  }, scopes: [] });
  openEditor(fixture);
  selectOverviewLayout(fixture);
  requestReset(fixture);
  selectEnemyBar(fixture);
  confirmReset(fixture);
  const after = readConfig(fixture).values;
  const shippedLayout = { widthScale: 148, heightScale: 80, barMask: 'none', positionX: 0,
    positionY: -38, accessoryAnchorEnabled: true, damageShakeEnabled: true, damageShakeIntensity: 3,
    barOutlineEnabled: true, barOutlineThickness: 1, barOutlineOpacity: 100, barOutlineColor: "#000000",
    barOutlineCustomColor: false, allyBarOutlineColor: "#000000" };
  for (const key of keys) assert.equal(after[key], shippedLayout[key], key);
  assert.equal(after.enemyPulseReadoutOffsetX, 55);
  assert.equal(after.pickupOffsetX, 66);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  for (const key of keys) assert.equal(readConfig(fixture).values[key], values[key], key);
});

// Failure modes: shake rows land on the wrong page, the strength slider shows while
// shake is off or without ADVANCED, or the toggle/slider write the wrong key or bounds.
test('damage shake rows sit on Layout; strength is ADVANCED and follows the toggle', () => {
  const fixture = bootMenu(undefined, { tree: true });
  openEditor(fixture);
  selectOverviewLayout(fixture);
  const ids = () => visibleSettingRows(fixture, 'HPColorsSettingsOverviewLayout').map(row => row.id);
  assert.ok(ids().includes('HPColorsDamageShakeEnabledRow'));
  assert.ok(!ids().includes('HPColorsDamageShakeIntensityRow'), 'strength waits for ADVANCED');
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  assert.ok(ids().includes('HPColorsDamageShakeIntensityRow'));
  const order = ids();
  assert.ok(order.indexOf('HPColorsBarMaskRow') < order.indexOf('HPColorsDamageShakeEnabledRow'));
  assert.ok(order.indexOf('HPColorsDamageShakeEnabledRow') < order.indexOf('HPColorsDamageShakeIntensityRow'));
  panel(fixture, 'HPColorsDamageShakeToggle').events.onactivate();
  assert.equal(readConfig(fixture).values.damageShakeEnabled, false);
  assert.equal(panel(fixture, 'HPColorsDamageShakeIntensityRow').BHasClass('FeatureOff'), true);
  assert.ok(!ids().includes('HPColorsDamageShakeIntensityRow'), 'strength hides while shake is off');
  panel(fixture, 'HPColorsDamageShakeToggle').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsDamageShakeIntensityRow').BHasClass('FeatureOff'), false);
  const entry = panel(fixture, 'HPColorsDamageShakeIntensityEntry');
  entry.text = '42';
  entry.events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.damageShakeIntensity, 10);
  assert.match(layoutSource, /SHAKE STRENGTH[\s\S]{0,400}text="DEG"/);
});

// Failure modes: tilt rows land on the wrong page or out of order, show without ADVANCED,
// stay visible while names/that side's HP text is off, the ally row writes the enemy key,
// entries accept values outside -360..360, or the layout drops the DEG unit/copy.
test('tilt rows follow their offsets, are ADVANCED, gate on their feature and clamp to 360', () => {
  const categories = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_DEFS');
  const names = categories[0].tabs.find(tab => tab.name === 'NAMES & LABELS').keys;
  assert.equal(names[names.indexOf('nameOffsetY') + 1], 'nameTilt');
  const players = categories.find(category => category.name === 'PLAYERS');
  const hpText = players.tabs.find(tab => tab.name === 'HP TEXT').keys;
  assert.equal(hpText[hpText.indexOf('readoutOffsetY') + 1], 'readoutTilt');
  assert.equal(hpText[hpText.indexOf('allyReadoutOffsetY') + 1], 'allyReadoutTilt');
  const advanced = Array.from(extractArrayDeclaration(canonicalMenuSource, 'ADVANCED_KEYS'));
  for (const key of ['nameTilt', 'readoutTilt', 'allyReadoutTilt']) assert.ok(advanced.includes(key), key);
  for (const [title, help] of [['NAME TILT', 'Rotate player names in degrees. Positive tilts clockwise.'],
    ['TEXT TILT', 'Rotate enemy HP text in degrees. Positive tilts clockwise.'],
    ['TEXT TILT', 'Rotate ally HP text in degrees. Positive tilts clockwise.']])
    assert.match(layoutSource, new RegExp(title + '[\\s\\S]{0,120}' + help + '[\\s\\S]{0,500}text="DEG"'));
  const fixture = bootMenu({ version: 1, offsetVersion: 2, values: { allyReadoutVisible: true }, scopes: [] });
  openEditor(fixture);
  const off = id => panel(fixture, id).BHasClass('FeatureOff');
  assert.equal(off('HPColorsNameTiltRow'), false);
  assert.equal(off('HPColorsReadoutTiltRow'), false);
  assert.equal(off('HPColorsAllyReadoutTiltRow'), false);
  for (const [base, key] of [['HPColorsNameTilt', 'nameTilt'], ['HPColorsReadoutTilt', 'readoutTilt'],
    ['HPColorsAllyReadoutTilt', 'allyReadoutTilt']]) {
    const entry = panel(fixture, base + 'Entry');
    entry.text = '-400';
    entry.events.ontextentrysubmit();
    assert.equal(readConfig(fixture).values[key], -360, key);
    entry.text = '400';
    entry.events.ontextentrysubmit();
    assert.equal(readConfig(fixture).values[key], 360, key);
    entry.text = '15';
    entry.events.ontextentrysubmit();
    assert.equal(readConfig(fixture).values[key], 15, key);
  }
  assert.equal(readConfig(fixture).values.readoutTilt, 15, 'ally entry kept the enemy value');
  panel(fixture, 'HPColorsPlayerNamesToggle').events.onactivate();
  assert.equal(off('HPColorsNameTiltRow'), true, 'name tilt hides with player names');
  panel(fixture, 'HPColorsReadoutToggle').events.onactivate();
  assert.equal(off('HPColorsReadoutTiltRow'), true, 'enemy tilt hides with enemy HP text');
  assert.equal(off('HPColorsAllyReadoutTiltRow'), false, 'ally tilt follows its own side');
  panel(fixture, 'HPColorsAllyReadoutToggle').events.onactivate();
  assert.equal(off('HPColorsAllyReadoutTiltRow'), true);
});

// Failure modes: a size/offset/tuning number lands in basic, or a color/toggle/style stays hidden.
test('ADVANCED holds movement, sizing and tuning numbers; colors, toggles and styles are basic', () => {
  const advanced = Array.from(extractArrayDeclaration(canonicalMenuSource, 'ADVANCED_KEYS'));
  assert.equal(new Set(advanced).size, advanced.length);
  for (const key of ['widthScale', 'heightScale', 'nameSize', 'nameRiseWithPips', 'readoutSize',
    'allyReadoutSize', 'enemyPulseThreshold', 'enemyPulseBpm', 'enemyPulseIntensity',
    'allyPulseThreshold', 'allyPulseBpm', 'allyPulseIntensity', 'enemyKillMarkerThreshold',
    'pickupSize', 'damageShakeIntensity', 'nameTilt', 'readoutTilt', 'allyReadoutTilt', 'positionX', 'pipOpacity', 'nameOutlineWidth'])
    assert.ok(advanced.includes(key), key);
  for (const key of ['enemyTeamHigh', 'enemyHealing', 'allyBulletShield', 'enemyPulseColor',
    'enemyPulseColorMode', 'enemyPulseHideBar', 'allyPulseReadout', 'enemyPipColor',
    'allyPipColorEnabled', 'enemyStaminaColor', 'pickupGunColor', 'pickupGlyphColor',
    'damageShakeEnabled', 'barMask', 'readoutFont'])
    assert.ok(!advanced.includes(key), key);
  assert.equal(advanced.length, 64);
});

test('always-visible tuning never unhides feature-off rows or hides ready-icon color', () => {
  const fixture = bootMenu({ version: 1, values: {
    readoutVisible: false, enemyPulseEnabled: false, pickupTimersEnabled: false,
    ultimateTimerEnabled: false, playerNamesVisible: false, enemyKillMarkerWidth: 8,
  }, conditions: { enemyKillMarkerWidth: { slot: 1, minTier: 1, value: 4 } }, scopes: [] });
  openEditor(fixture);
  for (const id of ['HPColorsReadoutSizeRow', 'HPColorsEnemyPulseReadoutSizeRow',
    'HPColorsPickupSizeRow', 'HPColorsNameSizeRow'])
    assert.equal(panel(fixture, id).BHasClass('FeatureOff'), true, id);
  assert.equal(panel(fixture, 'HPColorsUltModeRow').BHasClass('FeatureOff'), false);
  assert.equal(panel(fixture, 'HPColorsEnemyKillMarkerWidthRow').BHasClass('FeatureOff'), true);
});

test('round legacy position condition editor converts CSS pixels in both directions', () => {
  const fixture = bootMenu(undefined, { beforeBoot(harness) {
    const row = harness.root.FindChildTraverse('HPColorsPositionXRow');
    row.AddClass('HPColorsSettingRow');
    harness.root.FindChildTraverse('HPColorsPositionXSliderHost').SetParent(row);
    harness.root.FindChildTraverse('HPColorsPositionXEntry').SetParent(row);
  } });
  openEditor(fixture);
  panel(fixture, 'HPColorsCondition_positionX').events.onactivate();
  const entry = panel(fixture, 'HPColorsConditionNumberEntry');
  entry.text = '-12.3';
  entry.events.ontextentrysubmit();
  assert.equal(entry.text, '-12.3');
  assert.equal(panel(fixture, 'HPColorsConditionNumberSlider').value, -12.3);
  panel(fixture, 'HPColorsConditionApplyButton').events.onactivate();
  assert.equal(readMenuState(fixture).conditions.positionX.value, -123);
});

test('review regression blank scaled entry leaves the raw value revision and Undo unchanged', () => {
  const fixture = bootMenu({ version: 1, values: { positionX: -123 }, scopes: [] });
  openEditor(fixture);
  const before = readConfig(fixture);
  const raw = fixture.harness.root.GetAttributeString(MENU_STATE_ATTR, '');
  const entry = panel(fixture, 'HPColorsPositionXEntry');
  entry.text = '';
  entry.events.ontextentrysubmit();
  assert.deepEqual(readConfig(fixture), before);
  assert.equal(fixture.harness.root.GetAttributeString(MENU_STATE_ATTR, ''), raw);
  assert.equal(entry.text, '-12.3');
});

test('review regression old four-rail feedback and stamina pages remain reachable and active', () => {
  const fixture = bootMenu(undefined, { layout: legacyLayoutSource, beforeBoot(harness) {
    for (const id of ['HPColorsSettingsEnemyFeedback', 'HPColorsSettingsAllyFeedback',
      'HPColorsSettingsStamina']) harness.root.add(new MockPanel(id));
  } });
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSettingsEnemyFeedback').BHasClass('Active'), true);
  assert.equal(panel(fixture, 'HPColorsSettingsEnemyBar').BHasClass('Active'), false);
  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSettingsStamina').BHasClass('Active'), true);
  assert.equal(panel(fixture, 'HPColorsSettingsEnemyFeedback').BHasClass('Active'), false);
});

test('task pages own every key once with structural sections and optional Advanced', () => {
  const categories = JSON.parse(JSON.stringify(extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_DEFS')));
  const expected = [
  [
    "GENERAL",
    "BASICS",
    "HPColorsSettingsOverviewStatus",
    [
      "enabled",
      "lowThreshold",
      "highThreshold",
      "hudHealthColorMode",
      "hudHealthColor"
    ]
  ],
  [
    "GENERAL",
    "LAYOUT",
    "HPColorsSettingsOverviewLayout",
    [
      "widthScale",
      "heightScale",
      "barMask",
      "barOutlineEnabled",
      "barOutlineCustomColor",
      "barOutlineColor",
      "allyBarOutlineColor",
      "barOutlineThickness",
      "barOutlineOpacity",
      "damageShakeEnabled",
      "damageShakeIntensity",
      "positionX",
      "positionY",
      "accessoryAnchorEnabled"
    ]
  ],
  [
    "GENERAL",
    "NAMES & LABELS",
    "HPColorsSettingsOverviewAppearance",
    [
      "criticalIndicatorVisible",
      "criticalOffsetX",
      "criticalOffsetY",
      "assassinateOffsetX",
      "assassinateOffsetY",
      "playerNamesVisible",
      "enemyNameColorEnabled",
      "enemyNameColor",
      "allyNameColorEnabled",
      "allyNameColor",
      "nameSize",
      "nameOutlineWidth",
      "nameAlign",
      "nameOffsetX",
      "nameOffsetY",
      "nameTilt",
      "nameRiseWithPips"
    ]
  ],
  [
    "PLAYERS",
    "BARS",
    "HPColorsSettingsEnemyBar",
    [
      "enemyEnabled",
      "enemyVisible",
      "enemyMode",
      "enemyLow",
      "enemyMid",
      "enemyHigh",
      "enemyTeamHigh",
      "enemyHealing",
      "enemyDelta",
      "enemyBulletShield",
      "enemyRatkingArmor",
      "allyEnabled",
      "allyVisible",
      "allyMode",
      "allyLow",
      "allyMid",
      "allyHigh",
      "allyTeamHigh",
      "allyHealing",
      "allyDelta",
      "allyBulletShield",
      "allyRatkingArmor"
    ]
  ],
  [
    "PLAYERS",
    "HP TEXT",
    "HPColorsSettingsReadoutNumber",
    [
      "hpTextAlign",
      "readoutVisible",
      "readoutSize",
      "readoutOutlineWidth",
      "readoutFont",
      "readoutColorMode",
      "readoutMode",
      "readoutLow",
      "readoutMid",
      "readoutHigh",
      "readoutOffsetX",
      "readoutOffsetY",
      "readoutTilt",
      "allyReadoutVisible",
      "allyReadoutSize",
      "allyReadoutOutlineWidth",
      "allyReadoutFont",
      "allyReadoutColorMode",
      "allyReadoutMode",
      "allyReadoutLow",
      "allyReadoutMid",
      "allyReadoutHigh",
      "allyReadoutOffsetX",
      "allyReadoutOffsetY",
      "allyReadoutTilt"
    ]
  ],
  [
    "PLAYERS",
    "ALERTS",
    "HPColorsSettingsEnemyPulse",
    [
      "enemyPulseEnabled",
      "enemyPulseThreshold",
      "enemyPulseBpm",
      "enemyPulseIntensity",
      "enemyPulseColorEnabled",
      "enemyPulseColorMode",
      "enemyPulseColor",
      "enemyPulseHideBar",
      "enemyPulseReadout",
      "enemyPulseReadoutModifiers",
      "enemyPulseReadoutSize",
      "enemyPulseReadoutOffsetX",
      "enemyPulseReadoutOffsetY",
      "enemyKillMarkerEnabled",
      "enemyKillMarkerThreshold",
      "enemyKillMarkerWidth",
      "enemyKillMarkerColor",
      "allyPulseEnabled",
      "allyPulseReadout",
      "allyPulseThreshold",
      "allyPulseBpm",
      "allyPulseIntensity",
      "allyPulseColorEnabled",
      "allyPulseColor",
      "allyPulseColorMode"
    ]
  ],
  [
    "INDICATORS",
    "LINES & LEVEL",
    "HPColorsSettingsReadoutLevels",
    [
      "pipsVisible",
      "enemyPipColorEnabled",
      "enemyPipColor",
      "allyPipColorEnabled",
      "allyPipColor",
      "pipOpacity",
      "levelsVisible",
      "levelOffsetX",
      "levelOffsetY"
    ]
  ],
  [
    "INDICATORS",
    "ULTIMATE",
    "HPColorsSettingsUltimateTimer",
    [
      "ultMode",
      "ultCustom",
      "ultimateTimerColorMode",
      "ultimateTimerUnavailableColor",
      "ultimateTimerAvailableColor",
      "ultimateTimerEnabled",
      "ultimateTimerSize",
      "ultimateTimerDarkness",
      "ultOffsetX",
      "ultOffsetY"
    ]
  ],
  [
    "INDICATORS",
    "STAMINA",
    "HPColorsSettingsStamina",
    [
      "staminaShape",
      "staminaWidth",
      "staminaHeight",
      "staminaOffsetX",
      "staminaOffsetY",
      "enemyStaminaColorEnabled",
      "enemyStaminaColor"
    ]
  ],
  [
    "INDICATORS",
    "PICKUPS",
    "HPColorsSettingsPickupTimers",
    [
      "pickupTimersEnabled",
      "pickupGunColor",
      "pickupMovementColor",
      "pickupSpiritColor",
      "pickupSurvivalColor",
      "pickupBackgroundDarkness",
      "pickupGlyphColor",
      "pickupSize",
      "pickupSpacing",
      "pickupOffsetX",
      "pickupOffsetY",
      "rejuvOffsetX", "rejuvOffsetY", "rejuvTilt", "rejuvScale"
    ]
  ],
  [
    "UNITS",
    "TYPES",
    "HPColorsSettingsNpc",
    [
      "npcEnemyEnabled",
      "npcAllyEnabled",
      "npcNeutralEnabled",
      "neutralColor",
      "buildingEnemyEnabled",
      "buildingAllyEnabled"
    ]
  ],
  [
    "PRESETS",
    "LIBRARY",
    "HPColorsSettingsOverviewHero",
    []
  ]
];
  assert.deepEqual(categories.flatMap(category => category.tabs.map(tab =>
    [category.name, tab.name, tab.pageId, tab.keys])), expected);
  assert.deepEqual(Array.from(extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_BUTTON_IDS')), [
    'HPColorsCategoryOverview', 'HPColorsCategoryEnemy', 'HPColorsCategoryReadout',
    'HPColorsCategoryUnits', 'HPColorsCategoryPresets',
  ]);
  const keys = categories.flatMap(category => category.tabs.flatMap(tab => tab.keys));
  assert.deepEqual([...keys].sort(), Object.keys(shippedDefaults).sort());
  assert.equal(new Set(keys).size, 155);
  assert.equal(categories.flatMap(category => category.tabs).length, 12);
  for (const category of categories) assert.ok(category.tabs.length <= 4);
  const ids = Array.from(layoutSource.matchAll(/\bid="(HPColors[^"]+)"/g), match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'HP editor IDs stay unique');
  assert.match(layoutSource, /id="HPColorsAdvancedToggle"/);
  assert.match(layoutSource, /id="HPColorsPlayerSide"/);
  assert.doesNotMatch(layoutSource, /id="HPColorsCategoryAlly"/);
  const ancestry = panelAncestryById(layoutSource);
  assert.ok(!ancestry.get('HPColorsPlayerSide').includes('HPColorsSettingsList'));
  for (const id of ['HPColorsSettingsAllyBar', 'HPColorsSettingsEnemyFeedback',
    'HPColorsSettingsAllyFeedback', 'HPColorsSettingsAllyReadout', 'HPColorsSettingsAllyPulse',
    'HPColorsSettingsEnemyKillMarker', 'HPColorsSettingsNeutral', 'HPColorsSettingsBuildings']) {
    assert.doesNotMatch(layoutSource.match(new RegExp('<Panel id="' + id + '"[^>]*>'))[0], /HPColorsSettingsPage/);
  }
  for (const match of layoutSource.matchAll(/<Panel\b[^>]*class="[^"]*\bHPColorsSettingRow\b[^"]*"[^>]*>/g)) {
    let depth = 1;
    const tags = /<\/?Panel\b[^>]*>/g;
    tags.lastIndex = match.index + match[0].length;
    let end;
    while (depth && (end = tags.exec(layoutSource))) {
      if (end[0].startsWith('</')) depth--;
      else if (!end[0].endsWith('/>')) depth++;
    }
    assert.match(layoutSource.slice(match.index, tags.lastIndex), /<(Button|TextEntry|DropDown)\b|SliderHost/, match[0]);
  }
});

test('pip controls publish team colors and opacity, and stamina dropdown resets only its own page', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();
  for (const [prefix, color] of [['Enemy', '#123456'], ['Ally', '#ABCDEF']]) {
    const key = prefix.toLowerCase() + 'PipColor';
    const row = panel(fixture, 'HPColors' + prefix + 'PipColorRow');
    assert.equal(row.BHasClass('Disabled'), true, prefix);
    panel(fixture, 'HPColors' + prefix + 'PipColorToggle').events.onactivate();
    assert.equal(readConfig(fixture).values[key + 'Enabled'], true);
    assert.equal(row.BHasClass('Disabled'), false, prefix);
    const entry = panel(fixture, 'HPColors' + prefix + 'PipColorHex');
    entry.text = color;
    entry.events.ontextentrysubmit();
    assert.equal(readConfig(fixture).values[key], color);
    panel(fixture, 'HPColors' + prefix + 'PipColorSwatch').events.onactivate();
    assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), true);
    panel(fixture, 'HPColorsPickerDone').events.onactivate();
  }
  const opacity = panel(fixture, 'HPColorsPipOpacityEntry');
  opacity.text = '42';
  opacity.events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.pipOpacity, 42);
  assert.equal(panel(fixture, 'HPColorsPipOpacitySlider').min, 0);
  assert.equal(panel(fixture, 'HPColorsPipOpacitySlider').max, 100);
  selectStamina(fixture);
  const shape = panel(fixture, 'HPColorsStaminaShape');
  assert.equal(shape.GetSelected().id, 'arrow');
  for (const value of ['circle', 'box', 'arrow']) {
    shape.SetSelected(value);
    shape.events.oninputsubmit();
    assert.equal(readConfig(fixture).values.staminaShape, value);
    assert.equal(shape.GetSelected().id, value);
  }
  shape.SetSelected('circle');
  shape.events.oninputsubmit();
  const offset = panel(fixture, 'HPColorsStaminaOffsetXEntry');
  offset.text = '-12.3';
  offset.events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.staminaOffsetX, -123);
  requestReset(fixture);
  confirmReset(fixture);
  assert.equal(readConfig(fixture).values.staminaShape, 'arrow');
  assert.equal(shape.GetSelected().id, 'arrow');
  assert.equal(readConfig(fixture).values.staminaOffsetX, 0);
  assert.equal(readConfig(fixture).values.pipOpacity, 42, 'PIPS page is not reset by STAMINA');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.staminaShape, 'circle');
  assert.equal(shape.GetSelected().id, 'circle');
  assert.equal(readConfig(fixture).values.staminaOffsetX, -123);
});

test('bar-relative percent offsets use stable display and consistent typed slider values', () => {
  const fixture = bootMenu({ version: 1, values: { widthScale: 100, heightScale: 100 }, scopes: [] });
  openEditor(fixture);
  for (const base of ['ReadoutOffset', 'AllyReadoutOffset', 'EnemyPulseReadoutOffset', 'UltOffset', 'LevelOffset']) {
    for (const axis of ['X', 'Y']) {
      const key = base[0].toLowerCase() + base.slice(1) + axis;
      const raw = base === 'UltOffset' || base === 'LevelOffset';
      const size = axis === 'X' ? 76 : 18;
      const scale = (raw ? 10 : 100) / size;
      const slider = panel(fixture, `HPColors${base}${axis}Slider`);
      const entry = panel(fixture, `HPColors${base}${axis}Entry`);
      const limit = raw ? (axis === 'X' ? 300 : 200) : (axis === 'X' ? 200 : 210);
      assert.equal(slider.min, -limit * scale, key);
      assert.equal(slider.max, limit * scale, key);
      assert.equal(slider.increment, scale, key);
      entry.text = '50';
      entry.events.ontextentrysubmit();
      assert.equal(readConfig(fixture).values[key], size * (raw ? 5 : 0.5), key);
      slider.value = -26 * scale;
      slider.events.onvaluechanged();
      assert.equal(readConfig(fixture).values[key], -26, key);
      const bound = raw ? limit : (axis === 'X' ? 334 : 350);
      for (const value of [-bound, -limit, -26, -1, 0, 1, 26, 74, limit, bound]) {
        entry.text = String(value * scale);
        entry.events.ontextentrysubmit();
        const decimals = raw ? 10 : 1;
        assert.equal(entry.text, String(Math.round(value * scale * decimals) / decimals), key);
        assert.ok(slider.value >= slider.min && slider.value <= slider.max, key + ' track clamp');
        const before = readConfig(fixture).values[key];
        entry.events.ontextentrysubmit();
        entry.events.onblur();
        assert.equal(readConfig(fixture).values[key], before, key + ' display round trip');
      }
      const rowStart = layoutSource.indexOf(`id="HPColors${base}${axis}Row"`);
      const nextRow = layoutSource.indexOf('class="HPColorsSettingRow', rowStart + 80);
      assert.match(layoutSource.slice(rowStart, nextRow === -1 ? undefined : nextRow),
        /text="%" class="HPColorsUnitLabel"/, key + ' percent unit');
    }
  }
});

test('text outline sliders publish half steps, register conditions, gate rows and reset their page', () => {
  const cases = [
    ['readoutOutlineWidth', 'HPColorsReadoutOutlineWidth', 'Enemy', 1, 'readoutVisible'],
    ['allyReadoutOutlineWidth', 'HPColorsAllyReadoutOutlineWidth', 'Enemy', 1, 'allyReadoutVisible'],
    ['nameOutlineWidth', 'HPColorsNameOutlineWidth', 'Overview', 2, 'playerNamesVisible'],
  ];
  for (const [key, base, category, tab, visibilityKey] of cases) {
    const fixture = bootMenu(undefined, { beforeBoot(harness) {
      const row = harness.root.FindChildTraverse(base + 'Row');
      assert.ok(row, base + ' row exists');
      row.AddClass('HPColorsSettingRow');
      harness.root.FindChildTraverse(base + 'SliderHost').SetParent(row);
      harness.root.FindChildTraverse(base + 'Entry').SetParent(row);
    } });
    openEditor(fixture);
    panel(fixture, 'HPColorsCategory' + category).events.onactivate();
    panel(fixture, 'HPColorsTab' + tab).events.onactivate();
    const slider = panel(fixture, base + 'Slider');
    assert.equal(slider.min, 0, key);
    assert.equal(slider.max, 10, key);
    assert.equal(slider.increment, 0.5, key);
    assert.equal(readConfig(fixture).values[key], 5, key);
    slider.events.onmousedown();
    slider.value = 2.5;
    slider.events.onvaluechanged();
    slider.events.onmouseup();
    assert.equal(readConfig(fixture).values[key], 2.5, key);
    panel(fixture, 'HPColorsCondition_' + key).events.onactivate();
    assert.equal(panel(fixture, 'HPColorsConditionNumberSlider').increment, 0.5, key);
    panel(fixture, 'HPColorsConditionCancelButton').events.onactivate();
    requestReset(fixture);
    confirmReset(fixture);
    assert.equal(readConfig(fixture).values[key], 5, key);
    const hidden = bootMenu({ version: 1, values: { [visibilityKey]: false }, scopes: [] });
    assert.equal(panel(hidden, base + 'Row').BHasClass('FeatureOff'), true, key);
  }
});

test('bar-relative percent conditions use the same display rounding and stored units', () => {
  const fixture = bootMenu(undefined, { beforeBoot(harness) {
    for (const base of ['ReadoutOffsetX', 'UltOffsetX']) {
      const row = harness.root.FindChildTraverse('HPColors' + base + 'Row');
      row.AddClass('HPColorsSettingRow');
      harness.root.FindChildTraverse('HPColors' + base + 'SliderHost').SetParent(row);
      harness.root.FindChildTraverse('HPColors' + base + 'Entry').SetParent(row);
    }
  } });
  openEditor(fixture);
  for (const [key, typed, stored, shown] of [
    ['readoutOffsetX', 50, 38, '50'],
    ['readoutOffsetX', 26 / 76 * 100, 26, '34'],
    ['ultOffsetX', 74 / 760 * 100, 74, '9.7'],
  ]) {
    panel(fixture, 'HPColorsCondition_' + key).events.onactivate();
    if (key === 'readoutOffsetX')
      assert.equal(panel(fixture, 'HPColorsConditionNumberSlider').max, 334 * (100 / 76));
    const entry = panel(fixture, 'HPColorsConditionNumberEntry');
    entry.text = String(typed);
    entry.events.ontextentrysubmit();
    assert.equal(entry.text, shown);
    assert.equal(panel(fixture, 'HPColorsConditionNumberSlider').value, Number(shown));
    entry.events.ontextentrysubmit();
    panel(fixture, 'HPColorsConditionApplyButton').events.onactivate();
    assert.equal(readMenuState(fixture).conditions[key].value, stored);
  }
});

const HUD_NEUTRAL_TEXTURE = 'url("s2r://panorama/images/hud/healthbar/healthbar_fill_texture_png.vtex")';

function panoramaHudStyle(panel) {
  panel.style = new Proxy(panel.style, {
    set(target, property, value) {
      if (['washColor', 'backgroundColor', 'backgroundImage'].includes(property) && value === '')
        throw new Error('Panorama rejects empty inline ' + property);
      // The adapter maps null removal to the empty native style readback.
      return Reflect.set(target, property, value);
    },
  });
  return panel;
}

function assertHudHealthStyles(left, owned, wash = owned ? '#FFFFFF' : '') {
  assert.equal(left.style.backgroundImage, owned ? HUD_NEUTRAL_TEXTURE : '');
  assert.equal(left.style.backgroundColor, owned ? '#FFFFFF' : '');
  assert.equal(left.style.washColor, wash);
}

function hudWashFixture(values = {}, options = {}) {
  let health;
  const fixture = bootMenu({ version: 1, offsetVersion: 2, values, scopes: options.scopes || [],
    conditions: options.conditions || {}, userPresets: options.userPresets || [] }, { layout: options.legacy ? legacyLayoutSource : layoutSource, beforeBoot(harness, identityTree) {
    const add = (parent, id, classes = []) => parent.add(panoramaHudStyle(new MockPanel(id, {
      classes, style: { washColor: '', backgroundImage: '', backgroundColor: '' }, findCounts: harness.findCounts,
    })));
    const container = add(identityTree.hud, 'health_and_abilities_container', ['team1', 'friend']);
    const content = add(container, 'HealthBarContent');
    const bars = add(content, 'hud_health_bars');
    const line = add(bars, 'line', ['health_bar_line']);
    const border = add(line, 'border', ['health_bar_border']);
    const bar = add(border, 'health_bar', ['large_progress_bar']);
    const left = add(bar, 'health_bar_Left', ['ProgressBarLeft']);
    if (options.stockColor) left.style.washColor = options.stockColor;
    if (options.stockStyles) Object.assign(left.style, options.stockStyles);
    left.styleWrites.length = 0;
    const untouched = ['health_bar_Middle', 'health_bar_Right', 'pending_incoming_damage',
      'heal', 'shield', 'ratking_armor'].map(id => add(bar, id));
    const overhead = add(identityTree.hud, 'health_bar_Left', ['ProgressBarLeft']);
    health = { container, bar, left, untouched: [...untouched, overhead] };
    if (!options.legacy) {
      for (const [rowId, ids] of [
        ['HPColorsHudHealthColorModeRow', ['HPColorsHudHealthColorModeOff', 'HPColorsHudHealthColorModeTeam', 'HPColorsHudHealthColorModeCustom']],
        ['HPColorsHudHealthColorRow', ['HPColorsHudHealthColorSwatch', 'HPColorsHudHealthColorHex']],
      ]) {
        const row = harness.root.FindChildTraverse(rowId);
        if (row) {
          row.AddClass('HPColorsSettingRow');
          for (const id of ids) harness.root.FindChildTraverse(id).SetParent(row);
        }
      }
    }
    if (options.legacy) {
      for (const id of ['HPColorsV2Store', 'HPColorsHudHealthColorModeRow',
        'HPColorsHudHealthColorModeOff', 'HPColorsHudHealthColorModeTeam', 'HPColorsHudHealthColorModeCustom',
        'HPColorsHudHealthColorRow', 'HPColorsHudHealthColorSwatch', 'HPColorsHudHealthColorHex'])
        harness.root.FindChildTraverse(id)?.DeleteAsync();
    }
  } });
  return { ...fixture, health };
}

test('HUD wash modes own only local ProgressBarLeft, detect team changes and skip unchanged writes', () => {
  const fixture = hudWashFixture();
  const { left, container, untouched } = fixture.health;
  openEditor(fixture);
  assert.equal(left.styleWrites.length, 3, 'OFF owns neutral texture, white background and white wash once');
  assertHudHealthStyles(left, true);
  assert.equal(readConfig(fixture).values.hudHealthColorMode, 'off');
  panel(fixture, 'HPColorsHudHealthColorModeTeam').events.onactivate();
  assert.equal(left.style.washColor, '#E7B659');
  assertHudHealthStyles(left, true, '#E7B659');
  panel(fixture, 'HPColorsHudHealthColorModeOff').events.onactivate();
  assertHudHealthStyles(left, true);
  assert.equal(left.style.washColor, '#FFFFFF', 'TEAM to OFF repaints without waiting for health changes');
  assert.equal(left.styleWrites.length, 5, 'TEAM to OFF changes only the wash');
  panel(fixture, 'HPColorsHudHealthColorModeTeam').events.onactivate();
  panel(fixture, 'HPColorsNpcEnemyToggle').events.onactivate();
  panel(fixture, 'HPColorsNpcEnemyToggle').events.onactivate();
  assert.equal(left.styleWrites.length, 6, 'unrelated effective publishes do not rewrite owned properties');
  fixture.harness.scheduler.runFor(4000);
  assert.equal(left.styleWrites.length, 6, 'cadence does not repeat native writes');
  container.RemoveClass('team1');
  container.AddClass('team2');
  fixture.harness.scheduler.runFor(2000);
  assert.equal(left.style.washColor, '#5B79E6');
  container.RemoveClass('team2');
  fixture.harness.scheduler.runFor(2000);
  assert.equal(left.style.washColor, '', 'unknown TEAM releases CSS ownership');
  assertHudHealthStyles(left, false);
  panel(fixture, 'HPColorsHudHealthColorModeCustom').events.onactivate();
  assert.equal(left.style.washColor, '#FFFF00');
  const hex = panel(fixture, 'HPColorsHudHealthColorHex');
  hex.text = '#123456';
  hex.events.ontextentrysubmit();
  assert.equal(left.style.washColor, '#123456');
  panel(fixture, 'HPColorsMasterToggle').events.onactivate();
  assert.equal(left.style.washColor, '');
  assertHudHealthStyles(left, false);
  panel(fixture, 'HPColorsMasterToggle').events.onactivate();
  assert.equal(left.style.washColor, '#123456');
  fixture.harness.root.SetAttributeString('hp_colors_v2_hydration', 'pending');
  fixture.harness.scheduler.runFor(2000);
  assert.equal(left.style.washColor, '');
  assertHudHealthStyles(left, false);
  const released = left.styleWrites.length;
  fixture.harness.scheduler.runFor(2000);
  assert.equal(left.styleWrites.length, released);
  fixture.harness.root.SetAttributeString('hp_colors_v2_hydration', 'done');
  fixture.harness.scheduler.runFor(2000);
  assert.equal(left.style.washColor, '#123456');
  panel(fixture, 'HPColorsHudHealthColorModeOff').events.onactivate();
  assert.equal(left.style.washColor, '#FFFFFF', 'CUSTOM to OFF repaints with an explicit neutral wash');
  assertHudHealthStyles(left, true);
  for (const part of untouched) assert.deepEqual(part.styleWrites, [], part.id);
});

test('HUD wash re-resolves replaced/detached panels, contains native failures and supports legacy layout', () => {
  for (const legacy of [false, true]) {
    const fixture = hudWashFixture({ hudHealthColorMode: 'custom', hudHealthColor: '#2468AC' }, { legacy });
    const { left, bar } = fixture.health;
    assert.equal(left.style.washColor, '#2468AC');
    left.SetParent(fixture.harness.root);
    const replacement = bar.add(panoramaHudStyle(new MockPanel('health_bar_Left', { style: { washColor: '' } })));
    fixture.harness.scheduler.runFor(2000);
    assert.equal(left.style.washColor, '', 'detached valid panel releases ownership');
    assertHudHealthStyles(left, false);
    assertHudHealthStyles(replacement, true, '#2468AC');
    assert.equal(replacement.style.washColor, '#2468AC');
    const count = replacement.styleWrites.length;
    fixture.harness.$.HPColorsMenuBoot();
    fixture.harness.scheduler.runFor(2000);
    assert.equal(replacement.styleWrites.length, count, 'idempotent boot and cached writes');
    replacement.DeleteAsync();
    const next = bar.add(panoramaHudStyle(new MockPanel('health_bar_Left', { style: { washColor: '' } })));
    fixture.harness.scheduler.runFor(2000);
    assert.equal(next.style.washColor, '#2468AC');
  }
  const off = hudWashFixture({ enabled: false, hudHealthColorMode: 'team' }, {
    stockStyles: { backgroundImage: HUD_NEUTRAL_TEXTURE, backgroundColor: '#FFFFFF', washColor: '#112233' },
  });
  off.harness.scheduler.runFor(2000);
  assertHudHealthStyles(off.health.left, false);
  assert.equal(off.health.left.styleWrites.length, 3, 'master-off clears every previous-context property once');
  const untouched = hudWashFixture({}, { stockColor: '#112233' });
  untouched.harness.scheduler.runFor(2000);
  assertHudHealthStyles(untouched.health.left, true);
  assert.equal(untouched.health.left.styleWrites.length, 3, 'OFF replaces the previous layout wash with white');
  untouched.harness.scheduler.runFor(4000);
  assert.equal(untouched.health.left.styleWrites.length, 3, 'unchanged OFF is idempotent');
});

test('HUD wash release stops traversals until paint and a fresh context clears leftovers once', () => {
  const stockStyles = { backgroundImage: HUD_NEUTRAL_TEXTURE, backgroundColor: '#FFFFFF', washColor: '#112233' };
  for (let context = 0; context < 2; context++) {
    const fixture = hudWashFixture({ enabled: false, hudHealthColorMode: 'custom', hudHealthColor: '#2468AC' }, { stockStyles });
    const { container, left } = fixture.health;
    assertHudHealthStyles(left, false);
    assert.equal(left.styleWrites.length, 3, 'each fresh context clears all inherited properties');
    const ids = ['health_and_abilities_container', 'hud_health_bars', 'health_bar', 'health_bar_Left'];
    const finds = Object.fromEntries(ids.map(id => [id, fixture.harness.findCounts[id] || 0]));
    // Invalidate the cached lineage: an unguarded release would traverse again.
    container.SetParent(fixture.harness.root);
    fixture.harness.scheduler.runFor(4000);
    for (const [id, before] of Object.entries(finds))
      assert.equal(fixture.harness.findCounts[id] || 0, before, id + ' released lookup');
    assert.equal(left.styleWrites.length, 3, 'released ticks do not write again');
    container.SetParent(fixture.identityTree.hud);
    openEditor(fixture);
    panel(fixture, 'HPColorsMasterToggle').events.onactivate();
    assertHudHealthStyles(left, true, '#2468AC');
    assert.equal(left.styleWrites.length, 6, 'painting after release reacquires all properties');
    panel(fixture, 'HPColorsMasterToggle').events.onactivate();
    assertHudHealthStyles(left, false);
    assert.equal(left.styleWrites.length, 9, 'paint invalidates the release guard');
    fixture.harness.scheduler.runFor(4000);
    assert.equal(left.styleWrites.length, 9, 'later release remains idempotent');
  }
});

test('HUD wash custom row collapses unless CUSTOM or Advanced and retains disabled inputs except in CUSTOM; picker, reset and Undo work', () => {
  const fixture = hudWashFixture();
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryOverview').events.onactivate();
  panel(fixture, 'HPColorsTab0').events.onactivate();
  const row = panel(fixture, 'HPColorsHudHealthColorRow');
  const hex = panel(fixture, 'HPColorsHudHealthColorHex');
  const swatch = panel(fixture, 'HPColorsHudHealthColorSwatch');
  for (const mode of ['Off', 'Team', 'Custom']) {
    panel(fixture, 'HPColorsHudHealthColorMode' + mode).events.onactivate();
    const active = mode === 'Custom';
    assert.equal(row.BHasClass('Disabled'), !active);
    assert.equal(row.BHasClass('FeatureOff'), false);
    assert.equal(row.BHasClass('DependentCollapsed'), !active);
    assert.notEqual(row.enabled, false, 'Advanced retains the condition action while values are disabled');
    assert.equal(hex.enabled, active);
    assert.equal(swatch.enabled, active);
    if (!active) {
      hex.text = '#112233';
      hex.events.ontextentrysubmit();
      swatch.events.onactivate();
      assert.equal(readConfig(fixture).values.hudHealthColor, '#FFFF00');
      assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), false);
    }
  }
  panel(fixture, 'HPColorsCondition_hudHealthColorMode').events.onactivate();
  assert.deepEqual(panel(fixture, 'HPColorsConditionEnumOptions').Children().map(child => child.id),
    ['HPColorsConditionOption_off', 'HPColorsConditionOption_team', 'HPColorsConditionOption_custom']);
  panel(fixture, 'HPColorsConditionCancelButton').events.onactivate();
  panel(fixture, 'HPColorsCondition_hudHealthColor').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsConditionColorRow').BHasClass('Active'), true);
  panel(fixture, 'HPColorsConditionCancelButton').events.onactivate();
  swatch.events.onactivate();
  nativeColor(fixture, 18, 52, 86);
  panel(fixture, 'HPColorsPickerDone').events.onactivate();
  assert.equal(fixture.health.left.style.washColor, '#123456');
  requestReset(fixture);
  confirmReset(fixture);
  assert.equal(readConfig(fixture).values.hudHealthColorMode, 'off');
  assert.equal(readConfig(fixture).values.hudHealthColor, '#FFFF00');
  assert.equal(fixture.health.left.style.washColor, '#FFFFFF');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.hudHealthColorMode, 'custom');
  assert.equal(fixture.health.left.style.washColor, '#123456');
});

test('HUD wash uses effective hero scope and ability conditions rather than editor values', () => {
  const selected = { id: 'user_0001', name: 'Shiv HUD', mode: 'selected', heroes: ['hero_shiv'],
    values: { hudHealthColorMode: 'custom', hudHealthColor: '#123456' }, own: ['hudHealthColorMode', 'hudHealthColor'],
    conditions: { hudHealthColor: { slot: 1, minTier: 2, value: '#ABCDEF' } } };
  const fixture = hudWashFixture({ hudHealthColorMode: 'off' }, { userPresets: [selected] });
  const signatureRoot = fixture.identityTree.hud.add(new MockPanel('hud_signature'));
  const abilities = signatureRoot.add(new MockPanel('hud_abilities'));
  const slots = abilities.add(new MockPanel('abilities'));
  const signature = slots.add(new MockPanel('slot_signature_1', { classes: ['Tier2'] }));
  fixture.harness.scheduler.runFor(4000);
  assert.equal(readConfig(fixture).values.hudHealthColor, '#ABCDEF');
  assert.equal(fixture.health.left.style.washColor, '#ABCDEF');
  signature.RemoveClass('Tier2');
  signature.AddClass('Tier1');
  fixture.harness.scheduler.runFor(2000);
  assert.equal(fixture.health.left.style.washColor, '#123456');
  fixture.identityTree.setHeroName('HAZE');
  fixture.harness.scheduler.runFor(3000);
  assert.equal(fixture.health.left.style.washColor, '#FFFFFF');
});

test('HUD wash stale identity callbacks cannot paint, and cached lookups survive team-only updates', () => {
  const fixture = hudWashFixture({ hudHealthColorMode: 'team' });
  const stale = fixture.harness.scheduler.jobs.find(job => job.delay === 0).fn;
  fixture.harness.scheduler.runFor(4000);
  const { container, left } = fixture.health;
  const finds = Object.fromEntries(['health_and_abilities_container', 'hud_health_bars', 'health_bar', 'health_bar_Left']
    .map(id => [id, fixture.harness.findCounts[id] || 0]));
  const count = left.styleWrites.length;
  container.RemoveClass('team1');
  container.AddClass('team2');
  stale();
  assert.equal(left.styleWrites.length, count, 'retired generation must be inert');
  fixture.harness.scheduler.runFor(2000);
  assert.equal(left.style.washColor, '#5B79E6');
  for (const [id, before] of Object.entries(finds))
    assert.equal(fixture.harness.findCounts[id] || 0, before, id + ' cached lookup');
  container.AddClass('team1');
  fixture.harness.scheduler.runFor(2000);
  assert.equal(left.style.washColor, '', 'conflicting team facts are unknown');
});

test('HUD styles retry rejected native writes and cache each property independently', () => {
  const fixture = hudWashFixture();
  let color = '';
  let reject = true;
  let writes = 0;
  fixture.health.left.style = new Proxy(fixture.health.left.style, {
    get(target, property) {
      return property === 'washColor' ? color : Reflect.get(target, property);
    },
    set(target, property, value) {
      if (property !== 'washColor') return Reflect.set(target, property, value);
      if (value === '') throw new Error('Panorama rejects empty inline washColor');
      if (reject) throw new Error('native style unavailable');
      writes++;
      color = value === null ? '' : value + 'FF';
      return true;
    },
  });
  openEditor(fixture);
  panel(fixture, 'HPColorsHudHealthColorModeCustom').events.onactivate();
  const warningCount = () => fixture.harness.logs.filter(message =>
    message.startsWith('[HPV2] warning: HUD style write failed for washColor;')).length;
  assert.equal(warningCount(), 1, 'rejected HUD style writes warn once');
  assert.doesNotMatch(canonicalMenuSource, /DEBUG_LOG|debugLog|\[debug\]/, 'menu ships without debug logging');
  assert.equal(color, '');
  reject = false;
  panel(fixture, 'HPColorsNpcEnemyToggle').events.onactivate();
  assert.equal(color, '#FFFF00FF');
  assertHudHealthStyles(fixture.health.left, true, '#FFFF00FF');
  const count = writes;
  fixture.harness.scheduler.runFor(2000);
  assert.equal(writes, count, 'cache does not compare normalized native reads');
  reject = true;
  panel(fixture, 'HPColorsHudHealthColorModeOff').events.onactivate();
  assert.equal(color, '#FFFF00FF');
  panel(fixture, 'HPColorsNpcEnemyToggle').events.onactivate();
  assert.equal(warningCount(), 1, 'repeated failures warn once per property per context');
  reject = false;
  panel(fixture, 'HPColorsNpcEnemyToggle').events.onactivate();
  assert.equal(color, '#FFFFFFFF', 'failed OFF white wash stays retryable');
  const offWrites = writes;
  fixture.harness.scheduler.runFor(2000);
  assert.equal(writes, offWrites, 'normalized white wash readback does not cause rewrites');
  reject = true;
  fixture.harness.root.SetAttributeString('hp_colors_v2_hydration', 'pending');
  fixture.harness.scheduler.runFor(2000);
  assert.equal(color, '#FFFFFFFF', 'failed release leaves the previous wash until retry');
  assert.equal(warningCount(), 1, 'release failures share the once-per-property warning');
  reject = false;
  fixture.harness.scheduler.runFor(2000);
  assert.equal(color, '', 'failed null removal stays retryable on release');
  assertHudHealthStyles(fixture.health.left, false);
  const released = writes;
  fixture.harness.scheduler.runFor(2000);
  assert.equal(writes, released, 'pending release does not repeat the cleared wash');
});

test('HUD OFF to TEAM to CUSTOM to OFF writes white wash and nulls properties only on release', () => {
  const fixture = hudWashFixture();
  openEditor(fixture);
  assertHudHealthStyles(fixture.health.left, true);
  for (const [mode, wash] of [['Team', '#E7B659'], ['Custom', '#FFFF00'], ['Off', '#FFFFFF']]) {
    panel(fixture, 'HPColorsHudHealthColorMode' + mode).events.onactivate();
    assertHudHealthStyles(fixture.health.left, true, wash);
  }
  assert.deepEqual(fixture.health.left.styleWrites.at(-1), { property: 'washColor', value: '#FFFFFF' });
  panel(fixture, 'HPColorsMasterToggle').events.onactivate();
  assertHudHealthStyles(fixture.health.left, false);
  for (const property of ['backgroundImage', 'backgroundColor', 'washColor'])
    assert.equal(fixture.health.left.styleWrites.filter(write => write.property === property).at(-1).value, null);
});

test('HUD mode OFF to TEAM to CUSTOM Undo restores both mode and owned wash', () => {
  const fixture = hudWashFixture();
  openEditor(fixture);
  panel(fixture, 'HPColorsHudHealthColorModeTeam').events.onactivate();
  assert.equal(fixture.health.left.style.washColor, '#E7B659');
  panel(fixture, 'HPColorsHudHealthColorModeCustom').events.onactivate();
  assert.equal(fixture.health.left.style.washColor, '#FFFF00');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.hudHealthColorMode, 'team');
  assert.equal(fixture.health.left.style.washColor, '#E7B659');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.hudHealthColorMode, 'off');
  assert.equal(fixture.health.left.style.washColor, '#FFFFFF');
  assertHudHealthStyles(fixture.health.left, true);
});

test('HUD custom picker Done then Undo restores opening color and wash in one step', () => {
  const fixture = hudWashFixture({ hudHealthColorMode: 'custom', hudHealthColor: '#123456' });
  openEditor(fixture);
  panel(fixture, 'HPColorsHudHealthColorSwatch').events.onactivate();
  nativeColor(fixture, 1, 2, 3);
  nativeColor(fixture, 4, 5, 6);
  panel(fixture, 'HPColorsPickerDone').events.onactivate();
  assert.equal(fixture.health.left.style.washColor, '#040506');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.hudHealthColor, '#123456');
  assert.equal(fixture.health.left.style.washColor, '#123456');
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
});

test('ally pulse controls bind, dim inert dependent rows and allow legacy boot', () => {
  const fixture = bootMenu({ version: 1, offsetVersion: 2,
    values: { allyReadoutVisible: false }, scopes: [] });
  openEditor(fixture);
  const pulse = panel(fixture, 'HPColorsAllyPulseReadoutToggle');
  assert.equal(pulse.enabled, false);
  assert.equal(panel(fixture, 'HPColorsAllyPulseReadoutRow').BHasClass('FeatureOff'), true, 'hidden while ally pulse is off');
  pulse.events.onactivate();
  assert.equal(readConfig(fixture).values.allyPulseReadout, false);
  panel(fixture, 'HPColorsAllyReadoutToggle').events.onactivate();
  assert.equal(pulse.enabled, true);
  pulse.events.onactivate();
  assert.equal(readConfig(fixture).values.allyPulseReadout, true);
  const legacy = bootMenu(null, {
    beforeBoot(harness) {
      for (const id of ['HPColorsAllyPulseReadoutRow', 'HPColorsAllyPulseReadoutToggle'])
        harness.root.FindChildTraverse(id)?.DeleteAsync();
    },
  });
  assert.equal(legacy.harness.logs.some(message => String(message).includes('menu boot failed')), false);
  assert.ok(configDispatches(legacy).length);
});

test('name alignment segments commit, Undo and Name & Appearance page reset restore values', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryOverview').events.onactivate();
  panel(fixture, 'HPColorsTab2').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsNameAlignCenter').BHasClass('Selected'), true);
  for (const value of ['Left', 'Right', 'Center']) {
    panel(fixture, 'HPColorsNameAlign' + value).events.onactivate();
    assert.equal(readConfig(fixture).values.nameAlign, value.toLowerCase());
    assert.equal(panel(fixture, 'HPColorsNameAlign' + value).BHasClass('Selected'), true);
  }
  panel(fixture, 'HPColorsNameAlignRight').events.onactivate();
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.nameAlign, 'center');
  panel(fixture, 'HPColorsNameAlignLeft').events.onactivate();
  requestReset(fixture);
  confirmReset(fixture);
  assert.equal(readConfig(fixture).values.nameAlign, 'center');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.nameAlign, 'left');
  panel(fixture, 'HPColorsPlayerNamesToggle').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsNameAlignRow').BHasClass('FeatureOff'), true);
});

test('HP text alignment is enabled by either readout and supports Undo and page reset', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  const row = panel(fixture, 'HPColorsHpTextAlignRow');
  assert.equal(panel(fixture, 'HPColorsHpTextAlignLeft').BHasClass('Selected'), true);
  assert.equal(row.BHasClass('FeatureOff'), false);
  for (const value of ['Left', 'Center', 'Right']) {
    panel(fixture, 'HPColorsHpTextAlign' + value).events.onactivate();
    assert.equal(readConfig(fixture).values.hpTextAlign, value.toLowerCase());
    assert.equal(panel(fixture, 'HPColorsHpTextAlign' + value).BHasClass('Selected'), true);
  }
  panel(fixture, 'HPColorsHpTextAlignLeft').events.onactivate();
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.hpTextAlign, 'right');
  panel(fixture, 'HPColorsHpTextAlignCenter').events.onactivate();
  requestReset(fixture);
  confirmReset(fixture);
  assert.equal(readConfig(fixture).values.hpTextAlign, 'left');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.hpTextAlign, 'center');
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  panel(fixture, 'HPColorsReadoutToggle').events.onactivate();
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(row.BHasClass('FeatureOff'), true);
  panel(fixture, 'HPColorsPlayerSideAlly').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  panel(fixture, 'HPColorsAllyReadoutToggle').events.onactivate();
  panel(fixture, 'HPColorsCategoryEnemy').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(row.BHasClass('FeatureOff'), false);
});

test('legacy layouts without name alignment rows boot and cache absent controls', () => {
  const fixture = bootMenu(undefined, { layout: legacyLayoutSource, beforeBoot(harness) {
    for (const child of harness.root.Children()) {
      if (/^HPColorsNameAlign/.test(child.id)) child.DeleteAsync();
    }
  } });
  assert.equal(fixture.harness.logs.some(message => String(message).includes('menu boot failed')), false);
  assert.ok(configDispatches(fixture).length);
  openEditor(fixture);
  const entry = panel(fixture, 'HPColorsWidthEntry');
  const before = { ...fixture.harness.findCounts };
  for (let index = 0; index < 3; index++) entry.events.oncancel();
  for (const id of Object.keys(fixture.harness.findCounts)) {
    if (/^HPColorsNameAlign/.test(id))
      assert.equal(fixture.harness.findCounts[id], before[id], id);
  }
});

test('UI labels shared alignment and describes independent units without verbose row help', () => {
  const categories = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_DEFS');
  assert.equal(categories.find(category => category.name === 'UNITS').tabs[0].name, 'TYPES');
  assert.match(layoutSource, /text="OBJECTIVES" class="HPColorsSectionHeading"/);
  assert.doesNotMatch(layoutSource, /text="[^"]*BUILDINGS/);
  assert.match(layoutSource, /Lane troopers cannot be customized/);
  assert.match(layoutSource, /palette even if player colors are off/);
  assert.match(layoutSource, /Current HP only; neutral NPCs use enemy text settings/);
  assert.match(layoutSource, /HP TEXT ALIGN — BOTH SIDES/);
  assert.equal((layoutSource.match(/LEFT grows left, CENTER grows both ways, RIGHT grows right\./g) || []).length, 2);
  assert.doesNotMatch(layoutSource, /Set the exact (width|height) of each enemy stamina pip/);
  for (const id of ['HPColorsHpTextAlignRow', 'HPColorsHpTextAlignLeft', 'HPColorsHpTextAlignCenter', 'HPColorsHpTextAlignRight'])
    assert.ok(layoutSource.includes('id="' + id + '"'));
  assert.ok(layoutSource.indexOf('id="HPColorsNameAlignRow"') < layoutSource.indexOf('id="HPColorsNameOffsetXRow"'));
});

test('CRITICAL and ASSASSINATE offsets edit in pixels; CRITICAL rows follow the label toggle', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  panel(fixture, 'HPColorsCategoryOverview').events.onactivate();
  panel(fixture, 'HPColorsTab2').events.onactivate();
  for (const [base, key, text, value] of [
    ['HPColorsCriticalOffsetX', 'criticalOffsetX', '-14', -14],
    ['HPColorsCriticalOffsetY', 'criticalOffsetY', '9', 9],
    ['HPColorsAssassinateOffsetX', 'assassinateOffsetX', '22', 22],
    ['HPColorsAssassinateOffsetY', 'assassinateOffsetY', '-500', -210],
  ]) {
    const entry = panel(fixture, base + 'Entry');
    entry.text = text;
    entry.events.ontextentrysubmit();
    assert.equal(readConfig(fixture).values[key], value, key);
  }
  panel(fixture, 'HPColorsCriticalIndicatorToggle').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsCriticalOffsetXRow').BHasClass('FeatureOff'), true);
  assert.equal(panel(fixture, 'HPColorsCriticalOffsetYRow').BHasClass('FeatureOff'), true);
  assert.equal(panel(fixture, 'HPColorsAssassinateOffsetXRow').BHasClass('FeatureOff'), false);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsCriticalOffsetXRow').BHasClass('FeatureOff'), false);
});

test('BAR MASK segments on Layout commit, Undo and page reset restore NONE', () => {
  const fixture = bootMenu();
  openEditor(fixture);
  selectOverviewLayout(fixture);
  const row = panel(fixture, 'HPColorsBarMaskRow');
  assert.equal(row.BHasClass('TuningCollapsed'), false, 'BAR MASK is a basic Layout row');
  assert.equal(panel(fixture, 'HPColorsBarMaskNone').BHasClass('Selected'), true);
  assert.equal(readConfig(fixture).values.barMask, 'none');
  panel(fixture, 'HPColorsBarMaskOriginal').events.onactivate();
  assert.equal(readConfig(fixture).values.barMask, 'original');
  assert.equal(panel(fixture, 'HPColorsBarMaskOriginal').BHasClass('Selected'), true);
  assert.equal(panel(fixture, 'HPColorsBarMaskNone').BHasClass('Selected'), false);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.barMask, 'none');
  panel(fixture, 'HPColorsBarMaskOriginal').events.onactivate();
  requestReset(fixture);
  confirmReset(fixture);
  assert.equal(readConfig(fixture).values.barMask, 'none');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.barMask, 'original');
  assert.ok(layoutSource.indexOf('id="HPColorsHeightScaleRow"') < layoutSource.indexOf('id="HPColorsBarMaskRow"'));
  assert.ok(layoutSource.indexOf('id="HPColorsBarMaskRow"') < layoutSource.indexOf('id="HPColorsBarPositionSection"'));
});

// Failure modes: OLD button missing or unbound, labels not V2/V1/OLD in button order,
// condition editor shows raw enum names, legacy layouts without the OLD button fail to boot.
test('BAR STYLE offers V2, V1 and OLD with matching condition labels', () => {
  const row = layoutSource.slice(layoutSource.indexOf('id="HPColorsBarMaskRow"'),
    layoutSource.indexOf('id="HPColorsBarPositionSection"'));
  assert.match(row, /text="BAR STYLE"/);
  assert.deepEqual(Array.from(row.matchAll(/<Button id="(HPColorsBarMask\w+)"[^>]*><Label text="([^"]+)"/g), m => [m[1], m[2]]), [
    ['HPColorsBarMaskOriginal', 'V2'], ['HPColorsBarMaskNone', 'V1'], ['HPColorsBarMaskOld', 'OLD']]);
  const fixture = bootMenu(undefined, { tree: true });
  openEditor(fixture);
  selectOverviewLayout(fixture);
  panel(fixture, 'HPColorsBarMaskOld').events.onactivate();
  assert.equal(readConfig(fixture).values.barMask, 'old');
  assert.equal(panel(fixture, 'HPColorsBarMaskOld').BHasClass('Selected'), true);
  assert.equal(panel(fixture, 'HPColorsBarMaskNone').BHasClass('Selected'), false);
  panel(fixture, 'HPColorsCondition_barMask').events.onactivate();
  const options = panel(fixture, 'HPColorsConditionEnumOptions').Children();
  assert.deepEqual(options.map(child => [child.id, child.Children()[0].text]), [
    ['HPColorsConditionOption_original', 'V2'], ['HPColorsConditionOption_none', 'V1'], ['HPColorsConditionOption_old', 'OLD']]);
  panel(fixture, 'HPColorsConditionCancelButton').events.onactivate();
  const legacy = bootMenu(undefined, { beforeBoot(harness) { harness.root.FindChildTraverse('HPColorsBarMaskOld')?.DeleteAsync(); } });
  assert.equal(legacy.harness.logs.some(message => String(message).includes('menu boot failed')), false);
});

function visibleSettingRows(fixture, pageId) {
  return panel(fixture, pageId).FindChildrenWithClassTraverse('HPColorsSettingRow').filter(row => {
    for (let item = row; item && item.id !== 'HPColorsSettingsList'; item = item.GetParent()) {
      if (['FeatureOff', 'TuningCollapsed', 'DependentCollapsed', 'SideCollapsed', 'SectionCollapsed'].some(name => item.BHasClass(name))) return false;
      if (item.BHasClass('HPColorsConditionalRow') && !item.BHasClass('Active')) return false;
      if (item.BHasClass('HPColorsSettingsPage') && !item.BHasClass('Active')) return false;
    }
    return true;
  });
}

// Failure modes: side/fold must not touch settings/history/save/replay/timers;
// nested gates must stay stronger than Advanced; resets must include invisible
// allies and conditions; legacy routing must not inherit the new rail positions.
test("closed disclosures yield 62 default rows across all presentations, at most ten per page", () => {
  const fixture = bootMenu(undefined, { tree: true });
  openEditor(fixture);
  const categories = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_DEFS');
  const buttons = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_BUTTON_IDS');
  const union = new Set();
  let max = 0;
  for (let rail = 0; rail < categories.length; rail++) {
    panel(fixture, buttons[rail]).events.onactivate();
    for (let tab = 0; tab < categories[rail].tabs.length; tab++) {
      panel(fixture, 'HPColorsTab' + tab).events.onactivate();
      for (const side of categories[rail].name === 'PLAYERS' ? ['Enemy', 'Ally'] : ['Enemy']) {
        if (categories[rail].name === 'PLAYERS') panel(fixture, 'HPColorsPlayerSide' + side).events.onactivate();
        const rows = visibleSettingRows(fixture, categories[rail].tabs[tab].pageId);
        max = Math.max(max, rows.length);
        for (const row of rows) union.add(row.id);
      }
    }
  }
  // Colors, toggles and styles are basic; sizes, offsets and tuning numbers sit under ADVANCED.
  assert.equal(union.size, 62);
  assert.equal(max, 10);
  panel(fixture, 'HPColorsCategoryOverview').events.onactivate();
  assert.equal(visibleSettingRows(fixture, 'HPColorsSettingsOverviewStatus').length, 2);
});

test('side and Advanced are local, cached, and send no state intents or scheduled work', () => {
  const intents = [];
  const fixture = bootMenu(undefined, { tree: true, intents });
  openEditor(fixture);
  selectEnemyBar(fixture);
  const beforeState = readMenuState(fixture);
  const beforeConfig = readConfig(fixture);
  const dispatches = configDispatches(fixture).length;
  const jobs = fixture.harness.scheduler.jobs.length;
  const writes = observeRootAttributeWrites(fixture.harness);
  intents.length = 0;
  panel(fixture, 'HPColorsPlayerSideAlly').events.onactivate();
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSettingsAllyBar').BHasClass('SideCollapsed'), false);
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSettingsAllyReadout').BHasClass('SideCollapsed'), false);
  assert.equal(panel(fixture, 'HPColorsAdvancedToggleLabel').text, 'ADVANCED');
  panel(fixture, 'HPColorsTab0').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsAdvancedToggleLabel').text, 'HIDE ADVANCED');
  const side = panel(fixture, 'HPColorsPlayerSideAlly');
  const sideWrites = fixture.harness.operationCounts.classWrites;
  side.events.onactivate();
  fixture.harness.$.HPColorsMenuBoot();
  assert.equal(fixture.harness.operationCounts.classWrites, sideWrites);
  assert.deepEqual(intents, []);
  assert.deepEqual(readMenuState(fixture), beforeState);
  assert.deepEqual(readConfig(fixture), beforeConfig);
  assert.equal(configDispatches(fixture).length, dispatches);
  assert.equal(fixture.harness.scheduler.jobs.length, jobs);
  assert.equal(writes.length, 0, 'no serialized navigation/fold state or save request');
});

test('switching side or folding closes picker and discards condition draft without intent', () => {
  const intents = [];
  const fixture = bootMenu(undefined, { tree: true, intents });
  openEditor(fixture);
  selectEnemyBar(fixture);
  panel(fixture, 'HPColorsEnemyLowSwatch').events.onactivate();
  intents.length = 0;
  panel(fixture, 'HPColorsPlayerSideAlly').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsPlayerSideAlly').focused, true);
  assert.deepEqual(intents, []);
  panel(fixture, 'HPColorsCondition_allyLow').events.onactivate();
  panel(fixture, 'HPColorsConditionColorEntry').text = '#123456';
  intents.length = 0;
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsConditionDialog').BHasClass('Open'), false);
  assert.deepEqual(intents, []);
  assert.equal(readMenuState(fixture).conditions.allyLow, undefined);
});

test('dependent collapse follows parents while Advanced preserves disabled condition access and old gates', () => {
  const fixture = bootMenu(undefined, { tree: true });
  openEditor(fixture);
  const hud = panel(fixture, 'HPColorsHudHealthColorRow');
  assert.equal(hud.BHasClass('DependentCollapsed'), true);
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  assert.equal(hud.BHasClass('DependentCollapsed'), false);
  assert.equal(panel(fixture, 'HPColorsHudHealthColorSwatch').enabled, false);
  assert.notEqual(panel(fixture, 'HPColorsCondition_hudHealthColor').enabled, false);
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  panel(fixture, 'HPColorsHudHealthColorModeCustom').events.onactivate();
  assert.equal(hud.BHasClass('DependentCollapsed'), false);
  panel(fixture, 'HPColorsTab2').events.onactivate();
  const name = panel(fixture, 'HPColorsEnemyNameColorRow');
  assert.equal(name.BHasClass('DependentCollapsed'), true);
  panel(fixture, 'HPColorsEnemyNameColorToggle').events.onactivate();
  assert.equal(name.BHasClass('DependentCollapsed'), false);
  panel(fixture, 'HPColorsPlayerNamesToggle').events.onactivate();
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  assert.equal(name.BHasClass('FeatureOff'), true);
  selectEnemyBar(fixture);
  panel(fixture, 'HPColorsTab1').events.onactivate();
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsReadoutCustomRows').BHasClass('Active'), false);
  assert.equal(panel(fixture, 'HPColorsReadoutModeRow').BHasClass('FeatureOff'), false);
  assert.ok(!visibleSettingRows(fixture, 'HPColorsSettingsReadoutNumber').some(row => row.id === 'HPColorsReadoutModeRow'));
  panel(fixture, 'HPColorsReadoutColorCustom').events.onactivate();
  assert.ok(visibleSettingRows(fixture, 'HPColorsSettingsReadoutNumber').some(row => row.id === 'HPColorsReadoutModeRow'));
});

test('Players reset confirms both sides and hidden settings, including shared alignment rules', () => {
  const fixture = bootMenu({ version: 1, values: {
    allyReadoutVisible: true, allyReadoutOffsetX: 30, hpTextAlign: 'right', nameAlign: 'right', lowThreshold: 12,
  }, conditions: { hpTextAlign: { slot: 1, minTier: 1, value: 'center' } }, scopes: [] }, { tree: true });
  openEditor(fixture);
  selectEnemyBar(fixture);
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsAllyReadoutOffsetXRow').BHasClass('TuningCollapsed'), false,
    'a changed hidden offset opens ADVANCED');
  requestReset(fixture);
  assert.match(panel(fixture, 'HPColorsResetDialogMessage').text, /both enemy and ally.*including hidden settings/);
  assert.match(panel(fixture, 'HPColorsResetDialogMessage').text, /shared HP text alignment/);
  assert.equal(panel(fixture, 'HPColorsPlayerSideAlly').enabled, false);
  panel(fixture, 'HPColorsCategoryOverview').events.onactivate();
  confirmReset(fixture);
  const reset = readMenuState(fixture);
  assert.equal(reset.values.allyReadoutOffsetX, shippedDefaults.allyReadoutOffsetX);
  assert.equal(reset.values.hpTextAlign, shippedDefaults.hpTextAlign);
  assert.equal(reset.conditions.hpTextAlign, undefined);
  assert.equal(reset.values.nameAlign, 'right');
  assert.equal(reset.values.lowThreshold, 12);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readMenuState(fixture).values.allyReadoutOffsetX, 30);
  assert.equal(readMenuState(fixture).conditions.hpTextAlign.value, 'center');
});

test('actual legacy four-rail hierarchy boots without selector, folds, store, or new rows', () => {
  const fixture = bootMenu(undefined, { layout: legacyLayoutSource, tree: true });
  openEditor(fixture);
  assert.equal(panel(fixture, 'HPColorsLiveStatus').text, 'OLD PRESET VPK');
  for (const id of ['HPColorsPlayerSide', 'HPColorsAdvancedToggle', 'HPColorsV2Store', 'HPColorsHudHealthColorRow'])
    assert.equal(fixture.harness.root.FindChildTraverse(id), null, id);
  panel(fixture, 'HPColorsCategoryAlly').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSettingsAllyBar').BHasClass('Active'), true);
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSettingsAllyFeedback').BHasClass('Active'), true);
  panel(fixture, 'HPColorsAllyHealingHex').text = '#123456';
  panel(fixture, 'HPColorsAllyHealingHex').events.ontextentrysubmit();
  requestReset(fixture); confirmReset(fixture);
  assert.equal(readConfig(fixture).values.allyHealing, shippedDefaults.allyHealing);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.allyHealing, '#123456');
  const finds = fixture.harness.findCounts.HPColorsHudHealthColorRow || 0;
  panel(fixture, 'HPColorsTab0').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(fixture.harness.findCounts.HPColorsHudHealthColorRow || 0, finds);
});


test("all 154 settings rows remain reachable with parents enabled and Advanced open; Players basic stays bounded", () => {
  const values = { ...shippedDefaults };
  for (const key of Object.keys(values)) if (typeof values[key] === 'boolean') values[key] = true;
  Object.assign(values, { enabled: false, hudHealthColorMode: 'custom', ultMode: 'custom',
    readoutColorMode: 'custom', allyReadoutColorMode: 'custom', ultimateTimerColorMode: 'gradient' });
  const fixture = bootMenu({ version: 1, offsetVersion: 2, values, scopes: [] }, { tree: true });
  openEditor(fixture);
  const categories = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_DEFS');
  const buttons = extractArrayDeclaration(canonicalMenuSource, 'CATEGORY_BUTTON_IDS');
  const all = new Set();
  for (let rail = 0; rail < categories.length; rail++) {
    panel(fixture, buttons[rail]).events.onactivate();
    for (let tab = 0; tab < categories[rail].tabs.length; tab++) {
      panel(fixture, 'HPColorsTab' + tab).events.onactivate();
      const page = categories[rail].tabs[tab];
      // Changed advanced values open the fold; close it to measure the basic rows.
      const folded = () => panel(fixture, 'HPColorsAdvancedToggleLabel').text === 'ADVANCED';
      if (page.keys.length && !folded()) panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
      for (const side of categories[rail].name === 'PLAYERS' ? ['Enemy', 'Ally'] : ['Enemy']) {
        if (categories[rail].name === 'PLAYERS') {
          panel(fixture, 'HPColorsPlayerSide' + side).events.onactivate();
          assert.ok(visibleSettingRows(fixture, page.pageId).length <= 10, page.name + '/' + side);
        }
      }
      if (page.keys.length) panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
      for (const side of categories[rail].name === 'PLAYERS' ? ['Enemy', 'Ally'] : ['Enemy']) {
        if (categories[rail].name === 'PLAYERS') panel(fixture, 'HPColorsPlayerSide' + side).events.onactivate();
        for (const row of visibleSettingRows(fixture, page.pageId)) all.add(row.id);
      }
    }
  }
  assert.equal(all.size, 154);
  assert.equal(readConfig(fixture).values.enabled, false, 'master-off does not prevent preparation');
  assert.equal(panel(fixture, 'HPColorsAdvancedToggle').BHasClass('Active'), false, 'Presets has its own guide, not Advanced');
  assert.equal(panel(fixture, 'HPColorsTabStrip').BHasClass('SinglePage'), true);
});

test('dirty native entry commits once to its original key before side switch or fold hides it', () => {
  const intents = [];
  const fixture = bootMenu(undefined, { tree: true, intents });
  openEditor(fixture); selectEnemyBar(fixture);
  panel(fixture, 'HPColorsTab1').events.onactivate();
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  const entry = panel(fixture, 'HPColorsReadoutOffsetXEntry');
  entry.SetFocus(); entry.text = '25';
  intents.length = 0;
  panel(fixture, 'HPColorsPlayerSideAlly').events.onactivate();
  assert.deepEqual(intents, ['setting_edit']);
  const changed = readConfig(fixture).values.readoutOffsetX;
  assert.equal(changed, 19, '25% rounds to stored 76px-baseline units');
  assert.equal(readConfig(fixture).values.allyReadoutOffsetX, 0);
  assert.equal(entry.focused, false);
  panel(fixture, 'HPColorsPlayerSideEnemy').events.onactivate();
  entry.SetFocus(); entry.text = '30';
  intents.length = 0;
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  assert.deepEqual(intents, ['setting_edit']);
  assert.equal(readConfig(fixture).values.readoutOffsetX, 23);
  assert.equal(entry.focused, false);
  assert.equal(panel(fixture, 'HPColorsAdvancedToggle').focused, true);
  assert.equal(panel(fixture, 'HPColorsReadoutOffsetXRow').BHasClass('TuningCollapsed'), true);
});

test('side navigation finalizes native picker through existing policy and leaves one Undo entry', () => {
  const fixture = bootMenu(undefined, { tree: true });
  openEditor(fixture); selectEnemyBar(fixture);
  const old = readConfig(fixture).values.enemyLow;
  panel(fixture, 'HPColorsEnemyLowSwatch').events.onactivate();
  nativeColor(fixture, 18, 52, 86);
  panel(fixture, 'HPColorsPlayerSideAlly').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), false);
  assert.equal(readConfig(fixture).values.enemyLow, '#123456', 'navigation finalizes, not Escape-cancels');
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.equal(readConfig(fixture).values.enemyLow, old);
  assert.equal(panel(fixture, 'HPColorsUndoButton').enabled, false);
  assert.equal(panel(fixture, 'HPColorsPlayerSideAlly').BHasClass('Selected'), true);
});

test('turning a parent off closes descendant condition draft and restores visible parent focus', () => {
  const fixture = bootMenu({ version: 1, values: { enemyNameColorEnabled: true }, scopes: [] }, { tree: true });
  openEditor(fixture); panel(fixture, 'HPColorsTab2').events.onactivate();
  panel(fixture, 'HPColorsCondition_enemyNameColor').events.onactivate();
  panel(fixture, 'HPColorsConditionColorEntry').text = '#112233';
  panel(fixture, 'HPColorsPlayerNamesToggle').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsConditionDialog').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsPlayerNamesToggle').focused, true);
  assert.equal(readMenuState(fixture).conditions.enemyNameColor, undefined);
  assert.equal(panel(fixture, 'HPColorsEnemyNameColorRow').BHasClass('FeatureOff'), true);
});


test('dependent reveal respects HUD, neutral, pulse, HP palettes and ultimate base icon gates', () => {
  const fixture = bootMenu({ version: 1, offsetVersion: 2, values: {
    enemyEnabled: false, npcEnemyEnabled: true, enemyPulseEnabled: true, allyPulseEnabled: true,
    readoutColorMode: 'custom', allyReadoutVisible: false, ultimateTimerEnabled: false,
  }, scopes: [] }, { tree: true });
  openEditor(fixture);
  selectEnemyBar(fixture);
  assert.equal(panel(fixture, 'HPColorsEnemyLowRow').BHasClass('FeatureOff'), false, 'NPC palette independent of player colors');
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.ok(visibleSettingRows(fixture, 'HPColorsSettingsReadoutNumber').some(row => row.id === 'HPColorsReadoutModeRow'));
  panel(fixture, 'HPColorsReadoutLowSwatch').events.onactivate();
  panel(fixture, 'HPColorsReadoutColorBar').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsReadoutColorBar').focused, true);
  assert.equal(panel(fixture, 'HPColorsReadoutCustomRows').BHasClass('Active'), false);
  panel(fixture, 'HPColorsTab2').events.onactivate();
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  const mode = panel(fixture, 'HPColorsEnemyPulseColorModeRow');
  assert.equal(mode.BHasClass('DependentCollapsed'), false);
  assert.equal(mode.BHasClass('Disabled'), true);
  assert.equal(panel(fixture, 'HPColorsEnemyPulseColorRow').BHasClass('Active'), false, 'Advanced does not force custom pulse palette');
  panel(fixture, 'HPColorsEnemyPulseColorToggle').events.onactivate();
  assert.equal(mode.BHasClass('Disabled'), false);
  assert.equal(panel(fixture, 'HPColorsEnemyPulseColorRow').BHasClass('Active'), true);
  panel(fixture, 'HPColorsPlayerSideAlly').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsAllyPulseReadoutToggle').enabled, false, 'ally pulse readout retains HP-text prerequisite');
  assert.notEqual(panel(fixture, 'HPColorsCondition_allyPulseReadout').enabled, false);
  panel(fixture, 'HPColorsCategoryUnits').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsNeutralColorRow').BHasClass('DependentCollapsed'), true);
  panel(fixture, 'HPColorsNpcNeutralToggle').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsNeutralColorRow').BHasClass('DependentCollapsed'), false);
  panel(fixture, 'HPColorsCategoryReadout').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  panel(fixture, 'HPColorsUltModeCustom').events.onactivate();
  assert.ok(visibleSettingRows(fixture, 'HPColorsSettingsUltimateTimer').some(row => row.id === 'HPColorsUltCustomRow'));
  assert.equal(panel(fixture, 'HPColorsUltimateTimerColorModeRow').BHasClass('FeatureOff'), true);
});

test('hidden values and rules survive side/fold changes and a session reload, which reopens changed Advanced', () => {
  const values = { hudHealthColor: '#112233', allyReadoutOffsetX: 30, enemyPulseReadoutSize: 190 };
  const conditions = { allyReadoutOffsetX: { slot: 1, minTier: 2, value: 90 } };
  const fixture = bootMenu({ version: 1, offsetVersion: 2, values, conditions, scopes: [] }, { tree: true });
  openEditor(fixture); selectEnemyBar(fixture);
  panel(fixture, 'HPColorsTab1').events.onactivate();
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  panel(fixture, 'HPColorsPlayerSideAlly').events.onactivate();
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  panel(fixture, 'HPColorsPlayerSideEnemy').events.onactivate();
  const saved = readMenuState(fixture);
  for (const [key, value] of Object.entries(values)) assert.equal(saved.values[key], value);
  assert.deepEqual(saved.conditions.allyReadoutOffsetX, conditions.allyReadoutOffsetX);
  const reload = bootMenu(saved, { tree: true }); openEditor(reload); selectEnemyBar(reload);
  panel(reload, 'HPColorsTab1').events.onactivate();
  assert.equal(panel(reload, 'HPColorsAdvancedToggleLabel').text, 'HIDE ADVANCED', 'changed Advanced values open the page folded out');
  assert.equal(panel(reload, 'HPColorsPlayerSideEnemy').BHasClass('Selected'), true);
  for (const [key, value] of Object.entries(values)) assert.equal(readMenuState(reload).values[key], value);
  assert.deepEqual(readMenuState(reload).conditions.allyReadoutOffsetX, conditions.allyReadoutOffsetX);
});

// Failure modes: a page with changed ADVANCED settings opens folded so the change is invisible;
// pages at defaults open unfolded; auto-open overrides an explicit HIDE ADVANCED; it sends
// intents or writes saved state.
test('pages open ADVANCED when one of their advanced settings differs from the default', () => {
  const intents = [];
  const fixture = bootMenu({ version: 1, values: { positionX: 50 }, scopes: [] }, { tree: true, intents });
  openEditor(fixture);
  const label = () => panel(fixture, 'HPColorsAdvancedToggleLabel').text;
  assert.equal(label(), 'ADVANCED', 'BASICS has only default advanced values');
  intents.length = 0;
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(label(), 'HIDE ADVANCED', 'LAYOUT opens with changed BAR X OFFSET shown');
  assert.equal(panel(fixture, 'HPColorsPositionXRow').BHasClass('TuningCollapsed'), false);
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  assert.equal(label(), 'ADVANCED');
  panel(fixture, 'HPColorsTab0').events.onactivate();
  panel(fixture, 'HPColorsTab1').events.onactivate();
  assert.equal(label(), 'ADVANCED', 'an explicit HIDE ADVANCED sticks for the session');
  assert.deepEqual(intents, []);
});

test("Layout exposes stock/custom outline colors in Basic and tuning in Advanced", () => {
  const fixture = bootMenu(undefined, { tree: true });
  openEditor(fixture); panel(fixture, "HPColorsTab1").events.onactivate();
  assert.equal(panel(fixture, "HPColorsBarOutlineToggle").BHasClass("Checked"), true);
  assert.equal(panel(fixture, "HPColorsBarOutlineCustomColorToggle").BHasClass("Checked"), false);
  for (const id of ["HPColorsBarOutlineEnabledRow", "HPColorsBarOutlineCustomColorRow", "HPColorsBarOutlineColorRow", "HPColorsAllyBarOutlineColorRow"])
    assert.equal(panel(fixture, id).BHasClass("TuningCollapsed"), false);
  for (const suffix of ["Thickness", "Opacity"])
    assert.equal(panel(fixture, "HPColorsBarOutline" + suffix + "Row").BHasClass("TuningCollapsed"), true);
  for (const id of ["HPColorsBarOutlineColorRow", "HPColorsAllyBarOutlineColorRow"])
    assert.equal(panel(fixture, id).BHasClass("DependentCollapsed"), true);
  panel(fixture, "HPColorsBarOutlineCustomColorToggle").events.onactivate();
  assert.equal(readConfig(fixture).values.barOutlineCustomColor, true);
  for (const id of ["HPColorsBarOutlineColorRow", "HPColorsAllyBarOutlineColorRow"])
    assert.equal(panel(fixture, id).BHasClass("DependentCollapsed"), false);
  panel(fixture, "HPColorsAllyBarOutlineColorHex").text = "#ABCDEF";
  panel(fixture, "HPColorsAllyBarOutlineColorHex").events.ontextentrysubmit();
  assert.equal(readConfig(fixture).values.allyBarOutlineColor, "#ABCDEF");
  panel(fixture, "HPColorsBarOutlineCustomColorToggle").events.onactivate();
  assert.equal(readConfig(fixture).values.barOutlineCustomColor, false);
  assert.equal(readConfig(fixture).values.allyBarOutlineColor, "#ABCDEF", "off retains custom colors");
  for (const id of ["HPColorsBarOutlineColorRow", "HPColorsAllyBarOutlineColorRow"])
    assert.equal(panel(fixture, id).BHasClass("DependentCollapsed"), true);
  panel(fixture, "HPColorsBarOutlineToggle").events.onactivate();
  assert.equal(readConfig(fixture).values.barOutlineEnabled, false);
  panel(fixture, "HPColorsAdvancedToggle").events.onactivate();
  assert.equal(panel(fixture, "HPColorsBarOutlineThicknessRow").BHasClass("DependentCollapsed"), false);
  assert.equal(panel(fixture, "HPColorsBarOutlineThicknessEntry").enabled, false);
  for (const key of ["barOutlineColor", "barOutlineCustomColor", "allyBarOutlineColor"])
    assert.notEqual(panel(fixture, "HPColorsCondition_" + key).enabled, false);
});

test('Pickups owns Rejuvenator: basic scale, Advanced offsets/tilt, conditions, reset and Undo', () => {
  const fixture = bootMenu(undefined, { tree: true });
  openEditor(fixture);
  panel(fixture, "HPColorsCategoryReadout").events.onactivate();
  panel(fixture, 'HPColorsTab3').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsSettingsPickupTimers').BHasClass('Active'), true);
  assert.equal(panel(fixture, 'HPColorsRejuvScaleRow').BHasClass('TuningCollapsed'), false);
  for (const base of ['RejuvOffsetX', 'RejuvOffsetY', 'RejuvTilt'])
    assert.equal(panel(fixture, 'HPColors' + base + 'Row').BHasClass('TuningCollapsed'), true, base);
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  const values = { rejuvScale: 150, rejuvOffsetX: 40, rejuvOffsetY: -30, rejuvTilt: -90 };
  for (const [base, key] of [['RejuvScale', 'rejuvScale'], ['RejuvOffsetX', 'rejuvOffsetX'],
    ['RejuvOffsetY', 'rejuvOffsetY'], ['RejuvTilt', 'rejuvTilt']]) {
    assert.equal(panel(fixture, 'HPColors' + base + 'Row').BHasClass('TuningCollapsed'), false);
    const entry = panel(fixture, 'HPColors' + base + 'Entry');
    entry.text = String(values[key]); entry.events.ontextentrysubmit();
    assert.equal(readConfig(fixture).values[key], values[key]);
    panel(fixture, 'HPColorsCondition_' + key).events.onactivate();
    assert.equal(panel(fixture, 'HPColorsConditionDialog').BHasClass('Open'), true);
    panel(fixture, 'HPColorsConditionCancelButton').events.onactivate();
  }
  panel(fixture, 'HPColorsAdvancedToggle').events.onactivate();
  requestReset(fixture); confirmReset(fixture);
  for (const key of Object.keys(values)) assert.equal(readConfig(fixture).values[key], shippedDefaults[key]);
  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  for (const [key, value] of Object.entries(values)) assert.equal(readConfig(fixture).values[key], value);
});
