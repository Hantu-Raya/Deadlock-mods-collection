'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const supportRoot = path.join(root, 'hp_colors_rewrite_qollock');
const canonicalRoot = path.join(root, 'hp_colors_rewrite');
const supportLayout = path.join(supportRoot, 'panorama/layout/hud_escape_menu.xml');
const supportHud = path.join(supportRoot, 'panorama/layout/hud.xml');
const runtimeSupportRoot =
  process.env.HP_COLORS_REWRITE_QOLLOCK_SOURCE_ROOT || supportRoot;
const menuBridge = path.join(
  runtimeSupportRoot,
  'panorama/scripts/qollock_hp_colors_bridge.js',
);
const hashManifest = path.join(supportRoot, 'qollock-source.sha256');
const assetContract = path.join(supportRoot, 'pak02-contract.json');
const buildWrapper = path.join(root, 'build_hp_colors_rewrite_qollock.ps1');
const canonicalBuildWrapper = path.join(root, 'build_hp_colors_rewrite.ps1');
const closureHelper = path.join(root, 'scripts/hp-colors-rewrite-closure.ps1');
const refreshScript = path.join(root, 'scripts/refresh-hp-colors-rewrite-qollock.js');
const {
  buildEscapeMenu,
  buildHud,
} = require(refreshScript);

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseHashManifest() {
  return read(hashManifest)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64})\s+(.+)$/i);
      assert.ok(match, `invalid source hash entry: ${line}`);
      return { expected: match[1].toLowerCase(), source: match[2] };
    });
}

function hash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

test('installed pak03 is the only pinned QOLLOCK input', () => {
  const entries = parseHashManifest();
  assert.equal(entries.length, 1);
  assert.match(entries[0].source, /Deadlock\/game\/citadel\/addons\/pak03_dir\.vpk$/i);
  assert.equal(hash(entries[0].source), entries[0].expected, `source drift: ${entries[0].source}`);
  assert.doesNotMatch(entries[0].source, /G:\/QOLLOCK/i);
});

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

test('support folder does not duplicate canonical Rewrite runtime', () => {
  const forbidden = [
    'hp_colors_contract.js',
    'hp_colors_state.js',
    'hp_colors_menu.js',
    'healthbar_probe.js',
    'hp_colors_menu.css',
    'hp_colors_unit_status.css',
  ];
  for (const name of forbidden) {
    const matches = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(child);
        else if (entry.name === name) matches.push(child);
      }
    };
    walk(supportRoot);
    assert.deepEqual(matches, [], `duplicated canonical runtime: ${name}`);
  }
  const layout = read(supportLayout);
  for (const asset of [
    'hp_colors_contract.vjs_c',
    'hp_colors_state.vjs_c',
    'hp_colors_menu.vjs_c',
    'hp_colors_menu.vcss_c',
  ]) {
    assert.match(layout, new RegExp(asset.replace(/[.]/g, '\\.'), 'i'));
  }
  assert.ok(fs.existsSync(path.join(canonicalRoot, 'panorama/scripts/hp_colors_state.js')));
});

test('QOL healthbar controls and runtimes remain available', () => {
  const hud = read(supportHud);
  assert.ok((hud.match(/features\/[^"]*healthbar[^"]*\.vjs_c/gi) || []).length >= 2);
  assert.doesNotMatch(hud, /qollock_(?:runtime|topbar_warning)_guard\.vjs_c/i);
  const layout = read(supportLayout);
  assert.doesNotMatch(layout, /qollock_settings_guard\.vjs_c/i);
});

test('QOL LOCK and HP COLORS use separate stable menu rows', () => {
  const layout = read(supportLayout);
  for (const id of ['newgame', 'watchgame', 'guides']) {
    assert.match(layout, new RegExp(`id="${id}"`));
  }
  assert.match(
    layout,
    /<Panel class="SettingsRow">\s*<Button id="ModSettingsBtn"[\s\S]*?<\/Button>\s*<\/Panel>\s*<Panel class="SettingsRow">\s*<Button id="HPColorsMenuButton"[\s\S]*?<\/Button>\s*<\/Panel>/,
  );
  assertThresholdRowsOnEnemyBar(layout);
  const bridge = read(menuBridge);
  assert.match(bridge, /ToggleSettingsWindow/);
  assert.match(
    layout,
    /<CitadelHTMLPanel id="HPColorsSupporterTicker"[^>]*hittest="false"[^>]*acceptsfocus="false"/,
  );
  assert.match(layout, /id="HPColorsAllyTeamHighToggle"/);
  assert.match(bridge, /HPColorsMenuBoot/);
});

test('compact options leave space below Swap Hero', () => {
  const style = read(path.join(canonicalRoot, 'panorama/styles/hp_colors_menu.css'));
  assert.match(style, /#SubOptions\s*\{[^}]*margin-bottom:\s*118px;/);
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

test('HPCRP1 store is empty-safe', () => {
  const layout = read(supportLayout);
  assert.match(layout, /hp_colors_rewrite_preset_contract="HPCRP1"/);
  assert.match(layout, /hp_colors_rewrite_preset_version="1"/);
  assert.match(layout, /id="HPColorsRewritePreset_001"[\s\S]*text=""/);
});

test('both Rewrite wrappers require Closure ADVANCED staging and behavioral checks', () => {
  const helper = read(closureHelper);
  for (const wrapperPath of [canonicalBuildWrapper, buildWrapper]) {
    const wrapper = read(wrapperPath);
    assert.match(wrapper, /hp-colors-rewrite-closure\.ps1/);
    assert.match(wrapper, /Invoke-HpColorsRewriteClosureAdvanced/);
    assert.match(wrapper, /Invoke-HpColorsRewriteClosureTests/);
  }
  assert.match(helper, /google-closure-compiler/);
  assert.match(helper, /--compilation_level[\s\S]*ADVANCED/);
  assert.match(helper, /--language_out[\s\S]*ECMASCRIPT5_STRICT/);
  assert.match(helper, /Object\.prototype\.\$propertyName/);
  assert.match(helper, /HP_COLORS_REWRITE_SOURCE_ROOT/);
});

test('pak02 contract and wrapper enforce canonical reuse and pak02-only output', () => {
  const contract = JSON.parse(read(assetContract));
  assert.equal(contract.pak, 'pak02_dir.vpk');
  assert.deepEqual(contract.packageOrder, [
    'pak01 builder preset',
    'pak02 support runtime',
    'pak03 pinned QOLLOCK',
  ]);
  assert.equal(contract.qollockAuthority, 'installed pak03_dir.vpk');
  assert.equal(contract.refreshSwitch, '-RefreshFromInstalledQollock');
  assert.ok(contract.canonicalRewriteAssets.includes('panorama/scripts/hp_colors_state.vjs_c'));
  assert.ok(contract.requiredPackedAssets.includes('hp_colors_state.vjs_c'));
  assert.ok(contract.requiredPackedAssets.includes('unit_status_overlay.vxml_c'));
  assert.ok(contract.requiredPinnedQollockAssets.includes('panorama/scripts/core/ql_namespace.vjs_c'));
  assert.ok(contract.requiredPinnedQollockAssets.includes('panorama/scripts/features/ql_feat_healthbar.vjs_c'));
  assert.ok(!contract.forbiddenPackedAssets.includes('hp_colors_state.vjs_c'));
  assert.ok(!contract.forbiddenPackedAssets.includes('unit_status_overlay.vxml_c'));
  for (const asset of [
    'qollock_runtime_guard.vjs_c',
    'qollock_settings_guard.vjs_c',
    'qollock_topbar_warning_guard.vjs_c',
  ]) {
    assert.ok(!contract.requiredPackedAssets.includes(asset));
    assert.ok(contract.forbiddenPackedAssets.includes(asset));
  }
  assert.ok(contract.forbiddenBuildInputs.includes('hp_colors_rewrite_compiled'));
  const wrapper = read(buildWrapper);
  assert.match(wrapper, /Assert-QolSourceHashes/);
  assert.match(wrapper, /Invoke-Source2Compiler/);
  assert.match(wrapper, /Invoke-VpkPack/);
  assert.match(wrapper, /assetContract\.requiredPackedAssets/);
  assert.match(wrapper, /assetContract\.forbiddenPackedAssets/);
  assert.match(wrapper, /assetContract\.requiredPinnedQollockAssets/);
  assert.match(wrapper, /Pinned QOLLOCK pak03/);
  assert.match(wrapper, /pak02_dir\.vpk/);
  assert.match(wrapper, /RefreshFromInstalledQollock/);
  assert.match(wrapper, /Source2ViewerPath/);
  assert.match(wrapper, /refresh-hp-colors-rewrite-qollock\.js/);
  const refresh = read(refreshScript);
  assert.doesNotMatch(refresh, /G:[/\\]QOLLOCK/i);
  assert.match(refresh, /Generated from pak03 SHA-256/);
  assert.doesNotMatch(wrapper, /pak01_dir\.vpk/);
  const canonicalWrapper = read(canonicalBuildWrapper);
  assert.match(canonicalWrapper, /\[switch\]\$SkipDeploy/);
  assert.match(canonicalWrapper, /Deployment skipped/);
});
