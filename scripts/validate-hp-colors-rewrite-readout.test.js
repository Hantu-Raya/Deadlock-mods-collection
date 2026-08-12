'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
  buildUnitStatusTree,
  dispatchClientUiPayload,
  getStyleWriteCount,
} = require('./hp-colors-panorama-test-adapter');

const rewriteRoot = path.resolve(__dirname, '../hp_colors_rewrite');
const probeSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/healthbar_probe.js'),
  'utf8',
);
const hudLayoutSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/layout/hud_escape_menu.xml'),
  'utf8',
);
const overlayLayoutSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/layout/unit_status_overlay.xml'),
  'utf8',
);
const menuSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/hp_colors_menu.js'),
  'utf8',
);

function publishConfig(harness, revision, values) {
  dispatchClientUiPayload(harness, {
    magic_word: 'HP_COLORS_REWRITE_CONFIG',
    version: 1,
    values_raw: JSON.stringify({ version: 1, revision, values }),
  });
}

function bootProbe(classes, options = {}) {
  const harness = createPanoramaHarness();
  const tree = buildUnitStatusTree(harness, {
    unitStatusClasses: classes,
    barWidth: options.barWidth === undefined ? 50 : options.barWidth,
    parentWidth: options.parentWidth === undefined ? 100 : options.parentWidth,
    pipText: options.pipText === undefined ? '||||' : options.pipText,
    bulletShieldWidth:
      options.bulletShieldWidth === undefined ? 0 : options.bulletShieldWidth,
    techShieldWidth:
      options.techShieldWidth === undefined ? 0 : options.techShieldWidth,
  });
  runInVm(
    probeSource,
    createVmContext(harness, { includeGameUI: false }),
    'healthbar_probe.js',
  );
  return { harness, tree };
}

function installLayoutPanels(harness) {
  const ids = new Set(
    Array.from(hudLayoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
  );
  for (const id of ids) {
    harness.root.add(new MockPanel(id, { findCounts: harness.findCounts }));
  }
}

test('enemy HP readout shows current and maximum health and can be hidden', () => {
  const probe = bootProbe(['enemy', 'team1']);
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'hp',
  });

  assert.equal(probe.tree.counter.text, '1000 / 2000');
  assert.equal(probe.tree.counter.style.visibility, 'visible');

  publishConfig(probe.harness, 2, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: false,
    readoutFormat: 'hp',
  });
  assert.equal(probe.tree.counter.style.visibility, 'collapse');
});

test('readout formats use shield-aware health and refresh when pip text changes', () => {
  const probe = bootProbe(['enemy', 'team2'], {
    barWidth: 40,
    parentWidth: 100,
    bulletShieldWidth: 20,
  });
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'hp',
  });
  assert.equal(probe.tree.counter.text, '800 / 1600');

  publishConfig(probe.harness, 2, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'percent',
  });
  assert.equal(probe.tree.counter.text, '50%');

  publishConfig(probe.harness, 3, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'current',
  });
  assert.equal(probe.tree.counter.text, '800');

  probe.tree.pip.text = '||||||';
  probe.harness.scheduler.takeByFunctionName('scan').fn();
  assert.equal(probe.tree.counter.text, '1200');
});

test('editor owns and publishes the readout controls', () => {
  assert.match(overlayLayoutSource, /\bid="hp_counter_anchor"/);
  assert.match(overlayLayoutSource, /\bid="hp_counter"/);

  const harness = createPanoramaHarness();
  installLayoutPanels(harness);
  runInVm(menuSource, createVmContext(harness), 'hp_colors_menu.js');
  harness.$.HPColorsMenuBoot();

  const sizeSlider = harness.root.FindChildTraverse('HPColorsReadoutSizeSlider');
  const xSlider = harness.root.FindChildTraverse('HPColorsReadoutOffsetXSlider');
  const ySlider = harness.root.FindChildTraverse('HPColorsReadoutOffsetYSlider');
  assert.deepEqual([sizeSlider.min, sizeSlider.max], [72, 320]);
  assert.deepEqual([xSlider.min, xSlider.max], [-405, 405]);
  assert.deepEqual([ySlider.min, ySlider.max], [-365, 270]);
  const readoutLowSlider = harness.root.FindChildTraverse(
    'HPColorsReadoutLowThresholdSlider',
  );
  const readoutHighSlider = harness.root.FindChildTraverse(
    'HPColorsReadoutHighThresholdSlider',
  );
  assert.deepEqual(
    [readoutLowSlider.min, readoutLowSlider.max],
    [0, 99],
  );
  assert.deepEqual(
    [readoutHighSlider.min, readoutHighSlider.max],
    [1, 100],
  );

  const followedControls = [
    'HPColorsReadoutModeFixed',
    'HPColorsReadoutModeGradient',
    'HPColorsReadoutLowThresholdSlider',
    'HPColorsReadoutLowThresholdEntry',
    'HPColorsReadoutHighThresholdSlider',
    'HPColorsReadoutHighThresholdEntry',
  ].map((id) => harness.root.FindChildTraverse(id));
  for (const control of followedControls) {
    assert.equal(control.enabled, false);
    assert.equal(control.BHasClass('Disabled'), true);
  }

  harness.root.FindChildTraverse('HPColorsReadoutColorCustom').events.onactivate();
  for (const control of followedControls) {
    assert.equal(control.enabled, true);
    assert.equal(control.BHasClass('Disabled'), false);
  }
  harness.root.FindChildTraverse('HPColorsReadoutColorBar').events.onactivate();
  for (const control of followedControls) {
    assert.equal(control.enabled, false);
    assert.equal(control.BHasClass('Disabled'), true);
  }
  harness.root.FindChildTraverse('HPColorsReadoutFormatCurrent').events.onactivate();
  harness.root.FindChildTraverse('HPColorsReadoutColorCustom').events.onactivate();
  harness.root.FindChildTraverse('HPColorsReadoutToggle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsReadoutFontOracle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsReadoutModeGradient').events.onactivate();
  readoutLowSlider.value = 35;
  readoutLowSlider.events.onvaluechanged();
  readoutHighSlider.value = 80;
  readoutHighSlider.events.onvaluechanged();
  const values = JSON.parse(
    harness.root.GetAttributeString('hp_colors_rewrite_config', '{}'),
  ).values;
  assert.equal(values.readoutFormat, 'current');
  assert.equal(values.readoutColorMode, 'custom');
  assert.equal(values.readoutVisible, false);
  assert.equal(values.readoutFont, 'oracle');
  assert.equal(values.readoutMode, 'gradient');
  assert.equal(values.lowThreshold, 35);
  assert.equal(values.highThreshold, 80);
});

test('readout applies size, offsets, and bar-derived or custom colors', () => {
  const probe = bootProbe(['enemy', 'team1'], {
    barWidth: 50,
    parentWidth: 100,
  });
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'gradient',
    enemyLow: '#112233',
    enemyMid: '#445566',
    enemyHigh: '#778899',
    enemyTeamHigh: true,
    lowThreshold: 25,
    highThreshold: 65,
    readoutVisible: true,
    readoutFormat: 'percent',
    readoutSize: 200,
    readoutOffsetX: 999,
    readoutOffsetY: -999,
    readoutColorMode: 'bar',
    readoutMode: 'fixed',
    readoutFont: 'pulp',
  });

  assert.equal(probe.tree.counter.style.fontSize, '200px');
  assert.equal(
    probe.tree.counter.style.transform,
    'translateX(405px) translateY(-365px)',
  );
  assert.equal(probe.tree.counter.style.color, undefined);
  assert.equal(probe.tree.counter.style.washColor, '#304152');
  assert.equal(
    probe.tree.counter.style.fontFamily,
    'VALVEPulp, Noto Sans, sans-serif',
  );

  publishConfig(probe.harness, 2, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'percent',
    readoutFont: 'oracle',
  });
  assert.equal(
    probe.tree.counter.style.fontFamily,
    'VALVEOracle, Reaver, sans-serif',
  );

  publishConfig(probe.harness, 3, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'percent',
    readoutFont: 'default',
  });
  assert.equal(
    probe.tree.counter.style.fontFamily,
    'Retail Demo, Noto Sans, sans-serif',
  );

  publishConfig(probe.harness, 4, {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'fixed',
    enemyTeamHigh: true,
    lowThreshold: 25,
    highThreshold: 65,
    readoutVisible: true,
    readoutFormat: 'percent',
    readoutColorMode: 'custom',
    readoutMode: 'gradient',
    readoutLow: '#AA0000',
    readoutMid: '#00BB00',
    readoutHigh: '#0000CC',
  });
  assert.equal(probe.tree.counter.style.color, undefined);
  assert.equal(probe.tree.counter.style.washColor, '#3f7400');
});

test('readout stays collapsed outside its owned enemy path', () => {
  const cases = [
    { classes: ['team_neutral', 'enemy'], values: {} },
    { classes: ['friend', 'team1'], values: { allyEnabled: true } },
    {
      classes: ['enemy', 'sentry'],
      values: { excludeBuildings: true },
    },
    {
      classes: ['enemy', 'boss_tier2'],
      values: { excludeBosses: true },
    },
  ];
  for (const item of cases) {
    const probe = bootProbe(item.classes);
    publishConfig(probe.harness, 1, {
      enabled: true,
      enemyEnabled: true,
      readoutVisible: true,
      readoutFormat: 'hp',
      ...item.values,
    });
    assert.equal(probe.tree.counter.style.visibility, 'collapse');
    assert.equal(probe.tree.counter.text, '');
  }
});

test('percentage remains available when pip text cannot provide maximum HP', () => {
  const probe = bootProbe(['enemy'], { pipText: 'unknown' });
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'hp',
  });
  assert.equal(probe.tree.counter.style.visibility, 'collapse');

  publishConfig(probe.harness, 2, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'percent',
  });
  assert.equal(probe.tree.counter.text, '50%');
  assert.equal(probe.tree.counter.style.visibility, 'visible');
});

test('readout reapplies to replacement panels without repeating unchanged style writes', () => {
  const probe = bootProbe(['enemy', 'team1']);
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'gradient',
    enemyLow: '#000000',
    enemyMid: '#808080',
    enemyHigh: '#FFFFFF',
    lowThreshold: 25,
    highThreshold: 65,
    readoutVisible: true,
    readoutFormat: 'percent',
    readoutColorMode: 'bar',
  });
  const visibilityWrites = getStyleWriteCount(
    probe.tree.counter,
    'visibility',
  );
  const colorWrites = getStyleWriteCount(probe.tree.counter, 'washColor');

  publishConfig(probe.harness, 2, {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'gradient',
    enemyLow: '#000000',
    enemyMid: '#808080',
    enemyHigh: '#FFFFFF',
    lowThreshold: 25,
    highThreshold: 65,
    readoutVisible: true,
    readoutFormat: 'percent',
    readoutColorMode: 'bar',
  });
  assert.equal(
    getStyleWriteCount(probe.tree.counter, 'visibility'),
    visibilityWrites,
  );
  assert.equal(getStyleWriteCount(probe.tree.counter, 'washColor'), colorWrites);

  probe.tree.counter.DeleteAsync();
  const replacement = probe.tree.counterAnchor.add(
    new MockPanel('hp_counter', { findCounts: probe.harness.findCounts }),
  );
  probe.harness.scheduler.takeByFunctionName('scan').fn();
  assert.equal(replacement.text, '50%');
  assert.equal(replacement.style.visibility, 'visible');
  assert.equal(replacement.style.washColor, '#505050');
});

test('HP counter can overflow every stock ancestor at vertical offset limits', () => {
  for (const selector of [
    /<Panel class="WindowRoot"[^>]*style="[^"]*overflow:\s*noclip/,
    /<Panel id="UnitStatus"[^>]*style="[^"]*overflow:\s*noclip/,
    /<Panel id="InfoHealthContainer"[^>]*style="[^"]*overflow:\s*noclip/,
  ]) {
    assert.match(overlayLayoutSource, selector);
  }
});

test('in-flow top extent enlarges the world panel above the stock bar', () => {
  assert.match(
    overlayLayoutSource,
    /<Panel id="hp_counter_top_extent"[^>]*style="[^"]*\bheight:\s*399px[^"]*"[^>]*\/>\s*<Panel id="InfoHealthContainer"/,
  );

  const anchor = overlayLayoutSource.match(
    /<Panel id="hp_counter_anchor"[^>]*style="([^"]*)"/,
  );
  assert.ok(anchor);
  assert.match(anchor[1], /\bwidth:\s*160%/);
  assert.match(anchor[1], /\bheight:\s*1140px/);
  assert.doesNotMatch(anchor[1], /\bmargin-top:/);
  assert.match(anchor[1], /horizontal-align:\s*center/);
  assert.match(anchor[1], /vertical-align:\s*center/);
});
