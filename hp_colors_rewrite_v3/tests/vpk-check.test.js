'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const vpkCheck = require('../tools/vpk-check');
const { PROJECT_NAMES } = require('../tools/lib/projects');
const { projectTarget, VpkError, readVpk, parseVpk, entryData, crc32, run } = vpkCheck;

const cli = path.resolve(__dirname, '../tools/vpk-check.js');

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-vpk-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function cmd(...args) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); }

const md5 = (b) => crypto.createHash('md5').update(b).digest();
const cstr = (s) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);

// Writes a synthetic VPK. files: [{ path, data: Buffer, preload?: n (leading bytes stored inline in the tree),
// archive?: 'dir' | number }]. Entries with archive N go into `<base>_NNN.vpk` next to the dir file.
function writeVpk(file, files, { version = 2 } = {}) {
  const groups = new Map();
  for (const f of files) {
    const dir = path.posix.dirname(f.path) === '.' ? ' ' : path.posix.dirname(f.path);
    const base = path.posix.basename(f.path);
    const dot = base.lastIndexOf('.');
    const ext = dot > 0 ? base.slice(dot + 1) : ' ';
    const name = dot > 0 ? base.slice(0, dot) : base;
    if (!groups.has(ext)) groups.set(ext, new Map());
    const dirs = groups.get(ext);
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push({ ...f, name });
  }
  const tree = [];
  const dirData = [];
  let dirOffset = 0;
  const archives = new Map();
  for (const [ext, dirs] of groups) {
    tree.push(cstr(ext));
    for (const [dir, entries] of dirs) {
      tree.push(cstr(dir));
      for (const f of entries) {
        tree.push(cstr(f.name));
        const preloadBytes = f.preload || 0;
        const rest = f.data.subarray(preloadBytes);
        let archiveIndex = 0x7fff;
        let offset = 0;
        if (f.archive === undefined || f.archive === 'dir') {
          offset = rest.length ? dirOffset : 0;
          if (rest.length) { dirData.push(rest); dirOffset += rest.length; }
        } else {
          archiveIndex = f.archive;
          const parts = archives.get(archiveIndex) || [];
          offset = parts.reduce((n, p) => n + p.length, 0);
          parts.push(rest);
          archives.set(archiveIndex, parts);
        }
        const fixed = Buffer.alloc(18);
        fixed.writeUInt32LE(f.crc ?? crc32(f.data), 0);
        fixed.writeUInt16LE(preloadBytes, 4);
        fixed.writeUInt16LE(archiveIndex, 6);
        fixed.writeUInt32LE(offset, 8);
        fixed.writeUInt32LE(rest.length, 12);
        fixed.writeUInt16LE(0xffff, 16);
        tree.push(fixed, f.data.subarray(0, preloadBytes));
      }
      tree.push(cstr(''));
    }
    tree.push(cstr(''));
  }
  tree.push(cstr(''));
  const treeBytes = Buffer.concat(tree);
  const data = Buffer.concat(dirData);
  let out;
  if (version === 1) {
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x55aa1234, 0); header.writeUInt32LE(1, 4); header.writeUInt32LE(treeBytes.length, 8);
    out = Buffer.concat([header, treeBytes, data]);
  } else {
    const header = Buffer.alloc(28);
    header.writeUInt32LE(0x55aa1234, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(treeBytes.length, 8);
    header.writeUInt32LE(data.length, 12); header.writeUInt32LE(0, 16); header.writeUInt32LE(48, 20); header.writeUInt32LE(0, 24);
    const head = Buffer.concat([header, treeBytes, data, md5(treeBytes), md5(Buffer.alloc(0))]);
    out = Buffer.concat([head, md5(head)]);
  }
  fs.writeFileSync(file, out);
  for (const [index, parts] of archives) {
    fs.writeFileSync(file.replace(/_dir\.vpk$/, `_${String(index).padStart(3, '0')}.vpk`), Buffer.concat(parts));
  }
  return out;
}

const RENDERER = Buffer.from('\0\0VJS\0header bytes HPColorsV3HPPercent .rest of the compiled script\0', 'latin1');
const MENU = Buffer.concat([Buffer.from('<root>', 'latin1'), Buffer.from('WideIdHere', 'utf16le'), Buffer.from('</root>', 'latin1')]);
const SPLIT = Buffer.from('preload-part|SpanningNeedle|tail-in-data-section', 'latin1');
const PRELOAD_ONLY = Buffer.from('entirely inline PreloadOnlyMarker', 'latin1');
const ROOT_FILE = Buffer.from('root level file, no directory', 'latin1');
const NO_EXT = Buffer.from('no extension', 'latin1');
const EXTERNAL = Buffer.from('stored in archive zero ExternalMarker', 'latin1');
const EMPTY = Buffer.alloc(0);

function sample(dir, name = 'pak02_dir.vpk', extra = []) {
  const file = path.join(dir, name);
  const files = [
    { path: 'panorama/scripts/hp_colors_v3_renderer.vjs_c', data: RENDERER },
    { path: 'panorama/layout/hud_escape_menu.vxml_c', data: MENU },
    // preload covers 'preload-part|Spann', so the needle spans the preload/data boundary
    { path: 'panorama/scripts/split.vjs_c', data: SPLIT, preload: 18 },
    { path: 'panorama/styles/inline.vcss_c', data: PRELOAD_ONLY, preload: PRELOAD_ONLY.length },
    { path: 'readme.txt', data: ROOT_FILE },
    { path: 'panorama/LICENSE', data: NO_EXT },
    { path: 'panorama/empty.vjs_c', data: EMPTY },
    ...extra,
  ];
  const bytes = writeVpk(file, files);
  return { file, bytes, files };
}

test('reads the v2 header, tree, dir-embedded data and preload bytes', (t) => {
  const { file, files } = sample(temporary(t));
  const vpk = readVpk(file);
  assert.equal(vpk.version, 2);
  assert.deepEqual(vpk.entries.map((e) => e.path), files.map((f) => f.path).sort());
  for (const f of files) {
    const entry = vpk.entries.find((e) => e.path === f.path);
    assert.equal(entry.archiveIndex, 0x7fff, f.path);
    assert.equal(entry.size, f.data.length, f.path);
    assert.equal(entry.preloadBytes, f.preload || 0, f.path);
    assert.equal(entry.crc, crc32(f.data), f.path);
    assert.deepEqual(entryData(vpk, entry), f.data, f.path);
  }
  const inline = vpk.entries.find((e) => e.path === 'panorama/styles/inline.vcss_c');
  assert.equal(inline.length, 0, 'a fully preloaded entry has no data-section bytes');
  assert.deepEqual(vpk.md5, { tree: true, archiveMd5Section: true, wholeFile: true, ok: true });
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('reads v1 files and entries in numbered archives', (t) => {
  const dir = temporary(t);
  const file = path.join(dir, 'pak01_dir.vpk');
  writeVpk(file, [
    { path: 'a/b.txt', data: ROOT_FILE, preload: 4 },
    { path: 'a/external.bin', data: EXTERNAL, preload: 3, archive: 0 },
    { path: 'a/external2.bin', data: SPLIT, archive: 0 },
  ], { version: 1 });
  const vpk = readVpk(file);
  assert.equal(vpk.version, 1);
  assert.equal(vpk.md5, null);
  assert.deepEqual(entryData(vpk, vpk.entries.find((e) => e.path === 'a/b.txt')), ROOT_FILE);
  assert.deepEqual(entryData(vpk, vpk.entries.find((e) => e.path === 'a/external.bin')), EXTERNAL);
  assert.deepEqual(entryData(vpk, vpk.entries.find((e) => e.path === 'a/external2.bin')), SPLIT);
  const has = run(['has', file, 'ExternalMarker']);
  assert.equal(has.code, 0, has.stderr);
  assert.match(has.stdout, /a\/external\.bin/);
  const hash = JSON.parse(run(['hash', file, '--json']).stdout);
  assert.equal(hash.archives.length, 1);
  assert.equal(hash.archives[0].sha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'pak01_000.vpk'))).digest('hex'));

  fs.rmSync(path.join(dir, 'pak01_000.vpk'));
  const missing = run(['list', file]);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /cannot open archive .*pak01_000\.vpk/);
});

test('list prints paths, sizes and CRCs, and flags a CRC mismatch', (t) => {
  const dir = temporary(t);
  const { file } = sample(dir, 'pak02_dir.vpk', [{ path: 'bad/crc.bin', data: Buffer.from('payload'), crc: 0x12345678 }]);
  const text = cmd('list', file);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /VPK v2, 8 files/);
  assert.match(text.stdout, new RegExp(`${crc32(RENDERER).toString(16).padStart(8, '0')}\\s+${RENDERER.length}  panorama/scripts/hp_colors_v3_renderer\\.vjs_c`));
  assert.match(text.stdout, /panorama\/scripts\/split\.vjs_c  \[preload 18\]/);
  assert.match(text.stdout, /12345678\s+7  bad\/crc\.bin  \[CRC MISMATCH\]/);

  const json = JSON.parse(cmd('list', file, '--json').stdout);
  assert.equal(json.files.length, 8);
  const split = json.files.find((f) => f.path === 'panorama/scripts/split.vjs_c');
  assert.deepEqual({ size: split.size, preloadBytes: split.preloadBytes, length: split.length, archive: split.archive, crcOk: split.crcOk },
    { size: SPLIT.length, preloadBytes: 18, length: SPLIT.length - 18, archive: 'dir', crcOk: true });
  assert.equal(json.files.find((f) => f.path === 'bad/crc.bin').crcOk, false);
});

test('has searches whole entries in latin1 and UTF-16LE and exits 1 on a missing needle', (t) => {
  const { file } = sample(temporary(t));
  const ok = cmd('has', file, 'HPColorsV3HPPercent', 'WideIdHere', 'SpanningNeedle', 'PreloadOnlyMarker');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const json = JSON.parse(cmd('has', file, 'HPColorsV3HPPercent', 'WideIdHere', 'SpanningNeedle', 'PreloadOnlyMarker', 'Absent', '--json').stdout);
  const by = Object.fromEntries(json.needles.map((n) => [n.needle, n]));
  assert.deepEqual(by.HPColorsV3HPPercent.files, [{ path: 'panorama/scripts/hp_colors_v3_renderer.vjs_c', encodings: ['latin1'] }]);
  assert.deepEqual(by.WideIdHere.files, [{ path: 'panorama/layout/hud_escape_menu.vxml_c', encodings: ['utf16le'] }]);
  assert.deepEqual(by.SpanningNeedle.files.map((f) => f.path), ['panorama/scripts/split.vjs_c']);
  assert.deepEqual(by.PreloadOnlyMarker.files.map((f) => f.path), ['panorama/styles/inline.vcss_c']);
  assert.equal(by.Absent.found, false);
  assert.deepEqual(json.missing, ['Absent']);

  const missing = cmd('has', file, 'HPColorsV3HPPercent', 'Absent');
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /present\s+HPColorsV3HPPercent/);
  assert.match(missing.stdout, /MISSING\s+Absent/);
});

test('diff reports added, removed and changed entries by CRC and size', (t) => {
  const dir = temporary(t);
  const a = path.join(dir, 'a_dir.vpk');
  const b = path.join(dir, 'b_dir.vpk');
  writeVpk(a, [
    { path: 'p/same.txt', data: Buffer.from('same') },
    { path: 'p/changed.txt', data: Buffer.from('before') },
    { path: 'p/resized.txt', data: Buffer.from('abc'), preload: 2 },
    { path: 'p/gone.txt', data: Buffer.from('gone') },
  ]);
  writeVpk(b, [
    { path: 'p/same.txt', data: Buffer.from('same'), preload: 4 },
    { path: 'p/changed.txt', data: Buffer.from('after!') },
    { path: 'p/resized.txt', data: Buffer.from('abcd') },
    { path: 'p/new.txt', data: Buffer.from('new') },
  ]);
  const json = JSON.parse(cmd('diff', a, b, '--json').stdout);
  assert.deepEqual(json.added.map((f) => f.path), ['p/new.txt']);
  assert.deepEqual(json.removed.map((f) => f.path), ['p/gone.txt']);
  assert.deepEqual(json.changed.map((f) => f.path), ['p/changed.txt', 'p/resized.txt']);
  assert.deepEqual(json.changed[1].a.size, 3);
  assert.deepEqual(json.changed[1].b.size, 4);
  assert.equal(json.unchanged, 1, 'moving bytes into preload does not change a file');
  assert.equal(json.identical, false);
  const text = cmd('diff', a, b);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /\+ p\/new\.txt/);
  assert.match(text.stdout, /- p\/gone\.txt/);
  assert.match(text.stdout, /~ p\/changed\.txt  \(6 -> 6 bytes/);
  assert.match(text.stdout, /1 added, 1 removed, 2 changed, 1 unchanged/);
  assert.match(cmd('diff', a, a).stdout, /identical \(4 files\)/);
});

test('hash prints the sha256 and its 8-char short form', (t) => {
  const { file, bytes } = sample(temporary(t));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const text = cmd('hash', file);
  assert.equal(text.status, 0, text.stderr);
  assert.ok(text.stdout.startsWith(`${sha.slice(0, 8)}  sha256 ${sha}  `), text.stdout);
  assert.match(text.stdout, /MD5 sections ok/);
  const json = JSON.parse(cmd('hash', file, '--json').stdout);
  assert.equal(json.sha256, sha);
  assert.equal(json.short, sha.slice(0, 8));
  assert.equal(json.files, 7);
  assert.deepEqual(json.archives, []);
});

test('tampered data fails the v2 whole-file MD5 but still lists', (t) => {
  const { file, bytes } = sample(temporary(t));
  const tampered = Buffer.from(bytes);
  const at = tampered.indexOf(Buffer.from('rest of the compiled', 'latin1'));
  tampered[at] ^= 0x20;
  fs.writeFileSync(file, tampered);
  const vpk = readVpk(file);
  assert.deepEqual(vpk.md5, { tree: true, archiveMd5Section: true, wholeFile: false, ok: false });
  const text = cmd('list', file);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /MD5 MISMATCH \(tree ok, archive-md5 ok, whole-file bad\)/);
  assert.match(text.stdout, /hp_colors_v3_renderer\.vjs_c  \[CRC MISMATCH\]/);
});

test('malformed files are reported, not crashed on', (t) => {
  const dir = temporary(t);
  const { bytes } = sample(dir);
  const expect = (name, buffer, pattern) => {
    assert.throws(() => parseVpk(buffer, name), (error) => error instanceof VpkError && pattern.test(error.message), name);
    const file = path.join(dir, name);
    fs.writeFileSync(file, buffer);
    for (const args of [['list', file], ['hash', file], ['has', file, 'x']]) {
      const r = cmd(...args);
      assert.equal(r.status, 2, `${args[0]} ${name}: ${r.stderr}`);
      assert.match(r.stderr, pattern);
      assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
    }
    const json = cmd('list', file, '--json');
    assert.equal(json.status, 2);
    assert.match(JSON.parse(json.stdout).error, pattern);
  };
  const badSig = Buffer.from(bytes); badSig.writeUInt32LE(0xdeadbeef, 0);
  expect('sig_dir.vpk', badSig, /not a VPK: signature 0xdeadbeef/);
  const badVersion = Buffer.from(bytes); badVersion.writeUInt32LE(3, 4);
  expect('ver_dir.vpk', badVersion, /unsupported VPK version 3/);
  const terminatorAt = bytes.indexOf(Buffer.from([0xff, 0xff]));
  const badTerminator = Buffer.from(bytes); badTerminator[terminatorAt] = 0;
  expect('term_dir.vpk', badTerminator, /bad entry terminator/);
  expect('trunc_dir.vpk', bytes.subarray(0, 60), /runs past end of file/);
  expect('tiny_dir.vpk', Buffer.from([0x34, 0x12]), /too short/);
  const r = cmd('list', path.join(dir, 'absent_dir.vpk'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no such file/);
});

test('--project resolves the shared release paks and reports unbuilt ones', (t) => {
  const root = temporary(t);
  assert.deepEqual(PROJECT_NAMES, ['v3', 'qollock', 'showrank']);
  const lanes = { v3: 'hp_colors_rewrite_v3', qollock: 'hp_colors_rewrite_v3_qollock', showrank: 'hp_colors_rewrite_v3_showrank' };
  for (const name of PROJECT_NAMES) {
    assert.equal(projectTarget(name, root).vpk, path.join(root, lanes[name], '.build', 'release', 'pak02_dir.vpk'), name);
  }

  const unbuilt = run(['hash', '--project', 'showrank'], { root });
  assert.equal(unbuilt.code, 2);
  assert.match(unbuilt.stderr, /showrank: release pak not built \(expected .*pak02_dir\.vpk\); build it with: node hp_colors_rewrite_v3\/tools\/build\.js --project showrank --skip-deploy/);
  const unbuiltJson = JSON.parse(run(['list', '--project', 'showrank', '--json'], { root }).stdout);
  assert.equal(unbuiltJson.built, false);

  const showrank = projectTarget('showrank', root).vpk;
  fs.mkdirSync(path.dirname(showrank), { recursive: true });
  sample(path.dirname(showrank));

  const has = run(['has', '--project', 'showrank', 'HPColorsV3HPPercent'], { root });
  assert.equal(has.code, 0, has.stderr);
  assert.match(has.stdout, /present\s+HPColorsV3HPPercent/);

  const all = run(['has', '--project', 'all', 'HPColorsV3HPPercent', '--json'], { root });
  assert.equal(all.code, 0, 'unbuilt projects do not fail `all` while one is built');
  const results = JSON.parse(all.stdout);
  assert.deepEqual(results.map((r) => [r.project, r.built]), [['v3', false], ['qollock', false], ['showrank', true]]);
  assert.equal(results[2].needles[0].found, true);
  const allText = run(['list', '--project=all'], { root });
  assert.match(allText.stdout, /== v3 ==\nv3: release pak not built/);
  assert.match(allText.stdout, /== showrank ==\n.*VPK v2, 7 files/);

  const variant = path.join(root, 'variant_dir.vpk');
  writeVpk(variant, [{ path: 'panorama/scripts/hp_colors_v3_renderer.vjs_c', data: RENDERER }]);
  const diff = JSON.parse(run(['diff', '--project', 'showrank', variant, '--json'], { root }).stdout);
  assert.equal(diff.removed.length, 6);
  assert.equal(diff.unchanged, 1);
  const diffUnbuilt = run(['diff', '--project', 'v3', '--project', 'showrank'], { root });
  assert.equal(diffUnbuilt.code, 2);
  assert.match(diffUnbuilt.stderr, /v3: release pak not built/);
});

test('usage errors exit 2', () => {
  for (const args of [[], ['frobnicate'], ['has', 'x_dir.vpk'], ['list', '--project', 'nope'], ['diff', '--project', 'all', 'a'],
    ['diff', 'only_dir.vpk'], ['list', 'a_dir.vpk', 'b_dir.vpk'], ['list', '--bogus', 'a_dir.vpk']]) {
    const r = run(args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.stderr, /usage: vpk-check\.js/);
  }
});
