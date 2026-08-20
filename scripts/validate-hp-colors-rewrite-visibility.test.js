'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createPanoramaHarness,
  createVmContext,
  runHpColorsContractInVm,
  runInVm,
  buildUnitStatusTree,
  dispatchClientUiPayload,
} = require('./hp-colors-panorama-test-adapter');

const PROBE_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'hp_colors_rewrite', 'panorama', 'scripts', 'healthbar_probe.js'),
  'utf8',
);

function publishConfig(harness, revision, values) {
  const valuesRaw = JSON.stringify({ version: 1, revision, values });
  dispatchClientUiPayload(harness, {
    magic_word: 'HP_COLORS_REWRITE_CONFIG',
    version: 1,
    values_raw: valuesRaw,
  });
}

function runVisibilityScenario(unitStatusClasses, hiddenValues, shownValues) {
  const harness = createPanoramaHarness();
  const tree = buildUnitStatusTree(harness, { unitStatusClasses });
  const context = createVmContext(harness, { includeGameUI: false });
  runHpColorsContractInVm(context);
  runInVm(PROBE_SOURCE, context, 'healthbar_probe.js');

  publishConfig(harness, 1, hiddenValues);
  assert.equal(
    tree.unitHealthbar.style.opacity,
    '0.01',
    'hidden bars must retain nonzero opacity so engine width updates continue',
  );

  publishConfig(harness, 2, shownValues);
  assert.equal(
    tree.unitHealthbar.style.opacity,
    '1',
    'showing a previously hidden bar must explicitly restore visible opacity',
  );
}

test('enemy bar visibility can be disabled and enabled again', () => {
  runVisibilityScenario(
    ['enemy', 'team1'],
    { enabled: true, enemyEnabled: true, enemyVisible: false },
    { enabled: true, enemyEnabled: true, enemyVisible: true },
  );
});

test('ally bar visibility can be disabled and enabled again', () => {
  runVisibilityScenario(
    ['friend', 'team1'],
    { enabled: true, allyEnabled: true, allyVisible: false },
    { enabled: true, allyEnabled: true, allyVisible: true },
  );
});
