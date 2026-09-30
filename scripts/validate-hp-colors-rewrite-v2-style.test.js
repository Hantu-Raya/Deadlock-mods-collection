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
  const panel = { style: new Proxy({}, {
    get(target, key) {
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
  for (let i = 0; i < 10; i++) {
    setStyle(panel, 'washColor', '#FD4949', cache, 'color');
    setStyle(panel, 'marginLeft', '30px', cache, 'left');
    setStyle(panel, 'marginTop', '10px', cache, 'top');
  }
  assert.equal(writes, 3, 'unchanged native values must not trigger more assignments');

  color = '#000000FF';
  assert.equal(cachedStyleDrift(panel, 'washColor', cache, 'color'), true);
  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  assert.equal(color, '#FD4949FF');

  left = '0px';
  top = '0px';
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

function makeOwnershipFixture(classes, values = {}, beforeBoot = null) {
  const harness = createPanoramaHarness();
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
  const info = add(status, 'InfoHealthContainer');
  const level = add(info, 'LevelContainer', {
    actuallayoutwidth: 21, actuallayoutheight: 21, actualxoffset: -23, actualyoffset: 2.5,
    style: { marginLeft: '', marginTop: '' },
  });
  add(level, 'unit_level_label', { text: '10' });
  const unitInfo = add(info, 'unit_info_panel', {
    classes: ['unit_info_panel'],
    actuallayoutwidth: 22, actuallayoutheight: 22, actualxoffset: 0, actualyoffset: 2,
    style: { marginLeft: '', marginTop: '' },
  });
  add(unitInfo, 'unit_info_bg');
  const stack = add(info, 'UnitHealthbarsContainer');
  const primary = add(stack, 'UnitHealthbar', { classes: ['UnitHealthbarContainer'] });
  const inner = add(primary, 'UnitHealthbarInner', { actuallayoutwidth: 69 });
  add(inner, 'unit_healthbar_lagging', { actuallayoutwidth: 34.5 });
  add(primary, 'UnitHealthbarLines');
  const health = add(info, 'UnitHealthbarValue', { text: '345', style: { visibility: 'visible' } });
  const shield = add(info, 'UnitShieldbarValue', { text: '999', style: { visibility: 'visible' } });
  const shieldWrites = [];
  shield.style = new Proxy(shield.style, {
    set(target, property, value) {
      shieldWrites.push([property, value]);
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
  const container = add(window, 'hp_counter_container');
  const anchor = add(container, 'hp_counter_anchor');
  const row = add(anchor, 'hp_counter_row');
  const counter = add(row, 'hp_counter', { style: { visibility: 'collapse' } });
  const counterMax = add(row, 'hp_counter_max', { style: { visibility: 'collapse' } });
  let revision = 0;
  const setConfig = (nextValues) => harness.root.SetAttributeString('hp_colors_v2_config', JSON.stringify({
    magic_word: 'HP_COLORS_V2_CONFIG', version: 2, revision: ++revision, values: nextValues,
  }));
  setConfig(values);
  harness.contextPanel = status;
  if (beforeBoot) beforeBoot({ harness, world, window, status, stack, primary, inner,
    health, shield, info, anchor, row, counter, counterMax });
  const context = createVmContext(harness, { includeGameUI: false });
  runInVm(contractSource, context);
  runInVm(rendererSource, context);
  return {
    harness, world, window, status, stack, primary, inner, stamina, icon, health, shield, shieldWrites, level, unitInfo,
    info, anchor, row, counter, counterMax,
    update(nextValues) {
      setConfig(nextValues);
      harness.scheduler.runByDelay(1);
    },
  };
}

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
    const fixture = makeOwnershipFixture(['player', 'enemy'], { enabled: true, ...custom });
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), true);
    fixture.update({ enabled: false, ...custom });
    assert.equal(fixture.window.BHasClass('HPColorsRewriteEnemyPlayer'), false);
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), false);
    assert.equal(fixture.icon.style.width, '11px');
    assert.equal(fixture.icon.style.height, '4.48px');
    assert.equal(fixture.icon.style.backgroundColor, '#ABCDEF');
    assert.equal(fixture.icon.style.borderColor, '#123456');
    fixture.update({ enabled: true, ...custom });
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), true);
    fixture.update({ enabled: true });
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), false);
  }
  for (const classes of [['player', 'friend'], ['minion', 'enemy'], ['building', 'enemy'], ['enemy']]) {
    const fixture = makeOwnershipFixture(classes, {
      enabled: true, npcEnemyEnabled: true, buildingEnemyEnabled: true, staminaWidth: 120,
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
    fixture.update({ enabled: true, readoutVisible: true, allyReadoutVisible: true, staminaWidth: 120 });
    assert.equal(fixture.health.style.visibility, 'visible');
    assert.equal(fixture.health.GetParent(), fixture.row);
    assert.equal(fixture.stamina.BHasClass('HPColorsRewriteStaminaOwned'), classes.includes('enemy'));
    fixture.world.RemoveClass('player');
    fixture.world.AddClass('minion');
    fixture.update({ enabled: true, npcEnemyEnabled: true, npcAllyEnabled: true,
      readoutVisible: true, allyReadoutVisible: true, staminaWidth: 120 });
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
      assert.equal(fixture.anchor.style.transform, 'translate3d(60px, -110px, 0px)');
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

test('runtime HP/percent switching returns the engine label and transfers pulse cleanly', () => {
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
  assertNativeStock(fixture.health, 'collapse');
  assert.equal(fixture.health.GetParent(), fixture.info);
  assert.equal(fixture.counter.text, '50%');
  assert.equal(fixture.counter.style.visibility, 'visible');
  assert.equal(fixture.counterMax.style.visibility, 'collapse');
  assert.equal(fixture.counter.style.washColor, '#123456');
  assert.equal(fixture.counter.style.fontSize, '20px');
  assert.equal(fixture.counter.style.fontFamily, 'VALVEOracle, Reaver, sans-serif');
  assert.equal(fixture.anchor.style.transform, 'translate3d(50px, -100px, 0px)');
  assert.equal(fixture.counter.BHasClass('HPColorsRewritePulseIntense'), true);
  const writes = fixture.counter.readoutTextWrites.length;
  fixture.update({ ...values, readoutFormat: 'current', enemyPulseIntensity: 0 });
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.style.visibility, 'visible');
  assert.equal(fixture.health.style.washColor, '#123456');
  assert.equal(fixture.anchor.style.transform, 'translate3d(50px, -100px, 0px)');
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulseSubtle'), true);
  assert.equal(fixture.health.BHasClass('HPColorsRewritePulseIntense'), false);
  for (const panel of [fixture.counter, fixture.counterMax]) assertInactiveReadout(panel);
  assert.equal(fixture.counter.readoutTextWrites.length, writes, 'native transition must not write hidden text');
  assert.deepEqual(fixture.health.readoutTextWrites, []);
  assert.equal(fixture.health.readoutTextReads, 0);
  fixture.update({ ...values, readoutFormat: 'percent', enemyPulseEnabled: false });
  assertNativeStock(fixture.health, 'collapse');
  assert.equal(fixture.health.GetParent(), fixture.info);
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

test('counter row replacement never orphans the adopted engine label', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, prepareNativeReadout);
  fixture.row.SetParent(fixture.window);
  const row = fixture.anchor.add(new MockPanel('hp_counter_row'));
  row.add(new MockPanel('hp_counter', { style: { visibility: 'collapse' } }));
  row.add(new MockPanel('hp_counter_max', { style: { visibility: 'collapse' } }));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.health.GetParent(), row);
  assert.deepEqual(fixture.health.readoutParentWrites, [fixture.row, fixture.info, row]);
  fixture.update({ enabled: false });
  assert.equal(fixture.health.GetParent(), fixture.info);
  assertNativeStock(fixture.health);
});

test('InfoHealthContainer replacement retains pointer identity when the original parent expires', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, prepareNativeReadout);
  fixture.info.SetParent(fixture.window);
  const info = fixture.status.add(new MockPanel('InfoHealthContainer'));
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
  const panels = [fixture.health, fixture.counter, fixture.counterMax, fixture.anchor, fixture.window];
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
    fixture.harness.scheduler.runNext();
    fixture.update(values);
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

test('accessory margins defer to CSS at zero delta and restore after offsets or bypass', () => {
  for (const classes of [['player', 'enemy'], ['player', 'friend']]) {
    const fixture = makeOwnershipFixture(classes);
    const assertCssMargins = () => {
      for (const panel of [fixture.level, fixture.unitInfo]) {
        assert.equal(panel.style.marginLeft, '');
        assert.equal(panel.style.marginTop, '');
      }
    };
    assertCssMargins();
    fixture.update({ levelOffsetX: 100, ultOffsetX: 100 });
    assert.equal(fixture.level.style.marginLeft, '-13px');
    assert.equal(fixture.unitInfo.style.marginLeft, '10px');
    assert.equal(fixture.level.style.marginTop, '');
    assert.equal(fixture.unitInfo.style.marginTop, '');
    fixture.update({ levelOffsetY: 100, ultOffsetY: 100 });
    assert.equal(fixture.level.style.marginLeft, '');
    assert.equal(fixture.unitInfo.style.marginLeft, '');
    assert.equal(fixture.level.style.marginTop, '6px');
    assert.equal(fixture.unitInfo.style.marginTop, '6px');
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

test('release renderer has no temporary health sampling diagnostic', () => {
  assert.doesNotMatch(rendererSource, /DIAG_HEALTH_SAMPLING|\[HPV2-DIAG\]|diagnos(?:e|tic)Health/);
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

test('Appearance preserves custom and empty inline masks and repairs drift on existing cadence', () => {
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
    fixture.harness.scheduler.runNext();
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
    fixture.harness.scheduler.runNext();
    assertAppearance(fixture, true);
    const writes = classWrites;
    for (let i = 0; i < 6; i++) fixture.harness.scheduler.runNext();
    assert.equal(classWrites, writes);
    reject = true;
    fixture.update({});
    assertAppearance(fixture, true);
    reject = false;
    fixture.harness.scheduler.runNext();
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

test('stock CSS differs only by permanent healthbar mask and outer-background deletions', () => {
  const css = fs.readFileSync(path.resolve(sourceRoot, '../styles/unit_status_v2.css'), 'utf8').replace(/\r\n/g, '\n');
  // Frozen 6722 stock prefix minus the three healthbar masks, eight container
  // background declarations, and their six now-empty relation rules. No other
  // stock declarations, geometry, inner backing, or critical effects may change.
  const prefix = css.split('/* Rewrite-owned additions')[0];
  assert.equal(require('node:crypto').createHash('sha256').update(prefix).digest('hex'), 'e9a067ddd5cdb9854578eb2bf85deea33fb3c30fe1eba0ba505e0f3fe82b9bdb');
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
