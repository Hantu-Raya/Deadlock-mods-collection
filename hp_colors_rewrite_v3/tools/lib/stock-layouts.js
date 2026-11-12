'use strict';
// The three stock layouts the v3 lane overrides, patched at exact anchors: the Escape menu (menu entry,
// styles, scripts, generated menu fragment), the world unit-status overlay (owned anchors and frames)
// and the HUD topbar (timer scripts and root class). Each anchor must match exactly once.
const { patchOnce } = require('./layout-compose');

function patchStock(text, anchor, replacement) {
  return patchOnce(text, anchor, replacement, matches => 'Stock layout patch anchor missing or ambiguous (' + matches + ' matches): ' + anchor);
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

// Names the stock layout a failed patch came from.
function inLayout(file, patch) {
  try { return patch(); }
  catch (error) { error.message = file + ': ' + error.message; throw error; }
}

function patchMenu(stock, menu) {
  const resume = MENU_RESUME;
  let text = stock;
  for (const name of ['citadel_base_styles', 'hud_escape_menu']) {
    text = patchStock(text, name + '.vcss', name + '.vcss_c');
  }
  const scripts = MENU_SCRIPTS;
  text = patchStock(text, '</styles>', MENU_STYLES + '\t</styles>\n\t<scripts>\n' + scripts + '\t</scripts>');
  text = patchStock(text, '<CitadelHudEscapeMenu oncancel="CitadelResumePlaying()">',
    '<CitadelHudEscapeMenu onload="$.HPColorsMenuBoot()" oncancel="' + resume + '">');
  text = patchStock(text, '<Panel id="EscapeBackground" onactivate="CitadelResumePlaying()" />',
    '<Panel id="EscapeBackground" onactivate="' + resume + '" />');
  text = patchStock(text, 'id="EscapeButton" action="MenuBack" onactivate="CitadelResumePlaying()"',
    'id="EscapeButton" action="MenuBack" onactivate="' + resume + '"');
  // The entry point sits in the stock nav like v2's, between feedback and settings.
  text = patchStock(text, '<Panel class="SettingsRow">', menu.button + '<Panel class="SettingsRow">');
  text = patchStock(text, '</CitadelHudEscapeMenu>', menu.fragment + '\t</CitadelHudEscapeMenu>');
  return text;
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
    '\t\t\t<Panel id="HPColorsV3Readout" hittest="false" hittestchildren="false">\n' +
    '\t\t\t\t<Panel id="HPColorsV3ReadoutAnchor" hittest="false" hittestchildren="false">\n' +
    // Ticket 51: the owned percent label follows the adopted HP number in the row (renderer `before`).
    '\t\t\t\t\t<Panel id="HPColorsV3ReadoutRow" hittest="false" hittestchildren="false">\n' +
    '\t\t\t\t\t\t<Label id="HPColorsV3HPPercent" text="" hittest="false" />\n' +
    '\t\t\t\t\t</Panel>\n' +
    '\t\t\t\t</Panel>\n\t\t\t</Panel>\n\t\t</Panel>\n\t\t<Panel id="UnitStatus" hittest="false">');
  // OLD grid (v2 HPV2PipGrid order): rims under empty boxes, shield/barrier under the fill,
  // healing/delta over it, then the grid kill marker. Boxes are created on first OLD use.
  const pipLayers = ['Outline', 'Empty', 'Shield', 'Armor', 'Fill', 'Healing', 'Delta', 'KillMarker']
    .map(name => '\t\t\t\t\t\t\t<Panel id="HPColorsV3Pip' + name + '" hittest="false" hittestchildren="false" />\n').join('');
  overlay = patchStock(overlay, '<Panel id="UnitHealthbarLines" />',
    '<Panel id="UnitHealthbarLines" />\n\t\t\t\t\t\t<Panel id="HPColorsV3BarOutline" hittest="false" hittestchildren="false" />\n\t\t\t\t\t\t<Panel id="HPColorsV3KillMarker" hittest="false" hittestchildren="false" />' +
    '\n\t\t\t\t\t\t<Panel id="HPColorsV3PipGrid" hittest="false" hittestchildren="false">\n' + pipLayers + '\t\t\t\t\t\t</Panel>');
  overlay = patchStock(overlay, '<Panel id="unit_healthbar_lagging" class="HealthAmount" />',
    '<Panel id="unit_healthbar_lagging" class="HealthAmount" />\n\t\t\t\t\t\t\t<Panel id="HPColorsV3PulseOverlay" class="HPColorsV3PulseOverlay" hittest="false" hittestchildren="false" />');
  overlay = patchStock(overlay, '<Panel id="RejuvenatorActive" />',
    '<Panel id="HPColorsV3RejuvenatorAnchor" hittest="false" hittestchildren="false" />\n\t\t<Panel id="RejuvenatorActive" />');
  for (const name of ['Critical', 'Assassinate', 'Unkillable'])
    overlay = patchStock(overlay, `<Panel id="${name}Indicator">`,
      `<Panel id="HPColorsV3${name}Anchor" class="HPColorsV3StatusLabelAnchor" hittest="false" hittestchildren="false" />\n\t\t<Panel id="${name}Indicator">`);
  // Kill bounty (ticket 50): an owned full-canvas anchor with a stock-look soul pill, collapsed until the
  // renderer's root class shows it; drawn above the bar and name, below the CRITICAL/ASSASSINATE/UNKILLABLE tags.
  overlay = patchStock(overlay, '<Panel id="HPColorsV3CriticalAnchor"',
    '<Panel id="HPColorsV3BountyAnchor" class="HPColorsV3BountyAnchor" hittest="false" hittestchildren="false">\n' +
    '\t\t\t<Panel id="HPColorsV3Bounty" class="HPColorsV3Bounty" hittest="false" hittestchildren="false">\n' +
    '\t\t\t\t<Panel class="HPColorsV3BountyIcon" hittest="false" />\n' +
    '\t\t\t\t<Label id="HPColorsV3BountyValue" class="HPColorsV3BountyValue" text="" hittest="false" />\n' +
    '\t\t\t</Panel>\n\t\t</Panel>\n\t\t<Panel id="HPColorsV3CriticalAnchor"');
  return overlay;
}

function patchTopbar(stock) {
  let topbar = stock;
  for (const sheet of ['citadel_base_styles', 'hud_common', 'citadel_hud_top_bar', 'unit_status_icons'])
    topbar = patchStock(topbar, sheet + '.vcss', sheet + '.vcss_c');
  topbar = patchStock(topbar, '</styles>', '</styles>\n\t<scripts>\n' +
    TOPBAR_SCRIPTS.map(includeLine).join('') + '\t</scripts>');
  topbar = patchStock(topbar, '<CitadelHudTopBar hittest="false">', '<CitadelHudTopBar class="' + TOPBAR_CLASS + '" hittest="false">');
  return topbar;
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

module.exports = { includeLine, stockLayouts, MENU_RESUME, MENU_STYLES, MENU_SCRIPTS, TOPBAR_SCRIPTS, TOPBAR_CLASS, OVERLAY_SCRIPTS, OVERLAY_STYLES, STATUS_STYLES, OWNED_STYLES, OWNED_SCRIPTS };
