#!/usr/bin/env node
'use strict';
// Fast edit loop for the HP Colors v3 lanes (v3, QOLLOCK, ShowRank). Never deploys.
//
//   node hp_colors_rewrite_v3/tools/dev.js [--project v3|qollock|showrank|all]   watch and run a cycle per change
//   --once              one cycle for the current git changes (diff HEAD + untracked), then exit 0/1 (pre-build check)
//   --files a.js,b.css  that cycle for these files instead of git (implies --once)
//   --build             after a green cycle, a debug build per project: tools/build.js --skip-deploy --debug
//   --no-write          never run the generator or composers in write mode; stale outputs fail the cycle
//   --no-tests          skip the mapped tests
//   --debounce <ms>     quiet time before a watch cycle starts (default 300)
//
// A cycle: (1) generator inputs changed -> tools/generate.js (only when --check reports stale outputs), then
// the variant composers (qollock.js, showrank.js) the same way; (2) cheap checks: generate.js --check, the
// composers' --check, the stylesheet selector contract (lib/stylesheets.js), a parse of every changed .js
// (what node --check does) and the HPV3_DEBUG marker/release-logging transform (tools/stage-scripts.js on a
// temp copy, debug and release); (3) the tests tools/test.js maps the changed files to (plus the outputs the
// generator rewrote). One result line per cycle with the elapsed time, failures below it in short form.
// Watching uses fs.watch (recursive) on the lane sources; generated outputs, .build/, .tmp/ and docs are
// ignored so the generator's own writes never start another cycle.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { REPO, expandProjects } = require('./lib/projects');
const quick = require('./test');

const USAGE = 'Usage: node hp_colors_rewrite_v3/tools/dev.js [--project v3|qollock|showrank|all] [--once] [--files a,b] [--build] [--no-write] [--no-tests] [--debounce <ms>]';
const V3 = 'hp_colors_rewrite_v3';
const QOL = 'hp_colors_rewrite_v3_qollock';
const SR = 'hp_colors_rewrite_v3_showrank';
const SR_SOURCE = 'showrank_barebones';
const TOOLS = {
  generate: V3 + '/tools/generate.js',
  stageScripts: V3 + '/tools/stage-scripts.js',
  build: V3 + '/tools/build.js',
  qollock: QOL + '/tools/qollock.js',
  showrank: SR + '/tools/showrank.js',
};
// tools/generate.js outputs (its `files` map; tests/dev-loop.test.js keeps this list equal to it).
const GENERATED = [
  'generated/defaults.json', 'generated/slots.json', 'generated/ids.json', 'generated/search-index.json', 'generated/heroes.json',
  'generated/menu-rows.xml', 'panorama/styles/unit_status_v2.css', 'panorama/layout/hud_escape_menu.xml',
  'panorama/layout/unit_status_overlay_v2.xml', 'panorama/layout/citadel_hud_top_bar.xml', 'panorama/layout/citadel_status_effect.xml',
  'panorama/scripts/hp_colors_v3_world_settings.js', 'panorama/scripts/hp_colors_v3_settings.js',
].map(file => V3 + '/' + file);
const COMPOSED = {
  qollock: [QOL + '/panorama/layout/hud_escape_menu.xml', QOL + '/panorama/layout/citadel_hud_top_bar.xml'],
  showrank: [SR + '/panorama/layout/hud_escape_menu.xml', SR + '/panorama/layout/citadel_hud_top_bar.xml'],
};
const VARIANTS = ['qollock', 'showrank'];

// ---------------------------------------------------------------------------------------------------
// Classifying changed files.
// ---------------------------------------------------------------------------------------------------
const posix = file => String(file).replace(/\\/g, '/').replace(/^\.\//, '');

// Generated or composed outputs and build/scratch trees: never a cycle trigger in watch mode.
function isOutput(rel) {
  rel = posix(rel);
  if (GENERATED.includes(rel) || rel.startsWith(V3 + '/generated/')) return true;
  if (/^hp_colors_rewrite_v3(?:_qollock|_showrank)?\/panorama\/layout\//.test(rel)) return true;
  return false;
}

function isWatchIgnored(rel) {
  rel = posix(rel);
  if (!rel || rel.startsWith('..')) return true;
  if (isOutput(rel)) return true;
  if (/(?:^|\/)(?:\.build|\.tmp|\.git|node_modules|docs|issues|tickets|research|prototypes|mocks|evidence)(?:\/|$)/.test(rel)) return true;
  if (/(?:~|\.swp|\.swx|\.tmp|\.bak|\.orig|\.crdownload|#)$/i.test(rel) || /(?:^|\/)(?:\.#|#)/.test(rel)) return true;
  if (/\.md$/i.test(rel)) return true;
  return !relevant(rel);
}

// Files a cycle cares about at all (the lanes, the ShowRank layouts ShowRank's composer reads, the shared
// test adapter scripts).
function relevant(rel) {
  return new RegExp('^(?:' + [V3, QOL, SR].join('|') + ')/').test(rel) || new RegExp('^' + SR_SOURCE + '/panorama/layout/').test(rel) || /^scripts\/hp-colors-[^/]+\.js$/.test(rel);
}

function isGeneratorInput(rel) {
  rel = posix(rel);
  if (!rel.startsWith(V3 + '/')) return false;
  const inner = rel.slice(V3.length + 1);
  return /^settings\/[^/]+\.json$/.test(inner) || inner === 'game-data-pin.json' || inner.startsWith('vendor/') ||
    /^tools\/(?:generate|menu-layout|game-data)\.js$/.test(inner) ||
    (/^tools\/lib\/[^/]+\.js$/.test(inner) && !/\/(?:projects|toolchain)\.js$/.test(inner));
}

function composerInput(rel) {
  rel = posix(rel);
  const out = [];
  if (rel.startsWith(QOL + '/vendor/') || rel === TOOLS.qollock) out.push('qollock');
  if (rel.startsWith(SR_SOURCE + '/panorama/layout/') || rel === TOOLS.showrank) out.push('showrank');
  return out;
}

const isTestFile = rel => /^hp_colors_rewrite_v3(?:_qollock|_showrank)?\/tests\//.test(posix(rel));
const isLaneScript = rel => /^hp_colors_rewrite_v3(?:_qollock)?\/panorama\/scripts\/[^/]+\.js$/.test(posix(rel));
const isV3Style = rel => /^hp_colors_rewrite_v3\/panorama\/styles\/[^/]+\.css$/.test(posix(rel));
const isJs = rel => /\.(?:c?js)$/.test(posix(rel)) && !/\/tests\/fixtures\//.test(posix(rel));

// What one cycle does for these files and projects. `exists(rel)` drops deleted files from the checks.
function planCycle(files, projects, { exists = rel => fs.existsSync(path.join(REPO, rel)), write = true } = {}) {
  const all = [...new Set(files.map(posix))].filter(Boolean);
  const lane = all.filter(rel => relevant(rel) && !/\.md$/i.test(rel) && !/(?:^|\/)(?:\.build|\.tmp|docs|issues|tickets|research|prototypes|mocks)\//.test(rel));
  const present = lane.filter(exists);
  const variants = VARIANTS.filter(name => projects.includes(name));
  const generate = lane.some(isGeneratorInput);
  const compose = new Set(variants.filter(name => generate || lane.some(rel => composerInput(rel).includes(name))));
  const sourceChange = lane.some(rel => !isTestFile(rel));
  return {
    files: all,
    lane,
    generate: generate && write,
    compose: write ? [...compose] : [],
    contracts: sourceChange ? ['generate', ...variants] : [],
    styles: lane.some(isV3Style),
    syntax: present.filter(rel => isJs(rel) && !isOutput(rel)),
    markers: present.filter(isLaneScript).filter(rel => !isOutput(rel)),
  };
}

// ---------------------------------------------------------------------------------------------------
// Steps. Each returns { name, ok, note, failures: [{ what, where, message }] }.
// ---------------------------------------------------------------------------------------------------
function firstLine(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.find(line => /error|stale|fail|invalid|must|unknown|cannot|refus/i.test(line)) || lines[lines.length - 1] || '';
}

function hashFiles(files, root = REPO) {
  const out = {};
  for (const rel of files) {
    try { out[rel] = crypto.createHash('sha1').update(fs.readFileSync(path.join(root, rel))).digest('hex'); } catch { out[rel] = null; }
  }
  return out;
}
const changedBetween = (before, after) => Object.keys(after).filter(rel => before[rel] !== after[rel]);

async function generatorStep(plan, deps) {
  const check = await deps.runNode(TOOLS.generate, ['--check']);
  if (check.code === 0) return { name: 'generate', ok: true, note: 'current', changed: [] };
  const output = check.stderr + '\n' + check.stdout;
  if (plan.generate && /Stale generated files/.test(output)) {
    const before = deps.hash(GENERATED);
    const write = await deps.runNode(TOOLS.generate, []);
    if (write.code !== 0) return { name: 'generate', ok: false, failures: [{ what: 'generate', message: firstLine(write.stderr || write.stdout) }], changed: [] };
    const changed = changedBetween(before, deps.hash(GENERATED));
    return { name: 'generate', ok: true, note: 'regenerated ' + changed.length, changed };
  }
  return { name: 'generate', ok: false, failures: [{ what: 'generate --check', message: firstLine(output) + (/Stale generated/.test(output) && !plan.generate ? ' (no generator input changed; run tools/generate.js after review)' : '') }], changed: [] };
}

async function composerStep(name, plan, deps, generatorChanged) {
  const script = TOOLS[name];
  const check = await deps.runNode(script, ['--check']);
  if (check.code === 0) return { name, ok: true, note: 'current', changed: [] };
  const output = check.stderr + '\n' + check.stdout;
  const mayWrite = plan.compose.includes(name) || generatorChanged;
  if (mayWrite && /^Stale (?:QOLLOCK|ShowRank) layouts/m.test(output)) {
    const before = deps.hash(COMPOSED[name]);
    const write = await deps.runNode(script, []);
    if (write.code !== 0) return { name, ok: false, failures: [{ what: name + '.js', message: firstLine(write.stderr || write.stdout) }], changed: [] };
    const changed = changedBetween(before, deps.hash(COMPOSED[name]));
    return { name, ok: true, note: 'recomposed ' + changed.length, changed };
  }
  return { name, ok: false, failures: [{ what: name + '.js --check', message: firstLine(output) }], changed: [] };
}

function stylesheetStep(root = REPO) {
  const { checkStylesheets } = require('./lib/stylesheets');
  try {
    const css = checkStylesheets(path.join(root, V3, 'panorama', 'styles'));
    return { name: 'css', ok: true, note: css.rules + ' rules' };
  } catch (error) {
    const match = /^(.*?):(\d+): (.*)$/.exec(error.message);
    return { name: 'css', ok: false, failures: [{ what: 'css contract', where: match ? posix(path.relative(root, match[1])) + ':' + match[2] : null, message: match ? match[3] : error.message }] };
  }
}

// What node --check does, in-process: panorama scripts parse as scripts, tools/tests as CommonJS bodies.
function syntaxError(rel, text) {
  const source = text.replace(/^#!.*/, '');
  try {
    if (isLaneScript(rel)) new vm.Script(source, { filename: rel });
    else vm.compileFunction(source, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: rel });
    return null;
  } catch (error) {
    if (!(error instanceof SyntaxError) && error.name !== 'SyntaxError') return null;
    const site = /^(.*?):(\d+)\r?\n/.exec(String(error.stack || ''));
    return { what: 'syntax', where: rel + (site ? ':' + site[2] : ''), message: 'SyntaxError: ' + error.message };
  }
}

function syntaxStep(files, root = REPO) {
  const failures = [];
  for (const rel of files) {
    let text;
    try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    const failure = syntaxError(rel, text);
    if (failure) failures.push(failure);
  }
  return { name: 'syntax', ok: !failures.length, note: files.length + ' file' + (files.length === 1 ? '' : 's'), failures };
}

// tools/stage-scripts.js itself, debug and release (no --minify: Closure stays a build step), on temp copies.
async function markerStep(files, deps, root = REPO) {
  const failures = [];
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-dev-'));
  try {
    const names = new Map();
    for (const mode of ['debug', 'release']) {
      const dir = path.join(temp, mode);
      fs.mkdirSync(dir, { recursive: true });
      for (const rel of files) {
        const base = path.basename(rel);
        names.set(base, rel);
        fs.copyFileSync(path.join(root, rel), path.join(dir, base));
      }
      const result = await deps.runNode(TOOLS.stageScripts, mode === 'debug' ? [dir, '--debug'] : [dir]);
      if (result.code !== 0) {
        const message = firstLine(result.stderr || result.stdout);
        const site = /([\w.-]+\.js):(\d+)/.exec(message) || /in ([\w.-]+\.js)\b/.exec(message);
        const rel = site ? names.get(site[1]) : null;
        failures.push({ what: 'markers (' + mode + ')', where: rel ? rel + (site[2] ? ':' + site[2] : '') : null, message: message.replace(/^Debug marker must contain a complete single-line statement: \S+ /, 'debug marker not a complete statement ') });
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return { name: 'markers', ok: !failures.length, note: files.length + ' script' + (files.length === 1 ? '' : 's'), failures };
}

async function testStep(files, projects, deps) {
  const ctx = quick.scanTests();
  const selection = quick.selectTests(files, ctx, projects);
  const tests = selection.tests;
  const full = selection.mapped.some(entry => entry.full);
  if (!tests.length) return { name: 'tests', ok: true, note: 'none mapped', count: 0 };
  const run = await deps.runTests(tests);
  const tap = quick.parseTap(run.stdout + '\n' + run.stderr);
  const totals = tap.totals;
  const pass = totals.pass || 0, fail = totals.fail || 0;
  const failures = tap.failures.slice(0, 8).map(failure => ({
    what: 'test', where: failure.site, message: clip(failure.name, 70) + ': ' + clip(String(failure.message || failure.failureType || 'failed').split('\n').map(line => line.trim()).filter(Boolean)[0] || 'failed', 110),
  }));
  if (tap.failures.length > failures.length) failures.push({ what: 'test', message: '… ' + (tap.failures.length - failures.length) + ' more failing tests (node hp_colors_rewrite_v3/tools/test.js --files … for all)' });
  if (run.code !== 0 && !failures.length) failures.push({ what: 'test', message: 'node --test exited ' + run.code + ' without a reported failure; rerun tools/test.js for the raw output' });
  const note = tests.length + ' file' + (tests.length === 1 ? '' : 's') + (full ? ' (full suites)' : '') + ': ' + pass + ' pass' + (fail ? ' ' + fail + ' fail' : '') + (totals.skipped ? ' ' + totals.skipped + ' skip' : '') + ', ' + run.seconds.toFixed(1) + ' s';
  return { name: 'tests', ok: run.code === 0, note, failures, count: tests.length };
}

async function buildStep(projects, deps) {
  const results = [];
  const logDir = path.join(REPO, V3, '.tmp');
  for (const project of projects) {
    const started = deps.now();
    const run = await deps.runNode(TOOLS.build, ['--project', project, '--skip-deploy', '--debug']);
    const seconds = (deps.now() - started) / 1000;
    const log = path.join(logDir, 'dev-build-' + project + '.log');
    try { fs.mkdirSync(logDir, { recursive: true }); fs.writeFileSync(log, run.stdout + '\n' + run.stderr, 'utf8'); } catch { /* best effort */ }
    const complete = /build complete: (.+)$/m.exec(run.stdout);
    results.push({
      name: 'build ' + project, ok: run.code === 0, note: (run.code === 0 ? 'debug ok ' : 'FAILED ') + seconds.toFixed(0) + ' s' + (complete ? ' -> ' + posix(path.relative(REPO, complete[1].trim())) : ''),
      failures: run.code === 0 ? [] : [{ what: 'build ' + project, where: posix(path.relative(REPO, log)), message: firstLine(run.stderr || run.stdout) }],
    });
  }
  return results;
}

// ---------------------------------------------------------------------------------------------------
// One cycle.
// ---------------------------------------------------------------------------------------------------
const clip = (text, max) => { const one = String(text).replace(/\s+/g, ' ').trim(); return one.length > max ? one.slice(0, max - 1) + '…' : one; };

async function runCycle(files, opts, deps) {
  const started = deps.now();
  const plan = planCycle(files, opts.projects, { exists: deps.exists, write: opts.write !== false });
  const steps = [];
  let extra = [];
  if (plan.contracts.length || plan.generate || plan.compose.length) {
    const gen = await generatorStep(plan, deps);
    const skipped = VARIANTS.filter(item => !opts.projects.includes(item));
    if ((gen.changed || []).length && skipped.length) gen.note += ' (' + skipped.join('/') + ' not recomposed: not selected)';
    steps.push(gen);
    extra = extra.concat(gen.changed || []);
    for (const name of VARIANTS.filter(item => opts.projects.includes(item))) {
      const step = await composerStep(name, plan, deps, (gen.changed || []).length > 0);
      steps.push(step);
      extra = extra.concat(step.changed || []);
    }
  }
  if (plan.styles) steps.push(deps.stylesheets());
  let syntaxFailed = false;
  if (plan.syntax.length) {
    const step = deps.syntax(plan.syntax);
    syntaxFailed = !step.ok;
    steps.push(step);
  }
  if (plan.markers.length && !syntaxFailed) steps.push(await markerStep(plan.markers, deps));
  if (opts.tests !== false) {
    if (syntaxFailed) steps.push({ name: 'tests', ok: true, note: 'skipped (syntax error)', skipped: true });
    else steps.push(await testStep([...plan.files, ...extra], opts.projects, deps));
  }
  const green = steps.every(step => step.ok);
  if (green && opts.build && plan.lane.length) steps.push(...await buildStep(opts.projects, deps));
  return { plan, steps, ok: steps.every(step => step.ok), seconds: (deps.now() - started) / 1000 };
}

function describeFiles(files) {
  const names = files.map(rel => rel.split('/').pop());
  return names.length <= 2 ? names.join(', ') : names.slice(0, 2).join(', ') + ' +' + (names.length - 2);
}

// One result line, then the failures in short form (deduplicated: generate --check repeats the CSS contract).
function formatCycle(result, { index = 1, clock = new Date() } = {}) {
  const time = clock.toTimeString().slice(0, 8);
  const head = '[' + time + '] #' + index + ' ' + (result.ok ? 'PASS' : 'FAIL') + ' ' + result.seconds.toFixed(1) + ' s';
  const changed = 'changed ' + result.plan.lane.length + (result.plan.lane.length ? ' (' + describeFiles(result.plan.lane) + ')' : '') +
    (result.plan.files.length > result.plan.lane.length ? ' +' + (result.plan.files.length - result.plan.lane.length) + ' ignored (docs or outside the lanes)' : '');
  const parts = [head, changed];
  for (const step of result.steps) parts.push(step.name + ' ' + (step.ok ? (step.note || 'ok') : 'FAIL' + (step.note ? ' ' + step.note : '')));
  if (!result.steps.length) parts.push('nothing to check');
  const lines = [parts.join(' | ')];
  const seen = new Set();
  for (const step of result.steps) {
    for (const failure of step.failures || []) {
      const key = failure.message;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push('  x ' + failure.what + (failure.where ? ' ' + failure.where : '') + '  ' + clip(failure.message, 200));
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------------
// Process plumbing and the watcher.
// ---------------------------------------------------------------------------------------------------
function runProcess(args, { cwd = REPO, env = process.env } = {}) {
  return new Promise(resolve => {
    const childEnv = { ...env };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = childProcess.spawn(process.execPath, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolve({ code: 1, stdout, stderr: stderr + error.message }));
    child.on('close', code => resolve({ code: code == null ? 1 : code, stdout, stderr }));
  });
}

function defaultDeps() {
  return {
    now: () => Date.now(),
    log: line => console.log(line),
    exists: rel => fs.existsSync(path.join(REPO, rel)),
    hash: files => hashFiles(files),
    runNode: (script, args) => runProcess([path.join(REPO, script), ...args]),
    runTests: tests => quick.runNodeTest(tests, { progress: false }),
    stylesheets: () => stylesheetStep(),
    syntax: files => syntaxStep(files),
    gitChanged: () => quick.gitChanged(),
  };
}

// Calls `fire(files)` once `ms` pass without another add(); adds during a running cycle queue the next one.
function createDebouncer(ms, fire, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let pending = new Set(), timer = null, running = false, again = false;
  const start = async () => {
    timer = null;
    if (running) { again = true; return; }
    if (!pending.size) return;
    const batch = [...pending].sort();
    pending = new Set();
    running = true;
    try { await fire(batch); } finally {
      running = false;
      if (again || pending.size) { again = false; if (pending.size) timer = setTimer(start, ms); }
    }
  };
  return {
    add(rel) { pending.add(rel); if (timer) clearTimer(timer); timer = setTimer(start, ms); },
    get pending() { return [...pending]; },
    get running() { return running; },
  };
}

function watchRoots(projects) {
  const roots = [{ dir: V3, recursive: true }];
  if (projects.includes('qollock')) roots.push({ dir: QOL, recursive: true });
  if (projects.includes('showrank')) roots.push({ dir: SR, recursive: true }, { dir: SR_SOURCE + '/panorama/layout', recursive: true });
  roots.push({ dir: 'scripts', recursive: false });
  return roots.filter(root => fs.existsSync(path.join(REPO, root.dir)));
}

function watch(opts, deps) {
  let index = 0;
  const debouncer = createDebouncer(opts.debounce, async files => {
    index++;
    const result = await runCycle(files, opts, deps);
    deps.log(formatCycle(result, { index }));
  });
  const watchers = [];
  for (const root of watchRoots(opts.projects)) {
    const watcher = fs.watch(path.join(REPO, root.dir), { recursive: root.recursive }, (_event, filename) => {
      if (!filename) return;
      const rel = posix(path.join(root.dir, filename.toString()));
      if (isWatchIgnored(rel)) return;
      try { if (fs.statSync(path.join(REPO, rel)).isDirectory()) return; } catch { /* deleted: still a change */ }
      debouncer.add(rel);
    });
    watcher.on('error', error => deps.log('watch error on ' + root.dir + ': ' + error.message));
    watchers.push(watcher);
  }
  deps.log('dev: watching ' + watchRoots(opts.projects).map(root => root.dir).join(', ') + ' for ' + opts.projects.join('/') + (opts.build ? ' (debug build after green cycles, never deployed)' : '') + '; Ctrl+C stops');
  return { close: () => watchers.forEach(watcher => watcher.close()), debouncer };
}

function parseArgs(argv) {
  const opts = { project: 'all', projects: null, once: false, files: null, build: false, write: true, tests: true, debounce: 300, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i], eq = arg.indexOf('='), name = eq > 0 && arg.startsWith('--') ? arg.slice(0, eq) : arg;
    const value = () => {
      if (name !== arg) return arg.slice(eq + 1);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(name + ' needs a value. ' + USAGE);
      i++;
      return next;
    };
    if (name === '--project') opts.project = value().toLowerCase();
    else if (name === '--once') opts.once = true;
    else if (name === '--files') opts.files = [...(opts.files || []), ...value().split(',').map(file => file.trim()).filter(Boolean)];
    else if (name === '--build') opts.build = true;
    else if (name === '--no-write') opts.write = false;
    else if (name === '--no-tests') opts.tests = false;
    else if (name === '--debounce') {
      opts.debounce = Number(value());
      if (!Number.isFinite(opts.debounce) || opts.debounce < 0) throw new Error('--debounce needs milliseconds. ' + USAGE);
    } else if (name === '--help' || name === '-h') opts.help = true;
    else throw new Error('Unknown argument \'' + arg + '\'. ' + USAGE);
  }
  if (opts.files) opts.once = true;
  opts.projects = expandProjects(opts.project);
  return opts;
}

async function main(argv = process.argv.slice(2), deps = defaultDeps()) {
  let opts;
  try { opts = parseArgs(argv); } catch (error) { console.error('dev.js: ' + error.message); return 2; }
  if (opts.help) { deps.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 20).map(line => line.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
  if (opts.once) {
    let files;
    try { files = opts.files ? opts.files.map(file => quick.normalizeFile(file)) : deps.gitChanged(); } catch (error) { console.error('dev.js: git failed (' + error.message.split('\n')[0] + '); pass --files.'); return 2; }
    const result = await runCycle(files, opts, deps);
    deps.log(formatCycle(result, { index: 1 }));
    return result.ok ? 0 : 1;
  }
  const watcher = watch(opts, deps);
  return new Promise(resolve => process.once('SIGINT', () => { watcher.close(); resolve(0); }));
}

module.exports = {
  USAGE, GENERATED, COMPOSED, TOOLS, isOutput, isWatchIgnored, isGeneratorInput, composerInput, planCycle, syntaxError, syntaxStep,
  stylesheetStep, markerStep, generatorStep, composerStep, testStep, runCycle, formatCycle, createDebouncer, watchRoots, parseArgs, defaultDeps, runProcess, main,
};

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
