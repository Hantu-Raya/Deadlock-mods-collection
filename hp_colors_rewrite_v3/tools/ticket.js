#!/usr/bin/env node
'use strict';
// Starts a ticket in issues/ (v3's folder holds the QOLLOCK and ShowRank variant tickets too, e.g. 22b and
// 34), numbered after the highest numeric prefix (audit-* files are not tickets; 22b counts as 22), from a
// template modelled on issues/50-kill-bounty.md and issues/51-hp-percent.md. Optional stubs:
//   --map             an **Added:** bullet under MAP.md's top in-development `### x.y.z` changelog section
//                     (created from settings/record.json's release when there is none)
//   --spec-after <n>  a lettered sub-story (7a., 7b., ...) after SPEC.md user story n and its sub-stories
//
//   node tools/ticket.js new --title "Kill feed colors" [--slug kill-feed-colors]
//     [--request "quote|Discord, someone|2026-11-12"] [--project v3|qollock|showrank] [--map] [--spec-after 15]
//     [--date YYYY-MM-DD] [--dry-run] [--root <v3 tree>]
const fs = require('node:fs');
const path = require('node:path');
const cli = require('./lib/cli');
const { localDate } = cli;
const { LANES } = require('./lib/projects');

const V3_ROOT = path.resolve(__dirname, '..');
// Lane labels, folders and build commands come from the shared lane table.
const PROJECTS = Object.fromEntries(Object.values(LANES).map(lane => [lane.key, { label: lane.ticketLabel, dir: lane.dir, build: lane.build }]));
const USAGE = `Usage: node tools/ticket.js new --title "..." [--slug <kebab>] [--request "quote|who|date"]
  [--project ${cli.projectChoices({ all: false })}] [--map] [--spec-after <story number>] [--date YYYY-MM-DD] [--dry-run] [--root <v3 tree>]`;
const ARGS = {
  options: {
    '--title': { key: 'title', value: true }, '--slug': { key: 'slug', value: true }, '--request': { key: 'request', value: true },
    '--project': { key: 'project', value: true }, '--spec-after': { key: 'spec-after', value: true }, '--date': { key: 'date', value: true },
    '--root': { key: 'root', value: true },
    '--map': { key: 'map' }, '--dry-run': { key: 'dry-run' }, '--help': { key: 'help' },
  },
  command: true,
  once: true,
  flagValues: true,
  messages: { bare: arg => 'Unexpected argument: ' + arg, unknown: (arg, name) => 'Unknown option ' + name },
};

function parseArgs(argv) {
  return cli.parse(argv, ARGS);
}

// Highest numeric prefix + 1 over `NN-…md` / `NNx-…md`; audit-* and other names are ignored.
function nextNumber(names) {
  let highest = 0;
  for (const name of names) {
    const match = /^(\d+)[a-z]?-.*\.md$/i.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}
const pad = number => String(number).padStart(2, '0');
function slugify(title) {
  const words = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let slug = '';
  for (const word of words) {
    if (slug && (slug + '-' + word).length > 48) break;
    slug = slug ? slug + '-' + word : word;
  }
  return slug.slice(0, 48);
}
const eolOf = text => (text.includes('\r\n') ? '\r\n' : '\n');

function parseRequest(text) {
  const parts = String(text).split('|').map(part => part.trim());
  if (parts.length > 3 || !parts[0]) throw new Error('--request expects "quote|who|date"');
  const [quote, who, date] = parts;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--request date must be YYYY-MM-DD, got ' + date);
  const source = [who, date].filter(Boolean).join(', ');
  return '**Request' + (source ? ' (' + source + ')' : '') + ':** "' + quote.replace(/^"|"$/g, '') + '"';
}

function ticketText({ number, title, project, request }) {
  const lane = PROJECTS[project];
  const projectLine = project === 'v3'
    ? '**Project:** normal v3 (`hp_colors_rewrite_v3`); every menu or schema change also reaches QOLLOCK and ShowRank.'
    : '**Project:** ' + lane.label + ' (`' + lane.dir + '`); variant tickets live in `hp_colors_rewrite_v3/issues`. A ' + lane.label.split(' ')[0] +
      '-only behavior goes behind a seam its composer adds; check that the other lanes are unchanged.';
  return [
    '# ' + number + ': ' + title,
    '',
    '**What to build:** TODO.',
    '',
    request ? parseRequest(request) : '**Request:** TODO (quote, who, date).',
    '',
    projectLine,
    '',
    '**Status:** open; not started.',
    '',
    '## Decisions',
    '',
    '- **Setting:** TODO (page, card, level, side; slots and record version from `tools/new-setting.js`).',
    '- **NEW tab:** TODO (item id and release, or none).',
    '',
    '## Known limits',
    '',
    '- TODO.',
    '',
    '## Data flow and performance',
    '',
    '- TODO: new reads/writes per paint, counted per-bar ceilings, menu validity budgets (syncAll, bootChrome), save size.',
    '',
    '## Acceptance',
    '',
    '- [ ] TODO: behavior covered by focused tests (renderer, preview, codec as needed).',
    '- [ ] Counted per-bar ceilings hold (`tools/budgets.js --compare` against a `--save` taken before the change; deltas recorded here).',
    '- [ ] Generators current; QOLLOCK and ShowRank layouts recomposed (`tools/doctor.js`), `tools/engine-facts.js --check` clean, `tools/test.js --all` green.',
    ...Object.values(PROJECTS).map(entry => '- [ ] ' + entry.label[0].toUpperCase() + entry.label.slice(1) + ' release build (`' + entry.build + '`).'),
    '- [ ] In game: TODO, and a console check for `Parsing error`, `FATAL` and `Uncaught` (`tools/logscan.js` exits 0; installed pak hash recorded).',
    '',
  ].join('\n');
}

// MAP.md: the first `### ` heading after `## Changelog` is the in-development one when it says so.
function mapStub(text, { number, file, title, release, date }) {
  const eol = eolOf(text), lines = text.split(eol);
  const changelog = lines.findIndex(line => /^## Changelog\s*$/.test(line));
  if (changelog < 0) throw new Error('MAP.md has no "## Changelog" section');
  let end = lines.findIndex((line, index) => index > changelog && /^## /.test(line));
  if (end < 0) end = lines.length;
  const firstVersion = lines.findIndex((line, index) => index > changelog && index < end && /^### /.test(line));
  const bullet = '- **Added:** *' + title + '* (TODO: page, slots, record version; request). See [ticket ' + number + '](issues/' + file + ').';
  if (firstVersion >= 0 && /in development/i.test(lines[firstVersion])) {
    let sectionEnd = lines.findIndex((line, index) => index > firstVersion && /^#{2,3} /.test(line));
    if (sectionEnd < 0) sectionEnd = lines.length;
    let at = -1;
    for (let index = firstVersion + 1; index < sectionEnd; index++) if (/^- \*\*Added:\*\*/.test(lines[index])) at = index;
    if (at < 0) at = firstVersion + 1 < lines.length && lines[firstVersion + 1] === '' ? firstVersion + 1 : firstVersion;
    lines.splice(at + 1, 0, bullet);
    if (/^#/.test(lines[at + 2] || '')) lines.splice(at + 2, 0, '');
    return { text: lines.join(eol), line: at + 2, heading: lines[firstVersion], created: false };
  }
  // No in-development section: start one for record.json's release, or the next minor when that release already has a section.
  let version = release;
  const shipped = lines.some((line, index) => index > changelog && index < end && line.startsWith('### ' + release + ' '));
  if (shipped) { const [major, minor] = release.split('.').map(Number); version = major + '.' + (minor + 1) + '.0'; }
  const heading = '### ' + version + ' (in development, ' + date + ')';
  const at = firstVersion >= 0 ? firstVersion : end;
  lines.splice(at, 0, heading, '', bullet, '');
  return { text: lines.join(eol), line: at + 3, heading, created: true, bumped: shipped ? release + ' already has a changelog section; settings/record.json release should become ' + version : null };
}

// SPEC.md: story n and its lettered sub-stories are lines `n.`/`na.` under `## User Stories`.
function specStub(text, after, { number, file, title }) {
  const story = String(after).trim();
  if (!/^\d+$/.test(story)) throw new Error('--spec-after expects a story number, got ' + after);
  const eol = eolOf(text), lines = text.split(eol);
  const start = lines.findIndex(line => /^## User Stories\s*$/.test(line));
  if (start < 0) throw new Error('SPEC.md has no "## User Stories" section');
  let end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  if (end < 0) end = lines.length;
  const pattern = new RegExp('^' + story + '([a-z]?)\\. ');
  let last = -1, letter = '';
  for (let index = start + 1; index < end; index++) {
    const match = pattern.exec(lines[index]);
    if (match) { last = index; if (match[1] > letter) letter = match[1]; }
  }
  if (last < 0) throw new Error('SPEC.md has no user story ' + story + '.');
  const next = letter ? String.fromCharCode(letter.charCodeAt(0) + 1) : 'a';
  if (next > 'z') throw new Error('SPEC.md story ' + story + ' has no letters left');
  const stub = story + next + '. As a player, I want TODO (' + title + '), so that TODO ([ticket ' + number + '](issues/' + file + ')).';
  lines.splice(last + 1, 0, stub);
  return { text: lines.join(eol), line: last + 2, label: story + next };
}

function create(opts, root = V3_ROOT) {
  const title = String(opts.title || '').trim();
  if (!title) throw new Error('--title is required');
  const project = opts.project || 'v3';
  if (!cli.project(project, { all: false })) throw new Error('--project must be ' + cli.projectWords({ all: false }));
  const slug = opts.slug !== undefined ? String(opts.slug).trim() : slugify(title);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error('--slug must be kebab-case, got ' + slug);
  const date = opts.date || localDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date must be YYYY-MM-DD');
  const issues = path.join(root, 'issues');
  if (!fs.existsSync(issues)) throw new Error('Missing ' + issues);
  const names = fs.readdirSync(issues);
  const number = pad(nextNumber(names));
  const file = number + '-' + slug + '.md';
  if (names.includes(file)) throw new Error(file + ' already exists');
  const writes = [{ file: path.join(issues, file), text: ticketText({ number, title, project, request: opts.request }), note: 'ticket ' + number + ' (' + PROJECTS[project].label + ')' }];
  if (opts.map) {
    const mapFile = path.join(root, 'MAP.md');
    const record = JSON.parse(fs.readFileSync(path.join(root, 'settings/record.json'), 'utf8'));
    const result = mapStub(fs.readFileSync(mapFile, 'utf8'), { number, file, title, release: record.release, date });
    writes.push({ file: mapFile, text: result.text, line: result.line, note: (result.created ? 'new section "' + result.heading + '", ' : '') + 'Added bullet' + (result.bumped ? '; NOTE: ' + result.bumped : '') });
  }
  if (opts['spec-after'] !== undefined) {
    const specFile = path.join(root, 'SPEC.md');
    const result = specStub(fs.readFileSync(specFile, 'utf8'), opts['spec-after'], { number, file, title });
    writes.push({ file: specFile, text: result.text, line: result.line, note: 'user story ' + result.label + '.' });
  }
  return { number, file, writes };
}

function main(argv, out = console.log) {
  const opts = parseArgs(argv);
  if (opts.help || opts.command === '--help' || opts.command === 'help') { out(USAGE); return 0; }
  if (opts.command !== 'new') throw new Error(USAGE);
  const root = path.resolve(opts.root || V3_ROOT);
  const result = create(opts, root);
  const rel = file => path.relative(root, file).replace(/\\/g, '/');
  for (const write of result.writes) {
    if (opts['dry-run']) {
      out('Would write ' + rel(write.file) + (write.line ? ':' + write.line : '') + ': ' + write.note);
      if (!write.line) out(write.text.trimEnd().replace(/^/gm, '  | '));
      else out('  | ' + write.text.split(/\r?\n/)[write.line - 1]);
    } else {
      fs.writeFileSync(write.file, write.text, { encoding: 'utf8', flag: write.line ? 'w' : 'wx' });
      out('Wrote ' + rel(write.file) + (write.line ? ':' + write.line : '') + ': ' + write.note);
    }
  }
  return 0;
}

module.exports = { main, parseArgs, nextNumber, slugify, ticketText, mapStub, specStub, create, V3_ROOT };
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error('ticket: ' + error.message); process.exitCode = 1; }
}
