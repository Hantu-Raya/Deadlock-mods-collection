'use strict';

const fs = require('fs');

const VPK_MAGIC = 0x55aa1234;
const VPK_VERSION = 2;
const HEADER_SIZE = 28;
const EMBEDDED_ARCHIVE_INDEX = 0x7fff;
const ENTRY_TERMINATOR = 0xffff;

function readCString(bytes, cursor, limit) {
  let end = cursor;
  while (end < limit && bytes[end] !== 0) end += 1;
  if (end >= limit) throw new Error('Malformed VPK tree');
  return {
    value: new TextDecoder().decode(bytes.slice(cursor, end)),
    next: end + 1
  };
}

function joinPath(dir, name, ext) {
  const fileName = `${name}.${ext}`;
  return dir && dir !== ' ' ? `${dir}/${fileName}` : fileName;
}

function readVpk(filePath) {
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  if (bytes.byteLength < HEADER_SIZE) throw new Error('Invalid VPK file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== VPK_MAGIC) throw new Error('Invalid VPK file');
  if (view.getUint32(4, true) !== VPK_VERSION) throw new Error('Unsupported VPK version');

  const treeSize = view.getUint32(8, true);
  const dataSize = view.getUint32(12, true);
  const treeStart = HEADER_SIZE;
  const treeEnd = treeStart + treeSize;
  const dataStart = treeEnd;
  if (treeEnd > bytes.byteLength || dataStart + dataSize > bytes.byteLength) {
    throw new Error('Malformed VPK file');
  }

  const files = [];
  let cursor = treeStart;
  while (cursor < treeEnd) {
    const extPart = readCString(bytes, cursor, treeEnd);
    cursor = extPart.next;
    if (!extPart.value) break;

    while (cursor < treeEnd) {
      const dirPart = readCString(bytes, cursor, treeEnd);
      cursor = dirPart.next;
      if (!dirPart.value) break;

      while (cursor < treeEnd) {
        const namePart = readCString(bytes, cursor, treeEnd);
        cursor = namePart.next;
        if (!namePart.value) break;
        if (cursor + 18 > treeEnd) throw new Error('Malformed VPK entry');

        const preloadBytes = view.getUint16(cursor + 4, true);
        const archiveIndex = view.getUint16(cursor + 6, true);
        const entryOffset = view.getUint32(cursor + 8, true);
        const entryLength = view.getUint32(cursor + 12, true);
        const terminator = view.getUint16(cursor + 16, true);
        cursor += 18;

        if (terminator !== ENTRY_TERMINATOR) throw new Error('Malformed VPK entry');
        if (preloadBytes !== 0) throw new Error('Unsupported VPK preload data');
        if (archiveIndex !== EMBEDDED_ARCHIVE_INDEX) throw new Error('Unsupported VPK archive index');
        const start = dataStart + entryOffset;
        const end = start + entryLength;
        if (start < dataStart || end > bytes.byteLength) throw new Error('Malformed VPK entry data');

        files.push({
          path: joinPath(dirPart.value, namePart.value, extPart.value),
          bytes: bytes.slice(start, end)
        });
      }
    }
  }
  return files;
}

function readFourCc(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readSource2DataBlock(bytes) {
  if (bytes.byteLength < 28) throw new Error('Invalid Source 2 resource');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fileSize = view.getUint32(0, true);
  const blockCount = view.getUint32(12, true);
  if (fileSize !== bytes.byteLength || blockCount < 1) throw new Error('Invalid Source 2 resource');

  for (let index = 0; index < blockCount; index += 1) {
    const entryOffset = 16 + (index * 12);
    if (entryOffset + 12 > bytes.byteLength) throw new Error('Invalid Source 2 resource');
    if (readFourCc(bytes, entryOffset) !== 'DATA') continue;
    const dataOffset = (entryOffset + 4) + view.getUint32(entryOffset + 4, true);
    const dataLength = view.getUint32(entryOffset + 8, true);
    if (dataOffset < 0 || dataOffset + dataLength > bytes.byteLength) {
      throw new Error('Invalid Source 2 DATA block');
    }
    return bytes.slice(dataOffset, dataOffset + dataLength);
  }
  throw new Error('Missing Source 2 DATA block');
}

function extractPanoramaLayoutSource(bytes) {
  const data = readSource2DataBlock(bytes);
  if (data.byteLength < 6) throw new Error('Invalid Panorama layout resource');
  return new TextDecoder().decode(data.slice(6));
}

function extractPresetStore(xml) {
  const match = String(xml).match(/(\s*<Panel\s+id="HPColorsPresetStore"[\s\S]*?<\/Panel>)/);
  return match ? match[1] : '';
}

function injectPresetStore(targetXml, storeXml) {
  if (targetXml.includes('HPColorsPresetStore')) {
    return targetXml.replace(/\s*<Panel\s+id="HPColorsPresetStore"[\s\S]*?<\/Panel>/, storeXml);
  }
  if (targetXml.includes('id="AnitaUI_Anchor"')) {
    return targetXml.replace(/(<Panel\b[^>]*\bid="AnitaUI_Anchor"[^>]*\/>)/, `$1${storeXml}`);
  }
  return targetXml.replace(/(<CitadelHud\b[^>]*\/>)/, `$1${storeXml}`);
}

function main() {
  const sourceVpk = process.argv[2];
  const targetBaseHud = process.argv[3];
  if (!sourceVpk || !targetBaseHud) {
    console.error('Usage: node scripts/sync_hp_preset_store.js <pak96_dir.vpk> <target base_hud.xml>');
    process.exit(2);
  }

  const files = readVpk(sourceVpk);
  const baseHud = files.find((file) => file.path === 'panorama/layout/base_hud.vxml_c');
  if (!baseHud) throw new Error('pak96_dir.vpk does not contain panorama/layout/base_hud.vxml_c');

  const sourceXml = extractPanoramaLayoutSource(baseHud.bytes);
  const storeXml = extractPresetStore(sourceXml);
  if (!storeXml) throw new Error('pak96_dir.vpk base_hud has no HPColorsPresetStore');

  const targetXml = fs.readFileSync(targetBaseHud, 'utf8');
  const nextXml = injectPresetStore(targetXml, storeXml);
  if (nextXml === targetXml) {
    console.log('[PRESET STORE] HPColorsPresetStore already current.');
    return;
  }
  fs.writeFileSync(targetBaseHud, nextXml, 'utf8');
  console.log('[PRESET STORE] Synced HPColorsPresetStore from pak96_dir.vpk into full hp_colors base_hud.');
}

main();
