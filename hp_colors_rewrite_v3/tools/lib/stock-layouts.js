'use strict';
// The three stock layouts the v3 lane overrides, patched at exact anchors: the Escape menu (menu entry,
// styles, scripts, generated menu fragment), the world unit-status overlay (owned anchors and frames)
// and the HUD topbar (timer scripts and root class). Each anchor must match exactly once.
const { patchOnce } = require('./layout-compose');

// A stock patch is data: one exact `anchor` replaced by `replacement`, `label` naming it for a lane that words its own
// failure. The main lane and the QOLLOCK lane run the same steps; `profile` selects the few base differences:
// 'stock' (the game's layouts) or 'qollock' (the pinned QOLLOCK layouts already carry `.vcss_c` menu sheets, their
// own background handler, an empty `<scripts />` in the topbar and their own settings button).
const step = (label, anchor, replacement) => ({ label, anchor, replacement });
const stockFailure = (matches, { anchor }) => 'Stock layout patch anchor missing or ambiguous (' + matches + ' matches): ' + anchor;
function runSteps(text, steps, failure = stockFailure) {
  return steps.reduce((current, item) => patchOnce(current, item.anchor, item.replacement, matches => failure(matches, item)), text);
}
function patchStock(text, anchor, replacement) {
  return runSteps(text, [step('stock', anchor, replacement)]);
}

// One script include line of a layout's <scripts> block (also used by the QOLLOCK lane) and one stylesheet include line.
const includeLine = name => '\t\t<include src="s2r://panorama/scripts/' + name + '.vjs_c" />\n';
const styleLine = (name, indent = '\t') => indent + '<include src="s2r://panorama/styles/' + name + '.vcss_c" />\n';

// Shared v3 Escape-menu and topbar pieces, also published to variant lanes through menuParts().
const MENU_RESUME = 'if (!$.HPColorsMenuCancel()) $.DispatchEvent(&apos;CitadelResumePlaying&apos;, $.GetContextPanel())';
const MENU_OWN_STYLES = ['hp_colors_v3_world', 'hp_colors_v3_menu'];
const MENU_STYLES = ['citadel_ui_color_picker', ...MENU_OWN_STYLES].map(name => styleLine(name)).join('');
const MENU_SCRIPT_NAMES = ['hp_colors_v3_settings', 'hp_colors_v3_from_v2', 'hp_colors_v3_codec', 'hp_colors_v3_storage', 'hp_colors_v3_renderer', 'hp_colors_v3_preview', 'hp_colors_v3_menu'];
const MENU_SCRIPTS = MENU_SCRIPT_NAMES.map(includeLine).join('');
const TOPBAR_SCRIPTS = ['hp_colors_v3_world_settings', 'hp_colors_v3_timers_hud'];
const OVERLAY_STYLES = ['hp_colors_v3_world'];
const OVERLAY_SCRIPTS = ['hp_colors_v3_world_settings', 'hp_colors_v3_bridge', 'hp_colors_v3_renderer', 'hp_colors_v3_timers_world', 'hp_colors_v3_world_boot'];
const STATUS_STYLES = ['hp_colors_v3_status'];
// Every owned sheet and script a stock layout includes (the stock sheets are not ours): panorama/styles and
// panorama/scripts hold exactly these, plus the generated stock sheet and the QOLLOCK bridge script.
const OWNED_STYLES = [...new Set([...MENU_OWN_STYLES, ...OVERLAY_STYLES, ...STATUS_STYLES])];
const OWNED_SCRIPTS = [...new Set([...MENU_SCRIPT_NAMES, ...OVERLAY_SCRIPTS, ...TOPBAR_SCRIPTS])];
const TOPBAR_CLASS = 'HPColorsV3TimersTopBar';

// The world overlay's owned parts that the Escape-menu preview mirrors (`HPColorsPreview` ids in menu-preview.js render the
// same table). World id = 'HPColorsV3' + key, preview id = 'HPColorsPreview' + (preview || key). The renderer reads these ids by string
// (`$.HPColorsV3Renderer.parts`); tests/generator.test.js checks both generated layouts and that table against each other.
// Tree node: `cls` is the class in both layouts, `previewCls` only the preview's; `label` is a <Label>, `plain` leaves out
// hittestchildren and `idless` the world id (the pill icon), `text` is the world label text.
const OVERLAY_PARTS = Object.freeze({
  // OLD grid (v2 HPV2PipGrid order): rims under empty boxes, shield/barrier under the fill, healing/delta over it, then the grid kill marker.
  pipLayers: ['Outline', 'Empty', 'Shield', 'Armor', 'Fill', 'Healing', 'Delta', 'KillMarker'],
  statusLabels: ['Critical', 'Assassinate', 'Unkillable'],
  // Ticket 51: the owned percent label follows the adopted HP number in the row (renderer `before`).
  readout: [{ key: 'Readout', previewCls: 'HPC3PreviewReadout', children: [{ key: 'ReadoutAnchor', previewCls: 'HPC3PreviewReadoutAnchor', children: [
    { key: 'ReadoutRow', preview: 'ReadoutLine', previewCls: 'HPC3PreviewReadoutLine', children: [
      { key: 'HPPercent', preview: 'HpPercent', previewCls: 'HPC3PreviewHpPercent', label: true, text: '' }] }] }] }],
  // Kill bounty (ticket 50): an owned full-canvas anchor with a stock-look soul pill.
  bounty: [{ key: 'BountyAnchor', cls: 'HPColorsV3BountyAnchor', children: [{ key: 'Bounty', cls: 'HPColorsV3Bounty', children: [
    { key: 'BountyIcon', cls: 'HPColorsV3BountyIcon', plain: true, idless: true },
    { key: 'BountyValue', cls: 'HPColorsV3BountyValue', label: true, text: '' }] }] }],
});
// A node's world markup at `depth` tabs (the first line carries no indent: it lands at a stock anchor's own indent).
function worldMarkup(depth, nodes, first = true) {
  return nodes.map((node, index) => {
    const pad = first && index === 0 ? '' : '\t'.repeat(depth);
    const tag = node.label ? 'Label' : 'Panel';
    const attrs = (node.idless ? '' : 'id="HPColorsV3' + node.key + '"') + (node.cls ? (node.idless ? '' : ' ') + 'class="' + node.cls + '"' : '') +
      (node.text !== undefined ? ' text="' + node.text + '"' : '') + ' hittest="false"' + (node.label || node.plain ? '' : ' hittestchildren="false"');
    if (!node.children) return pad + '<' + tag + ' ' + attrs + ' />\n';
    return pad + '<' + tag + ' ' + attrs + '>\n' + worldMarkup(depth + 1, node.children, false) + '\t'.repeat(depth) + '</' + tag + '>\n';
  }).join('');
}

// Names the stock layout a failed patch came from.
function inLayout(file, patch) {
  try { return patch(); }
  catch (error) { error.message = file + ': ' + error.message; throw error; }
}

// The Escape-menu steps. The bridge script of a lane is its own step after these (v3 scripts run first).
function menuSteps(profile, menu) {
  const qollock = profile === 'qollock';
  const resume = MENU_RESUME;
  const steps = [];
  if (!qollock) for (const name of ['citadel_base_styles', 'hud_escape_menu']) steps.push(step('menu styles', name + '.vcss', name + '.vcss_c'));
  if (qollock) steps.push(step('menu styles', '\t</styles>', MENU_STYLES + '\t</styles>'), step('menu scripts', '\t</scripts>', MENU_SCRIPTS + '\t</scripts>'));
  else steps.push(step('menu styles', '</styles>', MENU_STYLES + '\t</styles>\n\t<scripts>\n' + MENU_SCRIPTS + '\t</scripts>'));
  steps.push(step('menu root', '<CitadelHudEscapeMenu oncancel="CitadelResumePlaying()">',
    '<CitadelHudEscapeMenu onload="$.HPColorsMenuBoot()" oncancel="' + resume + '">'));
  // QOLLOCK closes its own window first; otherwise the background runs v3's close-then-resume.
  if (qollock) steps.push(step('menu background', '{ $.ForceCloseModSettings(true); } else { CitadelResumePlaying(); }" />',
    '{ $.ForceCloseModSettings(true); } else { ' + resume + '; }" />'));
  else steps.push(step('menu background', '<Panel id="EscapeBackground" onactivate="CitadelResumePlaying()" />',
    '<Panel id="EscapeBackground" onactivate="' + resume + '" />'));
  steps.push(step('menu resume button', 'id="EscapeButton" action="MenuBack" onactivate="CitadelResumePlaying()"',
    'id="EscapeButton" action="MenuBack" onactivate="' + resume + '"'));
  // The entry point sits in the stock nav like v2's, between feedback and settings (QOLLOCK: QOL LOCK, HP COLORS, stock settings).
  const nav = qollock ? '<Panel class="SettingsRow">\n\t\t\t\t\t\t<Button id="settings"' : '<Panel class="SettingsRow">';
  steps.push(step('menu button', nav, menu.button + nav), step('menu fragment', '</CitadelHudEscapeMenu>', menu.fragment + '\t</CitadelHudEscapeMenu>'));
  return steps;
}

function patchMenu(stock, menu) {
  return runSteps(stock, menuSteps('stock', menu));
}

function patchOverlay(stock) {
  let overlay = patchStock(stock, 'unit_status_v2.vcss', 'unit_status_v2.vcss_c');
  overlay = patchStock(overlay, '</styles>', OVERLAY_STYLES.map(name => styleLine(name, '\t\t')).join('') + '\t</styles>\n\t<scripts>\n' +
    OVERLAY_SCRIPTS.map(includeLine).join('') + '\t</scripts>');
  overlay = patchStock(overlay, '<Panel id="InfoHealthContainer">',
    '<Panel id="InfoHealthContainer">\n\t\t\t\t<Panel id="HPColorsV3Level" hittest="false" hittestchildren="false">\n' +
    '\t\t\t\t\t<Label id="unit_level_label" text="{i:player_level}" hittest="false" />\n\t\t\t\t</Panel>');
  // SHOW BOUNDS (ticket 22, v2 HPV2CanvasBounds): a collapsed full-canvas rim outside the motion
  // frame, so it never shakes; one owned root class shows it.
  overlay = patchStock(overlay, '<Panel id="UnitStatus" hittest="false">',
    '<Panel id="HPColorsV3CanvasBounds" hittest="false" hittestchildren="false" />\n\t\t' +
    '<Panel id="HPColorsV3MotionFrame" hittest="false" hittestchildren="false">\n' +
    worldMarkup(3, OVERLAY_PARTS.readout, false) + '\t\t</Panel>\n\t\t<Panel id="UnitStatus" hittest="false">');
  // OLD grid order (OVERLAY_PARTS.pipLayers). Boxes are created on first OLD use.
  const pipLayers = OVERLAY_PARTS.pipLayers
    .map(name => '\t\t\t\t\t\t\t<Panel id="HPColorsV3Pip' + name + '" hittest="false" hittestchildren="false" />\n').join('');
  overlay = patchStock(overlay, '<Panel id="UnitHealthbarLines" />',
    '<Panel id="UnitHealthbarLines" />\n\t\t\t\t\t\t<Panel id="HPColorsV3BarOutline" hittest="false" hittestchildren="false" />\n\t\t\t\t\t\t<Panel id="HPColorsV3KillMarker" hittest="false" hittestchildren="false" />' +
    '\n\t\t\t\t\t\t<Panel id="HPColorsV3PipGrid" hittest="false" hittestchildren="false">\n' + pipLayers + '\t\t\t\t\t\t</Panel>');
  overlay = patchStock(overlay, '<Panel id="unit_healthbar_lagging" class="HealthAmount" />',
    '<Panel id="unit_healthbar_lagging" class="HealthAmount" />\n\t\t\t\t\t\t\t<Panel id="HPColorsV3PulseOverlay" class="HPColorsV3PulseOverlay" hittest="false" hittestchildren="false" />');
  overlay = patchStock(overlay, '<Panel id="RejuvenatorActive" />',
    '<Panel id="HPColorsV3RejuvenatorAnchor" hittest="false" hittestchildren="false" />\n\t\t<Panel id="RejuvenatorActive" />');
  for (const name of OVERLAY_PARTS.statusLabels)
    overlay = patchStock(overlay, `<Panel id="${name}Indicator">`,
      `<Panel id="HPColorsV3${name}Anchor" class="HPColorsV3StatusLabelAnchor" hittest="false" hittestchildren="false" />\n\t\t<Panel id="${name}Indicator">`);
  // Kill bounty (ticket 50): an owned full-canvas anchor with a stock-look soul pill, collapsed until the
  // renderer's root class shows it; drawn above the bar and name, below the CRITICAL/ASSASSINATE/UNKILLABLE tags.
  overlay = patchStock(overlay, '<Panel id="HPColorsV3CriticalAnchor"',
    worldMarkup(2, OVERLAY_PARTS.bounty) + '\t\t<Panel id="HPColorsV3CriticalAnchor"');
  return overlay;
}

// The ShowRank lane (hp_colors_rewrite_v3_showrank PIECES.notificationAnchor/averageAnchor) anchors inside this stock
// topbar's panels, so a topbar anchor change here is also a ShowRank anchor review.
// `rootClass` is the full class list of the topbar root (a lane may add its own to TOPBAR_CLASS).
function topbarSteps(profile, rootClass = TOPBAR_CLASS) {
  const qollock = profile === 'qollock';
  const steps = ['citadel_base_styles', 'hud_common', 'citadel_hud_top_bar', 'unit_status_icons']
    .map(sheet => step('topbar styles', sheet + '.vcss' + (qollock ? '"' : ''), sheet + '.vcss_c' + (qollock ? '"' : '')));
  const scripts = '<scripts>\n' + TOPBAR_SCRIPTS.map(includeLine).join('') + '\t</scripts>';
  if (qollock) steps.push(step('topbar scripts', '\t<scripts />', '\t' + scripts));
  else steps.push(step('topbar scripts', '</styles>', '</styles>\n\t' + scripts));
  steps.push(step('topbar root', '<CitadelHudTopBar hittest="false">', '<CitadelHudTopBar class="' + rootClass + '" hittest="false">'));
  return steps;
}

function patchTopbar(stock) {
  return runSteps(stock, topbarSteps('stock'));
}

// The status row has its own layout and takes rules only from that layout's sheets (live 6861), so the
// stock citadel_status_effect.xml ships with one more include. Every rule in that sheet needs a renderer
// root class, so other status rows (HUD, top bar) keep the game look.
function patchStatusEffect(stock) {
  let statusEffect = stock;
  for (const sheet of ['citadel_base_styles', 'unit_status_icons', 'citadel_status_effect'])
    statusEffect = patchStock(statusEffect, sheet + '.vcss', sheet + '.vcss_c');
  return patchStock(statusEffect, '</styles>', STATUS_STYLES.map(name => styleLine(name)).join('') + '\t</styles>');
}

function stockLayouts(gameData, menu) {
  return {
    menu: inLayout('hud_escape_menu.xml', () => patchMenu(gameData.menu, menu)),
    overlay: inLayout('unit_status_overlay_v2.xml', () => patchOverlay(gameData.overlay)),
    topbar: inLayout('citadel_hud_top_bar.xml', () => patchTopbar(gameData.topbar)),
    statusEffect: inLayout('citadel_status_effect.xml', () => patchStatusEffect(gameData.statusEffect)),
  };
}

module.exports = { includeLine, stockLayouts, runSteps, menuSteps, topbarSteps, MENU_RESUME, MENU_STYLES, MENU_SCRIPTS, TOPBAR_SCRIPTS, TOPBAR_CLASS, OVERLAY_SCRIPTS, OVERLAY_STYLES, STATUS_STYLES, OWNED_STYLES, OWNED_SCRIPTS, OVERLAY_PARTS };
