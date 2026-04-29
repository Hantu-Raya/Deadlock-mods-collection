import { crc32 } from "./crc32.js";

const VPK_MAGIC = 0x55aa1234;
const VPK_VERSION = 2;
const HEADER_SIZE = 28;
const EMBEDDED_ARCHIVE_INDEX = 0x7fff;
const ENTRY_TERMINATOR = 0xffff;

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function pushBytes(out, bytes) {
  for (let i = 0; i < bytes.length; i += 1) out.push(bytes[i]);
}

function pushCString(out, value) {
  pushBytes(out, textBytes(value));
  out.push(0);
}

function pushUint16(out, value) {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(out, value) {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function splitPath(path) {
  const clean = String(path).replaceAll("\\", "/").replace(/^\/+/, "");
  const slash = clean.lastIndexOf("/");
  const dir = slash >= 0 ? clean.slice(0, slash) : " ";
  const file = slash >= 0 ? clean.slice(slash + 1) : clean;
  const dot = file.lastIndexOf(".");
  if (dot <= 0 || dot === file.length - 1) {
    throw new Error(`VPK path needs extension: ${path}`);
  }
  return {
    ext: file.slice(dot + 1),
    dir,
    name: file.slice(0, dot)
  };
}

function buildTree(files, offsets) {
  const groups = new Map();

  files.forEach((file, index) => {
    const parts = splitPath(file.path);
    if (!groups.has(parts.ext)) groups.set(parts.ext, new Map());
    const extGroup = groups.get(parts.ext);
    if (!extGroup.has(parts.dir)) extGroup.set(parts.dir, []);
    extGroup.get(parts.dir).push({ ...parts, index, bytes: file.bytes });
  });

  const out = [];
  [...groups.keys()].sort().forEach((ext) => {
    pushCString(out, ext);
    const dirs = groups.get(ext);
    [...dirs.keys()].sort().forEach((dir) => {
      pushCString(out, dir);
      dirs.get(dir).sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
        pushCString(out, entry.name);
        pushUint32(out, crc32(entry.bytes));
        pushUint16(out, 0);
        pushUint16(out, EMBEDDED_ARCHIVE_INDEX);
        pushUint32(out, offsets[entry.index]);
        pushUint32(out, entry.bytes.byteLength);
        pushUint16(out, ENTRY_TERMINATOR);
      });
      out.push(0);
    });
    out.push(0);
  });
  out.push(0);

  return new Uint8Array(out);
}

export function writeVpk(inputFiles) {
  const files = inputFiles.map((file) => ({
    path: file.path,
    bytes: file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes)
  }));

  let offset = 0;
  const offsets = files.map((file) => {
    const current = offset;
    offset += file.bytes.byteLength;
    return current;
  });

  const tree = buildTree(files, offsets);
  const fileDataSize = offset;
  const totalSize = HEADER_SIZE + tree.byteLength + fileDataSize;
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, VPK_MAGIC, true);
  view.setUint32(4, VPK_VERSION, true);
  view.setUint32(8, tree.byteLength, true);
  view.setUint32(12, fileDataSize, true);
  view.setUint32(16, 0, true);
  view.setUint32(20, 0, true);
  view.setUint32(24, 0, true);

  let cursor = HEADER_SIZE;
  bytes.set(tree, cursor);
  cursor += tree.byteLength;
  files.forEach((file) => {
    bytes.set(file.bytes, cursor);
    cursor += file.bytes.byteLength;
  });

  return bytes;
}
