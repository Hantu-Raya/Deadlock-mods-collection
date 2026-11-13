#!/usr/bin/env node
'use strict';
// Repo clutter report (and conservative cleaner).
//
//   node tools/clean.js                                   Markdown report on stdout (report-only, deletes nothing)
//   node tools/clean.js --json                            same findings as JSON
//   node tools/clean.js --scope <dir>                     only report paths under <dir> (repo-relative)
//   node tools/clean.js --apply --category output         delete SAFE items of the named categories
//   node tools/clean.js --apply --category output --include-tracked
//                                                         also delete regenerable items that contain tracked files
//
// Every finding carries evidence and a risk label:
//   SAFE   untracked/ignored and regenerable (the only thing --apply deletes by default)
//   REVIEW tracked or ambiguous; a human decides
//   KEEP   referenced by a repo file (or active)
// When unsure the tool says REVIEW, never SAFE.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');

const CATEGORIES = [
  { id: 1, key: 'output', title: 'Regenerable untracked output' },
  { id: 2, key: 'backups', title: 'Backups and duplicates' },
  { id: 3, key: 'ps1', title: 'PowerShell inventory' },
  { id: 4, key: 'mods', title: 'Mod folders' },
  { id: 5, key: 'root', title: 'Root clutter' },
  { id: 6, key: 'scripts', title: 'Unreferenced tracked scripts under scripts/' },
];
const DEFAULT_LATEST_BASE = 6839; // current game pin quoted for HP Colors v3 (override with --latest-base)
const DUP_MIN_BYTES = 100 * 1024;
const REF_EXCLUDED_SEGMENTS = new Set(['.build', '.tmp', '.scratch', 'node_modules', 'vendor', '.git', '.worktrees']);
const CACHE_DIRS = new Set(['__pycache__', '.ruff_cache', '.pytest_cache', '.mypy_cache', '.fallow', '.parcel-cache', '.turbo']);
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|tga|psd|vpk|7z|zip|rar|gz|exe|dll|pdb|bin|etl|etlx|nupkg|p7s|woff2?|ttf|otf|mp4|webm|mp3|wav|ogg|vtex|vtex_c|vxml_c|vcss_c|vjs_c|vsvg_c|vpcf_c|vdata_c|[a-z0-9]+_c)$/i;
const STANDARD_ROOT_FILES = new Set(['readme.md', 'license', 'notice', 'agents.md', 'claude.md', '.gitignore', '.gitattributes',
  '.gitmodules', '.git', '.env', '.editorconfig', 'package.json', 'package-lock.json', '.fallowrc.json', 'skills-lock.json']);
const INFRA_DIRS = new Set(['scripts', 'tools', 'docs', '_archive', '_reference', 'dist', 'releases', 'vpk cli', 'sr2compiler',
  'compilerSource'.toLowerCase()]);
const MAX_DETAIL_ROWS = 150;
// This tool and its test mention folder names on purpose; they must not count as references.
const SELF_FILES = new Set([__filename, path.join(__dirname, 'clean.test.js')].map((p) => path.resolve(p).toLowerCase()));

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const opts = { apply: false, json: false, help: false, includeTracked: false, categories: null, scope: '', root: null,
    today: null, latestBase: DEFAULT_LATEST_BASE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error('Missing value for ' + a); return argv[++i]; };
    if (a === '--apply') opts.apply = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--include-tracked') opts.includeTracked = true;
    else if (a === '--category' || a === '--categories') opts.categories = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--scope') opts.scope = next();
    else if (a === '--root') opts.root = next();
    else if (a === '--today') opts.today = next();
    else if (a === '--latest-base') opts.latestBase = Number(next());
    else throw new Error('Unknown argument: ' + a + ' (see --help)');
  }
  if (opts.today && !/^\d{4}-\d{2}-\d{2}$/.test(opts.today)) throw new Error('--today must be YYYY-MM-DD');
  if (!Number.isSafeInteger(opts.latestBase) || opts.latestBase <= 0) throw new Error('--latest-base must be a positive integer');
  if (opts.categories) opts.categories = opts.categories.map(resolveCategory);
  return opts;
}

function resolveCategory(name) {
  const c = CATEGORIES.find((x) => x.key === name.toLowerCase() || String(x.id) === name);
  if (!c) throw new Error('Unknown category "' + name + '"; use one of ' + CATEGORIES.map((x) => x.id + '/' + x.key).join(', '));
  return c.key;
}

const HELP = `Usage: node tools/clean.js [options]

Scans the whole repo and prints a clutter report (Markdown) by category with file counts,
sizes, evidence and a risk label (SAFE / REVIEW / KEEP). Report-only unless --apply.

Options:
  --json                      print the findings as JSON instead of Markdown
  --scope <dir>               only report paths under <dir> (repo-relative)
  --apply --category <list>   delete SAFE items of the named categories (comma list of
                              ids or keys: 1/output 2/backups 3/ps1 4/mods 5/root 6/scripts)
  --include-tracked           with --apply, also delete regenerable items containing tracked
                              files (refused by default)
  --today YYYY-MM-DD          reference date for ACTIVE/STALE (default: today; window = 3 months)
  --latest-base <n>           latest game ClientVersion (default ${DEFAULT_LATEST_BASE})
  --root <dir>                repo root (default: git toplevel of the cwd)
  -h, --help                  show this help

Examples:
  node tools/clean.js > .scratch/clean-report.md
  node tools/clean.js --json --scope hp_colors_rewrite_v3
  node tools/clean.js --apply --category output
`;

// ---------------------------------------------------------------- helpers
const toPosix = (p) => p.split(path.sep).join('/');
const segs = (rel) => rel.split('/');
const lc = (s) => s.toLowerCase();
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(v >= 100 ? 0 : 1) + ' ' + u[i];
}
function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function minusMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1 - months, d);
  if (dt.getDate() !== d) dt.setDate(0); // clamp e.g. May 31 -> Feb 28
  return isoDate(dt);
}
function git(root, args, opts = {}) {
  return childProcess.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 29, windowsHide: true,
    stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'pipe'] });
}
function gitAsync(root, args) {
  return new Promise((resolve) => {
    childProcess.execFile('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true },
      (err, stdout) => resolve(err ? '' : stdout));
  });
}
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  });
  await Promise.all(workers);
  return out;
}
const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
function mdTable(headers, rows) {
  const lines = ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|'];
  for (const r of rows) lines.push('| ' + r.map(mdCell).join(' | ') + ' |');
  return lines.join('\n');
}
const code = (s) => '`' + String(s).replace(/`/g, "'") + '`';

// ---------------------------------------------------------------- git state
function loadGitState(root) {
  const tracked = new Set(git(root, ['-c', 'core.quotepath=off', 'ls-files', '-z']).split('\0').filter(Boolean));
  const trackedCount = new Map(); // dir -> number of tracked files beneath
  for (const f of tracked) {
    const parts = segs(f);
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join('/');
      trackedCount.set(d, (trackedCount.get(d) || 0) + 1);
    }
  }
  const raw = git(root, ['-c', 'core.quotepath=off', 'status', '--porcelain', '--ignored', '-z']).split('\0');
  const modified = new Map(); // path -> XY
  const untracked = new Set(); // file or dir/ (trailing slash)
  const ignored = new Set();
  for (let i = 0; i < raw.length; i++) {
    const rec = raw[i];
    if (!rec) continue;
    const xy = rec.slice(0, 2), p = rec.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') i++; // skip the original path
    if (xy === '??') untracked.add(p);
    else if (xy === '!!') ignored.add(p);
    else modified.set(p, xy);
  }
  function inSet(set, rel, isDir) {
    if (set.has(rel) || (isDir && set.has(rel + '/'))) return true;
    const parts = segs(rel);
    for (let i = parts.length - 1; i > 0; i--) if (set.has(parts.slice(0, i).join('/') + '/')) return true;
    return false;
  }
  return {
    tracked, trackedCount, modified, untracked, ignored,
    // state of a path: 'tracked' | 'modified' | 'untracked' | 'ignored' (dirs: 'tracked' when anything beneath is tracked)
    state(rel, isDir = false) {
      if (!isDir && tracked.has(rel)) return modified.has(rel) ? 'modified' : 'tracked';
      if (isDir && (trackedCount.get(rel) || tracked.has(rel))) return 'tracked'; // tracked.has: submodule gitlink
      if (inSet(ignored, rel, isDir)) return 'ignored';
      if (inSet(untracked, rel, isDir)) return 'untracked';
      return isDir ? 'untracked' : 'untracked';
    },
    trackedUnder(rel, isDir) { return isDir ? (trackedCount.get(rel) || 0) : (tracked.has(rel) ? 1 : 0); },
  };
}

// ---------------------------------------------------------------- filesystem walk
function walk(root) {
  const dirs = new Map(); // rel -> { rel, name, parent, subdirs: [], files: [], size, count, nested, symlink }
  const files = [];
  const rootRec = { rel: '', name: '', parent: null, subdirs: [], files: [], size: 0, count: 0, nested: false, insideNested: false };
  dirs.set('', rootRec);
  const stack = [rootRec];
  const order = [];
  while (stack.length) {
    const d = stack.pop();
    order.push(d);
    let entries;
    try { entries = fs.readdirSync(path.join(root, d.rel), { withFileTypes: true }); } catch { continue; }
    if (d.rel && entries.some((e) => e.name === '.git')) d.nested = true;
    for (const e of entries) {
      const rel = d.rel ? d.rel + '/' + e.name : e.name;
      if (e.name === '.git') continue; // never scan or count git internals
      if (e.isDirectory()) {
        const rec = { rel, name: e.name, parent: d, subdirs: [], files: [], size: 0, count: 0, nested: false,
          insideNested: d.nested || d.insideNested };
        dirs.set(rel, rec);
        d.subdirs.push(rec);
        stack.push(rec);
      } else {
        let st;
        try { st = fs.lstatSync(path.join(root, rel)); } catch { continue; }
        const f = { rel, name: e.name, dir: d, size: e.isSymbolicLink() ? 0 : st.size, mtime: st.mtimeMs, symlink: e.isSymbolicLink() };
        d.files.push(f);
        files.push(f);
      }
    }
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const d = order[i];
    for (const f of d.files) { d.size += f.size; d.count++; if (f.mtime > (d.mtime || 0)) d.mtime = f.mtime; }
    for (const s of d.subdirs) { d.size += s.size; d.count += s.count; if ((s.mtime || 0) > (d.mtime || 0)) d.mtime = s.mtime; }
  }
  // fix insideNested now that nested flags are known (nested is set when the dir itself is read)
  for (const d of order) if (d.parent) d.insideNested = d.parent.nested || d.parent.insideNested;
  return { dirs, files };
}

// ---------------------------------------------------------------- reference corpus
// Tracked + untracked-not-ignored text files, excluding .build/.tmp/.scratch/node_modules/vendor.
function buildCorpus(root) {
  const list = git(root, ['-c', 'core.quotepath=off', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0').filter(Boolean);
  const seen = new Set();
  const parts = [];
  const starts = [];
  const paths = [];
  let offset = 0;
  for (const rel of list) {
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (segs(rel).some((s) => REF_EXCLUDED_SEGMENTS.has(s))) continue;
    if (SELF_FILES.has(path.resolve(root, rel).toLowerCase())) continue; // this tool names folders in its own source
    if (BINARY_EXT.test(rel)) continue;
    let buf;
    try {
      const st = fs.statSync(path.join(root, rel));
      if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
      buf = fs.readFileSync(path.join(root, rel));
    } catch { continue; }
    if (buf.subarray(0, 8192).includes(0)) continue;
    const text = lc(buf.toString('utf8')).replace(/\\\\/g, '/').replace(/\\/g, '/');
    starts.push(offset);
    paths.push(rel);
    parts.push(text, '\n\u0000\n');
    offset += text.length + 3;
  }
  const all = parts.join('');
  function fileAt(pos) {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return paths[lo];
  }
  const cache = new Map();
  return {
    paths,
    text: all,
    fileText(rel) { const i = paths.indexOf(rel); return i < 0 ? null : all.slice(starts[i], (starts[i + 1] ?? all.length + 3) - 3); },
    // find files mentioning `needle` with boundary checks; returns sorted unique paths
    refs(needle, { before = defaultBefore, after = defaultAfter, exclude = () => false, key = '' } = {}) {
      const n = lc(needle).replace(/\\/g, '/');
      const ck = n + '\u0001' + key;
      let hits = cache.get(ck);
      if (!hits) {
        hits = new Set();
        let pos = all.indexOf(n), guard = 0;
        while (pos !== -1 && guard++ < 50000) {
          if (before(all, pos) && after(all, pos + n.length)) hits.add(fileAt(pos));
          pos = all.indexOf(n, pos + 1);
        }
        cache.set(ck, hits);
      }
      return [...hits].filter((p) => !exclude(p)).sort();
    },
  };
}
const NAME_CH = /[a-z0-9_.\-]/;
const defaultBefore = (s, i) => i === 0 || !NAME_CH.test(s[i - 1]);
const defaultAfter = (s, i) => i >= s.length || !NAME_CH.test(s[i]);
// For a root-level entry: either not preceded by a path separator, or the preceding token is a repo-root marker.
const ROOT_MARKERS = new Set(['$psscriptroot', '$root', '.', '$repo', '$reporoot', 'deadlock-mods-collection', '$repo_root', 'root']);
function rootBefore(s, i) {
  if (i === 0) return true;
  const c = s[i - 1];
  if (NAME_CH.test(c)) return false; // part of a longer name, or an extension like foo.css
  if (c !== '/') return true;
  let j = i - 2;
  while (j >= 0 && /[a-z0-9_$.:\-]/.test(s[j])) j--;
  const tok = s.slice(j + 1, i - 1);
  return ROOT_MARKERS.has(tok) || /^[a-z]:$/.test(tok) || /\$\{?[a-z_]*root\}?$/.test(tok);
}
const dirAfter = (s, i) => i >= s.length || /[\/\s'"`),;:\]|>]/.test(s[i]);
// A folder named as a path: "name/..." after a separator-ish char, a quoted 'name', or "<root>/name".
function dirRefRe(l) {
  const n = l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?:^|[\\s(=,:])' + n + '(?=/)|[\'"`]' + n + '(?=[\'"`/])|(?:root|\\$psscriptroot|\\$repo|repo)/' + n + '(?=[/\'"`\\s]|$)', 'gm');
}

// ---------------------------------------------------------------- classification
function classify(ctx) {
  const { root, gs, fsx, corpus, opts } = ctx;
  const inScope = (rel) => !opts.scope || rel === opts.scope || rel.startsWith(opts.scope + '/') || opts.scope.startsWith(rel + '/');
  const strictScope = (rel) => !opts.scope || rel === opts.scope || rel.startsWith(opts.scope + '/');
  const findings = Object.fromEntries(CATEGORIES.map((c) => [c.key, []]));
  const notes = [];

  // ---------- 1. regenerable output
  const outputItems = findings.output;
  const coveredDirs = new Set(); // dirs emitted as category-1 items (not descended)
  const releaseLike = (name) => /release/i.test(name) || name === 'dist';
  // A producer is a build-ish file (not a doc) that names the output: by its full repo path, by bare name for
  // root-level outputs, or by bare name from a script living in the same top-level folder.
  const BUILDISH = /\.(ps1|psm1|js|mjs|cjs|py|sh|bat|cmd)$|(^|\/)package\.json$/i;
  const dirRef = { before: (s, i) => i === 0 || !/[a-z0-9_\-]/.test(s[i - 1]), after: dirAfter, key: 'dir' };
  const buildProducers = (rel) => {
    const name = rel.split('/').pop(), top = segs(rel)[0];
    const hits = rel.includes('/')
      ? [...corpus.refs(rel, dirRef), ...corpus.refs(name, dirRef).filter((p) => p.startsWith(top + '/'))]
      : corpus.refs(name, dirRef);
    return [...new Set(hits)].filter((p) => BUILDISH.test(p) && !p.startsWith(rel + '/')).sort();
  };
  const THIRD_PARTY = /extract|reference|decompil|vendor|stock|qollite|qollock|release|original/i;
  const RECENT_MS = 7 * 24 * 3600 * 1000;
  const nowMs = Date.parse(opts.today || isoDate(new Date())) + 24 * 3600 * 1000;
  function pushOutput(item) {
    if (!strictScope(item.path)) return;
    outputItems.push(item);
  }
  function dirItem(d, kind, regenerable, evidence) {
    const trackedFiles = gs.trackedUnder(d.rel, true);
    const state = gs.state(d.rel, true);
    let risk = 'SAFE';
    const ev = [evidence];
    if (!regenerable) risk = 'REVIEW';
    if (trackedFiles) { risk = 'REVIEW'; ev.push(trackedFiles + ' tracked file(s) inside'); }
    if (d.nested || hasNestedBelow(d)) { risk = 'REVIEW'; ev.push('contains a nested git checkout/worktree'); }
    return { category: 'output', kind, path: d.rel, paths: [d.rel], isDir: true, files: d.count, size: d.size, state, trackedFiles,
      regenerable, trackedRegenerable: regenerable && trackedFiles > 0 && !(d.nested || hasNestedBelow(d)), risk, evidence: ev.join('; ') };
  }
  const nestedMemo = new Map();
  function hasNestedBelow(d) {
    if (nestedMemo.has(d.rel)) return nestedMemo.get(d.rel);
    const v = d.subdirs.some((s) => s.nested || hasNestedBelow(s));
    nestedMemo.set(d.rel, v);
    return v;
  }
  function tmpItems(d) {
    // break a temp dir into children so worktrees and referenced inputs stay out of the SAFE bucket
    const children = [...d.subdirs.map((s) => ({ rel: s.rel, name: s.name, isDir: true, rec: s })),
      ...d.files.map((f) => ({ rel: f.rel, name: f.name, isDir: false, rec: f }))];
    const safe = [];
    for (const c of children) {
      const reasons = [];
      if (c.isDir && (c.rec.nested || hasNestedBelow(c.rec))) {
        const wt = worktreeOf(c.rel);
        reasons.push(wt ? 'registered git worktree (' + wt + ')' : 'nested git checkout');
      }
      const trackedFiles = gs.trackedUnder(c.rel, c.isDir);
      if (trackedFiles) reasons.push(trackedFiles + ' tracked file(s)');
      const refs = corpus.refs(d.name + '/' + c.name, { after: c.isDir ? dirAfter : defaultAfter, key: c.isDir ? 'dir' : '' });
      if (refs.length) reasons.push('referenced as an input by ' + listRefs(refs));
      const newest = c.rec.mtime;
      if (newest && nowMs - newest < RECENT_MS) reasons.push('modified ' + isoDate(new Date(newest)) + ' (last 7 days: may be in use)');
      if (reasons.length) {
        pushOutput({ category: 'output', kind: 'temp (held back)', path: c.rel, paths: [c.rel], isDir: c.isDir,
          files: c.isDir ? c.rec.count : 1, size: c.rec.size, state: gs.state(c.rel, c.isDir), trackedFiles,
          regenerable: false, trackedRegenerable: false, risk: 'REVIEW', evidence: 'inside ' + d.rel + '/ but ' + reasons.join('; ') });
      } else safe.push(c);
    }
    if (safe.length) {
      const size = safe.reduce((a, c) => a + c.rec.size, 0);
      const count = safe.reduce((a, c) => a + (c.isDir ? c.rec.count : 1), 0);
      const label = safe.length === children.length ? d.rel + '/' : d.rel + '/ (' + safe.length + ' of ' + children.length + ' entries)';
      pushOutput({ category: 'output', kind: 'temp', path: label, paths: safe.map((c) => c.rel), isDir: true, files: count, size,
        state: gs.state(d.rel, true), trackedFiles: 0, regenerable: true, trackedRegenerable: false, risk: 'SAFE',
        evidence: 'scratch/temp working dir (' + d.name + '); ' + gs.state(d.rel, true) + '; no entry is tracked, a worktree, or referenced by a repo file' });
    }
  }
  const worktrees = ctx.worktrees;
  function worktreeOf(rel) {
    const abs = lc(toPosix(path.resolve(root, rel)));
    const w = worktrees.find((x) => lc(x.path) === abs);
    return w ? (w.branch || w.head || 'worktree') : null;
  }

  const looseCompiled = new Map(); // parent dir -> files
  const scan1 = (d) => {
    if (d.insideNested || (d.rel && d.nested)) return;
    for (const s of d.subdirs) {
      const n = s.name;
      if (s.nested) continue;
      if (!inScope(s.rel)) continue;
      let item = null;
      if (n === '.build') item = dirItem(s, 'build output', true, '.build/ staging dir written by the build pipeline; ' + gs.state(s.rel, true));
      else if (n === '.tmp' || /^\.tmp/.test(n) || n === '_temp' || /^_tmp_/.test(n)) { coveredDirs.add(s.rel); tmpItems(s); continue; }
      else if (n === '.scratch') item = dirItem(s, 'scratch', false, '.gitignore keeps it as "Local research, plans and screenshots (kept on disk)"; not regenerable');
      else if (n === 'node_modules') {
        const pkg = path.join(root, d.rel, 'package.json');
        const lock = ['package-lock.json', 'bun.lock', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml'].find((l) => fs.existsSync(path.join(root, d.rel, l)));
        item = fs.existsSync(pkg)
          ? dirItem(s, 'node_modules', true, 'reinstallable from ' + (d.rel ? d.rel + '/' : '') + 'package.json' + (lock ? ' + ' + lock : ' (no lockfile: versions may drift)'))
          : dirItem(s, 'node_modules', false, 'no sibling package.json, cannot be reinstalled');
      } else if (CACHE_DIRS.has(n)) item = dirItem(s, 'tool cache', true, n + ' is a tool cache, rebuilt on next run');
      else if (/_(compiled|terser|closure)$/.test(n) || /^_.+_build$/.test(n)) {
        const producers = buildProducers(s.rel);
        const srcName = n.replace(/_(compiled|terser|closure)$/, '');
        const srcExists = srcName !== n && fsx.dirs.has(d.rel ? d.rel + '/' + srcName : srcName);
        const regen = producers.length > 0;
        item = dirItem(s, 'compiled output', regen, regen
          ? 'compiled/staging output produced by ' + listRefs(producers) + (srcExists ? '; source ' + srcName + '/ present' : '')
          : 'compiled-looking output but no build script mentions it' + (srcExists ? ' (source ' + srcName + '/ exists)' : ''));
      } else if (releaseLike(n)) { coveredDirs.add(s.rel); continue; } // release folders keep their _c files and logs
      if (item) { coveredDirs.add(s.rel); pushOutput(item); continue; }
      scan1(s);
    }
    for (const f of d.files) {
      if (!inScope(f.rel)) continue;
      if (/\.log$/i.test(f.name)) {
        const st = gs.state(f.rel), tracked = st === 'tracked' || st === 'modified';
        const refs = corpus.refs(f.name, { exclude: (p) => p === f.rel });
        const fixture = /(^|\/)(fixtures?|tests?|live|evidence|golden)(\/|$)/i.test(d.rel);
        let risk = st === 'ignored' && !fixture ? 'SAFE' : 'REVIEW';
        const ev = ['log file (' + st + ')'];
        if (refs.length) { risk = 'REVIEW'; ev.push('referenced by ' + listRefs(refs)); }
        if (tracked) ev.push('tracked: kept as evidence/fixture?');
        else if (st === 'untracked') ev.push('untracked but not gitignored: uncommitted work?');
        if (fixture) ev.push('lives in a fixtures/tests/live folder');
        pushOutput({ category: 'output', kind: 'log', path: f.rel, paths: [f.rel], isDir: false, files: 1, size: f.size, state: st,
          trackedFiles: tracked ? 1 : 0, regenerable: !fixture, trackedRegenerable: tracked && !refs.length && !fixture, risk, evidence: ev.join('; ') });
      } else if (/\.[a-z0-9]+_c$/i.test(f.name)) {
        if (!looseCompiled.has(d.rel)) looseCompiled.set(d.rel, []);
        looseCompiled.get(d.rel).push(f);
      }
    }
  };
  scan1(fsx.dirs.get(''));
  for (const [dir, list] of looseCompiled) {
    const tracked = list.filter((f) => gs.tracked.has(f.rel));
    const untracked = list.filter((f) => !gs.tracked.has(f.rel));
    const top = segs(dir)[0] || '';
    const producers = top ? buildProducers(top).filter((p) => !p.startsWith(top + '/') || /\.ps1$/i.test(p)) : [];
    const thirdParty = THIRD_PARTY.test(dir);
    const names = new Set(fsx.dirs.get(dir).files.map((f) => lc(f.name)));
    // Source2 compiled resource beside its source: foo.vxml_c <- foo.vxml|foo.xml, foo_png.vtex_c <- foo.png
    const hasSource = (f) => {
      const stripped = lc(f.name).replace(/_c$/, '');
      const m = /^(.*)\.v([a-z0-9]+)$/.exec(stripped);
      const cands = [stripped];
      if (m) { cands.push(m[1] + '.' + m[2]); const t = /^(.*)_([a-z0-9]+)$/.exec(m[1]); if (t) cands.push(t[1] + '.' + t[2]); }
      return cands.some((c) => names.has(c));
    };
    const safe = [], held = [];
    for (const f of untracked) (!thirdParty && producers.length && hasSource(f) && gs.state(f.rel) === 'ignored' ? safe : held).push(f);
    const sum = (l) => l.reduce((a, f) => a + f.size, 0);
    if (safe.length) {
      pushOutput({ category: 'output', kind: 'compiled *_c', path: dir + '/*_c (' + safe.length + ' untracked, source beside)', paths: safe.map((f) => f.rel),
        isDir: false, files: safe.length, size: sum(safe), state: gs.state(safe[0].rel), trackedFiles: 0, regenerable: true, trackedRegenerable: false,
        risk: 'SAFE', evidence: 'loose compiled resources outside release folders, each next to its source; ' + top + '/ is built by ' + listRefs(producers) });
    }
    if (held.length) {
      const why = thirdParty ? 'path looks like an extracted/third-party tree (' + dir + ')'
        : !producers.length ? 'no build script references ' + (top || 'the root')
          : untracked.some((f) => hasSource(f)) && held.some((f) => gs.state(f.rel) !== 'ignored') ? 'untracked but not gitignored (uncommitted work?)'
            : 'no source file beside them (may be the only copy)';
      pushOutput({ category: 'output', kind: 'compiled *_c', path: dir + '/*_c (' + held.length + ' untracked)', paths: held.map((f) => f.rel),
        isDir: false, files: held.length, size: sum(held), state: gs.state(held[0].rel), trackedFiles: 0, regenerable: false, trackedRegenerable: false,
        risk: 'REVIEW', evidence: 'loose compiled resources outside release folders; ' + why });
    }
    if (tracked.length) {
      const regen = !thirdParty && producers.length > 0 && tracked.every(hasSource);
      pushOutput({ category: 'output', kind: 'compiled *_c', path: dir + '/*_c (' + tracked.length + ' tracked)', paths: tracked.map((f) => f.rel),
        isDir: false, files: tracked.length, size: sum(tracked), state: 'tracked', trackedFiles: tracked.length,
        regenerable: regen, trackedRegenerable: regen, risk: 'REVIEW',
        evidence: 'tracked compiled resources outside release folders' + (regen ? '; sources beside them, rebuildable by ' + listRefs(producers) : '; not provably rebuildable') });
    }
  }

  // ---------- 2. backups and duplicates
  const BACKUP_RE = [
    [/(^|[-_ .])backups?($|[-_ .\d])/i, 'backup-named'],
    [/ copy( \(\d+\))?($|\.)| - copy/i, '"copy" duplicate name'],
    [/^new folder/i, '"New folder" name'],
    [/\.(bak|orig|old)$|\.bak[-_.]|\.orig[-_.]|[-_.]bak$/i, 'backup extension'],
  ];
  const DATE_RE = /(^|[^0-9])(20\d{2})[-_]?(0[1-9]|1[0-2])[-_]?([0-2]\d|3[01])($|[^0-9])/;
  const ARCHIVE_EXT = /\.(zip|7z|rar|vpk|tar|gz)$/i;
  const backupItems = findings.backups;
  const skipForBackups = (d) => d.nested || d.insideNested || d.name === 'node_modules' || CACHE_DIRS.has(d.name) || d.name === '.build';
  function backupReason(name, isDir) {
    for (const [re, why] of BACKUP_RE) if (re.test(name)) return why;
    if (DATE_RE.test(name) && (isDir || ARCHIVE_EXT.test(name))) return 'dated snapshot';
    return null;
  }
  function pushBackup(rel, name, isDir, rec, why) {
    if (!strictScope(rel)) return;
    const trackedFiles = gs.trackedUnder(rel, isDir);
    const st = gs.state(rel, isDir);
    const refs = corpus.refs(name, isDir ? { after: dirAfter, key: 'dir', exclude: (p) => p.startsWith(rel + '/') }
      : { exclude: (p) => p === rel });
    const risk = refs.length ? 'KEEP' : 'REVIEW';
    backupItems.push({ category: 'backups', kind: why, path: rel + (isDir ? '/' : ''), paths: [rel], isDir, files: isDir ? rec.count : 1,
      size: rec.size, state: st, trackedFiles, regenerable: false, trackedRegenerable: false, risk,
      evidence: why + ' (' + st + (trackedFiles && isDir ? ', ' + trackedFiles + ' tracked' : '') + ')' +
        (refs.length ? '; referenced by ' + listRefs(refs) : '; not referenced by any repo file') });
  }
  const scan2 = (d) => {
    for (const s of d.subdirs) {
      if (skipForBackups(s) || !inScope(s.rel)) continue;
      const why = backupReason(s.name, true);
      if (why) { pushBackup(s.rel, s.name, true, s, why); continue; }
      scan2(s);
    }
    for (const f of d.files) {
      if (!inScope(f.rel)) continue;
      const why = backupReason(f.name, false);
      if (why) pushBackup(f.rel, f.name, false, f, why);
    }
  };
  scan2(fsx.dirs.get(''));
  ctx.dupCandidates = fsx.files.filter((f) => f.size > DUP_MIN_BYTES && !f.symlink && strictScope(f.rel) && !skipPathForDups(f.dir));
  function skipPathForDups(d) {
    for (let x = d; x; x = x.parent) if (skipForBackups(x)) return true;
    return false;
  }

  // ---------- 3. PowerShell inventory
  const topDirs = fsx.dirs.get('').subdirs.map((d) => d.name);
  const ps1Files = fsx.files.filter((f) => /\.ps1$/i.test(f.name) && !segs(f.rel).some((s) => REF_EXCLUDED_SEGMENTS.has(s)) && !f.dir.insideNested && !f.dir.nested
    && (gs.state(f.rel) !== 'ignored' || gs.tracked.has(f.rel)) && strictScope(f.rel));
  // tracked scripts deleted in the working tree are still tracked: list them too
  for (const p of gs.tracked) {
    if (/\.ps1$/i.test(p) && strictScope(p) && !fs.existsSync(path.join(root, p))) ps1Files.push({ rel: p, name: p.split('/').pop(), size: 0, mtime: null, deleted: true });
  }
  ctx.ps1Files = ps1Files;

  // ---------- 4/5 helpers computed asynchronously in main (git dates); keep sync parts here
  ctx.topDirs = topDirs;
  return { findings, notes, inScope, strictScope };
}

function listRefs(refs, max = 3) {
  if (!refs.length) return 'nothing';
  return refs.slice(0, max).map(code).join(', ') + (refs.length > max ? ' +' + (refs.length - max) + ' more' : '');
}

// ---------------------------------------------------------------- duplicates (hash > 100 KB)
async function findDuplicates(root, candidates) {
  const bySize = new Map();
  for (const f of candidates) { if (!bySize.has(f.size)) bySize.set(f.size, []); bySize.get(f.size).push(f); }
  const groups = [...bySize.values()].filter((g) => g.length > 1);
  const partial = async (f) => {
    const fd = await fs.promises.open(path.join(root, f.rel), 'r');
    try {
      const n = Math.min(65536, f.size);
      const a = Buffer.alloc(n), b = Buffer.alloc(n);
      await fd.read(a, 0, n, 0);
      await fd.read(b, 0, n, Math.max(0, f.size - n));
      return crypto.createHash('sha1').update(a).update(b).digest('hex');
    } finally { await fd.close(); }
  };
  const full = (f) => new Promise((resolve) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(path.join(root, f.rel), { highWaterMark: 1 << 20 }).on('data', (c) => h.update(c))
      .on('end', () => resolve(h.digest('hex'))).on('error', () => resolve(null));
  });
  const stage2 = [];
  await mapLimit(groups, 8, async (g) => {
    const keyed = new Map();
    for (const f of g) {
      let k;
      try { k = await partial(f); } catch { continue; }
      if (!keyed.has(k)) keyed.set(k, []);
      keyed.get(k).push(f);
    }
    for (const sub of keyed.values()) if (sub.length > 1) stage2.push(sub);
  });
  const out = [];
  await mapLimit(stage2, 4, async (g) => {
    const keyed = new Map();
    for (const f of g) {
      const k = await full(f);
      if (!k) continue;
      if (!keyed.has(k)) keyed.set(k, []);
      keyed.get(k).push(f);
    }
    for (const [hash, sub] of keyed) if (sub.length > 1) out.push({ hash, files: sub });
  });
  return out;
}

// ---------------------------------------------------------------- main analysis
async function analyze(opts) {
  const t0 = Date.now();
  const root = toPosix(path.resolve(opts.root || git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()));
  if (opts.scope) {
    opts.scope = toPosix(path.relative(root, path.resolve(root, opts.scope))).replace(/\/$/, '');
    if (opts.scope.startsWith('..')) throw new Error('--scope must be inside the repo');
    if (opts.scope === '') opts.scope = '';
  }
  const today = opts.today || isoDate(new Date());
  const cutoff = minusMonths(today, 3);
  const gs = loadGitState(root);
  const fsx = walk(root);
  const corpus = buildCorpus(root);
  const worktrees = [];
  try {
    let cur = null;
    for (const line of git(root, ['worktree', 'list', '--porcelain'], { quiet: true }).split(/\r?\n/)) {
      if (line.startsWith('worktree ')) { cur = { path: toPosix(path.resolve(line.slice(9))) }; worktrees.push(cur); }
      else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
      else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5, 12);
    }
  } catch { /* no worktrees */ }
  const ctx = { root, gs, fsx, corpus, opts, worktrees };
  const { findings, notes, strictScope } = classify(ctx);

  // duplicates
  const dups = await findDuplicates(root, ctx.dupCandidates);
  for (const g of dups) {
    const files = g.files.map((f) => f.rel).sort((a, b) => (gs.tracked.has(b) - gs.tracked.has(a)) || a.length - b.length || a.localeCompare(b));
    const size = g.files[0].size;
    const states = [...new Set(files.map((f) => gs.state(f)))];
    findings.backups.push({ category: 'backups', kind: 'duplicate', path: files[0], paths: files.slice(1), isDir: false, files: files.length - 1,
      size: size * (files.length - 1), state: states.join('/'), trackedFiles: files.filter((f) => gs.tracked.has(f)).length,
      regenerable: false, trackedRegenerable: false, risk: 'REVIEW', copies: files, hash: g.hash.slice(0, 12),
      evidence: files.length + ' byte-identical copies of ' + fmtBytes(size) + ' (sha256 ' + g.hash.slice(0, 12) + '); size column = bytes beyond the first copy; copies: ' + files.map(code).join(', ') });
  }
  findings.backups.sort((a, b) => b.size - a.size);

  const dateOf = (rel) => gitAsync(root, ['log', '-1', '--format=%cs', '--', rel]).then((s) => s.trim() || null);
  const mtimeDate = (ms) => isoDate(new Date(ms));

  // ---------- 3. PowerShell inventory
  const topDirSet = new Map(ctx.topDirs.map((n) => [lc(n), n]));
  const modFolders = detectModFolders(ctx);
  const modSet = new Set(modFolders.map(lc));
  const buildScriptFiles = corpus.paths.filter((p) => /\.ps1$/i.test(p) || /(^|\/)(build|compile|package|deploy)[^/]*\.(js|mjs|cjs|py)$/i.test(p)
    || /(^|\/)package\.json$/.test(p));
  const nodeHeaders = corpus.paths.filter((p) => /\.(js|mjs|cjs)$/.test(p) && !segs(p).includes('node_modules')).map((p) => ({ p, text: corpus.fileText(p) }));
  const mentionsDir = (text, l) => dirRefRe(l).test(text);
  const buildJs = nodeHeaders.filter((h) => /(^|\/)build[^/]*\.(c|m)?js$/.test(h.p) && !/\.test\./.test(h.p)).map((h) => {
    const deps = [...h.text.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)].map((m) => {
      const rel = toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(h.p), m[1])));
      return corpus.fileText(rel) ?? corpus.fileText(rel + '.js') ?? '';
    });
    return { p: h.p, text: h.text, deps };
  });
  const ps1Rows = await mapLimit(ctx.ps1Files, 8, async (f) => {
    let text = '';
    if (f.deleted) { try { text = git(root, ['show', 'HEAD:' + f.rel], { quiet: true }); } catch { text = ''; } }
    else text = fs.readFileSync(path.join(root, f.rel), 'utf8');
    const lines = text.length ? text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0) : 0;
    const committed = await dateOf(f.rel);
    const st = f.deleted ? 'deleted' : gs.state(f.rel);
    const changed = st === 'modified' || st === 'untracked' ? mtimeDate(f.mtime) : null;
    const activity = [committed, changed].filter(Boolean).sort().pop() || null;
    const status = activity && activity >= cutoff ? 'ACTIVE' : 'STALE';
    // what it builds
    const low = lc(text).replace(/\\/g, '/');
    const referenced = [];
    for (const [l, name] of topDirSet) {
      const hits = [...low.matchAll(dirRefRe(l))];
      if (!hits.length) continue;
      // a tool reference: every mention is a path into a compiler/tools subfolder (e.g. passive_items_mod/compiler/vpkeditcli.exe)
      const tails = hits.map((h) => /^[^'"\s`]*/.exec(low.slice(h.index + h[0].length))[0]);
      const tool = tails.every((t) => /^\/(compiler|tools?|bin)\//.test(t) || /\.exe$/.test(t));
      referenced.push({ name, l, index: hits[0].index, tool, mentions: hits.length });
    }
    const stem = lc(f.name.replace(/\.ps1$/i, '')).replace(/^(build|sync)[_-]/, '').replace(/-/g, '_');
    const inMod = segs(f.rel).length > 1 ? segs(f.rel)[0] : null;
    const mods = referenced.filter((r) => modSet.has(r.l) && !r.tool).sort((a, b) => b.mentions - a.mentions || a.index - b.index);
    let primary = null;
    const isHelper = segs(f.rel)[0] === 'scripts';
    if (isHelper) primary = null; // shared helper library: listed under "also references"
    else if (inMod && modSet.has(lc(inMod))) primary = inMod;
    else if (inMod && !modSet.has(lc(inMod))) primary = inMod;
    else {
      const exact = mods.find((r) => r.l === stem);
      const contained = mods.filter((r) => r.l.length >= 6 && stem.includes(r.l)).sort((a, b) => b.l.length - a.l.length)[0];
      primary = (exact || contained || mods[0] || {}).name || null;
    }
    // thin wrappers: a short script that runs "& (Join-Path $PSScriptRoot 'build_x.ps1') -Flag"
    const wraps = lines <= 40
      ? [...new Set([...low.matchAll(/&[^\n]*?([a-z0-9_\-]+\.ps1)/g)].map((m) => m[1]).filter((n) => n !== lc(f.name)))] : [];
    if (modSet.has(stem) && (!primary || wraps.length)) primary = topDirSet.get(stem);
    const otherMods = mods.map((r) => r.name).filter((n) => n !== primary);
    const outputs = referenced.filter((r) => /_compiled$|_build$/.test(r.l)).map((r) => r.name);
    const refs = corpus.refs(f.name, { exclude: (p) => p === f.rel });
    // node replacement
    const base = lc(f.name);
    // explicit port note anywhere in a JS file ("Node port of build_x.ps1", "replaces build_x.ps1")
    const portRe = /\b(node port|port of|ported from|replaces|replacement for|supersedes|node version of|rewrite of)\b/;
    const port = nodeHeaders.find((h) => {
      let i = h.text.indexOf(base);
      while (i !== -1) {
        if (portRe.test(h.text.slice(Math.max(0, i - 160), i + base.length + 40))) return true;
        i = h.text.indexOf(base, i + 1);
      }
      return false;
    });
    const calls = [...low.matchAll(/&\s*node\s+(?!--check|--test)[^\n]*?([a-z0-9_\-./]+\.(?:c|m)?js)/g)].map((m) => m[1].split('/').pop());
    let node = 'no';
    if (port) node = 'yes: ' + code(port.p) + ' says it ports/replaces this script';
    else if (primary && !inMod) {
      // a build-named JS that names the target folder (itself or via a local require one level deep)
      const cand = buildJs.filter((b) => mentionsDir(b.text, lc(primary)) || b.deps.some((t) => mentionsDir(t, lc(primary)))).map((b) => b.p);
      const own = cand.filter((p) => p.startsWith(primary + '/'));
      if (own.length) node = 'likely: ' + own.slice(0, 2).map(code).join(', ') + ' (build JS inside ' + primary + '/)';
      else if (cand.length) node = 'possible: ' + cand.slice(0, 2).map(code).join(', ') + ' names ' + primary + '/ (may only read it as an input)';
      else if (fs.existsSync(path.join(root, primary, 'package.json'))) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(root, primary, 'package.json'), 'utf8'));
          if (pkg.scripts && pkg.scripts.build) node = 'maybe: ' + code(primary + '/package.json') + ' build = ' + code(pkg.scripts.build);
        } catch { /* ignore */ }
      }
    }
    if (node === 'no' && calls.length) node = 'no (runs node helpers ' + [...new Set(calls)].slice(0, 3).map(code).join(', ') + ')';
    const risk = status === 'ACTIVE' || refs.length ? 'KEEP' : 'REVIEW';
    const evidence = [
      status === 'ACTIVE' ? 'activity ' + activity + ' >= ' + cutoff : 'last activity ' + (activity || 'never committed') + ' < ' + cutoff,
      refs.length ? 'referenced by ' + refs.length + ' file(s)' : 'no file references it',
      st !== 'tracked' ? 'working tree: ' + st : null,
    ].filter(Boolean).join('; ');
    return { category: 'ps1', path: f.rel, lines, lastCommit: committed, changed, state: st, status, builds: primary, alsoReferences: otherMods,
      outputs, wraps, referencedBy: refs, node, risk, evidence, size: f.size, files: 1 };
  });
  ps1Rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'ACTIVE' ? -1 : 1) || a.path.localeCompare(b.path));
  findings.ps1 = ps1Rows;

  // ---------- 4. mod folders
  // what follows a folder mention: "/compiler/x.exe" or "', 'compiler', 'x.exe'" means a tool use, not a build target
  const isToolTail = (t) => /^(['"`]?\/|['"`]\s*,\s*['"`])(compiler|tools?|bin)\b/.test(t) || /^[^'"\s`]*\.exe/.test(t);
  // passive_items_mod/compiler/vpkeditcli.exe is a tool use, not a build of the folder
  const buildRef = (text, l) => [...text.matchAll(dirRefRe(l))].some((h) => !isToolTail(text.slice(h.index + h[0].length, h.index + h[0].length + 80)));
  const buildScriptsReferencing = (name) => {
    const l = lc(name);
    const direct = buildScriptFiles.filter((p) => {
      if (p.startsWith(name + '/') && !/\.ps1$|(^|\/)build[^/]*$/i.test(p)) return false;
      return buildRef(corpus.fileText(p), l);
    });
    const viaDeps = buildJs.filter((b) => !direct.includes(b.p) && b.deps.some((t) => buildRef(t, l))).map((b) => b.p);
    return [...direct, ...viaDeps];
  };
  const modRows = await mapLimit(modFolders.filter((m) => strictScope(m) || (ctx.opts.scope || '').startsWith(m + '/')), 8, async (name) => {
    const d = fsx.dirs.get(name);
    const log = (await gitAsync(root, ['log', '--format=%cs%x09%h%x09%s', '--', name + '/'])).split(/\r?\n/).filter(Boolean)
      .map((l) => { const [date, hash, ...s] = l.split('\t'); return { date, hash, subject: s.join('\t') }; });
    const committed = log.length ? log[0].date : null;
    const dirty = [];
    const collect = (x) => {
      if (x.nested) return;
      for (const f of x.files) { const s = gs.state(f.rel); if (s === 'modified' || s === 'untracked') dirty.push(f); }
      for (const s of x.subdirs) if (!REF_EXCLUDED_SEGMENTS.has(s.name) || s.name === 'vendor') collect(s);
    };
    collect(d);
    for (const [p, xy] of gs.modified) if (p.startsWith(name + '/') && xy.includes('D')) dirty.push({ rel: p, mtime: null });
    const changed = dirty.filter((f) => f.mtime).map((f) => mtimeDate(f.mtime)).sort().pop() || null;
    const activity = [committed, changed].filter(Boolean).sort().pop() || null;
    const scripts = buildScriptsReferencing(name).filter((p) => !/(^|\/)package\.json$/.test(p) || p.startsWith(name + '/'));
    const base = detectBase(root, d, log);
    let status, ev = [];
    if (!activity) { status = 'UNKNOWN'; ev.push('no commit and no working-tree change found'); }
    else if (activity < cutoff) { status = 'STALE'; ev.push('last activity ' + activity + ' < ' + cutoff); }
    else if (base.version == null) { status = 'UNKNOWN'; ev.push('active (' + activity + ') but no base game build recorded'); }
    else if (base.version >= opts.latestBase) { status = 'ACTIVE-LATEST-BASE'; ev.push('active ' + activity + '; base ' + base.version + ' >= ' + opts.latestBase); }
    else { status = 'ACTIVE-OLD-BASE'; ev.push('active ' + activity + '; base ' + base.version + ' < ' + opts.latestBase); }
    if (base.evidence.length) ev.push(base.evidence.join('; '));
    ev.push(scripts.length ? 'built by ' + listRefs(scripts) : 'no build script references it');
    if (dirty.length) ev.push(dirty.length + ' uncommitted change(s)');
    return { category: 'mods', path: name + '/', name, lastCommit: committed, changed, activity, status, base: base.version, baseSource: base.source,
      buildScripts: scripts, files: d.count, size: d.size, state: gs.state(name, true), risk: status.startsWith('ACTIVE') ? 'KEEP' : 'REVIEW', evidence: ev.join('; ') };
  });
  modRows.sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name));
  findings.mods = modRows;

  // ---------- 5. root clutter
  const rootCovered = [];
  if (!opts.scope) {
    const rootEntries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of rootEntries) {
      const name = e.name, isDir = e.isDirectory();
      const l = lc(name);
      if (name === '.git') continue;
      if (isDir && modSet.has(l)) continue; // category 4
      if (!isDir && /^(build|sync)[_-].*\.ps1$/i.test(name)) continue; // build entry points (category 3)
      if (STANDARD_ROOT_FILES.has(l)) continue;
      if (isDir && (l === 'scripts' || l === 'tools')) continue;
      const rec = isDir ? fsx.dirs.get(name) : fsx.files.find((f) => f.rel === name);
      if (!rec) continue;
      // entries already itemised by category 1/2 (whole, or split into children like .tmp/) are not repeated here
      const itemised = [...findings.output, ...findings.backups].filter((i) => i.paths[0] === name
        || (/^temp/.test(i.kind) && segs(i.paths[0]).length === 2 && segs(i.paths[0])[0] === name));
      if (itemised.length) { rootCovered.push({ name: name + (isDir ? '/' : ''), categories: [...new Set(itemised.map((i) => i.category))] }); continue; }
      const st = gs.state(name, isDir);
      const trackedFiles = gs.trackedUnder(name, isDir);
      const kind = isDir ? (rec.nested ? 'nested checkout' : 'folder') : rootKind(name);
      const isNul = /^nul$/i.test(name);
      const refs = isNul ? [] : corpus.refs(name, { before: rootBefore, after: isDir ? dirAfter : defaultAfter, key: isDir ? 'root-dir' : 'root-file',
        exclude: (p) => p === name || p.startsWith(name + '/') || p === '.gitignore' || p === '.gitattributes' });
      const ev = [st + (isDir ? ', ' + rec.count + ' files' : '')];
      let risk;
      if (isDir && rec.nested) { risk = refs.length || gs.tracked.has(name) ? 'KEEP' : 'REVIEW'; ev.push(gs.tracked.has(name) ? 'git submodule (gitlink tracked)' : 'own .git (clone/worktree)'); }
      else if (['vpk', 'archive'].includes(kind)) { risk = 'REVIEW'; ev.push('loose ' + kind + ' at root (built/release artifact?)'); }
      else if (refs.length) risk = 'KEEP';
      else risk = 'REVIEW';
      if (isNul) ev.push('accidental Windows "> nul" redirect artefact (remove via the \\\\?\\ path prefix)');
      if (isDir && !modSet.has(l) && hasModContent(rec)) ev.push(st === 'ignored' ? 'gitignored mod-like folder' : 'mod-like content but not a tracked mod');
      if (isDir && INFRA_DIRS.has(l)) ev.push('repo infrastructure');
      if (l === '.worktrees' || worktrees.some((w) => lc(w.path).startsWith(lc(root + '/' + name + '/')))) ev.push('holds registered git worktree(s)');
      ev.push(refs.length ? 'referenced by ' + listRefs(refs) : 'no repo file references it');
      findings.root.push({ category: 'root', kind, path: name + (isDir ? '/' : ''), paths: [name], isDir, files: isDir ? rec.count : 1, size: rec.size,
        state: st, trackedFiles, regenerable: false, trackedRegenerable: false, risk, referencedBy: refs, evidence: ev.join('; ') });
    }
    findings.root.sort((a, b) => ({ REVIEW: 0, SAFE: 1, KEEP: 2 }[a.risk] - { REVIEW: 0, SAFE: 1, KEEP: 2 }[b.risk]) || b.size - a.size);
  }

  // ---------- 6. scripts/
  const scriptFiles = [...gs.tracked].filter((p) => p.startsWith('scripts/') && !p.startsWith('scripts/fixtures/')
    && /\.(js|mjs|cjs|ts|ps1|py|sh|bat|cmd)$/i.test(p) && strictScope(p) && fs.existsSync(path.join(root, p)));
  for (const p of scriptFiles.sort()) {
    const base = p.split('/').pop();
    const stem = base.replace(/\.[^.]+$/, '');
    const exclude = (q) => q === p;
    const byName = corpus.refs(base, { exclude });
    const byStem = corpus.refs(stem, { exclude, key: 'stem' });
    const refs = [...new Set([...byName, ...byStem])].sort();
    const isTest = /\.test\.[cm]?js$/.test(p);
    const st = gs.state(p);
    const ev = [];
    let risk;
    if (refs.length) { risk = 'KEEP'; ev.push('referenced by ' + listRefs(refs)); }
    else {
      risk = 'REVIEW';
      ev.push('no file requires, dot-sources or mentions ' + code(base) + ' or ' + code(stem));
      if (isTest) ev.push('test file: only runs if someone passes it to node --test');
    }
    if (st !== 'tracked') ev.push('working tree: ' + st);
    const f = fsx.files.find((x) => x.rel === p);
    findings.scripts.push({ category: 'scripts', kind: isTest ? 'test' : 'script', path: p, paths: [p], isDir: false, files: 1, size: f ? f.size : 0,
      state: st, trackedFiles: 1, regenerable: false, trackedRegenerable: false, risk, referencedBy: refs, evidence: ev.join('; ') });
  }
  findings.scripts.sort((a, b) => ({ REVIEW: 0, SAFE: 1, KEEP: 2 }[a.risk] - { REVIEW: 0, SAFE: 1, KEEP: 2 }[b.risk]) || a.path.localeCompare(b.path));

  // pin note
  const v3pin = path.join(root, 'hp_colors_rewrite_v3', 'game-data-pin.json');
  if (fs.existsSync(v3pin)) {
    try {
      const v = JSON.parse(fs.readFileSync(v3pin, 'utf8')).clientVersion;
      if (v !== opts.latestBase) notes.push('`hp_colors_rewrite_v3/game-data-pin.json` (read via `tools/game-data.js` `readPinned`) records clientVersion **' + v + '**, not the latest base used for classification (**' + opts.latestBase + '**, `--latest-base`).');
      else notes.push('Latest base ' + opts.latestBase + ' matches `hp_colors_rewrite_v3/game-data-pin.json`.');
    } catch { /* ignore */ }
  }
  const allLog = git(root, ['log', '--format=%cs%x09%h%x09%s']).split(/\r?\n/).filter(Boolean);
  let maxBuild = null;
  for (const l of allLog) {
    const [date, hash, ...s] = l.split('\t');
    const v = commitBuild(s.join('\t'));
    if (v && (!maxBuild || v > maxBuild.v)) maxBuild = { v, date, hash, subject: s.join('\t') };
  }
  if (maxBuild && maxBuild.v !== opts.latestBase) {
    notes.push('Highest game build named in any commit subject: **' + maxBuild.v + '** (' + maxBuild.hash + ' ' + maxBuild.date + ' "' + maxBuild.subject + '").');
  }
  return { root, scope: opts.scope || '', today, cutoff, latestBase: opts.latestBase, durationMs: Date.now() - t0, findings, notes,
    worktrees, rootCovered, corpusFiles: corpus.paths.length, scannedFiles: fsx.files.length };
}

function rootKind(name) {
  if (/\.vpk$/i.test(name)) return 'vpk';
  if (/\.(zip|7z|rar|tar|gz)$/i.test(name)) return 'archive';
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  if (/\.log$/i.test(name)) return 'log';
  if (/\.(txt|md)$/i.test(name)) return 'note';
  if (/\.(exe|dll|pdb)$/i.test(name)) return 'binary';
  if (/\.json$/i.test(name)) return 'config';
  return 'file';
}

function hasModContent(d, depth = 0) {
  if (depth > 3) return false;
  if (d.subdirs.some((s) => s.name === 'panorama')) return true;
  if (d.files.some((f) => /\.vdata$/i.test(f.name))) return true;
  return d.subdirs.some((s) => !s.nested && hasModContent(s, depth + 1));
}

function detectModFolders(ctx) {
  const { fsx, gs } = ctx;
  return fsx.dirs.get('').subdirs.filter((d) => {
    const l = lc(d.name);
    if (d.name.startsWith('.') || d.name.startsWith('_') || INFRA_DIRS.has(l) || d.nested) return false;
    if (/_(compiled|terser|closure)$/.test(l) || /release/.test(l)) return false;
    if (gs.state(d.name, true) === 'ignored') return false; // wholly ignored folders are root clutter
    return hasModContent(d);
  }).map((d) => d.name).sort();
}

// Game build named in a commit subject, e.g. "refresh VData to Deadlock build 6860", "rebase topbar on Deadlock 6728".
function commitBuild(subject) {
  const m = /\b(?:deadlock|game|client\s*version)\s+(?:build\s+)?(\d{4})\b|\b(?:to|for|on)\s+build\s+(\d{4})\b/i.exec(subject);
  const v = m ? Number(m[1] || m[2]) : null;
  return v && v >= 5000 && v <= 9999 ? v : null;
}

function detectBase(root, d, commits = []) {
  const evidence = [];
  let version = null, source = null;
  const pins = [], mentions = [];
  const visit = (x) => {
    if (x.nested) return;
    for (const f of x.files) {
      const n = lc(f.name);
      if (f.size > 1024 * 1024) continue;
      const isPin = /pin.*\.json$|-pin\.json$/.test(n) || /manifest.*\.json$/.test(n);
      const isInf = /^steam\.inf/.test(n);
      const isDoc = /\.(md|txt)$/.test(n);
      if (!isPin && !isInf && !isDoc) continue;
      let text;
      try { text = fs.readFileSync(path.join(root, f.rel), 'utf8'); } catch { continue; }
      if (isPin) {
        try {
          const j = JSON.parse(text);
          const v = j.clientVersion ?? j.ClientVersion ?? j.client_version ?? j.gameBuild;
          if (Number.isSafeInteger(Number(v)) && Number(v) > 0) pins.push({ v: Number(v), where: f.rel + ' clientVersion=' + v });
          else if (j.commit) pins.push({ v: null, where: f.rel + ' pins GameTracking commit ' + String(j.commit).slice(0, 7) + ' (no ClientVersion recorded)' });
          else if (j.release) pins.push({ v: null, where: f.rel + ' pins ' + j.release + ' (no ClientVersion recorded)' });
        } catch { /* not json */ }
      } else if (isInf) {
        const m = /^\s*ClientVersion\s*=\s*(\d+)/m.exec(text);
        if (m) pins.push({ v: Number(m[1]), where: f.rel + ' ClientVersion=' + m[1] });
      } else {
        const re = /\b(ClientVersion|client\s*version|game\s*build|patch|live|build)\b\s*[=:]?\s*(\d{4})\b/gi;
        let m;
        while ((m = re.exec(text))) {
          const v = Number(m[2]);
          if (v >= 5000 && v <= 9999) mentions.push({ v, where: f.rel + ':' + (text.slice(0, m.index).split('\n').length) + ' "' + m[0].replace(/\s+/g, ' ') + '"' });
        }
      }
    }
    for (const s of x.subdirs) if (!['node_modules', '.build', '.tmp', '.scratch'].includes(s.name) && !/_compiled$/.test(s.name)) visit(s);
  };
  visit(d);
  const numericPins = pins.filter((p) => p.v != null).sort((a, b) => b.v - a.v);
  const maxMention = mentions.sort((a, b) => b.v - a.v)[0];
  const commitHit = commits.map((c) => ({ ...c, v: commitBuild(c.subject) })).find((c) => c.v); // newest first
  const commitWhere = commitHit ? 'commit ' + commitHit.hash + ' ' + commitHit.date + ' "' + commitHit.subject + '"' : null;
  if (numericPins.length) {
    version = numericPins[0].v; source = 'pin';
    evidence.push('pinned: ' + numericPins.map((p) => code(p.where)).join(', '));
    if (commitHit && commitHit.v !== version) evidence.push('newest build-naming commit says ' + commitHit.v + ' (' + commitWhere + ')');
    if (maxMention && maxMention.v > version) evidence.push('docs mention newer ' + maxMention.v + ' at ' + code(maxMention.where) + ' (not a pin)');
  } else if (commitHit) {
    version = commitHit.v; source = 'commit';
    evidence.push('rebased per ' + commitWhere);
    if (maxMention && maxMention.v > version) evidence.push('docs mention newer ' + maxMention.v + ' at ' + code(maxMention.where));
  } else if (maxMention) {
    version = maxMention.v; source = 'doc';
    evidence.push('doc mention (weak): ' + code(maxMention.where));
  }
  for (const p of pins.filter((x) => x.v == null)) evidence.push(code(p.where));
  return { version, source, evidence };
}

// ---------------------------------------------------------------- report rendering
function summarize(items) {
  const s = { items: items.length, files: 0, size: 0, SAFE: { n: 0, size: 0 }, REVIEW: { n: 0, size: 0 }, KEEP: { n: 0, size: 0 } };
  for (const i of items) {
    s.files += i.files || 0;
    s.size += i.size || 0;
    const r = s[i.risk] || (s[i.risk] = { n: 0, size: 0 });
    r.n++; r.size += i.size || 0;
  }
  return s;
}

function renderMarkdown(r) {
  const F = r.findings;
  const out = [];
  out.push('# Repo clean report', '');
  out.push('- Repo: ' + code(r.root) + (r.scope ? '  scope: ' + code(r.scope) : ''));
  out.push('- Date: ' + r.today + '; ACTIVE window: on or after **' + r.cutoff + '** (3 months)');
  out.push('- Latest game base (ClientVersion): **' + r.latestBase + '**');
  out.push('- Scanned ' + r.scannedFiles + ' files on disk; reference corpus ' + r.corpusFiles + ' tracked/untracked text files (excl. `.build`, `.tmp`, `.scratch`, `node_modules`, `vendor`); took ' + (r.durationMs / 1000).toFixed(1) + ' s');
  out.push('- Mode: report-only. Nothing was deleted. `--apply --category <name>` deletes SAFE items only.');
  for (const n of r.notes) out.push('- Note: ' + n);
  out.push('', 'Risk: **SAFE** = untracked/ignored and regenerable; **REVIEW** = tracked or ambiguous; **KEEP** = referenced or active. Sizes of categories overlap (e.g. a backup inside `.tmp/`), so do not add rows across categories.', '');

  out.push('## Summary', '');
  const rows = CATEGORIES.map((c) => {
    const s = summarize(F[c.key]);
    return [c.id + '. ' + c.title + ' (`' + c.key + '`)', s.items, s.files, fmtBytes(s.size), s.SAFE.n + ' / ' + fmtBytes(s.SAFE.size),
      s.REVIEW.n + ' / ' + fmtBytes(s.REVIEW.size), s.KEEP.n];
  });
  out.push(mdTable(['Category', 'Items', 'Files', 'Size', 'SAFE (reclaimable)', 'REVIEW', 'KEEP'], rows), '');

  const riskTable = (items, kindKey = 'kind') => {
    const kinds = new Map();
    for (const i of items) {
      const k = i[kindKey] + '';
      if (!kinds.has(k)) kinds.set(k, []);
      kinds.get(k).push(i);
    }
    const rws = [...kinds].map(([k, list]) => { const s = summarize(list); return [k, s.items, s.files, fmtBytes(s.size), s.SAFE.n + ' / ' + fmtBytes(s.SAFE.size), s.REVIEW.n + ' / ' + fmtBytes(s.REVIEW.size), s.KEEP.n]; });
    const t = summarize(items);
    rws.push(['**Total**', t.items, t.files, fmtBytes(t.size), t.SAFE.n + ' / ' + fmtBytes(t.SAFE.size), t.REVIEW.n + ' / ' + fmtBytes(t.REVIEW.size), t.KEEP.n]);
    return mdTable(['Kind', 'Items', 'Files', 'Size', 'SAFE (reclaimable)', 'REVIEW', 'KEEP'], rws);
  };
  const detail = (items, cols, fn) => {
    const shown = items.slice(0, MAX_DETAIL_ROWS);
    const t = mdTable(cols, shown.map(fn));
    return t + (items.length > shown.length ? '\n\n_' + (items.length - shown.length) + ' more rows omitted; run with `--json` for all._' : '');
  };

  out.push('## 1. Regenerable untracked output', '', riskTable(F.output), '', '### Details', '');
  out.push(detail([...F.output].sort((a, b) => b.size - a.size), ['Risk', 'Path', 'Kind', 'Files', 'Size', 'State', 'Evidence'],
    (i) => [i.risk, code(i.path), i.kind, i.files, fmtBytes(i.size), i.state, i.evidence]), '');

  out.push('## 2. Backups and duplicates', '', riskTable(F.backups), '', '### Details', '');
  out.push(detail(F.backups, ['Risk', 'Path', 'Kind', 'Files', 'Size', 'State', 'Evidence'],
    (i) => [i.risk, code(i.path), i.kind, i.files, fmtBytes(i.size), i.state, i.evidence]), '');

  const ps = F.ps1;
  out.push('## 3. PowerShell inventory', '');
  const psCount = (pred) => ps.filter(pred).length;
  out.push(mdTable(['Status', 'Scripts', 'Lines', 'With Node replacement (yes/likely)', 'Unreferenced', 'Uncommitted'], ['ACTIVE', 'STALE'].map((s) => {
    const l = ps.filter((x) => x.status === s);
    return [s, l.length, l.reduce((a, x) => a + x.lines, 0), l.filter((x) => /^(yes|likely)/.test(x.node)).length, l.filter((x) => !x.referencedBy.length).length, l.filter((x) => x.state !== 'tracked').length];
  }).concat([['**Total**', ps.length, ps.reduce((a, x) => a + x.lines, 0), psCount((x) => /^(yes|likely)/.test(x.node)), psCount((x) => !x.referencedBy.length), psCount((x) => x.state !== 'tracked')]])), '');
  out.push('### Details', '');
  out.push(mdTable(['Status', 'Script', 'Last commit', 'Changed', 'Lines', 'Builds', 'Also references', 'Referenced by', 'Node replacement', 'Risk'],
    ps.map((x) => [x.status, code(x.path), x.lastCommit || '—', x.state === 'deleted' ? 'deleted in working tree' : x.changed ? x.state + ' ' + x.changed : '', x.lines,
      (x.builds ? code(x.builds) : x.path.startsWith('scripts/') ? '(shared helper)' : '—') + (x.wraps.length ? ' via ' + x.wraps.slice(0, 2).map(code).join(', ') : ''),
      x.alsoReferences.length ? x.alsoReferences.slice(0, 4).join(', ') + (x.alsoReferences.length > 4 ? ' +' + (x.alsoReferences.length - 4) : '') : '',
      x.referencedBy.length ? x.referencedBy.length + ': ' + listRefs(x.referencedBy) : 'none', x.node, x.risk])), '');

  out.push('## 4. Mod folders', '');
  const st = ['ACTIVE-LATEST-BASE', 'ACTIVE-OLD-BASE', 'STALE', 'UNKNOWN'];
  out.push(mdTable(['Status', 'Folders', 'Files', 'Size', 'With build script'], st.map((s) => {
    const l = F.mods.filter((m) => m.status === s);
    return [s, l.length, l.reduce((a, m) => a + m.files, 0), fmtBytes(l.reduce((a, m) => a + m.size, 0)), l.filter((m) => m.buildScripts.length).length];
  }).concat([['**Total**', F.mods.length, F.mods.reduce((a, m) => a + m.files, 0), fmtBytes(F.mods.reduce((a, m) => a + m.size, 0)), F.mods.filter((m) => m.buildScripts.length).length]])), '');
  out.push('### Details', '');
  out.push(mdTable(['Status', 'Folder', 'Last commit', 'Uncommitted change', 'Base', 'Build scripts', 'Size', 'Evidence'],
    F.mods.map((m) => [m.status, code(m.name), m.lastCommit || '—', m.changed || '', m.base ? m.base + ' (' + m.baseSource + ')' : '?',
      m.buildScripts.length ? listRefs(m.buildScripts, 2) : 'none', fmtBytes(m.size), m.evidence])), '');

  out.push('## 5. Root clutter', '');
  if (r.scope) out.push('_Skipped: `--scope` given._', '');
  else {
    const nonKeep = F.root.filter((i) => i.risk !== 'KEEP');
    out.push(riskTable(F.root), '', '### Details (REVIEW / SAFE)', '');
    out.push(detail(nonKeep, ['Risk', 'Entry', 'Kind', 'Files', 'Size', 'State', 'Evidence'],
      (i) => [i.risk, code(i.path), i.kind, i.files, fmtBytes(i.size), i.state, i.evidence]), '');
    const keep = F.root.filter((i) => i.risk === 'KEEP');
    out.push('KEEP (referenced): ' + (keep.length ? keep.map((i) => code(i.path) + ' (' + fmtBytes(i.size) + ')').join(', ') : 'none'), '');
    if (r.rootCovered.length) out.push('Already itemised in category 1/2 above (not repeated here): ' + r.rootCovered.map((c) => code(c.name)).join(', '), '');
    out.push('_Excluded from this category: mod folders (category 4), `build_*.ps1` / `sync_*.ps1` entry points (category 3), standard repo files (' + [...STANDARD_ROOT_FILES].join(', ') + '), `scripts/`, `tools/`._', '');
  }

  out.push('## 6. Unreferenced tracked scripts under scripts/', '', riskTable(F.scripts), '', '### Details', '');
  out.push(detail(F.scripts, ['Risk', 'Script', 'Kind', 'Size', 'Evidence'], (i) => [i.risk, code(i.path), i.kind, fmtBytes(i.size), i.evidence]), '');

  out.push('## Usage', '', '```', HELP.trim(), '```', '');
  return out.join('\n');
}

// ---------------------------------------------------------------- apply
function applyDeletions(r, opts) {
  const root = r.root;
  const log = { deleted: [], refused: [], skipped: [] };
  for (const key of opts.categories) {
    for (const item of r.findings[key] || []) {
      if (!item.paths) { log.skipped.push({ path: item.path, category: key, reason: 'not a deletable item' }); continue; }
      let allowed = item.risk === 'SAFE';
      let reason = '';
      if (!allowed && item.trackedRegenerable) {
        if (opts.includeTracked) allowed = true;
        else { log.refused.push({ path: item.path, category: key, reason: 'contains tracked files (pass --include-tracked)' }); continue; }
      }
      if (!allowed) { log.skipped.push({ path: item.path, category: key, reason: item.risk + ' is never deleted' }); continue; }
      for (const rel of item.paths) {
        const abs = path.resolve(root, rel);
        const relCheck = toPosix(path.relative(root, abs));
        if (!relCheck || relCheck.startsWith('..') || path.isAbsolute(relCheck) || segs(relCheck).includes('.git')) {
          log.refused.push({ path: rel, category: key, reason: 'outside repo or git internals' }); continue;
        }
        if (r.scope && !(relCheck === r.scope || relCheck.startsWith(r.scope + '/'))) { log.refused.push({ path: rel, category: key, reason: 'outside --scope' }); continue; }
        if (!fs.existsSync(abs)) { log.skipped.push({ path: rel, category: key, reason: 'already gone' }); continue; }
        // re-check tracked status right before deleting (defence in depth)
        let trackedNow = '';
        try { trackedNow = git(root, ['ls-files', '--', relCheck]).trim(); } catch { trackedNow = ''; }
        if (trackedNow && !opts.includeTracked) { log.refused.push({ path: rel, category: key, reason: 'tracked by git (pass --include-tracked)' }); continue; }
        if (fs.lstatSync(abs).isDirectory() && containsGitDir(abs)) { log.refused.push({ path: rel, category: key, reason: 'contains a .git checkout' }); continue; }
        fs.rmSync(abs, { recursive: true, force: true });
        log.deleted.push({ path: rel, category: key, reason: reason || item.evidence });
      }
    }
  }
  return log;
}
function containsGitDir(abs) {
  const stack = [abs];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.name === '.git') return true;
      if (e.isDirectory() && !e.isSymbolicLink()) stack.push(path.join(d, e.name));
    }
  }
  return false;
}

// ---------------------------------------------------------------- entry
async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { process.stderr.write('clean.js: ' + e.message + '\n'); return 2; }
  if (opts.help) { process.stdout.write(HELP); return 0; }
  if (opts.apply && !opts.categories) { process.stderr.write('clean.js: --apply requires --category <name,...>\n'); return 2; }
  if (!opts.apply && opts.categories) process.stderr.write('clean.js: --category only matters with --apply; reporting everything\n');
  if (!opts.apply && opts.includeTracked) process.stderr.write('clean.js: --include-tracked only matters with --apply\n');
  const r = await analyze(opts);
  if (opts.apply) {
    const log = applyDeletions(r, opts);
    if (opts.json) process.stdout.write(JSON.stringify({ apply: log, categories: opts.categories }, null, 2) + '\n');
    else {
      const lines = ['Applied categories: ' + opts.categories.join(', ') + (opts.includeTracked ? ' (including tracked)' : '')];
      for (const d of log.deleted) lines.push('DELETED  ' + d.path);
      for (const d of log.refused) lines.push('REFUSED  ' + d.path + '  -- ' + d.reason);
      for (const d of log.skipped) lines.push('SKIPPED  ' + d.path + '  -- ' + d.reason);
      lines.push(log.deleted.length + ' deleted, ' + log.refused.length + ' refused, ' + log.skipped.length + ' skipped');
      process.stdout.write(lines.join('\n') + '\n');
    }
    return log.refused.length ? 3 : 0;
  }
  process.stdout.write(opts.json ? JSON.stringify(r, null, 2) + '\n' : renderMarkdown(r));
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { process.stderr.write('clean.js: ' + (e.stack || e.message) + '\n'); process.exitCode = 1; });
}
module.exports = { main, analyze, parseArgs, minusMonths };
