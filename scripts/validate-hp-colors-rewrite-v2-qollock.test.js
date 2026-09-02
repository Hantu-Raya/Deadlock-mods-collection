'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const supportRoot = path.join(root, 'hp_colors_rewrite_v2_qollock');
const canonicalRoot = path.join(root, 'hp_colors_rewrite_v2');
const runtimeSupportRoot =
  process.env.HP_COLORS_REWRITE_V2_QOLLOCK_SOURCE_ROOT || supportRoot;
const supportLayout = path.join(supportRoot, 'panorama/layout/hud_escape_menu.xml');
const supportHud = path.join(supportRoot, 'panorama/layout/hud.xml');
const menuBridge = path.join(
  runtimeSupportRoot,
  'panorama/scripts/qollock_hp_colors_bridge.js',
);
const hashManifest = path.join(supportRoot, 'qollock-source.sha256');
const assetContract = path.join(supportRoot, 'pak02-contract.json');
const buildWrapper = path.join(root, 'build_hp_colors_rewrite_v2_qollock.ps1');
const canonicalBuildWrapper = path.join(root, 'build_hp_colors_rewrite_v2.ps1');
const closureHelper = path.join(root, 'scripts/hp-colors-rewrite-closure.ps1');
const refreshScript = path.join(root, 'scripts/refresh-hp-colors-rewrite-qollock.js');
const { buildEscapeMenu, buildHud } = require(refreshScript);

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseHashManifest() {
  const entries = read(hashManifest)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-f\d]{64})\s+(.+)$/i);
      assert.ok(match, `malformed hash manifest line: ${line}`);
      return { expected: match[1].toLowerCase(), source: match[2] };
    });
  return entries;
}

function hash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function makeQollockFixtures() {
  return {
    hud: [
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
    ].join('\n'),
    escape: [
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
    ].join('\n'),
  };
}

test('installed pak03 is the only pinned QOLLOCK input', () => {
  const entries = parseHashManifest();
  assert.equal(entries.length, 1);
  assert.match(entries[0].source, /Deadlock\/game\/citadel\/addons\/pak03_dir\.vpk$/i);
  assert.equal(hash(entries[0].source), entries[0].expected, `source drift: ${entries[0].source}`);
  assert.doesNotMatch(entries[0].source, /G:\/QOLLOCK/i);
});

test('refresh injects v2 assets once while retaining QOLLOCK healthbars', () => {
  const fixtures = makeQollockFixtures();
  const packageHash = 'a'.repeat(64);
  const hud = buildHud(fixtures.hud, packageHash);
  const escape = buildEscapeMenu(
    fixtures.escape,
    read(path.join(canonicalRoot, 'panorama/layout/hud_escape_menu.xml')),
    packageHash,
  );

  assert.ok(count(hud, /features\/[^\"]*healthbar[^\"]*\.vjs_c/gi) >= 2);
  for (const asset of [
    'hp_colors_v2_menu.vcss_c',
    'hp_colors_v2_contract.vjs_c',
    'hp_colors_v2_state.vjs_c',
    'hp_colors_v2_menu.vjs_c',
    'qollock_hp_colors_bridge.vjs_c',
  ]) {
    assert.equal(count(escape, new RegExp(asset.replace(/[.]/g, '\\.'), 'g')), 1, asset);
  }
  for (const id of [
    'HPColorsMenuButton',
    'HPColorsEditorRoot',
    'HPColorsSupporterTicker',
    'HPColorsAllyTeamHighToggle',
    'HPColorsRewritePresetStore',
  ]) {
    assert.equal(count(escape, new RegExp(`id="${id}"`, 'g')), 1, id);
  }
  assert.doesNotMatch(escape, /s2r:\/\/panorama\/(?:scripts|styles)\/hp_colors_(?!v2_)/);
  assert.doesNotMatch(escape, /qollock_settings_guard\.vjs_c/);
  assert.equal(count(escape, /&amp;&amp;/g), 2);
  assert.doesNotMatch(
    escape,
    /&(?!amp;|apos;|quot;|lt;|gt;|#\d+;|#x[\da-f]+;)/i,
  );
});

test('checked-in layouts retain QOLLOCK and expose the complete v2 editor', () => {
  const hud = read(supportHud);
  const layout = read(supportLayout);
  assert.ok(count(hud, /features\/[^\"]*healthbar[^\"]*\.vjs_c/gi) >= 2);
  assert.doesNotMatch(hud, /qollock_(?:runtime|topbar_warning)_guard\.vjs_c/i);
  assert.match(
    layout,
    /<Panel class="SettingsRow">\s*<Button id="ModSettingsBtn"[\s\S]*?<\/Button>\s*<\/Panel>\s*<Panel class="SettingsRow">\s*<Button id="HPColorsMenuButton"[\s\S]*?HP COLORS V2[\s\S]*?<\/Button>\s*<\/Panel>/,
  );
  assert.match(layout, /hp_colors_rewrite_preset_contract="HPCRP1"/);
  assert.match(layout, /id="HPColorsRewritePreset_001"[\s\S]*text=""/);
  assert.match(layout, /<CitadelHTMLPanel id="HPColorsSupporterTicker"[^>]*hittest="false"[^>]*acceptsfocus="false"/);
  assert.match(layout, /id="HPColorsAllyTeamHighToggle"/);
  for (const asset of [
    'hp_colors_v2_menu.vcss_c',
    'hp_colors_v2_contract.vjs_c',
    'hp_colors_v2_state.vjs_c',
    'hp_colors_v2_menu.vjs_c',
    'qollock_hp_colors_bridge.vjs_c',
  ]) {
    assert.equal(count(layout, new RegExp(asset.replace(/[.]/g, '\\.'), 'g')), 1, asset);
  }
});

test('support folder does not duplicate canonical v2 runtime', () => {
  const forbidden = [
    'hp_colors_v2_contract.js',
    'hp_colors_v2_state.js',
    'hp_colors_v2_menu.js',
    'unit_status_v2_colors.js',
    'hp_colors_v2_menu.css',
    'unit_status_v2.css',
    'unit_status_overlay_v2.xml',
  ];
  const matches = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (forbidden.includes(entry.name)) matches.push(child);
    }
  };
  walk(supportRoot);
  assert.deepEqual(matches, []);
  for (const name of forbidden) {
    assert.ok(fs.existsSync(path.join(
      canonicalRoot,
      name.endsWith('.xml') ? 'panorama/layout' : name.endsWith('.css') ? 'panorama/styles' : 'panorama/scripts',
      name,
    )), `missing canonical asset: ${name}`);
  }
});

test('opening either settings panel closes the other without resuming gameplay', () => {
  let hpColorsOpened = false;
  let hpColorsCancelled = 0;
  let qolVisible = true;
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
      HPColorsMenuCancel: () => {
        hpColorsCancelled += 1;
      },
      ToggleSettingsWindow: () => {
        qolVisible = !qolVisible;
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

  qolVisible = false;
  context.$.ToggleSettingsWindow();
  assert.equal(qolVisible, true);
  assert.equal(hpColorsCancelled, 1);
});

test('pak02 contract and wrapper enforce canonical reuse and pak02-only output', () => {
  const contract = JSON.parse(read(assetContract));
  assert.equal(contract.pak, 'pak02_dir.vpk');
  assert.deepEqual(contract.packageOrder, [
    'pak01 builder preset',
    'pak02 HP Colors Rewrite v2 support runtime',
    'pak03 pinned QOLLOCK',
  ]);
  assert.equal(contract.qollockAuthority, 'installed pak03_dir.vpk');
  assert.equal(contract.refreshSwitch, '-RefreshFromInstalledQollock');
  for (const asset of [
    'unit_status_overlay_v2.vxml_c',
    'hp_colors_v2_state.vjs_c',
    'unit_status_v2_colors.vjs_c',
    'qollock_hp_colors_bridge.vjs_c',
  ]) {
    assert.ok(contract.requiredPackedAssets.includes(asset), asset);
  }
  for (const asset of [
    'qollock_runtime_guard.vjs_c',
    'qollock_settings_guard.vjs_c',
    'qollock_topbar_warning_guard.vjs_c',
  ]) {
    assert.ok(!contract.requiredPackedAssets.includes(asset));
    assert.ok(contract.forbiddenPackedAssets.includes(asset));
  }
  assert.ok(contract.forbiddenBuildInputs.includes('hp_colors_rewrite_v2_compiled'));
  const retiredAligner = 'unit_status_v2_segment_align.vjs_c';
  assert.ok(!contract.canonicalRewriteAssets.some((asset) => asset.endsWith(retiredAligner)));
  assert.ok(!contract.requiredPackedAssets.includes(retiredAligner));
  assert.ok(contract.forbiddenPackedAssets.includes(retiredAligner));

  const wrapper = read(buildWrapper);
  assert.match(wrapper, /Assert-QolSourceHashes/);
  assert.match(wrapper, /Invoke-HpColorsRewriteClosureAdvanced/);
  assert.match(wrapper, /Invoke-HpColorsRewriteClosureTests/);
  assert.match(wrapper, /assetContract\.requiredPackedAssets/);
  assert.match(wrapper, /assetContract\.requiredPinnedQollockAssets/);
  assert.match(wrapper, /RefreshFromInstalledQollock/);
  assert.match(wrapper, /Source2ViewerPath/);
  assert.match(wrapper, /refresh-hp-colors-rewrite-qollock\.js/);
  assert.match(wrapper, /\[switch\]\$SkipDeploy/);
  assert.doesNotMatch(wrapper, /pak01_dir\.vpk/);
  assert.doesNotMatch(wrapper, /unit_status_v2_segment_align/);

  const canonicalWrapper = read(canonicalBuildWrapper);
  assert.match(canonicalWrapper, /\[switch\]\$SkipDeploy/);
  const helper = read(closureHelper);
  assert.match(helper, /validate-hp-colors-rewrite-v2-qollock\.test\.js/);
});
