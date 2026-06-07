#!/usr/bin/env node
'use strict';
/**
 * Schema drift audit for hp_colors.
 * Validates that SCHEMA, DEFAULTS, aliases, and runtime maps stay in sync.
 * Exit 0 on pass, exit 1 on failure.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS_DIR = path.join(ROOT, 'hp_colors', 'panorama', 'scripts');
const STYLES_DIR = path.join(ROOT, 'hp_colors', 'panorama', 'styles');

function readFile(name) {
  return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf-8').replace(/\r\n/g, '\n');
}

function readStyleFile(name) {
  return fs.readFileSync(path.join(STYLES_DIR, name), 'utf-8').replace(/\r\n/g, '\n');
}

function extractSchemaIds(text) {
  const re = /var\s+SCHEMA\s*=\s*\[([\s\S]*?)\];/;
  const m = text.match(re);
  if (!m) return null;
  const block = m[1];
  const ids = [];
  // Match each top-level object literal, allowing one level of nested braces (e.g. visibleWhen)
  const objRe = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let om;
  while ((om = objRe.exec(block)) !== null) {
    const idMatch = om[0].match(/\bid:\s*["']([^"']+)["']/);
    if (idMatch) ids.push(idMatch[1]);
  }
  return ids;
}

function extractDefaultsKeys(text) {
  const re = /(?:var|const)\s+DEFAULTS\s*=\s*\{([\s\S]*?)\};/;
  const m = text.match(re);
  if (!m) return null;
  const keys = [];
  const kvRe = /([a-z_][a-z0-9_]*)\s*:/g;
  let km;
  while ((km = kvRe.exec(m[1])) !== null) keys.push(km[1]);
  return keys;
}

function extractAliases(text, varName) {
  const re = new RegExp('(?:var|const)\\s+' + varName + '\\s*=\\s*\\{([\\s\\S]*?)\\};');
  const m = text.match(re);
  if (!m) return null;
  const aliases = {};
  // Support both quoted and unquoted keys, values always quoted
  const kvRe = /(?:"([^"]+)"|'([^']+)'|([a-z_][a-z0-9_]*))\s*:\s*"([^"]+)"/g;
  let km;
  while ((km = kvRe.exec(m[1])) !== null) {
    const key = km[1] || km[2] || km[3];
    aliases[key] = km[4];
  }
  return aliases;
}

function extractReverseAliases(text, varName) {
  const re = new RegExp('(?:var|const)\\s+' + varName + '\\s*=\\s*\\{([\\s\\S]*?)\\};');
  const m = text.match(re);
  if (!m) return null;
  const rev = {};
  // Support both quoted and unquoted keys, values always quoted
  const kvRe = /(?:"([^"]+)"|'([^']+)'|([a-z_][a-z0-9_]*))\s*:\s*"([^"]+)"/g;
  let km;
  while ((km = kvRe.exec(m[1])) !== null) {
    const key = km[1] || km[2] || km[3];
    rev[key] = km[4];
  }
  return rev;
}

function extractRegistrarDefaults(text) {
  const re = /var\s+SCHEMA\s*=\s*\[([\s\S]*?)\];/;
  const m = text.match(re);
  if (!m) return null;
  const defs = {};
  const objRe = /\{[^{}]*\}/g;
  let om;
  while ((om = objRe.exec(m[1])) !== null) {
    const idMatch = om[0].match(/\bid:\s*["']([^"']+)["']/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const dvMatch = om[0].match(/defaultValue:\s*("[^"]*"|true|false|\d+)/);
    if (dvMatch) {
      let v = dvMatch[1];
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (/^\d+$/.test(v)) v = parseInt(v, 10);
      else v = v.slice(1, -1);
      defs[id] = v;
    }
  }
  return defs;
}

function main() {
  const registrar = readFile('hp_registrar.js');
  const healthbar = readFile('healthbar_logic.js');
  const uiCore = readFile('anita_ui_core.js');
  const loader = readFile('anita_persist_loader.js');
  const uiStyle = readStyleFile('anita_ui.css');
  const unitStyle = readStyleFile('unit_status.css');

  const schemaIds = extractSchemaIds(registrar);
  const defaultsKeys = extractDefaultsKeys(healthbar);
  const aliasesCore = extractAliases(uiCore, 'HP_PERSIST_ALIASES');
  const aliasesLoader = extractAliases(loader, 'HP_PERSIST_ALIASES');
  const revAliases = extractReverseAliases(healthbar, 'HP_PERSIST_ALIAS_TO_ID') || {};
  const registrarDefaults = extractRegistrarDefaults(registrar);

  const errors = [];
  const warnings = [];

  if (!schemaIds || schemaIds.length === 0) errors.push('Could not extract SCHEMA from hp_registrar.js');
  if (!defaultsKeys || defaultsKeys.length === 0) errors.push('Could not extract DEFAULTS from healthbar_logic.js');
  if (!aliasesCore || Object.keys(aliasesCore).length === 0) errors.push('Could not extract HP_PERSIST_ALIASES from anita_ui_core.js');
  if (!aliasesLoader || Object.keys(aliasesLoader).length === 0) errors.push('Could not extract HP_PERSIST_ALIASES from anita_persist_loader.js');
  if (!registrarDefaults || Object.keys(registrarDefaults).length === 0) errors.push('Could not extract SCHEMA defaults from hp_registrar.js');

  if (errors.length) {
    errors.forEach(e => console.error('[AUDIT ERROR]', e));
    process.exit(1);
  }

  const schemaSet = new Set(schemaIds);
  const defaultsSet = new Set(defaultsKeys);
  const aliasIdsCore = Object.keys(aliasesCore);
  const aliasIdsLoader = Object.keys(aliasesLoader);
  const aliasIdsSetCore = new Set(aliasIdsCore);
  const aliasIdsSetLoader = new Set(aliasIdsLoader);

  // 1. Schema IDs missing from DEFAULTS
  for (const id of schemaIds) {
    if (!defaultsSet.has(id)) errors.push(`DEFAULTS missing key: ${id}`);
  }

  // 2. DEFAULTS keys missing from SCHEMA
  for (const key of defaultsKeys) {
    if (!schemaSet.has(key)) errors.push(`SCHEMA missing id: ${key} (present in DEFAULTS)`);
  }

  // 3. Schema IDs missing from aliases
  for (const id of schemaIds) {
    if (!aliasIdsSetCore.has(id)) errors.push(`anita_ui_core.js alias missing: ${id}`);
    if (!aliasIdsSetLoader.has(id)) errors.push(`anita_persist_loader.js alias missing: ${id}`);
  }

  // 4. Alias IDs missing from SCHEMA (orphaned aliases)
  for (const id of aliasIdsCore) {
    if (!schemaSet.has(id)) errors.push(`anita_ui_core.js orphaned alias: ${id}`);
  }
  for (const id of aliasIdsLoader) {
    if (!schemaSet.has(id)) errors.push(`anita_persist_loader.js orphaned alias: ${id}`);
  }

  // 5. Alias values duplicate check
  const valCounts = {};
  for (const [id, val] of Object.entries(aliasesCore)) {
    valCounts[val] = (valCounts[val] || 0) + 1;
  }
  for (const [val, count] of Object.entries(valCounts)) {
    if (count > 1) errors.push(`Duplicate alias value in anita_ui_core.js: "${val}" used ${count} times`);
  }

  // 6. Alias parity between core and loader
  for (const id of schemaIds) {
    if (aliasesCore[id] !== aliasesLoader[id]) {
      errors.push(`Alias mismatch for ${id}: core="${aliasesCore[id]}" loader="${aliasesLoader[id]}"`);
    }
  }

  // 7. Compact alias conversion belongs to Anita/import loaders, not the hot healthbar runtime.
  if (healthbar.includes('HP_PERSIST_ALIAS_TO_ID')) {
    errors.push('healthbar_logic.js should not own compact persistence aliases');
  }
  for (const marker of [
    'deadlock_hero_debuts_seen',
    'GameInterfaceAPI.GetSettingString',
    'GameInterfaceAPI.SetSettingString',
    'GameInterfaceAPI.ConsoleCommand',
    'CONVAR_KEY'
  ]) {
    if (healthbar.includes(marker)) errors.push(`healthbar_logic.js must not touch convar storage: ${marker}`);
    if (uiCore.includes(marker)) errors.push(`anita_ui_core.js must not touch convar storage: ${marker}`);
    if (loader.includes(marker)) errors.push(`anita_persist_loader.js must not touch convar storage: ${marker}`);
  }

  // 8. Registrar defaults vs runtime defaults
  for (const id of schemaIds) {
    const regVal = registrarDefaults[id];
    const runIdx = healthbar.indexOf(id + ':');
    if (runIdx > 0) {
      const snippet = healthbar.slice(runIdx, runIdx + 80);
      const regStr = JSON.stringify(regVal);
      if (!snippet.includes(regStr) && regVal !== undefined) {
        const alt = String(regVal);
        if (!snippet.includes(alt)) {
          warnings.push(`Registrar default for ${id} (${regStr}) may differ from runtime default`);
        }
      }
    }
  }

  // 9. Compact aliases should remain in the persistence owners.

  // 10. Hot-loop optimization guards
  if (healthbar.includes('redBarNeedsPaint')) {
    errors.push('healthbar_logic.js must not use redBarNeedsPaint candidate style-read scoring');
  }
  const redbarScoreStart = healthbar.indexOf('function getRedBarCandidateScore');
  const redbarScoreEnd = healthbar.indexOf('function resetEnemyScanCache');
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
  if (!healthbar.includes('if (isChildProbe) {') || !healthbar.includes('stableCurrentRedBarFrames >= 10')) {
    errors.push('healthbar_logic.js child redbar probes should share bounded stable-frame idle backoff');
  }
  if (!loader.includes('var elementById = null') || !loader.includes('elementById[element.id] = element')) {
    errors.push('anita_persist_loader.js should maintain an element id map for update lookups');
  }
  for (const uiCoreMarker of [
    'ensureConfigIndexes: function (config)',
    'config.__anitaElementById = elementById',
    'config.__anitaVisibilityDependentsBySource = dependentsBySource',
    'refreshDependentVisibility: function (config, sourceId)',
    'refreshChangedDependentsVisibility: function (config, sourceIds)',
    'ensureCategoryCache: function (config)',
    'config.__anitaCategoryCache = {',
    'const categoryCache = this.ensureCategoryCache(config)'
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
  if (!registrar.includes('cachedRegisterPayload') || !registrar.includes('cachedBootstrapPayload')) {
    errors.push('hp_registrar.js should cache repeated registration/bootstrap payload JSON strings');
  }
  if (!unitStyle.match(/#unit_healthbar_lagging\s*\{[\s\S]*?wash-color:\s*TeamEnemyColor\s*;/)) {
    errors.push('unit_status.css bare main healthbar should match the proven debug first-paint enemy default');
  }
  if (!unitStyle.match(/\.team_neutral #unit_healthbar_lagging\s*\{[\s\S]*?wash-color:\s*TeamNeutralColor\s*;/)) {
    errors.push('unit_status.css team-neutral selector should override the bare enemy default');
  }
  for (const runtimeColorMarker of [
    'var knownFriendlyTeamId = 0;',
    'function isFriendlyBuildingTarget(flags)',
    'function isEnemyBuildingTarget(flags)',
    'function getIgnoredTargetColor()',
    'if (cfg.hp_skip_buildings && (fl & 4))',
    'normalizeWashColor(cfg.hp_color_high) === normalizeWashColor(DEFAULTS.hp_color_high)',
    'sBC(getHighColor());'
  ]) {
    if (!healthbar.includes(runtimeColorMarker)) {
      errors.push(`healthbar_logic.js missing first-paint/building color marker: ${runtimeColorMarker}`);
    }
  }
  const ignoredColorStart = healthbar.indexOf('function getIgnoredTargetColor()');
  const ignoredColorEnd = healthbar.indexOf('function getHealthbarHeightPx');
  if (ignoredColorStart < 0 || ignoredColorEnd <= ignoredColorStart) {
    errors.push('healthbar_logic.js missing ignored-target color guard region');
  } else {
    const ignoredColorBody = healthbar.slice(ignoredColorStart, ignoredColorEnd);
    if (!ignoredColorBody.includes('if (fl & 1 && !(fl & 2)) return "";') ||
        !ignoredColorBody.includes('if (isEnemyBuildingTarget(fl)) return CSS_TEAM_ENEMY_COLOR;') ||
        !ignoredColorBody.includes('if (isFriendlyBuildingTarget(fl)) return WHITE_WASH;') ||
        !ignoredColorBody.includes('return CSS_TEAM_ENEMY_COLOR;')) {
      errors.push('healthbar_logic.js ignored fallback should match debug behavior: enemy/unknown red, friendly building white, neutral class green');
    }
  }
  if (healthbar.includes('function getDefaultBarColor')) {
    errors.push('healthbar_logic.js should inline ally reset default color instead of keeping dead getDefaultBarColor branches');
  }
  if (!healthbar.includes('var color = CSS_TEAM_FRIEND_COLOR;')) {
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
  for (const gateMarker of [
    'const HP_OPTIMIZED_FORCED_VALUES = {};',
    'const HP_OPTIMIZED_HIDDEN_SETTINGS = {',
    'function applyHpOptimizedHardGates(config)',
    'element.runtimeLocked = !!forced;',
    'element.runtimeHidden = !!hidden;',
    'if (element && element.runtimeHidden) return false;',
    'AnitaRuntimeLocked'
  ]) {
    if (!uiCore.includes(gateMarker) && !uiStyle.includes(gateMarker)) {
      errors.push(`HP Colors menu gate marker missing: ${gateMarker}`);
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
  const runtimeForcedMatch = healthbar.match(/var OPTIMIZED_FORCED_VALUES = \{([\s\S]*?)\};/);
  const runtimeForcedBlock = runtimeForcedMatch ? runtimeForcedMatch[1] : '';
  for (const runtimeLiveToggle of [
    'hp_ult_color_enabled',
    'hp_pulse_enabled',
    'hp_pulse_text_enabled',
    'hp_pulse_color_enabled',
    'hp_friend_enabled',
    'hp_friend_pulse_enabled',
    'hp_friend_pulse_color_enabled',
    'hp_kill_zone_enabled'
  ]) {
    if (runtimeForcedBlock.includes(runtimeLiveToggle)) {
      errors.push(`healthbar_logic.js runtime optimized profile must not force live feature toggle: ${runtimeLiveToggle}`);
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
    'function readBakedPresetHeroTargets(modConfig, presetId, displayIndex, fallbackHeroes)',
    'function readBakedPresetHeroMode(modConfig, presetId, displayIndex, fallbackMode, fallbackHeroes)',
    'var _hpPresetStoreEntries = null;',
    'function clearHpPresetStoreRefs()',
    'function readBakedPresetEntryBase(entry, modConfig, displayIndex, encoded, id)',
    'function materializeBakedPresetEntry(base, modConfig, displayIndex)',
    'modConfig.__hpBakedPresetEntryCache = cache;',
    'modConfig.__anitaPresetHeroSelections',
    'modConfig.__anitaPresetHeroModes',
    'function selectBakedPresetForHero(modConfig, allowUnknownFallback, allowHeroMatch)',
    'function hasHpSelectedScopedPreset(config)',
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
    'config.__hpHeroPresetLockAfterGameTime = gameTime > 0',
    'var lockedPresetKey = String(config.__hpLastAppliedHeroPresetKey || "");',
    'openHpHeroPresetDetectionWindow(config);',
    'lockHpHeroPresetDetectionIfReady(config, appliedHero);',
    'result = { preset: firstHeroMatch, heroId: heroId, hasScopedPreset: hasScopedPreset, reason: "hero" }',
    'result = { preset: null, heroId: heroId, hasScopedPreset: true, reason: "waiting_for_hero" }',
    'result = { preset: firstGlobal, heroId: heroId, hasScopedPreset: hasScopedPreset, reason: "global" }',
    'if (!config.__hpHeroPresetHasScopedPreset && !hasHpSelectedScopedPreset(config)) return;',
    'config.__hpHeroPresetWatchStarted = false;',
    'function applyHpColorsBakedPresetValues(config, values, presetKey, heroId)',
    'AnitaPersistence.applyResolvedValues(config, values);',
    'AnitaPersistence.persistConfig(config, true);',
    'AnitaRenderer.renderModSettings(config);',
    'update_source: "baked_preset_apply"',
    'force_persist: true',
    'if (config.title === "HP Colors" && changed) {\n        writeHpSharedSnapshot(config);'
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
    if (!uiCore.includes(replayMarker) && !healthbar.includes(replayMarker) && !loader.includes(replayMarker)) {
      errors.push(`Baked preset replay source missing marker: ${replayMarker}`);
    }
  }

  // 12. Full hp_colors base_hud must expose the builder insertion point so pak97 can carry pak96 preset store.
  const baseHud = fs.readFileSync(path.join(ROOT, 'hp_colors', 'panorama', 'layout', 'base_hud.xml'), 'utf-8');
  if (!baseHud.includes('id="AnitaUI_Anchor"')) {
    errors.push('base_hud.xml missing AnitaUI_Anchor for HPColorsPresetStore injection');
  }
  const buildScript = fs.readFileSync(path.join(ROOT, 'build_hp_colors.ps1'), 'utf-8');
  if (!fs.existsSync(path.join(ROOT, 'hp_colors', 'scripts', 'validate-hero-selector.js'))) {
    errors.push('hp_colors/scripts/validate-hero-selector.js missing');
  }
  for (const buildMarker of [
    'sync_hp_preset_store.js',
    'validate-hero-selector.js',
    'Minified hero selector audit passed.',
    'anita_ui_core.vjs_c',
    'anita_ui.vcss_c',
    'Packed VPK missing required asset',
    '--file-tree --no-progress',
    'pak96_dir.vpk',
    'HPColorsPresetStore'
  ]) {
    if (!buildScript.includes(buildMarker)) {
      errors.push(`build_hp_colors.ps1 missing preset-store sync marker: ${buildMarker}`);
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
    'function makeHeroPickerButton(parent, row)',
    'button.AddClass("AnitaPresetHeroPickerBtn");',
    'button.SetPanelEvent("onactivate", function () {',
    'function getHeroMenuPopupHost()',
    'function positionHeroMenu(menu, button, host)',
    'AnitaRenderer.popupHost',
    '$.CreatePanel("Panel", host || parent, "")',
    'function closeHeroMenu(button)',
    'function renderHeroMenu(menu, button, row, summaryLabel)',
    'function makeHeroMenuOption(menu, button, row, summaryLabel, kind, heroId)',
    'function syncHeroMenuState(menu, row)',
    'function handleHeroPickerChoice(button, row, summaryLabel, kind, heroId)',
    'option.SetPanelEvent("onactivate", function () {',
    'option.SetAttributeString("anita_hero_id", option.__anitaHeroId);',
    'option.SetAttributeString("anita_hero_kind", optionKind);',
    'iconSlot.AddClass("AnitaPresetHeroMenuOptionIcon");',
    'iconSlot.AddClass("AnitaPresetHeroMenuOptionIconAll");',
    'iconSlot.style.backgroundImage = "none";',
    'var heroIconImage = $.CreatePanel("Panel", iconSlot, "");',
    'heroIconImage.AddClass("AnitaPresetHeroMenuOptionHeroIcon");',
    'heroIconImage.__anitaHeroIconPath = hpHeroIconPath(heroId);',
    'heroIconImage.style.backgroundImage = "none";',
    'heroIconImage.style.minWidth = "22px";',
    'heroIconImage.style.maxWidth = "22px";',
    'heroIconImage.style.overflow = "clip";',
    'heroIconImage.style.backgroundSize = "100% 100%";',
    'heroIconImage.style.backgroundTextureSize = "22px 22px";',
    'heroIconImage.style.backgroundPosition = "50% 50%";',
    'heroIconImage.style.backgroundRepeat = "no-repeat";',
    'function settleHeroMenuIcons(menu)',
    'icon.style.minWidth = "22px";',
    'icon.style.maxWidth = "22px";',
    'icon.style.overflow = "clip";',
    'icon.style.backgroundImage = "url(\\"" + path + "\\")";',
    'settleHeroMenuIcons(menu);',
    'option.__anitaHeroId = isHero ? String(heroId || "") : "";',
    'option.__anitaHeroKind = optionKind;',
    'option.__anitaHeroCheckLabel.text = selected ? "✓" : "";',
    'menu.__anitaHeroOptions.push(option);',
    'function updateHeroMenuOptionState(option, selectedHeroes, scopeMode)',
    'var selectedHeroes = AnitaRenderer.getPresetRowHeroes(config, row);',
    'updateHeroMenuOptionState(menu.__anitaHeroOptions[i], selectedHeroes, scopeMode);',
    'function hpHeroIconPath(heroId)',
    's2r://panorama/images/heroes/',
    'function updateHeroFace(row, facePanel)',
    'renderHeroPickerState(button, row, summaryLabel || button.__anitaHeroSummaryLabel);',
    'var heroPicker = makeHeroPickerButton(heroSelector, row);',
    'face.AddClass("AnitaPresetHeroDropDownFace");',
    'face.hittest = false;',
    'faceIcon.AddClass("AnitaPresetHeroDropDownFaceIcon");',
    'faceLabel.AddClass("AnitaPresetHeroDropDownFaceLabel");',
    'button.__anitaHeroFacePanel = face;',
    'renderHeroPickerState(heroPicker, row, heroSummary);',
    'heroSummary.AddClass("AnitaPresetHeroSummary");',
    'heroPicker.__anitaHeroSummaryLabel = heroSummary;',
    'heroes: normalizeHpHeroSelection(preset.heroes),',
    'heroMode: normalizeHpHeroScopeMode(preset.heroMode, preset.heroes)',
    'store["id:" + String(row.id)] = normalized.slice(0);',
    'modeStore["id:" + String(row.id)] = scopeMode;',
    'row.token = this.buildPresetCodeToken(config, row.values || {}, row.name || "", row.payloadValues, row.heroes, row.heroMode);',
    'else tuple.push(scopeMode);'
  ]) {
    if (!uiCore.includes(iconMarker)) {
      errors.push(`anita_ui_core.js missing preset icon marker: ${iconMarker}`);
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
    'priorityUpLbl.text = "▲"',
    'priorityDownLbl.text = "▼"',
    'attachPresetTooltip(priorityUpBtn, "Move preset up.")',
    'function selectPresetRow(presetRow)',
    'heroSelector.SetPanelEvent("onactivate"'
  ]) {
    if (!uiCore.includes(priorityMarker)) {
      errors.push(`anita_ui_core.js missing preset priority marker: ${priorityMarker}`);
    }
  }

  // 14. Preset Builder import should use the same base64 Import path and auto-clear status.
  for (const importMarker of [
    'applyImportCode: function (config, text, source)',
    'var raw = AnitaBase64.decode(encoded)',
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
    'this.presetTooltip = $.CreatePanel("Panel", host, "AnitaPresetLocalTooltip")',
    'tooltip.style.zIndex = "10090"',
    'this.attachLocalTooltip(\n          resetPageHeader.btn',
    'PAGE resets only this page. Other pages stay unchanged.',
    'ALL resets HP settings. Saved presets stay.',
    'capturePresetBuilderState: function (config)',
    'restorePresetBuilderState: function (config, state)',
    'Opened web builder. Use COPY ALL to export presets.',
    'attachPresetTooltip(titleImportBtn, "Paste a custom preset code.")',
    'attachPresetTooltip(nameLabel, "Click to rename this preset.")',
    'Click a preset name to rename.',
    'defaultPresetKey = rows[defaultIndex].key',
    'config.__anitaSelectedPresetKey = row.key;',
    'var result = AnitaRenderer.applyImportCode(config, row.token, "preset_builder")',
    'function selectPresetRow(presetRow) {\n        if (importPreset(presetRow)) {',
    'selectPresetRow(presetRow);',
    '$.Schedule(durationSec, function () {\n          if (statusToken !== config.__anitaPresetStatusToken) return;',
    'var result = AnitaRenderer.applyImportCode(config, text, "import_popup")'
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

  if (warnings.length) warnings.forEach(w => console.warn('[AUDIT WARN]', w));
  if (errors.length) {
    errors.forEach(e => console.error('[AUDIT FAIL]', e));
    console.error(`\nAudit failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log(`[AUDIT PASS] Schema, defaults, and aliases are consistent (${schemaIds.length} settings).`);
  process.exit(0);
}

main();
