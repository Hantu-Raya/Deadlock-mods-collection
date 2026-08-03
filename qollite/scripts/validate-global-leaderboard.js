'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
assert.match(layout, /ontextentrychange="FilterLeaderboardPlayers\(\)"/, 'global leaderboard must retain custom player search');
assert.match(layout, /panorama\/styles\/popups\/citadel_popup_global_leaderboard\.vcss_c/, 'global leaderboard must load the current base-game CSS');
assert.match(layout, /panorama\/styles\/leaderboard_search\.vcss_c/, 'global leaderboard must retain custom search CSS');
assert.deepEqual(baseStyle, pinnedBaseStyle, 'packaged base-game leaderboard CSS must match its pinned stock copy');
assert.match(customStyle, /\.searchContainer/, 'custom leaderboard search CSS must remain intact');

console.log('validate-global-leaderboard: ok');
