const fs = require("node:fs");
const path = require("node:path");
const {
  FULL_ONLY_SETTING_IDS,
  checkBooleanFlagDefaults,
  checkForbiddenSourceTerms,
  checkFullSettingsContract,
  checkFunctionDeclarationCap,
  checkLevelTierCssParity,
  checkMinimalSettingsContract,
  checkObjectInterface,
  checkRequiredSourceTerms,
  checkRuntimePanelIds,
  extractObjectKeys,
  readHpColorLaneSources,
} = require("../../scripts/hp-colors-validator-contract.js");


const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..");
const REQUIRED_FILES = [
  "AGENTS.md",
  "panorama/layout/unit_status_overlay.xml",
  "panorama/scripts/anita_ui_core.js",
  "panorama/scripts/healthbar_logic.js",
  "panorama/styles/unit_status.css",
  "scripts/validate-minimal.js",
  "scripts/validate-minimal.test.js"
];
const ALLOWED_FILES = new Set(REQUIRED_FILES);
const FORBIDDEN_FILES = [
  "debug",
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
  "scripts/validate-schema.js"
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
  "AnitaUI.Register"
];
const REQUIRED_BRIDGE_TERMS = [
  "HP_COLORS_PRESET_REQUEST",
  "HP_COLORS_PRESET_SNAPSHOT",
  "__hpColorsCfgRaw",
  "hp_colors_minimal_cfg_raw",
  "values_raw"
];
const REQUIRED_UNIT_STATUS_TERMS = [
  "UnitStatus",
  "InfoHealthContainer",
  "LevelContainer",
  "unit_level_label",
  "UnitHealthbarContainer",
  "unit_healthbar_lagging",
  "unit_healthbar_healing",
  "unit_healthbar_delta",
  "unit_healthbar_bullet_shield",
  "unit_healthbar_bg",
  "unit_healthbar_pip_label",
  "unit_ult_ready_icon",
  "hp_counter_anchor",
  "hp_counter",
  "hp_kill_zone_marker",
  "enemy",
  "friend",
  "team1",
  "team2",
  "level_number_visible",
  "level_tier",
  "low_hp_pulsing",
  "pulse_"
];
const MAX_HEALTHBAR_RUNTIME_FUNCTIONS = 115;
const MAX_PUBLISHER_FUNCTIONS = 62;
const ALLOWED_RUNTIME_PANEL_IDS = new Set([
  "UnitStatus",
  "InfoHealthContainer",
  "UnitHealthbarContainer",
  "unit_healthbar_lagging",
  "unit_healthbar_healing",
  "unit_healthbar_delta",
  "unit_healthbar_bullet_shield",
  "unit_healthbar_bg",
  "unit_healthbar_pip_label",
  "unit_ult_ready_icon",
  "unit_level_label",
  "name",
  "hp_counter",
  "hp_counter_anchor",
  "hp_kill_zone_marker"
]);
const FORBIDDEN_RUNTIME_PANEL_IDS = ["health_bar", "unit_health", "ult_icon"];


function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function listFiles(dir = ROOT) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      out.push(rel + "/");
      out.push(...listFiles(full));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

function extractDefaultKeys(source) {
  return extractObjectKeys(source, "DEFAULTS") || [];
}

function countMatches(source, pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}



function getValidationReport() {
  const errors = [];
  const files = listFiles();
  const healthbar = readText("panorama/scripts/healthbar_logic.js");
  const publisher = readText("panorama/scripts/anita_ui_core.js");
  const xml = readText("panorama/layout/unit_status_overlay.xml");
  const css = readText("panorama/styles/unit_status.css");
  const combinedSource = healthbar + "\n" + publisher;
  const combinedAssets = combinedSource + "\n" + xml + "\n" + css;
  const laneSources = readHpColorLaneSources(REPO_ROOT);
  const fullReport = checkFullSettingsContract(laneSources.fullUiSource, laneSources.fullRuntimeSource);
  const minimalReport = checkMinimalSettingsContract(publisher, healthbar, fullReport.contract);
  errors.push(...fullReport.errors.map((error) => `full lane contract: ${error}`));
  errors.push(...minimalReport.errors.map((error) => `minimal lane contract: ${error}`));


  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) errors.push(`missing required file: ${file}`);
  }
  for (const forbidden of FORBIDDEN_FILES) {
    if (fs.existsSync(path.join(ROOT, forbidden))) errors.push(`forbidden minimal artifact present: ${forbidden}`);
  }
  for (const file of files) {
    if (file.endsWith("/")) continue;
    if (!ALLOWED_FILES.has(file)) errors.push(`unexpected minimal file: ${file}`);
  }

  const defaultKeys = minimalReport.contract.runtimeDefaultKeys || extractDefaultKeys(healthbar);

  const healthbarFunctions = checkFunctionDeclarationCap(errors, "healthbar runtime", healthbar, MAX_HEALTHBAR_RUNTIME_FUNCTIONS);
  const publisherFunctions = checkFunctionDeclarationCap(errors, "publisher", publisher, MAX_PUBLISHER_FUNCTIONS);
  const functionCounts = {
    healthbar: healthbarFunctions.length,
    publisher: publisherFunctions.length
  };

  checkRuntimePanelIds(errors, "runtime", healthbar, ALLOWED_RUNTIME_PANEL_IDS, FORBIDDEN_RUNTIME_PANEL_IDS);


  checkRequiredSourceTerms(errors, "bridge", combinedSource, REQUIRED_BRIDGE_TERMS);
  checkRequiredSourceTerms(errors, "unit-status", combinedAssets, REQUIRED_UNIT_STATUS_TERMS);
  checkForbiddenSourceTerms(errors, "production source", combinedSource, FORBIDDEN_SOURCE_TERMS);
  for (const heroMarker of [
    "HERO_ALIAS_TO_ID",
    "HERO_ALIAS_LIST",
    "registerHeroAlias",
    "aliases:",
    "replace(/^hero_/"
  ]) {
    if (publisher.includes(heroMarker)) errors.push(`publisher must use exact SteamTracking hero keys, not alias/fallback marker: ${heroMarker}`);
  }
  for (const exactHeroMarker of [
    'var HERO_BY_ID = {};',
    'var HERO_ID_TO_KEY = {};',
    'HERO_ID_TO_KEY[String(hero.heroId)] = hero.id;',
    'id: "hero_astro", heroId: 14, name: "Holliday"',
    'id: "hero_tengu", heroId: 20, name: "Ivy"',
    'id: "hero_magician", heroId: 60, name: "Sinclair"',
    'id: "hero_priest", heroId: 65, name: "Venator"',
    'id: "hero_bookworm", heroId: 67, name: "Paige"',
    'id: "hero_doorman", heroId: 69, name: "The Doorman"',
    'id: "hero_necro", heroId: 76, name: "Graves"',
    'id: "hero_unicorn", heroId: 81, name: "Celeste"'
  ]) {
    if (!publisher.includes(exactHeroMarker)) errors.push(`publisher missing exact SteamTracking hero marker: ${exactHeroMarker}`);
  }

  checkObjectInterface(errors, "publisher", publisher, "HeroScopedPresetSelection", ["normalizeMode", "normalizeHeroes", "targetsHero", "resolve"]);
  checkObjectInterface(errors, "publisher", publisher, "HPPresetCodeCodec", ["decodeBase64Url", "expandValues", "decodePresetPayload", "normalizeHeroScope"]);
  for (const presetCodecMarker of [
    "HPPresetCodeCodec.decodeBase64Url(encoded)",
    "HPPresetCodeCodec.decodePresetPayload(preset"
  ]) {
    if (!publisher.includes(presetCodecMarker)) errors.push(`publisher missing preset codec behavior marker: ${presetCodecMarker}`);
  }
  checkObjectInterface(errors, "publisher", publisher, "PresetSnapshotReplay", ["buildPayload", "acceptsRequest", "markRequestHot", "replayDelay", "publishCached"]);

  for (const runtimeMarker of [
    "var UNIT_STATUS_TARGET_SNAPSHOT = {",
    "var ALLY_STATUS_TARGET_SNAPSHOT = {",
  ]) {
    if (!healthbar.includes(runtimeMarker)) errors.push(`runtime missing safety marker: ${runtimeMarker}`);
  }
  checkObjectInterface(errors, "runtime", healthbar, "UnitStatusTargetClassifier", ["classify", "classifyAlly", "redBarCandidateMatchesMode"]);
  checkObjectInterface(errors, "runtime", healthbar, "UnitStatusOverlayAdapter", ["setEnemyBarColor", "clearLayerColors", "clearUltColor", "hasEnemyBarStyleDrift", "hasEnemyStyleDrift"]);
  checkObjectInterface(errors, "runtime", healthbar, "HpReadoutPolicy", ["parseMax", "reset", "enemy"]);
  checkObjectInterface(errors, "runtime", healthbar, "LowHpPulsePolicy", ["resetEnemy", "enemy", "resetAlly", "ally"]);
  checkObjectInterface(errors, "runtime", healthbar, "HealthStatePaintPlan", ["resetEnemy", "enemy"]);
  checkObjectInterface(errors, "runtime", healthbar, "AllyHealthPaintPolicy", ["ally"]);
  checkObjectInterface(errors, "runtime", healthbar, "LevelTierPolicy", ["parse", "classFor"]);
  checkObjectInterface(errors, "runtime", healthbar, "EnemyHealthbarLoopPolicy", ["decide"]);
  checkObjectInterface(errors, "runtime", healthbar, "ReplayWakePolicy", ["shouldWakeSameRaw", "wakeLoops"]);
  checkObjectInterface(errors, "runtime", healthbar, "LoopSchedulePolicy", ["schedule", "requestKick"]);
  if (!/\bvar\s+ENEMY_ACTION_CONTINUE\s*=\s*0\s*;/.test(healthbar)) {
    errors.push("runtime ENEMY_ACTION_CONTINUE must be 0");
  }
  if (!/\bvar\s+ENEMY_ACTION_PAINT\s*=\s*9\s*;/.test(healthbar)) {
    errors.push("runtime ENEMY_ACTION_PAINT must be 9");
  }
  checkLevelTierCssParity(errors, "runtime", healthbar, css, [
    { min: 11, cls: "level_tier2" },
    { min: 19, cls: "level_tier3" },
    { min: 27, cls: "level_tier4" },
    { min: 35, cls: "level_tier5" },
  ]);

  const buildScriptPath = path.join(ROOT, "..", "build_hp_colors_minimal.ps1");
  const buildScript = fs.existsSync(buildScriptPath) ? fs.readFileSync(buildScriptPath, "utf8") : "";
  for (const term of [
    "hp_colors_minimal_closure",
    "ECMASCRIPT5_STRICT",
    "actuallayoutwidth",
    "actuallayoutheight",
    "backgroundColor",
    "marginLeft",
    "transform",
    "zIndex",
    "UnregisterForUnhandledEvent"
  ]) {
    if (!buildScript.includes(term)) errors.push(`build_hp_colors_minimal.ps1 missing Closure compatibility term: ${term}`);
  }

  checkBooleanFlagDefaults(errors, "runtime", healthbar, {
    CAPTURE_ENABLED: false,
  });
  for (const forbiddenDiagnosticMarker of [
    "__hpColorsMinimalDebug",
    "DEBUG_PRESET_SELECTION",
    "DEBUG_REPLAY_VERBOSE_ENABLED",
    "function debugLog(",
    "function debugPrecise",
  ]) {
    if (publisher.includes(forbiddenDiagnosticMarker) || healthbar.includes(forbiddenDiagnosticMarker)) {
      errors.push(`production minimal source contains diagnostic marker: ${forbiddenDiagnosticMarker}`);
    }
  }
  if (/PERF_CAPTURE_RUNTIME_WORK_ENABLED\s*=\s*true/.test(healthbar)) {
    errors.push("runtime capture must not ship enabled");
  }
  if (/PERF_DEBUG_ENABLED\s*=\s*true/.test(healthbar)) {
    errors.push("runtime perf diagnostics must not ship enabled");
  }
  if (/perfHasRuntimeDebugSignal/.test(healthbar)) {
    errors.push("removed perfHasRuntimeDebugSignal must not return");
  }

  for (const publisherLockMarker of [
    "var HERO_SELECTION_LOCK_GAME_TIME_SEC = 10;",
    "var heroSelectionLocked = false;",
    "function lockHeroSelectionIfReady()",
    "locked-hero-selection",
    "if (heroSelectionLocked || lockHeroSelectionIfReady())"
  ]) {
    if (!publisher.includes(publisherLockMarker)) {
      errors.push(`publisher missing hard-lock marker: ${publisherLockMarker}`);
    }
  }

  const forbiddenProductionPerfTerms = [
    "PERF_SAMPLE_MAGIC",
    "perfSamples",
    "perfTraceRing",
    "PerformanceObserver",
    "runtimePerfHeartbeat",
    "startPerfReporter",
    "recordPerfSample",
    "recordCorePerfSample",
    "perfMaybeDump(",
    "perfRecordScheduleLateness",
    "perfScheduleBucket",
    "perfEnemyScheduleReason",
    "perfCount(",
    "perfStart(",
    "perfEnd(",
    "perfTraceEvent(",
    "CFG_DEBUG",
    "APPLY_DEBUG",
    "debugApplyLog",
    "debugRuntimeConfig",
    "perfLogChunked",
    "perfHashString"
  ];
  for (const term of forbiddenProductionPerfTerms) {
    if (combinedSource.includes(term)) errors.push(`production perf scaffold remains: ${term}`);
  }

  const routineLogMarkers = ["[PROFILE]", "[TIMING]", "[BRIDGE]", "[CFG]", "[APPLY]"];
  for (const marker of routineLogMarkers) {
    if (combinedSource.includes(marker)) errors.push(`routine production log marker remains: ${marker}`);
  }
  if (countMatches(publisher, /HPColorsPresetStore/g) > 2) {
    errors.push("publisher appears to rescan HPColorsPresetStore after initial discovery");
  }

  if (/if\s*\(\s*!allyColorChanged\s*&&\s*staleAllyPanel\s*\)\s*if\s*\(\s*\(\s*allyColorChanged\s*\|\|\s*staleAllyPanel\s*\)/.test(healthbar)) {
    errors.push("ally write branch is incorrectly nested under stale-panel guard");
  }
  if (/if\s*\(\s*presetGeneration\s*&&\s*lastAllyPresetGeneration\s*!==\s*presetGeneration\s*\)\s*if\s*\(\s*aWakeQueued\s*\)/.test(healthbar)) {
    errors.push("ally wake guard is incorrectly nested under preset-generation guard");
  }

  return {
    ok: errors.length === 0,
    errors,
    defaultKeys,
    files,
    bridgeTerms: REQUIRED_BRIDGE_TERMS,
    functionCounts,
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
  console.log(`[minimal-validate] OK (${report.defaultKeys.length} DEFAULTS keys, ${report.files.length} paths)`);
}

if (require.main === module) {
  main();
}

module.exports = {
  getValidationReport,
  extractDefaultKeys,
};
