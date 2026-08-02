'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const panoramaDir = path.join(rootDir, 'panorama');
const layoutDir = path.join(panoramaDir, 'layout');
const scriptPath = path.join(panoramaDir, 'scripts', 'showrank_barebones.js');
const stylePath = path.join(panoramaDir, 'styles', 'showrank_barebones_topbar.css');
const source = fs.readFileSync(scriptPath, 'utf8');
const style = fs.readFileSync(stylePath, 'utf8');
const layouts = Object.fromEntries(
  ['profile_card.xml', 'citadel_ui_context_menu_player.xml', 'citadel_hud_top_bar.xml', 'citadel_hud_top_bar_player.xml', 'players_list_entry.xml', 'hud_escape_menu.xml']
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
  assert.deepStrictEqual(includes(scripts[1]), ['s2r://panorama/scripts/showrank_barebones.vjs_c'], `${name}: only local runtime hook`);
}

assert.deepStrictEqual(
  sourceAssets(panoramaDir).sort(),
  [
    'layout/citadel_hud_top_bar.xml',
    'layout/citadel_hud_top_bar_player.xml',
    'layout/citadel_ui_context_menu_player.xml',
    'layout/hud_escape_menu.xml',
    'layout/players_list_entry.xml',
    'layout/profile_card.xml',
    'scripts/showrank_barebones.js',
    'styles/showrank_barebones_topbar.css',
  ],
  'the feature ships exactly six layout assets, one runtime, and one topbar style',
);

for (const name of ['profile_card.xml', 'citadel_ui_context_menu_player.xml', 'citadel_hud_top_bar_player.xml', 'hud_escape_menu.xml']) assertRuntimeInclude(layouts[name], name);
assert.doesNotMatch(layouts['players_list_entry.xml'], /<scripts>/, 'the passive row binding does not load an unused role-local runtime');
assert.doesNotMatch(layouts['citadel_hud_top_bar.xml'], /<scripts>/, 'the passive topbar-root layer loads no second runtime context');

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
  ['s2r://panorama/styles/citadel_base_styles.vcss_c', 's2r://panorama/styles/profile_card.vcss_c'],
  'profile keeps its native style set',
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
assert.match(profile, /<Panel\b[^>]*\bid="AccountID"[^>]*>\s*<Label\b[^>]*class="AccountID"[^>]*text="#Citadel_ProfileCard_AccountID"[^>]*\/>\s*<\/Panel>/, 'the native account ID row remains intact');
assert.doesNotMatch(profile, /ShowRankBarebonesStatlockerProfile/, 'StatLocker is not injected into the profile-card XML');
assert.deepStrictEqual(attributes(tagWithId(profile, 'Image', 'ShowRankBarebonesRankImage')), {
  id: 'ShowRankBarebonesRankImage', visible: 'false', hittest: 'false', scaling: 'stretch-to-fit-preserve-aspect',
}, 'profile rank image has no input behavior');
assert.match(profile, /<Panel\b[^>]*\bid="CardOverlay"[^>]*>\s*<Panel\b[^>]*\bid="ProfileBadgeBackground"[^>]*\/>\s*<Image\b[^>]*\bid="ShowRankBarebonesRankImage"[^>]*\/>\s*<\/Panel>/, 'profile image remains directly over the native badge background');

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
assert.match(style, /\.ShowRankBarebonesTeamAverageLayer\s*\{[\s\S]*?width:\s*300px;[\s\S]*?margin-top:\s*118px;/, 'the local stylesheet positions the team-average layer');
assert.match(style, /\.gScoreboardOpen \.ShowRankBarebonesTeamAverageRankImage\.ShowRankBarebonesTeamAverageRankVisible\s*\{[\s\S]*?visibility:\s*visible;/, 'team averages appear only with the native scoreboard class');

const topbarRootLayout = layouts['citadel_hud_top_bar.xml'];
assert.deepStrictEqual(
  includes(/<styles>([\s\S]*?)<\/styles>/.exec(topbarRootLayout)[1]),
  [
    's2r://panorama/styles/citadel_base_styles.vcss_c',
    's2r://panorama/styles/hud_common.vcss_c',
    's2r://panorama/styles/citadel_hud_top_bar.vcss_c',
    's2r://panorama/styles/unit_status_icons.vcss_c',
    's2r://panorama/styles/showrank_barebones_topbar.vcss_c',
  ],
  'the topbar root adds only the shared barebones style after native styles',
);
assert.match(topbarRootLayout, /<\/Panel>\s*<Panel\b[^>]*\bid="ShowRankBarebonesTeamAverageLayer"[\s\S]*?<\/Panel>\s*<Panel\b[^>]*\bid="StretBrawlContainer"/, 'the average layer sits after TeamNetworth and before the native Street Brawl panel');
assert.deepStrictEqual(attributes(tagWithId(topbarRootLayout, 'Image', 'ShowRankBarebonesAverageFriendlyImage')), {
  id: 'ShowRankBarebonesAverageFriendlyImage', class: 'ShowRankBarebonesTeamAverageRankImage ShowRankBarebonesTeamAverageFriendlyImage ShowRankBarebonesTeamAverageRankVisible', scaling: 'stretch-to-fit-preserve-aspect', hittest: 'false',
}, 'friendly average image is inert');
assert.deepStrictEqual(attributes(tagWithId(topbarRootLayout, 'Image', 'ShowRankBarebonesAverageEnemyImage')), {
  id: 'ShowRankBarebonesAverageEnemyImage', class: 'ShowRankBarebonesTeamAverageRankImage ShowRankBarebonesTeamAverageEnemyImage ShowRankBarebonesTeamAverageRankVisible', scaling: 'stretch-to-fit-preserve-aspect', hittest: 'false',
}, 'enemy average image is inert');

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
}, 'row hero identity is directly bound without an account guess');
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
assert.strictEqual(attributes(contextRoot).class, 'PlayerMenuContents ShowRankBarebonesContextMenu', 'the context menu exposes only its local role marker');
assert.deepStrictEqual(
  includes(/<styles>([\s\S]*?)<\/styles>/.exec(contextMenu)[1]),
  ['s2r://panorama/styles/citadel_base_styles.vcss_c', 's2r://panorama/styles/citadel_ui_context_menu_player.vcss_c'],
  'the context menu keeps its native style set',
);
assert.match(contextMenu, /<Panel\b[^>]*\bid="ShowRankBarebonesStatlockerRow"[^>]*\bclass="MenuRow"[^>]*>\s*<TextButton\b[^>]*\bid="MenuButton"[^>]*\btext="Statlocker Profile"[^>]*\bonactivate="if \(\$\('#ProfileCard'\)\.ShowRankBarebonesOpenStatlocker\) \$\('#ProfileCard'\)\.ShowRankBarebonesOpenStatlocker\(\);"\s*\/>\s*<\/Panel>/, 'StatLocker calls the nested verified profile card directly');
assert.match(contextMenu, /<Panel\b[^>]*\bid="ShowRankBarebonesCopyAccountRow"[^>]*\bclass="MenuRow"[^>]*>\s*<TextButton\b[^>]*\bid="MenuButton"[^>]*\btext="Copy Account ID"[^>]*\bonactivate="if \(\$\('#ProfileCard'\)\.ShowRankBarebonesCopyAccount\) \$\('#ProfileCard'\)\.ShowRankBarebonesCopyAccount\(\);"\s*\/>\s*<\/Panel>/, 'Copy Account ID calls the nested verified profile card directly');
assert.doesNotMatch(contextMenu, /ShowRankBarebones(?:Statlocker|CopyAccount)Button/, 'context action buttons retain the native scoped ID');
assert.doesNotMatch(contextMenu, /Deadlock Profile|showrank_common|ShowRankContextMenu/, 'the barebones context menu adds no active-ShowRank actions');
assert.doesNotMatch(source, /\$\.Msg|BareRankTrace|ShowRankBarebonesTopbarRefresh/, 'release runtime contains no diagnostics or hover wrapper');
assert.match(source, /\$\.DispatchEvent\("ExternalBrowserGoToURL", url\)/, 'StatLocker uses the proven native external-browser event');
assert.doesNotMatch(source, /ExecuteSteamURL|SteamOverlayAPI/, 'StatLocker contains no unsupported Steam URL path');

const escape = layouts['hud_escape_menu.xml'];
const escapeRoot = openingTags(escape, 'CitadelHudEscapeMenu')[0];
assert.strictEqual(attributes(escapeRoot).oncancel, 'if ($.ShowRankBarebonesEscapeOut) $.ShowRankBarebonesEscapeOut(); CitadelResumePlaying()', 'Escape cancellation resets ShowRank state before retaining the native close action');
assert.strictEqual(attributes(escapeRoot).onload, 'if ($.ShowRankBarebonesEscapeOpen) $.ShowRankBarebonesEscapeOpen();', 'Escape opens only the local probe hook');
assert.strictEqual(attributes(escapeRoot).onmouseover, 'if ($.ShowRankBarebonesEscapeOpen) $.ShowRankBarebonesEscapeOpen();', 'Escape hover rechecks the HUD open class without polling');
assert.strictEqual(attributes(escapeRoot).onmouseout, 'if ($.ShowRankBarebonesEscapeOut) $.ShowRankBarebonesEscapeOut();', 'Escape exit resets the one-pass latch only after the HUD closes');
assert.strictEqual(attributes(tagWithId(escape, 'Panel', 'EscapeBackground')).onactivate, 'if ($.ShowRankBarebonesEscapeOut) $.ShowRankBarebonesEscapeOut(); CitadelResumePlaying()', 'Escape backdrop resets ShowRank state before retaining the native close action');
assert.deepStrictEqual(attributes(tagWithId(escape, 'CitadelBindingButton', 'EscapeButton')), {
  id: 'EscapeButton', action: 'MenuBack', onactivate: 'if ($.ShowRankBarebonesEscapeOut) $.ShowRankBarebonesEscapeOut(); CitadelResumePlaying()', text: '#menu_resume',
}, 'native Escape binding resets ShowRank state before retaining the native close action');
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

console.log('showrank barebones contract tests passed');
