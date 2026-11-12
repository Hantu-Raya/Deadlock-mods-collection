#!/usr/bin/env node
'use strict';
// v3 generator: settings/schema.json + record.json + news.json + the pinned game data -> the generated
// contract, menu and patched stock layouts. The pieces live in tools/lib/:
//   schema.js           settings table validation
//   news.js             settings/news.json validation
//   slot-contract.js    defaults, slots, release and the codec slot contract
//   stock-layouts.js    the Escape menu, unit-status overlay and topbar patches
//   settings-scripts.js the generated settings scripts
//   stylesheets.js      the packed stylesheet contract
//   output.js           JSON inputs, writing and --check
// and tools/menu-layout.js builds the menu itself.
const path = require('node:path');
const { derive } = require('./game-data');
const { buildMenu } = require('./menu-layout');
const { sidesOf, validate } = require('./lib/schema');
const { validateNews } = require('./lib/news');
const { validateRelease, buildSlots, checkSlotContract } = require('./lib/slot-contract');
const { stockLayouts, MENU_RESUME, MENU_STYLES, MENU_SCRIPTS, TOPBAR_SCRIPTS, TOPBAR_CLASS } = require('./lib/stock-layouts');
const { worldSettingsScript, settingsScript } = require('./lib/settings-scripts');
const { checkStylesheets } = require('./lib/stylesheets');
const { json, readJson, writeOrCheck } = require('./lib/output');
const ROOT = path.resolve(__dirname, '..');

const readNews = root => readJson(path.join(root, 'settings/news.json'));
function generate(rows, gameData, metadata, news = readNews(ROOT)) { return build(rows, gameData, metadata, news).files; }
function build(rows, gameData, metadata, news) {
  validate(rows);
  validateRelease(metadata);
  const { defaults, slots } = buildSlots(rows);
  const stockIds = new Set([...gameData.menu.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  // Slot identity is checked first: a removed setting reports the slot contract, not a stale news target.
  checkSlotContract(slots,defaults,rows.flatMap(row => sidesOf(row).map(side => ({ ...row, side }))),metadata);
  validateNews(news, rows);
  const menu = buildMenu(rows, sidesOf, stockIds, metadata.release, news);
  const { ids, controls } = menu;
  const search = menu.search;
  const menuRows = menu.fragment;
  const layouts = stockLayouts(gameData, menu);
  // version is the wire/contract version; release is the shipped version (settings/record.json) the update check compares.
  const contract = { magic: 'HP_COLORS_V3_CONFIG', version: '3.0.0', release: metadata.release, recordVersion: metadata.recordVersion, defaultChanges: metadata.defaultChanges, slotAdditions: metadata.slotAdditions, retiredSlots: metadata.retiredSlots || [], defaults, slots, ids, controls, searchIndex: search, menu: menu.menu,
    heroes: gameData.catalog, gameDataCommit: gameData.pin.commit, gameDataClientVersion: gameData.pin.clientVersion };
  const files = {
    'generated/defaults.json': json(defaults),
    'generated/slots.json': json(slots),
    'generated/ids.json': json(ids),
    'generated/search-index.json': json(search),
    'generated/heroes.json': json(gameData.catalog),
    'panorama/styles/unit_status_v2.css': gameData.stylesheet,
    'generated/menu-rows.xml': menuRows,
    'panorama/layout/hud_escape_menu.xml': layouts.menu,
    'panorama/layout/unit_status_overlay_v2.xml': layouts.overlay,
    'panorama/layout/citadel_hud_top_bar.xml': layouts.topbar,
    'panorama/layout/citadel_status_effect.xml': layouts.statusEffect,
    'panorama/scripts/hp_colors_v3_world_settings.js': worldSettingsScript(controls),
    'panorama/scripts/hp_colors_v3_settings.js': settingsScript(contract),
  };
  return { files, menu };
}

// Published for variant lanes (hp_colors_rewrite_v3_qollock): the exact v3 Escape-menu and topbar
// pieces this generator injects, computed from the v3 sources, plus the v3 files they come with so a
// lane can refuse a stale v3 checkout. The v3 lane itself knows nothing about variants.
function menuParts(root = ROOT) {
  const { files, menu } = build(readJson(path.join(root, 'settings/schema.json')), derive(root),
    readJson(path.join(root, 'settings/record.json')), readNews(root));
  return { resume: MENU_RESUME, styles: MENU_STYLES, scripts: MENU_SCRIPTS, button: menu.button, fragment: menu.fragment,
    ids: menu.ids, topbarScripts: TOPBAR_SCRIPTS, topbarClass: TOPBAR_CLASS, files };
}

function main(args) {
  let settings = path.join(ROOT, 'settings/schema.json');
  let output = ROOT;
  let check = false;
  let gameDataRoot = ROOT;
  let recordContract = path.join(ROOT,'settings/record.json');
  let stylesRoot = path.join(ROOT, 'panorama/styles');
  let newsFile = path.join(ROOT, 'settings/news.json');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') check = true;
    else if (['--settings', '--output-root', '--game-data-root', '--record-contract', '--styles-root', '--news'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (args[i] === '--settings') settings = path.resolve(args[++i]);
      else if (args[i] === '--game-data-root') gameDataRoot = path.resolve(args[++i]);
      else if (args[i] === '--record-contract') recordContract = path.resolve(args[++i]);
      else if (args[i] === '--styles-root') stylesRoot = path.resolve(args[++i]);
      else if (args[i] === '--news') newsFile = path.resolve(args[++i]);
      else output = path.resolve(args[++i]);
    } else throw new Error('Unknown or incomplete argument: ' + args[i]);
  }
  const files = generate(readJson(settings), derive(gameDataRoot), readJson(recordContract), readJson(newsFile));
  writeOrCheck(files, output, check);
  const css = checkStylesheets(stylesRoot);
  console.log('HPV3 stylesheets: ' + css.files + ' files, ' + css.rules + ' rules, max ' + css.widest + ' selectors per rule');
  console.log('HPV3 generator: ' + Object.keys(files).length + ' outputs ' + (check ? 'current' : 'written'));
}
module.exports = { generate, menuParts };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
