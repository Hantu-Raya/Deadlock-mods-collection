const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
function fail(message) { failures.push(message); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function readBuffer(rel) { return fs.readFileSync(path.join(root, rel)); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function assert(condition, message) { if (!condition) fail(message); }
function count(text, token) { return text.split(token).length - 1; }
function cssBlock(text, selector) {
  const start = text.indexOf(selector);
  if (start < 0) return '';
  const open = text.indexOf('{', start);
  const close = text.indexOf('}', open);
  return open >= 0 && close >= 0 ? text.slice(open + 1, close) : '';
}
function cssBlocks(text, selector) {
  const blocks = [];
  let start = text.indexOf(selector);
  while (start >= 0) {
    const open = text.indexOf('{', start);
    const close = text.indexOf('}', open);
    if (open < 0 || close < 0) break;
    blocks.push(text.slice(open + 1, close));
    start = text.indexOf(selector, close + 1);
  }
  return blocks;
}
function cssHasBlock(text, selector, tokens) {
  return cssBlocks(text, selector).some((block) => tokens.every((token) => block.includes(token)));
}


const panoramaFiles = [
  'topbar_rank/panorama/layout/citadel_hud_top_bar.xml',
  'topbar_rank/panorama/layout/citadel_hud_top_bar_player.xml',
  'topbar_rank/panorama/layout/citadel_hud_hero_shop.xml',
  'topbar_rank/panorama/layout/profile_card.xml',
  'topbar_rank/panorama/layout/citadel_ui_context_menu_player.xml',
  'topbar_rank/panorama/layout/hud_escape_menu.xml',
  'topbar_rank/panorama/layout/players_list_entry.xml',
  'topbar_rank/panorama/scripts/showrank_common.js',
  'showrank/panorama/scripts/showrank_common.js',
  'topbar_rank/panorama/scripts/topbar_rank_v40_hud.js',
  'topbar_rank/panorama/scripts/recent_purchases_redux_data.js',
  'topbar_rank/panorama/scripts/recent_purchases_redux.js',
  'topbar_rank/panorama/styles/topbar_rank_topbar.css',
  'topbar_rank/panorama/styles/topbar_rank_escape_menu.css',
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
  'topbar_rank/panorama/scripts/topbar_rank_rank_bridge.js',
  'topbar_rank/panorama/scripts/topbar_rank_rank_bridge.vjs_c',
  'topbar_rank/panorama/scripts/topbar_rank_hud.js',
  'topbar_rank/panorama/scripts/rejuvnbufftimer.js',
  'topbar_rank/panorama/scripts/urntracker.js',
  'topbar_rank/panorama/scripts/unspent.js',
  'topbar_rank/panorama/styles/topbar_rank_hero_shop.css'
]) assert(!exists(file), 'obsolete Topbar Rank script/style still exists: ' + file);

assert(exists('topbar_rank/panorama/scripts/showrank_common.js'), 'missing copied ShowRank bridge');
assert(exists('showrank/panorama/scripts/showrank_common.js'), 'missing live ShowRank bridge source');
if (exists('topbar_rank/panorama/scripts/showrank_common.js') && exists('showrank/panorama/scripts/showrank_common.js')) {
  assert(
    readBuffer('topbar_rank/panorama/scripts/showrank_common.js').equals(
      readBuffer('showrank/panorama/scripts/showrank_common.js'),
    ),
    'copied ShowRank bridge differs byte-for-byte from live source',
  );
}
for (const file of [
  'topbar_rank/panorama/layout/citadel_hud_top_bar.xml',
  'topbar_rank/panorama/layout/citadel_hud_top_bar_player.xml',
  'topbar_rank/panorama/layout/profile_card.xml',
  'topbar_rank/panorama/layout/citadel_ui_context_menu_player.xml',
  'topbar_rank/panorama/layout/hud_escape_menu.xml',
  'topbar_rank/panorama/layout/players_list_entry.xml'
]) {
  const text = fileText.get(file) || '';
  assert(count(text, 'showrank_common.vjs_c') === 1, file + ' must load ShowRank bridge exactly once');
  assert(count(text, 'topbar_rank_rank_bridge.vjs_c') === 0, file + ' must not load removed Topbar Rank bridge');
}




const rankXmlContracts = {
  'topbar_rank/panorama/layout/citadel_hud_top_bar.xml': [],
  'topbar_rank/panorama/layout/citadel_hud_top_bar_player.xml': ['ShowRankMarkTopBarHover'],
  'topbar_rank/panorama/layout/profile_card.xml': ['ShowRankTriggerProfileCard', 'ShowRankOpenStatlocker'],
  'topbar_rank/panorama/layout/citadel_ui_context_menu_player.xml': ['ShowRankContextMenuOpenStatlocker', 'ShowRankContextMenuOpenDeadlock'],
  'topbar_rank/panorama/layout/hud_escape_menu.xml': ['ShowRankEscapePreloadFromPlayerList'],
  'topbar_rank/panorama/layout/players_list_entry.xml': [
    'ShowRankMarkPlayerListHover',
    'ShowRankClearPlayerListHover',
    'ShowRankRegisterPlayerListRowReady'
  ]
};
const allowedRankWrappers = new Set(Object.values(rankXmlContracts).flat());
for (const [file, expectedWrappers] of Object.entries(rankXmlContracts)) {
  const text = fileText.get(file) || '';
  const wrappers = [...text.matchAll(/\$\.(ShowRank[A-Za-z0-9_]+)/g)].map((match) => match[1]);
  for (const wrapper of wrappers)
    assert(allowedRankWrappers.has(wrapper), file + ' calls forbidden ShowRank wrapper: ' + wrapper);
  for (const wrapper of expectedWrappers)
    assert(count(text, '$.' + wrapper) > 0, file + ' missing ShowRank wrapper: ' + wrapper);
  assert(!/\$\.(TopbarRank[A-Za-z0-9_]+)/.test(text), file + ' calls obsolete TopbarRank wrapper');
}

const topbar = fileText.get('topbar_rank/panorama/layout/citadel_hud_top_bar.xml') || '';
assert(count(topbar, 'topbar_rank_v40_hud.vjs_c') === 1, 'topbar XML must keep combined v40 HUD once');
for (const token of [
  'TeamScoreFriendly', 'TeamScoreEnemy', 'UrnTracker', 'UrnNetworthCard', 'UrnHudCard',
  'BuffHUD', 'RejuvHUD', 'RejuvBuff', 'Buff', 'Rejuv', 'RejuvenatorCharges',
  'ObjectivesMap', 'KothCashInMeter', 'KothIndicator', 'KothCashInMeterTeam1',
  'KothCashInMeterTeam2', 'KothParticipants', 'KothTextureElement', 'koth_time_warning',
  '{i:gold_value}', '{i:KothTeam1Progress}', '{i:KothTeam2Progress}',
  'id="ShowRankTeamAverageLayer"', 'id="ShowRankAverageFriendlyImage"',
  'id="ShowRankAverageEnemyImage"'
]) assert(topbar.includes(token), 'topbar XML missing v40/ShowRank token: ' + token);
for (const token of ['IdolCashInMeter', 'IdolIndicator', 'IdolProgressBar', 'IdolTeamText', 'Idol_Capture_']) {
  assert(!topbar.includes(token), 'topbar XML contains stale native Idol token: ' + token);
}

const player = fileText.get('topbar_rank/panorama/layout/citadel_hud_top_bar_player.xml') || '';
assert(count(player, 'topbar_rank_v40_hud.vjs_c') === 1, 'player XML must keep combined v40 HUD once');
for (const token of [
  'class="ShowRankCleanTopBarPlayer"',
  'id="ShowRankTopBarStatusImage"',
  'class="ShowRankTopBarStatusImage ShowRankTopBarStatusVisible"',
  'id="ShowRankTopBarRankImage"',
  'id="SpentSoulDisplay" class="SpentSoulDisplay TopbarRankSpentValue"',
  'TopbarRankSpentRow', 'TopbarRankSpentTitle', 'SpentSoulsValueContainer',
  'Label id="PlayerName"', 'class="HeroNameHidden" text="{g:citadel_hero_name:hero_id}"'
]) assert(player.includes(token), 'player XML missing ShowRank/v40 token: ' + token);
assert(player.indexOf('id="ShowRankTopBarStatusImage"') < player.indexOf('id="ShowRankTopBarRankImage"'), 'status image must precede rank image');
assert(player.indexOf('id="ShowRankTopBarRankImage"') < player.indexOf('id="HeroImageArea"'), 'rank images must stay before HeroImageArea');
for (const token of ['unspent.vjs_c', 'topbar_rank_hud.vjs_c', 'rejuvnbufftimer.vjs_c', 'urntracker.vjs_c']) {
  assert(!player.includes(token), 'player XML still loads obsolete script: ' + token);
}
for (const token of [
  'Unspent:',
  'TopbarRankUnspentRow',
  'TopbarRankUnspentTitle',
  'TopbarRankUnspentValue',
  'UnSoulsValueContainer',
  'id="HiddenGoldValue"',
  'id="TopbarRankGoldRaw"'
]) assert(!player.includes(token), 'player XML must not keep unspent-souls token: ' + token);
const v40Hud = fileText.get('topbar_rank/panorama/scripts/topbar_rank_v40_hud.js') || '';
for (const token of [
  'var TIER_CLASS_NAMES = ["isTier1", "isTier2", "isTier3", "isTier4"];',
  'function StateIsActive(state)',
  'function RootStateIsActive(state)',
  'function PlayerStateIsActive(state)',
  'function ScheduleBootRetry(context)',
  'generationKey: ROOT_GENERATION_KEY',
  'generationKey: PLAYER_GENERATION_KEY',
  'function ReadSpentSoulsSnapshot(mods)',
  'lastSpentSignature',
  'lastSpentText',
  'text = (snapshot.spent / 1000).toFixed(1) + "k";',
  'display: Find(context, "SpentSoulDisplay")',
  'modsContainer: Find(context, "PlayerModsContainer")',
  'var REJUV_DURATION = 180;',
  'var RIFT_SPAWN_WARNING_SECONDS = 25;',
  'var RIFT_FIRST_SPAWN_CENTER_SECONDS = 745;',
  'var RIFT_RESPAWN_INTERVAL_SECONDS = 420;',
  'var RIFT_SPAWN_JITTER_SECONDS = 60;',
  'var URN_FIRST_SPAWN_SECONDS = 600;',
  'var URN_SPAWN_INTERVAL_SECONDS = 300;',
  'var URN_WALK_AFTER_SECONDS = 180;',
  'var URN_PICKUP_DECAY_START_SECONDS = 45;',
  'var URN_PICKUP_DECAY_DURATION_SECONDS = 45;',
  'var OBJECTIVE_MARKER_ROOT_IDS = ["HudMinimap", "hud_minimap", "HudMinimapContainer", "minimap_container", "ObjectivesMap"];',
  'function ReadObjectiveMarkerRoot(state)',
  'function ReadRiftMarker(state)',
  'function ReadUrnMarker(state)',
  'function ReadUrnSchedule(now)',
  'function ReadRiftSpawnWindow(state, now)',
  'function AdvanceRiftSpawnAccumulatorAfterLive(state, now)',
  'function FormatRiftSpawnWindow(window)',
  'function ReadRiftCaptureModel(teamDiff, side)',
  'function UpdateObjectiveTracker(state, now, teamDiff)',
  'SetText(state.urnHud, text);',
  'objectiveMarkerRoot: FindFirstPanelByIds(root, OBJECTIVE_MARKER_ROOT_IDS)',
  'riftSpawnAccumulator: 0',
  'riftObservedLive: false'
]) assert(v40Hud.includes(token), 'v40 HUD missing spent-souls logic token: ' + token);
for (const token of [
  'function ReadPlayerGold',
  'ReadPlayerGold(state) - CountSpentSouls',
  'hiddenGold: Find(context, "HiddenGoldValue")',
  'goldRaw: Find(context, "TopbarRankGoldRaw")',
  'soulsValue: Find(context, "SoulsValue")'
]) assert(!v40Hud.includes(token), 'v40 HUD must not keep unspent-souls logic token: ' + token);
assert(!v40Hud.includes('ChildrenWithClass(mods, key)'), 'v40 HUD must not rescan PlayerModsContainer once per tier');
assert(!v40Hud.includes('var REJUV_DURATION = 240;'), 'v40 HUD must use 180s Rejuv buff duration');
assert(!v40Hud.includes('urnRemaining = now < INITIAL_URN'), 'v40 HUD must not display stale fixed Urn/KOTH timer');
assert(!v40Hud.includes('var INITIAL_URN'), 'v40 HUD must not keep old fixed Urn initial spawn constant');
assert(!v40Hud.includes('var URN_DURATION'), 'v40 HUD must not keep old fixed Urn interval constant');

const profileCard = fileText.get('topbar_rank/panorama/layout/profile_card.xml') || '';
for (const token of [
  'ShowRankProfileCardRoot', 'ShowRankTriggerProfileCard', 'ShowRankOpenStatlocker',
  'WebMediaDemoAccountLabel', 'ShowRankHiddenAccountID', 'WebMediaDemoAccountIdRow',
  'WebMediaDemoProfileLink', 'WebMediaDemoMediaSlot', 'WebMediaDemoLocalBadge',
  'WebMediaDemoMedia'
]) assert(profileCard.includes(token), 'profile card XML missing ShowRank token: ' + token);
assert(!profileCard.includes('TopbarRank'), 'profile card XML must not ship obsolete TopbarRank token');

const contextMenu = fileText.get('topbar_rank/panorama/layout/citadel_ui_context_menu_player.xml') || '';
for (const token of ['ShowRankPlayerContextMenuRoot', 'ShowRankContextMenuOpenStatlocker', 'ShowRankContextMenuOpenDeadlock']) {
  assert(contextMenu.includes(token), 'context menu XML missing ShowRank token: ' + token);
}
assert(!contextMenu.includes('TopbarRank'), 'context menu XML must not ship obsolete TopbarRank token');

const escapeMenu = fileText.get('topbar_rank/panorama/layout/hud_escape_menu.xml') || '';
for (const token of [
  'ShowRankEscapePreloadFromPlayerList',
  'id="ShowRankRetryMissingRanks"',
  'ShowRankRetryMissingButton',
  'players_list_retry_missing',
  'CitadelResumePlaying()'
]) assert(escapeMenu.includes(token), 'escape XML missing ShowRank preload/retry token: ' + token);
assert(!escapeMenu.includes('TopbarRank'), 'escape XML must not ship obsolete TopbarRank token');
const escapeCss = fileText.get('topbar_rank/panorama/styles/topbar_rank_escape_menu.css') || '';
assert(
  cssBlock(escapeCss, '#RightSide .FriendsOrPlayersTabs').includes('width: 600px'),
  'escape CSS must widen the Friends/Players retry tab row',
);

const listEntry = fileText.get('topbar_rank/panorama/layout/players_list_entry.xml') || '';
for (const token of [
  'ShowRankCleanPlayersListEntry',
  'ShowRankRegisterPlayerListRowReady',
  'ShowRankMarkPlayerListHover',
  'ShowRankClearPlayerListHover',
  'ShowRankPlayerNameRow',
  'id="ShowRankPlayerListRankImage"'
]) assert(listEntry.includes(token), 'players list XML missing ShowRank token: ' + token);
assert(!listEntry.includes('TopbarRank'), 'players list XML must not ship obsolete TopbarRank token');
const listEntryRootTagMatch = listEntry.match(/<CitadelPlayersListEntry\b[^>]*>/);
const listEntryRootTag = listEntryRootTagMatch ? listEntryRootTagMatch[0] : '';
assert(listEntryRootTag, 'players list XML missing CitadelPlayersListEntry root tag');
assert(
  listEntryRootTag.includes("ShowRankMarkPlayerListHover('players_list_activate')"),
  'players list root activation must mark player-list hover',
);
assert(
  listEntryRootTag.includes("ShowRankRegisterPlayerListRowReady('players_list_manual_activate')"),
  'players list root activation must register manual row readiness',
);


const heroShop = fileText.get('topbar_rank/panorama/layout/citadel_hud_hero_shop.xml') || '';
for (const token of [
  'recent_purchases_redux_data.vjs_c', 'recent_purchases_redux.vjs_c',
  'citadel_hud_hero_shop.vcss_c', 'snippet name="RecentPurchase"',
  'RecentPurchasesPanel', 'RecentPurchaseHeroImage'
]) assert(heroShop.includes(token), 'hero shop XML missing recent purchase token: ' + token);
const recentData = fileText.get('topbar_rank/panorama/scripts/recent_purchases_redux_data.js') || '';
assert(recentData.includes('const MOD_ICONS = {'), 'recent purchase data missing MOD_ICONS');
assert(!recentData.includes('const HERO_IMAGES'), 'recent purchase data must not retain unused HERO_IMAGES');
assert(!recentData.includes('heroes/bull_sm_psd.vtex'), 'recent purchase data must not retain unused hero image table entries');
const recentPurchases = fileText.get('topbar_rank/panorama/scripts/recent_purchases_redux.js') || '';
for (const token of [
  'function ReadPurchaseRow(panel)',
  'function ReadPurchaseRows(container)',
  'FindFirstWithClassCached(panel, "__TopbarRankRecentPurchaseName", "recentModPurchaseName")',
  'var rows = ReadPurchaseRows(container);',
  'UpdateModIcons(container, rows);',
  'ApplyFilters(container, ctx, rows);',
  'UpdateQuickPurchases(container, rows);',
  'PruneSeenKeys(container, rows);',
  'var heroMapGeneration = 0;',
  'heroMapGeneration++;',
  'pendingState.generation !== heroMapGeneration',
  'playerPanel.SetDialogVariableInt("hero_id", heroId)',
  'FindChildrenWithClassTraverse("HeroNameHidden")',
]) assert(recentPurchases.includes(token), 'recent purchases missing row read-model token: ' + token);
for (const token of [
  'function GetPurchaseName(',
  'function GetPurchaseTime(',
  'function GetPurchaseHeroName('
]) assert(!recentPurchases.includes(token), 'recent purchases must not keep old row helper: ' + token);



const topbarCss = fileText.get('topbar_rank/panorama/styles/topbar_rank_topbar.css') || '';
for (const token of [
  '@import url("s2r://panorama/styles/objectives_map.vcss_c");',
  '@define backerWeaponT1',
  '@define backerVitalityT1',
  '@define backerSpiritT1',
  '.objDamageLabel',
  '.playerSPMDisplay',
  '.QuickPurchasesPanel',
  '.quickPurchaseName',
  '#BuffHUD',
  '#RejuvHUD',
  '#RejuvBuff',
  '#BuffImgHUD',
  '#RejuvImgHUD',
  '#UrnTracker',
  '.TopbarRankStatusImage.TopbarRankStatusVisible',
  '.TopbarRankStatusImage.TopbarRankStatusLoading',
  '.TopbarRankRankImage.TopbarRankRankVisible',
  '.TopbarRankTeamAverageRankImage.TopbarRankTeamAverageRankVisible',
  'ShowRankTopBarStatusImage.ShowRankTopBarStatusVisible',
  'ShowRankTopBarStatusImage.ShowRankTopBarStatusLoading',
  'ShowRankTopBarRankImage.ShowRankTopBarRankVisible',
  'ShowRankTeamAverageRankImage.ShowRankTeamAverageRankVisible',
  'ShowRankTopBarSpinnerSpin',
  'ShowRankTeamAverageLayer',
  'ShowRankTeamAverageFriendlyImage',
  'ShowRankTeamAverageEnemyImage',
  '#PauseIndicator',
  '#PauseIcon',
  '#RightSide .FriendsOrPlayersTabs',
  'TopbarRankTimerPill', 'TopbarRankPowerupHud', 'TopbarRankRejuvHud', 'TopbarRankTimerIcon',
  'TopbarRankTimerValue', 'TopbarRankTimerPhase', 'TopbarRankRejuvBuff', 'TopbarRankRejuvBuffTime',
  'UrnTrackerCard', 'UrnNetworthCard', 'UrnHudCard'
]) assert(topbarCss.includes(token), 'topbar CSS missing original/custom token: ' + token);
for (const token of [
  '.UrnHudCard.TopbarRankObjectiveRiftWarning',
  '.UrnHudCard.TopbarRankObjectiveRiftGood',
  '.UrnHudCard.TopbarRankObjectiveUrnSoon',
  '.UrnHudCard.TopbarRankObjectiveUrnHeld',
  '.UrnHudCard.TopbarRankObjectiveUrnDecay'
]) assert(topbarCss.includes(token), 'topbar CSS missing objective-state token: ' + token);
assert(topbarCss.includes('SpentSoulsValueContainer'), 'topbar CSS must style spent souls container');
assert(!topbarCss.includes('UnSoulsValueContainer'), 'topbar CSS must not keep unspent souls container');

assert(
  cssHasBlock(topbarCss, '.TopbarRankTeamAverageRankImage', [
    'horizontal-align: left',
    'margin-top: 0px',
    'z-index: 35'
  ]),
  'topbar CSS must keep TopbarRank team-average fallback positioning',
);
assert(
  cssHasBlock(topbarCss, '.TopbarRankTeamAverageRankImage.TopbarRankTeamAverageRankVisible', [
    'visibility: collapse',
    'opacity: 0'
  ]),
  'topbar CSS must collapse TopbarRank team-average visible class by default',
);
assert(
  cssHasBlock(topbarCss, '.ShowRankTeamAverageRankImage', [
    'horizontal-align: left',
    'margin-top: 0px',
    'z-index: 35'
  ]),
  'topbar CSS must keep ShowRank team-average fallback positioning',
);
assert(
  cssHasBlock(topbarCss, '.ShowRankTeamAverageRankImage.ShowRankTeamAverageRankVisible', [
    'visibility: collapse',
    'opacity: 0'
  ]),
  'topbar CSS must collapse ShowRank team-average visible class by default',
);
assert(
  topbarCss.includes('.wants_scoreboard .ShowRankTeamAverageRankImage') &&
    topbarCss.includes('.gScoreboardOpen .ShowRankTeamAverageRankImage') &&
    cssHasBlock(topbarCss, '.wants_scoreboard .ShowRankTeamAverageRankImage', [
      'width: 104px',
      'height: 68px',
      'margin-top: 0px'
    ]),
  'topbar CSS must size ShowRank team averages for scoreboard states',
);
assert(topbarCss.includes('#PauseIndicator Label'), 'topbar CSS must hide ShowRank pause label');
assert(!topbarCss.includes('.gDetailView .TopbarRankTeamAverageRankImage'), 'topbar CSS must not expose TopbarRank team averages in detail view');
assert(cssBlock(topbarCss, '.TeamScore .ScoreContainer').includes('z-index: 45'), 'topbar CSS must layer score containers above team averages');
assert(cssHasBlock(topbarCss, '.SoulsValueContainer', ['z-index: 0']), 'topbar CSS must keep souls values behind score/team-average overlays');

assert(cssBlock(topbarCss, '.TopbarRankTimerPill').includes('visibility: visible'), 'v40 timer pill CSS must explicitly stay visible over updated base CSS');
assert(cssBlock(topbarCss, '.UrnTrackerCard').includes('visibility: visible'), 'v40 urn card CSS must explicitly stay visible over updated base CSS');
const baseTopbarCss = fileText.get('topbar_rank/panorama/styles/topbar_rank_base/citadel_hud_top_bar.css') || '';
for (const token of [
  '@define kothScoreResultDisplayTime: 5.1;',
  '.connectedToHideout CitadelHudTopBar',
  '#KothCashInMeter',
  '#StretBrawlContainer'
]) assert(baseTopbarCss.includes(token), 'base topbar CSS missing current Valve token: ' + token);
for (const token of ['TopbarRankWarningYellow', '#RejuvHUD.buffWarningRed #RejuvTimeHUD']) {
  assert(!topbarCss.includes(token), 'topbar CSS contains orphaned/stale token: ' + token);
}

const listCss = fileText.get('topbar_rank/panorama/styles/topbar_rank_player_list.css') || '';
assert(listCss.includes('TopbarRankPlayerListRankImage.TopbarRankPlayerListRankVisible'), 'player list CSS must expose TopbarRank visible class');
assert(listCss.includes('TopbarRankPlayerNameRow'), 'player list CSS must expose TopbarRank player-name row class');
assert(listCss.includes('ShowRankPlayerListRankImage.ShowRankPlayerListRankVisible'), 'player list CSS must expose ShowRank visible class');
const profileCss = fileText.get('topbar_rank/panorama/styles/topbar_rank_profile_card.css') || '';
for (const token of [
  '#TopbarRankAccountLabel',
  'TopbarRankAccountIdRow',
  'TopbarRankProfileLink',
  'TopbarRankProfileRankSlot',
  'TopbarRankProfileLocalBadge',
  'TopbarRankProfileRankImage',
  '.ShowRankProfileCardRoot #AccountID',
  '.ShowRankProfileCardRoot #WebMediaDemoAccountLabel',
  '.ShowRankProfileCardRoot .HiddenAccountID',
  '.ShowRankProfileCardRoot .WebMediaDemoAccountIdRow',
  '.ShowRankProfileCardRoot .WebMediaDemoProfileLink',
  '.ShowRankProfileCardRoot .WebMediaDemoMediaSlot',
  '.ShowRankProfileCardRoot .WebMediaDemoLocalBadge',
  '.ShowRankProfileCardRoot .WebMediaDemoMedia'
]) assert(profileCss.includes(token), 'profile CSS must style TopbarRank/ShowRank profile token: ' + token);

const objectivesCss = fileText.get('topbar_rank/panorama/styles/objectives_map.css') || '';
assert(objectivesCss.includes('@import url("s2r://panorama/styles/topbar_rank_base/objectives_map.vcss_c");'), 'objectives_map.css missing base import');
assert(objectivesCss.includes('.LiveGame.ObjectiveCtn'), 'objectives_map.css missing direct LiveGame ObjectiveCtn visibility fix');
assert(objectivesCss.includes('#ObjectivesMap .ObjectiveCtn'), 'objectives_map.css missing scoped ObjectiveCtn visibility fix');
assert(objectivesCss.includes('z-index: 95'), 'objectives_map.css missing z-index 95');

if (failures.length) {
  console.error('Topbar Rank validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('OK: topbar_rank source invariants passed');
