'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createPanoramaHarness,
  createVmContext,
  runInVm,
  buildUnitStatusTree,
  dispatchClientUiPayload,
} = require('./hp-colors-panorama-test-adapter');

const stagedRoot = process.env.HP_COLORS_REWRITE_SOURCE_ROOT || '';
const sourceRoot = path.resolve(__dirname, '../hp_colors_rewrite');
const scriptNames = [
  'hp_colors_contract.js',
  'hp_colors_state.js',
  'hp_colors_menu.js',
  'healthbar_probe.js',
];

function script(root, name) {
  return fs.readFileSync(path.join(root, 'panorama/scripts', name), 'utf8');
}

test(
  'Closure ADVANCED output preserves Rewrite runtime contracts and behavior',
  { skip: !stagedRoot },
  () => {
    for (const name of scriptNames) {
      const stagedPath = path.join(stagedRoot, 'panorama/scripts', name);
      const sourcePath = path.join(sourceRoot, 'panorama/scripts', name);
      assert.ok(fs.statSync(stagedPath).size < fs.statSync(sourcePath).size, name);
    }

    const menuHarness = createPanoramaHarness();
    const menuContext = createVmContext(menuHarness);
    runInVm(script(stagedRoot, 'hp_colors_contract.js'), menuContext, 'hp_colors_contract.js');
    runInVm(script(stagedRoot, 'hp_colors_state.js'), menuContext, 'hp_colors_state.js');
    assert.equal(typeof menuContext.$.HPColorsStateFactory.create, 'function');

    const state = menuContext.$.HPColorsStateFactory.create();
    assert.equal(state.read().effectiveValues.enemyLow, '#E16161');
    const edit = state.send({
      type: 'setting_edit',
      key: 'enemyLow',
      value: '#112233',
    });
    assert.equal(edit.outcome.status, 'committed');
    assert.equal(edit.view.effectiveValues.enemyLow, '#112233');
    assert.equal(
      edit.effects.some((effect) => effect.type === 'effective_publish'),
      true,
    );

    runInVm(script(stagedRoot, 'hp_colors_menu.js'), menuContext, 'hp_colors_menu.js');
    assert.equal(typeof menuContext.$.HPColorsMenuBoot, 'function');
    assert.equal(typeof menuContext.$.HPColorsMenuCancel, 'function');
    assert.equal(menuContext.$.HPColorsMenuCancel(), false);

    const probeHarness = createPanoramaHarness();
    const tree = buildUnitStatusTree(probeHarness, {
      unitStatusClasses: ['enemy', 'team1'],
      barWidth: 25,
      parentWidth: 100,
    });
    const probeContext = createVmContext(probeHarness, { includeGameUI: false });
    runInVm(script(stagedRoot, 'hp_colors_contract.js'), probeContext, 'hp_colors_contract.js');
    runInVm(script(stagedRoot, 'healthbar_probe.js'), probeContext, 'healthbar_probe.js');
    dispatchClientUiPayload(probeHarness, {
      magic_word: 'HP_COLORS_REWRITE_CONFIG',
      version: 1,
      values_raw: JSON.stringify({
        version: 1,
        revision: 1,
        values: {
          enabled: true,
          enemyEnabled: true,
          enemyMode: 'fixed',
          enemyLow: '#110000',
          enemyMid: '#220000',
          enemyHigh: '#330000',
          lowThreshold: 25,
          highThreshold: 65,
        },
      }),
    });
    assert.equal(tree.lagging.style.washColor, '#110000');
  },
);
