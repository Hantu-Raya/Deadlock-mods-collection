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

const packageEscape403 = [
  '<!-- xml reconstructed by Source 2 Viewer 19.2.0.0 -->',
  '<root>',
  '  <styles>',
  '    <include src="s2r://panorama/styles/ql_settings.vcss_c" />',
  '  </styles>',
  '  <scripts>',
  '    <include src="s2r://panorama/scripts/ql_settings_persistence.vjs_c" />',
  '    <include src="s2r://panorama/scripts/core/ql_persistence.vjs_c" />',
  '    <include src="s2r://panorama/scripts/core/ql_storage_bridge.vjs_c" />',
  '    <include src="s2r://panorama/scripts/ql_settings.vjs_c" />',
  '  </scripts>',
  '  <CitadelHudEscapeMenu oncancel="CitadelResumePlaying()">',
  '    <Panel id="EscapeBackground" onactivate="if ($.IsModSettingsOpen &amp;&amp; $.IsModSettingsOpen()) { $.ForceCloseModSettings(true); } else { CitadelResumePlaying(); }" />',
  '    <Panel id="SettingsWindow">',
  '      <Button id="CloseBtn" onactivate="if ($.ForceCloseModSettings) { $.ForceCloseModSettings(); } else { $.DispatchEvent(&apos;CitadelResumePlaying&apos;, $.GetContextPanel()); }"><Label text="X" /></Button>',
  '      <Panel id="SettingsList" onload="if ($.BuildUI) { $.BuildUI(); }" />',
  '    </Panel>',
  '    <Button id="matchmakingLeaveQueue" class="nav_menu_item primary leavequeue" onactivate="CitadelLeaveMatchmaking()" />',
  '    <Button id="newgame" onactivate="CitadelShowPlayPage()" />',
  '    <Button id="watchgame" onactivate="CitadelShowWatchPage( true )" />',
  '    <Button id="guides" onactivate="CitadelShowTrainingPage()" />',
  '    <Button id="changehero" onactivate="CitadelEscapeMenuChangeHero()" />',
  '    <Panel class="SettingsRow"><Button id="ModSettingsBtn" onactivate="if ($.ToggleSettingsWindow) { $.ToggleSettingsWindow(); }"><Label text="QOL LOCK" /></Button></Panel>',
  '    <CitadelBindingButton id="EscapeButton" action="MenuBack" onactivate="CitadelResumePlaying()" text="#menu_resume" />',
  '    <CitadelHTMLPanel id="QOLStorageBridge" class="QOLStorageBridge" hittest="false" acceptsfocus="false" />',
  '  </CitadelHudEscapeMenu>',
  '</root>',
].join('\n');

test('4.0.3 Escape composition preserves QOLLOCK assets and nested-cancel/resume semantics', () => {
  const canonical = read(path.join(root, 'hp_colors_rewrite_v2/panorama/layout/hud_escape_menu.xml'));
  const escape = buildEscapeMenu(packageEscape403, canonical, 'b'.repeat(64));
  for (const token of packageEscape403.match(/(?:src|id)="[^"]+"/g)) {
    assert.ok(escape.includes(token), token);
  }
  for (const id of ['HPColorsMenuButton', 'HPColorsEditorRoot', 'HPColorsV2StoreWrap']) {
    assert.equal((escape.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
  assert.match(escape, /onload="\$\.HPColorsMenuBoot\(\)"/);
  assert.match(escape, /class="nav_menu_item primary leavequeue"/);
  assert.doesNotMatch(escape, /<Button id="EscapeButton"/);
  for (const [tagName, id, eventName] of [
    ['CitadelHudEscapeMenu', null, 'oncancel'],
    ['Panel', 'EscapeBackground', 'onactivate'],
    ['Button', 'CloseBtn', 'onactivate'],
    ['CitadelBindingButton', 'EscapeButton', 'onactivate'],
  ]) {
    const tag = escape.match(new RegExp(`<${tagName}\\b${id ? `[^>]*id="${id}"` : ''}[^>]*>`))[0];
    const handler = tag.match(new RegExp(`${eventName}="([^"]*)"`))[1]
      .replaceAll('&amp;', '&').replaceAll('&apos;', "'");
    for (const consumed of [true, false]) {
      for (const qolOpen of [true, false]) {
        const calls = [];
        vm.runInNewContext(handler, {
          $: {
            HPColorsMenuCancel: () => { calls.push('cancel'); return consumed; },
            IsModSettingsOpen: () => qolOpen,
            ForceCloseModSettings: (backdrop) => calls.push(backdrop ? 'qol-backdrop' : 'qol-close'),
          },
          CitadelResumePlaying: () => calls.push('resume'),
        });
        assert.deepEqual(calls, consumed ? ['cancel'] : [
          'cancel',
          id === 'CloseBtn' ? 'qol-close' : id === 'EscapeBackground' && qolOpen ? 'qol-backdrop' : 'resume',
        ], `${id || tagName} consumed=${consumed} qolOpen=${qolOpen}`);
      }
    }
  }
  const binding = '<CitadelBindingButton id="EscapeButton"';
  assert.throws(() => buildEscapeMenu(packageEscape403.replace(binding, `<CitadelBindingButton id="EscapeButton" onactivate="CitadelResumePlaying()" />\n${binding}`), canonical, 'b'.repeat(64)), /Escape resume binding: expected exactly one match, found 2/);
  assert.throws(() => buildEscapeMenu(packageEscape403.replace(binding, '<CitadelBindingButton id="OtherButton"'), canonical, 'b'.repeat(64)), /Escape resume binding: expected exactly one match, found 0/);
  const legacyWrapper = '<Button id="EscapeButton" onactivate="CitadelResumePlaying()">';
  const legacy = packageEscape403.replace(
    /<CitadelBindingButton id="EscapeButton"[^>]*\/>/,
    (tag) => `${legacyWrapper}${tag}</Button>`,
  );
  const escape401 = buildEscapeMenu(legacy, canonical, 'a'.repeat(64), 'pak47');
  assert.match(escape401, /<Button id="EscapeButton" onactivate="if \(\$\.HPColorsMenuCancel/);
  assert.throws(() => buildEscapeMenu(legacy.replace(legacyWrapper, `${legacyWrapper}${legacyWrapper}`), canonical, 'a'.repeat(64)), /Escape resume button: expected exactly one match, found 2/);
});

test('v2 compatibility pin and generated menu target the QOLLOCK 4.0.4 3 October pak03', () => {
  const v2Support = path.join(root, 'hp_colors_rewrite_v2_qollock');
  const contract = JSON.parse(read(path.join(v2Support, 'pak02-contract.json')));
  assert.equal(contract.packageOrder[1], 'pak03 pinned QOLLOCK 4.0.4 3 October (qollock_404_3october.zip)');
  assert.equal(contract.qollockAuthority, 'pinned QOLLOCK 4.0.4 3 October pak03_dir.vpk (qollock_404_3october.zip)');
  assert.match(read(path.join(v2Support, 'qollock-source.sha256')), /^a8ea90f59945674b6b3df0475c87fa107317a6e9c4600a95c06e4eadb7e42575\s+.*\/qollock-404-3oct\/pak03_dir\.vpk\s*$/);
  const escape = read(path.join(v2Support, 'panorama/layout/hud_escape_menu.xml'));
  assert.match(escape, /Generated from pak03 SHA-256 a8ea90f5/);
  assert.doesNotMatch(escape, /<Button id="EscapeButton"/);
  for (const asset of ['core/ql_persistence.vjs_c', 'core/ql_storage_bridge.vjs_c', 'ql_settings_persistence.vjs_c']) {
    assert.ok(escape.includes(`s2r://panorama/scripts/${asset}`), asset);
  }
  assert.match(escape, /<CitadelHTMLPanel id="QOLStorageBridge"/);
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




test('v2 QOLLOCK composition retains the twelve-page ownership matrix and native picker style', () => {
  const canonical = read(path.join(root, 'hp_colors_rewrite_v2/panorama/layout/hud_escape_menu.xml'));
  const source = read(path.join(root, 'hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_menu.js'));
  const categories = vm.runInNewContext(source.match(/var CATEGORY_DEFS = ([\s\S]*?\n  \]);/)[1]);
  const rows = vm.runInNewContext('(' + source.match(/var SETTING_ROW_IDS = ([\s\S]*?\n  });/)[1] + ')');
  const escape = buildEscapeMenu(packageEscape403, canonical, 'b'.repeat(64));
  const ancestry = new Map();
  const stack = [];
  for (const token of escape.match(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g) || []) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    const id = token.match(/\bid="([^"]+)"/)?.[1] || '';
    if (id.startsWith('HPColors')) {
      assert.ok(!ancestry.has(id), 'unique composed HP ID ' + id);
      ancestry.set(id, stack.filter(Boolean));
    }
    if (!token.endsWith('/>')) stack.push(id);
  }
  assert.equal(stack.length, 0);
  assert.equal(categories.flatMap(category => category.tabs).length, 12);
  let keys = 0;
  for (const category of categories) for (const tab of category.tabs) {
    assert.equal(ancestry.get(tab.pageId).at(-1), 'HPColorsSettingsList');
    for (const key of tab.keys) {
      keys++;
      assert.ok(ancestry.get(rows[key]).includes(tab.pageId), key + ' composed owner');
    }
  }
  assert.equal(keys, 151);
  for (const id of ['HPColorsPlayerSide', 'HPColorsAdvancedToggle', 'HPColorsV2Store', 'HPColorsNativePicker'])
    assert.ok(ancestry.has(id), id);
  // The composed menu must include the same stock picker stylesheet as the
  // canonical layout; an unknown s2r include is a fatal layout load in game.
  const pickerInclude = /s2r:\/\/panorama\/styles\/[a-z_]*color_picker\.vcss_c/g;
  const canonicalPicker = canonical.match(pickerInclude);
  assert.deepEqual(canonicalPicker, ['s2r://panorama/styles/citadel_ui_color_picker.vcss_c']);
  assert.deepEqual(escape.match(pickerInclude), canonicalPicker);
  const withHostStyle = packageEscape403.replace('<styles>', `<styles><include src="${canonicalPicker[0]}" />`);
  assert.deepEqual(buildEscapeMenu(withHostStyle, canonical, 'b'.repeat(64)).match(pickerInclude), canonicalPicker);
});
