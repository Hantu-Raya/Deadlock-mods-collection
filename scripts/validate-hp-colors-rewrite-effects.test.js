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
const menuSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/hp_colors_menu.js'),
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
const unitStatusCssSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/styles/hp_colors_unit_status.css'),
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
    levelText: options.levelText === undefined ? '12' : options.levelText,
  });
  runInVm(
    probeSource,
    createVmContext(harness, { includeGameUI: false }),
    'healthbar_probe.js',
  );
  return { harness, tree };
}

test('pips and enemy-player level tiers are reversible', () => {
  const probe = bootProbe(['enemy', 'player', 'team1'], { levelText: '19' });
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    pipsVisible: false,
    levelsVisible: true,
    enemyPulseEnabled: false,
  });

  assert.equal(probe.tree.pip.style.visibility, 'collapse');
  assert.equal(probe.tree.levelContainer.style.visibility, 'visible');
  assert.equal(probe.tree.levelContainer.style.borderColor, '#ff8c00');
  assert.equal(probe.tree.unitStatus.BHasClass('level_tier3'), true);

  probe.tree.level.text = '35';
  probe.harness.scheduler.takeByFunctionName('scan').fn();
  assert.equal(probe.tree.levelContainer.style.borderColor, '#8b0000');
  assert.equal(probe.tree.unitStatus.BHasClass('level_tier3'), false);
  assert.equal(probe.tree.unitStatus.BHasClass('level_tier5'), true);

  publishConfig(probe.harness, 2, { enabled: false });
  assert.equal(probe.tree.pip.style.visibility, '');
  assert.equal(probe.tree.levelContainer.style.visibility, '');
  assert.equal(probe.tree.levelContainer.style.borderColor, '');
  assert.equal(probe.tree.unitStatus.BHasClass('level_number_visible'), false);
  assert.equal(probe.tree.unitStatus.BHasClass('level_tier5'), false);
});

test('levels stay stock outside enemy-player scope', () => {
  const ally = bootProbe(['friend', 'player', 'team1'], { levelText: '35' });
  publishConfig(ally.harness, 1, {
    enabled: true,
    allyEnabled: true,
    levelsVisible: true,
    allyPulseEnabled: false,
  });
  assert.equal(ally.tree.levelContainer.style.visibility || '', '');
  assert.equal(ally.tree.unitStatus.BHasClass('level_tier5'), false);

  const enemyBuilding = bootProbe(['enemy', 'player', 'building', 'team2'], {
    levelText: '35',
  });
  publishConfig(enemyBuilding.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    excludeBuildings: true,
    levelsVisible: true,
    enemyPulseEnabled: false,
  });
  assert.notEqual(enemyBuilding.tree.levelContainer.style.visibility, 'visible');
});
test('level tiers activate on exact lower boundaries', () => {
  const probe = bootProbe(['enemy', 'player', 'team1'], { levelText: '10' });
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    levelsVisible: true,
    enemyPulseEnabled: false,
  });
  const cases = [
    { level: 10, tier: null, color: '' },
    { level: 11, tier: 2, color: '#f0d000' },
    { level: 18, tier: 2, color: '#f0d000' },
    { level: 19, tier: 3, color: '#ff8c00' },
    { level: 26, tier: 3, color: '#ff8c00' },
    { level: 27, tier: 4, color: '#e53935' },
    { level: 34, tier: 4, color: '#e53935' },
    { level: 35, tier: 5, color: '#8b0000' },
  ];
  for (const item of cases) {
    probe.tree.level.text = String(item.level);
    probe.harness.scheduler.takeByFunctionName('scan').fn();
    assert.equal(probe.tree.levelContainer.style.borderColor || '', item.color);
    assert.equal(probe.tree.levelContainer.style.visibility, 'visible');
    for (const tier of [2, 3, 4, 5]) {
      assert.equal(
        probe.tree.unitStatus.BHasClass(`level_tier${tier}`),
        tier === item.tier,
      );
    }
  }
});


test('precise pip mode invalidates maximum-health parsing', () => {
  const probe = bootProbe(['enemy', 'player', 'team1'], {
    barWidth: 50,
    pipText: '\"\'|',
  });
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'hp',
    precisePipsEnabled: false,
    enemyPulseEnabled: false,
  });
  assert.equal(probe.tree.counter.text, '150 / 300');

  publishConfig(probe.harness, 2, {
    enabled: true,
    enemyEnabled: true,
    readoutVisible: true,
    readoutFormat: 'hp',
    precisePipsEnabled: true,
    enemyPulseEnabled: false,
  });
  assert.equal(probe.tree.counter.text, '15 / 30');
});
test('stable scan and paint do not repeat panel writes', () => {
  const probe = bootProbe(['enemy', 'player', 'team1'], { barWidth: 50 });
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyPulseEnabled: false,
    readoutVisible: true,
    levelsVisible: true,
  });
  const before = {
    classWrites: probe.harness.operationCounts.classWrites,
    styleWrites: probe.harness.operationCounts.styleWrites,
    textWrites: probe.harness.operationCounts.textWrites,
  };

  probe.harness.scheduler.takeByFunctionName('scan').fn();
  probe.harness.scheduler.takeByFunctionName('paintColors').fn();

  assert.deepEqual(
    {
      classWrites: probe.harness.operationCounts.classWrites,
      styleWrites: probe.harness.operationCounts.styleWrites,
      textWrites: probe.harness.operationCounts.textWrites,
    },
    before,
  );
});


test('enemy pulse uses cached CSS state and clears above threshold', () => {
  const probe = bootProbe(['enemy', 'player', 'team2'], {
    barWidth: 25,
    parentWidth: 100,
  });
  publishConfig(probe.harness, 1, {
    enabled: true,
    enemyEnabled: true,
    enemyVisible: true,
    readoutVisible: true,
    enemyPulseEnabled: true,
    enemyPulseThreshold: 25,
    enemyPulseBpm: 75,
    enemyPulseIntensity: 2,
    enemyPulseColorEnabled: true,
    enemyPulseColorMode: 'fixed',
    enemyPulseColor: '#FF2222',
    enemyPulseHideBar: true,
    enemyPulseReadout: true,
  });

  assert.equal(probe.tree.unitHealthbar.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(probe.tree.lagging.BHasClass('HPColorsRewritePulse'), true);
  assert.equal(
    probe.tree.lagging.BHasClass('HPColorsRewritePulseIntense'),
    true,
  );
  assert.equal(probe.tree.lagging.style.animationDuration, '0.800s');
  assert.equal(probe.tree.unitHealthbar.style.opacity, '0.01');
  assert.equal(probe.tree.lagging.style.washColor, '#FF2222');
  assert.equal(probe.tree.counter.BHasClass('HPColorsRewritePulse'), true);

  const durationWrites = getStyleWriteCount(
    probe.tree.lagging,
    'animationDuration',
  );
  probe.harness.scheduler.takeByFunctionName('paintColors').fn();
  assert.equal(
    getStyleWriteCount(probe.tree.lagging, 'animationDuration'),
    durationWrites,
  );

  probe.tree.lagging.actuallayoutwidth = 26;
  probe.harness.scheduler.takeByFunctionName('paintColors').fn();
  assert.equal(probe.tree.lagging.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(probe.tree.lagging.style.animationDuration, '');
  assert.equal(probe.tree.unitHealthbar.style.opacity, '1');
  assert.equal(probe.tree.counter.BHasClass('HPColorsRewritePulse'), false);
});
test('live pulse mode, BPM, and intensity changes apply immediately', () => {
  const probe = bootProbe(['enemy', 'player', 'team1'], {
    barWidth: 20,
    parentWidth: 100,
  });
  const base = {
    enabled: true,
    enemyEnabled: true,
    enemyPulseEnabled: true,
    enemyPulseThreshold: 25,
    enemyPulseColorEnabled: true,
    enemyPulseColor: '#0000FF',
  };

  publishConfig(probe.harness, 1, {
    ...base,
    enemyPulseColorMode: 'gradient',
    enemyPulseBpm: 75,
    enemyPulseIntensity: 0,
  });
  assert.equal(
    probe.tree.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    true,
  );
  assert.equal(
    probe.tree.pulseOverlay.BHasClass('HPColorsRewritePulseSubtle'),
    true,
  );
  assert.equal(probe.tree.pulseOverlay.style.animationDuration, '0.800s');

  publishConfig(probe.harness, 2, {
    ...base,
    enemyPulseColorMode: 'fixed',
    enemyPulseBpm: 120,
    enemyPulseIntensity: 2,
  });
  assert.equal(
    probe.tree.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    false,
  );
  assert.equal(probe.tree.lagging.BHasClass('HPColorsRewritePulse'), true);
  assert.equal(
    probe.tree.lagging.BHasClass('HPColorsRewritePulseIntense'),
    true,
  );
  assert.equal(probe.tree.lagging.style.animationDuration, '0.500s');
  assert.equal(probe.tree.pulseOverlay.style.washColor, '');
  assert.equal(probe.tree.pulseOverlay.style.width, '');

  publishConfig(probe.harness, 3, {
    ...base,
    enemyPulseColorMode: 'gradient',
    enemyPulseBpm: 60,
    enemyPulseIntensity: 1,
  });
  assert.equal(
    probe.tree.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    true,
  );
  assert.equal(
    probe.tree.pulseOverlay.BHasClass('HPColorsRewritePulseSubtle'),
    false,
  );
  assert.equal(
    probe.tree.pulseOverlay.BHasClass('HPColorsRewritePulseIntense'),
    false,
  );
  assert.equal(probe.tree.pulseOverlay.style.animationDuration, '1.000s');
  assert.equal(probe.tree.lagging.style.animationDuration, '');
});


test('ally pulse is independent and uses only its fixed custom color', () => {
  const probe = bootProbe(['friend', 'player', 'team1'], {
    barWidth: 20,
    parentWidth: 100,
  });
  publishConfig(probe.harness, 1, {
    enabled: true,
    allyEnabled: true,
    allyPulseEnabled: true,
    allyPulseThreshold: 20,
    allyPulseBpm: 120,
    allyPulseIntensity: 0,
    allyPulseColorEnabled: true,
    allyPulseColor: '#123456',
  });

  assert.equal(probe.tree.unitHealthbar.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(probe.tree.lagging.BHasClass('HPColorsRewritePulse'), true);
  assert.equal(
    probe.tree.lagging.BHasClass('HPColorsRewritePulseSubtle'),
    true,
  );
  assert.equal(probe.tree.lagging.style.animationDuration, '0.500s');
  assert.equal(probe.tree.lagging.style.washColor, '#123456');
  assert.equal(probe.tree.counter.BHasClass('HPColorsRewritePulse'), false);
});

test('enemy gradient pulse alternates base and custom colors independent of health depth', () => {
  const probe = bootProbe(['enemy', 'player', 'team1'], {
    barWidth: 20,
    parentWidth: 100,
  });
  const values = {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'fixed',
    enemyLow: '#E16161',
    lowThreshold: 25,
    highThreshold: 65,
    enemyPulseEnabled: true,
    enemyPulseThreshold: 25,
    enemyPulseBpm: 75,
    enemyPulseColorEnabled: true,
    enemyPulseColor: '#0000FF',
  };
  publishConfig(probe.harness, 1, values);

  assert.equal(probe.tree.lagging.style.washColor, '#E16161');
  assert.equal(probe.tree.lagging.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(probe.tree.pulseOverlay.style.washColor, '#0000FF');
  assert.equal(probe.tree.pulseOverlay.style.width, '20%');
  assert.equal(
    probe.tree.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    true,
  );
  assert.equal(probe.tree.pulseOverlay.style.animationDuration, '0.800s');
  assert.equal(probe.tree.lagging.style.animationDuration, '');

  probe.tree.lagging.actuallayoutwidth = 5;
  probe.harness.scheduler.takeByFunctionName('paintColors').fn();
  assert.equal(probe.tree.lagging.style.washColor, '#E16161');
  assert.equal(probe.tree.pulseOverlay.style.washColor, '#0000FF');
  assert.equal(probe.tree.pulseOverlay.style.width, '5%');

  probe.tree.lagging.actuallayoutwidth = 26;
  probe.harness.scheduler.takeByFunctionName('paintColors').fn();
  assert.equal(
    probe.tree.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    false,
  );
  assert.equal(probe.tree.pulseOverlay.style.washColor, '');
  assert.equal(probe.tree.pulseOverlay.style.width, '');
  assert.equal(probe.tree.pulseOverlay.style.visibility, '');
});
test('role and exclusion transitions clear owned presentation', () => {
  const probe = bootProbe(['enemy', 'player', 'team1'], {
    barWidth: 50,
    parentWidth: 100,
    levelText: '19',
  });
  const base = {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'fixed',
    enemyLow: '#AA0000',
    enemyMid: '#AA0000',
    enemyHigh: '#AA0000',
    readoutVisible: true,
    readoutFormat: 'percent',
    pipsVisible: false,
    levelsVisible: true,
    enemyPulseEnabled: false,
  };
  publishConfig(probe.harness, 1, base);
  assert.equal(probe.tree.lagging.style.washColor, '#AA0000');
  assert.equal(probe.tree.counter.style.visibility, 'visible');
  assert.equal(probe.tree.pip.style.visibility, 'collapse');
  assert.equal(probe.tree.unitStatus.BHasClass('level_tier3'), true);

  probe.tree.unitStatus.AddClass('building');
  probe.harness.scheduler.takeByFunctionName('scan').fn();
  publishConfig(probe.harness, 2, {
    ...base,
    excludeBuildings: true,
  });
  assert.equal(probe.tree.lagging.style.washColor, '');
  assert.equal(probe.tree.unitHealthbar.style.opacity, '');
  assert.equal(probe.tree.counter.style.visibility, 'collapse');
  assert.equal(probe.tree.counter.text, '');
  assert.equal(probe.tree.levelContainer.style.visibility, '');
  assert.equal(probe.tree.unitStatus.BHasClass('level_tier3'), false);

  probe.tree.unitStatus.RemoveClass('building');
  probe.tree.unitStatus.RemoveClass('enemy');
  probe.tree.unitStatus.AddClass('friend');
  probe.harness.scheduler.takeByFunctionName('scan').fn();
  assert.equal(probe.tree.pip.style.visibility, '');
  assert.equal(probe.tree.counter.style.visibility, 'collapse');
  assert.equal(probe.tree.counter.text, '');
  assert.equal(probe.tree.unitStatus.BHasClass('level_tier3'), false);
});

test('removed and replaced panels do not retain pulse ownership', () => {
  const removed = bootProbe(['enemy', 'player', 'team1'], {
    barWidth: 20,
    parentWidth: 100,
  });
  const pulseValues = {
    enabled: true,
    enemyEnabled: true,
    enemyPulseEnabled: true,
    enemyPulseThreshold: 25,
    enemyPulseColorEnabled: true,
    enemyPulseColorMode: 'gradient',
    enemyPulseColor: '#0000FF',
    enemyPulseReadout: true,
  };
  publishConfig(removed.harness, 1, pulseValues);
  assert.equal(
    removed.tree.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    true,
  );
  removed.tree.redParent.SetParent(null);
  removed.harness.scheduler.takeByFunctionName('scan').fn();
  assert.equal(
    removed.tree.lagging.BHasClass('HPColorsRewritePulse'),
    false,
  );
  assert.equal(
    removed.tree.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    false,
  );
  assert.equal(removed.tree.lagging.style.animationDuration, '');
  assert.equal(removed.tree.pulseOverlay.style.washColor, '');
  assert.equal(removed.tree.counter.BHasClass('HPColorsRewritePulse'), false);

  const replaced = bootProbe(['enemy', 'player', 'team1'], {
    barWidth: 20,
    parentWidth: 100,
  });
  publishConfig(replaced.harness, 1, pulseValues);
  const oldFill = replaced.tree.lagging;
  oldFill.SetParent(null);
  const replacement = replaced.tree.redParent.add(
    new MockPanel('unit_healthbar_lagging', {
      actuallayoutwidth: 20,
      actuallayoutheight: 12,
    }),
  );
  replaced.harness.scheduler.takeByFunctionName('scan').fn();
  assert.equal(
    oldFill.BHasClass('HPColorsRewritePulse'),
    false,
  );
  assert.equal(
    replacement.BHasClass('HPColorsRewritePulse'),
    false,
  );
  assert.equal(replacement.style.washColor, '#E16161');
  assert.equal(
    replaced.tree.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    true,
  );
});
test('identical config replay is ignored after immediate application', () => {
  const probe = bootProbe(['enemy', 'player', 'team1'], { barWidth: 20 });
  const values = {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'fixed',
    enemyLow: '#AABBCC',
    enemyPulseEnabled: false,
    readoutVisible: true,
    readoutFormat: 'percent',
  };
  publishConfig(probe.harness, 1, values);
  assert.equal(probe.tree.lagging.style.washColor, '#AABBCC');
  const before = {
    classWrites: probe.harness.operationCounts.classWrites,
    styleWrites: probe.harness.operationCounts.styleWrites,
    textWrites: probe.harness.operationCounts.textWrites,
  };
  const logsBefore = probe.harness.logs.length;

  publishConfig(probe.harness, 1, values);

  assert.deepEqual(
    {
      classWrites: probe.harness.operationCounts.classWrites,
      styleWrites: probe.harness.operationCounts.styleWrites,
      textWrites: probe.harness.operationCounts.textWrites,
    },
    before,
  );
  assert.equal(probe.harness.logs.length, logsBefore);
  assert.equal(probe.tree.lagging.style.washColor, '#AABBCC');
});



test('editor, overlay, and CSS expose the focused feature contract', () => {
  assert.match(menuSource, /enemyPulseColorMode:\s*"gradient"/);
  assert.match(probeSource, /enemyPulseColorMode:\s*"gradient"/);
  assert.match(hudLayoutSource, /id="HPColorsSettingsReadoutLevels"/);
  assert.match(hudLayoutSource, /id="HPColorsSettingsEnemyPulse"/);
  assert.match(hudLayoutSource, /id="HPColorsSettingsAllyPulse"/);
  assert.match(hudLayoutSource, /cannot apply or verify them/);
  assert.match(menuSource, /citadel_unit_status_health_per_minor_pip/);
  assert.match(menuSource, /citadel_unit_status_health_per_pip/);
  assert.match(menuSource, /citadel_unit_status_minor_pip_per_major_pip/);
  assert.equal(
    (overlayLayoutSource.match(/id="LevelContainer"/g) || []).length,
    1,
  );
  assert.match(overlayLayoutSource, /id="unit_level_label"[^>]*\{i:player_level\}/);
  assert.match(overlayLayoutSource, /hp_colors_unit_status\.vcss_c/);
  assert.match(unitStatusCssSource, /\.HPColorsRewritePulse/);
  assert.match(overlayLayoutSource, /id="hp_colors_pulse_overlay"/);
  assert.match(unitStatusCssSource, /\.NP_playerlevel_container/);
  assert.match(unitStatusCssSource, /border-radius:\s*50%/);
  assert.match(unitStatusCssSource, /\.HPColorsRewriteColorPulse/);
  assert.match(
    unitStatusCssSource,
    /#hp_colors_pulse_overlay[\s\S]*background-image:[\s\S]*z-index:\s*4/,
  );
  assert.match(
    unitStatusCssSource,
    /#hp_colors_pulse_overlay[\s\S]*width:\s*0%[\s\S]*height:\s*100%/,
  );
  assert.match(
    unitStatusCssSource,
    /#unit_healthbar_lagging\.HPColorsRewritePulse/,
  );
  assert.match(
    unitStatusCssSource,
    /\.enemy\.player\.level_number_visible \.NP_playerlevel_container/,
  );
  assert.match(unitStatusCssSource, /\.team1\.enemy \.NP_playerlevel_container/);
  assert.match(unitStatusCssSource, /\.team2\.enemy \.NP_playerlevel_container/);
  for (const tier of [2, 3, 4, 5]) {
    assert.match(unitStatusCssSource, new RegExp(`level_tier${tier}`));
  }
  assert.match(unitStatusCssSource, /animation-iteration-count:\s*infinite/);
  assert.doesNotMatch(probeSource, /setInterval|requestAnimationFrame/);
});
