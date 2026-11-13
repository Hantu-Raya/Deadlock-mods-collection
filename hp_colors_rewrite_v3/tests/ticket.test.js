'use strict';
// tools/ticket.js runs only against temp copies here (issues/ names, MAP.md, SPEC.md, settings/record.json).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tool = path.join(root, 'tools/ticket.js');
const { nextNumber, slugify, mapStub, specStub, ticketText } = require(tool);
const run = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
// The planning tickets were archived 2026-11-13; live issues/ holds only tickets made since.
const archivedIssues = path.join(root, '..', '_archive', 'hp_colors_rewrite_v3', 'issues');

// The issues/ tree (now archived plus new) when ticket.js was written (2026-11-12): 01-51, suffixed 22b/22c, and audit-* notes.
const SNAPSHOT = [
  ...Array.from({ length: 51 }, (_, index) => String(index + 1).padStart(2, '0') + '-ticket.md'),
  '22b-qollock-variant.md', '22c-preview-hero-model.md', 'audit-23-astra.md', 'audit-24-astra.md', 'audit-25-astra.md', 'audit-28-29-astra.md',
  'audit-claude-sol-2026-11-02.md', 'audit-full-astra-2026-10-15.md', 'audit-save-security-2026-11-02.md',
];

function tree(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-ticket-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'issues'));
  fs.mkdirSync(path.join(dir, 'settings'));
  for (const name of fs.readdirSync(archivedIssues)) fs.writeFileSync(path.join(dir, 'issues', name), '');
  for (const name of ['MAP.md', 'SPEC.md', 'settings/record.json']) fs.copyFileSync(path.join(root, name), path.join(dir, name));
  return dir;
}
const added = (before, after) => {
  const a = before.split('\n'), b = after.split('\n');
  assert.equal(b.length, a.length + 1, 'exactly one line added');
  const index = b.findIndex((line, i) => line !== a[i]);
  assert.deepEqual([...b.slice(0, index), ...b.slice(index + 1)], a, 'nothing else changed');
  return { index, line: b[index] };
};

test('ticket: numbering takes the highest numeric prefix + 1, counting 22b as 22 and skipping audit-*', () => {
  assert.equal(nextNumber(SNAPSHOT), 52, 'the tree this tool was written against picks 52');
  assert.equal(nextNumber(['09-a.md', '22b-x.md', 'audit-99-z.md', 'README.md']), 23);
  assert.equal(nextNumber(['audit-1.md']), 1);
  const liveDir = path.join(root, 'issues');
  const live = [...(fs.existsSync(liveDir) ? fs.readdirSync(liveDir) : []), ...fs.readdirSync(archivedIssues)];
  const highest = Math.max(...live.filter(name => /^\d+[a-z]?-/.test(name)).map(name => parseInt(name, 10)));
  assert.ok(highest >= 51 && nextNumber(live) === highest + 1, 'the live + archived trees pick ' + (highest + 1));
  assert.equal(slugify('HP percent: beside the number!'), 'hp-percent-beside-the-number');
  assert.ok(slugify('word '.repeat(40)).length <= 48);
});

test('ticket: new writes NN-slug.md from the 50/51 template with the project and one release-build box per lane', t => {
  const dir = tree(t);
  const before = { map: fs.readFileSync(path.join(dir, 'MAP.md'), 'utf8'), spec: fs.readFileSync(path.join(dir, 'SPEC.md'), 'utf8') };
  const expected = String(nextNumber(fs.readdirSync(path.join(dir, 'issues')))).padStart(2, '0');
  const result = run('new', '--root', dir, '--title', 'Kill feed colors', '--request', 'can you color the kill feed?|Discord, someone|2026-11-12', '--project', 'showrank');
  assert.equal(result.status, 0, result.stderr);
  const file = path.join(dir, 'issues', expected + '-kill-feed-colors.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, new RegExp('^# ' + expected + ': Kill feed colors\\n'));
  for (const heading of ['**What to build:**', '**Request (Discord, someone, 2026-11-12):** "can you color the kill feed?"', '**Status:**',
    '## Decisions', '## Known limits', '## Data flow and performance', '## Acceptance']) assert.ok(text.includes(heading), heading);
  assert.match(text, /\*\*Project:\*\* ShowRank variant \(`hp_colors_rewrite_v3_showrank`\); variant tickets live in `hp_colors_rewrite_v3\/issues`/);
  for (const project of ['v3', 'qollock', 'showrank']) {
    const build = 'node hp_colors_rewrite_v3/tools/build.js --project ' + project + ' --skip-deploy';
    assert.match(text, new RegExp('^- \\[ \\] .*release build \\(`' + build.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`\\)\\.$', 'm'));
  }
  assert.ok(!text.includes('\r'));
  assert.equal(fs.readFileSync(path.join(dir, 'MAP.md'), 'utf8'), before.map, 'no --map, MAP untouched');
  assert.equal(fs.readFileSync(path.join(dir, 'SPEC.md'), 'utf8'), before.spec, 'no --spec-after, SPEC untouched');
  const again = run('new', '--root', dir, '--title', 'Second', '--slug', 'second');
  assert.equal(again.status, 0, again.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'issues', String(Number(expected) + 1).padStart(2, '0') + '-second.md')));
  assert.match(fs.readFileSync(path.join(dir, 'issues', String(Number(expected) + 1).padStart(2, '0') + '-second.md'), 'utf8'), /\*\*Project:\*\* normal v3/);
  assert.equal(run('new', '--root', dir, '--title', 'x', '--project', 'thirdeye').status, 1);
  assert.equal(run('new', '--root', dir).status, 1);
});

test('ticket: --map adds an Added bullet in the top in-development section and --spec-after a lettered sub-story', t => {
  const dir = tree(t);
  const map = fs.readFileSync(path.join(dir, 'MAP.md'), 'utf8'), spec = fs.readFileSync(path.join(dir, 'SPEC.md'), 'utf8');
  const number = String(nextNumber(fs.readdirSync(path.join(dir, 'issues')))).padStart(2, '0');
  const preview = run('new', '--root', dir, '--title', 'Kill feed colors', '--map', '--spec-after', '22', '--dry-run');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Would write issues\/\d+-kill-feed-colors\.md/);
  assert.equal(fs.readdirSync(path.join(dir, 'issues')).length, fs.readdirSync(archivedIssues).length, '--dry-run writes no ticket');
  assert.equal(fs.readFileSync(path.join(dir, 'MAP.md'), 'utf8'), map);
  const result = run('new', '--root', dir, '--title', 'Kill feed colors', '--map', '--spec-after', '22', '--date', '2026-11-13');
  assert.equal(result.status, 0, result.stderr);
  const link = '[ticket ' + number + '](issues/' + number + '-kill-feed-colors.md)';
  const mapLines = map.split('\n');
  const changelog = mapLines.indexOf('## Changelog');
  const top = mapLines.findIndex((line, index) => index > changelog && line.startsWith('### '));
  const bullet = added(map, fs.readFileSync(path.join(dir, 'MAP.md'), 'utf8'));
  assert.ok(bullet.line.startsWith('- **Added:** *Kill feed colors*') && bullet.line.includes(link), bullet.line);
  if (/in development/.test(mapLines[top])) {
    const next = mapLines.findIndex((line, index) => index > top && /^#{2,3} /.test(line));
    assert.ok(bullet.index > top && bullet.index < next, 'inside the in-development section');
    const bullets = mapLines.map((line, index) => index > top && index < next && line.startsWith('- **Added:**') ? index : -1).filter(index => index >= 0);
    if (bullets.length) assert.equal(bullet.index, bullets.at(-1) + 1, 'right after the existing Added bullets');
  }
  const story = added(spec, fs.readFileSync(path.join(dir, 'SPEC.md'), 'utf8'));
  const subs = spec.split('\n').filter(line => /^22[a-z]?\. /.test(line));
  const letter = subs.map(line => /^22([a-z]?)\./.exec(line)[1]).sort().at(-1);
  const label = '22' + (letter ? String.fromCharCode(letter.charCodeAt(0) + 1) : 'a');
  assert.ok(story.line.startsWith(label + '. As a player, I want TODO (Kill feed colors)') && story.line.includes(link), story.line);
  assert.equal(spec.split('\n')[story.index - 1], subs.at(-1), 'right after story 22 and its sub-stories');
  assert.match(result.stdout, new RegExp('Wrote SPEC\\.md:' + (story.index + 1) + ': user story ' + label));
  assert.equal(run('new', '--root', dir, '--title', 'x', '--spec-after', '999').status, 1, 'unknown story refused');
});

test('ticket: MAP and SPEC stubs handle a missing in-development section, a shipped release and a first sub-story', () => {
  const map = '# Map\n\n## Changelog\n\nIntro.\n\n### 3.6.0 (2026-11-02, released)\n\n- **Added:** old.\n\n## Out of scope\n';
  const fresh = mapStub(map, { number: '52', file: '52-x.md', title: 'X', release: '3.7.0', date: '2026-11-13' });
  assert.equal(fresh.text, '# Map\n\n## Changelog\n\nIntro.\n\n### 3.7.0 (in development, 2026-11-13)\n\n- **Added:** *X* (TODO: page, slots, record version; request). See [ticket 52](issues/52-x.md).\n\n### 3.6.0 (2026-11-02, released)\n\n- **Added:** old.\n\n## Out of scope\n');
  const bumped = mapStub(map, { number: '52', file: '52-x.md', title: 'X', release: '3.6.0', date: '2026-11-13' });
  assert.match(bumped.text, /### 3\.7\.0 \(in development, 2026-11-13\)/);
  assert.match(bumped.bumped, /release should become 3\.7\.0/);
  const empty = mapStub('## Changelog\n\n### 3.7.0 (in development)\n\n### 3.6.0\n', { number: '52', file: '52-x.md', title: 'X', release: '3.7.0', date: '2026-11-13' });
  assert.equal(empty.text, '## Changelog\n\n### 3.7.0 (in development)\n\n- **Added:** *X* (TODO: page, slots, record version; request). See [ticket 52](issues/52-x.md).\n\n### 3.6.0\n');
  const crlf = mapStub(map.replace(/\n/g, '\r\n'), { number: '52', file: '52-x.md', title: 'X', release: '3.7.0', date: '2026-11-13' });
  assert.equal(crlf.text, fresh.text.replace(/\n/g, '\r\n'), 'keeps CRLF files CRLF');
  const spec = '## User Stories\n\n7. Seven.\n8. Eight.\n\n## Implementation Decisions\n';
  assert.equal(specStub(spec, '7', { number: '52', file: '52-x.md', title: 'X' }).text,
    '## User Stories\n\n7. Seven.\n7a. As a player, I want TODO (X), so that TODO ([ticket 52](issues/52-x.md)).\n8. Eight.\n\n## Implementation Decisions\n');
  assert.throws(() => specStub(spec, 'seven', { number: '52', file: '52-x.md', title: 'X' }), /story number/);
  assert.match(ticketText({ number: '52', title: 'X', project: 'qollock' }), /\*\*Project:\*\* QOLLOCK variant/);
});

test('ticket: numbers continue after the highest of live issues/ AND the archive, and issues/ is created on demand', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-ticket-both-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v3 = path.join(dir, 'v3'), archive = path.join(dir, '_archive', 'v3', 'issues');
  fs.mkdirSync(path.join(v3, 'settings'), { recursive: true });
  fs.mkdirSync(archive, { recursive: true });
  for (const name of ['MAP.md', 'SPEC.md', 'settings/record.json']) fs.copyFileSync(path.join(root, name), path.join(v3, name));
  for (const name of ['07-old.md', '22b-old.md', 'audit-99-x.md']) fs.writeFileSync(path.join(archive, name), '');
  // Only the archive has tickets, and v3/issues does not exist yet: the new ticket is 23, written to a new live folder.
  let result = run('new', '--title', 'First after archive', '--root', v3);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(v3, 'issues', '23-first-after-archive.md')));
  assert.deepEqual(fs.readdirSync(archive).sort(), ['07-old.md', '22b-old.md', 'audit-99-x.md'], 'the archive is never written');
  // The live folder is highest now; a higher archived number wins over it.
  fs.writeFileSync(path.join(archive, '40-newer-in-archive.md'), '');
  result = run('new', '--title', 'Second', '--root', v3);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(v3, 'issues', '41-second.md')));
  // A live number above the archive wins too.
  fs.writeFileSync(path.join(v3, 'issues', '60-live.md'), '');
  result = run('new', '--title', 'Third', '--root', v3);
  assert.ok(fs.existsSync(path.join(v3, 'issues', '61-third.md')), result.stderr);
  // --archive points at another archived folder, and a slug that exists in the archive is refused.
  const other = path.join(dir, 'other');
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, '99-x.md'), '');
  result = run('new', '--title', 'Fourth', '--root', v3, '--archive', other, '--dry-run');
  assert.match(result.stdout, /Would write issues\/100-fourth\.md/);
  assert.ok(!fs.existsSync(path.join(v3, 'issues', '100-fourth.md')), '--dry-run writes nothing');
});
