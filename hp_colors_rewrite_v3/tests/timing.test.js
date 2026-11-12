'use strict';
// tools/timing.js: build steps rebuilt from .build/ file times, suite-pass records, compiler summaries and
// the slowest test files from TAP. A temp repo root with injected file times; the real .build/ is only read
// by the CLI smoke test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const timing = require('../tools/timing');

const TOOL = path.join(__dirname, '..', 'tools', 'timing.js');
const BASE = Date.parse('2026-11-02T11:44:34.823Z');
const KEY_A = 'a'.repeat(64), KEY_B = 'b'.repeat(64), KEY_C = 'c'.repeat(64);

// Files under a temp root, each with the birth/mtime offsets (ms from BASE) the steps are read from.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-timing-'));
  const times = new Map();
  const put = (rel, text, born, written = born) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    times.set(path.resolve(file), { born: BASE + born, written: BASE + written });
  };
  const dir = (rel, born) => { fs.mkdirSync(path.join(root, rel), { recursive: true }); times.set(path.resolve(root, rel), { born: BASE + born, written: BASE + born }); };
  const compiled = 'Compiling...\r\n OK: 20 compiled, 0 failed, 0 skipped, 0m:04s\r\nPress any key to exit...\r\n';
  const iso = ms => new Date(BASE + ms).toISOString().replace('Z', '0000+00:00');
  // v3 debug: staged suite ran (2m16s), compile 4.8 s, pack + listing.
  dir('hp_colors_rewrite_v3/.build/debug', 0);
  dir('hp_colors_rewrite_v3/.build/debug/hp_colors_rewrite_v3', 0);
  put('hp_colors_rewrite_v3/.build/debug/hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_menu.js', 'x', 9, 77);
  put('hp_colors_rewrite_v3/.build/debug/compile.stdout.log', compiled, 136611, 141375);
  put('hp_colors_rewrite_v3/.build/debug/compile.stderr.log', '', 136611, 141389);
  put('hp_colors_rewrite_v3/.build/debug/pak02_dir.vpk', 'vpk', 141742, 141752);
  put('hp_colors_rewrite_v3/.build/debug/vpk-listing.txt', 'list', 141835, 141835);
  // The pass marker names the stage under the repo's old drive: matched from the lane folder on.
  put('hp_colors_rewrite_v3/.build/suite-pass/' + KEY_A, '\ufeff' + '2026-11-02T19:46:51.4147440+08:00 debug F:\\old\\repo\\hp_colors_rewrite_v3\\.build\\debug\\hp_colors_rewrite_v3\r\n', 0);
  // v3 release: the suite was reused (marker from an earlier build of the same stage path).
  dir('hp_colors_rewrite_v3/.build/release', 600000);
  dir('hp_colors_rewrite_v3/.build/release/hp_colors_rewrite_v3', 600000);
  put('hp_colors_rewrite_v3/.build/release/hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_menu.js', 'x', 600005, 615000);
  put('hp_colors_rewrite_v3/.build/release/compile.stdout.log', compiled, 616000, 621000);
  put('hp_colors_rewrite_v3/.build/release/vpk-listing.txt', 'list', 621500, 621500);
  put('hp_colors_rewrite_v3/.build/suite-pass/' + KEY_B, '\ufeff' + iso(-86400000) + ' release D:\\repo\\hp_colors_rewrite_v3\\.build\\release\\hp_colors_rewrite_v3\r\n', 0);
  // QOLLOCK release: pin decompile, Closure transform, suite, lane suite, compile, pack, packed check.
  const q = 'hp_colors_rewrite_v3_qollock/.build/release/';
  dir(q, 200000);
  dir(q + 'hp_colors_rewrite_v3', 200000);
  put(q + 'pin/panorama/layout/hud.vxml_c', 'p', 200100, 201300);
  put(q + 'hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_menu.js', 'x', 201400, 219000);
  put(q + 'hp_colors_rewrite_v3_qollock/panorama/scripts/hp_colors_v3_qollock_bridge.js', 'x', 201400, 219500);
  put('hp_colors_rewrite_v3/.build/suite-pass/' + KEY_C, '\ufeff' + iso(352500) + ' release D:\\repo\\hp_colors_rewrite_v3_qollock\\.build\\release\\hp_colors_rewrite_v3\r\n', 0);
  put(q + 'compile.stdout.log', compiled, 358100, 362800);
  put(q + 'pak02_dir.vpk', 'vpk', 363200, 363250);
  put(q + 'vpk-listing.txt', 'list', 363300, 363300);
  put(q + 'packed-check/panorama/layout/hud_escape_menu.xml', 'x', 363350, 363450);
  const fsx = {
    ...fs,
    statSync(file) {
      const real = fs.statSync(file);
      const t = times.get(path.resolve(file));
      if (!t) return real;
      return { size: real.size, isDirectory: () => real.isDirectory(), isFile: () => real.isFile(), birthtimeMs: t.born, ctimeMs: t.born, mtimeMs: t.written };
    },
  };
  return { root, fsx, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('suite-pass markers: Get-Date -Format o timestamps, mode and project from the staged path', () => {
  assert.equal(timing.parseIso('2026-11-02T19:46:51.4147440+08:00'), Date.parse('2026-11-02T11:46:51.414Z'));
  const f = fixture();
  try {
    const passes = timing.readSuitePasses(f.fsx, f.root);
    assert.deepEqual(passes.map(item => [item.key[0], item.mode, item.project]), [['b', 'release', 'v3'], ['a', 'debug', 'v3'], ['c', 'release', 'qollock']]);
  } finally { f.cleanup(); }
});

test('compiler summary from compile.stdout.log', () => {
  assert.deepEqual(timing.compilerSummary('x\n OK: 21 compiled, 0 failed, 1 skipped, 1m:05s\n'), { compiled: 21, failed: 0, skipped: 1, seconds: 65 });
  assert.equal(timing.compilerSummary('no summary'), null);
});

test('a debug build: stage, staged suite (from its pass marker), compile and pack', () => {
  const f = fixture();
  try {
    const passes = timing.readSuitePasses(f.fsx, f.root);
    const t = timing.stageTimeline('v3', 'debug', passes, { fsx: f.fsx, root: f.root });
    assert.equal(t.present, true);
    assert.equal(t.complete, true);
    assert.equal(t.suite, 'ran');
    const ms = Object.fromEntries(t.steps.map(step => [step.name.replace(/ \(.*$/, ''), step.ms]));
    assert.equal(ms['stage copy + script transform'], 77);
    assert.equal(ms['v3 staged suite'], 136591 - 77);
    assert.equal(ms['to compile start'], 20);
    assert.equal(ms['compile'], 4778);
    assert.equal(ms['pack + exact-asset listing'], 446);
    assert.equal(t.totalMs, 141835);
    assert.match(t.steps.find(step => /compile/.test(step.name) && step.note).note, /compiler reports 4 s for 20 files/);
  } finally { f.cleanup(); }
});

test('a reused suite and the QOLLOCK pin, lane suite and packed check', () => {
  const f = fixture();
  try {
    const passes = timing.readSuitePasses(f.fsx, f.root);
    const release = timing.stageTimeline('v3', 'release', passes, { fsx: f.fsx, root: f.root });
    assert.equal(release.suite, 'reused');
    assert.match(release.steps.map(step => step.name).join('|'), /Closure ADVANCED\)\|suite cache key \(suite reused/);
    const q = timing.stageTimeline('qollock', 'release', passes, { fsx: f.fsx, root: f.root });
    assert.deepEqual(q.steps.map(step => step.name.replace(/ \(.*$/, '')), ['QOLLOCK pak03 pin check + decompile', 'stage copy + script transform', 'v3 staged suite', 'lane suite', 'compile', 'pack + exact-asset listing', 'packed QOLLOCK decompile + check']);
    assert.equal(q.steps[2].ms, 352500 - 219500);
    assert.equal(q.steps[3].ms, 358100 - 352500);
    assert.equal(timing.stageTimeline('showrank', 'debug', passes, { fsx: f.fsx, root: f.root }).present, false);
  } finally { f.cleanup(); }
});

test('slowest test files: per-file sums from TAP durations, names mapped through the current sources', () => {
  const f = fixture();
  try {
    const tests = path.join(f.root, 'hp_colors_rewrite_v3', 'tests');
    fs.mkdirSync(tests, { recursive: true });
    fs.writeFileSync(path.join(tests, 'alpha.test.js'), "test('alpha one', () => {});\ntest(\"alpha two\", () => {});\n");
    fs.writeFileSync(path.join(tests, 'beta.test.js'), "test('beta slow', async () => {});\n");
    const tap = path.join(f.root, 'suite.tap');
    const entry = (n, name, ms) => '# Subtest: ' + name + '\nok ' + n + ' - ' + name + '\n  ---\n  duration_ms: ' + ms + '\n  type: \'test\'\n  ...\n';
    fs.writeFileSync(tap, 'TAP version 13\n' + entry(1, 'alpha one', 100) + entry(2, 'alpha two', 50.5) + entry(3, 'beta slow', 900) + entry(4, 'gone test', 10) + '1..4\n# tests 4\n# pass 4\n# duration_ms 1000\n');
    const slow = timing.slowestTests(tap, { root: f.root, top: 5 });
    assert.deepEqual(slow.files.map(item => [item.file, Math.round(item.ms), item.tests]), [
      ['hp_colors_rewrite_v3/tests/beta.test.js', 900, 1], ['hp_colors_rewrite_v3/tests/alpha.test.js', 151, 2], ['(test name not in current sources)', 10, 1]]);
    assert.equal(slow.tests[0].name, 'beta slow');
    assert.equal(slow.unmapped, 1);
    // A suite.tap a build leaves in its stage wins over hand-collected evidence.
    const choice = timing.chooseTap({}, [{ tap }], { root: f.root });
    assert.equal(choice.file, tap);
    assert.match(choice.why, /written by the build/);
  } finally { f.cleanup(); }
});

test('the report marks file-time estimates for stages built without timing.json', () => {
  const f = fixture();
  try {
    const opts = timing.parseArgs(['--project', 'all']);
    const report = timing.collect(opts, { fsx: f.fsx, root: f.root });
    const text = timing.formatReport(report);
    assert.match(text, /v3 debug .* total 2m22s/);
    assert.match(text, /suite-pass markers: 3/);
    assert.match(text, /staged suite durations seen: v3 debug 2m17s, qollock release 2m13s/);
    assert.match(text, /staged test output: none/);
    assert.match(text, /built before build\.js recorded timing\.json\/suite\.tap \(file-time estimate\): v3 release, v3 debug, qollock release/);
    assert.match(text, /showrank debug: no stage/);
  } finally { f.cleanup(); }
});

test('build.js writes <stage>/timing.json (steps, suite outcome, failure) and timing.js reads it first', async () => {
  const build = require('../tools/build');
  const { repoPaths } = require('../tools/lib/projects');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-timing-build-'));
  try {
    const paths = repoPaths(root);
    fs.mkdirSync(path.join(paths.v3, 'panorama', 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(paths.v3, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(paths.v3, 'tests', 'a.test.js'), '');
    for (const f of [paths.vpkToolCandidates[1], paths.viewerCandidates[0]]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'exe'); }
    let clock = Date.parse('2026-11-13T10:00:00Z');
    const suiteArgs = [];
    const deps = {
      fs, env: { HPV3_SUITE_CACHE: '0', HPV3_STEAM_INF: path.join(root, 'steam.inf') }, execPath: 'node', platform: process.platform, log() {}, warn() {},
      now: () => (clock += 1000), sleep: async () => {},
      spawnSync: (cmd, args) => {
        if (cmd === 'node' && args[0] === '--test') { suiteArgs.push(...args); return { status: 0 }; }
        if (cmd === 'node' && path.basename(args[0]) === 'suite-cache.js') return { status: 0, stdout: 'd'.repeat(64) + '\n' };
        if (cmd === 'node') return { status: 0, stdout: '' };
        return { status: 1, stdout: '' };
      },
      spawn: () => { throw new Error('stop at compile'); },
    };
    await assert.rejects(build.buildProject('v3', { skipDeploy: true, debug: true }, deps, root), /stop at compile/);
    const stage = path.join(paths.v3, '.build', 'debug');
    assert.ok(suiteArgs.includes('--test-reporter-destination=' + path.join(stage, 'suite.tap')), 'per-test TAP beside the staged tree');
    const json = JSON.parse(fs.readFileSync(path.join(stage, 'timing.json'), 'utf8'));
    assert.equal(json.status, 'failed');
    assert.equal(json.error, 'stop at compile');
    assert.equal(json.suite, 'ran');
    assert.deepEqual(json.steps.map(step => step.name), ['preflight', 'generators', 'staging', 'suite', 'compile']);
    assert.ok(json.steps.every(step => Number.isFinite(step.ms) && step.ms >= 0 && /^\d{4}-\d\d-\d\dT/.test(step.start)));
    assert.ok(!fs.existsSync(path.join(stage, 'hp_colors_rewrite_v3', 'timing.json')), 'timing files stay outside the compiled tree');
    const t = timing.stageTimeline('v3', 'debug', [], { root });
    assert.equal(t.source, 'timing.json');
    assert.equal(t.suite, 'ran');
    assert.deepEqual(t.steps.map(step => step.name), ['preflight', 'generators', 'staging', 'suite', 'compile']);
    assert.match(timing.formatReport(timing.collect(timing.parseArgs(['--project', 'v3', '--mode', 'debug']), { root })), /v3 debug .*\(FAILED: stop at compile\) {2}\[hp_colors_rewrite_v3\/\.build\/debug, timing\.json\]/);
    // A failure before staging leaves the previous stage (and its timing.json) untouched.
    fs.writeFileSync(path.join(stage, 'timing.json'), '{"keep":1}');
    deps.env = { ...deps.env, HPV3_STEAM_INF: path.join(root, 'steam.inf') };
    await assert.rejects(build.buildProject('v3', { skipDeploy: true, debug: true }, { ...deps, spawnSync: () => ({ status: 1, stdout: '' }) }, root));
    assert.equal(fs.readFileSync(path.join(stage, 'timing.json'), 'utf8'), '{"keep":1}');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('CLI: arguments, --help and a run over the real .build/', () => {
  assert.throws(() => timing.parseArgs(['--mode', 'fast']), /--mode/);
  assert.throws(() => timing.parseArgs(['--top', '0']), /--top/);
  assert.deepEqual(timing.parseArgs(['--project', 'qollock', '--mode', 'debug']).projects, ['qollock']);
  assert.equal(timing.fmtMs(136591), '2m17s');
  const help = spawnSync(process.execPath, [TOOL, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /suite-pass/);
  const real = spawnSync(process.execPath, [TOOL, '--json'], { encoding: 'utf8' });
  assert.equal(real.status, 0, real.stderr);
  assert.ok(Array.isArray(JSON.parse(real.stdout).builds));
});
