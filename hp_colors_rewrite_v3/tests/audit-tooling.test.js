'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.dirname(root);
const wrapper = fs.readFileSync(path.join(repo, 'build_hp_colors_rewrite_v3.ps1'), 'utf8');
const pipelineScript = fs.readFileSync(path.join(repo, 'scripts/hp-colors-v3-pipeline.ps1'), 'utf8');
const quote = value => "'" + value.replace(/'/g, "''") + "'";
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-wrapper-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function powershell(file, args = []) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // The isolated node runner must emit stdout, not parent-runner IPC.
  return spawnSync(process.platform === 'win32' ? 'powershell' : 'pwsh',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], { encoding: 'utf8', timeout: 20000, env });
}

test('wrapper rejects an installed-version mismatch before any build work and forwards the explicit override', t => {
  const dir = temporary(t);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'game-data-pin.json')));
  const steam = path.join(dir, 'steam.inf');
  fs.writeFileSync(steam, 'ClientVersion=' + (manifest.clientVersion + 1) + '\n');
  // Execute only the real offline preflight; tool resolution, cleanup and compilation are never included.
  const end = wrapper.indexOf('$mode =');
  assert.ok(end > 0);
  const file = path.join(dir, 'preflight.ps1');
  fs.writeFileSync(file, wrapper.slice(0, end).replace('$root = $PSScriptRoot', '$root = ' + quote(repo)) + '\nWrite-Output "PREFLIGHT_OK"\n');
  const rejected = powershell(file, ['-SkipDeploy', '-InstalledSteamInf', steam]);
  assert.equal(rejected.status, 1, rejected.error || rejected.stdout + rejected.stderr);
  assert.match(rejected.stderr, /ClientVersion mismatch/);
  assert.doesNotMatch(rejected.stdout, /PREFLIGHT_OK/);
  const allowed = powershell(file, ['-SkipDeploy', '-InstalledSteamInf', steam, '-AllowPinMismatch']);
  assert.equal(allowed.status, 0, allowed.error || allowed.stdout + allowed.stderr);
  assert.match(allowed.stderr, /WARNING.*ClientVersion mismatch/);
  assert.match(allowed.stdout, /PREFLIGHT_OK/);
});

test('wrapper test discovery includes a newly added suite and excludes non-test helpers', t => {
  const dir = temporary(t);
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'), 'require("node:test")("existing suite",()=>{});');
  fs.writeFileSync(path.join(dir, 'tests/future.test.js'), 'require("node:test")("future suite",()=>{});');
  fs.writeFileSync(path.join(dir, 'tests/helper.js'), 'throw new Error("helper must not execute");');
  // The staged suite runs through Invoke-HpV3Suite in the shared pipeline, used by all three wrappers.
  for (const name of ['build_hp_colors_rewrite_v3.ps1', 'build_hp_colors_rewrite_v3_qollock.ps1', 'build_hp_colors_rewrite_v3_showrank.ps1'])
    assert.match(fs.readFileSync(path.join(repo, name), 'utf8'), /Invoke-HpV3Suite -Root \$root -StageSource \$stageSource -Mode \$mode/, name);
  const selection = pipelineScript.match(/^[ \t]*\$testFiles =[^\r\n]+\r?\n[ \t]*& node --test @testFiles/m);
  assert.ok(selection, 'the suite must discover test paths, not maintain a hard-coded list');
  const file = path.join(dir, 'discovery.ps1');
  fs.writeFileSync(file, '$ErrorActionPreference = "Stop"\n$v3 = ' + quote(dir) + '\n' + selection[0] + '\nexit $LASTEXITCODE\n');
  const result = powershell(file);
  assert.equal(result.status, 0, result.error || result.stdout + result.stderr);
  assert.match(result.stdout, /existing suite/);
  assert.match(result.stdout, /future suite/);
});

test('the staged suite runs once per identical inputs and again after any input changes', t => {
  // A throwaway repo root with the real cache tool and pipeline; the suite prints a line when it runs.
  const dir = temporary(t), v3 = path.join(dir, 'hp_colors_rewrite_v3'), stage = path.join(dir, 'stage');
  for (const sub of ['tools', 'tests']) fs.mkdirSync(path.join(v3, sub), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts')); fs.mkdirSync(path.join(stage, 'panorama'), { recursive: true });
  fs.copyFileSync(path.join(root, 'tools/suite-cache.js'), path.join(v3, 'tools/suite-cache.js'));
  for (const name of ['hp-colors-panorama-test-adapter.js', 'hp-colors-v3-pipeline.ps1', 'source2_package_pipeline.ps1'])
    fs.copyFileSync(path.join(repo, 'scripts', name), path.join(dir, 'scripts', name));
  fs.writeFileSync(path.join(v3, 'tests/a.test.js'), 'require("node:test")("SUITE_RAN",()=>{});');
  fs.writeFileSync(path.join(stage, 'panorama/x.js'), 'one');
  const run = (extra = '') => {
    const file = path.join(dir, 'run.ps1');
    fs.writeFileSync(file, '$ErrorActionPreference = "Stop"\n' + extra + '. ' + quote(path.join(dir, 'scripts/hp-colors-v3-pipeline.ps1')) + '\n' +
      'Invoke-HpV3Suite -Root ' + quote(dir) + ' -StageSource ' + quote(stage) + ' -Mode release\n');
    const result = powershell(file); assert.equal(result.status, 0, result.error || result.stdout + result.stderr);
    return /SUITE_RAN/.test(result.stdout) ? 'ran' : /not rerun/.test(result.stdout) ? 'cached' : result.stdout;
  };
  assert.equal(run(), 'ran');
  assert.equal(run(), 'cached', 'identical inputs: not rerun');
  fs.writeFileSync(path.join(stage, 'panorama/x.js'), 'two');
  assert.equal(run(), 'ran', 'a staged file changed');
  fs.writeFileSync(path.join(v3, 'tests/a.test.js'), 'require("node:test")("SUITE_RAN",()=>{}); // edited');
  assert.equal(run(), 'ran', 'a test changed');
  assert.equal(run('$env:HPV3_SUITE_CACHE = "0"\n'), 'ran', 'HPV3_SUITE_CACHE=0 always runs');
  // Another wrapper's stage with the same content shares the key (stage paths are relative to its root).
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
  assert.equal(run(), 'ran', 'the wrapper reruns after an ignore-rule change');
  fs.writeFileSync(path.join(v3, 'tests/a.test.js'), 'require("node:test")("SUITE_RAN",()=>{}); void process.env.HPV3_STORE_REF;');
  const envKey = () => require(path.join(v3, 'tools/suite-cache.js')).key(stage, 'release');
  const saved = process.env.HPV3_STORE_REF;
  try {
    delete process.env.HPV3_STORE_REF; const unset = envKey();
    process.env.HPV3_STORE_REF = 'abc'; const set = envKey();
    assert.notEqual(set, unset, 'a read HPV3_* variable is keyed');
    process.env.HPV3_STORE_REF = ''; assert.notEqual(envKey(), unset, 'empty differs from unset');
  } finally { if (saved === undefined) delete process.env.HPV3_STORE_REF; else process.env.HPV3_STORE_REF = saved; }
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
 const pipeline=fs.readFileSync(path.join(repo,'scripts/hp-colors-v3-pipeline.ps1'),'utf8');
 for(const role of ['world','hud']){
  assert.ok(fs.existsSync(path.join(root,'panorama/scripts/hp_colors_v3_timers_'+role+'.js')));
  assert.ok(pipeline.includes("'panorama/scripts/hp_colors_v3_timers_"+role+".vjs_c'"));
 }
 assert.equal(fs.existsSync(path.join(root,'panorama/scripts/hp_colors_v3_timers.js')),false);
 assert.ok(!pipeline.includes("'panorama/scripts/hp_colors_v3_timers.vjs_c'"));
 for(const file of ['build_hp_colors_rewrite_v3.ps1','build_hp_colors_rewrite_v3_qollock.ps1']){
  const forbidden=fs.readFileSync(path.join(repo,file),'utf8').split('\n').find(line=>line.includes('-Forbidden @'));
  assert.ok(forbidden.includes("'panorama/scripts/hp_colors_v3_timers.vjs_c'"));
 }
});
