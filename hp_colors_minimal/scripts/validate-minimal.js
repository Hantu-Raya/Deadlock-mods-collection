const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const REQUIRED_FILES = [
  "panorama/layout/unit_status_overlay.xml",
  "panorama/scripts/anita_ui_core.js",
  "panorama/scripts/healthbar_logic.js",
  "panorama/styles/unit_status.css"
];
const FORBIDDEN_FILES = [
  "panorama/layout/base_hud.xml",
  "panorama/layout/hud_escape_menu.xml",
  "panorama/layout/hud_health.xml",
  "panorama/scripts/anita_persist_loader.js",
  "panorama/scripts/hp_registrar.js",
  "panorama/styles/anita_ui.css",
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
  try { unitStatusXml = readText("panorama/layout/unit_status_overlay.xml"); } catch (error) { errors.push(`Could not read unit_status_overlay.xml: ${error.message}`); }
  try { bootstrapSource = readText("panorama/scripts/anita_ui_core.js"); } catch (error) { errors.push(`Could not read anita_ui_core.js: ${error.message}`); }
  try { healthbarSource = readText("panorama/scripts/healthbar_logic.js"); } catch (error) { errors.push(`Could not read healthbar_logic.js: ${error.message}`); }

  const defaultKeys = extractDefaultKeys(healthbarSource);
  if (defaultKeys.length !== 45) errors.push(`Expected 45 healthbar DEFAULTS keys, found ${defaultKeys.length}`);

  if (unitStatusXml) {
    if (!unitStatusXml.includes("healthbar_logic.vjs_c")) errors.push("unit_status_overlay.xml must include healthbar_logic.vjs_c");
    if (unitStatusXml.includes("hp_preset_bootstrap.vjs_c")) errors.push("unit_status_overlay.xml must not include old hp_preset_bootstrap.vjs_c");
  }

  if (bootstrapSource) {
    for (const required of ["HPColorsPresetStore", "__hpColorsCfgRaw", "HP_COLORS_PRESET_SNAPSHOT", "HP_COLORS_PRESET_REQUEST", "PUBLISH_RETRY_DELAYS", "CACHED_SNAPSHOT_REPLAY_SEC", "CACHED_SNAPSHOT_REPLAY_LIMIT", "cachedReplayCount", "cachedRootPanel", "cachedStorePanel", "cachedSnapshotPayload", "sharedSnapshotWritten", "cachedReplayStarted", "values_raw", "capturePreset", "publishPreset", "publishUntilReady", "replayCachedSnapshot", "startCachedSnapshotReplay", "cachedReplayCount >= CACHED_SNAPSHOT_REPLAY_LIMIT", "$.Schedule(CACHED_SNAPSHOT_REPLAY_SEC, replayCachedSnapshot)", "GameUI.CustomUIConfig"]) {
      if (!bootstrapSource.includes(required)) errors.push(`anita_ui_core.js missing ${required}`);
    }
    for (const forbidden of ["ANITA_", "force_emit", "bridge_bootstrap", "core_auto_resync", "PUBLISH_HEARTBEAT_SEC", "publishHeartbeat", "AnitaUI_Window", "colorpicker", "renderModSettings", "AnitaRenderer"]) {
      if (bootstrapSource.includes(forbidden)) errors.push(`anita_ui_core.js must not contain static-preset runtime forbidden marker: ${forbidden}`);
    }
  }

  if (healthbarSource) {
    for (const required of ["__hpColorsCfgRaw", "HP_COLORS_PRESET_SNAPSHOT", "HP_COLORS_PRESET_REQUEST", "values_raw", "tryApplySharedSnapshot", "schedulePresetRetry", "raw === sharedCfgRaw && presetApplied", "presetApplied", "invalidateEnemyVisualCaches", "resetCachedPanelRefsIfInvalid", "lastEnemySignature", "lastCpPanel", "lastUnitName", "wasDirty", "startEnemyLoop", "stopEnemyLoop", "startAllyLoop", "stopAllyLoop", "startLevelLoop", "stopLevelLoop", "handleRuntimeToggleState", "nextCacheProbeAt", "ALLY_SCAN_CACHE_TTL", "STYLE_REAPPLY_WATCHDOG_MS", "function refreshDerivedConfig()", "var dc = {}", "dc.low", "dc.counterPosition", "dc.killZoneThreshold", "refreshDerivedConfig();", "var shouldPulse = !!(cfg.hp_pulse_enabled && hp <= pulseThresh)", "if (fmt === 1)", "uHT(hp, 100, shouldPulse)", "if (cfg.hp_kill_zone_enabled) sKZ(true, pw)"]) {
      if (!healthbarSource.includes(required)) errors.push(`healthbar_logic.js missing static preset reader marker: ${required}`);
    }
    if (healthbarSource.includes("STYLE_REAPPLY_MS = 1000")) {
      errors.push("healthbar_logic.js must not force style reapply every 1s");
    }
    if (healthbarSource.includes("gRunning = true; gL()") || healthbarSource.includes("aRunning = true; aL()") || healthbarSource.includes("lL();")) {
      errors.push("healthbar_logic.js must not start enemy, ally, or level loops unconditionally");
    }
    for (const forbidden of ["ANITA_", "force_emit", "bridge_bootstrap", "core_auto_resync", "anita_v1_hp_colors", "deadlock_hero_debuts_seen", "GameInterfaceAPI", "HP_PERSIST_ALIAS_TO_ID"]) {
      if (healthbarSource.includes(forbidden)) errors.push(`healthbar_logic.js must not contain live customization/persistence marker: ${forbidden}`);
    }
  }

  return {
    root: ROOT,
    errors,
    files,
    unitStatusXml,
    bootstrapSource,
    healthbarSource,
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
