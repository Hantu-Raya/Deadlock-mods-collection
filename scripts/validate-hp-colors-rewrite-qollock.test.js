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
const runtimeGuard = path.join(
  supportRoot,
  'panorama/scripts/qollock_runtime_guard.js',
);
const topbarWarningGuard = path.join(
  supportRoot,
  'panorama/scripts/qollock_topbar_warning_guard.js',
);
const settingsGuard = path.join(
  supportRoot,
  'panorama/scripts/qollock_settings_guard.js',
);
const menuBridge = path.join(
  supportRoot,
  'panorama/scripts/qollock_hp_colors_bridge.js',
);
const hashManifest = path.join(supportRoot, 'qollock-source.sha256');
const assetContract = path.join(supportRoot, 'pak02-contract.json');
const buildWrapper = path.join(root, 'build_hp_colors_rewrite_qollock.ps1');
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

test('installed pak03 is the only pinned QOLLOCK input', () => {
  const entries = parseHashManifest();
  assert.equal(entries.length, 1);
  assert.match(entries[0].source, /Deadlock\/game\/citadel\/addons\/pak03_dir\.vpk$/i);
  assert.equal(hash(entries[0].source), entries[0].expected, `source drift: ${entries[0].source}`);
  assert.doesNotMatch(entries[0].source, /G:\/QOLLOCK/i);
});

test('package layout refresh fails closed and injects each owned asset once', () => {
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
    '    <Button id="ModSettingsBtn"><Label text="QOL LOCK" /></Button>',
    '  </CitadelHudEscapeMenu>',
    '</root>',
    '',
  ].join('\n');

  const hud = buildHud(packageHud, packageHash);
  assert.doesNotMatch(hud, /features\/[^"]*healthbar[^"]*\.vjs_c/i);
  assert.equal((hud.match(/qollock_runtime_guard\.vjs_c/g) || []).length, 2);
  assert.equal((hud.match(/qollock_topbar_warning_guard\.vjs_c/g) || []).length, 1);

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

test('QOL healthbar controls and runtimes are removed without removing topbar warnings', () => {
  const hud = read(supportHud);
  assert.doesNotMatch(hud, /features\/ql_feat_healthbar|features\/healthbar\/ql_feat_healthbar/i);
  const warningManifestIndex = hud.indexOf('manifests/ql_color_warnings/manifest.vjs_c');
  const warningGuardIndex = hud.indexOf('qollock_topbar_warning_guard.vjs_c');
  assert.ok(warningManifestIndex >= 0 && warningGuardIndex > warningManifestIndex);
  assert.match(hud, /manifests\/ql_topbar\/manifest/i);
  const guard = read(settingsGuard);
  for (const key of [
    'HEALTHBAR_TYPE',
    'ENABLE_MINIMALIST_HEALTHBAR',
    'ENABLE_FG_HEALTHBAR',
    'ENABLE_ENEMY_V2_ENHANCED',
    'ENABLE_ENEMY_V2_ULT_INDICATOR',
    'ENABLE_ENEMY_V2_LEVEL',
    'ENABLE_ENEMY_ULT_INDICATOR',
    'PLAYER_HEALTHBAR_SCALE',
    'PLAYER_HEALTHBAR_OPACITY',
    'PLAYER_HEALTHBAR_X_OFFSET',
    'PLAYER_HEALTHBAR_Y_OFFSET',
  ]) {
    assert.match(guard, new RegExp(`${key}: true`));
  }
  for (const key of [
    'ENABLE_TOPBAR_ENEMY_HP_WARNING',
    'ENABLE_TOPBAR_ALLY_HP_WARNING',
  ]) {
    assert.doesNotMatch(guard, new RegExp(key));
  }
});

test('QOL LOCK and HP COLORS are ordered and mutually exclusive', () => {
  const layout = read(supportLayout);
  const qol = layout.indexOf('id="ModSettingsBtn"');
  const hp = layout.indexOf('id="HPColorsMenuButton"');
  assert.ok(qol >= 0 && hp > qol);
  const bridge = read(menuBridge);
  assert.match(bridge, /closeHpColors/);
  assert.match(bridge, /closeQolLock/);
  assert.match(bridge, /ToggleSettingsWindow/);
  assert.match(bridge, /HPColorsMenuBoot/);
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

test('missing QOL marker reports once and HPCRP1 store is empty-safe', () => {
  const guard = read(runtimeGuard);
  assert.match(guard, /required QOL runtime marker is absent/);
  assert.match(guard, /reportMissingQolRuntime\.reported/);
  assert.match(guard, /hp_colors_rewrite_qollock_missing_qol_reported/);
  assert.equal((guard.match(/required QOL runtime marker is absent/g) || []).length, 1);
  const layout = read(supportLayout);
  assert.match(layout, /hp_colors_rewrite_preset_contract="HPCRP1"/);
  assert.match(layout, /hp_colors_rewrite_preset_version="1"/);
  assert.match(layout, /id="HPColorsRewritePreset_001"[\s\S]*text=""/);
});

test('ignored QOL values are retained and imports warn once', () => {
  const guard = read(settingsGuard);
  assert.match(guard, /raw ignored values stay in MOD_CONFIG\/storage/);
  assert.match(guard, /TryApplyImportStringWithDiagnostics/);
  assert.match(guard, /ignoredHealthbarKeys/);
  assert.match(guard, /ignored QOL healthbar values were retained/);
  assert.match(guard, /ignoredWarningShown = false/);
});

test('settings guard removes the Healthbar tab and keeps ignored values inert', () => {
  const warnings = [];
  const rowCalls = [];
  const context = {
    QOL: {
      persistence: {
        applyParsedConfigWithDiagnostics: () => ({ clampedKeys: 0, unknownKeys: 0 }),
      },
    },
    currentTab: 'Healthbar',
    GetSettingsTabOrder: () => ['Support', 'Healthbar', 'HUD'],
    GetSettingsTabGroups: () => [
      { title: 'Gameplay', tabs: ['Crosshair', 'Healthbar', 'HUD'] },
    ],
    CreateRow: (...args) => rowCalls.push(args),
    CreateSliderRow: (...args) => {
      rowCalls.push(args);
      return 'created';
    },
    CreateInlineSecondaryCheckboxToggleRow: (...args) => rowCalls.push(args),
    InvalidateSearchSectionIndexCache: () => {},
    TryApplyImportStringWithDiagnostics: () => ({
      ok: true,
      parsedConfig: {
        ENABLE_COMBAT_INDICATOR: 1,
        PLAYER_HEALTHBAR_SCALE: 175,
        ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
      },
    }),
    SetLocalizedConfigFeedbackMessage: (message) => warnings.push(message),
    $: {
      Msg: () => {},
      Schedule: (_delay, callback) => callback(),
    },
  };

  vm.runInNewContext(read(settingsGuard), context);

  assert.deepEqual(
    Array.from(context.GetSettingsTabOrder()),
    ['Support', 'HUD'],
  );
  assert.deepEqual(
    Array.from(context.GetSettingsTabGroups()[0].tabs),
    ['Crosshair', 'HUD'],
  );
  assert.equal(context.currentTab, 'HUD');
  assert.equal(context.CreateSliderRow(null, 'Size', 'PLAYER_HEALTHBAR_SCALE'), null);
  assert.equal(rowCalls.length, 0);
  assert.equal(context.CreateSliderRow(null, 'Scale', 'SHOP_SCALE'), 'created');
  const imported = context.TryApplyImportStringWithDiagnostics('payload');
  assert.equal(imported.parsedConfig.PLAYER_HEALTHBAR_SCALE, 175);
  assert.equal(imported.parsedConfig.ENABLE_TOPBAR_ENEMY_HP_WARNING, 1);
  assert.deepEqual(
    Array.from(imported.ignoredHealthbarKeys).sort(),
    ['ENABLE_COMBAT_INDICATOR', 'PLAYER_HEALTHBAR_SCALE'],
  );
  assert.equal(warnings.length, 0);
  context.QOL.persistence.applyParsedConfigWithDiagnostics(imported.parsedConfig);
  assert.equal(warnings.length, 1);
});

test('runtime guard masks only QOL healthbar values', () => {
  const rawConfig = {
    ENABLE_COMBAT_INDICATOR: 1,
    HEALTHBAR_TYPE: 5,
    PLAYER_HEALTHBAR_SCALE: 175,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
  };
  const context = {
    QOL: {
      core: { App: { isBooted: () => true } },
      safeParseConfig: () => rawConfig,
      buildDefaultConfig: () => rawConfig,
      mergeConfig: () => rawConfig,
      applyBuildCategoryPayloadOverride: () => rawConfig,
    },
    $: {
      GetContextPanel: () => null,
      Msg: () => {},
    },
  };

  vm.runInNewContext(read(runtimeGuard), context);
  const masked = context.QOL.safeParseConfig('payload');
  assert.equal(masked.ENABLE_COMBAT_INDICATOR, 0);
  assert.equal(masked.HEALTHBAR_TYPE, 0);
  assert.equal(masked.PLAYER_HEALTHBAR_SCALE, 100);
  assert.equal(masked.ENABLE_TOPBAR_ENEMY_HP_WARNING, 1);
  assert.equal(rawConfig.ENABLE_COMBAT_INDICATOR, 1);
  assert.equal(rawConfig.PLAYER_HEALTHBAR_SCALE, 175);
});

test('missing QOL core reports once only after the second guard pass', () => {
  const attributes = new Map();
  const messages = [];
  const panel = {
    GetAttributeString: (key, fallback) => attributes.get(key) ?? fallback,
    SetAttributeString: (key, value) => attributes.set(key, value),
  };
  const context = {
    QOL: { core: {} },
    $: {
      GetContextPanel: () => panel,
      Msg: (message) => messages.push(message),
    },
  };

  vm.runInNewContext(read(runtimeGuard), context);
  assert.equal(messages.length, 0);
  vm.runInNewContext(read(runtimeGuard), context);
  vm.runInNewContext(read(runtimeGuard), context);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /required QOL runtime marker is absent/);
});

test('topbar warning guard keeps topbar keys and masks body healthbar keys', () => {
  let capturedConfig = null;
  const setCalls = [];
  const manifest = {
    enableKey: 'ENABLE_COLORED_HEALTHBAR',
    enabledByDefault: false,
    create: (context) => {
      capturedConfig = context.config.view();
      return {};
    },
  };
  const context = {
    QOL: {
      core: {
        FeatureRegistry: {
          getManifest: (id) => id === 'ql_color_warnings' ? manifest : null,
        },
        ConfigStore: {
          set: (...args) => setCalls.push(args),
        },
      },
    },
    $: { Msg: () => {} },
  };

  vm.runInNewContext(read(topbarWarningGuard), context);
  manifest.create({
    config: {
      view: () => ({
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_ENEMY_COLORED_HEALTHBAR: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1,
        UNRELATED: 7,
      }),
    },
  });

  assert.equal(manifest.enableKey, '');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(setCalls, [['ql_color_warnings', 'enabled', true]]);
  assert.equal(capturedConfig.ENABLE_COLORED_HEALTHBAR, 0);
  assert.equal(capturedConfig.ENABLE_ENEMY_COLORED_HEALTHBAR, 0);
  assert.equal(capturedConfig.ENABLE_TOPBAR_ENEMY_HP_WARNING_25, 1);
  assert.equal(capturedConfig.ENABLE_TOPBAR_ALLY_HP_WARNING_75, 1);
  assert.equal(capturedConfig.UNRELATED, 7);
});

test('runtime mask preserves topbar warning keys and masks body healthbars', () => {
  const guard = read(runtimeGuard);
  for (const key of [
    'HEALTHBAR_TYPE',
    'ENABLE_ENEMY_V2_ENHANCED',
    'ENABLE_ENEMY_V2_ULT_INDICATOR',
    'ENABLE_ENEMY_V2_LEVEL',
    'PLAYER_HEALTHBAR_SCALE',
    'ENABLE_COLOR_WARNING_25',
  ]) {
    assert.match(guard, new RegExp(`${key}:`));
  }
  for (const key of [
    'ENABLE_TOPBAR_ENEMY_HP_WARNING',
    'ENABLE_TOPBAR_ENEMY_HP_WARNING_75',
    'ENABLE_TOPBAR_ALLY_HP_WARNING',
    'ENABLE_TOPBAR_ALLY_HP_WARNING_75',
  ]) {
    assert.doesNotMatch(guard, new RegExp(`${key}:`));
  }
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
});
