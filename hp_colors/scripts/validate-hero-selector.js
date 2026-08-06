#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
  createPresetEntryPanel,
  installGameTimeTree,
  findByClass,
} = require('../../scripts/hp-colors-panorama-test-adapter.js');
const { HPPresetCodeCodec } = require('../../scripts/hp-colors-preset-codec.js');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_TARGET = path.join(ROOT, 'hp_colors', 'panorama', 'scripts', 'anita_ui_core.js');
const targetScript = path.resolve(process.argv[2] || DEFAULT_TARGET);
const IS_OPTIMIZED_TARGET = targetScript.split(path.sep).includes('hp_colors_closure');

let root = null;
let activeHarness = null;
let dispatched = [];
let scheduled = [];
let sharedStore = {};
let eventHandlers = {};
let mockGameState = 7;
const presetStoreLookups = { findStore: 0, scanEntries: 0 };
const MOCK_RETAIL_HERO_NAMES = Object.freeze({
  hero_inferno: "INFERNUS",
  hero_haze: "HAZE",
  hero_shiv: "SHIV",
  hero_magician: "SINCLAIR",
});

function assert(condition, message) { if (!condition) throw new Error(message); }

function syncHeroGlobals() {
  root = activeHarness.root;
  dispatched = activeHarness.dispatches;
  scheduled = activeHarness.scheduler.jobs;
  sharedStore = activeHarness.shared;
  eventHandlers = activeHarness.handlers;
}

function resetPresetStoreLookupCounters() {
  presetStoreLookups.findStore = 0;
  presetStoreLookups.scanEntries = 0;
  if (activeHarness) {
    activeHarness.findCounts.HPColorsPresetStore = 0;
    activeHarness.findCounts.hp_colors_preset_entry = 0;
  }
}

function refreshPresetStoreLookupCounters() {
  if (!activeHarness) return;
  presetStoreLookups.findStore = activeHarness.findCounts.HPColorsPresetStore || 0;
  presetStoreLookups.scanEntries = activeHarness.findCounts.hp_colors_preset_entry || 0;
}

function encodePresetStorePayload(payload) {
  return HPPresetCodeCodec.encodeBase64Url(JSON.stringify(payload));
}

function installMockPresetStore(presetsOverride) {
  root.children.filter(child => child && child.id === 'HPColorsPresetStore').forEach(child => child.DeleteAsync());
  const store = new MockPanel('HPColorsPresetStore');
  root.add(store);
  const presets = presetsOverride || [
    { id: 'HPColorsPreset_001', name: 'Main Hunt 2', category: 'Builder VPK', values: { hp_enabled: false, hp_low_threshold: 25 } },
    { id: 'HPColorsPreset_002', name: 'Shift', category: 'Builder VPK', values: { hp_enabled: true, hp_low_threshold: 45 } }
  ];
  for (const preset of presets) {
    const payload = {
      version: preset.version || 1,
      name: preset.name,
      category: preset.category,
      values: preset.values,
    };
    if (preset.overrides) payload.o = preset.overrides;
    payload.hm = preset.heroMode || (preset.heroes ? 'selected' : 'off');
    if (preset.heroes) payload.heroes = preset.heroes;
    const entry = createPresetEntryPanel(preset.id, payload);
    store.add(entry);
  }
  return store;
}

function copiedHpToken() {
  return dispatched.find(args => args[0] === 'CopyStringToClipboard' && String(args[1] || '').includes('[ANITA-v1-hp_colors]:'));
}

function runNextScheduledByDelay(delay) {
  const job = activeHarness.scheduler.runByDelay(delay);
  refreshPresetStoreLookupCounters();
  return job;
}

function runScheduledUntil(predicate, message, limit = 40) {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return;
    assert(scheduled.length > 0, message + '; no scheduled jobs left');
    scheduled.sort((a, b) => Number(a.delay || 0) - Number(b.delay || 0));
    const job = scheduled.shift();
    if (job && typeof job.handler === 'function') job.handler();
    refreshPresetStoreLookupCounters();
  }
  assert(predicate(), message + '; exhausted scheduled job limit');
}

function runScheduledJobsByDelay(delay, limit = 20) {
  for (let i = 0; i < limit; i++) {
    const index = scheduled.findIndex(job => Number(job && job.delay) === Number(delay));
    if (index < 0) return;
    const job = scheduled.splice(index, 1)[0];
    if (job && typeof job.handler === 'function') job.handler();
    refreshPresetStoreLookupCounters();
  }
}

function installMockTopbarHero(heroId) {
  const topBar = root.add(new MockPanel('TopBar'));
  const player = topBar.add(new MockPanel('TopBarPlayer0'));
  player.AddClass('LocalPlayer');
  const nameContainer = player.add(new MockPanel('PlayerNameNWContainer'));
  const nameLabel = nameContainer.add(new MockPanel('', { type: 'Label' }));
  nameLabel.AddClass('HeroName');
  player.__heroNameLabel = nameLabel;

  const addClass = player.AddClass.bind(player);
  const removeClass = player.RemoveClass.bind(player);
  let currentHero = '';
  player.AddClass = function (className) {
    addClass(className);
    if (!Object.prototype.hasOwnProperty.call(MOCK_RETAIL_HERO_NAMES, className)) return;
    currentHero = className;
    nameLabel.text = MOCK_RETAIL_HERO_NAMES[className];
  };
  player.RemoveClass = function (className) {
    removeClass(className);
    if (className !== currentHero) return;
    currentHero = '';
    nameLabel.text = '';
  };
  player.AddClass(heroId);
  return player;
}
function installMockGameTime(text) { return installGameTimeTree(activeHarness, text); }

function decodeBase64UrlPayload(encoded) {
  assert(encoded, 'Copied token missing encoded payload');
  return JSON.parse(HPPresetCodeCodec.decodeBase64Url(encoded));
}

function decodePresetToken(token) {
  return decodeBase64UrlPayload(String(token || '').split(']:')[1]);
}

function decodeCopiedBundleToken() {
  const copied = dispatched.find(args => args[0] === 'CopyStringToClipboard' &&
    /^[A-Za-z0-9_-]+$/.test(String(args[1] || '')) &&
    !String(args[1] || '').includes('[ANITA-v1-hp_colors]:'));
  assert(copied, 'No copied bundle token');
  return decodeBase64UrlPayload(copied[1]);
}


function decodedBulkUpdates() {
  return dispatched
    .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
    .map(args => {
      try { return JSON.parse(args[1]); } catch (err) { return null; }
    })
    .filter(Boolean)
    .filter(payload => payload.magic_word === 'ANITA_BULK_UPDATE');
}

function assertBakedPresetPayloadMeta(payload, label) {
  assert(payload && payload.update_source === 'baked_preset_apply', `${label} should be a baked preset payload`);
  assert(payload.force_emit === true, `${label} missing force_emit=true: ${JSON.stringify(payload)}`);
  assert(payload.bulk_emit === true, `${label} missing bulk_emit=true: ${JSON.stringify(payload)}`);
  assert(payload.force_persist === true, `${label} missing force_persist=true: ${JSON.stringify(payload)}`);
  assert(typeof payload.hero_id === 'string' && payload.hero_id.length > 0,
    `${label} missing hero_id: ${JSON.stringify(payload)}`);
  assert(typeof payload.preset_key === 'string' && payload.preset_key.length > 0,
    `${label} missing preset_key: ${JSON.stringify(payload)}`);
}

function findBakedPresetUpdate(updates, predicate, message) {
  const payload = updates.find(item => item.update_source === 'baked_preset_apply' && predicate(item));
  assert(payload, `${message}: ${JSON.stringify(updates)}`);
  assertBakedPresetPayloadMeta(payload, message);
  return payload;
}

function createMockContext(options = {}) {
  mockGameState = Object.prototype.hasOwnProperty.call(options, 'gameState') ? Number(options.gameState) : 7;
  activeHarness = createPanoramaHarness({ now: options.now || 0 });
  activeHarness.Game = { GetState: () => mockGameState };
  syncHeroGlobals();
  root.actuallayoutwidth = 1920;
  root.actuallayoutheight = 1080;
  root.contentwidth = 1920;
  root.contentheight = 1080;
  return createVmContext(activeHarness, {
    Date,
    globals: { Game: activeHarness.Game, SteamOverlayAPI: { OpenURL: () => {} } }
  });
}

function exposePresetBuilderTestHooks(source) {
  const marker = '\n  AnitaCore.init();';
  const hooks = `
  if (typeof global !== "undefined") {
    global.__hpPresetBuilderTestHooks = {
      model: HPPresetBuilderModel,
      actions: HPPresetBuilderActions,
      heroSelection: HPPresetHeroSelection,
      renderer: AnitaRenderer,
      setHeroDetectionMode: setHpHeroDetectionMode,
      detectLocalHero: detectHpLocalHero,
      constants: {
        HP_HERO_SCOPE_OFF: HP_HERO_SCOPE_OFF,
        HP_HERO_SCOPE_ALL: HP_HERO_SCOPE_ALL,
        HP_HERO_SCOPE_SELECTED: HP_HERO_SCOPE_SELECTED,
        HP_HERO_DETECTION_AUTO: HP_HERO_DETECTION_AUTO,
        HP_HERO_DETECTION_OVERRIDE: HP_HERO_DETECTION_OVERRIDE,
        HP_HERO_DETECTION_OFF: HP_HERO_DETECTION_OFF
      }
    };
  }
`;
  const instrumented = source.replace(marker, hooks + marker);
  assert(instrumented !== source, 'Preset builder test hook marker should be present');
  return instrumented;
}

function exposePipConvarTestHooks(source) {
  const marker = '\n  AnitaCore.init();';
  const hooks = `
  if (typeof global !== "undefined") {
    global.__hpColorsPipConvarTestHooks = {
      core: AnitaCore,
      persistence: AnitaPersistence,
      settingsContract: HPSettingsContract
    };
  }
`;
  const instrumented = source.replace(marker, hooks + marker);
  assert(instrumented !== source, 'Pip convar test hook marker should be present');
  return instrumented;
}

function exposeConditionalEditorTestHooks(source) {
  const marker = '\n  AnitaCore.init();';
  const hooks = `
  if (typeof global !== "undefined") {
    global.__hpColorsConditionalEditorTestHooks = {
      conditional: HPSignatureConditionalController,
      renderer: AnitaRenderer,
      maxTierConfirmMs: HP_SIGNATURE_MAX_TIER_CONFIRM_MS
    };
  }
`;
  const instrumented = source.replace(marker, hooks + marker);
  assert(instrumented !== source, 'Conditional editor test hook marker should be present');
  return instrumented;
}

function createPresetBuilderVm(source) {
  const context = createMockContext();
  runInVm(exposePresetBuilderTestHooks(source), context, targetScript);
  assert(context.__hpPresetBuilderTestHooks, 'Preset builder VM hooks were not exposed');
  return { context, hooks: context.__hpPresetBuilderTestHooks };
}

function makePresetBuilderConfig(overrides = {}) {
  const config = {
    title: 'HP Colors',
    description: 'preset builder behavior validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 },
      { id: 'hp_kill_zone_enabled', type: 'toggle', defaultValue: false, currentValue: false, category: 'Effects' }
    ]
  };
  return Object.assign(config, overrides);
}

function runValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  assert(source.includes('HP_COLORS_PRESET_REQUEST'),
    'anita_ui_core.js must answer the static HP Colors preset request bridge used by fresh healthbar overlays');
  assert(source.includes('HP_COLORS_PRESET_SNAPSHOT') && source.includes('values_raw'),
    'anita_ui_core.js must publish replayable HP Colors preset snapshots with values_raw');
  assert(source.includes('__hpColorsMatchReset') && !source.includes('__hpColorsMatchResetStatus') && !source.includes('monitor_started'),
    'anita_ui_core.js must start match-reset publishing outside the scoped hero preset watcher');
  const isOptimizedTarget = IS_OPTIMIZED_TARGET;
  if (!isOptimizedTarget) {
    assert(source.includes('resolveSelectionFromEntries: function'),
      'HPPresetHeroSelection must expose resolveSelectionFromEntries as the pure preset/hero policy seam');
    assert(/selectForHero:\s*function[\s\S]*resolveSelectionFromEntries\(/.test(source),
      'HPPresetHeroSelection.selectForHero must delegate to resolveSelectionFromEntries');
    assert(source.includes('buildPresetSnapshotPayload: function ('),
      'anita_ui_core.js must build HP Colors preset snapshots through HPBridgeProtocol');
    assert(source.includes('HPPresetSnapshotPublisher.publish(') &&
        source.includes('HPBridgeProtocol.buildPresetSnapshotPayload('),
      'HPPresetSnapshotPublisher must own HPBridgeProtocol snapshot publication');
    assert(source.includes('"effective_values"'),
      'HP Colors snapshots must publish effective_values separately from base values');
    assert(source.includes('HPBridgeProtocol.dispatchRawPayload(this.payload)'),
      'snapshot publisher replay must dispatch its retained payload');
    [
      'const AnitaMouseRouter =',
      'const HPSignatureConditionalController =',
      'replaceRules: function (config, rawRules)',
      'clearRules: function (config, elementsOrNull)',
      'openEditor: function (config, element)',
      'decorateRow: function (config, element, row)',
      'getEffectiveValues: function (config)',
      'notifyBaseValuesChanged: function (config, publish)',
      'HPSignatureConditionalController.start(config)',
    ].forEach(marker => assert(source.includes(marker),
      `signature conditional controller missing marker: ${marker}`));
    assert(!source.includes('HPSignatureTierDebug'),
      'legacy signature debug controller must not remain in production');
    [
      "const HPPresetBuilderModel = {",
      "buildPresetBuilderViewModel: function",
      "ensureSelectedPresetKey: function",
      "getDefaultSelectedPresetKey: function",
      "const HPPresetBuilderActions = {",
      "applyPresetRow: function",
      "setRowHeroScope: function"
    ].forEach(marker => assert(source.includes(marker),
      `anita_ui_core.js missing Preset builder model/action marker: ${marker}`));
    assert(/renderPresetBuilderPanel:\s*function\s*\(parent,\s*config\)[\s\S]*HPPresetBuilderModel\.buildPresetBuilderViewModel\(config\)/.test(source),
      "renderPresetBuilderPanel must build its row state through HPPresetBuilderModel.buildPresetBuilderViewModel(config)");
    assert(!/renderPresetBuilderPanel:\s*function\s*\(parent,\s*config\)[\s\S]*var\s+defaultPresetKey\s*=\s*""/.test(source),
      "renderPresetBuilderPanel must not keep local defaultPresetKey selection repair");
  }
  const context = createMockContext();
  runInVm(source, context, targetScript);
  installMockPresetStore();

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register was not exposed');
  const validationConfig = {
    title: 'HP Colors',
    description: 'hero selector validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', label: 'Enable enemy HP colors', defaultValue: true, currentValue: true, category: 'GENERAL|Core Behavior' },
      { id: 'hp_mode', type: 'cycler', label: 'Enemy color behavior', options: ['Fixed', 'Gradient'], defaultValue: 1, currentValue: 1, category: 'GENERAL|Core Behavior' },
      { id: 'hp_low_threshold', type: 'slider', label: 'Low HP starts at %', defaultValue: 35, currentValue: 35, category: 'GENERAL|Core Behavior', min: 0, max: 100, step: 1 },
      { id: 'hp_ult_color_enabled', type: 'toggle', label: 'Color ult icon', defaultValue: true, currentValue: true, category: 'HEALTH BARS|Enemy Colors' },
      { id: 'hp_friend_enabled', type: 'toggle', label: 'Color ally HP bars', defaultValue: false, currentValue: false, category: 'HEALTH BARS|Ally Colors' },
      { id: 'hp_pulse_enabled', type: 'toggle', label: 'Pulse at low HP', defaultValue: true, currentValue: true, category: 'VISUAL EFFECTS|Low HP Pulse' },
      { id: 'hp_pulse_threshold', type: 'slider', label: 'Pulse starts below %', defaultValue: 25, currentValue: 25, category: 'VISUAL EFFECTS|Low HP Pulse', min: 0, max: 100, step: 1, visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_kill_zone_enabled', type: 'toggle', label: 'Show kill marker', defaultValue: false, currentValue: false, category: 'VISUAL EFFECTS|Kill Marker' }
    ]
  };
  const codecOptions = {
    aliasToId: { e: 'hp_enabled', l: 'hp_low_threshold', kzs: 'hp_kill_zone_color' },
    allowedIds: ['hp_enabled', 'hp_low_threshold', 'hp_kill_zone_color'],
    heroById: { hero_inferno: true, hero_gigawatt: true },
    heroIdToKey: { 1: 'hero_inferno', 2: 'hero_gigawatt' }
  };
  const semanticToken = HPPresetCodeCodec.encodePresetToken(
    validationConfig,
    { e: true },
    { name: 'Semantic', heroMode: 'selected', heroes: ['1', '2', 'hero_inferno'], heroById: codecOptions.heroById, heroIdToKey: codecOptions.heroIdToKey }
  );
  const semanticPayload = decodePresetToken(semanticToken);
  assert(semanticPayload.v === 99 && semanticPayload.c === 1 && semanticPayload.values.e === true &&
      semanticPayload.hm === 'selected' && semanticPayload.hs.length === 2 && semanticPayload.name === 'Semantic',
    `Single preset token shape drifted: ${JSON.stringify(semanticPayload)}`);
  const fullAndAlias = HPPresetCodeCodec.decodePresetToken(validationConfig, `[ANITA-v1-hp_colors]:${encodePresetStorePayload({ v: 97, c: 1, values: { hp_enabled: false, e: true } })}`, codecOptions);
  assert(fullAndAlias.values.hp_enabled === true && Object.keys(fullAndAlias.values).length === 1,
    'Import should accept full ids and compact aliases in compact payloads');
  const legacyKillZone = HPPresetCodeCodec.decodePresetToken(validationConfig, `[ANITA-v1-hp_colors]:${encodePresetStorePayload({ version: 1, values: { kzs: '#112233' } })}`, codecOptions);
  assert(legacyKillZone.values.hp_kill_zone_color === '#112233' && Object.keys(legacyKillZone.values).length === 1,
    'Import should accept legacy kzs kill-zone alias');
  const mixedUnknown = HPPresetCodeCodec.decodePresetToken(validationConfig, `[ANITA-v1-hp_colors]:${encodePresetStorePayload({ v: 97, values: { bogus: 1, l: 44 } })}`, codecOptions);
  assert(mixedUnknown.values.hp_low_threshold === 44 && Object.keys(mixedUnknown.values).length === 1, 'Import should skip unknown values but keep recognized ids');
  const allUnknown = HPPresetCodeCodec.decodePresetToken(validationConfig, `[ANITA-v1-hp_colors]:${encodePresetStorePayload({ v: 97, values: { bogus: 1 } })}`, codecOptions);
  assert(allUnknown && Object.keys(allUnknown.values).length === 0, 'All-unknown values should decode to an empty recognized value set for No IDs UI status');
  assert(!HPPresetCodeCodec.decodePresetToken(validationConfig, `[ANITA-v1-hp_colors]:${encodePresetStorePayload({ v: 2, values: { e: true } })}`, codecOptions),
    'Unsupported preset versions should be invalid');
  assert(!HPPresetCodeCodec.decodePresetToken(validationConfig, '[ANITA-v1-hp_colors]:bad=chars', codecOptions),
    'Malformed Base64URL should be invalid');
  const bundle = HPPresetCodeCodec.encodePresetBundle({ storageVersion: 97, heroById: codecOptions.heroById, heroIdToKey: codecOptions.heroIdToKey }, [
    { name: 'Off', payloadValues: { e: true }, heroMode: 'off' },
    { name: 'All', payloadValues: { l: 55 }, heroMode: 'all' },
    { name: 'Selected', payloadValues: { e: false }, heroMode: 'selected', heroes: ['1', '2'] }
  ]);
  const bundleScopes = decodeBase64UrlPayload(bundle).p.map(tuple => tuple[2]);
  assert(bundleScopes[0] === 'off' && bundleScopes[1] === 'all' &&
      Array.isArray(bundleScopes[2]) && bundleScopes[2][0] === 'hero_inferno' && bundleScopes[2][1] === 'hero_gigawatt',
    'COPY ALL bundle should preserve off/all/selected tuple semantics');
  root.AnitaUI.Register(validationConfig);
  runNextScheduledByDelay(0.25);
  assert(sharedStore.__hpColorsMatchReset &&
      sharedStore.__hpColorsMatchReset.reason === 'game_state_active',
    `Independent match monitor did not publish an active-match reset token: ${JSON.stringify(sharedStore.__hpColorsMatchReset || null)}`);
  dispatched.length = 0;
  assert(typeof eventHandlers.ClientUI_FireOutput === 'function',
    'Anita UI did not register a ClientUI_FireOutput bridge listener');
  eventHandlers.ClientUI_FireOutput(JSON.stringify({
    magic_word: 'ANITA_UPDATE',
    mod_title: 'HP Colors',
    setting_id: 'hp_pulse_enabled',
    value: true
  }));
  eventHandlers.ClientUI_FireOutput(JSON.stringify({
    magic_word: 'HP_COLORS_PRESET_REQUEST',
    mod_title: 'HP Colors',
    reason: 'validator'
  }));
  const presetSnapshot = dispatched
    .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
    .map(args => {
      try { return JSON.parse(args[1]); } catch (err) { return null; }
    })
    .find(payload => payload && payload.magic_word === 'HP_COLORS_PRESET_SNAPSHOT');
  assert(presetSnapshot && presetSnapshot.values_raw && presetSnapshot.values &&
      presetSnapshot.values.hp_low_threshold === 35,
    `Preset request bridge did not publish replayable HP Colors values: ${JSON.stringify(dispatched)}`);
  dispatched.length = 0;
  runNextScheduledByDelay(1.0);
  const replayedPresetSnapshot = dispatched
    .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
    .map(args => {
      try { return JSON.parse(args[1]); } catch (err) { return null; }
    })
    .find(payload => payload && payload.magic_word === 'HP_COLORS_PRESET_SNAPSHOT');
  assert(replayedPresetSnapshot && replayedPresetSnapshot.values_raw,
    `HP Colors must continuously replay cached preset snapshots for late-created healthbar contexts: ${JSON.stringify(dispatched)}`);

  const tabs = findByClass(root, 'AnitaTabBtn');
  assert(tabs.length >= 1, 'No Anita tab button rendered');
  assert(tabs[tabs.length - 1].events.onactivate, 'HP Colors tab missing activate handler');
  tabs[tabs.length - 1].events.onactivate();
  const hpModeElement = validationConfig.elements.find(element => element.id === 'hp_mode');
  const hpPulseEnabledElement = validationConfig.elements.find(element => element.id === 'hp_pulse_enabled');
  const hpPulseThresholdElement = validationConfig.elements.find(element => element.id === 'hp_pulse_threshold');
  assert(hpModeElement.currentValue === 1 && !hpModeElement.runtimeLocked && !hpModeElement.__anitaRowPanel.BHasClass('AnitaRuntimeLocked'),
    'HP Colors should leave hp_mode interactive so Fixed/Gradient can be changed');
  assert(hpPulseEnabledElement.currentValue === true && !hpPulseEnabledElement.runtimeLocked,
    'HP Colors should leave non-General feature toggles interactive');
  assert(!hpPulseThresholdElement.runtimeHidden,
    'HP Colors should let enabled feature toggles show their customization controls');

  function activateCategory(mainText, subText) {
    const mainBtn = findByClass(root, 'AnitaMainCategoryBtn')
      .find(button => button.children.some(child => child.text === mainText));
    assert(mainBtn && mainBtn.events.onactivate, `Missing main category button: ${mainText}`);
    mainBtn.events.onactivate();
    if (!subText) return;
    const subBtn = findByClass(root, 'AnitaSubCategoryBtn')
      .find(button => button.children.some(child => child.text === subText));
    assert(subBtn && subBtn.events.onactivate, `Missing subcategory button: ${mainText}|${subText}`);
    subBtn.events.onactivate();
  }

  function clickToggleSetting(id, mainText, subText) {
    activateCategory(mainText, subText);
    const element = validationConfig.elements.find(item => item.id === id);
    assert(element && element.__anitaRowPanel && element.__anitaRowPanel.IsValid && element.__anitaRowPanel.IsValid(),
      `Toggle row did not render for ${id}`);
    assert(!element.runtimeLocked && !element.__anitaRowPanel.BHasClass('AnitaRuntimeLocked'),
      `Toggle should not be runtime-locked: ${id}`);
    const btn = findByClass(element.__anitaRowPanel, 'AnitaToggleBtn')[0];
    const label = findByClass(element.__anitaRowPanel, 'AnitaLabel')[0];
    const box = findByClass(element.__anitaRowPanel, 'AnitaCheckBox')[0];
    assert(btn && btn.events.onactivate, `Toggle button missing activation handler: ${id}`);
    assert(btn.hittest === true && btn.hittestchildren === false && String(btn.style.zIndex || '') === '4',
      `Toggle button should own the row hit target: ${id}`);
    assert(label && label.hittest === false && box && box.hittest === false,
      `Toggle visual children should not block clicks: ${id}`);
    const before = element.currentValue;
    dispatched.length = 0;
    btn.events.onactivate();
    assert(element.currentValue === !before,
      `Toggle did not change value for ${id}: ${before} -> ${element.currentValue}`);
    const update = dispatched
      .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
      .map(args => {
        try { return JSON.parse(args[1]); } catch (err) { return null; }
      })
      .find(payload => payload && payload.magic_word === 'ANITA_UPDATE' && payload.setting_id === id);
    assert(update && update.value === element.currentValue,
      `Toggle did not emit ANITA_UPDATE for ${id}: ${JSON.stringify(dispatched)}`);
    return update;
  }

  const liveUltToggleUpdate = clickToggleSetting('hp_ult_color_enabled', 'HEALTH BARS', 'Enemy Colors');
  eventHandlers.ClientUI_FireOutput(JSON.stringify(liveUltToggleUpdate));
  const liveUltSnapshot = JSON.parse(sharedStore.__hpColorsCfgRaw || '{}');
  assert(liveUltSnapshot.hp_ult_color_enabled ===
      validationConfig.elements.find(element => element.id === 'hp_ult_color_enabled').currentValue,
    `Live toggle did not refresh the shared runtime snapshot: ${JSON.stringify(liveUltSnapshot)}`);
  clickToggleSetting('hp_friend_enabled', 'HEALTH BARS', 'Ally Colors');
  clickToggleSetting('hp_pulse_enabled', 'VISUAL EFFECTS', 'Low HP Pulse');
  clickToggleSetting('hp_kill_zone_enabled', 'VISUAL EFFECTS', 'Kill Marker');

  const presetButtons = findByClass(root, 'AnitaFooterBtnPreset');
  const presetBtn = presetButtons[presetButtons.length - 1];
  assert(presetBtn && presetBtn.events.onactivate, 'Preset footer button missing activate handler');
  presetBtn.events.onactivate();

  const presetImportBtn = findByClass(root, 'AnitaPresetImportBtn')[0];
  assert(presetImportBtn && presetImportBtn.events.onactivate, 'Preset Builder IMPORT button missing activate handler');
  presetImportBtn.events.onactivate();
  let importPopup = findByClass(root, 'AnitaImportPopup')[0];
  assert(importPopup && importPopup.IsValid && importPopup.IsValid(),
    'Preset Builder IMPORT should open the paste-code import popup, not apply the selected row');
  const pasteInput = findByClass(importPopup, 'AnitaPasteInput')[0];
  assert(pasteInput && /custom/i.test(String(pasteInput.placeholder || '')),
    `Preset import popup should clearly accept custom pasted codes: ${pasteInput && pasteInput.placeholder}`);
  const importCloseLabel = findByClass(importPopup, 'AnitaImportCloseLabel')[0];
  assert(importCloseLabel && importCloseLabel.text === 'X',
    `Preset import popup close button should render minimalist X label: ${importCloseLabel && importCloseLabel.text}`);
  pasteInput.text = encodePresetStorePayload({
    name: 'Pasted Custom',
    version: 1,
    hm: 'selected',
    hs: ['hero_inferno'],
    values: {
      hp_enabled: false,
      hp_low_threshold: 59
    }
  });
  const importApplyBtn = findByClass(importPopup, 'AnitaImportApplyBtn')[0];
  assert(importApplyBtn && importApplyBtn.events.onactivate, 'Preset import popup missing Apply handler');
  const importApplyLabel = findByClass(importApplyBtn, 'AnitaImportApplyLabel')[0];
  assert(importApplyLabel && importApplyLabel.text === 'IMPORT',
    `Preset import popup apply button should render IMPORT label: ${importApplyLabel && importApplyLabel.text}`);
  importApplyBtn.events.onactivate();
  assert(validationConfig.elements.find(element => element.id === 'hp_enabled').currentValue === true &&
      validationConfig.elements.find(element => element.id === 'hp_low_threshold').currentValue === 35,
    'Preset import popup should save pasted custom codes without applying them to current HP Colors settings');
  assert(findByClass(root, 'AnitaPresetRowName').some(label => label.text === 'Import 1'),
    'Preset import popup should create a saved preset row named Import 1');
  const importedPresetRow = validationConfig.__anitaUserPresetRows && validationConfig.__anitaUserPresetRows[0];
  assert(importedPresetRow && importedPresetRow.heroMode === 'selected' &&
      Array.isArray(importedPresetRow.heroes) && importedPresetRow.heroes.includes('hero_inferno'),
    `Preset import popup should preserve pasted hero scope: ${JSON.stringify(importedPresetRow)}`);

  const headerActionButtons = findByClass(root, 'AnitaHeaderActionBtn');
  const pageResetBtn = headerActionButtons.find(button => button.children.some(child => child.text === 'Page'));
  const allResetBtn = headerActionButtons.find(button => button.children.some(child => child.text === 'All'));
  assert(pageResetBtn && pageResetBtn.events.onmouseover && pageResetBtn.events.onmouseout,
    'PAGE reset button should expose a dumb-friendly tooltip');
  assert(allResetBtn && allResetBtn.events.onmouseover && allResetBtn.events.onmouseout,
    'ALL reset button should expose a dumb-friendly tooltip');
  pageResetBtn.events.onmouseover();
  let resetTooltip = findByClass(root, 'AnitaPresetLocalTooltip')[0];
  let resetTooltipLabel = resetTooltip ? findByClass(resetTooltip, 'AnitaPresetLocalTooltipLabel')[0] : null;
  assert(resetTooltipLabel && /PAGE reset does nothing here/i.test(String(resetTooltipLabel.text || '')),
    `PAGE reset tooltip should explain current-page scope plainly: ${resetTooltipLabel && resetTooltipLabel.text}`);
  pageResetBtn.events.onmouseout();
  allResetBtn.events.onmouseover();
  resetTooltipLabel = resetTooltip ? findByClass(resetTooltip, 'AnitaPresetLocalTooltipLabel')[0] : null;
  assert(resetTooltipLabel && /ALL resets HP settings/i.test(String(resetTooltipLabel.text || '')) &&
      /Saved presets stay/i.test(String(resetTooltipLabel.text || '')),
    `ALL reset tooltip should explain that saved presets survive reset: ${resetTooltipLabel && resetTooltipLabel.text}`);
  allResetBtn.events.onmouseout();

  assert(allResetBtn.events.onactivate, 'ALL reset button missing activate handler');
  allResetBtn.events.onactivate();
  assert(findByClass(root, 'AnitaPresetRowName').some(label => label.text === 'Import 1'),
    'ALL reset should not remove imported or saved preset rows');

  const presetNameLabel = findByClass(root, 'AnitaPresetNameLabel')[0];
  const presetNameInput = findByClass(root, 'AnitaPresetNameInput')[0];
  const presetAddBtn = findByClass(root, 'AnitaPresetAddBtn')[0];
  const presetAddHint = findByClass(root, 'AnitaPresetCreateHint')[0];
  const presetAddLabel = presetAddBtn ? findByClass(presetAddBtn, 'AnitaPresetAddLabel')[0] : null;
  assert(presetNameLabel && /preset name/i.test(String(presetNameLabel.text || '')),
    `Preset name input should have a visible label above it: ${presetNameLabel && presetNameLabel.text}`);
  assert(presetNameInput && /current settings/i.test(String(presetNameInput.placeholder || '')),
    `Preset name input should explain it names a current-settings preset: ${presetNameInput && presetNameInput.placeholder}`);
  assert(presetAddLabel && presetAddLabel.text === 'SAVE CURRENT',
    `Preset add button should say SAVE CURRENT: ${presetAddLabel && presetAddLabel.text}`);
  assert(presetAddHint && /current live HP settings/i.test(String(presetAddHint.text || '')),
    `Preset create row should explain SAVE CURRENT: ${presetAddHint && presetAddHint.text}`);
  assert(presetAddHint && /click a preset name to rename/i.test(String(presetAddHint.text || '')),
    `Preset create row should explain rename-by-click: ${presetAddHint && presetAddHint.text}`);
  assert(presetImportBtn.events.onmouseover && presetImportBtn.events.onmouseout,
    'Preset import button should expose a tooltip for discoverability');
  dispatched.length = 0;
  presetImportBtn.events.onmouseover();
  let localTooltip = findByClass(root, 'AnitaPresetLocalTooltip')[0];
  let localTooltipLabel = localTooltip ? findByClass(localTooltip, 'AnitaPresetLocalTooltipLabel')[0] : null;
  assert(localTooltip && localTooltip.style && localTooltip.style.zIndex === '10090',
    'Preset tooltip should render in the local Anita tooltip layer above menus');
  assert(localTooltipLabel && /custom preset code/i.test(String(localTooltipLabel.text || '')),
    `Preset tooltip should show the hovered action text: ${localTooltipLabel && localTooltipLabel.text}`);
  assert(!dispatched.some(args => args[0] === 'UIShowTextTooltip'),
    'Preset tooltips should not use the engine tooltip layer because it can render behind Anita menus');
  presetImportBtn.events.onmouseout();
  assert(localTooltip.style.opacity === '0',
    'Preset tooltip should hide on mouseout');
  assert(presetAddBtn.events.onmouseover && presetAddBtn.events.onmouseout,
    'Save current button should expose a tooltip for discoverability');
  presetAddBtn.events.onmouseover();
  assert(localTooltip.style.opacity === '1',
    'Preset tooltip should show before closing Anita UI');
  const closeBtn = findByClass(root, 'AnitaCloseBtn')[0];
  assert(closeBtn && closeBtn.events.onactivate,
    'Anita close button missing activate handler');
  closeBtn.events.onactivate();
  assert(localTooltip.style.opacity === '0',
    'Preset tooltip should hide when Anita UI is closed');

  function openHeroMenu(button) {
    assert(button && button.events.onactivate, 'Hero picker button missing activate handler');
    button.events.onactivate();
    const menu = button.__anitaHeroMenu;
    assert(menu && menu.IsValid && menu.IsValid(), 'Hero picker did not open a custom menu');
    return menu;
  }

  function findHeroMenuOption(menu, heroId) {
    return findByClass(menu, 'AnitaPresetHeroMenuOption')
      .find(option => option.GetAttributeString('anita_hero_kind', '') === 'hero' &&
        option.GetAttributeString('anita_hero_id', '') === String(heroId || ''));
  }

  function findHeroScopeOption(menu, kind) {
    return findByClass(menu, 'AnitaPresetHeroMenuOption')
      .find(option => option.GetAttributeString('anita_hero_kind', '') === kind &&
        option.GetAttributeString('anita_hero_id', '') === '');
  }

  function chooseHeroScope(button, kind, heroId) {
    const menu = button.__anitaHeroMenu && button.__anitaHeroMenu.IsValid && button.__anitaHeroMenu.IsValid()
      ? button.__anitaHeroMenu
      : openHeroMenu(button);
    const option = kind === 'hero' ? findHeroMenuOption(menu, heroId) : findHeroScopeOption(menu, kind);
    assert(option && option.events.onactivate, `Hero picker menu missing option: ${heroId || kind}`);
    option.events.onactivate();
    return option;
  }

  function chooseHero(button, heroId) {
    return chooseHeroScope(button, 'hero', heroId);
  }

  const heroPicker = findByClass(root, 'AnitaPresetHeroPickerBtn')[0];
  assert(heroPicker, 'No custom hero picker button rendered');
  assert(findByClass(root, 'AnitaPresetHeroDropDown').length === 0,
    'Hero picker should not use native DropDown/CitadelSettingsEnumDropDown panels');
  const firstRowPanel = findByClass(root, 'AnitaPresetRow')[0];
  assert(firstRowPanel && firstRowPanel.hittest === true && firstRowPanel.hittestchildren === true,
    'Preset row must allow child hero picker input');
  const firstTextCol = findByClass(root, 'AnitaPresetRowText')[0];
  assert(firstTextCol && firstTextCol.hittest === true && firstTextCol.hittestchildren === true,
    'Preset row text column hit flags changed unexpectedly');
  const firstHeroSelector = findByClass(root, 'AnitaPresetHeroSelector')[0];
  assert(firstHeroSelector && firstHeroSelector.hittest === true && firstHeroSelector.hittestchildren === true,
    'Hero selector wrapper must allow picker input');
  assert(firstRowPanel.events.onactivate,
    'Preset row must select/apply when the non-control row area is clicked');
  assert(firstHeroSelector.events.onactivate,
    'Preset hero summary area must select/apply the row when clicked outside the dropdown');
  let heroSummary = findByClass(root, 'AnitaPresetHeroSummary')[0];
  assert(heroSummary && heroSummary.text === 'Hero select off',
    `Hero summary label should start with hero selection off: ${heroSummary && heroSummary.text}`);
  const heroFace = findByClass(root, 'AnitaPresetHeroDropDownFace')[0];
  assert(heroFace && heroFace.hittest === false && heroFace.hittestchildren === false,
    'Hero picker face must not capture input');
  const heroFaceLabel = findByClass(heroFace, 'AnitaPresetHeroDropDownFaceLabel')[0];
  assert(heroFaceLabel && heroFaceLabel.text === 'Off',
    `Hero picker face label missing: ${heroFaceLabel && heroFaceLabel.text}`);
  const heroFaceIcon = findByClass(heroFace, 'AnitaPresetHeroDropDownFaceIcon')[0];
  assert(heroFaceIcon && !heroFaceIcon.classes.has('Visible'),
    'Hero picker face icon should stay hidden for count-only display');
  assert(heroPicker.hittest === true, 'Hero picker hittest is not enabled');
  assert(heroPicker.hittestchildren === false, 'Hero picker children should not capture input');
  assert(heroPicker.canfocus === true, 'Hero picker focus is not enabled');
  assert(heroPicker.events.onactivate, 'Hero picker missing activate handler');

  let menu = openHeroMenu(heroPicker);
  const menuHost = menu.GetParent && menu.GetParent();
  assert(menuHost && menuHost.BHasClass && menuHost.BHasClass('AnitaPopupHost'),
    'Hero picker menu must open in AnitaPopupHost so fixed-height preset rows cannot clip it');
  assert(menu.style && menu.style.position && menu.style.opacity === '1',
    'Hero picker menu must be explicitly positioned and visible when opened');
  let options = findByClass(menu, 'AnitaPresetHeroMenuOption');
  assert(options.length > 3, 'Hero picker menu did not render options');
  assert(options[0].GetAttributeString('anita_hero_kind', '') === 'off',
    'Hero picker menu first option should disable hero targeting');
  assert(options[1].GetAttributeString('anita_hero_kind', '') === 'all',
    'Hero picker menu second option should target all heroes');
  assert(options[2].GetAttributeString('anita_hero_kind', '') === 'hero',
    'Hero picker menu should list heroes after scope controls');
  assert(options.filter(option => option.GetAttributeString('anita_hero_kind', '') === 'off').length === 1,
    'Hero picker menu should render exactly one off option');
  assert(options.filter(option => option.GetAttributeString('anita_hero_kind', '') === 'all').length === 1,
    'Hero picker menu should render exactly one all-heroes option');
  let firstHeroOption = findHeroMenuOption(menu, 'hero_inferno');
  assert(firstHeroOption, 'Hero picker menu missing Infernus option');
  assert(firstHeroOption.type === 'Button', `Hero menu option should be a Button: ${firstHeroOption.type}`);
  assert(firstHeroOption.hittest === true && firstHeroOption.hittestchildren === false,
    'Hero menu option should own its click without child input routing');
  const offHeroOption = findHeroScopeOption(menu, 'off');
  assert(offHeroOption && findByClass(offHeroOption, 'AnitaPresetHeroMenuOptionIconAll').length === 1,
    'Hero picker off option should have a compact left icon slot');
  const allHeroOption = findHeroScopeOption(menu, 'all');
  assert(allHeroOption && findByClass(allHeroOption, 'AnitaPresetHeroMenuOptionIconAll').length === 1,
    'Hero picker all option should have a compact left icon slot');
  const firstHeroIconSlot = findByClass(firstHeroOption, 'AnitaPresetHeroMenuOptionIcon')[0];
  assert(firstHeroIconSlot, 'Hero picker menu option missing left icon slot');
  assert(String(firstHeroIconSlot.style.backgroundImage || '') === 'none',
    `Hero picker icon frame should not carry the hero texture: ${firstHeroIconSlot.style.backgroundImage || ''}`);
  assert(!firstHeroIconSlot.classes.has('AnitaPresetHeroIconFallback'),
    'Hero picker icon slot should not use a framed fallback box');
  const firstHeroIconImage = findByClass(firstHeroIconSlot, 'AnitaPresetHeroMenuOptionHeroIcon')[0];
  assert(firstHeroIconImage &&
      firstHeroIconImage.style.width === '22px' &&
      firstHeroIconImage.style.height === '22px' &&
      firstHeroIconImage.style.minWidth === '22px' &&
      firstHeroIconImage.style.maxWidth === '22px' &&
      firstHeroIconImage.style.backgroundSize === '100% 100%' &&
      firstHeroIconImage.style.backgroundTextureSize === '22px 22px',
    `Hero picker icon image missing inline fixed sizing: ${JSON.stringify(firstHeroIconImage && firstHeroIconImage.style || {})}`);
  assert(firstHeroIconImage && String(firstHeroIconImage.style.backgroundImage || '') === 'none',
    `Hero picker icon image should wait for post-layout settle before loading texture: ${firstHeroIconImage && firstHeroIconImage.style.backgroundImage || ''}`);
  runNextScheduledByDelay(0.03);
  assert(firstHeroIconImage && String(firstHeroIconImage.style.backgroundImage || '').includes('s2r://panorama/images/heroes/inferno_mm_psd.vtex'),
    `Hero picker menu option missing fixed-size in-game icon image: ${firstHeroIconImage && firstHeroIconImage.style.backgroundImage || ''}`);

  chooseHeroScope(heroPicker, 'off');
  assert(heroSummary.text === 'Hero select off',
    `Hero summary label did not update after disabling scope: ${heroSummary.text}`);
  assert(heroFaceLabel.text === 'Off',
    `Hero picker face label did not update to off mode: ${heroFaceLabel.text}`);
  dispatched.length = 0;
  const copyBtn = findByClass(root, 'AnitaPresetCopyBtn')[0];
  assert(copyBtn && copyBtn.events.onactivate, 'Copy button missing activate handler');
  copyBtn.events.onactivate();
  let copied = copiedHpToken();
  assert(copied, 'No off-scope preset token copied');
  let payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'off' && !payload.hs,
    `Off-scope token should include hm=off and no hs: ${JSON.stringify(payload)}`);

  chooseHeroScope(heroPicker, 'all');
  assert(heroSummary.text === 'All heroes',
    `Hero summary label did not update after all-heroes scope: ${heroSummary.text}`);
  assert(heroFaceLabel.text === 'All heroes',
    `Hero picker face label did not update to all-heroes mode: ${heroFaceLabel.text}`);
  dispatched.length = 0;
  copyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No all-heroes preset token copied');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'all' && !payload.hs,
    `All-heroes token should include hm=all and no hs: ${JSON.stringify(payload)}`);

  chooseHero(heroPicker, 'hero_inferno');
  assert(findHeroMenuOption(heroPicker.__anitaHeroMenu, 'hero_inferno') === firstHeroOption,
    'Hero picker should update existing menu option panels instead of rebuilding all heroes on selection');

  assert(heroSummary.text === '1 hero selected',
    `Hero summary label did not update after selection: ${heroSummary.text}`);
  const firstHeroCheck = firstHeroOption.__anitaHeroCheckLabel;
  assert(firstHeroCheck && firstHeroCheck.text === '\u2713',
    `Selected hero marker should be a compact checkmark, got: ${firstHeroCheck && firstHeroCheck.text}`);
  assert(heroFaceLabel.text === '1 hero',
    `Hero picker face label did not update to selected count: ${heroFaceLabel.text}`);
  assert(!heroFaceIcon.classes.has('Visible') && String(heroFaceIcon.style.backgroundImage || '') === 'none',
    'Hero picker face icon should stay hidden for count-only display');

  const secondHeroOption = findHeroMenuOption(heroPicker.__anitaHeroMenu, 'hero_gigawatt');
  assert(secondHeroOption, 'Hero picker menu missing Seven option');
  chooseHero(heroPicker, 'hero_gigawatt');
  assert(heroSummary.text === '2 heroes selected',
    `Hero summary label did not update after adding a second hero: ${heroSummary.text}`);
  assert(heroFaceLabel.text === '2 heroes',
    `Hero picker face label did not update to multi-hero count: ${heroFaceLabel.text}`);
  options = findByClass(heroPicker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption');
  firstHeroOption = options.find(option => option.GetAttributeString('anita_hero_id', '') === 'hero_inferno');
  const selectedSecondHeroOption = options.find(option => option.GetAttributeString('anita_hero_id', '') === 'hero_gigawatt');
  assert(firstHeroOption && firstHeroOption.classes.has('Selected'),
    'Selected Infernus option missing highlight');
  assert(selectedSecondHeroOption && selectedSecondHeroOption.classes.has('Selected'),
    'Selected Seven option missing highlight');

  dispatched.length = 0;
  copyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No scoped preset token copied');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'selected' && Array.isArray(payload.hs) && payload.hs.includes('hero_inferno') && payload.hs.includes('hero_gigawatt'),
    `Copied scoped token missing multi-hero targets: ${JSON.stringify(payload)}`);

  let allPickers = findByClass(root, 'AnitaPresetHeroPickerBtn');
  let allCopyButtons = findByClass(root, 'AnitaPresetCopyBtn');
  assert(allPickers.length >= 2, `Expected at least two preset hero pickers, found ${allPickers.length}`);
  assert(allCopyButtons.length >= 2, `Expected at least two preset copy buttons, found ${allCopyButtons.length}`);
  const secondPicker = allPickers[1];
  openHeroMenu(secondPicker);
  const secondRowHeroOption = findHeroMenuOption(secondPicker.__anitaHeroMenu, 'hero_haze');
  assert(secondRowHeroOption, 'Second preset row missing Haze option');
  chooseHero(secondPicker, 'hero_haze');
  let secondHeroSummary = findByClass(root, 'AnitaPresetHeroSummary')[1];
  assert(secondHeroSummary && secondHeroSummary.text === '1 hero selected',
    `Second preset row summary label did not update independently: ${secondHeroSummary && secondHeroSummary.text}`);
  dispatched.length = 0;
  allCopyButtons[1].events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No second-row scoped preset token copied');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'selected' && Array.isArray(payload.hs) && payload.hs.length === 1 && payload.hs[0] === 'hero_haze',
    `Second row copied token should only target Haze: ${JSON.stringify(payload)}`);
  dispatched.length = 0;
  copyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No first-row scoped preset token copied after second-row edit');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'selected' && Array.isArray(payload.hs) && payload.hs.includes('hero_inferno') && payload.hs.includes('hero_gigawatt') && !payload.hs.includes('hero_haze'),
    `Second row hero leaked into first row token: ${JSON.stringify(payload)}`);

  const settingsApi = root.AnitaUI;
  assert(settingsApi && typeof settingsApi === 'object', 'AnitaUI API missing after hero selection');
  tabs[tabs.length - 1].events.onactivate();
  presetBtn.events.onactivate();
  const rerenderedPicker = findByClass(root, 'AnitaPresetHeroPickerBtn')[0];
  assert(rerenderedPicker, 'Hero picker missing after settings re-render');
  heroSummary = findByClass(root, 'AnitaPresetHeroSummary')[0];
  assert(heroSummary && heroSummary.text === '2 heroes selected',
    `Hero summary label did not survive settings re-render: ${heroSummary && heroSummary.text}`);
  assert(findByClass(rerenderedPicker, 'AnitaPresetHeroDropDownFaceLabel')[0].text === '2 heroes',
    'Hero picker face did not survive settings re-render');
  const rerenderedCopyBtn = findByClass(root, 'AnitaPresetCopyBtn')[0];
  assert(rerenderedCopyBtn && rerenderedCopyBtn.events.onactivate, 'Copy button missing after settings re-render');
  dispatched.length = 0;
  rerenderedCopyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No scoped preset token copied after settings re-render');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'selected' && Array.isArray(payload.hs) && payload.hs.includes('hero_inferno') && payload.hs.includes('hero_gigawatt'),
    `Rerendered copy lost multi-hero targets: ${JSON.stringify(payload)}`);

  const activePicker = rerenderedPicker;
  const activeCopyBtn = rerenderedCopyBtn;

  openHeroMenu(activePicker);
  firstHeroOption = findHeroMenuOption(activePicker.__anitaHeroMenu, 'hero_inferno');
  assert(firstHeroOption, 'Refreshed hero dropdown missing Infernus option');
  chooseHero(activePicker, 'hero_inferno');
  assert(heroSummary.text === '1 hero selected',
    `Hero summary label did not remove only the selected hero: ${heroSummary.text}`);
  assert(findByClass(activePicker, 'AnitaPresetHeroDropDownFaceLabel')[0].text === '1 hero',
    'Hero picker face did not update after removing one selected hero');

  dispatched.length = 0;
  activeCopyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No one-hero preset token copied after removal');
  payload = decodePresetToken(copied[1]);
  assert(Array.isArray(payload.hs) && payload.hs.length === 1 && payload.hs[0] === 'hero_gigawatt',
    `Copied token should keep only Seven after removing Infernus: ${JSON.stringify(payload)}`);

  const allOption = findHeroScopeOption(activePicker.__anitaHeroMenu, 'all');
  assert(allOption, 'Refreshed hero dropdown missing All heroes option');
  chooseHeroScope(activePicker, 'all');
  assert(heroSummary.text === 'All heroes',
    `Hero summary label did not switch back to all heroes: ${heroSummary.text}`);
  assert(findByClass(activePicker, 'AnitaPresetHeroDropDownFaceLabel')[0].text === 'All heroes',
    'Hero picker face did not switch back to all heroes');

  dispatched.length = 0;
  activeCopyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No all-heroes preset token copied');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'all' && !payload.hs, `All heroes token should include hm=all and no hs: ${JSON.stringify(payload)}`);

  chooseHero(activePicker, 'hero_inferno');
  assert(heroSummary.text === '1 hero selected',
    `Hero summary label did not switch from all to one selected hero: ${heroSummary.text}`);
  chooseHero(activePicker, 'hero_inferno');
  assert(heroSummary.text === 'Hero select off',
    `Removing the last selected hero should return to Hero select off: ${heroSummary.text}`);
  assert(findByClass(activePicker, 'AnitaPresetHeroDropDownFaceLabel')[0].text === 'Off',
    'Hero picker face should return to Off after removing the last selected hero');

  console.log(`[HERO SELECTOR PASS] ${path.relative(ROOT, targetScript)} uses custom hero picker, isolates preset rows, survives rerender, and copies off/all/selected hero scope tokens.`);
}

function runPipConvarPopupValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext();
  runInVm(exposePipConvarTestHooks(source), context, targetScript);
  installMockPresetStore([]);

  const hooks = context.__hpColorsPipConvarTestHooks;
  assert(hooks && hooks.core && hooks.settingsContract,
    'HP Colors registrar test hooks were not exposed');
  runNextScheduledByDelay(0.07);

  const config = hooks.core.findRegisteredMod('HP Colors');
  assert(config && Array.isArray(config.elements),
    'HP Colors registrar did not register a config');

  const persistedElements = config.elements.filter(element => element && element.id);
  const persistedIds = hooks.settingsContract.buildOrderedIds();
  assert(config.storageVersion === 99 && hooks.settingsContract.storageVersion === 99,
    `HP Colors full persisted schema version changed: ${config.storageVersion}/${hooks.settingsContract.storageVersion}`);
  assert(persistedElements.length === 56 && persistedIds.length === 56,
    `HP Colors persisted setting count changed: ${persistedElements.length}/${persistedIds.length}`);
  const persistedById = {};
  persistedElements.forEach(element => {
    persistedById[element.id] = element;
  });
  persistedIds.forEach(id => {
    assert(persistedById[id] && persistedById[id].defaultValue === hooks.settingsContract.buildDefaults()[id],
      `HP Colors persisted setting contract changed for ${id}`);
  });
  assert(hooks.settingsContract.ALIASES &&
      hooks.settingsContract.ALIASES.hp_precise_pips_enabled === 'ppe',
    'More Precise HP Pips must use the compact persisted alias ppe');
  const pipAction = config.elements.find(element => element && element.id === 'hp_precise_pips_enabled');
  assert(pipAction && pipAction.type === 'toggle' &&
      pipAction.label === 'More Precise HP Pips' &&
      pipAction.presetSupported === false &&
      pipAction.defaultValue === false &&
      pipAction.category === 'HEALTH BARS|Number Overlay' &&
      typeof pipAction.onChange === 'function',
    'More Precise HP Pips must be a persisted Number Overlay toggle');

  function findPanelById(panel, id) {
    if (!panel) return null;
    if (panel.id === id) return panel;
    for (const child of panel.children || []) {
      const found = findPanelById(child, id);
      if (found) return found;
    }
    return null;
  }

  function activateCategory(mainText, subText) {
    const mainBtn = findByClass(root, 'AnitaMainCategoryBtn')
      .find(button => button.children.some(child => child.text === mainText));
    assert(mainBtn && mainBtn.events.onactivate, `Missing main category button: ${mainText}`);
    mainBtn.events.onactivate();
    const subBtn = findByClass(root, 'AnitaSubCategoryBtn')
      .find(button => button.children.some(child => child.text === subText));
    assert(subBtn && subBtn.events.onactivate, `Missing subcategory button: ${mainText}|${subText}`);
    subBtn.events.onactivate();
  }

  const tabs = findByClass(root, 'AnitaTabBtn');
  assert(tabs.length >= 1 && tabs[tabs.length - 1].events.onactivate,
    'HP Colors tab missing activation handler');
  tabs[tabs.length - 1].events.onactivate();
  activateCategory('HEALTH BARS', 'Number Overlay');

  const actionRow = findByClass(root, 'AnitaToggleRow')
    .find(row => row.children.some(child => child.text === 'More Precise HP Pips'));
  const actionButton = actionRow && findByClass(actionRow, 'AnitaToggleBtn')[0];
  assert(actionButton && actionButton.events.onactivate,
    'More Precise HP Pips toggle did not render in Number Overlay');

  const persistedSignature = () => JSON.stringify(config.elements
    .filter(element => element && element.id)
    .map(element => [element.id, element.defaultValue]));
  const initialPersistedSignature = persistedSignature();
  function parseSettingUpdates() {
    return dispatched
      .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
      .map(args => {
        try { return JSON.parse(args[1]); } catch (err) { return null; }
      })
      .filter(payload => payload && payload.magic_word === 'ANITA_UPDATE');
  }

  function assertPipPopupWorkflow(command, phase) {
    const popup = findPanelById(root, 'AnitaPipConvarPopup');
    const commandLabel = findPanelById(popup, 'AnitaPipConvarCommand');
    const copyButton = findPanelById(popup, 'AnitaPipConvarCopy');
    const acknowledgeButton = findPanelById(popup, 'AnitaPipConvarAcknowledge');
    assert(popup && popup.IsValid() && commandLabel && commandLabel.text === command,
      `${phase} pip convar popup should show the exact command: ${commandLabel && commandLabel.text}`);
    assert(copyButton && copyButton.events.onactivate &&
        copyButton.children.some(child => child.text === 'COPY COMMAND'),
      `${phase} pip convar popup should expose a COPY COMMAND button`);
    assert(acknowledgeButton && acknowledgeButton.events.onactivate &&
        acknowledgeButton.children.some(child => child.text === "I'VE DONE THIS"),
      `${phase} pip convar popup should expose an I'VE DONE THIS button`);

    dispatched.length = 0;
    copyButton.events.onactivate();
    assert(dispatched.some(args => args[0] === 'CopyStringToClipboard' && args[1] === command),
      `${phase} COPY COMMAND should dispatch the exact clipboard value: ${JSON.stringify(dispatched)}`);

    acknowledgeButton.events.onactivate();
    assert(!popup.IsValid() && !findPanelById(root, 'AnitaPipConvarPopup'),
      `${phase} I'VE DONE THIS should delete the pip convar popup`);
  }

  dispatched.length = 0;
  actionButton.events.onactivate();
  assert(actionRow.BHasClass('Checked'),
    'More Precise HP Pips toggle did not switch on');
  const enableUpdates = parseSettingUpdates();
  assert(enableUpdates.length === 1 &&
      enableUpdates[0].setting_id === 'hp_precise_pips_enabled' &&
      enableUpdates[0].value === true,
    `More Precise HP Pips should emit exactly one ANITA_UPDATE true payload: ${JSON.stringify(enableUpdates)}`);
  assertPipPopupWorkflow(
    '"citadel_unit_status_health_per_minor_pip" "10"\n' +
    '"citadel_unit_status_health_per_pip" "10"\n' +
    '"citadel_unit_status_minor_pip_per_major_pip" "10"',
    'Enable');
  hooks.persistence.applyResolvedValues(config, { hp_enabled: true });
  assert(pipAction.currentValue === true,
    'Applying a visual preset without precise-pip data must preserve precise mode');

  dispatched.length = 0;
  actionButton.events.onactivate();
  assert(!actionRow.BHasClass('Checked'),
    'More Precise HP Pips toggle did not switch off');
  const disableUpdates = parseSettingUpdates();
  assert(disableUpdates.length === 1 &&
      disableUpdates[0].setting_id === 'hp_precise_pips_enabled' &&
      disableUpdates[0].value === false,
    `More Precise HP Pips should emit exactly one ANITA_UPDATE false payload: ${JSON.stringify(disableUpdates)}`);
  assertPipPopupWorkflow(
    '"citadel_unit_status_health_per_minor_pip" "100"\n' +
    '"citadel_unit_status_health_per_pip" "100"\n' +
    '"citadel_unit_status_minor_pip_per_major_pip" "5"',
    'Disable');
  assert(persistedSignature() === initialPersistedSignature,
    'Pip convar workflow must not alter persisted HP Colors settings');

  console.log(`[HP PIP CONVAR PASS] ${path.relative(ROOT, targetScript)} renders the persisted precise-pip toggle and enable/reset popups, emits exact updates, copies exact commands, and closes on acknowledgement.`);

}
function runSignatureTierConditionalValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  for (const removedMouseMarker of [
    '[HP_MOUSE_DEBUG]',
    'GameUI.WasMousePressed(',
    'bindContextMenuTargets',
    'consumeContextMenuAtCursor',
    'AnitaConditionalContextRow',
    'HandleConditionalContextMenu',
  ]) {
    assert(!source.includes(removedMouseMarker),
      `Failed conditional mouse path must be removed: ${removedMouseMarker}`);
  }
  if (!IS_OPTIMIZED_TARGET) {
    assert(source.includes('var marker = $.CreatePanel("Button", row, "");') &&
        source.includes('marker.SetPanelEvent("onactivate"'),
      'Conditional editor must use the row-end star button activation path');
  }
  scheduled.length = 0;
  const context = createMockContext();
  const decoyAbilities = new MockPanel('abilities', root);
  const decoySlot = new MockPanel('slot_signature_1', decoyAbilities);
  decoySlot.AddClass('Tier3');

  function installSignatureTree(tiers) {
    const signature = new MockPanel('hud_signature', root);
    const abilities = new MockPanel('abilities', signature);
    const slots = [];
    for (let slot = 1; slot <= 4; slot++) {
      const panel = new MockPanel(`slot_signature_${slot}`, abilities);
      panel.AddClass(`Tier${tiers[slot - 1]}`);
      const image = new MockPanel('Image', panel, 'ability_image');
      if (slot === 4) {
        image.style.backgroundImage =
          'url("s2r://panorama/images/abilities/signature_4.vtex")';
      } else {
        image.SetAttributeString(
          'src',
          `s2r://panorama/images/abilities/signature_${slot}.vtex`,
        );
      }
      slots.push(panel);
    }
    return { signature, abilities, slots };
  }

  const tree = installSignatureTree([2, 0, 2, 3]);
  runInVm(
    IS_OPTIMIZED_TARGET ? source : exposeConditionalEditorTestHooks(source),
    context,
    targetScript,
  );
  if (!IS_OPTIMIZED_TARGET) {
    assert(context.__hpColorsConditionalEditorTestHooks,
      'Conditional editor VM hooks were not exposed');
  }
  installMockTopbarHero('hero_inferno');
  const conditionalPayload = HPPresetCodeCodec.encodeBase64Url(JSON.stringify({
    v: 99,
    values: { hp_low_threshold: 25 },
    o: { hp_low_threshold: [1, 2, 45] },
  }));
  root.SetAttributeString('anita_v1_hp_colors', conditionalPayload);
  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function',
    'AnitaUI.Register was not exposed for signature conditional validation');
  const config = {
    title: 'HP Colors',
    description: 'signature conditional validation',
    storageNamespace: 'hp_colors',
    storageVersion: 99,
    elements: [
      {
        id: 'hp_low_threshold',
        type: 'slider',
        defaultValue: 25,
        currentValue: 25,
        category: 'General',
        min: 0,
        max: 100,
        step: 1,
      },
      {
        id: 'hp_number_format',
        label: 'HP number format',
        type: 'cycler',
        defaultValue: 0,
        currentValue: 0,
        category: 'Health Bars',
        options: ['HP', '%', 'Current HP'],
      },
      {
        id: 'hp_counter_visible',
        label: 'Show HP number',
        type: 'toggle',
        defaultValue: true,
        currentValue: true,
        category: 'Health Bars',
      },
    ],
  };
  root.AnitaUI.Register(config);
  assert(config.__hpSignatureConditionalRules &&
    config.__hpSignatureConditionalRules.hp_low_threshold,
    `Conditional rules did not hydrate: ${JSON.stringify(config.__hpSignatureConditionalRules || null)}`);
  if (!IS_OPTIMIZED_TARGET) {
    const hooks = context.__hpColorsConditionalEditorTestHooks;
    assert(!source.includes('AnitaConditionalChoice'),
      'Conditional editor must remove the separate text slot/tier choice rows');
    assert(source.includes('ability_frame_passive_0_psd.vtex') === false,
      'Tier frame assets belong in CSS, not duplicated in controller code');
    assert(!source.includes('AnitaConditionalAbilityFallback') &&
        !source.includes('artFallback.text = "?"'),
      'Conditional editor must not render question-mark ability fallbacks');
    assert(hooks.conditional.openEditor(config, config.elements[0]),
      'Conditional icon editor did not open');
    const popup = hooks.conditional.popup;
    assert(popup && popup.panel,
      'Conditional icon editor did not retain popup state');
    const abilityButtons = popup.panel.FindChildrenWithClassTraverse(
      'AnitaConditionalAbility',
    );
    assert(abilityButtons.length === 4,
      'Conditional editor must render four signature ability controls');
    abilityButtons.forEach((button, index) => {
      const art = button.FindChildrenWithClassTraverse(
        'AnitaConditionalAbilityArt',
      )[0];
      assert(art && art.src ===
        `s2r://panorama/images/abilities/signature_${index + 1}.vtex`,
      `Signature ${index + 1} art was not copied from the live HUD slot`);
    });
    assert(abilityButtons[0].BHasClass('Active') &&
        abilityButtons[0].BHasClass('VisualTier2'),
      'Hydrated signature 1 Tier 2 rule was not reflected by the icon control');
    const selectedTierBadge = abilityButtons[0].FindChildrenWithClassTraverse(
      'AnitaConditionalTierBadge',
    )[0];
    assert(selectedTierBadge && selectedTierBadge.text === 'T2',
      'Hydrated icon control must expose its minimum tier badge');
    const toggle = popup.panel.FindChildrenWithClassTraverse(
      'AnitaConditionalToggle',
    )[0];
    const toggleStatus = popup.panel.FindChildrenWithClassTraverse(
      'AnitaConditionalToggleStatus',
    )[0];
    assert(toggle && toggleStatus &&
        toggleStatus.text === 'Signature 1 · Tier 2+',
      'Hydrated setting must refresh its compact condition summary');
    abilityButtons[0].events.onactivate();
    assert(abilityButtons[0].BHasClass('VisualTier3') &&
        selectedTierBadge.text === 'T3',
      'Repeated icon activation must cycle Tier 2 to Tier 3');
    abilityButtons[0].events.onactivate();
    assert(abilityButtons[0].BHasClass('VisualTier1') &&
        selectedTierBadge.text === 'T1',
      'Repeated icon activation must wrap Tier 3 to Tier 1');
    abilityButtons[1].events.onactivate();
    assert(!abilityButtons[0].BHasClass('Active') &&
        abilityButtons[1].BHasClass('Active') &&
        abilityButtons[1].BHasClass('VisualTier1'),
      'Activating another signature icon must transfer selection and tier frame');
    assert(toggleStatus.text === 'Signature 2 · Tier 1+',
      'Changing signature slot must refresh the condition summary');
    toggle.events.onactivate();
    assert(toggleStatus.text === 'No condition' &&
        abilityButtons.every(button => !button.BHasClass('Active')),
      'Disabling a setting condition must clear stale selected visuals');
    toggle.events.onactivate();
    assert(toggleStatus.text === 'Signature 2 · Tier 1+' &&
        abilityButtons[1].BHasClass('Active'),
      'Re-enabling a setting condition must restore its own selection');
    const conditionalSlider = popup.panel.FindChildrenWithClassTraverse(
      'AnitaSlider',
    )[0];
    assert(conditionalSlider && conditionalSlider.style.height === '12px',
      'Conditional slider must restrict dragging to its compact slider hit area');
    const sliderContainer = popup.panel.FindChildrenWithClassTraverse(
      'AnitaSliderContainer',
    )[0];
    assert(sliderContainer && sliderContainer.style.width === '290px' &&
        sliderContainer.hittest === false &&
        sliderContainer.hittestchildren === true,
      'Conditional slider must fit the value card and ignore its outer box');
    hooks.conditional.closePopup();
    assert(hooks.conditional.openEditor(config, config.elements[1]),
      'Conditional editor did not open for a new setting');
    const freshPopup = hooks.conditional.popup;
    const freshButtons = freshPopup.panel.FindChildrenWithClassTraverse(
      'AnitaConditionalAbility',
    );
    const freshStatus = freshPopup.panel.FindChildrenWithClassTraverse(
      'AnitaConditionalToggleStatus',
    )[0];
    assert(freshStatus && freshStatus.text === 'No condition' &&
        freshButtons.every(button => !button.BHasClass('Active')),
      'New setting must start with refreshed, unselected tier visuals');
    assert(freshPopup.panel.FindChildrenWithClassTraverse(
      'AnitaConditionalAbilityFallback',
    ).length === 0,
    'New setting must not recreate question-mark ability fallbacks');
    freshButtons[2].events.onactivate();
    assert(freshStatus.text === 'Signature 3 · Tier 1+' &&
        freshButtons[2].BHasClass('Active'),
      'Selecting an icon must enable and summarize the new setting condition');
    const cyclerSegments = freshPopup.panel.FindChildrenWithClassTraverse(
      'AnitaCyclerSegment',
    );
    assert(cyclerSegments.length === 3,
      'Conditional cycler editor must render every radio option');
    cyclerSegments[2].events.onactivate();
    assert(cyclerSegments[2].BHasClass('Active'),
      'Conditional cycler radio option did not become selected');
    const applyConditional = freshPopup.panel.FindChildrenWithClassTraverse(
      'Primary',
    )[0];
    assert(applyConditional && typeof applyConditional.events.onactivate === 'function',
      'Conditional cycler editor is missing its apply action');
    applyConditional.events.onactivate();
    assert(config.__hpSignatureConditionalRules.hp_number_format &&
        config.__hpSignatureConditionalRules.hp_number_format.value === 2,
      `Conditional cycler radio selection was not saved: ${JSON.stringify(config.__hpSignatureConditionalRules)}`);
    const cyclerEffective =
      hooks.conditional.getEffectiveValues(config);
    assert(cyclerEffective.hp_number_format === 2,
      `Conditional cycler radio selection was not resolved at its live tier: ${JSON.stringify(cyclerEffective)}`);
    const sliderOnlyRules =
      hooks.conditional.cloneValue(config.__hpSignatureConditionalRules);
    delete sliderOnlyRules.hp_number_format;
    hooks.conditional.replaceRules(config, sliderOnlyRules);
    assert(hooks.conditional.openEditor(config, config.elements[2]),
      'Conditional editor did not open for an AnitaToggleBtn setting');
    const togglePopup = hooks.conditional.popup;
    const toggleAbilityButtons =
      togglePopup.panel.FindChildrenWithClassTraverse(
        'AnitaConditionalAbility',
      );
    toggleAbilityButtons[2].events.onactivate();
    const conditionalValueToggle =
      togglePopup.panel.FindChildrenWithClassTraverse(
        'AnitaConditionalValueToggle',
      )[0];
    const conditionalValueStatus =
      togglePopup.panel.FindChildrenWithClassTraverse(
        'AnitaConditionalValueToggleStatus',
      )[0];
    assert(conditionalValueToggle &&
        conditionalValueToggle.BHasClass('Active') &&
        conditionalValueStatus &&
        conditionalValueStatus.text === 'ON' &&
        typeof conditionalValueToggle.events.onactivate === 'function',
      'Conditional boolean editor must begin at the base true value');
    conditionalValueToggle.events.onactivate();
    assert(!conditionalValueToggle.BHasClass('Active') &&
        conditionalValueStatus.text === 'OFF',
      'Conditional boolean editor did not switch to false');
    const applyToggleConditional =
      togglePopup.panel.FindChildrenWithClassTraverse('Primary')[0];
    assert(applyToggleConditional &&
        typeof applyToggleConditional.events.onactivate === 'function',
      'Conditional boolean editor is missing its apply action');
    applyToggleConditional.events.onactivate();
    const toggleRule =
      config.__hpSignatureConditionalRules.hp_counter_visible;
    assert(toggleRule &&
        Object.prototype.hasOwnProperty.call(toggleRule, 'value') &&
        toggleRule.value === false,
      `Conditional AnitaToggleBtn false value was not saved: ${JSON.stringify(config.__hpSignatureConditionalRules)}`);
    const toggleEffective =
      hooks.conditional.getEffectiveValues(config);
    assert(Object.prototype.hasOwnProperty.call(
      toggleEffective,
      'hp_counter_visible',
    ) && toggleEffective.hp_counter_visible === false,
    `Conditional AnitaToggleBtn false value was not resolved: ${JSON.stringify(toggleEffective)}`);
    const sliderRulesAfterToggle =
      hooks.conditional.cloneValue(config.__hpSignatureConditionalRules);
    delete sliderRulesAfterToggle.hp_counter_visible;
    hooks.conditional.replaceRules(config, sliderRulesAfterToggle);

    const controller = hooks.conditional;
    assert(hooks.maxTierConfirmMs === 5000,
      'Signature max-tier confirmation window must be exactly five seconds');
    controller.resetMaxTierScanState(config, false);
    tree.slots[0].RemoveClass('Tier2');
    tree.slots[0].AddClass('Tier3');
    const originalReadTier = controller.readTier;
    let slotOneTierReads = 0;
    controller.readTier = function(panel) {
      if (panel === tree.slots[0]) slotOneTierReads += 1;
      return originalReadTier.call(controller, panel);
    };
    controller.refreshTiers();
    assert(controller.maxTierSeenAtMs[0] >= 0 &&
        controller.maxTierRetired[0] === false,
      'First Tier 3 observation must begin, not complete, confirmation');
    tree.slots[0].RemoveClass('Tier3');
    tree.slots[0].AddClass('Tier2');
    controller.refreshTiers();
    assert(controller.maxTierSeenAtMs[0] === -1 &&
        controller.maxTierRetired[0] === false,
      'Dropping below Tier 3 must cancel pending confirmation');
    tree.slots[0].RemoveClass('Tier2');
    tree.slots[0].AddClass('Tier3');
    controller.refreshTiers();
    controller.maxTierSeenAtMs[0] =
      Date.now() - hooks.maxTierConfirmMs - 1;
    controller.refreshTiers();
    assert(controller.maxTierRetired[0] === true &&
        controller.tiers[0] === 3 &&
        controller.hasPendingTierScans() === false,
      'Continuous Tier 3 must retire its scan after five seconds');
    const readsAtRetirement = slotOneTierReads;
    controller.refreshTiers();
    assert(slotOneTierReads === readsAtRetirement &&
        controller.tiers[0] === 3,
      'Retired max signature must stay cached without another tier read');
    const pollCountBeforeRetiredSchedule = scheduled.filter(
      job => Number(job && job.delay) === 0.1,
    ).length;
    controller.rebuildReferencedSlots(config);
    controller.schedulePoll(config, 0.1);
    assert(controller.maxTierRetired[0] === true &&
        scheduled.filter(job => Number(job && job.delay) === 0.1).length ===
          pollCountBeforeRetiredSchedule,
      'Rule rebuilds must preserve retirement and must not restart its poll');
    const retiredRules = controller.cloneValue(
      config.__hpSignatureConditionalRules,
    );
    controller.clearRules(config, null);
    assert(controller.referencedSlots[0] === false &&
        controller.maxTierRetired[0] === false &&
        controller.tiers[0] === -1,
      'Removing the last slot rule must clear its retired tier cache');
    tree.slots[0].RemoveClass('Tier3');
    tree.slots[0].AddClass('Tier2');
    controller.replaceRules(config, retiredRules);
    assert(controller.referencedSlots[0] === true &&
        controller.maxTierRetired[0] === false &&
        controller.tiers[0] === 2 &&
        controller.hasPendingTierScans() === true,
      'Re-adding a retired slot rule must read the live tier and resume scanning');
    controller.refreshTiers();
    assert(controller.tiers[0] === 2,
      'Re-added slot rule must read its current tier instead of stale Tier 3');
    controller.readTier = originalReadTier;
    controller.resetMaxTierScanState(config, true);

    const row = new MockPanel('Panel', root, 'ConditionalStarTestRow');
    let openedElement = null;
    hooks.conditional.openEditor = (openedConfig, openedSetting) => {
      assert(openedConfig === config,
        'Conditional star opened the wrong config');
      openedElement = openedSetting;
      return true;
    };
    assert(hooks.conditional.decorateRow(config, config.elements[0], row),
      'Conditional controller did not decorate star test row');
    const marker = config.elements[0].__anitaConditionalMarker;
    assert(marker && marker.type === 'Button',
      'Conditional row-end marker must be a clickable Button');
    assert(marker.GetChildCount() === 1 && marker.GetChild(0).text === '*',
      'Conditional row-end button must render only the star glyph');
    assert(config.elements[0].__anitaConditionalTooltip === undefined,
      'Conditional star tooltip must not be a child of the setting row or marker');
    assert(typeof marker.events.onmouseover === 'function' &&
      typeof marker.events.onmouseout === 'function',
    'Conditional star must use the established local-tooltip hover path');
    marker.events.onmouseover();
    const localTooltip = hooks.renderer.presetTooltip;
    const localTooltipLabel = localTooltip && localTooltip.__anitaTooltipLabel;
    assert(localTooltip && localTooltip.GetParent() !== row &&
      localTooltipLabel &&
      localTooltipLabel.text === 'Configure signature condition' &&
      localTooltip.style.opacity === '1',
    `Conditional star did not show the established local tooltip: ${localTooltipLabel && localTooltipLabel.text}`);
    const tooltipHost = localTooltip.GetParent();
    tooltipHost.actuallayoutwidth = 1920;
    tooltipHost.contentwidth = 1920;
    tooltipHost.actuallayoutheight = 1080;
    tooltipHost.contentheight = 1080;
    runNextScheduledByDelay(0.02);
    const tooltipPositionBeforeScroll = localTooltip.style.position;
    const scrollHandler = activeHarness.handlerEntries.find((entry) =>
      entry.eventName === 'ScrollPositionChanged' &&
      entry.panel &&
      entry.panel.BHasClass('AnitaSettingsList'));
    assert(scrollHandler &&
      scrollHandler.panel.sendScrollPositionChangedEvents === true,
    'Settings list did not enable event-driven tooltip repositioning');
    marker.actualyoffset += 80;
    scrollHandler.handler();
    assert(localTooltip.style.position !== tooltipPositionBeforeScroll,
      'Visible local tooltip did not follow its anchor after simulated scrolling');
    marker.events.onmouseout();
    assert(localTooltip.style.opacity === '0',
      'Conditional star mouseout did not hide the established local tooltip');
    const hiddenTooltipPosition = localTooltip.style.position;
    marker.actualyoffset += 80;
    scrollHandler.handler();
    assert(localTooltip.style.position === hiddenTooltipPosition &&
      localTooltip.style.opacity === '0',
    'Hidden local tooltip kept tracking its former anchor');
    assert(typeof marker.events.onactivate === 'function',
      'Conditional row-end star button is missing onactivate');
    marker.events.onactivate();
    assert(openedElement === config.elements[0],
      'Conditional row-end star opened the wrong setting');
  }
  runScheduledJobsByDelay(0.0);
  runScheduledJobsByDelay(0.1);
  runScheduledJobsByDelay(0.5);
  const snapshotPayloads = () => dispatched
    .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
    .map(args => {
      try { return JSON.parse(args[1]); } catch (err) { return null; }
    })
    .filter(payload => payload && payload.magic_word === 'HP_COLORS_PRESET_SNAPSHOT');
  let snapshots = snapshotPayloads();
  assert(snapshots.some(payload =>
    payload.effective_values &&
    payload.effective_values.hp_low_threshold === 45),
  `Tier 2 condition did not publish effective value: ${JSON.stringify(snapshots)}`);

  dispatched.length = 0;
  tree.slots[0].RemoveClass('Tier2');
  tree.slots[0].AddClass('Tier1');
  runNextScheduledByDelay(0.1);
  snapshots = snapshotPayloads();
  assert(snapshots.some(payload =>
    payload.effective_values &&
    Object.keys(payload.effective_values).length === 0),
  `Tier transition did not fall back to base: ${JSON.stringify(snapshots)}`);

  dispatched.length = 0;
  tree.slots[0].RemoveClass('Tier1');
  tree.slots[0].AddClass('Tier3');
  runNextScheduledByDelay(0.1);
  snapshots = snapshotPayloads();
  assert(snapshots.some(payload =>
    payload.effective_values &&
    payload.effective_values.hp_low_threshold === 45),
  `Tier transition did not republish effective value: ${JSON.stringify(snapshots)}`);
  console.log(`[HP SIGNATURE CONDITIONAL PASS] ${path.relative(ROOT, targetScript)} refreshes per-setting selection and summaries, saves cycler and boolean values, resolves false toggle overrides, snapshots live icon sources including CSS-bound images, cycles Tier 1–3 frames, constrains slider hit testing, republishes transitions, and falls back to base when unresolved.`);
}


function runBakedPresetPayloadCompatibilityValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');

  function runCase(label, payload, expectedValues, expectedRule) {
    dispatched.length = 0;
    scheduled.length = 0;
    const context = createMockContext();
    runInVm(source, context, targetScript);
    const store = root.add(new MockPanel('HPColorsPresetStore'));
    store.add(createPresetEntryPanel(`HPColorsPreset_${label}`, payload));

    const config = {
      title: 'HP Colors',
      description: `baked ${label} payload compatibility`,
      storageNamespace: 'hp_colors',
      storageVersion: 99,
      elements: [
        { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
        { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 },
        { id: 'hp_precise_pips_enabled', type: 'toggle', presetSupported: false, defaultValue: false, currentValue: false, category: 'General' },
      ],
    };
    root.AnitaUI.Register(config);
    runNextScheduledByDelay(0.5);

    assert(config.elements[0].currentValue === expectedValues.hp_enabled &&
      config.elements[1].currentValue === expectedValues.hp_low_threshold &&
      config.elements[2].currentValue === false,
      `${label} baked values did not hydrate while excluding precise pips: ${JSON.stringify(config.elements.map(element => element.currentValue))}`);
    assert(config.__hpSignatureConditionalRules &&
      config.__hpSignatureConditionalRules.hp_low_threshold &&
      config.__hpSignatureConditionalRules.hp_low_threshold.slot === expectedRule.slot &&
      config.__hpSignatureConditionalRules.hp_low_threshold.minTier === expectedRule.minTier &&
      config.__hpSignatureConditionalRules.hp_low_threshold.value === expectedRule.value &&
      !config.__hpSignatureConditionalRules.hp_precise_pips_enabled,
      `${label} baked signature overrides did not reach the controller: ${JSON.stringify(config.__hpSignatureConditionalRules || null)}`);
    const payloads = decodedBulkUpdates();
    assert(payloads.some(item => item.preset_key === `HPColorsPreset_${label}` &&
      item.values &&
      item.values.hp_enabled === expectedValues.hp_enabled &&
      item.values.hp_low_threshold === expectedValues.hp_low_threshold &&
      item.values.hp_precise_pips_enabled === false),
    `${label} baked apply did not emit sanitized base values without applying precise pips: ${JSON.stringify(payloads)}`);
  }

  runCase('compact', {
    v: 99,
    c: 1,
    name: 'Compact baked',
    values: { e: false, l: 64, ppe: true },
    o: { l: [2, 1, 73], ppe: [1, 0, true] },
    hm: 'all',
  }, { hp_enabled: false, hp_low_threshold: 64 }, { slot: 2, minTier: 1, value: 73 });

  runCase('legacy', {
    version: 1,
    name: 'Legacy baked',
    values: { hp_enabled: false, hp_low_threshold: 41, hp_precise_pips_enabled: true },
    o: { l: [3, 2, 28], ppe: [1, 0, true] },
    heroMode: 'all',
  }, { hp_enabled: false, hp_low_threshold: 41 }, { slot: 3, minTier: 2, value: 28 });

  console.log(`[HP BAKED PAYLOAD PASS] ${path.relative(ROOT, targetScript)} accepts compact v99/c1 and version:1 canonical baked payloads, normalizes compact signature rules, hydrates sanitized values, and excludes precise-pip settings from Full presets.`);
}


function runHeroPresetApplyValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext();
  runInVm(source, context, targetScript);
  const topbarPlayer = installMockTopbarHero('hero_inferno');
  const presetRows = [
    {
      id: 'HPColorsPreset_001',
      name: 'Main Hunt 2',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_inferno'],
      values: { hp_enabled: false, hp_low_threshold: 25 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Shift',
      heroMode: 'selected',
      heroes: ['hero_haze'],
      values: { hp_enabled: true, hp_low_threshold: 45 }
    }
  ];
  const store = installMockPresetStore(presetRows);

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register was not exposed for hero preset apply validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero preset apply validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runScheduledJobsByDelay(0.5);
  let updates = decodedBulkUpdates();
  findBakedPresetUpdate(updates, payload =>
    payload.hero_id === 'hero_inferno' &&
    payload.preset_key === 'HPColorsPreset_001' &&
    payload.values && payload.values.hp_enabled === false,
    'Initial detected hero did not apply Infernus preset');

  runNextScheduledByDelay(2.0);
  topbarPlayer.RemoveClass('hero_inferno');
  topbarPlayer.AddClass('hero_haze');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates();
  findBakedPresetUpdate(updates, payload =>
    payload.hero_id === 'hero_haze' &&
    payload.preset_key === 'HPColorsPreset_002' &&
    payload.values && payload.values.hp_low_threshold === 45,
    'Changed detected hero did not apply Haze preset');

  store.DeleteAsync();
  runNextScheduledByDelay(2.0);
  installMockPresetStore(presetRows);
  topbarPlayer.RemoveClass('hero_haze');
  topbarPlayer.AddClass('hero_inferno');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates();
  findBakedPresetUpdate(updates, payload =>
    payload.hero_id === 'hero_inferno' &&
    payload.preset_key === 'HPColorsPreset_001' &&
    payload.values && payload.values.hp_enabled === false,
    'Hero watcher stopped after a transient preset-store miss');

  console.log(`[HERO PRESET PASS] ${path.relative(ROOT, targetScript)} detects hero changes and applies matching scoped presets without runtime log noise.`);
}

function runHeroPresetStableIdPriorityValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext();
  runInVm(source, context, targetScript);
  installMockTopbarHero('hero_inferno');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_001',
      name: 'Stale row should lose',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_haze'],
      values: { hp_enabled: false, hp_low_threshold: 27 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Stable route target',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_inferno'],
      values: { hp_enabled: true, hp_low_threshold: 62 }
    }
  ]);

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register missing for stable-id priority validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero stable id priority validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    __anitaPresetHeroSelections: {
      baked_0: ['hero_inferno'],
      'id:HPColorsPreset_001': ['hero_haze']
    },
    __anitaPresetHeroModes: {
      baked_0: 'selected',
      'id:HPColorsPreset_001': 'selected'
    },
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  const updates = decodedBulkUpdates();
  findBakedPresetUpdate(updates, payload =>
    payload.hero_id === 'hero_inferno' &&
    payload.preset_key === 'HPColorsPreset_002' &&
    payload.values && payload.values.hp_low_threshold === 62,
    'Stable preset id hero scope did not override stale row-index scope');

  console.log(`[HERO STABLE-ID PASS] ${path.relative(ROOT, targetScript)} prefers stable preset ids over stale baked row indexes.`);
}

function runHeroPresetGlobalFallbackBeforeHeroValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext({ gameState: 7 });
  runInVm(source, context, targetScript);
  installMockPresetStore([
    {
      id: 'HPColorsPreset_001',
      name: 'Global startup default',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: false, hp_low_threshold: 31 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Scoped later preset',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_haze'],
      values: { hp_enabled: true, hp_low_threshold: 70 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero preset global fallback validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  const updates = decodedBulkUpdates();
  const payload = updates.find(item => item.update_source === 'baked_preset_apply' &&
    item.force_emit === true &&
    item.bulk_emit === true &&
    item.force_persist === true &&
    item.preset_key === 'HPColorsPreset_001' &&
    item.values && item.values.hp_low_threshold === 31);
  assert(payload,
    `First global startup preset should apply before hero detection even when later scoped presets exist: ${JSON.stringify(updates)}`);

  console.log(`[HERO GLOBAL FALLBACK PASS] ${path.relative(ROOT, targetScript)} applies first global preset before hero detection while preserving scoped preset watch.`);
}

function runHeroPresetLobbyGateValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext({ gameState: 2 });
  runInVm(source, context, targetScript);
  const topbarPlayer = installMockTopbarHero('hero_inferno');
  installMockGameTime('00:00');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_001',
      name: 'Infernus lobby guarded',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_inferno'],
      values: { hp_enabled: false, hp_low_threshold: 25 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Haze active',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_haze'],
      values: { hp_enabled: true, hp_low_threshold: 45 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero preset lobby gate validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  let updates = decodedBulkUpdates();
  assert(!updates.some(payload => payload.update_source === 'baked_preset_apply'),
    `Lobby state should not spend the hero lookup window or apply a scoped preset: ${JSON.stringify(updates)}`);

  topbarPlayer.RemoveClass('hero_inferno');
  topbarPlayer.AddClass('hero_haze');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates();
  assert(!updates.some(payload => payload.update_source === 'baked_preset_apply'),
    `Lobby watcher tick should stay paused until active game state: ${JSON.stringify(updates)}`);

  mockGameState = 6;
  runNextScheduledByDelay(5.0);
  updates = decodedBulkUpdates();
  assert(!updates.some(payload => payload.update_source === 'baked_preset_apply'),
    `Valve pre-game-wait state must not open the hero lookup window: ${JSON.stringify(updates)}`);

  mockGameState = 7;
  runScheduledUntil(
    () => decodedBulkUpdates().some(payload =>
      payload.update_source === 'baked_preset_apply' &&
      payload.hero_id === 'hero_haze'),
    'Active game state did not schedule the scoped hero preset',
  );
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.hero_id === 'hero_haze' &&
    payload.preset_key === 'HPColorsPreset_002' &&
    payload.values && payload.values.hp_low_threshold === 45),
    `Active game state at 00:00 should open the hero lookup window and apply the current hero preset: ${JSON.stringify(updates)}`);

  console.log(`[HERO LOBBY GATE PASS] ${path.relative(ROOT, targetScript)} pauses hero preset lookup in lobby and opens it at active game time zero.`);
}

function runMatchMonitorRollbackValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext({ gameState: 7 });
  runInVm(source, context, targetScript);
  const gameTime = installMockGameTime('01:10');

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'match monitor rollback validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.25);
  const firstToken = sharedStore.__hpColorsMatchReset && sharedStore.__hpColorsMatchReset.token;
  assert(firstToken && sharedStore.__hpColorsMatchReset.reason === 'game_state_active',
    `Match monitor did not publish initial active token: ${JSON.stringify(sharedStore.__hpColorsMatchReset || null)}`);

  gameTime.DeleteAsync(0);
  installMockGameTime('00:02');
  runScheduledJobsByDelay(5.0);
  assert(sharedStore.__hpColorsMatchReset &&
      sharedStore.__hpColorsMatchReset.token !== firstToken &&
      sharedStore.__hpColorsMatchReset.reason === 'game_time_rollback',
    `Match monitor did not publish a new token after game-time rollback: ${JSON.stringify(sharedStore.__hpColorsMatchReset || null)}`);

  console.log(`[HERO MATCH MONITOR PASS] ${path.relative(ROOT, targetScript)} publishes a new reset token after active game-time rollback.`);
}

function runSignatureTierLifecycleResetValidation() {
  if (IS_OPTIMIZED_TARGET) return;
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext({ gameState: 7 });
  runInVm(exposeConditionalEditorTestHooks(source), context, targetScript);
  installMockGameTime('00:01');
  const config = {
    title: 'HP Colors',
    description: 'signature tier lifecycle reset validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' }
    ]
  };
  root.AnitaUI.Register(config);
  const controller =
    context.__hpColorsConditionalEditorTestHooks.conditional;

  controller.maxTierRetired = [true, true, true, true];
  runNextScheduledByDelay(0.25);
  assert(controller.maxTierRetired.every(value => value === false),
    'Active match start must reset max-tier scan retirement');

  controller.maxTierRetired = [true, true, true, true];
  mockGameState = 2;
  runScheduledJobsByDelay(1.0);
  assert(controller.maxTierRetired.every(value => value === false),
    'Returning to the lobby must reset max-tier scan retirement');

  console.log(`[HP SIGNATURE LIFECYCLE PASS] ${path.relative(ROOT, targetScript)} resets max-tier scan retirement at match start and on return to lobby.`);
}


function runHeroSelectorRuntimeScopeValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext();
  runInVm(source, context, targetScript);
  installMockTopbarHero('hero_haze');
  installMockPresetStore();

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register was not exposed for runtime scope validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero selector runtime scope validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  const tabs = findByClass(root, 'AnitaTabBtn');
  assert(tabs.length >= 1 && tabs[tabs.length - 1].events.onactivate, 'HP Colors tab missing for runtime scope validation');
  tabs[tabs.length - 1].events.onactivate();
  const presetBtn = findByClass(root, 'AnitaFooterBtnPreset')[0];
  assert(presetBtn && presetBtn.events.onactivate, 'Preset footer button missing for runtime scope validation');
  presetBtn.events.onactivate();

  function openHeroMenu(button) {
    assert(button && button.events.onactivate, 'Hero picker button missing activate handler for runtime scope validation');
    button.events.onactivate();
    assert(button.__anitaHeroMenu && button.__anitaHeroMenu.IsValid && button.__anitaHeroMenu.IsValid(),
      'Hero picker did not open a menu for runtime scope validation');
    return button.__anitaHeroMenu;
  }

  const allPickers = findByClass(root, 'AnitaPresetHeroPickerBtn');
  assert(allPickers.length >= 2, `Expected at least two preset hero pickers for runtime scope validation, found ${allPickers.length}`);
  const secondPicker = allPickers[1];
  const secondMenu = openHeroMenu(secondPicker);
  const hazeOption = findByClass(secondMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_id', '') === 'hero_haze');
  assert(hazeOption, 'Second preset row missing Haze option for runtime scope validation');

  hazeOption.events.onactivate();

  runScheduledUntil(() => decodedBulkUpdates().some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.hero_id === 'hero_haze' &&
    payload.preset_key === 'HPColorsPreset_002' &&
    payload.values && payload.values.hp_low_threshold === 45),
    `In-game hero selector scope did not drive the runtime preset selection: ${JSON.stringify(decodedBulkUpdates())}`);

  console.log(`[HERO RUNTIME SCOPE PASS] ${path.relative(ROOT, targetScript)} uses in-game hero selector scopes when applying presets.`);
}

function runHeroScopeModeFallbackValidation() {
  let source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  let context = createMockContext();
  runInVm(source, context, targetScript);
  installMockTopbarHero('hero_haze');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_001',
      name: 'Global fallback',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 45 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Shiv only',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_shiv'],
      values: { hp_enabled: false, hp_low_threshold: 25 }
    }
  ]);

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register missing for selected/all fallback validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero scope fallback validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  let updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_001' &&
    payload.values && payload.values.hp_low_threshold === 45),
    `All-heroes preset should apply when selected-mode presets do not claim the current hero: ${JSON.stringify(updates)}`);
  resetPresetStoreLookupCounters();
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_001' &&
    payload.values && payload.values.hp_low_threshold === 45),
    `All-heroes preset should remain the fallback after watcher tick when selected mode misses: ${JSON.stringify(updates)}`);
  assert((refreshPresetStoreLookupCounters(), presetStoreLookups.findStore === 0 && presetStoreLookups.scanEntries === 0),
    `Watcher tick should reuse cached baked preset entries instead of scanning Panorama panels: ${JSON.stringify(presetStoreLookups)}`);

  dispatched.length = 0;
  scheduled.length = 0;
  activeHarness = createPanoramaHarness({ now: 0 }); syncHeroGlobals();
  context = createMockContext();
  runInVm(source, context, targetScript);
  installMockTopbarHero('hero_haze');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_003',
      name: 'All only',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 55 }
    },
    {
      id: 'HPColorsPreset_004',
      name: 'Disabled',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: false, hp_low_threshold: 5 }
    }
  ]);

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register missing for all-mode validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero all scope validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_003' &&
    payload.values && payload.values.hp_low_threshold === 55),
    `All-heroes preset should apply when no selected-mode preset competes: ${JSON.stringify(updates)}`);
  assert(!scheduled.some(job => Number(job && job.delay) === 2.0),
    `All-only preset stores should not start the 2s hero watcher: ${JSON.stringify(scheduled.map(job => job && job.delay))}`);
  assert(!updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_004'),
    `Off-mode preset should never apply: ${JSON.stringify(updates)}`);

  dispatched.length = 0;
  scheduled.length = 0;
  context = createMockContext();
  runInVm(IS_OPTIMIZED_TARGET ? source : exposePresetBuilderTestHooks(source), context, targetScript);
  const topbarPlayer = installMockTopbarHero('hero_shiv');
  if (!IS_OPTIMIZED_TARGET) {
    topbarPlayer.__heroNameLabel.text = 'constructor';
    assert(context.__hpPresetBuilderTestHooks.detectLocalHero() === '',
      'Inherited object properties must not resolve as retail hero names');
  }
  topbarPlayer.__heroNameLabel.text = '#';
  installMockPresetStore([
    {
      id: 'HPColorsPreset_005',
      name: 'All fallback',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 60 }
    },
    {
      id: 'HPColorsPreset_006',
      name: 'Shiv only',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_shiv'],
      values: { hp_enabled: false, hp_low_threshold: 25 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero reapply after no match validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  assert(!decodedBulkUpdates().some(payload =>
    payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_006'),
  'Topbar placeholder must not resolve to a selected hero preset');
  topbarPlayer.AddClass('hero_shiv');
  activeHarness.findCounts.LocalPlayer = 0;
  runNextScheduledByDelay(2.0);
  const stableTopbarScans = activeHarness.findCounts.LocalPlayer || 0;
  assert(stableTopbarScans === 0,
    `Stable hero detection should reuse the cached local topbar card: ${stableTopbarScans} LocalPlayer scans`);
  assert(decodedBulkUpdates().some(payload =>
    payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_006' &&
    payload.hero_id === 'hero_shiv'),
  `Retail topbar name should resolve to the canonical hero key: ${JSON.stringify(decodedBulkUpdates())}`);
  topbarPlayer.RemoveClass('hero_shiv');
  topbarPlayer.AddClass('hero_magician');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates().filter(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_005' &&
    payload.hero_id === 'hero_magician');
  assert(updates.length >= 1 && updates.some(payload => payload.values && payload.values.hp_low_threshold === 60),
    `Leaving a selected hero should apply the all-heroes fallback for unclaimed heroes: ${JSON.stringify(decodedBulkUpdates())}`);
  topbarPlayer.RemoveClass('hero_magician');
  topbarPlayer.AddClass('hero_shiv');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates().filter(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_006' &&
    payload.hero_id === 'hero_shiv');
  assert(updates.length >= 2,
    `Returning to a specifically claimed hero should reapply the selected preset over all-heroes fallback: ${JSON.stringify(decodedBulkUpdates())}`);

  dispatched.length = 0;
  scheduled.length = 0;
  context = createMockContext();
  runInVm(source, context, targetScript);
  const activeTopbarPlayer = installMockTopbarHero('hero_inferno');
  installMockGameTime('12:00');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_013',
      name: 'Import 1',
      category: 'Imported',
      heroMode: 'selected',
      heroes: ['hero_inferno'],
      values: { hp_enabled: false, hp_low_threshold: 22 }
    },
    {
      id: 'HPColorsPreset_014',
      name: 'All heroes fallback',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 61 }
    }
  ]);

  const activeFallbackConfig = {
    title: 'HP Colors',
    description: 'active game hero swap fallback validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  };
  root.AnitaUI.Register(activeFallbackConfig);

  runNextScheduledByDelay(0.5);
  runNextScheduledByDelay(2.0);
  activeTopbarPlayer.RemoveClass('hero_inferno');
  activeTopbarPlayer.AddClass('hero_haze');
  runScheduledJobsByDelay(2.0);
  updates = decodedBulkUpdates().filter(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_014' &&
    payload.hero_id === 'hero_haze');
  assert(updates.length === 0 && activeFallbackConfig.__hpHeroPresetDetectionLocked === true,
    `Locked auto hero mode should not reapply fallback after a late hero swap: ${JSON.stringify(decodedBulkUpdates())}`);

  dispatched.length = 0;
  scheduled.length = 0;
  context = createMockContext();
  runInVm(source, context, targetScript);
  const manualImportTopbarPlayer = installMockTopbarHero('hero_haze');
  const manualImportGameTime = installMockGameTime('12:00');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_014',
      name: 'All heroes fallback',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 61 }
    }
  ]);

  const manualImportConfig = {
    title: 'HP Colors',
    description: 'manual imported preset scope fallback validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  };
  root.AnitaUI.Register(manualImportConfig);

  runNextScheduledByDelay(0.5);
  findByClass(root, 'AnitaTabBtn').slice(-1)[0].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();
  findByClass(root, 'AnitaPresetImportBtn')[0].events.onactivate();
  const manualImportPopup = findByClass(root, 'AnitaImportPopup')[0];
  findByClass(manualImportPopup, 'AnitaPasteInput')[0].text = encodePresetStorePayload({
    name: 'Inferno Import',
    version: 1,
    hm: 'selected',
    hs: ['hero_inferno'],
    values: { hp_enabled: false, hp_low_threshold: 22 }
  });
  findByClass(manualImportPopup, 'AnitaImportApplyBtn')[0].events.onactivate();
  const manualImportRow = manualImportConfig.__anitaUserPresetRows && manualImportConfig.__anitaUserPresetRows[0];
  assert(manualImportRow && manualImportRow.heroMode === 'selected' &&
      Array.isArray(manualImportRow.heroes) && manualImportRow.heroes.includes('hero_inferno'),
    `Imported preset row should keep Inferno-only scope before click: ${JSON.stringify(manualImportRow)}`);

  dispatched.length = 0;
  const manualImportName = findByClass(root, 'AnitaPresetRowName').find(label => label.text === 'Import 1');
  assert(manualImportName && manualImportName.parent && manualImportName.parent.parent &&
      manualImportName.parent.parent.events.onactivate,
    'Imported preset row should be clickable for scope fallback validation');
  manualImportName.parent.parent.events.onactivate();
  updates = decodedBulkUpdates();
  assert(!updates.some(payload => payload.update_source === 'ui_code_apply' &&
      payload.values && payload.values.hp_low_threshold === 22),
    `Clicking an Inferno-only imported preset while on Haze must not apply it directly in AUTO HERO mode: ${JSON.stringify(updates)}`);
  runScheduledUntil(() => decodedBulkUpdates().some(payload => payload.update_source === 'baked_preset_apply' &&
      payload.preset_key === 'HPColorsPreset_014' &&
      payload.hero_id === 'hero_haze' &&
      payload.values && payload.values.hp_low_threshold === 61),
    `Manual Inferno-only import click should refresh the all-heroes fallback on Haze: ${JSON.stringify(updates)}`);

  const overrideBtn = findByClass(root, 'AnitaPresetHeroOverrideBtn')[0];
  assert(overrideBtn && overrideBtn.events.onactivate,
    'Preset builder should expose an AUTO HERO / OVERRIDE ON / HERO OFF button');
  dispatched.length = 0;
  overrideBtn.events.onactivate();
  assert(manualImportConfig.__hpHeroDetectionMode === 'override' &&
      manualImportConfig.__hpHeroManualPresetOverride === true,
    'Hero mode button did not enter manual override mode');
  const overrideImportName = findByClass(root, 'AnitaPresetRowName').find(label => label.text === 'Import 1');
  assert(overrideImportName && overrideImportName.parent && overrideImportName.parent.parent &&
      overrideImportName.parent.parent.events.onactivate,
    'Imported preset row should remain clickable after enabling manual override');
  overrideImportName.parent.parent.events.onactivate();
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'ui_code_apply' &&
      payload.values && payload.values.hp_low_threshold === 22),
    `Manual override should allow applying an Inferno-only imported preset while on Haze: ${JSON.stringify(updates)}`);
  const heroOffBtn = findByClass(root, 'AnitaPresetHeroOverrideBtn')[0];
  assert(heroOffBtn && heroOffBtn.events.onactivate,
    'Hero mode button missing after override re-render');
  heroOffBtn.events.onactivate();
  assert(manualImportConfig.__hpHeroDetectionMode === 'off' &&
      manualImportConfig.__hpHeroManualPresetOverride === false,
    'Hero mode button did not enter HERO OFF mode');
  dispatched.length = 0;
  manualImportTopbarPlayer.RemoveClass('hero_haze');
  manualImportTopbarPlayer.AddClass('hero_inferno');
  runScheduledJobsByDelay(2.0);
  updates = decodedBulkUpdates();
  assert(!updates.some(payload => payload.update_source === 'baked_preset_apply'),
    `HERO OFF should stop automatic hero detection applies: ${JSON.stringify(updates)}`);
  const autoHeroBtn = findByClass(root, 'AnitaPresetHeroOverrideBtn')[0];
  assert(autoHeroBtn && autoHeroBtn.events.onactivate,
    'Hero mode button missing after HERO OFF re-render');
  autoHeroBtn.events.onactivate();
  assert(manualImportConfig.__hpHeroDetectionMode === 'auto' &&
      manualImportConfig.__hpHeroManualPresetOverride === false,
    'Hero mode button did not return to AUTO HERO mode');
  assert(manualImportConfig.__hpHeroPresetLockAfterGameTime > 720 &&
      manualImportConfig.__hpHeroPresetDetectionLocked === false,
    `AUTO HERO should reopen a fresh 10s lock window when toggled in match: ${manualImportConfig.__hpHeroPresetLockAfterGameTime}`);
  manualImportGameTime.text = '12:11';
  runScheduledJobsByDelay(2.0);
  assert(manualImportConfig.__hpHeroPresetDetectionLocked === true,
    'AUTO HERO should lock again after the replayed 10s in-match window elapses');

  dispatched.length = 0;
  scheduled.length = 0;
  context = createMockContext();
  runInVm(source, context, targetScript);
  const userRowTopbarPlayer = installMockTopbarHero('hero_inferno');
  installMockGameTime('00:05');
  installMockPresetStore([]);
  const userRowConfig = {
    title: 'HP Colors',
    description: 'user preset row hero fallback validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    __anitaUserPresetRows: [
      {
        key: 'user_inferno_import',
        name: 'Import 1',
        category: 'Imported',
        heroMode: 'selected',
        heroes: ['hero_inferno'],
        values: { hp_enabled: false, hp_low_threshold: 22 }
      },
      {
        key: 'user_all_fallback',
        name: 'All heroes user fallback',
        category: 'Game preset',
        heroMode: 'all',
        values: { hp_enabled: true, hp_low_threshold: 64 }
      }
    ],
    __anitaPresetPriorityOrder: ['user_inferno_import', 'user_all_fallback'],
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  };
  root.AnitaUI.Register(userRowConfig);

  runNextScheduledByDelay(0.5);
  userRowTopbarPlayer.RemoveClass('hero_inferno');
  userRowTopbarPlayer.AddClass('hero_haze');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
      payload.preset_key === 'user_all_fallback' &&
      payload.hero_id === 'hero_haze' &&
      payload.values && payload.values.hp_low_threshold === 64),
    `Runtime hero resolver should include saved/imported preset rows, not only baked VPK rows: ${JSON.stringify(updates)}`);

  dispatched.length = 0;
  scheduled.length = 0;
  context = createMockContext();
  runInVm(source, context, targetScript);
  installMockTopbarHero('hero_haze');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_007',
      name: 'Picker controlled',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: false, hp_low_threshold: 70 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero scope immediate refresh validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();
  const picker = findByClass(root, 'AnitaPresetHeroPickerBtn')[0];
  picker.events.onactivate();
  const allScopeOption = findByClass(picker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_kind', '') === 'all');
  allScopeOption.events.onactivate();
  runNextScheduledByDelay(0.05);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_007' &&
    payload.values && payload.values.hp_low_threshold === 70),
    `Changing a preset row to All heroes should refresh matching config immediately: ${JSON.stringify(updates)}`);

  console.log(`[HERO SCOPE MODE PASS] ${path.relative(ROOT, targetScript)} maps Valve retail topbar names to canonical hero keys, rejects placeholders, reuses the cached local-player card, and preserves off/all/selected fallback behavior.`);
}

function runHeroScopeLiveEditValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  let context = createMockContext();
  runInVm(source, context, targetScript);
  installMockTopbarHero('hero_haze');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_008',
      name: 'Live edited',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: false, hp_low_threshold: 70 }
    },
    {
      id: 'HPColorsPreset_009',
      name: 'Fallback all',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 44 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero scope live edit validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  let updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_009' &&
    payload.values && payload.values.hp_low_threshold === 44),
    `Initial all fallback should apply when no selected row exists: ${JSON.stringify(updates)}`);

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();
  const picker = findByClass(root, 'AnitaPresetHeroPickerBtn')[0];
  picker.events.onactivate();
  let hazeOption = findByClass(picker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_kind', '') === 'hero' &&
      option.GetAttributeString('anita_hero_id', '') === 'hero_haze');
  assert(hazeOption && hazeOption.events.onactivate, 'Live edit validation missing Haze option');
  hazeOption.events.onactivate();
  runNextScheduledByDelay(0.05);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_008' &&
    payload.hero_id === 'hero_haze' &&
    payload.values && payload.values.hp_low_threshold === 70),
    `Changing an off row to selected current hero should apply immediately: ${JSON.stringify(updates)}`);

  const summary = findByClass(root, 'AnitaPresetHeroSummary')[0];
  assert(summary && summary.text === '1 hero selected',
    `Selected current hero summary missing: ${summary && summary.text}`);

  hazeOption = findByClass(picker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_kind', '') === 'hero' &&
      option.GetAttributeString('anita_hero_id', '') === 'hero_haze');
  hazeOption.events.onactivate();
  runNextScheduledByDelay(0.05);
  assert(summary.text === 'Hero select off',
    `Removing last selected hero should return to Hero select off during live edit: ${summary.text}`);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_009' &&
    payload.values && payload.values.hp_low_threshold === 44),
    `Returning selected row to off should re-enable explicit all fallback: ${JSON.stringify(updates)}`);

  const offOption = findByClass(picker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_kind', '') === 'off');
  offOption.events.onactivate();
  runNextScheduledByDelay(0.05);
  assert(summary.text === 'Hero select off',
    `Explicit Off should be visible in summary: ${summary.text}`);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_009' &&
    payload.values && payload.values.hp_low_threshold === 44),
    `After explicit Off, all fallback should be allowed again when no selected row exists: ${JSON.stringify(updates)}`);

  console.log(`[HERO LIVE EDIT PASS] ${path.relative(ROOT, targetScript)} applies live scope edits without waiting for the 2s watcher.`);
}

function runHeroBundleScopeTokenValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  let context = createMockContext();
  runInVm(source, context, targetScript);
  installMockPresetStore([
    {
      id: 'HPColorsPreset_010',
      name: 'Disabled row',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: false, hp_low_threshold: 21 }
    },
    {
      id: 'HPColorsPreset_011',
      name: 'Global row',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 44 }
    },
    {
      id: 'HPColorsPreset_012',
      name: 'Haze only',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_haze'],
      values: { hp_enabled: true, hp_low_threshold: 70 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero scope bundle token validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();
  const bundleBtn = findByClass(root, 'AnitaPresetBundleBtn')[0];
  assert(bundleBtn && bundleBtn.events.onactivate, 'COPY ALL button missing for bundle scope validation');
  bundleBtn.events.onactivate();

  const bundle = decodeCopiedBundleToken();
  assert(Array.isArray(bundle.p) && bundle.p.length === 3,
    `Bundle should include three preset rows: ${JSON.stringify(bundle)}`);
  assert(bundle.p[0][0] === 'Disabled row' && bundle.p[0][2] === 'off',
    `Bundle should preserve explicit off rows: ${JSON.stringify(bundle.p[0])}`);
  assert(bundle.p[1][0] === 'Global row' && bundle.p[1][2] === 'all',
    `Bundle should preserve explicit all-hero rows: ${JSON.stringify(bundle.p[1])}`);
  assert(bundle.p[2][0] === 'Haze only' && Array.isArray(bundle.p[2][2]) && bundle.p[2][2][0] === 'hero_haze',
    `Bundle should preserve selected hero rows as hero arrays: ${JSON.stringify(bundle.p[2])}`);

  console.log(`[HERO BUNDLE PASS] ${path.relative(ROOT, targetScript)} preserves off/all/selected hero scope in COPY ALL tokens.`);
}

function runUserPresetBundleValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;
  resetPresetStoreLookupCounters();

  const context = createMockContext();
  sharedStore.__hpColorsCfgRaw = JSON.stringify({
    hp_enabled: false,
    hp_low_threshold: 62
  });
  runInVm(source, context, targetScript);
  installMockPresetStore([]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'user preset bundle validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });
  const startupSnapshot = JSON.parse(sharedStore.__hpColorsCfgRaw || '{}');
  assert(startupSnapshot.hp_enabled === false && startupSnapshot.hp_low_threshold === 62,
    `HP Colors registration should publish a startup shared snapshot before opening Anita UI: ${JSON.stringify(startupSnapshot)}`);
  const startupBursts = scheduled.filter(job => [0.25, 1.0, 2.25, 5.0].includes(Number(job.delay)));
  assert(startupBursts.length >= 4,
    `HP Colors registration should queue startup sync bursts for fresh healthbars: ${JSON.stringify(scheduled.map(job => job.delay))}`);

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();

  const nameInput = findByClass(root, 'AnitaPresetNameInput')[0];
  const addBtn = findByClass(root, 'AnitaPresetAddBtn')[0];
  assert(nameInput && addBtn && addBtn.events.onactivate,
    'Preset Builder should expose in-game preset name input and add button');
  nameInput.text = 'My Game Build';
  if (nameInput.events.ontextentrychange) nameInput.events.ontextentrychange();
  addBtn.events.onactivate();

  assert(findByClass(root, 'AnitaPresetRowName').some(label => label.text === 'My Game Build'),
    'Saved in-game preset row did not render after SAVE CURRENT');
  dispatched.length = 0;
  const bundleBtn = findByClass(root, 'AnitaPresetBundleBtn')[0];
  assert(bundleBtn && bundleBtn.events.onactivate, 'COPY ALL button missing after adding user preset');
  bundleBtn.events.onactivate();

  const bundle = decodeCopiedBundleToken();
  assert(Array.isArray(bundle.p) && bundle.p.length === 1,
    `COPY ALL should include the saved in-game preset and exclude Current live settings: ${JSON.stringify(bundle)}`);
  assert(bundle.p[0][0] === 'My Game Build',
    `Saved preset name missing from COPY ALL bundle: ${JSON.stringify(bundle.p[0])}`);
  assert(bundle.p[0][1] && bundle.p[0][1].e === false && bundle.p[0][1].l === 62,
    `Saved preset values missing from COPY ALL bundle: ${JSON.stringify(bundle.p[0])}`);
  assert(bundle.p[0][2] === 'off',
    `Saved preset should default to explicit off hero scope: ${JSON.stringify(bundle.p[0])}`);

  console.log(`[HERO USER PRESET PASS] ${path.relative(ROOT, targetScript)} saves in-game presets and includes them in COPY ALL bundles.`);
}

function runUserPresetRenameValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;
  resetPresetStoreLookupCounters();

  const context = createMockContext();
  sharedStore.__hpColorsCfgRaw = JSON.stringify({
    hp_enabled: false,
    hp_low_threshold: 62
  });
  runInVm(source, context, targetScript);
  installMockPresetStore([]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'user preset rename validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();

  const nameInput = findByClass(root, 'AnitaPresetNameInput')[0];
  const addBtn = findByClass(root, 'AnitaPresetAddBtn')[0];
  nameInput.text = 'My Game Build';
  if (nameInput.events.ontextentrychange) nameInput.events.ontextentrychange();
  addBtn.events.onactivate();

  const rowName = findByClass(root, 'AnitaPresetRowName')
    .find(label => label.text === 'My Game Build');
  assert(rowName && rowName.events.onactivate,
    'Preset row name should be clickable for in-place rename');
  rowName.events.onactivate();

  const renameInput = findByClass(root, 'AnitaPresetRowNameInput')[0];
  assert(renameInput && renameInput.text === 'My Game Build',
    `Preset rename input should open with the existing name: ${renameInput && renameInput.text}`);
  renameInput.text = 'Renamed Game Build';
  assert(renameInput.events.ontextentrysubmit,
    'Preset rename input should commit on submit');
  renameInput.events.ontextentrysubmit();

  assert(findByClass(root, 'AnitaPresetRowName').some(label => label.text === 'Renamed Game Build'),
    'Preset row name did not update after in-place rename submit');

  dispatched.length = 0;
  const bundleBtn = findByClass(root, 'AnitaPresetBundleBtn')[0];
  assert(bundleBtn && bundleBtn.events.onactivate, 'COPY ALL button missing after renaming user preset');
  bundleBtn.events.onactivate();

  const bundle = decodeCopiedBundleToken();
  assert(Array.isArray(bundle.p) && bundle.p.length === 1,
    `COPY ALL should include only the renamed saved preset: ${JSON.stringify(bundle)}`);
  assert(bundle.p[0][0] === 'Renamed Game Build',
    `COPY ALL should export the renamed preset name: ${JSON.stringify(bundle.p[0])}`);

  console.log(`[HERO USER PRESET RENAME PASS] ${path.relative(ROOT, targetScript)} renames saved preset rows and exports the new name.`);
}

function runPresetDeleteValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;
  resetPresetStoreLookupCounters();

  const context = createMockContext();
  sharedStore.__hpColorsCfgRaw = JSON.stringify({
    hp_enabled: false,
    hp_low_threshold: 62
  });
  runInVm(source, context, targetScript);
  installMockPresetStore([
    {
      id: 'HPColorsPreset_DELETE_A',
      name: 'Baked Keep',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: true, hp_low_threshold: 22 }
    },
    {
      id: 'HPColorsPreset_DELETE_B',
      name: 'Baked Remove',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: false, hp_low_threshold: 72 }
    }
  ]);

  const config = {
    title: 'HP Colors',
    description: 'preset delete validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  };
  root.AnitaUI.Register(config);

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();

  const nameInput = findByClass(root, 'AnitaPresetNameInput')[0];
  const addBtn = findByClass(root, 'AnitaPresetAddBtn')[0];
  nameInput.text = 'Trash Me';
  if (nameInput.events.ontextentrychange) nameInput.events.ontextentrychange();
  addBtn.events.onactivate();

  function rowByName(name) {
    return findByClass(root, 'AnitaPresetRow').find(row =>
      findByClass(row, 'AnitaPresetRowName').some(label => label.text === name));
  }

  function deleteButtonFor(name) {
    const row = rowByName(name);
    return row ? findByClass(row, 'AnitaPresetDeleteBtn')[0] : null;
  }

  const userDeleteBtn = deleteButtonFor('Trash Me');
  assert(userDeleteBtn && userDeleteBtn.events.onactivate,
    'Saved user preset row should expose an active trash button');
  assert(findByClass(userDeleteBtn, 'AnitaPresetBtnIconTrash')[0],
    'Preset delete button should render the trash icon panel');
  assert(userDeleteBtn.events.onmouseover && userDeleteBtn.events.onmouseout,
    'Preset delete button should expose a tooltip');
  userDeleteBtn.events.onactivate();
  assert(!rowByName('Trash Me'),
    'Deleting a saved user preset should remove its row from the list');
  assert(Array.isArray(config.__anitaUserPresetRows) &&
      !config.__anitaUserPresetRows.some(row => row && row.name === 'Trash Me'),
    `Deleting a saved user preset should remove it from __anitaUserPresetRows: ${JSON.stringify(config.__anitaUserPresetRows)}`);

  const bakedDeleteBtn = deleteButtonFor('Baked Remove');
  assert(bakedDeleteBtn && bakedDeleteBtn.events.onactivate,
    'Baked preset row should expose a trash button that hides it from this in-game list');
  bakedDeleteBtn.events.onactivate();
  assert(!rowByName('Baked Remove'),
    'Deleting a baked preset should hide it from the in-game preset list');
  assert(config.__anitaRemovedPresetRows && config.__anitaRemovedPresetRows['id:HPColorsPreset_DELETE_B'],
    `Deleting a baked preset should store a non-destructive hidden id: ${JSON.stringify(config.__anitaRemovedPresetRows)}`);

  const currentRow = rowByName('Current live settings');
  assert(currentRow && !findByClass(currentRow, 'AnitaPresetDeleteBtn')[0],
    'Current live settings row should not expose a delete button');

  dispatched.length = 0;
  const bundleBtn = findByClass(root, 'AnitaPresetBundleBtn')[0];
  assert(bundleBtn && bundleBtn.events.onactivate, 'COPY ALL button missing after deleting preset rows');
  bundleBtn.events.onactivate();
  const bundle = decodeCopiedBundleToken();
  assert(Array.isArray(bundle.p) && bundle.p.length === 1 && bundle.p[0][0] === 'Baked Keep',
    `COPY ALL should exclude deleted user and hidden baked presets: ${JSON.stringify(bundle)}`);

  console.log(`[HERO PRESET DELETE PASS] ${path.relative(ROOT, targetScript)} removes user presets and hides baked preset rows with a trash icon.`);
}

function runPresetBuilderModelActionValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;
  resetPresetStoreLookupCounters();

  const vmState = createPresetBuilderVm(source);
  const hooks = vmState.hooks;
  const model = hooks.model;
  const actions = hooks.actions;

  assert(model.getDefaultSelectedPresetKey([
      { key: 'current', name: 'Current live settings' },
      { key: 'baked_late_startup', id: 'HPColorsPreset_001', name: 'Startup' },
      { key: 'baked_other', id: 'HPColorsPreset_002', name: 'Other' }
    ]) === 'baked_late_startup',
    'Preset builder default selection should prefer the startup preset even when it is not first');
  assert(model.getDefaultSelectedPresetKey([
      { key: 'current', name: 'Current live settings' },
      { key: 'baked_first', id: 'HPColorsPreset_020', name: 'First baked' },
      { key: 'user_first', name: 'User first' }
    ]) === 'baked_first',
    'Preset builder default selection should fall back to the first baked row');
  assert(model.getDefaultSelectedPresetKey([
      { key: 'user_first', name: 'User first' },
      { key: 'current', name: 'Current live settings' }
    ]) === 'user_first',
    'Preset builder default selection should fall back to the first row when no startup or baked row exists');
  assert(model.getDefaultSelectedPresetKey([]) === '',
    'Preset builder default selection should be empty for an empty row list');

  const selectionConfig = makePresetBuilderConfig({ __anitaSelectedPresetKey: 'baked_existing' });
  const selectionRows = [
    { key: 'baked_existing', id: 'HPColorsPreset_030', name: 'Existing' },
    { key: 'baked_startup', id: 'HPColorsPreset_001', name: 'Startup' }
  ];
  assert(model.ensureSelectedPresetKey(selectionConfig, selectionRows) === 'baked_existing',
    'ensureSelectedPresetKey should preserve a valid selected key');
  selectionConfig.__anitaSelectedPresetKey = 'stale_missing_key';
  assert(model.ensureSelectedPresetKey(selectionConfig, selectionRows) === 'baked_startup' &&
      selectionConfig.__anitaSelectedPresetKey === 'baked_startup',
    `ensureSelectedPresetKey should repair stale selections to the default: ${selectionConfig.__anitaSelectedPresetKey}`);

  installMockPresetStore([
    {
      id: 'HPColorsPreset_PRIORITY_A',
      name: 'Priority A',
      category: 'Builder VPK',
      values: { hp_enabled: false, hp_low_threshold: 25 }
    },
    {
      id: 'HPColorsPreset_PRIORITY_B',
      name: 'Priority B',
      category: 'Builder VPK',
      values: { hp_enabled: true, hp_low_threshold: 45 }
    }
  ]);
  const priorityConfig = makePresetBuilderConfig({
    __anitaPresetPriorityOrder: ['id:HPColorsPreset_PRIORITY_B', 'id:HPColorsPreset_PRIORITY_A']
  });
  const priorityModel = model.buildPresetBuilderViewModel(priorityConfig);
  const priorityNames = priorityModel.rows.map(row => row.name);
  assert(priorityNames[0] === 'Priority B' && priorityNames[1] === 'Priority A' &&
      priorityNames[2] === 'Current live settings',
    `Preset builder view model should apply priority order to visible rows: ${JSON.stringify(priorityNames)}`);
  assert(priorityModel.bundleRows.length === 2 && priorityModel.bundlePresetCount === 2,
    `Preset builder view model should count only exportable preset rows: ${priorityModel.bundlePresetCount}`);
  const priorityBundle = decodeBase64UrlPayload(
    model.buildPresetBundleCodeToken(priorityConfig, priorityModel.bundleRows),
  );
  assert(Array.isArray(priorityBundle.p) &&
      priorityBundle.p[0][0] === 'Priority B' &&
      priorityBundle.p[1][0] === 'Priority A',
    `COPY ALL token should preserve model priority order: ${JSON.stringify(priorityBundle.p)}`);

  const importConfig = makePresetBuilderConfig();
  const importToken = HPPresetCodeCodec.encodePresetToken(
    importConfig,
    { hp_enabled: false, hp_low_threshold: 22 },
    { name: 'Imported No Apply' },
  );
  dispatched.length = 0;
  const importResult = actions.addUserPresetFromImportCode(importConfig, importToken);
  assert(importResult && importResult.ok && importResult.row,
    `Import should save a preset row without applying it live: ${JSON.stringify(importResult)}`);
  assert(importConfig.elements[0].currentValue === true &&
      importConfig.elements[1].currentValue === 35,
    `Import-without-apply should preserve current live settings: ${JSON.stringify(importConfig.elements)}`);
  assert(!decodedBulkUpdates().some(payload => payload.update_source === 'ui_code_apply'),
    `Import-without-apply should not dispatch a live apply: ${JSON.stringify(decodedBulkUpdates())}`);

  installMockTopbarHero('hero_haze');
  const scopedConfig = makePresetBuilderConfig({
    __hpHeroDetectionMode: 'auto',
    __hpLastAppliedHeroPresetKey: 'stale_key',
    __hpLastAppliedHeroPresetHero: 'hero_haze'
  });
  const scopedRow = actions.addUserPresetFromValues(
    scopedConfig,
    'Inferno Only',
    { hp_enabled: false, hp_low_threshold: 22 },
    {},
    'Imported',
    ['hero_inferno'],
    'selected',
  );
  scheduled.length = 0;
  dispatched.length = 0;
  const waitResult = actions.applyPresetRow(scopedConfig, scopedRow);
  assert(waitResult && waitResult.waiting === true && waitResult.applied !== true,
    `Selected scoped row should wait when AUTO HERO detects an incompatible current hero: ${JSON.stringify(waitResult)}`);
  assert(scopedConfig.__anitaSelectedPresetKey === scopedRow.key &&
      scopedConfig.__hpHeroPresetHasScopedPreset === true &&
      scopedConfig.__hpLastAppliedHeroPresetKey === '' &&
      scopedConfig.__hpLastAppliedHeroPresetHero === '',
    `Waiting scoped apply should select the row and invalidate hero apply cache: ${JSON.stringify(scopedConfig)}`);
  assert(!decodedBulkUpdates().some(payload => payload.update_source === 'ui_code_apply'),
    `Waiting scoped apply should not emit live setting changes: ${JSON.stringify(decodedBulkUpdates())}`);
  assert(scheduled.some(job => Number(job.delay) === 0.05),
    `Waiting scoped apply should schedule a hero refresh: ${JSON.stringify(scheduled.map(job => job.delay))}`);

  hooks.setHeroDetectionMode(scopedConfig, 'override');
  scheduled.length = 0;
  dispatched.length = 0;
  const overrideResult = actions.applyPresetRow(scopedConfig, scopedRow);
  assert(overrideResult && overrideResult.applied === true,
    `Manual override should apply the selected scoped row immediately: ${JSON.stringify(overrideResult)}`);
  assert(scopedConfig.elements[0].currentValue === false &&
      scopedConfig.elements[1].currentValue === 22,
    `Manual override should apply scoped preset values to live settings: ${JSON.stringify(scopedConfig.elements)}`);
  assert(decodedBulkUpdates().some(payload => payload.update_source === 'ui_code_apply' &&
      payload.values && payload.values.hp_low_threshold === 22),
    `Manual override should emit a live ui_code_apply bulk update: ${JSON.stringify(decodedBulkUpdates())}`);

  const cleanupConfig = makePresetBuilderConfig({
    __anitaUserPresetRows: [
      {
        key: 'user_cleanup',
        name: 'User Cleanup',
        category: 'Imported',
        values: { hp_enabled: true, hp_low_threshold: 33 },
        payloadValues: { l: 33 },
        heroes: ['hero_haze'],
        heroMode: 'selected'
      }
    ],
    __anitaPresetNameOverrides: {
      user_cleanup: 'Old User Name',
      'id:HPColorsPreset_REMOVE': 'Old Baked Name'
    },
    __anitaPresetHeroSelections: {
      user_cleanup: ['hero_haze'],
      baked_remove: ['hero_inferno'],
      'id:HPColorsPreset_REMOVE': ['hero_inferno']
    },
    __anitaPresetHeroModes: {
      user_cleanup: 'selected',
      baked_remove: 'selected',
      'id:HPColorsPreset_REMOVE': 'selected'
    },
    __anitaPresetPriorityOrder: ['id:HPColorsPreset_KEEP', 'id:HPColorsPreset_REMOVE', 'user_cleanup'],
    __anitaSelectedPresetKey: 'user_cleanup',
    __anitaEditingPresetNameKey: 'user_cleanup',
    __hpLastAppliedHeroPresetKey: 'stale_key',
    __hpLastAppliedHeroPresetHero: 'hero_haze',
    __hpHeroPresetDetectionLocked: true
  });
  const keepRow = {
    key: 'baked_keep',
    id: 'HPColorsPreset_KEEP',
    name: 'Baked Keep',
    values: { hp_enabled: true, hp_low_threshold: 20 },
    payloadValues: { l: 20 },
    heroes: [],
    heroMode: 'off'
  };
  const removeRow = {
    key: 'baked_remove',
    id: 'HPColorsPreset_REMOVE',
    name: 'Baked Remove',
    values: { hp_enabled: false, hp_low_threshold: 44 },
    payloadValues: { e: false, l: 44 },
    heroes: ['hero_inferno'],
    heroMode: 'selected'
  };
  const userRow = cleanupConfig.__anitaUserPresetRows[0];
  keepRow.token = model.buildPresetCodeToken(cleanupConfig, keepRow.values, keepRow.name, keepRow.payloadValues, keepRow.heroes, keepRow.heroMode);
  removeRow.token = model.buildPresetCodeToken(cleanupConfig, removeRow.values, removeRow.name, removeRow.payloadValues, removeRow.heroes, removeRow.heroMode);
  userRow.token = model.buildPresetCodeToken(cleanupConfig, userRow.values, userRow.name, userRow.payloadValues, userRow.heroes, userRow.heroMode);

  assert(actions.setPresetRowName(cleanupConfig, removeRow, 'Renamed Baked') === true,
    'Renaming a baked preset row should succeed');
  assert(cleanupConfig.__anitaPresetNameOverrides['id:HPColorsPreset_REMOVE'] === 'Renamed Baked' &&
      cleanupConfig.__anitaSelectedPresetKey === 'baked_remove' &&
      decodePresetToken(removeRow.token).name === 'Renamed Baked',
    `Renaming a baked preset should update override state, selection, and token metadata: ${JSON.stringify(cleanupConfig.__anitaPresetNameOverrides)}`);

  scheduled.length = 0;
  cleanupConfig.__hpLastAppliedHeroPresetKey = 'stale_key';
  cleanupConfig.__hpLastAppliedHeroPresetHero = 'hero_inferno';
  assert(actions.movePresetRowPriority(cleanupConfig, [keepRow, removeRow, userRow], removeRow, -1) === true,
    'Moving preset priority should succeed for exportable rows');
  assert(cleanupConfig.__anitaPresetPriorityOrder[0] === 'id:HPColorsPreset_REMOVE' &&
      cleanupConfig.__anitaPresetPriorityOrder[1] === 'id:HPColorsPreset_KEEP' &&
      cleanupConfig.__anitaSelectedPresetKey === 'baked_remove',
    `Priority move should update order and keep the moved row selected: ${JSON.stringify(cleanupConfig.__anitaPresetPriorityOrder)}`);
  assert(cleanupConfig.__hpLastAppliedHeroPresetKey === '' &&
      cleanupConfig.__hpLastAppliedHeroPresetHero === '' &&
      cleanupConfig.__hpHeroPresetDetectionLocked === false &&
      scheduled.some(job => Number(job.delay) === 0.05),
    `Priority move should invalidate hero apply state and schedule refresh: ${JSON.stringify({ key: cleanupConfig.__hpLastAppliedHeroPresetKey, hero: cleanupConfig.__hpLastAppliedHeroPresetHero, scheduled: scheduled.map(job => job.delay) })}`);

  scheduled.length = 0;
  cleanupConfig.__hpLastAppliedHeroPresetKey = 'stale_key';
  cleanupConfig.__hpLastAppliedHeroPresetHero = 'hero_inferno';
  assert(actions.removePresetRow(cleanupConfig, removeRow) === true,
    'Deleting a baked preset row should succeed');
  assert(cleanupConfig.__anitaRemovedPresetRows &&
      cleanupConfig.__anitaRemovedPresetRows['id:HPColorsPreset_REMOVE'] === true,
    `Deleting a baked preset should tombstone by stable id: ${JSON.stringify(cleanupConfig.__anitaRemovedPresetRows)}`);
  assert(!Object.prototype.hasOwnProperty.call(cleanupConfig.__anitaPresetNameOverrides, 'id:HPColorsPreset_REMOVE') &&
      !Object.prototype.hasOwnProperty.call(cleanupConfig.__anitaPresetHeroSelections, 'baked_remove') &&
      !Object.prototype.hasOwnProperty.call(cleanupConfig.__anitaPresetHeroSelections, 'id:HPColorsPreset_REMOVE') &&
      !Object.prototype.hasOwnProperty.call(cleanupConfig.__anitaPresetHeroModes, 'baked_remove') &&
      !Object.prototype.hasOwnProperty.call(cleanupConfig.__anitaPresetHeroModes, 'id:HPColorsPreset_REMOVE') &&
      !cleanupConfig.__anitaPresetPriorityOrder.includes('id:HPColorsPreset_REMOVE') &&
      cleanupConfig.__anitaSelectedPresetKey === '',
    `Deleting a baked preset should clean stale name/hero/mode/priority/selection state: ${JSON.stringify(cleanupConfig)}`);
  assert(cleanupConfig.__hpLastAppliedHeroPresetKey === '' &&
      cleanupConfig.__hpLastAppliedHeroPresetHero === '' &&
      cleanupConfig.__hpHeroPresetDetectionLocked === false &&
      scheduled.some(job => Number(job.delay) === 0.05),
    `Deleting a baked preset should invalidate hero state and schedule refresh: ${JSON.stringify(scheduled.map(job => job.delay))}`);

  scheduled.length = 0;
  cleanupConfig.__anitaSelectedPresetKey = 'user_cleanup';
  cleanupConfig.__anitaEditingPresetNameKey = 'user_cleanup';
  cleanupConfig.__hpLastAppliedHeroPresetKey = 'stale_user';
  cleanupConfig.__hpLastAppliedHeroPresetHero = 'hero_haze';
  assert(actions.removePresetRow(cleanupConfig, userRow) === true,
    'Deleting a saved user preset row should succeed');
  assert(Array.isArray(cleanupConfig.__anitaUserPresetRows) &&
      cleanupConfig.__anitaUserPresetRows.length === 0 &&
      !Object.prototype.hasOwnProperty.call(cleanupConfig.__anitaPresetNameOverrides, 'user_cleanup') &&
      !Object.prototype.hasOwnProperty.call(cleanupConfig.__anitaPresetHeroSelections, 'user_cleanup') &&
      !Object.prototype.hasOwnProperty.call(cleanupConfig.__anitaPresetHeroModes, 'user_cleanup') &&
      !cleanupConfig.__anitaPresetPriorityOrder.includes('user_cleanup') &&
      cleanupConfig.__anitaSelectedPresetKey === '' &&
      cleanupConfig.__anitaEditingPresetNameKey === '',
    `Deleting a saved user preset should remove row and clean per-row state: ${JSON.stringify(cleanupConfig)}`);
  assert(cleanupConfig.__hpLastAppliedHeroPresetKey === '' &&
      cleanupConfig.__hpLastAppliedHeroPresetHero === '' &&
      scheduled.some(job => Number(job.delay) === 0.05),
    `Deleting a saved user preset should invalidate hero state and schedule refresh: ${JSON.stringify(scheduled.map(job => job.delay))}`);

  console.log(`[HERO PRESET BUILDER MODEL PASS] ${path.relative(ROOT, targetScript)} validates direct builder model defaults, priority, import, scoped apply, override, and cleanup behavior.`);
}

function runPresetBuilderCompatibilityValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  assert(!/hp_counter_visible\s*:\s*(?:true|!0)/.test(source),
    'Web-builder preset export should not emit hp_counter_visible/cv because the external builder rejects that field');
  assert(/\.[A-Za-z_$][\w$]*\s*=\s*"hp_kill_zone_color"/.test(source) || /\.kzs\s*=\s*"hp_kill_zone_color"/.test(source),
    'Importer should keep accepting legacy kzs as hp_kill_zone_color');

  console.log(`[HERO PRESET BUILDER COMPAT PASS] ${path.relative(ROOT, targetScript)} exports web-builder-safe preset aliases and imports legacy kill-zone color aliases.`);
}

function runPresetPriorityBundleValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;
  resetPresetStoreLookupCounters();

  const context = createMockContext();
  runInVm(source, context, targetScript);
  installMockPresetStore([
    {
      id: 'HPColorsPreset_001',
      name: 'Priority A',
      category: 'Builder VPK',
      values: { hp_enabled: false, hp_low_threshold: 25 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Priority B',
      category: 'Builder VPK',
      values: { hp_enabled: true, hp_low_threshold: 45 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'preset priority bundle validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();

  let names = findByClass(root, 'AnitaPresetRowName').map(label => label.text);
  assert(names[0] === 'Priority A' && names[1] === 'Priority B',
    `Initial priority order should match preset store order: ${JSON.stringify(names)}`);

  const downButtons = findByClass(root, 'AnitaPresetPriorityDownBtn');
  assert(downButtons[0] && downButtons[0].events.onactivate,
    'Preset rows should expose a priority-down button');
  const firstDownLabel = downButtons[0].children && downButtons[0].children[0];
  assert(firstDownLabel && firstDownLabel.text === '\u25BC',
    `Priority down button should use compact chevron text: ${firstDownLabel && firstDownLabel.text}`);
  assert(downButtons[0].events.onmouseover && downButtons[0].events.onmouseout,
    'Priority down button should expose a tooltip for dumb-friendly discovery');
  downButtons[0].events.onactivate();

  names = findByClass(root, 'AnitaPresetRowName').map(label => label.text);
  assert(names[0] === 'Priority B' && names[1] === 'Priority A',
    `Priority down should move the first preset below the second: ${JSON.stringify(names)}`);

  dispatched.length = 0;
  const bundleBtn = findByClass(root, 'AnitaPresetBundleBtn')[0];
  assert(bundleBtn && bundleBtn.events.onactivate, 'COPY ALL button missing after priority reorder');
  bundleBtn.events.onactivate();
  const bundle = decodeCopiedBundleToken();
  assert(Array.isArray(bundle.p) && bundle.p[0][0] === 'Priority B' && bundle.p[1][0] === 'Priority A',
    `COPY ALL bundle should preserve priority order for web builder import: ${JSON.stringify(bundle.p)}`);

  const upButtons = findByClass(root, 'AnitaPresetPriorityUpBtn');
  assert(upButtons[1] && upButtons[1].events.onactivate,
    'Preset rows should expose a priority-up button');
  const secondUpLabel = upButtons[1].children && upButtons[1].children[0];
  assert(secondUpLabel && secondUpLabel.text === '\u25B2',
    `Priority up button should use compact chevron text: ${secondUpLabel && secondUpLabel.text}`);
  assert(upButtons[1].events.onmouseover && upButtons[1].events.onmouseout,
    'Priority up button should expose a tooltip for dumb-friendly discovery');
  upButtons[1].events.onactivate();
  names = findByClass(root, 'AnitaPresetRowName').map(label => label.text);
  assert(names[0] === 'Priority A' && names[1] === 'Priority B',
    `Priority up should move the second preset above the first: ${JSON.stringify(names)}`);

  console.log(`[HERO PRESET PRIORITY PASS] ${path.relative(ROOT, targetScript)} reorders preset rows and preserves priority order in COPY ALL bundles.`);
}

function runAllNonGeneralToggleValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;
  resetPresetStoreLookupCounters();

  const context = createMockContext();
  runInVm(source, context, targetScript);
  installMockPresetStore([]);

  const config = {
    title: 'HP Colors',
    description: 'all non-general toggle validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', label: 'Enable enemy HP colors', defaultValue: true, currentValue: true, category: 'GENERAL|Core Behavior' },
      { id: 'hp_mode', type: 'cycler', label: 'Enemy color behavior', options: ['Fixed', 'Gradient'], defaultValue: 1, currentValue: 1, category: 'GENERAL|Core Behavior' },
      { id: 'hp_skip_buildings', type: 'toggle', label: 'Ignore buildings and bosses', defaultValue: false, currentValue: false, category: 'GENERAL|Core Behavior' },
      { id: 'hp_ult_color_enabled', type: 'toggle', label: 'Color ult icon', defaultValue: true, currentValue: true, category: 'HEALTH BARS|Enemy Colors' },
      { id: 'hp_counter_visible', type: 'toggle', label: 'Show HP number', defaultValue: true, currentValue: true, category: 'HEALTH BARS|Number Overlay' },
      { id: 'hp_level_number_visible', type: 'toggle', label: 'Show level number', defaultValue: true, currentValue: true, category: 'HEALTH BARS|Number Overlay' },
      { id: 'hp_pip_visible', type: 'toggle', label: 'Show pip HP segments', defaultValue: true, currentValue: true, category: 'HEALTH BARS|Number Overlay' },
      { id: 'hp_friend_enabled', type: 'toggle', label: 'Color ally HP bars', defaultValue: true, currentValue: true, category: 'HEALTH BARS|Ally Colors' },
      { id: 'hp_friend_pulse_enabled', type: 'toggle', label: 'Pulse ally bars', defaultValue: true, currentValue: true, category: 'HEALTH BARS|Ally Colors', visibleWhen: { id: 'hp_friend_enabled', equals: true } },
      { id: 'hp_friend_pulse_color_enabled', type: 'toggle', label: 'Use custom ally pulse color', defaultValue: true, currentValue: true, category: 'HEALTH BARS|Ally Colors', visibleWhen: { id: 'hp_friend_pulse_enabled', equals: true } },
      { id: 'hp_pulse_enabled', type: 'toggle', label: 'Pulse at low HP', defaultValue: true, currentValue: true, category: 'VISUAL EFFECTS|Low HP Pulse' },
      { id: 'hp_pulse_color_enabled', type: 'toggle', label: 'Use custom pulse color', defaultValue: true, currentValue: true, category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_pulse_hide_bar', type: 'toggle', label: 'Hide bar while pulsing', defaultValue: true, currentValue: true, category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_pulse_text_enabled', type: 'toggle', label: 'Pulse HP number', defaultValue: true, currentValue: true, category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_kill_zone_enabled', type: 'toggle', label: 'Show kill marker', defaultValue: true, currentValue: true, category: 'VISUAL EFFECTS|Kill Marker' }
    ]
  };
  root.AnitaUI.Register(config);
  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();

  function activateCategory(mainText, subText) {
    const mainBtn = findByClass(root, 'AnitaMainCategoryBtn')
      .find(button => button.children.some(child => child.text === mainText));
    assert(mainBtn && mainBtn.events.onactivate, `Missing main category button: ${mainText}`);
    mainBtn.events.onactivate();
    const subBtn = findByClass(root, 'AnitaSubCategoryBtn')
      .find(button => button.children.some(child => child.text === subText));
    assert(subBtn && subBtn.events.onactivate, `Missing subcategory button: ${mainText}|${subText}`);
    subBtn.events.onactivate();
  }

  function clickToggle(id, mainText, subText) {
    activateCategory(mainText, subText);
    const element = config.elements.find(item => item.id === id);
    assert(element && element.__anitaRowPanel && element.__anitaRowPanel.IsValid && element.__anitaRowPanel.IsValid(),
      `Toggle row did not render for ${id}`);
    assert(element.__anitaRowPanel.style.visibility !== 'collapse',
      `Toggle row should be visible before click: ${id}`);
    assert(!element.runtimeLocked && !element.__anitaRowPanel.BHasClass('AnitaRuntimeLocked'),
      `Non-General toggle should remain interactive: ${id}`);
    const btn = findByClass(element.__anitaRowPanel, 'AnitaToggleBtn')[0];
    assert(btn && btn.events.onactivate, `Toggle button missing activation handler: ${id}`);
    const before = element.currentValue;
    dispatched.length = 0;
    btn.events.onactivate();
    assert(element.currentValue === !before,
      `Toggle did not flip ${id}: ${before} -> ${element.currentValue}`);
    const update = dispatched
      .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
      .map(args => {
        try { return JSON.parse(args[1]); } catch (err) { return null; }
      })
      .find(payload => payload && payload.magic_word === 'ANITA_UPDATE' && payload.setting_id === id);
    assert(update && update.value === element.currentValue,
      `Toggle did not emit update for ${id}: ${JSON.stringify(dispatched)}`);
  }

  [
    ['hp_ult_color_enabled', 'HEALTH BARS', 'Enemy Colors'],
    ['hp_counter_visible', 'HEALTH BARS', 'Number Overlay'],
    ['hp_level_number_visible', 'HEALTH BARS', 'Number Overlay'],
    ['hp_pip_visible', 'HEALTH BARS', 'Number Overlay'],
    ['hp_friend_pulse_color_enabled', 'HEALTH BARS', 'Ally Colors'],
    ['hp_friend_pulse_enabled', 'HEALTH BARS', 'Ally Colors'],
    ['hp_friend_enabled', 'HEALTH BARS', 'Ally Colors'],
    ['hp_pulse_color_enabled', 'VISUAL EFFECTS', 'Low HP Pulse'],
    ['hp_pulse_text_enabled', 'VISUAL EFFECTS', 'Low HP Pulse'],
    ['hp_pulse_enabled', 'VISUAL EFFECTS', 'Low HP Pulse'],
    ['hp_kill_zone_enabled', 'VISUAL EFFECTS', 'Kill Marker']
  ].forEach(item => clickToggle(item[0], item[1], item[2]));

  const skipBuildings = config.elements.find(item => item.id === 'hp_skip_buildings');
  assert(skipBuildings && !skipBuildings.runtimeLocked,
    'HP Colors should leave Ignore buildings and bosses interactive');

  console.log(`[HERO TOGGLE AUDIT PASS] ${path.relative(ROOT, targetScript)} keeps HP Colors toggles clickable and emitting updates.`);
}

function runDependentCustomizationVisibilityValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;
  resetPresetStoreLookupCounters();

  const context = createMockContext();
  runInVm(source, context, targetScript);
  installMockPresetStore([]);

  const config = {
    title: 'HP Colors',
    description: 'dependent customization visibility validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', label: 'Enable enemy HP colors', defaultValue: true, currentValue: true, category: 'GENERAL|Core Behavior' },
      { id: 'hp_mode', type: 'cycler', label: 'Enemy color behavior', options: ['Fixed', 'Gradient'], defaultValue: 1, currentValue: 1, category: 'GENERAL|Core Behavior' },
      { id: 'hp_ult_color_enabled', type: 'toggle', label: 'Color ult icon', defaultValue: true, currentValue: true, category: 'HEALTH BARS|Enemy Colors' },
      { id: 'hp_ult_color_custom', type: 'colorpicker', label: 'Ult icon custom color', defaultValue: '#E16161', currentValue: '#E16161', category: 'HEALTH BARS|Enemy Colors', visibleWhen: { id: 'hp_ult_color_enabled', equals: false } },
      { id: 'hp_friend_enabled', type: 'toggle', label: 'Color ally HP bars', defaultValue: false, currentValue: false, category: 'HEALTH BARS|Ally Colors' },
      { id: 'hp_friend_color_low', type: 'colorpicker', label: 'Ally low HP color', defaultValue: '#E16161', currentValue: '#E16161', category: 'HEALTH BARS|Ally Colors', visibleWhen: { id: 'hp_friend_enabled', equals: true } },
      { id: 'hp_friend_color_mid', type: 'colorpicker', label: 'Ally mid HP color', defaultValue: '#FF7B00', currentValue: '#FF7B00', category: 'HEALTH BARS|Ally Colors', visibleWhen: { id: 'hp_friend_enabled', equals: true } },
      { id: 'hp_friend_color_high', type: 'colorpicker', label: 'Ally high HP color', defaultValue: '#00FF00', currentValue: '#00FF00', category: 'HEALTH BARS|Ally Colors', visibleWhen: { id: 'hp_friend_enabled', equals: true } },
      { id: 'hp_friend_pulse_enabled', type: 'toggle', label: 'Pulse ally bars', defaultValue: false, currentValue: false, category: 'HEALTH BARS|Ally Colors', visibleWhen: { id: 'hp_friend_enabled', equals: true } },
      { id: 'hp_friend_pulse_threshold', type: 'slider', label: 'Ally pulse starts below %', defaultValue: 25, currentValue: 25, category: 'HEALTH BARS|Ally Colors', min: 0, max: 100, step: 1, visibleWhen: { id: 'hp_friend_pulse_enabled', equals: true } },
      { id: 'hp_friend_pulse_bpm', type: 'slider', label: 'Ally pulse speed', defaultValue: 75, currentValue: 75, category: 'HEALTH BARS|Ally Colors', min: 30, max: 300, step: 1, visibleWhen: { id: 'hp_friend_pulse_enabled', equals: true } },
      { id: 'hp_friend_pulse_intensity', type: 'cycler', label: 'Ally pulse strength', options: ['Subtle', 'Medium', 'Intense'], defaultValue: 1, currentValue: 1, category: 'HEALTH BARS|Ally Colors', visibleWhen: { id: 'hp_friend_pulse_enabled', equals: true } },
      { id: 'hp_friend_pulse_color_enabled', type: 'toggle', label: 'Use custom ally pulse color', defaultValue: false, currentValue: false, category: 'HEALTH BARS|Ally Colors', visibleWhen: { id: 'hp_friend_pulse_enabled', equals: true } },
      { id: 'hp_friend_pulse_color', type: 'colorpicker', label: 'Ally pulse color', defaultValue: '#FF2222', currentValue: '#FF2222', category: 'HEALTH BARS|Ally Colors', visibleWhen: { id: 'hp_friend_pulse_color_enabled', equals: true } },
      { id: 'hp_pulse_enabled', type: 'toggle', label: 'Pulse at low HP', defaultValue: false, currentValue: false, category: 'VISUAL EFFECTS|Low HP Pulse' },
      { id: 'hp_pulse_threshold', type: 'slider', label: 'Pulse starts below %', defaultValue: 25, currentValue: 25, category: 'VISUAL EFFECTS|Low HP Pulse', min: 0, max: 100, step: 1, visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_pulse_bpm', type: 'slider', label: 'Pulse speed', defaultValue: 75, currentValue: 75, category: 'VISUAL EFFECTS|Low HP Pulse', min: 30, max: 300, step: 1, visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_pulse_intensity', type: 'cycler', label: 'Pulse strength', options: ['Subtle', 'Medium', 'Intense'], defaultValue: 1, currentValue: 1, category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_pulse_color_enabled', type: 'toggle', label: 'Use custom pulse color', defaultValue: false, currentValue: false, category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_pulse_color_mode', type: 'cycler', label: 'Pulse color behavior', options: ['Fixed', 'Gradient'], defaultValue: 0, currentValue: 0, category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_color_enabled', equals: true } },
      { id: 'hp_pulse_color', type: 'colorpicker', label: 'Pulse color', defaultValue: '#FF2222', currentValue: '#FF2222', category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_color_enabled', equals: true } },
      { id: 'hp_pulse_hide_bar', type: 'toggle', label: 'Hide bar while pulsing', defaultValue: false, currentValue: false, category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_pulse_text_enabled', type: 'toggle', label: 'Pulse HP number', defaultValue: false, currentValue: false, category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_enabled', equals: true } },
      { id: 'hp_pulse_text_scale', type: 'slider', label: 'Pulsing number size', defaultValue: 120, currentValue: 120, category: 'VISUAL EFFECTS|Low HP Pulse', min: 72, max: 320, step: 1, visibleWhen: { id: 'hp_pulse_text_enabled', equals: true } },
      { id: 'hp_pulse_text_position', type: 'positionpicker', label: 'Pulsing number position', defaultValue: '20,196', currentValue: '20,196', category: 'VISUAL EFFECTS|Low HP Pulse', visibleWhen: { id: 'hp_pulse_text_enabled', equals: true } },
      { id: 'hp_kill_zone_enabled', type: 'toggle', label: 'Show kill marker', defaultValue: false, currentValue: false, category: 'VISUAL EFFECTS|Kill Marker' },
      { id: 'hp_kill_zone_threshold', type: 'slider', label: 'Marker position %', defaultValue: 25, currentValue: 25, category: 'VISUAL EFFECTS|Kill Marker', min: 5, max: 80, step: 1, visibleWhen: { id: 'hp_kill_zone_enabled', equals: true } },
      { id: 'hp_kill_zone_color', type: 'colorpicker', label: 'Marker color', defaultValue: '#FF2222', currentValue: '#FF2222', category: 'VISUAL EFFECTS|Kill Marker', visibleWhen: { id: 'hp_kill_zone_enabled', equals: true } },
      { id: 'hp_kill_zone_width', type: 'slider', label: 'Marker width', defaultValue: 3, currentValue: 3, category: 'VISUAL EFFECTS|Kill Marker', min: 1, max: 100, step: 1, visibleWhen: { id: 'hp_kill_zone_enabled', equals: true } }
    ]
  };
  root.AnitaUI.Register(config);
  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();

  function activateCategory(mainText, subText) {
    const mainBtn = findByClass(root, 'AnitaMainCategoryBtn')
      .find(button => button.children.some(child => child.text === mainText));
    assert(mainBtn && mainBtn.events.onactivate, `Missing main category button: ${mainText}`);
    mainBtn.events.onactivate();
    const subBtn = findByClass(root, 'AnitaSubCategoryBtn')
      .find(button => button.children.some(child => child.text === subText));
    assert(subBtn && subBtn.events.onactivate, `Missing subcategory button: ${mainText}|${subText}`);
    subBtn.events.onactivate();
  }

  function elementById(id) {
    return config.elements.find(item => item.id === id);
  }

  function fireCoreUpdate(settingId, value) {
    assert(typeof eventHandlers.ClientUI_FireOutput === 'function',
      'Anita UI did not register update bridge listener');
    eventHandlers.ClientUI_FireOutput(JSON.stringify({
      magic_word: 'ANITA_UPDATE',
      mod_title: 'HP Colors',
      setting_id: settingId,
      value
    }));
  }

  function fireCoreBulk(values, updateSource) {
    assert(typeof eventHandlers.ClientUI_FireOutput === 'function',
      'Anita UI did not register bulk update bridge listener');
    eventHandlers.ClientUI_FireOutput(JSON.stringify({
      magic_word: 'ANITA_BULK_UPDATE',
      mod_title: 'HP Colors',
      update_source: updateSource || 'validator_targeted_visibility',
      values
    }));
  }

  function assertVisible(id, visible) {
    const element = elementById(id);
    assert(element && element.__anitaRowPanel && element.__anitaRowPanel.IsValid && element.__anitaRowPanel.IsValid(),
      `Dependent row did not render for ${id}`);
    const actual = element.__anitaRowPanel.style.visibility !== 'collapse';
    assert(actual === visible,
      `Dependent row visibility mismatch for ${id}: expected ${visible}, got ${actual}`);
  }

  function toggleOn(id) {
    const element = elementById(id);
    assert(element, `Missing toggle ${id}`);
    if (element.currentValue === true) return;
    const btn = findByClass(element.__anitaRowPanel, 'AnitaToggleBtn')[0];
    assert(btn && btn.events.onactivate, `Missing toggle button for ${id}`);
    btn.events.onactivate();
    assert(element.currentValue === true, `Toggle did not turn on ${id}`);
  }

  function toggleOff(id) {
    const element = elementById(id);
    assert(element, `Missing toggle ${id}`);
    if (element.currentValue === false) return;
    const btn = findByClass(element.__anitaRowPanel, 'AnitaToggleBtn')[0];
    assert(btn && btn.events.onactivate, `Missing toggle button for ${id}`);
    btn.events.onactivate();
    assert(element.currentValue === false, `Toggle did not turn off ${id}`);
  }

  activateCategory('HEALTH BARS', 'Enemy Colors');
  assertVisible('hp_ult_color_custom', false);
  toggleOff('hp_ult_color_enabled');
  assertVisible('hp_ult_color_custom', true);

  activateCategory('HEALTH BARS', 'Ally Colors');
  assertVisible('hp_friend_color_low', false);
  assertVisible('hp_friend_pulse_threshold', false);
  fireCoreBulk({ hp_friend_enabled: true }, 'validator_bulk_visibility');
  assert(elementById('hp_friend_enabled').currentValue === true,
    'Bulk update did not set hp_friend_enabled');
  ['hp_friend_color_low', 'hp_friend_color_mid', 'hp_friend_color_high', 'hp_friend_pulse_enabled']
    .forEach(id => assertVisible(id, true));
  assertVisible('hp_friend_pulse_threshold', false);
  fireCoreUpdate('hp_friend_pulse_enabled', true);
  assert(elementById('hp_friend_pulse_enabled').currentValue === true,
    'Single update did not set hp_friend_pulse_enabled');
  ['hp_friend_pulse_threshold', 'hp_friend_pulse_bpm', 'hp_friend_pulse_intensity', 'hp_friend_pulse_color_enabled']
    .forEach(id => assertVisible(id, true));
  toggleOn('hp_friend_pulse_color_enabled');
  assertVisible('hp_friend_pulse_color', true);

  activateCategory('VISUAL EFFECTS', 'Low HP Pulse');
  assertVisible('hp_pulse_threshold', false);
  toggleOn('hp_pulse_enabled');
  ['hp_pulse_threshold', 'hp_pulse_bpm', 'hp_pulse_intensity', 'hp_pulse_color_enabled', 'hp_pulse_hide_bar', 'hp_pulse_text_enabled']
    .forEach(id => assertVisible(id, true));
  toggleOn('hp_pulse_color_enabled');
  ['hp_pulse_color_mode', 'hp_pulse_color'].forEach(id => assertVisible(id, true));
  toggleOn('hp_pulse_text_enabled');
  ['hp_pulse_text_scale', 'hp_pulse_text_position'].forEach(id => assertVisible(id, true));

  activateCategory('VISUAL EFFECTS', 'Kill Marker');
  assertVisible('hp_kill_zone_threshold', false);
  toggleOn('hp_kill_zone_enabled');
  ['hp_kill_zone_threshold', 'hp_kill_zone_color', 'hp_kill_zone_width']
    .forEach(id => assertVisible(id, true));

  console.log(`[HERO DEPENDENT SETTINGS PASS] ${path.relative(ROOT, targetScript)} reveals dependent customization rows when parent toggles are enabled.`);
}
function runRetainedSettingsShellValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  const marker = '\n  AnitaCore.init();';
  const hookedSource = source.replace(marker, `
  if (typeof global !== "undefined") {
    global.__anitaRetainedShellTestHooks = {
      renderer: AnitaRenderer
    };
  }
` + marker);
  assert(hookedSource !== source,
    'Retained shell test hook marker should be present');

  const context = createMockContext();
  runInVm(hookedSource, context, targetScript);
  installMockPresetStore([]);
  const renderer = context.__anitaRetainedShellTestHooks.renderer;
  const config = {
    title: 'HP Colors',
    description: 'retained shell validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'GENERAL|Core' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'GENERAL|Thresholds', min: 0, max: 100, step: 1 },
      { id: 'hp_pulse_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'VISUAL EFFECTS|Pulse' }
    ]
  };

  activeHarness.createPanelCount = 0;
  activeHarness.eventSetCounter.count = 0;
  root.AnitaUI.Register(config);
  const initialShellPanelCount = activeHarness.createPanelCount;
  const initialShellHandlerCount = activeHarness.eventSetCounter.count;
  const container = findByClass(root, 'ModContainer')[0];
  const tree = findByClass(root, 'AnitaTreePanel')[0];
  const treeButtons = findByClass(root, 'AnitaMainCategoryBtn');
  const firstDetailBody = findByClass(root, 'AnitaDetailBody')[0];
  assert(container && tree && treeButtons.length >= 2 && firstDetailBody,
    'Retained shell validation requires a rendered shell with multiple categories');

  let colorPickerCloseCount = 0;
  renderer.activeColorPickerClose = () => {
    colorPickerCloseCount += 1;
  };

  activeHarness.createPanelCount = 0;
  activeHarness.eventSetCounter.count = 0;
  renderer.renderModSettings(config);
  const retainedProjectionPanelCount = activeHarness.createPanelCount;
  const retainedProjectionHandlerCount = activeHarness.eventSetCounter.count;
  assert(colorPickerCloseCount === 1 &&
      renderer.activeColorPickerClose === null,
    'Settings rerender should close and release the active color picker owner');
  assert(findByClass(root, 'ModContainer')[0] === container &&
      findByClass(root, 'AnitaTreePanel')[0] === tree,
    'Repeated settings render should retain the container and tree');
  const retainedTreeButtons = findByClass(root, 'AnitaMainCategoryBtn');
  assert(retainedTreeButtons.length === treeButtons.length &&
      retainedTreeButtons.every((button, index) => button === treeButtons[index]),
    'Repeated settings render should retain category buttons and handlers');
  assert(findByClass(root, 'AnitaDetailBody')[0] !== firstDetailBody,
    'Repeated settings render should replace the detail projection');
  assert(retainedProjectionPanelCount < initialShellPanelCount,
    `Retained projection should allocate fewer panels than the initial shell: ${retainedProjectionPanelCount} vs ${initialShellPanelCount}`);
  assert(retainedProjectionHandlerCount < initialShellHandlerCount,
    `Retained projection should install fewer panel handlers than the initial shell: ${retainedProjectionHandlerCount} vs ${initialShellHandlerCount}`);

  const nextMain = retainedTreeButtons.find(button => !button.BHasClass('Active'));
  const detailBeforeSwitch = findByClass(root, 'AnitaDetailBody')[0];
  assert(nextMain && nextMain.events.onactivate,
    'Retained shell validation requires another main category');
  nextMain.events.onactivate();
  assert(findByClass(root, 'AnitaTreePanel')[0] === tree &&
      nextMain.BHasClass('Active') &&
      findByClass(root, 'AnitaDetailBody')[0] !== detailBeforeSwitch,
    'Category switch should update the retained tree and replace only detail content');
  const visibleSubcategories = findByClass(root, 'AnitaSubCategoryBtn')
    .filter(button => button.style.visibility !== 'collapse');
  assert(visibleSubcategories.length > 0 &&
      visibleSubcategories.some(button => button.BHasClass('Active')),
    'Retained tree should expose the active main category subcategories');

  assert(config.elements.some(element =>
      element.__anitaRowPanel && element.__anitaRowPanel.IsValid()),
    'Active detail projection should retain live row references');
  const replacementConfig = {
    title: 'Renderer Replacement',
    storageNamespace: 'renderer_replacement',
    storageVersion: 1,
    elements: [
      { id: 'replacement_toggle', type: 'toggle', defaultValue: false, currentValue: false, category: 'GENERAL|Core' }
    ]
  };
  renderer.renderModSettings(replacementConfig);
  assert(config.elements.every(element =>
      element.__anitaRowPanel === null &&
      element.__anitaConditionalMarker === null &&
      element.__anitaConditionalEligible === false) &&
      config.__anitaPresetNotice === null,
    'Replacing the shell should clear previous config panel references and flags');
  assert(!container.IsValid() &&
      findByClass(root, 'ModContainer')[0] !== container,
    'Replacing the shell should delete the previous config panels');

  root.DeleteAsync();
  eventHandlers.ClientUI_FireOutput('{}');
  assert(renderer.settingsShell === null,
    'Anita teardown should release retained shell panel references');
  assert(replacementConfig.elements[0].__anitaRowPanel === null,
    'Anita teardown should clear the final config row reference');

  console.log(`[ANITA RETAINED SHELL PASS] ${path.relative(ROOT, targetScript)} retains the container/category tree, cuts focused-rerender allocations from ${initialShellPanelCount} panels and ${initialShellHandlerCount} panel-handler writes to ${retainedProjectionPanelCount} and ${retainedProjectionHandlerCount}, and releases refs on replacement/teardown.`);
}

function runPresetSnapshotPublisherValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  const marker = '\n  AnitaCore.init();';
  const hookedSource = source.replace(marker, `
  if (typeof global !== "undefined") {
    global.__hpPresetSnapshotTestHooks = {
      publisher: HPPresetSnapshotPublisher,
      core: AnitaCore,
      persistence: AnitaPersistence,
      conditional: HPSignatureConditionalController
    };
  }
` + marker);
  assert(hookedSource !== source,
    'Preset snapshot test hook marker should be present');

  let stringifyCount = 0;
  const context = createMockContext();
  context.Date = class SnapshotTestDate extends Date {
    static now() { return activeHarness.now; }
  };
  context.JSON = {
    parse: JSON.parse,
    stringify: (value) => {
      stringifyCount += 1;
      return JSON.stringify(value);
    }
  };
  runInVm(hookedSource, context, targetScript);
  const publisher = context.__hpPresetSnapshotTestHooks.publisher;
  const config = makePresetBuilderConfig();

  stringifyCount = 0;
  dispatched.length = 0;
  const first = publisher.publish(config, 'snapshot_first', true);
  assert(first && first.emittableCount === config.elements.length &&
      stringifyCount === 2,
    `First snapshot without signature rules should encode base and payload once: ${stringifyCount}`);
  const firstPayload = publisher.payload;
  const firstHotUntil = publisher.replayHotUntil;

  activeHarness.now += 1000;
  stringifyCount = 0;
  dispatched.length = 0;
  const unchanged = publisher.publish(config, 'snapshot_unchanged', false);
  const unchangedDispatches = dispatched.filter(args => {
    if (args[0] !== 'ClientUI_FireOutput') return false;
    try {
      return JSON.parse(args[1]).magic_word === 'HP_COLORS_PRESET_SNAPSHOT';
    } catch (err) {
      return false;
    }
  });
  assert(unchanged && stringifyCount === 1 &&
      publisher.payload === firstPayload &&
      publisher.replayHotUntil === firstHotUntil &&
      unchangedDispatches.length === 0,
    'Unchanged snapshots without signature rules should only encode base values');
  const emitConfig = makePresetBuilderConfig();
  const originalSanitizeValue = context.__hpPresetSnapshotTestHooks.persistence.sanitizeValue;
  let sanitizeCount = 0;
  context.__hpPresetSnapshotTestHooks.persistence.sanitizeValue = function (element, value) {
    sanitizeCount += 1;
    return originalSanitizeValue.call(this, element, value);
  };
  context.__hpPresetSnapshotTestHooks.core.emitCurrentValues(emitConfig, {
    update_source: 'snapshot_single_materialization',
    force_emit: true,
    bulk_emit: true
  });
  assert(sanitizeCount === emitConfig.elements.length,
    `HP Colors emit should sanitize each setting once, saw ${sanitizeCount} for ${emitConfig.elements.length} settings`);
  context.__hpPresetSnapshotTestHooks.persistence.sanitizeValue = originalSanitizeValue;

  const bulkConfig = makePresetBuilderConfig();
  context.__hpPresetSnapshotTestHooks.core.registerMod(bulkConfig);
  const conditional = context.__hpPresetSnapshotTestHooks.conditional;
  const originalNotifyBaseValuesChanged =
    conditional.notifyBaseValuesChanged;
  const originalPublish = publisher.publish;
  let notifyCount = 0;
  let publishCount = 0;
  conditional.notifyBaseValuesChanged = function (nextConfig, shouldPublish) {
    notifyCount += 1;
    return originalNotifyBaseValuesChanged.call(
      this,
      nextConfig,
      shouldPublish,
    );
  };
  publisher.publish = function () {
    publishCount += 1;
    return originalPublish.apply(this, arguments);
  };
  const bulkValues = {
    hp_enabled: false,
    hp_low_threshold: 44,
    hp_kill_zone_enabled: true
  };
  context.__hpPresetSnapshotTestHooks.core.handleBulkUpdateEvent({
    mod_title: 'HP Colors',
    values: bulkValues,
    update_source: 'unit_test_bulk',
    skip_bridge_persist: true
  });
  assert(notifyCount === 1 && publishCount === 1,
    `One changed bulk update must coalesce marker refresh and snapshot publication: ${JSON.stringify({ notifyCount, publishCount })}`);
  context.__hpPresetSnapshotTestHooks.core.handleBulkUpdateEvent({
    mod_title: 'HP Colors',
    values: bulkValues,
    update_source: 'unit_test_bulk',
    skip_bridge_persist: true
  });
  assert(notifyCount === 1 && publishCount === 1,
    `Unchanged bulk updates must not refresh markers or publish snapshots: ${JSON.stringify({ notifyCount, publishCount })}`);
  conditional.notifyBaseValuesChanged = originalNotifyBaseValuesChanged;
  publisher.publish = originalPublish;

  config.elements[1].currentValue = 44;
  activeHarness.now += 1000;
  stringifyCount = 0;
  dispatched.length = 0;
  const changed = publisher.publish(config, 'snapshot_changed', false);
  const changedPayload = JSON.parse(publisher.payload);
  assert(changed && stringifyCount === 2 &&
      changedPayload.values.hp_low_threshold === 44 &&
      changedPayload.update_source === 'snapshot_changed' &&
      publisher.replayHotUntil > firstHotUntil,
    `Changed snapshots should publish one newly materialized payload: ${JSON.stringify({ stringifyCount, changedPayload, firstHotUntil, replayHotUntil: publisher.replayHotUntil, now: activeHarness.now })}`);
  root.DeleteAsync();
  eventHandlers.ClientUI_FireOutput('{}');
  assert(publisher.payload === '' && !publisher.replayStarted &&
      publisher.replayCount === 0 && publisher.replayHotUntil === 0,
    'Preset snapshot teardown should release retained payload and replay state');

  console.log(`[HP PRESET SNAPSHOT PASS] ${path.relative(ROOT, targetScript)} materializes values once and skips unchanged payload encoding, dispatch, and replay reheating.`);
}


function runAnitaLifetimeOwnerValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  const directSchedules = source.match(/\$\.Schedule\(/g) || [];
  assert(directSchedules.length === 1,
    `Anita lifetime owner should be the only direct scheduler, saw ${directSchedules.length}`);
  assert(source.includes('var AnitaLifetime = {') &&
      source.includes('$.UnregisterForUnhandledEvent('),
    'Anita UI should own callback and listener teardown');
  const hookMarker = '\n  AnitaCore.init();';
  const hookedSource = source.replace(hookMarker, `
  if (typeof global !== "undefined") {
    global.__anitaLifetimeTestHooks = {
      emitUpdateThrottled: emitUpdateThrottled,
      cancelThrottledEmit: cancelThrottledEmit,
      mouseRouter: AnitaMouseRouter
    };
  }
` + hookMarker);
  assert(hookedSource !== source,
    'Anita lifetime test hook marker should be present');

  const context = createMockContext();
  runInVm(hookedSource, context, targetScript);
  const eventHandler = eventHandlers.ClientUI_FireOutput;
  assert(typeof eventHandler === 'function',
    'Anita lifetime test requires the ClientUI_FireOutput listener');
  assert(scheduled.length > 0,
    'Anita lifetime test requires owned scheduled work');
  const hooks = context.__anitaLifetimeTestHooks;
  assert(hooks && typeof hooks.emitUpdateThrottled === 'function',
    'Anita lifetime test hooks were not exposed');
  hooks.mouseRouter.setModalHandler(root, () => false);
  assert(typeof activeHarness.mouseCallback === 'function' &&
      activeHarness.mouseCallbackWrites === 1,
    'Anita lifetime test requires one installed GameUI mouse callback');
  dispatched.length = 0;
  hooks.emitUpdateThrottled('Lifetime Race', 'setting', 1, null, 0.04);
  hooks.cancelThrottledEmit('Lifetime Race', 'setting');
  hooks.emitUpdateThrottled('Lifetime Race', 'setting', 2, null, 0.04);
  runNextScheduledByDelay(0.04);
  hooks.emitUpdateThrottled('Lifetime Race', 'setting', 3, null, 0.04);
  assert(scheduled.filter(job => Number(job.delay) === 0.04).length === 1,
    'A cancelled throttled callback cleared ownership of its replacement');
  runNextScheduledByDelay(0.04);
  const raceUpdates = dispatched
    .filter(args => args[0] === 'ClientUI_FireOutput')
    .map(args => {
      try { return JSON.parse(args[1]); } catch (err) { return null; }
    })
    .filter(payload => payload && payload.mod_title === 'Lifetime Race');
  assert(raceUpdates.length === 1 && raceUpdates[0].value === 3,
    `Throttled replacement should emit only the latest value: ${JSON.stringify(raceUpdates)}`);

  const dispatchCountAtTeardown = dispatched.length;
  root.DeleteAsync();
  eventHandler('{}');
  assert(activeHarness.handlerEntries.length === 0 &&
      !activeHarness.handlers.ClientUI_FireOutput,
    `Anita teardown retained its unhandled-event listener: ${JSON.stringify(activeHarness.handlerEntries)}`);
  assert(activeHarness.mouseCallback === null &&
      activeHarness.mouseCallbackWrites === 2,
    'Anita teardown should release the GameUI mouse callback exactly once');
  for (let i = 0; i < 100 && scheduled.length; i++) {
    activeHarness.scheduler.runNext();
  }
  assert(scheduled.length === 0,
    `Anita teardown callbacks should drain without requeueing: ${JSON.stringify(scheduled.map(job => job.delay))}`);
  assert(dispatched.length === dispatchCountAtTeardown,
    'Anita teardown allowed stale scheduled work to dispatch events');

  console.log(`[ANITA LIFETIME PASS] ${path.relative(ROOT, targetScript)} unregisters its listener and drains stale callbacks when the Panorama root dies.`);
}

try {
  runValidation();
  if (!IS_OPTIMIZED_TARGET) runPipConvarPopupValidation();
  runSignatureTierConditionalValidation();
  runBakedPresetPayloadCompatibilityValidation();
  runHeroPresetApplyValidation();
  runHeroPresetStableIdPriorityValidation();
  runHeroPresetGlobalFallbackBeforeHeroValidation();
  runHeroPresetLobbyGateValidation();
  if (!IS_OPTIMIZED_TARGET) runSignatureTierLifecycleResetValidation();
  runMatchMonitorRollbackValidation();
  runHeroSelectorRuntimeScopeValidation();
  runHeroScopeModeFallbackValidation();
  runHeroScopeLiveEditValidation();
  runHeroBundleScopeTokenValidation();
  runUserPresetBundleValidation();
  runUserPresetRenameValidation();
  runPresetDeleteValidation();
  if (!IS_OPTIMIZED_TARGET) runPresetBuilderModelActionValidation();
  runPresetBuilderCompatibilityValidation();
  if (!IS_OPTIMIZED_TARGET) runRetainedSettingsShellValidation();
  runPresetPriorityBundleValidation();
  runAllNonGeneralToggleValidation();
  if (!IS_OPTIMIZED_TARGET) runPresetSnapshotPublisherValidation();
  runDependentCustomizationVisibilityValidation();
  if (!IS_OPTIMIZED_TARGET) runAnitaLifetimeOwnerValidation();
} catch (err) {
  console.error(`[HERO SELECTOR FAIL] ${path.relative(ROOT, targetScript)}: ${err && err.stack ? err.stack : err && err.message ? err.message : err}`);
  process.exit(1);
}
