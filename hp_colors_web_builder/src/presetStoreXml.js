const XML_INSERT_MARKER = /(<Panel\s+id="AnitaUI_Anchor"[\s\S]*?\/>)/;

function utf8Bytes(text) {
  return new TextEncoder().encode(String(text));
}

function utf8Text(bytes) {
  return new TextDecoder().decode(bytes);
}

export function base64UrlEncode(text) {
  const bytes = utf8Bytes(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(encoded) {
  const padded = String(encoded).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(encoded).length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return utf8Text(bytes);
}

function presetLabelXml(preset, index) {
  const encoded = base64UrlEncode(JSON.stringify(preset));
  const id = `HPColorsPreset_${String(index + 1).padStart(3, "0")}`;
  return `\t\t<Label id="${id}" class="hp_colors_preset_entry" text="${encoded}" />`;
}

export function injectPresetStoreIntoBaseHudXml(baseHudXml, presets) {
  const labels = presets.map(presetLabelXml).join("\n");
  const store = [
    '\t\t<Panel id="HPColorsPresetStore" hittest="false" style="visibility: collapse; width: 0px; height: 0px;">',
    labels,
    "\t\t</Panel>"
  ].join("\n");

  if (baseHudXml.includes("HPColorsPresetStore")) {
    return baseHudXml.replace(/<Panel\s+id="HPColorsPresetStore"[\s\S]*?<\/Panel>/, store);
  }
  if (!XML_INSERT_MARKER.test(baseHudXml)) {
    throw new Error("Could not find AnitaUI_Anchor in base_hud.xml");
  }
  return baseHudXml.replace(XML_INSERT_MARKER, `$1\n${store}`);
}
