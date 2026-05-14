const assert = require("node:assert/strict");
const test = require("node:test");

const { getValidationReport } = require("./validate-minimal.js");

test("minimal hp_colors source keeps runtime assets and builder-compatible bootstrap stubs", () => {
  const report = getValidationReport();

  assert.deepEqual(report.errors, []);
  assert.ok(report.unitStatusXml.includes("healthbar_logic.vjs_c"));
  assert.ok(report.bootstrapSource.includes("ANITA_BULK_UPDATE"));
  assert.ok(report.bootstrapSource.includes("ANITA_UPDATE"));
  assert.ok(report.bootstrapSource.includes("bridge_bootstrap"));
  assert.ok(report.bootstrapSource.includes("__hpColorsCfgRaw"));
  assert.ok(report.files.includes("panorama/scripts/anita_ui_core.js"));
  assert.ok(report.files.includes("panorama/scripts/anita_persist_loader.js"));
  assert.ok(report.files.includes("panorama/scripts/hp_registrar.js"));
  assert.ok(report.files.includes("panorama/styles/anita_ui.css"));
  assert.ok(!report.files.includes("panorama/layout/base_hud.xml"));
  assert.ok(!report.bootstrapSource.includes("AnitaUI_Window"));
  assert.ok(!report.bootstrapSource.includes("colorpicker"));
  assert.ok(!report.anitaCss.includes("AnitaUI_Window"));
  assert.ok(!report.anitaCss.includes("colorpicker"));
  assert.equal(report.defaultKeys.length, 45);
});
