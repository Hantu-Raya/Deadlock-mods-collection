const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
function p(rel) { return path.join(root, rel); }
function exists(rel) { return fs.existsSync(p(rel)); }
function read(rel) { return fs.readFileSync(p(rel), 'utf8').replace(/\r\n/g, '\n'); }
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }
function count(text, token) { return text.split(token).length - 1; }

const required = [
  'topbar_no_ranks/panorama/layout/citadel_hud_top_bar.xml',
  'topbar_no_ranks/panorama/layout/citadel_hud_top_bar_player.xml',
  'topbar_no_ranks/panorama/scripts/topbar_rank_hud.js',
  'topbar_no_ranks/panorama/styles/topbar_rank_topbar.css',
  'topbar_no_ranks/panorama/styles/objectives_map.css',
  'topbar_no_ranks/panorama/styles/topbar_rank_base/citadel_hud_top_bar.css',
  'topbar_no_ranks/panorama/styles/topbar_rank_base/objectives_map.css'
];
for (const file of required) assert(exists(file), 'missing required file: ' + file);

const removed = [
  'topbar_no_ranks/panorama/layout/profile_card.xml',
  'topbar_no_ranks/panorama/layout/citadel_ui_context_menu_player.xml',
  'topbar_no_ranks/panorama/layout/hud_escape_menu.xml',
  'topbar_no_ranks/panorama/layout/players_list_entry.xml',
  'topbar_no_ranks/panorama/scripts/topbar_rank_rank_bridge.js',
  'topbar_no_ranks/panorama/styles/topbar_rank_profile_card.css',
  'topbar_no_ranks/panorama/styles/topbar_rank_player_list.css'
];
for (const file of removed) assert(!exists(file), 'rank-only file still exists: ' + file);

const files = required;
const forbidden = [
  'topbar_rank_rank_bridge',
  'rank-predict',
  'deadlock-api.com',
  'StatLocker',
  'TopbarRankTopBarRootLoaded',
  'TopbarRankRegisterTopBarPlayer',
  'TopbarRankMarkTopBarHover',
  'TopbarRankMarkPlayerListHover',
  'TopbarRankClearPlayerListHover',
  'TopbarRankEscapePreloadFromPlayerList',
  'TopbarRankRegisterPlayerListRowReady',
  'TopbarRankTriggerProfileCard',
  'TopbarRankContextMenu',
  'TopbarRankRankImage',
  'TopbarRankStatusImage',
  'TopbarRankTeamAverage',
  'TopbarRankAverageFriendlyImage',
  'TopbarRankAverageEnemyImage',
  'TopbarRankProfile',
  'TopbarRankPlayerList',
  'TopbarRankSpinnerSpin'
];
for (const file of files) {
  const text = read(file);
  for (const token of forbidden) assert(!text.includes(token), file + ' contains rank-only token: ' + token);
}

const topbar = read('topbar_no_ranks/panorama/layout/citadel_hud_top_bar.xml');
for (const token of [
  'topbar_rank_hud.vjs_c',
  'TopbarRankHudRootLoaded',
  'TopbarRankTimerCluster',
  'TopbarRankPowerupHud',
  'TopbarRankRejuvHud',
  'TopbarRankRejuvBuff',
  'RejuvenatorTimer',
  'TopbarRankAdvantageLabel',
  'TeamScoreFriendly',
  'TeamScoreEnemy',
  'TeamsContainer',
  'ObjectivesMap'
]) assert(topbar.includes(token), 'topbar XML missing: ' + token);
assert(count(topbar, 'id="TopbarRankRejuvBuff"') === 1, 'topbar XML must contain exactly one TopbarRankRejuvBuff');
assert(topbar.indexOf('id="TopbarRankRejuvBuff"') > topbar.indexOf('id="RejuvenatorTimer"') && topbar.indexOf('id="TopbarRankRejuvBuff"') < topbar.indexOf('id="RejuvenatorEnemy"'), 'TopbarRankRejuvBuff must live inside RejuvenatorTimer');

const player = read('topbar_no_ranks/panorama/layout/citadel_hud_top_bar_player.xml');
for (const token of [
  'topbar_rank_hud.vjs_c',
  'TopbarRankHudPlayerLoaded',
  'TopbarRankGoldRaw',
  'SoulsValue',
  'PlayerName',
  'TopbarRankUnspentRow',
  'TopbarRankUnspentValue',
  'PlayerModsContainer'
]) assert(player.includes(token), 'player XML missing: ' + token);

const hud = read('topbar_no_ranks/panorama/scripts/topbar_rank_hud.js');
for (const token of [
  'POWERUP_CYCLE_SECONDS = 300',
  'REJUV_BUFF_DURATION_SECONDS = 240',
  'REJUV_PHASE_DURATIONS = [0, 413, 353, 293]',
  'function HasRejuvCharge(state)',
  'function UpdateBuff(state, now, chargeActive)',
  'TopbarRankHudRootLoaded',
  'TopbarRankHudPlayerLoaded',
  'TIER_COSTS = { isTier1: 800, isTier2: 1600, isTier3: 3200, isTier4: 6400 }'
]) assert(hud.includes(token), 'HUD runtime missing: ' + token);
for (const token of ['CHARGE_SCAN_SECONDS', 'buffStartedAt', 'rejuvPhase:']) assert(!hud.includes(token), 'HUD runtime contains removed dead state: ' + token);

const css = read('topbar_no_ranks/panorama/styles/topbar_rank_topbar.css');
for (const token of [
  '@import url("s2r://panorama/styles/topbar_rank_base/citadel_hud_top_bar.vcss_c");',
  '@import url("s2r://panorama/styles/objectives_map.vcss_c");',
  '.TopbarRankTimerCluster\n{',
  '.TopbarRankRejuvBuff\n{\n\twidth: 70px;\n\theight: 30px;\n\tvertical-align: bottom;\n\thorizontal-align: center;\n\tmargin-bottom: 28px;',
  '.TopbarRankUnspentRow',
  'opacity: 1;'
]) assert(css.includes(token), 'topbar CSS missing: ' + token);
assert((css.match(/^\.TopbarRankTimerCluster\n\{/gm) || []).length === 1, 'topbar CSS must contain exactly one timer cluster block');

const objectivesCss = read('topbar_no_ranks/panorama/styles/objectives_map.css');
assert(objectivesCss.includes('@import url("s2r://panorama/styles/topbar_rank_base/objectives_map.vcss_c");'), 'objectives_map.css missing base import');
assert(objectivesCss.includes('z-index: 95'), 'objectives_map.css missing z-index 95');

console.log('OK: topbar_no_ranks source invariants passed');
