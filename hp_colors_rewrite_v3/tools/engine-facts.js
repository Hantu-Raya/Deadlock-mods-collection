#!/usr/bin/env node
'use strict';
// Engine-facts gate: the Panorama API the mod uses must exist in the Deadlock DLLs.
//
// Usage: node hp_colors_rewrite_v3/tools/engine-facts.js --check [--project v3|qollock|showrank|all]
//        node hp_colors_rewrite_v3/tools/engine-facts.js --refresh --from <Deadlock folder>
//
// --check scans each project's panorama/scripts/*.js and panorama/styles/*.css (variants add their own files to
// the canonical v3 sources they package) and reports every CSS property, `style.*` key, `$.` function, panel
// method or event name that tools/lib/engine-facts.json does not list, plus the stylesheet engine checks of
// lib/stylesheets.js (selector limits, at-rules, combinators; unknown pseudo-classes are warnings). Exit 1 on any
// finding. --refresh is read-only toward the game; see refreshHelp().
const fs = require('node:fs');
const path = require('node:path');
const { engineFindings } = require('./lib/stylesheets');
const cli = require('./lib/cli');
const { REPO, LANES } = require('./lib/projects');
const { listFiles } = require('./lib/run');
const { readClientVersion } = require('./lib/pin');

const FACTS_FILE = path.join(__dirname, 'lib', 'engine-facts.json');
const USAGE = `Usage: node hp_colors_rewrite_v3/tools/engine-facts.js --check [--project ${cli.projectChoices()}] | --refresh --from <Deadlock folder>`;
// Per project, the lane folders it scans: the canonical v3 sources plus the variant's own.
const PROJECTS = Object.fromEntries(Object.values(LANES).map(lane => [lane.key, lane.sourceDirs]));
// Names published on $ by mods, never engine functions: this mod's shared globals, and the QOLLOCK host's
// window API that the QOLLOCK bridge feature-detects (IsModSettingsOpen, ForceCloseModSettings).
const MOD_GLOBAL = /^(?:HPColors|HPC3|HPV3|IsModSettingsOpen$|ForceCloseModSettings$)/;

const ARGS = {
  defaults: { check: false, refresh: false, from: null, project: 'all', help: false },
  options: {
    '--check': { key: 'check' },
    '--refresh': { key: 'refresh' },
    '--from': { key: 'from', value: true },
    '--project': { key: 'project', value: true },
    ...cli.HELP,
  },
  equals: false,
  undefinedValue: true,
  messages: { unknown: arg => 'Unknown argument ' + arg + '. ' + USAGE },
};

function parseArgs(argv) {
  const opts = cli.parse(argv, ARGS);
  if (!opts.help && opts.check === opts.refresh) throw new Error('Pass exactly one of --check or --refresh. ' + USAGE);
  if (opts.refresh && !opts.from) throw new Error('--refresh needs --from <Deadlock folder>. ' + USAGE);
  if (!cli.project(opts.project)) throw new Error('Unknown project ' + opts.project + '. ' + USAGE);
  return opts;
}

function loadFacts(file = FACTS_FILE) {
  const facts = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    facts,
    properties: new Set(facts.css.properties.values),
    dollar: new Set(facts.js.dollar.values),
    panel: new Set([...facts.js.panel.values, ...Object.values(facts.js.panelTyped.values).flat()]),
    events: new Set(Object.keys(facts.js.events.values)),
  };
}

const { kebab } = cli;
const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, c => ' '.repeat(c.length));
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

// Findings for one script: [{ line, kind, name }].
function scanScript(source, known) {
  const text = stripComments(source);
  const findings = [];
  const add = (index, kind, name) => findings.push({ line: lineAt(text, index), kind, name });
  // Capitalized members the script defines itself (object keys, assignments, functions) are not engine calls.
  const own = new Set();
  for (const m of text.matchAll(/(?:^|[,{\s])([A-Z]\w*)\s*:/g)) own.add(m[1]);
  for (const m of text.matchAll(/\.([A-Z]\w*)\s*=(?!=)/g)) own.add(m[1]);
  for (const m of text.matchAll(/function\s+([A-Z]\w*)/g)) own.add(m[1]);
  for (const m of text.matchAll(/\.style\.([A-Za-z][A-Za-z0-9]*)/g)) {
    if (!known.properties.has(kebab(m[1]))) add(m.index, 'style key', m[1]);
  }
  for (const m of text.matchAll(/\.style\[\s*["']([^"']+)["']\s*\]/g)) {
    if (!known.properties.has(kebab(m[1]))) add(m.index, 'style key', m[1]);
  }
  for (const m of text.matchAll(/(?<![\w.])\$\.([A-Za-z_]\w*)\s*\(/g)) {
    if (!MOD_GLOBAL.test(m[1]) && !known.dollar.has(m[1])) add(m.index, '$ function', m[1]);
  }
  for (const m of text.matchAll(/([\w$\])]+)\.([A-Z]\w*)\s*\(/g)) {
    if (m[1] === '$' || /^(?:\$\.)?(?:HPColors|HPC3|HPV3)/.test(m[1]) || own.has(m[2])) continue;
    if (/^(?:Object|JSON|Math|Array|String|Number|Date|Promise|Reflect|Symbol|Buffer)$/.test(m[1])) continue;
    if (!known.panel.has(m[2])) add(m.index, 'panel method', m[2]);
  }
  const eventCalls = /(?<![\w.])\$\.(?:DispatchEvent|RegisterForUnhandledEvent|UnregisterForUnhandledEvent|RegisterEventHandler|DispatchEventAsync\(\s*[^,()]+,)\(?\s*["']([^"']+)["']/g;
  for (const m of text.matchAll(eventCalls)) {
    if (!known.events.has(m[1])) add(m.index, 'event', m[1]);
  }
  return findings;
}

const listPaths = (dir, extension) => listFiles(dir, extension).map(name => path.join(dir, name));

function check({ project = 'all', root = REPO, factsFile = FACTS_FILE, log = console.log } = {}) {
  const known = loadFacts(factsFile);
  const lanes = cli.project(project);
  const dirs = [...new Set(lanes.flatMap(lane => PROJECTS[lane]))];
  const errors = [], warnings = [];
  let scripts = 0, sheets = 0;
  for (const dir of dirs) {
    for (const file of listPaths(path.join(root, dir, 'panorama', 'scripts'), '.js')) {
      scripts++;
      const rel = path.relative(root, file).replace(/\\/g, '/');
      for (const f of scanScript(fs.readFileSync(file, 'utf8'), known)) errors.push(rel + ':' + f.line + ': ' + f.kind + ' ' + f.name + ' is not in engine-facts.json');
    }
    for (const file of listPaths(path.join(root, dir, 'panorama', 'styles'), '.css')) {
      sheets++;
      const rel = path.relative(root, file).replace(/\\/g, '/');
      const found = engineFindings(rel, fs.readFileSync(file, 'utf8'));
      errors.push(...found.errors);
      warnings.push(...found.warnings);
    }
  }
  for (const warning of warnings) log('warning: ' + warning);
  for (const error of errors) log('error: ' + error);
  log('engine facts (Deadlock ' + known.facts.build.clientVersion + '): ' + lanes.join(', ') + ': ' + scripts + ' scripts, ' + sheets +
    ' stylesheets, ' + errors.length + ' error(s), ' + warnings.length + ' warning(s)');
  return { errors, warnings, scripts, sheets };
}

function refreshHelp(from, fsx = fs) {
  const steamInf = path.join(from, 'game', 'citadel', 'steam.inf');
  let version = 'unknown (steam.inf not found under ' + steamInf + ')';
  try { version = readClientVersion(fsx.readFileSync(steamInf, 'utf8')) || version; } catch { /* reported */ }
  return [
    'engine-facts --refresh: the extractor needs a disassembler pass (pefile, numpy, capstone) and is not ported to Node.',
    'Installed ClientVersion: ' + version + '; facts file: ' + path.relative(REPO, FACTS_FILE).replace(/\\/g, '/') + ' (' + loadFacts().facts.build.clientVersion + ').',
    'Regenerate read-only from ' + from + ' with Python 3 (pip install pefile numpy capstone):',
    '  python hp_colors_rewrite_v3/tools/research/extract.py --game "' + path.join(from, 'game').replace(/\\/g, '/') + '"   # strings_<dll>.tsv in hp_colors_rewrite_v3/.tmp/dll-research (--out <dir> to change)',
    '  then the steps in hp_colors_rewrite_v3/research/dll-tooling-findings.md (tools/research/dllx.py: factories, $ table, panel tables, events)',
    'and rewrite engine-facts.json; review the diff (new/removed names) before committing.',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); } catch (error) { console.error(error.message); return 2; }
  if (opts.help) { console.log(USAGE); return 0; }
  if (opts.refresh) { console.log(refreshHelp(opts.from)); return 2; }
  return check({ project: opts.project }).errors.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { USAGE, PROJECTS, parseArgs, loadFacts, scanScript, check, refreshHelp, main };
