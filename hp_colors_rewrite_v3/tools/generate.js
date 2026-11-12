#!/usr/bin/env node
'use strict';
// v3 generator: settings/schema.json + record.json + news.json + the pinned game data -> the generated
// contract, menu and patched stock layouts. The pieces live in tools/lib/:
//   schema.js           settings table validation
//   news.js             settings/news.json validation
//   slot-contract.js    defaults, slots, release and the codec slot contract
//   stock-layouts.js    the Escape menu, unit-status overlay and topbar patches
//   settings-scripts.js the generated settings scripts
//   stylesheets.js      the packed stylesheet contract (run by build() on the generated stock sheet and the folder)
//   output.js           JSON inputs, writing and --check
// and tools/menu-layout.js builds the menu itself.
const fs = require('node:fs');
const path = require('node:path');
const { derive } = require('./game-data');
const { buildMenu } = require('./menu-layout');
const { sidesOf, validate } = require('./lib/schema');
const { validateNews } = require('./lib/news');
const { validateRelease, buildSlots, checkSlotContract } = require('./lib/slot-contract');
const { stockLayouts, menuSteps, topbarSteps, MENU_RESUME, MENU_STYLES, MENU_SCRIPTS, TOPBAR_SCRIPTS, TOPBAR_CLASS, OWNED_STYLES } = require('./lib/stock-layouts');
const { WIRE_VERSION, worldSettingsScript, settingsScript } = require('./lib/settings-scripts');
const { checkStylesheets } = require('./lib/stylesheets');
const { json, readJson, writeOrCheck } = require('./lib/output');
const { lf } = require('./lib/layout-compose');
const ROOT = path.resolve(__dirname, '..');

// The one list of generated outputs (relative to the lane), in write order: tools/dev.js, the variant lanes and the
// tests read it. `make` builds the text from build()'s pieces; `stockSheet` marks the generated stock stylesheet, which
// lib/stylesheets.js checks as the game's sheet (colour macros allowed, no mask).
const OUTPUTS = Object.freeze({
  'generated/defaults.json': { make: b => json(b.defaults) },
  'generated/slots.json': { make: b => json(b.slots) },
  'generated/search-index.json': { make: b => json(b.menu.search) },
  'panorama/styles/unit_status_v2.css': { make: b => b.gameData.stylesheet, stockSheet: true },
  'generated/menu-rows.xml': { make: b => b.menu.fragment },
  'panorama/layout/hud_escape_menu.xml': { make: b => b.layouts.menu },
  'panorama/layout/unit_status_overlay_v2.xml': { make: b => b.layouts.overlay },
  'panorama/layout/citadel_hud_top_bar.xml': { make: b => b.layouts.topbar },
  'panorama/layout/citadel_status_effect.xml': { make: b => b.layouts.statusEffect },
  'panorama/scripts/hp_colors_v3_world_settings.js': { make: b => worldSettingsScript(b.menu.controls) },
  'panorama/scripts/hp_colors_v3_settings.js': { make: b => settingsScript(b.contract) },
});

const readNews = root => readJson(path.join(root, 'settings/news.json'));
// `root` is the tree whose committed slot history, settings script and stylesheets the contracts are checked against
// (the real tree, or the copy a tool validates in); `stylesRoot` overrides only the stylesheet folder.
function generate(rows, gameData, metadata, news = readNews(ROOT), options) { return build(rows, gameData, metadata, news, options).files; }
function build(rows, gameData, metadata, news, { root = ROOT, stylesRoot } = {}) {
  validate(rows);
  validateRelease(metadata);
  const { defaults, slots } = buildSlots(rows);
  const stockIds = new Set([...gameData.menu.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  // Slot identity is checked first: a removed setting reports the slot contract, not a stale news target.
  checkSlotContract(slots, defaults, rows.flatMap(row => sidesOf(row).map(side => ({ ...row, side }))), metadata, root);
  validateNews(news, rows);
  const menu = buildMenu(rows, null, stockIds, metadata.release, news);
  const layouts = stockLayouts(gameData, menu);
  // version is the wire/contract version; release is the shipped version (settings/record.json) the update check compares.
  const contract = { magic: 'HP_COLORS_V3_CONFIG', version: WIRE_VERSION, release: metadata.release, recordVersion: metadata.recordVersion, defaultChanges: metadata.defaultChanges, slotAdditions: metadata.slotAdditions, retiredSlots: metadata.retiredSlots || [], defaults, slots, ids: menu.ids, controls: menu.controls, searchIndex: menu.search, menu: menu.menu,
    heroes: gameData.catalog, gameDataCommit: gameData.pin.commit, gameDataClientVersion: gameData.pin.clientVersion };
  const pieces = { defaults, slots, gameData, menu, layouts, contract };
  const files = {}, stock = {};
  for (const [file, output] of Object.entries(OUTPUTS)) {
    files[file] = output.make(pieces);
    if (output.stockSheet) stock[path.basename(file)] = files[file];
  }
  // The sheet contract covers the generated stock sheet plus the shipped folder; a custom --styles-root is a fixture
  // folder, so only the shipped one is held to the layouts' include lists.
  const css = checkStylesheets(stylesRoot || path.join(root, 'panorama/styles'), { stock, shipped: stylesRoot ? null : [...OWNED_STYLES, ...Object.keys(stock).map(name => name.slice(0, -4))] });
  return { files, menu, css };
}

// The generated outputs of `root` whose committed file is missing or differs from `files` (LF-normalised): the one
// freshness answer for the lanes that consume v3's committed outputs (QOLLOCK, ShowRank).
function staleOutputs(root, files) {
  return Object.keys(files).filter(relative => {
    const file = path.join(root, relative);
    return !fs.existsSync(file) || lf(fs.readFileSync(file, 'utf8')) !== lf(files[relative]);
  });
}

// Published for variant lanes (hp_colors_rewrite_v3_qollock, _showrank): the exact v3 Escape-menu and topbar
// pieces and patch steps this generator injects, computed from the v3 sources, plus `stale` (the v3 outputs of
// `root` that are out of date) with `assertFresh()` (a lane refuses a stale v3 checkout) and `generatedKeys`. `lane.profile`
// ('stock' by default, or 'qollock') picks the base differences of the patch steps and `lane.topbarClasses`
// adds the lane's own classes to the topbar root. The v3 lane itself knows nothing about variants.
function menuParts(root = ROOT, lane = {}) {
  const { profile = 'stock', topbarClasses = [] } = lane;
  const { files, menu } = build(readJson(path.join(root, 'settings/schema.json')), derive(root),
    readJson(path.join(root, 'settings/record.json')), readNews(root), { root });
  const stale = staleOutputs(root, files);
  const topbarClass = [TOPBAR_CLASS, ...topbarClasses].join(' ');
  return { resume: MENU_RESUME, styles: MENU_STYLES, scripts: MENU_SCRIPTS, button: menu.button, fragment: menu.fragment,
    ids: menu.ids, topbarScripts: TOPBAR_SCRIPTS, topbarClass, files, generatedKeys: Object.keys(OUTPUTS),
    menuPatches: menuSteps(profile, menu), topbarPatches: topbarSteps(profile, topbarClass), stale, assertFresh: () => {
      if (stale.length) throw new Error('hp_colors_rewrite_v3 generated outputs are stale (' + stale.join(', ') + '); run hp_colors_rewrite_v3/tools/generate.js first.');
    } };
}

function main(args) {
  let settings = path.join(ROOT, 'settings/schema.json');
  let output = ROOT;
  let check = false;
  let gameDataRoot = ROOT;
  let recordContract = path.join(ROOT,'settings/record.json');
  let stylesRoot;
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
  const { files, css } = build(readJson(settings), derive(gameDataRoot), readJson(recordContract), readJson(newsFile), { stylesRoot });
  writeOrCheck(files, output, check);
  console.log('HPV3 stylesheets: ' + css.files + ' files, ' + css.rules + ' rules, max ' + css.widest + ' selectors per rule');
  console.log('HPV3 generator: ' + Object.keys(files).length + ' outputs ' + (check ? 'current' : 'written'));
}
module.exports = { OUTPUTS, generate, menuParts, staleOutputs };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
