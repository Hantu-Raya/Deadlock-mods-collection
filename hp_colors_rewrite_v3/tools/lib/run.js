'use strict';
// Running node --test, asking git what changed, and listing test files: shared by tools/test.js, budgets.js,
// timing.js and dev.js (via test.js).
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { REPO } = require('./projects');

const posix = p => p.split(path.sep).join('/').replace(/\\/g, '/');

// Sorted names in `dir` ending in `suffix`; [] when the folder is absent (a lane that is not checked out).
function listFiles(dir, suffix, fsx = fs) {
  try { return fsx.readdirSync(dir).filter(name => name.endsWith(suffix)).sort(); } catch { return []; }
}
const listTests = (dir, fsx = fs) => listFiles(dir, '.test.js', fsx);

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

module.exports = { posix, listFiles, listTests, runNodeTest, gitChanged, normalizeFile };
