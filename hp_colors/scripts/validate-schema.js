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
  return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf-8');
}

function readStyleFile(name) {
  return fs.readFileSync(path.join(STYLES_DIR, name), 'utf-8');
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
    'return presets[presets.length - 1].values || {}',
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

  // 12. Preset Builder import should use the same base64 Import path and auto-clear status.
  for (const importMarker of [
    'applyImportCode: function (config, text, source)',
    'var raw = AnitaBase64.decode(encoded)',
    'import_source: String(source || "import")',
    'var titleImportBtn = $.CreatePanel("Button", titleRow, "")',
    'titleImportBtn.AddClass("AnitaPresetImportBtn")',
    'defaultPresetKey = rows[defaultIndex].key',
    'var result = AnitaRenderer.applyImportCode(config, row.token, "preset_builder")',
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
