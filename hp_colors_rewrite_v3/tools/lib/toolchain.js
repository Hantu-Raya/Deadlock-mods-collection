'use strict';
// Toolchain detection shared by tools/build.js and tools/doctor.js: the Source 2 compiler's .NET runtime,
// repo tool resolution (Get-RepoToolPath), and compiler-failure explanations. Also the Source 2 packaging
// helpers (compiler run, VPK pack/listing, 7-Zip) used by tools/build.js and scripts/build-abilities.js.
// Every probe takes injected fs/spawnSync/env so tests run without the real machine.
const path = require('node:path');

// Get-RepoToolPath: the first existing candidate, else the wrappers' exact error.
function findTool(candidates, toolName, fs) {
  for (const candidate of candidates) if (candidate && fs.existsSync(candidate)) return candidate;
  throw new Error(`${toolName} not found. Checked: ${candidates.join(', ')}`);
}

// The compiler's <name>.runtimeconfig.json (falls back to any *.runtimeconfig.json beside it).
function readRuntimeConfig(exePath, fs) {
  const dir = path.dirname(exePath);
  let file = path.join(dir, path.basename(exePath).replace(/\.exe$/i, '') + '.runtimeconfig.json');
  if (!fs.existsSync(file)) {
    let names = [];
    try { names = fs.readdirSync(dir).filter(name => /\.runtimeconfig\.json$/i.test(name)).sort(); } catch { /* dir missing */ }
    if (!names.length) return null;
    file = path.join(dir, names[0]);
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const options = json.runtimeOptions || {};
  const framework = options.framework || (Array.isArray(options.frameworks) ? options.frameworks[0] : null);
  if (!framework || !framework.name || !framework.version) throw new Error(`${file} names no framework`);
  return { file, name: framework.name, version: framework.version, major: Number.parseInt(framework.version, 10) };
}

// `dotnet --list-runtimes` lines: "Microsoft.NETCore.App 10.0.14 [C:\...]".
function parseListRuntimes(text) {
  const runtimes = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*(\S+)\s+(\d+)\.(\d+)\.(\S+)\s+\[/.exec(line);
    if (m) runtimes.push({ name: m[1], version: `${m[2]}.${m[3]}.${m[4]}`, major: Number(m[2]) });
  }
  return runtimes;
}

// Candidate dotnet hosts: PATH first, then DOTNET_ROOT and the default Windows install.
function dotnetCandidates(env) {
  const list = ['dotnet'];
  if (env.DOTNET_ROOT) list.push(path.join(env.DOTNET_ROOT, 'dotnet.exe'));
  for (const key of ['ProgramFiles', 'ProgramW6432']) if (env[key]) list.push(path.join(env[key], 'dotnet', 'dotnet.exe'));
  return [...new Set(list)];
}

function listRuntimes({ spawnSync, env }) {
  for (const exe of dotnetCandidates(env)) {
    let result;
    try { result = spawnSync(exe, ['--list-runtimes'], { encoding: 'utf8', env, windowsHide: true }); } catch { continue; }
    if (result && !result.error && result.status === 0) return { host: exe, runtimes: parseListRuntimes(result.stdout) };
  }
  return { host: null, runtimes: [] };
}

// present: the required major is installed; roll-forward: only a higher major is, so the compiler needs
// DOTNET_ROLL_FORWARD=Major; missing: nothing usable (or no dotnet host to ask).
function decideRuntime(config, runtimes, env = {}) {
  const same = runtimes.filter(r => r.name === config.name);
  const exact = same.filter(r => r.major === config.major);
  if (exact.length) return { status: 'present', env: {}, detail: `${config.name} ${exact.map(r => r.version).join(', ')} satisfies ${config.version}` };
  const higher = same.filter(r => r.major > config.major).sort((a, b) => a.major - b.major);
  if (higher.length) {
    const target = higher[0];
    const preset = env.DOTNET_ROLL_FORWARD;
    return {
      status: 'roll-forward',
      target,
      env: preset ? {} : { DOTNET_ROLL_FORWARD: 'Major' },
      detail: `${config.name} ${config.major}.x missing; ${target.version} available via DOTNET_ROLL_FORWARD=Major` + (preset ? ` (DOTNET_ROLL_FORWARD=${preset} already set)` : ''),
      logLine: preset
        ? `Compiler needs .NET ${config.major} (${config.name}); not installed, DOTNET_ROLL_FORWARD=${preset} is already set, so it runs on ${target.version}.`
        : `Compiler needs .NET ${config.major} (${config.name}); not installed, so it runs on ${target.version} with DOTNET_ROLL_FORWARD=Major (compiler process only).`
    };
  }
  const have = same.map(r => r.version).join(', ') || 'none';
  return { status: 'missing', env: {}, detail: `${config.name} ${config.major}.x or higher not installed (found: ${have})` };
}

// Full probe for the compiler: runtimeconfig + installed runtimes + decision.
function probeCompilerRuntime(compilerPath, { fs, spawnSync, env }) {
  if (!fs.existsSync(compilerPath)) return { status: 'no-compiler', env: {}, detail: `${compilerPath} not found` };
  let config;
  try { config = readRuntimeConfig(compilerPath, fs); }
  catch (err) { return { status: 'unknown', env: {}, detail: `runtimeconfig unreadable: ${err.message}` }; }
  if (!config) return { status: 'unknown', env: {}, detail: 'no *.runtimeconfig.json beside the compiler (self-contained or not .NET)' };
  const { host, runtimes } = listRuntimes({ spawnSync, env });
  if (!host) return { status: 'no-dotnet', config, env: {}, detail: `requires ${config.name} ${config.version}; 'dotnet --list-runtimes' unavailable` };
  return { config, host, runtimes, ...decideRuntime(config, runtimes, env) };
}

function tail(text, lines = 20) {
  const all = String(text || '').replace(/\s+$/, '').split(/\r?\n/);
  return all.slice(-lines).join('\n');
}

// One-line cause for known compiler-launch failures, or null.
function compilerFailureCause(text) {
  const s = String(text || '');
  if (/You must install or update \.NET/i.test(s)) {
    const fw = /Framework:\s*'([^']+)',\s*version\s*'([^']+)'/i.exec(s);
    const need = fw ? `${fw[1]} ${fw[2]}` : 'its .NET runtime';
    return `Cause: the compiler could not start because ${need} is not installed; install that .NET major, or a higher one (the build then sets DOTNET_ROLL_FORWARD=Major).`;
  }
  return null;
}

// The error thrown when compiled outputs are missing: list, cause, then both log tails.
function formatMissingOutputs(missing, { stdoutText = '', stderrText = '', lines = 20 } = {}) {
  const parts = [`Missing compiled outputs: ${missing.join(', ')}`];
  const cause = compilerFailureCause(stderrText) || compilerFailureCause(stdoutText);
  if (cause) parts.push(cause);
  parts.push(`--- compile.stderr.log (last ${lines} lines) ---`, tail(stderrText, lines) || '(empty)');
  parts.push(`--- compile.stdout.log (last ${lines} lines) ---`, tail(stdoutText, lines) || '(empty)');
  return parts.join('\n');
}

// ---- Deadlock install discovery (read-only toward the game folder) ---------------------------

const DEADLOCK_APP_ID = '1422450';
const STEAM_INF_TAIL = ['game', 'citadel', 'steam.inf'];

// `reg query <key> /v <name>` -> the REG_SZ value, or null.
function regValue(spawnSync, key, name) {
  let r;
  try { r = spawnSync('reg', ['query', key, '/v', name], { encoding: 'utf8', windowsHide: true }); } catch { return null; }
  if (!r || r.error || r.status !== 0) return null;
  const m = new RegExp('^\\s*' + name + '\\s+REG_(?:EXPAND_)?SZ\\s+(.+?)\\s*$', 'mi').exec(String(r.stdout || ''));
  return m ? m[1] : null;
}

// Every "path" of a Steam libraryfolders.vdf (VDF strings escape backslashes).
function parseLibraryFolders(text) {
  return [...String(text || '').matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/gi)].map(m => m[1].replace(/\\(.)/g, '$1'));
}

// "installdir" of an appmanifest .acf (default Deadlock).
function manifestInstallDir(text) {
  const m = /"installdir"\s+"((?:[^"\\]|\\.)*)"/i.exec(String(text || ''));
  return m ? m[1].replace(/\\(.)/g, '$1') : 'Deadlock';
}

function steamInfOf(gameDir, P = path) { return P.join(gameDir, ...STEAM_INF_TAIL); }

// Finds Deadlock's citadel/steam.inf. Order: explicit flag, HPV3_STEAM_INF, HPV3_DEADLOCK_DIR, Steam libraries
// (registry SteamPath/InstallPath -> libraryfolders.vdf -> appmanifest_1422450.acf), then a drive scan of
// <X>:\SteamLibrary and <X>:\Program Files (x86)\Steam. Returns { steamInf, source, tried }; steamInf is null
// when nothing was found. An explicit flag or env path is returned even if absent (the caller reports it).
function discoverDeadlock({ flag = null, fs, env = {}, spawnSync, platform = process.platform } = {}) {
  const tried = [];
  if (flag) return { steamInf: flag, source: '--installed-steam-inf', tried };
  if (env.HPV3_STEAM_INF) return { steamInf: env.HPV3_STEAM_INF, source: 'HPV3_STEAM_INF', tried };
  if (env.HPV3_DEADLOCK_DIR) return { steamInf: steamInfOf(env.HPV3_DEADLOCK_DIR, platform === 'win32' ? path.win32 : path), source: 'HPV3_DEADLOCK_DIR', tried };
  if (platform !== 'win32') return { steamInf: null, source: 'none', tried: ['(Steam discovery is Windows-only; set HPV3_STEAM_INF)'] };
  const P = path.win32;
  const seen = new Set();
  const check = (file, source) => {
    const key = P.resolve(file).toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    tried.push(file);
    return fs.existsSync(file) ? { steamInf: file, source, tried } : null;
  };
  const roots = [regValue(spawnSync, 'HKCU\\Software\\Valve\\Steam', 'SteamPath'), regValue(spawnSync, 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath')]
    .filter(Boolean).map(p => P.normalize(p));
  const libraries = [];
  for (const steamRoot of roots) {
    libraries.push(steamRoot);
    const vdf = P.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
    try { libraries.push(...parseLibraryFolders(fs.readFileSync(vdf, 'utf8')).map(p => P.normalize(p))); } catch { /* no vdf */ }
  }
  for (const library of libraries) {
    const manifest = P.join(library, 'steamapps', `appmanifest_${DEADLOCK_APP_ID}.acf`);
    if (!fs.existsSync(manifest)) continue;
    let dir = 'Deadlock';
    try { dir = manifestInstallDir(fs.readFileSync(manifest, 'utf8')); } catch { /* default */ }
    const hit = check(steamInfOf(P.join(library, 'steamapps', 'common', dir), P), 'Steam library ' + library);
    if (hit) return hit;
  }
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const drive = letter + ':\\';
    if (!fs.existsSync(drive)) continue;
    for (const base of [P.join(drive, 'SteamLibrary'), P.join(drive, 'Program Files (x86)', 'Steam')]) {
      const hit = check(steamInfOf(P.join(base, 'steamapps', 'common', 'Deadlock'), P), 'drive scan');
      if (hit) return hit;
    }
  }
  return { steamInf: null, source: 'none', tried };
}

// ClientVersion=NNNN of a steam.inf, or null.
function readClientVersion(text) {
  const m = /^\s*ClientVersion\s*=\s*(\d+)\s*$/mi.exec(String(text || ''));
  return m ? Number(m[1]) : null;
}

// The installed-vs-pin mismatch text shared by game-data.js --check-installed, build.js and doctor.js.
function pinMismatchMessage({ installed, pinned, steamInf }) {
  return `Installed game ClientVersion mismatch: installed=${installed} pinned=${pinned} (${steamInf}). ` +
    'Ways forward: rebase the pin to the installed build (node hp_colors_rewrite_v3/tools/game-data.js --check-upstream to review drift, ' +
    'then update vendor/ and game-data-pin.json), or pass --allow-pin-mismatch to build against the pinned data anyway.';
}

// ---- Source 2 packaging (ported from scripts/source2_package_pipeline.ps1) --------------------------
// Shared by hp_colors_rewrite_v3/tools/build.js and scripts/build-abilities.js: a frozen shared surface, so
// a change to a signature here must update both callers. deps carries fs, spawn,
// spawnSync, env, log, now and sleep so tests stub every process.

// Redirected Console.ReadKey crash: CLR unhandled-exception code 0xE0434352 (-532462766 signed).
const READKEY_EXIT = -532462766;
const COMPILE_TIMEOUT_MS = 180 * 1000;

function checkSpawn(result, what) {
  if (result.error) throw new Error(`${what} could not start: ${result.error.message}`);
  return result.status;
}

// PowerShell's view of native output: one string per line, no trailing empty line.
function outputLines(text) {
  const lines = String(text || '').split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Invoke-VpkPack.
function vpkPack(deps, vpkTool, inputDir, outputPath) {
  const result = deps.spawnSync(vpkTool, [inputDir, '-o', outputPath, '-s', '--no-progress'], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true });
  const status = checkSpawn(result, 'vpkeditcli');
  for (const line of [...outputLines(result.stdout), ...outputLines(result.stderr)]) deps.log(line);
  if (status !== 0) throw new Error(`vpkeditcli failed with exit code ${status}`);
  if (!deps.fs.existsSync(outputPath)) throw new Error(`VPK not created: ${outputPath}`);
}

// Get-PackedVpkTree.
function packedVpkTree(deps, vpkTool, vpkPath, viewer = '') {
  if (viewer && deps.fs.existsSync(viewer)) {
    const result = deps.spawnSync(viewer, ['-i', vpkPath, '--vpk_list'], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    const status = checkSpawn(result, 'Source2Viewer');
    if (status !== 0) throw new Error(`Source2Viewer failed to inspect VPK with exit code ${status}`);
    return outputLines(result.stdout);
  }
  const result = deps.spawnSync(vpkTool, [vpkPath, '--file-tree', '--no-progress'], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const status = checkSpawn(result, 'vpkeditcli');
  if (status !== 0) throw new Error(`vpkeditcli failed to inspect VPK with exit code ${status}`);
  return outputLines(result.stdout);
}

// Source2Viewer lists each full path followed by CRC/size metadata.
function stripListing(lines) {
  return lines.map(l => l.trim()).filter(Boolean).map(l => l.replace(/ CRC:[0-9a-fA-F]+ size:\d+$/, ''));
}

// Test-PackedAsset: Select-String -SimpleMatch is a case-insensitive substring match, on the asset or its leaf.
function packedAssetPresent(tree, asset) {
  const leaf = asset.split(/[\\/]/).pop();
  const has = needle => tree.some(line => line.toLowerCase().includes(needle.toLowerCase()));
  return has(asset) || Boolean(leaf && has(leaf));
}

// Assert-PackedVpkAssets. `required` are asset paths (matched as case-insensitive substrings of a listing line, or of
// their leaf name); `forbiddenSubstrings` are NOT paths: each is the same substring test, so '.js' or 'ql_' rejects
// any listing line containing it (the lanes' BASE_FORBIDDEN and extras in projects.js).
function assertPackedAssets(tree, required, forbiddenSubstrings, label = 'VPK') {
  for (const asset of required) if (!packedAssetPresent(tree, asset)) throw new Error(`${label} missing required asset: ${asset}`);
  for (const asset of forbiddenSubstrings) if (packedAssetPresent(tree, asset)) throw new Error(`${label} contains forbidden asset: ${asset}`);
}

// ---- helpers shared by tools/build.js and tools/doctor.js ------------------------------------------

// `node <script> <args>` through deps.spawnSync/execPath; the caller passes its own spawn options (stdio, env, cwd ...).
function spawnNode(deps, script, args, options) {
  return deps.spawnSync(deps.execPath, [script, ...args], { encoding: 'utf8', ...options });
}

// The Deadlock install lookup of build.js and doctor.js (flag > env > registry/library discovery).
function findInstall(deps, flag) {
  return discoverDeadlock({ flag, fs: deps.fs, env: deps.env || {}, spawnSync: deps.spawnSync, platform: deps.platform || process.platform });
}

// The ShowRank dependency candidates in order: the installed addons/pak89_dir.vpk (when a Deadlock install was found),
// then the repo's showrank_barebones_dir.vpk; only existing files.
function showrankCandidates(deps, steamInf, repoVpk) {
  const addons = steamInf ? path.join(path.dirname(steamInf), 'addons') : '(no Deadlock install found)';
  return { addons, candidates: [...(steamInf ? [path.join(addons, 'pak89_dir.vpk')] : []), repoVpk].filter(f => deps.fs.existsSync(f)) };
}

// First candidate VPK whose listing contains `script` (case-insensitive). `list(candidate)` returns the listing lines or
// null to skip a candidate it could not read; `onMiss(candidate)` runs for each candidate that lacks the script.
function findShowrankCarrier(candidates, script, list, onMiss = () => {}) {
  for (const candidate of candidates) {
    const lines = list(candidate);
    if (!lines) continue;
    if (stripListing(lines).some(line => line.toLowerCase() === script.toLowerCase())) return candidate;
    onMiss(candidate);
  }
  return null;
}

// Compare-Object on sorted lists (case-insensitive, like PowerShell): true when both hold the same items.
function sameSet(expected, actual) {
  const a = expected.map(s => s.toLowerCase()).sort(), b = actual.map(s => s.toLowerCase()).sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function listFilesRelative(fsx, dir) {
  const out = [];
  const walk = current => {
    for (const entry of fsx.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full.slice(dir.length + 1).replace(/\\/g, '/'));
    }
  };
  walk(dir);
  return out;
}

// Compress-Vpk7Zip: `7z a -t7z`, then (with expectedLeaf) `7z l` must name the packed file.
function compress7z(deps, sevenZip, inputPath, archivePath, expectedLeaf = '') {
  const add = deps.spawnSync(sevenZip, ['a', '-t7z', archivePath, inputPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  if (add.error || add.status !== 0 || !deps.fs.existsSync(archivePath)) throw new Error(`7z failed for ${archivePath}`);
  if (!expectedLeaf) return;
  const list = deps.spawnSync(sevenZip, ['l', archivePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  if (list.error || list.status !== 0) throw new Error(`7z failed to list ${archivePath}`);
  if (!String(list.stdout || '').toLowerCase().includes(expectedLeaf.toLowerCase())) throw new Error(`7z archive missing expected file: ${expectedLeaf}`);
}

// Judges a finished compile: required outputs, then the summary, then the exit (Press-any-key handling).
// requireSummary=false is Invoke-Source2Compiler's rule: the required outputs decide, any other exit
// (including a wrapper stop, reported as -1) is a warning.
function judgeCompile({ exitCode, summaryLine, missing, stoppedAtPrompt, stdoutText, stderrText, requireSummary = true }) {
  if (missing.length) throw new Error(formatMissingOutputs(missing, { stdoutText, stderrText }));
  if (!requireSummary) {
    if (exitCode === 0 && !stoppedAtPrompt) return null;
    return `[WARN] Compiler exited ${exitCode === null || stoppedAtPrompt ? -1 : exitCode | 0} but output exists; continuing.`;
  }
  if (!summaryLine || !/\b0 failed\b/.test(summaryLine)) throw new Error('Missing success summary or compiler failures');
  if (stoppedAtPrompt) return 'Stopped compiler left at its exit prompt after 0 failed and all required outputs.';
  if (exitCode !== 0) {
    if ((exitCode | 0) !== READKEY_EXIT || !/System\.InvalidOperationException/.test(stderrText) || !/System\.ConsolePal\.ReadKey/.test(stderrText)) {
      throw new Error(`Unexpected compiler exit ${exitCode | 0}: ${stderrText}`);
    }
    return 'Accepted known redirected Console.ReadKey exit after 0 failed and all required outputs.';
  }
  return null;
}

function lastSummary(stdoutText) {
  const lines = outputLines(stdoutText).filter(l => /compiled, \d+ failed/.test(l));
  return lines.length ? lines[lines.length - 1] : null;
}

function readText(fsx, file) {
  try { return fsx.readFileSync(file, 'utf8'); } catch { return ''; }
}

// Runs sr2compiler\New folder.exe on sourceDir with stdout/stderr in logDir/compile.{stdout,stderr}.log and
// DOTNET_ROLL_FORWARD=Major for the compiler only when its .NET major is missing. The compiler ends with
// "Press any key to exit..."; with a console stdin it waits there (stopped here once the line appears), with
// redirected stdin it crashes with the known ReadKey exit. assets are outputDir-relative required outputs.
// requireSummary=true (v3): the "0 failed" summary is required and a timeout throws. requireSummary=false
// (Invoke-Source2Compiler): the compiler is also stopped 2 s after every required output exists, a timeout
// stops it, and only missing outputs fail.
async function runSource2Compiler(deps, { compiler, sourceDir, logDir, outputDir, assets, requireSummary = true, timeoutMs = COMPILE_TIMEOUT_MS }) {
  const fsx = deps.fs;
  const stdoutPath = path.join(logDir, 'compile.stdout.log');
  const stderrPath = path.join(logDir, 'compile.stderr.log');
  const runtime = probeCompilerRuntime(compiler, deps);
  if (runtime.status === 'roll-forward') deps.log(runtime.logLine);
  const env = { ...deps.env, ...runtime.env };
  const outFd = fsx.openSync(stdoutPath, 'w');
  const errFd = fsx.openSync(stderrPath, 'w');
  let child;
  try {
    child = deps.spawn(compiler, [sourceDir], { env, stdio: ['inherit', outFd, errFd], windowsHide: true });
  } finally {
    fsx.closeSync(outFd);
    fsx.closeSync(errFd);
  }
  let exitCode = null, exited = false, spawnError = null;
  const exitPromise = new Promise(resolve => {
    child.on('exit', code => { exitCode = code; exited = true; resolve(); });
    child.on('error', err => { spawnError = err; exited = true; resolve(); });
  });
  const allOutputs = () => assets.every(asset => fsx.existsSync(path.join(outputDir, asset)));
  const deadline = deps.now() + timeoutMs;
  let stoppedAtPrompt = false;
  while (!exited) {
    if (deps.now() > deadline) {
      child.kill();
      if (requireSummary) throw new Error('Source 2 compiler timed out');
      deps.log('[WARN] Compiler timed out; stopping wrapper.');
      await exitPromise;
      stoppedAtPrompt = true;
      break;
    }
    const atPrompt = readText(fsx, stdoutPath).includes('Press any key to exit');
    if (atPrompt || (!requireSummary && allOutputs())) {
      await deps.sleep(2000);
      if (!exited) {
        if (!requireSummary) deps.log('[WARN] Compiler produced output but did not exit; stopping wrapper.');
        child.kill();
        await exitPromise;
        stoppedAtPrompt = true;
      }
      break;
    }
    await deps.sleep(500);
  }
  if (spawnError) throw new Error(`Source 2 compiler could not start (${compiler}): ${spawnError.message}`);
  const stdoutText = readText(fsx, stdoutPath);
  const stderrText = readText(fsx, stderrPath);
  const summaryLine = lastSummary(stdoutText);
  const missing = assets.filter(asset => !fsx.existsSync(path.join(outputDir, asset)));
  if (requireSummary) deps.log(`Compiler exit=${exitCode === null ? '' : exitCode | 0}; summary=${summaryLine || ''}`);
  const note = judgeCompile({ exitCode, summaryLine, missing, stoppedAtPrompt, stdoutText, stderrText, requireSummary });
  if (note) deps.log(note);
}

module.exports = {
  findTool, readRuntimeConfig, parseListRuntimes, dotnetCandidates, listRuntimes, decideRuntime, probeCompilerRuntime, tail,
  compilerFailureCause, formatMissingOutputs,
  DEADLOCK_APP_ID, regValue, parseLibraryFolders, manifestInstallDir, discoverDeadlock, readClientVersion, pinMismatchMessage,
  READKEY_EXIT, COMPILE_TIMEOUT_MS, checkSpawn, outputLines, vpkPack, packedVpkTree, stripListing, packedAssetPresent,
  assertPackedAssets, sameSet, listFilesRelative, compress7z, judgeCompile, lastSummary, readText, runSource2Compiler,
  spawnNode, findInstall, showrankCandidates, findShowrankCarrier
};
