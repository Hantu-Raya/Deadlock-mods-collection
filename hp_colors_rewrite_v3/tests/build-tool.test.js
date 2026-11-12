'use strict';
// tools/build.js (the lane build; it replaced the PowerShell wrappers): pure parts and the compile /
// pack steps with injected spawn, never the real compiler or game folder.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const build = require('../tools/build');
const { repoPaths, projectConfig, stagePaths, HPV3_ASSETS, sourceName } = require('../tools/lib/projects');
const toolchain = require('../tools/lib/toolchain');

const DOTNET_MISSING = [
  'You must install or update .NET to run this application.', '',
  'App: D:\\repo\\sr2compiler\\New folder.exe', 'Architecture: x64',
  "Framework: 'Microsoft.NETCore.App', version '9.0.0' (x64)", '.NET location: C:\\Program Files\\dotnet\\'
].join('\r\n');
const READKEY_STDERR = 'Unhandled exception. System.InvalidOperationException: Cannot read keys when either application does not have a console or when console input has been redirected.\r\n   at System.ConsolePal.ReadKey(Boolean intercept)\r\n';

function tempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-build-tool-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('parseArgs mirrors the wrapper switches', () => {
  const opts = build.parseArgs(['--project', 'qollock', '--debug', '--skip-deploy', '--allow-pin-mismatch', '--installed-steam-inf', 'X:\\steam.inf']);
  assert.deepEqual([opts.projects, opts.debug, opts.skipDeploy, opts.allowPinMismatch, opts.installedSteamInf], [['qollock'], true, true, true, 'X:\\steam.inf']);
  assert.deepEqual(build.parseArgs(['--project=all', '--skip-deploy', '--check-upstream']).projects, ['v3', 'qollock', 'showrank']);
  assert.equal(build.parseArgs(['--project', 'v3']).skipDeploy, false);
  assert.throws(() => build.parseArgs([]), /--project is required/);
  assert.throws(() => build.parseArgs(['--project', 'v4']), /Unknown project/);
  assert.throws(() => build.parseArgs(['--project', 'showrank', '--check-upstream']), /v3 project only/);
  assert.throws(() => build.parseArgs(['--project', 'v3', '--skip-suite']), /Unknown argument/);
  assert.throws(() => build.parseArgs(['--project']), /needs a value/);
  assert.equal(build.parseArgs(['--help']).help, true);
});

// HPV3_ASSETS is panorama/** of the v3 lane compiled; the layouts' include lists must name exactly its owned sheets and scripts.
// The include lists are read in a child process: a require() here would map tools/lib/stock-layouts.js to this suite
// (tests/quick-test.test.js keeps the generator's lib files mapped exactly like generate.js).
test('shipped asset list agrees with the include lists of the stock layouts', () => {
  const script = 'const l = require(process.argv[1]); process.stdout.write(JSON.stringify({ OWNED_STYLES: l.OWNED_STYLES, OWNED_SCRIPTS: l.OWNED_SCRIPTS }))';
  const child = require('node:child_process').spawnSync(process.execPath, ['-e', script, path.join(__dirname, '..', 'tools', 'lib', 'stock-layouts.js')], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const { OWNED_STYLES, OWNED_SCRIPTS } = JSON.parse(child.stdout);
  const styles = HPV3_ASSETS.filter(asset => asset.startsWith('panorama/styles/')).map(asset => path.basename(sourceName(asset), '.css'));
  assert.deepEqual([...styles].sort(), [...OWNED_STYLES, 'unit_status_v2'].sort());
  const scripts = HPV3_ASSETS.filter(asset => asset.startsWith('panorama/scripts/')).map(asset => path.basename(sourceName(asset), '.js'));
  assert.deepEqual([...scripts].sort(), [...OWNED_SCRIPTS].sort());
  assert.equal(sourceName('panorama/layout/hud_escape_menu.vxml_c'), 'panorama/layout/hud_escape_menu.xml');
});

test('project contracts match the wrappers', () => {
  const root = path.resolve(path.sep, 'r');
  assert.equal(HPV3_ASSETS.length, 22);
  const q = projectConfig('qollock', root);
  assert.ok(q.assets.includes('panorama/scripts/hp_colors_v3_qollock_bridge.vjs_c'));
  assert.ok(q.forbidden.includes('ql_') && q.forbidden.includes('panorama/layout/hud.vxml_c'));
  assert.ok(projectConfig('showrank', root).forbidden.includes('showrank_barebones'));
  const s = stagePaths(projectConfig('v3', root), 'debug');
  assert.equal(s.stage, path.join(root, 'hp_colors_rewrite_v3', '.build', 'debug'));
  assert.equal(s.vpk, path.join(s.stage, 'pak02_dir.vpk'));
  assert.equal(stagePaths(q, 'release').stageSource, path.join(root, 'hp_colors_rewrite_v3_qollock', '.build', 'release', 'hp_colors_rewrite_v3'));
  assert.equal(projectConfig('v3', root).complete('release', 'x.vpk'), 'HPV3 release build complete: x.vpk');
});

test('runtime detection: present, roll-forward (once, child env only), missing', () => {
  const config = { name: 'Microsoft.NETCore.App', version: '9.0.0', major: 9 };
  const runtimes = toolchain.parseListRuntimes('Microsoft.NETCore.App 8.0.33 [C:\\x]\r\nMicrosoft.NETCore.App 10.0.14 [C:\\x]\r\nMicrosoft.WindowsDesktop.App 10.0.14 [C:\\x]\r\n');
  assert.deepEqual(runtimes.map(r => r.major), [8, 10, 10]);
  const rf = toolchain.decideRuntime(config, runtimes, {});
  assert.equal(rf.status, 'roll-forward');
  assert.deepEqual(rf.env, { DOTNET_ROLL_FORWARD: 'Major' });
  assert.match(rf.logLine, /\.NET 9 .*10\.0\.14 with DOTNET_ROLL_FORWARD=Major \(compiler process only\)/);
  assert.deepEqual(toolchain.decideRuntime(config, runtimes, { DOTNET_ROLL_FORWARD: 'LatestMajor' }).env, {});
  assert.equal(toolchain.decideRuntime(config, [...runtimes, { name: config.name, version: '9.0.4', major: 9 }]).status, 'present');
  assert.equal(toolchain.decideRuntime(config, runtimes.slice(0, 1)).status, 'missing');
});

test('packed-listing helpers follow Test-PackedAsset / Assert-PackedVpkAssets', () => {
  const tree = toolchain.stripListing(['  panorama/scripts/hp_colors_v3_menu.vjs_c CRC:0a1B size:12 ', '', 'panorama/layout/HUD_escape_menu.vxml_c CRC:ff size:1']);
  assert.deepEqual(tree, ['panorama/scripts/hp_colors_v3_menu.vjs_c', 'panorama/layout/HUD_escape_menu.vxml_c']);
  assert.ok(toolchain.packedAssetPresent(tree, 'panorama/layout/hud_escape_menu.vxml_c'));
  assert.ok(toolchain.packedAssetPresent(tree, 'elsewhere/hp_colors_v3_menu.vjs_c'), 'leaf match counts');
  assert.ok(!toolchain.packedAssetPresent(tree, '.js'));
  assert.throws(() => toolchain.assertPackedAssets(tree, ['panorama/x.vjs_c'], [], 'HPV3 pak02'), /^Error: HPV3 pak02 missing required asset: panorama\/x\.vjs_c$/);
  assert.throws(() => toolchain.assertPackedAssets(tree, [], ['hud_escape'], 'L'), /L contains forbidden asset: hud_escape/);
  assert.ok(toolchain.sameSet(['b', 'A'], ['a', 'B']));
  assert.ok(!toolchain.sameSet(['a'], ['a', 'b']));
});

test('judgeCompile: outputs, summary, prompt and ReadKey exits', () => {
  const ok = { exitCode: 0, summaryLine: '20 compiled, 0 failed', missing: [], stoppedAtPrompt: false, stdoutText: '', stderrText: '' };
  assert.equal(toolchain.judgeCompile(ok), null);
  assert.match(toolchain.judgeCompile({ ...ok, stoppedAtPrompt: true, exitCode: null }), /Stopped compiler left at its exit prompt/);
  for (const code of [-532462766, 3762504530]) {
    assert.match(toolchain.judgeCompile({ ...ok, exitCode: code, stderrText: READKEY_STDERR }), /Accepted known redirected Console\.ReadKey exit/);
  }
  assert.throws(() => toolchain.judgeCompile({ ...ok, exitCode: 3 }), /Unexpected compiler exit 3/);
  assert.throws(() => toolchain.judgeCompile({ ...ok, summaryLine: '19 compiled, 1 failed' }), /Missing success summary or compiler failures/);
  assert.throws(() => toolchain.judgeCompile({ ...ok, summaryLine: null }), /Missing success summary/);
  assert.equal(toolchain.lastSummary('a\r\n1 compiled, 1 failed\r\n20 compiled, 0 failed\r\nPress any key to exit...'), '20 compiled, 0 failed');
});

test('missing outputs carry log tails and a one-line .NET cause', () => {
  let message;
  try { toolchain.judgeCompile({ exitCode: -2147450730, summaryLine: null, missing: ['panorama/a.vjs_c', 'panorama/b.vjs_c'], stoppedAtPrompt: false, stdoutText: 'line1\nline2\n', stderrText: DOTNET_MISSING }); }
  catch (err) { message = err.message; }
  const lines = message.split('\n');
  assert.equal(lines[0], 'Missing compiled outputs: panorama/a.vjs_c, panorama/b.vjs_c');
  assert.equal(lines[1], 'Cause: the compiler could not start because Microsoft.NETCore.App 9.0.0 is not installed; install that .NET major, or a higher one (the build then sets DOTNET_ROLL_FORWARD=Major).');
  assert.ok(message.includes('--- compile.stderr.log (last 20 lines) ---\nYou must install or update .NET'));
  assert.ok(message.includes('--- compile.stdout.log (last 20 lines) ---\nline1\nline2'));
  const long = Array.from({ length: 50 }, (_, i) => `out ${i}`).join('\n');
  const plain = toolchain.formatMissingOutputs(['x'], { stdoutText: long, stderrText: '' });
  assert.ok(!plain.includes('Cause:'));
  assert.ok(plain.includes('(empty)') && plain.includes('out 49') && !plain.includes('out 29\n'));
});

// A fake compiler child: writes the logs through the fds it was given, then exits (or waits for kill).
function fakeCompilerSpawn({ stdout = '', stderr = '', exitCode = 0, hang = false, outputs = [], compiled }) {
  const calls = [];
  const spawn = (file, args, options) => {
    calls.push({ file, args, options });
    fs.writeSync(options.stdio[1], stdout);
    fs.writeSync(options.stdio[2], stderr);
    for (const asset of outputs) {
      fs.mkdirSync(path.dirname(path.join(compiled, asset)), { recursive: true });
      fs.writeFileSync(path.join(compiled, asset), 'x');
    }
    const child = new EventEmitter();
    child.kill = () => { child.killed = true; setImmediate(() => child.emit('exit', null, 'SIGTERM')); return true; };
    if (!hang) setImmediate(() => child.emit('exit', exitCode, null));
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

function compilerFixture(t, { runtimes = 'Microsoft.NETCore.App 10.0.14 [C:\\x]\n', major = 9 } = {}) {
  const root = tempRoot(t);
  const paths = repoPaths(root);
  fs.mkdirSync(paths.compilerDir, { recursive: true });
  fs.writeFileSync(paths.compiler, 'exe');
  fs.writeFileSync(path.join(paths.compilerDir, 'New folder.runtimeconfig.json'), JSON.stringify({ runtimeOptions: { framework: { name: 'Microsoft.NETCore.App', version: `${major}.0.0` } } }));
  const stage = path.join(root, 'stage');
  const s = { stage, stageSource: path.join(stage, 'hp_colors_rewrite_v3'), compiled: path.join(stage, 'hp_colors_rewrite_v3_compiled'), vpk: path.join(stage, 'pak02_dir.vpk') };
  fs.mkdirSync(s.stageSource, { recursive: true });
  const logs = [];
  const deps = {
    fs, env: { PATH: 'p' }, execPath: 'node', platform: process.platform,
    spawnSync: cmd => (cmd === 'dotnet' ? { status: 0, stdout: runtimes } : { status: 1, error: new Error('nope') }),
    log: m => logs.push(String(m)), warn: m => logs.push('WARNING: ' + m),
    now: Date.now, sleep: () => new Promise(resolve => setImmediate(resolve))
  };
  return { root, paths, s, deps, logs };
}

test('runCompiler: roll-forward env for the compiler only, ReadKey crash accepted after 0 failed', async t => {
  const { paths, s, deps, logs } = compilerFixture(t);
  const assets = ['panorama/scripts/a.vjs_c', 'panorama/layout/b.vxml_c'];
  deps.spawn = fakeCompilerSpawn({ stdout: 'Compiling...\r\n2 compiled, 0 failed\r\nPress any key to exit...', stderr: READKEY_STDERR, exitCode: 3762504530, outputs: assets, compiled: s.compiled });
  await build.runCompiler(deps, paths, { ...s, assets });
  const call = deps.spawn.calls[0];
  assert.equal(call.file, paths.compiler);
  assert.deepEqual(call.args, [s.stageSource]);
  assert.equal(call.options.env.DOTNET_ROLL_FORWARD, 'Major');
  assert.equal(deps.env.DOTNET_ROLL_FORWARD, undefined, 'the build process env is untouched');
  assert.equal(logs.filter(l => /DOTNET_ROLL_FORWARD=Major/.test(l)).length, 1);
  assert.ok(logs.includes('Compiler exit=-532462766; summary=2 compiled, 0 failed'));
  assert.ok(logs.some(l => /Accepted known redirected Console\.ReadKey exit/.test(l)));
  assert.match(fs.readFileSync(path.join(s.stage, 'compile.stdout.log'), 'utf8'), /2 compiled, 0 failed/);
});

test('runCompiler: a compiler waiting at the prompt is stopped; no roll-forward when the major is present', async t => {
  const { paths, s, deps, logs } = compilerFixture(t, { runtimes: 'Microsoft.NETCore.App 9.0.4 [C:\\x]\n' });
  const assets = ['panorama/scripts/a.vjs_c'];
  deps.spawn = fakeCompilerSpawn({ stdout: '1 compiled, 0 failed\r\nPress any key to exit...', hang: true, outputs: assets, compiled: s.compiled });
  await build.runCompiler(deps, paths, { ...s, assets });
  assert.equal(deps.spawn.calls[0].options.env.DOTNET_ROLL_FORWARD, undefined);
  assert.ok(!logs.some(l => /ROLL_FORWARD/.test(l)));
  assert.ok(logs.some(l => /Stopped compiler left at its exit prompt/.test(l)));
});

test('runCompiler: .NET launch failure reports the cause and both log tails', async t => {
  const { paths, s, deps } = compilerFixture(t, { runtimes: 'Microsoft.NETCore.App 8.0.33 [C:\\x]\n' });
  deps.spawn = fakeCompilerSpawn({ stderr: DOTNET_MISSING, exitCode: 2147516566, compiled: s.compiled });
  await assert.rejects(build.runCompiler(deps, paths, { ...s, assets: ['panorama/scripts/a.vjs_c'] }),
    err => /^Missing compiled outputs: panorama\/scripts\/a\.vjs_c\nCause: the compiler could not start because Microsoft\.NETCore\.App 9\.0\.0 is not installed/.test(err.message)
      && err.message.includes('--- compile.stdout.log (last 20 lines) ---\n(empty)'));
});

test('compileAndPack: exact compiled set, pack, listings and forbidden assets', async t => {
  const { paths, s, deps, logs } = compilerFixture(t);
  const assets = ['panorama/scripts/a.vjs_c', 'panorama/layout/b.vxml_c'];
  const vpkTool = path.join(s.stage, 'vpkeditcli.exe');
  const viewer = path.join(s.stage, 'Source2Viewer-CLI.exe');
  fs.writeFileSync(viewer, 'exe');
  let listing = assets.map(a => `${a} CRC:1f size:1`).join('\r\n') + '\r\n';
  const baseSpawnSync = deps.spawnSync;
  deps.spawnSync = (cmd, args, opts) => {
    if (cmd === vpkTool) { fs.writeFileSync(args[2], 'vpk'); return { status: 0, stdout: 'packed\n', stderr: '' }; }
    if (cmd === viewer) return { status: 0, stdout: listing };
    return baseSpawnSync(cmd, args, opts);
  };
  const run = () => {
    deps.spawn = fakeCompilerSpawn({ stdout: '2 compiled, 0 failed\r\n', exitCode: 0, outputs: assets, compiled: s.compiled });
    return build.compileAndPack(deps, paths, { ...s, assets, forbidden: ['.js', 'ql_'], vpkTool, viewer, label: 'HPV3 pak02' });
  };
  await run();
  assert.equal(fs.readFileSync(path.join(s.stage, 'vpk-listing.txt'), 'utf8'), assets.join('\r\n') + '\r\n');
  assert.match(fs.readFileSync(path.join(s.stage, 'vpk-listing.full.txt'), 'utf8'), /CRC:1f size:1\r\n/);
  assert.ok(logs.includes('VPK exact asset set (2):') && logs.includes('packed'));

  listing += 'panorama/scripts/ql_extra.vjs_c CRC:1 size:1\r\n';
  await assert.rejects(run(), /HPV3 pak02 contains forbidden asset: ql_/);

  fs.writeFileSync(path.join(s.compiled, 'stray.txt'), 'x');
  deps.spawn = fakeCompilerSpawn({ stdout: '2 compiled, 0 failed\r\n', outputs: assets, compiled: s.compiled });
  await assert.rejects(build.compileAndPack(deps, paths, { ...s, assets, forbidden: [], vpkTool, viewer, label: 'L' }), /Compiled asset set differs from exact L contract/);
});

test('removeTreeUnderRoot keeps the wrappers\' guards', t => {
  const root = tempRoot(t);
  const buildRoot = path.join(root, '.build');
  fs.mkdirSync(path.join(buildRoot, 'release', 'x'), { recursive: true });
  assert.throws(() => build.removeTreeUnderRoot(fs, path.join(buildRoot, 'release'), buildRoot, 'debug'), /Refusing to remove unexpected path/);
  assert.throws(() => build.removeTreeUnderRoot(fs, root, buildRoot, ''), /Refusing to operate outside root/);
  assert.throws(() => build.removeTreeUnderRoot(fs, buildRoot, buildRoot, ''), /Refusing to operate outside root/);
  build.removeTreeUnderRoot(fs, path.join(buildRoot, 'release'), buildRoot, 'release');
  assert.ok(!fs.existsSync(path.join(buildRoot, 'release')));
  build.removeTreeUnderRoot(fs, path.join(buildRoot, 'missing'), buildRoot, 'missing');
});

test('every lane refuses to build without --skip-deploy before running anything', async () => {
  const deps = { fs, spawnSync: () => assert.fail('nothing may run'), spawn: () => assert.fail('nothing may run'), env: {}, log() {}, warn() {} };
  await assert.rejects(build.buildProject('v3', { skipDeploy: false }, deps), /^Error: V3 is build-only\. Pass --skip-deploy/);
  await assert.rejects(build.buildProject('qollock', { skipDeploy: false }, deps), /QOLLOCK variant is build-only/);
  await assert.rejects(build.buildProject('showrank', { skipDeploy: false }, deps), /ShowRank variant is build-only/);
});

test('build steps run in the wrapper order (v3, stubbed tools)', async t => {
  const root = tempRoot(t);
  const paths = repoPaths(root);
  fs.mkdirSync(path.join(paths.v3, 'panorama', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(paths.v3, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(paths.v3, 'tests', 'b.test.js'), '');
  fs.writeFileSync(path.join(paths.v3, 'tests', 'A.test.js'), '');
  for (const f of [paths.vpkToolCandidates[1], paths.viewerCandidates[0]]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'exe'); }
  const steps = [];
  const deps = {
    fs, env: { HPV3_SUITE_CACHE: '1', HPV3_STEAM_INF: path.join(root, 'steam.inf') }, execPath: 'node', platform: process.platform, log() {}, warn() {}, now: Date.now, sleep: async () => {},
    spawnSync: (cmd, args, opts) => {
      if (cmd === 'node') {
        const name = args[0] === '--test' ? 'test:' + args.slice(1).map(a => a.startsWith('--test-reporter-destination=') && a !== '--test-reporter-destination=stdout' ? '--test-reporter-destination=<stage>/' + path.relative(path.join(paths.v3, '.build', 'release'), a.slice(a.indexOf('=') + 1)).replace(/\\/g, '/') : path.basename(a)).join(',') : path.basename(args[0]) + ' ' + args.slice(1).join(' ');
        steps.push(name.replace(root, '<root>'));
        if (args[0] === '--test') assert.equal(opts.env.HPV3_SOURCE_ROOT, path.join(paths.v3, '.build', 'release', 'hp_colors_rewrite_v3'));
        if (path.basename(args[0]) === 'suite-cache.js') return { status: 0, stdout: 'a'.repeat(64) + '\n' };
        return { status: 0, stdout: '' };
      }
      if (cmd === 'dotnet') return { status: 1, stdout: '' };
      return { status: 1, error: new Error('stop here: ' + cmd) };
    },
    spawn: () => { steps.push('compile'); throw new Error('stop at compile'); }
  };
  await assert.rejects(build.buildProject('v3', { skipDeploy: true, checkUpstream: true, debug: false }, deps, root), /stop at compile/);
  assert.deepEqual(steps.map(s => s.split(' ')[0] === 'game-data.js' ? s.replace(/ --check-installed .*/, ' --check-installed') : s.replace(/ \S*hp_colors_rewrite_v3\S*/g, ' <stage>')), [
    'game-data.js --check-installed',
    'game-data.js --check-upstream',
    'generate.js --check',
    'stage-scripts.js <stage> --minify',
    'suite-cache.js --key <stage> release',
    'test:--test-reporter=spec,--test-reporter-destination=stdout,--test-reporter=tap,--test-reporter-destination=<stage>/suite.tap,A.test.js,b.test.js',
    'compile'
  ]);
  assert.ok(fs.existsSync(path.join(paths.v3, '.build', 'suite-pass', 'a'.repeat(64))));
});

test('discoverDeadlock: flag, env, Steam registry + libraryfolders.vdf + appmanifest, drive scan, none', () => {
  const W = path.win32;
  const memFs = files => ({
    existsSync: p => Object.keys(files).some(k => k.toLowerCase() === p.toLowerCase() || k.toLowerCase().startsWith(p.toLowerCase().replace(/\\?$/, '\\'))),
    readFileSync: p => { const k = Object.keys(files).find(f => f.toLowerCase() === p.toLowerCase()); if (k === undefined) throw new Error('ENOENT ' + p); return files[k]; }
  });
  const reg = values => (cmd, args) => {
    assert.equal(cmd, 'reg');
    const v = values[args[1] + '|' + args[3]];
    return v ? { status: 0, stdout: `\r\n${args[1]}\r\n    ${args[3]}    REG_SZ    ${v}\r\n\r\n` } : { status: 1, stdout: '' };
  };
  const vdf = '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"D:\\\\steam"\n\t}\n\t"2"\n\t{\n\t\t"path"\t\t"F:\\\\SteamLibrary"\n\t\t"apps"\n\t\t{\n\t\t\t"1422450"\t\t"1"\n\t\t}\n\t}\n}\n';
  const inf = 'F:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel\\steam.inf';
  const files = {
    'D:\\steam\\steamapps\\libraryfolders.vdf': vdf,
    'F:\\SteamLibrary\\steamapps\\appmanifest_1422450.acf': '"AppState"\n{\n\t"appid"\t\t"1422450"\n\t"installdir"\t\t"Deadlock"\n}\n',
    [inf]: 'ClientVersion=6861\n'
  };
  const base = { fs: memFs(files), platform: 'win32', spawnSync: reg({ 'HKCU\\Software\\Valve\\Steam|SteamPath': 'd:/steam' }) };
  assert.deepEqual(toolchain.parseLibraryFolders(vdf), ['D:\\steam', 'F:\\SteamLibrary']);
  assert.equal(toolchain.discoverDeadlock({ ...base, flag: 'X:\\steam.inf', env: { HPV3_STEAM_INF: 'Y' } }).source, '--installed-steam-inf');
  assert.deepEqual(toolchain.discoverDeadlock({ ...base, env: { HPV3_STEAM_INF: 'Y:\\s.inf', HPV3_DEADLOCK_DIR: 'Z:\\D' } }).steamInf, 'Y:\\s.inf');
  assert.equal(toolchain.discoverDeadlock({ ...base, env: { HPV3_DEADLOCK_DIR: 'Z:\\D' } }).steamInf, W.join('Z:\\D', 'game', 'citadel', 'steam.inf'));
  const viaSteam = toolchain.discoverDeadlock({ ...base, env: {} });
  assert.deepEqual([viaSteam.steamInf, viaSteam.source], [inf, 'Steam library F:\\SteamLibrary']);
  const viaHklm = toolchain.discoverDeadlock({ ...base, env: {}, spawnSync: reg({ 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam|InstallPath': 'D:\\steam' }) });
  assert.equal(viaHklm.steamInf, inf);
  // No Steam in the registry: the drive scan finds <X>:\SteamLibrary\steamapps\common\Deadlock.
  const scanned = toolchain.discoverDeadlock({ ...base, env: {}, spawnSync: reg({}) });
  assert.deepEqual([scanned.steamInf, scanned.source], [inf, 'drive scan']);
  const none = toolchain.discoverDeadlock({ fs: memFs({ 'C:\\x': '' }), env: {}, spawnSync: reg({}), platform: 'win32' });
  assert.equal(none.steamInf, null);
  assert.deepEqual(none.tried, ['C:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel\\steam.inf', 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Deadlock\\game\\citadel\\steam.inf']);
  assert.equal(toolchain.discoverDeadlock({ ...base, env: {}, platform: 'linux' }).steamInf, null);
  assert.equal(toolchain.readClientVersion('ProductName=citadel\r\nClientVersion=6861\r\n'), 6861);
  const msg = toolchain.pinMismatchMessage({ installed: 6861, pinned: 6828, steamInf: inf });
  assert.ok(msg.startsWith(`Installed game ClientVersion mismatch: installed=6861 pinned=6828 (${inf}).`));
  assert.match(msg, /rebase the pin .* or pass --allow-pin-mismatch/);
});
