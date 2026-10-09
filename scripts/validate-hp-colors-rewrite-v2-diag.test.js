'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const adapter = require('./hp-colors-panorama-test-adapter');
const { parseLog, markdown } = require('./hpv2-diag-report');
const probePath = path.resolve(__dirname, '../hp_colors_rewrite_v2_diag/panorama/scripts/hpv2_diag_probe.js');
const probe = fs.readFileSync(probePath, 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/hpv2-diag-console.log'), 'utf8');

let fixtureSerial = 0;
// Reuse the real world tree and runtime, without registering the baseline suite twice.
function world(offset = 0) {
  const filename = path.join(__dirname, 'validate-hp-colors-rewrite-v2-baseline.test.js');
  let source = fs.readFileSync(filename, 'utf8');
  const testDeclaration = "const test = require('node:test');";
  const boot = '  runInVm(read(contractPath), context, contractPath);';
  assert.ok(source.includes(testDeclaration) && source.includes(boot));
  source = source.replace(testDeclaration, 'const test = function () {};');
  // Restrict the seam to makeStatusFixture; bootMenuVm has the same contract boot.
  const index = source.indexOf('function makeStatusFixture(');
  source = source.slice(0, index) + source.slice(index).replace(boot,
    `  harness.now = ${offset};\n  context.Math = Object.create(Math);\n  context.Math.random = () => ${0.2 + (++fixtureSerial / 1000)};\n  runInVm(${JSON.stringify(probe)}, context, ${JSON.stringify(probePath)});\n${boot}`);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(__dirname);
  loaded._compile(source + '\nmodule.exports = { makeStatusFixture };\n', filename);
  const f = loaded.exports.makeStatusFixture('enemy', { enabled: true, enemyEnabled: true }, 1,
    '300', false, false, false, true);
  f.harness.scheduler.runFor(61000, 3000);
  return f;
}

function reports(harness) { return harness.logs.filter(line => line.startsWith('[HPV2DIAG] v1 ')); }

test('real-format VProf and both networking directions retain metrics and timestamps', () => {
  const out = parseLog(fixture, 'fixture');
  assert.equal(out.label, 'fixture');
  assert.equal(out.performance.length, 2);
  const a = out.performance[0];
  assert.equal(a.timestamp, '10/03 00:54:10');
  assert.deepEqual(a.rows.Javascript, { avg: 0.38, p99: 4.45, activeN: 104469,
    activeAvg: 0.79, activeP99: 7.66, max1sP50: 7.94, max1sP95: 11.04,
    max1sActiveN: 2209, max1sActiveP50: 7.94, max1sActiveP95: 11.04 });
  assert.equal(a.frames, 219737);
  assert.deepEqual(a.network.ping, { P5: 9, P50: 10, P95: 10 });
  assert.equal(a.network.upstream.missedNonNetwork, 148);
  assert.equal(a.network.downstream.correctedLate, 48);
  assert.equal(out.performance[1].network.upstream.jitter.P99, 18);
  assert.equal(out.performance[1].network.downstream.missedLate, 431);
  assert.ok(out.missing.includes('No HPV2DIAG lines found.'));
  assert.match(markdown(out), /Javascript.*0\.38.*4\.45.*7\.94.*11\.04/);
});

test('rolling and malformed logs explicitly report missing/truncated pieces', () => {
  const out = parseLog('10/03 00:54:10 [VProf] Javascript 0.38 4.45\n' +
    '[HPV2DIAG] v1 {"id":\n' +
    '10/03 01:50:18 [VProf] -- Performance report --\n');
  assert.equal(out.performance.length, 1);
  assert.ok(out.missing.some(x => /rolling|orphan/i.test(x)));
  assert.ok(out.missing.some(x => /malformed|truncated/i.test(x)));
  assert.ok(out.performance[0].missing.includes('Javascript row'));
  assert.ok(out.performance[0].missing.includes('networking summary'));
});

test('real world boot reports scan/paint owners with one bounded line and no probe broadcasts', () => {
  const f = world();
  const lines = reports(f.harness);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].length <= 900);
  const record = JSON.parse(lines[0].slice('[HPV2DIAG] v1 '.length));
  assert.equal(record.kind, 'world');
  assert.equal(record.clock, 'Date.now-ms');
  assert.equal(record.seq, 1);
  assert.ok(record.c.some(row => row[0] === 'world:scan@1' && row[1] >= 55));
  assert.ok(record.c.some(row => row[0].startsWith('world:paint@') && row[1] > 0));
  assert.ok(record.h.reduce((a, b) => a + b, 0) >= 55);
  assert.equal(f.harness.dispatches.length, 0);
});

// Failure modes: idle-health probes hide inside the paint owner; hero and unit contexts
// are indistinguishable; the report cannot say how many contexts only scan.
test('world reports split quiet health probes from full paints and tag hero contexts', () => {
  const f = world();
  const record = JSON.parse(reports(f.harness)[0].slice('[HPV2DIAG] v1 '.length));
  assert.equal(record.t, 'hero');
  const probe = record.c.find(row => row[0] === 'world:probe@0.15');
  assert.ok(probe && probe[1] >= 100, 'an idle painted bar probes ~6.7 times per second');
  const paint = record.c.filter(row => /^world:paint@/.test(row[0])).reduce((n, row) => n + row[1], 0);
  assert.ok(paint > 0 && paint < probe[1], 'full paints stay separate and rarer than quiet probes');
});

test('report census separates painting and scan-only world contexts by hero/unit', () => {
  const line = (id, t, rows) => '[HPV2DIAG] v1 ' + JSON.stringify({ id, kind: 'world', t, created: 0, seq: 1,
    from: 0, to: 60000, clock: 'Date.now-ms', c: rows, m: [], u: [], uo: 0, h: [60, 0, 0, 0, 0, 0, 0, 0, 0, 0], cut: 0 });
  const scan = ['world:scan@1', 60, 30, 2, 0];
  const out = parseLog([
    line('a', 'hero', [scan, ['world:probe@0.15', 300, 6, 1, 0], ['world:paint@1.5', 40, 12, 2, 0]]),
    line('b', 'unit', [scan]),
    line('c', 'unit', [scan]),
  ].join('\n'));
  const census = out.minutes[0].worldCensus;
  assert.deepEqual({ hero: census.hero, unit: census.unit, painting: census.painting.contexts,
    scanOnly: census.scanOnly.contexts }, { hero: 1, unit: 2, painting: 1, scanOnly: 2 });
  assert.equal(census.scanOnly.msPerSecond, 1, 'two scan-only contexts at 30 ms per 60 s');
  assert.equal(census.painting.msPerSecond, 0.8);
  assert.match(markdown(out), /Painting \/ scan-only/);
});

test('phase-lock detector distinguishes co-created world contexts from a 450 ms offset', () => {
  const together = parseLog([...reports(world().harness), ...reports(world().harness)].join('\n'));
  const apart = parseLog([...reports(world().harness), ...reports(world(450).harness)].join('\n'));
  assert.equal(together.minutes[0].phaseLockScore, 1);
  assert.equal(together.minutes[0].phaseLocked, true);
  assert.equal(apart.minutes[0].phaseLockScore, 0.5);
  assert.equal(apart.minutes[0].phaseLocked, false);
});

test('wrappers preserve receiver, arguments, returns, cancellation and thrown callbacks', () => {
  const h = adapter.createPanoramaHarness();
  h.contextPanel.paneltype = 'ClientUIDialogPanel';
  const context = adapter.createVmContext(h);
  context.Math = Object.create(Math);
  context.Math.random = () => 0.25;
  adapter.runInVm(probe, context, probePath);
  const job = h.$.Schedule(1, function () { assert.equal(this, job); });
  assert.equal(h.$.CancelScheduled(job), true);
  const id = h.$.RegisterForUnhandledEvent('ClientUI_FireOutput', function (...args) {
    assert.equal(this, h.$);
    assert.equal(args[1], 'extra');
    h.now += 5;
    return 42;
  });
  assert.ok(id);
  const raw = '{"magic_word":"HPV2_ULTIMATE_SNAPSHOT","at":123,"players":[]}';
  assert.equal(h.handlers.ClientUI_FireOutput.call(h.$, raw, 'extra'), 42);
  assert.equal(h.$.DispatchEvent('ClientUI_FireOutput', raw), true);
  h.$.RegisterForUnhandledEvent('Throws', () => { h.now += 4; throw new Error('callback failure'); });
  assert.throws(() => h.handlers.Throws(), /callback failure/);
  h.scheduler.runFor(61000, 1000);
  const r = JSON.parse(reports(h)[0].slice('[HPV2DIAG] v1 '.length));
  assert.deepEqual(r.u, [123]);
  assert.ok(r.c.some(row => row[4] === 1 && row[3] >= 4));
  const out = parseLog(reports(h).join('\n'));
  assert.equal(out.minutes[0].ultimateDeliveries[0].contexts, 1);
  assert.ok(out.minutes[0].messages.some(row => row.magic === 'HPV2_ULTIMATE_SNAPSHOT' && row.bytes === raw.length));
});

test('bounded probe overflow preserves aggregate counts and flags sampled ultimate values', () => {
  const h = adapter.createPanoramaHarness();
  h.contextPanel.paneltype = 'ClientUIDialogPanel';
  const context = adapter.createVmContext(h);
  adapter.runInVm(probe, context, probePath);
  h.$.RegisterForUnhandledEvent('ClientUI_FireOutput', () => {});
  for (let i = 0; i < 80; i += 1) {
    h.$.Schedule(0.001 * i, () => {});
    h.$.DispatchEvent('ClientUI_FireOutput', JSON.stringify({ magic_word: `MAGIC_${i}`, at: i }));
    h.handlers.ClientUI_FireOutput(JSON.stringify({ magic_word: 'HPV2_ULTIMATE_SNAPSHOT', at: i }));
  }
  h.scheduler.runFor(62000, 1000);
  const lines = reports(h);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].length <= 900);
  const r = JSON.parse(lines[0].slice('[HPV2DIAG] v1 '.length));
  assert.ok(r.c.some(row => row[0] === '<other>'));
  assert.ok(r.m.some(row => row[1] === '<other>'));
  assert.equal(r.m.reduce((n, row) => n + row[2], 0), 160);
  assert.equal(r.c.reduce((n, row) => n + row[1], 0), 240);
  assert.ok(r.uo > 0);
  assert.ok(parseLog(lines.join('\n')).missing.some(x => /sampled/i.test(x)));
});
