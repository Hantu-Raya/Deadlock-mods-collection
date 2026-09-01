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
const menuPath = path.join(sourceRoot, 'scripts', 'hp_colors_v2_menu.js');
const layoutPath = path.join(sourceRoot, 'layout', 'hud_escape_menu.xml');
const overlayPath = path.join(sourceRoot, 'layout', 'unit_status_overlay_v2.xml');
const rendererPath = path.join(sourceRoot, 'scripts', 'unit_status_v2_colors.js');
const buildPath = path.join(root, 'build_hp_colors_rewrite_v2.ps1');

const read = (file) => fs.readFileSync(file, 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function bootState() {
  const context = { $: {} };
  vm.runInNewContext(read(contractPath), context, { filename: contractPath });
  const contract = context.$.HPColorsV2ContractFactory.create();
  vm.runInNewContext(read(statePath), context, { filename: statePath });
  return {
    contract,
    state: context.$.HPColorsV2StateFactory.create(),
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

test('v2 contract removes retired color exclusions and shares requested enemy defaults', () => {
  const { contract } = bootState();
  assert.equal(contract.version, 2);
  assert.equal(contract.magicWord, 'HP_COLORS_V2_CONFIG');
  assert.equal(contract.configAttribute, 'hp_colors_v2_config');
  assert.equal(contract.keys.length, 76);
  assert.equal(new Set(plain(contract.keys)).size, 76);
  for (const key of ['excludeBuildings', 'excludeBosses', 'excludeGhouls']) {
    assert.equal(contract.keys.includes(key), false);
    assert.equal(Object.hasOwn(contract.defaults, key), false);
    assert.equal(contract.codecDefaults[key], false);
    assert.equal(contract.codecKeys.includes(key), true);
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
  assert.deepEqual(plain(contract.extensionKeys), [
    'staminaWidth',
    'staminaHeight',
    'staminaOffsetX',
    'staminaOffsetY',
    'enemyStaminaColorEnabled',
    'enemyStaminaColor',
    'allyPulseColorMode',
  ]);
  assert.equal(contract.defaults.staminaWidth, 110);
  assert.equal(contract.defaults.staminaHeight, 44.8);
  assert.equal(contract.defaults.staminaOffsetX, 0);
  assert.equal(contract.defaults.staminaOffsetY, 0);
  assert.equal(contract.defaults.enemyStaminaColorEnabled, false);
  assert.equal(contract.defaults.enemyStaminaColor, '#FD4949');
  assert.equal(contract.defaults.allyPulseColorMode, 'fixed');
});

test('v2 cold boot uses the requested gradient while HPCR2 keeps its v1 baseline', () => {
  const { state } = bootState();
  assert.equal(state.read().values.enemyMode, 'gradient');
  assert.equal(state.read().values.enemyLow, '#FD4949');

  const copied = oneEffect(send(state, 'settings_copy'), 'clipboard_write').text;
  assert.match(copied, /^HPCR2\{/);
  const payload = JSON.parse(copied.slice(5));
  assert.equal(payload.v.some(([index]) => index === 7), false);
  assert.ok(payload.v.some(([index, value]) => index === 8 && value === '#FD4949'));

  const imported = send(state, 'settings_import', {
    raw: 'HPCR2{"v":[],"c":{}}',
  });
  assert.equal(imported.outcome.status, 'committed');
  assert.equal(imported.view.values.enemyMode, 'gradient');
  assert.equal(imported.view.values.enemyLow, '#E16161');
  assert.equal(imported.view.values.enemyHigh, '#00FF00');
});

test('v2-only settings stay preset-scoped while HPCR2 remains legacy', () => {
  const { state } = bootState();
  send(state, 'setting_edit', { key: 'staminaWidth', value: 150 });
  send(state, 'setting_edit', { key: 'staminaHeight', value: 52.5 });
  send(state, 'setting_edit', { key: 'staminaOffsetX', value: 24 });
  send(state, 'setting_edit', { key: 'staminaOffsetY', value: -18 });
  send(state, 'setting_edit', { key: 'enemyStaminaColorEnabled', value: true });
  send(state, 'setting_edit', { key: 'enemyStaminaColor', value: '#123456' });
  send(state, 'setting_edit', { key: 'allyPulseColorMode', value: 'gradient' });
  send(state, 'condition_set', {
    key: 'staminaWidth',
    slot: 4,
    minTier: 3,
    value: 180,
  });

  const settingsCode = oneEffect(send(state, 'settings_copy'), 'clipboard_write').text;
  const settingsPayload = JSON.parse(settingsCode.slice(5));
  assert.deepEqual(Object.keys(settingsPayload).sort(), ['c', 'v']);
  assert.equal(settingsPayload.v.some(([index]) => index >= 72), false);
  assert.equal(Object.hasOwn(settingsPayload.c, 'staminaWidth'), false);

  const imported = send(state, 'settings_import', { raw: 'HPCR2{"v":[],"c":{}}' });
  assert.equal(imported.view.values.staminaWidth, 150);
  assert.equal(imported.view.values.staminaHeight, 52.5);
  assert.equal(imported.view.values.enemyStaminaColorEnabled, true);
  assert.equal(imported.view.values.enemyStaminaColor, '#123456');
  assert.equal(imported.view.values.allyPulseColorMode, 'gradient');
  assert.deepEqual(plain(imported.view.conditions.staminaWidth), {
    slot: 4,
    minTier: 3,
    value: 180,
  });

  send(state, 'preset_save', { name: 'Stamina' });
  const presetCode = oneEffect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
  const presetPayload = JSON.parse(presetCode.slice(6));
  assert.deepEqual(presetPayload.records[0].hpv2, {
    v: 1,
    values: [
      [0, 150],
      [1, 52.5],
      [2, 24],
      [3, -18],
      [4, true],
      [5, '#123456'],
      [6, 'gradient'],
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
  assert.equal(
    destination.read().effectiveValues.allyPulseColorMode,
    'gradient',
  );
});

test('complete v1 editor replaces the compact menu without ShowRank', () => {
  const layout = read(layoutPath);
  const menu = read(menuPath);
  for (const id of [
    'HPColorsMenuButton',
    'HPColorsEditorRoot',
    'HPColorsPresetOptions',
    'HPColorsConditionDialog',
    'HPColorsTransferDialog',
    'HPColorsSupporterTicker',
    'HPColorsDonateButton',
    'HPColorsStaminaWidthSliderHost',
    'HPColorsStaminaHeightSliderHost',
    'HPColorsEnemyStaminaColorToggle',
    'HPColorsEnemyStaminaColorHex',
  ]) assert.match(layout, new RegExp(`id="${id}"`));
  assert.match(layout, /hp_colors_v2_state\.vjs_c/);
  assert.match(menu, /HP_COLORS_V2_CONFIG/);
  assert.match(menu, /HPColorsV2StateFactory/);
  assert.doesNotMatch(layout + menu, /ShowRank|Barebones/i);
  assert.doesNotMatch(
    layout + menu,
    /excludeBuildings|excludeBosses|excludeGhouls|HPColorsExclude(?:Buildings|Bosses|Ghouls)Toggle/,
  );
});

test('v2 overlay and renderer expose all advanced runtime owners', () => {
  const overlay = read(overlayPath);
  const renderer = read(rendererPath);
  for (const id of [
    'hp_colors_pulse_overlay',
    'hp_colors_kill_marker',
    'LevelContainer',
    'unit_level_label',
    'hp_counter_anchor',
  ]) assert.match(overlay, new RegExp(`id="${id}"`));
  for (const token of [
    'enemyPulseEnabled',
    'allyPulseEnabled',
    'enemyKillMarkerEnabled',
    'precisePipsEnabled',
    'readoutMaxTeamColor',
    'ghoulOpacityEnabled',
    'enemyBulletShield',
    'staminaWidth',
    'staminaHeight',
    'staminaOffsetX',
    'staminaOffsetY',
    'enemyStaminaColorEnabled',
    'enemyStaminaColor',
    'allyBulletShield',
  ]) assert.match(renderer, new RegExp(token));
  assert.match(renderer, /HP_COLORS_V2_CONFIG/);
  assert.doesNotMatch(renderer, new RegExp('\\[HPV2-' + 'HBDBG\\]'));
  assert.doesNotMatch(renderer, /HP_COLORS_REWRITE_CONFIG/);
  assert.doesNotMatch(renderer, /excludeBuildings|excludeBosses|excludeGhouls/);
});

test('build declares the exact nine-asset source contract', () => {
  const build = read(buildPath);
  assert.match(build, /hp_colors_v2_state\.js/);
  assert.match(build, /hp_colors_v2_state\.vjs_c/);
  const manifestBlock = build.match(
    /\$assetManifest\s*=\s*@\(([\s\S]*?)\n\)\s*\n\$rewriteScripts/,
  );
  assert.ok(manifestBlock);
  const sources = Array.from(
    manifestBlock[1].matchAll(/Source\s*=\s*'([^']+)'/g),
    (match) => match[1],
  );
  const packed = Array.from(
    manifestBlock[1].matchAll(/Packed\s*=\s*'([^']+)'/g),
    (match) => match[1],
  );
  assert.equal(sources.length, 9);
  assert.equal(new Set(sources).size, 9);
  assert.equal(packed.length, 9);
  assert.equal(new Set(packed).size, 9);
  assert.doesNotMatch(build, /showrank_barebones/i);
});
