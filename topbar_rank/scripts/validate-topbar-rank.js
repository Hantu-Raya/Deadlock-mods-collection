const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
function fail(message) { failures.push(message); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function assert(condition, message) { if (!condition) fail(message); }
function count(text, token) { return text.split(token).length - 1; }

const panoramaFiles = [
  'topbar_rank/panorama/layout/citadel_hud_top_bar.xml',
  'topbar_rank/panorama/layout/citadel_hud_top_bar_player.xml',
  'topbar_rank/panorama/layout/citadel_hud_hero_shop.xml',
  'topbar_rank/panorama/layout/profile_card.xml',
  'topbar_rank/panorama/layout/citadel_ui_context_menu_player.xml',
  'topbar_rank/panorama/layout/hud_escape_menu.xml',
  'topbar_rank/panorama/layout/players_list_entry.xml',
  'topbar_rank/panorama/scripts/topbar_rank_rank_bridge.js',
  'topbar_rank/panorama/scripts/topbar_rank_v40_hud.js',
  'topbar_rank/panorama/scripts/recent_purchases_redux_data.js',
  'topbar_rank/panorama/scripts/recent_purchases_redux.js',
  'topbar_rank/panorama/styles/topbar_rank_topbar.css',
  'topbar_rank/panorama/styles/citadel_hud_hero_shop.css',
  'topbar_rank/panorama/styles/objectives_map.css',
  'topbar_rank/panorama/styles/topbar_rank_profile_card.css',
  'topbar_rank/panorama/styles/topbar_rank_player_list.css',
  'topbar_rank/panorama/styles/topbar_rank_base/citadel_hud_top_bar.css',
  'topbar_rank/panorama/styles/topbar_rank_base/objectives_map.css'
];
const allFiles = panoramaFiles.concat(['topbar_rank/scripts/validate-topbar-rank.js']);
const fileText = new Map();
for (const file of allFiles) {
  fileText.set(file, exists(file) ? read(file) : null);
  assert(fileText.get(file) !== null, 'missing required file: ' + file);
}
for (const file of [
  'topbar_rank/panorama/scripts/topbar_rank_hud.js',
  'topbar_rank/panorama/scripts/rejuvnbufftimer.js',
  'topbar_rank/panorama/scripts/urntracker.js',
  'topbar_rank/panorama/scripts/unspent.js',
  'topbar_rank/panorama/styles/topbar_rank_hero_shop.css'
]) assert(!exists(file), 'obsolete split Top Bar Plus file still exists: ' + file);

const forbidden = ['showrank/tests', 'test/topbar', 'ShowRankRegister', 'ShowRankTopBar', 'ShowRankPlayerList'];
for (const file of panoramaFiles) {
  const text = fileText.get(file) || '';
  for (const token of forbidden) assert(!text.includes(token), file + ' contains forbidden token: ' + token);
}

const bridge = fileText.get('topbar_rank/panorama/scripts/topbar_rank_rank_bridge.js') || '';
for (const token of [
  'RANK_API_URL_PREFIX = "https://api.deadlock-api.com/v1/players/"',
  'RANK_IMAGE_URL_SUFFIX = "/rank-predict/image?format=webp"',
  'TEAM_AVERAGE_API_URL_PREFIX = "https://api.deadlock-api.com/v1/players/rank-predict/image?account_ids="',
  'TEAM_AVERAGE_API_URL_SUFFIX = "&format=webp"',
  'MIN_ACCOUNT_ID = 100000',
  'MAX_ACCOUNT_ID = 4294967295',
  'TEAM_AVERAGE_REQUIRED_ACCOUNTS = 6',
  'TopbarRankTriggerProfileCard',
  'TopbarRankOpenStatlocker',
  'TopbarRankContextMenuTriggerProfileCard',
  'TopbarRankContextMenuOpenStatlocker',
  'TopbarRankContextMenuOpenDeadlock',
  'TopbarRankTopBarRootLoaded',
  'TopbarRankRegisterTopBarPlayer',
  'TopbarRankMarkTopBarHover',
  'TopbarRankMarkPlayerListHover',
  'TopbarRankClearPlayerListHover',
  'TopbarRankEscapePreloadFromPlayerList',
  'TopbarRankRegisterPlayerListRowReady'
]) assert(bridge.includes(token), 'rank bridge missing: ' + token);
for (const token of ['fetch(', 'XMLHttpRequest', 'AsyncWebRequest', 'setInterval', '.src =', 'RunScriptInPanelContext']) assert(!bridge.includes(token), 'rank bridge contains forbidden API: ' + token);

const topbar = fileText.get('topbar_rank/panorama/layout/citadel_hud_top_bar.xml') || '';
for (const token of [
  'topbar_rank_topbar.vcss_c',
  'topbar_rank_v40_hud.vjs_c',
  'topbar_rank_rank_bridge.vjs_c',
  'TopbarRankTopBarRootLoaded',
  'TeamScoreFriendly',
  'TeamScoreEnemy',
  'TopbarRankTeamAverageLayer',
  'UrnTracker',
  'UrnNetworthCard',
  'UrnHudCard',
  'BuffHUD',
  'RejuvHUD',
  'RejuvBuff',
  'Buff',
  'Rejuv',
  'RejuvenatorCharges',
  'ObjectivesMap'
]) assert(topbar.includes(token), 'topbar XML missing v40/topbar token: ' + token);
for (const token of ['rejuvnbufftimer.vjs_c', 'urntracker.vjs_c', 'topbar_rank_hud.vjs_c', 'recent_purchases_redux.vjs_c']) assert(!topbar.includes(token), 'topbar XML still loads obsolete script: ' + token);
assert(count(topbar, 'topbar_rank_v40_hud.vjs_c') === 1, 'topbar XML must load combined v40 HUD once');
assert(count(topbar, 'id="TopbarRankAdvantageLabel"') === 0, 'topbar XML must not contain duplicate TopbarRankAdvantageLabel percent card');
assert(count(topbar, 'id="UrnTracker"') === 1, 'topbar XML must contain exactly one UrnTracker container');
assert(count(topbar, 'id="UrnTrackerLabel"') === 1, 'topbar XML must contain exactly one networth percent label');
assert(count(topbar, 'id="UrnHUD"') === 1, 'topbar XML must contain exactly one urn timer label');
assert(count(topbar, 'id="UrnNetworthCard"') === 1, 'topbar XML must contain exactly one networth percent card');

const player = fileText.get('topbar_rank/panorama/layout/citadel_hud_top_bar_player.xml') || '';
for (const token of [
  'topbar_rank_v40_hud.vjs_c',
  'topbar_rank_rank_bridge.vjs_c',
  'TopbarRankRegisterTopBarPlayer',
  'TopbarRankMarkTopBarHover',
  'id="TopbarRankGoldRaw" class="TopbarRankGoldRaw" text="{i:gold}"',
  'id="HiddenGoldValue" class="hiddenGoldValue" text="{i:gold}"',
  'id="SpentSoulDisplay" class="SpentSoulDisplay"',
  'UnSoulsValueContainer',
  'Label id="PlayerName"',
  'class="HeroNameHidden" text="{g:citadel_hero_name:hero_id}"',
  'TopbarRankRankImage',
  'TopbarRankStatusImage'
]) assert(player.includes(token), 'player XML missing v40/topbar token: ' + token);
for (const token of ['unspent.vjs_c', 'topbar_rank_hud.vjs_c']) assert(!player.includes(token), 'player XML still loads obsolete script: ' + token);
assert(count(player, 'topbar_rank_v40_hud.vjs_c') === 1, 'player XML must load combined v40 HUD once');
assert(player.indexOf('class="HeroName"') < player.indexOf('class="HeroNameHidden"'), 'HeroNameHidden must follow visible HeroName');

const heroShop = fileText.get('topbar_rank/panorama/layout/citadel_hud_hero_shop.xml') || '';
for (const token of [
  'recent_purchases_redux_data.vjs_c',
  'recent_purchases_redux.vjs_c',
  'citadel_hud_hero_shop.vcss_c',
  'snippet name="RecentPurchase"',
  'RecentPurchasesPanel',
  'RecentPurchasesContainer',
  'recentTimePurchased',
  'recentModPurchaseName',
  'recentModPurchaserHero'
]) assert(heroShop.includes(token), 'hero shop XML missing recent purchase token: ' + token);
assert(count(heroShop, 'recent_purchases_redux_data.vjs_c') === 1, 'hero shop XML must include recent purchases data exactly once');
assert(count(heroShop, 'recent_purchases_redux.vjs_c') === 1, 'hero shop XML must include recent purchases runtime exactly once');
assert(heroShop.indexOf('recent_purchases_redux_data.vjs_c') < heroShop.indexOf('recent_purchases_redux.vjs_c'), 'recent purchases data include must appear before runtime include');

const support = {
  'topbar_rank/panorama/layout/profile_card.xml': 'CitadelProfileCard',
  'topbar_rank/panorama/layout/citadel_ui_context_menu_player.xml': 'CitadelContextMenuPlayer',
  'topbar_rank/panorama/layout/hud_escape_menu.xml': 'CitadelHudEscapeMenu',
  'topbar_rank/panorama/layout/players_list_entry.xml': 'CitadelPlayersListEntry'
};
for (const [file, nativeRoot] of Object.entries(support)) {
  const text = fileText.get(file) || '';
  assert(text.includes('topbar_rank_rank_bridge.vjs_c'), file + ' missing rank bridge include');
  assert(!text.includes('topbar_rank_v40_hud.vjs_c'), file + ' must not include topbar HUD runtime');
  assert(text.includes(nativeRoot), file + ' missing native root custom panel: ' + nativeRoot);
}

const combined = fileText.get('topbar_rank/panorama/scripts/topbar_rank_v40_hud.js') || '';
for (const token of [
  'ROOT_TICK_SECONDS = 1.0',
  'PLAYER_TICK_SECONDS = 0.5',
  'REJUV_DURATION = 240',
  'BRIDGE_DURATION = 300',
  'INITIAL_URN = 720',
  'URN_DURATION = 360',
  'ROOT_GENERATION_KEY = "__TopbarRankV40HudRootGeneration"',
  'PLAYER_GENERATION_KEY = "__TopbarRankV40HudPlayerGeneration"',
  'function BuildRootState(context)',
  'function UpdateRoot(state)',
  'function SetBuffTimerWarning(state, remaining)',
  'RemoveClass(state.buffHud, "buffWarningRed");',
  'function UpdateRejuv(state, now, chargeActive)',
  'function UpdateTeamDiff(state, now)',
  'function BuildPlayerState(context)',
  'function UpdatePlayer(state)',
  'function CountSpentSouls(mods)',
  'function Boot()',
  'RejuvTime',
  'RejuvNum',
  'RejuvImg',
  'BuffTime',
  'RejuvBuff',
  'BuffTimeHUD',
  'RejuvHUD',
  'BuffHUD',
  'buffWarningRed',
  'buffWarningYellow',
  'UrnHUD',
  'UrnTrackerLabel',
  'urnNetworthCard',
  'urnHudCard',
  'TopbarRankAdvantageLabel',
  'HiddenGoldValue',
  'SpentSoulDisplay',
  'PlayerModsContainer',
  'isTier1',
  'isTier2',
  'isTier3',
  'isTier4',
  'RejuvCount_1'
]) assert(combined.includes(token), 'combined v40 HUD runtime missing: ' + token);
assert(combined.includes('ApplyStateClass(state.urnNetworthCard, "good", "bad", "neutral", urnClass);'), 'networth color state must apply only to UrnNetworthCard');
assert(!combined.includes('ApplyStateClass(state.urnTracker, "good", "bad", "neutral", urnClass);'), 'networth color state must not apply to the whole UrnTracker container');
for (const token of ['setInterval', 'TopbarRankHudRootLoaded', 'TopbarRankHudPlayerLoaded']) assert(!combined.includes(token), 'combined v40 HUD runtime contains obsolete token: ' + token);

const recentData = fileText.get('topbar_rank/panorama/scripts/recent_purchases_redux_data.js') || '';
assert(recentData.includes('const MOD_ICONS = {'), 'recent purchases data missing MOD_ICONS map');
assert(recentData.includes('const HERO_IMAGES = {'), 'recent purchases data must keep full v40 HERO_IMAGES map');
assert(recentData.includes('url(\\"s2r://panorama/images/items/'), 'recent purchases data missing item icon URLs');

const recent = fileText.get('topbar_rank/panorama/scripts/recent_purchases_redux.js') || '';
for (const token of ['const MAIN_POLL_INTERVAL = 0.1;', 'const HIDEOUT_POLL_INTERVAL = 1.0;', 'function CreateFilterCheckboxes(globalRoot)', 'function UpdateQuickPurchases(container, purchases)', 'HeroNameHidden', 'QuickPurchasesPanel']) assert(recent.includes(token), 'recent purchases runtime missing: ' + token);
for (const token of ['fetch(', 'XMLHttpRequest', 'AsyncWebRequest', 'setInterval', 'DEBUG = true', 'DEBUG_QUICK = true']) assert(!recent.includes(token), 'recent purchases runtime contains forbidden API/token: ' + token);

const topbarCss = (fileText.get('topbar_rank/panorama/styles/topbar_rank_topbar.css') || '').replace(/\r\n/g, '\n');
for (const token of ['@import url("s2r://panorama/styles/topbar_rank_base/citadel_hud_top_bar.vcss_c");', '@import url("s2r://panorama/styles/objectives_map.vcss_c");', '.TopbarRankTeamAverageLayer', '.TopbarRankAdvantage', '.TopbarRankStatusImage', '.TopbarRankRankImage', '.GameClock\n{\n\tbackground-color: #00000090;', '#RejuvHUD,\n#BuffHUD', 'x: -65px;', 'x: 65px;', 'border-top: 0px solid #00000000;', 'border-left: 0px solid #00000000;', '#BuffHUD.buffWarningYellow #BuffTimeHUD', '#BuffHUD.buffWarningRed #BuffTimeHUD', '#RejuvTimeHUD,\n#BuffTimeHUD', 'width: 92px;', 'text-shadow: 0px 0px 5px 2.0 #ffff0090', 'text-shadow: 0px 0px 6px 2.0 #ff0000aa', '#UrnTracker\n{', '.UrnTrackerCard', 'width: 200px;', '.UrnTrackerCard', 'width: 100px;', '.UrnNetworthCard\n{\n\thorizontal-align: left;', '.UrnHudCard\n{\n\thorizontal-align: right;', '.UrnNetworthCard.bad', 'wash-color: #DCDCDC;']) assert(topbarCss.includes(token), 'topbar CSS missing Topbar Rank token: ' + token);
assert(!topbarCss.includes('#RejuvHUD.buffWarningYellow #RejuvTimeHUD'), 'buff warning glow must not target rejuv timer text');
assert(!topbarCss.includes('#RejuvHUD.buffWarningRed #RejuvTimeHUD'), 'buff warning glow must not target rejuv timer text');

const baseTopbarCss = fileText.get('topbar_rank/panorama/styles/topbar_rank_base/citadel_hud_top_bar.css') || '';
for (const token of ['.SpentSoulDisplay', '.UnSoulsValueContainer', '#UrnTracker', '#BuffHUD', '#RejuvHUD', '#RejuvBuff', '.HeroNameHidden', '.QuickPurchasesPanel', "@keyframes 'quickT4WeaponGlow'", "@keyframes 'quickT4ArmorGlow'", "@keyframes 'quickT4TechGlow'"]) assert(baseTopbarCss.includes(token), 'base v40 topbar CSS missing: ' + token);

const heroShopCss = fileText.get('topbar_rank/panorama/styles/citadel_hud_hero_shop.css') || '';
for (const token of ['#RecentPurchasesPanel', '#RecentPurchasesContainer', '.recentPurchase', '.recentPurchase .mod_icon', '.filterHidden', '.filterButtonHidden', '#PurchaseFiltersContainer', '.PurchaseFilterGroup', '.PurchaseFilterToggle', '.gShopOpen #RecentPurchasesPanel']) assert(heroShopCss.includes(token), 'hero shop CSS missing recent purchase token: ' + token);

const objectivesCss = fileText.get('topbar_rank/panorama/styles/objectives_map.css') || '';
assert(objectivesCss.includes('@import url("s2r://panorama/styles/topbar_rank_base/objectives_map.vcss_c");'), 'objectives_map.css missing base import');
assert(objectivesCss.includes('.LiveGame.ObjectiveCtn'), 'objectives_map.css missing direct LiveGame ObjectiveCtn visibility fix');
assert(objectivesCss.includes('#ObjectivesMap .ObjectiveCtn'), 'objectives_map.css missing scoped ObjectiveCtn visibility fix');
assert(objectivesCss.includes('z-index: 95'), 'objectives_map.css missing z-index 95');

if (failures.length) {
  for (const failure of failures) console.error('FAIL: ' + failure);
  process.exit(1);
}
console.log('OK: topbar_rank source invariants passed');
