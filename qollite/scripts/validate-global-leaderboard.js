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

console.log('validate-global-leaderboard: ok');
