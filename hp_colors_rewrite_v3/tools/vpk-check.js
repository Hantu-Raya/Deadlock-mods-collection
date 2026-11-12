'use strict';
// Pure-Node reader and checker for Valve VPK v1/v2 directory files (`*_dir.vpk`). No vpkeditcli needed.
//
//   node tools/vpk-check.js list <vpk>                    paths, sizes, CRC32 (each entry's CRC is re-verified)
//   node tools/vpk-check.js has  <vpk> <needle...>        which entries contain each needle (raw bytes, latin1 and
//                                                         UTF-16LE; also UTF-8 when it differs); exit 1 if any is missing
//   node tools/vpk-check.js diff <a.vpk> <b.vpk>          added, removed and changed (CRC/size) entries
//   node tools/vpk-check.js hash <vpk>                    sha256 and its 8-char short form, as MAP.md cites builds
//
// Any <vpk> may be replaced by `--project v3|qollock|showrank|all`: the release pak02 of that lane, from the shared
// project table (tools/lib/projects.js; `all` is not accepted by diff). `--json` prints machine-readable output. A
// project whose pak has not been built is reported as not built; with `all` the other projects are still checked.
// Exit codes: 0 ok, 1 a `has` needle is missing, 2 usage error, unreadable/invalid VPK or requested pak not built
// (with `all`: only when no project is built).
//
// Format (little-endian). Header: u32 signature 0x55AA1234, u32 version, u32 treeSize; v2 adds u32 fileDataSectionSize,
// archiveMD5SectionSize, otherMD5SectionSize, signatureSectionSize. Tree: for each extension, for each directory,
// for each file name (null-terminated strings, each level ended by an empty string; " " stands for an empty
// extension or directory): u32 CRC32, u16 preloadBytes, u16 archiveIndex, u32 entryOffset, u32 entryLength,
// u16 terminator 0xFFFF, then preloadBytes of inline data. A file's bytes are its preload data followed by
// entryLength bytes at entryOffset, either in this file after the tree (archiveIndex 0x7FFF) or in
// `<name>_<index:000>.vpk`. The CRC covers the whole file (preload + rest). The v2 "other MD5" section holds the
// MD5 of the tree, of the archive-MD5 section and of everything before the whole-file checksum itself.

const fs = require('node:fs');
const path = require('node:path');
const { REPO, PROJECT_NAMES, projectConfig, stagePaths, expandProjects } = require('./lib/projects');
const crypto = require('node:crypto');

const SIGNATURE = 0x55aa1234;
const DIR_ARCHIVE = 0x7fff;
const TERMINATOR = 0xffff;

// The release pak02 of one lane (absolute path under `root`) and the command that builds it.
function projectTarget(name, root = REPO) {
  const config = projectConfig(name, root);
  return { vpk: stagePaths(config, 'release').vpk, build: config.wrapper };
}

class VpkError extends Error {}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const md5 = (buffer) => crypto.createHash('md5').update(buffer).digest('hex');
const hex8 = (n) => n.toString(16).padStart(8, '0');

function readVpk(file) {
  let bytes;
  try { bytes = fs.readFileSync(file); }
  catch (error) { throw new VpkError(error.code === 'ENOENT' ? `no such file: ${file}` : `cannot read ${file}: ${error.message}`); }
  return parseVpk(bytes, file);
}

function parseVpk(bytes, file = '<buffer>') {
  const fail = (message) => { throw new VpkError(`${file}: ${message}`); };
  if (bytes.length < 12) fail(`too short for a VPK header (${bytes.length} bytes)`);
  const signature = bytes.readUInt32LE(0);
  if (signature !== SIGNATURE) fail(`not a VPK: signature 0x${hex8(signature)}, expected 0x${hex8(SIGNATURE)}`);
  const version = bytes.readUInt32LE(4);
  if (version !== 1 && version !== 2) fail(`unsupported VPK version ${version} (only 1 and 2)`);
  const headerSize = version === 1 ? 12 : 28;
  if (bytes.length < headerSize) fail(`truncated v${version} header`);
  const treeSize = bytes.readUInt32LE(8);
  const sections = version === 2 ? {
    fileData: bytes.readUInt32LE(12), archiveMd5: bytes.readUInt32LE(16), otherMd5: bytes.readUInt32LE(20), signature: bytes.readUInt32LE(24),
  } : null;
  const treeEnd = headerSize + treeSize;
  if (treeEnd > bytes.length) fail(`tree (${treeSize} bytes) runs past end of file (${bytes.length} bytes)`);
  const dataStart = treeEnd;

  let pos = headerSize;
  const string = () => {
    const end = bytes.indexOf(0, pos);
    if (end < 0 || end >= treeEnd) fail(`unterminated string in tree at offset ${pos}`);
    const value = bytes.toString('utf8', pos, end);
    pos = end + 1;
    return value;
  };
  const entries = [];
  for (;;) {
    const ext = string();
    if (ext === '') break;
    for (;;) {
      const dir = string();
      if (dir === '') break;
      for (;;) {
        const name = string();
        if (name === '') break;
        if (pos + 18 > treeEnd) fail(`truncated entry for ${name} at offset ${pos}`);
        const at = pos;
        const crc = bytes.readUInt32LE(pos);
        const preloadBytes = bytes.readUInt16LE(pos + 4);
        const archiveIndex = bytes.readUInt16LE(pos + 6);
        const offset = bytes.readUInt32LE(pos + 8);
        const length = bytes.readUInt32LE(pos + 12);
        const terminator = bytes.readUInt16LE(pos + 16);
        pos += 18;
        const entryPath = (dir === ' ' ? '' : dir + '/') + name + (ext === ' ' ? '' : '.' + ext);
        if (terminator !== TERMINATOR) fail(`bad entry terminator 0x${terminator.toString(16)} for ${entryPath} at offset ${at + 16}`);
        if (pos + preloadBytes > treeEnd) fail(`preload data of ${entryPath} runs past the tree`);
        const preload = bytes.subarray(pos, pos + preloadBytes);
        pos += preloadBytes;
        if (archiveIndex === DIR_ARCHIVE) {
          const end = dataStart + offset + length;
          if (end > bytes.length) fail(`data of ${entryPath} (offset ${offset}, length ${length}) runs past end of file`);
          if (sections && offset + length > sections.fileData) fail(`data of ${entryPath} runs past the file data section`);
        }
        entries.push({ path: entryPath, crc, size: preloadBytes + length, preloadBytes, archiveIndex, offset, length, preload });
      }
    }
  }
  if (pos !== treeEnd) fail(`tree ends at offset ${pos}, header says ${treeEnd}`);

  const vpk = { file, version, headerSize, treeSize, dataStart, sections, size: bytes.length, entries, bytes, md5: null };
  if (sections) {
    const declared = treeEnd + sections.fileData + sections.archiveMd5 + sections.otherMd5 + sections.signature;
    if (declared !== bytes.length) fail(`v2 sections add up to ${declared} bytes, file has ${bytes.length}`);
    vpk.md5 = checkMd5(vpk);
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return vpk;
}

// v2 "other MD5" section: tree, archive-MD5 section, and whole file up to (and including) the first two checksums.
function checkMd5({ bytes, headerSize, treeSize, sections }) {
  if (sections.otherMd5 !== 48) return null;
  const archiveMd5At = headerSize + treeSize + sections.fileData;
  const at = archiveMd5At + sections.archiveMd5;
  const stored = (i) => bytes.toString('hex', at + 16 * i, at + 16 * (i + 1));
  const result = {
    tree: stored(0) === md5(bytes.subarray(headerSize, headerSize + treeSize)),
    archiveMd5Section: stored(1) === md5(bytes.subarray(archiveMd5At, at)),
    wholeFile: stored(2) === md5(bytes.subarray(0, at + 32)),
  };
  result.ok = result.tree && result.archiveMd5Section && result.wholeFile;
  return result;
}

function archivePath(vpk, index) {
  const base = vpk.file.replace(/_dir\.vpk$/i, '');
  if (base === vpk.file) throw new VpkError(`${vpk.file}: entry in archive ${index}, but the file name does not end in _dir.vpk`);
  return `${base}_${String(index).padStart(3, '0')}.vpk`;
}

// The full bytes of one entry: preload data, then the rest from the dir file or its numbered archive.
function entryData(vpk, entry) {
  if (entry.length === 0) return Buffer.from(entry.preload);
  let rest;
  if (entry.archiveIndex === DIR_ARCHIVE) {
    rest = vpk.bytes.subarray(vpk.dataStart + entry.offset, vpk.dataStart + entry.offset + entry.length);
  } else {
    const archive = archivePath(vpk, entry.archiveIndex);
    let fd;
    try { fd = fs.openSync(archive, 'r'); }
    catch (error) { throw new VpkError(`${entry.path}: cannot open archive ${archive}: ${error.message}`); }
    try {
      rest = Buffer.alloc(entry.length);
      const read = fs.readSync(fd, rest, 0, entry.length, entry.offset);
      if (read !== entry.length) throw new VpkError(`${entry.path}: archive ${archive} is truncated at offset ${entry.offset + read}`);
    } finally { fs.closeSync(fd); }
  }
  return Buffer.concat([entry.preload, rest]);
}

// ---- commands -------------------------------------------------------------------------------------------------

function listOf(vpk) {
  return {
    vpk: vpk.file, version: vpk.version, bytes: vpk.size, md5: vpk.md5,
    files: vpk.entries.map((entry) => {
      const data = entryData(vpk, entry);
      return {
        path: entry.path, size: entry.size, crc: hex8(entry.crc), crcOk: crc32(data) === entry.crc,
        preloadBytes: entry.preloadBytes, archive: entry.archiveIndex === DIR_ARCHIVE ? 'dir' : entry.archiveIndex,
        offset: entry.offset, length: entry.length,
      };
    }),
  };
}

function encodingsFor(needle) {
  const forms = [['latin1', Buffer.from(needle, 'latin1')]];
  const utf8 = Buffer.from(needle, 'utf8');
  if (!utf8.equals(forms[0][1])) forms.push(['utf8', utf8]);
  forms.push(['utf16le', Buffer.from(needle, 'utf16le')]);
  return forms;
}

function hasOf(vpk, needles) {
  const datas = vpk.entries.map((entry) => [entry.path, entryData(vpk, entry)]);
  const results = needles.map((needle) => {
    const forms = encodingsFor(needle);
    const files = [];
    for (const [file, data] of datas) {
      const encodings = forms.filter(([, bytes]) => data.includes(bytes)).map(([name]) => name);
      if (encodings.length) files.push({ path: file, encodings });
    }
    return { needle, found: files.length > 0, files };
  });
  return { vpk: vpk.file, needles: results, missing: results.filter((r) => !r.found).map((r) => r.needle) };
}

function diffOf(a, b) {
  const left = new Map(a.entries.map((e) => [e.path, e]));
  const right = new Map(b.entries.map((e) => [e.path, e]));
  const brief = (e) => ({ path: e.path, size: e.size, crc: hex8(e.crc) });
  const added = b.entries.filter((e) => !left.has(e.path)).map(brief);
  const removed = a.entries.filter((e) => !right.has(e.path)).map(brief);
  const changed = [];
  let unchanged = 0;
  for (const e of a.entries) {
    const o = right.get(e.path);
    if (!o) continue;
    if (o.crc === e.crc && o.size === e.size) { unchanged++; continue; }
    changed.push({ path: e.path, a: { size: e.size, crc: hex8(e.crc) }, b: { size: o.size, crc: hex8(o.crc) } });
  }
  return { a: a.file, b: b.file, added, removed, changed, unchanged, identical: !added.length && !removed.length && !changed.length };
}

function hashOf(vpk) {
  const sha256 = crypto.createHash('sha256').update(vpk.bytes).digest('hex');
  const indexes = [...new Set(vpk.entries.filter((e) => e.archiveIndex !== DIR_ARCHIVE).map((e) => e.archiveIndex))].sort((x, y) => x - y);
  const archives = indexes.map((index) => {
    const file = archivePath(vpk, index);
    if (!fs.existsSync(file)) return { index, file, sha256: null, short: null, missing: true };
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    return { index, file, sha256: digest, short: digest.slice(0, 8) };
  });
  return { vpk: vpk.file, sha256, short: sha256.slice(0, 8), bytes: vpk.size, files: vpk.entries.length, md5: vpk.md5, archives };
}

// ---- text output --------------------------------------------------------------------------------------------

const md5Text = (m) => (m == null ? '' : m.ok ? ', MD5 sections ok' : `, MD5 MISMATCH (tree ${m.tree ? 'ok' : 'bad'}, archive-md5 ${m.archiveMd5Section ? 'ok' : 'bad'}, whole-file ${m.wholeFile ? 'ok' : 'bad'})`);

function listText(r) {
  const width = Math.max(4, ...r.files.map((f) => String(f.size).length));
  const lines = [`${r.vpk} (VPK v${r.version}, ${r.files.length} files, ${r.bytes} bytes${md5Text(r.md5)})`];
  lines.push(`  crc32     ${'size'.padStart(width)}  path`);
  for (const f of r.files) {
    const notes = [];
    if (f.preloadBytes) notes.push(`preload ${f.preloadBytes}`);
    if (f.archive !== 'dir') notes.push(`archive ${String(f.archive).padStart(3, '0')}`);
    if (!f.crcOk) notes.push('CRC MISMATCH');
    lines.push(`  ${f.crc}  ${String(f.size).padStart(width)}  ${f.path}${notes.length ? `  [${notes.join(', ')}]` : ''}`);
  }
  return lines.join('\n');
}
function hasText(r) {
  const lines = [r.vpk];
  for (const n of r.needles) {
    if (!n.found) { lines.push(`  MISSING  ${n.needle}`); continue; }
    lines.push(`  present  ${n.needle}  (${n.files.length} file${n.files.length === 1 ? '' : 's'})`);
    for (const f of n.files) lines.push(`             ${f.path}  [${f.encodings.join(', ')}]`);
  }
  return lines.join('\n');
}
function diffText(r) {
  const lines = [`a: ${r.a}`, `b: ${r.b}`];
  if (r.identical) { lines.push(`identical (${r.unchanged} files)`); return lines.join('\n'); }
  for (const f of r.added) lines.push(`  + ${f.path}  (${f.size} bytes, crc ${f.crc})`);
  for (const f of r.removed) lines.push(`  - ${f.path}  (${f.size} bytes, crc ${f.crc})`);
  for (const f of r.changed) lines.push(`  ~ ${f.path}  (${f.a.size} -> ${f.b.size} bytes, crc ${f.a.crc} -> ${f.b.crc})`);
  lines.push(`${r.added.length} added, ${r.removed.length} removed, ${r.changed.length} changed, ${r.unchanged} unchanged`);
  return lines.join('\n');
}
function hashText(r) {
  const lines = [`${r.short}  sha256 ${r.sha256}  ${r.vpk}  (${r.bytes} bytes, ${r.files} files${md5Text(r.md5)})`];
  for (const a of r.archives) lines.push(a.missing ? `  archive ${a.index}: MISSING ${a.file}` : `  ${a.short}  sha256 ${a.sha256}  ${a.file}`);
  return lines.join('\n');
}
const notBuiltText = (t) => `${t.project}: release pak not built (expected ${t.vpk}); build it with: ${t.build}`;

// ---- CLI ----------------------------------------------------------------------------------------------------

const USAGE = [
  'usage: vpk-check.js <command> [--json] ...',
  '  list <vpk | --project P>',
  '  has  <vpk | --project P> <needle...>',
  '  diff <a.vpk | --project P> <b.vpk | --project P>',
  '  hash <vpk | --project P>',
  `  P: ${PROJECT_NAMES.join(' | ')} | all (not for diff)`,
].join('\n');

class UsageError extends Error {}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') throw new UsageError('');
  if (!['list', 'has', 'diff', 'hash'].includes(command)) throw new UsageError(`unknown command: ${command}`);
  let json = false;
  const projects = [];
  const positionals = [];
  const order = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--json') json = true;
    else if (arg === '--project' || arg.startsWith('--project=')) {
      const name = arg === '--project' ? rest[++i] : arg.slice('--project='.length);
      if (!name) throw new UsageError('--project needs a name');
      if (name !== 'all' && !PROJECT_NAMES.includes(name)) throw new UsageError(`unknown project: ${name} (known: ${PROJECT_NAMES.join(', ')}, all)`);
      projects.push(name);
      order.push({ project: name });
    } else if (arg === '--') {
      for (const p of rest.slice(i + 1)) { positionals.push(p); order.push({ path: p }); }
      break;
    }
    else if (arg.startsWith('--')) throw new UsageError(`unknown option: ${arg}`);
    else { positionals.push(arg); order.push({ path: arg }); }
  }
  if (command === 'diff') {
    if (projects.includes('all')) throw new UsageError('diff compares two paks; --project all is not accepted');
    if (order.length !== 2) throw new UsageError('diff needs exactly two paks');
    return { command, json, targets: order, needles: [] };
  }
  if (projects.length > 1) throw new UsageError('give one --project (use --project all for every project)');
  let targets;
  let needles;
  if (projects.length) {
    targets = expandProjects(projects[0]).map((project) => ({ project }));
    needles = positionals;
  } else {
    if (!positionals.length) throw new UsageError(`${command} needs a VPK path or --project`);
    targets = [{ path: positionals[0] }];
    needles = positionals.slice(1);
  }
  if (command === 'has') {
    if (!needles.length) throw new UsageError('has needs at least one needle');
    if (needles.some((n) => n === '')) throw new UsageError('empty needle');
  } else if (needles.length) throw new UsageError(`${command} takes one pak; unexpected: ${needles.join(' ')}`);
  return { command, json, targets, needles, all: projects[0] === 'all' };
}

function resolveTarget(target, root) {
  if (target.path) return { vpk: target.path, built: fs.existsSync(target.path) };
  const { vpk, build } = projectTarget(target.project, root);
  return { project: target.project, vpk, build, built: fs.existsSync(vpk) };
}

// Runs one CLI invocation and returns { code, stdout, stderr } without touching process state.
function run(argv, { root = REPO } = {}) {
  let args;
  try { args = parseArgs(argv); }
  catch (error) {
    if (!(error instanceof UsageError)) throw error;
    return { code: 2, stdout: '', stderr: (error.message ? `vpk-check: ${error.message}\n` : '') + USAGE + '\n' };
  }
  const out = [];
  const err = [];
  const targets = args.targets.map((t) => resolveTarget(t, root));
  const label = (t, body) => (t.project && args.all ? `== ${t.project} ==\n${body}` : body);

  try {
    if (args.command === 'diff') {
      const missing = targets.filter((t) => !t.built);
      if (missing.length) {
        const reports = missing.map((t) => (t.project ? notBuiltText(t) : `no such file: ${t.vpk}`));
        if (args.json) out.push(JSON.stringify({ error: 'not built', missing: missing.map((t) => ({ project: t.project, vpk: t.vpk, built: false, build: t.build })) }, null, 2));
        else err.push(...reports);
        return finish(2);
      }
      const [a, b] = targets.map((t) => readVpk(t.vpk));
      const result = diffOf(a, b);
      out.push(args.json ? JSON.stringify(result, null, 2) : diffText(result));
      return finish(0);
    }

    const results = [];
    let code = 0;
    for (const t of targets) {
      if (!t.built) {
        if (!t.project) throw new VpkError(`no such file: ${t.vpk}`);
        results.push({ project: t.project, vpk: t.vpk, built: false, build: t.build });
        if (!args.json) (args.all ? out : err).push(label(t, notBuiltText(t)));
        continue;
      }
      const vpk = readVpk(t.vpk);
      let result;
      if (args.command === 'list') result = listOf(vpk);
      else if (args.command === 'hash') result = hashOf(vpk);
      else {
        result = hasOf(vpk, args.needles);
        if (result.missing.length) code = 1;
      }
      if (t.project) result = { project: t.project, built: true, ...result };
      results.push(result);
      if (!args.json) {
        const text = args.command === 'list' ? listText(result) : args.command === 'hash' ? hashText(result) : hasText(result);
        out.push(label(t, text));
      }
    }
    const built = results.filter((r) => r.built !== false).length;
    if (!built) code = 2;
    if (args.json) out.push(JSON.stringify(args.all ? results : results[0], null, 2));
    return finish(code);
  } catch (error) {
    if (!(error instanceof VpkError)) throw error;
    if (args.json) out.push(JSON.stringify({ error: error.message }, null, 2));
    else err.push(`vpk-check: ${error.message}`);
    return finish(2);
  }

  function finish(code) {
    return { code, stdout: out.length ? out.join('\n\n') + '\n' : '', stderr: err.length ? err.join('\n') + '\n' : '' };
  }
}

if (require.main === module) {
  const result = run(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}

module.exports = { projectTarget, VpkError, readVpk, parseVpk, entryData, crc32, listOf, hasOf, diffOf, hashOf, parseArgs, run };
