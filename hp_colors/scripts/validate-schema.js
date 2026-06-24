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
const LAYOUTS_DIR = path.join(ROOT, 'hp_colors', 'panorama', 'layout');
const MAX_HEALTHBAR_RUNTIME_FUNCTIONS = 95;
const ALLOWED_RUNTIME_PANEL_IDS = new Set([
  'UnitStatus',
  'InfoHealthContainer',
  'UnitHealthbarContainer',
  'unit_healthbar_lagging',
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAssignedString(text, name) {
  const match = text.match(new RegExp('(?:const|var)\\s+' + escapeRegExp(name) + '\\s*=\\s*"([^"]+)"'));
  return match ? match[1] : null;
}

function extractProtocolString(text, propertyName) {
  const direct = text.match(new RegExp(escapeRegExp(propertyName) + '\\s*:\\s*"([^"]+)"'));
  if (direct) return direct[1];
  const ref = text.match(new RegExp(escapeRegExp(propertyName) + '\\s*:\\s*([A-Za-z_$][\\w$]*)'));
  return ref ? extractAssignedString(text, ref[1]) : null;
}


function findBalancedBlock(text, openIndex, openChar, closeChar) {
  if (openIndex < 0 || text[openIndex] !== openChar) return null;
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return null;
}

function extractAssignedBlock(text, varName, openChar, closeChar) {
  const re = new RegExp('(?:var|const)\\s+' + escapeRegExp(varName) + '\\s*=\\s*\\' + openChar);
  const m = re.exec(text);
  if (!m) return null;
  return findBalancedBlock(text, m.index + m[0].length - 1, openChar, closeChar);
}

function extractContractPropertyBlock(text, propName, openChar, closeChar) {
  const re = new RegExp('\\b' + escapeRegExp(propName) + '\\s*:\\s*\\' + openChar);
  const m = re.exec(text);
  if (!m) return null;
  return findBalancedBlock(text, m.index + m[0].length - 1, openChar, closeChar);
}

function extractSchemaBlock(text) {
  return extractContractPropertyBlock(text, 'SETTINGS', '[', ']') ||
    extractAssignedBlock(text, 'SCHEMA', '[', ']');
}

function extractDefaultsBlock(text) {
  return extractContractPropertyBlock(text, 'DEFAULTS', '{', '}') ||
    extractAssignedBlock(text, 'DEFAULTS', '{', '}');
}

function extractAliasesBlock(text, varName) {
  const contractName = varName === 'HP_PERSIST_ALIASES' ? 'ALIASES' : varName;
  return extractContractPropertyBlock(text, contractName, '{', '}') ||
    extractAssignedBlock(text, varName, '{', '}');
}

function extractSchemaObjects(text) {
  const block = extractSchemaBlock(text);
  if (!block) return null;
  const objects = [];
  for (let i = 0; i < block.length; i++) {
    if (block[i] !== '{') continue;
    const body = findBalancedBlock(block, i, '{', '}');
    if (body === null) continue;
    objects.push(body);
    i += body.length + 1;
  }
  return objects;
}

function extractSchemaIds(text) {
  const objects = extractSchemaObjects(text);
  if (!objects) return null;
  const ids = [];
  for (const objectText of objects) {
    const idMatch = objectText.match(/\bid:\s*["']([^"']+)["']/);
    if (idMatch) ids.push(idMatch[1]);
  }
  return ids;
}

function extractDefaultsKeys(text) {
  const block = extractDefaultsBlock(text);
  if (!block) return null;
  const keys = [];
  const kvRe = /(?:"([^"]+)"|'([^']+)'|([a-z_][a-z0-9_]*))\s*:/g;
  let km;
  while ((km = kvRe.exec(block)) !== null) keys.push(km[1] || km[2] || km[3]);
  return keys;
}

function parseSimpleJsLiteral(token) {
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (/^-?\d+$/.test(token)) return parseInt(token, 10);
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return undefined;
}

function extractDefaultsValues(text) {
  const block = extractDefaultsBlock(text);
  if (!block) return null;
  const values = {};
  const kvRe = /(?:"([^"]+)"|'([^']+)'|([a-z_][a-z0-9_]*))\s*:\s*("[^"]*"|'[^']*'|true|false|-?\d+)/g;
  let km;
  while ((km = kvRe.exec(block)) !== null) {
    const key = km[1] || km[2] || km[3];
    values[key] = parseSimpleJsLiteral(km[4]);
  }
  return values;
}


function extractAliases(text, varName) {
  const block = extractAliasesBlock(text, varName);
  if (!block) return null;
  const aliases = {};
  // Support both quoted and unquoted keys, values always quoted
  const kvRe = /(?:"([^"]+)"|'([^']+)'|([a-z_][a-z0-9_]*))\s*:\s*"([^"]+)"/g;
  let km;
  while ((km = kvRe.exec(block)) !== null) {
    const key = km[1] || km[2] || km[3];
    aliases[key] = km[4];
  }
  return aliases;
}

function extractReverseAliases(text, varName) {
  const block = extractAliasesBlock(text, varName);
  if (!block) return null;
  const rev = {};
  // Support both quoted and unquoted keys, values always quoted
  const kvRe = /(?:"([^"]+)"|'([^']+)'|([a-z_][a-z0-9_]*))\s*:\s*"([^"]+)"/g;
  let km;
  while ((km = kvRe.exec(block)) !== null) {
    const key = km[1] || km[2] || km[3];
    rev[key] = km[4];
  }
  return rev;
}

function extractSchemaDefaults(text) {
  const objects = extractSchemaObjects(text);
  if (!objects) return null;
  const defs = {};
  for (const objectText of objects) {
    const idMatch = objectText.match(/\bid:\s*["']([^"']+)["']/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const dvMatch = objectText.match(/defaultValue:\s*("[^"]*"|'[^']*'|true|false|-?\d+)/);
    if (dvMatch) {
      let v = dvMatch[1];
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
      else v = v.slice(1, -1);
      defs[id] = v;
    }
  }
  return defs;
}

function extractContractString(text, propName) {
  const re = new RegExp("\\b" + escapeRegExp(propName) + "\\s*:\\s*[\"']([^\"']+)[\"']");
  const m = text.match(re);
  return m ? m[1] : null;
}

function extractContractNumber(text, propName) {
  const re = new RegExp('\\b' + escapeRegExp(propName) + '\\s*:\\s*(-?\\d+)');
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : null;
}


function extractFunctionDeclarationNames(text) {
  const names = [];
  const re = /^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(text)) !== null) names.push(m[1]);
  return names;
}

function extractFindChildIds(text) {
  const ids = [];
  const re = /FindChildTraverse\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(text)) !== null) ids.push(m[1]);
  return ids;
}

function extractRuntimeIdConstants(text) {
  const ids = [];
  const re = /^\s*var\s+ID_[A-Z0-9_]+\s*=\s*["']([^"']+)["'];/gm;
  let m;
  while ((m = re.exec(text)) !== null) ids.push(m[1]);
  return ids;
}

function main() {
  const healthbar = readFile('healthbar_logic.js');
  const uiCore = readFile('anita_ui_core.js');
  const uiStyle = readStyleFile('anita_ui.css');
  const unitStyle = readStyleFile('unit_status.css');
  const baseHud = readLayoutFile('base_hud.xml');
  const unitStatusOverlay = readLayoutFile('unit_status_overlay.xml');

  const schemaIds = extractSchemaIds(uiCore);
  const defaultsKeys = extractDefaultsKeys(healthbar);
  const aliasesCore = extractAliases(uiCore, 'HP_PERSIST_ALIASES');
  const revAliases = extractReverseAliases(healthbar, 'HP_PERSIST_ALIAS_TO_ID') || {};
  const schemaDefaults = extractSchemaDefaults(uiCore);
  const runtimeDefaults = extractDefaultsValues(healthbar);
  const schemaNamespace = extractContractString(uiCore, 'storageNamespace');
  const schemaVersion = extractContractNumber(uiCore, 'storageVersion');

  const errors = [];

  if (schemaNamespace !== 'hp_colors') {
    errors.push(`anita_ui_core.js storageNamespace must be "hp_colors", got: ${schemaNamespace}`);
  }
  if (schemaVersion !== 97) {
    errors.push(`anita_ui_core.js storageVersion must be 97, got: ${schemaVersion}`);
  }

  if (!schemaIds || schemaIds.length === 0) errors.push('Could not extract SETTINGS from anita_ui_core.js');
  if (!defaultsKeys || defaultsKeys.length === 0) errors.push('Could not extract DEFAULTS from healthbar_logic.js');
  if (!aliasesCore || Object.keys(aliasesCore).length === 0) errors.push('Could not extract HP_PERSIST_ALIASES from anita_ui_core.js');
  if (!runtimeDefaults || Object.keys(runtimeDefaults).length === 0) errors.push('Could not extract DEFAULTS values from healthbar_logic.js');
  if (!schemaDefaults || Object.keys(schemaDefaults).length === 0) errors.push('Could not extract SETTINGS defaults from anita_ui_core.js');

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

  const healthbarFunctionNames = extractFunctionDeclarationNames(healthbar);
  if (healthbarFunctionNames.length > MAX_HEALTHBAR_RUNTIME_FUNCTIONS) {
    errors.push(
      `healthbar_logic.js declares ${healthbarFunctionNames.length} runtime functions; max ${MAX_HEALTHBAR_RUNTIME_FUNCTIONS}`
    );
  }
  for (const id of extractFindChildIds(healthbar).concat(extractRuntimeIdConstants(healthbar))) {
    if (!ALLOWED_RUNTIME_PANEL_IDS.has(id)) {
      errors.push(`healthbar_logic.js uses unverified runtime panel id: ${id}`);
    }
  }
  for (const id of FORBIDDEN_RUNTIME_PANEL_IDS) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactString = new RegExp(`["']${escaped}["']`);
    if (exactString.test(healthbar)) {
      errors.push(`healthbar_logic.js contains forbidden fallback panel id: ${id}`);
    }
  }

  const schemaSet = new Set(schemaIds);
  const defaultsSet = new Set(defaultsKeys);
  const aliasIdsCore = Object.keys(aliasesCore);
  const aliasIdsSetCore = new Set(aliasIdsCore);

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
  }

  // 4. Alias IDs missing from SCHEMA (orphaned aliases)
  for (const id of aliasIdsCore) {
    if (!schemaSet.has(id)) errors.push(`anita_ui_core.js orphaned alias: ${id}`);
  }

  // 5. Alias values duplicate check
  const valCounts = {};
  for (const [id, val] of Object.entries(aliasesCore)) {
    valCounts[val] = (valCounts[val] || 0) + 1;
  }
  for (const [val, count] of Object.entries(valCounts)) {
    if (count > 1) errors.push(`Duplicate alias value in anita_ui_core.js: "${val}" used ${count} times`);
  }

  // 7. Compact alias conversion belongs to Anita/import loaders, not the hot healthbar runtime.
  // 8. UI schema defaults vs runtime defaults
  for (const id of schemaIds) {
    const schemaValue = schemaDefaults[id];
    const runtimeValue = runtimeDefaults[id];
    if (schemaValue !== runtimeValue) {
      errors.push(
        `Default mismatch for ${id}: Anita=${JSON.stringify(schemaValue)} runtime=${JSON.stringify(runtimeValue)}`
      );
    }
  }
  for (const contractMarker of [
    'buildOrderedIds: function ()',
    'buildDefaults: function ()',
    'buildSupportedPresetIds: function ()',
    'const HP_SETTING_IDS = HPSettingsContract.buildOrderedIds();',
    'const HP_SETTING_DEFAULTS = HPSettingsContract.buildDefaults();',
    'HPSettingsContract.buildSupportedPresetIds();'
  ]) {
    if (!uiCore.includes(contractMarker)) {
      errors.push(`HPSettingsContract missing derived-map marker: ${contractMarker}`);
    }
  }
  if (uiCore.includes('hp_kill_zone_width: true')) {
    errors.push('anita_ui_core.js should derive HP_PRESET_BUILDER_SUPPORTED_IDS from HPSettingsContract instead of hand-maintaining the 49-key map');
  }
  for (const codecMarker of [
    'const HPValueCodecs = {',
    'sanitizeBoolean: function (value, fallback)',
    'sanitizeCyclerIndex: function (element, value)',
    'sanitizeNumber: function (element, value)',
    'sanitizeColor: function (value, fallback)',
    'sanitizePosition: function (value, fallback)',
    'sanitizeElementValue: function (element, value)',
    'return HPValueCodecs.sanitizeElementValue(element, value);',
    'this.clampNumber(source[0], 0, 400, 0)',
    'this.clampNumber(source.y, -50, 400, 200)',
    'source.match(/-?\\d+(?:\\.\\d+)?/g)'
  ]) {
    if (!uiCore.includes(codecMarker)) {
      errors.push(`HPValueCodecs missing marker: ${codecMarker}`);
    }
  }
  for (const runtimeCodecMarker of [
    'var HPValueCodecs = {',
    'formatPositionValue: function (rawPos)',
    'coerceBooleanValue: function (value, fallback)',
    'coerceNumberValue: function (value, fallback)',
    'coerceStringValue: function (value, fallback)',
    'coerceCfgValue: function (id, value)',
    'return HPValueCodecs.coerceCfgValue(id, value);',
    'Array.isArray(rawPos)',
    'Object.prototype.hasOwnProperty.call(rawPos, "x")',
    'rawPos.match(/-?\\d+(?:\\.\\d+)?/g)',
    'clampNum(rawPos[0], 0, 400, 0)',
    'clampNum(rawPos.y, -50, 400, 200)'
  ]) {
    if (!healthbar.includes(runtimeCodecMarker)) {
      errors.push(`runtime HPValueCodecs missing marker: ${runtimeCodecMarker}`);
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
    'getIgnoredTargetColor: function (snapshot)',
    'if (cfg.hp_skip_buildings && target.isBuilding)',
    'normalizeWashColor(cfg.hp_color_high) === normalizeWashColor(DEFAULTS.hp_color_high)',
    'HealthbarPainter.setBarColor(getHighColor());'
  ]) {
    if (!healthbar.includes(runtimeColorMarker)) {
      errors.push(`healthbar_logic.js missing first-paint/building color marker: ${runtimeColorMarker}`);
    }
  }
  const ignoredColorStart =
    healthbar.indexOf('getIgnoredTargetColor: function (snapshot)') >= 0
      ? healthbar.indexOf('getIgnoredTargetColor: function (snapshot)')
      : healthbar.indexOf('function getIgnoredTargetColor(snapshot)');
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
    'var presets = HPPresetRepository.readRuntimePresetEntries(modConfig);',
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
    if (!uiCore.includes(replayMarker) && !healthbar.includes(replayMarker)) {
      errors.push(`Baked preset replay source missing marker: ${replayMarker}`);
    }
  }

  // 12. Anita UI and healthbar runtime duplicate the bridge protocol in two scripts; shared literals must not drift.
  if (!uiCore.includes('const HPBridgeProtocol = {')) {
    errors.push('anita_ui_core.js missing Anita-side HPBridgeProtocol');
  }
  if (!healthbar.includes('var HPBridgeProtocol = {')) {
    errors.push('healthbar_logic.js missing runtime HPBridgeProtocol');
  }
  for (const [label, uiProp, runtimeProp] of [
    ['event channel', 'eventChannel', 'eventChannel'],
    ['preset snapshot magic', 'presetSnapshotMagic', 'presetSnapshotMagic'],
    ['preset request magic', 'presetRequestMagic', 'presetRequestMagic'],
    ['bulk update magic', 'bulkUpdateMagic', 'bulkUpdateMagic'],
    ['single update magic', 'singleUpdateMagic', 'singleUpdateMagic'],
    ['bootstrap request magic', 'bootstrapRequestMagic', 'bootstrapRequestMagic'],
    ['shared config raw key', 'sharedCfgRawKey', 'sharedCfgRawKey'],
    ['shared match reset key', 'sharedMatchResetKey', 'sharedMatchResetKey']
  ]) {
    const uiValue = extractProtocolString(uiCore, uiProp);
    const runtimeValue = extractProtocolString(healthbar, runtimeProp);
    if (!uiValue || !runtimeValue || uiValue !== runtimeValue) {
      errors.push(`HPBridgeProtocol ${label} drift: Anita=${JSON.stringify(uiValue)} runtime=${JSON.stringify(runtimeValue)}`);
    }
  }
  for (const sharedMethod of [
    'dispatchPayload',
    'dispatchRawPayload',
    'readSharedConfigRaw',
    'writeSharedConfigRaw',
    'isBulkUpdate',
    'isSingleUpdate'
  ]) {
    const marker = `${sharedMethod}: function`;
    if (!uiCore.includes(marker)) {
      errors.push(`Anita HPBridgeProtocol missing shared method marker: ${sharedMethod}`);
    }
    if (!healthbar.includes(marker)) {
      errors.push(`runtime HPBridgeProtocol missing shared method marker: ${sharedMethod}`);
    }
  }


  // 12. Full hp_colors builds from source base_hud.xml directly; pak96 preset-store sync is intentionally not part of this build.
  if (!baseHud.includes('id="AnitaUI_Anchor"')) {
    errors.push('base_hud.xml missing AnitaUI_Anchor for Anita UI bootstrap');
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
    'Packed VPK missing required asset',
    '--file-tree --no-progress'
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
    'option.__anitaHeroCheckLabel.text = selected ? "✓" : "";',
    'menu.__anitaHeroOptions.push(option);',
    'function hpHeroIconPath(heroId)',
    's2r://panorama/images/heroes/',
    'renderHeroPickerState(',
    'var heroPicker = makeHeroPickerButton(heroSelector, row);',
    'renderHeroPickerState(heroPicker, row, heroSummary);',
    'heroPicker.__anitaHeroSummaryLabel = heroSummary;',
    'HPPresetHeroSelection.getRowHeroes',
    'HPPresetHeroSelection.getRowHeroMode',
    'HPPresetHeroSelection.setRowScope',
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
    'else tuple.push(scopeMode);',
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
    'priorityUpLbl.text = "▲"',
    'priorityDownLbl.text = "▼"',
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
    'this.presetTooltip = $.CreatePanel(',
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
    'var result = AnitaRenderer.applyImportCode(',
    'function selectPresetRow(presetRow) {\n        if (importPreset(presetRow)) {',
    'selectPresetRow(presetRow);',
    '$.Schedule(durationSec, function () {\n          if (statusToken !== config.__anitaPresetStatusToken) return;',
    '"import_popup",'
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
