#!/usr/bin/env node
'use strict';

// Derives showrank_barebones_no_missing/panorama from showrank_barebones/panorama by removing every
// "[no-missing: cut begin]" ... "[no-missing: cut end]" line range (markers included). The derived tree is
// committed because Show-rank-merger fetches it from GitHub raw URLs.
//   node scripts/showrank-barebones-editions.js           write the no-missing tree
//   node scripts/showrank-barebones-editions.js --check   fail if the committed tree is stale

const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'showrank_barebones', 'panorama');
const OUTPUT_ROOT = path.join(REPOSITORY_ROOT, 'showrank_barebones_no_missing', 'panorama');
const CUT_BEGIN = '[no-missing: cut begin]';
const CUT_END = '[no-missing: cut end]';

// Show-rank-merger's no_missing contract (src/topbarRankPayload.js): none of these may appear, case-insensitively.
const FORBIDDEN_MARKERS = {
  'scripts/showrank_barebones.js': [
    'ShowRankBarebonesMissing', 'MISSING_', 'missingSession', 'missingLeader', 'missingRunning', 'missingChecks',
    'missingNotification', 'missingRecords', 'missingHealth', 'missingWindow', 'missingActive', 'missingToast',
    'refreshMissing', 'scheduleMissing', 'setMissing', 'resetMissing', 'readMissing', 'parseGameClock', 'GameClock',
    'GameTime', 'gameClock', 'HealthVisible', 'HealthHidden'
  ],
  'layout/citadel_hud_top_bar_player.xml': ['ShowRankBarebonesMissing', 'MISSING'],
  'styles/showrank_barebones_topbar.css': ['ShowRankBarebonesMissing', 'MISSING', 'HealthVisible', 'HealthHidden']
};

function listFiles(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const child = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? listFiles(root, child) : [child];
  }).sort();
}

function cutRegions(text, label) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const kept = [];
  let open = 0;
  text.split(newline).forEach((line, index) => {
    if (line.includes(CUT_BEGIN)) {
      if (open) throw new Error(`${label}:${index + 1}: nested cut region`);
      open = index + 1;
    } else if (line.includes(CUT_END)) {
      if (!open) throw new Error(`${label}:${index + 1}: cut end without begin`);
      open = 0;
    } else if (!open) {
      kept.push(line);
    }
  });
  if (open) throw new Error(`${label}:${open}: cut region never ends`);
  return kept.join(newline);
}

function deriveNoMissing() {
  const files = new Map();
  for (const file of listFiles(SOURCE_ROOT)) {
    files.set(file, cutRegions(fs.readFileSync(path.join(SOURCE_ROOT, file), 'utf8'), `showrank_barebones/panorama/${file}`));
  }
  for (const [file, markers] of Object.entries(FORBIDDEN_MARKERS)) {
    const text = (files.get(file) || '').toLowerCase();
    if (!files.has(file)) throw new Error(`no-missing edition lacks ${file}`);
    for (const marker of markers) {
      if (text.includes(marker.toLowerCase())) throw new Error(`no-missing ${file} still contains "${marker}"; mark it with a cut region`);
    }
  }
  return files;
}

function staleFiles(files) {
  // Git may check either tree out with CRLF or LF, so line endings never count as staleness.
  const lf = (text) => text.replace(/\r\n/g, '\n');
  const existing = fs.existsSync(OUTPUT_ROOT) ? listFiles(OUTPUT_ROOT) : [];
  const stale = existing.filter((file) => !files.has(file));
  for (const [file, text] of files) {
    const target = path.join(OUTPUT_ROOT, file);
    if (!fs.existsSync(target) || lf(fs.readFileSync(target, 'utf8')) !== lf(text)) stale.push(file);
  }
  return stale.sort();
}

function main(argv) {
  const files = deriveNoMissing();
  if (argv.includes('--check')) {
    const stale = staleFiles(files);
    if (stale.length) {
      throw new Error(`showrank_barebones_no_missing/panorama is stale (${stale.join(', ')}); run node scripts/showrank-barebones-editions.js`);
    }
    return;
  }
  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  for (const [file, text] of files) {
    const target = path.join(OUTPUT_ROOT, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { cutRegions, deriveNoMissing, FORBIDDEN_MARKERS };
