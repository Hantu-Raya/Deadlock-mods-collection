#!/usr/bin/env node
'use strict';
// Quick test runner for the three HP Colors v3 lanes (v3, QOLLOCK, ShowRank).
//
//   node hp_colors_rewrite_v3/tools/test.js                    changed files (git diff HEAD + untracked) -> tests
//   node hp_colors_rewrite_v3/tools/test.js --files a.js,b.css  explicit changed files instead of git
//   node hp_colors_rewrite_v3/tools/test.js --list              show the chosen test files without running them
//   node hp_colors_rewrite_v3/tools/test.js --all               full suites of --project (default all)
//   --project v3|qollock|showrank|all   restrict the selection to these lanes
//   --grep <pattern>                    forwarded to node --test as --test-name-pattern
//
// The changed-file -> test mapping is RULES below (maintained by hand; keep it in step with the suites)
// plus a scan of the test sources: a file a test require()s or names selects that test. A lane source
// file nothing covers falls back to the full suites. tests/quick-test.test.js checks that every test
// RULES names exists, so a renamed suite fails loudly instead of silently dropping out of the map.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '../..');
const PROJECTS = {
  v3: { key: 'v3', dir: 'hp_colors_rewrite_v3', label: 'v3' },
  qollock: { key: 'qollock', dir: 'hp_colors_rewrite_v3_qollock', label: 'QOLLOCK' },
  showrank: { key: 'showrank', dir: 'hp_colors_rewrite_v3_showrank', label: 'ShowRank' },
};
const V3 = PROJECTS.v3.dir;
const VARIANTS = ['qollock', 'showrank'];

// ---------------------------------------------------------------------------------------------------
// Maintained mapping. `tests` are v3 suite names (tests/<name>.test.js). `shared: true` marks v3 source
// the QOLLOCK and ShowRank lanes compose from, so their suites run too. `mentions: true` also adds every
// suite whose sources name the changed file. First matching rule wins; tests that require() the
// changed file are always added.
// ---------------------------------------------------------------------------------------------------
const FUZZ = [0, 1, 2, 3, 4, 5].map(n => 'import-fuzz-' + n);
const SCHEMA = ['codec', 'nav', 'news', 'migration', 'generator'];
const MENU = ['menu', 'menu-actions', 'menu-audit', 'nav', 'theme', 'news', 'row-requirements', 'row-requirements-effect',
  'hero-routing', 'ability-conditions', 'colorblind-view', 'own-hud', 'supporter-strip', 'update-notice', 'preview-chrome',
  'memory', 'gameui-regression', 'audit-performance'];
const TIMERS = ['timers', 'kill-bounty', 'hero-routing', 'audit-performance'];
const LOADS_CSS = 'css'; // computed: suites that read the stylesheets (see cssTests)
const at = rel => new RegExp('^' + V3 + '/' + rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const RULES = [
  { match: /^hp_colors_rewrite_v3(?:_qollock|_showrank)?\/(?:[^/]+\.md$|(?:docs|issues|tickets|research|prototypes|mocks|\.build|\.tmp)\/)/, tests: [], why: 'documentation/build output' },
  { match: at('panorama/scripts/hp_colors_v3_renderer.js'), tests: ['renderer', 'preview', 'status-effect-sizes', 'audit-performance'], shared: true },
  { match: at('panorama/scripts/hp_colors_v3_preview.js'), tests: ['preview', 'preview-chrome', 'status-effect-sizes', 'audit-performance'], shared: true },
  { match: at('panorama/scripts/hp_colors_v3_menu.js'), tests: MENU, shared: true },
  { match: at('panorama/scripts/hp_colors_v3_codec.js'), tests: ['codec', 'migration', 'audit-storage', 'storage', 'menu-audit', ...FUZZ], shared: true },
  { match: at('panorama/scripts/hp_colors_v3_from_v2.js'), tests: ['migration', 'codec', 'audit-storage', 'legacy-shield', 'own-hud', ...FUZZ], shared: true },
  { match: at('panorama/scripts/hp_colors_v3_storage.js'), tests: ['storage', 'audit-storage', 'migration', 'store-page', 'update-notice', 'profile-hygiene', 'gameui-regression', 'audit-performance'], shared: true },
  { match: at('panorama/scripts/hp_colors_v3_settings.js'), tests: [...SCHEMA, 'menu'], shared: true }, // generated from the schema
  { match: at('panorama/scripts/hp_colors_v3_world_settings.js'), tests: ['renderer', 'timers', 'kill-bounty', 'generator'], shared: true },
  { match: at('panorama/scripts/hp_colors_v3_world_boot.js'), tests: ['renderer', 'timers', 'kill-bounty', 'audit-performance'], shared: true },
  { match: /^hp_colors_rewrite_v3\/panorama\/scripts\/hp_colors_v3_timers_(?:hud|world)\.js$/, tests: [...TIMERS, 'audit-tooling'], shared: true },
  { match: at('panorama/scripts/hp_colors_v3_bridge.js'), tests: ['timers', 'kill-bounty', 'renderer', 'hero-routing'], shared: true },
  { match: at('panorama/layout/hud_escape_menu.xml'), tests: [...MENU, 'generator'], shared: true },
  { match: at('panorama/layout/unit_status_overlay_v2.xml'), tests: ['renderer', 'preview', 'timers', 'generator', 'game-data'], shared: true },
  { match: at('panorama/layout/citadel_hud_top_bar.xml'), tests: [...TIMERS, 'generator', 'game-data'], shared: true },
  { match: at('panorama/layout/citadel_status_effect.xml'), tests: ['status-effect-sizes', 'generator', 'game-data'], shared: true },
  { match: at('panorama/layout/hp_colors_v3_relay.xml'), tests: ['timers', 'renderer'], shared: true },
  { match: /^hp_colors_rewrite_v3\/panorama\/styles\/[^/]+\.css$/, tests: LOADS_CSS, shared: true },
  { match: /^hp_colors_rewrite_v3\/settings\/(?:schema|record|news)\.json$/, tests: SCHEMA, shared: true, mentions: true },
  { match: /^hp_colors_rewrite_v3\/generated\//, tests: ['generator', 'review-fixes'], shared: true, mentions: true },
  { match: /^hp_colors_rewrite_v3\/vendor\//, tests: ['generator', 'game-data', 'review-fixes'], shared: true, mentions: true },
  // The generator and menu builder plus their tools/lib/ modules.
  { match: /^hp_colors_rewrite_v3\/tools\/(?:generate|menu-layout|lib\/(?:schema|news|slot-contract|stock-layouts|settings-scripts|stylesheets|output|menu-[a-z]+))\.js$/, tests: ['generator', 'review-fixes', 'news', 'preview-chrome', 'menu', 'game-data'], shared: true },
  { match: /^hp_colors_rewrite_v3\/(?:tools\/game-data\.js|game-data-pin\.json)$/, tests: ['game-data', 'generator', 'review-fixes'], shared: true },
  { match: at('tools/stage-scripts.js'), tests: ['stage-scripts', 'logging', 'audit-tooling'] },
  { match: at('tools/suite-cache.js'), tests: ['audit-tooling'] },
  { match: at('tools/check-renderer-mutation.js'), tests: ['renderer'] },
  { match: at('tools/budgets.js'), tests: ['budgets'] },
  { match: at('tools/test.js'), tests: ['quick-test'] },
  // Each tool's own suite (suites that require() a tool are added on top, never the full suites).
  { match: at('tools/build.js'), tests: ['build-tool', 'audit-tooling', 'timing'] }, // audit-tooling drives buildProject; timing checks timing.json
  { match: at('tools/doctor.js'), tests: ['doctor'] },
  { match: at('tools/lib/toolchain.js'), tests: ['build-tool', 'doctor'] },
  { match: at('tools/dev.js'), tests: ['dev-loop'] },
  { match: at('tools/logscan.js'), tests: ['logscan'] },
  { match: at('tools/timing.js'), tests: ['timing'] },
  { match: at('tools/vpk-check.js'), tests: ['vpk-check'] },
  { match: at('tools/new-setting.js'), tests: ['new-setting'] },
  { match: at('tools/ticket.js'), tests: ['ticket'] },
  { match: at('tools/engine-facts.js'), tests: ['engine-facts'] },
  // Engine facts from the panorama.dll research; lib/stylesheets.js checks sheets against them in generate.js --check.
  { match: at('tools/lib/engine-facts.json'), tests: ['engine-facts', 'generator'] },
];

// ---------------------------------------------------------------------------------------------------
// Test-source scan: suites, helpers and their local require() graph.
// ---------------------------------------------------------------------------------------------------
const posix = p => p.split(path.sep).join('/').replace(/\\/g, '/');

function scanTests(repo = REPO) {
  const projects = {}, sources = new Map();
  for (const project of Object.values(PROJECTS)) {
    const dir = path.join(repo, project.dir, 'tests');
    let names = [];
    try { names = fs.readdirSync(dir).filter(name => name.endsWith('.js')).sort(); } catch { /* lane absent */ }
    const tests = names.filter(name => name.endsWith('.test.js')).map(name => project.dir + '/tests/' + name);
    for (const name of names) sources.set(project.dir + '/tests/' + name, fs.readFileSync(path.join(dir, name), 'utf8'));
    projects[project.key] = { ...project, tests, exists: fs.existsSync(path.join(repo, project.dir)) };
  }
  const deps = new Map();
  for (const [rel, text] of sources) deps.set(rel, localRequires(rel, text, candidate => sources.has(candidate) || fs.existsSync(path.join(repo, candidate))));
  return { repo, projects, sources, deps };
}

// Repo-relative files a source require()s: './x', '../tools/x' and path.join(<testsDir>, 'x').
function localRequires(rel, text, exists) {
  const out = new Set(), dir = path.posix.dirname(rel);
  for (const match of text.matchAll(/require\(([^;]*?)\)\s*[;,.)\n]/g)) {
    const literal = /['"]([^'"]+)['"]\s*\)?\s*$/.exec(match[1]);
    if (!literal || literal[1].startsWith('node:')) continue;
    const spec = literal[1];
    const bases = spec.startsWith('.') ? [path.posix.join(dir, spec)] : /path\.(?:join|resolve)/.test(match[1]) ? [path.posix.join(dir, spec), V3 + '/tests/' + spec] : [];
    for (const base of bases) {
      const hit = [base, base + '.js', base + '/index.js'].find(exists);
      if (hit) { out.add(hit); break; }
    }
  }
  return [...out];
}

function closure(ctx, rel) {
  const seen = new Set(), stack = [rel];
  while (stack.length) {
    const next = stack.pop();
    if (seen.has(next)) continue;
    seen.add(next);
    for (const dep of ctx.deps.get(next) || []) stack.push(dep);
  }
  return seen;
}
const allTests = ctx => Object.values(ctx.projects).flatMap(project => project.tests);
const dependents = (ctx, file) => allTests(ctx).filter(test => test !== file && closure(ctx, test).has(file));
const mentions = (ctx, needle) => allTests(ctx).filter(test => [...closure(ctx, test)].some(source => (ctx.sources.get(source) || '').includes(needle)));

// Suites that read the stylesheets: a direct .css reference or the style-cascade helper.
function cssTests(ctx) {
  const cascade = V3 + '/tests/style-cascade.js';
  return ctx.projects.v3.tests.filter(test => /\.css\b/.test(ctx.sources.get(test) || '') || closure(ctx, test).has(cascade));
}

function projectOf(file) {
  const top = file.split('/')[0];
  return Object.values(PROJECTS).find(project => project.dir === top) || null;
}

function v3Suite(name) { return V3 + '/tests/' + name + '.test.js'; }

// Missing suites RULES names (a rename or deletion that the map must follow).
function missingRuleTests(ctx) {
  const missing = new Set();
  for (const rule of RULES) if (Array.isArray(rule.tests)) for (const name of rule.tests) if (!ctx.projects.v3.tests.includes(v3Suite(name))) missing.add(name);
  return [...missing];
}

// One changed file -> {tests, why}. `full` marks the "unsure" fallback.
function mapFile(file, ctx) {
  file = posix(file);
  const variantTests = () => VARIANTS.flatMap(key => ctx.projects[key].tests);
  const base = path.posix.basename(file), stem = base.replace(/(.)\.[^.]+$/, '$1');
  const project = projectOf(file);
  const rule = RULES.find(entry => entry.match.test(file));
  if (rule) {
    const named = rule.tests === LOADS_CSS ? cssTests(ctx) : rule.tests.map(name => v3Suite(name)).filter(test => ctx.projects.v3.tests.includes(test));
    const tests = new Set([...named, ...dependents(ctx, file)]);
    if (rule.mentions) for (const test of mentions(ctx, base)) tests.add(test);
    if (rule.shared) for (const test of variantTests()) tests.add(test);
    const why = rule.why || (rule.tests === LOADS_CSS ? 'stylesheet: suites that load CSS' : 'mapped') + (rule.shared ? ' + variant lanes' : '');
    return { file, tests: [...tests], why };
  }
  const inTests = /^hp_colors_rewrite_v3(?:_qollock|_showrank)?\/tests\//.test(file);
  if (inTests && file.endsWith('.test.js')) return { file, tests: allTests(ctx).includes(file) ? [file] : [], why: allTests(ctx).includes(file) ? 'suite itself' : 'deleted suite' };
  if (inTests && /\/tests\/fixtures\//.test(file)) {
    const tests = mentions(ctx, stem);
    if (tests.length) return { file, tests, why: 'fixture: suites naming it' };
    return { file, tests: project.key === 'v3' ? allTests(ctx) : ctx.projects[project.key].tests, why: 'fixture: unsure, full suites', full: true };
  }
  if (inTests && file.endsWith('.js')) {
    const tests = dependents(ctx, file);
    return { file, tests, why: tests.length ? 'helper: suites that require it' : 'helper: unused' };
  }
  if (project && project.key !== 'v3') return { file, tests: ctx.projects[project.key].tests, why: project.label + ' lane' };
  if (project) {
    const inner = file.slice(V3.length + 1).replace(/(.)\.[^./]+$/, '$1'); // '.gitattributes' keeps its name
    const tests = new Set([...dependents(ctx, file), ...mentions(ctx, inner)]);
    if (tests.size) return { file, tests: [...tests], why: 'unmapped v3 file: suites naming it' };
    return { file, tests: allTests(ctx), why: 'unmapped v3 source: unsure, full suites', full: true };
  }
  if (/^scripts\/hp-colors-/.test(file)) {
    const tests = new Set([...dependents(ctx, file), ...mentions(ctx, stem)]);
    return { file, tests: [...tests], why: tests.size ? 'shared script: suites that use it' : 'shared script: no lane suite uses it' };
  }
  // Root files (build wrappers, .gitignore) by name; deeper files only by their full path, since names
  // like README.md or index.html recur everywhere.
  const tests = mentions(ctx, file.includes('/') ? file : base);
  return { file, tests, why: tests.length ? 'suites naming it' : 'outside the lanes' };
}

function orderTests(ctx, tests) {
  const order = allTests(ctx);
  return [...new Set(tests)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function selectTests(files, ctx, projects = Object.keys(PROJECTS)) {
  const mapped = files.map(file => mapFile(file, ctx));
  const keep = new Set(projects.flatMap(key => ctx.projects[key].tests));
  const tests = orderTests(ctx, mapped.flatMap(entry => entry.tests).filter(test => keep.has(test)));
  return { mapped, tests };
}

// ---------------------------------------------------------------------------------------------------
// TAP parsing (node --test --test-reporter=tap).
// ---------------------------------------------------------------------------------------------------
const tapUnescape = text => text.replace(/\\(\\|#|n|t|r)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' })[c] || c);

function yamlScalar(raw) {
  const value = raw.trim();
  if (value === '~' || value === 'null') return null;
  if (value === 'true' || value === 'false') return value === 'true';
  if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) return Number(value);
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) return tapUnescape(value.slice(1, -1).replace(/''/g, "'"));
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) { try { return JSON.parse(value); } catch { return value.slice(1, -1); } }
  return value;
}

// The YAML node's TAP reporter writes: scalars, block scalars (|-) and nested maps (kept as text).
function parseYamlBlock(lines) {
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z_][\w-]*):(?: (.*))?$/.exec(lines[i]);
    if (!match) continue;
    const [, key, rest = ''] = match;
    if (rest === '' || /^[|>][-+]?$/.test(rest.trim())) {
      const body = [];
      while (i + 1 < lines.length && (lines[i + 1] === '' || /^\s/.test(lines[i + 1]))) body.push(lines[++i]);
      const indent = Math.min(...body.filter(line => line.trim()).map(line => /^\s*/.exec(line)[0].length), Infinity);
      const text = body.map(line => line.slice(Number.isFinite(indent) ? indent : 0)).join('\n').replace(/\s+$/, '');
      out[key] = rest === '' && !text ? null : text;
    } else out[key] = yamlScalar(rest);
  }
  return out;
}

function parseTap(text) {
  const lines = String(text).split(/\r?\n/);
  const result = { tests: [], diagnostics: [], failures: [], totals: {}, comments: [] };
  const lastAtDepth = [];
  let pending = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const end = /^(\s*)(ok|not ok) (\d+)(?: - (.*?))?(?: # (SKIP|TODO)\b ?(.*))?$/i.exec(line);
    if (end) {
      const indent = end[1].length, depth = Math.floor(indent / 4);
      const test = { name: tapUnescape(end[4] || ''), ok: end[2] === 'ok', depth, directive: end[5] ? end[5].toUpperCase() : null, info: {} };
      if (i + 1 < lines.length && lines[i + 1].trim() === '---') {
        const yaml = [];
        i += 2;
        while (i < lines.length && lines[i].trim() !== '...') yaml.push(lines[i++].slice(indent + 2));
        test.info = parseYamlBlock(yaml);
      }
      if (!test.ok && test.info.failureType !== 'subtestsFailed') {
        const failure = describeFailure(test);
        if (/^test failed$/.test(String(test.info.error)) && pending.length) failure.output = pending.filter(entry => entry.trim()).slice(0, 12);
        result.failures.push(failure);
      }
      result.tests.push(test);
      lastAtDepth[depth] = test;
      lastAtDepth.length = depth + 1;
      pending = [];
      continue;
    }
    const comment = /^(\s*)# (.*)$/.exec(line);
    if (!comment || /^Subtest: /.test(comment[2])) continue;
    const indent = comment[1].length, body = comment[2];
    const total = indent === 0 && /^(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\d+(?:\.\d+)?)$/.exec(body);
    if (total) { result.totals[total[1]] = (result.totals[total[1]] || 0) + Number(total[2]); continue; }
    if (body.startsWith('{')) {
      try {
        const data = JSON.parse(body);
        const owner = lastAtDepth[Math.floor(indent / 4)];
        result.diagnostics.push({ test: owner ? owner.name : null, depth: Math.floor(indent / 4), data });
        continue;
      } catch { /* plain comment */ }
    }
    result.comments.push(tapUnescape(body));
    pending.push(tapUnescape(body));
  }
  return result;
}

// Prefer the assertion's own frame in a suite file; otherwise the test's declared location.
function failureSite(info) {
  const frames = String(info.stack || '').split('\n').map(frame => /\(?((?:[A-Za-z]:)?[^():]*?\.[cm]?js):(\d+):\d+\)?\s*$/.exec(frame.trim())).filter(Boolean)
    .filter(frame => !/^node:|node_modules|[\\/]internal[\\/]/.test(frame[1]));
  const location = /^(.*?):(\d+):\d+$/.exec(String(info.location || ''));
  const locationFile = location ? posix(location[1]) : null;
  const pick = frames.find(frame => locationFile && posix(frame[1]) === locationFile) || frames.find(frame => /\.test\.[cm]?js$/.test(frame[1])) || null;
  const [file, line] = pick ? [pick[1], pick[2]] : location ? [location[1], location[2]] : [null, null];
  if (!file) return null;
  const rel = posix(path.relative(REPO, path.resolve(file)));
  return (rel.startsWith('..') ? posix(file) : rel) + ':' + line;
}

function describeFailure(test) {
  const info = test.info;
  return {
    name: test.name, depth: test.depth, failureType: info.failureType || null, errorName: info.name || null,
    message: info.error == null ? '' : String(info.error), actual: info.actual, expected: info.expected,
    operator: info.operator || null, site: failureSite(info), hasActual: 'actual' in info, hasExpected: 'expected' in info,
  };
}

const truncate = (text, max) => text.length > max ? text.slice(0, max - 1) + '…' : text;
const oneLine = value => (typeof value === 'string' ? value : JSON.stringify(value)).replace(/\s+/g, ' ').trim();

function formatSummary(tap, { code = null, files = null, seconds = null, max = 160 } = {}) {
  const totals = tap.totals, out = [];
  const count = key => totals[key] != null ? totals[key] : key === 'tests' ? tap.tests.filter(t => !t.info.type || t.info.type === 'test').length : 0;
  const parts = ['tests ' + count('tests'), 'pass ' + count('pass'), 'fail ' + count('fail')];
  for (const key of ['skipped', 'todo', 'cancelled']) if (count(key)) parts.push(key + ' ' + count(key));
  out.push(parts.join('  ') + (files != null ? '  (' + files + ' file' + (files === 1 ? '' : 's') + (seconds != null ? ', ' + seconds.toFixed(1) + ' s' : '') + ')' : ''));
  tap.failures.forEach((failure, index) => {
    out.push('', (index + 1) + ') ' + failure.name + (failure.site ? '  [' + failure.site + ']' : ''));
    const message = failure.message.split('\n').map(line => line.trim()).filter(Boolean);
    // Deep-equality diffs: the first line plus the changed (+/-) lines, not the unchanged context.
    const changed = message.filter(line => /^[+-] /.test(line) && !/^\+ actual - expected/.test(line));
    const head = (changed.length ? [message[0], ...changed.slice(0, 4)] : message.slice(0, 3)).map(line => truncate(line, max));
    out.push('   ' + (failure.errorName && failure.errorName !== 'AssertionError' && !/^test failed$/.test(message[0] || '') ? failure.errorName + ': ' : '') + (head.shift() || failure.failureType || 'failed'));
    for (const line of head) out.push('   ' + line);
    if (failure.hasActual || failure.hasExpected) out.push('   actual:   ' + truncate(oneLine(failure.actual), max), '   expected: ' + truncate(oneLine(failure.expected), max) + (failure.operator ? '  (' + failure.operator + ')' : ''));
    if (failure.output) {
      const thrown = failure.output.find(line => /^\s*\w*(?:Error|Exception)\b/.test(line));
      for (const line of [failure.output[0], thrown].filter((line, i, all) => line && all.indexOf(line) === i)) out.push('   | ' + truncate(line.trim(), max));
    }
  });
  if (!tap.failures.length && code) out.push('', 'node --test exited ' + code + ' without a reported test failure; rerun the files directly for the raw output.');
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------
// Running.
// ---------------------------------------------------------------------------------------------------
function runNodeTest(files, { grep = null, cwd = REPO, extra = [], progress = false } = {}) {
  const args = ['--test', '--test-reporter=tap', ...(grep ? ['--test-name-pattern', grep] : []), ...extra, ...files];
  return new Promise((resolve, reject) => {
    // A runner started from inside a test file inherits NODE_TEST_CONTEXT and would report to that parent instead of as TAP.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '', done = 0, failed = 0;
    const started = Date.now();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (!progress) return;
      for (const match of chunk.matchAll(/^(not ok|ok) \d+/gm)) { done++; if (match[1] === 'not ok') failed++; }
      process.stderr.write('\r  ' + done + ' top-level tests finished, ' + failed + ' failing, ' + ((Date.now() - started) / 1000).toFixed(0) + ' s ');
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (progress) process.stderr.write('\r' + ' '.repeat(60) + '\r');
      resolve({ code, stdout, stderr, seconds: (Date.now() - started) / 1000 });
    });
  });
}

function gitChanged(repo = REPO) {
  const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').map(line => line.trim()).filter(Boolean);
  let changed;
  try { changed = git(['diff', '--name-only', 'HEAD']); } catch { changed = git(['diff', '--name-only']); }
  return [...new Set([...changed, ...git(['ls-files', '--others', '--exclude-standard'])])];
}

function normalizeFile(file, cwd = process.cwd(), repo = REPO) {
  const rel = posix(path.relative(repo, path.resolve(cwd, file)));
  return rel.startsWith('..') ? posix(file) : rel;
}

function parseArgs(argv) {
  const options = { files: null, list: false, all: false, project: 'all', grep: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i], eq = arg.indexOf('='), name = eq > 0 && arg.startsWith('--') ? arg.slice(0, eq) : arg;
    const value = () => { if (eq > 0 && name !== arg) return arg.slice(eq + 1); if (i + 1 >= argv.length) throw new Error(name + ' needs a value'); return argv[++i]; };
    if (name === '--files') options.files = [...(options.files || []), ...value().split(',').map(file => file.trim()).filter(Boolean)];
    else if (name === '--list') options.list = true;
    else if (name === '--all') options.all = true;
    else if (name === '--project') options.project = value().toLowerCase();
    else if (name === '--grep') options.grep = value();
    else if (name === '--help' || name === '-h') options.help = true;
    else throw new Error('unknown argument ' + arg);
  }
  if (options.project !== 'all' && !PROJECTS[options.project]) throw new Error('--project must be v3, qollock, showrank or all');
  return options;
}

const projectKeys = project => project === 'all' ? Object.keys(PROJECTS) : [project];

function describeSelection(ctx, tests) {
  const counts = Object.values(ctx.projects).map(project => [project.label, tests.filter(test => project.tests.includes(test)).length]).filter(([, n]) => n);
  return counts.map(([label, n]) => label + ' ' + n).join(', ');
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) { console.error('test.js: ' + error.message); return 2; }
  if (options.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 11).map(line => line.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
  const ctx = scanTests();
  const keys = projectKeys(options.project);
  for (const key of keys) if (!ctx.projects[key].exists) console.log('note: ' + ctx.projects[key].dir + ' is absent; skipped.');
  for (const name of missingRuleTests(ctx)) console.log('warning: RULES names tests/' + name + '.test.js, which does not exist; update tools/test.js.');
  let tests;
  if (options.all) {
    tests = keys.flatMap(key => ctx.projects[key].tests);
    console.log('full suites: ' + keys.map(key => ctx.projects[key].label).join(', ') + ' (' + describeSelection(ctx, tests) + ')');
  } else {
    let files;
    try { files = options.files ? options.files.map(file => normalizeFile(file)) : gitChanged(); } catch (error) { console.error('test.js: git failed (' + error.message.split('\n')[0] + '); pass --files.'); return 2; }
    const selection = selectTests(files, ctx, keys);
    tests = selection.tests;
    const relevant = selection.mapped.filter(entry => entry.why !== 'outside the lanes');
    const ignored = selection.mapped.length - relevant.length;
    console.log((options.files ? 'files' : 'changed files') + ': ' + selection.mapped.length + (ignored ? ' (' + ignored + ' outside the lanes ignored)' : ''));
    const listed = options.list || relevant.length <= 12 ? relevant : relevant.filter(entry => entry.full);
    for (const entry of listed) console.log('  ' + entry.file + ' -> ' + entry.tests.length + ' suite' + (entry.tests.length === 1 ? '' : 's') + ' (' + entry.why + ')');
    if (listed.length < relevant.length) console.log('  … ' + (relevant.length - listed.length) + ' more mapped files (--list shows all)');
    if (relevant.some(entry => entry.full)) console.log('  unsure about ' + relevant.filter(entry => entry.full).length + ' file(s): falling back to the full suites.');
  }
  if (!tests.length) { console.log('no tests selected' + (options.all ? '' : '; use --all for the full suites') + '.'); return 0; }
  if (options.list) {
    for (const project of Object.values(ctx.projects)) {
      const mine = tests.filter(test => project.tests.includes(test));
      if (mine.length) console.log(project.label + ' (' + mine.length + '):\n' + mine.map(test => '  ' + test).join('\n'));
    }
    return 0;
  }
  console.log('running ' + tests.length + ' file' + (tests.length === 1 ? '' : 's') + ' (' + describeSelection(ctx, tests) + ')' + (options.grep ? ' matching /' + options.grep + '/' : '') + '…');
  const run = await runNodeTest(tests, { grep: options.grep, progress: process.stderr.isTTY });
  const tap = parseTap(run.stdout + '\n' + run.stderr);
  console.log(formatSummary(tap, { code: run.code, files: tests.length, seconds: run.seconds }));
  return run.code === 0 ? 0 : 1;
}

module.exports = {
  REPO, PROJECTS, RULES, scanTests, localRequires, closure, dependents, mentions, cssTests, mapFile, selectTests, missingRuleTests,
  parseTap, parseYamlBlock, tapUnescape, failureSite, formatSummary, runNodeTest, gitChanged, normalizeFile, parseArgs, main,
};

if (require.main === module) main().then(code => { process.exitCode = code; }, error => { console.error(error); process.exitCode = 2; });
