'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
} = require('./hp-colors-panorama-test-adapter');

const rewriteRoot = path.resolve(__dirname, '../hp_colors_rewrite');
const layoutSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/layout/hud_escape_menu.xml'),
  'utf8',
);
const menuSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/hp_colors_menu.js'),
  'utf8',
);

function installLayoutPanels(harness) {
  const ids = new Set(
    Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
  );
  for (const id of ids) {
    harness.root.add(
      new MockPanel(id, {
        findCounts: harness.findCounts,
        childReadCounts: harness.childReadCounts,
      }),
    );
  }
}

function bootMenu() {
  const harness = createPanoramaHarness();
  installLayoutPanels(harness);
  runInVm(menuSource, createVmContext(harness), 'hp_colors_menu.js');
  harness.$.HPColorsMenuBoot();
  return harness;
}

test('picker uses only three native horizontal sliders', () => {
  assert.doesNotMatch(layoutSource, /HPColorsPickerField|Pointer|mouse_bridge/);
  assert.match(layoutSource, /id="HPColorsPickerHueSliderHost"/);
  assert.match(layoutSource, /id="HPColorsPickerSaturationSliderHost"/);
  assert.match(layoutSource, /id="HPColorsPickerLumenSliderHost"/);

  const harness = bootMenu();
  const hue = harness.root.FindChildTraverse('HPColorsPickerHueSlider');
  const saturation = harness.root.FindChildTraverse('HPColorsPickerSaturationSlider');
  const lumen = harness.root.FindChildTraverse('HPColorsPickerLumenSlider');

  assert.equal(hue.paneltype, 'Slider');
  assert.equal(hue.min, 0);
  assert.equal(hue.max, 359);
  assert.equal(saturation.min, 0);
  assert.equal(saturation.max, 100);
  assert.equal(lumen.min, 0);
  assert.equal(lumen.max, 100);
  for (const slider of [hue, saturation, lumen]) {
    assert.equal(slider.increment, 1);
    assert.equal(slider.BHasClass('HorizontalSlider'), true);
    assert.equal(slider.BHasClass('HPColorsPickerSlider'), true);
  }
});

test('slider gesture publishes live and Undo restores the prior color', () => {
  const harness = bootMenu();
  harness.root.FindChildTraverse('HPColorsMenuButton').events.onactivate();
  harness.root.FindChildTraverse('HPColorsEnemyLowSwatch').events.onactivate();

  const hue = harness.root.FindChildTraverse('HPColorsPickerHueSlider');
  const before = JSON.parse(
    harness.root.GetAttributeString('hp_colors_rewrite_config', '{}'),
  ).values.enemyLow;

  hue.events.onmousedown();
  hue.value = 120;
  hue.events.onvaluechanged();
  const changed = JSON.parse(
    harness.root.GetAttributeString('hp_colors_rewrite_config', '{}'),
  ).values.enemyLow;
  assert.notEqual(changed, before);
  assert.equal(harness.root.FindChildTraverse('HPColorsPickerHueValue').text, '120°');
  hue.events.onmouseup();

  const undo = harness.root.FindChildTraverse('HPColorsUndoButton');
  assert.equal(undo.enabled, true);
  undo.events.onactivate();
  assert.equal(
    JSON.parse(
      harness.root.GetAttributeString('hp_colors_rewrite_config', '{}'),
    ).values.enemyLow,
    before,
  );
});

