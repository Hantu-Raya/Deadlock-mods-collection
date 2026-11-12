#!/usr/bin/env node
'use strict';
// Build preflight for the HP Colors v3 lanes: prints a PASS/WARN/FAIL table and exits 1 on any FAIL.
//
//   node hp_colors_rewrite_v3/tools/doctor.js [--project v3|qollock|showrank|all] [--only id,...]
//        [--json] [--fix-hints]
//
// Check ids: the keys of `checks` below, in that order.
// Every probe goes through injected fs/spawnSync/env (runDoctor's deps) so tests need no real machine.
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { REPO, repoPaths, projectConfig, expandProjects } = require('./lib/projects');
const { probeCompilerRuntime, findInstall, spawnNode, showrankCandidates, findShowrankCarrier, readClientVersion, pinMismatchMessage } = require('./lib/toolchain');

const MIN_NODE_MAJOR = 18;

function parseArgs(argv) {
  const opts = { project: 'all', only: null, json: false, fixHints: false, steamInf: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value. ${USAGE}`);
      i++;
      return next;
    };
    if (arg === '--project') opts.project = value();
    else if (arg === '--only') opts.only = value().split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--json') opts.json = true;
    else if (arg === '--fix-hints') opts.fixHints = true;
    else if (arg === '--installed-steam-inf') opts.steamInf = value();
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`Unknown argument '${arg}'. ${USAGE}`);
  }
  opts.projects = expandProjects(opts.project);
  if (opts.only) {
    const unknown = opts.only.filter(id => !CHECK_IDS.includes(id));
    if (unknown.length) throw new Error(`Unknown check(s): ${unknown.join(', ')}. Checks: ${CHECK_IDS.join(', ')}`);
  }
  return opts;
}

const result = (id, name, status, detail, hint) => ({ id, name, status, detail, ...(hint ? { hint } : {}) });

function runNodeScript(ctx, script, args) {
  const r = spawnNode(ctx, script, args, { env: ctx.env, cwd: ctx.root, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const text = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return { status: r.error ? null : r.status, error: r.error, text, last: text.split(/\r?\n/).filter(Boolean).pop() || '' };
}

const checks = {
  node(ctx) {
    const version = ctx.nodeVersion;
    const major = Number.parseInt(String(version).replace(/^v/, ''), 10);
    if (major >= MIN_NODE_MAJOR) return result('node', 'Node version', 'PASS', version);
    return result('node', 'Node version', 'FAIL', `${version} < v${MIN_NODE_MAJOR} (node:test, fs.cpSync)`, `Install Node ${MIN_NODE_MAJOR} or newer.`);
  },

  compiler(ctx) {
    const name = 'Source 2 compiler + .NET';
    const probe = probeCompilerRuntime(ctx.paths.compiler, ctx);
    switch (probe.status) {
      case 'present': return result('compiler', name, 'PASS', probe.detail);
      case 'roll-forward': return result('compiler', name, 'WARN', probe.detail + '; the build sets it for the compiler process only',
        `Optional: install the .NET ${probe.config.major} runtime to run the compiler on its own major.`);
      case 'no-compiler': return result('compiler', name, 'FAIL', probe.detail, 'Restore sr2compiler/ (New folder.exe and its runtimeconfig/deps/dll).');
      case 'unknown': return result('compiler', name, 'WARN', probe.detail, 'Check sr2compiler/New folder.runtimeconfig.json.');
      case 'no-dotnet': return result('compiler', name, 'FAIL', probe.detail, `Install the .NET ${probe.config.major} runtime (or a higher major) from https://dotnet.microsoft.com/download.`);
      default: return result('compiler', name, 'FAIL', probe.detail, `Install the .NET ${probe.config ? probe.config.major : ''} runtime (or a higher major).`);
    }
  },

  pref(ctx) {
    const name = 'sr2compiler/pref.json directory';
    const file = ctx.paths.prefJson;
    if (!ctx.fs.existsSync(file)) return result('pref', name, 'FAIL', `${file} not found`, 'Create sr2compiler/pref.json: {"directory": "<path to dota 2 beta (Source 2 tools)>"}.');
    let dir;
    try { dir = JSON.parse(ctx.fs.readFileSync(file, 'utf8')).directory; }
    catch (err) { return result('pref', name, 'FAIL', `${file} unreadable: ${err.message}`, 'Fix the JSON in sr2compiler/pref.json.'); }
    if (!dir) return result('pref', name, 'FAIL', 'pref.json has no "directory"', 'Set "directory" in sr2compiler/pref.json.');
    if (!ctx.fs.existsSync(dir)) return result('pref', name, 'FAIL', `${dir} does not exist`, 'Point "directory" in sr2compiler/pref.json at an installed Source 2 tools game (dota 2 beta).');
    return result('pref', name, 'PASS', dir);
  },

  steam(ctx) {
    const install = ctx.install;
    const where = install.steamInf ? `${install.steamInf} (${install.source})` : null;
    let pin = null;
    try { pin = JSON.parse(ctx.fs.readFileSync(ctx.paths.pin, 'utf8')); } catch { /* reported below */ }
    const pinText = pin ? `pin ClientVersion=${pin.clientVersion} (${String(pin.commit || '').slice(0, 12)})` : 'pin unreadable (game-data-pin.json)';
    const hint = 'Pass --installed-steam-inf <steam.inf> or set HPV3_STEAM_INF / HPV3_DEADLOCK_DIR (build.js uses the same discovery).';
    if (!install.steamInf) {
      return [result('steam', 'Deadlock install', 'WARN', `not found (checked ${install.tried.length} path(s)); the offline pin is used`, hint),
        result('steam', 'Installed vs pin', 'INFO', `installed ClientVersion unknown; ${pinText}`)];
    }
    if (!ctx.fs.existsSync(install.steamInf)) {
      return [result('steam', 'Deadlock install', 'WARN', `${where} absent; the offline pin is used`, hint),
        result('steam', 'Installed vs pin', 'INFO', `installed ClientVersion unknown; ${pinText}`)];
    }
    let installed = null;
    try { installed = readClientVersion(ctx.fs.readFileSync(install.steamInf, 'utf8')); } catch { /* reported below */ }
    if (!installed) return [result('steam', 'Deadlock install', 'FAIL', `${where} has no ClientVersion`, hint)];
    const rows = [result('steam', 'Deadlock install', 'PASS', `${where} ClientVersion=${installed}`)];
    if (!pin) rows.push(result('steam', 'Installed vs pin', 'FAIL', `installed ClientVersion=${installed}; ${pinText}`, 'Fix hp_colors_rewrite_v3/game-data-pin.json.'));
    else if (installed === pin.clientVersion) rows.push(result('steam', 'Installed vs pin', 'PASS', `installed ClientVersion=${installed} = ${pinText}`));
    else rows.push(result('steam', 'Installed vs pin', 'WARN', pinMismatchMessage({ installed, pinned: pin.clientVersion, steamInf: install.steamInf }),
      'Builds refuse this mismatch unless --allow-pin-mismatch is passed.'));
    return rows;
  },

  vpk(ctx) { return toolCheck(ctx, 'vpk', 'vpkeditcli.exe', ctx.paths.vpkToolCandidates); },
  viewer(ctx) { return toolCheck(ctx, 'viewer', 'Source2Viewer-CLI.exe', ctx.paths.viewerCandidates); },

  'showrank-dep'(ctx) {
    if (!ctx.projects.includes('showrank')) return [];
    const name = 'ShowRank dependency';
    const script = projectConfig('showrank', ctx.root).showrankScript;
    const { addons, candidates } = showrankCandidates(ctx, ctx.install.steamInf, ctx.paths.showrankRepoVpk);
    const hint = 'Build ShowRank barebones (showrank_barebones_dir.vpk) or install it as pak89.';
    if (!candidates.length) return result('showrank-dep', name, 'FAIL', `neither ${path.join(addons, 'pak89_dir.vpk')} nor ${ctx.paths.showrankRepoVpk} exists`, hint);
    const viewer = ctx.paths.viewerCandidates.find(f => ctx.fs.existsSync(f));
    if (!viewer) return result('showrank-dep', name, 'WARN', `${candidates[0]} present; contents not verified (no Source2Viewer-CLI)`, hint);
    // A candidate the viewer cannot read is skipped without a warning (unlike the build, which stops on it).
    const carrier = findShowrankCarrier(candidates, script, vpk => {
      const r = ctx.spawnSync(viewer, ['-i', vpk, '--vpk_list'], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      return r.error || r.status !== 0 ? null : String(r.stdout || '').split(/\r?\n/);
    });
    if (carrier) return result('showrank-dep', name, 'PASS', `${carrier} contains ${script}`);
    return result('showrank-dep', name, 'FAIL', `no candidate contains ${script}: ${candidates.join(', ')}`, hint);
  },

  generators(ctx) {
    const seen = new Set();
    const out = [];
    for (const project of ctx.projects) {
      for (const gen of projectConfig(project, ctx.root).generators) {
        if (seen.has(gen.script)) continue;
        seen.add(gen.script);
        const rel = path.relative(ctx.root, gen.script).replace(/\\/g, '/');
        const r = runNodeScript(ctx, gen.script, gen.args);
        const name = `Generator current: ${path.basename(gen.script)}`;
        if (r.status === 0) out.push(result('generators', name, 'PASS', `${rel} --check`));
        else out.push(result('generators', name, 'FAIL', r.error ? r.error.message : (r.last || `exit ${r.status}`), `Review inputs, then run node ${rel} (without --check).`));
      }
    }
    return out;
  },

  release(ctx) {
    const name = 'record.json release vs news.json';
    let record, news;
    try {
      record = JSON.parse(ctx.fs.readFileSync(ctx.paths.record, 'utf8')).release;
      news = JSON.parse(ctx.fs.readFileSync(ctx.paths.news, 'utf8'));
    } catch (err) { return result('release', name, 'FAIL', err.message, 'Fix settings/record.json or settings/news.json.'); }
    const releases = (Array.isArray(news) ? news : []).map(item => item && item.release).filter(Boolean);
    if (!record) return result('release', name, 'FAIL', 'record.json has no release', 'Set "release" in settings/record.json.');
    if (!releases.length) return result('release', name, 'WARN', `record ${record}; news.json has no releases`);
    const newest = releases.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
    const cmp = compareVersions(record, newest);
    if (cmp === 0) return result('release', name, 'PASS', `${record}`);
    if (cmp < 0) return result('release', name, 'FAIL', `news.json announces ${newest} but record.json is ${record}`, 'Bump settings/record.json "release" (and the record bookkeeping) or fix the news item release.');
    return result('release', name, 'WARN', `record.json ${record} is newer than the newest news item ${newest}`, 'Add a settings/news.json item for this release if it has user-visible changes.');
  },

  git(ctx) {
    const r = ctx.spawnSync('git', ['status', '--porcelain'], { cwd: ctx.root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status !== 0) return result('git', 'Git working tree', 'INFO', 'git status unavailable');
    const count = String(r.stdout || '').split(/\r?\n/).filter(Boolean).length;
    return result('git', 'Git working tree', 'INFO', count ? `${count} changed/untracked path(s)` : 'clean');
  }
};

// The ids (and their run order) are the keys of `checks`.
const CHECK_IDS = Object.keys(checks);
const USAGE = 'Usage: node hp_colors_rewrite_v3/tools/doctor.js [--project v3|qollock|showrank|all] [--only <check,...>] [--json] [--fix-hints]\nChecks: ' + CHECK_IDS.join(', ');

function toolCheck(ctx, id, toolName, candidates) {
  const found = candidates.find(f => ctx.fs.existsSync(f));
  if (found) return result(id, toolName, 'PASS', path.relative(ctx.root, found) || found);
  return result(id, toolName, 'FAIL', `not found. Checked: ${candidates.join(', ')}`, `Place ${toolName} at ${candidates[0]}.`);
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => Number.parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

function defaultDeps() {
  return { fs, spawnSync: childProcess.spawnSync, env: process.env, execPath: process.execPath, nodeVersion: process.version, root: REPO };
}

function runDoctor(opts, deps = defaultDeps()) {
  const root = deps.root || REPO;
  const paths = repoPaths(root);
  const ctx = { ...deps, root, paths, projects: opts.projects || expandProjects(opts.project || 'all'), install: findInstall(deps, opts.steamInf) };
  const ids = opts.only || CHECK_IDS;
  const results = [];
  for (const id of CHECK_IDS.filter(c => ids.includes(c))) {
    let out;
    try { out = checks[id](ctx); }
    catch (err) { out = result(id, id, 'FAIL', `check crashed: ${err.message}`); }
    results.push(...[].concat(out));
  }
  return { ok: !results.some(r => r.status === 'FAIL'), project: opts.project || 'all', results };
}

function formatTable(report, { fixHints = false } = {}) {
  const rows = report.results.map(r => [r.status, r.id, r.name, r.detail]);
  const head = ['STATUS', 'CHECK', 'NAME', 'DETAIL'];
  const widths = [0, 1, 2].map(i => Math.max(head[i].length, ...rows.map(r => r[i].length)));
  const line = r => r.map((cell, i) => (i < 3 ? cell.padEnd(widths[i]) : cell)).join('  ');
  const out = [line(head), line(widths.map(w => '-'.repeat(w)).concat('------')), ...rows.map(line)];
  if (fixHints) {
    const hinted = report.results.filter(r => r.hint && r.status !== 'PASS');
    if (hinted.length) out.push('', 'Fix hints:', ...hinted.map(r => `  [${r.id}] ${r.hint}`));
  }
  const counts = ['PASS', 'WARN', 'FAIL'].map(s => `${report.results.filter(r => r.status === s).length} ${s}`).join(', ');
  out.push('', `${report.ok ? 'OK' : 'NOT READY'} (${counts}; project ${report.project})`);
  return out.join('\n');
}

function main(argv = process.argv.slice(2), deps = defaultDeps(), write = s => process.stdout.write(s + '\n')) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (err) { write(err.message); return 2; }
  if (opts.help) { write(USAGE); return 0; }
  const report = runDoctor(opts, deps);
  if (opts.json) {
    const json = opts.fixHints ? report : { ...report, results: report.results.map(({ hint, ...r }) => r) };
    write(JSON.stringify(json, null, 2));
  } else write(formatTable(report, { fixHints: opts.fixHints }));
  return report.ok ? 0 : 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { CHECK_IDS, parseArgs, runDoctor, formatTable, compareVersions, checks, main };
