'use strict';
// tools/dev.js: what a cycle runs for which changed files, the watch filter that keeps generated outputs
// from retriggering it, the debounce, the cycle line and its short failures. The generator, composers,
// tests and builds are injected here; only stage-scripts (marker check) and the syntax parse run for real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dev = require('../tools/dev');

const ROOT = path.resolve(__dirname, '..', '..');
const TOOL = path.join(__dirname, '..', 'tools', 'dev.js');
const V3 = 'hp_colors_rewrite_v3', QOL = 'hp_colors_rewrite_v3_qollock', SR = 'hp_colors_rewrite_v3_showrank';
const ALL = ['v3', 'qollock', 'showrank'];

// generate.js is asked in a child process: a require() here would make tools/test.js map every generator
// lib file to this suite too (tests/quick-test.test.js keeps tools/lib/* mapped exactly like generate.js).
test('the watched-output list is exactly what tools/generate.js writes', () => {
  const script = 'process.stdout.write(JSON.stringify(Object.keys(require(process.argv[1]).menuParts().files)))';
  const child = spawnSync(process.execPath, ['-e', script, path.join(__dirname, '..', 'tools', 'generate.js')], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual([...dev.GENERATED].sort(), JSON.parse(child.stdout).map(file => V3 + '/' + file).sort());
});

test('watch filter: generated and composed outputs, build trees, docs and editor files never trigger a cycle', () => {
  for (const rel of [...dev.GENERATED, ...dev.COMPOSED.qollock, ...dev.COMPOSED.showrank, V3 + '/generated/new.json',
    V3 + '/.build/debug/pak02_dir.vpk', V3 + '/.tmp/x.js', V3 + '/docs/adr/1.md', V3 + '/MAP.md', V3 + '/issues/1.md',
    V3 + '/panorama/scripts/hp_colors_v3_menu.js~', V3 + '/panorama/styles/.#hp_colors_v3_menu.css', V3 + '/tools/x.js.swp',
    'observer_hud/x.js', 'scripts/other.ps1', '../outside.js']) assert.ok(dev.isWatchIgnored(rel), rel);
  for (const rel of [V3 + '/settings/schema.json', V3 + '/panorama/scripts/hp_colors_v3_menu.js', V3 + '/panorama/styles/hp_colors_v3_menu.css',
    V3 + '/tools/dev.js', V3 + '/tests/dev-loop.test.js', V3 + '/vendor/heroes.vdata', QOL + '/vendor/pin.json', QOL + '/panorama/scripts/hp_colors_v3_qollock_bridge.js',
    SR + '/tools/showrank.js', 'showrank_barebones/panorama/layout/hud_escape_menu.xml', 'scripts/hp-colors-panorama-test-adapter.js']) assert.ok(!dev.isWatchIgnored(rel), rel);
});

test('generator and composer inputs', () => {
  for (const rel of ['settings/schema.json', 'settings/record.json', 'settings/news.json', 'game-data-pin.json', 'vendor/heroes.vdata', 'tools/generate.js',
    'tools/menu-layout.js', 'tools/game-data.js', 'tools/lib/schema.js', 'tools/lib/stylesheets.js']) assert.ok(dev.isGeneratorInput(V3 + '/' + rel), rel);
  for (const rel of ['tools/lib/projects.js', 'tools/lib/toolchain.js', 'tools/test.js', 'panorama/scripts/hp_colors_v3_menu.js', 'panorama/styles/hp_colors_v3_menu.css'])
    assert.ok(!dev.isGeneratorInput(V3 + '/' + rel), rel);
  assert.deepEqual(dev.composerInput(QOL + '/vendor/hud_escape_menu.xml'), ['qollock']);
  assert.deepEqual(dev.composerInput(QOL + '/tools/qollock.js'), ['qollock']);
  assert.deepEqual(dev.composerInput('showrank_barebones/panorama/layout/citadel_hud_top_bar.xml'), ['showrank']);
  assert.deepEqual(dev.composerInput(V3 + '/settings/schema.json'), []);
});

test('cycle plans: schema regenerates and recomposes; a test edit runs only tests; scripts get syntax and marker checks', () => {
  const exists = () => true;
  const schema = dev.planCycle([V3 + '/settings/schema.json'], ALL, { exists });
  assert.equal(schema.generate, true);
  assert.deepEqual(schema.compose, ['qollock', 'showrank']);
  assert.deepEqual(schema.contracts, ['generate', 'qollock', 'showrank']);
  assert.equal(dev.planCycle([V3 + '/settings/schema.json'], ['v3'], { exists }).compose.length, 0, 'unselected variants are not composed');
  assert.equal(dev.planCycle([V3 + '/settings/schema.json'], ALL, { exists, write: false }).generate, false, '--no-write');
  const testOnly = dev.planCycle([V3 + '/tests/codec.test.js'], ALL, { exists });
  assert.deepEqual([testOnly.contracts, testOnly.generate, testOnly.syntax], [[], false, [V3 + '/tests/codec.test.js']]);
  const script = dev.planCycle([V3 + '/panorama/scripts/hp_colors_v3_menu.js', V3 + '/panorama/styles/hp_colors_v3_world.css'], ALL, { exists });
  assert.deepEqual(script.markers, [V3 + '/panorama/scripts/hp_colors_v3_menu.js']);
  assert.equal(script.styles, true);
  assert.equal(script.generate, false);
  const qollock = dev.planCycle([QOL + '/vendor/pin.json'], ALL, { exists });
  assert.deepEqual(qollock.compose, ['qollock']);
  const generated = dev.planCycle([V3 + '/panorama/scripts/hp_colors_v3_settings.js'], ALL, { exists });
  assert.deepEqual([generated.syntax, generated.markers], [[], []], 'generated scripts are checked by generate --check, not re-parsed');
  const deleted = dev.planCycle([V3 + '/tools/gone.js'], ALL, { exists: () => false });
  assert.deepEqual(deleted.syntax, []);
  const docs = dev.planCycle([V3 + '/MAP.md', 'observer_hud/x.js'], ALL, { exists });
  assert.deepEqual([docs.lane, docs.contracts], [[], []]);
});

// Injected generator/composer/test runs; `state` says what is stale.
function fakeDeps(state = {}) {
  const calls = [];
  let generated = false, composed = false, clock = 0;
  const tap = state.tap || 'TAP version 13\nok 1 - fine\n  ---\n  duration_ms: 1\n  ...\n1..1\n# tests 1\n# pass 1\n# fail 0\n';
  return {
    calls,
    now: () => (clock += 250),
    log: () => {},
    exists: () => true,
    hash: files => Object.fromEntries(files.map(file => [file, (generated && /v3_settings\.js$|ids\.json$/.test(file)) || (composed && /qollock\/panorama\/layout\/hud_escape_menu/.test(file)) ? 'new' : 'old'])),
    runNode: async (script, args) => {
      calls.push([path.basename(script), ...args.map(arg => path.isAbsolute(arg) ? '<dir>' : arg)]);
      const name = path.basename(script);
      if (name === 'generate.js' && args[0] === '--check') return state.generateStale && !generated ? { code: 1, stdout: '', stderr: 'Stale generated files: generated/ids.json' } : state.generateBroken ? { code: 1, stdout: '', stderr: 'settings/schema.json: invalid JSON: Unexpected token' } : { code: 0, stdout: 'ok', stderr: '' };
      if (name === 'generate.js') { generated = true; return { code: 0, stdout: 'HPV3 generator: 12 outputs written', stderr: '' }; }
      if (name === 'qollock.js' && args[0] === '--check') return generated && !composed ? { code: 1, stdout: '', stderr: 'Stale QOLLOCK layouts: panorama/layout/hud_escape_menu.xml; run it' } : { code: 0, stdout: '', stderr: '' };
      if (name === 'qollock.js') { composed = true; return { code: 0, stdout: '', stderr: '' }; }
      if (name === 'build.js') return { code: 0, stdout: 'HPV3 debug build complete: ' + path.join(ROOT, V3, '.build', 'debug', 'pak02_dir.vpk') + '\n', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    },
    runTests: async tests => { calls.push(['tests', tests.length]); state.ran = tests; return { code: /not ok/.test(tap) ? 1 : 0, stdout: tap, stderr: '', seconds: 1.5 }; },
    stylesheets: () => ({ name: 'css', ok: true, note: '9 rules' }),
    syntax: files => state.syntaxFail ? { name: 'syntax', ok: false, failures: [{ what: 'syntax', where: files[0] + ':3', message: 'SyntaxError: Unexpected token' }] } : { name: 'syntax', ok: true, note: files.length + ' files', failures: [] },
    gitChanged: () => [],
  };
}

test('a schema change regenerates, recomposes QOLLOCK and tests the rewritten outputs too', async () => {
  const state = { generateStale: true };
  const deps = fakeDeps(state);
  const result = await dev.runCycle([V3 + '/settings/schema.json'], { projects: ALL }, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(deps.calls.filter(call => call[0] !== 'tests'), [
    ['generate.js', '--check'], ['generate.js'], ['qollock.js', '--check'], ['qollock.js'], ['showrank.js', '--check']]);
  const steps = Object.fromEntries(result.steps.map(step => [step.name, step.note]));
  assert.equal(steps.generate, 'regenerated 2');
  assert.equal(steps.qollock, 'recomposed 1');
  assert.ok(state.ran.includes(V3 + '/tests/codec.test.js') && state.ran.includes(QOL + '/tests/qollock.test.js'), 'schema suites and the variant lanes');
  const line = dev.formatCycle(result, { index: 4, clock: new Date(2026, 10, 13, 9, 5, 7) });
  assert.match(line, /^\[09:05:07\] #4 PASS \d+\.\d s \| changed 1 \(schema\.json\) \| generate regenerated 2 \| qollock recomposed 1 \| showrank current \| tests \d+ files: 1 pass, 1\.5 s$/);
});

test('stale outputs without a generator input change fail instead of being rewritten', async () => {
  const deps = fakeDeps({ generateStale: true });
  const result = await dev.runCycle([V3 + '/panorama/styles/hp_colors_v3_menu.css'], { projects: ['v3'], tests: false }, deps);
  assert.equal(result.ok, false);
  assert.ok(!deps.calls.some(call => call[0] === 'generate.js' && call.length === 1), 'generate.js never ran in write mode');
  assert.match(dev.formatCycle(result), /\n {2}x generate --check {2}Stale generated files: generated\/ids\.json \(no generator input changed/);
  const broken = await dev.runCycle([V3 + '/settings/schema.json'], { projects: ['v3'], tests: false }, fakeDeps({ generateBroken: true }));
  assert.match(dev.formatCycle(broken), /x generate --check {2}settings\/schema\.json: invalid JSON/);
});

test('failing tests print one short line each; a syntax error skips the tests', async () => {
  const site = path.join(ROOT, V3, 'tests', 'codec.test.js');
  const tap = 'TAP version 13\nnot ok 1 - codec round-trips presets\n  ---\n  duration_ms: 5\n  location: \'' + site.replace(/\\/g, '\\\\') + ':10:1\'\n  failureType: \'testCodeFailure\'\n' +
    '  error: \'Expected values to be strictly equal\'\n  code: \'ERR_ASSERTION\'\n  stack: |-\n    TestContext.<anonymous> (' + site + ':12:5)\n  ...\n1..1\n# tests 1\n# pass 0\n# fail 1\n';
  const result = await dev.runCycle([V3 + '/tests/codec.test.js'], { projects: ALL }, fakeDeps({ tap }));
  assert.equal(result.ok, false);
  const text = dev.formatCycle(result);
  assert.match(text, /#1 FAIL .*\| tests FAIL 1 file: 0 pass 1 fail/);
  assert.match(text, /\n {2}x test hp_colors_rewrite_v3\/tests\/codec\.test\.js:12 {2}codec round-trips presets: Expected values to be strictly equal$/);
  const deps = fakeDeps({ syntaxFail: true });
  const skipped = await dev.runCycle([V3 + '/tools/test.js'], { projects: ALL }, deps);
  assert.ok(!deps.calls.some(call => call[0] === 'tests'));
  assert.match(dev.formatCycle(skipped), /tests skipped \(syntax error\)[\s\S]*x syntax hp_colors_rewrite_v3\/tools\/test\.js:3/);
});

test('--build runs a debug build per project only after a green cycle, never a deploy', async () => {
  const deps = fakeDeps();
  const result = await dev.runCycle([V3 + '/tests/codec.test.js'], { projects: ['v3', 'qollock'], build: true }, deps);
  const builds = deps.calls.filter(call => call[0] === 'build.js');
  assert.deepEqual(builds, [['build.js', '--project', 'v3', '--skip-deploy', '--debug'], ['build.js', '--project', 'qollock', '--skip-deploy', '--debug']]);
  assert.match(dev.formatCycle(result), /build v3 debug ok \d+ s -> hp_colors_rewrite_v3\/\.build\/debug\/pak02_dir\.vpk/);
  const red = fakeDeps({ syntaxFail: true });
  await dev.runCycle([V3 + '/tools/test.js'], { projects: ['v3'], build: true }, red);
  assert.ok(!red.calls.some(call => call[0] === 'build.js'), 'no build after a red cycle');
});

test('syntax: what node --check reports, with the file and line', () => {
  const bad = dev.syntaxError(V3 + '/panorama/scripts/x.js', 'var a = 1;\nvar b = ;\n');
  assert.equal(bad.where, V3 + '/panorama/scripts/x.js:2');
  assert.match(bad.message, /^SyntaxError: /);
  assert.equal(dev.syntaxError(V3 + '/tools/x.js', '#!/usr/bin/env node\n\'use strict\';\nif (require.main === module) return;\n'), null, 'tools parse as CommonJS bodies');
  assert.ok(dev.syntaxError(V3 + '/panorama/scripts/x.js', 'return 1;\n'), 'panorama scripts are plain scripts');
});

test('markers: tools/stage-scripts.js rejects an incomplete HPV3_DEBUG statement and release logging', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-dev-markers-'));
  try {
    const dir = path.join(root, V3, 'panorama', 'scripts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'good.js'), '(function () {\n  // HPV3_DEBUG $.Msg("[HPV3] ok");\n})();\n');
    fs.writeFileSync(path.join(dir, 'marker.js'), '(function () {\n  var a = 1;\n  // HPV3_DEBUG $.Msg("[HPV3] no semicolon")\n})();\n');
    fs.writeFileSync(path.join(dir, 'logs.js'), '(function () {\n  $.Msg("release log");\n})();\n');
    const deps = dev.defaultDeps();
    const good = await dev.markerStep([V3 + '/panorama/scripts/good.js'], deps, root);
    assert.equal(good.ok, true);
    const marker = await dev.markerStep([V3 + '/panorama/scripts/marker.js'], deps, root);
    assert.equal(marker.ok, false);
    assert.equal(marker.failures[0].where, V3 + '/panorama/scripts/marker.js:3');
    assert.match(marker.failures[0].message, /debug marker not a complete statement/);
    const logs = await dev.markerStep([V3 + '/panorama/scripts/logs.js'], deps, root);
    assert.deepEqual(logs.failures.map(failure => [failure.what, failure.where]), [['markers (release)', V3 + '/panorama/scripts/logs.js']]);
    assert.match(logs.failures[0].message, /Release logging call found/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('debounce: a burst of saves is one cycle; changes during a cycle queue the next one', async () => {
  const timers = [];
  const setTimer = fn => { timers.push(fn); return timers.length; };
  const fired = [];
  let release;
  const debouncer = dev.createDebouncer(300, files => { fired.push(files); return new Promise(resolve => { release = resolve; }); }, { setTimer, clearTimer: id => { timers[id - 1] = null; } });
  debouncer.add('b.js');
  debouncer.add('a.js');
  debouncer.add('a.js');
  assert.equal(timers.filter(Boolean).length, 1, 'each add restarts the quiet period');
  const first = timers.filter(Boolean).pop()();
  assert.deepEqual(fired, [['a.js', 'b.js']]);
  debouncer.add('c.js');
  timers.filter(Boolean).pop()();
  assert.equal(fired.length, 1, 'no overlapping cycle');
  release();
  await first;
  timers.filter(Boolean).pop()();
  assert.deepEqual(fired, [['a.js', 'b.js'], ['c.js']]);
});

test('watch roots follow the chosen projects', () => {
  assert.deepEqual(dev.watchRoots(['v3']).map(root => root.dir), [V3, 'scripts']);
  assert.deepEqual(dev.watchRoots(ALL).map(root => root.dir), [V3, QOL, SR, 'showrank_barebones/panorama/layout', 'scripts']);
});

test('CLI: --help, argument errors and a --once cycle with nothing to check', () => {
  const help = spawnSync(process.execPath, [TOOL, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--once/);
  assert.match(help.stdout, /Never deploys/);
  assert.equal(spawnSync(process.execPath, [TOOL, '--project', 'v4'], { encoding: 'utf8' }).status, 2);
  assert.deepEqual(dev.parseArgs(['--files', 'a.js,b.css']).files, ['a.js', 'b.css']);
  assert.equal(dev.parseArgs(['--files', 'a.js']).once, true);
  const once = spawnSync(process.execPath, [TOOL, '--once', '--files', V3 + '/MAP.md'], { encoding: 'utf8', cwd: ROOT });
  assert.equal(once.status, 0, once.stderr);
  assert.match(once.stdout, /^\[\d\d:\d\d:\d\d\] #1 PASS \d+\.\d s \| changed 0 \+1 ignored \(docs or outside the lanes\) \| tests none mapped\s*$/);
});
