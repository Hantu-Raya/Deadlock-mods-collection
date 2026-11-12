'use strict';
// tools/test.js: changed-file mapping, TAP failure parsing and the compact summary.
// Canned TAP and source scans only; the lane suites are never spawned here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const quick = require('../tools/test');

const ctx = quick.scanTests();
const V3 = 'hp_colors_rewrite_v3', QOL = 'hp_colors_rewrite_v3_qollock', SR = 'hp_colors_rewrite_v3_showrank';
const suite = name => V3 + '/tests/' + name + '.test.js';
const names = tests => tests.map(file => file.replace(/^hp_colors_rewrite_v3(?:_qollock|_showrank)?\/tests\//, '').replace(/\.test\.js$/, ''));
const variantTests = [...ctx.projects.qollock.tests, ...ctx.projects.showrank.tests];
const map = file => quick.mapFile(file, ctx);

test('every suite the maintained RULES name exists', () => {
  assert.deepEqual(quick.missingRuleTests(ctx), []);
  assert.ok(ctx.projects.v3.tests.length > 30 && ctx.projects.qollock.tests.length && ctx.projects.showrank.tests.length, 'all three lanes discovered');
});

test('renderer source selects renderer, preview and audit-performance plus the variant lanes', () => {
  const { tests } = map(V3 + '/panorama/scripts/hp_colors_v3_renderer.js');
  for (const name of ['renderer', 'preview', 'audit-performance']) assert.ok(tests.includes(suite(name)), name);
  for (const variant of variantTests) assert.ok(tests.includes(variant), variant);
  assert.ok(!tests.includes(suite('codec')) && !tests.includes(suite('storage')), 'unrelated suites stay out');
});

test('schema, record and news select codec, nav, news, migration and generator', () => {
  for (const file of ['schema.json', 'record.json', 'news.json']) {
    const { tests } = map(V3 + '/settings/' + file);
    for (const name of ['codec', 'nav', 'news', 'migration', 'generator']) assert.ok(tests.includes(suite(name)), file + ' -> ' + name);
    assert.ok(variantTests.every(variant => tests.includes(variant)), file + ' is shared with the variants');
    assert.ok(!tests.includes(suite('timers')), file + ' does not select timers');
  }
});

test('stylesheets select the suites that load CSS', () => {
  const { tests, why } = map(V3 + '/panorama/styles/hp_colors_v3_menu.css');
  assert.match(why, /CSS/);
  for (const name of ['theme', 'renderer', 'preview', 'menu', 'legacy-shield']) assert.ok(tests.includes(suite(name)), name);
  for (const name of ['codec', 'migration', 'timers']) assert.ok(!tests.includes(suite(name)), name + ' does not read CSS');
  assert.deepEqual(new Set(quick.cssTests(ctx)), new Set(tests.filter(file => file.startsWith(V3 + '/'))));
});

test('variant, helper, script and tool files map to the suites that use them', () => {
  assert.deepEqual(map(QOL + '/tools/qollock.js').tests, ctx.projects.qollock.tests, 'QOLLOCK files -> QOLLOCK suites only');
  assert.deepEqual(map(SR + '/panorama/layout/hud_escape_menu.xml').tests, ctx.projects.showrank.tests);
  assert.deepEqual(map(V3 + '/tests/codec.test.js').tests, [suite('codec')]);
  const helper = map(V3 + '/tests/boot-layout.js').tests;
  assert.ok(helper.includes(suite('renderer')) && variantTests.every(variant => helper.includes(variant)), 'boot-layout is required by the variants too');
  const buildTool = names(map(V3 + '/tools/build.js').tests);
  for (const name of ['audit-tooling', 'build-tool']) assert.ok(buildTool.includes(name), 'tools/build.js -> ' + name);
  const adapter = map('scripts/hp-colors-panorama-test-adapter.js').tests;
  assert.ok(adapter.includes(suite('renderer')) && variantTests.every(variant => adapter.includes(variant)), 'the shared adapter reaches every lane');
  assert.deepEqual(map(V3 + '/tools/budgets.js').tests, [suite('budgets')]);
  assert.deepEqual(map(V3 + '/tools/test.js').tests, [suite('quick-test'), suite('budgets')], 'budgets.js builds on the runner');
  assert.deepEqual(names(map(V3 + '/tools/suite-cache.js').tests), ['audit-tooling']);
  const generator = map(V3 + '/tools/generate.js').tests;
  for (const file of fs.readdirSync(path.join(__dirname, '../tools/lib')).filter(name => name.endsWith('.js') && name !== 'stylesheets.js' && !quick.BUILD_TOOL_LIBS.includes(name.replace(/\.js$/, ''))))
    assert.deepEqual(map(V3 + '/tools/lib/' + file).tests, generator, 'tools/lib/' + file + ' maps like generate.js');
  // The shared tool modules (cli, tap, run) map to the suites of the tools that read them.
  for (const file of ['cli.js', 'tap.js', 'run.js'])
    for (const name of ['quick-test', 'budgets', 'timing', 'logscan', 'ticket', 'engine-facts']) assert.ok(map(V3 + '/tools/lib/' + file).tests.includes(suite(name)), 'tools/lib/' + file + ' -> ' + name);
  // stylesheets.js also backs the engine-facts gate, so it adds that suite to the generator's.
  assert.deepEqual(map(V3 + '/tools/lib/stylesheets.js').tests.filter(test => test !== suite('engine-facts')), generator, 'tools/lib/stylesheets.js maps like generate.js');
  assert.ok(map(V3 + '/tools/lib/stylesheets.js').tests.includes(suite('engine-facts')), 'tools/lib/stylesheets.js -> engine-facts');
  assert.ok(map(V3 + '/tests/fixtures/v2-migration.json').tests.includes(suite('migration')));
});

test('documentation is ignored, unknown lane sources fall back to the full suites', () => {
  assert.deepEqual(map(V3 + '/issues/51-hp-percent.md').tests, []);
  assert.deepEqual(map(V3 + '/SPEC.md').tests, []);
  // Names are split so this file's own text does not count as a suite naming them.
  const outside = 'fps/gameinfo_bench/harness' + '3.py';
  assert.deepEqual(map(outside), { file: outside, tests: [], why: 'outside the lanes' });
  const unknown = map(V3 + '/panorama/scripts/hp_colors_v3_' + 'brand_new_module.js');
  assert.equal(unknown.full, true);
  assert.deepEqual(map('fps/gameinfo_bench/READ' + 'ME.md').tests, [], 'a common name deep in another folder is not a mention');
  assert.deepEqual(names(map('.git' + 'ignore').tests), ['audit-tooling'], 'root files the suites read by name');
  assert.equal(unknown.tests.length, ctx.projects.v3.tests.length + variantTests.length);
});

test('selection unions, orders and filters by project', () => {
  const files = [V3 + '\\panorama\\scripts\\hp_colors_v3_renderer.js', V3 + '/tests/codec.test.js'];
  const all = quick.selectTests(files, ctx);
  assert.equal(new Set(all.tests).size, all.tests.length, 'no duplicates');
  assert.ok(all.tests.indexOf(suite('codec')) < all.tests.indexOf(suite('renderer')), 'suite order follows the lanes');
  assert.ok(all.tests.indexOf(suite('renderer')) < all.tests.indexOf(variantTests[0]), 'v3 before variants');
  const v3Only = quick.selectTests(files, ctx, ['v3']);
  assert.ok(v3Only.tests.every(file => file.startsWith(V3 + '/tests/')));
  assert.equal(quick.normalizeFile(path.join(quick.REPO, V3, 'SPEC.md')), V3 + '/SPEC.md');
  assert.equal(quick.normalizeFile('tools/test.js', path.join(quick.REPO, V3)), V3 + '/tools/test.js');
});

test('require() scan resolves relative, ../tools and path.join(testsDir, name) helpers', () => {
  const exists = file => ['hp_colors_rewrite_v3/tests/boot-layout.js', 'lane/tools/x.js', 'lane/tests/h.js'].includes(file);
  const deps = quick.localRequires('lane/tests/a.test.js', "const a=require('./h');\nconst b=require('../tools/x');\nconst c=require(path.join(v3Tests, 'boot-layout'));\nrequire('node:test');", exists);
  assert.deepEqual(deps.sort(), ['hp_colors_rewrite_v3/tests/boot-layout.js', 'lane/tests/h.js', 'lane/tools/x.js']);
});

// Captured from `node --test --test-reporter=tap` (Node 26) on a file with assorted failures.
const FAILING_TAP = String.raw`TAP version 13
# Subtest: passes
ok 1 - passes
  ---
  duration_ms: 0.5752
  type: 'test'
  ...
# Subtest: eq fails
not ok 2 - eq fails
  ---
  duration_ms: 0.6478
  type: 'test'
  location: 'D:\\repo\\hp_colors_rewrite_v3\\tests\\a.test.js:3:1'
  failureType: 'testCodeFailure'
  error: |-
    math is broken
    
    2 !== 3
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 3
  actual: 2
  operator: 'strictEqual'
  stack: |-
    helper (D:\repo\hp_colors_rewrite_v3\tests\boot-layout.js:40:3)
    TestContext.<anonymous> (D:\repo\hp_colors_rewrite_v3\tests\a.test.js:7:29)
    Test.runInAsyncScope (node:async_hooks:226:14)
  ...
# Subtest: deep fails
not ok 3 - deep fails \# with a hash
  ---
  duration_ms: 0.7863
  type: 'test'
  location: 'D:\\repo\\hp_colors_rewrite_v3\\tests\\a.test.js:4:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
        a: [
          1,
    +     3
    -     4
        ],
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    a:
      0: 1
      1: 4
  actual:
    a:
      0: 1
      1: 3
    s: '${'x'.repeat(400)}'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (D:\repo\hp_colors_rewrite_v3\tests\a.test.js:4:31)
  ...
# Subtest: suite
    # Subtest: inner bad
    not ok 1 - inner bad
      ---
      duration_ms: 3.9818
      type: 'test'
      location: 'D:\\repo\\hp_colors_rewrite_v3\\tests\\a.test.js:6:60'
      failureType: 'testCodeFailure'
      error: |-
        boom
      code: 'ERR_TEST_FAILURE'
      name: 'TypeError'
      stack: |-
        TestContext.<anonymous> (D:\repo\hp_colors_rewrite_v3\tests\a.test.js:6:87)
      ...
    1..1
not ok 4 - suite
  ---
  duration_ms: 4.4212
  type: 'suite'
  location: 'D:\\repo\\hp_colors_rewrite_v3\\tests\\a.test.js:6:6'
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: skipme
ok 5 - skipme # SKIP why
  ---
  duration_ms: 0.6324
  type: 'test'
  ...
# D:\\repo\\hp_colors_rewrite_v3\\tests\\c.test.js:1
# throw new Error('load crash')
# ^
# Error: load crash
# Subtest: c.test.js
not ok 6 - c.test.js
  ---
  duration_ms: 32.2504
  type: 'test'
  location: 'D:\\repo\\hp_colors_rewrite_v3\\tests\\c.test.js:1:1'
  failureType: 'testCodeFailure'
  exitCode: 1
  signal: ~
  error: 'test failed'
  code: 'ERR_TEST_FAILURE'
  ...
1..6
# tests 7
# suites 1
# pass 1
# fail 4
# cancelled 0
# skipped 1
# todo 0
# duration_ms 62.189
`;

test('TAP failures keep name, message, actual/expected and the assertion site; parents of failing subtests are not repeated', () => {
  const tap = quick.parseTap(FAILING_TAP);
  assert.deepEqual(tap.failures.map(failure => failure.name), ['eq fails', 'deep fails # with a hash', 'inner bad', 'c.test.js']);
  const [eq, deep, inner, crash] = tap.failures;
  assert.deepEqual([eq.actual, eq.expected, eq.operator, eq.message.split('\n')[0]], [2, 3, 'strictEqual', 'math is broken']);
  assert.match(eq.site, /hp_colors_rewrite_v3[\\/]tests[\\/]a\.test\.js:7$/, 'the assertion frame in the test file, not the helper or the declaration');
  assert.match(deep.actual, /^a:\n {2}0: 1\n {2}1: 3\ns: 'x{400}'$/);
  assert.match(inner.site, /a\.test\.js:6$/);
  assert.equal(inner.errorName, 'TypeError');
  assert.deepEqual(crash.output.slice(0, 2), ['D:\\repo\\hp_colors_rewrite_v3\\tests\\c.test.js:1', "throw new Error('load crash')"]);
  assert.deepEqual(tap.tests.find(entry => entry.name === 'skipme').directive, 'SKIP');
  assert.deepEqual(tap.totals, { tests: 7, suites: 1, pass: 1, fail: 4, cancelled: 0, skipped: 1, todo: 0, duration_ms: 62.189 });
});

test('compact summary: totals, then each failure with message, truncated actual/expected and file:line', () => {
  const summary = quick.formatSummary(quick.parseTap(FAILING_TAP), { code: 1, files: 2, seconds: 3.21, max: 80 });
  const lines = summary.split('\n');
  assert.equal(lines[0], 'tests 7  pass 1  fail 4  skipped 1  (2 files, 3.2 s)');
  assert.ok(lines.includes('1) eq fails  [D:/repo/hp_colors_rewrite_v3/tests/a.test.js:7]') || lines.some(line => /^1\) eq fails {2}\[.*a\.test\.js:7\]$/.test(line)));
  assert.ok(lines.includes('   math is broken') && lines.includes('   2 !== 3'));
  assert.ok(lines.includes('   actual:   2') && lines.includes('   expected: 3  (strictEqual)'));
  assert.ok(lines.includes('   +     3') && lines.includes('   -     4'), 'deep diffs show the changed lines');
  const actual = lines.find(line => line.startsWith('   actual:   a:'));
  assert.ok(actual.length <= 3 + 10 + 80 && actual.endsWith('…'), 'long values are truncated: ' + actual.length);
  assert.ok(lines.includes('   TypeError: boom'));
  assert.ok(lines.includes('   | Error: load crash'), 'file load crashes show the thrown error');
  assert.ok(!summary.includes('1 subtest failed'));
  assert.equal(quick.formatSummary(quick.parseTap('ok 1 - fine\n1..1\n# tests 1\n# pass 1\n# fail 0\n')), 'tests 1  pass 1  fail 0');
});

test('argument parsing', () => {
  assert.deepEqual(quick.parseArgs(['--files', 'a.js,b.css', '--files=c.json', '--grep=ceiling', '--list', '--project', 'QOLLOCK']),
    { files: ['a.js', 'b.css', 'c.json'], list: true, listUnmapped: false, all: false, project: 'qollock', grep: 'ceiling', help: false });
  assert.throws(() => quick.parseArgs(['--project', 'v4']), /--project/);
  assert.throws(() => quick.parseArgs(['--grep']), /needs a value/);
  assert.throws(() => quick.parseArgs(['--bogus']), /unknown argument/);
});

test('--list prints the renderer-related suites without running them', async () => {
  const lines = [], log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  let code;
  try { code = await quick.main(['--files', V3 + '/panorama/scripts/hp_colors_v3_renderer.js', '--list']); } finally { console.log = log; }
  assert.equal(code, 0);
  for (const name of ['renderer', 'preview', 'audit-performance']) assert.ok(lines.some(line => line.includes('  ' + suite(name))), name);
  assert.ok(!lines.some(line => /^running/.test(line)));
});

test('--grep is forwarded as --test-name-pattern', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-quick-'));
  try {
    fs.writeFileSync(path.join(dir, 'tiny.test.js'), "const test=require('node:test');test('picked one',()=>{});test('other one',()=>{throw new Error('should not run');});");
    const run = await quick.runNodeTest(['tiny.test.js'], { grep: 'picked', cwd: dir });
    const tap = quick.parseTap(run.stdout);
    assert.equal(run.code, 0, run.stdout + run.stderr);
    assert.deepEqual(tap.tests.filter(entry => !entry.directive).map(entry => entry.name), ['picked one']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('each tool maps to its own suite, never the full suites', () => {
  const own = { 'dev.js': 'dev-loop', 'logscan.js': 'logscan', 'timing.js': 'timing', 'budgets.js': 'budgets', 'vpk-check.js': 'vpk-check',
    'new-setting.js': 'new-setting', 'ticket.js': 'ticket', 'doctor.js': 'doctor', 'build.js': 'build-tool' };
  for (const [tool, name] of Object.entries(own)) {
    const entry = map(V3 + '/tools/' + tool);
    assert.ok(!entry.full, tool + ' is not an unsure fallback');
    assert.ok(entry.tests.includes(suite(name)), tool + ' -> ' + name);
    assert.ok(entry.tests.length <= 4, tool + ' selects only its suites: ' + names(entry.tests).join(', '));
  }
  assert.deepEqual(names(map(V3 + '/tools/lib/toolchain.js').tests).filter(n => n === 'build-tool' || n === 'doctor').sort(), ['build-tool', 'doctor']);
  assert.deepEqual(quick.RULES.find(rule => rule.match.test(V3 + '/tools/engine-facts.js')).tests, ['engine-facts']);
  assert.deepEqual(quick.RULES.find(rule => rule.match.test(V3 + '/tools/lib/engine-facts.json')).tests, ['engine-facts', 'generator']);
});

test('generator modules: any tools/lib file but the build tools, whatever its name; menu.js also reaches legacy-shield', () => {
  const generatorModule = new RegExp('^' + V3 + '/' + quick.GENERATOR_MODULE);
  for (const rel of ['generate', 'menu-layout', 'lib/menu-a-b', 'lib/layout-compose', 'lib/stock-layouts']) assert.ok(generatorModule.test(V3 + '/tools/' + rel + '.js'), rel);
  for (const rel of ['lib/projects', 'lib/toolchain', 'lib/cli', 'lib/tap', 'lib/run', 'test', 'dev', 'lib/x/y']) assert.ok(!generatorModule.test(V3 + '/tools/' + rel + '.js'), rel);
  assert.ok(quick.mapFile(V3 + '/panorama/scripts/hp_colors_v3_menu.js', ctx).tests.includes(suite('legacy-shield')));
});

test('--list-unmapped reports only scripts no RULES entry names', () => {
  const unmapped = quick.unmappedScripts();
  for (const file of unmapped) assert.ok(!quick.RULES.some(rule => rule.match.test(file)), file);
  assert.ok(!unmapped.includes(V3 + '/panorama/scripts/hp_colors_v3_menu.js'));
});
