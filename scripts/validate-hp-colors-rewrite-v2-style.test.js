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

function makeOwnershipFixture(classes, values = {}, beforeBoot = null, sharedHarness = null, source = rendererSource) {
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
  const info = add(status, 'InfoHealthContainer');
  const level = add(info, 'LevelContainer', {
    actuallayoutwidth: 21, actuallayoutheight: 21, actualxoffset: -23, actualyoffset: 2.5,
    style: { marginLeft: '', marginTop: '', visibility: 'collapse', verticalAlign: 'middle' },
  });
  const levelLabel = add(level, 'unit_level_label', { text: '10', style: {} });
  const unitInfo = add(info, 'unit_info_panel', {
    classes: ['unit_info_panel'],
    actuallayoutwidth: 22, actuallayoutheight: 22, actualxoffset: 0, actualyoffset: 2,
    style: { marginLeft: '', marginTop: '', verticalAlign: 'middle' },
  });
  const ultBackground = add(unitInfo, 'unit_info_bg');
  const ultIcon = add(ultBackground, 'unit_ult_ready_icon');
  const ultOverlay = add(ultBackground, 'HPV2UltimateOverlay');
  const stack = add(info, 'UnitHealthbarsContainer');
  const primary = add(stack, 'UnitHealthbar', { classes: ['UnitHealthbarContainer'] });
  const inner = add(primary, 'UnitHealthbarInner', { actuallayoutwidth: 69 });
  const fill = add(inner, 'unit_healthbar_lagging', { actuallayoutwidth: 34.5 });
  const marker = add(primary, 'hp_colors_kill_marker', { style: { visibility: 'collapse' } });
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
  const container = add(window, 'hp_counter_container', { actuallayoutwidth: 200, actuallayoutheight: 210 });
  const anchor = add(container, 'hp_counter_anchor');
  const row = add(anchor, 'hp_counter_row', { actuallayoutwidth: 48, actuallayoutheight: 24 });
  const counter = add(row, 'hp_counter', { style: { visibility: 'collapse' } });
  const counterMax = add(row, 'hp_counter_max', { style: { visibility: 'collapse' } });
  let revision = 0;
  const setConfig = (nextValues) => harness.root.SetAttributeString('hp_colors_v2_config', JSON.stringify({
    magic_word: 'HP_COLORS_V2_CONFIG', version: 2, revision: ++revision, values: nextValues,
  }));
  setConfig(values);
  harness.contextPanel = status;
  if (beforeBoot) beforeBoot({ harness, world, window, status, stack, primary, inner,
    level, levelLabel, unitInfo, ultBackground, ultIcon, ultOverlay, fill, marker,
    health, shield, info, container, anchor, row, counter, counterMax });
  const context = createVmContext(harness, { includeGameUI: false });
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

function paintReadout(fixture) {
  fixture.harness.scheduler.takeByFunctionName('paintColors').fn();
}

function assertReadoutBounds(fixture, x = 0, y = 0) {
  const { container, anchor, row, world } = fixture;
  const width = container.actuallayoutwidth;
  const height = container.actuallayoutheight;
  const left = width - Number.parseFloat(row.style.marginRight) - row.actuallayoutwidth;
  const top = Number.parseFloat(row.style.marginTop);
  const edge = width / 2 + (world.BHasClass('friend') ? 30 : 40);
  assert.equal(left, Math.max(0, Math.min(width - row.actuallayoutwidth, edge - row.actuallayoutwidth + x)));
  assert.equal(top, Math.max(0, Math.min(height - row.actuallayoutheight, 66 + y)));
  assert.ok(left >= 0 && left + row.actuallayoutwidth <= width);
  assert.ok(top >= 0 && top + row.actuallayoutheight <= height);
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
          if (format !== 'percent') {
            assert.equal(fixture.health.GetParent(), fixture.row);
            assert.equal(fixture.health.style.visibility, 'visible');
            assert.equal(fixture.health.style.opacity, '1');
          }
        }
      }
    }
  }
});

test('unchanged-fill paint tracks digit/font row reflow and container resize without native text access', () => {
  for (const classes of [['player', 'enemy'], ['player', 'friend']]) {
    const prefix = classes.includes('friend') ? 'allyReadout' : 'readout';
    const fixture = makeOwnershipFixture(classes, { [prefix + 'Visible']: true }, prepareNativeReadout);
    const edge = prefix === 'readout' ? 140 : 130;
    assertReadoutBounds(fixture);
    assert.equal(fixture.container.actuallayoutwidth - Number.parseFloat(fixture.row.style.marginRight), edge);
    for (const x of [0, 200]) {
      fixture.update({ [prefix + 'Visible']: true, [prefix + 'OffsetX']: x });
      for (const [number, width] of [['9', 16], ['999', 32], ['1,000', 46], ['2,990', 48], ['10,000', 60]]) {
        fixture.health.__text = number; // Engine update; geometry, not text, is sampled.
        fixture.row.actuallayoutwidth = width;
        paintReadout(fixture);
        assertReadoutBounds(fixture, x);
        assert.equal(200 - Number.parseFloat(fixture.row.style.marginRight), x ? 200 : edge);
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
    for (const property of ['marginRight', 'marginTop']) assert.equal(fixture.row.style[property], '');
  }
});

test('readout geometry converts measured window pixels to CSS pixels at world-panel scale 2', () => {
  // Live 6722: a 200x210 CSS canvas reports 400x420 actual pixels (window scale 2).
  for (const [classes, prefix, edge] of [[['player', 'enemy'], 'readout', 140], [['player', 'friend'], 'allyReadout', 130]]) {
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
    assert.equal(fixture.row.style.marginRight, (200 - edge) + 'px');
    assert.equal(fixture.row.style.marginTop, '66px');
    assert.equal(fixture.anchor.style.width, '200px');
    assert.equal(fixture.anchor.style.height, '210px');
    fixture.update({ [prefix + 'Visible']: true, [prefix + 'OffsetX']: 200, [prefix + 'OffsetY']: 210 });
    assert.equal(fixture.row.style.marginRight, '0px');
    assert.equal(fixture.row.style.marginTop, (210 - 24) + 'px');
  }
});

test('right-anchored readout keeps its edge through digit changes and before first measurement', () => {
  // Stylesheet defaults equal the renderer's zero-offset result on the 200px
  // canvas, so the first frame (before layout is measured) is already placed.
  const css = fs.readFileSync(path.join(__dirname, '..', 'hp_colors_rewrite_v2', 'panorama', 'styles', 'unit_status_v2.css'), 'utf8');
  const rowRule = css.match(/\.WindowRoot #hp_counter_row\s*\{([^}]*)\}/)[1];
  assert.match(rowRule, /horizontal-align:\s*right/);
  assert.match(rowRule, /margin-right:\s*60px/);
  assert.match(css, /\.friend \.WindowRoot #hp_counter_row,\s*\.WindowRoot\.friend #hp_counter_row\s*\{\s*margin-right:\s*70px/);
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, prepareNativeReadout);
  assert.equal(fixture.row.style.marginRight, '60px');
  for (const width of [16, 32, 46, 60]) {
    fixture.row.actuallayoutwidth = width;
    fixture.row.styleWrites.length = 0;
    paintReadout(fixture);
    // The right edge never depends on the (lagging) measured number width.
    assert.deepEqual(fixture.row.styleWrites.filter(write => write.property === 'marginRight'), []);
    assert.equal(fixture.row.style.marginRight, '60px');
  }
});

test('invalid readout layout defers on the existing cadence; oversized rows expose the fit limit', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, (parts) => {
    prepareNativeReadout(parts);
    parts.row.actuallayoutwidth = 0;
  });
  assert.equal(fixture.row.style.marginRight || '', '');
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
  assert.equal(fixture.row.style.marginRight, '0px');
  assert.equal(fixture.row.style.marginTop, '0px');
  assert.ok(fixture.row.actuallayoutwidth > fixture.container.actuallayoutwidth);
  assert.ok(fixture.row.actuallayoutheight > fixture.container.actuallayoutheight);
  fixture.row.actuallayoutwidth = 48;
  fixture.row.actuallayoutheight = 24;
  paintReadout(fixture);
  assertReadoutBounds(fixture);
});

test('readout geometry retries rejected margins and repairs native drift at unchanged measurements', () => {
  const fixture = makeOwnershipFixture(['player', 'enemy'], { readoutVisible: true }, prepareNativeReadout);
  const nativeStyle = fixture.row.style;
  let reject = true;
  fixture.row.style = new Proxy(nativeStyle, {
    set(target, property, value) {
      if (property === 'marginRight' && reject) throw new Error('temporarily unavailable margin');
      target[property] = value;
      return true;
    },
  });
  fixture.row.actuallayoutwidth = 60;
  paintReadout(fixture);
  assert.equal(nativeStyle.marginRight, '60px');
  reject = false;
  paintReadout(fixture);
  assertReadoutBounds(fixture);
  nativeStyle.marginRight = '0px';
  fixture.anchor.style.width = '1px';
  paintReadout(fixture);
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
      assert.equal(fixture.row.style.marginRight, prefix === 'readout' ? '0px' : '10px');
      assert.equal(fixture.row.style.marginTop, '0px');
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
  assert.equal(fixture.anchor.style.transform, '');
  assert.equal(fixture.row.style.marginRight, '10px');
  assert.equal(fixture.row.style.marginTop, '0px');
  assert.equal(fixture.counter.BHasClass('HPColorsRewritePulseIntense'), true);
  const writes = fixture.counter.readoutTextWrites.length;
  fixture.update({ ...values, readoutFormat: 'current', enemyPulseIntensity: 0 });
  assert.equal(fixture.health.GetParent(), fixture.row);
  assert.equal(fixture.health.style.visibility, 'visible');
  assert.equal(fixture.health.style.washColor, '#123456');
  assert.equal(fixture.anchor.style.transform, '');
  assert.equal(fixture.row.style.marginRight, '10px');
  assert.equal(fixture.row.style.marginTop, '0px');
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
  const row = fixture.anchor.add(new MockPanel('hp_counter_row', { actuallayoutwidth: 72, actuallayoutheight: 24 }));
  row.add(new MockPanel('hp_counter', { style: { visibility: 'collapse' } }));
  row.add(new MockPanel('hp_counter_max', { style: { visibility: 'collapse' } }));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.health.GetParent(), row);
  assert.deepEqual(fixture.health.readoutParentWrites, [fixture.row, fixture.info, row]);
  assert.equal(fixture.row.style.marginRight, '');
  assert.equal(fixture.row.style.marginTop, '');
  assert.equal(row.style.marginRight, '60px');
  assert.equal(row.style.marginTop, '66px');
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
    ['stack', 100, 40, 0, 0], ['primary', 76, 18, 23, 11],
    ['inner', 69, 12, 3.5, 3], ['fill', 34.5, 12, 0, 0],
    ['level', 21, 21, -23, 2.5], ['unitInfo', 22, 22, 0, 2],
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
    readout: [fixture.row.style.marginRight, fixture.row.style.marginTop],
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
  assert.deepEqual(expected.level, ['-72.4px', '-22.4px']);
  assert.deepEqual(expected.ultimate, ['-49.4px', '-22.4px']);
  assert.deepEqual(expected.marker, ['37.5px', '1px']);
  assert.deepEqual(expected.health, ['50%', '#00FF00']);
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
  assert.deepEqual([normalOffset.level.style.marginLeft, normalOffset.unitInfo.style.marginTop],
    ['-92.4px', '-62.4px']);
  const defaults = makeOwnershipFixture(classes, {}, parts => measuredGeometry(parts, 2, 3));
  for (const panel of [defaults.level, defaults.unitInfo]) {
    assert.equal(panel.style.marginLeft, '', 'zero delta uses CSS left margin');
    assert.equal(panel.style.marginTop, '', 'zero delta uses CSS top margin');
  }
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
    assert.equal(pending.level.style.marginLeft, '');
    assert.equal(pending.unitInfo.style.marginLeft, '');
    if (zero.length === 2) {
      assert.equal(pending.fill.style.washColor, '#00FF00', 'optional accessories do not block color');
      assert.equal(pending.counter.text, '50%');
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
  assert.equal(delayed.unitInfo.style.marginLeft, '');
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
  assert.equal(hydrating.unitInfo.style.marginLeft, '', 'hydration leaves stock CSS in place');
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
// Reuse the existing VM seam pattern to invoke only the diagnostic on a known bar.
const diagnosticSeam = '  // [part, property, cache key] for every geometry style the bar owns.';
const diagnosticSource = rendererSource.replace(diagnosticSeam,
  '  $.HPV2DiagnosticProbe = function () { for (var i = 0; i < bars.length; i++) diagnoseAccessories(bars[i]); };\n'
  + diagnosticSeam);

test('accessory diagnostics report early/late facts and readback once per change on a shared root', () => {
  assert.notEqual(diagnosticSource, rendererSource, 'diagnostic probe seam must be present');
  const classes = ['alive', 'player', 'enemy', 'team2', 'WorldUIRoot',
    'has_ultimate', 'CLASS_PLAYER', 'hero_inferno', 'playerIsBot'];
  const early = makeOwnershipFixture(classes, accessoryValues,
    parts => measuredGeometry(parts, 1, 1), null, diagnosticSource);
  assert.equal(early.harness.logs.length, 1);
  early.harness.now = 8000;
  const late = makeOwnershipFixture(classes, accessoryValues,
    parts => measuredGeometry(parts, 2, 3), early.harness, diagnosticSource);
  const records = () => early.harness.logs.map(line => {
    assert.match(line, /^\[HPV2-DIAG\] \{.*\}$/);
    assert.equal(line.includes('\n'), false, 'one compact JSON line per change');
    return JSON.parse(line.slice('[HPV2-DIAG] '.length));
  });
  assert.equal(records().length, 2);
  const [first, second] = records();
  assert.equal(first.discovery.phase, 'early');
  assert.equal(second.discovery.phase, 'late');
  assert.equal(second.discovery.firstSeenMs, 8000);
  assert.equal(second.discovery.ordinal, 2);
  assert.equal(second.discovery.lateThresholdMs, 3000);
  assert.equal(second.discovery.timing, 'observed-context');
  assert.equal(second.discovery.configRevision, 1);
  assert.equal(second.discovery.awaitingConfig, false);
  assert.equal(second.discovery.hydration, '');
  assert.equal(second.configRevision, 1);
  assert.equal(second.gates.surface, 'player');
  assert.equal(second.gates.levelValid, true);
  assert.equal(second.settings.widthScale, 230);
  assert.equal(second.settings.heightScale, 160);
  assert.equal(typeof second.settings.ultimateTimerEnabled, 'boolean');
  assert.equal(typeof second.settings.ultimateTimerSize, 'number');
  const world = second.ancestors.find(panel => panel.id === 'WorldUIRoot');
  assert.ok(world);
  for (const cls of ['alive', 'player', 'enemy', 'has_ultimate', 'CLASS_PLAYER', 'playerIsBot'])
    assert.ok(world.classes.known.includes(cls), cls);
  assert.ok(world.classes.heroes.includes('hero_inferno'));
  assert.equal(world.classes.enumeration, 'unavailable', 'do not guess an unexposed class list');
  for (const name of ['unitInfo', 'ultBackground', 'ultIcon', 'ultOverlay', 'level', 'stack', 'primary', 'inner']) {
    assert.equal(second.panels[name].exists, true, name);
    assert.equal(second.panels[name].valid, true, name);
    assert.equal(second.panels[name].computedVisibility, 'unavailable', name);
  }
  assert.equal(second.panels.unitInfo.raw.width, 44);
  assert.equal(second.panels.unitInfo.css.width, 22);
  assert.equal(second.panels.primary.raw.width, 152);
  assert.equal(second.panels.primary.css.width, 76);
  assert.equal(second.panels.unitInfo.raw.scaleY, 3);
  assert.equal(second.panels.unitInfo.raw.height, 66);
  assert.equal(second.panels.unitInfo.css.height, 22);
  assert.equal(second.panels.ultBackground.parentId, 'unit_info_panel');
  assert.equal(second.panels.ultIcon.parentId, 'unit_info_bg');
  assert.equal(second.panels.unitInfo.visible, true);
  for (const [key, desired] of [['level', '-72.4px'], ['unitInfo', '-49.4px']]) {
    const anchor = second.anchors[key];
    assert.equal(anchor.ready, true, key);
    assert.ok(Math.abs(anchor.deltaX + 49.4) < 1e-8, key);
    assert.equal(anchor.verticalFactor, 2, key);
    assert.equal(anchor.desired.marginLeft, desired, key);
    assert.equal(anchor.written.marginLeft, desired, key);
    assert.equal(anchor.readback.marginLeft, desired, key);
    assert.equal(anchor.desired.marginTop, '-22.4px', key);
    assert.equal(anchor.readback.marginTop, '-22.4px', key);
  }
  const count = early.harness.logs.length;
  late.context.$.HPV2DiagnosticProbe();
  late.harness.scheduler.runFor(2000);
  assert.equal(early.harness.logs.length, count, 'unchanged scan/paint never re-emits');
  late.ultIcon.actualxoffset = 2;
  late.context.$.HPV2DiagnosticProbe();
  assert.equal(early.harness.logs.length, count + 1);
  assert.equal(records().at(-1).panels.ultIcon.raw.x, 2);
  assert.equal(JSON.parse(early.harness.root.GetAttributeString('hp_colors_v2_diag_accessory', '{}')).attempts,
    count + 1);

  let labelReads = 0;
  Object.defineProperty(late.levelLabel, 'text', {
    get() { labelReads++; throw new Error('diagnostic must not read engine level text'); },
  });
  late.ultIcon.actualxoffset = 3;
  late.context.$.HPV2DiagnosticProbe(); // Isolate from normal renderer level sampling.
  assert.equal(labelReads, 0);
  assert.equal(early.harness.logs.length, count + 2);
});

test('accessory diagnostic shares its 80 attempted lines across contexts, even if Msg throws', () => {
  const classes = ['player', 'enemy', 'CLASS_PLAYER', 'hero_inferno'];
  const early = makeOwnershipFixture(classes, accessoryValues,
    parts => measuredGeometry(parts, 1, 1), null, diagnosticSource);
  early.harness.now = 8000;
  const late = makeOwnershipFixture(classes, accessoryValues,
    parts => measuredGeometry(parts, 2, 3), early.harness, diagnosticSource);
  for (let index = 1; index <= 100; index++) {
    late.ultIcon.actualxoffset = index;
    late.context.$.HPV2DiagnosticProbe();
  }
  assert.equal(early.harness.logs.length, 80);
  assert.equal(JSON.parse(early.harness.root.GetAttributeString('hp_colors_v2_diag_accessory', '{}')).attempts, 80);
  const missing = makeOwnershipFixture(classes, accessoryValues, parts => {
    measuredGeometry(parts, 2, 3);
    delete parts.harness.$.Msg;
  }, null, diagnosticSource);
  assert.equal(missing.fill.style.washColor, '#00FF00');
  assert.equal(missing.harness.root.GetAttributeString('hp_colors_v2_diag_accessory', ''), '');
  const throwing = makeOwnershipFixture(classes, accessoryValues, parts => {
    measuredGeometry(parts, 2, 3);
    parts.harness.$.Msg = () => { throw new Error('logger unavailable'); };
  }, null, diagnosticSource);
  for (let index = 1; index <= 100; index++) {
    throwing.ultIcon.actualxoffset = index;
    assert.doesNotThrow(() => throwing.context.$.HPV2DiagnosticProbe());
  }
  assert.equal(throwing.fill.style.washColor, '#00FF00');
  assert.equal(throwing.harness.logs.length, 0);
  assert.equal(JSON.parse(throwing.harness.root.GetAttributeString('hp_colors_v2_diag_accessory', '{}')).attempts, 80);
});

test('unavailable diagnostic root and panel reads cannot interrupt player rendering', () => {
  const classes = ['player', 'enemy', 'CLASS_PLAYER', 'hero_inferno'];
  for (const method of ['GetAttributeString', 'SetAttributeString']) {
    const fixture = makeOwnershipFixture(classes, accessoryValues, parts => {
      measuredGeometry(parts, 2, 3);
      const root = parts.harness.root;
      const native = root[method].bind(root);
      root[method] = (key, ...args) => {
        if (key === 'hp_colors_v2_diag_accessory') throw new Error('root unavailable');
        return native(key, ...args);
      };
    }, null, diagnosticSource);
    assert.equal(fixture.fill.style.washColor, '#00FF00');
    assert.equal(fixture.unitInfo.style.marginLeft, '-49.4px');
    assert.deepEqual(fixture.harness.logs, [], method);
  }
  const fixture = makeOwnershipFixture(classes, accessoryValues, parts => {
    measuredGeometry(parts, 2, 3);
    Object.defineProperty(parts.ultIcon, 'visible', {
      get() { throw new Error('panel temporarily unavailable'); },
    });
    Object.defineProperty(parts.ultIcon, 'actualuiscale_y', {
      get() { throw new Error('scale temporarily unavailable'); },
    });
    parts.ultIcon.BHasClass = () => { throw new Error('class state unavailable'); };
  }, null, diagnosticSource);
  const record = JSON.parse(fixture.harness.logs[0].slice('[HPV2-DIAG] '.length));
  assert.equal(record.panels.ultIcon.visible, 'unavailable');
  assert.equal(record.panels.ultIcon.raw.scaleY, 'unavailable');
  assert.equal(record.panels.ultIcon.css.height, 'unavailable');
  assert.equal(record.panels.ultIcon.computedVisibility, 'unavailable');
  assert.ok(record.panels.ultIcon.classes.unavailable.includes('has_ultimate'));
  assert.equal(fixture.fill.style.washColor, '#00FF00');
  assert.equal(fixture.unitInfo.style.marginLeft, '-49.4px');
});

test('diagnostic distinguishes cleared, desired and rejected margins and can be disabled in one edit', () => {
  const classes = ['player', 'enemy', 'CLASS_PLAYER'];
  const defaults = makeOwnershipFixture(classes, {},
    parts => measuredGeometry(parts, 2, 3), null, diagnosticSource);
  const cleared = JSON.parse(defaults.harness.logs[0].slice('[HPV2-DIAG] '.length));
  for (const key of ['level', 'unitInfo']) {
    assert.equal(cleared.anchors[key].desired.marginLeft, '');
    assert.equal(cleared.anchors[key].written.marginLeft, '');
    assert.equal(cleared.anchors[key].readback.marginLeft, '');
  }
  const rejected = makeOwnershipFixture(classes, accessoryValues, parts => {
    measuredGeometry(parts, 2, 3);
    const style = parts.unitInfo.style;
    parts.unitInfo.style = new Proxy(style, {
      set(target, property, value) {
        if (property !== 'marginLeft') target[property] = value;
        return true;
      },
    });
  }, null, diagnosticSource);
  const failed = JSON.parse(rejected.harness.logs[0].slice('[HPV2-DIAG] '.length));
  assert.equal(failed.anchors.unitInfo.desired.marginLeft, '-49.4px');
  assert.equal(failed.anchors.unitInfo.written.marginLeft, '');
  assert.equal(failed.anchors.unitInfo.readback.marginLeft, '');
  assert.equal(rejected.fill.style.washColor, '#00FF00');
  const disabledSource = rendererSource.replace('var ACCESSORY_DIAGNOSTICS = true;',
    'var ACCESSORY_DIAGNOSTICS = false;');
  assert.notEqual(disabledSource, rendererSource);
  const disabled = makeOwnershipFixture(classes, accessoryValues,
    parts => measuredGeometry(parts, 2, 3), null, disabledSource);
  assert.equal(disabled.unitInfo.style.marginLeft, '-49.4px');
  assert.deepEqual(disabled.harness.logs, []);
  assert.equal(disabled.harness.root.GetAttributeString('hp_colors_v2_diag_accessory', ''), '');
});



test('old health sampling diagnostic remains absent in the temporary accessory build', () => {
  assert.doesNotMatch(rendererSource, /DIAG_HEALTH_SAMPLING|diagnos(?:e|tic)Health/);
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
