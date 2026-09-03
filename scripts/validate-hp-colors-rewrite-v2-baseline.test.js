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
const rewriteRoot = process.env.HP_COLORS_REWRITE_SOURCE_ROOT
  ? path.resolve(process.env.HP_COLORS_REWRITE_SOURCE_ROOT)
  : path.join(root, 'hp_colors_rewrite_v2');
const panoramaRoot = path.join(rewriteRoot, 'panorama');
const menuLayoutPath = path.join(
  panoramaRoot,
  'layout/hud_escape_menu.xml',
);
const layoutPath = path.join(
  panoramaRoot,
  'layout/unit_status_overlay_v2.xml',
);
const stylePath = path.join(panoramaRoot, 'styles/unit_status_v2.css');
const stateSourcePath = path.join(
  panoramaRoot,
  'scripts/hp_colors_v2_state.js',
);
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
const SOURCE_ASSETS = [
  'layout/hud_escape_menu.xml',
  'layout/unit_status_overlay_v2.xml',
  'scripts/hp_colors_v2_contract.js',
  'scripts/hp_colors_v2_menu.js',
  'scripts/hp_colors_v2_state.js',
  'scripts/unit_status_v2_colors.js',
  'styles/hp_colors_v2_menu.css',
  'styles/unit_status_v2.css',
];
const MENU_CONTROL_IDS = [
  'HPColorsRewritePresetStore',
  'HPColorsRewritePreset_001',
  'LeftStripeBlur',
  'HPColorsMenuButton',
  'HPColorsEditorRoot',
  'HPColorsEditorShell',
  'HPColorsPeekCapture',
  'HPColorsPeekButton',
  'HPColorsDoneButton',
  'HPColorsUndoButton',
  'HPColorsResetSectionButton',
  'HPColorsResetDialog',
  'HPColorsResetDialogTitle',
  'HPColorsResetDialogMessage',
  'HPColorsResetConfirmButton',
  'HPColorsResetCancelButton',
  'HPColorsConditionDialog',
  'HPColorsConditionTitle',
  'HPColorsConditionStatus',
  ...Array.from({ length: 4 }, (_, index) => `HPColorsConditionSlot${index + 1}`),
  ...Array.from(
    { length: 4 },
    (_, index) => `HPColorsConditionSlot${index + 1}Image`,
  ),
  'HPColorsConditionBooleanRow',
  'HPColorsConditionBooleanFalse',
  'HPColorsConditionBooleanTrue',
  'HPColorsConditionEnumRow',
  'HPColorsConditionEnumOptions',
  'HPColorsConditionNumberRow',
  'HPColorsConditionNumberSliderHost',
  'HPColorsConditionNumberEntry',
  'HPColorsConditionColorRow',
  'HPColorsConditionColorSwatch',
  'HPColorsConditionColorEntry',
  'HPColorsConditionRemoveButton',
  'HPColorsConditionCancelButton',
  'HPColorsConditionApplyButton',
  'HPColorsTransferButton',
  'HPColorsTransferDialog',
  'HPColorsTransferInput',
  'HPColorsTransferFeedback',
  'HPColorsTransferExportButton',
  'HPColorsTransferImportButton',
  'HPColorsTransferCloseButton',
  'HPColorsHeroModeAuto',
  'HPColorsHeroModeManual',
  'HPColorsHeroModeOff',
  'HPColorsHeroPhase',
  'HPColorsHeroIdentity',
  'HPColorsHeroDetail',
  'HPColorsHeroManualRow',
  'HPColorsHeroManualButton',
  'HPColorsHeroManualValue',
  'HPColorsHeroDialog',
  'HPColorsHeroOptions',
  'HPColorsHeroCloseButton',
  'HPColorsCurrentScopeAll',
  'HPColorsCurrentScopeSelected',
  'HPColorsCurrentScopeSummary',
  'HPColorsScopeDialog',
  'HPColorsScopeSearch',
  'HPColorsScopeOptions',
  'HPColorsScopeCloseButton',
  'HPColorsPresetNameInput',
  'HPColorsPresetSaveButton',
  'HPColorsPresetSaveButtonLabel',
  'HPColorsPresetSaveMode',
  'HPColorsPresetNewButton',
  'HPColorsPresetForm',
  'HPColorsPresetCancelEditButton',
  'HPColorsPresetOptions',
  'HPColorsPresetFeedback',
  'HPColorsPresetRestoreBakedButton',
  'HPColorsPresetCopyAllButton',
  'HPColorsPresetImportButton',
  'HPColorsPresetTransferDialog',
  'HPColorsPresetTransferInput',
  'HPColorsPresetTransferFeedback',
  'HPColorsPresetTransferConfirmButton',
  'HPColorsPresetTransferCloseButton',
  'HPColorsPresetGuide',
  'HPColorsPresetInfoToggle',
  'HPColorsSupporterTicker',
  'HPColorsHeaderCategory',
  'HPColorsLiveStatus',
  'HPColorsPageEyebrow',
  'HPColorsPageTitle',
  'HPColorsPageDescription',
  'HPColorsPickerRoot',
  'HPColorsPickerPanel',
  'HPColorsPickerBackdrop',
  'HPColorsPickerDone',
  'HPColorsPickerTitle',
  'HPColorsPickerPreview',
  'HPColorsPickerHex',
  'HPColorsPickerHueValue',
  'HPColorsPickerSaturationValue',
  'HPColorsPickerLightnessValue',
  'HPColorsPickerHueSliderHost',
  'HPColorsPickerSaturationSliderHost',
  'HPColorsPickerLumenSliderHost',
  'HPColorsPrecisePipsToggle',
  'HPColorsPrecisePipsDialog',
  'HPColorsAccessoryAnchorToggle',
  'HPColorsPrecisePipsDialogTitle',
  'HPColorsPrecisePipsDialogMessage',
  'HPColorsPrecisePipsDialogCommands',
  'HPColorsPrecisePipsCopyLabel',
  'HPColorsPrecisePipsCopyButton',
  'HPColorsPrecisePipsCloseButton',
  'HPColorsGhoulOpacityRow',
  'HPColorsGhoulOpacityEntry',
  'HPColorsEnemyKillMarkerToggle',
  'HPColorsEnemyKillMarkerThresholdRow',
  'HPColorsEnemyKillMarkerThresholdEntry',
  'HPColorsEnemyKillMarkerWidthRow',
  'HPColorsEnemyKillMarkerWidthEntry',
  'HPColorsEnemyKillMarkerColorRow',
  'HPColorsEnemyKillMarkerColorSwatch',
  'HPColorsEnemyKillMarkerColorHex',
  'HPColorsWidthSliderHost',
  'HPColorsHeightSliderHost',
  'HPColorsGhoulOpacitySliderHost',
  'HPColorsPositionXSliderHost',
  'HPColorsPositionYSliderHost',
  'HPColorsUltOffsetXSliderHost',
  'HPColorsUltOffsetYSliderHost',
  'HPColorsLevelOffsetXSliderHost',
  'HPColorsLevelOffsetYSliderHost',
  'HPColorsReadoutSizeSliderHost',
  'HPColorsReadoutOffsetXSliderHost',
  'HPColorsReadoutOffsetYSliderHost',
  'HPColorsSharedLowThresholdSliderHost',
  'HPColorsSharedHighThresholdSliderHost',
  'HPColorsEnemyPulseThresholdSliderHost',
  'HPColorsEnemyPulseBpmSliderHost',
  'HPColorsEnemyPulseReadoutSizeSliderHost',
  'HPColorsEnemyPulseReadoutOffsetXSliderHost',
  'HPColorsEnemyPulseReadoutOffsetYSliderHost',
  'HPColorsAllyPulseThresholdSliderHost',
  'HPColorsAllyPulseBpmSliderHost',
  'HPColorsAllyPulseColorModeFixed',
  'HPColorsAllyPulseColorModeGradient',
  'HPColorsEnemyKillMarkerThresholdSliderHost',
  'HPColorsEnemyKillMarkerWidthSliderHost',
  'HPColorsStaminaWidthSliderHost',
  'HPColorsStaminaHeightSliderHost',
  'HPColorsStaminaOffsetXSliderHost',
  'HPColorsStaminaOffsetYSliderHost',
  'HPColorsEnemyStaminaColorToggle',
  'HPColorsEnemyStaminaColorSwatch',
  'HPColorsEnemyStaminaColorHex',
  'HPColorsCategoryOverview',
  'HPColorsCategoryEnemy',
  'HPColorsCategoryAlly',
  'HPColorsCategoryReadout',
  ...Array.from({ length: 5 }, (_, index) => `HPColorsTab${index}`),
  ...Array.from({ length: 5 }, (_, index) => `HPColorsTabLabel${index}`),
  'HPColorsSettingsList',
  'HPColorsSettingsOverviewStatus',
  'HPColorsSettingsOverviewLayout',
  'HPColorsSettingsOverviewHero',
  'HPColorsSettingsEnemyBar',
  'HPColorsSettingsEnemyFeedback',
  'HPColorsSettingsEnemyShields',
  'HPColorsSettingsAllyBar',
  'HPColorsSettingsAllyFeedback',
  'HPColorsSettingsAllyShields',
  'HPColorsSettingsReadoutNumber',
  'HPColorsSettingsReadoutPlacement',
  'HPColorsSettingsReadoutLevels',
  'HPColorsSettingsStamina',
  'HPColorsSettingsEnemyPulse',
  'HPColorsSettingsEnemyKillMarker',
  'HPColorsSettingsAllyPulse',
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
  const context = createVmContext(harness);
  runInVm(read(contractPath), context, contractPath);
  runInVm(read(stateSourcePath), context, stateSourcePath);
  runInVm(read(menuSourcePath), context, menuSourcePath);
  assert.equal(typeof context.$.HPColorsMenuBoot, 'function');
  assert.doesNotThrow(() => context.$.HPColorsMenuBoot());
  assert.equal(
    typeof harness.root.FindChildTraverse('HPColorsMenuButton').events.onactivate,
    'function',
    'menu boot must bind its entry point',
  );
  return { harness, context };
}

function makeSnapshot(revision, values) {
  return JSON.stringify({
    magic_word: 'HP_COLORS_V2_CONFIG',
    version: 2,
    revision,
    values,
  });
}

function addLiveHealthbar(healthbars, harness, pipText, fillWidth, stockStyles) {
  const stockLayoutWidth = Number.parseFloat(stockStyles && stockStyles.width);
  const healthbar = healthbars.add(new MockPanel('UnitHealthbarContainer', {
    actuallayoutwidth: Number.isFinite(stockLayoutWidth) ? stockLayoutWidth : 750,
    actuallayoutheight: 120,
    actualyoffset: 0,
    style: {
      width: stockStyles ? stockStyles.width : '',
      maxWidth: stockStyles ? stockStyles.maxWidth : '',
      height: stockStyles ? stockStyles.height : '',
      transform: stockStyles ? stockStyles.transform : '',
      preTransformScale2d: stockStyles
        ? stockStyles.preTransformScale2d || ''
        : '',
      transformOrigin: stockStyles ? stockStyles.transformOrigin || '' : '',
      opacity: stockStyles ? stockStyles.opacity : '',
    },
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
  const pulseOverlay = activeParent.add(new MockPanel('hp_colors_pulse_overlay', {
    style: { visibility: 'collapse' },
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
  return {
    healthbar,
    activeParent,
    fill,
    pulseOverlay,
    pip,
  };
}

function addCounterCanvas(infoHealth, harness) {
  const container = infoHealth.add(new MockPanel('hp_counter_container', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const anchor = container.add(new MockPanel('hp_counter_anchor', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const row = anchor.add(new MockPanel('hp_counter_row', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const counter = row.add(new MockPanel('hp_counter', {
    style: { visibility: 'collapse', height: 'fit-children' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const counterMax = row.add(new MockPanel('hp_counter_max', {
    style: { visibility: 'collapse', height: 'fit-children' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  return { container, anchor, row, counter, counterMax };
}

function setMissingValue(values, key, value) {
  if (!Object.hasOwn(values, key)) values[key] = value;
}

function makeStatusFixture(
  role,
  values,
  revision = 1,
  pipText = "|'",
  includeStockDecoy = false,
  includeSiblingDecoy = false,
  delayLiveBar = false,
  isPlayer = false,
  staminaStockStyles = null,
  barStockStyles = null,
) {
  values = { ...values };
  if (values.enemyColor) {
    setMissingValue(values, 'enemyMode', 'fixed');
    setMissingValue(values, 'enemyLow', values.enemyColor);
    setMissingValue(values, 'enemyMid', values.enemyColor);
    setMissingValue(values, 'enemyHigh', values.enemyColor);
    setMissingValue(values, 'enemyEnabled', true);
  }
  if (values.allyColor) {
    setMissingValue(values, 'allyMode', 'fixed');
    setMissingValue(values, 'allyLow', values.allyColor);
    setMissingValue(values, 'allyMid', values.allyColor);
    setMissingValue(values, 'allyHigh', values.allyColor);
    setMissingValue(values, 'allyEnabled', true);
  }
  const harness = createPanoramaHarness({ includeGameUI: false });
  const classes =
    role === 'enemy'
      ? ['enemy']
      : role === 'ally'
        ? ['friend']
        : role === 'ambiguous'
          ? ['enemy', 'friend', 'team1']
          : role === 'neutral'
            ? ['team_neutral']
            : [];
  if (isPlayer) classes.push('player');
  const root = harness.root;
  let siblingCounter = null;
  let siblingFill = null;
  if (includeSiblingDecoy) {
    const siblingWindow = root.add(new MockPanel('client_ui_panel_sibling', {
      classes: ['WindowRoot', 'enemy'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingStatus = siblingWindow.add(new MockPanel('UnitStatusSibling', {
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
    const siblingCanvas = addCounterCanvas(siblingWindow, harness);
    const siblingLiveBar = addLiveHealthbar(
      siblingHealthbars,
      harness,
      '||||||||',
      10,
    );
    siblingFill = siblingLiveBar.fill;
    siblingCounter = siblingCanvas.counter;
  }
  const windowRoot = root.add(new MockPanel('client_ui_panel', {
    classes: ['WindowRoot', ...classes],
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const staminaContainer = windowRoot.add(new MockPanel('StaminaContainer', {
    style: {
      transform: staminaStockStyles ? staminaStockStyles.containerTransform : '',
      washColor: staminaStockStyles ? staminaStockStyles.containerWashColor : '',
    },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const staminaIcons = [];
  for (let staminaIndex = 0; staminaIndex < 3; staminaIndex += 1) {
    const staminaPip = staminaContainer.add(new MockPanel(`StaminaPip${staminaIndex}`, {
      classes: staminaIndex === 2 ? ['StaminaPip', 'PipEmpty'] : ['StaminaPip'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    staminaIcons.push(staminaPip.add(new MockPanel(`StaminaPipIcon${staminaIndex}`, {
      classes: ['StaminaPipIcon'],
      style: {
        width: staminaStockStyles ? staminaStockStyles.iconWidth : '',
        height: staminaStockStyles ? staminaStockStyles.iconHeight : '',
        washColor: '',
        backgroundColor: staminaStockStyles ? staminaStockStyles.iconBackgroundColor : '',
        borderColor: staminaStockStyles ? staminaStockStyles.iconBorderColor : '',
      },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    })));
  }
  const unitStatus = windowRoot.add(new MockPanel('UnitStatus', {
    actuallayoutwidth: 2000,
    style: {
      transform: barStockStyles ? barStockStyles.unitStatusTransform : '',
    },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const infoHealth = unitStatus.add(new MockPanel('InfoHealthContainer', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const levelContainer = infoHealth.add(new MockPanel('LevelContainer', {
    classes: ['NP_playerlevel_container'],
    actuallayoutheight: 210,
    actualyoffset: 910,
    style: { visibility: '' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const levelLabel = levelContainer.add(new MockPanel('unit_level_label', {
    classes: ['NP_playerlevel'],
    text: '10',
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const unitInfo = infoHealth.add(new MockPanel('UnitInfoContainer', {
    actuallayoutheight: 300,
    actualyoffset: 850,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const unitInfoPanel = unitInfo.add(new MockPanel('unit_info_panel', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const infoBg = unitInfoPanel.add(new MockPanel('unit_info_bg', {
    style: {
      opacity: barStockStyles ? barStockStyles.ultBackgroundOpacity : '',
    },
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
    actuallayoutheight: 320,
    actualyoffset: 955,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const liveBar = delayLiveBar
    ? {
        activeParent: null,
        fill: null,
        pip: null,
        pulseOverlay: null,
        healthbar: null,
      }
    : addLiveHealthbar(healthbars, harness, pipText, 50, barStockStyles);
  const counterCanvas = addCounterCanvas(windowRoot, harness);
  const activeParent = liveBar.activeParent;
  const fill = liveBar.fill;
  const pip = liveBar.pip;
  const pulseOverlay = liveBar.pulseOverlay;
  const counter = counterCanvas.counter;
  const counterMax = counterCanvas.counterMax;
  root.SetAttributeString(
    'hp_colors_v2_config',
    makeSnapshot(revision, values),
  );
  harness.contextPanel = unitStatus;
  const context = createVmContext(harness, { includeGameUI: false });
  runInVm(read(contractPath), context, contractPath);
  runInVm(read(colorConsumerPath), context, colorConsumerPath);
  if (harness.scheduler.jobs.length) harness.scheduler.runNext();
  return {
    harness,
    context,
    root,
    unitStatus,
    windowRoot,
    healthbar: liveBar.healthbar,
    infoHealth,
    infoBg,
    fill,
    pulseOverlay,
    ult,
    pip,
    counter,
    counterContainer: counterCanvas.container,
    counterMax,
    activeParent,
    healthbars,
    stockFill,
    stockPip,
    siblingCounter,
    siblingFill,
    staminaContainer,
    staminaIcons,
    levelContainer,
    unitInfo,
    levelLabel,
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





test('v2 source tree keeps the exact eight-asset contract', () => {
  assert.equal(SOURCE_ASSETS.length, 8);
  assert.equal(new Set(SOURCE_ASSETS).size, 8);
  assert.ok(SOURCE_ASSETS.includes('scripts/hp_colors_v2_state.js'));
  assert.deepEqual(listFiles(panoramaRoot), [...SOURCE_ASSETS].sort());
});

test('v2 menu declares required controls and boots through its exported contract', () => {
  const layout = read(menuLayoutPath);
  for (const id of MENU_CONTROL_IDS) {
    assert.match(layout, new RegExp(`\\bid="${id}"`));
  }
  assert.match(layout, /hp_colors_v2_state\.vjs_c/);
  assert.match(layout, /onload="\$\.HPColorsMenuBoot\(\)"/);
  bootMenuVm();
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
  assert.match(
    style,
    /^#UnitHealthbarsContainer #unit_healthbar_lagging\.HPColorsRewritePulse,/m,
  );
  assert.match(
    style,
    /^#UnitHealthbarsContainer #hp_colors_pulse_overlay\.HPColorsRewriteColorPulse$/m,
  );
  assert.doesNotMatch(
    style,
    /^(?:#unit_healthbar_lagging\.HPColorsRewritePulse|#hp_colors_pulse_overlay\.HPColorsRewriteColorPulse)/m,
    'live-bar pulse selectors must not reach the hidden stock bar',
  );
  const unitStatus = cssBlock(style, '#UnitStatus');
  assert.match(unitStatus, /width\s*:\s*2000px\s*;/);
  assert.match(unitStatus, /height\s*:\s*2000px\s*;/);
  assert.match(unitStatus, /horizontal-align\s*:\s*middle\s*;/);
  assert.match(unitStatus, /margin-top\s*:\s*-700px\s*;/);
  assert.match(unitStatus, /margin-right\s*:\s*-105\.075px\s*;/);
  const overlay = read(layoutPath);
  const liveSnippet = overlay.match(
    /<snippet name="UnitHealthBar">[\s\S]*?<\/snippet>/,
  );
  assert.ok(liveSnippet, 'missing live UnitHealthBar snippet');
  assert.doesNotMatch(
    liveSnippet[0],
    /id="hp_counter(?:_anchor|_row|_max)?"/,
    'the shared HP text canvas must not be clipped by a live healthbar',
  );
  assert.match(
    overlay,
    /<Panel class="WindowRoot" hittest="false">\s*<Label id="name"[^>]*\/>\s*<Panel id="hp_counter_container"[\s\S]*?<\/Panel>\s*<CitadelStatusEffect id="StatusEffects"/,
    'the HP text canvas must be a root sibling immediately after the name label',
  );
  const healthbarPosition = cssBlock(style, '#UnitHealthbarsContainer');
  assert.match(healthbarPosition, /margin-top\s*:\s*230px\s*;/);
  assert.match(healthbarPosition, /horizontal-align\s*:\s*middle\s*;/);
  assert.match(healthbarPosition, /vertical-align\s*:\s*middle\s*;/);
  assert.match(healthbarPosition, /overflow\s*:\s*noclip\s*;/);
  assert.match(healthbarPosition, /pre-transform-scale2d\s*:\s*1\.1\s*;/);
  const counterContainer = cssBlock(style, '#hp_counter_container');
  assert.match(counterContainer, /width\s*:\s*1000px\s*;/);
  assert.match(counterContainer, /height\s*:\s*1000px\s*;/);
  assert.match(counterContainer, /horizontal-align\s*:\s*middle\s*;/);
  assert.match(counterContainer, /vertical-align\s*:\s*center\s*;/);
  assert.match(counterContainer, /margin-top\s*:\s*-700px\s*;/);
  assert.match(counterContainer, /margin-right\s*:\s*-105\.075px\s*;/);
  assert.match(counterContainer, /overflow\s*:\s*noclip\s*;/);
  assert.match(counterContainer, /ignore-parent-flow\s*:\s*true\s*;/);
  const counterAnchor = cssBlock(style, '#hp_counter_anchor');
  assert.match(counterAnchor, /width\s*:\s*750px\s*;/);
  assert.match(counterAnchor, /height\s*:\s*120px\s*;/);
  assert.match(counterAnchor, /horizontal-align\s*:\s*left\s*;/);
  assert.match(counterAnchor, /vertical-align\s*:\s*middle\s*;/);
  assert.match(counterAnchor, /margin-left\s*:\s*200px\s*;/);
  assert.match(counterAnchor, /margin-bottom\s*:\s*200px\s*;/);
  assert.match(counterAnchor, /z-index\s*:\s*20\s*;/);
  const counterRow = cssBlock(style, '#hp_counter_row');
  assert.match(counterRow, /flow-children\s*:\s*right\s*;/);
  assert.match(counterRow, /height\s*:\s*fit-children\s*;/);
  assert.doesNotMatch(counterRow, /\btransform\s*:/);
  assert.doesNotMatch(counterRow, /pre-transform-scale2d|transform-origin/);
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
  const playerLevel = cssBlock(style, '.NP_playerlevel_container');
  assert.match(playerLevel, /height\s*:\s*10\.5%\s*;/);
  assert.match(playerLevel, /width\s*:\s*height-percentage\(100%\)\s*;/);
  assert.match(playerLevel, /border\s*:\s*20px\s+solid\s+Team1Color\s*;/);
  assert.match(playerLevel, /margin-top\s*:\s*24px\s*;/);
  assert.match(playerLevel, /margin-right\s*:\s*8px\s*;/);
  assert.match(playerLevel, /margin-left\s*:\s*422\.5px\s*;/);
  assert.match(
    cssBlock(style, '#UnitInfoContainer.unit_info_panel'),
    /margin-left\s*:\s*422\.5px\s*;/,
  );
  assert.match(playerLevel, /transform\s*:\s*translateX\(-161px\)\s*;/);
  assert.match(cssBlock(style, '.NP_playerlevel'), /font-size\s*:\s*100px\s*;/);
  assert.match(playerLevel, /z-index\s*:\s*200\s*;/);
  assert.match(cssBlock(style, '.NP_playerlevel'), /z-index\s*:\s*201\s*;/);
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

  const healthbars = healthbarPosition;
  assert.match(healthbars, /margin-top\s*:\s*230px\s*;/);
  assert.match(healthbars, /horizontal-align\s*:\s*middle\s*;/);
  assert.match(healthbars, /vertical-align\s*:\s*middle\s*;/);
  assert.match(healthbars, /z-index\s*:\s*0\s*;/);
  assert.match(healthbars, /pre-transform-rotate2d\s*:\s*0deg\s*;/);
  assert.match(healthbars, /pre-transform-scale2d\s*:\s*1\.1\s*;/);

  const healthbar = cssBlock(style, '#UnitHealthbarContainer');
  assert.match(healthbar, /height\s*:\s*120px\s*;/);
  assert.match(healthbar, /width\s*:\s*750px\s*;/);
  assert.match(healthbar, /max-width\s*:\s*750px\s*;/);
  assert.match(healthbar, /margin-left\s*:\s*0px\s*;/);

  const pipLabel = cssBlock(style, '#unit_healthbar_pip_label');
  assert.match(pipLabel, /pre-transform-scale2d\s*:\s*1\.0,\s*2\.8\s*;/);
  assert.doesNotMatch(pipLabel, /transform-origin\s*:/);

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

test('v2 HP readout uses the unclipped reference canvas', () => {
  const style = read(stylePath);
  const counterAnchor = cssBlock(style, '#hp_counter_anchor');
  const counterRow = cssBlock(style, '#hp_counter_row');
  assert.match(counterAnchor, /width\s*:\s*750px\s*;/);
  assert.match(counterAnchor, /height\s*:\s*120px\s*;/);
  assert.match(counterAnchor, /horizontal-align\s*:\s*left\s*;/);
  assert.match(counterAnchor, /vertical-align\s*:\s*middle\s*;/);
  assert.match(counterAnchor, /margin-left\s*:\s*200px\s*;/);
  assert.match(counterAnchor, /margin-bottom\s*:\s*200px\s*;/);
  assert.match(counterRow, /horizontal-align\s*:\s*center\s*;/);
  assert.match(counterRow, /vertical-align\s*:\s*middle\s*;/);
  assert.match(counterRow, /height\s*:\s*fit-children\s*;/);
  assert.doesNotMatch(counterRow, /\btransform\s*:/);
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
  assert.equal(fixture.counter.style.height, 'fit-children');
  assert.equal(fixture.counterMax.style.height, 'fit-children');

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

test('v2 updates current HP within one integer percent bucket', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    readoutVisible: true,
  }, 1, '||||||||');

  fixture.fill.actuallayoutwidth = 0.2;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '8 / ');
  assert.equal(fixture.counterMax.text, '4000');

  fixture.fill.actuallayoutwidth = 0.3;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '12 / ');
  assert.equal(fixture.counterMax.text, '4000');
});

test('v2 clears readouts while live geometry is invalid and restores them later', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    readoutVisible: true,
  });
  assert.equal(fixture.counter.text, '300 / ');

  fixture.activeParent.actuallayoutwidth = 0;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '');
  assert.equal(fixture.counterMax.text, '');

  fixture.activeParent.actuallayoutwidth = 100;
  fixture.fill.actuallayoutwidth = 25;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '150 / ');
  assert.equal(fixture.counterMax.text, '600');
});

test('v2 retries one incomplete live bar without polling complete bars', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    readoutVisible: true,
  });
  assert.equal(
    fixture.harness.scheduler.jobs.some((job) => job.delay === 0.05),
    false,
  );

  fixture.fill.DeleteAsync();
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(
    fixture.harness.scheduler.jobs.some((job) => job.delay === 0.05),
    true,
  );
  fixture.activeParent.add(new MockPanel('unit_healthbar_lagging', {
    actuallayoutwidth: 25,
    style: { washColor: '' },
    findCounts: fixture.harness.findCounts,
    operationCounts: fixture.harness.operationCounts,
  }));
  fixture.harness.scheduler.runByDelay(0.05);

  assert.equal(fixture.counter.text, '150 / ');
  assert.equal(fixture.counterMax.text, '600');
  assert.equal(
    fixture.harness.scheduler.jobs.some((job) => job.delay === 0.05),
    false,
  );
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

test('v2 scopes duplicate healthbar IDs to its own WindowRoot instance', () => {
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

test('v2 rejects ambiguous relation ownership and restores stock styles', () => {
  const fixture = makeStatusFixture('ambiguous', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
  });

  assert.equal(fixture.fill.style.washColor, '');
  assert.equal(fixture.counter.style.visibility, 'collapse');
});

test('v2 restores every owned bar value before dropping a live bar', () => {
  const stock = {
    width: '622.50px',
    maxWidth: '701px',
    height: '111px',
    transform: 'translateX(5px)',
    preTransformScale2d: '0.95, 1',
    transformOrigin: '50% 50%',
    opacity: '0.75',
    ultBackgroundOpacity: '0.8',
    unitStatusTransform: 'translateX(4px)',
  };
  const fixture = makeStatusFixture(
    'enemy',
    {
      enabled: true,
      enemyColor: '#123456',
      enemyVisible: false,
      widthScale: 160,
      heightScale: 140,
      positionX: 80,
      positionY: 40,
      readoutVisible: true,
      pipsVisible: false,
      levelsVisible: false,
      enemyPulseEnabled: true,
      enemyPulseThreshold: 100,
      enemyPulseReadout: true,
    },
    1,
    "|'",
    false,
    false,
    false,
    true,
    null,
    stock,
  );
  assert.equal(fixture.fill.style.washColor, '#123456');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '1.76, 1.54');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(
    fixture.healthbars.style.transform,
    'translateX(80px) translateY(40px)',
  );
  assert.equal(fixture.healthbar.style.height, stock.height);
  assert.equal(fixture.healthbar.style.width, stock.width);
  assert.equal(fixture.healthbar.style.maxWidth, stock.maxWidth);
  assert.equal(
    fixture.healthbar.style.preTransformScale2d,
    stock.preTransformScale2d,
  );
  assert.equal(fixture.healthbar.style.transformOrigin, stock.transformOrigin);
  assert.equal(fixture.unitStatus.style.transform, stock.unitStatusTransform);

  fixture.healthbar.SetParent(null);
  fixture.harness.scheduler.runByDelay(1);

  assert.equal(fixture.fill.style.washColor, '#FD4949');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbar.style.height, stock.height);
  assert.equal(fixture.healthbar.style.transform, stock.transform);
  assert.equal(
    fixture.healthbar.style.preTransformScale2d,
    stock.preTransformScale2d,
  );
  assert.equal(fixture.healthbar.style.transformOrigin, stock.transformOrigin);
  assert.equal(fixture.healthbar.style.opacity, stock.opacity);
  assert.equal(fixture.unitStatus.style.transform, stock.unitStatusTransform);
  assert.equal(fixture.infoBg.style.opacity, stock.ultBackgroundOpacity);
  assert.equal(fixture.counter.style.visibility, 'collapse');
  assert.equal(fixture.counter.text, '');
  assert.equal(fixture.counterMax.text, '');
  assert.equal(fixture.pip.style.visibility, '');
  assert.equal(fixture.levelContainer.style.visibility, '');
  assert.equal(fixture.fill.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(fixture.counter.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(fixture.windowRoot.BHasClass('level_number_hidden'), false);
});

test('v2 unregisters its config event and cancels work when context dies', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
  });
  assert.equal(typeof fixture.harness.handlers.ClientUI_FireOutput, 'function');
  assert.ok(fixture.harness.scheduler.jobs.length > 0);

  fixture.unitStatus.valid = false;
  fixture.harness.scheduler.runNext();

  assert.equal(fixture.harness.handlers.ClientUI_FireOutput, undefined);
  assert.equal(fixture.harness.unregisterCalls.length, 1);
  assert.equal(fixture.harness.scheduler.jobs.length, 0);
});

test('v2 scales the segment container around the visible bar center', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
    heightScale: 160,
    positionX: 300,
    positionY: 200,
  });

  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.76');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(
    fixture.healthbars.style.transform,
    'translateX(300px) translateY(200px)',
  );
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.height, '');
  assert.equal(fixture.healthbar.style.marginLeft, undefined);
  assert.equal(fixture.healthbar.style.marginBottom, undefined);
  assert.equal(fixture.unitStatus.style.transform, '');
  assert.equal(fixture.counterContainer.style.transform, undefined);

  fixture.healthbars.actuallayoutheight = 400;
  fixture.healthbar.actualyoffset = 80;
  fixture.healthbar.actuallayoutheight = 160;
  dispatchColorSnapshot(fixture, 2, { widthScale: 150 });
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 40%');
  assert.equal(fixture.levelContainer.style.marginTop, '224px');
  assert.equal(fixture.unitInfo.style.marginTop, '230px');
});

test('v2 preserves a positive custom offset without moving UnitStatus', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    positionX: 300,
    positionY: 200,
  });
  assert.equal(
    fixture.healthbars.style.transform,
    'translateX(300px) translateY(200px)',
  );
  assert.equal(fixture.healthbar.style.transform, '');
  assert.equal(fixture.healthbar.style.marginLeft, undefined);
  assert.equal(fixture.healthbar.style.marginBottom, undefined);
  assert.equal(fixture.unitStatus.style.transform, '');

  const style = read(stylePath);
  assert.match(cssBlock(style, '.WindowRoot'), /overflow\s*:\s*noclip\s*;/);
  assert.match(cssBlock(style, '#UnitStatus'), /overflow\s*:\s*noclip\s*;/);
  assert.match(
    cssBlock(style, '#InfoHealthContainer'),
    /overflow\s*:\s*noclip\s*;/,
  );
  assert.match(
    cssBlock(style, '#UnitHealthbarsContainer'),
    /overflow\s*:\s*noclip\s*;/,
  );
});

test('v2 health text offset range is intentionally wider than the viewport', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    readoutVisible: true,
    readoutOffsetX: 405,
    readoutOffsetY: 840,
  });
  const anchor = fixture.counter.GetParent().GetParent();
  assert.equal(anchor.style.transform, 'translate3d(378px, 340px, 0px)');

  const style = read(stylePath);
  assert.match(
    cssBlock(style, '#hp_counter_container'),
    /overflow\s*:\s*noclip\s*;/,
  );
  assert.match(
    cssBlock(style, '#hp_counter_anchor'),
    /overflow\s*:\s*noclip\s*;/,
  );
  assert.match(cssBlock(style, '#hp_counter_row'), /overflow\s*:\s*noclip\s*;/);
});

test('v2 scales the max-HP segment container without changing the live bar', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
    heightScale: 160,
  });

  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.76');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(fixture.healthbar.style.width, '');
  assert.equal(fixture.healthbar.style.maxWidth, '');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.height, '');
  assert.equal(fixture.unitStatus.style.transform, '');
});

test('v2 overview layout reset applies immediately to an existing bar', () => {
  const customizedValues = {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
    heightScale: 160,
    positionX: 300,
    positionY: 200,
  };
  const stock = {
    width: '622.50px',
    maxWidth: '',
    height: '',
    transform: 'translateX(5px)',
    opacity: '1',
    ultBackgroundOpacity: '0.8',
    unitStatusTransform: 'translateX(5px)',
  };
  const fixture = makeStatusFixture(
    'enemy',
    customizedValues,
    1,
    "|'",
    false,
    false,
    false,
    false,
    null,
    stock,
  );
  assert.equal(
    fixture.healthbars.style.transform,
    'translateX(300px) translateY(200px)',
  );
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.76');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(fixture.healthbar.style.width, stock.width);
  assert.equal(fixture.healthbar.style.maxWidth, stock.maxWidth);
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.transform, stock.transform);
  assert.equal(fixture.unitStatus.style.transform, stock.unitStatusTransform);

  dispatchColorSnapshot(fixture, 2, {
    ...customizedValues,
    widthScale: 100,
    heightScale: 100,
    positionX: 0,
    positionY: 0,
  });

  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.width, stock.width);
  assert.equal(fixture.healthbar.style.maxWidth, stock.maxWidth);
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.height, stock.height);
  assert.equal(fixture.healthbar.style.transform, stock.transform);
  assert.equal(
    fixture.unitStatus.style.transform,
    stock.unitStatusTransform,
  );
});

test('v2 late optional panel discovery cannot contaminate the stock layout baseline', () => {
  const customizedValues = {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
    heightScale: 160,
    positionX: 300,
    positionY: 200,
  };
  const stock = {
    width: '622.50px',
    maxWidth: '',
    height: '',
    transform: 'translateX(5px)',
    opacity: '1',
    ultBackgroundOpacity: '0.8',
    unitStatusTransform: 'translateX(5px)',
  };
  const fixture = makeStatusFixture(
    'enemy',
    customizedValues,
    1,
    "|'",
    false,
    false,
    false,
    false,
    null,
    stock,
  );
  assert.equal(
    fixture.healthbars.style.transform,
    'translateX(300px) translateY(200px)',
  );
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.76');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(fixture.healthbar.style.width, stock.width);
  assert.equal(fixture.healthbar.style.maxWidth, stock.maxWidth);
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.unitStatus.style.transform, stock.unitStatusTransform);

  fixture.ult.DeleteAsync(0);
  fixture.infoBg.add(new MockPanel('unit_ult_ready_icon', {
    style: { washColor: '' },
    findCounts: fixture.harness.findCounts,
    operationCounts: fixture.harness.operationCounts,
  }));
  fixture.harness.scheduler.runByDelay(1);

  dispatchColorSnapshot(fixture, 2, {
    ...customizedValues,
    widthScale: 100,
    heightScale: 100,
    positionX: 0,
    positionY: 0,
  });

  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.height, stock.height);
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(
    fixture.unitStatus.style.transform,
    stock.unitStatusTransform,
  );
});

test('v2 layout reset survives an incomplete required-part refresh', () => {
  const fixture = makeStatusFixture(
    'enemy',
    {
      enabled: true,
      enemyColor: '#123456',
      widthScale: 230,
      heightScale: 160,
      positionX: 300,
      positionY: 200,
    },
    1,
    "|'",
    false,
    false,
    false,
    true,
  );
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.76');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(
    fixture.healthbars.style.transform,
    'translateX(300px) translateY(200px)',
  );
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.height, '');

  fixture.fill.DeleteAsync(0);
  dispatchColorSnapshot(fixture, 2, {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 100,
    heightScale: 100,
    positionX: 0,
    positionY: 0,
  });
  fixture.activeParent.add(new MockPanel('unit_healthbar_lagging', {
    actuallayoutwidth: 40,
    style: { washColor: '' },
    findCounts: fixture.harness.findCounts,
    operationCounts: fixture.harness.operationCounts,
  }));
  fixture.harness.scheduler.runByDelay(1);

  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.height, '');
  assert.equal(fixture.healthbar.style.marginLeft, undefined);
  assert.equal(fixture.healthbar.style.marginBottom, undefined);
});

test('v2 scan repairs custom scale without touching engine-owned width', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
  });
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.1');

  fixture.healthbar.style.width = '622.50px';
  fixture.healthbars.style.preTransformScale2d = '1, 1';
  fixture.harness.scheduler.runByDelay(1);

  assert.equal(fixture.healthbar.style.width, '622.50px');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.1');
});

test('v2 resets inline layout styles through the Panorama null-clear path', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
    heightScale: 160,
    positionX: 300,
    positionY: 200,
  });
  for (const panel of [
    fixture.healthbars,
    fixture.healthbar,
    fixture.unitStatus,
  ]) {
    const values = { ...panel.style };
    panel.style = new Proxy(values, {
      set(target, property, value) {
        if (value === '') return true;
        if (value === null) delete target[property];
        else target[property] = value;
        return true;
      },
    });
  }

  dispatchColorSnapshot(fixture, 2, {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 100,
    heightScale: 100,
    positionX: 0,
    positionY: 0,
  });

  assert.equal(fixture.healthbars.style.transform, undefined);
  assert.equal(fixture.healthbars.style.preTransformScale2d, undefined);
  assert.equal(fixture.healthbars.style.transformOrigin, undefined);
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.width, '');
  assert.equal(fixture.healthbar.style.maxWidth, '');
  assert.equal(fixture.healthbar.style.marginLeft, undefined);
  assert.equal(fixture.healthbar.style.marginBottom, undefined);
  assert.equal(fixture.unitStatus.style.transform, '');
});


test('v2 ally bar reset applies immediately to an existing bar', () => {
  const stock = {
    width: '750px',
    maxWidth: '750px',
    height: '120px',
    transform: '',
    opacity: '1',
    ultBackgroundOpacity: '0.8',
  };
  const customizedValues = {
    enabled: true,
    allyEnabled: true,
    allyVisible: false,
    allyTeamHigh: true,
  };
  const fixture = makeStatusFixture(
    'ally',
    customizedValues,
    1,
    "|'",
    false,
    false,
    false,
    false,
    null,
    stock,
  );
  assert.equal(fixture.healthbar.style.opacity, '0.01');

  dispatchColorSnapshot(fixture, 2, {
    ...customizedValues,
    allyEnabled: false,
    allyVisible: true,
    allyTeamHigh: false,
  });

  assert.equal(fixture.healthbar.style.opacity, stock.opacity);
  assert.equal(fixture.infoBg.style.opacity, stock.ultBackgroundOpacity);
});

test('v2 preset apply updates layout and ally bar immediately on existing panels', () => {
  const enemy = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
  });
  dispatchColorSnapshot(enemy, 2, {
    enabled: true,
    enemyEnabled: true,
    enemyMode: 'fixed',
    enemyLow: '#123456',
    enemyMid: '#123456',
    enemyHigh: '#123456',
    widthScale: 230,
    positionX: 300,
  });
  assert.equal(
    enemy.healthbars.style.transform,
    'translateX(300px) translateY(0px)',
  );
  assert.equal(enemy.healthbars.style.preTransformScale2d, '2.53, 1.1');
  assert.equal(enemy.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(enemy.healthbar.style.width, '');
  assert.equal(enemy.healthbar.style.maxWidth, '');
  assert.equal(enemy.healthbar.style.preTransformScale2d, '');
  assert.equal(enemy.healthbar.style.transformOrigin, '');
  assert.equal(enemy.healthbar.style.marginLeft, undefined);
  assert.equal(enemy.healthbar.style.transform, '');
  assert.equal(enemy.unitStatus.style.transform, '');

  const ally = makeStatusFixture('ally', {
    enabled: true,
    allyEnabled: false,
  });
  dispatchColorSnapshot(ally, 2, {
    enabled: true,
    allyEnabled: true,
    allyVisible: false,
  });
  assert.equal(ally.healthbar.style.opacity, '0.01');
});

test('v2 centers the complete segment surface as its width changes', () => {
  const fixture = makeStatusFixture(
    'enemy',
    {
      enabled: true,
      enemyColor: '#123456',
      widthScale: 230,
    },
    1,
    "|'",
    false,
    false,
    false,
    false,
    null,
    {
      width: '500px',
      maxWidth: '700px',
      height: '120px',
      transform: '',
      opacity: '1',
      unitStatusTransform: '',
    },
  );
  fixture.healthbars.AddClass('maxhp_segment_1');
  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.1');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(fixture.levelContainer.style.marginLeft, '202.5px');
  assert.equal(fixture.levelContainer.style.marginTop, '24px');
  assert.equal(fixture.unitInfo.style.marginLeft, '202.5px');
  assert.equal(fixture.unitInfo.style.marginTop, '30px');
  assert.equal(fixture.healthbar.style.width, '500px');
  assert.equal(fixture.unitStatus.style.transform, '');
  assert.equal(fixture.healthbar.style.maxWidth, '700px');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.height, '120px');

  fixture.healthbar.style.width = '625px';
  fixture.healthbar.actuallayoutwidth = 625;
  fixture.healthbar.style.maxWidth = '700px';
  fixture.healthbars.RemoveClass('maxhp_segment_1');
  fixture.healthbars.AddClass('maxhp_segment_2');
  fixture.fill.actuallayoutwidth = 45;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.1');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(fixture.levelContainer.style.marginLeft, '44.38px');
  assert.equal(fixture.unitInfo.style.marginLeft, '44.38px');
  assert.equal(fixture.healthbar.style.width, '625px');
  assert.equal(fixture.healthbar.style.maxWidth, '700px');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');

  dispatchColorSnapshot(fixture, 2, {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 100,
  });
  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.equal(fixture.levelContainer.style.marginLeft, '491.25px');
  assert.equal(fixture.levelContainer.style.marginTop, '24px');
  assert.equal(fixture.unitInfo.style.marginLeft, '491.25px');
  assert.equal(fixture.unitInfo.style.marginTop, '30px');
  assert.equal(fixture.healthbar.style.width, '625px');
  assert.equal(fixture.healthbar.style.maxWidth, '700px');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  fixture.healthbar.actuallayoutwidth = 750;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.levelContainer.style.marginLeft, '422.5px');
  assert.equal(fixture.levelContainer.style.marginTop, '24px');
  assert.equal(fixture.unitInfo.style.marginLeft, '422.5px');
  assert.equal(fixture.unitInfo.style.marginTop, '30px');
  assert.match(
    cssBlock(read(stylePath), '#UnitHealthbarsContainer'),
    /overflow\s*:\s*noclip\s*;/,
  );
  assert.match(
    cssBlock(read(stylePath), '#UnitHealthbarContainer'),
    /margin-left\s*:\s*0px\s*;/,
  );
  dispatchColorSnapshot(fixture, 3, { enabled: false });
  assert.equal(fixture.levelContainer.style.marginLeft, '');
  assert.equal(fixture.levelContainer.style.marginTop, '');
  assert.equal(fixture.unitInfo.style.marginLeft, '');
  assert.equal(fixture.unitInfo.style.marginTop, '');
});

test('indicator geometry stays aligned across scale and anchored offsets', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
  });

  dispatchColorSnapshot(fixture, 2, {
    heightScale: 160,
    positionY: 200,
  });
  assert.equal(fixture.levelContainer.style.marginTop, '283.75px');
  assert.equal(fixture.unitInfo.style.marginTop, '289.75px');

  dispatchColorSnapshot(fixture, 3, {
    heightScale: 60,
    positionY: -200,
  });
  assert.equal(fixture.levelContainer.style.marginTop, '-282.5px');
  assert.equal(fixture.unitInfo.style.marginTop, '-276.5px');

  dispatchColorSnapshot(fixture, 4, {
    accessoryAnchorEnabled: false,
    widthScale: 230,
    heightScale: 100,
    positionX: 80,
    positionY: 30,
    levelOffsetX: -63,
    ultOffsetX: 245,
  });
  assert.equal(fixture.levelContainer.style.marginLeft, '-258.65px');
  assert.equal(fixture.unitInfo.style.marginLeft, '449.75px');
  assert.equal(fixture.levelContainer.style.marginTop, '24px');
  assert.equal(fixture.unitInfo.style.marginTop, '0px');
  assert.equal(
    fixture.healthbars.style.transform,
    'translateX(80px) translateY(30px)',
  );

  dispatchColorSnapshot(fixture, 5, {
    accessoryAnchorEnabled: false,
    widthScale: 60,
    heightScale: 100,
    positionX: 80,
    positionY: 30,
    levelOffsetX: -63,
    ultOffsetX: 245,
  });
  assert.equal(fixture.levelContainer.style.marginLeft, '549.7px');
  assert.equal(fixture.unitInfo.style.marginLeft, '734.5px');
});

test('indicator geometry debug prints computed live positions', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
    heightScale: 160,
    positionX: -200,
    positionY: -200,
  });
  console.log(
    'GEOMETRY DEBUG:',
    'scale=' + fixture.healthbars.style.preTransformScale2d,
    'origin=' + fixture.healthbars.style.transformOrigin,
    'bar=' + fixture.healthbars.style.transform,
    'level=' +
      fixture.levelContainer.style.marginLeft +
      ',' +
      fixture.levelContainer.style.marginTop,
    'ult=' +
      fixture.unitInfo.style.marginLeft +
      ',' +
      fixture.unitInfo.style.marginTop,
  );
  assert.equal(fixture.levelContainer.style.marginTop, '-516.25px');
  assert.equal(fixture.unitInfo.style.marginTop, '-510.25px');
});

test('v2 repairs custom segment geometry without owning parent clipping styles', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
    positionX: 300,
    positionY: 200,
  });
  fixture.healthbar.style.width = '750px';
  fixture.healthbar.style.maxWidth = '750px';
  fixture.healthbars.style.preTransformScale2d = '1, 1';
  fixture.windowRoot.style.overflow = 'clip';
  fixture.unitStatus.style.overflow = 'clip';
  fixture.infoHealth.style.overflow = 'clip';

  fixture.harness.scheduler.runByDelay(1);

  assert.equal(fixture.healthbar.style.width, '750px');
  assert.equal(fixture.healthbar.style.maxWidth, '750px');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.1');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(
    fixture.healthbars.style.transform,
    'translateX(300px) translateY(200px)',
  );
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.marginLeft, undefined);
  assert.equal(fixture.healthbar.style.marginBottom, undefined);
  assert.equal(fixture.healthbar.style.transform, '');
  assert.equal(fixture.unitStatus.style.transform, '');
  assert.equal(fixture.windowRoot.style.overflow, 'clip');
  assert.equal(fixture.unitStatus.style.overflow, 'clip');
  assert.equal(fixture.infoHealth.style.overflow, 'clip');
});

test('v2 damage transitions preserve stock geometry without debug logging', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyMode: 'gradient',
    enemyLow: '#FD4949',
    enemyMid: '#FF7B00',
    enemyHigh: '#00FF00',
  });
  const prefix = '[HPV2-' + 'DMGDRIFT] ';
  fixture.harness.logs.length = 0;

  fixture.healthbar.style.width = '622.50px';
  fixture.healthbar.styleWrites.length = 0;
  fixture.unitStatus.styleWrites.length = 0;
  fixture.fill.actuallayoutwidth = 45;
  fixture.harness.scheduler.runNext();

  fixture.fill.actuallayoutwidth = 40;
  fixture.harness.scheduler.runNext();

  fixture.fill.actuallayoutwidth = 40;
  fixture.harness.scheduler.runNext();
  fixture.fill.actuallayoutwidth = 45;
  fixture.harness.scheduler.runNext();

  assert.deepEqual(
    fixture.harness.logs.filter((line) => line.startsWith(prefix)),
    [],
  );
  assert.deepEqual(
    fixture.healthbar.styleWrites.filter((write) =>
      ['width', 'maxWidth', 'height', 'transform'].includes(write.property),
    ),
    [],
  );
  assert.deepEqual(
    fixture.unitStatus.styleWrites.filter(
      (write) => write.property === 'transform',
    ),
    [],
  );
});

test('v2 custom width never fights damage-owned healthbar width', () => {
  const fixture = makeStatusFixture(
    'enemy',
    {
      enabled: true,
      enemyMode: 'gradient',
      enemyLow: '#FD4949',
      enemyMid: '#FF7B00',
      enemyHigh: '#00FF00',
      widthScale: 230,
    },
    1,
    "|'",
    false,
    false,
    false,
    true,
  );

  fixture.healthbar.style.width = '622.50px';
  fixture.healthbar.styleWrites.length = 0;
  fixture.fill.actuallayoutwidth = 40;
  fixture.harness.scheduler.runByDelay(1);

  assert.equal(fixture.healthbar.style.width, '622.50px');
  assert.deepEqual(
    fixture.healthbar.styleWrites.filter((write) => write.property === 'width'),
    [],
  );
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.53, 1.1');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
});

test('v2 enemy stamina display settings customize only enemy stamina and preserve empty pip interiors', () => {
  const customizedValues = {
    enabled: true,
    enemyColor: '#123456',
    staminaWidth: 150,
    staminaHeight: 52.5,
    staminaOffsetX: 24,
    staminaOffsetY: -18,
    enemyStaminaColorEnabled: true,
    enemyStaminaColor: '#654321',
  };
  const fixture = makeStatusFixture('enemy', customizedValues);

  assert.equal(
    fixture.staminaContainer.style.transform,
    'translateX(24px) translateY(-18px)',
  );
  assert.equal(fixture.staminaContainer.style.washColor, '#FFFFFF');
  for (const icon of fixture.staminaIcons) {
    assert.equal(icon.style.width, '150px');
    assert.equal(icon.style.height, '52.5px');
    assert.equal(icon.style.borderColor, '#654321');
  }
  assert.equal(fixture.staminaIcons[0].style.backgroundColor, '#654321');
  assert.equal(fixture.staminaIcons[1].style.backgroundColor, '#654321');
  assert.equal(fixture.staminaIcons[2].style.backgroundColor, '#000000');

  dispatchColorSnapshot(fixture, 2, {
    ...customizedValues,
    enemyStaminaColor: '#ABCDEF',
  });
  assert.equal(fixture.staminaContainer.style.washColor, '#FFFFFF');
  assert.equal(fixture.staminaIcons[0].style.backgroundColor, '#ABCDEF');
  assert.equal(fixture.staminaIcons[1].style.backgroundColor, '#ABCDEF');
  assert.equal(fixture.staminaIcons[2].style.backgroundColor, '#000000');
  for (const icon of fixture.staminaIcons) {
    assert.equal(icon.style.borderColor, '#ABCDEF');
  }

  fixture.staminaIcons[0].GetParent().SetHasClass('PipEmpty', true);
  fixture.staminaIcons[2].GetParent().SetHasClass('PipEmpty', false);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.staminaIcons[0].style.backgroundColor, '#000000');
  assert.equal(fixture.staminaIcons[2].style.backgroundColor, '#ABCDEF');
  dispatchColorSnapshot(fixture, 3, { enabled: false });
  assert.equal(fixture.staminaContainer.style.transform, '');
  for (const icon of fixture.staminaIcons) {
    assert.equal(icon.style.width, '');
    assert.equal(icon.style.height, '');
    assert.equal(icon.style.backgroundColor, '');
    assert.equal(icon.style.borderColor, '');
  }

  const ally = makeStatusFixture('ally', {
    enabled: true,
    staminaWidth: 150,
    enemyStaminaColorEnabled: true,
    enemyStaminaColor: '#654321',
  });
  assert.equal(ally.staminaContainer.style.transform, '');
  assert.equal(ally.staminaIcons[0].style.width, '');
  assert.equal(ally.staminaIcons[0].style.backgroundColor, '');
});

test('v2 stamina section reset restores stock styles immediately', () => {
  const customizedValues = {
    enabled: true,
    enemyColor: '#123456',
    staminaWidth: 150,
    staminaHeight: 52.5,
    staminaOffsetX: 24,
    staminaOffsetY: -18,
    enemyStaminaColorEnabled: true,
    enemyStaminaColor: '#654321',
  };
  const stock = {
    containerTransform: 'translateX(7px)',
    containerWashColor: '#778899',
    iconWidth: '110px',
    iconHeight: '44.8px',
    iconBackgroundColor: '#112233',
    iconBorderColor: '#445566',
  };
  const fixture = makeStatusFixture(
    'enemy',
    customizedValues,
    1,
    "|'",
    false,
    false,
    false,
    false,
    stock,
  );
  assert.equal(fixture.staminaIcons[0].style.width, '150px');
  assert.equal(fixture.staminaIcons[0].style.backgroundColor, '#654321');

  dispatchColorSnapshot(fixture, 2, {
    ...customizedValues,
    staminaWidth: 110,
    staminaHeight: 44.8,
    staminaOffsetX: 0,
    staminaOffsetY: 0,
    enemyStaminaColorEnabled: false,
    enemyStaminaColor: '#FD4949',
  });

  assert.equal(fixture.staminaContainer.style.transform, stock.containerTransform);
  assert.equal(fixture.staminaContainer.style.washColor, stock.containerWashColor);
  for (const icon of fixture.staminaIcons) {
    assert.equal(icon.style.width, stock.iconWidth);
    assert.equal(icon.style.height, stock.iconHeight);
    assert.equal(icon.style.backgroundColor, stock.iconBackgroundColor);
    assert.equal(icon.style.borderColor, stock.iconBorderColor);
  }
});

test('v2 clears ultimate background opacity when customization turns off', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    enemyVisible: false,
    widthScale: 160,
  });
  assert.equal(fixture.infoBg.style.opacity, '0.01');
  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '1.76, 1.1');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(fixture.healthbar.style.width, '');
  assert.equal(fixture.healthbar.style.maxWidth, '');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');

  dispatchColorSnapshot(fixture, 2, { enabled: false });
  assert.equal(fixture.infoBg.style.opacity, '');
  assert.equal(fixture.healthbars.style.transform, '');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.width, '');
  assert.equal(fixture.healthbar.style.maxWidth, '');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
});

test('v2 color pulse still dims the live healthbar fill', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    enemyPulseEnabled: true,
    enemyPulseThreshold: 100,
    enemyPulseIntensity: 1,
    enemyPulseColorEnabled: true,
    enemyPulseColorMode: 'gradient',
    enemyPulseColor: '#FF2222',
  });

  assert.equal(fixture.fill.BHasClass('HPColorsRewritePulse'), true);
  assert.equal(fixture.fill.style.animationDuration, '0.800s');
  assert.equal(fixture.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'), true);
});

test('v2 pulses current and maximum health text together', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    enemyPulseEnabled: true,
    enemyPulseThreshold: 100,
    enemyPulseReadout: true,
  });

  assert.equal(fixture.counter.BHasClass('HPColorsRewritePulse'), true);
  assert.equal(fixture.counterMax.BHasClass('HPColorsRewritePulse'), true);
  assert.equal(fixture.counter.style.animationDuration, '0.800s');
  assert.equal(fixture.counterMax.style.animationDuration, '0.800s');
});

test('v2 ally pulse fixed and gradient modes use the selected custom color', () => {
  const fixed = makeStatusFixture('ally', {
    enabled: true,
    allyColor: '#123456',
    allyPulseEnabled: true,
    allyPulseThreshold: 100,
    allyPulseColorEnabled: true,
    allyPulseColorMode: 'fixed',
    allyPulseColor: '#ABCDEF',
  });
  assert.equal(fixed.fill.style.washColor, '#ABCDEF');
  assert.equal(fixed.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'), false);

  const gradient = makeStatusFixture('ally', {
    enabled: true,
    allyColor: '#123456',
    allyPulseEnabled: true,
    allyPulseThreshold: 100,
    allyPulseColorEnabled: true,
    allyPulseColorMode: 'gradient',
    allyPulseColor: '#ABCDEF',
  });
  assert.equal(gradient.fill.style.washColor, '#123456');
  assert.equal(
    gradient.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    true,
  );
  assert.equal(gradient.pulseOverlay.style.washColor, '#ABCDEF');
});

test('v2 recenters ultimate when level display is disabled', () => {
  const fixture = makeStatusFixture(
    'enemy',
    {
      enabled: true,
      enemyColor: '#123456',
      levelsVisible: false,
    },
    1,
    "|'",
    false,
    false,
    false,
    true,
  );
  assert.equal(fixture.windowRoot.BHasClass('level_number_visible'), false);
  assert.equal(fixture.windowRoot.BHasClass('level_number_hidden'), true);
  assert.equal(fixture.levelContainer.style.visibility, 'collapse');

  const style = read(stylePath);
  assert.match(
    cssBlock(
      style,
      '.enemy.player.level_number_hidden #InfoHealthContainer',
    ),
    /transform\s*:\s*translateX\(-102px\)\s*;/,
  );
  assert.match(
    cssBlock(
      style,
      '.enemy.player.level_number_hidden #hp_counter_container',
    ),
    /transform\s*:\s*translateX\(-102px\)\s*;/,
  );

  dispatchColorSnapshot(fixture, 2, {
    enabled: true,
    enemyMode: 'fixed',
    enemyLow: '#123456',
    enemyMid: '#123456',
    enemyHigh: '#123456',
    levelsVisible: true,
  });
  assert.equal(fixture.windowRoot.BHasClass('level_number_hidden'), false);
  assert.equal(fixture.windowRoot.BHasClass('level_number_visible'), true);
});

test('v2 rejects malformed and stale configuration revisions', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
  }, 3);
  const handler = fixture.harness.handlers.ClientUI_FireOutput;

  dispatchColorSnapshot(fixture, 2, {
    enabled: true,
    enemyMode: 'fixed',
    enemyLow: '#ABCDEF',
    enemyMid: '#ABCDEF',
    enemyHigh: '#ABCDEF',
  });
  assert.equal(fixture.fill.style.washColor, '#123456');

  dispatchColorSnapshot(fixture, 3, {
    enabled: true,
    enemyMode: 'fixed',
    enemyLow: '#ABCDEF',
    enemyMid: '#ABCDEF',
    enemyHigh: '#ABCDEF',
  });
  assert.equal(fixture.fill.style.washColor, '#123456');

  handler(makeSnapshot(undefined, {
    enabled: true,
    enemyMode: 'fixed',
    enemyLow: '#ABCDEF',
    enemyMid: '#ABCDEF',
    enemyHigh: '#ABCDEF',
  }));
  assert.equal(fixture.fill.style.washColor, '#123456');
});
