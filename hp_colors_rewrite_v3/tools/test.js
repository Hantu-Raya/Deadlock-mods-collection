#!/usr/bin/env node
'use strict';
// Quick test runner for the three HP Colors v3 lanes (v3, QOLLOCK, ShowRank).
//
//   node hp_colors_rewrite_v3/tools/test.js                    changed files (git diff HEAD + untracked) -> tests
//   node hp_colors_rewrite_v3/tools/test.js --files a.js,b.css  explicit changed files instead of git
//   node hp_colors_rewrite_v3/tools/test.js --list              show the chosen test files without running them
//   node hp_colors_rewrite_v3/tools/test.js --list-unmapped     v3 panorama scripts no RULES entry names (report only)
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
const cli = require('./lib/cli');
const { REPO, LANES, V3_DIR, VARIANT_NAMES, PROJECT_NAMES } = require('./lib/projects');
const { posix, listFiles, runNodeTest, gitChanged, normalizeFile } = require('./lib/run');
const { parseTap, formatSummary } = require('./lib/tap');

const PROJECTS = Object.fromEntries(PROJECT_NAMES.map(key => [key, { key, dir: LANES[key].dir, label: LANES[key].label }]));
const V3 = V3_DIR;
const VARIANTS = VARIANT_NAMES;
// Folders no cycle or test selection cares about (docs, scratch, build output): tools/dev.js reads the same list.
const NON_SOURCE_DIRS = Object.freeze(['docs', 'issues', 'research', '.build', '.tmp']);
// tools/lib files generate.js does not read (build and test tooling): every other tools/lib/*.js feeds the generator.
const BUILD_TOOL_LIBS = Object.freeze(['projects', 'toolchain', 'cli', 'tap', 'run']);
// tools/-relative generator inputs as a regex source (anchor it yourself): generate.js, menu-layout.js, tools/lib/*.js less the build tools.
const GENERATOR_MODULE = 'tools\\/(?:generate|menu-layout|lib\\/(?!(?:' + BUILD_TOOL_LIBS.join('|') + ')\\.js$)[^/]+)\\.js$';
// The lane folders as one regex alternative: a repo-relative path starts with one of them.
const LANE_DIR = '(?:' + Object.values(PROJECTS).map(project => project.dir).join('|') + ')';

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
  { match: new RegExp('^' + LANE_DIR + '\\/(?:[^/]+\\.md$|(?:' + NON_SOURCE_DIRS.map(dir => dir.replace('.', '\\.')).join('|') + ')\\/)'), tests: [], why: 'documentation/build output' },
  { match: at('panorama/scripts/hp_colors_v3_renderer.js'), tests: ['renderer', 'preview', 'status-effect-sizes', 'audit-performance'], shared: true },
  { match: at('panorama/scripts/hp_colors_v3_preview.js'), tests: ['preview', 'preview-chrome', 'status-effect-sizes', 'audit-performance'], shared: true },
  { match: at('panorama/scripts/hp_colors_v3_menu.js'), tests: [...MENU, 'legacy-shield'], shared: true },
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
  { match: new RegExp('^' + V3 + '/' + GENERATOR_MODULE), tests: ['generator', 'review-fixes', 'news', 'preview-chrome', 'menu', 'game-data'], shared: true },
  { match: /^hp_colors_rewrite_v3\/(?:tools\/game-data\.js|game-data-pin\.json)$/, tests: ['game-data', 'generator', 'review-fixes'], shared: true },
  { match: at('tools/stage-scripts.js'), tests: ['stage-scripts', 'logging', 'audit-tooling'] },
  { match: at('tools/suite-cache.js'), tests: ['audit-tooling'] },
  { match: at('tools/check-renderer-mutation.js'), tests: ['renderer'] },
  { match: at('tools/budgets.js'), tests: ['budgets'] },
  { match: at('tools/test.js'), tests: ['quick-test'] },
  // The shared tool modules: every tool that reads them has a suite (suites that require() a tool are added on top).
  { match: /^hp_colors_rewrite_v3\/tools\/lib\/(?:cli|tap|run)\.js$/, tests: ['quick-test', 'budgets', 'timing', 'logscan', 'ticket', 'engine-facts'] },
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
  // Offline research helpers (Python, run by hand; engine-facts.js --refresh prints how). Nothing executes them, so the facts test is the nearest check.
  { match: /^hp_colors_rewrite_v3\/tools\/research\/[^/]+\.py$/, tests: ['engine-facts'] },
  // Engine facts from the panorama.dll research; lib/stylesheets.js checks sheets against them in generate.js --check.
  { match: at('tools/lib/engine-facts.json'), tests: ['engine-facts', 'generator'] },
];

// ---------------------------------------------------------------------------------------------------
// Test-source scan: suites, helpers and their local require() graph.
// ---------------------------------------------------------------------------------------------------
function scanTests(repo = REPO) {
  const projects = {}, sources = new Map();
  for (const project of Object.values(PROJECTS)) {
    const dir = path.join(repo, project.dir, 'tests');
    const names = listFiles(dir, '.js');
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
  const inTests = new RegExp('^' + LANE_DIR + '/tests/').test(file);
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

const ARGS = {
  defaults: { files: null, list: false, listUnmapped: false, all: false, project: 'all', grep: null, help: false },
  options: {
    '--files': { value: true, apply: (options, raw) => { options.files = [...(options.files || []), ...raw.split(',').map(file => file.trim()).filter(Boolean)]; } },
    '--list': { key: 'list' },
    '--list-unmapped': { key: 'listUnmapped' },
    '--all': { key: 'all' },
    '--project': { key: 'project', value: true, lower: true },
    '--grep': { key: 'grep', value: true },
    ...cli.HELP,
  },
};

function parseArgs(argv) {
  const options = cli.parse(argv, ARGS);
  if (!cli.project(options.project)) throw new Error('--project must be ' + cli.projectWords());
  return options;
}

const projectKeys = project => cli.project(project);

// v3 panorama scripts no RULES entry names: those fall back to the suites that mention them, else the full suites.
function unmappedScripts(repo = REPO) {
  const dir = V3 + '/panorama/scripts';
  return listFiles(path.join(repo, dir), '.js').map(name => dir + '/' + name).filter(file => !RULES.some(rule => rule.match.test(file)));
}

function describeSelection(ctx, tests) {
  const counts = Object.values(ctx.projects).map(project => [project.label, tests.filter(test => project.tests.includes(test)).length]).filter(([, n]) => n);
  return counts.map(([label, n]) => label + ' ' + n).join(', ');
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) { console.error('test.js: ' + error.message); return 2; }
  if (options.help) { console.log(cli.helpText(__filename, 3, 12)); return 0; }
  if (options.listUnmapped) {
    const unmapped = unmappedScripts();
    console.log(unmapped.length ? unmapped.join('\n') : 'every v3 panorama script is named by a RULES entry.');
    return 0;
  }
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
  REPO, RULES, NON_SOURCE_DIRS, BUILD_TOOL_LIBS, GENERATOR_MODULE, unmappedScripts, scanTests, localRequires, closure, dependents, mentions, cssTests, mapFile, selectTests, missingRuleTests,
  parseArgs, main,
};

if (require.main === module) main().then(code => { process.exitCode = code; }, error => { console.error(error); process.exitCode = 2; });
