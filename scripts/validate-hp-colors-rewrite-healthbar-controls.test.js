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
  runHpColorsSourcesInVm,
  buildUnitStatusTree,
  dispatchClientUiPayload,
} = require('./hp-colors-panorama-test-adapter');

const rewriteRoot = path.resolve(__dirname, '../hp_colors_rewrite');
const probeSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/healthbar_probe.js'),
  'utf8',
);
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
    barWidth: options.barWidth === undefined ? 100 : options.barWidth,
    parentWidth: options.parentWidth === undefined ? 100 : options.parentWidth,
  });
  runInVm(probeSource, createVmContext(harness, { includeGameUI: false }), 'healthbar_probe.js');
  return { harness, tree };
}

function installLayoutPanels(harness) {
  const ids = new Set(
    Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
  );
  for (const id of ids) {
    harness.root.add(new MockPanel(id, { findCounts: harness.findCounts }));
  }
}

test('fixed mode steps through low, mid, and high colors at shared thresholds', () => {
  const cases = [
    { percent: 25, expected: '#110000' },
    { percent: 65, expected: '#220000' },
    { percent: 66, expected: '#330000' },
  ];
  for (const item of cases) {
    const probe = bootProbe(['enemy', 'team1'], {
      barWidth: item.percent,
      parentWidth: 100,
    });
    publishConfig(probe.harness, 1, {
      enabled: true,
      enemyEnabled: true,
      enemyMode: 'fixed',
      enemyLow: '#110000',
      enemyMid: '#220000',
      enemyHigh: '#330000',
      lowThreshold: 25,
      highThreshold: 65,
    });
    assert.equal(probe.tree.lagging.style.washColor, item.expected);
  }
});

test('fixed mode repaints promptly when health crosses a threshold', () => {
  const probe = bootProbe(['enemy', 'team1'], {
    barWidth: 20,
    parentWidth: 100,
  });
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'fixed',
    enemyLow: '#110000',
    enemyMid: '#220000',
    enemyHigh: '#330000',
    lowThreshold: 25,
    highThreshold: 65,
  });
  assert.equal(probe.tree.lagging.style.washColor, '#110000');
  probe.tree.lagging.actuallayoutwidth = 80;
  probe.harness.scheduler.takeByFunctionName('paintColors').fn();
  assert.equal(probe.tree.lagging.style.washColor, '#330000');
});

test('team-high color uses current stock team colors and preserves unknown fallback', () => {
  const team1 = bootProbe(['enemy', 'team1']);
  publishConfig(team1.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'gradient',
    enemyHigh: '#123456',
    enemyTeamHigh: true,
  });
  assert.equal(team1.tree.lagging.style.washColor.toUpperCase(), '#E7B659');
  assert.equal(team1.tree.ult.style.washColor.toUpperCase(), '#E7B659');

  const team2 = bootProbe(['enemy', 'team2']);
  publishConfig(team2.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'fixed',
    enemyHigh: '#112233',
    enemyTeamHigh: true,
  });
  assert.equal(team2.tree.lagging.style.washColor, '#5B79E6');

  const unknown = bootProbe(['enemy']);
  publishConfig(unknown.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'gradient',
    enemyHigh: '#123456',
    enemyTeamHigh: true,
  });
  assert.equal(unknown.tree.lagging.style.washColor.toUpperCase(), '#123456');
});

test('building and boss exclusions restore stock colors independently', () => {
  const sentry = bootProbe(['enemy', 'team2', 'sentry']);
  publishConfig(sentry.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyHigh: '#112233',
    enemyMode: 'fixed',
    excludeBuildings: true,
    positionX: 20,
  });
  assert.equal(sentry.tree.lagging.style.washColor, '');
  assert.equal(sentry.tree.ult.style.washColor, '');
  assert.equal(sentry.tree.unitHealthbar.style.transform, 'translateX(20px) translateY(0px)');

  const boss = bootProbe(['enemy', 'team1', 'boss_barracks']);
  publishConfig(boss.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyHigh: '#334455',
    enemyMode: 'fixed',
    excludeBuildings: true,
    excludeBosses: false,
  });
  assert.equal(boss.tree.lagging.style.washColor, '#334455');
  publishConfig(boss.harness, 2, {
    enabled: true,
    enemyEnabled: true,
    enemyHigh: '#334455',
    enemyMode: 'fixed',
    excludeBuildings: false,
    excludeBosses: true,
  });
  assert.equal(boss.tree.lagging.style.washColor, '');
});

test('position and ultimate icon modes own only their intended styles', () => {
  const probe = bootProbe(['friend', 'team1']);
  publishConfig(probe.harness, 1, {
    enabled: true,
    allyEnabled: true,
    allyMode: 'fixed',
    allyHigh: '#102030',
    positionX: -75,
    positionY: 40,
    ultMode: 'custom',
    ultCustom: '#ABCDEF',
  });
  assert.equal(probe.tree.unitHealthbar.style.transform, 'translateX(-75px) translateY(40px)');
  assert.equal(probe.tree.ult.style.washColor, '#ABCDEF');
  assert.equal(probe.tree.ult.style.visibility, undefined);
  assert.equal(probe.tree.ult.style.backgroundImage, undefined);
});

test('single fixed-color settings are removed from the clean snapshot', () => {
  assert.doesNotMatch(stateSource, /enemyFixed|allyFixed/);
  assert.doesNotMatch(layoutSource, /HPColorsEnemyFixed|HPColorsAllyFixed/);
});

test('editor exposes and publishes the four-feature controls', () => {
  const harness = createPanoramaHarness();
  installLayoutPanels(harness);
  runHpColorsSourcesInVm(stateSource, menuSource, harness);
  harness.$.HPColorsMenuBoot();

  const xSlider = harness.root.FindChildTraverse('HPColorsPositionXSlider');
  const ySlider = harness.root.FindChildTraverse('HPColorsPositionYSlider');
  assert.deepEqual([xSlider.min, xSlider.max], [-300, 300]);
  assert.deepEqual([ySlider.min, ySlider.max], [-200, 200]);

  harness.root.FindChildTraverse('HPColorsEnemyTeamHighToggle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsExcludeBuildingsToggle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsExcludeBossesToggle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsUltModeCustom').events.onactivate();
  const values = JSON.parse(
    harness.root.GetAttributeString('hp_colors_rewrite_config', '{}'),
  ).values;
  assert.equal(values.enemyTeamHigh, true);
  assert.equal(values.excludeBuildings, true);
  assert.equal(values.excludeBosses, true);
  assert.equal(values.ultMode, 'custom');
});

test('width and height controls retain the 60 through 160 percent range', () => {
  const harness = createPanoramaHarness();
  installLayoutPanels(harness);
  runHpColorsSourcesInVm(stateSource, menuSource, harness);
  harness.$.HPColorsMenuBoot();

  const widthSlider = harness.root.FindChildTraverse('HPColorsWidthSlider');
  const heightSlider = harness.root.FindChildTraverse('HPColorsHeightSlider');
  assert.deepEqual([widthSlider.min, widthSlider.max], [60, 160]);
  assert.deepEqual([heightSlider.min, heightSlider.max], [60, 160]);
});
