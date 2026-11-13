'use strict';
// Hermetic tests for tools/clean.js: every test builds its own throwaway git repo under os.tmpdir().
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

const TOOL = path.join(__dirname, 'clean.js');
const TODAY = '2026-11-12'; // ACTIVE window starts 2026-08-12
const OLD = new Date('2026-01-01T00:00:00Z'); // mtime for untracked output, so the "touched in the last 7 days" guard stays quiet

// Hermetic git: no system config, and an empty global config file (the user's hooks/aliases/defaults never apply).
const EMPTY_GITCONFIG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clean-test-cfg-')), 'gitconfig');
fs.writeFileSync(EMPTY_GITCONFIG, '');
process.on('exit', () => fs.rmSync(path.dirname(EMPTY_GITCONFIG), { recursive: true, force: true }));

function git(root, args, date) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG };
  if (date) { env.GIT_AUTHOR_DATE = date + 'T12:00:00'; env.GIT_COMMITTER_DATE = date + 'T12:00:00'; }
  return childProcess.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'core.autocrlf=false', ...args],
    { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function write(root, rel, content, { old = false } = {}) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  if (old) fs.utimesSync(abs, OLD, OLD);
}
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

function makeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q', '-b', 'main']);
  // --- an old commit: stale mod, stale build script, scripts/
  write(root, '.gitignore', ['.build/', '*_compiled/', 'node_modules/', '*.log', '.tmp/', '*.vpk', ''].join('\n'));
  write(root, 'README.md', '# fixture\n');
  write(root, 'oldmod/panorama/layout/a.xml', '<root/>\n');
  write(root, 'build_oldmod.ps1', "$root = $PSScriptRoot\n$src = Join-Path $root 'oldmod'\n");
  write(root, 'scripts/used.js', 'module.exports = 1;\n');
  write(root, 'scripts/unused.js', '// nobody calls me\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'initial'], '2025-01-10');
  // --- a recent commit: three active mods with different base evidence
  write(root, 'newmod/panorama/layout/b.xml', '<root/>\n');
  write(root, 'newmod/panorama/layout/b.vxml_c', 'compiled');
  write(root, 'newmod/game-data-pin.json', JSON.stringify({ clientVersion: 6839 }));
  write(root, 'oldbase/panorama/layout/c.xml', '<root/>\n');
  write(root, 'oldbase/stock-pin.json', JSON.stringify({ clientVersion: 6800 }));
  write(root, 'nobase/panorama/layout/d.xml', '<root/>\n');
  write(root, 'build_newmod.ps1', [
    '$root = $PSScriptRoot',
    "$src = Join-Path $root 'newmod'",
    "$out = Join-Path $root 'newmod_compiled'",
    "& node (Join-Path $root 'scripts\\used.js')", ''].join('\n'));
  write(root, 'tooling/package.json', '{"name":"tooling"}\n');
  write(root, 'tooling/package-lock.json', '{}\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'add mods'], '2026-10-01');
  // a tracked file force-added inside an otherwise ignored, regenerable .build/
  write(root, 'tooling/.build/keep.txt', 'tracked on purpose\n');
  git(root, ['add', '-f', 'tooling/.build/keep.txt']);
  git(root, ['commit', '-q', '-m', 'track a build file'], '2026-10-02');

  // --- untracked / ignored clutter
  write(root, 'newmod/.build/out.txt', 'x'.repeat(1000), { old: true });
  write(root, 'newmod_compiled/panorama/layout/b.vxml_c', 'compiled', { old: true });
  write(root, 'tooling/node_modules/dep/index.js', 'module.exports = 2;\n', { old: true });
  write(root, 'build.log', 'build ok\n', { old: true });
  write(root, 'newmod/tests/fixtures/sample.log', 'fixture\n', { old: true });
  write(root, '.tmp/scratch.txt', 'tmp\n', { old: true });
  write(root, '.tmp/wt/.git/HEAD', 'ref: refs/heads/main\n', { old: true }); // a nested checkout inside .tmp/
  write(root, '.tmp/wt/file.txt', 'nested\n', { old: true });
  write(root, 'old-backup-2025/notes.txt', 'backup\n', { old: true });
  const big = Buffer.alloc(150 * 1024, 7);
  write(root, 'dupA/big.bin', big, { old: true });
  write(root, 'dupB/big.bin', big, { old: true });
  write(root, 'pak99_dir.vpk', 'vpk', { old: true });
  return root;
}

function run(root, args) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG };
  const r = childProcess.spawnSync(process.execPath, [TOOL, '--today', TODAY, ...args], { cwd: root, encoding: 'utf8', env });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const report = (root, extra = []) => {
  const r = run(root, ['--json', ...extra]);
  assert.equal(r.code, 0, r.err);
  return JSON.parse(r.out);
};
const find = (items, p) => items.find((i) => i.path === p || i.path === p + '/');

test('classifies every category with evidence and risk', (t) => {
  const root = makeRepo(t);
  const r = report(root);
  const out = r.findings.output;
  assert.equal(r.cutoff, '2026-08-12');

  assert.equal(find(out, 'newmod/.build').risk, 'SAFE');
  assert.equal(find(out, 'tooling/node_modules').risk, 'SAFE');
  assert.match(find(out, 'tooling/node_modules').evidence, /package\.json \+ package-lock\.json/);
  const compiled = find(out, 'newmod_compiled');
  assert.equal(compiled.risk, 'SAFE');
  assert.match(compiled.evidence, /build_newmod\.ps1/);
  assert.equal(find(out, 'build.log').risk, 'SAFE');
  assert.equal(find(out, 'newmod/tests/fixtures/sample.log').risk, 'REVIEW', 'fixture logs are never SAFE');
  const trackedBuild = find(out, 'tooling/.build');
  assert.equal(trackedBuild.risk, 'REVIEW');
  assert.equal(trackedBuild.trackedRegenerable, true);
  const trackedC = out.find((i) => i.path.startsWith('newmod/panorama/layout/*_c') && i.state === 'tracked');
  assert.equal(trackedC.risk, 'REVIEW');
  // .tmp/ is split: the nested checkout is held back, the rest is SAFE
  assert.equal(find(out, '.tmp/wt').risk, 'REVIEW');
  assert.match(find(out, '.tmp/wt').evidence, /nested git checkout/);
  const tmp = out.find((i) => i.kind === 'temp');
  assert.deepEqual(tmp.paths, ['.tmp/scratch.txt']);
  assert.equal(tmp.risk, 'SAFE');
  for (const i of out.filter((x) => x.risk === 'SAFE')) assert.equal(i.trackedFiles, 0, i.path + ' is SAFE but tracked');
  for (const i of out) assert.ok(i.evidence && i.evidence.length > 5, 'evidence for ' + i.path);

  const backups = r.findings.backups;
  assert.equal(find(backups, 'old-backup-2025').risk, 'REVIEW');
  const dup = backups.find((i) => i.kind === 'duplicate');
  assert.deepEqual([...dup.copies].sort(), ['dupA/big.bin', 'dupB/big.bin']);
  assert.equal(dup.risk, 'REVIEW');
  assert.ok(!backups.some((i) => i.risk === 'SAFE'), 'backups are never SAFE');

  const ps1 = Object.fromEntries(r.findings.ps1.map((p) => [p.path, p]));
  assert.equal(ps1['build_oldmod.ps1'].status, 'STALE');
  assert.equal(ps1['build_oldmod.ps1'].lastCommit, '2025-01-10');
  assert.equal(ps1['build_oldmod.ps1'].builds, 'oldmod');
  assert.equal(ps1['build_newmod.ps1'].status, 'ACTIVE');
  assert.equal(ps1['build_newmod.ps1'].builds, 'newmod');
  assert.equal(ps1['build_newmod.ps1'].lines, 4);

  const mods = Object.fromEntries(r.findings.mods.map((m) => [m.name, m]));
  assert.equal(mods.newmod.status, 'ACTIVE-LATEST-BASE');
  assert.equal(mods.newmod.base, 6839);
  assert.deepEqual(mods.newmod.buildScripts, ['build_newmod.ps1']);
  assert.equal(mods.oldbase.status, 'ACTIVE-OLD-BASE');
  assert.match(mods.oldbase.evidence, /stock-pin\.json clientVersion=6800/);
  assert.equal(mods.nobase.status, 'UNKNOWN');
  assert.equal(mods.oldmod.status, 'STALE');

  const scripts = Object.fromEntries(r.findings.scripts.map((s) => [s.path, s]));
  assert.equal(scripts['scripts/unused.js'].risk, 'REVIEW');
  assert.equal(scripts['scripts/used.js'].risk, 'KEEP');

  const vpk = find(r.findings.root, 'pak99_dir.vpk');
  assert.equal(vpk.risk, 'REVIEW');
  assert.equal(vpk.kind, 'vpk');
  assert.ok(!r.findings.root.some((i) => i.path === 'newmod/'), 'mod folders are category 4, not root clutter');
});

test('markdown report has a summary table and every category', (t) => {
  const root = makeRepo(t);
  const r = run(root, []);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^## Summary$/m);
  assert.match(r.out, /\| Category \| Items \| Files \| Size \| SAFE \(reclaimable\) \| REVIEW \| KEEP \|/);
  for (const h of ['## 1. Regenerable', '## 2. Backups', '## 3. PowerShell', '## 4. Mod folders', '## 5. Root clutter', '## 6. Unreferenced']) assert.ok(r.out.includes(h), h);
  assert.ok(exists(root, 'newmod/.build/out.txt'), 'report mode deletes nothing');
});

test('--apply deletes only SAFE items of the named category and refuses tracked files', (t) => {
  const root = makeRepo(t);
  const before = git(root, ['status', '--porcelain']);
  const r = run(root, ['--apply', '--category', 'output']);
  assert.equal(r.code, 3, 'non-zero when something was refused: ' + r.out + r.err);
  for (const gone of ['newmod/.build', 'newmod_compiled', 'tooling/node_modules', 'build.log', '.tmp/scratch.txt']) assert.ok(!exists(root, gone), gone + ' should be deleted');
  // REVIEW items and other categories untouched
  for (const kept of ['.tmp/wt/file.txt', 'newmod/tests/fixtures/sample.log', 'old-backup-2025/notes.txt', 'dupA/big.bin', 'dupB/big.bin', 'pak99_dir.vpk', 'scripts/unused.js']) assert.ok(exists(root, kept), kept + ' must survive');
  // tracked files refused without --include-tracked
  assert.ok(exists(root, 'tooling/.build/keep.txt'));
  assert.ok(exists(root, 'newmod/panorama/layout/b.vxml_c'));
  assert.match(r.out, /REFUSED\s+tooling\/\.build .*--include-tracked/);
  assert.equal(git(root, ['status', '--porcelain']), before, 'tracked files and git status unchanged');
  assert.equal(git(root, ['ls-files', '--deleted']), '');
});

test('--include-tracked lets --apply remove regenerable tracked output', (t) => {
  const root = makeRepo(t);
  const r = run(root, ['--apply', '--category', 'output', '--include-tracked']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.ok(!exists(root, 'tooling/.build/keep.txt'));
  assert.ok(!exists(root, 'newmod/panorama/layout/b.vxml_c'));
  assert.ok(exists(root, 'tooling/package.json'), 'non-output tracked files stay');
  assert.ok(exists(root, '.tmp/wt/file.txt'), 'nested checkout is never deleted');
  assert.match(git(root, ['ls-files', '--deleted']), /tooling\/\.build\/keep\.txt/);
});

test('--apply on categories without SAFE items deletes nothing', (t) => {
  const root = makeRepo(t);
  const r = run(root, ['--apply', '--category', 'backups,root,scripts,ps1,mods']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^0 deleted/m);
  for (const kept of ['old-backup-2025/notes.txt', 'dupA/big.bin', 'pak99_dir.vpk', 'scripts/unused.js', 'build_oldmod.ps1', 'oldmod/panorama/layout/a.xml']) assert.ok(exists(root, kept), kept);
});

test('--scope limits findings to one folder', (t) => {
  const root = makeRepo(t);
  const r = report(root, ['--scope', 'newmod']);
  assert.ok(r.findings.output.length > 0);
  for (const i of r.findings.output) assert.ok(i.path.startsWith('newmod/'), i.path);
  assert.deepEqual(r.findings.mods.map((m) => m.name), ['newmod']);
  assert.equal(r.findings.root.length, 0);
});

test('argument handling', (t) => {
  const root = makeRepo(t);
  const help = run(root, ['--help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /--apply --category/);
  assert.equal(run(root, ['--apply']).code, 2, '--apply needs --category');
  assert.equal(run(root, ['--apply', '--category', 'nope']).code, 2);
  assert.equal(run(root, ['--bogus']).code, 2);
  assert.ok(exists(root, 'newmod/.build/out.txt'));
});
