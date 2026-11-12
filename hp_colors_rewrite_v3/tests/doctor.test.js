'use strict';
// tools/doctor.js: every check through injected fs/spawnSync/env, so PASS/WARN/FAIL never depend on the
// real machine.
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const doctor = require('../tools/doctor');
const { repoPaths } = require('../tools/lib/projects');

const ROOT = path.resolve(path.sep, 'fake-repo');
const P = repoPaths(ROOT);
const STEAM = path.resolve(path.sep, 'steam', 'citadel', 'steam.inf');
const DOTA = path.resolve(path.sep, 'dota 2 beta');

function fakeFs(files) {
  const map = new Map(Object.entries(files).map(([k, v]) => [path.resolve(k), v]));
  const isDir = p => [...map.keys()].some(k => k.startsWith(path.resolve(p) + path.sep));
  return {
    existsSync: p => map.has(path.resolve(p)) || isDir(p),
    readFileSync: p => {
      const key = path.resolve(p);
      if (!map.has(key)) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
      return map.get(key);
    },
    readdirSync: p => [...new Set([...map.keys()].filter(k => path.dirname(k) === path.resolve(p)).map(k => path.basename(k)))]
  };
}

const runtimeConfig = major => JSON.stringify({ runtimeOptions: { tfm: `net${major}.0`, framework: { name: 'Microsoft.NETCore.App', version: `${major}.0.0` } } });
const listRuntimes = (...versions) => versions.map(v => `Microsoft.NETCore.App ${v} [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]`).join('\r\n') + '\r\n';

// A healthy machine; tests override pieces.
function healthyFiles() {
  return {
    [P.compiler]: 'exe',
    [path.join(P.compilerDir, 'New folder.runtimeconfig.json')]: runtimeConfig(9),
    [P.prefJson]: JSON.stringify({ directory: DOTA }),
    [path.join(DOTA, 'game', 'dota', 'gameinfo.gi')]: '',
    [STEAM]: 'ClientVersion=1',
    [P.pin]: JSON.stringify({ commit: 'cc1878831d359fa8ed741db947835e331bbeec59', clientVersion: 1 }),
    [P.vpkToolCandidates[0]]: 'exe',
    [P.viewerCandidates[1]]: 'exe',
    [P.showrankRepoVpk]: 'vpk',
    [P.record]: JSON.stringify({ release: '3.7.0' }),
    [P.news]: JSON.stringify([{ id: 'a', release: '3.6.0' }, { id: 'b', release: '3.7.0' }, { id: 'c', release: '3.5.0' }])
  };
}

function fakeSpawn(overrides = {}) {
  const calls = [];
  const fn = (cmd, args) => {
    calls.push([cmd, ...args]);
    const name = path.basename(String(args[0] || ''));
    if (cmd === 'dotnet' && args[0] === '--list-runtimes') return overrides.dotnet || { status: 0, stdout: listRuntimes('8.0.33', '9.0.4', '10.0.14') };
    if (path.basename(cmd) === 'dotnet.exe') return { status: 1, stdout: '' };
    if (cmd === 'git') return overrides.git || { status: 0, stdout: ' M a\n?? b\n' };
    if (path.basename(cmd) === 'Source2Viewer-CLI.exe') return overrides.viewer || { status: 0, stdout: 'panorama/scripts/showrank_barebones.vjs_c CRC:abc size:10\r\n' };
    if (name === 'game-data.js') return overrides.gameData || { status: 0, stdout: 'Installed ClientVersion matches pin\n' };
    if (overrides[name]) return overrides[name];
    if (/\.js$/.test(name)) return { status: 0, stdout: '' };
    return { status: 1, error: new Error(`unexpected spawn ${cmd}`) };
  };
  fn.calls = calls;
  return fn;
}

function run(opts = {}, { files = healthyFiles(), spawn = fakeSpawn(), env = {}, nodeVersion = 'v22.1.0' } = {}) {
  const parsed = doctor.parseArgs(['--installed-steam-inf', STEAM, ...(opts.argv || [])]);
  return doctor.runDoctor(parsed, { fs: fakeFs(files), spawnSync: spawn, env, execPath: 'node', nodeVersion, root: ROOT });
}
const byId = (report, id) => report.results.filter(r => r.id === id);
const one = (report, id) => {
  const rows = byId(report, id);
  assert.equal(rows.length, 1, `${id}: ${JSON.stringify(rows)}`);
  return rows[0];
};

test('argument parsing: project defaults to all, --only validates ids', () => {
  const opts = doctor.parseArgs([]);
  assert.equal(opts.project, 'all');
  assert.deepEqual(opts.projects, ['v3', 'qollock', 'showrank']);
  assert.deepEqual(doctor.parseArgs(['--only', 'node,git', '--json', '--fix-hints']).only, ['node', 'git']);
  assert.throws(() => doctor.parseArgs(['--only', 'nope']), /Unknown check/);
  assert.throws(() => doctor.parseArgs(['--project', 'v4']), /Unknown project/);
  assert.throws(() => doctor.parseArgs(['--bogus']), /Unknown argument/);
});

test('healthy machine: every check passes and the report is ok', () => {
  const report = run();
  assert.equal(report.ok, true);
  for (const r of report.results) assert.ok(['PASS', 'INFO'].includes(r.status), JSON.stringify(r));
  assert.equal(one(report, 'git').detail, '2 changed/untracked path(s)');
});

test('node: old Node fails', () => {
  assert.equal(one(run({}, { nodeVersion: 'v22.0.0' }), 'node').status, 'PASS');
  assert.equal(one(run({}, { nodeVersion: 'v16.20.0' }), 'node').status, 'FAIL');
});

test('compiler .NET: present PASS, only a higher major WARN (roll-forward), lower only or no host FAIL', () => {
  assert.equal(one(run(), 'compiler').status, 'PASS');
  const warn = one(run({}, { spawn: fakeSpawn({ dotnet: { status: 0, stdout: listRuntimes('8.0.33', '10.0.14') } }) }), 'compiler');
  assert.equal(warn.status, 'WARN');
  assert.match(warn.detail, /9\.x missing; 10\.0\.14 available via DOTNET_ROLL_FORWARD=Major/);
  assert.equal(one(run({}, { spawn: fakeSpawn({ dotnet: { status: 0, stdout: listRuntimes('8.0.33') } }) }), 'compiler').status, 'FAIL');
  assert.equal(one(run({}, { spawn: fakeSpawn({ dotnet: { status: null, error: new Error('ENOENT') } }) }), 'compiler').status, 'FAIL');
  const files = healthyFiles();
  delete files[P.compiler];
  assert.equal(one(run({}, { files }), 'compiler').status, 'FAIL');
});

test('pref.json: directory must exist', () => {
  const files = healthyFiles();
  files[P.prefJson] = JSON.stringify({ directory: path.resolve(path.sep, 'missing') });
  assert.equal(one(run({}, { files }), 'pref').status, 'FAIL');
  delete files[P.prefJson];
  assert.equal(one(run({}, { files }), 'pref').status, 'FAIL');
});

test('steam.inf: discovered install and installed-vs-pin side by side; absent or mismatch WARNs', () => {
  const rows = report => byId(report, 'steam').map(r => [r.name, r.status, r.detail]);
  const ok = rows(run());
  assert.deepEqual(ok.map(r => r.slice(0, 2)), [['Deadlock install', 'PASS'], ['Installed vs pin', 'PASS']]);
  assert.ok(ok[0][2].startsWith(STEAM + ' (--installed-steam-inf) ClientVersion=1'), ok[0][2]);
  assert.match(ok[1][2], /installed ClientVersion=1 = pin ClientVersion=1 \(cc1878831d35\)/);

  const files = healthyFiles();
  files[STEAM] = 'ClientVersion=6861\n';
  const mismatch = rows(run({}, { files }));
  assert.deepEqual(mismatch[1].slice(0, 2), ['Installed vs pin', 'WARN']);
  assert.ok(mismatch[1][2].startsWith('Installed game ClientVersion mismatch: installed=6861 pinned=1 (' + STEAM + ').'), mismatch[1][2]);
  assert.match(mismatch[1][2], /rebase the pin.*or pass --allow-pin-mismatch/);

  delete files[STEAM];
  const absent = rows(run({}, { files }));
  assert.deepEqual(absent.map(r => r[1]), ['WARN', 'INFO']);
  assert.match(absent[0][2], /absent; the offline pin is used/);
  assert.match(absent[1][2], /installed ClientVersion unknown; pin ClientVersion=1/);

  // No flag: discovery (here: nothing on a fake machine) reports not found.
  const report = doctor.runDoctor(doctor.parseArgs(['--only', 'steam']), { fs: fakeFs(healthyFiles()), spawnSync: fakeSpawn(), env: {}, execPath: 'node', nodeVersion: 'v22.0.0', root: ROOT, platform: 'win32' });
  assert.match(byId(report, 'steam')[0].detail, /^not found \(checked \d+ path\(s\)\)/);
});

test('vpk and viewer: the wrappers\' Get-RepoToolPath candidates', () => {
  const files = healthyFiles();
  delete files[P.vpkToolCandidates[0]];
  const report = run({}, { files });
  assert.equal(one(report, 'vpk').status, 'FAIL');
  assert.equal(one(report, 'viewer').status, 'PASS');
  files[P.vpkToolCandidates[1]] = 'exe';
  assert.equal(one(run({}, { files }), 'vpk').status, 'PASS');
});

test('showrank-dep: only for the showrank project; missing or empty vpk fails', () => {
  assert.equal(byId(run({ argv: ['--project', 'v3'] }), 'showrank-dep').length, 0);
  assert.equal(one(run({ argv: ['--project', 'showrank'] }), 'showrank-dep').status, 'PASS');
  assert.equal(one(run({}, { spawn: fakeSpawn({ viewer: { status: 0, stdout: 'panorama/other.vjs_c\n' } }) }), 'showrank-dep').status, 'FAIL');
  const files = healthyFiles();
  delete files[P.showrankRepoVpk];
  assert.equal(one(run({}, { files }), 'showrank-dep').status, 'FAIL');
});

test('generators: per project, generate.js checked once for all', () => {
  const spawn = fakeSpawn({ 'qollock.js': { status: 1, stderr: 'stale: hud_escape_menu.xml' } });
  const report = run({}, { spawn });
  const rows = byId(report, 'generators');
  assert.deepEqual(rows.map(r => r.name.split(': ')[1]), ['generate.js', 'qollock.js', 'showrank.js']);
  assert.deepEqual(rows.map(r => r.status), ['PASS', 'FAIL', 'PASS']);
  assert.match(rows[1].detail, /stale/);
  for (const r of rows) assert.ok(spawn.calls.some(c => path.basename(c[1] || '') === r.name.split(': ')[1] && c.includes('--check')));
  assert.equal(report.ok, false);
  assert.deepEqual(byId(run({ argv: ['--project', 'v3'] }), 'generators').map(r => r.name), ['Generator current: generate.js']);
});

test('release: record.json vs newest news.json release', () => {
  const files = healthyFiles();
  assert.equal(one(run({}, { files }), 'release').status, 'PASS');
  files[P.record] = JSON.stringify({ release: '3.6.0' });
  assert.equal(one(run({}, { files }), 'release').status, 'FAIL');
  files[P.record] = JSON.stringify({ release: '3.8.0' });
  assert.equal(one(run({}, { files }), 'release').status, 'WARN');
  assert.equal(doctor.compareVersions('3.10.0', '3.9.9'), 1);
});

test('--only limits checks; main prints table/json and exits 1 on FAIL', () => {
  const report = run({ argv: ['--only', 'node,git'] });
  assert.deepEqual(report.results.map(r => r.id), ['node', 'git']);

  const out = [];
  const deps = { fs: fakeFs(healthyFiles()), spawnSync: fakeSpawn({ dotnet: { status: 0, stdout: listRuntimes('10.0.14') } }), env: {}, execPath: 'node', nodeVersion: 'v22.0.0', root: ROOT };
  assert.equal(doctor.main(['--installed-steam-inf', STEAM, '--fix-hints'], deps, s => out.push(s)), 0);
  assert.match(out[0], /^STATUS\s+CHECK\s+NAME\s+DETAIL/);
  assert.match(out[0], /WARN\s+compiler/);
  assert.match(out[0], /Fix hints:\n {2}\[compiler\]/);

  out.length = 0;
  deps.fs = fakeFs(Object.fromEntries(Object.entries(healthyFiles()).filter(([k]) => k !== P.compiler)));
  assert.equal(doctor.main(['--installed-steam-inf', STEAM, '--json'], deps, s => out.push(s)), 1);
  const json = JSON.parse(out[0]);
  assert.equal(json.ok, false);
  assert.equal(json.results.find(r => r.id === 'compiler').status, 'FAIL');
  assert.ok(json.results.every(r => !('hint' in r)));
  assert.equal(doctor.main(['--nope'], deps, () => {}), 2);
});
