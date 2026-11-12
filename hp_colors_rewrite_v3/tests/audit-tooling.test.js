'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.dirname(root);
// The build lives in tools/build.js (shared pipeline for all three lanes) and tools/lib/projects.js (contracts).
const build = require(path.join(root, 'tools/build.js'));
const { repoPaths, projectConfig, stagePaths, HPV3_ASSETS, PROJECT_NAMES } = require(path.join(root, 'tools/lib/projects.js'));
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-wrapper-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
// Child env for nested node runs: the isolated node runner must emit stdout, not parent-runner IPC.
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}
// Real spawnSync with output captured (instead of inherited) so the test can read it.
function capturingSpawn(record) {
  return (cmd, args, options = {}) => {
    const result = spawnSync(cmd, args, { ...options, stdio: 'pipe', encoding: 'utf8', timeout: 60000 });
    record.calls.push([cmd, ...args]);
    record.stdout += result.stdout || '';
    record.stderr += result.stderr || '';
    return result;
  };
}
const PREFLIGHT_OK = 'PREFLIGHT_OK';

test('wrapper rejects an installed-version mismatch before any build work and forwards the explicit override', async t => {
  const dir = temporary(t);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'game-data-pin.json')));
  const steam = path.join(dir, 'steam.inf');
  fs.writeFileSync(steam, 'ClientVersion=' + (manifest.clientVersion + 1) + '\n');
  // Execute only the real offline preflight: the first file probe after it (tool resolution) stops the
  // build, so cleanup and compilation are never reached.
  const preflight = async (project, allowPinMismatch) => {
    const record = { calls: [], stdout: '', stderr: '' };
    const deps = {
      fs: { ...fs, existsSync: () => { throw new Error(PREFLIGHT_OK); } },
      spawnSync: capturingSpawn(record), spawn: () => assert.fail('nothing may compile'),
      env: childEnv(), execPath: process.execPath, platform: process.platform, log() {}, warn() {}
    };
    let error;
    try { await build.buildProject(project, { skipDeploy: true, installedSteamInf: steam, allowPinMismatch }, deps, repo); }
    catch (err) { error = err; }
    assert.equal(record.calls.length, 1, project + ': only the pin check runs');
    assert.equal(path.basename(record.calls[0][1]), 'game-data.js');
    return { error, ...record };
  };
  for (const project of PROJECT_NAMES) {
    const rejected = await preflight(project, false);
    assert.match(rejected.error.message, /^V3 installed-version check failed/, project);
    assert.match(rejected.stderr, /ClientVersion mismatch/);
    const allowed = await preflight(project, true);
    assert.equal(allowed.error.message, PREFLIGHT_OK, project + ': ' + allowed.error.message);
    assert.match(allowed.stderr, /WARNING.*ClientVersion mismatch/);
    assert.ok(allowed.calls[0].includes('--allow-pin-mismatch'));
  }
  // The CLI refuses every lane without --skip-deploy (build-only) before any check runs.
  const refused = spawnSync(process.execPath, [path.join(root, 'tools/build.js'), '--project', 'all', '--installed-steam-inf', steam], { encoding: 'utf8', env: childEnv(), timeout: 20000 });
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /build-only\. Pass --skip-deploy/);
  assert.doesNotMatch(refused.stdout + refused.stderr, /ClientVersion/);
});

// A throwaway repo with every lane's sources and stub tools; spawns are recorded, the compiler is never run.
function fakeRepo(dir) {
  const paths = repoPaths(dir);
  for (const sub of ['panorama/scripts', 'tests']) fs.mkdirSync(path.join(paths.v3, sub), { recursive: true });
  fs.writeFileSync(path.join(paths.v3, 'tests/a.test.js'), '');
  for (const name of ['qollock', 'showrank']) {
    const lane = projectConfig(name, dir).lane;
    for (const sub of ['panorama/scripts', 'tests']) fs.mkdirSync(path.join(lane, sub), { recursive: true });
    fs.writeFileSync(path.join(lane, 'tests', name + '.test.js'), '');
  }
  for (const file of [paths.vpkToolCandidates[0], paths.viewerCandidates[0], paths.showrankRepoVpk]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'stub');
  }
  return paths;
}

test('wrapper test discovery includes a newly added suite and excludes non-test helpers', async t => {
  const dir = temporary(t);
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'), 'require("node:test")("existing suite",()=>{});');
  fs.writeFileSync(path.join(dir, 'tests/future.test.js'), 'require("node:test")("future suite",()=>{});');
  fs.writeFileSync(path.join(dir, 'tests/helper.js'), 'throw new Error("helper must not execute");');
  // The suite discovers test paths; there is no hard-coded list.
  const selected = build.testFiles(fs, path.join(dir, 'tests'));
  assert.deepEqual(selected.map(f => path.basename(f)), ['a.test.js', 'future.test.js']);
  const result = spawnSync(process.execPath, ['--test', ...selected], { encoding: 'utf8', env: childEnv(), timeout: 20000 });
  assert.equal(result.status, 0, result.error || result.stdout + result.stderr);
  assert.match(result.stdout, /existing suite/);
  assert.match(result.stdout, /future suite/);

  // All three lanes run the same staged v3 suite (cache key, then every discovered v3 test) through the one
  // shared pipeline, then their own lane suite, before compiling.
  const repoDir = path.join(dir, 'repo');
  const paths = fakeRepo(repoDir);
  for (const project of PROJECT_NAMES) {
    const steps = [];
    const config = projectConfig(project, repoDir);
    const stage = stagePaths(config, 'release');
    const deps = {
      fs, env: { HPV3_SUITE_CACHE: '0' }, execPath: 'node', platform: process.platform, log() {}, warn() {},
      now: Date.now, sleep: async () => {},
      spawnSync: (cmd, args, options) => {
        if (cmd === 'node' && args[0] === '--test') {
          const tap = args.find(f => /^--test-reporter-destination=.*\.tap$/.test(f));
          assert.deepEqual(args.slice(1, 4), ['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=tap'], 'spec on the console, TAP to a file');
          steps.push('test ' + args.slice(5).map(f => path.relative(repoDir, f).replace(/\\/g, '/')).join(',') + ' > ' + path.relative(stage.stage, tap.slice(tap.indexOf('=') + 1)));
          assert.equal(options.env.HPV3_SOURCE_ROOT, stage.stageSource);
          return { status: 0 };
        }
        if (cmd === 'node') {
          const name = path.basename(args[0]);
          if (name === 'suite-cache.js') { steps.push('suite-cache ' + args.slice(1).join(' ').replace(repoDir, '')); return { status: 0, stdout: 'f'.repeat(64) + '\n' }; }
          if (name === 'qollock.js' && args[1] === '--verify-inputs') return { status: 0, stdout: 'pin ok\n' + path.join(repoDir, 'pak03_dir.vpk') + '\n' };
          return { status: 0, stdout: '' };
        }
        if (cmd === paths.viewerCandidates[0]) return { status: 0, stdout: 'panorama/scripts/showrank_barebones.vjs_c CRC:1 size:1\n' };
        if (cmd === 'dotnet') return { status: 1, stdout: '' };
        return { status: 1, error: new Error('unexpected ' + cmd) };
      },
      spawn: () => { steps.push('compile'); throw new Error('stop at compile'); }
    };
    await assert.rejects(build.buildProject(project, { skipDeploy: true, installedSteamInf: path.join(repoDir, 'citadel', 'steam.inf') }, deps, repoDir), /stop at compile/);
    const laneTest = config.lane ? ['test ' + path.relative(repoDir, path.join(config.lane, 'tests', project + '.test.js')).replace(/\\/g, '/') + ' > lane-suite.tap'] : [];
    assert.deepEqual(steps, ['suite-cache --key ' + stage.stageSource.slice(repoDir.length) + ' release', 'test hp_colors_rewrite_v3/tests/a.test.js > suite.tap', ...laneTest, 'compile'], project);
  }
});

test('the staged suite runs once per identical inputs and again after any input changes', t => {
  // A throwaway repo root with the real cache tool and the build's suite step; the suite prints a line when it runs.
  const dir = temporary(t), v3 = path.join(dir, 'hp_colors_rewrite_v3'), stage = path.join(dir, 'stage');
  for (const sub of ['tools', 'tests']) fs.mkdirSync(path.join(v3, sub), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts')); fs.mkdirSync(path.join(stage, 'panorama'), { recursive: true });
  fs.copyFileSync(path.join(root, 'tools/suite-cache.js'), path.join(v3, 'tools/suite-cache.js'));
  fs.copyFileSync(path.join(repo, 'scripts', 'hp-colors-panorama-test-adapter.js'), path.join(dir, 'scripts', 'hp-colors-panorama-test-adapter.js'));
  fs.writeFileSync(path.join(v3, 'tests/a.test.js'), 'require("node:test")("SUITE_RAN",()=>{});');
  fs.writeFileSync(path.join(stage, 'panorama/x.js'), 'one');
  const run = (extra = {}) => {
    const record = { calls: [], stdout: '', stderr: '' };
    const logs = [];
    const deps = { fs, spawnSync: capturingSpawn(record), execPath: process.execPath, now: Date.now, log: m => logs.push(m) };
    try { build.runV3Suite(deps, repoPaths(dir), stage, 'release', childEnv(extra)); }
    catch (err) { assert.fail(err.message + '\n' + record.stdout + record.stderr); }
    return /SUITE_RAN/.test(record.stdout) ? 'ran' : logs.some(l => /not rerun/.test(l)) ? 'cached' : record.stdout;
  };
  assert.equal(run(), 'ran');
  assert.equal(run(), 'cached', 'identical inputs: not rerun');
  fs.writeFileSync(path.join(stage, 'panorama/x.js'), 'two');
  assert.equal(run(), 'ran', 'a staged file changed');
  fs.writeFileSync(path.join(v3, 'tests/a.test.js'), 'require("node:test")("SUITE_RAN",()=>{}); // edited');
  assert.equal(run(), 'ran', 'a test changed');
  assert.equal(run({ HPV3_SUITE_CACHE: '0' }), 'ran', 'HPV3_SUITE_CACHE=0 always runs');
  // Another lane's stage with the same content shares the key (stage paths are relative to its root).
  const { key } = require(path.join(v3, 'tools/suite-cache.js'));
  const other = path.join(dir, 'other', 'stage'); fs.mkdirSync(path.join(other, 'panorama'), { recursive: true });
  fs.writeFileSync(path.join(other, 'panorama/x.js'), 'two');
  assert.equal(key(other, 'release'), key(stage, 'release'));
  assert.notEqual(key(stage, 'debug'), key(stage, 'release'), 'modes never share a pass');
  // Inputs outside the v3 tree that the suite reads: the repo ignore rules (git check-ignore in the
  // build-evidence test) and every HPV3_* variable the suite's sources read.
  const before = key(stage, 'release');
  fs.writeFileSync(path.join(dir, '.gitignore'), '/hp_colors_rewrite_v3/.build/\n');
  const ignored = key(stage, 'release'); assert.notEqual(ignored, before, '.gitignore added');
  fs.writeFileSync(path.join(dir, '.gitignore'), '# entry removed\n');
  assert.notEqual(key(stage, 'release'), ignored, '.gitignore entry removed');
  assert.equal(run(), 'ran', 'the build reruns after an ignore-rule change');
  fs.writeFileSync(path.join(v3, 'tests/a.test.js'), 'require("node:test")("SUITE_RAN",()=>{}); void process.env.HPV3_STORE_REF;');
  const envKey = () => require(path.join(v3, 'tools/suite-cache.js')).key(stage, 'release');
  const saved = process.env.HPV3_STORE_REF;
  try {
    delete process.env.HPV3_STORE_REF; const unset = envKey();
    process.env.HPV3_STORE_REF = 'abc'; const set = envKey();
    assert.notEqual(set, unset, 'a read HPV3_* variable is keyed');
    process.env.HPV3_STORE_REF = ''; assert.notEqual(envKey(), unset, 'empty differs from unset');
  } finally { if (saved === undefined) delete process.env.HPV3_STORE_REF; else process.env.HPV3_STORE_REF = saved; }
  // The build tooling itself is keyed through the v3 tree hash (tools/build.js lives in it).
  const toolKey = key(stage, 'release');
  fs.mkdirSync(path.join(v3, 'tools/lib'), { recursive: true });
  fs.writeFileSync(path.join(v3, 'tools/lib/projects.js'), '// changed');
  assert.notEqual(key(stage, 'release'), toolKey, 'a build-tool change is keyed');
  // The keyed hpv2-store checkout path is the one store-page.test.js reads.
  const { STORE } = require(path.join(root, 'tools/suite-cache.js'));
  assert.ok(fs.readFileSync(path.join(root, 'tests/store-page.test.js'), 'utf8').includes("fs.existsSync('" + STORE + "')"));
});

test('build evidence is ignored', () => {
  assert.match(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^\/?hp_colors_rewrite_v3\/\.build\/[ \t]*\r?$/m);
  const ignored = spawnSync('git', ['check-ignore', '--no-index', 'hp_colors_rewrite_v3/.build/evidence/probe.log'], { cwd: repo, encoding: 'utf8' });
  assert.equal(ignored.status, 0, ignored.stderr);
  assert.match(ignored.stdout, /hp_colors_rewrite_v3\/\.build\/evidence\/probe\.log/);
});

test('timer asset contract loads only its role entry and packages both without the retired combined script',()=>{
 const includes=layout=>[...fs.readFileSync(path.join(root,'panorama/layout',layout),'utf8').matchAll(/src="s2r:\/\/panorama\/scripts\/([^"]+)\.vjs_c"/g)].map(m=>m[1]).filter(name=>name.startsWith('hp_colors_v3_timers'));
 assert.deepEqual(includes('unit_status_overlay_v2.xml'),['hp_colors_v3_timers_world']);
 assert.deepEqual(includes('citadel_hud_top_bar.xml'),['hp_colors_v3_timers_hud']);
 assert.deepEqual(includes('hud_escape_menu.xml'),[]);
 for(const role of ['world','hud']){
  assert.ok(fs.existsSync(path.join(root,'panorama/scripts/hp_colors_v3_timers_'+role+'.js')));
  assert.ok(HPV3_ASSETS.includes('panorama/scripts/hp_colors_v3_timers_'+role+'.vjs_c'));
 }
 assert.equal(fs.existsSync(path.join(root,'panorama/scripts/hp_colors_v3_timers.js')),false);
 assert.ok(!HPV3_ASSETS.includes('panorama/scripts/hp_colors_v3_timers.vjs_c'));
 for(const project of PROJECT_NAMES){
  const config=projectConfig(project);
  assert.ok(config.forbidden.includes('panorama/scripts/hp_colors_v3_timers.vjs_c'),project);
  assert.ok(!config.assets.includes('panorama/scripts/hp_colors_v3_timers.vjs_c'),project);
 }
});
