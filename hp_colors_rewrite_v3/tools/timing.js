#!/usr/bin/env node
'use strict';
// Where build and suite time goes, from what the builds already leave under each project's .build/.
//
//   node hp_colors_rewrite_v3/tools/timing.js [--project v3|qollock|showrank|all] [--mode debug|release|all]
//        [--top <n>] [--tap <file.tap>] [--json]
//
// tools/build.js writes <stage>/timing.json per build (preflight, generators, staging, suite or cache hit,
// lane suite, compile, pack, verify: start and duration each) and keeps the staged suites' per-test TAP in
// <stage>/suite.tap and lane-suite.tap; both are read first. Stages built before that (or by other means)
// are rebuilt from file times in .build/<mode>/: the stage tree's creation (stage start), the staged scripts'
// last write (copy + HPV3_DEBUG/Closure transform done), the suite-pass marker's timestamp
// (.build/suite-pass/<key>, written when the staged suite passes; absent or older = the suite was reused),
// compile.stdout.log's creation and last write (sr2compiler run; its own "0m:04s" summary is shown too),
// pak02_dir.vpk and vpk-listing.txt (pack + exact-asset listing) and QOLLOCK's pin/ and packed-check/ trees.
// Pre-stage checks (game-data --check-installed, generate/composer --check) leave no file and are not timed.
// Slowest test files: per-test duration_ms from a TAP file, the newest stage suite.tap when a build wrote one,
// else the newest full-suite TAP under .build/evidence (hand-collected, dated in the output), with test
// names mapped to their files by scanning the current test sources.
const fs = require('node:fs');
const path = require('node:path');
const { REPO, PROJECT_NAMES, projectConfig, expandProjects } = require('./lib/projects');
const { parseTap } = require('./test');

const USAGE = 'Usage: node hp_colors_rewrite_v3/tools/timing.js [--project v3|qollock|showrank|all] [--mode debug|release|all] [--top <n>] [--tap <file.tap>] [--json]';
const MODES = ['release', 'debug'];
const LANE_DIRS = { v3: 'hp_colors_rewrite_v3', qollock: 'hp_colors_rewrite_v3_qollock', showrank: 'hp_colors_rewrite_v3_showrank' };

function parseArgs(argv) {
  const opts = { project: 'all', mode: 'all', top: 10, tap: null, json: false, help: false };
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
    else if (name === '--mode') opts.mode = value().toLowerCase();
    else if (name === '--top') opts.top = Number(value());
    else if (name === '--tap') opts.tap = value();
    else if (name === '--json') opts.json = true;
    else if (name === '--help' || name === '-h') opts.help = true;
    else throw new Error('Unknown argument \'' + arg + '\'. ' + USAGE);
  }
  if (!['all', ...MODES].includes(opts.mode)) throw new Error('--mode must be debug, release or all. ' + USAGE);
  if (!Number.isInteger(opts.top) || opts.top < 1) throw new Error('--top needs a positive integer. ' + USAGE);
  opts.projects = expandProjects(opts.project);
  opts.modes = opts.mode === 'all' ? MODES : [opts.mode];
  return opts;
}

// ---------------------------------------------------------------------------------------------------
// File-time helpers.
// ---------------------------------------------------------------------------------------------------
function stat(fsx, file) { try { return fsx.statSync(file); } catch { return null; } }
const birth = s => s ? (s.birthtimeMs > 0 ? s.birthtimeMs : s.ctimeMs) : null;

function walkTimes(fsx, dir, { files = true } = {}) {
  let latest = null, earliest = null, count = 0;
  const visit = current => {
    let entries;
    try { entries = fsx.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { visit(full); continue; }
      if (!files) continue;
      const s = stat(fsx, full);
      if (!s) continue;
      count++;
      latest = latest == null ? s.mtimeMs : Math.max(latest, s.mtimeMs);
      earliest = earliest == null ? birth(s) : Math.min(earliest, birth(s));
    }
  };
  visit(dir);
  return { latest, earliest, count };
}

// Get-Date -Format o (7 fractional digits, offset) -> ms.
function parseIso(text) {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)?/.exec(String(text).trim());
  if (!match) return null;
  const ms = Date.parse(match[1] + '.' + (match[2] || '0').padEnd(3, '0').slice(0, 3) + (match[3] || ''));
  return Number.isFinite(ms) ? ms : null;
}

// .build/suite-pass/<key>: "<iso> <mode> <staged source path>".
function readSuitePasses(fsx, root = REPO) {
  const dir = path.join(root, LANE_DIRS.v3, '.build', 'suite-pass');
  let names = [];
  try { names = fsx.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const key of names) {
    let text;
    try { text = fsx.readFileSync(path.join(dir, key), 'utf8').replace(/^\ufeff/, '').trim(); } catch { continue; }
    const match = /^(\S+)\s+(debug|release)\s+(.+)$/.exec(text);
    if (!match) continue;
    const stage = match[3].replace(/\//g, '\\');
    const project = /hp_colors_rewrite_v3_qollock\\\.build/i.test(stage) ? 'qollock' : /hp_colors_rewrite_v3_showrank\\\.build/i.test(stage) ? 'showrank' : 'v3';
    out.push({ key, at: parseIso(match[1]), mode: match[2], stage: match[3], project });
  }
  return out.sort((a, b) => a.at - b.at);
}

function compilerSummary(text) {
  const lines = String(text).split(/\r?\n/).filter(line => /compiled, \d+ failed/.test(line));
  const line = lines[lines.length - 1];
  if (!line) return null;
  const m = /(\d+) compiled, (\d+) failed, (\d+) skipped, (\d+)m:(\d+)s/.exec(line);
  return m ? { compiled: Number(m[1]), failed: Number(m[2]), skipped: Number(m[3]), seconds: Number(m[4]) * 60 + Number(m[5]) } : { line: line.trim() };
}

// ---------------------------------------------------------------------------------------------------
// The latest build of one project and mode, as steps.
// ---------------------------------------------------------------------------------------------------
function stageTimeline(project, mode, passes, { fsx = fs, root = REPO } = {}) {
  const config = projectConfig(project, root);
  const stage = path.join(config.buildRoot, mode);
  const stageSource = path.join(stage, 'hp_colors_rewrite_v3');
  const sourceStat = stat(fsx, stageSource), stageStat = stat(fsx, stage);
  if (!stageStat) return { project, mode, stage, present: false };
  const recorded = readTimingJson(fsx, stage, root);
  if (recorded) return { project, mode, ...recorded, tap: findStageTap(fsx, stage) };
  const t = {};
  t.start = birth(sourceStat) || birth(stageStat);
  const pin = stat(fsx, path.join(stage, 'pin')) ? walkTimes(fsx, path.join(stage, 'pin')) : null;
  const scripts = [path.join(stageSource, 'panorama', 'scripts'), config.laneLeaf ? path.join(stage, config.laneLeaf, 'panorama', 'scripts') : null]
    .filter(Boolean).map(dir => walkTimes(fsx, dir)).filter(times => times.count);
  t.staged = scripts.length ? Math.max(...scripts.map(times => times.latest)) : null;
  const stdout = stat(fsx, path.join(stage, 'compile.stdout.log')), stderr = stat(fsx, path.join(stage, 'compile.stderr.log'));
  t.compileStart = birth(stdout);
  t.compileEnd = stdout ? Math.max(stdout.mtimeMs, stderr ? stderr.mtimeMs : 0) : null;
  const vpk = stat(fsx, path.join(stage, 'pak02_dir.vpk')), listing = stat(fsx, path.join(stage, 'vpk-listing.txt'));
  t.packed = vpk ? vpk.mtimeMs : null;
  t.listed = listing ? listing.mtimeMs : null;
  const packedCheck = stat(fsx, path.join(stage, 'packed-check')) ? walkTimes(fsx, path.join(stage, 'packed-check')) : null;

  // The pass marker written by this build: same mode and staged path (the repo may have moved, so compare
  // from the lane folder on), stamped between the transform and the compile start.
  const tail = p => p.replace(/\//g, '\\').toLowerCase().replace(/^.*?(hp_colors_rewrite_v3[^\\]*\\\.build\\)/, '$1');
  const lo = t.staged || t.start, hi = t.compileStart || t.packed || Infinity;
  const pass = passes.filter(item => item.mode === mode && tail(item.stage) === tail(stageSource) && item.at >= lo - 2000 && item.at <= hi + 2000).pop() || null;
  const reused = !pass && passes.some(item => item.mode === mode && tail(item.stage) === tail(stageSource) && item.at < lo);

  const steps = [];
  const add = (name, from, to, note) => { if (from != null && to != null && to >= from - 5) steps.push({ name, ms: Math.max(0, to - from), note: note || null }); };
  let cursor = t.start;
  if (pin && pin.count) { add('QOLLOCK pak03 pin check + decompile', cursor, pin.latest); cursor = pin.latest; }
  if (t.staged) { add('stage copy + script transform (' + (mode === 'release' ? 'Closure ADVANCED' : 'debug markers') + ')', cursor, t.staged); cursor = t.staged; }
  if (pass) {
    add('v3 staged suite (' + mode + ')', cursor, pass.at, 'suite-pass ' + pass.key.slice(0, 12));
    cursor = pass.at;
    if (t.compileStart) add(config.lane ? 'lane suite (' + project + ')' : 'to compile start', cursor, t.compileStart);
  } else if (t.compileStart) {
    add('suite cache key' + (reused ? ' (suite reused: identical inputs passed before)' : ' (no pass marker found)') + (config.lane ? ' + lane suite' : ''), cursor, t.compileStart);
  }
  if (t.compileStart) cursor = t.compileStart;
  let compiler = null;
  try { compiler = compilerSummary(fsx.readFileSync(path.join(stage, 'compile.stdout.log'), 'utf8')); } catch { /* no log */ }
  add('compile (sr2compiler)', t.compileStart, t.compileEnd, compiler && compiler.seconds != null ? 'compiler reports ' + compiler.seconds + ' s for ' + compiler.compiled + ' files' : null);
  if (t.compileEnd) cursor = t.compileEnd;
  add('pack + exact-asset listing', cursor, t.listed || t.packed);
  if (t.listed || t.packed) cursor = t.listed || t.packed;
  if (packedCheck && packedCheck.count) add('packed QOLLOCK decompile + check', cursor, packedCheck.latest);
  const end = Math.max(...[t.start, pin && pin.latest, t.staged, pass && pass.at, t.compileEnd, t.packed, t.listed, packedCheck && packedCheck.latest].filter(Number.isFinite));
  return {
    project, mode, stage: path.relative(root, stage).replace(/\\/g, '/'), present: true, source: 'file times', complete: !!(t.compileEnd && t.listed),
    startedAt: t.start, totalMs: end - t.start, steps, suite: pass ? 'ran' : reused ? 'reused' : 'unknown', compiler,
    tap: findStageTap(fsx, stage),
  };
}

// <stage>/suite.tap first (the v3 suite), then any other TAP there (lane-suite.tap).
function findStageTap(fsx, stage) {
  try {
    const names = fsx.readdirSync(stage).filter(name => name.endsWith('.tap')).sort((a, b) => (b === 'suite.tap') - (a === 'suite.tap'));
    return names.length ? path.join(stage, names[0]) : null;
  } catch { return null; }
}

// <stage>/timing.json, written by tools/build.js per build: { status, startedAt, totalMs, suite, steps: [{ name, start, offsetMs, ms, note }] }.
function readTimingJson(fsx, stage, root = REPO) {
  let data;
  try { data = JSON.parse(fsx.readFileSync(path.join(stage, 'timing.json'), 'utf8')); } catch { return null; }
  if (!data || !Array.isArray(data.steps)) return null;
  let compiler = null;
  try { compiler = compilerSummary(fsx.readFileSync(path.join(stage, 'compile.stdout.log'), 'utf8')); } catch { /* no log */ }
  const steps = data.steps.map(step => ({ name: step.name, ms: Number.isFinite(step.ms) ? step.ms : null, note: step.note || null }));
  const compile = steps.find(step => step.name === 'compile');
  if (compile && compiler && compiler.seconds != null) compile.note = [compile.note, 'compiler reports ' + compiler.seconds + ' s for ' + compiler.compiled + ' files'].filter(Boolean).join('; ');
  return {
    stage: path.relative(root, stage).replace(/\\/g, '/'), present: true, source: 'timing.json', status: data.status || null, error: data.error || null,
    complete: data.status === 'ok', startedAt: parseIso(data.startedAt), totalMs: data.totalMs, steps,
    suite: data.suite === 'cached' ? 'reused' : data.suite || 'unknown', compiler,
  };
}

// ---------------------------------------------------------------------------------------------------
// Slowest tests.
// ---------------------------------------------------------------------------------------------------
// test('name', ...) / it / describe / suite names in every lane's tests -> files.
function testNameIndex({ fsx = fs, root = REPO } = {}) {
  const index = new Map();
  for (const dir of Object.values(LANE_DIRS)) {
    let names = [];
    try { names = fsx.readdirSync(path.join(root, dir, 'tests')).filter(name => name.endsWith('.test.js')); } catch { continue; }
    for (const name of names) {
      const rel = dir + '/tests/' + name;
      const text = fsx.readFileSync(path.join(root, rel), 'utf8');
      for (const match of text.matchAll(/\b(?:test|it|describe|suite)(?:\.(?:only|skip|todo))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
        const title = match[2].replace(/\\(['"`\\])/g, '$1');
        if (!index.has(title)) index.set(title, new Set());
        index.get(title).add(rel);
      }
    }
  }
  return index;
}

// The TAP to read: --tap, else a stage's suite.tap (newest), else the newest TAP under .build/evidence with
// at least 100 top-level tests (a full-suite run).
function chooseTap(opts, timelines, { fsx = fs, root = REPO } = {}) {
  if (opts.tap) return { file: path.resolve(opts.tap), why: '--tap' };
  const staged = timelines.filter(item => item.tap).map(item => ({ file: item.tap, mtime: (stat(fsx, item.tap) || {}).mtimeMs || 0 })).sort((a, b) => b.mtime - a.mtime);
  if (staged.length) return { file: staged[0].file, why: 'written by the build' };
  const evidence = path.join(root, LANE_DIRS.v3, '.build', 'evidence');
  const candidates = [];
  const visit = dir => {
    let entries;
    try { entries = fsx.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(?:tap|log)$/.test(entry.name)) {
        const s = stat(fsx, full);
        if (s && s.size > 20000) candidates.push({ file: full, mtime: s.mtimeMs });
      }
    }
  };
  visit(evidence);
  candidates.sort((a, b) => b.mtime - a.mtime);
  for (const candidate of candidates) {
    const text = fsx.readFileSync(candidate.file, 'utf8');
    if (!/^TAP version/m.test(text)) continue;
    const top = (text.match(/^(?:not )?ok \d+ /gm) || []).length;
    if (top >= 100) return { file: candidate.file, why: 'newest full-suite TAP under .build/evidence (hand-collected, not written by the build)' };
  }
  return null;
}

function slowestTests(tapFile, { fsx = fs, root = REPO, top = 10 } = {}) {
  const text = fsx.readFileSync(tapFile, 'utf8');
  const tap = parseTap(text);
  const index = testNameIndex({ fsx, root });
  const files = new Map();
  const tests = [];
  let unmapped = 0, ambiguous = 0;
  for (const test of tap.tests.filter(item => item.depth === 0)) {
    const ms = Number(test.info.duration_ms);
    if (!Number.isFinite(ms)) continue;
    let file = null;
    const location = /^(.*?):\d+:\d+$/.exec(String(test.info.location || ''));
    if (location) file = path.relative(root, path.resolve(location[1])).replace(/\\/g, '/').replace(/^.*?(hp_colors_rewrite_v3[^/]*\/tests\/)/, '$1');
    else {
      const hits = index.get(test.name);
      if (hits && hits.size === 1) file = [...hits][0];
      else if (hits && hits.size > 1) { file = [...hits][0]; ambiguous++; }
    }
    if (!file) { unmapped++; file = '(test name not in current sources)'; }
    if (!files.has(file)) files.set(file, { file, ms: 0, tests: 0 });
    const entry = files.get(file);
    entry.ms += ms;
    entry.tests++;
    tests.push({ name: test.name, file, ms });
  }
  const s = stat(fsx, tapFile);
  return {
    file: path.relative(root, tapFile).replace(/\\/g, '/'), writtenAt: s ? s.mtimeMs : null,
    totals: tap.totals, topLevel: tests.length, unmapped, ambiguous,
    files: [...files.values()].sort((a, b) => b.ms - a.ms).slice(0, top),
    tests: tests.sort((a, b) => b.ms - a.ms).slice(0, Math.min(top, 8)),
  };
}

// ---------------------------------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------------------------------
function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '?';
  if (ms < 1000) return Math.round(ms) + ' ms';
  const seconds = ms / 1000;
  if (seconds < 60) return seconds.toFixed(1) + ' s';
  return Math.floor(seconds / 60) + 'm' + String(Math.round(seconds % 60)).padStart(2, '0') + 's';
}
const fmtDate = ms => { if (!ms) return '?'; const d = new Date(ms), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
const bar = (ms, total, width = 24) => '#'.repeat(Math.max(ms > 0 ? 1 : 0, Math.round(width * ms / Math.max(1, total))));

function formatReport(report) {
  const out = ['Build timing: <stage>/timing.json when build.js wrote one, else rebuilt from .build/ file times (pre-stage checks not timed there)'];
  for (const item of report.builds) {
    if (!item.present) { out.push('', item.project + ' ' + item.mode + ': no stage (' + item.stage + ')'); continue; }
    const state = item.source === 'timing.json' ? (item.status === 'ok' ? '' : '  (FAILED' + (item.error ? ': ' + item.error.slice(0, 100) : '') + ')') : item.complete ? '' : '  (incomplete or failed build)';
    out.push('', item.project + ' ' + item.mode + '  ' + fmtDate(item.startedAt) + '  total ' + fmtMs(item.totalMs) + state + '  [' + item.stage + ', ' + item.source + ']');
    const width = Math.max(...item.steps.map(step => step.name.length), 10);
    for (const step of item.steps) out.push('  ' + step.name.padEnd(width) + '  ' + fmtMs(step.ms).padStart(8) + '  ' + bar(step.ms, item.totalMs).padEnd(24) + (step.note ? '  ' + step.note : ''));
  }
  const passes = report.suitePasses;
  out.push('', 'suite-pass markers: ' + passes.count + (passes.count ? ' (' + Object.entries(passes.byProject).map(([key, n]) => key + ' ' + n).join(', ') + '); newest ' + fmtDate(passes.newest) + ', oldest ' + fmtDate(passes.oldest) : ''));
  if (passes.ranSuites.length) out.push('  staged suite durations seen: ' + passes.ranSuites.map(item => item.project + ' ' + item.mode + ' ' + fmtMs(item.ms)).join(', '));
  out.push('staged test output: ' + (report.stageTaps.length ? report.stageTaps.join(', ') : 'none (the build runs node --test with inherited stdio; per-test times are not kept)'));
  const slow = report.slowest;
  if (!slow) out.push('', 'slowest tests: no TAP with per-test durations found (--tap <file> reads one)');
  else {
    out.push('', 'slowest test files (' + slow.file + ', ' + fmtDate(slow.writtenAt) + ', ' + report.tapWhy + ')');
    out.push('  ' + slow.topLevel + ' top-level tests' + (slow.totals.duration_ms ? ', run took ' + fmtMs(slow.totals.duration_ms) : '') + '; per-file time is the sum of its top-level tests (files run in parallel)' +
      (slow.unmapped ? '; ' + slow.unmapped + ' test names no longer in the sources' : '') + (slow.ambiguous ? '; ' + slow.ambiguous + ' names in several files (first taken)' : ''));
    for (const item of slow.files) out.push('  ' + fmtMs(item.ms).padStart(8) + '  ' + bar(item.ms, slow.files[0].ms, 20).padEnd(20) + '  ' + item.file.replace(/^hp_colors_rewrite_v3\/tests\//, '') + ' (' + item.tests + ' test' + (item.tests === 1 ? '' : 's') + ')');
    out.push('  slowest tests:');
    for (const test of slow.tests) out.push('  ' + fmtMs(test.ms).padStart(8) + '  ' + (test.name.length > 90 ? test.name.slice(0, 89) + '…' : test.name) + '  [' + test.file.split('/').pop() + ']');
  }
  const fallback = report.builds.filter(item => item.present && item.source !== 'timing.json').map(item => item.project + ' ' + item.mode);
  if (fallback.length) out.push('', 'built before build.js recorded timing.json/suite.tap (file-time estimate): ' + fallback.join(', ') + '; the next build of each records its steps and per-test times.');
  return out.join('\n');
}

function collect(opts, { fsx = fs, root = REPO } = {}) {
  const passes = readSuitePasses(fsx, root);
  const builds = [];
  for (const project of opts.projects) for (const mode of opts.modes) builds.push(stageTimeline(project, mode, passes, { fsx, root }));
  const byProject = {};
  for (const item of passes) byProject[item.project + ' ' + item.mode] = (byProject[item.project + ' ' + item.mode] || 0) + 1;
  const ranSuites = builds.filter(item => item.present).flatMap(item => item.steps.filter(step => /staged suite/.test(step.name) || (step.name === 'suite' && item.suite === 'ran')).map(step => ({ project: item.project, mode: item.mode, ms: step.ms })));
  const choice = chooseTap(opts, builds, { fsx, root });
  let slowest = null;
  if (choice) { try { slowest = slowestTests(choice.file, { fsx, root, top: opts.top }); } catch { slowest = null; } }
  return {
    builds,
    suitePasses: { count: passes.length, byProject, newest: passes.length ? passes[passes.length - 1].at : null, oldest: passes.length ? passes[0].at : null, ranSuites },
    stageTaps: builds.filter(item => item.tap).map(item => path.relative(root, item.tap).replace(/\\/g, '/')),
    slowest, tapWhy: choice ? choice.why : null,
  };
}

function main(argv = process.argv.slice(2), log = line => console.log(line)) {
  let opts;
  try { opts = parseArgs(argv); } catch (error) { console.error('timing.js: ' + error.message); return 2; }
  if (opts.help) { log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 19).map(line => line.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
  const report = collect(opts);
  log(opts.json ? JSON.stringify(report, null, 2) : formatReport(report));
  return 0;
}

module.exports = { USAGE, PROJECT_NAMES, parseArgs, parseIso, readSuitePasses, compilerSummary, stageTimeline, testNameIndex, chooseTap, slowestTests, collect, formatReport, fmtMs };

if (require.main === module) process.exitCode = main();
