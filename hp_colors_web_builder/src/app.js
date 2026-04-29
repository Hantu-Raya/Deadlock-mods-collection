import { DEFAULT_PRESET } from "./defaultPreset.js";
import { downloadBytes } from "./download.js";
import { sanitizePresetValues } from "./patchHpColors.js";
import { injectPresetStoreIntoBaseHudXml } from "./presetStoreXml.js";
import { compilePanoramaLayoutResource } from "./source2ResourceWriter.js";
import { writeVpkWithDeadMod } from "./deadModPacker.js";
import { writeVpk } from "./vpkWriter.js";

const UI = {
  form: document.querySelector("#builderForm"),
  build: document.querySelector("#buildBtn"),
  status: document.querySelector("#status"),
  preview: document.querySelector("#preview")
};

function readFormValues() {
  const data = new FormData(UI.form);
  return sanitizePresetValues({
    hp_enabled: data.get("hp_enabled") === "on",
    hp_color_low: data.get("hp_color_low"),
    hp_color_mid: data.get("hp_color_mid"),
    hp_color_high: data.get("hp_color_high"),
    hp_low_threshold: data.get("hp_low_threshold"),
    hp_high_threshold: data.get("hp_high_threshold"),
    hp_pulse_enabled: data.get("hp_pulse_enabled") === "on",
    hp_pulse_threshold: data.get("hp_pulse_threshold"),
    hp_counter_size: data.get("hp_counter_size"),
    hp_kill_zone_enabled: data.get("hp_kill_zone_enabled") === "on",
    hp_kill_zone_threshold: data.get("hp_kill_zone_threshold"),
    hp_kill_zone_color: data.get("hp_kill_zone_color")
  });
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.text();
}

async function fetchBytes(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function buildPak() {
  const values = readFormValues();
  const preset = {
    name: document.querySelector("#presetName").value || DEFAULT_PRESET.name,
    version: 1,
    values
  };
  const baseHudXml = await fetchText("templates/hp_colors/panorama/layout/base_hud.xml");
  const patchedBaseHud = injectPresetStoreIntoBaseHudXml(baseHudXml, [preset]);
  const files = [
    { path: "panorama/layout/base_hud.vxml_c", bytes: compilePanoramaLayoutResource(patchedBaseHud) }
  ];

  try {
    return await writeVpkWithDeadMod(files);
  } catch (error) {
    console.warn("DeadMod packer failed; falling back to local VPK writer.", error);
    return writeVpk(files);
  }
}

function updatePreview() {
  const preset = {
    ...DEFAULT_PRESET,
    name: document.querySelector("#presetName").value || DEFAULT_PRESET.name,
    values: readFormValues()
  };
  UI.preview.textContent = JSON.stringify(preset, null, 2);
}

UI.form.addEventListener("input", updatePreview);
UI.build.addEventListener("click", async () => {
  UI.build.disabled = true;
  UI.status.textContent = "Building preset override pak97_dir.vpk...";
  try {
    const pak = await buildPak();
    downloadBytes("pak97_dir.vpk", pak);
    UI.status.textContent = `Built preset override pak97_dir.vpk (${pak.byteLength.toLocaleString()} bytes).`;
  } catch (error) {
    UI.status.textContent = error && error.message ? error.message : String(error);
  } finally {
    UI.build.disabled = false;
  }
});

updatePreview();
