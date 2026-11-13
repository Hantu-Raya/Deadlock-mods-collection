'use strict';
// Hermetic tests for scripts/build-abilities.js: a temp repo, fake tools behind injected spawn/spawnSync/fetch,
// no real compiler, Python, vpkeditcli, 7-Zip or network.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const build = require('./build-abilities');
const toolchain = require('../hp_colors_rewrite_v3/tools/lib/toolchain');
const { crc32 } = require('../hp_colors_rewrite_v3/tools/vpk-check');

const READKEY_STDERR = 'Unhandled exception. System.InvalidOperationException: Cannot read keys when either application does not have a console\n   at System.ConsolePal.ReadKey(Boolean intercept)\n';
const INCLUDE = '_include =\r\n[\r\n\tresource_name:"scripts/abilities_base.vdata",\r\n]\r\n';
const KV3 = '<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:generic:version{7412167c-06e9-4698-aff2-e63eb59037e7} -->\r\n';
const BODY = '{\r\n\tupgrade_x = {}\r\n}\r\n';

// A one-directory-tree VPK v1 holding `files` ({ 'scripts/abilities.vdata_c': Buffer }), data inline.
function makeVpk(files) {
  const parts = [];
  const data = [];
  let offset = 0;
  const byExt = new Map();
  for (const [p, buf] of Object.entries(files)) {
    const dir = path.posix.dirname(p), base = path.posix.basename(p);
    const dot = base.lastIndexOf('.');
    const ext = dot < 0 ? ' ' : base.slice(dot + 1), name = dot < 0 ? base : base.slice(0, dot);
    if (!byExt.has(ext)) byExt.set(ext, new Map());
    const dirs = byExt.get(ext);
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push({ name, buf });
  }
  const str = s => Buffer.from(s + '\0', 'latin1');
  for (const [ext, dirs] of byExt) {
    parts.push(str(ext));
    for (const [dir, entries] of dirs) {
      parts.push(str(dir === '.' ? ' ' : dir));
      for (const { name, buf } of entries) {
        parts.push(str(name));
        const e = Buffer.alloc(18);
        e.writeUInt32LE(crc32(buf), 0);
        e.writeUInt16LE(0, 4);
        e.writeUInt16LE(0x7fff, 6);
        e.writeUInt32LE(offset, 8);
        e.writeUInt32LE(buf.length, 12);
        e.writeUInt16LE(0xffff, 16);
        parts.push(e);
        data.push(buf);
        offset += buf.length;
      }
      parts.push(str(''));
    }
    parts.push(str(''));
  }
  parts.push(str(''));
  const tree = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x55aa1234, 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(tree.length, 8);
  return Buffer.concat([header, tree, ...data]);
}

function listDirFiles(dir) {
  const out = {};
  const walk = cur => {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) walk(full);
      else out[path.relative(dir, full).replace(/\\/g, '/')] = fs.readFileSync(full);
    }
  };
  walk(dir);
  return out;
}

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-abilities-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

// The fake machine. `faults` switches individual tools into failure modes.
function world(t, faults = {}) {
  const root = tempRoot(t);
  const scripts = path.join(root, 'abilities', 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(scripts, 'abilities.vdata'), KV3 + INCLUDE + BODY);
  fs.writeFileSync(path.join(scripts, 'abilities2.vdata'), KV3 + BODY);
  const vpkTool = path.join(root, 'vpk cli', 'vpkeditcli.exe');
  fs.mkdirSync(path.dirname(vpkTool), { recursive: true });
  fs.writeFileSync(vpkTool, 'exe');
  const compilerDir = path.join(root, 'sr2compiler');
  fs.mkdirSync(compilerDir, { recursive: true });
  fs.writeFileSync(path.join(compilerDir, 'New folder.exe'), 'exe');
  fs.writeFileSync(path.join(compilerDir, 'New folder.runtimeconfig.json'), JSON.stringify({ runtimeOptions: { framework: { name: 'Microsoft.NETCore.App', version: '9.0.0' } } }));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const python = path.join(bin, 'py.exe'), sevenZip = path.join(bin, '7z.exe');
  fs.writeFileSync(python, 'exe');
  fs.writeFileSync(sevenZip, 'exe');
  const citadel = path.join(root, 'game', 'citadel');
  fs.mkdirSync(path.join(citadel, 'addons'), { recursive: true });
  const gamePak = path.join(citadel, 'pak01_dir.vpk');
  if (!faults.noStockPak) fs.writeFileSync(gamePak, 'stock');
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(tmp);

  const events = [];
  const logs = [];
  const scriptFails = { ...(faults.scriptFails || {}) };
  let lastArchived = null;
  const spawnSync = (file, args, options = {}) => {
    if (file === 'dotnet') return { status: 0, stdout: 'Microsoft.NETCore.App 10.0.14 [C:\\x]\n' };
    if (file === 'tasklist') return { status: 0, stdout: faults.deadlockRunning ? '"deadlock.exe","4242","Console","1","900,000 K"\r\n' : 'INFO: No tasks are running which match the specified criteria.\r\n' };
    if (file === vpkTool && args.includes('--extract')) {
      events.push('extract-stock');
      if (faults.extractFails) return { status: 1 };
      fs.writeFileSync(args[args.indexOf('--output') + 1], 'stock-vdata');
      return { status: 0 };
    }
    if (file === vpkTool) {
      const [inputDir, , out] = args;
      events.push(`pack ${path.basename(out)}`);
      const files = listDirFiles(inputDir);
      if (faults.packExtra) files['scripts/extra.vdata_c'] = Buffer.from('x');
      if (faults.packCorrupt) files['scripts/abilities.vdata_c'] = Buffer.from('corrupt');
      fs.writeFileSync(out, makeVpk(files));
      return { status: 0, stdout: `Successfully created pack file at "${out}".\n`, stderr: '' };
    }
    if (file === python && args[0] === '-c') {
      const expect = /expect_enabled=(True|False)/.exec(args[1])[1];
      events.push(`verify ${expect}`);
      return { status: faults.verifyFails ? 1 : 0 };
    }
    if (file === python && /inject_stock_external_refs\.py$/.test(args[0])) {
      events.push(`inject ${path.basename(args[1])} ${path.basename(args[2])}`);
      assert.equal(fs.readFileSync(args[3], 'utf8'), 'stock-vdata');
      return { status: faults.injectFails ? 1 : 0 };
    }
    if (file === python) {
      const [script, input] = args;
      assert.equal(options.cwd, scripts);
      events.push(`py ${script} ${input}`);
      if (scriptFails[script] > 0) { scriptFails[script]--; return { status: 7 }; }
      const target = path.join(scripts, input);
      const tag = `#${script}\n`;
      const text = fs.readFileSync(target, 'utf8');
      if (!text.endsWith(tag)) fs.writeFileSync(target, text + tag);
      return { status: 0 };
    }
    if (file === sevenZip && args[0] === 'a') {
      events.push(`7z ${path.basename(args[2])}`);
      fs.writeFileSync(args[2], fs.readFileSync(args[3]));
      lastArchived = path.basename(args[3]);
      return { status: 0 };
    }
    if (file === sevenZip && args[0] === 'l') return { status: 0, stdout: `   Date      Time    Attr         Size   Compressed  Name\n${faults.archiveListingWrong ? 'other.vpk' : lastArchived}\n` };
    throw new Error(`unexpected spawnSync ${file} ${args.join(' ')}`);
  };
  const compiled = path.join(root, 'abilities_compiled', 'scripts');
  const spawnCalls = [];
  const spawn = (file, args, options) => {
    spawnCalls.push({ file, args, options });
    events.push('compile');
    fs.writeSync(options.stdio[1], 'OK: 2 compiled, 0 failed\r\nPress any key to exit...');
    fs.writeSync(options.stdio[2], READKEY_STDERR);
    fs.mkdirSync(compiled, { recursive: true });
    for (const name of ['abilities.vdata', 'abilities2.vdata']) {
      if (faults.compileMissing === name) continue;
      fs.writeFileSync(path.join(compiled, name + '_c'), 'compiled:' + fs.readFileSync(path.join(scripts, name), 'utf8'));
    }
    const child = new EventEmitter();
    child.kill = () => { setImmediate(() => child.emit('exit', null, 'SIGTERM')); return true; };
    setImmediate(() => child.emit('exit', 3762504530, null));
    return child;
  };
  const deps = {
    fs, spawn, spawnSync,
    env: { PATH: bin, LOCALAPPDATA: path.join(root, 'nolocal') },
    platform: process.platform,
    fetch: async () => { throw new Error('no network in tests'); },
    tmpdir: () => tmp,
    newId: () => 'fixedid',
    log: m => { logs.push(String(m)); events.push('log ' + String(m)); },
    now: () => new Date(2026, 10, 13, 9, 5, 0).getTime(),
    sleep: () => new Promise(resolve => setImmediate(resolve))
  };
  return { root, scripts, gamePak, citadel, tmp, deps, events, logs, spawnCalls, vpkTool, python, sevenZip };
}

const runBuild = (w, argv) => build.main([...argv, '--game-pak', w.gamePak], w.deps, w.root);

// ---- argument parsing ------------------------------------------------------------------------------

test('parseArgs: defaults, every flag, --only lists, refusals', () => {
  assert.deepEqual(build.parseArgs([]), { refreshFromSteamTracking: false, only: null, deploy: false, gamePak: null, help: false });
  const all = build.parseArgs(['--refresh-from-steam-tracking', '--deploy', '--game-pak', 'X:\\citadel\\pak01_dir.vpk']);
  assert.equal(all.refreshFromSteamTracking, true);
  assert.equal(all.deploy, true);
  assert.equal(all.gamePak, 'X:\\citadel\\pak01_dir.vpk');
  assert.deepEqual(build.parseArgs(['--only', 'pak03,pak04', '--only=pak05']).only, ['pak03', 'pak04', 'pak05']);
  assert.equal(build.parseArgs(['--game-pak=Y:\\p.vpk']).gamePak, 'Y:\\p.vpk');
  assert.equal(build.parseArgs(['-h']).help, true);
  assert.throws(() => build.parseArgs(['--only']), /--only needs a value/);
  assert.throws(() => build.parseArgs(['--only', '--deploy']), /--only needs a value/);
  assert.throws(() => build.parseArgs(['--only=']), /--only needs a pak name/);
  assert.throws(() => build.parseArgs(['--game-pak']), /--game-pak needs a value/);
  assert.throws(() => build.parseArgs(['-Only', 'pak03']), /Unknown argument '-Only'/);
  assert.throws(() => build.parseArgs(['--skip-deploy']), /Unknown argument '--skip-deploy'/);
});

test('--help prints the usage and builds nothing', async t => {
  const w = world(t);
  assert.equal(await build.main(['--help'], w.deps, w.root), 0);
  assert.deepEqual(w.logs, [build.USAGE]);
  assert.ok(!w.events.some(e => !e.startsWith('log ')));
});

test('selectSpecs: case-insensitive --only, unknown names ignored, refusals', () => {
  const specs = build.repoPaths('R', 'G\\pak01_dir.vpk', '11_13').pakSpecs;
  assert.deepEqual(build.selectSpecs(specs, { only: null }).map(s => s.name), ['pak02', 'pak03', 'pak04', 'pak05']);
  assert.deepEqual(build.selectSpecs(specs, { only: ['PAK05', 'pak03', 'pak99'] }).map(s => s.name), ['pak03', 'pak05']);
  assert.throws(() => build.selectSpecs(specs, { only: ['pak09'] }), /^Error: No pak spec matches --only pak09$/);
  assert.throws(() => build.selectSpecs(specs, { only: ['pak03'], refreshFromSteamTracking: true }), /--refresh-from-steam-tracking cannot be combined with --only/);
});

test('repoPaths: the wrapper\'s pak table, archive names and output paths', () => {
  const p = build.repoPaths(path.join('R'), path.join('G', 'citadel', 'pak01_dir.vpk'), '01_02');
  assert.equal(p.addons, path.join('G', 'citadel', 'addons'));
  assert.equal(p.compiler, path.join('R', 'sr2compiler', 'New folder.exe'));
  assert.deepEqual(p.pakSpecs.map(s => [s.name, s.archiveName, s.script, s.inputFile, path.basename(s.compiledSource), s.behaviorState]), [
    ['pak02', 'templete_01_02.7z', null, 'abilities.vdata', 'abilities.vdata_c', 'skip'],
    ['pak03', 'filter_for_passive_and_active_items_yesBehaviour_01_02.7z', 'active.py', 'abilities.vdata', 'abilities.vdata_c', 'enabled'],
    ['pak04', 'filter_for_passive_items_01_02.7z', 'passive.py', 'abilities2.vdata', 'abilities2.vdata_c', 'skip'],
    ['pak05', 'filter_for_passive_and_active_items_01_02.7z', 'active_no_behavior.py', 'abilities.vdata', 'abilities.vdata_c', 'disabled']
  ]);
  assert.deepEqual(p.pakSpecs.map(s => [path.basename(s.stageDir), path.basename(s.vpkOut)]), [
    ['pak02_dir', 'pak02_dir.vpk'], ['pak03_dir', 'pak03_dir.vpk'], ['pak04_dir', 'pak04_dir.vpk'], ['pak05_dir', 'pak05_dir.vpk']
  ]);
  assert.equal(p.legacyArchiveNames.length, 3);
  assert.equal(build.dateTagOf(new Date(2026, 0, 2, 23, 0).getTime()), '01_02');
});

test('resolveGamePak: flag, discovered install, wrapper default', () => {
  const none = { fs: { existsSync: () => false, readFileSync: () => { throw new Error('x'); } }, env: {}, spawnSync: () => ({ status: 1 }), platform: 'win32' };
  assert.equal(build.resolveGamePak({ gamePak: 'a.vpk' }, none), path.resolve('a.vpk'));
  assert.equal(build.resolveGamePak({ gamePak: null }, none), build.DEFAULT_GAME_PAK);
  const found = { ...none, env: { HPV3_DEADLOCK_DIR: 'F:\\SteamLibrary\\steamapps\\common\\Deadlock' } };
  assert.equal(build.resolveGamePak({ gamePak: null }, found), path.join('F:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel', 'pak01_dir.vpk'));
});

// ---- tool resolution refusals ---------------------------------------------------------------------

test('resolveTools: vpkeditcli, then Python, then 7-Zip, each refused when absent', t => {
  const w = world(t);
  // Hide the machine's real 7-Zip and Administrator Python fallbacks.
  const hidden = { ...fs, existsSync: p => !/^C:\\(Program Files\\7-Zip|Users\\Administrator\\AppData\\Local\\Programs)\\/i.test(p) && fs.existsSync(p) };
  const deps = { ...w.deps, fs: hidden };
  const p = build.repoPaths(w.root, w.gamePak, '11_13');
  assert.deepEqual(build.resolveTools(p, deps), { vpkeditcli: w.vpkTool, python: w.python, sevenZip: w.sevenZip });
  fs.rmSync(w.sevenZip);
  assert.throws(() => build.resolveTools(p, deps), /^Error: 7z\.exe was not found on PATH or at C:\\Program Files\\7-Zip\\7z\.exe$/);
  fs.rmSync(w.python);
  assert.throws(() => build.resolveTools(p, deps), /^Error: Python was not found on PATH or in the expected user install paths$/);
  fs.rmSync(w.vpkTool);
  assert.throws(() => build.resolveTools(p, deps), /^Error: vpkeditcli\.exe not found\. Checked: .*passive_items_mod.*vpk cli/);
});

test('resolveTools: Python falls back to the LOCALAPPDATA launcher', t => {
  const w = world(t);
  fs.rmSync(w.python);
  const launcher = path.join(w.root, 'nolocal', 'Programs', 'Python', 'Launcher', 'py.exe');
  fs.mkdirSync(path.dirname(launcher), { recursive: true });
  fs.writeFileSync(launcher, 'exe');
  assert.equal(build.resolveTools(build.repoPaths(w.root, w.gamePak, '11_13'), w.deps).python, launcher);
});

// ---- full build ------------------------------------------------------------------------------------

test('full build: steps in the wrapper order, outputs, cleanup and final table', async t => {
  const w = world(t);
  assert.equal(await runBuild(w, []), 0);
  const steps = w.events.filter(e => !e.startsWith('log ') || /^log \[/.test(e));
  assert.deepEqual(steps, [
    'extract-stock',
    'log [preprocess] remove _include from abilities.vdata',
    'log [transform] apply_healthbar_status_overrides.py', 'py apply_healthbar_status_overrides.py abilities.vdata',
    'log [transform] apply_healthbar_status_overrides.py', 'py apply_healthbar_status_overrides.py abilities2.vdata',
    // pak02
    'log [transform] skip for abilities.vdata',
    'log [compile] abilities', 'compile', 'log [WARN] Compiler exited -532462766 but output exists; continuing.',
    'inject abilities.vdata_c abilities.vdata', 'pack pak02_dir.vpk',
    // pak03
    'log [transform] active.py', 'py active.py abilities.vdata', 'log [verify] behavior enabled for abilities.vdata', 'verify True',
    'log [compile] abilities', 'compile', 'log [WARN] Compiler exited -532462766 but output exists; continuing.',
    'inject abilities.vdata_c abilities.vdata', 'pack pak03_dir.vpk',
    // pak04
    'log [transform] passive.py', 'py passive.py abilities2.vdata',
    'log [compile] abilities', 'compile', 'log [WARN] Compiler exited -532462766 but output exists; continuing.',
    'inject abilities2.vdata_c abilities2.vdata', 'pack pak04_dir.vpk',
    // pak05
    'log [transform] active_no_behavior.py', 'py active_no_behavior.py abilities.vdata', 'log [verify] behavior disabled for abilities.vdata', 'verify False',
    'log [compile] abilities', 'compile', 'log [WARN] Compiler exited -532462766 but output exists; continuing.',
    'inject abilities.vdata_c abilities.vdata', 'pack pak05_dir.vpk',
    'log [archive] templete_11_13.7z', '7z templete_11_13.7z',
    'log [archive] filter_for_passive_and_active_items_yesBehaviour_11_13.7z', '7z filter_for_passive_and_active_items_yesBehaviour_11_13.7z',
    'log [archive] filter_for_passive_items_11_13.7z', '7z filter_for_passive_items_11_13.7z',
    'log [archive] filter_for_passive_and_active_items_11_13.7z', '7z filter_for_passive_and_active_items_11_13.7z'
  ]);
  // Compiler: the mod folder, roll-forward for the compiler only, logs beside the baselines.
  assert.deepEqual(w.spawnCalls[0].args, [path.join(w.root, 'abilities')]);
  assert.equal(w.spawnCalls[0].options.env.DOTNET_ROLL_FORWARD, 'Major');
  assert.equal(w.deps.env.DOTNET_ROLL_FORWARD, undefined);
  // Each pak holds the compile of its own transform.
  const addons = path.join(w.citadel, 'addons');
  const member = name => {
    const vpk = require('../hp_colors_rewrite_v3/tools/vpk-check').parseVpk(fs.readFileSync(path.join(addons, name)));
    assert.deepEqual(vpk.entries.map(e => e.path), ['scripts/abilities.vdata_c']);
    return vpk.bytes.subarray(vpk.dataStart).toString('utf8');
  };
  assert.ok(member('templete_11_13.7z').endsWith('#apply_healthbar_status_overrides.py\n'));
  assert.ok(member('filter_for_passive_and_active_items_yesBehaviour_11_13.7z').endsWith('#active.py\n'));
  assert.ok(member('filter_for_passive_items_11_13.7z').endsWith('#passive.py\n'));
  assert.ok(member('filter_for_passive_and_active_items_11_13.7z').endsWith('#active_no_behavior.py\n'));
  assert.ok(!member('templete_11_13.7z').includes('_include'));
  // Inputs restored to the preprocessed baselines; stage dirs, paks and the baseline dir removed; nothing deployed.
  assert.equal(fs.readFileSync(path.join(w.scripts, 'abilities.vdata'), 'utf8'), KV3 + BODY + '#apply_healthbar_status_overrides.py\n');
  assert.equal(fs.readFileSync(path.join(w.scripts, 'abilities2.vdata'), 'utf8'), KV3 + BODY + '#apply_healthbar_status_overrides.py\n');
  for (const n of ['pak02', 'pak03', 'pak04', 'pak05']) {
    assert.ok(!fs.existsSync(path.join(w.root, `${n}_dir`)));
    assert.ok(!fs.existsSync(path.join(w.root, `${n}_dir.vpk`)));
  }
  assert.deepEqual(fs.readdirSync(w.tmp), []);
  assert.deepEqual(fs.readdirSync(addons).filter(f => f.endsWith('.vpk')), []);
  // Final table: FullName / Length / LastWriteTime, one row per archive.
  const table = w.logs[w.logs.length - 1].split('\n');
  assert.match(table[1], /^FullName\s+Length LastWriteTime$/);
  assert.match(table[2], /^-{8}\s+-{6} -{13}$/);
  assert.equal(table.filter(l => l.includes(addons)).length, 4);
});

test('--only pak04 --deploy: one input, one pak, deploy before archiving, legacy archives removed', async t => {
  const w = world(t);
  const addons = path.join(w.citadel, 'addons');
  fs.writeFileSync(path.join(addons, 'filter_for_passive_and_active_items_noBehaviour_11_13.7z'), 'old');
  fs.writeFileSync(path.join(addons, 'templete_11_13.7z'), 'other day build');
  await runBuild(w, ['--only', 'pak04', '--deploy']);
  const steps = w.events.filter(e => /^(py|pack|7z|log \[(deploy|archive))/.test(e));
  assert.deepEqual(steps, [
    'py apply_healthbar_status_overrides.py abilities2.vdata',
    'py passive.py abilities2.vdata',
    'pack pak04_dir.vpk',
    `log [deploy] ${path.join(addons, 'pak04_dir.vpk')}`,
    'log [archive] remove legacy filter_for_passive_and_active_items_noBehaviour_11_13.7z',
    'log [archive] filter_for_passive_items_11_13.7z',
    '7z filter_for_passive_items_11_13.7z'
  ]);
  assert.ok(fs.existsSync(path.join(addons, 'pak04_dir.vpk')));
  assert.ok(!fs.existsSync(path.join(addons, 'filter_for_passive_and_active_items_noBehaviour_11_13.7z')));
  assert.equal(fs.readFileSync(path.join(addons, 'templete_11_13.7z'), 'utf8'), 'other day build');
  assert.ok(!w.events.includes('py apply_healthbar_status_overrides.py abilities.vdata'));
});

// ---- refusal paths ---------------------------------------------------------------------------------

test('--deploy refuses while Deadlock runs, before extracting anything', async t => {
  const w = world(t, { deadlockRunning: true });
  await assert.rejects(runBuild(w, ['--deploy']), /^Error: Deadlock is running and locks addons paks; close it before --deploy$/);
  assert.ok(!w.events.includes('extract-stock'));
  const quiet = world(t, { deadlockRunning: true });
  await runBuild(quiet, []); // without --deploy the running game does not matter
});

test('missing stock pak and failed stock extraction are refused', async t => {
  const a = world(t, { noStockPak: true });
  await assert.rejects(runBuild(a, []), err => err.message === `Stock Deadlock pak01_dir.vpk not found: ${a.gamePak}`);
  const b = world(t, { extractFails: true });
  await assert.rejects(runBuild(b, []), err => err.message === `Failed to extract stock scripts/abilities.vdata_c from ${b.gamePak}`);
  assert.ok(!b.events.some(e => e.startsWith('py ')));
});

test('required compiler outputs: a missing VData output fails with the compile log tails', async t => {
  const w = world(t, { compileMissing: 'abilities2.vdata' });
  await assert.rejects(runBuild(w, ['--only', 'pak02']), err => /^Missing compiled outputs: scripts\/abilities2\.vdata_c\n/.test(err.message)
    && err.message.includes('--- compile.stdout.log (last 20 lines) ---\nOK: 2 compiled, 0 failed'));
  assert.ok(!w.events.some(e => e.startsWith('inject') || e.startsWith('pack')));
});

test('transform retries, then fails after five attempts', async t => {
  const ok = world(t, { scriptFails: { 'active.py': 2 } });
  await runBuild(ok, ['--only', 'pak03']);
  assert.equal(ok.events.filter(e => e === 'py active.py abilities.vdata').length, 3);
  assert.ok(ok.logs.includes('  [retry] active.py exited 7; retrying (1/5)'));
  const bad = world(t, { scriptFails: { 'passive.py': 9 } });
  await assert.rejects(runBuild(bad, ['--only', 'pak04']), /^Error: passive\.py failed with exit code 7 after 5 attempts$/);
  assert.equal(bad.events.filter(e => e === 'py passive.py abilities2.vdata').length, 5);
});

test('behavior verification and RERL injection failures stop the build', async t => {
  const v = world(t, { verifyFails: true });
  await assert.rejects(runBuild(v, ['--only', 'pak05']), /^Error: Behavior state verification failed for abilities\.vdata \(disabled\)$/);
  assert.ok(!v.events.includes('compile'));
  const i = world(t, { injectFails: true });
  await assert.rejects(runBuild(i, ['--only', 'pak04']), /^Error: External reference injection failed for abilities2\.vdata$/);
  assert.ok(!i.events.some(e => e.startsWith('pack')));
});

test('packed listing: extra entries and a pak that differs from the staged file are refused', async t => {
  const extra = world(t, { packExtra: true });
  await assert.rejects(runBuild(extra, ['--only', 'pak02']), /^Error: pak02 VPK asset set differs from exact contract \(scripts\/abilities\.vdata_c\): scripts\/abilities\.vdata_c, scripts\/extra\.vdata_c$/);
  const corrupt = world(t, { packCorrupt: true });
  await assert.rejects(runBuild(corrupt, ['--only', 'pak03']), /^Error: pak03 VPK scripts\/abilities\.vdata_c differs from staged /);
  assert.ok(!corrupt.events.some(e => e.startsWith('7z')));
});

test('verifyPackedVpk: a pak without the VData is missing its required asset', t => {
  const root = tempRoot(t);
  const staged = path.join(root, 'staged');
  fs.writeFileSync(staged, 'x');
  const vpkOut = path.join(root, 'p.vpk');
  fs.writeFileSync(vpkOut, makeVpk({ 'scripts/other.vdata_c': Buffer.from('x') }));
  assert.throws(() => build.verifyPackedVpk({ fs }, { name: 'pak02', vpkOut }, staged), /^Error: pak02 VPK missing required asset: scripts\/abilities\.vdata_c$/);
});

test('archive listing must name the pak', async t => {
  const w = world(t, { archiveListingWrong: true });
  await assert.rejects(runBuild(w, ['--only', 'pak02']), /^Error: 7z archive missing expected file: pak02_dir\.vpk$/);
});

test('removeRootIncludeBlock: one block removed, none left alone, two refused', t => {
  const root = tempRoot(t);
  const file = path.join(root, 'abilities.vdata');
  const logs = [];
  const deps = { fs, log: m => logs.push(m) };
  fs.writeFileSync(file, KV3 + INCLUDE + BODY);
  build.removeRootIncludeBlock(deps, file);
  assert.equal(fs.readFileSync(file, 'utf8'), KV3 + BODY);
  build.removeRootIncludeBlock(deps, file);
  assert.deepEqual(logs, ['[preprocess] remove _include from abilities.vdata']);
  fs.writeFileSync(file, KV3 + INCLUDE + BODY + INCLUDE);
  assert.throws(() => build.removeRootIncludeBlock(deps, file), /Expected at most one root _include block in .*abilities\.vdata, found 2/);
});

// ---- SteamTracking refresh ---------------------------------------------------------------------------

function fakeFetch(head, body) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith('https://api.github.com/')) return { ok: true, status: 200, json: async () => head };
    return { ok: true, status: 200, text: async () => body };
  };
  fn.calls = calls;
  return fn;
}

test('refresh: pinned SHA URL, both baselines rewritten without _include, then the build', async t => {
  const w = world(t);
  const sha = 'a'.repeat(40);
  w.deps.fetch = fakeFetch({ sha, commit: { message: 'Deadlock 6870 ' + 'x'.repeat(80) + '\nbody' } }, KV3 + INCLUDE + '{ upstream = 1 }\r\n');
  await runBuild(w, ['--refresh-from-steam-tracking']);
  assert.equal(w.deps.fetch.calls[1].url, `https://raw.githubusercontent.com/SteamTracking/GameTracking-Deadlock/${sha}/game/citadel/pak01_dir/scripts/abilities.vdata`);
  assert.ok(w.logs.includes(`[update] fetch upstream abilities.vdata at aaaaaaaaaa (${('Deadlock 6870 ' + 'x'.repeat(80)).slice(0, 60)})`));
  assert.deepEqual(w.logs.filter(l => l.startsWith('[update] write')), ['[update] write abilities.vdata from upstream abilities.vdata', '[update] write abilities2.vdata from upstream abilities.vdata']);
  assert.equal(fs.readFileSync(path.join(w.scripts, 'abilities2.vdata'), 'utf8'), KV3 + '{ upstream = 1 }\r\n#apply_healthbar_status_overrides.py\n');
  assert.ok(w.events.indexOf('log [update] write abilities2.vdata from upstream abilities.vdata') < w.events.indexOf('extract-stock'));
});

test('refresh refusals: bad SHA, non-KV3 body, wrong _include count', async t => {
  const p = build.repoPaths(tempRoot(t), 'G\\pak01_dir.vpk', '11_13');
  const deps = f => ({ fs, log: () => {}, fetch: f });
  await assert.rejects(build.refreshFromSteamTracking(deps(fakeFetch({ sha: 'nope' }, '')), p, ['abilities.vdata']), /Could not resolve SteamTracking\/GameTracking-Deadlock master to a commit SHA/);
  const sha = 'b'.repeat(40);
  await assert.rejects(build.refreshFromSteamTracking(deps(fakeFetch({ sha, commit: { message: 'x' } }, '<html>')), p, ['abilities.vdata']), /Unexpected upstream abilities\.vdata response/);
  await assert.rejects(build.refreshFromSteamTracking(deps(fakeFetch({ sha, commit: { message: 'x' } }, KV3 + BODY)), p, ['abilities.vdata']), /Expected exactly one root _include block in upstream abilities\.vdata, found 0/);
});

// ---- shared compiler runner, wrapper rules -----------------------------------------------------------

test('runSource2Compiler (requireSummary=false): stops a compiler that keeps running after its outputs', async t => {
  const root = tempRoot(t);
  const compiler = path.join(root, 'c.exe');
  fs.writeFileSync(compiler, 'exe');
  const out = path.join(root, 'out');
  const logs = [];
  const spawn = (file, args, options) => {
    fs.writeSync(options.stdio[1], 'compiling');
    fs.mkdirSync(path.join(out, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(out, 'scripts', 'a.vdata_c'), 'x');
    const child = new EventEmitter();
    child.kill = () => { child.killed = true; setImmediate(() => child.emit('exit', null, 'SIGTERM')); };
    return child;
  };
  const deps = { fs, spawn, spawnSync: () => ({ status: 1 }), env: {}, log: m => logs.push(m), now: Date.now, sleep: () => new Promise(r => setImmediate(r)) };
  await toolchain.runSource2Compiler(deps, { compiler, sourceDir: root, logDir: root, outputDir: out, assets: ['scripts/a.vdata_c'], requireSummary: false });
  assert.deepEqual(logs, ['[WARN] Compiler produced output but did not exit; stopping wrapper.', '[WARN] Compiler exited -1 but output exists; continuing.']);
});

test('judgeCompile (requireSummary=false): outputs decide; exits are warnings', () => {
  const base = { summaryLine: null, missing: [], stoppedAtPrompt: false, stdoutText: '', stderrText: '', requireSummary: false };
  assert.equal(toolchain.judgeCompile({ ...base, exitCode: 0 }), null);
  assert.equal(toolchain.judgeCompile({ ...base, exitCode: 5 }), '[WARN] Compiler exited 5 but output exists; continuing.');
  assert.equal(toolchain.judgeCompile({ ...base, exitCode: null, stoppedAtPrompt: true }), '[WARN] Compiler exited -1 but output exists; continuing.');
  assert.throws(() => toolchain.judgeCompile({ ...base, exitCode: 0, missing: ['scripts/a.vdata_c'] }), /^Error: Missing compiled outputs: scripts\/a\.vdata_c/);
});

test('archiveTable: Format-Table layout', () => {
  const ms = new Date(2026, 10, 13, 0, 44, 31).getTime();
  assert.equal(build.formatDateTime(ms), '11/13/2026 12:44:31 AM');
  assert.equal(build.formatDateTime(new Date(2026, 0, 2, 13, 5, 9).getTime()), '1/2/2026 1:05:09 PM');
  assert.equal(build.archiveTable([{ fullName: 'C:\\a\\x.7z', length: 5, mtimeMs: ms }, { fullName: 'C:\\long\\y.7z', length: 123456, mtimeMs: ms }]),
    '\nFullName     Length LastWriteTime\n--------     ------ -------------\nC:\\a\\x.7z         5 11/13/2026 12:44:31 AM\nC:\\long\\y.7z 123456 11/13/2026 12:44:31 AM\n');
});
