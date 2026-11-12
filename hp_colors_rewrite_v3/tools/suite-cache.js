'use strict';
// Pass cache for the staged v3 VM suite. The three lane builds of tools/build.js (canonical, QOLLOCK, ShowRank) each
// run the same v3 suite against the same staged v3 scripts; the suite is deterministic, so a pass for
// identical inputs is not rerun.
//   node tools/suite-cache.js --key <stageSource> <release|debug>   prints the input hash
// Inputs hashed (paths and bytes): the staged v3 tree, every v3 source file except .build/ (this includes
// tools/build.js and tools/lib, which the tooling tests read), the shared test adapter, the repo ignore rules
// (audit-tooling runs git check-ignore), the local hpv2-store checkout's index.html and HEAD, the blobs that
// `main:index.html` and `$HPV3_STORE_REF:index.html` resolve to (store-page.test.js reads them through git, and
// a branch can move without the worktree changing), every HPV3_* variable the suite's sources read, the Node
// version and the mode.
// Any change to any of them gives a new key. Not keyed: git's global excludes file, and the objects of
// the pinned hpv2-store commits (immutable by SHA). HPV3_SUITE_CACHE=0 disables the cache.
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const v3 = path.resolve(__dirname, '..');
const repo = path.resolve(v3, '..');
const STORE = 'D:/hpv2-store'; // must match tests/store-page.test.js (audit-tooling checks it)
// The one place that names the cache switch, the .build folder and the pass-marker folder/format (tools/build.js writes
// markers, tools/timing.js reads them). Never read these through `process.env.HPV3_*` here: envNames() keys such reads.
const SUITE_CACHE_ENV = 'HPV3_SUITE_CACHE';
const BUILD_DIR = '.build';
const PASS_DIR = 'suite-pass';
const UNKEYED_ENV = new Set(['HPV3_SOURCE_ROOT', SUITE_CACHE_ENV]); // stage content is hashed instead

// HPV3_SUITE_CACHE=0 always runs the suite.
const cacheEnabled = env => env[SUITE_CACHE_ENV] !== '0';
const passDir = v3Dir => path.join(v3Dir, BUILD_DIR, PASS_DIR);

// Get-Date -Format o in local time (build.js writes it, timing.js parses it back).
function isoLocal(ms) {
  const d = new Date(ms);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}0000${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

// Get-Date -Format o (7 fractional digits, offset) -> ms.
function parseIso(text) {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)?/.exec(String(text).trim());
  if (!match) return null;
  const ms = Date.parse(match[1] + '.' + (match[2] || '0').padEnd(3, '0').slice(0, 3) + (match[3] || ''));
  return Number.isFinite(ms) ? ms : null;
}

// A pass marker's text: "<iso> <mode> <staged source path>"; parsePass is its reader.
const passLine = (ms, mode, stageSource) => `${isoLocal(ms)} ${mode} ${stageSource}`;
function parsePass(text) {
  const match = /^(\S+)\s+(debug|release)\s+(.+)$/.exec(String(text).replace(/^\ufeff/, '').trim());
  return match ? { at: parseIso(match[1]), mode: match[2], stage: match[3] } : null;
}

function files(dir, skip) {
  const out = [];
  (function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (skip && skip(full, entry)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  })(dir);
  return out;
}

// HPV3_* variables read by the suite, its tools and the shared adapter, found by scanning their sources.
function envNames() {
  const sources = [...files(path.join(v3, 'tests')), ...files(path.join(v3, 'tools')), path.join(repo, 'scripts', 'hp-colors-panorama-test-adapter.js')];
  const names = new Set();
  for (const file of sources) if (/\.js$/.test(file) && fs.existsSync(file))
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/process\.env\.(HPV3_[A-Z0-9_]+)/g)) if (!UNKEYED_ENV.has(match[1])) names.add(match[1]);
  return [...names].sort();
}

// Blob id of each git expression store-page.test.js reads, or a marker; no git spawn without a checkout.
function storeRefs() {
  if (!fs.existsSync(STORE)) return 'checkout-absent';
  const expressions = ['main:index.html'];
  if (process.env.HPV3_STORE_REF) expressions.push(process.env.HPV3_STORE_REF + ':index.html');
  return expressions.map(expression => {
    try { return expression + '=' + execFileSync('git', ['-C', STORE, 'rev-parse', '--verify', '--end-of-options', expression], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch (error) { return expression + '=unresolved'; }
  }).join('\n');
}

function key(stageSource, mode) {
  if (!['release', 'debug'].includes(mode)) throw new Error('mode must be release or debug');
  if (!fs.existsSync(stageSource)) throw new Error('stage source missing: ' + stageSource);
  const hash = crypto.createHash('sha256');
  // Staged files are keyed relative to the stage root, so every lane's stage of the same mode matches.
  const add = (label, file, base = repo) => { hash.update(label + '\0' + path.relative(base, file).replace(/\\/g, '/') + '\0'); hash.update(fs.readFileSync(file)); hash.update('\0'); };
  hash.update('node ' + process.version + '\0mode ' + mode + '\0');
  for (const file of files(path.resolve(stageSource))) add('stage', file, path.resolve(stageSource));
  for (const file of files(v3, (full, entry) => entry.isDirectory() && full === path.join(v3, BUILD_DIR))) add('v3', file);
  add('scripts', path.join(repo, 'scripts', 'hp-colors-panorama-test-adapter.js'));
  const external = [path.join(repo, '.gitignore'), path.join(repo, '.git', 'info', 'exclude'),
    path.join(STORE, 'index.html'), path.join(STORE, '.git', 'HEAD')];
  for (const file of external) {
    hash.update('external\0' + file.replace(/\\/g, '/') + '\0');
    hash.update(fs.existsSync(file) ? fs.readFileSync(file) : 'absent'); hash.update('\0');
  }
  hash.update('store-refs\0' + storeRefs() + '\0');
  for (const name of envNames()) hash.update('env\0' + name + '=' + (process.env[name] === undefined ? '\u0001unset' : process.env[name]) + '\0');
  return hash.digest('hex');
}

if (require.main === module) {
  const [flag, stageSource, mode] = process.argv.slice(2);
  if (flag !== '--key' || !stageSource || !mode) { console.error('usage: suite-cache.js --key <stageSource> <release|debug>'); process.exit(2); }
  try { process.stdout.write(key(stageSource, mode) + '\n'); }
  catch (error) { console.error(error.message); process.exit(2); }
}

module.exports = { key, envNames, storeRefs, STORE, SUITE_CACHE_ENV, BUILD_DIR, PASS_DIR, cacheEnabled, passDir, isoLocal, parseIso, passLine, parsePass };
