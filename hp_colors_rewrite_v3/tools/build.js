#!/usr/bin/env node
'use strict';
// Builds the HP Colors v3 pak02 of each lane (normal v3, QOLLOCK, ShowRank): generator checks, staging,
// the staged suites (with the suite cache), Source 2 compile, exact compiled/packed asset sets and the lane
// checks. It replaced the retired PowerShell build wrappers and produces the same pak.
//
//   node hp_colors_rewrite_v3/tools/build.js --project v3|qollock|showrank|all --skip-deploy
//        [--debug] [--allow-pin-mismatch] [--installed-steam-inf <steam.inf>] [--check-upstream (v3 only)]
//
// All three lanes are build-only: a build without --skip-deploy is refused.
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { REPO, repoPaths, projectConfig, stagePaths, expandProjects } = require('./lib/projects');
const { findTool, findInstall, spawnNode, showrankCandidates, findShowrankCarrier, checkSpawn, outputLines, vpkPack, packedVpkTree, stripListing,
  assertPackedAssets, sameSet, listFilesRelative, runSource2Compiler } = require('./lib/toolchain');
const { cacheEnabled, passDir: suitePassDir, isoLocal, passLine } = require('./suite-cache');

// The one spelling of the stage mode folders (stagePaths names the folder after the mode).
const modeOf = debug => (debug ? 'debug' : 'release');

const USAGE = 'Usage: node hp_colors_rewrite_v3/tools/build.js --project v3|qollock|showrank|all --skip-deploy [--debug] [--allow-pin-mismatch] [--installed-steam-inf <steam.inf>] [--check-upstream]';

function parseArgs(argv) {
  const opts = { project: null, debug: false, skipDeploy: false, allowPinMismatch: false, checkUpstream: false, installedSteamInf: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value. ${USAGE}`);
      i++;
      return next;
    };
    if (arg === '--project') opts.project = value();
    else if (arg.startsWith('--project=')) opts.project = arg.slice('--project='.length);
    else if (arg === '--debug') opts.debug = true;
    else if (arg === '--skip-deploy') opts.skipDeploy = true;
    else if (arg === '--allow-pin-mismatch') opts.allowPinMismatch = true;
    else if (arg === '--check-upstream') opts.checkUpstream = true;
    else if (arg === '--installed-steam-inf') opts.installedSteamInf = value();
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`Unknown argument '${arg}'. ${USAGE}`);
  }
  if (opts.help) return opts;
  if (!opts.project) throw new Error(`--project is required. ${USAGE}`);
  opts.projects = expandProjects(opts.project);
  // --check-upstream is a v3 (canonical) step; with 'all' it applies to the v3 build.
  if (opts.checkUpstream && !opts.projects.includes('v3')) throw new Error('--check-upstream applies to the v3 project only.');
  return opts;
}

function defaultDeps() {
  return {
    fs,
    spawn: childProcess.spawn,
    spawnSync: childProcess.spawnSync,
    env: process.env,
    execPath: process.execPath,
    platform: process.platform,
    log: (...a) => console.log(...a),
    warn: message => console.warn(`WARNING: ${message}`),
    now: () => Date.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
  };
}

// ---- process helpers -------------------------------------------------------------------------

// `& node <script> <args>`; returns the exit status. capture: stdout captured as lines (stderr shown).
function runNode(deps, script, args, { env = deps.env, capture = false } = {}) {
  const result = spawnNode(deps, script, args, { env, stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', maxBuffer: 256 * 1024 * 1024 });
  const status = checkSpawn(result, `node ${path.basename(script)}`);
  return { status, lines: capture ? outputLines(result.stdout) : [] };
}

// Set-Content (Windows PowerShell 5.1): CRLF after every line; -Encoding UTF8 adds a BOM.
function setContent(fsx, file, lines, { bom = false } = {}) {
  fsx.writeFileSync(file, (bom ? '\ufeff' : '') + lines.map(l => l + '\r\n').join(''), 'utf8');
}

function sortByName(files) {
  return [...files].sort((a, b) => {
    const x = path.basename(a).toLowerCase(), y = path.basename(b).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function testFiles(fsx, dir) {
  return sortByName(fsx.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.test.js'))
    .map(e => path.join(dir, e.name)));
}

// ---- packaging helpers (ported from scripts/source2_package_pipeline.ps1) ----------------------

// Assert-PathUnderRoot + Remove-TreeUnderRoot.
function assertPathUnderRoot(target, rootPath, platform = process.platform) {
  const norm = p => path.resolve(p).replace(/[\\/]+$/, '');
  const fold = s => (platform === 'win32' ? s.toLowerCase() : s);
  const resolved = norm(target), root = norm(rootPath);
  const r = fold(resolved), base = fold(root);
  if (r === base || !(r.startsWith(base + '\\') || r.startsWith(base + '/'))) throw new Error(`Refusing to operate outside root. Path=${resolved} Root=${root}`);
}

function removeTreeUnderRoot(fsx, target, rootPath, expectedLeaf = '', platform = process.platform) {
  if (!fsx.existsSync(target)) return;
  assertPathUnderRoot(target, rootPath, platform);
  const resolved = path.resolve(target);
  if (expectedLeaf && path.basename(resolved) !== expectedLeaf) throw new Error(`Refusing to remove unexpected path: ${resolved}`);
  fsx.rmSync(resolved, { recursive: true, force: true });
}

// ---- shared v3 pipeline ----------------------------------------------------------------------

// Invoke-HpV3Suite: runs the v3 VM suite against the staged tree; a pass is cached under
// hp_colors_rewrite_v3/.build/suite-pass/<key> (tools/suite-cache.js). HPV3_SUITE_CACHE=0 always runs it.
// Returns 'ran' or 'cached'. A run keeps its per-test durations as TAP in <stage>/suite.tap (beside the
// staged tree, never packed) for tools/timing.js, while the console still shows the spec reporter.
function runV3Suite(deps, paths, stageSource, mode, env) {
  const key = runNode(deps, paths.tools.suiteCache, ['--key', stageSource, mode], { env, capture: true });
  const last = key.lines.length ? key.lines[key.lines.length - 1] : '';
  if (key.status !== 0 || !/^[0-9a-f]{64}$/.test(last)) throw new Error('V3 suite cache key failed');
  const passDir = suitePassDir(paths.v3);
  const marker = path.join(passDir, last);
  if (cacheEnabled(env) && deps.fs.existsSync(marker)) {
    deps.log(`HPV3 staged suite (${mode}): passed before for identical inputs ${last.slice(0, 12)}; not rerun (HPV3_SUITE_CACHE=0 forces it)`);
    return 'cached';
  }
  // Include every present/future suite; no staged exclusions are currently intentional.
  const result = deps.spawnSync(deps.execPath, ['--test', ...tapReporters(path.join(path.dirname(stageSource), 'suite.tap')), ...testFiles(deps.fs, path.join(paths.v3, 'tests'))], { env, stdio: 'inherit' });
  if (checkSpawn(result, 'node --test') !== 0) throw new Error('Staged v3 VM tests failed');
  deps.fs.mkdirSync(passDir, { recursive: true });
  setContent(deps.fs, marker, [passLine(deps.now(), mode, stageSource)], { bom: true });
  return 'ran';
}

// Spec on the console, TAP (with duration_ms per test) into `tapFile`.
function tapReporters(tapFile) {
  return ['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=tap', '--test-reporter-destination=' + tapFile];
}

function runLaneTests(deps, lane, env, tapFile = null) {
  const dir = path.join(lane, 'tests');
  const result = deps.spawnSync(deps.execPath, ['--test', ...(tapFile ? tapReporters(tapFile) : []), ...testFiles(deps.fs, dir)], { env, stdio: 'inherit' });
  if (checkSpawn(result, 'node --test') !== 0) throw new Error(`Staged VM tests failed: ${dir}`);
}

// Runs the Source 2 compiler on stageSource (lib/toolchain.js runSource2Compiler): logs in the stage, the
// "0 failed" summary and every required output required, Press-any-key / ReadKey exits handled there.
function runCompiler(deps, paths, { stage, stageSource, compiled, assets }) {
  return runSource2Compiler(deps, { compiler: paths.compiler, sourceDir: stageSource, logDir: stage, outputDir: compiled, assets });
}

// Invoke-HpV3CompileAndPack: compile, exact compiled set, pack, exact packed set.
// `mark(step)` (optional) starts the compile, pack and verify steps of the build's timing.json.
async function compileAndPack(deps, paths, { stage, stageSource, compiled, vpk, assets, forbidden, vpkTool, viewer, label, mark = () => {} }) {
  mark('compile');
  await runCompiler(deps, paths, { stage, stageSource, compiled, assets });
  const actual = listFilesRelative(deps.fs, compiled);
  if (!sameSet(assets, actual)) throw new Error(`Compiled asset set differs from exact ${label} contract: ${actual.join(', ')}`);
  mark('pack');
  vpkPack(deps, vpkTool, compiled, vpk);
  mark('verify');
  const listing = packedVpkTree(deps, vpkTool, vpk, viewer).map(l => l.trim()).filter(Boolean);
  setContent(deps.fs, path.join(stage, 'vpk-listing.full.txt'), listing);
  const tree = stripListing(listing);
  assertPackedAssets(tree, assets, forbidden, label);
  if (!sameSet(assets, tree)) throw new Error(`VPK asset set differs from exact ${label} contract: ${tree.join(', ')}`);
  setContent(deps.fs, path.join(stage, 'vpk-listing.txt'), tree);
  deps.log(`VPK exact asset set (${tree.length}):`);
  for (const line of tree) deps.log(line);
}

// ---- lane builds -----------------------------------------------------------------------------

function stageScripts(deps, paths, scriptsDir, debug, error) {
  if (runNode(deps, paths.tools.stageScripts, [scriptsDir, debug ? '--debug' : '--minify']).status !== 0) throw new Error(error);
}

function viewerDecompile(deps, viewer, input, output, error) {
  const result = deps.spawnSync(viewer, ['-i', input, '-o', output, '-d'], { stdio: ['inherit', 'ignore', 'inherit'], windowsHide: true });
  const status = checkSpawn(result, 'Source2Viewer');
  if (status !== 0) throw new Error(`${error} ${status}`);
}

// Step timer for <stage>/timing.json: mark(name) ends the running step and starts the next.
function createStepTimer(now) {
  const startedAt = now(), steps = [];
  let current = null;
  const mark = (name, note = null) => {
    const t = now();
    if (current) current.ms = t - current.startMs;
    current = name ? { name, startMs: t, ms: null, note } : null;
    if (current) steps.push(current);
  };
  mark.note = text => { if (current) current.note = text; };
  return { startedAt, steps, mark };
}

// <stage>/timing.json: beside the pak, outside the compiled tree, so the packed VPK is unchanged.
function writeTiming(fsx, file, { project, mode, timer, now, status, error = null, suite = null }) {
  timer.mark(null);
  const steps = timer.steps.map(step => ({ name: step.name, start: isoLocal(step.startMs), offsetMs: step.startMs - timer.startedAt, ms: step.ms, ...(step.note ? { note: step.note } : {}) }));
  const data = { version: 1, project, mode, status, ...(error ? { error } : {}), startedAt: isoLocal(timer.startedAt), totalMs: now() - timer.startedAt, suite, steps };
  fsx.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ---- lane hooks -------------------------------------------------------------------------------
// Everything a lane does beyond the canonical v3 build, in the order buildProjectSteps calls it (lane names, folders,
// composers, assets and forbidden lists come from LANES/projectConfig). v3 is the canonical build, so it has no hooks.

// The test-run environment variables a lane build sets for the suites (tests/qollock-runtime.js and
// hp_colors_rewrite_v3_showrank/tests/showrank.test.js read the same names).
const LANE_ENV = Object.freeze({
  qollock: Object.freeze({ sourceRoot: 'HPV3_QOLLOCK_SOURCE_ROOT', pinnedRoot: 'HPV3_QOLLOCK_ROOT', required: 'HPV3_QOLLOCK_REQUIRED' }),
  showrank: Object.freeze({ sourceRoot: 'HPV3_SHOWRANK_SOURCE_ROOT' })
});

const V3_SCRIPTS_ERROR = 'V3 staged-script transform failed; see recursive logging/debug-marker error above.';
const v3ScriptDirs = s => [[path.join(s.stageSource, 'panorama', 'scripts'), V3_SCRIPTS_ERROR]];

const LANE_HOOKS = Object.freeze({
  v3: Object.freeze({
    checkUpstream: true,
    scriptDirs: v3ScriptDirs,
    env: () => ({})
  }),
  qollock: Object.freeze({
    // The pinned pak03 (and the release zip when present) must match vendor/pin.json, and a fresh
    // decompile must still match the vendored layouts and the reviewed QOLLOCK entries.
    verifyPin({ deps, config, root, viewer, s }) {
      const inputs = runNode(deps, config.composer, ['--verify-inputs', root], { capture: true });
      if (inputs.status !== 0) throw new Error('QOLLOCK pin check failed; see the pak03/zip hash details above.');
      for (const line of inputs.lines.slice(0, -1)) deps.log(line);
      viewerDecompile(deps, viewer, inputs.lines[inputs.lines.length - 1], s.pinned, 'Pinned QOLLOCK pak03 decompilation failed with exit code');
      if (runNode(deps, config.composer, ['--verify', s.pinned]).status !== 0) throw new Error('Pinned QOLLOCK pak03 no longer matches the lane vendor files; re-review ticket 22b before re-pinning.');
    },
    // The lane's own staged scripts (the transformed window bridge) go through the same transform as v3's.
    scriptDirs: s => [s.stageSource, s.stageLane].map(dir => path.join(dir, 'panorama', 'scripts'))
      .map(scripts => [scripts, `Staged-script transform failed for ${scripts}; see recursive logging/debug-marker error above.`]),
    env: s => ({ [LANE_ENV.qollock.sourceRoot]: s.stageLane, [LANE_ENV.qollock.pinnedRoot]: s.pinned, [LANE_ENV.qollock.required]: '1' }),
    checkPacked({ deps, config, viewer, s }) {
      viewerDecompile(deps, viewer, s.vpk, s.packedCheck, 'Packed QOLLOCK pak02 decompilation failed with exit code');
      if (runNode(deps, config.composer, ['--check-packed', s.packedCheck]).status !== 0) throw new Error('Packed QOLLOCK layouts lost composed includes, ids or structure.');
    }
  }),
  showrank: Object.freeze({
    // The ShowRank dependency must carry the runtime these layouts call: the installed pak89 or the repo build.
    verifyDependency({ deps, config, install, vpkTool, viewer, paths }) {
      const { addons, candidates } = showrankCandidates(deps, install.steamInf, paths.showrankRepoVpk);
      const carrier = findShowrankCarrier(candidates, config.showrankScript, candidate => packedVpkTree(deps, vpkTool, candidate, viewer),
        candidate => deps.warn(`ShowRank dependency ${candidate} does not contain ${config.showrankScript}`));
      if (!carrier) throw new Error(`ShowRank dependency missing: neither installed pak89_dir.vpk (${addons}) nor showrank_barebones_dir.vpk contains ${config.showrankScript}. Build/install ShowRank barebones first.`);
      deps.log(`ShowRank dependency verified: ${carrier}`);
    },
    // Only the canonical v3 scripts are transformed: ShowRank's own staged scripts are copied as they are.
    scriptDirs: v3ScriptDirs,
    env: s => ({ [LANE_ENV.showrank.sourceRoot]: s.stageLane })
  })
});

async function buildProject(name, opts, deps = defaultDeps(), root = REPO) {
  const config = projectConfig(name, root);
  if (!opts.skipDeploy) throw new Error(config.skipDeployError);
  const now = deps.now || Date.now;
  const timer = createStepTimer(now);
  const mode = modeOf(opts.debug);
  const state = { staged: false, suite: null };
  try {
    const vpk = await buildProjectSteps(name, opts, deps, root, config, timer.mark, state);
    writeTiming(deps.fs, path.join(stagePaths(config, mode).stage, 'timing.json'), { project: name, mode, timer, now, status: 'ok', suite: state.suite });
    return vpk;
  } catch (error) {
    // A build that failed before staging left the previous stage untouched: no timing file there.
    if (state.staged) {
      try { writeTiming(deps.fs, path.join(stagePaths(config, mode).stage, 'timing.json'), { project: name, mode, timer, now, status: 'failed', error: error.message.split('\n')[0], suite: state.suite }); } catch { /* keep the build error */ }
    }
    throw error;
  }
}

async function buildProjectSteps(name, opts, deps, root, config, mark, state) {
  const fsx = deps.fs;
  const paths = repoPaths(root);
  mark('preflight');
  // Local installed-version guard is offline and runs before tool resolution or stage cleanup.
  const install = findInstall(deps, opts.installedSteamInf);
  if (install.steamInf) {
    deps.log(`Deadlock install: ${install.steamInf} (${install.source})`);
    const pinArgs = ['--check-installed', install.steamInf];
    if (opts.allowPinMismatch) pinArgs.push('--allow-pin-mismatch');
    if (runNode(deps, paths.tools.gameData, pinArgs).status !== 0) throw new Error(`V3 installed-version check failed for ${install.steamInf}; see the ClientVersion mismatch/metadata details above.`);
  } else {
    deps.log(`Deadlock install not found (checked ${install.tried.length} path(s)); installed-version check skipped, the offline pin is used. Pass --installed-steam-inf or set HPV3_STEAM_INF.`);
  }
  const mode = modeOf(opts.debug);
  const s = stagePaths(config, mode);
  const hooks = LANE_HOOKS[name];
  const vpkTool = findTool(paths.vpkToolCandidates, 'vpkeditcli.exe', fsx);
  const viewer = findTool(paths.viewerCandidates, 'Source2Viewer-CLI.exe', fsx);

  // Network is opt-in: resolve upstream HEAD once and fail before staging if any pin has drifted.
  if (hooks.checkUpstream && opts.checkUpstream) {
    if (runNode(deps, paths.tools.gameData, ['--check-upstream']).status !== 0) throw new Error('Upstream v3 game data changed or could not be checked; review the drift report and rebase explicitly.');
  }
  // Both lanes must be current: v3's generated outputs, then the lane's composed layouts.
  mark('generators');
  for (const gen of config.generators) if (runNode(deps, gen.script, gen.args).status !== 0) throw new Error(gen.error);

  if (hooks.verifyDependency) hooks.verifyDependency({ deps, config, install, vpkTool, viewer, paths });

  // Clean only this mode before compilation: stale outputs cannot count as success.
  mark('staging');
  removeTreeUnderRoot(fsx, s.stage, config.buildRoot, mode, deps.platform);
  fsx.mkdirSync(s.stageSource, { recursive: true });
  state.staged = true;
  if (s.stageLane) fsx.mkdirSync(s.stageLane, { recursive: true });

  if (hooks.verifyPin) hooks.verifyPin({ deps, config, root, viewer, s });

  fsx.cpSync(path.join(paths.v3, 'panorama'), path.join(s.stageSource, 'panorama'), { recursive: true });
  if (s.stageLane) fsx.cpSync(path.join(config.lane, 'panorama'), path.join(s.stageLane, 'panorama'), { recursive: true });
  for (const [scripts, error] of hooks.scriptDirs(s)) stageScripts(deps, paths, scripts, opts.debug, error);

  // The suites boot the exact transformed scripts that will be compiled (child env only; this
  // process's env is untouched).
  const env = { ...deps.env, HPV3_SOURCE_ROOT: s.stageSource, HPV3_DEBUG: opts.debug ? '1' : '0' };
  Object.assign(env, hooks.env(s));
  mark('suite');
  state.suite = runV3Suite(deps, paths, s.stageSource, mode, env) || null;
  if (state.suite) mark.note(state.suite === 'cached' ? 'cache hit: identical inputs passed before' : 'ran; per-test times in suite.tap');
  if (config.lane) {
    mark('lane suite');
    runLaneTests(deps, config.lane, env, path.join(s.stage, 'lane-suite.tap'));
  }

  // Compile input: the staged v3 tree with the lane's layouts laid over it.
  if (s.stageLane) fsx.cpSync(path.join(s.stageLane, 'panorama'), path.join(s.stageSource, 'panorama'), { recursive: true, force: true });
  await compileAndPack(deps, paths, { ...s, assets: config.assets, forbidden: config.forbidden, vpkTool, viewer, label: config.label, mark });

  if (hooks.checkPacked) hooks.checkPacked({ deps, config, viewer, s });
  deps.log(config.complete(mode, s.vpk));
  deps.log(config.deployMessage);
  return s.vpk;
}

async function main(argv = process.argv.slice(2), deps = defaultDeps()) {
  const opts = parseArgs(argv);
  if (opts.help) { deps.log(USAGE); return 0; }
  for (const name of opts.projects) await buildProject(name, opts, deps);
  return 0;
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, err => { console.error(err.message); process.exitCode = 1; });
}

module.exports = {
  parseArgs, assertPathUnderRoot, removeTreeUnderRoot, runV3Suite, runCompiler, compileAndPack, buildProject, main, testFiles,
  tapReporters, createStepTimer, LANE_ENV, LANE_HOOKS, USAGE
};
