'use strict';
// tools/new-setting.js runs only against temp copies here: settings/ is copied into a temp tree, the
// generator writes its outputs there (--settings/--record-contract/--news/--output-root), and the
// QOLLOCK/ShowRank composers are stubs beside it. The real settings files are never written.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tool = path.join(root, 'tools/new-setting.js');
const { inline, recordText, diff, kebab } = require(tool);
const real = name => fs.readFileSync(path.join(root, 'settings', name), 'utf8');
const SETTINGS = ['schema.json', 'record.json', 'news.json'];

// temp/hp_colors_rewrite_v3/settings plus stub sibling lanes whose composer records how it was called.
function tree(t, { lanes = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-new-setting-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v3 = path.join(dir, 'hp_colors_rewrite_v3');
  fs.mkdirSync(path.join(v3, 'settings'), { recursive: true });
  for (const name of SETTINGS) fs.writeFileSync(path.join(v3, 'settings', name), real(name));
  const version = JSON.parse(real('record.json')).recordVersion;
  if (lanes) for (const [lane, file] of [['hp_colors_rewrite_v3_qollock', 'qollock.js'], ['hp_colors_rewrite_v3_showrank', 'showrank.js']]) {
    fs.mkdirSync(path.join(dir, lane, 'tools'), { recursive: true });
    fs.mkdirSync(path.join(dir, lane, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(dir, lane, 'tools', file), "'use strict';\nconst fs = require('node:fs'), path = require('node:path');\n" +
      'module.exports = { writeOrCheck(check, root, v3Root) { fs.writeFileSync(path.join(root, "called.json"), JSON.stringify({ check, root, v3Root })); return 2; } };\n');
    fs.writeFileSync(path.join(dir, lane, 'tests', 'pin.test.js'), '// stub\nassert.equal(contract.recordVersion, ' + version + ');\n');
  }
  return { dir, v3, version };
}
const run = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
const read = (v3, name) => fs.readFileSync(path.join(v3, 'settings', name), 'utf8');
const generatorArgs = v3 => ['--settings', path.join(v3, 'settings/schema.json'), '--record-contract', path.join(v3, 'settings/record.json'),
  '--news', path.join(v3, 'settings/news.json'), '--output-root', v3];
const generateCheck = v3 => spawnSync(process.execPath, [path.join(root, 'tools/generate.js'), '--check', ...generatorArgs(v3)], { encoding: 'utf8' });
const slotsOf = row => row.slot !== null && typeof row.slot === 'object' ? [row.slot.enemy, row.slot.ally] : [row.slot];
function expectedNext() {
  const rows = JSON.parse(real('schema.json')), record = JSON.parse(real('record.json'));
  const committed = JSON.parse(fs.readFileSync(path.join(root, 'generated/slots.json'), 'utf8')).map(slot => slot.slot);
  return Math.max(...rows.flatMap(slotsOf), ...record.retiredSlots, ...record.slotAdditions.flatMap(change => change.slots), ...committed) + 1;
}
// The before/after line lists differ only by `inserted` lines (and a trailing comma when appending last).
function onlyInserted(before, after) {
  const a = before.split('\n'), b = after.split('\n');
  return b.filter(line => !a.includes(line) && !a.includes(line.replace(/,$/, '')));
}

test('new-setting: the writer reproduces every schema line and record.json byte for byte', () => {
  const rows = JSON.parse(real('schema.json'));
  const lines = real('schema.json').split('\n');
  assert.equal(lines.length, rows.length + 3);
  rows.forEach((row, index) => assert.equal('  ' + inline(row) + (index < rows.length - 1 ? ',' : ''), lines[index + 1], row.key));
  assert.equal(recordText(JSON.parse(real('record.json'))), real('record.json'));
  assert.equal(kebab('hpTextFormat'), 'hp-text-format');
});

test('new-setting: a shared addition gets the next slot and a record bump, regenerates, and generate.js --check passes', t => {
  const { dir, v3, version } = tree(t);
  const before = Object.fromEntries(SETTINGS.map(name => [name, read(v3, name)]));
  const rows = JSON.parse(before['schema.json']);
  const after = rows.filter(row => row.page === 'Icons').at(-1).key;
  const result = run('--root', v3, '--key', 'testSharedToggle', '--name', 'Test shared toggle', '--type', 'boolean', '--side', 'shared',
    '--page', 'Icons', '--after', after, '--group', 'none', '--level', 'advanced', '--help-text', 'Temp-copy test row.', '--keywords', 'test,toggle');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const slot = expectedNext();
  const schema = JSON.parse(read(v3, 'schema.json')), record = JSON.parse(read(v3, 'record.json'));
  const index = schema.findIndex(row => row.key === 'testSharedToggle');
  assert.equal(schema[index - 1].key, after, 'inserted right after --after');
  assert.deepEqual(schema[index], { key: 'testSharedToggle', slot, name: 'Test shared toggle', type: 'boolean', bounds: null, step: null, default: false,
    side: 'shared', page: 'Icons', level: 'advanced', unit: '', help: 'Temp-copy test row.', keywords: ['test', 'toggle'] });
  assert.deepEqual(Object.keys(schema[index]), ['key', 'slot', 'name', 'type', 'bounds', 'step', 'default', 'side', 'page', 'level', 'unit', 'help', 'keywords']);
  assert.equal(record.recordVersion, version + 1);
  assert.deepEqual(record.slotAdditions.at(-1), { version: version + 1, slots: [slot] });
  assert.deepEqual(record.slotAdditions.slice(0, -1), JSON.parse(before['record.json']).slotAdditions, 'history untouched');
  assert.equal(recordText(record), read(v3, 'record.json'), 'record.json keeps its one-entry-per-line layout');
  assert.deepEqual(onlyInserted(before['schema.json'], read(v3, 'schema.json')), ['  ' + inline(schema[index]) + ',']);
  assert.ok(!read(v3, 'schema.json').includes('\r'));
  assert.equal(read(v3, 'news.json'), before['news.json'], 'no --news, no NEW item');
  assert.ok(JSON.parse(fs.readFileSync(path.join(v3, 'generated/slots.json'), 'utf8')).some(entry => entry.slot === slot && entry.key === 'testSharedToggle'));
  const check = generateCheck(v3);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /outputs current/);
  for (const lane of ['hp_colors_rewrite_v3_qollock', 'hp_colors_rewrite_v3_showrank']) {
    const called = JSON.parse(fs.readFileSync(path.join(dir, lane, 'called.json'), 'utf8'));
    assert.deepEqual([called.check, path.resolve(called.root), path.resolve(called.v3Root)], [false, path.join(dir, lane), v3], lane + ' composer wrote against the temp v3');
  }
  assert.match(result.stdout, /\[ok\] {3}generate\.js --check/);
  // Checklist: record-version pins in all three lanes' tests, with file:line.
  assert.match(result.stdout, new RegExp('hp_colors_rewrite_v3_qollock/tests/pin\\.test\\.js:2: record-version pin ' + version + ' -> ' + (version + 1)));
  assert.match(result.stdout, new RegExp('hp_colors_rewrite_v3_showrank/tests/pin\\.test\\.js:2: record-version pin'));
  assert.match(result.stdout, /hp_colors_rewrite_v3\/tests\/nav\.test\.js:\d+: Icons card/);
  assert.match(result.stdout, /hp_colors_rewrite_v3\/tests\/audit-performance\.test\.js:\d+: syncAll validity budget \d+: \+1 control /);
  assert.match(result.stdout, /hp_colors_rewrite_v3\/tests\/migration\.test\.js:\d+: largest convertible synthetic v2 save: \d+ scopes/);
});

test('new-setting: --same-version adds the slot to the newest record version instead of bumping again', t => {
  const { v3, version } = tree(t);
  const base = ['--root', v3, '--type', 'boolean', '--side', 'shared', '--page', 'Icons', '--group', 'none', '--level', 'advanced',
    '--help-text', 'Temp-copy test row.', '--keywords', 'test', '--no-generate'];
  const first = run(...base, '--key', 'testJoinOne', '--name', 'Test join one');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const slot = JSON.parse(read(v3, 'schema.json')).find(row => row.key === 'testJoinOne').slot;
  const second = run(...base, '--key', 'testJoinTwo', '--name', 'Test join two', '--same-version');
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.match(second.stdout, new RegExp('recordVersion ' + (version + 1) + ' \\(unchanged'));
  const record = JSON.parse(read(v3, 'record.json'));
  assert.equal(record.recordVersion, version + 1, 'one bump for both settings');
  assert.deepEqual(record.slotAdditions.at(-1), { version: version + 1, slots: [slot, slot + 1] });
  assert.equal(JSON.parse(read(v3, 'schema.json')).find(row => row.key === 'testJoinTwo').slot, slot + 1);
  assert.equal(read(v3, 'record.json'), recordText(record), 'record.json keeps its layout');
});

test('new-setting: a side-aware addition takes two slots, enemy first, with per-side defaults and a NEW item', t => {
  const { v3, version } = tree(t, { lanes: false });
  const before = read(v3, 'news.json');
  const rows = JSON.parse(read(v3, 'schema.json'));
  const anchor = rows.find(row => row.page === 'HP Text' && row.side === 'side-aware' && row.type === 'boolean');
  const result = run('--root', v3, '--key', 'hpTextTestGap', '--name', 'Test gap', '--type', 'number', '--side', 'side-aware', '--page', 'HP Text',
    '--after', anchor.key, '--default', 'enemy=4,ally=2.5', '--bounds', '-10,10', '--step', '0.5', '--level', 'basic', '--unit', 'px',
    '--help-text', 'Gap for the test.', '--requires', anchor.key, '--news', 'Test gap|A temp-copy test item.', '--date', '2026-11-13');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const slot = expectedNext();
  const schema = JSON.parse(read(v3, 'schema.json')), record = JSON.parse(read(v3, 'record.json')), news = JSON.parse(read(v3, 'news.json'));
  const row = schema[schema.findIndex(entry => entry.key === anchor.key) + 1];
  assert.equal(row.key, 'hpTextTestGap');
  assert.deepEqual(row.slot, { enemy: slot, ally: slot + 1 });
  assert.deepEqual(row.default, { enemy: 4, ally: 2.5 });
  assert.deepEqual([row.bounds, row.step, row.requires], [[-10, 10], 0.5, [{ key: anchor.key }]]);
  assert.deepEqual(Object.keys(row), ['key', 'slot', 'name', 'type', 'bounds', 'step', 'default', 'side', 'page', ...(anchor.group ? ['group'] : []),
    'level', 'unit', 'help', 'keywords', 'requires']);
  assert.equal(row.group, anchor.group, '--group defaults to the --after row\'s card');
  assert.equal(record.recordVersion, version + 1);
  assert.deepEqual(record.slotAdditions.at(-1), { version: version + 1, slots: [slot, slot + 1] });
  assert.deepEqual(news[0], { id: 'hp-text-test-gap', release: record.release, date: '2026-11-13', badge: 'New', title: 'Test gap',
    description: 'A temp-copy test item.', targets: [{ key: 'hpTextTestGap' }] });
  assert.ok(read(v3, 'news.json').endsWith(before.slice(2)), 'older items keep their hand-wrapped layout');
  const slots = JSON.parse(fs.readFileSync(path.join(v3, 'generated/slots.json'), 'utf8'));
  assert.deepEqual(slots.filter(entry => entry.setting === 'hpTextTestGap').map(entry => [entry.slot, entry.key]),
    [[slot, 'enemyHpTextTestGap'], [slot + 1, 'allyHpTextTestGap']]);
  const check = generateCheck(v3);
  assert.equal(check.status, 0, check.stderr);
  assert.match(result.stdout, /\[skip\] qollock\.js/, 'no lane beside a temp tree: composers are skipped, never the real lanes');
  assert.match(result.stdout, /tests\/news\.test\.js:\d+: /);
  assert.match(result.stdout, /\+2 controls/);
});

test('new-setting: --dry-run prints the diff and writes nothing; retired slots are never reused', t => {
  const { v3, version } = tree(t, { lanes: false });
  const record = JSON.parse(read(v3, 'record.json'));
  const retired = expectedNext() + 5;
  record.retiredSlots.push(retired);
  fs.writeFileSync(path.join(v3, 'settings/record.json'), recordText(record));
  const before = Object.fromEntries(SETTINGS.map(name => [name, read(v3, name)]));
  const result = run('--root', v3, '--dry-run', '--key', 'testPick', '--name', 'Test pick', '--type', 'enum', '--side', 'shared', '--page', 'Bar',
    '--options', 'a:Alpha,b:Beta', '--default', 'b', '--level', 'advanced', '--help-text', 'Pick one.');
  assert.equal(result.status, 0, result.stderr);
  for (const name of SETTINGS) assert.equal(read(v3, name), before[name], name + ' unchanged by --dry-run');
  assert.ok(!fs.existsSync(path.join(v3, 'generated')), 'no generation on --dry-run');
  assert.match(result.stdout, new RegExp('\\+  \\{ "key": "testPick", "slot": ' + (retired + 1) + ', "name": "Test pick", "type": "enum", "options": \\[\\{ "value": "a", "label": "Alpha" \\}'));
  assert.match(result.stdout, new RegExp('-  "recordVersion": ' + version + ',\\n\\+  "recordVersion": ' + (version + 1) + ','));
  assert.match(result.stdout, /--- a\/hp_colors_rewrite_v3\/settings\/schema\.json/);
  assert.match(result.stdout, /Dry run: nothing written/);
});

test('new-setting: refuses duplicate keys, codec-key clashes, a missing --after and insane bounds or defaults', t => {
  const { v3 } = tree(t, { lanes: false });
  const before = Object.fromEntries(SETTINGS.map(name => [name, read(v3, name)]));
  const rows = JSON.parse(before['schema.json']);
  const sideAware = rows.find(row => row.side === 'side-aware');
  const base = ['--root', v3, '--name', 'X', '--side', 'shared', '--page', 'Bar', '--level', 'basic', '--help-text', 'X.'];
  const number = ['--type', 'number', '--bounds', '0,10', '--step', '1'];
  const cases = [
    [[...base, '--key', rows[0].key, '--type', 'boolean'], /Duplicate key or menu id/],
    [[...base, '--key', 'enemy' + sideAware.key[0].toUpperCase() + sideAware.key.slice(1), '--type', 'boolean'], /Duplicate flat codec key: enemy/],
    [[...base, '--key', 'testX', '--type', 'boolean', '--after', 'noSuchSetting'], /--after noSuchSetting does not exist/],
    [[...base, '--key', 'testX', '--type', 'boolean', '--after', rows.find(row => row.page !== 'Bar').key], /--after .* is on page/],
    [[...base, '--key', 'testX', ...number, '--default', '11'], /Default outside bounds/],
    [[...base, '--key', 'testX', ...number, '--default', '2.5'], /Default off step/],
    [[...base, '--key', 'testX', '--type', 'number', '--bounds', '5,1', '--step', '1', '--default', '2'], /Invalid bounds/],
    [[...base, '--key', 'testX', '--type', 'number', '--bounds', '0,10', '--step', '0', '--default', '2'], /Invalid step/],
    [[...base, '--key', 'testX', '--type', 'boolean', '--default', 'enemy=true,ally=false'], /need --side side-aware/],
    [[...base, '--key', 'testX', '--type', 'color', '--default', 'red'], /Invalid color default/],
    [[...base, '--key', 'testX', '--type', 'enum', '--options', 'a:A', '--default', 'z'], /Invalid enum default/],
    [[...base, '--key', 'testX', '--type', 'boolean', '--bounds', '0,1'], /only apply to number/],
    [[...base, '--key', 'testX', '--type', 'boolean', '--requires', 'noSuchSetting'], /unknown setting noSuchSetting/],
    [[...base, '--key', 'testX', '--type', 'boolean', '--news', 'only a title'], /title\|description/],
  ];
  for (const [args, pattern] of cases) {
    const result = run(...args);
    assert.equal(result.status, 1, args.join(' ') + '\n' + result.stdout);
    assert.match(result.stderr, pattern, args.join(' '));
  }
  for (const name of SETTINGS) assert.equal(read(v3, name), before[name], name + ' unchanged by refused runs');
});

test('new-setting: the dry-run diff is a plain unified diff', () => {
  assert.equal(diff('a\nb\nc\n', 'a\nb\nc\n', 'x'), '');
  assert.equal(diff('a\nb\nc\nd\n', 'a\nB\nc\nd\n', 'x'), '--- a/x\n+++ b/x\n@@ -1,4 +1,4 @@\n a\n-b\n+B\n c\n d\n');
});
