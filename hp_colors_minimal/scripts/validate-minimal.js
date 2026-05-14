const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..");
const REQUIRED_FILES = [
  "panorama/layout/unit_status_overlay.xml",
  "panorama/scripts/anita_ui_core.js",
  "panorama/scripts/anita_persist_loader.js",
  "panorama/scripts/hp_registrar.js",
  "panorama/scripts/healthbar_logic.js",
  "panorama/styles/anita_ui.css",
  "panorama/styles/unit_status.css"
];
const FORBIDDEN_FILES = [
  "panorama/layout/base_hud.xml",
  "panorama/layout/hud_escape_menu.xml",
  "panorama/layout/hud_health.xml",
  "scripts/validate-schema.js"
];

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function listFiles(dir = ROOT) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(path.relative(ROOT, full).replace(/\\/g, "/"));
    }
  }
  return out.sort();
}

function extractDefaultKeys(source) {
  const match = source.match(/var\s+DEFAULTS\s*=\s*\{([\s\S]*?)\};/);
  if (!match) return [];
  return [...match[1].matchAll(/\b(hp_[a-z0-9_]+)\s*:/g)].map((item) => item[1]);
}

function getValidationReport() {
  const errors = [];
  const files = listFiles();
  const fileSet = new Set(files);

  for (const file of REQUIRED_FILES) {
    if (!fileSet.has(file)) errors.push(`Missing required file: ${file}`);
  }
  for (const file of FORBIDDEN_FILES) {
    if (fileSet.has(file)) errors.push(`Forbidden menu/settings file present: ${file}`);
  }

  let unitStatusXml = "";
  let bootstrapSource = "";
  let healthbarSource = "";
  let anitaCss = "";
  try { unitStatusXml = readText("panorama/layout/unit_status_overlay.xml"); } catch (error) { errors.push(`Could not read unit_status_overlay.xml: ${error.message}`); }
  try { bootstrapSource = readText("panorama/scripts/anita_ui_core.js"); } catch (error) { errors.push(`Could not read anita_ui_core.js: ${error.message}`); }
  try { healthbarSource = readText("panorama/scripts/healthbar_logic.js"); } catch (error) { errors.push(`Could not read healthbar_logic.js: ${error.message}`); }
  try { anitaCss = readText("panorama/styles/anita_ui.css"); } catch (error) { errors.push(`Could not read anita_ui.css: ${error.message}`); }

  const defaultKeys = extractDefaultKeys(healthbarSource);
  if (defaultKeys.length !== 45) errors.push(`Expected 45 healthbar DEFAULTS keys, found ${defaultKeys.length}`);

  if (unitStatusXml) {
    if (!unitStatusXml.includes("healthbar_logic.vjs_c")) errors.push("unit_status_overlay.xml must include healthbar_logic.vjs_c");
    if (unitStatusXml.includes("hp_preset_bootstrap.vjs_c")) errors.push("unit_status_overlay.xml must not include old hp_preset_bootstrap.vjs_c");
  }

  if (bootstrapSource) {
    for (const required of ["HPColorsPresetStore", "ANITA_BULK_UPDATE", "ANITA_UPDATE", "ANITA_REQUEST_BOOTSTRAP", "bridge_bootstrap", "core_auto_resync", "__hpColorsCfgRaw", "force_emit"]) {
      if (!bootstrapSource.includes(required)) errors.push(`anita_ui_core.js missing ${required}`);
    }
    for (const forbidden of ["AnitaUI_Window", "colorpicker", "renderModSettings", "AnitaRenderer"]) {
      if (bootstrapSource.includes(forbidden)) errors.push(`anita_ui_core.js must not contain menu code marker: ${forbidden}`);
    }
  }

  if (anitaCss) {
    for (const forbidden of ["AnitaUI_Window", "AnitaWindow", "colorpicker", "ColorPicker", "AnitaOverlayBtn"]) {
      if (anitaCss.includes(forbidden)) errors.push(`anita_ui.css dummy stub must not contain menu CSS marker: ${forbidden}`);
    }
  }

  return {
    root: ROOT,
    repoRoot: REPO_ROOT,
    errors,
    files,
    unitStatusXml,
    bootstrapSource,
    anitaCss,
    defaultKeys
  };
}

function main() {
  const report = getValidationReport();
  if (report.errors.length) {
    for (const error of report.errors) console.error(`[ERROR] ${error}`);
    process.exit(1);
  }
  console.log(`[AUDIT PASS] hp_colors_minimal has ${report.defaultKeys.length} runtime settings and no Anita menu files.`);
}

if (require.main === module) {
  main();
}

module.exports = {
  getValidationReport
};
