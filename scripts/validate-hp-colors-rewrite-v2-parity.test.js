'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rewriteRoot = process.env.HP_COLORS_REWRITE_SOURCE_ROOT
  ? path.resolve(process.env.HP_COLORS_REWRITE_SOURCE_ROOT)
  : path.join(root, 'hp_colors_rewrite_v2');
const sourceRoot = path.join(rewriteRoot, 'panorama');
const contractPath = path.join(sourceRoot, 'scripts', 'hp_colors_v2_contract.js');
const statePath = path.join(sourceRoot, 'scripts', 'hp_colors_v2_state.js');

const read = (file) => fs.readFileSync(file, 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function bootState(fresh = false) {
  const context = { $: {} };
  vm.runInNewContext(read(contractPath), context, { filename: contractPath });
  const contract = context.$.HPColorsV2ContractFactory.create();
  vm.runInNewContext(read(statePath), context, { filename: statePath });
  return {
    contract,
    state: context.$.HPColorsV2StateFactory.create(fresh ? null : {
      version: 1, offsetVersion: 2, values: contract.sparseDefaults,
    }),
  };
}

function send(state, type, payload = {}) {
  const result = state.send({ type, ...payload });
  assert.ok(result && result.outcome && result.view);
  return result;
}

function oneEffect(result, type) {
  const effects = result.effects.filter((effect) => effect.type === type);
  assert.equal(effects.length, 1, `expected one ${type} effect`);
  return effects[0];
}

test('sparse baseline copies with an explicit fallback and contract freezing never probes null', () => {
  const context = { $: {} };
  const source = read(contractPath).replace('function copyValues(source, defaults) {',
    'function copyValues(source, defaults) { if (arguments.length !== 2) throw new Error("explicit defaults required");');
  vm.runInNewContext('Object.isFrozen = (isFrozen => function (value) { if (value === null || typeof value !== "object") ' +
    'throw new Error("object required"); return isFrozen(value); })(Object.isFrozen);\n' + source, context);
  const contract = context.$.HPColorsV2ContractFactory.create();
  assert.equal(contract.sparseDefaults.enemyLow, '#FD4949');
  assert.equal(contract.sparseDefaults.readoutOffsetX, 0);
  assert.equal(contract.defaults.readoutOffsetX, 18);
  assert.equal(contract.settingMeta.enabled.min, null);
  assert.ok(Object.isFrozen(contract.sparseDefaults));
  assert.ok(Object.isFrozen(contract.settingMeta.enabled));
  assert.ok(Object.isFrozen(contract.enumOptions.readoutFont));
});

test('v2 contract removes retired color exclusions and ghoul opacity and shares requested enemy defaults', () => {
  const { contract } = bootState();
  assert.equal(contract.version, 2);
  assert.equal(contract.magicWord, 'HP_COLORS_V2_CONFIG');
  assert.equal(contract.configAttribute, 'hp_colors_v2_config');
  for (const key of ['excludeBuildings', 'excludeBosses', 'excludeGhouls']) {
    assert.equal(contract.keys.includes(key), false);
    assert.equal(Object.hasOwn(contract.defaults, key), false);
    assert.equal(contract.codecDefaults[key], false);
    assert.equal(contract.codecKeys.includes(key), true);
  }
  // Ghoul opacity is retired the same way: out of every editable table, but
  // its two codec slots stay reserved so later slots keep their positions.
  for (const [key, slot, codecDefault] of [
    ['ghoulOpacityEnabled', 68, false],
    ['ghoulOpacity', 69, 100],
  ]) {
    assert.equal(contract.keys.includes(key), false);
    assert.equal(Object.hasOwn(contract.defaults, key), false);
    assert.equal(contract.settingMeta[key], undefined);
    assert.equal(contract.codecDefaults[key], codecDefault);
    assert.equal(contract.codecKeys[slot], key);
  }
  assert.equal(contract.defaults.enemyMode, 'gradient');
  assert.equal(contract.defaults.enemyLow, '#FD4949');
  assert.equal(contract.defaults.enemyMid, '#FF7B00');
  assert.equal(contract.defaults.enemyHigh, '#00FF00');
  assert.equal(contract.defaults.allyEnabled, false);
  assert.equal(contract.defaults.allyLow, '#FFEFD7');
  assert.equal(contract.defaults.pipsVisible, true);
  assert.equal(contract.codecDefaults.enemyMode, 'gradient');
  assert.equal(contract.codecDefaults.enemyLow, '#E16161');
  assert.equal(contract.codecDefaults.enemyHigh, '#00FF00');
  assert.equal(contract.codecKeys.length, 72);
  assert.equal(contract.extensionKeys.length, 83);
  assert.deepEqual(plain(contract.extensionKeys).slice(41, 47), [
    'npcEnemyEnabled',
    'npcAllyEnabled',
    'npcNeutralEnabled',
    'buildingEnemyEnabled',
    'buildingAllyEnabled',
    'neutralColor',
  ]);
  assert.deepEqual(plain(contract.extensionKeys).slice(47, 49), [
    'criticalIndicatorVisible', 'playerNamesVisible',
  ]);
  for (const key of contract.extensionKeys.slice(47, 49)) {
    assert.equal(contract.defaults[key], true);
    assert.equal(contract.booleanKeys[key], true);
    assert.equal(contract.settingMeta[key].conditionEligible, true);
    assert.equal(contract.validateSettingValue(key, false), true);
    assert.equal(contract.validateSettingValue(key, 'false'), false);
    assert.equal(contract.validateSettingValue(key, 0), false);
  }
  for (const key of [
    'npcEnemyEnabled',
    'npcAllyEnabled',
    'npcNeutralEnabled',
    'buildingEnemyEnabled',
    'buildingAllyEnabled',
  ]) {
    assert.equal(contract.defaults[key], false);
    assert.equal(contract.booleanKeys[key], true);
    assert.equal(contract.settingMeta[key].conditionEligible, true);
  }
  assert.equal(contract.defaults.neutralColor, '#5BEFB5');
  assert.equal(contract.colorKeys.neutralColor, true);
  assert.equal(contract.settingMeta.neutralColor.type, 'color');
  assert.deepEqual(plain(contract.extensionKeys).slice(0, 12), [
    'staminaWidth',
    'staminaHeight',
    'staminaOffsetX',
    'staminaOffsetY',
    'enemyStaminaColorEnabled',
    'enemyStaminaColor',
    'allyPulseColorMode',
    'accessoryAnchorEnabled',
    'ultOffsetX',
    'ultOffsetY',
    'levelOffsetX',
    'levelOffsetY',
  ]);
  assert.equal(contract.defaults.staminaWidth, 110);
  assert.equal(contract.defaults.staminaHeight, 44.8);
  assert.equal(contract.defaults.staminaOffsetX, 0);
  assert.equal(contract.defaults.staminaOffsetY, 0);
  assert.equal(contract.defaults.enemyStaminaColorEnabled, false);
  assert.equal(contract.defaults.enemyStaminaColor, '#FD4949');
  assert.equal(contract.defaults.allyPulseColorMode, 'fixed');
  assert.equal(contract.defaults.accessoryAnchorEnabled, true);
  assert.equal(contract.defaults.ultOffsetX, 74);
  assert.equal(contract.defaults.ultOffsetY, -29);
  assert.equal(contract.defaults.levelOffsetX, 74);
  assert.equal(contract.defaults.levelOffsetY, -29);
});

test('v2 cold boot uses requested defaults and HPCR2 carries an extension snapshot', () => {
  const { state } = bootState(true);
  assert.equal(state.read().values.enemyMode, 'gradient');
  assert.equal(state.read().values.enemyLow, '#FD4949');

  const copied = oneEffect(send(state, 'settings_copy'), 'clipboard_write').text;
  assert.match(copied, /^HPCR2\{/);
  const payload = JSON.parse(copied.slice(5));
  assert.equal(payload.v.some(([index]) => index === 7), false);
  assert.ok(payload.v.some(([index, value]) => index === 8 && value === '#FD4949'));
  assert.equal(payload.hpv2.v, 2);
  assert.equal(state.read().values.widthScale, 148);
  assert.equal(state.read().values.heightScale, 80);
  assert.equal(state.read().values.readoutOffsetX, 18);
  assert.equal(state.read().values.ultOffsetY, -29);

  const imported = send(state, 'settings_import', {
    raw: 'HPCR2{"v":[],"c":{},"hpv2":{"v":1,"values":[],"conditions":{}}}',
  });
  assert.equal(imported.outcome.status, 'committed');
  assert.equal(imported.view.values.enemyMode, 'gradient');
  assert.equal(imported.view.values.enemyLow, '#E16161');
  assert.equal(imported.view.values.enemyHigh, '#00FF00');
});

test('v2-only settings stay preset-scoped while legacy HPCR2 preserves extensions', () => {
  const { state } = bootState();
  send(state, 'setting_edit', { key: 'staminaWidth', value: 150 });
  send(state, 'setting_edit', { key: 'staminaHeight', value: 52.5 });
  send(state, 'setting_edit', { key: 'staminaOffsetX', value: 24 });
  send(state, 'setting_edit', { key: 'staminaOffsetY', value: -18 });
  send(state, 'setting_edit', { key: 'enemyStaminaColorEnabled', value: true });
  send(state, 'setting_edit', { key: 'enemyStaminaColor', value: '#123456' });
  send(state, 'setting_edit', { key: 'allyPulseColorMode', value: 'gradient' });
  send(state, 'setting_edit', { key: 'npcEnemyEnabled', value: true });
  send(state, 'setting_edit', { key: 'npcAllyEnabled', value: true });
  send(state, 'setting_edit', { key: 'npcNeutralEnabled', value: true });
  send(state, 'setting_edit', { key: 'buildingEnemyEnabled', value: true });
  send(state, 'setting_edit', { key: 'buildingAllyEnabled', value: true });
  send(state, 'setting_edit', { key: 'neutralColor', value: '#2468AC' });
  send(state, 'condition_set', {
    key: 'staminaWidth',
    slot: 4,
    minTier: 3,
    value: 180,
  });

  const settingsCode = oneEffect(send(state, 'settings_copy'), 'clipboard_write').text;
  const settingsPayload = JSON.parse(settingsCode.slice(5));
  assert.deepEqual(Object.keys(settingsPayload).sort(), ['c', 'hpv2', 'v']);
  assert.equal(settingsPayload.v.some(([index]) => index >= 72), false);
  assert.deepEqual(settingsPayload.hpv2.values.slice(-7), [
    [41, true],
    [42, true],
    [43, true],
    [44, true],
    [45, true],
    [46, '#2468AC'],
    [61, 'arrow'],
  ]);
  assert.deepEqual(settingsPayload.hpv2.conditions, {
    staminaWidth: { slot: 4, minTier: 3, value: 180 },
  });

  const imported = send(state, 'settings_import', { raw: 'HPCR2{"v":[],"c":{}}' });
  assert.equal(imported.view.values.staminaWidth, 150);
  assert.equal(imported.view.values.staminaHeight, 52.5);
  assert.equal(imported.view.values.enemyStaminaColorEnabled, true);
  assert.equal(imported.view.values.enemyStaminaColor, '#123456');
  assert.equal(imported.view.values.allyPulseColorMode, 'gradient');
  for (const key of [
    'npcEnemyEnabled',
    'npcAllyEnabled',
    'npcNeutralEnabled',
    'buildingEnemyEnabled',
    'buildingAllyEnabled',
  ])
    assert.equal(imported.view.values[key], true);
  assert.equal(imported.view.values.neutralColor, '#2468AC');
  assert.deepEqual(plain(imported.view.conditions.staminaWidth), {
    slot: 4,
    minTier: 3,
    value: 180,
  });

  send(state, 'preset_save', { name: 'Stamina' });
  const presetCode = oneEffect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
  const presetPayload = JSON.parse(presetCode.slice(6));
  assert.deepEqual(presetPayload.records[0].hpv2, {
    v: 2,
    values: [
      [0, 150],
      [1, 52.5],
      [2, 24],
      [3, -18],
      [4, true],
      [5, '#123456'],
      [6, 'gradient'],
      [41, true],
      [42, true],
      [43, true],
      [44, true],
      [45, true],
      [46, '#2468AC'],
      [61, 'arrow'],
    ],
    conditions: {
      staminaWidth: { slot: 4, minTier: 3, value: 180 },
    },
  });

  const destination = bootState().state;
  const roundTrip = send(destination, 'preset_import', { raw: presetCode });
  assert.equal(roundTrip.outcome.status, 'committed');
  send(destination, 'preset_apply', { id: presetPayload.records[0].id });
  assert.equal(destination.read().effectiveValues.staminaWidth, 150);
  assert.equal(destination.read().effectiveValues.enemyStaminaColor, '#123456');
  assert.equal(destination.read().effectiveValues.staminaShape, 'arrow');
  assert.equal(
    destination.read().effectiveValues.allyPulseColorMode,
    'gradient',
  );
  assert.equal(destination.read().effectiveValues.npcEnemyEnabled, true);
  assert.equal(destination.read().effectiveValues.buildingAllyEnabled, true);
  assert.equal(destination.read().effectiveValues.neutralColor, '#2468AC');
});

test('Appearance appended booleans round-trip conditions without changing protocol envelopes', () => {
  const keys = ['criticalIndicatorVisible', 'playerNamesVisible'];
  const { state } = bootState();
  for (const key of keys) {
    assert.equal(state.read().values[key], true);
    send(state, 'setting_edit', { key, value: false });
    send(state, 'condition_set', { key, slot: 1, minTier: 2, value: true });
  }
  const code = oneEffect(send(state, 'settings_copy'), 'clipboard_write').text;
  const payload = JSON.parse(code.slice(5));
  assert.deepEqual(Object.keys(payload).sort(), ['c', 'hpv2', 'v']);
  assert.equal(payload.hpv2.v, 2);
  assert.deepEqual(payload.hpv2.values, [[47, false], [48, false]]);
  const destination = bootState().state;
  const imported = send(destination, 'settings_import', { raw: code });
  assert.equal(imported.outcome.status, 'committed');
  for (const key of keys) {
    assert.equal(destination.read().values[key], false);
    assert.deepEqual(plain(destination.read().conditions[key]), { slot: 1, minTier: 2, value: true });
  }
  send(destination, 'settings_import', { raw: 'HPCR2{"v":[],"c":{}}' });
  for (const key of keys) assert.equal(destination.read().values[key], false);
  send(state, 'preset_save', { name: 'Appearance' });
  const presetCode = oneEffect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
  const presetPayload = JSON.parse(presetCode.slice(6));
  send(destination, 'preset_import', { raw: presetCode });
  send(destination, 'preset_apply', { id: presetPayload.records[0].id });
  for (const key of keys) {
    assert.equal(destination.read().values[key], false);
    assert.deepEqual(plain(destination.read().conditions[key]), { slot: 1, minTier: 2, value: true });
  }
  for (const invalid of ['false', 0, 1]) {
    const rejected = send(destination, 'settings_import', {
      raw: 'HPCR2' + JSON.stringify({ v: [], c: {}, hpv2: { v: 1, values: [[47, invalid]], conditions: {} } }),
    });
    assert.equal(rejected.outcome.status, 'rejected');
    assert.equal(destination.read().values.criticalIndicatorVisible, false);
  }
  const fresh = bootState().state;
  send(fresh, 'settings_import', {
    raw: 'HPCR2{"v":[],"c":{},"hpv2":{"v":1,"values":[],"conditions":{}}}',
  });
  for (const key of keys) assert.equal(fresh.read().values[key], true);
});

test('Appearance imports reject non-boolean values/conditions atomically in both codecs', () => {
  const source = bootState().state;
  send(source, 'preset_save', { name: 'Stock appearance' });
  const template = JSON.parse(oneEffect(send(source, 'preset_copy_selected'), 'clipboard_write').text.slice(6));
  for (const [index, key] of ['criticalIndicatorVisible', 'playerNamesVisible'].entries()) {
    for (const invalid of ['false', 0, 1]) {
      for (const condition of [false, true]) {
        const extension = { v: 1, values: [], conditions: {} };
        if (condition) extension.conditions[key] = { slot: 1, minTier: 1, value: invalid };
        else extension.values = [[47 + index, invalid]];
        const preset = plain(template);
        preset.records[0].hpv2 = extension;
        for (const [type, raw] of [
          ['settings_import', 'HPCR2' + JSON.stringify({ v: [], c: {}, hpv2: extension })],
          ['preset_import', 'HPCRP1' + JSON.stringify(preset)],
        ]) {
          const destination = bootState().state;
          const before = JSON.stringify(destination.read());
          assert.equal(send(destination, type, { raw }).outcome.status, 'rejected');
          assert.equal(JSON.stringify(destination.read()), before);
        }
      }
    }
  }
  delete template.records[0].hpv2;
  const older = bootState().state;
  assert.equal(send(older, 'preset_import', { raw: 'HPCRP1' + JSON.stringify(template) }).outcome.status, 'committed');
  send(older, 'preset_apply', { id: template.records[0].id });
  for (const key of ['criticalIndicatorVisible', 'playerNamesVisible'])
    assert.equal(older.read().effectiveValues[key], true);
});

test('round native format retirement preserves slots and appends independent name settings', () => {
  const { contract, state } = bootState();
  assert.equal(contract.codecKeys[29], 'readoutFormat');
  assert.equal(contract.extensionKeys[30], 'allyReadoutFormat');
  assert.equal(contract.codecKeys[40], 'precisePipsEnabled');
  assert.equal(contract.codecKeys[70], 'readoutMaxTeamColor');
  assert.equal(contract.extensionKeys[40], 'allyReadoutMaxTeamColor');
  for (const key of ['precisePipsEnabled', 'readoutMaxTeamColor', 'allyReadoutMaxTeamColor']) {
    assert.equal(contract.keys.includes(key), false, key);
    assert.equal(Object.hasOwn(contract.defaults, key), false, key);
    assert.equal(Object.hasOwn(contract.booleanKeys, key), false, key);
    assert.equal(contract.settingMeta[key], undefined, key);
  }
  assert.equal(contract.extensionKeys.length, 83);
  assert.deepEqual(Array.from(contract.extensionKeys.slice(56)), [
    'enemyPipColorEnabled', 'enemyPipColor',
    'allyPipColorEnabled', 'allyPipColor', 'pipOpacity', 'staminaShape',
    'readoutOutlineWidth', 'allyReadoutOutlineWidth', 'nameOutlineWidth',
    'hudHealthColorMode', 'hudHealthColor',
    'allyPulseReadout',
    'nameAlign', 'hpTextAlign',
    'criticalOffsetX', 'criticalOffsetY', 'assassinateOffsetX', 'assassinateOffsetY',
    'barMask', 'nameRiseWithPips', 'damageShakeEnabled', 'damageShakeIntensity',
    'nameTilt', 'readoutTilt', 'allyReadoutTilt',
    'enemyRatkingArmor', 'allyRatkingArmor',
  ]);
  assert.equal(contract.keys.includes('readoutFormat'), false);
  assert.equal(contract.keys.includes('allyReadoutFormat'), false);
  const imported = send(state, 'settings_import', { raw: 'HPCR2' + JSON.stringify({
    v: [[29, 'percent'], [40, true], [70, true]],
    c: { readoutFormat: { slot: 1, minTier: 1, value: 'current' },
      precisePipsEnabled: { slot: 1, minTier: 1, value: true },
      readoutMaxTeamColor: { slot: 1, minTier: 1, value: true } },
    hpv2: { v: 1, values: [[30, 'current'], [40, true], [53, 40], [54, -200]],
      conditions: { allyReadoutFormat: { slot: 1, minTier: 1, value: 'percent' },
        allyReadoutMaxTeamColor: { slot: 1, minTier: 1, value: true } } },
  }) });
  assert.notEqual(imported.outcome.kind, 'error');
  assert.equal(imported.view.values.nameSize, 40);
  assert.equal(imported.view.values.nameOffsetX, -200);
  assert.equal(Object.hasOwn(imported.view.values, 'readoutFormat'), false);
  for (const key of ['precisePipsEnabled', 'readoutMaxTeamColor', 'allyReadoutMaxTeamColor']) {
    assert.equal(Object.hasOwn(imported.view.values, key), false, key);
    assert.equal(Object.hasOwn(imported.view.conditions, key), false, key);
  }
});

test('name alignment slot validates and round-trips values and conditions in both codecs', () => {
  const { contract, state } = bootState();
  const values = { nameAlign: 'left', hpTextAlign: 'center' };
  assert.deepEqual(plain(contract.extensionKeys.slice(68, 70)), Object.keys(values));
  for (const [key, value] of Object.entries(values)) {
    assert.equal(contract.defaults[key], key === 'hpTextAlign' ? 'left' : 'center');
    assert.equal(contract.sparseDefaults[key], key === 'hpTextAlign' ? 'left' : 'center');
    assert.deepEqual(plain(contract.enumOptions[key]), ['left', 'center', 'right']);
    assert.equal(contract.validateSettingValue(key, 'invalid'), false);
    send(state, 'setting_edit', { key, value });
    send(state, 'condition_set', { key, slot: 1, minTier: 2, value: 'center' });
  }
  const code = oneEffect(send(state, 'settings_copy'), 'clipboard_write').text;
  const payload = JSON.parse(code.slice(5));
  assert.equal(payload.hpv2.v, 2);
  assert.deepEqual(payload.hpv2.values.slice(-2), [[68, 'left'], [69, 'center']]);
  const destination = bootState().state;
  assert.equal(send(destination, 'settings_import', { raw: code }).outcome.status, 'committed');
  for (const [key, value] of Object.entries(values)) {
    assert.equal(destination.read().values[key], value);
    assert.deepEqual(plain(destination.read().conditions[key]), { slot: 1, minTier: 2, value: 'center' });
  }
  values.nameAlign = 'right';
  values.hpTextAlign = 'center';
  send(state, 'setting_edit', { key: 'nameAlign', value: 'right' });
  send(state, 'preset_save', { name: 'Aligned name' });
  const presetCode = oneEffect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
  const presetPayload = JSON.parse(presetCode.slice(6));
  assert.equal(send(destination, 'preset_import', { raw: presetCode }).outcome.status, 'committed');
  send(destination, 'preset_apply', { id: presetPayload.records[0].id });
  for (const [key, value] of Object.entries(values)) {
    assert.equal(destination.read().currentScope.values[key], value);
    assert.deepEqual(plain(destination.read().currentScope.conditions[key]), { slot: 1, minTier: 2, value: 'center' });
  }
});

test('round name settings and raw geometry survive both codecs; retired rules drop atomically', () => {
  const { state } = bootState();
  const values = {
    enemyNameColorEnabled: true, enemyNameColor: '#123456',
    allyNameColorEnabled: true, allyNameColor: '#ABCDEF',
    nameSize: 40, nameOffsetX: -170, nameOffsetY: 160,
    widthScale: 60, heightScale: 60, positionX: -1200, positionY: 1100,
    ultOffsetX: -2300, ultOffsetY: 2200, levelOffsetX: 2100, levelOffsetY: -2000,
    staminaOffsetX: -900, staminaOffsetY: 800,
    readoutOffsetX: -100, readoutOffsetY: 90,
    allyReadoutOffsetX: 80, allyReadoutOffsetY: -70,
    enemyPulseReadoutOffsetX: -60, enemyPulseReadoutOffsetY: 50,
  };
  for (const [key, value] of Object.entries(values)) send(state, 'setting_edit', { key, value });
  send(state, 'condition_set', { key: 'nameSize', slot: 4, minTier: 3, value: 30 });
  const settings = oneEffect(send(state, 'settings_copy'), 'clipboard_write').text;
  const copy = bootState().state;
  assert.equal(send(copy, 'settings_import', { raw: settings }).outcome.status, 'committed');
  for (const [key, value] of Object.entries(values)) assert.equal(copy.read().values[key], value, key);
  send(state, 'preset_save', { name: 'Names and geometry' });
  const preset = oneEffect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
  const bundle = JSON.parse(preset.slice(6));
  bundle.records[0].values.push([29, 'percent']);
  bundle.records[0].conditions = { readoutFormat: { slot: 1, minTier: 1, value: 'current' } };
  bundle.records[0].hpv2.values.push([30, 'current']);
  bundle.records[0].hpv2.conditions.allyReadoutFormat = { slot: 1, minTier: 1, value: 'percent' };
  const destination = bootState().state;
  assert.equal(send(destination, 'preset_import', { raw: 'HPCRP1' + JSON.stringify(bundle) }).outcome.status, 'committed');
  send(destination, 'preset_apply', { id: bundle.records[0].id });
  for (const [key, value] of Object.entries(values)) assert.equal(destination.read().effectiveValues[key], value, key);
  assert.equal(Object.hasOwn(destination.read().conditions, 'allyReadoutFormat'), false);
  const before = plain(destination.read());
  bundle.records[0].hpv2.conditions.unknownSetting = { slot: 1, minTier: 1, value: true };
  assert.equal(send(destination, 'preset_import', { raw: 'HPCRP1' + JSON.stringify(bundle) }).outcome.status, 'rejected');
  assert.deepEqual(plain(destination.read().values), before.values);
});

test('follow-up controls append typed extension slots with frozen sparse defaults', () => {
  const { contract } = bootState();
  const defaults = {
    enemyPipColorEnabled: false, enemyPipColor: '#500202',
    allyPipColorEnabled: false, allyPipColor: '#042517',
    pipOpacity: 100, staminaShape: 'arrow',
    readoutOutlineWidth: 5, allyReadoutOutlineWidth: 5, nameOutlineWidth: 5,
    hudHealthColorMode: 'off', hudHealthColor: '#FFFF00',
    allyPulseReadout: false,
    nameAlign: 'center', hpTextAlign: 'left',
    criticalOffsetX: 0, criticalOffsetY: 0, assassinateOffsetX: 0, assassinateOffsetY: 0,
    barMask: 'none', nameRiseWithPips: false,
    damageShakeEnabled: true, damageShakeIntensity: 3,
    nameTilt: 0, readoutTilt: 0, allyReadoutTilt: 0,
    enemyRatkingArmor: '#C7A674', allyRatkingArmor: '#C7A674',
  };
  assert.deepEqual(plain(contract.extensionKeys).slice(56), Object.keys(defaults));
  for (const [key, value] of Object.entries(defaults)) {
    assert.equal(contract.sparseDefaults[key], value, key);
    assert.equal(contract.codecDefaults[key], value, key);
    assert.equal(contract.settingMeta[key].conditionEligible, true, key);
  }
  assert.equal(contract.defaults.enemyPipColorEnabled, true);
  assert.equal(contract.defaults.enemyPipColor, '#000000');
  assert.equal(contract.defaults.staminaShape, 'arrow');
  assert.deepEqual(plain(contract.enumOptions.staminaShape), ['arrow', 'circle', 'box']);
  assert.equal(contract.validateSettingValue('staminaShape', 'triangle'), false);
  assert.equal(contract.normalizeValues({ pipOpacity: -1 }).pipOpacity, 0);
  assert.equal(contract.normalizeValues({ pipOpacity: 101 }).pipOpacity, 100);
  assert.equal(contract.normalizeValues({}).pipOpacity, 100, 'old sparse saves retain stock line opacity');
  // Failure modes: shake defaults drift from stock, bounds accept 0/11 or fractions, booleans accept strings.
  assert.equal(contract.defaults.damageShakeEnabled, true);
  assert.equal(contract.defaults.damageShakeIntensity, 3);
  assert.equal(contract.booleanKeys.damageShakeEnabled, true);
  assert.equal(contract.settingMeta.damageShakeIntensity.min, 1);
  assert.equal(contract.settingMeta.damageShakeIntensity.max, 10);
  assert.equal(contract.normalizeValues({ damageShakeIntensity: 0 }).damageShakeIntensity, 1);
  assert.equal(contract.normalizeValues({ damageShakeIntensity: 11 }).damageShakeIntensity, 10);
  assert.equal(contract.normalizeValues({ damageShakeIntensity: 6.6 }).damageShakeIntensity, 7);
  assert.equal(contract.validateSettingValue('damageShakeEnabled', 'yes'), false);
  assert.equal(contract.validateSettingValue('damageShakeIntensity', 'x'), false);
  // Failure modes: tilt defaults tilt old saves, bounds stop short of or exceed a full turn, fractions survive.
  for (const key of ['nameTilt', 'readoutTilt', 'allyReadoutTilt']) {
    assert.equal(contract.defaults[key], 0, key);
    assert.equal(contract.settingMeta[key].min, -360, key);
    assert.equal(contract.settingMeta[key].max, 360, key);
    assert.equal(contract.normalizeValues({ [key]: -400 })[key], -360, key);
    assert.equal(contract.normalizeValues({ [key]: 400 })[key], 360, key);
    assert.equal(contract.normalizeValues({ [key]: 14.6 })[key], 15, key);
  }
  for (const prefix of ['enemy', 'ally']) {
    assert.equal(contract.booleanKeys[prefix + 'PipColorEnabled'], true);
    assert.equal(contract.colorKeys[prefix + 'PipColor'], true);
    assert.equal(contract.normalizeValues({ [prefix + 'PipColor']: 'aabbcc' })[prefix + 'PipColor'], '#AABBCC');
  }
});
