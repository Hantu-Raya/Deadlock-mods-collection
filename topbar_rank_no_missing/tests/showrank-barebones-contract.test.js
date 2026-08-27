'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const repositoryDir = path.join(rootDir, '..');
const composition = require(path.join(repositoryDir, 'scripts', 'profile-stats-community-composition'));
const panoramaDir = path.join(rootDir, 'panorama');
const layoutDir = path.join(panoramaDir, 'layout');
const scriptPath = path.join(panoramaDir, 'scripts', 'showrank_barebones.js');
const stylePath = path.join(panoramaDir, 'styles', 'showrank_barebones_topbar.css');
const sourceTemplate = fs.readFileSync(scriptPath, 'utf8');
const styleTemplate = fs.readFileSync(stylePath, 'utf8');
const composed = composition.composeBarebonesSources(repositoryDir, rootDir);
const source = composed.runtime;
const style = composed.style;
const showRankStyle = styleTemplate;
const layouts = Object.fromEntries(
  ['profile_card.xml', 'citadel_db_page_profile.xml', 'citadel_ui_context_menu_player.xml', 'citadel_hud_top_bar.xml', 'citadel_hud_top_bar_player.xml', 'players_list_entry.xml', 'hud_escape_menu.xml']
    .map((name) => [name, fs.readFileSync(path.join(layoutDir, name), 'utf8')]),
);

function sourceAssets(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? sourceAssets(path.join(directory, entry.name), relative) : [relative];
  });
}

function openingTags(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([A-Za-z_:][A-Za-z0-9_:.:-]*)="([^"]*)"/g)) {
    assert.ok(!Object.prototype.hasOwnProperty.call(result, match[1]), `duplicate ${match[1]} attribute`);
    result[match[1]] = match[2];
  }
  return result;
}

function tagWithId(xml, name, id) {
  const matches = openingTags(xml, name).filter((tag) => attributes(tag).id === id);
  assert.strictEqual(matches.length, 1, `${id} is one ${name}`);
  return matches[0];
}

function countId(xml, id) {
  return openingTags(xml, '[A-Za-z][A-Za-z0-9]*').filter((tag) => attributes(tag).id === id).length;
}

function includes(xml) {
  return [...xml.matchAll(/<include\s+src="([^"]+)"\s*\/>/g)].map((match) => match[1]);
}

function assertRuntimeInclude(xml, name) {
  const scripts = /<scripts>([\s\S]*?)<\/scripts>/.exec(xml);
  assert.ok(scripts, `${name}: script block exists`);
  assert.deepStrictEqual(
    includes(scripts[1]),
    ['s2r://panorama/scripts/showrank_barebones.vjs_c'],
    `${name}: loads only the local runtime hook`,
  );
}

assert.deepStrictEqual(
  sourceAssets(panoramaDir).sort(),
  [
    'layout/citadel_db_page_profile.xml',
    'layout/citadel_hud_top_bar.xml',
    'layout/citadel_hud_top_bar_player.xml',
    'layout/citadel_ui_context_menu_player.xml',
    'layout/hud_escape_menu.xml',
    'layout/players_list_entry.xml',
    'layout/profile_card.xml',
    'scripts/showrank_barebones.js',
    'styles/showrank_barebones_topbar.css',
  ],
  'the no-missing feature ships exactly seven layout assets, one runtime, and one shared stylesheet',
);
assert.strictEqual(sourceTemplate.split(composition.RUNTIME_PLACEHOLDER).length - 1, 1, 'the runtime host has one canonical comparison seam');
assert.strictEqual(sourceTemplate.split(composition.IDENTITY_POLICY_PLACEHOLDER).length - 1, 1, 'the runtime host has one private identity-policy seam');
assert.strictEqual(styleTemplate.split(composition.STYLE_PLACEHOLDER).length - 1, 1, 'the stylesheet host has one canonical composition seam');
assert.doesNotMatch(sourceTemplate, /PROFILE_STATS_COMMUNITY_MODULE_(?:START|END)|DLSTATS2:/, 'the runtime host does not retain a copied profile implementation');
assert.doesNotMatch(styleTemplate, /#ProfileStatsCommunityButton/, 'the stylesheet host does not retain copied profile styles');
assert.doesNotMatch(source, /PROFILE_STATS_COMMUNITY_RUNTIME:|VIEWED_PROFILE_IDENTITY_POLICY:/, 'composed runtime resolves both source seams');
assert.doesNotMatch(style, /PROFILE_STATS_COMMUNITY_STYLES:/, 'composed stylesheet resolves its source seam');
assert.strictEqual((source.match(/var viewedProfileIdentityPolicy/g) || []).length, 1, 'the composed runtime owns one private identity-policy instance');
assert.ok(source.replace(/\r\n?/g, '\n').includes(composed.nestedProfileRuntime.replace(/\r\n?/g, '\n').trimEnd()), 'composed runtime contains the canonical profile implementation');
assert.ok(style.replace(/\r\n?/g, '\n').includes(composed.canonicalStyle.replace(/\r\n?/g, '\n').trimEnd()), 'composed stylesheet contains the canonical implementation');
assert.doesNotMatch(composed.identityPolicy, /PlayerName|HeroName|SelfName|topbar/i, 'names and Passive top-bar evidence are not identity-policy inputs');
assert.match(sourceTemplate, /function canonicalAccountOrNull\(value\)\s*\{\s*return viewedProfileIdentityPolicy\.canonicalAccount\(value\) \|\| null;\s*\}/, 'cache and roster validation delegates to the shared canonical-account rule');
assert.doesNotMatch(sourceTemplate, /function normalize(?:Account|Identity)\(/, 'the barebones host has no second account normalization implementation');
assert.match(sourceTemplate, /function buildRosterReadModel\(rows, topbarEvidence, completedRoster, cacheReplay\)/, 'one private roster read-model builder owns active and cache-replay facts');
assert.match(sourceTemplate, /function readRosterModel\(shared, preservedRows, completedRoster, cacheReplay\)/, 'one adapter read feeds the private roster model');
assert.doesNotMatch(sourceTemplate, /session\.(?:rows|accountByHero)|function (?:readEscapeRoster|indexRosterRows|appendRosterWrite)\(/, 'Escape callers own no parallel roster rows, account map, or duplicate index');
const readinessStart = sourceTemplate.indexOf('function escapeReadinessDecision');
const readinessEnd = sourceTemplate.indexOf('function snapshotProfiles', readinessStart);
assert.ok(readinessStart >= 0 && readinessEnd > readinessStart, 'one private Escape readiness module sits between roster facts and Panorama adapters');
const readinessModule = sourceTemplate.slice(readinessStart, readinessEnd);
assert.match(readinessModule, /function classifyEscapeReadiness\(input\)/, 'the readiness module exposes one decision interface');
for (const field of ['mayStartPreload', 'mayProbeRows', 'mayShowSpinner', 'shouldReplayCache', 'shouldScheduleRetry', 'shouldFinish', 'shouldStop']) {
  assert.match(readinessModule, new RegExp(`\\b${field}\\b`), `the readiness decision owns ${field}`);
}
assert.doesNotMatch(readinessModule, /\$\.|findChild|findByClass|isValid|schedule(?:Escape)?\(|DispatchEvent|setRankImage|setTeamAverageImage|clearTeamAverages|closePlayerCards/, 'the readiness module has no Panorama traversal or side effects');
assert.doesNotMatch(sourceTemplate, /attempt >= ESCAPE_ROW_DELAYS\.length \|\| roster\.probes\.length/, 'Escape adapters no longer reinterpret roster readiness or retry limits');


assert.match(source, /RANK_API_BASE_URL = "https:\/\/api\.deadlock-api\.com\/v1\/players"/, 'the runtime owns the canonical API base');
assert.match(source, /RANK_IMAGE_FORMAT = "webp"/, 'the runtime owns the canonical image format');
assert.match(source, /function rankImageUrl\(account\)/, 'the runtime exposes the policy-free rank URL helper');
assert.match(source, /function teamAverageImageUrl\(accounts\)/, 'the runtime exposes the policy-free average URL helper');
assert.doesNotMatch(source, /RANK_IMAGE_API_BASE_URL|buildRankImageUrl|buildTeamAverageImageUrl/, 'old private URL symbols stay removed');

for (const name of ['profile_card.xml', 'citadel_db_page_profile.xml', 'citadel_hud_top_bar_player.xml', 'hud_escape_menu.xml']) assertRuntimeInclude(layouts[name], name);
for (const name of ['players_list_entry.xml', 'citadel_ui_context_menu_player.xml', 'citadel_hud_top_bar.xml']) {
  assert.doesNotMatch(layouts[name], /<scripts>/, `${name}: unhandled or passive root does not load the runtime`);
}

const profile = layouts['profile_card.xml'];
assert.strictEqual(openingTags(profile, 'CitadelProfileCard').length, 1, 'one profile-card root');
const profileRoot = openingTags(profile, 'CitadelProfileCard')[0];
assert.strictEqual(
  attributes(profileRoot).onmouseover,
  'if ($.GetContextPanel().ShowRankBarebonesRefresh) $.GetContextPanel().ShowRankBarebonesRefresh();',
  'reused profile cards use their own local refresh hook',
);
assert.strictEqual(attributes(profileRoot).class, 'ShowRankBarebonesProfileCard', 'profile cards are discoverable from the shared HUD tree');
assert.deepStrictEqual(
  includes(/<styles>([\s\S]*?)<\/styles>/.exec(profile)[1]),
  ['s2r://panorama/styles/citadel_base_styles.vcss_c', 's2r://panorama/styles/profile_card.vcss_c', 's2r://panorama/styles/showrank_barebones_topbar.vcss_c'],
  'profile adds the shared Barebones rank stylesheet after its native styles',
);
for (const id of [
  'MiniProfileContainer', 'ContentsMain', 'ContentsMainBackground', 'ContentsMainForeground', 'AccountID', 'HeroInfo',
  'HeroImage', 'CardHeader', 'AccountArea', 'AvatarImage', 'UserName', 'UserNickname', 'UserRichPresence', 'CardMain',
  'CardLoading', 'CardContents', 'Showcase', 'ShowcaseItems', 'BottomRow', 'StatItems', 'PartyInfo',
  'InMatchmakingBanner', 'InviteBanner', 'NotReadyBanner', 'ReadyBanner', 'RosterSection', 'RosterList',
  'CardOverlay', 'ProfileBadgeBackground',
]) assert.strictEqual(countId(profile, id), 1, `profile native id ${id} remains unique`);
assert.deepStrictEqual(attributes(tagWithId(profile, 'Label', 'ShowRankBarebonesAccount')), {
  id: 'ShowRankBarebonesAccount', text: '{i:r:account_id}', visible: 'false', hittest: 'false',
}, 'profile account witness is inert and data-bound');
assert.deepStrictEqual(attributes(tagWithId(profile, 'Label', 'ProfileStatsCommunityContextAccount')), {
  id: 'ProfileStatsCommunityContextAccount', text: '{i:r:account_id}', visible: 'false', hittest: 'false',
}, 'the selected-player context witness remains inert and data-bound');
assert.match(profile, /<Panel\b[^>]*\bid="ShowcaseItems"[^>]*\/>/, 'the engine remains the owner of profile-card showcase items');
assert.match(profile, /<Panel\b[^>]*\bid="StatItems"[^>]*\/>/, 'the engine remains the owner of profile-card statistics');
assert.match(style, /CitadelContextMenuPlayer CitadelProfileCard\.StatsActive:not\(\.ShowPartyInfo\) #CardMain\s*\{[\s\S]*?visibility:\s*visible;/, 'native context-card statistics appear only when the engine applies StatsActive');
assert.doesNotMatch(tagWithId(profile, 'Panel', 'AccountID'), /\bonload=/, 'the native account ID row remains unmodified');
assert.doesNotMatch(profile, /ShowRankBarebonesStatlockerProfile/, 'StatLocker is not injected into the profile-card XML');
assert.deepStrictEqual(attributes(tagWithId(profile, 'Image', 'ShowRankBarebonesRankImage')), {
  id: 'ShowRankBarebonesRankImage', visible: 'false', hittest: 'false', scaling: 'stretch-to-fit-preserve-aspect',
}, 'profile rank image has no input behavior');
assert.match(profile, /<Panel\b[^>]*\bid="CardOverlay"[^>]*>\s*<Panel\b[^>]*\bid="ProfileBadgeBackground"[^>]*\/>\s*<Image\b[^>]*\bid="ShowRankBarebonesRankImage"[^>]*\/>\s*<\/Panel>/, 'profile image remains directly over the native badge background');
assert.match(style, /\.ShowRankBarebonesProfileCard #ShowRankBarebonesRankImage\s*\{[\s\S]*?width:\s*88px;[\s\S]*?height:\s*66px;[\s\S]*?horizontal-align:\s*right;[\s\S]*?margin-top:\s*32px;[\s\S]*?margin-right:\s*-2px;[\s\S]*?ignore-parent-flow:\s*true;/, 'profile rank image uses the shared 4:3 profile-badge footprint');
assert.match(style, /CitadelTooltipProfileCard \.ShowRankBarebonesProfileCard #ShowRankBarebonesRankImage\s*\{[\s\S]*?width:\s*68px;[\s\S]*?height:\s*51px;[\s\S]*?margin-top:\s*0px;[\s\S]*?pre-transform-scale2d:\s*1;[\s\S]*?overflow:\s*noclip;/, 'tooltip rank fits completely inside the shortest observed 52-pixel profile header');
assert.match(style, /CitadelContextMenuPlayer \.ShowRankBarebonesProfileCard #ShowRankBarebonesRankImage\s*\{[\s\S]*?width:\s*68px;[\s\S]*?height:\s*51px;[\s\S]*?margin-top:\s*0px;[\s\S]*?margin-right:\s*8px;[\s\S]*?pre-transform-scale2d:\s*1;/, 'context-menu profile rank shares the contained popup footprint');

const profilePage = layouts['citadel_db_page_profile.xml'];
assert.strictEqual(openingTags(profilePage, 'CitadelProfilePage').length, 1, 'one dashboard profile-page root');
const profilePageRoot = openingTags(profilePage, 'CitadelProfilePage')[0];
assert.deepStrictEqual(
  attributes(profilePageRoot),
  {
    class: 'DashboardPage ShowRankBarebonesProfilePage',
    oncancel: 'CitadelNavigateBack();',
    dashboardclass: 'isShowingProfilePage',
    onmouseover: 'if ($.GetContextPanel().ShowRankBarebonesRefresh) $.GetContextPanel().ShowRankBarebonesRefresh();',
  },
  'the dashboard profile page retains its native navigation contract and local refresh seam',
);
assert.deepStrictEqual(
  includes(/<styles>([\s\S]*?)<\/styles>/.exec(profilePage)[1]),
  [
    's2r://panorama/styles/citadel_base_styles.vcss_c',
    's2r://panorama/styles/citadel_db_page_shared.vcss_c',
    's2r://panorama/styles/citadel_db_page_profile.vcss_c',
    's2r://panorama/styles/showrank_barebones_topbar.vcss_c',
  ],
  'the dashboard page adds the shared barebones stylesheet after its native dashboard styles',
);
assert.deepStrictEqual(attributes(tagWithId(profilePage, 'Label', 'ShowRankBarebonesProfilePageAccount')), {
  id: 'ShowRankBarebonesProfilePageAccount', text: '{i:r:account_id}', visible: 'false', hittest: 'false',
}, 'the dashboard page exposes only an inert direct account witness');
assert.deepStrictEqual(attributes(tagWithId(profilePage, 'Panel', 'ShowRankBarebonesProfilePageRankHost')), {
  id: 'ShowRankBarebonesProfilePageRankHost', hittest: 'false',
}, 'the dashboard page rank host cannot intercept native input');
assert.deepStrictEqual(attributes(tagWithId(profilePage, 'Image', 'ShowRankBarebonesProfilePageRankImage')), {
  id: 'ShowRankBarebonesProfilePageRankImage', visible: 'false', hittest: 'false', scaling: 'stretch-to-fit-preserve-aspect',
}, 'the dashboard page rank image is inert');
assert.match(profilePage, /<Button\b[^>]*\bid="ForumButton"[^>]*>[\s\S]*?<\/Button>\s*<Label\b[^>]*\bid="ShowRankBarebonesProfilePageAccount"[^>]*\/>\s*<Panel\b[^>]*\bid="ShowRankBarebonesProfilePageRankHost"[^>]*>\s*<Image\b[^>]*\bid="ShowRankBarebonesProfilePageRankImage"[^>]*\/>\s*<\/Panel>/, 'the page rank witness and badge follow the native forum button inside ProfileInfo');
assert.match(style, /\.ShowRankBarebonesProfilePage #ProfileInfo\s*\{[\s\S]*?min-width:\s*190px;[\s\S]*?overflow:\s*noclip;/, 'the profile identity block allows the adjacent rank to extend into the reserved gap');
assert.match(style, /\.ShowRankBarebonesProfilePage #ShowRankBarebonesProfilePageRankHost\s*\{[\s\S]*?width:\s*90px;[\s\S]*?height:\s*70px;[\s\S]*?margin-left:\s*200px;[\s\S]*?margin-top:\s*-10px;[\s\S]*?ignore-parent-flow:\s*true;/, 'the dashboard rank occupies the marked gap beside Steam identity text');
assert.match(style, /\.ShowRankBarebonesProfilePage #ForumButton\s*\{[\s\S]*?visibility:\s*collapse;/, 'the optional forum row stays hidden so the identity header remains compact');
assert.match(style, /\.ShowRankBarebonesProfilePage #ShowRankBarebonesProfilePageRankImage\s*\{[\s\S]*?width:\s*88px;[\s\S]*?height:\s*66px;[\s\S]*?horizontal-align:\s*center;[\s\S]*?vertical-align:\s*center;/, 'the dashboard page rank image uses the shared 4:3 profile-badge footprint');
assert.deepStrictEqual(attributes(tagWithId(profilePage, 'Label', 'ProfileStatsCommunityAccount')), {
  id: 'ProfileStatsCommunityAccount', text: '{i:r:account_id}', visible: 'false', hittest: 'false',
}, 'community comparison keeps a separate viewed-profile witness');
assert.match(profilePage, /<Panel\b[^>]*\bid="HeroList"[^>]*\/>\s*<Button\b[^>]*\bid="ProfileStatsCommunityButton"/, 'the community action is a sibling after the stock-owned hero list');
assert.strictEqual(countId(profilePage, 'ProfileStatsCommunityPanel'), 1, 'the profile page owns one comparison panel');
assert.strictEqual(countId(profilePage, 'ProfileStatsCommunityBridge'), 1, 'the profile page owns one hidden comparison bridge');
assert.strictEqual(countId(profilePage, 'ProfileStatsCommunitySupporterTicker'), 1, 'the profile page owns one hidden supporter ticker');
for (const id of [
  'ProfileStatsCommunityGroupPerformance',
  'ProfileStatsCommunityGroupScoreboard',
  'ProfileStatsCommunityGroupAccuracyKd',
  'ProfileStatsCommunityGroupDamage',
  'ProfileStatsCommunityGroupEconomy',
  'ProfileStatsCommunityGroupHealing',
]) assert.strictEqual(countId(profilePage, id), 1, `community group ${id} remains unique`);
assert.match(style, /CitadelProfilePage #HeroList\s*\{[\s\S]*?padding-top:\s*56px;/, 'the canonical profile-page rule offsets native hero rows below the comparison action');
assert.match(source, /function installProfileStatsCommunity\(\)/, 'the dominant runtime owns the profile comparison subsystem');
assert.match(source, /DLSTATS2:/, 'the dominant runtime retains the community bridge protocol');
assert.doesNotMatch(profilePage, /profile_stats_community\.vjs_c/, 'the profile page does not load a second runtime');

const topbar = layouts['citadel_hud_top_bar_player.xml'];
assert.strictEqual(openingTags(topbar, 'CitadelHudTopBarPlayer').length, 1, 'one topbar-player root');
assert.strictEqual(
  attributes(openingTags(topbar, 'CitadelHudTopBarPlayer')[0]).onmouseover,
  undefined,
  'the topbar root has no diagnostic hover hook',
);
assert.strictEqual(
  attributes(openingTags(topbar, 'CitadelHudTopBarPlayer')[0]).class,
  'ShowRankBarebonesTopbarPlayer',
  'topbar slots are discoverable from the shared HUD tree',
);
assert.deepStrictEqual(
  includes(/<styles>([\s\S]*?)<\/styles>/.exec(topbar)[1]),
  [
    's2r://panorama/styles/citadel_base_styles.vcss_c',
    's2r://panorama/styles/hud_common.vcss_c',
    's2r://panorama/styles/citadel_hud_top_bar.vcss_c',
    's2r://panorama/styles/showrank_barebones_topbar.vcss_c',
  ],
  'topbar adds exactly its local style after native styles',
);
assert.doesNotMatch(topbar, /ShowRankBarebonesTopbarHero/, 'the topbar adds no duplicate hero-name label');
assert.match(topbar, /<Label\b[^>]*class="HeroName"[^>]*text="\{s:hero_name\}"[^>]*\/>/, 'the native expanded-topbar hero label is the sole hero witness');
assert.deepStrictEqual(attributes(tagWithId(topbar, 'Image', 'ShowRankBarebonesTopbarRankImage')), {
  id: 'ShowRankBarebonesTopbarRankImage', visible: 'false', hittest: 'false', scaling: 'stretch-to-fit-preserve-aspect',
}, 'topbar rank image is inert');
assert.match(topbar, /<Panel\b[^>]*\bid="HeroContents"[^>]*>[\s\S]*?<Panel\b[^>]*class="SoulsValueContainer"[^>]*>[\s\S]*?<\/Panel>\s*<Image\b[^>]*\bid="ShowRankBarebonesTopbarRankImage"[^>]*\/>\s*<Panel\b[^>]*\bid="HeroImageArea"/, 'topbar image uses the always-visible native HeroContents overlay seam');
assert.match(style, /CitadelHudTopBarPlayer #ShowRankBarebonesTopbarRankImage\s*\{[\s\S]*?width:\s*48px;[\s\S]*?height:\s*31px;[\s\S]*?margin-top:\s*62px;[\s\S]*?z-index:\s*60;/, 'the local stylesheet sizes the per-player rank image');
const topbarRootLayout = layouts['citadel_hud_top_bar.xml'];
assert.deepStrictEqual(attributes(tagWithId(topbarRootLayout, 'Label', 'GameTime')), {
  class: 'GameTime', id: 'GameTime', text: '{s:game_clock}',
}, 'the topbar keeps the native GameTime child while the runtime does not poll it');
assert.deepStrictEqual(
  includes(/<styles>([\s\S]*?)<\/styles>/.exec(topbarRootLayout)[1]),
  [
    's2r://panorama/styles/citadel_base_styles.vcss_c',
    's2r://panorama/styles/hud_common.vcss_c',
    's2r://panorama/styles/citadel_hud_top_bar.vcss_c',
    's2r://panorama/styles/unit_status_icons.vcss_c',
    's2r://panorama/styles/showrank_barebones_topbar.vcss_c',
  ],
  'the no-missing topbar root keeps native styles plus the shared local style',
);
assert.doesNotMatch(topbarRootLayout, /ShowRankBarebonesNotificationRoot|citadel_hud_game_announcements\.vcss_c/, 'the no-missing topbar root has no announcement panel or stylesheet');
const noMissingArtifacts = `${topbarRootLayout}\n${topbar}\n${style}\n${source}`;
for (const forbidden of [
  /ShowRankBarebonesMissing/,
  /\bENEMY MISSING\b|\bMISSING\b/,
  /GenericAnnouncement|AnnouncementTitle|ShowRankBarebonesToast/,
  /HealthVisible/,
]) assert.doesNotMatch(noMissingArtifacts, forbidden, `no-alert variant omits missing-lane behavior: ${forbidden}`);
assert.match(style, /\.ShowRankBarebonesTeamAverageLayer\s*\{[\s\S]*?width:\s*300px;[\s\S]*?margin-top:\s*118px;/, 'the local stylesheet positions the team-average layer');
assert.match(style, /\.gScoreboardOpen \.ShowRankBarebonesTeamAverageRankImage\.ShowRankBarebonesTeamAverageRankVisible\s*\{[\s\S]*?visibility:\s*visible;/, 'team averages appear only with the native scoreboard class');

const row = layouts['players_list_entry.xml'];
assert.strictEqual(openingTags(row, 'CitadelPlayersListEntry').length, 1, 'one players-list row root');
assert.strictEqual(
  attributes(openingTags(row, 'CitadelPlayersListEntry')[0]).class,
  'ShowRankBarebonesPlayerRow',
  'player rows are discoverable from the shared HUD tree',
);
assert.deepStrictEqual(
  includes(/<styles>([\s\S]*?)<\/styles>/.exec(row)[1]),
  [
    's2r://panorama/styles/citadel_base_styles.vcss_c',
    's2r://panorama/styles/players_list_entry.vcss_c',
    's2r://panorama/styles/showrank_barebones_topbar.vcss_c',
  ],
  'player rows reuse the compiled barebones HUD style without loading a script',
);
assert.deepStrictEqual(attributes(tagWithId(row, 'Label', 'ShowRankBarebonesRowHero')), {
  id: 'ShowRankBarebonesRowHero', text: '{g:citadel_hero_name:hero_id}', visible: 'false', hittest: 'false',
  style: 'visibility: collapse; width: 0px; height: 0px;',
}, 'row hero identity is directly bound but fully collapsed from the visible layout');
assert.deepStrictEqual(attributes(tagWithId(row, 'Image', 'ShowRankBarebonesPlayerListRankImage')), {
  id: 'ShowRankBarebonesPlayerListRankImage', class: 'ShowRankBarebonesPlayerListRankImage',
  scaling: 'stretch-to-fit-preserve-aspect', visible: 'false', hittest: 'false',
}, 'player-list rank image is inert');
assert.match(row, /<Panel\b[^>]*\bid="MainContents"[^>]*>[\s\S]*?<Label\b[^>]*\bid="ShowRankBarebonesRowHero"[^>]*\/>\s*<\/Panel>/, 'row hero binding remains within activatable MainContents');
assert.match(row, /<Label\b[^>]*class="PlayerHero"[^>]*text="#Citadel_Player_Level_HeroLevel"[^>]*\/>/, 'the native Players-list detail label remains intact');
assert.match(row, /<Button\b[^>]*class="MuteButton ToggleMuteButton"[^>]*onactivate="CitadelPlayerListEntrySetMuted\( true \)"[^>]*\/>/, 'native mute behavior remains intact');
assert.match(row, /<Button\b[^>]*class="UnmuteButton ToggleMuteButton"[^>]*onactivate="CitadelPlayerListEntrySetMuted\( false \)"[^>]*\/>/, 'native unmute behavior remains intact');
assert.match(style, /CitadelPlayersListEntry \.ShowRankBarebonesPlayerListRankImage\s*\{[\s\S]*?width:\s*72px;[\s\S]*?height:\s*47px;[\s\S]*?horizontal-align:\s*right;[\s\S]*?margin-right:\s*12px;/, 'the shared HUD stylesheet positions the player-list rank');

const contextMenu = layouts['citadel_ui_context_menu_player.xml'];
const contextRoot = openingTags(contextMenu, 'CitadelContextMenuPlayer')[0];
assert.strictEqual(openingTags(contextMenu, 'CitadelContextMenuPlayer').length, 1, 'one player context-menu root');
assert.strictEqual(attributes(contextRoot).class, 'PlayerMenuContents', 'the context menu carries no unused role marker');
assert.deepStrictEqual(
  includes(/<styles>([\s\S]*?)<\/styles>/.exec(contextMenu)[1]),
  ['s2r://panorama/styles/citadel_base_styles.vcss_c', 's2r://panorama/styles/citadel_ui_context_menu_player.vcss_c'],
  'the context menu keeps its native style set',
);
assert.match(contextMenu, /<Panel\b[^>]*\bid="ShowRankBarebonesStatlockerRow"[^>]*\bclass="MenuRow"[^>]*>\s*<TextButton\b[^>]*\bid="MenuButton"[^>]*\btext="Statlocker Profile"[^>]*\bonactivate="if \(\$\('#ProfileCard'\)\.ShowRankBarebonesOpenStatlocker\) \$\('#ProfileCard'\)\.ShowRankBarebonesOpenStatlocker\(\);"\s*\/>\s*<\/Panel>/, 'StatLocker calls the nested verified profile card directly');
assert.match(contextMenu, /<Panel\b[^>]*\bid="ShowRankBarebonesCopyAccountRow"[^>]*\bclass="MenuRow"[^>]*>\s*<TextButton\b[^>]*\bid="MenuButton"[^>]*\btext="Copy Account ID"[^>]*\bonactivate="if \(\$\('#ProfileCard'\)\.ShowRankBarebonesCopyAccount\) \$\('#ProfileCard'\)\.ShowRankBarebonesCopyAccount\(\);"\s*\/>\s*<\/Panel>/, 'Copy Account ID calls the nested verified profile card directly');
assert.match(contextMenu, /<\/Panel>\s*<Panel\b[^>]*\bid="ProfileStatsCommunityPlayerProfileRow"[^>]*\bclass="MenuRow"[^>]*>\s*<TextButton\b[^>]*\bid="MenuButton"[^>]*\btext="Player Profile"[^>]*\bonactivate="if \(\$\('#ProfileCard'\)\.ShowRankBarebonesOpenPlayerProfile\) \$\('#ProfileCard'\)\.ShowRankBarebonesOpenPlayerProfile\(\);"\s*\/>\s*<\/Panel>\s*<\/Panel>/, 'Player Profile follows the stock options panel and calls the nested verified card');
assert.doesNotMatch(contextMenu, /<scripts>|profile_stats_community_context_menu/, 'the context menu does not load a second runtime');
assert.doesNotMatch(contextMenu, /ShowRankBarebones(?:Statlocker|CopyAccount)Button/, 'context action buttons retain the native scoped ID');
assert.doesNotMatch(contextMenu, /Deadlock Profile|showrank_common|ShowRankContextMenu/, 'the barebones context menu adds no active-ShowRank actions');
const activationDispatches = [...source.matchAll(/\$\.DispatchEvent\s*\(\s*"Activated"\s*,\s*([^)]*)\)/g)];
assert.strictEqual(activationDispatches.length, 2, 'one tab activation and one row activation are the only panel dispatches');
assert.deepStrictEqual(activationDispatches.map((match) => match[1].trim()), ['record.mainContents, "mouse"', 'playersTab'], 'rows use verified mouse activation while the Players tab keeps native activation');
assert.match(source, /root\.ShowRankBarebonesOpenStatlocker\s*=\s*function/, 'profile role installs the XML-facing StatLocker action');
assert.match(source, /root\.ShowRankBarebonesOpenPlayerProfile\s*=\s*function/, 'profile role installs the XML-facing Player Profile action');
assert.match(source, /root\.ShowRankBarebonesCopyAccount\s*=\s*function/, 'profile role installs the XML-facing account-copy action');
assert.doesNotMatch(source, /SetPanelEvent\("onactivate"/, 'context actions do not depend on lifecycle-sensitive programmatic handlers');
assert.strictEqual((source.match(/\$\.DispatchEvent\("DismissAllContextMenus"\)/g) || []).length, 1, 'one final player-card dismissal exists');
assert.strictEqual((source.match(/\$\.DispatchEvent\("DropInputFocus"\)/g) || []).length, 1, 'the final cleanup releases profile-card input focus');
assert.match(source, /\$\.DispatchEvent\("ExternalBrowserGoToURL", url\)/, 'StatLocker uses the proven native external-browser event');
assert.doesNotMatch(source, /ExecuteSteamURL|SteamOverlayAPI/, 'StatLocker contains no unsupported Steam URL path');
assert.match(source, /\$\.DispatchEvent\("CopyStringToClipboard", account, account\)/, 'Copy Account ID uses Panorama clipboard text payloads');
assert.match(source, /\$\.DispatchEvent\("CitadelShowProfilePageForAccount", Number\(account\)\)/, 'Player Profile dispatches the native selected-account event with a numeric SteamID3');
assert.strictEqual((source.match(/\$\.Schedule\s*\(/g) || []).length, 4, 'one ShowRank scheduler plus three profile-comparison lifecycle schedules are explicit');
assert.strictEqual((source.match(/\$\.RegisterEventHandler\s*\(/g) || []).length, 1, 'one profile bridge registration seam owns the two allowlisted HTML events');
assert.doesNotMatch(source, /\$\.RegisterForUnhandledEvent\b|\b(?:Subscribe|Unsubscribe)\s*\(/, 'the merged runtime has no unhandled or generic subscriptions');
assert.doesNotMatch(source, /\$\.Msg|BareRankTrace|ShowRankBarebonesTopbarRefresh/, 'obsolete overlay paths and diagnostics are absent');
assert.doesNotMatch(source, /\b(?:XMLHttpRequest|fetch|WebSocket|AsyncWebRequest|WebRequest)\b/, 'no direct network API');
assert.doesNotMatch(source, /\b(?:GameUI|Players|Entities|SteamFriends|DOTAPlayerIDs|GetHudRoot|GetTopmostPopup)\b|\$\.GetContextPanel\s*\([^)]*,/, 'no cross-context engine traversal');
assert.doesNotMatch(source, /\b(?:ShowRankCommon|ShowRankTrigger|ShowRankOpenStatlocker|ShowRankProbe|WebMediaDemo|diagnostic|debug)\b/i, 'no old bridge or diagnostics');
assert.doesNotMatch(source, /\$\.__showrank_barebones_state_v1/, 'state is never shared through context-local $');

const escape = layouts['hud_escape_menu.xml'];
const escapeRoot = openingTags(escape, 'CitadelHudEscapeMenu')[0];
assert.strictEqual(attributes(escapeRoot).oncancel, 'CitadelResumePlaying()', 'Escape cancellation preserves the native action exactly');
assert.strictEqual(attributes(escapeRoot).onload, 'if ($.ShowRankBarebonesEscapeOpen) $.ShowRankBarebonesEscapeOpen();', 'Escape opens only the local probe hook');
assert.strictEqual(attributes(escapeRoot).onmouseover, 'if ($.ShowRankBarebonesEscapeOpen) $.ShowRankBarebonesEscapeOpen();', 'Escape hover rechecks the HUD open class without polling');
assert.strictEqual(attributes(escapeRoot).onmouseout, 'if ($.ShowRankBarebonesEscapeOut) $.ShowRankBarebonesEscapeOut();', 'Escape exit resets the one-pass latch only after the HUD closes');
assert.strictEqual(attributes(tagWithId(escape, 'Panel', 'EscapeBackground')).onactivate, 'CitadelResumePlaying()', 'Escape backdrop preserves the native close action exactly');
assert.deepStrictEqual(attributes(tagWithId(escape, 'CitadelBindingButton', 'EscapeButton')), {
  id: 'EscapeButton', action: 'MenuBack', onactivate: 'CitadelResumePlaying()', text: '#menu_resume',
}, 'native Escape binding preserves the native close action exactly');
assert.deepStrictEqual(attributes(tagWithId(escape, 'TabButton', 'PlayersTab')), {
  id: 'PlayersTab', class: 'FriendsOrPlayersButton', group: 'people_list_tabs', text: '#Citadel_Players_WindowTitle',
}, 'the native Players tab remains the activation target');
assert.match(escape, /<TabContents\b[^>]*\bid="PlayersTabContents"[^>]*\btabid="PlayersTab"[^>]*>\s*<CitadelPlayersList\b[^>]*\bid="PlayersList"[^>]*\/>\s*<\/TabContents>/, 'Players tab still contains the native player list');

for (const forbidden of [
  /showrank_common/i,
  /ShowRank(?:Common|Trigger|OpenStatlocker|Probe|ProfileCardRoot)/,
  /WebMediaDemo/i,
  /diagnostic|debug/i,
  /\b(?:GetHudRoot|GetTopmostPopup|GameUI|Players|Entities)\b/,
]) assert.doesNotMatch(`${source}\n${Object.values(layouts).join('\n')}`, forbidden, `legacy or cross-context capability: ${forbidden}`);

console.log('showrank barebones no-missing contract tests passed');
