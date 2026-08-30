'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
} = require('./hp-colors-panorama-test-adapter');


const root = path.resolve(__dirname, '..');
const rewriteRoot = path.join(root, 'hp_colors_rewrite_v2');
const panoramaRoot = path.join(rewriteRoot, 'panorama');
const menuLayoutPath = path.join(
  panoramaRoot,
  'layout/hud_escape_menu.xml',
);
const layoutPath = path.join(
  panoramaRoot,
  'layout/unit_status_overlay_v2.xml',
);
const menuStylePath = path.join(panoramaRoot, 'styles/hp_colors_v2_menu.css');
const stylePath = path.join(panoramaRoot, 'styles/unit_status_v2.css');
const contractPath = path.join(
  panoramaRoot,
  'scripts/hp_colors_v2_contract.js',
);
const menuSourcePath = path.join(
  panoramaRoot,
  'scripts/hp_colors_v2_menu.js',
);
const colorConsumerPath = path.join(
  panoramaRoot,
  'scripts/unit_status_v2_colors.js',
);
const alignerPath = path.join(
  panoramaRoot,
  'scripts/unit_status_v2_segment_align.js',
);
const buildPath = path.join(root, 'build_hp_colors_rewrite_v2.ps1');

const SOURCE_ASSETS = [
  'layout/hud_escape_menu.xml',
  'layout/unit_status_overlay_v2.xml',
  'scripts/hp_colors_v2_contract.js',
  'scripts/hp_colors_v2_menu.js',
  'scripts/unit_status_v2_colors.js',
  'scripts/unit_status_v2_segment_align.js',
  'styles/hp_colors_v2_menu.css',
  'styles/unit_status_v2.css',
];
const PACKED_ASSETS = [
  'panorama/layout/hud_escape_menu.vxml_c',
  'panorama/layout/unit_status_overlay_v2.vxml_c',
  'panorama/styles/hp_colors_v2_menu.vcss_c',
  'panorama/styles/unit_status_v2.vcss_c',
  'panorama/scripts/hp_colors_v2_contract.vjs_c',
  'panorama/scripts/hp_colors_v2_menu.vjs_c',
  'panorama/scripts/unit_status_v2_colors.vjs_c',
  'panorama/scripts/unit_status_v2_segment_align.vjs_c',
];
const MENU_CONTROL_IDS = [
  'HPColorsV2MenuButton',
  'HPColorsV2EditorRoot',
  'HPColorsV2EditorShell',
  'HPColorsV2MasterToggle',
  'HPColorsV2EnemyColorSwatch',
  'HPColorsV2EnemyColorHex',
  'HPColorsV2AllyColorSwatch',
  'HPColorsV2AllyColorHex',
  'HPColorsV2PipsToggle',
  'HPColorsV2ResetButton',
  'HPColorsV2DoneButton',
  'HPColorsV2PickerRoot',
  'HPColorsV2PickerPanel',
  'HPColorsV2PickerBackdrop',
  'HPColorsV2PickerTitle',
  'HPColorsV2PickerPreview',
  'HPColorsV2PickerHex',
  'HPColorsV2PickerHueSliderHost',
  'HPColorsV2PickerSaturationSliderHost',
  'HPColorsV2PickerLightnessSliderHost',
  'HPColorsV2PickerHueValue',
  'HPColorsV2PickerSaturationValue',
  'HPColorsV2PickerLightnessValue',
  'HPColorsV2PickerDone',
];

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path.join(directory, entry.name), relative));
    } else {
      files.push(relative.replaceAll('\\', '/'));
    }
  }
  return files.sort();
}
function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadContractVm() {
  const context = vm.createContext({ $: {} });
  runInVm(read(contractPath), context, contractPath);
  assert.equal(typeof context.$.HPColorsV2ContractFactory, 'object');
  return {
    context,
    contract: context.$.HPColorsV2ContractFactory.create(),
  };
}

function installPanels(harness, ids) {
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
      operationCounts: harness.operationCounts,
    }));
  }
}

function bootMenuVm() {
  const harness = createPanoramaHarness();
  installPanels(harness, MENU_CONTROL_IDS);
  const context = createVmContext(harness, { includeGameUI: false });
  runInVm(read(contractPath), context, contractPath);
  runInVm(read(menuSourcePath), context, menuSourcePath);
  assert.equal(context.$.HPColorsV2MenuBoot(), true);
  return { harness, context };
}

function readPublishedSnapshot(harness) {
  const raw = harness.root.GetAttributeString('hp_colors_v2_config', '');
  assert.ok(raw, 'menu must publish a root config attribute');
  return JSON.parse(raw);
}

function latestPublishedSnapshot(harness) {
  const dispatch = harness.dispatches
    .filter((args) => args[0] === 'ClientUI_FireOutput')
    .at(-1);
  assert.ok(dispatch, 'menu must publish ClientUI_FireOutput');
  return JSON.parse(dispatch[dispatch.length - 1]);
}

function makeSnapshot(revision, values) {
  return JSON.stringify({
    magic_word: 'HP_COLORS_V2_CONFIG',
    version: 1,
    revision,
    values,
  });
}

function addLiveHealthbar(healthbars, harness, pipText, fillWidth) {
  const healthbar = healthbars.add(new MockPanel('UnitHealthbarContainer', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const background = healthbar.add(new MockPanel('unit_healthbar_bg', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const missing = background.add(new MockPanel('unit_healthbar_missing', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const activeParent = missing.add(new MockPanel('unit_healthbar_active_parent', {
    actuallayoutwidth: 100,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const fill = activeParent.add(new MockPanel('unit_healthbar_lagging', {
    actuallayoutwidth: fillWidth,
    style: { washColor: '' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const pip = activeParent.add(new MockPanel('unit_healthbar_pip_label', {
    text: '',
    attributes: { text: pipText },
    style: { visibility: '' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  return { activeParent, fill, pip };
}

function makeStatusFixture(
  role,
  values,
  revision = 1,
  pipText = "|'",
  includeStockDecoy = false,
  includeSiblingDecoy = false,
) {
  const harness = createPanoramaHarness({ includeGameUI: false });
  const classes =
    role === 'enemy'
      ? ['enemy']
      : role === 'ally'
        ? ['friend']
        : role === 'neutral'
          ? ['team_neutral']
          : [];
  const root = harness.root;
  let siblingCounter = null;
  let siblingFill = null;
  if (includeSiblingDecoy) {
    const siblingStatus = root.add(new MockPanel('UnitStatusSibling', {
      classes: ['enemy'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingInfo = siblingStatus.add(new MockPanel('InfoHealthContainer', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingUnitInfo = siblingInfo.add(new MockPanel('UnitInfoContainer', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingUnitInfo.add(new MockPanel('unit_ult_ready_icon', {
      style: { washColor: '' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingHealthbars = siblingInfo.add(new MockPanel(
      'UnitHealthbarsContainer',
      {
        findCounts: harness.findCounts,
        operationCounts: harness.operationCounts,
      },
    ));
    siblingFill = addLiveHealthbar(
      siblingHealthbars,
      harness,
      '||||||||',
      10,
    ).fill;
    const siblingCounterContainer = siblingInfo.add(new MockPanel(
      'hp_counter_container',
      {
        findCounts: harness.findCounts,
        operationCounts: harness.operationCounts,
      },
    ));
    siblingCounter = siblingCounterContainer.add(new MockPanel('hp_counter', {
      style: { visibility: 'collapse' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingCounterContainer.add(new MockPanel('hp_counter_max', {
      style: { visibility: 'collapse' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
  }
  const unitStatus = root.add(new MockPanel('UnitStatus', {
    classes,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const infoHealth = unitStatus.add(new MockPanel('InfoHealthContainer', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const unitInfo = infoHealth.add(new MockPanel('UnitInfoContainer', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const unitInfoPanel = unitInfo.add(new MockPanel('unit_info_panel', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const infoBg = unitInfoPanel.add(new MockPanel('unit_info_bg', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const ult = infoBg.add(new MockPanel('unit_ult_ready_icon', {
    style: { washColor: '' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  let stockFill = null;
  let stockPip = null;
  if (includeStockDecoy) {
    const stockBar = infoHealth.add(new MockPanel('UnitHealthbarContainer', {
      classes: ['old_bar'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const stockBackground = stockBar.add(new MockPanel('unit_healthbar_bg', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const stockMissing = stockBackground.add(new MockPanel('unit_healthbar_missing', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const stockParent = stockMissing.add(new MockPanel('unit_healthbar_active_parent', {
      actuallayoutwidth: 0,
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    stockFill = stockParent.add(new MockPanel('unit_healthbar_lagging', {
      actuallayoutwidth: 0,
      style: { washColor: '' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    stockPip = stockParent.add(new MockPanel('unit_healthbar_pip_label', {
      text: '',
      attributes: { text: '' },
      style: { visibility: '' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
  }
  const healthbars = infoHealth.add(new MockPanel('UnitHealthbarsContainer', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const counterContainer = infoHealth.add(new MockPanel('hp_counter_container', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const liveBar = addLiveHealthbar(healthbars, harness, pipText, 50);
  const activeParent = liveBar.activeParent;
  const fill = liveBar.fill;
  const pip = liveBar.pip;
  const counterAnchor = counterContainer.add(new MockPanel('hp_counter_anchor', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const counterRow = counterAnchor.add(new MockPanel('hp_counter_row', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const counter = counterRow.add(new MockPanel('hp_counter', {
    style: { visibility: 'collapse' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const counterMax = counterRow.add(new MockPanel('hp_counter_max', {
    style: { visibility: 'collapse' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  root.SetAttributeString(
    'hp_colors_v2_config',
    makeSnapshot(revision, values),
  );
  harness.contextPanel = unitStatus;
  const context = createVmContext(harness, { includeGameUI: false });
  runInVm(read(contractPath), context, contractPath);
  runInVm(read(colorConsumerPath), context, colorConsumerPath);
  return {
    harness,
    context,
    root,
    unitStatus,
    fill,
    ult,
    pip,
    counter,
    counterMax,
    activeParent,
    healthbars,
    counterContainer,
    stockFill,
    stockPip,
    siblingCounter,
    siblingFill,
  };
}

function dispatchColorSnapshot(fixture, revision, values) {
  const handler = fixture.harness.handlers.ClientUI_FireOutput;
  assert.equal(typeof handler, 'function');
  handler(makeSnapshot(revision, values));
}

function cssBlock(source, selector) {
  const pattern = new RegExp(
    `(?:^|\\n)${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm',
  );
  const match = source.match(pattern);
  assert.ok(match, `missing CSS selector: ${selector}`);
  return match[1];
}

function parsePanelPaths(source) {
  const stack = [];
  const paths = [];
  for (const match of source.matchAll(/<\/?Panel\b[^>]*>/g)) {
    const token = match[0];
    if (token.startsWith('</')) {
      assert.ok(stack.length > 0, 'Panel closing tag must match an opening tag');
      stack.pop();
      continue;
    }
    const idMatch = token.match(/\bid="([^"]+)"/);
    const classMatch = token.match(/\bclass="([^"]+)"/);
    let identity = 'Panel';
    if (idMatch) {
      identity = `id:${idMatch[1]}`;
    } else if (classMatch) {
      const firstClass = classMatch[1].trim().split(/\s+/)[0];
      if (firstClass) identity = `class:${firstClass}`;
    }
    paths.push([...stack, identity].join(' > '));
    if (!/\/\s*>$/.test(token)) stack.push(identity);
  }
  assert.equal(stack.length, 0, 'Panel tags must be balanced');
  return paths;
}

test('v2 layouts keep stock panels and load the color runtime', () => {
  const layout = read(layoutPath);
  const menuLayout = read(menuLayoutPath);
  assert.deepEqual(listFiles(panoramaRoot), SOURCE_ASSETS);
  assert.match(
    layout,
    /<styles>\s*<include src="s2r:\/\/panorama\/styles\/unit_status_v2\.vcss_c" \/>\s*<\/styles>/,
  );
  assert.match(
    layout,
    /<scripts>\s*<include src="s2r:\/\/panorama\/scripts\/hp_colors_v2_contract\.vjs_c" \/>\s*<include src="s2r:\/\/panorama\/scripts\/unit_status_v2_colors\.vjs_c" \/>\s*<include src="s2r:\/\/panorama\/scripts\/unit_status_v2_segment_align\.vjs_c" \/>\s*<\/scripts>/,
  );
  assert.match(
    menuLayout,
    /<styles>[\s\S]*<include src="s2r:\/\/panorama\/styles\/hp_colors_v2_menu\.vcss_c" \/>[\s\S]*<\/styles>/,
  );
  assert.match(
    menuLayout,
    /<scripts>\s*<include src="s2r:\/\/panorama\/scripts\/hp_colors_v2_contract\.vjs_c" \/>\s*<include src="s2r:\/\/panorama\/scripts\/hp_colors_v2_menu\.vjs_c" \/>\s*<\/scripts>/,
  );
  assert.match(
    menuLayout,
    /<CitadelHudEscapeMenu[^>]*onload="\$\.HPColorsV2MenuBoot\(\)"/,
  );
  assert.match(
    menuLayout,
    /<CitadelHudEscapeMenu[^>]*oncancel="if \(!\$\.HPColorsV2MenuCancel\(\)\) \$\.DispatchEvent\( &apos;CitadelResumePlaying&apos;, \$\.GetContextPanel\(\)\)"/,
  );
  assert.doesNotMatch(menuLayout, /ShowRankBarebones|showrank_barebones/);
  assert.match(
    layout,
    /<Panel id="hp_counter_anchor"[^>]*>\s*<Panel id="hp_counter_row"[^>]*>\s*<Label id="hp_counter"[^>]*\/>\s*<Label id="hp_counter_max"[^>]*\/>\s*<\/Panel>\s*<\/Panel>/,
  );
  for (const id of ['hp_counter', 'hp_counter_max']) {
    const label = layout.match(new RegExp(`<Label id="${id}"[^>]*\\/>`));
    assert.ok(label, `missing ${id} label`);
    assert.match(label[0], /\btext=""/);
    assert.match(label[0], /font-size:\s*145px/);
    assert.match(label[0], /color:\s*#FFFFFF/);
    assert.match(label[0], /width:\s*fit-children/);
    assert.match(label[0], /white-space:\s*nowrap/);
    assert.match(label[0], /z-index:\s*1000/);
    assert.match(label[0], /visibility:\s*collapse/);
    assert.doesNotMatch(label[0], /background-color/);
  }
  assert.doesNotMatch(
    layout,
    /engine_overrides|width_normalizer|unit_status_v2_probe|healthbar_logic/,
  );
  assert.match(
    layout,
    /<Panel id="unit_info_bg">\s*<Image id="unit_ult_ready_icon" \/>/,
  );
  assert.equal(
    (layout.match(/id="unit_healthbar_pip_label"/g) || []).length,
    2,
  );
  assert.doesNotMatch(
    layout,
    /CriticalIndicator|Citadel_Hud_Critical/,
    'production layout must not create the critical-health text panel',
  );

  const panelPaths = parsePanelPaths(layout);
  const unitStatusPath = ['class:WindowRoot', 'id:UnitStatus'];
  const infoHealthPath = [...unitStatusPath, 'id:InfoHealthContainer'];
  for (const childIdentity of [
    'id:UnitInfoContainer',
    'id:UnitHealthbarsContainer',
    'id:UnitHealthbarContainer',
  ]) {
    assert.ok(
      panelPaths.includes([...infoHealthPath, childIdentity].join(' > ')),
      `missing stock panel: ${childIdentity}`,
    );
  }
  const counterContainerPath = [...infoHealthPath, 'id:hp_counter_container'];
  for (const path of [
    counterContainerPath,
    [...counterContainerPath, 'id:hp_counter_anchor'],
    [...counterContainerPath, 'id:hp_counter_anchor', 'id:hp_counter_row'],
  ]) {
    assert.ok(
      panelPaths.includes(path.join(' > ')),
      `missing stable readout panel: ${path.at(-1)}`,
    );
  }
});

test('v2 contract exposes exact defaults and normalizes hex values', () => {
  const { contract } = loadContractVm();
  assert.deepEqual(jsonClone(contract.defaults), {
    enabled: true,
    enemyColor: '#FD4949',
    allyColor: '#FFEFD7',
    pipsVisible: true,
  });
  assert.deepEqual(jsonClone(contract.keys), [
    'enabled',
    'enemyColor',
    'allyColor',
    'pipsVisible',
  ]);
  assert.equal(contract.version, 1);
  assert.equal(contract.normalizeColor(' fd4949 '), '#FD4949');
  assert.equal(contract.normalizeColor('#aBcDeF'), '#ABCDEF');
  assert.equal(contract.normalizeColor('123456'), '#123456');
  assert.equal(contract.normalizeColor('#123', '#FFEFD7'), '#FFEFD7');
  assert.equal(contract.normalizeColor('not-a-color', '#FFEFD7'), '#FFEFD7');
  assert.deepEqual(
    jsonClone(
      contract.normalizeValues({
        enabled: 0,
        enemyColor: ' #abcdef ',
        allyColor: '123456',
        pipsVisible: '',
      }),
    ),
    {
      enabled: false,
      enemyColor: '#ABCDEF',
      allyColor: '#123456',
      pipsVisible: false,
    },
  );
});

test('v2 menu exposes exact controls and shared protocol constants', () => {
  const menuLayout = read(menuLayoutPath);
  const menuSource = read(menuSourcePath);
  const menuStyle = read(menuStylePath);
  const colorConsumer = read(colorConsumerPath);
  const { contract } = loadContractVm();
  assert.equal(contract.eventChannel, 'ClientUI_FireOutput');
  assert.equal(contract.magicWord, 'HP_COLORS_V2_CONFIG');
  assert.equal(contract.configAttribute, 'hp_colors_v2_config');
  for (const id of MENU_CONTROL_IDS) {
    assert.match(menuLayout, new RegExp(`\\bid="${id}"`), `missing menu ID: ${id}`);
  }
  assert.match(menuStyle, /#HPColorsV2EditorRoot/);
  assert.match(menuStyle, /#HPColorsV2PickerRoot/);
  assert.match(menuLayout, /<Label text="HP COLORS V2" class="HPColorsV2Title" \/>/);
  assert.match(
    menuLayout,
    /<Button id="HPColorsV2MenuButton"[^>]*>[\s\S]*HP COLORS V2/,
  );
  assert.match(
    menuLayout,
    /<Button\b(?=[^>]*\bid="HPColorsV2PickerDone")(?=[^>]*\bclass="[^"]*\bHPColorsV2PickerDone\b)[^>]*>/,
  );
  for (const source of [menuSource, colorConsumer]) {
    assert.match(source, /["']ClientUI_FireOutput["']/);
    assert.match(source, /["']HP_COLORS_V2_CONFIG["']/);
    assert.match(source, /["']hp_colors_v2_config["']/);
  }
  assert.match(
    menuSource,
    /CreatePanel\(\s*["']Slider["'][^)]*\{\s*direction\s*:\s*["']horizontal["']\s*,?\s*\}\s*\)/,
  );
  assert.match(menuSource, /HPColorsV2PickerHueSlider/);
  assert.match(menuSource, /HPColorsV2PickerSaturationSlider/);
  assert.match(menuSource, /HPColorsV2PickerLightnessSlider/);
});

test('v2 menu publishes session defaults, edits, reset, and native HSL picker state', () => {
  const fixture = bootMenuVm();
  const { harness, context } = fixture;
  const defaults = {
    enabled: true,
    enemyColor: '#FD4949',
    allyColor: '#FFEFD7',
    pipsVisible: true,
  };
  assert.deepEqual(readPublishedSnapshot(harness), {
    magic_word: 'HP_COLORS_V2_CONFIG',
    version: 1,
    revision: 0,
    values: defaults,
  });
  assert.deepEqual(latestPublishedSnapshot(harness), readPublishedSnapshot(harness));
  assert.deepEqual(harness.shared, {});
  const initialDispatchCount = harness.dispatches.filter(
    (args) => args[0] === 'ClientUI_FireOutput',
  ).length;
  assert.equal(context.$.HPColorsV2MenuReset(), true);
  const defaultsResetSnapshot = latestPublishedSnapshot(harness);
  const resetDispatchCount = harness.dispatches.filter(
    (args) => args[0] === 'ClientUI_FireOutput',
  ).length;
  assert.equal(resetDispatchCount, initialDispatchCount + 1);
  assert.equal(defaultsResetSnapshot.revision, 1);
  assert.deepEqual(defaultsResetSnapshot.values, defaults);
  assert.deepEqual(readPublishedSnapshot(harness), defaultsResetSnapshot);

  const master = harness.root.FindChildTraverse('HPColorsV2MasterToggle');
  assert.equal(typeof master.events.onactivate, 'function');
  master.events.onactivate();
  assert.equal(latestPublishedSnapshot(harness).revision, 2);
  assert.equal(latestPublishedSnapshot(harness).values.enabled, false);

  const enemyHex = harness.root.FindChildTraverse('HPColorsV2EnemyColorHex');
  enemyHex.text = ' #abcdef ';
  assert.equal(context.$.HPColorsV2MenuCommitEnemyColor(), true);
  assert.equal(latestPublishedSnapshot(harness).values.enemyColor, '#ABCDEF');

  assert.equal(context.$.HPColorsV2MenuReset(), true);
  const resetSnapshot = latestPublishedSnapshot(harness);
  assert.deepEqual(resetSnapshot.values, defaults);
  assert.equal(resetSnapshot.revision, 4);
  assert.deepEqual(readPublishedSnapshot(harness), resetSnapshot);

  assert.equal(context.$.HPColorsV2MenuOpenPicker('enemyColor'), true);
  const pickerRoot = harness.root.FindChildTraverse('HPColorsV2PickerRoot');
  assert.equal(pickerRoot.BHasClass('Open'), true);
  const hueSlider = harness.root.FindChildTraverse('HPColorsV2PickerHueSlider');
  const saturationSlider = harness.root.FindChildTraverse(
    'HPColorsV2PickerSaturationSlider',
  );
  const lightnessSlider = harness.root.FindChildTraverse(
    'HPColorsV2PickerLightnessSlider',
  );
  for (const slider of [hueSlider, saturationSlider, lightnessSlider]) {
    assert.equal(slider.paneltype, 'Slider');
    assert.equal(typeof slider.events.onvaluechanged, 'function');
  }
  assert.equal(hueSlider.min, 0);
  assert.equal(hueSlider.max, 359);
  assert.equal(saturationSlider.max, 100);
  assert.equal(lightnessSlider.max, 100);
  assert.equal(context.$.HPColorsV2MenuClosePicker(), true);
  assert.equal(pickerRoot.BHasClass('Open'), false);
  assert.equal(context.$.HPColorsV2MenuOpen(), true);
  assert.equal(
    harness.root.FindChildTraverse('HPColorsV2EditorRoot').BHasClass('Open'),
    true,
  );
  assert.equal(context.$.HPColorsV2MenuDone(), true);
});

test('v2 scripts omit persistence, retired features, GameUI, and geometry writes', () => {
  const menuLayout = read(menuLayoutPath);
  const menuSource = read(menuSourcePath);
  const contractSource = read(contractPath);
  const colorConsumer = read(colorConsumerPath);
  const editorStart = menuLayout.indexOf('<Panel id="HPColorsV2EditorRoot"');
  assert.ok(editorStart >= 0);
  const editorMarkup = menuLayout.slice(editorStart);
  const noStorage = /\b(?:localStorage|sessionStorage|indexedDB|CustomUIConfig|SetCustomUIConfig|GetCustomUIConfig)\b/i;
  for (const source of [menuSource, contractSource, colorConsumer]) {
    assert.doesNotMatch(source, noStorage);
  }
  assert.doesNotMatch(
    menuSource,
    /\b(?:preset|readout|pulse|hero|condition|GameUI|ExternalBrowser|window|document|navigator)\b/i,
  );
  assert.doesNotMatch(
    editorMarkup,
    /\b(?:preset|readout|pulse|hero|condition|GameUI|ExternalBrowser)\b/i,
  );
  assert.doesNotMatch(colorConsumer, /\bGameUI\b/);
  assert.doesNotMatch(colorConsumer, /HPV2-READOUT-DEBUG|Diagnostic/);
  assert.doesNotMatch(
    colorConsumer,
    /style\.(?:width|height|margin|marginTop|marginRight|marginLeft|marginBottom|position|transform|scale|x|y)\s*=/i,
  );
});

test('v2 CSS matches the supplied alignment screenshots', () => {
  const style = read(stylePath);
  assert.doesNotMatch(
    style,
    /\.health_critical\b|#CriticalIndicator\b|critical_text_png\.vtex|healthCritFlash|TagGroove1/,
    'production CSS must not contain critical-health conditionals, text, or animations',
  );
  assert.doesNotMatch(
    style,
    /\.friend\s+#(?:UnitStatus|UnitHealthbarsContainer)\b/,
    'allies must use the same UnitStatus and healthbar geometry as enemies',
  );
  const unitStatus = cssBlock(style, '#UnitStatus');
  assert.match(unitStatus, /horizontal-align\s*:\s*middle\s*;/);
  assert.match(unitStatus, /margin-top\s*:\s*-700px\s*;/);
  assert.match(unitStatus, /margin-right\s*:\s*-53\.625px\s*;/);
  const counterContainer = cssBlock(style, '#hp_counter_container');
  assert.match(counterContainer, /ignore-parent-flow\s*:\s*true\s*;/);
  assert.match(counterContainer, /width\s*:\s*100%\s*;/);
  assert.match(counterContainer, /height\s*:\s*100%\s*;/);
  const sharedHealthbarPosition = cssBlock(
    style,
    '#UnitHealthbarsContainer,#hp_counter_container',
  );
  assert.match(sharedHealthbarPosition, /margin-top\s*:\s*230px\s*;/);
  assert.match(sharedHealthbarPosition, /horizontal-align\s*:\s*left\s*;/);
  assert.match(sharedHealthbarPosition, /vertical-align\s*:\s*middle\s*;/);
  assert.match(sharedHealthbarPosition, /pre-transform-scale2d\s*:\s*1\.1\s*;/);
  const counterAnchor = cssBlock(style, '#hp_counter_anchor');
  assert.match(counterAnchor, /ignore-parent-flow\s*:\s*true\s*;/);
  assert.match(counterAnchor, /horizontal-align\s*:\s*left\s*;/);
  assert.match(counterAnchor, /vertical-align\s*:\s*middle\s*;/);
  assert.match(counterAnchor, /width\s*:\s*750px\s*;/);
  assert.match(counterAnchor, /height\s*:\s*120px\s*;/);
  assert.match(counterAnchor, /margin-left\s*:\s*200px\s*;/);
  assert.match(counterAnchor, /margin-bottom\s*:\s*200px\s*;/);
  const counterRow = cssBlock(style, '#hp_counter_row');
  assert.match(counterRow, /flow-children\s*:\s*right\s*;/);
  assert.match(counterRow, /height\s*:\s*fit-children\s*;/);
  assert.match(counterRow, /transform\s*:\s*translateX\(-136\.375px\)\s+translateY\(-180px\)\s*;/);
  const statusEffects = cssBlock(style, '#StatusEffects');
  assert.doesNotMatch(
    statusEffects,
    /\bheight\s*:/,
    'the status-effect widget must keep its stock 250px canvas',
  );
  assert.match(
    statusEffects,
    /margin-top\s*:\s*-20px\s*;/,
    'the status row must use the requested margin-only upward offset',
  );
  assert.doesNotMatch(
    statusEffects,
    /\btransform\s*:/,
    'the status row offset must remain margin-only',
  );
  assert.match(
    cssBlock(style, '.WindowRoot'),
    /overflow\s*:\s*noclip\s*;/,
    'the root layout must not add another clipping boundary',
  );
  assert.match(
    statusEffects,
    /overflow\s*:\s*noclip\s*;/,
    'the status-effect canvas must not clip circular effects or stack labels',
  );
  assert.match(
    cssBlock(style, '.statusEffect'),
    /overflow\s*:\s*noclip\s*;/,
    'each status-effect canvas must preserve the full circular frame',
  );

  const staminaContainer = cssBlock(style, '#StaminaContainer');
  assert.match(staminaContainer, /margin-top\s*:\s*800px\s*;/);
  const staminaPip = cssBlock(style, '.StaminaPip');
  assert.match(staminaPip, /margin\s*:\s*0px\s+6px\s*;/);
  const staminaIcon = cssBlock(style, '.StaminaPip .StaminaPipIcon');
  assert.match(staminaIcon, /width\s*:\s*110px\s*;/);
  assert.match(staminaIcon, /height\s*:\s*44\.8px\s*;/);
  assert.match(staminaIcon, /border-radius\s*:\s*0px\s*;/);
  assert.match(staminaIcon, /border\s*:\s*4px\s+solid\s+white\s*;/);

  const healthbars = sharedHealthbarPosition;
  assert.match(healthbars, /margin-top\s*:\s*230px\s*;/);
  assert.match(healthbars, /horizontal-align\s*:\s*left\s*;/);
  assert.match(healthbars, /vertical-align\s*:\s*middle\s*;/);
  assert.match(healthbars, /z-index\s*:\s*0\s*;/);
  assert.match(healthbars, /pre-transform-rotate2d\s*:\s*0deg\s*;/);
  assert.match(healthbars, /pre-transform-scale2d\s*:\s*1\.1\s*;/);

  const healthbar = cssBlock(style, '#UnitHealthbarContainer');
  assert.match(healthbar, /height\s*:\s*120px\s*;/);
  assert.match(healthbar, /width\s*:\s*750px\s*;/);
  assert.match(healthbar, /max-width\s*:\s*750px\s*;/);


  for (const selector of [
    '#UnitHealthbarContainer',
    '.verticalHealthbars #UnitHealthbarContainer',
    '.verticalHealthbars #InfoHealthContainer',
  ]) {
    assert.match(cssBlock(style, selector), /opacity-mask\s*:\s*none\s*;/);
  }
  const healthbarBackground = cssBlock(style, '#unit_healthbar_bg');
  assert.match(
    healthbarBackground,
    /border-image-source\s*:\s*url\("s2r:\/\/panorama\/images\/hud\/world_space\/hero_healthbar_bg_psd\.vtex"\)\s*;/,
  );
  assert.match(healthbarBackground, /border-image-repeat\s*:\s*round\s*;/);
  assert.match(healthbarBackground, /border-image-slice\s*:\s*28%\s+fill\s*;/);
  assert.match(healthbarBackground, /border-width\s*:\s*20px\s*;/);
  assert.match(healthbarBackground, /border-color\s*:\s*#ffffffff\s*;/);

  const missingHealth = cssBlock(style, '#unit_healthbar_missing');
  assert.match(
    missingHealth,
    /background-image\s*:\s*url\("s2r:\/\/panorama\/images\/hud\/world_space\/hero_healthbar_missing_psd\.vtex"\)\s*;/,
  );
  assert.match(missingHealth, /background-size\s*:\s*cover\s*;/);

  const laggingHealth = cssBlock(style, '#unit_healthbar_lagging');
  assert.match(
    laggingHealth,
    /background-image\s*:\s*url\("s2r:\/\/panorama\/images\/hud\/world_space\/hero_healthbar_fill_center_psd\.vtex"\)\s*;/,
  );
  assert.match(
    laggingHealth,
    /box-shadow\s*:\s*inset\s+DropshadowColor\s+4px\s+8px\s+5px\s+8px\s*;/,
  );
  assert.doesNotMatch(laggingHealth, /box-shadow\s*:\s*none|border-image-source\s*:\s*none/);
  assert.doesNotMatch(
    style,
    /\.verticalHealthbars\s+#unit_healthbar_bg\s*\{/,
    'vertical bars must not suppress the shared v1 frame texture',
  );
  assert.match(
    cssBlock(style, '.verticalHealthbars #unit_healthbar_pip_label'),
    /visibility\s*:\s*visible\s*;/,
    'vertical healthbars must draw the engine-provided pip label',
  );
});

test('v2 color consumer applies enemy and ally fills, ultimate wash, and pips', () => {
  const enemy = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  assert.equal(enemy.fill.style.washColor, '#123456');
  assert.equal(enemy.ult.style.washColor, '#123456');
  assert.equal(enemy.pip.style.visibility, 'visible');
  assert.equal(
    enemy.ult.styleWrites.some((write) => write.property === 'visibility'),
    false,
  );

  const ally = makeStatusFixture('ally', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: false,
  });
  assert.equal(ally.fill.style.washColor, '#ABCDEF');
  assert.equal(ally.ult.style.washColor, '#ABCDEF');
  assert.equal(ally.pip.style.visibility, 'collapse');
  assert.equal(
    ally.ult.styleWrites.some((write) => write.property === 'visibility'),
    false,
  );
});

test('v2 runtime derives current and max HP from live bar geometry', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  assert.equal(fixture.counter.text, '300 / ');
  assert.equal(fixture.counterMax.text, '600');
  assert.equal(fixture.counter.style.visibility, 'visible');
  assert.equal(fixture.counterMax.style.visibility, 'visible');

  fixture.fill.actuallayoutwidth = 25;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '150 / ');
  assert.equal(fixture.counterMax.text, '600');

  const lowHpFixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  }, 1, "|'''");
  lowHpFixture.fill.actuallayoutwidth = 100;
  lowHpFixture.harness.scheduler.runNext();
  assert.equal(lowHpFixture.counter.text, '800 / ');
  assert.equal(lowHpFixture.counterMax.text, '800');
  lowHpFixture.fill.actuallayoutwidth = 50;
  lowHpFixture.harness.scheduler.runNext();
  assert.equal(lowHpFixture.counter.text, '400 / ');
  assert.equal(lowHpFixture.counterMax.text, '800');
  lowHpFixture.fill.actuallayoutwidth = 100;
  lowHpFixture.harness.scheduler.runNext();
  assert.equal(lowHpFixture.counter.text, '800 / ');
  assert.equal(lowHpFixture.counterMax.text, '800');

  const highHpFixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  }, 1, '||||||||');
  assert.equal(highHpFixture.counter.text, '2000 / ');
  assert.equal(highHpFixture.counterMax.text, '4000');
});

test('v2 ignores an empty stock bar and binds one coherent live bar', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  }, 1, "|'''", true);

  assert.equal(fixture.counter.style.visibility, 'visible');
  assert.equal(fixture.counter.text, '400 / ');
  assert.equal(fixture.counterMax.text, '800');
  assert.equal(fixture.fill.style.washColor, '#123456');
  assert.equal(fixture.stockFill.style.washColor, '');
  assert.equal(fixture.stockPip.style.visibility, '');
});

test('v2 scopes duplicate healthbar IDs to its own UnitStatus instance', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  }, 1, "|'", false, true);

  assert.equal(fixture.counter.text, '300 / ');
  assert.equal(fixture.counterMax.text, '600');
  assert.equal(fixture.fill.style.washColor, '#123456');
  assert.equal(fixture.siblingCounter.text, '');
  assert.equal(fixture.siblingFill.style.washColor, '');
});

test('v2 counter survives engine replacement of healthbars container children', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  const originalFill = fixture.fill;
  const originalHealthbar = originalFill
    .GetParent()
    .GetParent()
    .GetParent()
    .GetParent();

  fixture.healthbars.RemoveAndDeleteChildren();
  const replacement = addLiveHealthbar(
    fixture.healthbars,
    fixture.harness,
    "|'''",
    100,
  );
  fixture.harness.scheduler.runNext();

  const survivingCounter = fixture.root.FindChildTraverse('hp_counter');
  assert.equal(originalFill.IsValid(), true);
  assert.equal(originalHealthbar.IsValid(), false);
  assert.ok(survivingCounter && survivingCounter.IsValid());
  assert.equal(survivingCounter.style.visibility, 'visible');
  assert.equal(survivingCounter.text, '800 / ');
  assert.equal(fixture.counterMax.text, '800');
  assert.equal(replacement.fill.style.washColor, '#123456');
});

test('v2 color consumer clears disabled, neutral, and unknown ownership without rewrites', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  const initialWrites = [
    fixture.fill.styleWrites.length,
    fixture.ult.styleWrites.length,
    fixture.pip.styleWrites.length,
  ];
  const initialLogs = fixture.harness.logs.filter((line) =>
    line.startsWith('[HPV2-COLOR]'),
  ).length;
  dispatchColorSnapshot(fixture, 2, {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  assert.deepEqual(
    [
      fixture.fill.styleWrites.length,
      fixture.ult.styleWrites.length,
      fixture.pip.styleWrites.length,
    ],
    initialWrites,
  );
  assert.equal(
    fixture.harness.logs.filter((line) => line.startsWith('[HPV2-COLOR]'))
      .length,
    initialLogs,
  );

  fixture.unitStatus.AddClass('team_neutral');
  dispatchColorSnapshot(fixture, 3, {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  assert.equal(fixture.fill.style.washColor, '');
  assert.equal(fixture.ult.style.washColor, '');
  assert.equal(fixture.pip.style.visibility, '');

  fixture.unitStatus.RemoveClass('team_neutral');
  fixture.unitStatus.RemoveClass('enemy');
  dispatchColorSnapshot(fixture, 4, {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  assert.equal(fixture.fill.style.washColor, '');
  assert.equal(fixture.ult.style.washColor, '');
  assert.equal(fixture.pip.style.visibility, '');

  fixture.unitStatus.AddClass('enemy');
  dispatchColorSnapshot(fixture, 5, {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  const activeWrites = [
    fixture.fill.styleWrites.length,
    fixture.ult.styleWrites.length,
    fixture.pip.styleWrites.length,
  ];
  dispatchColorSnapshot(fixture, 6, {
    enabled: false,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  assert.equal(fixture.fill.style.washColor, '');
  assert.equal(fixture.ult.style.washColor, '');
  assert.equal(fixture.pip.style.visibility, '');
  assert.ok(
    fixture.fill.styleWrites.length > activeWrites[0],
    'disabled state must clear owned fill',
  );
  assert.ok(
    fixture.ult.styleWrites.length > activeWrites[1],
    'disabled state must clear owned ultimate wash',
  );
  assert.ok(
    fixture.pip.styleWrites.length > activeWrites[2],
    'disabled state must clear owned pip visibility',
  );
});

test('v2 color consumer bounds replacement scans and tears down after context destruction', () => {
  const colorConsumer = read(colorConsumerPath);
  assert.match(colorConsumer, /MAX_CHECKS\s*=\s*20/);
  assert.match(colorConsumer, /MAX_ROOT_DEPTH\s*=\s*32/);
  assert.match(colorConsumer, /MAX_CLASS_DEPTH\s*=\s*16/);

  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
    pipsVisible: true,
  });
  const oldFill = fixture.fill;
  oldFill.DeleteAsync();
  const replacement = fixture.activeParent.add(new MockPanel(
    'unit_healthbar_lagging',
    {
      style: { washColor: '' },
      findCounts: fixture.harness.findCounts,
      operationCounts: fixture.harness.operationCounts,
    },
  ));
  assert.equal(fixture.harness.scheduler.jobs.length, 1);
  fixture.harness.scheduler.runNext();
  assert.equal(replacement.style.washColor, '#123456');
  assert.equal(fixture.harness.scheduler.jobs.length, 1);

  const eventHandler = fixture.harness.handlerEntries.find(
    (entry) => entry.channel === 'ClientUI_FireOutput',
  );
  assert.ok(eventHandler);
  fixture.unitStatus.valid = false;
  const writesBeforeTeardown = replacement.styleWrites.length;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.harness.scheduler.jobs.length, 0);
  assert.equal(fixture.harness.handlers.ClientUI_FireOutput, undefined);
  assert.ok(
    fixture.harness.unregisterCalls.some(
      (call) =>
        call.eventName === 'ClientUI_FireOutput' &&
        call.id === eventHandler.id,
    ),
  );
  assert.equal(replacement.styleWrites.length, writesBeforeTeardown);
});

test('segment aligner scales segment one and two on pip-count changes only', () => {
  const aligner = read(alignerPath);
  assert.doesNotMatch(aligner, /actuallayoutwidth|GameUI|Entities|Players/);

  const schedules = [];
  const messages = [];
  const writes = [];
  const counterWrites = [];
  let contextCalls = 0;
  let traversals = 0;
  let classChecks = 0;

  const pip = {
    id: 'unit_healthbar_pip_label',
    text: "''''|'''",
    valid: true,
    IsValid() {
      return this.valid;
    },
  };
  const healthbars = {
    id: 'UnitHealthbarsContainer',
    valid: true,
    classes: new Set(['maxhp_segment_1', 'bars_1']),
    IsValid() {
      return this.valid;
    },
    BHasClass(className) {
      classChecks += 1;
      return this.classes.has(className);
    },
    FindChildTraverse(id) {
      traversals += 1;
      return id === pip.id ? pip : null;
    },
  };
  const styleValues = {};
  const unitStatus = {
    id: 'UnitStatus',
    valid: true,
    IsValid() {
      return this.valid;
    },
    style: new Proxy(styleValues, {
      set(target, property, value) {
        target[property] = value;
        writes.push({ property, value });
        return true;
      },
    }),
  };
  const counterStyleValues = {};
  const counterRowPanel = {
    id: 'hp_counter_row',
    valid: true,
    IsValid() {
      return this.valid;
    },
    style: new Proxy(counterStyleValues, {
      set(target, property, value) {
        target[property] = value;
        counterWrites.push({ property, value });
        return true;
      },
    }),
  };
  const contextPanel = {
    valid: true,
    IsValid() {
      return this.valid;
    },
    FindChildTraverse(id) {
      traversals += 1;
      if (id === unitStatus.id) return unitStatus;
      if (id === counterRowPanel.id) return counterRowPanel;
      if (id === healthbars.id) return healthbars;
      return null;
    },
  };

  const vmContext = vm.createContext({
    $: {
      GetContextPanel() {
        contextCalls += 1;
        return contextPanel;
      },
      Schedule(delay, callback) {
        schedules.push({ delay, callback });
      },
      Msg(message) {
        messages.push(message);
      },
    },
  });
  vm.runInContext(aligner, vmContext, { filename: alignerPath });

  assert.deepEqual(writes, [{ property: 'marginRight', value: '-41.89px' }]);
  assert.deepEqual(counterWrites, [{
    property: 'transform',
    value: 'translateX(-136.375px) translateY(-180px)',
  }]);
  assert.equal(messages.length, 1);
  assert.match(
    messages[0],
    /segment=1 class=maxhp_segment_1 bars=bars_1 pipCount=7 pip="''''\|'''" margin-right=-41.89px counter-transform=translateX\(-136.375px\) translateY\(-180px\)/,
  );
  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].delay, 0.25);
  const startupTraversals = traversals;
  const startupWrites = writes.length;
  const startupMessages = messages.length;
  const startupContextCalls = contextCalls;

  for (let i = 0; i < 8; i += 1) {
    const next = schedules.shift();
    next.callback();
  }
  assert.equal(traversals, startupTraversals);
  assert.equal(writes.length, startupWrites);
  assert.equal(messages.length, startupMessages);
  assert.equal(counterWrites.length, 1);
  assert.equal(contextCalls, startupContextCalls + 8);
  assert.equal(schedules.length, 1);
  pip.text = "''''";
  schedules.shift().callback();
  assert.deepEqual(writes[writes.length - 1], {
    property: 'marginRight',
    value: '-46.92px',
  });
  assert.equal(counterWrites.length, 1);
  assert.match(
    messages[messages.length - 1],
    /segment=1 class=maxhp_segment_1 bars=bars_1 pipCount=4 pip="''''" margin-right=-46.92px counter-transform=translateX\(-136.375px\) translateY\(-180px\)/,
  );

  healthbars.classes.delete('maxhp_segment_1');
  healthbars.classes.add('maxhp_segment_2');
  pip.text = "''''|''''|";
  schedules.shift().callback();
  assert.deepEqual(writes[writes.length - 1], {
    property: 'marginRight',
    value: '-40.21875px',
  });
  assert.deepEqual(counterWrites[counterWrites.length - 1], {
    property: 'transform',
    value: 'translateX(-62.28125px) translateY(-180px)',
  });
  assert.match(
    messages[messages.length - 1],
    /segment=2 class=maxhp_segment_2 bars=bars_1 pipCount=8 pip="''''\|''''\|" margin-right=-40.21875px counter-transform=translateX\(-62.28125px\) translateY\(-180px\)/,
  );
  pip.text = "''''|''''|''''";
  schedules.shift().callback();
  assert.deepEqual(writes[writes.length - 1], {
    property: 'marginRight',
    value: '102.23px',
  });
  assert.equal(counterWrites.length, 2);
  assert.match(
    messages[messages.length - 1],
    /segment=2 class=maxhp_segment_2 bars=bars_1 pipCount=12 pip="''''\|''''\|''''" margin-right=102.23px counter-transform=translateX\(-62.28125px\) translateY\(-180px\)/,
  );
  pip.text = "''''|''''|''''|''''|";
  schedules.shift().callback();
  assert.deepEqual(writes[writes.length - 1], {
    property: 'marginRight',
    value: '244.6875px',
  });
  assert.equal(counterWrites.length, 2);
  assert.match(
    messages[messages.length - 1],
    /segment=2 class=maxhp_segment_2 bars=bars_1 pipCount=16 pip="''''\|''''\|''''\|''''\|" margin-right=244.6875px counter-transform=translateX\(-62.28125px\) translateY\(-180px\)/,
  );
  const writesBeforeSegmentThree = writes.length;
  const counterWritesBeforeSegmentThree = counterWrites.length;


  healthbars.classes.delete('maxhp_segment_2');
  healthbars.classes.add('maxhp_segment_3');
  pip.text = "''''|''''|''''|''''|";
  schedules.shift().callback();
  assert.deepEqual(writes[writes.length - 1], {
    property: 'marginRight',
    value: '244.6875px',
  });
  assert.deepEqual(counterWrites[counterWrites.length - 1], {
    property: 'transform',
    value: 'translateX(-99.6875px) translateY(-180px)',
  });
  assert.match(
    messages[messages.length - 1],
    /segment=3 class=maxhp_segment_3 bars=bars_1 pipCount=16 pip="''''\|''''\|''''\|''''\|" margin-right=244.6875px counter-transform=translateX\(-99.6875px\) translateY\(-180px\)/,
  );
  assert.equal(writes.length, writesBeforeSegmentThree);
  assert.equal(counterWrites.length, counterWritesBeforeSegmentThree + 1);
  assert.equal(messages.length, 6);

  const stableTraversals = traversals;
  const stableClassChecks = classChecks;
  schedules.shift().callback();
  assert.equal(traversals, stableTraversals);
  assert.equal(classChecks, stableClassChecks + 3);
  assert.equal(writes.length, 5);
  assert.equal(counterWrites.length, 3);
  assert.equal(messages.length, 6);

  contextPanel.valid = false;
  schedules.shift().callback();
  assert.equal(schedules.length, 0);
  assert.equal(writes.length, 5);
  assert.equal(counterWrites.length, 3);
  assert.equal(messages.length, 6);
});

test('v2 build packs exactly the eight production assets', () => {
  const build = read(buildPath);
  assert.match(build, /\[switch\]\$SkipDeploy/);
  assert.doesNotMatch(
    build,
    /DebugProbe|unit_status_v2_probe|width_normalizer|engine_overrides/,
  );
  const expectedBlock = build.match(
    /\$expectedPackedAssets\s*=\s*@\(([\s\S]*?)\)/,
  );
  assert.ok(expectedBlock, 'build must declare an expected packed asset list');
  const listedAssets = Array.from(
    expectedBlock[1].matchAll(/'([^']+)'/g),
    (match) => match[1],
  );
  assert.deepEqual(listedAssets, PACKED_ASSETS);
  for (const asset of PACKED_ASSETS) {
    assert.ok(build.includes(`'${asset}'`), `missing packed asset: ${asset}`);
  }
  assert.match(build, /Compare-Object/);
  assert.match(build, /Assert-PackedVpkAssets/);
});
