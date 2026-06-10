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
  'topbar_rank/panorama/layout/profile_card.xml',
  'topbar_rank/panorama/layout/citadel_ui_context_menu_player.xml',
  'topbar_rank/panorama/layout/hud_escape_menu.xml',
  'topbar_rank/panorama/layout/players_list_entry.xml',
  'topbar_rank/panorama/scripts/topbar_rank_rank_bridge.js',
  'topbar_rank/panorama/scripts/topbar_rank_hud.js',
  'topbar_rank/panorama/styles/topbar_rank_topbar.css',
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

const hud = fileText.get('topbar_rank/panorama/scripts/topbar_rank_hud.js') || '';
for (const token of [
  'TopbarRankHudRootLoaded',
  'TopbarRankHudPlayerLoaded',
  'POWERUP_CYCLE_SECONDS = 300',
  'REJUV_BUFF_DURATION_SECONDS = 240',
  'REJUV_PHASE_DURATIONS = [0, 413, 353, 293]',
  'function CalcRejuvPhaseAt(seconds)',
  'function PrimeRejuvPhase(state, now)',
  'function ShowBuffPanel(state)',
  'ShowBuffPanel(state);',
  'state.rejuvSpawnWaiting ? REJUV_BUFF_DURATION_SECONDS',
  'state.rejuvAutoPrimed = false',
  'WARNING_YELLOW_SECONDS = 20',
  'WARNING_RED_SECONDS = 10',
  'TIER_COSTS = { isTier1: 800, isTier2: 1600, isTier3: 3200, isTier4: 6400 }',
  'connectedToHideout',
  'connectedtoHideout',
  'connectedtohideout',
  'connectedToHideOut',
  'InHideout',
  'inHideoutIntro',
  'gamemode_streetbrawl',
  'RejuvCount_1',
  'RejuvCount_2',
  'RejuvCount_3',
  'RejuvCount_4'
]) assert(hud.includes(token), 'HUD runtime missing: ' + token);

const topbar = fileText.get('topbar_rank/panorama/layout/citadel_hud_top_bar.xml') || '';
for (const token of ['topbar_rank_rank_bridge.vjs_c', 'topbar_rank_hud.vjs_c', 'TopbarRankTopBarRootLoaded', 'TopbarRankHudRootLoaded', 'topbar_rank_topbar.vcss_c', 'TeamScoreFriendly', 'TeamScoreEnemy', 'TeamsContainer']) assert(topbar.includes(token), 'topbar XML missing: ' + token);
assert(count(topbar, 'id="TopbarRankAdvantageLabel"') === 1, 'topbar XML must contain exactly one TopbarRankAdvantageLabel');

const player = fileText.get('topbar_rank/panorama/layout/citadel_hud_top_bar_player.xml') || '';
for (const token of ['topbar_rank_rank_bridge.vjs_c', 'topbar_rank_hud.vjs_c', 'TopbarRankRegisterTopBarPlayer', 'TopbarRankHudPlayerLoaded', 'id="TopbarRankGoldRaw" class="TopbarRankGoldRaw" text="{i:gold}"', 'Label id="PlayerName"', 'TopbarRankRankImage', 'TopbarRankStatusImage', 'TopbarRankUnspentValue']) assert(player.includes(token), 'player XML missing: ' + token);

const support = {
  'topbar_rank/panorama/layout/profile_card.xml': 'CitadelProfileCard',
  'topbar_rank/panorama/layout/citadel_ui_context_menu_player.xml': 'CitadelContextMenuPlayer',
  'topbar_rank/panorama/layout/hud_escape_menu.xml': 'CitadelHudEscapeMenu',
  'topbar_rank/panorama/layout/players_list_entry.xml': 'CitadelPlayersListEntry'
};
for (const [file, nativeRoot] of Object.entries(support)) {
  const text = fileText.get(file) || '';
  assert(text.includes('topbar_rank_rank_bridge.vjs_c'), file + ' missing rank bridge include');
  assert(!text.includes('topbar_rank_hud.vjs_c'), file + ' must not include HUD runtime');
  assert(text.includes(nativeRoot), file + ' missing native root custom panel: ' + nativeRoot);
}

const topbarCss = (fileText.get('topbar_rank/panorama/styles/topbar_rank_topbar.css') || '').replace(/\r\n/g, '\n');
for (const token of [
  '#BuffHUD',
  '#RejuvHUD',
  '#Buff\n{',
  '#Rejuv\n{',
  '#UrnTracker',
  '#RejuvBuff\n{',
  'CitadelObjectivesMap#ObjectivesMap',
  '#ObjectivesMap .ObjectiveCtn'
]) {
  assert(!topbarCss.includes(token), 'topbar CSS contains removed legacy/objective selector: ' + token);
}
assert((topbarCss.match(/^\.TopbarRankTimerCluster\n\{/gm) || []).length === 1, 'topbar CSS must contain exactly one TopbarRankTimerCluster rule');
assert((topbarCss.match(/^\.TopbarRankTimerIcon\n\{/gm) || []).length === 1, 'topbar CSS must contain exactly one TopbarRankTimerIcon rule');
for (const token of [
  '.TopbarRankTimerCluster\n{',
  'width: 205px;',
  'height: 31px;',
  'background-color: #00000090;',
  'world-blur: ingameHudBlur;',
  'border-radius: 5px;',
  '.TopbarRankTimerPill\n{',
  'width: 75px;',
  'background-color: #00000000;',
  'ignore-parent-flow: true;',
  'world-blur: none;',
  'border-radius: 0px;',
  'x: 65px;',
  'x: -65px;',
  '.TopbarRankTimerIcon\n{\n\twidth: 40px;\n\theight: 40px;',
  'opacity: 0.1;',
  'margin-right: -15%;',
  'margin-top: 10%;',
  'margin-left: -15%;',
  'y: 63px;',
  '#RejuvenatorCharges\n{\nwidth: 210px;\n\theight: 130px;\n\tmargin-top: 25px;\n\tmargin-right: 0px;',
  'margin-left: 9px;',
  'text-shadow: 0px 0px 0px 2.5 #000000bf;',
  'z-index: 999999;',
  '.TopbarRankRejuvSpawned,\n.TopbarRankRejuvCooldown\n{\n\tbackground-color: #00000000;',
]) assert(topbarCss.includes(token), 'topbar CSS missing unified timer token: ' + token);

const objectivesCss = fileText.get('topbar_rank/panorama/styles/objectives_map.css') || '';
assert(objectivesCss.includes('@import url("s2r://panorama/styles/topbar_rank_base/objectives_map.vcss_c");'), 'objectives_map.css missing base import');
assert(objectivesCss.includes('z-index: 95'), 'objectives_map.css missing z-index 95');

const escapeMenu = fileText.get('topbar_rank/panorama/layout/hud_escape_menu.xml') || '';
assert(!escapeMenu.includes('topbar_rank_topbar.vcss_c'), 'escape menu must not import topbar rank topbar CSS');

for (const file of [
  'topbar_rank/panorama/styles/topbar_rank_base/hero_testing_menu.css',
  'topbar_rank/panorama/styles/topbar_rank_base/hud.css',
  'topbar_rank/panorama/styles/topbar_rank_base/hud_damage_report.css',
  'topbar_rank/panorama/styles/topbar_rank_base/hud_paused.css'
]) assert(!exists(file), 'deleted base CSS file still exists: ' + file);

if (failures.length) {
  for (const message of failures) console.error('FAIL: ' + message);
  process.exit(1);
}
console.log('OK: topbar_rank source invariants passed');
