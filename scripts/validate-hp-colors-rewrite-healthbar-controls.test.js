'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runHpColorsContractInVm,
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
  const context = createVmContext(harness, { includeGameUI: false });
  runHpColorsContractInVm(context);
  runInVm(probeSource, context, 'healthbar_probe.js');
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

  const allyTeam1 = bootProbe(['friend', 'team1']);
  publishConfig(allyTeam1.harness, 1, {
    enabled: true,
    allyEnabled: true,
    allyMode: 'fixed',
    allyHigh: '#ABCDEF',
    allyTeamHigh: true,
  });
  assert.equal(allyTeam1.tree.lagging.style.washColor.toUpperCase(), '#E7B659');

  const ally = bootProbe(['friend', 'team2']);
  publishConfig(ally.harness, 1, {
    enabled: true,
    allyEnabled: true,
    allyMode: 'gradient',
    allyHigh: '#ABCDEF',
    allyTeamHigh: true,
  });
  assert.equal(ally.tree.lagging.style.washColor.toUpperCase(), '#5B79E6');

  const unknownAlly = bootProbe(['friend']);
  publishConfig(unknownAlly.harness, 1, {
    enabled: true,
    allyEnabled: true,
    allyMode: 'fixed',
    allyHigh: '#ABCDEF',
    allyTeamHigh: true,
  });
  assert.equal(unknownAlly.tree.lagging.style.washColor.toUpperCase(), '#ABCDEF');
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
  assert.equal(sentry.tree.lagging.style.washColor, '#FD4949');
  assert.equal(sentry.tree.ult.style.washColor, '#FD4949');
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
  assert.equal(boss.tree.lagging.style.washColor, '#FD4949');
});

test('one ghoul opacity setting covers the healthbar and ultimate background', () => {
  const ghoul = bootProbe(['friend', 'team1', 'creature']);
  publishConfig(ghoul.harness, 1, {
    enabled: true,
    allyEnabled: true,
    allyMode: 'fixed',
    allyHigh: '#112233',
    excludeGhouls: true,
    ghoulOpacityEnabled: true,
    ghoulOpacity: 35,
  });
  assert.equal(ghoul.tree.lagging.style.washColor, '#FFEFD7');
  assert.equal(ghoul.tree.unitHealthbar.style.opacity, '0.35');
  assert.equal(ghoul.tree.ultBackground.style.opacity, '0.35');

  publishConfig(ghoul.harness, 2, {
    enabled: true,
    allyEnabled: true,
    allyMode: 'fixed',
    allyHigh: '#112233',
    excludeGhouls: false,
    ghoulOpacityEnabled: true,
    ghoulOpacity: 0,
  });
  assert.equal(ghoul.tree.lagging.style.washColor, '#112233');
  assert.equal(ghoul.tree.unitHealthbar.style.opacity, '0.01');
  assert.equal(ghoul.tree.ultBackground.style.opacity, '0.01');

  const boss = bootProbe(['enemy', 'team1', 'creature', 'boss_tier1']);
  publishConfig(boss.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    ghoulOpacityEnabled: true,
    ghoulOpacity: 35,
  });
  assert.equal(boss.tree.unitHealthbar.style.opacity, '1');
  assert.equal(boss.tree.ultBackground.style.opacity, '1');
});

test('master bypass writes every current stock relation palette', () => {
  const cases = [
    {
      classes: ['team1'],
      unit: '#E7B659',
      delta: '#FFEDB8',
      shield: '#E9E76A',
    },
    {
      classes: ['team2'],
      unit: '#5B79E6',
      delta: '#FFEDB8',
      shield: '#6A75E9',
    },
    {
      classes: ['team_neutral'],
      unit: '#5BEFB5',
      delta: '#F24D4D',
      shield: '#FFFFFF',
    },
    {
      classes: ['enemy', 'team1'],
      unit: '#FD4949',
      delta: '#FFE55B',
      shield: '#B95F5F',
    },
    {
      classes: ['enemy', 'team2'],
      unit: '#FD4949',
      delta: '#FFE55B',
      shield: '#B95F5F',
    },
    {
      classes: ['friend', 'team1'],
      unit: '#FFEFD7',
      delta: '#504C47',
      shield: '#ACCA91',
    },
    {
      classes: ['friend', 'team2'],
      unit: '#FFEFD7',
      delta: '#504C47',
      shield: '#ACCA91',
    },
  ];
  for (const item of cases) {
    const probe = bootProbe(item.classes);
    publishConfig(probe.harness, 1, {
      enabled: false,
      enemyEnabled: true,
      allyEnabled: true,
      ultMode: 'custom',
      ultCustom: '#00FF00',
    });
    assert.equal(probe.tree.lagging.style.washColor, item.unit);
    assert.equal(probe.tree.ult.style.washColor, item.unit);
    assert.equal(probe.tree.heal.style.washColor, '#5FFF80');
    assert.equal(probe.tree.delta.style.washColor, item.delta);
    assert.equal(probe.tree.bulletShield.style.backgroundColor, item.shield);
  }
});

test('master and relation toggles restore rewrite-owned presentation', () => {
  const enemy = bootProbe(['enemy', 'player', 'team2']);
  const enemyValues = {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'fixed',
    enemyLow: '#123456',
    enemyMid: '#123456',
    enemyHigh: '#123456',
    readoutVisible: true,
    readoutFormat: 'percent',
    pipsVisible: false,
    ultMode: 'custom',
    ultCustom: '#654321',
  };
  publishConfig(enemy.harness, 1, enemyValues);
  assert.equal(enemy.tree.lagging.style.washColor, '#123456');
  assert.equal(enemy.tree.ult.style.washColor, '#654321');
  assert.equal(enemy.tree.pip.style.visibility, 'collapse');

  publishConfig(enemy.harness, 2, { ...enemyValues, enabled: false });
  assert.equal(enemy.tree.lagging.style.washColor, '#FD4949');
  assert.equal(enemy.tree.ult.style.washColor, '#FD4949');
  assert.equal(enemy.tree.pip.style.visibility, '');

  publishConfig(enemy.harness, 3, {
    ...enemyValues,
    enemyEnabled: false,
    pipsVisible: true,
  });
  assert.equal(enemy.tree.lagging.style.washColor, '#FD4949');
  assert.equal(enemy.tree.counter.style.visibility, 'visible');
  assert.notEqual(enemy.tree.counter.text, '');
  assert.equal(enemy.tree.pip.style.visibility, 'visible');

  publishConfig(enemy.harness, 4, enemyValues);
  assert.equal(enemy.tree.lagging.style.washColor, '#123456');

  const ally = bootProbe(['friend', 'player', 'team1']);
  const allyValues = {
    enabled: true,
    allyEnabled: true,
    allyMode: 'fixed',
    allyLow: '#00AABB',
    allyMid: '#00AABB',
    allyHigh: '#00AABB',
    ultMode: 'custom',
    ultCustom: '#ABCDEF',
  };
  publishConfig(ally.harness, 1, allyValues);
  assert.equal(ally.tree.lagging.style.washColor, '#00AABB');
  assert.equal(ally.tree.ult.style.washColor, '#ABCDEF');

  publishConfig(ally.harness, 2, { ...allyValues, allyEnabled: false });
  assert.equal(ally.tree.lagging.style.washColor, '#FFEFD7');
  assert.equal(ally.tree.ult.style.washColor, '#ABCDEF');

  publishConfig(ally.harness, 3, {
    ...allyValues,
    allyEnabled: false,
    ultCustom: '#FEDCBA',
  });
  assert.equal(ally.tree.ult.style.washColor, '#FEDCBA');

  publishConfig(ally.harness, 4, {
    ...allyValues,
    allyEnabled: false,
    ultMode: 'follow',
  });
  assert.equal(ally.tree.ult.style.washColor, '#FFEFD7');

  publishConfig(ally.harness, 5, {
    ...allyValues,
    ultMode: 'follow',
  });
  assert.equal(ally.tree.ult.style.washColor, '#00AABB');

  ally.tree.ult.style.washColor = '#FEDCBA';
  publishConfig(ally.harness, 6, {
    ...allyValues,
    ultMode: 'follow',
  });
  assert.equal(ally.tree.ult.style.washColor, '#00AABB');
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

test('editor exposes and publishes the ghoul and existing bar controls', () => {
  const harness = createPanoramaHarness();
  installLayoutPanels(harness);
  runHpColorsSourcesInVm(stateSource, menuSource, harness);
  harness.$.HPColorsMenuBoot();
  const ghoulOpacityRow = harness.root.FindChildTraverse('HPColorsGhoulOpacityRow');
  const ghoulOpacityEntry = harness.root.FindChildTraverse('HPColorsGhoulOpacityEntry');
  const ghoulOpacity = harness.root.FindChildTraverse('HPColorsGhoulOpacitySlider');
  assert.equal(ghoulOpacityRow.BHasClass('Disabled'), true);
  assert.equal(ghoulOpacity.enabled, false);
  assert.equal(ghoulOpacityEntry.enabled, false);

  const xSlider = harness.root.FindChildTraverse('HPColorsPositionXSlider');
  const ySlider = harness.root.FindChildTraverse('HPColorsPositionYSlider');
  assert.deepEqual([xSlider.min, xSlider.max], [-300, 300]);
  assert.deepEqual([ySlider.min, ySlider.max], [-200, 200]);
  harness.root.FindChildTraverse('HPColorsAllyTeamHighToggle').events.onactivate();

  harness.root.FindChildTraverse('HPColorsEnemyTeamHighToggle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsExcludeBuildingsToggle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsExcludeBossesToggle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsExcludeGhoulsToggle').events.onactivate();
  harness.root.FindChildTraverse('HPColorsGhoulOpacityToggle').events.onactivate();
  assert.deepEqual([ghoulOpacity.min, ghoulOpacity.max], [0, 100]);
  assert.equal(ghoulOpacityRow.BHasClass('Disabled'), false);
  assert.equal(ghoulOpacity.enabled, true);
  assert.equal(ghoulOpacityEntry.enabled, true);
  ghoulOpacity.value = 35;
  ghoulOpacity.events.onvaluechanged();
  harness.root.FindChildTraverse('HPColorsUltModeCustom').events.onactivate();
  const values = JSON.parse(
    harness.root.GetAttributeString('hp_colors_rewrite_config', '{}'),
  ).values;
  assert.equal(values.allyTeamHigh, true);
  assert.equal(values.enemyTeamHigh, true);
  assert.equal(values.excludeBuildings, true);
  assert.equal(values.excludeBosses, true);
  assert.equal(values.excludeGhouls, true);
  assert.equal(values.ghoulOpacityEnabled, true);
  assert.equal(values.ghoulOpacity, 35);
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
