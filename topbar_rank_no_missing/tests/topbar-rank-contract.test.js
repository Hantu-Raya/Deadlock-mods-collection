'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALERT_EDITION = false;
const rootDir = path.join(__dirname, '..');
const panoramaDir = path.join(rootDir, 'panorama');
const layoutDir = path.join(panoramaDir, 'layout');
const scriptPath = path.join(panoramaDir, 'scripts', 'showrank_barebones.js');
const stylePath = path.join(panoramaDir, 'styles', 'showrank_barebones_topbar.css');
const repositoryDir = path.join(rootDir, '..');
const composition = require(path.join(repositoryDir, 'scripts', 'profile-stats-community-composition'));

const v40Assets = [
  'layout/citadel_hud_hero_shop.xml',
  'layout/citadel_hud_top_bar.xml',
  'layout/citadel_hud_top_bar_player.xml',
  'layout/hud_paused.xml',
  'scripts/recent_purchases_redux.js',
  'scripts/recent_purchases_redux_data.js',
  'scripts/rejuvnbufftimer.js',
  'scripts/unspent.js',
  'scripts/urntracker.js',
  'styles/citadel_hud_hero_shop.css',
  'styles/citadel_hud_top_bar.css',
  'styles/hero_testing_menu.css',
  'styles/hud.css',
  'styles/hud_damage_report.css',
  'styles/hud_paused.css',
  'styles/objectives_map.css',
];
const v40AssetHashes = {
  'layout/citadel_hud_hero_shop.xml': 'b4516fae9c7ce463621f837ec00612cf993ab2f775533fde1ade942b01e8d274',
  'layout/hud_paused.xml': '7cbb7f2f850768edf4a69847bc7d4d996c8e636a73e4e597995f7515a092e830',
  'scripts/recent_purchases_redux.js': 'f6b388db5165a9f82e222ffa30cdf54b7c9b676bfce898d423c8b6ad5e29320a',
  'scripts/recent_purchases_redux_data.js': 'ed9852528bc9c137d7e7fed52fb337f549b6507d3ba28c556ca682704cd72462',
  'scripts/rejuvnbufftimer.js': 'adb70a55e0c8def38a1c8720962dafd203ce544b0345357e3aeac9324585fd9f',
  'scripts/unspent.js': '2906493c121ecb284443dae6ac12dd92dc18a54f0433d24355e0a18fe6d69655',
  'scripts/urntracker.js': '631fb886fedfe849b6d302c098af3f1ac12c93173d898066ff5699cd5cb4842f',
  'styles/citadel_hud_hero_shop.css': '4f4015918aa5b52366289fe10983a69a045594fee0cf1fef97333683759eea95',
  'styles/citadel_hud_top_bar.css': '779877935e9d23ff7ee17fa4e085fc76c699e8d096e40b3f5e3dff3b2dcca0bf',
  'styles/hero_testing_menu.css': '10a2251a84682069631dae0125698d4d27d200b7866f1fa73fc95840e4266153',
  'styles/hud.css': '167f30659d4e44d66a70dadefc1c641fa7a1608eed1a01916aeed6f5fc9e8ee8',
  'styles/hud_damage_report.css': '58bad49d5554862ff55d1021988dec960d4d3c0c720884ca930ae5d2d20b4aa6',
  'styles/hud_paused.css': 'f24cdfbc67e0fe57f44d70aac839e2e27b6a968958658dea882dd717a38726df',
  'styles/objectives_map.css': '5431db8cea795449ba71ec564cf2c4501e4c77a153f434cec8581d3d82a2587a',
};
const expectedAssets = [
  ...v40Assets.filter((asset) => !['layout/citadel_hud_top_bar.xml', 'layout/citadel_hud_top_bar_player.xml'].includes(asset)),
  'layout/citadel_hud_top_bar.xml',
  'layout/citadel_hud_top_bar_player.xml',
  'layout/citadel_ui_context_menu_player.xml',
  'layout/hud_escape_menu.xml',
  'layout/players_list_entry.xml',
  'layout/profile_card.xml',
  'layout/citadel_db_page_profile.xml',
  'scripts/showrank_barebones.js',
  'styles/showrank_barebones_topbar.css',
].sort();

function sourceAssets(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? sourceAssets(path.join(directory, entry.name), relative) : [relative];
  });
}

function readLayout(name) {
  return fs.readFileSync(path.join(layoutDir, name), 'utf8');
}

function includes(xml, section) {
  const block = new RegExp(`<${section}>([\\s\\S]*?)<\\/${section}>`).exec(xml);
  assert.ok(block, `${section} block exists`);
  return [...block[1].matchAll(/<include\s+src="([^"]+)"\s*\/>/g)].map((match) => match[1]);
}

function assertIncludesBase(xml, section, expected, label) {
  const actual = includes(xml, section);
  for (const include of expected) assert.ok(actual.includes(include), `${label} preserves ${include}`);
}

function assertId(xml, id, label) {
  assert.match(xml, new RegExp(`\\bid="${id}"`), `${label} retains ${id}`);
}

assert.deepStrictEqual(sourceAssets(panoramaDir).sort(), expectedAssets, 'the edition packages exactly the sixteen V40D assets, five layout additions, barebones runtime, and style');
assert.strictEqual(expectedAssets.length, 23, 'the source inventory is exactly twenty-three assets');

for (const [asset, expectedHash] of Object.entries(v40AssetHashes)) {
  const actualHash = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(panoramaDir, asset)))
    .digest('hex');
  assert.strictEqual(actualHash, expectedHash, `${asset} remains the authoritative V40D asset`);
}

const topbar = readLayout('citadel_hud_top_bar.xml');
const player = readLayout('citadel_hud_top_bar_player.xml');
const profile = readLayout('profile_card.xml');
const profilePage = readLayout('citadel_db_page_profile.xml');
const contextMenu = readLayout('citadel_ui_context_menu_player.xml');
const escape = readLayout('hud_escape_menu.xml');
const playerList = readLayout('players_list_entry.xml');
const sourceTemplate = fs.readFileSync(scriptPath, 'utf8');
const styleTemplate = fs.readFileSync(stylePath, 'utf8');
const composed = composition.composeBarebonesSources(repositoryDir, rootDir);
const source = composed.runtime;
const style = composed.style;
const allEditionSource = [topbar, player, profile, profilePage, contextMenu, escape, playerList, sourceTemplate, styleTemplate].join('\n');
assert.strictEqual(sourceTemplate.split(composition.RUNTIME_PLACEHOLDER).length - 1, 1, 'the alert runtime host has one canonical comparison seam');
assert.strictEqual(sourceTemplate.split(composition.IDENTITY_POLICY_PLACEHOLDER).length - 1, 1, 'the alert runtime host has one private identity-policy seam');
assert.strictEqual(styleTemplate.split(composition.STYLE_PLACEHOLDER).length - 1, 1, 'the alert stylesheet host has one canonical composition seam');
assert.doesNotMatch(sourceTemplate, /PROFILE_STATS_COMMUNITY_MODULE_(?:START|END)|DLSTATS2:/, 'the alert runtime host does not retain a copied profile implementation');
assert.doesNotMatch(styleTemplate, /#ProfileStatsCommunityButton/, 'the alert stylesheet host does not retain copied profile styles');
assert.doesNotMatch(source, /PROFILE_STATS_COMMUNITY_RUNTIME:|VIEWED_PROFILE_IDENTITY_POLICY:/, 'composed no-missing runtime resolves both source seams');
assert.doesNotMatch(style, /PROFILE_STATS_COMMUNITY_STYLES:/, 'composed no-missing stylesheet resolves its source seam');
assert.ok(source.replace(/\r\n?/g, '\n').includes(composed.nestedProfileRuntime.replace(/\r\n?/g, '\n').trimEnd()), 'composed no-missing runtime contains the canonical profile implementation');
assert.ok(style.replace(/\r\n?/g, '\n').includes(composed.canonicalStyle.replace(/\r\n?/g, '\n').trimEnd()), 'composed no-missing stylesheet contains the canonical implementation');

assert.deepStrictEqual(includes(player, 'scripts'), [
  's2r://panorama/scripts/unspent.vjs_c',
  's2r://panorama/scripts/showrank_barebones.vjs_c',
], 'topbar player loads its native script and one barebones runtime');
for (const [xml, label] of [[escape, 'Escape menu'], [profile, 'profile card'], [profilePage, 'dashboard profile page']]) {
  assert.deepStrictEqual(includes(xml, 'scripts'), ['s2r://panorama/scripts/showrank_barebones.vjs_c'], `${label} loads one barebones runtime`);
}
assert.deepStrictEqual(includes(profile, 'styles'), [
  's2r://panorama/styles/citadel_base_styles.vcss_c',
  's2r://panorama/styles/profile_card.vcss_c',
  's2r://panorama/styles/showrank_barebones_topbar.vcss_c',
], 'profile card includes the shared barebones stylesheet after native styles');
assert.deepStrictEqual(includes(profilePage, 'styles'), [
  's2r://panorama/styles/citadel_base_styles.vcss_c',
  's2r://panorama/styles/citadel_db_page_shared.vcss_c',
  's2r://panorama/styles/citadel_db_page_profile.vcss_c',
  's2r://panorama/styles/showrank_barebones_topbar.vcss_c',
], 'dashboard profile page includes the shared barebones stylesheet after native styles');
assert.match(profilePage, /<CitadelProfilePage\b[^>]*\bclass="DashboardPage ShowRankBarebonesProfilePage"[^>]*\boncancel="CitadelNavigateBack\(\);?"[^>]*\bdashboardclass="isShowingProfilePage"/, 'dashboard profile page preserves native navigation and its barebones role');
for (const id of ['ShowRankBarebonesProfilePageAccount', 'ShowRankBarebonesProfilePageRankHost', 'ShowRankBarebonesProfilePageRankImage']) {
  assertId(profilePage, id, 'dashboard profile page');
}
assertId(profile, 'ProfileStatsCommunityContextAccount', 'profile comparison account witness');
assertId(profilePage, 'ProfileStatsCommunityAccount', 'dashboard comparison account witness');
assertId(profilePage, 'ProfileStatsCommunityButton', 'dashboard comparison action');
assertId(profilePage, 'ProfileStatsCommunityPanel', 'dashboard comparison panel');
assertId(profilePage, 'ProfileStatsCommunityBridge', 'dashboard comparison bridge');
assertId(contextMenu, 'ProfileStatsCommunityPlayerProfileRow', 'context Player Profile seam');
assert.match(style, /\.ShowRankBarebonesProfilePage #ProfileInfo\s*\{[\s\S]*?min-width:\s*190px;[\s\S]*?overflow:\s*noclip;/, 'dashboard profile identity block reserves the rank seam');
assert.match(style, /\.ShowRankBarebonesProfilePage #ShowRankBarebonesProfilePageRankHost\s*\{[\s\S]*?width:\s*90px;[\s\S]*?height:\s*70px;[\s\S]*?ignore-parent-flow:\s*true;/, 'dashboard profile rank host has the shared barebones footprint');
assert.match(style, /\.ShowRankBarebonesProfilePage #ForumButton\s*\{[\s\S]*?visibility:\s*collapse;/, 'dashboard profile hides the optional forum row');
assert.match(style, /\.ShowRankBarebonesProfileCard #ShowRankBarebonesRankImage\s*\{[\s\S]*?width:\s*88px;[\s\S]*?height:\s*66px;[\s\S]*?ignore-parent-flow:\s*true;/, 'profile card has the shared barebones rank footprint');
assert.match(source, /\/rank\/image\?format=" \+ RANK_IMAGE_FORMAT/, 'individual badges use the current rank-image endpoint');
assert.match(source, /\/rank\/image\?account_ids=" \+ accounts\.join\(","\) \+ "&format=" \+ RANK_IMAGE_FORMAT/, 'team averages use the current rank-image endpoint');
assert.doesNotMatch(source, /\/rank-predict\/image\?/, 'the runtime has no stale predicted-rank image endpoint');
assert.match(source, /function buildProfileRecord\(panel\)[\s\S]*?CitadelProfilePage/, 'the runtime handles profile-card and dashboard profile-page roles');
assert.match(source, /function buildRosterReadModel\(rows, topbarEvidence, completedRoster, cacheReplay\)/, 'one private roster read-model builder owns active and cache-replay facts');
assert.match(source, /function readRosterModel\(shared, preservedRows, completedRoster, cacheReplay\)/, 'one adapter read feeds the private roster model');
assert.match(source, /function classifyEscapeReadiness\(input\)/, 'one centralized Escape readiness interface owns lifecycle decisions');
assert.match(source, /ShowRankBarebonesOpenStatlocker[\s\S]*?ShowRankBarebonesCopyAccount/, 'profile roles retain their local public wrappers');
assert.match(source, /\$\.ShowRankBarebonesEscapeOpen[\s\S]*?\$\.ShowRankBarebonesEscapeOut/, 'Escape retains its public entry and exit wrappers');

assertIncludesBase(topbar, 'styles', [
  's2r://panorama/styles/citadel_base_styles.vcss_c',
  's2r://panorama/styles/hud_common.vcss_c',
  's2r://panorama/styles/citadel_hud_top_bar.vcss_c',
  's2r://panorama/styles/unit_status_icons.vcss_c',
], 'topbar root styles');
assertIncludesBase(topbar, 'scripts', [
  's2r://panorama/scripts/rejuvnbufftimer.vjs_c',
  's2r://panorama/scripts/urntracker.vjs_c',
], 'topbar root scripts');
assertIncludesBase(player, 'styles', [
  's2r://panorama/styles/citadel_base_styles.vcss_c',
  's2r://panorama/styles/hud_common.vcss_c',
  's2r://panorama/styles/citadel_hud_top_bar.vcss_c',
], 'topbar player styles');
assertIncludesBase(player, 'scripts', ['s2r://panorama/scripts/unspent.vjs_c'], 'topbar player scripts');
for (const id of [
  'GameTime', 'UrnTracker', 'UrnHUD', 'TeamFriendly', 'TeamEnemy', 'ObjectivesMap', 'RejuvenatorCharges', 'KothCashInMeter',
]) assertId(topbar, id, 'topbar root');
for (const id of [
  'PauseIndicator', 'PlayerDetailsContainer', 'HeroContents', 'HeroImageArea', 'HeroBadge', 'HeroHealth', 'StatusRow', 'PlayerNameNWContainer', 'ItemBarGraph', 'PlayerAbilitiesContainer', 'LaneSwapContainer',
]) assertId(player, id, 'topbar player');

for (const [xml, id, label] of [
  [profile, 'ShowRankBarebonesAccount', 'profile account witness'],
  [profile, 'ShowRankBarebonesRankImage', 'profile rank seam'],
  [contextMenu, 'ShowRankBarebonesStatlockerRow', 'context Statlocker seam'],
  [contextMenu, 'ShowRankBarebonesCopyAccountRow', 'context copy seam'],
  [topbar, 'ShowRankBarebonesAverageFriendlyImage', 'friendly team average seam'],
  [topbar, 'ShowRankBarebonesAverageEnemyImage', 'enemy team average seam'],
  [player, 'ShowRankBarebonesTopbarRankImage', 'topbar-player rank seam'],
  [playerList, 'ShowRankBarebonesRowHero', 'player-list identity seam'],
  [playerList, 'ShowRankBarebonesPlayerListRankImage', 'player-list rank seam'],
]) assertId(xml, id, label);
assert.match(player, /<Panel\b[^>]*\bid="HeroContents"[^>]*>[\s\S]*?ShowRankBarebonesTopbarRankImage[\s\S]*?\bid="HeroImageArea"/, 'rank image is merged into the native HeroContents seam');
assert.match(topbar, /ShowRankBarebonesTeamAverageLayer[\s\S]*?ShowRankBarebonesAverageFriendlyImage[\s\S]*?ShowRankBarebonesAverageEnemyImage/, 'team averages are merged into the native topbar root');

assert.match(escape, /<CitadelHudEscapeMenu\b[^>]*\boncancel="CitadelResumePlaying\(\)"/, 'Escape cancellation retains the native resume action');
assert.match(escape, /<Panel\b[^>]*\bid="EscapeBackground"[^>]*\bonactivate="CitadelResumePlaying\(\)"/, 'Escape backdrop retains the native resume action');
assert.match(escape, /<CitadelBindingButton\b[^>]*\bid="EscapeButton"[^>]*\baction="MenuBack"[^>]*\bonactivate="CitadelResumePlaying\(\)"/, 'native Escape binding remains intact');
assert.match(escape, /<TabButton\b[^>]*\bid="PlayersTab"/, 'native Players tab remains available to bounded probing');
assert.match(escape, /<TabContents\b[^>]*\bid="PlayersTabContents"[^>]*\btabid="PlayersTab"[\s\S]*?<CitadelPlayersList\b[^>]*\bid="PlayersList"/, 'native Players list remains under its tab');

assert.doesNotMatch(allEditionSource, /showrank_common\.js|topbar_rank_v40_hud\.js/i, 'the edition has no old ShowRank bridge or combined V40 HUD');
assert.doesNotMatch(allEditionSource, /\$\.Msg|BareRankTrace|diagnostic|debug/i, 'the release surface has no diagnostics');

if (ALERT_EDITION) {
  assertId(player, 'ShowRankBarebonesMissingIndicator', 'alert portrait label');
  assertId(topbar, 'ShowRankBarebonesNotificationRoot', 'alert notification root');
  assert.match(style, /ShowRankBarebonesMissingIndicator/, 'alert stylesheet owns the missing label');
  assert.match(style, /HeroImageArea[\s\S]*?wash-color/, 'alert stylesheet darkens the portrait through the native seam');
  assert.match(source, /MISSING_(?:WINDOW|TOAST|HERO_ICON)/, 'alert runtime retains bounded missing-window and announcement state');
  assert.match(source, /GameTime/, 'alert runtime polls the native clock for the missing window');
  assert.match(source, /ENEMY MISSING|MISSING_HERO_ICON/, 'alert runtime retains hero-icon announcements');
} else {
  assert.doesNotMatch(allEditionSource, /ShowRankBarebones(?:Missing|NotificationRoot)|MISSING_(?:WINDOW|TOAST|HERO_ICON)|ENEMY MISSING/, 'rank-only edition contains no missing labels, notification root, or hero-icon announcement state');
  assert.doesNotMatch(source, /FindChildTraverse\(["']GameTime["']\)|MISSING_WINDOW|MISSING_TOAST|HealthVisible|GenericAnnouncement/, 'rank-only runtime has no clock polling or alert subsystem');
  assert.doesNotMatch(style, /HeroImageArea[\s\S]{0,300}wash-color/, 'rank-only stylesheet has no portrait darkening rule');
}

console.log(ALERT_EDITION ? 'no-missing TopBarPlus rank contract tests passed' : 'rank-only TopBarPlus rank contract tests passed');
