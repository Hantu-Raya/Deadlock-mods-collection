'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const supportRoot = path.join(root, 'hp_colors_rewrite_qollock');
const canonicalRoot = path.join(root, 'hp_colors_rewrite');
const runtimeSupportRoot =
  process.env.HP_COLORS_REWRITE_QOLLOCK_SOURCE_ROOT || supportRoot;
const menuBridge = path.join(
  runtimeSupportRoot,
  'panorama/scripts/qollock_hp_colors_bridge.js',
);
const refreshScript = path.join(root, 'scripts/refresh-hp-colors-rewrite-qollock.js');
const {
  buildEscapeMenu,
  buildHud,
} = require(refreshScript);

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}


function assertThresholdRowsOnEnemyBar(xml) {
  const enemyBarStart = xml.indexOf('<Panel id="HPColorsSettingsEnemyBar"');
  const enemyBarEnd = xml.indexOf(
    '<Panel id="HPColorsSettingsEnemyFeedback"',
    enemyBarStart,
  );
  assert.ok(enemyBarStart >= 0);
  assert.ok(enemyBarEnd > enemyBarStart);
  for (const id of [
    'HPColorsSharedLowThresholdRow',
    'HPColorsSharedHighThresholdRow',
  ]) {
    const rowIndex = xml.indexOf(`id="${id}"`);
    assert.ok(rowIndex > enemyBarStart && rowIndex < enemyBarEnd, id);
  }
}


test('package layout refresh retains QOL healthbars and injects each owned asset once', () => {
  const packageHash = 'a'.repeat(64);
  const packageHud = [
    '<!-- xml reconstructed by fixture -->',
    '<root>',
    '  <scripts>',
    '    <include src="s2r://panorama/scripts/ql_config.vjs_c" />',
    '    <include src="s2r://panorama/scripts/features/ql_feat_healthbar.vjs_c" />',
    '    <include src="s2r://panorama/scripts/features/healthbar/ql_feat_healthbar_hud.vjs_c" />',
    '    <include src="s2r://panorama/scripts/manifests/ql_color_warnings/manifest.vjs_c" />',
    '    <include src="s2r://panorama/scripts/core/ql_app.vjs_c" />',
    '  </scripts>',
    '</root>',
    '',
  ].join('\n');
  const packageEscape = [
    '<!-- xml reconstructed by fixture -->',
    '<root>',
    '  <styles>',
    '    <include src="s2r://panorama/styles/ql_settings.vcss_c" />',
    '  </styles>',
    '  <scripts>',
    '    <include src="s2r://panorama/scripts/ql_settings.vjs_c" />',
    '  </scripts>',
    '  <CitadelHudEscapeMenu oncancel="CitadelResumePlaying()">',
    '    <Panel id="EscapeBackground" onactivate="CitadelResumePlaying()" />',
    '    <Panel class="SettingsRow">',
    '      <Button id="ModSettingsBtn"><Label text="QOL LOCK" /></Button>',
    '    </Panel>',
    '  </CitadelHudEscapeMenu>',
    '</root>',
    '',
  ].join('\n');

  const hud = buildHud(packageHud, packageHash);
  assert.ok((hud.match(/features\/[^"]*healthbar[^"]*\.vjs_c/gi) || []).length >= 2);
  assert.doesNotMatch(hud, /qollock_(?:runtime|topbar_warning)_guard\.vjs_c/i);

  const escape = buildEscapeMenu(
    packageEscape,
    read(path.join(canonicalRoot, 'panorama/layout/hud_escape_menu.xml')),
    packageHash,
  );
  for (const id of [
    'HPColorsMenuButton',
    'HPColorsEditorRoot',
    'HPColorsRewritePresetStore',
  ]) {
    assert.equal((escape.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.doesNotMatch(escape, /qollock_settings_guard\.vjs_c/i);
  assertThresholdRowsOnEnemyBar(escape);
  assert.equal((escape.match(/&amp;&amp;/g) || []).length, 2);
  assert.doesNotMatch(
    escape,
    /&(?!amp;|apos;|quot;|lt;|gt;|#\d+;|#x[\da-f]+;)/i,
  );

  assert.throws(
    () => buildHud(
      packageHud.replace(
        '  </scripts>',
        '    <include src="s2r://panorama/scripts/qollock_runtime_guard.vjs_c" />\n  </scripts>',
      ),
      packageHash,
    ),
    /pre-existing compatibility includes/,
  );
  assert.throws(
    () => buildEscapeMenu(
      packageEscape.replace(
        '<CitadelHudEscapeMenu',
        '<Panel id="HPColorsEditorRoot" />\n  <CitadelHudEscapeMenu',
      ),
      read(path.join(canonicalRoot, 'panorama/layout/hud_escape_menu.xml')),
      packageHash,
    ),
    /pre-existing HPColorsEditorRoot/,
  );
});





test('opening HP Colors closes QOL settings without resuming gameplay', () => {
  let hpColorsOpened = false;
  let qolVisible = true;
  let resumed = false;
  let onActivate = null;
  const settingsWindow = {
    BHasClass: (name) => name === 'Visible' && qolVisible,
  };
  const button = {
    SetPanelEvent: (eventName, callback) => {
      if (eventName === 'onactivate') onActivate = callback;
    },
  };
  const panel = {
    FindChildTraverse: (id) => {
      if (id === 'HPColorsMenuButton') return button;
      if (id === 'SettingsWindow') return settingsWindow;
      return null;
    },
  };
  const context = {
    $: {
      GetContextPanel: () => panel,
      HPColorsMenuBoot: () => {
        button.SetPanelEvent('onactivate', () => {
          hpColorsOpened = true;
        });
      },
      HPColorsMenuCancel: () => {},
      ToggleSettingsWindow: () => {
        qolVisible = !qolVisible;
      },
      ForceCloseModSettings: () => {
        qolVisible = false;
        resumed = true;
      },
      Msg: () => {},
    },
  };

  vm.runInNewContext(read(menuBridge), context);
  context.$.HPColorsMenuBoot();
  assert.equal(typeof onActivate, 'function');
  onActivate();
  assert.equal(qolVisible, false);
  assert.equal(hpColorsOpened, true);
  assert.equal(resumed, false);
});



