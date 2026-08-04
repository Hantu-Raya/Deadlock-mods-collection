'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const layoutPath = path.join(
  __dirname,
  '..',
  'panorama',
  'layout',
  'popups',
  'citadel_popup_global_leaderboard.xml'
);
const layout = fs.readFileSync(layoutPath, 'utf8').replace(/^\uFEFF/, '');
const baseStylePath = path.join(__dirname, '..', 'panorama', 'styles', 'popups', 'citadel_popup_global_leaderboard.css');
const pinnedBaseStylePath = path.join(__dirname, '..', 'stock', 'styles', 'popups', 'citadel_popup_global_leaderboard.css');
const customStylePath = path.join(__dirname, '..', 'panorama', 'styles', 'leaderboard_search.css');
const baseStyle = fs.readFileSync(baseStylePath);
const pinnedBaseStyle = fs.readFileSync(pinnedBaseStylePath);
const customStyle = fs.readFileSync(customStylePath, 'utf8').replace(/^\uFEFF/, '');

assert.match(
  layout,
  /<snippet name="Hero">[\s\S]*?<Panel class="Hero">[\s\S]*?<CitadelHeroImage id="HeroImage" heroimagestyle="vertical" scaling="cover" \/>[\s\S]*?<\/snippet>/,
  'global leaderboard must provide the base-game Hero snippet'
);
assert.match(
  layout,
  /<snippet name="HeroCardSnippet">[\s\S]*?<CitadelHeroCard id="LeaderboardHeroCard" \/>[\s\S]*?<\/snippet>/,
  'global leaderboard must retain the custom hero-card snippet'
);
assert.match(layout, /<CitadelRankedBadgeMini id="RankedBadge" show_rank_tooltip="true" \/>/, 'global leaderboard must retain the custom rank badge');
assert.match(layout, /ontextentrychange="QolLiteLeaderboardFilterPlayers\(\)"/, 'global leaderboard must bind its exported custom player search callback');
assert.match(layout, /panorama\/styles\/popups\/citadel_popup_global_leaderboard\.vcss_c/, 'global leaderboard must load the current base-game CSS');
assert.match(layout, /panorama\/styles\/leaderboard_search\.vcss_c/, 'global leaderboard must retain custom search CSS');
assert.deepEqual(baseStyle, pinnedBaseStyle, 'packaged base-game leaderboard CSS must match its pinned stock copy');
assert.match(customStyle, /\.searchContainer/, 'custom leaderboard search CSS must remain intact');
assert.match(
  layout,
  /<Panel class="countryHeader LeftRightFlow">[\s\S]*?<Label class="heroLabel"[\s\S]*?<Image id="LeaderboardHeroIcon"/,
  'leaderboard heading must precede its optional hero icon'
);
assert.match(
  layout,
  /<Panel class="playerInfoContainer LeftRightFlow">[\s\S]*?<Label class="playerRatingLabel"[\s\S]*?<Label class="playerRatingName"[\s\S]*?<CitadelRankedBadgeMini id="RankedBadge"/,
  'player row must keep the rank badge after the player name'
);
assert.match(customStyle, /\.countryHeader \.heroIcon[\s\S]*?margin:\s*0px 0px 0px 12px/, 'hero icon must follow the aligned heading with a trailing gap');
assert.match(customStyle, /\.playerInfoContainer \.playerRatingName[\s\S]*?margin-left:\s*4px/, 'rank number and player name must use compact spacing');

const playerRows = ['Alice', 'Bob'].map((name) => ({
  visible: true,
  FindChildrenWithClassTraverse: () => [{ text: name }]
}));
const panels = {
  '#PlayerSearchInput': { text: 'ali' },
  '#PlayersContainer': {
    GetChildCount: () => playerRows.length,
    GetChild: (index) => playerRows[index]
  }
};
const runtime = {
  $: {
    FindChildInContext: (selector) => panels[selector] || null
  }
};
const runtimePath = path.join(__dirname, '..', 'panorama', 'scripts', 'qollite_leaderboard.js');
vm.runInNewContext(fs.readFileSync(runtimePath, 'utf8'), runtime, { filename: runtimePath });
assert.equal(typeof runtime.QolLiteLeaderboardFilterPlayers, 'function', 'leaderboard search callback must be globally callable by Panorama XML');
runtime.QolLiteLeaderboardFilterPlayers();
assert.equal(playerRows[0].visible, true, 'search callback must retain matching players');
assert.equal(playerRows[1].visible, false, 'search callback must hide non-matching players');

console.log('validate-global-leaderboard: ok');
