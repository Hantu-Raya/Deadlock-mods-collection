'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadLayout, sourceRoot, createPanoramaHarness, createVmContext, runInVm, latestPublishedConfig } = require('./boot-layout');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'tools/generate.js');
const table = () => JSON.parse(fs.readFileSync(path.join(root, 'settings/schema.json'), 'utf8'));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
// Retired slot numbers (ticket 36) never return, so a fixture slot starts above them too.
const nextSlot = () => 1 + Math.max(...table().flatMap(row => typeof row.slot === 'object' ? Object.values(row.slot) : [row.slot]),
  ...JSON.parse(fs.readFileSync(path.join(root, 'settings/record.json'), 'utf8')).retiredSlots);
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-review-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function input(dir, rows) {
  const file = path.join(dir, 'schema.json');
  fs.writeFileSync(file, JSON.stringify(rows));
  return file;
}
function addedSlotsContract(dir, slots) {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'settings/record.json'), 'utf8'));
  const version = metadata.recordVersion + 1;
  const file = path.join(dir, 'record.json');
  fs.writeFileSync(file, JSON.stringify({ ...metadata, recordVersion: version,
    slotAdditions: [...metadata.slotAdditions, { version, slots }] }));
  return file;
}
function numberRow(key = 'markerHeight', slot = nextSlot()) {
  return { key, slot, name: 'Kill marker height', type: 'number', bounds: [0, 100], step: 1, default: 12,
    side: 'enemy', page: 'Indicators', level: 'advanced', unit: 'px', help: 'Kill marker height in pixels.',
    keywords: ['kill', 'height'], group: 'Kill marker' };
}
function base() { return table(); }

test('CLI accepts CRLF generated and vendored checkout copies without accepting actual edits', t => {
  const dir = temporary(t);
  fs.copyFileSync(path.join(root, 'game-data-pin.json'), path.join(dir, 'game-data-pin.json'));
  fs.cpSync(path.join(root, 'vendor'), path.join(dir, 'vendor'), { recursive: true });
  assert.equal(run('--game-data-root', dir, '--output-root', dir).status, 0);
  function crlf(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) crlf(file);
      else fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
    }
  }
  crlf(path.join(dir, 'generated')); crlf(path.join(dir, 'panorama')); crlf(path.join(dir, 'vendor'));
  const result = run('--check', '--game-data-root', dir, '--output-root', dir);
  assert.equal(result.status, 0, result.stderr);
  fs.appendFileSync(path.join(dir, 'vendor/unit_status_v2.css'), '\r\nNOT AN EOL CHANGE\r\n');
  const changed = run('--check', '--game-data-root', dir, '--output-root', dir);
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /Game-data pin mismatch/);
});

test('explicit slots stay stable when rows are inserted/reordered and --check rejects changed or reused pairs', t => {
  const dir = temporary(t);
  const rows = [numberRow(), ...base()];
  const file = input(dir, rows);
  const record = addedSlotsContract(dir, [nextSlot()]);
  let result = run('--settings', file, '--record-contract', record, '--output-root', dir);
  assert.equal(result.status, 0, result.stderr);
  const slots = JSON.parse(fs.readFileSync(path.join(dir, 'generated/slots.json')));
  assert.deepEqual(slots.map(({ key, slot }) => [key, slot]), [
    ...JSON.parse(fs.readFileSync(path.join(root, 'generated/slots.json'))).map(({ key, slot }) => [key, slot]),
    ['enemyMarkerHeight', nextSlot()],
  ]);
  fs.writeFileSync(file, JSON.stringify([...rows].reverse()));
  result = run('--settings', file, '--record-contract', record, '--output-root', dir);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'generated/slots.json'))), slots);
  for (const changed of [
    // A side-aware row picked by key: menu order (ticket 37) no longer starts with one.
    [{ ...base().find(row => row.key === 'barColorEnabled'), slot: { enemy: 1, ally: 0 } }],
    [{ ...base().find(row => row.key === 'barColorEnabled'), key: 'renamed' }],
    [numberRow('replacement', 0)],
  ]) {
    const bad = input(dir, changed);
    for (const check of [[], ['--check']]) {
      result = run(...check, '--settings', bad, '--output-root', path.join(dir, 'bad'));
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Codec slot contract/);
      assert.equal(fs.existsSync(path.join(dir, 'bad')), false);
    }
  }
});

test('enemy-only, labeled enum and subgroup schema reach real VM defaults and rows without ally leakage', t => {
  const dir = temporary(t);
  fs.cpSync(path.join(sourceRoot, 'panorama'), path.join(dir, 'panorama'), { recursive: true });
  const rows = [...base(), numberRow(), {
    key: 'markerMode', slot: nextSlot() + 1, name: 'Marker mode', type: 'enum', bounds: null, step: null,
    default: 'fixed', side: 'shared', page: 'Indicators', level: 'basic', unit: '', help: 'Marker color strategy.',
    keywords: ['mode'], group: 'Color Modes', options: [{ value: 'fixed', label: 'Fixed color' }, { value: 'health', label: 'Health gradient' }],
  }];
  const result = run('--settings', input(dir, rows), '--record-contract',
    addedSlotsContract(dir, [nextSlot(), nextSlot() + 1]), '--output-root', dir);
  assert.equal(result.status, 0, result.stderr);
  const boot = loadLayout('hud_escape_menu.xml', { sourceRoot: dir });
  boot.includeScripts(); boot.onload();
  const config = latestPublishedConfig(boot.harness);
  assert.equal(config.settings.side.enemy.markerHeight, 12);
  assert.equal(Object.hasOwn(config.settings.side.ally, 'markerHeight'), false);
  assert.equal(boot.harness.contextPanel.FindChildTraverse('HPColorsMarkerHeightAllyRow'), null);
  assert.equal(boot.harness.contextPanel.FindChildTraverse('HPColorsMarkerHeightEnemyEntry').text, '12');
  const segment = boot.harness.contextPanel.FindChildTraverse('HPColorsMarkerModeSegment');
  assert.deepEqual(segment.Children().map(option => option.Children().find(child => child.paneltype === 'Label').text), ['Fixed color', 'Health gradient']);
  assert.deepEqual(segment.Children().filter(option => option.BHasClass('Selected')).map(option => option.id), ['HPColorsMarkerModeOptionFixed']);
  const search = JSON.parse(fs.readFileSync(path.join(dir, 'generated/search-index.json')));
  assert.equal(search.find(row => row.key === 'markerHeight').group, 'Kill marker');
  assert.ok(search.find(row => row.key === 'markerMode').text.includes('health gradient'));
  const card = boot.harness.contextPanel.FindChildTraverse('HPColorsCardIndicatorsKillMarker');
  assert.equal(card.children.find(panel => panel.BHasClass('HPC3CardHead')).children[0].text, 'KILL MARKER');
  const column = card.FindChildTraverse('HPColorsPageIndicatorsKillMarkerAdvancedEnemyColumn');
  assert.ok(column.FindChildTraverse('HPColorsMarkerHeightEnemyRow'));
  assert.equal(card.FindChildTraverse('HPColorsPageIndicatorsKillMarkerAdvancedAllyColumn'), null, 'enemy-only groups emit no empty ally column');
  assert.equal(card.FindChildTraverse('HPColorsMarkerHeightAllyRow'), null, 'enemy-only row stays out of the ally side');
});

const badRows = {
  'invalid slot': rows => { rows.push(numberRow('markerHeight', -1)); },
  'duplicate slot': rows => { rows.push(numberRow('markerHeight', 0)); },
  'missing per-side slot': rows => { rows[0].slot = { enemy: 0 }; },
  'unsupported unit': rows => { rows.push({ ...numberRow(), unit: 'em' }); },
  'missing unit field': rows => { const row = numberRow(); delete row.unit; rows.push(row); },
  'invalid group': rows => { rows.push({ ...numberRow(), group: false }); },
  'unlabeled enum': rows => { rows.push({ ...numberRow(), type: 'enum', bounds: null, step: null, unit: '', default: 'fixed', options: ['fixed'] }); },
  'duplicate enum value': rows => { rows.push({ ...numberRow(), type: 'enum', bounds: null, step: null, unit: '', default: 'fixed', options: [{ value: 'fixed', label: 'Fixed' }, { value: 'fixed', label: 'Again' }] }); },
  'empty enum label': rows => { rows.push({ ...numberRow(), type: 'enum', bounds: null, step: null, unit: '', default: 'fixed', options: [{ value: 'fixed', label: '' }] }); },
  'flat codec collision': rows => { rows.push({ ...numberRow('enemyBarColorEnabled', 9), side: 'shared' }); },
};
for (const [name, mutate] of Object.entries(badRows)) {
  test('CLI rejects review schema failure: ' + name, t => {
    const dir = temporary(t); const rows = base(); mutate(rows);
    const result = run('--settings', input(dir, rows), '--output-root', path.join(dir, 'out'));
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(path.join(dir, 'out')), false);
    if (name === 'flat codec collision') assert.match(result.stderr, /Duplicate flat codec key/);
  });
}

test('release logging throwers cover every VM harness and scheduled callbacks, not only boot', { skip: process.env.HPV3_DEBUG === '1' }, () => {
  for (const call of ['$.Msg("late")', '$.Warning("late")', 'console.log("late")', 'console.warn("late")', 'console.error("late")']) {
    const harness = createPanoramaHarness();
    const context = createVmContext(harness);
    runInVm('$.Schedule(1, function () { ' + call + '; });', context);
    assert.throws(() => harness.scheduler.runFor(2000), /Release invoked logging/);
  }
});
