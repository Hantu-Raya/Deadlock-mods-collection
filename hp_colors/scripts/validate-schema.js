#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  HP_COLORS_LANE_CONTRACT,
  checkFullSettingsContract,
} = require('../../scripts/hp-colors-validator-contract.js');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function extractScriptIncludes(source) {
  return Array.from(source.matchAll(/scripts\/([^"']+\.vjs_c)/g), match => match[1]).sort();
}

function main() {
  const uiCore = read('hp_colors/panorama/scripts/anita_ui_core.js');
  const healthbar = read('hp_colors/panorama/scripts/healthbar_logic.js');
  const report = checkFullSettingsContract(uiCore, healthbar);
  const errors = report.errors.slice();
  const layouts = [
    ['hp_colors/panorama/layout/base_hud.xml', 'anita_ui_core.vjs_c'],
    ['hp_colors/panorama/layout/unit_status_overlay.xml', 'healthbar_logic.vjs_c'],
  ];
  for (const [layoutPath, expectedScript] of layouts) {
    const includes = extractScriptIncludes(read(layoutPath));
    if (includes.length !== 1 || includes[0] !== expectedScript) {
      errors.push(`${layoutPath} should load only ${expectedScript}, got: ${includes.join(', ') || '(none)'}`);
    }
  }

  if (errors.length) {
    errors.forEach(error => console.error('[AUDIT FAIL]', error));
    console.error(`\nAudit failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log(`[AUDIT PASS] Schema, defaults, aliases, and bridge are consistent (${report.contract.schemaIds.length} settings; expected ${HP_COLORS_LANE_CONTRACT.full.expectedCount}).`);
}

main();
