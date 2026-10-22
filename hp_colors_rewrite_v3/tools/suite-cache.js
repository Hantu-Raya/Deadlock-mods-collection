'use strict';
// Pass cache for the staged v3 VM suite. The three build wrappers (canonical, QOLLOCK, ShowRank) each
// run the same v3 suite against the same staged v3 scripts; the suite is deterministic, so a pass for
// identical inputs is not rerun.
//   node tools/suite-cache.js --key <stageSource> <release|debug>   prints the input hash
// Inputs hashed (paths and bytes): the staged v3 tree, every v3 source file except .build/, the shared
// test adapter and pipeline scripts, the v3 build wrappers the tooling tests read, the repo ignore rules
// (audit-tooling runs git check-ignore), the local hpv2-store checkout's index.html and HEAD
// (store-page.test.js), every HPV3_* variable the suite's sources read, the Node version and the mode.
// Any change to any of them gives a new key. Not keyed: git's global excludes file, and the objects of
// the pinned hpv2-store commits (immutable by SHA). HPV3_SUITE_CACHE=0 disables the cache.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const v3 = path.resolve(__dirname, '..');
const repo = path.resolve(v3, '..');
const STORE = 'D:/hpv2-store'; // must match tests/store-page.test.js (audit-tooling checks it)
const UNKEYED_ENV = new Set(['HPV3_SOURCE_ROOT', 'HPV3_SUITE_CACHE']); // stage content is hashed instead

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

function key(stageSource, mode) {
  if (!['release', 'debug'].includes(mode)) throw new Error('mode must be release or debug');
  if (!fs.existsSync(stageSource)) throw new Error('stage source missing: ' + stageSource);
  const hash = crypto.createHash('sha256');
  // Staged files are keyed relative to the stage root, so every wrapper's stage of the same mode matches.
  const add = (label, file, base = repo) => { hash.update(label + '\0' + path.relative(base, file).replace(/\\/g, '/') + '\0'); hash.update(fs.readFileSync(file)); hash.update('\0'); };
  hash.update('node ' + process.version + '\0mode ' + mode + '\0');
  for (const file of files(path.resolve(stageSource))) add('stage', file, path.resolve(stageSource));
  for (const file of files(v3, (full, entry) => entry.isDirectory() && full === path.join(v3, '.build'))) add('v3', file);
  for (const name of ['hp-colors-panorama-test-adapter.js', 'hp-colors-v3-pipeline.ps1', 'source2_package_pipeline.ps1'])
    add('scripts', path.join(repo, 'scripts', name));
  for (const name of fs.readdirSync(repo).filter(name => /^build_hp_colors_rewrite_v3.*\.ps1$/.test(name)).sort())
    add('wrapper', path.join(repo, name));
  const external = [path.join(repo, '.gitignore'), path.join(repo, '.git', 'info', 'exclude'),
    path.join(STORE, 'index.html'), path.join(STORE, '.git', 'HEAD')];
  for (const file of external) {
    hash.update('external\0' + file.replace(/\\/g, '/') + '\0');
    hash.update(fs.existsSync(file) ? fs.readFileSync(file) : 'absent'); hash.update('\0');
  }
  for (const name of envNames()) hash.update('env\0' + name + '=' + (process.env[name] === undefined ? '\u0001unset' : process.env[name]) + '\0');
  return hash.digest('hex');
}

if (require.main === module) {
  const [flag, stageSource, mode] = process.argv.slice(2);
  if (flag !== '--key' || !stageSource || !mode) { console.error('usage: suite-cache.js --key <stageSource> <release|debug>'); process.exit(2); }
  try { process.stdout.write(key(stageSource, mode) + '\n'); }
  catch (error) { console.error(error.message); process.exit(2); }
}

module.exports = { key, envNames, STORE };
