'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createPanoramaHarness, createVmContext, runInVm } = require('./boot-layout');
const cli = path.resolve(__dirname, '../tools/stage-scripts.js');
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-stage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(dir, debug = false) { return spawnSync(process.execPath, [cli, dir, ...(debug ? ['--debug'] : [])], { encoding: 'utf8' }); }
function harness(debug) {
  const previous = process.env.HPV3_DEBUG;
  process.env.HPV3_DEBUG = debug ? '1' : '0';
  try {
    const value = createPanoramaHarness();
    return { harness: value, context: createVmContext(value) };
  } finally {
    if (previous === undefined) delete process.env.HPV3_DEBUG;
    else process.env.HPV3_DEBUG = previous;
  }
}
for (const debug of [false, true]) {
  test('CLI recursively transforms nested scripts with observable ' + (debug ? 'debug' : 'release') + ' scheduled logging', t => {
    const dir = temporary(t);
    const nested = path.join(dir, 'nested/deeper');
    fs.mkdirSync(nested, { recursive: true });
    const files = [path.join(dir, 'root.js'), path.join(nested, 'probe.js')];
    for (const file of files) fs.writeFileSync(file, '(function () {\n "use strict";\n $.Schedule(1, function () {\n  // HPV3_DEBUG $.Msg("[HPV3] scheduled probe");\n });\n})();\n');
    const result = run(dir, debug);
    assert.equal(result.status, 0, result.stderr);
    for (const file of files) {
      const boot = harness(debug);
      runInVm(fs.readFileSync(file, 'utf8'), boot.context, file);
      boot.harness.scheduler.runFor(2000);
      assert.deepEqual(boot.harness.logs, debug ? ['[HPV3] scheduled probe'] : []);
    }
  });
}

test('CLI rejects multiline debug markers clearly in both modes before mutating any script', t => {
  const dir = temporary(t);
  const good = path.join(dir, 'a-good.js');
  const bad = path.join(dir, 'nested/b-bad.js');
  fs.mkdirSync(path.dirname(bad));
  const goodText = '// HPV3_DEBUG $.Msg("good");\n';
  const badText = '(function () {\n // HPV3_DEBUG $.Msg(\n "[HPV3] multiline");\n})();\n';
  fs.writeFileSync(good, goodText); fs.writeFileSync(bad, badText);
  for (const debug of [false, true]) {
    const result = run(dir, debug);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Debug marker must contain a complete single-line statement/);
    assert.ok(result.stderr.includes('b-bad.js:2'));
    assert.equal(fs.readFileSync(good, 'utf8'), goodText);
    assert.equal(fs.readFileSync(bad, 'utf8'), badText);
  }
});

test('CLI rejects unmarked logging in nested release scripts', t => {
  const dir = temporary(t);
  const file = path.join(dir, 'nested/probe.js');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, '$.Schedule(1, function () { $.Warning("unexpected"); });\n');
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Release logging call found in .*probe.js/);
});

test('release CLI rejects logging member aliases and bracket notation before they can execute', t => {
  const dir = temporary(t);
  const file = path.join(dir, 'alias.js');
  for (const member of ['$.Msg', '$["Msg"]', "$['Warning']", 'console.log', 'console["warn"]']) {
    fs.writeFileSync(file, 'var log = ' + member + '; $.Schedule(1, function () { log("aliased"); });\n');
    const result = run(dir);
    assert.equal(result.status, 1, member);
    assert.match(result.stderr, /Release logging call found in alias.js/);
    const boot = harness(false);
    runInVm(fs.readFileSync(file, 'utf8'), boot.context);
    assert.throws(() => boot.harness.scheduler.runFor(2000), /Release invoked logging/);
  }
});
