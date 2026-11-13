#!/usr/bin/env node
'use strict';
// Builds the four abilities VData paks (GameBanana mod 601444, see abilities/AGENTS.md): per pak a Python
// transform of abilities/scripts/abilities*.vdata, a Source 2 compile, stock RERL injection, a one-file
// pakXX_dir.vpk and a dated .7z in the addons folder beside --game-pak. Port of the retired
// build_abilities_paks.ps1; same steps, order, paths, archive names and messages.
//
//   node scripts/build-abilities.js [--only pak03[,pak04...]] [--deploy] [--game-pak <citadel\pak01_dir.vpk>]
//        [--refresh-from-steam-tracking]
//
// It lives in scripts/, not abilities/tools/: abilities/ is the compiler's source folder, and every .js
// there would be compiled as Panorama script.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const toolchain = require('../hp_colors_rewrite_v3/tools/lib/toolchain');
const { parseVpk, crc32 } = require('../hp_colors_rewrite_v3/tools/vpk-check');

const REPO = path.resolve(__dirname, '..');
// The PowerShell wrapper's -GamePak default; used when no Deadlock install is discovered.
const DEFAULT_GAME_PAK = 'G:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel\\pak01_dir.vpk';
const USAGE = 'Usage: node scripts/build-abilities.js [--only pak02,pak03,pak04,pak05] [--deploy] [--game-pak <citadel\\pak01_dir.vpk>] [--refresh-from-steam-tracking]';
const PACKED_ASSET = 'scripts/abilities.vdata_c';
const STEAM_TRACKING_REPO = 'SteamTracking/GameTracking-Deadlock';
// A root `_include = [ resource_name:"..." ]` block: the wrapper's (?ms) .NET pattern. Its Multiline `^` matches only at
// the start or after \n; JS `^` with the m flag also matches after a lone \r (inside CRLF), so the anchor is spelled out.
const INCLUDE_SOURCE = String.raw`(?<![^\n])\s*_include\s*=\s*\r?\n\s*\[\s*\r?\n(?:\s*resource_name:"[^"]+",?\s*\r?\n)+\s*\]\s*\r?\n`;

function parseArgs(argv) {
  const opts = { refreshFromSteamTracking: false, only: null, deploy: false, gamePak: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value. ${USAGE}`);
      i++;
      return next;
    };
    const addOnly = text => {
      const names = text.split(',').map(s => s.trim()).filter(Boolean);
      if (!names.length) throw new Error(`--only needs a pak name. ${USAGE}`);
      opts.only = [...(opts.only || []), ...names];
    };
    if (arg === '--refresh-from-steam-tracking') opts.refreshFromSteamTracking = true;
    else if (arg === '--only') addOnly(value());
    else if (arg.startsWith('--only=')) addOnly(arg.slice('--only='.length));
    else if (arg === '--deploy') opts.deploy = true;
    else if (arg === '--game-pak') opts.gamePak = value();
    else if (arg.startsWith('--game-pak=')) opts.gamePak = arg.slice('--game-pak='.length);
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`Unknown argument '${arg}'. ${USAGE}`);
  }
  return opts;
}

function defaultDeps() {
  return {
    fs,
    spawn: childProcess.spawn,
    spawnSync: childProcess.spawnSync,
    env: process.env,
    platform: process.platform,
    fetch: (...a) => fetch(...a),
    tmpdir: os.tmpdir,
    newId: () => crypto.randomUUID().replace(/-/g, ''),
    log: (...a) => console.log(...a),
    now: () => Date.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
  };
}

// Get-Date -Format 'MM_dd' (local time).
function dateTagOf(ms) {
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}`;
}

// --game-pak, else the discovered Deadlock install, else the wrapper's literal default.
function resolveGamePak(opts, deps) {
  if (opts.gamePak) return path.resolve(opts.gamePak);
  let found = null;
  try { found = toolchain.discoverDeadlock({ fs: deps.fs, env: deps.env, spawnSync: deps.spawnSync, platform: deps.platform }).steamInf; } catch { /* fall back */ }
  return found ? path.join(path.dirname(found), 'pak01_dir.vpk') : DEFAULT_GAME_PAK;
}

function repoPaths(root, gamePak, dateTag) {
  const modSrc = path.join(root, 'abilities');
  const modCompiled = path.join(root, 'abilities_compiled');
  const spec = (name, archive, script, inputFile, compiled, behaviorState) => ({
    name,
    stageDir: path.join(root, `${name}_dir`),
    vpkOut: path.join(root, `${name}_dir.vpk`),
    archiveName: `${archive}_${dateTag}.7z`,
    script,
    inputFile,
    compiledSource: path.join(modCompiled, 'scripts', compiled),
    behaviorState
  });
  return {
    root, modSrc, modCompiled,
    modScripts: path.join(modSrc, 'scripts'),
    compiler: path.join(root, 'sr2compiler', 'New folder.exe'),
    vpkToolCandidates: [path.join(root, 'passive_items_mod', 'compiler', 'vpkeditcli.exe'), path.join(root, 'vpk cli', 'vpkeditcli.exe')],
    stockPak01: gamePak,
    addons: path.join(path.dirname(gamePak), 'addons'),
    pakSpecs: [
      spec('pak02', 'templete', null, 'abilities.vdata', 'abilities.vdata_c', 'skip'),
      spec('pak03', 'filter_for_passive_and_active_items_yesBehaviour', 'active.py', 'abilities.vdata', 'abilities.vdata_c', 'enabled'),
      spec('pak04', 'filter_for_passive_items', 'passive.py', 'abilities2.vdata', 'abilities2.vdata_c', 'skip'),
      spec('pak05', 'filter_for_passive_and_active_items', 'active_no_behavior.py', 'abilities.vdata', 'abilities.vdata_c', 'disabled')
    ],
    legacyArchiveNames: [
      `filter_for_passive_and_active_items_noBehaviour_${dateTag}.7z`,
      `filter_for_passive_and_active_items_no_behavior_${dateTag}.7z`,
      `filter_for_passive_and_active_items_no_behavior_yes_behavior_${dateTag}.7z`
    ]
  };
}

// Get-Command <name>: the first PATH directory holding it.
function onPath(name, deps) {
  const sep = deps.platform === 'win32' ? ';' : path.delimiter;
  const pathVar = deps.env.PATH || deps.env.Path || '';
  for (const dir of pathVar.split(sep)) {
    if (!dir) continue;
    const candidate = path.join(dir.replace(/^"(.*)"$/, '$1'), name);
    if (deps.fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Tool resolution, in the wrapper's order: vpkeditcli, py.exe, 7-Zip.
function resolveTools(paths, deps) {
  const vpkeditcli = toolchain.findTool(paths.vpkToolCandidates, 'vpkeditcli.exe', deps.fs);
  let python = onPath('py.exe', deps);
  if (!python) {
    const local = deps.env.LOCALAPPDATA || '';
    const candidates = [
      path.join(local, 'Programs', 'Python', 'Launcher', 'py.exe'),
      path.join(local, 'Programs', 'Python', 'Python312', 'python.exe'),
      'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Launcher\\py.exe',
      'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'
    ];
    python = candidates.find(c => deps.fs.existsSync(c)) || null;
  }
  const sevenZip = onPath('7z.exe', deps) || 'C:\\Program Files\\7-Zip\\7z.exe';
  if (!python || !deps.fs.existsSync(python)) throw new Error('Python was not found on PATH or in the expected user install paths');
  if (!deps.fs.existsSync(sevenZip)) throw new Error('7z.exe was not found on PATH or at C:\\Program Files\\7-Zip\\7z.exe');
  return { vpkeditcli, python, sevenZip };
}

// -Only: case-insensitive name filter; refused with a refresh, which must rewrite both baselines.
function selectSpecs(specs, opts) {
  if (!opts.only) return specs;
  if (opts.refreshFromSteamTracking) throw new Error('--refresh-from-steam-tracking cannot be combined with --only');
  const wanted = new Set(opts.only.map(n => n.toLowerCase()));
  const picked = specs.filter(s => wanted.has(s.name.toLowerCase()));
  if (!picked.length) throw new Error(`No pak spec matches --only ${opts.only.join(', ')}`);
  return picked;
}

function includeMatches(content) {
  return [...content.matchAll(new RegExp(INCLUDE_SOURCE, 'g'))];
}

function removeInclude(content) {
  return content.replace(new RegExp(INCLUDE_SOURCE), '');
}

// Remove-RootIncludeBlock.
function removeRootIncludeBlock(deps, inputPath) {
  const content = deps.fs.readFileSync(inputPath, 'utf8');
  const count = includeMatches(content).length;
  if (count > 1) throw new Error(`Expected at most one root _include block in ${inputPath}, found ${count}`);
  if (count === 1) {
    deps.log(`[preprocess] remove _include from ${path.basename(inputPath)}`);
    deps.fs.writeFileSync(inputPath, removeInclude(content), 'utf8');
  }
}

// Copy-ItemWithRetry: 10 attempts, 500 ms apart.
async function copyWithRetry(deps, source, destination) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      deps.fs.copyFileSync(source, destination);
      return;
    } catch (err) {
      if (attempt === 10) throw err;
      await deps.sleep(500);
    }
  }
}

// Update-AbilityBaselinesFromSteamTracking: master resolved to a commit SHA (raw.githubusercontent.com caches
// branch URLs right after a game update), root _include stripped, written to every input file.
async function refreshFromSteamTracking(deps, paths, inputFiles) {
  const headRes = await deps.fetch(`https://api.github.com/repos/${STEAM_TRACKING_REPO}/commits/master`, { headers: { 'User-Agent': 'build-abilities' } });
  if (!headRes.ok) throw new Error(`GitHub API request failed: ${headRes.status}`);
  const head = await headRes.json();
  const sha = String(head && head.sha || '');
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Could not resolve ${STEAM_TRACKING_REPO} master to a commit SHA`);
  let title = String(head.commit && head.commit.message || '').split('\n')[0];
  if (title.length > 60) title = title.slice(0, 60);
  const upstreamUrl = `https://raw.githubusercontent.com/${STEAM_TRACKING_REPO}/${sha}/game/citadel/pak01_dir/scripts/abilities.vdata`;
  deps.log(`[update] fetch upstream abilities.vdata at ${sha.slice(0, 10)} (${title})`);
  const res = await deps.fetch(upstreamUrl);
  if (!res.ok) throw new Error(`Upstream abilities.vdata request failed: ${res.status}`);
  let content = await res.text();
  if (!content.startsWith('<!-- kv3 encoding:text:')) throw new Error('Unexpected upstream abilities.vdata response');
  const count = includeMatches(content).length;
  if (count !== 1) throw new Error(`Expected exactly one root _include block in upstream abilities.vdata, found ${count}`);
  content = removeInclude(content);
  for (const inputFile of inputFiles) {
    deps.log(`[update] write ${inputFile} from upstream abilities.vdata`);
    deps.fs.writeFileSync(path.join(paths.modScripts, inputFile), content, 'utf8');
  }
}

// Get-Process -Name deadlock.
function deadlockRunning(deps) {
  const r = deps.spawnSync('tasklist', ['/FI', 'IMAGENAME eq deadlock.exe', '/NH', '/FO', 'CSV'], { encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`Could not check whether Deadlock is running (tasklist${r.error ? ': ' + r.error.message : ' exited ' + r.status})`);
  return /^"deadlock\.exe"/im.test(String(r.stdout || ''));
}

// Invoke-AbilityScript. A freshly written 7 MB VData file can be briefly locked (scanner/indexer) and Python's
// open-for-write then fails before truncating, so a rerun is safe.
async function runAbilityScript(deps, ctx, scriptName, inputFile, attempts = 5) {
  deps.log(`[transform] ${scriptName}`);
  let status = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const r = deps.spawnSync(ctx.tools.python, [scriptName, inputFile], { cwd: ctx.paths.modScripts, stdio: 'inherit' });
    status = toolchain.checkSpawn(r, scriptName);
    if (status === 0) return;
    if (attempt < attempts) {
      deps.log(`  [retry] ${scriptName} exited ${status}; retrying (${attempt}/${attempts})`);
      await deps.sleep(1000);
    }
  }
  throw new Error(`${scriptName} failed with exit code ${status} after ${attempts} attempts`);
}

// Test-AbilityBehaviorState: active.verify_behavior_state in a python -c (paths with doubled backslashes, as the
// wrapper passed them).
function verifyBehaviorState(deps, ctx, inputFile, behaviorState) {
  if (behaviorState === 'skip') return;
  if (behaviorState !== 'enabled' && behaviorState !== 'disabled') throw new Error(`Unknown behavior state ${behaviorState}`);
  const double = p => p.replace(/\\/g, '\\\\');
  const inputPath = path.join(ctx.paths.modScripts, inputFile);
  const expectEnabled = behaviorState === 'enabled' ? 'True' : 'False';
  const code = `import sys; sys.path.insert(0, r'${double(ctx.paths.modScripts)}'); from active import verify_behavior_state; sys.exit(0 if verify_behavior_state(r'${double(inputPath)}', expect_enabled=${expectEnabled}) else 1)`;
  deps.log(`[verify] behavior ${behaviorState} for ${inputFile}`);
  const r = deps.spawnSync(ctx.tools.python, ['-c', code], { stdio: 'inherit' });
  if (toolchain.checkSpawn(r, 'python') !== 0) throw new Error(`Behavior state verification failed for ${inputFile} (${behaviorState})`);
}

// Invoke-AbilityCompiler: fresh abilities_compiled, both VData outputs required, then stock RERL injection
// (the Dota compiler emits none for Deadlock icons; without it ~560 icon textures load on first HUD use).
async function compileAbilities(deps, ctx, spec) {
  const { paths } = ctx;
  deps.fs.rmSync(paths.modCompiled, { recursive: true, force: true });
  deps.log('[compile] abilities');
  await toolchain.runSource2Compiler(deps, {
    compiler: paths.compiler,
    sourceDir: paths.modSrc,
    logDir: ctx.baselineDir,
    outputDir: paths.modCompiled,
    assets: ['scripts/abilities.vdata_c', 'scripts/abilities2.vdata_c'],
    requireSummary: false,
    timeoutMs: 180 * 1000
  });
  const r = deps.spawnSync(ctx.tools.python, [path.join(paths.modScripts, 'inject_stock_external_refs.py'), spec.compiledSource, path.join(paths.modScripts, spec.inputFile), ctx.stockVData], { stdio: 'inherit' });
  if (toolchain.checkSpawn(r, 'inject_stock_external_refs.py') !== 0) throw new Error(`External reference injection failed for ${spec.inputFile}`);
}

// The packed pak must hold exactly scripts/abilities.vdata_c with the staged file's CRC and size.
function verifyPackedVpk(deps, spec, stagedFile) {
  const vpk = parseVpk(deps.fs.readFileSync(spec.vpkOut), spec.vpkOut);
  const listing = vpk.entries.map(e => e.path);
  const label = `${spec.name} VPK`;
  toolchain.assertPackedAssets(listing, [PACKED_ASSET], [], label);
  if (!toolchain.sameSet([PACKED_ASSET], listing)) throw new Error(`${label} asset set differs from exact contract (${PACKED_ASSET}): ${listing.join(', ')}`);
  const staged = deps.fs.readFileSync(stagedFile);
  const entry = vpk.entries[0];
  if (entry.size !== staged.length || entry.crc !== crc32(staged)) {
    throw new Error(`${label} ${PACKED_ASSET} differs from staged ${stagedFile} (packed ${entry.size} bytes, staged ${staged.length})`);
  }
}

// Stage-And-Pack, plus the packed-listing check.
function stageAndPack(deps, ctx, spec) {
  const fsx = deps.fs;
  fsx.rmSync(spec.stageDir, { recursive: true, force: true });
  fsx.mkdirSync(path.join(spec.stageDir, 'scripts'), { recursive: true });
  const staged = path.join(spec.stageDir, 'scripts', 'abilities.vdata_c');
  fsx.copyFileSync(spec.compiledSource, staged);
  toolchain.vpkPack(deps, ctx.tools.vpkeditcli, spec.stageDir, spec.vpkOut);
  verifyPackedVpk(deps, spec, staged);
}

// Compress-Vpk: replaces addons/<archive>.
function compressVpk(deps, ctx, spec) {
  const archivePath = path.join(ctx.paths.addons, spec.archiveName);
  deps.fs.rmSync(archivePath, { force: true });
  deps.log(`[archive] ${spec.archiveName}`);
  toolchain.compress7z(deps, ctx.tools.sevenZip, spec.vpkOut, archivePath, path.basename(spec.vpkOut));
  return archivePath;
}

function removeLegacyArchives(deps, ctx) {
  for (const name of ctx.paths.legacyArchiveNames) {
    const archivePath = path.join(ctx.paths.addons, name);
    if (deps.fs.existsSync(archivePath)) {
      deps.log(`[archive] remove legacy ${name}`);
      deps.fs.rmSync(archivePath, { force: true });
    }
  }
}

// DateTime.ToString() under en-US: M/d/yyyy h:mm:ss AM.
function formatDateTime(ms) {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

// Get-Item | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize.
function archiveTable(rows) {
  const cells = rows.map(r => [r.fullName, String(r.length), formatDateTime(r.mtimeMs)]);
  const head = ['FullName', 'Length', 'LastWriteTime'];
  const w = head.map((h, i) => Math.max(h.length, ...cells.map(c => c[i].length)));
  const line = c => `${c[0].padEnd(w[0])} ${c[1].padStart(w[1])} ${c[2]}`.trimEnd();
  return ['', line(head), line(head.map(h => '-'.repeat(h.length))), ...cells.map(line), ''].join('\n');
}

async function build(opts, deps = defaultDeps(), root = REPO) {
  const fsx = deps.fs;
  const gamePak = resolveGamePak(opts, deps);
  const paths = repoPaths(root, gamePak, dateTagOf(deps.now()));
  const tools = resolveTools(paths, deps);
  const specs = selectSpecs(paths.pakSpecs, opts);
  const ctx = { paths, tools, baselineDir: null, stockVData: null };
  const inputFiles = [...new Set(specs.map(s => s.inputFile))];

  if (opts.refreshFromSteamTracking) await refreshFromSteamTracking(deps, paths, inputFiles);
  if (opts.deploy && deadlockRunning(deps)) throw new Error('Deadlock is running and locks addons paks; close it before --deploy');

  ctx.baselineDir = path.join(deps.tmpdir(), 'deadlock_abilities_baseline_' + deps.newId());
  fsx.mkdirSync(ctx.baselineDir, { recursive: true });

  if (!fsx.existsSync(paths.stockPak01)) throw new Error(`Stock Deadlock pak01_dir.vpk not found: ${paths.stockPak01}`);
  ctx.stockVData = path.join(ctx.baselineDir, 'stock_abilities.vdata_c');
  const extract = deps.spawnSync(tools.vpkeditcli, ['--no-progress', '--extract', 'scripts/abilities.vdata_c', '--output', ctx.stockVData, paths.stockPak01], { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
  if (extract.error || extract.status !== 0 || !fsx.existsSync(ctx.stockVData)) {
    throw new Error(`Failed to extract stock scripts/abilities.vdata_c from ${paths.stockPak01}`);
  }

  const baselines = new Map();
  for (const inputFile of inputFiles) {
    const inputPath = path.join(paths.modScripts, inputFile);
    removeRootIncludeBlock(deps, inputPath);
    await runAbilityScript(deps, ctx, 'apply_healthbar_status_overrides.py', inputFile);
    const baselinePath = path.join(ctx.baselineDir, inputFile);
    await copyWithRetry(deps, inputPath, baselinePath);
    baselines.set(inputFile, baselinePath);
  }

  for (const spec of specs) {
    await copyWithRetry(deps, baselines.get(spec.inputFile), path.join(paths.modScripts, spec.inputFile));
    if (spec.script) await runAbilityScript(deps, ctx, spec.script, spec.inputFile);
    else deps.log(`[transform] skip for ${spec.inputFile}`);
    verifyBehaviorState(deps, ctx, spec.inputFile, spec.behaviorState);
    await compileAbilities(deps, ctx, spec);
    stageAndPack(deps, ctx, spec);
  }

  // Restore inputs before deploy/archive so a failure there cannot leave a transformed baseline.
  for (const inputFile of inputFiles) await copyWithRetry(deps, baselines.get(inputFile), path.join(paths.modScripts, inputFile));

  if (opts.deploy) {
    for (const spec of specs) {
      const deployPath = path.join(paths.addons, path.basename(spec.vpkOut));
      deps.log(`[deploy] ${deployPath}`);
      await copyWithRetry(deps, spec.vpkOut, deployPath);
    }
  }

  removeLegacyArchives(deps, ctx);
  const archives = specs.map(spec => compressVpk(deps, ctx, spec));

  for (const spec of specs) {
    fsx.rmSync(spec.stageDir, { recursive: true, force: true });
    fsx.rmSync(spec.vpkOut, { force: true });
  }
  fsx.rmSync(ctx.baselineDir, { recursive: true, force: true });

  deps.log(archiveTable(archives.map(a => { const st = fsx.statSync(a); return { fullName: a, length: st.size, mtimeMs: st.mtimeMs }; })));
  return archives;
}

async function main(argv = process.argv.slice(2), deps = defaultDeps(), root = REPO) {
  const opts = parseArgs(argv);
  if (opts.help) { deps.log(USAGE); return 0; }
  await build(opts, deps, root);
  return 0;
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, err => { console.error(err.message); process.exitCode = 1; });
}

module.exports = {
  parseArgs, dateTagOf, resolveGamePak, repoPaths, resolveTools, selectSpecs, removeRootIncludeBlock, refreshFromSteamTracking,
  runAbilityScript, verifyBehaviorState, compileAbilities, verifyPackedVpk, stageAndPack, archiveTable, formatDateTime, build, main,
  DEFAULT_GAME_PAK, USAGE
};
