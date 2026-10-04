'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
} = require('./hp-colors-panorama-test-adapter');

const sourceRoot = path.resolve(__dirname, '../hp_colors_rewrite_v2/panorama/scripts');
const contractSource = fs.readFileSync(path.join(sourceRoot, 'hp_colors_v2_contract.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(sourceRoot, 'unit_status_v2_colors.js'), 'utf8');
const styleSeam = 'var STOCK_TEAM1_COLOR = "#E7B659";';
const contractContext = vm.createContext({ $: {} });
vm.runInContext(contractSource, contractContext);
const contract = contractContext.$.HPColorsV2ContractFactory.create();
const stockValues = contract.sparseDefaults;

function loadStyleHelpers() {
  const $ = {};
  const context = vm.createContext({ $ });
  vm.runInContext(contractSource, context);
  vm.runInContext(
    rendererSource.replace(
      styleSeam,
      '$.__setStyle = setStyle; $.__drift = cachedStyleDrift; return;\n' + styleSeam,
    ),
    context,
  );
  return { setStyle: $.__setStyle, cachedStyleDrift: $.__drift };
}

test('alias restoration clears the base and preserves sibling inline styles', () => {
  const { setStyle } = loadStyleHelpers();
  const groups = {
    margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
    font: ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontStretch'],
    animation: ['animationName', 'animationDuration', 'animationDelay'],
    border: ['borderColor', 'borderTopWidth', 'borderTopStyle', 'borderLeftWidth', 'borderLeftStyle'],
  };
  const values = {
    marginLeft: '12px', marginTop: '4px', marginRight: '8px',
    fontFamily: 'Arial', fontSize: '20px', fontWeight: 'bold',
    animationDuration: '1s', animationName: 'pulse', animationDelay: '0.2s',
    borderColor: 'red', borderTopWidth: '2px', borderTopStyle: 'solid', borderLeftWidth: '3px', borderLeftStyle: 'dashed',
  };
  const panel = { id: 'AliasFixture', style: new Proxy(values, {
    set(target, property, value) {
      if (value === null && !groups[property]) throw new Error('Cannot unset alias alone');
      if (value === null) for (const alias of groups[property]) target[alias] = '';
      target[property] = value === null ? '' : value;
      return true;
    },
  }) };
  const cache = {};
  for (const property of ['marginLeft', 'fontSize', 'animationDuration', 'borderColor'])
    setStyle(panel, property, '', cache, property);

  assert.equal(values.marginLeft, '');
  assert.equal(values.marginTop, '4px');
  assert.equal(values.marginRight, '8px');
  assert.equal(values.fontSize, '');
  assert.equal(values.fontFamily, 'Arial');
  assert.equal(values.fontWeight, 'bold');
  assert.equal(values.animationDuration, '');
  assert.equal(values.animationName, 'pulse');
  assert.equal(values.animationDelay, '0.2s');
  assert.equal(values.borderColor, '');
  assert.equal(values.borderTopWidth, '2px');
  assert.equal(values.borderLeftStyle, 'dashed');

  setStyle(panel, 'marginLeft', '', cache, 'marginLeft');
  assert.equal(values.marginTop, '4px');
  assert.equal(values.marginRight, '8px');
});

test('native readback avoids normalized rewrites while repairing engine and panel changes', () => {
  const { setStyle, cachedStyleDrift } = loadStyleHelpers();
  const cache = {};
  let color = '';
  let left = '';
  let top = '';
  let writes = 0;
  let reads = 0;
  const panel = { style: new Proxy({}, {
    get(target, key) {
      reads++;
      if (key === 'washColor') return color;
      if (key === 'margin') return left + ' ' + top;
      return '';
    },
    set(target, key, value) {
      writes++;
      if (key === 'washColor') color = value + 'FF';
      if (key === 'marginLeft') left = value;
      if (key === 'marginTop') top = value;
      return true;
    },
  }) };

  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  setStyle(panel, 'marginLeft', '30px', cache, 'left');
  setStyle(panel, 'marginTop', '10px', cache, 'top');
  const initialReads = reads;
  for (let i = 0; i < 10; i++) {
    setStyle(panel, 'washColor', '#FD4949', cache, 'color');
    setStyle(panel, 'marginLeft', '30px', cache, 'left');
    setStyle(panel, 'marginTop', '10px', cache, 'top');
  }
  assert.equal(writes, 3, 'unchanged native values must not trigger more assignments');
  assert.equal(reads, initialReads, 'unchanged cached writes do not read native styles');

  color = '#000000FF';
  assert.equal(cachedStyleDrift(panel, 'washColor', cache, 'color'), true);
  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  assert.equal(color, '#FD4949FF');

  left = '0px';
  top = '0px';
  assert.equal(cachedStyleDrift(panel, 'marginLeft', cache, 'left'), true);
  setStyle(panel, 'marginLeft', '30px', cache, 'left');
  assert.equal(cachedStyleDrift(panel, 'marginTop', cache, 'top'), true);
  setStyle(panel, 'marginTop', '10px', cache, 'top');
  assert.equal(left + ' ' + top, '30px 10px');
  assert.equal(cachedStyleDrift(panel, 'marginLeft', cache, 'left'), false);

  const replacement = { style: {} };
  setStyle(replacement, 'washColor', '#FD4949', cache, 'color');
  assert.equal(replacement.style.washColor, '#FD4949');
});

test('a rejected native write remains retryable', () => {
  const { setStyle } = loadStyleHelpers();
  const cache = {};
  let reject = true;
  let color = 'stock';
  const panel = { style: {
    get washColor() { return color; },
    set washColor(value) {
      if (reject) throw new Error('panel style temporarily unavailable');
      color = value;
    },
  } };
  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  assert.equal(color, 'stock');
  reject = false;
  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  assert.equal(color, '#FD4949');
});

function makeOwnershipFixture(classes, values = {}, beforeBoot = null, sharedHarness = null, source = rendererSource, random = () => 0) {
  const harness = sharedHarness || createPanoramaHarness();
  const add = (parent, id, options = {}) => parent.add(new MockPanel(id, options));
  const world = add(harness.root, 'WorldUIRoot', { classes });
  const window = add(world, 'client_ui_panel', { classes: ['WindowRoot'] });
  const stamina = add(window, 'StaminaContainer');
  const pip = add(stamina, 'StaminaPip', { classes: ['StaminaPip'] });
  const icon = add(pip, 'StaminaPipIcon', {
    classes: ['StaminaPipIcon'],
    style: { width: '11px', height: '4.48px', backgroundColor: '#ABCDEF', borderColor: '#123456' },
  });
  const status = add(window, 'UnitStatus');
  const info = add(status, 'InfoHealthContainer', { actuallayoutwidth: 200, actuallayoutheight: 210 });
  const level = add(info, 'LevelContainer', {
    actuallayoutwidth: 21, actuallayoutheight: 21, actualxoffset: 27, actualyoffset: 67.5,
    style: { marginLeft: '', marginTop: '', visibility: 'collapse', verticalAlign: 'top' },
  });
  const levelLabel = add(level, 'unit_level_label', { text: '10', style: {} });
  const unitInfo = add(info, 'unit_info_panel', {
    classes: ['unit_info_panel'],
    actuallayoutwidth: 22, actuallayoutheight: 22, actualxoffset: 50, actualyoffset: 67,
    style: { marginLeft: '', marginTop: '', verticalAlign: 'top' },
  });
  const ultBackground = add(unitInfo, 'unit_info_bg');
  const ultIcon = add(ultBackground, 'unit_ult_ready_icon');
  const ultOverlay = add(ultBackground, 'HPV2UltimateOverlay');
  const stack = add(info, 'UnitHealthbarsContainer', { actuallayoutwidth: 200, actuallayoutheight: 210 });
  const primary = add(stack, 'UnitHealthbar', { classes: ['UnitHealthbarContainer'], actuallayoutwidth: 76, actuallayoutheight: 18, actualxoffset: 70.5, actualyoffset: 65 });
  const inner = add(primary, 'UnitHealthbarInner', { actuallayoutwidth: 69 });
  const fill = add(inner, 'unit_healthbar_lagging', { actuallayoutwidth: 34.5 });
  const marker = add(primary, 'hp_colors_kill_marker', { style: { visibility: 'collapse' } });
  add(primary, 'UnitHealthbarLines');
  const health = add(info, 'UnitHealthbarValue', { text: '345', style: { visibility: 'visible' } });
  const shield = add(info, 'UnitShieldbarValue', { text: '999', style: { visibility: 'visible' } });
  const shieldWrites = [];
  shield.style = new Proxy(shield.style, {
    set(target, property, value) {
      if (property !== 'marginRight' && property !== 'marginTop') shieldWrites.push([property, value]);
      target[property] = value;
      return true;
    },
  });
  const shieldText = Object.getOwnPropertyDescriptor(shield, 'text');
  Object.defineProperty(shield, 'text', {
    ...shieldText,
    set(value) {
      shieldWrites.push(['text', value]);
      shieldText.set(value);
    },
  });
  const container = add(window, 'hp_counter_container', { actuallayoutwidth: 200, actuallayoutheight: 210 });
  const anchor = add(container, 'hp_counter_anchor');
  const row = add(anchor, 'hp_counter_row', { actuallayoutwidth: 48, actuallayoutheight: 24 });
  const counter = add(row, 'hp_counter', { style: { visibility: 'collapse' } });
  const counterMax = add(row, 'hp_counter_max', { style: { visibility: 'collapse' } });
  let revision = 0;
  const setConfig = (nextValues) => harness.root.SetAttributeString('hp_colors_v2_config', JSON.stringify({
    magic_word: 'HP_COLORS_V2_CONFIG', version: 2, revision: ++revision, values: { ...stockValues, ...nextValues },
  }));
  setConfig(values);
  harness.contextPanel = status;
  if (beforeBoot) beforeBoot({ harness, world, window, status, stack, primary, inner,
    level, levelLabel, unitInfo, ultBackground, ultIcon, ultOverlay, fill, marker,
    stamina, icon, health, shield, info, container, anchor, row, counter, counterMax });
  const context = createVmContext(harness, { includeGameUI: false,
    globals: { Math: Object.assign(Object.create(Math), { random }) } });
  runInVm(contractSource, context);
  runInVm(source, context);
  return {
    harness, context, world, window, status, stack, primary, inner, stamina, icon, health, shield, shieldWrites, level, levelLabel,
    unitInfo, ultBackground, ultIcon, ultOverlay, fill, marker,
    info, container, anchor, row, counter, counterMax,
    update(nextValues) {
      setConfig(nextValues);
      harness.scheduler.runByDelay(1);
    },
  };
}

test("world scans start immediately, stagger only the first reschedule and wake within one second", () => {
  for (const phase of [0, 0.25, 1 - Number.EPSILON]) {
    let randomCalls = 0;
    const fixture = makeOwnershipFixture(["player", "enemy"], {}, null, null, rendererSource,
      () => { randomCalls++; return phase; });
    const scheduler = fixture.harness.scheduler;
    assert.equal(fixture.window.BHasClass("HPColorsRewriteEnemyPlayer"), true, "boot discovery is immediate");
    assert.equal(scheduler.nextDelayByFunctionName("scan"), 1 - phase);
    scheduler.runByDelay(1 - phase);
    for (let index = 0; index < 3; index++) {
      assert.equal(scheduler.nextDelayByFunctionName("scan"), 1);
      scheduler.runByDelay(1);
    }
    fixture.world.RemoveClass("enemy");
    fixture.world.AddClass("friend");
    scheduler.runFor(1000);
    assert.equal(fixture.window.BHasClass("HPColorsRewriteEnemyPlayer"), false);
    assert.equal(randomCalls, 1, "later scans keep the phase without new jitter");
  }
});

for (const [classes, gate, prefix] of [
  [['CLASS_TROOPER', 'enemy'], 'npcEnemyEnabled', 'readout'],
  [['CLASS_TROOPER', 'friend'], 'npcAllyEnabled', 'allyReadout'],
  [['neutral_weak'], 'npcNeutralEnabled', 'readout'],
  [['building', 'enemy'], 'buildingEnemyEnabled', 'readout'],
  [['building', 'friend'], 'buildingAllyEnabled', 'allyReadout'],
]) test('gated unit shares geometry and native HP text: ' + gate, () => {
  const values = { enabled: true, [gate]: true, widthScale: 230, heightScale: 160,
    positionX: 300, positionY: 200, [prefix + 'Visible']: true,
    [prefix + 'Size']: 200, [prefix + 'Font']: 'pulp',
    [prefix + 'ColorMode']: 'custom', [prefix + 'Mode']: 'fixed',
    [prefix + 'Low']: '#112233', [prefix + 'Mid']: '#112233', [prefix + 'High']: '#112233',
    [prefix + 'OutlineWidth']: 2, pipOpacity: 40,
    enemyPipColorEnabled: true, enemyPipColor: '#445566',
    allyPipColorEnabled: true, allyPipColor: '#445566' };
  const fixture = makeOwnershipFixture(classes, { ...values, [gate]: false }, parts => {
    prepareNativeReadout(parts);
    const lines = parts.primary.FindChildTraverse('UnitHealthbarLines');
    lines.add(new MockPanel('large', { classes: ['line_large'], style: { washColor: '#778899' } }));
    lines.add(new MockPanel('small', { classes: ['line_small'], style: { washColor: '#778899' } }));
  });
  assert.equal(fixture.health.GetParent(), fixture.info);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), false);
  const lines = fixture.primary.FindChildTraverse('UnitHealthbarLines');
  assert.equal(lines.style.opacity || '', '');
  fixture.update(values);
  assert.equal(fixture.stack.style.preTransformScale2d, '2.3, 1.6');
  const stackTranslation = /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0px\)$/.exec(fixture.stack.style.transform);
  assert.ok(stackTranslation);
  assert.ok(Math.abs(Number(stackTranslation[1]) - 18.95) < 1e-9);
  assert.ok(Math.abs(Number(stackTranslation[2]) - 38.6) < 1e-9);
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.style.washColor, '#112233');
  assert.equal(fixture.health.style.fontSize, '20px');
  assert.equal(fixture.health.style.fontFamily, 'VALVEPulp, Noto Sans, sans-serif');
  assert.equal(fixture.health.style.textShadow, '0px 0px 0px 2 #10130D');
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), true);
  assert.equal(lines.style.opacity, '0.4');
  for (const line of lines.Children())
    assert.equal(line.style.washColor, gate === 'npcNeutralEnabled' ? '#778899' : '#445566');
  assert.equal(fixture.stack.style.transformOrigin, '50% 50%');
  fixture.update({ ...values, [prefix + 'OffsetX']: -10, [prefix + 'OffsetY']: 10 });
  assert.deepEqual(readoutTranslation(fixture.row), [-51, 102]);
  for (const panel of [fixture.health, fixture.counter, fixture.counterMax]) {
    assert.deepEqual(panel.readoutTextWrites, []);
    assert.equal(panel.readoutTextReads, 0);
  }
  fixture.update({ ...values, [prefix + 'Visible']: false });
  assertNativeStock(fixture.health);
  assert.equal(fixture.health.GetParent(), fixture.info);
  for (const off of [{ ...values, [gate]: false }, { ...values, enabled: false }]) {
    fixture.update(values);
    fixture.update(off);
    assertNativeStock(fixture.health);
    assert.equal(fixture.health.GetParent(), fixture.info);
    assert.equal(fixture.stack.style.preTransformScale2d, '');
    assert.equal(lines.style.opacity, '');
    for (const line of lines.Children()) assert.equal(line.style.washColor, '#778899');
    assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), false);
  }
  assert.deepEqual(fixture.shieldWrites, []);
});

test('level-up tier changes retain a two-pixel ring and native number at the moved badge', () => {
  const values = { enabled: true, levelOffsetX: 74, accessoryAnchorEnabled: false, widthScale: 148, heightScale: 80 };
  const fixture = makeOwnershipFixture(['player', 'enemy'], values);
  const css = fs.readFileSync(path.join(__dirname, '..', 'hp_colors_rewrite_v2', 'panorama', 'styles', 'unit_status_v2.css'), 'utf8');
  const badgeRule = css.match(/\.WindowRoot #LevelContainer\.NP_playerlevel_container\s*\{([^}]*)\}/)[1];
  assert.match(badgeRule, /width:\s*21px/);
  assert.match(badgeRule, /height:\s*21px/);
  assert.match(badgeRule, /border:\s*2px solid Team1Color/);
  assert.match(badgeRule, /background-color:\s*#0a0a0ae6/);
  for (const [level, color] of [[12, '#f0d000'], [19, '#ff8c00'], [27, '#e53935'], [12, '#f0d000']]) {
    fixture.levelLabel.text = String(level);
    fixture.harness.scheduler.runByDelay(1);
    assert.equal(fixture.level.style.border, '2px solid ' + color,
      'each tier update must own rim width/style as well as color, not the native borderColor alias');
    assert.equal(fixture.level.style.visibility, 'visible');
    assert.equal(fixture.level.style.marginLeft, '19.71px');
    assert.equal(fixture.levelLabel.text, String(level));
    for (const property of ['width', 'height', 'visibility', 'washColor', 'color'])
      assert.equal(fixture.levelLabel.style[property] || '', '', 'native number must not be rewritten');
    assert.equal(fixture.level.style.backgroundColor || '', '', 'tier color must never become badge fill');
  }
  fixture.update({ enabled: false });
  assert.equal(fixture.level.style.border, '', 'release the complete owned rim when disabled');
});

test('default stamina retains stock pips without the owned box class', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { enabled: true });
  assert.equal(fixture.window.BHasClass('HPColorsRewriteEnemyPlayer'), true);
  assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), false);
  assert.equal(fixture.icon.style.width, '11px');
  assert.equal(fixture.icon.style.height, '4.48px');
  assert.equal(fixture.icon.style.backgroundColor, '#ABCDEF');
  assert.equal(fixture.icon.style.borderColor, '#123456');
  fixture.update({ enabled: true, staminaOffsetX: 20 });
  assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), false);
});

test('stamina box ownership is enemy-player-only and released to stock', () => {
  for (const custom of [
    { staminaWidth: 120 },
    { staminaHeight: 50 },
    { enemyStaminaColorEnabled: true, enemyStaminaColor: '#654321' },
  ]) {
    const fixture = makeOwnershipFixture(['player', 'enemy'], { enabled: true, staminaShape: 'box', ...custom });
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), true);
    fixture.update({ enabled: false, staminaShape: 'box', ...custom });
    assert.equal(fixture.window.BHasClass('HPColorsRewriteEnemyPlayer'), false);
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), false);
    assert.equal(fixture.icon.style.width, '11px');
    assert.equal(fixture.icon.style.height, '4.48px');
    assert.equal(fixture.icon.style.backgroundColor, '#ABCDEF');
    assert.equal(fixture.icon.style.borderColor, '#123456');
    fixture.update({ enabled: true, staminaShape: 'box', ...custom });
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), true);
    fixture.update({ enabled: true });
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), false);
  }
  for (const classes of [['player', 'friend'], ['minion', 'enemy'], ['building', 'enemy'], ['enemy']]) {
    const fixture = makeOwnershipFixture(classes, {
      enabled: true, npcEnemyEnabled: true, buildingEnemyEnabled: true, staminaShape: 'box', staminaWidth: 120,
    });
    assert.equal(fixture.window.BHasClass('HPColorsRewriteEnemyPlayer'), false, classes.join(' '));
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), false, classes.join(' '));
    assert.equal(fixture.icon.style.width, '11px');
  }
});

test('native health ownership belongs to player surfaces and never writes the shield label', () => {
  for (const classes of [['player', 'enemy'], ['player', 'friend']]) {
    const fixture = makeOwnershipFixture(classes, {
      enabled: true, readoutVisible: true, allyReadoutVisible: true,
    });
    assert.equal(fixture.health.style.visibility, 'visible');
    assert.equal(fixture.health.GetParent(), fixture.row);
    fixture.update({ enabled: true, readoutVisible: false, allyReadoutVisible: false });
    assert.equal(fixture.health.style.visibility, classes.includes('enemy') ? 'collapse' : 'visible');
    fixture.update({ enabled: false, readoutVisible: true, allyReadoutVisible: true });
    assert.equal(fixture.health.style.visibility, 'visible');
    fixture.update({ enabled: true, readoutVisible: true, allyReadoutVisible: true, staminaShape: 'box', staminaWidth: 120 });
    assert.equal(fixture.health.style.visibility, 'visible');
    assert.equal(fixture.health.GetParent(), fixture.row);
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), classes.includes('enemy'));
    fixture.world.RemoveClass('player');
    fixture.world.AddClass('minion');
    fixture.update({ enabled: true, npcEnemyEnabled: true, npcAllyEnabled: true,
      readoutVisible: true, allyReadoutVisible: true, staminaShape: 'box', staminaWidth: 120 });
    assert.equal(fixture.health.style.visibility, 'visible');
    assert.equal(fixture.window.BHasClass('HPColorsRewriteEnemyPlayer'), false);
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), false);
    assert.equal(fixture.shield.style.visibility, 'visible');
    assert.equal(fixture.shield.text, '999');
    assert.deepEqual(fixture.shieldWrites, []);
  }
  for (const classes of [['minion', 'enemy'], ['building', 'enemy'], ['minion', 'friend'], ['building', 'friend'], ['enemy']]) {
    const fixture = makeOwnershipFixture(classes, {
      enabled: true, npcEnemyEnabled: true, npcAllyEnabled: true,
      buildingEnemyEnabled: true, buildingAllyEnabled: true,
      readoutVisible: true, allyReadoutVisible: true,
    });
    assert.equal(fixture.health.style.visibility, 'visible', classes.join(' '));
    assert.deepEqual(fixture.shieldWrites, [], classes.join(' '));
  }
});

const nativeReadoutStock = {
  visibility: 'visible', opacity: '0.35', washColor: '#ABCDEF',
  fontSize: '18px', fontFamily: 'numericOracle', fontWeight: 'bold',
  transform: 'rotateZ(-3deg)', animationDuration: '0.25s', animationName: 'stockAnimation',
  marginLeft: '40px', marginRight: '10px', marginTop: '1px',
};
const nativePulseClasses = [
  'HPColorsRewritePulse', 'HPColorsRewritePulseSubtle', 'HPColorsRewritePulseIntense',
];

function prepareNativeReadout({ health, counter, counterMax }) {
  Object.assign(health.style, nativeReadoutStock);
  health.styleWrites.length = 0;
  health.originalReadoutParent = health.GetParent();
  health.readoutParentWrites = [];
  const setParent = health.SetParent.bind(health);
  health.SetParent = (parent) => { health.readoutParentWrites.push(parent); return setParent(parent); };
  for (const panel of [health, counter, counterMax]) {
    const descriptor = Object.getOwnPropertyDescriptor(panel, 'text');
    panel.readoutTextReads = 0;
    panel.readoutTextWrites = [];
    Object.defineProperty(panel, 'text', {
      ...descriptor,
      get() { panel.readoutTextReads++; return descriptor.get(); },
      set(value) { panel.readoutTextWrites.push(value); descriptor.set(value); },
    });
  }
}

function assertNativeStock(panel, visibility = nativeReadoutStock.visibility) {
  for (const [property, value] of Object.entries(nativeReadoutStock))
    assert.equal(panel.style[property], property === 'visibility' ? visibility : value, property);
  for (const className of nativePulseClasses) assert.equal(panel.BHasClass(className), false, className);
}

function assertInactiveReadout(panel) {
  assert.equal(panel.style.visibility, 'collapse');
  for (const property of ['washColor', 'fontSize', 'fontFamily', 'height', 'animationDuration'])
    assert.equal(panel.style[property] || '', '', property);
  for (const className of nativePulseClasses) assert.equal(panel.BHasClass(className), false, className);
}

function paintReadout(fixture) {
  fixture.harness.scheduler.takeByFunctionName('paintColors').fn();
}

function readoutTranslation(row) {
  const match = /^translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0px\)$/.exec(row.style.transform);
  assert.ok(match, `unsupported readout translation: ${row.style.transform}`);
  return [Number(match[1]), Number(match[2])];
}

function assertReadoutBounds(fixture, x = 0, y = 0) {
  const { container, anchor, row, primary, stack } = fixture;
  const width = container.actuallayoutwidth;
  const height = container.actuallayoutheight;
  const [shift, top] = readoutTranslation(row);
  const centerX = stack.actualxoffset + primary.actualxoffset + primary.actuallayoutwidth / 2;
  const centerY = stack.actualyoffset + primary.actualyoffset + primary.actuallayoutheight / 2;
  const gap = 33.5;
  const q = { left: 0, center: 0.5, right: 1 }[row.style.horizontalAlign];
  const point = centerX + gap + x + 2 * (q - 1) * 4;
  const low = q * row.actuallayoutwidth;
  const high = width - (1 - q) * row.actuallayoutwidth;
  const expected = (high < low ? low : Math.max(low, Math.min(high, point))) - q * width;
  assert.equal(shift, expected);
  assert.equal(top, Math.max(0, Math.min(height - row.actuallayoutheight, centerY - 8 + y)));
  assert.ok(q * width + shift >= low && q * width + shift <= Math.max(low, high));
  assert.equal(anchor.style.width, width + 'px');
  assert.equal(anchor.style.height, height + 'px');
  assert.equal(anchor.style.transform, '');
  assert.equal(fixture.health.readoutTextReads, 0);
  assert.deepEqual(fixture.health.readoutTextWrites, []);
  assert.deepEqual(fixture.shieldWrites, []);
}

test('readout offset matrix saturates measured edges without changing normalized offsets', () => {
  for (const role of ['enemy', 'ally', 'pulse']) {
    for (const format of ['hp', 'current', 'percent']) {
      for (const [width, height, positionX, positionY] of [[200, 210, 0, 0], [260, 240, 100, -100]]) {
        const ally = role === 'ally';
        const prefix = ally ? 'allyReadout' : 'readout';
        const offsetPrefix = role === 'pulse' ? 'enemyPulseReadout' : prefix;
        const fixture = makeOwnershipFixture(['player', ally ? 'friend' : 'enemy'], {}, (parts) => {
          prepareNativeReadout(parts);
          parts.container.actuallayoutwidth = width;
          parts.container.actuallayoutheight = height;
        });
        for (const x of [-200, 0, 200]) for (const y of [-210, 0, 210]) {
          fixture.update({
            [prefix + 'Visible']: true, [prefix + 'Format']: format,
            [offsetPrefix + 'OffsetX']: x, [offsetPrefix + 'OffsetY']: y,
            enemyPulseEnabled: role === 'pulse', enemyPulseThreshold: 100,
            enemyPulseReadoutModifiers: role === 'pulse', positionX, positionY,
          });
          assertReadoutBounds(fixture, x + positionX * 0.1, y + positionY * 0.1);
          const normalized = fixture.status.HPV2GetNormalizedConfig();
          assert.equal(normalized[offsetPrefix + 'OffsetX'], x);
          assert.equal(normalized[offsetPrefix + 'OffsetY'], y);
            assert.equal(fixture.health.GetParent(), fixture.row);
            assert.equal(fixture.health.style.visibility, 'visible');
            assert.equal(fixture.health.style.opacity, '1');
        }
      }
    }
  }
});

test('unchanged-fill paint tracks digit/font row reflow and container resize without native text access', () => {
  for (const classes of [['player', 'enemy'], ['player', 'friend']]) {
    const prefix = classes.includes('friend') ? 'allyReadout' : 'readout';
    const fixture = makeOwnershipFixture(classes, { [prefix + 'Visible']: true }, prepareNativeReadout);
    const edge = 142;
    assertReadoutBounds(fixture);
    assert.equal(readoutTranslation(fixture.row)[0] + fixture.container.actuallayoutwidth, edge);
    for (const x of [0, 200]) {
      fixture.update({ [prefix + 'Visible']: true, [prefix + 'OffsetX']: x });
      for (const [number, width] of [['9', 16], ['999', 32], ['1,000', 46], ['2,990', 48], ['10,000', 60]]) {
        fixture.health.__text = number; // Engine update; geometry, not text, is sampled.
        fixture.row.actuallayoutwidth = width;
        paintReadout(fixture);
        assertReadoutBounds(fixture, x);
        if (!x) assert.equal(readoutTranslation(fixture.row)[0] + fixture.container.actuallayoutwidth, edge);
      }
    }
    for (const font of ['default', 'oracle', 'pulp']) for (const size of [72, 320]) {
      fixture.update({ [prefix + 'Visible']: true, [prefix + 'Font']: font, [prefix + 'Size']: size });
      fixture.row.actuallayoutwidth = size === 72 ? 36 : 100;
      fixture.row.actuallayoutheight = size === 72 ? 18 : 40;
      paintReadout(fixture);
      assertReadoutBounds(fixture);
    }
    fixture.container.actuallayoutwidth = 240;
    fixture.container.actuallayoutheight = 250;
    paintReadout(fixture);
    assertReadoutBounds(fixture);
    fixture.update({ [prefix + 'Visible']: true, [prefix + 'Format']: 'percent' });
    fixture.row.actuallayoutwidth = 40;
    paintReadout(fixture);
    assertReadoutBounds(fixture);
    fixture.update({ [prefix + 'Visible']: true, [prefix + 'Format']: 'current' });
    fixture.row.actuallayoutwidth = 60;
    paintReadout(fixture);
    assertReadoutBounds(fixture);
    fixture.update({ [prefix + 'Visible']: false });
    for (const property of ['width', 'height', 'transform']) assert.equal(fixture.anchor.style[property], '');
    for (const property of ['transform', 'marginLeft', 'marginTop']) assert.equal(fixture.row.style[property] ?? '', '');
  }
});

test('readout geometry converts measured window pixels to CSS pixels at world-panel scale 2', () => {
  // Live 6722: a 200x210 CSS canvas reports 400x420 actual pixels (window scale 2).
  for (const [classes, prefix] of [[['player', 'enemy'], 'readout'], [['player', 'friend'], 'allyReadout']]) {
    const fixture = makeOwnershipFixture(classes, { [prefix + 'Visible']: true }, (parts) => {
      prepareNativeReadout(parts);
      for (const panel of [parts.container, parts.row]) {
        panel.actualuiscale_x = 2;
        panel.actualuiscale_y = 2;
      }
      parts.container.actuallayoutwidth = 400;
      parts.container.actuallayoutheight = 420;
      parts.row.actuallayoutwidth = 96;
      parts.row.actuallayoutheight = 48;
    });
    paintReadout(fixture);
    assert.deepEqual(readoutTranslation(fixture.row), [-58, 66]);
    assert.equal(fixture.anchor.style.width, '200px');
    assert.equal(fixture.anchor.style.height, '210px');
    fixture.update({ [prefix + 'Visible']: true, [prefix + 'OffsetX']: 200, [prefix + 'OffsetY']: 210 });
    assert.deepEqual(readoutTranslation(fixture.row), [0, 186]);
  }
});

test('readout LEFT, RIGHT and CENTER hold their edge through digit reflow', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'hp_colors_rewrite_v2', 'panorama', 'styles', 'unit_status_v2.css'), 'utf8');
  const rowRule = css.match(/\.WindowRoot #hp_counter_row\s*\{([^}]*)\}/)[1];
  assert.match(rowRule, /horizontal-align:\s*right/);
  assert.match(rowRule, /transform:\s*translate3d\(-60px, 66px, 0px\)/);
  assert.doesNotMatch(rowRule, /margin-right/);
  assert.doesNotMatch(css, /\.friend \.WindowRoot #hp_counter_row/, 'allies share the enemy fallback');
  for (const role of ['enemy', 'ally', 'pulse']) for (const align of ['right', 'left', 'center']) {
    const prefix = role === 'ally' ? 'allyReadout' : 'readout';
    const values = {
      [prefix + 'Visible']: true, hpTextAlign: align,
      enemyPulseEnabled: role === 'pulse', enemyPulseReadout: role === 'pulse',
      enemyPulseThreshold: 100, enemyPulseReadoutModifiers: role === 'pulse',
    };
    const fixture = makeOwnershipFixture(['player', role === 'ally' ? 'friend' : 'enemy'],
      values, prepareNativeReadout);
    // q is the right-edge fraction kept at the anchor: LEFT grows left.
    const q = { left: 1, center: 0.5, right: 0 }[align];
    const point = 142 + 2 * (q - 1) * 4;
    const expectedShift = point - q * 200;
    for (const [text, width] of [['999', 32], ['1,000', 46], ['17,000', 60]]) {
      fixture.health.__text = text;
      fixture.row.actuallayoutwidth = width;
      fixture.row.styleWrites.length = 0;
      paintReadout(fixture);
      assert.equal(fixture.row.style.horizontalAlign, { left: 'right', center: 'center', right: 'left' }[align]);
      assert.deepEqual(readoutTranslation(fixture.row), [expectedShift, 66], role + ' ' + align);
      assert.equal(fixture.row.styleWrites.some(([property]) => property === 'transform'), false,
        'unclamped digit reflow does not rewrite transform');
      assertReadoutBounds(fixture);
    }
    for (const x of [-334, 334]) {
      fixture.update({ ...values, [prefix + 'OffsetX']: x, enemyPulseReadoutOffsetX: x });
      assertReadoutBounds(fixture, x);
    }
  }
});

test('unmeasured player default LEFT keeps the right edge at 140/66 for enemies and allies', () => {
  for (const [role, prefix, edge] of [
    ['enemy', 'readout', 140], ['friend', 'allyReadout', 140],
  ]) {
    const fixture = makeOwnershipFixture(['player', role], { [prefix + 'Visible']: true }, parts => {
      prepareNativeReadout(parts);
      parts.primary.actuallayoutwidth = 0;
    });
    assert.equal(fixture.row.style.horizontalAlign, 'right');
    assert.deepEqual(readoutTranslation(fixture.row), [edge - 200, 66]);
  }
});

test('readout uses measured untransformed bar centers and falls back while primary layout is unavailable', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], {
    readoutVisible: true, positionX: 100, positionY: 100,
  }, parts => {
    prepareNativeReadout(parts);
    parts.primary.actuallayoutwidth = 0;
  });
  assert.deepEqual(readoutTranslation(fixture.row), [-50, 76], 'player fallback is canvas center plus 6.5');
  fixture.primary.actualuiscale_x = 2;
  fixture.primary.actualuiscale_y = 2;
  fixture.primary.actualxoffset = 160;
  fixture.primary.actualyoffset = 140;
  fixture.primary.actuallayoutwidth = 120;
  fixture.primary.actuallayoutheight = 24;
  paintReadout(fixture);
  assert.deepEqual(readoutTranslation(fixture.row), [-46.5, 78], 'primary normalizes its own axis scales');
  fixture.update({ readoutVisible: true, positionX: -100, positionY: -100 });
  assert.deepEqual(readoutTranslation(fixture.row), [-66.5, 58], 'bar translation is applied exactly once');
});

test('ui-scaled objective HP text keeps its right anchor in WindowRoot pixels', () => {
  const values = { enabled: true, buildingEnemyEnabled: true, readoutVisible: true,
    widthScale: 100, heightScale: 100, positionX: 0, positionY: 0, readoutOffsetX: 0, readoutOffsetY: 8 };
  const rightEdge = (scale, statusX, statusY) => {
    const fixture = makeOwnershipFixture(['building', 'enemy'], values, parts => {
      prepareNativeReadout(parts);
      parts.container.actuallayoutwidth = 400;
      parts.container.actuallayoutheight = 420;
      for (const panel of [parts.status, parts.info, parts.stack, parts.primary, parts.inner, parts.fill]) {
        panel.actualuiscale_x = scale;
        panel.actualuiscale_y = scale;
      }
      parts.status.actualxoffset = statusX;
      parts.status.actualyoffset = statusY;
      parts.primary.actualxoffset = 70.5 * scale;
      parts.primary.actualyoffset = 65 * scale;
      parts.primary.actuallayoutwidth = 76 * scale;
      parts.primary.actuallayoutheight = 18 * scale;
    });
    paintReadout(fixture);
    const [left, top] = readoutTranslation(fixture.row);
    return [left + fixture.container.actuallayoutwidth, top];
  };
  assert.deepEqual(rightEdge(1, 0, 0), [142, 74]);
  // Stock 180% UnitStatus scales its local bar point and applies window compensation.
  assert.deepEqual(rightEdge(1.8, -80, -52), [175.6, 74.8]);
});

test('per-kind ui-scale compensation restores the stock compact frame top without moving players', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'hp_colors_rewrite_v2', 'panorama', 'styles', 'unit_status_v2.css'), 'utf8');
  const owned = css.slice(css.indexOf('/* Rewrite-owned additions'));
  for (const [classes, scale, margin] of [
    [['neutral_normal', 'neutral_weak'], 0.8, 13],
    [['boss_tier1', 'boss_tier2', 'boss_barracks', 'building', 'midboss'], 1.8, -52],
  ]) {
    for (const kind of classes) {
      const block = owned.match(new RegExp('\\.' + kind + ' \\.WindowRoot #UnitStatus(?:,|\\s)[^{]*\\{([^}]*)\\}'));
      assert.ok(block, kind);
      assert.match(block[1], new RegExp('margin-top:\\s*' + margin + 'px;'), kind);
    }
    assert.ok(Math.abs(margin + 65 * scale - 65) < 1e-9, 'leaf top equals stock y=65');
  }
  assert.doesNotMatch(owned, /\.player \.WindowRoot #UnitStatus/);
  const label = owned.match(/\.WindowRoot #hp_counter_row #UnitHealthbarValue\s*\{([^}]*)\}/)[1];
  assert.match(label, /text-overflow:\s*clip/);
  assert.doesNotMatch(label, /(?:max-width|width)\s*:/);
});

test('invalid readout layout defers on the existing cadence; oversized rows expose the fit limit', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, (parts) => {
    prepareNativeReadout(parts);
    parts.row.actuallayoutwidth = 0;
  });
  assert.equal(fixture.row.style.transform || '', '');
  const panels = [fixture.anchor, fixture.row];
  for (const [panel, property, invalid] of [
    [fixture.row, 'actuallayoutwidth', 0], [fixture.row, 'actuallayoutheight', NaN],
    [fixture.container, 'actuallayoutwidth', Infinity], [fixture.container, 'actuallayoutheight', -1],
  ]) {
    const previous = panel[property];
    panel[property] = invalid;
    for (const target of panels) target.styleWrites.length = 0;
    paintReadout(fixture);
    for (const target of panels) assert.deepEqual(target.styleWrites, []);
    assert.equal(fixture.harness.scheduler.jobs.length, 2, 'only original scan and paint loops');
    panel[property] = previous;
  }
  fixture.row.actuallayoutwidth = 48;
  paintReadout(fixture);
  assertReadoutBounds(fixture);
  fixture.row.actuallayoutwidth = 250;
  fixture.row.actuallayoutheight = 230;
  paintReadout(fixture);
  assert.deepEqual(readoutTranslation(fixture.row), [50, 0]);
  assert.ok(fixture.row.actuallayoutwidth > fixture.container.actuallayoutwidth);
  assert.ok(fixture.row.actuallayoutheight > fixture.container.actuallayoutheight);
  fixture.row.actuallayoutwidth = 48;
  fixture.row.actuallayoutheight = 24;
  paintReadout(fixture);
  assertReadoutBounds(fixture);
});

test('readout geometry retries rejected transforms and repairs native drift at unchanged measurements', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, prepareNativeReadout);
  const nativeStyle = fixture.row.style;
  let reject = true;
  fixture.row.style = new Proxy(nativeStyle, {
    set(target, property, value) {
      if (property === 'transform' && reject) throw new Error('temporarily unavailable transform');
      target[property] = value;
      return true;
    },
  });
  fixture.row.actuallayoutwidth = 60;
  paintReadout(fixture);
  assert.deepEqual(readoutTranslation(fixture.row), [-58, 66], 'rejected change retains prior transform');
  reject = false;
  paintReadout(fixture);
  assertReadoutBounds(fixture);
  nativeStyle.transform = 'translate3d(0px, 0px, 0px)';
  fixture.anchor.style.width = '1px';
  fixture.harness.scheduler.runByDelay(1);
  assertReadoutBounds(fixture);
});

test('HP/current readouts adopt the same engine label outside UnitStatus with zero text access', () => {
  for (const [classes, prefix] of [[['player', 'enemy'], 'readout'], [['player', 'friend'], 'allyReadout']]) {
    for (const format of ['hp', 'current']) {
      const values = {
        [prefix + 'Visible']: true, [prefix + 'Format']: format,
        [prefix + 'Size']: 200, [prefix + 'Font']: 'pulp',
        [prefix + 'OffsetX']: 50, [prefix + 'OffsetY']: -100,
        [prefix + 'ColorMode']: 'custom', [prefix + 'Mode']: 'fixed',
        [prefix + 'Low']: '#112233', [prefix + 'Mid']: '#112233', [prefix + 'High']: '#112233',
        positionX: 100, positionY: -100,
      };
      const fixture = makeOwnershipFixture(classes, values, prepareNativeReadout);
      assert.equal(fixture.health.style.visibility, 'visible');
      assert.equal(fixture.health.style.opacity, '1');
      assert.equal(fixture.health.style.washColor, '#112233');
      assert.equal(fixture.health.style.fontSize, '20px');
      assert.equal(fixture.health.style.fontFamily, 'VALVEPulp, Noto Sans, sans-serif');
      assert.equal(fixture.anchor.style.transform, '');
      assert.deepEqual(readoutTranslation(fixture.row), [0, 0]);
      assert.equal(fixture.row.FindChildTraverse('UnitHealthbarValue'), fixture.health);
      assert.equal(fixture.health.GetParent(), fixture.row);
      assert.equal(fixture.row.GetParent().GetParent().GetParent(), fixture.window);
      assert.deepEqual(fixture.health.readoutParentWrites, [fixture.row]);
      for (const panel of [fixture.health, fixture.counter, fixture.counterMax]) {
        assert.deepEqual(panel.readoutTextWrites, []);
        assert.equal(panel.readoutTextReads, 0, panel.id);
      }
      for (const panel of [fixture.counter, fixture.counterMax]) assertInactiveReadout(panel);
      fixture.update({ enabled: false });
      assertNativeStock(fixture.health);
      assert.equal(fixture.health.GetParent(), fixture.info);
      assert.deepEqual(fixture.health.readoutParentWrites, [fixture.row, fixture.info]);
      assert.equal(fixture.anchor.style.transform, '');
      assert.deepEqual(fixture.shieldWrites, []);
    }
  }
});

test('retired format snapshots keep the same native engine label and pulse ownership', () => {
  const values = {
    readoutVisible: true, readoutFormat: 'hp', readoutSize: 200, readoutFont: 'oracle',
    readoutOffsetX: 50, readoutOffsetY: -100,
    enemyMode: 'fixed', enemyLow: '#123456', enemyMid: '#123456', enemyHigh: '#123456',
    enemyPulseEnabled: true, enemyPulseThreshold: 100, enemyPulseReadout: true,
    enemyPulseIntensity: 2,
  };
  const fixture = makeOwnershipFixture(['player', 'enemy'], values, prepareNativeReadout);
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulseIntense'), true);
  assert.equal(fixture.health.style.animationDuration, '0.800s');
  fixture.update({ ...values, readoutFormat: 'percent' });
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.style.visibility, 'visible');
  assert.equal(fixture.health.style.washColor, '#123456');
  assert.equal(fixture.health.style.fontSize, '20px');
  assert.equal(fixture.health.style.fontFamily, 'VALVEOracle, Reaver, sans-serif');
  for (const panel of [fixture.counter, fixture.counterMax]) assertInactiveReadout(panel);
  assert.equal(fixture.anchor.style.transform, '');
  assert.deepEqual(readoutTranslation(fixture.row), [-8, 0]);
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulseIntense'), true);
  const writes = fixture.counter.readoutTextWrites.length;
  fixture.update({ ...values, readoutFormat: 'current', enemyPulseIntensity: 0 });
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.style.visibility, 'visible');
  assert.equal(fixture.health.style.washColor, '#123456');
  assert.equal(fixture.anchor.style.transform, '');
  assert.deepEqual(readoutTranslation(fixture.row), [-8, 0]);
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulseSubtle'), true);
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulseIntense'), false);
  for (const panel of [fixture.counter, fixture.counterMax]) assertInactiveReadout(panel);
  assert.equal(fixture.counter.readoutTextWrites.length, writes, 'native transition must not write hidden text');
  assert.deepEqual(fixture.health.readoutTextWrites, []);
  assert.equal(fixture.health.readoutTextReads, 0);
  fixture.update({ ...values, readoutFormat: 'percent', enemyPulseEnabled: false });
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), false);
  fixture.update({ enabled: false });
  assertNativeStock(fixture.health);
  for (const panel of [fixture.counter, fixture.counterMax]) assertInactiveReadout(panel);
  assert.equal(fixture.anchor.style.transform, '');
});

test('adopted label restores its original parent, styles and pulse on every release path', () => {
  for (const release of ['bypass', 'role', 'kind', 'retirement', 'teardown']) {
    const fixture = makeOwnershipFixture(['player', 'enemy'], {
      readoutVisible: true, enemyPulseEnabled: true, enemyPulseThreshold: 100,
      enemyPulseReadout: true, enemyPulseIntensity: 0,
    }, prepareNativeReadout);
    if (release === 'bypass') fixture.update({ enabled: false });
    if (release === 'role') {
      fixture.world.RemoveClass('enemy');
      fixture.world.AddClass('friend');
      fixture.harness.scheduler.runByDelay(1);
    }
    if (release === 'kind') {
      fixture.world.RemoveClass('player');
      fixture.world.AddClass('minion');
      fixture.harness.scheduler.runByDelay(1);
    }
    if (release === 'retirement') {
      fixture.primary.RemoveClass('UnitHealthbarContainer');
      fixture.harness.scheduler.runByDelay(1);
    }
    if (release === 'teardown') {
      fixture.status.valid = false;
      fixture.harness.scheduler.runNext();
    }
    assertNativeStock(fixture.health);
    assert.equal(fixture.health.GetParent(), fixture.info);
    for (const panel of [fixture.counter, fixture.counterMax]) assertInactiveReadout(panel);
    assert.equal(fixture.anchor.style.transform, '');
    assert.deepEqual(fixture.shieldWrites, []);
  }
});

test('label replacement restores the retired panel before adopting the replacement', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], {
    readoutVisible: true, enemyPulseEnabled: true, enemyPulseThreshold: 100, enemyPulseReadout: true,
  }, prepareNativeReadout);
  const replacementStock = { ...nativeReadoutStock, opacity: '0.6', fontFamily: 'replacement font' };
  const replacement = fixture.info.add(new MockPanel('UnitHealthbarValue', {
    text: '2,990', style: replacementStock,
  }));
  fixture.harness.scheduler.runByDelay(1);
  assertNativeStock(fixture.health);
  assert.equal(fixture.health.GetParent(), fixture.info);
  assert.equal(replacement.GetParent(), fixture.row);
  assert.equal(replacement.style.visibility, 'visible');
  assert.equal(replacement.BHasClass('HPColorsRewritePulse'), true);
  fixture.update({ enabled: false });
  assert.equal(replacement.GetParent(), fixture.info);
  for (const [property, value] of Object.entries(replacementStock))
    assert.equal(replacement.style[property], value, property);
  for (const className of nativePulseClasses) assert.equal(replacement.BHasClass(className), false);
});

test('text outline widths retain stock at five and restore native labels on every release', () => {
  for (const [relation, prefix] of [['enemy', 'readout'], ['friend', 'allyReadout']]) {
    for (const release of ['reset', 'off', 'master', 'replacement', 'retirement', 'teardown']) {
      let name;
      const writes = [];
      const originalHP = 'original HP shadow';
      const originalName = 'original name shadow';
      const values = { readoutVisible: true, allyReadoutVisible: true, playerNamesVisible: true,
        readoutOutlineWidth: 5, allyReadoutOutlineWidth: 5, nameOutlineWidth: 5,
        enemyPulseEnabled: true, enemyPulseThreshold: 100, enemyPulseReadout: true,
        enemyPulseReadoutModifiers: true };
      const fixture = makeOwnershipFixture(['player', relation], values, (parts) => {
        parts.health.style.textShadow = originalHP;
        name = parts.window.add(new MockPanel('HPV2NameAnchor')).add(new MockPanel('name', { text: 'Native name',
          style: { textShadow: originalName } }));
        for (const panel of [parts.health, name]) panel.style = new Proxy(panel.style, {
          set(target, property, value) {
            if (property === 'textShadow') writes.push([panel.id, value]);
            target[property] = value;
            return true;
          },
        });
      });
      assert.deepEqual(writes, [], 'five must not write a stock shadow');
      const custom = { ...values, [prefix + 'OutlineWidth']: 2, nameOutlineWidth: 8 };
      fixture.update(custom);
      assert.equal(fixture.health.style.textShadow, '0px 0px 0px 2 #10130D');
      assert.equal(name.style.textShadow, '0px 0px 0px 8 #10130Dee');
      if (relation === 'enemy') assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), true);
      const count = writes.length;
      fixture.update(custom);
      assert.equal(writes.length, count, 'unchanged shadows are cached');
      fixture.update({ ...custom, [prefix + 'OutlineWidth']: 8, nameOutlineWidth: 2 });
      assert.equal(fixture.health.style.textShadow, '0px 0px 0px 8 #10130D');
      assert.equal(name.style.textShadow, '0px 0px 0px 2 #10130Dee');
      fixture.update(custom);
      if (release === 'reset') fixture.update(values);
      if (release === 'off') fixture.update({ ...custom, readoutVisible: false,
        allyReadoutVisible: false, playerNamesVisible: false });
      if (release === 'master') fixture.update({ ...custom, enabled: false });
      if (release === 'replacement') {
        const newHP = fixture.info.add(new MockPanel('UnitHealthbarValue',
          { style: { textShadow: 'replacement HP shadow' } }));
        name.SetParent(fixture.info);
        const newName = fixture.window.FindChildTraverse('HPV2NameAnchor').add(new MockPanel('name',
          { style: { textShadow: 'replacement name shadow' } }));
        fixture.harness.scheduler.runByDelay(1);
        assert.equal(newHP.style.textShadow, '0px 0px 0px 2 #10130D');
        assert.equal(newName.style.textShadow, '0px 0px 0px 8 #10130Dee');
        fixture.update({ enabled: false });
        assert.equal(newHP.style.textShadow, 'replacement HP shadow');
        assert.equal(newName.style.textShadow, 'replacement name shadow');
      }
      if (release === 'retirement') {
        fixture.primary.RemoveClass('UnitHealthbarContainer');
        fixture.harness.scheduler.runByDelay(1);
      }
      if (release === 'teardown') {
        fixture.status.valid = false;
        fixture.harness.scheduler.runNext();
      }
      assert.equal(fixture.health.style.textShadow, originalHP, release);
      assert.equal(name.style.textShadow, originalName, release);
    }
  }
});

test('counter row replacement never orphans the adopted engine label', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, prepareNativeReadout);
  fixture.row.SetParent(fixture.window);
  const row = fixture.anchor.add(new MockPanel('hp_counter_row', { actuallayoutwidth: 72, actuallayoutheight: 24 }));
  row.add(new MockPanel('hp_counter', { style: { visibility: 'collapse' } }));
  row.add(new MockPanel('hp_counter_max', { style: { visibility: 'collapse' } }));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.health.GetParent(), row);
  assert.deepEqual(fixture.health.readoutParentWrites, [fixture.row, fixture.info, row]);
  for (const property of ['transform', 'marginLeft', 'marginTop'])
    assert.equal(fixture.row.style[property] ?? '', '');
  assert.deepEqual(readoutTranslation(row), [-58, 66]);
  fixture.update({ enabled: false });
  assert.equal(fixture.health.GetParent(), fixture.info);
  assertNativeStock(fixture.health);
});

test('InfoHealthContainer replacement retains pointer identity when the original parent expires', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, prepareNativeReadout);
  fixture.info.SetParent(fixture.window);
  const info = fixture.status.add(new MockPanel('InfoHealthContainer', {
    actuallayoutwidth: 200, actuallayoutheight: 210,
  }));
  fixture.stack.SetParent(info);
  fixture.info.valid = false;
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.deepEqual(fixture.health.readoutParentWrites, [fixture.row, info, fixture.row]);
  fixture.update({ enabled: false });
  assert.equal(fixture.health.GetParent(), info);
  assertNativeStock(fixture.health);
});

test('native pulse release restores pre-existing classes and animation styles exactly', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], {
    enemyPulseEnabled: true, enemyPulseThreshold: 100, enemyPulseReadout: true, enemyPulseIntensity: 0,
  }, (parts) => {
    prepareNativeReadout(parts);
    parts.health.AddClass('HPColorsRewritePulseIntense');
  });
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulseSubtle'), true);
  fixture.update({ enabled: false });
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulseSubtle'), false);
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulseIntense'), true);
  assert.equal(fixture.health.style.animationDuration, nativeReadoutStock.animationDuration);
  assert.equal(fixture.health.GetParent(), fixture.info);
});

test('ally readout off leaves stock styles, classes, text and parent completely untouched', () => {
  const fixture = makeOwnershipFixture(['player', 'friend'], {
    readoutVisible: true, allyReadoutVisible: false,
  }, prepareNativeReadout);
  assertNativeStock(fixture.health);
  assert.deepEqual(fixture.health.styleWrites, []);
  assert.deepEqual(fixture.health.readoutTextWrites, []);
  assert.equal(fixture.health.readoutTextReads, 0);
  assert.equal(fixture.health.GetParent(), fixture.info);
  assert.deepEqual(fixture.health.readoutParentWrites, []);
  fixture.update({ allyReadoutVisible: false, allyReadoutSize: 200, positionX: 100 });
  assertNativeStock(fixture.health);
  assert.deepEqual(fixture.health.styleWrites, []);
  fixture.update({ allyReadoutVisible: true });
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.style.visibility, 'visible');
  fixture.update({ allyReadoutVisible: false });
  assertNativeStock(fixture.health);
  assert.equal(fixture.health.GetParent(), fixture.info);
});

test('adopted label rediscovery avoids repeated SetParent, style, class and text writes', () => {
  const values = {
    readoutVisible: true, enemyPulseEnabled: true, enemyPulseThreshold: 100, enemyPulseReadout: true,
  };
  const fixture = makeOwnershipFixture(['player', 'enemy'], values, prepareNativeReadout);
  const panels = [fixture.health, fixture.counter, fixture.counterMax, fixture.container, fixture.anchor, fixture.row, fixture.window];
  const classWrites = [];
  for (const panel of panels) {
    panel.styleWrites.length = 0;
    for (const method of ['AddClass', 'RemoveClass']) {
      const setClass = panel[method].bind(panel);
      panel[method] = (...args) => { classWrites.push([method, ...args]); return setClass(...args); };
    }
  }
  for (let i = 0; i < 5; i++) {
    fixture.health.__text = String(345 - i);
    paintReadout(fixture);
    fixture.update(values);
    assert.equal(fixture.harness.scheduler.jobs.length, 2);
  }
  for (const panel of panels) assert.deepEqual(panel.styleWrites, [], panel.id);
  assert.deepEqual(classWrites, []);
  assert.deepEqual(fixture.health.readoutParentWrites, [fixture.row]);
  assert.equal(fixture.row.FindChildTraverse('UnitHealthbarValue'), fixture.health);
  for (const panel of [fixture.health, fixture.counter, fixture.counterMax]) {
    assert.deepEqual(panel.readoutTextWrites, []);
    assert.equal(panel.readoutTextReads, 0, panel.id);
  }
});

test('adopted readout gradient uses the fill fraction without reading HP', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], {
    readoutVisible: true, readoutColorMode: 'custom', readoutMode: 'gradient',
    readoutLow: '#FF0000', readoutMid: '#00FF00', readoutHigh: '#0000FF',
    lowThreshold: 20, highThreshold: 80,
  }, prepareNativeReadout);
  assert.equal(fixture.health.style.washColor, '#7f7f00');
  fixture.inner.FindChildTraverse('unit_healthbar_lagging').actuallayoutwidth = 69;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.health.style.washColor, '#0000ff');
  for (const panel of [fixture.health, fixture.counter, fixture.counterMax]) {
    assert.equal(panel.readoutTextReads, 0);
    assert.deepEqual(panel.readoutTextWrites, []);
  }
});

test('failed native adoption retries on the existing cadence without showing an in-canvas fallback', () => {
  let reject = true;
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, (parts) => {
    prepareNativeReadout(parts);
    const move = parts.health.SetParent;
    parts.health.SetParent = (parent) => {
      if (reject) throw new Error('temporarily rejected SetParent');
      return move(parent);
    };
  });
  assert.equal(fixture.health.GetParent(), fixture.info);
  assert.equal(fixture.health.style.visibility, 'collapse');
  reject = false;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.style.visibility, 'visible');
  assert.deepEqual(fixture.health.readoutParentWrites, [fixture.row]);
  assert.deepEqual(fixture.health.readoutTextWrites, []);
  for (const panel of [fixture.counter, fixture.counterMax]) assertInactiveReadout(panel);
});

test('accessory margins retain rebased stock coordinates after offsets or bypass', () => {
  for (const classes of [['player', 'enemy'], ['player', 'friend']]) {
    const fixture = makeOwnershipFixture(classes);
    const assertCssMargins = () => {
      assert.equal(fixture.level.style.marginLeft, '27px');
      assert.equal(fixture.level.style.marginTop, '67.5px');
      assert.equal(fixture.unitInfo.style.marginLeft, '50px');
      assert.equal(fixture.unitInfo.style.marginTop, '67px');
    };
    assertCssMargins();
    fixture.update({ levelOffsetX: 100, ultOffsetX: 100 });
    assert.equal(fixture.level.style.marginLeft, '37px');
    assert.equal(fixture.unitInfo.style.marginLeft, '60px');
    assert.equal(fixture.level.style.marginTop, '67.5px');
    assert.equal(fixture.unitInfo.style.marginTop, '67px');
    fixture.update({ levelOffsetY: 100, ultOffsetY: 100 });
    assert.equal(fixture.level.style.marginLeft, '27px');
    assert.equal(fixture.unitInfo.style.marginLeft, '50px');
    assert.equal(fixture.level.style.marginTop, '77.5px');
    assert.equal(fixture.unitInfo.style.marginTop, '77px');
    fixture.update({});
    assertCssMargins();
    fixture.update({ levelOffsetX: 100, ultOffsetY: 100 });
    fixture.update({ enabled: false });
    assertCssMargins();
    fixture.update({ levelOffsetX: 100, ultOffsetY: 100 });
    fixture.world.RemoveClass('player');
    fixture.world.AddClass('minion');
    fixture.update({ npcEnemyEnabled: true, npcAllyEnabled: true });
    assertCssMargins();
  }
});

test('shipped indicator offsets are rigid when anchored and scale only when unanchored', () => {
  assert.equal(contract.defaults.accessoryAnchorEnabled, true);
  for (const [widthScale, heightScale] of [[100, 100], [148, 80]]) {
    const values = { widthScale, heightScale, positionX: 0, positionY: 0,
      ultOffsetX: 74, levelOffsetX: 74, ultOffsetY: 48, levelOffsetY: 48 };
    const anchored = makeOwnershipFixture(['player', 'enemy'], {
      ...values, accessoryAnchorEnabled: true });
    const unanchored = makeOwnershipFixture(['player', 'enemy'], {
      ...values, accessoryAnchorEnabled: false });
    const requested = [anchored, unanchored].map(fixture => ['level', 'unitInfo'].map(key =>
      [parseFloat(fixture[key].style.marginLeft), parseFloat(fixture[key].style.marginTop)]));
    for (const fixture of [anchored, unanchored])
      fixture.update({ ...values, accessoryAnchorEnabled: fixture === anchored,
        ultOffsetX: 0, levelOffsetX: 0, ultOffsetY: 0, levelOffsetY: 0 });
    for (const [index, key] of ['level', 'unitInfo'].entries()) {
      if (widthScale === 100 && heightScale === 100)
        assert.deepEqual(requested[0][index], requested[1][index], key + ' stock-scale equality');
      for (const [axis, property, offset, scale] of [
        [0, 'marginLeft', 7.4, widthScale / 100], [1, 'marginTop', 4.8, heightScale / 100]]) {
        const rigidDelta = requested[0][index][axis] - parseFloat(anchored[key].style[property]);
        const scaledDelta = requested[1][index][axis] - parseFloat(unanchored[key].style[property]);
        assert.ok(Math.abs(scaledDelta - rigidDelta - offset * (scale - 1)) < 0.011,
          key + ' ' + property + ' offset scaling difference');
      }
    }
  }
});

test('indicator offset deltas scale once per bar axis and stay unchanged at 100 percent', () => {
  for (const [widthScale, heightScale] of [[100, 100], [148, 80], [60, 160]]) {
    const values = { widthScale, heightScale, accessoryAnchorEnabled: false,
      ultOffsetX: 0, ultOffsetY: 0, levelOffsetX: 0, levelOffsetY: 0 };
    const fixture = makeOwnershipFixture(['player', 'enemy'], values);
    const before = [fixture.level, fixture.unitInfo].map(panel =>
      [parseFloat(panel.style.marginLeft), parseFloat(panel.style.marginTop)]);
    fixture.update({ ...values, ultOffsetX: 100, ultOffsetY: -100,
      levelOffsetX: 100, levelOffsetY: -100 });
    for (const [index, panel] of [fixture.level, fixture.unitInfo].entries()) {
      assert.ok(Math.abs(parseFloat(panel.style.marginLeft) - before[index][0] - widthScale / 10) < 0.000001);
      assert.ok(Math.abs(parseFloat(panel.style.marginTop) - before[index][1] + heightScale / 10) < 0.000001);
    }
  }
});

const accessoryValues = {
  widthScale: 230, heightScale: 160,
  enemyEnabled: true, enemyMode: 'fixed',
  enemyLow: '#FF0000', enemyMid: '#00FF00', enemyHigh: '#0000FF',
  lowThreshold: 20, highThreshold: 80,
  readoutVisible: true, readoutFormat: 'percent',
  enemyKillMarkerEnabled: true, enemyKillMarkerThreshold: 50, enemyKillMarkerWidth: 1,
};

function measuredGeometry(parts, scaleX, scaleY, unready = []) {
  const zero = new Set(unready);
  for (const [key, width, height, x, y] of [
    ['info', 200, 210, 0, 0], ['status', 200, 210, 0, 0],
    ['window', 200, 210, 0, 0], ['stack', 200, 210, 0, 0], ['primary', 76, 18, 70.5, 65],
    ['inner', 69, 12, 3.5, 3], ['fill', 34.5, 12, 0, 0],
    ['level', 21, 21, 27, 67.5], ['unitInfo', 22, 22, 50, 67],
    ['container', 200, 210, 0, 0], ['row', 48, 24, 0, 0],
  ]) {
    const panel = parts[key];
    panel.actualuiscale_x = scaleX;
    panel.actualuiscale_y = scaleY;
    panel.savedGeometry = [width * scaleX, height * scaleY, x * scaleX, y * scaleY];
    const bounds = zero.has(key) ? [0, 0, 0, 0] : panel.savedGeometry;
    [panel.actuallayoutwidth, panel.actuallayoutheight, panel.actualxoffset, panel.actualyoffset] = bounds;
  }
}

function resolveGeometry(...panels) {
  for (const panel of panels)
    [panel.actuallayoutwidth, panel.actuallayoutheight, panel.actualxoffset, panel.actualyoffset] = panel.savedGeometry;
}

function accessoryResult(fixture) {
  return {
    level: [fixture.level.style.marginLeft, fixture.level.style.marginTop],
    ultimate: [fixture.unitInfo.style.marginLeft, fixture.unitInfo.style.marginTop],
    scale: fixture.stack.style.preTransformScale2d,
    origin: fixture.stack.style.transformOrigin,
    transform: fixture.stack.style.transform,
    marker: [fixture.marker.style.marginLeft, fixture.marker.style.width],
    health: [fixture.counter.text, fixture.fill.style.washColor],
    readout: [fixture.row.style.transform, fixture.row.style.marginLeft, fixture.row.style.marginTop],
  };
}

test('early, late and asymmetric world scales give identical CSS accessory, marker and readout geometry', () => {
  const classes = ['alive', 'player', 'enemy', 'team2', 'WorldUIRoot',
    'has_ultimate', 'CLASS_PLAYER', 'hero_inferno', 'playerIsBot'];
  const early = makeOwnershipFixture(classes, accessoryValues,
    parts => measuredGeometry(parts, 1, 1));
  early.harness.now = 8000; // A second renderer context sees an already-published snapshot.
  const late = makeOwnershipFixture(classes, accessoryValues,
    parts => measuredGeometry(parts, 2, 2), early.harness);
  early.harness.now = 9000;
  const asymmetric = makeOwnershipFixture(classes, accessoryValues,
    parts => measuredGeometry(parts, 2, 3), early.harness);
  const expected = accessoryResult(early);
  assert.deepEqual(expected.level, ['-22.4px', '67.5px']);
  assert.deepEqual(expected.ultimate, ['0.6px', '67px']);
  assert.deepEqual(expected.marker, ['37.5px', '1px']);
  assert.deepEqual(expected.health, ['', '#00FF00']);
  for (const fixture of [late, asymmetric]) {
    assert.deepEqual(accessoryResult(fixture), expected);
    assert.equal(fixture.ultIcon.visible, true, 'stock ready-icon visibility is native-owned');
    assert.equal(fixture.ultIcon.style.visibility, undefined);
    assert.equal(fixture.shield.text, '999');
    assert.deepEqual(fixture.shieldWrites, []);
    assert.equal(fixture.levelLabel.text, '10');
    assert.equal(fixture.levelLabel.style.visibility || '', '');
  }
  const offset = { ...accessoryValues, positionX: -200, positionY: -200 };
  const normalOffset = makeOwnershipFixture(classes, offset, parts => measuredGeometry(parts, 1, 1));
  const scaledOffset = makeOwnershipFixture(classes, offset, parts => measuredGeometry(parts, 2, 3));
  assert.deepEqual(accessoryResult(scaledOffset), accessoryResult(normalOffset));
  // Rigid anchored group: positionY -200 raw (-20px) moves the ult icon by exactly -20px.
  assert.deepEqual([normalOffset.level.style.marginLeft, normalOffset.unitInfo.style.marginTop],
    ['-42.4px', '47px']);
  const defaults = makeOwnershipFixture(classes, {}, parts => measuredGeometry(parts, 2, 3));
  assert.equal(defaults.level.style.marginLeft, '27px');
  assert.equal(defaults.level.style.marginTop, '67.5px');
  assert.equal(defaults.unitInfo.style.marginLeft, '50px');
  assert.equal(defaults.unitInfo.style.marginTop, '67px');
});

test('zero and accessory-only late layout recovers without a config change or another timer', () => {
  const classes = ['player', 'enemy', 'CLASS_PLAYER', 'has_ultimate'];
  const settled = makeOwnershipFixture(classes, accessoryValues, parts => measuredGeometry(parts, 1, 1));
  const expected = accessoryResult(settled);
  for (const zero of [
    ['stack', 'primary', 'inner', 'level', 'unitInfo'],
    ['level', 'unitInfo'],
  ]) {
    const pending = makeOwnershipFixture(classes, accessoryValues,
      parts => measuredGeometry(parts, 2, 3, zero));
    assert.equal(pending.level.style.marginLeft, '27px');
    assert.equal(pending.unitInfo.style.marginLeft, '50px');
    if (zero.length === 2) {
      assert.equal(pending.fill.style.washColor, '#00FF00', 'optional accessories do not block color');
      assert.equal(pending.counter.text, '');
      assert.equal(pending.health.GetParent(), pending.row);
    }
    assert.equal(pending.harness.scheduler.jobs.length, 2, 'reuse scan and paint');
    resolveGeometry(...zero.map(key => pending[key]));
    pending.harness.scheduler.runByDelay(1);
    assert.deepEqual(accessoryResult(pending), expected);
    assert.equal(pending.harness.root.GetAttributeString('hp_colors_v2_config', ''),
      settled.harness.root.GetAttributeString('hp_colors_v2_config', ''));
    assert.equal(pending.harness.scheduler.jobs.length, 2);
  }
});

test('delayed primary, pending hydration and primary replacement recapture ready accessory centers', () => {
  const classes = ['player', 'enemy', 'CLASS_PLAYER', 'has_ultimate'];
  const expected = accessoryResult(makeOwnershipFixture(classes, accessoryValues,
    parts => measuredGeometry(parts, 1, 1)));
  const delayed = makeOwnershipFixture(classes, accessoryValues, parts => {
    measuredGeometry(parts, 2, 3);
    parts.primary.DeleteAsync();
  });
  assert.equal(delayed.unitInfo.style.marginLeft, '',
    'without a primary owner, stock placement remains stylesheet-owned');
  const primary = delayed.stack.add(new MockPanel('UnitHealthbar', { classes: ['UnitHealthbarContainer'] }));
  const inner = primary.add(new MockPanel('UnitHealthbarInner'));
  const fill = inner.add(new MockPanel('unit_healthbar_lagging'));
  primary.add(new MockPanel('UnitHealthbarLines'));
  const marker = primary.add(new MockPanel('hp_colors_kill_marker'));
  measuredGeometry({ ...delayed, primary, inner, fill, marker }, 2, 3);
  delayed.harness.scheduler.runByDelay(1);
  assert.deepEqual(accessoryResult({ ...delayed, primary, inner, fill, marker }), expected);

  const hydrating = makeOwnershipFixture(classes, accessoryValues, parts => {
    measuredGeometry(parts, 2, 3, ['level', 'unitInfo']);
    parts.harness.root.SetAttributeString('hp_colors_v2_hydration', 'pending');
    parts.harness.root.SetAttributeString('hp_colors_v2_config', '');
  });
  resolveGeometry(hydrating.level, hydrating.unitInfo);
  hydrating.harness.scheduler.runByDelay(1);
  assert.equal(hydrating.unitInfo.style.marginLeft, '50px', 'hydration keeps the rebased stock leaf position');
  hydrating.update(accessoryValues);
  assert.deepEqual(accessoryResult(hydrating), expected);

  const replaced = makeOwnershipFixture(classes, accessoryValues, parts => measuredGeometry(parts, 2, 3));
  const old = replaced.primary;
  old.DeleteAsync();
  const nextPrimary = replaced.stack.add(new MockPanel('UnitHealthbar', { classes: ['UnitHealthbarContainer'] }));
  const nextInner = nextPrimary.add(new MockPanel('UnitHealthbarInner'));
  const nextFill = nextInner.add(new MockPanel('unit_healthbar_lagging'));
  nextPrimary.add(new MockPanel('UnitHealthbarLines'));
  const nextMarker = nextPrimary.add(new MockPanel('hp_colors_kill_marker'));
  measuredGeometry({ ...replaced, primary: nextPrimary, inner: nextInner, fill: nextFill, marker: nextMarker }, 2, 3);
  replaced.harness.scheduler.runByDelay(1);
  assert.deepEqual(accessoryResult({ ...replaced, primary: nextPrimary, inner: nextInner,
    fill: nextFill, marker: nextMarker }), expected);
  assert.equal(old.IsValid(), false);
});

test('production renderer has no debug logging, profiling, or temporary probes', () => {
  assert.doesNotMatch(rendererSource,
    /DEBUG_LOG|debugLog|DIAG|diagnos(?:e|tic)|accessoryDiagnostic|profil(?:e|ing)|rootBudget|\$\.Msg/);
  const fixture = makeOwnershipFixture(['player', 'enemy'], accessoryValues,
    parts => measuredGeometry(parts, 2, 3));
  assert.deepEqual(fixture.harness.logs, []);
});

const appearanceOff = {
  criticalIndicatorVisible: false, playerNamesVisible: false,
  enemyEnabled: false, allyEnabled: false,
};
const appearanceMasks = fixture => [
  fixture.primary, fixture.inner, fixture.primary.FindChildTraverse('UnitHealthbarLines'),
];
function assertAppearance(fixture, labels) {
  assert.equal(fixture.window.BHasClass('HPColorsRewriteHideCritical'), labels);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteHidePlayerName'), labels);
  assert.deepEqual(fixture.shieldWrites, []);
}

test('Appearance defaults pass through, players ignore color gates, unit gates never own labels', () => {
  for (const relation of ['enemy', 'friend']) {
    const fixture = makeOwnershipFixture(['player', relation]);
    assertAppearance(fixture, false);
    fixture.update(appearanceOff);
    assertAppearance(fixture, true);
    fixture.update({ ...appearanceOff, enabled: false });
    assertAppearance(fixture, false);
    for (const kind of ['minion', 'building']) {
      const unit = makeOwnershipFixture([kind, relation], appearanceOff);
      assertAppearance(unit, false);
      unit.update({ ...appearanceOff, npcEnemyEnabled: true, npcAllyEnabled: true,
        buildingEnemyEnabled: true, buildingAllyEnabled: true });
      assertAppearance(unit, false);
    }
  }
  for (const classes of [['minion', 'neutral'], ['enemy'], ['player', 'enemy', 'friend'],
    ['npc_creep', 'neutral'], ['npc_creep', 'enemy']]) {
    const fixture = makeOwnershipFixture(classes, {
      ...appearanceOff, npcNeutralEnabled: true, ghoulOpacityEnabled: true,
    });
    assertAppearance(fixture, false);
  }
});

test('Appearance preserves custom and empty inline masks and repairs drift on the scan cadence', () => {
  for (const baseline of ['', 'url("custom-mask.vsvg")']) {
    const fixture = makeOwnershipFixture(['player', 'enemy']);
    // Capture custom baselines in a fresh generation, before ownership.
    const replacement = fixture.primary.add(new MockPanel('UnitHealthbarInner', {
      actuallayoutwidth: 69, style: { opacityMask: baseline },
    }));
    fixture.inner.DeleteAsync();
    replacement.add(new MockPanel('unit_healthbar_lagging', { actuallayoutwidth: 34.5 }));
    fixture.inner = replacement;
    fixture.update({});
    fixture.update(appearanceOff);
    assertAppearance(fixture, true);
    const jobs = fixture.harness.scheduler.jobs.length;
    fixture.window.RemoveClass('HPColorsRewriteHideCritical');
    fixture.window.RemoveClass('HPColorsRewriteHidePlayerName');
    // Drift repair runs on the 1 s scan, not on paint ticks.
    fixture.harness.scheduler.runByDelay(1);
    assertAppearance(fixture, true);
    assert.equal(fixture.harness.scheduler.jobs.length, jobs);
    fixture.update({});
    assert.equal(fixture.inner.style.opacityMask, baseline);
    assert.equal(fixture.primary.style.opacityMask || '', '');
    assert.equal(fixture.window.BHasClass('HPColorsRewriteHideCritical'), false);
  }
});

test('Appearance class failures retry, cache unchanged writes, and never write inline masks', () => {
  for (const silent of [false, true]) {
    let reject = true;
    let classWrites = 0;
    const fixture = makeOwnershipFixture(['player', 'enemy'], appearanceOff, ({ primary, inner, window }) => {
      for (const panel of [window, primary]) {
        for (const method of ['AddClass', 'RemoveClass']) {
          const original = panel[method].bind(panel);
          panel[method] = name => {
            if (name.startsWith('HPColorsRewrite')) {
              classWrites++;
              if (reject) {
                if (silent) return;
                throw new Error('temporary class rejection');
              }
            }
            return original(name);
          };
        }
      }
      for (const panel of [primary, inner, primary.FindChildTraverse('UnitHealthbarLines')]) {
        panel.style = new Proxy({ ...panel.style, opacityMask: 'url("original.vsvg")' }, {
          set(target, key, value) {
            assert.notEqual(key, 'opacityMask');
            target[key] = value === null ? '' : value;
            return true;
          },
        });
      }
    });
    assertAppearance(fixture, false);
    reject = false;
    fixture.harness.scheduler.runByDelay(1);
    assertAppearance(fixture, true);
    const writes = classWrites;
    for (let i = 0; i < 6; i++) fixture.harness.scheduler.runNext();
    assert.equal(classWrites, writes);
    reject = true;
    fixture.update({});
    assertAppearance(fixture, true);
    reject = false;
    fixture.harness.scheduler.runByDelay(1);
    assertAppearance(fixture, false);
    for (const panel of appearanceMasks(fixture))
      assert.equal(panel.style.opacityMask, 'url("original.vsvg")');
  }
});

test('Appearance releases old parts and roots before replacements and teardown', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], appearanceOff);
  const oldLines = appearanceMasks(fixture)[2];
  oldLines.SetParent(fixture.status);
  const lines = fixture.primary.add(new MockPanel('UnitHealthbarLines', {
    style: { opacityMask: 'lines-original' },
  }));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(oldLines.style.opacityMask || '', '');
  assert.equal(lines.style.opacityMask, 'lines-original');
  const oldRoot = fixture.window;
  const newRoot = fixture.world.add(new MockPanel('replacement', { classes: ['WindowRoot'] }));
  fixture.status.SetParent(newRoot);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(oldRoot.BHasClass('HPColorsRewriteHideCritical'), false);
  assert.equal(oldRoot.BHasClass('HPColorsRewriteHidePlayerName'), false);
  assert.equal(newRoot.BHasClass('HPColorsRewriteHideCritical'), true);
  assert.equal(lines.style.opacityMask, 'lines-original');
  // The scheduled paint teardown restores still-valid detached bar panels.
  fixture.status.DeleteAsync = () => {};
  fixture.status.IsValid = () => false;
  fixture.harness.scheduler.runNext();
  assert.equal(newRoot.BHasClass('HPColorsRewriteHideCritical'), false);
  assert.equal(newRoot.BHasClass('HPColorsRewriteHidePlayerName'), false);
  assert.equal(lines.style.opacityMask, 'lines-original');
  assert.equal(fixture.primary.style.opacityMask || '', '');
  assert.equal(fixture.inner.style.opacityMask || '', '');
});

test('Appearance never writes masks or hide classes to shield-first duplicates and siblings', () => {
  const writes = [];
  const fixture = makeOwnershipFixture(['player', 'enemy'], appearanceOff, ({ harness, stack, window }) => {
    const shield = stack.add(new MockPanel('UnitShieldbar', { classes: ['UnitHealthbarContainer'] }));
    // The direct primary lineage must win even when shield IDs are encountered first.
    stack.children.unshift(stack.children.pop());
    const inner = shield.add(new MockPanel('UnitHealthbarInner'));
    const lines = shield.add(new MockPanel('UnitHealthbarLines'));
    const sibling = harness.root.add(new MockPanel('sibling', { classes: ['WindowRoot'] }));
    const retired = window.add(new MockPanel('retired', { classes: ['old_bar'] }));
    retired.add(new MockPanel('UnitHealthbar', { classes: ['UnitHealthbarContainer'] }));
    for (const panel of [shield, inner, lines, sibling, retired]) {
      panel.style = new Proxy(panel.style, {
        set(target, key, value) { if (key === 'opacityMask') writes.push([panel.id, key, value]); target[key] = value; return true; },
      });
      const addClass = panel.AddClass.bind(panel);
      panel.AddClass = name => {
        if (name.startsWith('HPColorsRewrite')) writes.push([panel.id, name]);
        return addClass(name);
      };
    }
  });
  assertAppearance(fixture, true);
  fixture.update({ enabled: false });
  assert.deepEqual(writes, []);
});

// Failure modes: mask leaks onto NONE, master-off, ungated units or teardown;
// inline mask writes clobber engine/external masks; CSS mask escapes the class gate
// or misses one of the three stock mask targets.
test('BAR MASK ORIGINAL owns the stock masks through one reversible root class', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy']);
  const masked = () => fixture.window.BHasClass('HPColorsRewriteBarMask');
  assert.equal(masked(), false, 'shipped NONE stays rectangular');
  fixture.update({ barMask: 'original' });
  assert.equal(masked(), true);
  fixture.update({ barMask: 'original', enabled: false });
  assert.equal(masked(), false, 'master-off releases the mask');
  fixture.update({ barMask: 'original' });
  assert.equal(masked(), true);
  fixture.update({ barMask: 'none' });
  assert.equal(masked(), false);
  for (const panel of [fixture.primary, fixture.inner, fixture.primary.FindChildTraverse('UnitHealthbarLines')])
    assert.equal(panel.style.opacityMask || '', '', 'no inline mask writes');
  const unit = makeOwnershipFixture(['building', 'enemy'], { barMask: 'original' });
  assert.equal(unit.window.BHasClass('HPColorsRewriteBarMask'), false, 'ungated units stay stock');
  unit.update({ barMask: 'original', buildingEnemyEnabled: true });
  assert.equal(unit.window.BHasClass('HPColorsRewriteBarMask'), true);
  fixture.update({ barMask: 'original' });
  fixture.status.DeleteAsync = () => {};
  fixture.status.IsValid = () => false;
  fixture.harness.scheduler.runNext();
  assert.equal(masked(), false, 'teardown releases the mask');
  const css = fs.readFileSync(path.resolve(sourceRoot, '../styles/unit_status_v2.css'), 'utf8').replace(/\r\n/g, '\n');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , body]) => /opacity-mask\s*:/.test(body));
  assert.equal(rules.length, 3, "stock masks plus primary outline mask release and masked backer");
  assert.match(rules[1][1], /#UnitHealthbar\.HPColorsRewriteBarOutline/);
  assert.equal(rules[1][2].trim(), "opacity-mask: none;");
  assert.match(rules[2][1], /#UnitHealthbar #HPV2BarOutline/);
  assert.match(rules[2][2], /healthbar_backer_horiz_mask_flipped\.vsvg/);
  const selectors = rules[0][1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(selector => selector.trim());
  assert.deepEqual(selectors, [
    '.WindowRoot.HPColorsRewriteBarMask .UnitHealthbarContainer',
    '.WindowRoot.HPColorsRewriteBarMask #UnitHealthbarInner',
    '.WindowRoot.HPColorsRewriteBarMask #UnitHealthbarLines',
  ]);
  assert.equal(rules[0][2].trim(),
    'opacity-mask: url("s2r://panorama/images/hud/healthbar/healthbar_backer_horiz_mask_flipped.vsvg");');
});

// Engine fact (IDA 6711 CCitadelHudUtils::UpdateTickBar): floor(max/250) lines, none above
// 50; line k sits at style position x = 250k/max * 100% of #UnitHealthbarLines.
function setEngineLines(lines, max, scale = 1, width = 69) {
  for (const child of [...lines.children]) child.DeleteAsync();
  lines.actuallayoutwidth = width * scale;
  lines.actualuiscale_x = scale;
  const count = Math.floor(max / 250);
  for (let k = 1; count <= 50 && k <= count; k++)
    lines.add(new MockPanel('', { classes: [k % 4 ? 'line_small' : 'line_large'],
      actualxoffset: 250 * k / max * width * scale, actualuiscale_x: scale }));
}

function makeOldFixture(max, values = {}, classes = ['player', 'enemy'], scale = 2) {
  return makeOwnershipFixture(classes, { barMask: 'old', ...values }, ({ primary }) => {
    setEngineLines(primary.FindChildTraverse('UnitHealthbarLines'), max, scale);
    const grid = primary.add(new MockPanel('HPV2PipGrid'));
    grid.add(new MockPanel('HPV2PipEmpty'));
    grid.add(new MockPanel('HPV2PipFill'));
  });
}

const gridOf = fixture => fixture.primary.FindChildTraverse('HPV2PipGrid');
const layerOf = (fixture, id) => fixture.primary.FindChildTraverse(id).children;
const shownPips = (fixture, id) => layerOf(fixture, id).filter(child => child.style.visibility !== 'collapse');
const layerWrites = (fixture, id) => layerOf(fixture, id).reduce((sum, child) => sum + child.__styleWrites.length, 0);

// Failure modes: wrong max from lines (uiscale, last line, multiples of 250); wrong pip
// order/rows (first 100 HP must be bottom-left, 10 per row, drain from top-right); rows not
// compressed past four; last pip not sized to its capacity; partial pip wrong; every pip
// rewritten on each HP change; empty layer touched by health; fill color not following the
// bar; invalid line sets (none, zero layout, >50 lines) not falling back to engine lines.
test('OLD draws a 10-per-row 100-HP pip grid from engine lines and updates only touched pips', () => {
  const fixture = makeOldFixture(2900);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarOld'), true);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarPips'), true);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarMask'), false);
  const empty = shownPips(fixture, 'HPV2PipEmpty');
  assert.equal(empty.length, 29, 'ceil(2900/100) pips');
  assert.equal(gridOf(fixture).style.height, '18px', 'three rows of 6px');
  assert.equal(empty[0].style.position, '0.000% 66.667% 0px', 'first 100 HP bottom-left');
  assert.equal(empty[10].style.position, '0.000% 33.333% 0px');
  assert.equal(empty[28].style.position, '80.000% 0.000% 0px', 'last pip top row');
  for (const pip of empty) {
    assert.equal(pip.BHasClass('HPV2Pip'), true);
    assert.equal(pip.style.width, '8.500%');
    assert.equal(pip.style.height, '26.667%');
  }
  let fill = shownPips(fixture, 'HPV2PipFill');
  assert.equal(fill.length, 15, '1,450 HP: 14 full pips and one half pip');
  assert.equal(fill[13].style.width, '8.500%');
  assert.equal(fill[14].style.width, '4.250%');
  assert.equal(fill[14].style.position, empty[14].style.position);
  assert.ok(fixture.fill.style.washColor);
  assert.equal(fixture.primary.FindChildTraverse('HPV2PipFill').style.washColor, fixture.fill.style.washColor);
  const emptyWrites = layerWrites(fixture, 'HPV2PipEmpty');
  let fillWrites = layerWrites(fixture, 'HPV2PipFill');
  fixture.fill.actuallayoutwidth = 31.05;
  fixture.harness.scheduler.runByDelay(1);
  fill = shownPips(fixture, 'HPV2PipFill');
  assert.equal(fill.length, 14, '1,305 HP');
  assert.equal(fill[13].style.width, '0.425%');
  assert.ok(layerWrites(fixture, 'HPV2PipFill') - fillWrites <= 4, 'only the two touched pips change');
  assert.equal(layerWrites(fixture, 'HPV2PipEmpty'), emptyWrites, 'health never touches the empty layer');
  fillWrites = layerWrites(fixture, 'HPV2PipFill');
  for (let i = 0; i < 6; i++) fixture.harness.scheduler.runNext();
  assert.equal(layerWrites(fixture, 'HPV2PipFill'), fillWrites, 'idle ticks write nothing');
  assert.equal(layerWrites(fixture, 'HPV2PipEmpty'), emptyWrites);
  const lines = fixture.primary.FindChildTraverse('UnitHealthbarLines');
  setEngineLines(lines, 2850, 2);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(shownPips(fixture, 'HPV2PipEmpty')[28].style.width, '4.250%', 'last pip holds 50 HP');
  setEngineLines(lines, 4500, 2);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(shownPips(fixture, 'HPV2PipEmpty').length, 45);
  assert.equal(gridOf(fixture).style.height, '24px', 'five rows compress into four rows of height');
  assert.equal(shownPips(fixture, 'HPV2PipEmpty')[0].style.height, '16.000%');
  setEngineLines(lines, 3000, 2);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(shownPips(fixture, 'HPV2PipEmpty').length, 30, 'a 250-multiple max puts the last line at 100%');
  assert.equal(layerOf(fixture, 'HPV2PipEmpty').length, 45, 'pool keeps, collapses extras');
  for (const [max, label] of [[200, 'no lines below 250 HP'], [13000, 'engine draws no lines above 50']]) {
    setEngineLines(lines, max, 2);
    fixture.harness.scheduler.runByDelay(1);
    assert.equal(fixture.window.BHasClass('HPColorsRewriteBarPips'), false, label);
    assert.equal(fixture.window.BHasClass('HPColorsRewriteBarOld'), true, label);
  }
  setEngineLines(lines, 2900, 2);
  lines.actuallayoutwidth = 0;
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarPips'), false, 'layout not ready');
  lines.actuallayoutwidth = 138;
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarPips'), true, 'recovers on the existing cadence');
});

// Failure modes: anchored ult/level stay on the hidden bar's centre instead of the grid's,
// the lift ignores row count/height scale, or leaks into V1 or unanchored placement.
test('OLD centres anchored ult and level icons on the pip grid', () => {
  const top = panel => Number.parseFloat(panel.style.marginTop);
  const fixture = makeOldFixture(2900, { barMask: 'none', heightScale: 100 });
  const v1 = [top(fixture.level), top(fixture.unitInfo)];
  fixture.update({ barMask: 'old', heightScale: 100 });
  // Three 6px rows sit 2.5px above the bar bottom: centre 2.5px above the bar centre.
  assert.deepEqual([top(fixture.level), top(fixture.unitInfo)], v1.map(value => value - 2.5));
  setEngineLines(fixture.primary.FindChildTraverse('UnitHealthbarLines'), 4500, 2);
  fixture.harness.scheduler.runByDelay(1);
  assert.deepEqual([top(fixture.level), top(fixture.unitInfo)], v1.map(value => value - 5.5), 'four-row height');
  fixture.update({ barMask: 'old', heightScale: 200 });
  fixture.update({ barMask: 'none', heightScale: 200 });
  const tall = [top(fixture.level), top(fixture.unitInfo)];
  fixture.update({ barMask: 'old', heightScale: 200 });
  assert.deepEqual([top(fixture.level), top(fixture.unitInfo)], tall.map(value => value - 11), 'lift scales with height');
  fixture.update({ barMask: 'old', heightScale: 200, accessoryAnchorEnabled: false });
  const loose = [top(fixture.level), top(fixture.unitInfo)];
  fixture.update({ barMask: 'none', heightScale: 200, accessoryAnchorEnabled: false });
  assert.deepEqual([top(fixture.level), top(fixture.unitInfo)], loose, 'unanchored icons keep stock placement');
});

// Failure modes: the name stays under taller OLD grids; the lift ignores rows past the
// first, the four-row cap or height scale; it leaks into V1/master-off/toggle-off; it
// drops the player's own Y offset; turning it off leaves the lift behind.
test('OLD lifts the player name one 6px row per extra 1,000 max HP when enabled', () => {
  const on = { barMask: 'old', nameRiseWithPips: true, heightScale: 100 };
  let name;
  const fixture = makeOwnershipFixture(['player', 'enemy'], on, ({ primary, window }) => {
    setEngineLines(primary.FindChildTraverse('UnitHealthbarLines'), 900, 2);
    const grid = primary.add(new MockPanel('HPV2PipGrid'));
    grid.add(new MockPanel('HPV2PipEmpty'));
    grid.add(new MockPanel('HPV2PipFill'));
    Object.assign(window, { actuallayoutwidth: 200, actuallayoutheight: 210 });
    name = window.add(new MockPanel('HPV2NameAnchor')).add(new MockPanel('name', { actuallayoutwidth: 60, actuallayoutheight: 20, text: 'Hero' }));
  });
  const lift = () => name.style.transform || '';
  assert.equal(lift(), '', 'one row keeps the default position');
  const lines = fixture.primary.FindChildTraverse('UnitHealthbarLines');
  setEngineLines(lines, 2900, 2);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(lift(), 'translate3d(0px, -12px, 0px)', 'three rows: two rows up');
  setEngineLines(lines, 4500, 2);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(lift(), 'translate3d(0px, -18px, 0px)', 'grid stops growing at four rows');
  fixture.update({ ...on, heightScale: 200 });
  assert.equal(lift(), 'translate3d(0px, -36px, 0px)', 'scales with bar height');
  fixture.update({ ...on, nameOffsetY: 10 });
  assert.equal(lift(), 'translate3d(0px, -8px, 0px)', 'adds to the name Y offset');
  fixture.update({ ...on, nameRiseWithPips: false });
  assert.equal(lift(), '', 'toggle off keeps the name where it is');
  fixture.update({ ...on, barMask: 'none' });
  assert.equal(lift(), '', 'V1 never lifts');
  fixture.update({ ...on, enabled: false });
  assert.equal(lift(), '', 'master off restores stock');
});

// Failure modes: a compact transformed frame clips noclip children to its own
// bounds in game (HP text and level badge cut while shaking); the name stays still.
test('damage wiggle animates one full-canvas frame holding bar, HP text and name', () => {
  const xml = fs.readFileSync(path.resolve(sourceRoot, '../layout/unit_status_overlay_v2.xml'), 'utf8');
  assert.match(xml, /<Panel id="HPV2MotionFrame"[^>]*hittest="false"[^>]*>\s*<Panel id="HPV2NameAnchor"[^>]*>\s*<Label id="name" text="\{s:name\}" \/>/);
  const css = fs.readFileSync(path.resolve(sourceRoot, '../styles/unit_status_v2.css'), 'utf8').replace(/\r\n/g, '\n');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(selector => selector.trim()),
    body,
  }));
  const frame = rules.find(rule => rule.selectors.includes('.WindowRoot #HPV2MotionFrame'));
  assert.match(frame.body, /width:\s*100%;[\s\S]*height:\s*100%;/, 'frame covers the whole canvas');
  assert.match(frame.body, /transform-origin:\s*50% 40\.48%;/, 'stock bar pivot');
  assert.equal(rules.some(rule => rule.selectors.some(selector => /#HPV2MotionFrame #/.test(selector))), false,
    'children need no compact-frame compensation');
  const selectorsWith = pattern => rules.filter(rule => pattern.test(rule.body)).flatMap(rule => rule.selectors);
  const wiggles = selectorsWith(/animation-name:\s*active_damage_wiggle/);
  const still = selectorsWith(/animation-name:\s*none/);
  for (const target of ['.WindowRoot #HPV2MotionFrame']) {
    assert.ok(wiggles.includes('.active_damage ' + target), target + ' wiggles');
    for (const kind of ['boss_barracks', 'boss_tier1', 'boss_tier2', 'building'])
      assert.ok(still.includes('.' + kind + '.active_damage ' + target), kind + ' keeps ' + target + ' still');
  }
  assert.equal(wiggles.some(selector => /#name\b/.test(selector)), false, 'the name label keeps its inline transform');
  for (const id of ['InfoHealthContainer', 'hp_counter_container', 'HPV2NameAnchor'])
    assert.equal(wiggles.some(selector => selector.includes('#' + id)), false, id + ' stays static');
});

// Failure modes: the stock 3deg default gains a class; OFF/strength classes stack or leak
// after returning to 3, master-off or on ungated units; cached classes miss a re-add.
test('damage shake owns one reversible root class per setting and none at stock', () => {
  const shakeClasses = root => root.classes
    ? [...root.classes].filter(name => /^HPColorsRewriteShake/.test(name)).sort()
    : ['HPColorsRewriteShakeOff', ...Array.from({ length: 10 }, (_, i) => 'HPColorsRewriteShake' + (i + 1))]
      .filter(name => root.BHasClass(name));
  const fixture = makeOwnershipFixture(['player', 'enemy'], { enabled: true });
  assert.deepEqual(shakeClasses(fixture.window), [], 'default keeps the stock wiggle');
  fixture.update({ enabled: true, damageShakeEnabled: false });
  assert.deepEqual(shakeClasses(fixture.window), ['HPColorsRewriteShakeOff']);
  fixture.update({ enabled: true, damageShakeIntensity: 7 });
  assert.deepEqual(shakeClasses(fixture.window), ['HPColorsRewriteShake7']);
  fixture.update({ enabled: true, damageShakeIntensity: 10 });
  assert.deepEqual(shakeClasses(fixture.window), ['HPColorsRewriteShake10']);
  fixture.update({ enabled: true, damageShakeIntensity: 3 });
  assert.deepEqual(shakeClasses(fixture.window), []);
  fixture.update({ enabled: false, damageShakeIntensity: 7 });
  assert.deepEqual(shakeClasses(fixture.window), [], 'master off restores stock');
  fixture.update({ enabled: true, damageShakeIntensity: 7 });
  assert.deepEqual(shakeClasses(fixture.window), ['HPColorsRewriteShake7'], 're-enabling re-adds the class');
  const ungated = makeOwnershipFixture(['CLASS_TROOPER', 'enemy'],
    { enabled: true, npcEnemyEnabled: false, damageShakeEnabled: false });
  assert.deepEqual(shakeClasses(ungated.window), [], 'ungated units keep stock');
  ungated.update({ enabled: true, npcEnemyEnabled: false, damageShakeIntensity: 7 });
  assert.deepEqual(shakeClasses(ungated.window), []);
});

// Failure modes: a strength has no keyframes or misses a target; OFF leaves one target
// shaking; shake rules outrank or follow the objective rule so buildings/bosses shake.
test('damage shake CSS covers every strength and objectives still never shake', () => {
  const css = fs.readFileSync(path.resolve(sourceRoot, '../styles/unit_status_v2.css'), 'utf8').replace(/\r\n/g, '\n');
  const flat = css.replace(/@keyframes '[^']+'\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const rules = [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body], index) => ({
    selectors: selectors.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(selector => selector.trim()),
    body, index,
  }));
  const objective = rules.find(rule => rule.selectors.includes('.building.active_damage .WindowRoot #HPV2MotionFrame'));
  assert.match(objective.body, /animation-name:\s*none/);
  const targets = cls => ['.active_damage .WindowRoot.' + cls + ' #HPV2MotionFrame'];
  for (let degrees = 1; degrees <= 10; degrees++) {
    if (degrees === 3) continue;
    const frames = css.match(new RegExp("@keyframes 'hpv2_shake_" + degrees + "'\\s*\\{([\\s\\S]*?)\\n\\}"));
    assert.ok(frames, degrees + ' has keyframes');
    assert.match(frames[1], new RegExp('50%\\s*\\{\\s*transform: rotateZ\\(-' + degrees + 'deg\\)'));
    const rule = rules.find(r => new RegExp('animation-name:\\s*hpv2_shake_' + degrees + ';').test(r.body));
    assert.ok(rule, degrees + ' has a rule');
    for (const target of targets('HPColorsRewriteShake' + degrees)) assert.ok(rule.selectors.includes(target), target);
    assert.ok(rule.index < objective.index, degrees + ' stays before the objective rule');
  }
  const off = rules.find(rule => rule.selectors.includes(targets('HPColorsRewriteShakeOff')[0]));
  assert.match(off.body, /animation-name:\s*none/);
  for (const target of targets('HPColorsRewriteShakeOff')) assert.ok(off.selectors.includes(target), target);
  assert.ok(off.index < objective.index);
  assert.equal(rules.some(rule => /HPColorsRewriteShake/.test(rule.selectors.join()) &&
    rule.selectors.some(selector => /#name\b/.test(selector))), false, 'never animate #name');
});

// Failure modes: OLD classes leak after V1/V2, master-off, ungated units or teardown;
// SHOW HEALTH LINES off hides the gaps; line color/opacity ownership fights the gap CSS;
// a missing separator container blocks painting or schedules retries.
test('OLD owns reversible root classes, forces lines visible and releases line styling', () => {
  const fixture = makeOldFixture(2900, { pipsVisible: false, enemyPipColorEnabled: true, pipOpacity: 40 });
  const lines = fixture.primary.FindChildTraverse('UnitHealthbarLines');
  assert.notEqual(lines.style.visibility, 'collapse', 'gaps stay with health lines off');
  assert.equal(lines.style.opacity || '', '');
  for (const child of lines.children) assert.equal(child.style.washColor || '', '');
  fixture.update({ barMask: 'original' });
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarOld'), false);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarPips'), false);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarMask'), true);
  fixture.update({ barMask: 'old', enabled: false });
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarOld'), false);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarPips'), false);
  fixture.update({ barMask: 'old' });
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarPips'), true);
  fixture.status.DeleteAsync = () => {};
  fixture.status.IsValid = () => false;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarOld'), false, 'teardown releases');
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarPips'), false);
  const unit = makeOldFixture(2900, {}, ['building', 'enemy']);
  assert.equal(unit.window.BHasClass('HPColorsRewriteBarOld'), false, 'ungated units stay stock');
  unit.update({ barMask: 'old', buildingEnemyEnabled: true });
  assert.equal(unit.window.BHasClass('HPColorsRewriteBarPips'), true);
  const bare = makeOwnershipFixture(['player', 'enemy'], { barMask: 'old' }, ({ primary }) =>
    setEngineLines(primary.FindChildTraverse('UnitHealthbarLines'), 2900));
  assert.equal(bare.window.BHasClass('HPColorsRewriteBarOld'), true);
  assert.equal(bare.window.BHasClass('HPColorsRewriteBarPips'), true, 'grid is created lazily');
  const jobs = bare.harness.scheduler.jobs.length;
  bare.harness.scheduler.runNext();
  assert.equal(bare.harness.scheduler.jobs.length, jobs, 'no retry loop');
});

test('OLD CSS draws the grid over a hidden bar and stays class-gated', () => {
  const css = fs.readFileSync(path.resolve(sourceRoot, '../styles/unit_status_v2.css'), 'utf8').replace(/\r\n/g, '\n');
  const owned = css.split('/* Rewrite-owned additions')[1];
  const rule = selector => {
    const match = owned.match(new RegExp('(?:^|\\n)' + selector.replace(/[.#]/g, '\\$&').replace(/ /g, '\\s+') + '[^{]*\\{([^}]*)\\}'));
    assert.ok(match, selector);
    return match[1];
  };
  const box = rule('.WindowRoot.HPColorsRewriteBarOld #UnitHealthbar #UnitHealthbarLines');
  for (const declaration of ['width: 69px', 'height: 12px', 'margin-left: 6px', 'margin-top: 3.5px'])
    assert.match(box, new RegExp(declaration.replace('.', '\\.')));
  assert.match(rule('.WindowRoot.HPColorsRewriteBarOld #UnitHealthbar #UnitHealthbarInner'), /background-color: #182123;/);
  assert.match(rule('#HPV2PipGrid'), /visibility: collapse;/);
  const grid = rule('.WindowRoot.HPColorsRewriteBarOld.HPColorsRewriteBarPips #UnitHealthbar #HPV2PipGrid');
  for (const declaration of [/visibility: visible;/, /vertical-align: bottom;/, /overflow: noclip;/]) assert.match(grid, declaration);
  assert.match(rule('.WindowRoot.HPColorsRewriteBarOld.HPColorsRewriteBarPips #UnitHealthbar #UnitHealthbarInner'), /opacity: 0;/);
  assert.match(rule('#HPV2PipEmpty .HPV2Pip'), /background-color: #182123;/);
  assert.match(rule('#HPV2PipFill .HPV2Pip'), /background-color: white;/);
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/HPColorsRewriteBarOld|HPV2Pip/.test(selector)) continue;
    assert.ok(css.indexOf(selector) > css.indexOf('/* Rewrite-owned additions'), selector);
    assert.doesNotMatch(body, /opacity-mask|box-shadow|transition/);
  }
});

// Failure modes: bars left stock by an off UNITS toggle (or master off) keep re-reading and
// re-checking styles every paint tick; dormancy survives a toggle-on or a reclassification;
// a canvas resize while dormant leaves stock labels at stale coordinates.
test('bars left stock by their UNITS toggle go dormant until config, class or canvas changes', () => {
  const fixture = makeOwnershipFixture(['building', 'enemy'], { widthScale: 150 });
  fixture.harness.scheduler.runFor(3000);
  const counts = {};
  const lines = fixture.primary.FindChildTraverse('UnitHealthbarLines');
  for (const panel of [fixture.stack, lines, fixture.primary, fixture.inner, fixture.fill]) panel.operationCounts = counts;
  fixture.harness.scheduler.runFor(10000);
  assert.equal(counts.styleReads || 0, 0, 'dormant bars read no bar styles');
  assert.equal(counts.styleWrites || 0, 0);
  assert.equal(fixture.stack.style.preTransformScale2d || '', '');
  fixture.update({ widthScale: 150, buildingEnemyEnabled: true });
  assert.equal(fixture.stack.style.preTransformScale2d, '1.5, 1', 'toggle on wakes the bar');
  fixture.update({ widthScale: 150 });
  assert.equal(fixture.stack.style.preTransformScale2d || '', '', 'toggle off restores stock');
  fixture.world.RemoveClass('building');
  fixture.world.AddClass('player');
  fixture.harness.scheduler.runFor(2000);
  assert.equal(fixture.stack.style.preTransformScale2d, '1.5, 1', 'reclassification wakes the bar');
  fixture.world.RemoveClass('player');
  fixture.world.AddClass('building');
  fixture.harness.scheduler.runFor(3000);
  const before = fixture.level.style.marginLeft;
  fixture.info.actuallayoutwidth = 300;
  fixture.harness.scheduler.runFor(2000);
  assert.notEqual(fixture.level.style.marginLeft, before, 'canvas resize still rebases stock labels');
});

// Failure modes: neutral objectives (Sinner's Sacrifice vault) or a building that also carries a
// neutral/creature fact receive the NEUTRAL camp fill instead of staying stock.
test('neutral objectives and buildings never take the NEUTRAL camp fill', () => {
  const values = { npcNeutralEnabled: true, neutralColor: '#123456', widthScale: 150 };
  const camp = makeOwnershipFixture(['neutral_weak', 'team_neutral'], values);
  assert.equal(camp.fill.style.washColor, '#123456', 'camps keep the fill');
  for (const classes of [['neutral_vault', 'team_neutral'], ['building', 'creature', 'team_neutral'],
    ['boss_tier1', 'team_neutral', 'creature']]) {
    const unit = makeOwnershipFixture(classes, values);
    assert.notEqual(unit.fill.style.washColor, '#123456', classes.join(' '));
    assert.equal(unit.stack.style.preTransformScale2d || '', '', classes.join(' '));
  }
});

const timerSource = fs.readFileSync(path.join(sourceRoot, 'test_topbar_pickups.js'), 'utf8');

// The overlay layout root is the shared context of the renderer and the timer script.
function bootTimers(classes, values = {}) {
  const fixture = makeOwnershipFixture(classes, values, ({ window, ultOverlay }) => {
    window.add(new MockPanel('HPV2NameAnchor')).add(new MockPanel('name', { text: 'HAZE' }));
    ultOverlay.add(new MockPanel('HPV2UltimateDark'));
    ultOverlay.add(new MockPanel('HPV2UltimateFill'));
  });
  for (const key of ['HPV2GetNormalizedConfig', 'HPV2OnConfigChanged', 'HPV2GetUltimateProgressColor', 'HPV2OnWake'])
    fixture.world[key] = fixture.status[key];
  fixture.harness.contextPanel = fixture.world;
  runInVm('globalThis.__parses = 0; JSON.parse = (parse => function () { globalThis.__parses++; ' +
    'return parse.apply(this, arguments); })(JSON.parse);', fixture.context);
  const rendererEntry = fixture.harness.handlerEntries.find(item => item.channel === 'ClientUI_FireOutput');
  const before = fixture.harness.handlerEntries.length;
  runInVm(timerSource, fixture.context);
  // World contexts keep one listener: the renderer's, which routes timer
  // traffic to the hook the timer script registers on its context.
  assert.equal(fixture.harness.handlerEntries.slice(before)
    .filter(item => item.channel === 'ClientUI_FireOutput').length, 0);
  assert.equal(typeof fixture.world.HPV2OnPickupMessage, 'function');
  fixture.status.HPV2OnPickupMessage = fixture.world.HPV2OnPickupMessage;
  fixture.timerEvent = message => rendererEntry.fn(JSON.stringify(message));
  fixture.parses = () => runInVm('globalThis.__parses', fixture.context);
  return fixture;
}

const ultimateSnapshot = (fixture, players) => ({ magic_word: 'HPV2_ULTIMATE_SNAPSHOT', since: 0, at: fixture.harness.now, players: players.map(entry => entry.length === 2 ? [...entry, 0] : entry) });

// Failure modes: every native tick broadcasts; prediction freezes or declares ready early.
test('ultimate cooldowns broadcast sparsely and animate locally without stepping', () => {
  const harness = createPanoramaHarness();
  const topbar = harness.root.add(new MockPanel('TopBar', { classes: ['HPV2PickupTopBar'] }));
  const owner = topbar.add(new MockPanel('Player', { paneltype: 'CitadelHudTopBarPlayer', classes: ['UltimateUnlocked'] }));
  owner.add(new MockPanel('PlayerName', { text: 'HAZE', classes: ['PlayerName'] }));
  const native = owner.add(new MockPanel('UltimateStatus')).add(new MockPanel('UltimateStatusBG', { style: { clip: 'radial(50% 50%, 0deg, 0deg)' } }));
  topbar.SetAttributeString('hp_colors_v2_config', JSON.stringify({ magic_word: 'HP_COLORS_V2_CONFIG', version: 2, revision: 1, values: { pickupTimersEnabled: false } }));
  harness.contextPanel = topbar;
  const context = createVmContext(harness);
  runInVm(contractSource, context);
  runInVm(timerSource, context);
  const messages = () => harness.dispatches.filter(event => String(event[1]).includes('HPV2_ULTIMATE_SNAPSHOT')).map(event => JSON.parse(event[1]));
  for (let second = 1; second < 60; second++) {
    native.style.clip = 'radial(50% 50%, 0deg, ' + second * 6 + 'deg)';
    harness.scheduler.runFor(1000);
  }
  assert.equal(messages().length, 31, 'first moving rate then 2 s heartbeats, not 60 broadcasts');
  assert.deepEqual(messages()[1].players, [['HAZE', 6, 6]], 'moving rate publishes at the first 1 s sample');
  const hero = bootTimers(['player', 'enemy', 'CLASS_PLAYER']);
  hero.ultIcon.visible = false;
  hero.timerEvent(ultimateSnapshot(hero, [['HAZE', 90, 6]]));
  const fill = hero.ultOverlay.FindChildTraverse('HPV2UltimateFill');
  const paints = () => hero.harness.scheduler.jobs.filter(job => job.fn.name === 'paintUltimateProgress');
  assert.deepEqual(paints().map(job => job.delay), [1], 'one local repaint per second, not 20 Hz');
  hero.harness.scheduler.runFor(1000);
  assert.equal(fill.style.clip, 'radial(50% 50%, 0deg, 96deg)', 'drawn angle is not quantized');
  hero.timerEvent(ultimateSnapshot(hero, [['HAZE', 359, 6]]));
  hero.harness.scheduler.runFor(1000);
  assert.equal(fill.style.clip, 'radial(50% 50%, 0deg, 359.999deg)');
  hero.timerEvent(ultimateSnapshot(hero, [['HAZE', 360, 0]]));
  assert.equal(hero.ultOverlay.style.visibility, 'collapse', 'only authoritative ready ends the ring');
  hero.harness.scheduler.runFor(1000);
  assert.equal(paints().length, 0, 'ready retires local animation');
  hero.timerEvent(ultimateSnapshot(hero, [['HAZE', 90, 6]]));
  hero.update({ ultimateTimerEnabled: false });
  hero.harness.scheduler.runFor(1000);
  assert.equal(paints().length, 0, 'ULTIMATE off quiesces animation');
  const delayed = bootTimers(['player', 'enemy', 'CLASS_PLAYER']);
  delayed.ultIcon.visible = false;
  delayed.harness.now = 8000;
  delayed.timerEvent({ ...ultimateSnapshot(delayed, [['HAZE', 90, 6]]), at: 0 });
  assert.equal(delayed.ultOverlay.FindChildTraverse('HPV2UltimateFill').style.clip, 'radial(50% 50%, 0deg, 138deg)', 'elapsed starts at snapshot at, not receipt');
  delayed.harness.scheduler.runFor(4000);
  assert.equal(delayed.ultOverlay.style.visibility, 'collapse', 'stale prediction expires at 12 s');
});


// Failure modes: ULTIMATE SIZE applies only while the cooldown ring shows, the ready icon
// snaps back when a cooldown ends, the feature-off/stock scale is not restored, and
// troopers/buildings/camps still decode the 1 Hz topbar snapshot or keep pickup state.
test('ULTIMATE SIZE scales the ready ult icon and only hero bars decode timer traffic', () => {
  const hero = bootTimers(['player', 'enemy', 'CLASS_PLAYER'], { ultimateTimerSize: 150 });
  const scale = () => hero.ultBackground.style.preTransformScale2d;
  assert.equal(scale(), '1.5', 'ready ult icon uses ULTIMATE SIZE without a cooldown');
  hero.ultIcon.visible = false;
  hero.timerEvent(ultimateSnapshot(hero, [['HAZE', 120]]));
  assert.equal(hero.ultOverlay.style.visibility, 'visible');
  assert.equal(scale(), '1.5');
  hero.ultIcon.visible = true;
  hero.timerEvent(ultimateSnapshot(hero, [['HAZE', 360]]));
  assert.equal(hero.ultOverlay.style.visibility, 'collapse');
  assert.equal(scale(), '1.5', 'base keeps the size after the cooldown ends');
  hero.update({ ultimateTimerSize: 80 });
  assert.equal(scale(), '0.8');
  hero.update({ ultimateTimerSize: 80, ultimateTimerEnabled: false });
  assert.equal(scale(), '1', 'feature off restores the stock scale');
  const decoded = hero.parses();
  hero.timerEvent(ultimateSnapshot(hero, [['HAZE', 120]]));
  assert.equal(hero.parses(), decoded + 1, 'hero bars still decode');

  for (const classes of [['building', 'enemy'], ['CLASS_TROOPER', 'friend'], ['neutral_weak']]) {
    const unit = bootTimers(classes, { ultimateTimerSize: 150 });
    const parses = unit.parses();
    unit.timerEvent(ultimateSnapshot(unit, [['HAZE', 120]]));
    unit.timerEvent({ magic_word: 'HPV2_PICKUP_SCAN_GATE', scan: true, at: unit.harness.now, since: 0, localName: '' });
    unit.harness.scheduler.runFor(3000);
    assert.equal(unit.parses(), parses, classes.join(' ') + ' never decodes timer traffic');
    assert.equal(unit.ultBackground.style.preTransformScale2d || '', '', classes.join(' ') + ' ult untouched');
  }
});

// Failure modes: cached scan parts hide a late optional part, or cached unit
// facts miss a reused panel's relation change or a fact that appears on an
// ancestor which carried none on the last full walk.
test('scan caching still detects late optional parts and reused-panel class changes', () => {
  const values = { playerNamesVisible: true, nameOutlineWidth: 8 };
  const early = makeOwnershipFixture(['player', 'enemy'], values, ({ window }) =>
    window.add(new MockPanel('HPV2NameAnchor')).add(new MockPanel('name', { text: 'HAZE' })));
  const expected = early.window.FindChildTraverse('name').style.textShadow;
  assert.equal(expected, '0px 0px 0px 8 #10130Dee');
  const late = makeOwnershipFixture(['player', 'enemy'], values, ({ window }) =>
    window.add(new MockPanel('HPV2NameAnchor')));
  for (let index = 0; index < 3; index++) late.harness.scheduler.runByDelay(1);
  const name = late.window.FindChildTraverse('HPV2NameAnchor').add(new MockPanel('name', { text: 'HAZE' }));
  for (let index = 0; index < 5; index++) late.harness.scheduler.runByDelay(1);
  assert.equal(name.style.textShadow, expected, 'late name found by the periodic full resolve');

  const reused = makeOwnershipFixture(['player', 'enemy'], {});
  for (let index = 0; index < 2; index++) reused.harness.scheduler.runByDelay(1);
  assert.equal(reused.window.BHasClass('HPColorsRewriteEnemyPlayer'), true);
  reused.world.RemoveClass('enemy');
  reused.world.AddClass('friend');
  reused.harness.scheduler.runByDelay(1);
  assert.equal(reused.window.BHasClass('HPColorsRewriteEnemyPlayer'), false, 'carrier change on the next scan');

  const split = makeOwnershipFixture(['player', 'enemy'], {});
  for (let index = 0; index < 2; index++) split.harness.scheduler.runByDelay(1);
  split.stack.AddClass('friend');
  for (let index = 0; index < 5; index++) split.harness.scheduler.runByDelay(1);
  assert.equal(split.window.BHasClass('HPColorsRewriteEnemyPlayer'), false, 'non-carrier fact by the full walk');
});

test('stock CSS differs only by permanent healthbar mask and outer-background deletions', () => {
  const css = fs.readFileSync(path.resolve(sourceRoot, '../styles/unit_status_v2.css'), 'utf8').replace(/\r\n/g, '\n');
  // Frozen 2026-10-01 (6728, SteamTracking 573a4129) stock prefix minus the three healthbar masks
  // and nine container background declarations, with six emptied relation rules removed.
  // No other stock declarations, geometry, inner backing, or critical effects may change.
  const prefix = css.split('/* Rewrite-owned additions')[0];
  assert.equal(require('node:crypto').createHash('sha256').update(prefix).digest('hex'), 'd0152146ee5a12c498cacdd3840307d0cac91204bf332575b68ae0f679ad3653');
  for (const [, selector, body] of prefix.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/\.UnitHealthbarContainer(?:[.\s]|$)/.test(selector))
      assert.doesNotMatch(body, /background-color\s*:/);
    if (selector.trim() === '.UnitHealthbarContainer' ||
        selector.trim() === '#UnitHealthbarInner' || selector.trim() === '#UnitHealthbarLines')
      assert.doesNotMatch(body, /opacity-mask\s*:/);
  }
  assert.match(prefix, /#UnitHealthbarInner\s*\{[^}]*background-color: black;/);
  assert.doesNotMatch(rendererSource, /opacityMask|syncHealthbarMasks/);
  assert.match(css, /\.WindowRoot #HPV2UltimateDark\s*\{\s*brightness: 0\.3;/);
});

test('explicit stamina shapes preserve arrows with custom dimensions and restore all shape styles', () => {
  for (const shape of ['arrow', 'circle', 'box']) {
    const fixture = makeOwnershipFixture(['player', 'enemy'], {
      enabled: true, staminaShape: shape, staminaWidth: 150, staminaHeight: 60,
      enemyStaminaColorEnabled: true, enemyStaminaColor: '#654321',
    });
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), shape !== 'arrow');
    assert.equal(fixture.icon.style.width, shape === 'arrow' ? '10.91px' : '15px');
    assert.equal(fixture.icon.style.height, shape === 'arrow' ? '16.07px' : '6px');
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaCircle'), shape === 'circle');
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaBox'), shape === 'box');
    assert.equal(fixture.icon.style.washColor, shape === 'arrow' ? '#654321' : '#FFFFFF');
    assert.equal(fixture.icon.style.backgroundColor, shape === 'arrow' ? '#ABCDEF' : '#654321');
    fixture.icon.GetParent().AddClass('PipEmpty');
    fixture.harness.scheduler.runFor(1000);
    assert.equal(fixture.icon.style.washColor, shape === 'arrow' ? 'offBlack' : '#FFFFFF');
    assert.equal(fixture.icon.style.backgroundColor, shape === 'arrow' ? '#ABCDEF' : '#000000');
    fixture.update({ enabled: false, staminaShape: shape });
    assert.equal(fixture.icon.style.washColor, '');
    assert.equal(fixture.icon.style.borderRadius || '', '');
    assert.equal(fixture.icon.style.backgroundColor, '#ABCDEF');
  }
  const friend = makeOwnershipFixture(['player', 'friend'], { enabled: true, staminaShape: 'circle', staminaWidth: 150 });
  assert.equal(friend.stamina.BHasClass('HPColorsRewriteStaminaOwned'), false);
  assert.equal(friend.icon.style.width, '11px');
  const css = fs.readFileSync(path.join(sourceRoot, '../styles/unit_status_v2.css'), 'utf8');
  assert.match(css, /HPColorsRewriteStaminaCircle[^{}]*\.StaminaPipIcon\s*\{[^}]*border-radius:\s*50%/);
});

test('pip opacity multiplies stock lines independently of custom color and restores exact ownership', () => {
  for (const [classes, gate, stockOpacity] of [
    [['player', 'enemy'], {}, 0.6],
    [['player', 'friend'], {}, 0.8],
    [['minion', 'enemy'], { npcEnemyEnabled: true }, 0.6],
    [['building', 'friend'], { buildingAllyEnabled: true }, 0.8],
    [['minion', 'team_neutral'], { npcNeutralEnabled: true }, 0.8],
  ]) {
    let line;
    const fixture = makeOwnershipFixture(classes, gate, ({ primary }) => {
      line = primary.FindChildTraverse('UnitHealthbarLines').add(new MockPanel('opacityPip', {
        classes: ['line_large'], style: { washColor: '#445566', opacity: '0.37' },
      }));
    });
    assert.deepEqual(line.styleWrites, [], 'default leaves stock lines untouched');
    fixture.update({ ...gate, pipOpacity: 50 });
    const container = fixture.primary.FindChildTraverse('UnitHealthbarLines');
    assert.equal(container.style.opacity, '0.5');
    assert.equal(line.style.opacity, '0.37', 'child inline opacity remains untouched');
    const late = container.add(new MockPanel('newEnginePip', {
      classes: ['line_small'], style: { washColor: 'rgb(80,2,2)', opacity: String(stockOpacity) },
    }));
    assert.equal(Number(late.style.opacity) * Number(container.style.opacity), stockOpacity * 0.5,
      'engine-created lines are faded immediately without another paint');
    assert.deepEqual(late.styleWrites, []);
    assert.equal(line.style.washColor, '#445566');
    line.styleWrites.length = 0;
    container.styleWrites.length = 0;
    fixture.update({ ...gate, pipOpacity: 50 });
    assert.deepEqual(line.styleWrites, [], 'unchanged opacity does not write');
    assert.deepEqual(container.styleWrites, [], 'unchanged parent opacity does not write');
    fixture.update({ ...gate, pipOpacity: 100 });
    assert.equal(line.style.opacity, '0.37');
    assert.equal(container.style.opacity, '', '100 releases parent opacity');
    line.styleWrites.length = 0;
    container.styleWrites.length = 0;
    fixture.update({ ...gate, pipOpacity: 100 });
    assert.deepEqual(line.styleWrites, [], '100 without custom color writes nothing');
    assert.deepEqual(container.styleWrites, [], 'released parent is not rewritten');
    fixture.update({ ...gate, pipOpacity: 50 });
    fixture.world.AddClass('spectating');
    fixture.update({ ...gate, pipOpacity: 50 });
    assert.equal(line.style.opacity, '0.37');
    assert.equal(container.style.opacity, '', 'spectating releases parent opacity');
    line.styleWrites.length = 0;
    fixture.update({ ...gate, pipOpacity: 20, enemyPipColorEnabled: true });
    assert.deepEqual(line.styleWrites, [], 'spectators remain untouched');
    fixture.world.RemoveClass('spectating');
    fixture.update({ ...gate, pipOpacity: 50 });
    fixture.update({ ...gate, pipOpacity: 50, enabled: false });
    assert.equal(line.style.opacity, '0.37');
    assert.equal(container.style.opacity, '', 'master off releases parent opacity');
    assert.equal(line.style.washColor, '#445566');
    fixture.update({ ...gate, pipOpacity: 50 });
    line.SetParent(fixture.window);
    fixture.harness.scheduler.runByDelay(1);
    assert.equal(line.style.opacity, '0.37', 'removed lines restore exactly');
    assert.equal(line.style.washColor, '#445566');
    fixture.update({ ...gate, pipOpacity: 50 });
    fixture.status.valid = false;
    fixture.harness.scheduler.runNext();
    assert.equal(container.style.opacity, '', 'teardown releases parent opacity');
  }
});

test('pip parent opacity releases when enemy lines are hidden or the bar retires', () => {
  for (const release of ['off', 'retirement']) {
    const fixture = makeOwnershipFixture(['player', 'enemy'], { pipOpacity: 50 });
    const container = fixture.primary.FindChildTraverse('UnitHealthbarLines');
    assert.equal(container.style.opacity, '0.5');
    if (release === 'off') fixture.update({ pipOpacity: 50, pipsVisible: false });
    else {
      fixture.primary.RemoveClass('UnitHealthbarContainer');
      fixture.harness.scheduler.runFor(1000);
    }
    assert.equal(container.style.opacity, '', release);
  }
});

test('pip colors own matching opted-in lines only and restore stock/spectator presentation', () => {
  for (const [classes, prefix, gate] of [
    [['player', 'enemy'], 'enemy', {}], [['player', 'friend'], 'ally', {}],
    [['minion', 'enemy'], 'enemy', { npcEnemyEnabled: true }],
    [['building', 'friend'], 'ally', { buildingAllyEnabled: true }],
  ]) {
    let lines;
    const fixture = makeOwnershipFixture(classes, { enabled: true, ...gate }, ({ primary }) => {
      lines = ['line_large', 'line_small'].map((type, index) =>
        primary.FindChildTraverse('UnitHealthbarLines').add(new MockPanel('pip' + index, {
          classes: [type], style: { washColor: '', opacity: '' },
        })));
    });
    for (const line of lines) assert.equal(line.style.washColor, '');
    const custom = { enabled: true, ...gate, [prefix + 'PipColorEnabled']: true,
      [prefix + 'PipColor']: '#123456', pipOpacity: 42 };
    fixture.update(custom);
    for (const line of lines) {
      assert.equal(line.style.washColor, '#123456');
      assert.equal(line.style.opacity, '');
      assert.equal(fixture.primary.FindChildTraverse('UnitHealthbarLines').style.opacity, '0.42');
    }
    fixture.world.AddClass('spectating');
    fixture.update(custom);
    for (const line of lines) {
      assert.equal(line.style.washColor, '');
      assert.equal(line.style.opacity, '');
    }
    fixture.world.RemoveClass('spectating');
    fixture.update(custom);
    fixture.update({ ...custom, [prefix + 'PipColorEnabled']: false });
    assert.equal(fixture.primary.FindChildTraverse('UnitHealthbarLines').style.opacity, '0.42',
      'color off retains independent opacity');
    for (const line of lines) assert.equal(line.style.washColor, '');
    fixture.update(custom);
    fixture.update({ ...custom, enabled: false });
    for (const line of lines) {
      assert.equal(line.style.washColor, '');
      assert.equal(line.style.opacity, '');
    }
  }
});

test('native label canvas compensation releases exactly on adoption, resize and replacement', () => {
  const fixture = makeOwnershipFixture(['player', 'friend'], {
    allyReadoutVisible: false,
  }, parts => {
    prepareNativeReadout(parts);
    measuredGeometry(parts, 2, 3);
    for (const panel of [parts.info, parts.window, parts.status, parts.stack])
      panel.actuallayoutwidth = 600;
  });
  assert.equal(fixture.health.style.marginRight, '120px');
  for (const [property, value] of Object.entries(nativeReadoutStock))
    if (property !== 'marginRight') assert.equal(fixture.health.style[property], value, property);
  fixture.update({ allyReadoutVisible: true });
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.style.marginRight, '-5px',
    'adopted outline guard replaces canvas compensation, then restores it on release');
  fixture.update({ allyReadoutVisible: false });
  assert.equal(fixture.health.GetParent(), fixture.info);
  assert.equal(fixture.health.style.marginRight, '120px');
  fixture.update({ allyReadoutVisible: true });
  const replacement = fixture.info.add(new MockPanel('UnitHealthbarValue', {
    style: { ...nativeReadoutStock },
  }));
  fixture.harness.scheduler.runFor(1000);
  assertNativeStock(fixture.health);
  assert.equal(replacement.GetParent(), fixture.row);
  assert.equal(replacement.style.marginRight, '-5px');
  fixture.health.DeleteAsync(); // The engine retires the replaced native binding.
  fixture.update({ allyReadoutVisible: false });
  assert.equal(replacement.style.marginRight, '120px');
  for (const panel of [fixture.info, fixture.window, fixture.status, fixture.stack])
    panel.actuallayoutwidth = 400;
  fixture.harness.scheduler.runFor(1000);
  assertNativeStock(replacement);
});

test('full-canvas rebase preserves stock leaf positions and old-frame wiggle pivot before hydration', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'hp_colors_rewrite_v2',
    'panorama', 'styles', 'unit_status_v2.css'), 'utf8');
  const rule = selector => css.slice(css.indexOf(selector)).match(/\{([^}]*)\}/)[1];
  const cssPixels = (body, property) =>
    Number(body.match(new RegExp(property + ':\\s*([\\d.]+)px'))[1]);
  for (const [classes, healthTop, healthEdge] of [
    [['player', 'enemy'], 66, 40],
    [['player', 'friend'], 66, 30],
    [['boss_tier1', 'enemy'], 70, 35],
    [['neutral', 'minion'], 66, 40],
  ]) {
    for (const [width, height, sx, sy] of [[200, 210, 1, 1], [300, 260, 2, 3]]) {
      const fixture = makeOwnershipFixture(classes, { enabled: false }, parts => {
        measuredGeometry(parts, sx, sy);
        for (const panel of [parts.info, parts.window, parts.status, parts.stack]) {
          panel.actuallayoutwidth = width * sx;
          panel.actuallayoutheight = height * sy;
        }
        parts.harness.root.SetAttributeString('hp_colors_v2_hydration', 'pending');
        parts.harness.root.SetAttributeString('hp_colors_v2_config', '');
      });
      const position = (panel) => [
        Number.parseFloat(panel.style.marginLeft), Number.parseFloat(panel.style.marginTop),
      ];
      assert.deepEqual(position(fixture.unitInfo), [width / 2 - 50, 67], classes.join(' ') + ' ultimate');
      assert.deepEqual(position(fixture.level), [width / 2 - 73, 67.5], classes.join(' ') + ' level');
      const healthRule = rule(classes.includes('boss_tier1')
        ? '.building .WindowRoot #InfoHealthContainer #UnitHealthbarValue'
        : '.WindowRoot #InfoHealthContainer #UnitHealthbarValue');
      const healthRightRule = classes.includes('friend')
        ? rule('.friend .WindowRoot #InfoHealthContainer #UnitHealthbarValue') : healthRule;
      const shieldRule = rule('.WindowRoot #InfoHealthContainer #UnitShieldbarValue');
      assert.equal(fixture.health.style.marginTop || '', '', 'vertical stock placement is CSS-owned');
      assert.equal(cssPixels(healthRule, 'margin-top'), healthTop);
      const healthRight = Number.parseFloat(fixture.health.style.marginRight ||
        cssPixels(healthRightRule, 'margin-right'));
      assert.equal(width - healthRight, width / 2 + healthEdge);
      assert.equal(fixture.shield.style.marginTop || '', '');
      assert.equal(cssPixels(shieldRule, 'margin-top'), 85);
      const shieldRight = Number.parseFloat(fixture.shield.style.marginRight ||
        cssPixels(shieldRule, 'margin-right'));
      assert.equal(width - shieldRight, width / 2 + 40);
      assert.equal(fixture.health.GetParent(), fixture.info, 'no adoption during hydration');
      for (const panel of [fixture.status, fixture.info, fixture.stack]) {
        const pivot = String(panel.style.transformOrigin).match(/^([\d.]+)%\s+([\d.]+)%$/);
        assert.ok(pivot, panel.id + ' pivot');
        assert.ok(Math.abs(Number(pivot[1]) / 100 * width - width / 2) < 0.001);
        assert.ok(Math.abs(Number(pivot[2]) / 100 * height - 85) < 0.001);
      }
      // Dormant health keeps the wake scan and pending config request only.
      assert.equal(fixture.harness.scheduler.jobs.length, 2, 'rebase adds no loop or dormant paint');
      fixture.harness.scheduler.runFor(1000);
      assert.deepEqual(position(fixture.unitInfo), [width / 2 - 50, 67], 'unchanged cadence does not double-rebase');
    }
  }
});

test('full-canvas accessories move beyond the old info frame and release to rebased defaults', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], {
    levelOffsetX: 2000, levelOffsetY: 2100, ultOffsetX: -2000, ultOffsetY: -2100,
  }, parts => measuredGeometry(parts, 2, 3));
  assert.deepEqual([fixture.level.style.marginLeft, fixture.level.style.marginTop], ['227px', '277.5px']);
  assert.deepEqual([fixture.unitInfo.style.marginLeft, fixture.unitInfo.style.marginTop], ['-150px', '-143px']);
  fixture.update({ enabled: false });
  assert.deepEqual([fixture.level.style.marginLeft, fixture.level.style.marginTop], ['27px', '67.5px']);
  assert.deepEqual([fixture.unitInfo.style.marginLeft, fixture.unitInfo.style.marginTop], ['50px', '67px']);
  assert.equal(fixture.stack.style.transform, '');
});

test('circle and box stamina use stock-filled white and black empty interiors without custom color', () => {
  for (const shape of ['circle', 'box']) {
    const fixture = makeOwnershipFixture(['player', 'enemy'], { staminaShape: shape });
    assert.equal(fixture.icon.style.backgroundColor, '#FFFFFF');
    assert.equal(fixture.icon.style.borderColor, '#FFFFFF');
    fixture.icon.GetParent().AddClass('PipEmpty');
    fixture.harness.scheduler.runFor(1000);
    assert.equal(fixture.icon.style.backgroundColor, '#000000');
    assert.equal(fixture.icon.style.borderColor, '#FFFFFF');
    fixture.icon.GetParent().RemoveClass('PipEmpty');
    fixture.harness.scheduler.runFor(1000);
    assert.equal(fixture.icon.style.backgroundColor, '#FFFFFF');
    fixture.update({ staminaShape: 'arrow' });
    assert.equal(fixture.icon.style.backgroundColor, '#ABCDEF');
    assert.equal(fixture.icon.style.borderColor, '#123456');
    assert.equal(fixture.icon.style.washColor, '');
  }
});

test('custom pip ownership handles late lines and restores captured inline styles on replacement', () => {
  const custom = { enemyPipColorEnabled: true, enemyPipColor: '#123456', pipOpacity: 42 };
  const fixture = makeOwnershipFixture(['player', 'enemy'], custom);
  const container = fixture.primary.FindChildTraverse('UnitHealthbarLines');
  const original = container.add(new MockPanel('latePip', {
    classes: ['line_large'], style: { washColor: '#445566', opacity: '0.3' },
  }));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(original.style.washColor, '#123456');
  assert.equal(original.style.opacity, '0.3');
  assert.equal(container.style.opacity, '0.42');
  original.SetParent(fixture.window);
  const replacement = container.add(new MockPanel('replacementPip', {
    classes: ['line_small'], style: { washColor: '#778899', opacity: '0.7' },
  }));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(original.style.washColor, '#445566');
  assert.equal(original.style.opacity, '0.3');
  assert.equal(replacement.style.washColor, '#123456');
  fixture.update({ enemyPipColorEnabled: false });
  assert.equal(replacement.style.washColor, '#778899');
  assert.equal(replacement.style.opacity, '0.7');
  assert.equal(container.style.opacity, '');
});

test('CRITICAL uses brightness-only feedback on owned bars, not a geometry animation', () => {
  const css = fs.readFileSync(path.resolve(sourceRoot, '../styles/unit_status_v2.css'), 'utf8').replace(/\r\n/g, '\n');
  const stock = css.split('/* Rewrite-owned additions')[0];
  const owned = css.slice(stock.length);
  const animation = owned.match(/\.enemy\.health_critical \.ShowCriticalState\.HPColorsRewriteBarLines #UnitHealthbar[\s\S]*?\{([^}]*)\}/);
  assert.ok(animation, 'owned critical feedback must target compact bars');
  assert.match(animation[1], /pre-transform-scale2d:\s*1;/,
    'owned compact critical feedback resets the unowned 1.2 scale');
  assert.match(owned, /\.WindowRoot #UnitHealthbarsContainer\s*\{[^}]*animation-name:\s*none;/);
  const name = animation[1].match(/animation-name:\s*([\w]+);/)[1];
  const frames = owned.slice(owned.indexOf("@keyframes '" + name + "'")).split('\n}\n')[0];
  assert.match(frames, /brightness:\s*2/);
  assert.doesNotMatch(frames, /pre-transform-scale2d|transform:|margin|height|width/);
  assert.match(owned, /\.player\.health_critical \.ShowCriticalState\.HPColorsRewriteBarLines \.UnitHealthbarContainer[\s\S]*?\{[^}]*margin-left:\s*13px;/);
  assert.match(stock, /#CriticalIndicator\s*\{[^}]*ignore-parent-flow:\s*true;[^}]*margin-top:\s*86px;/);
  assert.match(stock, /@keyframes 'healthCritFlash3'[\s\S]*pre-transform-scale2d:\s*1\.15;[\s\S]*transform:\s*rotateY/);

  const values = { ...accessoryValues, positionX: 100, positionY: -380 };
  const fixture = makeOwnershipFixture(['player', 'enemy'], values, parts => measuredGeometry(parts, 2, 3));
  fixture.window.AddClass('ShowCriticalState');
  const normal = accessoryResult(fixture);
  fixture.world.AddClass('health_critical');
  paintReadout(fixture);
  assert.deepEqual(accessoryResult(fixture), normal, 'bar, readout, marker and accessories keep their geometry');
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), true);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteHideCritical'), false, 'stock label may show');
  fixture.update({ ...values, criticalIndicatorVisible: false });
  assert.deepEqual(accessoryResult(fixture), normal);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteHideCritical'), true);
  fixture.update({ ...values, enabled: false });
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), false, 'master off selects untouched stock animation');
  assert.equal(fixture.window.BHasClass('HPColorsRewriteHideCritical'), false);
});

test('native HP and pulse text reserve local outline room without moving the glyphs or row', () => {
  for (const [relation, prefix] of [['enemy', 'readout'], ['friend', 'allyReadout']]) {
    const values = { readoutVisible: true, allyReadoutVisible: true, readoutSize: 400,
      allyReadoutSize: 400, enemyPulseEnabled: true, enemyPulseThreshold: 100,
      enemyPulseReadout: true, enemyPulseReadoutModifiers: true };
    const fixture = makeOwnershipFixture(['player', relation], values, parts => {
      prepareNativeReadout(parts);
      parts.health.style.padding = '4px';
      parts.health.style.overflow = 'clip';
    });
    const rowPosition = readoutTranslation(fixture.row);
    for (const outline of [0, 0.5, 5, 10]) {
      fixture.update({ ...values, [prefix + 'OutlineWidth']: outline });
      const room = Math.ceil(outline);
      assert.equal(fixture.health.style.padding, '0px ' + room + 'px');
      assert.equal(fixture.health.style.overflow, 'noclip');
      assert.equal(fixture.health.style.marginLeft, -room + 'px');
      assert.equal(fixture.health.style.marginRight, -room + 'px');
      assert.equal(room + Number.parseFloat(fixture.health.style.marginLeft), 0, 'glyph left stays fixed');
      assert.equal(2 * room + Number.parseFloat(fixture.health.style.marginLeft) +
        Number.parseFloat(fixture.health.style.marginRight), 0, 'fit-children contribution stays fixed');
      assert.deepEqual(readoutTranslation(fixture.row), rowPosition);
      if (relation === 'enemy') assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), true);
      const writes = fixture.health.styleWrites.length;
      paintReadout(fixture);
      assert.equal(fixture.health.styleWrites.length, writes, 'unchanged padding and margins are cached');
    }
    fixture.update({ ...values, enabled: false });
    assertNativeStock(fixture.health);
    assert.equal(fixture.health.style.padding, '4px');
    assert.equal(fixture.health.style.overflow, 'clip');
    assert.equal(fixture.health.GetParent(), fixture.info);
  }
});

test('objective boss facts use the building gate, while midboss and troopers remain NPCs', () => {
  for (const kind of ['boss_tier1', 'boss_tier2', 'boss_tier3', 'boss_barracks', 'barracks']) {
    const fixture = makeOwnershipFixture([kind, 'enemy'], {
      npcEnemyEnabled: true, buildingEnemyEnabled: false,
    });
    assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), false, kind);
    fixture.update({ npcEnemyEnabled: false, buildingEnemyEnabled: true });
    assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), true, kind);
    fixture.world.AddClass('friend');
    fixture.harness.scheduler.runFor(2500);
    assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), false, 'ambiguous ' + kind);
    fixture.world.AddClass('team_neutral');
    fixture.update({ buildingEnemyEnabled: true, buildingAllyEnabled: true, npcNeutralEnabled: true });
    fixture.harness.scheduler.runFor(2500);
    assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), false, 'neutral objective ' + kind);
  }
  for (const kind of ['midboss', 'CLASS_TROOPER', 'creature']) {
    const fixture = makeOwnershipFixture([kind, 'enemy'], { npcEnemyEnabled: true });
    assert.equal(fixture.window.BHasClass('HPColorsRewriteBarLines'), true, kind);
  }
});

test('primary shield and armor allocations do not dilute HP thresholds or readout colors', () => {
  const values = {
    lowThreshold: 40, highThreshold: 60, enemyMode: 'fixed',
    enemyLow: '#FF0000', enemyMid: '#FFFF00', enemyHigh: '#00FF00',
    readoutVisible: true, enemyPulseEnabled: true, enemyPulseThreshold: 55,
    enemyPulseReadout: true, enemyPulseColorEnabled: true, enemyPulseColorMode: 'gradient',
  };
  // Shield then armor follow the fill edge; negativeOffset draws them behind it from x=0.
  const placeLayers = (layers, signal, fillWidth) => {
    let start = fillWidth;
    for (const [layer, extent] of layers) {
      const end = start + extent;
      if (signal === 'layout') [layer.actuallayoutwidth, layer.actualxoffset] = [extent, start];
      else if (signal === 'clip') layer.style.clip = `rect(0%, ${end / 103.5 * 100}%, 100%, ${start / 103.5 * 100}%)`;
      else if (signal === 'negativeOffset') layer.actualxoffset = end - 103.5;
      else layer.actualxoffset = start;
      start = end;
    }
  };
  for (const signal of ['layout', 'clip', 'width', 'scale', 'preScale', 'negativeOffset']) {
    const layers = [];
    const fixture = makeOwnershipFixture(['player', 'enemy'], values, parts => {
      prepareNativeReadout(parts);
      parts.inner.actuallayoutwidth = 103.5;
      parts.inner.add(new MockPanel('hp_colors_pulse_overlay', { style: { visibility: 'collapse' } }));
      const shieldbar = parts.stack.add(new MockPanel('UnitShieldbar', { classes: ['UnitHealthbarContainer'] }));
      const shieldInner = shieldbar.add(new MockPanel('UnitHealthbarInner', { actuallayoutwidth: 500 }));
      shieldInner.add(new MockPanel('unit_healthbar_bullet_shield', { actuallayoutwidth: 500 }));
      for (const [id, extent] of [['unit_healthbar_bullet_shield', 20.7], ['unit_healthbar_ratking_armor', 13.8]]) {
        const layer = parts.inner.add(new MockPanel(id, {
          classes: ['HealthAmount', 'HasHealth'], actuallayoutwidth: 103.5,
          style: { visibility: 'visible' },
        }));
        if (signal === 'width') layer.style.width = `${extent}px`;
        if (signal === 'scale') layer.style.transform = `scaleX(${extent / 103.5})`;
        if (signal === 'preScale') layer.style.preTransformScale2d = `${extent / 103.5}, 1`;
        layers.push([layer, extent]);
      }
      placeLayers(layers, signal, 34.5);
    });
    assert.equal(fixture.fill.style.washColor, '#FFFF00', signal);
    assert.equal(fixture.health.style.washColor, '#FFFF00', signal);
    assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), true, signal);
    assert.equal(fixture.fill.BHasClass('HPColorsRewritePulse'), true, signal);
    const overlay = fixture.inner.FindChildTraverse('hp_colors_pulse_overlay');
    // Coverage remains the actual fraction of the combined inner, not HP percent.
    assert.equal(overlay.style.clip, 'rect(0%, 33.33%, 100%, 0%)', signal);
    fixture.fill.actuallayoutwidth = 48.3;
    placeLayers(layers, signal, 48.3);
    fixture.update(values);
    assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), false, signal);
    assert.equal(fixture.fill.style.washColor, '#00FF00', signal);
  }
});

test('a shield layer hidden behind the fill does not change HP thresholds', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], {
    lowThreshold: 40, highThreshold: 60, enemyMode: 'fixed',
    enemyLow: '#FF0000', enemyMid: '#FFFF00', enemyHigh: '#00FF00',
  }, parts => {
    parts.inner.actuallayoutwidth = 103.5;
    parts.inner.add(new MockPanel('unit_healthbar_bullet_shield', {
      classes: ['HealthAmount', 'HasHealth'], actuallayoutwidth: 20.7, style: { visibility: 'visible' },
    }));
  });
  assert.equal(fixture.fill.style.washColor, '#FF0000', '33% HP stays low; 0..20% shield is under the fill');
});

test('arrow dimensions scale continuously on independent axes and release backgroundSize', () => {
  for (const width of [109, 110, 111]) {
    for (const height of [44.7, 44.8, 44.9]) {
      const fixture = makeOwnershipFixture(['player', 'enemy'], {
        staminaShape: 'arrow', staminaWidth: width, staminaHeight: height,
      }, parts => Object.assign(parts.icon.style, {
        width: '8px', height: '12px', backgroundSize: 'contain',
      }));
      assert.equal(fixture.icon.style.width, Math.round(8 * width / 110 * 100) / 100 + 'px', String(width));
      assert.equal(fixture.icon.style.height, Math.round(12 * height / 44.8 * 100) / 100 + 'px', String(height));
      assert.equal(fixture.icon.style.backgroundSize,
        width === 110 && height === 44.8 ? 'contain' : '100% 100%');
      fixture.update({ staminaShape: 'box', staminaWidth: width, staminaHeight: height });
      assert.equal(fixture.icon.style.backgroundSize, 'contain');
      fixture.update({ staminaShape: 'arrow', staminaWidth: width, staminaHeight: height });
      fixture.update({ staminaShape: 'arrow' });
      assert.equal(fixture.icon.style.width, '8px');
      assert.equal(fixture.icon.style.height, '12px');
      assert.equal(fixture.icon.style.backgroundSize, 'contain');
      fixture.update({ staminaShape: 'arrow', staminaWidth: 111 });
      fixture.update({ enabled: false });
      assert.equal(fixture.icon.style.backgroundSize, 'contain');
      assert.equal(fixture.icon.style.width, '8px');
    }
  }
});

test('text pulses without bar colors and ally pulse adds animation only, restoring stock classes', () => {
  for (const role of ['enemy', 'ally']) {
    const prefix = role === 'enemy' ? 'readout' : 'allyReadout';
    const values = {
      enemyEnabled: false, allyEnabled: false,
      [prefix + 'Visible']: true, [prefix + 'Size']: 200,
      [role + 'PulseEnabled']: true, [role + 'PulseThreshold']: 55,
      [role + 'PulseReadout']: true, [role + 'PulseIntensity']: 0,
      enemyPulseReadoutModifiers: false,
    };
    const fixture = makeOwnershipFixture(['player', role === 'enemy' ? 'enemy' : 'friend'], values, parts => {
      prepareNativeReadout(parts);
      parts.health.AddClass('HPColorsRewritePulseIntense');
    });
    assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), true, role);
    assert.equal(fixture.health.BHasClass('HPColorsRewritePulseSubtle'), true, role);
    assert.equal(fixture.fill.BHasClass('HPColorsRewritePulse'), false, role);
    assert.equal(fixture.health.style.fontSize, '20px', 'text animation does not resize ' + role);
    const geometry = readoutTranslation(fixture.row);
    fixture.update({ ...values, [role + 'PulseReadout']: false });
    assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), false, role);
    assert.equal(fixture.health.BHasClass('HPColorsRewritePulseIntense'), true, 'stock class ' + role);
    assert.deepEqual(readoutTranslation(fixture.row), geometry);
    fixture.update({ ...values, [prefix + 'Visible']: false });
    assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), false, 'hidden ' + role);
    fixture.update(values);
    fixture.fill.actuallayoutwidth = 69;
    fixture.update(values);
    assert.equal(fixture.health.BHasClass('HPColorsRewritePulse'), false, 'threshold ' + role);
    fixture.update({ enabled: false });
    assert.equal(fixture.health.BHasClass('HPColorsRewritePulseIntense'), true, 'release ' + role);
  }
});

test('pre-transform canvas-centre scaling is compensated and accessories follow the visual bar', () => {
  for (const ui of [[1, 1], [2, 3]]) {
    const fixture = makeOwnershipFixture(['player', 'enemy'], {}, parts => {
      measuredGeometry(parts, ...ui);
    });
    const css = (panel, property, axis) => panel[property] / panel['actualuiscale_' + axis];
    const stockLeft = css(fixture.stack, 'actualxoffset', 'x') + css(fixture.primary, 'actualxoffset', 'x');
    const stockX = stockLeft + css(fixture.primary, 'actuallayoutwidth', 'x') / 2;
    const stockY = css(fixture.stack, 'actualyoffset', 'y') +
      css(fixture.primary, 'actualyoffset', 'y') + css(fixture.primary, 'actuallayoutheight', 'y') / 2;
    const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.011,
      label + ': ' + actual + ' != ' + expected);
    for (const widthScale of [100, 148, 230]) {
      for (const heightScale of [60, 100, 160]) {
        const sx = widthScale / 100, sy = heightScale / 100;
        const values = { widthScale, heightScale, positionX: 70, positionY: 30,
          accessoryAnchorEnabled: true, readoutVisible: true, readoutOffsetX: 5, readoutOffsetY: 12,
          levelOffsetX: 20, levelOffsetY: 10, ultOffsetX: -20, ultOffsetY: -10 };
        fixture.update(values);
        const transform = /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0px\)$/.exec(fixture.stack.style.transform);
        assert.ok(transform);
        assert.equal(fixture.stack.style.transformOrigin,
          sx !== 1 || sy !== 1 ? '50% 50%' : '50% ' + (85 / 210 * 100) + '%');
        const panelX = css(fixture.stack, 'actuallayoutwidth', 'x') / 2;
        const panelY = css(fixture.stack, 'actuallayoutheight', 'y') / 2;
        const visualX = css(fixture.stack, 'actualxoffset', 'x') + panelX +
          (css(fixture.primary, 'actualxoffset', 'x') +
            css(fixture.primary, 'actuallayoutwidth', 'x') / 2 - panelX) * sx + Number(transform[1]);
        const visualY = css(fixture.stack, 'actualyoffset', 'y') + panelY +
          (css(fixture.primary, 'actualyoffset', 'y') +
            css(fixture.primary, 'actuallayoutheight', 'y') / 2 - panelY) * sy + Number(transform[2]);
        close(visualX, stockX + 7, 'visual centre X');
        close(visualY, stockY + 3, 'visual centre Y');
        const visualLeft = visualX - css(fixture.primary, 'actuallayoutwidth', 'x') * sx / 2;
        for (const [panel, baseLeft, baseTop, ox, oy] of [
          [fixture.level, 27, 67.5, 2, 1], [fixture.unitInfo, 50, 67, -2, -1]]) {
          const halfW = css(panel, 'actuallayoutwidth', 'x') / 2;
          const halfH = css(panel, 'actuallayoutheight', 'y') / 2;
          close(parseFloat(panel.style.marginLeft) + halfW - visualLeft,
            baseLeft + halfW - stockLeft + ox, 'anchored rigid X gap');
          close(parseFloat(panel.style.marginTop) + halfH - visualY,
            baseTop + halfH - stockY + oy, 'anchored rigid Y gap');
          fixture.update({ ...values, accessoryAnchorEnabled: false });
          close(parseFloat(panel.style.marginLeft),
            baseLeft - css(fixture.primary, 'actuallayoutwidth', 'x') * (sx - 1) / 2 + ox * sx,
            'legacy anchor-off X');
          close(parseFloat(panel.style.marginTop),
            stockY + (baseTop + halfH - stockY + oy) * sy - halfH,
            'legacy anchor-off Y');
          fixture.update(values);
        }
        const [left, top] = readoutTranslation(fixture.row);
        close(left + css(fixture.container, 'actuallayoutwidth', 'x') - visualX, 33.5 + 5 * sx, 'readout X');
        close(top - visualY, -8 + 12 * sy, 'readout Y');
        const before = fixture.row.style.transform;
        fixture.update({ ...values, accessoryAnchorEnabled: false });
        assert.equal(fixture.row.style.transform, before, 'HP anchor remains independent');
      }
    }
    fixture.update({ enabled: false });
    assert.equal(fixture.stack.style.transform || '', '');
    assert.equal(fixture.stack.style.preTransformScale2d || '', '');
    assert.equal(fixture.stack.style.transformOrigin, '50% ' + (85 / 210 * 100) + '%');
    assert.equal(fixture.level.style.marginLeft, '27px');
    assert.equal(fixture.level.style.marginTop, '67.5px');
    assert.equal(fixture.unitInfo.style.marginLeft, '50px');
    assert.equal(fixture.unitInfo.style.marginTop, '67px');
  }
});

function makeNameFixture(values) {
  let name;
  const fixture = makeOwnershipFixture(['player', 'enemy'], values, ({ window }) => {
    Object.assign(window, { actuallayoutwidth: 200, actuallayoutheight: 210 });
    name = window.add(new MockPanel('HPV2NameAnchor')).add(new MockPanel('name', { actuallayoutwidth: 60, actuallayoutheight: 20, text: 'Hero' }));
  });
  return { fixture, name };
}

// Failure modes: tilt 0 changes today's name transforms or ownership; a tilt with offsets
// replaces the translate; tilt alone stays on the stock fast path and never applies;
// rotation lands on the shake-animated HPV2NameAnchor; release leaves the rotation behind.
test('name tilt appends rotateZ to the name transform and releases to stock', () => {
  const { fixture, name } = makeNameFixture({ nameOffsetX: 10, nameOffsetY: -5 });
  const anchor = name.GetParent();
  assert.equal(name.style.transform, 'translate3d(10px, -5px, 0px)', 'tilt 0 keeps the offset translate');
  fixture.update({ nameOffsetX: 10, nameOffsetY: -5, nameTilt: 15 });
  assert.equal(name.style.transform, 'translate3d(10px, -5px, 0px) rotateZ(15deg)');
  fixture.update({ nameTilt: 15 });
  assert.equal(name.style.transform, 'rotateZ(15deg)', 'tilt alone is a customization');
  fixture.update({ nameAlign: 'left', nameTilt: -20 });
  assert.match(name.style.transform, /^translate3d\(.*, 0px\) rotateZ\(-20deg\)$/);
  assert.equal(anchor.style.transform ?? '', '', 'anchor keeps the shake animation free');
  fixture.update({ nameTilt: 0 });
  assert.equal(name.style.transform ?? '', '', 'tilt 0 releases the name to stock');
  fixture.update({ nameTilt: 30 });
  fixture.update({ enabled: false, nameTilt: 30 });
  assert.equal(name.style.transform ?? '', '', 'master off restores stock');
  const plain = makeNameFixture({});
  assert.equal(plain.name.style.transform ?? '', '');
  assert.deepEqual(plain.name.styleWrites, [], 'uncustomized names stay untouched');
});

// Failure modes: the HP text tilt rotates the geometry row instead of the label; the ally
// side reads the enemy key; pulse modifiers drop the tilt; release leaves the rotation.
test('HP text tilt rotates the adopted label per side and releases the baseline', () => {
  const enemy = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true, readoutTilt: -20, allyReadoutTilt: 40 }, prepareNativeReadout);
  assert.equal(enemy.health.GetParent(), enemy.row);
  assert.equal(enemy.health.style.transform, 'rotateZ(-20deg)');
  assert.doesNotMatch(enemy.row.style.transform || '', /rotate/, 'row keeps its geometry translate');
  enemy.update({ readoutVisible: true, readoutTilt: -20, enemyPulseEnabled: true, enemyPulseThreshold: 100,
    enemyPulseReadout: true, enemyPulseReadoutModifiers: true });
  assert.equal(enemy.health.style.transform, 'rotateZ(-20deg)', 'pulse modifiers keep the tilt');
  enemy.update({ readoutVisible: true, readoutTilt: 0 });
  assert.equal(enemy.health.style.transform, nativeReadoutStock.transform, 'tilt 0 uses the baseline');
  enemy.update({ readoutVisible: true, readoutTilt: 25 });
  enemy.update({ readoutVisible: false, readoutTilt: 25 });
  assert.equal(enemy.health.style.transform, nativeReadoutStock.transform, 'side off restores the baseline');
  enemy.update({ readoutVisible: true, readoutTilt: 25 });
  enemy.update({ enabled: false, readoutTilt: 25 });
  assertNativeStock(enemy.health);
  const ally = makeOwnershipFixture(['player', 'friend'], { allyReadoutVisible: true, readoutTilt: -20, allyReadoutTilt: 40 }, prepareNativeReadout);
  assert.equal(ally.health.style.transform, 'rotateZ(40deg)');
  ally.update({ allyReadoutVisible: false, allyReadoutTilt: 40 });
  assertNativeStock(ally.health);
});

// Failure modes: dormant paint/pickup callbacks survive; hidden bars do geometry work or
// show an adopted label; unchanged pip children are enumerated by the hot paint path.
test('dormant renderer retains only its one-second wake sentinel', () => {
  const fixture = bootTimers(['building', 'enemy']);
  fixture.harness.scheduler.runFor(5000);
  assert.deepEqual(fixture.harness.scheduler.jobs.map(job => job.delay), [1]);
  fixture.world.RemoveClass('building');
  fixture.world.AddClass('player');
  fixture.world.AddClass('CLASS_PLAYER');
  fixture.harness.scheduler.runFor(1000);
  assert.ok(fixture.harness.scheduler.jobs.some(job => job.delay !== 1), 'hero wake resumes paint');
});

test('hidden health surfaces defer geometry and reconcile current config on wake', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true });
  fixture.world.AddClass('health_hidden');
  fixture.harness.scheduler.runFor(2000);
  const counts = {};
  for (const panel of [fixture.stack, fixture.primary, fixture.inner, fixture.fill, fixture.row])
    panel.operationCounts = counts;
  const transform = fixture.stack.style.preTransformScale2d;
  fixture.update({ readoutVisible: true, widthScale: 230 });
  fixture.harness.scheduler.runFor(3000);
  assert.equal(fixture.health.style.visibility, 'collapse');
  assert.equal(fixture.stack.style.preTransformScale2d, transform, 'hidden geometry is untouched');
  assert.equal(counts.styleWrites || 0, 0);
  fixture.world.RemoveClass('health_hidden');
  fixture.harness.scheduler.runFor(1000);
  assert.equal(fixture.health.style.visibility, 'visible');
  assert.equal(fixture.stack.style.preTransformScale2d, '2.3, 1');
});

test('paint reuses scanned pip children and fixed-color fill changes avoid accessory writes', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { enemyMode: 'fixed' }, ({ primary }) => {
    const lines = primary.FindChildTraverse('UnitHealthbarLines');
    lines.add(new MockPanel('', { classes: ['line_large'] }));
  });
  const lines = fixture.primary.FindChildTraverse('UnitHealthbarLines');
  const original = lines.Children.bind(lines);
  let enumerations = 0;
  lines.Children = () => { enumerations++; return original(); };
  const accessories = {};
  fixture.level.operationCounts = accessories;
  fixture.unitInfo.operationCounts = accessories;
  fixture.fill.actuallayoutwidth = 33;
  fixture.harness.scheduler.runByDelay(0.15);
  assert.equal(enumerations, 0, 'paint never enumerates pip children');
  assert.equal(accessories.styleReads || 0, 0, 'fill changes never read accessory style setters back');
  assert.equal(accessories.styleWrites || 0, 0, 'fill changes do not repaint accessory geometry');
  fixture.harness.scheduler.runByDelay(1);
  assert.ok(enumerations > 0, 'the scan refreshes engine-created lines');
});

test('OLD slot allocation is bounded and overflow falls back without truncating health', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { barMask: 'old' }, ({ primary }) => {
    const lines = primary.FindChildTraverse('UnitHealthbarLines');
    lines.actuallayoutwidth = 69;
    lines.add(new MockPanel('', { classes: ['line_large'], actualxoffset: 69 / 400 }));
  });
  assert.ok(layerOf(fixture, 'HPV2PipEmpty').length <= 128);
  assert.equal(fixture.window.BHasClass('HPColorsRewriteBarPips'), false,
    'above the 12,800 HP slot ceiling use native OLD fallback rather than truncating health');
});

test('optional pulse marker and OLD surfaces are created only on demand', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], {
    enemyPulseEnabled: false, enemyKillMarkerEnabled: false,
  }, ({ primary }) => {
    primary.FindChildTraverse('hp_colors_kill_marker').DeleteAsync(0);
  });
  assert.equal(fixture.primary.FindChildTraverse('hp_colors_kill_marker'), null);
  assert.equal(fixture.inner.FindChildTraverse('hp_colors_pulse_overlay'), null);
  assert.equal(gridOf(fixture), null);
  fixture.update({ enemyPulseEnabled: true, enemyPulseColorEnabled: true,
    enemyPulseColorMode: 'gradient', enemyPulseThreshold: 80, enemyKillMarkerEnabled: true });
  assert.ok(fixture.primary.FindChildTraverse('hp_colors_kill_marker'));
  assert.ok(fixture.inner.FindChildTraverse('hp_colors_pulse_overlay'));
  fixture.update({ barMask: 'old' });
  assert.ok(gridOf(fixture));
});

test('scan repairs external stamina style drift with write-only paint caches', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { staminaWidth: 200 });
  const ownedWidth = fixture.icon.style.width;
  fixture.icon.style.width = '1px';
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.icon.style.width, ownedWidth);
});

test('full-canvas motion frame needs no runtime rebase and still owns the name', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true, nameSize: 22 }, parts => {
    prepareNativeReadout(parts);
    Object.assign(parts.window, { actuallayoutwidth: 200, actuallayoutheight: 210 });
    const motion = parts.window.add(new MockPanel('HPV2MotionFrame', {
      actuallayoutwidth: 200, actuallayoutheight: 210,
    }));
    motion.add(new MockPanel('HPV2NameAnchor')).add(new MockPanel('name', { text: 'HAZE', style: {} }));
    parts.status.SetParent(motion);
    parts.container.SetParent(motion);
  });
  const motion = fixture.window.FindChildTraverse('HPV2MotionFrame');
  const name = motion.FindChildTraverse('name');
  assert.equal(name.style.fontSize, '22px', 'the name inside the frame is still owned');
  assert.equal(fixture.health.GetParent(), fixture.row, 'native HP stays in the shared moving frame');
  fixture.window.actuallayoutwidth = 300;
  fixture.harness.scheduler.runByDelay(1);
  for (const panel of [motion, fixture.status, fixture.container]) {
    assert.equal(panel.style.marginLeft || '', '', panel.id);
    assert.equal(panel.style.width || '', '', panel.id);
  }
});

test('lazy ultimate discovery retires the OLD pool and never leaves stale filled children', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { barMask: 'old' }, parts => {
    setEngineLines(parts.primary.FindChildTraverse('UnitHealthbarLines'), 2900);
    parts.ultOverlay.DeleteAsync();
  });
  const empty = layerOf(fixture, 'HPV2PipEmpty').slice();
  const fill = layerOf(fixture, 'HPV2PipFill').slice();
  assert.equal(empty.length, 29);
  const overlay = fixture.ultBackground.add(new MockPanel('HPV2UltimateOverlay'));
  overlay.add(new MockPanel('HPV2UltimateDark'));
  overlay.add(new MockPanel('HPV2UltimateFill'));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(layerOf(fixture, 'HPV2PipEmpty').length, empty.length, 'pool stays bounded');
  assert.equal(layerOf(fixture, 'HPV2PipFill').length, fill.length);
  for (const panel of [...empty, ...fill]) assert.equal(panel.IsValid(), false, 'old children retire');
  fixture.fill.actuallayoutwidth = 0;
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(shownPips(fixture, 'HPV2PipFill').length, 0, 'no orphaned old fill survives damage');
  overlay.DeleteAsync();
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(layerOf(fixture, 'HPV2PipEmpty').length, 29);
});

for (const missing of ['HPV2PipEmpty', 'HPV2PipFill']) test('OLD retries a temporarily missing layer: ' + missing, () => {
  let reject = true;
  const fixture = makeOwnershipFixture(['player', 'enemy'], { barMask: 'old' }, parts => {
    setEngineLines(parts.primary.FindChildTraverse('UnitHealthbarLines'), 2900);
    const create = parts.harness.$.CreatePanel;
    parts.harness.$.CreatePanel = function (type, parent, id) {
      if (id === missing && reject) throw new Error('temporary owned layer creation failure');
      return create(type, parent, id);
    };
  });
  assert.ok(gridOf(fixture));
  assert.equal(gridOf(fixture).FindChildTraverse(missing), null);
  reject = false;
  fixture.harness.scheduler.runByDelay(1);
  assert.ok(gridOf(fixture).FindChildTraverse(missing));
  assert.equal(shownPips(fixture, 'HPV2PipEmpty').length, 29);
});

for (const [classes, gate, scale, legacyX, legacyY, expected] of [
  [['building', 'enemy'], 'buildingEnemyEnabled', 1.8, -80, -52, [175.6, 74.8]],
  [['neutral_weak', 'team_neutral'], 'npcNeutralEnabled', 0.8, 20, 13, [133.6, 73.8]],
]) test('scaled shared frame places HP in the counter coordinate space: ' + gate, () => {
  const windowScale = 2;
  const fixture = makeOwnershipFixture(classes, {
    [gate]: true, readoutVisible: true, readoutOffsetY: 8,
  }, parts => {
    prepareNativeReadout(parts);
    for (const panel of [parts.window, parts.container, parts.anchor, parts.row]) {
      panel.actualuiscale_x = windowScale;
      panel.actualuiscale_y = windowScale;
    }
    for (const panel of [parts.window, parts.container]) {
      panel.actuallayoutwidth = 200 * windowScale;
      panel.actuallayoutheight = 210 * windowScale;
    }
    parts.row.actuallayoutwidth = 48 * windowScale;
    parts.row.actuallayoutheight = 24 * windowScale;
    for (const panel of [parts.status, parts.info, parts.stack, parts.primary, parts.inner, parts.fill]) {
      panel.actualuiscale_x = scale * windowScale;
      panel.actualuiscale_y = scale * windowScale;
    }
    for (const panel of [parts.status, parts.info, parts.stack]) {
      panel.actuallayoutwidth = 200 * scale * windowScale;
      panel.actuallayoutheight = 210 * scale * windowScale;
    }
    parts.primary.actualxoffset = 70.5 * scale * windowScale;
    parts.primary.actualyoffset = 65 * scale * windowScale;
    parts.primary.actuallayoutwidth = 76 * scale * windowScale;
    parts.primary.actuallayoutheight = 18 * scale * windowScale;
    parts.inner.actuallayoutwidth = 69 * scale * windowScale;
    parts.fill.actuallayoutwidth = 34.5 * scale * windowScale;
    const motion = parts.window.add(new MockPanel('HPV2MotionFrame', {
      actualxoffset: 50 * windowScale, actualyoffset: 65 * windowScale,
      actualuiscale_x: windowScale, actualuiscale_y: windowScale,
      actuallayoutwidth: 100 * windowScale, actuallayoutheight: 40 * windowScale,
    }));
    parts.status.SetParent(motion);
    parts.container.SetParent(motion);
    parts.status.actualxoffset = (legacyX - 50) * windowScale;
    parts.status.actualyoffset = (legacyY - 65) * windowScale;
    parts.container.actualxoffset = -50 * windowScale;
    parts.container.actualyoffset = -65 * windowScale;
  });
  const [shift, top] = readoutTranslation(fixture.row);
  assert.ok(Math.abs(shift + 200 - expected[0]) < 0.01, 'right HP edge follows the scaled bar');
  assert.ok(Math.abs(top - expected[1]) < 0.01, 'HP height includes the shared-frame ancestry');
});

test('release restores unchanged cached stock values despite drift after the last scan', () => {
  let name;
  const fixture = makeOwnershipFixture(['player', 'enemy'], {
    nameSize: 22, readoutVisible: true, staminaWidth: 200,
  }, parts => {
    prepareNativeReadout(parts);
    name = parts.window.add(new MockPanel('HPV2NameAnchor')).add(new MockPanel('name', {
      style: { transform: 'rotateZ(5deg)', fontSize: '14px' },
    }));
  });
  name.style.transform = 'translate3d(17px, 0px, 0px)';
  fixture.health.style.transform = 'rotateZ(90deg)';
  fixture.stamina.style.transform = 'translate3d(9px, 0px, 0px)';
  fixture.update({ enabled: false });
  assert.equal(name.style.transform, 'rotateZ(5deg)');
  assertNativeStock(fixture.health);
  assert.equal(fixture.stamina.style.transform || '', '');
});

test('OLD late line layout and fallback move accessories without replacing engine lines', () => {
  let lines, children;
  const fixture = makeOwnershipFixture(['player', 'enemy'], {
    barMask: 'old', accessoryAnchorEnabled: true,
  }, parts => {
    lines = parts.primary.FindChildTraverse('UnitHealthbarLines');
    setEngineLines(lines, 2900);
    children = lines.children.slice();
    lines.actuallayoutwidth = 0;
    for (const child of children) child.actualxoffset = 0;
  });
  const baseline = [fixture.level, fixture.unitInfo].map(panel => Number.parseFloat(panel.style.marginTop));
  lines.actuallayoutwidth = 69;
  children.forEach((child, index) => { child.actualxoffset = 250 * (index + 1) / 2900 * 69; });
  paintReadout(fixture);
  assert.deepEqual(lines.children, children, 'engine line identities did not change');
  [fixture.level, fixture.unitInfo].forEach((panel, index) =>
    assert.equal(Number.parseFloat(panel.style.marginTop), baseline[index] - 2.5, 'three-row OLD group follows grid center'));
  lines.actuallayoutwidth = 0;
  paintReadout(fixture);
  [fixture.level, fixture.unitInfo].forEach((panel, index) =>
    assert.equal(Number.parseFloat(panel.style.marginTop), baseline[index], 'native fallback restores the accessory center'));
});

test("confirmed hidden entry clears owned pulses once and resumes current state on reveal", () => {
  const values = { enemyPulseEnabled: true, enemyPulseThreshold: 100, enemyPulseReadout: true,
    enemyPulseColorEnabled: true, enemyPulseColorMode: "gradient", readoutVisible: true };
  for (const gate of ["health_hidden", "GameStatePreGame", "beingSpectatedInEye"]) {
    const fixture = makeOwnershipFixture(["player", "enemy"], values);
    const overlay = fixture.inner.FindChildTraverse("hp_colors_pulse_overlay");
    assert.equal(fixture.fill.BHasClass("HPColorsRewritePulse"), true);
    fixture.world.AddClass(gate);
    fixture.harness.scheduler.runByDelay(1);
    for (const panel of [fixture.fill, fixture.health])
      assert.equal(panel.BHasClass("HPColorsRewritePulse"), false, gate);
    assert.equal(overlay.BHasClass("HPColorsRewriteColorPulse"), false, gate);
    assert.equal(overlay.style.clip || "", "");
    const panels = [fixture.fill, fixture.health, overlay];
    for (const panel of panels) panel.styleWrites.length = 0;
    fixture.harness.scheduler.runFor(2000);
    for (const panel of panels) assert.deepEqual(panel.styleWrites, [], "hidden cleanup is one-shot");
    fixture.fill.actuallayoutwidth = 17.25;
    fixture.update({ ...values, enemyPulseBpm: 90 });
    fixture.world.RemoveClass(gate);
    fixture.harness.scheduler.runFor(1000);
    for (const panel of [fixture.fill, fixture.health])
      assert.equal(panel.BHasClass("HPColorsRewritePulse"), true, gate);
    assert.equal(overlay.BHasClass("HPColorsRewriteColorPulse"), true, gate);
    assert.equal(overlay.style.clip, "rect(0%, 25%, 100%, 0%)");
    assert.equal(overlay.style.animationDuration, "0.667s");
  }
});

// Failure mode: the hidden gate re-walks every ancestor each scan (D3: scan cost doubled).
test("steady scans read hidden gates only on classification carriers", () => {
  const fixture = makeOwnershipFixture(["player", "enemy"]);
  fixture.harness.scheduler.runFor(2000);
  let reads = 0;
  for (const panel of [fixture.inner, fixture.primary, fixture.stack, fixture.info]) {
    const has = panel.BHasClass.bind(panel);
    panel.BHasClass = name => (name === "health_hidden" && reads++, has(name));
  }
  fixture.harness.scheduler.runFor(10000);
  assert.equal(reads, 0, "non-carrier ancestors are not re-read for hidden gates");
});

test("steady scans read general style drift only on full-resolve scans", () => {
  const fixture = makeOwnershipFixture(["player", "enemy"]);
  fixture.harness.scheduler.runFor(2000);
  let reads = 0;
  const style = fixture.marker.style;
  fixture.marker.style = new Proxy(style, {
    get(target, key) {
      if (key === "visibility") reads++;
      return target[key];
    },
  });
  for (let index = 0; index < 10; index++) fixture.harness.scheduler.runByDelay(1);
  assert.equal(reads, 2, "the general style sentinel runs once per five scans");
  style.visibility = "visible";
  fixture.harness.scheduler.runFor(5000);
  assert.equal(style.visibility, "collapse", "periodic drift repair still restores ownership");
});

// Dormant non-heroes retain classification/canvas sentinels, not active ownership probes.
test('dormant scans skip cached parts and hidden gates until a full resolve or wake', () => {
  const fixture = makeOwnershipFixture(['building', 'enemy'], { widthScale: 150 }, parts => parts.stamina.SetParent(null));
  fixture.harness.scheduler.runFor(2000);
  let gates = 0, partReads = 0;
  const has = fixture.world.BHasClass.bind(fixture.world);
  fixture.world.BHasClass = name => (name === 'health_hidden' && gates++, has(name));
  const parent = fixture.fill.GetParent.bind(fixture.fill);
  fixture.fill.GetParent = () => (partReads++, parent());
  for (let index = 0; index < 10; index++) fixture.harness.scheduler.runByDelay(1);
  assert.equal(gates, 2, 'hidden gates run only on every-fifth full resolves');
  assert.equal(partReads, 2, 'only full resolves snapshot part parents');
  fixture.update({ widthScale: 160 });
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(partReads, 3, 'config wakes a full reconcile even while the UNITS toggle stays off');
  fixture.update({ widthScale: 150 });
  fixture.harness.scheduler.runByDelay(1);
  fixture.world.RemoveClass('building');
  fixture.world.AddClass('player');
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.stack.style.preTransformScale2d, '1.5, 1', 'kind wake reconciles immediately');
  assert.ok(gates > 2, 'wake reads hidden gates immediately');
});

test("bar outline owns only the primary backer without moving measured geometry and releases masks", () => {
  const fixture = makeOwnershipFixture(["player", "enemy"], { barMask: "original" }, ({ inner, stack }) => {
    inner.actuallayoutheight = 12; inner.actualxoffset = 6; inner.actualyoffset = 3.5;
    const shield = stack.add(new MockPanel("UnitShieldbar", { classes: ["UnitHealthbarContainer"] }));
    shield.add(new MockPanel("UnitHealthbarInner"));
  });
  const backer = () => fixture.primary.FindChildTraverse("HPV2BarOutline");
  assert.equal(backer().hittest, false);
  assert.equal(backer().hittestchildren, false);
  assert.equal(backer().style.position, "5px 2.5px 0px");
  assert.equal(backer().style.width, "71px");
  assert.equal(backer().style.height, "14px");
  assert.equal(backer().style.backgroundColor, "", "stock CSS owns the default outline color");
  assert.equal(fixture.primary.BHasClass("HPColorsRewriteBarOutline"), true);
  fixture.update({ barMask: "original", barOutlineCustomColor: true, barOutlineThickness: 2.5, barOutlineColor: "#123456", barOutlineOpacity: 37 });
  assert.equal(backer().style.position, "3.5px 1px 0px");
  assert.equal(backer().style.width, "74px");
  assert.equal(backer().style.opacity, "0.37");
  assert.equal(backer().style.backgroundColor, "#123456");
  for (const property of ["width", "height", "position", "marginLeft", "marginTop"])
    assert.equal(fixture.inner.style[property] || "", "", property);
  const shield = fixture.stack.FindChildTraverse("UnitShieldbar");
  assert.equal(shield.FindChildTraverse("HPV2BarOutline"), null);
  assert.equal(shield.BHasClass("HPColorsRewriteBarOutline"), false);
  const writes = backer().__styleWrites.length;
  fixture.fill.actuallayoutwidth = 20; paintReadout(fixture);
  assert.equal(backer().__styleWrites.length, writes, "health ticks do not repaint the rim");
  fixture.update({ barMask: "original", barOutlineEnabled: false });
  assert.equal(backer().style.visibility, "collapse");
  assert.equal(fixture.primary.BHasClass("HPColorsRewriteBarOutline"), false);
  assert.equal(fixture.window.BHasClass("HPColorsRewriteBarMask"), true, "off restores the container mask without changing BAR STYLE");
  fixture.update({ barMask: "original" });
  fixture.status.valid = false; fixture.harness.scheduler.runNext();
  assert.equal(fixture.primary.BHasClass("HPColorsRewriteBarOutline"), false);
  assert.equal(backer().style.visibility, "collapse");
});

test("bar outline follows every UNITS gate and neutral precedence", () => {
  for (const [classes, gate] of [[["creature", "enemy"], "npcEnemyEnabled"],
    [["creature", "friend"], "npcAllyEnabled"], [["neutral_weak", "team_neutral"], "npcNeutralEnabled"],
    [["building", "enemy"], "buildingEnemyEnabled"]]) {
    const fixture = makeOwnershipFixture(classes, {}, ({ inner }) => { inner.actuallayoutheight = 12; });
    assert.equal(fixture.primary.FindChildTraverse("HPV2BarOutline"), null);
    fixture.update({ [gate]: true });
    assert.equal(fixture.primary.BHasClass("HPColorsRewriteBarOutline"), true, gate);
    fixture.update({ [gate]: false });
    assert.equal(fixture.primary.BHasClass("HPColorsRewriteBarOutline"), false, gate);
    assert.equal(fixture.primary.FindChildTraverse("HPV2BarOutline").style.visibility, "collapse");
  }
});

test("OLD outline draws solid backers under fixed pips and never writes on health ticks", () => {
  const fixture = makeOldFixture(2850, { barOutlineThickness: 10, barOutlineOpacity: 40 });
  const grid = gridOf(fixture);
  const outline = () => fixture.primary.FindChildTraverse("HPV2PipOutline");
  const boxes = shownPips(fixture, "HPV2PipOutline");
  assert.equal(boxes.length, 29);
  assert.ok(grid.children.indexOf(outline()) < grid.children.indexOf(fixture.primary.FindChildTraverse("HPV2PipEmpty")),
    "rims draw under the boxes");
  assert.equal(outline().hittest, false);
  assert.equal(outline().style.opacity, "0.4");
  assert.equal(boxes[0].style.backgroundColor, "", "stock CSS owns OLD colors too");
  assert.equal(boxes[0].style.border || "", "");
  // Three rows -> 18px grid; box 0 is bottom-left: y = 18 * 2/3 - 10, height = 4.8 + 20.
  assert.equal(boxes[0].style.position, "-10px 2px 0px");
  assert.equal(boxes[0].style.height, "24.8px");
  assert.equal(boxes[20].style.position, "-10px -10px 0px");
  const full = parseFloat(boxes[0].style.width) - 20;
  assert.ok(Math.abs(parseFloat(boxes[28].style.width) - 20 - full / 2) < 0.02, "half-capacity last box");
  const writes = layerWrites(fixture, "HPV2PipOutline") + outline().__styleWrites.length;
  for (let i = 0; i < 4; i++) { fixture.fill.actuallayoutwidth -= 1; paintReadout(fixture); }
  assert.equal(layerWrites(fixture, "HPV2PipOutline") + outline().__styleWrites.length, writes);
  fixture.update({ barMask: "old", barOutlineEnabled: false });
  assert.equal(outline().style.visibility, "collapse");
  fixture.update({ barMask: "old", barOutlineCustomColor: true, barOutlineColor: "#ABCDEF" });
  assert.equal(outline().style.visibility, "visible");
  assert.equal(shownPips(fixture, "HPV2PipOutline")[0].style.backgroundColor, "#ABCDEF");
  setEngineLines(fixture.primary.FindChildTraverse("UnitHealthbarLines"), 900, 2);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(shownPips(fixture, "HPV2PipOutline").length, 9);
  fixture.update({ barMask: "old", enabled: false });
  assert.equal(outline().style.visibility, "collapse");
});

test("OLD outline returns after the engine briefly drops its health lines", () => {
  const fixture = makeOldFixture(2850);
  const lines = fixture.primary.FindChildTraverse("UnitHealthbarLines");
  const outline = () => fixture.primary.FindChildTraverse("HPV2PipOutline");
  assert.equal(outline().style.visibility, "visible");
  setEngineLines(lines, 0, 2);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(outline().style.visibility, "collapse", "no grid while lines are missing");
  setEngineLines(lines, 2850, 2);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(outline().style.visibility, "visible");
  assert.equal(shownPips(fixture, "HPV2PipOutline").length, 29);
});

test("OLD enemy outline recovers on health-only paint after a transient surface collapse", () => {
  const source = rendererSource.replace('function applyCustomization(bar, restoring) {',
    'function applyCustomization(bar, restoring) { $.__outlineBar = bar; $.__syncOldOutline = syncOldOutline;');
  const fixture = makeOwnershipFixture(["player", "enemy"], { barMask: "old", enemyKillMarkerEnabled: true },
    ({ primary }) => setEngineLines(primary.FindChildTraverse("UnitHealthbarLines"), 2850, 2), null, source);
  const bar = fixture.harness.$.__outlineBar;
  const outline = fixture.primary.FindChildTraverse("HPV2PipOutline");
  assert.equal(outline.style.visibility, "visible");
  bar.surface = "";
  fixture.harness.$.__syncOldOutline(bar);
  assert.equal(outline.style.visibility, "collapse");
  bar.surface = "player";
  bar.dirty = false; bar.healthDirty = true; bar.colorDirty = false;
  fixture.fill.actuallayoutwidth -= 1;
  paintReadout(fixture);
  assert.equal(outline.style.visibility, "visible", "cached geometry must not retain collapsed visibility");
  assert.equal(fixture.primary.FindChildTraverse("HPV2PipKillMarker").style.visibility, "visible");
});

test("OLD kill marker sits at the threshold HP inside its pip box", () => {
  const fixture = makeOldFixture(2850, { enemyKillMarkerEnabled: true, enemyKillMarkerThreshold: 50 });
  const marker = () => fixture.primary.FindChildTraverse("HPV2PipKillMarker");
  // 1425 HP -> box 14 (row 1, column 4), 25 HP in: 40% + 8.5% * 0.25.
  assert.equal(marker().GetParent(), gridOf(fixture));
  assert.equal(marker().style.visibility, "visible");
  assert.equal(marker().style.position, "42.125% 33.333% 0px");
  assert.equal(marker().style.height, "26.667%");
  const stock = fixture.primary.FindChildTraverse("hp_colors_kill_marker");
  assert.ok(!stock || stock.style.visibility === "collapse", "line-bar marker stays hidden on OLD");
  const writes = marker().__styleWrites.length;
  for (let i = 0; i < 4; i++) { fixture.fill.actuallayoutwidth -= 1; paintReadout(fixture); }
  assert.equal(marker().__styleWrites.length, writes, "health ticks do not move the marker");
  fixture.update({ barMask: "old", enemyKillMarkerEnabled: true, enemyKillMarkerThreshold: 10 });
  assert.equal(marker().style.position, "27.225% 66.667% 0px", "285 HP -> box 2, 85 HP in");
  fixture.update({ barMask: "old", enemyKillMarkerEnabled: false });
  assert.equal(marker().style.visibility, "collapse");
  fixture.update({ barMask: "original", enemyKillMarkerEnabled: true });
  assert.equal(marker().style.visibility, "collapse");
});

// Live trace: the enemy-only grid marker was missing from resolved parts, so every
// fifth (full-resolve) scan saw "changed parts", reset the bar and deleted its rims.
test("OLD kill marker does not make full resolves reset the bar and drop its rims", () => {
  const fixture = makeOldFixture(2850, { enemyKillMarkerEnabled: true, enemyKillMarkerThreshold: 50 });
  const boxes = shownPips(fixture, "HPV2PipOutline");
  const empty = shownPips(fixture, "HPV2PipEmpty");
  for (let scan = 0; scan < 12; scan++) fixture.harness.scheduler.runByDelay(1);
  assert.deepEqual(shownPips(fixture, "HPV2PipOutline"), boxes, "rim boxes survive full resolves");
  assert.deepEqual(shownPips(fixture, "HPV2PipEmpty"), empty, "pips are not rebuilt");
});

test("outline stock CSS mirrors ancestor colors and rule order for whole bars and OLD boxes", () => {
  const css = fs.readFileSync(path.resolve(sourceRoot, '../styles/unit_status_v2.css'), 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selectors, body]) =>
    selectors.includes('#HPV2BarOutline') && /background-color:/.test(body));
  const expected = [['.team1', 'team1ColorDark'], ['.team2', 'team2ColorDark'],
    ['.friend', 'rgb(4, 37, 23)'], ['.team_neutral', 'offBlack'], ['.enemy', 'offBlack'],
    ['.enemy.health_critical .ShowCriticalState', 'rgb(47, 4, 4)']];
  assert.equal(rules.length, expected.length);
  for (const [index, [ancestor, color]] of expected.entries()) {
    const [, selectors, body] = rules[index];
    assert.deepEqual(selectors.replace(/\/\*[\s\S]*?\*\//g, '').trim().split(',').map(s => s.trim()),
      [ancestor + ' #HPV2BarOutline', ancestor + ' .HPV2PipOutlineBox']);
    assert.equal(body.trim(), 'background-color: ' + color + ';');
  }
});

test("custom outline colors apply only to heroes and repaint on relation or kind changes", () => {
  for (const mask of ["none", "original", "old"]) {
    const custom = { barMask: mask, barOutlineCustomColor: true, barOutlineColor: "#123456", allyBarOutlineColor: "#ABCDEF",
      npcEnemyEnabled: true, npcAllyEnabled: true, npcNeutralEnabled: true, buildingEnemyEnabled: true, buildingAllyEnabled: true };
    const fixture = makeOwnershipFixture(["player", "enemy"], custom, ({ primary, inner }) => {
      inner.actuallayoutheight = 12;
      setEngineLines(primary.FindChildTraverse("UnitHealthbarLines"), 2850, 2);
    });
    const outlines = () => mask === "old" ? shownPips(fixture, "HPV2PipOutline")
      : [fixture.primary.FindChildTraverse("HPV2BarOutline")];
    const colorIs = color => { assert.ok(outlines().length); for (const panel of outlines()) assert.equal(panel.style.backgroundColor, color); };
    colorIs("#123456");
    fixture.world.RemoveClass("enemy"); fixture.world.AddClass("friend");
    fixture.harness.scheduler.runByDelay(1);
    colorIs("#ABCDEF");
    fixture.world.RemoveClass("player"); fixture.world.AddClass("creature");
    fixture.harness.scheduler.runByDelay(1);
    colorIs("");
    fixture.world.RemoveClass("friend"); fixture.world.AddClass("enemy");
    fixture.harness.scheduler.runByDelay(1);
    colorIs("");
    fixture.world.AddClass("team_neutral");
    fixture.harness.scheduler.runByDelay(1);
    colorIs("");
    fixture.world.RemoveClass("team_neutral"); fixture.world.AddClass("building");
    fixture.harness.scheduler.runByDelay(1);
    colorIs("");
    fixture.world.RemoveClass("building"); fixture.world.RemoveClass("creature"); fixture.world.AddClass("player");
    fixture.harness.scheduler.runByDelay(1);
    colorIs("#123456");
    fixture.update({ ...custom, barOutlineCustomColor: false });
    colorIs("");
    const writes = outlines().reduce((n, panel) => n + panel.__styleWrites.length, 0);
    fixture.world.AddClass("health_critical");
    fixture.fill.actuallayoutwidth -= 1;
    paintReadout(fixture);
    assert.equal(outlines().reduce((n, panel) => n + panel.__styleWrites.length, 0), writes,
      "stock critical color is CSS-only; health ticks do not repaint rims");
  }
});

// Native MoveChild APIs are deliberately local to the adopted-panel fixture.
function enablePickupOrdering(parent) {
  function move(child, sibling, after) {
    assert.equal(child.GetParent(), parent);
    assert.equal(sibling.GetParent(), parent);
    parent.children.splice(parent.children.indexOf(child), 1);
    parent.children.splice(parent.children.indexOf(sibling) + after, 0, child);
  }
  parent.MoveChildBefore = (child, sibling) => move(child, sibling, 0);
  parent.MoveChildAfter = (child, sibling) => move(child, sibling, 1);
}

function preparePlayerPickups(parts) {
  enablePickupOrdering(parts.window);
  enablePickupOrdering(parts.unitInfo);
  parts.window.add(new MockPanel('KillStreakIndicator', { style: {
    marginTop: '48px', marginLeft: '44px', preTransformScale2d: '0.9',
    animationName: 'TagGroove1', visibility: 'collapse',
  } })).add(new MockPanel('KSImage', { classes: ['KSImage'] }));
  parts.window.add(new MockPanel('HPV2RejuvenatorAnchor', { style: { transform: 'translate3d(2px, 3px, 0px)' } }))
    .add(new MockPanel('RejuvenatorActive', { style: { marginTop: '56px', marginLeft: '94px',
      width: '24px', height: '24px', transform: 'rotateZ(6deg)', preTransformScale2d: '0.8', visibility: 'collapse' } }));
}

function playerPickups(fixture) {
  return {
    ks: fixture.window.FindChildTraverse('KillStreakIndicator'),
    anchor: fixture.window.FindChildTraverse('HPV2RejuvenatorAnchor'),
    rejuv: fixture.window.FindChildTraverse('RejuvenatorActive'),
  };
}

test('native kill streak adopts before ultimate, survives full resolves and restores order/styles', () => {
  const fixture = makeOwnershipFixture(['player', 'CLASS_PLAYER', 'enemy'], {}, preparePlayerPickups);
  const { ks, anchor } = playerPickups(fixture);
  assert.equal(ks.GetParent(), fixture.unitInfo);
  assert.equal(fixture.unitInfo.Children()[0], ks);
  assert.equal(fixture.unitInfo.Children()[1], fixture.ultBackground);
  assert.equal(ks.BHasClass('HPColorsRewriteKillStreakAdopted'), true);
  const adoption = ks.HPV2KillStreakAdoption;
  fixture.harness.scheduler.runFor(12000);
  assert.equal(ks.HPV2KillStreakAdoption, adoption, 'periodic resolve must not reset the bar');
  fixture.update({ accessoryAnchorEnabled: false, widthScale: 230, heightScale: 160, ultOffsetX: 200, ultOffsetY: 100 });
  assert.equal(ks.GetParent(), fixture.unitInfo, 'native parent follows anchored and unanchored movement');
  assert.equal(ks.style.animationName, 'TagGroove1');
  assert.equal(ks.Children()[0].BHasClass('KSImage'), true);
  ks.style.preTransformScale2d = '1.5';
  fixture.update({ enabled: false });
  assert.equal(ks.GetParent(), fixture.window);
  assert.equal(fixture.window.Children().indexOf(ks) + 1, fixture.window.Children().indexOf(anchor));
  assert.equal(ks.BHasClass('HPColorsRewriteKillStreakAdopted'), false);
  assert.equal(fixture.unitInfo.BHasClass('HPColorsRewriteKillStreakOwner'), false);
  assert.equal(ks.HPV2KillStreakAdoption, undefined);
  assert.equal(ks.style.preTransformScale2d, '0.9');
  assert.equal(ks.style.marginTop, '48px');
  assert.equal(ks.style.marginLeft, '44px');
  assert.equal(ks.style.visibility, 'collapse');
});

test('Rejuvenator offsets translate the anchor only, scale/tilt the leaf and restore captured styles', () => {
  for (const role of ['enemy', 'friend']) {
    const fixture = makeOwnershipFixture(['player', 'CLASS_PLAYER', role],
      { rejuvOffsetX: 20, rejuvOffsetY: -40, rejuvTilt: -90, rejuvScale: 150 }, preparePlayerPickups);
    const { anchor, rejuv } = playerPickups(fixture);
    assert.equal(anchor.style.transform, 'translate3d(20px, -40px, 0px)');
    assert.equal(rejuv.style.transform, 'rotateZ(-90deg)');
    assert.equal(rejuv.style.preTransformScale2d, '1.5');
    assert.equal(rejuv.style.visibility, 'collapse');
    for (const property of ['marginTop', 'marginLeft', 'width', 'height'])
      assert.equal(rejuv.styleWrites.filter(write => write.property === property).length, 0, property);
    anchor.styleWrites.length = rejuv.styleWrites.length = 0;
    fixture.harness.scheduler.runFor(12000);
    assert.equal(anchor.styleWrites.length + rejuv.styleWrites.length, 0, 'steady state has no repeated writes/full-resolve reset');
    fixture.world.AddClass('LocalPlayer');
    fixture.harness.scheduler.runByDelay(1);
    assert.equal(anchor.style.transform, 'translate3d(2px, 3px, 0px)');
    assert.equal(rejuv.style.transform, 'rotateZ(6deg)');
    assert.equal(rejuv.style.preTransformScale2d, '0.8');
    assert.equal(playerPickups(fixture).ks.GetParent(), fixture.window);
    fixture.world.RemoveClass('LocalPlayer');
    fixture.harness.scheduler.runByDelay(1);
    assert.equal(rejuv.style.preTransformScale2d, '1.5');
    fixture.world.RemoveClass('player'); fixture.world.RemoveClass('CLASS_PLAYER'); fixture.world.AddClass('creature');
    fixture.update({ npcEnemyEnabled: true, npcAllyEnabled: true, rejuvScale: 200 });
    assert.equal(rejuv.style.preTransformScale2d, '0.8', 'non-player owned surfaces restore');
  }
});

test('pickup ownership is absent on LocalPlayer, neutral, NPC and building surfaces', () => {
  for (const classes of [['player', 'enemy', 'LocalPlayer'], ['creature', 'enemy'],
    ['creature', 'team_neutral'], ['building', 'enemy']]) {
    const fixture = makeOwnershipFixture(classes, { npcEnemyEnabled: true, npcNeutralEnabled: true,
      buildingEnemyEnabled: true, rejuvScale: 200, rejuvTilt: 100 }, preparePlayerPickups);
    const { ks, rejuv, anchor } = playerPickups(fixture);
    assert.equal(ks.GetParent(), fixture.window);
    assert.equal(ks.HPV2KillStreakAdoption, undefined);
    assert.equal(rejuv.styleWrites.length + anchor.styleWrites.length, 0, classes.join(' '));
  }
});

test('timer mirrors adopted kill-streak size and restores on release, replacement and stop', () => {
  const fixture = makeOwnershipFixture(['player', 'CLASS_PLAYER', 'enemy'], { ultimateTimerSize: 150 }, preparePlayerPickups);
  const timerSource = fs.readFileSync(path.join(sourceRoot, 'test_topbar_pickups.js'), 'utf8');
  runInVm(timerSource, fixture.context);
  const { ks, anchor, rejuv } = playerPickups(fixture);
  assert.equal(ks.style.preTransformScale2d, '1.5');
  assert.equal(fixture.ultBackground.style.preTransformScale2d, '1.5');
  const adopted = ks.HPV2KillStreakAdoption;
  const writes = ks.styleWrites.length;
  fixture.harness.scheduler.runFor(9000);
  assert.equal(ks.styleWrites.length, writes, 'timer writes stay cached');
  assert.equal(ks.HPV2KillStreakAdoption, adopted, 'renderer does not fight timer-owned scale');
  // An engine leaf replacement resets the bar while retaining the native flame.
  rejuv.SetParent(fixture.window);
  const replacement = anchor.add(new MockPanel('RejuvenatorActive', { style: { transform: 'rotateZ(12deg)', preTransformScale2d: '0.7' } }));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(rejuv.style.preTransformScale2d, '0.8');
  assert.notEqual(ks.HPV2KillStreakAdoption, adopted);
  fixture.harness.scheduler.runFor(3000);
  assert.equal(ks.style.preTransformScale2d, '1.5', 'new adoption invalidates cached scale even for the same panel');
  fixture.update({ enabled: false });
  assert.equal(ks.style.preTransformScale2d, '0.9');
  assert.equal(replacement.style.preTransformScale2d, '0.7');
  fixture.update({ ultimateTimerSize: 200 });
  fixture.harness.scheduler.runFor(3000);
  assert.equal(ks.style.preTransformScale2d, '2');
  fixture.status.HPV2PickupStop();
  assert.equal(ks.style.preTransformScale2d, '0.9');
  fixture.primary.DeleteAsync();
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(ks.GetParent(), fixture.window);
  assert.equal(replacement.style.preTransformScale2d, '0.7');
});


test('hidden pickup owners still release on master-off, LocalPlayer and non-player transitions', () => {
  for (const release of ['master', 'local', 'kind']) {
    const fixture = makeOwnershipFixture(['player', 'CLASS_PLAYER', 'enemy'], { rejuvScale: 150 }, preparePlayerPickups);
    const { ks, rejuv } = playerPickups(fixture);
    fixture.world.AddClass('health_hidden');
    fixture.harness.scheduler.runByDelay(1);
    if (release === 'master') fixture.update({ enabled: false });
    else {
      if (release === 'local') fixture.world.AddClass('LocalPlayer');
      else { fixture.world.RemoveClass('player'); fixture.world.RemoveClass('CLASS_PLAYER'); fixture.world.AddClass('creature'); }
      fixture.harness.scheduler.runByDelay(1);
    }
    assert.equal(ks.GetParent(), fixture.window, release);
    assert.equal(ks.HPV2KillStreakAdoption, undefined, release);
    assert.equal(rejuv.style.preTransformScale2d, '0.8', release);
  }
});

test('replaced native kill streak adopts before background and restores its original order on release', () => {
  const fixture = makeOwnershipFixture(['player', 'CLASS_PLAYER', 'enemy'], { ultimateTimerSize: 150 }, preparePlayerPickups);
  runInVm(fs.readFileSync(path.join(sourceRoot, 'test_topbar_pickups.js'), 'utf8'), fixture.context);
  const old = playerPickups(fixture).ks;
  old.SetParent(fixture.window);
  const next = fixture.unitInfo.add(new MockPanel('KillStreakIndicator', { style: { preTransformScale2d: '0.7' } }));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(old.HPV2KillStreakAdoption, undefined);
  assert.equal(old.style.preTransformScale2d, '0.9');
  assert.equal(fixture.unitInfo.Children()[0], next);
  fixture.harness.scheduler.runFor(3000);
  assert.equal(next.style.preTransformScale2d, '1.5');
  fixture.update({ enabled: false });
  assert.equal(next.GetParent(), fixture.unitInfo, 'already native in group: release restores that parent');
  assert.ok(fixture.unitInfo.Children().indexOf(next) > fixture.unitInfo.Children().indexOf(fixture.ultBackground));
  assert.equal(next.style.preTransformScale2d, '0.7');
  assert.equal(next.BHasClass('HPColorsRewriteKillStreakAdopted'), false);
});
