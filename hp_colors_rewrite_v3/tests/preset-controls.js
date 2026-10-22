'use strict';
const assert = require('node:assert/strict');
function presetControls(find, activate) {
  function tiles() { return find('HPColorsPresetList').Children().filter(panel => panel.GetAttributeString('hpv3_preset_id', '')); }
  function select(index) {
    const tile = index === 'baked_default' ? find('HPColorsPresetDefault') : tiles()[index];
    assert.ok(tile, 'preset tile ' + index); activate(tile.id);
    return find('HPColorsPresetSelectedNameEntry');
  }
  return { tiles, select, preset(index, role) { select(index); activate('HPColorsPresetSelected' + role + 'Button'); } };
}
module.exports = { presetControls };
