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
const menuStyleSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/styles/hp_colors_menu.css'),
  'utf8',
);
const MENU_STATE_ATTR = 'hp_colors_rewrite_menu_state';
const CONFIG_ATTR = 'hp_colors_rewrite_config';

function installLayoutPanels(harness) {
  const ids = new Set(
    Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
  );
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
      operationCounts: harness.operationCounts,
    }));
  }
  function wrapRow(key, title, panelIds, suffix = '') {
    const rowId = suffix ? `ConditionRow_${key}_${suffix}` : `ConditionRow_${key}`;
    const titleId = suffix
      ? `ConditionTitle_${key}_${suffix}`
      : `ConditionTitle_${key}`;
    const row = harness.root.add(new MockPanel(rowId, {
      classes: ['HPColorsSettingRow'],
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
      operationCounts: harness.operationCounts,
    }));
    row.add(new MockPanel(titleId, {
      classes: ['HPColorsSettingTitle'],
      text: title,
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
      operationCounts: harness.operationCounts,
    }));
    for (const id of panelIds) {
      const control = harness.root.FindChildTraverse(id);
      if (control) control.SetParent(row);
    }
  }
  wrapRow('enabled', 'MASTER SWITCH', ['HPColorsMasterToggle']);
  wrapRow('enemyVisible', 'ENEMY BAR', ['HPColorsEnemyVisibleToggle']);
  wrapRow('widthScale', 'WIDTH', [
    'HPColorsWidthSliderHost',
    'HPColorsWidthEntry',
  ]);
  wrapRow('enemyMode', 'ENEMY MODE', [
    'HPColorsEnemyModeFixed',
    'HPColorsEnemyModeGradient',
  ]);
  wrapRow('enemyLow', 'ENEMY LOW', [
    'HPColorsEnemyLowSwatch',
    'HPColorsEnemyLowHex',
  ]);
  wrapRow('lowThreshold', 'LOW THRESHOLD', [
    'HPColorsLowThresholdSliderHost',
    'HPColorsLowThresholdEntry',
  ]);
  wrapRow('lowThreshold', 'LOW THRESHOLD', [
    'HPColorsReadoutLowThresholdSliderHost',
    'HPColorsReadoutLowThresholdEntry',
  ], 'readout');
  wrapRow('enemyPulseThreshold', 'PULSE THRESHOLD', [
    'HPColorsEnemyPulseThresholdSliderHost',
    'HPColorsEnemyPulseThresholdEntry',
  ]);
  wrapRow('enemyKillMarkerThreshold', 'MARKER THRESHOLD', [
    'HPColorsEnemyKillMarkerThresholdSliderHost',
    'HPColorsEnemyKillMarkerThresholdEntry',
  ]);
}

function installAbilityTree(
  harness,
  tiers = [-1, -1, -1, -1],
  options = {},
) {
  const treeRoot = options.underHud
    ? harness.root.FindChildTraverse('Hud')
    : harness.root;
  const abilities = options.omitContainer
    ? treeRoot
    : treeRoot.add(new MockPanel('AbilitiesContainer', {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
      operationCounts: harness.operationCounts,
    }));
  const signature = abilities.add(new MockPanel('hud_signature', {
    findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts,
    operationCounts: harness.operationCounts,
  }));
  const slotParent = options.wrapSlots
    ? signature.add(new MockPanel('abilities', {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
      operationCounts: harness.operationCounts,
    }))
    : signature;
  const omittedSlots = options.omitSlots || [];
  const slots = tiers.map((tier, index) => (
    omittedSlots.indexOf(index + 1) >= 0
      ? null
      : slotParent.add(new MockPanel(
        `slot_signature_${index + 1}`,
        {
          classes: tier < 0 ? [] : [`Tier${tier}`],
          findCounts: harness.findCounts,
          childReadCounts: harness.childReadCounts,
          operationCounts: harness.operationCounts,
        },
      ))
  ));
  const artSources = options.artSources || [];
  for (let index = 0; index < slots.length; index++) {
    if (!slots[index] || !artSources[index]) continue;
    const image = slots[index].add(new MockPanel('ability_image', {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
      operationCounts: harness.operationCounts,
    }));
    image.SetAttributeString('src', artSources[index]);
  }
  return { abilities, signature, slotParent, slots };
}

function bootMenu(menuState, options = {}) {
  const harness = createPanoramaHarness();
  installLayoutPanels(harness);
  installTopBarIdentityTree(harness, {
    heroName: options.heroName === undefined ? 'SHIV' : options.heroName,
    gameTime: options.gameTime === undefined ? '00:01' : options.gameTime,
  });
  const abilityTree = installAbilityTree(harness, options.tiers, {
    omitContainer: !!options.omitAbilityContainer,
    wrapSlots: !!options.wrapAbilitySlots,
    underHud: options.abilityTreeUnderHud !== false,
    omitSlots: options.omitAbilitySlots || [],
    artSources: options.abilityArtSources || [],
  });
  harness.root.SetAttributeString(MENU_STATE_ATTR, JSON.stringify(menuState));
  runHpColorsSourcesInVm(stateSource, menuSource, harness);
  harness.$.HPColorsMenuBoot();
  return { harness, abilityTree };
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

function panel(fixture, id) {
  const found = fixture.harness.root.FindChildTraverse(id);
  assert.ok(found, `expected ${id} panel`);
  return found;
}

function openEditor(fixture) {
  panel(fixture, 'HPColorsMenuButton').events.onactivate();
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

function presetRow(fixture, id) {
  const host = panel(fixture, 'HPColorsPresetOptions');
  function visit(current) {
    if (!current || !current.IsValid()) return null;
    if (current.GetAttributeString('hp_colors_preset_id', '') === id)
      return current;
    for (const child of current.Children()) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  }
  const row = visit(host);
  assert.ok(row, `expected preset row ${id}`);
  return row;
}

function presetRowControl(fixture, id, className) {
  const control = childWithClass(presetRow(fixture, id), className);
  assert.ok(control, `expected ${className} for ${id}`);
  return control;
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

function settleActiveLifecycle(fixture) {
  runIdentityTick(fixture);
  runIdentityTick(fixture);
}

function setTier(slot, tier) {
  for (let index = 0; index <= 3; index += 1)
    slot.SetHasClass(`Tier${index}`, index === tier);
}

test('menu hydration canonicalizes supported typed condition rules', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
    conditions: {
      enemyLow: { slot: 1, minTier: 2, value: '#aa44cc' },
      enemyTeamHigh: { slot: 2, minTier: 1, value: true },
      enemyMode: { slot: 3, minTier: 3, value: 'fixed' },
      widthScale: { slot: 4, minTier: 2, value: 117 },
    },
    scopes: [],
  });

  assert.deepEqual(readMenuState(fixture).conditions, {
    widthScale: { slot: 4, minTier: 2, value: 117 },
    enemyMode: { slot: 3, minTier: 3, value: 'fixed' },
    enemyLow: { slot: 1, minTier: 2, value: '#AA44CC' },
    enemyTeamHigh: { slot: 2, minTier: 1, value: true },
  });
});

test('menu hydration removes malformed and ineligible condition rules', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
    conditions: {
      unknownSetting: { slot: 1, minTier: 1, value: true },
      precisePipsEnabled: { slot: 1, minTier: 1, value: true },
      enemyLow: { slot: 0, minTier: 1, value: '#112233' },
      enemyVisible: { slot: 1, minTier: 4, value: false },
      widthScale: { slot: 1, minTier: 1, value: 'wide' },
    },
    scopes: [],
  });

  assert.deepEqual(readMenuState(fixture).conditions, {});
});

test('all four ability slots apply typed overrides at their minimum tier', () => {
  const fixture = bootMenu({
    version: 1,
    values: {
      widthScale: 100,
      enemyMode: 'gradient',
      enemyLow: '#111111',
      enemyTeamHigh: false,
    },
    conditions: {
      widthScale: { slot: 1, minTier: 1, value: 121 },
      enemyMode: { slot: 2, minTier: 2, value: 'fixed' },
      enemyLow: { slot: 3, minTier: 3, value: '#22AA44' },
      enemyTeamHigh: { slot: 4, minTier: 1, value: true },
    },
    scopes: [],
  }, { tiers: [1, 2, 3, 1] });

  settleActiveLifecycle(fixture);
  const values = readConfig(fixture).values;
  assert.equal(values.widthScale, 121);
  assert.equal(values.enemyMode, 'fixed');
  assert.equal(values.enemyLow, '#22AA44');
  assert.equal(values.enemyTeamHigh, true);
});

test('matched ability condition remains effective after closing the editor', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyPulseThreshold: 18 },
    conditions: {
      enemyPulseThreshold: { slot: 4, minTier: 3, value: 28 },
    },
    scopes: [],
  }, { tiers: [-1, -1, -1, 3] });

  settleActiveLifecycle(fixture);
  assert.equal(readConfig(fixture).values.enemyPulseThreshold, 28);

  openEditor(fixture);
  fixture.harness.$.HPColorsMenuCancel();
  assert.equal(
    panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'),
    false,
  );
  assert.equal(readConfig(fixture).values.enemyPulseThreshold, 28);

  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.enemyPulseThreshold, 28);
});

test('condition editor updates the active Current scope and publishes every matched threshold', () => {
  const baseValues = {
    lowThreshold: 18,
    highThreshold: 43,
    enemyPulseThreshold: 18,
    enemyKillMarkerEnabled: true,
    enemyKillMarkerThreshold: 18,
  };
  const pulseRule = {
    enemyPulseThreshold: { slot: 4, minTier: 3, value: 28 },
  };
  const fixture = bootMenu({
    version: 1,
    values: baseValues,
    conditions: pulseRule,
    scopes: [{
      id: 'scope_current',
      mode: 'all',
      heroes: [],
      values: baseValues,
      conditions: pulseRule,
    }],
  }, { tiers: [-1, -1, -1, 3] });
  settleActiveLifecycle(fixture);
  openEditor(fixture);

  for (const key of ['enemyKillMarkerThreshold', 'lowThreshold']) {
    panel(fixture, `HPColorsCondition_${key}`).events.onactivate();
    panel(fixture, 'HPColorsConditionSlot4').events.onactivate();
    panel(fixture, 'HPColorsConditionSlot4').events.onactivate();
    panel(fixture, 'HPColorsConditionSlot4').events.onactivate();
    panel(fixture, 'HPColorsConditionNumberEntry').text = '28';
    panel(fixture, 'HPColorsConditionNumberEntry').events.ontextentrysubmit();
    panel(fixture, 'HPColorsConditionApplyButton').events.onactivate();
  }

  const menuState = readMenuState(fixture);
  assert.deepEqual(menuState.conditions, pulseRule);
  assert.deepEqual(menuState.scopes[0].conditions, {
    lowThreshold: { slot: 4, minTier: 3, value: 28 },
    enemyPulseThreshold: { slot: 4, minTier: 3, value: 28 },
    enemyKillMarkerThreshold: { slot: 4, minTier: 3, value: 28 },
  });
  assert.equal(readConfig(fixture).values.enemyPulseThreshold, 28);
  assert.equal(readConfig(fixture).values.enemyKillMarkerThreshold, 28);
  assert.equal(readConfig(fixture).values.lowThreshold, 28);
});

test('tier loss and unavailable panels clear stale overrides through one publication gate', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    conditions: {
      enemyLow: { slot: 1, minTier: 2, value: '#22AA44' },
    },
    scopes: [],
  }, { tiers: [1, -1, -1, -1] });

  settleActiveLifecycle(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#111111');
  fixture.harness.dispatches.length = 0;

  setTier(fixture.abilityTree.slots[0], 2);
  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
  assert.equal(configDispatches(fixture).length, 1);

  fixture.harness.dispatches.length = 0;
  fixture.abilityTree.slots[0].DeleteAsync();
  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#111111');
  assert.equal(configDispatches(fixture).length, 1);
});

test('the resolved scope supplies values and conditions as one source', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    conditions: {
      enemyLow: { slot: 1, minTier: 1, value: '#FF0000' },
    },
    scopes: [{
      id: 'all_scope',
      mode: 'all',
      heroes: [],
      values: { enemyLow: '#222222' },
      conditions: {
        enemyLow: { slot: 2, minTier: 1, value: '#00FF00' },
      },
    }],
  }, { tiers: [1, 1, -1, -1] });

  settleActiveLifecycle(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#00FF00');
  assert.deepEqual(readMenuState(fixture).scopes[0].conditions, {
    enemyLow: { slot: 2, minTier: 1, value: '#00FF00' },
  });
});

test('preset Save and explicit Apply carry conditions without inert selection publishing', () => {
  const source = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    conditions: {
      enemyLow: { slot: 2, minTier: 2, value: '#22AA44' },
    },
    scopes: [],
    userPresets: [],
  }, { tiers: [-1, 2, -1, -1] });
  openEditor(source);
  source.harness.dispatches.length = 0;
  panel(source, 'HPColorsPresetNameInput').text = 'Tier Two';
  panel(source, 'HPColorsPresetSaveButton').events.onactivate();

  let state = readMenuState(source);
  assert.deepEqual(state.userPresets[0].conditions, {
    enemyLow: { slot: 2, minTier: 2, value: '#22AA44' },
  });
  assert.equal(configDispatches(source).length, 0);

  const destination = bootMenu({
    version: 1,
    values: { enemyLow: '#333333' },
    conditions: {},
    scopes: [],
    userPresets: state.userPresets,
    selectedPresetId: null,
  }, { tiers: [-1, 2, -1, -1] });
  openEditor(destination);
  destination.harness.dispatches.length = 0;
  presetRow(destination, 'user_0001').events.onactivate();
  assert.equal(configDispatches(destination).length, 0);
  presetRowControl(
    destination,
    'user_0001',
    'HPColorsPresetRowApply',
  ).events.onactivate();
  settleActiveLifecycle(destination);

  state = readMenuState(destination);
  assert.deepEqual(state.scopes[0].conditions, {
    enemyLow: { slot: 2, minTier: 2, value: '#22AA44' },
  });
  assert.equal(readConfig(destination).values.enemyLow, '#22AA44');
});

test('Reset Section removes its rules and one Undo restores them', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
    conditions: {
      enabled: { slot: 1, minTier: 1, value: false },
    },
    scopes: [],
  }, { tiers: [1, -1, -1, -1] });
  settleActiveLifecycle(fixture);
  openEditor(fixture);

  panel(fixture, 'HPColorsResetSectionButton').events.onactivate();
  panel(fixture, 'HPColorsResetConfirmButton').events.onactivate();
  assert.deepEqual(readMenuState(fixture).conditions, {});
  assert.equal(readConfig(fixture).values.enabled, true);

  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.deepEqual(readMenuState(fixture).conditions, {
    enabled: { slot: 1, minTier: 1, value: false },
  });
  assert.equal(readConfig(fixture).values.enabled, false);
});

test('HPCRP1 rejects a partially valid condition map atomically', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
    conditions: {},
    scopes: [],
    userPresets: [],
  });
  openEditor(fixture);
  const code = 'HPCRP1' + JSON.stringify({
    records: [{
      id: 'user_0001',
      kind: 'user',
      name: 'Invalid Conditions',
      mode: 'all',
      heroes: [],
      values: [],
      conditions: {
        enemyLow: { slot: 1, minTier: 1, value: '#22AA44' },
        unknownSetting: { slot: 2, minTier: 2, value: true },
      },
    }],
    selectedPresetId: 'user_0001',
  });

  panel(fixture, 'HPColorsPresetImportButton').events.onactivate();
  panel(fixture, 'HPColorsPresetTransferInput').text = code;
  panel(fixture, 'HPColorsPresetTransferConfirmButton').events.onactivate();

  assert.deepEqual(readMenuState(fixture).userPresets, []);
  assert.match(
    panel(fixture, 'HPColorsPresetTransferFeedback').text,
    /INVALID PRESET CONDITIONS/i,
  );
});

test('ability polling sleeps without rules and reads only referenced slots', () => {
  const sleeping = bootMenu({
    version: 1,
    values: {},
    conditions: {},
    scopes: [],
  }, { tiers: [3, 3, 3, 3] });
  settleActiveLifecycle(sleeping);
  assert.equal(
    sleeping.harness.logs.some(
      (line) => line.indexOf('[HP Colors Rewrite] abilit') >= 0,
    ),
    false,
  );
  assert.deepEqual(
    sleeping.abilityTree.slots.map((slot) => slot.classReadCount),
    [0, 0, 0, 0],
  );

  const active = bootMenu({
    version: 1,
    values: {},
    conditions: {
      enemyLow: { slot: 2, minTier: 1, value: '#22AA44' },
    },
    scopes: [],
  }, { tiers: [3, 1, 3, 3] });
  settleActiveLifecycle(active);
  assert.equal(active.abilityTree.slots[0].classReadCount, 0);
  assert.ok(active.abilityTree.slots[1].classReadCount > 0);
  assert.equal(active.abilityTree.slots[2].classReadCount, 0);
  assert.equal(active.abilityTree.slots[3].classReadCount, 0);
});

test('anchor-derived stock slot parent resolves without container scans', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    conditions: {
      enemyLow: { slot: 1, minTier: 2, value: '#22AA44' },
    },
    scopes: [],
  }, {
    tiers: [2, -1, -1, -1],
    omitAbilityContainer: true,
    wrapAbilitySlots: true,
    abilityTreeUnderHud: true,
  });

  settleActiveLifecycle(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
  assert.equal(fixture.harness.findCounts.AbilitiesContainer || 0, 0);
  const signatureReads = fixture.harness.findCounts.hud_signature || 0;
  runIdentityTick(fixture);
  assert.equal(fixture.harness.findCounts.hud_signature || 0, signatureReads);
});

test('referenced slots resolve while an unrelated slot is not built', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    conditions: {
      enemyLow: { slot: 2, minTier: 2, value: '#22AA44' },
    },
    scopes: [],
  }, {
    tiers: [-1, 2, -1, -1],
    omitAbilityContainer: true,
    wrapAbilitySlots: true,
    omitAbilitySlots: [1],
  });

  settleActiveLifecycle(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
});

test('condition number slider reserves a thumb-safe gap before its detached value entry', () => {
  const hostWidth = Number(
    menuStyleSource.match(
      /\.HPColorsConditionNumberSliderHost\s*\{[^}]*width:\s*(\d+)px;/s,
    )?.[1],
  );
  const entryGap = Number(
    menuStyleSource.match(
      /\.HPColorsConditionNumberEntry\s*\{[^}]*margin-left:\s*(\d+)px;/s,
    )?.[1],
  );
  const thumbWidth = Number(
    menuStyleSource.match(
      /Slider\.HPColorsSlider\.HorizontalSlider #SliderThumb\s*\{[^}]*width:\s*(\d+)px;/s,
    )?.[1],
  );

  assert.equal(hostWidth, 364);
  assert.equal(entryGap, 18);
  assert.ok(entryGap > thumbWidth / 2);
  assert.match(
    menuStyleSource,
    /#HPColorsConditionNumberRow\s*\{[^}]*background-color:\s*transparent;[^}]*border:\s*0px;/s,
  );
  assert.match(
    layoutSource,
    /<TextEntry id="HPColorsConditionNumberEntry" class="HPColorsNumberEntry HPColorsConditionNumberEntry"/,
  );
  const fixture = bootMenu({
    version: 1,
    values: { widthScale: 100 },
    conditions: {},
    scopes: [],
  });
  assert.equal(
    panel(fixture, 'HPColorsConditionNumberSlider').style.width,
    '100%',
  );
});

test('ability card layers tier ornament frames over the persistent white base frame', () => {
  assert.match(
    menuStyleSource,
    /\.HPColorsConditionAbilityFrame\s*\{[^}]*ability_frame_passive_1_psd\.vtex[^}]*\}/s,
  );
  assert.equal(
    (layoutSource.match(/class="HPColorsConditionAbilityTierFrame"/g) || []).length,
    4,
  );
  assert.match(
    menuStyleSource,
    /\.HPColorsConditionAbilityCard\.Selected\.RequiredTier2\s+\.HPColorsConditionAbilityTierFrame\s*\{[^}]*ability_frame_passive_2_psd\.vtex[^}]*\}/s,
  );
  assert.match(
    menuStyleSource,
    /\.HPColorsConditionAbilityCard\.Selected\.RequiredTier3\s+\.HPColorsConditionAbilityTierFrame\s*\{[^}]*ability_frame_passive_3_psd\.vtex[^}]*\}/s,
  );
  assert.doesNotMatch(
    menuStyleSource,
    /RequiredTier[23]\s+\.HPColorsConditionAbilityFrame\s*\{/,
  );
  assert.doesNotMatch(menuStyleSource, /ability_frame_passive_0_psd\.vtex/);
  const source = 's2r://panorama/images/heroes/shiv/signature_1.vtex';
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    conditions: {
      enemyLow: { slot: 1, minTier: 1, value: '#22AA44' },
    },
    scopes: [],
  }, {
    tiers: [2, -1, -1, -1],
    abilityArtSources: [source, '', '', ''],
  });
  settleActiveLifecycle(fixture);
  openEditor(fixture);
  panel(fixture, 'HPColorsCondition_enemyLow').events.onactivate();

  const selected = panel(fixture, 'HPColorsConditionSlot1');
  assert.equal(selected.BHasClass('Selected'), true);
  assert.equal(selected.BHasClass('HasAbilityArt'), true);
  assert.equal(panel(fixture, 'HPColorsConditionSlot1Image').src, source);
  assert.equal(selected.BHasClass('RequiredTier1'), true);
  assert.equal(
    fixture.harness.root.FindChildTraverse('HPColorsConditionSlot1Tier') === null,
    true,
  );
  assert.equal(
    fixture.harness.root.FindChildTraverse('HPColorsConditionTier1') === null,
    true,
  );

  selected.events.onactivate();
  assert.equal(selected.BHasClass('RequiredTier2'), true);
  selected.events.onactivate();
  assert.equal(selected.BHasClass('RequiredTier3'), true);
  selected.events.onactivate();
  assert.equal(selected.BHasClass('RequiredTier1'), true);
  selected.events.onactivate();
  panel(fixture, 'HPColorsConditionApplyButton').events.onactivate();
  assert.deepEqual(readMenuState(fixture).conditions.enemyLow, {
    slot: 1,
    minTier: 2,
    value: '#22AA44',
  });
});

test('both shared low-threshold rows expose synchronized condition buttons', () => {
  const fixture = bootMenu({
    version: 1,
    values: { lowThreshold: 18, highThreshold: 43 },
    conditions: {
      lowThreshold: { slot: 4, minTier: 3, value: 28 },
    },
    scopes: [],
  }, { tiers: [-1, -1, -1, 3] });
  settleActiveLifecycle(fixture);
  openEditor(fixture);

  const primary = panel(fixture, 'HPColorsCondition_lowThreshold');
  const mirrored = panel(fixture, 'HPColorsCondition_lowThreshold_2');
  for (const indicator of [primary, mirrored]) {
    assert.equal(indicator.BHasClass('Configured'), true);
    assert.equal(indicator.BHasClass('Matched'), true);
  }

  mirrored.events.onactivate();
  assert.equal(panel(fixture, 'HPColorsConditionDialog').BHasClass('Open'), true);
  assert.equal(panel(fixture, 'HPColorsConditionTitle').text, 'LOW THRESHOLD');
});

test('matching setting value warns, disables Apply, and leaves its marker unlit', () => {
  assert.match(
    menuStyleSource,
    /\.HPColorsPrimaryAction\.Disabled\s*\{[^}]*opacity:\s*0\.35;/s,
  );
  const fixture = bootMenu({
    version: 1,
    values: { enemyMode: 'gradient' },
    conditions: {
      enemyMode: { slot: 1, minTier: 1, value: 'gradient' },
    },
    scopes: [],
  }, { tiers: [1, -1, -1, -1] });
  settleActiveLifecycle(fixture);
  openEditor(fixture);

  const marker = panel(fixture, 'HPColorsCondition_enemyMode');
  assert.equal(marker.BHasClass('Configured'), false);
  assert.equal(marker.BHasClass('Matched'), false);
  assert.equal(marker.BHasClass('Unavailable'), false);

  marker.events.onactivate();
  const apply = panel(fixture, 'HPColorsConditionApplyButton');
  assert.equal(apply.BHasClass('Disabled'), true);
  assert.match(
    panel(fixture, 'HPColorsConditionStatus').text,
    /VALUE OR SELECTION MATCHES CURRENT SETTING/,
  );

  const before = readMenuState(fixture);
  apply.events.onactivate();
  const unchanged = readMenuState(fixture);
  assert.equal(unchanged.transitionId, before.transitionId);
  assert.equal(panel(fixture, 'HPColorsConditionDialog').BHasClass('Open'), true);

  panel(fixture, 'HPColorsConditionOption_fixed').events.onactivate();
  assert.equal(apply.BHasClass('Disabled'), false);
  apply.events.onactivate();
  assert.deepEqual(readMenuState(fixture).conditions.enemyMode, {
    slot: 1,
    minTier: 1,
    value: 'fixed',
  });
  assert.equal(marker.BHasClass('Configured'), true);
  assert.equal(marker.BHasClass('Matched'), true);
});


test('replacement slots recover while spectating clears the conditional result', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    conditions: {
      enemyLow: { slot: 1, minTier: 2, value: '#22AA44' },
    },
    scopes: [],
  }, { tiers: [2, -1, -1, -1] });
  settleActiveLifecycle(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');

  fixture.harness.root.AddClass('player_selected');
  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
  fixture.harness.root.RemoveClass('player_selected');

  fixture.abilityTree.slots[0].DeleteAsync();
  const replacement = fixture.abilityTree.signature.add(new MockPanel(
    'slot_signature_1',
    {
      classes: ['Tier3'],
      findCounts: fixture.harness.findCounts,
      childReadCounts: fixture.harness.childReadCounts,
      operationCounts: fixture.harness.operationCounts,
    },
  ));
  fixture.abilityTree.slots[0] = replacement;
  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');

  fixture.harness.root.AddClass('spec_mode');
  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#111111');
  fixture.harness.root.RemoveClass('spec_mode');
  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.enemyLow, '#22AA44');
});

test('row marker opens a focused boolean rule editor and reports configured and matched states', () => {
  const fixture = bootMenu({
    version: 1,
    values: { enabled: true },
    conditions: {},
    scopes: [],
  }, { tiers: [-1, 2, -1, -1] });
  settleActiveLifecycle(fixture);
  openEditor(fixture);

  const marker = panel(fixture, 'HPColorsCondition_enabled');
  assert.equal(
    fixture.harness.root.FindChildTraverse('HPColorsCondition_precisePipsEnabled'),
    null,
  );
  marker.events.onactivate();
  assert.equal(panel(fixture, 'HPColorsConditionDialog').BHasClass('Open'), true);

  panel(fixture, 'HPColorsConditionSlot2').events.onactivate();
  panel(fixture, 'HPColorsConditionSlot2').events.onactivate();
  panel(fixture, 'HPColorsConditionSlot2').events.onactivate();
  panel(fixture, 'HPColorsConditionBooleanFalse').events.onactivate();
  panel(fixture, 'HPColorsConditionApplyButton').events.onactivate();

  assert.deepEqual(readMenuState(fixture).conditions, {
    enabled: { slot: 2, minTier: 3, value: false },
  });
  assert.equal(marker.BHasClass('Configured'), true);
  assert.equal(marker.BHasClass('Matched'), false);

  setTier(fixture.abilityTree.slots[1], 3);
  runIdentityTick(fixture);
  assert.equal(readConfig(fixture).values.enabled, false);
  assert.equal(marker.BHasClass('Matched'), true);
});

test('condition editor Cancel and Escape discard drafts before closing the main editor', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
    conditions: {},
    scopes: [],
  });
  openEditor(fixture);
  panel(fixture, 'HPColorsCondition_enemyVisible').events.onactivate();
  panel(fixture, 'HPColorsConditionSlot4').events.onactivate();
  panel(fixture, 'HPColorsConditionBooleanFalse').events.onactivate();
  panel(fixture, 'HPColorsConditionCancelButton').events.onactivate();
  assert.deepEqual(readMenuState(fixture).conditions, {});

  panel(fixture, 'HPColorsCondition_enemyVisible').events.onactivate();
  fixture.harness.$.HPColorsMenuCancel();
  assert.equal(panel(fixture, 'HPColorsConditionDialog').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsEditorRoot').BHasClass('Open'), true);
  assert.deepEqual(readMenuState(fixture).conditions, {});
});

test('condition editor commits number, enum, and color values through typed controls', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
    conditions: {},
    scopes: [],
  });
  openEditor(fixture);

  panel(fixture, 'HPColorsCondition_widthScale').events.onactivate();
  panel(fixture, 'HPColorsConditionNumberEntry').text = '123';
  panel(fixture, 'HPColorsConditionNumberEntry').events.ontextentrysubmit();
  panel(fixture, 'HPColorsConditionApplyButton').events.onactivate();

  panel(fixture, 'HPColorsCondition_enemyMode').events.onactivate();
  panel(fixture, 'HPColorsConditionOption_fixed').events.onactivate();
  panel(fixture, 'HPColorsConditionApplyButton').events.onactivate();

  panel(fixture, 'HPColorsCondition_enemyLow').events.onactivate();
  panel(fixture, 'HPColorsConditionColorSwatch').events.onactivate();
  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), true);
  const baseColor = readMenuState(fixture).values.enemyLow;
  const pickerHue = panel(fixture, 'HPColorsPickerHueSlider');
  pickerHue.value = 200;
  pickerHue.events.onvaluechanged();
  assert.equal(readMenuState(fixture).values.enemyLow, baseColor);
  assert.equal(readMenuState(fixture).conditions.enemyLow, undefined);
  fixture.harness.$.HPColorsMenuCancel();
  assert.equal(panel(fixture, 'HPColorsPickerRoot').BHasClass('Open'), false);
  assert.equal(panel(fixture, 'HPColorsConditionDialog').BHasClass('Open'), true);
  panel(fixture, 'HPColorsConditionColorEntry').text = '#12ab34';
  panel(fixture, 'HPColorsConditionColorEntry').events.ontextentrysubmit();
  panel(fixture, 'HPColorsConditionApplyButton').events.onactivate();

  assert.deepEqual(readMenuState(fixture).conditions, {
    widthScale: { slot: 1, minTier: 1, value: 123 },
    enemyMode: { slot: 1, minTier: 1, value: 'fixed' },
    enemyLow: { slot: 1, minTier: 1, value: '#12AB34' },
  });
});

test('Remove Rule is one undoable base-state change', () => {
  const fixture = bootMenu({
    version: 1,
    values: {},
    conditions: {
      enemyVisible: { slot: 1, minTier: 1, value: false },
    },
    scopes: [],
  });
  openEditor(fixture);
  panel(fixture, 'HPColorsCondition_enemyVisible').events.onactivate();
  panel(fixture, 'HPColorsConditionRemoveButton').events.onactivate();
  assert.deepEqual(readMenuState(fixture).conditions, {});

  panel(fixture, 'HPColorsUndoButton').events.onactivate();
  assert.deepEqual(readMenuState(fixture).conditions, {
    enemyVisible: { slot: 1, minTier: 1, value: false },
  });
});
