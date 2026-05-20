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

  const schemaIds = extractSchemaIds(registrar);
  const defaultsKeys = extractDefaultsKeys(healthbar);
  const aliasesCore = extractAliases(uiCore, 'HP_PERSIST_ALIASES');
  const aliasesLoader = extractAliases(loader, 'HP_PERSIST_ALIASES');
  const revAliases = extractReverseAliases(healthbar, 'HP_PERSIST_ALIAS_TO_ID');
  const registrarDefaults = extractRegistrarDefaults(registrar);

  const errors = [];
  const warnings = [];

  if (!schemaIds || schemaIds.length === 0) errors.push('Could not extract SCHEMA from hp_registrar.js');
  if (!defaultsKeys || defaultsKeys.length === 0) errors.push('Could not extract DEFAULTS from healthbar_logic.js');
  if (!aliasesCore || Object.keys(aliasesCore).length === 0) errors.push('Could not extract HP_PERSIST_ALIASES from anita_ui_core.js');
  if (!aliasesLoader || Object.keys(aliasesLoader).length === 0) errors.push('Could not extract HP_PERSIST_ALIASES from anita_persist_loader.js');
  if (!revAliases || Object.keys(revAliases).length === 0) errors.push('Could not extract HP_PERSIST_ALIAS_TO_ID from healthbar_logic.js');
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

  // 7. Reverse alias parity with forward aliases
  for (const id of schemaIds) {
    const short = aliasesCore[id];
    if (revAliases[short] !== id) {
      errors.push(`Reverse alias mismatch: ${id} -> "${short}" -> "${revAliases[short]}"`);
    }
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

  // 9. Reverse aliases should not have orphaned entries
  const revKeys = new Set(Object.keys(revAliases));
  const fwdVals = new Set(Object.values(aliasesCore));
  for (const v of revKeys) {
    if (!fwdVals.has(v)) errors.push(`Reverse alias orphaned short code: "${v}"`);
  }

  // 10. Hot-loop optimization guards
  if (!healthbar.includes('STYLE_REAPPLY_WATCHDOG_MS')) {
    errors.push('healthbar_logic.js missing STYLE_REAPPLY_WATCHDOG_MS');
  }
  if (healthbar.includes('STYLE_REAPPLY_MS = 1000')) {
    errors.push('healthbar_logic.js must not force style reapply every 1s');
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
    'function selectBakedPresetForHero(modConfig, allowUnknownFallback)',
    'function hasHpSelectedScopedPreset(config)',
    'const HP_HERO_SCOPE_OFF = "off"',
    'const HP_HERO_SCOPE_ALL = "all"',
    'const HP_HERO_SCOPE_SELECTED = "selected"',
    'const HP_HERO_WATCH_IDLE_LOG_TICKS = 30',
    'function logHpHeroPresetEvent(eventName, data)',
    'function refreshHpHeroPresetSelection(config, logWait)',
    '"[HP-COLORS][HERO-PRESET] event="',
    'logHpHeroPresetEvent("hero_changed", {',
    'logHpHeroPresetEvent("preset_apply", {',
    'logHpHeroPresetEvent("preset_wait", {',
    'values: countObjectKeys(selection.preset.values || {})',
    'startHpHeroPresetWatch(config);',
    'return { preset: firstHeroMatch, heroId: heroId, hasScopedPreset: hasScopedPreset, reason: "hero" }',
    'return { preset: null, heroId: heroId, hasScopedPreset: true, reason: "waiting_for_hero" }',
    'return { preset: firstGlobal, heroId: heroId, hasScopedPreset: hasScopedPreset, reason: "global" }',
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
    'startHpHeroPresetWatch(config);',
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
    'background-texture-size: 16px 16px;'
  ]) {
    if (!uiStyle.includes(iconStyleMarker)) {
      errors.push(`anita_ui.css missing preset icon style marker: ${iconStyleMarker}`);
    }
  }
  if (!/\.AnitaPresetHeroPickerBtn\s*,\s*\n\.AnitaPresetHeroBtn\s*\{[\s\S]*?height:\s*30px;/.test(uiStyle)) {
    errors.push('anita_ui.css missing 30px height inside .AnitaPresetHeroPickerBtn');
  }
  if (!/\.AnitaPresetHeroMenuOption\s*\{[\s\S]*?padding:\s*5px 5px 5px 8px;/.test(uiStyle)) {
    errors.push('anita_ui.css missing compact padding inside custom hero menu options');
  }

  // 14. Preset Builder import should use the same base64 Import path and auto-clear status.
  for (const importMarker of [
    'applyImportCode: function (config, text, source)',
    'var raw = AnitaBase64.decode(encoded)',
    'import_source: String(source || "import")',
    'var titleImportBtn = $.CreatePanel("Button", titleRow, "")',
    'titleImportBtn.AddClass("AnitaPresetImportBtn")',
    'defaultPresetKey = rows[defaultIndex].key',
    'config.__anitaSelectedPresetKey = row.key;',
    'var result = AnitaRenderer.applyImportCode(config, row.token, "preset_builder")',
    'if (importPreset(presetRow)) {\n              AnitaRenderer.renderModSettings(config);',
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
