'use strict';
// Shared pieces of the generated ESC menu: page table, icons, small markup snippets, text helpers and the
// id/line writer every menu part emits through.
// `lead` names a page's ungrouped rows in the sub-nav and card head, so no sub-header repeats the page title.
// A page with a single group (Units) has no sub-header at all: no sub-nav entry and no card title.
// Ticket 36: NEW is the first tab, like the game's Settings NEW section, but the menu opens on START.
const PAGES = [
  { name: 'New', title: 'NEW', description: 'New and changed features from recent updates. Each leaves after 30 days, or when you dismiss it.' },
  { name: 'Bar', title: 'BAR', lead: 'General', description: 'Healthbar colors, damage feedback, size and outline, and your own health bar. Choose Enemy or Ally; shared settings apply to both.' },
  { name: 'HP Text', title: 'HP TEXT', lead: 'Number and font', description: 'The health number on the bar: color, size, font and position.' },
  { name: 'Name', title: 'NAME', lead: 'Name and color', description: 'Hero names above the bar: color, size and position.' },
  { name: 'Indicators', title: 'INDICATORS', description: 'Health lines, kill marker, stamina, low HP pulse and the CRITICAL, ASSASSINATE and UNKILLABLE labels.' },
  // Ticket 37: icons attached to the bar moved off INDICATORS so neither page lists more than seven groups.
  { name: 'Icons', title: 'ICONS', description: 'Level and ultimate badges, pickup icons and timers, and the rejuvenator icon.' },
  { name: 'Units', title: 'UNITS', description: 'Bars for NPCs, neutrals and objectives.' },
  // 2026-10-28: the game's full-screen color blindness view. Not settings: the switches send game commands
  // (2026-10-29: the choice is saved and sent again after a restart).
  { name: 'Colorblind', title: 'COLORBLIND', description: 'See the whole screen as red-, green- or blue-weak color blindness does. Turn on more than one to mix them. Your choice is saved and comes back after a restart.' },
  { name: 'Presets', title: 'PRESETS', description: 'Save a look, manage your library and share settings or preset bundles.' },
];
const START = 'Bar';
const NEW_ICON = 's2r://panorama/images/icons/notification_alert.vsvg';
const UPDATED_ICON = 's2r://panorama/images/icons/icon_refresh.vsvg';
const LEVELS = [{ level: 'basic', title: 'BASIC', open: true }, { level: 'advanced', title: 'ADVANCED', open: false }];
const COLUMNS = [{ side: 'enemy', title: 'ENEMY', className: 'HPC3Enemy' }, { side: 'ally', title: 'ALLY', className: 'HPC3Ally' }];
// Up to this many options draw as segments (v2's live-proven control); longer enums use a DropDown.
const SEGMENT_MAX = 4;
const SEARCH_ICON = 's2r://panorama/images/control_icons/24px/search.vsvg';
const toggleHandles = '<Panel class="HPC3ToggleOff" hittest="false" /><Panel class="HPC3ToggleOn" hittest="false" />';
const resetIcon = '<Image src="s2r://panorama/images/icons/reset.vsvg" texturewidth="20px" textureheight="20px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />';
const changedStar = '<Image class="HPC3ChangedStar" src="s2r://panorama/images/icons/icon_star_white.vsvg" texturewidth="20px" textureheight="20px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />';
const glyphs = {
  APPLY: 'icons/icon_checkmark.vsvg', RENAME: 'main_menu/icons/menu_edit.vsvg',
  UP: 'control_icons/arrow_solid_up_png.vtex', DOWN: 'control_icons/arrow_solid_down_png.vtex',
  COPY: 'icons/icon_copy.vsvg', DELETE: 'icons/delete_trash.vsvg', HIDE: 'icons/icon_eye_disabled.vsvg',
  HEROES: 'main_menu/icons/menu_heroes.vsvg', DEFAULT: 'icons/icon_star_white.vsvg', FEEDBACK: 'icons/icon_feedback.vsvg',
  IMPORT: 'icons/icon_copy_paste.vsvg', 'RESTORE DEFAULT': 'icons/reset.vsvg', 'SAVE NEW': 'icons/icon_add.vsvg',
};
const image = (path, className) => `<Image class="${className}" src="s2r://panorama/images/${path}" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`;

const pascal = text => String(text).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, c => c.toUpperCase());
const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Collects the generated Panorama lines and ids. Every id is checked against the id pattern, the ids
// already emitted and the stock layout ids (`reserved`), in emission order.
function menuWriter(reserved) {
  const ids = [];
  const id = value => {
    if (!/^HPColors[A-Z][A-Za-z0-9]*$/.test(value)) throw new Error('Invalid generated id: ' + value);
    if (ids.includes(value) || reserved.has(value)) throw new Error('Duplicate generated id: ' + value + (reserved.has(value) ? ' (a stock layout id)' : ''));
    ids.push(value); return value;
  };
  const lines = [];
  const out = (depth, text) => lines.push('\t'.repeat(depth) + text);
  return { ids, id, lines, out };
}

module.exports = { PAGES, START, NEW_ICON, UPDATED_ICON, LEVELS, COLUMNS, SEGMENT_MAX, SEARCH_ICON, toggleHandles, resetIcon, changedStar,
  glyphs, image, pascal, esc, menuWriter };
