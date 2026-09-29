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

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
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
  installPanels(harness, [...read(menuLayoutPath).matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
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

function translation(transform) {
  if (!transform || transform === 'none') return [0, 0];
  const match = /^translateX\((-?[\d.]+)px\) translateY\((-?[\d.]+)px\)$/.exec(transform);
  assert.ok(match, `unsupported translation: ${transform}`);
  return [Number(match[1]), Number(match[2])];
}

function centeredMarginLayout(panel, stockMarginTop) {
  let stockTop = panel.actualyoffset;
  Object.defineProperty(panel, 'actualyoffset', {
    configurable: true,
    get() {
      const margin = Number.parseFloat(panel.style.marginTop);
      return stockTop + (Number.isFinite(margin) ? (margin - stockMarginTop) / 2 : 0);
    },
    set(value) { stockTop = value; },
  });
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
  extraClasses = [],
  beforeBoot = null,
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
  classes.push(...extraClasses);
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
  // Both indicators are vertically centered: Panorama moves them by half the
  // top margin beyond their stock one. Assigning actualyoffset sets the stock top.
  centeredMarginLayout(levelContainer, 24);
  centeredMarginLayout(unitInfo, 0);
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
  if (beforeBoot) beforeBoot({ infoHealth, levelContainer, unitInfo, healthbars, healthbar: liveBar.healthbar });
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
    counterAnchor: counterCanvas.anchor,
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

test('v2 ally health text is opt-in, independently styled, and live without ally bar colors', () => {
  const stock = makeStatusFixture('ally', { enabled: true, readoutVisible: true });
  assert.equal(stock.counter.text, '');
  assert.equal(stock.counter.style.visibility, 'collapse');

  const fixture = makeStatusFixture('ally', {
    enabled: true,
    allyEnabled: false,
    readoutVisible: false,
    allyReadoutVisible: true,
    allyReadoutFormat: 'percent',
    allyReadoutColorMode: 'custom',
    allyReadoutMode: 'fixed',
    allyReadoutLow: '#112233',
    allyReadoutMid: '#445566',
    allyReadoutHigh: '#778899',
    allyReadoutSize: 200,
    allyReadoutFont: 'oracle',
    allyReadoutOffsetX: 10,
    allyReadoutOffsetY: 450,
  });
  assert.equal(fixture.counter.text, '50%');
  assert.equal(fixture.counter.style.visibility, 'visible');
  assert.equal(fixture.counterMax.style.visibility, 'collapse');
  assert.equal(fixture.counter.style.washColor, '#445566');
  assert.equal(fixture.counter.style.fontSize, '200px');
  assert.equal(fixture.counter.style.fontFamily, 'VALVEOracle, Reaver, sans-serif');
  assert.equal(
    fixture.counterAnchor.style.transform,
    'translate3d(-17px, -50px, 0px)',
  );

  fixture.fill.actuallayoutwidth = 10;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '10%');
  assert.equal(fixture.counter.style.washColor, '#112233');

  const enemy = makeStatusFixture('enemy', {
    enabled: true,
    readoutVisible: false,
    allyReadoutVisible: true,
  });
  assert.equal(enemy.counter.text, '');
  assert.equal(enemy.counter.style.visibility, 'collapse');
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

test('v2 refreshes nearest bar ancestors after active-parent reparent', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
  });
  const replacement = fixture.healthbars.add(
    new MockPanel('UnitHealthbarContainer', {
      actuallayoutwidth: 500,
      actuallayoutheight: 120,
      findCounts: fixture.harness.findCounts,
      operationCounts: fixture.harness.operationCounts,
    }),
  );
  const replacementBackground = replacement.add(
    new MockPanel('unit_healthbar_bg', {
      findCounts: fixture.harness.findCounts,
      operationCounts: fixture.harness.operationCounts,
    }),
  );
  const replacementMissing = replacementBackground.add(
    new MockPanel('unit_healthbar_missing', {
      findCounts: fixture.harness.findCounts,
      operationCounts: fixture.harness.operationCounts,
    }),
  );
  fixture.activeParent.SetParent(replacementMissing);

  fixture.harness.scheduler.runByDelay(1);

  assert.equal(fixture.levelContainer.style.marginLeft, '202.5px');
  assert.equal(fixture.unitInfo.style.marginLeft, '202.5px');
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
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
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

  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
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

  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
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

  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
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
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
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
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
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
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
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
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
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

test('ally and enemy icons follow bar translation without scaling the offset', () => {
  for (const role of ['ally', 'enemy']) {
    const fixture = makeStatusFixture(role, { widthScale: 230 });
    const initialIconX = parseFloat(fixture.unitInfo.style.marginLeft);
    const initialLevelX = parseFloat(fixture.levelContainer.style.marginLeft);
    let revision = 1;
    for (const positionX of [300, -300, 0]) {
      dispatchColorSnapshot(fixture, ++revision, { widthScale: 230, positionX });
      assert.equal(
        parseFloat(fixture.unitInfo.style.marginLeft) - initialIconX,
        positionX,
        `${role} ultimate must translate by the same pixels as the bar`,
      );
      assert.equal(
        parseFloat(fixture.levelContainer.style.marginLeft) - initialLevelX,
        positionX,
        `${role} level must translate by the same pixels as the bar`,
      );
    }
  }
});

test('layout reset replaces a negative rendered translation before another layout update', () => {
  for (const role of ['ally', 'enemy']) {
    const fixture = makeStatusFixture(role, { widthScale: 230, positionX: -300 });
    let renderedTransform = fixture.healthbars.style.transform;
    const style = fixture.healthbars.style;
    fixture.healthbars.style = new Proxy(style, {
      set(target, property, value) {
        // Clearing an inline style can defer CSS recomputation until layout.
        if (property === 'transform' && value !== null && value !== '')
          renderedTransform = value;
        target[property] = value;
        return true;
      },
    });
    dispatchColorSnapshot(fixture, 2, {
      widthScale: 100, heightScale: 100, positionX: 0, positionY: 0,
    });
    assert.deepEqual(translation(renderedTransform), [0, 0], role);
  }
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

test('indicator geometry stays aligned at maximum scale and offset', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
    heightScale: 160,
    positionX: -200,
    positionY: -200,
  });
  assert.equal(fixture.levelContainer.style.marginTop, '-516.25px');
  assert.equal(fixture.unitInfo.style.marginTop, '-510.25px');
});

// A save applied at game boot reaches the bars during pregame, when stock CSS
// collapses #InfoHealthContainer, so the indicators are measured in a layout
// that changes once the match starts.
const ANCHORED_BOOT_VALUES = {
  enabled: true,
  enemyColor: '#123456',
  widthScale: 150,
  heightScale: 160,
  positionX: 120,
  positionY: 200,
  levelOffsetY: 12,
  ultOffsetY: -8,
};

function bootAnchoredFixture(beforeBoot) {
  return makeStatusFixture(
    'enemy', ANCHORED_BOOT_VALUES, 1, "|'", false, false, false, false, null, null, [], beforeBoot,
  );
}

function indicatorMargins(fixture) {
  return {
    level: [fixture.levelContainer.style.marginLeft, fixture.levelContainer.style.marginTop],
    ult: [fixture.unitInfo.style.marginLeft, fixture.unitInfo.style.marginTop],
  };
}

// Stock match layout.
function showMatchLayout(fixture) {
  fixture.infoHealth.actuallayoutheight = 2030;
  fixture.healthbars.actuallayoutheight = 320;
  fixture.healthbars.actualyoffset = 955;
  fixture.healthbar.actuallayoutheight = 120;
  fixture.levelContainer.actuallayoutheight = 210;
  fixture.levelContainer.actualyoffset = 910;
  fixture.unitInfo.actuallayoutheight = 300;
  fixture.unitInfo.actualyoffset = 850;
}

test('a save applied while pregame collapses the HUD anchors the level and ultimate once the match shows it', () => {
  const expected = indicatorMargins(bootAnchoredFixture((parts) => {
    parts.infoHealth.actuallayoutheight = 2030;
  }));
  const fixture = bootAnchoredFixture((parts) => {
    for (const panel of Object.values(parts)) panel.actuallayoutheight = 0;
  });
  showMatchLayout(fixture);
  fixture.harness.scheduler.runFor(3000);
  assert.deepEqual(indicatorMargins(fixture), expected);
});

test('indicators measured in a pregame layout re-anchor when the match layout replaces it', () => {
  const expected = indicatorMargins(bootAnchoredFixture((parts) => {
    parts.infoHealth.actuallayoutheight = 2030;
  }));
  // Pregame lays the centered panels out inside a small frame.
  const fixture = bootAnchoredFixture((parts) => {
    parts.infoHealth.actuallayoutheight = 40;
    parts.healthbars.actualyoffset = -140;
    parts.levelContainer.actualyoffset = -85;
    parts.unitInfo.actualyoffset = -130;
  });
  assert.notDeepEqual(indicatorMargins(fixture), expected);
  showMatchLayout(fixture);
  fixture.harness.scheduler.runFor(3000);
  assert.deepEqual(indicatorMargins(fixture), expected);

  // Settled: further scans keep the same anchor.
  fixture.harness.scheduler.runFor(3000);
  assert.deepEqual(indicatorMargins(fixture), expected);
});

// The level badge and UnitInfo stay collapsed until their classes appear; a
// collapsed panel can report its size with a stale position while the frame
// around it never changes.
test('indicators measured while collapsed at a stale position re-anchor when shown', () => {
  const expected = indicatorMargins(bootAnchoredFixture());
  const fixture = bootAnchoredFixture((parts) => {
    parts.levelContainer.actualyoffset = 0;
    parts.unitInfo.actualyoffset = 0;
  });
  assert.notDeepEqual(indicatorMargins(fixture), expected);
  fixture.levelContainer.actualyoffset = 910;
  fixture.unitInfo.actualyoffset = 850;
  fixture.harness.scheduler.runFor(3000);
  assert.deepEqual(indicatorMargins(fixture), expected);
  fixture.harness.scheduler.runFor(5000);
  assert.deepEqual(indicatorMargins(fixture), expected, 'settled anchors stay put');
});

test('the bar moving inside its frame re-anchors both indicators', () => {
  const fixture = bootAnchoredFixture();
  const before = indicatorMargins(fixture);
  fixture.healthbars.actualyoffset = 855;
  fixture.harness.scheduler.runFor(3000);
  const after = indicatorMargins(fixture);
  assert.equal(parseFloat(before.level[1]) - parseFloat(after.level[1]), 200);
  assert.equal(parseFloat(before.ult[1]) - parseFloat(after.ult[1]), 200);
});

test('indicators stop re-anchoring when the layout keeps disagreeing', () => {
  const fixture = bootAnchoredFixture((parts) => {
    parts.levelContainer.actualyoffset = 0;
  });
  // A layout that moves the badge by its whole margin never settles.
  const panel = fixture.levelContainer;
  Object.defineProperty(panel, 'actualyoffset', {
    configurable: true,
    get: () => 910 + (Number.parseFloat(panel.style.marginTop) - 24),
  });
  fixture.harness.scheduler.runFor(10000);
  const settled = indicatorMargins(fixture);
  for (let scan = 0; scan < 3; scan += 1) {
    fixture.harness.scheduler.runFor(1000);
    assert.deepEqual(indicatorMargins(fixture), settled);
  }
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
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
  assert.equal(fixture.healthbars.style.preTransformScale2d, '1.76, 1.1');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 18.75%');
  assert.equal(fixture.healthbar.style.width, '');
  assert.equal(fixture.healthbar.style.maxWidth, '');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');

  dispatchColorSnapshot(fixture, 2, { enabled: false });
  assert.equal(fixture.infoBg.style.opacity, '');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.width, '');
  assert.equal(fixture.healthbar.style.maxWidth, '');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
});

test('v2 ignores retired ghoul opacity: a creature bar follows the normal bar settings', () => {
  const retired = { ghoulOpacityEnabled: true, ghoulOpacity: 35 };
  const fixture = makeStatusFixture(
    'enemy',
    { enabled: true, enemyColor: '#123456', ...retired },
    1,
    "|'",
    false,
    false,
    false,
    false,
    null,
    null,
    ['creature'],
  );
  assert.equal(fixture.healthbar.style.opacity, '1');
  assert.equal(fixture.infoBg.style.opacity, '1');

  dispatchColorSnapshot(fixture, 2, {
    enabled: true,
    enemyColor: '#123456',
    ghoulOpacityEnabled: true,
    ghoulOpacity: 0,
  });
  assert.equal(fixture.healthbar.style.opacity, '1');
  assert.equal(fixture.infoBg.style.opacity, '1');

  // Hiding enemy bars is still the only thing that dims a creature bar.
  dispatchColorSnapshot(fixture, 3, {
    enabled: true,
    enemyColor: '#123456',
    enemyVisible: false,
    ...retired,
  });
  assert.equal(fixture.healthbar.style.opacity, '0.01');
  assert.equal(fixture.infoBg.style.opacity, '0.01');
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
