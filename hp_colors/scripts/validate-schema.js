#!/usr/bin/env node
'use strict';
/**
 * Schema drift audit for hp_colors.
 * Validates that SCHEMA, DEFAULTS, aliases, and runtime maps stay in sync.
 * Exit 0 on pass, exit 1 on failure.
 */

const fs = require('fs');
const path = require('path');
const {
  HP_COLORS_LANE_CONTRACT,
  HP_EXPECTED_LOOP_REASONS,
  checkFullSettingsContract,
  checkFunctionDeclarationCap,
  checkLevelTierCssParity,
  checkLoopReasonContract,
  checkObjectInterface,
  checkRuntimePanelIds,
} = require('../../scripts/hp-colors-validator-contract.js');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS_DIR = path.join(ROOT, 'hp_colors', 'panorama', 'scripts');
const STYLES_DIR = path.join(ROOT, 'hp_colors', 'panorama', 'styles');
const LAYOUTS_DIR = path.join(ROOT, 'hp_colors', 'panorama', 'layout');
const MAX_HEALTHBAR_RUNTIME_FUNCTIONS = 95;
const EXPECTED_HP_COLORS_SETTING_COUNT = HP_COLORS_LANE_CONTRACT.full.expectedCount;
const ALLOWED_RUNTIME_PANEL_IDS = new Set([
  'UnitStatus',
  'InfoHealthContainer',
  'UnitHealthbarContainer',
  'unit_healthbar_lagging',
  'unit_healthbar_healing',
  'unit_healthbar_delta',
  'unit_healthbar_bullet_shield',
  'unit_healthbar_bg',
  'unit_healthbar_pip_label',
  'unit_ult_ready_icon',
  'name',
  'hp_counter',
  'hp_counter_anchor',
  'hp_kill_zone_marker',
  'unit_level_label',
  'LevelContainer'
]);
const FORBIDDEN_RUNTIME_PANEL_IDS = ['health_bar', 'unit_health', 'ult_icon'];


function readFile(name) {
  return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf-8').replace(/\r\n/g, '\n');
}

function readStyleFile(name) {
  return fs.readFileSync(path.join(STYLES_DIR, name), 'utf-8').replace(/\r\n/g, '\n');
}

function readLayoutFile(name) {
  return fs.readFileSync(path.join(LAYOUTS_DIR, name), 'utf-8').replace(/\r\n/g, '\n');
}

function extractPanoramaScriptIncludes(text) {
  return Array.from(text.matchAll(/scripts\/([^"']+\.vjs_c)/g), match => match[1]).sort();
}



function main() {
  const healthbar = readFile('healthbar_logic.js');
  const uiCore = readFile('anita_ui_core.js');
  const uiStyle = readStyleFile('anita_ui.css');
  const unitStyle = readStyleFile('unit_status.css');
  const baseHud = readLayoutFile('base_hud.xml');
  const unitStatusOverlay = readLayoutFile('unit_status_overlay.xml');

  const fullContractReport = checkFullSettingsContract(uiCore, healthbar);
  const schemaIds = fullContractReport.contract.schemaIds || [];
  const errors = fullContractReport.errors.slice();

  if (schemaIds.length !== EXPECTED_HP_COLORS_SETTING_COUNT) {
    errors.push(`HP Colors setting count changed: expected ${EXPECTED_HP_COLORS_SETTING_COUNT}, got ${schemaIds.length}`);
  }

  const sourceScripts = fs.readdirSync(SCRIPTS_DIR)
    .filter(name => name.endsWith('.js'))
    .sort();
  const expectedSourceScripts = ['anita_ui_core.js', 'healthbar_logic.js'];
  if (sourceScripts.join('|') !== expectedSourceScripts.join('|')) {
    errors.push(`hp_colors panorama script set must be exactly ${expectedSourceScripts.join(', ')}, got: ${sourceScripts.join(', ') || '(none)'}`);
  }

  if (errors.length) {
    errors.forEach(e => console.error('[AUDIT ERROR]', e));
    process.exit(1);
  }

  checkFunctionDeclarationCap(errors, 'healthbar_logic.js', healthbar, MAX_HEALTHBAR_RUNTIME_FUNCTIONS);
  checkRuntimePanelIds(errors, 'healthbar_logic.js', healthbar, ALLOWED_RUNTIME_PANEL_IDS, FORBIDDEN_RUNTIME_PANEL_IDS);
  for (const runtimeMarker of [
    'var UNIT_STATUS_TARGET_SNAPSHOT = {',
    'var loopScheduleReason = ["", "", ""];',
    'var loopLastRunReason = ["", "", ""];',
    'var LOOP_REASON_ALLOWLIST = {'
  ]) {
    if (!healthbar.includes(runtimeMarker)) {
      errors.push(`healthbar_logic.js missing runtime safety marker: ${runtimeMarker}`);
    }
  }
  for (const deadRuntimeMarker of [
    'var ALLY_STATUS_TARGET_SNAPSHOT = {',
    'classifyAlly: function',
    'allySnapshot:',
    'applyKillMarkerPlan: function'
  ]) {
    if (healthbar.includes(deadRuntimeMarker)) {
      errors.push(`healthbar_logic.js retained dead runtime marker: ${deadRuntimeMarker}`);
    }
  }
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'UnitStatusTargetClassifier', ['classify']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'UnitStatusOverlayAdapter', ['setEnemyBarColor', 'clearUltColor', 'hasEnemyBarStyleDrift', 'hasEnemyStyleDrift']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'HpReadoutPolicy', ['parseMax', 'reset', 'enemy']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'LowHpPulsePolicy', ['resetEnemy', 'enemy', 'resetAlly', 'ally']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'EnemyHealthPaintPolicy', ['reset', 'colorForPulse', 'enemy']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'KillMarkerPolicy', ['enemy']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'AllyHealthPaintPolicy', ['ally']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'LevelTierPolicy', ['level']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'EnemyHealthbarLoopPolicy', ['decide']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'ReplayWakePolicy', ['shouldWakeSameRaw', 'wakeLoops']);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'LoopSchedulePolicy', ['schedule', 'requestKick']);
  if (!/\bvar\s+ENEMY_ACTION_CONTINUE\s*=\s*0\s*;/.test(healthbar)) {
    errors.push('healthbar_logic.js ENEMY_ACTION_CONTINUE must be 0');
  }
  if (!/\bvar\s+ENEMY_ACTION_PAINT\s*=\s*9\s*;/.test(healthbar)) {
    errors.push('healthbar_logic.js ENEMY_ACTION_PAINT must be 9');
  }
  checkLoopReasonContract(errors, 'healthbar_logic.js', healthbar, HP_EXPECTED_LOOP_REASONS);
  checkLevelTierCssParity(errors, 'healthbar_logic.js', healthbar, unitStyle, [
    { min: 11, cls: 'level_tier2' },
    { min: 19, cls: 'level_tier3' },
    { min: 27, cls: 'level_tier4' },
    { min: 35, cls: 'level_tier5' },
  ]);


  checkObjectInterface(errors, 'anita_ui_core.js', uiCore, 'HPSettingsContract', ['buildOrderedIds', 'buildDefaults', 'buildSupportedPresetIds']);
  for (const contractMarker of [
    'const HP_SETTING_IDS = HPSettingsContract.buildOrderedIds();',
    'const HP_SETTING_DEFAULTS = HPSettingsContract.buildDefaults();',
    'HPSettingsContract.buildSupportedPresetIds();'
  ]) {
    if (!uiCore.includes(contractMarker)) {
      errors.push(`HPSettingsContract missing derived-map marker: ${contractMarker}`);
    }
  }
  if (uiCore.includes('hp_kill_zone_width: true')) {
    errors.push('anita_ui_core.js should derive HP_PRESET_BUILDER_SUPPORTED_IDS from HPSettingsContract instead of hand-maintaining the schema-id map');
  }
  checkObjectInterface(errors, 'anita_ui_core.js', uiCore, 'HPValueCodecs', ['sanitizeBoolean', 'sanitizeCyclerIndex', 'sanitizeNumber', 'sanitizeColor', 'sanitizePosition', 'sanitizeElementValue']);
  for (const codecMarker of [
    'return HPValueCodecs.sanitizeElementValue(element, value);',
    'this.clampNumber(source[0], 0, 400, 0)',
    'this.clampNumber(source.y, -50, 400, 200)',
    'source.match(/-?\\d+(?:\\.\\d+)?/g)'
  ]) {
    if (!uiCore.includes(codecMarker)) {
      errors.push(`HPValueCodecs missing behavior marker: ${codecMarker}`);
    }
  }
  checkObjectInterface(errors, 'anita_ui_core.js', uiCore, 'HPPresetCodeCodec', ['encodeBase64Url', 'decodeBase64Url', 'normalizeHeroToken', 'normalizeHeroes', 'normalizeHeroScope', 'normalizeOverrides', 'compactOverrides', 'encodePresetToken', 'encodePresetBundle']);
  for (const presetCodecMarker of [
    'HPPresetCodeCodec.encodeBase64Url(raw)',
    'HPPresetCodeCodec.decodeBase64Url(encoded)'
  ]) {
    if (!uiCore.includes(presetCodecMarker)) {
      errors.push(`HPPresetCodeCodec missing behavior marker: ${presetCodecMarker}`);
    }
  }
  for (const deadCodecMethod of ['expandValues', 'decodePresetPayload', 'extractToken', 'decodePresetToken', 'decodePresetBundle']) {
    if (uiCore.includes(`${deadCodecMethod}: function`)) {
      errors.push(`HPPresetCodeCodec retained unused Panorama method: ${deadCodecMethod}`);
    }
  }
  for (const nativeBase64Marker of ['btoa(', 'atob(', 'AnitaBase64']) {
    if (uiCore.includes(nativeBase64Marker) || healthbar.includes(nativeBase64Marker)) {
      errors.push(`HP Colors scripts should not use native Panorama base64 marker: ${nativeBase64Marker}`);
    }
  }
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'HPValueCodecs', ['formatPositionValue', 'coerceBooleanValue', 'coerceNumberValue', 'coerceStringValue', 'coerceCfgValue']);
  for (const runtimeCodecMarker of [
    'return HPValueCodecs.coerceCfgValue(id, value);',
    'Array.isArray(rawPos)',
    'Object.prototype.hasOwnProperty.call(rawPos, "x")',
    'rawPos.match(/-?\\d+(?:\\.\\d+)?/g)',
    'clampNum(rawPos[0], 0, 400, 0)',
    'clampNum(rawPos.y, -50, 400, 200)'
  ]) {
    if (!healthbar.includes(runtimeCodecMarker)) {
      errors.push(`runtime HPValueCodecs missing behavior marker: ${runtimeCodecMarker}`);
    }
  }




  // 9. Compact aliases should remain in the persistence owners.

  // 10. Hot-loop optimization guards
  if (healthbar.includes('redBarNeedsPaint')) {
    errors.push('healthbar_logic.js must not use redBarNeedsPaint candidate style-read scoring');
  }
  const redbarScoreStart =
    healthbar.indexOf('scoreRedBarCandidate: function') >= 0
      ? healthbar.indexOf('scoreRedBarCandidate: function')
      : healthbar.indexOf('function getRedBarCandidateScore');
  const redbarScoreEnd =
    healthbar.indexOf('resetEnemyScanCache: function') > redbarScoreStart
      ? healthbar.indexOf('resetEnemyScanCache: function')
      : healthbar.indexOf('function resetEnemyScanCache');
  if (redbarScoreStart < 0 || redbarScoreEnd <= redbarScoreStart) {
    errors.push('healthbar_logic.js missing redbar candidate scoring guard region');
  } else {
    const redbarScoreBody = healthbar.slice(redbarScoreStart, redbarScoreEnd);
    if (redbarScoreBody.includes('style.washColor')) {
      errors.push('healthbar_logic.js redbar candidate scoring must not read style.washColor');
    }
    if (!redbarScoreBody.includes('scanPanelPacked')) {
      errors.push('healthbar_logic.js redbar candidate scoring should use packed class flags');
    }
  }
  if (!healthbar.includes('stableCurrentRedBarFrames >= 10') || !healthbar.includes('CURRENT_RB_IDLE_RESCAN_MS')) {
    errors.push('healthbar_logic.js child redbar probes should share bounded stable-frame idle backoff');
  }
  for (const uiCoreMarker of [
    'ensureConfigIndexes: function (config)',
    'config.__anitaElementById = elementById',
    'config.__anitaVisibilityDependentsBySource = dependentsBySource',
    'refreshDependentVisibility: function (config, sourceId)',
    'refreshChangedDependentsVisibility: function (config, sourceIds)',
    'ensureCategoryCache: function (config)',
    'config.__anitaCategoryCache = {',
    'renderCategoryTree: function (config, state, activeCategory)',
    'state.categoryCache !== categoryCache',
    'detailPanel.RemoveAndDeleteChildren();'
  ]) {
    if (!uiCore.includes(uiCoreMarker)) {
      errors.push(`anita_ui_core.js missing optimization marker: ${uiCoreMarker}`);
    }
  }
  for (const donationMarker of [
    'const HP_DONATION_URL = "https://ko-fi.com/hantuaraya";',
    'AnitaDonateBtn',
    'AnitaDonateIcon',
    'AnitaRenderer.openExternalUrl(HP_DONATION_URL)'
  ]) {
    if (!uiCore.includes(donationMarker) && !uiStyle.includes(donationMarker)) {
      errors.push(`HP Colors donation button marker missing: ${donationMarker}`);
    }
  }
  for (const donationStyleMarker of [
    "AnitaDonateSoulWiggle",
    "s2r://materials/particle/ui/ui_icon_soul.vtex",
    ".AnitaDonateBtn:hover .AnitaDonateIcon",
    "transition-property: background-color, border-color, brightness, pre-transform-scale2d;"
  ]) {
    if (!uiStyle.includes(donationStyleMarker)) {
      errors.push(`anita_ui.css missing donation style marker: ${donationStyleMarker}`);
    }
  }
  for (const removedScript of ['hp_registrar.js', 'anita_persist_loader.js']) {
    if (fs.existsSync(path.join(SCRIPTS_DIR, removedScript))) {
      errors.push(`merged script should not remain as separate source: ${removedScript}`);
    }
  }
  const baseHudScripts = extractPanoramaScriptIncludes(baseHud);
  const unitStatusScripts = extractPanoramaScriptIncludes(unitStatusOverlay);
  if (baseHudScripts.join('|') !== 'anita_ui_core.vjs_c') {
    errors.push(`base_hud.xml should load only anita_ui_core.vjs_c, got: ${baseHudScripts.join(', ') || '(none)'}`);
  }
  if (unitStatusScripts.join('|') !== 'healthbar_logic.vjs_c') {
    errors.push(`unit_status_overlay.xml should load only healthbar_logic.vjs_c, got: ${unitStatusScripts.join(', ') || '(none)'}`);
  }
  for (const removedScript of ['hp_registrar.vjs_c', 'anita_persist_loader.vjs_c']) {
    if (baseHudScripts.includes(removedScript) || unitStatusScripts.includes(removedScript)) {
      errors.push(`layout should not include merged script asset: ${removedScript}`);
    }
  }
  for (const schemaMarker of [
    'SETTINGS: [',
    'buildRegistrarConfig: function ()',
    'queueHpColorsRegistration: function ()',
    'HPSettingsContract.buildRegistrarConfig()'
  ]) {
    if (!uiCore.includes(schemaMarker)) {
      errors.push(`anita_ui_core.js missing merged schema marker: ${schemaMarker}`);
    }
  }
  if (!unitStyle.match(/#unit_healthbar_lagging\s*\{[\s\S]*?wash-color:\s*TeamEnemyColor\s*;/)) {
    errors.push('unit_status.css bare main healthbar should match the proven debug first-paint enemy default');
  }
  if (!unitStyle.match(/\.team_neutral #unit_healthbar_lagging\s*\{[\s\S]*?wash-color:\s*TeamNeutralColor\s*;/)) {
    errors.push('unit_status.css team-neutral selector should override the bare enemy default');
  }
  for (const runtimeColorMarker of [
    'var knownFriendlyTeamId = 0;',
    'isFriendlyBuilding: function (flags, teamId)',
    'isEnemyBuilding: function (flags, teamId)',
    'getIgnoredTargetColor: function (flags, teamId)',
    'if (cfg.hp_skip_buildings && target.isBuilding)',
    'normalizeWashColor(cfg.hp_color_high) === normalizeWashColor(DEFAULTS.hp_color_high)',
    'UnitStatusOverlayAdapter.setEnemyBarColor(getHighColor());'
  ]) {
    if (!healthbar.includes(runtimeColorMarker)) {
      errors.push(`healthbar_logic.js missing first-paint/building color marker: ${runtimeColorMarker}`);
    }
  }
  const ignoredColorStart = healthbar.indexOf('getIgnoredTargetColor: function (flags, teamId)');
  const ignoredColorEnd =
    healthbar.indexOf('var _allyScanPanel') > ignoredColorStart
      ? healthbar.indexOf('var _allyScanPanel')
      : healthbar.indexOf('function resetAllyState');
  if (ignoredColorStart < 0 || ignoredColorEnd <= ignoredColorStart) {
    errors.push('healthbar_logic.js missing ignored-target color guard region');
  } else {
    const ignoredColorBody = healthbar.slice(ignoredColorStart, ignoredColorEnd);
    if (!ignoredColorBody.includes('if (flags & 1 && !(flags & 2)) return "";') ||
        !ignoredColorBody.includes('if (this.isEnemyBuilding(flags, teamId)) return CSS_TEAM_ENEMY_COLOR;') ||
        !ignoredColorBody.includes('if (this.isFriendlyBuilding(flags, teamId)) return WHITE_WASH;') ||
        !ignoredColorBody.includes('return CSS_TEAM_ENEMY_COLOR;')) {
      errors.push('healthbar_logic.js ignored fallback should match debug behavior: enemy/unknown red, friendly building white, neutral class green');
    }
  }
  if (healthbar.includes('function getDefaultBarColor')) {
    errors.push('healthbar_logic.js should inline ally reset default color instead of keeping dead getDefaultBarColor branches');
  }
  if (!healthbar.includes('panel.style.washColor = CSS_TEAM_FRIEND_COLOR;')) {
    errors.push('healthbar_logic.js should reset full ally bars directly to CSS_TEAM_FRIEND_COLOR');
  }
  if (healthbar.includes('_allyScanPacked') ||
      healthbar.includes('scanTeam(scanResult)') ||
      healthbar.includes('scanFlags(scanResult)') ||
      healthbar.includes('scanFlags(allyScan)')) {
    errors.push('healthbar_logic.js should cache ally scan flags directly without stale packed/team unpacking');
  }
  if (!healthbar.includes('STYLE_REAPPLY_WATCHDOG_MS')) {
    errors.push('healthbar_logic.js missing STYLE_REAPPLY_WATCHDOG_MS');
  }
  if (healthbar.includes('STYLE_REAPPLY_MS = 1000')) {
    errors.push('healthbar_logic.js must not force style reapply every 1s');
  }
  const msgUses = healthbar.match(/\$\.Msg/g) || [];
  if (msgUses.length) {
    errors.push('healthbar_logic.js must not use $.Msg in production runtime');
  }
  for (const debugMarker of ['console.log', 'HB_TARGET_DEBUG', 'hbDebug', 'debugFirstEnemyPaint', '[HP Colors][HB]', 'MATCH_RESET_VERBOSE', 'logMatchReset', '__hpColorsMatchResetStatus', 'HP_COLORS_PERF_DEBUG', '__hpColorsPerfDebug', '[HP Colors][SUMMARY]', '[HP Colors][PROFILE]', '[HP Colors][TIMING]']) {
    if (healthbar.includes(debugMarker)) {
      errors.push(`healthbar_logic.js contains production debug marker: ${debugMarker}`);
    }
  }
  for (const staleUiGateMarker of [
    'HP_OPTIMIZED_FORCED_VALUES',
    'HP_OPTIMIZED_HIDDEN_SETTINGS',
    'applyHpOptimizedHardGates(',
  ]) {
    if (uiCore.includes(staleUiGateMarker)) {
      errors.push(`anita_ui_core.js still contains removed HP optimized hard-gate marker: ${staleUiGateMarker}`);
    }
  }
  for (const staleRuntimeGateMarker of [
    'RUNTIME_OPTIMIZED_PROFILE',
    'OPTIMIZED_FORCED_VALUES',
    'enforceOptimizedRuntimeProfile(',
  ]) {
    if (healthbar.includes(staleRuntimeGateMarker)) {
      errors.push(`healthbar_logic.js still contains removed runtime optimized profile marker: ${staleRuntimeGateMarker}`);
    }
  }
  for (const staleHeroSelector of [
    '.AnitaPresetHeroOptionName',
    '.AnitaPresetHeroCheck',
  ]) {
    if (uiStyle.includes(staleHeroSelector)) {
      errors.push(`anita_ui.css still contains removed stale hero selector: ${staleHeroSelector}`);
    }
  }
  for (const liveToggleMarker of [
    'hp_ult_color_enabled: false',
    'hp_pulse_enabled: false',
    'hp_pulse_text_enabled: false',
    'hp_pulse_color_enabled: false',
    'hp_friend_enabled: false',
    'hp_friend_pulse_enabled: false',
    'hp_friend_pulse_color_enabled: false',
    'hp_kill_zone_enabled: false'
  ]) {
    if (uiCore.includes(liveToggleMarker)) {
      errors.push(`HP Colors optimized hard gate must not lock live feature toggle: ${liveToggleMarker}`);
    }
  }
  const hiddenGateMatch = uiCore.match(/const HP_OPTIMIZED_HIDDEN_SETTINGS = \{([\s\S]*?)\};/);
  const hiddenGateBlock = hiddenGateMatch ? hiddenGateMatch[1] : '';
  for (const customizableHiddenMarker of [
    'hp_ult_color_custom',
    'hp_pulse_threshold',
    'hp_pulse_bpm',
    'hp_pulse_intensity',
    'hp_pulse_color',
    'hp_pulse_color_mode',
    'hp_pulse_hide_bar',
    'hp_pulse_text_scale',
    'hp_pulse_text_position',
    'hp_friend_color_low',
    'hp_friend_color_mid',
    'hp_friend_color_high',
    'hp_friend_pulse_threshold',
    'hp_friend_pulse_bpm',
    'hp_friend_pulse_intensity',
    'hp_friend_pulse_color',
    'hp_kill_zone_threshold',
    'hp_kill_zone_color',
    'hp_kill_zone_width'
  ]) {
    if (hiddenGateBlock.includes(customizableHiddenMarker)) {
      errors.push(`HP Colors optimized hidden gate must not hide customization row: ${customizableHiddenMarker}`);
    }
  }
  for (const derivedMarker of [
    'function refreshDerivedConfig()',
    'var dc = {}',
    'dc.low',
    'dc.counterPosition',
    'dc.killZoneThreshold',
    'refreshDerivedConfig();'
  ]) {
    if (!healthbar.includes(derivedMarker)) {
      errors.push(`healthbar_logic.js missing derived config cache marker: ${derivedMarker}`);
    }
  }
  for (const writeOnlyName of ['lCounterText', 'lPDA', 'styleGeneration']) {
    if (healthbar.includes(writeOnlyName)) {
      errors.push(`healthbar_logic.js still contains write-only cleanup candidate: ${writeOnlyName}`);
    }
  }

  // 11. Baked preset profiles should apply the latest builder profile as a real settings update.
  for (const bakedPresetMarker of [
    'const HP_BAKED_PRESET_APPLY_DELAYS = [0.5, 1.5, 3.0, 5.0, 8.0, 12.0]',
    'const HP_STARTUP_PRESET_ID = "HPColorsPreset_001"',
    'function getPanelId(panel)',
    'id === HP_STARTUP_PRESET_ID',
    'const HPPresetHeroSelection = {',
    'const HPPresetRepository = {',
    'priorityIdentity: function (preset)',
    'applyRuntimePresetPriorityOrder: function (modConfig, presets)',
    'function readBakedPresetEntryBase(',
    'materializeBakedEntry: function (base, modConfig, displayIndex)',
    'modConfig.__hpBakedPresetEntryCache = cache;',
    'modConfig.__anitaPresetHeroSelections',
    'modConfig.__anitaPresetHeroModes',
    'readRuntimePresetEntries: function (modConfig)',
    'resolveSelectionFromEntries: function (',
    'HPPresetRepository.readRuntimePresetEntries(modConfig)',
    'source: "hero"',
    'usedFallback: false',
    'source: "global"',
    'usedFallback: true',
    'selectForHero: function (',
    'hasSelectedScopedPreset: function (config)',
    'const HP_HERO_SCOPE_OFF = "off"',
    'const HP_HERO_SCOPE_ALL = "all"',
    'const HP_HERO_SCOPE_SELECTED = "selected"',
    'const HP_HERO_DETECTION_LOCK_GAME_TIME_SEC = 10',
    'function refreshHpHeroPresetSelection(config)',
    'if (config.__hpHeroPresetDetectionLocked) return false;',
    'startHpHeroPresetWatch(config);',
    'function getHpHeroPresetLockAfterGameTime(config)',
    'function openHpHeroPresetDetectionWindow(config)',
    'function resetHpHeroPresetDetectionLock(config)',
    'function lockHpHeroPresetDetectionIfReady(config, heroId)',
    'config.__hpHeroPresetDetectionLocked = true;',
    'config.__hpHeroPresetLockAfterGameTime =',
    'var lockedPresetKey = String(config.__hpLastAppliedHeroPresetKey || "");',
    'openHpHeroPresetDetectionWindow(config);',
    'lockHpHeroPresetDetectionIfReady(config, appliedHero);',
    'reason: "hero"',
    'reason: "waiting_for_hero"',
    'reason: "global"',
    'HPPresetHeroSelection.hasSelectedScopedPreset(config)',
    'config.__hpHeroPresetWatchStarted = false;',
    'function applyHpColorsBakedPresetValues(',
    'AnitaPersistence.applyResolvedValues(config, values);',
    'AnitaPersistence.persistConfig(config, true);',
    'AnitaRenderer.renderModSettings(config);',
    'update_source: "baked_preset_apply"',
    'force_persist: true',
    'HPPresetSnapshotPublisher.writeShared(config);',
    'HPPresetSnapshotPublisher.publish('
  ]) {
    if (!uiCore.includes(bakedPresetMarker)) {
      errors.push(`anita_ui_core.js missing baked preset apply marker: ${bakedPresetMarker}`);
    }
  }
  for (const prodDebugMarker of [
    'HP_HERO_PRESET_DEBUG',
    'HP_MATCH_RESET_VERBOSE',
    '[HP-COLORS][hero]',
    '[HP-COLORS][match]',
    'console.log',
    '__hpColorsMatchResetStatus',
    'logHpMatchReset',
    'function hpHeroDebug',
    'hpHeroDebug('
  ]) {
    if (uiCore.includes(prodDebugMarker)) {
      errors.push(`anita_ui_core.js should not ship hero preset debug marker: ${prodDebugMarker}`);
    }
  }
  if (uiCore.includes('_didApplyHpColorsBakedPresetOnce = true;\n\n    $.Schedule(5.0')) {
    errors.push('anita_ui_core.js still marks baked preset applied before values are found');
  }
  if (uiCore.includes('return presets[presets.length - 1].values || {}')) {
    errors.push('anita_ui_core.js must not use last baked preset as startup preset');
  }
  for (const replayMarker of [
    'updateSource === "baked_preset_apply"',
    'source === "baked_preset_apply"'
  ]) {
    if (!uiCore.includes(replayMarker) && !healthbar.includes(replayMarker)) {
      errors.push(`Baked preset replay source missing marker: ${replayMarker}`);
    }
  }

  // 12. Anita UI and healthbar runtime duplicate the bridge protocol in two scripts; shared literals must not drift.
  checkObjectInterface(errors, 'anita_ui_core.js', uiCore, 'HPBridgeProtocol', [
    'dispatchPayload',
    'dispatchRawPayload',
    'readSharedConfigRaw',
    'writeSharedConfigRaw',
    'isBulkUpdate',
    'isSingleUpdate'
  ]);
  checkObjectInterface(errors, 'healthbar_logic.js', healthbar, 'HPBridgeProtocol', [
    'dispatchPayload',
    'readSharedConfigRaw',
    'writeSharedConfigRaw',
    'isBulkUpdate',
    'isSingleUpdate'
  ]);


  // 12. Full hp_colors builds from source base_hud.xml directly; pak96 preset-store sync is intentionally not part of this build.
  if (!baseHud.includes('id="AnitaUI_Anchor"')) {
    errors.push('base_hud.xml missing AnitaUI_Anchor for Anita UI bootstrap');
  }
  for (const removedConditionalMouseMarker of [
    'AnitaConditionalContextRow',
    'HandleConditionalContextMenu',
    'oncontextmenu=',
  ]) {
    if (baseHud.includes(removedConditionalMouseMarker)) {
      errors.push(`base_hud.xml retains failed conditional mouse marker: ${removedConditionalMouseMarker}`);
    }
  }
  if (!uiStyle.includes('.AnitaConditionalEligible:hover .AnitaConditionalMarker') ||
      !uiStyle.includes('.AnitaConditionalMarker.Configured')) {
    errors.push('anita_ui.css must reveal the conditional star on row hover');
  }
  if (!uiStyle.match(/\.AnitaConditionalEligible\s*\{[\s\S]*?padding-right:\s*26px\s*;/) ||
      !uiStyle.match(/\.AnitaConditionalEligible \.AnitaLabel\s*\{[\s\S]*?padding-right:\s*0px\s*;/) ||
      !uiStyle.match(/\.AnitaConditionalMarker\s*\{[\s\S]*?margin-left:\s*0px\s*;/) ||
      !uiCore.includes('marker.style.align = "right center"')) {
    errors.push('Anita conditional stars must occupy the reserved right-hand setting lane');
  }
  if (!uiStyle.match(/\.AnitaSliderValueGroup,\s*\.SliderValueGroup\s*\{[\s\S]*?width:\s*296px\s*;/) ||
      !uiStyle.match(/\.AnitaSliderContainer,\s*\.SliderContainer\s*\{[\s\S]*?width:\s*230px\s*;/) ||
      uiCore.includes('valueGroup.style.width = "296px"') ||
      uiCore.includes('sliderContainer.style.width = "230px"')) {
    errors.push('Anita slider rows must use one CSS-owned 230px track and 66px readout lane');
  }
  if (!uiStyle.match(/\.AnitaPositionPickerGroup\s*\{[\s\S]*?width:\s*296px\s*;/) ||
      !uiStyle.match(/\.AnitaPositionAxisLabel\s*\{[\s\S]*?ignore-parent-flow:\s*true\s*;[\s\S]*?transform:\s*translateX\(\s*-36px\s*\)\s*;/) ||
      !uiStyle.match(/\.AnitaPositionSliderContainer\s*\{[\s\S]*?width:\s*230px\s*;/) ||
      uiCore.includes('posPickerValueGroup.style.width = "332px"') ||
      uiCore.includes('posPickerXContainer.style.width = "230px"') ||
      uiCore.includes('posPickerYContainer.style.width = "230px"')) {
    errors.push('Anita position sliders must keep axis labels outside flow and share the standard slider track lane');
  }
  if (!uiStyle.match(/Slider\.AnitaSlider\.HorizontalSlider #SliderThumb,\s*SlottedSlider\.AnitaSlider\.HorizontalSlider #SliderThumb\s*\{\s*vertical-align:\s*center\s*;\s*\}/)) {
    errors.push('Anita sliders must center Valve #SliderThumb without replacing Valve thumb artwork');
  }
  if (!uiStyle.match(/\.HorizontalSlider \.SliderThumb\s*\{[^}]*transform:\s*translateY\(\s*4px\s*\)\s*;/)) {
    errors.push('Anita slider thumb artwork must compensate for its measured 4px visual offset above the track');
  }
  if (!uiStyle.match(/\n\.HorizontalSlider #SliderTrack,[^{]*\{[^}]*padding:\s*0px\s*;/)) {
    errors.push('Anita sliders must clear Valve horizontal-track padding so the visible bar shares the thumb centerline');
  }
  if (!uiCore.match(/AnitaRenderer\.attachLocalTooltip\(\s*marker,\s*"Configure signature condition",?\s*\)/) ||
      uiCore.includes('var markerTooltip = $.CreatePanel("Label", row, "");') ||
      uiStyle.includes('.AnitaConditionalMarkerTooltip')) {
    errors.push('Anita conditional markers must reuse the layout-stable preset tooltip path');
  }
  for (const conditionalEditorStyle of [
    '.AnitaConditionalAbilityGroup',
    '.AnitaConditionalAbilityFrame',
    '.AnitaConditionalAbilityRing',
    '.AnitaConditionalAbilityArt',
    '.AnitaConditionalTierBadge',
    '.AnitaConditionalToggleStatus',
    'ability_frame_passive_0_psd.vtex',
    'ability_frame_passive_1_psd.vtex',
    'ability_frame_passive_2_psd.vtex',
    'ability_frame_passive_3_psd.vtex',
  ]) {
    if (!uiStyle.includes(conditionalEditorStyle)) {
      errors.push(`anita_ui.css missing signature icon editor style: ${conditionalEditorStyle}`);
    }
  }
  if (uiStyle.includes('.AnitaConditionalChoice')) {
    errors.push('anita_ui.css retains obsolete text slot/tier choices');
  }
  for (const removedConditionalEditorStyle of [
    '.AnitaConditionalAbilityFallback',
    'box-shadow: rgba(0, 0, 0, 0.68) 0px 10px 32px 0px',
    'box-shadow: fill rgba(102, 204, 153, 0.22) 0px 0px 10px 0px',
  ]) {
    if (uiStyle.includes(removedConditionalEditorStyle)) {
      errors.push(`anita_ui.css retains obsolete conditional editor style: ${removedConditionalEditorStyle}`);
    }
  }
  for (const conditionalEditorRuntime of [
    'readAbilityImageSource',
    'AnitaConditionalAbilityArt',
    '"VisualTier" + String(tierIndex)',
    'state.minTier >= 3 ? 1 : state.minTier + 1',
    'slider.style.height = "12px"',
    'state.enabled && index + 1 === state.slot',
    'sourceImage.style.backgroundImage',
    'AnitaConditionalToggleStatus',
  ]) {
    if (!uiCore.includes(conditionalEditorRuntime)) {
      errors.push(`anita_ui_core.js missing signature icon editor runtime: ${conditionalEditorRuntime}`);
    }
  }
  if (uiCore.includes('$.CreatePanel("CitadelAbilityIcon"')) {
    errors.push('anita_ui_core.js must snapshot stock ability art instead of creating unbound CitadelAbilityIcon panels');
  }
  const buildScript = fs.readFileSync(path.join(ROOT, 'build_hp_colors.ps1'), 'utf-8');
  if (!fs.existsSync(path.join(ROOT, 'hp_colors', 'scripts', 'validate-hero-selector.js'))) {
    errors.push('hp_colors/scripts/validate-hero-selector.js missing');
  }
  for (const removedBuildMarker of [
    'sync_hp_preset_store.js',
    'pak96_dir.vpk'
  ]) {
    if (buildScript.includes(removedBuildMarker)) {
      errors.push(`build_hp_colors.ps1 still depends on removed pak96 preset-store sync marker: ${removedBuildMarker}`);
    }
  }
  for (const buildMarker of [
    'validate-hero-selector.js',
    'Closure ADVANCED hero selector audit passed.',
    'hp_colors_closure',
    'ECMASCRIPT5_STRICT',
    'anita_ui_core.vjs_c',
    'anita_ui.vcss_c',
    'Assert-PackedVpkAssets',
    'Get-PackedVpkTree'
  ]) {
    if (!buildScript.includes(buildMarker)) {
      errors.push(`build_hp_colors.ps1 missing build marker: ${buildMarker}`);
    }
  }

  // 13. Preset Builder buttons use Deadlock's shipped CSS icon pattern and hero selection metadata.
  for (const iconMarker of [
    'var openIcon = $.CreatePanel("Panel", openBtn, "")',
    'openIcon.AddClass("AnitaPresetBtnIconOpen")',
    'var copyIcon = $.CreatePanel("Panel", copyBtn, "")',
    'copyIcon.AddClass("AnitaPresetBtnIconCopy")',
    'const HP_HERO_DATA = [',
    'function detectHpLocalHero()',
    'AnitaPresetHeroPickerBtn',
    'button.SetPanelEvent("onactivate", function () {',
    'AnitaPresetHeroMenuOption',
    'option.SetAttributeString("anita_hero_id", option.__anitaHeroId);',
    'option.SetAttributeString("anita_hero_kind", optionKind);',
    'iconSlot.AddClass("AnitaPresetHeroMenuOptionIcon");',
    'iconSlot.AddClass("AnitaPresetHeroMenuOptionIconAll");',
    'iconSlot.style.backgroundImage = "none";',
    'var heroIconImage = $.CreatePanel("Panel", iconSlot, "");',
    'AnitaPresetHeroMenuOptionHeroIcon',
    'heroIconImage.__anitaHeroIconPath = hpHeroIconPath(heroId);',
    'heroIconImage.style.backgroundImage = "none";',
    'heroIconImage.style.minWidth = "22px";',
    'heroIconImage.style.maxWidth = "22px";',
    'heroIconImage.style.overflow = "clip";',
    'heroIconImage.style.backgroundSize = "100% 100%";',
    'backgroundTextureSize = "22px 22px"',
    'heroIconImage.style.backgroundPosition = "50% 50%";',
    'heroIconImage.style.backgroundRepeat = "no-repeat";',
    'icon.style.minWidth = "22px";',
    'icon.style.maxWidth = "22px";',
    'icon.style.overflow = "clip";',
    'icon.style.backgroundImage = \'url("\' + path + \'")\';',
    'option.__anitaHeroId = isHero ? String(heroId || "") : "";',
    'option.__anitaHeroKind = optionKind;',
    'option.__anitaHeroCheckLabel.text = selected ? "\\u2713" : "";',
    'menu.__anitaHeroOptions.push(option);',
    'function hpHeroIconPath(heroId)',
    's2r://panorama/images/heroes/',
    'renderHeroPickerState(',
    'var heroPicker = makeHeroPickerButton(heroSelector, row);',
    'renderHeroPickerState(heroPicker, row, heroSummary);',
    'heroPicker.__anitaHeroSummaryLabel = heroSummary;',
    'HPPresetHeroSelection.getRowHeroes',
    'HPPresetHeroSelection.getRowHeroMode',
    'HPPresetBuilderActions.setRowHeroScope',
    'face.AddClass("AnitaPresetHeroDropDownFace");',
    'face.hittest = false;',
    'faceIcon.AddClass("AnitaPresetHeroDropDownFaceIcon");',
    'faceLabel.AddClass("AnitaPresetHeroDropDownFaceLabel");',
    'button.__anitaHeroFacePanel = face;',
    'heroSummary.AddClass("AnitaPresetHeroSummary");',
    'heroes: normalizeHpHeroSelection(preset.heroes),',
    'heroMode: normalizeHpHeroScopeMode(preset.heroMode, preset.heroes)',
    'store["id:" + String(row.id)] = normalized.slice(0);',
    'modeStore["id:" + String(row.id)] = scopeMode;',
    'function updateHeroMenuOptionState(option, selectedHeroes, scopeMode)'
  ]) {
    if (!uiCore.includes(iconMarker)) {
      errors.push(`anita_ui_core.js missing preset icon marker: ${iconMarker}`);
    }
  }

  for (const forbiddenHeroMarker of [
    'HP_HERO_ALIAS_TO_ID',
    'HP_HERO_ALIAS_LIST',
    'registerHpHeroAlias',
    'aliases:',
    'iconAliases',
    'replace(/^hero_/'
  ]) {
    if (uiCore.includes(forbiddenHeroMarker)) {
      errors.push(`anita_ui_core.js must use exact SteamTracking hero keys, not alias/fallback marker: ${forbiddenHeroMarker}`);
    }
  }
  for (const exactHeroMarker of [
    'const HP_HERO_ID_TO_KEY = {};',
    'HP_HERO_ID_TO_KEY[String(hero.heroId)] = hero.id;',
    'if (Object.prototype.hasOwnProperty.call(HP_HERO_BY_ID, text)) return text;',
    'var numericKey = HP_HERO_ID_TO_KEY[text];',
    'id: "hero_astro"',
    'name: "Holliday"',
    'id: "hero_tengu"',
    'name: "Ivy"',
    'id: "hero_magician"',
    'name: "Sinclair"',
    'id: "hero_priest"',
    'name: "Venator"',
    'id: "hero_bookworm"',
    'name: "Paige"',
    'id: "hero_doorman"',
    'name: "The Doorman"',
    'id: "hero_necro"',
    'name: "Graves"',
    'id: "hero_unicorn"',
    'name: "Celeste"',
    'icon: "s2r://panorama/images/heroes/tengu_mm_psd.vtex"',
    'icon: "s2r://panorama/images/heroes/kali_mm_psd.vtex"',
    'return hero && hero.icon ? hero.icon : "";'
  ]) {
    if (!uiCore.includes(exactHeroMarker)) {
      errors.push(`anita_ui_core.js missing exact SteamTracking hero marker: ${exactHeroMarker}`);
    }
  }

  if (uiCore.includes('CitadelSettingsEnumDropDown') || uiCore.includes('$.CreatePanel("DropDown"')) {
    errors.push('anita_ui_core.js should not use native dropdown panels for the hero picker');
  }
  if (uiCore.includes('dropdown.SetSelected') ||
      uiCore.includes('dropdown.GetSelected') ||
      uiCore.includes('dropdown.SetPanelEvent("oninputsubmit"')) {
    errors.push('anita_ui_core.js should not use native dropdown selection APIs for the hero picker');
  }
  for (const iconStyleMarker of [
    '.AnitaPresetBtnIcon',
    '.AnitaPresetBtnIconOpen',
    'background-image: url("s2r://panorama/images/icons/arrow_diagonal.vsvg")',
    '.AnitaPresetBtnIconCopy',
    'background-image: url("s2r://panorama/images/icons/icon_copy.vsvg")',
    'background-texture-size: 16px 16px;',
    '.AnitaPresetOpenBtn .AnitaPresetBtnIcon',
    '.AnitaPresetHeroSelector',
    '.AnitaPresetHeroPickerBtn',
    '.AnitaPresetHeroDropDownFace',
    '.AnitaPresetHeroDropDownFaceIcon',
    '.AnitaPresetHeroDropDownFaceIcon.Visible',
    '.AnitaPresetHeroDropDownFaceLabel',
    '.AnitaPresetHeroPickerArrow',
    '.AnitaPresetHeroMenu',
    '.AnitaPresetHeroMenuOption',
    '.AnitaPresetHeroMenuOptionIcon',
    '.AnitaPresetHeroMenuOptionIconAll',
    '.AnitaPresetHeroMenuOptionIconAllLabel',
    '.AnitaPresetHeroMenuOptionHeroIcon',
    'background-image: none;',
    'background-size: 100% 100%;',
    'background-texture-size: 22px 22px;',
    'border: 0px solid transparent;',
    'overflow: clip;',
    '.AnitaPresetHeroMenuOption.Selected',
    '.AnitaPresetHeroMenuOptionName',
    '.AnitaPresetHeroMenuOptionCheck',
    'ignore-parent-flow: true;',
    'height: 360px;',
    '.AnitaPresetHeroMenu VerticalScrollBar',
    '.AnitaPresetHeroMenu VerticalScrollBar #ScrollThumb',
    'background-color: transparent;',
    '.AnitaPresetHeroMenuOption.Selected .AnitaPresetHeroMenuOptionCheck',
    'visibility: collapse;',
    'visibility: visible;',
    'margin-top: 0px;',
    '.AnitaPresetHeroSummary',
    '.AnitaPresetPriorityBtns',
    '.AnitaPresetPriorityBtn',
    '.AnitaPresetPriorityBtn.Disabled',
    '.AnitaPresetLocalTooltip',
    '.AnitaPresetLocalTooltipLabel',
    'background-texture-size: 16px 16px;'
  ]) {
    if (!uiStyle.includes(iconStyleMarker)) {
      errors.push(`anita_ui.css missing preset icon style marker: ${iconStyleMarker}`);
    }
  }
  if (!/\.AnitaPresetHeroPickerBtn\s*,\s*\n\.AnitaPresetHeroBtn\s*\{[\s\S]*?height:\s*30px;/.test(uiStyle)) {
    errors.push('anita_ui.css missing 30px height inside .AnitaPresetHeroPickerBtn');
  }
  if (!/\.AnitaPresetHeroMenuOption\s*\{[\s\S]*?padding:\s*4px 5px 4px 8px;/.test(uiStyle)) {
    errors.push('anita_ui.css missing compact padding inside custom hero menu options');
  }
  if (!/\.AnitaPresetHeroDropDownFace\s*\{[^}]*height:\s*30px;/.test(uiStyle)) {
    errors.push('anita_ui.css should keep preset hero picker face at full button height');
  }
  if (!/\.AnitaPresetHeroDropDownFace\s*\{[^}]*width:\s*112px;/.test(uiStyle)) {
    errors.push('anita_ui.css should center preset hero picker text across the full button width');
  }
  if (!/\.AnitaPresetHeroDropDownFace\s*\{[^}]*padding:\s*0px 18px 0px 18px;/.test(uiStyle)) {
    errors.push('anita_ui.css missing symmetric preset hero picker face spacing');
  }
  if (!/\.AnitaPresetHeroDropDownFaceLabel\s*\{[^}]*height:\s*fit-children;/.test(uiStyle)) {
    errors.push('anita_ui.css should center preset hero picker label as fit-children, not full-height text');
  }
  if (!/\.AnitaPresetHeroDropDownFaceLabel\s*\{[^}]*margin-top:\s*0px;/.test(uiStyle)) {
    errors.push('anita_ui.css should not offset preset hero picker label with margin-top');
  }
  if (!/\.AnitaPresetHeroPickerArrow\s*\{[^}]*background-color:\s*transparent;/.test(uiStyle)) {
    errors.push('anita_ui.css should keep preset hero picker arrow background transparent');
  }
  if (!/\.AnitaPresetHeroPickerArrow\s*\{[^}]*height:\s*fit-children;/.test(uiStyle)) {
    errors.push('anita_ui.css should center preset hero picker arrow as fit-children');
  }
  if (!/\.AnitaPresetHeroSummary\s*\{[^}]*height:\s*fit-children;/.test(uiStyle)) {
    errors.push('anita_ui.css should center preset hero summary as fit-children, not full-height text');
  }
  if (!/\.AnitaPresetHeroSummary\s*\{[^}]*margin-top:\s*0px;/.test(uiStyle)) {
    errors.push('anita_ui.css should not offset preset hero summary with margin-top');
  }
  if (!/\.AnitaImportCloseBtn\s*\{[^}]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.16\);/.test(uiStyle)) {
    errors.push('anita_ui.css missing visible import close button border');
  }
  if (!/\.AnitaImportCloseBtn:hover\s*\{[^}]*border-color:\s*#d85a5a;/.test(uiStyle)) {
    errors.push('anita_ui.css missing red hover border for import close button');
  }
  if (!/\.AnitaImportCloseBtn:hover Label\s*\{[^}]*color:\s*#ff8a8a;/.test(uiStyle)) {
    errors.push('anita_ui.css missing red hover label for import close button');
  }
  if (!/\.AnitaImportApplyBtn Label\s*\{[^}]*height:\s*fit-children;/.test(uiStyle)) {
    errors.push('anita_ui.css should center import button label as fit-children');
  }
  if (!/\.AnitaImportCloseBtn Label\s*\{[^}]*height:\s*fit-children;/.test(uiStyle)) {
    errors.push('anita_ui.css should center import close label as fit-children');
  }
  if (!/\.AnitaPresetCopyBtn Label\s*\{[^}]*height:\s*fit-children;/.test(uiStyle)) {
    errors.push('anita_ui.css should center preset copy label as fit-children');
  }
  if (!/\.AnitaPresetCreateHint\s*\{[^}]*font-size:\s*10px;/.test(uiStyle)) {
    errors.push('anita_ui.css should keep preset create hint readable at 10px');
  }
  if (!/\.AnitaPresetPriorityBtns\s*\{[^}]*width:\s*22px;/.test(uiStyle)) {
    errors.push('anita_ui.css should keep priority chevron stack compact');
  }
  if (!/\.AnitaPresetPriorityBtns\s*\{[^}]*background-color:\s*transparent;/.test(uiStyle)) {
    errors.push('anita_ui.css should keep priority chevron stack visually light');
  }
  if (!/\.AnitaPresetLocalTooltip\s*\{[\s\S]*?z-index:\s*10090;/.test(uiStyle)) {
    errors.push('anita_ui.css should render local preset tooltips above Anita menus');
  }
  for (const priorityMarker of [
    'getPresetPriorityIdentity: function (row)',
    'applyPresetPriorityOrder: function (config, rows)',
    'movePresetRowPriority: function (config, rows, row, delta)',
    'priorityUpBtn.AddClass("AnitaPresetPriorityUpBtn")',
    'priorityDownBtn.AddClass("AnitaPresetPriorityDownBtn")',
    'priorityUpLbl.text = "\\u25B2"',
    'priorityDownLbl.text = "\\u25BC"',
    'attachPresetTooltip(priorityUpBtn, "Move preset up.")',
    'function selectPresetRow(presetRow)',
    'heroSelector.SetPanelEvent('
  ]) {
    if (!uiCore.includes(priorityMarker)) {
      errors.push(`anita_ui_core.js missing preset priority marker: ${priorityMarker}`);
    }
  }

  // 14. Preset Builder import should use the same base64 Import path and auto-clear status.
  for (const importMarker of [
    'applyImportCode: function (config, text, source)',
    'var raw = HPPresetCodeCodec.decodeBase64Url(encoded)',
    'import_source: String(source || "import")',
    'var titleImportBtn = $.CreatePanel("Button", titleRow, "")',
    'titleImportBtn.AddClass("AnitaPresetImportBtn")',
    'function attachPresetTooltip(panel, text)',
    'getLocalTooltipPanel: function ()',
    'positionLocalTooltip: function (anchor, tooltip)',
    'showLocalTooltip: function (panel, text)',
    'hideLocalTooltip: function ()',
    'btn.hittest = true;\n      btn.hittestchildren = false;',
    'lbl.hittest = false;\n      lbl.hittestchildren = false;',
    'box.hittest = false;\n      box.hittestchildren = false;',
    'renderModSettings: function (config) {\n      this.hideLocalTooltip();',
    'this.hideLocalTooltip();\n        if (this.activeColorPickerClose)',
    'this.presetTooltip = $.CreatePanel(',
    'this.presetTooltip.style.zIndex = "10090"',
    'this.attachLocalTooltip(\n          resetPageHeader.btn',
    'PAGE resets only this page. Other pages stay unchanged.',
    'ALL resets HP settings. Saved presets stay.',
    'HPPresetBuilderModel.capturePresetBuilderState(config)',
    'HPPresetBuilderModel.restorePresetBuilderState(config, presetBuilderState)',
    'Opened web builder. Use COPY ALL to export presets.',
    'attachPresetTooltip(titleImportBtn, "Paste a custom preset code.")',
    'attachPresetTooltip(nameLabel, "Click to rename this preset.")',
    'Click a preset name to rename.',
    'HPPresetBuilderModel.buildPresetBuilderViewModel(config)',
    'config.__anitaSelectedPresetKey = row.key;',
    'var result = AnitaRenderer.applyImportCode(config',
    'function selectPresetRow(presetRow) {\n        if (importPreset(presetRow)) {',
    'selectPresetRow(presetRow);',
    'AnitaLifetime.defer(durationSec, function () {\n          if (statusToken !== config.__anitaPresetStatusToken) return;',
    '"import_popup",',
    'var AnitaLifetime = {',
    '$.UnregisterForUnhandledEvent(',
    'AnitaLifetime.replace(\n        "escape_monitor",',
  ]) {
    if (!uiCore.includes(importMarker)) {
      errors.push(`anita_ui_core.js missing preset import marker: ${importMarker}`);
    }
  }
  for (const styleMarker of [
    '.AnitaPresetTitleRow',
    '.AnitaPresetImportBtn',
    '.AnitaPresetImportBtn Label'
  ]) {
    if (!uiStyle.includes(styleMarker)) {
      errors.push(`anita_ui.css missing preset import style marker: ${styleMarker}`);
    }
  }

  if (errors.length) {
    errors.forEach(e => console.error('[AUDIT FAIL]', e));
    console.error(`\nAudit failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log(`[AUDIT PASS] Schema, defaults, and aliases are consistent (${schemaIds.length} settings).`);
  process.exit(0);
}

main();
