const fs = require("node:fs");
const path = require("node:path");
const {
  FULL_ONLY_SETTING_IDS,
  checkBooleanFlagDefaults,
  checkForbiddenSourceTerms,
  checkFullSettingsContract,
  checkMinimalSettingsContract,
  extractObjectKeys,
  readHpColorLaneSources,
} = require("../../scripts/hp-colors-validator-contract.js");

const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..");
const REQUIRED_FILES = [
  "panorama/layout/unit_status_overlay.xml",
  "panorama/scripts/anita_ui_core.js",
  "panorama/scripts/healthbar_logic.js",
  "panorama/styles/unit_status.css",
];
const FORBIDDEN_FILES = [
  "panorama/layout/base_hud.xml",
  "panorama/layout/hud_escape_menu.xml",
  "panorama/layout/hud_health.xml",
  "panorama/layout/unit_status_overlay_v2.xml",
  "panorama/layout/unit_status_overlay_new.xml",
  "panorama/scripts/anita_persist_loader.js",
  "panorama/scripts/bootstrap.js",
  "panorama/scripts/hp_registrar.js",
  "panorama/scripts/preset.json",
  "panorama/styles/anita_ui.css",
  "panorama/styles/hp_colors_minimal/healthbar_overrides.css",
  "scripts/validate-schema.js",
];
const FORBIDDEN_SOURCE_TERMS = [
  "base_hud",
  "hud_escape_menu",
  "anita_persist_loader",
  "hp_registrar",
  "preset.json",
  "Convars",
  "GetConvar",
  "SetConvar",
  "sessionStorage",
  "localStorage",
  "live_update",
  "live-update",
  "anita_ui",
  "HPPresetBuilderModel",
  "HPPresetBuilderActions",
  "AnitaPresetBuilderPanel",
  "__anitaUserPresetRows",
  "__anitaPresetPriorityOrder",
  "__anitaPresetNameOverrides",
  "AnitaUI.Register",
];

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function extractDefaultKeys(source) {
  return extractObjectKeys(source, "DEFAULTS") || [];
}

function getValidationReport() {
  const errors = [];
  const healthbar = readText("panorama/scripts/healthbar_logic.js");
  const publisher = readText("panorama/scripts/anita_ui_core.js");
  const combinedSource = `${healthbar}\n${publisher}`;
  const laneSources = readHpColorLaneSources(REPO_ROOT);
  const fullReport = checkFullSettingsContract(laneSources.fullUiSource, laneSources.fullRuntimeSource);
  const minimalReport = checkMinimalSettingsContract(publisher, healthbar, fullReport.contract);
  errors.push(...fullReport.errors.map(error => `full lane contract: ${error}`));
  errors.push(...minimalReport.errors.map(error => `minimal lane contract: ${error}`));

  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) errors.push(`missing required runtime asset: ${file}`);
  }
  for (const file of FORBIDDEN_FILES) {
    if (fs.existsSync(path.join(ROOT, file))) errors.push(`forbidden minimal artifact present: ${file}`);
  }
  checkForbiddenSourceTerms(errors, "production source", combinedSource, FORBIDDEN_SOURCE_TERMS);
  checkBooleanFlagDefaults(errors, "runtime", healthbar, { CAPTURE_ENABLED: false });

  const defaultKeys = minimalReport.contract.runtimeDefaultKeys || extractDefaultKeys(healthbar);
  return {
    ok: errors.length === 0,
    errors,
    defaultKeys,
    laneContract: {
      fullCount: fullReport.contract.schemaIds.length,
      minimalCount: minimalReport.contract.runtimeDefaultKeys.length,
      expectedMinimalIds: minimalReport.expectedMinimalIds,
      fullOnlySettingIds: FULL_ONLY_SETTING_IDS.slice(),
    },
  };
}

function main() {
  const report = getValidationReport();
  if (!report.ok) {
    for (const error of report.errors) console.error(`[minimal-validate] ${error}`);
    process.exit(1);
  }
  console.log(`[minimal-validate] OK (${report.defaultKeys.length} DEFAULTS keys)`);
}

if (require.main === module) {
  main();
}

module.exports = {
  getValidationReport,
  extractDefaultKeys,
};
